import { getPersonStory } from './person-stories.js?v=20261120-tarot-voice2';
import { PERSON_PAIR_READINGS } from './person-pair-readings.js?v=20261120-tarot-voice2';
import { getConnectionProfile } from './connection-profiles.js?v=20261114-tarot-first-person1';
import { withParticle } from './interpretation-engine.js?v=20261120-tarot-voice2';
import { splitSummarySentences, summaryLinesFrom } from './reading-summary.js?v=20261113-tarot-summary1';
import { directInterpretation, directAction } from './reading-voice.js?v=20261120-tarot-voice2';

const TOPICS = ['overall', 'love', 'money', 'work'];
export const PERSONAL_READING_BASIS = '선택한 상황과 세 카드의 뜻으로 내 성향과 마음을 살펴보는 풀이예요. 실제 과거나 상대의 속마음을 확인한 결과는 아니에요. 카드 연결에는 공통 해석 규칙을 쓰고, 선택 비교와 이어지는 답변에는 생활 제안을 담았어요.';
const first = text => splitSummarySentences(text)[0];
const paragraph = (...parts) => [...new Set(parts.map(text => String(text || '').trim()).filter(Boolean))].join(' ');
const SITUATION_BOUNDARIES = Object.freeze({
  'overall-family': '돌봄을 받는 사람이 원하는 것을 묻고, 내가 쉴 시간도 남겨 두세요.',
  'overall-study': '이번 평가 하나로 내 능력이나 앞으로의 길 전체를 판단하지 마세요.',
  'overall-change': '새 선택을 하더라도 당장 먹고 자고 생활할 여유는 남겨 두세요.',
  'love-crush': '상대가 원하지 않는다면 그 답을 존중하고 더 재촉하지 마세요.',
  'love-flirting': '둘이 약속하지 않은 연인의 역할까지 요구하지 마세요.',
  'love-dating': '사귀는 사이여도 싫다고 말할 권리와 혼자 쉴 시간은 서로 지켜 주세요.',
  'love-distance': '한 사람만 잠과 생활을 줄이며 관계를 이어 가고 있다면 그 방식은 다시 정하세요.',
  'love-reunion': '상대가 거절하거나 연락을 멈춰 달라고 했다면 더 연락하지 마세요.',
  'money-spending': '꼭 필요한 생활비를 남기고, 실제 이용 조건을 읽은 뒤 결정하세요.',
  'money-saving': '실제로 들어오는 돈 안에서 계획하세요. 생활에 필요한 돈까지 모두 묶어 두지는 마세요.',
  'money-agreement': '직접 읽고 이해한 조건에만 동의하세요. 감당하기 어려운 약속은 맡지 마세요.',
  'work-job-search': '지원 조건과 제출 마감은 실제 공고에서 확인하세요.',
  'work-job-change': '확정되지 않은 제안만 믿고 지금의 약속을 먼저 바꾸지는 마세요.',
  'work-team': '새 요청을 받으면 어디까지 맡는지 합의한 뒤 시작하세요.',
  'work-business': '확인한 비용과 시간으로 감당할 수 있는 약속만 하세요.'
});

// These authored clauses make a contrast in pace concrete. Other connections
// use the actual offer, excess and route instead of repeating both portraits.
const PERSONAL_TRAITS = Object.freeze({
  fool: '직접 경험하며 배워 가는',
  magician: '가진 도구와 능력으로 생각을 실현하려는',
  priestess: '드러나지 않은 조건까지 차분히 살피는',
  empress: '작은 불편을 알아채고 꾸준히 돌보는',
  emperor: '약속과 책임의 범위를 분명히 정하려는',
  hierophant: '믿을 만한 방법을 배우고 그 이유를 이해하려는',
  lovers: '내 뜻과 함께하는 사람의 뜻을 함께 고려하는',
  chariot: '목표를 정하면 한곳에 힘을 모으는',
  strength: '강한 감정도 차분히 다루려는',
  hermit: '혼자 돌아보며 납득할 답을 찾는',
  wheel: '조건이 달라지면 방법을 유연하게 바꾸려는',
  justice: '같은 기준으로 사실과 책임을 따지는',
  hanged_man: '잠시 멈춰 다른 관점에서 살피는',
  death: '끝난 일을 정리하고 다음 생활을 준비하려는',
  temperance: '무리 없이 이어 갈 양과 속도를 맞추려는',
  devil: '반복되는 습관이 선택을 좁히는지 살피는',
  tower: '계획이 흔들리면 실제로 달라진 조건을 확인하려는',
  star: '작은 희망을 돌보며 다시 시작할 힘을 찾는',
  moon: '직접 확인한 사실과 상상을 구별하려는',
  sun: '잘된 일을 누리고 기쁨을 나누려는',
  judgement: '지난 경험을 바탕으로 다음 선택을 바꾸려는',
  world: '여러 경험을 모아 한 과정을 마무리하려는',
  wands_ace: '마음이 가는 일을 직접 시작해 보는',
  wands_two: '두 방향의 조건을 비교하며 계획하는',
  wands_three: '시작한 일의 반응과 진행 상황을 살피는',
  wands_four: '함께 이룬 일을 기뻐하며 편히 쉬려는',
  wands_five: '부딪히는 의견 속에서 풀 문제를 찾는',
  wands_six: '노력을 인정받고 함께한 수고도 알아주는',
  wands_seven: '중요한 기준을 지키려는',
  wands_eight: '새 연락과 변화에 빠르게 반응하는',
  wands_nine: '경험을 바탕으로 신중하게 준비하는',
  wands_ten: '책임이 쌓일수록 감당할 양을 다시 살피는',
  wands_page: '모르는 것을 직접 해 보며 배우려는',
  wands_knight: '새로운 도전에 힘 있게 뛰어드는',
  wands_queen: '내 취향과 의견을 자연스럽게 드러내는',
  wands_king: '함께 갈 방향을 정하고 일을 이끄는',
  cups_ace: '새로 생긴 감정을 소중하게 받아들이는',
  cups_two: '서로 원하는 것을 듣고 마음을 주고받으려는',
  cups_three: '경험과 기쁨을 나누며 도움을 주고받는',
  cups_four: '잠시 쉬면서 정말 원하는 것을 돌아보는',
  cups_five: '아쉬움을 인정하면서도 남은 도움을 찾는',
  cups_six: '좋았던 기억과 익숙한 정을 오래 간직하는',
  cups_seven: '여러 선택으로 달라질 모습을 상상하는',
  cups_eight: '더는 맞지 않는 방식에서 다른 길을 찾는',
  cups_nine: '이미 얻은 즐거움과 만족을 충분히 누리려는',
  cups_ten: '함께 지내는 생활의 편안함을 중요하게 여기는',
  cups_page: '작은 감정과 관심도 세심하게 살피는',
  cups_knight: '진심을 다정한 말과 행동으로 전하려는',
  cups_queen: '감정을 세심히 알아차리고 공감하는',
  cups_king: '감정을 인정하면서도 차분하게 반응하려는',
  swords_ace: '애매한 설명에서 문제의 핵심을 찾는',
  swords_two: '쉽게 한쪽을 정하지 않고 조건을 더 살피는',
  swords_three: '상처와 실망을 감추지 않고 인정하려는',
  swords_four: '잠시 멈추고 판단할 힘을 되찾으려는',
  swords_five: '다툼에서 이긴 뒤에도 무엇이 남을지 생각하는',
  swords_six: '힘든 상황에서 벗어날 방법을 찾는',
  swords_seven: '혼자 준비할 일과 함께 알려야 할 일을 구별하는',
  swords_eight: '제약 속에서도 남은 선택을 찾으려는',
  swords_nine: '반복되는 걱정과 직접 처리할 일을 구별하려는',
  swords_ten: '힘의 한계를 인정하고 마무리할 일을 정하려는',
  swords_page: '작은 차이도 놓치지 않고 구체적으로 묻는',
  swords_knight: '판단이 서면 망설임을 끝내고 움직이는',
  swords_queen: '할 수 있는 일과 어려운 일을 분명히 말하는',
  swords_king: '일관된 기준으로 판단하고 그 이유를 설명하는',
  pentacles_ace: '작은 기회를 실제 생활에서 써 보는',
  pentacles_two: '여러 일정과 지출을 나누어 맞추는',
  pentacles_three: '서로의 솜씨를 보태 결과를 다듬는',
  pentacles_four: '생활에 필요한 것을 안전하게 지키려는',
  pentacles_five: '부족한 것을 구체적으로 짚고 도움을 찾는',
  pentacles_six: '도움을 주고받는 조건과 부담을 함께 살피는',
  pentacles_seven: '들인 노력과 얻은 결과를 비교하는',
  pentacles_eight: '반복하며 한 부분씩 실력을 쌓는',
  pentacles_nine: '스스로 마련한 생활과 여유를 소중하게 여기는',
  pentacles_ten: '함께 이어 온 생활을 오래 유지하려는',
  pentacles_page: '작은 경험으로 기본부터 익히는',
  pentacles_knight: '맡은 약속을 꾸준히 지키는',
  pentacles_queen: '매일의 불편을 줄이며 생활을 돌보는',
  pentacles_king: '마련한 것을 오래 관리할 책임까지 생각하는'
});

function pairReason(left, right) {
  if (right.give === left.need && left.give === right.need) return 'mutual-support';
  if (right.give === left.need) return 'right-supports-left';
  if (left.give === right.need) return 'left-supports-right';
  if (left.give === right.give) return 'shared-emphasis';
  if ([left.pace, right.pace].includes('fast') && [left.pace, right.pace].includes('pause')) return 'different-pace';
  return 'different-emphasis';
}

const phrase = (value, particle) => withParticle(value, particle);

// These are editorial comparisons of the actual meanings, not additional
// traditional combinations. A give/need match suggests a question to examine;
// it never proves that two habits are compatible or guarantees an outcome.
function commonPair(cards, left, right, reason) {
  if (reason === 'different-pace') {
    return `${PERSONAL_TRAITS[cards[0].id]} 마음과 ${PERSONAL_TRAITS[cards[1].id]} 마음이 함께 보여요. 바로 움직일 일과 더 확인할 일을 나누세요.`;
  }
  if (reason === 'shared-emphasis') {
    return `${phrase(left.offer, '과')} ${phrase(right.offer, '을')} 함께 써 보세요. ${phrase(left.excess, '이')} 앞서지는 않는지 확인하세요.`;
  }
  if (reason === 'right-supports-left') {
    return `${phrase(left.excess, '이')} 앞설 때는 ${phrase(right.offer, '이')} 필요해요. ${directAction(right.route)}`;
  }
  if (reason === 'left-supports-right') {
    return `${phrase(right.excess, '이')} 앞설 때는 ${phrase(left.offer, '이')} 필요해요. ${directAction(left.route)}`;
  }
  if (reason === 'mutual-support') {
    return `${phrase(left.offer, '과')} ${phrase(right.offer, '을')} 함께 써 보세요. 한쪽을 지키려고 다른 쪽을 무리하게 밀어붙이지 마세요.`;
  }
  return `${phrase(left.offer, '과')} ${phrase(right.offer, '은')} 쓰임이 달라요. 지금 필요한 쪽에 먼저 힘을 보태세요.`;
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
    : { text: commonPair(cards, profiles[0], profiles[1], reason), key: null, scope: 'common' };
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
  const stories = cards.map(card => Object.fromEntries(Object.entries(getPersonStory(card.id)).map(([key, value]) =>
    [key, typeof value === 'string' ? directInterpretation(value) : value])));
  const profiles = cards.map(card => getConnectionProfile(card.id));
  const actualTopic = context?.topicId || topicId;
  if (!TOPICS.includes(actualTopic)) throw new Error('tarot_person_narrative_requires_topic');
  const labels = names || cards.map(card => card.name);
  if (!Array.isArray(labels) || labels.length !== 3 || labels.some(name => typeof name !== 'string' || !name.trim())) {
    throw new Error('tarot_person_narrative_requires_three_names');
  }
  const [left, right, last] = stories;
  const situation = context?.cards?.[cards[0].id];
  const opening = directInterpretation(situation ? first(situation) : first(left[actualTopic]));
  const present = context?.cards?.[cards[1].id];
  const presentMeaning = directInterpretation(present ? first(present) : first(right[actualTopic]));
  const reason = pairReason(profiles[0], profiles[1]);
  const pairSelection = pairReading(cards, profiles, actualTopic, reason, context?.id);
  const pair = directInterpretation(pairSelection.text);
  const concern = context?.concern && !context?.id ? directInterpretation(`내 고민은 ${context.concern}이다.`) : '';
  const limit = SITUATION_BOUNDARIES[context?.id]
    || (context?.boundary ? directAction(`${phrase(context.boundary, '을')} 지킨다.`) : '');
  const lastAdvice = context?.cards?.[cards[2].id];
  const lastSentences = lastAdvice ? splitSummarySentences(lastAdvice) : [];
  const lastMeaning = directInterpretation(lastAdvice ? lastSentences[0] : last[actualTopic]);
  const lastAction = lastSentences.length > 1 ? directAction(lastSentences.slice(1).join(' ')) : '';
  const choiceLink = lastAction || directAction(profiles[2].route);
  // Keep the authored meaning and its action together: a later sentence may
  // refer to a condition or object introduced by the one immediately before it.
  const paragraphs = [
    lastAdvice ? paragraph(lastMeaning, choiceLink) : lastMeaning,
    paragraph(opening, concern, presentMeaning, pair),
    lastAdvice ? limit : paragraph(choiceLink, limit)
  ];
  const summaryLines = summaryLinesFrom(lastAdvice ? lastMeaning : pair, choiceLink);
  const overview = paragraph(first(lastMeaning), lastAdvice ? '' : first(pair),
    first(lastAction || directAction(closingAction.trim()) || choiceLink));
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
