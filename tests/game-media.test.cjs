const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto'),{gzipSync}=require('node:zlib');
const root=path.join(__dirname,'..'),directory=path.join(root,'assets/game-media');
const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
assert.equal(manifest.assets.length,91);
const names=new Set();
for(const asset of manifest.assets){
  assert.equal(names.has(asset.file),false);names.add(asset.file);
  const bytes=fs.readFileSync(path.join(directory,asset.file));
  assert.equal(bytes.length,asset.bytes,asset.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,asset.file);
  assert.ok(asset.file.includes(asset.sha256.slice(0,12)),'content-addressed cache key');
}
const pages=[['games/photo-ttang.html',60000,40],['games/matgo.html',280000,48],['games/ojjuda-tour/index.html',50000,3],['games/matgo-art.mjs',2500,48]];
for(const [file,budget,count] of pages){
  const source=fs.readFileSync(path.join(root,file),'utf8');
  assert.ok(gzipSync(source).length<budget,file+' must not embed its media again');
  const refs=[...source.matchAll(/\/assets\/game-media\/([a-z0-9.-]+\.(?:jpg|webp|woff2|min\.js))/g)].map(m=>m[1]);
  assert.equal(refs.length,count,file);
  for(const name of refs)assert.ok(names.has(name),'manifest covers '+name);
}
const photo=fs.readFileSync(path.join(root,'games/photo-ttang.html'),'utf8');
const photos=JSON.parse(photo.match(/const PHOTOS=(\[[^\n]+\]);/)[1]);
assert.equal(photos.length,20);
for(const p of photos){assert.equal(p.w,600);assert.equal(p.h,800);assert.ok(p.sil);}
console.log('PASS: 91 media hashes, complete references, photo metadata and initial payload budgets');
