/* Ojjuda Avatar Studio: Classic Tweed / female-r01.
   Creates six pose-specific transparent PNG variants per item from the approved
   fitted art masks. No pose stretching, face replacement, or alpha expansion. */
(() => {
  'use strict';
  const id='classic02';
  const designs=[
    ['hair','에스프레소 웨이브'],
    ['accessory','실버 펄 하트'],
    ['top','아이보리 트위드 카디건'],
    ['bottom','네이비 타탄 플리츠'],
    ['shoes','블랙 실버 버클 부츠'],
    ['bag','버건디 퀼팅 크로스백']
  ];
  const clamp=n=>Math.max(0,Math.min(255,Math.round(n)));
  const lum=(r,g,b)=>.2126*r+.7152*g+.0722*b;
  function bounds(data,w,h) {
    let x0=w,y0=h,x1=-1,y1=-1,count=0,maxRow=0;
    const rows=new Uint32Array(h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(data[(y*w+x)*4+3]===0)continue;
      x0=Math.min(x0,x);y0=Math.min(y0,y);
      x1=Math.max(x1,x);y1=Math.max(y1,y);count++;rows[y]++;
    }
    for(const n of rows)maxRow=Math.max(maxRow,n);
    if(!count)throw Error('빈 아이템 레이어');
    let bodyY=y0;
    while(bodyY<y1&&rows[bodyY]<maxRow*.45)bodyY++;
    return {x0,y0,x1,y1,count,bodyY};
  }
  function shade(kind,r,g,b,x,y,box) {
    const L=lum(r,g,b), w=Math.max(1,box.x1-box.x0),h=Math.max(1,box.y1-box.y0);
    const u=(x-box.x0)/w,v=(y-box.y0)/h, X=x-box.x0,Y=y-box.y0;
    const weave=((X+Y)%4===0?7:0)-((X-Y+10000)%4===0?5:0);
    switch(kind) {
      case 'hair': {
        const q=12+L*.73;
        return [q*1.04+5,q*.88+3,q*.87+5];
      }
      case 'accessory': {
        const q=75+L*.68;
        return [q+5,q+9,q+18];
      }
      case 'top': {
        // Fine ivory woven fabric, with dark lower ribbing; keep original fold shading.
        const q=122+L*.55+weave;
        const trim=v>.94&&v<.99;
        if(trim)return [38+L*.29,43+L*.3,56+L*.32];
        const fleck=(X%7===1&&Y%5===1)?-25:0;
        return [q+18+fleck,q+13+fleck,q+2+fleck];
      }
      case 'bottom': {
        // Double-stripe tartan drawn over each pose's fitted pleat layer.
        const q=12+L*.64;
        const px=((u*7.5)%1+1)%1,py=((v*6.2)%1+1)%1;
        const stripe=px<.065||py<.075, fine=(px>.12&&px<.145)||(py>.15&&py<.18);
        const cross=(px<.065&&py<.075);
        const band=(px<.24||py<.24)?10:0;
        const accent=cross?53:stripe?28:fine?17:0;
        return [q+band+accent*.97,q+8+band+accent,q+23+band+accent*.88];
      }
      case 'shoes': {
        const metal=r>b*1.17&&L>132;
        const q=metal?58+L*.78:8+L*.63;
        return [q,q+2,q+5];
      }
      case 'bag': {
        const metal=r>b*1.35&&g>b*1.22&&L>157;
        if(metal){const q=55+L*.75;return [q,q+3,q+9]}
        // Diamond quilting on the bag body only; the strap stays smooth.
        const onBody=y>=box.bodyY;
        const pitch=Math.max(5,Math.round(w*.105));
        const a=((X+Y)%pitch+pitch)%pitch,b2=((X-Y)%pitch+pitch)%pitch;
        const stitch=onBody&&(a===0||b2===0),shine=onBody&&(a===1||b2===1);
        const q=L*.58+(stitch?-13:shine?9:0);
        return [47+q*1.03,10+q*.58,27+q*.69];
      }
      default: throw Error('알 수 없는 아이템');
    }
  }
  function decode(url,w,h) {
    return new Promise((resolve,reject)=>{
      const im=new Image();
      im.onload=()=>{
        try {
          if(im.naturalWidth!==w||im.naturalHeight!==h)throw Error('원본 규격 불일치');
          const c=document.createElement('canvas');c.width=w;c.height=h;
          const ctx=c.getContext('2d',{willReadFrequently:true});
          if(!ctx)throw Error('Canvas 사용 불가');
          ctx.drawImage(im,0,0);
          resolve({c,ctx});
        } catch(e){reject(e)}
      };
      im.onerror=()=>reject(Error('원본 이미지 읽기 실패'));im.src=url;
    });
  }
  async function createVariant(source,kind,w,h) {
    const {c,ctx}=await decode(source,w,h);
    const im=ctx.getImageData(0,0,w,h),data=im.data;
    const box=bounds(data,w,h),before=new Uint8Array(w*h);
    for(let i=0,j=3;i<before.length;i++,j+=4)before[i]=data[j];
    let changed=0;
    for(let y=box.y0;y<=box.y1;y++)for(let x=box.x0;x<=box.x1;x++){
      const i=(y*w+x)*4;
      if(!data[i+3])continue;
      const rgb=shade(kind,data[i],data[i+1],data[i+2],x,y,box).map(clamp);
      if(rgb.some((q,k)=>Math.abs(q-data[i+k])>3))changed++;
      data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];
    }
    if(changed<Math.max(1,box.count*.25))throw Error('새 디자인 변화 부족');
    ctx.putImageData(im,0,0);
    const verify=ctx.getImageData(0,0,w,h).data;
    for(let i=0,j=3;i<before.length;i++,j+=4)
      if(before[i]!==verify[j])throw Error('레이어 경계 불일치');
    const png=c.toDataURL('image/png');
    if(!/^data:image\/png;base64,/.test(png)||png.length>3000000)throw Error('PNG 규격 불일치');
    return png;
  }
  async function build(D) {
    if(D.template!=='female-r01'||D.canvas[0]!==400||D.canvas[1]!==656)throw Error('지원하지 않는 아바타 템플릿');
    const [w,h]=D.canvas,poses=D.poses.map(p=>p.id);
    if(poses.join(',')!=='basic,pure,cute,chic,lively,mini')throw Error('포즈 규격 불일치');
    const items=[],look={name:'클래식 트위드',bg:1,expression:null};
    for(const [category,name] of designs){
      const source=D.items.find(i=>i.id==='casual01-'+category);
      if(!source||poses.some(p=>!source.variants[p]))throw Error('기준 레이어 누락: '+category);
      const variants={};
      for(const p of poses)variants[p]=await createVariant(source.variants[p],category,w,h);
      const item={id:id+'-'+category,name,category,kind:'art',concept:id,variants};
      items.push(item);look[category]=item.id;
    }
    if(items.length!==6||items.some(i=>Object.keys(i.variants).length!==6))throw Error('의상세트 규격 불일치');
    return {items,look};
  }
  window.OjjudaWardrobeV53=Object.freeze({build});
})();
