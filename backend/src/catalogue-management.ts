import { randomUUID } from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import type {Database,Sql} from './database.ts';
import {catalogueAccess} from './catalogue.ts';
import {audit} from './setup.ts';
import {HttpError} from './http.ts';
import {medicineNotification} from './notifications.ts';
const uuid={type:'string',format:'uuid'},text=(max:number,min=1)=>({type:'string',minLength:min,maxLength:max});
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false});
const params=object({shopId:uuid,productId:uuid});
const clean=(s:string)=>s.trim().replace(/\s+/g,' ');
type Unit={variation:boolean;id:string;label:string;base_quantity:number;barcode:string|null};
type Product={id:string;name:string;generic_name:string;base_unit:string;revision:number;archived:boolean};
async function versions(tx:Sql,actor:string,shop:string,product:string,changes:{id?:string;priceMinor?:number;priceVersion?:number}[]=[]){
 const prices=(await tx.query<{unit_id:string;version:number;price_minor:number}>('SELECT pr.* FROM unit_prices pr JOIN selling_units u ON u.id=pr.unit_id WHERE u.product_id=$1 ORDER BY pr.unit_id FOR UPDATE OF pr',[product])).rows;
 for(const price of prices){
  const change=changes.find(c=>c.id===price.unit_id);
  if(change?.priceMinor!==undefined&&(change.priceVersion===undefined||change.priceVersion!==price.version))throw new HttpError(409,'A price changed. Reload the medicine before saving.');
  const next=change?.priceMinor??price.price_minor;
  await tx.query('UPDATE unit_prices SET price_minor=$2,version=version+1,updated_at=now() WHERE unit_id=$1',[price.unit_id,next]);
  await tx.query("INSERT INTO price_history(unit_id,version,old_price_minor,price_minor,initiating_shop_id,changed_by,reason) VALUES($1,$2,$3,$4,$5,$6,'Medicine edited')",[price.unit_id,price.version+1,price.price_minor,next,shop,actor]);
  if(next!==price.price_minor)await medicineNotification(tx,price.unit_id,'price');
 }

}
export function registerCatalogueManagement(app:FastifyInstance,db:Database){
 app.put<{Params:{shopId:string;productId:string};Body:{expectedVersion:number;name:string;genericName:string;baseUnit:string;units:{variation?:boolean;id?:string;label:string;baseQuantity:number;barcode:string;priceMinor?:number;priceVersion?:number}[]}}>('/api/shops/:shopId/catalogue/products/:productId',{schema:{params,body:object({expectedVersion:{type:'integer',minimum:1},name:text(160),genericName:text(160,0),baseUnit:text(40),units:{type:'array',minItems:1,maxItems:10,items:{...object({variation:{type:'boolean'},priceVersion:{type:'integer',minimum:1},id:uuid,priceMinor:{type:'integer',minimum:0,maximum:100000000},label:text(40),baseQuantity:{type:'integer',minimum:1,maximum:100000},barcode:text(80,0)}),required:['label','baseQuantity','barcode']}}})}},async request=>db.transaction(async tx=>{
  const actor=await catalogueAccess(tx,request,request.params.shopId,'admin');
  const prior=(await tx.query<Product>('SELECT * FROM products WHERE id=$1 FOR UPDATE',[request.params.productId])).rows[0];
  if(!prior)throw new HttpError(404,'Medicine not found.');
  if(prior.archived)throw new HttpError(409,'Restore this medicine before editing it.');
  if(prior.revision!==request.body.expectedVersion)throw new HttpError(409,'Medicine changed. Close this form and reload before editing.');
  const beforeUnits=(await tx.query<Unit>('SELECT * FROM selling_units WHERE product_id=$1 AND NOT archived ORDER BY id FOR UPDATE',[prior.id])).rows;
  const input=request.body,name=clean(input.name),other=clean(input.genericName),base=clean(input.baseUnit),units=input.units.map(u=>({...u,variation:u.variation??beforeUnits.find(old=>old.id===u.id)?.variation??false,label:clean(u.label),barcode:u.barcode.trim()}));
  if(units.some(u=>u.variation&&u.baseQuantity!==1))throw new HttpError(400,'Variations are counted separately, one per selling unit.');
  if(!name||!base||units.some(u=>!u.label))throw new HttpError(400,'Enter a medicine name and unit labels.');
  const existing=units.filter(u=>u.id), additions=units.filter(u=>!u.id);
  if(additions.some(u=>u.priceMinor===undefined))throw new HttpError(400,'Provide a price for each new option.');
  if(new Set(existing.map(u=>u.id)).size!==existing.length||existing.some(u=>!beforeUnits.some(old=>old.id===u.id)))throw new HttpError(400,'An existing option cannot be repeated or belong to another medicine.');
  if(new Set(units.map(u=>u.label.toLowerCase())).size!==units.length)throw new HttpError(400,'Each selling option needs a different name.');
  if(!units.some(u=>u.baseQuantity===1))throw new HttpError(400,'Keep a main option sold individually.');
  if(existing.some(u=>u.baseQuantity!==beforeUnits.find(old=>old.id===u.id)!.base_quantity||u.variation!==beforeUnits.find(old=>old.id===u.id)!.variation)){
   const used=await tx.query('SELECT 1 FROM stock_batches WHERE product_id=$1 UNION ALL SELECT 1 FROM sale_lines s JOIN selling_units u ON u.id=s.unit_id WHERE u.product_id=$1 LIMIT 1',[prior.id]);
   if(used.rows.length)throw new HttpError(409,'Stock type or pack quantity is already used by sales or stock records. Add a new selling option instead of rewriting that history.');
  }
  const deleted=beforeUnits.filter(old=>!existing.some(u=>u.id===old.id));
  for(const old of deleted){
   const occupied=await tx.query(`SELECT 1 FROM stock_batches b JOIN stock_balances s ON s.batch_id=b.id JOIN locations l ON l.id=s.location_id WHERE b.product_id=$1 AND b.variation_unit_id IS NOT DISTINCT FROM $2::uuid AND l.kind<>'shelf' AND s.quantity>0 UNION ALL SELECT 1 FROM stock_batches b JOIN stock_transfers t ON t.batch_id=b.id WHERE b.product_id=$1 AND b.variation_unit_id IS NOT DISTINCT FROM $2::uuid AND t.received+t.lost<t.quantity LIMIT 1`,[prior.id,old.variation?old.id:null]);
   if(occupied.rows.length&&(old.variation||!units.some(u=>!u.variation)))throw new HttpError(409,'Resolve remaining storeroom stock or transfers before deleting '+old.label+'.');
   await medicineNotification(tx,old.id,'removed');
   await tx.query('UPDATE selling_units SET archived=true,barcode=NULL WHERE id=$1',[old.id]);
  }
  await tx.query('UPDATE products SET name=$2,generic_name=$3,base_unit=$4,revision=revision+1 WHERE id=$1',[prior.id,name,other,base]);
  // Permit swapping labels/barcodes without transient uniqueness conflicts.
  for(const unit of existing)await tx.query('UPDATE selling_units SET label=$2,barcode=NULL WHERE id=$1',[unit.id,'_'+unit.id]);
  for(const unit of existing)await tx.query('UPDATE selling_units SET label=$2,base_quantity=$3,barcode=$4,variation=$5 WHERE id=$1',[unit.id,unit.label,unit.baseQuantity,unit.barcode||null,unit.variation]);
  await versions(tx,actor.id,request.params.shopId,prior.id,existing);
  for(const unit of additions){
   unit.id=randomUUID();
   await tx.query('INSERT INTO selling_units(id,product_id,label,base_quantity,barcode,variation) VALUES($1,$2,$3,$4,$5,$6)',[unit.id,prior.id,unit.label,unit.baseQuantity,unit.barcode||null,unit.variation]);
   await tx.query('INSERT INTO unit_prices(unit_id,price_minor,version) VALUES($1,$2,1)',[unit.id,unit.priceMinor]);
   await tx.query('INSERT INTO shop_listings(shop_id,unit_id,available,version) SELECT id,$1,true,1 FROM shops',[unit.id]);
   await tx.query("INSERT INTO price_history(unit_id,version,old_price_minor,price_minor,initiating_shop_id,changed_by,reason) VALUES($1,1,NULL,$2,$3,$4,'Selling unit added')",[unit.id,unit.priceMinor,request.params.shopId,actor.id]);
   await medicineNotification(tx,unit.id,'added');
  }
  for(const [position,unit] of units.entries())await tx.query('UPDATE selling_units SET display_order=$2 WHERE id=$1',[unit.id,position]);
  await medicineNotification(tx,units[0].id!,'updated');
  await audit(tx,actor.id,'catalogue.medicine_edited',prior.id,{before:prior,beforeUnits,deleted:deleted.map(u=>({id:u.id,label:u.label})),after:{name,genericName:other,baseUnit:base,units},shopId:request.params.shopId});
  return{saved:true,revision:prior.revision+1};
 }));
 app.put<{Params:{shopId:string;productId:string};Body:{expectedVersion:number;removed:boolean}}>('/api/shops/:shopId/catalogue/products/:productId/removal',{schema:{params,body:object({expectedVersion:{type:'integer',minimum:1},removed:{type:'boolean'}})}},async request=>db.transaction(async tx=>{
  const actor=await catalogueAccess(tx,request,request.params.shopId,'admin');
  const product=(await tx.query<Product>('SELECT * FROM products WHERE id=$1 FOR UPDATE',[request.params.productId])).rows[0];
  if(!product)throw new HttpError(404,'Medicine not found.');
  if(product.revision!==request.body.expectedVersion)throw new HttpError(409,'Medicine changed. Reload before continuing.');
  if(request.body.removed){
   const stock=await tx.query(`SELECT 1 FROM stock_balances s JOIN stock_batches b ON b.id=s.batch_id JOIN locations l ON l.id=s.location_id WHERE b.product_id=$1 AND l.kind<>'shelf' AND s.quantity>0
    UNION ALL SELECT 1 FROM stock_transfers t JOIN stock_batches b ON b.id=t.batch_id WHERE b.product_id=$1 AND t.received+t.lost<t.quantity LIMIT 1`,[product.id]);
   if(stock.rows.length)throw new HttpError(409,'This medicine still has storeroom stock or goods in transit. Resolve those quantities before removing it.');
  }
  await tx.query('UPDATE products SET archived=$2,revision=revision+1 WHERE id=$1',[product.id,request.body.removed]);
  await versions(tx,actor.id,request.params.shopId,product.id);
  const unit=(await tx.query<{id:string}>('SELECT id FROM selling_units WHERE product_id=$1 ORDER BY base_quantity,id LIMIT 1',[product.id])).rows[0];
  await medicineNotification(tx,unit.id,request.body.removed?'removed':'restored');
  await audit(tx,actor.id,request.body.removed?'catalogue.medicine_removed':'catalogue.medicine_restored',product.id,{name:product.name,shopId:request.params.shopId});
  return{saved:true,revision:product.revision+1};
 }));
}
