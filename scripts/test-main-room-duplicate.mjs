// Isolated browser regression; uses built assets and a fresh in-memory database.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
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
  app = buildApp({ db, config: readConfig({ NODE_ENV: 'test', APP_ORIGINS: 'http://127.0.0.1:4189' }) });
  const apiAddress = await app.listen({ host: '127.0.0.1', port: 0 });
  web = await preview({ configFile: false, root: resolve('frontend'), preview: { host: '127.0.0.1', port: 4189, strictPort: true, proxy: { '/api': apiAddress } } });
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });
  const page = await browser.newPage({ baseURL: 'http://127.0.0.1:4189', viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(10000);
  await page.goto('http://127.0.0.1:4189');
  await page.getByLabel('Username', { exact: true }).fill('browser.admin');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Search medicines', { exact: true }).waitFor();
  const me = await (await page.request.get('/api/auth/me')).json();
  const headers = { 'x-requested-with': 'joyfrimens', 'x-csrf-token': me.csrfToken };
  const shop = (await (await page.request.get('/api/shops')).json()).shops[0];
  const product = await page.request.post(`/api/shops/${shop.id}/catalogue`, { headers, data: { name: 'Duplicate Test', genericName: 'Test medicine', strength: 'Demo', dosageForm: 'Tablet', baseUnit: 'tablet', reason: 'Browser regression fixture', units: [{ label: 'tablet', baseQuantity: 1, barcode: '', priceMinor: 100 }] } });
  assert.equal(product.status(), 201);
  const options = await (await page.request.get('/api/inventory/options')).json();
  const rooms = options.locations.filter(l => l.kind === 'shared').sort((a, b) => a.name.localeCompare(b.name));
  const unit = options.units[0];
  const first = await page.request.post('/api/inventory/receipts', { headers, data: { requestKey: randomUUID(), unitId: unit.id, supplier: 'Test supplier', reference: 'ROOM-1', batchNumber: 'FIRST', expiry: '2099-12-31', expectedPacks: 10, receivedPacks: 10, allocations: [{ locationId: rooms[0].id, quantity: 10 }], reason: 'Initial first-room stock' } });
  assert.equal(first.status(), 200);
  // Receiving UI is deferred; retain its duplicate protection regression at the API.
  const receipt={unitId:unit.id,supplier:'Test supplier',reference:'ROOM-2',batchNumber:'SECOND',expiry:'2099-12-31',expectedPacks:5,receivedPacks:5,allocations:[{locationId:rooms[1].id,quantity:5}],reason:'Intentional second-room duplicate'};
  const blocked=await page.request.post('/api/inventory/receipts',{headers,data:{...receipt,requestKey:randomUUID()}});assert.equal(blocked.status(),409);
  assert.equal((await(await page.request.get('/api/inventory/locations/'+rooms[1].id)).json()).stocks.length,0);
  const allowed=await page.request.post('/api/inventory/receipts',{headers,data:{...receipt,requestKey:randomUUID(),forceDuplicate:true}});assert.equal(allowed.status(),200);
  assert.equal((await(await page.request.get('/api/inventory/locations/'+rooms[1].id)).json()).stocks[0].quantity,5);
  console.log('PASS: deferred receiving API still requires explicit main-room duplication confirmation.');
} finally {
  await browser?.close();
  if (web) await new Promise(resolve => web.httpServer.close(resolve));
  await app?.close();
  await db.close();
}
