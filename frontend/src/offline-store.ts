// Durable device storage. Never remove queued writes on logout or network failure.
let connection: Promise<IDBDatabase> | undefined;
function database() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('joyfrimens-offline', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('records');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readLocal<T>(key: string): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction('records').objectStore('records').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Only an explicit server-side business reset changes this revision. Ordinary
// logout, upgrades and network failures must never clear queued business records.
export async function acceptDataset(revision: string) {
  const previous=await readLocal<string>('business-dataset');
  if((previous??'initial')!==revision){
    const db=await database();
    await new Promise<void>((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').clear();tx.objectStore('records').put(revision,'business-dataset');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
    for(const storage of [localStorage,sessionStorage])for(const key of Object.keys(storage)){
      if(/^(ticket-edit:|sales-pending:|inventory-pending:|daily-cash:|cash-pending:|money-out:|refund-pending:|category-pending:|categories:|supplier-delivery:|verified-shop$)/.test(key))storage.removeItem(key);
    }
  }else if(!previous)await writeLocal([['business-dataset',revision]]);
}
export async function writeLocal(entries: [string, unknown][], remove: string[] = []) {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    for (const [key, value] of entries) tx.objectStore('records').put(value, key);
    for (const key of remove) tx.objectStore('records').delete(key);
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
  if(entries.some(([key])=>key.startsWith('outbox:'))||remove.some(key=>key.startsWith('outbox:')))window.dispatchEvent(new Event('offline-records-changed'));
}
export async function localEntries<T>(prefix: string): Promise<[string, T][]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const result: [string, T][] = [];
    const request = db.transaction('records').objectStore('records').openCursor(IDBKeyRange.bound(prefix, prefix+'\uffff'));
    request.onsuccess = () => { const cursor = request.result; if (!cursor) return resolve(result); result.push([String(cursor.key), cursor.value]); cursor.continue(); };
    request.onerror = () => reject(request.error);
  });
}

export async function enqueueLocal(prefix:string,requestKey:string,value:unknown):Promise<string>{
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('records','readwrite'),store=tx.objectStore('records'),key=prefix+requestKey;
  const existing=store.get(key);
  existing.onsuccess=()=>{if(existing.result)return;const sequence=store.get('queue-sequence');sequence.onsuccess=()=>{const next=Number(sequence.result??0)+1;store.put(next,'queue-sequence');store.put({...value as object,sequence:next},key);};};
  tx.oncomplete=()=>{window.dispatchEvent(new Event('offline-records-changed'));resolve(key);};tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
 });
}
