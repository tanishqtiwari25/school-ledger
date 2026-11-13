import assert from 'node:assert/strict';
const base='http://127.0.0.1:5189';const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=login.headers.get('set-cookie')?.split(';')[0],headers={cookie,'Content-Type':'application/json',origin:base};
async function get(){const r=await fetch(base+'/api/ledger',{headers});assert.equal(r.status,200);return r.json()}
async function post(action,payload,id=crypto.randomUUID()){const d=await get();const r=await fetch(base+'/api/ledger',{method:'POST',headers,body:JSON.stringify({action,payload,id,version:d.version})});return {status:r.status,data:await r.json(),id}}
let initial=await get(),person=initial.state.students.find(p=>p.code==='DEMO-TRANSPORT-001');
const plan={enabled:true,charges:['2026-07','2026-08','2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03'].map(period=>({period,amount:'800'}))};
if(!person){let r=await post('person',{type:'student',name:'Transport Demo Student',code:'DEMO-TRANSPORT-001',group:'6',section:'A',contact:'',session:'2026–2027',amount:'2500',previous:'0',discount:'0',joined:'2026-04-01',schedule:'Monthly',transportJSON:JSON.stringify(plan)});assert.equal(r.status,200,JSON.stringify(r.data));person=(await get()).state.students.find(p=>p.code==='DEMO-TRANSPORT-001');}
let state=(await get()).state;assert.equal(person.transport.charges.length,9);assert.equal(person.transport.charges[0].amount,80000);
let payment=state.tx.find(t=>t.reference==='TRANSPORT-DEMO-SPLIT');
if(!payment){let r=await post('transaction',{kind:'fee',person:person.id,date:'2026-11-13',amount:'3000',tuitionAmount:'2500',transportAmount:'500',account:'cash',method:'Cash',reference:'TRANSPORT-DEMO-SPLIT',notes:'Fictional local transport demonstration'});assert.equal(r.status,200,JSON.stringify(r.data));payment=(await get()).state.tx.find(t=>t.id===r.id)}
assert.deepEqual(payment.feeAllocation,{tuition:250000,transport:50000});
let overpay=await post('transaction',{kind:'fee',person:person.id,date:'2026-11-13',amount:'28000',tuitionAmount:'28000',transportAmount:'0',account:'cash'});assert.equal(overpay.status,400);
let edit={...person,type:'student',amount:String(person.amount/100),previous:String(person.previous/100),discount:String(person.discount/100),transportJSON:JSON.stringify({...plan,charges:plan.charges.map(c=>({...c,amount:c.period==='2026-07'?'900':c.amount}))})};
assert.equal((await post('person',edit)).status,400,'past transport rate is immutable');
let before=(await get()).state.tx.length;assert.equal((await post('transaction',{kind:'fee',person:person.id,date:'2026-11-13',amount:'3000',tuitionAmount:'2500',transportAmount:'500',account:'cash'},payment.id)).status,200);assert.equal((await get()).state.tx.length,before);
console.log('PASS: saved transport student, mixed fee allocation, historical rate protection, component overpayment, and receipt idempotency. Fictional local demo is available in Students & Fees.');
