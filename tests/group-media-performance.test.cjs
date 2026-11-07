const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../groups/app.js'),'utf8');
const userId='00000000-0000-4000-8000-000000000001',roomId='10000000-0000-4000-8000-000000000001',postId='20000000-0000-4000-8000-000000000001';
const photo=`${userId}/${roomId}/${postId}/30000000-0000-4000-8000-000000000001.jpg`;
const preview=photo.replace(/\.jpg$/,'.thumb.webp');
const tick=(ms=35)=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,timeout=1500){const started=Date.now();while(!check()){if(Date.now()-started>timeout)throw Error('expected media state did not arrive');await tick(10);}}

function fixture({media=[],download,upload,autoObserve=true}={}){
 const dom=new JSDOM('<main id="app"></main><div id="toast"></div>',{url:`https://ojjuda.kr/groups/#room=${roomId}`,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 const downloads=[],uploads=[],uploadedObjects=[],removed=[],revoked=[],calls=[];let authChange,blobId=0;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.IntersectionObserver=class{
  constructor(callback){this.callback=callback;this.dead=false;}
  observe(target){if(autoObserve)setTimeout(()=>{if(!this.dead&&target.isConnected)this.callback([{target,isIntersecting:true,boundingClientRect:{top:0}}]);},0);}
  unobserve(){}disconnect(){this.dead=true;}
 };
 w.URL.createObjectURL=()=>`blob:group-${++blobId}`;
 w.URL.revokeObjectURL=url=>revoked.push(url);
 w.OJJUDA_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseKey:'public'};
 const room={id:roomId,name:'느긋한 모임',owner_id:userId,member_count:2,created_at:'2026-11-07T04:00:00Z'};
 const entries=media.length?[{id:postId,room_id:roomId,room_name:room.name,author_id:userId,author_name:'그룹원',kind:'post',body:'사진 모음',title:'',created_at:'2026-11-07T04:00:00Z',updated_at:'2026-11-07T04:00:00Z',media,comment_count:0}]:[];
 const client={
  auth:{getUser:async()=>({data:{user:{id:userId}}}),onAuthStateChange:cb=>{authChange=cb;}},
  storage:{from:()=>({
   download:async path=>{downloads.push(path);return download?download(path,w):{data:new w.Blob(['image'],{type:'image/webp'})};},
   upload:async(path,data,options)=>{uploads.push({path,data,options});const response=upload?await upload(path,data,options):{};if(!response?.error)uploadedObjects.push(path);return response;},
   remove:async paths=>{removed.push(...paths);return {};} })},
  rpc:async(name,args)=>{
   let data=[],action=args.p_action,payload=args.p_payload||{};calls.push({name,action,payload});
   if(name==='group_home')data={rooms:[room],directory:[{...room,is_member:true}],invitations:[]};
   if(name==='group_board'){
    if(action==='rooms')data=[room];
    if(action==='feed')data=entries;
    if(action==='save'){
     data={...payload,media:payload.media.map(file=>({...file,mime:'image/jpeg',size:600000,...(uploadedObjects.includes(file.path.replace(/\.[^.]+$/,'.thumb.webp'))?{preview_path:file.path.replace(/\.[^.]+$/,'.thumb.webp')}: {})}))};
    }
   }
   return {data};
  }
 };
 w.supabase={createClient:()=>client};w.eval(source);
 return {dom,w,downloads,uploads,removed,revoked,calls,authChange:()=>authChange};
}

test('private feed loads lightweight preview, reuses original for gallery and reentry, and purges on account switch',async()=>{
 const f=fixture({media:[{path:photo,preview_path:preview,mime:'image/jpeg',size:600000,name:'추억.jpg'}]});
 try{
  await tick(70);
  const d=f.w.document,slot=d.querySelector('.media-slot');
  assert.equal(slot?.dataset.loaded,'yes');
  assert.deepEqual(f.downloads,[preview],'list does not fetch the full-resolution original');
  slot.querySelector('img').click();await tick();
  assert.deepEqual(f.downloads,[preview,photo],'gallery fetches the original once');
  assert.equal(d.querySelector('.gallery-stage img')?.alt,'추억.jpg');
  d.querySelector('.lightbox [data-close]').click();
  slot.querySelector('img').click();await tick();
  assert.equal(f.downloads.length,2,'reopening the gallery reuses the same authorized blob');
  d.querySelector('.lightbox [data-close]').click();
  d.querySelector('[data-action="home"]').click();await tick();
  d.querySelector(`[data-room="${roomId}"]`).click();await tick(70);
  assert.equal(f.downloads.length,2,'returning to a room reuses the cached thumbnail');
  f.authChange()('SIGNED_OUT',null);await tick();
  assert.match(d.body.textContent,/로그인/);
  assert.ok(f.revoked.length>=2,'authorization changes release every private image URL');
 }finally{f.dom.window.close();}
});

test('new images create small private WebP sidecars while preserving the original and cleaning neither linked file',async()=>{
 const f=fixture({autoObserve:false});
 try{
  const w=f.w,d=w.document;
  w.createImageBitmap=async()=>({width:2400,height:1600,close(){}});
  w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
  w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new w.Blob([new Uint8Array(80000)],{type:'image/webp'}));};
  await tick();d.querySelector('[data-action="compose"]').click();
  const file=new w.File([new Uint8Array(600000)],'trip.jpg',{type:'image/jpeg'}),input=d.querySelector('#files');
  Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new w.Event('change'));
  d.querySelector('#composer').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await tick(100);
  assert.equal(f.uploads.length,2,'thumbnail and original are uploaded as separate private objects');
  assert.match(f.uploads[0].path,/\.thumb\.webp$/);
  assert.equal(f.uploads[0].options.contentType,'image/webp');
  assert.match(f.uploads[1].path,/\.jpg$/);
  assert.equal(f.uploads[1].data,file,'the original file is unmodified');
  const saved=f.calls.find(x=>x.action==='save');
  assert.equal(saved?.payload.media.length,1,'the thumbnail does not count as a second attachment');
  assert.deepEqual(f.removed,[],'linked originals and previews are not cleaned as orphan files');
 }finally{f.dom.window.close();}
});

test('a failed thumbnail upload never blocks the original image from being saved',async()=>{
 const f=fixture({autoObserve:false,upload:path=>path.endsWith('.thumb.webp')?{error:Error('thumbnail unavailable')}:{} });
 try{
  const w=f.w,d=w.document;
  w.createImageBitmap=async()=>({width:2400,height:1600,close(){}});
  w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
  w.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new w.Blob([new Uint8Array(80000)],{type:'image/webp'}));};
  await tick();d.querySelector('[data-action="compose"]').click();
  const file=new w.File([new Uint8Array(600000)],'trip.jpg',{type:'image/jpeg'}),input=d.querySelector('#files');
  Object.defineProperty(input,'files',{configurable:true,value:[file]});input.dispatchEvent(new w.Event('change'));
  d.querySelector('#composer').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>!f.w.document.querySelector('#composer'));
  assert.equal(f.uploads.length,2,'original upload still runs after preview failure');
  assert.deepEqual(f.removed,[],'only successfully uploaded files are considered for cleanup');
  assert.equal(f.w.document.querySelector('#composer'),null,'a valid original completes the save');
 }finally{f.dom.window.close();}
});

test('nearby images are limited to three concurrent authenticated downloads',async()=>{
 let active=0,peak=0;const waiting=[];
 const files=Array.from({length:8},(_,i)=>({path:photo.replace('000000000001.jpg',`${String(i+1).padStart(12,'0')}.jpg`),mime:'image/jpeg',name:'사진'+i}));
 const f=fixture({media:files,download:(_path,w)=>new Promise(resolve=>{active++;peak=Math.max(peak,active);waiting.push(()=>{active--;resolve({data:new w.Blob(['ok'],{type:'image/webp'})});});})});
 try{
  await tick(70);assert.equal(f.downloads.length,3);assert.equal(peak,3);
  while(waiting.length){waiting.shift()();await tick(5);}
  await tick(80);
  assert.equal(f.downloads.length,8);assert.ok(peak<=3,'large feeds never start every photo transfer together');
 }finally{f.dom.window.close();}
});

test('an old image still renders when a saved thumbnail cannot be downloaded',async()=>{
 const f=fixture({media:[{path:photo,preview_path:preview,mime:'image/jpeg',name:'기존 사진'}],download:(path,w)=>path===preview?{error:Error('missing thumbnail')}:{data:new w.Blob(['original'],{type:'image/jpeg'})}});
 try{
  await tick(80);
  assert.equal(f.w.document.querySelector('.media-slot img')?.alt,'기존 사진');
  assert.deepEqual(f.downloads,[preview,photo],'a damaged thumbnail never hides the original');
 }finally{f.dom.window.close();}
});

test('account changes discard unfinished private downloads before a blob can be displayed',async()=>{
 let complete;
 const f=fixture({media:[{path:photo,mime:'image/jpeg',name:'비공개 사진'}],download:(_path,w)=>new Promise(resolve=>{complete=()=>resolve({data:new w.Blob(['late'],{type:'image/jpeg'})});})});
 try{
  await until(()=>f.downloads.length===1);
  f.authChange()('SIGNED_OUT',null);complete();await tick(50);
  assert.equal(f.w.document.querySelector('.media-slot'),null);
  assert.equal(f.revoked.length,0,'the stale blob never receives a visible URL');
 }finally{f.dom.window.close();}
});

test('gallery buttons, mouse wheel and keyboard zoom the full image, then reset for video',async()=>{
 const video=photo.replace(/\.jpg$/,'.mp4');
 const f=fixture({media:[{path:photo,mime:'image/jpeg',name:'풍경.jpg'},{path:video,mime:'video/mp4',name:'여행.mp4'}]});
 try{
  await tick(85);const w=f.w,d=w.document;
  d.querySelector('.media-slot img').click();await tick(45);
  const modal=d.querySelector('.lightbox'),stage=modal.querySelector('.gallery-stage'),bar=modal.querySelector('.gallery-zoom');
  assert.equal(bar.hidden,false,'photo has visible zoom controls');
  assert.equal(stage.dataset.zoomable,'true');
  bar.querySelector('[data-zoom-in]').click();
  assert.equal(bar.querySelector('[data-zoom-reset]').textContent,'150%');
  assert.match(stage.querySelector('img').style.transform,/scale\(1\.5\)/);
  const wheel=new w.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:-100,clientX:20,clientY:20});
  stage.dispatchEvent(wheel);assert.equal(wheel.defaultPrevented,true);
  assert.equal(bar.querySelector('[data-zoom-reset]').textContent,'180%');
  modal.dispatchEvent(new w.KeyboardEvent('keydown',{key:'0',bubbles:true,cancelable:true}));
  assert.equal(bar.querySelector('[data-zoom-reset]').textContent,'100%');
  modal.querySelector('[data-gallery-next]').click();await tick(45);
  assert.equal(stage.querySelector('video')?.controls,true);
  assert.equal(bar.hidden,true,'videos retain their normal playback controls');
  assert.equal(stage.dataset.zoomable,undefined);
 }finally{f.dom.window.close();}
});

test('pinch, pan and double tap zoom photos without accidentally swiping to another attachment',async()=>{
 const next=photo.replace('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');
 const f=fixture({media:[{path:photo,mime:'image/jpeg',name:'첫 번째'},{path:next,mime:'image/jpeg',name:'두 번째'}]});
 try{
  await tick(85);const w=f.w,d=w.document;d.querySelector('.media-slot img').click();await tick(45);
  const modal=d.querySelector('.lightbox'),stage=modal.querySelector('.gallery-stage'),img=stage.querySelector('img'),bar=modal.querySelector('.gallery-zoom');
  Object.defineProperties(stage,{clientWidth:{value:600,configurable:true},clientHeight:{value:400,configurable:true}});
  Object.defineProperties(img,{clientWidth:{value:600,configurable:true},clientHeight:{value:400,configurable:true}});
  stage.getBoundingClientRect=()=>({left:0,top:0,width:600,height:400});
  const finger=(identifier,x,y)=>({identifier,clientX:x,clientY:y});
  const touch=(name,touches,changed=touches)=>{
   const e=new w.Event(name,{bubbles:true,cancelable:true});
   Object.defineProperties(e,{touches:{value:touches},changedTouches:{value:changed}});
   stage.dispatchEvent(e);return e;
  };
  touch('touchstart',[finger(1,200,200),finger(2,400,200)]);
  const pinch=touch('touchmove',[finger(1,100,200),finger(2,500,200)]);
  assert.equal(pinch.defaultPrevented,true);
  assert.equal(stage.dataset.zoomed,'true');
  assert.equal(bar.querySelector('[data-zoom-reset]').textContent,'200%');
  touch('touchend',[],[finger(1,100,200),finger(2,500,200)]);
  touch('touchstart',[finger(3,290,220)]);
  touch('touchmove',[finger(3,350,240)]);
  assert.match(img.style.transform,/translate3d\(60px,20px,0\)/,'one finger pans the enlarged image');
  touch('touchend',[],[finger(3,350,240)]);
  touch('touchstart',[finger(4,250,180)]);
  touch('touchend',[],[finger(4,50,180)]);
  assert.equal(modal.querySelector('[data-gallery-count]').textContent,'1 / 2','zoomed drag does not change photos');
  touch('touchstart',[finger(5,220,190)]);touch('touchend',[],[finger(5,220,190)]);
  touch('touchstart',[finger(6,220,190)]);touch('touchend',[],[finger(6,220,190)]);
  assert.equal(bar.querySelector('[data-zoom-reset]').textContent,'100%','double tap resets zoom');
  touch('touchstart',[finger(7,250,180)]);touch('touchend',[],[finger(7,50,180)]);
  await tick(45);
  assert.equal(modal.querySelector('[data-gallery-count]').textContent,'2 / 2','normal swipe still changes photos');
  assert.equal(bar.querySelector('[data-zoom-reset]').textContent,'100%');
 }finally{f.dom.window.close();}
});

test('desktop dragging pans enlarged images without leaving a dragging state behind',async()=>{
 const f=fixture({media:[{path:photo,mime:'image/jpeg',name:'확대할 사진'}]});
 try{
  await tick(85);const w=f.w,d=w.document;d.querySelector('.media-slot img').click();await tick(45);
  const modal=d.querySelector('.lightbox'),stage=modal.querySelector('.gallery-stage'),img=stage.querySelector('img');
  Object.defineProperties(stage,{clientWidth:{value:600,configurable:true},clientHeight:{value:400,configurable:true}});
  Object.defineProperties(img,{clientWidth:{value:600,configurable:true},clientHeight:{value:400,configurable:true}});
  modal.querySelector('[data-zoom-in]').click();modal.querySelector('[data-zoom-in]').click();
  stage.dispatchEvent(new w.MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0,clientX:150,clientY:150}));
  w.dispatchEvent(new w.MouseEvent('mousemove',{clientX:210,clientY:175}));
  assert.match(img.style.transform,/translate3d\(60px,25px,0\)/);
  w.dispatchEvent(new w.MouseEvent('mouseup'));
  assert.equal(stage.classList.contains('dragging'),false);
  modal.querySelector('[data-close]').click();assert.equal(modal.isConnected,false);
 }finally{f.dom.window.close();}
});
