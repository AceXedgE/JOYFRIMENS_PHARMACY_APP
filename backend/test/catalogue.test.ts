import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { openDatabase } from '../src/database.ts';
import { migrate, SCHEMA_VERSION } from '../src/migrate.ts';
import { bootstrap } from '../src/setup.ts';
import { buildApp } from '../src/app.ts';
import { readConfig } from '../src/config.ts';
import { newToken } from '../src/security.ts';
import { rankProduct } from '../src/catalogue-search.ts';
import { parseMoney } from '../../frontend/src/catalogue-model.ts';

test('Sprint 3 catalogue, shared prices, and migration upgrade', async t => {
  let db;
  if (process.env.TEST_DATABASE_URL) {
    const owner = await openDatabase({ databaseUrl: process.env.TEST_DATABASE_URL, dataDir: 'memory://' });
    const schema = `catalogue_${randomUUID().replaceAll('-', '')}`;
    await owner.exec(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set('options', `-c search_path=${schema}`);
    db = await openDatabase({ databaseUrl: url.toString(), dataDir: 'memory://' });
    t.after(async () => { await db.close(); await owner.exec(`DROP SCHEMA ${schema} CASCADE`); await owner.close(); });
  } else { db = await openDatabase({ dataDir: 'memory://' }); t.after(() => db.close()); }
  const first = await readFile(new URL('../migrations/001_accounts.sql', import.meta.url), 'utf8');
  await db.exec('CREATE TABLE schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  await db.exec(first);
  await db.query('INSERT INTO schema_migrations(version,checksum) VALUES(1,$1)', [createHash('sha256').update(first).digest('hex')]);
  const password = newToken();
  const ownerId = await bootstrap(db, { username: 'catalogue.admin', password, name: 'Catalogue Admin', shops: ['Tomjoy Pharmacy', 'Joyfrimens Pharmacy'], currency: 'GHS', timezone: 'Etc/GMT' });
  await migrate(db); await migrate(db);
  const app = buildApp({ db, config: readConfig({ NODE_ENV: 'test' }) }); t.after(() => app.close());
  const write = { 'x-requested-with': 'joyfrimens', origin: 'http://127.0.0.1:5173' };
  async function login(username: string, secret: string) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: write, payload: { username, password: secret } });
    assert.equal(response.statusCode, 200, response.body);
    return { ...write, cookie: String(response.headers['set-cookie']).split(';')[0], 'x-csrf-token': response.json().csrfToken };
  }
  const admin = await login('catalogue.admin', password);
  const shops = (await app.inject({ url: '/api/shops', headers: admin })).json().shops;
  const shop1 = shops[0].id as string, shop2 = shops[1].id as string;
  const base = `/api/shops/${shop1}/catalogue`;
  const secondBase = `/api/shops/${shop2}/catalogue`;
  const staffPassword = newToken();
  const regularResponse = await app.inject({ method: 'POST', url: '/api/admin/users', headers: admin, payload: { username: 'catalogue.staff', name: 'Catalogue Staff', password: staffPassword, role: 'employee', sharedStorageAccess: false, memberships: [{ shopId: shop1, canChangePrices: false }] } });
  assert.equal(regularResponse.statusCode, 201);
  const staffId = regularResponse.json().id;
  const staff = await login('catalogue.staff', staffPassword);
  const sample = { name: 'Paracetamol', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'Tablet', baseUnit: 'tablet', reason: 'Initial approved catalogue', units: [
    { label: 'tablet', baseQuantity: 1, barcode: 'PARA-SINGLE', priceMinor: 125 },
    { label: 'box', baseQuantity: 14, barcode: 'PARA-BOX14', priceMinor: 1500 },
  ] };
  let productId = '', unitId = '', boxId = '';
  async function listing(shopBase = base, headers = admin, q = '') {
    const response = await app.inject({ url: `${shopBase}?q=${encodeURIComponent(q)}`, headers });
    assert.equal(response.statusCode, 200, response.body); return response.json();
  }
  async function current() { return (await listing()).products.find((product: { id: string }) => product.id === productId).units.find((unit: { id: string }) => unit.id === unitId); }
  const priceUrl = () => `${base}/units/${unitId}/price`;

  await t.test('upgrade from Sprint 2 preserves staff and storage and is repeatable', async () => {
    assert.equal((await db.query('SELECT * FROM schema_migrations')).rows.length, SCHEMA_VERSION);
    assert.equal((await db.query('SELECT * FROM users WHERE id=$1', [ownerId])).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM locations')).rows.length, 6);
  });
  await t.test('admins create explicit base and box prices without multiplying the single price', async () => {
    const response = await app.inject({ method: 'POST', url: base, headers: admin, payload: sample });
    assert.equal(response.statusCode, 201, response.body); productId = response.json().id;
    const product = (await listing()).products[0];
    const single = product.units.find((unit: { label: string }) => unit.label === 'tablet');
    const box = product.units.find((unit: { label: string }) => unit.label === 'box');
    unitId = single.id; boxId = box.id;
    assert.equal(single.priceMinor, 125); assert.equal(box.priceMinor, 1500); assert.equal(box.baseQuantity, 14);
    assert.equal((await listing(secondBase)).total, 0);
    assert.equal((await db.query('SELECT * FROM price_history')).rows.length, 2);
  });
  await t.test('ordinary staff cannot create products, edit prices, or manage availability', async () => {
    assert.equal((await app.inject({ method: 'POST', url: base, headers: staff, payload: { ...sample, name: 'Unauthorized' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'PUT', url: priceUrl(), headers: staff, payload: { priceMinor: 1, expectedVersion: 1, reason: 'Unauthorized reduction' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'PUT', url: `${base}/units/${unitId}/availability`, headers: staff, payload: { available: false, expectedVersion: 1, reason: 'Unauthorized status' } })).statusCode, 403);
    assert.equal((await app.inject({ url: secondBase, headers: staff })).statusCode, 404);
    assert.equal((await app.inject({ url: `${base}?includeUnlisted=true`, headers: staff })).statusCode, 403);
    assert.equal((await app.inject({ url: `${secondBase}/units/${unitId}/history`, headers: staff })).statusCode, 404);
    assert.equal((await app.inject({ method: 'PUT', url: priceUrl(), headers: { ...write, cookie: admin.cookie }, payload: { priceMinor: 2, expectedVersion: 1, reason: 'Missing CSRF token' } })).statusCode, 403);
  });
  await t.test('rejects fractional/negative prices, invalid packs, duplicate identities and barcodes atomically', async () => {
    for (const priceMinor of [0, -1, 1.25, 100000001, '125']) {
      assert.equal((await app.inject({ method: 'PUT', url: priceUrl(), headers: admin, payload: { priceMinor, expectedVersion: 1, reason: 'Invalid input check' } })).statusCode, 400);
    }
    assert.equal((await app.inject({ method: 'POST', url: base, headers: admin, payload: sample })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: base, headers: admin, payload: { ...sample, name: 'Bad pack', units: [{ ...sample.units[0], baseQuantity: 2 }] } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: base, headers: admin, payload: { ...sample, name: 'Duplicate barcode' } })).statusCode, 409);
    assert.equal((await app.inject({ method: 'POST', url: base, headers: admin, payload: { ...sample, name: 'Blank unit', units: [{ ...sample.units[0], label: ' ' }] } })).statusCode, 400);
    assert.equal((await db.query('SELECT * FROM products')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM unit_prices')).rows.length, 2);
  });
  await t.test('listing the same drug in shop 2 uses the existing shared price', async () => {
    const unlisted = await app.inject({ url: `${secondBase}?includeUnlisted=true`, headers: admin });
    assert.equal(unlisted.json().products[0].units[0].available, null);
    const response = await app.inject({ method: 'PUT', url: `${secondBase}/units/${unitId}/availability`, headers: admin, payload: { available: true, expectedVersion: 0, reason: 'Offer at second shop' } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal((await listing(secondBase)).products[0].units[0].priceMinor, 125);
    assert.equal((await db.query('SELECT * FROM unit_prices WHERE unit_id=$1', [unitId])).rows.length, 1);
  });
  await t.test('authorized employee changes one shared price and cannot alter shop availability', async () => {
    const grant = await app.inject({ method: 'PUT', url: `/api/admin/users/${staffId}/access`, headers: admin, payload: { memberships: [{ shopId: shop1, canChangePrices: true }], sharedStorageAccess: false } });
    assert.equal(grant.statusCode, 200);
    const response = await app.inject({ method: 'PUT', url: priceUrl(), headers: staff, payload: { priceMinor: 135, expectedVersion: 1, reason: 'Approved supplier price review' } });
    assert.equal(response.statusCode, 200); assert.equal(response.json().priceScope, 'both_shops');
    assert.equal((await current()).priceMinor, 135);
    assert.equal((await listing(secondBase)).products[0].units[0].priceMinor, 135);
    assert.equal((await app.inject({ method: 'PUT', url: `${base}/units/${unitId}/availability`, headers: staff, payload: { available: false, expectedVersion: 1, reason: 'Attempted availability change' } })).statusCode, 403);
    const history = (await app.inject({ url: `${base}/units/${unitId}/history`, headers: staff })).json().history;
    assert.equal(history[0].old_price_minor, 125); assert.equal(history[0].price_minor, 135); assert.equal(history[1].price_minor, 125);
    assert.equal(history[0].changed_by, 'Catalogue Staff');
  });
  await t.test('stale and concurrent edits cannot overwrite newer shared prices', async () => {
    assert.equal((await app.inject({ method: 'PUT', url: `${secondBase}/units/${unitId}/price`, headers: admin, payload: { priceMinor: 999, expectedVersion: 1, reason: 'Outdated second-shop edit' } })).statusCode, 409);
    const responses = await Promise.all([140, 145].map(priceMinor => app.inject({ method: 'PUT', url: priceUrl(), headers: admin, payload: { priceMinor, expectedVersion: 2, reason: 'Concurrent review' } })));
    assert.deepEqual(responses.map(response => response.statusCode).sort(), [200, 409]);
    assert.equal((await current()).priceVersion, 3);
    assert.equal((await db.query('SELECT * FROM price_history WHERE unit_id=$1', [unitId])).rows.length, 3);
  });
  await t.test('availability affects only its shop and never rewrites the price or past records', async () => {
    const before = await current();
    assert.equal((await app.inject({ method: 'PUT', url: `${base}/units/${unitId}/availability`, headers: admin, payload: { available: false, expectedVersion: 1, reason: 'Temporarily not offered' } })).statusCode, 200);
    assert.equal((await current()).available, false);
    assert.equal((await listing(secondBase)).products[0].units[0].available, true);
    assert.equal((await current()).priceVersion, before.priceVersion);
    assert.equal((await app.inject({ method: 'PUT', url: `${base}/units/${unitId}/availability`, headers: admin, payload: { available: true, expectedVersion: 1, reason: 'Stale availability request' } })).statusCode, 409);
    await assert.rejects(db.query('UPDATE price_history SET price_minor=1'), /append-only/);
    await assert.rejects(db.query('DELETE FROM price_history'), /append-only/);
    await assert.rejects(db.query('UPDATE selling_units SET base_quantity=15 WHERE id=$1', [boxId]), /immutable/);
    await assert.rejects(db.query('UPDATE products SET strength=$1 WHERE id=$2', ['250 mg', productId]), /immutable/);
  });
  await t.test('revocation blocks further changes without requiring employee logout', async () => {
    await app.inject({ method: 'PUT', url: `/api/admin/users/${staffId}/access`, headers: admin, payload: { memberships: [{ shopId: shop1, canChangePrices: false }], sharedStorageAccess: false } });
    assert.equal((await app.inject({ method: 'PUT', url: priceUrl(), headers: staff, payload: { priceMinor: 500, expectedVersion: 3, reason: 'After permission revocation' } })).statusCode, 403);
    assert.equal((await listing(base, staff)).canChangePrices, false);
  });
  await t.test('search prioritizes exact matches, returns labeled suggestions, and preserves full names', async () => {
    const extra = { ...sample, name: 'Paracetamol Extended', units: [{ ...sample.units[0], barcode: 'PARA-EXT' }] };
    assert.equal((await app.inject({ method: 'POST', url: base, headers: admin, payload: extra })).statusCode, 201);
    const long = { ...sample, name: 'Longmedicine Demonstration Name', genericName: 'Longmedicine', units: [{ ...sample.units[0], barcode: 'LONG-ONE' }] };
    assert.equal((await app.inject({ method: 'POST', url: base, headers: admin, payload: long })).statusCode, 201);
    assert.equal((await listing(base, staff, 'Paracetamol')).products[0].name, 'Paracetamol');
    assert.equal((await listing(base, staff, 'paracetmol')).products[0].match, 'suggestion');
    assert.equal((await listing(base, staff, 'Longmedicine Demonstration Name')).products[0].name, long.name);
    assert.equal((await listing(base, staff, 'PARA-BOX14')).products[0].id, productId);
    assert.equal((await listing(base, staff, "%' OR 1=1 --")).total, 0);
    assert.equal((await listing(base, staff, 'paracetmol 550 mg')).total, 0);
  });
});

test('GHS decimal input converts to integer pesewas without rounding invalid precision', () => {
  assert.equal(parseMoney('0.01'), 1); assert.equal(parseMoney('1.25'), 125); assert.equal(parseMoney('12.3'), 1230);
  for (const invalid of ['0', '-1', '1.001', '1e3', 'NaN', '1,000', '1000000.01']) assert.throws(() => parseMoney(invalid));
});

test('spelling suggestions are bounded and numeric strengths are not fuzzy-matched', () => {
  const product = { name: 'Amoxicillin', genericName: 'Amoxicillin', strength: '500 mg', dosageForm: 'Capsule', barcodes: [] };
  assert.equal(rankProduct(product, 'Amoxicillin')?.match, 'exact');
  assert.equal(rankProduct(product, 'amoxcillin')?.match, 'suggestion');
  assert.equal(rankProduct(product, 'amoxcillin 550 mg'), null);
  assert.equal(rankProduct(product, 'zz'), null);
});
