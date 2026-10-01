import { randomUUID } from 'node:crypto';
import type { Database, Sql } from './database.ts';
import { hashPassword } from './security.ts';

export async function audit(tx: Sql, actor: string | null, action: string, target: string | null, details: unknown = {}) {
  await tx.query('INSERT INTO audit_events(actor_id, action, target_id, details) VALUES ($1,$2,$3,$4)',
    [actor, action, target, JSON.stringify(details)]);
}
export interface Setup {
  username: string; password: string; name: string;
  shops: [string, string]; currency?: string; timezone?: string;
}
export async function bootstrap(db: Database, input: Setup) {
  if (!/^[a-z0-9._-]{3,64}$/.test(input.username)) throw new Error('Invalid admin username.');
  if (input.password.length < 12 || input.password.length > 128) throw new Error('Password must be 12–128 characters.');
  if (!input.name.trim() || input.name.length > 100 || input.shops.some(name => !name.trim() || name.length > 100)) throw new Error('Provide valid admin and shop names.');
  if (Boolean(input.currency) !== Boolean(input.timezone)) throw new Error('Set currency and timezone together.');
  if (input.currency && (!/^[A-Z]{3}$/.test(input.currency) || !Intl.supportedValuesOf('currency').includes(input.currency))) throw new Error('Invalid currency.');
  if (input.timezone) new Intl.DateTimeFormat('en', { timeZone: input.timezone });
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async tx => {
    await tx.query('SELECT id FROM setup_lock WHERE id = 1 FOR UPDATE');
    if ((await tx.query('SELECT id FROM users LIMIT 1')).rows.length) throw new Error('Setup already completed; existing accounts were not changed.');
    const id = randomUUID();
    await tx.query('INSERT INTO users(id,username,display_name,password_hash,role) VALUES($1,$2,$3,$4,$5)',
      [id, input.username, input.name.trim(), passwordHash, 'admin']);
    for (const [index, name] of input.shops.entries()) {
      const shopId = randomUUID();
      await tx.query('INSERT INTO shops(id,code,name,currency,timezone) VALUES($1,$2,$3,$4,$5)',
        [shopId, `shop-${index + 1}`, name.trim(), input.currency ?? null, input.timezone ?? null]);
      for (const kind of ['shelf', 'storeroom']) {
        await tx.query('INSERT INTO locations(id,code,name,shop_id,kind) VALUES($1,$2,$3,$4,$5)',
          [randomUUID(), `shop-${index + 1}-${kind}`, `${name.trim()} ${kind}`, shopId, kind]);
      }
    }
    for (const room of [1, 2]) await tx.query('INSERT INTO locations(id,code,name,kind) VALUES($1,$2,$3,$4)',
      [randomUUID(), `main-${room}`, `Main storage · Room ${room}`, 'shared']);
    await audit(tx, id, 'setup.completed', id, { shops: input.shops, currency: input.currency ?? null, timezone: input.timezone ?? null });
    return id;
  });
}
