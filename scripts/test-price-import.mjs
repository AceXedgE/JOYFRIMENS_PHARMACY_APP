import {readFile} from 'node:fs/promises';
import {replaceBusinessCatalogue} from './import-tomjoy-catalogue.mjs';
// Isolated browser regression; uses built assets and a fresh in-memory database.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { preview } from 'vite';
import { buildApp } from '../backend/dist/app.js';
import { openDatabase } from '../backend/dist/database.js';
import { bootstrap } from '../backend/dist/setup.js';
import { migrate } from '../backend/dist/migrate.js';
import { readConfig } from '../backend/dist/config.js';

const db = await openDatabase({ dataDir: 'memory://' });
let app, web, browser;
try {
  await migrate(db);
  const password = randomBytes(24).toString('hex');
  await bootstrap(db, { username: 'browser.admin', password, name: 'Browser Admin', shops: ['Tomjoy Pharmacy', 'Joyfrimens Pharmacy'], currency: 'GHS', timezone: 'Etc/GMT' });
  const manifest=JSON.parse(await readFile('docs/tomjoy-catalogue-import.json','utf8'));
  const summary=await replaceBusinessCatalogue(db,manifest);assert.equal(summary.products,489);assert.equal(summary.sellingOptions,503);assert.equal(summary.accountsPreserved,1);
  assert.equal((await db.query('SELECT * FROM stock_balances')).rows.length,0);assert.equal((await db.query('SELECT * FROM sales')).rows.length,0);assert.equal((await db.query('SELECT * FROM shop_listings')).rows.length,1006);
  assert.equal(manifest.starred.length,2);
  app = buildApp({ db, config: readConfig({ NODE_ENV: 'test', APP_ORIGINS: 'http://127.0.0.1:4194' }) });
  const apiAddress = await app.listen({ host: '127.0.0.1', port: 0 });
  web = await preview({ configFile: false, root: resolve('frontend'), preview: { host: '127.0.0.1', port: 4194, strictPort: true, proxy: { '/api': apiAddress } } });
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:4194', viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
  page.on('requestfailed',r=>{if(!r.url().includes('/api/'))console.log('FAILED ASSET',r.url(),r.failure());});
  await page.goto('http://127.0.0.1:4194');
  await page.evaluate(async()=>{localStorage.setItem('ticket-edit:old','discarded old ticket');await new Promise((resolve,reject)=>{const r=indexedDB.open('joyfrimens-offline',1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>{const db=r.result,tx=db.transaction('records','readwrite');tx.objectStore('records').put({old:true},'outbox:old');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});});
  await page.getByLabel('Username', { exact: true }).fill('browser.admin');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Search medicines', { exact: true }).waitFor();
  const me = await (await page.request.get('/api/auth/me')).json();
  const headers = { 'x-requested-with': 'joyfrimens', 'x-csrf-token': me.csrfToken };
  const shop = (await (await page.request.get('/api/shops')).json()).shops[0];

  assert.equal(await page.evaluate(()=>localStorage.getItem('ticket-edit:old')),null);
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('joyfrimens-offline',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('records').objectStore('records').get('outbox:old');q.onsuccess=()=>{resolve(q.result??null);db.close();};};})),null);
  const search=page.getByLabel('Search medicines',{exact:true});await search.fill('ABYMOL FORTE');const card=page.locator('.medicine-card').filter({has:page.getByRole('heading',{name:'ABYMOL FORTE',exact:true})});await expect(card.getByText('Price needed',{exact:true})).toBeVisible();
  const product=(await(await page.request.get('/api/shops/'+shop.id+'/catalogue?q=ABYMOL%20FORTE')).json()).products.find(p=>p.name==='ABYMOL FORTE');
  const options=(await(await page.request.get('/api/inventory/options')).json()),shelf=options.locations.find(l=>l.shop_id===shop.id&&l.kind==='shelf');
  const draft=await page.request.post('/api/shops/'+shop.id+'/sales/drafts',{headers,data:{requestKey:randomUUID(),locationStatus:'unavailable',shopConfirmed:true}});assert.equal(draft.status(),200);
  const blocked=await page.request.post('/api/shops/'+shop.id+'/sales/drafts/'+(await draft.json()).id+'/lines',{headers,data:{requestKey:randomUUID(),expectedVersion:1,lines:[{unitId:product.units[0].id,batchId:null,locationId:shelf.id,quantity:1,priceMinor:1,priceVersion:1}]}});assert.equal(blocked.status(),409);assert.match((await blocked.json()).message,/Set a price/);
  await card.getByRole('button',{name:'Edit price',exact:true}).click();await page.getByLabel('Price (GHS)',{exact:true}).fill('12.50');await page.getByRole('button',{name:'Save price',exact:true}).click();await expect(card.getByText('Price needed',{exact:true})).toHaveCount(0);
  assert.equal((await(await page.request.get('/api/shops/'+shop.id+'/catalogue?q=ABYMOL%20FORTE')).json()).products[0].units[0].priceMinor,1250);
  await search.fill('AMOXICILLIN CAPS 250');const amox=page.locator('.medicine-card').filter({has:page.getByRole('heading',{name:'AMOXICILLIN CAPS 250',exact:true})});await expect(amox.getByText('3 units',{exact:true})).toBeVisible();
  const amoxData=(await(await page.request.get('/api/shops/'+shop.id+'/catalogue?q=AMOXICILLIN%20CAPS%20250')).json()).products.find(p=>p.name==='AMOXICILLIN CAPS 250');assert.deepEqual(amoxData.units.map(u=>[u.baseQuantity,u.priceMinor]),[[1,500],[3,1000]]);
  await search.fill('PIRITON strip');await expect(page.getByRole('heading',{name:'PIRITON strip',exact:true})).toBeVisible();await search.fill('STREPSILS LOZ');await expect(page.getByRole('heading',{name:'STREPSILS LOZ (1 tablet)',exact:true})).toBeVisible();
  await page.setViewportSize({width:320,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'test-results/imported-price-mobile.png',fullPage:true});
  console.log('PASS: 489 medicines/503 options, preserved account login, empty stock/sales, reset device cache, zero-price sale block, counter price editing, quantity deals and strip/tablet names.');
} finally {if(browser)await browser.close();if(web)await new Promise(resolve=>web.httpServer.close(resolve));if(app)await app.close();await db.close();}
