import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import {openDatabase} from '../backend/dist/database.js';
import {readConfig} from '../backend/dist/config.js';
import {requireSchema} from '../backend/dist/migrate.js';
import {audit} from '../backend/dist/setup.js';
import {medicineNotification} from '../backend/dist/notifications.js';
import {normalizeName} from './prepare-newdrugs.mjs';

export function planImport(manifest,existing){
 return manifest.entries.map(entry=>{
  const match=existing.find(p=>normalizeName(p.name)===normalizeName(entry.name));
  return {...entry,action:entry.skip||match?'skip':'add',reason:entry.skip?.reason??(match?`Existing ${match.name}; no fields or prices changed.`:'New medicine and selling options.'),existingId:match?.id??null};
 });
}
async function protectedRows(tx,ids){
 const tables=[['users','true'],['memberships','true'],['products','id=ANY($1::uuid[])'],['selling_units','product_id=ANY($1::uuid[])'],['unit_prices','unit_id IN (SELECT id FROM selling_units WHERE product_id=ANY($1::uuid[]))'],['shop_listings','unit_id IN (SELECT id FROM selling_units WHERE product_id=ANY($1::uuid[]))'],['price_history','unit_id IN (SELECT id FROM selling_units WHERE product_id=ANY($1::uuid[]))']];
 const snapshots={};for(const [table,where] of tables)snapshots[table]=(await tx.query(`SELECT row_to_json(t) AS row FROM ${table} t WHERE ${where} ORDER BY row_to_json(t)::text`,where==='true'?[]:[ids])).rows;
 return JSON.stringify(snapshots);
}
export async function importNewDrugs(db,manifest){
 if(manifest.mode!=='add-only-existing-unchanged'||manifest.entries.some(e=>!e.name||e.units.some(u=>!u.label||u.label.length>40||!Number.isSafeInteger(u.priceMinor)||u.priceMinor<0||u.baseQuantity!==1)))throw new Error('Invalid reviewed manifest.');
 return db.transaction(async tx=>{
  await tx.exec('LOCK TABLE products IN SHARE ROW EXCLUSIVE MODE');
  const prior=(await tx.query("SELECT details FROM audit_events WHERE action='catalogue.newdrugs_import' AND details->>'sourceSha256'=$1",[manifest.sourceSha256])).rows[0];
  if(prior)return {...prior.details,alreadyImported:true};
  const existing=(await tx.query('SELECT id,name FROM products ORDER BY id')).rows,ids=existing.map(p=>p.id);
  const protectedBefore=await protectedRows(tx,ids);
  const actor=(await tx.query("SELECT id FROM users WHERE role='admin' AND active ORDER BY created_at,id LIMIT 1")).rows[0];
  const shop=(await tx.query('SELECT id FROM shops ORDER BY code LIMIT 1')).rows[0];
  if(!actor||!shop)throw new Error('Existing administrator and shops are required.');
  const plan=planImport(manifest,existing);let addedOptions=0;
  for(const entry of plan.filter(e=>e.action==='add')){
   const id=randomUUID();entry.importedId=id;
   await tx.query("INSERT INTO products(id,name,generic_name,strength,dosage_form,base_unit,created_by) VALUES($1,$2,$3,'','',$4,$5)",[id,entry.name,entry.genericName,entry.baseUnit,actor.id]);
   for(const unit of entry.units){
    const unitId=randomUUID();await tx.query('INSERT INTO selling_units(id,product_id,label,base_quantity,variation,display_order) VALUES($1,$2,$3,$4,$5,$6)',[unitId,id,unit.label,unit.baseQuantity,unit.variation,unit.displayOrder]);
    await tx.query('INSERT INTO unit_prices(unit_id,price_minor,version) VALUES($1,$2,1)',[unitId,unit.priceMinor]);
    await tx.query("INSERT INTO price_history(unit_id,version,price_minor,initiating_shop_id,changed_by,reason) VALUES($1,1,$2,$3,$4,'Owner supplied newdrugs.md import')",[unitId,unit.priceMinor,shop.id,actor.id]);
    await tx.query('INSERT INTO shop_listings(shop_id,unit_id,available,version) SELECT id,$1,true,1 FROM shops',[unitId]);
    await medicineNotification(tx,unitId,'added');addedOptions++;
   }
  }
  if(await protectedRows(tx,ids)!==protectedBefore)throw new Error('An existing record changed; rolling back the entire import.');
  const result={sourceSha256:manifest.sourceSha256,addedMedicines:plan.filter(e=>e.action==='add').length,addedOptions,skippedSourceLines:plan.filter(e=>e.action==='skip').length,existingMedicinesPreserved:ids.length,zeroPriceMedicines:plan.filter(e=>e.action==='add'&&e.units.every(u=>u.priceMinor===0)).map(e=>e.name),entries:plan,importedAt:new Date().toISOString()};
  await audit(tx,actor.id,'catalogue.newdrugs_import',null,result);return result;
 });
}
export function report(result){
 const cell=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
 return `# New medicines import report\n\nSource: docs/newdrugs.md. Existing medicines, prices, shelf flags, accounts and permissions were left unchanged.\n\nAdded **${result.addedMedicines} medicines / ${result.addedOptions} selling options**; skipped **${result.skippedSourceLines} source lines**.\n\n## Problems and handling\n\n- Oxynic, klovinal and amovulin: omitted at the owner's request.\n- Aptizooom, Luex, ciprolex: confirmed spelling/name matches were skipped. Luex prices were confirmed at GHS 40, but the existing LEUX entry was not updated.\n- Amoksiklav: only suspension 457 and 228.5 were added; capsules 1g/625 were skipped as the confirmed existing AMOSKICLAV entries.\n- Menota, Fisherman's friend, Diofen and Flucor: existing entries retained without changing prices, units, names or aliases.\n- Box/strip/blister: each listed price buys one named pack. Blister means strip. No box-to-strip conversion was inferred; unknown pack conversions are separate stock options.\n- Explicit 2= prices: preserved as one priced **2-unit bundle**, never converted to a one-unit price. Dynewell tablets are a separate 2-unit bundle from its syrup. Stock counts for these options count bundles, not individual tablets.\n- Prices without a ghc prefix (Malar suspension, phopain, tothema full, secure strip) were read as GHS from context.\n- Leading hyphens identify variants; hyphens next to ghc do not. First listed option appears first. Small/medium/large and distinct forms are separate stock options.\n- Underscored aliases were copied, separated with commas; supplied spellings were preserved rather than medically reinterpreted.\n- Foligrow jnr syrup, eye drops, and other explicitly different forms/strengths were kept separate from existing broader names.\n- Missing prices are GHS 0 and cannot be sold until priced: **${result.zeroPriceMedicines.map(cell).join(', ')}**.\n\n## Every source line\n\n| Line | Medicine | Action | Prices (GHS) | Other names | Handling |\n|---|---|---|---|---|---|\n`+result.entries.map(e=>`| ${e.sourceLine} | ${cell(e.name)} | ${e.action} | ${cell(e.units.map(u=>u.label+': '+(u.priceMinor/100).toFixed(2)).join('; '))} | ${cell(e.genericName)} | ${cell(e.reason)} |`).join('\n')+'\n';
}
if(process.argv.includes('--apply')){
 const config=readConfig();if(config.production||config.databaseUrl)throw new Error('This import is restricted to the local embedded database.');
 const manifest=JSON.parse(await readFile('docs/newdrugs-import.json','utf8')),source=await readFile('docs/newdrugs.md','utf8');
 if(createHash('sha256').update(source).digest('hex')!==manifest.sourceSha256)throw new Error('The source changed; regenerate and review the manifest.');
 const db=await openDatabase(config);try{await requireSchema(db);const result=await importNewDrugs(db,manifest);await writeFile('docs/NEWDRUGS_IMPORT_REPORT.md',report(result));console.log(JSON.stringify({...result,entries:undefined},null,2));}finally{await db.close();}
}
