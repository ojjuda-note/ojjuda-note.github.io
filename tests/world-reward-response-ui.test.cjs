const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.join(__dirname,'..');
// The shipped World module runs against delayed in-memory reads/RPCs only.
let world=fs.readFileSync(path.join(root,'world.html'),'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
const rewardJobs=new Map(),rewardTasks=new Map(),rewardResults=new Map(),rewardCalls=[];let rewardJobId=0,screwApi;
const rewardRequest=(kind,owner,args)=>{const id=++rewardJobId;rewardCalls.push({kind,owner,args});return new Promise((resolve,reject)=>rewardJobs.set(id,{kind,owner,resolve,reject}));};
S={rpc(kind,args){return rewardRequest(kind,D.user?.id,args);},from(table){if(table!=='user_private')throw Error('Unexpected table');let owner;const query={select(){return query;},eq(key,value){owner=value;return query;},maybeSingle(){return rewardRequest('quiz',owner);}};return query;}};
const fakeGame=()=>({controls:'',draw(){},update(){},destroy(){}});
G2.mole=fakeGame;window.OjjudaScrewLoader={menuHTML:()=>'<p>나사게임</p>',load:async()=>api=>{screwApi=api;return fakeGame();}};
D.online=true;D.user={id:'owner-a'};D.walletReady=true;D.doorReady=true;D.isAdmin=false;xd(false);$.coins=111;$.lastCheckin=null;g.tab='my';H();
const rewardWrites={save:0,render:0,wallet:0},rewardToasts=[],originalSave=I,originalRender=H,originalWallet=qf;
I=()=>{rewardWrites.save++;originalSave();};H=()=>{rewardWrites.render++;originalRender();};qf=()=>{rewardWrites.wallet++;originalWallet();};M=text=>rewardToasts.push(text);
window.rewardTest={
 async prepare(kind){if(kind==='screw'){Al('screw');await _2();}else if(kind==='result'){Al('mole');await _2();}},
 start(kind){let task;if(kind==='quiz')task=kg();else if(kind==='daily')task=sr.checkin({},document.createElement('button'));else if(kind==='score')task=tf('mole',150);else if(kind==='screw')task=screwApi.buyScrew('flat_moves','fixture-request',1,false);else if(kind==='result')task=S2(150);else throw Error('Unexpected test action');const id=rewardJobId;rewardTasks.set(id,Promise.resolve(task).then(value=>{rewardResults.set(id,value);},error=>{rewardResults.set(id,{error:error.message});}));return id;},
 async finish(id,data,failure){const job=rewardJobs.get(id);if(!job)throw Error('Missing request '+id);if(failure==='reject')job.reject(Error('fixture failure'));else job.resolve({data,error:failure?Error('fixture query error'):null});await rewardTasks.get(id);await new Promise(resolve=>setTimeout(resolve,0));rewardJobs.delete(id);return rewardResults.get(id);},
 switchAccount(owner,coins,online=true){D.user=owner?{id:owner}:null;D.online=online;$.coins=coins;$.lastCheckin=null;originalRender();},
 restart(){R.running=false;return _2();},close:El,
 pending(){return [...rewardJobs].map(([id,{kind,owner}])=>({id,kind,owner}));},
 snapshot(){return{user:D.user?.id||null,online:D.online,coins:$.coins,lastCheckin:$.lastCheckin,visible:document.querySelector('.coinpill').textContent,toasts:[...rewardToasts],result:document.querySelector('#gres')?.textContent||null,rank:document.querySelector('#grank')?.textContent||null,...rewardWrites};},
 calls(){return rewardCalls.map(({kind,owner})=>({kind,owner}));}
};
`+world.slice(world.indexOf('</script>',boot));
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});try{
 async function fixture(kind){const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).pathname==='/world.html'?route.fulfill({contentType:'text/html',body:world}):route.abort());await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.rewardTest);if(kind)await page.evaluate(kind=>rewardTest.prepare(kind),kind);return{page,errors,start:kind=>page.evaluate(kind=>rewardTest.start(kind),kind),finish:(id,data,failure)=>page.evaluate(args=>rewardTest.finish(...args),[id,data,failure]),snapshot:()=>page.evaluate(()=>rewardTest.snapshot()),switchAccount:(owner,coins,online=true)=>page.evaluate(args=>rewardTest.switchAccount(...args),[owner,coins,online]),close:async()=>{assert.deepEqual(errors,[]);await page.close();}};}
 const receipt={ok:true,coins:7,reward:1,best:150,rank:2,stage:1,count:3,extra_moves:9,price:1};
 for(const kind of ['quiz','daily','score','screw'])for(const mode of ['switch','logout','reject','query']){
  const f=await fixture(kind),id=await f.start(kind);assert.equal((await f.page.evaluate(()=>rewardTest.pending()))[0].owner,'owner-a');await f.switchAccount(mode==='logout'?null:'owner-b',900,mode!=='logout');const before=await f.snapshot(),result=await f.finish(id,receipt,['reject','query'].includes(mode)?mode:undefined);assert.deepEqual(await f.snapshot(),before,kind+' stale '+mode+' response never changes the new model, controls or notices');
  if(['score','screw'].includes(kind)&&!['reject','query'].includes(mode))assert.deepEqual(result,receipt,'late purchase/score receipts are returned unchanged');await f.close();
 }
 for(const kind of ['quiz','score','screw']){
  const f=await fixture(kind),first=await f.start(kind),second=await f.start(kind);const newer={...receipt,coins:800};assert.deepEqual(await f.finish(second,newer),kind==='quiz'?undefined:newer);const applied=await f.snapshot();assert.equal(applied.coins,800);assert.equal(applied.visible,'쭈800');await f.finish(first,receipt);assert.equal((await f.snapshot()).coins,800,kind+' older response never rolls back newer coins');assert.equal((await f.snapshot()).wallet,applied.wallet,'the stale response never repaints the wallet');await f.close();
 }
 {
  const f=await fixture(),oldQuiz=await f.start('quiz'),newScore=await f.start('score');await f.finish(newScore,{...receipt,coins:850});const before=await f.snapshot();await f.finish(oldQuiz,receipt);assert.deepEqual(await f.snapshot(),before,'reward types share response ordering');await f.close();
 }
 {
  const f=await fixture(),id=await f.start('daily');await f.finish(id,{...receipt,coins:112});const saved=await f.snapshot();assert.equal(saved.coins,112);assert.ok(saved.lastCheckin);assert.deepEqual(saved.toasts,['출석 체크 완료! 1쭈를 받았어요']);assert.equal(saved.render,1);assert.equal(saved.wallet,1);await f.close();
 }
 for(const kind of ['quiz','score']){
  const f=await fixture();for(const coins of [-1,1.5,Number.MAX_SAFE_INTEGER+1,null,'12']){const before=await f.snapshot(),id=await f.start(kind);await f.finish(id,{...receipt,coins});assert.deepEqual(await f.snapshot(),before,kind+' invalid balance is ignored');}const zero=await f.start(kind);await f.finish(zero,{...receipt,coins:0});assert.equal((await f.snapshot()).visible,'쭈0');await f.close();
 }
 // A newer failed/invalid read cannot hide an earlier successfully earned balance.
 for(const earlier of ['daily','quiz'])for(const failure of ['reject','query','invalid']){
  const f=await fixture(),earned=await f.start(earlier),newer=await f.start('quiz');
  await f.finish(newer,{coins:failure==='invalid'?-1:999},failure==='invalid'?undefined:failure);
  assert.equal((await f.snapshot()).coins,111,'failed or invalid reads do not change the wallet');
  await f.finish(earned,{...receipt,coins:112});const applied=await f.snapshot();
  assert.equal(applied.coins,112,earlier+' success remains eligible after a newer '+failure+' response');
  assert.equal(applied.visible,'쭈112');assert.equal(applied.wallet,1);
  assert.deepEqual(applied.toasts,[earlier==='daily'?'출석 체크 완료! 1쭈를 받았어요':'정답! 1쭈를 받았어요']);
  if(earlier==='daily')assert.ok(applied.lastCheckin);await f.close();
 }
 // Real score-result continuation must not paint/requery for a different account.
 for(const failure of [undefined,'reject']){
  const f=await fixture('result'),id=await f.start('result');await f.switchAccount('owner-b',900);const before=await f.snapshot(),callsBefore=await f.page.evaluate(()=>rewardTest.calls());await f.finish(id,receipt,failure);assert.deepEqual(await f.snapshot(),before);assert.deepEqual(await f.page.evaluate(()=>rewardTest.calls()),callsBefore,'no ranking RPC starts under account B for account A’s completed game');await f.close();
 }
 {
  const f=await fixture('result'),old=await f.start('result');await f.page.evaluate(()=>rewardTest.restart());const latest=await f.start('result');await f.finish(latest,{...receipt,coins:800,best:999});const before=await f.snapshot();assert.match(before.result,/999/);await f.finish(old,{...receipt,best:1});assert.deepEqual(await f.snapshot(),before,'a result from before restart cannot replace the new result or request ranking again');const ranking=(await f.page.evaluate(()=>rewardTest.pending())).filter(j=>j.kind==='game_ranking').at(-1);assert.ok(ranking);await f.switchAccount('owner-b',900);const switched=await f.snapshot();await f.finish(ranking.id,[{nick:'A 계정 랭킹',score:999,me:true}]);assert.deepEqual(await f.snapshot(),switched,'a late ranking response cannot enter the new account view');await f.close();
 }
 console.log('PASS: reward account isolation, quiz/daily/game/purchase continuations, shared response order, valid balances, preserved RPC receipts, restart and ranking guards.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
