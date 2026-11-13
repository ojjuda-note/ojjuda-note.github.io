import { CONNECTION_PROFILES, getConnectionProfile as lookupConnectionProfile } from './connection-profiles.js?v=20261113-tarot-easy1';

// These are editorial ways to connect existing meanings, not a second draw or
// an asserted traditional rule for every possible three-card combination.
const emphasis = Object.freeze({
  choice: '스스로 고르는 일', practice: '직접 해 보는 일',
  clarity: '사실을 확인하는 일', support: '도움을 나누는 일',
  limits: '맡을 일을 정하는 일', pause: '잠시 쉬어 가는 일',
  review: '지난 결과를 돌아보는 일', acceptance: '달라진 현실을 받아들이는 일'
});

function quoted(value, particles = '') {
  const text = String(value).trim();
  // Mark actual card names; everyday phrases read naturally without quotation marks.
  if (!particles) return `‘${text}’`;
  const [withFinal, withoutFinal] = particles.split('/');
  const code = text.codePointAt(text.length - 1);
  const hasFinal = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `${text}${hasFinal ? withFinal : withoutFinal}`;
}

export function getConnectionProfile(cardId) {
  return lookupConnectionProfile(cardId);
}

function pairReason(left, right) {
  if (right.give === left.need && left.give === right.need) return 'mutual-support';
  if (right.give === left.need) return 'right-supports-left';
  if (left.give === right.need) return 'left-supports-right';
  if (left.give === right.give) return 'shared-emphasis';
  if ([left.pace, right.pace].includes('fast') && [left.pace, right.pace].includes('pause')) return 'different-pace';
  return 'different-emphasis';
}

function supportText(left, right, reason, concern) {
  if (reason === 'mutual-support') {
    return `${quoted(left.offer, '과/와')} ${quoted(right.offer, '을/를')} 함께 쓰라는 뜻이야. ${quoted(concern, '을/를')} 생각하며 두 방법을 차례로 써 봐. ${left.route} 그다음에는 ${right.route}`;
  }
  if (reason === 'right-supports-left') {
    return `${quoted(left.excess, '을/를')} 줄이려면 ${quoted(right.offer, '이/가')} 필요해. ${quoted(concern, '을/를')} 살펴볼 때 이렇게 해 봐. ${right.route}`;
  }
  if (reason === 'left-supports-right') {
    return `${quoted(right.excess, '을/를')} 줄이려면 ${quoted(left.offer, '이/가')} 필요해. ${quoted(concern, '을/를')} 살펴볼 때는 이 방법부터 써 봐. ${left.route}`;
  }
  if (reason === 'shared-emphasis') {
    return `두 카드 모두 ${quoted(emphasis[left.give], '을/를')} 중요하게 봐. ${quoted(concern, '을/를')} 돌아보며 처음과 지금이 어떻게 다른지 살펴봐. 첫째 카드는 문제가 시작된 이유를, 둘째 카드는 지금 살필 점을 알려 줘.`;
  }
  if (reason === 'different-pace') {
    return `한 카드는 움직이라고 하고, 다른 카드는 잠깐 멈춰 보라고 해. ${quoted(concern, '을/를')} 차근차근 살펴봐. 바로 해도 되는 작은 일과 더 알아본 뒤 할 일을 나눠.`;
  }
  return `두 카드는 서로 다른 부분을 짚어 줘. ${quoted(concern, '을/를')} 살필 때 두 방법을 차례로 써 봐. ${left.route} 그다음에는 ${right.route} ${quoted(left.offer, '과/와')} ${quoted(right.offer, '을/를')} 차례로 살리라는 뜻이야.`;
}

function tensionText(left, right, reason, boundary) {
  const opening = `첫째 카드에서 조심할 점은 ${quoted(left.excess, '이야/야')}. 둘째 카드에서는 ${quoted(right.excess, '을/를')} 주의해.`;
  if (reason === 'shared-emphasis') {
    return `${opening} 비슷한 뜻의 카드가 나와도 한 방법만 고집하지 마. ${quoted(boundary, '을/를')} 지킬 수 있는 만큼만 해.`;
  }
  if (reason === 'different-pace') {
    return `${opening} 서두르고 싶다가도 더 기다리고 싶다면, 기다리는 이유부터 적어 봐. ${quoted(boundary, '을/를')} 지키면서 지금 할 수 있는 일 하나를 정해.`;
  }
  return `${opening} 해 본 뒤에는 무엇이 도움이 됐고 무엇이 부담이었는지 살펴봐. ${quoted(boundary, '을/를')} 지키기 어렵다면 방법을 고쳐.`;
}

function responseText(left, right, last, names, concern, boundary) {
  const supports = [];
  if (last.give === left.need) supports.push(0);
  if (last.give === right.need) supports.push(1);
  let response;
  if (supports.length === 2) {
    response = `이 방법은 앞의 두 카드가 짚은 어려움에 모두 도움이 돼. 한꺼번에 해결하려고 애쓰기보다 ${emphasis[last.give]}부터 시작해.`;
  } else if (supports.length === 1) {
    const index = supports[0], other = index === 0 ? right : left, supported = index === 0 ? left : right;
    response = `특히 ${quoted(names[index])}에서 짚은 ${quoted(supported.excess, '을/를')} 줄이는 데 써 봐. 다른 카드의 장점인 ${quoted(other.offer, '도/도')} 함께 살려.`;
  } else {
    response = `이 방법으로 앞의 두 카드가 말한 장점을 실제 행동에 옮겨 봐. 먼저 할 일과 그다음 할 일을 하나씩 정하면 돼.`;
  }
  return {
    paragraph: `셋째 ${quoted(names[2])}에서 필요한 것은 ${quoted(last.offer, '이야/야')}. ${last.route} ${response} 시작하기 전에는 ${quoted(boundary, '을/를')} 지킬 수 있는지 확인해.`,
    supports
  };
}

export function buildCardConnections({ cards, context, names } = {}) {
  if (!Array.isArray(cards) || cards.length !== 3
      || new Set(cards.map(card => card?.id)).size !== 3
      || cards.some(card => !card || typeof card.name !== 'string' || !card.name.trim()
        || !Object.hasOwn(CONNECTION_PROFILES, card.id))) {
    throw new Error('tarot_connections_require_three_actual_cards');
  }
  if (!context || ['concern', 'boundary'].some(field => typeof context[field] !== 'string' || !context[field].trim())) {
    throw new Error('tarot_connections_require_context');
  }
  const displayNames = names === undefined ? cards.map(card => card.name.trim()) : names;
  if (!Array.isArray(displayNames) || displayNames.length !== 3
      || displayNames.some(name => typeof name !== 'string' || !name.trim())) {
    throw new Error('tarot_connections_require_three_names');
  }
  const [left, right, last] = cards.map(card => getConnectionProfile(card.id));
  const reason = pairReason(left, right);
  const third = responseText(left, right, last, displayNames, context.concern, context.boundary);
  return {
    paragraphs: [
      `첫째 ${quoted(displayNames[0])} 카드는 ${quoted(left.offer, '을/를')} 강조해. 둘째 ${quoted(displayNames[1])} 카드는 ${quoted(right.offer, '을/를')} 중요하게 봐. ${supportText(left, right, reason, context.concern)}`,
      tensionText(left, right, reason, context.boundary),
      third.paragraph
    ],
    evidence: {
      cards: cards.map(card => card.id), pair: reason,
      thirdRespondsTo: third.supports.map(index => cards[index].id),
      lenses: cards.map(card => ({ cardId: card.id, offer: getConnectionProfile(card.id).offer, excess: getConnectionProfile(card.id).excess, route: getConnectionProfile(card.id).route })),
      method: 'authored-card-lenses-with-shared-editorial-connection-rules'
    }
  };
}
