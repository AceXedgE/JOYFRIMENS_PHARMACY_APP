import { Pool } from 'pg';
import type { Config } from './config.ts';

export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(text: string): Promise<unknown>;
}
export interface Database extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function openDatabase(config: Pick<Config, 'databaseUrl' | 'dataDir'>): Promise<Database> {
  if (!config.databaseUrl) {
    const { PGlite } = await import('@electric-sql/pglite');
    const pg = await PGlite.create(config.dataDir);
    return {
      query: (text, params) => pg.query(text, params), exec: text => pg.exec(text),
      transaction: fn => pg.transaction(tx => fn(tx)), close: () => pg.close(),
    };
  }
  const pool = new Pool({ connectionString: config.databaseUrl, max: 10, connectionTimeoutMillis: 5000 });
  return {
    query: async <T>(text: string, params?: unknown[]) => ({ rows: (await pool.query(text, params)).rows as T[] }),
    exec: text => pool.query(text),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: async <T>(text: string, params?: unknown[]) => ({ rows: (await client.query(text, params)).rows as T[] }),
          exec: text => client.query(text),
        });
        await client.query('COMMIT');
        return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
    close: () => pool.end(),
  };
}
