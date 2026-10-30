import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {migrationChecksum, migrationChecksumMatches, migrate} from '../src/migrate.ts';
import {openDatabase} from '../src/database.ts';

const legacy = [
 [7, '007_shelf_sales.sql', 'ab95a4a1f68fcc1da79c30403528a858352b84166fbf4a32cf9a9647db826a34'],
 [8, '008_daily_cash.sql', '4697be9b2273007e5f0f7ff49dea93ad7e2b80ddccde18eea49dee76e39426f5'],
 [9, '009_sale_price_exceptions.sql', '6d585cf70441a80aee8738297720bba31983efbbeb3965e892ec795cf861d2c0'],
] as const;

test('legacy Windows checksums accept identical Linux SQL but reject changed SQL', async () => {
 for (const [version, file, stored] of legacy) {
  const sql=(await readFile(new URL('../migrations/'+file,import.meta.url),'utf8')).replace(/\r\n/g,'\n');
  assert.equal(migrationChecksumMatches(version,stored,sql),true);
  assert.equal(migrationChecksumMatches(version,stored,sql.replace(/\n/g,'\r\n')),true);
  assert.equal(migrationChecksumMatches(version,stored,sql+'\nSELECT 1;'),false);
  assert.equal(migrationChecksumMatches(version+1,stored,sql),false);
  assert.equal(migrationChecksum(sql),migrationChecksum(sql.replace(/\n/g,'\r\n')));
 }
});

test('migration rerun preserves legacy history and still rejects checksum tampering', async () => {
 const db=await openDatabase({dataDir:'memory://'});
 try {
  await migrate(db);
  for(const [version,,stored] of legacy)await db.query('UPDATE schema_migrations SET checksum=$1 WHERE version=$2',[stored,version]);
  const before=(await db.query('SELECT * FROM schema_migrations ORDER BY version')).rows;
  await migrate(db);
  assert.deepEqual((await db.query('SELECT * FROM schema_migrations ORDER BY version')).rows,before);
  await db.query("UPDATE schema_migrations SET checksum='invalid' WHERE version=7");
  await assert.rejects(migrate(db),/007_shelf_sales.sql was modified/);
 } finally {await db.close();}
});
