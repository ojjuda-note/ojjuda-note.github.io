/* Flat screw puzzles: relocate screws into empty holes to release metal covers. */
(function () {
  'use strict';
  const WIDTH = 360, HEIGHT = 540, LAST_STAGE = 500;
  const STAGE_KEY = 'ojjuda-screw-flat-stage-v1';
  const SCREW_COLOR = '#A3B6C7';
  const THEMES = [
    ['낮잠 고양이', '#FCE9D7', '#FAF3E9'], ['바다 고래', '#D6EDF2', '#F0FAFA'],
    ['달토끼', '#E5E1F6', '#F6F2FD'], ['작은 꽃다발', '#E1EDDD', '#F6F7E9'],
    ['별빛 로켓', '#DDE5F6', '#F2EAF8'], ['숲속 여우', '#F4DDCC', '#F7F1DE']
  ];
  const BOARD = { x: 24, y: 143, w: 312, h: 346 };
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function readStage() {
    try { const n = Number(localStorage.getItem(STAGE_KEY)); return Number.isInteger(n) && n >= 1 && n <= LAST_STAGE ? n : 1; }
    catch (_) { return 1; }
  }
  function saveStage(n) { try { localStorage.setItem(STAGE_KEY, String(n)); } catch (_) { /* A blocked storage area must not interrupt play. */ } }
  function screwPoint(s) { return { x:s.hole.x, y:s.hole.y }; }
  // The same rounded metal outline is used for drawing and obstruction checks.
  function plateCovers(p, x, y, radius = 0) {
    if (p.state === 'gone') return false;
    const co = Math.cos(p.angle), si = Math.sin(p.angle), dx = x - p.x, dy = y - p.y;
    const qx = Math.abs(dx * co + dy * si) - p.w / 2 + p.radius;
    const qy = Math.abs(-dx * si + dy * co) - p.h / 2 + p.radius;
    const distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - p.radius;
    return distance < radius;
  }
  function canAccessHole(level, hole) {
    const owner = hole.owner === null ? null : level.plates[hole.owner];
    const z = owner?.state === 'fixed' ? owner.z : -1;
    // A hole is usable only when the entire screw head clears every cover above it.
    return !level.plates.some(p => p.z > z && plateCovers(p, hole.x, hole.y, 13));
  }
  function canUnscrew(level, s) { return s.hole.screw === s.id && canAccessHole(level, s.hole); }
  // Each upper plate's end holes clear every lower plate. Removing it therefore
  // frees two usable holes, so a top-down solution needs only two spare holes.
  const LAYOUT = [
    [180,260,150,32,0], [180,322,150,32,0], [180,384,150,32,0],
    [242.141,310.716,253.525,30,1.526], [133.768,343.853,265.457,30,-1.904],
    [130.741,301.242,272.29,30,1.764], [244.201,358.726,226.986,30,1.903],
    [243.858,249.996,203.129,30,0.91], [177.57,306.262,280.114,30,2.452],
    [175.997,324.072,271.884,30,0.299], [169.705,365.188,258.739,30,0.292],
    [125.108,321.55,283.744,30,-1.64]
  ];
  function makeFlatLevel(stage) {
    const L = clamp(Math.trunc(stage) || 1, 1, LAST_STAGE);
    const count = L <= 3 ? L + 2 : Math.min(12, 7 + Math.floor((L - 4) / 5));
    const plates = [], holes = [], screws = [];
    for (const x of L <= 3 ? [90,180,270] : [126,234]) holes.push({id:holes.length,x,y:100,owner:null,screw:null});
    for (let z=0; z<count; z++) {
      let [x,y,w,h,angle] = L <= 3 ? [180,197+244*z/(count-1),228,36,0] : LAYOUT[z];
      if (L > 3 && L % 2) { x=360-x; angle=Math.PI-angle; }
      if (L > 3 && Math.floor(L/2) % 2) { y=631-y; angle=-angle; }
      const p={id:z,z,x,y,w,h,radius:12,angle,state:'fixed',holeIds:[],offsets:[-w/2+16,w/2-16],age:0,vy:0,spin:0};
      plates.push(p);
      for (const offset of p.offsets) {
        const hole={id:holes.length,x:x+offset*Math.cos(angle),y:y+offset*Math.sin(angle),owner:z,screw:screws.length};
        holes.push(hole); p.holeIds.push(hole.id);
        screws.push({id:screws.length,hole,startHole:hole.id});
      }
    }
    const level={stage:L,theme:(L-1)%THEMES.length,name:THEMES[(L-1)%THEMES.length][0],plates,holes,screws,solution:[]};
    // Build a legal relocation witness; never discard a screw to solve a stage.
    for (const p of [...plates].reverse()) for (const id of p.holeIds) {
      const source=holes[id], screw=screws[source.screw];
      const target=holes.find(h=>h.screw===null && (h.owner===null || plates[h.owner].state==='gone') && canAccessHole(level,h));
      if (!target || !canUnscrew(level,screw)) throw new Error('Flat puzzle has no legal relocation');
      level.solution.push({screw:screw.id,to:target.id});
      source.screw=null; target.screw=screw.id; screw.hole=target;
      if(p.holeIds.every(h=>holes[h].screw===null))p.state='gone';
    }
    for(const h of holes)h.screw=null;
    for(const s of screws) { s.hole=holes[s.startHole]; s.hole.screw=s.id; }
    for(const p of plates)p.state='fixed';
    return level;
  }
  function round(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function oval(c, x, y, rx, ry, color) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fillStyle = color; c.fill(); }
  function path(c, points, color) { c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fillStyle = color; c.fill(); }
  function line(c, points, color, width = 3) { c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
  function star(c, x, y, r, color) {
    path(c, Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5 - Math.PI / 2, k = i % 2 ? r * 0.43 : r; return [x + Math.cos(a) * k, y + Math.sin(a) * k]; }), color);
  }
  function eyes(c, y, space, dark = '#554D62') {
    oval(c, -space, y, 3.4, 4.5, dark); oval(c, space, y, 3.4, 4.5, dark);
    oval(c, -space - 10, y + 13, 8, 4, '#EFA8AD'); oval(c, space + 10, y + 13, 8, 4, '#EFA8AD');
  }
  function drawPicture(c, theme) {
    const colors = THEMES[theme];
    const top=BOARD.y+8, height=BOARD.h-16;
    c.save(); round(c, 32, top, 296, height, 25); c.clip();
    const bg = c.createLinearGradient(0, top, 0, top+height); bg.addColorStop(0, colors[1]); bg.addColorStop(1, colors[2]);
    c.fillStyle = bg; c.fillRect(32, top, 296, height);
    oval(c, 181, top+height-12, 155, 44, '#FFFFFF6B');
    for (const [x, y, r] of [[67,.13,5],[294,.22,7],[64,.75,6],[286,.85,5],[116,.06,3],[298,.57,3]]) star(c, x, top+y*height, r, '#FFFFFFD9');
    c.translate(180, top+height*.51);
    if (theme === 0 || theme === 5) {
      const fur = theme === 0 ? '#D2A27F' : '#E89358', pale = '#FFF3DE';
      oval(c, 0, 46, 66, 59, fur); oval(c, 0, 56, 42, 41, pale);
      path(c, [[-55,-35],[-54,-94],[-12,-59]], fur); path(c, [[55,-35],[54,-94],[12,-59]], fur);
      path(c, [[-46,-51],[-46,-79],[-24,-59]], '#E8B0A1'); path(c, [[46,-51],[46,-79],[24,-59]], '#E8B0A1');
      oval(c, 0, -23, 65, 54, fur);
      if (theme === 5) { path(c, [[-62,-25],[-37,29],[0,26],[-6,-6]], pale); path(c, [[62,-25],[37,29],[0,26],[6,-6]], pale); }
      else { oval(c, -18, -6, 23, 18, pale); oval(c, 18, -6, 23, 18, pale); }
      eyes(c, -30, 24); path(c, [[-6,-12],[6,-12],[0,-6]], '#775C59');
      line(c, [[0,-5],[0,1],[-7,5]], '#775C59', 2); line(c, [[0,1],[7,5]], '#775C59', 2);
      if (theme === 0) for (const side of [-1,1]) for (const y of [-7,3]) line(c, [[side*35,y],[side*74,y-5]], '#AB7D68', 2);
      oval(c, -39, 91, 21, 12, fur); oval(c, 39, 91, 21, 12, fur);
      star(c, 0, 49, 13, '#EBB857');
    } else if (theme === 1) {
      path(c, [[60,28],[111,-5],[112,37],[137,15],[126,62],[69,56]], '#74BACD');
      oval(c, -9, 28, 86, 62, '#78C1D1'); oval(c, -18, 53, 70, 33, '#C5E8E9');
      oval(c, -43, 18, 4, 5, '#425E73'); oval(c, -56, 30, 11, 5, '#E8B9BC');
      c.beginPath(); c.arc(-29, 27, 13, 0.1, 1.3); c.strokeStyle = '#425E73'; c.lineWidth = 3; c.stroke();
      oval(c, 14, 58, 21, 10, '#60A8C0');
      line(c, [[-30,-37],[-30,-76],[-46,-85]], '#8BBECF', 5); line(c, [[-30,-67],[-14,-83]], '#8BBECF', 5);
      oval(c,-48,-85,5,7,'#8BBECF'); oval(c,-12,-85,5,7,'#8BBECF');
      for (let i = 0; i < 4; i++) line(c, [[-102+i*57,104],[-83+i*57,109],[-65+i*57,104]], '#ABD8DC', 3);
    } else if (theme === 2) {
      oval(c, 62, -61, 38, 38, '#F5D989'); oval(c, 76, -70, 32, 34, colors[1]);
      oval(c, 0, 49, 57, 55, '#FFF8F0');
      oval(c, -26, -69, 19, 56, '#FFF8F0'); oval(c, 26, -69, 19, 56, '#FFF8F0');
      oval(c, -26, -73, 9, 39, '#EEC4CD'); oval(c, 26, -73, 9, 39, '#EEC4CD');
      oval(c, 0, -10, 56, 49, '#FFF8F0'); eyes(c, -15, 20);
      oval(c, 0, -2, 4, 3, '#BD8697'); line(c, [[0,1],[0,6],[-5,10]], '#BD8697', 2); line(c, [[0,6],[5,10]], '#BD8697', 2);
      oval(c,-31,91,22,12,'#FFF8F0'); oval(c,31,91,22,12,'#FFF8F0'); star(c,0,52,22,'#EBC779');
    } else if (theme === 3) {
      const flowers = [[-49,-37,'#E89BB0'],[0,-66,'#F0C16B'],[49,-34,'#B5A2D3'],[-20,9,'#EDB08B'],[31,16,'#F0C16B']];
      for (const [x,y] of flowers) line(c, [[x,y],[0,97]], '#7EAD81', 6);
      oval(c,-31,38,22,10,'#91B18B'); oval(c,29,64,24,10,'#91B18B');
      for (const [x,y,color] of flowers) { for (let k=0;k<6;k++) oval(c,x+Math.cos(k*Math.PI/3)*18,y+Math.sin(k*Math.PI/3)*18,14,14,color); oval(c,x,y,12,12,'#FFF1C2'); }
      path(c,[[-57,34],[57,34],[21,107],[-21,107]],'#D1DABC');
      path(c,[[-6,77],[-42,63],[-31,91]],'#CC8F9D'); path(c,[[6,77],[42,63],[31,91]],'#CC8F9D'); oval(c,0,78,9,8,'#B9768B');
    } else {
      for (const [x,y,r] of [[-77,-68,10],[76,-15,7],[-83,68,6]]) star(c,x,y,r,'#E9BF69');
      path(c,[[-23,57],[0,116],[23,57]],'#F2BF70'); path(c,[[-13,57],[0,94],[13,57]],'#FBE5A8');
      path(c,[[-28,14],[-62,70],[-23,59]],'#D68A9E'); path(c,[[28,14],[62,70],[23,59]],'#D68A9E');
      c.beginPath(); c.moveTo(0,-111); c.bezierCurveTo(48,-76,47,20,29,65); c.lineTo(-29,65); c.bezierCurveTo(-47,20,-48,-76,0,-111); c.fillStyle='#FFF8EC'; c.fill();
      c.beginPath(); c.moveTo(0,-111); c.quadraticCurveTo(25,-91,32,-62); c.quadraticCurveTo(0,-49,-32,-62); c.quadraticCurveTo(-25,-91,0,-111); c.fillStyle='#DA91A4'; c.fill();
      oval(c,0,-17,25,25,'#D8AD7E'); oval(c,0,-17,18,18,'#8AAFD0'); oval(c,-6,-24,6,6,'#CFE4ED');
      round(c,-23,49,46,18,5); c.fillStyle='#93ADB9'; c.fill();
    }
    c.restore();
  }
  function drawScrew(c, x, y, color, rotation = 0, scale = 1) {
    c.save(); c.translate(x,y); c.scale(scale,scale);
    oval(c,0,2,14,14,'#44505B32'); oval(c,0,0,13,13,'#6B798D'); oval(c,0,-1,11.5,11.5,color);
    c.beginPath(); c.arc(0,-1,9.5,Math.PI*1.06,Math.PI*1.88); c.strokeStyle='#FFFFFF92'; c.lineWidth=1.8; c.stroke();
    c.rotate(rotation); line(c,[[-5,0],[5,0]],'#FFFFFFE6',3); line(c,[[0,-5],[0,5]],'#FFFFFFE6',3); c.restore();
  }
  function drawPlate(c, p) {
    c.save(); c.translate(p.x,p.y); c.rotate(p.angle);
    round(c,-p.w/2,-p.h/2+4,p.w,p.h,p.radius); c.fillStyle='#52647F28'; c.fill();
    const metal=c.createLinearGradient(0,-p.h/2,0,p.h/2);
    metal.addColorStop(0,'#E4EAF0'); metal.addColorStop(.18,'#F1F4F6'); metal.addColorStop(.45,'#C3CFD9'); metal.addColorStop(.8,'#ADBDCD'); metal.addColorStop(1,'#97A8BD');
    round(c,-p.w/2,-p.h/2,p.w,p.h,p.radius); c.fillStyle=metal; c.fill(); c.strokeStyle='#899EB2'; c.lineWidth=1.5; c.stroke();
    line(c,[[-p.w/2+14,-p.h/2+5],[p.w/2-14,-p.h/2+5]],'#FFFFFFCF',2);
    for(const offset of p.offsets) { oval(c,offset,0,13,13,'#718397'); oval(c,offset,0,10,10,'#506176'); oval(c,offset,2,7,7,'#65798B'); }
    c.restore();
  }
  function flat(api) {
    const st={L:readStage(),score:0,stageScore:0,t:0,level:null,moves:0,selected:null,pending:null,history:[],message:'',messageTime:0,complete:false,ended:false,destroyed:false,down:null,pointers:new Set(),focus:null};
    const tell=text=>{st.message=text;st.messageTime=1.7;};
    function start(L) {
      st.L=L;st.level=makeFlatLevel(L);st.moves=0;st.selected=null;st.pending=null;st.history=[];
      st.complete=false;st.ended=false;st.down=null;st.pointers.clear();st.focus=null;st.stageScore=st.score;st.messageTime=0;
    }
    function snapshot() {
      return {holes:st.level.holes.map(h=>h.screw),screws:st.level.screws.map(s=>s.hole.id),
        plates:st.level.plates.map(p=>({x:p.x,y:p.y,angle:p.angle,state:p.state,age:p.age,vy:p.vy,spin:p.spin})),score:st.score,moves:st.moves};
    }
    function undo() {
      const previous=st.history.pop();if(!previous){tell('아직 옮긴 나사가 없어요');return;}
      st.level.holes.forEach((h,i)=>h.screw=previous.holes[i]);
      st.level.screws.forEach((s,i)=>s.hole=st.level.holes[previous.screws[i]]);
      st.level.plates.forEach((p,i)=>Object.assign(p,previous.plates[i]));
      st.score=previous.score;st.moves=previous.moves;st.pending=null;st.selected=null;st.focus=null;api.setScore(st.score);tell('한 번 전으로 되돌렸어요');
    }
    function tap(x,y) {
      if(st.destroyed||st.ended)return;
      if(st.complete) { if(y>=491&&x>=197) { if(st.L===LAST_STAGE){st.ended=true;api.end(st.score);}else start(st.L+1); }return; }
      if(y>=491&&x>=258){st.score=st.stageScore;api.setScore(st.score);start(st.L);tell('이 그림을 처음부터 다시 풀어요');return;}
      if(y>=491&&x>=24&&x<=140){undo();return;}
      if(st.pending)return;
      const hits=st.level.holes.map(h=>({h,d:Math.hypot(h.x-x,h.y-y)})).filter(hit=>hit.d<=21).sort((a,b)=>a.d-b.d);
      const hit=hits.find(({h})=>canAccessHole(st.level,h));
      if(!hit){if(hits.length)tell('앞의 철판이 가리고 있어요');return;}
      const h=hit.h;
      if(h.screw!==null) {
        st.selected=st.selected===h.screw?null:h.screw;st.focus=null;
        if(st.selected!==null&&!st.level.holes.some(h=>h.screw===null&&canAccessHole(st.level,h)))tell('빈 구멍이 없어요. 되돌리기로 순서를 바꿔요');
        return;
      }
      if(st.selected===null){tell('옮길 나사를 먼저 눌러 주세요');return;}
      const screw=st.level.screws[st.selected];
      if(!canUnscrew(st.level,screw)){st.selected=null;tell('철판이 내려간 뒤 다시 골라 주세요');return;}
      st.history.push(snapshot());if(st.history.length>100)st.history.shift();
      st.pending={screw:screw.id,from:screw.hole.id,to:h.id,time:0};st.selected=null;st.focus=null;
    }
    function update(dt) {
      if(st.destroyed||st.ended)return;
      dt=clamp(dt,0,.05);st.t+=dt;st.messageTime=Math.max(0,st.messageTime-dt);
      if(st.complete)return;
      for(const p of st.level.plates)if(p.state==='falling') {
        p.age+=dt;p.vy+=950*dt;p.y+=p.vy*dt;p.angle+=p.spin*dt;
        const top=p.y-Math.abs(Math.sin(p.angle))*p.w/2-Math.abs(Math.cos(p.angle))*p.h/2;
        if(top>BOARD.y+BOARD.h+16){p.state='gone';st.score+=10;api.setScore(st.score);}
      }
      if(st.pending) {
        const move=st.pending;move.time+=dt;
        if(move.time>=.5) {
          const from=st.level.holes[move.from],to=st.level.holes[move.to],screw=st.level.screws[move.screw];
          from.screw=null;to.screw=screw.id;screw.hole=to;st.moves++;st.pending=null;
          for(const p of st.level.plates)if(p.state==='fixed'&&p.holeIds.every(id=>st.level.holes[id].screw===null)) {
            p.state='falling';p.vy=80;p.age=0;p.spin=(p.id%2?1:-1)*(.65+(p.id%3)*.2);
          }
        }
      }
      if(!st.pending&&st.level.plates.every(p=>p.state==='gone')) {
        st.complete=true;st.selected=null;st.focus=null;st.score+=st.L*10;api.setScore(st.score);saveStage(Math.min(LAST_STAGE,st.L+1));
      }
    }
    function drawHole(c,h) {
      oval(c,h.x,h.y+1,13.5,13.5,'#B8AC9E');oval(c,h.x,h.y,10,10,'#766F6B');oval(c,h.x,h.y+2,7,7,'#A3998C');
    }
    function draw(c) {
      c.save();c.fillStyle='#F7F1E9';c.fillRect(0,0,WIDTH,HEIGHT);c.textBaseline='middle';c.textAlign='left';
      c.font='700 16px "Noto Sans KR",sans-serif';c.fillStyle='#474459';c.fillText(`${st.L}단계 · ${st.level.name}`,22,26);
      round(c,285,13,53,26,13);c.fillStyle='#E4DDD1';c.fill();c.font='700 11px "Noto Sans KR",sans-serif';c.fillStyle='#716757';c.textAlign='center';c.fillText('평면형',311.5,26);
      c.font='12px "Noto Sans KR",sans-serif';c.fillStyle='#786C63';
      c.fillText(st.complete?'그림을 모두 찾았어요!':st.selected!==null?'반짝이는 빈 구멍을 눌러 주세요':'나사를 누른 뒤 빈 구멍에 끼워요',180,51);
      round(c,24,68,312,55,18);c.fillStyle='#EAE2D9';c.fill();
      c.font='10px "Noto Sans KR",sans-serif';c.fillStyle='#8B7C6C';c.fillText('옮겨 끼울 빈 구멍',180,78);
      c.textAlign='left';c.font='10px "Noto Sans KR",sans-serif';c.fillStyle='#8E8178';c.fillText('철판의 나사를 모두 옮기면 떨어져요',26,133);
      c.textAlign='right';c.fillText(`철판 ${st.level.plates.filter(p=>p.state!=='gone').length}장`,333,133);
      round(c,BOARD.x,BOARD.y,BOARD.w,BOARD.h,30);c.fillStyle='#DED3C7';c.fill();drawPicture(c,st.level.theme);
      c.save();round(c,BOARD.x,BOARD.y,BOARD.w,BOARD.h,30);c.clip();
      for(const h of st.level.holes)if(h.owner!==null&&st.level.plates[h.owner].state!=='fixed')drawHole(c,h);
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
      if(st.complete) {
        c.fillStyle='#87715F';c.font='700 13px "Noto Sans KR",sans-serif';c.textAlign='left';c.fillText(`완성! +${st.L*10}점`,24,515);
        round(c,198,493,138,42,17);c.fillStyle='#7F9B87';c.fill();c.fillStyle='#FFFFFF';c.textAlign='center';c.fillText(st.L===LAST_STAGE?'기록 보기':'다음 그림 →',267,514);
      }else{
        round(c,24,493,116,42,16);c.fillStyle=st.history.length?'#E4DCEC':'#EBE5DE';c.fill();
        c.textAlign='center';c.font='700 12px "Noto Sans KR",sans-serif';c.fillStyle=st.history.length?'#765F8D':'#A99B8D';c.fillText('↶ 되돌리기',82,514);
        c.font='11px "Noto Sans KR",sans-serif';c.fillStyle='#998A7C';c.fillText(`${st.moves}번 이동`,199,514);
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
        if(key==='Escape'){st.selected=null;st.focus=null;return true;}
        if(key==='Backspace'||key==='z'||key==='Z'){if(!st.complete&&!st.destroyed&&!st.ended)undo();return true;}
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)){
          if(st.pending)return true;
          const visible=st.level.holes.filter(h=>canAccessHole(st.level,h)&&(st.selected===null?h.screw!==null:h.screw===null));if(!visible.length)return true;
          const i=visible.findIndex(h=>h.id===st.focus),delta=key==='ArrowLeft'||key==='ArrowUp'?-1:1;
          st.focus=visible[i<0?(delta>0?0:visible.length-1):(i+delta+visible.length)%visible.length].id;return true;
        }
        if(key==='Enter'||key===' '){if(st.complete)tap(267,514);else{const h=st.level.holes.find(h=>h.id===st.focus);if(h)tap(h.x,h.y);}return true;}
        return false;
      },
      destroy(){st.destroyed=true;st.down=null;st.pointers.clear();}
    };
  }
  function menuHTML() {
    const screw=(x,y,color)=>`<circle cx="${x}" cy="${y}" r="6" fill="${color}" stroke="#647386" stroke-width="1.2"/><path d="M${x-2.5} ${y}h5M${x} ${y-2.5}v5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>`;
    const box=`<svg viewBox="0 0 110 110" aria-hidden="true"><ellipse cx="57" cy="91" rx="39" ry="8" fill="#83634719"/><path d="M18 41L56 20L94 40L55 62Z" fill="#EDC29B"/><path d="M18 41V78L55 100V62Z" fill="#D7A781"/><path d="M55 62L94 40V79L55 100Z" fill="#BA8E78"/><path d="M29 42L58 26L68 32L39 49Z" fill="#CCD7DE"/><path d="M65 61L85 50V64L65 76Z" fill="#C1CDD8"/>${screw(42,37,'#ED7198')}${screw(58,32,'#38AF99')}${screw(72,64,'#668DE1')}${screw(83,58,'#E8AD43')}</svg>`;
    const picture=`<svg viewBox="0 0 110 110" aria-hidden="true"><rect x="9" y="12" width="94" height="88" rx="15" fill="#DBE8DF" stroke="#D2CABB" stroke-width="4"/><path d="M30 47L33 25L49 40M62 40L80 26L81 49" fill="#DCAA85"/><ellipse cx="56" cy="61" rx="30" ry="28" fill="#DCAA85"/><circle cx="45" cy="57" r="2.5" fill="#655468"/><circle cx="67" cy="57" r="2.5" fill="#655468"/><path d="M52 66L60 66L56 70Z" fill="#87615E"/><g transform="rotate(-15 56 52)"><rect x="16" y="39" width="81" height="20" rx="7" fill="#CCD6E0" stroke="#95A8BB"/>${screw(27,49,'#A3B6C7')}${screw(84,49,'#A3B6C7')}</g><g transform="rotate(13 55 79)"><rect x="16" y="70" width="79" height="19" rx="7" fill="#CCD6E0" stroke="#95A8BB"/>${screw(28,79,'#A3B6C7')}${screw(83,79,'#A3B6C7')}</g></svg>`;
    return `<div class="gcard screw-choice-card"><span class="screw-choice-kicker">작은 나사, 두 가지 재미</span><h3>어떤 나사를 풀까요?</h3><p class="screw-choice-intro">마음에 드는 게임을 눌러 시작해요.</p><div class="screw-choices"><button type="button" class="screw-choice" data-g="screw-start" data-mode="box"><span class="screw-choice-art">${box}</span><span class="screw-choice-copy"><strong>박스형 나사게임</strong><span>물건을 돌려 보며<br>나사를 풀고 분해해요.</span><b>박스형 시작 →</b></span></button><button type="button" class="screw-choice screw-choice-flat" data-g="screw-start" data-mode="flat"><span class="screw-choice-art">${picture}</span><span class="screw-choice-copy"><strong>평면형 나사게임</strong><span>빈 구멍에 나사를 옮겨<br>철판 아래 그림을 찾아요.</span><b>평면형 시작 →</b></span></button></div><p class="screw-choice-foot">진행 단계는 각각 따로 이어져요.</p></div>`;
  }
  const api={flat,menuHTML,makeFlatLevel,canUnscrew,canAccessHole,plateCovers,screwPoint,STAGE_KEY};
  if(typeof window!=='undefined')window.OjjudaScrewGames=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})();
