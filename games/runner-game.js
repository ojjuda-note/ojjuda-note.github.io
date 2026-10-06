(function () {
  'use strict';
  const W=360,H=540,GROUND=440,TAU=Math.PI*2;
  const FONT='"Jua","Gowun Dodum","Apple SD Gothic Neo",sans-serif';
  let backdrop;
  function round(c,x,y,w,h,r,color){r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();c.fillStyle=color;c.fill();}
  function oval(c,x,y,rx,ry,color){c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fillStyle=color;c.fill();}
  function gradient(c,y,h,top,bottom){const g=c.createLinearGradient(0,y,0,y+h);g.addColorStop(0,top);g.addColorStop(1,bottom);return g;}
  function line(c,points,color,width=2){c.beginPath();c.moveTo(...points[0]);for(const p of points.slice(1))c.lineTo(...p);c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();}
  function star(c,x,y,r,color,angle=0){c.save();c.translate(x,y);c.rotate(angle);c.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4,d=i%2?r*.3:r;c.lineTo(Math.cos(a)*d,Math.sin(a)*d);}c.closePath();c.fillStyle=color;c.fill();c.restore();}
  function cloud(c,x,y,k){c.save();c.translate(x,y);c.scale(k,k);oval(c,0,6,27,8,'#FFFFFFA8');oval(c,-12,0,13,12,'#FFFFFFD9');oval(c,8,-4,17,17,'#FFFFFFD9');c.restore();}
  function leaf(c,x,y,k,color,angle=0){c.save();c.translate(x,y);c.rotate(angle);c.beginPath();c.moveTo(0,k);c.bezierCurveTo(-k,-k,-k/3,-k*1.4,0,-k);c.bezierCurveTo(k*.8,-k*.5,k,k*.4,0,k);c.fillStyle=color;c.fill();c.restore();}
  function flower(c,x,y,k,color){line(c,[[x,y+9],[x,y]],'#789A63',1.5);for(let i=0;i<5;i++){const a=i*TAU/5;oval(c,x+Math.cos(a)*k*.7,y+Math.sin(a)*k*.7,k*.5,k*.5,color);}oval(c,x,y,k*.35,k*.35,'#E8B76E');}
  function paintBackdrop(){
    const canvas=document.createElement('canvas');canvas.width=W*2;canvas.height=H*2;
    const c=canvas.getContext('2d');c.scale(2,2);
    c.fillStyle=gradient(c,0,360,'#BFE2EE','#FFF2D7');c.fillRect(0,0,W,H);
    const glow=c.createRadialGradient(279,132,8,279,132,83);glow.addColorStop(0,'#FFF9D5C9');glow.addColorStop(1,'#FFF9D500');c.fillStyle=glow;c.fillRect(190,43,170,178);
    oval(c,279,132,30,30,'#FFF2B2');oval(c,279,132,23,23,'#FFE8A1');
    line(c,[[264,132],[267,132]],'#D5AF6D',1.8);line(c,[[288,132],[291,132]],'#D5AF6D',1.8);
    c.beginPath();c.arc(278,137,5,.2,Math.PI-.2);c.strokeStyle='#D5AF6D';c.lineWidth=1.5;c.stroke();
    // The far hills stay soft so approaching obstacles remain easy to see.
    c.fillStyle='#BFCED3';c.beginPath();c.moveTo(0,280);c.bezierCurveTo(56,208,108,239,151,276);c.bezierCurveTo(215,203,281,208,360,278);c.lineTo(W,GROUND);c.lineTo(0,GROUND);c.fill();
    c.fillStyle='#AFCBB9';c.beginPath();c.moveTo(0,302);c.bezierCurveTo(68,258,104,292,173,315);c.bezierCurveTo(248,247,306,253,360,315);c.lineTo(W,GROUND);c.lineTo(0,GROUND);c.fill();
    return canvas;
  }
  function house(c,x,y,w,h,color,roof){
    round(c,x+2,y+4,w,h,5,'#94B0AA38');round(c,x,y,w,h,5,color);
    c.fillStyle=roof;c.beginPath();c.moveTo(x-4,y+3);c.lineTo(x+w/2,y-18);c.lineTo(x+w+4,y+3);c.closePath();c.fill();
    for(let row=0;row<2;row++)for(let col=0;col<2;col++){const wx=x+8+col*(w-21),wy=y+11+row*23;round(c,wx,wy,8,12,2,'#EAF4E6');line(c,[[wx+4,wy],[wx+4,wy+12]],'#BACBC0',1);}
    round(c,x+w/2-5,y+h-20,10,20,3,'#A2B7B3');
  }
  function tree(c,x,y,k){
    c.save();c.translate(x,y);c.scale(k,k);
    oval(c,0,2,23,5,'#527F5533');round(c,-4,-53,8,53,3,'#B59A70');
    line(c,[[0,-30],[-14,-50]],'#B59A70',4);line(c,[[0,-23],[15,-45]],'#B59A70',4);
    oval(c,-17,-58,23,26,'#83B48E');oval(c,15,-58,24,27,'#91BD92');oval(c,0,-78,27,29,'#A9CD9B');
    oval(c,-10,-85,15,14,'#C5DCA47A');leaf(c,14,-73,5,'#D6E7B4',.4);leaf(c,-24,-58,5,'#B9D59F',-.8);
    c.restore();
  }
  function park(c,distance,clock,reduced=false){
    if(!backdrop)backdrop=paintBackdrop();c.drawImage(backdrop,0,0,W,H);
    for(let i=0;i<4;i++){const x=(i*141+45-distance*.045)%564;cloud(c,x<-70?x+564:x,91+(i%3)*59,.75+(i%2)*.22);}
    for(let i=0;i<8;i++){let x=i*82+17-distance*.09%656;if(x<-75)x+=656;house(c,x,294+(i%3)*7,36+(i%2)*9,58+(i%3)*5,['#ECD9C3','#E2D4DA','#D4E4D7'][i%3],['#C69E8C','#B4ABC3','#99B9AE'][i%3]);}
    c.fillStyle=gradient(c,327,115,'#BCD79E','#98BE83');c.beginPath();c.moveTo(0,363);c.bezierCurveTo(89,339,128,357,203,367);c.bezierCurveTo(269,338,314,339,360,353);c.lineTo(W,GROUND);c.lineTo(0,GROUND);c.fill();
    for(let i=0;i<7;i++){let x=i*100+22-distance*.21%700;if(x<-55)x+=700;tree(c,x,403+(i%2)*6,.6+(i%3)*.13);}
    // A white rail separates the scenery from the playable lane.
    round(c,0,415,W,3,1,'#FFF8DD');round(c,0,430,W,3,1,'#F9F2D4');
    for(let x=-(distance*.45%49);x<W+20;x+=49){round(c,x,407,5,33,2,'#E8DCBC');round(c,x,407,2,29,1,'#FFFBE4');}
    c.fillStyle='#759F6B';c.fillRect(0,436,W,4);
    c.fillStyle=gradient(c,GROUND,74,'#E9D2A7','#F3DFB9');c.fillRect(0,GROUND,W,H-GROUND);
    c.fillStyle='#FFF0CE';c.fillRect(0,GROUND,W,3);c.fillStyle='#C5AE853B';c.fillRect(0,443,W,5);
    for(let i=0;i<18;i++){let x=i*33-distance%594;if(x<-30)x+=594;oval(c,x,459+(i%4)*10,2+(i%2),1,'#CBB18450');}
    for(let x=-(distance%69);x<W+40;x+=69)round(c,x,482,27,3,1.5,'#FFF3D7');
    c.fillStyle='#94B878';c.fillRect(0,510,W,30);c.fillStyle='#C2D79B';c.fillRect(0,510,W,4);
    for(let i=0;i<12;i++){let x=i*39-distance*1.05%468;if(x<-30)x+=468;line(c,[[x,524],[x+2,519],[x+4,524]],'#749C68',1.5);if(i%3===0)flower(c,x+17,525,3.7,i%2?'#FFE7CC':'#F0C5C0');}
    if(!reduced){const wing=Math.sin(clock*3)*3;for(let i=0;i<2;i++){const x=166+i*16-distance*.012%70,y=204+i*7;line(c,[[x-5,y+wing],[x,y],[x+5,y+wing]],'#839FA466',1.2);}}
  }
  function coin(c,x,y,clock){
    oval(c,x,y+11,7,2,'#8F86672B');
    c.save();c.translate(x,y);c.scale(.8+.2*Math.cos(clock*5+x*.02),1);
    oval(c,0,1,10,10,'#CF983D');oval(c,0,-1,10,10,gradient(c,-11,20,'#FFE8A0','#F3BD56'));
    c.strokeStyle='#FFF0BB';c.lineWidth=1.2;c.beginPath();c.arc(0,-1,7.8,0,TAU);c.stroke();
    c.fillStyle='#AC7A32';c.textAlign='center';c.font=`11px ${FONT}`;c.fillText('쭈',0,3);
    oval(c,-4,-5,1.4,1,'#FFF9DB');c.restore();
    if(Math.sin(clock*4+x)>.75)star(c,x+11,y-10,3,'#FFF6C8',clock);
  }
  function obstacle(c,item){
    const {x,w,h,k}=item,y=GROUND-h;oval(c,x+w/2,GROUND+2,w*.64,3,'#9A785E36');
    if(k==='cone'){
      c.fillStyle=gradient(c,y,h,'#F8A278','#DC755C');c.beginPath();c.moveTo(x+3,GROUND-3);c.lineTo(x+w/2-2,y);c.lineTo(x+w/2+2,y);c.lineTo(x+w-3,GROUND-3);c.closePath();c.fill();
      c.fillStyle='#FFF0D5';c.beginPath();c.moveTo(x+7,y+18);c.lineTo(x+w-7,y+18);c.lineTo(x+w-5,y+28);c.lineTo(x+5,y+28);c.closePath();c.fill();
      line(c,[[x+w/2-2,y+5],[x+6,GROUND-8]],'#FFD2A1',1.7);round(c,x,GROUND-4,w,4,2,'#B86953');
    }else{
      round(c,x,y,w,h,5,gradient(c,y,h,'#B58A67','#947051'));
      round(c,x+3,y+2,w-6,3,1,'#D3AD82');line(c,[[x+4,y+10],[x+w-8,y+11]],'#CFAD81',1.5);
      line(c,[[x+5,y+21],[x+w-9,y+19]],'#6F543C',1.2);oval(c,x+w-7,y+14,4.6,9.5,'#DFC297');
      c.strokeStyle='#B38C62';c.lineWidth=1;c.beginPath();c.ellipse(x+w-7,y+14,2.6,6.1,0,0,TAU);c.stroke();
    }
  }
  function runner(c,x,base,clock,airborne,second=false,scale=1){
    c.save();c.translate(x,base);c.scale(scale,scale);
    const swing=airborne?.35:Math.sin(clock*18),bob=airborne?0:Math.sin(clock*18)*1.3;
    c.translate(0,bob);
    // The visible body stays within the established x=72..94, y=base-76..base hit area.
    line(c,[[-3,-23],[-6+2*swing,-12],[-6-2*swing,-3]],'#4C5272',4.5);
    line(c,[[4,-23],[6-2*swing,-13],[4+2*swing,-3]],'#656B89',4.5);
    round(c,-10-swing,-5,10,5,2.5,'#FFF4DC');round(c,1+swing,-5,9,5,2.5,'#FFF4DC');
    round(c,-8,-49,17,28,6,gradient(c,-49,28,'#E98C79','#D77368'));
    round(c,-6,-33,13,9,4,'#F7B39B');line(c,[[-5,-44],[-10,-32],[-7,-29]],'#D16C62',4);
    line(c,[[6,-43],[9,-34],[5,-29]],'#E7A486',4);oval(c,6,-30,3,3,'#F1BD98');
    // A jaunty cap, expressive face and mint scarf replace the old plain bar.
    round(c,-10,-71,21,23,9,gradient(c,-71,23,'#FFDFC0','#F3BC97'));
    round(c,-10,-73,20,7,4,'#4A597B');round(c,-3,-76,13,8,4,'#5D6E91');round(c,4,-70,8,3,1.5,'#354868');
    oval(c,-3,-61,1.4,1.8,'#594941');oval(c,5,-61,1.4,1.8,'#594941');oval(c,-6,-57,2.2,1.3,'#F29A8C');
    c.strokeStyle='#9D6654';c.lineWidth=1.4;c.beginPath();c.arc(2,-58,3,0,Math.PI*.9);c.stroke();
    round(c,-8,-50,17,5,2,'#84BCA9');
    c.fillStyle='#9ACBB5';c.beginPath();c.moveTo(-5,-49);c.quadraticCurveTo(-10,-53,-11,-47);c.lineTo(-9,-43);c.lineTo(-3,-46);c.fill();
    if(second)star(c,0,-85,3.2,'#FFF8D3',clock);
    c.restore();
  }
  function hud(c,score,coins,jumps){
    round(c,14,14,152,57,18,'#FFFFFFB8');round(c,14,14,152,56,18,'#FFFCEDDB');
    c.fillStyle='#819796';c.font=`10px ${FONT}`;c.textAlign='left';c.fillText('오늘의 달리기',27,32);
    c.fillStyle='#485D70';c.font=`26px ${FONT}`;c.fillText(String(score),26,58);const scoreWidth=c.measureText(String(score)).width;
    c.fillStyle='#8CA0A0';c.font=`11px ${FONT}`;c.fillText('점',31+scoreWidth,57);
    round(c,244,18,102,41,17,'#FFFCEDDB');coin(c,262,39,0);c.fillStyle='#866B4D';c.font=`18px ${FONT}`;c.textAlign='left';c.fillText(String(coins),282,45);
    round(c,14,76,72,21,10,'#FFFCEDB8');
    for(let i=0;i<2;i++){oval(c,27+i*15,87,4,4,i<2-jumps?'#729C93':'#8EA6A336');}
    c.textAlign='left';c.fillStyle='#7F9B9B';c.font=`10px ${FONT}`;c.fillText('점프',52,90);
  }
  function create(api){
    let offset=0,velocity=0,jumps=0,clock=0,distance=0,coins=0,speed=260;
    let obstacles=[],pickups=[],effects=[],obstacleIn=1.2,coinsIn=.8,finished=false,dustIn=0;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    const score=()=>Math.floor(distance/10)+coins*20;
    function puff(x,y,kind){if(reduced)return;effects.push({x,y,kind,life:0});}
    const game={
      update(dt){
        if(finished)return;
        clock+=dt;speed=Math.min(620,260+clock*9);distance+=speed*dt;
        const wasAir=offset<0;velocity+=1900*dt;offset+=velocity*dt;
        if(offset>0){offset=0;velocity=0;jumps=0;if(wasAir)puff(83,GROUND,'land');}
        // These spawn, movement, pickup and score rules match the original runner.
        obstacleIn-=dt;
        if(obstacleIn<=0){const cone=Math.random()<.35;obstacles.push({x:W+20,w:cone?24:30,h:cone?46:28,k:cone?'cone':'box'});obstacleIn=Math.max(.65,1.5-clock*.012)+Math.random()*.7;}
        coinsIn-=dt;
        if(coinsIn<=0){const height=Math.random()<.5?30:95;for(let i=0;i<3;i++)pickups.push({x:W+20+i*34,y:GROUND-height-10,got:false});coinsIn=1.4+Math.random()*1.4;}
        for(const item of obstacles)item.x-=speed*dt;
        for(const item of pickups)item.x-=speed*dt;
        obstacles=obstacles.filter(item=>item.x>-60);pickups=pickups.filter(item=>item.x>-40&&!item.got);
        for(const effect of effects){effect.life+=dt;effect.x-=speed*dt*.35;}effects=effects.filter(effect=>effect.life<.55);
        dustIn-=dt;if(!wasAir&&dustIn<=0){puff(72,GROUND-2,'dust');dustIn=.13;}
        const bottom=GROUND+offset,top=bottom-64;
        for(const item of obstacles)if(item.x<94&&item.x+item.w>72&&GROUND-item.h<bottom-3){finished=true;api.end(score());return;}
        for(const item of pickups)if(!item.got&&item.x>60&&item.x<106&&item.y>top-12&&item.y<bottom){item.got=true;coins++;puff(item.x,item.y,'coin');api.sound?.hit?.();}
        api.setScore(score());
      },
      draw(c){
        c.save();park(c,distance,clock,reduced);
        for(const item of obstacles)obstacle(c,item);
        for(const item of pickups)if(!item.got)coin(c,item.x,item.y,clock);
        const shadow=16-Math.min(10,-offset/12);oval(c,83,GROUND+2,shadow,3,'#6C70502B');
        for(const effect of effects){
          const progress=effect.life/.55;c.save();c.globalAlpha=1-progress;
          if(effect.kind==='coin'){
            for(let i=0;i<5;i++){const a=i*TAU/5;star(c,effect.x+Math.cos(a)*progress*20,effect.y+Math.sin(a)*progress*20,3*(1-progress*.5),'#FFF2B4',a);}
            c.fillStyle='#A87C40';c.font=`12px ${FONT}`;c.textAlign='center';c.fillText('+20',effect.x,effect.y-14-progress*16);
          }else if(effect.kind==='jump'){
            c.strokeStyle='#FFFCDB';c.lineWidth=2*(1-progress)+.5;c.beginPath();c.ellipse(effect.x,effect.y,9+progress*17,3+progress*5,0,0,TAU);c.stroke();
          }else{
            for(let i=0;i<3;i++)oval(c,effect.x-i*6-progress*11,effect.y-3-i*2-progress*9,(3+i+progress*3)*(effect.kind==='land'?1.3:1),2+progress*2,'#FFF4D3');
          }
          c.restore();
        }
        runner(c,83,GROUND+offset,clock,offset<0,jumps===2);
        hud(c,score(),coins,jumps);
        round(c,122,518,116,18,9,'#FFFCDEB8');c.fillStyle='#668365';c.font=`11px ${FONT}`;c.textAlign='center';c.fillText('탭 · 두 번 점프',W/2,531);
        c.restore();
      },
      onDown(){if(finished||jumps>=2)return;velocity=-720;jumps++;puff(83,GROUND+offset-2,'jump');api.sound?.tap?.();},
      onKey(key){if(key===' '||key==='ArrowUp'||key==='w'){game.onDown();return true;}},
      destroy(){finished=true;obstacles=[];pickups=[];effects=[];}
    };
    return game;
  }
  function drawPreview(c){
    c.save();park(c,240,1.1,true);
    c.textAlign='center';c.fillStyle='#FFFFFFA8';c.font=`42px ${FONT}`;c.fillText('쭈 달리기',W/2,160);
    c.fillStyle='#4B6974';c.fillText('쭈 달리기',W/2,158);
    round(c,115,177,130,26,13,'#FFFCDEAA');c.fillStyle='#79928B';c.font=`12px ${FONT}`;c.fillText('톡! 톡! 두 번 점프',W/2,194);
    oval(c,129,343,26,4,'#72917429');runner(c,127,327,1.1,true,true,1.65);
    for(let i=0;i<3;i++)coin(c,197+i*31,269-i*7,1.1);
    c.strokeStyle='#FFF8D2';c.lineWidth=3;c.beginPath();c.ellipse(124,331,25,7,0,0,TAU);c.stroke();
    star(c,103,250,4,'#FFFCDA',.2);star(c,161,302,4,'#FFFCDA',.4);c.restore();
  }
  function soundIcon(value){return '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/>'+(value==='🔇'?'<path d="m17 9 5 6m0-6-5 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>':'<path d="M17 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>')+'</svg>';}
  function shoeIcon(){return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true"><path d="m4 7 5 3 3-2 3 6 5 2v4H3V9Z" fill="currentColor" opacity=".8"/><path d="m10 12 3-1m-1 4 3-1M4 18h15" stroke="#FFF8E7" stroke-width="1.4" stroke-linecap="round"/></svg>';}
  window.OjjudaRunnerGame={create,drawPreview,soundIcon,shoeIcon};
})();
