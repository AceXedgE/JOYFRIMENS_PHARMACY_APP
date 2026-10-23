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
  app = buildApp({ db, config: readConfig({ NODE_ENV: 'test', APP_ORIGINS: 'http://127.0.0.1:4193' }) });
  const apiAddress = await app.listen({ host: '127.0.0.1', port: 0 });
  web = await preview({ configFile: false, root: resolve('frontend'), preview: { host: '127.0.0.1', port: 4193, strictPort: true, proxy: { '/api': apiAddress } } });
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:4193', viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
  page.on('requestfailed',r=>{if(!r.url().includes('/api/'))console.log('FAILED ASSET',r.url(),r.failure());});
  await page.goto('http://127.0.0.1:4193');
  await page.getByLabel('Username', { exact: true }).fill('browser.admin');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Search medicines', { exact: true }).waitFor();
  const me = await (await page.request.get('/api/auth/me')).json();
  const headers = { 'x-requested-with': 'joyfrimens', 'x-csrf-token': me.csrfToken };
  const shop = (await (await page.request.get('/api/shops')).json()).shops[0];

  const made=await page.request.post('/api/shops/'+shop.id+'/catalogue',{headers,data:{name:'Test cream 20g',baseUnit:'tube',units:[{label:'tube',baseQuantity:1,barcode:'',priceMinor:1000},{label:'box',baseQuantity:14,barcode:'',priceMinor:12000}]}});assert.equal(made.status(),201);
  const options=(await(await page.request.get('/api/inventory/options')).json());const box=options.units.find(u=>u.label==='box'),room=options.locations.find(l=>l.shop_id===shop.id&&l.kind==='storeroom');
  await page.getByRole('button',{name:'Storerooms',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Storerooms',exact:true})).toBeVisible();
  await expect(page.getByLabel('Stock location')).toHaveValue(room.id);
  await page.getByRole('button',{name:'Add stock manually',exact:true}).click();
  await page.getByLabel('Find medicine',{exact:true}).fill('cream');await page.getByLabel('Medicine and pack').selectOption(box.id);
  await page.getByLabel('Quantity (box)').fill('3');await page.getByLabel('Batch number',{exact:true}).fill('MANUAL');await page.getByLabel('Expiry',{exact:true}).fill('2099-12-31');await page.getByRole('button',{name:'Add stock',exact:true}).click();
  await expect(page.getByText('3 box(s) + 0 loose tube(s); 1 box = 14 tube(s) (equivalent quantity)')).toBeVisible();
  await page.getByText('Supplier deliveries',{exact:true}).click();await page.getByText('Supplier links',{exact:true}).click();await page.getByLabel('Supplier name',{exact:true}).fill('Browser Supplier');await page.getByRole('button',{name:'Create delivery link',exact:true}).click();
  const link=page.getByLabel(/Private link/);await expect(link).toHaveValue(/supplier#/);const url=await link.inputValue();
  const supplier=await browser.newPage({viewport:{width:320,height:800}});await supplier.goto(url);await supplier.getByLabel('Delivery reference',{exact:true}).fill('BROWSER-DELIVERY');await supplier.getByLabel('Medicine name',{exact:true}).fill('Test cream 20g');await supplier.getByLabel('Pack (e.g. box, tube, single)').fill('box');await supplier.getByLabel('Singles in one pack').fill('14');await supplier.getByLabel('Number of packs').fill('2');
  assert.ok(await supplier.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await supplier.screenshot({path:'test-results/supplier-mobile.png',fullPage:true});await supplier.getByRole('button',{name:'Submit delivery',exact:true}).click();await expect(supplier.getByRole('heading',{name:'Delivery submitted'})).toBeVisible();await supplier.close();
  await page.getByText('Supplier deliveries',{exact:true}).click();await page.getByText('Supplier deliveries',{exact:true}).click();await page.getByRole('button',{name:/Browser Supplier.*Awaiting check/}).click();
  await page.getByLabel('Match medicine and pack').selectOption(box.id);await page.getByLabel('Actual received (selected packs)').fill('1');await page.getByLabel('Batch number',{exact:true}).fill('SUPPLIER');await page.getByLabel('Expiry',{exact:true}).fill('2099-12-31');await page.getByRole('button',{name:'Check allocations',exact:true}).click();await page.getByLabel('Allocate delivery').selectOption(room.id);await page.getByRole('button',{name:'Review receipt',exact:true}).click();await expect(page.getByText('Short: 14 tube(s)',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Confirm entire receipt',exact:true}).click();
  await expect(page.getByRole('button',{name:/Browser Supplier.*Received/})).toBeVisible();
  const stock=(await(await page.request.get('/api/inventory/locations/'+room.id)).json()).stocks;assert.equal(stock.reduce((n,s)=>n+s.quantity,0),56);
  await page.setViewportSize({width:320,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByText('Supplier deliveries',{exact:true}).click();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'test-results/storerooms-mobile.png',fullPage:true});
  console.log('PASS: mobile storeroom navigation, manual packs, supplier private page, arrival discrepancy, allocations and stock posting.');
} finally { if(browser)await browser.close();if(web)await new Promise(resolve=>web.httpServer.close(resolve));if(app)await app.close();await db.close(); }
