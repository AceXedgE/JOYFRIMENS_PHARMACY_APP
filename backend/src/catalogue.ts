import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database, Sql } from './database.ts';
import { HttpError } from './http.ts';
import { audit } from './setup.ts';
import { normalize, rankProduct, type Match } from './catalogue-search.ts';

const text = (maxLength: number, minLength = 1) => ({ type: 'string', minLength, maxLength });
const uuid = { type: 'string', format: 'uuid' };
const int = (minimum: number, maximum = 100000000) => ({ type: 'integer', minimum, maximum });
const object = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const shopParams = object({ shopId: uuid });
const unitParams = object({ shopId: uuid, unitId: uuid });
const pageField = { type: 'string', pattern: '^[1-9][0-9]{0,5}$' };
const pageSize = 20;
interface Context { id: string; role: string; can_change_prices: boolean; }
interface UnitInput { label: string; baseQuantity: number; barcode: string; priceMinor: number; }
interface ProductInput { name: string; genericName: string; strength: string; dosageForm: string; baseUnit: string; units: UnitInput[]; reason: string; }
interface Unit { id: string; label: string; baseQuantity: number; barcode: string | null; priceMinor: number; priceVersion: number; available: boolean | null; listingVersion: number; }
interface Product { id: string; name: string; genericName: string; strength: string; dosageForm: string; baseUnit: string; units: Unit[]; match: Match; }
interface Row { id: string; name: string; generic_name: string; strength: string; dosage_form: string; base_unit: string;
  unit_id: string; label: string; base_quantity: number; barcode: string | null; price_minor: number; price_version: number; available: boolean | null; listing_version: number | null; }

// Mutations lock the user before membership rows: permission revocation uses the same order.
async function access(tx: Sql, request: FastifyRequest, shopId: string, mode: 'read' | 'price' | 'admin'): Promise<Context> {
  const actor = request.actor;
  if (!actor) throw new HttpError(401, 'Please sign in again.');
  const user = (await tx.query<{ id: string; role: string }>(`SELECT u.id,u.role FROM users u JOIN sessions s ON s.user_id=u.id
    WHERE u.id=$1 AND u.active=true AND s.token_hash=$2 AND s.expires_at>now() ${mode !== 'read' ? 'FOR SHARE OF u,s' : ''}`, [actor.id, actor.token_hash])).rows[0];
  if (!user) throw new HttpError(401, 'Please sign in again.');
  const shop = (await tx.query<{ currency: string }>('SELECT currency FROM shops WHERE id=$1', [shopId])).rows[0];
  const membership = (await tx.query<{ can_change_prices: boolean }>(`SELECT can_change_prices FROM memberships WHERE user_id=$1 AND shop_id=$2 ${mode !== 'read' ? 'FOR SHARE' : ''}`, [user.id, shopId])).rows[0];
  if (!shop || (user.role !== 'admin' && !membership)) throw new HttpError(404, 'Shop not found or unavailable to your account.');
  if (mode === 'admin' && user.role !== 'admin') throw new HttpError(403, 'Only administrators can manage the catalogue and availability.');
  const canChange = user.role === 'admin' || membership?.can_change_prices === true;
  if (mode === 'price' && !canChange) throw new HttpError(403, 'You do not have permission to change prices.');
  if (mode !== 'read' && shop.currency !== 'GHS') throw new HttpError(409, 'This catalogue requires the shop currency to be GHS.');
  return { ...user, can_change_prices: canChange };
}
function clean(value: string) { return value.trim().replace(/\s+/g, ' '); }
function reasonOf(value: string) {
  const reason = clean(value);
  if (reason.length < 3) throw new HttpError(400, 'Enter a meaningful reason of at least three characters.');
  return reason;
}
async function requireListing(tx: Sql, shopId: string, unitId: string) {
  if (!(await tx.query('SELECT unit_id FROM shop_listings WHERE shop_id=$1 AND unit_id=$2', [shopId, unitId])).rows.length) throw new HttpError(404, 'Selling unit is not listed in this shop.');
}
async function priceHistory(tx: Sql, actor: string, shopId: string, unitId: string, oldPrice: number | null, price: number, version: number, reason: string) {
  await tx.query(`INSERT INTO price_history(unit_id,version,old_price_minor,price_minor,initiating_shop_id,changed_by,reason)
    VALUES($1,$2,$3,$4,$5,$6,$7)`, [unitId, version, oldPrice, price, shopId, actor, reason]);
  await audit(tx, actor, 'catalogue.price_changed', unitId, { scope: 'both_shops', initiatingShopId: shopId, oldPriceMinor: oldPrice, priceMinor: price, version, currency: 'GHS', reason });
}

export function registerCatalogueRoutes(app: FastifyInstance, db: Database) {
  app.get<{ Params: { shopId: string }; Querystring: { q?: string; page?: string; includeUnlisted?: string } }>('/api/shops/:shopId/catalogue', {
    schema: { params: shopParams, querystring: { type: 'object', additionalProperties: false, properties: { q: text(120, 0), page: pageField, includeUnlisted: { type: 'string', enum: ['true', 'false'] } } } },
  }, async request => {
    const context = await access(db, request, request.params.shopId, 'read');
    const includeUnlisted = request.query.includeUnlisted === 'true';
    if (includeUnlisted && context.role !== 'admin') throw new HttpError(403, 'Only administrators can list drugs not yet offered in this shop.');
    const rows = (await db.query<Row>(`SELECT p.*,u.id AS unit_id,u.label,u.base_quantity,u.barcode,
      pr.price_minor,pr.version AS price_version,l.available,l.version AS listing_version
      FROM products p JOIN selling_units u ON u.product_id=p.id JOIN unit_prices pr ON pr.unit_id=u.id
      LEFT JOIN shop_listings l ON l.unit_id=u.id AND l.shop_id=$1
      WHERE l.unit_id IS NOT NULL OR $2::boolean ORDER BY lower(p.name),p.id,u.base_quantity,u.id`, [request.params.shopId, includeUnlisted])).rows;
    const grouped = new Map<string, Product>();
    for (const row of rows) {
      const product = grouped.get(row.id) ?? { id: row.id, name: row.name, genericName: row.generic_name, strength: row.strength,
        dosageForm: row.dosage_form, baseUnit: row.base_unit, units: [], match: 'contains' as Match };
      product.units.push({ id: row.unit_id, label: row.label, baseQuantity: row.base_quantity, barcode: row.barcode,
        priceMinor: row.price_minor, priceVersion: row.price_version, available: row.available, listingVersion: row.listing_version ?? 0 });
      grouped.set(row.id, product);
    }
    const ranked = [...grouped.values()].flatMap(product => {
      const rank = rankProduct({ ...product, barcodes: product.units.flatMap(unit => unit.barcode ? [unit.barcode] : []) }, request.query.q ?? '');
      return rank ? [{ product: { ...product, match: rank.match }, score: rank.score }] : [];
    }).sort((a, b) => a.score - b.score || a.product.name.localeCompare(b.product.name) || a.product.strength.localeCompare(b.product.strength) || a.product.id.localeCompare(b.product.id));
    const page = Number(request.query.page ?? 1);
    return { products: ranked.slice((page - 1) * pageSize, page * pageSize).map(item => item.product), total: ranked.length, page, pageSize,
      currency: 'GHS', priceScope: 'both_shops', canChangePrices: context.can_change_prices, canManageCatalogue: context.role === 'admin' };
  });

  app.post<{ Params: { shopId: string }; Body: ProductInput }>('/api/shops/:shopId/catalogue', {
    schema: { params: shopParams, body: object({ name: text(160), genericName: text(160), strength: text(80), dosageForm: text(80), baseUnit: text(40), reason: text(300, 3),
      units: { type: 'array', minItems: 1, maxItems: 10, items: object({ label: text(40), baseQuantity: int(1, 100000), barcode: text(80, 0), priceMinor: int(1) }) } }) },
  }, async (request, reply) => {
    const input = request.body;
    const reason = reasonOf(input.reason);
    const identity = [input.name, input.genericName, input.strength, input.dosageForm, input.baseUnit].map(clean);
    if (identity.some(value => !value)) throw new HttpError(400, 'Product details cannot be blank.');
    const labels = input.units.map(unit => normalize(unit.label));
    const barcodes = input.units.map(unit => unit.barcode.trim()).filter(Boolean);
    if (labels.some(label => !label) || new Set(labels).size !== labels.length || new Set(barcodes).size !== barcodes.length) throw new HttpError(400, 'Selling-unit labels and barcodes must be unique.');
    if (!input.units.some(unit => normalize(unit.label) === normalize(input.baseUnit) && unit.baseQuantity === 1)) throw new HttpError(400, 'Include the base unit with a conversion of exactly one.');
    if (input.units.some(unit => normalize(unit.label) === normalize(input.baseUnit) && unit.baseQuantity !== 1)) throw new HttpError(400, 'The base unit must have a conversion of one.');
    const id = randomUUID();
    await db.transaction(async tx => {
      const actor = await access(tx, request, request.params.shopId, 'admin');
      await tx.query('INSERT INTO products(id,name,generic_name,strength,dosage_form,base_unit,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, ...identity, actor.id]);
      for (const unit of input.units) {
        const unitId = randomUUID();
        await tx.query('INSERT INTO selling_units(id,product_id,label,base_quantity,barcode) VALUES($1,$2,$3,$4,$5)', [unitId, id, clean(unit.label), unit.baseQuantity, unit.barcode.trim() || null]);
        await tx.query('INSERT INTO unit_prices(unit_id,price_minor,version) VALUES($1,$2,1)', [unitId, unit.priceMinor]);
        await tx.query('INSERT INTO shop_listings(shop_id,unit_id,available,version) VALUES($1,$2,true,1)', [request.params.shopId, unitId]);
        await priceHistory(tx, actor.id, request.params.shopId, unitId, null, unit.priceMinor, 1, reason);
      }
      await audit(tx, actor.id, 'catalogue.product_created', id, { shopId: request.params.shopId, name: identity[0], units: input.units.map(unit => ({ label: clean(unit.label), baseQuantity: unit.baseQuantity, barcode: unit.barcode.trim() || null })), reason });
    });
    return reply.code(201).send({ id });
  });

  app.put<{ Params: { shopId: string; unitId: string }; Body: { priceMinor: number; expectedVersion: number; reason: string } }>('/api/shops/:shopId/catalogue/units/:unitId/price', {
    schema: { params: unitParams, body: object({ priceMinor: int(1), expectedVersion: int(1), reason: text(300, 3) }) },
  }, async request => {
    const reason = reasonOf(request.body.reason);
    return db.transaction(async tx => {
      const actor = await access(tx, request, request.params.shopId, 'price');
      await requireListing(tx, request.params.shopId, request.params.unitId);
      const prior = (await tx.query<{ price_minor: number; version: number }>('SELECT price_minor,version FROM unit_prices WHERE unit_id=$1 FOR UPDATE', [request.params.unitId])).rows[0];
      if (!prior || prior.version !== request.body.expectedVersion) throw new HttpError(409, 'The shared price changed. Reload the latest price before saving again.');
      if (prior.price_minor === request.body.priceMinor) throw new HttpError(400, 'Enter a different price.');
      const version = prior.version + 1;
      await tx.query('UPDATE unit_prices SET price_minor=$1,version=$2,updated_at=now() WHERE unit_id=$3', [request.body.priceMinor, version, request.params.unitId]);
      await priceHistory(tx, actor.id, request.params.shopId, request.params.unitId, prior.price_minor, request.body.priceMinor, version, reason);
      return { priceMinor: request.body.priceMinor, version, priceScope: 'both_shops' };
    });
  });

  app.put<{ Params: { shopId: string; unitId: string }; Body: { available: boolean; expectedVersion: number; reason: string } }>('/api/shops/:shopId/catalogue/units/:unitId/availability', {
    schema: { params: unitParams, body: object({ available: { type: 'boolean' }, expectedVersion: int(0), reason: text(300, 3) }) },
  }, async request => {
    const reason = reasonOf(request.body.reason);
    return db.transaction(async tx => {
      const actor = await access(tx, request, request.params.shopId, 'admin');
      if (!(await tx.query('SELECT id FROM selling_units WHERE id=$1', [request.params.unitId])).rows.length) throw new HttpError(404, 'Selling unit not found.');
      const prior = (await tx.query<{ available: boolean; version: number }>('SELECT available,version FROM shop_listings WHERE shop_id=$1 AND unit_id=$2 FOR UPDATE', [request.params.shopId, request.params.unitId])).rows[0];
      if ((prior?.version ?? 0) !== request.body.expectedVersion) throw new HttpError(409, 'Availability changed. Reload before saving again.');
      if (prior?.available === request.body.available) throw new HttpError(400, 'Availability is already set to this value.');
      const version = (prior?.version ?? 0) + 1;
      if (prior) await tx.query('UPDATE shop_listings SET available=$1,version=$2 WHERE shop_id=$3 AND unit_id=$4', [request.body.available, version, request.params.shopId, request.params.unitId]);
      else await tx.query('INSERT INTO shop_listings(shop_id,unit_id,available,version) VALUES($1,$2,$3,$4)', [request.params.shopId, request.params.unitId, request.body.available, version]);
      await audit(tx, actor.id, 'catalogue.availability_changed', request.params.unitId, { shopId: request.params.shopId, before: prior?.available ?? null, after: request.body.available, version, reason });
      return { available: request.body.available, version };
    });
  });

  app.get<{ Params: { shopId: string; unitId: string }; Querystring: { page?: string } }>('/api/shops/:shopId/catalogue/units/:unitId/history', {
    schema: { params: unitParams, querystring: { type: 'object', additionalProperties: false, properties: { page: pageField } } },
  }, async request => {
    const context = await access(db, request, request.params.shopId, 'read');
    if (context.role !== 'admin') await requireListing(db, request.params.shopId, request.params.unitId);
    const page = Number(request.query.page ?? 1);
    const history = (await db.query(`SELECT h.version,h.old_price_minor,h.price_minor,h.reason,h.changed_at,u.display_name AS changed_by
      FROM price_history h JOIN users u ON u.id=h.changed_by WHERE h.unit_id=$1 ORDER BY h.version DESC LIMIT $2 OFFSET $3`, [request.params.unitId, pageSize, (page - 1) * pageSize])).rows;
    const total = Number((await db.query<{ count: string }>('SELECT count(*) AS count FROM price_history WHERE unit_id=$1', [request.params.unitId])).rows[0].count);
    return { history, total, page, pageSize, currency: 'GHS', priceScope: 'both_shops' };
  });
}
