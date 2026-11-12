const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');
const { auditCorpus } = require('../scripts/audit-tarot-corpus.cjs');

const load = createTarotLoader();
const { DECK, TOPICS, getReading, getSummary } = load('readings.js');
const { CARD_PATTERNS, getSpreadPattern } = load('spread-patterns.js');
const { CARD_FOUNDATIONS, CARD_SOURCE_NOTES } = load('card-foundations.js');
const { getFortune, getCorpusCounts, CORPUS_VERSION } = load('fortune-corpus/index.js');
const plain = value => JSON.parse(JSON.stringify(value));

// Count literal texts, not all the ways of drawing or concatenating cards.
const audit = auditCorpus();
assert.equal(audit.actualRecords, 2560);
assert.equal(audit.independentlyStoredBodies, 2560);
assert.deepEqual(audit.topicCounts, { overall: 640, love: 640, money: 640, work: 640 });
assert.deepEqual(plain(getCorpusCounts()), audit.topicCounts);
assert.deepEqual(audit.issues, [], 'all authored records are complete, long enough and keyed once');
assert.deepEqual(audit.duplicateFields, { oneLine: [], body: [], action: [] }, 'no duplicate authored fields');
assert.deepEqual(audit.repeatedSentences, [], 'no repeated whole body sentences');
assert.deepEqual(audit.nearDuplicates, [], 'near-copying needs editorial correction before release');

const ids = DECK.map(card => card.id);
assert.equal(new Set(ids).size, 78);
assert.deepEqual(Object.keys(CARD_PATTERNS).sort(), Array.from(ids).sort());
assert.deepEqual(Object.keys(CARD_FOUNDATIONS).sort(), Array.from(ids).sort());

// Every content key must be reachable with three real distinct cards. Checking
// all 456,456 ordered draws also catches an accidentally unused theme or slot.
const reachable = new Set();
let draws = 0;
for (const a of ids) for (const b of ids) if (a !== b) for (const c of ids) if (c !== a && c !== b) {
  reachable.add(getSpreadPattern([a, b, c]));
  draws++;
}
assert.equal(draws, 456456);
assert.equal(reachable.size, 640);
for (const topic of TOPICS) for (const key of reachable) {
  const record = getFortune(topic.id, key);
  assert.equal(record.id, `${topic.id}:${key}`);
  assert.ok(Object.isFrozen(record));
}

// Hand-picked semantic cases: start, confrontation and letting go are distinct
// from the same start meeting an offer and a gentle first step.
assert.equal(getSpreadPattern(['fool', 'tower', 'death']), '035');
assert.equal(getSpreadPattern(['fool', 'magician', 'wands_ace']), '000');
assert.equal(getSpreadPattern(['swords_three', 'hanged_man', 'swords_queen']), '642');
assert.equal(getSpreadPattern(['pentacles_nine', 'cups_two', 'pentacles_eight']), '716');

const base = ['fool', 'cups_two', 'hermit'];
const baseResult = getSummary(base, 'love');
assert.equal(baseResult.source.recordId, 'love:014');
assert.equal(baseResult.source.version, CORPUS_VERSION);
assert.equal(baseResult.oneLine, getFortune('love', '014').oneLine);
assert.equal(baseResult.summary, getFortune('love', '014').body);
assert.equal(baseResult.ritual, getFortune('love', '014').action);
assert.equal(baseResult.text, getSummary(base, 'love').text, 'reopening does not change the interpretation');
assert.deepEqual(plain(baseResult), plain(getSummary(base.map(id => DECK.find(card => card.id === id)), { id: 'love' })));
assert.notEqual(baseResult.source.recordId, getSummary(['cups_two', 'fool', 'hermit'], 'love').source.recordId, 'opening order changes the positional meaning');
assert.notEqual(baseResult.oneLine, getSummary(['cups_two', 'fool', 'hermit'], 'love').oneLine);
assert.equal(new Set(TOPICS.map(topic => getSummary(base, topic.id).summary)).size, 4, 'topics have separately authored core prose');

// Cards sharing a broad pattern still contribute their own precise meaning;
// the shared authored record is honestly identified as shared, not counted anew.
for (const replacement of [['wands_ace', 'cups_two', 'hermit'], ['fool', 'cups_three', 'hermit'], ['fool', 'cups_two', 'swords_four']]) {
  const result = getSummary(replacement, 'love');
  assert.equal(result.source.recordId, baseResult.source.recordId);
  assert.notEqual(result.text, baseResult.text);
}

// A change in any one position must affect the interpretation for every topic,
// including pairs within one thematic class. This also covers every deck card.
for (const topic of TOPICS) for (let position = 0; position < 3; position++) {
  const alternatives = new Set();
  for (const id of ids) {
    const spread = [...base]; spread[position] = id;
    if (new Set(spread).size !== 3) continue;
    const result = getSummary(spread, topic.id);
    alternatives.add(result.text);
    assert.ok(result.oneLine.length >= 24);
    assert.ok(result.text.length + result.ritual.length >= 350, 'whole readings retain useful detail');
    assert.ok(!/첫 번째 카드|두 번째 카드|세 번째 카드/.test(result.text), 'overall result does not list three card explanations');
  }
  assert.equal(alternatives.size, 76, `${topic.id} position ${position} retains each card's nuance`);
}

// Reference material and application interpretation are separate, and each
// card retains a caution. No silently invented card may replace corrupt input.
for (const card of DECK) for (const topic of TOPICS) for (let position = 0; position < 3; position++) {
  const reading = getReading(card, topic.id, position);
  assert.equal(reading.sections[0].body, CARD_FOUNDATIONS[card.id].symbol);
  assert.ok(reading.sections.find(section => /예시/.test(section.title)));
  assert.ok([reading.sections.at(-1).subtitle, reading.sections.at(-1).body].join(' ').includes(CARD_FOUNDATIONS[card.id].caution));
  assert.ok(reading.sections.every(section => section.title && section.subtitle && section.body), 'each unit has a title, takeaway and detail');
  assert.match(reading.reference.url, /^https:\/\/en\.wikisource\.org\/wiki\/The_Pictorial_Key_to_the_Tarot\/Part_[23]$/);
  assert.equal(Boolean(reading.nameGuide), card.arcana === 'minor', 'unfamiliar suit names have a plain explanation');
  assert.equal(reading.sourceNote?.body, CARD_SOURCE_NOTES[card.id]);
  if (reading.sourceNote) assert.ok(reading.sourceNote.reference.url.endsWith('/Part_3'), 'alternate divinatory meanings retain their own source');
}
for (const invalid of [[], ['fool'], ['fool', 'fool', 'star'], ['missing', 'moon', 'sun'], ['fool', 'moon', 'sun', 'star']]) {
  assert.throws(() => getSummary(invalid, 'overall'), /tarot_spread_/);
}
assert.throws(() => getSummary(base, 'missing'), /tarot_corpus_missing_record/);
assert.throws(() => getFortune('love', '999'), /tarot_corpus_missing_record/);
assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '../games/moonlit-tarot/readings.js'), 'utf8'), /SPREAD_ONE_LINES|SPREAD_LINKS|SPREAD_TOPIC_PROSE/);

console.log('PASS tarot corpus: 2,560 literal originals, duplicates and similarity, all 78 cards, 456,456 ordered draws, topic/order effects, honest references and stable replay');
