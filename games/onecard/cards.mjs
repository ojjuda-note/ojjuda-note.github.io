// Original vector card artwork. Faces remain DOM nodes during the deal animation.
const SVG_NS = 'http://www.w3.org/2000/svg';
const SUITS = Object.freeze({
  S: { label: '스페이드', color: 'black', path: 'M50 3C40 17 6 36 6 59c0 16 12 26 26 26 8 0 14-4 18-11-1 12-5 17-13 22h26C55 91 51 86 50 74c4 7 10 11 18 11 14 0 26-10 26-26C94 36 60 17 50 3Z' },
  H: { label: '하트', color: 'red', path: 'M50 94C40 83 5 58 5 31 5 3 38-4 50 20 62-4 95 3 95 31 95 58 60 83 50 94Z' },
  D: { label: '다이아몬드', color: 'red', path: 'M50 3 91 50 50 97 9 50Z' },
  C: { label: '클로버', color: 'black', path: 'M50 4c-22 0-30 26-16 38C11 29-4 49 5 68c7 17 30 18 43 4-1 12-5 19-14 25h32C57 91 53 84 52 72c13 14 36 13 43-4 9-19-6-39-29-26C80 30 72 4 50 4Z' },
});
const PIPS = Object.freeze({
  2: [[50, 5], [50, 95]],
  3: [[50, 5], [50, 50], [50, 95]],
  4: [[22, 5], [78, 5], [22, 95], [78, 95]],
  5: [[22, 5], [78, 5], [50, 50], [22, 95], [78, 95]],
  6: [[22, 5], [78, 5], [22, 50], [78, 50], [22, 95], [78, 95]],
  7: [[22, 5], [78, 5], [50, 27], [22, 50], [78, 50], [22, 95], [78, 95]],
  8: [[22, 5], [78, 5], [50, 27], [22, 50], [78, 50], [50, 73], [22, 95], [78, 95]],
  9: [[22, 5], [78, 5], [22, 35], [78, 35], [50, 50], [22, 65], [78, 65], [22, 95], [78, 95]],
  10: [[22, 5], [78, 5], [50, 20], [22, 35], [78, 35], [22, 65], [78, 65], [50, 80], [22, 95], [78, 95]],
});

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svgElement(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  return node;
}
function cardParts(card) {
  const id = typeof card === 'string' ? card : card?.id;
  const match = /^([SHDC])-(A|[2-9]|10|J|Q|K)$/.exec(id || '');
  if (match) return { id, suit: match[1], rank: match[2], color: SUITS[match[1]].color, joker: false };
  if (id === 'X-B' || id === 'X-R') return { id, suit: 'X', rank: id.slice(-1), color: id === 'X-R' ? 'red' : 'black', joker: true };
  return null;
}

export function cardLabel(card) {
  const info = cardParts(card);
  if (!info) return '뒤집힌 카드';
  if (info.joker) return info.color === 'red' ? '빨간 조커' : '검은 조커';
  const rank = { A: '에이스', J: '잭', Q: '퀸', K: '킹' }[info.rank] || info.rank;
  return `${SUITS[info.suit].label} ${rank}`;
}

export function createSuit(suit, className = 'suit') {
  const shape = SUITS[suit] || SUITS.S;
  const svg = svgElement('svg', { viewBox: '0 0 100 100', class: className, 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgElement('path', { d: shape.path, fill: 'currentColor' }));
  return svg;
}

function corner(info, bottom = false) {
  const node = element('span', `card-corner${bottom ? ' bottom' : ''}`);
  node.append(element('span', 'card-rank', info.joker ? 'JOKER' : info.rank));
  if (!info.joker) node.append(createSuit(info.suit));
  return node;
}

function court(info) {
  const node = element('span', 'card-court');
  const svg = svgElement('svg', { viewBox: '0 0 60 90', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgElement('path', { d: 'M10 24 7 8 19 15 30 5 41 15 53 8 50 24Z', fill: '#c4a364', 'fill-opacity': '.5', stroke: '#ad8950', 'stroke-width': '.8' }));
  svg.append(svgElement('path', { d: 'M11 28H49M14 31H46M10 82H50', stroke: '#baa16e', 'stroke-width': '.8', fill: 'none' }));
  for (const x of [7, 30, 53]) svg.append(svgElement('circle', { cx: x, cy: x === 30 ? 5 : 8, r: 2, fill: '#bd9f5e' }));
  node.append(svg, element('span', 'card-court-rank', info.rank));
  const suit = element('span', 'court-suit'); suit.append(createSuit(info.suit)); node.append(suit);
  return node;
}

function joker() {
  const node = element('span', 'joker-art');
  const svg = svgElement('svg', { viewBox: '0 0 100 100', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(svgElement('path', { d: 'M22 56Q5 44 10 21Q35 21 40 48Q34 16 51 6Q71 17 60 48Q72 21 93 28Q93 48 77 60Z', fill: 'currentColor' }));
  svg.append(svgElement('path', { d: 'M24 56Q48 45 76 58L72 67Q50 59 29 68Z', fill: '#c7a86a' }));
  svg.append(svgElement('path', { d: 'M29 69Q51 62 72 69Q62 92 50 93Q37 88 29 69Z', fill: 'none', stroke: '#ad8d54', 'stroke-width': '2' }));
  svg.append(svgElement('path', { d: 'M42 79Q51 86 60 78', fill: 'none', stroke: '#ad8d54', 'stroke-width': '2', 'stroke-linecap': 'round' }));
  for (const [cx, cy] of [[10, 21], [51, 6], [93, 28]]) svg.append(svgElement('circle', { cx, cy, r: 4, fill: '#c6a96c' }));
  node.append(svg);
  return node;
}

function face(info) {
  const node = element('span', 'card-face');
  node.setAttribute('aria-hidden', 'true');
  if (!info) return node;
  node.append(corner(info), corner(info, true));
  if (info.joker) {
    node.append(joker(), element('span', 'joker-word', 'OJJUDA'));
  } else if (info.rank === 'A') {
    const ace = element('span', 'card-ace'); ace.append(createSuit(info.suit)); node.append(ace);
  } else if (PIPS[info.rank]) {
    const pips = element('span', 'card-pips');
    for (const [x, y] of PIPS[info.rank]) {
      const pip = element('span', `card-pip${y > 50 ? ' inverted' : ''}`);
      pip.style.left = `${x}%`; pip.style.top = `${y}%`; pip.append(createSuit(info.suit)); pips.append(pip);
    }
    node.append(pips);
  } else node.append(court(info));
  return node;
}

function back() {
  const node = element('span', 'card-back'); node.setAttribute('aria-hidden', 'true');
  const emblem = element('span', 'card-back-emblem'); emblem.append(createSuit('S')); node.append(emblem);
  return node;
}

/** Make one persistent card node. All displayed labels are text, never HTML. */
export function createCard(card, options = {}) {
  const node = element(options.interactive ? 'button' : 'div', 'playing-card');
  if (options.interactive) node.type = 'button';
  else node.setAttribute('role', 'img');
  return updateCard(node, card, options);
}

/** Update content only if the identity changes. Face-down nodes contain no card id. */
export function updateCard(node, card, options = {}) {
  const info = cardParts(card);
  const faceDown = options.faceDown ?? !info;
  const key = faceDown ? 'back' : info?.id || 'back';
  if (node.dataset.face !== key) {
    node.replaceChildren(face(faceDown ? null : info), back());
    node.dataset.face = key;
    if (!faceDown && info) node.dataset.cardId = info.id;
    else delete node.dataset.cardId;
  }
  node.classList.toggle('is-back', faceDown);
  node.classList.toggle('is-small', !!options.small);
  node.classList.toggle('card-red', !faceDown && info?.color === 'red');
  node.classList.toggle('card-black', !faceDown && info?.color === 'black');
  node.classList.toggle('card-joker', !faceDown && !!info?.joker);
  node.setAttribute('aria-label', options.label || (faceDown ? '뒤집힌 카드' : cardLabel(card)));
  return node;
}
