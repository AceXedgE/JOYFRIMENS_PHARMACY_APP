import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { openDatabase } from '../src/database.ts';
import { bootstrap } from '../src/setup.ts';
import { migrate } from '../src/migrate.ts';
import { newToken } from '../src/security.ts';

test('supplier-document migration preserves existing receipts, approvals, and stock', async t => {
  const db = await openDatabase({ dataDir: 'memory://' }); t.after(() => db.close());
  await db.exec('CREATE TABLE schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for (const [index, file] of ['001_accounts.sql', '002_catalogue.sql', '003_inventory.sql'].entries()) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'); await db.exec(sql);
    await db.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [index + 1, createHash('sha256').update(sql).digest('hex')]);
  }
  const actor = await bootstrap(db, { username: 'migration.admin', password: newToken(), name: 'Migration Admin', shops: ['Tomjoy Pharmacy', 'Joyfrimens Pharmacy'], currency: 'GHS', timezone: 'Etc/GMT' });
  const product = randomUUID(), unit = randomUUID(), batch = randomUUID(), receipt = randomUUID(), operation = randomUUID();
  const location = (await db.query<{ id: string }>('SELECT id FROM locations LIMIT 1')).rows[0].id;
  await db.transaction(async tx => {
    await tx.query('INSERT INTO products(id,name,generic_name,strength,dosage_form,base_unit,created_by) VALUES($1,$2,$2,$3,$4,$5,$6)', [product, 'Existing Drug', '10 mg', 'Tablet', 'tablet', actor]);
    await tx.query('INSERT INTO selling_units(id,product_id,label,base_quantity) VALUES($1,$2,$3,1)', [unit, product, 'tablet']);
    await tx.query('INSERT INTO stock_batches(id,product_id,batch_number,expiry) VALUES($1,$2,$3,$4)', [batch, product, 'OLD-LOT', '2099-12-31']);
    await tx.query('INSERT INTO stock_receipts(id,batch_id,unit_id,supplier,reference,expected_quantity,received_quantity,reason,actor_id) VALUES($1,$2,$3,$4,$5,12,10,$6,$7)', [receipt, batch, unit, 'existing supplier', 'old-ref', 'Two missing', actor]);
    await tx.query('INSERT INTO stock_receipt_approvals(receipt_id,actor_id,reason) VALUES($1,$2,$3)', [receipt, actor, 'Approved discrepancy']);
    await tx.query('INSERT INTO stock_operations(id,actor_id,request_key,payload,result) VALUES($1,$2,$3,$4,$5)', [operation, actor, randomUUID(), 'legacy payload', '{}']);
    await tx.query('INSERT INTO stock_ledger(operation_id,location_id,batch_id,receipt_id,delta,kind,actor_id,reason) VALUES($1,$2,$3,$4,10,$5,$6,$7)', [operation, location, batch, receipt, 'delivery', actor, 'Original receipt']);
    await tx.query('INSERT INTO stock_balances(location_id,batch_id,quantity) VALUES($1,$2,10)', [location, batch]);
  });
  const prior = (await db.query('SELECT * FROM stock_receipts')).rows;
  await migrate(db); await migrate(db);
  assert.deepEqual((await db.query('SELECT * FROM stock_receipts')).rows, prior);
  assert.equal((await db.query('SELECT * FROM stock_receipt_approvals')).rows.length, 1);
  assert.equal((await db.query<{ quantity: number }>('SELECT quantity FROM stock_balances')).rows[0].quantity, 10);
  assert.equal((await db.query('SELECT * FROM stock_ledger')).rows.length, 1);
  assert.equal((await db.query('SELECT * FROM supplier_documents')).rows.length, 0);
});
