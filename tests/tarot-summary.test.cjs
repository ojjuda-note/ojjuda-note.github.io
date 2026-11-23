const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');
const load = createTarotLoader();
const { splitSummarySentences, summaryLinesFrom } = load('reading-summary.js');
const { DECK, getReading, getSummary } = load('readings.js');
const { getPersonStory } = load('person-stories.js');
const { getCaseGuide } = load('case-guides.js');
const { PERSONAL_CONTEXTS } = load('personal-contexts.js');
const { buildPersonalReading, personalReadingCopyLines } = load('personal-reading.js');
const { getConnectionProfile } = load('card-connections.js');
const { CARD_INTERPRETATIONS, MAIN_CONTEXTS, interpretCard } = load('interpretation-engine.js');
const { directInterpretation, directAction, directCardAdvice } = load('reading-voice.js');
const plain = value => JSON.parse(JSON.stringify(value));
const content = line => line.replace(/^‘[^’]+’(?: · ‘[^’]+’)?(?: 카드)?: /u, '');
const key = line => content(line).replace(/[\s\p{P}]/gu, '');
const firstSentence = text => splitSummarySentences(text)[0];

// A quote, a decimal or a parenthetical note must not cut a condition in half.
const conditional = '금액이 1.5배여도 ‘괜찮아. 지금 해도 돼?’라는 말만으로 결정하지 마.';
const nextStep = '직접 확인되지 않았다면 약속을 미루어도 괜찮아.';
assert.deepEqual(plain(splitSummarySentences(`${conditional} ${nextStep}`)), [conditional, nextStep]);
assert.deepEqual(plain(splitSummarySentences('“싫어?”라고 물었다면 답을 기다려. 거절을 다른 뜻으로 바꾸지는 마.')),
  ['“싫어?”라고 물었다면 답을 기다려.', '거절을 다른 뜻으로 바꾸지는 마.']);
assert.deepEqual(plain(splitSummarySentences('조건(“오늘 결정해.”라는 요구도 포함)을 다시 살펴봐. 부담이 크면 멈춰도 돼.')),
  ['조건(“오늘 결정해.”라는 요구도 포함)을 다시 살펴봐.', '부담이 크면 멈춰도 돼.']);
assert.deepEqual(plain(summaryLinesFrom(conditional, nextStep)), [conditional, nextStep]);
assert.deepEqual(plain(summaryLinesFrom('실제 비용을 확인해 봐. 정한 금액을 넘는다면 범위를 줄여 봐.', '실제 비용을 확인해 봐!')),
  ['실제 비용을 확인해 봐.', '정한 금액을 넘는다면 범위를 줄여 봐.'], 'a duplicate uses another real authored sentence');
assert.deepEqual(plain(summaryLinesFrom('답을 기다려 봐.', '답을 기다려 봐.', ['거절했다면 다시 재촉하지 마.'])),
  ['답을 기다려 봐.', '거절했다면 다시 재촉하지 마.']);
assert.throws(() => summaryLinesFrom('', nextStep), /requires_two_authored_sentences/);
assert.throws(() => summaryLinesFrom('답을 기다려 봐.', '답을 기다려 봐.'), /requires_two_distinct_sentences/,
  'missing content is not replaced with generic advice');

function checkLines(lines, label) {
  assert.equal(lines?.length, 2, `${label}: two meaning units`);
  assert.notEqual(key(lines[0]), key(lines[1]), `${label}: distinct meaning, even without names`);
  for (const line of lines) {
    assert.equal(typeof line, 'string');
    assert.equal(splitSummarySentences(line).length, 1, `${label}: one whole sentence per unit`);
    assert.match(line, /[.!?。！？]$/u, `${label}: no cut-off ending`);
    assert.doesNotMatch(line, /\.\.\.|…|undefined|\[object Object\]/u);
    assert.doesNotMatch(line, /카드로 살펴볼게|카드가 비추는 문제의 실마리야|카드로 지금의 조건을 읽어 볼게|카드의 해결 방식은 이래/);
  }
}

let sectionCount = 0;
for (const topicId of ['overall', 'love', 'money', 'work']) {
  for (let start = 0; start < DECK.length; start++) {
    const cards = [DECK[start], DECK[(start + 19) % 78], DECK[(start + 43) % 78]];
    const report = getSummary(cards, topicId);
    const readings = cards.map((card, index) => getReading(card, topicId, index));
    assert.deepEqual(plain(report.groups.map(group => group.id)), ['cards', 'problem', 'timeline', 'domains']);
    const labels = ['카드 소개', '나의 이야기', '과거·현재·미래', '분야별 풀이'];
    assert.deepEqual(report.text.split(/\n+/).filter(line => labels.includes(line)), labels,
      'full-copy group headings follow the visible order with card introductions first');
    assert.equal(report.sections.length, 65);
    for (const section of report.sections) {
      checkLines(section.summaryLines, `${topicId}/${start}/${section.id}`);
      sectionCount++;
    }
    const problemSections = report.groups.find(group => group.id === 'problem').sections;
    const problemSummaryLines = problemSections.flatMap(section => section.summaryLines);
    assert.equal(new Set(problemSummaryLines.map(key)).size, 10,
      `${topicId}/${start}: all ten visible story summaries add a distinct sentence, even without card names`);
    for (const section of problemSections) {
      for (const line of section.summaryLines) assert.ok(section.paragraphs.join(' ').includes(content(line)),
        `${topicId}/${start}/${section.id}: the complete summary sentence remains in its expanded explanation`);
    }
    const byId = Object.fromEntries(report.groups.filter(group => ['problem', 'timeline'].includes(group.id))
      .flatMap(group => group.sections).map(section => [section.id, section]));
    const personal = report.groups.filter(group => group.id !== 'cards').flatMap(group => group.sections)
      .flatMap(section => section.paragraphs).join('\n\n');
    const introductions = report.groups.find(group => group.id === 'cards').sections;
    for (const [index, intro] of introductions.entries()) {
      assert.equal(intro.cardId, cards[index].id);
      assert.equal(intro.summaryLines[0], firstSentence(readings[index].summary), 'the card introduction starts with the actual topic conclusion');
      assert.equal(intro.summaryLines[1], firstSentence(index === 2 ? readings[index].action : readings[index].positionMeaning), 'the introduction explains the actual ordered role or final action');
    }
    for (const section of Object.values(byId)) {
      const visible = [section.title, ...section.summaryLines, ...section.paragraphs].join(' ');
      assert.doesNotMatch(visible, /이 카드|카드(?:가|는|의|로|를|에서)|카드야|이 그림/u,
        `${section.id}: the personal account does not teach card meanings`);
      for (const card of cards) assert.ok(!visible.includes(`‘${card.name}’`));
    }

    // Past and future summaries keep complete authored sentences and conditions;
    // newly split detail sentences remain in the full explanation.
    for (const [id, source] of [
      ['past-flow', readings[0].lifeTheme.past],
      ['past-achievements', readings[0].lifeTheme.achievement],
      ['future-change', readings[2].lifeTheme.change]
    ]) {
      assert.equal(byId[id].summaryLines.map(content).join(' '), splitSummarySentences(source).slice(0, 2).join(' '),
        `${id}: no invented biography or unconditional future`);
      assert.ok(byId[id].paragraphs.join(' ').includes(source), `${id}: shorter sentences never remove the rest of the authored explanation`);
    }
    const people = cards.map(card => getPersonStory(card.id));
    const outcome = interpretCard(cards[2].id, 'outcome', MAIN_CONTEXTS[topicId]);
    assert.equal(content(byId['possible-outcome'].summaryLines[0]), firstSentence(outcome),
      'the outcome gives an actual topic-specific check after action, not a guaranteed future');
    assert.equal(content(byId['possible-outcome'].summaryLines[1]), firstSentence(readings[2].lifeTheme.strength),
      'the next step is paired with the actual third card strength');
    assert.ok(byId['future-change'].paragraphs.join(' ').includes(readings[2].lifeTheme.change),
      'the full original conditional change passage remains available in the future section');
    assert.equal(content(byId['past-hardships'].summaryLines[1]), firstSentence(readings[0].action));
    assert.equal(content(byId['present-luck'].summaryLines[1]), firstSentence(readings[1].action));
    assert.equal(content(byId['situation-now'].summaryLines[0]), firstSentence(people[1][topicId]),
      'the current account preserves the actual selected topic');
    assert.equal(content(byId['situation-now'].summaryLines[1]), firstSentence(readings[1].personalPositionMeaning),
      'the second line identifies the authored current conditions');
    assert.equal(content(byId['problem-now'].summaryLines[0]), firstSentence(people[0][topicId]),
      'a positive card keeps its personal topic interpretation in the first position');
    assert.equal(content(byId['problem-now'].summaryLines[1]), firstSentence(readings[0].personalPositionMeaning));
    assert.equal(content(byId.solution.summaryLines[0]), firstSentence(people[2][topicId]),
      'the solution is grounded in the actual third card and selected topic');
    assert.equal(content(byId.solution.summaryLines[1]), firstSentence(readings[2].action),
      'the second line preserves a complete sentence from this topic’s original action');
    assert.ok(byId.solution.paragraphs.join(' ').includes(readings[2].action),
      'a two-line preview never removes the rest of the original action');
    assert.equal(report.ritualInReading, true);
    assert.equal(personal.split(readings[2].action).length - 1, 1,
      'the personal account includes the solution action once, without a duplicate closing instruction');

    for (const section of report.groups.find(group => group.id === 'domains').sections) {
      const insight = getCaseGuide(section.id, cards[0].id).insight;
      const action = getCaseGuide(section.id, cards[2].id).action;
      assert.equal(content(section.summaryLines[0]), firstSentence(insight), 'domain keeps the first card insight');
      assert.equal(content(section.summaryLines[1]), firstSentence(action), 'domain keeps the third card action');
      assert.ok(!section.summaryLines.some(line => /‘[^’]+’ 카드:/.test(line)), 'domain summaries explain the person directly');
      assert.ok(!section.summaryLines.some(line => content(line) === firstSentence(section.example)),
        'a fictional example is not presented as the summary');
      assert.ok(section.paragraphs.join(' ').includes(insight) && section.paragraphs.join(' ').includes(action),
        'the full source remains in the expanded explanation');
    }
    assert.doesNotMatch(report.text, /’ 카드: /u, 'display summaries are not inserted into the original full copy');
    for (const section of report.sections) {
      for (const paragraph of section.paragraphs) assert.ok(report.text.includes(paragraph), 'copy preserves every original paragraph');
    }
  }
}

let personalCount = 0;
for (const context of PERSONAL_CONTEXTS) {
  for (let start = 0; start < DECK.length; start++) {
    const cards = [DECK[start], DECK[(start + 19) % 78], DECK[(start + 43) % 78]];
    const report = buildPersonalReading({ cards, topicId: context.topicId, contextId: context.id });
    for (const [index, section] of report.primary.entries()) {
      checkLines(section.summaryLines, `${context.id}/${cards[index].id}`);
      const advice = splitSummarySentences(directCardAdvice(context.cards[cards[index].id]));
      assert.equal(content(section.summaryLines[0]), advice[0],
        'personal summary starts with the actual card-specific situation insight');
      assert.equal(content(section.summaryLines[1]), advice[1],
        'the action belongs to the exact selected situation, with its condition intact');
      for (const sentence of advice) assert.ok(section.paragraphs.join(' ').includes(sentence),
        'both original situation and action sentences remain available in full');
      assert.equal(section.paragraphs[0], advice[0], 'the full personal insight is not preceded by a symbolic card definition');
    }
    checkLines(report.connection.summaryLines, `${context.id}/connection`);
    for (const card of cards) assert.ok(report.connection.paragraphs.join(' ').includes(firstSentence(directInterpretation(context.cards[card.id]))),
      'the developed story applies all three actual cards, including the middle card, without a name-only substitution');
    for (const section of [...report.primary, report.connection]) {
      const visible = [section.title, ...section.summaryLines, ...section.paragraphs].join(' ');
      assert.doesNotMatch(visible, /이 카드|카드(?:가|는|의|로|를|에서)|카드야/u);
      for (const card of cards) assert.ok(!visible.includes(`‘${card.name}’`));
    }
    assert.equal(content(report.connection.summaryLines[1]), splitSummarySentences(directCardAdvice(context.cards[cards[2].id])).at(-1),
      'the final summary uses the actual situation action instead of an action from another topic');
    checkLines(report.comparison.basisSummaryLines, `${context.id}/choice-basis`);
    const solution = splitSummarySentences(getPersonStory(cards[2].id)[context.topicId]);
    assert.equal(content(report.comparison.basisSummaryLines[0]), solution[0],
      'choice comparison uses the selected topic, not unrelated generic relationship support');
    assert.equal(report.comparison.basisSummaryLines[1], solution[1]);
    for (const option of report.comparison.options) {
      checkLines(option.summaryLines, `${context.id}/choice-${option.key}`);
      assert.equal(option.summaryLines[0], firstSentence(option.gain));
      assert.equal(option.summaryLines[1], firstSentence(option.burden), 'the benefit never replaces the trade-off');
    }
    for (const [index, question] of report.followUps.entries()) {
      checkLines(question.summaryLines, `${context.id}/${question.id}`);
      assert.equal(question.summaryLines[0], firstSentence(directInterpretation(context.followUps[index].paragraphs[0])),
        'practical answers retain their authored meaning without a card-interpretation ending');
      assert.equal(question.summaryLines[1], firstSentence(directAction(context.followUps[index].paragraphs[1])),
        'both authored answer paragraphs contribute, before the card reflection prompt');
    }
    const copied = personalReadingCopyLines(report).join('\n');
    for (const section of [...report.primary, report.connection, ...report.followUps]) {
      for (const paragraph of section.paragraphs) assert.ok(copied.includes(paragraph));
    }
    const displayOnly = plain(report);
    for (const section of [...displayOnly.primary, displayOnly.connection, ...displayOnly.comparison.options, ...displayOnly.followUps]) {
      section.summaryLines = ['표시용 요약 첫 문장.', '표시용 요약 둘째 문장.'];
    }
    displayOnly.comparison.basisSummaryLines = ['표시용 기준 첫 문장.', '표시용 기준 둘째 문장.'];
    assert.equal(personalReadingCopyLines(displayOnly).join('\n'), copied,
      'copy remains the full original explanation regardless of the visible summary');
    personalCount++;
  }
}
console.log(`PASS tarot summaries: ${sectionCount} section cases, ${personalCount} personal reports, complete conditions and original copy`);
