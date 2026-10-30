import { readLocal, writeLocal, acceptDataset } from './offline-store';
import { rankProduct } from './offline-search';
import type { CatalogueResult } from './catalogue-model';
export interface User { id: string; username: string; name: string; role: 'admin' | 'employee'; active: boolean; sharedStorageAccess: boolean; }
export interface Session { user: User; csrfToken: string; datasetRevision?:string; }
export interface Shop { id: string; name: string; currency: string | null; timezone: string | null; can_change_prices: boolean; can_count_cash:boolean; }
export interface Location { id: string; name: string; kind: string; shop_id: string | null; }
export interface Member { shopId: string; canChangePrices: boolean;canCountCash?:boolean; }
export interface Staff extends User { memberships: Member[]; }
export interface AuditEvent { id: string; action: string; actor_name: string | null; occurred_at: string; details: unknown; }
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function api<T>(path: string, options: { method?: string; body?: unknown; csrf?: string; signal?: AbortSignal } = {}): Promise<T> {
  let response:Response;
  try { response = await fetch(`/api${path}`, {
    method: options.method ?? 'GET', credentials: 'same-origin', cache: 'no-store', signal: options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
    headers: { ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.method ? { 'X-Requested-With': 'joyfrimens' } : {}),
      ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}) },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  if(response.status>=500)throw new Error('The server is temporarily unavailable.');
  } catch(error) {
    if(options.signal?.aborted)throw error;
    if(!options.method){
      const user=await readLocal<string>('active-user');
      if(user&&cacheable(path)){
        if(path.includes('/catalogue?')){
          const [base,query]=path.split('?'),dataset=await readLocal<CatalogueResult>('catalogue:'+user+':'+base);
          if(dataset){const params=new URLSearchParams(query),page=Number(params.get('page')??1),q=params.get('q')??'';
            const products=dataset.products.map(product=>params.get('unavailable')==='true'?{...product,units:product.units.filter(u=>u.available===false)}:product).filter(product=>product.units.length).flatMap(product=>{const rank=rankProduct({...product,barcodes:product.units.flatMap(u=>u.barcode?[u.barcode]:[])},q);return rank?[{product:{...product,match:rank.match},score:rank.score}]:[];}).sort((a,b)=>a.score-b.score||a.product.name.localeCompare(b.product.name)).map(r=>r.product);
            return {...dataset,offline:true,products:params.get('download')==='true'?products:products.slice((page-1)*20,page*20),total:products.length,page,pageSize:20} as T;
          }
        }
        const cached=await readLocal<T>('cache:'+user+':'+path);if(cached!==undefined)return cached;
      }
    }
    throw error;
  }
  let data: unknown;
  try { data = await response.json(); } catch { throw new ApiError(response.status, 'The server returned an unexpected response.'); }
  if(response.status===401)await writeLocal([],['active-user']);
  if (!response.ok) throw new ApiError(response.status,
    typeof data === 'object' && data !== null && 'message' in data && typeof data.message === 'string' ? data.message : 'Request failed.');
  if(path==='/auth/login'||path==='/auth/me'){
    const session=data as Session;
    await acceptDataset(session.datasetRevision??'initial');
    await writeLocal([['active-user',session.user.id],['cache:'+session.user.id+':/auth/me',session]]);
  }else if(path==='/auth/logout'||path==='/auth/password'){await writeLocal([],['active-user']);}
  if(!options.method&&cacheable(path)){
    const user=await readLocal<string>('active-user');if(user)await writeLocal([['cache:'+user+':'+path,data]]);
  }
  return data as T;
}
export const messageOf = (error: unknown) => error instanceof Error ? error.message : 'Unable to connect. Please try again.';

function cacheable(path:string){return path==='/auth/me'||path==='/shops'||/^\/shops\/[^/]+$/.test(path)||/\/sales\/workspace$/.test(path)||path.includes('/catalogue?');}
