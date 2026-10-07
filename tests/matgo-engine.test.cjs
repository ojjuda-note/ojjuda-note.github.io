const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../games/matgo-engine.mjs'), 'utf8').replace(/export function/g,'function').replace(/export \{[^}]+\};/g,'');
const context = vm.createContext({ Math, URLSearchParams });
vm.runInContext(source+'\nglobalThis.api={Game,CARDS,aiChooseCard,aiGoStop,aiChoose};', context);
const { Game, CARDS, aiChooseCard, aiGoStop, aiChoose } = context.api;
let cases = 0;
function conserved(g) {
  const ids = [...g.hand.flat(), ...g.floor.flat(), ...g.deck, ...g.caps.flat()].map(c => c.id);
  assert.equal(ids.length, 50);
  assert.equal(new Set(ids).size, 50);
}
function fixture(p, mode, owner, opponents = [6, 7, 10, 11], bonusSweep = false) {
  const events = [], g = new Game({ event: async (type, data) => events.push({ type, ...data }), choose: async (_p, indices) => indices[0] });
  g.deal();
  const cards = new Map(CARDS.map(c => [c.id, { ...c }])), used = new Set();
  const use = id => { assert.ok(!used.has(id), 'fixture uses each card once'); used.add(id); return cards.get(id); };
  const stack = [0, 1, 2].map(use); stack.ppuk = true;
  if (owner !== undefined) stack.ppukOwner = owner;
  g.floor = [stack, [use(8)]];
  g.hand = [[], []]; g.hand[p] = (mode === 'hand' ? [3, 4] : [4, 5]).map(use);
  g.caps = [[], []]; g.caps[1 - p] = opponents.map(use);
  const lead = bonusSweep ? [48, 9] : mode === 'hand' ? [12] : [3];
  g.deck = lead.map(use).concat([...cards.values()].filter(c => !used.has(c.id)));
  g.turn = p; g.endTurn = async () => {};
  return { g, events, card: g.hand[p][0] };
}
(async () => {
  for (const p of [0, 1]) for (const mode of ['hand', 'flip']) for (const self of [true, false]) {
    const { g, events, card } = fixture(p, mode, self ? p : 1 - p);
    await g.play(p, card); conserved(g);
    const capture = events.find(e => e.type === 'ppukget');
    assert.equal(capture.self, self); assert.equal(capture.count, self ? 2 : 1);
    assert.equal(events.filter(e => e.type === 'steal').length, self ? 2 : 1);
    cases++;
  }
  for (const p of [0, 1]) {
    const { g, events } = fixture(p, 'hand', p);
    // Create the ppuk by playing, then collect it on the same player's next turn.
    const cards = [...g.floor[0], ...g.hand[p]].filter(c => c.m === 1);
    const originalFlip = g.deck.shift(); g.floor[0] = [cards[0]];
    g.hand[p] = [cards[1], cards[3], ...g.hand[p].filter(c => c.m !== 1)];
    g.deck.unshift(cards[2], originalFlip);
    await g.play(p, cards[1]); conserved(g);
    assert.equal(g.floor[0].ppukOwner, p);
    events.length = 0;
    await g.play(p, cards[3]); conserved(g);
    assert.equal(events.find(e => e.type === 'ppukget').self, true);
    assert.equal(events.filter(e => e.type === 'steal').length, 2);
    cases++;
    const combo = fixture(p, 'hand', p, [6, 7, 10, 11], true);
    await combo.g.play(p, combo.card); conserved(combo.g);
    assert.equal(combo.events.filter(e => e.type === 'steal').length, 3, 'self ppuk 2 + sweep 1; bonus adds no steal');
    cases++;
  }
  for (const opponents of [[], [6]]) {
    const { g, events, card } = fixture(0, 'hand', 0, opponents);
    await g.play(0, card); conserved(g);
    assert.equal(events.filter(e => e.type === 'steal').length, Math.min(2, opponents.length));
    assert.equal(g.caps[1].length, 0, 'available pi, including bonus, can be taken');
    cases++;
  }
  for (const p of [0, 1]) for (const mode of ['hand', 'flip']) {
    for (const {opponents, expected, self = true, asPi = false} of [
      {opponents:[43,48],expected:[48]},
      {opponents:[6,7,41],expected:[41]},
      {opponents:[49,6,48,7],expected:[48]},
      {opponents:[32,6,7],expected:[32],asPi:true},
      {opponents:[32,6,7],expected:[6,7]},
      {opponents:[49,6,7],expected:[6,7]},
      {opponents:[49,47,6,7],expected:[47]},
      {opponents:[49,6],expected:[6,49]},
      {opponents:[49],expected:[49]},
      {opponents:[49,32,20],expected:[49]},
      {opponents:[49,48],expected:[48]},
      {opponents:[49,48,6],expected:[6],self:false},
      {opponents:[49,48],expected:[48],self:false},
      {opponents:[49],expected:[49],self:false},
    ]) {
      const {g,events,card}=fixture(p,mode,self?p:1-p,opponents);
      if(asPi)g.caps[1-p].find(c=>c.id===32).asPi=true;
      await g.play(p,card);conserved(g);
      assert.deepEqual(events.filter(e=>e.type==='steal').map(e=>e.card.id),expected,
        `seat ${p}, ${mode}, opponent ${opponents}, ${self?2:1} pi owed`);
      assert.deepEqual(Array.from(g.caps[1-p],c=>c.id),opponents.filter(id=>!expected.includes(id)));
      cases++;
    }
  }
  for(const p of [0,1]){
    const {g,events,card}=fixture(p,'hand',p,[49,41,47,6,7],true);
    await g.play(p,card);conserved(g);
    assert.deepEqual(events.filter(e=>e.type==='steal').map(e=>e.card.id),[41,6],
      'self ppuk plus sweep takes one double and one single, leaving triple bonus');
    cases++;
  }
  const unknown = fixture(0, 'hand', undefined);
  await unknown.g.play(0, unknown.card);
  assert.equal(unknown.events.filter(e => e.type === 'steal').length, 1, 'unowned stacks are not self ppuk');
  cases++;
  let selfPpuks = 0, bombs = 0;
  for (let round = 0; round < 300; round++) {
    let g;
    g = new Game({ event: async (type, data) => { if (type === 'ppukget' && data.self) selfPpuks++; if (type === 'bomb') bombs++; },
      choose: async (p, choices) => aiChoose(g, p, choices), goStop: async (p, s) => aiGoStop(g, p, s) });
    g.deal();
    for (let moves = 0; !g.over; moves++) {
      assert.ok(moves < 120, 'round terminates'); conserved(g);
      for (let pending; (pending = g.pendingChongtong());) await g.declareChongtong(pending.p, 'continue');
      const p = g.turn, card = aiChooseCard(g, p);
      if (!g.canMove(p)) { await g.endTurn(p); continue; }
      const same = card ? g.hand[p].filter(c => c.m === card.m) : [];
      const matches = card ? g.matches(card.m) : [];
      const bomb = same.length >= 3 && matches.length === 1 && matches[0][0].length === 1 ? same.filter(c => c !== card).slice(0, 2) : null;
      await g.play(p, card, bomb); conserved(g);
    }
  }
  console.log(`PASS: ${cases} Matgo scenarios; 300 complete games with 50 unique cards preserved (${selfPpuks} self ppuks, ${bombs} bombs)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
