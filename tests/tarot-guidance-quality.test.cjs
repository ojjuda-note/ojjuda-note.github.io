const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');
const { semanticSignature, compareGuidance, findNearGuidance, auditGuidance } = require('../scripts/audit-tarot-guidance.cjs');

const load = createTarotLoader();
const { DECK } = load('readings.js');
const { CONNECTION_PROFILES } = load('connection-profiles.js');
const { buildCardConnections, getConnectionProfile } = load('card-connections.js');
const { CARD_INTERPRETATIONS } = load('interpretation-engine.js');
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
for (const value of cards) {
  const profile = getConnectionProfile(value.id);
  assert.ok(combined.includes(value.name));
  assert.ok(combined.includes(profile.offer));
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
assert.ok(sameMotionB.paragraphs.join(' ').includes(getConnectionProfile('magician').offer));

// Exercise every identity in every position; stable display names prevent a
// changed name or metadata from being mistaken for different interpretation.
for (let position = 0; position < 3; position++) {
  const bodies = new Map();
  for (const candidate of DECK) {
    if (cards.some((value, index) => index !== position && value.id === candidate.id)) continue;
    const chosen = [...cards]; chosen[position] = candidate;
    const reading = buildCardConnections({ cards: chosen, context, names: sameNames });
    const body = reading.paragraphs.join(' '), profile = getConnectionProfile(candidate.id);
    assert.ok(body.includes(profile.offer), `${candidate.id}: identity affects position ${position}`);
    if (position < 2) assert.ok(body.includes(profile.excess), `${candidate.id}: distinct pair risk`);
    else assert.ok(body.includes(profile.route), `${candidate.id}: distinct response method`);
    assert.ok(!bodies.has(body), `${candidate.id}: the complete prose differs from ${bodies.get(body)} with fixed names`);
    bodies.set(body, candidate.id);
  }
  assert.equal(bodies.size, 76);
}
for (const invalidCards of [[], cards.slice(0, 2), [cards[0], cards[0], cards[2]], [{ id: 'made-up', name: '가상' }, ...cards.slice(1)], [{ id: '__proto__', name: '가상' }, ...cards.slice(1)]]) {
  assert.throws(() => buildCardConnections({ cards: invalidCards, context }), /three_actual_cards/u);
}
assert.throws(() => buildCardConnections({ cards, context: { concern: '질문' } }), /require_context/u);
assert.throws(() => buildCardConnections({ cards, context, names: ['한 장'] }), /three_names/u);

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

console.log(`tarot guidance quality: 78 profiles, 228 fixed-name position checks, semantic fixtures; ${audit.casePairs} existing pairs and ${audit.personalCards} personal card texts inspected, ${audit.candidateCount} editorial review candidates`);
module.exports = { PARAPHRASE_FIXTURES, DISTINCT_FIXTURES };
