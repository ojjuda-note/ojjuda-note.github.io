const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),origin='https://guest-access.test';
const strip=html=>html.replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'');
let world=strip(read('world.html')).replace('import { screw3d as screwGame } from "./games/screw/screw3d.js";','const screwGame={};');
const helpers=['shared/games/game-session.js','app/world/world-navigation.js','shared/auth/guest-access.js','shared/games/game-results.js','park/world-park-notes.js','games/mines/world-mines-game.js','games/saetbyeol/world-saetbyeol-game.js','games/ojjuda-tour/world-tour-game.js','games/tank/world-tank-game.js','games/spot-difference/world-spot-game.js','games/ttang/ttang-bridge.js'].map(read).join('\n');
world=world.replace('<script type="module">',()=>`<script>${helpers}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`window.guestFixture={open:Al,close:El,finish:score=>S2(score),board:(kind)=>savePracticeStreak({kind,mode:'local'},'draw'),member:()=>{D.online=true;D.parkGuest=false;D.user={id:'member'};},park:()=>sr.tab({tab:'park'})};
window.OjjudaGuestScores={submit:async()=>({ok:false}),ranking:async()=>[]};
gm(()=>sr.tab({tab:'arcade'}));enterWorldGuest(()=>{g.tab='arcade';H()});`+world.slice(world.indexOf('</script>',boot));
const note=read('note/preview.js'),noteBoot=note.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange');assert.ok(noteBoot>0);
const portal=read('index.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,tag=>/portal\.js|signup-identity\.js|signup-referral\.js|config\.js/.test(tag)?tag:'');
const cardId='00000000-0000-4000-8000-000000000001';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();
   if(u.pathname==='/world.html')return route.fulfill({body:world,contentType:'text/html'});
   if(u.pathname==='/')return route.fulfill({body:portal,contentType:'text/html'});
   if(u.pathname==='/park/')return route.fulfill({body:strip(read('park/index.html')),contentType:'text/html'});
   if(u.pathname.startsWith('/games/'))return route.fulfill({body:`<!doctype html><p>Game transport fixture</p><script>
    const kind=location.pathname.includes('/tank/')?'tank':location.pathname.includes('/ojjuda-tour/')?'tour':null;
    window.transportReady=!kind;
    if(kind){addEventListener('message',event=>{if(event.data?.type===(kind==='tank'?'tank-init':'ojjuda-tour-init'))window.transportReady=true;});parent.postMessage({source:'ojjuda-'+kind,type:kind==='tank'?'ready':'ojjuda-game-ready'},location.origin);}
   </script>`,contentType:'text/html'});
   const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  await context.addInitScript(()=>{
   window.OJJUDA_CONFIG={supabaseUrl:'https://fixture.invalid',supabaseKey:'fixture'};
   const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null}),limit:()=>q,order:()=>q,then:resolve=>Promise.resolve({data:[]}).then(resolve)};
   window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})},from:()=>q,rpc(){const p=Promise.resolve({data:[]});p.abortSignal=()=>p;return p;}})};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const enter=async()=>{await page.goto(origin+'/world.html?place=park&guest=1');await page.waitForFunction(()=>window.guestFixture);await page.evaluate(()=>sessionStorage.removeItem('ojjuda.guest-round-completed.v1'));};
  const login=async next=>{await page.locator('#auth-dialog[open]').waitFor();assert.equal(await page.locator('#login-tab').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#signup-tab').getAttribute('aria-selected'),'false');assert.equal(await page.locator('.password-confirm-field').isVisible(),false);assert.equal(new URL(page.url()).searchParams.get('next'),next);};
  for(const game of ['stacker','mole']){
   await enter();await page.evaluate(game=>guestFixture.open(game),game);await page.locator('[data-g=start]').click();
   assert.equal(new URL(page.url()).pathname,'/world.html','a guest gets the first round');
   await page.waitForFunction(()=>history.state?.ojjudaWorld==='menu');
   await page.evaluate(()=>guestFixture.finish(0));
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('ojjuda.guest-round-completed.v1')),'1','zero-score loss immediately consumes the round even when save fails');
   await login('world');
  }
  await page.goto(origin+'/world.html?place=park&guest=1');await page.waitForFunction(()=>window.guestFixture);await page.evaluate(()=>guestFixture.open('mole'));await login('world');
  // Closing an unplayed game must not consume the trial.
  await enter();await page.evaluate(()=>{guestFixture.open('stacker');guestFixture.close();});assert.equal(await page.evaluate(()=>sessionStorage.getItem('ojjuda.guest-round-completed.v1')),null);
  for(const kind of ['chess','janggi','carom4','carom3','pool8']){
   await enter();await page.evaluate(kind=>guestFixture.board(kind),kind);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('ojjuda.guest-round-completed.v1')),'1',kind+' consumes the trial');
   await login('world');
  }
  const uuid='10000000-0000-4000-8000-000000000001';
  for(const [kind,data] of [
   ['mines',{source:'ojjuda-mines',type:'ojjuda-game-finished',runId:uuid}],
   ['saetbyeol',{source:'ojjuda-saetbyeol',type:'ojjuda-game-finished',runId:uuid,demo:false}],
   ['tank',{source:'ojjuda-tank',type:'finished'}],
   ['spot',{type:'ojjuda:spot-finished'}],
   ['ttang',{type:'ojjuda:ttang:result',round:uuid,mode:'solo',win:false}],
   ['tour',{source:'ojjuda-tour',type:'ojjuda-game-result',game:'ojjuda-tour',runId:uuid,players:2,myRank:2,ranking:[{}, {human:true,assets:0,bankrupt:true}]}]
  ]){
   await enter();await page.evaluate(kind=>guestFixture.open(kind),kind);await page.locator('iframe').waitFor();
   await page.waitForFunction(()=>document.querySelector('iframe')?.contentWindow?.transportReady===true);
   console.log('CHECK guest completion:',kind);
   // Unrelated windows and foreign origins cannot trigger the gate.
   await page.evaluate(data=>{dispatchEvent(new MessageEvent('message',{origin:'https://foreign.invalid',source:document.querySelector('iframe').contentWindow,data}));dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data}));},data);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('ojjuda.guest-round-completed.v1')),null,kind+' ignores forged sources');
   await page.evaluate(data=>{const source=document.querySelector('iframe').contentWindow;if(data.round)dispatchEvent(new MessageEvent('message',{origin:location.origin,source,data:{type:'ojjuda:ttang:start',round:data.round,mode:'solo'}}));dispatchEvent(new MessageEvent('message',{origin:location.origin,source,data}));},data);
   assert.equal(await page.evaluate(()=>sessionStorage.getItem('ojjuda.guest-round-completed.v1')),'1',kind+' consumes the trial');
   await login('world').catch(error=>{error.message=kind+' completion: '+error.message;throw error;});
  }
  await enter();await page.evaluate(()=>{guestFixture.member();guestFixture.open('stacker');});await page.locator('[data-g=start]').click();await page.evaluate(()=>guestFixture.finish(0));
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('ojjuda.guest-round-completed.v1')),null,'members never consume a trial');
  await page.locator('[data-g=start]').click();assert.equal(new URL(page.url()).pathname,'/world.html','members can immediately replay');
  // Run the actual card composer and its embedded navigation adapter.
  const preparePark=async frame=>{
   await frame.addScriptTag({content:read('note/calligraphy.js')});
   await frame.addScriptTag({content:note.slice(0,noteBoot)});
   await frame.evaluate(()=>{
    authKnown=ready=true;
    selectCollection=async()=>true;
    window.guestDraws=[];
    noteRpc=async(name,args)=>{
      if(name==='guest_card_background'){
        const key=window.guestDraws.length?'37':'297';
        window.guestDraws.push({id:args.p_request_id,key});
        return key;
      }
      if(name==='publish_guest_card'){window.guestPublication=args;return {card_id:crypto.randomUUID(),tags:[]};}
      return [];
    };
   });
   await frame.addScriptTag({content:read('park/integration.js')});
  };
  // Inspect a small raster sample so styling a textarea or creating an empty canvas cannot pass.
  const waitForInk=async(selector,previous=null,accent=null)=>{
   const result=await page.waitForFunction(({selector,previous,accent})=>{
    const art=document.querySelector(selector);
    if(art?.dataset.inkReady!=='true'||!art.getBoundingClientRect().width)return false;
    const sample=document.createElement('canvas');sample.width=80;sample.height=60;
    const ctx=sample.getContext('2d');ctx.drawImage(art,0,0,sample.width,sample.height);
    const pixels=ctx.getImageData(0,0,sample.width,sample.height).data;
    let inkPixels=0,clearPixels=0,hasGold=false,hash=2166136261;
    for(let i=0;i<pixels.length;i+=4){
     const alpha=pixels[i+3],ink=alpha>160;
     if(ink)inkPixels++;
     if(alpha===0)clearPixels++;
     if(alpha>20&&pixels[i]-pixels[i+2]>75&&pixels[i+1]>95)hasGold=true;
     hash=Math.imul(hash^Number(ink),16777619);
    }
    return inkPixels>10&&clearPixels>sample.width*sample.height*.5&&hash!==previous
     &&(accent===null||hasGold===accent)?hash:false;
   },{selector,previous,accent});
   return result.jsonValue();
  };
  const checkPhotoBehindInk=async(selector,key)=>{
   const surface=await page.locator(selector).evaluate(art=>{
    const face=art.closest('.photo,.compose-photo'),background=face.querySelector(':scope > img.park-card-background');
    const css=getComputedStyle(art);
    return {
     overlay:face.classList.contains('park-ink-overlay'),
     color:css.backgroundColor, image:css.backgroundImage,
     background:background?.src||getComputedStyle(face).backgroundImage
    };
   });
   assert.equal(surface.overlay,true);
   assert.equal(surface.color,'rgba(0, 0, 0, 0)','spaces between strokes must reveal the underlying photo');
   assert.equal(surface.image,'none','the canvas must not paint a CSS paper texture');
   assert.ok(surface.background.includes('/note/assets/'+key+'.jpg'),'expected the original card photo behind the strokes');
  };
  const readInkBox=async selector=>{
   const box=page.locator(selector+' .park-ink-box');await box.waitFor({state:'visible'});
   const state=await box.evaluate(box=>{
    const bounds=box.getBoundingClientRect(), face=box.closest('.photo,.compose-photo').getBoundingClientRect();
    const pixel=document.createElement('canvas').getContext('2d');
    pixel.fillStyle=getComputedStyle(box).backgroundColor;pixel.fillRect(0,0,1,1);
    return {rgba:Array.from(pixel.getImageData(0,0,1,1).data),area:bounds.width*bounds.height/(face.width*face.height)};
   });
   assert.ok(state.area>0&&state.area<.97,'the box surrounds the lettering and leaves some photo outside');
   return state.rgba;
  };
  await enter();await page.evaluate(()=>guestFixture.park());await page.locator('[data-park-app] iframe').waitFor();
  const frame=page.frames().find(f=>f.url().includes('/park/'));await preparePark(frame);
  await page.locator('[data-park-action=compose]').click();
  await frame.locator('#compose-text').fill('공원의 첫 글');
  assert.equal(await frame.locator('#compose-more').isVisible(),false);
  assert.equal(await frame.locator('#card-photo-attach').isVisible(),false);
  assert.equal(await frame.locator('#photo-gallery-toggle').isVisible(),false);
  await frame.waitForFunction(()=>document.querySelector('.compose-photo').style.backgroundImage.includes('/297.jpg'));
  page.once('dialog', dialog=>dialog.accept());
  await frame.locator('#publish-card').click();
  await frame.locator('#composer-backdrop').waitFor({state:'hidden'});
  const posted=await frame.evaluate(()=>guestPublication);
  assert.equal(posted.p_body,'공원의 첫 글');assert.equal(posted.p_parent_id,null);
  assert.deepEqual(Object.keys(posted).sort(),['p_body','p_parent_id','p_request_id']);
  assert.equal(posted.p_request_id,await frame.evaluate(()=>guestDraws[0].id));
  await page.locator('[data-park-action=compose]').click();
  await frame.locator('#compose-text').fill('붓글씨로 이어 쓰기');
  await frame.waitForFunction(()=>document.querySelector('.compose-photo').style.backgroundImage.includes('/37.jpg'));
  await frame.locator('#convert-calligraphy').click();await login('note');
  assert.equal(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('ojjuda.park.compose-login.v1')).body),'붓글씨로 이어 쓰기');
  if(process.env.GUEST_PROOF_DIR){fs.mkdirSync(process.env.GUEST_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.GUEST_PROOF_DIR,'guest-login.png')});}
  // The return from login recovers exactly what the guest typed and applies the requested conversion.
  await page.goto(origin+'/park/');await preparePark(page);
  await page.evaluate(()=>{
    session={user:{id:'member'}};
    loadMyGender=async()=>{myIdentity={gender:'private'};myGender='private';};
    autoWritingLocation=()=>{};
    resumeGuestWriting(null);
  });
  await page.waitForFunction(()=>document.querySelector('#convert-calligraphy').getAttribute('aria-pressed')==='true');
  assert.equal(await page.locator('#compose-text').inputValue(),'붓글씨로 이어 쓰기');
  const initialInk=await waitForInk('#compose-ink-art');
  await checkPhotoBehindInk('#compose-ink-art','37');
  const defaultBox=await readInkBox('.compose-photo');
  assert.ok(defaultBox[3]>0&&defaultBox[3]<255,'the default has a visible, translucent box');
  await page.locator('#compose-text').fill('고쳐 쓴 붓글씨');
  const tagInput=page.locator('#compose-tags');
  await tagInput.fill('');
  const editedInk=await waitForInk('#compose-ink-art',initialInk,false);
  assert.deepEqual(await page.evaluate(()=>[currentStyle().font,text.value]),['calligraphy','고쳐 쓴 붓글씨']);
  await tagInput.fill('#붓글씨');
  const taggedInk=await waitForInk('#compose-ink-art',editedInk,true);
  await tagInput.fill('');
  assert.equal(await waitForInk('#compose-ink-art',taggedInk),editedInk,'removing a tag restores the original lettering');
  await tagInput.fill('#붓글씨');
  assert.equal(await waitForInk('#compose-ink-art',editedInk),taggedInk);
  assert.equal(await page.locator('#compose-text').inputValue(),'고쳐 쓴 붓글씨');
  await page.locator('#compose-more>summary').click();
  const slider=page.locator('#compose-box-transparency'), number=page.locator('#compose-box-transparency-value');
  const boxColors=[];
  for(const level of [0,50,100]){
   if(level===50)await number.fill('50');else await slider.press(level===0?'Home':'End');
   assert.equal(await slider.inputValue(),String(level));
   assert.equal(await number.inputValue(),String(level));
   boxColors.push(await readInkBox('.compose-photo'));
   assert.equal(await waitForInk('#compose-ink-art'),taggedInk,'changing only the box preserves the strokes');
  }
  assert.equal(boxColors[0][3],0);
  assert.ok(boxColors[1][3]>0&&boxColors[1][3]<255);
  assert.equal(boxColors[2][3],255);
  await number.fill('50');
  await page.evaluate(()=>{
   const card={id:crypto.randomUUID(),kind:'memo',background_key:'37',body:text.value,tags:parsedTags(),style:currentStyle(),created_at:new Date().toISOString()};
   list.replaceChildren(cardElement(card),cardElement({...card,id:crypto.randomUUID(),photo_key:'13',tags:['없는단어']}));
   cache.set(card.id,card);
   noteRpc=async(name,args)=>name==='get_card'?cache.get(args.p_id):[];
  });
  await page.locator('#feed-list .note-font-calligraphy').first().evaluate(el=>el.classList.add('ju-font-poster'));
  assert.deepEqual(await page.locator('#feed-list .card-quote').allTextContents(),['고쳐 쓴 붓글씨','고쳐 쓴 붓글씨']);
  await page.locator('#convert-calligraphy').click();
  assert.equal(await page.locator('#compose-font').inputValue(),'default');
  assert.equal(await page.locator('#compose-text').inputValue(),'고쳐 쓴 붓글씨');
  assert.equal(await page.locator('#compose-ink-art').isVisible(),false);
  assert.equal(await page.locator('.compose-photo .park-ink-box').isVisible(),false);
  await page.locator('#close-composer').click();
  await page.locator('#feed-list .photo').first().scrollIntoViewIfNeeded();
  for(const [index,key] of [[1,'37'],[2,'13']]){
   const face='#feed-list article:nth-child('+index+') .photo',selector=face+' canvas.park-ink-art';
   await waitForInk(selector,null,index===1);
   await checkPhotoBehindInk(selector,key);
   assert.deepEqual(await readInkBox(face),boxColors[1],'a saved card retains its box color and opacity');
  }
  await page.locator('#feed-list .photo-open').first().click();
  await waitForInk('#detail-card-slot canvas.park-ink-art',null,true);
  assert.deepEqual(await readInkBox('#detail-card-slot .photo'),boxColors[1],'detail matches the preview and feed');
  await page.goto(origin+'/park/?card='+cardId);await preparePark(page);
  await page.evaluate(id=>openComposer('reply',null,id),cardId);await page.locator('#guest-compose-login').click();await login('note');assert.equal(new URL(page.url()).searchParams.get('card'),cardId);
  // Login is the automatic entry; a guest can still deliberately select signup
  // or password recovery without losing the card they were replying to.
  await page.locator('#signup-tab').click();assert.equal(await page.locator('#signup-tab').getAttribute('aria-selected'),'true');
  assert.equal(await page.locator('#nickname').isVisible(),true);assert.equal(new URL(page.url()).searchParams.get('card'),cardId);
  await page.locator('#login-tab').click();await login('note');
  await page.locator('#forgot-trigger').click();assert.equal(await page.locator('#auth-title').textContent(),'비밀번호 찾기');
  assert.equal(await page.locator('#recovery-identity-slot').isVisible(),true);assert.equal(new URL(page.url()).searchParams.get('card'),cardId);
  await page.locator('#forgot-trigger').click();await login('note');assert.equal(new URL(page.url()).searchParams.get('card'),cardId);
  assert.deepEqual(errors,[]);
  console.log('PASS: every completed guest arcade, board and iframe round automatically opens real login without replay; returning guests remain gated, member replay unaffected; park signup/recovery and card return destination preserved');
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
