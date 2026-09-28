/* Ojjuda World pet art v2. Pure SVG renderers; no account or pet-state changes.
 * Dogs/cats/rabbit have new layered anatomy. Birds and habitat pets retain their
 * animated production parts, with dimensional materials and species details.
 */
(function (global) {
  'use strict';
  const installed = new WeakSet();
  let serial = 0;
  const dogTraits = {
    dog: {ear:'drop',tail:'up'},
    dg_schnauzer:{ear:'fold',tail:'up',beard:true,eyebrows:true},
    dg_jindo:{ear:'point',tail:'curl',bib:true,cream:'#fff2d9'},
    dg_dachshund:{ear:'long',tail:'long',long:true,short:true,muzzle:'#c5946b',brows:true},
    dg_pomeranian:{ear:'point',tail:'plume',fluff:true,small:true,cream:'#ffe8c9'},
    dg_poodle:{ear:'pom',tail:'pom',fluff:true,topknot:true},
    dg_shiba:{ear:'point',tail:'curl',bib:true,cream:'#fff1db'},
    dg_corgi:{ear:'large',tail:'none',long:true,short:true,bib:true,blaze:true},
    dg_maltese:{ear:'drop',tail:'plume',headFluff:true,small:true,bow:true},
    dg_golden:{ear:'drop',tail:'plume',big:true,tongue:true,cream:'#ffe3a8'},
    dg_husky:{ear:'point',tail:'curl',mask:true,bib:true,eye:'#91cbea'},
    dg_bichon:{ear:'pom',tail:'pom',fluff:true,headFluff:true},
    dg_beagle:{ear:'long',tail:'up',saddle:true,blaze:true,bib:true,whiteTail:true}
  };
  const catTraits = {
    cat:{tabby:true},ct_cheese:{tabby:true,stripe:'#bf7432'},
    ct_mackerel:{tabby:true,stripe:'#555c70'},ct_tuxedo:{tuxedo:true,eye:'#a9d88e'},
    ct_calico:{calico:true},ct_russian:{eye:'#8cceaa'},
    ct_siamese:{points:'#685349',eye:'#8ecbfa'},
    ct_persian:{fluff:true,round:true,flat:true,eye:'#eab760'},
    ct_fold:{fold:true,round:true,eye:'#e1c66e'},
    ct_munchkin:{tabby:true,short:true,stripe:'#8b674e'},
    ct_norwegian:{fluff:true,tufts:true,tabby:true,stripe:'#735641'},
    ct_ragdoll:{fluff:true,points:'#938474',eye:'#8ac6f0'},
    ct_blackcat:{eye:'#e9d17b'}
  };
  const birdTraits = {
    bd_budgie:{size:.85,tail:10},bd_cockatiel:{size:1,tail:12},
    bd_cockatoo:{size:1.05,tail:8},bd_macaw:{size:1.05,tail:18},
    bd_eagle:{size:1.15,tail:10},bd_owl:{size:1.05,owl:true},
    bd_sparrow:{size:.8,ground:true,tail:8},bd_magpie:{size:.95,ground:true,tail:16}
  };
  function install(api) {
    const {Re,q} = api;
    if (!Re || !q) throw new TypeError('OjjudaPetArt requires the World renderer and catalog');
    if (installed.has(Re)) return Re;
    const num = api.n || (v => Math.round(v*10)/10);
    const safeColor = (value, fallback='#ad8162') => /^#[a-f\d]{3}(?:[a-f\d]{3})?$/i.test(value||'') ? value : fallback;
    const shade = api.y || ((c,t) => {
      let h=safeColor(c).slice(1); if(h.length===3)h=h.split('').map(x=>x+x).join('');
      const rgb=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
      return '#'+rgb.map(v=>Math.round(v+((t<0?0:255)-v)*Math.abs(t)).toString(16).padStart(2,'0')).join('');
    });
    const e = (x,y,rx,ry,fill,more='') => `<ellipse cx="${num(x)}" cy="${num(y)}" rx="${num(rx)}" ry="${num(ry)}" fill="${fill}" ${more}/>`;
    const c = (x,y,r,fill,more='') => `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" fill="${fill}" ${more}/>`;
    const path = (d,fill,more='') => `<path d="${d}" fill="${fill}" ${more}/>`;
    function palette(base) {
      const id='op'+(++serial).toString(36), defs=[], colors=new Map();
      function material(color,kind='fur') {
        color=safeColor(color,base); const key=color+kind;
        if(colors.has(key))return colors.get(key);
        const gid=id+'g'+colors.size;
        const light=kind==='glass'?.7:kind==='eye'?.25:.31;
        defs.push(`<radialGradient id="${gid}" cx="30%" cy="22%" r="82%" fx="24%" fy="18%"><stop offset="0" stop-color="${shade(color,light)}"/><stop offset=".36" stop-color="${shade(color,.1)}"/><stop offset=".72" stop-color="${color}"/><stop offset="1" stop-color="${shade(color,kind==='eye'?-.46:-.24)}"/></radialGradient>`);
        const paint=`url(#${gid})`;colors.set(key,paint);return paint;
      }
      return {id,material,defs,wrap:svg=>`<defs>${defs.join('')}</defs>${svg}`};
    }
    function shadow(x,y,wide=16) {
      return e(x+2,y+1,wide+2,5.1,'#443348','opacity=".035"')+e(x+2,y+.6,wide,3.9,'#443348','opacity=".06"')+e(x+2,y+.5,wide*.77,2.7,'#443348','opacity=".08"');
    }
    function eyes(x,y,spread,p,iris='#6b4937',scale=1,cat=false) {
      let out='';
      for(const side of [-1,1]) {
        const xx=x+side*spread,rx=cat?2.35:2.55,ry=cat?2.6:3;
        out+=e(xx,y+.2,rx*scale,ry*scale,p.material('#543a31','eye'));
        out+=e(xx,y+.58,1.85*scale,1.93*scale,p.material(iris,'eye'));
        out+=e(xx,y+.25,(cat?.9:1.28)*scale,1.9*scale,'#211b23');
        out+=e(xx-.65*scale,y-1.05*scale,.76*scale,.9*scale,'#fff','opacity=".96"');
        out+=c(xx+.7*scale,y+1.1*scale,.33*scale,'#fff','opacity=".75"');
        out+=path(`M${num(xx-rx*scale)} ${num(y-1.2*scale)}q${num(rx*scale)} ${num(-2.35*scale)} ${num(rx*2*scale)} 0`,'none',`stroke="#654a40" stroke-width="${num(.42*scale)}" stroke-linecap="round" opacity=".62"`);
      }
      return out;
    }
    function muzzle(x,y,p,color,cat=false,tongue=false) {
      let out=e(x-2.2,y+1.5,3.2,2.4,p.material(color))+e(x+2.2,y+1.5,3.2,2.4,p.material(color));
      out+=path(`M${num(x-1.9)} ${num(y)}Q${num(x)} ${num(y-1.2)} ${num(x+1.9)} ${num(y)}Q${num(x+1.7)} ${num(y+1.6)} ${num(x)} ${num(y+1.9)}Q${num(x-1.7)} ${num(y+1.6)} ${num(x-1.9)} ${num(y)}Z`,p.material(cat?'#c48087':'#3e2c2a','eye'));
      out+=e(x-.6,y,.66,.28,'#fff','opacity=".58"');
      out+=path(`M${num(x)} ${num(y+1.8)}v1.2m0 0q-1.5 1.7-3.1 .3m3.1-.3q1.5 1.7 3.1 .3`,'none','stroke="#694638" stroke-width=".42" stroke-linecap="round"');
      if(tongue)out+=path(`M${num(x-.4)} ${num(y+3.5)}q2-1 3 0v1.3q-1.5 2.6-3 0z`,p.material('#ed8295'))+path(`M${num(x+1.1)} ${num(y+4)}v1.3`,'none','stroke="#c75f77" stroke-width=".3"');
      return out;
    }
    function fur(x,y,w,h,color,count=9) {
      let out='';
      for(let k=0;k<count;k++) {
        const xx=x+((k*7)%count)/count*w, yy=y+(k%3)*h/3;
        out+=path(`M${num(xx)} ${num(yy)}q-.6 1.1-1.3 1.8`,'none',`stroke="${color}" stroke-width=".34" stroke-linecap="round" opacity=".48"`);
      }
      return out;
    }
    function paw(x,y,p,color,width=3.2) {
      return path(`M${num(x-width*.52)} ${num(y-5)}q${num(width*.75)} -1 ${num(width)} .2l.4 4.1q.8 2-1.6 2h-1.3q-1.6-.2-1.1-1.8z`,p.material(color))+e(x+.1,y+.5,width*.7,1.2,p.material(color))+path(`M${num(x-.45)} ${num(y+.3)}v.7m1.1-.7v.7`,'none',`stroke="${shade(color,-.33)}" stroke-width=".25" opacity=".7"`);
    }
    function renderDog(item,geometry,color,type) {
      const tr=dogTraits[type],p=palette(color),[x,y]=geometry.map(.5,.5,0);
      const long=tr.long?1.34:1,small=tr.small?.93:tr.big?1.05:1;
      const hx=x-7-(long-1)*2,hy=y-(tr.short?18.6:21.3),r=9.45*small;
      const bx=x+3,by=y-(tr.short?7.9:9.5),body=12.2*long;
      const cream=tr.cream||'#fff4e4',ear=tr.ear==='long'?shade(color,-.24):shade(color,-.17);
      const main=p.material(color),earPaint=p.material(ear);
      let s=shadow(x,y,body+1);
      const tailStart=x+body+1,tailY=by-2;
      if(tr.tail!=='none') {
        const d=tr.tail==='curl'?`M${num(tailStart)} ${num(tailY)}q11-3 6-12q-4-5-8 0q-1 4 3.6 4.2`:tr.tail==='plume'?`M${num(tailStart-1)} ${num(tailY+1)}q13-3 10-16q-2 7-7 8q-4 1-5 5`:tr.tail==='pom'?`M${num(tailStart)} ${num(tailY)}q6-4 7-10`:`M${num(tailStart)} ${num(tailY)}q10-2 9-12`;
        s+=path(d,tr.tail==='plume'?p.material(tr.whiteTail?cream:color):'none',`stroke="${p.material(tr.whiteTail?cream:color)}" stroke-width="${tr.tail==='curl'?4.7:tr.tail==='plume'?1:3.2}" stroke-linecap="round"`);
        if(tr.tail==='pom')s+=c(tailStart+7,tailY-10,3.8,main);
        if(tr.tail==='plume')s+=fur(tailStart,tailY-10,7,7,shade(color,.4),7);
      }
      s+=paw(bx-7*long,y-1,p,shade(color,-.14))+paw(bx+6*long,y-1,p,shade(color,-.14));
      s+=path(`M${num(bx-body)} ${num(by-2)}C${num(bx-body-1)} ${num(by-10)} ${num(bx+body-3)} ${num(by-10.5)} ${num(bx+body)} ${num(by-2)}C${num(bx+body+2)} ${num(by+6)} ${num(bx+5)} ${num(by+8)} ${num(bx-body+2)} ${num(by+5)}Z`,main);
      if(tr.fluff) {
        for(let k=0;k<9;k++){const a=k*Math.PI*2/9;s+=c(bx+Math.cos(a)*body*.78,by+Math.sin(a)*6.3,3.4,main);}
      }
      s+=e(bx-1,by-4,body*.69,2.6,p.material(shade(color,.19)),'opacity=".38"');
      if(tr.saddle)s+=path(`M${num(bx-5)} ${num(by-7)}q10-3 15 3q-4 6-13 3z`,p.material('#4b3831'));
      if(tr.bib)s+=path(`M${num(hx-3)} ${num(by-7)}q11-2 10 8q-3 8-9 3z`,p.material(cream));
      s+=paw(bx-8*long,y,p,tr.mask?cream:color,3.8)+paw(bx+7*long,y,p,tr.mask?cream:color,3.8);
      s+=fur(bx-body+6,by-3,body*1.1,5,shade(color,.36),tr.fluff?18:9);
      if(['point','large'].includes(tr.ear))for(const side of [-1,1]){
        const ex=hx+side*r*.67,tip=tr.ear==='large'?12:8.5;
        s+=path(`M${num(ex-side*3.3)} ${num(hy-5)}Q${num(ex-side*3.9)} ${num(hy-tip-7)} ${num(ex+side*.7)} ${num(hy-tip-4)}L${num(ex+side*5.2)} ${num(hy-4)}Z`,main);
        s+=path(`M${num(ex-side*1.5)} ${num(hy-6.2)}L${num(ex+side*.7)} ${num(hy-tip-1.8)}L${num(ex+side*3.3)} ${num(hy-5)}Z`,p.material('#e5b3a3'));
      }
      if(tr.headFluff||tr.fluff)for(let k=0;k<13;k++){const a=k*Math.PI*2/13;s+=c(hx+Math.cos(a)*r*.85,hy+Math.sin(a)*r*.8,3.1,main);}
      s+=path(`M${num(hx-r)} ${num(hy)}C${num(hx-r-1)} ${num(hy-r*1.1)} ${num(hx+r)} ${num(hy-r*1.12)} ${num(hx+r)} ${num(hy)}Q${num(hx+r+1)} ${num(hy+r*.89)} ${num(hx)} ${num(hy+r*.88)}Q${num(hx-r-1)} ${num(hy+r*.8)} ${num(hx-r)} ${num(hy)}Z`,main);
      if(tr.mask)s+=path(`M${num(hx-r*.9)} ${num(hy-1)}q${num(r*.4)} -5 ${num(r*.9)} .8q${num(r*.5)} -5.8 ${num(r*.9)} -.8q0 8-${num(r*.9)} 8q-${num(r*.9)} 0-${num(r*.9)} -8Z`,p.material(cream));
      if(tr.bib)s+=e(hx-4.5,hy+3.5,4.2,3.5,p.material(cream))+e(hx+4.5,hy+3.5,4.2,3.5,p.material(cream));
      if(tr.blaze)s+=path(`M${num(hx-1.2)} ${num(hy-r+.7)}h2.4l1.4 8h-5.2z`,p.material(cream));
      if(tr.topknot)s+=c(hx,hy-r+1,4.5,main)+c(hx-3.3,hy-r+1.5,2.8,main);
      s+=fur(hx-r*.6,hy-r*.67,r*1.2,4,shade(color,.52),tr.fluff?14:7);
      s+=e(hx-6.9,hy+3.8,2.2,1.1,'#ec99a4','opacity=".32"')+e(hx+6.9,hy+3.8,2.2,1.1,'#ec99a4','opacity=".3"');
      if(tr.brows||tr.eyebrows)for(const side of [-1,1])s+=e(hx+side*3.8,hy-4.5,2,.95,p.material(tr.eyebrows?'#e7e2dd':shade(color,.42)));
      s+=eyes(hx,hy-.8,3.75,p,tr.eye||'#79503b',small);
      if(tr.beard)s+=path(`M${num(hx-6)} ${num(hy+2)}q6-2 12 0l-1.4 5-2-.9-2.6 1.8-2.6-1.8-2 .9z`,p.material('#d8d6d2'));
      s+=muzzle(hx,hy+3,p,tr.muzzle||shade(color,.37),false,!!tr.tongue);
      if(['drop','long','fold','pom'].includes(tr.ear))for(const side of [-1,1]) {
        const ex=hx+side*r*.91;
        if(tr.ear==='fold')s+=path(`M${num(ex-side*2)} ${num(hy-r*.65)}q${side*5} -1 ${side*5} 4.8l${-side*5} 2.5q${-side*2} -3 0-7.3z`,earPaint);
        else if(tr.ear==='pom'){s+=e(ex,hy+1,3.8,5.5,main)+c(ex+.4,hy+4,3.5,main)+fur(ex-2,hy-1,4,5,shade(color,.42),8);}
        else {const len=tr.ear==='long'?12:9;s+=path(`M${num(ex-side*2)} ${num(hy-r*.55)}C${num(ex+side*5)} ${num(hy-r*.8)} ${num(ex+side*5)} ${num(hy+len)} ${num(ex)} ${num(hy+len)}Q${num(ex-side*4)} ${num(hy+len-1)} ${num(ex-side*2)} ${num(hy-r*.55)}Z`,earPaint);s+=path(`M${num(ex+side*.8)} ${num(hy-2)}q${side*1.5} 4 .2 8`,'none',`stroke="${shade(ear,.3)}" stroke-width=".65" stroke-linecap="round" opacity=".65"`);}
      }
      if(tr.bow)s+=path(`M${num(hx+4)} ${num(hy-r+.9)}l-3.5-2.6v5.2zl3.5-2.6v5.2z`,p.material('#ee8fb3'))+c(hx+4,hy-r+.9,1.2,'#d96594');
      return p.wrap(s);
    }
    function renderCat(item,geometry,color,type) {
      const tr=catTraits[type],p=palette(color),[x,y]=geometry.map(.5,.5,0),body=p.material(color);
      const hx=x-7,hy=y-(tr.short?18.5:20.5),r=tr.round?10.4:9.5,point=tr.points||color;
      let s=shadow(x,y,15);
      s+=path(`M${num(x+12)} ${num(y-7)}q12-1 10-16q-.7-4-3-3q-2 .5-.7 5q2 10-7 8`,'none',`stroke="${p.material(point)}" stroke-width="${tr.fluff?6.8:4.3}" stroke-linecap="round"`);
      if(tr.tabby)s+=path(`M${num(x+19)} ${num(y-18)}l3.2-.4m-3 5.2l3 1`,'none',`stroke="${tr.stripe||shade(color,-.3)}" stroke-width="1.2" stroke-linecap="round"`);
      s+=paw(x-3,y-1,p,shade(point,-.13))+paw(x+10,y-1,p,shade(point,-.13));
      s+=path(`M${num(x-10)} ${num(y-9)}q1-8 13-8q13 .3 13 9q-1 10-16 8q-11 .3-10-9z`,body);
      if(tr.fluff)for(let k=0;k<10;k++){const a=k*Math.PI*2/10;s+=c(x+2+Math.cos(a)*10,y-8+Math.sin(a)*6,3.3,body);}
      if(tr.tuxedo)s+=path(`M${num(x-8)} ${num(y-15)}q9-2 9 6q-2 7-8 4z`,p.material('#fff8ed'));
      if(tr.calico)s+=e(x+7,y-11,6,4,p.material('#dba36e'))+e(x,y-5,4,3,p.material('#493b39'));
      if(tr.tabby)for(const dx of [-2,3,8])s+=path(`M${num(x+dx)} ${num(y-15)}q2 3 .4 6`,'none',`stroke="${tr.stripe||shade(color,-.32)}" stroke-width="1.3" stroke-linecap="round" opacity=".83"`);
      s+=paw(x-4,y,p,tr.tuxedo?'#fff7ec':point,3.8)+paw(x+10,y,p,tr.tuxedo?'#fff7ec':point,3.8);
      s+=fur(x-7,y-11,17,6,shade(color,.4),tr.fluff?19:9);
      for(const side of [-1,1]) {
        const ex=hx+side*r*.74;
        const d=tr.fold?`M${num(ex-side*4)} ${num(hy-6)}q${side*7} -7 ${side*9} -.7l${-side*5} 3.5z`:`M${num(ex-side*3.5)} ${num(hy-6)}L${num(ex+side*.6)} ${num(hy-16)}Q${num(ex+side*1.5)} ${num(hy-17)} ${num(ex+side*2.1)} ${num(hy-14)}L${num(ex+side*5)} ${num(hy-4)}Z`;
        s+=path(d,p.material(point));
        if(!tr.fold)s+=path(`M${num(ex-side*1)} ${num(hy-7)}l${side*2} -6.1 ${side*2.4} 7z`,p.material('#dda6a1'));
        if(tr.tufts)s+=path(`M${num(ex+side*.6)} ${num(hy-16)}l${side*.5} -3.8m-1 2.5l-1-1.8`,'none',`stroke="${shade(color,-.13)}" stroke-width=".55" stroke-linecap="round"`);
      }
      if(tr.fluff)for(let k=0;k<12;k++){const a=k*Math.PI*2/12;s+=c(hx+Math.cos(a)*r*.84,hy+Math.sin(a)*r*.8,3,body);}
      s+=path(`M${num(hx-r)} ${num(hy)}C${num(hx-r)} ${num(hy-r*1.13)} ${num(hx+r)} ${num(hy-r*1.13)} ${num(hx+r)} ${num(hy)}Q${num(hx+r+1)} ${num(hy+r*.9)} ${num(hx)} ${num(hy+r*.91)}Q${num(hx-r-1)} ${num(hy+r*.8)} ${num(hx-r)} ${num(hy)}Z`,body);
      if(tr.points)s+=e(hx,hy+1,8,7,p.material(point));
      if(tr.tuxedo)s+=path(`M${num(hx)} ${num(hy-6)}q1 6 6.5 9q-1 6-6.5 5.5q-5.5 .5-6.5-5.5q5.5-3 6.5-9z`,p.material('#fff7ec'));
      if(tr.calico)s+=path(`M${num(hx-r)} ${num(hy)}q-1-9 8-9.7v9z`,p.material('#dca168'))+path(`M${num(hx+r)} ${num(hy)}q0-9-6.5-9v7.6z`,p.material('#453936'));
      if(tr.tabby) {
        s+=path(`M${num(hx-4)} ${num(hy-r+1.5)}l1.7 4l2.3-3.2l2.3 3.2l1.7-4`,'none',`stroke="${tr.stripe||shade(color,-.35)}" stroke-width=".95" stroke-linecap="round" stroke-linejoin="round"`);
        for(const side of [-1,1])s+=path(`M${num(hx+side*8.7)} ${num(hy+.5)}l${-side*2.3} .3m${side*2.6} 2.2l${-side*2.7} -.1`,'none',`stroke="${tr.stripe||shade(color,-.35)}" stroke-width=".8" stroke-linecap="round"`);
      }
      s+=fur(hx-r*.65,hy-r*.55,r*1.3,3,shade(color,.47),tr.fluff?13:6);
      s+=eyes(hx,hy-.7,3.95,p,tr.eye||'#a39160',1,true);
      s+=e(hx-6.7,hy+4,2,1,'#e89caa','opacity=".3"')+e(hx+6.7,hy+4,2,1,'#e89caa','opacity=".3"');
      s+=muzzle(hx,hy+3.1,p,tr.points?shade(point,.5):'#fcf0e1',true);
      for(const side of [-1,1])s+=path(`M${num(hx+side*5)} ${num(hy+3.6)}l${side*5.3} -.7m${-side*5.2} 2.2l${side*5.5} 1`,'none',`stroke="${shade(color,-.46)}" stroke-width=".33" stroke-linecap="round" opacity=".74"`);
      return p.wrap(s);
    }
    function renderRabbit(item,geometry,color) {
      const p=palette(color),[x,y]=geometry.map(.5,.5,0),body=p.material(color),hx=x-5,hy=y-17;
      let s=shadow(x,y,13)+c(x+12,y-7,4.2,body)+e(x+3,y-9,11,8.6,body)+e(x+8,y-1,5.1,2.4,body)+e(x-4,y-.7,4,2.1,body);
      for(const side of [-1,1]){const ex=hx+side*3.9;s+=e(ex,hy-13.7,3.5,11,body,`transform="rotate(${side*8} ${num(ex)} ${num(hy-13.7)})"`)+e(ex,hy-14,1.6,8,p.material('#e8b0b8'),`transform="rotate(${side*8} ${num(ex)} ${num(hy-14)})"`);}
      s+=e(hx,hy,9.3,8.8,body)+fur(x-3,y-12,12,7,shade(color,-.12),10)+eyes(hx,hy-1,3.4,p,'#8d6358',.86)+muzzle(hx,hy+2.2,p,'#fff8ef',true)+e(hx-6.6,hy+3,2,1,'#efaabd','opacity=".5"')+e(hx+6.6,hy+3,2,1,'#efaabd','opacity=".5"');
      return p.wrap(s);
    }
    function polish(svg,p) {
      // Preserve species geometry and animation classes. Give each original
      // material its own light direction; small eyes receive a separate glint.
      svg=svg.replace(/<(circle|ellipse)\b[^>]*\/>/g,tag=>{
        if(!/fill="#(?:2a2a3a|2E2E38|1F2238)"/i.test(tag))return tag;
        const get=k=>+(tag.match(new RegExp('\\b'+k+'="([^\"]+)"'))||[])[1];
        const r=get('r')||get('rx'),x=get('cx'),yy=get('cy');
        if(!(r>=.8&&r<=2.2&&Number.isFinite(x)&&Number.isFinite(yy)))return tag;
        return tag+c(x-r*.27,yy-r*.32,Math.max(.24,r*.27),'#fff','opacity=".94"');
      });
      return svg.replace(/fill="(#[a-f\d]{3}(?:[a-f\d]{3})?)"/gi,(all,color)=>{
        if(/^#fff(?:fff)?$/i.test(color))return `fill="${p.material('#f7f4ec')}"`;
        return `fill="${p.material(color)}"`;
      });
    }
    function birdDetails(type,geometry,color,p) {
      const tr=birdTraits[type], [x,y]=geometry.map(.5,.5,0),size=tr.size;
      const perch=y-(tr.ground?0:30),bodyY=perch-2-11*size;
      let details='';
      // These feather marks live inside .bird, so hopping and song motion match.
      for(let row=0;row<3;row++)for(let k=0;k<3-row;k++) {
        const xx=x-3.1*size+k*3.1*size+row*.9*size,yy=bodyY+row*3.3*size;
        details+=path(`M${num(xx)} ${num(yy)}q${num(size)} ${num(size*1.5)} ${num(size*2)} 0`,'none',`stroke="${shade(color,-.22)}" stroke-width=".38" stroke-linecap="round" opacity=".55"`);
      }
      if(tr.owl)for(const side of [-1,1])details+=e(x-2*size+side*3.4*size,bodyY-11*size+.7,2.25*size,2.7*size,'#513a29','opacity=".08"');
      return details;
    }
    function finishBird(original,item,geometry,color,type) {
      const p=palette(color),[x,y]=geometry.map(.5,.5,0),tr=birdTraits[type];
      // Larger glossy irises stay in the original head and bird motion group.
      original=original.replace(/<circle\b[^>]*fill="#2a2a3a"[^>]*\/>/gi,tag=>{
        const get=k=>+(tag.match(new RegExp('\\b'+k+'="([^\"]+)"'))||[])[1];
        const ex=get('cx'),ey=get('cy'),r=get('r');
        if(!(r>=1&&r<=2.1))return tag;
        const size=r*(tr.owl?1.13:1.38);
        return e(ex,ey,size,size*1.12,p.material('#483429','eye'))+e(ex,ey+size*.31,size*.72,size*.69,p.material(tr.owl?'#a88043':'#98683d','eye'))+e(ex,ey-.04,size*.52,size*.8,'#251c21')+e(ex-size*.29,ey-size*.44,size*.31,size*.34,'#fff')+c(ex+size*.35,ey+size*.48,size*.13,'#fff','opacity=".7"');
      });
      let svg=polish(original,p),details=birdDetails(type,geometry,color,p);
      // Jo ends with its animated bird group, so details stay in that group.
      svg=svg.replace(/<\/g>\s*$/,details+'</g>');
      if(!tr.ground) {
        let stand='';
        for(const dy of [0,2.7,5.5])stand+=path(`M${num(x-7)} ${num(y-2+dy*.12)}q7 2.5 14 0`,'none','stroke="#dfb884" stroke-width=".45" opacity=".4"');
        stand+=path(`M${num(x-.4)} ${num(y-28)}v23`,'none','stroke="#e9c994" stroke-width=".5" opacity=".52"');
        svg=svg.replace('<g class="bird">',stand+'<g class="bird">');
      }
      // Existing .wing remains untouched and independently animatable.
      return p.wrap(svg);
    }
    function habitatDetail(type,geometry,color,p) {
      const [x,y]=geometry.map(.5,.5,0),isBug=type.startsWith('bg_');
      const cy=y-(isBug?(type==='bg_antfarm'?16:type==='bg_firefly'?0:6):type==='rp_turtle'?14:10);
      let crit='';
      if(type==='rp_turtle') {
        const sy=cy-3;
        crit+=path(`M${num(x-5)} ${num(sy)}l5-4 5 4-1.5 3h-7zM${num(x)} ${num(sy-4)}v7M${num(x-5)} ${num(sy)}l-3-1m13 1l3-1`,'none',`stroke="${shade(color,-.38)}" stroke-width=".52" opacity=".65"`)+e(x-1.5,cy-6,3.5,.8,'#e1efbf','opacity=".43"');
      } else if(type.startsWith('rp_')&&type!=='rp_python') {
        for(let k=0;k<8;k++)crit+=e(x-4+(k%4)*3,cy-4-Math.floor(k/4)*2.3,.5,.32,shade(color,.45),'opacity=".65"');
        crit+=path(`M${num(x-6)} ${num(cy-5)}q5-2 11-.2`,'none',`stroke="${shade(color,.5)}" stroke-width=".45" opacity=".55"`);
      } else if(type==='rp_python')crit+=path(`M${num(x-6)} ${num(cy-7)}q7-3 12 .3`,'none',`stroke="${shade(color,.55)}" stroke-width=".7" opacity=".55"`);
      else if(['bg_rhino','bg_stag'].includes(type))crit+=e(x,cy-6.2,3.7,1.1,'#f6deb3','opacity=".27"')+path(`M${num(x+3)} ${num(cy-7)}q3 2 2.8 4`,'none','stroke="#f7ead0" stroke-width=".55" opacity=".4"');
      else if(type==='bg_ladybug')crit+=e(x+.7,cy-5.5,2,.7,'#fff3df','opacity=".44"');
      else if(type==='bg_butterfly')for(const side of [-1,1])crit+=path(`M${num(x)} ${num(cy-8)}q${side*3} -3 ${side*6} -3m${-side*6} 3q${side*4} -1 ${side*6} 1`,'none','stroke="#6d483d" stroke-width=".35" opacity=".65"');
      else if(type==='bg_firefly')crit+=c(x-4,cy-10,.5,'#fff7d0')+c(x+3,cy-16,.5,'#fff7d0');
      const faceEyes={rp_leopard:[-11,-6,1.35],rp_crested:[-11,-6,1.55],rp_bearded:[-12,-6,1.25],rp_iguana:[-11,-9,1.3],rp_chameleon:[-7,-13,1.55],rp_turtle:[-10,-3.6,1.1],rp_python:[-8.5,-10.5,1.25],bg_rhino:[-7.8,-4.8,.85],bg_stag:[-7.6,-4.6,.8],bg_ladybug:[-5.6,-3.9,.65],bg_mantis:[-8,-14,.9]};
      if(faceEyes[type]) {
        const [dx,dy,r]=faceEyes[type],ex=x+dx,ey=cy+dy;
        crit+=e(ex,ey,r,r*1.1,p.material('#58432c','eye'))+e(ex,ey+r*.28,r*.72,r*.67,p.material('#b39850','eye'))+e(ex,ey,r*.48,r*.76,'#292022')+e(ex-r*.3,ey-r*.4,r*.3,r*.33,'#fff')+c(ex+r*.3,ey+r*.42,r*.12,'#fff','opacity=".68"');
      }
      return crit;
    }
    function finishHabitat(original,item,geometry,color,type) {
      const p=palette(color),[x,y]=geometry.map(.5,.5,0);
      let svg=polish(original,p);
      const extra=habitatDetail(type,geometry,color,p);
      // .crit is a shallow original animal group (no nested group children).
      svg=svg.replace(/(<g class="crit">)([\s\S]*?)(<\/g>)/,(m,a,b,c)=>a+b+extra+c);
      const ant=type==='bg_antfarm',jar=type==='bg_firefly';
      if(ant)svg+=path(`M${num(x-11)} ${num(y-33)}l5-1m-5 3l2-.5`,'none','stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".55"');
      else if(jar)svg+=path(`M${num(x-7)} ${num(y-24)}q-1 8 0 13`,'none','stroke="#fff" stroke-width="1" stroke-linecap="round" opacity=".56"')+e(x+5,y-8,1,2.8,'#fff','opacity=".22"');
      else {
        const isCase=type.startsWith('bg_'),a=geometry.map(isCase?.22:.12,isCase?.72:.82,isCase?20:31),b=geometry.map(isCase?.22:.12,isCase?.72:.82,isCase?9:10);
        svg+=path(`M${num(a[0]+1.7)} ${num(a[1]+2)}L${num(b[0]+1.7)} ${num(b[1]-1)}`,'none','stroke="#fff" stroke-width=".7" stroke-linecap="round" opacity=".55"');
        svg+=path(`M${num(a[0]+5)} ${num(a[1]+4)}l3 -1.5`,'none','stroke="#fff" stroke-width=".5" opacity=".43"');
      }
      return p.wrap(svg);
    }
    function renderZodiac(item,geometry,color,type) {
      const p=palette(color),[x,y]=geometry.map(.5,.5,0),paint=p.material(color);
      const warm=p.material('#f4d2b6'),dark=shade(color,-.36),ink='#4c3532';
      const pt=(dx,dy)=>`${num(x+dx)} ${num(y+dy)}`;
      const line=(d,col=dark,width=.6,more='')=>path(d,'none',`stroke="${col}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${more}`);
      let s=shadow(x,y,15);
      if(type==='zsnake') {
        // Three interlocking coils and a lifted neck, rather than a ball body.
        s+=e(x+1,y-3,13.3,5.3,p.material(shade(color,-.16)));
        s+=path(`M${pt(-11,-4)}C${pt(-8,-12)} ${pt(15,-10)} ${pt(13,-3)}C${pt(12,1)} ${pt(-9,1)} ${pt(-11,-4)}Z`,paint);
        s+=line(`M${pt(-7,-5)}q10 3 17-.7`,shade(color,.48),.7,'opacity=".55"');
        s+=path(`M${pt(-7,-9)}C${pt(-3,-16)} ${pt(13,-14)} ${pt(11,-8)}Q${pt(8,-3)} ${pt(-3,-5)}Q${pt(-9,-5)} ${pt(-7,-9)}Z`,paint);
        s+=line(`M${pt(-3,-10)}q7 2 11-.7`,shade(color,.5),.6,'opacity=".55"');
        s+=path(`M${pt(-4,-10)}C${pt(-11,-11)} ${pt(-13,-19)} ${pt(-9,-25)}L${pt(-4,-24)}Q${pt(-6,-17)} ${pt(0,-12)}Z`,paint);
        s+=path(`M${pt(-8,-24)}q-2 7 3.8 13`,p.material('#efdfaa'));
        for(let k=0;k<4;k++)s+=line(`M${pt(-8.7+k*.35,-20+k*1.8)}l3 -.7`,'#c9b679',.35,'opacity=".6"');
        s+=e(x-7,y-26,8,6.7,paint)+eyes(x-7,y-27,3.35,p,'#b49745',.91);
        s+=e(x-7,y-22.8,5.9,2.8,p.material(shade(color,.36)));
        s+=line(`M${pt(-10,-22)}q3 1.6 6 0`,ink,.4)+line(`M${pt(-7,-21.5)}v3m0 0l-1.5 1.2m1.5-1.2l1.5 1.2`,'#ca7180',.6);
        for(const [xx,yy] of [[2,-4],[7,-6],[2,-10],[-7,-16]])s+=path(`M${pt(xx-1.7,yy)}l1.7-1.1 1.7 1.1-1.7 1.2z`,p.material('#e5d693'));
        s+=e(x-13,y-23.5,1.7,.7,'#efa5aa','opacity=".5"');
        return p.wrap(s);
      }
      if(type==='zrooster') {
        // Curved, individually shaded tail feathers and a layered breast.
        for(const [dx,dy,col] of [[11,-31,'#d99053'],[17,-31,'#447f6c'],[22,-25,'#325e68']]) {
          s+=path(`M${pt(6,-10)}Q${pt(dx+8,dy+3)} ${pt(dx-1,dy)}Q${pt(dx+1,dy+9)} ${pt(3,-15)}Z`,p.material(col));
          s+=line(`M${pt(7,-13)}Q${pt(dx+4,dy+6)} ${pt(dx,dy+2)}`,shade(col,.35),.45,'opacity=".6"');
        }
        for(const dx of [-2,6])s+=line(`M${pt(dx,-4)}v5m0-.5l-3 1m3-1l3 1m-3-1v1.4`,'#b67c40',1.2);
        s+=path(`M${pt(-9,-14)}Q${pt(-8,-24)} ${pt(1,-22)}Q${pt(17,-20)} ${pt(15,-8)}Q${pt(11,1)} ${pt(-1,-3)}Q${pt(-10,-6)} ${pt(-9,-14)}Z`,paint);
        s+=path(`M${pt(-1,-16)}q10-7 12 3q-1 5-10 7q3-3-2-10z`,p.material(shade(color,-.09)));
        for(let k=0;k<4;k++)s+=line(`M${pt(2+k*1.8,-15+k*.6)}q3 2 2 4`,shade(color,-.23),.5);
        s+=e(x-7,y-21,7.4,9,paint);
        s+=path(`M${pt(-12,-27)}Q${pt(-15,-32)} ${pt(-10,-32)}Q${pt(-10,-38)} ${pt(-6,-33)}Q${pt(-2,-37)} ${pt(-.5,-30)}L${pt(-1,-26)}Z`,p.material('#cd615d'));
        s+=eyes(x-7,y-22,2.8,p,'#865c3a',.76);
        s+=path(`M${pt(-10.5,-18.8)}Q${pt(-7,-21)} ${pt(-3.5,-18.8)}L${pt(-7,-15.5)}Z`,p.material('#e9b65f'))+line(`M${pt(-10,-18)}h6`,'#b08447',.35);
        s+=path(`M${pt(-8.5,-15.8)}q-2 6 1.5 6.6q3.6-.6 1.5-6.6z`,p.material('#cd615d'));
        for(let k=0;k<5;k++)s+=line(`M${pt(-5+k*2,-10+(k%2))}q1 1.6 2 0`,shade(color,-.2),.4,'opacity=".5"');
        return p.wrap(s);
      }
      const horse=type==='zhorse',rat=type==='zrat',pig=type==='zpig',ox=type==='zox',sheep=type==='zsheep',tiger=type==='ztiger',monkey=type==='zmonkey',dragon=type==='zdragon';
      const hx=x-7,hy=y-(horse?25:rat?18.5:21),hr=rat?8.5:horse?8:9.1;
      const by=y-(horse?11.4:rat?7.5:9.2),bw=horse?13.6:rat?11:pig?13:12.3;
      // Species tails. Every endpoint stays within the original 60px preview width.
      if(rat)s+=line(`M${pt(10,-5)}q17 3 15-8q-1-5-5-5`,p.material('#dca6ac'),1.8);
      if(pig)s+=line(`M${pt(13,-9)}q8-2 5-7q-3-2-4 1q0 3 3 1`,p.material(shade(color,-.12)),1.6);
      if(monkey)s+=line(`M${pt(12,-6)}q15-1 11-14q-2-7-7-3q-3 4 2 5`,paint,3.2);
      if(horse||ox) {
        s+=line(`M${pt(13,-12)}q8 2 6 11`,p.material(dark),horse?4:1.5);
        s+=path(`M${pt(16,-6)}q5 0 5 6l-2-1-1 2-2-1q-1-3 0-6z`,p.material(dark));
        s+=line(`M${pt(17.4,-5)}q2 2 1.8 4`,shade(dark,.27),.45);
      }
      if(tiger) {
        s+=line(`M${pt(12,-7)}q14 0 9-15`,paint,4.3);
        s+=line(`M${pt(21,-19)}l2.3-.4m-1.6 5.2l2.7.4m-4 4.1l2 1.7`,'#695044',1.1);
      }
      if(sheep)s+=c(x+14,y-8,3.5,paint);
      if(dragon) {
        s+=path(`M${pt(10,-8)}Q${pt(26,-5)} ${pt(23,-22)}Q${pt(21,-15)} ${pt(11,-16)}Z`,paint)+line(`M${pt(15,-10)}q8 0 7-8`,shade(color,.36),.55);
        s+=path(`M${pt(5,-16)}Q${pt(7,-30)} ${pt(16,-31)}L${pt(14,-21)}L${pt(10,-23)}L${pt(8,-17)}Z`,p.material(shade(color,-.24)));
        s+=line(`M${pt(8,-17)}l6-12m-6 12l3-6`,shade(color,.25),.5);
      }
      const legColor=sheep?'#79685d':horse||ox?shade(color,-.16):color;
      for(const dx of [-3,10]) {
        if(horse||ox||sheep) {
          const start=horse?-10:-8;
          s+=path(`M${pt(dx-1.6,start)}h3.8l-.3 10h-3.5z`,p.material(shade(legColor,-.11)))+e(x+dx+.1,y+.7,2.4,1.45,p.material('#665047'));
        } else s+=paw(x+dx,y-1,p,shade(color,-.13),rat?2.9:3.7);
      }
      s+=path(`M${num(x-bw+2)} ${num(by-1)}C${num(x-bw+1)} ${num(by-10)} ${num(x+bw)} ${num(by-10.3)} ${num(x+bw+2)} ${num(by-1)}Q${num(x+bw+3)} ${num(by+7.8)} ${num(x+3)} ${num(by+8)}Q${num(x-bw)} ${num(by+7)} ${num(x-bw+2)} ${num(by-1)}Z`,paint);
      s+=e(x+1,by-4.9,bw*.6,2.3,p.material(shade(color,.13)),'opacity=".38"');
      if(sheep) {
        for(const [dx,dy,r] of [[-6,-14,4.4],[0,-17,4.7],[6,-16,4.8],[11,-13,4.3],[13,-7,4.1],[7,-5,4.6],[1,-4,4.3],[-5,-6,4.4],[-7,-10,4.1],[1,-11,4.7],[7,-10,4.3]]){
          s+=c(x+dx,y+dy,r,paint)+line(`M${pt(dx-1.4,dy-.8)}q-1.4-1.7 1-2q2.2.7 1 2`,shade(color,-.18),.35,'opacity=".55"');
        }
      }
      if(ox)s+=path(`M${pt(1,-17)}q6-4 10 2q-1 5-7 4q-6-.3-3-6z`,p.material('#eee4d2'));
      if(tiger)for(const dx of [-2,3,8])s+=path(`M${pt(dx,-17)}q3 4 1 8l-1-1.4q.7-4-1-6.6z`,p.material('#715044'));
      if(dragon)s+=e(x,y-9,6.8,6.4,p.material('#ebd6a2'));
      if(monkey)s+=e(x,y-8,5.9,6.2,warm);
      if(!sheep)s+=fur(x-5,by-4,17,7,shade(color,.35),horse||rat?12:8);
      for(const dx of [-5,11]) {
        if(horse||ox||sheep) {
          const start=horse?-9:-7;
          s+=path(`M${pt(dx-1.8,start)}q1.8-1.4 4 .3l-.4 9.5q-1.5 1.4-3.7 .2z`,p.material(legColor));
          s+=path(`M${pt(dx-1.9,-1.4)}q2-.7 4.2 0l.5 2q-.7 1.3-4.7 .3z`,p.material('#665047'))+line(`M${pt(dx+.2,-.8)}v1.5`,'#3e302c',.35);
        } else s+=paw(x+dx,y,p,rat?'#dca9a9':dragon?shade(color,.12):color,rat?3:4.1);
      }
      if(dragon) {
        for(const [dx,dy] of [[-1,-17],[4,-18],[9,-16]])s+=path(`M${pt(dx-1.6,dy+1)}l1.6-4.4 2 4.4z`,p.material('#c2d888'));
        for(let row=0;row<2;row++)for(let k=0;k<3;k++)s+=line(`M${pt(3+k*2.7,-12+row*3)}q1 1.5 2 0`,shade(color,-.29),.38,'opacity=".75"');
      }
      if(horse) {
        s+=path(`M${pt(-8,-10)}Q${pt(-14,-18)} ${pt(-11,-27)}L${pt(-2,-28)}Q${pt(-6,-19)} ${pt(-1,-11)}Z`,paint);
        s+=path(`M${pt(-4,-30)}q8 3 5 14l-2-1-.5 4-2-1q2-10-3-13z`,p.material(dark));
        for(let k=0;k<3;k++)s+=line(`M${pt(-2+k,-28+k)}q4 5 1 10`,shade(dark,.25),.4);
      }
      // Ears sit behind the face; their silhouettes remain species-specific.
      if(rat||monkey||tiger)for(const side of [-1,1]) {
        const ex=hx+side*(rat?7.1:8.2),ey=hy-(rat?6.7:monkey?1.4:6.1),rr=rat?5.6:monkey?4.4:3.6;
        s+=c(ex,ey,rr,paint)+e(ex,ey+.4,rr*.61,rr*.66,p.material(rat?'#dfacb3':monkey?'#e9c4a4':'#dca87e'));
      }
      if(pig)for(const side of [-1,1])s+=path(`M${num(hx+side*4)} ${num(hy-6)}Q${num(hx+side*10)} ${num(hy-16)} ${num(hx+side*11)} ${num(hy-9)}L${num(hx+side*8)} ${num(hy-3)}Z`,p.material(shade(color,-.09)));
      if(horse)for(const side of [-1,1]) {
        const ex=hx+side*4.6;
        s+=path(`M${num(ex-2.1)} ${num(hy-5.8)}Q${num(ex-1.7)} ${num(hy-16)} ${num(ex+1)} ${num(hy-14)}L${num(ex+3.1)} ${num(hy-5)}Z`,paint)+e(ex+.5,hy-10,1,3,p.material('#ba8a79'));
      }
      if(ox||sheep)for(const side of [-1,1]) {
        const ex=hx+side*10;
        s+=e(ex,hy-2.5,4.6,2.8,p.material(sheep?'#948375':shade(color,-.09)),`transform="rotate(${side*20} ${num(ex)} ${num(hy-2.5)})"`)+e(ex,hy-2.5,2.8,1.25,p.material('#d5b0a1'));
      }
      if(ox||dragon)for(const side of [-1,1]) {
        const ex=hx+side*5.2;
        s+=path(`M${num(ex-side*1.7)} ${num(hy-7)}Q${num(ex+side*5.4)} ${num(hy-9)} ${num(ex+side*4.7)} ${num(hy-16)}Q${num(ex+side*2)} ${num(hy-10.8)} ${num(ex-side*.8)} ${num(hy-10)}Z`,p.material(dragon?'#e5c375':'#e7d7b9'));
      }
      const faceColor=sheep?'#8b796b':color,face=p.material(faceColor);
      if(horse)s+=e(hx,hy,8.3,10.4,face);
      else s+=path(`M${num(hx-hr)} ${num(hy)}C${num(hx-hr)} ${num(hy-hr*1.14)} ${num(hx+hr)} ${num(hy-hr*1.13)} ${num(hx+hr)} ${num(hy)}Q${num(hx+hr+1)} ${num(hy+hr*.85)} ${num(hx)} ${num(hy+hr*.88)}Q${num(hx-hr-1)} ${num(hy+hr*.83)} ${num(hx-hr)} ${num(hy)}Z`,face);
      if(monkey)s+=path(`M${num(hx)} ${num(hy-5.5)}C${num(hx-7)} ${num(hy-11)} ${num(hx-10)} ${num(hy-.5)} ${num(hx-6.8)} ${num(hy+3)}Q${num(hx-4)} ${num(hy+8.3)} ${num(hx)} ${num(hy+7.3)}Q${num(hx+4)} ${num(hy+8.3)} ${num(hx+6.8)} ${num(hy+3)}C${num(hx+10)} ${num(hy-.5)} ${num(hx+7)} ${num(hy-11)} ${num(hx)} ${num(hy-5.5)}Z`,warm);
      if(tiger) {
        s+=e(hx-4.1,hy+3.6,4,3.5,p.material('#fff0d8'))+e(hx+4.1,hy+3.6,4,3.5,p.material('#fff0d8'));
        for(const side of [-1,1])s+=path(`M${num(hx+side*8.7)} ${num(hy)}l${-side*3} 1l${side*2.8} 1m${-side*1.1} 2l${-side*2} .5`,p.material('#715044'));
        s+=path(`M${num(hx-4.5)} ${num(hy-7.8)}l2 4 1-3 1.5 3 1.5-3 1 3 2-4`, 'none','stroke="#715044" stroke-width="1.1" stroke-linejoin="round"');
      }
      if(horse)s+=path(`M${num(hx-1)} ${num(hy-9)}h2l1 13h-4z`,p.material('#f2e4d0'));
      if(sheep)for(const [dx,dy,r] of [[-6,-7,3.2],[-2,-9,3.6],[3,-8.3,3.6],[7,-6,2.8]])s+=c(hx+dx,hy+dy,r,paint)+line(`M${num(hx+dx-1)} ${num(hy+dy-.7)}q-1-1 1-1`,shade(color,-.18),.35);
      if(dragon)s+=path(`M${num(hx-2)} ${num(hy-8)}l2-5 2 5z`,p.material('#c2d888'));
      if(!sheep&&!monkey)s+=fur(hx-5.3,hy-6.9,10.6,3.5,shade(color,.4),rat?8:6);
      s+=eyes(hx,hy-(horse?1.8:.6),horse?3.1:rat?3.5:3.8,p,dragon?'#9b9450':tiger?'#a58a47':'#7d573e',horse?.86:rat?.94:1);
      if(ox) {
        s+=e(hx,hy+5,6.9,4.6,p.material('#e3b497'))+e(hx-2.7,hy+4.5,1.1,1.45,p.material('#825444','eye'))+e(hx+2.7,hy+4.5,1.1,1.45,p.material('#825444','eye'))+line(`M${num(hx-3)} ${num(hy+7.4)}q3 1.6 6 0`,'#9e6e5d',.45);
      } else if(pig) {
        s+=e(hx,hy+4.4,5.4,3.8,p.material(shade(color,-.1)))+e(hx-1.9,hy+4.4,1,1.45,p.material('#a96973','eye'))+e(hx+1.9,hy+4.4,1,1.45,p.material('#a96973','eye'))+e(hx-1.2,hy+2.3,1.6,.42,'#fff2ed','opacity=".5"');
      } else if(horse) {
        s+=e(hx,hy+6.7,6.6,4.7,p.material(shade(color,.35)))+e(hx-3.1,hy+6.5,1,1.25,p.material(dark,'eye'))+e(hx+3.1,hy+6.5,1,1.25,p.material(dark,'eye'))+line(`M${num(hx-3)} ${num(hy+9.5)}q3 1.1 6 0`,dark,.42);
        s+=path(`M${num(hx-7)} ${num(hy-8)}Q${num(hx+1)} ${num(hy-13)} ${num(hx+7)} ${num(hy-7)}L${num(hx+3)} ${num(hy-3)}L${num(hx+1)} ${num(hy-5)}L${num(hx-2)} ${num(hy-2)}L${num(hx-3)} ${num(hy-5)}Z`,p.material(dark))+line(`M${num(hx-3)} ${num(hy-8)}q4-2 7 1`,shade(dark,.4),.55);
      } else if(rat)s+=muzzle(hx,hy+3,p,'#edcec8',true)+line(`M${num(hx-5)} ${num(hy+4)}l-6-1m6 2l-6 1m16-2l6-1m-6 2l6 1`,'#9b7b7d',.33);
      else if(monkey)s+=e(hx,hy+3.5,3.5,2.5,p.material('#ebc2a2'))+e(hx-1,hy+2.1,.55,.38,ink)+e(hx+1,hy+2.1,.55,.38,ink)+line(`M${num(hx-3.3)} ${num(hy+4.4)}q3.3 3 6.6 0`,ink,.5);
      else if(dragon) {
        s+=e(hx,hy+4.1,6.2,3.6,p.material(shade(color,.31)))+c(hx-2.7,hy+3.7,.6,dark)+c(hx+2.7,hy+3.7,.6,dark)+line(`M${num(hx-3)} ${num(hy+6)}q3 1.2 6 0`,dark,.4);
        for(const side of [-1,1])s+=line(`M${num(hx+side*5)} ${num(hy+4.5)}q${side*7} 3 ${side*10} -1`,p.material('#d9c47c'),.65);
      } else s+=muzzle(hx,hy+3.1,p,tiger?'#fff2dc':sheep?'#cfbbaa':shade(color,.34),true);
      if(!horse)for(const side of [-1,1])s+=e(hx+side*6.7,hy+4,1.7,.85,'#eb9daa',`opacity="${pig?.42:.24}"`);
      return p.wrap(s);
    }
    let count=0;
    for(const [type,item] of Object.entries(q)) {
      if(!item.pet)continue;
      const key=api.jo?api.jo(type):type,original=Re[key];
      if(typeof original!=='function')continue;
      // Current catalog has distinct pet keys; wrapping by key also supports aliases.
      if(original.ojjudaPetArtVersion)continue;
      const upgraded=function(instance,geometry,color,room) {
        const actualType=(instance&&instance.type&&q[instance.type])?instance.type:type;
        const base=safeColor(color,q[actualType].color||item.color);
        if(dogTraits[actualType])return renderDog(instance,geometry,base,actualType);
        if(catTraits[actualType])return renderCat(instance,geometry,base,actualType);
        if(actualType==='bunny')return renderRabbit(instance,geometry,base);
        if(/^z(?:rat|ox|tiger|dragon|snake|horse|sheep|monkey|rooster|pig)$/.test(actualType))return renderZodiac(instance,geometry,base,actualType);
        const source=original(instance,geometry,base,room);
        if(birdTraits[actualType])return finishBird(source,instance,geometry,base,actualType);
        if(q[actualType].pg==='reptile'||q[actualType].pg==='bug')return finishHabitat(source,instance,geometry,base,actualType);
        return source;
      };
      upgraded.ojjudaPetArtVersion=2;
      Re[key]=upgraded;count++;
    }
    installed.add(Re);
    return Re;
  }
  function enhanceCareScene(svg) {
    if(typeof svg!=='string'||!svg.includes('ps-arm')||svg.includes('data-ojjuda-care-art'))return svg;
    const id='oca'+(++serial).toString(36);
    const mix=(hex,amount)=>{
      let v=hex.replace('#','');if(v.length===3)v=v.split('').map(x=>x+x).join('');
      return '#'+[0,2,4].map(i=>{const c=parseInt(v.slice(i,i+2),16);return Math.round(c+((amount<0?0:255)-c)*Math.abs(amount)).toString(16).padStart(2,'0');}).join('');
    };
    let defs='';
    svg=svg.replace(/(<g class="ps-arm"><g transform="translate\(-13\.5 38\)">)([\s\S]*?)(<g class="held held-bowl")/,function(all,start,arm,end){
      const sleeve=(arm.match(/<rect x="10" y="-40"[^>]*fill="(#[a-f\d]{3}(?:[a-f\d]{3})?)"/i)||[])[1];
      const skin=(arm.match(/<circle cx="13\.5" cy="-22"[^>]*fill="(#[a-f\d]{3}(?:[a-f\d]{3})?)"/i)||[])[1];
      if(!sleeve||!skin)return all;
      const gradient=(key,color)=>`<linearGradient id="${id+key}" x1="0" y1="0" x2="1" y2=".35"><stop offset="0" stop-color="${mix(color,.2)}"/><stop offset=".45" stop-color="${color}"/><stop offset="1" stop-color="${mix(color,-.16)}"/></linearGradient>`;
      defs=gradient('s',sleeve)+gradient('k',skin);
      // The original shoulder pivot and hand location remain unchanged.
      const enhanced=`<path data-ojjuda-care-art="2" d="M10.1-37.8Q9.5-40.6 12.4-41Q16.2-41.5 17-37.5L17.2-25Q16.9-22.8 13.7-22.8Q10.5-22.8 10.4-25Z" fill="url(#${id}s)"/><path d="M10.7-25Q13.7-23.6 16.8-25" fill="none" stroke="${mix(sleeve,-.2)}" stroke-width=".65" opacity=".65"/><path d="M11.6-38.4Q11-34.5 11.7-29" fill="none" stroke="${mix(sleeve,.34)}" stroke-width=".55" opacity=".55"/><ellipse cx="13.5" cy="-21.6" rx="3.35" ry="3.65" fill="url(#${id}k)"/><path d="M11.1-22.5q1.2-1.6 1.7.4" fill="none" stroke="${mix(skin,-.18)}" stroke-width=".45" stroke-linecap="round" opacity=".5"/>`;
      return start+enhanced+end;
    });
    // New avatar eyes are larger. Cover the old eyes completely before the
    // production heart glyph appears; heart animation and skin color stay intact.
    svg=svg.replace(/(<g class="ps-heye">)([\s\S]*?)(<\/g>)/,(all,start,content,end)=>start+content.replace(/<circle cx="(-?7)" cy="-58" r="3\.4" fill="([^"]+)"\/>/g,'<ellipse cx="$1" cy="-58" rx="4.4" ry="5.1" fill="$2"/>')+end);
    return defs?svg.replace(/(<svg\b[^>]*>)/,'$1<defs>'+defs+'</defs>'):svg;
  }
  global.OjjudaPetArt = Object.freeze({version:2,install,enhanceCareScene});
})(typeof window!=='undefined'?window:globalThis);
