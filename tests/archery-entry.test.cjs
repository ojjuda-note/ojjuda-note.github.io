const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const world=read('world.html'),bridge=read('games/forest-archer/world-archery-game.js');

// Exercise the real bridge's event handlers, including stale account loads and
// reopening. An unloaded iframe must not keep a second game running behind it.
function fixture(){
 const nodes=[],classes=new Set();let focused=null;
 class Element extends EventTarget{
  constructor(tag){super();this.tagName=tag;this.isConnected=false;this.open=false;this.attributes={};if(tag==='iframe')this.contentWindow={postMessage(){}};}
  setAttribute(name,value){this.attributes[name]=value;}
  set innerHTML(html){this.html=html;if(this.tagName==='dialog'){
   this.button=new Element('button');this.trialButton=new Element('button');this.trialButton.hidden=true;this.frame=new Element('iframe');
   this.frame.src=html.match(/<iframe[^>]*src="([^"]+)"/)[1];
  }}
  querySelector(selector){return selector==='iframe'?this.frame:selector==='button'?this.button:selector==='[data-archery-trial-toggle]'?this.trialButton:null;}
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
assert.equal(ctx._r.archery.name,'바람의 궁수');assert.equal(ctx._r.archery.test,undefined);assert.equal(ctx._r.archery.rankingBasis,'stage_score');
const solo=Object.entries(ctx._r).filter(([id,game])=>!['bang','ttang'].includes(id)&&!(game.age>=19)&&!game.test);
assert.ok(solo.some(([id])=>id==='archery'));assert.ok(fs.existsSync(path.join(root,'assets/design/games/archery.svg')));
ctx.g.place={id:'arcade'};ctx.Pt={arcade:{chat:true,arcade:true}};
ctx.worldArcadeAdultMarkup=()=>'';ctx.worldPlacePresenceText=()=>'';
vm.runInContext(world.slice(world.indexOf('function Df(){'),world.indexOf('function eo(){')),ctx);
const arcadeMarkup=ctx.Df();
const gameButton=id=>{
 const match=arcadeMarkup.match(new RegExp('<button\\b[^>]*data-v="'+id+'"[^>]*>([\\s\\S]*?)</button>'));
 assert.ok(match,'the production catalog renders '+id);return match[1];
};
assert.doesNotMatch(gameButton('archery'),/game-test-badge/,'released archery has no trial badge');
assert.equal(ctx._r.star,undefined,'the retired Star helper stays out of the production catalog');
assert.doesNotMatch(gameButton('festival'),/game-test-badge/,'daily festival information does not show a redundant category badge');
let launchOptions;
ctx.window.OjjudaArcheryGame={open:options=>{launchOptions=options;}};
vm.runInContext(world.slice(world.indexOf('function Al('),world.indexOf('// User-requested exits ask first;',world.indexOf('function Al('))),ctx);
ctx.Al('archery');assert.deepEqual(Object.keys(launchOptions).sort(),['owner','authorized','onAmmoStatus','onRoundStart','onRoundComplete','onAmmoSpend','onAmmoBuy','onCoachBuy','onAmmoReceipt','onCoinExchange','onCoinReceipt'].sort(),'event ammo and ranked completion use explicit parent callbacks');
assert.equal(launchOptions.owner,null);assert.ok(!('client' in launchOptions),'the authenticated client stays in the arcade');
assert.equal(launchOptions.authorized(),true);ctx.D.online=true;ctx.D.user={id:'other'};assert.equal(launchOptions.authorized(),false);
const rankStart=world.indexOf('function worldRankGames(');
vm.runInContext(world.slice(rankStart,world.indexOf('function openWorldBoardGame(',rankStart)),ctx);
ctx.D.online=false;assert.equal(ctx.worldRankGames().archery,ctx._r.archery,'released archery appears in production rankings');
assert.match(world,/for\(const bridge of \[window\.OjjudaArcheryGame,/,'global teardown closes the new game');
assert.ok(!world.includes("if(entryGame==='archery')Al('archery');"),'direct entry must wait for account and arcade initialization');
assert.ok(world.includes('.tour-game-dialog[open]') && world.includes("gameDialog.dispatchEvent(new Event('cancel'"),'browser and app back use the tested dialog cancel handler');

vm.runInContext(read('shared/games/world-game-assets.js'),ctx);
const archeryVersion=ctx.window.OjjudaGameAssets.version('archery').split('.').map(Number);
assert.ok(archeryVersion[0]>3 || archeryVersion[0]===3 && (archeryVersion[1]>2 || archeryVersion[1]===2 && archeryVersion[2]>=2),
 'the released archer keeps its independently versioned 3.2.2-or-newer game');
assert.equal(ctx.window.OjjudaGameAssets.ready('archery'),false,'the bridge is loaded on demand');
const revision=JSON.parse(read('game-release.json')).revision;
assert.equal(ctx.window.OjjudaGameAssets.revision,revision);
assert.ok(world.includes('/shared/games/world-game-assets.js?v='+revision));
// A bridge-only change does not reload unchanged game and ammo modules.
const bridgeRevision=read('shared/games/world-game-assets.js').match(/\/world-archery-game\.js\?v=([^'"\s]+)/)?.[1];
assert.ok(bridgeRevision,'the archery bridge has its own cache revision');
const releaseFixture=fixture();releaseFixture.api.open();
const archeryRevision=new URL(releaseFixture.nodes.at(-1).frame.src,'https://ojjuda.kr').searchParams.get('v');
releaseFixture.api.close();
assert.ok(archeryRevision,'the iframe has its independent game revision');
const game=read('games/forest-archer/game.mjs'),coach=read('games/forest-archer/coach.mjs');
assert.equal(read('games/forest-archer/index.html').match(/src="game\.mjs\?v=([^"]+)"/)?.[1],archeryRevision);
// Refresh main gun play and its record-only bridge while retaining unchanged
// camera and anatomy modules. Every consumer must share its dependency's URL.
const moduleRevision=game.match(/from '\.\/engine\.mjs\?v=([^']+)'/)?.[1];
assert.equal(moduleRevision,'20261106-archery-distance1','every consumer loads the distance-ordered catalog');
assert.equal(game.match(/from '\.\/laser\.mjs\?v=([^']+)'/)?.[1],moduleRevision,'the laser sight uses the current engine release');
assert.equal(read('games/forest-archer/laser.mjs').match(/from '\.\/engine\.mjs\?v=([^']+)'/)?.[1],moduleRevision);
assert.equal(game.match(/from '\.\/coach\.mjs\?v=([^']+)'/)?.[1],moduleRevision,'the unchanged gun coach keeps its ballistics release');
assert.equal(coach.match(/from '\.\/engine\.mjs\?v=([^']+)'/)?.[1],moduleRevision,'the coach must use the same physics as actual shots');
const anatomyRevision=read('games/forest-archer/engine.mjs').match(/from '\.\/animal-zones\.mjs\?v=([^']+)'/)?.[1];
assert.ok(anatomyRevision);
assert.equal(read('games/forest-archer/scenery.mjs').match(/from '\.\/animal-zones\.mjs\?v=([^']+)'/)?.[1],anatomyRevision,'painted anatomy and collision shapes load the same release');
assert.equal(game.match(/from '\.\/scenery\.mjs\?v=([^']+)'/)?.[1],'20261104-archery-bullet-penetration1','unchanged wall colors retain their cache revision');
assert.equal(game.match(/from '\.\/ammo-client\.mjs\?v=([^']+)'/)?.[1],'20261104-archery-reset5','the client disables retired ammo purchases and keeps record recovery');
assert.equal(read('games/forest-archer/index.html').match(/href="style\.css\?v=([^"]+)"/)?.[1],'20261108-monthly-personal1','the entrance uses the updated monthly ranking link styles');

const cameraRevision=game.match(/from '\.\/view\.mjs\?v=([^']+)'/)?.[1];
assert.equal(cameraRevision,'20261104-archery-eagle-dive1','the unchanged camera keeps its cache revision');
assert.equal(game.match(/from '\.\/cinematic\.mjs\?v=([^']+)'/)?.[1],cameraRevision,'the replay receives the same camera release');
assert.equal(read('games/forest-archer/cinematic.mjs').match(/from '\.\/view\.mjs\?v=([^']+)'/)?.[1],cameraRevision,'ordinary and ten-point views share the same camera module');
assert.ok(game.includes('./bullet-cinematic.mjs?v=20261104-archery-bullet-penetration1'),'the replay records the exact wall entry and speed change');
assert.ok(game.includes('./bullet-effects.mjs?v=20261104-archery-bullet-cinematic1'),'unchanged bullet art retains its cache revision');
assert.equal(read('games/forest-archer/bullet-cinematic.mjs').match(/from '\.\/view\.mjs\?v=([^']+)'/)?.[1],cameraRevision,'the bullet view uses the unchanged camera math');

// A cold direct link must load against the initialized arcade route. Starting
// before my() changes g.tab/place causes Al() to discard its own pending load.
(async()=>{
 const rpcCalls=[],savedEvents=[];
 ctx.window.OjjudaGameAssets={ready:()=>true};
 ctx.D.online=true;ctx.D.user={id:'member'};
 ctx.worldRewardRequest=()=>({owner:ctx.D.user?.id});
 ctx.vl=async(rpc,args,request)=>{rpcCalls.push({rpc,args,request});return {ok:true,stage:17};};
 ctx.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
 ctx.window.dispatchEvent=event=>savedEvents.push(event);
 ctx.Al('archery');const memberOptions=launchOptions;
 await memberOptions.onAmmoStatus();
 await memberOptions.onRoundStart('start-request',17);
 await memberOptions.onRoundComplete('finish-request','run',17,45);
 await memberOptions.onAmmoReceipt('finish-request','round-complete');
 assert.deepEqual(JSON.parse(JSON.stringify(rpcCalls.map(({rpc,args})=>({rpc,args})))),[
  {rpc:'archery_single_action',args:{p_action:'status',p_epoch:5}},
  {rpc:'archery_single_action',args:{p_action:'round-start',p_epoch:5,p_request_id:'start-request',p_stage:17}},
  {rpc:'archery_single_action',args:{p_action:'round-complete',p_epoch:5,p_request_id:'finish-request',p_run_id:'run',p_stage:17,p_score:45}},
  {rpc:'archery_single_receipt',args:{p_epoch:5,p_request_id:'finish-request',p_action:'round-complete'}}
 ],'released callbacks use the epoch-bound API and include the exact stage score');
 assert.equal(savedEvents.length,2,'new and recovered completed rounds refresh the rankings');
 assert.ok(savedEvents.every(event=>event.type==='ojjuda:game-record-saved'&&event.detail.game==='archery'&&event.detail.owner==='member'));
 ctx.D.user={id:'other'};
 assert.equal((await memberOptions.onRoundComplete('stale','run',17,50)).reason,'sign_in');
 assert.equal(rpcCalls.length,4,'old account callbacks cannot submit another score');
 ctx.D.online=false;
 let assetsReady=false,completeLoad,opened=0,rendered=0;
 const boot=vm.createContext({URL,Promise,console,
  window:{OjjudaGameAssets:{ready:()=>assetsReady,load:()=>new Promise(resolve=>{completeLoad=()=>{assetsReady=true;resolve();};})},
   OjjudaArcheryGame:{open:()=>{opened++;assert.equal(boot.g.tab,'place');assert.equal(boot.g.place.id,'arcade');}}},
  location:{href:'https://ojjuda.kr/world.html?game=archery'},D:{online:false},g:{tab:'arcade',place:null},
  worldGameAssetRequest:0,worldEntryRouted:false,worldGameEntryGate:()=>true,M:()=>{},
  py:()=>{},H:()=>{rendered++;},sr:{tab:({tab})=>{boot.g.tab='place';boot.g.place={id:tab};}},
  worldParkNotes:null,resolveWorldProfilePhoto:()=>{},m1:()=>{},x1:()=>Promise.resolve(),bm:true});
 const start=world.indexOf('function openWorldGameLink(');
 vm.runInContext(world.slice(start,world.indexOf('// Member rooms use their own account;',start)),boot);
 vm.runInContext(world.slice(world.indexOf('function Al('),world.indexOf('// User-requested exits ask first;',world.indexOf('function Al('))),boot);
 boot.my();
 assert.equal(typeof completeLoad,'function','initialized direct entry starts the asset load');
 assert.equal(opened,0);completeLoad();await Promise.resolve();await Promise.resolve();
 assert.equal(opened,1,'a cold direct link survives the route guards and opens once');
 boot.my();assert.equal(opened,1,'ordinary shell refresh does not reopen a dismissed direct-link game');
 assert.equal(rendered,1);
 console.log('PASS: single-player released registration, same-origin launch, isolated ammo callbacks, ranked completion hooks, lifecycle cleanup, game-only revision and initialized cold direct entry');
})().catch(error=>{console.error(error);process.exitCode=1;});
