import {rankProduct} from '../src/catalogue-search.ts';
import {rankProduct as offlineRank} from '../../frontend/src/offline-search.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildApp} from '../src/app.ts';
import {registerFrontend} from '../src/frontend.ts';
import {readConfig} from '../src/config.ts';

test('hosted frontend serves the SPA without turning API errors or private files into HTML',async t=>{
 const root=await mkdtemp(join(tmpdir(),'joy-hosting-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(join(root,'index.html'),'<html>Pharmacy login</html>');await writeFile(join(root,'.env'),'not-public');
 const app=buildApp();t.after(()=>app.close());await registerFrontend(app,root);
 for(const path of ['/','/supplier']){const response=await app.inject(path);assert.equal(response.statusCode,200,response.body);assert.match(response.body,/Pharmacy login/);}
 for(const path of ['/api/not-a-route','/missing.js','/assets/missing.js','/.env']){const response=await app.inject(path);assert.equal(response.statusCode,path==='/.env'?403:404,response.body);assert.doesNotMatch(response.body,/Pharmacy login|not-public/);}
 assert.equal((await app.inject('/api/health')).statusCode,200);
 assert.equal((await app.inject('/api/ready')).statusCode,503);
});
test('Render origin defaults are HTTPS-only and custom domains remain explicit',()=>{
 const env={NODE_ENV:'production',DATABASE_URL:'postgres://localhost/test',SERVE_FRONTEND:'true',RENDER_EXTERNAL_URL:'https://joyfrimens-test.onrender.com'};
 assert.deepEqual(readConfig(env).origins,[env.RENDER_EXTERNAL_URL]);
 assert.deepEqual(readConfig({...env,APP_ORIGINS:'https://pharmacy.example.com'}).origins,['https://pharmacy.example.com']);
 assert.throws(()=>readConfig({...env,RENDER_EXTERNAL_URL:'http://bad.example.com'}),/HTTPS/);
 assert.throws(()=>readConfig({...env,SERVE_FRONTEND:'false'}),/APP_ORIGINS/);
});

test('imported variation names are searchable online and offline without mixing strengths',()=>{
 const medicine={name:'Amoksiklav suspension',genericName:'amoxicillin clanulanic acid',strength:'',dosageForm:'',barcodes:[],units:[{label:'Amoksiklav suspension 457'},{label:'Amoksiklav suspension 228.5'}]};
 for(const rank of [rankProduct,offlineRank]){assert.ok(rank(medicine,'Amoksiklav suspension 228.5'));assert.equal(rank(medicine,'Amoksiklav 999'),null);assert.equal(rank(medicine,'Amoksiklav 457 228.5'),null);}
});
