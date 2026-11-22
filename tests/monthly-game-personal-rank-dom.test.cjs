const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const root = path.join(__dirname,'..');
const read = file=>fs.readFileSync(path.join(root,file),'utf8');
const page = read('features/arcade/monthly-ranking.html');
const viewer = read('features/arcade/monthly-ranking.js');
const results = read('shared/games/game-results.js');
const guestAuth = {onAuthStateChange(){},async getSession(){return {data:{session:null}};}};

test('rank viewer paints only top ten, highlights me and separates a personal 12th place',async t=>{
 const dom=new JSDOM(page,{url:'https://ojjuda.kr/features/arcade/monthly-ranking.html?game=runner',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const {window}=dom;
 window.AbortSignal=AbortSignal;
 window.OJJUDA_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseKey:'public-key'};
 const queries=[];
 window.supabase={createClient:()=>({auth:guestAuth,rpc:(name,args)=>{
  queries.push([name,args]);
  const topScore={matgo:999,poker:13062,roulette:1200000}[args.p_game]??57680;
  const response={month:'2026-11',startsAt:'2026-10-31T16:00:00Z',endsAt:'2026-11-30T16:00:00Z',
   leaders:Array.from({length:10},(_,i)=>({nick:'선수'+(i+1),score:i===0?topScore:100-i*5,me:args.p_game==='mines'&&i===2})),
   mine:args.p_game==='mines'?null:{rank:12,nick:'나',score:20,me:true}};
  return {abortSignal:async()=>({data:response,error:null})};
 }})};
 window.eval(read('shared/games/score-format.js'));
 window.eval(viewer);
 await new Promise(resolve=>setTimeout(resolve,15));
 const document=window.document;
 assert.equal(queries.length,1,'one RPC supplies all ten rows and the personal position');
 assert.equal(queries[0][0],'community_game_monthly_personal');
 assert.equal(queries[0][1].p_game,'runner');
 assert.equal(document.querySelectorAll('#ranking-leaders .rank-row').length,10);
 assert.equal(document.querySelectorAll('#ranking-leaders .rank-row.is-me').length,0);
 assert.equal(document.querySelector('#ranking-mine .rank-place').textContent,'12위');
 assert.equal(document.querySelector('#ranking-mine .rank-points').textContent,'20점');
 assert.equal(document.querySelector('#ranking-leaders .rank-points').textContent,'57.7K점');
 assert.equal(document.querySelector('#ranking-leaders .rank-points').title,'57,680점');
 for(const [score,label] of [[999,'999'],[1000,'1.0K'],[999950,'1.0M'],[1000000,'1.0M'],[1250000,'1.3M']]){
  assert.equal(window.OjjudaScoreFormat(score),label);
 }
 assert.match(document.querySelector('#ranking-period').textContent,/11월.*12월/);
 assert.equal(document.querySelector('#ranking-mine').hidden,false);

 document.querySelector('#ranking-game').value='mines';
 document.querySelector('#ranking-game').dispatchEvent(new window.Event('change'));
 await new Promise(resolve=>setTimeout(resolve,15));
 assert.equal(queries.length,2);
 assert.equal(queries[1][1].p_game,'mines');
 assert.equal(document.querySelectorAll('#ranking-leaders .rank-row.is-me').length,1,'top-ten member is highlighted');
 assert.equal(document.querySelector('#ranking-mine').hidden,true,'top-ten members have no duplicate record below');
 assert.equal(new URL(window.location.href).searchParams.get('game'),'mines');

 for(const [id,label,full] of [['matgo','999G','999G'],['poker','13.1KG','13,062G'],['roulette','1.2MG','1,200,000G']]){
  const select=document.querySelector('#ranking-game');
  select.value=id;select.dispatchEvent(new window.Event('change'));
  await new Promise(resolve=>setTimeout(resolve,15));
  const top=document.querySelector('#ranking-leaders .rank-points');
  assert.equal(top.textContent,label);assert.equal(top.title,full);
  assert.equal(document.querySelector('#ranking-mine .rank-points').textContent,'20G');
 }
});

test('an unknown game opens the default ranking',async t=>{
 const dom=new JSDOM(page,{url:'https://fixture.test/ranking?game=constructor',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const {window}=dom,requested=[];
 window.AbortSignal=AbortSignal;
 window.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'synthetic'};
 window.supabase={createClient:()=>({auth:guestAuth,rpc(_name,args){
  requested.push(args.p_game);
  return {abortSignal:async()=>({data:null,error:{message:'fixture'}})};
 }})};
 window.eval(read('shared/games/score-format.js'));
 window.eval(viewer);
 await new Promise(setImmediate);
 assert.deepEqual(requested,['sacheonseong']);
 assert.equal(window.document.querySelector('#ranking-game').value,'sacheonseong');
});

test('One Card opens its monthly personal board with one game option and winning-streak units',async t=>{
 const dom=new JSDOM(page,{url:'https://ojjuda.kr/features/arcade/monthly-ranking.html?game=onecard',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window,requests=[];
 w.AbortSignal=AbortSignal;
 w.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'public'};
 w.supabase={createClient:()=>({auth:{onAuthStateChange(){},async getSession(){return {data:{session:{user:{id:'member-a'}}}};}},rpc(name,args){
  requests.push({name,args});return {abortSignal:async()=>({data:{month:'2026-11',startsAt:'2026-10-31T16:00:00Z',endsAt:'2026-11-30T16:00:00Z',
   leaders:[{nick:'원카드친구',score:7,source:'best_streak'}],mine:{rank:12,nick:'나',score:3,me:true,source:'best_streak'}}})};
 }})};
 w.eval(read('shared/games/score-format.js'));w.eval(viewer);
 await new Promise(resolve=>setTimeout(resolve,15));
 assert.equal(requests.length,1);assert.equal(requests[0].name,'community_game_monthly_personal');
 assert.equal(requests[0].args.p_game,'onecard');assert.equal(requests[0].args.p_guest_token,null);
 const doc=w.document;
 assert.equal(doc.querySelectorAll('#ranking-game option[value="onecard"]').length,1);
 assert.equal(doc.querySelector('#ranking-game').value,'onecard');
 assert.equal(doc.querySelector('#ranking-leaders .rank-points').textContent,'7연승');
 assert.equal(doc.querySelector('#ranking-mine .rank-points').textContent,'3연승');
 assert.equal(doc.querySelector('#ranking-mine .rank-place').textContent,'12위');
 assert.equal(new URL(w.location.href).searchParams.get('game'),'onecard');
});

test('an account switch replaces the guest highlight and ignores stale replies',async t=>{
 const dom=new JSDOM(page,{url:'https://example.test/ranking?game=runner',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window,doc=w.document,token='a'.repeat(64),requests=[];
 let session=null,authChanged;
 const wait=()=>new Promise(resolve=>setTimeout(resolve,10));
 const change=(event,user)=>{session=user?{user}:null;authChanged(event,session);};
 const guest={nick:'손님',score:100},member={rank:12,nick:'회원',score:25,me:true};
 w.AbortSignal=AbortSignal;w.localStorage.setItem('ojjuda.guest-ranking.v1',token);
 w.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'test'};
 w.supabase={createClient:()=>({
  auth:{onAuthStateChange(fn){authChanged=fn;},async getSession(){return {data:{session}};}},
  rpc(_name,args){return {abortSignal:()=>new Promise(resolve=>{
   requests.push({args,reply:(leaders,mine=null)=>resolve({data:{
    month:'2026-11',startsAt:'2026-10-31T16:00:00Z',endsAt:'2026-11-30T16:00:00Z',leaders,mine
   }})});
  })};}
 })};
 w.eval(viewer);await wait();
 assert.equal(requests[0].args.p_guest_token,token);
 requests[0].reply([{...guest,me:true}]);await wait();
 assert.equal(doc.querySelector('#ranking-leaders .is-me strong').textContent,'손님나');
 doc.querySelector('#ranking-refresh').click();await wait();
 change('SIGNED_IN',{id:'member-1'});await wait();
 assert.equal(requests[2].args.p_guest_token,null);
 requests[2].reply([guest],member);requests[1].reply([{...guest,me:true}]);await wait();
 assert.equal(doc.querySelector('#ranking-leaders .is-me'),null);
 assert.equal(doc.querySelector('#ranking-mine .rank-place').textContent,'12위');
 change('TOKEN_REFRESHED',{id:'member-1'});await wait();assert.equal(requests.length,3);
 change('SIGNED_IN',{id:'member-2'});await wait();
 assert.equal(doc.querySelector('#ranking-mine').hidden,true);
 requests[3].reply([guest]);await wait();assert.equal(doc.querySelector('.is-me'),null);
 change('SIGNED_OUT',null);await wait();assert.equal(requests[4].args.p_guest_token,token);
 requests[4].reply([{...guest,me:true}]);await wait();assert.equal(doc.querySelectorAll('.is-me').length,1);
});

test('shared entry/result links remain while extra ranking tiles stay out of the arcade grid',async t=>{
 const dom=new JSDOM('<!doctype html><html><body><section class="game-entry" data-entry-key="screw"></section><a data-v="chacha_rush" href="https://external.example">차차 러시</a></body></html>',
  {url:'https://ojjuda.kr/world.html',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const {window}=dom;
 window.matchMedia=()=>({matches:true,addEventListener:()=>{}});
 window.eval(results);
 const document=window.document;
 assert.deepEqual([...document.querySelectorAll('.game-entry-monthly-link')].map(a=>new URL(a.href).searchParams.get('game')),
  ['screw_box','screw_flat']);
 assert.equal(document.querySelectorAll('.chacha-monthly-rank-link').length,0,'Chacha Rush must not create a standalone grid tile');
 const another=document.createElement('a');another.dataset.v='chacha_rush';another.textContent='차차 러시';document.body.append(another);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(document.querySelectorAll('.chacha-monthly-rank-link').length,0,'rerendering the arcade must not create duplicate ranking tiles');
 const rendered=window.OjjudaGameResults.markup({game:'sacheonseong',outcome:'success'});
 assert.match(rendered,/monthly-ranking\.html\?game=sacheonseong/);
 assert.match(rendered,/game-result-social/);
 assert.match(rendered,/noopener noreferrer/);
 for(const game of ['onecard','bang','sacheonseong','tank','saetbyeol','solitaire','mines','tour','billiards',
  'janggi','chess','screw_box','screw_flat','spot','ttang','mole','runner','stacker',
  'breakout','matgo','poker','photo_ttang','roulette','archery','chacha_rush']) {
  assert.match(window.OjjudaGameResults.markup({game,outcome:'success'}),
   new RegExp('monthly-ranking\\.html\\?game='+game),`missing result link: ${game}`);
 }
 const card=document.createElement('section');card.className='game-entry';card.dataset.entryKey='billiards';document.body.append(card);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(card.querySelectorAll('.game-entry-monthly-link').length,1);
 assert.equal(new URL(card.querySelector('a').href).searchParams.get('game'),'billiards');
 const old=card.querySelector('.game-entry-monthly-links');old.remove();
 card.append(document.createElement('span'));
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(card.querySelectorAll('.game-entry-monthly-links').length,1,'rerendered entry receives a replacement link');
});

test('Chacha Rush keeps the game-first popup and closes like other arcade games',t=>{
 const dom=new JSDOM('<!doctype html><html><body><button id="origin">오락실</button></body></html>',
  {url:'https://ojjuda.kr/world.html',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const {window}=dom;
 Object.defineProperty(window.crypto,'randomUUID',{value:()=> 'test-nonce'});
 window.eval(read('shared/games/chacha-rush-portal.js').replace('export function installChachaRushPortal','function installChachaRushPortal'));
 const portal=window.installChachaRushPortal({currentOwner:()=>null,submitScore:async()=>null});
 window.document.getElementById('origin').focus();
 assert.equal(portal.open(),true);
 const overlay=window.document.querySelector('section[role="dialog"]');
 assert.ok(overlay.querySelector('iframe[sandbox]'),'the external game remains sandboxed');
 assert.equal(overlay.querySelectorAll('a').length,0,'the game popup does not add distracting ranking tiles');
 assert.equal(window.document.querySelectorAll('.chacha-monthly-rank-link').length,0);
 assert.equal(window.document.activeElement?.textContent,'← 오쭈다 오락실');
 window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',cancelable:true,bubbles:true}));
 assert.equal(window.document.querySelector('section[role="dialog"]'),null,'Escape closes the game');
 assert.equal(window.document.activeElement?.id,'origin','focus returns to the arcade card');
 assert.equal(window.document.body.style.overflow,'','page scrolling is restored');
 assert.equal(portal.open(),true);
 window.document.querySelector('section[role="dialog"] button').click();
 assert.equal(window.document.querySelector('section[role="dialog"]'),null,'close button uses the same lifecycle');
 assert.match(read('shared/games/chacha-rush-portal.js'),/location\.assign\('\/features\/arcade\/monthly-ranking\.html\?game=chacha_rush'\)/,'ranking stays available through the authenticated game bridge');
});

test('standalone games and shared scripts point to the shipped monthly viewer',()=>{
 const html=['world.html','games/solitaire/index.html','games/sacheonseong/index.html',
  'games/forest-archer/index.html','games/bulssi/index.html'];
 for(const file of html)assert.match(read(file),/monthly-ranking\.html\?game=|game-results\.js\?v=\d{8}-[\w-]+/,file);
 const revision=JSON.parse(read('game-release.json')).revision;
 assert.ok(/^\d{8}-[\w-]+$/.test(revision));
 assert.ok(read('shared/games/world-game-assets.js').includes("const revision='"+revision+"'"));
 assert.ok(read('world.html').includes('world-game-assets.js?v='+revision));
 const sharedUiRevision=(read('world.html').match(/\/shared\/games\/game-results\.css\?v=([\w-]+)/)||[])[1];
 assert.ok(sharedUiRevision,'shared results cache revision exists');
 assert.ok(read('world.html').includes('game-results.js?v='+sharedUiRevision));
});

test('arcade uses one compact ranking link instead of the embedded carousel',()=>{
 const world=read('world.html');
 assert.match(world,/<a class="arcade-ranking-entry" href="\/features\/arcade\/all-rankings\.html"/);
 assert.doesNotMatch(world,/<section data-arcade-rank-root /);
});

test('full arcade ranking page lists every game including a recorded One Card win',async t=>{
 const markup=read('features/arcade/all-rankings.html'),script=read('features/arcade/all-rankings.js');
 const dom=new JSDOM(markup,{url:'https://ojjuda.kr/features/arcade/all-rankings.html',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window,calls=[];
 w.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'fixture'};
 w.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'member-a',is_anonymous:false}}}}),
   onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  rpc(name,args){
   calls.push({name,args});
   return Promise.resolve({data:Object.fromEntries(args.p_games.map(id=>[id,id==='onecard'?{nick:'원카드회원',score:1}:null])),error:null});
  }
 })};
 w.eval(script);await new Promise(resolve=>setImmediate(resolve));
 const doc=w.document,entries=doc.querySelectorAll('.rank-entry'),one=doc.querySelector('[data-game="onecard"]');
 assert.equal(entries.length,26,'all 26 games are present without swiping or paging');
 assert.equal(doc.querySelectorAll('.rank-section').length,3,'three categories are visible');
 assert.ok(one,'One Card cannot be hidden behind a carousel');
 assert.equal(one.querySelector('.first-name').textContent,'1위 · 원카드회원');
 assert.equal(one.querySelector('.first-score').textContent,'1연승');
 assert.match(one.href,/monthly-ranking\.html\?game=onecard$/);
 assert.equal(calls.length,1,'authenticated users share one ranking request');
 assert.equal(calls[0].name,'community_game_monthly_leaders');
 assert.equal(calls[0].args.p_games.length,26);
});

test('guest arcade overview keeps one-card details member-only but shows all game choices',async t=>{
 const dom=new JSDOM(read('features/arcade/all-rankings.html'),{
  url:'https://ojjuda.kr/features/arcade/all-rankings.html',runScripts:'outside-only'
 });
 t.after(()=>dom.window.close());
 const w=dom.window,calls=[];
 w.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'fixture'};
 w.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  rpc(name,args){
   calls.push({name,args});
   return Promise.resolve({data:{leaders:[{nick:'손님',score:13}]},error:null});
  }
 })};
 w.eval(read('features/arcade/all-rankings.js'));
 await new Promise(resolve=>setImmediate(resolve));
 const doc=w.document;
 assert.equal(doc.querySelectorAll('.rank-entry').length,26);
 assert.match(doc.querySelector('[data-game="onecard"] .first-name').textContent,/로그인/);
 assert.equal(doc.querySelector('[data-game="onecard"] .first-score').textContent,'—');
 assert.equal(doc.querySelector('[data-game="saetbyeol"] .first-score').textContent,'13점');
 assert.equal(calls.length,13,'guest reads only public solo leaderboards');
 assert.ok(calls.every(call=>call.name==='community_game_monthly_personal'&&call.args.p_game!=='onecard'));
});

test('full leaderboard recovers One Card when the shared monthly batch fails',async t=>{
 const dom=new JSDOM(read('features/arcade/all-rankings.html'),{
  url:'https://ojjuda.kr/features/arcade/all-rankings.html',runScripts:'outside-only'
 });
 t.after(()=>dom.window.close());
 const w=dom.window,calls=[];
 w.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'fixture'};
 w.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'member-b',is_anonymous:false}}}}),
   onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  rpc(name,args){
   calls.push({name,args});
   if(name==='community_game_monthly_leaders')return Promise.resolve({error:{message:'batch unavailable'}});
   return Promise.resolve({data:{leaders:args.p_game==='onecard'?[{nick:'원카드복구',score:2}]:[]},error:null});
  }
 })};
 w.eval(read('features/arcade/all-rankings.js'));
 await new Promise(resolve=>setImmediate(resolve));
 const one= w.document.querySelector('[data-game="onecard"]');
 assert.equal(one.querySelector('.first-name').textContent,'1위 · 원카드복구');
 assert.equal(one.querySelector('.first-score').textContent,'2연승');
 assert.equal(calls.filter(call=>call.name==='community_game_monthly_personal').length,26);
});

test('the arcade leaderboard shares the existing automatic calendar themes and artwork',t=>{
 for(const base of ['all-rankings','monthly-ranking']){
  const html=read('features/arcade/'+base+'.html');
  const css=read('features/arcade/'+base+'.css');
  assert.match(html,/\/app\/world\/world-themes\.css\?v=20261119-auto-theme1/);
  assert.match(html,/\/app\/world\/world-themes\.js\?v=20261119-auto-theme1/);
  assert.match(css,/background-image:var\(--hero-art\)/,
   'the rank board uses the same seasonal or holiday artwork, not an unrelated illustration');
  assert.match(css,/var\(--season-accent/,
   'the rank board preserves the current calendar theme colors');
 }
 const dom=new JSDOM('<!doctype html><html><head><meta name="theme-color" content="#fff"></head><body></body></html>',{
  url:'https://ojjuda.kr/features/arcade/all-rankings.html',runScripts:'outside-only'
 });
 t.after(()=>dom.window.close());
 const w=dom.window;
 w.eval(read('app/world/world-themes.js'));
 assert.ok(w.OjjudaThemes,'the shared theme calendar loads without the world shell');
 for(const [day,expected] of [
  ['2026-04-15','spring'],['2026-07-15','summer'],['2026-11-22','autumn'],['2026-12-15','winter'],
  ['2026-02-17','seollal'],['2026-09-25','chuseok'],['2026-11-11','pepero'],['2026-12-25','christmas']
 ]){
  assert.equal(w.OjjudaThemes.resolve(new Date(day+'T03:00:00Z')),expected,
   day+' uses the same auto-selected Korean calendar theme as Agit');
 }
 assert.ok(w.document.documentElement.dataset.worldTheme,
  'the shared theme writes data-world-theme for the rank-board artwork');
});

test('ranking match details use only actual difficulty and participant metadata',t=>{
 const dom=new JSDOM('',{url:'https://ojjuda.kr/features/arcade/all-rankings.html',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window;w.eval(read('games/solitaire/rules.js'));w.eval(read('games/mines/rules.js'));
 w.eval(read('games/mole/ranking.js'));w.eval(read('shared/games/ranking-details.js'));
 const describe=w.OjjudaRankingDetails.describe;
 assert.equal(describe('janggi',{score:9,difficulty:'hard'}),'2인 대국 · 기존 통합');
 assert.equal(describe('janggi',{score:2,difficulty:'normal'}),'2인 대국 · 보통');
 assert.equal(describe('chess',{score:3,difficulty:'online'}),'2인 대국 · 온라인 대전');
 assert.equal(describe('billiards',{score:1,difficulty:'easy',variant:'carom4'}),'4구 · 2인 대국 · 쉬움');
 assert.equal(describe('tank',{score:16,opponents:11}),'12인 경기 · 상대 11명');
 assert.equal(describe('tank',{score:2,opponents:3}),'4인 경기 · 상대 3명');
 assert.equal(describe('onecard',{score:1}),'5인 경기 · 컴퓨터 포함');
 assert.equal(describe('onecard',{score:1,mode:'solo'}),'5인 경기 · 컴퓨터 포함 · 컴퓨터 대전');
 assert.equal(describe('yut',{score:6}),'참가 인원 미기록','never invent unrecorded Yut participants');
 assert.equal(describe('yut',{score:6,players:4,mode:'island'}),'4인 경기 · 보통 · 장애물 놀이');
 assert.equal(describe('tour',{score:2,player_count:3}),'3인 경기');
 assert.equal(describe('bang',{score:3,players:15}),'참가 인원 미기록','reject invalid participant counts');
 assert.equal(describe('mines',{score:1}), '', 'do not invent a difficulty from invalid scoring');
 assert.equal(describe('tank',{score:0,opponents:11}),'','zero scores are not wins');
});

test('all-game overview shows ranking conditions directly under the winning name',async t=>{
 const markup=read('features/arcade/all-rankings.html'),script=read('features/arcade/all-rankings.js');
 assert.match(markup,/shared\/games\/ranking-details\.js/);
 const dom=new JSDOM(markup,{url:'https://ojjuda.kr/features/arcade/all-rankings.html',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window;
 w.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'fixture'};
 w.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'member-a',is_anonymous:false}}}}),
   onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  rpc(_name,args){
   return Promise.resolve({data:Object.fromEntries(args.p_games.map(id=>[id,
    id==='onecard'?{nick:'카드 승자',score:1}:
    id==='tank'?{nick:'탱크 승자',score:16,opponents:11}:
    id==='janggi'?{nick:'장기 승자',score:9,difficulty:'hard'}:
    id==='yut'?{nick:'윷 승자',score:6}:null])),error:null});
  }
 })};
 w.eval(read('shared/games/ranking-details.js'));
 w.eval(script);await new Promise(resolve=>setImmediate(resolve));
 const d=w.document;
 const detail=id=>d.querySelector('[data-game="'+id+'"] .first-detail').textContent;
 assert.equal(detail('onecard'),'5인 경기 · 컴퓨터 포함');
 assert.equal(detail('tank'),'12인 경기 · 상대 11명');
 assert.equal(detail('janggi'),'2인 대국 · 기존 통합');
 assert.equal(detail('yut'),'참가 인원 미기록');
 assert.equal(d.querySelector('[data-game="onecard"] .first-name').textContent,'1위 · 카드 승자');
 assert.equal(d.querySelector('[data-game="tank"] .first-score').textContent,'16연승');
 assert.equal(d.querySelector('[data-game="chess"] .first-detail').textContent,'','empty leaders show no fake detail');
 assert.equal(d.querySelectorAll('.rank-entry').length,26);
});

test('monthly top ten also shows real opponents and difficulty for each winner',async t=>{
 const markup=read('features/arcade/monthly-ranking.html');
 assert.match(markup,/shared\/games\/ranking-details\.js/);
 const dom=new JSDOM(markup,{url:'https://ojjuda.kr/features/arcade/monthly-ranking.html?game=tank',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const w=dom.window;
 w.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'fixture'};
 w.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{user:{id:'member-a',is_anonymous:false}}}}),onAuthStateChange(){}},
  rpc(){return {abortSignal:async()=>({data:{month:'2026-11',startsAt:'2026-10-31T16:00:00Z',endsAt:'2026-11-30T16:00:00Z',
   leaders:[{nick:'탱크 챔피언',score:16,opponents:11}],mine:null},error:null})};}
 })};
 w.eval(read('shared/games/ranking-details.js'));
 w.eval(read('features/arcade/monthly-ranking.js'));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(w.document.querySelector('#ranking-leaders .rank-person small').textContent,'12인 경기 · 상대 11명');
 assert.equal(w.document.querySelector('#ranking-leaders .rank-points').textContent,'16연승');
});
