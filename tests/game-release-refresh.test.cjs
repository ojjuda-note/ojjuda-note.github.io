const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const manifest=JSON.parse(read('game-release.json')),world=read('world.html');
function fixture(){
 const calls=[],navigations=[];let reply=manifest,offline=false,rankReads=0,gaming=false;
 const c=vm.createContext({URL,AbortController,setTimeout,clearTimeout,Date,Promise,
  fetch:async(url,options)=>{calls.push({url,options});if(offline)throw Error('offline');return{ok:true,json:async()=>reply};},
  window:{},D:{online:true,user:{id:'member-a'}},g:{tab:'place',place:{id:'arcade'}},L:{area:'',tab:''},worldNavigation:null,
  document:{body:{classList:{contains:()=>gaming}},querySelector:()=>null},
  location:{href:'https://ojjuda.kr/world.html?tab=arcade&game=screw#main',replace:url=>navigations.push(url)}});
 vm.runInContext(read('world-game-assets.js'),c);
 c.window.OjjudaGameRankings={refresh:async()=>{rankReads++;return true;}};
 vm.runInContext(world.slice(world.indexOf('function worldRefreshKey(){'),world.indexOf('async function gm(t){')),c);
 return{c,calls,navigations,api:c.window.OjjudaGameAssets,rankReads:()=>rankReads,setReply:v=>reply=v,setOffline:v=>offline=v,setGaming:v=>gaming=v};
}
(async()=>{
 const f=fixture();assert.equal(f.api.revision,manifest.revision);
 assert.ok(world.includes('/world-game-assets.js?v='+manifest.revision),'the shell, loader and manifest release IDs match');
 assert.equal(JSON.parse(read('version.json')).version,'0.46.45-beta','a game release keeps the Agit version');
 await f.c.refreshWorldView();assert.equal(f.rankReads(),1);assert.equal(f.navigations.length,0);
 assert.equal(f.calls[0].options.cache,'no-store');assert.match(f.calls[0].url,/^\/game-release\.json\?t=\d+$/);
 f.setReply({revision:'20261026-screw-fix1'});await f.c.refreshWorldView();
 assert.equal(f.rankReads(),1,'an old shell reloads the game code rather than refreshing rankings only');
 assert.equal(f.navigations[0],'https://ojjuda.kr/world.html?tab=arcade&game=screw&game_update=20261026-screw-fix1#main','navigation preserves the existing route and hash');
 for(const invalid of [{revision:'https://example.test'}, {},{revision:4}]){
  const x=fixture();x.setReply(invalid);await x.c.refreshWorldView();assert.equal(x.navigations.length,0);assert.equal(x.rankReads(),1);
 }
 const offline=fixture();offline.setOffline(true);await offline.c.refreshWorldView();assert.equal(offline.rankReads(),1,'offline release checks do not block ordinary rank refresh');
 const playing=fixture();playing.setReply({revision:'20261026-screw-fix1'});playing.setGaming(true);assert.equal(await playing.c.refreshWorldView(),false);assert.equal(playing.navigations.length,0,'an active game is never discarded for an update');
 const race=fixture();let finish;race.api.updateRevision=()=>new Promise(resolve=>{finish=resolve;});const waiting=race.c.refreshWorldView();race.c.D.user.id='member-b';finish('20261026-screw-fix1');assert.equal(await waiting,false);assert.equal(race.navigations.length,0,'an old account refresh cannot navigate a new account');
 const shared=fixture();let unblock;shared.c.fetch=()=>{shared.calls.push('pending');return new Promise(resolve=>{unblock=resolve;});};
 const a=shared.api.updateRevision(),b=shared.api.updateRevision();assert.equal(a,b);assert.equal(shared.calls.length,1);unblock({ok:true,json:async()=>manifest});await a;
 console.log('PASS: independent game-release refresh, unchanged Agit version, updated URLs, offline/invalid manifests, account/game guards and shared checks');
})().catch(e=>{console.error(e);process.exitCode=1;});
