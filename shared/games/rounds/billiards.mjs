import {round,element} from './controls.mjs?v=20261127-coach1';
const W=200,H=100,R=4;
const pockets=[[4,4],[100,3],[196,4],[4,96],[100,97],[196,96]];
// Equal-mass elastic impacts on a small practice table, in table coordinates.
export function roll(position,angle,power,pool=false){
  const balls=position.map(([x,y])=>({x,y,vx:0,vy:0,out:false}));
  const rad=angle*Math.PI/180,events=[],frames=[];
  balls[0].vx=power/17*Math.cos(rad);balls[0].vy=power/17*Math.sin(rad);
  for(let tick=0;tick<1000;tick++){
    for(const [i,b] of balls.entries()){
      if(b.out)continue;
      b.x+=b.vx;b.y+=b.vy;
      if(pool&&pockets.some(([x,y])=>Math.hypot(x-b.x,y-b.y)<6.4)){b.out=true;b.vx=b.vy=0;events.push({pocket:i});continue;}
      for(const [axis,v,max] of [['x','vx',W],['y','vy',H]]){
        if((b[axis]<R&&b[v]<0)||(b[axis]>max-R&&b[v]>0)){
          b[axis]=Math.max(R,Math.min(max-R,b[axis]));b[v]*=-.93;if(i===0)events.push({rail:true});
        }
      }
      b.vx*=.994;b.vy*=.994;
    }
    for(let a=0;a<balls.length;a++)for(let b=a+1;b<balls.length;b++){
      const p=balls[a],q=balls[b];if(p.out||q.out)continue;
      const dx=q.x-p.x,dy=q.y-p.y,len=Math.hypot(dx,dy)||.001;
      if(len>=2*R)continue;
      const nx=dx/len,ny=dy/len,impact=(p.vx-q.vx)*nx+(p.vy-q.vy)*ny;
      if(impact<=0)continue;
      const overlap=(2*R-len)/2;p.x-=nx*overlap;p.y-=ny*overlap;q.x+=nx*overlap;q.y+=ny*overlap;
      p.vx-=impact*nx;p.vy-=impact*ny;q.vx+=impact*nx;q.vy+=impact*ny;
      if(a===0)events.push({ball:b});
    }
    if(tick%4===0)frames.push(balls.map(b=>[b.x,b.y,b.out]));
    if(tick>5&&balls.every(b=>Math.hypot(b.vx,b.vy)<.035))break;
  }
  return {events,frames};
}
export function score(mode,events){
  if(mode==='pool8')return events.some(e=>e.pocket===1)&&!events.some(e=>e.pocket===0||e.pocket===2);
  let rails=0;const hits=new Set();let qualified=false;
  for(const e of events){
    if(e.rail)rails++;
    if(e.ball===1||e.ball===2){hits.add(e.ball);if(hits.size===2){qualified=mode==='billiards'||rails>=3;break;}}
  }
  return qualified&&(mode!=='billiards'||!events.some(e=>e.ball===3));
}
const setups={
  billiards:{title:'한 번에 빨간 공 두 개 맞히기',pos:[[35,60],[85,52],[137,76],[150,23]],angle:-15,power:65},
  carom3:{title:'세 번째 쿠션 뒤에 두 번째 공 맞히기',pos:[[35,60],[85,52],[137,76]],angle:43,power:80},
  pool8:{title:'줄무늬 공을 포켓에 넣기',pos:[[130,64],[164,32],[48,36]],angle:-43,power:50}
};
function table(mode){
  const spec=setups[mode],pool=mode==='pool8';
  return round(spec.title,{angle:0,power:spec.power,shot:null},(u,s)=>{
    const positions=s.mirror?spec.pos.map(([x,y])=>[x,H-y]):spec.pos;
    const pocket=s.mirror?'오른쪽 아래':'오른쪽 위';
    u.cue(pool?'흰 공으로 줄무늬 공을 '+pocket+' 포켓에 보내세요. 검은 8번 공은 아직 남겨 둬요.':mode==='carom3'?'흰 공이 두 공에 모두 닿아야 해요. 두 번째 공을 맞히기 전에 쿠션을 세 번 이상 거치세요.':'흰 공을 쳐서 빨간 공 두 개를 모두 맞혀요. 노란 공은 피하세요.');
    const field=element('div','round-pool');field.setAttribute('aria-label','연습 당구대');u.board.append(field);
    const dot=(cls,x,y)=>{const n=element('i',cls);n.style.left=x/W*100+'%';n.style.top=y/H*100+'%';field.append(n);return n;};
    if(pool)pockets.forEach(([x,y])=>dot('pocket',x,y));
    const ray=dot('cue-ray',...positions[0]);
    const dots=positions.map(([x,y],i)=>dot('pool-ball ball-'+(i===0?'white':pool?(i===1?'stripe':'black'):mode==='carom3'&&i===1?'yellow':i===3?'yellow':'red'),x,y));
    function aim(){ray.style.transform='rotate('+s.angle+'deg)';}aim();
    const a=u.range('조준 각도',s.angle,-180,180,v=>{s.angle=v;aim();});
    // Fine adjustment is reachable on screens narrower than the 361 angle values.
    const dial=a.closest('label'),row=element('div','angle-dial');
    dial.replaceWith(row);row.append(dial);
    for(const delta of [-1,1]){
      const n=element('button','round-key',delta<0?'−':'+');
      n.setAttribute('aria-label',delta<0?'각도 1도 낮추기':'각도 1도 높이기');
      n.disabled=!!s.shot||!!s.done;
      n.onclick=()=>{a.value=String(s.angle+delta);a.dispatchEvent(new Event('input',{bubbles:true}));};row.append(n);
    }
    const p=u.range('힘',s.power,25,90,v=>s.power=v);
    if(s.shot||s.done){ray.hidden=true;a.disabled=p.disabled=true;}
    if(s.final)s.final.forEach(([x,y,out],i)=>{dots[i].style.left=x/W*100+'%';dots[i].style.top=y/H*100+'%';dots[i].hidden=out;});
    if(s.shot){
      const {events,frames}=s.shot, duration=u.reduced()?150:1100;
      for(const [i,n] of dots.entries()){
        const seq=frames.filter((_,j)=>j%3===0||j===frames.length-1).map(f=>({left:f[i][0]/W*100+'%',top:f[i][1]/H*100+'%',opacity:f[i][2]?0:1}));
        if(!u.reduced()&&n.animate)n.animate(seq,{duration,fill:'forwards'});
      }
      u.later(duration,()=>{const rails=events.filter(e=>e.rail).length,hits=new Set(events.filter(e=>e.ball).map(e=>e.ball));
        if(score(mode,events))return u.finish(pool?'줄무늬 공을 넣었어요. 내 그룹의 공을 모두 넣은 뒤에 8번을 노려요.':mode==='carom3'?'쿠션 조건을 채우고 두 번째 대상구까지 맞혀 1점이에요.':'빨간 공 두 개에 모두 닿아 1점이에요.',{shot:null,final:frames.at(-1)});
        u.change({shot:null},pool?'포켓에 들어가지 않았어요. 줄무늬 공과 '+pocket+' 구멍을 잇는 선을 따라 조준해 보세요.':'이번 샷은 대상구 '+[1,2].filter(i=>hits.has(i)).length+'개, 쿠션 '+rails+'회예요. 다시 조준해 보세요.');});
    }
    u.buttons([['샷',()=>u.change({shot:roll(positions,s.angle,s.power,pool)}),!!s.shot],['기본 조준',()=>u.change({angle:s.mirror?-spec.angle:spec.angle,power:spec.power}),!!s.shot]]);
  });
}
export const billiardGames=Object.fromEntries(Object.keys(setups).map(id=>[id,table(id)]));
