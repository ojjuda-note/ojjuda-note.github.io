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

test('rank viewer paints only top ten, highlights me and separates a personal 12th place',async t=>{
 const dom=new JSDOM(page,{url:'https://ojjuda.kr/features/arcade/monthly-ranking.html?game=runner',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const {window}=dom;
 window.AbortSignal=AbortSignal;
 window.OJJUDA_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseKey:'public-key'};
 const queries=[];
 window.supabase={createClient:()=>({rpc:(name,args)=>{
  queries.push([name,args]);
  const response={month:'2026-11',startsAt:'2026-10-31T16:00:00Z',endsAt:'2026-11-30T16:00:00Z',
   leaders:Array.from({length:10},(_,i)=>({nick:'선수'+(i+1),score:100-i*5,me:args.p_game==='mines'&&i===2})),
   mine:args.p_game==='mines'?null:{rank:12,nick:'나',score:20,me:true}};
  return {abortSignal:async()=>({data:response,error:null})};
 }})};
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
 for(const game of ['bang','sacheonseong','tank','saetbyeol','solitaire','mines','tour','billiards',
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

test('Chacha Rush keeps one compact rank link inside its game popup',t=>{
 const dom=new JSDOM('<!doctype html><html><body></body></html>',
  {url:'https://ojjuda.kr/world.html',runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const {window}=dom;
 Object.defineProperty(window.crypto,'randomUUID',{value:()=> 'test-nonce'});
 window.eval(read('shared/games/chacha-rush-portal.js').replace('export function installChachaRushPortal','function installChachaRushPortal'));
 const portal=window.installChachaRushPortal({currentOwner:()=>null,submitScore:async()=>null});
 assert.equal(portal.open(),true);
 const overlay=window.document.querySelector('section[role="dialog"]');
 const link=overlay.querySelector('a[href*="monthly-ranking.html"]');
 assert.ok(link,'game popup should keep the monthly ranking link');
 assert.equal(new URL(link.href).searchParams.get('game'),'chacha_rush');
 assert.equal(link.target,'_blank');
 assert.equal(overlay.querySelectorAll('a[href*="monthly-ranking.html"]').length,1);
 assert.equal(window.document.querySelectorAll('.chacha-monthly-rank-link').length,0);
});

test('standalone games and shared scripts point to the shipped monthly viewer',()=>{
 const html=['world.html','games/solitaire/index.html','games/sacheonseong/index.html',
  'games/forest-archer/index.html','games/bulssi/index.html'];
 for(const file of html)assert.match(read(file),/monthly-ranking\.html\?game=|game-results\.js\?v=20261108-[\w-]+/,file);
 const revision=JSON.parse(read('game-release.json')).revision;
 assert.ok(/^20261108-[\w-]+$/.test(revision));
 assert.ok(read('shared/games/world-game-assets.js').includes("const revision='"+revision+"'"));
 assert.ok(read('world.html').includes('world-game-assets.js?v='+revision));
 assert.ok(read('world.html').includes('game-results.js?v='+revision));
});
