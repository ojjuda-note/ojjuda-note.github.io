const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');
const load = createTarotLoader();
const { DECK } = load('readings.js');
const { PERSONAL_CONTEXTS, listPersonalContexts, getPersonalContext } = load('personal-contexts.js');
const { buildPersonalReading, personalReadingCopyLines, PERSONAL_BASIS } = load('personal-reading.js');
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
console.log('PASS tarot personal reading: 15 situations × 78 actual portraits, complete situation/action sentences, actual card order, 45 follow-ups and story-first full copy');
