import 'fake-indexeddb/auto';
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const bundle=await build({stdin:{contents:"export * from './app/offline-store.ts'; export * from './app/ledger.ts'; export * from './app/financial.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {OfflineStore,seed,balance,makePayment,paymentContext,ApiError}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const realFetch=globalThis.fetch;
after(()=>{globalThis.fetch=realFetch});
const pass='test-only-vault-passphrase';
let server={state:seed(),version:0,role:'Admin',email:'test@school.test',asOf:new Date().toISOString()};
let lost=false,network=true,wrongAccount=false,denied=false,posts=0,onGet=null;
globalThis.fetch=async (url,options={})=>{
 if(!network)throw TypeError('Simulated network disconnection');
 if(denied)return Response.json({error:'Sign in required'},{status:401});
 if(options.method!=='POST'){if(onGet){const fn=onGet;onGet=null;await fn();}return Response.json({...server,email:wrongAccount?'other@school.test':server.email});}
 const b=JSON.parse(options.body);posts++;
 if(server.state.tx.some(t=>t.id===b.id))return Response.json({ok:true});
 if(b.version!==server.version||b.expectedContext!==paymentContext(server.state,b.payload))return Response.json({error:'Review changed records'},{status:409});
 try{server.state.tx.push(makePayment(server.state,b.payload,b.id,'GPS-'+String(server.state.tx.length+1).padStart(6,'0')));server.version++}catch(e){return Response.json({error:e.message},{status:400})}
 if(lost){lost=false;throw TypeError('Connection lost after server commit')}
 return Response.json({ok:true});
};
const payment=(amount='100.25')=>({kind:'fee',person:'s0',date:'2026-11-13',amount,account:'cash',method:'Cash',category:'Tuition fee',notes:'Test-only offline payment'});
let store=new OfflineStore(),backup;

test('encrypted vault survives restart, rejects wrong passphrase and a different account',async()=>{
 await store.enable(pass,structuredClone(server));
 await store.enqueue(payment(),'offline-one');
 const encrypted=await store.exportEncrypted();backup=encrypted;
 assert.ok(!encrypted.includes('Aarav'));assert.ok(!encrypted.includes('Test-only offline payment'));assert.ok(!encrypted.includes(pass));
 store.lock();assert.equal(await store.get(),null);
 await assert.rejects(store.unlock('incorrect-password'),/Incorrect passphrase/);
 await assert.rejects(store.unlock(pass,'other@school.test'),/different signed-in account/);
 await store.unlock(pass,server.email);
 assert.equal((await store.get()).queue[0].id,'offline-one');
});

test('offline validation includes queued payments, keeps confirmed balances unchanged, and deduplicates IDs',async()=>{
 const before=balance((await store.get()).snapshot.state,'cash');
 await store.enqueue(payment(),'offline-one');assert.equal((await store.get()).queue.length,1);
 const v=await store.get();assert.equal(balance(v.snapshot.state,'cash'),before);assert.match(v.queue[0].tx.receipt,/^LOCAL-/);
 await assert.rejects(store.enqueue(payment('999999'),'invalid-overpay'),/exceeds/);
 await store.enqueue({kind:'salary',person:'e0',period:'2026-11',date:'2026-11-13',amount:'10000',account:'bank'},'salary-one');
 await assert.rejects(store.enqueue({kind:'salary',person:'e0',period:'2026-11',date:'2026-11-13',amount:'2000.01',account:'bank'},'salary-overpay'),/exceeds salary/);
 assert.equal((await store.get()).queue.length,2);
 await assert.rejects(store.forget(),/pending/);
});

test('network loss preserves queue; sequential sync posts both entries once',async()=>{
 network=false;await assert.rejects(store.sync(()=>{}),/disconnection/);assert.equal((await store.get()).queue.length,2);
 network=true;await store.sync(()=>{});assert.equal((await store.get()).queue.length,0);
 assert.equal(server.state.tx.filter(t=>t.id==='offline-one').length,1);assert.equal(server.state.tx.find(t=>t.id==='offline-one').amount,10025);
 assert.equal(server.state.tx.filter(t=>t.id==='salary-one').length,1);
});

test('lost acknowledgement is reconciled by the same ID without duplicate submission',async()=>{
 await store.enqueue(payment('50.10'),'lost-ack');lost=true;
 await assert.rejects(store.sync(()=>{}),/lost after server commit/);
 assert.equal((await store.get()).queue[0].attempted,true);
 await assert.rejects(store.abandon('lost-ack','cancel'),/may already have reached/);
 const before=posts;await store.sync(()=>{});assert.equal(posts,before,'GET confirmation avoids a second POST');
 assert.equal((await store.get()).queue.length,0);assert.equal(server.state.tx.filter(t=>t.id==='lost-ack').length,1);
});

test('changed financial context requires review and never silently rebases',async()=>{
 await store.enqueue(payment(),'conflicting');
 server.state.tx.push(makePayment(server.state,{kind:'income',date:'2026-11-13',amount:'1',account:'cash',category:'Donation'},'other-device','GPS-other'));server.version++;
 const before=posts;await store.sync(()=>{});let v=await store.get();assert.equal(v.queue[0].status,'conflict');assert.equal(posts,before);
 await store.review('conflicting',structuredClone(server));await store.sync(()=>{});assert.equal((await store.get()).queue.length,0);
});

test('multi-window writes preserve both entries; cancellations retain reasons through snapshot refresh',async()=>{
 const second=new OfflineStore();await second.unlock(pass,server.email);
 await Promise.all([store.enqueue(payment(),'tab-a'),second.enqueue(payment(),'tab-b')]);
 assert.equal((await store.get()).queue.length,2);
 await store.abandon('tab-a','Operator entered duplicate source paperwork');
 await store.snapshot({...structuredClone(server),asOf:new Date().toISOString()});
 let v=await store.get();assert.equal(v.cancelled[0].id,'tab-a');assert.match(v.cancelled[0].reason,/duplicate/);assert.equal(v.queue[0].status,'conflict');
 await store.review('tab-b',structuredClone(server));await Promise.all([store.sync(()=>{}),second.sync(()=>{})]);
 assert.equal(server.state.tx.filter(t=>t.id==='tab-b').length,1);assert.equal((await store.get()).queue.length,0);second.close();
});

test('offline transfer and reversal preserve cash flow and reconcile after sync',async()=>{
 const before=server.state.accounts.reduce((a,x)=>a+balance(server.state,x.id),0);
 await store.enqueue({kind:'transfer',date:'2026-11-13',amount:'10.01',account:'cash',to:'bank'},'offline-transfer');await store.sync(()=>{});
 assert.equal(server.state.accounts.reduce((a,x)=>a+balance(server.state,x.id),0),before);
 await store.enqueue({kind:'reversal',original:'offline-transfer',date:'2026-11-13',amount:'10.01',account:'cash',notes:'Reverse test transfer'},'offline-reversal');await store.sync(()=>{});
 assert.equal(server.state.tx.find(t=>t.id==='offline-reversal').amount,-1001);
 assert.equal(server.state.accounts.reduce((a,x)=>a+balance(server.state,x.id),0),before);
});

test('identity changes and expired authentication never upload saved financial entries',async()=>{
 await store.enqueue(payment(),'identity-check');const before=posts;wrongAccount=true;await assert.rejects(store.sync(()=>{}),/different account/);assert.equal(posts,before);wrongAccount=false;
 denied=true;await assert.rejects(store.sync(()=>{}),e=>e instanceof ApiError&&e.status===401);assert.equal(posts,before);denied=false;
 await store.sync(()=>{});assert.equal((await store.get()).queue.length,0);
 await store.forget();assert.equal(await store.exists(),false);store.close();
});

test('encrypted backups restore pending IDs, validate origin and owner, and reconcile already committed payments',async()=>{
 const e=JSON.parse(backup);await assert.rejects(store.restoreEncrypted(JSON.stringify({...e,site:'https://another-school.test'}),pass),/different school site/);
 await assert.rejects(store.restoreEncrypted(backup,pass,'other@school.test'),/account that created/);
 await assert.rejects(store.restoreEncrypted(backup,'incorrect passphrase'),/Incorrect backup passphrase/);
 await store.restoreEncrypted(backup,pass,server.email);assert.equal((await store.get()).queue[0].id,'offline-one');
 const before=posts;await store.sync(()=>{});assert.equal(posts,before);assert.equal((await store.get()).queue.length,0);
 await store.forget();store.close();
});

test('a concurrent cancellation cannot post an already cancelled draft',async()=>{
 store=new OfflineStore();await store.enable(pass,structuredClone(server));await store.enqueue(payment(),'cancel-race');
 const before=posts;onGet=()=>store.abandon('cancel-race','Cancelled in another local window');
 await assert.rejects(store.sync(()=>{}),/queue changed/);assert.equal(posts,before);assert.equal((await store.get()).queue.length,0);assert.equal((await store.get()).cancelled[0].id,'cancel-race');await store.forget();store.close();
});
test('a committed payment still awaiting acknowledgement is not counted twice during local validation',async()=>{
 store=new OfflineStore();await store.enable(pass,structuredClone(server));await store.enqueue(payment(),'ack-projection');lost=true;await assert.rejects(store.sync(()=>{}),/lost after/);
 await store.snapshot(structuredClone(server));await store.enqueue(payment('1.01'),'next-after-ack');
 await store.sync(()=>{});assert.equal((await store.get()).queue.length,0);assert.equal(server.state.tx.filter(t=>t.id==='ack-projection').length,1);assert.equal(server.state.tx.filter(t=>t.id==='next-after-ack').length,1);await store.forget();store.close();
});

test('offline mixed fee receipts retain their transport allocation through sync and refunds',async()=>{
 server.state.students[0].transport={enabled:true,charges:[{period:'2026-11',amount:80000}]};server.version++;
 store=new OfflineStore();await store.enable(pass,structuredClone(server));
 await store.enqueue({...payment('3000'),tuitionAmount:'2500',transportAmount:'500'},'offline-mixed');
 await store.enqueue({...payment('300'),tuitionAmount:'0',transportAmount:'300'},'offline-transport');
 await assert.rejects(store.enqueue({...payment('0.01'),tuitionAmount:'0',transportAmount:'0.01'},'transport-overpay'),/exceeds/);
 await store.sync(()=>{});assert.equal((await store.get()).queue.length,0);
 assert.deepEqual(server.state.tx.find(t=>t.id==='offline-mixed').feeAllocation,{tuition:250000,transport:50000});
 assert.deepEqual(server.state.tx.find(t=>t.id==='offline-transport').feeAllocation,{tuition:0,transport:30000});
 await store.enqueue({kind:'reversal',original:'offline-mixed',date:'2026-11-13',amount:'3000',account:'cash',notes:'Test component reversal'},'offline-mixed-refund');await store.sync(()=>{});
 assert.deepEqual(server.state.tx.find(t=>t.id==='offline-mixed-refund').feeAllocation,{tuition:-250000,transport:-50000});await store.forget();store.close();
});

test('multiple partial offline refunds reconcile exactly after connection loss and a lost server acknowledgement',async()=>{
 const before=balance(server.state,'cash');store=new OfflineStore();await store.enable(pass,structuredClone(server));
 await store.enqueue({...payment('1000'),tuitionAmount:'600',transportAmount:'400'},'partial-offline-payment');
 const refund=(amount,transportAmount)=>({kind:'reversal',original:'partial-offline-payment',amount,transportAmount,date:'2026-11-13',notes:'Test-only partial refund requested'});
 await store.enqueue(refund('250','100'),'partial-offline-r1');
 await store.enqueue(refund('750','300'),'partial-offline-r2');
 await assert.rejects(store.enqueue(refund('0.01','0'),'partial-offline-excess'),/already been reversed/);
 network=false;await assert.rejects(store.sync(()=>{}),/disconnection/);assert.equal((await store.get()).queue.length,3);
 network=true;lost=true;await assert.rejects(store.sync(()=>{}),/lost after/);
 await store.sync(()=>{});assert.equal((await store.get()).queue.length,0);
 for(const id of ['partial-offline-payment','partial-offline-r1','partial-offline-r2'])assert.equal(server.state.tx.filter(t=>t.id===id).length,1);
 const original=server.state.tx.find(t=>t.id==='partial-offline-payment'),refunds=server.state.tx.filter(t=>t.reverses===original.id);
 assert.equal(original.amount+refunds.reduce((a,t)=>a+t.amount,0),0);
 for(const component of ['tuition','transport'])assert.equal(original.feeAllocation[component]+refunds.reduce((a,t)=>a+t.feeAllocation[component],0),0);
 assert.equal(balance(server.state,'cash'),before);await store.forget();store.close();
});
