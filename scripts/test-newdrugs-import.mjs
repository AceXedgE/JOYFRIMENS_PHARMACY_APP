import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {openDatabase} from '../backend/dist/database.js';
import {migrate} from '../backend/dist/migrate.js';
import {bootstrap} from '../backend/dist/setup.js';
import {importNewDrugs} from './import-newdrugs.mjs';
import {exportDatabase} from './export-for-render.mjs';

const db=await openDatabase({dataDir:'memory://'});
try{
 await migrate(db);const actor=await bootstrap(db,{username:'import.admin',password:randomUUID(),name:'Import admin',shops:['Tomjoy','Joyfrimens'],currency:'GHS',timezone:'Etc/GMT'});
 const old=randomUUID(),unit=randomUUID();await db.query("INSERT INTO products(id,name,generic_name,strength,dosage_form,base_unit,created_by) VALUES($1,'Feroglobin','','','','bottle',$2)",[old,actor]);
 await db.query("INSERT INTO selling_units(id,product_id,label,base_quantity) VALUES($1,$2,'bottle',1)",[unit,old]);await db.query('INSERT INTO unit_prices(unit_id,price_minor,version) VALUES($1,9999,1)',[unit]);
 await db.query('INSERT INTO shop_listings(shop_id,unit_id,available,version) SELECT id,$1,false,1 FROM shops',[unit]);
 const manifest=JSON.parse(await readFile('docs/newdrugs-import.json','utf8'));const result=await importNewDrugs(db,manifest);assert.equal(result.addedMedicines,104);assert.equal(result.skippedSourceLines,9);
 assert.equal((await db.query('SELECT price_minor FROM unit_prices WHERE unit_id=$1',[unit])).rows[0].price_minor,9999);assert.equal((await db.query('SELECT * FROM shop_listings WHERE unit_id=$1 AND available',[unit])).rows.length,0);
 assert.equal((await db.query("SELECT generic_name FROM products WHERE name='Arfan 20/120'")).rows[0].generic_name,'44, 4 4, four four');
 assert.equal((await db.query("SELECT * FROM products WHERE name IN ('Oxynic','klovinal','amovulin','Luex','Aptizooom','ciprolex')")).rows.length,0);
 const options=(await db.query("SELECT u.label,u.variation,u.base_quantity,pr.price_minor FROM selling_units u JOIN products p ON p.id=u.product_id JOIN unit_prices pr ON pr.unit_id=u.id WHERE p.name='Abyvita caps' ORDER BY u.display_order")).rows;
 assert.deepEqual(options,[{label:'box',variation:false,base_quantity:1,price_minor:1000},{label:'strip',variation:true,base_quantity:1,price_minor:500}]);
 assert.ok(result.zeroPriceMedicines.includes('budex'));assert.equal((await db.query('SELECT * FROM stock_balances')).rows.length,0);
 const repeated=await importNewDrugs(db,manifest);assert.equal(repeated.alreadyImported,true);assert.equal((await db.query('SELECT * FROM products')).rows.length,105);
 console.log(`PASS: add-only import, ${result.addedMedicines} medicines, existing prices/availability preserved, aliases, omissions, separate packs, zero prices and safe retries.`);
}finally{await db.close();}

// Verify the official SQL exporter can recreate schema, rows and sequences.
const source=await PGlite.create(),restored=await PGlite.create();
try{
 await source.exec('CREATE TABLE users(id serial PRIMARY KEY,name text); CREATE TABLE sessions(id integer); CREATE TABLE login_limits(id integer); INSERT INTO users(name) VALUES(\'Preserved account\'); INSERT INTO sessions VALUES(1);');
 const {sql,metadata}=await exportDatabase(source);
 // psql handles these meta-commands during the real restore; pg.exec does not.
 const executable=sql.replace(/^\\(?:un)?restrict\b.*$/gm,'');
 await restored.exec(executable);
 assert.equal((await restored.query('SELECT name FROM users')).rows[0].name,'Preserved account');assert.equal((await restored.query('SELECT * FROM sessions')).rows.length,0);
 assert.equal(metadata.counts.users,1);assert.equal(metadata.counts.sessions,0);assert.equal((await restored.query("INSERT INTO users(name) VALUES('Next') RETURNING id")).rows[0].id,2);
 console.log('PASS: SQL export/restore retains data and sequences, excludes login sessions.');
}finally{await source.close();await restored.close();}
