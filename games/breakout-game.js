(function () {
  'use strict';
  const W=360,H=540,MAX_BALLS=10,MAX_SPEED=620,LEVELS=100;
  const COLORS=['#F0679A','#F4A66B','#FFD37A','#7FD1A1','#8FB3F7','#B69CF0'];
  const ITEMS={two:{label:'2',color:'#8FB3F7',text:'공 2개'},ten:{label:'10',color:'#F58FB9',text:'공 10개'},pierce:{label:'↟',color:'#FFE08B',text:'관통 · 이번 턴'}};
  function rounded(c,x,y,w,h,r,color){
    c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();c.fillStyle=color;c.fill();
  }
  function circle(c,x,y,r,color){c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=color;c.fill();}
  function stageBricks(level){
    const count=14+Math.floor((level-1)/2),rows=Math.ceil(count/7),pattern=(level-1)%6,bricks=[],cells=[];
    let seed=level*7919+53;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
    function rank(row,col){
      if(pattern===1)return (col+row+Math.floor(level/6))%3;
      if(pattern===2)return Math.abs(col-3)+Math.abs(row-(rows-1)/2);
      if(pattern===3)return (col+level)%2;
      if(pattern===4)return (col-row+7)%7;
      if(pattern===5)return (row+col+Math.floor(level/6))%2;
      return row;
    }
    for(let row=1;row<rows;row++)for(let col=0;col<7;col++)cells.push({row,col,rank:rank(row,col)+random()*.8});
    const chosen=Array.from({length:7},(_,col)=>({row:0,col})).concat(cells.sort((a,b)=>a.rank-b.rank).slice(0,count-7));
    for(const {row,col} of chosen)bricks.push({id:row*7+col,x:14+col*48,y:84+row*22,w:44,h:18,on:true,hp:1,maxHp:1,solid:false,color:COLORS[(row+Math.floor((level-1)/6))%COLORS.length]});
    bricks.sort((a,b)=>a.id-b.id);
    // Steel stays in the top row, with at least two gaps after other bricks break.
    // It cannot enclose a breakable brick or block completion of a stage.
    const steelCount=level<3?0:Math.min(5,1+Math.floor((level-3)/20));
    for(let i=0;i<steelCount;i++){const brick=bricks.find(b=>b.id===(level+3*i)%7);brick.solid=true;}
    if(level>=2){
      const choices=bricks.filter(b=>!b.solid).map(brick=>({brick,rank:random()})).sort((a,b)=>a.rank-b.rank);
      const toughCount=Math.max(1,Math.floor(choices.length*Math.min(.7,.08+(level-2)*.006)));
      for(const {brick} of choices.slice(0,toughCount))brick.hp=brick.maxHp=2;
    }
    return bricks;
  }
  function create(api){
    const paddle={x:140,y:490,w:80,h:12};
    let balls=[],bricks=[],drops=[],waiting=true,finished=false,completed=false,lives=3,score=0,level=1,speed=360;
    let nextBallId=1,droppedInTurn=false,notice='',noticeTime=0;
    function ballAt(x,y,vx=0,vy=0){return{id:nextBallId++,x,y,vx,vy,r:7,piercing:false,contacts:new Set()};}
    function fillBricks(){
      bricks=stageBricks(level);
    }
    function newTurn(){
      balls=[ballAt(paddle.x+paddle.w/2,paddle.y-8)];drops=[];waiting=true;droppedInTurn=false;
    }
    function setNotice(text){notice=text;noticeTime=1.6;}
    function faster(amount){
      const next=Math.min(MAX_SPEED,speed+amount);if(next===speed)return;speed=next;
      for(const ball of balls){const magnitude=Math.hypot(ball.vx,ball.vy);if(magnitude){ball.vx=ball.vx/magnitude*speed;ball.vy=ball.vy/magnitude*speed;}}
    }
    function launch(){
      if(finished||!waiting)return;
      waiting=false;const angle=-Math.PI/2+(Math.random()-.5)*.8;
      balls[0].vx=Math.cos(angle)*speed;balls[0].vy=Math.sin(angle)*speed;api.sound?.tap?.();
    }
    function dropFrom(brick){
      // The first broken brick in a turn always introduces an item.
      if(droppedInTurn&&Math.random()>=.3)return;
      droppedInTurn=true;const roll=Math.random(),kind=roll<.5?'two':roll<.7?'ten':'pierce';
      drops.push({x:brick.x+brick.w/2,y:brick.y+brick.h/2,kind});
    }
    function breakBrick(brick){
      brick.on=false;score+=10;dropFrom(brick);api.sound?.hit?.();api.setScore(score);
    }
    function collect(item){
      if(!balls.length||waiting)return;
      if(item.kind==='pierce'){
        const chosen=balls.find(ball=>ball.piercing)||balls[0];
        for(const ball of balls)ball.piercing=ball===chosen;
      }else{
        const target=Math.max(balls.length,item.kind==='ten'?MAX_BALLS:2),source=balls.find(ball=>!ball.piercing)||balls[0];
        const count=Math.min(MAX_BALLS,target)-balls.length;
        for(let i=0;i<count;i++){
          let angle=-Math.PI/2+(count===1?.65:(i/(count-1)-.5)*2.1);
          const sourceAngle=Math.atan2(source.vy,source.vx);
          if(Math.abs(Math.atan2(Math.sin(angle-sourceAngle),Math.cos(angle-sourceAngle)))<.07)angle+=.12;
          // Extra balls start with their own direction and never copy piercing.
          balls.push(ballAt(source.x,source.y,Math.cos(angle)*speed,Math.sin(angle)*speed));
        }
      }
      setNotice(ITEMS[item.kind].text);api.sound?.bonus?.();
    }
    function movePaddle(x){if(Number.isFinite(x))paddle.x=Math.max(0,Math.min(W-paddle.w,x-paddle.w/2));}
    function touchBrick(ball,brick){
      const nearX=Math.max(brick.x,Math.min(ball.x,brick.x+brick.w)),nearY=Math.max(brick.y,Math.min(ball.y,brick.y+brick.h));
      return (ball.x-nearX)**2+(ball.y-nearY)**2<ball.r**2;
    }
    function avoidVerticalTrap(ball){
      if(Math.abs(ball.vx)<speed*.08){ball.vx=speed*.14*(ball.id%2?1:-1);ball.vy=Math.sign(ball.vy||-1)*Math.sqrt(speed**2-ball.vx**2);}
    }
    function step(dt){
      if(waiting){balls[0].x=paddle.x+paddle.w/2;balls[0].y=paddle.y-8;return;}
      faster(5*dt);
      for(const ball of balls){
        const beforeX=ball.x,beforeY=ball.y;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
        if(ball.x<ball.r){ball.x=ball.r;ball.vx=Math.abs(ball.vx);}
        if(ball.x>W-ball.r){ball.x=W-ball.r;ball.vx=-Math.abs(ball.vx);}
        if(ball.y<60+ball.r){ball.y=60+ball.r;ball.vy=Math.abs(ball.vy);avoidVerticalTrap(ball);}
        if(ball.vy>0&&beforeY+ball.r<=paddle.y+1&&ball.y+ball.r>=paddle.y&&ball.x>paddle.x-ball.r&&ball.x<paddle.x+paddle.w+ball.r){
          const offset=Math.max(-1,Math.min(1,(ball.x-paddle.x-paddle.w/2)/(paddle.w/2))),angle=-Math.PI/2+offset*1.05;
          ball.vx=Math.cos(angle)*speed;ball.vy=Math.sin(angle)*speed;ball.y=paddle.y-ball.r;api.sound?.tap?.();
        }
        const touching=new Set();let bounced=false;
        for(const brick of bricks)if(brick.on&&touchBrick(ball,brick)){
          touching.add(brick.id);
          if(ball.contacts.has(brick.id)||bounced)continue;
          if(!brick.solid){brick.hp--;if(brick.hp===0)breakBrick(brick);else api.sound?.tap?.();}
          else if(!ball.piercing)api.sound?.tap?.();
          if(ball.piercing)continue;
          const crossedX=beforeX+ball.r<=brick.x||beforeX-ball.r>=brick.x+brick.w;
          const crossedY=beforeY+ball.r<=brick.y||beforeY-ball.r>=brick.y+brick.h;
          const overlapX=Math.min(ball.x+ball.r-brick.x,brick.x+brick.w-ball.x+ball.r);
          const overlapY=Math.min(ball.y+ball.r-brick.y,brick.y+brick.h-ball.y+ball.r);
          if(crossedX||(!crossedY&&overlapX<overlapY)){ball.x=ball.vx>0?brick.x-ball.r-.1:brick.x+brick.w+ball.r+.1;ball.vx=-ball.vx;}
          else{ball.y=ball.vy>0?brick.y-ball.r-.1:brick.y+brick.h+ball.r+.1;ball.vy=-ball.vy;}
          avoidVerticalTrap(ball);bounced=true;
        }
        ball.contacts=touching;
      }
      if(bricks.every(brick=>brick.solid||!brick.on)){
        if(level===LEVELS){completed=true;finished=true;drops=[];setNotice('100단계 클리어!');api.end(score);return;}
        level++;faster(40);fillBricks();newTurn();setNotice(level+'단계');return;
      }
      balls=balls.filter(ball=>ball.y<=H+20);
      // One missed ball in a group does not cost a life.
      if(!balls.length){
        lives--;drops=[];api.sound?.bad?.();
        if(lives<=0){finished=true;api.end(score);return;}
        newTurn();setNotice('한 번 더!');return;
      }
      drops=drops.filter(item=>{
        item.y+=125*dt;
        if(item.y+11>=paddle.y&&item.y-11<=paddle.y+paddle.h&&item.x+15>paddle.x&&item.x-15<paddle.x+paddle.w){collect(item);return false;}
        return item.y<H+20;
      });
    }
    fillBricks();newTurn();
    const game={
      update(dt){
        if(finished||!Number.isFinite(dt)||dt<=0)return;
        const elapsed=Math.min(.1,dt),steps=Math.ceil(elapsed*240);noticeTime=Math.max(0,noticeTime-elapsed);
        // Small physics steps prevent fast balls skipping a brick or paddle.
        for(let i=0;i<steps&&!finished;i++)step(elapsed/steps);
      },
      draw(c){
        c.fillStyle='#1F2238';c.fillRect(0,0,W,H);
        for(let i=0;i<24;i++)circle(c,i*97%W,70+i*53%420,1,'#FFFFFF50');
        for(const brick of bricks)if(brick.on){
          rounded(c,brick.x,brick.y,brick.w,brick.h,5,brick.solid?'#617085':brick.color);rounded(c,brick.x+3,brick.y+3,brick.w-6,4,2,'#FFFFFF59');
          if(brick.solid||brick.hp===2){c.fillStyle='#FFFFFF';c.font='bold 12px sans-serif';c.textAlign='center';c.fillText(brick.solid?'∞':'2',brick.x+brick.w/2,brick.y+14);}
          else if(brick.maxHp===2){c.strokeStyle='#FFFFFFC9';c.lineWidth=1.3;c.beginPath();c.moveTo(brick.x+22,brick.y+5);c.lineTo(brick.x+19,brick.y+9);c.lineTo(brick.x+25,brick.y+12);c.stroke();}
        }
        for(const item of drops){
          const style=ITEMS[item.kind];rounded(c,item.x-15,item.y-11,30,22,7,style.color);
          c.fillStyle='#263047';c.textAlign='center';c.font='bold 13px sans-serif';c.fillText(style.label,item.x,item.y+4);
        }
        rounded(c,paddle.x,paddle.y,paddle.w,paddle.h,6,'#F4F6FB');
        for(const ball of balls){
          if(ball.piercing){circle(c,ball.x,ball.y,12,'#FFE08B33');c.strokeStyle='#FFE08B';c.lineWidth=1.5;c.beginPath();c.arc(ball.x,ball.y,10,0,Math.PI*2);c.stroke();}
          circle(c,ball.x,ball.y,ball.r,ball.piercing?'#FFF5C9':'#FFD37A');circle(c,ball.x-2,ball.y-2,2,'#FFFFFFB3');
        }
        c.fillStyle='#FFFFFF';c.textAlign='left';c.font='bold 18px sans-serif';c.fillText(score+'점',16,38);
        c.textAlign='right';c.fillStyle='#F0679A';c.fillText('♥'.repeat(lives),W-16,38);
        c.textAlign='center';c.font='13px sans-serif';c.fillStyle='#ACB7DD';c.fillText(level+' / '+LEVELS+'단계',W/2,38);
        c.fillText('공 '+balls.length+'개'+(balls.some(ball=>ball.piercing)?' · 관통':'') ,W/2,63);
        if(noticeTime>0){rounded(c,108,426,144,29,10,'#343B58');c.fillStyle='#FFF2CA';c.font='bold 14px sans-serif';c.fillText(notice,W/2,446);}
        if(waiting&&!finished){c.fillStyle='#FFFFFF';c.font='bold 16px sans-serif';c.fillText('탭하면 출발',W/2,407);}
      },
      onDown(x){if(finished)return;movePaddle(x);launch();},
      onMove(x){if(!finished)movePaddle(x);},
      onKey(key){
        if(finished)return false;
        if(key==='ArrowLeft'){movePaddle(paddle.x+paddle.w/2-30);return true;}
        if(key==='ArrowRight'){movePaddle(paddle.x+paddle.w/2+30);return true;}
        if(key===' '||key==='Enter'){launch();return true;}
        return false;
      },
      get resultTitle(){return completed?'100단계 클리어!':'';},
      destroy(){finished=true;balls=[];drops=[];}
    };
    return game;
  }
  window.OjjudaBreakoutGame={create};
})();
