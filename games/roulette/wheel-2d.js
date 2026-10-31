import {WHEEL_ORDER,COLOR} from './engine.js';
import {planSpinMotion,sampleSpinMotion} from './motion.js?v=20261031-roulette-multi2';
const TAU=Math.PI*2,STEP=TAU/37,HALF=Math.PI/2;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
function ring(ctx,r1,r2,stops){const g=ctx.createRadialGradient(500,500,r1,500,500,r2);stops.forEach(([p,c])=>g.addColorStop(p,c));ctx.fillStyle=g;ctx.beginPath();ctx.arc(500,500,r2,0,TAU);ctx.arc(500,500,r1,0,TAU,true);ctx.fill()}
function lineCircle(ctx,r,color,width=1){ctx.beginPath();ctx.arc(500,500,r,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke()}
function createLayer(draw){const c=document.createElement('canvas');c.width=1500;c.height=1500;const x=c.getContext('2d');x.scale(1.5,1.5);draw(x);return c}
function sector(ctx,r1,r2,a1,a2,fill){ctx.beginPath();ctx.arc(500,500,r2,a1,a2);ctx.arc(500,500,r1,a2,a1,true);ctx.closePath();ctx.fillStyle=fill;ctx.fill()}
export class RouletteWheel2D{
  constructor(canvas,{onTick=()=>{},onPhase=()=>{},onDone=()=>{},onFrame=()=>{}}={}){
    this.canvas=canvas;this.ctx=canvas.getContext('2d');this.rotation=.2;this.ballAngle=-1.3;this.ballRadius=396;this.ballHeight=0;this.state='idle';this.active=null;this.reduced=false;this.onTick=onTick;this.onPhase=onPhase;this.onDone=onDone;this.onFrame=onFrame;this.lastTime=0;this.lastTick=0;this.lastImpact=0;this.lastPhase='';this.visible=false;
    this.base=createLayer(ctx=>this.drawBase(ctx));this.rotor=createLayer(ctx=>this.drawRotor(ctx));this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);this.resize();this.raf=requestAnimationFrame(t=>this.frame(t));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(this.visible||this.active)){this.lastTime=0;if(!this.raf)this.raf=requestAnimationFrame(t=>this.frame(t));}});
  }
  resize(){const rect=this.canvas.getBoundingClientRect();const size=Math.min(1600,Math.max(600,Math.round(rect.width*Math.min(devicePixelRatio||1,2))));if(this.canvas.width!==size){this.canvas.width=size;this.canvas.height=size}this.draw()}
  drawBase(c){
    c.shadowColor='#0009';c.shadowBlur=16;c.shadowOffsetY=10;c.fillStyle='#25170f';c.beginPath();c.arc(500,500,451,0,TAU);c.fill();c.shadowBlur=0;c.shadowOffsetY=0;
    ring(c,409,451,[[0,'#423026'],[.12,'#553526'],[.32,'#75513a'],[.52,'#41251b'],[.75,'#60412f'],[.93,'#2a1a12'],[1,'#966d42']]);
    let seed=7385;const rand=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
    for(let i=0;i<190;i++){const r=411+rand()*39;c.beginPath();const a=rand()*TAU;c.arc(500,500,r,a,a+.2+rand()*1.4);c.strokeStyle=rand()>.5?'#b18b5a1a':'#08070335';c.lineWidth=.2+rand()*.9;c.stroke()}
    ring(c,438,442,[[0,'#433523'],[.2,'#ba9a59'],[.5,'#edd6a0'],[.75,'#8e6d39'],[1,'#352414']]);
    ring(c,404,413,[[0,'#30251a'],[.22,'#c3a76d'],[.44,'#f7e3aa'],[.57,'#c5a066'],[.9,'#5b432b'],[1,'#d2ac6b']]);
    ring(c,378,405,[[0,'#342b1c'],[.15,'#71644a'],[.4,'#aa9670'],[.7,'#564630'],[.91,'#2e241a'],[1,'#b79e67']]);
    for(let i=0;i<34;i++)lineCircle(c,380+i*.68,i%3===0?'#eddbb010':'#00000012',.5);
    ring(c,371,379,[[0,'#221e14'],[.23,'#aa9057'],[.43,'#e9d59e'],[.7,'#89713f'],[1,'#2a251b']]);
    for(let i=0;i<8;i++){const a=i*TAU/8+.1,x=500+391*Math.cos(a),y=500+391*Math.sin(a);c.save();c.translate(x,y);c.rotate(a);c.shadowColor='#000a';c.shadowOffsetX=2;c.shadowOffsetY=2;c.shadowBlur=3;c.fillStyle='#c8ac72';c.beginPath();c.moveTo(-6,-3);c.lineTo(4,0);c.lineTo(-6,3);c.closePath();c.fill();c.restore()}
    const light=c.createLinearGradient(150,120,800,900);light.addColorStop(0,'#ffe8af27');light.addColorStop(.35,'#ffe8af00');light.addColorStop(.65,'#00000000');light.addColorStop(1,'#00000044');ring(c,410,451,[[0,'#0000'],[1,'#0000']]);c.fillStyle=light;c.beginPath();c.arc(500,500,451,0,TAU);c.arc(500,500,371,0,TAU,true);c.fill();
  }
  drawRotor(c){
    c.fillStyle='#151b13';c.beginPath();c.arc(500,500,371,0,TAU);c.fill();
    for(let i=0;i<37;i++){
      const a=i*STEP-HALF-STEP/2,b=a+STEP,n=WHEEL_ORDER[i];
      const col=COLOR(n);sector(c,322,370,a,b,col==='green'?'#28734e':col==='red'?'#9a3439':'#111c17');
      sector(c,266,320,a,b,col==='green'?'#21472c':col==='red'?'#65252a':'#0b1511');
      const g=c.createRadialGradient(500,500,264,500,500,321);g.addColorStop(0,'#000a');g.addColorStop(.3,'#0000');g.addColorStop(.9,'#ffffff09');g.addColorStop(1,'#0005');sector(c,266,320,a,b,g);
      c.beginPath();c.moveTo(500+268*Math.cos(a),500+268*Math.sin(a));c.lineTo(500+321*Math.cos(a),500+321*Math.sin(a));c.strokeStyle='#b7a175';c.lineWidth=2.4;c.stroke();c.beginPath();c.moveTo(500+270*Math.cos(a+.005),500+270*Math.sin(a+.005));c.lineTo(500+320*Math.cos(a+.005),500+320*Math.sin(a+.005));c.strokeStyle='#f1d89a77';c.lineWidth=.7;c.stroke();
      c.save();c.translate(500,500);c.rotate(i*STEP);c.fillStyle='#f3e9cc';c.font='500 24px Georgia, serif';c.textAlign='center';c.textBaseline='middle';c.shadowColor='#000b';c.shadowBlur=1;c.shadowOffsetY=1;c.fillText(String(n),0,-346);c.restore();
    }
    ring(c,319,323,[[0,'#3a2d1a'],[.3,'#c5b17c'],[.6,'#ead39c'],[1,'#5f4b2b']]);
    lineCircle(c,369,'#d1b477',2);lineCircle(c,371,'#241e15',2);
    ring(c,255,268,[[0,'#9b824b'],[.22,'#f3dda4'],[.4,'#967b43'],[.7,'#3e341f'],[1,'#baa068']]);
    const center=c.createRadialGradient(430,400,20,500,500,256);center.addColorStop(0,'#796144');center.addColorStop(.2,'#5a402c');center.addColorStop(.55,'#402b20');center.addColorStop(.86,'#30241a');center.addColorStop(.95,'#483723');center.addColorStop(1,'#a78b55');c.fillStyle=center;c.beginPath();c.arc(500,500,255,0,TAU);c.fill();
    for(let i=0;i<160;i++){const radius=40+i*1.32;c.beginPath();c.arc(500,500,radius,0,TAU);c.strokeStyle=i%3===0?'#e8c79009':'#0000000c';c.lineWidth=.6;c.stroke()}
    for(let i=0;i<37;i++){const a=i*STEP;c.save();c.translate(500,500);c.rotate(a);c.strokeStyle='#c2a16c08';c.lineWidth=1;c.beginPath();c.moveTo(0,-82);c.lineTo(0,-245);c.stroke();c.restore()}
    ring(c,76,83,[[0,'#715633'],[.3,'#f1d5a1'],[.55,'#a58349'],[1,'#3b2d1c']]);
    c.save();c.translate(500,500);c.rotate(.38);c.shadowColor='#0009';c.shadowBlur=9;c.shadowOffsetY=7;
    for(let i=0;i<4;i++){c.save();c.rotate(i*HALF);const g=c.createLinearGradient(-16,0,16,0);g.addColorStop(0,'#58462b');g.addColorStop(.25,'#c1a570');g.addColorStop(.48,'#f0d5a1');g.addColorStop(.7,'#b0935d');g.addColorStop(1,'#695030');c.fillStyle=g;c.beginPath();c.moveTo(-17,-17);c.lineTo(-10,-131);c.quadraticCurveTo(0,-143,10,-131);c.lineTo(17,-17);c.closePath();c.fill();c.restore()}
    c.restore();
    ring(c,29,50,[[0,'#7c5c32'],[.25,'#e4c99b'],[.5,'#99804e'],[.8,'#d9bf88'],[1,'#635031']]);
    const top=c.createRadialGradient(489,486,3,500,500,32);top.addColorStop(0,'#fff0c3');top.addColorStop(.28,'#e8c890');top.addColorStop(.7,'#b38d4d');top.addColorStop(1,'#66502c');c.fillStyle=top;c.beginPath();c.arc(500,500,32,0,TAU);c.fill();lineCircle(c,32,'#e8ce9666',1);
    c.save();c.translate(500,500);c.font='8px sans-serif';c.textAlign='center';c.fillStyle='#e7d3a16a';c.fillText('O J J U D A',0,181);c.font='6px sans-serif';c.fillStyle='#d1b77b66';c.fillText('THE EMERALD ROOM',0,195);c.restore();
  }
  setReduced(value){this.reduced=value;this.draw()}
  setVisible(value){this.visible=value;if(value){this.resize();if(!this.raf)this.raf=requestAnimationFrame(t=>this.frame(t))}}
  start(spin){
    const plan=planSpinMotion(spin,this.rotation,this.ballAngle);
    this.active={...spin,plan,startTime:performance.now()-(Date.now()-spin.startedAt)};
    this.state='spinning';this.lastPhase='';this.lastImpact=0;this.lastTick=performance.now();
    if(!this.raf)this.raf=requestAnimationFrame(t=>this.frame(t));
    return this.active;
  }
  showResult(n){this.state='settled';this.active=null;this.ballRadius=291;this.ballHeight=0;this.ballAngle=this.rotation+WHEEL_ORDER.indexOf(n)*STEP-HALF;this.draw()}
  frame(now){
    this.raf=0;const dt=Math.min(50,now-(this.lastTime||now));this.lastTime=now;
    if(this.active){
      const a=this.active,p=clamp((now-a.startTime)/a.duration);
      const pose=sampleSpinMotion(a.plan,p);
      this.onFrame(p,pose);this.rotation=pose.rotation;this.ballAngle=pose.angle;this.ballRadius=pose.radius;this.ballHeight=pose.height;
      if(pose.phase!==this.lastPhase){this.onPhase(pose.phase);this.lastPhase=pose.phase}
      if(pose.impact>this.lastImpact){this.onTick(p,pose.impactStrength);this.lastImpact=pose.impact;this.lastTick=now}
      const interval=45+280*p*p;
      if(p>.02&&p<.94&&now-this.lastTick>interval){this.onTick(p,false);this.lastTick=now}
      if(this.reduced){this.rotation=a.plan.startRotation;this.ballAngle=this.rotation+(p<1?-HALF:a.plan.sector);this.ballRadius=p<1?396:291;this.ballHeight=0}
      if(p>=1){const done=this.active;this.active=null;this.state='settled';this.onDone(done.id)}
      this.draw();
    }else if(this.visible&&this.state==='idle'&&!this.reduced){this.rotation+=dt*.000022;this.ballAngle-=dt*.000045;this.ballRadius=396;this.draw()}
    if(!document.hidden&&(this.visible||this.active))this.raf=requestAnimationFrame(t=>this.frame(t));
  }
  draw(){
    const c=this.ctx,s=this.canvas.width/1000;c.setTransform(s,0,0,s,0,0);c.clearRect(0,0,1000,1000);c.drawImage(this.base,0,0,1000,1000);
    c.save();c.translate(500,500);c.rotate(this.rotation);c.drawImage(this.rotor,-500,-500,1000,1000);c.restore();
    const x=500+Math.cos(this.ballAngle)*this.ballRadius,groundY=500+Math.sin(this.ballAngle)*this.ballRadius,y=groundY-this.ballHeight;
    c.save();c.fillStyle=`rgba(0,0,0,${Math.max(.12,.48-this.ballHeight*.005)})`;c.filter=`blur(${2+this.ballHeight*.12}px)`;c.beginPath();c.ellipse(x+4+this.ballHeight*.25,groundY+5,9+this.ballHeight*.16,6+this.ballHeight*.1,0,0,TAU);c.fill();c.filter='none';
    const ball=c.createRadialGradient(x-3,y-3,1,x,y,9);ball.addColorStop(0,'#fffff5');ball.addColorStop(.32,'#fffde9');ball.addColorStop(.68,'#e9e2cc');ball.addColorStop(.92,'#acaa96');ball.addColorStop(1,'#737564');c.fillStyle=ball;c.beginPath();c.arc(x,y,8.6,0,TAU);c.fill();c.fillStyle='#fffef5bb';c.beginPath();c.arc(x-2.8,y-3,2.1,0,TAU);c.fill();c.restore();
    const shine=c.createLinearGradient(130,100,760,850);shine.addColorStop(0,'#ffe7aa16');shine.addColorStop(.4,'#ffffff00');shine.addColorStop(1,'#00000012');c.fillStyle=shine;c.beginPath();c.arc(500,500,372,0,TAU);c.fill();
  }
}
