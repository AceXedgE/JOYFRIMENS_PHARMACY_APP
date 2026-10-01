import { buildApp } from './app.ts';
import { readConfig } from './config.ts';
import { openDatabase } from './database.ts';
import { requireSchema } from './migrate.ts';

const config = readConfig();
const db = await openDatabase(config);
try { await requireSchema(db); }
catch { await db.close(); throw new Error('Database is not ready. Run npm run db:migrate -w backend, then bootstrap an admin.'); }
const app = buildApp({ logger: true, db, config });
app.addHook('onClose', () => db.close());
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => { await app.close(); });
}
try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
