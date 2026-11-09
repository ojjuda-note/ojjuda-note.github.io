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
  'settings', 'account', 'discover', 'faq'];
for (const id of sections) {
  assert.match(guide, new RegExp('href="#' + id + '"'), id + ' menu link');
  assert.match(guide, new RegExp('<section id="' + id + '"'), id + ' section');
}

const cards = [...guide.matchAll(/<details class="game-card" id="([^"]+)" data-game>/g)];
assert.equal(cards.length, 22, 'all 22 current game guides');
assert.equal(new Set(cards.map(match => match[1])).size, cards.length, 'unique game guide IDs');
for (const id of ['game-chacha', 'game-solitaire', 'game-archery', 'game-sacheonseong', 'game-bang']) {
  assert.ok(cards.some(match => match[1] === id), id + ' help is present');
}
for (const match of guide.matchAll(/<summary><img src="(\/assets\/design\/games\/[^"]+)"/g)) {
  assert.ok(fs.existsSync(path.join(root, match[1])), match[1] + ' icon exists');
}

assert.match(rankings, /href:'\/\?auth=signup&next=world'/, 'guest rankings show direct signup');
assert.match(rankings, /el\('a','회원가입','btn'\)/, 'signup link is named');
assert.match(world, /world-game-rankings\.js\?v=20261109-signup-cta1/, 'new signup button JS is cache-busted');
assert.match(world, /world-game-rankings\.css\?v=20261109-signup-cta1/, 'new signup CSS is cache-busted');
assert.ok(world.includes('Go="' + version + '";'), 'world and portal version agree');

for (const link of ['/groups/index.html', '/world.html?game=festival',
  '/world.html?game=restaurants', '/?auth=signup&amp;next=world']) {
  assert.ok(guide.includes('href="' + link + '"'), link + ' is in guide');
}
assert.match(terms, /그룹의 글·일정·댓글·사진·동영상/, 'terms cover group content');
assert.match(terms, /행사·맛집 안내/, 'terms cover event and restaurant guide');
assert.match(terms, /datetime="2026-11-20"/, 'planned policy effective date is unchanged');

console.log('PASS: 22 game guides, account and discovery links, guest signup CTA, cache/version sync and current policy scope');
