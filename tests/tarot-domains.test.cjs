const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');

const load = createTarotLoader();
const { buildDomainGroup, READING_TOPICS, READING_CATEGORIES } = load('domain-narration.js');
const { DECK, getReading, getSummary } = load('readings.js');
const { CARD_PATTERNS } = load('spread-patterns.js');
const plain = value => JSON.parse(JSON.stringify(value));
const expectedTitles = [
  '나의 성향', '나의 강점', '반복하는 습관', '진짜 원하는 것', '삶의 방향·운명',
  '과거의 영향', '과거의 고난', '과거의 성취', '현재의 흐름', '앞으로의 변화',
  '문제의 핵심', '방해하는 요인', '선택의 장단점', '문제 해결 방법', '가능한 결과',
  '새로운 인연', '나의 연애 방식', '연인과의 갈등', '궁합', '재회', '결혼·동거', '이별과 관계 정리',
  '가족 간 갈등', '가족 안에서의 역할', '친구와의 관계', '인간관계의 거리',
  '직업 적성', '취업 준비', '이직·퇴사 고민', '직장 내 역할과 협업', '사업·창업 방향',
  '공부 습관', '집중을 방해하는 것', '시험 준비', '전공·진로 선택', '새로운 배움',
  '돈에 대한 태도', '지출 습관', '저축과 재정 목표', '돈거래·동업 관계', '문서·계약을 앞둔 고민',
  '생활 속 부담', '스트레스에 대한 반응', '휴식과 회복', '생활의 균형',
  '행운', '천운·귀인', '악운·주의점', '앞으로의 고난에 대비하기', '움직일 때와 기다릴 때'
];
const expectedCategories = [
  ['self', 5], ['timeline', 5], ['solutions', 5], ['love', 7], ['family', 4],
  ['career', 5], ['study', 5], ['money', 5], ['wellbeing', 4], ['opportunities', 5]
];
assert.deepEqual(plain(READING_TOPICS.map(topic => topic.title)), expectedTitles,
  'all fifty approved topics appear in the agreed order');
assert.deepEqual(plain(READING_TOPICS.map(topic => topic.number)), Array.from({ length: 50 }, (_, i) => i + 1));
assert.equal(new Set(READING_TOPICS.map(topic => topic.id)).size, 50);
assert.deepEqual(plain(READING_CATEGORIES.map(category => [category.id, category.count])), expectedCategories);
for (const [id, count] of expectedCategories) {
  assert.equal(READING_TOPICS.filter(topic => topic.category === id).length, count, id + ': every topic belongs to its promised category');
}
for (const topic of READING_TOPICS) {
  assert.match(topic.id, /^[a-z][a-z0-9-]+$/);
  assert.ok(topic.subtitle && topic.focus.length >= 40 && topic.example.length >= 70,
    topic.title + ': a clear takeaway and developed everyday example');
  assert.equal(topic.actions.length, 8);
  assert.ok(topic.actions.every(action => typeof action === 'string' && action.length >= 40));
}
assert.equal(new Set(READING_TOPICS.map(topic => topic.example)).size, 50, 'topics do not reuse the same example');
assert.equal(new Set(READING_TOPICS.flatMap(topic => topic.actions)).size, 400, 'each topic has eight distinct practical responses');
const expectedIds = plain(READING_TOPICS.map(topic => topic.id));
const deckCard = id => DECK.find(card => card.id === id);

function groupFor(cards, topic = 'overall') {
  return buildDomainGroup({ cards, readings: cards.map((card, index) => getReading(card, topic, index)) });
}

const baseCards = ['swords_knight', 'priestess', 'pentacles_three'].map(deckCard);
const base = groupFor(baseCards);
assert.equal(base.id, 'domains');
assert.equal(base.label, '분야별 풀이');
assert.deepEqual(plain(base.sections.map(section => section.id)), expectedIds);
assert.equal(new Set(base.sections.map(section => section.title)).size, 50);
assert.equal(new Set(base.sections.map(section => section.paragraphs.join('\n'))).size, 50,
  'each domain has a distinct explanation and concrete scenario');
base.sections.forEach((section, index) => {
  assert.equal(section.title, expectedTitles[index]);
  assert.equal(section.number, index + 1);
  assert.equal(section.categoryId, READING_TOPICS[index].category);
  assert.ok(section.paragraphs[0].includes(READING_TOPICS[index].focus));
  assert.ok(section.paragraphs[1].includes(READING_TOPICS[index].example));
  assert.equal(section.paragraphs.length, 3);
  assert.ok(section.subtitle && section.paragraphs.every(text => typeof text === 'string' && text.length > 80));
  for (let position = 0; position < 3; position++) {
    assert.ok(section.paragraphs[position].includes(baseCards[position].name), 'all three actual cards are explained in order');
    assert.ok(section.paragraphs[position].includes(getReading(baseCards[position], 'overall', position).meaning));
  }
});

// A domain reading must not accidentally reuse the user's original topic as
// all fifty topics. Changes to unrelated topic copy leave this group stable.
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

// Shared examples are identified separately from the actual card meanings.
assert.equal(base.categories.length, 10);
assert.match(base.description, /같은 세 장/);
assert.match(base.description, /공통 설명/);
assert.match(base.description, /실제 과거나 미래·상대의 생각을 확인한 내용은 아니/);
assert.doesNotMatch(JSON.stringify(base), /궁합\s*\d+\s*%|반드시 합격|무조건 수익|수명은|병이 낫/);

// Actual third cards select all eight topic-specific actions, including cards
// sharing a route. This preserves the card evidence instead of random prose.
for (let route = 0; route < 8; route++) {
  const third = DECK.find(card => Number(CARD_PATTERNS[card.id][2]) === route && !baseCards.slice(0, 2).includes(card));
  assert.ok(third, 'every route has a real card');
  const result = groupFor([baseCards[0], baseCards[1], third]);
  result.sections.forEach((section, index) => {
    assert.ok(section.paragraphs[2].includes(READING_TOPICS[index].actions[route]));
  });
}

const integrated = getSummary(baseCards, 'money');
const domainGroup = integrated.groups.find(group => group.id === 'domains');
for (const category of READING_CATEGORIES) assert.ok(integrated.text.includes(category.label));
assert.ok(integrated.text.includes(base.description));
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

console.log('PASS tarot topics: all 50 approved topics in 10 categories, 400 distinct practical responses, 78 cards in every role, actual card meanings, transparent examples and complete stable summaries');
