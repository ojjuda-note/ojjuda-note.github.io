import { CARD_LIFE_THEMES } from './life-themes.js?v=20261113-tarot-life1';
import { buildDomainGroup } from './domain-narration.js?v=20261113-tarot-topics50-1';

// Conversational presentation of the existing authored card explanations.
// This does not draw cards, invent personal events, or add fortune records.
const TOPIC_NAMES = Object.freeze({
  overall: '전체 운세', love: '연애와 관계', money: '돈과 생활', work: '일과 도전'
});
const ROLE_EXPLANATIONS = Object.freeze([
  '첫 번째 자리는 ‘지금의 문제’를 살펴보는 곳이야. 고른 주제에서 마음에 걸리는 것이 무엇이고, 어떤 생각이나 행동과 이어지는지 돌아보는 거지.',
  '두 번째 자리는 ‘현재 상황’을 살펴보는 곳이야. 그 문제를 둘러싼 지금의 조건과 마음, 주변 사람과 나누는 이야기를 차근차근 보는 거지.',
  '세 번째 자리는 ‘해결 방법과 결과’를 살펴보는 곳이야. 앞의 두 카드를 바탕으로 직접 해 볼 수 있는 선택과, 그 선택에 따라 달라질 수 있는 흐름을 읽는 거지.'
]);
const ROLE_CONNECTIONS = Object.freeze([
  '이 카드를 ‘지금의 문제’ 자리에 놓으면, 어떤 마음이나 습관이 고민과 이어지는지 살펴볼 수 있어. 지금 마음에 걸리는 일과 닮은 부분이 있는지 생각해 보렴.',
  '이 카드를 ‘현재 상황’ 자리에 놓으면, 지금 어떤 마음으로 이 일을 바라보고 있는지 살펴볼 수 있어. 실제로 확인한 조건과 네가 느끼는 점을 함께 놓고 읽어 보렴.',
  '이 카드를 ‘해결 방법과 결과’ 자리에 놓으면, 네가 직접 바꿔 볼 행동과 그 뒤에 살펴볼 변화를 연결해 읽을 수 있어.'
]);
const TOPIC_CHECKS = Object.freeze({
  overall: '해 본 뒤에는 오늘 해야 할 일이 조금 분명해졌는지, 쉬어야 할 때를 알아차리기 쉬워졌는지 살펴보렴. 실제로 편해진 부분과 여전히 어려운 부분을 나누면 다음 선택을 정하기 쉬워져.',
  love: '마음을 전한 뒤에는 상대가 실제로 한 말과 행동을 보렴. 둘이 편하게 지킬 수 있는 약속이 생겼는지, 서로 이야기할 틈이 있는지 살피며 다음 걸음을 맞춰 보는 거야.',
  money: '선택한 뒤에는 실제로 드는 돈과 계속 필요한 비용을 살펴보렴. 처음 생각한 쓰임에 맞는지, 생활에 필요한 다른 몫이 남아 있는지 확인하면 바꿔야 할 부분도 구체적으로 찾을 수 있어.',
  work: '해 본 뒤에는 원하는 결과와 지금 만든 것이 얼마나 맞는지 확인해 보렴. 함께하는 사람도 같은 방향을 이해했는지, 더 필요한 시간이나 도움이 무엇인지 들으면 다음 수고를 어디에 쓸지 정하기 쉬워져.'
});
const TOPIC_ACHIEVEMENTS = Object.freeze({
  overall: '생활에서 이 힘을 써 본 적이 있다면 그때 무엇을 다르게 했는지 떠올려 보렴. 작은 일을 마쳤거나 쉬어야 할 때를 알아차린 경험도 돌아볼 만해. 남이 크게 알아주었는지보다 네 생활에 어떤 도움이 되었는지 살펴보자.',
  love: '관계에서 이 힘을 써 본 적이 있다면 서로의 말을 들었거나 필요한 거리를 정했던 장면을 떠올려 보렴. 원하는 관계가 그대로 이루어졌는지만으로 그 노력을 판단할 필요는 없어. 네 뜻을 더 분명하게 이해한 것도 돌아볼 성취가 될 수 있어.',
  money: '돈에 관한 일에서 이 힘을 써 본 적이 있다면 어떤 조건을 확인하고 무엇을 지켰는지 떠올려 보렴. 필요 없는 지출을 알아차렸거나 모르는 비용을 물어본 경험도 살펴볼 만해. 실제로 남긴 기록이 있다면 그때의 선택을 함께 돌아보자.',
  work: '일에서 이 힘을 써 본 적이 있다면 네가 맡은 부분을 어떻게 해냈는지 돌아보렴. 처음보다 이해하게 된 방법, 도움을 요청한 순간, 끝까지 확인한 작은 일도 살펴볼 만해. 결과와 함께 그 과정에서 익힌 것을 알아주는 거야.'
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

/** Arrange existing meanings as a spoken explanation; no source prose is resampled. */
export function narrateReading({ card, topicId, index, position, foundation, guidance, detail, base }) {
  checkReadingInput({ card, topicId, index, position, foundation, guidance, detail });
  const { displayName, explanation } = naming(card);
  const introduction = `${ROLE_EXPLANATIONS[index]} 이번에 나온 카드는 ‘${displayName}’${hasFinalConsonant(displayName) ? '이야' : '야'}. ${explanation}`.trim();
  const meaning = clean(foundation.takeaway);
  const positionMeaning = clean(guidance.positions[index === 1 ? 0 : index]);
  const lifeTheme = CARD_LIFE_THEMES[card.id];
  const topicMeaning = clean(card.topics[topicId]);
  const example = clean(detail.example);
  const action = clean(detail.action);
  const caution = unique([foundation.caution, guidance.caution]).join(' ');
  // Introduction is shown above the artwork. Keep it out of these paragraphs.
  const paragraphs = [
    `먼저 전통 타로 그림을 바탕으로 이 카드를 살펴보자. ${clean(foundation.symbol)}`,
    `그 모습에 담긴 뜻을 조금 더 풀어보면 이래. ${clean(guidance.meaning)}`,
    `${ROLE_CONNECTIONS[index]} ${positionMeaning}${index === 2 ? ' ' + lifeTheme.change : ''}`,
    `이 뜻을 네가 고른 ‘${TOPIC_NAMES[topicId]}’에 연결해 볼게. ${topicMeaning}`,
    `생활 속 장면으로 생각해 볼까? ${example}`,
    `그렇다면 무엇부터 해 보면 좋을까? ${action}`,
    `다만 이 점은 함께 기억하렴. ${caution}`
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
    symbol: clean(foundation.symbol),
    positionMeaning,
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

/** Read the same actual cards through problem-solving and reflective time lenses. */
export function narrateSummary({ cards, topicId, readings, innerMeaning, direction, base }) {
  if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards.map(card => card?.id)).size !== 3
      || !Array.isArray(readings) || readings.length !== 3 || !Object.hasOwn(TOPIC_NAMES, topicId)
      || cards.some(card => !card?.id || !card.name) || readings.some(reading => !reading?.meaning || !reading.positionMeaning || !reading.topicMeaning || !reading.action || !reading.example || !reading.theme
        || !reading.foundationCaution || !reading.guidanceCaution || !reading.lifeTheme)
      || !innerMeaning || !direction) {
    throw new Error('tarot_narration_requires_three_ordered_readings');
  }
  const names = cards.map((card, index) => fullName(card, readings[index]));
  const displayNames = readings.map((reading, index) => reading.displayName || cards[index].name);
  const [problem, situation, solution] = readings;
  const topicName = TOPIC_NAMES[topicId];
  const firstTheme = problem.theme.split(' · ')[0];
  const secondTheme = situation.theme.split(' · ')[0];
  const ritual = solution.action;
  const synthesisParagraphs = [
    `첫 카드 ‘${displayNames[0]}’에서 살펴본 것은 ${isCalled(innerMeaning)}. 이런 마음이 지금의 고민과 닮아 있다면, 둘째 ‘${displayNames[1]}’에서 비추는 ${objectOf(secondTheme)} 함께 살펴보렴. ‘${topicName}’에서 지금 확인할 점은 이렇게 이어져. ${situation.topicMeaning}`,
    `이 두 가지를 함께 고려할 때, 마지막 ‘${displayNames[2]}’의 조언은 이렇게 적용할 수 있어. ${clean(direction)} 생활 속 장면으로 생각하면 더 구체적이야. ${solution.example}`
  ];
  const problemSections = [
    section('problem-now', '지금 일어나는 문제', [
      `첫 번째 자리에 나온 ‘${names[0]}’ 카드로 지금 마음에 걸리는 문제를 살펴볼게. ${problem.meaning} 전통 그림의 이런 모습에서 뜻을 읽을 수 있어. ${problem.symbol}`,
      `네가 고른 ‘${topicName}’에서 이와 닮은 어려움이 있는지 생각해 보렴. ${problem.topicMeaning} 특히 이 점은 함께 살펴보는 게 좋아. ${problem.foundationCaution}`
    ]),
    section('situation-now', '현재 상황', [
      `두 번째 자리에 나온 ‘${names[1]}’ 카드로 그 문제를 둘러싼 현재 상황을 살펴볼게. ${situation.meaning} 지금의 마음과 실제로 아는 조건을 나란히 놓고 읽어 보렴. ${situation.positionMeaning}`,
      `‘${topicName}’에서 볼 수 있는 구체적인 장면을 떠올려 보자. ${situation.topicMeaning} ${situation.example}`
    ]),
    section('solution', '해결 방법', [
      `세 번째 ‘${names[2]}’에서 해결을 위해 쓸 수 있는 방법을 찾아볼게. ${solution.meaning} 앞의 문제와 현재 상황을 함께 생각하며 이렇게 움직여 볼 수 있어. ${clean(direction)}`,
      `이 조언을 ‘${topicName}’에 적용하면 네가 직접 고를 수 있는 행동이 보이기 시작해. ${solution.topicMeaning} 오늘의 선택을 더 좁혀 보면 이렇게 읽을 수 있단다. ${solution.positionMeaning}`
    ]),
    section('possible-outcome', '달라질 수 있는 결과', [
      `‘${names[2]}’ 카드가 보여 주는 변화의 가능성도 살펴보자. ${solution.lifeTheme.change} 지금의 조건에 맞게 조언을 써 본 뒤 무엇이 실제로 달라지는지 확인해 보는 거야.`,
      `‘${topicName}’에서 바뀐 점을 살필 때는 가까운 장면부터 보는 게 좋아. ${solution.example} ${TOPIC_CHECKS[topicId]}`
    ]),
    section('together', '세 카드 종합', synthesisParagraphs)
  ];
  const timelineSections = [
    section('strengths', '기질과 강점', [
      `평소 네가 잘 쓰는 힘을 떠올리며 세 장의 성격을 살펴보자. 첫 번째 ‘${names[0]}’에서 읽는 강점은 이래. ${problem.lifeTheme.strength} 두 번째 ‘${names[1]}’에서는 다른 힘도 살펴볼 수 있어. ${situation.lifeTheme.strength}`,
      `세 번째 ‘${names[2]}’ 카드가 보여 주는 강점도 함께 볼게. ${solution.lifeTheme.strength} 이 설명과 닮은 모습을 실제로 보인 적이 있는지 떠올려 보렴. 자주 쓰는 힘과 앞으로 더 길러 보고 싶은 힘을 나누어 보면 네가 쓸 수 있는 방법도 넓어질 수 있어.`
    ]),
    section('past-flow', '과거의 흐름', [
      `첫 번째 ‘${names[0]}’의 상징으로 지나온 시간을 돌아보자. ${problem.lifeTheme.past} 이 카드의 기본 뜻도 함께 기억하면 어떤 경험을 살펴볼지 더 분명해져. ${problem.meaning}`,
      `‘${topicName}’에서 이런 장면과 닮은 경험이 있었는지 생각해 보렴. ${problem.example} 비슷한 일이 떠오른다면 그때 무엇을 원했고 어떤 선택을 했는지 차근차근 돌아보는 거야.`
    ]),
    section('past-hardships', '지나온 고난', [
      `지난 어려움을 돌아볼 때는 ‘${names[0]}’의 주의점을 단서로 삼아볼 수 있어. ${problem.foundationCaution} 이와 닮은 어려움이 있었다면 당시 어떤 조건이 힘들었는지 생각해 보렴.`,
      `그때의 선택을 돌아보며 이 점도 함께 살펴보자. ${problem.guidanceCaution} 당시 네가 정할 수 있었던 일과 혼자 바꾸기 어려웠던 조건을 나누어 보렴. 지금 다시 비슷한 일을 만난다면 어디에서 도움을 구할 수 있을지도 생각해 보면 좋겠구나.`
    ]),
    section('past-achievements', '돌아볼 성취', [
      `첫 번째 ‘${names[0]}’에서는 지나온 어려움과 함께 네가 해낸 것을 돌아볼 단서도 찾을 수 있어. ${problem.lifeTheme.achievement} 카드의 강점과 연결해 생각하면 이런 힘을 떠올릴 수 있단다. ${problem.lifeTheme.strength}`,
      `‘${topicName}’에 관한 경험으로 더 가까이 살펴보자. ${TOPIC_ACHIEVEMENTS[topicId]}`
    ]),
    section('present-luck', '현재 운과 과제', [
      `현재의 흐름은 두 번째 ‘${names[1]}’에 비추어 볼게. ${situation.meaning} 지금 어떤 마음으로 이 일을 보고 있는지 생각하며 읽어 보렴. ${situation.positionMeaning}`,
      `‘${topicName}’에서 지금 살펴볼 과제는 이렇게 연결돼. ${situation.topicMeaning} 기회와 함께 놓치지 말아야 할 점도 있단다. ${situation.foundationCaution}`
    ]),
    section('future-change', '앞으로의 변화', [
      `앞으로의 흐름은 세 번째 ‘${names[2]}’ 카드가 가진 변화의 뜻으로 읽어볼게. ${solution.lifeTheme.change} 이런 흐름이 네 상황에 이어진다면, 그때 쓸 수 있는 힘도 살펴보렴. ${solution.lifeTheme.strength}`,
      `앞으로 ‘${topicName}’에 관한 선택을 할 때는 이 뜻을 이렇게 적용해 볼 수 있어. ${solution.topicMeaning} ${TOPIC_CHECKS[topicId]}`
    ]),
    section('future-hardships', '앞으로의 고난과 대처', [
      `앞으로 이 카드와 닮은 어려움을 만나게 된다면, ‘${names[2]}’의 주의점을 기억해 보렴. ${solution.foundationCaution} ${solution.guidanceCaution}`,
      `‘${topicName}’에서 대처할 모습을 구체적으로 떠올려 보자. ${solution.example} 이와 닮은 상황에서는 이렇게 선택을 좁혀 볼 수 있어. ${solution.positionMeaning}`
    ])
  ];
  const groups = [
    { id: 'problem', label: '문제 해결', sections: problemSections },
    { id: 'timeline', label: '과거·현재·미래', sections: timelineSections },
    buildDomainGroup({ cards, readings })
  ];
  const synthesis = synthesisParagraphs.join('\n\n');
  const paragraphs = readings.map((reading, index) => `‘${reading.positionLabel}’ 자리에 나온 ‘${names[index]}’ 카드부터 살펴보자. ${reading.meaning} ${reading.positionMeaning} ‘${topicName}’에 연결하면 이렇게 읽을 수 있어. ${reading.topicMeaning}`);
  const oneLine = `${andWith(firstTheme)} ${objectOf(secondTheme)} 함께 살피고, ${firstSentence(ritual)}`;
  // Shared historical corpus material stays accessible as reference material;
  // changing the reading lens never changes its identity or authored-record count.
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
  }),
    `오늘 해 볼 일\n${ritual}`].join('\n\n');
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
