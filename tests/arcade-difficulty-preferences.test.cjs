const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const root = path.join(__dirname, '..');
const world = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
const preferences = world.slice(world.indexOf('const arcadeDifficultyPrefix='), world.indexOf('async function xn('));
const photo = fs.readFileSync(path.join(root, 'games/photo-ttang.html'), 'utf8');
const photoPreferences = photo.slice(photo.indexOf('const photoDifficultyKey='), photo.indexOf('const VISHINT='));

test('difficulty choices are account-scoped, validated and restored independently', () => {
  const dom = new JSDOM('<button id="choose" data-act="bl-level" data-v="hard"></button>', {
    url:'https://ojjuda.kr/world.html',runScripts:'outside-only'
  });
  try {
    const w = dom.window;
    w.eval(`var D={online:true,user:{id:'person-1'}},g={blKind:'carom4'};
      var Zo={carom4:{},pool8:{}},J0=[['easy','쉬움'],['normal','보통'],['hard','어려움']];
      var Rp=[['easy','쉬움'],['normal','보통'],['hard','어려움']];
      var JG_EXTRA_LEVELS=[['pro','프로']];
      ${preferences}`);
    w.document.getElementById('choose').click();
    assert.equal(w.arcadeDifficultyRead('billiards:carom4',['easy','normal','hard']), 'hard');
    assert.equal(w.arcadeDifficultyRead('billiards:pool8',['easy','normal','hard']), 'normal');
    w.arcadeDifficultySave('mole','5',['3','4','5','6']);
    assert.equal(w.arcadeDifficultyRead('mole',['3','4','5','6'],'3'), '5');
    w.arcadeDifficultySave('mole','99',['3','4','5','6']);
    assert.equal(w.arcadeDifficultyRead('mole',['3','4','5','6'],'3'), '5', 'invalid choices are ignored');
    w.D.user.id = 'person-2';
    assert.equal(w.arcadeDifficultyRead('mole',['3','4','5','6'],'3'), '3', 'another member uses their own difficulty');
    w.localStorage.setItem(w.arcadeDifficultyKey('mole'), '500');
    assert.equal(w.arcadeDifficultyRead('mole',['3','4','5','6'],'3'), '3', 'invalid old data is ignored');
  } finally {dom.window.close();}
});

test('mole grid preference is saved on selection and read when entering', () => {
  assert.match(world, /arcadeDifficultySave\('mole',String\(size\),\['3','4','5','6'\]\)/);
  assert.match(world, /R\.moleGrid=Number\(arcadeDifficultyRead\('mole',\['3','4','5','6'\],'3'\)\)/);
});

test('photo puzzle creation restores its selected difficulty', () => {
  const dom = new JSDOM('', {url:'https://ojjuda.kr/games/photo-ttang.html',runScripts:'outside-only'});
  try {
    dom.window.localStorage.setItem('ojjuda.photo-ttang.difficulty.v1', '14');
    dom.window.eval(photoPreferences + '\nwindow.readPhotoDifficulty=()=>pickLv;');
    assert.equal(dom.window.readPhotoDifficulty(), 14);
    assert.match(photo, /localStorage\.setItem\(photoDifficultyKey,String\(pickLv\)\)/);
  } finally {dom.window.close();}
});

test('each new arcade entrance starts with single-player, even if opponent mode was chosen previously', async () => {
  const html=mode=>`<section class="game-entry" data-entry-key="chess">
    <button data-entry-mode="computer">컴퓨터</button>
    <button data-entry-mode="opponent">상대와</button>
    <section data-entry-panel="computer">혼자 하기</section>
    <section data-entry-panel="opponent" hidden>함께 하기</section>
  </section>`;
  const dom=new JSDOM('<main id="host"></main>',{
    url:'https://ojjuda.kr/world.html',runScripts:'outside-only',pretendToBeVisual:true
  });
  try{
    const w=dom.window,host=w.document.getElementById('host');
    host.innerHTML='<div id="bd-menu">'+html()+'</div>';
    w.eval(fs.readFileSync(path.join(root,'shared/games/game-entry.js'),'utf8'));
    const card=()=>host.querySelector('.game-entry');
    const selected=type=>card().querySelector('[data-entry-mode="'+type+'"]').getAttribute('aria-pressed');
    assert.equal(selected('computer'),'true');
    card().querySelector('[data-entry-mode="opponent"]').click();
    assert.equal(selected('opponent'),'true');
    host.querySelector('#bd-menu').innerHTML=html();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(selected('opponent'),'true','redrawing one open menu keeps the active tab');
    host.innerHTML='<div id="bd-menu">'+html()+'</div>';
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(selected('computer'),'true','reopening must always default to single player');
    assert.equal(selected('opponent'),'false');
    assert.equal(card().querySelector('[data-entry-panel="computer"]').hidden,false);
    assert.equal(card().querySelector('[data-entry-panel="opponent"]').hidden,true);
  }finally{dom.window.close();}
});

test('Solitaire defaults to normal, saves a selected difficulty before play and preserves active progress',()=>{
  const source=fs.readFileSync(path.join(root,'games/solitaire/app.js'),'utf8');
  const entry=fs.readFileSync(path.join(root,'games/solitaire/index.html'),'utf8');
  const start=source.indexOf("const KEY='ojjuda-solitaire-v1:'");
  const end=source.indexOf('const records=window.OjjudaPuzzleRecords.open');
  assert.ok(start>0&&end>start);
  const dom=new JSDOM('',{url:'https://ojjuda.kr/games/solitaire/',runScripts:'outside-only'});
  try{
    const w=dom.window;
    const factory=owner=>w.eval(`(()=>{const recordOwner=${JSON.stringify(owner)};${source.slice(start,end)};return {read:preferredDraw,save:rememberDraw};})()`);
    const first=factory('member-a'),second=factory('member-b');
    assert.equal(first.read(),3,'a fresh account defaults to normal, three-card Solitaire');
    first.save(1);
    assert.equal(first.read(),1,'novice difficulty is remembered immediately');
    assert.equal(second.read(),3,'another account does not inherit the first account difficulty');
    first.save(3);
    assert.equal(first.read(),3);
    first.save(99);assert.equal(first.read(),3,'unsupported difficulty cannot overwrite the preference');
    assert.match(source,/let state=createGame\(preferredDraw\(\)\)/);
    assert.match(source,/chooseEntryDraw\(preferredDraw\(\)\)/);
    assert.match(source,/chooseEntryDraw\(Number\(button\.dataset\.entryDraw\),true\)/);
    assert.match(source,/function startNewGame\(drawCount=state\.drawCount\)/,'old unfinished game remains separate');
    assert.match(entry,/<button type="button" data-entry-draw="3" class="on" aria-pressed="true">/);
  }finally{dom.window.close();}
});

test('other games retain normal default and existing per-game saved settings',()=>{
  const mines=fs.readFileSync(path.join(root,'games/mines/rules.js'),'utf8');
  const poker=fs.readFileSync(path.join(root,'games/poker/app.mjs'),'utf8');
  const onecard=fs.readFileSync(path.join(root,'games/onecard/app.mjs'),'utf8');
  const dom=new JSDOM('',{url:'https://ojjuda.kr/games/mines/',runScripts:'outside-only'});
  try{
    const w=dom.window;w.eval(mines);
    assert.equal(w.OjjudaMinesRules.progress(null).d,2,'Mines defaults to its normal/basic preset');
    assert.equal(w.OjjudaMinesRules.progress({d:4}).d,4,'Mines retains the last chosen level');
    assert.match(poker,/difficulty:'normal'/);
    assert.match(poker,/record\.difficulty=saved\?\.difficulty==='easy'\?'easy':'normal'/);
    assert.match(onecard,/entryMode='computer'/,'One Card starts on computer play');
  }finally{dom.window.close();}
});
