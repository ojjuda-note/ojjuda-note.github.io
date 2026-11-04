const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const world=read('world.html'),bridge=read('world-festival-schedule.js'),assets=read('world-game-assets.js');
function section(start,end){
 const from=world.indexOf(start),to=world.indexOf(end,from);
 assert.ok(from>=0&&to>from,'the tested production section exists: '+start);
 return world.slice(from,to);
}
const launch=section('function Al(','// User-requested exits ask first;');
const route=section('function openWorldGameLink(','// Member rooms use their own account;');
const teardown=section('function El(){',"window.addEventListener('pagehide'");

// Exercise the real rendered catalog, so registration cannot accidentally add
// another copy to ordinary games or expose the release number on the card.
const catalog=vm.createContext({window:{},D:{online:false},g:{place:{id:'arcade'}},
 Pt:{arcade:{chat:true,arcade:true}},worldArcadeAdultMarkup:()=>'',worldPlacePresenceText:()=>''});
vm.runInContext(section('var _r=',',Z=360'),catalog);
vm.runInContext(section('function Df(){','function eo(){'),catalog);
vm.runInContext(section('function worldRankGames(','function openWorldBoardGame('),catalog);
assert.equal(catalog._r.festival.name,'축제일정');assert.equal(catalog._r.festival.test,true);
const markup=catalog.Df(),grids=[...markup.matchAll(/data-arcade-games="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)];
assert.equal(grids.at(-1)[1],'test','the test section remains after regular games');
assert.equal((markup.match(/data-v="festival"/g)||[]).length,1,'festival has exactly one entry');
assert.match(grids.at(-1)[2],/data-v="festival"/);
assert.ok(grids.slice(0,-1).every(grid=>!grid[2].includes('data-v="festival"')));
assert.match(grids.at(-1)[2],/game-test-badge/);assert.doesNotMatch(grids.at(-1)[2],/v?1\.0\.0/);
assert.equal(catalog.worldRankGames().festival,undefined,'festival information does not enter score rankings');
assert.ok(fs.existsSync(path.join(root,'assets/design/games/festival.svg')));

// A small DOM harness drives the bridge's actual close, Escape and load handlers.
function bridgeFixture(){
 const nodes=[],classes=new Set();let focused;
 class Element extends EventTarget{
  constructor(tag){super();this.tagName=tag;this.isConnected=false;this.open=false;this.attributes={};}
  setAttribute(name,value){this.attributes[name]=value;}
  set innerHTML(html){this.button=new Element('button');this.frame=new Element('iframe');this.frame.src=html.match(/<iframe[^>]*src="([^"]+)"/)[1];}
  querySelector(selector){return selector==='iframe'?this.frame:(selector==='button'||selector==='.agit-home-link')?this.button:null;}
  showModal(){this.open=true;}close(){this.open=false;}remove(){this.isConnected=false;}
  focus(){focused=this;document.activeElement=this;}click(){this.dispatchEvent(new Event('click'));}
 }
 const previous=new Element('button');previous.isConnected=true;
 const document={activeElement:previous,createElement:tag=>new Element(tag),body:{
  classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name)},
  append:node=>{node.isConnected=true;nodes.push(node);}}};
 previous.focus();const ctx=vm.createContext({window:{},document});vm.runInContext(bridge,ctx);
 return{api:ctx.window.OjjudaFestivalSchedule,nodes,document,previous,focused:()=>focused};
}
const f=bridgeFixture();f.api.open({authorized:()=>false});assert.equal(f.nodes.length,0);
f.api.open({owner:'member-a'});const first=f.nodes[0];
assert.equal(first.open,true);assert.equal(f.document.body.classList.contains('gaming'),true);
assert.equal(f.focused(),first.button,'the return button receives initial focus');
assert.match(first.frame.src,/^\/games\/festival-schedule\/index\.html\?v=[^&]+&embedded=1$/,'the page stays on the arcade origin');
assert.equal(first.attributes['aria-label'],'축제일정 · 테스트');
f.api.open({owner:'member-a'});assert.equal(f.nodes.length,1,'duplicate open reuses the active dialog');
first.button.click();assert.equal(first.isConnected,false);assert.equal(first.open,false);
assert.equal(first.frame.src,'about:blank','closing unloads the map document');
assert.equal(f.document.body.classList.contains('gaming'),false);assert.equal(f.focused(),f.previous);
f.api.close();assert.equal(f.nodes.length,1,'repeated close is harmless');
f.api.open();const second=f.nodes[1];assert.notEqual(second,first);
const cancel=new Event('cancel',{cancelable:true});second.dispatchEvent(cancel);
assert.equal(cancel.defaultPrevented,true);assert.equal(second.isConnected,false);
assert.equal(second.frame.src,'about:blank','Escape uses complete iframe cleanup');
f.api.open({owner:'old'});const old=f.nodes[2];
let authorized=true;f.api.open({owner:'new',authorized:()=>authorized});const stale=f.nodes[3];
assert.equal(old.isConnected,false);assert.equal(old.frame.src,'about:blank','account replacement unloads the old page');
authorized=false;stale.frame.dispatchEvent(new Event('load'));
assert.equal(stale.isConnected,false,'an old account cannot finish loading the page');
f.api.open();const reopened=f.nodes[4];stale.frame.dispatchEvent(new Event('load'));
assert.equal(reopened.isConnected,true,'a detached frame cannot close the next session');f.api.close();
f.document.body.classList.add('gaming');f.api.open();f.api.close();
assert.equal(f.document.body.classList.contains('gaming'),true,'pre-existing game state belongs to its original owner');

// Use the real asset loader and route; resource completion is explicit, with no
// network, account service or running game needed by this integration test.
function routeFixture(){
 const resources=[],opens=[];let rendered=0,closed=0;
 const document={head:{append:node=>resources.push(node)},createElement:tag=>({tagName:tag,remove(){}}),getElementById:()=>null,querySelector:()=>null};
 const boot=vm.createContext({URL,Promise,console,document,setTimeout,clearTimeout,
  window:{OjjudaFestivalSchedule:{open:options=>{opens.push(options);assert.equal(boot.g.tab,'place');assert.equal(boot.g.place.id,'arcade');},close:()=>{closed++;}}},
  location:{href:'https://ojjuda.kr/world.html?game=festival'},D:{online:false},g:{tab:'arcade',place:null},
  worldGameAssetRequest:0,worldClosingGames:null,worldRecommendedRestaurants:null,R:null,worldEntryRouted:false,worldGameEntryGate:()=>true,M:()=>{},
  py:()=>{},H:()=>{rendered++;},sr:{tab:({tab})=>{boot.g.tab='place';boot.g.place={id:tab};}},
  worldParkNotes:null,resolveWorldProfilePhoto:()=>{},m1:()=>{},x1:()=>Promise.resolve(),bm:true});
 vm.runInContext(assets,boot);vm.runInContext(launch,boot);vm.runInContext(route,boot);vm.runInContext(teardown,boot);
 return{boot,resources,opens,rendered:()=>rendered,closed:()=>closed,async finish(){
  for(const node of resources)node.onload();
  await boot.window.OjjudaGameAssets.load('festival');await Promise.resolve();
 }};
}
(async()=>{
 const cold=routeFixture(),{boot}=cold;
 const archeryVersion=boot.window.OjjudaGameAssets.version('archery');
 assert.match(archeryVersion,/^\d+\.\d+\.\d+$/,'archery declares its own game release');
 assert.equal(cold.resources.length,0,'festival assets do not load on ordinary shell startup');
 assert.equal(boot.window.OjjudaGameAssets.ready('festival'),false);
 boot.my();assert.equal(cold.resources.length,2);assert.equal(cold.opens.length,0,'direct entry waits for both lazy assets');
 const urls=cold.resources.map(node=>node.src||node.href);
 assert.ok(urls.some(url=>url.startsWith('/world-festival-schedule.js?v=')));
 assert.ok(urls.some(url=>url.startsWith('/world-festival-schedule.css?v=')));
 await cold.finish();assert.equal(cold.opens.length,1,'a cold direct link opens after arcade initialization');
 assert.equal(boot.window.OjjudaGameAssets.ready('festival'),true);
 assert.deepEqual(Object.keys(cold.opens[0]).sort(),['authorized','owner'],'the informational page receives no score, wallet or authenticated client hooks');
 assert.equal(cold.opens[0].owner,null);assert.equal(cold.opens[0].authorized(),true);
 boot.D.online=true;boot.D.user={id:'changed'};assert.equal(cold.opens[0].authorized(),false);boot.D.online=false;
 boot.my();assert.equal(cold.opens.length,1,'shell refresh does not reopen a dismissed direct-link page');
 assert.equal(cold.rendered(),1);await boot.window.OjjudaGameAssets.load('festival');assert.equal(cold.resources.length,2,'successful lazy loads are shared');
 assert.equal(boot.El(),true);assert.equal(cold.closed(),1,'global game teardown includes the festival bridge');
 for(const [label,invalidate] of [
  ['account change',b=>{b.D.online=true;b.D.user={id:'other'};}],
  ['navigation',b=>{b.g.place={id:'park'};}],
  ['global close',b=>b.El()]
 ]){
  const pending=routeFixture();pending.boot.my();invalidate(pending.boot);await pending.finish();
  assert.equal(pending.opens.length,0,label+' cancels a pending cold entry');
 }
 const revision=JSON.parse(read('game-release.json')).revision;
 assert.equal(boot.window.OjjudaGameAssets.revision,revision);assert.ok(world.includes('/world-game-assets.js?v='+revision));
 assert.equal(boot.window.OjjudaGameAssets.version('festival'),'1.1.1');
 assert.equal(boot.window.OjjudaGameAssets.version('archery'),archeryVersion,'loading festival preserves the independent archery release');
 const festivalRevision=new URL(urls.find(url=>url.includes('.js?')),'https://ojjuda.kr').searchParams.get('v');
 assert.equal(new URL(urls.find(url=>url.includes('.css?')),'https://ojjuda.kr').searchParams.get('v'),festivalRevision);
 assert.equal(bridge.match(/src="\/games\/festival-schedule\/index\.html\?v=([^&"]+)/)?.[1],festivalRevision,'iframe and bridge use the same independent cache revision');
 assert.equal(world.match(/var Go="([^"]+)"/)?.[1],JSON.parse(read('version.json')).version,'the separate Agit version remains internally consistent');
 assert.ok(world.includes('.tour-game-dialog[open]>.tour-game-header button'),'app back can use the standard return control');
 console.log('PASS: festival test-only entry, lazy cold routing, isolated account access, iframe cleanup, focus return and independent release');
})().catch(error=>{console.error(error);process.exitCode=1;});
