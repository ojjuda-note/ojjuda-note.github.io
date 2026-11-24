const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const source = read('note/preview.js');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('const TAG_WORDS'), source.indexOf('let autoTagMode')), context);
const suggest = (text, limit) => Array.from(context.suggestTags(text, limit));

for (const phrase of ['완벽은 없다', '완벽은 없지만', '완벽은 존재하지 않는다']) {
  assert.deepEqual(suggest(phrase), ['완벽']);
}
for (const [text, tags] of [
  ['친구랑 커피 마셨어.', ['친구','커피']],
  ['여기에도 40대 있나요?', ['40대']],
  ['퇴근길에 빵집 들렀다.', ['퇴근길','빵집']],
  ['통장 잔고 보기가 겁나서 미뤘다가 결국 확인했다.', ['통장','잔고']],
  ['친구가 와서 기뻤다.', ['친구']],
  ['화분에 새잎이 났다.', ['화분','새잎']],
  ['고양이가 종이 위에 앉았다.', ['고양이','종이']],
  ['토끼풀에서 쉬었다.', ['토끼풀']],
  ['벚꽃이 피었다.', ['벚꽃']],
  ['없다!', []], ['쓰려다가', []], ['', []]
]) assert.deepEqual(suggest(text), tags, text);
assert.equal(suggest('친구 커피 노래', 1).length, 1);
assert.equal(suggest('친구 커피 노래 사과 주말 전화').length, 5);

const sql = read('supabase/migrations/20261124211408_park_literal_card_tags.sql');
const lists = vm.runInContext('TAG_WORDS', context);
lists.forEach((words,i) => assert.ok(sql.includes("("+i+", '"+words+"')"), 'shared vocabulary tier '+i));
const park = read('park/index.html');
const script = park.match(/\/note\/preview\.js\?v=[^"]+/)[0];
assert.ok(read('park/world-park-notes.js').includes(script), 'prefetch matches the actual composer script');
assert.match(source, /autoTagMode = !guest && !editingId/);
assert.doesNotMatch(source, /serverTagResult|scheduleServerAutoTags/);
console.log('PASS Park literal tags, unknown names, deduplication and composer cache');
