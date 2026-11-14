import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const args=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');if(i<0)throw Error('Use --name=value arguments');return [s.slice(0,i).replace(/^--/,''),s.slice(i+1)];}));
const need=name=>{if(!args[name])throw Error('Missing --'+name+'=value');return args[name];};
const name=need('name'),account=need('account'),database=need('database'),team=need('team').replace(/\/$/,''),audience=need('audience'),owner=need('admin-email');
if(!/^[a-z0-9][a-z0-9-]{0,61}$/.test(name))throw Error('Invalid Worker name');
if(!/^[a-f0-9]{32}$/.test(account)||!/^[-a-f0-9]{36}$/.test(database))throw Error('Copy the real account and D1 IDs from Cloudflare');
if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(team)||!owner.includes('@')||audience.length<10)throw Error('Use the real Access team URL, application audience and administrator email');
const config=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
// Generated locally; do not change the existing Sites deployment's identity or bindings.
Object.assign(config,{name,account_id:account,main:resolve('dist/server/index.js'),workers_dev:true,preview_urls:false,vars:{AUTH_PROVIDER:'cloudflare-access',ACCESS_TEAM_URL:team,ACCESS_AUD:audience,BOOTSTRAP_ADMIN_EMAIL:owner.toLowerCase()},assets:{directory:resolve('dist/client'),run_worker_first:true},d1_databases:[{binding:'DB',database_name:args['database-name']||'school-ledger',database_id:database,migrations_dir:resolve('drizzle')}]});
await mkdir('.cloudflare',{recursive:true});await writeFile('.cloudflare/wrangler.json',JSON.stringify(config,null,2));
console.log('Configured .cloudflare/wrangler.json. Apply D1 migrations, deploy, and protect the full workers.dev hostname with the matching Cloudflare Access application.');
