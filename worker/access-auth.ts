type AccessConfig={ACCESS_TEAM_URL?:string,ACCESS_AUD?:string,BOOTSTRAP_ADMIN_EMAIL?:string};
type AccessIdentity={email:string,sub:string};
type SigningKey=JsonWebKey&{kid?:string};
const keyCache=new Map<string,{expires:number,keys:SigningKey[]}>();
const decoder=new TextDecoder();
function bytes(value:string){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Malformed token');return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}
export function accessConfiguration(config:AccessConfig){
 const issuer=config.ACCESS_TEAM_URL?.replace(/\/$/,'');
 if(!issuer||!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!config.ACCESS_AUD?.trim()||!config.BOOTSTRAP_ADMIN_EMAIL?.includes('@'))throw Error('Cloudflare Access configuration is incomplete.');
 return {issuer,audience:config.ACCESS_AUD,owner:config.BOOTSTRAP_ADMIN_EMAIL.trim().toLowerCase()};
}
/** Trust verified JWT claims, never caller-supplied identity headers. */
export async function accessIdentity(request:Request,config:AccessConfig,fetchKeys:typeof fetch=fetch):Promise<AccessIdentity|null>{
 const {issuer,audience}=accessConfiguration(config);
 const token=request.headers.get('Cf-Access-Jwt-Assertion');
 if(!token||token.length>16384)return null;
 try{
  const parts=token.split('.');if(parts.length!==3)return null;
  const header=JSON.parse(decoder.decode(bytes(parts[0]))),claims=JSON.parse(decoder.decode(bytes(parts[1])));
  if(header.alg!=='RS256'||typeof header.kid!=='string')return null;
  const now=Date.now()/1000;
  if(claims.iss!==issuer||!(Array.isArray(claims.aud)?claims.aud:[claims.aud]).includes(audience)||typeof claims.exp!=='number'||claims.exp<=now||typeof claims.iat!=='number'||claims.iat>now+30||(claims.nbf!==undefined&&(typeof claims.nbf!=='number'||claims.nbf>now+30))||typeof claims.email!=='string'||!claims.email.includes('@')||typeof claims.sub!=='string'||!claims.sub)return null;
  let cached=keyCache.get(issuer);
  if(!cached||cached.expires<Date.now()||!cached.keys.some(k=>k.kid===header.kid)){
   const response=await fetchKeys(issuer+'/cdn-cgi/access/certs',{redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!response.ok)return null;
   const document=await response.json() as {keys?:SigningKey[]};if(!Array.isArray(document.keys)||document.keys.length>20)return null;
   cached={expires:Date.now()+300000,keys:document.keys};keyCache.set(issuer,cached);
  }
  const jwk=cached.keys.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  if(!jwk)return null;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
  return valid?{email:claims.email.trim().toLowerCase(),sub:claims.sub}:null;
 }catch{return null;}
}

export function withVerifiedIdentity(request:Request,identity:AccessIdentity){
 const headers=new Headers(request.headers);
 for(const name of [...headers.keys()])if(name.startsWith('oai-')||name.startsWith('x-school-auth-'))headers.delete(name);
 headers.set('oai-authenticated-user-id',identity.sub);headers.set('oai-authenticated-user-email',identity.email);
 return new Request(request,{headers});
}
