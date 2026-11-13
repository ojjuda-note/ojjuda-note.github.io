// Conversational presentation of the existing authored card explanations.
// This does not draw cards, invent personal events, or add fortune records.
const TOPIC_NAMES = Object.freeze({
  overall: '전체 운세', love: '연애와 관계', money: '돈과 생활', work: '일과 도전'
});
const ROLE_EXPLANATIONS = Object.freeze([
  '첫 번째 카드는 ‘지금의 마음’을 살펴보는 자리야. 고른 주제를 어떤 생각과 마음으로 바라보는지 돌아보는 거지.',
  '두 번째 카드는 ‘다가오는 흐름’을 살펴보는 자리야. 앞으로 선택하거나 움직일 때 무엇을 눈여겨보면 좋을지 읽는 거지.',
  '세 번째 카드는 ‘마녀의 조언’을 살펴보는 자리야. 앞에서 살펴본 이야기를 바탕으로 오늘 해 볼 수 있는 선택을 찾는 거지.'
]);
const ROLE_CONNECTIONS = Object.freeze([
  '이 카드를 ‘지금의 마음’ 자리에 놓으면, 네가 이 주제를 바라보는 마음과 연결해 읽을 수 있어. 지금의 상황과 닮은 부분이 있는지 천천히 살펴보렴.',
  '이 카드를 ‘다가오는 흐름’ 자리에 놓으면, 앞으로 눈여겨볼 점과 연결해 읽을 수 있어. 비슷한 상황을 만났을 때 무엇을 확인하면 좋을지 생각해 보렴.',
  '이 카드를 ‘마녀의 조언’ 자리에 놓으면, 네가 직접 해 볼 수 있는 행동과 연결해 읽을 수 있어. 지금의 상황에 맞는 작은 선택을 찾아보렴.'
]);
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
      || !guidance?.meaning || !guidance.positions?.[index]
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
    displayName === card.name ? '' : `카드에 적힌 원래 이름은 ‘${card.name}’이고, 여기서는 ‘${displayName}’라고 쉽게 부를게.`,
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
  const positionMeaning = clean(guidance.positions[index]);
  const topicMeaning = clean(card.topics[topicId]);
  const example = clean(detail.example);
  const action = clean(detail.action);
  const caution = unique([foundation.caution, guidance.caution]).join(' ');
  // Introduction is shown above the artwork. Keep it out of these paragraphs.
  const paragraphs = [
    `먼저 전통 타로 그림을 바탕으로 이 카드를 살펴보자. ${clean(foundation.symbol)}`,
    `그 모습에 담긴 뜻을 조금 더 풀어보면 이래. ${clean(guidance.meaning)}`,
    `${ROLE_CONNECTIONS[index]} ${positionMeaning}`,
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
    theme: clean(foundation.theme)
  };
}

/** Explain the actual ordered cards before combining them into a practical direction. */
export function narrateSummary({ cards, topicId, readings, innerMeaning, flowMeaning, direction, base }) {
  if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards.map(card => card?.id)).size !== 3
      || !Array.isArray(readings) || readings.length !== 3 || !Object.hasOwn(TOPIC_NAMES, topicId)
      || cards.some(card => !card?.id || !card.name) || readings.some(reading => !reading?.meaning || !reading.positionMeaning || !reading.topicMeaning || !reading.action || !reading.example || !reading.theme)
      || !innerMeaning || !flowMeaning || !direction) {
    throw new Error('tarot_narration_requires_three_ordered_readings');
  }
  const names = cards.map((card, index) => fullName(card, readings[index]));
  const displayNames = readings.map((reading, index) => reading.displayName || cards[index].name);
  const paragraphs = readings.map((reading, index) => {
    const opening = index === 0 ? `먼저 ‘지금의 마음’ 자리에 나온 ‘${names[index]}’부터 볼게.`
      : index === 1 ? `이어서 ‘다가오는 흐름’ 자리에는 ‘${names[index]}’ 카드가 나왔어.`
        : `마지막 ‘마녀의 조언’ 자리에는 ‘${names[index]}’ 카드가 나왔어.`;
    return `${opening} ${reading.meaning} ${reading.positionMeaning} ‘${TOPIC_NAMES[topicId]}’에 연결해서 보면 이렇게 읽을 수 있어. ${reading.topicMeaning}`;
  });
  const synthesis = `세 장을 이어 보면, ‘${displayNames[0]}’에서 살펴본 것은 ${isCalled(innerMeaning)}. 이런 마음이 네 상황과 닮았다면, 다음 선택 전에 ‘${displayNames[1]}’${hasFinalConsonant(displayNames[1]) ? '이' : '가'} 짚어 준 ${objectOf(flowMeaning)} 함께 살펴보렴. 그러고 나서 ‘${displayNames[2]}’의 조언으로 움직여 보는 거야. ${clean(direction)} 생활 속에서는 이렇게 적용할 수 있어. ${readings[2].example}`;
  const ritual = readings[2].action;
  const firstTheme = readings[0].theme.split(' · ')[0];
  const secondTheme = readings[1].theme.split(' · ')[0];
  const oneLine = `${andWith(firstTheme)} ${objectOf(secondTheme)} 함께 살피고, ${firstSentence(ritual)}`;
  // Keep the original shared reference text available without presenting it as
  // an explanation unique to these cards, or counting the new wording as a record.
  const detailSections = [
    { title: '함께 참고할 이야기', subtitle: base.oneLine, body: base.summary },
    ...(base.sections || []),
    { title: '원문에 담긴 생활 제안', subtitle: '', body: base.ritual }
  ];
  return {
    ...base,
    headline: '세 장을 이어서 읽어 볼게',
    paragraphs,
    synthesis,
    summary: synthesis,
    oneLine,
    ritual,
    detailSections,
    text: [...paragraphs, synthesis, `오늘 해 볼 일\n${ritual}`].join('\n\n')
  };
}
