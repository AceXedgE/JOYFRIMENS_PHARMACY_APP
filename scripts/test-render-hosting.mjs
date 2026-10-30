import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium,expect} from '@playwright/test';
import {buildApp} from '../backend/dist/app.js';
import {registerFrontend} from '../backend/dist/frontend.js';
import {readConfig} from '../backend/dist/config.js';
import {openDatabase} from '../backend/dist/database.js';
import {migrate} from '../backend/dist/migrate.js';
import {bootstrap} from '../backend/dist/setup.js';
import {importNewDrugs} from './import-newdrugs.mjs';

const db=await openDatabase({dataDir:'memory://'});let app,browser;
try{
 await migrate(db);const password=randomUUID();await bootstrap(db,{username:'host.admin',password,name:'Hosting admin',shops:['Tomjoy','Joyfrimens'],currency:'GHS',timezone:'Etc/GMT'});
 await importNewDrugs(db,JSON.parse(await readFile('docs/newdrugs-import.json','utf8')));
 app=buildApp({db,config:readConfig({NODE_ENV:'test',APP_ORIGINS:'http://127.0.0.1:4196'})});await registerFrontend(app,resolve('frontend/dist'));await app.listen({host:'127.0.0.1',port:4196});
 browser=await chromium.launch({channel:process.platform==='win32'?'msedge':undefined});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4196');assert.equal((await page.request.get('http://127.0.0.1:4196/api/ready')).status(),200);
 await page.getByLabel('Username',{exact:true}).fill('host.admin');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 const search=page.getByLabel('Search medicines',{exact:true});await search.fill('Feroglobin');const card=page.locator('.medicine-card').filter({has:page.getByRole('heading',{name:'Feroglobin',exact:true})});await expect(card).toBeVisible();await expect(card.locator('.pack-name').first()).toHaveText('Default');await expect(card.locator('.price-number').first()).toContainText('120.00');await expect(card.locator('.pack-name').last()).toHaveText('Feroglobin plus');
 await search.fill('four four');await expect(page.getByRole('heading',{name:'Arfan 20/120',exact:true})).toBeVisible();
 await search.fill('Amoksiklav suspension 228.5');await expect(page.getByRole('heading',{name:'Amoksiklav suspension',exact:true})).toBeVisible();
 await search.fill('budex');await expect(page.getByText('Price needed',{exact:true})).toBeVisible();
 await page.setViewportSize({width:320,height:800});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.equal((await page.request.get('http://127.0.0.1:4196/api/missing')).status(),404);await page.goto('http://127.0.0.1:4196/supplier');await expect(page.locator('body')).not.toHaveText('Not found.');assert.deepEqual(errors,[]);
 console.log('PASS: single-server frontend/API, login, database readiness, imported prices and ordering, alias search, zero-price display, mobile layout and supplier route.');
}finally{await browser?.close();await app?.close();await db.close();}
