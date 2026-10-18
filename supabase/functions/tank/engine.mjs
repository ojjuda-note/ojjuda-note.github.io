// Deterministic physics derived from the supplied tank-game.zip. Shared by the server and display.

export const WEAPONS=[
  {name:'일반탄',price:0,desc:'기본 포탄',ammo:Infinity,r:28.8,dmg:34},
  {name:'대형탄',price:0,desc:'폭발 범위가 넓지만 일반탄보다 피해가 약해요',ammo:Infinity,r:50.4,dmg:24},
  {name:'산탄',price:0,desc:'세 갈래로 퍼져요. 한 발 위력은 일반탄의 3분의 1',ammo:Infinity,r:16.8,dmg:11,count:3},
  {name:'분열탄',price:2,desc:'꼭대기에서 다섯 발로 갈라져요. 한 발 위력은 5분의 1',ammo:Infinity,r:28.8,dmg:7,kind:'mirv'},
  {name:'통통탄',price:1,desc:'땅에서 세 번 튀고 터져요',ammo:Infinity,r:28.8,dmg:32,kind:'bounce'},
  {name:'굴러탄',price:2,desc:'떨어진 뒤 비탈을 굴러가요',ammo:Infinity,r:28.8,dmg:36,kind:'roll'},
  {name:'굴착탄',price:1,desc:'일반탄 범위의 땅을 파요. 피해는 적어요',ammo:Infinity,r:28.8,dmg:12},
  {name:'흙폭탄',price:1,desc:'핵탄 범위의 60%에 흙더미를 쌓아요. 직접 피해는 없어요',ammo:Infinity,r:120,dmg:0,kind:'dirt'},
  {name:'핵탄',price:3,desc:'넓은 범위의 대형 폭발. 정중앙은 한 방에 파괴',ammo:Infinity,r:200,dmg:130},
  {name:'관통탄',price:3,desc:'땅을 뚫고 들어가 터지고, 그 자리에서 두 번 더 튀어나가 터져요',ammo:Infinity,r:28.8,dmg:26,kind:'pierce',pen:30,stage:0},
  {name:'치료탄',price:1,desc:'일반탄 두 배 범위의 모든 생존 탱크 에너지 +25 (최대 100). 땅은 파이지 않아요',ammo:Infinity,r:57.6,dmg:0,kind:'heal',heal:25},
  {name:'이사탄',price:1,desc:'포탄이 떨어진 자리로 내 탱크가 이동해요. 탱크와 지형에 피해가 없어요',ammo:Infinity,r:21.6,dmg:0,kind:'teleport'},
  {name:'유도탄',price:3,desc:'탄착점에서 핵탄 범위 안의 가장 가까운 적을 85% 확률로 추적해요. 실패하면 그 자리에서 폭발. 위력은 일반탄과 같아요',ammo:Infinity,r:28.8,dmg:34,kind:'homing',accuracy:.85},
  {name:'벙커버스터',price:3,desc:'탄착점으로 미사일이 수직 낙하해 땅속을 깊고 넓게 파요',ammo:Infinity,r:86.4,dmg:34,kind:'bunker',depth:140,shaft:8}
];
const PIERCE=[WEAPONS[9],{name:'',r:28.8,dmg:20,kind:'pierce',pen:24,stage:1},{name:'',r:28.8,dmg:12,kind:'pierce',pen:18,stage:2}];
const MIRV_CHILD={name:'',r:28.8,dmg:7};

const COLORS=['#e8d9a8','#e07a5f','#7fc8f8','#9ad27a','#c792ea','#f6c177','#f28fad','#6ee7d2','#ffffff','#b8a07e','#ff9f43','#8ea4ff'];


const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const TANK_SCALE=.5175;
const G=.15,SLOW=.35,TS=TANK_SCALE,FUEL=150,CS=2;
const isBasicWeapon=w=>Number.isInteger(w)&&WEAPONS[w]?.price===0;
export const WIND_MAX=.038;
const windBand=wind=>{const strength=Math.round(Math.abs(wind)/WIND_MAX*10);return strength<=3?0:strength<=7?1:2;};
// Deterministic weather samples; the engine advances the sample only at a new turn.
// Strength bands 0–3 / 4–7 / 8–10 have 70% / 20% / 10% probability.
export function windAt(seed,time){
 const index=Math.floor(time/2800);
 let x=(seed^Math.imul(index,0x9e3779b9))>>>0;
 x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);
 const bits=(x^(x>>>15))>>>0,sample=(bits>>>1)/2147483648;
 const strength=sample<.7?Math.floor(sample/.7*4):sample<.9?4+Math.floor((sample-.7)/.2*4):8+Math.floor((sample-.9)/.1*3);
 return strength===0?0:(bits&1?-1:1)*strength/10*WIND_MAX;
}
export function mapWidth(saved){
 // Keep existing terrain intact; new battles use two thirds of the former width.
 return saved.width??(saved.terrain?(saved.terrain.length-1)*CS:Math.round(800*Math.max(3,Math.ceil(saved.names.length/3)+1)*2/3));
}
export function currentWind(saved){
 const index=saved.windIndex??Math.floor((saved.windTime??0)/2800);
 return clamp(saved.wind??windAt(saved.weatherSeed??saved.seed,index*2800),-WIND_MAX,WIND_MAX);
}
export function createEngine(saved){
 let rng=saved.seed>>>0;
 const random=()=>{rng=(Math.imul(1664525,rng)+1013904223)>>>0;return rng/4294967296;};
 let NT=saved.names.length,VW=800,W=mapWidth(saved),H=450,MH=720,PL=350;
 let FLOOR=MH-4,FR=Math.floor(FLOOR/CS),GW=Math.ceil((W+1)/CS),GH=Math.ceil(MH/CS)+1;
 let K=Math.sqrt(W*1.15*G)/100,WINDMAX=WIND_MAX,windTime=saved.windTime??0,weatherSeed=saved.weatherSeed??saved.seed;
 let windIndex=saved.windIndex??Math.floor(windTime/2800),wind=currentWind(saved);
 let ground=new Float32Array(W+1),mask=new Uint8Array(GW*GH),active=new Set(),tDirty=true;
 let far=[],stars=[],tanks=[],turn=saved.turn??0,state='aim',shots=[],booms=[],bits=[],floats=[],paths=[];
 let shotNo=saved.shotNo||0,settleT=0,frame=0,dirty=0,over=!!saved.over,runId=saved.runId;
 const prepTerrainCanvas=()=>{dirty++;},syncUI=()=>{},sfx=()=>{};

function genWorld(){
  const waves=[];
  const lo=Math.min(H*0.38,PL-60),span=PL-lo;
  for(let i=0;i<5;i++)waves.push({f:(i+1)*(0.6+random()*0.9)*Math.PI*2/(VW*1.4),p:random()*7,a:span*0.3/(i+1)});
  waves.push({f:Math.PI*2/W*(1+random()),p:random()*7,a:span*0.18});
  const base=lo+span*(0.5+random()*0.15);
  for(let x=0;x<=W;x++){let y=base;for(const w of waves)y+=Math.sin(x*w.f+w.p)*w.a;ground[x]=clamp(y,lo,PL);}
  buildMask();
}

function flatten(cx,half){const y=ground[cx];for(let x=cx-half;x<=cx+half;x++)if(x>=0&&x<=W)ground[x]=y;}

function buildMask(){
  FR=Math.floor(FLOOR/CS);GW=Math.ceil((W+1)/CS);GH=Math.ceil(MH/CS)+1;
  mask=new Uint8Array(GW*GH);
  for(let cx=0;cx<GW;cx++){const h=ground[Math.min(W,cx*CS)];for(let cy=Math.floor(h/CS);cy<GH;cy++)mask[cy*GW+cx]=1;}
  prepTerrainCanvas();active.clear();
}

const cellSolid=(cx,cy)=>cx>=0&&cx<GW&&cy>=0&&(cy>=FR||mask[cy*GW+cx]===1);
const solid=(x,y)=>x>=0&&x<=W&&cellSolid(Math.floor(x/CS),Math.floor(y/CS));
function below(x,y){const cx=clamp(Math.floor(x/CS),0,GW-1);let cy=Math.max(0,Math.floor(y/CS));while(cy<FR&&!cellSolid(cx,cy))cy++;return cy*CS;}
const surf=x=>below(x,0);

function wake(x0,x1){for(let cx=Math.max(0,Math.floor(x0/CS));cx<=Math.min(GW-1,Math.floor(x1/CS));cx++)active.add(cx);tDirty=true;}

function settleSand(){
  if(!active.size)return;const done=[];
  for(const cx of active){let moved=false;
    for(let p=0;p<3;p++)for(let cy=FR-2;cy>=0;cy--){const i=cy*GW+cx;if(mask[i]&&!mask[i+GW]){mask[i+GW]=1;mask[i]=0;moved=true;}}
    if(moved)tDirty=true;else done.push(cx);}
  for(const c of done)active.delete(c);
}

function circleCells(x,y,r,v){const r2=r*r;
  for(let cy=Math.max(0,Math.floor((y-r)/CS));cy<=Math.min(FR-1,Math.floor((y+r)/CS));cy++){const py=cy*CS+CS/2-y;
    for(let cx=Math.max(0,Math.floor((x-r)/CS));cx<=Math.min(GW-1,Math.floor((x+r)/CS));cx++){const px=cx*CS+CS/2-x;if(px*px+py*py<=r2)mask[cy*GW+cx]=v;}}
  wake(x-r,x+r);}

function carve(x,y,r){circleCells(x,y,r,0);}

function fillCircle(x,y,r){circleCells(x,y,r,1);}

function mkTank(x,i,name,cpu){return{x,y:surf(x),vy:0,color:COLORS[i],ang:90,pow:5,name,hp:100,ammo:WEAPONS.map(w=>w.ammo),w:0,basicWeapon:0,cpu,hitT:0,fuel:FUEL};}

function nextIdx(){for(let k=1;k<=tanks.length;k++){const j=(turn+k)%tanks.length;if(tanks[j].hp>0)return j;}return turn;}

function tip(t){const a=t.ang*Math.PI/180;return{x:t.x+Math.cos(a)*18*TS,y:t.y-9*TS-Math.sin(a)*18*TS};}


function startTurn(i,changeWind=true){
 if(changeWind){
  const previous=wind;wind=windAt(weatherSeed,++windIndex*2800);
  // Preserve the chosen 70/20/10 band when avoiding the previous turn's wind.
  const band=windBand(wind);
  while(wind===previous||windBand(wind)!==band)wind=windAt(weatherSeed,++windIndex*2800);
 }
 turn=i;const t=tanks[i];t.fuel=FUEL;t.ang=t.lastAng??90;t.pow=t.lastPow??5;t.w=t.basicWeapon;state='aim';
}
function fire(){
 const t=tanks[turn],w=WEAPONS[t.w];shotNo++;t.lastAng=t.ang;t.lastPow=t.pow;
 const a=t.ang*Math.PI/180,sp=t.pow*K,p=tip(t),n=w.count||1;
 for(let i=0;i<n;i++){const da=(i-(n-1)/2)*.07;shots.push({x:p.x,y:p.y,vx:Math.cos(a+da)*sp,vy:-Math.sin(a+da)*sp,w,age:0,owner:turn,trail:[p.x,p.y],n:shotNo,b:w.kind==='bounce'?3:0,la:t.ang,canHome:w.kind==='homing'&&random()<w.accuracy});}
 state='fly';
}

function explodeOutside(s){
  if(s.dead)return;
  if(s.w.kind==='bunker'&&!s.bunker){callBunker(s);return;}
  // Keep the real impact center; terrain and tank effects reach across the edge.
  explode(s.x,s.y,s.w,s,true);
  s.dead=true;
}

function checkHit(s){
  if(s.y>MH+40){explodeOutside(s);return;}
  if(s.x<0||s.x>W){
    // Invisible flat ground continues each edge at its current surface height.
    // Airborne shells can travel out and return; only ground contact ends a miss.
    if(s.y>=surf(s.x))explodeOutside(s);
    return;
  }
  for(let i=0;i<tanks.length;i++){const t=tanks[i];if(t.hp<=0)continue;if(i===s.owner&&s.age<24)continue;
    if(Math.hypot(s.x-t.x,s.y-(t.y-6*TS))<12*TS){impact(s);return;}}
  if(s.emerge){if(!solid(s.x,s.y))s.emerge=false;return;}
  if(s.pen){s.pd+=Math.hypot(s.vx,s.vy)*SLOW/2;if(s.pd>=s.w.pen||!solid(s.x,s.y)){explode(s.x,s.y,s.w,s);s.dead=true;}return;}
  if(s.w.kind==='pierce'&&solid(s.x,s.y)){s.pen=true;s.pd=0;s.ivx=s.vx;s.ivy=s.vy;s.vx*=0.6;s.vy*=0.6;return;}
  if(solid(s.x,s.y)){
    if(s.w.kind==='bounce'&&s.b>0){s.b--;let k=0;while(solid(s.x,s.y)&&k++<20)s.y-=1;s.vy=-Math.abs(s.vy)*0.62;s.vx*=0.85;sfx('tick');return;}
    if(s.w.kind==='roll'){s.rolling=true;s.rollT=0;let k=0;while(solid(s.x,s.y)&&k++<20)s.y-=1;s.vx*=0.6;return;}
    impact(s);
  }
}

function impact(s){
  if(s.w.kind==='bunker'){callBunker(s);return;}
  if(s.canHome&&s.x>=0&&s.x<=W){
    let target=-1,nearest=WEAPONS[8].r;
    for(let i=0;i<tanks.length;i++){
      const t=tanks[i];if(i===s.owner||t.hp<=0)continue;
      const d=Math.hypot(t.x-s.x,t.y-4-s.y);
      if(d<=nearest&&(target<0||d<nearest)){target=i;nearest=d;}
    }
    s.canHome=false; // One accuracy roll and one target lock per paid shot.
    if(target>=0){
      const t=tanks[target];let ceiling=Math.min(s.y,t.y-4);
      for(let x=Math.min(s.x,t.x);x<=Math.max(s.x,t.x)+CS;x+=CS)ceiling=Math.min(ceiling,surf(x));
      s.homing={target,ceiling:ceiling-24,phase:'rise'};
      return;
    }
  }
  explode(s.x,s.y,s.w,s);s.dead=true;
}

function callBunker(s){
  // The first shell only marks a target. Keep its real x, including off-map hits.
  const surfaceY=surf(s.x);
  shots.push({x:s.x,y:-60,vx:0,vy:20,w:s.w,age:0,owner:s.owner,trail:[s.x,-60],n:s.n,
    bunker:{phase:'fall',targetY:s.y,surfaceY,endY:Math.max(surfaceY,Math.min(FLOOR-1,surfaceY+s.w.depth))}});
  s.dead=true;
}

function dropBunker(s,h){
  const dive=s.bunker;s.vx=0;
  if(dive.phase==='fall'){
    s.vy=20;s.y=Math.min(dive.surfaceY,s.y+s.vy*h);
    if(s.y>=dive.surfaceY){dive.phase='drill';carve(s.x,s.y,s.w.shaft);}
    return;
  }
  s.vy=8;s.y=Math.min(dive.endY,s.y+s.vy*h);
  carve(s.x,s.y,s.w.shaft);
  if(s.y>=dive.endY){explode(s.x,s.y,s.w,s,s.x<0||s.x>W);s.dead=true;}
}

function home(s,h){
  const guide=s.homing,t=tanks[guide.target];
  if(!t||t.hp<=0){explode(s.x,s.y,s.w,s);s.dead=true;return;}
  // Rise above the intervening hills, cross over them, then dive onto the locked enemy.
  // Guidance leaves the original impact point intact and produces one normal blast.
  const x=guide.phase==='rise'?s.x:t.x,y=guide.phase==='dive'?t.y-4:guide.ceiling;
  const dx=x-s.x,dy=y-s.y,d=Math.hypot(dx,dy),speed=7;
  s.vx=d?dx/d*speed:0;s.vy=d?dy/d*speed:0;
  if(d<=speed*h){
    s.x=x;s.y=y;
    if(guide.phase==='dive'){explode(s.x,s.y,s.w,s);s.dead=true;}
    else guide.phase=guide.phase==='rise'?'cross':'dive';
  }else{s.x+=s.vx*h;s.y+=s.vy*h;}
}

function roll(s){
  s.rollT++;const sl=below(s.x+2,s.y-6)-below(s.x-2,s.y-6);
  s.vx+=clamp(sl,-8,8)*0.02;s.vx*=0.985;const nx=s.x+s.vx*SLOW*1.3;
  if(nx<0||nx>W){s.x=nx;explodeOutside(s);return;}
  if(below(nx,s.y-6)<s.y-5)s.vx*=-0.4;else s.x=nx;
  s.y=below(s.x,s.y-6)-1;if(s.rollT%2===0)s.trail.push(s.x,s.y);
  for(const t of tanks)if(t.hp>0&&Math.hypot(s.x-t.x,s.y-(t.y-4*TS))<12*TS){explode(s.x,s.y,s.w);s.dead=true;return;}
  if((Math.abs(s.vx)<0.04&&s.rollT>40)||s.rollT>320){explode(s.x,s.y,s.w);s.dead=true;}
}


function explode(x,y,w,s,outside=false){
 const r=w.r,bm={x,y,r,t:0,D:Math.round(Math.min(150,50+r*.8)),w,cr:0,hit:new Set(),owner:s?.owner,outside};
 // An off-map teleport has no valid destination; piercing stops at the boundary.
 if(outside&&w.kind==='teleport')bm.fx=true;
 if(w.kind==='dirt')bm.dirt=true;
 if(w.kind==='pierce'&&w.stage<2&&s&&!outside)bm.next={dir:Math.sign(s.vx)||(s.owner===0?1:-1),stage:w.stage+1,owner:s.owner,n:s.n,ang:s.la,vx:s.ivx??s.vx,vy:s.ivy??s.vy};
 booms.push(bm);
}

function growBoom(b){
  b.t++;const k=Math.min(1,b.t/b.D),cr=b.r*(1-Math.pow(1-k,2));
  if(b.next&&b.t>=Math.round(b.D*0.6)){const st=b.next,nw=PIERCE[st.stage],m=Math.hypot(st.vx,st.vy)||1,sp=Math.max(K*20,m*0.75);b.next=null;
    shots.push({x:b.x,y:b.y,vx:st.vx/m*sp,vy:st.vy/m*sp,w:nw,age:99,owner:st.owner,trail:[b.x,b.y],n:st.n,b:0,emerge:true,la:st.ang});sfx('fire');}
  if(b.fx){b.cr=cr;return;}
  if(b.w.kind==='teleport'){
    b.cr=cr;const t=tanks[b.owner];
    if(b.t===1&&t?.hp>0){t.x=clamp(b.x,6,W-6);t.y=surf(t.x);t.vy=0;floats.push({x:t.x,y:t.y-24,txt:'이사!',t:0,teleport:true});}
    return;
  }
  if(b.w.kind==='heal'){
    b.cr=cr;
    for(const t of tanks){if(t.hp<=0||b.hit.has(t))continue;
      if(Math.hypot(t.x-b.x,t.y-4-b.y)<=cr){b.hit.add(t);const healed=Math.min(b.w.heal,100-t.hp);
        if(healed>0){t.hp+=healed;floats.push({x:t.x,y:t.y-24,txt:'+'+healed,t:0,heal:true});syncUI();}}}
    return;
  }
  if(b.dirt){if(cr>b.cr){fillCircle(b.x,b.y,cr);b.cr=cr;}return;}
  if(cr>b.cr){carve(b.x,b.y,cr);b.cr=cr;}
  if(b.w.dmg>0)for(const t of tanks){if(t.hp<=0||b.hit.has(t))continue;
    const d=Math.hypot(t.x-b.x,(t.y-4)-b.y);
    if(d<b.r+8&&d<=cr+8){b.hit.add(t);
      const f=1-Math.max(0,d-5)/(b.r+8),dmg=Math.max(1,Math.round(b.w.dmg*f));
      t.hp=Math.max(0,t.hp-dmg);t.hitT=30;floats.push({x:t.x,y:t.y-24,txt:'-'+dmg,t:0});syncUI();}}
}

function land(t){if(t.vy>5&&t.hp>0){const d=Math.round((t.vy-5)*4)*5;t.hp=Math.max(0,t.hp-d);floats.push({x:t.x,y:t.y-24,txt:'-'+d,t:0});syncUI();}t.vy=0;}

function drive(t,dir){
  if(t.fuel<=0||t.vy>0.6)return false;
  const nx=t.x+dir*0.6;if(nx<6||nx>W-6)return false;
  let ny=t.y;while(solid(nx,ny-1)&&t.y-ny<CS)ny-=CS;
  if(solid(nx,ny-1))return false;
  t.x=nx;t.y=ny;t.fuel=Math.max(0,t.fuel-0.6);
  if(t.fuel<=0)syncUI();
  return true;
}


function gravity(){
 let falling=false;
 for(const t of tanks){if(t.hitT>0)t.hitT--;const gy=below(t.x,t.y);
  if(gy>t.y+.5){t.vy+=.25;t.y+=t.vy;if(t.y>=gy){t.y=gy;land(t);}else falling=true;}else t.vy=0;}
 return falling;
}
function step(){
 frame++;
 for(const s of shots.slice()){
  if(s.dead)continue;
  if(s.rolling){roll(s);if(s.dead)paths.push({pts:s.trail,c:tanks[s.owner].color,o:s.owner,n:s.n});continue;}
  const h=SLOW/2;
  for(let k=0;k<2&&!s.dead&&!s.rolling;k++){
   if(s.bunker){dropBunker(s,h);continue;}
   if(s.homing){home(s,h);continue;}
   s.vx+=wind*h;s.vy+=G*h;s.x+=s.vx*h;s.y+=s.vy*h;checkHit(s);
  }
  s.age++;s.trail.push(s.x,s.y);
  if(!s.dead&&!s.rolling&&s.w.kind==='mirv'&&s.vy>0){s.dead=true;
   for(let j=-2;j<=2;j++)shots.push({x:s.x,y:s.y,vx:s.vx+j*.55,vy:s.vy,w:MIRV_CHILD,age:99,owner:s.owner,trail:[s.x,s.y],n:s.n,b:0});}
  if(!s.dead&&s.age>12000)explodeOutside(s);
  if(s.dead)paths.push({pts:s.trail,c:tanks[s.owner].color,o:s.owner,n:s.n});
 }
 shots=shots.filter(s=>!s.dead);
 for(const b of booms)growBoom(b);booms=booms.filter(b=>b.t<b.D+22);
 for(const f of floats){f.t++;f.y-=.45;}floats=floats.filter(f=>f.t<70);
 if(!shots.length&&booms.every(b=>b.t>=b.D))settleSand();
 const falling=gravity();
 if(state==='fly'&&!shots.length&&booms.every(b=>b.t>=b.D)&&!falling&&!active.size){state='settle';settleT=12;}
 if(state==='settle'&&--settleT<=0)finishTurn();
 if(tDirty){dirty++;tDirty=false;}
}
function finishTurn(){
 const alive=tanks.filter(t=>t.hp>0);over=alive.length<=1;
 if(over){state='end';return;}startTurn(nextIdx());
}
function move(dir){
 if(state!=='aim'||over||tanks[turn].hp<=0)return false;
 const changed=drive(tanks[turn],dir);
 for(let i=0;i<150&&gravity();i++);return changed;
}
function begin(command){
 validateCommand(command);
 if(over||state!=='aim')throw Error('room_unavailable');
 windTime=command.windTime??windTime;frame=0;
 for(const dir of command.moves)move(dir);
 const t=tanks[turn];t.ang=command.angle;t.pow=command.power;t.w=command.weapon;
 if(command.basicWeapon!==undefined)t.basicWeapon=command.basicWeapon;
 if(isBasicWeapon(t.w))t.basicWeapon=t.w;
 const price=t.hp>0?WEAPONS[t.w].price:0;
 if(t.hp>0)fire();else finishTurn();
 return price;
}
function snapshot(){
 if(shots.length||active.size)throw Error('simulation_incomplete');
 return {runId,names:saved.names,width:W,seed:rng,weatherSeed,windTime:windTime+frame*1000/60,windIndex,turn,wind,shotNo,over,
  terrain:Array.from({length:GW},(_,x)=>surf(x*CS)/CS),
  tanks:tanks.map(({x,y,vy,color,ang,pow,name,hp,w,basicWeapon,fuel,lastAng,lastPow})=>({x,y,vy,color,ang,pow,name,hp,w,basicWeapon,fuel,lastAng,lastPow}))};
}
if(saved.terrain){
 if(saved.terrain.length!==GW)throw Error('invalid_state');
 for(let cx=0;cx<GW;cx++)for(let cy=saved.terrain[cx];cy<GH;cy++)mask[cy*GW+cx]=1;
 tanks=saved.tanks.map(t=>({...t,basicWeapon:isBasicWeapon(t.basicWeapon)?t.basicWeapon:isBasicWeapon(t.w)?t.w:0,ammo:WEAPONS.map(()=>Infinity),cpu:false,hitT:0}));
 // Older saved turns reset the gauges; recover the current player's recorded shot.
 if(!over){const t=tanks[turn];t.ang=t.lastAng??t.ang;t.pow=t.lastPow??t.pow;}
}else{
 genWorld();const slots=[];
 for(let i=0;i<NT;i++)slots.push(Math.round(clamp(W*(i+.5)/NT+(random()-.5)*W/NT*.4,20,W-20)));
 for(let i=slots.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
 for(const x of slots)flatten(x,10);buildMask();
 tanks=saved.names.map((name,i)=>mkTank(slots[i],i,name,false));startTurn(0,false);
}
if(over)state='end';
return {step,move,begin,snapshot,
 // Retain clock metadata for older clients without changing the turn's weather.
 setWindTime(time){if(state==='aim'&&Number.isFinite(time)){windTime=time;frame=0;}},
 surrender(seat){if(!tanks[seat]||tanks[seat].hp<=0)throw Error('already_eliminated');tanks[seat].hp=0;if(seat===turn||tanks.filter(t=>t.hp>0).length<=1)finishTurn();},
 skip(){if(over)return;tanks[turn].misses=(saved.tanks?.[turn]?.misses||0)+1;if(tanks[turn].misses>=3)tanks[turn].hp=0;finishTurn();},
 view:()=>({W,H,VW,MH,PL,FLOOR,FR,GW,GH,K,TS,WINDMAX,wind,ground,mask,tanks,turn,state,shots,booms,bits,floats,paths,shotNo,frame,dirty,over})};
}
export function validateCommand(c){
 if(!c||!Number.isInteger(c.weapon)||c.weapon<0||c.weapon>=WEAPONS.length||!Number.isFinite(c.angle)||c.angle<0||c.angle>180||!Number.isFinite(c.power)||c.power<5||c.power>100||!Array.isArray(c.moves)||c.moves.length>250||c.moves.some(x=>x!==-1&&x!==1))throw Error('invalid_move');
 if(c.windTime!==undefined&&(!Number.isSafeInteger(c.windTime)||c.windTime<0))throw Error('invalid_move');
 if(c.basicWeapon!==undefined&&!isBasicWeapon(c.basicWeapon))throw Error('invalid_move');
}
export function newGame(names,runId,seed,windTime=0){
 if(!Array.isArray(names)||names.length<2||names.length>12)throw Error('need_players');
 return createEngine({names,runId,seed,windTime}).snapshot();
}
export function advance(saved,seat,command){
 if(saved.over)throw Error('room_unavailable');
 if(command.type!=='surrender'&&command.type!=='timeout'&&seat!==saved.turn)throw Error('not_your_turn');
 const engine=createEngine(saved);let price=0,frames=0;
 if(command.type==='surrender')engine.surrender(seat);
 else if(command.type==='timeout')engine.skip();
 else if(command.type==='fire'){
  price=engine.begin(command);
  while(['fly','settle'].includes(engine.view().state)&&frames++<18000)engine.step();
  if(frames>=18000)throw Error('simulation_timeout');
 }else throw Error('invalid_move');
 const state=engine.snapshot();
 // Three missed turns eliminate an absent player; a successful shot clears the count.
 state.tanks.forEach((t,i)=>{t.misses=command.type==='timeout'&&i===saved.turn?(saved.tanks[i].misses||0)+1:command.type==='fire'&&i===seat?0:saved.tanks[i].misses||0;});
 return {state,price,frames};
}
