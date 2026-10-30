import {registerCatalogueManagement} from './catalogue-management.ts';
import {registerSupplierRoutes} from './suppliers.ts';
import {registerNotificationRoutes} from './notifications.ts';
import {registerOfflineRoutes} from './offline.ts';
import { registerDailyCashRoutes } from './daily-cash.ts';
import { registerCashRoutes } from './cash.ts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { Database, Sql } from './database.ts';
import type { Config } from './config.ts';
import { audit } from './setup.ts';
import { digest, equalTokens, hashPassword, newToken, SESSION_SECONDS, verifyPassword } from './security.ts';
import { HttpError } from './http.ts';
import { registerCatalogueRoutes } from './catalogue.ts';
import { registerInventoryRoutes } from './inventory.ts';
import { registerSalesRoutes } from './sales.ts';

interface User { id: string; username: string; display_name: string; role: 'admin' | 'employee'; active: boolean; shared_storage_access: boolean; }
interface Actor extends User { token_hash: string; csrf_token: string; }
declare module 'fastify' { interface FastifyRequest { actor: Actor | null; } }
const denied = () => new HttpError(403, 'You do not have permission for this action.');
const unauthenticated = () => new HttpError(401, 'Please sign in again.');
const string = (minLength = 1, maxLength = 100) => ({ type: 'string', minLength, maxLength });
const uuid = { type: 'string', format: 'uuid' };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const idParams = object({ id: uuid });
const usernameSchema = { ...string(3, 64), pattern: '^[a-z0-9._-]+$' };
const passwordSchema = string(12, 128);
const memberSchema = object({ shopId: uuid, canChangePrices: { type: 'boolean' }, canCountCash: { type: 'boolean' } }, ['shopId','canChangePrices']);
const membershipsSchema = { type: 'array', maxItems: 2, items: memberSchema };
const publicUser = (user: User) => ({ id: user.id, username: user.username, name: user.display_name,
  role: user.role, active: user.active, sharedStorageAccess: user.role === 'admin' || user.shared_storage_access });
const actorOf = (request: FastifyRequest) => { if (!request.actor) throw unauthenticated(); return request.actor; };
const adminOf = (request: FastifyRequest) => { const actor = actorOf(request); if (actor.role !== 'admin') throw denied(); return actor; };

async function lockAdmin(tx: Sql, id: string) {
  const result = await tx.query('SELECT id FROM users WHERE id=$1 AND active=true AND role=$2 FOR UPDATE', [id, 'admin']);
  if (!result.rows.length) throw denied();
}

async function setMemberships(tx: Sql, userId: string, memberships: { shopId: string; canChangePrices: boolean; canCountCash?: boolean }[]) {
  const ids = memberships.map(member => member.shopId);
  if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Each shop may only be assigned once.');
  for (const id of ids) if (!(await tx.query('SELECT id FROM shops WHERE id=$1', [id])).rows.length) throw new HttpError(400, 'Unknown shop.');
  await tx.query('DELETE FROM memberships WHERE user_id=$1', [userId]);
  for (const member of memberships) await tx.query('INSERT INTO memberships(user_id,shop_id,can_change_prices,can_count_cash) VALUES($1,$2,$3,$4)', [userId, member.shopId, member.canChangePrices,member.canCountCash??false]);
}

async function datasetRevision(db:Sql){
  const exists=(await db.query<{name:string|null}>("SELECT to_regclass('business_dataset')::text AS name")).rows[0].name;
  return exists?(await db.query<{revision:string}>('SELECT revision FROM business_dataset WHERE id=1')).rows[0].revision:'initial';
}

export async function registerRoutes(app: FastifyInstance, db: Database, config: Config) {
  const dummyHash = await hashPassword(newToken());
  const cookieName = config.production ? '__Host-joyfrimens' : 'joyfrimens_session';
  const cookieOptions = { path: '/', httpOnly: true, secure: config.production, sameSite: 'strict' as const };
  app.decorateRequest('actor', null);
  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { statusCode?: number; code?: string; validation?: unknown };
    if (err.validation) {
      if (request.method === 'POST' && request.routeOptions.url === '/api/admin/users') {
        const validation = err.validation as { instancePath?: string; params?: { missingProperty?: string } }[];
        const field = validation[0]?.instancePath?.split('/')[1] || validation[0]?.params?.missingProperty;
        const messages: Record<string, string> = {
          username: 'Username must be 3–64 characters: letters, numbers, dots, underscores or hyphens, with no spaces.',
          name: 'Enter the staff member’s full name (1–100 characters).',
          password: 'Initial password must contain 12–128 characters.',
          role: 'Choose Employee or Administrator as the account role.',
          memberships: 'Check the selected shops, then try again. Refresh the page if the shop list has changed.',
          sharedStorageAccess: 'Check the shared-storage access setting, then try again.',
        };
        return reply.code(400).send({ message: field && messages[field] ? messages[field] : 'The staff form contains unexpected fields. Refresh the page and try again.' });
      }
      return reply.code(400).send({ message: 'Please check the submitted fields.' });
    }
    if (err.code === '23505') return reply.code(409).send({ message: 'That account or record already exists.' });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ message: err.message });
    app.log.error({ code: err.code, name: err.name }, 'Request failed');
    return reply.code(500).send({ message: 'Unable to complete the request. Please try again.' });
  });
  app.addHook('onRequest', async request => {
    const path = request.url.split('?')[0];
    if (path === '/api/health') return;
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (request.headers['x-requested-with'] !== 'joyfrimens') throw denied();
      const origin = request.headers.origin;
      if (origin && !config.origins.includes(origin)) throw denied();
      if (request.headers['sec-fetch-site'] === 'cross-site') throw denied();
    }
    if (path === '/api/supplier-portal' && ['GET','POST'].includes(request.method)) return;
    if (path === '/api/auth/login' && request.method === 'POST') return;
    const token = request.cookies[cookieName];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) throw unauthenticated();
    const result = await db.query<Actor>(`SELECT u.id,u.username,u.display_name,u.role,u.active,u.shared_storage_access,s.token_hash,s.csrf_token
      FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active=true`, [digest(token)]);
    request.actor = result.rows[0] ?? null;
    const actor = actorOf(request);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const csrf = request.headers['x-csrf-token'];
      if (typeof csrf !== 'string' || !equalTokens(csrf, actor.csrf_token)) throw denied();
    }
  });

  app.addHook('preValidation', async request => {
    const schema=request.routeOptions.schema?.body as {properties?:Record<string,unknown>}|undefined;
    const body=request.body as Record<string,unknown>|undefined;
    const countAction=/\/day\/(start-count|send|close)$/.test(request.url.split('?')[0]);
    const priceEdit=request.method==='PUT' && /\/catalogue\/units\/[^/]+\/price$/.test(request.url.split('?')[0]);
    if (!request.url.split('?')[0].endsWith('/cash/money-out') && body && schema?.properties?.reason && (request.actor?.role==='admin'||priceEdit||countAction) && (body.reason===undefined||body.reason==='')) {
      body.reason='Action recorded without an explanation';
    }
  });

  app.post<{ Body: { username: string; password: string } }>('/api/auth/login', {
    schema: { body: object({ username: usernameSchema, password: string(1, 128) }) },
  }, async (request, reply) => {
    const { username, password } = request.body;
    const limited = await db.transaction(async tx => {
      await tx.query('DELETE FROM login_limits WHERE reset_at < now()');
      let blocked = false;
      for (const [key, limit] of [[`user:${username}`, 10], [`ip:${request.ip}`, 50]] as const) {
        const result = await tx.query<{ attempts: number }>(`INSERT INTO login_limits(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes')
          ON CONFLICT(key) DO UPDATE SET attempts=login_limits.attempts+1 RETURNING attempts`, [digest(key)]);
        if (result.rows[0].attempts > limit) blocked = true;
      }
      return blocked;
    });
    if (limited) { reply.header('Retry-After', '900'); throw new HttpError(429, 'Too many sign-in attempts. Try again in 15 minutes.'); }
    const found = (await db.query<User & { password_hash: string }>('SELECT * FROM users WHERE username=$1', [username])).rows[0];
    const valid = await verifyPassword(password, found?.password_hash ?? dummyHash);
    if (!valid || !found?.active) {
      await audit(db, null, 'auth.login_failed', null, { usernameHash: digest(username) });
      throw new HttpError(401, 'Incorrect username or password.');
    }
    const token = newToken();
    const csrf = newToken();
    await db.transaction(async tx => {
      const current = (await tx.query<User & { password_hash: string }>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [found.id])).rows[0];
      if (!current?.active || current.password_hash !== found.password_hash) throw unauthenticated();
      await tx.query('DELETE FROM sessions WHERE expires_at <= now()');
      const previous = request.cookies[cookieName];
      if (previous) await tx.query('DELETE FROM sessions WHERE token_hash=$1', [digest(previous)]);
      await tx.query('INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval \'8 hours\')', [digest(token), found.id, csrf]);
      await audit(tx, found.id, 'auth.login', found.id);
    });
    reply.setCookie(cookieName, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
    return { user: publicUser(found), datasetRevision:await datasetRevision(db), csrfToken: csrf };
  });

  app.get('/api/auth/me', async request => {
    const actor = actorOf(request);
    return { user: publicUser(actor), datasetRevision:await datasetRevision(db), csrfToken: actor.csrf_token };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    const actor = actorOf(request);
    await db.transaction(async tx => {
      await tx.query('DELETE FROM sessions WHERE token_hash=$1', [actor.token_hash]);
      await audit(tx, actor.id, 'auth.logout', actor.id);
    });
    reply.clearCookie(cookieName, cookieOptions);
    return { ok: true };
  });
  app.post<{ Body: { currentPassword: string; newPassword: string } }>('/api/auth/password', {
    schema: { body: object({ currentPassword: string(1, 128), newPassword: passwordSchema }) },
  }, async (request, reply) => {
    const actor = actorOf(request);
    const attempts = await db.query<{ attempts: number }>(`INSERT INTO login_limits(key,attempts,reset_at) VALUES($1,1,now()+interval '15 minutes')
      ON CONFLICT(key) DO UPDATE SET
        attempts=CASE WHEN login_limits.reset_at <= now() THEN 1 ELSE login_limits.attempts+1 END,
        reset_at=CASE WHEN login_limits.reset_at <= now() THEN now()+interval '15 minutes' ELSE login_limits.reset_at END
      RETURNING attempts`, [digest(`password:${actor.id}`)]);
    if (attempts.rows[0].attempts > 5) throw new HttpError(429, 'Too many password-change attempts. Try again in 15 minutes.');
    const nextHash = await hashPassword(request.body.newPassword);
    await db.transaction(async tx => {
      const current = (await tx.query<{ password_hash: string }>('SELECT password_hash FROM users WHERE id=$1 AND active=true FOR UPDATE', [actor.id])).rows[0];
      if (!current || !await verifyPassword(request.body.currentPassword, current.password_hash)) throw new HttpError(400, 'Current password is incorrect.');
      await tx.query('UPDATE users SET password_hash=$1 WHERE id=$2', [nextHash, actor.id]);
      await tx.query('DELETE FROM sessions WHERE user_id=$1', [actor.id]);
      await audit(tx, actor.id, 'auth.password_changed', actor.id);
    });
    reply.clearCookie(cookieName, cookieOptions);
    return { ok: true };
  });

  app.get('/api/shops', async request => {
    const actor = actorOf(request);
    const result = await db.query(`SELECT s.*, ($2='admin' OR coalesce(m.can_change_prices,false)) AS can_change_prices, ($2='admin' OR coalesce(m.can_count_cash,false)) AS can_count_cash
      FROM shops s LEFT JOIN memberships m ON m.shop_id=s.id AND m.user_id=$1
      WHERE $2='admin' OR m.user_id IS NOT NULL ORDER BY s.code`, [actor.id, actor.role]);
    return { shops: result.rows };
  });
  app.get<{ Params: { id: string } }>('/api/shops/:id', { schema: { params: idParams } }, async request => {
    const actor = actorOf(request);
    const shop = (await db.query(`SELECT s.*, ($3='admin' OR coalesce(m.can_change_prices,false)) AS can_change_prices, ($3='admin' OR coalesce(m.can_count_cash,false)) AS can_count_cash
      FROM shops s LEFT JOIN memberships m ON m.shop_id=s.id AND m.user_id=$2
      WHERE s.id=$1 AND ($3='admin' OR m.user_id IS NOT NULL)`, [request.params.id, actor.id, actor.role])).rows[0];
    if (!shop) throw new HttpError(404, 'Shop not found or unavailable to your account.');
    return { shop, locations: (await db.query('SELECT id,name,kind,shop_id FROM locations WHERE shop_id=$1 ORDER BY kind', [request.params.id])).rows };
  });
  app.get('/api/storage/shared', async request => {
    const actor = actorOf(request);
    if (actor.role !== 'admin' && !actor.shared_storage_access) throw denied();
    return { locations: (await db.query("SELECT id,name,kind,shop_id FROM locations WHERE kind='shared' ORDER BY code")).rows };
  });

  app.get('/api/admin/users', async request => {
    adminOf(request);
    const users = (await db.query<User>('SELECT id,username,display_name,role,active,shared_storage_access FROM users ORDER BY created_at')).rows;
    const memberships = (await db.query<{ user_id: string; shop_id: string; can_change_prices: boolean;can_count_cash:boolean }>('SELECT * FROM memberships ORDER BY shop_id')).rows;
    return { users: users.map(user => ({ ...publicUser(user), memberships: memberships.filter(member => member.user_id === user.id).map(member => ({ shopId: member.shop_id, canChangePrices: member.can_change_prices,canCountCash:member.can_count_cash })) })) };
  });
  type CreateUser = { username: string; name: string; password: string; role: 'admin' | 'employee'; memberships: { shopId: string; canChangePrices: boolean; canCountCash?: boolean }[]; sharedStorageAccess: boolean };
  app.post<{ Body: CreateUser }>('/api/admin/users', { schema: { body: object({ username: usernameSchema, name: string(), password: passwordSchema,
    role: { type: 'string', enum: ['admin', 'employee'] }, memberships: membershipsSchema, sharedStorageAccess: { type: 'boolean' } }) } }, async (request, reply) => {
    const actor = adminOf(request);
    const data = request.body;
    if (!data.name.trim()) throw new HttpError(400, 'Name is required.');
    const passwordHash = await hashPassword(data.password);
    const id = randomUUID();
    await db.transaction(async tx => {
      await lockAdmin(tx, actor.id);
      await tx.query('INSERT INTO users(id,username,display_name,password_hash,role,shared_storage_access) VALUES($1,$2,$3,$4,$5,$6)',
        [id, data.username, data.name.trim(), passwordHash, data.role, data.sharedStorageAccess]);
      await setMemberships(tx, id, data.memberships);
      await audit(tx, actor.id, 'user.created', id, { username: data.username, role: data.role, memberships: data.memberships, sharedStorageAccess: data.sharedStorageAccess });
    });
    return reply.code(201).send({ id });
  });
  app.put<{ Params: { id: string }; Body: { memberships: { shopId: string; canChangePrices: boolean; canCountCash?: boolean }[]; sharedStorageAccess: boolean } }>('/api/admin/users/:id/access', {
    schema: { params: idParams, body: object({ memberships: membershipsSchema, sharedStorageAccess: { type: 'boolean' } }) },
  }, async request => {
    const actor = adminOf(request);
    await db.transaction(async tx => {
      await lockAdmin(tx, actor.id);
      const user = (await tx.query<User>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [request.params.id])).rows[0];
      if (!user) throw new HttpError(404, 'Account not found.');
      if (user.role === 'admin') throw new HttpError(400, 'Admins already have access to all shops and prices.');
      const before = (await tx.query('SELECT shop_id,can_change_prices,can_count_cash FROM memberships WHERE user_id=$1', [user.id])).rows;
      await setMemberships(tx, user.id, request.body.memberships);
      await tx.query('UPDATE users SET shared_storage_access=$1 WHERE id=$2', [request.body.sharedStorageAccess, user.id]);
      await audit(tx, actor.id, 'user.access_changed', user.id, { before: { memberships: before, sharedStorageAccess: user.shared_storage_access }, after: request.body });
    });
    return { ok: true };
  });
  app.patch<{ Params: { id: string }; Body: { active: boolean } }>('/api/admin/users/:id/status', {
    schema: { params: idParams, body: object({ active: { type: 'boolean' } }) },
  }, async request => {
    const actor = adminOf(request);
    if (actor.id === request.params.id) throw new HttpError(400, 'You cannot disable your own account.');
    await db.transaction(async tx => {
      await lockAdmin(tx, actor.id);
      const user = (await tx.query<User>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [request.params.id])).rows[0];
      if (!user) throw new HttpError(404, 'Account not found.');
      await tx.query('UPDATE users SET active=$1 WHERE id=$2', [request.body.active, user.id]);
      await tx.query('DELETE FROM sessions WHERE user_id=$1', [user.id]);
      await audit(tx, actor.id, 'user.status_changed', user.id, { before: user.active, after: request.body.active });
    });
    return { ok: true };
  });
  const reportQuery={querystring:{type:'object',additionalProperties:false,properties:{date:{type:'string',format:'date'},page:{type:'string',pattern:'^[1-9][0-9]{0,5}$'}}}};
  app.get<{Querystring:{page?:string;date?:string}}>('/api/admin/audit',{schema:reportQuery},async request=>{
    adminOf(request);
    return{events:(await db.query(`SELECT a.id,a.action,a.target_id,a.details,a.occurred_at,u.display_name AS actor_name
      FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id WHERE a.occurred_at >= $2::date AT TIME ZONE 'Etc/GMT' AND a.occurred_at < ($2::date+1) AT TIME ZONE 'Etc/GMT' ORDER BY a.id DESC LIMIT 100 OFFSET $1`,[(Number(request.query.page??1)-1)*100,request.query.date??new Date().toISOString().slice(0,10)])).rows};
  });
  app.get<{Querystring:{page?:string;date?:string}}>('/api/admin/price-history',{schema:reportQuery},async request=>{
    adminOf(request);const page=Number(request.query.page??1),pageSize=30;
    const entries=(await db.query(`SELECT concat(h.unit_id,':',h.version) AS id,h.old_price_minor,h.price_minor,h.changed_at,u.display_name AS actor_name,p.name,p.strength,su.label
      FROM price_history h JOIN users u ON u.id=h.changed_by JOIN selling_units su ON su.id=h.unit_id JOIN products p ON p.id=su.product_id
      WHERE h.changed_at >= $3::date AT TIME ZONE 'Etc/GMT' AND h.changed_at < ($3::date+1) AT TIME ZONE 'Etc/GMT' ORDER BY h.changed_at DESC,h.unit_id,h.version DESC LIMIT $1 OFFSET $2`,[pageSize,(page-1)*pageSize,request.query.date??new Date().toISOString().slice(0,10)])).rows;
    return{entries,page,pageSize};
  });
  registerCatalogueRoutes(app, db);
  registerCatalogueManagement(app,db);
  registerNotificationRoutes(app, db);
  registerSupplierRoutes(app, db);
  registerInventoryRoutes(app, db);
  registerSalesRoutes(app, db);
  registerOfflineRoutes(app, db);
  registerCashRoutes(app, db);
  registerDailyCashRoutes(app, db);
}