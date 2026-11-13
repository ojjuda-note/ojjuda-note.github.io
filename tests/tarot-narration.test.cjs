const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');

const load = createTarotLoader();
const { narrateReading, narrateSummary } = load('narration.js');
const { DECK, POSITIONS, getReading, getSummary } = load('readings.js');
const { CARD_FOUNDATIONS } = load('card-foundations.js');
const { CARD_LIFE_THEMES } = load('life-themes.js');
const { CARD_INTERPRETATIONS } = load('interpretation-engine.js');
const { directInterpretation, directAction } = load('reading-voice.js');
const plain = value => JSON.parse(JSON.stringify(value));
const topics = ['overall', 'love', 'money', 'work'];
const cards = ['swords_knight', 'swords_two', 'pentacles_three'].map(id => DECK.find(card => card.id === id));

function readingFor(card, topicId, index) {
  const base = { title: `${POSITIONS[index].label} · ${card.name}`, sections: [
    { title: '원래 풀이', body: card.guidance.meaning }
  ], reference: { label: '보존할 출처', url: 'https://en.wikisource.org/wiki/The_Pictorial_Key_to_the_Tarot/Part_3' } };
  const input = { card, topicId, index, position: POSITIONS[index], foundation: CARD_FOUNDATIONS[card.id],
    guidance: card.guidance, detail: card.details[topicId], base };
  return { result: narrateReading(input), input };
}

for (const card of DECK.filter(card => card.arcana === 'minor')) {
  for (const topic of topics) {
    for (let index = 0; index < 3; index++) {
      const { result, input } = readingFor(card, topic, index);
      assert.ok(result.paragraphs.length >= 5 && result.paragraphs.length <= 7, 'each paragraph has information to add without seven repeated prefaces');
      assert.match(result.introduction, new RegExp(POSITIONS[index].label));
      assert.ok(result.introduction.includes(card.name), `${card.id} retains its canonical name`);
      assert.ok(result.introduction.includes(result.displayName));
      assert.ok(!result.paragraphs.includes(result.introduction), 'the standalone introduction is not duplicated');
      assert.ok(result.text.startsWith(result.introduction));
      for (const fact of [input.foundation.symbol, directInterpretation(card.topics[topic]), input.detail.example, input.foundation.caution]) {
        assert.ok(result.text.includes(fact), `${card.id}/${topic}/${index} preserves an authored explanation`);
      }
      assert.equal(result.action, directAction(input.detail.action), 'shown advice uses the actual authored action in the direct voice');
      assert.equal(result.summary, CARD_INTERPRETATIONS[card.id].meaning);
      assert.equal(result.traditionalMeaning, input.guidance.meaning, 'the original source interpretation is preserved separately');
      assert.equal(result.foundationTakeaway, input.foundation.takeaway);
      assert.doesNotMatch(result.text, /먼저 전통 타로 그림을 바탕으로 이 카드를 살펴보자|그 모습에 담긴 뜻을 조금 더 풀어보면 이래|그렇다면 무엇부터 해 보면 좋을까/);
      assert.equal(result.detailSections, input.base.sections);
      assert.equal(result.reference, input.base.reference);
      assert.deepEqual(plain(result.lifeTheme), Object.fromEntries(Object.entries(CARD_LIFE_THEMES[card.id]).map(([field, value]) => [field, directInterpretation(value)])));
      assert.equal(result.positionMeaning, directInterpretation(input.guidance.positions[index === 1 ? 0 : index]));
      assert.ok(result.text.includes(result.positionMeaning), 'the individual reading explains this position in the card itself');
      assert.ok(result.appliedMeaning.length > 60 && !result.text.includes(result.appliedMeaning), 'the detailed situation application is reserved for the combined view');
      assert.ok(!result.text.includes(result.action), 'the practical action is retained for the combined reading and full source, not copied into both views');
      assert.deepEqual(plain(result), plain(narrateReading(input)), 'same card/topic/position is deterministic');
    }
  }
}

assert.equal(readingFor(cards[0], 'work', 0).result.displayName, '검을 든 기사');
assert.equal(readingFor(DECK.find(card => card.id === 'cups_two'), 'love', 0).result.displayName, '잔 2');
assert.equal(readingFor(cards[2], 'work', 2).result.displayName, '동전 3');
assert.equal(readingFor(DECK.find(card => card.id === 'wands_ace'), 'work', 0).result.displayName, '지팡이 1');

for (const topicId of topics) {
  const readings = cards.map((card, index) => readingFor(card, topicId, index).result);
  const source = Object.freeze({ version: 'authored-test', recordId: `${topicId}:803`, pattern: '803', cards: cards.map(card => card.id) });
  const base = { oneLine: '공통 원문의 한마디', summary: '공통 원문의 본문', sections: [{ title: '기존 근거', body: '보존할 내용' }], ritual: '공통 원문의 제안', source };
  const input = { cards, topicId, readings, innerMeaning: cards[0].spread.inner, flowMeaning: cards[1].spread.opening, direction: cards[2].spread.direction, base };
  const summary = narrateSummary(input);
  assert.equal(summary.source, source, 'original record metadata is preserved without new counts');
  assert.equal(summary.paragraphs.length, 3);
  assert.deepEqual(plain(summary.groups.map(group => [group.id, group.label])), [
    ['problem', '문제 해결'], ['timeline', '과거·현재·미래'], ['domains', '분야별 풀이']
  ]);
  assert.equal(summary.groups[0].sections.length, 5);
  assert.equal(summary.groups[0].sections.find(section => section.id === 'possible-outcome').title, '대처 뒤 확인할 변화');
  assert.equal(summary.groups[1].sections.length, 7);
  assert.equal(summary.groups[2].sections.length, 50);
  assert.equal(summary.sections.length, 62);
  for (const group of summary.groups) {
    assert.equal(new Set(group.sections.map(section => section.id)).size, group.sections.length);
    for (const section of group.sections) {
      assert.ok(section.title);
      assert.ok(section.paragraphs.length >= 2, `${group.id}/${section.id} is a developed explanation`);
      assert.ok(section.paragraphs.every(paragraph => typeof paragraph === 'string' && paragraph.length >= 50));
      assert.ok(!section.paragraphs.join(' ').includes(summary.ritual), 'full practical action is reserved for the single final ritual');
    }
  }
  const timeline = summary.groups[1].sections;
  for (const reading of readings) assert.ok(timeline[0].paragraphs.join(' ').includes(reading.lifeTheme.strength));
  assert.ok(timeline[1].paragraphs.join(' ').includes(readings[0].lifeTheme.past));
  assert.ok(timeline[2].paragraphs.join(' ').includes(readings[0].guidanceCaution));
  assert.ok(timeline[2].paragraphs.join(' ').includes(readings[0].action));
  assert.ok(timeline[3].paragraphs.join(' ').includes(readings[0].lifeTheme.achievement));
  assert.ok(timeline[4].paragraphs.join(' ').includes(readings[1].guidanceCaution));
  assert.ok(timeline[4].paragraphs.join(' ').includes(readings[1].action));
  assert.ok(timeline[5].paragraphs.join(' ').includes(readings[2].lifeTheme.change));
  assert.ok(timeline[6].paragraphs.join(' ').includes(readings[2].guidanceCaution));
  assert.equal(summary.text.split(summary.ritual).length - 1, 1, 'full ritual is copied exactly once');

  for (let i = 0; i < 3; i++) {
    assert.ok(summary.paragraphs[i].includes(cards[i].name));
    assert.ok(summary.paragraphs[i].length > 150, 'each role has a developed application, beyond the card label');
    assert.ok(summary.synthesis.includes(readings[i].theme), 'the synthesis explains how the actual card themes connect');
    assert.ok(summary.text.includes(cards[i].name));
  }
  assert.ok(summary.text.includes(input.innerMeaning));
  assert.ok(summary.text.includes(input.flowMeaning), "the second card's specific unfolding theme now participates in the reading");
  assert.ok(summary.synthesis.includes(readings[1].theme.split(' · ')[0]));
  assert.ok(summary.text.includes(directAction(input.direction)));
  for (const reading of readings) {
    for (const detail of [reading.example, reading.topicMeaning, reading.foundationCaution, reading.positionMeaning]) {
      assert.ok(!summary.text.includes(detail), 'the individual card explanation is not copied into another tab');
    }
    assert.equal(summary.text.split(reading.action).length - 1, 1, 'each actual card action is offered once in the combined reading');
  }
  for (const detail of [readings[0].lifeTheme.strength, readings[2].lifeTheme.change]) {
    assert.equal(summary.text.split(detail).length - 1, 1, 'each life explanation is used once instead of copied through several sections');
  }
  assert.equal(summary.summary, summary.synthesis);
  assert.equal(summary.ritual, directAction(cards[2].details[topicId].action));
  assert.ok(!summary.paragraphs.includes(summary.synthesis));
  assert.ok(!summary.paragraphs.includes(summary.ritual));
  assert.ok(summary.oneLine.includes(readings[0].theme.split(' · ')[0]));
  assert.ok(summary.oneLine.includes(readings[1].theme.split(' · ')[0]));
  assert.ok(summary.oneLine.includes(readings[2].theme.split(' · ')[0]));
  assert.ok(!summary.oneLine.includes(summary.ritual.split('.')[0]), 'the short overview does not repeat the closing action');
  assert.ok(summary.detailSections.some(section => section.body === base.summary));
  assert.deepEqual(plain(summary), plain(narrateSummary(input)));
  const reversedCards = [...cards].reverse();
  const reversedReadings = reversedCards.map((card, index) => readingFor(card, topicId, index).result);
  const reversed = narrateSummary({ ...input, cards: reversedCards, readings: reversedReadings,
    innerMeaning: reversedCards[0].spread.inner, direction: reversedCards[2].spread.direction });
  assert.notEqual(reversed.text, summary.text, 'actual order changes the explanation and action');
  assert.equal(reversed.ritual, directAction(reversedCards[2].details[topicId].action));
}

// The integrated entry points must provide the same accessible structure for
// all 78 cards, including the major cards authored inside readings.js.
for (const card of DECK) for (const topic of topics) for (let index = 0; index < 3; index++) {
  const reading = getReading(card, topic, index);
  assert.ok(reading.introduction.includes(POSITIONS[index].label));
  assert.ok(reading.introduction.includes(card.name));
  assert.ok(reading.paragraphs.length >= 5);
  assert.ok(JSON.stringify(reading.detailSections).includes(reading.traditionalMeaning), 'the complete original interpretation remains accessible in source details');
  const sourcePractice = reading.detailSections.find(section => section.title === '생활 속 예시와 해 볼 일');
  assert.ok(sourcePractice.body.startsWith(reading.example), 'the original hypothetical example remains in source details');
  const sourceAction = [sourcePractice.subtitle, sourcePractice.body.slice(reading.example.length).trim()].filter(Boolean).join(' ');
  assert.equal(reading.action, directAction(sourceAction), 'shown advice is derived from the complete action preserved in source details');
  if (card.details) assert.equal(sourceAction, card.details[topic].action, 'the raw authored action is preserved byte-for-byte');
}
assert.deepEqual(plain(POSITIONS.map(position => position.label)), ['지금의 문제', '현재 상황', '해결 방법과 결과']);
assert.equal(Object.keys(CARD_LIFE_THEMES).length, DECK.length);
for (let index = 0; index < DECK.length; index++) for (const topic of topics) {
  const ordered = [DECK[index], DECK[(index + 1) % DECK.length], DECK[(index + 2) % DECK.length]];
  const report = getSummary(ordered, topic);
  assert.equal(report.groups.length, 3);
  assert.equal(report.groups[0].sections.length, 5);
  assert.equal(report.groups[1].sections.length, 7);
  assert.equal(report.groups[2].sections.length, 50);
  assert.deepEqual(plain(report.source.cards), ordered.map(card => card.id));
  for (const card of ordered) assert.ok(report.text.includes(card.name));
  assert.equal(report.ritual, getReading(ordered[2], topic, 2).action);
  assert.equal(report.text.split(report.ritual).length - 1, 1);
}
const actual = getSummary(['swords_knight', 'priestess', 'pentacles_three'], 'work');
assert.equal(actual.summary, actual.synthesis);
assert.equal(actual.ritual, getReading('pentacles_three', 'work', 2).action);
assert.ok(actual.text.includes('소드 기사'));
assert.ok(actual.text.includes('여사제'));
assert.ok(actual.text.includes('펜타클 3'));
assert.ok(!actual.paragraphs[2].includes('’야.'), 'numbered card names use particle-safe introductions');
const advancing = getSummary(['fool', 'magician', 'chariot'], 'work');
const bridgeSentences = advancing.synthesis.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean);
assert.equal(new Set(bridgeSentences).size, bridgeSentences.length, 'two consecutive connections do not repeat the same advice even when all cards share one motion');

assert.throws(() => narrateReading({}), /requires_authored_card_meanings/);
assert.throws(() => narrateSummary({ cards: cards.slice(0, 2), readings: [], topicId: 'work' }), /requires_three_ordered_readings/);
assert.throws(() => narrateSummary({ cards: [cards[0], cards[0], cards[2]], readings: [], topicId: 'work' }), /requires_three_ordered_readings/);
console.log('PASS tarot narration: detailed card meanings, separate situation and action views, unique card connections, no copied examples or closing action, full source explanations and stable replay');
