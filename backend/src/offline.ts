import type { FastifyInstance } from 'fastify';
import type { Database } from './database.ts';
import { actorOf } from './inventory.ts';
import { access } from './sales.ts';
import { audit } from './setup.ts';
import { HttpError } from './http.ts';
const uuid={type:'string',format:'uuid'};
export function registerOfflineRoutes(app:FastifyInstance,db:Database){
 app.post<{Params:{shopId:string};Body:{requestKey:string;path:string;payload:Record<string,unknown>;recordedAt:string}}>('/api/shops/:shopId/offline-events',{bodyLimit:128*1024,schema:{params:{type:'object',required:['shopId'],properties:{shopId:uuid}},body:{type:'object',additionalProperties:false,required:['requestKey','path','payload','recordedAt'],properties:{requestKey:uuid,path:{type:'string',maxLength:200},payload:{type:'object'},recordedAt:{type:'string',format:'date-time'}}}}},async request=>db.transaction(async tx=>{
  const actor=await actorOf(tx,request,true);await access(tx,actor,request.params.shopId,true);
  const b=request.body;
  if(!b.path.startsWith(`/shops/${request.params.shopId}/sales/drafts`))throw new HttpError(400,'Only ticket records can be uploaded here.');
  const prior=(await tx.query<{path:string;payload:unknown;recorded_at:Date}>('SELECT path,payload,recorded_at FROM offline_events WHERE actor_id=$1 AND request_key=$2',[actor.id,b.requestKey])).rows[0];
  if(prior){if(new Date(prior.recorded_at).toISOString()!==new Date(b.recordedAt).toISOString())throw new HttpError(409,'Offline timestamp cannot be changed.');if(prior.path!==b.path||JSON.stringify(prior.payload)!==JSON.stringify(JSON.parse(JSON.stringify(b.payload)))){
    // JSONB key order is independent of request serialization.
    const same=(await tx.query<{same:boolean}>('SELECT payload=$3::jsonb AS same FROM offline_events WHERE actor_id=$1 AND request_key=$2',[actor.id,b.requestKey,JSON.stringify(b.payload)])).rows[0].same;
    if(prior.path!==b.path||!same)throw new HttpError(409,'Offline record key was already used.');
  }return {saved:true};}
  await tx.query('INSERT INTO offline_events(actor_id,request_key,shop_id,path,payload,recorded_at) VALUES($1,$2,$3,$4,$5,$6)',[actor.id,b.requestKey,request.params.shopId,b.path,JSON.stringify(b.payload),b.recordedAt]);
  await audit(tx,actor.id,'ticket.offline_received',b.requestKey,{shopId:request.params.shopId,path:b.path,deviceRecordedAt:b.recordedAt,payload:b.payload});
  return {saved:true};
 }));
 app.post<{Params:{shopId:string;id:string}}>('/api/shops/:shopId/offline-events/:id/resolved',{schema:{params:{type:'object',required:['shopId','id'],properties:{shopId:uuid,id:uuid}}}},async request=>db.transaction(async tx=>{
  const actor=await actorOf(tx,request,true);await access(tx,actor,request.params.shopId,true);
  const row=(await tx.query('SELECT e.request_key FROM offline_events e JOIN stock_operations o ON o.actor_id=e.actor_id AND o.request_key=e.request_key WHERE e.actor_id=$1 AND e.request_key=$2 AND e.shop_id=$3',[actor.id,request.params.id,request.params.shopId])).rows[0];
  if(!row)throw new HttpError(409,'The ticket operation has not been applied yet.');
  await tx.query('INSERT INTO offline_event_resolutions(actor_id,request_key) VALUES($1,$2) ON CONFLICT DO NOTHING',[actor.id,request.params.id]);return{saved:true};
 }));
}
