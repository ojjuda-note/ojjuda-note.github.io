/* Original storybook artwork and the flat puzzle's local picture collection. */
(function () {
  'use strict';
  const COLLECTION_KEY='ojjuda-screw-flat-pictures-v1';
  const PICTURES=[
    {id:'window-cat',name:'창가 고양이',colors:['#F6DFC2','#FFF4E6']},
    {id:'rabbit-tea',name:'토끼의 찻시간',colors:['#F4DDD9','#FFF4E9']},
    {id:'bear-picnic',name:'곰의 소풍',colors:['#DCECCF','#FFF2D5']},
    {id:'puppy-beach',name:'강아지의 바다',colors:['#D4EBEF','#FFF0D7']},
    {id:'cozy-room',name:'포근한 우리집',colors:['#EFDBC1','#FFF0DF']}
  ];
  const images=new Map();
  function readCollection(){
    try{const saved=JSON.parse(localStorage.getItem(COLLECTION_KEY)||'[]');return new Set(Array.isArray(saved)?saved.filter(id=>PICTURES.some(p=>p.id===id)):[]);}
    catch(_){return new Set();}
  }
  function collect(index,current){
    const collection=new Set([...readCollection(),...current,PICTURES[index].id]);
    try{localStorage.setItem(COLLECTION_KEY,JSON.stringify([...collection]));}catch(_){/* Keep this session usable if storage is unavailable. */}
    return collection;
  }
  function preload(index,retry=false){
    if(typeof Image==='undefined')return null;
    let entry=images.get(index);
    if(!entry||(retry&&entry.failed)){
      const img=new Image();entry={img,failed:false};images.set(index,entry);
      img.decoding='async';img.onerror=()=>{entry.failed=true;};
      img.src='/assets/screw-flat/'+PICTURES[index].id+'-v1.webp';
    }
    return entry;
  }
  function rounded(c,x,y,w,h,r){
    c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();
  }
  function draw(c,index,x,y,w,h,contain=false){
    const picture=PICTURES[index],entry=preload(index),img=entry?.img;
    c.save();rounded(c,x,y,w,h,Math.min(25,w*.08));c.clip();
    const bg=c.createLinearGradient(0,y,0,y+h);bg.addColorStop(0,picture.colors[0]);bg.addColorStop(1,picture.colors[1]);
    c.fillStyle=bg;c.fillRect(x,y,w,h);
    if(img?.complete&&img.naturalWidth>0){
      const scale=(contain?Math.min:Math.max)(w/img.naturalWidth,h/img.naturalHeight),dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
      c.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh);
    }else{
      c.textAlign='center';c.textBaseline='middle';c.fillStyle='#A5917F';
      c.font='12px "Noto Sans KR",sans-serif';c.fillText(entry?.failed?'그림을 불러오지 못했어요':'그림을 불러오는 중이에요',x+w/2,y+h/2,w-12);
    }
    c.restore();
  }
  const api={PICTURES,COLLECTION_KEY,readCollection,collect,preload,draw};
  if(typeof window!=='undefined')window.OjjudaFlatPictures=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})();
