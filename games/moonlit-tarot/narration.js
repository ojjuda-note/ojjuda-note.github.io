import { CARD_LIFE_THEMES } from './life-themes.js?v=20261113-tarot-life1';
import { buildDomainGroup } from './domain-narration.js?v=20261113-tarot-easy1';
import { MAIN_CONTEXTS, getCardInterpretation, interpretCard, connectCards, withParticle } from './interpretation-engine.js?v=20261113-tarot-easy1';
import { splitSummarySentences, summaryLinesFrom } from './reading-summary.js?v=20261113-tarot-summary1';
import { directInterpretation, directAction } from './reading-voice.js?v=20261113-tarot-easy1';

// Card meanings, concrete circumstances and the relationship between the
// actual cards are kept distinct. The historical source remains available.
const TOPIC_NAMES = Object.freeze({
  overall: '전체 운세', love: '연애와 관계', money: '돈과 생활', work: '일과 도전'
});
// These questions add a different reflection to each view. Detailed card
// examples remain in the individual reading instead of being copied here.
const REPORT_QUESTIONS = Object.freeze({
  overall: {
    problem: '마음에 걸리는 일이 많다면 처음 힘들어졌던 순간부터 떠올려 봐. 부탁받은 일과 스스로 더 맡은 일을 따로 적어. 어디서 일이 늘어났는지부터 찾는 거야.',
    past: '지난 선택을 돌아볼 때는 그때 알았던 것부터 생각해 봐. 지금은 아는 답도 그때는 몰랐을 수 있어. 당시 네가 바꿀 수 있었던 일과 어쩔 수 없었던 일을 나눠 봐.',
    future: '새 일을 맡았다면 처음 세운 계획과 실제로 해 본 결과를 비교해. 예상과 달랐던 점을 적어 두고 다음 계획에 반영해.',
    obstacle: '일정이 어긋나면 꼭 지킬 약속과 다른 날로 옮길 일을 나눠. 하루 계획을 못 지켰다고 남은 일까지 포기할 필요는 없어.'
  },
  love: {
    problem: '상대가 실제로 한 말과 네가 기대했던 말을 나눠 봐. 같은 약속을 서로 다르게 이해했다면 그 부분부터 이야기해.',
    past: '지난 관계에서 좋았던 순간과 힘들었던 순간을 하나씩 떠올려 봐. 다시 지키고 싶은 약속과 다음에는 다르게 말하고 싶은 일을 따로 적어.',
    future: '만나는 날이 늘었다면 혼자 쉬고 싶은 시간도 말해. 한 사람이 싫다고 했을 때 다른 사람도 그 뜻을 존중하는지 살펴봐.',
    obstacle: '연락 간격이나 약속이 달라졌다면 이유를 직접 물어봐. 서로 원하는 관계가 다르다면 계속 설득하려 하지 마. 그 차이를 받아들이고 관계를 이어 갈지 결정해.'
  },
  money: {
    problem: '돈 때문에 마음이 급하다면 지금 낼 돈과 앞으로 매달 나갈 돈을 따로 적어. 작은 결제가 여러 번 쌓였는지, 큰돈을 한 번 써야 하는지부터 확인해.',
    past: '전에 산 물건을 떠올릴 때는 가격과 함께 왜 샀는지도 생각해 봐. 지금도 잘 쓰는 물건인지, 생활이 바뀌어 안 쓰게 됐는지 살펴봐. 처음부터 필요 없었던 물건과는 구분하는 거야.',
    future: '큰 지출을 준비할 때는 결제 뒤에 남을 생활비부터 계산해. 꼭 남겨 둘 돈을 먼저 빼고, 그 범위를 넘는 구입은 미뤄.',
    obstacle: '갑자기 돈이 필요해지면 언제까지 얼마를 내야 하는지 확인해. 새로 결제하기 전에 취소하거나 금액을 줄일 수 있는 지출부터 찾아봐. 확인이 필요하면 담당자에게 직접 물어봐.'
  },
  work: {
    problem: '일이 막혔다면 혼자 끝낼 수 있는 일과 다른 사람의 답이 필요한 일을 나눠. 준비가 부족한 건지, 누가 결정할지 몰라 기다리는 건지부터 확인해.',
    past: '지난 일을 돌아볼 때는 무엇을 끝냈고 어디까지 맡았는지 함께 적어 봐. 네가 바꿀 수 있었던 방법과 다른 사람이 바꾼 요구를 나눠. 다음에도 쓸 방법을 그중에서 찾아봐.',
    future: '새 일을 맡았다면 처음 만든 결과물을 일찍 보여 줘. 요청한 내용과 맞는지 확인하고 다음 작업으로 넘어가. 일이 추가되면 맡을 범위와 마감도 다시 정해.',
    obstacle: '새 요청이 들어오면 이미 맡은 일과 마감을 함께 알려 줘. 무엇을 먼저 끝낼지 확인하고 필요한 시간을 분명히 말해.'
  }
});
// Complete sentences avoid joining several long context phrases into one claim.
const REPORT_PRACTICE = Object.freeze({
  overall: {
    limit: '오늘 끝낼 일의 양을 정해. 일을 더 맡기 전에 쉴 시간이 남는지도 확인해.',
    check: '꼭 해야 할 일을 끝내면서 쉴 시간도 남았는지 확인해.',
    retry: '여전히 바쁘다면 지금 해야 할 일과 미뤄도 되는 일을 다시 나눠.',
    strengths: '전에 잘해 낸 일을 하나 떠올려 봐. 어떤 방법이 통했고 누구의 도움이 있었는지 살펴봐.',
    achievement: '지난 일주일에 끝낸 일을 살펴봐. 큰 결과만 찾을 필요는 없어. 전에는 못 했던 선택을 했거나 다음에도 쓸 방법을 익혔다면 그것도 성취야.'
  },
  love: {
    limit: '연락과 만남은 서로 동의한 만큼 이어 가. 혼자 쉬고 싶은 시간도 지켜 줘.',
    check: '한 사람만 재촉하지 않아도 대화와 약속이 이어지는지 확인해.',
    retry: '여전히 불편하다면 원하는 연락 간격과 만남 횟수를 서로 이야기해.',
    strengths: '편하게 대화했던 순간을 떠올려 봐. 어떤 말이 마음을 열게 했고 무엇을 함께 즐겼는지 살펴봐.',
    achievement: '서로 나눈 말과 지킨 약속을 떠올려 봐. 마음을 솔직히 말했거나 불편한 부탁을 거절한 경험도 돌아볼 만한 성취야.'
  },
  money: {
    limit: '이번 달 생활비를 먼저 빼 둬. 남은 돈 안에서 쓸 금액을 정해.',
    check: '겹치는 지출을 줄이고 정해 둔 생활비가 남았는지 확인해.',
    retry: '아직 돈이 부족하다면 추가 비용과 취소할 수 있는 결제를 다시 확인해.',
    strengths: '이미 가진 물건과 쓰고 있는 서비스를 살펴봐. 새로 돈을 쓰지 않고도 해결한 경험이 있는지 떠올려 봐.',
    achievement: '최근 결제 내역과 매달 나가는 돈을 살펴봐. 필요 없는 결제를 줄였거나 사고 싶은 물건을 미룬 경험이 있는지 찾아봐. 꼭 큰돈을 모아야만 성취인 건 아니야.'
  },
  work: {
    limit: '어디까지 맡고 언제 끝낼지 먼저 정해. 완성한 일을 어떻게 확인할지도 요청한 사람과 맞춰 둬.',
    check: '누가 무엇을 할지 정해졌고 실제 결과물을 확인했는지 살펴봐.',
    retry: '아직 일이 막혀 있다면 누가 결정해야 하는지, 어디까지 맡아야 하는지 다시 물어봐.',
    strengths: '전에 써 본 도구와 잘 끝낸 일을 떠올려 봐. 네가 잘한 부분과 동료의 도움이 필요했던 부분을 나눠 봐.',
    achievement: '요청받은 일과 실제로 끝낸 일을 비교해 봐. 결과가 완벽하지 않아도 새로 익힌 방법이 있는지 살펴봐. 다음 작업에 다시 쓸 수 있는 경험도 성취야.'
  }
});
const SUITS = Object.freeze({
  wands: { name: '완드', plain: '지팡이', object: '지팡이를' },
  cups: { name: '컵', plain: '잔', object: '잔을' },
  swords: { name: '소드', plain: '검', object: '검을' },
  pentacles: { name: '펜타클', plain: '동전', object: '동전을' }
});
const RANKS = Object.freeze({ page: '시종', knight: '기사', queen: '여왕', king: '왕' });
const NUMBERS = Object.freeze({ ace: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' });

function hasFinalConsonant(text) {
  const last = String(text).trim().slice(-1);
  if (/\d/.test(last)) return '013678'.includes(last);
  const code = last.charCodeAt(0);
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
}
function objectOf(text) { return `${text}${hasFinalConsonant(text) ? '을' : '를'}`; }
function andWith(text) { return `${text}${hasFinalConsonant(text) ? '과' : '와'}`; }
function isCalled(text) { return `${text}${hasFinalConsonant(text) ? '이야' : '야'}`; }
function clean(text) { return String(text ?? '').trim(); }
function unique(parts) {
  const seen = new Set();
  return parts.map(clean).filter(text => {
    const key = text.replace(/\s+/g, ' ');
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function checkReadingInput({ card, topicId, index, position, foundation, guidance, detail }) {
  if (!card?.id || !card.name || !Object.hasOwn(TOPIC_NAMES, topicId)
      || !Number.isInteger(index) || index < 0 || index > 2 || !position?.label
      || !foundation?.symbol || !foundation.takeaway || !foundation.caution
      || !guidance?.meaning || !guidance.positions?.[index === 1 ? 0 : index]
      || !CARD_LIFE_THEMES[card.id] || ['strength', 'past', 'achievement', 'change'].some(key => !CARD_LIFE_THEMES[card.id][key])
      || !card.topics?.[topicId] || !detail?.example || !detail.action) {
    throw new Error('tarot_narration_requires_authored_card_meanings');
  }
}
function naming(card) {
  const suit = SUITS[card.suit];
  if (!suit) return { displayName: card.name, explanation: '' };
  const rank = RANKS[card.rank];
  const displayName = rank ? `${suit.object} 든 ${rank}`
    : NUMBERS[card.rank] ? `${suit.plain} ${NUMBERS[card.rank]}`
      : card.name.replace(suit.name, suit.plain);
  const rankNote = card.rank === 'ace' ? '에이스는 그 무늬의 첫 카드를 부르는 이름이야.'
    : card.rank === 'page' ? '시종은 곁에서 돕는 사람을 가리키는 이름이야.' : '';
  const explanation = unique([
    displayName === card.name ? '' : `원래 이름은 ‘${card.name}’${hasFinalConsonant(card.name) ? '이야' : '야'}.`,
    suit.name === suit.plain ? '' : `${suit.name}${hasFinalConsonant(suit.name) ? '은' : '는'} ${suit.plain}${hasFinalConsonant(suit.plain) ? '을' : '를'} 뜻해.`,
    rankNote
  ]).join(' ');
  return { displayName, explanation };
}
function fullName(card, reading) {
  const display = reading.displayName || naming(card).displayName;
  return display === card.name ? display : `${display}(${card.name})`;
}

/** Explain the actual card directly, without seven repeated introductions. */
export function narrateReading({ card, topicId, index, position, foundation, guidance, detail, base }) {
  checkReadingInput({ card, topicId, index, position, foundation, guidance, detail });
  const { displayName, explanation } = naming(card);
  const rule = getCardInterpretation(card.id);
  const context = MAIN_CONTEXTS[topicId];
  const introduction = `${['첫 번째', '두 번째', '세 번째'][index]} 카드는 ‘${displayName}’${hasFinalConsonant(displayName) ? '이야' : '야'}. 여기서는 ‘${position.label}’을 설명해. ${explanation}`.trim();
  const meaning = rule.meaning;
  const positionMeaning = directInterpretation(clean(guidance.positions[index === 1 ? 0 : index]));
  const lifeTheme = Object.fromEntries(Object.entries(CARD_LIFE_THEMES[card.id]).map(([key, text]) =>
    [key, directInterpretation(text)]));
  const topicMeaning = directInterpretation(clean(card.topics[topicId]));
  const example = clean(detail.example);
  const action = directAction(clean(detail.action));
  const guidanceCaution = directInterpretation(clean(guidance.caution));
  const caution = unique([foundation.caution, guidanceCaution]).join(' ');
  const role = ['problem', 'scene', 'response'][index];
  const appliedMeaning = interpretCard(card.id, role, context)
    + (index === 2 ? ` ${interpretCard(card.id, 'outcome', context)}` : '');
  const paragraphs = [
    `${meaning} ${clean(foundation.symbol)}`,
    topicMeaning,
    positionMeaning,
    example,
    clean(foundation.caution)
  ];
  return {
    ...base,
    originalName: card.name,
    displayName,
    introduction,
    paragraphs,
    detailSections: base.sections,
    summary: meaning,
    text: [introduction, ...paragraphs].join('\n\n'),
    meaning,
    traditionalMeaning: clean(guidance.meaning),
    foundationTakeaway: clean(foundation.takeaway),
    symbol: clean(foundation.symbol),
    positionMeaning,
    appliedMeaning,
    positionLabel: position.label,
    roleIndex: index,
    topicMeaning,
    example,
    action,
    caution,
    foundationCaution: clean(foundation.caution),
    guidanceCaution,
    lifeTheme,
    theme: clean(foundation.theme)
  };
}

function section(id, title, paragraphs, summaryLines) {
  return { id, title, paragraphs: unique(paragraphs), summaryLines };
}
function cardSummary(card, first, second = first) {
  const lines = summaryLinesFrom(first, second);
  lines[0] = `‘${card.name}’ 카드: ${lines[0]}`;
  return lines;
}

/** Each view adds a different part of the reading instead of repeating examples. */
export function narrateSummary({ cards, topicId, readings, innerMeaning, flowMeaning, direction, base }) {
  if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards.map(card => card?.id)).size !== 3
      || !Array.isArray(readings) || readings.length !== 3 || !Object.hasOwn(TOPIC_NAMES, topicId)
      || cards.some(card => !card?.id || !card.name) || readings.some(reading => !reading?.meaning || !reading.positionMeaning || !reading.topicMeaning || !reading.action || !reading.example || !reading.theme
        || !reading.foundationCaution || !reading.guidanceCaution || !reading.lifeTheme)
      || !innerMeaning || !flowMeaning || !direction) {
    throw new Error('tarot_narration_requires_three_ordered_readings');
  }
  const names = cards.map((card, index) => fullName(card, readings[index]));
  const [problem, situation, solution] = readings;
  const context = MAIN_CONTEXTS[topicId];
  const questions = REPORT_QUESTIONS[topicId];
  const practice = REPORT_PRACTICE[topicId];
  const firstTheme = problem.theme.split(' · ')[0];
  const secondTheme = situation.theme.split(' · ')[0];
  const thirdTheme = solution.theme.split(' · ')[0];
  const ritual = solution.action;
  const link = (a, b) => connectCards({
    left: cards[a], right: cards[b], leftName: names[a], rightName: names[b],
    leftTheme: readings[a].theme, rightTheme: readings[b].theme, context,
    phase: a === 0 ? 'understand' : 'act'
  });
  const synthesisParagraphs = [link(0, 1), link(1, 2)];
  const pairMeanings = synthesisParagraphs.map(paragraph => splitSummarySentences(paragraph).slice(1));
  const synthesisSummary = summaryLinesFrom(pairMeanings[0].at(-1), pairMeanings[1].at(-1), pairMeanings.flat());
  synthesisSummary[0] = `‘${cards[0].name}’ · ‘${cards[1].name}’: ${synthesisSummary[0]}`;
  synthesisSummary[1] = `‘${cards[2].name}’ 카드: ${synthesisSummary[1]}`;
  const problemMeaning = interpretCard(cards[0].id, 'problem', context);
  const responseMeaning = interpretCard(cards[2].id, 'response', context);
  const outcomeMeaning = interpretCard(cards[2].id, 'outcome', context);
  const strengthsSummary = summaryLinesFrom(problem.lifeTheme.strength, solution.lifeTheme.strength,
    [situation.lifeTheme.strength]);
  strengthsSummary[0] = `‘${cards[0].name}’ 카드: ${strengthsSummary[0]}`;
  strengthsSummary[1] = `‘${cards[2].name}’ 카드: ${strengthsSummary[1]}`;
  const problemSections = [
    section('problem-now', '지금 일어나는 문제', [
      `‘${names[0]}’ 카드가 짚는 핵심 문제야. ${problemMeaning}`,
      `마음에서 살펴볼 부분은 ‘${innerMeaning}’${hasFinalConsonant(innerMeaning) ? '이야' : '야'}. ${questions.problem}`
    ], cardSummary(cards[0], problemMeaning)),
    section('situation-now', '현재 상황', [
      `‘${names[1]}’ 카드가 짚는 현재 상황이야. ${interpretCard(cards[1].id, 'scene', context)}`,
      `이 카드가 말하는 핵심은 ‘${flowMeaning}’${hasFinalConsonant(flowMeaning) ? '이야' : '야'}. ${withParticle(context.known, '을')} 살펴봐. 직접 겪은 일과 아직 짐작한 일을 나누고, 무엇을 더 알아봐야 할지 정해.`
    ], cardSummary(cards[1], situation.topicMeaning, situation.guidanceCaution)),
    section('solution', '해결 방법', [
      `‘${names[2]}’ 카드가 제시하는 해결 방법이야. ${responseMeaning}`,
      `먼저 이렇게 해 보자. ${directAction(clean(direction))} ${practice.limit}`
    ], cardSummary(cards[2], responseMeaning)),
    section('possible-outcome', '대처 뒤 확인할 변화', [
      `‘${names[2]}’ 카드를 따라 행동한 뒤 살펴볼 점이야. ${outcomeMeaning}`,
      `${practice.check} ${practice.retry}`
    ], cardSummary(cards[2], outcomeMeaning, practice.check)),
    section('together', '세 장을 함께 보면', synthesisParagraphs, synthesisSummary)
  ];
  const timelineSections = [
    section('strengths', '나의 성향과 강점', [
      `‘${names[0]}’ 카드에서 읽는 장점이야. ${problem.lifeTheme.strength} ‘${names[1]}’ 카드에서는 이 장점을 살펴봐. ${situation.lifeTheme.strength}`,
      `‘${names[2]}’ 카드가 보여 주는 강점이야. ${solution.lifeTheme.strength} ${practice.strengths}`
    ], strengthsSummary),
    section('past-flow', '과거의 흐름', [
      `‘${names[0]}’ 카드로 지난 시간을 돌아보자. ${problem.lifeTheme.past}`,
      questions.past
    ], cardSummary(cards[0], problem.lifeTheme.past)),
    section('past-hardships', '힘들었던 일', [
      `‘${names[0]}’ 카드는 이런 어려움을 조심하라고 말해. ${problem.guidanceCaution}`,
      `비슷한 일로 다시 힘들 때는 이렇게 해 봐. ${problem.action}`
    ], cardSummary(cards[0], problem.guidanceCaution, problem.action)),
    section('past-achievements', '내가 해낸 일', [
      `‘${names[0]}’ 카드를 보며 잘해 낸 일을 떠올려 보자. ${problem.lifeTheme.achievement}`,
      practice.achievement
    ], cardSummary(cards[0], problem.lifeTheme.achievement)),
    section('present-luck', '현재 운과 할 일', [
      `‘${names[1]}’ 카드는 지금 이 점을 주의하라고 말해. ${situation.guidanceCaution}`,
      `지금은 이 행동부터 해 보자. ${situation.action}`
    ], cardSummary(cards[1], situation.guidanceCaution, situation.action)),
    section('future-change', '앞으로의 변화', [
      `‘${names[2]}’ 카드가 앞으로 살펴보라는 내용이야. ${solution.lifeTheme.change}`,
      questions.future
    ], cardSummary(cards[2], solution.lifeTheme.change)),
    section('future-hardships', '앞으로 조심할 일과 대처', [
      `‘${names[2]}’ 카드는 이런 어려움에 대비하라고 말해. ${solution.guidanceCaution}`,
      questions.obstacle
    ], cardSummary(cards[2], solution.guidanceCaution, questions.obstacle))
  ];
  const groups = [
    { id: 'problem', label: '문제 해결', sections: problemSections },
    { id: 'timeline', label: '과거·현재·미래', sections: timelineSections },
    buildDomainGroup({ cards, readings })
  ];
  const synthesis = synthesisParagraphs.join('\n\n');
  const paragraphs = problemSections.slice(0, 3).map(item => item.paragraphs.join('\n\n'));
  const oneLine = `먼저 ${andWith(firstTheme)} ${objectOf(secondTheme)} 살펴봐. 다음 선택에서는 ${objectOf(thirdTheme)} 기억해.`;
  const detailSections = [
    { title: '함께 참고할 이야기', subtitle: base.oneLine, body: base.summary },
    ...(base.sections || []),
    { title: '원문에 담긴 생활 제안', subtitle: '', body: base.ritual }
  ];
  const text = [...groups.map(group => {
    const parts = [group.label];
    if (group.description) parts.push(group.description);
    let previousCategory;
    for (const item of group.sections) {
      if (item.categoryId && item.categoryId !== previousCategory) {
        const category = group.categories?.find(category => category.id === item.categoryId);
        if (category) parts.push(category.label);
        previousCategory = item.categoryId;
      }
      parts.push([item.title, item.subtitle, ...item.paragraphs].filter(Boolean).join('\n\n'));
    }
    return parts.join('\n\n');
  }), `오늘 해 볼 일\n${ritual}`].join('\n\n');
  return {
    ...base,
    headline: '세 카드가 짚는 문제와 해결 방법',
    groups,
    sections: groups.flatMap(group => group.sections),
    paragraphs,
    synthesis,
    summary: synthesis,
    oneLine,
    ritual,
    detailSections,
    text
  };
}
