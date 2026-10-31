import {WHEEL_ORDER} from './engine.js';

const TAU=Math.PI*2,STEP=TAU/37,HALF=Math.PI/2,GRAVITY=1100;
const clamp=x=>Math.min(1,Math.max(0,x));

// The same physical surface is used by the trajectory and both renderers.
// Lengths are in hundredths of the 3D wheel's world units.
export function wheelSurface(radius){
  if(radius<=318)return 24.5;
  if(radius<323.5){const t=(radius-318)/5.5;return 24.5+19*t*t*(3-2*t)}
  if(radius<=370)return 43.5;
  if(radius<=380)return 43.5+(radius-370)*1.9;
  return 62.5+(radius-380)*.3;
}
function curve(points,endSlope=0){
  const slopes=points.slice(1).map((b,i)=>(b[1]-points[i][1])/(b[0]-points[i][0]));
  const tangents=points.map((_,i)=>{
    if(i===0)return slopes[0];if(i===points.length-1)return endSlope;
    const a=slopes[i-1],b=slopes[i];
    if(a*b<=0)return 0;
    const before=points[i][0]-points[i-1][0],after=points[i+1][0]-points[i][0];
    const w1=2*after+before,w2=after+2*before;
    return (w1+w2)/(w1/a+w2/b);
  });
  return {points,tangents};
}
function sampleCurve({points,tangents},time){
  if(time<=points[0][0])return points[0][1];
  if(time>=points.at(-1)[0])return points.at(-1)[1];
  const i=points.findIndex(point=>point[0]>=time),a=points[i-1],b=points[i],dt=b[0]-a[0],t=(time-a[0])/dt,t2=t*t,t3=t2*t;
  return (2*t3-3*t2+1)*a[1]+(t3-2*t2+t)*dt*tangents[i-1]+(-2*t3+3*t2)*b[1]+(t3-t2)*dt*tangents[i];
}
// Exact Hermite derivative in units per second, independent of render cadence.
function curveVelocity({points,tangents},time){
  if(time<=points[0][0])return tangents[0];
  if(time>=points.at(-1)[0])return tangents.at(-1);
  const i=points.findIndex(point=>point[0]>=time),a=points[i-1],b=points[i],dt=b[0]-a[0],t=(time-a[0])/dt,t2=t*t;
  return (6*t2-6*t)*(a[1]-b[1])/dt+(3*t2-4*t+1)*tangents[i-1]+(3*t2-2*t)*tangents[i];
}
function timeAt(curve,value,lo,hi){
  for(let i=0;i<45;i++){const mid=(lo+hi)/2;if(sampleCurve(curve,mid)>value)lo=mid;else hi=mid}
  return (lo+hi)/2;
}
function rotorPose(plan,time){
  if(time<=plan.pocketTime){
    const u=time/plan.pocketTime,delta=plan.initialWheelVelocity-plan.pocketWheelVelocity;
    return {rotation:plan.startRotation+plan.initialWheelVelocity*time-delta*plan.pocketTime*(u**3-.5*u**4),wheelVelocity:plan.initialWheelVelocity-delta*(3*u*u-2*u**3)};
  }
  // Integral of smoothstep deceleration, with zero acceleration at both ends.
  const u=clamp((time-plan.pocketTime)/plan.coastDuration);
  return {rotation:plan.startRotation+plan.preWheelAngle+plan.coastAngle*(2*u-2*u**3+u**4),wheelVelocity:plan.coastAngle/plan.coastDuration*(2-6*u*u+4*u**3)};
}

// The fixed bowl uses world-space ball motion: adding the rotor's rotation
// there would cancel the ball's roll and make it pause before touching it.
// Only the inner descent is rotor-relative. Its gravity and settling speed
// use elapsed seconds, independent of the server's 20–30 second duration.
export function planSpinMotion(spin,startRotation=0,ballStart=-HALF,options={}){
  const duration=Number.isFinite(spin.duration)?Math.max(20,Math.min(30,spin.duration/1000)):25;
  const variation=clamp(spin.variation),sector=WHEEL_ORDER.indexOf(spin.number)*STEP-HALF,reduced=options?.reduced===true;
  // Reserve the final 4–6 seconds for the rotor carrying the quiet ball.
  // The pocket-relative ball motion reaches zero exactly at pocketTime.
  const coastDuration=4+variation*2,pocketTime=duration-coastDuration;
  const coastTurns=.5+variation*.5,coastAngle=coastTurns*TAU;
  const settlingEnd=pocketTime+.65,dropAt=settlingEnd-(7.5+variation*.4);
  const initialWheelVelocity=TAU*(3.8+variation*.8)*2.55/duration;
  const pocketWheelVelocity=2*coastAngle/coastDuration;
  const preWheelAngle=pocketTime*(initialWheelVelocity+pocketWheelVelocity)/2;
  const wheelDelta=preWheelAngle+coastAngle;
  const rebound=settlingEnd-4,returnAt=settlingEnd-2.85;
  const radial=curve([[0,396],[dropAt-.5,395],[dropAt,393],[dropAt+.65,383],[settlingEnd-5.4,365],[rebound,322],[rebound+.38,341+variation*5],[returnAt,323.5],[settlingEnd-2.35,306],[settlingEnd-1.4,291],[duration,291]]);
  const tail=curve([[dropAt,8.1],[settlingEnd-5.4,4.1],[rebound,1.7],[settlingEnd-2.8,.30],[settlingEnd-2.1,.09],[settlingEnd-1.7,.02],[pocketTime,0],[duration,0]]);
  // Join just inside the rotor, after the contact blend has finished. Keep
  // every later tail value/tangent so its flights and divider clearance do
  // not change. The short bridge integrates a linear relative velocity.
  const orbitEnd=timeAt(radial,368,dropAt,tail.points[1][0]);
  const rotor=rotorPose({startRotation,initialWheelVelocity,pocketWheelVelocity,pocketTime,preWheelAngle,coastAngle,coastDuration},orbitEnd);
  const orbitVelocity=-TAU*(reduced ? .35+variation*.1 : 1.2+variation*.3);
  const joinVelocity=-TAU*(reduced ? .25+variation*.025 : .45+variation*.1);
  const relativeJoinVelocity=joinVelocity-rotor.wheelVelocity;
  const joinRemaining=tail.points[1][1]-(relativeJoinVelocity+tail.tangents[1])*(tail.points[1][0]-orbitEnd)/2;
  const desiredJoin=ballStart+(orbitVelocity+joinVelocity)*orbitEnd/2;
  // An integer number of turns aligns the announced pocket without changing
  // either endpoint speed. The small rounding correction stays in the orbit.
  const target=sector-TAU*Math.round((rotor.rotation+sector+joinRemaining-desiredJoin)/TAU);
  const orbit={points:[[0,ballStart],[orbitEnd,rotor.rotation+target+joinRemaining]],tangents:[orbitVelocity,joinVelocity]};
  const angular={points:[[orbitEnd,joinRemaining],...tail.points.slice(1)],tangents:[relativeJoinVelocity,...tail.tangents.slice(1)]};
  // Fixed-gravity flights leave the surface at actual contacts. Elevation is
  // world-space during flight; the ball no longer follows the slope in midair.
  const flights=[];
  const addFlight=(start,end,strength)=>{
    const from=wheelSurface(sampleCurve(radial,start)),to=wheelSurface(sampleCurve(radial,end));
    flights.push({start,end,from,to,strength});
  };
  addFlight(rebound-.12,rebound+.48,.9);
  addFlight(returnAt-.10,returnAt+.40,.65);
  // The final divider is crossed while airborne, then smaller floor bounces
  // dissipate energy inside the winning pocket instead of reversing in air.
  // Allow the entire sphere to clear the divider before landing, not only
  // its center point. The angular tail keeps rolling through that crossing.
  const dividerAt=timeAt(angular,STEP/2,settlingEnd-2.8,pocketTime);
  const pocketStart=Math.max(returnAt+.43,dividerAt-.29);
  addFlight(pocketStart,dividerAt+.29,.56);
  let landed=dividerAt+.29;
  for(const span of [.18,.10]){addFlight(landed,landed+span,.2);landed+=span}
  const impacts=flights.map(f=>({at:f.start/duration,strength:f.strength}));
  impacts.push({at:landed/duration,strength:.12});
  return {duration,variation,reduced,startRotation,wheelDelta,initialWheelVelocity,pocketWheelVelocity,preWheelAngle,pocketTime,coastDuration,coastAngle,coastTurns,coastAt:pocketTime/duration,ballStart,sector,target,orbitEnd,orbit,angular,radial,flights,impacts,dropAt:dropAt/duration,reboundAt:rebound/duration,returnAt:returnAt/duration,dockAt:(settlingEnd-1.4)/duration};
}

export function sampleSpinMotion(plan,progress){
  const p=clamp(progress),time=p*plan.duration,coasting=p>=plan.coastAt;
  const {rotation,wheelVelocity}=rotorPose(plan,time),orbiting=time<plan.orbitEnd;
  const radius=coasting?291:sampleCurve(plan.radial,time),angle=orbiting?sampleCurve(plan.orbit,time):rotation+plan.target+(coasting?0:sampleCurve(plan.angular,time)),ground=wheelSurface(radius);
  const radialVelocity=coasting?0:curveVelocity(plan.radial,time),relativeAngularVelocity=coasting?0:orbiting?curveVelocity(plan.orbit,time)-wheelVelocity:curveVelocity(plan.angular,time);
  // The numbered rotor ends at r370, with a raised lip out to r372.3.
  // Blend across that narrow contact area into the stationary outer bowl.
  // A ball carried by the rotor has zero rolling speed, even as it revolves.
  const contact=clamp((radius-369)/5),bowlWeight=contact*contact*(3-2*contact);
  const surfaceSpeed=Math.hypot(radialVelocity,radius*(relativeAngularVelocity+wheelVelocity*bowlWeight));
  const flight=plan.flights.find(f=>time>=f.start&&time<f.end);
  let elevation=ground;
  if(flight){
    const t=time-flight.start,span=flight.end-flight.start;
    elevation=flight.from+(flight.to-flight.from)*t/span+GRAVITY*t*(span-t)/2;
  }
  const height=Math.max(0,elevation-ground);
  elevation=ground+height;
  const phase=p>=plan.coastAt?'coast':p<plan.dropAt?'orbit':p<plan.reboundAt?'drop':p<plan.reboundAt+.025?'rebound':p<plan.returnAt?'return':'settle';
  const impact=plan.impacts.reduce((sum,event)=>sum+(p>=event.at?1:0),0),impactStrength=impact?plan.impacts[impact-1].strength:0;
  return {rotation,wheelVelocity,angle,radius,height,elevation,surfaceSpeed,phase,impact,impactStrength,done:p===1};
}
