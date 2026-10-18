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
  for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(match[1],dom.getInternalVMContext());
  const starts=[];w.startStage=i=>{starts.push({key:w.eval('LIST')[i].key,id:w.eval('LIST')[i].id});};
  w.eval(entry);w.eval(entry);
  assert.equal(w.document.querySelectorAll('#photoPublicStart').length,1);
  const base=w.document.getElementById('photoStart'),shared=w.document.getElementById('photoPublicStart');
  assert.deepEqual([...base.parentElement.children].map(b=>b.textContent),['기본','공개']);
  w.eval('prog={0:{done:1},1:{done:1}}');await base.onclick();assert.equal(starts.at(-1).key,'2');
  w.localStorage.setItem('ojjuda-photo-community:me',JSON.stringify({ccleared:{done:1}}));
  await shared.onclick();assert.equal(starts.at(-1).id,'next','public start chooses an unfinished public photo, including the owner’s photo');
  assert.deepEqual(Array.from(w.eval('LIST'),p=>p.id),['cleared','next']);
  assert.equal(w.document.querySelectorAll('#grid img.blurred').length,1);
  assert.equal(w.document.querySelector('#grid b').textContent,'친구 <사진>');
  assert.equal(w.document.querySelector('#grid script'),null);
  const before=starts.length;rows=[];await shared.onclick();assert.equal(starts.length,before);assert.match(w.document.getElementById('photoEntryStatus').textContent,/아직 공개/);
  rows=[photo('restored')];fail=true;await shared.onclick();assert.equal(starts.length,before);assert.match(w.document.getElementById('photoEntryStatus').textContent,/불러오지 못/);
  fail=false;await shared.onclick();assert.equal(starts.at(-1).id,'restored');
  release=true;const pending=shared.onclick();while(typeof release!=='function')await new Promise(r=>setTimeout(r,0));
  w.document.querySelector('[data-t="base"]').click();release();release=null;await pending;
  assert.equal(starts.at(-1).id,'restored','changing tabs while loading cancels automatic entry');
  assert.equal(w.eval('LIST[0].key'),'0');assert.equal(base.disabled,false);assert.equal(shared.disabled,false);
  allowed=false;await shared.onclick();assert.equal(w.eval('mode'),'locked');assert.equal(starts.at(-1).id,'restored');
  console.log('PASS: base/public entry, progress selection, approved public photos only, blur, empty/error retry, stale loads, and member gate');
 }finally{w.close();}
 const demo=new JSDOM('<button id="photoStart">시작하기</button>',{runScripts:'outside-only'});
 demo.window.eval('const PUBLIC_DEMO=true;');demo.window.eval(entry);assert.equal(demo.window.document.getElementById('photoPublicStart'),null);demo.window.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
