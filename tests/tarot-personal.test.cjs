const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');
const load = createTarotLoader();
const { DECK } = load('readings.js');
const { PERSONAL_CONTEXTS, listPersonalContexts, getPersonalContext } = load('personal-contexts.js');
const { buildPersonalReading, personalReadingCopyLines, PERSONAL_BASIS } = load('personal-reading.js');
const { buildPersonNarrative } = load('person-narrative.js');
const { PERSON_PAIR_READINGS } = load('person-pair-readings.js');
const { directCardAdvice, directAction } = load('reading-voice.js');
const { getPersonStory } = load('person-stories.js');
const { getCardInterpretation } = load('interpretation-engine.js');
const { getConnectionProfile } = load('connection-profiles.js');
const { splitSummarySentences } = load('reading-summary.js');
const plain = value => JSON.parse(JSON.stringify(value));
const normalize = value => value.replace(/[\s\p{P}]/gu, '');

assert.equal(PERSONAL_CONTEXTS.length, 15);
assert.equal(new Set(PERSONAL_CONTEXTS.map(item => item.id)).size, 15);
for (const [topic, count] of [['overall', 15], ['love', 5], ['money', 3], ['work', 4]]) {
  const contexts = listPersonalContexts(topic);
  assert.equal(contexts.length, count);
  assert.ok(contexts.every(item => topic === 'overall' || item.topicId === topic));
}
assert.throws(() => listPersonalContexts('unknown'), /unknown_topic/);
assert.throws(() => getPersonalContext('love', 'money-saving'), /context_mismatch/);
assert.throws(() => getPersonalContext('work', '__proto__'), /context_mismatch/);
assert.throws(() => getPersonalContext('overall', 'made-up'), /context_mismatch/);

const authored = new Map();
const questions = new Set();
const cardIds = DECK.map(card => card.id).sort();
for (const context of PERSONAL_CONTEXTS) {
  assert.equal(getPersonalContext(context.topicId, context.id), context);
  assert.deepEqual(Object.keys(context.cards).sort(), plain(cardIds), context.id + ': all actual cards have dedicated guidance');
  assert.ok(Object.isFrozen(context) && Object.isFrozen(context.cards));
  for (const field of ['label', 'question', 'example', 'concern', 'boundary']) assert.ok(context[field]?.trim(), context.id + ': ' + field);
  assert.match(context.example, /예를|가령|예시|상상|떠올려/);
  for (const [id, paragraph] of Object.entries(context.cards)) {
    assert.ok(paragraph.length >= 50 && paragraph.length < 500, context.id + '/' + id + ': concrete explanation and practical step');
    const key = normalize(paragraph);
    assert.ok(!authored.has(key), `${context.id}/${id} duplicates ${authored.get(key)}`);
    authored.set(key, context.id + '/' + id);
    assert.doesNotMatch(paragraph, /undefined|\[object Object\]|반드시\s*(성공|재회|합격)|확률\s*\d+%/);
  }
  assert.notEqual(context.comparison.a.label, context.comparison.b.label);
  for (const option of [context.comparison.a, context.comparison.b]) {
    for (const field of ['gain', 'burden', 'prepare']) assert.ok(option[field].length >= 30, context.id + ': meaningful choice ' + field);
  }
  assert.equal(context.followUps.length, 3);
  assert.equal(new Set(context.followUps.map(item => item.id)).size, 3);
  for (const followUp of context.followUps) {
    assert.ok(!questions.has(followUp.question), context.id + ': unique question');
    questions.add(followUp.question);
    assert.equal(followUp.paragraphs.length, 2);
    assert.ok(followUp.paragraphs.every(paragraph => paragraph.length >= 45));
  }
  // Cover each card at each role; pair and third card still come from the real deck.
  for (let start = 0; start < DECK.length; start++) {
    const cards = [DECK[start], DECK[(start + 19) % 78], DECK[(start + 43) % 78]];
    const report = buildPersonalReading({ cards, topicId: context.topicId, contextId: context.id });
    assert.deepEqual(plain(report.cards), plain(cards.map(card => card.id)));
    assert.equal(report.primary.length, 3);
    for (const [index, card] of cards.entries()) {
      const section = report.primary[index];
      const meaning = getCardInterpretation(card.id).meaning;
      const [insight, ...actions] = splitSummarySentences(directCardAdvice(context.cards[card.id]));
      assert.equal(section.paragraphs.length, 2, 'card meaning and its situation action have separate paragraphs');
      assert.ok(section.paragraphs[0].includes(meaning), 'every position preserves the actual card meaning before applying it to a person');
      assert.ok(section.paragraphs[0].includes(insight), 'the complete situation insight remains available');
      assert.ok(section.paragraphs[0].indexOf(meaning) < section.paragraphs[0].indexOf(insight),
        'the card’s own meaning, including a positive strength, comes before the situation application');
      assert.equal(section.paragraphs[1], actions.join(' '), 'the selected situation supplies the action, without an unrelated common cost');
      for (const action of actions) {
        assert.ok(section.paragraphs[1].includes(action), 'every original action sentence remains complete in the second paragraph');
        assert.ok(!section.paragraphs[0].includes(action), 'the explanation is not interrupted by its practical instruction');
      }
      assert.ok(section.paragraphs.join(' ').includes(card.name));
      assert.deepEqual(plain(report.followUps[index].paragraphs),
        [context.followUps[index].paragraphs[0], directAction(context.followUps[index].paragraphs[1])],
        'follow-ups keep their complete situation advice without appending an unrelated generic card question');
    }
    assert.equal(report.connection.paragraphs.length, 3);
    const last = cards[2], lastPerson = getPersonStory(last.id);
    const [lastInsight, lastAction] = splitSummarySentences(context.cards[last.id]);
    const ending = report.connection.paragraphs[2];
    assert.ok(ending.includes(lastInsight), 'every connected ending keeps the complete selected situation insight');
    assert.ok(ending.includes(splitSummarySentences(getCardInterpretation(last.id).meaning)[0]),
      'the next choice retains the real third card meaning');
    assert.ok(ending.includes(lastAction), 'the connected explanation ends with its complete situation action even when the card detail is closed');
    assert.ok(report.connection.summaryLines[1].endsWith(lastAction),
      'the connection preview retains the complete original action, including any condition');
    const renderedAction = splitSummarySentences(directCardAdvice(context.cards[last.id]))[1];
    assert.equal(personalReadingCopyLines(report).join('\n').split(renderedAction).length - 1,
      renderedAction === lastAction ? 2 : 1,
      'the third card’s action remains in its detail and, as the original complete sentence, in the combined conclusion');
    assert.ok(!ending.includes(lastPerson.turning), 'a context-specific ending does not borrow a generic action from another domain');
    assert.ok(report.comparison.basis.includes(cards[2].name));
    assert.ok(report.comparison.basis.includes(lastPerson[context.topicId]),
      'the choice criterion and its burden stay in the selected topic');
    assert.deepEqual(plain(report.comparison.options.map(option => option.label)), [context.comparison.a.label, context.comparison.b.label]);
  }
}
assert.equal(authored.size, 1170);
assert.equal(questions.size, 45);

// A money question must not acquire an invented relationship conflict from
// the common Temperance portrait, comparison lens, or follow-up question.
const cardById = id => DECK.find(card => card.id === id);
const spendingCards = ['devil', 'pentacles_four', 'temperance'].map(cardById);
const spending = buildPersonalReading({ cards: spendingCards, topicId: 'money', contextId: 'money-spending' });
const spendingCopy = personalReadingCopyLines(spending).join('\n');
const temperance = getPersonStory('temperance'), temperanceLens = getConnectionProfile('temperance');
for (const unrelated of [temperance.longing, temperance.defense, temperance.cost,
  temperanceLens.support, temperanceLens.tension, temperanceLens.question]) {
  assert.ok(!spendingCopy.includes(unrelated), 'consumer advice never borrows a relationship conflict or role-sharing question');
}
for (const sentence of splitSummarySentences(getPersonalContext('money', 'money-spending').cards.temperance)) {
  assert.ok(spendingCopy.includes(sentence), 'the concrete purchasing insight and complete action both remain available');
}
assert.ok(spending.comparison.basis.includes(temperance.money));

const positiveCards = ['sun', 'cups_two', 'world'].map(cardById);
const positive = buildPersonalReading({ cards: positiveCards, topicId: 'love', contextId: 'love-dating' });
for (const [index, card] of positiveCards.entries()) {
  const section = positive.primary[index];
  const meaning = getCardInterpretation(card.id).meaning;
  assert.ok(section.paragraphs[0].includes(meaning), `${card.id}: joy, reciprocity and completion keep their full meanings`);
  assert.ok(!section.paragraphs.join(' ').includes(getPersonStory(card.id).cost),
    `${card.id}: a positive card is not automatically followed by its generic defensive cost`);
}
const flirting = buildPersonalReading({ cards: ['lovers', 'devil', 'justice'].map(cardById), topicId: 'love', contextId: 'love-flirting' });
assert.doesNotMatch(personalReadingCopyLines(flirting).join('\n'), /네가 네가/u);

// These real spreads previously inserted an unreported relationship conflict
// into studying or purchasing, including the collapsed connection preview.
for (const sample of [
  { contextId: 'overall-study', ids: ['cups_queen', 'swords_queen', 'magician'],
    symbol: /감정을 세심하게 알아주는 태도와 조건을 분명히 판단하는 힘/u,
    unrelated: /상대가 왜 그랬는지|같은 행동을 계속 허용/u },
  { contextId: 'money-spending', ids: ['strength', 'emperor', 'pentacles_ace'],
    symbol: /감정을 차분히 다루는 힘에 분명한 기준과 책임/u,
    unrelated: /참아 주다가|상대는 네가 그동안 힘들었다는 사실/u },
  { contextId: 'money-spending', ids: ['wands_ten', 'empress', 'pentacles_two'],
    symbol: /쌓인 책임을 살핀 뒤 생활을 편안하게 돌볼 여유/u,
    unrelated: /일을 잘해 주는 사람으로만|돌봄을 받고 싶은 마음은 전해지지/u }
]) {
  const context = getPersonalContext('overall', sample.contextId);
  const sampleCards = sample.ids.map(cardById);
  const report = buildPersonalReading({ cards: sampleCards, topicId: context.topicId, contextId: context.id });
  const copy = personalReadingCopyLines(report).join('\n');
  assert.match(report.connection.paragraphs[1], sample.symbol, context.id + ': ordered card symbols remain in the full reading');
  assert.match(report.connection.summaryLines[0], sample.symbol, context.id + ': preview preserves that interpretation');
  assert.doesNotMatch(copy, sample.unrelated, context.id + ': no unrelated personal history is invented');
  assert.doesNotMatch(report.connection.summaryLines.join(' '), sample.unrelated);
  const lastAction = splitSummarySentences(context.cards[sampleCards[2].id]).slice(1).join(' ');
  assert.ok(report.connection.paragraphs[2].includes(lastAction), 'correcting a pair keeps the complete selected-situation action');
}

// A purchase cycle is meaningful only for the selected spending situation.
// Both actual orders must stay out of saving, agreements, other situations,
// and a general money reading where no purchasing question was selected.
for (const ids of [['devil', 'pentacles_four'], ['pentacles_four', 'devil']]) {
  const pairCards = [...ids, 'temperance'].map(cardById);
  const spendingKey = `${ids.join(':')}:money-spending`;
  const spendingPassage = PERSON_PAIR_READINGS[spendingKey];
  assert.ok(spendingPassage, 'the authored purchase interpretation is retained in both orders');
  for (const context of PERSONAL_CONTEXTS) {
    const narrative = buildPersonNarrative({ cards: pairCards, topicId: context.topicId, context });
    const report = buildPersonalReading({ cards: pairCards, topicId: context.topicId, contextId: context.id });
    if (context.id === 'money-spending') {
      assert.equal(narrative.pairReading, spendingPassage);
      assert.equal(narrative.evidence.authoredPairKey, spendingKey);
      assert.equal(narrative.evidence.authoredPairScope, 'context');
      assert.ok(report.connection.paragraphs[1].includes(spendingPassage));
      assert.ok(report.connection.summaryLines[0].endsWith(splitSummarySentences(spendingPassage)[0]));
    } else {
      assert.equal(narrative.evidence.authoredPair, false, context.id + ': no broader purchase passage is selected');
      assert.equal(narrative.evidence.authoredPairScope, 'common');
      assert.ok(!report.connection.paragraphs.join(' ').includes(spendingPassage));
      assert.doesNotMatch(narrative.pairReading, /구매|물건|소비|사고 싶은/u,
        context.id + ': the shared symbolic comparison does not assume a purchase');
      assert.ok(report.connection.paragraphs[1].includes(splitSummarySentences(context.cards[ids[1]])[0]),
        context.id + ': its own saving, agreement or other situation insight remains present');
      assert.ok(report.connection.summaryLines[0].endsWith(splitSummarySentences(narrative.pairReading)[0]));
    }
  }
  for (const topicId of ['overall', 'love', 'money', 'work']) {
    const narrative = buildPersonNarrative({ cards: pairCards, topicId });
    assert.equal(narrative.evidence.authoredPair, false, topicId + ': a topic alone does not select the purchase story');
    assert.doesNotMatch(narrative.pairReading, /구매|물건|소비|사고 싶은/u);
  }
  const fromOverall = buildPersonalReading({ cards: pairCards, topicId: 'overall', contextId: 'money-spending' });
  assert.ok(fromOverall.connection.paragraphs[1].includes(spendingPassage),
    'the all-topics selector still uses the exact spending situation');
}

// Unscoped authored interpretations remain available across all situations;
// the scope fix must not silently replace them or collapse ordered pairs.
for (const [key, passage] of Object.entries(PERSON_PAIR_READINGS).filter(([key]) => key.split(':').length === 2)) {
  const ids = key.split(':');
  const pairCards = [...ids.map(cardById), DECK.find(card => !ids.includes(card.id))];
  for (const context of PERSONAL_CONTEXTS) {
    const narrative = buildPersonNarrative({ cards: pairCards, topicId: context.topicId, context });
    assert.equal(narrative.pairReading, passage);
    assert.equal(narrative.evidence.authoredPairKey, key);
    assert.equal(narrative.evidence.authoredPairScope, 'general');
    assert.ok(narrative.paragraphs[1].includes(passage));
  }
  const reverseKey = [...ids].reverse().join(':');
  if (Object.hasOwn(PERSON_PAIR_READINGS, reverseKey)) {
    assert.notEqual(passage, PERSON_PAIR_READINGS[reverseKey], 'reversing actual cards preserves its different interpretation');
  }
}

const cards = ['swords_knight', 'cups_six', 'pentacles_eight'].map(id => DECK.find(card => card.id === id));
const first = buildPersonalReading({ cards, topicId: 'love', contextId: 'love-crush' });
const other = buildPersonalReading({ cards, topicId: 'love', contextId: 'love-distance' });
assert.ok(first.primary.every((section, i) => section.paragraphs[0] !== other.primary[i].paragraphs[0]), 'the same spread gets different authored situation text');
assert.notDeepEqual(plain(first.comparison), plain(other.comparison));
assert.notDeepEqual(plain(first.followUps), plain(other.followUps));
const reversed = buildPersonalReading({ cards: [...cards].reverse(), topicId: 'love', contextId: 'love-crush' });
assert.notEqual(first.comparison.basis, reversed.comparison.basis, 'the actual third card sets the choice criterion');
assert.notEqual(first.connection.paragraphs.join(''), reversed.connection.paragraphs.join(''), 'the order is part of the three-card interpretation');
for (const invalid of [[], cards.slice(0, 2), [cards[0], cards[0], cards[2]], [{ id: 'imaginary', name: '없는 카드' }, ...cards.slice(1)]]) {
  assert.throws(() => buildPersonalReading({ cards: invalid, topicId: 'love', contextId: 'love-crush' }), /requires_three_actual_cards/);
}
const copied = personalReadingCopyLines(first).join('\n');
assert.ok(copied.indexOf(first.connection.title) < copied.indexOf(first.primary[0].title),
  'full copy starts with the combined personal story before card-by-card advice');
assert.ok(copied.includes(first.example), 'the fictional situation keeps its explicit example wording');
for (const section of [...first.primary, first.connection, ...first.followUps]) {
  for (const paragraph of section.paragraphs) {
    const conclusionAction = paragraph === first.primary[2].paragraphs[1]
      && first.connection.paragraphs[2].includes(paragraph);
    assert.equal(copied.split(paragraph).length - 1, conclusionAction ? 2 : 1,
      'full paragraphs remain available; only the third action is deliberately shared by the conclusion and its card detail');
  }
}
for (const option of first.comparison.options) {
  for (const field of ['label', 'gain', 'burden', 'prepare']) assert.ok(copied.includes(option[field]));
}
assert.ok(copied.includes('이 선택의 장점: '));
assert.doesNotMatch(copied, /기대할 수 있는 점:/);
assert.ok(copied.includes(PERSONAL_BASIS));
assert.deepEqual(plain(personalReadingCopyLines(null)), []);
console.log('PASS tarot personal reading: 15 situations × 78 actual portraits, situation-scoped ordered pairs, complete situation/action sentences, actual card order, 45 follow-ups and story-first full copy');
