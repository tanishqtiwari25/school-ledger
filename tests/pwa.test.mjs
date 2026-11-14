import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import vm from 'node:vm';

const dist=process.env.PWA_DIST||'dist/client';
const script=await readFile(dist+'/sw.js','utf8');
function harness(){const listeners={},stored=new Map(),responded=[];let network=true;
 const caches={open:async()=>({addAll:async urls=>{urls.forEach(u=>stored.set(u,new Response('asset')))},put:async(u,r)=>stored.set(u,r)}),match:async u=>stored.get(u)?.clone(),keys:async()=>[],delete:async()=>true};
 const fetch=async req=>{if(!network)throw TypeError('offline');let r=new Response('<html>School Ledger shell</html>',{headers:{'Content-Type':'text/html'}});Object.defineProperty(r,'url',{value:new URL(typeof req==='string'?req:req.url,'https://school.test/').href});return r};
 const self={location:{origin:'https://school.test'},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>listeners[name]=fn};
 vm.runInNewContext(script,{self,caches,fetch,URL,Response});
 return {stored,listeners,responded,offline:()=>network=false,fetchEvent:async request=>{let result;listeners.fetch({request,respondWith:p=>result=p});return result?await result:null}};
}
test('install manifest has standalone display and valid standard/maskable PNG icons',async()=>{const manifest=JSON.parse(await readFile('public/manifest.webmanifest','utf8'));assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');for(const i of manifest.icons){let b=await readFile('public'+i.src);assert.equal(b.subarray(1,4).toString(),'PNG');assert.ok(i.sizes==='192x192'||i.sizes==='512x512')}assert.ok(manifest.icons.some(i=>i.purpose==='maskable'))});
test('production service worker precaches emitted JavaScript and CSS plus the shell',async()=>{let h=harness();let promise;h.listeners.install({waitUntil:p=>promise=p});await promise;let paths=[...h.stored.keys()];assert.ok(paths.some(p=>p.endsWith('.js')));assert.ok(paths.some(p=>p.endsWith('.css')));assert.ok(paths.includes('/'));for(const p of paths.filter(p=>p!=='/'))await access(dist+p)});
test('offline full navigation reopens the cached app shell',async()=>{let h=harness(),promise;h.listeners.install({waitUntil:p=>promise=p});await promise;h.offline();let result=await h.fetchEvent({url:'https://school.test/?source=pwa',method:'GET',mode:'navigate'});assert.equal(result.status,200);assert.match(await result.text(),/School Ledger shell/)});
test('API writes, reads, authentication, and cross-origin resources never enter the shell cache',async()=>{let h=harness();for(const request of [{url:'https://school.test/api/ledger',method:'POST'},{url:'https://school.test/api/ledger',method:'GET'},{url:'https://school.test/signin-with-chatgpt',method:'GET'},{url:'https://school.test/signout-with-chatgpt',method:'GET'},{url:'https://school.test/?_rsc=1',method:'GET'},{url:'https://other.test/private',method:'GET'}])assert.equal(await h.fetchEvent(request),null);assert.equal(h.stored.size,0)});
