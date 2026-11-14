import {accessRole} from '../app/access-role';


export function createBackupHandlers(env: {DB:D1Database;AUTH_PROVIDER?:string;BOOTSTRAP_ADMIN_EMAIL?:string},getChatGPTUser:()=>Promise<{email:string;userId:string}|null>){
async function GET(req:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in required'},{status:401});
 const row=await env.DB!.prepare('SELECT data FROM ledger WHERE id=?').bind('school').first<{data:string}>();
 if(!row)return Response.json({backups:[]});
 const state=JSON.parse(row.data);const role=accessRole(state,user.email,env.AUTH_PROVIDER,env.BOOTSTRAP_ADMIN_EMAIL);
 if(role!=='Admin')return Response.json({error:'Only Admin can access recovery points.'},{status:403});
 const id=new URL(req.url).searchParams.get('id');
 if(id){const backup=await env.DB!.prepare('SELECT data FROM backups WHERE id=?').bind(id).first<{data:string}>();if(!backup)return Response.json({error:'Backup not found'},{status:404});return new Response(backup.data,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Content-Disposition':'attachment; filename="school-recovery.json"'}});}
 const rows=await env.DB!.prepare('SELECT id,version,created,reason FROM backups ORDER BY version DESC LIMIT 100').all();
 return Response.json({backups:rows.results},{headers:{'Cache-Control':'no-store'}});
}

return {GET};
}
