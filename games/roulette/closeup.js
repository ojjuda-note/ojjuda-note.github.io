const clamp=value=>Math.min(1,Math.max(0,value));
const fullView=Object.freeze({amount:0,zoom:1,focus:Object.freeze({x:0,y:10,z:0})});

// Follow the ball only after it has landed inside a pocket. The physical
// trajectory stays untouched, and no announced result is used to aim ahead.
export function sampleCloseup(plan,progress,pose,options={}){
  if(!plan||!pose)return fullView;
  const reduced=options.reduced??(plan.reduced===true);
  const landing=plan.flights?.[2]?.end??plan.pocketTime;
  const time=clamp(progress)*plan.duration,t=clamp((time-landing)/(reduced?1.6:1.2));
  const amount=t*t*t*(10+t*(-15+6*t)),zoom=1+((reduced?1.55:2.4)-1)*amount;
  const radius=(pose.radius+346.5)/2;
  // Keep the target on the pocket floor between the ball and printed number,
  // so the little landing bounces do not shake the camera vertically.
  return {amount,zoom,focus:{x:Math.cos(pose.angle)*radius,y:39,z:Math.sin(pose.angle)*radius}};
}
