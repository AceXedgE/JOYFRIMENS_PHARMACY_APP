import { api, ApiError, type Session } from './api';
import { enqueueLocal, localEntries, readLocal, writeLocal } from './offline-store';
import type { CatalogueResult } from './catalogue-model';

export interface QueuedSaleWrite {path:string;body:Record<string,unknown>;result:any;userId:string;shopId:string;ticketId:string;recordedAt:string;sequence?:number;error?:string;uploaded?:boolean}
const prefix=(user:string)=>'outbox:'+user+':';
export async function queuedWrites(user:string){return (await localEntries<QueuedSaleWrite>(prefix(user))).sort((a,b)=>(a[1].sequence??0)-(b[1].sequence??0));}
export async function mappedPath(user:string,path:string){const ids=path.match(/[a-f0-9-]{36}/g)??[];for(const id of ids){const mapped=await readLocal<string>('mapped:'+user+':'+id);if(mapped)path=path.replace(id,mapped);}return path;}
async function settle(key:string,item:QueuedSaleWrite,result:any){
  const entries:[string,unknown][]=[];
  if(item.path.endsWith('/drafts'))entries.push(['mapped:'+item.userId+':'+item.result.id,result.id]);
  await writeLocal(entries,[key]);
}
export async function ticketWrite(session:Session,item:Omit<QueuedSaleWrite,'userId'|'recordedAt'>){
  const record:QueuedSaleWrite={...item,userId:session.user.id,recordedAt:new Date().toISOString()};
  const key=await enqueueLocal(prefix(session.user.id),String(item.body.requestKey),record);
  const older=(await queuedWrites(session.user.id)).some(([k,q])=>k!==key&&q.ticketId===record.ticketId);
  if(!older&&navigator.onLine){
    try{const result=await api<any>(await mappedPath(session.user.id,item.path),{method:'POST',body:item.body,csrf:session.csrfToken});await settle(key,record,result);return {result,queued:false};}
    catch(error){if(error instanceof ApiError&&error.status<500){await writeLocal([],[key]);throw error;}}
  }
  return {result:item.result,queued:true};
}
export async function syncSales(session:Session){
  const run=async()=>{
    if(!navigator.onLine)return;
    const blocked=new Set<string>();
    for(const [key,item] of await queuedWrites(session.user.id)){
      try{
        // Upload the device record first, including records needing reconciliation.
        if(!item.uploaded){await api(`/shops/${item.shopId}/offline-events`,{method:'POST',csrf:session.csrfToken,body:{requestKey:item.body.requestKey,path:item.path,payload:item.body,recordedAt:item.recordedAt}});item.uploaded=true;await writeLocal([[key,item]]);}
        if(blocked.has(item.ticketId))continue;
        const result=await api<any>(await mappedPath(session.user.id,item.path),{method:'POST',body:item.body,csrf:session.csrfToken});
        await api(`/shops/${item.shopId}/offline-events/${item.body.requestKey}/resolved`,{method:'POST',csrf:session.csrfToken,body:{}});
        await settle(key,item,result);
      }catch(error){
        if(!(error instanceof ApiError)||error.status===401||error.status===403)break;
        item.error=error.message;await writeLocal([[key,item]]);blocked.add(item.ticketId);
      }
    }
  };
  if(navigator.locks)await navigator.locks.request('joyfrimens-sync:'+session.user.id,{ifAvailable:true},lock=>lock?run():Promise.resolve());else await run();
}
export async function cacheCatalogue(session:Session,shop:string){
  if(!navigator.onLine)return;
  const path=`/shops/${shop}/catalogue`,products:CatalogueResult['products']=[];
  let result:CatalogueResult,page=1;
  do{result=await api<CatalogueResult>(path+'?page='+page);products.push(...result.products);page++;}while(products.length<result.total&&result.products.length);
  await writeLocal([['catalogue:'+session.user.id+':'+path,{...result,products}],['catalogue-time:'+session.user.id+':'+shop,new Date().toISOString()]]);
  void navigator.storage?.persist?.();
}
