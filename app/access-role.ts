import type {State} from './ledger';
/** The first administrator on a direct deployment is explicitly configured. */
export function accessRole(state:State,email:string,provider?:string,owner?:string){
 const normalized=email.trim().toLowerCase();
 if(state.users.length)return state.users.find(u=>u.email.trim().toLowerCase()===normalized)?.role;
 if((provider==='cloudflare-access'||provider==='netlify-identity')&&(!owner||normalized!==owner.trim().toLowerCase()))return undefined;
 return 'Admin';
}
