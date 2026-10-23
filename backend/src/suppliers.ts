import {isDeepStrictEqual} from 'node:util';
import {randomUUID} from 'node:crypto';
import type {FastifyInstance,FastifyRequest} from 'fastify';
import type {Database,Sql} from './database.ts';
import {actorOf,place} from './inventory.ts';
import {newToken,digest} from './security.ts';
import {HttpError} from './http.ts';
import {audit} from './setup.ts';
const uuid={type:'string',format:'uuid'},str=(max:number)=>({type:'string',minLength:1,maxLength:max});
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const number={type:'integer',minimum:1,maximum:100000000};
interface Line {name:string;pack:string;packSize:number;quantity:number;batchNumber?:string;expiry?:string}
interface Invite {id:string;supplier:string;location_id:string;expires_at:string;revoked_at:string|null}
async function invitation(tx:Sql,request:FastifyRequest,lock=false){
 const token=request.headers.authorization?.replace(/^Bearer /,'');
 if(!token||!/^[a-f0-9]{64}$/.test(token))throw new HttpError(404,'Delivery link is invalid or expired.');
 const invite=(await tx.query<Invite>(`SELECT id,supplier,location_id,expires_at,revoked_at FROM supplier_invites WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() ${lock?'FOR UPDATE':''}`,[digest(token)])).rows[0];
 if(!invite)throw new HttpError(404,'Delivery link is invalid or expired.');return invite;
}
export function registerSupplierRoutes(app:FastifyInstance,db:Database){
 app.get('/api/supplier-portal',async request=>{const invite=await invitation(db,request);const submission=(await db.query('SELECT id,reference,lines,created_at FROM supplier_submissions WHERE invite_id=$1',[invite.id])).rows[0];return{supplier:invite.supplier,submission:submission??null};});
 app.post<{Body:{requestKey:string;reference:string;lines:Line[]}}>('/api/supplier-portal',{bodyLimit:128*1024,schema:{body:object({requestKey:uuid,reference:str(100),lines:{type:'array',minItems:1,maxItems:100,items:object({name:str(160),pack:str(40),packSize:number,quantity:number,batchNumber:str(100),expiry:{type:'string',format:'date'}},['name','pack','packSize','quantity'])}})}},async request=>db.transaction(async tx=>{
   const invite=await invitation(tx,request,true),input=request.body;
   const reference=input.reference.trim().replace(/\s+/g,' ').toLowerCase();
   const lines=input.lines.map(l=>({...l,name:l.name.trim(),pack:l.pack.trim()}));
   if(!reference||lines.some(l=>!l.name||!l.pack||l.packSize*l.quantity>100000000))throw new HttpError(400,'Check medicine names and quantities.');
   const prior=(await tx.query<{id:string;request_key:string;reference:string;lines:Line[]}>('SELECT * FROM supplier_submissions WHERE invite_id=$1',[invite.id])).rows[0];
   if(prior){if(prior.request_key===input.requestKey&&prior.reference===reference&&isDeepStrictEqual(prior.lines,lines))return{id:prior.id};throw new HttpError(409,'This delivery was already submitted. Ask the pharmacy for a new link for another delivery.');}
   const id=randomUUID();await tx.query('INSERT INTO supplier_submissions(id,invite_id,request_key,reference,lines) VALUES($1,$2,$3,$4,$5)',[id,invite.id,input.requestKey,reference,JSON.stringify(lines)]);
   await audit(tx,null,'supplier.delivery_submitted',id,{inviteId:invite.id,supplier:invite.supplier,lineCount:lines.length});return{id};
 }));
 app.post<{Body:{supplier:string;locationId:string}}>('/api/inventory/supplier-links',{schema:{body:object({supplier:str(150),locationId:uuid})}},async request=>db.transaction(async tx=>{
   const actor=await actorOf(tx,request,true);if(actor.role!=='admin')throw new HttpError(403,'Only administrators can create supplier links.');
   const location=await place(tx,actor,request.body.locationId,true);if(location.kind==='shelf')throw new HttpError(400,'Choose a receiving storeroom.');
   const supplier=request.body.supplier.trim().replace(/\s+/g,' ');if(!supplier)throw new HttpError(400,'Enter supplier name.');
   const token=newToken(),id=randomUUID();await tx.query('INSERT INTO supplier_invites(id,token_hash,supplier,location_id,created_by) VALUES($1,$2,$3,$4,$5)',[id,digest(token),supplier,location.id,actor.id]);
   await audit(tx,actor.id,'supplier.link_created',id,{supplier,locationId:location.id});return{id,token};
 }));
 app.get<{Querystring:{locationId:string}}>('/api/inventory/supplier-links',{schema:{querystring:object({locationId:uuid})}},async request=>{
   const actor=await actorOf(db,request);if(actor.role!=='admin')throw new HttpError(403,'Only administrators can manage supplier links.');await place(db,actor,request.query.locationId);
   return{links:(await db.query('SELECT id,supplier,created_at,expires_at,revoked_at FROM supplier_invites WHERE location_id=$1 ORDER BY created_at DESC LIMIT 30',[request.query.locationId])).rows};
 });
 app.post<{Params:{id:string}}>('/api/inventory/supplier-links/:id/revoke',{schema:{params:object({id:uuid})}},async request=>db.transaction(async tx=>{
   const actor=await actorOf(tx,request,true);if(actor.role!=='admin')throw new HttpError(403,'Only administrators can revoke supplier links.');
   await tx.query('UPDATE supplier_invites SET revoked_at=coalesce(revoked_at,now()) WHERE id=$1',[request.params.id]);await audit(tx,actor.id,'supplier.link_revoked',request.params.id,{});return{saved:true};
 }));
 app.get<{Querystring:{locationId:string;page?:string}}>('/api/inventory/supplier-submissions',{schema:{querystring:object({locationId:uuid,page:{type:'string',pattern:'^[1-9][0-9]{0,5}$'}},['locationId'])}},async request=>{
   const actor=await actorOf(db,request);await place(db,actor,request.query.locationId);
   return{submissions:(await db.query(`SELECT s.id,s.reference,s.created_at,i.supplier,r.document_id FROM supplier_submissions s JOIN supplier_invites i ON i.id=s.invite_id LEFT JOIN supplier_submission_receipts r ON r.submission_id=s.id WHERE i.location_id=$1 ORDER BY s.created_at DESC,s.id LIMIT 20 OFFSET $2`,[request.query.locationId,(Number(request.query.page??1)-1)*20])).rows};
 });
 app.get<{Params:{id:string}}>('/api/inventory/supplier-submissions/:id',{schema:{params:object({id:uuid})}},async request=>{
   const actor=await actorOf(db,request);const submission=(await db.query<{location_id:string}>(`SELECT s.*,i.supplier,i.location_id,r.document_id FROM supplier_submissions s JOIN supplier_invites i ON i.id=s.invite_id LEFT JOIN supplier_submission_receipts r ON r.submission_id=s.id WHERE s.id=$1`,[request.params.id])).rows[0];
   if(!submission)throw new HttpError(404,'Delivery not found.');await place(db,actor,submission.location_id);return{submission};
 });
}
