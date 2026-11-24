const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'note/preview.js'), 'utf8');
const start = source.indexOf('// 자동 태그는');
const end = source.indexOf('let autoTagMode = true', start);
assert.ok(start >= 0 && end > start, 'literal tag helper must exist in the composer');

const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);
const suggest = (body, limit = 3) => Array.from(vm.runInContext('suggestTags(' + JSON.stringify(body) + ',' + limit + ')', context));
const samples = [
  ['여기에도 40대 있나요?', ['40대']],
  ['내일도 잘 될거야', ['내일']],
  ['퇴근길에 빵집 들렀다.', ['퇴근길', '빵집']],
  ['화분에서 새잎이 나왔다.', ['화분', '새잎']],
  ['NASA가 산불 위험을 3차원 지도로 만들었대.', ['NASA', '산불', '지도']],
  ['아무 얘기나 편하게 나누고 싶다.', ['얘기']],
  ['전화 걸어야지.', ['전화']],
  ['돈 걱정 없이 잠드는 밤이 좀 많았으면 좋겠다.', ['돈', '걱정', '밤']],
  ['친구랑 커피 마셨다.', ['친구', '커피']],
  ['완벽은 없다', ['완벽']],
  ['오늘 완벽은 없다', ['완벽']],
  ['완벽은 없지만 괜찮아', ['완벽']],
  ['모르는 단어가 나오면 무리해서 태그 만들지 말자.', ['단어', '태그']],
];
for (const [body, expected] of samples) {
  const found = suggest(body);
  assert.deepEqual(found, expected, body);
  assert.ok(found.length <= 3);
  assert.ok(found.every(tag => body.toLocaleLowerCase('ko-KR').includes(tag.toLocaleLowerCase('ko-KR'))),
    'every automatic tag must be literally present in the text: ' + body);
}
assert.ok(!suggest('여기에도 40대 있나요?').includes('여기에'));
assert.ok(!suggest('내일도 잘 될거야').includes('응원'));
assert.ok(!suggest('완벽은 없다').includes('없다'));
assert.ok(suggest('처음 만든 카레가 너무 묽다.').includes('카레'));
assert.ok(suggest('매일 행복은 어디에 있을까').includes('행복'));

assert.ok(!suggest('빵집에서 빵을 샀다.').includes('맛집'));
assert.ok(!suggest('전화 걸어야지.').includes('산책'));
assert.ok(suggest('퇴근하고 커피 마셨어.', 1).length <= 1);

assert.match(source, /noteRpc\('suggest_card_tags', \{ p_body: body \}\)/,
  'the same server tagging function must run while writing and publishing');
assert.match(source, /!input\.includes\(term\)/, 'candidate must occur in source');
assert.match(source, /suggestUnlistedTags\(body, Math\.min\(2, limit\)\)/,
  'new words must be extracted even when absent from the preselected vocabulary');
assert.match(source, /autoTagMode = !editingId && kind !== 'event'/,
  'guest and member composers must both show automatic tags');
assert.match(source, /body\.toLocaleLowerCase\('ko-KR'\)\.includes\(t\.toLocaleLowerCase\('ko-KR'\)\)/,
  'server responses must be checked against the literal body');
assert.match(source, /body\.toLocaleLowerCase\('ko-KR'\)\.includes\(tag\.toLocaleLowerCase\('ko-KR'\)\)/,
  'publication must reject an automatic tag absent from the final body');
assert.match(source, /!blockedAuto\.has\(tag\)/,
  'removed automatic tags remain removed');
assert.match(source, /typeof autoTagMode !== 'undefined' && autoTagMode/,
  'only new automatic tags, not manually authored tags, are affected');
const page = fs.readFileSync(path.join(root, 'park/index.html'), 'utf8');
assert.match(page, /\/note\/preview\.js\?v=20261125-park-guardian1/,
  'the park must load the updated file without a stale cache');
const [major,minor,patch] = JSON.parse(fs.readFileSync(path.join(root, 'park/version.json'), 'utf8')).version.split('.').map(Number);
assert.ok(major > 1 || (major === 1 && (minor > 7 || (minor === 7 && patch >= 8))),
  'Park includes the 1.7.8 automatic tag release');
console.log('PASS: automatic park tags are literal words from the text; manual tags and cache preserved');
