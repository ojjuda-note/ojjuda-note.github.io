/** Shared painted animal shapes, scoring and attachments. Local y points down. */
const TAU = Math.PI * 2;
const zones = Object.freeze({heart:{score:10,zone:'심장 명중'},head:{score:8,zone:'머리 명중'},
  body:{score:5,zone:'몸통 명중'},leg:{score:3,zone:'다리 명중'},ear:{score:3,zone:'귀 명중'}});
const hearts = Object.freeze({
  rabbit:{x:.14,y:.084,rx:.16,ry:.1176}, wildcat:{x:.20,y:.02,rx:.17,ry:.15},
  cheetah:{x:.27,y:.015,rx:.18,ry:.13}, deer:{x:.27,y:.0374,rx:.18,ry:.1156},
  pigeon:{x:.12,y:.16,rx:.145,ry:.11}, eagle:{x:.19,y:.16,rx:.17,ry:.12},
  bird:{x:.12,y:.244,rx:.14,ry:.088}
});
export const isAnimalKind = kind => Object.hasOwn(hearts,kind);
const animalPart = (ctx,part) => ctx.setAnimalPart?.(part);
function ellipse(ctx,x,y,rx,ry,fill,rotation=0) {
  ctx.beginPath();ctx.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),rotation,0,TAU);ctx.fillStyle=fill;ctx.fill();
}
function line(ctx,x,y,x2,y2,color,width=1) {
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
}
function shape(ctx,points,fill) {
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
  ctx.closePath();ctx.fillStyle=fill;ctx.fill();
}
function drawHeart(ctx,kind) {
  const h=hearts[kind];if(!h)return;
  animalPart(ctx,'heart');
  ellipse(ctx,h.x,h.y,h.rx,h.ry,'rgba(246,222,142,.18)');
  ctx.strokeStyle='rgba(248,229,161,.85)';ctx.lineWidth=.022;ctx.stroke();
  ellipse(ctx,h.x,h.y,.024,.024,'#f4dda0');
}

function drawFeline(ctx,kind,time) {
  const fast=kind==='cheetah',gait=Math.sin(time*(fast?10:6.1)),stride=gait*(fast?.22:.13);
  const coat=fast?'#cea35f':'#a6987c',shade=fast?'#a77d45':'#827c65';
  const light=fast?'#edcf94':'#d2c6a6',ink=fast?'#564c37':'#645e48';
  const limb=(x,offset,near)=>{
    animalPart(ctx,'leg');
    ctx.beginPath();ctx.moveTo(x,.08);
    ctx.lineTo(x+offset*.55,.31);ctx.lineTo(x-offset*.62,.52);
    ctx.strokeStyle=near?coat:shade;ctx.lineWidth=fast?.075:.105;ctx.stroke();
    ellipse(ctx,x-offset*.62+.045,.52,.10,.045,near?light:shade);
  };
  animalPart(ctx,'body');
  // A long balancing tail distinguishes the cheetah from the short-tailed cat.
  ctx.beginPath();ctx.moveTo(-.52,.015);
  if(fast)ctx.bezierCurveTo(-.87,.06,-1.16,-.24+gait*.035,-1.28,-.10+gait*.035);
  else ctx.bezierCurveTo(-.78,-.01,-1.01,-.10+gait*.025,-.95,-.23+gait*.025);
  ctx.strokeStyle=coat;ctx.lineWidth=fast?.085:.13;ctx.stroke();
  if(fast){
    line(ctx,-1.16,-.15+gait*.035,-1.28,-.10+gait*.035,ink,.087);
    line(ctx,-1.04,-.12+gait*.025,-1.075,-.135+gait*.03,ink,.087);
  }else{
    line(ctx,-.82,-.07+gait*.02,-.85,-.085+gait*.02,ink,.135);
    line(ctx,-.94,-.13+gait*.02,-.95,-.23+gait*.025,ink,.13);
  }
  limb(-.43,stride,false);limb(.35,-stride,false);
  animalPart(ctx,'body');
  ellipse(ctx,-.10,0,fast?.67:.59,fast?.22:.29,coat,-.035);
  ellipse(ctx,-.08,.12,fast?.49:.43,fast?.105:.15,light,-.025);
  ellipse(ctx,-.42,.075,fast?.23:.26,fast?.21:.26,coat,-.1);
  if(fast){
    // Small solid spots remain legible even when the whole animal is far away.
    for(const [sx,sy,sr]of[[-.57,-.09,.033],[-.34,-.14,.035],[-.10,-.13,.031],[.12,-.10,.034],[.35,-.05,.028],[-.46,.05,.030],[-.20,.035,.028],[.03,.035,.030],[.23,.07,.027],[-.38,.17,.028]])ellipse(ctx,sx,sy,sr,sr*.8,ink);
  }else{
    for(const sx of[-.44,-.20,.04]){
      ctx.beginPath();ctx.moveTo(sx-.045,-.21);ctx.quadraticCurveTo(sx+.045,-.08,sx,.035);
      ctx.strokeStyle=ink;ctx.lineWidth=.035;ctx.stroke();
    }
  }
  limb(-.39,-stride,true);limb(.38,stride,true);
  animalPart(ctx,'body');
  // A low neck and round muzzle keep the cats distinct from the taller deer.
  ellipse(ctx,fast?.50:.44,-.10,fast?.27:.25,fast?.19:.25,coat,-.17);
  animalPart(ctx,'head');
  ellipse(ctx,fast?.69:.59,-.20,fast?.23:.25,fast?.20:.23,coat,-.10);
  animalPart(ctx,'ear');
  if(fast){
    ellipse(ctx,.56,-.36,.09,.10,shade,-.2);ellipse(ctx,.74,-.37,.085,.095,shade,.1);
    ellipse(ctx,.57,-.36,.045,.05,light);ellipse(ctx,.74,-.37,.04,.045,light);
  }else{
    shape(ctx,[{x:.39,y:-.32},{x:.42,y:-.56},{x:.57,y:-.37}],shade);
    shape(ctx,[{x:.61,y:-.37},{x:.68,y:-.49},{x:.80,y:-.29}],coat);
    shape(ctx,[{x:.44,y:-.39},{x:.45,y:-.49},{x:.52,y:-.38}],light);
    shape(ctx,[{x:.65,y:-.37},{x:.68,y:-.44},{x:.74,y:-.34}],light);
    line(ctx,.42,-.53,.40,-.59,ink,.025);line(ctx,.68,-.47,.69,-.51,ink,.025);
    line(ctx,.54,-.38,.57,-.29,ink,.025);line(ctx,.66,-.38,.65,-.29,ink,.025);
  }
  animalPart(ctx,'head');
  const muzzleX=fast?.87:.78;
  ellipse(ctx,muzzleX,-.10,fast?.16:.15,.11,light,.02);
  ellipse(ctx,muzzleX+.105,-.145,.044,.032,ink);
  const eyeX=fast?.765:.675;
  ellipse(ctx,eyeX,-.235,.032,.036,'#354331');
  ellipse(ctx,eyeX+.009,-.245,.009,.010,'#fff2cf');
  if(fast)line(ctx,eyeX+.012,-.19,muzzleX-.045,-.065,ink,.026);
  else for(const y of[-.095,-.065])line(ctx,.82,y,1.01,y-.025,'#6f7153',.010);
  line(ctx,muzzleX+.065,-.065,muzzleX+.025,-.035,ink,.012);
}

function drawFlightBird(ctx,kind,time) {
  const eagle=kind==='eagle',flap=Math.sin(time*(eagle?2.2:10.2));
  const wing=eagle?'#765c3e':'#829397',farWing=eagle?'#5b4d35':'#65787d';
  const edge=eagle?'#b99d66':'#bac7c4',body=eagle?'#8b6b45':'#8d9e9e';
  ctx.save();
  animalPart(ctx,'body');
  // Keep all animated feathers within the physical silhouette, at every flap.
  ctx.beginPath();ctx.ellipse(0,0,eagle?1.55:1.18,eagle?.95:.86,0,0,TAU);ctx.clip();
  if(eagle){
    const lift=flap*.10;
    shape(ctx,[{x:-.08,y:.02},{x:-.52,y:-.60-lift},{x:-1.28,y:-.49-lift},{x:-1.45,y:-.24-lift},{x:-1.18,y:-.29-lift},{x:-1.40,y:-.10-lift},{x:-1.13,y:-.20-lift},{x:-1.32,y:.03-lift},{x:-.82,y:-.08},{x:-.26,y:.20}],farWing);
    ctx.beginPath();ctx.moveTo(-.12,.06);ctx.bezierCurveTo(.08,-.40,.23,-.72-lift,.45,-.76-lift);
    ctx.lineTo(1.30,-.49-lift);ctx.lineTo(1.45,-.24-lift);ctx.lineTo(1.19,-.30-lift);
    ctx.lineTo(1.38,-.10-lift);ctx.lineTo(1.12,-.20-lift);ctx.lineTo(1.27,.02-lift);
    ctx.quadraticCurveTo(.66,-.16,.12,.20);ctx.closePath();ctx.fillStyle=wing;ctx.fill();
    ctx.beginPath();ctx.moveTo(.15,-.34);ctx.quadraticCurveTo(.54,-.52-lift,1.20,-.30-lift);
    ctx.strokeStyle=edge;ctx.lineWidth=.07;ctx.stroke();
    for(let i=0;i<3;i++)line(ctx,.55+i*.19,-.35-lift,.68+i*.19,-.21-lift,'#594b35',.025);
    shape(ctx,[{x:-.30,y:.12},{x:-.98,y:.31},{x:-.85,y:.55},{x:-.27,y:.31}],'#584b35');
    line(ctx,-.88,.34,-.32,.23,edge,.04);
    ellipse(ctx,-.01,.15,.59,.24,body,-.06);
    ellipse(ctx,.04,.25,.40,.10,'#b59866',-.02);
    animalPart(ctx,'head');
    ellipse(ctx,.53,.015,.30,.20,'#e0d9b6',-.14);
    ellipse(ctx,.71,-.05,.22,.17,'#eee5c5');
    shape(ctx,[{x:.87,y:-.06},{x:1.06,y:.01},{x:1.00,y:.12},{x:.89,y:.04}],'#d2ad5a');
    ellipse(ctx,.77,-.09,.030,.031,'#354331');
    line(ctx,.71,-.13,.82,-.12,'#8c8259',.025);
  }else{
    const lift=.14*flap;
    ctx.beginPath();ctx.moveTo(-.10,.02);ctx.bezierCurveTo(-.35,-.70-lift,-.76,-.64-lift,-1.03,-.23-lift);
    ctx.quadraticCurveTo(-.65,-.24-lift,-.10,.16);ctx.closePath();ctx.fillStyle=farWing;ctx.fill();
    ctx.beginPath();ctx.moveTo(-.05,.10);ctx.bezierCurveTo(.10,-.57-lift,.44,-.76-lift,.94,-.32-lift);
    ctx.quadraticCurveTo(.55,-.23-lift,.10,.22);ctx.closePath();ctx.fillStyle=wing;ctx.fill();
    ctx.beginPath();ctx.moveTo(.27,-.32-lift);ctx.quadraticCurveTo(.55,-.43-lift,.83,-.29-lift);
    ctx.strokeStyle='#566b72';ctx.lineWidth=.060;ctx.stroke();
    ctx.beginPath();ctx.moveTo(.35,-.45-lift);ctx.quadraticCurveTo(.64,-.48-lift,.90,-.31-lift);
    ctx.strokeStyle='#596e76';ctx.lineWidth=.05;ctx.stroke();
    ctx.beginPath();ctx.moveTo(.10,-.22);ctx.quadraticCurveTo(.45,-.64-lift,.92,-.31-lift);
    ctx.strokeStyle=edge;ctx.lineWidth=.028;ctx.stroke();
    shape(ctx,[{x:-.30,y:.11},{x:-1.00,y:.29},{x:-.86,y:.46},{x:-.26,y:.31}],'#647a81');
    line(ctx,-.93,.30,-.87,.42,'#415c66',.045);
    ellipse(ctx,-.04,.14,.48,.24,body,-.10);
    ellipse(ctx,.02,.23,.31,.09,'#bdc8c0',-.05);
    ellipse(ctx,.32,.04,.20,.23,'#6e9185',-.23);
    ellipse(ctx,.37,.10,.10,.16,'#8d8598',-.25);
    animalPart(ctx,'head');
    ellipse(ctx,.48,-.12,.20,.20,'#a9b6af');
    shape(ctx,[{x:.62,y:-.10},{x:.83,y:-.04},{x:.62,y:.02}],'#607176');
    ellipse(ctx,.64,-.08,.052,.03,'#e3e5d3');
    ellipse(ctx,.53,-.15,.038,.039,'#bb9966');
    ellipse(ctx,.54,-.15,.022,.025,'#34433c');
    ellipse(ctx,.546,-.159,.007,.008,'#fff7d7');
    animalPart(ctx,'leg');
    line(ctx,.04,.34,.22,.38,'#a17865',.023);
  }
  ctx.restore();
}

/** Friendly, readable moving woodland targets. radius is the visual scale. */
function paintAnimal(ctx,kind,time=0,showHeart=true) {
  const clock=Number.isFinite(time)?time:0;
  ctx.save();animalPart(ctx,'body');
  ctx.lineCap='round'; ctx.lineJoin='round';
  if(kind==='wildcat'||kind==='cheetah') {
    ctx.beginPath();ctx.ellipse(0,0,kind==='cheetah'?1.38:1.12,kind==='cheetah'?.62:.66,0,0,TAU);ctx.clip();
    drawFeline(ctx,kind,clock);
  } else if(kind==='pigeon'||kind==='eagle') {
    drawFlightBird(ctx,kind,clock);
  } else if(kind==='bird') {
    ctx.translate(0,.18); ctx.scale(1,.8);
    const flap=Math.sin(time*8.5), lift=.25+flap*.65;
    // Far wing, with the near wing carrying a pale feather edge.
    ctx.beginPath(); ctx.moveTo(-.12,-.08);
    ctx.bezierCurveTo(-.45,-.72-lift*.35,-.95,-.64-lift*.55,-1.15,-.13-lift*.65);
    ctx.quadraticCurveTo(-.57,-.37-lift*.14,.04,.12); ctx.closePath(); ctx.fillStyle='#92543a'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-.07,-.07);
    ctx.bezierCurveTo(.08,-.75-lift*.45,.73,-.8-lift*.65,.97,-.29-lift*.65);
    ctx.quadraticCurveTo(.48,-.45-lift*.12,.04,.15); ctx.closePath(); ctx.fillStyle='#ca8958'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(.22,-.45-lift*.27); ctx.quadraticCurveTo(.65,-.65-lift*.43,.97,-.29-lift*.65);
    ctx.strokeStyle='#edc99a'; ctx.lineWidth=.055; ctx.stroke();
    shape(ctx,[{x:-.33,y:.04},{x:-.95,y:.27},{x:-.79,y:.42},{x:-.24,y:.22}],'#674735');
    ellipse(ctx,0,.06,.48,.24,'#ad6945',-.1);
    ellipse(ctx,.05,.15,.32,.1,'#edc99c',-.06);
    animalPart(ctx,'head');
    ellipse(ctx,.43,-.12,.21,.2,'#c98a59');
    shape(ctx,[{x:.58,y:-.14},{x:.86,y:-.07},{x:.58,y:.0}],'#eee1b7');
    ellipse(ctx,.49,-.16,.035,.036,'#2a382f');
    ellipse(ctx,.5,-.175,.009,.009,'#fff6dc');
  } else if(kind==='rabbit') {
    ctx.scale(1,.84);
    const hop=Math.sin(time*7.2),stretch=hop*.12,earTilt=Math.sin(time*7.2-.35)*.08;
    // The engine moves the animal's center; only paws and ears animate here.
    animalPart(ctx,'leg');
    ellipse(ctx,-.34,.40,.29,.10,'#ab9b81',-.18+stretch);
    line(ctx,.25,.24,.35-stretch,.51,'#b4a387',.11);
    ellipse(ctx,.42-stretch,.52,.15,.06,'#c6b598',-.06);
    animalPart(ctx,'body');
    ellipse(ctx,-.68,.04,.15,.14,'#e6dcc6',-.2);
    ellipse(ctx,-.15,.10,.57,.36,'#c3b297',-.13);
    ellipse(ctx,-.18,.22,.42,.18,'#e2d6bf',-.13);
    ellipse(ctx,-.39,.22,.29,.29,'#ccbb9c',-.20);
    animalPart(ctx,'leg');
    ellipse(ctx,-.39+stretch,.48,.29,.084,'#ddd0b4',-.12-stretch*.5);
    line(ctx,-.55+stretch,.47,-.28+stretch,.48,'#b29f81',.015);
    animalPart(ctx,'ear');
    // Two tall ears make the near-range rabbit readable at phone sizes.
    ellipse(ctx,.37,-.49,.092,.31,'#b7a389',-.22-earTilt);
    ellipse(ctx,.365,-.51,.038,.23,'#c7ab99',-.22-earTilt);
    ellipse(ctx,.58,-.51,.10,.34,'#d6c6aa',-.04-earTilt*.7);
    ellipse(ctx,.585,-.53,.041,.26,'#bd9f8c',-.04-earTilt*.7);
    animalPart(ctx,'head');
    ellipse(ctx,.48,-.10,.29,.25,'#d5c5a8',-.06);
    ellipse(ctx,.66,.006,.19,.13,'#e8dcc5',.08);
    ellipse(ctx,.83,-.008,.043,.032,'#785e50');
    line(ctx,.79,.025,.73,.055,'#9a8067',.012);
    ellipse(ctx,.59,-.155,.035,.041,'#344432');
    ellipse(ctx,.598,-.168,.010,.012,'#fff6df');
    animalPart(ctx,'leg');
    line(ctx,.24,.27,.30+stretch,.48,'#d5c1a0',.12);
    ellipse(ctx,.38+stretch,.49,.17,.065,'#e6d6b9',.03);
    line(ctx,.34+stretch,.48,.46+stretch,.49,'#bca68a',.012);
    animalPart(ctx,'head');
    for(const y of[-.018,.021])line(ctx,.71,y,.92,y-.032,'rgba(102,107,80,.65)',.009);
  } else {
    ctx.scale(1,.68);
    const gait=Math.sin(time*5.4)*.19;
    // Far legs and a lifted, cream-edged tail.
    animalPart(ctx,'leg');
    ctx.strokeStyle='#80583d'; ctx.lineWidth=.115;
    for(const [lx,offset]of[[-.46,gait],[.32,-gait]]) {
      ctx.beginPath(); ctx.moveTo(lx,.12); ctx.lineTo(lx+offset,.55); ctx.lineTo(lx-offset*.7,.94); ctx.stroke();
    }
    animalPart(ctx,'body');
    ctx.beginPath(); ctx.moveTo(-.62,-.05); ctx.quadraticCurveTo(-1.04,-.31,-.92,-.43); ctx.quadraticCurveTo(-.69,-.34,-.5,-.1);
    ctx.fillStyle='#eedabc'; ctx.fill();
    ellipse(ctx,-.05,.02,.68,.35,'#b67c4c',-.05);
    ellipse(ctx,-.05,.19,.49,.14,'#e8c899',-.05);
    ctx.beginPath(); ctx.moveTo(.25,-.1); ctx.quadraticCurveTo(.35,-.63,.59,-.84); ctx.lineTo(.83,-.58); ctx.quadraticCurveTo(.55,-.15,.53,.17);
    ctx.fillStyle='#c18a56'; ctx.fill();
    animalPart(ctx,'head');
    ellipse(ctx,.76,-.69,.31,.18,'#c18a56',.15);
    ellipse(ctx,.94,-.64,.16,.1,'#ead0aa',.12);
    ellipse(ctx,1.055,-.66,.052,.047,'#4c4934');
    ellipse(ctx,.75,-.745,.032,.034,'#303f31');
    ellipse(ctx,.755,-.756,.009,.009,'#f6edd5');
    animalPart(ctx,'ear');
    ellipse(ctx,.57,-.91,.075,.2,'#ba8556',-.45);
    ellipse(ctx,.75,-.92,.07,.18,'#d4ab7a',.35);
    animalPart(ctx,'leg');
    ctx.strokeStyle='#c99a67';ctx.lineWidth=.12;
    for(const [lx,offset]of[[-.38,-gait],[.4,gait]]) {
      ctx.beginPath();ctx.moveTo(lx,.17);ctx.lineTo(lx+offset,.55);ctx.lineTo(lx-offset*.8,.95);ctx.stroke();
      line(ctx,lx-offset*.8-.035,.98,lx-offset*.8+.05,.98,'#48503a',.1);
    }
    animalPart(ctx,'body');
    for(const [sx,sy]of[[-.38,-.1],[-.1,-.18],[.13,-.12],[-.19,.02]])ellipse(ctx,sx,sy,.034,.024,'#eac99a');
  }
  ctx.restore();
  if(showHeart)drawHeart(ctx,kind);
}

/** Draw the same normalized paths used by the physical hit test. */
export function drawAnimalModel(ctx,kind,time=0,pose=null) {
  if(!ctx||!isAnimalKind(kind))return;
  const fallen=getAnimalFallPose(pose);
  ctx.save();
  if(fallen.rotation)ctx.rotate(fallen.rotation);
  if(fallen.scaleY!==1)ctx.scale(1,fallen.scaleY);
  const clock=pose?.dead&&Number.isFinite(pose.poseTime)?pose.poseTime:Number.isFinite(time)?time:0;
  paintAnimal(ctx,kind,clock,!pose?.dead);
  ctx.restore();
}

/** The pose falls around its root while the engine lowers that root to ground. */
export function getAnimalFallPose(target) {
  const t=target?.dead?Math.min(1,Math.max(0,(Number.isFinite(target.deathAge)?target.deathAge:0)/.35)):0;
  const eased=t*t*(3-2*t);
  return{rotation:.42*eased,scaleY:1-.52*eased};
}

const transform=(m,p)=>({x:m[0]*p.x+m[2]*p.y+m[4],y:m[1]*p.x+m[3]*p.y+m[5]});
function inverse(m,p) {
  const determinant=m[0]*m[3]-m[1]*m[2];if(Math.abs(determinant)<1e-12)return null;
  const x=p.x-m[4],y=p.y-m[5];
  return{x:(m[3]*x-m[2]*y)/determinant,y:(m[0]*y-m[1]*x)/determinant};
}
const cross=(a,b,p)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const same=(a,b)=>a&&b&&Math.abs(a.x-b.x)<1e-12&&Math.abs(a.y-b.y)<1e-12;
function segmentDistance(p,a,b) {
  const x=b.x-a.x,y=b.y-a.y,length2=x*x+y*y;
  const t=length2?Math.min(1,Math.max(0,((p.x-a.x)*x+(p.y-a.y)*y)/length2)):0;
  const q={x:a.x+x*t,y:a.y+y*t};return{distance:Math.hypot(p.x-q.x,p.y-q.y),t,q};
}
function polygonContains(p,points) {
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[j],b=points[i];
    if(segmentDistance(p,a,b).distance<1e-9)return true;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
function pathContains(point,path) {
  const p=inverse(path.matrix,point);if(!p)return false;
  return path.paths.some(sub=>{
    if(sub.ellipse) {
      const e=sub.ellipse,dx=p.x-e.x,dy=p.y-e.y,c=Math.cos(e.rotation),s=Math.sin(e.rotation);
      return((dx*c+dy*s)/e.rx)**2+((-dx*s+dy*c)/e.ry)**2<=1+1e-9;
    }
    return polygonContains(p,sub.points);
  });
}
function paintedContains(point,primitive) {
  if(!primitive.clips.every(clip=>pathContains(point,clip)))return false;
  if(primitive.paint==='fill')return pathContains(point,primitive);
  const p=inverse(primitive.matrix,point);if(!p)return false;
  return primitive.paths.some(sub=>sub.points.some((b,i)=>
    i>0&&segmentDistance(p,sub.points[i-1],b).distance<=primitive.width/2+1e-9)||
    (sub.closed&&segmentDistance(p,sub.points.at(-1),sub.points[0]).distance<=primitive.width/2+1e-9));
}

// This small Canvas-compatible recorder runs the real drawing, including its
// transforms and clipping. Curves are flattened below a pixel at game scale;
// ellipse fills and the feline/bird clipping ellipses are tested analytically.
class GeometryContext {
  constructor(){this.matrix=[1,0,0,1,0,0];this.clips=[];this.part='body';this.lineWidth=1;this.stack=[];this.primitives=[];this.beginPath();}
  setAnimalPart(part){this.part=part;}
  save(){this.stack.push({matrix:[...this.matrix],clips:[...this.clips],part:this.part,lineWidth:this.lineWidth});}
  restore(){const saved=this.stack.pop();if(saved)Object.assign(this,saved);}
  translate(x,y){const m=this.matrix;m[4]+=m[0]*x+m[2]*y;m[5]+=m[1]*x+m[3]*y;}
  scale(x,y){this.matrix[0]*=x;this.matrix[1]*=x;this.matrix[2]*=y;this.matrix[3]*=y;}
  beginPath(){this.paths=[];this.pathMatrix=[...this.matrix];this.current=null;}
  moveTo(x,y){this.current={points:[{x,y}],closed:false};this.paths.push(this.current);}
  lineTo(x,y){if(!this.current)this.moveTo(x,y);else{delete this.current.ellipse;this.current.points.push({x,y});}}
  closePath(){if(this.current)this.current.closed=true;}
  bezierCurveTo(x1,y1,x2,y2,x,y){
    const a=this.current?.points.at(-1)||{x:0,y:0};if(!this.current)this.moveTo(a.x,a.y);
    for(let i=1;i<=24;i++){const t=i/24,u=1-t;this.lineTo(u*u*u*a.x+3*u*u*t*x1+3*u*t*t*x2+t*t*t*x,u*u*u*a.y+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y);}
  }
  quadraticCurveTo(x1,y1,x,y){
    const a=this.current?.points.at(-1)||{x:0,y:0};if(!this.current)this.moveTo(a.x,a.y);
    for(let i=1;i<=24;i++){const t=i/24,u=1-t;this.lineTo(u*u*a.x+2*u*t*x1+t*t*x,u*u*a.y+2*u*t*y1+t*t*y);}
  }
  ellipse(x,y,rx,ry,rotation,start,end){
    const fresh=!this.current,c=Math.cos(rotation),s=Math.sin(rotation),span=end-start;
    const count=Math.max(12,Math.ceil(Math.abs(span)/TAU*96));
    for(let i=0;i<=count;i++){
      const angle=start+span*i/count,dx=Math.cos(angle)*rx,dy=Math.sin(angle)*ry;
      const p={x:x+c*dx-s*dy,y:y+s*dx+c*dy};
      if(!i&&fresh)this.moveTo(p.x,p.y);else this.lineTo(p.x,p.y);
    }
    if(Math.abs(span)>=TAU-1e-10){this.current.closed=true;if(fresh)this.current.ellipse={x,y,rx,ry,rotation};}
  }
  snapshot(){return{matrix:[...this.pathMatrix],paths:this.paths.map(p=>({...p,points:p.points.map(point=>({...point}))}))};}
  clip(){this.clips.push(this.snapshot());}
  fill(){this.primitives.push({...this.snapshot(),paint:'fill',part:this.part,clips:[...this.clips]});}
  stroke(){this.primitives.push({...this.snapshot(),paint:'stroke',part:this.part,width:this.lineWidth,clips:[...this.clips]});}
}
const geometryCache=new Map();
export function getAnimalGeometry(kind,time=0) {
  if(!isAnimalKind(kind))return null;
  const clock=Number.isFinite(time)?time:0,key=`${kind}:${clock}`;
  if(geometryCache.has(key))return geometryCache.get(key);
  const ctx=new GeometryContext();paintAnimal(ctx,kind,clock);
  const geometry={kind,time:clock,primitives:ctx.primitives,heart:{...hearts[kind]}};
  geometryCache.set(key,geometry);if(geometryCache.size>48)geometryCache.delete(geometryCache.keys().next().value);
  return geometry;
}
/** Ground support comes from the same visible paths, including round strokes. */
export function getAnimalGroundHeight(target) {
  if(!validTarget(target))return 0;
  const geometry=getAnimalGeometry(target.kind,target.poseTime);
  if(!geometry.groundHull){
    const points=[];
    for(const primitive of geometry.primitives){
      if(primitive.part==='heart')continue;
      for(const sub of primitive.paths)for(const point of sub.points){
        const count=primitive.paint==='stroke'?16:1,radius=primitive.paint==='stroke'?primitive.width/2:0;
        for(let i=0;i<count;i++){
          const candidate=transform(primitive.matrix,{x:point.x+radius*Math.cos(TAU*i/count),y:point.y+radius*Math.sin(TAU*i/count)});
          if(primitive.clips.every(clip=>pathContains(candidate,clip)))points.push(candidate);
        }
      }
    }
    points.sort((a,b)=>a.x-b.x||a.y-b.y);
    const lower=[],upper=[];
    for(const point of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),point)<=0)lower.pop();lower.push(point);}
    for(let i=points.length-1;i>=0;i--){const point=points[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),point)<=0)upper.pop();upper.push(point);}
    geometry.groundHull=lower.slice(0,-1).concat(upper.slice(0,-1));
  }
  const pose=getAnimalFallPose(target),s=Math.sin(pose.rotation),c=Math.cos(pose.rotation);
  // Small curve-flattening allowance keeps even the rim of a foot above ground.
  return (Math.max(0,...geometry.groundHull.map(point=>s*point.x+c*point.y*pose.scaleY))+.005)*target.radius;
}
function worldPoint(target,local) {
  const r=target.radius,side=target.direction<0?-1:1;
  const pose=getAnimalFallPose(target),c=Math.cos(pose.rotation),s=Math.sin(pose.rotation);
  const x=c*local.x-s*local.y*pose.scaleY,y=s*local.x+c*local.y*pose.scaleY;
  return{x:target.x+x*r*side,y:target.y-y*r,z:target.z};
}
function validTarget(target){return target&&isAnimalKind(target.kind)&&['x','y','z','radius'].every(key=>Number.isFinite(target[key]))&&target.radius>0;}
/** A stable chest aim point; call with the target predicted at arrival time. */
export function getAnimalAimPoint(target,zone='heart') {
  if(!validTarget(target)||target.dead||zone!=='heart')return null;
  return worldPoint(target,hearts[target.kind]);
}

function weights(p,a,b,c) {
  const area=cross(a,b,c);if(Math.abs(area)<1e-12)return null;
  const w1=cross(p,b,c)/area,w2=cross(a,p,c)/area,w3=1-w1-w2;
  return w1>=-1e-8&&w2>=-1e-8&&w3>=-1e-8?[w1,w2,w3]:null;
}
function attachToPrimitive(point,primitive,index) {
  const p=inverse(primitive.matrix,point);if(!p)return null;
  if(primitive.paint==='stroke') {
    let best=null;
    primitive.paths.forEach((sub,path)=>{
      for(let segment=0;segment<sub.points.length-(sub.closed?0:1);segment++){
        const a=sub.points[segment],b=sub.points[(segment+1)%sub.points.length],hit=segmentDistance(p,a,b);
        if(best&&hit.distance>=best.distance)continue;
        const length=Math.hypot(b.x-a.x,b.y-a.y)||1,ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
        best={distance:hit.distance,index,path,segment,t:hit.t,along:(p.x-hit.q.x)*ux+(p.y-hit.q.y)*uy,
          across:-(p.x-hit.q.x)*uy+(p.y-hit.q.y)*ux};
      }
    });
    return best?{...best,type:'stroke'}:null;
  }
  for(let path=0;path<primitive.paths.length;path++) {
    const sub=primitive.paths[path],points=sub.points;
    if(sub.ellipse) {
      const e=sub.ellipse,dx=p.x-e.x,dy=p.y-e.y,c=Math.cos(e.rotation),s=Math.sin(e.rotation);
      return{type:'ellipse',index,path,x:(dx*c+dy*s)/e.rx,y:(-dx*s+dy*c)/e.ry};
    }
    if(!polygonContains(p,points))continue;
    const indices=Array.from({length:points.length-(same(points[0],points.at(-1))?1:0)},(_,i)=>i);
    let area=0;for(let i=0;i<indices.length;i++){const a=points[indices[i]],b=points[indices[(i+1)%indices.length]];area+=a.x*b.y-b.x*a.y;}
    const direction=area<0?-1:1;
    while(indices.length>=3) {
      let removed=false;
      for(let i=0;i<indices.length;i++) {
        const triangle=[indices[(i+indices.length-1)%indices.length],indices[i],indices[(i+1)%indices.length]];
        const [a,b,c]=triangle.map(j=>points[j]);if(cross(a,b,c)*direction<=1e-12)continue;
        if(indices.some(j=>!triangle.includes(j)&&weights(points[j],a,b,c)))continue;
        const barycentric=weights(p,a,b,c);
        if(barycentric)return{type:'triangle',index,path,triangle,weights:barycentric};
        indices.splice(i,1);removed=true;break;
      }
      if(!removed)break;
    }
  }
  return null;
}

/** Only visibly painted anatomy scores; empty space in the former ellipse misses. */
export function scoreAnimalPoint(point,target,time=target?.poseTime??0) {
  if(!validTarget(target)||target.active===false||target.dead||!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return null;
  const local={x:(point.x-target.x)/target.radius*(target.direction<0?-1:1),y:(target.y-point.y)/target.radius};
  const geometry=getAnimalGeometry(target.kind,time);
  for(const part of ['heart','head','body','leg','ear']) {
    for(let index=geometry.primitives.length-1;index>=0;index--) {
      const primitive=geometry.primitives[index];if(primitive.part!==part||!paintedContains(local,primitive))continue;
      const anchor=attachToPrimitive(local,primitive,index);
      return{...zones[part],part,animalAttachment:anchor?{...anchor,kind:target.kind,part}:null};
    }
  }
  return null;
}

/** Follow the exact moving ear/leg/wing primitive an arrow originally hit. */
export function getAnimalAttachmentPoint(target,attachment,time=target?.poseTime??0) {
  if(!validTarget(target)||!attachment||attachment.kind!==target.kind)return null;
  const clock=target.dead&&Number.isFinite(target.poseTime)?target.poseTime:time;
  const primitive=getAnimalGeometry(target.kind,clock)?.primitives[attachment.index],sub=primitive?.paths[attachment.path];
  if(!sub)return null;
  let point;
  if(attachment.type==='ellipse'&&sub.ellipse) {
    const e=sub.ellipse,c=Math.cos(e.rotation),s=Math.sin(e.rotation),x=attachment.x*e.rx,y=attachment.y*e.ry;
    point={x:e.x+c*x-s*y,y:e.y+s*x+c*y};
  } else if(attachment.type==='triangle'&&attachment.triangle?.every(i=>sub.points[i])) {
    point={x:0,y:0};attachment.triangle.forEach((i,j)=>{point.x+=sub.points[i].x*attachment.weights[j];point.y+=sub.points[i].y*attachment.weights[j];});
  } else if(attachment.type==='stroke') {
    const a=sub.points[attachment.segment],b=sub.points[(attachment.segment+1)%sub.points.length];if(!a||!b)return null;
    const length=Math.hypot(b.x-a.x,b.y-a.y)||1,ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
    point={x:a.x+(b.x-a.x)*attachment.t+ux*attachment.along-uy*attachment.across,
      y:a.y+(b.y-a.y)*attachment.t+uy*attachment.along+ux*attachment.across};
  }
  return point?worldPoint(target,transform(primitive.matrix,point)):null;
}
