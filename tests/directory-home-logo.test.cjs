const assert=require('node:assert/strict'),fs=require('node:fs');
const read=file=>fs.readFileSync(file,'utf8');
for(const source of [read('world-festival-schedule.js'),read('world-restaurant-guide.js')]){
  assert.match(source,/class="agit-home-link" href="\/world\.html"/);
  assert.match(source,/aria-label="오쭈다 아지트 홈으로 이동"/);
  assert.match(source,/querySelector\('\.agit-home-link'\)\.focus/);
}
assert.doesNotMatch(read('world-festival-schedule.js'),/← 게임 목록/);
assert.doesNotMatch(read('world-restaurant-guide.js'),/← 오락실/);
assert.equal(JSON.parse(read('game-release.json')).revision,'20261104-agit-home-winter1');
assert.ok(JSON.parse(read('games/festival-schedule/events.json')).events.some(event=>event.id==='hwacheon-sancheoneo-2027'&&event.start==='2027-01-09'&&event.end==='2027-01-31'));
console.log('directory home logo and winter festival checks passed');
