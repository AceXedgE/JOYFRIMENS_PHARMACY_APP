import { legacyCatalogue } from './legacy-catalogue.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { openDatabase } from '../src/database.ts';
import { migrate, SCHEMA_VERSION } from '../src/migrate.ts';
import { bootstrap } from '../src/setup.ts';
import { newToken } from '../src/security.ts';
import { buildApp } from '../src/app.ts';
import { readConfig } from '../src/config.ts';

test('Sprint 5 cash sales, shop-bound drafts and controlled refunds', async t => {
  let db;
  if (process.env.TEST_DATABASE_URL) {
    const owner = await openDatabase({ databaseUrl: process.env.TEST_DATABASE_URL, dataDir: 'memory://' });
    const schema = `sales_${randomUUID().replaceAll('-', '')}`; await owner.exec(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL); url.searchParams.set('options', `-c search_path=${schema}`);
    db = await openDatabase({ databaseUrl: url.toString(), dataDir: 'memory://' });
    t.after(async () => { await db.close(); await owner.exec(`DROP SCHEMA ${schema} CASCADE`); await owner.close(); });
  } else { db = await openDatabase({ dataDir: 'memory://' }); t.after(() => db.close()); }
  await db.exec('CREATE TABLE schema_migrations(version integer PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  for (const [index, file] of ['001_accounts.sql','002_catalogue.sql','003_inventory.sql','004_supplier_documents.sql'].entries()) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'); await db.exec(sql);
    await db.query('INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)', [index + 1, createHash('sha256').update(sql).digest('hex')]);
  }
  const password = newToken(); await bootstrap(db, { username: 'sales.admin', password, name: 'Sales Admin', shops: ['Tomjoy Pharmacy','Joyfrimens Pharmacy'], currency: 'GHS', timezone: 'Etc/GMT' });
  const app = buildApp({ db, config: readConfig({ NODE_ENV: 'test' }) }); t.after(() => app.close());
  const write = { 'x-requested-with': 'joyfrimens', origin: 'http://127.0.0.1:5173' };
  async function login(username: string, secret: string) { const r = await app.inject({ method: 'POST', url: '/api/auth/login', headers: write, payload: { username, password: secret } }); assert.equal(r.statusCode,200,r.body); return { ...write, cookie: String(r.headers['set-cookie']).split(';')[0], 'x-csrf-token': r.json().csrfToken }; }
  const admin = await login('sales.admin', password);
  const shops = (await db.query<{id:string}>('SELECT id FROM shops ORDER BY code')).rows;
  const shop1 = shops[0].id, shop2 = shops[1].id;
  const base = `/api/shops/${shop1}/sales`;
  const options = (await app.inject({ url:'/api/inventory/options',headers:admin })).json();
  const shelf = options.locations.find((l: { shop_id: string; kind: string }) => l.shop_id===shop1 && l.kind==='shelf').id;
  const store = options.locations.find((l: { shop_id: string; kind: string }) => l.shop_id===shop1 && l.kind==='storeroom').id;
  const other = options.locations.find((l: { shop_id: string; kind: string }) => l.shop_id===shop2 && l.kind==='shelf').id;
  const main = options.locations.find((l: { kind: string }) => l.kind==='shared').id;
  await legacyCatalogue(db, 'Sales Medicine', 'Demo', [{label:'tablet',quantity:1,price:125},{label:'box',quantity:14,price:1500}]);
  const product = (await app.inject({ url:`/api/shops/${shop1}/catalogue`,headers:admin })).json().products[0];
  const single = product.units.find((u: { label: string }) => u.label==='tablet'), box = product.units.find((u: { label: string }) => u.label==='box');
  const received = await app.inject({method:'POST',url:'/api/inventory/receipts',headers:admin,payload:{requestKey:randomUUID(),unitId:single.id,supplier:'Test supplier',reference:'STOCK',batchNumber:'SALE-LOT',expiry:'2099-12-31',expectedPacks:230,receivedPacks:230,allocations:[{locationId:shelf,quantity:100},{locationId:store,quantity:100},{locationId:other,quantity:20},{locationId:main,quantity:10}],reason:'Existing Sprint 4 stock'}}); assert.equal(received.statusCode,200,received.body);
  const batchId=received.json().batchId;
  await migrate(db); await migrate(db);
  const staffSecret=newToken(); const staffResponse=await app.inject({method:'POST',url:'/api/admin/users',headers:admin,payload:{username:'sales.staff',name:'Cashier',password:staffSecret,role:'employee',sharedStorageAccess:false,memberships:[{shopId:shop1,canChangePrices:false}]}});assert.equal(staffResponse.statusCode,201);
  const staff=await login('sales.staff',staffSecret);
  const post=(path:string,payload:object,headers=admin)=>app.inject({method:'POST',url:base+path,headers,payload});
  const work=async(headers=admin)=>(await app.inject({url:base+'/workspace',headers})).json();
  const balance=async(location:string)=>(await db.query<{quantity:number}>('SELECT coalesce((SELECT quantity FROM stock_balances WHERE location_id=$1 AND batch_id=$2),0)::integer AS quantity',[location,batchId])).rows[0].quantity;
  const line=(locationId=shelf,quantity=1,unit=single)=>({unitId:unit.id,batchId:locationId===shelf?null:batchId,locationId,quantity,priceMinor:unit.priceMinor,priceVersion:unit.priceVersion});
  async function draft(lines: ReturnType<typeof line>[],headers=staff) {
    const opened=await post('/drafts',{requestKey:randomUUID(),reason:'Open test basket',locationStatus:'unavailable',shopConfirmed:true},headers);assert.equal(opened.statusCode,200,opened.body);
    const result=await post(`/drafts/${opened.json().id}/lines`,{requestKey:randomUUID(),reason:'Save test basket',expectedVersion:1,lines},headers);assert.equal(result.statusCode,200,result.body);return result.json();
  }
  let drawerId='',saleId='';
  const checkout=(d:{id:string;version:number}, tenderMinor=10000)=>({requestKey:randomUUID(),reason:'Complete verified cash sale',expectedVersion:d.version,drawerId,tenderMinor,paymentMethod:'cash',shopConfirmed:true});
  await t.test('migration preserves existing stock and catalogue',async()=>{
    assert.equal((await db.query('SELECT * FROM schema_migrations')).rows.length,SCHEMA_VERSION);assert.equal(await balance(shelf),0);assert.equal((await db.query('SELECT * FROM stock_receipts')).rows.length,1);assert.equal((await work()).choices.length,4);
  });
  await t.test('sales lookup shares catalogue spelling ranks and never approximates numeric strengths', async () => {
    const search = async (q: string) => (await app.inject({ url: base + '/workspace?q=' + encodeURIComponent(q), headers: staff })).json().choices;
    assert.equal((await search('Sales Medicine'))[0].match, 'exact');
    assert.equal((await search('Sales Medicne'))[0].match, 'suggestion');
    assert.equal((await search('Sales Medicne 550 mg')).length, 0);
    assert.equal((await search('unknownmedicine')).length, 0);
  });
  await t.test('opening float is admin-only, idempotent, and separate from revenue',async()=>{
    const body={requestKey:randomUUID(),reason:'Owner supplied starting cash',code:'B',openingMinor:10000,openingSource:'Owner supplied cash for change'};
    assert.equal((await post('/drawers',body,staff)).statusCode,403);
    const opened=await post('/drawers',body);assert.equal(opened.statusCode,200,opened.body);drawerId=opened.json().id;
    assert.deepEqual((await post('/drawers',body)).json(),opened.json());assert.equal((await post('/drawers',{...body,requestKey:randomUUID()})).statusCode,409);
    assert.equal((await work()).drawers[0].expected_minor,'10000');assert.equal((await db.query('SELECT * FROM sales')).rows.length,0);
  });
  await t.test('location confirmation, shop isolation, ownership, parking and stale draft versions',async()=>{
    assert.equal((await post('/drafts',{requestKey:randomUUID(),reason:'No shop confirmation',locationStatus:'unavailable',shopConfirmed:false},staff)).statusCode,400);
    const d=await draft([line()]);
    assert.equal((await app.inject({method:'POST',url:`/api/shops/${shop2}/sales/drafts/${d.id}/lines`,headers:admin,payload:{requestKey:randomUUID(),reason:'Wrong shop',expectedVersion:d.version,lines:[line()]}})).statusCode,404);
    assert.equal((await post(`/drafts/${d.id}/lines`,{requestKey:randomUUID(),reason:'Wrong account',expectedVersion:d.version,lines:[line()]},admin)).statusCode,404);
    for(const source of [main,other])assert.equal((await post(`/drafts/${d.id}/lines`,{requestKey:randomUUID(),reason:'Forbidden stock source',expectedVersion:d.version,lines:[line(source)]},staff)).statusCode,400);
    const parked=await post(`/drafts/${d.id}/state`,{requestKey:randomUUID(),reason:'Park before shop switch',expectedVersion:d.version,action:'park',shopConfirmed:true},staff);assert.equal(parked.statusCode,200);
    assert.equal((await post(`/drafts/${d.id}/checkout`,checkout(parked.json()),staff)).statusCode,400);
    assert.equal((await post(`/drafts/${d.id}/lines`,{requestKey:randomUUID(),reason:'Stale basket save',expectedVersion:d.version,lines:[]},staff)).statusCode,409);
    const resumed=await post(`/drafts/${d.id}/state`,{requestKey:randomUUID(),reason:'Resume at original shop',expectedVersion:parked.json().version,action:'resume',shopConfirmed:true},staff);assert.equal(resumed.statusCode,200);assert.equal(resumed.json().lines.length,1);
    await post(`/drafts/${d.id}/state`,{requestKey:randomUUID(),reason:'Discard unused basket',expectedVersion:resumed.json().version,action:'discard',shopConfirmed:true},staff);
    assert.equal(await balance(shelf),0);
  });
  await t.test('mixed shelf/storeroom sale posts exact pack prices, stock, cash, receipt and change once',async()=>{
    const d=await draft([line(shelf,2,box),line(store,3)]);const body=checkout(d,5000);
    assert.equal((await post(`/drafts/${d.id}/checkout`,{...body,tenderMinor:3000},staff)).statusCode,400);
    assert.equal((await post(`/drafts/${d.id}/checkout`,{...body,paymentMethod:'card'},staff)).statusCode,400);
    assert.equal((await post(`/drafts/${d.id}/checkout`,{...body,drawerId:randomUUID()},staff)).statusCode,409);
    assert.equal(await balance(shelf),0);assert.equal((await db.query('SELECT * FROM sales')).rows.length,0);
    const result=await post(`/drafts/${d.id}/checkout`,body,staff);assert.equal(result.statusCode,200,result.body);saleId=result.json().id;
    assert.equal(result.json().totalMinor,3375);assert.equal(result.json().changeMinor,1625);
    assert.equal(await balance(shelf),0);assert.equal(await balance(store),97);assert.equal((await work()).drawers[0].expected_minor,'13375');
    assert.deepEqual((await post(`/drafts/${d.id}/checkout`,body,staff)).json(),result.json());assert.equal((await post(`/drafts/${d.id}/checkout`,{...body,requestKey:randomUUID()},staff)).statusCode,409);
    assert.equal((await db.query('SELECT * FROM sales')).rows.length,1);assert.equal((await db.query("SELECT * FROM cash_ledger WHERE kind='sale'")).rows.length,1);
    assert.equal((await app.inject({url:`${base}/receipts/${saleId}`,headers:staff})).statusCode,403);const receipt=await app.inject({url:`${base}/receipts/${saleId}`,headers:admin});assert.equal(receipt.statusCode,200);assert.equal(receipt.json().lines.length,2);
    assert.equal((await app.inject({url:`/api/shops/${shop2}/sales/receipts/${saleId}`,headers:admin})).statusCode,404);
  });
  await t.test('stale prices fail until explicitly requoted; original receipt values remain unchanged',async()=>{
    const d=await draft([line()]);
    const price=await app.inject({method:'PUT',url:`/api/shops/${shop1}/catalogue/units/${single.id}/price`,headers:admin,payload:{priceMinor:200,expectedVersion:1,reason:'New shared price'}});assert.equal(price.statusCode,200);
    assert.equal((await post(`/drafts/${d.id}/checkout`,checkout(d),staff)).statusCode,409);assert.equal(await balance(shelf),0);
    const updated=await post(`/drafts/${d.id}/lines`,{requestKey:randomUUID(),reason:'Accept current displayed price',expectedVersion:d.version,lines:[{...line(),priceMinor:200,priceVersion:2}]},staff);assert.equal(updated.statusCode,200);
    const sale=await post(`/drafts/${d.id}/checkout`,checkout(updated.json()),staff);assert.equal(sale.statusCode,200);assert.equal(sale.json().totalMinor,200);
    const receipt=(await app.inject({url:`${base}/receipts/${saleId}`,headers:admin})).json();assert.equal(receipt.sale.total_minor,3375);assert.equal(receipt.lines.find((l:{unit_id:string})=>l.unit_id===single.id).price_minor,125);
    single.priceMinor=200;single.priceVersion=2;
  });
  await t.test('storeroom deductions are atomic and reservations cannot be sold',async()=>{
    const before=await balance(store);const d=await draft([line(store,6,box),line(store,14)]);
    assert.equal((await post(`/drafts/${d.id}/checkout`,checkout(d,20000),staff)).statusCode,409);assert.equal(await balance(store),before);
    await db.query('UPDATE stock_balances SET reserved=96 WHERE location_id=$1 AND batch_id=$2',[store,batchId]);
    const a=await draft([line(store,1)],staff),b=await draft([line(store,1)],admin);
    const results=await Promise.all([post(`/drafts/${a.id}/checkout`,checkout(a),staff),post(`/drafts/${b.id}/checkout`,checkout(b),admin)]);
    assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);assert.equal(await balance(store),96);assert.equal(await balance(shelf),0);
    await db.query('UPDATE stock_balances SET reserved=0 WHERE location_id=$1 AND batch_id=$2',[store,batchId]);
  });
  await t.test('refunds require admins, use original prices, preserve history and never exceed sold quantities',async()=>{
    const receipt=(await app.inject({url:`${base}/receipts/${saleId}`,headers:admin})).json();
    const sold=receipt.lines.find((l:{unit_id:string})=>l.unit_id===single.id);
    const refund={requestKey:randomUUID(),reason:'Returned one intact unit after review',drawerId,lines:[{saleLineId:sold.id,quantity:1,disposition:'restock',restockConfirmed:true}]};
    assert.equal((await post(`/receipts/${saleId}/refunds`,refund,staff)).statusCode,403);
    assert.equal((await post(`/receipts/${saleId}/refunds`,{...refund,lines:[{...refund.lines[0],restockConfirmed:false}]})).statusCode,400);
    const before=await balance(store);const result=await post(`/receipts/${saleId}/refunds`,refund);assert.equal(result.statusCode,200,result.body);assert.equal(result.json().amountMinor,125);assert.equal(await balance(store),before+1);
    assert.deepEqual((await post(`/receipts/${saleId}/refunds`,refund)).json(),result.json());assert.equal(await balance(store),before+1);
    const rest={...refund,requestKey:randomUUID(),reason:'Remaining returned units quarantined',lines:[{...refund.lines[0],quantity:2,disposition:'quarantine',restockConfirmed:false}]};
    const concurrent=await Promise.all([post(`/receipts/${saleId}/refunds`,rest),post(`/receipts/${saleId}/refunds`,{...rest,requestKey:randomUUID()})]);assert.deepEqual(concurrent.map(r=>r.statusCode).sort(),[200,409]);
    assert.equal(await balance(store),before+1);
    const history=(await app.inject({url:`${base}/receipts/${saleId}`,headers:admin})).json();assert.equal(history.lines.find((l:{id:string})=>l.id===sold.id).refunded_quantity,3);assert.equal(history.refunds.length,2);assert.equal(history.sale.total_minor,3375);
    const emptyDrawer=await post('/drawers',{requestKey:randomUUID(),reason:'Zero cash drawer',code:'A',openingMinor:0,openingSource:'No opening cash'});
    const boxLine=receipt.lines.find((l:{unit_id:string})=>l.unit_id===box.id);
    assert.equal((await post(`/receipts/${saleId}/refunds`,{...refund,requestKey:randomUUID(),drawerId:emptyDrawer.json().id,lines:[{...refund.lines[0],saleLineId:boxLine.id}]})).statusCode,409);
  });
  await t.test('sale-only price exceptions preserve catalogue prices and refund the actual recorded amount',async()=>{
    const d=await draft([line(shelf,3)]);
    const save=async(extra:object)=>post(`/drafts/${d.id}/lines`,{requestKey:randomUUID(),reason:'Record price exception',expectedVersion:d.version,lines:[{...line(shelf,3),...extra}]},staff);
    assert.equal((await save({chargedMinor:600})).statusCode,400);
    assert.equal((await save({chargedMinor:700,exceptionReason:'shortfall'})).statusCode,400);
    assert.equal((await save({chargedMinor:500,exceptionReason:'no_change'})).statusCode,400);
    const saved=await save({chargedMinor:500});assert.equal(saved.statusCode,200,saved.body);
    const result=await post(`/drafts/${d.id}/checkout`,{requestKey:randomUUID(),reason:'Confirm medicines sold',expectedVersion:saved.json().version,shopConfirmed:true},staff);assert.equal(result.statusCode,200,result.body);assert.equal(result.json().totalMinor,500);
    const recorded=(await app.inject({url:base+'/receipts/'+result.json().id,headers:admin})).json();assert.equal(recorded.lines[0].price_minor,200);assert.equal(recorded.lines[0].total_minor,500);assert.equal(recorded.lines[0].price_exception_reason,'shortfall');
    for(const [quantity,expected] of [[1,166],[2,334]]){const refund=await post('/receipts/'+result.json().id+'/refunds',{requestKey:randomUUID(),reason:'Refund actual paid amount',drawerId,lines:[{saleLineId:recorded.lines[0].id,quantity,disposition:'quarantine',restockConfirmed:false}]});assert.equal(refund.statusCode,200,refund.body);assert.equal(refund.json().amountMinor,expected);}
    const more=await draft([{...line(),chargedMinor:250}]);const over=await post('/drafts/'+more.id+'/checkout',{requestKey:randomUUID(),reason:'No change; extra amount recorded',expectedVersion:more.version,shopConfirmed:true},staff);assert.equal(over.statusCode,200,over.body);assert.equal(over.json().totalMinor,250);
    assert.equal((await db.query('SELECT price_minor FROM unit_prices WHERE unit_id=$1',[single.id])).rows[0].price_minor,200);
    assert.equal((await db.query('SELECT * FROM sale_price_exceptions')).rows.length,2);
    await assert.rejects(db.exec('DELETE FROM sale_price_exceptions'));
  });
  await t.test('expired stock, unavailable listings, CSRF and revoked access fail closed',async()=>{
    const d=await draft([line()]);
    assert.equal((await post(`/drafts/${d.id}/checkout`,checkout(d),{...write,cookie:staff.cookie} as typeof staff)).statusCode,403);
    await app.inject({method:'PUT',url:`/api/shops/${shop1}/catalogue/units/${single.id}/availability`,headers:admin,payload:{available:false,expectedVersion:1,reason:'Withdraw unit from sale'}});
    assert.equal((await post(`/drafts/${d.id}/checkout`,checkout(d),staff)).statusCode,400);
    await app.inject({method:'PUT',url:`/api/shops/${shop1}/catalogue/units/${single.id}/availability`,headers:admin,payload:{available:true,expectedVersion:2,reason:'Restore unit listing'}});
    const expired=randomUUID();await db.query('INSERT INTO stock_batches(id,product_id,batch_number,expiry) VALUES($1,$2,$3,$4)',[expired,product.id,'EXPIRED-SALE','2000-01-01']);
    assert.equal((await post(`/drafts/${d.id}/lines`,{requestKey:randomUUID(),reason:'Expired batch cannot sell',expectedVersion:d.version,lines:[{...line(store),batchId:expired}]},staff)).statusCode,409);
    await app.inject({method:'PUT',url:`/api/admin/users/${staffResponse.json().id}/access`,headers:admin,payload:{memberships:[],sharedStorageAccess:false}});
    assert.equal((await post(`/drafts/${d.id}/checkout`,checkout(d),staff)).statusCode,404);
    assert.equal((await app.inject({url:base+'/workspace',headers:staff})).statusCode,404);
  });
  await t.test('posted sales, stock, cash, refunds and finalized draft identity cannot be rewritten',async()=>{
    for(const sql of ['UPDATE drawer_sessions SET opening_minor=1','DELETE FROM drawer_sessions','DELETE FROM sales','UPDATE sale_lines SET price_minor=1','DELETE FROM cash_ledger','DELETE FROM sale_refunds','DELETE FROM sale_refund_lines',"UPDATE sale_drafts SET status='open' WHERE status='completed'"])await assert.rejects(db.exec(sql));
    const cash=(await db.query<{n:string}>("SELECT sum(amount_minor)::text AS n FROM cash_ledger WHERE kind='sale'")).rows[0].n;
    assert.equal(cash,(await db.query<{n:string}>('SELECT sum(total_minor)::text AS n FROM sales')).rows[0].n);
    assert.equal((await db.query('SELECT * FROM stock_operations')).rows.length,(await db.query("SELECT * FROM audit_events WHERE action LIKE 'inventory.%'")).rows.length);
  });
});
