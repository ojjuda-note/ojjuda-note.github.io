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
