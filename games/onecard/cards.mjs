// Original four-color One Card artwork. Persistent DOM faces keep deals smooth.
import {cardInfo} from './engine.mjs?v=20261120-onecard7';

const SVG_NS = 'http://www.w3.org/2000/svg';
const COLORS = Object.freeze({
  S: {name: 'blue', fill: '#4078b9', path: 'M50 10a40 40 0 1 0 0 80 40 40 0 0 0 0-80Z'},
  H: {name: 'red', fill: '#d25a55', path: 'M50 6 94 50 50 94 6 50Z'},
  D: {name: 'yellow', fill: '#e9b94d', path: 'M50 7 96 89H4Z'},
  C: {name: 'green', fill: '#438e72', path: 'M12 12H88V88H12Z'},
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
  return cardInfo(typeof card === 'string' ? card : card?.id);
}
function svg(className, viewBox = '0 0 64 64') {
  return svgElement('svg', {viewBox, class: className, 'aria-hidden': 'true', focusable: 'false'});
}

export function cardLabel(card) {
  return cardParts(card)?.label || '뒤집힌 카드';
}

/** Every color has a second, geometric identifier for color-blind players. */
export function createSuit(suit, className = 'suit') {
  const mark = svg(className, '0 0 100 100');
  mark.append(svgElement('path', {d: (COLORS[suit] || COLORS.S).path, fill: 'currentColor'}));
  return mark;
}

function palette(className = 'card-palette') {
  const mark = svg(className);
  mark.append(svgElement('circle', {cx: 17, cy: 17, r: 12, fill: COLORS.S.fill}));
  mark.append(svgElement('path', {d: 'M47 4 60 17 47 30 34 17Z', fill: COLORS.H.fill}));
  mark.append(svgElement('path', {d: 'M17 34 31 59H3Z', fill: COLORS.D.fill}));
  mark.append(svgElement('rect', {x: 35, y: 35, width: 25, height: 25, rx: 2, fill: COLORS.C.fill}));
  return mark;
}

function actionIcon(kind, className = 'card-action-icon') {
  if (kind === 'change' && className === 'card-action-icon') return palette(className);
  const mark = svg(className);
  const attrs = {fill: 'none', stroke: 'currentColor', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'};
  if (kind === 'skip') {
    mark.append(svgElement('circle', {...attrs, cx: 32, cy: 32, r: 21}));
    mark.append(svgElement('path', {...attrs, d: 'M17 47 47 17'}));
  } else if (kind === 'reverse') {
    mark.append(svgElement('path', {...attrs, d: 'M14 44V29a13 13 0 0 1 13-13h9M27 7l9 9-9 9'}));
    mark.append(svgElement('path', {...attrs, d: 'M50 20v15a13 13 0 0 1-13 13h-9M37 39l-9 9 9 9'}));
  } else if (kind === 'again') {
    mark.append(svgElement('path', {...attrs, d: 'M50 25a20 20 0 1 0 1 13M50 11v14H36'}));
    mark.append(svgElement('path', {...attrs, 'stroke-width': 4, d: 'M27 27l6-4v20M27 43h12'}));
  } else {
    mark.append(svgElement('path', {...attrs, d: 'M12 22h40m-9-9 9 9-9 9M52 43H12m9-9-9 9 9 9'}));
  }
  return mark;
}

function corner(info, bottom = false) {
  const node = element('span', 'card-corner' + (bottom ? ' bottom' : ''));
  if (info.displayKind === 'number' || info.displayKind === 'attack') {
    node.append(element('span', 'card-rank', info.displayValue));
  } else node.append(actionIcon(info.displayKind, 'card-corner-icon'));
  node.append(info.joker ? palette('card-corner-palette') : createSuit(info.suit, 'card-color-mark'));
  return node;
}

function face(info) {
  const node = element('span', 'card-face');
  node.setAttribute('aria-hidden', 'true');
  if (!info) return node;
  node.append(element('span', 'card-field'), element('span', 'card-medallion'));
  const center = element('span', 'card-center');
  if (info.displayKind === 'number' || info.displayKind === 'attack') {
    center.append(element('span', 'card-value', info.displayValue));
    if (info.joker) center.append(palette());
  } else {
    center.append(actionIcon(info.displayKind), element('span', 'card-action-label', info.displayValue));
  }
  node.append(center, corner(info), corner(info, true));
  return node;
}

function back() {
  const node = element('span', 'card-back');
  node.setAttribute('aria-hidden', 'true');
  const badge = element('span', 'card-back-emblem');
  badge.append(palette('card-back-palette'));
  node.append(badge, element('span', 'card-back-title', '원카드'));
  return node;
}

/** Make one persistent card node. Display labels are text, never HTML. */
export function createCard(card, options = {}) {
  const node = element(options.interactive ? 'button' : 'div', 'playing-card');
  if (options.interactive) node.type = 'button';
  else node.setAttribute('role', 'img');
  return updateCard(node, card, options);
}

/** Face-down nodes reveal neither identity nor color, including during a flight. */
export function updateCard(node, card, options = {}) {
  const info = cardParts(card);
  const faceDown = options.faceDown ?? !info;
  const key = faceDown ? 'back' : info?.id || 'back';
  if (node.dataset.face !== key) {
    node.replaceChildren(face(faceDown ? null : info), back());
    node.dataset.face = key;
  }
  if (!faceDown && info) {
    node.dataset.cardId = info.id;
    node.dataset.color = info.color;
    node.dataset.kind = info.displayKind;
  } else {
    delete node.dataset.cardId;
    delete node.dataset.color;
    delete node.dataset.kind;
  }
  node.classList.toggle('is-back', faceDown);
  node.classList.toggle('is-small', !!options.small);
  node.setAttribute('aria-label', options.label || (faceDown ? '뒤집힌 카드' : cardLabel(card)));
  return node;
}
