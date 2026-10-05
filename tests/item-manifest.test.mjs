import test from 'node:test';
import assert from 'node:assert/strict';
import {loadItemManifest,validateItemManifest} from '../house-test/item-manifest.js';
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
test('invalid entries cannot replace the valid list or request other paths',()=>{
 for(const assets of [{},{...baseline,unknown:baseline.chair},{chair:{file:'../private.json',revision:'2222222222222222'}},{chair:{file:'https://other.test/x.runtime.json',revision:'2222222222222222'}},{chair:{file:'chair.runtime.json',revision:'bad'}}])assert.throws(()=>validateItemManifest(manifest(assets),baseline));
});
test('unavailable storage and an aborted refresh retain shipped items',async()=>{
 const storage={open:async()=>{throw Error('denied');}};
 const fetcher=async(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('timeout'))));
 assert.deepEqual(await loadItemManifest(url,baseline,{storage,fetcher,timeoutMs:5}),baseline);
 assert.deepEqual(await loadItemManifest(url,baseline,{storage,fetcher:async()=>Response.json(manifest(updated))}),updated);
});
