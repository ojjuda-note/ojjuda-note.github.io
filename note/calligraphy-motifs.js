// Original ink studies for Park cards. Coordinates below are brush units on a 100-unit square.
(() => {
  'use strict';
  const vocabulary = {
    blossom: '매화 매화꽃 매화나무 꽃 꽃밭 꽃무리 꽃가지 꽃향기 꽃봉오리 꽃잎 꽃송이 꽃망울 꽃다발 들꽃 봄꽃 봄 봄날 고마움',
    mountain: '산 산길 산속 산골 산자락 산마루 산등성이 산봉우리 산맥 봉우리',
    bamboo: '대나무 대숲 댓잎 죽림 죽순',
    moon: '달 달빛 달밤 보름달 달무리',
    crescent: '초승달'
  };
  const nouns = Object.entries(vocabulary).flatMap(([id, words]) => words.split(' ').map(word => ({id, word})))
    .sort((a, b) => b.word.length - a.word.length);
  const suffix = /^(?:들)?(?:에서부터|으로부터|한테서|에게서|에서는|에서도|으로는|으로도|에게는|에게도|이랑|이여|이야|이며|이라|이란|이다|입니다|처럼|같이|만큼|부터|까지|마다|조차|마저|밖에|에서|에게|한테|으로|로서|로써|이든|하고|에는|에도|로는|로도|이라도|이라서|이라면|은|는|이|가|을|를|에|의|로|와|과|도|만|랑|야|아|여)?$/u;
  const thanks = /^(?:고마워(?:요|서|라)?|고맙(?:다|습니다|네요|구나|소)|고마웠(?:다|어|어(?:요|서)|습니다)|감사(?:해요|합니다|드려요|드립니다))$/u;
  const normalize = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ');
  function subjects(text) {
    const result = [];
    for (const match of text.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
      const token = match[0];
      const noun = nouns.find(({word}) => token.startsWith(word) && suffix.test(token.slice(word.length)));
      if (noun?.word === '달' &&
          /(?:^|[^\p{L}\p{N}])(?:한|두|세|석|네|넉|다섯|여섯|몇|여러|이번|다음|지난|매|반|[0-9]+)\s+$/u.test(text.slice(0,match.index))) continue;
      if (token === '산' &&
          /^\s+(?:신발|물건|옷|책|가방|자동차|집|주식|제품|선물|과일|채소)(?:[은는이가을를의에도만]|[\s\p{P}]|$)/u.test(text.slice(match.index+token.length))) continue;
      if (noun || thanks.test(token)) {
        result.push({id: noun?.id ?? 'blossom', start: match.index, end: match.index + token.length});
      }
    }
    return result;
  }
  function choose(body, tags = []) {
    const text = normalize(body), available = subjects(text);
    if (available.length < 2 || !Array.isArray(tags)) return available[0]?.id;
    for (const item of tags) {
      if (typeof item !== 'string') continue;
      const tag = normalize(item).replace(/^#+/u, '').trim();
      const tagged = subjects(tag);
      if (!tagged.length) continue;
      for (let at = text.indexOf(tag); at >= 0; at = text.indexOf(tag, at + 1)) {
        const found = available.find(candidate => tagged.some(subject =>
          candidate.start <= at + subject.start && at + subject.end <= candidate.end));
        if (found) return found.id;
      }
    }
    return available[0]?.id;
  }

  const rgba = (rgb, a) => 'rgba(' + rgb.join(',') + ',' + a + ')';
  const mix = (a, b, fraction) => a.map((v, i) => Math.round(v * (1 - fraction) + b[i] * fraction));

  // Follow the brush's center line. The third coordinate is its loaded width,
  // so a branch retains its elbow and each leaf comes off the paper in a point.
  function brush(c, marks, color, opacity = 1) {
    const points = [];
    for (let n = 0; n < marks.length - 1; n++) {
      const a = marks[Math.max(0,n-1)], b = marks[n], d = marks[n+1], e = marks[Math.min(n+2,marks.length-1)];
      for (let j = 0; j < 5; j++) {
        const t = j / 5, t2 = t * t, t3 = t2 * t;
        points.push(b.map((v, k) => .5 * ((2*v) + (-a[k]+d[k])*t
          + (2*a[k]-5*v+4*d[k]-e[k])*t2 + (-a[k]+3*v-3*d[k]+e[k])*t3)));
      }
    }
    points.push(marks[marks.length - 1]);
    const left = [], right = [];
    for (let i = 0; i < points.length; i++) {
      const [x,y,width] = points[i], p = points[Math.max(0,i-1)], q = points[Math.min(i+1,points.length-1)];
      const dx = q[0]-p[0], dy = q[1]-p[1], half = Math.max(.05,width) / (2*(Math.hypot(dx,dy)||1));
      left.push([x-dy*half,y+dx*half]);
      right.push([x+dy*half,y-dx*half]);
    }
    c.fillStyle = rgba(color, opacity);
    c.beginPath();
    c.moveTo(...left[0]);
    for (let i = 1; i < left.length; i++) c.lineTo(...left[i]);
    for (let i = right.length - 1; i >= 0; i--) c.lineTo(...right[i]);
    c.closePath(); c.fill();
  }
  function petal(c, x, y, rotation, w, h, color, strength) {
    c.save(); c.translate(x,y); c.rotate(rotation); c.scale(w,h);
    const ink = c.createLinearGradient(.3,-1,-.18,0);
    ink.addColorStop(0,rgba(color,strength*.70));
    ink.addColorStop(.42,rgba(color,strength*.35));
    ink.addColorStop(1,rgba(color,strength));
    c.fillStyle = ink; c.beginPath(); c.moveTo(0,0);
    c.bezierCurveTo(-.32,-.14,-.97,-.63,-.63,-.93);
    c.bezierCurveTo(-.5,-1.08,-.2,-.98,-.06,-1.02);
    c.bezierCurveTo(.32,-1.15,.71,-.93,.65,-.70);
    c.bezierCurveTo(.62,-.43,.25,-.13,0,0);
    c.fill(); c.restore();
  }
  function blossom(c, ink) {
    const bark = mix(ink,[109,82,60],.12);
    const paleBase = (ink[0]+ink[1]+ink[2]) / 3 > 145;
    const red = mix(ink, paleBase ? [250,169,166] : [164,53,66], paleBase ? .59 : .80);
    brush(c,[[9,90,1.8],[16,77,4.9],[26,66,4.3],[34,57,3.8],[44,55,3.1],[54,44,2.3],[68,37,1.5],[79,27,.65],[88,24,.12]],bark,.91);
    brush(c,[[12,89,.2],[17,79,1.15],[27,68,1.6],[34,61,.65]],bark,.55);
    brush(c,[[23,70,2],[21,59,2.5],[23,53,.85],[24,44,1.3],[21,34,.25]],bark,.76);
    brush(c,[[33,59,2.5],[41,44,2.7],[42,34,1.4],[50,22,.9],[50,15,.15]],bark,.81);
    brush(c,[[42,38,1.3],[37,30,1.15],[36,24,.25]],bark,.68);
    brush(c,[[56,44,1.3],[63,46,1.05],[73,44,.2]],bark,.74);
    brush(c,[[69,36,1.2],[68,25,.8],[72,20,.18]],bark,.70);
    brush(c,[[52,48,1.15],[59,38,1.05],[61,32,.15]],bark,.70);
    function flower(x,y,scale,turn,side) {
      c.save(); c.translate(x,y); c.rotate(turn); c.scale(scale,scale*(side ? .72 : 1));
      const rotations = [-.51,.76,2.02,3.28,4.53];
      for (let i=0;i<(side ? 4 : rotations.length);i++) {
        const a = rotations[i], length = [6.8,7.2,6.4,6.6,7.4][i];
        petal(c,Math.sin(a)*.65,-Math.cos(a)*.65,a,4.95,length,red,[.80,.7,.92,.68,.82][i]);
      }
      for(const [x1,y1] of [[-2.0,-1.9],[.1,-3.1],[2.2,-1.2],[1.7,1.1]]) {
        brush(c,[[0,.5,.46],[x1*.65,y1*.6,.33],[x1,y1,.14]],bark,.76);
        c.fillStyle = rgba(bark,.96); c.beginPath(); c.ellipse(x1,y1,.58,.72,.5,0,Math.PI*2); c.fill();
      }
      c.restore();
    }
    flower(46,32,1.24,-.34,false);
    flower(60.5,34,.72,.46,true);
    flower(74,29,1.11,.61,false);
    flower(25,45,.68,-.5,true);
    for (const [x,y,angle,r] of [[48,19,-.4,4],[37,27,-.35,3.1],[84,25,.98,3.2],[70,22,.14,2.6],[71,44,1.1,2.4]]) {
      petal(c,x,y,angle,r*.69,r*1.18,red,.95);
      brush(c,[[x-1.3,y-1,.2],[x,y,1.8],[x+1.1,y-.7,.3]],bark,.91);
    }
  }
  function mountain(c,ink) {
    function ridge(contour,base,pool,center) {
      const top = Math.min(...contour.map(p=>p[1]));
      // A radial wash runs out toward both flanks and the foot. Its enclosing
      // polygon stays outside the painted region, leaving open mist around it.
      const radiusX = Math.min(center-contour[0][0],contour.at(-1)[0]-center);
      const middle = top + (base-top)*.14, radiusY=base-middle;
      c.save(); c.translate(center,middle); c.scale(radiusX,radiusY);
      const wash = c.createRadialGradient(0,0,.03,0,0,1);
      wash.addColorStop(0,rgba(ink,pool)); wash.addColorStop(.40,rgba(ink,pool*.79));
      wash.addColorStop(.69,rgba(ink,pool*.40)); wash.addColorStop(.89,rgba(ink,pool*.09));
      wash.addColorStop(1,rgba(ink,0)); c.fillStyle=wash;
      const xy = ([x,y]) => [(x-center)/radiusX,(y-middle)/radiusY];
      c.beginPath(); c.moveTo(...xy([contour[0][0],base])); c.lineTo(...xy(contour[0]));
      for(let i=1;i<contour.length-1;i++){
        const [x,y]=contour[i], next=contour[i+1];
        c.quadraticCurveTo(...xy(contour[i]),...xy([x*.72+next[0]*.28,y*.72+next[1]*.28]));
      }
      c.lineTo(...xy(contour.at(-1))); c.lineTo(...xy([contour.at(-1)[0],base]));
      c.closePath(); c.fill(); c.restore();
    }
    ridge([[3,54],[14,46],[19,43],[24,44],[31,36],[38,37],[46,29],[52,30],[59,22],[63,26],[69,34],[74,35],[78,33],[84,40],[96,46]],66,.32,55);
    ridge([[1,65],[12,56],[18,51],[25,52],[34,42],[39,40],[46,29],[49,34],[54,44],[59,48],[65,43],[72,45],[78,53],[89,58],[98,63]],78,.72,46);
    ridge([[18,75],[29,69],[40,68],[46,62],[52,63],[58,59],[65,57],[72,49],[77,46],[82,52],[88,55],[94,61],[99,64]],81,.64,70);
    brush(c,[[25,52,.2],[33,45,1.9],[38,40,1.5],[40,40,.16],[46,30,.55]],ink,.69);
    brush(c,[[44,35,.35],[42,41,1.4],[37,46,1.3],[35,51,.3],[31,54,.12]],ink,.46);
    brush(c,[[50,39,.14],[52,45,1.3],[56,51,.9],[56,54,.15]],ink,.30);
    brush(c,[[54,61,.1],[63,58,1.1],[70,52,1.4],[75,49,.2]],ink,.62);
    brush(c,[[78,48,.12],[75,55,1.4],[69,59,1.15],[65,66,.16]],ink,.40);
    // Broken, narrow axe-cut marks give the nearer face a grain.
    brush(c,[[40,42,.12],[37,47,1.8],[33,51,.65],[30,56,.12]],ink,.27);
    brush(c,[[47,36,.12],[45,43,.95],[44,47,.17]],ink,.28);
    brush(c,[[46,43,.12],[43,48,1.0],[42,52,.14]],ink,.22);
    brush(c,[[72,54,.1],[70,59,.95],[66,63,.45],[64,65,.1]],ink,.35);
    brush(c,[[78,51,.1],[76,56,.8],[74,59,.14]],ink,.29);
    brush(c,[[4,72,.1],[16,71,.85],[22,71,.48],[28,70,.1]],ink,.21);
    brush(c,[[21,78,.12],[35,77,.75],[45,75,.2]],ink,.18);
  }
  function bamboo(c,ink) {
    // The rear culm is a light wash; the facing culm and leaves hold the dark accents.
    brush(c,[[34,89,1.5],[41,65,1.9],[48,42,1.25],[55,17,.3]],ink,.26);
    brush(c,[[45,52,.8],[36,41,.6],[28,35,.18]],ink,.27);
    brush(c,[[50,38,.75],[64,29,.55],[75,22,.12]],ink,.28);
    function leaf(x,y,cx,cy,tx,ty,w,a) {
      brush(c,[[x,y,.25],[x*.5+cx*.5,y*.5+cy*.5,w*.8],[cx,cy,w],[cx*.48+tx*.52,cy*.48+ty*.52,w*.56],[tx,ty,.06]],ink,a);
    }
    leaf(38,43,28,39,17,31,3.8,.28);
    leaf(32,38,25,31,22,23,3.2,.26);
    leaf(35,40,26,43,17,45,3.1,.23);
    leaf(61,31,66,24,69,14,3.1,.30);
    leaf(65,28,75,25,85,18,3.4,.26);
    brush(c,[[19,92,2.8],[26,81,3.0],[34.5,66.3,2.4]],ink,.77);
    brush(c,[[34.8,65.7,2.8],[41,52,2.45],[47,37,1.7]],ink,.84);
    brush(c,[[47.3,36.3,2.2],[52,24,1.7],[54,11,.55]],ink,.83);
    brush(c,[[32.5,66,.5],[34.1,65.3,2.7],[36.1,66.9,.6]],ink,.94);
    brush(c,[[45.5,36.8,.4],[47.6,36.4,2.4],[49.3,36.9,.38]],ink,.92);
    brush(c,[[35,65.7,1.2],[45,60,1.4],[54,52,.85],[65,48,.2]],ink,.82);
    brush(c,[[48,36.7,1.1],[58,37,.95],[67,33,.3]],ink,.76);
    brush(c,[[42,61,1],[34,56,.72],[24,55,.25]],ink,.76);
    leaf(45,60,51,63,62,70,4.8,.88);
    leaf(49,56,54,46,55,36,4.2,.88);
    leaf(51,55,64,55,80,59,5.7,.91);
    leaf(58,51,68,45,78,38,4.0,.73);
    leaf(60,50,70,51,84,48,3.3,.78);
    leaf(57,37,62,28,68,19,4.1,.84);
    leaf(60,36,71,37,85,32,4.5,.92);
    leaf(40,60,31,62,20,70,4.25,.84);
    leaf(34,56,24,51,13,45,3.4,.83);
  }
  function moon(c,ink,crescent) {
    const g=c.createLinearGradient(42,23,69,61);
    g.addColorStop(0,rgba(ink,crescent ? .83 : .21));
    g.addColorStop(.53,rgba(ink,crescent ? .6 : .10));
    g.addColorStop(1,rgba(ink,.02));
    c.fillStyle=g; c.beginPath();
    if(crescent) {
      c.moveTo(59,16);
      c.bezierCurveTo(39,24,40,47,59,54);
      c.bezierCurveTo(67,57,75,54,81,49);
      c.bezierCurveTo(59,62,37,35,59,16);
    } else c.ellipse(55,39,21,20.5,-.17,0,Math.PI*2);
    c.fill();
    if(!crescent) {
      brush(c,[[39,52,.12],[35.4,46,.9],[34,38,1.78],[37,29,2.08],[44,22,1.62],[51,19,.62],[58,18.7,.14]],ink,.84);
      brush(c,[[60.5,19,.12],[68,23,.96],[73.6,29.4,.67],[76,35,.14]],ink,.64);
    }
    brush(c,[[11,62,.12],[20,61.6,1.6],[28,59.5,2.7],[36,59.7,3.15],[45,57.4,1.7],[53,57,.17]],ink,.37);
    brush(c,[[28,68,.15],[39,66.8,1.15],[47,62,2.9],[55,62,3.0],[65,58,3.1],[76,57.2,1.35],[85,54,.14]],ink,.66);
    brush(c,[[50,67,.12],[59,66.3,1.4],[70,62.6,1.5],[78,63.2,.8],[91,59.6,.1]],ink,.29);
  }
  function paint(ctx,id,x,y,size,inkColor) {
    if(!ctx || !(size > 0) || !Object.hasOwn(vocabulary,id)) return;
    const ink = /^#[\da-f]{6}$/i.test(inkColor ?? '') ?
      [1,3,5].map(pos=>parseInt(inkColor.slice(pos,pos+2),16)) : [35,36,32];
    ctx.save();
    ctx.translate(x,y); ctx.scale(size/100,size/100);
    if(id==='blossom') blossom(ctx,ink);
    else if(id==='bamboo') bamboo(ctx,ink);
    else if(id==='mountain') mountain(ctx,ink);
    else moon(ctx,ink,id==='crescent');
    ctx.restore();
  }
  window.ParkInkMotifs = Object.freeze({choose,paint});
})();
