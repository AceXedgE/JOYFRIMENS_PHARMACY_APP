import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database, Sql } from './database.ts';
import { HttpError } from './http.ts';
import { audit } from './setup.ts';

const uuid = { type: 'string', format: 'uuid' };
const str = (maxLength: number, minLength = 1) => ({ type: 'string', minLength, maxLength });
const integer = (minimum = 0) => ({ type: 'integer', minimum, maximum: 100000000 });
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties).filter(key => key !== 'forceDuplicate' && key !== 'submissionId'), additionalProperties: false });
const reasonSchema = str(300, 3);
const params = object({ id: uuid });
type Actor = { id: string; role: string; shared_storage_access: boolean };
type Place = { id: string; name: string; kind: string; shop_id: string | null };
type Batch = { id: string; product_id: string; expiry: string };
type Transfer = { id: string; batch_id: string; source_id: string; destination_id: string; quantity: number; received: number; lost: number };
type Write = { requestKey: string; reason: string; forceDuplicate?: boolean };
type Receipt = Write & { unitId: string; batchNumber: string; expiry: string; supplier: string; reference: string; expectedPacks: number; receivedPacks: number; allocations: { locationId: string; quantity: number }[] };
type ReceiptLine = Omit<Receipt, 'requestKey' | 'supplier' | 'reference'>;
type DocumentInput = Write & { submissionId?: string; supplier: string; reference: string; lines: ReceiptLine[] };
const receiptLineSchema = object({ forceDuplicate: { type: 'boolean' }, unitId: uuid, batchNumber: str(100), expiry: { type: 'string', format: 'date' }, expectedPacks: integer(1), receivedPacks: integer(), reason: reasonSchema,
  allocations: { type: 'array', minItems: 1, maxItems: 6, items: object({ locationId: uuid, quantity: integer() }) } });
const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
function required(s: string, minimum = 1) { const value = clean(s); if (value.length < minimum) throw new HttpError(400, 'Enter a meaningful value and reason.'); return value; }
function quantity(packs: number, multiplier: number) { const value = packs * multiplier; if (!Number.isSafeInteger(value) || value > 100000000) throw new HttpError(400, 'Quantity exceeds the supported limit.'); return value; }

export async function actorOf(tx: Sql, request: FastifyRequest, write = false): Promise<Actor> {
  if (!request.actor) throw new HttpError(401, 'Please sign in again.');
  const actor = (await tx.query<Actor>(`SELECT u.id,u.role,u.shared_storage_access FROM users u JOIN sessions s ON s.user_id=u.id
    WHERE u.id=$1 AND u.active=true AND s.token_hash=$2 AND s.expires_at>now() ${write ? 'FOR UPDATE OF u FOR SHARE OF s' : ''}`, [request.actor.id, request.actor.token_hash])).rows[0];
  if (!actor) throw new HttpError(401, 'Please sign in again.');
  return actor;
}
export async function place(tx: Sql, actor: Actor, id: string, write = false) {
  const location = (await tx.query<Place>('SELECT id,name,kind,shop_id FROM locations WHERE id=$1', [id])).rows[0];
  if (!location) throw new HttpError(404, 'Location not found or unavailable.');
  if (actor.role === 'admin') return location;
  if (location.shop_id) {
    const member = await tx.query(`SELECT user_id FROM memberships WHERE user_id=$1 AND shop_id=$2 ${write ? 'FOR SHARE' : ''}`, [actor.id, location.shop_id]);
    if (member.rows.length) return location;
  } else if (actor.shared_storage_access) return location;
  throw new HttpError(404, 'Location not found or unavailable.');
}
export async function productLock(tx: Sql, id: string) {
  const product=(await tx.query<{archived?:boolean}>('SELECT * FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(product?.archived)throw new HttpError(409,'This medicine has been removed. Restore it in Manage medicines before adding or moving stock.');
}
export async function batchLock(tx: Sql, id: string, usable = false) {
  const identity = (await tx.query<{ product_id: string }>('SELECT product_id FROM stock_batches WHERE id=$1', [id])).rows[0];
  if (!identity) throw new HttpError(404, 'Batch not found.');
  await productLock(tx, identity.product_id);
  const batch = (await tx.query<Batch>('SELECT id,product_id,expiry::text FROM stock_batches WHERE id=$1 FOR UPDATE', [id])).rows[0];
  if (!batch) throw new HttpError(404, 'Batch not found.');
  if (usable && batch.expiry <= new Date().toISOString().slice(0, 10)) throw new HttpError(409, 'Expired stock cannot be dispatched.');
  return batch;
}
async function balance(tx: Sql, location: string, batch: string) {
  await tx.query('INSERT INTO stock_balances(location_id,batch_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [location, batch]);
  return (await tx.query<{ quantity: number; reserved: number; version: number }>('SELECT quantity,reserved,version FROM stock_balances WHERE location_id=$1 AND batch_id=$2 FOR UPDATE', [location, batch])).rows[0];
}
export async function change(tx: Sql, location: string, batch: string, delta: number, forceDuplicate = false) {
  // Shelf quantities are historical movements only, never remaining inventory.
  if ((await tx.query<{kind:string}>('SELECT kind FROM locations WHERE id=$1',[location])).rows[0]?.kind === 'shelf') return;
  if (delta > 0 && !forceDuplicate) {
    const duplicate = await tx.query(`SELECT 1 FROM locations destination
      JOIN stock_batches incoming ON incoming.id=$2
      JOIN stock_batches existing ON existing.product_id=incoming.product_id AND (to_jsonb(existing)->>'variation_unit_id') IS NOT DISTINCT FROM (to_jsonb(incoming)->>'variation_unit_id')
      JOIN stock_balances s ON s.batch_id=existing.id AND s.quantity>0
      JOIN locations other ON other.id=s.location_id AND other.kind='shared'
      WHERE destination.id=$1 AND destination.kind='shared' AND other.id<>destination.id LIMIT 1`, [location, batch]);
    if (duplicate.rows.length) throw new HttpError(409, 'This medicine is already stocked in another main storeroom. Tick "Allow duplicate in main storerooms" to confirm this intentional duplication.');
  }
  const current = await balance(tx, location, batch);
  if (current.quantity + delta < current.reserved) throw new HttpError(409, 'Not enough unreserved stock at this location.');
  if (current.quantity + delta > 100000000) throw new HttpError(409, 'Location stock exceeds the supported limit.');
  await tx.query('UPDATE stock_balances SET quantity=quantity+$3,version=version+1 WHERE location_id=$1 AND batch_id=$2', [location, batch, delta]);
}
export async function entry(tx: Sql, operation: string, actor: Actor, batch: string, location: string | null, delta: number, kind: string, reason: string, transfer: string | null = null, receipt: string | null = null, details: unknown = {}) {
  await tx.query(`INSERT INTO stock_ledger(operation_id,actor_id,batch_id,location_id,delta,kind,reason,transfer_id,receipt_id,details)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [operation, actor.id, batch, location, delta, kind, reason, transfer, receipt, JSON.stringify(details)]);
}
// Actor locking serializes request keys, including retries after a lost response. Batch locks
// serialize stock mutations across actors; counts additionally require the displayed version.
export async function mutate(db: Database, request: FastifyRequest, action: string,
  work: (tx: Sql, actor: Actor, id: string, reason: string) => Promise<unknown>) {
  return db.transaction(async tx => {
    const body = request.body as Write;
    const actor = await actorOf(tx, request, true);
    const payload = JSON.stringify({ action, params: request.params, body: request.body });
    const prior = (await tx.query<{ payload: string; result: unknown }>('SELECT payload,result FROM stock_operations WHERE actor_id=$1 AND request_key=$2', [actor.id, body.requestKey])).rows[0];
    if (prior) {
      if (prior.payload !== payload) throw new HttpError(409, 'This request key was already used for a different operation.');
      return prior.result;
    }
    const id = randomUUID();
    const reason = required(body.reason, 3);
    const result = await work(tx, actor, id, reason);
    await tx.query('INSERT INTO stock_operations(id,actor_id,request_key,payload,result) VALUES($1,$2,$3,$4,$5)', [id, actor.id, body.requestKey, payload, JSON.stringify(result)]);
    await audit(tx, actor.id, `inventory.${action}`, id, { ...body, result });
    return result;
  });
}

async function referenceLock(tx: Sql, supplier: string, reference: string) {
  await tx.query('INSERT INTO supplier_reference_locks(supplier,reference) VALUES($1,$2) ON CONFLICT DO NOTHING', [supplier, reference]);
  await tx.query('SELECT supplier FROM supplier_reference_locks WHERE supplier=$1 AND reference=$2 FOR UPDATE', [supplier, reference]);
}

async function unitBatch(tx:Sql,unit:{product_id:string;variation?:boolean;base_quantity:number},unitId:string,batchNumber:string,expiry:string){
 const latest=(await tx.query<{base_quantity:number;variation:boolean;archived:boolean}>("SELECT coalesce((to_jsonb(u)->>'archived')::boolean,false) AS archived,base_quantity,coalesce((to_jsonb(u)->>'variation')::boolean,false) AS variation FROM selling_units u WHERE id=$1",[unitId])).rows[0];
 if(!latest||latest.archived||latest.base_quantity!==unit.base_quantity||latest.variation!==unit.variation)throw new HttpError(409,'Selling option changed. Refresh before receiving stock.');
 const variation=unit.variation?unitId:null;
 if(variation)await tx.query('INSERT INTO stock_batches(id,product_id,batch_number,expiry,variation_unit_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[randomUUID(),unit.product_id,batchNumber,expiry,variation]);
 else await tx.query('INSERT INTO stock_batches(id,product_id,batch_number,expiry) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[randomUUID(),unit.product_id,batchNumber,expiry]);
 return (await tx.query<{id:string}>("SELECT id FROM stock_batches b WHERE product_id=$1 AND batch_number=$2 AND expiry=$3 AND (to_jsonb(b)->>'variation_unit_id') IS NOT DISTINCT FROM $4::text FOR UPDATE",[unit.product_id,batchNumber,expiry,variation])).rows[0];
}

async function receiveLine(tx: Sql, actor: Actor, operation: string, input: Omit<Receipt, 'requestKey'>, reason: string) {
    const unit = (await tx.query<{ product_id: string; base_quantity: number; variation:boolean }>("SELECT product_id,base_quantity,coalesce((to_jsonb(u)->>'variation')::boolean,false) AS variation FROM selling_units u WHERE id=$1", [input.unitId])).rows[0];
    if (!unit) throw new HttpError(404, 'Selling unit not found.');
    const expected = quantity(input.expectedPacks, unit.base_quantity), received = quantity(input.receivedPacks, unit.base_quantity);
    if (new Set(input.allocations.map(a => a.locationId)).size !== input.allocations.length || input.allocations.reduce((sum, a) => sum + a.quantity, 0) !== received) throw new HttpError(400, 'Allocation quantities must equal the actual received base units, with each location listed once.');
    for (const allocation of input.allocations) await place(tx, actor, allocation.locationId, true);
    if (input.expiry <= new Date().toISOString().slice(0, 10)) throw new HttpError(400, 'Do not accept expired stock into available inventory.');
    await productLock(tx, unit.product_id);
    const batchNumber = required(input.batchNumber), supplier = required(input.supplier).toLowerCase(), reference = required(input.reference).toLowerCase();
    const batch = await unitBatch(tx,unit,input.unitId,batchNumber,input.expiry);
    const receipt = randomUUID();
    await tx.query(`INSERT INTO stock_receipts(id,batch_id,unit_id,supplier,reference,expected_quantity,received_quantity,reason,actor_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [receipt, batch.id, input.unitId, supplier, reference, expected, received, reason, actor.id]);
    for (const allocation of [...input.allocations].sort((a, b) => a.locationId.localeCompare(b.locationId))) {
      await change(tx, allocation.locationId, batch.id, allocation.quantity, input.forceDuplicate);
      await entry(tx, operation, actor, batch.id, allocation.locationId, allocation.quantity, 'delivery', reason, null, receipt, { expected, received });
    }
    return { id: receipt, batchId: batch.id, expected, received };
}

export function registerInventoryRoutes(app: FastifyInstance, db: Database) {
  app.post<{Body:Write & {sourceId:string;destinationId:string;unitId:string;batchNumber:string;expiry:string;packs:number}}>('/api/inventory/shelf-transfer',{schema:{body:object({requestKey:uuid,reason:reasonSchema,sourceId:uuid,destinationId:uuid,unitId:uuid,batchNumber:str(100),expiry:{type:'string',format:'date'},packs:integer(1)})}},async request=>mutate(db,request,'shelf_dispatch',async(tx,actor,operation,reason)=>{
    const input=request.body;const source=await place(tx,actor,input.sourceId,true);
    if(source.kind!=='shelf')throw new HttpError(400,'Choose the source shelf.');
    if(input.sourceId===input.destinationId||!(await tx.query('SELECT id FROM locations WHERE id=$1',[input.destinationId])).rows.length)throw new HttpError(400,'Choose a different destination.');
    const unit=(await tx.query<{product_id:string;base_quantity:number;variation:boolean}>("SELECT product_id,base_quantity,coalesce((to_jsonb(u)->>'variation')::boolean,false) AS variation FROM selling_units u WHERE id=$1",[input.unitId])).rows[0];
    if(!unit)throw new HttpError(404,'Medicine not found.');
    if(input.expiry<=new Date().toISOString().slice(0,10))throw new HttpError(400,'Expired stock cannot be dispatched.');
    await productLock(tx,unit.product_id);const batchNumber=required(input.batchNumber);
    const batch=await unitBatch(tx,unit,input.unitId,batchNumber,input.expiry);
    const amount=quantity(input.packs,unit.base_quantity),id=randomUUID();
    await tx.query('INSERT INTO stock_transfers(id,batch_id,source_id,destination_id,quantity,dispatched_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,batch.id,source.id,input.destinationId,amount,actor.id,reason]);
    await entry(tx,operation,actor,batch.id,source.id,-amount,'dispatch',reason,id,null,{shelfMovement:true});return{id};
  }));
  app.post<{Body:Write & {locationId:string;unitId:string;batchNumber:string;expiry:string;packs:number}}>('/api/inventory/manual', {schema:{body:object({requestKey:uuid,reason:reasonSchema,locationId:uuid,unitId:uuid,batchNumber:str(100),expiry:{type:'string',format:'date'},packs:integer(1),forceDuplicate:{type:'boolean'}})}},async request=>mutate(db,request,'manual_stock',async(tx,actor,operation,reason)=>{
    const input=request.body;const location=await place(tx,actor,input.locationId,true);
    if(location.kind==='shelf')throw new HttpError(400,'Manual stock entry is for storerooms only.');
    const unit=(await tx.query<{product_id:string;base_quantity:number;variation:boolean}>("SELECT product_id,base_quantity,coalesce((to_jsonb(u)->>'variation')::boolean,false) AS variation FROM selling_units u WHERE id=$1",[input.unitId])).rows[0];
    if(!unit)throw new HttpError(404,'Medicine not found.');
    if(input.expiry<=new Date().toISOString().slice(0,10))throw new HttpError(400,'Do not add expired stock to usable inventory.');
    await productLock(tx,unit.product_id);const batchNumber=required(input.batchNumber);
    const batch=await unitBatch(tx,unit,input.unitId,batchNumber,input.expiry);
    const amount=quantity(input.packs,unit.base_quantity);await change(tx,location.id,batch.id,amount,input.forceDuplicate);
    await entry(tx,operation,actor,batch.id,location.id,amount,'count',reason,null,null,{manualAddition:true,unitId:input.unitId,packs:input.packs});
    return {batchId:batch.id,added:amount};
  }));
  app.post<{ Body: DocumentInput }>('/api/inventory/deliveries', { bodyLimit: 512 * 1024, schema: { body: object({ submissionId:uuid, requestKey: uuid, reason: reasonSchema, supplier: str(150), reference: str(100), lines: { type: 'array', minItems: 1, maxItems: 100, items: receiptLineSchema } }) } }, async request => mutate(db, request, 'supplier_document', async (tx, actor, operation, reason) => {
    const supplier = required(request.body.supplier).toLowerCase(), reference = required(request.body.reference).toLowerCase();
    if(request.body.submissionId){
      const submission=(await tx.query<{location_id:string;supplier:string;reference:string;lines:{quantity:number;packSize:number}[]}>('SELECT i.location_id,i.supplier,s.reference,s.lines FROM supplier_submissions s JOIN supplier_invites i ON i.id=s.invite_id WHERE s.id=$1 FOR UPDATE OF s',[request.body.submissionId])).rows[0];
      if(!submission)throw new HttpError(404,'Supplier submission not found.');
      await place(tx,actor,submission.location_id,true);
      if(request.body.lines.length!==submission.lines.length)throw new HttpError(400,'Check every supplier line, including medicines that did not arrive.');
      for(const [i,line] of request.body.lines.entries()){
        const unit=(await tx.query<{base_quantity:number}>('SELECT base_quantity FROM selling_units WHERE id=$1',[line.unitId])).rows[0];
        if(!unit||line.expectedPacks*unit.base_quantity!==submission.lines[i].quantity*submission.lines[i].packSize)throw new HttpError(400,'Keep the supplier quantity on each line; enter differences in actual received.');
      }
      if(supplier!==submission.supplier.toLowerCase()||reference!==submission.reference.toLowerCase())throw new HttpError(400,'Keep the submitted supplier and reference.');
      if((await tx.query('SELECT document_id FROM supplier_submission_receipts WHERE submission_id=$1',[request.body.submissionId])).rows.length)throw new HttpError(409,'This supplier submission has already been received.');
    }
    await referenceLock(tx, supplier, reference);
    if ((await tx.query('SELECT id FROM stock_receipts WHERE supplier=$1 AND reference=$2', [supplier, reference])).rows.length) throw new HttpError(409, 'This supplier reference already has recorded stock. Review the existing receipt instead of entering it again.');
    const id = randomUUID();
    await tx.query('INSERT INTO supplier_documents(id,supplier,reference,reason,actor_id) VALUES($1,$2,$3,$4,$5)', [id, supplier, reference, reason, actor.id]);
    const lines = [];
    for (const [index, line] of request.body.lines.entries()) {
      const unit = (await tx.query<{ product_id: string;variation:boolean }>("SELECT product_id,coalesce((to_jsonb(u)->>'variation')::boolean,false) AS variation FROM selling_units u WHERE id=$1", [line.unitId])).rows[0];
      if (!unit) throw new HttpError(400, `Line ${index + 1}: choose an existing drug and pack.`);
      const key = JSON.stringify([unit.product_id, unit.variation?line.unitId:null, required(line.batchNumber), line.expiry]);
      lines.push({ index, line, key });
    }
    if (new Set(lines.map(line => line.key)).size !== lines.length) throw new HttpError(400, 'Combine duplicate drug/batch/expiry lines into one line, using base units if necessary.');
    // Lock shared batches in a consistent order even when suppliers list drugs differently.
    for (const item of [...lines].sort((a, b) => a.key.localeCompare(b.key))) {
      try {
        const receipt = await receiveLine(tx, actor, operation, { ...item.line, supplier, reference }, required(item.line.reason, 3));
        await tx.query('INSERT INTO supplier_document_lines(document_id,receipt_id,line_number) VALUES($1,$2,$3)', [id, receipt.id, item.index + 1]);
      } catch (error) {
        if (error instanceof HttpError) throw new HttpError(error.statusCode, `Line ${item.index + 1}: ${error.message}`);
        throw error;
      }
    }
    if(request.body.submissionId)await tx.query('INSERT INTO supplier_submission_receipts(submission_id,document_id) VALUES($1,$2)',[request.body.submissionId,id]);
    return { id, lineCount: lines.length };
  }));
  app.get<{ Params: { id: string } }>('/api/inventory/deliveries/:id', { schema: { params } }, async request => {
    const actor = await actorOf(db, request);
    const header = (await db.query(`SELECT d.*,u.display_name AS received_by FROM supplier_documents d JOIN users u ON u.id=d.actor_id WHERE d.id=$1`, [request.params.id])).rows[0];
    if (!header) throw new HttpError(404, 'Supplier receipt not found.');
    const allocations = (await db.query<{ receipt_id: string; location_id: string; name: string; quantity: number }>(`SELECT l.receipt_id,l.location_id,p.name,l.delta AS quantity
      FROM supplier_document_lines dl JOIN stock_ledger l ON l.receipt_id=dl.receipt_id JOIN locations p ON p.id=l.location_id WHERE dl.document_id=$1 ORDER BY p.name`, [request.params.id])).rows;
    for (const locationId of new Set(allocations.map(a => a.location_id))) await place(db, actor, locationId);
    const lines = (await db.query<{ id: string }>(`SELECT r.id,dl.line_number,r.expected_quantity,r.received_quantity,r.reason,coalesce(r.catalogue_snapshot->>'name',p.name) AS name,coalesce(r.catalogue_snapshot->>'strength',p.strength) AS strength,coalesce(r.catalogue_snapshot->>'dosage_form',p.dosage_form) AS dosage_form,coalesce(r.catalogue_snapshot->>'base_unit',p.base_unit) AS base_unit,b.batch_number,b.expiry::text,
      coalesce(r.catalogue_snapshot->>'label',u.label) AS label,coalesce((r.catalogue_snapshot->>'base_quantity')::integer,u.base_quantity) AS base_quantity,a.created_at AS approved_at,reviewer.display_name AS approved_by,a.reason AS approval_reason
      FROM supplier_document_lines dl JOIN stock_receipts r ON r.id=dl.receipt_id JOIN stock_batches b ON b.id=r.batch_id JOIN products p ON p.id=b.product_id
      JOIN selling_units u ON u.id=r.unit_id LEFT JOIN stock_receipt_approvals a ON a.receipt_id=r.id LEFT JOIN users reviewer ON reviewer.id=a.actor_id
      WHERE dl.document_id=$1 ORDER BY dl.line_number`, [request.params.id])).rows;
    return { header, lines: lines.map(line => ({ ...line, allocations: allocations.filter(a => a.receipt_id === line.id) })) };
  });
  app.post<{ Params: { id: string }; Body: Write }>('/api/inventory/deliveries/:id/approve', { schema: { params, body: object({ requestKey: uuid, reason: reasonSchema }) } }, async request => mutate(db, request, 'supplier_document_approved', async (tx, actor, _operation, reason) => {
    if (actor.role !== 'admin') throw new HttpError(403, 'Only administrators can approve a supplier receipt.');
    const header = (await tx.query('SELECT id FROM supplier_documents WHERE id=$1 FOR UPDATE', [request.params.id])).rows[0];
    if (!header) throw new HttpError(404, 'Supplier receipt not found.');
    await tx.query(`INSERT INTO stock_receipt_approvals(receipt_id,actor_id,reason) SELECT receipt_id,$2,$3 FROM supplier_document_lines WHERE document_id=$1`, [request.params.id, actor.id, reason]);
    return { id: request.params.id, approved: true };
  }));
  app.get('/api/inventory/options', async request => {
    const actor = await actorOf(db, request);
    const locations = (await db.query<Place>(`SELECT l.id,l.name,l.kind,l.shop_id FROM locations l WHERE $1::boolean
      OR (l.shop_id IS NULL AND $2::boolean) OR EXISTS(SELECT 1 FROM memberships m WHERE m.shop_id=l.shop_id AND m.user_id=$3) ORDER BY l.name`, [actor.role === 'admin', actor.shared_storage_access, actor.id])).rows;
    // Destination labels allow a dispatcher to choose the other shop without exposing its stock.
    const destinations = (await db.query<Place>('SELECT id,name,kind,shop_id FROM locations ORDER BY name')).rows;
    const units = (await db.query(`SELECT u.id,u.product_id,u.label,u.base_quantity,coalesce((to_jsonb(u)->>'variation')::boolean,false) AS variation,p.name,p.strength,p.dosage_form,CASE WHEN coalesce((to_jsonb(u)->>'variation')::boolean,false) THEN u.label ELSE p.base_unit END AS base_unit
      FROM selling_units u JOIN products p ON p.id=u.product_id WHERE coalesce((to_jsonb(u)->>'archived')::boolean,false)=false AND coalesce((to_jsonb(p)->>'archived')::boolean,false)=false ORDER BY p.name,p.strength,u.base_quantity`)).rows;
    return { locations, destinations, units, canAdjust: actor.role === 'admin' };
  });
  app.get<{ Params: { id: string } }>('/api/inventory/locations/:id', { schema: { params } }, async request => {
    const actor = await actorOf(db, request); await place(db, actor, request.params.id);
    const stocks = (await db.query(`SELECT s.batch_id,s.quantity,s.reserved,s.version,b.batch_number,b.expiry::text,p.id AS product_id,(to_jsonb(b)->>'variation_unit_id') AS variation_unit_id,concat(p.name,CASE WHEN v.id IS NOT NULL THEN ' / '||v.label ELSE '' END) AS name,p.strength,p.dosage_form,coalesce(v.label,p.base_unit) AS base_unit
      FROM stock_balances s JOIN stock_batches b ON b.id=s.batch_id JOIN products p ON p.id=b.product_id LEFT JOIN selling_units v ON v.id::text=(to_jsonb(b)->>'variation_unit_id')
      WHERE s.location_id=$1 AND EXISTS(SELECT 1 FROM locations WHERE id=$1 AND kind<>'shelf') ORDER BY p.name,b.expiry,b.batch_number`, [request.params.id])).rows;
    const transfers = (await db.query(`SELECT t.*,b.batch_number,b.expiry::text,coalesce(t.catalogue_snapshot->>'name',p.name) AS name,coalesce(t.catalogue_snapshot->>'strength',p.strength) AS strength,coalesce(t.catalogue_snapshot->>'base_unit',p.base_unit) AS base_unit,src.name AS source_name,dst.name AS destination_name,
      u.display_name AS dispatched_by_name FROM stock_transfers t JOIN stock_batches b ON b.id=t.batch_id JOIN products p ON p.id=b.product_id
      JOIN locations src ON src.id=t.source_id JOIN locations dst ON dst.id=t.destination_id JOIN users u ON u.id=t.dispatched_by
      WHERE (t.source_id=$1 OR t.destination_id=$1) AND (t.received+t.lost<t.quantity OR t.id IN
        (SELECT id FROM stock_transfers WHERE (source_id=$1 OR destination_id=$1) AND received+lost=quantity ORDER BY dispatched_at DESC LIMIT 100))
      ORDER BY t.dispatched_at DESC`, [request.params.id])).rows;
    const ledger = (await db.query(`SELECT l.id,l.batch_id,l.delta,l.kind,l.reason,l.details,l.transfer_id,l.receipt_id,l.created_at,u.display_name AS actor_name,coalesce(l.catalogue_snapshot->>'name',p.name) AS name,b.batch_number,
      document.document_id,r.supplier,r.reference,r.expected_quantity,r.received_quantity,approval.created_at AS approved_at,approver.display_name AS approved_by_name
      FROM stock_ledger l JOIN users u ON u.id=l.actor_id JOIN stock_batches b ON b.id=l.batch_id JOIN products p ON p.id=b.product_id
      LEFT JOIN stock_receipts r ON r.id=l.receipt_id LEFT JOIN supplier_document_lines document ON document.receipt_id=r.id LEFT JOIN stock_receipt_approvals approval ON approval.receipt_id=r.id
      LEFT JOIN users approver ON approver.id=approval.actor_id WHERE l.location_id=$1 ORDER BY l.id DESC LIMIT 100`, [request.params.id])).rows;
    return { stocks, transfers, ledger };
  });
  app.get<{ Params: { id: string } }>('/api/inventory/transfers/:id/history', { schema: { params } }, async request => {
    const actor = await actorOf(db, request);
    const transfer = (await db.query<Transfer>('SELECT * FROM stock_transfers WHERE id=$1', [request.params.id])).rows[0];
    if (!transfer) throw new HttpError(404, 'Transfer not found.');
    try { await place(db, actor, transfer.source_id); } catch (error) {
      if (!(error instanceof HttpError) || error.statusCode !== 404) throw error;
      await place(db, actor, transfer.destination_id);
    }
    return { events: (await db.query(`SELECT l.kind,l.delta,l.reason,l.details,l.created_at,u.display_name AS actor_name
      FROM stock_ledger l JOIN users u ON u.id=l.actor_id WHERE l.transfer_id=$1 ORDER BY l.id`, [transfer.id])).rows };
  });
  app.post<{ Body: Receipt }>('/api/inventory/receipts', { schema: { body: object({ forceDuplicate: { type: 'boolean' }, requestKey: uuid, reason: reasonSchema, unitId: uuid, batchNumber: str(100), expiry: { type: 'string', format: 'date' }, supplier: str(150), reference: str(100), expectedPacks: integer(1), receivedPacks: integer(), allocations: { type: 'array', minItems: 1, maxItems: 6, items: object({ locationId: uuid, quantity: integer() }) } }) } }, async request => mutate(db, request, 'delivery', async (tx, actor, operation, reason) => {
    const supplier = required(request.body.supplier).toLowerCase(), reference = required(request.body.reference).toLowerCase();
    await referenceLock(tx, supplier, reference);
    if ((await tx.query('SELECT id FROM supplier_documents WHERE supplier=$1 AND reference=$2', [supplier, reference])).rows.length) throw new HttpError(409, 'This supplier receipt has already been recorded.');
    return receiveLine(tx, actor, operation, request.body, reason);
  }));
  app.post<{ Params: { id: string }; Body: Write }>('/api/inventory/receipts/:id/approve', { schema: { params, body: object({ requestKey: uuid, reason: reasonSchema }) } }, async request => mutate(db, request, 'delivery_approved', async (tx, actor, _operation, reason) => {
    if (actor.role !== 'admin') throw new HttpError(403, 'Only administrators can approve a supplier receipt.');
    if ((await tx.query('SELECT document_id FROM supplier_document_lines WHERE receipt_id=$1', [request.params.id])).rows.length) throw new HttpError(409, 'Review and approve the complete supplier receipt.');
    const receipt = (await tx.query('SELECT id FROM stock_receipts WHERE id=$1 FOR UPDATE', [request.params.id])).rows[0];
    if (!receipt) throw new HttpError(404, 'Supplier receipt not found.');
    await tx.query('INSERT INTO stock_receipt_approvals(receipt_id,actor_id,reason) VALUES($1,$2,$3)', [request.params.id, actor.id, reason]);
    return { id: request.params.id, approved: true };
  }));
  app.post<{ Body: Write & { batchId: string; sourceId: string; destinationId: string; quantity: number } }>('/api/inventory/transfers', { schema: { body: object({ requestKey: uuid, reason: reasonSchema, batchId: uuid, sourceId: uuid, destinationId: uuid, quantity: integer(1) }) } }, async request => mutate(db, request, 'dispatch', async (tx, actor, operation, reason) => {
    const input = request.body; await place(tx, actor, input.sourceId, true);
    if (input.sourceId === input.destinationId) throw new HttpError(400, 'Choose a different destination.');
    if (!(await tx.query('SELECT id FROM locations WHERE id=$1', [input.destinationId])).rows.length) throw new HttpError(404, 'Destination not found.');
    await batchLock(tx, input.batchId, true);
    await change(tx, input.sourceId, input.batchId, -input.quantity);
    const id = randomUUID();
    await tx.query('INSERT INTO stock_transfers(id,batch_id,source_id,destination_id,quantity,dispatched_by,reason) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, input.batchId, input.sourceId, input.destinationId, input.quantity, actor.id, reason]);
    await entry(tx, operation, actor, input.batchId, input.sourceId, -input.quantity, 'dispatch', reason, id);
    return { id };
  }));
  for (const action of ['receive', 'loss'] as const) {
    app.post<{ Params: { id: string }; Body: Write & { quantity: number; expectedRemaining: number } }>(`/api/inventory/transfers/:id/${action}`, { schema: { params, body: object({ forceDuplicate: { type: 'boolean' }, requestKey: uuid, reason: reasonSchema, quantity: integer(action === 'loss' ? 1 : 0), expectedRemaining: integer(1) }) } }, async request => mutate(db, request, action, async (tx, actor, operation, reason) => {
      const first = (await tx.query<Transfer>('SELECT * FROM stock_transfers WHERE id=$1', [request.params.id])).rows[0];
      if (!first) throw new HttpError(404, 'Transfer not found.');
      await place(tx, actor, first.destination_id, true);
      if (action === 'loss' && actor.role !== 'admin') throw new HttpError(403, 'Only administrators can resolve transit losses.');
      await batchLock(tx, first.batch_id);
      const transfer = (await tx.query<Transfer>('SELECT * FROM stock_transfers WHERE id=$1 FOR UPDATE', [first.id])).rows[0];
      const remaining = transfer.quantity - transfer.received - transfer.lost;
      if (!remaining || remaining !== request.body.expectedRemaining) throw new HttpError(409, 'Transfer changed. Reload before recording a receipt.');
      if (request.body.quantity > remaining) throw new HttpError(400, 'Quantity exceeds the stock still in transit.');
      if (action === 'receive') await change(tx, transfer.destination_id, transfer.batch_id, request.body.quantity, request.body.forceDuplicate);
      await tx.query(`UPDATE stock_transfers SET ${action === 'receive' ? 'received=received' : 'lost=lost'}+$2 WHERE id=$1`, [transfer.id, request.body.quantity]);
      await entry(tx, operation, actor, transfer.batch_id, action === 'receive' ? transfer.destination_id : null,
        action === 'receive' ? request.body.quantity : -request.body.quantity, action === 'receive' ? 'receive' : 'transit_loss', reason, transfer.id, null,
        { remainingBefore: remaining, remainingAfter: remaining - request.body.quantity, discrepancy: action === 'receive' ? remaining - request.body.quantity : 0 });
      return { id: transfer.id, remaining: remaining - request.body.quantity };
    }));
  }
  app.post<{ Body: Write & { locationId: string; batchId: string; counted: number; expectedVersion: number } }>('/api/inventory/counts', { schema: { body: object({ forceDuplicate: { type: 'boolean' }, requestKey: uuid, reason: reasonSchema, locationId: uuid, batchId: uuid, counted: integer(), expectedVersion: integer(1) }) } }, async request => mutate(db, request, 'count', async (tx, actor, operation, reason) => {
    if (actor.role !== 'admin') throw new HttpError(403, 'Only administrators can post counted adjustments.');
    const input = request.body; const location=await place(tx, actor, input.locationId, true);
    if(location.kind==='shelf') throw new HttpError(400,'Shelf quantities are not counted. Use the unavailable mark instead.');
    await batchLock(tx, input.batchId);
    const current = await balance(tx, input.locationId, input.batchId);
    if (current.version !== input.expectedVersion) throw new HttpError(409, 'Stock changed after this count was opened. Reload and recount.');
    const delta = input.counted - current.quantity;
    await change(tx, input.locationId, input.batchId, delta, input.forceDuplicate);
    await entry(tx, operation, actor, input.batchId, input.locationId, delta, 'count', reason, null, null, { before: current.quantity, counted: input.counted, variance: delta });
    return { before: current.quantity, counted: input.counted, variance: delta };
  }));
}
