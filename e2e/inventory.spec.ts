import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('shelf unavailable flag shows storeroom stock without being cleared by receiving',async({page})=>{
 await page.goto('/');await page.getByLabel('Username',{exact:true}).fill('test.admin');await page.getByLabel('Password',{exact:true}).fill(process.env.E2E_PASSWORD!);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByLabel('Search medicines').waitFor();
 const me=await(await page.request.get('/api/auth/me')).json(),headers={'x-requested-with':'joyfrimens','x-csrf-token':me.csrfToken};
 const shop=await page.getByLabel('Active shop').inputValue();
 const created=await page.request.post(`/api/shops/${shop}/catalogue`,{headers,data:{name:'Availability Fixture',genericName:'Availability Fixture',strength:'Demo',dosageForm:'Tablet',baseUnit:'tablet',reason:'Availability browser regression',units:[{label:'tablet',baseQuantity:1,barcode:'',priceMinor:500}]}});expect(created.status()).toBe(201);
 await page.getByLabel('Search medicines').fill('Availability Fixture');
 const card=page.locator('.medicine-card').filter({has:page.getByRole('heading',{name:'Availability Fixture',exact:true})});
 await card.getByRole('button',{name:'Mark tablet unavailable',exact:true}).click();await expect(card.getByText('Unavailable on shelf',{exact:true})).toBeVisible();
 const options=await(await page.request.get('/api/inventory/options')).json();const unit=options.units.find((u:any)=>u.name==='Availability Fixture');const room=options.locations.find((l:any)=>l.shop_id===shop&&l.kind==='storeroom');
 const receipt=await page.request.post('/api/inventory/receipts',{headers,data:{requestKey:randomUUID(),unitId:unit.id,supplier:'Test supplier',reference:'SHELF-AVAIL',batchNumber:'ROOM',expiry:'2099-12-31',expectedPacks:10,receivedPacks:10,allocations:[{locationId:room.id,quantity:10}],reason:'Storeroom stock must not clear shelf flag'}});expect(receipt.status()).toBe(200);
 await page.reload();await page.getByLabel('Search medicines').fill('Availability Fixture');await expect(card.getByText('Unavailable on shelf',{exact:true})).toBeVisible();await expect(card.getByText('In storeroom:',{exact:false})).toContainText(room.name);
 await card.getByRole('button',{name:'Remove tablet unavailable mark',exact:true}).click();await expect(card.getByText('Unavailable on shelf',{exact:true})).toHaveCount(0);
 const balances=await(await page.request.get(`/api/inventory/locations/${room.id}`)).json();expect(balances.stocks.find((s:any)=>s.batch_number==='ROOM').quantity).toBe(10);
 await page.setViewportSize({width:320,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
