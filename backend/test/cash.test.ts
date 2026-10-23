import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { openDatabase } from '../src/database.ts';
import { migrate } from '../src/migrate.ts';
import { bootstrap } from '../src/setup.ts';
import { newToken } from '../src/security.ts';
import { buildApp } from '../src/app.ts';
import { readConfig } from '../src/config.ts';

test('Sprint 6 cash accountability, closing and owner review',async t=>{
 let db;
 if(process.env.TEST_DATABASE_URL){const owner=await openDatabase({databaseUrl:process.env.TEST_DATABASE_URL,dataDir:'memory://'});const schema='cash_'+randomUUID().replaceAll('-','');await owner.exec(`CREATE SCHEMA ${schema}`);const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema}`);db=await openDatabase({databaseUrl:url.toString(),dataDir:'memory://'});t.after(async()=>{await db.close();await owner.exec(`DROP SCHEMA ${schema} CASCADE`);await owner.close();});}
 else{db=await openDatabase({dataDir:'memory://'});t.after(()=>db.close());}
 await db.exec('CREATE TABLE schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const [i,file] of ['001_accounts.sql','002_catalogue.sql','003_inventory.sql','004_supplier_documents.sql','005_sales.sql'].entries()){const sql=await readFile(new URL('../migrations/'+file,import.meta.url),'utf8');await db.exec(sql);await db.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)',[i+1,createHash('sha256').update(sql).digest('hex')]);}
 const password=newToken();await bootstrap(db,{username:'cash.admin',password,name:'Cash Admin',shops:['Tomjoy Pharmacy','Joyfrimens Pharmacy'],currency:'GHS',timezone:'Etc/GMT'});
 const firstUser=(await db.query<{id:string}>('SELECT id FROM users')).rows[0].id;
 const shopIds=(await db.query<{id:string}>('SELECT id FROM shops ORDER BY name')).rows;const shop=shopIds[0].id,otherShop=shopIds[1].id;
 const stale=randomUUID();await db.query("INSERT INTO drawer_sessions(id,shop_id,code,business_date,opening_minor,opening_source,opened_by) VALUES($1,$2,'B','2000-01-01',0,'Old empty drawer',$3)",[stale,otherShop,firstUser]);
 await migrate(db);await migrate(db);
 const app=buildApp({db,config:readConfig({NODE_ENV:'test'})});t.after(()=>app.close());
 const write={'x-requested-with':'joyfrimens',origin:'http://127.0.0.1:5173'};
 async function login(username:string,secret:string){const r=await app.inject({method:'POST',url:'/api/auth/login',headers:write,payload:{username,password:secret}});assert.equal(r.statusCode,200,r.body);return{...write,cookie:String(r.headers['set-cookie']).split(';')[0],'x-csrf-token':r.json().csrfToken};}
 const admin=await login('cash.admin',password);
 async function user(username:string,role:string){const password=newToken();const r=await app.inject({method:'POST',url:'/api/admin/users',headers:admin,payload:{username,password,name:username,role,sharedStorageAccess:false,memberships:role==='employee'?[{shopId:shop,canChangePrices:true}]:[]}});assert.equal(r.statusCode,201,r.body);return{id:r.json().id,headers:await login(username,password)};}
 const staff=await user('cash.staff','employee'),owner=await user('cash.owner','admin');
 const base=`/api/shops/${shop}/cash`,sales=`/api/shops/${shop}/sales`;
 const post=(path:string,body:object,headers=admin,shopId=shop)=>app.inject({method:'POST',url:`/api/shops/${shopId}/cash/`+path,headers,payload:{requestKey:randomUUID(),reason:'Cash accountability test',...body}});
 const salePost=(path:string,body:object,headers=admin)=>app.inject({method:'POST',url:sales+'/'+path,headers,payload:{requestKey:randomUUID(),reason:'Sales accountability test',...body}});
 const workspace=async()=>{const r=await app.inject({url:base+'/workspace',headers:admin});assert.equal(r.statusCode,200,r.body);return r.json();};
 const balance=async(id:string)=>Number((await db.query<{n:string}>('SELECT coalesce(sum(amount_minor),0)::text AS n FROM cash_ledger WHERE drawer_id=$1',[id])).rows[0].n);
 const a=(await salePost('drawers',{code:'A',openingMinor:10000,openingSource:'Owner starting float'})).json().id;
 const b=(await salePost('drawers',{code:'B',openingMinor:0,openingSource:'Empty sales drawer'})).json().id;
 const made=await app.inject({method:'POST',url:`/api/shops/${shop}/catalogue`,headers:admin,payload:{name:'Cash Test Medicine',genericName:'Cash Test Medicine',strength:'100 mg',dosageForm:'Tablet',baseUnit:'tablet',reason:'Cash tests',units:[{label:'tablet',baseQuantity:1,barcode:'',priceMinor:1000}]}});assert.equal(made.statusCode,201,made.body);
 const product=made.json().id,unit=(await db.query<{id:string}>('SELECT id FROM selling_units WHERE product_id=$1',[product])).rows[0].id;
 const shelf=(await db.query<{id:string}>("SELECT id FROM locations WHERE shop_id=$1 AND kind='shelf'",[shop])).rows[0].id;
 const received=await app.inject({method:'POST',url:'/api/inventory/receipts',headers:admin,payload:{requestKey:randomUUID(),unitId:unit,batchNumber:'CASH',expiry:'2099-12-31',supplier:'Test supplier',reference:'CASH-STOCK',expectedPacks:20,receivedPacks:20,allocations:[{locationId:shelf,quantity:20}],reason:'Test cash transactions'}});assert.equal(received.statusCode,200,received.body);
 async function basket(){const d=await salePost('drafts',{locationStatus:'unavailable',shopConfirmed:true},staff.headers);const saved=await salePost(`drafts/${d.json().id}/lines`,{expectedVersion:1,lines:[{unitId:unit,batchId:null,locationId:shelf,quantity:1,priceMinor:1000,priceVersion:1}]},staff.headers);assert.equal(saved.statusCode,200,saved.body);return saved.json();}
 async function sell(drawerId:string){const d=await basket();return salePost(`drafts/${d.id}/checkout`,{expectedVersion:d.version,drawerId,tenderMinor:1000,paymentMethod:'cash',shopConfirmed:true},staff.headers);}
 let countA='',countB='',settlement='',saleId='',otherDraft='';
 await t.test('upgrade preserves previous-day drawers and refuses shop/role/CSRF bypasses',async()=>{
  assert.equal((await db.query('SELECT id FROM drawer_sessions WHERE id=$1',[stale])).rows.length,1);
  assert.equal((await app.inject({url:`/api/shops/${otherShop}/cash/workspace`,headers:staff.headers})).statusCode,404);
  assert.equal((await app.inject({url:'/api/admin/cash/summary',headers:staff.headers})).statusCode,403);
  assert.equal((await post('categories',{name:'Denied'},staff.headers)).statusCode,403);
  assert.equal((await post('requests',{kind:'expense',amountMinor:1,payee:'Person'},{...admin,'x-csrf-token':'wrong'})).statusCode,403);
  assert.equal((await post('counts/start',{drawerId:stale,alternateId:null,transferMinor:0},staff.headers)).statusCode,404);
  assert.equal((await workspace()).drawers.length,2);
 });
 await t.test('categories are snapshotted on sale lines and changing them cannot rewrite receipts',async()=>{
  const category=await post('categories',{name:'Special medicines'});assert.equal(category.statusCode,200,category.body);
  assert.equal((await post('categories/assign',{productId:product,categoryId:category.json().id,expectedVersion:0})).statusCode,200);
  const sold=await sell(a);assert.equal(sold.statusCode,200,sold.body);saleId=sold.json().id;
  const next=await post('categories',{name:'New category'});assert.equal((await post('categories/assign',{productId:product,categoryId:next.json().id,expectedVersion:1})).statusCode,200);
  assert.equal((await post('categories/assign',{productId:product,categoryId:next.json().id,expectedVersion:1})).statusCode,409);
  assert.equal((await db.query<{category_name:string}>('SELECT category_name FROM sale_lines WHERE sale_id=$1',[saleId])).rows[0].category_name,'Special medicines');
  assert.equal((await workspace()).categoryTotals[0].gross_minor,'1000');assert.equal(await balance(a),11000);
 });
 await t.test('approval does not move money; one approved payment deducts once even with another key',async()=>{
  const r=await post('requests',{kind:'expense',amountMinor:500,payee:'Shop supplies'},staff.headers);const requestId=r.json().id;
  assert.equal((await post('disbursements',{requestId,drawerId:a,emergency:false},staff.headers)).statusCode,409);
  assert.equal((await post('decisions',{requestId,approved:true},staff.headers)).statusCode,403);
  assert.equal((await post('decisions',{requestId,approved:true})).statusCode,200);assert.equal(await balance(a),11000);
  const payload={requestId,drawerId:a,emergency:false,requestKey:randomUUID()};const paid=await post('disbursements',payload,staff.headers);assert.equal(paid.statusCode,200,paid.body);
  assert.deepEqual((await post('disbursements',payload,staff.headers)).json(),paid.json());
  assert.equal((await post('disbursements',{...payload,requestKey:randomUUID()},staff.headers)).statusCode,409);assert.equal(await balance(a),10500);
 });
 await t.test('emergency cash is deducted immediately and remains visible for owner review',async()=>{
  const r=await post('requests',{kind:'advance',amountMinor:500,payee:'Cash staff'},staff.headers),requestId=r.json().id;
  assert.equal((await post('disbursements',{requestId,drawerId:a,emergency:true},staff.headers)).statusCode,200);assert.equal(await balance(a),10000);
  assert.equal((await workspace()).requests.find((r:{id:string})=>r.id===requestId).emergency,true);
  assert.equal((await post('decisions',{requestId,approved:true})).statusCode,200);assert.equal(await balance(a),10000);
 });
 await t.test('cash switch transfers float before immutable cutoff and blocks writes into counted drawer',async()=>{
  assert.equal((await post('transfers',{sourceId:a,destinationId:b,amountMinor:10001})).statusCode,409);assert.equal(await balance(b),0);
  const started=await post('counts/start',{drawerId:a,alternateId:b,transferMinor:2000});assert.equal(started.statusCode,200,started.body);countA=started.json().id;
  assert.equal((await post('counts/start',{drawerId:a,alternateId:b,transferMinor:2000})).json().id,countA);assert.equal(await balance(a),8000);assert.equal(await balance(b),2000);
  assert.equal((await sell(a)).statusCode,409);const sold=await sell(b);assert.equal(sold.statusCode,200,sold.body);assert.equal(await balance(b),3000);
  const c=(await workspace()).counts.find((c:{id:string})=>c.id===countA);assert.equal(c.expected_minor,'8000');
  assert.equal((await post('transfers',{sourceId:a,destinationId:b,amountMinor:1})).statusCode,409);
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10);const nextReport=(await app.inject({url:base+'/workspace?date='+tomorrow,headers:admin})).json();assert.equal(nextReport.previousLateSales.length,1);assert.equal(nextReport.previousLateSales[0].total_minor,1000);assert.equal(nextReport.categoryTotals.length,0);
  const r=await post('requests',{kind:'withdrawal',amountMinor:1,payee:'Owner payee'});await post('decisions',{requestId:r.json().id,approved:true});assert.equal((await post('disbursements',{requestId:r.json().id,drawerId:a,emergency:false})).statusCode,409);
 });
 await t.test('denomination observations preserve shortages and overages separately',async()=>{
  assert.equal((await post('counts/submit',{countId:countA,denominations:[{valueMinor:100,quantity:1},{valueMinor:100,quantity:78}]},staff.headers)).statusCode,400);
  const submitted=await post('counts/submit',{countId:countA,denominations:[{valueMinor:100,quantity:79}]},staff.headers);assert.equal(submitted.statusCode,200,submitted.body);assert.equal(submitted.json().varianceMinor,undefined);assert.equal(await balance(a),8000);
  assert.equal((await post('counts/submit',{countId:countA,denominations:[{valueMinor:100,quantity:80}]})).statusCode,409);
  countB=(await post('counts/start',{drawerId:b,alternateId:null,transferMinor:0},staff.headers)).json().id;
  const over=await post('counts/submit',{countId:countB,denominations:[{valueMinor:100,quantity:31}]},staff.headers);assert.equal(over.statusCode,200,over.body);assert.equal(over.json().varianceMinor,undefined);
  const variances=(await workspace()).counts.map((c:{variance_minor:string})=>c.variance_minor).sort();assert.deepEqual(variances,['-100','100']);
  assert.equal((await post('counts/review',{countId:countA},staff.headers)).statusCode,403);assert.equal((await post('counts/review',{countId:countA})).statusCode,200);
 });
 await t.test('closing allocates actual count, requires named recipient, and reuses retained cash once',async()=>{
  assert.equal((await post('counts/close',{countId:countA,handoverMinor:8000,recipientId:owner.id})).statusCode,400);
  assert.equal((await post('counts/close',{countId:countA,handoverMinor:7000,recipientId:firstUser})).statusCode,400);
  const closed=await post('counts/close',{countId:countA,handoverMinor:7000,recipientId:owner.id});assert.equal(closed.statusCode,200,closed.body);settlement=closed.json().id;assert.equal(closed.json().retainedMinor,900);assert.equal(await balance(a),100);
  assert.equal((await post('handovers/acknowledge',{settlementId:settlement})).statusCode,403);
  assert.equal((await post('handovers/acknowledge',{settlementId:settlement},owner.headers)).statusCode,200);
  const results=await Promise.all([post('retained/open',{settlementId:settlement,code:'A'}),post('retained/open',{settlementId:settlement,code:'A'},owner.headers)]);assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);
  const fresh=results.find(r=>r.statusCode===200)!.json().id;assert.equal(await balance(fresh),900);
  const report=(await app.inject({url:'/api/admin/cash/summary',headers:admin})).json().shops.find((s:{id:string})=>s.id===shop);assert.equal(report.retained_minor,'0');assert.equal(report.pending_handover_minor,'0');assert.equal(report.sales_minor,'2000');
 });
 await t.test('previous GMT day rejects checkout before stock or cash is posted',async()=>{
  const location=(await db.query<{id:string}>("SELECT id FROM locations WHERE shop_id=$1 AND kind='shelf'",[otherShop])).rows[0].id;
  const receivedOther=await app.inject({method:'POST',url:'/api/inventory/receipts',headers:admin,payload:{requestKey:randomUUID(),unitId:unit,batchNumber:'OTHER-CASH',expiry:'2099-12-31',supplier:'Test supplier',reference:'OTHER-CASH',expectedPacks:5,receivedPacks:5,allocations:[{locationId:location,quantity:5}],reason:'Test other shop stock'}});assert.equal(receivedOther.statusCode,200,receivedOther.body);
  const prefix=`/api/shops/${otherShop}/sales`;
  const d=await app.inject({method:'POST',url:prefix+'/drafts',headers:admin,payload:{requestKey:randomUUID(),reason:'Open other shop test basket',locationStatus:'unavailable',shopConfirmed:true}});otherDraft=d.json().id;
  const saved=await app.inject({method:'POST',url:prefix+'/drafts/'+otherDraft+'/lines',headers:admin,payload:{requestKey:randomUUID(),reason:'Save other shop basket',expectedVersion:1,lines:[{unitId:unit,batchId:null,locationId:location,quantity:1,priceMinor:1000,priceVersion:1}]}});assert.equal(saved.statusCode,200,saved.body);
  const result=await app.inject({method:'POST',url:prefix+'/drafts/'+otherDraft+'/checkout',headers:admin,payload:{requestKey:randomUUID(),reason:'Stale drawer blocked',expectedVersion:2,drawerId:stale,tenderMinor:1000,paymentMethod:'cash',shopConfirmed:true}});assert.equal(result.statusCode,409,result.body);assert.match(result.json().message,/another GMT day/);assert.equal(await balance(stale),0);
 });
 await t.test('manual days cannot hide previous normal sales or duplicate numbered receipts',async()=>{
  const day=new Date().toISOString().slice(0,10);
  assert.equal((await post('manual-days',{businessDate:day})).statusCode,409);
  assert.equal((await post('manual-days',{businessDate:'2000-01-01'},admin,otherShop)).statusCode,400);
  const approved=await post('manual-days',{businessDate:day},admin,otherShop);assert.equal(approved.statusCode,200,approved.body);const dayId=approved.json().id;
  const opened=await app.inject({method:'POST',url:`/api/shops/${otherShop}/sales/drawers`,headers:admin,payload:{requestKey:randomUUID(),reason:'Manual day opening',code:'A',openingMinor:100,openingSource:'Owner manual-day float'}});assert.equal(opened.statusCode,200,opened.body);const manualDrawer=opened.json().id;
  const normal=await app.inject({method:'POST',url:`/api/shops/${otherShop}/sales/drafts/${otherDraft}/checkout`,headers:admin,payload:{requestKey:randomUUID(),reason:'Prevent double entry of paper sales',expectedVersion:2,drawerId:manualDrawer,tenderMinor:1000,paymentMethod:'cash',shopConfirmed:true}});assert.equal(normal.statusCode,409,normal.body);assert.match(normal.json().message,/exception day/);
  const payload={dayId,drawerId:manualDrawer,reference:'PAPER-001',salesMinor:5000,refundsMinor:500};const entry=await post('manual-receipts',payload,admin,otherShop);assert.equal(entry.statusCode,200,entry.body);assert.equal(await balance(manualDrawer),4600);
  assert.equal((await post('manual-receipts',payload,owner.headers,otherShop)).statusCode,409);assert.equal(await balance(manualDrawer),4600);
  assert.equal((await post('manual-days/review',{dayId,evidence:'Stock count references'},admin,otherShop)).statusCode,409);
  const report=(await app.inject({url:`/api/shops/${otherShop}/cash/workspace`,headers:admin})).json();assert.equal(report.categoryTotals[0].gross_minor,'5000');assert.equal(report.categoryTotals[0].refunds_minor,'500');
  const manualCount=(await post('counts/start',{drawerId:manualDrawer,alternateId:null,transferMinor:0},admin,otherShop)).json().id;
  assert.equal((await post('counts/submit',{countId:manualCount,denominations:[{valueMinor:100,quantity:46}]},admin,otherShop)).statusCode,200);
  assert.equal((await post('counts/review',{countId:manualCount},admin,otherShop)).statusCode,200);
  assert.equal((await post('counts/close',{countId:manualCount,handoverMinor:0,recipientId:null},admin,otherShop)).statusCode,200);
  assert.equal((await post('manual-days/review',{dayId,evidence:'Paper receipts and shelf/storeroom stock count references retained by owner'},admin,otherShop)).statusCode,200);
  assert.equal((await post('manual-receipts',{...payload,reference:'LATE-PAPER'},admin,otherShop)).statusCode,409);
  assert.equal((await db.query<{n:number}>('SELECT count(*)::int AS n FROM sales WHERE shop_id=$1',[otherShop])).rows[0].n,0);
 });
 await t.test('cash histories and lifecycle cannot be silently rewritten and authorization revokes immediately',async()=>{
  for(const sql of ['DELETE FROM drawer_counts','UPDATE cash_count_submissions SET counted_minor=1','DELETE FROM cash_decisions','DELETE FROM cash_settlements','DELETE FROM manual_receipts',"UPDATE drawer_sessions SET status='open' WHERE status='closed'",'UPDATE sale_lines SET category_name=\'Changed\''])await assert.rejects(db.exec(sql));
  const before=await db.query("SELECT sum(amount_minor)::text AS amount FROM cash_ledger WHERE kind IN ('transfer_in','transfer_out')");assert.equal(before.rows[0].amount,'0');
  await app.inject({method:'PUT',url:`/api/admin/users/${staff.id}/access`,headers:admin,payload:{memberships:[],sharedStorageAccess:false}});
  assert.equal((await post('requests',{kind:'expense',amountMinor:1,payee:'Revoked staff'},staff.headers)).statusCode,404);
 });
});

