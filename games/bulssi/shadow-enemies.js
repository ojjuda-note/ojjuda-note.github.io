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
  const count = (upgrades, levels, stage) => upgrades.reduce((sum, upgrade) => sum + (upgrade.r === stage && Number(levels[upgrade.id]) > 0 ? 1 : 0), 0);
  function interval(grown) {
    const n=Math.max(0,Math.min(200,Math.floor(Number(grown)||0)));
    if(n<20)return 45; // Before twenty purchases, at most one rare visitor per run.
    return 2+28*Math.pow((200-n)/180,1.65);
  }
  const firstDelay=(grown,random=Math.random)=>grown>=200?2:interval(grown)*Math.max(.001,Math.min(1,random()));
  const maxAlive=grown=>grown<20?1:Math.min(8,2+Math.floor(grown/34));
  function drawEnemy(ctx,enemy,stage,time,reduced=false){
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
    const palette=variants[shot.chapter];
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    ctx.strokeStyle=`rgba(${palette.glow},.55)`;ctx.lineWidth=shot.r*1.6;
    ctx.beginPath();ctx.moveTo(shot.x-shot.vx*.07,shot.y-shot.vy*.07);ctx.lineTo(shot.x,shot.y);ctx.stroke();
    const glow=ctx.createRadialGradient(shot.x,shot.y,0,shot.x,shot.y,shot.r*3);
    glow.addColorStop(0,'rgba(255,255,255,.96)');glow.addColorStop(.3,`rgba(${palette.glow},.85)`);glow.addColorStop(1,`rgba(${palette.glow},0)`);
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(shot.x,shot.y,shot.r*(2.1+.2*Math.sin(time*9)),0,Math.PI*2);ctx.fill();ctx.restore();
  }
  window.OjjudaSaetbyeolShadows=Object.freeze({count,interval,firstDelay,maxAlive,drawEnemy,drawShot});
})();
