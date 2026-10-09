const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'games/photo-ttang.html'),'utf8');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'photo-community-')),photo=path.join(dir,'photo.jpg');
fs.writeFileSync(photo,Buffer.from(html.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/)[1],'base64'));
const mock=`<script>
const actor=new URL(location.href).searchParams.get('actor')||'one';
window.ojjudaSupabase={auth:{getUser:async()=>({data:{user:{id:actor}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async name=>({data:name==='get_my_member_identity'?{age:19,locked:true}:false}),
storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/photo.jpg'}})})},
from:()=>{const filters=[];const q={select(){return q},neq(k,v){filters.push(r=>r[k]!==v);return q},eq(k,v){filters.push(r=>r[k]===v);return q},order(){return q},limit(){return q},then(resolve,reject){return Promise.resolve({data:[{id:'public-photo',owner:'uploader',nick:'사진 올린 친구',image_path:'crop.jpg',full_path:'full.jpg',visibility:'public',status:'approved',mask_rle:'30000,60000,30000',level:1,plays:0,clears:0},{id:'pending-photo',owner:'uploader',visibility:'public',status:'pending'}].filter(r=>r.status==='approved'||r.owner===actor).filter(r=>filters.every(f=>f(r))),error:null}).then(resolve,reject)}};return q;}};
</script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='fixture.test')return r.abort();if(u.pathname.endsWith('.js'))return r.fulfill({contentType:'application/javascript',path:path.join(root,u.pathname)});return u.pathname==='/photo.jpg'?r.fulfill({path:photo,contentType:'image/jpeg'}):r.fulfill({contentType:'text/html',body:html.replace('</head>',mock+'</head>')});});
  const open=async actor=>{await page.goto('https://fixture.test/photo?actor='+actor);await page.locator('details:has(#grid)>summary').click();await page.waitForSelector('#grid .cell');await page.locator('[data-t="all"]').click();await page.waitForSelector('#grid .cell img');await page.waitForFunction(()=>document.querySelector('#grid img').complete&&document.querySelector('#grid img').naturalWidth>0);};
  const filter=()=>page.locator('#grid img').evaluate(im=>getComputedStyle(im).filter);
  await open('one');
  assert.equal(await page.locator('#grid .cell').count(),1,'unapproved public photos are not playable');
  assert.match(await filter(),/blur\(12px\)/,'the uploaded picture is shown blurred before clearing');
  assert.equal(await page.locator('.unlock-note').textContent(),'클리어하면 공개');
  await page.locator('#grid .cell').click();await page.waitForFunction(()=>mode==='play'&&photoImg.complete&&photoImg.naturalWidth>0);
  const hidden=await page.evaluate(()=>{
   paused=true;sound=false;startWait=0;world.own.fill(me.id);for(let k=0;k<world.N;k++)drawCell(k);revDirty=true;revLast=0;flushDirty();
   const normal=document.createElement('canvas');normal.width=rev.width;normal.height=rev.height;normal.getContext('2d').drawImage(photoImg,0,0,normal.width,normal.height);
   const a=normal.getContext('2d').getImageData(0,0,normal.width,normal.height).data,b=rctx.getImageData(0,0,rev.width,rev.height).data;
   let delta=0,n=0;for(let i=0;i<a.length;i+=64){delta+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);n+=3;}
   return {difference:delta/n,done:photoDone(LIST[stage]),canvas:gamePhotoSource()!==photoImg};
  });
  assert.equal(hidden.done,false);assert.equal(hidden.canvas,true);assert.ok(hidden.difference>8,'claimed land uses visibly blurred pixels until victory');
  await page.evaluate(()=>{silTotal=1000;mySil=880;timeUp()});await page.getByRole('button',{name:'사진 목록',exact:true}).waitFor();
  await page.getByText('실루엣을 88%까지 차지했어요. 90%까지 2% 남았어요.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'사진 목록',exact:true}).click();
  await page.waitForSelector('#grid .cell img');assert.match(await filter(),/blur/,'losing leaves the photo blurred');
  await page.locator('#grid .cell').click();await page.waitForFunction(()=>photoImg.complete&&photoImg.naturalWidth>0);
  await page.evaluate(()=>{paused=true;sound=false;startWait=0;world.own.fill(me.id);world.step=()=>{};mobs=[];silTotal=1000;mySil=899;paused=false;hud();});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>over||photoDone(LIST[stage])),false,'89.9% does not clear or reveal the picture');
  assert.match(await page.locator('.bar').textContent(),/89\.9%\s*\/ 90%/);
  await page.evaluate(()=>{mySil=900;hud()});
  await page.waitForFunction(()=>over&&photoDone(LIST[stage]));
  assert.equal(await page.locator('#silBar').evaluate(e=>e.style.width),'100%','90% fills the completion bar');
  await page.waitForSelector('.fullimg');
  assert.equal(await page.locator('.fullimg').evaluate(im=>getComputedStyle(im).filter),'none','victory presents a sharp original');
  await page.getByRole('button',{name:'사진 목록',exact:true}).click();await page.waitForSelector('#grid .cell.done');
  assert.equal(await filter(),'none','the cleared photo stays sharp in the list');
  await open('one');assert.equal(await filter(),'none','clear survives reopening for the same player');
  await open('two');assert.match(await filter(),/blur/,'a different player must clear their own stage');
  await open('one');assert.equal(await filter(),'none','another player does not erase the first player clear');
  assert.deepEqual(errors,[]);console.log('PASS: blurred community thumbnails and actual game pixels, loss stays blurred, victory reveals original, and account-specific clear persistence');
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
