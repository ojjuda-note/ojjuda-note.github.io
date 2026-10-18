// Bounded, deterministic aiming. Computer turns use only the three free weapons.
import {windAt} from './engine.mjs';
export function computerCommand(saved,windTime=Math.round(saved.windTime??0)){
 const tanks=saved.tanks,t=tanks[saved.turn];
 const target=tanks.filter((other,i)=>i!==saved.turn&&other.hp>0).sort((a,b)=>Math.abs(a.x-t.x)-Math.abs(b.x-t.x))[0];
 if(!target||!t||t.hp<=0)throw Error('invalid_move');
 const width=800*Math.max(3,Math.ceil(tanks.length/3)+1),k=Math.sqrt(width*1.15*.15)/100,dir=target.x>t.x?1:-1;
 const ground=x=>saved.terrain[Math.max(0,Math.min(saved.terrain.length-1,Math.floor(x/2)))]*2;
 const drift=new Float64Array(3201);let windSpeed=0;
 for(let n=1;n<drift.length;n++){windSpeed+=windAt(saved.weatherSeed??saved.seed,windTime+Math.ceil(n/2)*1000/60)*.175;drift[n]=drift[n-1]+windSpeed*.175;}
 function distance(angle,power){
  const rad=angle*Math.PI/180,cos=Math.cos(rad),sin=Math.sin(rad);
  const x0=t.x+cos*8.1,y0=t.y-4.05-sin*8.1,vx=cos*power*k,vy=-sin*power*k,h=.175;
  // Four physics substeps per sample; the discrete acceleration matches the engine.
  for(let n=4;n<=3200;n+=4){
   const acceleration=h*h*n*(n+1)/2,x=x0+vx*n*h+drift[n],y=y0+vy*n*h+.15*acceleration;
   if(x<0||x>width||y>720)return Infinity;
   const d=Math.hypot(x-target.x,y-(target.y-3));
   if(d<6||y>=ground(x))return d;
  }
  return Infinity;
 }
 let best={angle:dir>0?45:135,power:70,score:Infinity};
 const consider=(angle,power)=>{const score=distance(angle,power);if(score<best.score)best={angle,power,score};};
 for(let a=10;a<=85;a+=5)for(let p=20;p<=100;p+=5)consider(dir>0?a:180-a,p);
 const coarse={...best};
 for(let a=coarse.angle-5;a<=coarse.angle+5;a++)for(let p=Math.max(5,coarse.power-5);p<=Math.min(100,coarse.power+5);p++)consider(a,p);
 // Casual opponents make independent angle and power errors; they never become perfect.
 let noise=(saved.seed^Math.imul(saved.shotNo+1,0x9e3779b9)^Math.imul(saved.turn+1,0x85ebca6b))>>>0;
 const random=()=>{noise=(Math.imul(noise,1664525)+1013904223)>>>0;return noise/4294967296;};
 return {type:'fire',weapon:saved.shotNo%5===0?2:saved.shotNo%3===0?0:1,windTime,
  angle:Math.max(0,Math.min(180,best.angle+(random()*2-1)*3.5)),power:Math.max(5,Math.min(100,best.power+(random()*2-1)*5)),moves:[]};
}
