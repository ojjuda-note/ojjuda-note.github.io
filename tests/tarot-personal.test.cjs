const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');
const load = createTarotLoader();
const { DECK } = load('readings.js');
const { PERSONAL_CONTEXTS, listPersonalContexts, getPersonalContext } = load('personal-contexts.js');
const { buildPersonalReading, personalReadingCopyLines, PERSONAL_BASIS } = load('personal-reading.js');
const { directCardAdvice } = load('reading-voice.js');
const { getPersonStory } = load('person-stories.js');
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
      const person = getPersonStory(card.id);
      const [insight, ...actions] = splitSummarySentences(directCardAdvice(context.cards[card.id]));
      const portrait = index === 0 ? person.portrait : index === 1 ? `${person.longing} ${person.defense}` : insight;
      assert.equal(section.paragraphs.length, 2, 'personal explanation and its cost/action have separate paragraphs');
      assert.ok(section.paragraphs[0].includes(portrait), 'each position reads its actual card through the person and selected situation');
      assert.ok(section.paragraphs[0].includes(insight), 'the complete situation insight remains available');
      if (index === 2) {
        assert.ok(section.paragraphs[0].includes(person.longing));
        assert.ok(section.paragraphs[0].indexOf(insight) < section.paragraphs[0].indexOf(person.longing),
          'the next choice starts in the selected situation before explaining the person’s wish');
        assert.ok(!section.paragraphs.join(' ').includes(person.turning),
          'a generic change passage cannot replace the actual situation or add an unrelated action');
      } else {
        assert.ok(section.paragraphs[0].indexOf(portrait) < section.paragraphs[0].indexOf(insight), 'personal meaning comes before the situation application');
      }
      assert.ok(section.paragraphs[1].startsWith(person.cost), 'the cost of the personal pattern is explained before the practical step');
      for (const action of actions) {
        assert.ok(section.paragraphs[1].includes(action), 'every original action sentence remains complete in the second paragraph');
        assert.ok(!section.paragraphs[0].includes(action), 'the explanation is not interrupted by its practical instruction');
        assert.ok(section.paragraphs[1].indexOf(action) >= person.cost.length, 'the actual difficulty is explained before the action');
      }
      assert.ok(section.paragraphs.join(' ').includes(card.name));
      assert.ok(report.followUps[index].paragraphs.at(-1).includes(card.name));
    }
    assert.equal(report.connection.paragraphs.length, 3);
    const last = cards[2], lastPerson = getPersonStory(last.id);
    const [lastInsight, lastAction] = splitSummarySentences(context.cards[last.id]);
    const ending = report.connection.paragraphs[2];
    for (const explanation of [lastInsight, lastPerson.longing, lastPerson.cost]) {
      assert.ok(ending.includes(explanation), 'every context keeps its actual situation, wish and difficulty in the connected ending');
    }
    assert.ok(!ending.includes(lastAction), 'the connected explanation does not duplicate the action offered in the third card’s section');
    assert.ok(report.connection.summaryLines[1].endsWith(lastAction),
      'the connection preview retains the complete original action, including any condition');
    const renderedAction = splitSummarySentences(directCardAdvice(context.cards[last.id]))[1];
    assert.equal(personalReadingCopyLines(report).join('\n').split(renderedAction).length - 1, 1,
      'the third card’s complete situation action is copied once, after its personal explanation');
    assert.ok(!ending.includes(lastPerson.turning), 'a context-specific ending does not borrow a generic action from another domain');
    assert.ok(report.comparison.basis.includes(cards[2].name));
    assert.deepEqual(plain(report.comparison.options.map(option => option.label)), [context.comparison.a.label, context.comparison.b.label]);
  }
}
assert.equal(authored.size, 1170);
assert.equal(questions.size, 45);

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
  for (const paragraph of section.paragraphs) assert.equal(copied.split(paragraph).length - 1, 1, 'full paragraphs appear once even when the UI disclosure is closed');
}
for (const option of first.comparison.options) {
  for (const field of ['label', 'gain', 'burden', 'prepare']) assert.ok(copied.includes(option[field]));
}
assert.ok(copied.includes('이 선택의 장점: '));
assert.doesNotMatch(copied, /기대할 수 있는 점:/);
assert.ok(copied.includes(PERSONAL_BASIS));
assert.deepEqual(plain(personalReadingCopyLines(null)), []);
console.log('PASS tarot personal reading: 15 situations × 78 actual portraits, complete situation/action sentences, actual card order, 45 follow-ups and story-first full copy');
