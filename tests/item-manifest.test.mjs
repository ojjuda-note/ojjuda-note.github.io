import test from 'node:test';
import assert from 'node:assert/strict';
import {loadItemManifest,validateItemManifest,catalogFurniture} from '../house-test/item-manifest.js';
const baseline={chair:{file:'chair-v1.runtime.json',revision:'1111111111111111'}};
const updated={chair:{file:'chair-v2.runtime.json',revision:'2222222222222222'}};
const url=new URL('https://fixture.test/item-assets.json');
const manifest=assets=>({schema:1,assets});
const memory=()=>{let saved;return {open:async()=>({put:async(_,response)=>{saved=response.clone();},match:async()=>saved?.clone()})};};
test('metadata refresh uses the same URL and recovers the last valid manifest offline',async()=>{
 const storage=memory();let calls=0;
 const fetcher=async(u,options)=>{assert.equal(u.href,url.href);assert.equal(options.cache,'no-cache');calls++;return Response.json(manifest(calls===1?baseline:updated));};
 assert.deepEqual(await loadItemManifest(url,baseline,{storage,fetcher}),baseline);
 assert.deepEqual(await loadItemManifest(url,baseline,{storage,fetcher}),updated);
 assert.deepEqual(await loadItemManifest(url,baseline,{storage,fetcher:async()=>{throw Error('offline');}}),updated);
 assert.deepEqual(await loadItemManifest(url,baseline,{storage,fetcher:async()=>Response.json({schema:9})}),updated);
});

test('wall items require schema 2 and remain attached catalog items',()=>{
 const asset={file:'wall.runtime.json',revision:'3333333333333333',catalog:{label:'원목 벽선반',shortLabel:'벽선반',width:1.2,depth:.4,height:.12,layer:'surface',wallMounted:true,preview:'assets/wall.png'}};
 const value={schema:2,assets:{...baseline,'item-wall':asset}};
 const checked=validateItemManifest(value,baseline),item=catalogFurniture(checked)['item-wall'];
 assert.equal(item.wallMounted,true);assert.equal(item.autoPlace,false);assert.match(item.clearance,/벽/);
 assert.throws(()=>validateItemManifest({...value,schema:1},baseline));
 for(const change of [{wallMounted:'yes'},{layer:'standing'},{layer:'floor'}]){
  const invalid=structuredClone(value);Object.assign(invalid.assets['item-wall'].catalog,change);assert.throws(()=>validateItemManifest(invalid,baseline));
 }
});

test('new cache retains wall flags without overwriting older clients cached lists',async()=>{
 const saved=new Map([['ojjuda-house-item-manifest-v2',Response.json(manifest(updated))]]);
 const storage={open:async name=>({put:async(_,r)=>saved.set(name,r.clone()),match:async()=>saved.get(name)?.clone()})};
 const offline=async()=>{throw Error('offline');};
 assert.deepEqual(await loadItemManifest(url,baseline,{storage,fetcher:offline}),updated);
 const assets={...updated,'item-wall':{file:'wall.runtime.json',revision:'3333333333333333',catalog:{label:'벽선반',shortLabel:'선반',width:1.2,depth:.4,height:.12,layer:'surface',wallMounted:true,preview:'assets/wall.png'}}};
 const expected=validateItemManifest({schema:2,assets},baseline);
 assert.deepEqual(await loadItemManifest(url,baseline,{storage,fetcher:async()=>Response.json({schema:2,assets})}),expected);
 assert.deepEqual(await loadItemManifest(url,baseline,{storage,fetcher:offline}),expected);
 assert.deepEqual(await saved.get('ojjuda-house-item-manifest-v2').json(),manifest(updated));
 assert.equal((await saved.get('ojjuda-house-item-manifest-v3').json()).schema,2);
});
test('invalid entries cannot replace the valid list or request other paths',()=>{
 for(const assets of [{},{...baseline,unknown:baseline.chair},{chair:{file:'../private.json',revision:'2222222222222222'}},{chair:{file:'https://other.test/x.runtime.json',revision:'2222222222222222'}},{chair:{file:'chair.runtime.json',revision:'bad'}}])assert.throws(()=>validateItemManifest(manifest(assets),baseline));
});
test('unavailable storage and an aborted refresh retain shipped items',async()=>{
 const storage={open:async()=>{throw Error('denied');}};
 const fetcher=async(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout'))));
 assert.deepEqual(await loadItemManifest(url,baseline,{storage,fetcher,timeoutMs:5}),baseline);
 assert.deepEqual(await loadItemManifest(url,baseline,{storage,fetcher:async()=>Response.json(manifest(updated))}),updated);
});

test('hundreds of registered item definitions stay data-only and never auto-place',async()=>{
 const {catalogFurniture}=await import('../house-test/item-manifest.js');
 const assets=structuredClone(baseline),definition={label:'등록 테이블',shortLabel:'등록 테이블',width:2,depth:1,height:.6,layer:'standing',preview:'assets/table-preview.png'};
 for(let i=0;i<500;i++)assets['item-table-'+i]={file:'table.runtime.json',revision:'2222222222222222',catalog:{...definition,order:i}};
 const checked=validateItemManifest(manifest(assets),baseline),items=catalogFurniture(checked);
 assert.equal(Object.keys(items).length,500);
 for(const item of Object.values(items)){assert.equal(item.autoPlace,false);assert.equal(item.picture,'made');assert.deepEqual(item.directions,['left','center','right']);}
 for(const change of [{width:0},{height:5},{layer:'script'},{preview:'https://other.test/a.png'},{preview:'assets/../a.png'},{label:''},{order:-1},{hidden:'yes'}]){
  const bad=structuredClone(assets);Object.assign(bad['item-table-0'].catalog,change);assert.throws(()=>validateItemManifest(manifest(bad),baseline));
 }
 const bad={...baseline,'made-123':assets['item-table-0']};assert.throws(()=>validateItemManifest(manifest(bad),baseline),'private item IDs cannot be registered as public');
});
