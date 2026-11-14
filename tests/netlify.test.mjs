import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
const built=await build({stdin:{contents:"export * from './server/postgres-d1.ts';export * from './server/ledger-handlers.ts';export * from './server/backups-handlers.ts';export {seed} from './app/ledger.ts';export {accessRole} from './app/access-role.ts';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {PostgresD1,postgresSQL,createLedgerHandlers,createBackupHandlers,accessRole,seed}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));
async function fixture(){
 const pg=new PGlite();await pg.exec(await readFile('netlify/database/migrations/001_school_ledger.sql','utf8'));
 let tail=Promise.resolve();
 const acquire=async()=>{let release;const next=new Promise(resolve=>release=resolve),previous=tail;tail=next;await previous;return release;};
 const query=async(sql,params)=>{const result=await pg.query(sql,params);return {rows:result.rows,rowCount:result.affectedRows??result.rows.length};};
 const pool={query:async(...args)=>{const release=await acquire();try{return await query(...args)}finally{release()}},connect:async()=>{const release=await acquire();return {query,release}}};
 const db=new PostgresD1(pool),env={DB:db,AUTH_PROVIDER:'netlify-identity',BOOTSTRAP_ADMIN_EMAIL:'owner@example.test'};
 const as=email=>createLedgerHandlers(env,async()=>email?{email,userId:email}:null);
 const owner=as(env.BOOTSTRAP_ADMIN_EMAIL);
 const get=async(handler=owner)=>{const response=await handler.GET();return {status:response.status,...await response.json()};};
 const post=async(action,payload,{handler=owner,version,id=crypto.randomUUID()}={})=>{version??=(await get()).version;const response=await handler.POST(new Request('https://school.example/api/ledger',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://school.example'},body:JSON.stringify({action,payload,version,id})}));return {status:response.status,...await response.json()};};
 return {pg,pool,db,env,as,owner,get,post};
}
test('Netlify only bootstraps the configured administrator and denies anonymous or unapproved identities',async()=>{
 const f=await fixture();try{
  assert.equal((await f.get(f.as(null))).status,401);
  assert.equal((await f.get(f.as('outsider@example.test'))).status,403);
  assert.equal((await f.get()).role,'Admin');
  assert.equal(accessRole(seed(),'outsider@example.test','netlify-identity',f.env.BOOTSTRAP_ADMIN_EMAIL),undefined);
 }finally{await f.pg.close();}
});
test('Postgres fee receipts reconcile, retry once, reject stale writes and retain a recovery point',async()=>{
 const f=await fixture();try{
  const start=await f.get(),id=crypto.randomUUID(),payload={kind:'income',date:'2026-11-14',amount:'100.25',account:'cash',category:'Donation',method:'Cash',reference:'NETLIFY-TEST',notes:'Fictional test only'};
  assert.equal((await f.post('transaction',payload,{version:start.version,id})).status,200);
  assert.equal((await f.post('transaction',payload,{version:start.version,id})).status,200);
  assert.equal((await f.post('transaction',payload,{version:start.version})).status,409);
  const next=await f.get();assert.equal(next.version,start.version+1);assert.equal(next.state.tx.filter(t=>t.id===id).length,1);assert.equal(next.state.tx.at(-1).amount,10025);
  const backups=createBackupHandlers(f.env,async()=>({email:f.env.BOOTSTRAP_ADMIN_EMAIL,userId:'owner'}));
  const response=await backups.GET(new Request('https://school.example/api/backups'));const saved=await response.json();assert.equal(saved.backups.length,1);
  const backup=await backups.GET(new Request('https://school.example/api/backups?id='+saved.backups[0].id));assert.deepEqual((await backup.json()).tx,start.state.tx);
 }finally{await f.pg.close();}
});
test('Postgres rollback never leaves a partial financial mutation or orphan recovery point',async()=>{
 const f=await fixture();try{
  const start=await f.get();
  await assert.rejects(f.db.batch([f.db.prepare('INSERT INTO backups (id,version,data,created,reason) VALUES (?,?,?,?,?)').bind('failed',0,'{}','today','test'),f.db.prepare('UPDATE missing_table SET data=?').bind('invalid')]));
  assert.equal((await f.pool.query('SELECT * FROM backups')).rows.length,0);
  assert.equal((await f.get()).version,start.version);
 }finally{await f.pg.close();}
});
test('competing payments at the same version commit once without losing an entry or duplicating a receipt',async()=>{
 const f=await fixture();try{
  const start=await f.get(),payload={kind:'income',date:'2026-11-14',amount:'25.01',account:'cash',category:'Donation',method:'Cash'};
  const results=await Promise.all([f.post('transaction',payload,{version:start.version}),f.post('transaction',payload,{version:start.version})]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const current=await f.get();assert.equal(current.version,start.version+1);assert.equal(current.state.tx.length,start.state.tx.length+1);
  assert.equal((await f.pool.query('SELECT * FROM backups')).rows.length,1);
 }finally{await f.pg.close();}
});
test('saved Accountant membership permits daily entries but denies Admin records and recovery downloads',async()=>{
 const f=await fixture();try{
  assert.equal((await f.post('user',{email:'accounts@example.test',role:'Accountant'})).status,200);
  const accountant=f.as('accounts@example.test');assert.equal((await f.get(accountant)).role,'Accountant');
  assert.equal((await f.post('account',{name:'Unauthorized',opening:'0'},{handler:accountant})).status,403);
  const backups=createBackupHandlers(f.env,async()=>({email:'accounts@example.test',userId:'accounts'}));assert.equal((await backups.GET(new Request('https://school.example/api/backups'))).status,403);
 }finally{await f.pg.close();}
});
test('database adapter uses bound Postgres parameters and conflict-safe initialization',()=>{
 assert.equal(postgresSQL('SELECT data FROM ledger WHERE id=?'),'SELECT data FROM ledger WHERE id=$1');
 assert.equal(postgresSQL('INSERT OR IGNORE INTO ledger (id,version,data) VALUES (?,0,?)'),'INSERT INTO ledger (id,version,data) VALUES ($1,0,$2) ON CONFLICT (id) DO NOTHING');
});
