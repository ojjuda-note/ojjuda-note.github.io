// Input directory: data/ from aunsiels/alphazero_janggi at the commit below.
// Only aggregate opening frequencies are published, never individual records.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createJanggiStart } from '../games/janggi/worker-rules.mjs';
import { searchRules } from '../games/janggi/search-rules.mjs';
import { positionFen } from '../games/janggi/neural-player.mjs';
import { BOOK_FILE, BOOK_PLIES, bookKey } from '../games/janggi/opening-book.mjs';

const [input, output] = process.argv.slice(2);
assert.ok(input && output, 'Usage: node scripts/build-janggi-openings.mjs INPUT_DATA_DIR OUTPUT_DIR');
const source = 'https://github.com/aunsiels/alphazero_janggi/tree/5884af5bd94aaade2d078528233349fe2f4205d3/data';
const sources = [
 ['game_data.txt', 'e92f8ede5989beb834ef59984dbf20744dd5ad07596f9afaa53115aa57412319'],
 ['game_data2.txt', 'd0ecfaf907d4f4280dc71b1457ae995aa2dac55acbaae2708b376ccefbb54b04']
];
const layout = { won:'heeh', yang:'ehhe', gwee:'eheh', sang:'hehe' };
const starts = new Map();
for (const c of Object.values(layout)) for (const h of Object.values(layout)) {
 const start = createJanggiStart({c,h});
 starts.set(positionFen(start), start);
}
const counts = new Map(), seen = new Set(), accepted = [];
const reverseRow = {0:'9',1:'8',2:'7',3:'6',4:'5',5:'4',6:'3',7:'2',8:'1',9:'0'};
for (const [name, sha] of sources) {
 const data = readFileSync(join(input, name));
 assert.equal(createHash('sha256').update(data).digest('hex'), sha, 'Wrong snapshot of ' + name);
 let games = 0;
 for (const record of data.toString().trim().split(/\n\n+/)) {
  const lines = record.split('\n');
  const gibo = name === 'game_data.txt';
  // GIB names both back ranks from the same viewpoint. PyChess coordinates
  // instead count ranks upwards from Cho, and give the board explicitly.
  const state = gibo ? createJanggiStart({c:layout[lines[0]],h:[...layout[lines[1]]].reverse().join('')}) : starts.get(lines[0]);
  if (!state) continue;
  let moves = lines.slice(gibo ? 2 : 1).join('\n');
  if (!gibo) moves = moves.replace(/^(\d)(\d)(\d)(\d)$/gm, (_,r,c,s,d) => reverseRow[r]+c+reverseRow[s]+d);
  // The exporter can append a pass to encode a winner. A terminal pass does
  // not distinguish otherwise identical games, including across collections.
  moves = moves.replace(/(?:\n(?:XXXX|(\d\d)\1))+$/g, '');
  const path = moves.split('\n');
  if (path.length < BOOK_PLIES) continue;
  const id = createHash('sha256').update(bookKey(state) + moves).digest('hex');
  if (seen.has(id)) continue;
  seen.add(id);
  const observations = new Map();
  let board = state, valid = true;
  for (const step of path.slice(0, BOOK_PLIES)) {
   if (!/^[0-9][0-8][0-9][0-8]$/.test(step)) { valid = false; break; }
   const [r,c,s,d] = [...step].map(Number), from = 9*r+c, to = 9*s+d;
   const move = searchRules.moves(board).find(move => move.f === from && move.t === to);
   if (!move || searchRules.isDraw(board)) { valid = false; break; }
   const position = bookKey(board);
   // Count a game once per position; repetition cannot inflate its popularity.
   if (!observations.has(position)) observations.set(position, from*90+to);
   board = searchRules.apply(board,move);
  }
  if (!valid) continue;
  for (const [position, move] of observations) {
   if (!counts.has(position)) counts.set(position, new Map());
   const choices = counts.get(position);
   choices.set(move, (choices.get(move) || 0) + 1);
  }
  games++;
 }
 accepted.push(games);
}
const positions = Object.create(null);
for (const [position, choices] of counts) {
 const frequent = [...choices].filter(([, count]) => count >= 8);
 if (frequent.length) positions[position] = Object.fromEntries(frequent);
}
const meta = {source, accepted, plies:BOOK_PLIES, minimumGames:8, positions:Object.keys(positions).length};
for (const start of starts.values()) assert.ok(positions[bookKey(start)], 'Missing starting layout');
assert.ok(accepted.every(count => count > 20000) && meta.positions > 1000, 'Incomplete corpus');
writeFileSync(join(output, BOOK_FILE), JSON.stringify({meta, positions}));
console.log(JSON.stringify(meta));
