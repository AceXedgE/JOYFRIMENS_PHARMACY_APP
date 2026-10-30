import {readFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {openDatabase} from '../backend/dist/database.js';
import {readConfig} from '../backend/dist/config.js';
import {migrate} from '../backend/dist/migrate.js';
import {audit} from '../backend/dist/setup.js';

export async function replaceBusinessCatalogue(db,manifest){
 if(!manifest.products.length||manifest.products.some(p=>!p.name||p.units.some(u=>!Number.isSafeInteger(u.priceMinor)||u.priceMinor<0||!Number.isInteger(u.baseQuantity)||u.baseQuantity<1)))throw new Error('Invalid import manifest.');
 return db.transaction(async tx=>{
  const accounts=(await tx.query('SELECT * FROM users ORDER BY id')).rows;
  const memberships=(await tx.query('SELECT * FROM memberships ORDER BY user_id,shop_id')).rows;
  const admin=accounts.find(u=>u.role==='admin'&&u.active);if(!admin)throw new Error('An existing active administrator is required.');
  const shops=(await tx.query('SELECT id FROM shops ORDER BY code')).rows;if(shops.length!==2)throw new Error('Expected two existing shops.');
  const keep=new Set(['users','memberships','shops','locations','setup_lock','schema_migrations','business_dataset']);
  const tables=(await tx.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename")).rows.map(r=>r.tablename).filter(t=>!keep.has(t));
  if(!tables.includes('sales')||!tables.includes('products'))throw new Error('Unexpected database schema; no reset performed.');
  await tx.exec('TRUNCATE TABLE '+tables.map(t=>'"'+t.replaceAll('"','""')+'"').join(',')+' RESTART IDENTITY');
  const revision=randomUUID();await tx.query('UPDATE business_dataset SET revision=$1 WHERE id=1',[revision]);
  let units=0;
  for(const product of manifest.products){
   const id=randomUUID();await tx.query("INSERT INTO products(id,name,generic_name,strength,dosage_form,base_unit,created_by) VALUES($1,$2,'','','',$3,$4)",[id,product.name,product.baseUnit,admin.id]);
   for(const unit of product.units){
    const unitId=randomUUID();await tx.query('INSERT INTO selling_units(id,product_id,label,base_quantity) VALUES($1,$2,$3,$4)',[unitId,id,unit.label,unit.baseQuantity]);
    await tx.query('INSERT INTO unit_prices(unit_id,price_minor,version) VALUES($1,$2,1)',[unitId,unit.priceMinor]);
    await tx.query('INSERT INTO price_history(unit_id,version,price_minor,initiating_shop_id,changed_by,reason) VALUES($1,1,$2,$3,$4,$5)',[unitId,unit.priceMinor,shops[0].id,admin.id,'Owner-authorised Tomjoy price-list import']);
    await tx.query('INSERT INTO shop_listings(shop_id,unit_id,available,version) SELECT id,$1,true,1 FROM shops',[unitId]);units++;
   }
  }
  const afterAccounts=(await tx.query('SELECT * FROM users ORDER BY id')).rows,afterMemberships=(await tx.query('SELECT * FROM memberships ORDER BY user_id,shop_id')).rows;
  if(JSON.stringify(accounts)!==JSON.stringify(afterAccounts)||JSON.stringify(memberships)!==JSON.stringify(afterMemberships))throw new Error('Account preservation failed; rollback required.');
  const result={products:manifest.products.length,sellingOptions:units,shops:shops.length,accountsPreserved:accounts.length,unpricedProducts:manifest.products.filter(p=>p.units.every(u=>u.priceMinor===0)).length,revision};
  await audit(tx,admin.id,'catalogue.owner_authorised_reset_import',null,{sourceSha256:manifest.sourceSha256,...result});return result;
 });
}
if(process.argv.includes('--replace-business-data')){
 const config=readConfig();if(config.production||config.databaseUrl)throw new Error('This explicit reset/import command is restricted to the local embedded database.');
 const manifest=JSON.parse(await readFile('docs/tomjoy-catalogue-import.json','utf8'));
 const source=await readFile('docs/tomjoy-price-list-source.txt','utf8');if(createHash('sha256').update(source).digest('hex')!==manifest.sourceSha256)throw new Error('Source changed; prepare and review the manifest again.');
 const db=await openDatabase(config);try{await migrate(db);console.log(JSON.stringify(await replaceBusinessCatalogue(db,manifest),null,2));}finally{await db.close();}
}
