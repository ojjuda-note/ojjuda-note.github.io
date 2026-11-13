const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');

const load = createTarotLoader();
const { buildDomainGroup } = load('domain-narration.js');
const { DECK, getReading, getSummary } = load('readings.js');
const { CARD_PATTERNS } = load('spread-patterns.js');
const plain = value => JSON.parse(JSON.stringify(value));
const expectedIds = ['health', 'connections', 'money', 'study', 'family', 'contracts',
  'bad-luck', 'heaven-luck', 'career', 'destiny', 'good-luck', 'compatibility'];
const expectedTitles = ['건강', '인연', '금전', '학업', '가족', '문서·계약',
  '악운', '천운', '직업', '운명', '행운', '궁합'];
const deckCard = id => DECK.find(card => card.id === id);

function groupFor(cards, topic = 'overall') {
  return buildDomainGroup({ cards, readings: cards.map((card, index) => getReading(card, topic, index)) });
}

const baseCards = ['swords_knight', 'priestess', 'pentacles_three'].map(deckCard);
const base = groupFor(baseCards);
assert.equal(base.id, 'domains');
assert.equal(base.label, '분야별 풀이');
assert.deepEqual(plain(base.sections.map(section => section.id)), expectedIds);
assert.equal(new Set(base.sections.map(section => section.title)).size, 12);
assert.equal(new Set(base.sections.map(section => section.paragraphs.join('\n'))).size, 12,
  'each domain has a distinct explanation and concrete scenario');
base.sections.forEach((section, index) => {
  assert.ok(section.title.includes(expectedTitles[index]));
  assert.equal(section.paragraphs.length, 3);
  assert.ok(section.subtitle && section.paragraphs.every(text => typeof text === 'string' && text.length > 80));
  for (let position = 0; position < 3; position++) {
    assert.ok(section.paragraphs[position].includes(baseCards[position].name), 'all three actual cards are explained in order');
    assert.ok(section.paragraphs[position].includes(getReading(baseCards[position], 'overall', position).meaning));
  }
});

// A domain reading must not accidentally reuse the user's original topic as
// all twelve domains. Changes to unrelated topic copy leave this group stable.
for (const topic of ['overall', 'love', 'money', 'work']) {
  assert.deepEqual(plain(groupFor(baseCards, topic)), plain(base));
}
const poisonedReadings = baseCards.map((card, index) => ({
  ...getReading(card, 'love', index), topicMeaning: 'UNRELATED_TOPIC_TEXT',
  example: 'UNRELATED_TOPIC_EXAMPLE', action: 'UNRELATED_TOPIC_ACTION'
}));
assert.deepEqual(plain(buildDomainGroup({ cards: baseCards, readings: poisonedReadings })), plain(base));

// Exercise all cards in all three roles. Every response class is reached by
// real third cards, while two cards in the same class retain their own meaning.
const responseClasses = new Set();
for (let position = 0; position < 3; position++) {
  const distinctReadings = new Set();
  for (const card of DECK) {
    const cards = [...baseCards]; cards[position] = card;
    if (new Set(cards.map(item => item.id)).size !== 3) continue;
    const result = groupFor(cards);
    assert.deepEqual(plain(result.sections.map(section => section.id)), expectedIds);
    for (const section of result.sections) {
      assert.ok(section.paragraphs.every(text => text && !/undefined|\[object Object\]/.test(text)));
      assert.ok(section.paragraphs[position].includes(card.name));
    }
    distinctReadings.add(JSON.stringify(result));
    if (position === 2) responseClasses.add(CARD_PATTERNS[card.id][2]);
  }
  assert.equal(distinctReadings.size, 76, `role ${position} preserves each actual card's interpretation`);
}
assert.equal(responseClasses.size, 8);

// Material limits are present where they affect interpretation, without
// replacing the detailed practical examples with blanket warnings.
assert.match(base.sections[0].paragraphs[0], /질병이나 건강 상태를 판단해 주지는 않아/);
assert.match(base.sections[2].paragraphs[0], /돈이 늘어난다는 약속이 되지는/);
assert.match(base.sections[5].paragraphs[0], /계약의 효력이나 분쟁 결과를 알 수는 없/);
assert.match(base.sections[6].paragraphs[0], /정해진 불행이 아니라/);
assert.match(base.sections[7].paragraphs[0], /반드시 찾아올 기적이라기보다/);
assert.match(base.sections[11].paragraphs[0], /대화와 실제 행동으로 확인/);
assert.doesNotMatch(JSON.stringify(base), /궁합\s*\d+\s*%|반드시 합격|무조건 수익|수명은|병이 낫/);

const integrated = getSummary(baseCards, 'money');
const domainGroup = integrated.groups.find(group => group.id === 'domains');
assert.deepEqual(plain(domainGroup), plain(base));
for (const section of domainGroup.sections) {
  assert.ok(integrated.text.includes(section.title));
  for (const paragraph of section.paragraphs) assert.ok(integrated.text.includes(paragraph));
}
assert.deepEqual(plain(groupFor(baseCards)), plain(base), 'rereading is deterministic');
assert.notDeepEqual(plain(groupFor([...baseCards].reverse())), plain(base), 'a different order changes the reading');

for (const input of [undefined, {}, { cards: baseCards, readings: [] },
  { cards: [baseCards[0], baseCards[0], baseCards[2]], readings: poisonedReadings },
  { cards: [{ id: 'missing', name: '없는 카드' }, baseCards[1], baseCards[2]], readings: poisonedReadings }]) {
  assert.throws(() => buildDomainGroup(input), /tarot_domains_require_three_actual_cards/);
}

console.log('PASS tarot domains: all 12 domains, 78 cards in every role, all eight response routes, concrete independent topic prose, actual card meanings, limits and stable summary integration');
