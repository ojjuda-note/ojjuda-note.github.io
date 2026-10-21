const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {JSDOM}=require('jsdom'),root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'games/photo-ttang.html'),'utf8'),entry=fs.readFileSync(path.join(root,'photo-ttang-entry.js'),'utf8');
const photo=(id,owner='other',visibility='public',status='approved')=>({id,owner,visibility,status,nick:'친구 <사진>',image_path:id+'.jpg',mask_rle:'0,120000',level:1});
(async()=>{
 const dom=new JSDOM(html,{url:'https://fixture.test/photo',runScripts:'outside-only'}),w=dom.window;
 let allowed=true,rows=[photo('cleared'),photo('next','me'),photo('private','me','private'),photo('friends','other','friends'),photo('pending','me','public','pending')],fail=false,release=null;
 const noop=()=>{};
 w.requestAnimationFrame=noop;w.OjjudaPhotoTtangAccess={allowed:()=>allowed,subscribe:()=>noop};
 w.HTMLCanvasElement.prototype.getContext=()=>new Proxy({createImageData:(x,y)=>({data:new Uint8ClampedArray(x*y*4)}),measureText:()=>({width:10})},{get:(o,k)=>o[k]||noop});
 w.ojjudaSupabase={auth:{getUser:async()=>({data:{user:{id:'me'}}})},rpc:async()=>({data:false}),storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/photo.jpg'}})})},
  from:()=>{const filters=[],q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},order(){return q},limit(){return q},async then(resolve,reject){if(release)await new Promise(r=>{release=r;});return Promise.resolve({data:rows.filter(r=>filters.every(f=>f(r))),error:fail?Error('offline'):null}).then(resolve,reject);}};return q;}};
 try{
  w.eval(fs.readFileSync(path.join(root,'assets/photo-ttang/men-stages-v2.js'),'utf8'));
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],dom.getInternalVMContext());
  const realStart=w.startStage,starts=[];w.startStage=i=>{starts.push({key:w.eval('LIST')[i].key,id:w.eval('LIST')[i].id});};
  w.eval(entry);w.eval(entry);
  assert.equal(w.document.querySelectorAll('#photoPublicStart').length,1);
  const base=w.document.getElementById('photoStart'),shared=w.document.getElementById('photoPublicStart');
  const gallery=w.document.getElementById('grid'),details=gallery.closest('details');
  let scrolled=0;details.scrollIntoView=()=>{scrolled++;};
  assert.deepEqual([...base.parentElement.children].map(b=>b.textContent),['기본','공개']);
  w.eval('prog={0:{done:1},1:{done:1},2:{done:1},3:{done:1},4:{done:1}}');
  await base.onclick();assert.equal(starts.length,0,'base opens the gallery without choosing a photo');
  assert.equal(details.open,true);assert.equal(scrolled,1);
  assert.equal(gallery.children.length,40,'twenty original and twenty male photos are selectable');
  const baseList=w.eval('LIST');
  assert.deepEqual(Array.from(baseList.filter((p,i)=>i%2===0),p=>p.key),Array.from({length:20},(_,i)=>String(i)),'original photo identities remain unchanged');
  assert.deepEqual(Array.from(baseList.filter((p,i)=>i%2===1),p=>p.key),Array.from({length:20},(_,i)=>String(20+i)),'new photos have separate permanent identities');
  assert.deepEqual([1,2,3,4,5].map(star=>baseList.filter((p,i)=>i%2===1&&w.diff(p.level).stars===star).length),[4,4,4,4,4]);
  for(const p of baseList.filter((p,i)=>i%2===1)){
   assert.equal(p.sil.split(',').map(Number).reduce((a,b)=>a+b,0),120000,'each silhouette matches the 300 by 400 game grid');
   assert.ok(fs.existsSync(path.join(root,p.img)),'each new photo asset is packaged');
  }

  assert.match(w.document.getElementById('photoEntryStatus').textContent,/사진을 골라/);
  gallery.querySelector('[data-i="2"]').click();assert.equal(starts.at(-1).key,'1','a cleared photo can be chosen again');
  gallery.querySelector('[data-i="10"]').click();assert.equal(starts.at(-1).key,'5','the chosen basic photo starts');
  gallery.querySelector('[data-i="11"]').click();assert.equal(starts.length,2,'locked photos keep their existing progression gate');
  w.localStorage.setItem('ojjuda-photo-community:me',JSON.stringify({ccleared:{done:1}}));
  details.open=false;await shared.onclick();assert.equal(starts.length,2,'public opens the gallery without choosing a photo');
  assert.equal(details.open,true);assert.equal(scrolled,2);
  assert.deepEqual(Array.from(w.eval('LIST'),p=>p.id),['cleared','next']);
  assert.equal(w.document.querySelectorAll('#grid img.blurred').length,1);
  assert.equal(w.document.querySelector('#grid b').textContent,'친구 <사진>');
  assert.equal(w.document.querySelector('#grid script'),null);
  gallery.querySelector('[data-i="0"]').click();assert.equal(starts.at(-1).id,'cleared','the chosen public photo starts');
  gallery.querySelector('[data-i="1"]').click();assert.equal(starts.at(-1).id,'next','the owner’s public photo is also selectable');
  const before=starts.length;rows=[];await shared.onclick();assert.equal(starts.length,before);assert.match(w.document.getElementById('photoEntryStatus').textContent,/아직 공개/);
  rows=[photo('restored')];fail=true;await shared.onclick();assert.equal(starts.length,before);assert.match(w.document.getElementById('photoEntryStatus').textContent,/불러오지 못/);
  fail=false;await shared.onclick();assert.equal(starts.length,before,'retry restores choices without starting');
  gallery.querySelector('[data-i="0"]').click();assert.equal(starts.at(-1).id,'restored');
  release=true;const pending=shared.onclick();while(typeof release!=='function')await new Promise(r=>setTimeout(r,0));
  w.document.querySelector('[data-t="base"]').click();release();release=null;await pending;
  assert.equal(starts.length,before+1,'changing tabs while loading does not start a photo');
  assert.equal(w.eval('LIST[0].key'),'0');assert.equal(base.disabled,false);assert.equal(shared.disabled,false);
  w.eval('prog={20:{done:1}}');await base.onclick();
  assert.equal(gallery.querySelector('[data-i="1"]').classList.contains('done'),true,'male progress persists under its own key');
  assert.equal(gallery.querySelector('[data-i="0"]').classList.contains('done'),false,'male clear does not reveal an old female photo');
  assert.equal(gallery.querySelector('[data-i="2"]').disabled,false,'male clear unlocks the next stage');
  w.eval('prog=Object.fromEntries(Array.from({length:20},(_,i)=>[String(i),{done:1}]))');await base.onclick();
  assert.equal(gallery.querySelectorAll('.lock').length,0,'a previous complete collection keeps every new photo accessible');
  assert.equal(gallery.querySelectorAll('.done').length,20,'new photos are not marked as previously cleared');
  for(let level=0;level<20;level++){
   assert.equal(realStart(2*level+1),true,'each male stage starts');
   const state=w.eval('({key:LIST[stage].key,level:LIST[stage].level,mobs:mobs.length,bots:world.players.length-1,seconds:endAt-world.time,total:silTotal})');
   assert.equal(state.key,String(20+level));
   assert.equal(state.mobs,w.diff(level).mobs);assert.equal(state.bots,w.diff(level).bots);
   assert.equal(state.seconds,Math.round(150-level*2.5));assert.ok(state.total>15000&&state.total<72000);
  }
  w.eval("mode='menu';world=me=null");

  allowed=false;await shared.onclick();assert.equal(w.eval('mode'),'locked');assert.equal(starts.at(-1).id,'restored');
  console.log('PASS: base/public photo selection, no automatic start, chosen photo playback, progression, approved public photos only, blur, empty/error retry, stale loads, and member gate');
 }finally{w.close();}
 const demo=new JSDOM('<button id="photoStart">시작하기</button>',{runScripts:'outside-only'});
 demo.window.eval('const PUBLIC_DEMO=true;');demo.window.eval(entry);assert.equal(demo.window.document.getElementById('photoPublicStart'),null);demo.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
