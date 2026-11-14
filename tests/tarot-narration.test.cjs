const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');

const load = createTarotLoader();
const { narrateReading, narrateSummary } = load('narration.js');
const { DECK, POSITIONS, getReading, getSummary } = load('readings.js');
const { CARD_FOUNDATIONS } = load('card-foundations.js');
const { CARD_LIFE_THEMES } = load('life-themes.js');
const { FORTUNE_ROWS, getFortune } = load('fortune-corpus/index.js');
const { CARD_INTERPRETATIONS } = load('interpretation-engine.js');
const { getPersonStory } = load('person-stories.js');
const { splitSummarySentences } = load('reading-summary.js');
const { directInterpretation, directAction } = load('reading-voice.js');
const plain = value => JSON.parse(JSON.stringify(value));
const topics = ['overall', 'love', 'money', 'work'];
const cards = ['swords_knight', 'swords_two', 'pentacles_three'].map(id => DECK.find(card => card.id === id));
const groupText = group => group.sections.flatMap(section => section.paragraphs).join('\n\n');
const personalText = report => report.groups.filter(group => group.id !== 'cards').map(groupText).join('\n\n');

function assertReaderNarrative(text, label) {
  const prose = text.replace(/‘[^’]*’|“[^”]*”|"[^"]*"/gu, '');
  assert.doesNotMatch(prose, /(?:^|[^가-힣])(?:너(?:에게|한테)?(?:는|의|를|와|도|만|부터|라면|라도)?|네가|네게)(?=[^가-힣]|$)/u,
    `${label}: the reader speaks about their own life instead of being addressed as you`);
  assert.doesNotMatch(prose, /(?:렴|려무나|단다|거야|이야|겠구나|구나|있어|없어|같아|싶어|괜찮아|해 봐|살펴봐)(?:[.!?](?=\s|$)|$)/u,
    `${label}: complete source sentences use the reader's declarative voice`);
  assert.doesNotMatch(prose, /모는다|말아 (?:준다|본다)|수 있을 수|않지 않|내가 내가|나는 나는|나를 나를/u,
    `${label}: changing perspective must not introduce a malformed verb, double possibility or duplicate subject`);
}

// Audit the actual authored fields, including records that a small sample of
// three-card draws would not select. A numeral must not become a possessive.
let authoredVoiceFields = 0;
for (const [topic, rows] of Object.entries(FORTUNE_ROWS)) for (const [id, ...fields] of rows) {
  for (const [index, text] of fields.entries()) {
    assertReaderNarrative(text, `${topic}:${id}:${index}`);
    authoredVoiceFields++;
  }
}
for (const [cardId, themes] of Object.entries(CARD_LIFE_THEMES)) for (const [field, text] of Object.entries(themes)) {
  assertReaderNarrative(text, `${cardId}:${field}`);
  authoredVoiceFields++;
}
assert.equal(authoredVoiceFields, 7992, 'all 2,560 original records and the 78 complete life-theme sets are checked');
assert.ok(getFortune('money', '246').action.includes('다음 확인일을 네 칸으로'),
  'the four fields of a contact log remain four fields, not the reader’s fields');

function checkCardIntroductions(report, selected, readings) {
  const group = report.groups.find(group => group.id === 'cards');
  assert.equal(group.sections.length, 3);
  assert.ok(group.basisParagraphs.length >= 3, 'shared interpretation rules and scope remain available with the card explanations');
  for (const basis of group.basisParagraphs) assert.ok(report.text.includes(basis));
  for (const [index, reading] of readings.entries()) {
    const intro = group.sections[index];
    assert.equal(intro.id, `card-intro-${index}`);
    assert.equal(intro.cardId, selected[index].id);
    assert.equal(intro.roleIndex, index);
    assert.ok(intro.title.includes(selected[index].name));
    for (const paragraph of [reading.introduction, ...reading.paragraphs]) {
      assert.ok(intro.paragraphs.includes(paragraph), 'card introduction preserves each complete original explanation');
      assert.ok(report.text.includes(paragraph), 'full copy includes the relocated explanation');
    }
    assert.deepEqual(plain(intro.detailSections), plain(reading.detailSections));
    assert.deepEqual(plain(intro.reference), plain(reading.reference));
    assert.equal(intro.nameGuide, reading.nameGuide || '');
    assert.deepEqual(plain(intro.sourceNote), plain(reading.sourceNote || null));
    for (const detail of intro.detailSections) for (const field of ['title', 'subtitle', 'body']) {
      if (detail[field]) assert.ok(report.text.includes(detail[field]), 'the original meaning, role, topic, example, action and cautions survive full copy');
    }
    if (intro.nameGuide) assert.ok(report.text.includes(intro.nameGuide));
    assert.ok(report.text.includes(intro.reference.label) && report.text.includes(intro.reference.url));
    if (intro.sourceNote) {
      assert.ok(report.text.includes(intro.sourceNote.body));
      assert.ok(report.text.includes(intro.sourceNote.reference.url));
    }
  }
}

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
      const person = getPersonStory(card.id);
      assert.equal(result.summary, splitSummarySentences(person[topic])[0], 'the preview starts with the selected topic in the actual card portrait');
      assert.ok(result.paragraphs[0].startsWith(CARD_INTERPRETATIONS[card.id].meaning),
        'the actual card meaning leads the reading before any inferred personality or caution');
      assert.equal(result.paragraphs[1], person[topic], 'the selected topic follows the card meaning');
      assert.ok(result.paragraphs.includes(person.portrait), 'the original personal portrait remains available');
      assert.equal(result.meaning, CARD_INTERPRETATIONS[card.id].meaning, 'the original symbolic meaning remains intact');
      assert.equal(result.traditionalMeaning, input.guidance.meaning, 'the original source interpretation is preserved separately');
      assert.equal(result.foundationTakeaway, input.foundation.takeaway);
      assert.doesNotMatch(result.text, /먼저 전통 타로 그림을 바탕으로 이 카드를 살펴보자|그 모습에 담긴 뜻을 조금 더 풀어보면 이래|그렇다면 무엇부터 해 보면 좋을까/);
      assert.equal(result.detailSections, input.base.sections);
      assert.equal(result.reference, input.base.reference);
      assert.deepEqual(plain(result.lifeTheme), Object.fromEntries(Object.entries(CARD_LIFE_THEMES[card.id]).map(([field, value]) => [field, directInterpretation(value)])));
      assert.equal(result.positionMeaning, directInterpretation(input.guidance.positions[index]));
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
  assert.equal(summary.headline, '지금 나에게 필요한 이야기');
  assert.equal(summary.source, source, 'original record metadata is preserved without new counts');
  assert.equal(summary.paragraphs.length, 3);
  assert.deepEqual(plain(summary.groups.map(group => [group.id, group.label])), [
    ['cards', '카드 소개'], ['problem', '나의 이야기'], ['timeline', '과거·현재·미래'], ['domains', '분야별 풀이']
  ]);
  assert.equal(summary.groups[1].sections[0].id, 'together', 'the whole personal story comes before individual actions');
  assert.equal(summary.groups[1].sections[0].title, '지금 나에게 필요한 이야기');
  assert.equal(summary.groups[1].sections[0].paragraphs.join('\n\n'), summary.synthesis);
  assert.equal(summary.groups[1].sections.length, 5);
  assert.equal(summary.groups[1].sections.find(section => section.id === 'possible-outcome').title, '실천한 뒤 살펴볼 변화');
  assert.equal(summary.groups[0].sections.length, 3);
  assert.equal(summary.groups[2].sections.length, 7);
  assert.equal(summary.groups[3].sections.length, 50);
  assert.equal(summary.sections.length, 65);
  checkCardIntroductions(summary, cards, readings);
  const personal = personalText(summary);
  for (const group of summary.groups) {
    assert.equal(new Set(group.sections.map(section => section.id)).size, group.sections.length);
    for (const section of group.sections) {
      assert.ok(section.title);
      assert.ok(section.paragraphs.length >= 1, `${group.id}/${section.id} keeps its full explanation`);
      assert.ok(splitSummarySentences(section.paragraphs.join(' ')).length >= 2,
        `${group.id}/${section.id} retains complete authored meaning without a filler card introduction`);
      assert.ok(section.paragraphs.every(paragraph => typeof paragraph === 'string' && paragraph.length >= 30));
      assert.equal(section.paragraphs.join(' ').split(summary.ritual).length - 1, section.id === 'solution' ? 1 : 0,
        'the complete third-card action belongs only to the solution, after its explanation');
    }
  }
  const timeline = summary.groups[2].sections;
  for (const card of cards) assert.ok(timeline[0].paragraphs.join(' ').includes(getPersonStory(card.id).portrait),
    'the strength section explains each actual person portrait instead of asking the reader to discover a strength');
  assert.ok(timeline[1].paragraphs.join(' ').includes(readings[0].lifeTheme.past));
  assert.ok(timeline[2].paragraphs.join(' ').includes(readings[0].personalCaution));
  assert.ok(timeline[2].paragraphs.join(' ').includes(readings[0].action));
  assert.ok(timeline[3].paragraphs.join(' ').includes(readings[0].lifeTheme.achievement));
  assert.ok(timeline[4].paragraphs.join(' ').includes(readings[1].personalCaution));
  assert.ok(timeline[4].paragraphs.join(' ').includes(readings[1].action));
  assert.ok(timeline[5].paragraphs.join(' ').includes(readings[2].lifeTheme.change));
  assert.ok(timeline[6].paragraphs.join(' ').includes(readings[2].personalCaution));
  assert.equal(summary.ritualInReading, true, 'the UI and copy know the action is already inside the reading');
  assert.equal(personal.split(summary.ritual).length - 1, 1, 'the personal account offers the complete action once without an extra closing ritual');

  for (let i = 0; i < 3; i++) {
    assert.ok(!summary.paragraphs[i].includes(cards[i].name), 'personal applications do not introduce card names');
    assert.ok(summary.paragraphs[i].length > 100, 'each role has a developed application, beyond the card label');
    assert.ok(summary.text.includes(cards[i].name));
  }
  const people = cards.map(card => getPersonStory(card.id));
  for (const person of people) {
    assert.ok(summary.synthesis.includes(splitSummarySentences(person[topicId])[0]),
      'every card contributes an interpretation written for the actual selected topic');
    for (const field of ['longing', 'defense', 'cost']) {
      assert.ok(!summary.synthesis.includes(person[field]),
        'a generic psychological passage is not forced into every selected topic');
    }
  }
  assert.ok(!summary.synthesis.includes(people[2].turning), 'a generic change passage cannot introduce another topic’s action or recipient');
  assert.ok(!summary.synthesis.includes(readings[2].action), 'the main story explains the person before the solution offers an action');
  const solutionSection = summary.groups[1].sections.find(section => section.id === 'solution');
  const solutionBody = solutionSection.paragraphs.join(' ');
  for (const explanation of [people[2][topicId]]) {
    assert.ok(solutionBody.includes(explanation) && solutionBody.indexOf(explanation) < solutionBody.indexOf(readings[2].action),
      'the actual selected topic leads into the complete original action');
  }
  assert.ok(!solutionBody.includes(readings[2].meaning), 'the symbolic definition belongs in card introductions');
  assert.ok(summary.synthesis.includes(splitSummarySentences(people[0][topicId])[0]));
  assert.ok(summary.synthesis.includes(splitSummarySentences(people[1][topicId])[0]),
    'the first two cards are read through this topic rather than a shared motion-only bridge');
  for (const reading of readings) {
    for (const detail of [reading.example, reading.topicMeaning, reading.foundationCaution]) {
      assert.ok(!personal.includes(detail), 'individual card explanations remain outside the personal tabs');
    }
    assert.equal(personal.split(reading.action).length - 1, 1, 'each actual card action is offered once across the personal tabs');
  }
  for (const [index, id] of [[0, 'problem-now'], [1, 'situation-now']]) {
    const roleSection = summary.groups[1].sections.find(section => section.id === id);
    assert.ok(roleSection.paragraphs.includes(readings[index].personalPositionMeaning),
      'the corresponding problem or current-situation lens remains complete as personal prose');
    assert.equal(personal.split(readings[index].personalPositionMeaning).length - 1, 1,
      'the complete first and second position lenses are available once in the personal account');
  }
  assert.ok(!personal.includes(readings[2].positionMeaning),
    'preserving the first two role lenses does not add a second generic instruction before the selected third-card action');
  for (const detail of [readings[0].lifeTheme.past, readings[0].lifeTheme.achievement]) {
    assert.equal(personal.split(detail).length - 1, 1, 'each life explanation is used once instead of copied through several personal sections');
  }
  const outcome = summary.groups[1].sections.find(section => section.id === 'possible-outcome');
  assert.match(outcome.paragraphs[0], /실천했다면|뒤에는|살펴보|확인/u,
    'outcome asks what actually changed after action rather than guaranteeing a future result');
  assert.ok(outcome.paragraphs[1].includes(readings[2].lifeTheme.strength),
    'the outcome retains an actual card strength instead of repeating generic pressure');
  assert.equal(summary.summary, summary.synthesis);
  assert.equal(summary.ritual, directAction(cards[2].details[topicId].action));
  assert.ok(!summary.paragraphs.includes(summary.synthesis));
  assert.ok(!summary.paragraphs.includes(summary.ritual));
  assert.ok(summary.oneLine.length >= 24 && /[.!?]$/u.test(summary.oneLine),
    'the short overview is a complete interpretation');
  assert.ok(summary.oneLine.endsWith(splitSummarySentences(summary.ritual)[0]),
    'the short overview ends with one complete action from the actual third card and selected topic');
  assert.ok(summary.detailSections.some(section => section.body === base.summary));
  assert.equal(summary.detailSections.length, 2, 'the personal corpus and its action remain in the personal area');
  assert.deepEqual(plain(summary.groups[0].detailSections), plain(base.sections), 'card-specific combination explanations move to card introductions');
  for (const original of [base.oneLine, base.summary, base.ritual, base.sections[0].body]) {
    assert.ok(summary.text.includes(original), 'selected reference text is preserved in the complete result');
  }
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
  assert.ok(reading.paragraphs[0].startsWith(CARD_INTERPRETATIONS[card.id].meaning),
    'all 78 cards lead with their own meaning rather than a presumed personal problem');
  assert.equal(reading.paragraphs[1], getPersonStory(card.id)[topic]);
  assert.ok(reading.paragraphs.includes(getPersonStory(card.id).portrait));
  assert.ok(JSON.stringify(reading.detailSections).includes(reading.traditionalMeaning), 'the complete original interpretation remains accessible in source details');
  const positionSource = reading.detailSections.find(section => section.title === '이 카드가 전하는 말');
  assert.ok(directInterpretation(positionSource.body).endsWith(reading.positionMeaning),
    'all 78 cards preserve this actual position passage in the expandable source as well as the main card text');
  const sourcePractice = reading.detailSections.find(section => section.title === '생활 속 예시와 해 볼 일');
  assert.ok(sourcePractice.body.startsWith(reading.example), 'the original hypothetical example remains in source details');
  const sourceAction = [sourcePractice.subtitle, sourcePractice.body.slice(reading.example.length).trim()].filter(Boolean).join(' ');
  assert.equal(reading.action, directAction(sourceAction), 'shown advice is derived from the complete action preserved in source details');
  if (card.details) assert.equal(sourceAction, card.details[topic].action, 'the raw authored action is preserved byte-for-byte');
  assert.doesNotMatch(reading.personalCaution, /카드|강한 그림/u,
    'personal caution keeps the practical boundary without teaching a card symbol');
  assert.equal(splitSummarySentences(reading.personalPositionMeaning).length, splitSummarySentences(reading.positionMeaning).length,
    'the personal role preserves every condition and complete authored sentence');
  assert.equal(reading.personalPositionMeaning, reading.positionMeaning,
    'the authored position passage itself is the personal narrative; no runtime pronoun conversion changes it');
  assertReaderNarrative(reading.personalPositionMeaning, `${card.id}/${topic}/${index}:position`);
  assert.doesNotMatch(reading.personalPositionMeaning, /이 자리|(?:보는|살피는|확인하는|구분하는|필요한|중요한|비교하는|짚는) 자리(?:이다|다|야)/u,
    'the personal application states what to consider instead of explaining the spread layout');
}
for (const card of DECK) for (const topic of topics) {
  const first = getReading(card, topic, 0), second = getReading(card, topic, 1);
  assert.notEqual(first.positionMeaning, second.positionMeaning,
    `${card.id}/${topic}: the current situation is not the first position with a changed heading`);
  assert.notDeepEqual(plain(first.paragraphs), plain(second.paragraphs),
    `${card.id}/${topic}: the substantive card body changes with the actual role`);
  assert.notEqual(first.personalPositionMeaning, second.personalPositionMeaning,
    `${card.id}/${topic}: personal wording still distinguishes the concern from the present conditions`);
  for (const field of ['meaning', 'traditionalMeaning', 'symbol', 'topicMeaning', 'example', 'action', 'caution']) {
    assert.equal(first[field], second[field], `${card.id}/${topic}: changing role preserves the actual card, topic and authored guidance`);
  }
  assert.deepEqual(plain(first.paragraphs.filter(text => text !== first.positionMeaning)),
    plain(second.paragraphs.filter(text => text !== second.positionMeaning)),
    'the difference comes from an authored role explanation rather than unrelated or randomized content');
}
assert.deepEqual(plain(POSITIONS.map(position => position.label)), ['지금의 문제', '현재 상황', '해결 방법과 결과']);
assert.equal(Object.keys(CARD_LIFE_THEMES).length, DECK.length);
for (let index = 0; index < DECK.length; index++) for (const topic of topics) {
  const ordered = [DECK[index], DECK[(index + 1) % DECK.length], DECK[(index + 2) % DECK.length]];
  const report = getSummary(ordered, topic);
  assert.equal(report.groups.length, 4);
  assert.equal(report.groups[0].sections.length, 3);
  assert.equal(report.groups[1].sections.length, 5);
  assert.equal(report.groups[2].sections.length, 7);
  assert.equal(report.groups[3].sections.length, 50);
  const readings = ordered.map((card, position) => getReading(card, topic, position));
  checkCardIntroductions(report, ordered, readings);
  const personal = personalText(report);
  assert.deepEqual(plain(report.source.cards), ordered.map(card => card.id));
  for (const card of ordered) assert.ok(report.text.includes(card.name));
  assert.equal(report.ritual, getReading(ordered[2], topic, 2).action);
  assert.equal(report.ritualInReading, true);
  assert.equal(personal.split(report.ritual).length - 1, 1);
  const visiblePersonal = [report.headline, report.oneLine, report.synthesis,
    ...report.groups.filter(group => group.id !== 'cards').flatMap(group => [group.label, group.description || '',
      ...group.sections.flatMap(section => [section.title, section.subtitle || '', ...section.summaryLines, ...section.paragraphs])]),
    ...report.detailSections.flatMap(section => [section.title, section.subtitle || '', section.body || ''])].join('\n');
  const explanation = visiblePersonal.match(/이 카드|카드(?:가|는|의|로|를|에서|에 비친|에 담긴)|카드야|이 그림|전통 (?:타로|해석)|(?:^|\s)이 자리(?:의|는|에서)|(?:살피는|확인하는|구분하는) 자리야/u);
  assert.equal(explanation?.[0], undefined,
    `${topic}/${index}: all personal titles, summaries, paragraphs and extra details stay about the person`);
  for (const card of ordered) assert.ok(!visiblePersonal.includes(`‘${card.name}’`), 'card names are collected in introductions');
  for (const reading of readings) assert.ok(!personal.includes(reading.meaning), 'symbolic card definitions are relocated, not interleaved with personal advice');
  for (const [position, id] of [[0, 'problem-now'], [1, 'situation-now']]) {
    const roleMeaning = getReading(ordered[position], topic, position).personalPositionMeaning;
    assert.ok(report.sections.find(section => section.id === id).paragraphs.includes(roleMeaning));
    assert.equal(personal.split(roleMeaning).length - 1, 1,
      `${ordered[position].id}/${topic}: the complete role text survives once in the personal rendering and copy source`);
  }
  const solution = report.sections.find(section => section.id === 'solution');
  const body = solution.paragraphs.join(' ');
  const story = getPersonStory(ordered[2].id);
  for (const explanation of [story[topic]]) {
    assert.ok(body.includes(explanation) && body.indexOf(explanation) < body.indexOf(report.ritual),
      `${ordered[2].id}/${topic}: the explanation leads into this topic's complete original action`);
  }
  assert.ok(!report.synthesis.includes(story.turning), 'all cards avoid inserting a generic action into the main personal story');
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
console.log('PASS tarot narration: 78 cards, 65 sections, separate card introductions and personal stories, complete source details and conditional actions, stable ordered replay');
