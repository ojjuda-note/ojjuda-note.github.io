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
assert.match(clearerRisk, /경고해\.$/u);
assert.doesNotMatch(clearerRisk, /반드시|무조건|확정|성공한다|실패한다/u);

const conditional = '각자 맡을 일을 확인한다면 반복하는 수고를 덜 수 있어.';
const clearerConditional = directInterpretation(conditional);
assert.ok(clearerConditional.startsWith('각자 맡을 일을 확인한다면 '));
assert.match(clearerConditional, /목표야\.$/u);
assert.doesNotMatch(clearerConditional, /덜어져|없어져|해결돼/u, 'a possible benefit is a target, not a promised result');

// Late discovery or less attention must never become an instruction to neglect a condition.
assert.match(directInterpretation('확인하지 않으면 뒤늦게 알 수 있어.'), /뒤늦게 알게 되는 상황을 짚어/u);
assert.doesNotMatch(directInterpretation('확인하지 않으면 뒤늦게 알 수 있어.'), /목표야/u);
assert.doesNotMatch(directInterpretation('시작이 좋아 보이면 관리할 일까지는 덜 살필 수 있어.'), /덜 살펴봐|덜 살피는 게 목표야|덜 살피는 데 초점을/u);

// Original dialogue, refusal, consent and health limits keep their exact meaning and wording.
for (const text of [
  '질병을 진단할 수는 없어. 진단은 의료진에게 확인해야 해.',
  '상대가 거절했거나 연락하지 말라고 했다면 다시 연락하지 마.',
  '무응답을 동의로 볼 수는 없어.',
  '검사 결과가 없으면 건강 상태를 단정할 수 없어.',
  '지금 보이는 차이가 잘못은 아닐 수 있어.',
  '사람마다 반응이 같지 않을 수 있어.',
  '원하는 결과를 얻지 못할 수 있어.',
  '이 기록만으로는 이유를 알 수 없어.'
]) {
  assert.equal(directInterpretation(text), text);
  assert.equal(directAction(text), text);
}
const quoted = '‘성급하게 선택할 수 있어. 멈춰 볼 수 있어?’라는 말을 적고 실제 조건을 확인할 수 있어.';
assert.ok(directAction(quoted).startsWith('‘성급하게 선택할 수 있어. 멈춰 볼 수 있어?’라는 말을 적고 '));
assert.match(directAction(quoted), /실제 조건을 확인해\.$/u);
assert.equal(splitSummarySentences(directAction(quoted)).length, 1);
const nested = '“‘준비를 미룰 수 있어.’라고 말했지?”라는 질문 뒤에는 필요한 조건을 살펴볼 수 있어.';
assert.ok(directAction(nested).includes('“‘준비를 미룰 수 있어.’라고 말했지?”'));

// A dictionary entry must not change a longer, unrelated Korean word.
assert.equal(directInterpretation('지원할 수 있어.'), '지원할 수 있어.');
assert.equal(directInterpretation('불필요할 수 있어.'), '불필요할 수 있어.');
assert.equal(directInterpretation('그 문장은 모호해서 옮긋할 수 있어.'), '그 문장은 모호해서 옮긋할 수 있어.');

const example = '예를 들어 갑자기 부탁을 받으면 당장 답하기 어려울 수 있어.';
assert.equal(directInterpretation(example), example);
assert.equal(directAction(example), example);

// Keep the subject and object: an experience remains an experience, not a new method.
assert.equal(directInterpretation('친구의 경험이 도움이 될 수 있어.'), '친구의 경험이 도움이 된다는 해석이야.');
assert.equal(directInterpretation('잘했던 경험이 관심을 알아보는 단서가 될 수 있어.'),
  '잘했던 경험이 관심을 알아보는 단서가 된다는 해석이야.');
const personal = directCardAdvice('생각만 하다가 질문할 시기를 놓칠 수 있어. 모르는 조건을 적고 담당자에게 확인할 수 있어.');
assert.equal(splitSummarySentences(personal).length, 2);
assert.match(personal, /놓치는 문제를 경고해\./u);
assert.match(personal, /담당자에게 확인해\.$/u);

function audit(texts, transform) {
  let changed = 0, before = 0, after = 0;
  for (const text of texts) {
    const revised = transform(text);
    assert.equal(transform(revised), revised, 'the same reading never accumulates another frame');
    assert.equal(splitSummarySentences(revised).length, splitSummarySentences(text).length,
      'clarity changes no sentence boundary or two-line summary unit');
    assert.doesNotMatch(revised, /바람이 있는 마음|선택의 확인할 근거|알아보는 살펴볼 단서|undefined|\[object Object\]/u);
    changed += revised !== text;
    before += (text.match(/수(?:도)? 있어/gu) || []).length;
    after += (revised.match(/수(?:도)? 있어/gu) || []).length;
  }
  return { total: texts.length, changed, before, after };
}
const insights = Object.values(CASE_GUIDES).flatMap(topic => Object.values(topic.cards).map(pair => pair[0]));
const actions = Object.values(CASE_GUIDES).flatMap(topic => Object.values(topic.cards).map(pair => pair[1]));
const personalCards = PERSONAL_CONTEXTS.flatMap(context => Object.values(context.cards));
const coverage = {
  insights: audit(insights, directInterpretation),
  actions: audit(actions, directAction),
  personal: audit(personalCards, directCardAdvice),
  problems: audit(Object.values(CARD_INTERPRETATIONS).map(rule => rule.problem), directInterpretation),
  outcomes: audit(Object.values(CARD_INTERPRETATIONS).map(rule => rule.outcome), directInterpretation)
};
assert.ok(coverage.insights.changed >= 1000, 'the change reaches the authored topic content, not just repeated introductions');
assert.ok(coverage.personal.changed >= 250, 'the change also reaches the situation-specific card advice');
assert.ok(coverage.outcomes.changed >= 40, 'conditional outcome directions become clear without a real-world guarantee');
console.log('PASS tarot voice: interpreted meaning, actionable verbs, conditions, negatives, quotes and authored examples preserved');
console.log(JSON.stringify(coverage));
