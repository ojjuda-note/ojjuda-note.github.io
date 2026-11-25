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
  ['친구가 와서 기뻤다.', ['친구','기뻤다']],
  ['화분에 새잎이 났다.', ['화분','새잎']],
  ['고양이가 종이 위에 앉았다.', ['고양이','종이']],
  ['토끼풀에서 쉬었다.', ['토끼풀','쉬었다']],
  ['벚꽃이 피었다.', ['벚꽃']],
  ['밤에 냉장고만 몇 번 열었다 닫았다.', ['밤','냉장고']],
  ['커피 한 잔 마실까 하다가 가격 보고 그냥 집으로 왔다.', ['커피','가격']],
  ['지하철에서 짐 들어 준 분이 있었다.', ['지하철','짐']],
  ['버스가 오려면 3분이 남았다.', ['버스','3분']],
  ['모찌 먹었다. 커피도 마셨어.', ['모찌','커피']],
  ['#커피 #커피 빵집에서 커피도 마셨어.', ['커피','빵집']],
  ['없다!', []], ['쓰려다가', []], ['', []],
  ['돈 걱정 없이 잠드는 밤이 좀 많았으면 좋겠다.', ['돈','걱정']],
  ['바람에 머리 다 날렸다. 머리 손질한 시간이 아깝네.', ['바람','머리','손질']],
  ['친구랑 필름카메라로 벚꽃 사진을 찍었다.', ['필름카메라','벚꽃','사진']],
  ['아메리카노랑 베이글을 먹었다.', ['아메리카노','베이글']],
  ['목도리를 다 떴다. 목도리가 벌써 세 개다.', ['목도리']],
  ['친구랑 만년필을 사러 문구점에 들렀다.', ['친구','만년필','문구점']],
  ['알파카는 귀엽다.', ['알파카','귀엽다']],
  ['수플레 정말 맛있다. 수플레 먹으러 또 가야지.', ['수플레']],
  ['오늘 #동네_산책 하고 공원에 들렀다.', ['동네_산책','공원']]
];
for (const [text,tags] of examples) assert.deepEqual(suggest(text,3),tags,text);
assert.equal(suggest('친구 커피 노래', 1).length, 1);
assert.equal(suggest('친구 커피 노래 사과 주말 전화').length, 5);

const sql = read('supabase/migrations/20261125061436_park_multiple_body_tags.sql');
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
    // Exercise the managed scheduler's candidate loop without publishing a card.
    await db.exec(`CREATE FUNCTION ojjuda_note_internal.run_park_post_v2() RETURNS integer
      LANGUAGE plpgsql AS $test$
      DECLARE v_tags text[]; sample text;
      BEGIN
        FOR sample IN SELECT unnest(string_to_array(current_setting('park.test_bodies'),'|')) LOOP
          v_tags := ojjuda_note_internal.park_card_context_tags(sample);
          EXIT WHEN cardinality(v_tags) > 0;
        END LOOP;
        IF coalesce(cardinality(v_tags),0)=0 THEN RETURN 0; END IF;
        RETURN cardinality(v_tags);
      END $test$`);
    await db.exec(sql);
    await db.exec(sql);
    for (const [bodies, count] of [['완벽은 없다', 0], ['완벽은 없다|지하철에서 짐 들어 준 분이 있었다.', 2]]) {
      await db.query("SELECT set_config('park.test_bodies',$1,false)", [bodies]);
      const result = await db.query('SELECT ojjuda_note_internal.run_park_post_v2() AS count');
      assert.equal(result.rows[0].count, count);
    }
    for (const [body, expected] of examples) {
      const {rows} = await db.query('SELECT ojjuda_note_internal.park_card_context_tags($1) AS tags', [body]);
      assert.deepEqual(rows[0].tags, expected, body);
    }
  } finally {
    await db.close();
  }
}
checkPublisher().catch(error => { console.error(error); process.exitCode = 1; });
