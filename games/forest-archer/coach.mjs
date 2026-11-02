/** A conservative release cue. It never changes aim, fires, or spends anything. */
import {BOWS, clamp, targetAt, launchArrow, launchVolley, stepArrow} from './engine.mjs?v=20261102-archery-wind-arrow-balance1';

export const COACH_REACTION_SECONDS = .10;
const CHARGE_SECONDS = 1.25;
const DRAW_LIMIT = 10;
const identity = target => `${target?.kind || 'target'}:${target?.passId ?? 'fixed'}`;
const finitePoint = point => point && ['x','y','z'].every(axis => Number.isFinite(point[axis]));

function forecastShot(input,stage,worldTime,shot = launchArrow({...input})) {
  if (shot.ability?.type === 'magnetic') {
    // Guidance cannot reach a target while its plane is farther than the
    // activation radius. Skip only that provably unguided prefix, using the
    // same exact engine sweep (including ground, walls and moving people).
    // Stop on a guidance-step boundary so the following curve is unchanged.
    const distance = stage.distance-shot.ability.radius-shot.position.z;
    const drag = Math.max(0,shot.dragRate || 0), forward = shot.velocity.z;
    let entryTime = 0;
    if (distance > 0 && forward > 0) {
      const ratio = distance*drag/forward;
      entryTime = drag < 1e-8 ? distance/forward : ratio >= 1 ? Infinity : -Math.log1p(-ratio)/drag;
    } else if (forward <= 0) entryTime = Infinity;
    const prefix = entryTime >= 8 ? 8 : Math.max(0,Math.floor((entryTime-1e-10)*240)/240);
    if (prefix > 0) {
      const ability = shot.ability;
      shot.ability = null;
      stepArrow(shot,prefix,stage,worldTime);
      shot.ability = ability;
      if (!shot.active) return {shot,result:shot.result};
    }
  }
  const result = stepArrow(shot,8-shot.elapsed,stage,worldTime+shot.elapsed);
  return {shot,result};
}

/**
 * Predict the current shot and a short human reaction later. A cue describes
 * the supplied aim at this instant, not a promise about later hand movement.
 */
export function evaluateCoachShot(params = {}, stage = {}, worldTime = 0, {held,steadyStart,steadyDuration} = {}) {
  let probes = 0, nowScore = 0, laterScore = 0;
  const reactionDelay = COACH_REACTION_SECONDS;
  const charge = clamp(Number.isFinite(params.charge) ? params.charge : 0,0,1);
  const heldSeconds = Number.isFinite(held) ? Math.max(0,held) : charge*CHARGE_SECONDS;
  const steadyEnd = Number.isFinite(steadyStart) && Number.isFinite(steadyDuration) ? steadyStart+steadyDuration : NaN;
  const isSteady = time => Number.isFinite(steadyEnd) && time >= steadyStart && time < steadyEnd;
  const steady = isSteady(heldSeconds);
  const answer = (ready,reason,extra = {}) => ({ready,score:Math.min(nowScore,laterScore),reason,reactionDelay,steady,probes,nowScore,laterScore,...extra});
  if (!Number.isFinite(worldTime) || !Number.isFinite(stage.distance) || stage.distance <= 0 ||
    !Number.isFinite(params.yaw ?? 0) || !Number.isFinite(params.pitch ?? 0)) return answer(false,'invalid');
  const weapon = typeof params.bow === 'number' ? BOWS[params.bow] : params.bow || BOWS[0];
  if (!weapon || weapon.weaponType === 'gun') return answer(false,'gun');
  if (stage.kind === 'clay' || stage.kind === 'ufo' || stage.eventLevel || stage.isEvent) return answer(false,'event');
  if (charge <= 0 || heldSeconds < .25) return answer(false,'early');
  if (heldSeconds+reactionDelay >= DRAW_LIMIT) return answer(false,'release-limit');
  if (Number.isFinite(steadyEnd) && steady !== isSteady(heldSeconds+reactionDelay)) return answer(false,'steady-transition');

  const current = targetAt(stage,worldTime), afterReaction = targetAt(stage,worldTime+reactionDelay);
  if (current.active === false || afterReaction.active === false || !finitePoint(current) || !finitePoint(afterReaction)) return answer(false,'inactive-target');
  const currentIdentity = identity(current);
  if (identity(afterReaction) !== currentIdentity) return answer(false,'target-change');
  const future = {...params,charge:clamp((heldSeconds+reactionDelay)/CHARGE_SECONDS,0,1)};
  const now = {...params,charge};
  const checks = [];
  const probe = (input,time) => {
    probes++;
    const {shot,result} = forecastShot(input,stage,time);
    if (result?.type !== 'hit' || !finitePoint(result.point) || !finitePoint(result.targetCenter)) return {ok:false,reason:result?.type || 'miss',score:0,shot,result};
    if (identity(result.targetCenter) !== currentIdentity) return {ok:false,reason:'target-change',score:result.score,shot,result};
    const minimum = result.targetCenter.kind === 'target' ? 8 : 1;
    if (result.score < minimum) return {ok:false,reason:'quality',score:result.score,shot,result};
    return {ok:true,score:result.score,shot,result};
  };
  for (const [index,input] of [now,future].entries()) {
    const time = worldTime+index*reactionDelay, check = probe(input,time);
    if (index === 0) nowScore=check.score;else laterScore=check.score;
    if (!check.ok) return answer(false,check.reason,{targetPassId:current.passId ?? null});
    checks.push({...check,input,time});
  }

  if ((weapon.burstCount || 1) > 1 && stage.passers?.length) {
    // The centered first bolt establishes best-of-three quality. Extra bolts
    // may miss or hit a wall, but hitting a person invalidates the whole volley.
    // A draw keeps one burst seed, so these are the actual extra trajectories,
    // including their launch delays, at release now and after reaction time.
    for (const check of checks) {
      for (const shot of launchVolley(check.input).slice(1)) {
        probes++;
        const {result} = forecastShot(check.input,stage,check.time+(shot.launchDelay || 0),shot);
        if (result?.type === 'person') return answer(false,'person',{targetPassId:current.passId ?? null});
      }
    }
  }
  return answer(true,'ready',{targetPassId:current.passId ?? null});
}
