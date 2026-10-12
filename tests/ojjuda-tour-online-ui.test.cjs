const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const {fixture,ids}=require('./ojjuda-tour-online-fixture.cjs');
const root=path.resolve(__dirname,'..');
(async()=>{
 const f=await fixture(),browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),errors=[];
 try{
  async function player(seat,width){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage();
   page.on('pageerror',error=>errors.push(error.message));
   page.on('dialog',dialog=>dialog.accept());
   await page.route('**/*',async route=>{
    const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
    if(u.pathname==='/online-api'){
     const result=await f.call(ids[seat],route.request().postDataJSON());return route.fulfill({status:result.status,contentType:'application/json',body:JSON.stringify(result)});
    }
    if(u.pathname==='/host.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/world-tour-game.css"><button id="launch">오쭈다 마블</button><script src="/world-tour-game.js"></script><script>window.localScores=0;const client={functions:{invoke:async(name,{body})=>{if(name!=='marble')throw Error('unexpected function');const res=await fetch('/online-api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await res.json();return res.ok?{data,error:null}:{data:null,error:{context:{json:async()=>data}}};}}};document.querySelector('#launch').onclick=()=>OjjudaTourGame.open({owner:${JSON.stringify(ids[seat])},nickname:${JSON.stringify(seat===0?'민준':seat===1?'여행친구':'참가자3')},client,onScore:()=>{window.localScores++;return {ok:true}}});</script>`});
    const file=path.resolve(root,'.'+u.pathname+(u.pathname.endsWith('/')?'index.html':''));
    return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
   });
   await page.goto('https://fixture.test/host.html');await page.locator('#launch').click();
   const frame=page.frameLocator('iframe');await frame.locator('#tourTitle').waitFor();
   await frame.getByRole('button',{name:'온라인으로',exact:true}).click();
   await frame.locator('#marbleCreate button').waitFor({state:'visible'});
   await page.frames().find(x=>x.url().includes('/games/ojjuda-tour/')).waitForFunction(()=>!document.querySelector('#marbleCreate button').disabled);
   return {page,frame,context,embedded:()=>page.frames().find(x=>x.url().includes('/games/ojjuda-tour/'))};
  }
  const a=await player(0,390),b=await player(1,320),c=await player(2,1280);
  for(const p of [a,b,c]){
   const bounds=await p.embedded().evaluate(()=>{
    const form=document.querySelector('#marbleJoin>div').getBoundingClientRect(),input=document.querySelector('#marbleCode').getBoundingClientRect(),button=document.querySelector('#marbleJoin button').getBoundingClientRect();
    return {input:input.width,inside:button.right<=form.right+1};
   });
   assert.ok(bounds.input>=130,'room code input remains readable on small phones');assert.equal(bounds.inside,true,'join button fits the entry card');
  }
  await a.frame.locator('#marbleCreate [name=capacity]').selectOption('3');
  await a.frame.locator('#marbleCreate [name=title]').fill('세 기기 마블');await a.frame.getByRole('button',{name:'온라인 방 만들기',exact:true}).click();
  await a.frame.locator('#marbleRoomCode').waitFor({state:'visible'});const code=await a.frame.locator('#marbleRoomCode').innerText();
  assert.match(code,/^[A-F0-9]{8}$/);
  for(const p of [b,c]){await p.frame.locator('#marbleCode').fill(code);await p.frame.getByRole('button',{name:'참가',exact:true}).click();await p.frame.locator('#marbleWaiting').waitFor({state:'visible'});}
  await a.embedded().waitForFunction(()=>document.querySelector('#marbleMembers').children.length===3);
  fs.mkdirSync('/tmp/ojjuda-tour-proof',{recursive:true});
  await a.frame.locator('.tour-entry').screenshot({path:'/tmp/ojjuda-tour-proof/online-lobby.png'});
  await a.frame.getByRole('button',{name:'함께 시작하기',exact:true}).click();
  for(const p of [a,b,c])await p.frame.locator('#game').waitFor({state:'visible',timeout:60000});
  await a.embedded().waitForFunction(()=>R.ok&&MarbleOnline.canAct());
  assert.equal(await b.embedded().evaluate(()=>MarbleOnline.canAct()),false);
  f.dice(0,1);await a.frame.getByRole('button',{name:'🎲 주사위 굴리기',exact:true}).click();
  await a.frame.getByRole('button',{name:'살래요!',exact:true}).waitFor({timeout:60000});
  await a.frame.getByRole('button',{name:'살래요!',exact:true}).click();
  await a.frame.getByRole('button',{name:/빌딩까지/}).click();
  for(const p of [a,b,c])await p.embedded().waitForFunction(()=>G.owner[3]===0&&G.level[3]===2&&G.turn===1,{},{timeout:60000});
  const snapshot=await a.embedded().evaluate(()=>JSON.stringify({players:G.players,owner:G.owner,level:G.level,round:G.round,turn:G.turn}));
  assert.equal(await b.embedded().evaluate(()=>JSON.stringify({players:G.players,owner:G.owner,level:G.level,round:G.round,turn:G.turn})),snapshot);
  f.dice(0,3);await b.frame.getByRole('button',{name:'🎲 주사위 굴리기',exact:true}).click();await b.frame.getByRole('button',{name:'넘어가기',exact:true}).click();
  await c.frame.getByRole('button',{name:'🎲 주사위 굴리기',exact:true}).waitFor({timeout:60000});
  f.dice(0,4);await c.frame.getByRole('button',{name:'🎲 주사위 굴리기',exact:true}).click();await c.frame.getByRole('button',{name:'넘어가기',exact:true}).click();
  await a.embedded().waitForFunction(()=>MarbleOnline.canAct(),{},{timeout:60000});
  await a.frame.getByRole('button',{name:'시점 초기화',exact:true}).click();
  await a.frame.locator('#game').screenshot({path:'/tmp/ojjuda-tour-proof/online-game.png'});
  // A different browser session reloads and rejoins its reserved seat, without creating a new game.
  await b.page.reload();await b.page.locator('#launch').click();await b.frame.locator('#tourTitle').waitFor();await b.frame.getByRole('button',{name:'온라인으로',exact:true}).click();
  await b.frame.locator('#game').waitFor({state:'visible',timeout:60000});await b.embedded().waitForFunction(()=>G.owner[3]===0&&G.level[3]===2);
  assert.match(await b.frame.locator('#marbleGameRoom').innerText(),new RegExp(code));
  await a.frame.getByRole('button',{name:'기권',exact:true}).click();
  await a.embedded().waitForFunction(()=>G.players[0].bankrupt&&G.turn===1,{},{timeout:60000});
  assert.equal(await a.embedded().evaluate(()=>MarbleOnline.canAct()),false);assert.equal(await a.frame.locator('#marbleControls button').count(),0);
  assert.match(await a.frame.locator('#eliminationStatus strong').innerText(),/탈락 · 관전 중/);
  await a.frame.locator('#game').screenshot({path:'/tmp/ojjuda-tour-proof/online-spectator.png'});
  await b.frame.getByRole('button',{name:'🎲 주사위 굴리기',exact:true}).waitFor({timeout:60000});
  f.dice(0,5,11);await b.frame.getByRole('button',{name:'🎲 주사위 굴리기',exact:true}).click();
  await c.embedded().waitForFunction(()=>G.turn===2&&MarbleOnline.canAct(),{},{timeout:60000});
  const room=(await f.call(ids[0],{action:'mine'})).room;f.dice(0,1);
  await f.db.query("update ojjuda_marble_internal.rooms set deadline=now()-interval '1 second' where id=$1",[room.id]);
  await b.embedded().waitForFunction(()=>G.turn===1&&MarbleOnline.canAct(),{},{timeout:60000});
  assert.ok(await b.embedded().evaluate(()=>G.log.some(x=>x.includes('시간 초과'))));
  await b.frame.getByRole('button',{name:'기권',exact:true}).click();
  for(const p of [a,b,c]){
   await p.frame.getByRole('button',{name:'온라인 로비로',exact:true}).waitFor({timeout:60000});
   assert.equal(await p.page.evaluate(()=>window.localScores),0,'online results never use the casual local score bridge');
   assert.equal(await p.frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'no horizontal overflow');
  }
  assert.equal((await f.db.query('select count(*)::integer n from public.game_scores')).rows[0].n,3);
  assert.deepEqual(errors,[]);
  console.log('PASS: three separate browsers, 320/390/1280px layouts, room join/start, dice/purchase/build synchronization, reload recovery, host elimination/spectating, timeout continuation and all-player rankings');
 }finally{await browser.close();await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
