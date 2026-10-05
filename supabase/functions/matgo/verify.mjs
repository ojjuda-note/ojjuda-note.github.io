import { Game, seededRandom, aiChooseCard, aiChoose, aiGoStop, aiChooseGukjin } from './engine.mjs';

export async function verifyRound(round, actions, {cpuMode='adaptive'}={}) {
  if (!Array.isArray(actions) || !actions.length || actions.length > 512) throw Error('invalid_actions');
  let current, choice = 0, result;
  const game = new Game({
    event: async (type, data) => { if (type === 'end' || type === 'nagari') result = { type, ...data }; },
    choose: async (p, indices) => {
      const value = current.choices[choice++];
      if (!indices.includes(value) || (p === 1 && value !== aiChoose(game, p, indices))) throw Error('invalid_choice');
      return value;
    },
    chooseGukjin: async p => {
      if (!['yul', 'pi'].includes(current.gukjin) || (p === 1 && current.gukjin !== aiChooseGukjin(game, p))) throw Error('invalid_gukjin');
      return current.gukjin;
    },
    goStop: async (p, points) => {
      if (!['go', 'stop'].includes(current.decision) || (p === 1 && current.decision !== aiGoStop(game, p, points))) throw Error('invalid_decision');
      return current.decision;
    }
  });
  game.random = seededRandom(round.seed);
  game.cpuMode = cpuMode;
  game.rate = round.rate ?? 100;
  game.bank = [round.gold, 5000]; game.first = round.first; game.carry = round.carry;
  game.deal();
  for (const action of actions) {
    if (!action || game.over || ![0, 1].includes(action.p) || (action.type !== 'chongtong' && game.turn !== action.p)) throw Error('invalid_turn');
    current = action; choice = 0;
    if (action.type === 'chongtong') {
      if ((action.p === 1 && action.decision !== 'win') || !await game.declareChongtong(action.p, action.decision)) throw Error('invalid_chongtong');
    } else if (action.type === 'shake') {
      if (!game.shakeCards(action.p, action.month)) throw Error('invalid_shake');
    } else if (action.type === 'gukjin') {
      if (action.p !== 0 || !game.toggleGukjin(0)) throw Error('invalid_gukjin');
    } else if (action.type === 'play') {
      if (!Array.isArray(action.choices) || action.choices.length > 2) throw Error('invalid_choice');
      const card = action.card === null ? null : game.hand[action.p].find(c => c.id === action.card);
      if (action.card !== null && !card) throw Error('invalid_card');
      let bomb = null;
      if (action.bomb !== null) {
        if (!Array.isArray(action.bomb) || ![1, 2].includes(action.bomb.length)) throw Error('invalid_bomb');
        bomb = action.bomb.map(id => game.hand[action.p].find(c => c.id === id));
        if (bomb.some(c => !c)) throw Error('invalid_bomb');
      }
      if (action.p === 1) {
        const expected = aiChooseCard(game, 1);
        if ((expected?.id ?? null) !== action.card) throw Error('invalid_cpu_move');
        const same = card ? game.hand[1].filter(c => c.m === card.m) : [];
        const matches = card ? game.matches(card.m) : [];
        const shouldBomb = same.length >= 3 && matches.length === 1 && matches[0][0].length === 1;
        if (!!bomb !== shouldBomb) throw Error('invalid_cpu_bomb');
        if (same.length >= 3 && !shouldBomb && !game.shake[1]) throw Error('invalid_cpu_shake');
      }
      const before = game.actions.length;
      const played = await game.play(action.p, card, bomb);
      if (played === false || game.actions.length !== before + 1 || choice !== action.choices.length) throw Error('invalid_play');
      const recorded = game.actions.at(-1);
      if (recorded.gukjin !== action.gukjin) throw Error('invalid_gukjin');
      if (recorded.decision !== action.decision) throw Error('invalid_decision');
    } else throw Error('invalid_action');
  }
  if (!game.over || !result || !Number.isSafeInteger(game.bank[0]) || game.bank[0] < 0) throw Error('unfinished_round');
  return { gold: game.bank[0], first: game.first, carry: game.carry };
}
