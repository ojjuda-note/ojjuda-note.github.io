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
