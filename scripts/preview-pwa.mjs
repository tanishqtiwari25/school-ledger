/** Local-only production PWA preview. Never imported by or deployed with the Worker. */
import http from 'node:http';
import {randomUUID} from 'node:crypto';
const port=Number(process.env.PWA_PREVIEW_PORT||5189),upstream='http://127.0.0.1:5190',session=randomUUID();
const server=http.createServer(async(req,res)=>{
 const host=req.headers.host;if(host!==`127.0.0.1:${port}`&&host!==`localhost:${port}`){res.writeHead(403);return res.end('Loopback preview only')}
 if(req.headers.origin&&req.headers.origin!==`http://${host}`){res.writeHead(403);return res.end('Invalid local origin')}
 if(req.url.startsWith('/signin-with-chatgpt')){res.writeHead(303,{'Set-Cookie':`school_preview=${session}; HttpOnly; SameSite=Strict; Path=/`,'Location':'/'});return res.end()}
 if(req.url.startsWith('/signout-with-chatgpt')){res.writeHead(303,{'Set-Cookie':'school_preview=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/','Location':'/'});return res.end()}
 const headers=new Headers();for(const [name,value]of Object.entries(req.headers)){if(value&&!['host','connection','content-length','transfer-encoding','accept-encoding'].includes(name)&&!name.startsWith('oai-'))headers.set(name,Array.isArray(value)?value.join(','):value)}
 if(headers.has('origin'))headers.set('origin',upstream);
 if(req.headers.cookie?.split(';').some(c=>c.trim()===`school_preview=${session}`)){
   headers.set('oai-authenticated-user-id','local_seedy');headers.set('oai-authenticated-user-email','seedy@sites.test');
 }
 try{const chunks=[];for await(const c of req)chunks.push(c);const body=Buffer.concat(chunks);const result=await fetch(upstream+req.url,{method:req.method,headers,body:['GET','HEAD'].includes(req.method)?undefined:body,redirect:'manual'});const out={};result.headers.forEach((v,k)=>{if(!['transfer-encoding','content-encoding','content-length','connection'].includes(k))out[k]=v});if(req.url==='/sw.js')out['Cache-Control']='no-cache';res.writeHead(result.status,out);res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(503,{'Content-Type':'text/plain'});res.end('Start the local production Worker on port 5190, then retry.')}
});
server.listen(port,'127.0.0.1',()=>console.log(`PWA preview: http://127.0.0.1:${port}/ (loopback-only simulated sign-in; no hosted credentials)`));
