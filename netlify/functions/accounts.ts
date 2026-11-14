import {getDatabase} from '@netlify/database';
import {getUser} from '@netlify/identity';
import {PostgresD1} from '../../server/postgres-d1';
import {createLedgerHandlers} from '../../server/ledger-handlers';
import {createBackupHandlers} from '../../server/backups-handlers';

export default async function accounts(request:Request){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 try{
  const user=await getUser();
  // Identity verifies the session on the server. Browser identity headers and
  // client-supplied roles are never consulted.
  if(!user?.email)return Response.json({error:'Sign in to access school accounts.'},{status:401,headers});
  const owner=process.env.BOOTSTRAP_ADMIN_EMAIL;
  if(!owner)return Response.json({error:'School administrator is not configured.'},{status:503,headers});
  const env={DB:new PostgresD1(getDatabase().pool as any) as unknown as D1Database,AUTH_PROVIDER:'netlify-identity',BOOTSTRAP_ADMIN_EMAIL:owner};
  const identity=async()=>({email:user.email!.trim().toLowerCase(),userId:user.id});
  let response:Response;
  const path=new URL(request.url).pathname;
  if(request.method==='OPTIONS')return new Response(null,{status:405,headers});
  if(path==='/api/backups'&&request.method==='GET')response=await createBackupHandlers(env,identity).GET(request);
  else if(path==='/api/ledger'&&request.method==='GET')response=await createLedgerHandlers(env,identity).GET();
  else if(path==='/api/ledger'&&request.method==='POST'){
   if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403,headers});
   if(Number(request.headers.get('content-length')||0)>8_000_000)return Response.json({error:'Request is too large.'},{status:413,headers});
   response=await createLedgerHandlers(env,identity).POST(request);
  }else return Response.json({error:'Not found'},{status:404,headers});
  for(const [key,value] of Object.entries(headers))response.headers.set(key,value);
  return response;
 }catch{
  return Response.json({error:'School accounts are temporarily unavailable. Please try again.'},{status:503,headers});
 }
}
export const config={path:['/api/ledger','/api/backups']};
