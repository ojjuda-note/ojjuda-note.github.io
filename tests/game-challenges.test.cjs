const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname,'../shared/games/game-challenges.js'),'utf8');
const KEY = 'ojjuda.game-growth.v1';
const tick = async () => { for(let i=0;i<5;i++) await new Promise(resolve=>setImmediate(resolve)); };
let checks = 0;
function environment(url='https://ojjuda.kr/world.html', options={}) {
  const dom=new JSDOM('<main id="game"></main>',{url,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window, calls=[], notices=[], clock={now:Date.parse('2026-11-01T14:59:00Z')};
  w.Date.now=()=>clock.now;
  const client={rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true,day:new Date(clock.now+9*3600000).toISOString().slice(0,10),server_now:new Date(clock.now).toISOString()}};}};
  if(options.dnt)Object.defineProperty(w.navigator,'doNotTrack',{value:'1',configurable:true});
  if(options.gpc)Object.defineProperty(w.navigator,'globalPrivacyControl',{value:true,configurable:true});
  if(options.blocked)Object.defineProperty(w,'localStorage',{get(){throw Error('blocked')},configurable:true});
  if(options.stored)w.localStorage.setItem(KEY,options.stored);
  w.eval(source);
  const configure=(currentClient=client)=>w.OjjudaGameChallenges.configure({client:currentClient,notify:message=>notices.push(message)});
  const render=(game='stacker',score=42)=>{w.document.getElementById('game').innerHTML=w.OjjudaGameChallenges.resultMarkup(game,score);return w.document.querySelector('[data-challenge-share]');};
  return{dom,w,calls,notices,clock,client,configure,render,close:()=>dom.window.close()};
}
const events=env=>env.calls.map(call=>call.args.p_event);
(async()=>{
  for(const [query,expected] of [
    ['',null],['?game=stacker','stacker'],['?game=mole','mole'],['?game=poker',null],['?game=__proto__',null],['?game=constructor',null],
    ['?game=stacker&game=mole',null],['?game=stacker&game=stacker',null],['?game=%3Cscript%3E',null],['?game=Stacker',null]
  ]) {
    const env=environment('https://ojjuda.kr/world.html'+query);assert.equal(env.w.OjjudaGameChallenges.requestedGame(),expected,query);env.close();checks++;
  }
  for(const query of ['?game=stacker&challenge=1&score=%3Cimg%20src=x%20onerror=alert(1)%3E','?game=stacker&challenge=1&score=-1','?game=stacker&challenge=1&score=1.5','?game=stacker&challenge=1&score=1e3','?game=stacker&challenge=1&score=1000001','?game=stacker&challenge=1&score=10&score=20','?game=stacker&challenge=1&challenge=1&score=10']) {
    const env=environment('https://ojjuda.kr/world.html'+query);env.configure();env.render();await tick();assert.equal(env.w.document.querySelector('.game-challenge-comparison'),null);assert.equal(env.w.document.querySelector('img'),null);assert.equal(env.calls[0].args.p_source,'direct');env.close();checks++;
  }
  {
    const env=environment('https://ojjuda.kr/world.html?game=stacker&challenge=1&score=30');env.configure();
    assert.equal(env.w.OjjudaGameChallenges.resultMarkup('__proto__',42),'');assert.equal(env.w.OjjudaGameChallenges.resultMarkup('stacker','<script>'),'');
    env.render();await tick();assert.deepEqual(events(env),['visit'],'results without a start never count as completion');
    assert.match(env.w.document.querySelector('.game-challenge-comparison').textContent,/친구 30층 · 나 42층/);
    env.w.OjjudaGameChallenges.onStart('stacker');await tick();env.render();env.render();await tick();
    assert.deepEqual(events(env),['visit','start','complete']);
    env.w.OjjudaGameChallenges.onStart('stacker');env.render();await tick();assert.equal(env.calls.length,3,'replays are deduplicated for the same browser and day');
    for(const call of env.calls){assert.equal(call.name,'record_game_growth');assert.deepEqual(Object.keys(call.args).sort(),['p_event','p_game','p_source','p_visit_id']);assert.equal(call.args.p_game,'stacker');assert.equal(call.args.p_source,'challenge');assert.match(call.args.p_visit_id,/^[0-9a-f-]{36}$/);}
    const initialId=env.calls[0].args.p_visit_id,stored=env.w.localStorage.getItem(KEY);env.close();
    const reloaded=environment('https://ojjuda.kr/world.html?game=stacker&challenge=1&score=30',{stored});reloaded.configure();reloaded.w.OjjudaGameChallenges.onStart('stacker');reloaded.render();await tick();assert.equal(reloaded.calls.length,0,'reload retains sent markers');
    const memberCalls=[];const memberClient={rpc:async(name,args)=>{memberCalls.push(args);return{data:{ok:true,day:'2026-11-01',server_now:new Date(reloaded.clock.now).toISOString()}};}};
    reloaded.configure(memberClient);reloaded.w.OjjudaGameChallenges.onStart('mole');await tick();assert.equal(memberCalls.length,2);assert.equal(memberCalls[0].p_visit_id,initialId,'login/client switch keeps the same daily identity');assert.equal(memberCalls[0].p_source,'direct');assert.equal('user_id' in memberCalls[0],false);
    reloaded.configure();reloaded.clock.now+=120000;reloaded.w.OjjudaGameChallenges.onStart('stacker');reloaded.render();await tick();assert.deepEqual(events(reloaded),['visit','start','complete']);assert.notEqual(reloaded.calls[0].args.p_visit_id,initialId,'Korean midnight rotates the browser identity');assert.equal(JSON.parse(reloaded.w.localStorage.getItem(KEY)).day,'2026-11-02');reloaded.close();checks++;
  }
  for(const [url,options] of [['https://ojjuda.kr/world.html',{dnt:true}],['https://ojjuda.kr/world.html',{gpc:true}],['https://ojjuda.kr/world.html',{blocked:true}],['http://localhost/world.html',{}],['https://example.com/world.html',{}]]) {
    const env=environment(url,options);env.configure();env.w.OjjudaGameChallenges.onStart('stacker');const button=env.render();await tick();assert.equal(env.calls.length,0,'privacy and nonproduction contexts do not send telemetry');assert.ok(button,'sharing remains available when telemetry is disabled');env.close();checks++;
  }
  {
    const env=environment('https://ojjuda.com/world.html?game=stacker&challenge=1&score=25');let shared;
    Object.defineProperty(env.w.navigator,'share',{value:async data=>{shared=data},configurable:true});env.configure();const button=env.render('stacker',42);button.click();await tick();
    assert.equal(shared.title,'오쭈다 · 탑 쌓기');assert.equal(shared.text,'탑 쌓기 42층! 내 기록 깨볼래?');
    assert.equal(shared.url,'https://ojjuda.kr/world.html?game=stacker&challenge=1&score=42');assert.equal(button.disabled,false);assert.equal(events(env).filter(event=>event==='share').length,1);
    assert.deepEqual(Object.keys(shared).sort(),['text','title','url']);assert.equal(JSON.stringify(env.calls).includes('score'),false,'scores are shared with friends but never sent to the analytics endpoint');env.close();checks++;
  }
  {
    const env=environment();let clipboard=0;
    Object.defineProperty(env.w.navigator,'share',{value:async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'})},configurable:true});
    Object.defineProperty(env.w.navigator,'clipboard',{value:{writeText:async()=>clipboard++},configurable:true});env.configure();const button=env.render();button.click();await tick();assert.equal(clipboard,0);assert.equal(events(env).includes('share'),false,'cancelled sharing is not counted');assert.equal(button.disabled,false);assert.equal(env.w.document.querySelector('dialog'),null);env.close();checks++;
  }
  {
    const env=environment();let copied;
    Object.defineProperty(env.w.navigator,'share',{value:async()=>{throw Error('unavailable')},configurable:true});
    Object.defineProperty(env.w.navigator,'clipboard',{value:{writeText:async text=>{copied=text}},configurable:true});env.configure();env.render('mole',17).click();await tick();
    assert.match(copied,/두더지 잡기 17점! 내 기록 깨볼래\?\nhttps:\/\/ojjuda.kr\/world.html\?game=mole&challenge=1&score=17/);assert.deepEqual(events(env),['share']);assert.match(env.notices[0],/복사/);env.close();checks++;
  }
  {
    const env=environment();Object.defineProperty(env.w.navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied')}},configurable:true});env.configure();env.render().click();await tick();
    const dialog=env.w.document.querySelector('[data-challenge-copy-dialog]');assert.ok(dialog);assert.equal(dialog.hasAttribute('open'),true);assert.match(dialog.querySelector('textarea').value,/world.html\?game=stacker/);assert.equal(events(env).includes('share'),false,'opening the manual fallback does not count a share');
    env.w.document.execCommand=()=>false;dialog.querySelector('button').click();await tick();assert.equal(events(env).includes('share'),false);assert.match(env.notices.at(-1),/길게 눌러/);
    env.w.document.execCommand=()=>true;dialog.querySelector('button').click();await tick();assert.equal(events(env).filter(event=>event==='share').length,1);assert.equal(env.w.document.querySelector('dialog'),null);env.close();checks++;
  }
  {
    const env=environment();env.configure();env.render().click();await tick();const dialog=env.w.document.querySelector('dialog');assert.ok(dialog);dialog.querySelectorAll('button')[1].click();await tick();assert.equal(events(env).includes('share'),false);assert.equal(env.w.document.querySelector('dialog'),null);env.close();checks++;
  }
  {
    const env=environment();let resolveShare,shares=0;
    Object.defineProperty(env.w.navigator,'share',{value:()=>{shares++;return new Promise(resolve=>{resolveShare=resolve})},configurable:true});
    env.configure();const button=env.render();button.click();button.click();await tick();assert.equal(shares,1,'an in-flight share cannot be started twice');assert.equal(button.disabled,true);resolveShare();await tick();assert.equal(button.disabled,false);assert.equal(events(env).filter(event=>event==='share').length,1);env.close();checks++;
  }
  {
    const env=environment();delete env.w.AbortSignal;
    const noSignalClient={rpc(name,args){env.calls.push({name,args});const request=Promise.resolve({data:{ok:true,day:'2026-11-01',server_now:new Date(env.clock.now).toISOString()}});request.abortSignal=()=>{throw Error('should not be used without AbortSignal')};return request;}};
    env.configure(noSignalClient);env.w.OjjudaGameChallenges.onStart('stacker');env.render();await tick();assert.deepEqual(events(env),['visit','start','complete'],'an older environment without AbortSignal still delivers telemetry');env.close();checks++;
  }
  {
    const env=environment('https://ojjuda.kr/world.html?game=mole&challenge=1&score=7');let attempts=0;
    const flaky={rpc:async(name,args)=>{attempts++;if(attempts===1)throw Error('offline');env.calls.push({name,args});return{data:{ok:true,day:'2026-11-01',server_now:new Date(env.clock.now).toISOString()}};}};
    env.configure(flaky);env.w.OjjudaGameChallenges.onStart('mole');env.render('mole',8);await tick();assert.equal(attempts,1,'backoff prevents immediate retry loops');env.w.dispatchEvent(new env.w.Event('online'));await tick();assert.deepEqual(events(env),['visit','start','complete']);env.close();checks++;
  }
  {
    const env=environment();env.configure();env.w.OjjudaGameChallenges.onOpen('poker');env.w.OjjudaGameChallenges.onOpen('mole');await tick();assert.deepEqual(events(env),['visit'],'opening a game counts a visit but no play');env.close();checks++;
  }
  {
    const env=environment('https://ojjuda.kr/world.html?game=stacker&challenge=1&score=5');let offline=true,attempts=0;
    const client={rpc:async(name,args)=>{attempts++;if(offline)throw Error('offline');env.calls.push({name,args});return {data:{ok:true,day:new Date(env.clock.now+9*3600000).toISOString().slice(0,10),server_now:new Date(env.clock.now).toISOString()}};}};
    env.configure(client);env.w.OjjudaGameChallenges.onStart('stacker');env.render('stacker',6);await tick();assert.equal(attempts,1);assert.equal(env.calls.length,0);
    env.clock.now+=120000;offline=false;env.w.dispatchEvent(new env.w.Event('online'));await tick();assert.equal(env.calls.length,0,"yesterday's offline queue must not inflate today's visits or completions");
    env.w.OjjudaGameChallenges.onStart('stacker');env.render('stacker',7);await tick();assert.deepEqual(events(env),['visit','start','complete'],"today's new attempt still records normally after expired events are discarded");assert.equal(JSON.parse(env.w.localStorage.getItem(KEY)).day,'2026-11-02');env.close();checks++;
  }
  console.log(`PASS: ${checks} challenge URL, privacy, daily tracking and sharing scenarios`);
})().catch(error=>{console.error(error);process.exitCode=1;});
