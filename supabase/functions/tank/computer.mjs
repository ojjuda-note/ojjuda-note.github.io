// Bounded, deterministic aiming. Computer turns use only the three free weapons.
import {advance,mapWidth,currentWind,TANK_SCALE} from './engine.mjs';
export const COMPUTER_ACCURACY=.15;
export function computerCommand(saved,windTime=Math.round(saved.windTime??0)){
 const tanks=saved.tanks,t=tanks[saved.turn];
 if(!t||t.hp<=0)throw Error('invalid_move');
 const target=tanks.filter((other,i)=>i!==saved.turn&&other.hp>0).sort((a,b)=>Math.abs(a.x-t.x)-Math.abs(b.x-t.x))[0];
 if(!target)throw Error('invalid_move');
 const width=mapWidth(saved),k=Math.sqrt(width*1.15*.15)/100,dir=target.x>t.x?1:-1;
 const ground=x=>saved.terrain[Math.max(0,Math.min(saved.terrain.length-1,Math.floor(x/2)))]*2;
 const wind=currentWind(saved);
 function landing(angle,power){
  const rad=angle*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
  const x0=t.x+cos*18*TANK_SCALE,y0=t.y-9*TANK_SCALE-sin*18*TANK_SCALE,vx=cos*power*k,vy=-sin*power*k,h=.175;
  // Four physics substeps per sample; the discrete acceleration matches the engine.
  for(let n=4;n<=3200;n+=4){
   const acceleration=h*h*n*(n+1)/2,x=x0+vx*n*h+wind*acceleration,y=y0+vy*n*h+.15*acceleration;
   if(y>760)return {x,y};
   if(y>=ground(x)||tanks.some((other,i)=>other.hp>0&&(i!==saved.turn||n>=48)&&Math.hypot(x-other.x,y-(other.y-6*TANK_SCALE))<12*TANK_SCALE))return {x,y};
  }
  return null;
 }
 // Reuse coarse trajectories when trying several nearby landing spots.
 const trajectories=[];
 for(let a=10;a<=85;a+=5)for(let power=20;power<=100;power+=5){
  const angle=dir>0?a:180-a,point=landing(angle,power);
  if(point)trajectories.push({angle,power,...point});
 }
 function aimAt(x,y){
  let best={angle:dir>0?45:135,power:70,score:Infinity};
  const consider=shot=>{const score=Math.hypot(shot.x-x,shot.y-y);if(score<best.score)best={...shot,score};};
  trajectories.forEach(consider);
  const coarse={...best};
  for(let angle=Math.max(5,coarse.angle-5);angle<=Math.min(175,coarse.angle+5);angle++)for(let power=Math.max(5,coarse.power-5);power<=Math.min(100,coarse.power+5);power++){
   const point=landing(angle,power);if(point)consider({angle,power,...point});
  }
  return best;
 }
 // The seeded roll stays stable on retries and never ramps up with later turns.
 let noise=(saved.seed^Math.imul(saved.shotNo+1,0x9e3779b9)^Math.imul(saved.turn+1,0x85ebca6b))>>>0;
 const random=()=>{noise=(Math.imul(noise,1664525)+1013904223)>>>0;return noise/4294967296;};
 const command={type:'fire',weapon:saved.shotNo%5===0?2:saved.shotNo%3===0?0:1,windTime,moves:[]};
 if(random()<COMPUTER_ACCURACY){const best=aimAt(target.x,target.y-6*TANK_SCALE);return {...command,angle:best.angle,power:best.power};}
 // Miss close to the opponent instead of throwing angle and power far off.
 // Check real splash, pellets and falling damage to keep the 15% difficulty.
 const firstSide=random()<.5?-1:1;
 let safest=null,leastDamage=Infinity;
 for(let attempt=0;attempt<8;attempt++){
  const side=firstSide*(attempt%2?-1:1),offset=70+Math.floor(attempt/2)*20+random()*15;
  const x=Math.max(8,Math.min(width-8,target.x+side*offset)),best=aimAt(x,ground(x));
  const candidate={...command,angle:best.angle,power:best.power};
  const next=advance(saved,saved.turn,candidate).state;
  const damage=tanks.reduce((sum,tank,i)=>sum+Math.max(0,tank.hp-next.tanks[i].hp)*(i===saved.turn?1:1000),0);
  if(damage<leastDamage){safest=candidate;leastDamage=damage;}
  if(damage===0)return candidate;
 }
 return safest;
}
