'use client';
import {useEffect,useState} from 'react';
import {Download,RefreshCw} from 'lucide-react';
type InstallPrompt=Event&{prompt:()=>Promise<void>,userChoice:Promise<{outcome:string}>};
export default function PwaControls({pending}:{pending:number}){
 const [prompt,setPrompt]=useState<InstallPrompt|null>(null),[registration,setRegistration]=useState<ServiceWorkerRegistration|null>(null),[update,setUpdate]=useState(false),[message,setMessage]=useState(''),[installed,setInstalled]=useState(false),[help,setHelp]=useState(false);
 useEffect(()=>{
   setInstalled(window.matchMedia('(display-mode: standalone)').matches||(navigator as any).standalone===true);
   const before=(e:Event)=>{e.preventDefault();setPrompt(e as InstallPrompt)},done=()=>{setPrompt(null);setInstalled(true);setMessage('School Ledger is installed on this device.')};
   window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',done);
   if('serviceWorker' in navigator&&process.env.NODE_ENV==='production'){
     navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(reg=>{setRegistration(reg);if(reg.waiting)setUpdate(true);reg.addEventListener('updatefound',()=>{reg.installing?.addEventListener('statechange',()=>{if(reg.waiting&&navigator.serviceWorker.controller)setUpdate(true)})});navigator.serviceWorker.ready.then(()=>{setMessage('Offline app pages are ready on this device.');navigator.serviceWorker.controller?.postMessage({type:'CACHE_SHELL'})});}).catch(()=>setMessage('Offline page caching is unavailable. Check site storage permissions and reconnect.'));
   }
   return()=>{window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',done)};
 },[]);
 return <div className="pwaControls">{!installed&&<button onClick={async()=>{if(prompt){await prompt.prompt();await prompt.userChoice;setPrompt(null)}else setHelp(!help)}}><Download size={15}/>Install app</button>}{update&&<button disabled={pending>0} title={pending?'Sync pending entries before updating':''} onClick={()=>{const worker=registration?.waiting;if(!worker)return;navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});worker.postMessage({type:'ACTIVATE_UPDATE'})}}><RefreshCw size={15}/>Update available{pending?' · sync entries first':''}</button>}{help&&<div className="installHelp"><strong>Install School Ledger</strong><p>Android / desktop: open your browser menu and choose “Install app”. iPhone / iPad: open this site in Safari, tap Share, then “Add to Home Screen”.</p><p>Open the app online once and enable Offline & sync before using it without a connection.</p></div>}{message&&<p role="status">{message}</p>}</div>;
}
