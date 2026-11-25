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
const examples = [
  ['친구랑 커피 마셨어.', ['친구','커피']],
  ['여기에도 40대 있나요?', ['40대']],
  ['퇴근길에 빵집 들렀다.', ['퇴근길','빵집']],
  ['통장 잔고 보기가 겁나서 미뤘다가 결국 확인했다.', ['통장','잔고']],
  ['친구가 와서 기뻤다.', ['친구']],
  ['화분에 새잎이 났다.', ['화분','새잎']],
  ['고양이가 종이 위에 앉았다.', ['고양이','종이']],
  ['토끼풀에서 쉬었다.', ['토끼풀']],
  ['벚꽃이 피었다.', ['벚꽃']],
  ['없다!', []], ['쓰려다가', []], ['', []],
  ['돈 걱정 없이 잠드는 밤이 좀 많았으면 좋겠다.', ['돈','걱정']],
  ['바람에 머리 다 날렸다. 머리 손질한 시간이 아깝네.', ['바람','머리','손질']],
  ['친구랑 필름카메라로 벚꽃 사진을 찍었다.', ['필름카메라','벚꽃','사진']],
  ['아메리카노랑 베이글을 먹었다.', ['아메리카노','베이글']],
  ['목도리를 다 떴다. 목도리가 벌써 세 개다.', ['목도리']],
  ['친구랑 만년필을 사러 문구점에 들렀다.', ['친구','만년필','문구점']],
  ['알파카는 귀엽다.', ['알파카']],
  ['수플레 정말 맛있다. 수플레 먹으러 또 가야지.', ['수플레']],
  ['오늘 #동네_산책 하고 공원에 들렀다.', ['동네_산책','공원']]
];
for (const [text,tags] of examples) assert.deepEqual(suggest(text,3),tags,text);
assert.equal(suggest('친구 커피 노래', 1).length, 1);
assert.equal(suggest('친구 커피 노래 사과 주말 전화').length, 5);

const sql = read('supabase/migrations/20261125051027_park_card_body_keywords.sql');
const lists = vm.runInContext('TAG_WORDS', context);
lists.forEach((words,i) => assert.ok(sql.includes("("+i+", '"+words+"')"), 'shared vocabulary tier '+i));
const park = read('park/index.html');
const script = park.match(/\/note\/preview\.js\?v=[^"]+/)[0];
assert.ok(read('park/world-park-notes.js').includes(script), 'prefetch matches the actual composer script');
assert.match(source, /autoTagMode = !guest && !editingId/);
assert.doesNotMatch(source, /serverTagResult|scheduleServerAutoTags/);
// Execute the production SQL on the same phrases as the writing form.
async function checkPublisher() {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  try {
    await db.exec('CREATE SCHEMA ojjuda_note_internal');
    await db.exec(sql);
    for (const [body, expected] of examples) {
      const {rows} = await db.query('SELECT ojjuda_note_internal.park_card_context_tags($1) AS tags', [body]);
      assert.deepEqual(rows[0].tags, expected, body);
    }
  } finally {
    await db.close();
  }
}
checkPublisher().catch(error => { console.error(error); process.exitCode = 1; });
