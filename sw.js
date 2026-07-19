const CACHE='tcm-mastery-v4';
const ASSETS=['./','./index.html','./app.css','./conditions.js','./points.js','./herbs.js','./formulas.js','./app-core.js','./manifest.webmanifest'];

self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(ASSETS);
  await self.skipWaiting();
})()));

self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',event=>{
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(event.request,{cache:'no-store'});
        const cache=await caches.open(CACHE);
        if(fresh.ok)await cache.put('./index.html',fresh.clone());
        return fresh;
      }catch(error){
        return (await caches.match('./index.html'))||(await caches.match('./'));
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(cached)return cached;
    const fresh=await fetch(event.request);
    const cache=await caches.open(CACHE);
    if(fresh.ok&&event.request.method==='GET')cache.put(event.request,fresh.clone());
    return fresh;
  })());
});
