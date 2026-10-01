import { openDatabase } from './database.ts';
import { readConfig } from './config.ts';
import { migrate } from './migrate.ts';
import { bootstrap } from './setup.ts';
import { newToken } from './security.ts';

const config = readConfig();
const command = process.argv[2];
if (!['migrate', 'bootstrap', 'seed:dev'].includes(command)) throw new Error('Choose migrate, bootstrap, or seed:dev.');
if (command === 'seed:dev' && (config.production || config.databaseUrl)) throw new Error('Development seeding only supports the local embedded database.');
const db = await openDatabase(config);
try {
  await migrate(db);
  if (command === 'migrate') console.log('Database migrations applied.');
  else {
    const demo = command === 'seed:dev';
    const username = demo ? 'demo.admin' : process.env.BOOTSTRAP_USERNAME;
    const password = demo ? newToken().slice(0, 24) : process.env.BOOTSTRAP_PASSWORD;
    if (!username || !password) throw new Error('Set BOOTSTRAP_USERNAME and BOOTSTRAP_PASSWORD. No default administrator password exists.');
    await bootstrap(db, {
      username, password, name: demo ? 'Development administrator' : (process.env.BOOTSTRAP_NAME ?? 'Administrator'),
      shops: [process.env.SHOP_1_NAME ?? 'Tomjoy Pharmacy', process.env.SHOP_2_NAME ?? 'Joyfrimens Pharmacy'],
      currency: process.env.SHOP_CURRENCY ?? 'GHS',
      timezone: process.env.SHOP_TIMEZONE ?? 'Etc/GMT',
    });
    console.log('Administrator and shop structure created. Existing databases are never reset by this command.');
    if (demo) console.log(`Development credentials (save securely):\nUsername: ${username}\nPassword: ${password}`);
  }
} finally { await db.close(); }
