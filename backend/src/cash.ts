import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database, Sql } from './database.ts';
import { actorOf, mutate, productLock } from './inventory.ts';
import { access, cashEntry } from './sales.ts';
import { HttpError } from './http.ts';

const uuid = { type: 'string', format: 'uuid' };
const str = (maxLength = 300, minLength = 3) => ({ type: 'string', minLength, maxLength });
const integer = (minimum = 0) => ({ type: 'integer', minimum, maximum: 100000000 });
const boolean = { type: 'boolean' };
const optionalId = { anyOf: [uuid, { type: 'null' }] };
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const params = object({ shopId: uuid });
const date = { type: 'string', format: 'date' };
const today = () => new Date().toISOString().slice(0, 10);
type Actor = Awaited<ReturnType<typeof actorOf>>;
type Drawer = { id: string; shop_id: string; code: string; status: string; business_date: string };
interface Body {
 requestKey: string; reason: string; kind: string; amountMinor: number; payee: string; requestId: string; approved: boolean;
 drawerId: string; emergency: boolean; sourceId: string; destinationId: string; alternateId: string | null; transferMinor: number;
 countId: string; denominations: { valueMinor: number; quantity: number }[]; handoverMinor: number; recipientId: string | null;
 settlementId: string; code: string; name: string; productId: string; categoryId: string | null; expectedVersion: number;
 businessDate: string; dayId: string; reference: string; salesMinor: number; refundsMinor: number; evidence: string;
}
function admin(actor: Actor) { if (actor.role !== 'admin') throw new HttpError(403, 'Only an administrator can authorize this action.'); }
async function drawer(tx: Sql, shopId: string, id: string, status?: string, current = false) {
 const row = (await tx.query<Drawer>('SELECT id,shop_id,code,status,business_date::text FROM drawer_sessions WHERE id=$1 AND shop_id=$2 FOR UPDATE', [id,shopId])).rows[0];
 if (!row) throw new HttpError(404, 'Drawer not found in this shop.');
 if (status && row.status !== status) throw new HttpError(409, `This action requires a ${status} drawer. Refresh its status.`);
 if (current && row.business_date !== today()) throw new HttpError(409, 'Close the previous GMT day before using this drawer.');
 return row;
}
async function cash(tx: Sql, id: string) { return BigInt((await tx.query<{ amount: string }>('SELECT coalesce(sum(amount_minor),0)::text AS amount FROM cash_ledger WHERE drawer_id=$1', [id])).rows[0].amount); }
async function sufficient(tx: Sql, id: string, amount: number) { if (await cash(tx,id) < BigInt(amount)) throw new HttpError(409, 'Insufficient recorded cash in this drawer.'); }
async function count(tx: Sql, shopId: string, id: string, status?: string) {
 const c = (await tx.query<{ id: string; drawer_id: string; expected_minor: string }>('SELECT id,drawer_id,expected_minor::text FROM drawer_counts WHERE id=$1',[id])).rows[0];
 if (!c) throw new HttpError(404, 'Count not found.');
 await drawer(tx,shopId,c.drawer_id,status); return c;
}
const denominations = [20000,10000,5000,2000,1000,500,200,100,50,20,10,5,1];

export function registerCashRoutes(app: FastifyInstance, db: Database) {
 function write(path: string, fields: Record<string, unknown>, work: (tx: Sql, actor: Actor, operation: string, reason: string, body: Body, shopId: string) => Promise<unknown>, lockShop = false) {
  app.post<{ Params: { shopId: string }; Body: Body }>(`/api/shops/:shopId/cash/${path}`, { schema: { params, body: object({ requestKey: uuid, reason: str(), ...fields }) } }, async request => mutate(db,request,`cash_${path.replaceAll('/','_')}`,async(tx,actor,operation,reason)=>{
   if (lockShop) await tx.query('SELECT id FROM shops WHERE id=$1 FOR UPDATE',[request.params.shopId]);
   await access(tx,actor,request.params.shopId,true);
   if (['counts/start','counts/submit','counts/review','counts/close','retained/open'].includes(path) && (await tx.query('SELECT id FROM shop_remittance_counts WHERE shop_id=$1 AND business_date=$2',[request.params.shopId,today()])).rows.length) throw new HttpError(409,'Use Daily cash to finish this shop day.');
   return work(tx,actor,operation,reason,request.body,request.params.shopId);
  }));
 }
 write('money-out',{amountMinor:integer(1)},async(tx,actor,op,reason,b,shop)=>{
  const current=(await tx.query<{id:string}>("SELECT id FROM drawer_sessions WHERE shop_id=$1 AND business_date=$2 AND status='open' ORDER BY code DESC LIMIT 1 FOR UPDATE",[shop,today()])).rows[0];
  if(!current)throw new HttpError(409,'Start the shop day before recording money out.');
  await cashEntry(tx,op,actor,current.id,-b.amountMinor,'expense',reason);
  return{id:op,amountMinor:b.amountMinor};
 });
 write('requests', { kind: { type:'string',enum:['expense','advance','withdrawal'] }, amountMinor: integer(1), payee: str(120) },async(tx,actor,_op,reason,b,shop)=>{
  const id=randomUUID(); await tx.query('INSERT INTO cash_requests(id,shop_id,kind,amount_minor,payee,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,shop,b.kind,b.amountMinor,b.payee.trim(),reason,actor.id]); return {id};
 });
 write('decisions',{requestId:uuid,approved:boolean},async(tx,actor,_op,reason,b,shop)=>{
  admin(actor); const r=(await tx.query('SELECT id FROM cash_requests WHERE id=$1 AND shop_id=$2 FOR UPDATE',[b.requestId,shop])).rows[0];
  if(!r)throw new HttpError(404,'Request not found.');
  await tx.query('INSERT INTO cash_decisions(request_id,approved,actor_id,reason) VALUES($1,$2,$3,$4)',[b.requestId,b.approved,actor.id,reason]);return{id:b.requestId};
 });
 write('disbursements',{requestId:uuid,drawerId:uuid,emergency:boolean},async(tx,actor,op,reason,b,shop)=>{
  const r=(await tx.query<{kind:string;amount_minor:number}>('SELECT kind,amount_minor FROM cash_requests WHERE id=$1 AND shop_id=$2 FOR UPDATE',[b.requestId,shop])).rows[0];
  if(!r)throw new HttpError(404,'Request not found.');
  const decision=(await tx.query<{approved:boolean}>('SELECT approved FROM cash_decisions WHERE request_id=$1',[b.requestId])).rows[0];
  if(decision?.approved===false)throw new HttpError(409,'This request was rejected.');
  if(!decision?.approved&&!b.emergency)throw new HttpError(409,'Obtain approval before disbursement, or explicitly record an emergency payment for review.');
  await drawer(tx,shop,b.drawerId,'open',true); await sufficient(tx,b.drawerId,r.amount_minor);
  await tx.query('INSERT INTO cash_disbursements(request_id,drawer_id,emergency,actor_id,reason) VALUES($1,$2,$3,$4,$5)',[b.requestId,b.drawerId,!decision?.approved,actor.id,reason]);
  await cashEntry(tx,op,actor,b.drawerId,-r.amount_minor,r.kind,reason);return{id:b.requestId};
 });
 async function transfer(tx:Sql,actor:Actor,op:string,reason:string,source:string,destination:string,amount:number){
  if(amount===0)return; await sufficient(tx,source,amount);
  await cashEntry(tx,op,actor,source,-amount,'transfer_out',reason);await cashEntry(tx,op,actor,destination,amount,'transfer_in',reason);
 }
 write('transfers',{sourceId:uuid,destinationId:uuid,amountMinor:integer(1)},async(tx,actor,op,reason,b,shop)=>{
  admin(actor);if(b.sourceId===b.destinationId)throw new HttpError(400,'Select two different drawers.');
  for(const id of [b.sourceId,b.destinationId].sort())await drawer(tx,shop,id,'open',true);
  await transfer(tx,actor,op,reason,b.sourceId,b.destinationId,b.amountMinor);return{id:op};
 });
 write('counts/start',{drawerId:uuid,alternateId:optionalId,transferMinor:integer()},async(tx,actor,op,reason,b,shop)=>{
  if(b.drawerId===b.alternateId)throw new HttpError(400,'Sales must continue in a different drawer.');
  for(const id of [b.drawerId,...(b.alternateId?[b.alternateId]:[])].sort())await drawer(tx,shop,id);
  const existing=(await tx.query<{id:string}>('SELECT id FROM drawer_counts WHERE drawer_id=$1',[b.drawerId])).rows[0];if(existing)return existing;
  await drawer(tx,shop,b.drawerId,'open');
  if(b.alternateId)await drawer(tx,shop,b.alternateId,'open',true);
  if(b.transferMinor){admin(actor);if(!b.alternateId)throw new HttpError(400,'Choose the receiving drawer for the float.');await transfer(tx,actor,op,reason,b.drawerId,b.alternateId,b.transferMinor);}
  const expected=await cash(tx,b.drawerId);
  const sequence=(await tx.query<{seq:string}>('SELECT coalesce(max(id),0)::text AS seq FROM cash_ledger WHERE drawer_id=$1',[b.drawerId])).rows[0].seq;
  const id=randomUUID();await tx.query('INSERT INTO drawer_counts(id,drawer_id,actor_id,cutoff_sequence,expected_minor,alternate_drawer_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,b.drawerId,actor.id,sequence,expected.toString(),b.alternateId,reason]);
  await tx.query("UPDATE drawer_sessions SET status='counting' WHERE id=$1",[b.drawerId]);return{id};
 });
 write('counts/submit',{countId:uuid,denominations:{type:'array',minItems:1,maxItems:13,items:object({valueMinor:{type:'integer',enum:denominations},quantity:integer()})}},async(tx,actor,_op,reason,b,shop)=>{
  const c=await count(tx,shop,b.countId,'counting');
  if(new Set(b.denominations.map(d=>d.valueMinor)).size!==b.denominations.length)throw new HttpError(400,'Enter each denomination once.');
  const amount=b.denominations.reduce((s,d)=>s+d.valueMinor*d.quantity,0);if(!Number.isSafeInteger(amount)||amount>100000000)throw new HttpError(400,'Count exceeds GHS 1,000,000.');
  await tx.query('INSERT INTO cash_count_submissions(count_id,actor_id,denominations,counted_minor,reason) VALUES($1,$2,$3,$4,$5)',[c.id,actor.id,JSON.stringify(b.denominations),amount,reason]);
  await tx.query("UPDATE drawer_sessions SET status='submitted' WHERE id=$1",[c.drawer_id]);return actor.role==='admin'?{id:c.id,countedMinor:amount,varianceMinor:(BigInt(amount)-BigInt(c.expected_minor)).toString()}:{id:c.id,countedMinor:amount};
 });
 write('counts/review',{countId:uuid},async(tx,actor,_op,reason,b,shop)=>{
  admin(actor);const c=await count(tx,shop,b.countId,'submitted');
  await tx.query('INSERT INTO cash_count_reviews(count_id,actor_id,resolution) VALUES($1,$2,$3)',[c.id,actor.id,reason]);await tx.query("UPDATE drawer_sessions SET status='reviewed' WHERE id=$1",[c.drawer_id]);return{id:c.id};
 });
 write('counts/close',{countId:uuid,handoverMinor:integer(),recipientId:optionalId},async(tx,actor,op,reason,b,shop)=>{
  admin(actor);const c=await count(tx,shop,b.countId,'reviewed');
  const submission=(await tx.query<{counted_minor:number}>('SELECT counted_minor FROM cash_count_submissions WHERE count_id=$1',[c.id])).rows[0];
  if(b.handoverMinor>submission.counted_minor)throw new HttpError(400,'Hand over no more than the physically counted cash.');
  if(b.handoverMinor && (!b.recipientId||b.recipientId===actor.id||!(await tx.query("SELECT id FROM users WHERE id=$1 AND active=true AND role='admin'",[b.recipientId])).rows.length))throw new HttpError(400,'Choose a different active administrator to acknowledge the handover.');
  const retained=submission.counted_minor-b.handoverMinor,id=randomUUID();
  await tx.query('INSERT INTO cash_settlements(id,count_id,handover_minor,retained_minor,recipient_id,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,c.id,b.handoverMinor,retained,b.handoverMinor?b.recipientId:null,actor.id,reason]);
  if(b.handoverMinor)await cashEntry(tx,op,actor,c.drawer_id,-b.handoverMinor,'handover',reason);
  if(retained)await cashEntry(tx,op,actor,c.drawer_id,-retained,'retained_out',reason);
  await tx.query("UPDATE drawer_sessions SET status='closed' WHERE id=$1",[c.drawer_id]);return{id,retainedMinor:retained};
 });
 write('handovers/acknowledge',{settlementId:uuid},async(tx,actor,_op,reason,b,shop)=>{
  admin(actor);const row=(await tx.query<{recipient_id:string}>(`SELECT s.recipient_id FROM cash_settlements s JOIN drawer_counts c ON c.id=s.count_id JOIN drawer_sessions d ON d.id=c.drawer_id WHERE s.id=$1 AND d.shop_id=$2 AND s.handover_minor>0`,[b.settlementId,shop])).rows[0];
  if(!row||row.recipient_id!==actor.id)throw new HttpError(403,'Only the named recipient can acknowledge this handover.');
  await tx.query('INSERT INTO cash_handover_acknowledgments(settlement_id,actor_id,reason) VALUES($1,$2,$3)',[b.settlementId,actor.id,reason]);return{id:b.settlementId};
 });
 write('retained/open',{settlementId:uuid,code:{type:'string',enum:['A','B']}},async(tx,actor,op,reason,b,shop)=>{
  admin(actor);const s=(await tx.query<{retained_minor:number}>(`SELECT s.retained_minor FROM cash_settlements s JOIN drawer_counts c ON c.id=s.count_id JOIN drawer_sessions d ON d.id=c.drawer_id WHERE s.id=$1 AND d.shop_id=$2 FOR UPDATE OF s`,[b.settlementId,shop])).rows[0];
  if(!s||!s.retained_minor)throw new HttpError(404,'Retained float not found.');
  const id=randomUUID();await tx.query('INSERT INTO drawer_sessions(id,shop_id,code,opening_minor,opening_source,opened_by) VALUES($1,$2,$3,$4,$5,$6)',[id,shop,b.code,s.retained_minor,`Retained float ${b.settlementId}`,actor.id]);
  await tx.query('INSERT INTO retained_float_claims(settlement_id,drawer_id,actor_id) VALUES($1,$2,$3)',[b.settlementId,id,actor.id]);
  await cashEntry(tx,op,actor,id,s.retained_minor,'retained_in',reason);return{id};
 });
 app.get<{Params:{shopId:string}}>('/api/shops/:shopId/cash/categories',{schema:{params}},async request=>{
  const actor=await actorOf(db,request);admin(actor);await access(db,actor,request.params.shopId);
  const categories=(await db.query('SELECT id,name FROM financial_categories ORDER BY name')).rows;
  const products=(await db.query(`SELECT p.id,p.name,p.strength,c.category_id,coalesce(c.version,0) AS version FROM products p LEFT JOIN product_financial_categories c ON c.product_id=p.id ORDER BY p.name,p.strength,p.id`)).rows;
  return{categories,products};
 });
 write('categories',{name:str(80)},async(tx,actor,_op,_reason,b)=>{admin(actor);const name=b.name.trim().replace(/\s+/g,' ');if(name.toLowerCase()==='general')throw new HttpError(400,'General is the default category.');const id=randomUUID();await tx.query('INSERT INTO financial_categories(id,name,actor_id) VALUES($1,$2,$3)',[id,name,actor.id]);return{id};});
 write('categories/assign',{productId:uuid,categoryId:optionalId,expectedVersion:integer()},async(tx,actor,_op,_reason,b)=>{
  admin(actor);await productLock(tx,b.productId);const prior=(await tx.query<{version:number}>('SELECT version FROM product_financial_categories WHERE product_id=$1',[b.productId])).rows[0];
  if((prior?.version??0)!==b.expectedVersion)throw new HttpError(409,'Category assignment changed. Refresh it.');
  await tx.query('INSERT INTO product_financial_categories(product_id,category_id,version) VALUES($1,$2,1) ON CONFLICT(product_id) DO UPDATE SET category_id=$2,version=product_financial_categories.version+1',[b.productId,b.categoryId]);return{id:b.productId};
 });
 write('manual-days',{businessDate:date},async(tx,actor,_op,reason,b,shop)=>{
  admin(actor);if(b.businessDate<today())throw new HttpError(400,'Manual days must be approved before use, never backdated.');
  if((await tx.query('SELECT id FROM sales WHERE shop_id=$1 AND business_date=$2 LIMIT 1',[shop,b.businessDate])).rows.length)throw new HttpError(409,'Normal sales already exist on this day.');
  const id=randomUUID();await tx.query('INSERT INTO manual_days(id,shop_id,business_date,actor_id,reason) VALUES($1,$2,$3,$4,$5)',[id,shop,b.businessDate,actor.id,reason]);return{id};
 },true);
 write('manual-receipts',{dayId:uuid,drawerId:uuid,reference:str(120),salesMinor:integer(1),refundsMinor:integer()},async(tx,actor,op,reason,b,shop)=>{
  const day=(await tx.query<{business_date:string;summary_only:boolean}>('SELECT business_date::text,summary_only FROM manual_days WHERE id=$1 AND shop_id=$2 FOR UPDATE',[b.dayId,shop])).rows[0];
  if(!day)throw new HttpError(404,'Manual day not found.');if(day.summary_only)throw new HttpError(409,'Record the exception-day total under Daily cash.');if(day.business_date>today())throw new HttpError(400,'This manual day has not started.');
  const d=await drawer(tx,shop,b.drawerId,'open');if(d.business_date!==day.business_date)throw new HttpError(400,'Use the original manual-day drawer.');
  if(b.refundsMinor>b.salesMinor)throw new HttpError(400,'Refunds on a manual receipt cannot exceed its recorded sales.');
  if((await tx.query('SELECT day_id FROM manual_day_reviews WHERE day_id=$1',[b.dayId])).rows.length)throw new HttpError(409,'This manual day is already reviewed.');
  const id=randomUUID();await tx.query('INSERT INTO manual_receipts(id,day_id,drawer_id,reference,sales_minor,refunds_minor,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,b.dayId,b.drawerId,b.reference.trim().toUpperCase(),b.salesMinor,b.refundsMinor,actor.id,reason]);
  await cashEntry(tx,op,actor,b.drawerId,b.salesMinor,'manual_sale',reason);if(b.refundsMinor)await cashEntry(tx,op,actor,b.drawerId,-b.refundsMinor,'manual_refund',reason);return{id};
 });
 write('manual-days/review',{dayId:uuid,evidence:str(1000)},async(tx,actor,_op,reason,b,shop)=>{
  admin(actor);const day=(await tx.query<{business_date:string}>('SELECT business_date::text FROM manual_days WHERE id=$1 AND shop_id=$2 FOR UPDATE',[b.dayId,shop])).rows[0];if(!day)throw new HttpError(404,'Manual day not found.');
  const drawers=(await tx.query<{status:string}>('SELECT status FROM drawer_sessions WHERE shop_id=$1 AND business_date=$2',[shop,day.business_date])).rows;
  if(!drawers.length||drawers.some(d=>d.status!=='closed'))throw new HttpError(409,'Count and close every drawer for this manual day first.');
  await tx.query('INSERT INTO manual_day_reviews(day_id,actor_id,evidence) VALUES($1,$2,$3)',[b.dayId,actor.id,`${reason}\n${b.evidence}`]);return{id:b.dayId};
 });
 registerCashReads(app,db);
}

function registerCashReads(app:FastifyInstance,db:Database) {
 app.get<{Params:{shopId:string};Querystring:{date?:string}}>('/api/shops/:shopId/cash/workspace',{schema:{params,querystring:{type:'object',additionalProperties:false,properties:{date}}}},async request=>{
  const actor=await actorOf(db,request);await access(db,actor,request.params.shopId);const shop=request.params.shopId,day=request.query.date??today();
  const drawers=(await db.query(`SELECT d.*,d.business_date::text,coalesce((SELECT sum(amount_minor) FROM cash_ledger l WHERE l.drawer_id=d.id),0)::text AS expected_minor FROM drawer_sessions d WHERE d.shop_id=$1 AND (d.status<>'closed' OR d.business_date=$2) ORDER BY d.opened_at DESC`,[shop,day])).rows;
  const counts=(await db.query(`SELECT c.*,c.expected_minor::text,d.code,d.status,d.business_date::text,u.display_name AS counter_name,s.counted_minor,s.denominations,(s.counted_minor-c.expected_minor)::text AS variance_minor,r.resolution,v.display_name AS reviewer_name
   FROM drawer_counts c JOIN drawer_sessions d ON d.id=c.drawer_id JOIN users u ON u.id=c.actor_id LEFT JOIN cash_count_submissions s ON s.count_id=c.id LEFT JOIN cash_count_reviews r ON r.count_id=c.id LEFT JOIN users v ON v.id=r.actor_id
   WHERE d.shop_id=$1 AND (d.status<>'closed' OR d.business_date=$2) ORDER BY c.cutoff_at DESC`,[shop,day])).rows;
  const requests=(await db.query(`SELECT r.*,u.display_name AS requested_by,c.approved,c.reason AS decision_reason,d.emergency,d.drawer_id,d.created_at AS paid_at FROM cash_requests r JOIN users u ON u.id=r.actor_id LEFT JOIN cash_decisions c ON c.request_id=r.id LEFT JOIN cash_disbursements d ON d.request_id=r.id WHERE r.shop_id=$1 AND ((r.created_at AT TIME ZONE 'Etc/GMT')::date=$2 OR d.request_id IS NULL OR (d.emergency AND c.request_id IS NULL)) ORDER BY r.created_at DESC`,[shop,day])).rows;
  if(actor.role!=='admin')return{day,drawers:drawers.map(d=>({id:d.id,code:d.code,status:d.status,business_date:d.business_date})),requests,counts:[],settlements:[],categories:[],products:[],recipients:[],manualDays:[],manualReceipts:[],ledger:[],totals:[],categoryTotals:[],categoryLines:[],previousLateSales:[],denominations,canAdmin:false};
  const settlements=(await db.query(`SELECT s.*,d.code,d.business_date::text,u.display_name AS recipient_name,a.created_at AS acknowledged_at,f.drawer_id AS claimed_drawer_id FROM cash_settlements s JOIN drawer_counts c ON c.id=s.count_id JOIN drawer_sessions d ON d.id=c.drawer_id LEFT JOIN users u ON u.id=s.recipient_id LEFT JOIN cash_handover_acknowledgments a ON a.settlement_id=s.id LEFT JOIN retained_float_claims f ON f.settlement_id=s.id WHERE d.shop_id=$1 AND (d.business_date=$2 OR (s.handover_minor>0 AND a.settlement_id IS NULL) OR (s.retained_minor>0 AND f.settlement_id IS NULL)) ORDER BY s.created_at DESC`,[shop,day])).rows;
  const categories=(await db.query('SELECT id,name FROM financial_categories ORDER BY name')).rows;
  const products=actor.role==='admin'?(await db.query(`SELECT p.id,p.name,p.strength,c.category_id,coalesce(c.version,0) AS version FROM products p LEFT JOIN product_financial_categories c ON c.product_id=p.id ORDER BY p.name`)).rows:[];
  const recipients=actor.role==='admin'?(await db.query("SELECT id,display_name AS name FROM users WHERE role='admin' AND active=true ORDER BY display_name")).rows:[];
  const manualDays=(await db.query(`SELECT m.*,m.business_date::text,r.evidence,r.created_at AS reviewed_at,coalesce((SELECT sum(sales_minor) FROM manual_receipts a WHERE a.day_id=m.id),0)::text AS sales_minor,coalesce((SELECT sum(refunds_minor) FROM manual_receipts a WHERE a.day_id=m.id),0)::text AS refunds_minor FROM manual_days m LEFT JOIN manual_day_reviews r ON r.day_id=m.id WHERE m.shop_id=$1 AND (m.business_date=$2 OR r.day_id IS NULL) ORDER BY m.business_date DESC`,[shop,day])).rows;
  const ledger=(await db.query(`SELECT l.id,l.kind,l.amount_minor,l.reason,l.created_at,d.code,u.display_name AS actor_name FROM cash_ledger l JOIN drawer_sessions d ON d.id=l.drawer_id JOIN users u ON u.id=l.actor_id WHERE d.shop_id=$1 AND (l.created_at AT TIME ZONE 'Etc/GMT')::date=$2 ORDER BY l.id DESC LIMIT 200`,[shop,day])).rows;
  const totals=(await db.query(`SELECT kind,sum(amount_minor)::text AS amount_minor FROM cash_ledger l JOIN drawer_sessions d ON d.id=l.drawer_id WHERE d.shop_id=$1 AND (l.created_at AT TIME ZONE 'Etc/GMT')::date=$2 GROUP BY kind ORDER BY kind`,[shop,day])).rows;
  const categoryTotals=(await db.query(`SELECT category_name,sum(gross)::text AS gross_minor,sum(refunds)::text AS refunds_minor FROM (
   SELECT l.category_name,l.total_minor::bigint AS gross,0::bigint AS refunds FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE s.shop_id=$1 AND s.business_date=$2
   UNION ALL SELECT l.category_name,0,r.amount_minor FROM sale_refund_lines r JOIN sale_refunds f ON f.id=r.refund_id JOIN sales s ON s.id=f.sale_id JOIN sale_lines l ON l.id=r.sale_line_id WHERE s.shop_id=$1 AND (f.created_at AT TIME ZONE 'Etc/GMT')::date=$2
   UNION ALL SELECT 'Manual - unallocated',r.sales_minor,r.refunds_minor FROM manual_receipts r JOIN manual_days m ON m.id=r.day_id WHERE m.shop_id=$1 AND m.business_date=$2
   ) amounts GROUP BY category_name ORDER BY category_name`,[shop,day])).rows;
  const categoryLines=(await db.query(`SELECT l.id,l.category_name,l.description,l.quantity,l.unit_label,l.price_minor,l.total_minor,s.receipt_number::text,s.business_date::text,
   coalesce((SELECT sum(r.amount_minor) FROM sale_refund_lines r JOIN sale_refunds f ON f.id=r.refund_id WHERE r.sale_line_id=l.id AND (f.created_at AT TIME ZONE 'Etc/GMT')::date=$2),0)::text AS refunds_today
   FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE s.shop_id=$1 AND (s.business_date=$2 OR EXISTS(SELECT 1 FROM sale_refund_lines r JOIN sale_refunds f ON f.id=r.refund_id WHERE r.sale_line_id=l.id AND (f.created_at AT TIME ZONE 'Etc/GMT')::date=$2)) ORDER BY s.created_at,l.id`,[shop,day])).rows;
  const manualReceipts=(await db.query(`SELECT r.*,m.business_date::text FROM manual_receipts r JOIN manual_days m ON m.id=r.day_id WHERE m.shop_id=$1 AND m.business_date=$2 ORDER BY r.created_at`,[shop,day])).rows;
  const previousLateSales=(await db.query(`SELECT s.id,s.receipt_number::text,s.business_date::text,s.total_minor FROM sales s WHERE s.shop_id=$1 AND s.business_date=$2::date-1 AND s.created_at>(SELECT min(c.cutoff_at) FROM drawer_counts c JOIN drawer_sessions d ON d.id=c.drawer_id WHERE d.shop_id=$1 AND d.business_date=$2::date-1) ORDER BY s.created_at`,[shop,day])).rows;
  return{day,drawers,counts,requests,settlements,categories,products,recipients,manualDays,manualReceipts,ledger,totals,categoryTotals,categoryLines,previousLateSales,denominations,canAdmin:actor.role==='admin'};
 });
 app.get('/api/admin/cash/summary',async request=>{
  const actor=await actorOf(db,request);admin(actor);
  const shops=(await db.query(`SELECT sh.id,sh.name,
   coalesce((SELECT sum(s.total_minor) FROM sales s WHERE s.shop_id=sh.id AND s.business_date=(now() AT TIME ZONE 'Etc/GMT')::date),0)::text AS sales_minor,
   coalesce((SELECT sum(r.sales_minor) FROM manual_receipts r JOIN manual_days m ON m.id=r.day_id WHERE m.shop_id=sh.id AND m.business_date=(now() AT TIME ZONE 'Etc/GMT')::date),0)::text AS manual_sales_minor,
   (coalesce((SELECT sum(f.amount_minor) FROM sale_refunds f JOIN sales s ON s.id=f.sale_id WHERE s.shop_id=sh.id AND (f.created_at AT TIME ZONE 'Etc/GMT')::date=(now() AT TIME ZONE 'Etc/GMT')::date),0)+coalesce((SELECT sum(r.refunds_minor) FROM manual_receipts r JOIN manual_days m ON m.id=r.day_id WHERE m.shop_id=sh.id AND m.business_date=(now() AT TIME ZONE 'Etc/GMT')::date),0))::text AS refunds_minor,
   coalesce((SELECT sum(l.amount_minor) FROM cash_ledger l JOIN drawer_sessions d ON d.id=l.drawer_id WHERE d.shop_id=sh.id AND d.status<>'closed'),0)::text AS expected_active_minor,
   coalesce((SELECT sum(cs.retained_minor) FROM cash_settlements cs JOIN drawer_counts c ON c.id=cs.count_id JOIN drawer_sessions d ON d.id=c.drawer_id LEFT JOIN retained_float_claims f ON f.settlement_id=cs.id WHERE d.shop_id=sh.id AND f.settlement_id IS NULL),0)::text AS retained_minor,
   coalesce((SELECT sum(cs.handover_minor) FROM cash_settlements cs JOIN drawer_counts c ON c.id=cs.count_id JOIN drawer_sessions d ON d.id=c.drawer_id LEFT JOIN cash_handover_acknowledgments a ON a.settlement_id=cs.id WHERE d.shop_id=sh.id AND a.settlement_id IS NULL),0)::text AS pending_handover_minor,
   (SELECT count(*) FROM drawer_sessions d WHERE d.shop_id=sh.id AND d.status<>'closed' AND d.business_date<(now() AT TIME ZONE 'Etc/GMT')::date)::int AS overdue_drawers,
   (SELECT count(*) FROM drawer_counts c JOIN drawer_sessions d ON d.id=c.drawer_id JOIN cash_count_submissions s ON s.count_id=c.id LEFT JOIN cash_count_reviews r ON r.count_id=c.id WHERE d.shop_id=sh.id AND s.counted_minor<>c.expected_minor AND r.count_id IS NULL)::int AS unreviewed_variances,
   (SELECT count(*) FROM cash_disbursements d JOIN cash_requests r ON r.id=d.request_id LEFT JOIN cash_decisions c ON c.request_id=r.id WHERE r.shop_id=sh.id AND d.emergency AND c.request_id IS NULL)::int AS emergency_payments,
   (SELECT count(*) FROM manual_days m LEFT JOIN manual_day_reviews r ON r.day_id=m.id WHERE m.shop_id=sh.id AND r.day_id IS NULL AND m.business_date<=(now() AT TIME ZONE 'Etc/GMT')::date)::int AS incomplete_manual_days
   FROM shops sh ORDER BY sh.name`)).rows;return{shops};
 });
}
