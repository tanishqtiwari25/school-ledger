import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {School} from 'lucide-react';
import {login,signup,logout,getUser,handleAuthCallback,acceptInvite,updateUser,requestPasswordRecovery,onAuthChange} from '@netlify/identity';
import FinanceApp from '../app/finance-app';
import '../app/globals.css';
import './signin.css';
import {authMessage} from './auth-message';

function App(){
 const [ready,setReady]=useState(false),[screen,setScreen]=useState('login'),[invite,setInvite]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
 const authPath=location.pathname.includes('signin')||location.pathname.includes('signout');
 useEffect(()=>{void(async()=>{
  try{
   if(location.pathname.includes('signout')){await logout();location.replace('/');return;}
   const callback=await handleAuthCallback();
   if(callback?.type==='invite'&&callback.token){setInvite(callback.token);setScreen('invite');}
   else if(callback?.type==='recovery')setScreen('reset');
   else if(callback?.user){location.replace('/');return;}
   else {const user=await getUser();if(authPath&&user){location.replace('/');return;}}
  }catch(e){setError(authMessage(e));}
  finally{setReady(true);}
 })();const unsubscribe=onAuthChange(event=>{if(event==='logout'&&!location.pathname.includes('signout'))location.replace('/');});return unsubscribe;},[]);
 if(!ready)return <main className="authPage"><p role="status">Loading secure sign-in…</p></main>;
 if(!authPath&&!invite&&screen!=='reset'&&!error)return <FinanceApp/>;
 const passwordScreen=['signup','invite','reset'].includes(screen);
 async function submit(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(saving)return;
  const data=new FormData(event.currentTarget),email=String(data.get('email')||'').trim(),password=String(data.get('password')||'');
  setSaving(true);setError('');setNotice('');
  try{
   if(passwordScreen&&password!==data.get('confirmation'))throw Error('Passwords do not match.');
   if(screen==='recover'){await requestPasswordRecovery(email);setNotice('If your account exists, a password reset link has been sent to your email.');}
   else if(screen==='signup'){await signup(email,password);setNotice('Your account has been created. Open the confirmation email from School Ledger or Netlify, check Spam if needed, then return here to sign in.');setScreen('login');}
   else {if(screen==='invite')await acceptInvite(invite,password);else if(screen==='reset')await updateUser({password});else await login(email,password);location.replace('/');}
  }catch(e){setError(authMessage(e));}
  finally{setSaving(false);}
 }
 return <main className="authPage"><section className="authCard" aria-labelledby="authHeading"><div className="brandIcon"><School size={25} aria-hidden="true"/></div><h1 id="authHeading">{screen==='signup'?'Create your account':screen==='recover'?'Reset your password':passwordScreen?'Choose your password':'Sign in to School Ledger'}</h1><p className="authIntro">{screen==='signup'?'Use the email address your school administrator has approved.':screen==='recover'?'We will send a reset link to your registered email.':'Secure access to your school fees and accounts.'}</p>
 {error&&<p className="authError" role="alert">{error}</p>}{notice&&<p className="authNotice" role="status">{notice}</p>}
 <form onSubmit={submit} aria-busy={saving}>
 {!['invite','reset'].includes(screen)&&<label>Email address<input name="email" type="email" autoComplete="username" required maxLength={254}/></label>}
 {screen!=='recover'&&<label>{passwordScreen?'New password':'Password'}<input name="password" type="password" autoComplete={passwordScreen?'new-password':'current-password'} required minLength={passwordScreen?12:1} maxLength={128} aria-describedby={passwordScreen?'passwordHelp':undefined}/></label>}
 {passwordScreen&&<><p className="authHelp" id="passwordHelp">Use at least 12 characters. A long, unique passphrase works well.</p><label>Confirm password<input name="confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128}/></label></>}
 <button className="primary" disabled={saving}>{saving?'Please wait…':screen==='recover'?'Send reset link':screen==='signup'?'Create account':passwordScreen?'Save password':'Sign in'}</button>
 </form>
 {!passwordScreen&&<div className="authLinks"><button disabled={saving} onClick={()=>{setScreen(screen==='login'?'recover':'login');setError('');setNotice('')}}>{screen==='login'?'Forgot password?':'Back to sign in'}</button>{screen==='login'&&<button disabled={saving} onClick={()=>{setScreen('signup');setError('');setNotice('')}}>Create approved account</button>}</div>}
 {screen==='signup'&&<button className="authBack" disabled={saving} onClick={()=>{setScreen('login');setError('')}}>Back to sign in</button>}
 <a className="authOffline" href="/">Open saved offline records</a></section></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
