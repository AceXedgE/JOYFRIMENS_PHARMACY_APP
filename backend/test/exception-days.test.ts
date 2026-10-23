import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../src/database.ts';
import { migrate } from '../src/migrate.ts';
import { bootstrap } from '../src/setup.ts';
import { newToken } from '../src/security.ts';
import { buildApp } from '../src/app.ts';
import { readConfig } from '../src/config.ts';

test('exception-day totals and external change reconcile without inventing medicine sales',async t=>{
 const db=await openDatabase({dataDir:'memory://'});t.after(()=>db.close());await migrate(db);
 const password=newToken();await bootstrap(db,{username:'exception.admin',password,name:'Exception Admin',shops:['Tomjoy','Joyfrimens'],currency:'GHS',timezone:'Etc/GMT'});
 const app=buildApp({db,config:readConfig({NODE_ENV:'test'})});t.after(()=>app.close());
 async function login(username:string,password:string){const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{'x-requested-with':'joyfrimens'},payload:{username,password}});assert.equal(r.statusCode,200,r.body);return{'x-requested-with':'joyfrimens','x-csrf-token':r.json().csrfToken,cookie:String(r.headers['set-cookie']).split(';')[0]};}
 const admin=await login('exception.admin',password),shops=(await app.inject({url:'/api/shops',headers:admin})).json().shops,shop=shops[0].id,other=shops[1].id;
 const staffPassword=newToken();const created=await app.inject({method:'POST',url:'/api/admin/users',headers:admin,payload:{username:'exception.staff',password:staffPassword,name:'Exception Staff',role:'employee',memberships:[{shopId:shop,canChangePrices:false,canCountCash:true}],sharedStorageAccess:false}});assert.equal(created.statusCode,201,created.body);
 const staff=await login('exception.staff',staffPassword),day='/api/shops/'+shop+'/day',today=new Date().toISOString().slice(0,10);
 const post=(path:string,body:object,headers=admin,key=randomUUID())=>app.inject({method:'POST',url:path,headers,payload:{requestKey:key,...body}});
 const get=async(headers=admin)=>(await app.inject({url:day,headers})).json();
 for(const [path,body] of [['exception-date',{businessDate:today}],['exception-total',{salesMinor:50000}],['money-in',{amountMinor:2000}]] as const){assert.equal((await post(day+'/'+path,{...body,reason:'Attempt restricted action'},staff)).statusCode,403);}
 assert.equal((await post(day+'/money-in',{amountMinor:2000})).statusCode,409);
 const mark=await post(day+'/exception-date',{businessDate:today});assert.equal(mark.statusCode,200,mark.body);
 assert.equal((await post(day+'/exception-date',{businessDate:today})).statusCode,409);
 const nextDate=new Date(Date.now()+86400000).toISOString().slice(0,10);assert.equal((await post('/api/shops/'+other+'/day/exception-date',{businessDate:nextDate})).statusCode,200);
 const opened=await post(day+'/open',{openingMinor:10000});assert.equal(opened.statusCode,200,opened.body);
 const made=await app.inject({method:'POST',url:'/api/shops/'+shop+'/catalogue',headers:admin,payload:{name:'Exception medicine',genericName:'Exception medicine',strength:'Demo',dosageForm:'Tablet',baseUnit:'tablet',units:[{label:'tablet',baseQuantity:1,barcode:'',priceMinor:100}]}});assert.equal(made.statusCode,201,made.body);
 const workspace=(await app.inject({url:'/api/shops/'+shop+'/sales/workspace',headers:staff})).json();assert.equal(workspace.exceptionDay,true);
 const choice=workspace.choices[0],sales='/api/shops/'+shop+'/sales';
 const draft=await post(sales+'/drafts',{shopConfirmed:true,locationStatus:'unavailable',reason:'Open ticket'},staff);
 const lines=await post(sales+'/drafts/'+draft.json().id+'/lines',{expectedVersion:1,lines:[{unitId:choice.unitId,batchId:null,locationId:choice.locationId,quantity:1,priceMinor:100,priceVersion:1}],reason:'Save ticket'},staff);assert.equal(lines.statusCode,200,lines.body);
 assert.equal((await post(sales+'/drafts/'+draft.json().id+'/checkout',{expectedVersion:2,shopConfirmed:true,reason:'Confirm ticket'},staff)).statusCode,409);
 const addKey=randomUUID();const added=await post(day+'/money-in',{amountMinor:2000},admin,addKey);assert.equal(added.statusCode,200,added.body);assert.deepEqual((await post(day+'/money-in',{amountMinor:2000},admin,addKey)).json(),added.json());
 assert.equal((await post(day+'/start-count',{})).statusCode,409);
 assert.equal((await post('/api/shops/'+shop+'/cash/manual-receipts',{dayId:mark.json().id,drawerId:opened.json().id,reference:'NO DUPLICATION',salesMinor:100,refundsMinor:0})).statusCode,409);
 const totalKey=randomUUID();const total=await post(day+'/exception-total',{salesMinor:50000},admin,totalKey);assert.equal(total.statusCode,200,total.body);assert.deepEqual((await post(day+'/exception-total',{salesMinor:50000},admin,totalKey)).json(),total.json());assert.equal((await post(day+'/exception-total',{salesMinor:50000})).statusCode,409);
 assert.equal((await post('/api/shops/'+shop+'/cash/money-out',{amountMinor:3000,reason:'Supplies bought'},staff)).statusCode,200);
 const state=await get();assert.equal(state.summary.sales,'50000');assert.equal(state.summary.added,'2000');assert.equal(state.summary.expected,'59000');assert.equal(state.reporting.total,'50000');assert.equal(state.reporting.manual_total,'50000');assert.deepEqual(state.categoryLines,[]);
 const staffState=await get(staff);assert.equal(staffState.exception.totalRecorded,true);assert.equal(staffState.exception.salesMinor,undefined);assert.equal(staffState.reporting,null);
 const cutoff=await post(day+'/start-count',{});assert.equal(cutoff.statusCode,200,cutoff.body);
 assert.equal((await post(day+'/money-in',{amountMinor:1000})).statusCode,200);
 const sent=await post(day+'/send',{countId:cutoff.json().id,denominations:[20000,10000,5000,2000,1000].map(valueMinor=>({valueMinor,quantity:valueMinor===10000?5:0})),finalLeftMinor:9800});assert.equal(sent.statusCode,200,sent.body);
 const closing=(await db.query('SELECT expected_minor::text,left_minor FROM shop_day_closings WHERE shop_id=$1',[shop])).rows[0];assert.deepEqual(closing,{expected_minor:'10000',left_minor:9800});
 assert.equal((await get()).count.left_at_count_minor,null);
 assert.equal((await post(day+'/close',{leftMinor:9800})).statusCode,409);
 assert.equal((await post(day+'/money-in',{amountMinor:1000})).statusCode,409);
 assert.equal((await db.query('SELECT * FROM sales')).rows.length,0);assert.equal((await db.query('SELECT * FROM stock_ledger')).rows.length,0);
 await assert.rejects(db.exec('UPDATE exception_day_totals SET sales_minor=1'));
 t.mock.timers.enable({apis:['Date'],now:Date.now()+86400000});t.after(()=>t.mock.timers.reset());
 Object.assign(admin,await login('exception.admin',password));
 const next=await post(day+'/open',{openingMinor:99999});assert.equal(next.statusCode,200,next.body);assert.equal((await get()).summary.opening,'9800');assert.equal((await get()).summary.added,'0');assert.equal((await get()).reporting.total,'0');
 // A zero-sales exception day remains a recorded total and can close normally.
 const otherDay='/api/shops/'+other+'/day';assert.equal((await post(otherDay+'/open',{openingMinor:5000})).statusCode,200);
 const zero=await post(otherDay+'/exception-total',{salesMinor:0});assert.equal(zero.statusCode,200,zero.body);
 const zeroCutoff=await post(otherDay+'/start-count',{});assert.equal(zeroCutoff.statusCode,200,zeroCutoff.body);
 assert.equal((await post(otherDay+'/send',{countId:zeroCutoff.json().id,denominations:[20000,10000,5000,2000,1000].map(valueMinor=>({valueMinor,quantity:0})),leftAtCountMinor:5000})).statusCode,200);
 assert.equal((await post(otherDay+'/close',{leftMinor:5000})).statusCode,200);
});
