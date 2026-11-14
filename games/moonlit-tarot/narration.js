import { CARD_LIFE_THEMES } from './life-themes.js?v=20261114-tarot-copy1';
import { buildDomainGroup } from './domain-narration.js?v=20261114-tarot-copy1';
import { getCardInterpretation } from './interpretation-engine.js?v=20261114-tarot-copy1';
import { getPersonStory } from './person-stories.js?v=20261114-tarot-copy1';
import { buildPersonNarrative } from './person-narrative.js?v=20261114-tarot-copy1';
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
    obstacle: '일정이 어긋나면 꼭 지킬 약속과 다른 날로 옮길 일을 나눠. 하루 계획을 못 지켰다고 남은 일까지 포기할 필요는 없어.'
  },
  love: {
    obstacle: '연락 간격이나 약속이 달라졌다면 이유를 직접 물어봐. 서로 원하는 관계가 다르다면 계속 설득하려 하지 마. 그 차이를 받아들이고 관계를 이어 갈지 결정해.'
  },
  money: {
    obstacle: '갑자기 돈이 필요해지면 언제까지 얼마를 내야 하는지 확인해. 새로 결제하기 전에 취소하거나 금액을 줄일 수 있는 지출부터 찾아봐. 확인이 필요하면 담당자에게 직접 물어봐.'
  },
  work: {
    obstacle: '새 요청이 들어오면 이미 맡은 일과 마감을 함께 알려 줘. 무엇을 먼저 끝낼지 확인하고 필요한 시간을 분명히 말해.'
  }
});
// Complete sentences avoid joining several long context phrases into one claim.
const REPORT_PRACTICE = Object.freeze({
  overall: {
    achievement: '지난 일주일에 끝낸 일을 살펴봐. 큰 결과만 찾을 필요는 없어. 전에는 못 했던 선택을 했거나 다음에도 쓸 방법을 익혔다면 그것도 성취야.'
  },
  love: {
    achievement: '서로 나눈 말과 지킨 약속을 떠올려 봐. 마음을 솔직히 말했거나 불편한 부탁을 거절한 경험도 돌아볼 만한 성취야.'
  },
  money: {
    achievement: '최근 결제 내역과 매달 나가는 돈을 살펴봐. 필요 없는 결제를 줄였거나 사고 싶은 물건을 미룬 경험이 있는지 찾아봐. 꼭 큰돈을 모아야만 성취인 건 아니야.'
  },
  work: {
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
  const person = getPersonStory(card.id);
  const introduction = `${['첫 번째', '두 번째', '세 번째'][index]} 카드는 ‘${displayName}’${hasFinalConsonant(displayName) ? '이야' : '야'}. ‘${position.label}’에 관한 풀이를 들려줄게. ${explanation}`.trim();
  const meaning = rule.meaning;
  const positionMeaning = directInterpretation(clean(guidance.positions[index === 1 ? 0 : index]));
  const lifeTheme = Object.fromEntries(Object.entries(CARD_LIFE_THEMES[card.id]).map(([key, text]) =>
    [key, directInterpretation(text)]));
  const topicMeaning = directInterpretation(clean(card.topics[topicId]));
  const example = clean(detail.example);
  const action = directAction(clean(detail.action));
  const guidanceCaution = directInterpretation(clean(guidance.caution));
  const caution = unique([foundation.caution, guidanceCaution]).join(' ');
  const appliedMeaning = `${person[topicId]} ${index === 2 ? action : person.cost}`;
  const paragraphs = [
    person.portrait,
    person[topicId],
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
    summary: splitSummarySentences(person[topicId])[0],
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
    personStory: person,
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
  const questions = REPORT_QUESTIONS[topicId];
  const practice = REPORT_PRACTICE[topicId];
  const story = buildPersonNarrative({ cards, topicId, names });
  const [firstPerson, currentPerson, nextPerson] = story.stories;
  const ritual = solution.action;
  const problemSections = [
    section('together', '카드에 비친 너의 이야기', story.paragraphs, story.summaryLines),
    section('problem-now', '지금 일어나는 문제', [
      `‘${names[0]}’ 카드가 짚는 핵심 문제야. ${firstPerson[topicId]} ${firstPerson.defense}`,
      `${firstPerson.longing} ${firstPerson.cost}`
    ], cardSummary(cards[0], firstPerson.longing, firstPerson.cost)),
    section('situation-now', '지금 상황과 속마음', [
      `‘${names[1]}’ 카드가 비추는 지금의 네 모습이야. ${currentPerson[topicId]}`,
      `${currentPerson.longing} ${currentPerson.defense} ${currentPerson.cost}`
    ], cardSummary(cards[1], currentPerson[topicId], currentPerson.defense)),
    section('solution', '지금 선택할 해결 방법', [
      `‘${names[2]}’ 카드가 짚는 선택의 기준이야. ${nextPerson[topicId]} ${nextPerson.longing} ${nextPerson.cost}`,
      `이제 이 마음을 행동으로 옮겨 보렴. ${solution.action}`
    ], cardSummary(cards[2], nextPerson.longing, solution.action)),
    section('possible-outcome', '실천한 뒤 살펴볼 변화', [
      `‘${names[2]}’ 카드가 짚는 변화의 핵심이야. ${solution.lifeTheme.change}`,
      `이때 살릴 강점도 함께 기억하렴. ${nextPerson.portrait} 함께 조심할 점도 있어. ${nextPerson.cost}`
    ], cardSummary(cards[2], solution.lifeTheme.change, nextPerson.cost))
  ];
  const strengthsSummary = summaryLinesFrom(firstPerson.portrait, nextPerson.portrait, [currentPerson.portrait]);
  strengthsSummary[0] = `‘${cards[0].name}’ 카드: ${strengthsSummary[0]}`;
  strengthsSummary[1] = `‘${cards[2].name}’ 카드: ${strengthsSummary[1]}`;
  const timelineSections = [
    section('strengths', '나의 성향과 강점', [
      `‘${names[0]}’에 비친 네 모습이야. ${firstPerson.portrait}`,
      `‘${names[1]}’ 카드에는 이런 마음이 담겨 있어. ${currentPerson.portrait}`,
      `‘${names[2]}’ 카드는 네가 살려야 할 강점을 보여 줘. ${nextPerson.portrait}`
    ], strengthsSummary),
    section('past-flow', '과거의 흐름', [
      `‘${names[0]}’ 카드로 지난 선택을 돌아보자. ${problem.lifeTheme.past}`,
      `이 카드가 짚는 선택의 이유는 이래. ${firstPerson.longing} ${firstPerson.defense}`
    ], cardSummary(cards[0], problem.lifeTheme.past)),
    section('past-hardships', '반복해서 힘들어지는 이유', [
      `‘${names[0]}’ 카드가 짚는 어려움이야. ${firstPerson.cost} ${problem.guidanceCaution}`,
      `비슷한 일로 다시 힘들 때는 이렇게 해 봐. ${problem.action}`
    ], cardSummary(cards[0], firstPerson.cost, problem.action)),
    section('past-achievements', '내가 해낸 일', [
      `‘${names[0]}’ 카드는 이런 성취에 주목해. ${problem.lifeTheme.achievement}`,
      practice.achievement
    ], cardSummary(cards[0], problem.lifeTheme.achievement)),
    section('present-luck', '지금 드러나는 나의 모습', [
      `‘${names[1]}’ 카드는 지금의 고민을 이렇게 읽어. ${currentPerson[topicId]} ${situation.guidanceCaution}`,
      `이 마음이 부담으로 커질 때는 이렇게 해 봐. ${situation.action}`
    ], cardSummary(cards[1], currentPerson[topicId], situation.action)),
    section('future-change', '앞으로의 변화', [
      `‘${names[2]}’ 카드가 전하는 변화의 메시지야. ${solution.lifeTheme.change}`,
      `변화를 준비하며 네가 원하는 것도 분명히 해 두렴. ${nextPerson[topicId]}`
    ], cardSummary(cards[2], solution.lifeTheme.change)),
    section('future-hardships', '앞으로 조심할 일과 대처', [
      `‘${names[2]}’ 카드가 짚는 주의점이야. ${nextPerson.cost} ${solution.guidanceCaution}`,
      questions.obstacle
    ], cardSummary(cards[2], nextPerson.cost, questions.obstacle))
  ];
  const groups = [
    { id: 'problem', label: '나의 이야기', sections: problemSections },
    { id: 'timeline', label: '과거·현재·미래', sections: timelineSections },
    buildDomainGroup({ cards, readings })
  ];
  const synthesis = story.paragraphs.join('\n\n');
  const paragraphs = ['problem-now', 'situation-now', 'solution'].map(id =>
    problemSections.find(item => item.id === id).paragraphs.join('\n\n'));
  const oneLine = splitSummarySentences(firstPerson[topicId])[0];
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
  })].join('\n\n');
  return {
    ...base,
    headline: '카드에 비친 너의 이야기',
    groups,
    sections: groups.flatMap(group => group.sections),
    paragraphs,
    synthesis,
    summary: synthesis,
    oneLine,
    ritual,
    ritualInReading: true,
    detailSections,
    text
  };
}
