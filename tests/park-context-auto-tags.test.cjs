const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const source = read('note/preview.js');
const {PGlite} = require('@electric-sql/pglite');
const test = require('node:test');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('const TAG_WORDS'), source.indexOf('let autoTagMode')), context);
const suggest = (text, limit) => Array.from(context.suggestTags(text, limit));

for (const phrase of ['완벽은 없다', '완벽은 없지만', '완벽은 존재하지 않는다']) {
  assert.deepEqual(suggest(phrase), ['완벽']);
}
const expectedCases = [
  ['목걸이 샀어', ['목걸이']], ['목걸이를 샀어', ['목걸이']],
  ['돈가스 먹었다', ['돈가스']], ['돈가스를 먹었다', ['돈가스']],
  ['돈까스 먹었다', ['돈까스']], ['돈까스를 먹었다', ['돈까스']],
  ['사랑니가 아파서 병원에 갔다', ['사랑니', '병원']],
  ['떡볶이 먹었어', ['떡볶이']], ['떡볶이는 먹었어', ['떡볶이']],
  ['돈이 모자라다', ['돈']], ['사랑을 말했다', ['사랑']],
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
];
for (const [text, tags] of expectedCases) assert.deepEqual(suggest(text), tags, text);
assert.equal(suggest('친구 커피 노래', 1).length, 1);
assert.equal(suggest('친구 커피 노래 사과 주말 전화').length, 5);

const baseline = read('supabase/migrations/20261124211408_park_literal_card_tags.sql');
const sql = read('supabase/migrations/20261124215500_park_compound_tag_vocabulary.sql');
const lists = vm.runInContext('TAG_WORDS', context);
lists.forEach((words,i) => assert.ok(sql.includes("("+i+", '"+words+"')"), 'shared vocabulary tier '+i));
const park = read('park/index.html');
const script = park.match(/\/note\/preview\.js\?v=[^"]+/)[0];
assert.ok(read('park/world-park-notes.js').includes(script), 'prefetch matches the actual composer script');
assert.match(source, /autoTagMode = !guest && !editingId/);
assert.doesNotMatch(source, /serverTagResult|scheduleServerAutoTags/);
console.log('PASS Park literal tags, unknown names, deduplication and composer cache');

test('live migration adds only compounds and preserves old SQL tag results and access', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE SCHEMA ojjuda_note_internal; CREATE ROLE anon; CREATE ROLE authenticated;');
    await db.exec(baseline);
    const sourceInfo = async () => (await db.query(`
      SELECT prosrc, proacl::text AS acl, provolatile, proconfig,
        has_function_privilege('anon', oid, 'EXECUTE') AS guest,
        has_function_privilege('authenticated', oid, 'EXECUTE') AS member
      FROM pg_proc WHERE oid = 'ojjuda_note_internal.park_card_context_tags(text)'::regprocedure`)).rows[0];
    const sqlTags = async body => (await db.query('SELECT ojjuda_note_internal.park_card_context_tags($1) AS tags',[body])).rows[0].tags;
    const before = await sourceInfo();
    assert.deepEqual(await sqlTags('목걸이 샀어'), ['목걸']);
    assert.deepEqual(await sqlTags('돈가스 먹었다'), []);
    await db.exec(sql);
    const after = await sourceInfo();
    assert.deepEqual(after, {...before, prosrc: before.prosrc.replace('도시락 떡볶이 라면', '도시락 떡볶이 돈가스 돈까스 목걸이 사랑니 라면')});
    assert.equal(after.guest, false);
    assert.equal(after.member, false);
    for (const [body, expected] of [['완벽은 없다', ['완벽']], ...expectedCases]) {
      assert.deepEqual(await sqlTags(body), expected, body);
    }
  } finally { await db.close(); }
});
