const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'shared/games/world-game-assets.js'),'utf8');
const world=fs.readFileSync(path.join(root,'world.html'),'utf8');
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

function fixture({minesLoaded=false}={}){
 const nodes=[],timers=new Map();let clock=0,sequence=0;
 const context=vm.createContext({
  window:minesLoaded?{OjjudaMinesRules:{record(){}}}:{},
  document:{head:{append(node){nodes.push(node);}},createElement(tag){return{tag,removed:false,remove(){this.removed=true;}};}},
  setTimeout(callback,delay){const id=++sequence;timers.set(id,{at:clock+delay,callback});return id;},
  clearTimeout(id){timers.delete(id);}
 });
 vm.runInContext(source,context);
 return{context,api:context.window.OjjudaGameAssets,nodes,timers,
  advance(ms){clock+=ms;for(const[id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.callback();}},
  finish(){for(const node of nodes)if(!node.removed)node.onload();}};
}
const outcome=promise=>promise.then(()=>({ok:true}),error=>({ok:false,error:error.message}));

test('a timed out caller can retry without inserting or executing a second script',async()=>{
 const f=fixture();let firstResult;
 const first=outcome(f.api.load('festival')).then(result=>{firstResult=result;return result;});
 assert.equal(f.nodes.length,2);f.advance(14999);await flush();assert.equal(firstResult,undefined);
 f.advance(1);assert.deepEqual(await first,{ok:false,error:'game_asset_timeout'});
 assert.equal(f.api.ready('festival'),false);assert.ok(f.nodes.every(node=>!node.removed));
 const retry=f.api.load('festival');assert.equal(f.nodes.length,2,'retry shares the original resource requests');
 f.finish();await retry;
 assert.equal(f.api.ready('festival'),true);assert.deepEqual(firstResult,{ok:false,error:'game_asset_timeout'},'late success cannot reopen the timed out entrance');
 assert.equal(f.timers.size,0);
});

test('an actual error after timeout permits replacing only the failed resource',async()=>{
 const f=fixture(),first=outcome(f.api.load('festival'));f.advance(15000);await first;
 const failed=f.nodes[1];f.nodes[0].onload();failed.onerror();await flush();
 assert.equal(failed.removed,true);
 const retry=f.api.load('festival');assert.equal(f.nodes.length,3);
 assert.equal(f.nodes[2].src,failed.src);f.nodes[2].onload();await retry;
 assert.equal(f.api.ready('festival'),true);assert.equal(f.timers.size,0);
});

test('concurrent games share common CSS and ordered scripts',async()=>{
 const f=fixture(),first=f.api.load('mole'),second=f.api.load('runner');
 const urls=f.nodes.map(node=>node.src||node.href);
 assert.equal(urls.length,new Set(urls).size,'shared controls are inserted once');
 assert.equal(urls.filter(url=>url.startsWith('/shared/games/game-controls.')).length,2);
 assert.ok(f.nodes.filter(node=>node.tag==='script').every(node=>node.async===false));
 f.finish();await Promise.all([first,second]);assert.equal(f.timers.size,0);
});

test('preloaded Mines rules are reused, while a failed preload is still retryable',async()=>{
 for(const minesLoaded of [true,false]){
  const f=fixture({minesLoaded}),pending=f.api.load('mines');
  assert.equal(f.nodes.filter(node=>node.src?.includes('/games/mines/rules.js')).length,minesLoaded?0:1);
  f.finish();await pending;assert.equal(f.api.ready('mines'),true);
 }
});

test('the shell reports slow loading and ignores a timeout after leaving or changing accounts',async()=>{
 for(const transition of ['none','tab','place','account','logout']){
  const f=fixture(),messages=[];
  Object.assign(f.context,{D:{online:true,user:{id:'alice'}},g:{tab:'place',place:{id:'arcade'}},
   worldGameEntryGate:()=>true,worldGameAssetRequest:0,M:message=>messages.push(message)});
  const start=world.indexOf('function Al('),end=world.indexOf('// User-requested exits ask first;',start);
  assert.ok(start>=0&&end>start);vm.runInContext(world.slice(start,end),f.context);
  f.context.Al('festival');assert.equal(messages.length,1);
  if(transition==='tab')f.context.g.tab='my';
  if(transition==='place')f.context.g.place={id:'park'};
  if(transition==='account')f.context.D.user={id:'bob'};
  if(transition==='logout'){f.context.D.online=false;f.context.D.user=null;}
  f.advance(15000);await flush();assert.equal(messages.length,transition==='none'?2:1);
  if(transition==='none')assert.match(messages[1],/새로고침/);
  f.finish();await flush();assert.equal(messages.length,transition==='none'?2:1,'late downloads cannot revive an expired entrance');
 }
});

test('a Bang direct link uses the guarded game entrance',()=>{
 const starts=[];let onLoad;
 const context=vm.createContext({entryGame:'bang',window:{addEventListener(type,handler){assert.equal(type,'load');onLoad=handler;}},Al:game=>starts.push(game)});
 const start=world.indexOf("if(entryGame==='bang')"),end=world.indexOf("if(entryGame==='tank')",start);
 assert.ok(start>=0&&end>start);vm.runInContext(world.slice(start,end),context);
 onLoad();assert.deepEqual(starts,['bang']);
});
