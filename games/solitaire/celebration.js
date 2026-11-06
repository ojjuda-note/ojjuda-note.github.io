import {SUITS} from './engine.js?v=5';
import {cardAsset,CARD_RATIO} from './cards.js?v=20261106-solitaire-red2';

export function playWinAnimation(onComplete){
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){onComplete();return ()=>{};}
  const layer=document.createElement('div');layer.className='win-celebration';
  layer.innerHTML='<canvas aria-hidden="true"></canvas><div class="win-banner" role="status"><strong>멋지게 완성했어요!</strong><button type="button">결과 보기</button></div>';
  document.body.append(layer);
  const canvas=layer.querySelector('canvas'),ctx=canvas.getContext('2d');
  let raf=0,done=false,particles=[],sprites=[],last=0,startedAt=0,elapsed=0,spawned=0;
  const width=innerWidth,height=innerHeight,dpr=Math.min(devicePixelRatio||1,2);
  canvas.width=width*dpr;canvas.height=height*dpr;ctx.scale(dpr,dpr);
  const cardWidth=Math.max(38,Math.min(92,(width-32)/8)),cardHeight=cardWidth*CARD_RATIO;
  const origins=SUITS.map((_,i)=>{const r=document.querySelector(`.pile[data-type="foundation"][data-col="${i}"]`).getBoundingClientRect();return {x:Math.max(cardWidth/2,Math.min(width-cardWidth/2,r.x+r.width/2)),y:Math.max(cardHeight/2,Math.min(height*.35,r.y+r.height/2))};});
  const finish=()=>{if(done)return;done=true;cancelAnimationFrame(raf);layer.remove();document.removeEventListener('keydown',onKey);onComplete();};
  const onKey=e=>{if(e.key==='Escape'||e.key==='Enter'){e.preventDefault();finish();}};
  layer.querySelector('button').onclick=finish;document.addEventListener('keydown',onKey);
  function frame(now){
    if(done)return;
    if(!startedAt)startedAt=now;
    const dt=last?Math.min((now-last)/1000,.05):0;last=now;elapsed=(now-startedAt)/1000;
    // Fading tracks recall the original Windows bouncing-card finish.
    ctx.save();ctx.globalCompositeOperation='destination-out';ctx.fillStyle='rgba(0,0,0,.16)';ctx.fillRect(0,0,width,height);ctx.restore();
    while(spawned<52 && elapsed>=spawned*.085){
      const suitIndex=spawned%4,rank=13-Math.floor(spawned/4),origin=origins[suitIndex];
      particles.push({x:origin.x,y:origin.y,vx:(suitIndex<2?-1:1)*(80+Math.random()*160),vy:-160-Math.random()*230,rotation:0,spin:(Math.random()-.5)*3,bounces:0,age:0,image:sprites[suitIndex*13+rank-1]});spawned++;
    }
    particles=particles.filter(p=>p.x>-cardWidth*2&&p.x<width+cardWidth*2&&p.y<height+cardHeight*2);
    for(const p of particles){
      p.age+=dt;p.vy+=950*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.rotation+=p.spin*dt;
      if(p.age<3.5){
        if(p.x<cardWidth/2){p.x=cardWidth/2;p.vx=Math.abs(p.vx);}
        if(p.x>width-cardWidth/2){p.x=width-cardWidth/2;p.vx=-Math.abs(p.vx);}
      }
      if(p.y+cardHeight/2>=height-10 && p.vy>0 && p.bounces<3){p.y=height-10-cardHeight/2;p.vy=-p.vy*.7;p.bounces++;}
      ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rotation);ctx.shadowColor='#001c1960';ctx.shadowBlur=5;
      ctx.drawImage(p.image,-cardWidth/2,-cardHeight/2,cardWidth,cardHeight);ctx.restore();
    }
    if(elapsed>8.5 || (spawned===52&&!particles.length))finish();else raf=requestAnimationFrame(frame);
  }
  Promise.all(SUITS.flatMap(suit=>Array.from({length:13},(_,i)=>new Promise(resolve=>{
    const image=new Image(),card={suit,rank:i+1};
    image.onload=()=>resolve(image);image.onerror=()=>resolve(null);
    image.src=cardAsset(card);
  })))).then(images=>{if(done)return;if(images.some(x=>!x)){finish();return;}sprites=images;raf=requestAnimationFrame(frame);});
  return finish;
}
