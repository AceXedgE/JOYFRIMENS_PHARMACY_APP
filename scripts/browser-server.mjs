import { buildApp } from '../backend/dist/app.js';
import { openDatabase } from '../backend/dist/database.js';
import { migrate } from '../backend/dist/migrate.js';
import { bootstrap } from '../backend/dist/setup.js';
import { readConfig } from '../backend/dist/config.js';

if (!process.env.E2E_PASSWORD) throw new Error('Browser tests must supply an ephemeral password.');
const db = await openDatabase({ dataDir: 'memory://' });
await migrate(db);
await bootstrap(db, { username: 'test.admin', password: process.env.E2E_PASSWORD, name: 'Test Administrator',
  shops: ['Tomjoy Pharmacy', 'Joyfrimens Pharmacy'], currency: 'GHS', timezone: 'Etc/GMT' });
const config = readConfig({ NODE_ENV: 'test', APP_ORIGINS: 'http://127.0.0.1:4173' });
const app = buildApp({ db, config });
app.addHook('onClose', () => db.close());
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void app.close(); });
await app.listen({ host: '127.0.0.1', port: 3002 });
