import assert from 'node:assert/strict';
const base='http://127.0.0.1:5189';
let login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});let cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'local sign-in cookie');
let headers={cookie,'Content-Type':'application/json',origin:base};
async function get(){let r=await fetch(base+'/api/ledger',{headers});assert.equal(r.status,200);return r.json()}
async function post(body){let r=await fetch(base+'/api/ledger',{method:'POST',headers,body:JSON.stringify(body)});return {status:r.status,data:await r.json()}}
let a=await get(),n=a.state.tx.length;let id=crypto.randomUUID(),body={action:'transaction',version:a.version,id,payload:{kind:'fee',person:'s0',amount:'100.25',date:'2026-11-13',account:'cash',category:'Tuition fee',method:'Cash',notes:'API integration test'}};
assert.equal((await post(body)).status,200);let b=await get();assert.equal(b.state.tx.length,n+1);assert.equal(b.state.tx.at(-1).amount,10025);assert.equal((await post(body)).status,200);assert.equal((await get()).state.tx.length,n+1,'retry cannot duplicate receipt');
assert.equal((await post({...body,id:crypto.randomUUID()})).status,409,'stale writes rejected');
assert.equal((await post({...body,id:crypto.randomUUID(),version:b.version,payload:{...body.payload,amount:'999999.00'}})).status,400,'fee overpayment needs advance consent');
assert.equal((await post({...body,id:crypto.randomUUID(),version:b.version,payload:{...body.payload,kind:'salary',person:'e0',period:'2026-11',amount:'12000.01'}})).status,400,'salary overpayment blocked');
let reversal={action:'transaction',version:b.version,id:crypto.randomUUID(),payload:{kind:'reversal',original:id,amount:'100.25',date:'2026-11-13',account:'cash',notes:'Reverse local integration test'}};assert.equal((await post(reversal)).status,200);let c=await get();assert.equal(c.state.tx.at(-1).amount,-10025);assert.equal(c.state.tx.at(-1).reverses,id);assert.equal((await post({...reversal,id:crypto.randomUUID(),version:c.version})).status,400,'double reversals blocked');assert.ok(c.state.audit.length>=2);let anon=await fetch(base+'/api/ledger');assert.equal(anon.status,401);console.log('PASS: persistence, exact decimals, duplicate submissions, stale-write conflicts, fee/salary overpayment, reversals, audit and unauthenticated denial');
