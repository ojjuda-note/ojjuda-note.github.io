/* Flat screw puzzles: relocate screws to release colliding, gravity-driven metal pieces. */
(function () {
  'use strict';
  const WIDTH = 360, HEIGHT = 540;
  const STAGE_KEY = 'ojjuda-screw-flat-stage-v1';
  const EXTRA_HOLE_X=[45,315,135],PURCHASE_KEYS={flat_hole:'ojjuda-screw-flat-hole-pending-v1',flat_moves:'ojjuda-screw-flat-moves-pending-v1'};
  const moveLimit=level=>Math.max(6,level.plates.length*4+(level.stage<=10?4:0));
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
    for(const v of p.mounts){const r=(p.screwRadius||13)/13;c.save();c.translate(v.x,v.y);c.scale(r,r);oval(c,0,0,13,13,'#718397');oval(c,0,0,10,10,'#506176');oval(c,0,2,7,7,'#65798B');c.restore();}
    c.restore();
  }
  function flat(api) {
    const st={view:{zoom:1,x:180,y:316},L:readStage(),score:0,stageScore:0,t:0,level:null,physics:null,moves:0,selected:null,pending:null,message:'',messageTime:0,complete:false,ended:false,destroyed:false,down:null,pointers:new Set(),focus:null,
      albumOpen:false,albumPicture:null,albumFocus:null,collection:Pictures.readCollection(),extraHoles:0,extraMoves:0,moveLimit:0,shopKind:null,shopBusy:'',shopReady:false,shopRun:0};
    const walletUser=api.getUserId?.()||null,sameWallet=()=>!!walletUser&&api.getUserId?.()===walletUser;
    const tell=text=>{st.message=text;st.messageTime=1.7;};
    const purchaseKey=(L,kind)=>`${PURCHASE_KEYS[kind]}:${walletUser}:${L}`;
    const inBoard=(x,y)=>x>=BOARD.x&&x<=BOARD.x+BOARD.w&&y>=BOARD.y&&y<=BOARD.y+BOARD.h;
    const screenPoint=h=>h.owner===null?{x:h.x,y:h.y}:{x:180+(h.x-st.view.x)*st.view.zoom,y:316+(h.y-st.view.y)*st.view.zoom};
    const visibleHole=h=>h.owner===null||inBoard(screenPoint(h).x,screenPoint(h).y);
    const resetView=()=>{st.view={zoom:1,x:180,y:316};};
    const movesLeft=()=>Math.max(0,st.moveLimit+st.extraMoves-st.moves);
    function pendingPurchase(L,kind){try{const id=localStorage.getItem(purchaseKey(L,kind));return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id||'')?id:null;}catch(_){return null;}}
    function savePurchase(L,kind,id){try{if(id)localStorage.setItem(purchaseKey(L,kind),id);else localStorage.removeItem(purchaseKey(L,kind));return true;}catch(_){return false;}}
    function addHoles(count){
      while(st.extraHoles<count){const h={id:st.level.holes.length,x:EXTRA_HOLE_X[st.extraHoles],y:100,owner:null,screw:null,extra:true};st.level.holes.push(h);st.extraHoles++;}
    }
    function applyUpgrade(kind,count){if(kind==='flat_hole')addHoles(count);else st.extraMoves=Math.max(st.extraMoves,count*3);}
    const validCount=(r,L,kind)=>r?.stage===L&&Number.isSafeInteger(r.count)&&r.count>=0&&(kind==='flat_hole'?r.count<=EXTRA_HOLE_X.length:r.extra_moves===r.count*3&&Number.isSafeInteger(r.extra_moves));
    const currentShop=(L,run)=>!st.destroyed&&st.L===L&&st.shopRun===run&&sameWallet();
    async function readUpgrades(){
      if(st.shopBusy||!sameWallet()||!api.buyScrew)return;
      const L=st.L,run=st.shopRun;st.shopBusy='checking';st.shopReady=false;
      try{
        let ready=true;
        for(const kind of Object.keys(PURCHASE_KEYS)){
          const id=pendingPurchase(L,kind),r=await api.buyScrew(kind,id,L,true);if(!currentShop(L,run))return;
          if(validCount(r,L,kind)&&(r.ok||r.reason==='not_found')){applyUpgrade(kind,r.count);if(r.ok&&id)savePurchase(L,kind,null);}
          else{ready=false;if(['request_conflict','invalid'].includes(r?.reason))savePurchase(L,kind,null);}
        }
        st.shopReady=ready;if(!ready)tell('구매 내역을 다시 확인해 주세요');
      }catch(_){if(currentShop(L,run)){st.shopReady=false;tell('구매 내역을 다시 확인해 주세요');}}
      finally{if(st.shopRun===run)st.shopBusy='';}
    }
    async function buyUpgrade(kind){
      if(st.shopBusy||st.pending||st.complete||st.destroyed||st.level.plates.every(p=>p.state==='gone'))return;
      if(!sameWallet()||!api.buyScrew){tell('로그인 후 구매할 수 있어요');return;}
      if(!st.shopReady){await readUpgrades();return;}
      const hole=kind==='flat_hole';
      if(hole&&st.extraHoles>=EXTRA_HOLE_X.length){tell('이 판에는 최대 3개까지 추가해요');return;}
      const L=st.L,run=st.shopRun,before=hole?st.extraHoles:st.extraMoves;let id=pendingPurchase(L,kind);
      const coins=api.getCoins?.();if(!id&&(!Number.isFinite(coins)||coins<1)){tell(Number.isFinite(coins)?'1 ZU가 필요해요':'ZU 지갑을 확인해 주세요');return;}
      if(!id){id=crypto.randomUUID();if(!savePurchase(L,kind,id)){tell('구매 기록을 저장할 수 없어요');return;}}
      st.shopBusy='buying';st.shopKind=kind;st.selected=null;st.focus=null;
      try{
        const r=await api.buyScrew(kind,id,L,false);if(!currentShop(L,run))return;
        if(validCount(r,L,kind)&&(r.ok||(hole&&r.reason==='limit'))){
          applyUpgrade(kind,r.count);savePurchase(L,kind,null);
          tell(r.reason==='limit'?'이 판에는 최대 3개까지 추가해요':(hole?st.extraHoles:st.extraMoves)>before?(hole?'구멍 1개를 추가했어요':'이동 3회를 추가했어요'):'구매한 내역을 확인했어요');
        }else{
          if(['coins','request_conflict','invalid','banned'].includes(r?.reason))savePurchase(L,kind,null);
          else st.shopReady=false;
          tell(r?.reason==='coins'?'1 ZU가 필요해요':'구매 내역을 확인한 뒤 다시 시도해 주세요');
        }
      }catch(_){if(currentShop(L,run)){st.shopReady=false;tell('구매 내역을 확인한 뒤 다시 시도해 주세요');}}
      finally{if(st.shopRun===run){st.shopBusy='';st.shopKind=null;}}
    }
    function start(L) {
      const keep=L===st.L&&sameWallet(),paid=keep?st.extraHoles:0,extraMoves=keep?st.extraMoves:0;st.shopRun++;st.shopBusy='';st.shopKind=null;st.shopReady=false;st.extraHoles=0;st.extraMoves=extraMoves;
      st.physics?.destroy();st.L=L;st.level=makeFlatLevel(L);st.moveLimit=moveLimit(st.level);st.physics=createPhysics(st.level);st.moves=0;st.selected=null;st.pending=null;
      addHoles(paid);
      resetView();st.complete=false;st.ended=false;st.down=null;st.pointers.clear();st.focus=null;st.stageScore=st.score;st.messageTime=0;
      st.albumOpen=false;st.albumPicture=null;st.albumFocus=null;Pictures.preload(st.level.picture,true);
      if(sameWallet()&&api.buyScrew)void readUpgrades();
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
      if(st.level.plates.length>18&&y>=5&&y<=48&&x>=208&&x<=272){if(st.view.zoom>1)resetView();else{st.view.zoom=Math.max(1.8,13/st.level.screwRadius);tell('확대한 철판을 밀어서 이동해요');}return;}
      if(y>=5&&y<=48&&x>=278&&x<=348){openAlbum();return;}
      if(st.complete) { if(y>=491&&x>=197) { if(st.L===LAST_STAGE){st.ended=true;api.end(st.score);}else start(st.L+1); }return; }
      if(st.shopBusy==='buying')return;
      if(y>=491&&x>=272){st.score=st.stageScore;api.setScore(st.score);start(st.L);tell('이 그림을 처음부터 다시 풀어요');return;}
      if(y>=491&&x>=24&&x<=140){void buyUpgrade('flat_hole');return;}
      if(y>=491&&x>=148&&x<=264){void buyUpgrade('flat_moves');return;}
      if(st.pending)return;
      if(movesLeft()===0){tell('이동을 모두 썼어요. 1 ZU로 3회 추가해요');return;}
      const hits=st.level.holes.filter(visibleHole).map(h=>{const q=screenPoint(h);return{h,d:Math.hypot(q.x-x,q.y-y)};}).filter(hit=>hit.d<=21).sort((a,b)=>a.d-b.d);
      const hit=hits.find(({h})=>canAccessHole(st.level,h));
      if(!hit){if(hits.length)tell('앞의 철판이 가리고 있어요');return;}
      const h=hit.h;
      if(h.screw!==null) {
        st.selected=st.selected===h.screw?null:h.screw;st.focus=null;
        if(st.selected!==null&&!st.level.holes.some(h=>h.screw===null&&canAccessHole(st.level,h)))tell(st.extraHoles<3?'빈 구멍이 없어요. 1 ZU로 구멍을 추가해요':'빈 구멍이 없어요. 다시 시작해 순서를 바꿔요');
        return;
      }
      if(st.selected===null){tell('옮길 나사를 먼저 눌러 주세요');return;}
      const screw=st.level.screws[st.selected];
      if(!canUnscrew(st.level,screw)){st.selected=null;tell('철판이 내려간 뒤 다시 골라 주세요');return;}
      st.pending={screw:screw.id,from:screw.hole.id,to:h.id,time:0};st.selected=null;st.focus=null;
    }
    function update(dt) {
      if(st.destroyed||st.ended||st.albumOpen||st.shopBusy==='buying')return;
      dt=clamp(dt,0,.05);st.t+=dt;st.messageTime=Math.max(0,st.messageTime-dt);
      if(st.complete)return;
      const fallen=st.physics.step(dt);
      if(fallen.length){st.score+=fallen.length*10;api.setScore(st.score);}
      if(st.pending) {
        const move=st.pending;move.time+=dt;
        if(move.time>=.5) {
          const to=st.level.holes[move.to],screw=st.level.screws[move.screw];
          if(movesLeft()>0&&st.physics.move(screw,to))st.moves++;
          else tell('움직인 철판이 가렸어요. 빈 구멍을 다시 골라요');
          st.pending=null;
        }
      }
      if(!st.pending&&st.level.plates.every(p=>p.state==='gone')) {
        resetView();st.complete=true;st.selected=null;st.focus=null;st.score+=st.L*10;api.setScore(st.score);saveStage(Math.min(LAST_STAGE,st.L+1));
        st.collection=Pictures.collect(st.level.picture,st.collection);Pictures.preload((st.level.picture+1)%PICTURES.length);
      }
    }
    function drawHole(c,h,scale=1) {
      c.save();c.translate(h.x,h.y);c.scale(scale,scale);h={x:0,y:0};
      oval(c,h.x,h.y+1,13.5,13.5,'#B8AC9E');oval(c,h.x,h.y,10,10,'#766F6B');oval(c,h.x,h.y+2,7,7,'#A3998C');c.restore();
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
      const remaining=movesLeft(),blocked=!st.complete&&!st.pending&&!st.level.holes.some(h=>h.screw===null&&canAccessHole(st.level,h));
      c.save();c.fillStyle='#F7F1E9';c.fillRect(0,0,WIDTH,HEIGHT);c.textBaseline='middle';c.textAlign='left';
      c.font='700 16px "Noto Sans KR",sans-serif';c.fillStyle='#474459';c.fillText(`${st.L}/${LAST_STAGE}단계 · ${st.complete?st.level.name:'숨은 그림'}`,22,26,st.level.plates.length>18?178:250);
      if(st.level.plates.length>18){round(c,208,8,64,36,13);c.fillStyle='#E5E4EF';c.fill();c.font='700 12px "Noto Sans KR",sans-serif';c.fillStyle='#625778';c.textAlign='center';c.fillText(st.view.zoom>1?'전체 보기':'＋ 확대',240,26);}
      round(c,280,8,62,36,13);c.fillStyle='#E2EADF';c.fill();c.font='700 10px "Noto Sans KR",sans-serif';c.fillStyle='#5D7760';c.textAlign='center';c.fillText(`앨범 ${st.collection.size}/${PICTURES.length}`,311,26);
      const lowMoves=!st.complete&&remaining<=3;
      round(c,74,39,212,29,14);c.fillStyle=lowMoves?'#B74736':'#426E53';c.fill();
      c.font='800 18px "Noto Sans KR",sans-serif';c.fillStyle='#FFFFFF';c.fillText(`남은 이동 ${remaining}회`,180,54,194);
      round(c,24,68,312,55,18);c.fillStyle='#EAE2D9';c.fill();
      c.font='10px "Noto Sans KR",sans-serif';c.fillStyle='#8B7C6C';c.fillText('옮겨 끼울 빈 구멍',180,78);
      c.textAlign='left';c.font='10px "Noto Sans KR",sans-serif';c.fillStyle='#786C63';
      c.fillText(st.complete?'완성한 그림을 앨범에 모았어요!':remaining===0?'아래에서 1 ZU로 이동 3회를 추가해요':blocked?(st.extraHoles<3?'아래에서 1 ZU로 구멍을 추가해요':'빈 구멍이 없어요 · 다시 눌러 재도전해요'):st.selected!==null?'반짝이는 빈 구멍을 눌러 주세요':st.view.zoom>1?'철판을 밀어서 이동 · 나사를 눌러 선택':st.level.plates.length>18?'작은 나사는 위의 확대 버튼으로 골라요':'나사를 누른 뒤 빈 구멍에 끼워요',26,133,226);
      c.fillStyle='#8E8178';
      c.textAlign='right';c.fillText(`${st.level.shape||'철판'} ${st.level.plates.filter(p=>p.state!=='gone').length}조각`,333,133);
      round(c,BOARD.x,BOARD.y,BOARD.w,BOARD.h,30);c.fillStyle='#DED3C7';c.fill();
      const size=(st.level.screwRadius||13)/13;
      c.save();round(c,BOARD.x,BOARD.y,BOARD.w,BOARD.h,30);c.clip();
      c.translate(180,316);c.scale(st.view.zoom,st.view.zoom);c.translate(-st.view.x,-st.view.y);
      c.save();
      if(!st.complete){
        c.beginPath();
        for(const poly of st.level.silhouette){poly.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();}
        c.clip();
      }
      Pictures.draw(c,st.level.picture,32,BOARD.y+8,296,BOARD.h-16,st.complete);c.restore();
      if(!st.complete){
        for(const h of st.level.holes)if(h.owner!==null)drawHole(c,h,size);
        for(const p of st.level.plates)if(p.state!=='gone')drawPlate(c,p);
      }
      c.restore();
      if(!st.complete){
        for(const h of st.level.holes)if(visibleHole(h)&&canAccessHole(st.level,h)) {
          const q=screenPoint(h),scale=h.owner===null?1:size*st.view.zoom;
          c.save();if(h.owner!==null){round(c,BOARD.x,BOARD.y,BOARD.w,BOARD.h,30);c.clip();}
          if(h.owner===null)drawHole(c,q);
          if(h.screw!==null&&st.pending?.screw!==h.screw)drawScrew(c,q.x,q.y,SCREW_COLOR,0,scale);
          const target=st.selected!==null&&h.screw===null,selected=h.screw!==null&&st.selected===h.screw;
          if(target||selected||st.focus===h.id) {
            c.beginPath();c.arc(q.x,q.y,(target?17+Math.sin(st.t*5)*1.5:18)*scale,0,Math.PI*2);c.strokeStyle=target?'#769B82':'#8861AC';c.lineWidth=target?2.5:3;c.stroke();
            if(target){c.fillStyle='#7BAF8C28';c.fill();}
          }
          c.restore();
        }
        if(st.pending) {
          const move=st.pending,from=screenPoint(st.level.holes[move.from]),to=screenPoint(st.level.holes[move.to]),t=clamp(move.time/.5,0,1);
          const flight=clamp((t-.2)/.6,0,1),eased=flight*flight*(3-2*flight);
          drawScrew(c,from.x+(to.x-from.x)*eased,from.y+(to.y-from.y)*eased-Math.sin(t*Math.PI)*24,SCREW_COLOR,t*Math.PI*6,1+Math.sin(t*Math.PI)*.2);
        }
      }
      if(st.complete) {
        c.fillStyle='#87715F';c.font='700 13px "Noto Sans KR",sans-serif';c.textAlign='left';c.fillText(`완성! +${st.L*10}점`,24,515);
        round(c,198,493,138,42,17);c.fillStyle='#7F9B87';c.fill();c.fillStyle='#FFFFFF';c.textAlign='center';c.fillText(st.L===LAST_STAGE?'기록 보기':'다음 그림 →',267,514);
      }else{
        for(const [kind,x] of [['flat_hole',24],['flat_moves',148]]){
          const hole=kind==='flat_hole',full=hole&&st.extraHoles>=EXTRA_HOLE_X.length,ready=sameWallet()&&!full&&!st.shopBusy,urgent=hole?blocked:remaining===0;
          round(c,x,493,116,42,16);c.fillStyle=ready?(urgent?'#C83E4D':'#FFF0F1'):'#F3E8EA';c.fill();c.lineWidth=1;c.strokeStyle=ready?'#EDBDC4':'#DDC7CC';c.stroke();c.textAlign='center';c.fillStyle=ready?(urgent?'#FFFFFF':'#A72E40'):'#93646D';c.font='700 11px "Noto Sans KR",sans-serif';
          c.fillText(st.shopBusy==='buying'&&st.shopKind===kind?'구매 중…':st.shopBusy==='checking'?'내역 확인 중…':full?'구멍 추가 완료':hole?'+ 구멍 1개 · 1 ZU':'+ 이동 3회 · 1 ZU',x+58,507,108);
          c.font='9px "Noto Sans KR",sans-serif';c.fillText(hole?`현재 판 · ${st.extraHoles}/3개 추가`:`현재 판 · ${st.extraMoves}회 추가`,x+58,523,108);
        }
        round(c,272,493,64,42,16);c.fillStyle='#E7DDD1';c.fill();c.fillStyle='#78695E';c.font='700 12px "Noto Sans KR",sans-serif';c.fillText('↻ 다시',304,514);
      }
      if(st.messageTime>0) {
        c.font='700 11px "Noto Sans KR",sans-serif';const w=Math.min(322,c.measureText(st.message).width+26);
        round(c,180-w/2,154,w,36,18);c.fillStyle='#494253E8';c.fill();c.fillStyle='#FFFFFF';c.textAlign='center';c.fillText(st.message,180,172);
      }
      c.restore();
    }
    start(st.L);
    return {state:st,update,draw,screenPoint,
      onDown(x,y,id=0){st.pointers.add(id);if(st.pointers.size!==1){st.down=null;return;}st.down={x,y,id,moved:false,pan:st.view.zoom>1&&inBoard(x,y),view:{...st.view}};},
      onMove(x,y,id=0){
        const down=st.down;if(down?.id!==id||Math.hypot(x-down.x,y-down.y)<=10)return;down.moved=true;
        if(down.pan&&!st.albumOpen&&!st.complete){const {zoom}=down.view;st.view.x=clamp(down.view.x-(x-down.x)/zoom,BOARD.x+BOARD.w/(2*zoom),BOARD.x+BOARD.w-BOARD.w/(2*zoom));st.view.y=clamp(down.view.y-(y-down.y)/zoom,BOARD.y+BOARD.h/(2*zoom),BOARD.y+BOARD.h-BOARD.h/(2*zoom));}
      },
      onUp(x,y,id=0){st.pointers.delete(id);const down=st.down;st.down=null;if(down&&down.id===id&&!down.moved&&!st.pointers.size&&Math.hypot(x-down.x,y-down.y)<=10)tap(x,y);},
      onCancel(id=0){st.pointers.delete(id);st.down=null;},
      onKey(key){
        if(st.destroyed||st.ended)return false;
        if(st.shopBusy==='buying')return true;
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
          const visible=st.level.holes.filter(h=>visibleHole(h)&&canAccessHole(st.level,h)&&(st.selected===null?h.screw!==null:h.screw===null));if(!visible.length)return true;
          const i=visible.findIndex(h=>h.id===st.focus),delta=key==='ArrowLeft'||key==='ArrowUp'?-1:1;
          st.focus=visible[i<0?(delta>0?0:visible.length-1):(i+delta+visible.length)%visible.length].id;return true;
        }
        if(key==='Enter'||key===' '){if(st.complete)tap(267,514);else{const h=st.level.holes.find(h=>h.id===st.focus);if(h){const q=screenPoint(h);tap(q.x,q.y);}}return true;}
        return false;
      },
      destroy(){st.destroyed=true;st.down=null;st.pointers.clear();st.physics.destroy();}
    };
  }
  const menuHTML = typeof module !== 'undefined' && module.exports ? require('./screw-loader.js').menuHTML : window.OjjudaScrewLoader?.menuHTML;
  const api={flat,menuHTML,makeFlatLevel,moveLimit,canUnscrew,canAccessHole,bareHole,plateCovers,screwPoint,STAGE_KEY,LAST_STAGE};
  if(typeof window!=='undefined')window.OjjudaScrewGames=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})();
