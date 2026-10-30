import { rankProduct } from './catalogue-search.ts';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Database, Sql } from './database.ts';
import { actorOf, batchLock, change, mutate, productLock } from './inventory.ts';
import { HttpError } from './http.ts';

const uuid = { type: 'string', format: 'uuid' };
const integer = (minimum = 0) => ({ type: 'integer', minimum, maximum: 100000000 });
const text = (maxLength = 300, minLength = 3) => ({ type: 'string', minLength, maxLength });
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties).filter(k => !['chargedMinor','exceptionReason','drawerId','tenderMinor','paymentMethod','occurredAt'].includes(k)), additionalProperties: false });
const write = { requestKey: uuid, reason: text() };
const shopParams = object({ shopId: uuid });
const idParams = object({ shopId: uuid, id: uuid });
type Params = { shopId: string; id: string };
type Write = { requestKey: string; reason: string };
type Actor = Awaited<ReturnType<typeof actorOf>>;
type Line = { unitId: string; batchId: string | null; locationId: string; quantity: number; priceMinor: number; priceVersion: number; chargedMinor?: number; exceptionReason?: 'shortfall' | 'no_change' };
type Quoted = Line & { productId: string; baseQuantity: number; description: string; unitLabel: string; batchNumber: string | null; expiry: string | null; locationName: string };
type Draft = { id: string; shop_id: string; actor_id: string; status: string; version: number; lines: Quoted[] };
type Drawer = { id: string; shop_id: string; status: string; business_date: string };
const lineSchema = object({ unitId: uuid, batchId: { anyOf: [uuid, { type: 'null' }] }, locationId: uuid, quantity: integer(1), priceMinor: integer(1), priceVersion: integer(1), chargedMinor: integer(1), exceptionReason: { type: 'string', enum: ['shortfall','no_change'] } });
const linesSchema = { type: 'array', maxItems: 100, items: lineSchema };
const today = () => new Date().toISOString().slice(0, 10);
function bounded(value: number) { if (!Number.isSafeInteger(value) || value < 0 || value > 100000000) throw new HttpError(400, 'Quantity or amount exceeds the supported limit.'); return value; }
export async function access(tx: Sql, actor: Actor, shopId: string, write = false) {
  const shop = (await tx.query<{ currency: string; timezone: string }>(`SELECT currency,timezone FROM shops WHERE id=$1 ${write ? 'FOR SHARE' : ''}`, [shopId])).rows[0];
  if (!shop) throw new HttpError(404, 'Shop not found.');
  if (actor.role !== 'admin' && !(await tx.query(`SELECT user_id FROM memberships WHERE user_id=$1 AND shop_id=$2 ${write ? 'FOR SHARE' : ''}`, [actor.id, shopId])).rows.length) throw new HttpError(404, 'Shop not found or unavailable to your account.');
  if (shop.currency !== 'GHS' || shop.timezone !== 'Etc/GMT') throw new HttpError(409, 'Sales require the configured GHS currency and GMT timezone.');
}
async function draftOf(tx: Sql, actor: Actor, shopId: string, id: string, version: number) {
  const draft = (await tx.query<Draft>('SELECT * FROM sale_drafts WHERE id=$1 AND shop_id=$2 AND actor_id=$3 FOR UPDATE', [id, shopId, actor.id])).rows[0];
  if (!draft) throw new HttpError(404, 'Basket not found in this shop or account.');
  if (draft.version !== version || !['open', 'parked'].includes(draft.status)) throw new HttpError(409, 'Basket changed or was already finalized. Reload it before continuing.');
  return draft;
}
async function drawerOf(tx: Sql, shopId: string, id: string) {
  const drawer = (await tx.query<Drawer>('SELECT id,shop_id,status,business_date::text FROM drawer_sessions WHERE id=$1 AND shop_id=$2 FOR UPDATE', [id, shopId])).rows[0];
  if (!drawer || drawer.status !== 'open') throw new HttpError(409, 'Choose an open cash drawer in this shop.');
  if (drawer.business_date !== today()) throw new HttpError(409, 'This drawer belongs to another GMT day. Count and close it, then open a drawer for today.');
  return drawer;
}
async function quote(tx: Sql, shopId: string, lines: Line[], locking = false, archive = false): Promise<Quoted[]> {
  if (new Set(lines.map(l => `${l.unitId}:${l.batchId}:${l.locationId}`)).size !== lines.length) throw new HttpError(400, 'Combine repeated unit, batch and source rows in the basket.');
  const result: Quoted[] = [];
  for (const line of lines) {
    const row = (await tx.query<{ product_id: string; base_quantity: number; description: string; label: string; batch_number: string | null; expiry: string | null; location_name: string; price_minor: number; version: number }>(`SELECT u.product_id,u.base_quantity,concat(p.name,' ',p.strength,' ',p.dosage_form) AS description,u.label,b.batch_number,b.expiry::text,l.name AS location_name,price.price_minor,price.version
      FROM selling_units u JOIN products p ON p.id=u.product_id LEFT JOIN stock_batches b ON b.id=$2 AND b.product_id=p.id AND b.variation_unit_id IS NOT DISTINCT FROM (CASE WHEN u.variation THEN u.id ELSE NULL END)
      JOIN locations l ON l.id=$3 AND l.shop_id=$4 AND l.kind IN ('shelf','storeroom')
      JOIN shop_listings listed ON listed.shop_id=$4 AND listed.unit_id=u.id AND (listed.available=true OR l.kind='storeroom' OR ${archive ? 'true' : 'false'})
      JOIN unit_prices price ON price.unit_id=u.id WHERE u.id=$1 AND (u.archived=false OR ${archive ? 'true' : 'false'}) AND (p.archived=false OR ${archive ? 'true' : 'false'}) AND ((l.kind='shelf' AND $2::uuid IS NULL) OR (l.kind='storeroom' AND b.id IS NOT NULL)) ${locking ? 'FOR SHARE OF price,listed' : ''}`, [line.unitId, line.batchId, line.locationId, shopId])).rows[0];
    if (!row) throw new HttpError(400, 'A basket line is unavailable, belongs to another shop, or has the wrong drug/batch.');
    if(!archive&&row.price_minor===0)throw new HttpError(409,'Set a price for this medicine before selling it.');
    if (row.expiry && row.expiry <= today()) throw new HttpError(409, 'Expired stock cannot be sold. Remove the expired batch.');
    if (!archive && (row.price_minor !== line.priceMinor || row.version !== line.priceVersion)) throw new HttpError(409, 'A price changed. Refresh and explicitly update the basket prices before checkout.');
    bounded(row.base_quantity * line.quantity); bounded(row.price_minor * line.quantity);
    const regular = row.price_minor * line.quantity;
    if (!archive && line.exceptionReason && line.chargedMinor === undefined) throw new HttpError(400,'Enter the changed amount.');
    if (!archive && line.chargedMinor === regular) throw new HttpError(400,'The changed amount must differ from the normal amount.');
    if (!archive && line.chargedMinor !== undefined && line.exceptionReason && line.exceptionReason !== (line.chargedMinor < regular ? 'shortfall' : 'no_change')) throw new HttpError(400,'Price difference direction does not match the amount.');
    // Legacy values encode direction only, never an asserted explanation.
    if (line.chargedMinor !== undefined) line.exceptionReason = line.chargedMinor < regular ? 'shortfall' : 'no_change';
    result.push({ ...line, productId: row.product_id, baseQuantity: row.base_quantity, description: row.description, unitLabel: row.label, batchNumber: row.batch_number, expiry: row.expiry, locationName: row.location_name });
  }
  bounded(result.reduce((sum, line) => sum + (line.chargedMinor ?? line.quantity * line.priceMinor), 0));
  return result;
}
export async function cashEntry(tx: Sql, operation: string, actor: Actor, drawer: string, amount: number, kind: string, reason: string, sale: string | null = null, refund: string | null = null) {
  await tx.query('INSERT INTO cash_ledger(operation_id,drawer_id,actor_id,amount_minor,kind,reason,sale_id,refund_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [operation, drawer, actor.id, amount, kind, reason, sale, refund]);
}
async function stockEntry(tx: Sql, operation: string, actor: Actor, line: { batchId: string; locationId: string }, delta: number, kind: string, reason: string, sale: string, refund: string | null = null) {
  await tx.query('INSERT INTO stock_ledger(operation_id,actor_id,batch_id,location_id,delta,kind,reason,sale_id,refund_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [operation, actor.id, line.batchId, line.locationId, delta, kind, reason, sale, refund]);
}

export function registerSalesRoutes(app: FastifyInstance, db: Database) {
  app.get<{ Params: { shopId: string }; Querystring: { q?: string } }>('/api/shops/:shopId/sales/workspace', { schema: { params: shopParams, querystring: { type: 'object', additionalProperties: false, properties: { q: { type: 'string', maxLength: 120 } } } } }, async request => {
    const actor = await actorOf(db, request); await access(db, actor, request.params.shopId);
    const shopId = request.params.shopId;
    const stockChoices = (await db.query<{ name: string; genericName: string; strength: string; dosageForm: string; barcode: string | null }>(`SELECT u.id AS "unitId",b.id AS "batchId",l.id AS "locationId",p.id AS "productId",p.name,p.generic_name AS "genericName",p.strength,p.dosage_form AS "dosageForm",u.barcode,concat(p.name,' ',p.strength,' ',p.dosage_form) AS description,
      u.label AS "unitLabel",u.base_quantity AS "baseQuantity",b.batch_number AS "batchNumber",b.expiry::text,l.name AS "locationName",price.price_minor AS "priceMinor",price.version AS "priceVersion",s.quantity-s.reserved AS "availableBase"
      FROM stock_balances s JOIN locations l ON l.id=s.location_id JOIN stock_batches b ON b.id=s.batch_id JOIN products p ON p.id=b.product_id
      JOIN selling_units u ON u.product_id=p.id AND b.variation_unit_id IS NOT DISTINCT FROM (CASE WHEN u.variation THEN u.id ELSE NULL END) JOIN unit_prices price ON price.unit_id=u.id
      JOIN shop_listings listed ON listed.unit_id=u.id AND listed.shop_id=l.shop_id 
      WHERE u.archived=false AND p.archived=false AND l.shop_id=$1 AND l.kind='storeroom' AND s.quantity>s.reserved AND b.expiry>(now() AT TIME ZONE 'Etc/GMT')::date
      ORDER BY p.name,b.expiry,u.base_quantity,l.name`, [shopId])).rows;
    const shelfChoices = (await db.query<typeof stockChoices[number]>(`SELECT u.id AS "unitId",NULL::uuid AS "batchId",l.id AS "locationId",p.id AS "productId",p.name,p.generic_name AS "genericName",p.strength,p.dosage_form AS "dosageForm",u.barcode,concat(p.name,' ',p.strength,' ',p.dosage_form) AS description,
      u.label AS "unitLabel",u.base_quantity AS "baseQuantity",NULL::text AS "batchNumber",NULL::text AS expiry,l.name AS "locationName",price.price_minor AS "priceMinor",price.version AS "priceVersion",NULL::integer AS "availableBase"
      FROM shop_listings listed JOIN selling_units u ON u.id=listed.unit_id JOIN products p ON p.id=u.product_id JOIN unit_prices price ON price.unit_id=u.id JOIN locations l ON l.shop_id=listed.shop_id AND l.kind='shelf'
      WHERE p.archived=false AND listed.shop_id=$1 AND listed.available=true ORDER BY p.name,u.base_quantity`,[shopId])).rows;
    const choices = [...shelfChoices, ...stockChoices].map(choice => ({ choice, rank: rankProduct({ ...choice, barcodes: choice.barcode ? [choice.barcode] : [] }, request.query.q ?? '') })).filter(item => item.rank !== null).sort((a, b) => a.rank!.score - b.rank!.score).map(({ choice, rank }) => ({ ...choice, match: rank!.match }));
    const drawers = (await db.query(`SELECT d.id,d.code,d.business_date::text,d.opening_minor,d.opening_source,coalesce(sum(c.amount_minor),0)::bigint::text AS expected_minor
      FROM drawer_sessions d LEFT JOIN cash_ledger c ON c.drawer_id=d.id WHERE d.shop_id=$1 AND d.status='open' GROUP BY d.id ORDER BY d.code DESC`, [shopId])).rows;
    const drafts = (await db.query('SELECT id,status,version,lines,location_status,updated_at FROM sale_drafts WHERE shop_id=$1 AND actor_id=$2 AND status IN ($3,$4) ORDER BY updated_at DESC', [shopId, actor.id, 'open', 'parked'])).rows;
    const receipts = (await db.query('SELECT id,receipt_number::text,total_minor,created_at FROM sales WHERE shop_id=$1 ORDER BY created_at DESC LIMIT 50', [shopId])).rows;
    const shelfLocationId=(await db.query<{id:string}>("SELECT id FROM locations WHERE shop_id=$1 AND kind='shelf'",[shopId])).rows[0]?.id;
    const exceptionDay=!!(await db.query('SELECT id FROM manual_days WHERE shop_id=$1 AND business_date=$2',[shopId,today()])).rows.length;
    return { exceptionDay, shelfLocationId, choices, drawers:actor.role==='admin'?drawers:drawers.map(d=>({id:d.id,code:d.code,business_date:d.business_date})), drafts, receipts:actor.role==='admin'?receipts:[], canOpenDrawer: actor.role === 'admin', canRefund: actor.role === 'admin' };
  });
  app.post<{ Params: { shopId: string }; Body: Write & { code: string; openingMinor: number; openingSource: string } }>('/api/shops/:shopId/sales/drawers', { schema: { params: shopParams, body: object({ ...write, code: { type: 'string', enum: ['A', 'B'] }, openingMinor: integer(), openingSource: text(200) }) } }, async request => mutate(db, request, 'drawer_opened', async (tx, actor, operation, reason) => {
    await access(tx, actor, request.params.shopId, true);
    if (actor.role !== 'admin') throw new HttpError(403, 'Only administrators can open a drawer and authorize its opening float.');
    if ((await tx.query('SELECT id FROM shop_day_closings WHERE shop_id=$1 AND business_date=$2',[request.params.shopId,today()])).rows.length) throw new HttpError(409,'This shop is locked up for today.');
    if (request.body.openingSource.trim().length < 3) throw new HttpError(400, 'Record where the opening float came from.');
    const id = randomUUID();
    await tx.query('INSERT INTO drawer_sessions(id,shop_id,code,opening_minor,opening_source,opened_by) VALUES($1,$2,$3,$4,$5,$6)', [id, request.params.shopId, request.body.code, request.body.openingMinor, request.body.openingSource.trim(), actor.id]);
    await cashEntry(tx, operation, actor, id, request.body.openingMinor, 'opening', reason);
    return { id };
  }));
  app.post<{ Params: { shopId: string }; Body: Write & { locationStatus: string; shopConfirmed: boolean } }>('/api/shops/:shopId/sales/drafts', { schema: { params: shopParams, body: object({ ...write, locationStatus: { type: 'string', enum: ['available','unavailable'] }, shopConfirmed: { type: 'boolean', const: true } }) } }, async request => mutate(db, request, 'draft_opened', async (tx, actor) => {
    await access(tx, actor, request.params.shopId, true);
    const id = randomUUID();
    await tx.query('INSERT INTO sale_drafts(id,shop_id,actor_id,location_status) VALUES($1,$2,$3,$4)', [id, request.params.shopId, actor.id, request.body.locationStatus]);
    return { id, version: 1, status: 'open', lines: [] };
  }));
  app.post<{ Params: Params; Body: Write & { expectedVersion: number; lines: Line[] } }>('/api/shops/:shopId/sales/drafts/:id/lines', { bodyLimit: 128 * 1024, schema: { params: idParams, body: object({ ...write, expectedVersion: integer(1), lines: linesSchema }) } }, async request => mutate(db, request, 'draft_saved', async (tx, actor) => {
    await access(tx, actor, request.params.shopId, true);
    const draft = await draftOf(tx, actor, request.params.shopId, request.params.id, request.body.expectedVersion);
    if (draft.status !== 'open') throw new HttpError(409, 'Resume this parked basket before editing it.');
    const lines = await quote(tx, request.params.shopId, request.body.lines);
    await tx.query('UPDATE sale_drafts SET lines=$1,version=version+1,updated_at=now() WHERE id=$2', [JSON.stringify(lines), draft.id]);
    return { id: draft.id, version: draft.version + 1, status: 'open', lines };
  }));
  app.post<{ Params: Params; Body: Write & { expectedVersion: number; lines: Line[] } }>('/api/shops/:shopId/sales/drafts/:id/close', { bodyLimit:128*1024, schema:{params:idParams,body:object({...write,expectedVersion:integer(1),lines:{...linesSchema,items:object({...lineSchema.properties as Record<string,unknown>,quantity:integer(0)})}})}},async request=>mutate(db,request,'ticket_closed',async(tx,actor)=>{
    await access(tx,actor,request.params.shopId,true);
    const draft=await draftOf(tx,actor,request.params.shopId,request.params.id,request.body.expectedVersion);
    const lines=await quote(tx,request.params.shopId,request.body.lines,false,true);
    await tx.query("UPDATE sale_drafts SET status='discarded',lines=$1,version=version+1,updated_at=now() WHERE id=$2",[JSON.stringify(lines),draft.id]);
    return {...draft,lines,status:'discarded',version:draft.version+1};
  }));
  app.post<{ Params: Params; Body: Write & { expectedVersion: number; action: string; shopConfirmed: boolean } }>('/api/shops/:shopId/sales/drafts/:id/state', { schema: { params: idParams, body: object({ ...write, expectedVersion: integer(1), action: { type: 'string', enum: ['park','resume','discard'] }, shopConfirmed: { type: 'boolean', const: true } }) } }, async request => mutate(db, request, 'draft_state', async (tx, actor) => {
    await access(tx, actor, request.params.shopId, true);
    const draft = await draftOf(tx, actor, request.params.shopId, request.params.id, request.body.expectedVersion);
    const status = request.body.action === 'park' ? (draft.lines.length ? 'parked' : 'discarded') : request.body.action === 'discard' ? 'discarded' : 'open';
    await tx.query('UPDATE sale_drafts SET status=$1,version=version+1,updated_at=now() WHERE id=$2', [status, draft.id]);
    return { ...draft, version: draft.version + 1, status };
  }));
  app.post<{ Params: Params; Body: Write & { expectedVersion: number; drawerId: string; tenderMinor: number; occurredAt?:string; paymentMethod: string; shopConfirmed: boolean } }>('/api/shops/:shopId/sales/drafts/:id/checkout', { schema: { params: idParams, body: object({ ...write, expectedVersion: integer(1), occurredAt:{type:'string',format:'date-time'},drawerId: uuid, tenderMinor: integer(1), paymentMethod: { type: 'string', const: 'cash' }, shopConfirmed: { type: 'boolean', const: true } }) } }, async request => mutate(db, request, 'sale_posted', async (tx, actor, operation, reason) => {
    await access(tx, actor, request.params.shopId, true);
    const draft = await draftOf(tx, actor, request.params.shopId, request.params.id, request.body.expectedVersion);
    if (draft.status !== 'open' || !draft.lines.length) throw new HttpError(400, 'An open basket with at least one line is required.');
    if ((await tx.query('SELECT id FROM manual_days WHERE shop_id=$1 AND business_date=$2', [request.params.shopId, today()])).rows.length) throw new HttpError(409, 'This is an exception day. Record the daily sales total under Daily cash instead of individual tickets.');
    const selectedDrawer = request.body.drawerId ?? (await tx.query<{id:string}>("SELECT id FROM drawer_sessions WHERE shop_id=$1 AND business_date=$2 AND status='open' ORDER BY code DESC LIMIT 1",[request.params.shopId,today()])).rows[0]?.id;
    if (!selectedDrawer) throw new HttpError(409,'Start the shop day under Daily cash before confirming sales.');
    const drawer = await drawerOf(tx, request.params.shopId, selectedDrawer);
    if(request.body.occurredAt&&request.body.occurredAt.slice(0,10)!==drawer.business_date)throw new HttpError(409,'This offline sale belongs to a different day. An administrator must reconcile it; the original record is retained.');
    for (const product of [...new Set(draft.lines.map(l => l.productId))].sort()) await productLock(tx, product);
    const lines = await quote(tx, request.params.shopId, draft.lines, true);
    const total = bounded(lines.reduce((sum, l) => sum + (l.chargedMinor ?? l.priceMinor * l.quantity), 0));
    const tenderMinor = request.body.tenderMinor ?? total;
    if (tenderMinor < total) throw new HttpError(400, 'Cash tendered is less than the sale total.');
    const id = randomUUID(), changeMinor = tenderMinor - total;
    const sale = (await tx.query<{ receipt_number: string }>(`INSERT INTO sales(id,shop_id,drawer_id,draft_id,actor_id,business_date,total_minor,tender_minor,change_minor,currency,payment_method)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'GHS','cash') RETURNING receipt_number::text`, [id, request.params.shopId, drawer.id, draft.id, actor.id, drawer.business_date, total, tenderMinor, changeMinor])).rows[0];
    await tx.query(`INSERT INTO sale_reporting_dates(sale_id,reporting_date,cutoff_id)
      SELECT $1, $3::date,c.id
      FROM (SELECT 1) seed LEFT JOIN shop_remittance_counts c
      ON c.shop_id=$2 AND c.business_date=$3::date AND c.sales_cutoff=true`,[id,request.params.shopId,drawer.business_date]);
    for (const line of lines) {
      if (line.batchId) { await batchLock(tx, line.batchId, true);
      await change(tx, line.locationId, line.batchId, -bounded(line.quantity * line.baseQuantity)); }
      const category = (await tx.query<{ name: string }>('SELECT c.name FROM product_financial_categories p JOIN financial_categories c ON c.id=p.category_id WHERE p.product_id=$1', [line.productId])).rows[0]?.name ?? 'General';
      await tx.query(`INSERT INTO sale_lines(id,sale_id,unit_id,batch_id,location_id,quantity,base_quantity,price_minor,price_version,total_minor,description,unit_label,batch_number,expiry,category_name,price_exception_reason)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`, [randomUUID(), id, line.unitId, line.batchId, line.locationId, line.quantity, line.baseQuantity, line.priceMinor, line.priceVersion, (line.chargedMinor ?? line.priceMinor * line.quantity), line.description, line.unitLabel, line.batchNumber, line.expiry, category, line.exceptionReason ?? null]);
      if (line.batchId) await stockEntry(tx, operation, actor, {batchId: line.batchId, locationId: line.locationId}, -line.quantity * line.baseQuantity, 'sale', reason, id);
    }
    if (lines.some(l => l.exceptionReason)) await tx.query('INSERT INTO sale_price_exceptions(sale_id,catalogue_total_minor,charged_total_minor,actor_id) VALUES($1,$2,$3,$4)',[id,lines.reduce((sum,l)=>sum+l.priceMinor*l.quantity,0),total,actor.id]);
    await cashEntry(tx, operation, actor, drawer.id, total, 'sale', reason, id);
    await tx.query("UPDATE sale_drafts SET status='completed',version=version+1,updated_at=now() WHERE id=$1", [draft.id]);
    return { id, receiptNumber: sale.receipt_number, totalMinor: total, tenderMinor, changeMinor };
  }));
  app.get<{Params:{shopId:string};Querystring:{date?:string;page?:string}}>('/api/shops/:shopId/sales/history',{schema:{params:shopParams,querystring:{type:'object',additionalProperties:false,properties:{date:{type:'string',format:'date'},page:{type:'string',pattern:'^[1-9][0-9]{0,5}$'}}}}},async request=>{
   const actor=await actorOf(db,request);await access(db,actor,request.params.shopId);if(actor.role!=='admin')throw new HttpError(403,'Only administrators can view sale history.');
   const entries=(await db.query("SELECT s.id,s.total_minor,s.created_at,u.display_name AS seller,(SELECT string_agg(l.description,', ') FROM sale_lines l WHERE l.sale_id=s.id) AS medicines FROM sales s JOIN users u ON u.id=s.actor_id WHERE s.shop_id=$1 AND s.business_date=$2 ORDER BY s.created_at DESC,s.id LIMIT 30 OFFSET $3",[request.params.shopId,request.query.date??today(),(Number(request.query.page??1)-1)*30])).rows;return{entries};
  });
  app.get<{ Params: Params }>('/api/shops/:shopId/sales/receipts/:id', { schema: { params: idParams } }, async request => {
    const actor = await actorOf(db, request); await access(db, actor, request.params.shopId);
    if(actor.role!=='admin')throw new HttpError(403,'Only administrators can view sale history.');
    const sale = (await db.query(`SELECT s.*,s.receipt_number::text,sh.name AS shop_name,u.display_name AS cashier_name,d.code AS drawer_code
      FROM sales s JOIN shops sh ON sh.id=s.shop_id JOIN users u ON u.id=s.actor_id JOIN drawer_sessions d ON d.id=s.drawer_id WHERE s.id=$1 AND s.shop_id=$2`, [request.params.id, request.params.shopId])).rows[0];
    if (!sale) throw new HttpError(404, 'Receipt not found in this shop.');
    const lines = (await db.query(`SELECT l.*,l.expiry::text,p.name AS location_name,coalesce((SELECT sum(quantity) FROM sale_refund_lines r WHERE r.sale_line_id=l.id),0)::integer AS refunded_quantity FROM sale_lines l JOIN locations p ON p.id=l.location_id WHERE l.sale_id=$1 ORDER BY l.id`, [request.params.id])).rows;
    const refunds = (await db.query(`SELECT r.*,u.display_name AS approved_by,d.code AS drawer_code,(SELECT json_agg(json_build_object('saleLineId',l.sale_line_id,'quantity',l.quantity,'disposition',l.disposition)) FROM sale_refund_lines l WHERE l.refund_id=r.id) AS lines
      FROM sale_refunds r JOIN users u ON u.id=r.actor_id JOIN drawer_sessions d ON d.id=r.drawer_id WHERE r.sale_id=$1 ORDER BY r.created_at`, [request.params.id])).rows;
    return { sale, lines, refunds };
  });
  type RefundLine = { saleLineId: string; quantity: number; disposition: string; restockConfirmed: boolean };
  app.post<{ Params: Params; Body: Write & { drawerId: string; lines: RefundLine[] } }>('/api/shops/:shopId/sales/receipts/:id/refunds', { bodyLimit: 128 * 1024, schema: { params: idParams, body: object({ ...write, drawerId: uuid, lines: { type: 'array', minItems: 1, maxItems: 100, items: object({ saleLineId: uuid, quantity: integer(1), disposition: { type: 'string', enum: ['quarantine','restock'] }, restockConfirmed: { type: 'boolean' } }) } }) } }, async request => mutate(db, request, 'sale_refunded', async (tx, actor, operation, reason) => {
    await access(tx, actor, request.params.shopId, true);
    if (actor.role !== 'admin') throw new HttpError(403, 'Only administrators can authorize a refund.');
    if (new Set(request.body.lines.map(l => l.saleLineId)).size !== request.body.lines.length) throw new HttpError(400, 'Each returned sale line must appear only once.');
    const sale = (await tx.query<{ id: string }>('SELECT id FROM sales WHERE id=$1 AND shop_id=$2 FOR UPDATE', [request.params.id, request.params.shopId])).rows[0];
    if (!sale) throw new HttpError(404, 'Receipt not found in this shop.');
    const selected=request.body.drawerId??(await tx.query<{id:string}>("SELECT id FROM drawer_sessions WHERE shop_id=$1 AND business_date=$2 AND status='open' ORDER BY code DESC LIMIT 1",[request.params.shopId,today()])).rows[0]?.id;
    if(!selected)throw new HttpError(409,'Start today under Daily cash before paying a refund.');
    const drawer = await drawerOf(tx, request.params.shopId, selected);
    const originals = (await tx.query<{ id: string; quantity: number; price_minor: number; total_minor: number; base_quantity: number; batch_id: string | null; location_id: string; product_id: string; refunded: number }>(`SELECT l.*,u.product_id,coalesce((SELECT sum(quantity) FROM sale_refund_lines r WHERE r.sale_line_id=l.id),0)::integer AS refunded
      FROM sale_lines l JOIN selling_units u ON u.id=l.unit_id WHERE l.sale_id=$1`, [sale.id])).rows;
    let amount = 0;
    for (const line of request.body.lines) {
      const original = originals.find(l => l.id === line.saleLineId);
      if (!original || line.quantity > original.quantity - original.refunded) throw new HttpError(409, 'Returned quantity exceeds the remaining quantity on the original receipt. Reload it.');
      if (line.disposition === 'restock' && !line.restockConfirmed) throw new HttpError(400, 'Explicitly confirm that returned stock is suitable for resale, or quarantine it.');
      amount = bounded(amount + Math.floor(original.total_minor * (original.refunded + line.quantity) / original.quantity) - Math.floor(original.total_minor * original.refunded / original.quantity));
    }
    const cash = (await tx.query<{ expected: string }>('SELECT coalesce(sum(amount_minor),0)::text AS expected FROM cash_ledger WHERE drawer_id=$1', [drawer.id])).rows[0];
    if (BigInt(cash.expected) < BigInt(amount)) throw new HttpError(409, 'This drawer has insufficient recorded cash for the refund.');
    for (const product of [...new Set(originals.filter(l => request.body.lines.some(r => r.saleLineId === l.id)).map(l => l.product_id))].sort()) await productLock(tx, product);
    const id = randomUUID();
    await tx.query('INSERT INTO sale_refunds(id,sale_id,drawer_id,actor_id,amount_minor,reason) VALUES($1,$2,$3,$4,$5,$6)', [id, sale.id, drawer.id, actor.id, amount, reason]);
    for (const line of request.body.lines) {
      const original = originals.find(l => l.id === line.saleLineId)!;
      await tx.query('INSERT INTO sale_refund_lines(id,refund_id,sale_line_id,quantity,amount_minor,disposition) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), id, original.id, line.quantity, Math.floor(original.total_minor * (original.refunded + line.quantity) / original.quantity) - Math.floor(original.total_minor * original.refunded / original.quantity), line.disposition]);
      if (line.disposition === 'restock' && original.batch_id) {
        await batchLock(tx, original.batch_id, true);
        await change(tx, original.location_id, original.batch_id, line.quantity * original.base_quantity);
        await stockEntry(tx, operation, actor, { batchId: original.batch_id, locationId: original.location_id }, line.quantity * original.base_quantity, 'refund_return', reason, sale.id, id);
      }
    }
    await cashEntry(tx, operation, actor, drawer.id, -amount, 'refund', reason, sale.id, id);
    return { id, amountMinor: amount };
  }));
}
