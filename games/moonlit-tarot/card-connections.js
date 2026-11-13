import { CONNECTION_PROFILES, getConnectionProfile as lookupConnectionProfile } from './connection-profiles.js?v=20261113-tarot-personal1';

// These are editorial ways to connect existing meanings, not a second draw or
// an asserted traditional rule for every possible three-card combination.
const emphasis = Object.freeze({
  choice: '직접 고를 수 있는 부분', practice: '말을 실제 행동으로 옮기는 과정',
  clarity: '아는 것과 짐작한 것을 구별하는 일', support: '혼자 감당하지 않을 방법',
  limits: '지킬 범위와 맡을 책임', pause: '잠시 멈춰 다시 볼 여유',
  review: '이미 한 선택과 실제 결과를 돌아보는 일', acceptance: '달라진 현실을 인정하는 과정'
});

function quoted(value, particles = '') {
  const text = String(value).trim();
  if (!particles) return `‘${text}’`;
  const [withFinal, withoutFinal] = particles.split('/');
  const code = text.codePointAt(text.length - 1);
  const hasFinal = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0;
  return `‘${text}’${hasFinal ? withFinal : withoutFinal}`;
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
    return `${quoted(right.offer, '은/는')} ${quoted(left.excess, '을/를')} 줄이는 데 보탬이 되고, ${quoted(left.offer, '은/는')} ${quoted(right.excess, '을/를')} 돌아보게 해. ${quoted(concern, '을/를')} 살필 때 두 뜻을 함께 쓰면 한쪽에만 기대지 않고 진행할 수 있어.`;
  }
  if (reason === 'right-supports-left') {
    return `${quoted(right.offer, '은/는')} ${quoted(left.excess, '을/를')} 줄이는 데 보탬이 돼. ${quoted(concern, '을/를')} 두고 움직인다면, 처음 마음만으로 밀고 가기 전에 ${quoted(right.route, '을/를')} 함께 생각해 보렴.`;
  }
  if (reason === 'left-supports-right') {
    return `${quoted(left.offer, '은/는')} ${quoted(right.excess, '을/를')} 돌아보게 하는 기준이 될 수 있어. ${quoted(concern, '을/를')} 살필 때 지금 눈에 들어오는 일만 따라가기보다 ${quoted(left.route, '을/를')} 먼저 떠올려 보렴.`;
  }
  if (reason === 'shared-emphasis') {
    return `두 카드 모두 ${emphasis[left.give]}에 무게를 두고 있어. ${quoted(concern, '을/를')} 살필 때 첫째 카드에서는 무엇이 문제의 시작점인지, 둘째 카드에서는 그 일이 지금 어떤 모습으로 이어지는지 나누어 생각해 보렴.`;
  }
  if (reason === 'different-pace') {
    return `한쪽은 움직일 힘을, 다른 쪽은 멈춰 살필 시간을 강조해. ${quoted(concern, '을/를')} 한꺼번에 결정하기보다 지금 작게 해 볼 부분과 더 알아본 뒤 정할 부분을 구분하면 두 뜻을 함께 쓸 수 있어.`;
  }
  return `두 카드가 살피는 지점은 달라. ${quoted(concern, '을/를')} 두고 먼저 ${quoted(left.route, '을/를')} 생각한 뒤, 현재 상황에서도 ${quoted(right.offer, '을/를')} 쓸 여지가 있는지 살펴보는 식으로 연결할 수 있어.`;
}

function tensionText(left, right, reason, boundary) {
  const opening = `첫째 뜻만 크게 밀어붙이면 ${quoted(left.excess)} 쪽으로, 둘째 뜻만 믿고 따르면 ${quoted(right.excess)} 쪽으로 기울 수 있어.`;
  if (reason === 'shared-emphasis') {
    return `${opening} 비슷한 방향을 강조하는 두 장이라고 해서 그 방법을 더 많이 써야 한다는 뜻은 아니야. ${quoted(boundary, '을/를')} 지키고 있는지 확인하면 같은 힘을 지나치게 쓰는 일을 줄일 수 있어.`;
  }
  if (reason === 'different-pace') {
    return `${opening} 빨리 해치우려는 마음과 더 기다리려는 마음이 번갈아 커진다면, 기다리는 이유와 지금 해도 되는 일을 따로 말해 보렴. ${quoted(boundary, '을/를')} 해치지 않는 작은 행동부터 고르면 속도가 달라도 함께 다룰 수 있어.`;
  }
  return `${opening} 서로 도움이 되는 뜻이라도 한 카드의 장점이 다른 카드의 주의점을 저절로 없애 주지는 않아. ${quoted(boundary, '을/를')} 실제로 지키는지 살피며, 도움이 된 행동과 부담을 키운 행동을 구별해 보렴.`;
}

function responseText(left, right, last, names, concern, boundary) {
  const supports = [];
  if (last.give === left.need) supports.push(0);
  if (last.give === right.need) supports.push(1);
  let response;
  if (supports.length === 2) {
    response = `앞의 두 장에서 짚은 ${quoted(left.excess, '과/와')} ${quoted(right.excess, '을/를')} 함께 돌아보는 방법이야. 두 문제를 한 번에 없애려 하기보다 ${emphasis[last.give]}부터 챙겨 보렴.`;
  } else if (supports.length === 1) {
    const index = supports[0], other = index === 0 ? right : left, supported = index === 0 ? left : right;
    response = `이 방법은 ${quoted(names[index])}에서 조심할 ${quoted(supported.excess, '을/를')} 다루는 데 특히 연결돼. 그 과정에서 다른 카드가 보탠 ${quoted(other.offer, '도/도')} 함께 남겨 두면 한쪽 문제를 해결하다 다른 장점을 놓치지 않을 수 있어.`;
  } else {
    response = `앞에서 본 ${quoted(left.offer, '과/와')} ${quoted(right.offer, '을/를')} 실제로 어떻게 쓸지 정할 때 필요한 기준이야. 앞의 두 뜻 중 하나를 버리기보다 실행할 순서를 좁히는 데 써 보렴.`;
  }
  return {
    paragraph: `셋째 ${quoted(names[2], '은/는')} ${quoted(last.offer, '을/를')} 보태. 다음 방법으로는 ${quoted(last.route, '을/를')} 떠올릴 수 있어. ${response} ${quoted(concern, '을/를')} 다룰 작은 행동을 정하고, 그 행동이 ${quoted(boundary, '을/를')} 지킬 수 있는지도 함께 확인해 봐.`,
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
      `첫째 ${quoted(displayNames[0])}의 핵심은 ${quoted(left.offer, '이야/야')}. 둘째 ${quoted(displayNames[1])}에서는 ${quoted(right.offer, '을/를')} 함께 살펴볼 수 있어. ${supportText(left, right, reason, context.concern)}`,
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
