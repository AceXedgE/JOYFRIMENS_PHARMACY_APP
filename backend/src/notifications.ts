import type {FastifyInstance} from 'fastify';
import type {Database,Sql} from './database.ts';
import {actorOf} from './inventory.ts';

export async function medicineNotification(tx:Sql,unit:string,kind:'added'|'price'|'availability'|'updated'|'removed'|'restored',shop:string|null=null,available:boolean|null=null){
 await tx.query(`INSERT INTO medicine_notifications(shop_id,unit_id,kind,medicine,unit_label,price_minor,available)
 SELECT $2,u.id,$3,concat_ws(' ',p.name,nullif(p.strength,'')),u.label,pr.price_minor,$4
 FROM selling_units u JOIN products p ON p.id=u.product_id JOIN unit_prices pr ON pr.unit_id=u.id WHERE u.id=$1`,[unit,shop,kind,available]);
}
const visible=`($2='admin' OR EXISTS(SELECT 1 FROM memberships m WHERE m.user_id=$1 AND (n.shop_id IS NULL OR m.shop_id=n.shop_id)))`;
export function registerNotificationRoutes(app:FastifyInstance,db:Database){
 app.get<{Querystring:{before?:string}}>('/api/notifications',{schema:{querystring:{type:'object',additionalProperties:false,properties:{before:{type:'string',pattern:'^[1-9][0-9]{0,18}$'}}}}},async request=>{
  const actor=await actorOf(db,request);
  const entries=(await db.query(`SELECT n.id::text,n.kind,n.medicine,n.unit_label,n.price_minor,n.available,n.created_at,s.name AS shop_name,(r.notification_id IS NOT NULL) AS read
   FROM medicine_notifications n LEFT JOIN shops s ON s.id=n.shop_id LEFT JOIN medicine_notification_reads r ON r.notification_id=n.id AND r.user_id=$1
   WHERE ${visible} AND ($3::bigint IS NULL OR n.id<$3) ORDER BY n.id DESC LIMIT 30`,[actor.id,actor.role,request.query.before??null])).rows;
  const unread=(await db.query<{count:number}>(`SELECT count(*)::int AS count FROM medicine_notifications n WHERE ${visible} AND NOT EXISTS(SELECT 1 FROM medicine_notification_reads r WHERE r.user_id=$1 AND r.notification_id=n.id)`,[actor.id,actor.role])).rows[0].count;
  return{entries,unread,next:entries.length===30?entries[29].id:null};
 });
 app.post<{Body:{ids:string[]}}>('/api/notifications/read',{schema:{body:{type:'object',additionalProperties:false,required:['ids'],properties:{ids:{type:'array',minItems:1,maxItems:30,uniqueItems:true,items:{type:'string',pattern:'^[1-9][0-9]{0,18}$'}}}}}},async request=>{
  const actor=await actorOf(db,request);
  await db.query(`INSERT INTO medicine_notification_reads(user_id,notification_id) SELECT $1,n.id FROM medicine_notifications n WHERE ${visible} AND n.id=ANY($3::bigint[]) ON CONFLICT DO NOTHING`,[actor.id,actor.role,request.body.ids]);return{saved:true};
 });
}
