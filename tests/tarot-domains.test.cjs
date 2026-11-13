const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');

const load = createTarotLoader();
const { buildDomainGroup, READING_TOPICS, READING_CATEGORIES } = load('domain-narration.js');
const { DECK, getReading, getSummary } = load('readings.js');
const { CARD_PATTERNS } = load('spread-patterns.js');
const { CARD_INTERPRETATIONS, CONTEXT_FIELDS, interpretCard, withParticle } = load('interpretation-engine.js');
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
  assert.ok(topic.subtitle && topic.context);
  for (const key of CONTEXT_FIELDS) assert.ok(typeof topic.context[key] === 'string' && topic.context[key].length > 3, `${topic.id}: concrete ${key}`);
  assert.match(topic.context.scene, /때$/);
  assert.match(topic.context.small, /하기$/);
  assert.match(topic.context.sign, /(?:정도|여부)$/);
  assert.equal(topic.actions, undefined, 'eight shared action buckets no longer decide the detailed interpretation');
}
assert.equal(new Set(READING_TOPICS.map(topic => topic.context.scene)).size, 50, 'each approved question has its own situation');
assert.equal(new Set(READING_TOPICS.map(topic => topic.context.small)).size, 50, 'the useful action is specific to each question');
assert.deepEqual(Object.keys(CARD_INTERPRETATIONS).sort(), plain(DECK.map(card => card.id).sort()));
const roles = ['problem', 'scene', 'response', 'outcome'];
const motions = new Set(['advance', 'review', 'care', 'boundary', 'pause', 'release', 'connect', 'complete']);
for (const [id, rule] of Object.entries(CARD_INTERPRETATIONS)) {
  assert.ok(rule.meaning.length >= 35 && motions.has(rule.motion), id + ': a real meaning and a valid relationship lens');
  for (const role of roles) {
    assert.ok(rule[role].length >= 35, `${id}/${role}: a developed interpretation`);
    const fields = [...rule[role].matchAll(/\{([a-z]+)(?::([^{}:]+))?\}/g)];
    assert.ok(fields.every(match => CONTEXT_FIELDS.includes(match[1])), `${id}/${role}: only documented context fields`);
    if (role !== 'outcome') assert.ok(new Set(fields.map(match => match[1])).size >= 2, `${id}/${role}: more than a substituted topic title`);
    for (const sentence of rule[role].split(/(?<=[.!?])\s+/).filter(Boolean)) {
      assert.match(sentence, /\{[a-z]+(?::[^{}:]+)?\}/, `${id}/${role}: every sentence applies to the actual topic instead of repeating a generic tail`);
    }
  }
}
for (const field of ['meaning', ...roles]) assert.equal(new Set(Object.values(CARD_INTERPRETATIONS).map(rule => rule[field])).size, 78, field + ': cards do not share complete explanations');
assert.equal(withParticle('조건', '을'), '조건을');
assert.equal(withParticle('대화', '을'), '대화를');
assert.equal(withParticle('도구', '으로'), '도구로');
assert.equal(withParticle('일', '으로'), '일로');
assert.equal(withParticle('기록', '으로'), '기록으로');

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
base.sections.forEach((section, index) => {
  assert.equal(section.title, expectedTitles[index]);
  assert.equal(section.number, index + 1);
  assert.equal(section.categoryId, READING_TOPICS[index].category);
  assert.equal(section.paragraphs.length, 3);
  assert.ok(section.paragraphs.every(text => typeof text === 'string' && text.length > 80));
  for (let position = 0; position < 3; position++) assert.ok(section.paragraphs[position].includes(baseCards[position].name));
  for (const key of ['cause', 'scene', 'response', 'outcome']) assert.ok(section.paragraphs.join(' ').includes(section.interpretation[key]));
  assert.doesNotMatch(section.paragraphs.join(' '), /\{[a-z]+|undefined|\[object Object\]/);
});
for (const card of baseCards) {
  const meaning = getReading(card).meaning;
  assert.equal(base.sections.filter(section => section.paragraphs.join(' ').includes(meaning)).length, 0,
    'the basic card definition is no longer pasted into all fifty topics');
}
const sentences = new Map();
for (const section of base.sections) for (const part of Object.values(section.interpretation)) {
  for (const sentence of part.split(/(?<=[.!?])\s+/).map(text => text.trim()).filter(text => text.length > 20)) {
    sentences.set(sentence, (sentences.get(sentence) || 0) + 1);
  }
}
assert.ok([...sentences.values()].every(count => count <= 2), 'complete scenario sentences are not repeated throughout the fifty topics');

// The same broad advice/flow category must not collapse different cards into
// identical interpretations. These fields contain no card-name prefixes.
const comparisons = [
  { position: 0, ids: ['priestess', 'moon'], field: 'cause', patternIndex: 0 },
  { position: 1, ids: ['fool', 'magician'], field: 'scene', patternIndex: 1 },
  { position: 2, ids: ['fool', 'magician'], field: 'response', patternIndex: 2 }
];
for (const comparison of comparisons) {
  assert.equal(CARD_PATTERNS[comparison.ids[0]][comparison.patternIndex], CARD_PATTERNS[comparison.ids[1]][comparison.patternIndex]);
  const results = comparison.ids.map(id => {
    const cards = ['emperor', 'justice', 'sun'].map(deckCard);
    cards[comparison.position] = deckCard(id);
    return groupFor(cards);
  });
  for (let index = 0; index < 50; index++) assert.notEqual(results[0].sections[index].interpretation[comparison.field], results[1].sections[index].interpretation[comparison.field], `${expectedTitles[index]}: the actual ${comparison.field} changes, not just a name`);
}
const unchangedFirstTwo = ['emperor', 'justice'].map(deckCard);
const foolResult = getSummary([...unchangedFirstTwo, deckCard('fool')], 'money');
const magicianResult = getSummary([...unchangedFirstTwo, deckCard('magician')], 'money');
assert.equal(foolResult.source.recordId, magicianResult.source.recordId, 'the unchanged shared historical reference is not relabelled as new authored fortunes');
assert.notEqual(foolResult.groups[0].sections[2].paragraphs.join(' '), magicianResult.groups[0].sections[2].paragraphs.join(' '));
const spend = base.sections.find(section => section.title === '지출 습관');
const contract = base.sections.find(section => section.title === '문서·계약을 앞둔 고민');
for (const key of ['cause', 'scene', 'response', 'outcome']) assert.notEqual(spend.interpretation[key], contract.interpretation[key], key + ': spending and contracts have different circumstances');

// Observed semantic regressions: a solitary purchase or rest must not acquire
// an invented dispute or a person responsible for carrying someone else's mood.
const spendingContext = READING_TOPICS.find(topic => topic.title === '지출 습관').context;
const restContext = READING_TOPICS.find(topic => topic.title === '휴식과 회복').context;
const examContext = READING_TOPICS.find(topic => topic.title === '시험 준비').context;
assert.doesNotMatch(interpretCard('justice', 'scene', spendingContext), /서로 억울|각자가 다르게 기억/);
assert.doesNotMatch(interpretCard('emperor', 'problem', restContext), /마음을 누가 맡|부담을 누가 맡/);
assert.doesNotMatch(interpretCard('priestess', 'scene', examContext), /분위기를 깨고 싶지/);
assert.doesNotMatch(interpretCard('magician', 'response', spendingContext), /말로 약속한 부분/);
assert.doesNotMatch(interpretCard('fool', 'outcome', spendingContext), /모른 채 뛰어들던 반복 지출을 부르는 시간/);

// Every real card participates in each role. Compare the meaning-bearing
// fields rather than entire objects whose names would trivially differ.
for (let position = 0; position < 3; position++) {
  const field = ['cause', 'scene', 'response'][position];
  const distinct = new Set();
  for (const card of DECK) {
    const cards = DECK.filter(other => other.id !== card.id).slice(0, 2);
    cards.splice(position, 0, card);
    const result = groupFor(cards);
    for (const section of result.sections) assert.ok(section.paragraphs[position].includes(card.name));
    distinct.add(result.sections.map(section => section.interpretation[field]).join('\n'));
  }
  assert.equal(distinct.size, 78, `${field}: all actual cards keep their distinct application`);
}
for (const topic of ['overall', 'love', 'money', 'work']) assert.deepEqual(plain(groupFor(baseCards, topic)), plain(base));
const poisoned = baseCards.map((card, index) => ({ ...getReading(card, 'love', index), topicMeaning: 'UNRELATED_TOPIC_TEXT', example: 'UNRELATED_TOPIC_EXAMPLE', action: 'UNRELATED_TOPIC_ACTION' }));
assert.deepEqual(plain(buildDomainGroup({ cards: baseCards, readings: poisoned })), plain(base));
assert.match(base.description, /같은 세 장/);
assert.match(base.description, /같은 규칙은 여러 주제에 다시 사용/);
assert.match(base.description, /가상 장면/);
assert.match(base.description, /실제 과거나 미래·상대의 생각을 확인한 내용은 아니/);
assert.doesNotMatch(JSON.stringify(base), /궁합\s*\d+\s*%|반드시 합격|무조건 수익|수명은|병이 낫/);
const integrated = getSummary(baseCards, 'money');
for (const category of READING_CATEGORIES) assert.ok(integrated.text.includes(category.label));
assert.deepEqual(plain(integrated.groups.find(group => group.id === 'domains')), plain(base));
for (const section of base.sections) for (const paragraph of section.paragraphs) assert.ok(integrated.text.includes(paragraph));
assert.deepEqual(plain(groupFor(baseCards)), plain(base), 'rereading is deterministic');
assert.notDeepEqual(plain(groupFor([...baseCards].reverse())), plain(base), 'position changes the interpretation');
for (const input of [undefined, {}, { cards: baseCards, readings: [] },
  { cards: [baseCards[0], baseCards[0], baseCards[2]], readings: poisoned },
  { cards: [{ id: 'missing', name: '없는 카드' }, baseCards[1], baseCards[2]], readings: poisoned }]) {
  assert.throws(() => buildDomainGroup(input), /tarot_domains_require_three_actual_cards/);
}
assert.throws(() => interpretCard('missing', 'problem', READING_TOPICS[0].context), /tarot_context_unknown_card/);
assert.throws(() => interpretCard('fool', 'problem', {}), /tarot_context_requires_complete_scene/);
console.log('PASS tarot contexts: 78 distinct card rules, 50 concrete situations, real cause/scenario/response changes within the same broad pattern, reduced sentence repetition, source integrity and stable replay');
