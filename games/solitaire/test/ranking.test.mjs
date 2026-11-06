import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../rules.js',import.meta.url),'utf8'),context);
const rules=context.window.OjjudaSolitaireRules;

test('normal 2 minutes outranks beginner 1 minute; every normal win precedes every beginner win',()=>{
  assert.ok(rules.score(3,120)>rules.score(1,60));
  assert.ok(rules.score(3,99999999)>rules.score(1,1));
  for(const draw of [1,3])assert.ok(rules.score(draw,60)>rules.score(draw,120));
});
test('records display the actual difficulty and elapsed time',()=>{
  const beginner=rules.record(rules.score(1,60)),normal=rules.record(rules.score(3,120));
  assert.equal(beginner.name,'초보');assert.equal(beginner.time,'1분 0초');
  assert.equal(normal.name,'보통');assert.equal(normal.time,'2분 0초');
  assert.equal(rules.record(rules.score(3,59)).time,'59초');
});
test('invalid or out-of-range ranking values are rejected',()=>{
  for(const mode of [0,2,4,'3',null])assert.equal(rules.score(mode,120),null);
  for(const seconds of [0,-1,1.5,NaN,Infinity,100000000,null,'60'])assert.equal(rules.score(1,seconds),null);
  for(const score of [0,100000000,200000000,300000000,-1,NaN,199999999.1,'199999999'])assert.equal(rules.record(score),null);
});
