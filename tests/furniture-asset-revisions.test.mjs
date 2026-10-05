import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const {assets:builtInAssets}=JSON.parse(fs.readFileSync(new URL('../house-test/item-assets.json',import.meta.url)));
for(const [id,asset]of Object.entries(builtInAssets)){
 const bytes=fs.readFileSync(new URL('../house-test/assets/'+asset.file,import.meta.url));
 assert.equal(asset.revision,createHash('sha256').update(bytes).digest('hex').slice(0,16),id+': artwork changed without a matching cache revision');
}
console.log('Furniture asset revisions PASS: '+Object.keys(builtInAssets).length+' files');
