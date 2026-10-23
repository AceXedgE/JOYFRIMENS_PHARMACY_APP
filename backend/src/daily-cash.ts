import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database, Sql } from './database.ts';
import { actorOf, mutate } from './inventory.ts';
import { access, cashEntry } from './sales.ts';
import { HttpError } from './http.ts';

const uuid={type:'string',format:'uuid'}, amount={type:'integer',minimum:0,maximum:100000000};
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties).filter(k=>!['transferMinor','permissionOverride','recipient','salesDate','leftAtCountMinor','finalLeftMinor'].includes(k)),additionalProperties:false});
const notes=[20000,10000,5000,2000,1000];
const today=()=>new Date().toISOString().slice(0,10);
type Actor=Awaited<ReturnType<typeof actorOf>>;
async function total(tx:Sql,shop:string,day:string){return Number((await tx.query<{n:string}>(`SELECT coalesce(sum(c.amount_minor),0)::text AS n FROM cash_ledger c JOIN drawer_sessions d ON d.id=c.drawer_id WHERE d.shop_id=$1 AND d.business_date=$2`,[shop,day])).rows[0].n);}
async function workingDay(tx:Sql,shop:string){return (await tx.query<{day:string}>("SELECT business_date::text AS day FROM drawer_sessions WHERE shop_id=$1 AND status<>'closed' ORDER BY business_date LIMIT 1",[shop])).rows[0]?.day??today();}
async function open(tx:Sql,actor:Actor,op:string,shop:string,code:string,value:number,source:string,day=today()){const id=randomUUID();await tx.query('INSERT INTO drawer_sessions(id,shop_id,code,opening_minor,opening_source,opened_by,business_date) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,shop,code,value,source,actor.id,day]);await cashEntry(tx,op,actor,id,value,'opening',source);return id;}
export function registerDailyCashRoutes(app:FastifyInstance,db:Database){
 const params=object({shopId:uuid});
 function write(path:string,fields:Record<string,unknown>,work:(tx:Sql,actor:Actor,op:string,shop:string,b:any)=>Promise<unknown>){
 app.post<{Params:{shopId:string};Body:any}>(`/api/shops/:shopId/day/${path}`,{schema:{params,body:object({requestKey:uuid,reason:{type:'string',minLength:3,maxLength:300},permissionOverride:{type:'boolean'},...fields})}},async request=>mutate(db,request,'day_'+path,async(tx,actor,op)=>{
 const shop=request.params.shopId;await tx.query('SELECT id FROM shops WHERE id=$1 FOR UPDATE',[shop]);await access(tx,actor,shop,true);const b=request.body as Record<string,any>;
 if(['start-count','send','close'].includes(path)&&actor.role!=='admin'){
 const allowed=(await tx.query<{can_count_cash:boolean}>('SELECT can_count_cash FROM memberships WHERE user_id=$1 AND shop_id=$2',[actor.id,shop])).rows[0]?.can_count_cash;
 if(!allowed&&!b.permissionOverride)throw new HttpError(403,'Tick Count without permission to record that you are counting without assigned permission.');
 }
 if(['send','close'].includes(path)&&(await tx.query("SELECT e.request_key FROM offline_events e LEFT JOIN stock_operations o ON o.actor_id=e.actor_id AND o.request_key=e.request_key WHERE e.shop_id=$1 AND e.path LIKE '%/checkout' AND o.id IS NULL LIMIT 1",[shop])).rows.length)throw new HttpError(409,'An offline sale needs reconciliation before this shop can close. Check Activity reports.');
 return work(tx,actor,op,shop,b);
 }));}
 write('open',{openingMinor:amount},async(tx,actor,op,shop,b)=>{
 if((await tx.query('SELECT id FROM shop_day_closings WHERE shop_id=$1 AND business_date=$2',[shop,today()])).rows.length)throw new HttpError(409,'This shop is locked up for today.');
 const active=(await tx.query<{id:string;business_date:string}>("SELECT id,business_date::text FROM drawer_sessions WHERE shop_id=$1 AND status<>'closed'",[shop])).rows;
 if(active.some(d=>d.business_date!==today()))throw new HttpError(409,'Finish the previous day before starting a new day.');
 if(active.length)return{id:active[0].id};
 const previous=(await tx.query<{left_minor:number}>('SELECT left_minor FROM shop_day_closings WHERE shop_id=$1 ORDER BY business_date DESC LIMIT 1',[shop])).rows[0];
 if(!previous&&actor.role!=='admin')throw new HttpError(403,'An administrator must record the first starting cash balance.');
 const opening=previous?.left_minor??b.openingMinor;
 return{id:await open(tx,actor,op,shop,'A',opening,previous?'Cash left at previous lock-up':'Initial physical shop cash')};
 });
 write('exception-date',{businessDate:{type:'string',format:'date'}},async(tx,actor,_op,shop,b)=>{
 if(actor.role!=='admin')throw new HttpError(403,'Only administrators can set exception dates.');
 if(b.businessDate<today())throw new HttpError(400,'Choose today or an upcoming exception date.');
 if((await tx.query('SELECT id FROM sales WHERE shop_id=$1 AND business_date=$2 UNION ALL SELECT id FROM shop_day_closings WHERE shop_id=$1 AND business_date=$2 UNION ALL SELECT id FROM shop_remittance_counts WHERE shop_id=$1 AND business_date=$2',[shop,b.businessDate])).rows.length)throw new HttpError(409,'Sales or closing records already exist for this date.');
 const id=randomUUID();await tx.query('INSERT INTO manual_days(id,shop_id,business_date,actor_id,reason,summary_only) VALUES($1,$2,$3,$4,$5,true)',[id,shop,b.businessDate,actor.id,'Exception day: daily sales total only']);return{id};
 });
 write('exception-total',{salesMinor:amount},async(tx,actor,op,shop,b)=>{
 if(actor.role!=='admin')throw new HttpError(403,'Only administrators can record exception-day totals.');
 const day=await workingDay(tx,shop);
 const exception=(await tx.query<{id:string}>('SELECT id FROM manual_days WHERE shop_id=$1 AND business_date=$2 AND summary_only=true',[shop,day])).rows[0];
 if(!exception)throw new HttpError(409,'This is not a total-only exception day.');
 const current=(await tx.query<{id:string}>("SELECT id FROM drawer_sessions WHERE shop_id=$1 AND business_date=$2 AND status='open' ORDER BY code DESC LIMIT 1 FOR UPDATE",[shop,day])).rows[0];
 if(!current)throw new HttpError(409,'Start the shop day before recording its sales total.');
 if((await tx.query('SELECT id FROM shop_remittance_counts WHERE shop_id=$1 AND business_date=$2',[shop,day])).rows.length)throw new HttpError(409,'The sales cutoff has already been recorded.');
 await tx.query('INSERT INTO exception_day_totals(day_id,sales_minor,actor_id) VALUES($1,$2,$3)',[exception.id,b.salesMinor,actor.id]);
 if(b.salesMinor)await cashEntry(tx,op,actor,current.id,b.salesMinor,'manual_sale','Exception-day total sales');return{id:exception.id};
 });
 write('money-in',{amountMinor:{...amount,minimum:1}},async(tx,actor,op,shop,b)=>{
 if(actor.role!=='admin')throw new HttpError(403,'Only administrators can record extra change.');
 const current=(await tx.query<{id:string}>("SELECT id FROM drawer_sessions WHERE shop_id=$1 AND business_date=$2 AND status='open' ORDER BY code DESC LIMIT 1 FOR UPDATE",[shop,today()])).rows[0];
 if(!current)throw new HttpError(409,'Start the shop day before recording extra change.');
 await cashEntry(tx,op,actor,current.id,b.amountMinor,'cash_in','Extra change brought into the shop');return{id:op};
 });
 write('start-count',{transferMinor:amount},async(tx,actor,op,shop,b)=>{
 const day=await workingDay(tx,shop);
 if((await tx.query('SELECT m.id FROM manual_days m LEFT JOIN exception_day_totals t ON t.day_id=m.id WHERE m.shop_id=$1 AND m.business_date=$2 AND m.summary_only=true AND t.day_id IS NULL',[shop,day])).rows.length)throw new HttpError(409,'An administrator must record the exception-day sales total before the cutoff.');
 const existing=(await tx.query('SELECT id FROM shop_remittance_counts WHERE shop_id=$1 AND business_date=$2',[shop,day])).rows[0];if(existing)return existing;
 const drawers=(await tx.query<{id:string;code:string;status:string}>("SELECT id,code,status FROM drawer_sessions WHERE shop_id=$1 AND business_date=$2 AND status<>'closed' ORDER BY code FOR UPDATE",[shop,day])).rows;
 if(!drawers.length||drawers.some(d=>d.status!=='open'))throw new HttpError(409,'Start the day and resolve any existing drawer count first.');
 if(b.transferMinor)throw new HttpError(400,'A sales cutoff does not transfer cash. Refresh the counting screen.');
 const source=drawers[0];
 const expected=await total(tx,shop,day);
 const id=randomUUID();await tx.query('INSERT INTO shop_remittance_counts(id,shop_id,business_date,drawer_id,alternate_id,expected_minor,actor_id,sales_cutoff,permission_override) VALUES($1,$2,$3,$4,$4,$5,$6,true,$7)',[id,shop,day,source.id,expected,actor.id,actor.role!=='admin'&&!!b.permissionOverride]);
 return{id};
 });
 write('send',{countId:uuid,denominations:{type:'array',minItems:5,maxItems:5,items:object({valueMinor:{type:'integer',enum:notes},quantity:amount})},leftAtCountMinor:amount,finalLeftMinor:amount,salesDate:{type:'string',format:'date'},recipient:{type:'string',minLength:3,maxLength:120}},async(tx,actor,op,shop,b)=>{
 const day=await workingDay(tx,shop);
 const count=(await tx.query<{drawer_id:string}>('SELECT drawer_id FROM shop_remittance_counts WHERE id=$1 AND shop_id=$2 AND business_date=$3',[b.countId,shop,day])).rows[0];if(!count)throw new HttpError(404,'Count not found in this shop today.');
 if(new Set(b.denominations.map((d:any)=>d.valueMinor)).size!==5)throw new HttpError(400,'Enter each note denomination exactly once.');
 const sent=b.denominations.reduce((n:number,d:any)=>n+d.valueMinor*d.quantity,0);if(!Number.isSafeInteger(sent)||sent>100000000)throw new HttpError(400,'Amount exceeds the supported limit.');
 await tx.query('INSERT INTO shop_remittances(count_id,denominations,sent_minor,left_at_count_minor,recipient,actor_id,permission_override,sales_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[b.countId,JSON.stringify(b.denominations),sent,b.leftAtCountMinor??null,b.recipient?.trim()??null,actor.id,actor.role!=='admin'&&!!b.permissionOverride,b.salesDate??today()]);
 if(b.finalLeftMinor===undefined&&b.leftAtCountMinor===undefined)throw new HttpError(400,'Enter the final cash left in the shop.');
 if(sent)await cashEntry(tx,op,actor,count.drawer_id,-sent,'handover',b.reason);
 if(b.finalLeftMinor!==undefined){
 const expected=await total(tx,shop,day);
 await tx.query('INSERT INTO shop_day_closings(id,shop_id,business_date,expected_minor,left_minor,actor_id,reason,permission_override) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[randomUUID(),shop,day,expected,b.finalLeftMinor,actor.id,b.reason,actor.role!=='admin'&&!!b.permissionOverride]);
 await tx.query("UPDATE drawer_sessions SET status='closed' WHERE shop_id=$1 AND business_date=$2 AND status<>'closed'",[shop,day]);
 }
 return{id:b.countId};
 });
 write('close',{leftMinor:amount},async(tx,actor,_op,shop,b)=>{
 const day=await workingDay(tx,shop);
 const report=(await tx.query('SELECT c.id FROM shop_remittance_counts c JOIN shop_remittances r ON r.count_id=c.id WHERE c.shop_id=$1 AND c.business_date=$2',[shop,day])).rows[0];if(!report)throw new HttpError(409,'Record the money sent and cash left at counting before the final lock-up balance.');
 const expected=await total(tx,shop,day),id=randomUUID();
 await tx.query('INSERT INTO shop_day_closings(id,shop_id,business_date,expected_minor,left_minor,actor_id,reason,permission_override) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,shop,day,expected,b.leftMinor,actor.id,b.reason,actor.role!=='admin'&&!!b.permissionOverride]);
 await tx.query("UPDATE drawer_sessions SET status='closed' WHERE shop_id=$1 AND business_date=$2 AND status<>'closed'",[shop,day]);return actor.role==='admin'?{id,varianceMinor:b.leftMinor-expected}:{id};
 });
 write('review',{closingId:uuid},async(tx,actor,_op,shop,b)=>{if(actor.role!=='admin')throw new HttpError(403,'Only administrators can review a closing.');if(!(await tx.query('SELECT id FROM shop_day_closings WHERE id=$1 AND shop_id=$2',[b.closingId,shop])).rows.length)throw new HttpError(404,'Closing not found.');await tx.query('INSERT INTO shop_day_reviews(closing_id,actor_id,reason) VALUES($1,$2,$3)',[b.closingId,actor.id,b.reason]);return{id:b.closingId};});
 app.get<{Params:{shopId:string}}>(`/api/shops/:shopId/day`,{schema:{params}},async request=>{
 const actor=await actorOf(db,request),shop=request.params.shopId;await access(db,actor,shop);const day=await workingDay(db,shop);
 const summary=(await db.query(`SELECT coalesce(sum(c.amount_minor) FILTER(WHERE c.kind IN ('opening','retained_in')),0)::text AS opening,coalesce(sum(c.amount_minor) FILTER(WHERE c.kind='cash_in'),0)::text AS added,coalesce(sum(c.amount_minor) FILTER(WHERE c.kind IN ('sale','manual_sale')),0)::text AS sales,coalesce(sum(c.amount_minor) FILTER(WHERE c.kind IN ('refund','manual_refund')),0)::text AS refunds,coalesce(-sum(c.amount_minor) FILTER(WHERE c.kind IN ('expense','advance','withdrawal')),0)::text AS expenses,coalesce(-sum(c.amount_minor) FILTER(WHERE c.kind='handover'),0)::text AS sent,coalesce(sum(c.amount_minor),0)::text AS expected FROM cash_ledger c JOIN drawer_sessions d ON d.id=c.drawer_id WHERE d.shop_id=$1 AND d.business_date=$2`,[shop,day])).rows[0];
 const count=(await db.query(`SELECT c.*,c.business_date::text,r.sent_minor,r.left_at_count_minor,r.recipient,coalesce(r.sales_date,c.business_date)::text AS sales_date,r.created_at AS sent_at,u.display_name AS counter_name,(SELECT coalesce(sum(l.amount_minor),0)::text FROM cash_ledger l JOIN drawer_sessions d ON d.id=l.drawer_id WHERE d.shop_id=c.shop_id AND d.business_date=c.business_date AND l.kind='sale' AND l.created_at>c.created_at) AS late_sales FROM shop_remittance_counts c LEFT JOIN shop_remittances r ON r.count_id=c.id JOIN users u ON u.id=c.actor_id WHERE c.shop_id=$1 AND c.business_date=$2`,[shop,day])).rows[0]??null;
 const closings=(await db.query(`SELECT c.*,c.business_date::text,u.display_name AS closer_name,r.reason AS review,(SELECT coalesce(sum(l.amount_minor),0)::text FROM cash_ledger l JOIN drawer_sessions d ON d.id=l.drawer_id JOIN shop_remittance_counts rc ON rc.shop_id=d.shop_id AND rc.business_date=d.business_date WHERE d.shop_id=c.shop_id AND d.business_date=c.business_date AND l.kind='sale' AND l.created_at>rc.created_at) AS late_sales FROM shop_day_closings c JOIN users u ON u.id=c.actor_id LEFT JOIN shop_day_reviews r ON r.closing_id=c.id WHERE c.shop_id=$1 ORDER BY c.business_date DESC LIMIT 30`,[shop])).rows;
 const active=(await db.query("SELECT id,code,business_date::text,status FROM drawer_sessions WHERE shop_id=$1 AND status<>'closed' ORDER BY code",[shop])).rows;
 const reporting=(await db.query(`SELECT coalesce(sum(s.total_minor),0)::text AS total,
 '0'::text AS carried_late
 FROM sale_reporting_dates r JOIN sales s ON s.id=r.sale_id WHERE s.shop_id=$1 AND s.business_date=$2`,[shop,day])).rows[0];
 const nextDaySales=(await db.query(`SELECT coalesce(sum(s.total_minor),0)::text AS total FROM sale_reporting_dates r JOIN sales s ON s.id=r.sale_id WHERE s.shop_id=$1 AND s.business_date=$2 AND r.reporting_date=$2::date+1`,[shop,day])).rows[0];
 const priceExceptions=(await db.query(`SELECT s.id,s.created_at,u.display_name AS staff_name,e.catalogue_total_minor,e.charged_total_minor,(SELECT json_agg(json_build_object('description',l.description,'quantity',l.quantity,'normalMinor',l.price_minor*l.quantity,'chargedMinor',l.total_minor,'reason',l.price_exception_reason)) FROM sale_lines l WHERE l.sale_id=s.id AND l.price_exception_reason IS NOT NULL) AS lines FROM sale_price_exceptions e JOIN sales s ON s.id=e.sale_id JOIN users u ON u.id=e.actor_id WHERE s.shop_id=$1 AND s.business_date=$2 ORDER BY s.created_at DESC`,[shop,day])).rows;
 const exception=(await db.query(`SELECT m.id,m.summary_only,t.sales_minor FROM manual_days m LEFT JOIN exception_day_totals t ON t.day_id=m.id WHERE m.shop_id=$1 AND m.business_date=$2`,[shop,day])).rows[0]??null;
 const exceptionState=exception?{id:exception.id,summaryOnly:exception.summary_only,totalRecorded:exception.sales_minor!==null,...(actor.role==='admin'?{salesMinor:exception.sales_minor}:{})}:null;
 const canCount=actor.role==='admin'||!!(await db.query<{can_count_cash:boolean}>('SELECT can_count_cash FROM memberships WHERE user_id=$1 AND shop_id=$2',[actor.id,shop])).rows[0]?.can_count_cash;
 if(actor.role!=='admin')return{day,active,notes,canCount,exception:exceptionState,summary:null,reporting:null,nextDaySales:null,priceExceptions:[],
 count:count?{id:count.id,sent_minor:count.sent_minor,left_at_count_minor:count.left_at_count_minor,counter_name:count.counter_name,created_at:count.created_at,sales_cutoff:count.sales_cutoff,sales_date:count.sales_date,sent_at:count.sent_at}:null,
 closings:closings.map(c=>({id:c.id,business_date:c.business_date,left_minor:c.left_minor}))};
 const exceptionDates=(await db.query('SELECT business_date::text FROM manual_days WHERE shop_id=$1 AND business_date>=$2 ORDER BY business_date',[shop,today()])).rows;
 const manualTotal=(await db.query(`SELECT coalesce(sum(c.amount_minor) FILTER(WHERE c.kind='manual_sale'),0)::text AS total FROM cash_ledger c JOIN drawer_sessions d ON d.id=c.drawer_id WHERE d.shop_id=$1 AND d.business_date=$2`,[shop,day])).rows[0].total;
 reporting.manual_total=manualTotal;reporting.total=String(Number(reporting.total)+Number(manualTotal));
 const categoryLines=(await db.query(`SELECT l.id,l.category_name,l.description,l.quantity,l.unit_label,l.price_minor,l.total_minor,false AS carried_late
 FROM sale_lines l JOIN sales s ON s.id=l.sale_id JOIN sale_reporting_dates r ON r.sale_id=s.id
 WHERE s.shop_id=$1 AND s.business_date=$2 ORDER BY l.category_name,s.created_at,l.id`,[shop,day])).rows;
 return{day,summary,count,closings,active,notes,priceExceptions,reporting,nextDaySales,canCount,categoryLines,exception:exceptionState,exceptionDates};
 });
}
