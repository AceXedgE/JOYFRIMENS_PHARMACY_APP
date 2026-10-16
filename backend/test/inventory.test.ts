import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { openDatabase } from '../src/database.ts';
import { migrate, SCHEMA_VERSION } from '../src/migrate.ts';
import { bootstrap } from '../src/setup.ts';
import { buildApp } from '../src/app.ts';
import { readConfig } from '../src/config.ts';
import { newToken } from '../src/security.ts';

test('Sprint 4 receiving, stock conservation, and authorized transfers', async t => {
  let db;
  if (process.env.TEST_DATABASE_URL) {
    const owner = await openDatabase({ databaseUrl: process.env.TEST_DATABASE_URL, dataDir: 'memory://' });
    const schema = `inventory_${randomUUID().replaceAll('-', '')}`;
    await owner.exec(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set('options', `-c search_path=${schema}`);
    db = await openDatabase({ databaseUrl: url.toString(), dataDir: 'memory://' });
    t.after(async () => { await db.close(); await owner.exec(`DROP SCHEMA ${schema} CASCADE`); await owner.close(); });
  } else { db = await openDatabase({ dataDir: 'memory://' }); t.after(() => db.close()); }
  await db.exec('CREATE TABLE schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for (const [index, file] of ['001_accounts.sql', '002_catalogue.sql'].entries()) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'); await db.exec(sql);
    await db.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [index + 1, createHash('sha256').update(sql).digest('hex')]);
  }
  const password = newToken();
  await bootstrap(db, { username: 'stock.admin', password, name: 'Stock Admin', shops: ['Tomjoy Pharmacy', 'Joyfrimens Pharmacy'], currency: 'GHS', timezone: 'Etc/GMT' });
  const app = buildApp({ db, config: readConfig({ NODE_ENV: 'test' }) }); t.after(() => app.close());
  const write = { 'x-requested-with': 'joyfrimens', origin: 'http://127.0.0.1:5173' };
  async function login(username: string, secret: string) {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: write, payload: { username, password: secret } });
    assert.equal(response.statusCode, 200, response.body);
    return { ...write, cookie: String(response.headers['set-cookie']).split(';')[0], 'x-csrf-token': response.json().csrfToken };
  }
  const admin = await login('stock.admin', password);
  const shops = (await app.inject({ url: '/api/shops', headers: admin })).json().shops;
  const shop1 = shops[0].id, shop2 = shops[1].id;
  // Catalogue data exists before upgrading; migration must not reset it.
  const product = await app.inject({ method: 'POST', url: `/api/shops/${shop1}/catalogue`, headers: admin, payload: { name: 'Inventory Drug', genericName: 'Inventory Drug', strength: '500 mg', dosageForm: 'Tablet', baseUnit: 'tablet', reason: 'Inventory test catalogue', units: [{ label: 'tablet', baseQuantity: 1, barcode: '', priceMinor: 100 }, { label: 'carton', baseQuantity: 100, barcode: '', priceMinor: 9000 }] } });
  assert.equal(product.statusCode, 201, product.body);
  await migrate(db); await migrate(db);
  const catalogue = (await app.inject({ url: `/api/shops/${shop1}/catalogue`, headers: admin })).json().products[0];
  const unitId = catalogue.units.find((u: { label: string }) => u.label === 'carton').id;
  const options = (await app.inject({ url: '/api/inventory/options', headers: admin })).json();
  const shelf1 = options.locations.find((l: { shop_id: string; kind: string }) => l.shop_id === shop1 && l.kind === 'shelf').id;
  const shelf2 = options.locations.find((l: { shop_id: string; kind: string }) => l.shop_id === shop2 && l.kind === 'shelf').id;
  const store1 = options.locations.find((l: { shop_id: string; kind: string }) => l.shop_id === shop1 && l.kind === 'storeroom').id;
  const store2 = options.locations.find((l: { shop_id: string; kind: string }) => l.shop_id === shop2 && l.kind === 'storeroom').id;
  const shared = options.locations.filter((l: { kind: string }) => l.kind === 'shared').map((l: { id: string }) => l.id);
  async function staff(username: string, shopId: string) {
    const secret = newToken();
    const response = await app.inject({ method: 'POST', url: '/api/admin/users', headers: admin, payload: { username, name: username, password: secret, role: 'employee', sharedStorageAccess: false, memberships: [{ shopId, canChangePrices: true }] } });
    assert.equal(response.statusCode, 201, response.body);
    return { id: response.json().id as string, headers: await login(username, secret) };
  }
  const staff1 = await staff('stock.one', shop1), staff2 = await staff('stock.two', shop2);
  const post = (url: string, payload: object, headers = admin) => app.inject({ method: 'POST', url: `/api/inventory${url}`, headers, payload });
  const stock = async (id: string) => {
    const r = await app.inject({ url: `/api/inventory/locations/${id}`, headers: admin }); assert.equal(r.statusCode, 200, r.body); return r.json();
  };
  const sum = async () => {
    const available = (await db.query<{ n: number }>('SELECT coalesce(sum(quantity),0)::integer AS n FROM stock_balances')).rows[0].n;
    const transit = (await db.query<{ n: number }>('SELECT coalesce(sum(quantity-received-lost),0)::integer AS n FROM stock_transfers')).rows[0].n;
    return available + transit;
  };
  const delivery = { forceDuplicate: true, requestKey: randomUUID(), unitId, batchNumber: 'LOT-1', expiry: '2099-12-31', supplier: 'Supplier A', reference: 'DELIVERY-1', expectedPacks: 11, receivedPacks: 10,
    allocations: [{ locationId: shelf1, quantity: 500 }, { locationId: store1, quantity: 100 }, { locationId: store2, quantity: 100 }, { locationId: shared[0], quantity: 150 }, { locationId: shared[1], quantity: 150 }], reason: 'Supplier invoiced eleven cartons, ten arrived' };
  let batchId = '';
  await t.test('upgrade preserves catalogue, accounts and all six locations', async () => {
    assert.equal((await db.query('SELECT * FROM schema_migrations')).rows.length, SCHEMA_VERSION);
    assert.equal((await db.query('SELECT * FROM products')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM locations')).rows.length, 6);
  });
  await t.test('supplier versus actual receipt, carton conversion and split allocation are atomic', async () => {
    assert.equal((await post('/receipts', { ...delivery, allocations: [{ locationId: shelf1, quantity: 999 }] })).statusCode, 400);
    assert.equal((await db.query('SELECT * FROM stock_receipts')).rows.length, 0);
    const response = await post('/receipts', delivery); assert.equal(response.statusCode, 200, response.body);
    batchId = response.json().batchId; assert.equal(response.json().expected, 1100); assert.equal(response.json().received, 1000);
    assert.equal((await stock(shelf1)).stocks[0].quantity, 500); assert.equal(await sum(), 1000);
    assert.equal((await stock(store1)).ledger[0].expected_quantity, 1100);
    const retry = await post('/receipts', delivery); assert.deepEqual(retry.json(), response.json()); assert.equal(await sum(), 1000);
    assert.equal((await post('/receipts', { ...delivery, receivedPacks: 9 })).statusCode, 409);
    assert.equal((await post('/receipts', { ...delivery, requestKey: randomUUID() })).statusCode, 409);
    assert.equal(await sum(), 1000);
  });
  await t.test('staff access is location scoped, including shared storage and receipt allocations', async () => {
    const response = await app.inject({ url: '/api/inventory/options', headers: staff1.headers });
    assert.equal(response.json().locations.length, 2); assert.equal(response.json().destinations.length, 6);
    assert.equal(response.json().canAdjust, false);
    for (const location of [shelf2, store2, ...shared]) assert.equal((await app.inject({ url: `/api/inventory/locations/${location}`, headers: staff1.headers })).statusCode, 404);
    assert.equal((await post('/receipts', { ...delivery, requestKey: randomUUID(), reference: 'forbidden' }, staff1.headers)).statusCode, 404);
    assert.equal((await post('/transfers', { requestKey: randomUUID(), batchId, sourceId: shelf2, destinationId: shelf1, quantity: 1, reason: 'Unauthorized source' }, staff1.headers)).statusCode, 404);
    assert.equal((await post('/counts', { requestKey: randomUUID(), batchId, locationId: shelf1, counted: 500, expectedVersion: 2, reason: 'Employee price permission is not adjustment permission' }, staff1.headers)).statusCode, 403);
  });
  await t.test('supplier receipt approval records a separate admin review without changing stock', async () => {
    const receipt = (await stock(shelf1)).ledger[0].receipt_id;
    const payload = { requestKey: randomUUID(), reason: 'Reviewed supplier invoice and the short delivery evidence' };
    assert.equal((await post(`/receipts/${receipt}/approve`, payload, staff1.headers)).statusCode, 403);
    assert.equal((await post(`/receipts/${receipt}/approve`, payload)).statusCode, 200);
    assert.equal((await post(`/receipts/${receipt}/approve`, payload)).statusCode, 200);
    assert.equal((await post(`/receipts/${receipt}/approve`, { ...payload, requestKey: randomUUID() })).statusCode, 409);
    assert.equal((await stock(store1)).ledger[0].approved_by_name, 'Stock Admin');
    assert.equal(await sum(), 1000);
  });
  let transferId = '';
  await t.test('Tomjoy to Joyfrimens shelf transfer uses transit once and leaves storerooms untouched', async () => {
    const payload = { requestKey: randomUUID(), batchId, sourceId: shelf1, destinationId: shelf2, quantity: 100, reason: 'Direct shop shelf supply' };
    const response = await post('/transfers', payload, staff1.headers); assert.equal(response.statusCode, 200, response.body); transferId = response.json().id;
    assert.equal((await post('/transfers', payload, staff1.headers)).json().id, transferId);
    assert.equal((await stock(shelf1)).stocks[0].quantity, 400); assert.equal((await stock(shelf2)).stocks.length, 0);
    assert.equal((await stock(store1)).stocks[0].quantity, 100); assert.equal((await stock(store2)).stocks[0].quantity, 100);
    assert.equal(await sum(), 1000);
    const received = { requestKey: randomUUID(), quantity: 80, expectedRemaining: 100, reason: 'Only eighty counted on arrival, twenty missing' };
    assert.equal((await post(`/transfers/${transferId}/receive`, received, staff1.headers)).statusCode, 404);
    const receipt = await post(`/transfers/${transferId}/receive`, received, staff2.headers); assert.equal(receipt.statusCode, 200, receipt.body);
    assert.equal(receipt.json().remaining, 20); assert.equal((await stock(shelf2)).stocks[0].quantity, 80); assert.equal(await sum(), 1000);
    assert.equal((await post(`/transfers/${transferId}/receive`, received, staff2.headers)).json().remaining, 20);
    assert.equal((await post(`/transfers/${transferId}/receive`, { ...received, requestKey: randomUUID() }, staff2.headers)).statusCode, 409);
    const history = await app.inject({ url: `/api/inventory/transfers/${transferId}/history`, headers: staff1.headers });
    assert.equal(history.statusCode, 200); assert.equal(history.json().events[1].details.discrepancy, 20); assert.equal(history.json().events[1].actor_name, 'stock.two');
  });
  await t.test('partial receipts and administrator loss resolution retain discrepancy evidence', async () => {
    assert.equal((await post(`/transfers/${transferId}/receive`, { requestKey: randomUUID(), quantity: 21, expectedRemaining: 20, reason: 'Too much' }, staff2.headers)).statusCode, 400);
    assert.equal((await post(`/transfers/${transferId}/loss`, { requestKey: randomUUID(), quantity: 20, expectedRemaining: 20, reason: 'Unauthorized loss' }, staff2.headers)).statusCode, 403);
    const receipt = await post(`/transfers/${transferId}/receive`, { requestKey: randomUUID(), quantity: 15, expectedRemaining: 20, reason: 'Fifteen more units located and counted' }, staff2.headers); assert.equal(receipt.statusCode, 200);
    const loss = await post(`/transfers/${transferId}/loss`, { requestKey: randomUUID(), quantity: 5, expectedRemaining: 5, reason: 'Investigation confirmed five units lost in transit' }); assert.equal(loss.statusCode, 200, loss.body);
    assert.equal(await sum(), 995); assert.equal((await stock(shelf2)).transfers[0].lost, 5);
    assert.equal((await post(`/transfers/${transferId}/receive`, { requestKey: randomUUID(), quantity: 1, expectedRemaining: 1, reason: 'Closed transfer' }, staff2.headers)).statusCode, 409);
  });
  await t.test('reverse shelf transfers and main-storage/internal routes conserve stock', async () => {
    for (const [sourceId, destinationId, headers, recipient] of [[shelf2, shelf1, staff2.headers, staff1.headers], [shared[0], shelf1, admin, staff1.headers], [shared[1], store2, admin, staff2.headers], [store1, shelf1, staff1.headers, staff1.headers]] as const) {
      const dispatched = await post('/transfers', { requestKey: randomUUID(), batchId, sourceId, destinationId, quantity: 10, reason: 'Recorded physical movement' }, headers);
      assert.equal(dispatched.statusCode, 200, dispatched.body);
      const receipt = await post(`/transfers/${dispatched.json().id}/receive`, { requestKey: randomUUID(), quantity: 10, expectedRemaining: 10, reason: 'Counted ten on receipt' }, recipient); assert.equal(receipt.statusCode, 200, receipt.body);
      assert.equal(await sum(), 995);
    }
    assert.equal((await stock(store1)).stocks[0].quantity, 90); assert.equal((await stock(store2)).stocks[0].quantity, 110);
  });
  await t.test('concurrent deductions cannot overspend, including reserved stock', async () => {
    await db.query('UPDATE stock_balances SET reserved=70 WHERE location_id=$1 AND batch_id=$2', [shelf2, batchId]);
    // Shelf 2 has 85; only 15 are available for either concurrent dispatch.
    const results = await Promise.all([staff2.headers, admin].map(headers => post('/transfers', { requestKey: randomUUID(), batchId, sourceId: shelf2, destinationId: shelf1, quantity: 10, reason: 'Concurrent stock deduction' }, headers)));
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]); assert.equal((await stock(shelf2)).stocks[0].quantity, 75);
    assert.equal(await sum(), 995);
  });
  await t.test('counted adjustments preserve variance, reject stale counts, and cannot consume reservations', async () => {
    const current = (await stock(shelf1)).stocks[0];
    const payload = { requestKey: randomUUID(), batchId, locationId: shelf1, counted: current.quantity - 2, expectedVersion: current.version, reason: 'Physical count found two units short' };
    const response = await post('/counts', payload); assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().variance, -2);
    assert.equal((await post('/counts', payload)).statusCode, 200); assert.equal(await sum(), 993);
    assert.equal((await post('/counts', { ...payload, requestKey: randomUUID() })).statusCode, 409);
    const reserved = (await stock(shelf2)).stocks[0];
    assert.equal((await post('/counts', { ...payload, requestKey: randomUUID(), locationId: shelf2, expectedVersion: reserved.version, counted: 60 })).statusCode, 409);
    assert.equal((await stock(shelf2)).stocks[0].quantity, 75);
  });
  await t.test('expiry, invalid quantities, duplicate allocations, self transfers and CSRF are rejected', async () => {
    for (const receivedPacks of [-1, 0.5, 100000000, '1']) assert.equal((await post('/receipts', { ...delivery, requestKey: randomUUID(), receivedPacks })).statusCode, 400);
    assert.equal((await post('/receipts', { ...delivery, requestKey: randomUUID(), expiry: '2000-01-01' })).statusCode, 400);
    assert.equal((await post('/receipts', { ...delivery, requestKey: randomUUID(), allocations: [{ locationId: shelf1, quantity: 500 }, { locationId: shelf1, quantity: 500 }] })).statusCode, 400);
    const dispatch = { requestKey: randomUUID(), batchId, sourceId: shelf1, destinationId: shelf1, quantity: 1, reason: 'Invalid self transfer' };
    assert.equal((await post('/transfers', dispatch)).statusCode, 400);
    assert.equal((await post('/transfers', { ...dispatch, destinationId: shelf2 }, { ...write, cookie: admin.cookie } as typeof admin)).statusCode, 403);
    const oldBatch = randomUUID();
    await db.query('INSERT INTO stock_batches(id,product_id,batch_number,expiry) VALUES($1,$2,$3,$4)', [oldBatch, catalogue.id, 'EXPIRED', '2000-01-01']);
    await db.query('INSERT INTO stock_balances(location_id,batch_id,quantity) VALUES($1,$2,10)', [shelf1, oldBatch]);
    assert.equal((await post('/transfers', { ...dispatch, destinationId: shelf2, batchId: oldBatch })).statusCode, 409);
  });
  await t.test('revoked shop/shared access applies to existing sessions', async () => {
    const granted = await app.inject({ method: 'PUT', url: `/api/admin/users/${staff1.id}/access`, headers: admin, payload: { memberships: [], sharedStorageAccess: true } }); assert.equal(granted.statusCode, 200);
    assert.equal((await app.inject({ url: `/api/inventory/locations/${shared[0]}`, headers: staff1.headers })).statusCode, 200);
    assert.equal((await post('/transfers', { requestKey: randomUUID(), batchId, sourceId: shelf1, destinationId: shelf2, quantity: 1, reason: 'Revoked shop assignment' }, staff1.headers)).statusCode, 404);
    assert.equal((await app.inject({ url: `/api/inventory/transfers/${transferId}/history`, headers: staff1.headers })).statusCode, 404);
    await app.inject({ method: 'PUT', url: `/api/admin/users/${staff1.id}/access`, headers: admin, payload: { memberships: [], sharedStorageAccess: false } });
    assert.equal((await post('/transfers', { requestKey: randomUUID(), batchId, sourceId: shared[0], destinationId: shelf1, quantity: 1, reason: 'Revoked shared access' }, staff1.headers)).statusCode, 404);
  });
  await t.test('ledger, receipts, operations and batch identity are immutable', async () => {
    for (const sql of ['DELETE FROM stock_ledger', 'UPDATE stock_receipts SET received_quantity=0', "UPDATE stock_batches SET batch_number='hidden'", 'DELETE FROM stock_operations', 'DELETE FROM stock_receipt_approvals']) await assert.rejects(db.exec(sql));
    const lines = (await db.query<{ n: number }>('SELECT sum(delta)::integer AS n FROM stock_ledger WHERE location_id IS NOT NULL')).rows[0].n;
    const balances = (await db.query<{ n: number }>('SELECT sum(quantity)::integer AS n FROM stock_balances WHERE batch_id=$1', [batchId])).rows[0].n;
    assert.equal(lines, balances);
    assert.equal((await db.query("SELECT * FROM audit_events WHERE action LIKE 'inventory.%'")).rows.length, (await db.query('SELECT * FROM stock_operations')).rows.length);
  });
  await t.test('one supplier document posts 22 drug lines atomically with duplicate protection and whole-document review', async () => {
    const lines = [];
    for (let index = 0; index < 22; index++) {
      const created = await app.inject({ method: 'POST', url: '/api/shops/' + shop1 + '/catalogue', headers: admin, payload: { name: 'Multi Drug ' + index, genericName: 'Test generic', strength: '10 mg', dosageForm: 'Tablet', baseUnit: 'tablet', reason: 'Multi drug receipt coverage', units: [{ label: 'tablet', baseQuantity: 1, barcode: '', priceMinor: 100 }, { label: 'box', baseQuantity: 10, barcode: '', priceMinor: 900 }] } });
      assert.equal(created.statusCode, 201, created.body);
      const unit = (await db.query<{ id: string }>('SELECT id FROM selling_units WHERE product_id=$1 AND base_quantity=10', [created.json().id])).rows[0];
      lines.push({ unitId: unit.id, batchNumber: 'MULTI-' + index, expiry: '2099-12-31', expectedPacks: 3, receivedPacks: 2, allocations: [{ locationId: shelf1, quantity: 10 }, { locationId: store1, quantity: 10 }], reason: 'One box missing on line ' + (index + 1) });
    }
    const payload = { requestKey: randomUUID(), supplier: 'Multi Supplier', reference: 'MULTI-001', reason: 'One document with twenty two drugs', lines };
    const before = await sum();
    const bad = await post('/deliveries', { ...payload, lines: lines.map((line, index) => index === 21 ? { ...line, allocations: [{ locationId: shelf1, quantity: 19 }] } : line) });
    assert.equal(bad.statusCode, 400, bad.body); assert.match(bad.json().message, /Line 22/);
    assert.equal(await sum(), before); assert.equal((await db.query('SELECT * FROM supplier_documents')).rows.length, 0);
    const forbidden = await post('/deliveries', payload, staff2.headers); assert.equal(forbidden.statusCode, 404); assert.equal(await sum(), before);
    const empty = await post('/deliveries', { ...payload, lines: [] }); assert.equal(empty.statusCode, 400);
    const duplicate = await post('/deliveries', { ...payload, lines: [lines[0], lines[0]] }); assert.equal(duplicate.statusCode, 400);
    const response = await post('/deliveries', payload); assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().lineCount, 22);
    const id = response.json().id;
    assert.equal(await sum(), before + 440);
    assert.deepEqual((await post('/deliveries', payload)).json(), response.json()); assert.equal(await sum(), before + 440);
    assert.equal((await post('/deliveries', { ...payload, requestKey: randomUUID() })).statusCode, 409);
    assert.equal((await post('/receipts', { ...lines[0], supplier: payload.supplier, reference: payload.reference, requestKey: randomUUID() })).statusCode, 409);
    const document = await app.inject({ url: '/api/inventory/deliveries/' + id, headers: admin }); assert.equal(document.statusCode, 200);
    assert.equal(document.json().lines.length, 22); assert.equal(document.json().lines[21].batch_number, 'MULTI-21');
    assert.equal(document.json().lines[0].expected_quantity, 30); assert.equal(document.json().lines[0].received_quantity, 20);
    assert.equal(document.json().lines[0].allocations.length, 2);
    assert.equal((await app.inject({ url: '/api/inventory/deliveries/' + id, headers: staff2.headers })).statusCode, 404);
    assert.equal((await post('/receipts/' + document.json().lines[0].id + '/approve', { requestKey: randomUUID(), reason: 'Cannot bypass complete document review' })).statusCode, 409);
    const approval = { requestKey: randomUUID(), reason: 'Reviewed all twenty two lines and supplier discrepancies' };
    assert.equal((await post('/deliveries/' + id + '/approve', approval, staff2.headers)).statusCode, 403);
    assert.equal((await post('/deliveries/' + id + '/approve', approval)).statusCode, 200);
    assert.equal((await post('/deliveries/' + id + '/approve', approval)).statusCode, 200);
    const reviewed = (await app.inject({ url: '/api/inventory/deliveries/' + id, headers: admin })).json();
    assert.ok(reviewed.lines.every((line: { approved_at: string }) => line.approved_at)); assert.equal(await sum(), before + 440);
    await assert.rejects(db.exec('DELETE FROM supplier_documents')); await assert.rejects(db.exec('DELETE FROM supplier_document_lines'));
    // Different batches of one drug are legitimate separate receipt lines.
    const second = { ...payload, requestKey: randomUUID(), reference: 'MULTI-002', lines: [lines[0], { ...lines[0], batchNumber: 'SECOND-BATCH' }] };
    const results = await Promise.all([post('/deliveries', second), post('/deliveries', { ...second, requestKey: randomUUID() })]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]); assert.equal(await sum(), before + 480);
    assert.equal((await post('/deliveries', { ...payload, requestKey: randomUUID(), supplier: delivery.supplier, reference: delivery.reference })).statusCode, 409);
  });

  await t.test('main-room duplication requires explicit confirmation across batches, counts, receipts and concurrent arrivals', async () => {
    const unit = (await db.query<{ id: string }>("SELECT u.id FROM selling_units u JOIN products p ON p.id=u.product_id WHERE p.name='Multi Drug 0' AND u.base_quantity=1")).rows[0];
    const receipt = (room: string, batchNumber: string, forceDuplicate = false) => ({ requestKey: randomUUID(), unitId: unit.id, supplier: 'Duplication Tests', reference: randomUUID(), batchNumber, expiry: '2099-12-31', expectedPacks: 20, receivedPacks: 20, allocations: [{ locationId: room, quantity: 20 }], reason: 'Testing main-room duplicate guard', forceDuplicate });
    const first = await post('/receipts', receipt(shared[0], 'DUP-A')); assert.equal(first.statusCode, 200, first.body);
    assert.equal((await post('/receipts', receipt(shared[0], 'DUP-B'))).statusCode, 200);
    const secondPayload = receipt(shared[1], 'DUP-C');
    const blocked = await post('/receipts', secondPayload); assert.equal(blocked.statusCode, 409); assert.match(blocked.json().message, /Allow duplicate/);
    const second = await post('/receipts', { ...secondPayload, forceDuplicate: true }); assert.equal(second.statusCode, 200, second.body);
    const batch = second.json().batchId;
    let current = (await stock(shared[1])).stocks.find((s: { batch_id: string }) => s.batch_id === batch);
    assert.equal((await post('/counts', { requestKey: randomUUID(), batchId: batch, locationId: shared[1], counted: 0, expectedVersion: current.version, reason: 'Empty second room batch' })).statusCode, 200);
    current = (await stock(shared[1])).stocks.find((s: { batch_id: string }) => s.batch_id === batch);
    const count = { requestKey: randomUUID(), batchId: batch, locationId: shared[1], counted: 1, expectedVersion: current.version, reason: 'Positive count must confirm duplication' };
    assert.equal((await post('/counts', count)).statusCode, 409);
    assert.equal((await post('/counts', { ...count, forceDuplicate: true })).statusCode, 200);
    const dispatch = await post('/transfers', { requestKey: randomUUID(), batchId: first.json().batchId, sourceId: shared[0], destinationId: shared[1], quantity: 1, reason: 'Receive transfer must confirm duplicates' });
    const receive = { requestKey: randomUUID(), quantity: 1, expectedRemaining: 1, reason: 'Counted incoming stock' };
    assert.equal((await post('/transfers/' + dispatch.json().id + '/receive', receive)).statusCode, 409);
    assert.equal((await post('/transfers/' + dispatch.json().id + '/receive', { ...receive, forceDuplicate: true })).statusCode, 200);
    const otherUnit = (await db.query<{ id: string }>("SELECT u.id FROM selling_units u JOIN products p ON p.id=u.product_id WHERE p.name='Multi Drug 1' AND u.base_quantity=1")).rows[0];
    await app.inject({ method: 'PUT', url: '/api/admin/users/' + staff1.id + '/access', headers: admin, payload: { memberships: [], sharedStorageAccess: true } });
    const results = await Promise.all([post('/receipts', { ...receipt(shared[0], 'RACE-A'), unitId: otherUnit.id }), post('/receipts', { ...receipt(shared[1], 'RACE-B'), unitId: otherUnit.id }, staff1.headers)]);
    assert.deepEqual(results.map(r => r.statusCode).sort(), [200, 409]);
    const auditRows = await db.query<{ details: { forceDuplicate: boolean } }>("SELECT details FROM audit_events WHERE action='inventory.count' ORDER BY id DESC LIMIT 1");
    assert.equal(auditRows.rows[0].details.forceDuplicate, true);
  });

});
