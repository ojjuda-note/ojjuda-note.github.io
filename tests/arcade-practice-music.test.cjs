const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.resolve(__dirname,'..');
function source(name) {return fs.readFileSync(path.join(root,name),'utf8');}
function fixture() {
  const dom = new JSDOM('<button id="game">사천성</button>',{url:'https://example.test',runScripts:'outside-only'});
  const w=dom.window;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.eval(source('shared/games/tutorial-visits.js'));
  w.eval(source('shared/games/lesson-panel.js'));
  w.eval(source('shared/games/arcade-practice.js'));
  return {dom,w,practice:w.OjjudaArcadePractice,doc:w.document};
}
test('practice does not launch or save a game until the user continues, and either flower can be selected first',()=>{
  const {dom,practice,doc}=fixture();
  try {
    let launches=0;const next=()=>launches++;
    assert.ok(practice.show('sacheonseong',{onContinue:next}));
    const tiles=doc.querySelectorAll('.ap-tile');
    tiles[2].click();tiles[1].click();tiles[0].click();
    assert.equal(launches,0);assert.equal(doc.querySelector('.ap-done').disabled,false);
    doc.querySelector('.ap-done').click();
    doc.querySelectorAll('.ap-tile')[1].click();
    doc.querySelector('.ap-done').click();
    doc.querySelectorAll('.ap-tile')[0].click();
    doc.querySelector('.ap-done').click();
    assert.equal(launches,1);assert.equal(practice.show('sacheonseong',{onContinue:next}),false);
    assert.ok(practice.show('sacheonseong',{replay:true}));
    doc.querySelector('.ap-skip').click();assert.equal(launches,1);
    assert.equal(practice.show('archery'),false);
  } finally {dom.window.close();}
});
test('skip persists per game even before the first practice action',()=>{
  const {dom,practice,doc}=fixture();
  try {
    assert.ok(practice.show('chess'));
    doc.querySelector('.ap-skip').click();
    assert.equal(practice.show('chess'),false);
    assert.ok(practice.show('janggi'));
  } finally {dom.window.close();}
});
test('all music identifiers have scores, including every single-phone party game',()=>{
  const player=source('shared/games/arcade-music.js');
  const ids=player.match(/const games = new Set\('([^']+)'/)[1].split(' ');
  const scoreSource=source('scripts/arcade-score/arrangements.py');
  const scores=[...scoreSource.matchAll(/^    '([a-z_]+)': Score\(/gm)].map(match=>match[1]);
  assert.deepEqual([...ids].sort(),scores.sort());
  assert.ok(ids.includes('runner'));
  assert.match(source('shared/games/arcade-compositions.mjs'),/decodeAudioData/);
  const {dom,w}=fixture();
  try {
    w.eval(source('games/drinking/table-view.js'));
    for(const {id} of w.DrinkingTableView.localGames)assert.ok(ids.includes(id),id);
  } finally {dom.window.close();}
  assert.ok(!ids.includes('archery'));assert.equal(new Set(ids).size,ids.length);
});

test('each game and rule variant has three reachable exercises with private retry and free navigation',()=>{
 const {dom,w,doc,practice}=fixture();
 try{
  const ids=source('shared/games/arcade-music.js').match(/const games = new Set\('([^']+)'/)[1].split(' ');
  w.eval(source('games/drinking/game-guides.js'));
  for(const id of [...ids,'screw_flat','carom3','pool8']){
   const variants=w.DrinkingGameGuides[id]?[false,true]:[null];
   for(const local of variants){
    const spec=local===null?practice.info(id):{id,name:id,goal:w.DrinkingGameGuides[id].goal,
      steps:w.DrinkingPracticeSteps(id,local),art:'',theme:'jade'};
    assert.ok(spec,id);assert.equal(spec.steps.length,3,id);
    const host=doc.createElement('section');doc.body.append(host);
    let finished=0;
    w.OjjudaLessonPanel.board(host,spec,{close(){},finish(){finished++;}});
    const tabs=host.querySelectorAll('.lesson-tab');
    for(let i=0;i<3;i++){
     const stage=spec.steps[i];tabs[i].click();assert.equal(tabs[i].getAttribute('aria-current'),'step');
     const choices=host.querySelectorAll('.ap-tile');
     const wrong=[...choices].findIndex((_,n)=>!stage.path.includes(n));
     if(wrong>=0){choices[wrong].click();assert.equal(host.querySelector('.ap-feedback').textContent,stage.hint);}
     for(const n of stage.any?stage.path.slice(0,1):stage.path)choices[n].click();
     assert.equal(host.querySelector('.ap-done').disabled,false,id+' '+stage.label);
     assert.equal(host.querySelector('.ap-feedback').dataset.state,'success');
    }
    tabs[0].click();assert.equal(host.querySelector('.ap-done').disabled,false);
    host.querySelectorAll('.lesson-hint')[1].click();assert.equal(host.querySelector('.ap-done').disabled,true);
    tabs[2].click();host.querySelector('.ap-done').click();assert.equal(finished,1);host.remove();
   }
  }
  assert.equal(practice.info('carom4').id,'billiards');assert.equal(practice.info('screw_box').id,'screw');
 }finally{dom.window.close();}
});

test('the standalone practice link stays available after the first display',()=>{
  const {dom,doc,practice}=fixture();
  try{
    const host=doc.createElement('section');doc.body.append(host);
    assert.ok(practice.show('solitaire'));doc.querySelector('.ap-skip').click();
    practice.offer('solitaire',host);practice.offer('solitaire',host);
    assert.equal(host.querySelectorAll('.ap-entry-link').length,1);
    host.querySelector('.ap-entry-link').click();assert.ok(doc.querySelector('dialog[open]'));
  }finally{dom.window.close();}
});

test('failed mounts stay eligible and previous variant and BANG visits suppress the game-wide offer',()=>{
  const {dom,w,doc,practice}=fixture();
  try{
    const proto=w.HTMLDialogElement.prototype,open=proto.showModal;
    proto.showModal=()=>{throw Error('unavailable');};
    assert.equal(practice.show('chess'),false);
    proto.showModal=open;
    assert.ok(practice.show('chess'));doc.querySelector('.ap-skip').click();
    w.localStorage.setItem('ojjuda.arcade.practice.v1.pool8','1');
    assert.equal(practice.show('carom3'),false);
    assert.equal(practice.show('carom4'),false);
    assert.ok(practice.show('screw_flat',{replay:true}));doc.querySelector('.ap-skip').click();
    assert.equal(practice.show('screw_box'),false);
    w.localStorage.setItem('bang-tutorial-complete','1');
    assert.equal(practice.show('bang'),false);
    assert.ok(practice.show('bang',{replay:true}));
  }finally{dom.window.close();}
});
