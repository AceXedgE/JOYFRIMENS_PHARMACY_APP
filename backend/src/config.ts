import { fileURLToPath } from 'node:url';

export interface Config {
  production: boolean;
  port: number;
  host: string;
  databaseUrl?: string;
  dataDir: string;
  origins: string[];
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const mode = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(mode)) throw new Error('Invalid NODE_ENV.');
  const production = mode === 'production';
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  const databaseUrl = env.DATABASE_URL;
  if (production && !databaseUrl) throw new Error('Production requires DATABASE_URL.');
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must use PostgreSQL.');
  }
  const configuredOrigins=env.APP_ORIGINS||(env.RENDER_EXTERNAL_URL&&env.SERVE_FRONTEND==='true'?env.RENDER_EXTERNAL_URL:undefined);
  if (production && !configuredOrigins) throw new Error('Production requires APP_ORIGINS.');
  const origins = (configuredOrigins ?? 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173').split(',').map(value => value.trim());
  for (const origin of origins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:')) {
      throw new Error('APP_ORIGINS must contain exact origins; production requires HTTPS.');
    }
  }
  return { production, port, host: env.HOST ?? '127.0.0.1', databaseUrl, origins,
    dataDir: env.PGLITE_DIR ?? fileURLToPath(new URL('../.data', import.meta.url)) };
}
