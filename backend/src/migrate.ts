import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Database } from './database.ts';

export async function migrate(db: Database) {
  const sql = await readFile(new URL('../migrations/001_accounts.sql', import.meta.url), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  await db.transaction(async tx => {
    await tx.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await tx.exec('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
    const prior = await tx.query<{ checksum: string }>('SELECT checksum FROM schema_migrations WHERE version = 1');
    if (prior.rows.length) {
      if (prior.rows[0].checksum !== checksum) throw new Error('Applied migration was modified. Add a new migration instead.');
      return;
    }
    await tx.exec(sql);
    await tx.query('INSERT INTO schema_migrations(version, checksum) VALUES (1, $1)', [checksum]);
  });
}

export async function requireSchema(db: Database) {
  const result = await db.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1');
  if (result.rows[0]?.version !== 1) throw new Error('Run database migrations before starting the API.');
}
