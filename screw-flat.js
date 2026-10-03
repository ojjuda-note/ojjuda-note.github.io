/* Flat screw puzzles: relocate screws to release colliding, gravity-driven metal pieces. */
(function () {
  'use strict';
  const WIDTH = 360, HEIGHT = 540;
  const STAGE_KEY = 'ojjuda-screw-flat-stage-v1';
  const SCREW_COLOR = '#A3B6C7';
  const Pictures=typeof module!=='undefined'&&module.exports?require('./screw-flat-pictures.js'):window.OjjudaFlatPictures;
  const {PICTURES}=Pictures;
  const Physics=typeof module!=='undefined'&&module.exports?require('./screw-flat-physics.js'):window.OjjudaFlatPhysics;
  const {BOARD,LAST_STAGE,createPhysics,canUnscrew,canAccessHole,bareHole,plateCovers,screwPoint}=Physics;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function readStage() {
    try { const n = Number(localStorage.getItem(STAGE_KEY)); return Number.isInteger(n) && n >= 1 && n <= LAST_STAGE ? n : 1; }
    catch (_) { return 1; }
  }
  function saveStage(n) { try { localStorage.setItem(STAGE_KEY, String(n)); } catch (_) { /* A blocked storage area must not interrupt play. */ } }
  function makeFlatLevel(stage) {
    const level=Physics.makeFlatLevel(stage);level.picture=(level.stage-1)%PICTURES.length;level.name=PICTURES[level.picture].name;return level;
  }
  function round(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function oval(c, x, y, rx, ry, color) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = color; c.fill(); }
  function line(c, points, color, width = 3) { c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
  function drawScrew(c, x, y, color, rotation = 0, scale = 1) {
    c.save(); c.translate(x,y); c.scale(scale,scale);
    oval(c,0,2,14,14,'#44505B32'); oval(c,0,0,13,13,'#6B798D'); oval(c,0,-1,11.5,11.5,color);
    c.beginPath(); c.arc(0,-1,9.5,Math.PI*1.06,Math.PI*1.88); c.strokeStyle='#FFFFFF92'; c.lineWidth=1.8; c.stroke();
    c.rotate(rotation); line(c,[[-5,0],[5,0]],'#FFFFFFE6',3); line(c,[[0,-5],[0,5]],'#FFFFFFE6',3); c.restore();
  }
  function metalPath(c,p){c.beginPath();p.vertices.forEach((v,i)=>i?c.lineTo(v.x,v.y):c.moveTo(v.x,v.y));c.closePath();}
  function drawPlate(c,p){
    const shades=[['#EBEFF3','#B9C8D7'],['#E2E8EC','#A5B9C5'],['#E9E6EF','#B9B5CD'],['#E7ECE8','#ADBFB6']];
    const colors=shades[p.id%shades.length],top=Math.min(...p.vertices.map(v=>v.y)),bottom=Math.max(...p.vertices.map(v=>v.y));
    c.save();c.translate(p.x,p.y);c.rotate(p.angle);
    c.save();c.translate(0,3);metalPath(c,p);c.fillStyle='#3F50633D';c.fill();c.restore();
    const metal=c.createLinearGradient(0,top,0,bottom);metal.addColorStop(0,colors[0]);metal.addColorStop(.17,'#F6F8FA');metal.addColorStop(.55,colors[1]);metal.addColorStop(1,'#98AABB');
    metalPath(c,p);c.fillStyle=metal;c.fill();c.strokeStyle='#7F93A7';c.lineWidth=1.6;c.lineJoin='round';c.stroke();
    c.save();metalPath(c,p);c.clip();c.strokeStyle='#FFFFFF2B';c.lineWidth=.7;
    for(let y=top+5;y<bottom;y+=6){c.beginPath();c.moveTo(-p.w,y);c.lineTo(p.w,y-7);c.stroke();}
    c.restore();
    for(const v of p.mounts){oval(c,v.x,v.y,13,13,'#718397');oval(c,v.x,v.y,10,10,'#506176');oval(c,v.x,v.y+2,7,7,'#65798B');}
    c.restore();
  }
  function flat(api) {
    const st={L:readStage(),score:0,stageScore:0,t:0,level:null,physics:null,moves:0,selected:null,pending:null,message:'',messageTime:0,complete:false,ended:false,destroyed:false,down:null,pointers:new Set(),focus:null,
      albumOpen:false,albumPicture:null,albumFocus:null,collection:Pictures.readCollection()};
    const tell=text=>{st.message=text;st.messageTime=1.7;};
    function start(L) {
      st.physics?.destroy();st.L=L;st.level=makeFlatLevel(L);st.physics=createPhysics(st.level);st.moves=0;st.selected=null;st.pending=null;
      st.complete=false;st.ended=false;st.down=null;st.pointers.clear();st.focus=null;st.stageScore=st.score;st.messageTime=0;
      st.albumOpen=false;st.albumPicture=null;st.albumFocus=null;Pictures.preload(st.level.picture,true);
    }
    function openAlbum(){
      st.collection=new Set([...st.collection,...Pictures.readCollection()]);
      st.albumOpen=true;st.albumPicture=null;st.albumFocus=null;st.selected=null;st.focus=null;
      PICTURES.forEach((p,i)=>{if(st.collection.has(p.id))Pictures.preload(i,true);});
    }
    function albumTap(x,y){
      if((x>=282&&y<56)||y>=493){st.albumOpen=false;return;}
      if(st.albumPicture!==null){if(x<116&&y<56)st.albumPicture=null;return;}
      PICTURES.forEach((p,i)=>{
        const left=24+(i%2)*162,top=88+Math.floor(i/2)*134;
        if(x>=left&&x<=left+150&&y>=top&&y<=top+126&&st.collection.has(p.id))st.albumPicture=i;
      });
    }
    function tap(x,y) {
      if(st.destroyed||st.ended)return;
      if(st.albumOpen){albumTap(x,y);return;}
      if(y>=5&&y<=48&&x>=278&&x<=348){openAlbum();return;}
      if(st.complete) { if(y>=491&&x>=197) { if(st.L===LAST_STAGE){st.ended=true;api.end(st.score);}else start(st.L+1); }return; }
      if(y>=491&&x>=258){st.score=st.stageScore;api.setScore(st.score);start(st.L);tell('이 그림을 처음부터 다시 풀어요');return;}
      if(st.pending)return;
      const hits=st.level.holes.map(h=>({h,d:Math.hypot(h.x-x,h.y-y)})).filter(hit=>hit.d<=21).sort((a,b)=>a.d-b.d);
      const hit=hits.find(({h})=>canAccessHole(st.level,h));
      if(!hit){if(hits.length)tell('앞의 철판이 가리고 있어요');return;}
      const h=hit.h;
      if(h.screw!==null) {
        st.selected=st.selected===h.screw?null:h.screw;st.focus=null;
        if(st.selected!==null&&!st.level.holes.some(h=>h.screw===null&&canAccessHole(st.level,h)))tell('빈 구멍이 없어요. 다시 시작해 순서를 바꿔요');
        return;
      }
      if(st.selected===null){tell('옮길 나사를 먼저 눌러 주세요');return;}
      const screw=st.level.screws[st.selected];
      if(!canUnscrew(st.level,screw)){st.selected=null;tell('철판이 내려간 뒤 다시 골라 주세요');return;}
      st.pending={screw:screw.id,from:screw.hole.id,to:h.id,time:0};st.selected=null;st.focus=null;
    }
    function update(dt) {
      if(st.destroyed||st.ended||st.albumOpen)return;
      dt=clamp(dt,0,.05);st.t+=dt;st.messageTime=Math.max(0,st.messageTime-dt);
      if(st.complete)return;
      const fallen=st.physics.step(dt);
      if(fallen.length){st.score+=fallen.length*10;api.setScore(st.score);}
      if(st.pending) {
        const move=st.pending;move.time+=dt;
        if(move.time>=.5) {
          const to=st.level.holes[move.to],screw=st.level.screws[move.screw];
          if(st.physics.move(screw,to))st.moves++;
          else tell('움직인 철판이 가렸어요. 빈 구멍을 다시 골라요');
          st.pending=null;
        }
      }
      if(!st.pending&&st.level.plates.every(p=>p.state==='gone')) {
        st.complete=true;st.selected=null;st.focus=null;st.score+=st.L*10;api.setScore(st.score);saveStage(Math.min(LAST_STAGE,st.L+1));
        st.collection=Pictures.collect(st.level.picture,st.collection);Pictures.preload((st.level.picture+1)%PICTURES.length);
      }
    }
    function drawHole(c,h) {
      oval(c,h.x,h.y+1,13.5,13.5,'#B8AC9E');oval(c,h.x,h.y,10,10,'#766F6B');oval(c,h.x,h.y+2,7,7,'#A3998C');
    }
    function drawAlbum(c){
      c.fillStyle='#F7F1E9';c.fillRect(0,0,WIDTH,HEIGHT);c.textBaseline='middle';c.textAlign='left';
      c.font='700 20px "Noto Sans KR",sans-serif';c.fillStyle='#514859';
      c.fillText(st.albumPicture===null?'완성 그림 앨범':'← 목록',24,31);
      round(c,288,12,48,38,14);c.fillStyle='#EAE1D7';c.fill();c.textAlign='center';c.font='700 12px "Noto Sans KR",sans-serif';c.fillStyle='#75695E';c.fillText('닫기',312,31);
      c.font='12px "Noto Sans KR",sans-serif';c.fillStyle='#8E7B69';
      if(st.albumPicture!==null){
        const picture=PICTURES[st.albumPicture];c.font='700 17px "Noto Sans KR",sans-serif';c.fillStyle='#514859';c.fillText(picture.name,180,78);
        Pictures.draw(c,st.albumPicture,24,109,312,346,true);
        c.font='11px "Noto Sans KR",sans-serif';c.fillStyle='#8E7B69';c.fillText('철판을 걷어내고 찾은 작은 풍경',180,474);
      }else{
        c.fillText(`${st.collection.size}/${PICTURES.length}장 · 완성한 그림을 눌러 크게 봐요`,180,64);
        PICTURES.forEach((p,i)=>{
          const x=24+(i%2)*162,y=88+Math.floor(i/2)*134,unlocked=st.collection.has(p.id);
          round(c,x,y,150,126,16);c.fillStyle=unlocked?'#FFFCF7':'#EAE3DA';c.fill();
          if(st.albumFocus===i){c.strokeStyle='#8B729C';c.lineWidth=2.5;c.stroke();}
          if(unlocked)Pictures.draw(c,i,x+5,y+5,140,96,true);
          else{c.font='700 28px "Noto Sans KR",sans-serif';c.fillStyle='#B7AA9B';c.fillText('?',x+75,y+43);c.font='10px "Noto Sans KR",sans-serif';c.fillText('철판을 모두 떼면 열려요',x+75,y+78);}
          c.font='700 11px "Noto Sans KR",sans-serif';c.fillStyle=unlocked?'#655448':'#A19384';c.fillText(unlocked?p.name:'아직 찾지 못했어요',x+75,y+113);
        });
      }
      round(c,24,494,312,34,13);c.fillStyle='#7F9B87';c.fill();c.fillStyle='#FFFFFF';c.textAlign='center';c.font='700 12px "Noto Sans KR",sans-serif';c.fillText('게임으로 돌아가기',180,511);
    }
    function draw(c) {
      if(st.albumOpen){c.save();drawAlbum(c);c.restore();return;}
      c.save();c.fillStyle='#F7F1E9';c.fillRect(0,0,WIDTH,HEIGHT);c.textBaseline='middle';c.textAlign='left';
      c.font='700 16px "Noto Sans KR",sans-serif';c.fillStyle='#474459';c.fillText(`${st.L}/${LAST_STAGE}단계 · ${st.complete?st.level.name:'숨은 그림'}`,22,26,250);
      round(c,280,8,62,36,13);c.fillStyle='#E2EADF';c.fill();c.font='700 10px "Noto Sans KR",sans-serif';c.fillStyle='#5D7760';c.textAlign='center';c.fillText(`앨범 ${st.collection.size}/${PICTURES.length}`,311,26);
      c.font='12px "Noto Sans KR",sans-serif';c.fillStyle='#786C63';
      c.fillText(st.complete?'완성한 그림을 앨범에 모았어요!':st.selected!==null?'반짝이는 빈 구멍을 눌러 주세요':'나사를 누른 뒤 빈 구멍에 끼워요',180,51);
      round(c,24,68,312,55,18);c.fillStyle='#EAE2D9';c.fill();
      c.font='10px "Noto Sans KR",sans-serif';c.fillStyle='#8B7C6C';c.fillText('옮겨 끼울 빈 구멍',180,78);
      c.textAlign='left';c.font='10px "Noto Sans KR",sans-serif';c.fillStyle='#8E8178';c.fillText('나사를 축으로 회전 · 판과 나사에 걸려요',26,133);
      c.textAlign='right';c.fillText(`${st.level.shape||'철판'} ${st.level.plates.filter(p=>p.state!=='gone').length}조각`,333,133);
      round(c,BOARD.x,BOARD.y,BOARD.w,BOARD.h,30);c.fillStyle='#DED3C7';c.fill();
      c.save();
      if(!st.complete){
        c.beginPath();
        for(const poly of st.level.silhouette){poly.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();}
        c.clip();
      }
      Pictures.draw(c,st.level.picture,32,BOARD.y+8,296,BOARD.h-16,st.complete);c.restore();
      if(!st.complete){
        c.save();round(c,BOARD.x,BOARD.y,BOARD.w,BOARD.h,30);c.clip();
        for(const h of st.level.holes)if(h.owner!==null)drawHole(c,h);
        for(const p of st.level.plates)if(p.state!=='gone')drawPlate(c,p);
        c.restore();
        for(const h of st.level.holes)if(canAccessHole(st.level,h)) {
          if(h.owner===null)drawHole(c,h);
          if(h.screw!==null&&st.pending?.screw!==h.screw)drawScrew(c,h.x,h.y,SCREW_COLOR);
          const target=st.selected!==null&&h.screw===null;
          const selected=h.screw!==null&&st.selected===h.screw;
          if(target||selected||st.focus===h.id) {
            c.beginPath();c.arc(h.x,h.y,target?17+Math.sin(st.t*5)*1.5:18,0,Math.PI*2);c.strokeStyle=target?'#769B82':'#8861AC';c.lineWidth=target?2.5:3;c.stroke();
            if(target){c.fillStyle='#7BAF8C28';c.fill();}
          }
        }
        if(st.pending) {
          const move=st.pending,from=st.level.holes[move.from],to=st.level.holes[move.to],t=clamp(move.time/.5,0,1);
          const flight=clamp((t-.2)/.6,0,1),eased=flight*flight*(3-2*flight);
          drawScrew(c,from.x+(to.x-from.x)*eased,from.y+(to.y-from.y)*eased-Math.sin(t*Math.PI)*24,SCREW_COLOR,t*Math.PI*6,1+Math.sin(t*Math.PI)*.2);
        }
      }
      if(st.complete) {
        c.fillStyle='#87715F';c.font='700 13px "Noto Sans KR",sans-serif';c.textAlign='left';c.fillText(`완성! +${st.L*10}점`,24,515);
        round(c,198,493,138,42,17);c.fillStyle='#7F9B87';c.fill();c.fillStyle='#FFFFFF';c.textAlign='center';c.fillText(st.L===LAST_STAGE?'기록 보기':'다음 그림 →',267,514);
      }else{
        c.textAlign='left';c.font='11px "Noto Sans KR",sans-serif';c.fillStyle='#998A7C';c.fillText(`${st.moves}번 이동`,24,514);c.textAlign='center';
        round(c,258,493,78,42,16);c.fillStyle='#E7DDD1';c.fill();c.fillStyle='#78695E';c.font='700 12px "Noto Sans KR",sans-serif';c.fillText('↻ 다시',297,514);
      }
      if(st.messageTime>0) {
        c.font='700 11px "Noto Sans KR",sans-serif';const w=Math.min(322,c.measureText(st.message).width+26);
        round(c,180-w/2,154,w,36,18);c.fillStyle='#494253E8';c.fill();c.fillStyle='#FFFFFF';c.textAlign='center';c.fillText(st.message,180,172);
      }
      c.restore();
    }
    start(st.L);
    return {state:st,update,draw,
      onDown(x,y,id=0){st.pointers.add(id);if(st.pointers.size!==1){st.down=null;return;}st.down={x,y,id,moved:false};},
      onMove(x,y,id=0){if(st.down?.id===id&&Math.hypot(x-st.down.x,y-st.down.y)>10)st.down.moved=true;},
      onUp(x,y,id=0){st.pointers.delete(id);const down=st.down;st.down=null;if(down&&down.id===id&&!down.moved&&!st.pointers.size&&Math.hypot(x-down.x,y-down.y)<=10)tap(x,y);},
      onCancel(id=0){st.pointers.delete(id);st.down=null;},
      onKey(key){
        if(st.destroyed||st.ended)return false;
        if(key==='a'||key==='A'||key==='ㅁ'){if(st.albumOpen)st.albumOpen=false;else openAlbum();return true;}
        if(st.albumOpen){
          if(key==='Escape'||key==='Backspace'){if(st.albumPicture!==null)st.albumPicture=null;else st.albumOpen=false;return true;}
          if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){
            if(st.albumPicture===null){const delta=key==='ArrowLeft'?-1:key==='ArrowUp'?-2:key==='ArrowDown'?2:1;st.albumFocus=st.albumFocus===null?0:(st.albumFocus+delta+PICTURES.length)%PICTURES.length;}
            return true;
          }
          if(key==='Enter'||key===' '){if(st.albumPicture===null&&st.albumFocus!==null&&st.collection.has(PICTURES[st.albumFocus].id))st.albumPicture=st.albumFocus;return true;}
          return false;
        }
        if(key==='Escape'){st.selected=null;st.focus=null;return true;}
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){
          if(st.pending)return true;
          const visible=st.level.holes.filter(h=>canAccessHole(st.level,h)&&(st.selected===null?h.screw!==null:h.screw===null));if(!visible.length)return true;
          const i=visible.findIndex(h=>h.id===st.focus),delta=key==='ArrowLeft'||key==='ArrowUp'?-1:1;
          st.focus=visible[i<0?(delta>0?0:visible.length-1):(i+delta+visible.length)%visible.length].id;return true;
        }
        if(key==='Enter'||key===' '){if(st.complete)tap(267,514);else{const h=st.level.holes.find(h=>h.id===st.focus);if(h)tap(h.x,h.y);}return true;}
        return false;
      },
      destroy(){st.destroyed=true;st.down=null;st.pointers.clear();st.physics.destroy();}
    };
  }
  function menuHTML() {
    const screw=(x,y,color)=>`<circle cx="${x}" cy="${y}" r="6" fill="${color}" stroke="#647386" stroke-width="1.2"/><path d="M${x-2.5} ${y}h5M${x} ${y-2.5}v5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>`;
    const box=`<svg viewBox="0 0 110 110" aria-hidden="true"><ellipse cx="57" cy="91" rx="39" ry="8" fill="#83634719"/><path d="M18 41L56 20L94 40L55 62Z" fill="#EDC29B"/><path d="M18 41V78L55 100V62Z" fill="#D7A781"/><path d="M55 62L94 40V79L55 100Z" fill="#BA8E78"/><path d="M29 42L58 26L68 32L39 49Z" fill="#CCD7DE"/><path d="M65 61L85 50V64L65 76Z" fill="#C1CDD8"/>${screw(42,37,'#ED7198')}${screw(58,32,'#38AF99')}${screw(72,64,'#668DE1')}${screw(83,58,'#E8AD43')}</svg>`;
    const picture=`<svg viewBox="0 0 110 110" aria-hidden="true"><rect x="6" y="7" width="98" height="96" rx="15" fill="#F4E7D6"/><path d="M47 15L62 15L73 28L75 47H35L37 28Z" fill="#CFDAE4" stroke="#8A9EAF"/><path d="M35 49H75L87 72H24Z" fill="#BABFD4" stroke="#8A9EAF"/><path d="M24 74H87L91 97H20Z" fill="#B6CABF" stroke="#8A9EAF"/>${screw(46,31,'#A3B6C7')}${screw(64,40,'#A3B6C7')}${screw(42,60,'#A3B6C7')}${screw(70,64,'#A3B6C7')}${screw(33,85,'#A3B6C7')}${screw(79,85,'#A3B6C7')}</svg>`;
    return `<div class="gcard screw-choice-card"><span class="screw-choice-kicker">작은 나사, 두 가지 재미</span><h3>어떤 나사를 풀까요?</h3><p class="screw-choice-intro">마음에 드는 게임을 눌러 시작해요.</p><div class="screw-choices"><button type="button" class="screw-choice" data-g="screw-start" data-mode="box"><span class="screw-choice-art">${box}</span><span class="screw-choice-copy"><strong>박스형 나사게임</strong><span>물건을 돌려 보며<br>나사를 풀고 분해해요.</span><b>박스형 시작 →</b></span></button><button type="button" class="screw-choice screw-choice-flat" data-g="screw-start" data-mode="flat"><span class="screw-choice-art">${picture}</span><span class="screw-choice-copy"><strong>평면형 나사게임</strong><span>빈 구멍에 나사를 옮겨<br>철판 아래 그림을 찾아요.</span><b>평면형 시작 →</b></span></button></div><p class="screw-choice-foot">진행 단계는 각각 따로 이어져요.</p></div>`;
  }
  const api={flat,menuHTML,makeFlatLevel,canUnscrew,canAccessHole,bareHole,plateCovers,screwPoint,STAGE_KEY,LAST_STAGE};
  if(typeof window!=='undefined')window.OjjudaScrewGames=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})();
