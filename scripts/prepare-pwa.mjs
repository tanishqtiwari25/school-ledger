import {readFile,writeFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=join(process.cwd(),process.argv[2]||'dist/client');
async function files(dir,prefix=''){let all=[];for(const f of await readdir(dir,{withFileTypes:true})){const p=prefix+'/'+f.name;if(f.isDirectory())all.push(...await files(join(dir,f.name),p));else if(/\.(js|css|woff2?|png|svg|webmanifest)$/.test(f.name)&&f.name!=='sw.js')all.push(p)}return all}
const assets=(await files(root)).sort();
let sw=await readFile('public/sw.js','utf8');
// A content-derived version also changes when application chunks or SW behavior changes.
const hash=createHash('sha256').update(sw);for(const asset of assets)hash.update(asset).update(await readFile(join(root,asset)));const version=hash.digest('hex').slice(0,14);
sw=sw.replace("school-ledger-shell-v1",'school-ledger-shell-'+version).replace(/\/\* ASSET_LIST \*\/ \[[^;]+\]/,JSON.stringify(assets));
await writeFile(join(root,'sw.js'),sw);console.log(`PWA shell ${version}: ${assets.length} precached assets`);
