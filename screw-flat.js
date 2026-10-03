/* Flat screw puzzles: remove the metal covers to reveal a little picture. */
(function () {
  'use strict';
  const WIDTH = 360, HEIGHT = 540, LAST_STAGE = 500;
  const STAGE_KEY = 'ojjuda-screw-flat-stage-v1';
  const COLORS = ['#ED7198', '#38AF99', '#668DE1', '#E8AD43', '#A184D5', '#EC8E58'];
  const THEMES = [
    ['낮잠 고양이', '#FCE9D7', '#FAF3E9'], ['바다 고래', '#D6EDF2', '#F0FAFA'],
    ['달토끼', '#E5E1F6', '#F6F2FD'], ['작은 꽃다발', '#E1EDDD', '#F6F7E9'],
    ['별빛 로켓', '#DDE5F6', '#F2EAF8'], ['숲속 여우', '#F4DDCC', '#F7F1DE']
  ];
  const BOARD = { x: 24, y: 207, w: 312, h: 282 };
  const trayHole = (box, slot) => ({ x: 52 + box * 160 + slot * 48, y: 86 });
  const bufferHole = slot => ({ x: 66 + slot * 57, y: 159 });
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  function readStage() {
    try { const n = Number(localStorage.getItem(STAGE_KEY)); return Number.isInteger(n) && n >= 1 && n <= LAST_STAGE ? n : 1; }
    catch (_) { return 1; }
  }
  function saveStage(n) { try { localStorage.setItem(STAGE_KEY, String(n)); } catch (_) { /* A blocked storage area must not interrupt play. */ } }
  function screwPoint(s) {
    const p = s.plate, co = Math.cos(p.angle), si = Math.sin(p.angle);
    return { x: p.x + s.offset * co, y: p.y + s.offset * si };
  }
  // The same rounded metal outline is used for drawing and obstruction checks.
  function plateCovers(p, x, y, radius = 0) {
    if (p.state === 'gone') return false;
    const co = Math.cos(p.angle), si = Math.sin(p.angle), dx = x - p.x, dy = y - p.y;
    const qx = Math.abs(dx * co + dy * si) - p.w / 2 + p.radius;
    const qy = Math.abs(-dx * si + dy * co) - p.h / 2 + p.radius;
    const distance = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - p.radius;
    return distance < radius;
  }
  function canUnscrew(level, s) {
    if (s.state !== 'in' || s.plate.state !== 'fixed') return false;
    const q = screwPoint(s);
    // A partly covered screw head is hidden until its whole head is reachable.
    return !level.plates.some(p => p.z > s.plate.z && plateCovers(p, q.x, q.y, 13));
  }
  function makeFlatLevel(stage) {
    const L = clamp(Math.trunc(stage) || 1, 1, LAST_STAGE), random = seeded(31991 + L * 7919);
    const count = L <= 3 ? [4, 6, 8][L - 1] : Math.min(20, 10 + Math.floor((L - 4) / 3));
    const colorCount = L <= 3 ? 2 : Math.min(6, 3 + Math.floor((L - 4) / 6));
    const plates = [], screws = [];
    for (let z = 0; z < count; z++) {
      const row = z % 4, layer = Math.floor(z / 4), diagonal = layer % 3 === 2 || (L === 2 && layer > 0);
      const angle = !layer ? 0 : diagonal ? (row % 2 ? -1 : 1) * (0.55 + random() * 0.14) : (row % 2 ? -1 : 1) * (0.12 + random() * 0.09);
      const w = diagonal ? 226 : 246 - layer * 3 + (random() - 0.5) * 10, h = !layer ? 54 : 46;
      const ex = Math.abs(Math.cos(angle)) * w / 2 + Math.abs(Math.sin(angle)) * h / 2;
      const ey = Math.abs(Math.sin(angle)) * w / 2 + Math.abs(Math.cos(angle)) * h / 2;
      const p = { id: z, z, x: clamp(180 + (layer ? (random() - 0.5) * 20 : 0), 38 + ex, 322 - ex),
        y: clamp(diagonal ? 293 + row * 38 : 244 + row * 66, 217 + ey, 479 - ey),
        w, h, radius: 13, angle, state: 'fixed', screws: [], age: 0, vy: 0, spin: 0 };
      plates.push(p);
      for (const offset of [-w / 2 + 24, 0, w / 2 - 24]) {
        const s = { id: screws.length, plate: p, offset, state: 'in', color: 0, time: 0 };
        screws.push(s); p.screws.push(s);
      }
    }
    const level = { stage: L, theme: (L - 1) % THEMES.length, name: THEMES[(L - 1) % THEMES.length][0], colorCount, plates, screws, queue: [], solution: [] };
    // Construct a legal removal order first, then assign colour triples along it.
    // Every stage therefore has a solution with the two free trays and five slots.
    while (level.solution.length < screws.length) {
      let available = screws.filter(s => canUnscrew(level, s));
      if (!available.length) throw new Error('Flat puzzle has no reachable screw');
      if (L <= 3) { const top = Math.max(...available.map(s => s.plate.z)); available = available.filter(s => s.plate.z === top); }
      const s = available[Math.floor(random() * available.length)];
      level.solution.push(s.id); s.state = 'done';
      if (s.plate.screws.every(pin => pin.state === 'done')) s.plate.state = 'gone';
    }
    for (let i = 0; i < count; i++) {
      const previous = level.queue[i - 1];
      level.queue.push(i < colorCount ? i : (previous + 1 + Math.floor(random() * (colorCount - 1))) % colorCount);
    }
    level.solution.forEach((id, i) => { screws[id].color = level.queue[Math.floor(i / 3)]; });
    for (const p of plates) p.state = 'fixed';
    for (const s of screws) s.state = 'in';
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
    c.save(); round(c, 32, 215, 296, 266, 25); c.clip();
    const bg = c.createLinearGradient(0, 215, 0, 481); bg.addColorStop(0, colors[1]); bg.addColorStop(1, colors[2]);
    c.fillStyle = bg; c.fillRect(32, 215, 296, 266);
    oval(c, 181, 469, 155, 44, '#FFFFFF6B');
    for (const [x, y, r] of [[67,250,5],[294,274,7],[64,415,6],[286,442,5],[116,232,3],[298,367,3]]) star(c, x, y, r, '#FFFFFFD9');
    c.translate(180, 352);
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
    for(const s of p.screws) { oval(c,s.offset,0,13,13,'#718397'); oval(c,s.offset,0,10,10,'#506176'); oval(c,s.offset,2,7,7,'#65798B'); }
    c.restore();
  }
  function flat(api) {
    const st = { L:readStage(), score:0, stageScore:0, t:0, level:null, boxes:[], queueIndex:0, buffer:[], flights:[], message:'', messageTime:0, complete:false, over:0, ended:false, destroyed:false, down:null, pointers:new Set(), focus:null };
    const tell = text => { st.message=text; st.messageTime=1.7; };
    const nextBox = () => st.queueIndex < st.level.queue.length ? {color:st.level.queue[st.queueIndex++],filled:0,reserved:0,closing:0} : null;
    function start(L) {
      st.L=L; st.level=makeFlatLevel(L); st.queueIndex=0; st.boxes=[nextBox(),nextBox()]; st.buffer=Array(5).fill(null); st.flights=[];
      st.complete=false; st.over=0; st.ended=false; st.down=null; st.pointers.clear(); st.focus=null; st.stageScore=st.score; st.messageTime=0;
    }
    const bestBox = color => st.boxes.reduce((best,b,i) => b && !b.closing && b.color===color && b.filled+b.reserved<3 && (best<0 || b.filled+b.reserved>st.boxes[best].filled+st.boxes[best].reserved) ? i : best,-1);
    function reserve(s) {
      const bi=bestBox(s.color);
      if(bi>=0) { const b=st.boxes[bi], target={kind:'box',box:bi,slot:b.filled+b.reserved}; b.reserved++; return target; }
      const slot=st.buffer.indexOf(null); if(slot<0)return null;
      st.buffer[slot]=s; return {kind:'buffer',slot};
    }
    function pullBuffer() {
      st.buffer.forEach((s,slot) => {
        if(!s || s.state!=='buffer')return;
        const bi=bestBox(s.color); if(bi<0)return;
        const b=st.boxes[bi], target={kind:'box',box:bi,slot:b.filled+b.reserved}; b.reserved++;
        const from=bufferHole(slot); st.buffer[slot]=null; s.state='flying'; st.flights.push({s,from,target,time:0});
      });
    }
    function lose() { if(st.over || st.ended || st.complete)return; st.over=1.5; tell('보관 칸이 찼어요. 다시 도전해 봐요'); }
    function tap(x,y) {
      if(st.destroyed || st.ended || st.over)return;
      if(st.complete) { if(y>=491 && x>=197) { if(st.L===LAST_STAGE) { st.ended=true; api.end(st.score); } else start(st.L+1); } return; }
      if(x>=268 && y>=491) { st.score=st.stageScore; api.setScore(st.score); start(st.L); tell('이 그림을 처음부터 다시 풀어요'); return; }
      const candidates=st.level.screws.filter(s=>canUnscrew(st.level,s)).map(s=>({s,q:screwPoint(s)}))
        .filter(({q})=>Math.hypot(q.x-x,q.y-y)<=22).sort((a,b)=>Math.hypot(a.q.x-x,a.q.y-y)-Math.hypot(b.q.x-x,b.q.y-y));
      const hit=candidates[0];
      if(!hit) { if(st.level.screws.some(s=>s.state==='in' && Math.hypot(screwPoint(s).x-x,screwPoint(s).y-y)<18))tell('앞의 철판을 먼저 떨어뜨려 주세요'); return; }
      const target=reserve(hit.s);
      if(!target) {
        if(st.flights.length || st.level.screws.some(s=>s.state==='unscrewing') || st.boxes.some(b=>b?.closing))tell('나사가 정리되면 다시 눌러 주세요');
        else lose();
        return;
      }
      hit.s.state='unscrewing'; hit.s.time=0; hit.s.target=target; st.focus=null;
    }
    function update(dt) {
      if(st.destroyed || st.ended)return;
      dt=clamp(dt,0,.05); st.t+=dt; st.messageTime=Math.max(0,st.messageTime-dt);
      if(st.over) { st.over-=dt; if(st.over<=0) { st.ended=true; api.end(st.score); } return; }
      if(st.complete)return;
      for(const p of st.level.plates) if(p.state==='falling') {
        p.age+=dt; p.vy+=950*dt; p.y+=p.vy*dt; p.angle+=p.spin*dt;
        const top=p.y-Math.abs(Math.sin(p.angle))*p.w/2-Math.abs(Math.cos(p.angle))*p.h/2;
        if(top>BOARD.y+BOARD.h+16)p.state='gone';
      }
      for(const s of st.level.screws) if(s.state==='unscrewing') {
        s.time+=dt; if(s.time<.24)continue;
        const from=screwPoint(s); s.state='flying'; st.flights.push({s,from,target:s.target,time:0});
        const p=s.plate;
        if(p.screws.every(pin=>pin.state!=='in' && pin.state!=='unscrewing')) {
          p.state='falling'; p.vy=80; p.age=0; p.spin=(p.id%2?1:-1)*(.65+(p.id%3)*.2);
        }
      }
      for(const f of st.flights) {
        f.time+=dt; if(f.time<.36)continue;
        if(f.target.kind==='box') { const b=st.boxes[f.target.box]; b.reserved--; b.filled++; f.s.state='done'; st.score++; api.setScore(st.score); if(b.filled===3)b.closing=.001; }
        else f.s.state='buffer';
      }
      st.flights=st.flights.filter(f=>f.time<.36);
      for(let i=0;i<st.boxes.length;i++) { const b=st.boxes[i]; if(b?.closing) { b.closing+=dt; if(b.closing>=.28)st.boxes[i]=nextBox(); } }
      pullBuffer();
      const busy=st.flights.length || st.boxes.some(b=>b?.closing) || st.level.screws.some(s=>s.state==='unscrewing');
      if(!busy && st.level.screws.every(s=>s.state==='done') && st.level.plates.every(p=>p.state==='gone')) {
        st.complete=true; st.score+=st.L*10; api.setScore(st.score); saveStage(Math.min(LAST_STAGE,st.L+1));
      } else if(!busy && st.level.screws.every(s=>s.state!=='in') && st.buffer.some(Boolean)) lose();
    }
    function draw(c) {
      c.save(); c.fillStyle='#F7F1E9'; c.fillRect(0,0,WIDTH,HEIGHT); c.textBaseline='middle'; c.textAlign='left';
      c.font='700 16px "Noto Sans KR",sans-serif'; c.fillStyle='#474459'; c.fillText(`${st.L}단계 · ${st.level.name}`,22,26);
      round(c,285,13,53,26,13); c.fillStyle='#E4DDD1'; c.fill(); c.font='700 11px "Noto Sans KR",sans-serif'; c.fillStyle='#716757'; c.textAlign='center'; c.fillText('평면형',311.5,26);
      st.boxes.forEach((b,i) => {
        const x=24+i*160; c.save(); if(b?.closing)c.globalAlpha=1-b.closing/.28;
        round(c,x,52,152,57,15); c.fillStyle=b?`${COLORS[b.color]}22`:'#E8E4DE'; c.fill(); c.lineWidth=2; c.strokeStyle=b?`${COLORS[b.color]}A0`:'#D8D3CC'; c.stroke();
        for(let slot=0;slot<3;slot++) { const q=trayHole(i,slot); oval(c,q.x,q.y,13.5,13.5,b?`${COLORS[b.color]}33`:'#D5D1CA'); if(b && slot<b.filled)drawScrew(c,q.x,q.y,COLORS[b.color]); }
        c.font='700 9px "Noto Sans KR",sans-serif'; c.fillStyle=b?'#7B7180':'#ABA396'; c.fillText(b?'같은 색 3개':'정리 완료',x+76,63); c.restore();
      });
      round(c,24,120,312,58,19); c.fillStyle='#EAE2D9'; c.fill(); c.fillStyle='#8C7D70'; c.font='11px "Noto Sans KR",sans-serif'; c.fillText('잠깐 보관',180,133);
      st.buffer.forEach((s,i) => { const q=bufferHole(i); oval(c,q.x,q.y,13,13,'#D4C7BB'); if(s?.state==='buffer')drawScrew(c,q.x,q.y,COLORS[s.color]); });
      c.textAlign='left'; c.font='11px "Noto Sans KR",sans-serif'; c.fillStyle='#8E8178';
      c.fillText(st.complete?'그림을 모두 찾았어요!':'나사를 풀어 철판을 떨어뜨려요',26,193);
      c.textAlign='right'; c.fillText(`철판 ${st.level.plates.filter(p=>p.state!=='gone').length}장`,333,193);
      round(c,BOARD.x,BOARD.y,BOARD.w,BOARD.h,30); c.fillStyle='#DED3C7'; c.fill();
      drawPicture(c,st.level.theme);
      c.save(); round(c,BOARD.x,BOARD.y,BOARD.w,BOARD.h,30); c.clip();
      for(const p of st.level.plates) if(p.state!=='gone') {
        drawPlate(c,p);
        for(const s of p.screws) if(s.state==='unscrewing' || canUnscrew(st.level,s)) {
          const q=screwPoint(s), turning=s.state==='unscrewing';
          if(st.focus===s.id) { c.beginPath(); c.arc(q.x,q.y,19,0,Math.PI*2); c.strokeStyle='#665779'; c.lineWidth=2; c.stroke(); }
          drawScrew(c,q.x,q.y-(turning?s.time*13:0),COLORS[s.color],turning?s.time*26:0,turning?1+s.time*.7:1);
        }
      }
      c.restore();
      for(const f of st.flights) {
        const t=clamp(f.time/.36,0,1), eased=1-Math.pow(1-t,3), q=f.target.kind==='box'?trayHole(f.target.box,f.target.slot):bufferHole(f.target.slot);
        drawScrew(c,f.from.x+(q.x-f.from.x)*eased,f.from.y+(q.y-f.from.y)*eased-Math.sin(t*Math.PI)*28,COLORS[f.s.color],t*8,1+Math.sin(t*Math.PI)*.2);
      }
      if(st.complete) {
        c.fillStyle='#87715F'; c.font='700 13px "Noto Sans KR",sans-serif'; c.textAlign='left'; c.fillText(`완성! +${st.L*10}점`,24,515);
        round(c,198,493,138,42,17); c.fillStyle='#7F9B87'; c.fill(); c.fillStyle='#FFFFFF'; c.textAlign='center'; c.fillText(st.L===LAST_STAGE?'기록 보기':'다음 그림 →',267,514);
      } else {
        c.textAlign='left'; c.font='11px "Noto Sans KR",sans-serif'; c.fillStyle='#998A7C'; c.fillText(st.L<=3?'같은 색을 차근차근 모아 봐요':'겹친 철판과 상자 색을 살펴보세요',24,515);
        round(c,270,493,66,42,16); c.fillStyle='#E7DDD1'; c.fill(); c.textAlign='center'; c.fillStyle='#78695E'; c.font='700 12px "Noto Sans KR",sans-serif'; c.fillText('↻ 다시',303,514);
      }
      if(st.messageTime>0) {
        c.font='700 12px "Noto Sans KR",sans-serif'; const w=Math.min(322,c.measureText(st.message).width+26);
        round(c,180-w/2,218,w,36,18); c.fillStyle='#494253E8'; c.fill(); c.fillStyle='#FFFFFF'; c.textAlign='center'; c.fillText(st.message,180,236);
      }
      c.restore();
    }
    start(st.L);
    return { state:st, update, draw,
      onDown(x,y,id=0) { st.pointers.add(id); if(st.pointers.size!==1) { st.down=null; return; } st.down={x,y,id,moved:false}; },
      onMove(x,y,id=0) { if(st.down?.id===id && Math.hypot(x-st.down.x,y-st.down.y)>10)st.down.moved=true; },
      onUp(x,y,id=0) { st.pointers.delete(id); const down=st.down; st.down=null; if(down && down.id===id && !down.moved && !st.pointers.size && Math.hypot(x-down.x,y-down.y)<=10)tap(x,y); },
      onCancel(id=0) { st.pointers.delete(id); st.down=null; },
      onKey(key) {
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)) {
          const visible=st.level.screws.filter(s=>canUnscrew(st.level,s)); if(!visible.length)return true;
          const i=visible.findIndex(s=>s.id===st.focus), delta=key==='ArrowLeft'||key==='ArrowUp'?-1:1;
          st.focus=visible[i<0?(delta>0?0:visible.length-1):(i+delta+visible.length)%visible.length].id; return true;
        }
        if(key==='Enter'||key===' ') { if(st.complete)tap(267,514); else { const s=st.level.screws.find(s=>s.id===st.focus); if(s) { const q=screwPoint(s); tap(q.x,q.y); } } return true; }
        return false;
      },
      destroy() { st.destroyed=true; st.down=null; st.pointers.clear(); }
    };
  }
  function menuHTML() {
    const screw=(x,y,color)=>`<circle cx="${x}" cy="${y}" r="6" fill="${color}" stroke="#647386" stroke-width="1.2"/><path d="M${x-2.5} ${y}h5M${x} ${y-2.5}v5" stroke="white" stroke-width="1.5" stroke-linecap="round"/>`;
    const box=`<svg viewBox="0 0 110 110" aria-hidden="true"><ellipse cx="57" cy="91" rx="39" ry="8" fill="#83634719"/><path d="M18 41L56 20L94 40L55 62Z" fill="#EDC29B"/><path d="M18 41V78L55 100V62Z" fill="#D7A781"/><path d="M55 62L94 40V79L55 100Z" fill="#BA8E78"/><path d="M29 42L58 26L68 32L39 49Z" fill="#CCD7DE"/><path d="M65 61L85 50V64L65 76Z" fill="#C1CDD8"/>${screw(42,37,'#ED7198')}${screw(58,32,'#38AF99')}${screw(72,64,'#668DE1')}${screw(83,58,'#E8AD43')}</svg>`;
    const picture=`<svg viewBox="0 0 110 110" aria-hidden="true"><rect x="9" y="12" width="94" height="88" rx="15" fill="#DBE8DF" stroke="#D2CABB" stroke-width="4"/><path d="M30 47L33 25L49 40M62 40L80 26L81 49" fill="#DCAA85"/><ellipse cx="56" cy="61" rx="30" ry="28" fill="#DCAA85"/><circle cx="45" cy="57" r="2.5" fill="#655468"/><circle cx="67" cy="57" r="2.5" fill="#655468"/><path d="M52 66L60 66L56 70Z" fill="#87615E"/><g transform="rotate(-15 56 52)"><rect x="16" y="39" width="81" height="20" rx="7" fill="#CCD6E0" stroke="#95A8BB"/>${screw(27,49,'#ED7198')}${screw(84,49,'#38AF99')}</g><g transform="rotate(13 55 79)"><rect x="16" y="70" width="79" height="19" rx="7" fill="#CCD6E0" stroke="#95A8BB"/>${screw(28,79,'#668DE1')}${screw(83,79,'#E8AD43')}</g></svg>`;
    return `<div class="gcard screw-choice-card"><span class="screw-choice-kicker">작은 나사, 두 가지 재미</span><h3>어떤 나사를 풀까요?</h3><p class="screw-choice-intro">마음에 드는 게임을 눌러 시작해요.</p><div class="screw-choices"><button type="button" class="screw-choice" data-g="screw-start" data-mode="box"><span class="screw-choice-art">${box}</span><span class="screw-choice-copy"><strong>박스형 나사게임</strong><span>물건을 돌려 보며<br>나사를 풀고 분해해요.</span><b>박스형 시작 →</b></span></button><button type="button" class="screw-choice screw-choice-flat" data-g="screw-start" data-mode="flat"><span class="screw-choice-art">${picture}</span><span class="screw-choice-copy"><strong>평면형 나사게임</strong><span>철판을 떨어뜨려<br>숨어 있는 그림을 찾아요.</span><b>평면형 시작 →</b></span></button></div><p class="screw-choice-foot">진행 단계는 각각 따로 이어져요.</p></div>`;
  }
  const api={flat,menuHTML,makeFlatLevel,canUnscrew,plateCovers,screwPoint,STAGE_KEY};
  if(typeof window!=='undefined')window.OjjudaScrewGames=api;
  if(typeof module!=='undefined' && module.exports)module.exports=api;
})();
