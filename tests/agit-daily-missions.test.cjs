const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const hub = require('../features/home/agit-hub.js');

const day = '2026-11-10';
const expected = ['park', 'baseball', 'quiz', 'recommend', 'visit'];
assert.deepEqual(hub.missions(day), expected, 'five daily tasks remain visible together');
assert.deepEqual(
  Array.from({length: 8}, (_, offset) => {
    const date = new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
    return hub.visitTarget(date).id;
  }),
  ['festival', 'restaurants', 'fanpages', 'group', 'festival', 'restaurants', 'fanpages', 'group'],
  'the target page rotates in order at the KST date boundary'
);

const settings = {};
const games = {spot: {name:'틀린그림찾기', age:0}};
let html = hub.markup(settings, games, day);
assert.match(html, /오늘의 미션/);
assert.match(html, /aria-valuemax="5" aria-valuenow="0"/);
assert.equal((html.match(/data-act="agit-task"/g) || []).length, 5);
assert.match(html, /축제 페이지 들어가기/);
const missionView = new JSDOM(html).window.document;
assert.equal(missionView.querySelectorAll('.agit-quest-grid').length, 1, 'all missions share one box');
assert.equal(missionView.querySelectorAll('.agit-quest-grid > button').length, 5);
assert.equal(missionView.querySelectorAll('.agit-quest-next').length, 0, 'no extra explanatory paragraph');
assert.equal(hub.complete(settings, 'trivia', day), false, 'the two quiz formats share one mission');
assert.equal(hub.complete(settings, 'chosung', day), false);
assert.equal(hub.stamp(settings, day), true, 'visits still use a separate stamp');
assert.equal(hub.isComplete(settings, 'park', day), false, 'stamps never replace park posts');
assert.equal(hub.complete(settings, 'quiz', day), true);
assert.equal(hub.complete(settings, 'park', day), true);
assert.equal(hub.complete(settings, 'visit', day), true);
assert.equal(hub.complete(settings, 'recommend', day), true);
const result = hub.guessBaseball(settings, hub.baseballAnswer(day), day);
assert.equal(result.won, true);
assert.equal(hub.isComplete(settings, 'baseball', day), true);
html = hub.markup(settings, games, day);
assert.match(html, /aria-valuemax="5" aria-valuenow="5"/);
assert.equal((html.match(/data-act="agit-task"/g) || []).length, 5);
assert.equal(hub.isComplete(settings, 'park', '2026-11-11'), false, 'completion resets next day');

const root = path.resolve(__dirname, '..');
const dom = new JSDOM('<main><section data-park-app><div data-park-app-slot></div><div data-park-loading hidden></div><button class="park-compose-fab"></button></section></main>', {
  url:'https://ojjuda.kr/world.html', runScripts:'outside-only'
});
try {
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(root, 'park/world-park-notes.js'), 'utf8'));
  const published = [];
  const park = w.OjjudaParkNotes.install({place:()=>({id:'park'}),userId:()=> 'member-a',onCardPublished:id=>published.push(id)});
  park.sync();
  const frame = w.document.querySelector('iframe');
  const publish = (source, userId, cardId) => w.dispatchEvent(new w.MessageEvent('message', {
    origin:w.location.origin,source,data:{type:'ojjuda:park-card-published',userId,cardId}
  }));
  const cardId = '12345678-1234-4234-8234-123456789012';
  publish(frame.contentWindow, 'member-b', cardId);
  publish(frame.contentWindow, 'member-a', 'not-a-card');
  publish(w, 'member-a', cardId);
  assert.equal(published.length, 0, 'foreign senders and invalid cards cannot finish a mission');
  publish(frame.contentWindow, 'member-a', cardId);
  assert.deepEqual(published, [cardId], 'only a same-origin, same-member saved card is accepted');
} finally { dom.window.close(); }

const writer = fs.readFileSync(path.join(root, 'note/preview.js'), 'utf8');
assert.match(writer, /if \(!editId && publishKind === 'memo'\)\s*\{\s*document\.dispatchEvent/,
  'only genuinely published new Park cards report completion');
console.log('PASS: five missions, KST rotation, daily reset, and authenticated Park-post bridge');
