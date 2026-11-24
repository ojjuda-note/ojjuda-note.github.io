const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'note/preview.js'), 'utf8');
const start = source.indexOf('// 자동 태그:');
const end = source.indexOf('let autoTagMode = true', start);
assert.ok(start >= 0 && end > start, 'curated tag helper must exist in the composer');

const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);
const suggest = body => Array.from(vm.runInContext('suggestTags(' + JSON.stringify(body) + ',3)', context));

assert.deepEqual(suggest('여기에도 40대 있나요?'), ['40대']);
assert.deepEqual(suggest('내일도 잘 될거야'), ['응원']);
assert.deepEqual(suggest('퇴근길에 빵집 들렀다.'), ['퇴근', '빵집']);
assert.deepEqual(suggest('화분에서 새잎이 나왔다.'), ['화분', '새잎']);
assert.deepEqual(suggest('NASA가 산불 위험을 3차원 지도로 만들었대.'), ['NASA', '산불', '지도']);
assert.deepEqual(suggest('아무 얘기나 편하게 나누고 싶다.'), []);
assert.ok(!suggest('여기에도 40대 있나요?').includes('여기에'));
assert.ok(!suggest('빵집에서 빵을 샀다.').includes('맛집'));
assert.ok(!suggest('전화 걸어야지.').includes('산책'));
assert.ok(suggest('퇴근하고 커피 마셨어.', 1).length <= 1);

assert.match(source, /noteRpc\('suggest_card_tags', \{ p_body: body \}\)/,
  'the same backend context tagger must run for editing and publishing');
assert.match(source, /if \(!editId && publishKind !== 'event' && autoTagMode\)/,
  'publishing must recheck tags for new member cards');
assert.match(source, /!rejectedTags\.has\(tag\)/, 'removed automatic tags remain removed');
const page = fs.readFileSync(path.join(root, 'park/index.html'), 'utf8');
assert.match(page, /\/note\/preview\.js\?v=20261125-park-context-tags1/,
  'the park must load the updated composer, bypassing cached versions');
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'park/version.json'), 'utf8')),
  { version: '1.7.4' });
console.log('PASS: park composer uses reviewed contextual tags; manual overrides and cache refresh retained');
