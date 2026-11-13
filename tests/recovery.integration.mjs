import assert from 'node:assert/strict';
import {build} from 'esbuild';
const built=await build({stdin:{contents:"export {seed} from './app/ledger.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {seed}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
const base='http://127.0.0.1:5189';
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=login.headers.get('set-cookie').split(';')[0];
const headers={cookie,'Content-Type':'application/json',origin:base};
async function get(){return (await fetch(base+'/api/ledger',{headers})).json();}
async function post(action,payload,id=crypto.randomUUID(),version){const latest=version??(await get()).version;const r=await fetch(base+'/api/ledger',{method:'POST',headers,body:JSON.stringify({action,payload,id,version:latest})});return {status:r.status,data:await r.json()};}
const original=(await get()).state;
try{
 const id=crypto.randomUUID();assert.equal((await post('transaction',{kind:'income',amount:'1.23',date:'2026-11-13',account:'cash',category:'Integration test',notes:'Fictional local recovery test'},id)).status,200);
 assert.equal((await post('transaction',{kind:'reversal',original:id,amount:'0.23',date:'2026-11-13',notes:'Partial test refund'})).status,200);
 const live=await get();assert.equal(live.state.tx.at(-1).amount,-23);
 const list=await (await fetch(base+'/api/backups',{headers})).json();assert.ok(list.backups.length>=2);const point=await(await fetch(base+'/api/backups?id='+list.backups[0].id,{headers})).json();assert.ok(point.tx.some(t=>t.id===id));assert.ok(!point.tx.some(t=>t.amount===-23&&t.reverses===id));
 assert.equal((await post('user',{email:'test-accountant@sites.test',role:'Accountant'})).status,200);
 const ah={'oai-authenticated-user-id':'test_accountant','oai-authenticated-user-email':'test-accountant@sites.test','Content-Type':'application/json'};
 const accountant=await (await fetch('http://127.0.0.1:5190/api/ledger',{headers:ah})).json();assert.equal(accountant.role,'Accountant');
 for(const action of ['person','settings','account','restore','initialize','user']){const r=await fetch('http://127.0.0.1:5190/api/ledger',{method:'POST',headers:ah,body:JSON.stringify({action,payload:{},id:crypto.randomUUID(),version:accountant.version})});assert.equal(r.status,403,action+' Admin-only');}
 assert.equal((await fetch('http://127.0.0.1:5190/api/backups',{headers:ah})).status,403);
 assert.equal((await fetch('http://127.0.0.1:5190/api/ledger',{headers:{'oai-authenticated-user-id':'outsider','oai-authenticated-user-email':'outsider@sites.test'}})).status,403);
 const invalid=structuredClone(original);invalid.tx[0].amount=1.001;assert.equal((await post('restore',{state:invalid,confirm:'RESTORE BACKUP'})).status,400);
 const rid=crypto.randomUUID();assert.equal((await post('restore',{state:original,confirm:'RESTORE BACKUP'},rid)).status,200);const restored=await get();assert.equal(restored.state.tx.length,original.tx.length);assert.ok(restored.state.users.some(u=>u.email==='test-accountant@sites.test'),'restore retains current access');assert.ok(restored.state.audit.some(a=>a.requestId===rid));assert.equal((await post('restore',{state:original,confirm:'RESTORE BACKUP'},rid,restored.version-1)).status,200,'restore retry idempotent');assert.equal((await get()).version,restored.version);
 assert.equal((await post('restore',{state:seed(),confirm:'RESTORE BACKUP'})).status,200);
 assert.equal((await post('initialize',{school:'Recovery Test School',session:'2026–2027',cash:'123.45',bank:'500',confirm:'START REAL ACCOUNTS'})).status,200);
 const initialized=await get();assert.equal(initialized.state.demo,false);assert.equal(initialized.state.tx.length,0);assert.equal(initialized.state.students.length,0);assert.equal(initialized.state.accounts[0].opening,12345);assert.equal((await post('initialize',{school:'Again',session:'2026–2027',confirm:'START REAL ACCOUNTS'})).status,400);
 assert.equal((await post('restore',{state:original,confirm:'RESTORE BACKUP'})).status,200);
 console.log('PASS: persisted automatic recovery snapshots, partial refund, backup validation, confirmed restore, idempotent restore and Admin/Accountant authorization');
}finally{const current=await get();if(current.state.tx.length!==original.tx.length)assert.equal((await post('restore',{state:original,confirm:'RESTORE BACKUP'})).status,200);}
