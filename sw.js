const CACHE='tcm-mastery-v2';
const ASSETS=['./','./index.html','./manifest.webmanifest'];

const MOBILE_LAYOUT_FIX=`<style id="mobile-layout-v2">
.case #caseContent{min-width:0}
.case .option{width:100%;white-space:normal;overflow-wrap:anywhere;line-height:1.45}
.case label.option{display:flex!important;align-items:flex-start;gap:12px;width:100%;min-height:auto;margin:16px 0 0;padding:16px;white-space:normal;overflow:visible}
.case label.option input{flex:0 0 22px;width:22px;height:22px;margin:2px 0 0}
.case label.option + .primary{display:block;margin-top:16px}
@media(max-width:800px){
  .case{padding:18px 16px}
  .case h2{font-size:clamp(28px,8vw,42px);line-height:1.15}
  .case .muted{font-size:16px;line-height:1.5}
  .case label.option{font-size:17px}
  .case .primary{min-height:52px}
}
</style>`;

async function withMobileFix(response){
  if(!response)return response;
  const type=response.headers.get('content-type')||'';
  if(!type.includes('text/html'))return response;
  const html=await response.text();
  const fixed=html.includes('mobile-layout-v2')?html:html.replace('</head>',MOBILE_LAYOUT_FIX+'</head>');
  return new Response(fixed,{status:response.status,statusText:response.statusText,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
}

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
      const cache=await caches.open(CACHE);
      try{
        const fresh=await fetch(event.request,{cache:'no-store'});
        if(fresh.ok)await cache.put('./index.html',fresh.clone());
        return withMobileFix(fresh);
      }catch(error){
        const cached=await cache.match('./index.html')||await cache.match('./');
        return withMobileFix(cached);
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);
    if(cached)return cached;
    const fresh=await fetch(event.request);
    return fresh;
  })());
});
