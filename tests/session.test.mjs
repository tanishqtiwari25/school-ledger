import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({entryPoints:['netlify-client/session.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {serverSession}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
test('dashboard requires a successful explicit server authentication acknowledgement',async()=>{
 assert.equal(await serverSession(async(path,options)=>{assert.equal(path,'/api/auth/session');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');return Response.json({authenticated:true});}),'authenticated');
 for(const body of [{authenticated:false},{},{email:'forged@example.test'}])assert.equal(await serverSession(async()=>Response.json(body)),'unavailable');
});
test('expired sessions stay anonymous while server outages remain distinguishable from logout',async()=>{
 assert.equal(await serverSession(async()=>new Response(null,{status:401})),'anonymous');
 for(const status of [403,404,500,503])assert.equal(await serverSession(async()=>new Response(null,{status})),'unavailable');
 assert.equal(await serverSession(async()=>{throw TypeError('offline')}),'unavailable');
 assert.equal(await serverSession(async()=>new Response('not json')),'unavailable');
});
