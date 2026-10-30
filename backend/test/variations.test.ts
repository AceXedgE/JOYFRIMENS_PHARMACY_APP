import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/database.ts';
import { migrate } from '../src/migrate.ts';
import { bootstrap } from '../src/setup.ts';
import { newToken } from '../src/security.ts';
import { buildApp } from '../src/app.ts';
import { readConfig } from '../src/config.ts';

test('variations have isolated stock, editable flags and no base conversion',async t=>{
 const db=await openDatabase({dataDir:'memory://'});t.after(()=>db.close());await migrate(db);
 const password=newToken();await bootstrap(db,{username:'variation.admin',password,name:'Admin',shops:['Tomjoy','Joyfrimens'],currency:'GHS',timezone:'Etc/GMT'});
 const app=buildApp({db,config:readConfig({NODE_ENV:'test'})});t.after(()=>app.close());
 const login=await app.inject({method:'POST',url:'/api/auth/login',headers:{'x-requested-with':'joyfrimens'},payload:{username:'variation.admin',password}});
 const headers={'x-requested-with':'joyfrimens','x-csrf-token':login.json().csrfToken,cookie:String(login.headers['set-cookie']).split(';')[0]};
 const shop=(await app.inject({url:'/api/shops',headers})).json().shops[0].id,base='/api/shops/'+shop;
 const call=(method:'POST'|'PUT',url:string,payload:object)=>app.inject({method,url,headers,payload});
 const post=(url:string,payload:object)=>call('POST',url,{requestKey:randomUUID(),...payload});
 const created=await call('POST',base+'/catalogue',{name:'SALBUTAMOL TEST',baseUnit:'inhaler',units:[{label:'inhaler',baseQuantity:1,barcode:'',priceMinor:8000},{label:'syrup',baseQuantity:1,barcode:'',priceMinor:5000,variation:true},{label:'box',baseQuantity:2,barcode:'',priceMinor:15000}]});assert.equal(created.statusCode,201,created.body);
 const product=async()=>(await app.inject({url:base+'/catalogue',headers})).json().products[0];let p=await product();
 const edit=()=>({expectedVersion:p.revision,name:p.name,genericName:p.genericName,baseUnit:p.baseUnit,units:p.units.map((u:any)=>({id:u.id,label:u.label,baseQuantity:u.baseQuantity,barcode:u.barcode??'',variation:u.variation}))});
 let body=edit();body.units.find((u:any)=>u.label==='syrup').variation=false;assert.equal((await call('PUT',base+'/catalogue/products/'+p.id,body)).statusCode,200);
 p=await product();body=edit();body.units.find((u:any)=>u.label==='syrup').variation=true;assert.equal((await call('PUT',base+'/catalogue/products/'+p.id,body)).statusCode,200);p=await product();
 const syrup=p.units.find((u:any)=>u.label==='syrup'),box=p.units.find((u:any)=>u.label==='box'),inhaler=p.units.find((u:any)=>u.label==='inhaler');
 const opts=(await app.inject({url:'/api/inventory/options',headers})).json();const room=opts.locations.find((l:any)=>l.shop_id===shop&&l.kind==='storeroom');
 async function add(unitId:string,packs:number){const r=await post('/api/inventory/manual',{unitId,packs,locationId:room.id,batchNumber:'SAME',expiry:'2099-12-31'});assert.equal(r.statusCode,200,r.body);return r.json().batchId;}
 const ordinaryBatch=await add(box.id,5),variantBatch=await add(syrup.id,4);assert.notEqual(ordinaryBatch,variantBatch);
 const amounts=async()=>(await db.query<{batch_id:string;quantity:number}>('SELECT batch_id,quantity FROM stock_balances WHERE location_id=$1',[room.id])).rows;
 assert.equal((await amounts()).find(x=>x.batch_id===ordinaryBatch)?.quantity,10);assert.equal((await amounts()).find(x=>x.batch_id===variantBatch)?.quantity,4);
 const workspace=async()=>(await app.inject({url:base+'/sales/workspace',headers})).json();let w=await workspace();assert.ok(w.choices.some((c:any)=>c.unitId===syrup.id&&c.batchId===variantBatch));assert.ok(!w.choices.some((c:any)=>c.unitId===syrup.id&&c.batchId===ordinaryBatch));assert.ok(!w.choices.some((c:any)=>c.unitId===inhaler.id&&c.batchId===variantBatch));
 const opened=await post(base+'/day/open',{openingMinor:0});assert.equal(opened.statusCode,200,opened.body);w=await workspace();
 const draft=await post(base+'/sales/drafts',{shopConfirmed:true,locationStatus:'unavailable'});const draftUrl=base+'/sales/drafts/'+draft.json().id;
 const line={unitId:syrup.id,batchId:ordinaryBatch,locationId:room.id,quantity:1,priceMinor:syrup.priceMinor,priceVersion:syrup.priceVersion};assert.equal((await post(draftUrl+'/lines',{expectedVersion:1,lines:[line]})).statusCode,400);
 const saved=await post(draftUrl+'/lines',{expectedVersion:1,lines:[{...line,batchId:variantBatch}]});assert.equal(saved.statusCode,200,saved.body);
 const sold=await post(draftUrl+'/checkout',{expectedVersion:2,drawerId:w.drawers[0].id,tenderMinor:5000,paymentMethod:'cash',shopConfirmed:true});assert.equal(sold.statusCode,200,sold.body);
 assert.equal((await amounts()).find(x=>x.batch_id===ordinaryBatch)?.quantity,10);assert.equal((await amounts()).find(x=>x.batch_id===variantBatch)?.quantity,3);
 p=await product();body=edit();body.units.find((u:any)=>u.label==='syrup').variation=false;assert.equal((await call('PUT',base+'/catalogue/products/'+p.id,body)).statusCode,409);
 const stock=(await app.inject({url:'/api/inventory/locations/'+room.id,headers}));assert.equal(stock.statusCode,200,stock.body);assert.ok(stock.json().stocks.some((r:any)=>r.name.includes('syrup')&&r.base_unit==='syrup'));
 await t.test('named options need no shared unit, main price stays first, edits and deletion are atomic',async()=>{
  const made=await call('POST',base+'/catalogue',{name:'Colour medicine',units:[{label:'Green',baseQuantity:1,barcode:'GREEN-COLOUR',priceMinor:1000},{label:'Blue',variation:true,baseQuantity:1,barcode:'BLUE-COLOUR',priceMinor:1500}]});assert.equal(made.statusCode,201,made.body);
  const get=async()=>(await app.inject({url:base+'/catalogue?q=Colour',headers})).json().products[0];let colour=await get();assert.deepEqual(colour.units.map((u:any)=>u.label),['Green','Blue']);
  const endpoint=base+'/catalogue/products/'+colour.id;
  const fields=()=>({expectedVersion:colour.revision,name:colour.name,genericName:colour.genericName,baseUnit:colour.baseUnit,units:colour.units.map((u:any)=>({id:u.id,label:u.label,baseQuantity:u.baseQuantity,variation:u.variation,barcode:u.barcode??'',priceMinor:u.priceMinor,priceVersion:u.priceVersion}))});
  let input=fields();input.units[0].priceMinor=1200;input.units[1].priceMinor=1800;
  const edited=await call('PUT',endpoint,input);assert.equal(edited.statusCode,200,edited.body);colour=await get();assert.deepEqual(colour.units.map((u:any)=>u.priceMinor),[1200,1800]);
  const stale=fields(),green=colour.units[0],blue=colour.units[1];
  assert.equal((await call('PUT',base+'/catalogue/units/'+green.id+'/price',{expectedVersion:green.priceVersion,priceMinor:1300})).statusCode,200);
  stale.name='Must roll back';stale.units.pop();assert.equal((await call('PUT',endpoint,stale)).statusCode,409);colour=await get();assert.equal(colour.name,'Colour medicine');assert.equal(colour.units.length,2);
  assert.equal((await call('PUT',base+'/catalogue/units/'+blue.id+'/availability',{expectedVersion:blue.listingVersion,available:false})).statusCode,200);assert.equal((await get()).units.length,2);
  colour=await get();input=fields();input.units.pop();const removed=await call('PUT',endpoint,input);assert.equal(removed.statusCode,200,removed.body);colour=await get();assert.equal(colour.units.length,1);
  assert.ok(!(await app.inject({url:'/api/inventory/options',headers})).json().units.some((u:any)=>u.id===blue.id));
  assert.ok(!(await workspace()).choices.some((u:any)=>u.unitId===blue.id));
  assert.equal((await call('PUT',base+'/catalogue/units/'+blue.id+'/price',{expectedVersion:blue.priceVersion,priceMinor:1900})).statusCode,409);
  assert.equal((await post('/api/inventory/manual',{unitId:blue.id,packs:1,locationId:room.id,batchNumber:'DELETED',expiry:'2099-12-31'})).statusCode,409);
  assert.equal((await db.query('SELECT * FROM selling_units WHERE id=$1 AND archived',[blue.id])).rows.length,1);
 });

});
