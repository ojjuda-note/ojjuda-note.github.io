const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');

const load = createTarotLoader();
const { narrateReading, narrateSummary } = load('narration.js');
const { DECK, POSITIONS, getReading, getSummary } = load('readings.js');
const { CARD_FOUNDATIONS } = load('card-foundations.js');
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
      assert.ok(result.paragraphs.length >= 6 && result.paragraphs.length <= 8);
      assert.match(result.introduction, new RegExp(POSITIONS[index].label));
      assert.ok(result.introduction.includes(card.name), `${card.id} retains its canonical name`);
      assert.ok(result.introduction.includes(result.displayName));
      assert.ok(!result.paragraphs.includes(result.introduction), 'the standalone introduction is not duplicated');
      assert.ok(result.text.startsWith(result.introduction));
      for (const fact of [input.foundation.symbol, input.guidance.meaning, input.guidance.positions[index],
        card.topics[topic], input.detail.example, input.detail.action, input.foundation.caution]) {
        assert.ok(result.text.includes(fact), `${card.id}/${topic}/${index} preserves an authored explanation`);
      }
      assert.equal(result.action, input.detail.action);
      assert.equal(result.summary, input.foundation.takeaway);
      assert.equal(result.detailSections, input.base.sections);
      assert.equal(result.reference, input.base.reference);
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
  for (let i = 0; i < 3; i++) {
    assert.ok(summary.paragraphs[i].includes(cards[i].name));
    assert.ok(summary.paragraphs[i].includes(readings[i].meaning));
    assert.ok(summary.paragraphs[i].includes(readings[i].positionMeaning));
    assert.ok(summary.paragraphs[i].includes(readings[i].topicMeaning));
    assert.ok(summary.text.includes(cards[i].name));
  }
  assert.ok(summary.synthesis.includes(input.innerMeaning));
  assert.ok(summary.synthesis.includes(input.flowMeaning));
  assert.ok(summary.synthesis.includes(input.direction));
  assert.ok(summary.synthesis.includes(readings[2].example));
  assert.equal(summary.summary, summary.synthesis);
  assert.equal(summary.ritual, cards[2].details[topicId].action);
  assert.ok(!summary.paragraphs.includes(summary.synthesis));
  assert.ok(!summary.paragraphs.includes(summary.ritual));
  assert.ok(summary.oneLine.includes(readings[0].theme.split(' · ')[0]));
  assert.ok(summary.oneLine.includes(readings[1].theme.split(' · ')[0]));
  assert.ok(summary.oneLine.includes(summary.ritual.split('.')[0]));
  assert.ok(summary.detailSections.some(section => section.body === base.summary));
  assert.deepEqual(plain(summary), plain(narrateSummary(input)));
  const reversedCards = [...cards].reverse();
  const reversedReadings = reversedCards.map((card, index) => readingFor(card, topicId, index).result);
  const reversed = narrateSummary({ ...input, cards: reversedCards, readings: reversedReadings,
    innerMeaning: reversedCards[0].spread.inner, direction: reversedCards[2].spread.direction });
  assert.notEqual(reversed.text, summary.text, 'actual order changes the explanation and action');
  assert.equal(reversed.ritual, reversedCards[2].details[topicId].action);
}

// The integrated entry points must provide the same accessible structure for
// all 78 cards, including the major cards authored inside readings.js.
for (const card of DECK) for (const topic of topics) for (let index = 0; index < 3; index++) {
  const reading = getReading(card, topic, index);
  assert.ok(reading.introduction.includes(POSITIONS[index].label));
  assert.ok(reading.introduction.includes(card.name));
  assert.ok(reading.paragraphs.length >= 6);
  assert.ok(reading.text.includes(reading.action));
}
const actual = getSummary(['swords_knight', 'priestess', 'pentacles_three'], 'work');
assert.equal(actual.summary, actual.synthesis);
assert.equal(actual.ritual, getReading('pentacles_three', 'work', 2).action);
assert.ok(actual.text.includes('소드 기사'));
assert.ok(actual.text.includes('여사제'));
assert.ok(actual.text.includes('펜타클 3'));
assert.ok(!actual.paragraphs[2].includes('’야.'), 'numbered card names use particle-safe introductions');

assert.throws(() => narrateReading({}), /requires_authored_card_meanings/);
assert.throws(() => narrateSummary({ cards: cards.slice(0, 2), readings: [], topicId: 'work' }), /requires_three_ordered_readings/);
assert.throws(() => narrateSummary({ cards: [cards[0], cards[0], cards[2]], readings: [], topicId: 'work' }), /requires_three_ordered_readings/);
console.log('PASS tarot narration: plain names, ordered positions, all authored minor-card meanings, examples/actions, deterministic actual-card synthesis and retained source metadata');
