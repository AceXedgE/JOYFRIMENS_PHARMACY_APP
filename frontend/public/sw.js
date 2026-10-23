const CACHE='joyfrimens-shell-v1';
const localAsset=url=>url.origin===self.location.origin&&!url.pathname.startsWith('/api/')&&!url.pathname.endsWith('/sw.js');
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(CACHE),response=await fetch('/');
 await cache.put('/',response.clone());
 const html=await response.text(),paths=[...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>new URL(m[1],self.location.origin)).filter(localAsset).map(u=>u.href);
 await Promise.all(paths.map(async path=>{try{await cache.add(path);}catch{}}));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_SHELL')return;
 event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const path of event.data.paths??[]){const url=new URL(path,self.location.origin);if(localAsset(url)){try{await cache.add(url.href);}catch{}}}})());
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||!localAsset(url))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);try{const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;}catch{const saved=await cache.match(event.request,{ignoreVary:true});if(saved)return saved;if(event.request.mode==='navigate'){const home=await cache.match('/');if(home)return home;}return Response.error();}})());
});
