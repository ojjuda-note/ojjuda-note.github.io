const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const world=read('world.html'),bridge=read('world-archery-game.js');

// Exercise the real bridge's event handlers, including stale account loads and
// reopening. An unloaded iframe must not keep a second game running behind it.
function fixture(){
 const nodes=[],classes=new Set();let focused=null;
 class Element extends EventTarget{
  constructor(tag){super();this.tagName=tag;this.isConnected=false;this.open=false;this.attributes={};if(tag==='iframe')this.contentWindow={postMessage(){}};}
  setAttribute(name,value){this.attributes[name]=value;}
  set innerHTML(html){this.html=html;if(this.tagName==='dialog'){
   this.button=new Element('button');this.frame=new Element('iframe');
   this.frame.src=html.match(/<iframe[^>]*src="([^"]+)"/)[1];
  }}
  querySelector(selector){return selector==='iframe'?this.frame:selector==='button'?this.button:null;}
  showModal(){this.open=true;}
  close(){this.open=false;}
  remove(){this.isConnected=false;}
  focus(){focused=this;}
  click(){this.dispatchEvent(new Event('click'));}
 }
 const previous=new Element('button');previous.isConnected=true;previous.focus();
 const document={activeElement:previous,createElement:tag=>new Element(tag),
  body:{classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)},
   append:node=>{node.isConnected=true;nodes.push(node);}}};
 const listeners=new Map(),window={addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener(type,fn){listeners.get(type)?.delete(fn);}};
 const c=vm.createContext({window,document,location:{origin:'https://ojjuda.kr'},crypto:{randomUUID},setTimeout,clearTimeout});vm.runInContext(bridge,c);
 return{api:c.window.OjjudaArcheryGame,document,nodes,previous,focused:()=>focused};
}
const f=fixture();
f.api.open({authorized:()=>false});assert.equal(f.nodes.length,0,'blocked sessions cannot open the game');
f.api.open();const first=f.nodes[0];
assert.equal(first.open,true);assert.equal(f.document.body.classList.contains('gaming'),true);
assert.match(first.frame.src,/^\/games\/forest-archer\/index\.html\?v=/,'the game uses the arcade origin');
assert.equal(f.focused(),first.button,'the return control receives initial focus');
f.api.open();assert.equal(f.nodes.length,1,'a duplicate open does not mount a second game');
first.button.click();assert.equal(first.open,false);assert.equal(first.isConnected,false);
assert.equal(first.frame.src,'about:blank','close unloads animation, audio and input');
assert.equal(f.document.body.classList.contains('gaming'),false);assert.equal(f.focused(),f.previous);
f.api.close();assert.equal(f.nodes.length,1,'repeated close is harmless');
f.api.open();const second=f.nodes[1];assert.notEqual(second,first,'re-entry mounts a fresh document');
const cancel=new Event('cancel',{cancelable:true});second.dispatchEvent(cancel);
assert.equal(cancel.defaultPrevented,true);assert.equal(second.isConnected,false,'Escape closes through the same cleanup');
let authorized=true;f.api.open({authorized:()=>authorized});const stale=f.nodes[2];
authorized=false;stale.frame.dispatchEvent(new Event('load'));
assert.equal(stale.isConnected,false,'an old account cannot finish opening a game');
f.document.body.classList.add('gaming');f.api.open();f.api.close();
assert.equal(f.document.body.classList.contains('gaming'),true,'unrelated game state is not removed');

// Evaluate the actual registry, launch branch and rankings, without starting
// other games or connecting their score/wallet clients.
const registrySource=world.slice(world.indexOf('var _r='),world.indexOf(',Z=360',world.indexOf('var _r=')));
const ctx=vm.createContext({window:{},D:{online:false},g:{tab:'arcade'},worldGameEntryGate:()=>true,M:()=>{}});
vm.runInContext(registrySource,ctx);
assert.equal(ctx._r.archery.name,'바람의 궁수');assert.equal(ctx._r.archery.test,true);
const solo=Object.entries(ctx._r).filter(([id,game])=>!['bang','ttang'].includes(id)&&!(game.age>=19));
assert.ok(solo.some(([id])=>id==='archery'));assert.ok(fs.existsSync(path.join(root,'assets/design/games/archery.svg')));
assert.match(world,/<small class="game-test-badge">테스트게임<\/small>/);
let opened;
ctx.window.OjjudaArcheryGame={open:options=>{opened=options;}};
vm.runInContext(world.slice(world.indexOf('function Al('),world.indexOf('// User-requested exits ask first;',world.indexOf('function Al('))),ctx);
ctx.Al('archery');assert.deepEqual(Object.keys(opened).sort(),['owner','authorized','onAmmoStatus','onRoundStart','onRoundComplete','onAmmoSpend','onAmmoBuy','onCoachBuy','onAmmoReceipt'].sort(),'event ammo and coach rental use explicit parent callbacks without adding ranked score hooks');
assert.equal(opened.owner,null);assert.ok(!('client' in opened),'the authenticated client stays in the arcade');
assert.equal(opened.authorized(),true);ctx.D.online=true;ctx.D.user={id:'other'};assert.equal(opened.authorized(),false);
const rankStart=world.indexOf('function worldRankGames(');
vm.runInContext(world.slice(rankStart,world.indexOf('function openWorldBoardGame(',rankStart)),ctx);
ctx.D.online=false;assert.equal(ctx.worldRankGames().archery,undefined,'test scores are absent from production rankings');
assert.match(world,/for\(const bridge of \[window\.OjjudaArcheryGame,/,'global teardown closes the new game');
assert.ok(!world.includes("if(entryGame==='archery')Al('archery');"),'direct entry must wait for account and arcade initialization');
assert.ok(world.includes('.tour-game-dialog[open]>.tour-game-header button'),'browser and app back use the existing dialog return control');

vm.runInContext(read('world-game-assets.js'),ctx);
assert.equal(ctx.window.OjjudaGameAssets.version('archery'),'1.9.1');
assert.equal(ctx.window.OjjudaGameAssets.ready('archery'),false,'the bridge is loaded on demand');
const revision=JSON.parse(read('game-release.json')).revision;
assert.equal(ctx.window.OjjudaGameAssets.revision,revision);
assert.ok(world.includes('/world-game-assets.js?v='+revision));
// Another game may advance the shared release without changing archery assets.
const archeryRevision=read('world-game-assets.js').match(/\/world-archery-game\.js\?v=([^'"\s]+)/)?.[1];
assert.ok(archeryRevision,'the archery bridge has its own cache revision');
assert.equal(bridge.match(/src="\/games\/forest-archer\/index\.html\?v=([^"]+)"/)?.[1],archeryRevision);

// A cold direct link must load against the initialized arcade route. Starting
// before my() changes g.tab/place causes Al() to discard its own pending load.
(async()=>{
 let assetsReady=false,completeLoad,opened=0,rendered=0;
 const boot=vm.createContext({URL,Promise,console,
  window:{OjjudaGameAssets:{ready:()=>assetsReady,load:()=>new Promise(resolve=>{completeLoad=()=>{assetsReady=true;resolve();};})},
   OjjudaArcheryGame:{open:()=>{opened++;assert.equal(boot.g.tab,'place');assert.equal(boot.g.place.id,'arcade');}}},
  location:{href:'https://ojjuda.kr/world.html?game=archery'},D:{online:false},g:{tab:'arcade',place:null},
  worldGameAssetRequest:0,worldEntryRouted:false,worldGameEntryGate:()=>true,M:()=>{},
  py:()=>{},H:()=>{rendered++;},sr:{tab:({tab})=>{boot.g.tab='place';boot.g.place={id:tab};}},
  worldParkNotes:null,resolveWorldProfilePhoto:()=>{},m1:()=>{},x1:()=>Promise.resolve(),bm:true});
 const start=world.indexOf('function my(){');
 vm.runInContext(world.slice(start,world.indexOf('// Member rooms use their own account;',start)),boot);
 vm.runInContext(world.slice(world.indexOf('function Al('),world.indexOf('// User-requested exits ask first;',world.indexOf('function Al('))),boot);
 boot.my();
 assert.equal(typeof completeLoad,'function','initialized direct entry starts the asset load');
 assert.equal(opened,0);completeLoad();await Promise.resolve();await Promise.resolve();
 assert.equal(opened,1,'a cold direct link survives the route guards and opens once');
 boot.my();assert.equal(opened,1,'ordinary shell refresh does not reopen a dismissed direct-link game');
 assert.equal(rendered,1);
 console.log('PASS: single-player test registration, same-origin launch, isolated ammo callbacks, no ranked score hooks, lifecycle cleanup, game-only revision and initialized cold direct entry');
})().catch(error=>{console.error(error);process.exitCode=1;});
