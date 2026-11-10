/* Life-chapter enemies appear more often as each chapter's 200 stars are awakened. */
(() => {
  'use strict';
  const variants = [
    {body:'#3d244b',edge:'#dcb0ff',glow:'210,139,255',eyes:'#fff0ff'},
    {body:'#2a4260',edge:'#a3efff',glow:'120,214,255',eyes:'#f2ffff'},
    {body:'#294943',edge:'#a6f9c9',glow:'126,235,183',eyes:'#f3ffe3'},
    {body:'#292e61',edge:'#c2b7ff',glow:'174,153,255',eyes:'#fff4df'},
    {body:'#51334e',edge:'#ffd3a0',glow:'255,175,184',eyes:'#fffbe0'}
  ];
  const kinds=Object.freeze({
    shadow:{name:'차원 그림자',hp:1,heat:.28,speed:105,volleys:1},
    jelly:{name:'그림자 해파리',hp:1,heat:.2,speed:92,volleys:1},
    vortex:{name:'심해 소용돌이',hp:2,heat:.24,speed:75,volleys:1},
    octopus:{name:'먹물 문어',hp:2,heat:.16,speed:82,volleys:1,veil:1.5},
    crystal:{name:'가시 수정',hp:2,heat:.28,speed:115,volleys:1},
    butterfly:{name:'거울 나비',hp:1,heat:.16,speed:88,volleys:2},
    mushroom:{name:'독안개 버섯',hp:2,heat:.16,speed:65,volleys:1,veil:1.2},
    bat:{name:'먹구름 박쥐',hp:1,heat:.24,speed:153,volleys:1},
    cloud:{name:'번개 구름',hp:2,heat:.3,speed:118,volleys:2},
    gravity:{name:'중력 소용돌이',hp:3,heat:.2,speed:78,volleys:1},
    seed:{name:'어둠의 씨앗',hp:2,heat:.2,speed:94,volleys:1,veil:.85},
    thief:{name:'시간 도둑',hp:2,heat:.35,speed:108,volleys:1},
    clone:{name:'그림자 분신',hp:2,heat:.18,speed:110,volleys:3}
  });
  const stageKinds=Object.freeze({
    5:['shadow'],6:['jelly','vortex','octopus'],7:['crystal','butterfly','mushroom'],
    8:['bat','cloud','gravity'],9:['seed','thief','clone']
  });
  function choose(stage,grown,random=Math.random){
    const options=stageKinds[stage]||stageKinds[5];
    const opened=Math.min(options.length,1+(grown>=60?1:0)+(grown>=120?1:0));
    return options[Math.min(opened-1,Math.floor(Math.max(0,Math.min(.999999,Number(random())||0))*opened))];
  }
  const info=kind=>kinds[kind]||kinds.shadow;
  const count = (upgrades, levels, stage) => upgrades.reduce((sum, upgrade) => sum + (upgrade.r === stage && Number(levels[upgrade.id]) > 0 ? 1 : 0), 0);
  function interval(grown) {
    const n=Math.max(0,Math.min(200,Math.floor(Number(grown)||0)));
    if(n<20)return 45; // Before twenty purchases, at most one rare visitor per run.
    return 2+28*Math.pow((200-n)/180,1.65);
  }
  const firstDelay=(grown,random=Math.random)=>grown>=200?2:interval(grown)*Math.max(.001,Math.min(1,random()));
  const maxAlive=grown=>grown<20?1:Math.min(8,2+Math.floor(grown/34));
  function drawSpecial(ctx,enemy,stage,time,reduced){
    const kind=enemy.kind;if(!kind||kind==='shadow')return false;
    const palette=variants[Math.max(0,Math.min(4,stage-5))],r=enemy.r*(.75+.25*Math.min(1,enemy.age*3));
    const phase=reduced?enemy.seed:time*.8+enemy.seed;
    const TAU=Math.PI*2;
    ctx.save();ctx.translate(enemy.x,enemy.y+(reduced?0:Math.sin(time*2.7+enemy.seed)*3));
    const halo=ctx.createRadialGradient(0,0,r*.15,0,0,r*2.7);
    halo.addColorStop(0,`rgba(${palette.glow},.45)`);halo.addColorStop(1,`rgba(${palette.glow},0)`);
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,r*2.7,0,TAU);ctx.fill();
    ctx.fillStyle=palette.body;ctx.strokeStyle=palette.edge;ctx.lineWidth=2;ctx.lineJoin='round';ctx.lineCap='round';
    const oval=(x,y,rx,ry)=>{ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fill();ctx.stroke();};
    const poly=points=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x*r,y*r):ctx.moveTo(x*r,y*r));ctx.closePath();ctx.fill();ctx.stroke();};
    if(kind==='jelly'){
      ctx.beginPath();ctx.moveTo(-r,r*.12);ctx.bezierCurveTo(-r*1.05,-r*1.42,r*1.05,-r*1.42,r,r*.12);ctx.quadraticCurveTo(0,r*.4,-r,r*.12);ctx.closePath();ctx.fill();ctx.stroke();
      for(let i=-2;i<=2;i++){const x=i*r*.37;ctx.beginPath();ctx.moveTo(x,r*.18);ctx.bezierCurveTo(x+Math.sin(phase+i)*r*.2,r*.54,x-Math.sin(phase+i)*r*.26,r*.95,x,r*1.22);ctx.stroke();}
    }else if(kind==='vortex'||kind==='gravity'){
      ctx.fillStyle=`rgba(${palette.glow},.25)`;oval(0,0,r*.95,r*.78);
      ctx.strokeStyle=palette.edge;for(let i=0;i<3;i++){ctx.save();ctx.rotate(phase*(i%2?-1:1)+i*TAU/3);ctx.beginPath();ctx.ellipse(0,0,r*(.38+i*.25),r*(.2+i*.17),-.35,-Math.PI*.8,Math.PI*.7);ctx.stroke();ctx.restore();}
      ctx.fillStyle=palette.body;ctx.strokeStyle=palette.edge;oval(0,0,r*.34,r*.31);
    }else if(kind==='octopus'){
      for(let i=0;i<6;i++){const x=(i-2.5)*r*.24;ctx.beginPath();ctx.moveTo(x,r*.31);ctx.quadraticCurveTo(x+(i%2?1:-1)*r*.42,r*.85,(i-2.5)*r*.38,r*1.16);ctx.stroke();}
      oval(0,-r*.12,r*.77,r*.84);
    }else if(kind==='crystal'){
      poly([[0,-1.3],[.65,-.4],[.68,.7],[0,1.05],[-.68,.7],[-.65,-.4]]);
      ctx.strokeStyle='#e8fffb';ctx.beginPath();ctx.moveTo(0,-r*1.27);ctx.lineTo(0,r*1.04);ctx.moveTo(0,-r*.25);ctx.lineTo(r*.6,-r*.4);ctx.stroke();
      poly([[-1.08,.4],[-.78,-.35],[-.3,.68]]);poly([[.45,.68],[1.07,-.35],[1.12,.75]]);
    }else if(kind==='butterfly'){
      for(const side of [-1,1]){ctx.save();ctx.scale(side,1);oval(r*.65,-r*.4,r*.61,r*.56);oval(r*.59,r*.43,r*.52,r*.4);ctx.restore();}
      ctx.fillStyle='#e9f6ff';oval(0,0,r*.2,r*.72);
      ctx.beginPath();ctx.moveTo(-r*.08,-r*.67);ctx.lineTo(-r*.35,-r*1.2);ctx.moveTo(r*.08,-r*.67);ctx.lineTo(r*.35,-r*1.2);ctx.stroke();
    }else if(kind==='mushroom'){
      ctx.fillStyle='#d7d9ed';oval(0,r*.32,r*.38,r*.64);
      ctx.fillStyle=palette.body;ctx.beginPath();ctx.moveTo(-r*.98,0);ctx.quadraticCurveTo(-r*.78,-r*1.4,0,-r*1.12);ctx.quadraticCurveTo(r*.78,-r*1.4,r*.98,0);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.fillStyle=palette.edge;for(const x of [-.48,0,.48]){ctx.beginPath();ctx.arc(x*r,-r*(x===0?.62:.35),r*.12,0,TAU);ctx.fill();}
    }else if(kind==='bat'){
      poly([[0,-.55],[-.34,-.95],[-.43,-.27],[-1.47,-.58],[-1.19,.38],[-.85,.14],[-.59,.67],[0,.42],[.59,.67],[.85,.14],[1.19,.38],[1.47,-.58],[.43,-.27],[.34,-.95]]);
    }else if(kind==='cloud'){
      oval(-r*.43,r*.13,r*.55,r*.44);oval(r*.4,r*.13,r*.55,r*.44);oval(0,-r*.22,r*.65,r*.62);
      ctx.strokeStyle='#fff0ac';ctx.lineWidth=r*.15;ctx.beginPath();ctx.moveTo(r*.15,r*.4);ctx.lineTo(-r*.15,r*.95);ctx.lineTo(r*.17,r*.84);ctx.lineTo(-r*.1,r*1.4);ctx.stroke();
    }else if(kind==='seed'){
      for(let i=0;i<7;i++){const a=i*TAU/7+phase*.15;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.55,Math.sin(a)*r*.75);ctx.lineTo(Math.cos(a)*r*1.32,Math.sin(a)*r*1.42);ctx.stroke();}
      oval(0,0,r*.67,r*.88);ctx.strokeStyle='#ffdaaf';ctx.beginPath();ctx.moveTo(-r*.25,-r*.42);ctx.quadraticCurveTo(r*.34,0,-r*.09,r*.58);ctx.stroke();
    }else if(kind==='thief'){
      poly([[-.5,-.94],[.5,-.94],[.25,-.4],[0,0],[.25,.4],[.5,.94],[-.5,.94],[-.25,.4],[0,0],[-.25,-.4]]);
      ctx.fillStyle=palette.edge;ctx.beginPath();ctx.arc(0,0,r*.14,0,TAU);ctx.fill();
    }else if(kind==='clone'){
      ctx.globalAlpha=.35;oval(-r*.31,r*.18,r*.61,r*.8);oval(r*.31,r*.18,r*.61,r*.8);ctx.globalAlpha=1;oval(0,-r*.06,r*.73,r*.84);
    }
    const blink=!reduced&&Math.sin(time*.9+enemy.seed)>.992;
    ctx.fillStyle=palette.eyes;ctx.strokeStyle=palette.eyes;
    for(const x of [-.32,.32]){
      ctx.beginPath();ctx.ellipse(x*r,-r*.12,r*.16,blink?r*.02:r*.2,0,0,TAU);ctx.fill();
      if(!blink){ctx.fillStyle='#1e1734';ctx.beginPath();ctx.arc((x+.02)*r,-r*.09,r*.075,0,TAU);ctx.fill();ctx.fillStyle=palette.eyes;}
    }
    ctx.beginPath();ctx.arc(0,r*.26,r*.14,0,Math.PI);ctx.stroke();
    const detail=Math.min(7,Math.floor((enemy.grown||0)/30)+Math.max(0,stage-6));
    for(let i=0;i<detail;i++){
      const a=i*2.39996+phase*.12,rr=r*(1.35+.08*(i%3));
      ctx.fillStyle=i%3?'#fff3df':palette.edge;ctx.beginPath();ctx.arc(Math.cos(a)*rr,Math.sin(a)*rr,r*.05,0,TAU);ctx.fill();
    }
    if(enemy.hp>0&&enemy.maxHp>1){ctx.strokeStyle=palette.edge;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,r*1.24,-Math.PI/2,-Math.PI/2+TAU*enemy.hp/enemy.maxHp);ctx.stroke();}
    if(enemy.fire<.65){const pulse=1-enemy.fire/.65;ctx.strokeStyle=`rgba(${palette.glow},${.15+pulse*.7})`;ctx.lineWidth=2+pulse*2;ctx.beginPath();ctx.arc(0,0,r*(1.3+pulse*.7),0,TAU);ctx.stroke();}
    ctx.restore();return true;
  }
  function drawEnemy(ctx,enemy,stage,time,reduced=false){
    if(drawSpecial(ctx,enemy,stage,time,reduced))return;
    const variant=variants[Math.max(0,Math.min(4,stage-5))];
    const r=enemy.r*(.75+.25*Math.min(1,enemy.age*3));
    const float=reduced?0:Math.sin(time*3+enemy.seed)*3;
    ctx.save();ctx.translate(enemy.x,enemy.y+float);
    if(!reduced)ctx.rotate(Math.sin(time*1.7+enemy.seed)*.08);
    const halo=ctx.createRadialGradient(0,0,r*.2,0,0,r*2.5);
    halo.addColorStop(0,`rgba(${variant.glow},.43)`);halo.addColorStop(1,`rgba(${variant.glow},0)`);
    ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,r*2.5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=variant.body;ctx.strokeStyle=variant.edge;ctx.lineWidth=1.8;
    ctx.beginPath();ctx.moveTo(-r*.88,r*.34);
    ctx.quadraticCurveTo(-r*1.18,-r*.52,-r*.52,-r*.76);
    ctx.quadraticCurveTo(0,-r*1.36,r*.56,-r*.74);
    ctx.quadraticCurveTo(r*1.2,-r*.32,r*.9,r*.4);
    ctx.quadraticCurveTo(r*.6,r*.83,r*.27,r*.62);
    ctx.quadraticCurveTo(0,r*.96,-r*.25,r*.62);
    ctx.quadraticCurveTo(-r*.62,r*.84,-r*.88,r*.34);ctx.closePath();ctx.fill();ctx.stroke();
    const spikes=2+Math.max(0,stage-5);
    ctx.strokeStyle=variant.edge;ctx.lineWidth=Math.max(1,r*.09);ctx.lineCap='round';
    for(let i=0;i<spikes;i++){
      const x=(i-(spikes-1)/2)*r*.47;
      ctx.beginPath();ctx.moveTo(x,-r*.78);ctx.lineTo(x+(i%2?1:-1)*r*.12,-r*(1.3+(i%3)*.12));ctx.stroke();
    }
    const blink=!reduced&&Math.sin(time*.9+enemy.seed)> .992;
    ctx.fillStyle=variant.eyes;
    for(const x of [-.36,.36]){
      ctx.beginPath();ctx.ellipse(x*r,-r*.14,blink?r*.19:r*.18,blink?r*.02:r*.23,0,0,Math.PI*2);ctx.fill();
      if(!blink){ctx.fillStyle='#1e1734';ctx.beginPath();ctx.arc((x+.035)*r,-r*.1,r*.075,0,Math.PI*2);ctx.fill();ctx.fillStyle=variant.eyes;}
    }
    ctx.strokeStyle=variant.eyes;ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(0,r*.27,r*.17,0,Math.PI);ctx.stroke();
    if(stage>=7){ctx.strokeStyle=variant.edge;ctx.lineWidth=1.7;for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(side*r*.8,0);ctx.quadraticCurveTo(side*r*1.7,-r*.3,side*r*1.5,-r*.95);ctx.stroke();}}
    if(enemy.fire<.65){const pulse=1-enemy.fire/.65;ctx.strokeStyle=`rgba(${variant.glow},${.15+pulse*.7})`;ctx.lineWidth=2+pulse*2;ctx.beginPath();ctx.arc(0,0,r*(1.3+pulse*.7),0,Math.PI*2);ctx.stroke();}
    ctx.restore();
  }
  function drawShot(ctx,shot,time){
    const palette=variants[Math.max(0,Math.min(4,shot.chapter||0))];
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    ctx.strokeStyle=`rgba(${palette.glow},.55)`;ctx.lineWidth=shot.r*1.6;
    ctx.beginPath();ctx.moveTo(shot.x-shot.vx*.07,shot.y-shot.vy*.07);ctx.lineTo(shot.x,shot.y);ctx.stroke();
    const glow=ctx.createRadialGradient(shot.x,shot.y,0,shot.x,shot.y,shot.r*3);
    glow.addColorStop(0,'rgba(255,255,255,.96)');glow.addColorStop(.3,`rgba(${palette.glow},.85)`);glow.addColorStop(1,`rgba(${palette.glow},0)`);
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(shot.x,shot.y,shot.r*(2.1+.2*Math.sin(time*9)),0,Math.PI*2);ctx.fill();
    if(shot.kind==='cloud'||shot.kind==='crystal'){
      ctx.strokeStyle='#fff5c9';ctx.lineWidth=Math.max(1,shot.r*.5);ctx.beginPath();
      ctx.moveTo(shot.x-shot.r*.5,shot.y-shot.r*1.5);ctx.lineTo(shot.x+shot.r*.2,shot.y);
      ctx.lineTo(shot.x-shot.r*.1,shot.y+shot.r*.2);ctx.lineTo(shot.x+shot.r*.5,shot.y+shot.r*1.4);ctx.stroke();
    }
    ctx.restore();
  }
  function drawVeil(ctx,amount,stage,w,h){
    if(amount<=0)return;
    const palette=variants[Math.max(0,Math.min(4,stage-5))];
    ctx.save();ctx.globalAlpha=Math.min(.2,amount*.12);
    const mist=ctx.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,Math.max(w,h)*.75);
    mist.addColorStop(0,`rgba(${palette.glow},.05)`);mist.addColorStop(1,'rgba(18,14,38,.95)');
    ctx.fillStyle=mist;ctx.fillRect(0,0,w,h);ctx.restore();
  }
  window.OjjudaSaetbyeolShadows=Object.freeze({count,interval,firstDelay,maxAlive,choose,info,kinds,stageKinds,drawEnemy,drawShot,drawVeil});
})();
