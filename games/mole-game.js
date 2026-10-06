(function () {
  'use strict';
  const W=360,H=540,TAU=Math.PI*2;
  const FONT='"Jua","Gowun Dodum","Apple SD Gothic Neo",sans-serif';
  let garden;
  function round(c,x,y,w,h,r){r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
  function oval(c,x,y,rx,ry,color){c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx,ry,0,0,TAU);c.fill();}
  function gradient(c,x,y,h,top,bottom){const g=c.createLinearGradient(x,y,x,y+h);g.addColorStop(0,top);g.addColorStop(1,bottom);return g;}
  function star(c,x,y,r,color,rotation=0){c.save();c.translate(x,y);c.rotate(rotation);c.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,d=i%2?r*.45:r;c.lineTo(Math.cos(a)*d,Math.sin(a)*d);}c.closePath();c.fillStyle=color;c.fill();c.restore();}
  function leaf(c,x,y,size,color,angle=0){c.save();c.translate(x,y);c.rotate(angle);c.fillStyle=color;c.beginPath();c.moveTo(0,0);c.bezierCurveTo(-size,-size*.9,-size*.5,-size*1.7,0,-size*1.7);c.bezierCurveTo(size*.5,-size*1.7,size,-size*.9,0,0);c.fill();c.restore();}
  function flower(c,x,y,r,color){c.strokeStyle='#659854';c.lineWidth=2;c.beginPath();c.moveTo(x,y+11);c.quadraticCurveTo(x+3,y+3,x,y);c.stroke();leaf(c,x+1,y+9,5,'#7EAF63',.8);for(let i=0;i<5;i++){const a=i*TAU/5;oval(c,x+Math.cos(a)*r*.68,y+Math.sin(a)*r*.68,r*.53,r*.53,color);}oval(c,x,y,r*.4,r*.4,'#FFD77A');}
  function cloud(c,x,y,k){c.save();c.translate(x,y);c.scale(k,k);oval(c,0,7,24,8,'#FFFFFFB8');oval(c,-9,0,12,11,'#FFFFFFB8');oval(c,9,-3,15,14,'#FFFFFFB8');c.restore();}
  function paintGarden(){
    const canvas=document.createElement('canvas');canvas.width=W*2;canvas.height=H*2;
    const c=canvas.getContext('2d');c.scale(2,2);
    c.fillStyle=gradient(c,0,0,200,'#C4E8EB','#F7F2D7');c.fillRect(0,0,W,H);
    oval(c,313,95,26,26,'#FFF2B3');oval(c,313,95,19,19,'#FFE8A0');
    cloud(c,50,100,.9);cloud(c,238,83,.68);
    c.fillStyle='#A8CDA7';c.beginPath();c.moveTo(0,160);c.bezierCurveTo(80,80,108,107,183,146);c.bezierCurveTo(241,90,282,92,360,149);c.lineTo(360,230);c.lineTo(0,230);c.fill();
    c.fillStyle=gradient(c,0,130,H-130,'#B8DC8C','#7EB26E');c.fillRect(0,147,W,H-147);
    // Wooden fence, bushes and flowers give the board depth without image loads.
    c.fillStyle='#A17A49';round(c,0,124,W,7,2);c.fill();round(c,0,147,W,7,2);c.fill();
    for(let x=10;x<W;x+=29){c.fillStyle='#AC8355';round(c,x+1,112,14,50,5);c.fill();c.fillStyle=gradient(c,x,108,50,'#EAD8AF','#C5A273');round(c,x,108,12,50,5);c.fill();c.fillStyle='#F9ECCB';round(c,x+2,113,2,35,1);c.fill();oval(c,x+6,128,1,1,'#A48962');}
    for(const [x,y,r] of [[0,167,31],[21,178,22],[344,164,26],[360,184,28],[5,482,29],[355,478,32]]){oval(c,x,y+7,r,r*.7,'#639656');oval(c,x,y,r,r*.7,'#91BE6E');oval(c,x-r*.22,y-r*.23,r*.48,r*.3,'#AED481');}
    c.fillStyle='#5B895229';round(c,8,172,344,314,30);c.fill();
    c.fillStyle=gradient(c,0,157,328,'#C4DE91','#9FC679');round(c,8,158,344,324,28);c.fill();
    c.strokeStyle='#D9EDAE';c.lineWidth=3;round(c,10,160,340,318,26);c.stroke();
    c.fillStyle='#86B36644';round(c,20,173,320,294,22);c.fill();
    // Deterministic decorations must never consume gameplay randomness.
    for(let i=0;i<78;i++){const x=22+(i*73%316),y=168+(i*97%296);c.strokeStyle=i%3?'#8DB86888':'#D6E9A38A';c.lineWidth=1.7;c.beginPath();c.moveTo(x-2,y+4);c.lineTo(x,y);c.lineTo(x+2,y+3);c.stroke();}
    for(let row=0;row<3;row++)for(let col=0;col<3;col++){const x=60+col*120,y=190+row*115;oval(c,x,y+35,49,17,'#7C9E5759');oval(c,x,y+30,53,21,'#B5CB82');}
    flower(c,20,177,7,'#FFF9DB');flower(c,343,201,7,'#F8C9BA');flower(c,22,462,6,'#F7D3CB');flower(c,334,469,7,'#FFF8DA');flower(c,17,308,5,'#FFF3BA');flower(c,347,354,5,'#FAD3CE');
    oval(c,32,499,10,5,'#688F5C');oval(c,30,496,10,5,'#D5D8B1');oval(c,28,494,5,2,'#F2EDC9');
    leaf(c,315,502,11,'#648F52',-.65);leaf(c,315,502,11,'#81AD60',.5);
    oval(c,46,478,3,2,'#E2DAAF');oval(c,324,485,4,2,'#D2D4A6');
    return canvas;
  }
  function holeBack(c,h){
    oval(c,h.x,h.y+31,48,17,'#617D4155');
    oval(c,h.x,h.y+26,48,19,gradient(c,h.x,h.y+7,38,'#D0AF73','#9C713F'));
    oval(c,h.x,h.y+24,41,13,gradient(c,h.x,h.y+11,27,'#382E26','#725139'));
    c.strokeStyle='#E6CD92';c.lineWidth=2;c.beginPath();c.ellipse(h.x,h.y+25,45,16,0,Math.PI,TAU);c.stroke();
  }
  function holeFront(c,h){
    c.fillStyle=gradient(c,h.x,h.y+23,23,'#C6A06A','#9E774C');c.beginPath();c.ellipse(h.x,h.y+26,48,19,0,0,Math.PI);c.closePath();c.fill();
    c.strokeStyle='#E1C38A';c.lineWidth=2;c.beginPath();c.ellipse(h.x,h.y+25,46,17,0,.1,Math.PI-.1);c.stroke();
    c.strokeStyle='#87AD5A';c.lineWidth=2.5;for(const side of [-1,1]){const x=h.x+side*44;c.beginPath();c.moveTo(x,h.y+39);c.lineTo(x-side*3,h.y+33);c.lineTo(x-side*6,h.y+37);c.stroke();}
    oval(c,h.x-25,h.y+37,3,1.7,'#9B7649');oval(c,h.x+21,h.y+40,2,1.2,'#E7D49E');
  }
  function eyes(c,hit,bomb=false){
    c.strokeStyle=bomb?'#FFB4A0':'#49392E';c.lineWidth=2.8;c.lineCap='round';
    for(const x of [-11,11])if(hit){c.beginPath();c.moveTo(x-4,-7);c.lineTo(x+4,0);c.moveTo(x+4,-7);c.lineTo(x-4,0);c.stroke();}else{oval(c,x,-6,4.4,5.5,bomb?'#FFD4A6':'#3E302B');oval(c,x-1.2,-8,1.4,1.9,'#FFFFFF');}
  }
  function mole(c,x,y,kind,hit,clock){
    c.save();c.translate(x,y);
    if(kind==='bomb'){
      c.strokeStyle='#6F644D';c.lineWidth=4;c.lineCap='round';c.beginPath();c.moveTo(11,-28);c.bezierCurveTo(16,-37,24,-26,25,-40);c.stroke();
      star(c,25,-40,5+Math.sin(clock*24),hit?'#FFF0BA':'#FFAD58',clock*2);
      oval(c,0,0,31,32,gradient(c,0,-32,64,'#6C7587','#252F40'));
      oval(c,-12,-16,11,5,'#A7B1C46B');oval(c,0,17,15,11,'#1E263D55');
      eyes(c,hit,true);
      c.fillStyle='#E87964';c.beginPath();c.moveTo(0,3);c.lineTo(-8,17);c.lineTo(8,17);c.closePath();c.fill();
      c.fillStyle='#FFF5E5';c.font=`12px ${FONT}`;c.textAlign='center';c.fillText('!',0,15);
      c.restore();return;
    }
    const gold=kind==='gold',coat=gold?'#E6AD46':'#98664C',light=gold?'#FFE4A0':'#CEA181';
    oval(c,0,22,25,30,gradient(c,0,0,45,light,coat));
    for(const side of [-1,1]){oval(c,side*25,-23,9,10,coat);oval(c,side*25,-23,5,6,gold?'#FFCF72':'#DFA58F');}
    oval(c,0,0,31,33,gradient(c,0,-32,64,light,coat));
    oval(c,-11,-18,12,6,gold?'#FFF0BF55':'#E8C6A355');
    oval(c,0,11,21,16,gradient(c,0,-1,31,gold?'#FFF1CB':'#EFCEAD',gold?'#EFD096':'#DAB594'));
    oval(c,-21,4,6,3.5,gold?'#EBA58099':'#E4968499');oval(c,21,4,6,3.5,gold?'#EBA58099':'#E4968499');
    eyes(c,hit);
    c.fillStyle='#A96962';c.beginPath();c.moveTo(0,8);c.bezierCurveTo(-13,0,-5,-4,0,0);c.bezierCurveTo(5,-4,13,0,0,8);c.fill();
    c.strokeStyle='#75553D';c.lineWidth=1.8;c.lineCap='round';c.beginPath();c.moveTo(0,8);c.lineTo(0,12);c.quadraticCurveTo(-5,18,-9,12);c.moveTo(0,12);c.quadraticCurveTo(5,18,9,12);c.stroke();
    c.fillStyle='#FFFAE7';round(c,-4,12,8,8,2);c.fill();c.strokeStyle='#CFB99D';c.lineWidth=1;c.beginPath();c.moveTo(0,12);c.lineTo(0,20);c.stroke();
    c.fillStyle=gold?'#C4863B':'#4C9A84';c.beginPath();c.moveTo(-18,28);c.quadraticCurveTo(0,38,18,28);c.lineTo(14,36);c.quadraticCurveTo(0,42,-14,36);c.closePath();c.fill();
    for(const side of [-1,1]){oval(c,side*26,25,9,7,gold?'#F3CE7C':'#BB8B65');oval(c,side*26-2,23,5,2,gold?'#FFE7AA':'#DEBA90');}
    if(gold){
      c.fillStyle=gradient(c,0,-42,17,'#FFF3B7','#DB9D32');c.strokeStyle='#BB842B';c.lineWidth=1.2;c.beginPath();c.moveTo(-17,-27);c.lineTo(-20,-38);c.lineTo(-9,-32);c.lineTo(0,-43);c.lineTo(9,-32);c.lineTo(20,-38);c.lineTo(17,-27);c.closePath();c.fill();c.stroke();
      oval(c,0,-31,3,3,'#F39489');star(c,-36,-18,4,'#FFF0B9',clock);star(c,36,-30,3.5,'#FFF0B9',-clock);
    }else{
      c.strokeStyle='#A77554';c.lineWidth=3;c.beginPath();c.moveTo(-6,-29);c.quadraticCurveTo(-8,-34,-3,-32);c.quadraticCurveTo(1,-37,4,-30);c.stroke();
    }
    c.restore();
  }
  function hud(c,remaining,score,preview){
    c.save();c.textAlign='center';c.textBaseline='alphabetic';
    if(preview){c.fillStyle='#42654C';c.font=`29px ${FONT}`;c.fillText('두더지 잡기',W/2,46);c.fillStyle='#6C8670';c.font=`13px ${FONT}`;c.fillText('톡톡! 30초 정원 대작전',W/2,70);c.restore();return;}
    for(const x of [16,202]){c.fillStyle='#8CAA8559';round(c,x,20,142,62,18);c.fill();c.fillStyle='#FFF9E9';round(c,x,16,142,62,18);c.fill();c.strokeStyle='#FFFFFFAA';c.lineWidth=2;round(c,x+1,17,140,59,17);c.stroke();}
    oval(c,42,47,13,13,remaining<8?'#F2C2AA':'#D4E6CC');c.strokeStyle=remaining<8?'#B65A45':'#638965';c.lineWidth=2;c.beginPath();c.arc(42,47,8,0,TAU);c.moveTo(42,41);c.lineTo(42,47);c.lineTo(47,49);c.stroke();
    star(c,228,47,12,'#E7B352');star(c,228,46,9,'#FFD47D');
    c.fillStyle='#8C9078';c.font=`10px ${FONT}`;c.fillText('남은 시간',104,32);c.fillText('점수',290,32);
    c.fillStyle=remaining<8?'#B65A45':'#3D644C';c.font=`26px ${FONT}`;c.fillText(Math.ceil(Math.max(0,remaining))+'초',104,63);c.fillStyle='#755C42';c.fillText(score+'점',290,63);
    c.fillStyle='#6E9A6540';round(c,20,91,320,7,4);c.fill();const width=320*Math.max(0,remaining)/30;if(width){c.fillStyle=remaining<8?'#DD8C73':'#759E70';round(c,20,91,width,7,Math.min(4,width/2));c.fill();}
    c.restore();
  }
  function drawHammer(c,h,reduced){
    if(!h||h.t>.28)return;
    const p=h.t/.28;c.save();c.globalAlpha=Math.min(1,(1-p)*3);c.translate(h.x+14,h.y-16);c.rotate(reduced?-.35:-1.3+Math.sin(Math.min(1,p*2)*Math.PI/2)*1.1);
    c.fillStyle=gradient(c,0,5,52,'#E9C699','#B58151');round(c,-5,4,10,48,4);c.fill();c.fillStyle='#F6DAAF';round(c,-3,11,2,33,1);c.fill();
    c.fillStyle='#A9504140';round(c,-24,-11,50,30,10);c.fill();c.fillStyle=gradient(c,0,-17,30,'#F2B5A0','#D98470');round(c,-25,-17,50,28,9);c.fill();c.fillStyle='#FFCEB3';round(c,-23,-15,46,6,4);c.fill();
    c.fillStyle='#FFF0D4';round(c,-12,-17,5,28,2);c.fill();round(c,7,-17,5,28,2);c.fill();c.restore();
  }
  function draw(c,holes,remaining,score,effects,hammer,clock,preview,reduced){
    garden= garden||paintGarden();c.save();c.drawImage(garden,0,0,W,H);
    if(hammer?.kind==='bomb'&&hammer.t<.22&&!reduced)c.translate(Math.sin(hammer.t*90)*3*(1-hammer.t/.22),0);
    for(const h of holes){
      holeBack(c,h);
      if(h.on){const rise=h.hit?1:Math.max(0,Math.min(1,h.t/.15,(h.dur-h.t)/.15)),ease=1-Math.pow(1-rise,2);c.save();c.beginPath();c.rect(h.x-46,h.y-54,92,81);c.clip();mole(c,h.x,h.y+32-42*ease,h.kind,h.hit>0,clock);c.restore();}
      holeFront(c,h);
    }
    c.fillStyle='#3F694E';c.font=`12px ${FONT}`;c.textAlign='center';c.fillText('금색 +3점  ·  폭탄 −2점',W/2,519);
    for(const e of effects){const p=e.t/.7;c.save();c.globalAlpha=1-p;
      const color=e.v===3?'#E9B240':e.v<0?'#BF6957':'#FFF1B4';
      for(let k=0;k<(reduced?3:7);k++){const a=k*TAU/7+.2,d=12+p*44;star(c,e.x+Math.cos(a)*d,e.y+18+Math.sin(a)*d-p*14,Math.max(1,5*(1-p)),color,a+p*2);}
      c.font=`28px ${FONT}`;c.textAlign='center';c.strokeStyle='#FFFBEA';c.lineWidth=4;c.lineJoin='round';const text=(e.v>0?'+':'−')+Math.abs(e.v),y=e.y-(reduced?0:p*35);c.strokeText(text,e.x,y);c.fillStyle=e.v===3?'#B88528':e.v<0?'#A75947':'#5B8D65';c.fillText(text,e.x,y);c.restore();
    }
    drawHammer(c,hammer,reduced);c.restore();hud(c,remaining,score,preview);
  }
  function holes(){return Array.from({length:9},(_,i)=>({x:60+(i%3)*120,y:190+Math.floor(i/3)*115,on:false,t:0,dur:1,kind:'m',hit:0}));}
  function create(api){
    const board=holes(),reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    let remaining=30,score=0,spawnIn=.6,effects=[],hammer=null,clock=0,finished=false;
    return {
      update(dt){
        if(finished)return;clock+=dt;remaining-=dt;
        if(remaining<=0){remaining=0;finished=true;api.end(score);return;}
        spawnIn-=dt;const progress=(30-remaining)/30;
        if(spawnIn<=0){const empty=board.filter(h=>!h.on);if(empty.length){const h=empty[Math.floor(Math.random()*empty.length)],kind=Math.random();Object.assign(h,{on:true,t:0,hit:0,dur:Math.max(.55,1.15-progress*.5),kind:kind<.12?'gold':kind<.22?'bomb':'m'});}spawnIn=Math.max(.18,.35+Math.random()*.45-progress*.2);}
        for(const h of board)if(h.on){h.t+=dt;if(h.hit){h.hit-=dt;if(h.hit<=0)h.on=false;}else if(h.t>h.dur)h.on=false;}
        effects=effects.filter(e=>(e.t+=dt)<.7);if(hammer)hammer.t+=dt;
      },
      draw(c){draw(c,board,remaining,score,effects,hammer,clock,false,reduced);},
      onDown(x,y){
        if(finished)return;hammer={x,y,t:0,kind:'miss'};
        for(const h of board)if(h.on&&!h.hit&&Math.abs(x-h.x)<46&&y>h.y-50&&y<h.y+40){
          const value=h.kind==='gold'?3:h.kind==='bomb'?-2:1;
          score=Math.max(0,score+value);h.hit=.2;hammer.kind=h.kind;effects.push({x:h.x,y:h.y-36,v:value,t:0});api.setScore(score);
          const sound=api.sound;
          if(value<0){sound?.bad?.();navigator.vibrate?.(60);}else if(value===3)sound?.bonus?.();else sound?.hit?.();return;
        }
      },
      destroy(){finished=true;effects=[];hammer=null;}
    };
  }
  function drawPreview(c){const board=holes();for(let i=0;i<3;i++)Object.assign(board[i],{on:true,t:.5,dur:9,kind:['m','gold','bomb'][i]});draw(c,board,30,0,[],null,0,true,true);}
  function soundIcon(value){const muted=value==='🔇';return `<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>${muted?'<path d="m17 9 5 6m0-6-5 6"/>':'<path d="M17 8c3 2 3 6 0 8m2-11c5 4 5 10 0 14"/>'}</svg>`;}
  function hammerIcon(){return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m11 10 7 9" stroke="#AE8250" stroke-width="4" stroke-linecap="round"/><rect x="4" y="3" width="14" height="8" rx="3" transform="rotate(-30 11 7)" fill="#D78B75"/><path d="m9 3 4 7" stroke="#F9DBC0" stroke-width="2"/></svg>';}
  window.OjjudaMoleGame={create,drawPreview,soundIcon,hammerIcon};
})();
