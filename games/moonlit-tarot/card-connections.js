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
    return `${quoted(right.offer, '은/는')} ${quoted(left.excess, '을/를')} 조절하는 기준이고, ${quoted(left.offer, '은/는')} ${quoted(right.excess, '을/를')} 돌아보는 기준이야. ${quoted(concern, '을/를')} 판단할 때 한 카드의 장점만 밀지 말고, 두 기준을 함께 적용해.`;
  }
  if (reason === 'right-supports-left') {
    return `${quoted(right.offer, '은/는')} ${quoted(left.excess, '을/를')} 조절하는 기준이야. ${quoted(concern, '을/를')} 두고 움직인다면, 처음 마음만으로 결정하지 말고 ${quoted(right.route, '을/를')} 따라 행동해.`;
  }
  if (reason === 'left-supports-right') {
    return `${quoted(left.offer, '은/는')} ${quoted(right.excess, '을/를')} 돌아보는 기준이야. ${quoted(concern, '을/를')} 판단할 때 지금 눈에 들어온 일만 따라가지 말고, ${quoted(left.route)}에 맞춰 먼저 할 일을 정해.`;
  }
  if (reason === 'shared-emphasis') {
    return `두 카드의 공통 핵심은 ${quoted(emphasis[left.give], '이야/야')}. ${quoted(concern, '을/를')} 살필 때 첫째 카드로 문제의 시작점을 짚고, 둘째 카드로 지금 이어지는 모습과 달라진 조건을 구분해.`;
  }
  if (reason === 'different-pace') {
    return `한쪽은 실행을, 다른 쪽은 멈춰서 확인하는 시간을 강조해. ${quoted(concern, '을/를')} 한꺼번에 결정하지 말고, 바로 실행할 작은 일과 확인이 끝날 때까지 보류할 일을 따로 정해.`;
  }
  return `두 카드의 핵심은 서로 달라. ${quoted(concern, '을/를')} 다룰 때 먼저 ${quoted(left.route, '을/를')} 따르고, 그 과정에서 ${quoted(right.offer, '을/를')} 어디에 적용할지 정해.`;
}

function tensionText(left, right, reason, boundary) {
  const opening = `첫째 카드의 뜻만 따르면 ${quoted(left.excess, '을/를')}, 둘째 카드의 뜻만 따르면 ${quoted(right.excess, '을/를')} 경계해야 해.`;
  if (reason === 'shared-emphasis') {
    return `${opening} 비슷한 방향을 강조하는 두 장이라고 해서 그 방법을 더 많이 써야 한다는 뜻은 아니야. 같은 힘을 지나치게 쓰지 않도록 ${quoted(boundary, '을/를')} 행동의 한계로 정해.`;
  }
  if (reason === 'different-pace') {
    return `${opening} 빨리 해치우려는 마음과 더 기다리려는 마음이 번갈아 커진다면, 기다리는 이유와 지금 할 일을 따로 적어. ${quoted(boundary, '을/를')} 지키는 범위에서 작은 행동부터 시작해.`;
  }
  return `${opening} 서로 도움이 되는 뜻이라도 한 카드의 장점이 다른 카드의 주의점을 저절로 없애 주지는 않아. ${quoted(boundary, '을/를')} 실제로 지키는지 확인하고, 도움이 된 행동과 부담을 키운 행동을 구분해.`;
}

function responseText(left, right, last, names, concern, boundary) {
  const supports = [];
  if (last.give === left.need) supports.push(0);
  if (last.give === right.need) supports.push(1);
  let response;
  if (supports.length === 2) {
    response = `앞의 두 장에서 짚은 ${quoted(left.excess, '과/와')} ${quoted(right.excess, '을/를')} 함께 조절하는 방법이야. 두 문제를 한꺼번에 해결하려 하지 말고 ${emphasis[last.give]}부터 챙겨.`;
  } else if (supports.length === 1) {
    const index = supports[0], other = index === 0 ? right : left, supported = index === 0 ? left : right;
    response = `이 방법은 ${quoted(names[index])}의 주의점인 ${quoted(supported.excess, '을/를')} 다루는 데 먼저 써야 해. 다른 카드가 보탠 ${quoted(other.offer, '도/도')} 함께 살리고, 한쪽 문제를 고치느라 다른 장점을 버리지 마.`;
  } else {
    response = `앞에서 본 ${quoted(left.offer, '과/와')} ${quoted(right.offer, '을/를')} 실제로 어떻게 쓸지 정하는 기준이야. 둘 중 하나를 버리지 말고 먼저 할 일과 그다음 할 일을 정해.`;
  }
  return {
    paragraph: `셋째 ${quoted(names[2])}의 역할은 ${quoted(last.offer, '을/를')} 보태는 거야. 해결 방법은 ${quoted(last.route, '이야/야')}. ${response} ${quoted(concern, '을/를')} 다룰 첫 행동 하나를 정해. 실행 전에는 그 행동이 ${quoted(boundary, '을/를')} 지키는지 확인해.`,
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
      `첫째 ${quoted(displayNames[0])}의 핵심은 ${quoted(left.offer, '이야/야')}. 둘째 ${quoted(displayNames[1])}에서 강조하는 점은 ${quoted(right.offer, '이야/야')}. ${supportText(left, right, reason, context.concern)}`,
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
