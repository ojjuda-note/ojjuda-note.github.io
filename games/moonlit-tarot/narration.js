import { CARD_LIFE_THEMES } from './life-themes.js?v=20261113-tarot-life1';
import { buildDomainGroup } from './domain-narration.js?v=20261113-tarot-context1';
import { MAIN_CONTEXTS, getCardInterpretation, interpretCard, connectCards, withParticle } from './interpretation-engine.js?v=20261113-tarot-context1';

// Card meanings, concrete circumstances and the relationship between the
// actual cards are kept distinct. The historical source remains available.
const TOPIC_NAMES = Object.freeze({
  overall: '전체 운세', love: '연애와 관계', money: '돈과 생활', work: '일과 도전'
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
function firstSentence(text) {
  const value = clean(text);
  return value.match(/^.*?[.!?](?=\s|$)/)?.[0] || value;
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
    displayName === card.name ? '' : `카드에 적힌 원래 이름은 ‘${card.name}’${hasFinalConsonant(card.name) ? '이야' : '야'}. 쉽게는 ‘${displayName}’ 카드로 생각하면 돼.`,
    suit.name === suit.plain ? '' : `${suit.name}${hasFinalConsonant(suit.name) ? '은' : '는'} ${suit.plain}${hasFinalConsonant(suit.plain) ? '을' : '를'} 가리키는 이름이야.`,
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
  const introduction = `${['첫 번째', '두 번째', '세 번째'][index]} 카드는 ‘${displayName}’${hasFinalConsonant(displayName) ? '이야' : '야'}. ‘${position.label}’을 읽는 자리야. ${explanation}`.trim();
  const meaning = rule.meaning;
  const positionMeaning = clean(guidance.positions[index === 1 ? 0 : index]);
  const lifeTheme = CARD_LIFE_THEMES[card.id];
  const topicMeaning = clean(card.topics[topicId]);
  const example = clean(detail.example);
  const action = clean(detail.action);
  const caution = unique([foundation.caution, guidance.caution]).join(' ');
  const role = ['problem', 'scene', 'response'][index];
  const appliedMeaning = interpretCard(card.id, role, context)
    + (index === 2 ? ` ${interpretCard(card.id, 'outcome', context)}` : '');
  const paragraphs = [
    `${meaning} ${clean(foundation.symbol)}`,
    topicMeaning,
    appliedMeaning,
    example,
    action,
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
    guidanceCaution: clean(guidance.caution),
    lifeTheme,
    theme: clean(foundation.theme)
  };
}

function section(id, title, paragraphs) {
  return { id, title, paragraphs: unique(paragraphs) };
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
  const topicName = TOPIC_NAMES[topicId];
  const firstTheme = problem.theme.split(' · ')[0];
  const secondTheme = situation.theme.split(' · ')[0];
  const ritual = solution.action;
  const link = (a, b) => connectCards({
    left: cards[a], right: cards[b], leftName: names[a], rightName: names[b],
    leftTheme: readings[a].theme, rightTheme: readings[b].theme, context
  });
  const synthesisParagraphs = [link(0, 1), link(1, 2)];
  const problemSections = [
    section('problem-now', '지금 일어나는 문제', [
      `‘${names[0]}’ 카드가 비추는 문제의 실마리야. ${interpretCard(cards[0].id, 'problem', context)}`,
      `그 바탕에 있는 마음은 ‘${innerMeaning}’로 읽을 수 있어. ‘${topicName}’에 가까이 가져와 보면 이런 모습이야. ${problem.topicMeaning}`
    ]),
    section('situation-now', '현재 상황', [
      `‘${names[1]}’ 카드로 지금의 조건을 읽어 볼게. ${interpretCard(cards[1].id, 'scene', context)}`,
      `이 카드에서 짚는 흐름은 ‘${flowMeaning}’에 가까워. ${withParticle(context.known, '을')} 기준으로 실제로 달라진 조건과 아직 예상에 머문 부분을 나누면, 어디에 힘을 써야 할지도 구체적으로 보일 수 있어.`
    ]),
    section('solution', '해결 방법', [
      `‘${names[2]}’ 카드의 해결 방식은 이래. ${interpretCard(cards[2].id, 'response', context)}`,
      `이 선택의 우선순위를 한 걸음 더 좁혀 보면 이렇게 읽혀. ${clean(direction)} ${withParticle(context.boundary, '을')} 함께 정해 두면 해 볼 수 있는 범위도 분명해져.`
    ]),
    section('possible-outcome', '달라질 수 있는 결과', [
      `앞의 대처를 실제로 적용했을 때 ‘${names[2]}’에서 읽는 변화의 가능성이야. ${interpretCard(cards[2].id, 'outcome', context)}`,
      `결과는 ${context.sign}에 비추어 확인해 보렴. 기대와 달리 여전히 막힌다면 ${withParticle(context.unknown, '을')} 더 알아야 하는지, 정해 둔 방식이 지금의 조건과 맞는지를 다시 비교할 수 있어.`
    ]),
    section('together', '세 카드 종합', synthesisParagraphs)
  ];
  const timelineSections = [
    section('strengths', '기질과 강점', [
      `‘${names[0]}’에서 읽는 강점은 이래. ${problem.lifeTheme.strength} ‘${names[1]}’에는 또 다른 힘이 있어. ${situation.lifeTheme.strength}`,
      `‘${names[2]}’의 강점도 연결해 보자. ${solution.lifeTheme.strength} ${withParticle(context.resource, '을')} 쓸 때 어느 힘이 가장 잘 드러나는지 떠올려 보면, 익숙한 장점과 더 길러 볼 부분을 구별할 수 있어.`
    ]),
    section('past-flow', '과거의 흐름', [
      `지나온 시간은 ‘${names[0]}’의 상징에 비추어 돌아볼 수 있어. ${problem.lifeTheme.past}`,
      `이것을 ‘${topicName}’의 한 장면으로 옮겨 보면 이래. ${problem.example} 닮은 경험이 있었다면 그때 내 선택과 주변 조건이 각각 어떤 영향을 주었는지 나누어 생각해 보렴.`
    ]),
    section('past-hardships', '지나온 고난', [
      `‘${names[0]}’의 어려운 면은 지나온 부담을 돌아볼 단서가 돼. ${problem.foundationCaution}`,
      `${problem.guidanceCaution} 비슷한 어려움을 겪은 적이 있다면, ${withParticle(context.burden, '이')} 어떻게 쌓였는지와 그때 도움을 받을 통로가 있었는지를 함께 돌아볼 수 있어.`
    ]),
    section('past-achievements', '돌아볼 성취', [
      `같은 ‘${names[0]}’에서도 성취를 돌아볼 수 있어. ${problem.lifeTheme.achievement}`,
      `‘${topicName}’에서 그 성취를 찾아보려면 ${withParticle(context.known, '을')} 살펴보렴. 원하는 결과를 한 번에 얻었는지 외에도, 전에는 하지 못했던 선택이나 다음에 다시 쓸 방법이 생겼는지가 의미 있는 기준이 돼.`
    ]),
    section('present-luck', '현재 운과 과제', [
      `‘${names[1]}’의 지금 흐름을 ‘${topicName}’에 적용하면 이렇게 읽을 수 있어. ${situation.topicMeaning}`,
      `이 흐름에서 놓치지 말아야 할 점은 다음과 같아. ${situation.foundationCaution} ${withParticle(context.aim, '을')} 바라면서도 현재 감당할 조건을 함께 보는 거야.`
    ]),
    section('future-change', '앞으로의 변화', [
      `‘${names[2]}’의 상징에는 이런 변화의 가능성이 있어. ${solution.lifeTheme.change}`,
      `‘${topicName}’에서 그 변화를 적용할 장면을 떠올려 보자. ${solution.example} 실제로 비슷한 선택을 하게 된다면 지금의 조건과 맞는 부분을 골라 활용할 수 있어.`
    ]),
    section('future-hardships', '앞으로의 고난과 대처', [
      `‘${names[2]}’와 닮은 어려움에 대비할 때는 이 점이 중요해. ${solution.foundationCaution} ${solution.guidanceCaution}`,
      `그럴 때 선택을 좁히는 방향은 이래. ${solution.positionMeaning} ${withParticle(context.boundary, '을')} 미리 정해 두면 부담이 커졌을 때 어디에서 멈추거나 도움을 청할지 판단하기 쉬워져.`
    ])
  ];
  const groups = [
    { id: 'problem', label: '문제 해결', sections: problemSections },
    { id: 'timeline', label: '과거·현재·미래', sections: timelineSections },
    buildDomainGroup({ cards, readings })
  ];
  const synthesis = synthesisParagraphs.join('\n\n');
  const paragraphs = problemSections.slice(0, 3).map(item => item.paragraphs.join('\n\n'));
  const oneLine = `${andWith(firstTheme)} ${objectOf(secondTheme)} 함께 살피고, ${firstSentence(ritual)}`;
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
    headline: '세 장으로 문제와 삶의 흐름을 함께 살펴볼게',
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
