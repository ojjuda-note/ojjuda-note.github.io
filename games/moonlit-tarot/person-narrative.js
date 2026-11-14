import { getPersonStory } from './person-stories.js?v=20261114-tarot-person1';
import { PERSON_PAIR_READINGS } from './person-pair-readings.js?v=20261114-tarot-person1';
import { getConnectionProfile } from './connection-profiles.js?v=20261113-tarot-easy1';
import { splitSummarySentences, summaryLinesFrom } from './reading-summary.js?v=20261113-tarot-summary1';

const TOPICS = ['overall', 'love', 'money', 'work'];
const first = text => splitSummarySentences(text)[0];
const SITUATION_BOUNDARIES = Object.freeze({
  'overall-family': '챙김을 받는 사람의 뜻을 묻고, 돌보는 네가 쉴 시간도 함께 남겨 둬.',
  'overall-study': '이번 평가 하나로 네 능력이나 앞으로의 길 전체를 정하지는 마.',
  'overall-change': '새로운 선택을 하더라도 당장 먹고 자고 생활할 여유는 남겨 둬.',
  'love-crush': '상대가 원하지 않는다면 그 답을 존중하고 더 재촉하지 마.',
  'love-flirting': '둘이 약속하지 않은 연인의 역할까지 서로에게 요구하지는 마.',
  'love-dating': '사귀는 사이여도 싫다고 말할 권리와 혼자 쉴 시간은 서로 지켜 줘.',
  'love-distance': '관계를 이어 가려고 한 사람만 잠과 생활을 줄이고 있다면 그 방식은 다시 정해야 해.',
  'love-reunion': '상대가 거절하거나 연락을 멈춰 달라고 했다면 더 연락하지 마.',
  'money-spending': '꼭 필요한 생활비를 남기고, 실제 이용 조건을 읽은 뒤 결정해.',
  'money-saving': '실제 들어오는 돈 안에서 계획하고, 생활에 필요한 돈까지 모두 묶어 두지는 마.',
  'money-agreement': '직접 읽고 이해한 조건에만 동의하고, 감당하기 어려운 약속은 맡지 마.',
  'work-job-search': '지원 조건과 제출 마감은 실제 공고에서 확인해.',
  'work-job-change': '확정되지 않은 제안만 믿고 지금의 약속을 먼저 바꾸지는 마.',
  'work-team': '새 요청을 받으면 어디까지 맡는지 합의한 뒤 시작해.',
  'work-business': '확인한 비용과 시간으로 감당할 수 있는 약속만 해.'
});

function pairReason(left, right) {
  if (right.give === left.need && left.give === right.need) return 'mutual-support';
  if (right.give === left.need) return 'right-supports-left';
  if (left.give === right.need) return 'left-supports-right';
  if (left.give === right.give) return 'shared-emphasis';
  if ([left.pace, right.pace].includes('fast') && [left.pace, right.pace].includes('pause')) return 'different-pace';
  return 'different-emphasis';
}

function pairReading(cards, stories, topicId) {
  const key = `${cards[0].id}:${cards[1].id}`;
  if (Object.hasOwn(PERSON_PAIR_READINGS, `${key}:${topicId}`)) return PERSON_PAIR_READINGS[`${key}:${topicId}`];
  if (Object.hasOwn(PERSON_PAIR_READINGS, key)) return PERSON_PAIR_READINGS[key];
  // A matching advice category does not prove that two defensive habits help
  // each other. Keep the second card's own cost intact instead of inventing
  // harmony (for example, between compulsive buying and fear of spending).
  return stories[1].cost;
}

/** Person-centred prose from the actual ordered cards and the chosen situation.
 * All story fields are complete authored sentences. Context only selects a
 * whole passage; it is never inserted into an arbitrary verb template.
 */
export function buildPersonNarrative({ cards, topicId = 'overall', context, names } = {}) {
  if (!Array.isArray(cards) || cards.length !== 3 || new Set(cards.map(card => card?.id)).size !== 3
      || cards.some(card => !card?.id || typeof card.name !== 'string' || !card.name.trim())) {
    throw new Error('tarot_person_narrative_requires_three_actual_cards');
  }
  const stories = cards.map(card => getPersonStory(card.id));
  const profiles = cards.map(card => getConnectionProfile(card.id));
  const actualTopic = context?.topicId || topicId;
  if (!TOPICS.includes(actualTopic)) throw new Error('tarot_person_narrative_requires_topic');
  const labels = names || cards.map(card => card.name);
  if (!Array.isArray(labels) || labels.length !== 3 || labels.some(name => typeof name !== 'string' || !name.trim())) {
    throw new Error('tarot_person_narrative_requires_three_names');
  }
  const [left, right, last] = stories;
  const situation = context?.cards?.[cards[0].id];
  const opening = situation ? first(situation) : first(left[actualTopic]);
  const present = context?.cards?.[cards[1].id];
  const presentMeaning = present ? first(present) : first(right[actualTopic]);
  const pair = pairReading(cards, stories, actualTopic);
  const concern = context?.concern && !context?.id ? `고민: ${context.concern}. ` : '';
  const limit = SITUATION_BOUNDARIES[context?.id]
    || (context?.boundary ? `지킬 점: ${context.boundary}.` : '');
  const lastAdvice = context?.cards?.[cards[2].id];
  const lastSentences = lastAdvice ? splitSummarySentences(lastAdvice) : [];
  const lastMeaning = lastAdvice ? lastSentences[0] : last[actualTopic];
  const lastAction = lastSentences.at(-1) || '';
  const hasPair = [`${cards[0].id}:${cards[1].id}`, `${cards[0].id}:${cards[1].id}:${actualTopic}`]
    .some(key => Object.hasOwn(PERSON_PAIR_READINGS, key));
  const paragraphs = [
    `첫 번째 ‘${labels[0]}’ 카드에서 네가 이 일에 마음을 쓰는 이유를 읽어 볼게. ${left.longing} ${opening} ${left.cost} ${concern}`.trim(),
    `두 번째 ‘${labels[1]}’ 카드는 지금 마음을 지키는 방식을 보여 줘. ${right.longing} ${right.defense} ${presentMeaning} ${pair}`,
    `세 번째 ‘${labels[2]}’ 카드는 다음 선택에서 짚어야 할 마음을 보여 줘. ${lastMeaning} ${last.longing} ${last.cost} ${limit}`.replace(/ {2,}/g, ' ').trim()
  ];
  const summaryLines = summaryLinesFrom(hasPair ? pair : opening, lastAction || lastMeaning);
  summaryLines[0] = hasPair ? `‘${cards[0].name}’ · ‘${cards[1].name}’: ${summaryLines[0]}`
    : `‘${cards[0].name}’ 카드: ${summaryLines[0]}`;
  summaryLines[1] = `‘${cards[2].name}’ 카드: ${summaryLines[1]}`;
  const supports = [0, 1].filter(index => profiles[2].give === profiles[index].need);
  return {
    paragraphs, summaryLines, stories, pairReading: pair,
    evidence: {
      cards: cards.map(card => card.id), topicId: actualTopic, contextId: context?.id || null,
      pair: pairReason(profiles[0], profiles[1]), concern: context?.concern || null, boundary: context?.boundary || null,
      authoredPair: hasPair,
      thirdRespondsTo: supports.map(index => cards[index].id),
      lenses: profiles.map((profile, index) => ({ cardId: cards[index].id, offer: profile.offer, excess: profile.excess, route: profile.route })),
      method: 'authored-person-portraits-and-actual-ordered-card-relationships'
    }
  };
}
