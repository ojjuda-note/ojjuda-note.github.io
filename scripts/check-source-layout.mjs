import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'docs/source-layout.json'),'utf8'));
const tracked=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const files=new Set(tracked.filter(p=>!Object.hasOwn(catalog.moves,p))),errors=[];
for(const [old,next] of Object.entries(catalog.moves)){
 if(fs.existsSync(path.join(root,old)))errors.push(`Old source remains: ${old}`);
 if(!fs.existsSync(path.join(root,next)))errors.push(`Missing moved source: ${next}`);
}
for(const file of files)if(!file.includes('/')&&/\.(?:js|css)$/.test(file)&&!['config.js','sw.js'].includes(file))errors.push(`Ungrouped root code: ${file}`);
for(const slug of catalog.serverFunctions)if(!['index.ts','index.js'].some(n=>files.has(`supabase/functions/${slug}/${n}`)))errors.push(`Missing server source: ${slug}`);
for(const entry of catalog.publicEntries)if(!files.has(entry))errors.push(`Missing public entry: ${entry}`);
let checked=0;
function check(file,uri,relative){
 const clean=uri.split(/[?#]/)[0];if(!clean||/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(clean)||/[${}<>*\\]/.test(clean))return;
 if(!relative&&!clean.startsWith('/'))return;
 const target=clean.startsWith('/')?clean.slice(1):path.posix.normalize(path.posix.join(path.posix.dirname(file),clean));
 if(!/\.(?:js|mjs|cjs|css|html|json|webmanifest)$/.test(target))return;
 if(target.startsWith('rest/')||target.startsWith('storage/')||target.startsWith('functions/'))return;
 checked++;if(!files.has(target))errors.push(`${file}: missing ${uri} -> ${target}`);
}
for(const file of files){
 if(!/\.(?:js|mjs|css|html)$/.test(file)||/^(?:tests|ops|scripts|supabase|vendor)\//.test(file)||file.includes('/vendor/')||!fs.existsSync(path.join(root,file)))continue;
 const text=fs.readFileSync(path.join(root,file),'utf8');
 if(file.endsWith('.html'))for(const m of text.matchAll(/(?:src|href)\s*=\s*['"]([^'"\n]+)['"]/g))check(file,m[1],true);
 for(const m of text.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\bnew Worker\s*\(\s*)['"]([^'"\n]+)['"]/g))if(m[1].startsWith('/')||m[1].startsWith('.'))check(file,m[1],true);
 for(const m of text.matchAll(/['"](\/(?!\/)[^'"\s]+\.(?:js|mjs|css|html|json)(?:\?[^'"\s]*)?)['"]/g)){if(/\.(?:endsWith|startsWith)\(\s*$/.test(text.slice(Math.max(0,m.index-30),m.index)))continue;check(file,m[1],false);}
}
const unique=[...new Set(errors)];
if(unique.length){console.error(unique.join('\n'));process.exitCode=1;}
else console.log(`Source layout OK: ${Object.keys(catalog.moves).length} moves, ${catalog.serverFunctions.length} server functions, ${checked} local references.`);
