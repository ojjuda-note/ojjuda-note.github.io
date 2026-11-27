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
    assert.equal(launches,0);assert.equal(doc.querySelector('.ap-done').hidden,false);
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
