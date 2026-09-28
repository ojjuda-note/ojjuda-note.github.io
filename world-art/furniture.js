/* Ojjuda World · warm miniature furniture art.
 * Pure SVG renderers: catalog IDs, dimensions, links and saved data stay with World.
 * Main household silhouettes are redrawn below. The remaining catalog keeps its
 * individual silhouette and receives the same material/edge treatment.
 */
(function (root) {
  'use strict';
  let serial = 0;
  const flat = /rug|mat|zabuton|yo$|slippers|scale|robotvac/;

  function install(api) {
    const { Re, $r, q, jo, y, n, Sb, s1 } = api;
    if (!Re || !$r || !q || !y) throw new Error('Furniture art requires the World renderer catalog.');
    const floor = { ...Re }, wall = { ...$r };
    const petBases=new Set(Object.entries(q).filter(([,meta])=>meta.pet).map(([id,meta])=>jo?jo(id):(meta.base||id)));
    const number = n || ((v) => Math.round(v * 10) / 10);
    const xy = (p) => `${number(p[0])} ${number(p[1])}`;
    const line = (a, b, c, width = .7, opacity = 1) => `<path d="M${xy(a)}L${xy(b)}" fill="none" stroke="${c}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"/>`;
    const ellipse = (p, rx, ry, c, extra = '') => `<ellipse cx="${number(p[0])}" cy="${number(p[1])}" rx="${number(rx)}" ry="${number(ry)}" fill="${c}" ${extra}/>`;
    const roundPath = (points, radius = 1.3) => {
      const corners = points.map((p, i) => {
        const prev = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
        const move = (a) => { const d = Math.hypot(a[0] - p[0], a[1] - p[1]); const r = Math.min(radius, d * .2); return [p[0] + (a[0] - p[0]) * r / (d || 1), p[1] + (a[1] - p[1]) * r / (d || 1)]; };
        return [move(prev), p, move(next)];
      });
      return `M${xy(corners[0][0])}` + corners.map(([a, b, c], i) => `${i ? `L${xy(a)}` : ''}Q${xy(b)} ${xy(c)}`).join('') + 'Z';
    };
    const hull = (points) => {
      const a=points.slice().sort((p,z)=>p[0]-z[0]||p[1]-z[1]),cross=(o,p,z)=>(p[0]-o[0])*(z[1]-o[1])-(p[1]-o[1])*(z[0]-o[0]);
      const half=(list)=>{const h=[];for(const p of list){while(h.length>1&&cross(h[h.length-2],h[h.length-1],p)<=0)h.pop();h.push(p);}return h.slice(0,-1);};
      return half(a).concat(half(a.slice().reverse()));
    };

    function material() {
      const prefix = `owf${++serial}-`, definitions = [], cache = new Map();
      const paint = (color, face = 'front') => {
        if (!/^#[\da-f]{3,8}$/i.test(color || '')) return color;
        const key = color + face;
        if (cache.has(key)) return cache.get(key);
        const id = prefix + cache.size;
        const shifts = face === 'top' ? [.23, .045, -.04] : face === 'side' ? [.015, -.13, -.27] : [.16, -.025, -.17];
        if(face.startsWith('soft')) {
          const side=face==='soft-side',top=face==='soft-top';
          definitions.push(`<radialGradient id="${id}" cx=".30" cy=".20" r=".88"><stop stop-color="${y(color,top?.22:side?.04:.13)}"/><stop offset=".5" stop-color="${y(color,top?.06:side?-.11:-.02)}"/><stop offset="1" stop-color="${y(color,side?-.3:-.19)}"/></radialGradient>`);
        } else definitions.push(`<linearGradient id="${id}" x1="0" y1="0" x2=".72" y2="1"><stop stop-color="${y(color, shifts[0])}"/><stop offset=".55" stop-color="${y(color, shifts[1])}"/><stop offset="1" stop-color="${y(color, shifts[2])}"/></linearGradient>`);
        const value = `url(#${id})`; cache.set(key, value); return value;
      };
      const fabricId = prefix + 'fabric';
      let fabricMade = false;
      const texture = (points, radius, kind) => {
        if (kind !== 'fabric') return '';
        if (!fabricMade) {
          definitions.push(`<pattern id="${fabricId}" width="1.5" height="1.5" patternUnits="userSpaceOnUse"><path d="M0 .3h.65M.85 1.05h.65" stroke="#fff" stroke-width=".2" opacity=".045"/><path d="M.35 .1v.5M1.1 .85v.5" stroke="#493749" stroke-width=".16" opacity=".025"/></pattern>`);
          fabricMade = true;
        }
        return `<path d="${roundPath(points, radius)}" fill="url(#${fabricId})"/>`;
      };
      const face = (points, color, kind = 'front', radius = 1.3, textureKind) => `<path d="${roundPath(points, radius)}" fill="${paint(color, textureKind==='fabric'?'soft-'+kind:kind)}" stroke="${y(color, -.16)}" stroke-width="${textureKind==='fabric'?'.12':'.35'}" stroke-linejoin="round"/>` + texture(points, radius, textureKind);
      const finish = (svg) => `<defs>${definitions.join('')}</defs>${svg}`;
      const polish = (svg) => svg.replace(/fill="(#[\da-f]{3,8})"/gi, (_, color) => `fill="${paint(color)}"`);
      return { paint, face, texture, finish, polish };
    }

    function context(e, m, kind) {
      const p = e.map;
      const box = (x0, x1, y0, y1, z, h, c, radius = kind === 'fabric' ? 2.1 : 1.0, surface = kind) => {
        const top = [p(x0, y0, z+h), p(x1, y0, z+h), p(x1, y1, z+h), p(x0, y1, z+h)];
        const a = [p(x0, y1, z), p(x1, y1, z), p(x1, y1, z+h), p(x0, y1, z+h)];
        const b = [p(x1, y0, z), p(x1, y1, z), p(x1, y1, z+h), p(x1, y0, z+h)];
        const aFace = p(x1, y1)[0] > p(x0, y1)[0] ? 'front' : 'side';
        // A continuous underlying shell closes rounded facet junctions, so the
        // floor cannot show through the corners of upholstery or cabinet tops.
        let out = m.face(hull([...top,...a,...b]),c,'front',radius*.65);
        out += m.face(a, c, aFace, radius, surface) + m.face(b, c, aFace === 'front' ? 'side' : 'front', radius, surface) + m.face(top, c, 'top', radius, surface);
        if (h > 3) out += line(top[3], top[2], '#fff', surface==='fabric'?.4:.6, surface==='fabric'?.12:.25);
        if (surface === 'wood' && Math.abs(x1-x0) > .4 && Math.abs(y1-y0) > .25) {
          for (let k = 1; k <= 3; k++) {
            const f = y0 + (y1-y0) * k / 4;
            out += line(p(x0+.05, f, z+h+.1), p(x1-.05, f+.02, z+h+.1), y(c,-.18), .32, .22);
          }
        }
        return out;
      };
      return { ...e, bx: box, m, kind, line, ellipse };
    }
    const shade = (e) => {
      const a = e.map(e.La / 2, e.Lb / 2, 0);
      return ellipse([a[0], a[1]+1.2], Math.max(9, (e.La+e.Lb)*10), Math.max(3.5,(e.La+e.Lb)*3.3), '#3E304A', 'opacity=".075"') + ellipse(a, Math.max(7,(e.La+e.Lb)*7.6), Math.max(2.5,(e.La+e.Lb)*2.25), '#4B3F48', 'opacity=".055"');
    };
    const feet = (e, height, color = '#AE8059', inset = .12) => {
      let s = '';
      for (const x of [inset, e.La-inset-.11]) for (const z of [inset,e.Lb-inset-.11]) s += e.bx(x,x+.11,z,z+.11,0,height,color,.5,'wood');
      return s;
    };
    const piping = (e, x0,x1,y0,y1,z,c) => `<path d="${roundPath([e.map(x0,y0,z),e.map(x1,y0,z),e.map(x1,y1,z),e.map(x0,y1,z)],2.3)}" fill="none" stroke="${y(c,.3)}" stroke-width=".35" opacity=".48"/>`;

    function sofa(t,e,c) {
      const L=e.La,D=e.Lb,b=e.bx,p=e.map, count=L>1.4?2:1;
      let s=feet(e,3.8)+b(.035,L-.035,.04,D-.035,3.3,6.7,y(c,-.09),2.1,'fabric');
      s+=b(.05,L-.05,.03,.30,9,23,c,2.8,'fabric');
      for(let i=0;i<count;i++) {
        const a=.24+i*(L-.48)/count, z=.24+(i+1)*(L-.48)/count-.018;
        s+=b(a,z,.275,.40,15,15,y(c,.07),3.1,'fabric');
        s+=b(a,z,.405,D-.065,10,6.2,y(c,.055),2.8,'fabric');
        s+=line(p(a+.025,.406,16.35),p(z-.025,.406,16.35),y(c,-.4),.7,.52);
        s+=piping(e,a+.025,z-.025,.44,D-.1,16.25,c);
      }
      s+=b(.025,.235,.28,D-.025,9.5,12,c,3,'fabric');
      s+=b(L-.235,L-.025,.28,D-.025,9.5,12,c,3,'fabric');
      s+=line(p(.09,D-.027,10),p(L-.09,D-.027,10),y(c,-.24),.55,.6);
      return s;
    }
    function bed(t,e,c) {
      const L=e.La,D=e.Lb,b=e.bx,p=e.map, head='#CDA77F';
      let s=feet(e,4,head)+b(.02,.19,.025,D-.025,2,38,head,1.8,'wood');
      s+=b(.2,L-.035,.025,D-.025,4,7,head,1.6,'wood');
      s+=b(.18,L-.06,.065,D-.065,11,8.4,'#FCF8F3',2.9,'fabric');
      const pillows=D>1.3?2:1;
      for(let i=0;i<pillows;i++) {
        const y0=.15+i*(D-.30)/pillows, y1=.15+(i+1)*(D-.30)/pillows-.045;
        s+=b(.28,.81,y0,y1,19.2,5.5,'#FFFCF7',3.1,'fabric');
        s+=piping(e,.32,.77,y0+.04,y1-.04,24.75,'#E7DDD6');
      }
      s+=b(Math.min(.9,L*.43),L-.045,.048,D-.048,19.4,4.8,c,2.8,'fabric');
      s+=b(Math.min(.9,L*.43),Math.min(1.10,L*.55),.04,D-.04,23.1,1.7,y(c,.14),1.2,'fabric');
      for(const f of [.35,.68]) s+=line(p(L-.2,D*f,24.3),p(Math.min(1.12,L*.58),D*f,24.3),y(c,.25),.6,.38);
      return s;
    }
    function desk(t,e,c) {
      const L=e.La,D=e.Lb,b=e.bx,p=e.map;
      let s=feet(e,26,y(c,-.13),.14)+b(.01,L-.01,.035,D-.035,25.3,4.3,c,1.8,'wood');
      s+=b(L-.62,L-.1,.12,D-.08,16.7,8.6,y(c,.03),1.1,'wood');
      s+=line(p(L-.5,D-.076,21),p(L-.25,D-.076,21),'#A27B50',1.25);
      s+=b(.25,.88,.22,Math.min(D-.12,.79),29.8,1.4,'#F9F3E8',.9,'paper');
      s+=b(.29,.83,.25,Math.min(D-.16,.75),31.2,.8,'#C1D5C0',.6,'paper');
      const mug=p(Math.max(.9,L-.36),.30,30);
      s+=`<path d="M${xy([mug[0]+2.2,mug[1]-6])}q5 -1 4 3q-1 3-4 2" fill="none" stroke="#D9C9B4" stroke-width="1.1"/>`;
      s+=`<rect x="${number(mug[0]-3)}" y="${number(mug[1]-7)}" width="6" height="7" rx="1.7" fill="${e.m.paint('#FAF7EC')}"/>`+ellipse([mug[0],mug[1]-7],3,1.4,'#A47B55');
      return s;
    }
    function chair(t,e,c) {
      const b=e.bx,p=e.map,back=t.back||['b0','a0','b1','a1'][(t.r||0)%4];
      let s='';
      for(const x of [.24,.69])for(const z of [.25,.69]) s+=b(x,x+.075,z,z+.075,0,12,'#B38760',.6,'wood');
      const seat=b(.19,.81,.20,.81,12,3.8,c,2.2,'fabric');
      let rest;
      if(back==='b0')rest=b(.18,.82,.16,.28,16,17,c,2.3,'fabric');
      else if(back==='a0')rest=b(.16,.28,.18,.82,16,17,c,2.3,'fabric');
      else if(back==='b1')rest=b(.18,.82,.72,.84,16,17,c,2.3,'fabric');
      else rest=b(.72,.84,.18,.82,16,17,c,2.3,'fabric');
      s+=(back==='b0'||back==='a0')?rest+seat:seat+rest;
      return s;
    }
    function shelf(t,e,c,height=64) {
      const L=e.La,D=e.Lb,b=e.bx,p=e.map,rows=height>40?3:2;
      let s=feet(e,3,c,.08)+b(.06,L-.06,.10,.21,3,height-5,y(c,-.12),.8,'wood');
      s+=b(.025,.135,.08,D-.025,3,height-3,c,1,'wood')+b(L-.135,L-.025,.08,D-.025,3,height-3,c,1,'wood');
      const colors=['#DDB2AE','#91A7C1','#DCC590','#9FBDA7','#B9A4C8','#D9AA80','#F5EADB'];
      for(let r=0;r<rows;r++) {
        const z=4+r*(height-6)/rows;
        s+=b(.12,L-.12,.12,D-.05,z,2.1,c,1.1,'wood');
        let x=.20,j=r*3;
        while(x<L-.26) {
          const w=.085+(j%3)*.025,h=9+(j%4)*2.1;
          s+=b(x,x+w,Math.max(.2,D-.48),D-.105,z+2.1,Math.min(h,(height-6)/rows-4),colors[j%colors.length],.55,'paper');
          s+=line(p(x+.02,D-.10,z+4.2),p(x+w-.015,D-.10,z+4.2),'#FFFAEE',.6,.7);
          x+=w+.035;j++;
        }
      }
      return s+b(.0,L,.06,D-.0,height,2.8,y(c,.045),1.6,'wood');
    }
    function cabinet(t,e,c,height=30,rows=2,doors=false) {
      const L=e.La,D=e.Lb,b=e.bx,p=e.map;
      let s=feet(e,4,y(c,-.12),.12)+b(.055,L-.055,.07,D-.055,3.5,height-4,c,1.7,'wood');
      s+=b(.025,L-.025,.035,D-.02,height-.5,2.7,y(c,.055),1.4,'wood');
      for(let i=0;i<rows;i++) {
        const z=5+i*(height-6)/rows, z1=5+(i+1)*(height-6)/rows-.8;
        const cols=doors?2:1;
        for(let j=0;j<cols;j++) {
          const x=.10+j*(L-.20)/cols,x1=.10+(j+1)*(L-.20)/cols-.015;
          s+=e.m.face([p(x,D-.047,z),p(x1,D-.047,z),p(x1,D-.047,z1),p(x,D-.047,z1)],y(c,.025),'front',1);
          const cx=doors?(j?x+.11:x1-.11):(x+x1)/2;
          s+=line(p(cx-.08,D-.038,(z+z1)/2),p(cx+.08,D-.038,(z+z1)/2),'#C0A074',1.3);
        }
      }
      return s;
    }
    function tv(t,e,c,room) {
      if(!s1 && room) return Re.tv(t,e,c,room);
      const L=e.La,D=e.Lb,b=e.bx,p=e.map;
      let s=cabinet(t,e,'#D4AE83',13,1,true);
      s+=b(L*.42,L*.58,.33,.66,15,1.5,'#77727B',.5,'metal');
      s+=b(L*.47,L*.53,.40,.48,16,3.8,'#77727B',.4,'metal');
      s+=b(.09,L-.09,.34,.45,19,31,c,1.35,'metal');
      const corners=[p(.145,.454,47.8),p(L-.145,.454,47.8),p(L-.145,.454,21),p(.145,.454,21)];
      s+=e.m.face(corners,'#69619B','front',.8);
      const photo=room&&s1?s1(room):null;
      if(photo&&Sb) s+=Sb(photo,corners[0],corners[1],corners[3]);
      else s+=`<path d="M${xy(corners[0])}L${xy(p(L*.55,.455,47.8))}L${xy(p(L*.32,.455,21))}L${xy(corners[3])}Z" fill="#E6DBF5" opacity=".17"/>`;
      const dot=p(L-.18,.457,19.8);s+=ellipse(dot,.55,.55,'#D5E3CE');
      if(photo){const z=p(L/2,.458,34.5);s+=ellipse(z,5,5,'#FFF','opacity=".83"')+`<path d="M${xy([z[0]-1.4,z[1]-2.6])}l4 2.6-4 2.6z" fill="#514760"/>`;}
      return s;
    }
    function roundTable(t,e,c) {
      const large=e.La>1.2,rad=large?36:17.2,height=large?26:24,p=e.map(e.La/2,e.Lb/2,0),top=[p[0],p[1]-height];
      let s=ellipse([p[0],p[1]-1],large?13:8.5,large?6.5:4.2,e.m.paint(y(c,-.13),'side'));
      s+=`<rect x="${number(p[0]-2.3)}" y="${number(top[1])}" width="4.6" height="${height-1}" rx="1.7" fill="${e.m.paint(y(c,-.1),'side')}"/>`;
      s+=ellipse([top[0],top[1]+2.5],rad,rad/2,e.m.paint(y(c,-.08),'side'));
      s+=ellipse(top,rad,rad/2,e.m.paint(c,'top'),'stroke="#FFF6E8" stroke-opacity=".55" stroke-width=".65"');
      s+=`<path d="M${xy([top[0]-rad*.72,top[1]-rad*.18])}q${rad*.56} ${-rad*.30} ${rad*1.17} ${-.5}" fill="none" stroke="#fff" stroke-width=".6" opacity=".27"/>`;
      return s;
    }
    function diningTable(t,e,c) {
      const L=e.La,D=e.Lb,b=e.bx;
      return feet(e,25,y(c,-.1),.13)+b(.015,L-.015,.03,D-.015,24.8,4.2,c,2.1,'wood');
    }
    function coffeeTable(t,e,c) {
      const L=e.La,D=e.Lb,b=e.bx;
      return feet(e,12,y(c,-.12),.18)+b(.055,L-.055,.07,D-.055,11.8,3.5,c,2.2,'wood');
    }
    function plant(t,e,c,split=false) {
      const p=e.map(.5,.5,0),x=p[0],base=p[1],m=e.m;
      let s='';
      const leaves=split?[[-12,-42,-34,12,8],[12,-46,33,12,8],[-1,-58,-7,12,8],[-12,-29,-52,10,7],[11,-30,53,11,7]]:[[-10,-29,-35,10,6],[10,-34,38,10,6],[0,-44,-4,11,7],[-7,-43,-38,9,5],[13,-23,50,8,5]];
      for(const [dx,dy,angle,rx,ry] of leaves) s+=line([x,base-12],[x+dx,base+dy],y(c,-.28),1.0);
      for(const [dx,dy,angle,rx,ry] of leaves) {
        s+=`<g transform="translate(${number(x+dx)} ${number(base+dy)}) rotate(${angle})"><path d="M${-rx} 0C${-rx*.65} ${-ry*1.65} ${rx*.72} ${-ry*1.15} ${rx} 0C${rx*.5} ${ry*1.18} ${-rx*.65} ${ry*1.5} ${-rx} 0Z" fill="${m.paint(c,'soft-top')}"/>`;
        s+=`<path d="M${-rx} 0Q0 -1 ${rx} 0C${rx*.5} ${ry*1.18} ${-rx*.65} ${ry*1.5} ${-rx} 0Z" fill="${m.paint(y(c,-.12),'side')}" opacity=".65"/>`;
        s+=`<path d="M${-rx+1} 0Q0 -1 ${rx-1} 0" fill="none" stroke="${y(c,.37)}" stroke-width=".46"/>`;
        for(const d of [-.35,.15,.55])s+=`<path d="M${number(rx*d)} 0q${rx*.14} ${ry*.22} ${rx*.1} ${ry*.65}M${number(rx*d)} 0q${rx*.16} ${-ry*.22} ${rx*.12} ${-ry*.65}" stroke="${y(c,.28)}" stroke-width="${split?.53:.33}" fill="none" opacity=".62"/>`;
        s+='</g>';
      }
      const pot=split?'#F6F0E5':'#D6A082';
      s+=`<path d="M${number(x-8.3)} ${number(base-16)}L${number(x-6.8)} ${number(base-1)}Q${number(x)} ${number(base+3)} ${number(x+6.8)} ${number(base-1)}L${number(x+8.3)} ${number(base-16)}Z" fill="${m.paint(pot,'front')}" stroke="${y(pot,-.12)}" stroke-width=".45"/>`;
      s+=ellipse([x,base-16],8.3,3.1,m.paint(y(pot,.08),'top'))+ellipse([x,base-16],6.4,2,'#75614F');
      s+=line([x-5.7,base-12],[x-4.6,base-3],'#FFF',.7,.43);
      return s;
    }

    function faucet(e,x,z,height,reach=.22) {
      const p=e.map(x,z,height),a=e.map(x,z,height+9),b=e.map(x,z+reach,height+7.5);
      const d=`M${xy(p)}L${xy([a[0],a[1]+3])}Q${xy([a[0],a[1]-2])} ${xy([b[0],b[1]-2])}L${xy(b)}`;
      return `<path d="${d}" fill="none" stroke="${e.m.paint('#ABB7C0','side')}" stroke-width="2.4" stroke-linecap="round"/>`+
        `<path d="${d}" fill="none" stroke="#F8FCFE" stroke-width=".6" stroke-linecap="round" opacity=".85"/>`+
        ellipse(p,2.4,1.05,e.m.paint('#C6CED3','top'));
    }
    function fridge(t,e,c) {
      const b=e.bx,p=e.map;
      let s=b(.13,.87,.16,.87,0,3,'#918E8B',1.1,'metal')+b(.085,.915,.10,.90,2,60,c,3,'enamel');
      const panel=(lo,hi)=>e.m.face([p(.105,.912,lo),p(.895,.912,lo),p(.895,.912,hi),p(.105,.912,hi)],y(c,.04),'front',2.7);
      s+=panel(3.5,39.7)+panel(40.5,60.5);
      s+=line(p(.14,.925,40.1),p(.86,.925,40.1),y(c,-.25),.7,.65);
      for(const z of [25,45]) {
        s+=line(p(.23,.947,z),p(.23,.947,z+10),'#8F9AA2',1.8);
        s+=line(p(.225,.95,z+.8),p(.225,.95,z+9.2),'#F9FAFA',.55,.9);
      }
      s+=ellipse(p(.66,.917,52),1.85,2.1,e.m.paint('#E3A2AD'))+ellipse(p(.72,.917,47.2),1.35,1.6,e.m.paint('#E4C477'));
      s+=line(p(.14,.922,59),p(.83,.922,59),'#FFF',.65,.65);
      return s;
    }
    function kitchenSink(t,e,c) {
      const L=e.La,D=e.Lb,b=e.bx,p=e.map;
      let s=cabinet(t,e,c,24,1,true);
      s+=b(.005,L-.005,.035,D-.01,24,3.1,'#E9ECEB',1.7,'stone');
      const rim=[p(.16,.22,27.4),p(Math.min(.99,L-.17),.22,27.4),p(Math.min(.99,L-.17),D-.14,27.4),p(.16,D-.14,27.4)];
      s+=e.m.face(rim,'#B5C4CC','side',3.1);
      s+=e.m.face([p(.22,.28,27.55),p(Math.min(.93,L-.22),.28,27.55),p(Math.min(.93,L-.22),D-.20,27.55),p(.22,D-.20,27.55)],'#D4E3E5','front',3);
      s+=ellipse(p(.59,.59,27.65),1.65,.85,'#88999D')+ellipse(p(.59,.59,27.7),.75,.4,'#D7E0E0');
      s+=faucet(e,.57,.15,27.6,.24);
      if(L>1.4){
        s+=b(1.18,L-.17,.30,D-.20,27.25,1.7,'#D9BA91',2,'wood');
        s+=ellipse(p(1.47,.51,29.4),2.6,2.4,e.m.paint('#DD8F78','soft-top'))+line(p(1.47,.5,32),p(1.49,.51,33),'#759568',.7);
      }
      return s;
    }
    function stove(t,e,c) {
      const b=e.bx,p=e.map,D=e.Lb,m=e.m;
      let s=b(.12,.88,.15,D-.04,0,2,'#8A8888',.7,'metal')+b(.07,.93,.10,D-.03,2,22,c,2.4,'enamel');
      s+=b(.05,.95,.075,D-.015,24,2.6,'#596168',1.5,'glass');
      s+=m.face([p(.19,D-.016,5),p(.81,D-.016,5),p(.81,D-.016,16.5),p(.19,D-.016,16.5)],'#4B535E','front',2.3);
      s+=m.face([p(.24,D-.006,7.2),p(.76,D-.006,7.2),p(.76,D-.006,14.5),p(.24,D-.006,14.5)],'#777E86','side',1.3);
      s+=line(p(.23,D+.005,17.6),p(.77,D+.005,17.6),'#B8C3C6',1.7);
      for(const x of [.28,.5,.72])s+=ellipse(p(x,D-.003,21.5),1.7,1.8,m.paint('#BBC4C7','top'));
      for(const [x,z]of[[.3,.38],[.69,.69]]){
        const a=p(x,z,26.85);s+=ellipse(a,6.6,3.2,'#30343B')+ellipse(a,4.9,2.3,'none','stroke="#919A9E" stroke-width=".65"');
      }
      const a=p(.3,.38,27),z=a[1];
      s+=`<path d="M${number(a[0]-6.2)} ${number(z-6.5)}V${number(z-.6)}Q${number(a[0])} ${number(z+3.5)} ${number(a[0]+6.2)} ${number(z-.6)}V${number(z-6.5)}Z" fill="${m.paint('#D98B83')}"/>`;
      s+=ellipse([a[0],z-6.5],6.5,3.1,m.paint('#ECC2AD','top'))+ellipse([a[0],z-6.5],5.2,2.1,m.paint('#DDACA2','top'));
      s+=`<path d="M${number(a[0]-6)} ${number(z-4.5)}h-3M${number(a[0]+6)} ${number(z-4.5)}h3" stroke="#71757A" stroke-width="1.5" stroke-linecap="round"/>`;
      s+=ellipse([a[0],z-8],1.4,.9,'#777E83');
      return s;
    }
    function bathTub(t,e,c) {
      const L=e.La,D=e.Lb,b=e.bx,p=e.map,m=e.m;
      let s=b(.16,L-.16,.16,D-.11,0,3,y(c,-.14),4,'ceramic');
      s+=b(.035,L-.035,.08,D-.025,2.8,17.5,c,6.7,'ceramic');
      const rim=[p(.065,.10,20.6),p(L-.065,.10,20.6),p(L-.065,D-.035,20.6),p(.065,D-.035,20.6)];
      s+=m.face(rim,y(c,.05),'top',7.3);
      const inner=[p(.20,.25,20.75),p(L-.20,.25,20.75),p(L-.20,D-.18,20.75),p(.20,D-.18,20.75)];
      s+=m.face(inner,'#B9D1D8','side',6.1);
      s+=m.face([p(.24,.29,20.85),p(L-.24,.29,20.85),p(L-.24,D-.22,20.85),p(.24,D-.22,20.85)],'#BAE2E6','top',5.7);
      for(const [x,z,r]of[[.45,.48,2.1],[.64,.64,1.45],[L-.47,.42,1.8]])s+=ellipse(p(x,z,21.1),r,r*.7,'#FFF','opacity=".78"');
      const duck=p(L*.63,.53,22);
      s+=ellipse(duck,3.7,2.5,m.paint('#F2D27C','soft-top'))+ellipse([duck[0]+2.1,duck[1]-2.6],2.2,2.1,m.paint('#F6DE92','top'));
      s+=`<path d="M${xy([duck[0]+3.7,duck[1]-2.7])}l2.3 .5-2.2 1z" fill="#DCA264"/>`+ellipse([duck[0]+2.75,duck[1]-3.05],.35,.35,'#625142');
      s+=faucet(e,.13,.47,20.5,.20);
      return s;
    }
    function toilet(t,e,c) {
      const b=e.bx,p=e.map,m=e.m,back=['b0','a0','b1','a1'][(t.r||0)%4];
      const center=back==='b0'?[.5,.64]:back==='a0'?[.64,.5]:back==='b1'?[.5,.36]:[.36,.5];
      const tank=back==='b0'?[.2,.8,.10,.34]:back==='a0'?[.10,.34,.2,.8]:back==='b1'?[.2,.8,.66,.9]:[.66,.9,.2,.8];
      let tankSvg=b(...tank,2,31,c,3.1,'ceramic')+b(tank[0]-.01,tank[1]+.01,tank[2]-.008,tank[3]+.008,33,1.7,y(c,.035),2.2,'ceramic');
      const top=p((tank[0]+tank[1])/2,(tank[2]+tank[3])/2,35);tankSvg+=ellipse(top,2.4,1.05,m.paint('#BEC6CB','top'));
      const a=p(center[0],center[1],0),x=a[0],z=a[1];
      let bowl=`<path d="M${number(x-4.6)} ${number(z-11)}Q${number(x-6.5)} ${number(z-3)} ${number(x-5)} ${number(z)}Q${number(x)} ${number(z+2.8)} ${number(x+5)} ${number(z)}L${number(x+4.6)} ${number(z-11)}Z" fill="${m.paint(y(c,-.025),'side')}"/>`;
      bowl+=`<path d="M${number(x-10.5)} ${number(z-14)}Q${number(x-10.3)} ${number(z-4.6)} ${number(x)} ${number(z-3.5)}Q${number(x+10.3)} ${number(z-4.6)} ${number(x+10.5)} ${number(z-14)}Z" fill="${m.paint(c)}"/>`;
      bowl+=ellipse([x,z-14],10.7,5.7,m.paint(c,'top'),'stroke="#E2E5E5" stroke-width=".4"');
      bowl+=ellipse([x,z-14.25],6.9,3.65,m.paint('#CFDDE0','side'))+ellipse([x,z-14.0],5.1,2.6,m.paint('#D5EBED','top'));
      bowl+=`<path d="M${number(x-8.4)} ${number(z-14.5)}Q${number(x)} ${number(z-20.8)} ${number(x+8.4)} ${number(z-14.5)}" stroke="#FFF" stroke-width="1.1" fill="none" opacity=".88"/>`;
      return back==='b0'||back==='a0'?tankSvg+bowl:bowl+tankSvg;
    }
    function basin(t,e,c) {
      const p=e.map,m=e.m,b=e.bx,a=p(.5,.44,0),x=a[0],z=a[1];
      let s=`<path d="M${number(x-3.1)} ${number(z-25)}Q${number(x-2)} ${number(z-13)} ${number(x-4)} ${number(z-1)}Q${number(x)} ${number(z+2)} ${number(x+4)} ${number(z-1)}Q${number(x+2)} ${number(z-13)} ${number(x+3.1)} ${number(z-25)}Z" fill="${m.paint(y(c,-.035),'front')}"/>`;
      s+=b(.10,.90,.12,.78,22,7,c,5.1,'ceramic');
      const a1=[p(.19,.22,29.3),p(.81,.22,29.3),p(.81,.68,29.3),p(.19,.68,29.3)];
      s+=m.face(a1,'#CCDFE2','side',5.2)+m.face([p(.25,.28,29.4),p(.75,.28,29.4),p(.75,.62,29.4),p(.25,.62,29.4)],'#E0EDF0','top',4.5);
      s+=ellipse(p(.5,.45,29.5),1.35,.7,'#AFBBC1')+faucet(e,.5,.16,29,.17);
      const soap=p(.82,.23,29.5);s+=`<rect x="${number(soap[0]-2.1)}" y="${number(soap[1]-5)}" width="4.2" height="5" rx="1.1" fill="${m.paint('#D7ADA8')}"/>`+line([soap[0],soap[1]-5],[soap[0],soap[1]-6.4],'#ECDFCF',1.1);
      return s;
    }
    function bathMat(t,e,c) {
      const L=e.La,D=e.Lb,p=e.map,m=e.m;
      let s=e.bx(.09,L-.09,.10,D-.10,0,1.1,c,3.1,'fabric');
      s+=piping(e,.16,L-.16,.17,D-.17,1.16,c);
      for(let i=0;i<3;i++)s+=line(p(.30,.35+i*.13,1.3),p(L-.30,.35+i*.13,1.3),y(c,.42),.7,.34);
      return s;
    }

    const wallBespoke={
      cupboard(t,room,m) {
        let s=`<rect x="-32" y="-18" width="66" height="36" rx="3.2" fill="${m.paint('#BCA68D','side')}"/><rect x="-34" y="-21" width="66" height="36" rx="3.2" fill="${m.paint('#F0E3D2')}"/><rect x="-35" y="-23.8" width="68" height="4.5" rx="1.8" fill="${m.paint('#D1AC82','top')}"/>`;
        for(const x of [-30,2])s+=`<rect x="${x}" y="-17.4" width="27.5" height="29" rx="2" fill="${m.paint('#DDCDB8')}"/><rect x="${x+2.3}" y="-15.1" width="22.9" height="24.4" rx="1.2" fill="${m.paint('#D7E6E6','top')}"/>`;
        s+=`<path d="M-26 5H-7M7 5h20" stroke="#BBA78A" stroke-width="1.1"/><rect x="-25" y="-7" width="6" height="12" rx="1.7" fill="${m.paint('#DDA8AD')}"/><rect x="-16.5" y="-4" width="7" height="9" rx="1.9" fill="${m.paint('#E9CE8D')}"/>`;
        s+=ellipse([12,0],4.2,5,m.paint('#FFFBF0'),'stroke="#B0C9C7" stroke-width=".7"')+ellipse([22,1],3.4,4,m.paint('#F7F2E7'),'stroke="#D7BABC" stroke-width=".7"');
        s+=line([-5,-3],[-5,2],'#B99E76',1.35)+line([4,-3],[4,2],'#B99E76',1.35)+line([-27,-13],[-19,-10],'#FFF',1.0,.58)+line([7,-13],[15,-10],'#FFF',1.0,.58);
        return s;
      },
      mirror(t,room,m) {
        return ellipse([.8,1.6],17.4,23.7,'#635648','opacity=".10"')+ellipse([0,0],17.2,23.2,m.paint('#D6B582','side'))+ellipse([-.2,-.5],16,21.9,m.paint('#EFD8B0','top'))+ellipse([0,0],13.8,19.8,m.paint('#D7E6E7','top'))+`<path d="M-11 8Q-4 2 7-14Q-2-21-10-10Z" fill="#FFF" opacity=".31"/><path d="M-6 -10l8-5M-7-4l4-2" fill="none" stroke="#FFF" stroke-width="1.6" stroke-linecap="round" opacity=".64"/>`;
      },
      towel(t,room,m) {
        let s=`<rect x="-26" y="-18" width="52" height="3.1" rx="1.55" fill="${m.paint('#BBC4CA','side')}"/>`+ellipse([-26,-16.5],2.7,2.7,m.paint('#AAB5BD','top'))+ellipse([26,-16.5],2.7,2.7,m.paint('#AAB5BD','top'));
        for(const [x,h,c]of[[-21,30,'#E6B1BC'],[3,24,'#A9BDDC']]){
          s+=`<path d="M${x} -15Q${x+9} -17 ${x+18} -15L${x+18.5} ${h-16}Q${x+10} ${h-13.2} ${x+.3} ${h-15}Z" fill="${m.paint(c,'soft-front')}"/>`;
          s+=`<path d="M${x+3} -13q-1 11 .2 ${h-3}M${x+15} -13q1 10-.2 ${h-3}" fill="none" stroke="${y(c,-.18)}" stroke-width=".5" opacity=".26"/>`;
          s+=`<path d="M${x+.8} ${h-19}q8 1.6 16.7-.1" fill="none" stroke="${y(c,.42)}" stroke-width="1.25"/>`;
        }
        return s;
      }
    };
    function lamp(t,e,c) {
      const p=e.map(.5,.5,0),x=p[0],z=p[1],m=e.m;
      let s=ellipse([x,z-1],9,4.3,m.paint('#B98D5D','side'))+ellipse([x,z-2.5],8.7,4.1,m.paint('#E4C393','top'));
      s+=`<rect x="${number(x-1.3)}" y="${number(z-45)}" width="2.6" height="42" rx="1.2" fill="${m.paint('#D5B17A','side')}"/>`;
      s+=`<path d="M${number(x-6)} ${number(z-57)}L${number(x+6)} ${number(z-57)}L${number(x+11)} ${number(z-40)}Q${number(x)} ${number(z-35)} ${number(x-11)} ${number(z-40)}Z" fill="${m.paint(c,'top')}" stroke="${y(c,-.17)}" stroke-width=".4"/>`;
      s+=ellipse([x,z-57],6,2,m.paint(y(c,.25),'top'))+ellipse([x,z-40],10.4,3.3,'#FFF4C7','opacity=".65"');
      for(const a of [-3,3])s+=line([x+a,z-54],[x+a*1.8,z-42],'#FFF',.45,.35);
      return s;
    }

    const bespoke = {
      sofa, armchair:sofa, bed, singlebed:bed, desk, chair,
      shelf:(t,e,c)=>shelf(t,e,c,62), lowshelf:(t,e,c)=>shelf(t,e,c,30),
      sideboard:(t,e,c)=>cabinet(t,e,c,30,1,true),
      drawers:(t,e,c)=>cabinet(t,e,c,44,3,false),
      nightstand:(t,e,c)=>cabinet(t,e,c,22,2,false),
      wardrobe:(t,e,c)=>cabinet(t,e,c,70,1,true),
      tv, ctable:roundTable, rtable:roundTable, dtable:diningTable,
      coffeetbl:coffeeTable, plant, monstera:(t,e,c)=>plant(t,e,c,true), lamp,
      bigfridge:fridge,sink:kitchenSink,stove,bathtub:bathTub,toilet,washbasin:basin,bathmat:bathMat
    };
    const upgrades = [];
    for(const [key,render] of Object.entries(Re)) {
      if(petBases.has(key))continue;
      floor[key]=function(t,e,c,room) {
        const item=q[t.type]||q[key]||{},cat=item.cat||'';
        const kind=/^(sofa|armchair|bed|singlebed|cushion|beanbag|pouf|lsofa|bedbench)$/.test(key)?'fabric':/storage|table/.test(cat)?'wood':undefined;
        const m=material(),modern=context(e,m,kind);
        let svg=(bespoke[key]||render)(t,modern,c,room);
        // Existing rain-shower panes repeat the same literal fill attribute.
        // Remove only that exact duplication, keeping both panes and all style.
        if(key==='rainshower')svg=svg.replace(/fill="#CFE6F3" fill="#CFE6F3"/g,'fill="#CFE6F3"');
        if(!bespoke[key])svg=m.polish(svg);
        return m.finish((flat.test(key)?'':shade(e))+svg);
      };
      upgrades.push(key);
    }
    for(const [key,render] of Object.entries($r)) {
      wall[key]=function(...args) {
        const m=material();
        const svg=wallBespoke[key]?wallBespoke[key](args[0],args[1],m):m.polish(render(...args)).replace(/<rect\b([^>]*?)\/>/g,(tag,attrs)=>/\brx=/.test(attrs)?tag:`<rect${attrs} rx=".8"/>`);
        return m.finish(svg);
      };
    }
    return { Re:floor, $r:wall, coverage:{ bespoke:Object.keys(bespoke), material:upgrades.filter(k=>!bespoke[k]), wall:Object.keys(wall), wallBespoke:Object.keys(wallBespoke), petsUntouched:[...petBases] } };
  }
  root.OjjudaFurnitureArt={install,version:'2026.09.28.1'};
})(typeof window==='undefined'?globalThis:window);
