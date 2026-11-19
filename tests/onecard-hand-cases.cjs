/* Independently specified display order: numbers 1–8, colored actions, then wild attacks. */
const hand = Object.freeze([
  'X-R', 'H-3', 'C-Q', 'S-10', 'D-2', 'S-A', 'H-7', 'C-J', 'D-K', 'X-B',
  'S-Q', 'C-3', 'D-Q', 'H-Q', 'S-2', 'C-A', 'D-6', 'H-10', 'S-7',
]);
const numberOrder = Object.freeze([
  'C-Q', 'S-Q', 'D-Q', 'H-Q', 'H-3', 'C-3', 'D-6', 'S-10', 'H-10',
  'D-2', 'S-2', 'S-A', 'C-A', 'H-7', 'S-7', 'C-J', 'D-K', 'X-B', 'X-R',
]);
const colorOrder = Object.freeze([
  'S-Q', 'S-10', 'S-2', 'S-A', 'S-7', 'H-Q', 'H-3', 'H-10', 'H-7',
  'D-Q', 'D-6', 'D-2', 'D-K', 'C-Q', 'C-3', 'C-A', 'C-J', 'X-B', 'X-R',
]);
module.exports = { hand, numberOrder, colorOrder };
