const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');
const load = createTarotLoader();
const { directInterpretation, directAction, directCardAdvice } = load('reading-voice.js');
const { splitSummarySentences } = load('reading-summary.js');
const { CASE_GUIDES } = load('case-guides.js');
const { PERSONAL_CONTEXTS } = load('personal-contexts.js');
const { CARD_INTERPRETATIONS } = load('interpretation-engine.js');

// A firm card interpretation is not a claim that an actual future event is certain.
const risk = '확인하지 않은 조건을 좋은 쪽으로 상상하면 실제 비용을 놓칠 수 있어.';
const clearerRisk = directInterpretation(risk);
assert.ok(clearerRisk.startsWith('확인하지 않은 조건을 좋은 쪽으로 상상하면 실제 비용을 '));
assert.match(clearerRisk, /놓치기 쉬워요\.$/u);
assert.doesNotMatch(clearerRisk, /반드시|무조건|확정|성공한다|실패한다/u);

const conditional = '각자 맡을 일을 확인한다면 반복하는 수고를 덜 수 있어.';
const clearerConditional = directInterpretation(conditional);
assert.ok(clearerConditional.startsWith('각자 맡을 일을 확인한다면 '));
assert.match(clearerConditional, /덜기 쉬워요\.$/u);
assert.doesNotMatch(clearerConditional, /덜어져|없어져|해결돼/u, 'a condition makes the action easier without promising the result');

// Late discovery or less attention must never become an instruction to neglect a condition.
assert.match(directInterpretation('확인하지 않으면 뒤늦게 알 수 있어.'), /뒤늦게 알게 되기 쉬워/u);
assert.doesNotMatch(directInterpretation('확인하지 않으면 뒤늦게 알 수 있어.'), /목표야/u);
assert.doesNotMatch(directInterpretation('시작이 좋아 보이면 관리할 일까지는 덜 살필 수 있어.'), /덜 살펴봐|덜 살피는 게 목표야|덜 살피는 데 초점을/u);

// Refusal, consent and health limits keep their meaning. Only quoted dialogue
// must keep its exact wording; our own prose may use polite Korean endings.
const limits = [
  {
    inputs: ['질병을 진단할 수는 없어. 진단은 의료진에게 확인해야 해.',
      '질병을 진단할 수는 없다. 진단은 의료진에게 확인해야 한다.'],
    meaning: [/질병을 진단할 수는 없어(?:요)?\./u, /진단은 의료진에게 확인해야 해(?:요)?\./u]
  },
  {
    inputs: ['상대가 거절했거나 연락하지 말라고 했다면 다시 연락하지 마.',
      '상대가 거절했거나 연락하지 말라고 했다면 다시 연락하지 않는다.'],
    meaning: [/상대가 거절했거나 연락하지 말라고 했다면 /u,
      /다시 연락하지 (?:마(?:세요)?|않아(?:요)?)\./u]
  },
  {
    inputs: ['무응답을 동의로 볼 수는 없어.', '무응답을 동의로 볼 수는 없다.'],
    meaning: [/무응답을 동의로 볼 수는 없어(?:요)?\./u]
  },
  {
    inputs: ['검사 결과가 없으면 건강 상태를 단정할 수 없어.',
      '검사 결과가 없으면 건강 상태를 단정할 수 없다.'],
    meaning: [/검사 결과가 없으면 건강 상태를 단정할 수 없어(?:요)?\./u]
  },
  {
    inputs: ['지금 보이는 차이가 잘못은 아닐 수 있어.', '지금 보이는 차이가 잘못은 아닐 수 있다.'],
    meaning: [/지금 보이는 차이가 잘못은 아닐 수 있어(?:요)?\./u]
  },
  {
    inputs: ['사람마다 반응이 같지 않을 수 있어.', '사람마다 반응이 같지 않을 수 있다.'],
    meaning: [/사람마다 반응이 같지 않을 수 있어(?:요)?\./u]
  },
  {
    inputs: ['원하는 결과를 얻지 못할 수 있어.', '원하는 결과를 얻지 못할 수 있다.'],
    meaning: [/원하는 결과를 얻지 못할 수 있어(?:요)?\./u]
  },
  {
    inputs: ['이 기록만으로는 이유를 알 수 없어.', '이 기록만으로는 이유를 알 수 없다.'],
    meaning: [/이 기록만으로는 이유를 알 수 없어(?:요)?\./u]
  }
];
for (const { inputs, meaning } of limits) {
  for (const text of inputs) {
    for (const transform of [directInterpretation, directAction]) {
      const revised = transform(text);
      for (const clause of meaning) assert.match(revised, clause, `preserve the limit: ${text}`);
      if (/다\.$/u.test(text)) assert.match(revised, /요\.$/u, 'our written prose uses a polite ending');
    }
  }
}
const quoted = '‘성급하게 선택할 수 있어. 멈춰 볼 수 있어?’라는 말을 적고 실제 조건을 확인할 수 있어.';
assert.ok(directAction(quoted).startsWith('‘성급하게 선택할 수 있어. 멈춰 볼 수 있어?’라는 말을 적고 '));
assert.match(directAction(quoted), /실제 조건을 확인하세요\.$/u);
assert.equal(splitSummarySentences(directAction(quoted)).length, 1);
const nested = '“‘준비를 미룰 수 있어.’라고 말했지?”라는 질문 뒤에는 필요한 조건을 살펴볼 수 있어.';
assert.ok(directAction(nested).includes('“‘준비를 미룰 수 있어.’라고 말했지?”'));
const sourceQuote = '『약속을 지켜 본다.』라는 원문은 그대로 적는다.\n\n실제 약속을 지켜 본다.';
assert.ok(directAction(sourceQuote).startsWith('『약속을 지켜 본다.』라는 원문은 그대로 '));
assert.ok(directAction(sourceQuote).includes('\n\n'));
assert.match(directAction(sourceQuote), /실제 약속을 지키세요\.$/u);

// A dictionary entry must not change a longer, unrelated Korean word.
assert.equal(directInterpretation('지원할 수 있어.'), '지원할 수 있어.');
assert.equal(directInterpretation('불필요할 수 있어.'), '불필요할 수 있어.');
assert.equal(directInterpretation('그 문장은 모호해서 옮긋할 수 있어.'), '그 문장은 모호해서 옮긋할 수 있어.');
assert.equal(directInterpretation('지원할 수 있다.'), '지원할 수 있어요.');
assert.equal(directInterpretation('불필요할 수 있다.'), '불필요할 수 있어요.');

const example = '예를 들어 갑자기 부탁을 받으면 당장 답하기 어려울 수 있어.';
assert.equal(directInterpretation(example), example);
assert.equal(directAction(example), example);
const writtenExample = '가령 일정이 바뀌면 연락이 늦을 수 있다.';
assert.equal(directInterpretation(writtenExample), '가령 일정이 바뀌면 연락이 늦을 수 있어요.');
assert.equal(directAction(writtenExample), '가령 일정이 바뀌면 연락이 늦을 수 있어요.');

// Keep the subject and object: an experience remains an experience, not a new method.
assert.equal(directInterpretation('친구의 경험이 도움이 될 수 있어.'), '친구의 경험이 도움이 될 수 있어.');
assert.equal(directInterpretation('잘했던 경험이 관심을 알아보는 단서가 될 수 있어.'),
  '잘했던 경험이 관심을 알아보는 단서가 될 수 있어.');
for (const text of [
  '가족이니까 무조건 해야 한다는 생각이 선택의 여유를 줄일 수 있어.',
  '현재 결과만 보고 시간이 필요한 과정까지 실패로 판단할 수 있어.',
  '감당하기 어려운 부탁은 분명히 구별할 수 있어.'
]) assert.equal(directInterpretation(text), text, 'a warning or a capability is not renamed as a method');
const personal = directCardAdvice('생각만 하다가 질문할 시기를 놓칠 수 있어. 모르는 조건을 적고 담당자에게 확인할 수 있어.');
assert.equal(splitSummarySentences(personal).length, 2);
assert.match(personal, /놓치기 쉬워요\./u);
assert.match(personal, /담당자에게 확인하세요\.$/u);

// Advice must keep a capability condition, a duty and an inability distinct.
assert.equal(directAction('좋은 물건을 빌릴 수 있다면 먼저 빌려 본다.'),
  '좋은 물건을 빌릴 수 있다면 먼저 빌려 보세요.');
assert.equal(directAction('서로 정한 약속을 지켜야 한다.'), '서로 정한 약속을 지켜야 해요.');
assert.equal(directAction('지금은 결과를 알지 못한다.'), '지금은 결과를 알지 못해요.');
assert.equal(directAction('급한 약속은 뒤로 미뤄 본다.'), '급한 약속은 뒤로 미루세요.');
assert.equal(directAction('먼저 맡을 일을 정해 본다.'), '먼저 맡을 일을 정하세요.');
assert.equal(directAction('내 선택권을 지켜 본다.'), '내 선택권을 지키세요.',
  'keeping a boundary is not merely watching it');
assert.equal(directAction('그 상황을 지켜본다.'), '그 상황을 지켜보세요.',
  'watching a situation remains a different verb');

// Paragraphs may be split for readability. Check the authored conditions,
// subject/object context and negative abilities, not the old sentence count.
function plainContent(text) {
  return String(text).replace(/[.,;:!?。！？，、；：]/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function auditContext(text, revised, id) {
  const normalized = plainContent(revised);
  for (const sentence of splitSummarySentences(text)) {
    const words = sentence.trim().split(/\s+/u);
    const subjectContext = words.slice(0, -4).join(' ');
    if (subjectContext) {
      assert.ok(normalized.includes(plainContent(subjectContext)),
        `${id}: preserve the subject/object and its context: ${subjectContext}`);
    }
    for (const match of sentence.matchAll(/[가-힣]+(?:면|더라도|라도|때만|경우만)(?=[,\s]|$)/gu)) {
      const condition = sentence.slice(0, match.index + match[0].length);
      assert.ok(normalized.includes(plainContent(condition)),
        `${id}: preserve the full condition: ${condition}`);
    }
    for (const match of sentence.matchAll(/(?:[가-힣]+\s+)?수(?:는|도)?\s+없|[가-힣]+지\s+못|[가-힣]+지\s+않을|아닐\s+수|못할\s+수/gu)) {
      assert.ok(revised.includes(match[0]), `${id}: preserve the negative ability: ${match[0]}`);
    }
  }
  for (const match of text.matchAll(/“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|"[^"]*"/gu)) {
    assert.ok(revised.includes(match[0]), `${id}: preserve the complete quotation: ${match[0]}`);
  }
  if (/지켜 본다(?=[.!?]|$)/u.test(text)) {
    assert.doesNotMatch(revised, /지켜보세요[.!?]/u, `${id}: keeping must not become watching`);
  }
}

function audit(entries, transform) {
  let changed = 0, before = 0, after = 0;
  for (const { id, text } of entries) {
    const revised = transform(text);
    assert.ok(revised.trim(), `${id}: the interpretation is not emptied`);
    assert.equal(transform(revised), revised, `${id}: the same reading never accumulates another frame`);
    auditContext(text, revised, id);
    assert.doesNotMatch(revised, /바람이 있는 마음|선택의 확인할 근거|알아보는 살펴볼 단서|지(?:는)? 말아 (?:본다|준다)|같지(?:는)? 않는다|늦지(?:는)? 않는다|수 있을 수|해야하세요|해야세요|미뤄세요|하세세요|세요요|요요[.!?]|undefined|\[object Object\]/u,
      `${id}: do not generate a malformed ending or duplicated frame`);
    changed += revised !== text;
    before += (text.match(/수(?:도)? 있(?:다|어|지)/gu) || []).length;
    after += (revised.match(/수(?:도)? 있(?:다|어|지)/gu) || []).length;
  }
  return { total: entries.length, changed, before, after };
}
const insights = Object.entries(CASE_GUIDES).flatMap(([topicId, topic]) =>
  Object.entries(topic.cards).map(([cardId, pair]) => ({ id: `${topicId}/${cardId}/insight`, text: pair[0] })));
const actions = Object.entries(CASE_GUIDES).flatMap(([topicId, topic]) =>
  Object.entries(topic.cards).map(([cardId, pair]) => ({ id: `${topicId}/${cardId}/action`, text: pair[1] })));
const personalCards = PERSONAL_CONTEXTS.flatMap(context => Object.entries(context.cards)
  .map(([cardId, text]) => ({ id: `${context.id}/${cardId}/personal`, text })));
const ruleEntries = part => Object.entries(CARD_INTERPRETATIONS)
  .map(([cardId, rule]) => ({ id: `${cardId}/${part}`, text: rule[part] }));
const coverage = {
  insights: audit(insights, directInterpretation),
  actions: audit(actions, directAction),
  personal: audit(personalCards, directCardAdvice),
  problems: audit(ruleEntries('problem'), directInterpretation),
  outcomes: audit(ruleEntries('outcome'), directInterpretation)
};
assert.equal(coverage.insights.total, 3900, 'all actual card/topic explanations are checked');
assert.equal(coverage.actions.total, 3900, 'all actual card/topic actions are checked');
assert.equal(coverage.personal.total, 1170, 'all situation-specific card explanations are checked');
assert.equal(coverage.outcomes.total, 78, 'all card outcomes keep conditions and complete sentences');
console.log('PASS tarot voice: interpreted meaning, actionable verbs, conditions, negatives, quotes and authored examples preserved');
console.log(JSON.stringify(coverage));
