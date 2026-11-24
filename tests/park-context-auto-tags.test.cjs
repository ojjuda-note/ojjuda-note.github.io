const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'note/preview.js'), 'utf8');
const start = source.indexOf('// 자동 태그: 태그는 모두 5개까지.');
const end = source.indexOf('let autoTagMode = true', start);
assert.ok(start >= 0 && end > start, 'the 2026-11-24 original composer auto-tagger is restored');

const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);
const suggest = (body, limit = 5) => Array.from(vm.runInContext('suggestTags(' + JSON.stringify(body) + ',' + limit + ')', context));

for (const phrase of ['완벽은 없다', '완벽은 없지만', '완벽은 존재하지 않는다']) {
  assert.ok(suggest(phrase).includes('완벽'), phrase + ' must produce #완벽');
}
assert.ok(suggest('친구랑 커피 마셨어.').includes('친구'));
assert.ok(suggest('친구랑 커피 마셨어.').includes('커피'));
assert.ok(suggest('여기에도 40대 있나요?').includes('40대'));
assert.ok(suggest('퇴근길에 빵집 들렀다.').includes('퇴근길'));
assert.ok(suggest('퇴근길에 빵집 들렀다.').includes('빵집'));
assert.ok(suggest('완벽은 없다', 1).length <= 1);
assert.ok(suggest('완벽은 없다', 5).length <= 5);

assert.match(source, /const TAG_STOP = new Set/);
assert.match(source, /const TAG_SUFFIX = \[/);
assert.match(source, /const TAG_VERB = /);
assert.match(source, /suggestTags\(text\.value, 12\)/, 'writing must update tags immediately');
assert.match(source, /autoTagMode = !guest && !editingId/, 'restore original authoring boundaries');
assert.doesNotMatch(source, /serverTagResult|serverTagTimer|scheduleServerAutoTags|noteRpc\('suggest_card_tags'/,
  'delayed server tagging must never replace legacy suggestions');
assert.match(source, /!rejectedTags\.has\(t\)/, 'the original removed-tag behavior remains');
assert.match(source, /tags\.value = \[\.\.\.mine, \.\.\.autoTagsNow\]\.join/,
  'manual tags keep their precedence');

const park = fs.readFileSync(path.join(root, 'park/index.html'), 'utf8');
assert.match(park, /\/note\/preview\.js\?v=20261125-original-auto-tags1/,
  'cached versions must reload original tags');
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'park/version.json'),'utf8')),
  { version: '1.9.2' });
console.log('PASS: original auto-tag implementation restored and #완벽 generated on input');
