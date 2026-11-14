const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');
const { semanticSignature, compareGuidance, findNearGuidance, auditGuidance } = require('../scripts/audit-tarot-guidance.cjs');

const load = createTarotLoader();
const { DECK } = load('readings.js');
const { CONNECTION_PROFILES } = load('connection-profiles.js');
const { buildCardConnections, getConnectionProfile } = load('card-connections.js');
const { CARD_INTERPRETATIONS } = load('interpretation-engine.js');
const { CARD_PERSON_STORIES, getPersonStory } = load('person-stories.js');
const { PERSON_PAIR_READINGS } = load('person-pair-readings.js');
const { buildPersonNarrative } = load('person-narrative.js');
const { getPersonalContext } = load('personal-contexts.js');
const { splitSummarySentences } = load('reading-summary.js');
const plain = value => JSON.parse(JSON.stringify(value));
const card = id => DECK.find(value => value.id === id);
const context = { concern: '서로 편하게 연락할 시간', boundary: '상대가 거절할 수 있는 여지' };
const cards = [card('fool'), card('emperor'), card('temperance')];

assert.equal(DECK.length, 78);
assert.deepEqual(Object.keys(CONNECTION_PROFILES).sort(), plain(DECK.map(value => value.id).sort()), 'every actual card, including the minor cards, has its own authored profile');
for (const field of ['offer', 'excess', 'route', 'support', 'tension', 'question']) {
  assert.equal(new Set(Object.values(CONNECTION_PROFILES).map(profile => profile[field])).size, 78, `${field}: actual cards do not share whole fields`);
}
for (const value of DECK) {
  const profile = getConnectionProfile(value.id);
  for (const field of ['support', 'tension', 'question']) {
    assert.ok(typeof profile[field] === 'string' && profile[field].length >= 20, `${value.id}: developed ${field}`);
    assert.match(profile[field], /[.?]$/u, `${value.id}: ${field} is a complete sentence`);
  }
  assert.ok(['fast', 'steady', 'pause', 'variable'].includes(profile.pace));
}
assert.throws(() => getConnectionProfile('missing'), /actual_card/u);
assert.throws(() => getConnectionProfile('__proto__'), /actual_card/u);

// A personal reading must have a complete, card-specific explanation, not just
// a substituted name or a generic instruction selected by a shared card group.
const storySentenceCounts = { portrait: 2, longing: 1, defense: 1, cost: 1, turning: 2, overall: 2, love: 2, money: 2, work: 2 };
assert.deepEqual(Object.keys(CARD_PERSON_STORIES).sort(), plain(DECK.map(value => value.id).sort()));
for (const [field, count] of Object.entries(storySentenceCounts)) {
  const passages = Object.values(CARD_PERSON_STORIES).map(story => story[field]);
  assert.equal(new Set(passages).size, 78, `${field}: no two actual cards share a whole personal passage`);
  for (const value of DECK) {
    const story = getPersonStory(value.id);
    assert.deepEqual(Object.keys(story).sort(), Object.keys(storySentenceCounts).sort(), `${value.id}: all personal roles and topics are authored`);
    assert.equal(splitSummarySentences(story[field]).length, count, `${value.id}/${field}: complete authored sentence contract`);
    assert.match(story[field], /[.!?]$/u);
    assert.doesNotMatch(story[field], /[{}]|undefined|\[object Object\]|반드시\s*(성공|재회|합격)|확률\s*\d+%/u,
      `${value.id}/${field}: no unresolved slots or invented guarantees`);
  }
}
assert.throws(() => getPersonStory('made-up'), /actual_card/u);
assert.throws(() => getPersonStory('__proto__'), /actual_card/u);

const snapshot = JSON.stringify({ cards, context });
const report = buildCardConnections({ cards, context });
assert.equal(report.paragraphs.length, 3);
assert.ok(report.paragraphs.every(text => splitSummarySentences(text).length >= 3),
  'each connection explains a reason and an application in complete sentences');
assert.equal(JSON.stringify({ cards, context }), snapshot, 'the selected cards and context are unchanged');
assert.deepEqual(plain(report), plain(buildCardConnections({ cards, context })), 'the same inputs produce the same reading');
assert.deepEqual(plain(report.evidence.cards), cards.map(value => value.id));
assert.equal(report.evidence.pair, 'right-supports-left', 'the emperor boundary lens can address the fool preparation risk');
const combined = report.paragraphs.join(' ');
for (const [index, value] of cards.entries()) {
  const profile = getConnectionProfile(value.id);
  const story = getPersonStory(value.id);
  assert.ok(combined.includes(value.name));
  assert.deepEqual(plain(report.evidence.lenses[index]), { cardId: value.id, offer: profile.offer, excess: profile.excess, route: profile.route },
    'the original relationship lenses remain available as evidence');
  assert.ok(combined.includes(index === 1 ? story.defense : story.longing),
    'the body uses each actual card’s desire or defensive response, not only its abstract label');
  if (index === 2) {
    assert.ok(report.paragraphs[2].includes(story.overall) && report.paragraphs[2].includes(story.cost),
      'the next choice preserves the selected topic and the personal risk');
    assert.ok(!report.paragraphs[2].includes(story.turning), 'an unselected generic action is not inserted into the personal ending');
  }
  for (const field of ['support', 'tension', 'question']) assert.ok(!combined.includes(profile[field]), 'comparison and follow-up sentences are not copied into the connection');
}
assert.ok(combined.includes(context.concern) && combined.includes(context.boundary));
const differentContext = buildCardConnections({ cards, context: { concern: '처음 사업에 쓸 준비 비용', boundary: '생활비로 남겨 둘 금액' } });
assert.notDeepEqual(plain(differentContext.paragraphs), plain(report.paragraphs));

// A replacement within an old shared motion group must change the substance,
// even when the caller supplies the very same three display names.
assert.equal(CARD_INTERPRETATIONS.fool.motion, CARD_INTERPRETATIONS.magician.motion);
const sameNames = ['첫 카드', '둘째 카드', '셋째 카드'];
const sameMotionA = buildCardConnections({ cards, context, names: sameNames });
const sameMotionB = buildCardConnections({ cards: [card('magician'), ...cards.slice(1)], context, names: sameNames });
assert.notDeepEqual(plain(sameMotionA.paragraphs), plain(sameMotionB.paragraphs));
assert.ok(sameMotionB.paragraphs.join(' ').includes(getPersonStory('magician').longing));

// Exercise every identity in every position; stable display names prevent a
// changed name or metadata from being mistaken for different interpretation.
for (let position = 0; position < 3; position++) {
  const bodies = new Map();
  for (const candidate of DECK) {
    if (cards.some((value, index) => index !== position && value.id === candidate.id)) continue;
    const chosen = [...cards]; chosen[position] = candidate;
    const reading = buildCardConnections({ cards: chosen, context, names: sameNames });
    const body = reading.paragraphs.join(' '), story = getPersonStory(candidate.id);
    const rolePassage = position === 1 ? story.defense : story.longing;
    assert.ok(body.includes(rolePassage), `${candidate.id}: identity affects the personal meaning in position ${position}`);
    assert.ok(!bodies.has(body), `${candidate.id}: the complete prose differs from ${bodies.get(body)} with fixed names`);
    bodies.set(body, candidate.id);
  }
  assert.equal(bodies.size, 76);
}

// Actual situation passages must change even if labels, concern text and
// boundaries are identical; renaming a spread is not personal interpretation.
const crush = getPersonalContext('love', 'love-crush');
const distance = getPersonalContext('love', 'love-distance');
const contextA = { ...crush, concern: context.concern, boundary: context.boundary };
const contextB = { ...distance, concern: context.concern, boundary: context.boundary };
const situationA = buildPersonNarrative({ cards, context: contextA, names: sameNames });
const situationB = buildPersonNarrative({ cards, context: contextB, names: sameNames });
for (let index = 0; index < 2; index++) {
  assert.notEqual(situationA.paragraphs[index], situationB.paragraphs[index], 'the same cards read differently in two actual situations');
  assert.ok(situationA.paragraphs[index].includes(splitSummarySentences(crush.cards[cards[index].id])[0]));
  assert.ok(situationB.paragraphs[index].includes(splitSummarySentences(distance.cards[cards[index].id])[0]));
}
const loveStory = buildPersonNarrative({ cards, topicId: 'love', names: sameNames });
const workStory = buildPersonNarrative({ cards, topicId: 'work', names: sameNames });
for (let index = 0; index < 3; index++) assert.notEqual(loveStory.paragraphs[index], workStory.paragraphs[index],
  'topic changes the substance in every card position even without a situation selection');
assert.notDeepEqual(plain(buildPersonNarrative({ cards: [...cards].reverse(), names: sameNames }).paragraphs),
  plain(buildPersonNarrative({ cards, names: sameNames }).paragraphs), 'ordered identities, not display names, determine the story');

for (const [key, passage] of Object.entries(PERSON_PAIR_READINGS)) {
  const parts = key.split(':');
  const ids = parts.slice(0, 2);
  assert.ok(parts.length === 2 || parts.length === 3);
  if (parts[2]) assert.ok(['overall', 'love', 'money', 'work'].includes(parts[2]));
  assert.notEqual(ids[0], ids[1]);
  assert.ok(ids.every(id => Object.hasOwn(CARD_PERSON_STORIES, id)), `${key}: authored pairs use real cards`);
  const third = DECK.find(value => !ids.includes(value.id));
  const paired = buildPersonNarrative({ cards: [...ids.map(card), third], topicId: parts[2] || 'work', names: sameNames });
  assert.equal(paired.evidence.authoredPair, true);
  assert.ok(paired.paragraphs[1].includes(passage), `${key}: the full authored contrast participates in the actual reading`);
  if (parts[2]) for (const otherTopic of ['overall', 'love', 'money', 'work'].filter(topic => topic !== parts[2])) {
    const unrelated = buildPersonNarrative({ cards: [...ids.map(card), third], topicId: otherTopic, names: sameNames });
    assert.ok(!unrelated.paragraphs.join(' ').includes(passage), `${key}: topic-specific pair prose never leaks into ${otherTopic}`);
  }
}
const spendingCards = ['devil', 'pentacles_four', 'temperance'].map(card);
const spending = buildPersonNarrative({ cards: spendingCards, topicId: 'money' });
const affection = buildPersonNarrative({ cards: spendingCards, topicId: 'love' });
assert.ok(spending.paragraphs[1].includes(PERSON_PAIR_READINGS['devil:pentacles_four:money']));
assert.ok(!affection.paragraphs[1].includes(PERSON_PAIR_READINGS['devil:pentacles_four:money']),
  'a spending-specific conflict is never inserted into a relationship reading');
assert.ok(!spending.paragraphs.join(' ').includes('두 카드의 장점은 서로 부족한 부분을 채워 줘'),
  'matching advice categories never imply two harmful defensive habits should reinforce each other');
const contrasting = buildPersonNarrative({ cards: ['swords_knight', 'swords_two', 'pentacles_three'].map(card), topicId: 'work' });
assert.ok(contrasting.paragraphs[1].includes(PERSON_PAIR_READINGS['swords_knight:swords_two']));
assert.ok(contrasting.paragraphs[2].includes(getPersonStory('pentacles_three').work),
  'the third card answers the ordered tension through its complete work-specific personal meaning');
assert.ok(!contrasting.paragraphs[2].includes(getPersonStory('pentacles_three').turning),
  'the main story does not insert a second instruction before the topic-specific solution');
const unpaired = buildPersonNarrative({ cards: ['fool', 'justice', 'pentacles_king'].map(card), topicId: 'money' });
assert.equal(unpaired.evidence.authoredPair, false);
assert.ok(unpaired.paragraphs[1].includes(getPersonStory('justice').cost),
  'a pair without a special passage retains the second actual card’s personal difficulty');
assert.doesNotMatch(unpaired.paragraphs.join(' '), /두 카드의 장점은 서로 부족한 부분을 채워 줘|두 번째 카드가 짚는 부담까지 함께 읽어야|처음 카드가 보여 준 바람만으로는 지금의 마음을 다 설명할 수 없어/u,
  'fallback prose does not invent compatibility or repeat instructions about how to read the cards');
assert.ok(unpaired.paragraphs[2].includes(getPersonStory('pentacles_king').money));
assert.ok(!unpaired.paragraphs[2].includes(getPersonStory('pentacles_king').turning),
  'the money reading never borrows a generic instruction about delegating work');
assert.notDeepEqual(plain(contrasting.paragraphs), plain(buildPersonNarrative({
  cards: ['swords_two', 'swords_knight', 'pentacles_three'].map(card), topicId: 'work'
}).paragraphs), 'reversing the first two cards changes their story rather than only their captions');

for (const invalidCards of [[], cards.slice(0, 2), [cards[0], cards[0], cards[2]], [{ id: 'made-up', name: '가상' }, ...cards.slice(1)], [{ id: '__proto__', name: '가상' }, ...cards.slice(1)]]) {
  assert.throws(() => buildCardConnections({ cards: invalidCards, context }), /three_actual_cards/u);
  assert.throws(() => buildPersonNarrative({ cards: invalidCards }), /actual_card/u);
}
assert.throws(() => buildCardConnections({ cards, context: { concern: '질문' } }), /require_context/u);
assert.throws(() => buildCardConnections({ cards, context, names: ['한 장'] }), /three_names/u);
assert.throws(() => buildPersonNarrative({ cards, topicId: 'invented' }), /requires_topic/u);
assert.throws(() => buildPersonNarrative({ cards, names: ['한 장'] }), /three_names/u);

// Reusable editorial fixtures: changed wording with the same action and target
// should be a candidate, while a changed target or direction must remain apart.
const PARAPHRASE_FIXTURES = [
  ['지출 내역을 적어 두고 고정비와 변동비를 구분해 보렴.', '쓴 돈의 목록을 메모하고 정기 비용과 수시 지출을 나눠 봐.'],
  ['연락 횟수를 확인해 보렴.', '메시지 빈도를 점검해 봐.'],
  ['약속한 시간을 살펴보고 일정을 메모해 보렴.', '약속 시각을 확인하고 일정을 기록해 봐.']
];
const DISTINCT_FIXTURES = [
  ['약속한 시간을 확인해 보렴.', '약속한 금액을 확인해 보렴.', 'different-or-unrecognized-object'],
  ['연락 횟수를 늘려 봐.', '메시지 빈도를 줄여 봐.', 'opposite-actions'],
  ['지출 내역을 기록해 보렴.', '지출 내역을 기록하지 말아 봐.', 'different-polarity'],
  ['지출 내역을 기록해 보렴.', '지출 내역은 안 기록해도 돼.', 'different-polarity'],
  ['생활 약속을 유지해 보렴.', '생활 약속을 중단해 보렴.', 'opposite-actions'],
  ['연락을 보내 봐.', '연락을 기다려 봐.', 'opposite-actions']
];
for (const [a, b] of PARAPHRASE_FIXTURES) {
  assert.ok(compareGuidance(a, b).candidate, `paraphrase review candidate: ${a}`);
  assert.deepEqual(compareGuidance(a, b), compareGuidance(b, a), 'pair order does not change review judgment');
}
for (const [a, b, reason] of DISTINCT_FIXTURES) {
  assert.equal(compareGuidance(a, b).candidate, false, `${reason}: ${a}`);
  assert.equal(compareGuidance(a, b).reason, reason);
}
assert.ok(!semanticSignature('감정을 인정해 보렴.').keys.some(key => key.startsWith('정함:')), '인정 is not confused with 정하기');
assert.ok(semanticSignature('감정을 인정해 보렴.').keys.includes('수용:감정:positive'));
assert.deepEqual(semanticSignature('약속한 금액을 확인해 보렴.').objects, ['약속금액'], 'compound object keeps money separate from time');
const fixtureRecords = PARAPHRASE_FIXTURES[0].map((text, index) => ({ id: `fixture:${index}`, text }));
fixtureRecords.push({ id: 'fixture:distinct', text: DISTINCT_FIXTURES[0][0] });
const found = findNearGuidance(fixtureRecords);
assert.equal(found.candidateCount, 1);
assert.equal(found.candidates[0].a, 'fixture:0');
assert.equal(found.candidates[0].b, 'fixture:1');
assert.deepEqual(found, findNearGuidance(fixtureRecords), 'the read-only review queue is stable');
assert.equal(findNearGuidance(fixtureRecords, { limit: 0 }).candidates.length, 0);

const audit = auditGuidance({ limit: 4 });
assert.equal(audit.casePairs, 3900, 'all existing 78 × 50 insight/action pairs were read');
assert.deepEqual(audit.issues, []);
assert.ok(audit.recognizedRecords < audit.records, 'the report distinguishes recognized guidance from total corpus coverage');
assert.match(audit.limitation, /can be missed/u);
assert.match(audit.limitation, /No source is changed/u);
assert.ok(audit.candidates.every(candidate => candidate.a && candidate.b && candidate.textA && candidate.textB));

console.log(`tarot guidance quality: 78 complete personal stories, 228 fixed-name position checks, actual topic/context and ordered pair contrasts; ${audit.casePairs} existing pairs and ${audit.personalCards} personal card texts inspected, ${audit.candidateCount} editorial review candidates`);
module.exports = { PARAPHRASE_FIXTURES, DISTINCT_FIXTURES };
