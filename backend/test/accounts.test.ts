import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/database.ts';
import { readConfig } from '../src/config.ts';
import { migrate } from '../src/migrate.ts';
import { bootstrap } from '../src/setup.ts';
import { buildApp } from '../src/app.ts';
import { digest, newToken } from '../src/security.ts';

test('Sprint 2 database and access controls', async t => {
  const adminPassword = newToken();
  const employeePassword = newToken();
  const config = readConfig({ NODE_ENV: 'test' });
  // A dedicated schema isolates server-PostgreSQL tests from existing data.
  let db;
  if (process.env.TEST_DATABASE_URL) {
    const owner = await openDatabase({ databaseUrl: process.env.TEST_DATABASE_URL, dataDir: 'memory://' });
    const schema = `test_${randomUUID().replaceAll('-', '')}`;
    await owner.exec(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    db = await openDatabase({ databaseUrl: url.toString(), dataDir: 'memory://' });
    t.after(async () => { await db.close(); await owner.exec(`DROP SCHEMA ${schema} CASCADE`); await owner.close(); });
  } else {
    db = await openDatabase({ dataDir: 'memory://' });
    t.after(() => db.close());
  }
  await migrate(db);
  await migrate(db);
  await bootstrap(db, { username: 'owner.admin', password: adminPassword, name: 'Owner', shops: ['Tomjoy Pharmacy', 'Joyfrimens Pharmacy'], currency: 'GHS', timezone: 'Etc/GMT' });
  const app = buildApp({ db, config });
  t.after(() => app.close());
  const write = { origin: 'http://127.0.0.1:5173', 'x-requested-with': 'joyfrimens' };
  async function login(username: string, password: string) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: write, payload: { username, password } });
    assert.equal(response.statusCode, 200, response.body);
    const cookie = String(response.headers['set-cookie']).split(';')[0];
    return { cookie, 'x-csrf-token': response.json().csrfToken, ...write };
  }
  const admin = await login('owner.admin', adminPassword);
  const shops = (await app.inject({ url: '/api/shops', headers: admin })).json().shops as { id: string; name: string; currency: string; timezone: string }[];
  let employeeId = '';
  let employee: Awaited<ReturnType<typeof login>>;

  await t.test('migrations and bootstrap preserve an existing installation', async () => {
    assert.equal((await db.query('SELECT * FROM schema_migrations')).rows.length, 1);
    assert.equal(shops.length, 2);
    assert.equal(shops[0].name, 'Tomjoy Pharmacy');
    assert.ok(shops.every(shop => shop.currency === 'GHS' && shop.timezone === 'Etc/GMT'));
    assert.equal((await db.query("SELECT * FROM locations WHERE kind='shared' AND shop_id IS NULL")).rows.length, 2);
    assert.equal((await db.query('SELECT * FROM locations WHERE shop_id IS NOT NULL')).rows.length, 4);
    await assert.rejects(bootstrap(db, { username: 'other.admin', password: newToken(), name: 'Other', shops: ['Other', 'Other'] }), /already completed/);
    assert.equal((await db.query('SELECT * FROM users')).rows.length, 1);
  });
  await t.test('authentication is required and cookies are protected', async () => {
    assert.equal((await app.inject({ url: '/api/shops' })).statusCode, 401);
    assert.equal((await app.inject({ url: '/api/admin/users' })).statusCode, 401);
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: write, payload: { username: 'owner.admin', password: adminPassword } });
    assert.match(String(response.headers['set-cookie']), /HttpOnly/i);
    assert.match(String(response.headers['set-cookie']), /SameSite=Strict/i);
    const token = admin.cookie.split('=')[1];
    assert.equal((await db.query('SELECT * FROM sessions WHERE token_hash=$1', [token])).rows.length, 0);
    assert.equal((await db.query('SELECT * FROM sessions WHERE token_hash=$1', [digest(token)])).rows.length, 1);
  });
  await t.test('admin creates an employee with only the assigned shop', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/admin/users', headers: admin, payload: {
      username: 'staff.one', name: 'Staff One', password: employeePassword, role: 'employee', sharedStorageAccess: false,
      memberships: [{ shopId: shops[0].id, canChangePrices: false }],
    } });
    assert.equal(response.statusCode, 201, response.body); employeeId = response.json().id;
    employee = await login('staff.one', employeePassword);
    const allowed = (await app.inject({ url: '/api/shops', headers: employee })).json().shops;
    assert.equal(allowed.length, 1); assert.equal(allowed[0].id, shops[0].id); assert.equal(allowed[0].can_change_prices, false);
    const detail = await app.inject({ url: `/api/shops/${shops[0].id}`, headers: employee });
    assert.equal(detail.statusCode, 200); assert.ok(detail.json().locations.every((location: { shop_id: string }) => location.shop_id === shops[0].id));
    assert.equal((await app.inject({ url: `/api/shops/${shops[1].id}`, headers: employee })).statusCode, 404);
    assert.equal((await app.inject({ url: '/api/storage/shared', headers: employee })).statusCode, 403);
    assert.equal((await app.inject({ url: '/api/admin/audit', headers: employee })).statusCode, 403);
  });
  await t.test('employees cannot grant themselves access or create administrators', async () => {
    assert.equal((await app.inject({ method: 'PUT', url: `/api/admin/users/${employeeId}/access`, headers: employee,
      payload: { memberships: [{ shopId: shops[1].id, canChangePrices: true }], sharedStorageAccess: true } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/admin/users', headers: employee,
      payload: { username: 'bad.admin', name: 'Bad', password: newToken(), role: 'admin', memberships: [], sharedStorageAccess: true } })).statusCode, 403);
    assert.equal((await db.query("SELECT id FROM users WHERE username='bad.admin'")).rows.length, 0);
  });
  await t.test('CSRF, cross-origin requests, and unknown fields fail closed', async () => {
    const payload = { memberships: [], sharedStorageAccess: false };
    const url = `/api/admin/users/${employeeId}/access`;
    assert.equal((await app.inject({ method: 'PUT', url, headers: { cookie: admin.cookie, ...write }, payload })).statusCode, 403);
    assert.equal((await app.inject({ method: 'PUT', url, headers: { ...admin, origin: 'https://evil.invalid' }, payload })).statusCode, 403);
    assert.equal((await app.inject({ method: 'PUT', url, headers: admin, payload: { ...payload, role: 'admin' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'owner.admin', password: adminPassword } })).statusCode, 403);
  });
  await t.test('grants and revocations take effect on the existing session and are audited', async () => {
    const url = `/api/admin/users/${employeeId}/access`;
    assert.equal((await app.inject({ method: 'PUT', url, headers: admin,
      payload: { memberships: [{ shopId: shops[0].id, canChangePrices: true }], sharedStorageAccess: true } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/shops', headers: employee })).json().shops[0].can_change_prices, true);
    assert.equal((await app.inject({ url: '/api/storage/shared', headers: employee })).json().locations.length, 2);
    assert.equal((await app.inject({ method: 'PUT', url, headers: admin, payload: { memberships: [], sharedStorageAccess: false } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/shops', headers: employee })).json().shops.length, 0);
    assert.equal((await app.inject({ url: `/api/shops/${shops[0].id}`, headers: employee })).statusCode, 404);
    assert.equal((await app.inject({ url: '/api/storage/shared', headers: employee })).statusCode, 403);
    const events = (await app.inject({ url: '/api/admin/audit', headers: admin })).json().events;
    assert.equal(events.filter((event: { action: string }) => event.action === 'user.access_changed').length, 2);
    assert.ok(!JSON.stringify(events).includes(employeePassword));
    await assert.rejects(db.query('UPDATE audit_events SET action=$1', ['tampered']), /append-only/);
    await assert.rejects(db.query('DELETE FROM audit_events'), /append-only/);
  });
  await t.test('invalid assignments roll back without removing existing permissions', async () => {
    const url = `/api/admin/users/${employeeId}/access`;
    const before = (await db.query('SELECT * FROM memberships WHERE user_id=$1', [employeeId])).rows;
    const response = await app.inject({ method: 'PUT', url, headers: admin, payload: { memberships: [{ shopId: randomUUID(), canChangePrices: true }], sharedStorageAccess: true } });
    assert.equal(response.statusCode, 400);
    assert.deepEqual((await db.query('SELECT * FROM memberships WHERE user_id=$1', [employeeId])).rows, before);
  });
  await t.test('logout revokes the server session', async () => {
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: employee })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/auth/me', headers: employee })).statusCode, 401);
    employee = await login('staff.one', employeePassword);
  });
  await t.test('disabling a user revokes sessions and self-disable is rejected', async () => {
    const ownerId = (await app.inject({ url: '/api/auth/me', headers: admin })).json().user.id;
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/admin/users/${ownerId}/status`, headers: admin, payload: { active: false } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/admin/users/${employeeId}/status`, headers: admin, payload: { active: false } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/auth/me', headers: employee })).statusCode, 401);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', headers: write, payload: { username: 'staff.one', password: employeePassword } })).statusCode, 401);
    assert.equal((await app.inject({ method: 'PATCH', url: `/api/admin/users/${employeeId}/status`, headers: admin, payload: { active: true } })).statusCode, 200);
    assert.equal((await app.inject({ url: '/api/auth/me', headers: employee })).statusCode, 401);
  });
  await t.test('password change revokes every session and expiration is enforced', async () => {
    employee = await login('staff.one', employeePassword);
    const second = await login('staff.one', employeePassword);
    const changed = newToken();
    const response = await app.inject({ method: 'POST', url: '/api/auth/password', headers: employee, payload: { currentPassword: employeePassword, newPassword: changed } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal((await app.inject({ url: '/api/auth/me', headers: employee })).statusCode, 401);
    assert.equal((await app.inject({ url: '/api/auth/me', headers: second })).statusCode, 401);
    const current = await login('staff.one', changed);
    await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE user_id=$1", [employeeId]);
    assert.equal((await app.inject({ url: '/api/auth/me', headers: current })).statusCode, 401);
  });
  await t.test('login throttling persists across app instances', async () => {
    await db.query('INSERT INTO login_limits(key,attempts,reset_at) VALUES($1,10,now()+interval \'15 minutes\')', [digest('user:blocked.user')]);
    const restarted = buildApp({ db, config });
    t.after(() => restarted.close());
    const response = await restarted.inject({ method: 'POST', url: '/api/auth/login', headers: write, payload: { username: 'blocked.user', password: newToken() } });
    assert.equal(response.statusCode, 429); assert.equal(response.headers['retry-after'], '900');
  });
  await t.test('production sessions use secure host-only cookies', async () => {
    const production = buildApp({ db, config: { ...config, production: true, origins: ['https://pharmacy.example'] } });
    t.after(() => production.close());
    const response = await production.inject({ method: 'POST', url: '/api/auth/login', headers: { ...write, origin: 'https://pharmacy.example' }, payload: { username: 'owner.admin', password: adminPassword } });
    assert.equal(response.statusCode, 200);
    assert.match(String(response.headers['set-cookie']), /^__Host-joyfrimens=/);
    assert.match(String(response.headers['set-cookie']), /; Secure/);
    assert.doesNotMatch(String(response.headers['set-cookie']), /Domain=/i);
  });
});

test('production configuration refuses unsafe defaults', () => {
  assert.throws(() => readConfig({ NODE_ENV: 'production' }), /DATABASE_URL/);
  assert.throws(() => readConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://localhost/test', APP_ORIGINS: 'http://example.com' }), /HTTPS/);
  assert.throws(() => readConfig({ PORT: '-1' }), /PORT/);
  assert.throws(() => readConfig({ NODE_ENV: 'unknown' }), /NODE_ENV/);
});
