export type SessionStatus='authenticated'|'anonymous'|'unavailable';
/** A browser SDK session is not enough: the server must accept its cookie. */
export async function serverSession(request:typeof fetch=fetch):Promise<SessionStatus>{
 try{
  const response=await request('/api/auth/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(response.status===401)return 'anonymous';
  if(!response.ok)return 'unavailable';
  const data=await response.json();
  return data!==null&&typeof data==='object'&&'authenticated' in data&&data.authenticated===true?'authenticated':'unavailable';
 }catch{return 'unavailable';}
}
