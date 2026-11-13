/* Generated asset list is inserted by scripts/prepare-pwa.mjs after production build. */
const VERSION = 'school-ledger-shell-v1';
const PRECACHE = /* ASSET_LIST */ ['/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'];
const validShell = response => response.ok && !response.redirected && new URL(response.url).origin === self.location.origin && new URL(response.url).pathname === '/' && (response.headers.get('content-type')||'').includes('text/html');
async function cacheShell(){try{const response=await fetch('/',{cache:'no-store',credentials:'same-origin'});if(validShell(response)){const cache=await caches.open(VERSION);await cache.put('/',response);return true}}catch{/* Existing shell is retained. */}return false}
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(VERSION);await Promise.all(PRECACHE.map(async asset=>{const response=await fetch(asset,{credentials:'same-origin',cache:'reload'});if(!response.ok||response.redirected||new URL(response.url).origin!==self.location.origin)throw Error('Offline asset could not be cached');await cache.put(asset,response)}));if(!await cacheShell())throw Error('Offline app shell could not be cached')})());});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('school-ledger-shell-')&&key!==VERSION)await caches.delete(key);await self.clients.claim()})());});
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());if(event.data?.type==='CACHE_SHELL')event.waitUntil(cacheShell());});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  // No financial API, authentication response, RSC response, or cross-origin request is cached.
  if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname.includes('signin')||url.pathname.includes('signout')||url.pathname==='/callback'||url.searchParams.has('_rsc'))return;
  if(request.mode==='navigate'&&url.pathname==='/'){
    event.respondWith((async()=>{try{const response=await fetch(request);if(response.status>=500)throw Error('Server unavailable');if(validShell(response)){const cache=await caches.open(VERSION);await cache.put('/',response.clone())}return response}catch{const shell=await caches.match('/');return shell||new Response('<h1>School Ledger is not ready offline</h1><p>Connect to the internet and open the app once before using it offline.</p>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}})}})());return;
  }
  if(PRECACHE.includes(url.pathname))event.respondWith((async()=>{const cached=await caches.match(url.pathname);return cached||fetch(request)})());
});
