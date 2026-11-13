import {makePayment,paymentContext,type PaymentInput} from './financial';
import type {State,Tx} from './ledger';

export type Snapshot={state:State,version:number,role:string,email:string,asOf:string};
export type Draft={id:string,payload:PaymentInput,context:string,created:string,status:'pending'|'conflict',reason?:string,attempted?:boolean,attemptedVersion?:number,tx:Tx};
export type Vault={snapshot:Snapshot,queue:Draft[],cancelled:{id:string,date:string,reason:string,payload:PaymentInput}[]};
type Envelope={site:string,owner:string,salt:number[],iv:number[],cipher:number[],revision:number};
const DB='school-ledger-offline-v1',STORE='vault';
const encoder=new TextEncoder();
const siteOrigin=()=>typeof location==='undefined'?'test://school-ledger':location.origin;

function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('Device storage is unavailable. Use a normal browser window and allow site storage.'));});}
async function readEnvelope():Promise<Envelope|undefined>{const db=await database();return new Promise((resolve,reject)=>{let t=db.transaction(STORE),r=t.objectStore(STORE).get('data');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);t.oncomplete=()=>db.close();});}
async function putEnvelope(value:Envelope,expected:number|null){const db=await database();return new Promise<void>((resolve,reject)=>{let t=db.transaction(STORE,'readwrite'),store=t.objectStore(STORE),r=store.get('data');r.onsuccess=()=>{if((r.result?.revision??null)!==expected){t.abort();return}store.put(value,'data')};t.oncomplete=()=>{db.close();resolve()};t.onabort=()=>{db.close();reject(Error('Device data changed in another window. Refresh and retry.'))};t.onerror=()=>reject(Error('Could not save on this device. Free storage and try again.'));});}
async function derive(passphrase:string,salt:Uint8Array):Promise<CryptoKey>{const material=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt as BufferSource,iterations:310000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function seal(v:Vault,key:CryptoKey,base:Pick<Envelope,'site'|'owner'|'salt'|'revision'>):Promise<Envelope>{const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(base.owner+'\n'+base.site)},key,encoder.encode(JSON.stringify(v)));return {...base,iv:[...iv],cipher:[...new Uint8Array(cipher)]};}
async function unseal(e:Envelope,key:CryptoKey):Promise<Vault>{const result=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(e.iv),additionalData:encoder.encode(e.owner+'\n'+e.site)},key,new Uint8Array(e.cipher));return JSON.parse(new TextDecoder().decode(result));}
export class ApiError extends Error{constructor(message:string,public status:number){super(message)}}
export async function fetchSnapshot():Promise<Snapshot>{const r=await fetch('/api/ledger',{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok){let d:any=await r.json().catch(()=>({}));throw new ApiError(d.error||'The server is unavailable.',r.status)}const d:any=await r.json();return {...d,asOf:new Date().toISOString()};}

export class OfflineStore {
  private key:CryptoKey|null=null;
  private owner='';
  private listeners=new Set<()=>void>();
  private channel:BroadcastChannel|null=null;
  private syncing=false;
  constructor(){if(typeof window!=='undefined'&&typeof BroadcastChannel!=='undefined'){this.channel=new BroadcastChannel('school-ledger-vault');this.channel.onmessage=event=>{if(event.data==='lock'){this.key=null;this.owner=''}this.notify(false)}}}
  subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn)}}
  private notify(broadcast=true){this.listeners.forEach(fn=>fn());if(broadcast)this.channel?.postMessage('changed')}
  async exists(){return !!await readEnvelope()}
  get unlocked(){return !!this.key}
  async enable(passphrase:string,snapshot:Snapshot){
    if(passphrase.length<10)throw Error('Use a device passphrase with at least 10 characters.');
    if(await readEnvelope())throw Error('Offline data already exists. Unlock it with its passphrase.');
    const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(passphrase,salt);
    const envelope=await seal({snapshot,queue:[],cancelled:[]},key,{site:siteOrigin(),owner:snapshot.email,salt:[...salt],revision:1});
    await putEnvelope(envelope,null);this.key=key;this.owner=snapshot.email;
    if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);
    this.notify();
  }
  async unlock(passphrase:string,currentEmail?:string){
    const envelope=await readEnvelope();if(!envelope)throw Error('Offline mode has not been set up on this device.');
    if(currentEmail&&envelope.owner!==currentEmail)throw Error('This device vault belongs to a different signed-in account. Sign in with the original account.');
    const key=await derive(passphrase,new Uint8Array(envelope.salt));
    let vault:Vault;try{vault=await unseal(envelope,key)}catch{throw Error('Incorrect passphrase or damaged device data. Try again.');}
    this.key=key;this.owner=envelope.owner;this.notify();return vault;
  }
  lock(){this.key=null;this.owner='';this.channel?.postMessage('lock');this.notify(false)}
  async get():Promise<Vault|null>{if(!this.key)return null;const e=await readEnvelope();if(!e||e.owner!==this.owner){this.lock();throw Error('Device account changed. Unlock again.')}return unseal(e,this.key);}
  private async mutate(fn:(v:Vault)=>void){
    const operation=async()=>{if(!this.key)throw Error('Unlock offline mode first.');const e=await readEnvelope();if(!e||e.owner!==this.owner)throw Error('Offline account mismatch.');let v=await unseal(e,this.key);fn(v);await putEnvelope(await seal(v,this.key,{...e,revision:e.revision+1}),e.revision);this.notify();return v};
    return navigator.locks?navigator.locks.request('school-ledger-vault-write',operation):operation();
  }
  async snapshot(snapshot:Snapshot){if(!this.key)return;await this.mutate(v=>{if(snapshot.email!==v.snapshot.email)throw new ApiError('Sign in with the offline account before syncing.',403);if(snapshot.version>=v.snapshot.version)v.snapshot=snapshot});}
  async enqueue(payload:PaymentInput,id:string){return this.mutate(v=>{
    if(v.queue.some(q=>q.id===id)||v.snapshot.state.tx.some(t=>t.id===id))return;
    if(v.queue.some(q=>q.status==='conflict'))throw Error('Resolve the pending sync conflict before adding another offline payment.');
    let state=structuredClone(v.snapshot.state);
    for(const draft of v.queue)if(!state.tx.some(t=>t.id===draft.id))state.tx.push(makePayment(state,draft.payload,draft.id,'LOCAL-'+draft.id.slice(0,8)));
    const tx=makePayment(state,payload,id,'LOCAL-'+id.slice(0,8));
    v.queue.push({id,payload,context:paymentContext(state,payload),created:new Date().toISOString(),status:'pending',tx});
  });}
  async review(id:string,snapshot:Snapshot){
    await this.mutate(v=>{if(v.snapshot.email!==snapshot.email)throw Error('Account mismatch.');if(v.queue[0]?.id!==id)throw Error('Review the first pending entry first.');v.queue[0].tx=makePayment(snapshot.state,v.queue[0].payload,id,'LOCAL-'+id.slice(0,8));v.snapshot=snapshot;v.queue[0].context=paymentContext(snapshot.state,v.queue[0].payload);v.queue[0].status='pending';delete v.queue[0].reason;});
  }
  async abandon(id:string,reason:string){
    if(!reason.trim())throw Error('A reason is required.');
    await this.mutate(v=>{const draft=v.queue.find(q=>q.id===id);if(!draft)throw Error('Pending entry not found.');if(draft.attempted)throw Error('This entry may already have reached the server. Reconnect and sync to confirm its status first.');
      v.cancelled??=[];v.cancelled.push({id,date:new Date().toISOString(),reason,payload:draft.payload});v.queue=v.queue.filter(q=>q.id!==id);
      v.queue.forEach(q=>{q.status='conflict';q.reason='An earlier pending entry was cancelled. Review this entry against current balances.'});
    });
  }
  async sync(onSnapshot:(s:Snapshot)=>void):Promise<string>{
    if(!this.key||this.syncing)return '';this.syncing=true;
    const run=async()=>{let message='All device entries are synced.';
      while(true){let vault=await this.get();if(!vault)return '';let fresh=await fetchSnapshot();if(fresh.email!==vault.snapshot.email)throw new ApiError('A different account is signed in. Pending entries were not uploaded.',403);
        await this.snapshot(fresh);onSnapshot(fresh);let draft=vault.queue[0];if(!draft)return message;
        if(fresh.state.tx.some(t=>t.id===draft.id)){await this.mutate(v=>{v.queue=v.queue.filter(q=>q.id!==draft.id)});continue}
        if(draft.status==='conflict')return 'A pending entry needs your review.';
        if(paymentContext(fresh.state,draft.payload)!==draft.context){await this.mutate(v=>{let q=v.queue.find(q=>q.id===draft.id);if(q){q.status='conflict';if(q.attemptedVersion!==undefined&&fresh.version>q.attemptedVersion)q.attempted=false;q.reason='The account balance, fee due, or salary record changed on the server. Review before posting.'}});return 'A pending entry needs your review.';}
        await this.mutate(v=>{const q=v.queue.find(q=>q.id===draft.id);if(!q||q.status!=='pending'||q.context!==draft.context)throw Error('The device queue changed in another window. Retry sync.');q.attempted=true;q.attemptedVersion=fresh.version});
        const r=await fetch('/api/ledger',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({action:'transaction',id:draft.id,version:fresh.version,expectedContext:draft.context,payload:draft.payload})});
        if(!r.ok){let d:any=await r.json().catch(()=>({}));if(r.status===401||r.status===403)throw new ApiError(d.error||'Sign in again to sync.',r.status);if(r.status>=500)throw new ApiError('Server unavailable. Your device entry is still saved.',r.status);
          await this.mutate(v=>{let q=v.queue.find(q=>q.id===draft.id);if(q){q.status='conflict';q.attempted=false;q.reason=d.error||'The server could not accept this entry.'}});return 'A pending entry needs your review.';}
        // Keep the queued ID until a fresh GET proves it committed. A lost response cannot duplicate it.
        fresh=await fetchSnapshot();if(!fresh.state.tx.some(t=>t.id===draft.id))throw Error('Payment acknowledgement is delayed. The saved entry will be checked again.');
        await this.mutate(v=>{v.snapshot=fresh;v.queue=v.queue.filter(q=>q.id!==draft.id)});onSnapshot(fresh);
      }
    };
    try{return navigator.locks?await navigator.locks.request('school-ledger-sync',run):await run()}finally{this.syncing=false}
  }
  async exportEncrypted(){const e=await readEnvelope();if(!e)throw Error('No offline backup exists.');return JSON.stringify({format:DB,...e})}
  async restoreEncrypted(contents:string,passphrase:string,currentEmail?:string){
    if(await readEnvelope())throw Error('Unlock and remove the existing device vault before restoring another backup. Pending entries must be resolved first.');
    if(contents.length>20000000)throw Error('This backup is too large.');
    let e:any;try{e=JSON.parse(contents)}catch{throw Error('Choose a valid encrypted School Ledger backup.');}
    if(e.site!==siteOrigin())throw Error('This backup belongs to a different school site. Restore it at its original address.');
    if(e.format!==DB||!Array.isArray(e.salt)||e.salt.length!==16||!Array.isArray(e.iv)||e.iv.length!==12||!Array.isArray(e.cipher)||typeof e.owner!=='string')throw Error('Unsupported backup format.');
    for(const values of [e.salt,e.iv,e.cipher])if(values.some((x:any)=>!Number.isInteger(x)||x<0||x>255))throw Error('Damaged backup file.');
    if(currentEmail&&e.owner!==currentEmail)throw Error('Sign in with the account that created this backup.');
    const key=await derive(passphrase,new Uint8Array(e.salt));let v:Vault;
    try{v=await unseal(e,key)}catch{throw Error('Incorrect backup passphrase or damaged backup.');}
    if(v.snapshot?.email!==e.owner||!Number.isInteger(v.snapshot.version)||!['Admin','Accountant'].includes(v.snapshot.role)||!Array.isArray(v.queue)||!Array.isArray(v.snapshot.state?.tx)||!Array.isArray(v.snapshot.state?.accounts)||!Array.isArray(v.snapshot.state?.students)||!Array.isArray(v.snapshot.state?.staff))throw Error('The backup does not contain valid school records.');
    if(v.queue.some(q=>!q.id||!q.tx||!q.payload||typeof q.context!=='string'||!['pending','conflict'].includes(q.status)))throw Error('The backup contains an invalid pending entry.');
    await putEnvelope(await seal(v,key,{site:e.site,owner:e.owner,salt:e.salt,revision:1}),null);this.key=key;this.owner=e.owner;this.notify();return v;
  }
  async forget(){const operation=async()=>{if(!this.key)throw Error('Unlock the device vault first.');const e=await readEnvelope();if(!e||e.owner!==this.owner)throw Error('Device account changed.');const v=await unseal(e,this.key);if(v.queue.length)throw Error('Sync or explicitly cancel every pending entry before removing device data.');const db=await database();await new Promise<void>((resolve,reject)=>{const t=db.transaction(STORE,'readwrite'),store=t.objectStore(STORE),r=store.get('data');r.onsuccess=()=>{if(r.result?.revision!==e.revision){t.abort();return}store.delete('data')};t.oncomplete=()=>{db.close();resolve()};t.onabort=()=>{db.close();reject(Error('Device data changed. Retry removal.'))};t.onerror=()=>reject(t.error)});this.lock();this.notify();};return navigator.locks?navigator.locks.request('school-ledger-vault-write',operation):operation();}

  close(){this.channel?.close();this.listeners.clear()}
}

export function provisionalPayment(snapshot:Snapshot,draft:Draft):Tx{return draft.tx}
