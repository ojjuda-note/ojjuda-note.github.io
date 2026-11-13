const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');
const load = createTarotLoader();
const { splitSummarySentences, summaryLinesFrom } = load('reading-summary.js');
const { DECK, getReading, getSummary } = load('readings.js');
const { MAIN_CONTEXTS, interpretCard } = load('interpretation-engine.js');
const { getCaseGuide } = load('case-guides.js');
const { PERSONAL_CONTEXTS } = load('personal-contexts.js');
const { buildPersonalReading, personalReadingCopyLines } = load('personal-reading.js');
const { getConnectionProfile } = load('card-connections.js');
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
    assert.equal(report.sections.length, 62);
    for (const section of report.sections) {
      checkLines(section.summaryLines, `${topicId}/${start}/${section.id}`);
      sectionCount++;
    }
    const byId = Object.fromEntries(report.groups.slice(0, 2).flatMap(group => group.sections).map(section => [section.id, section]));
    for (const [id, index] of [
      ['problem-now', 0], ['situation-now', 1], ['solution', 2], ['possible-outcome', 2],
      ['past-flow', 0], ['past-hardships', 0], ['past-achievements', 0],
      ['present-luck', 1], ['future-change', 2], ['future-hardships', 2]
    ]) assert.ok(byId[id].summaryLines[0].includes(cards[index].name), `${id}: actual card stays visible`);

    // Past and future keep both authored sentences, including any condition.
    for (const [id, source] of [
      ['past-flow', readings[0].lifeTheme.past],
      ['past-achievements', readings[0].lifeTheme.achievement],
      ['future-change', readings[2].lifeTheme.change]
    ]) assert.equal(byId[id].summaryLines.map(content).join(' '), source, `${id}: no invented biography or unconditional future`);
    const outcome = interpretCard(cards[2].id, 'outcome', MAIN_CONTEXTS[topicId]);
    assert.equal(content(byId['possible-outcome'].summaryLines[0]), outcome,
      'the action required for a possible result remains in the same sentence');
    assert.equal(content(byId['past-hardships'].summaryLines[1]), firstSentence(readings[0].action));
    assert.equal(content(byId['present-luck'].summaryLines[1]), firstSentence(readings[1].action));
    assert.ok(readings[1].topicMeaning.includes(content(byId['situation-now'].summaryLines[0])),
      'current situation comes from the actual card/topic meaning, not a hypothetical scene');

    for (const section of report.groups.find(group => group.id === 'domains').sections) {
      const insight = getCaseGuide(section.id, cards[0].id).insight;
      const action = getCaseGuide(section.id, cards[2].id).action;
      assert.equal(content(section.summaryLines[0]), firstSentence(insight), 'domain keeps the first card insight');
      assert.equal(content(section.summaryLines[1]), firstSentence(action), 'domain keeps the third card action');
      assert.ok(section.summaryLines[0].includes(cards[0].name));
      assert.ok(section.summaryLines[1].includes(cards[2].name));
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
      assert.equal(section.summaryLines.map(content).join(' '), context.cards[cards[index].id],
        'personal summary keeps the authored meaning and action, before the display introduction');
      assert.ok(section.summaryLines[0].includes(cards[index].name));
    }
    checkLines(report.connection.summaryLines, `${context.id}/connection`);
    for (const card of cards) assert.ok(report.connection.summaryLines.join(' ').includes(card.name),
      'the connection summary is tied to all three actual cards');
    checkLines(report.comparison.basisSummaryLines, `${context.id}/choice-basis`);
    const solution = getConnectionProfile(cards[2].id);
    assert.equal(content(report.comparison.basisSummaryLines[0]), firstSentence(solution.support));
    assert.equal(report.comparison.basisSummaryLines[1], firstSentence(solution.tension));
    for (const option of report.comparison.options) {
      checkLines(option.summaryLines, `${context.id}/choice-${option.key}`);
      assert.equal(option.summaryLines[0], firstSentence(option.gain));
      assert.equal(option.summaryLines[1], firstSentence(option.burden), 'the benefit never replaces the trade-off');
    }
    for (const [index, question] of report.followUps.entries()) {
      checkLines(question.summaryLines, `${context.id}/${question.id}`);
      assert.equal(question.summaryLines[0], firstSentence(context.followUps[index].paragraphs[0]));
      assert.equal(question.summaryLines[1], firstSentence(context.followUps[index].paragraphs[1]),
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
