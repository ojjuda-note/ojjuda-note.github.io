const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const guide = read('guide.html');
const terms = read('terms.html');
const rankings = read('shared/games/world-game-rankings.js');
const world = read('world.html');
const version = JSON.parse(read('version.json')).version;

const sections = ['start', 'games', 'together', 'rankings', 'park', 'zu',
  'settings', 'account', 'discover', 'fortune', 'fanpages', 'faq'];
for (const id of sections) {
  assert.match(guide, new RegExp('href="#' + id + '"'), id + ' menu link');
  assert.match(guide, new RegExp('<section id="' + id + '"'), id + ' section');
}

const cards = [...guide.matchAll(/<details class="game-card" id="([^"]+)" data-game>/g)];
assert.equal(cards.length, 24, 'all 24 current game guides, including One Card and drinking games');
assert.equal(new Set(cards.map(match => match[1])).size, cards.length, 'unique game guide IDs');
for (const id of ['game-chacha', 'game-solitaire', 'game-archery', 'game-sacheonseong', 'game-onecard', 'game-bang', 'game-yut', 'game-matgo', 'game-photo', 'game-drinking']) {
  assert.ok(cards.some(match => match[1] === id), id + ' help is present');
}
for (const id of ['game-poker','game-roulette']) assert.ok(!cards.some(match => match[1] === id));
assert.match(guide, /24개 게임의 사용법/);
assert.match(guide, /만 19세 이상 회원 · 3종/);
for (const match of guide.matchAll(/<summary><img src="(\/assets\/design\/games\/[^"]+)"/g)) {
  const assetPath = new URL(match[1], 'https://ojjuda.test').pathname;
  assert.ok(fs.existsSync(path.join(root, assetPath)), match[1] + ' icon exists');
}

assert.match(rankings, /href:'\/\?auth=signup&next=world'/, 'guest rankings show direct signup');
assert.match(rankings, /el\('a','회원가입','btn'\)/, 'signup link is named');
assert.match(world, /world-game-rankings\.js\?v=[^"\s]+/, 'signup button JS remains cache-versioned');
assert.match(world, /world-game-rankings\.css\?v=[^"\s]+/, 'signup CSS remains cache-versioned');
assert.ok(world.includes('Go="' + version + '";'), 'world and portal version agree');

for (const link of ['/groups/index.html', '/world.html?game=festival',
  '/world.html?game=restaurants', '/?auth=signup&amp;next=world']) {
  assert.ok(guide.includes('href="' + link + '"'), link + ' is in guide');
}
assert.match(terms, /그룹의 글·일정·댓글·사진·동영상/, 'terms cover group content');
assert.match(terms, /행사·맛집 안내/, 'terms cover event and restaurant guide');
assert.match(terms, /datetime="2026-11-20"/, 'planned policy effective date is unchanged');

console.log('PASS: 24 game guides, account and discovery links, guest signup CTA, cache/version sync and current policy scope');