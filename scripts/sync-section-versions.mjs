// Embed the release manifests into the shell so its installed versions remain
// known even when the network is offline or a newer manifest is published.
import {readFileSync,writeFileSync} from 'node:fs';
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
