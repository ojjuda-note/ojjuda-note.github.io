import { getPersonStory } from './person-stories.js?v=20261114-tarot-review3';
import { PERSON_PAIR_READINGS } from './person-pair-readings.js?v=20261114-tarot-review3';
import { getConnectionProfile } from './connection-profiles.js?v=20261114-tarot-review2';
import { getCardInterpretation, withParticle } from './interpretation-engine.js?v=20261114-tarot-review2';
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

const phrase = (value, particle) => withParticle(`‘${value}’`, particle);

// These are editorial comparisons of the actual meanings, not additional
// traditional combinations. A give/need match suggests a question to examine;
// it never proves that two habits are compatible or guarantees an outcome.
function commonPair(left, right, reason) {
  const leftOffer = phrase(left.offer, '과');
  const rightOffer = phrase(right.offer, '을');
  if (reason === 'different-pace') {
    return `${leftOffer} ${phrase(right.offer, '은')} 서로 다른 속도를 짚어. 바로 움직일 부분과 더 살필 부분을 나눠야 두 태도를 무리 없이 쓸 수 있어.`;
  }
  if (reason === 'shared-emphasis') {
    return `${leftOffer} ${rightOffer} 함께 살리는 조합이야. 두 태도에 힘을 모으되, 선택에 필요한 다른 조건도 함께 살펴보렴.`;
  }
  if (reason === 'right-supports-left') {
    return `${phrase(left.offer, '을')} 살릴 때 ${phrase(right.offer, '이')} 확인할 기준을 더해 줘. ${phrase(left.excess, '이')} 나타나는지 살피는 데 그 기준을 써 보렴.`;
  }
  if (reason === 'left-supports-right') {
    return `${phrase(right.offer, '을')} 살리려면 처음의 ${phrase(left.offer, '을')} 함께 기억해야 해. ${phrase(right.excess, '이')} 나타날 때 무엇을 다시 살필지 알려 주는 조합이야.`;
  }
  if (reason === 'mutual-support') {
    return `${leftOffer} ${rightOffer} 함께 살펴야 하는 조합이야. 두 태도를 모두 쓰되, 하나를 지키려고 다른 하나를 무리하게 밀어붙이지는 마.`;
  }
  return `${leftOffer} ${rightOffer} 함께 놓고 선택을 살펴보는 조합이야. 마음을 쓰는 이유와 지금 확인할 조건이 다를 수 있으니, 한 가지 기준만으로 결론을 정하지 마.`;
}

function pairReading(cards, profiles, topicId, reason, contextId) {
  const key = `${cards[0].id}:${cards[1].id}`;
  // Select the narrowest authored scope first. Without a matching situation,
  // a purchase story must not become the explanation of saving or studying.
  const candidates = [
    ...(contextId?.startsWith(`${topicId}-`) ? [{ key: `${key}:${contextId}`, scope: 'context' }] : []),
    { key: `${key}:${topicId}`, scope: 'topic' },
    { key, scope: 'general' }
  ];
  const selected = candidates.find(entry => Object.hasOwn(PERSON_PAIR_READINGS, entry.key));
  return selected
    ? { text: PERSON_PAIR_READINGS[selected.key], key: selected.key, scope: selected.scope }
    : { text: commonPair(profiles[0], profiles[1], reason), key: null, scope: 'common' };
}

function connectChoice(profiles) {
  const [left, right, last] = profiles;
  const opening = `${phrase(left.offer, '과')} ${phrase(right.offer, '을')} 함께 살핀 뒤`;
  const supported = [left, right].filter(profile => last.give === profile.need);
  if (supported.length) {
    const excesses = supported.map(profile => `‘${profile.excess}’`).join(' 또는 ');
    return `${opening}, ${phrase(last.offer, '을')} 다음 선택의 기준으로 삼는 거야. ${withParticle(excesses, '이')} 나타나는지 살피면서 그 기준을 써 보렴.`;
  }
  return `${opening}, 이번에는 ${phrase(last.offer, '을')} 살려 다음 행동을 정하는 거야.`;
}

/** Person-centred prose from the actual ordered cards and the chosen situation.
 * All story fields are complete authored sentences. Context only selects a
 * whole passage; it is never inserted into an arbitrary verb template.
 */
export function buildPersonNarrative({ cards, topicId = 'overall', context, names, closingAction = '' } = {}) {
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
  const coreMeanings = cards.map(card => getCardInterpretation(card.id).meaning);
  const situation = context?.cards?.[cards[0].id];
  const opening = situation ? first(situation) : first(left[actualTopic]);
  const present = context?.cards?.[cards[1].id];
  const presentMeaning = present ? first(present) : first(right[actualTopic]);
  const reason = pairReason(profiles[0], profiles[1]);
  const pairSelection = pairReading(cards, profiles, actualTopic, reason, context?.id);
  const pair = pairSelection.text;
  const concern = context?.concern && !context?.id ? `고민: ${context.concern}. ` : '';
  const limit = SITUATION_BOUNDARIES[context?.id]
    || (context?.boundary ? `지킬 점: ${context.boundary}.` : '');
  const lastAdvice = context?.cards?.[cards[2].id];
  const lastSentences = lastAdvice ? splitSummarySentences(lastAdvice) : [];
  const lastMeaning = lastAdvice ? lastSentences[0] : last[actualTopic];
  const lastAction = lastSentences.length > 1 ? lastSentences.slice(1).join(' ') : '';
  const choiceLink = connectChoice(profiles);
  const paragraphs = [
    `첫 번째 ‘${labels[0]}’ 카드의 뜻부터 짚어 줄게. ${first(coreMeanings[0])} ${opening} ${concern}`.trim(),
    `두 번째 ‘${labels[1]}’ 카드를 함께 보면 지금의 선택이 더 분명해져. ${first(coreMeanings[1])} ${presentMeaning} ${pair}`,
    `세 번째 ‘${labels[2]}’ 카드가 짚는 다음 선택이야. ${first(coreMeanings[2])} ${lastMeaning} ${choiceLink} ${lastAction} ${limit}`.replace(/ {2,}/g, ' ').trim()
  ];
  const conclusion = lastAction || first(lastMeaning);
  const summaryLines = summaryLinesFrom(pair, conclusion);
  summaryLines[0] = `‘${cards[0].name}’ · ‘${cards[1].name}’: ${summaryLines[0]}`;
  summaryLines[1] = `‘${cards[2].name}’ 카드: ${summaryLines[1]}`;
  const overview = `${first(pair)} ${lastAction || first(closingAction) || conclusion}`;
  const supports = [0, 1].filter(index => profiles[2].give === profiles[index].need);
  return {
    paragraphs, summaryLines, stories, pairReading: pair, overview, choiceLink,
    evidence: {
      cards: cards.map(card => card.id), topicId: actualTopic, contextId: context?.id || null,
      pair: reason, concern: context?.concern || null, boundary: context?.boundary || null,
      authoredPair: pairSelection.key !== null,
      authoredPairKey: pairSelection.key,
      authoredPairScope: pairSelection.scope,
      thirdRespondsTo: supports.map(index => cards[index].id),
      lenses: profiles.map((profile, index) => ({ cardId: cards[index].id, offer: profile.offer, excess: profile.excess, route: profile.route })),
      method: 'authored-card-meanings-topic-passages-and-editorial-ordered-relationships'
    }
  };
}
