import { boards, billiards } from './engines.mjs';

const fail = code => { throw new Error(code); };
const side = (game, user) => user === game.p1 ? 'p1' : user === game.p2 ? 'p2' : fail('not_a_player');
export function verifyAction(game, user, body) {
  const player = side(game, user);
  if (game.status !== 'playing') fail('not_playing');
  if (!Number.isInteger(body.p_ply) || body.p_ply !== game.moves.length) fail('out_of_sync');
  if (game.undo_requested_by) fail('undo_pending');
  if (boards[game.kind]) {
    if (body.action !== 'game_move') fail('bad_kind');
    if ((game.moves.length % 2 ? 'p2' : 'p1') !== player) fail('not_your_turn');
    if (game.moves.length >= 2000) fail('game_too_long');
    if (game.kind === 'janggi' && !['c','h'].every(s => ['eheh','hehe','ehhe','heeh'].includes(game.janggi_layout?.[s]))) fail('layout_not_ready');
    const engine = boards[game.kind];
    let state = engine.init(game.janggi_layout || {});
    for (const input of game.moves) {
      const move = engine.find(state, input);
      if (!move) fail('invalid_history');
      state = engine.apply(state, move);
    }
    if (engine.status(state).over) fail('game_already_over');
    const input = body.p_move;
    if (!input || typeof input !== 'object' || Array.isArray(input)) fail('bad_move');
    if (!input.pass && (!Number.isInteger(input.f) || !Number.isInteger(input.t))) fail('bad_move');
    const legal = engine.find(state, input);
    if (!legal) fail('illegal_move');
    const move = legal.pass ? { pass: 1 } : { f: legal.f, t: legal.t, ...(legal.p ? { p: legal.p } : {}) };
    state = engine.apply(state, legal);
    const status = engine.status(state);
    return { move, turn: player === 'p1' ? 'p2' : 'p1', state: null,
      result: status.over ? status.result === 'draw' ? 'draw' : status.result === engine.first ? 'p1' : 'p2' : null,
      reason: status.over ? status.reason : null };
  }
  if (!['carom4','carom3','pool8'].includes(game.kind) || body.action !== 'game_shot') fail('bad_kind');
  if (game.turn !== player) fail('not_your_turn');
  const state = game.moves.length ? structuredClone(game.verified_state) : billiards.init(game.kind);
  if (!state || state.mode !== game.kind || state.shots !== game.moves.length || state.turn !== player) fail('invalid_history');
  if (state.over) fail('game_already_over');
  const input = body.p_move?.s;
  if (!Array.isArray(input) || ![5,7].includes(input.length) || !input.every(Number.isFinite)) fail('bad_shot');
  const [dx,dy,v,top,spin,cx,cy] = input;
  if (Math.abs(Math.hypot(dx,dy)-1) > 0.00001 || v < 120 || v > 3100 || Math.abs(top)>1 || Math.abs(spin)>1) fail('bad_shot');
  if (cx !== undefined && (!state.inHand || !billiards.canPlace(state,cx,cy))) fail('illegal_placement');
  if (state.inHand && cx === undefined && (!state.balls[0].on || !billiards.canPlace(state,state.balls[0].x,state.balls[0].y))) fail('placement_required');
  const shot = {dx,dy,v,top,side:spin,...(cx === undefined ? {} : {cx,cy})};
  const judged = billiards.judge(state,billiards.simulate(state,shot,false));
  const next = judged.st;
  // Match the position precision shown to both participants. The browser's
  // claimed positions, scores, next turn and winner are deliberately ignored.
  for (const ball of next.balls) { ball.x=Math.round(ball.x*10)/10; ball.y=Math.round(ball.y*10)/10; }
  const group = value => value === 'solid' ? 's' : value === 'stripe' ? 't' : null;
  return { move: {s:input,f:next.balls.map(b=>[b.x,b.y,b.on?1:0]),n:next.turn,
      sc:[next.score.p1,next.score.p2],g:[group(next.groups.p1),group(next.groups.p2)],
      ih:next.inHand?1:0,o:next.over?.winner || null,m:judged.msg.slice(0,40)},
    turn:next.turn,state:next,result:next.over?.winner || null,reason:next.over?'win':null };
}
