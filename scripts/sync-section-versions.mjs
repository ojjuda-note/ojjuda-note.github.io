// Embed the release manifests into the shell so its installed versions remain
// known even when the network is offline or a newer manifest is published.
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=process.argv[2]||fileURLToPath(new URL('../',import.meta.url));
const page=resolve(root,'world.html');
const source=readFileSync(page,'utf8');
let html=source;
for(const [path,field] of [
  ['version.json',/(var Go=")[^"]+(")/],
  ['features/arcade/version.json',/(arcade:\{name:'오락실',version:')[^']+(')/],
  ['park/version.json',/(park:\{name:'공원',version:')[^']+(')/]
]){
  const {version}=JSON.parse(readFileSync(resolve(root,path),'utf8'));
  if(typeof version!=='string'||!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[\da-z-]+(?:\.[\da-z-]+)*)?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/i.test(version))throw Error('Invalid release version in '+path);
  if(!field.test(html))throw Error('Missing installed version for '+path);
  html=html.replace(field,(_,before,after)=>before+version+after);
}
if(html!==source)writeFileSync(page,html);

// Both withdrawal screens must load the same cleanup rules for private photo uploads.
if (process.argv[2] && existsSync(resolve(root,'features/account/account-deletion.js'))) {
  const tag=createHash('sha256').update(readFileSync(resolve(root,'features/account/account-deletion.js'))).digest('hex').slice(0,12);
  for(const path of ['world.html','park/index.html']) {
    const file=resolve(root,path);
    const source=readFileSync(file,'utf8');
    const updated=source.replace(/(\/features\/account\/account-deletion\.js\?v=)[^"]+/g,(_,prefix)=>prefix+tag);
    if(updated!==source)writeFileSync(file,updated);
  }
}
