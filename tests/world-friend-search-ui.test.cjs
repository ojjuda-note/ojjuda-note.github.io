const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
const boot=world.indexOf('j1(()=>H());gm(');assert(boot>0);
world=world.slice(0,boot)+`
window.friendTest={state:P,auth:D,render:H,actions:sr,requests:[],friendships:[],profiles:[
 {id:'friend-a',nickname:'가나다',bio:'첫 번째 친구',mood:'😊',door_closed:false},
 {id:'friend-b',nickname:'라마바',bio:'두 번째 친구',mood:'😊',door_closed:false}],
 respond(index,rows,error=null){this.requests[index].resolve({data:rows,error});},
 switchAccount(id){D.user=id?{id}:null;D.online=!!id;Object.assign(P,{loaded:true,at:Date.now()+60000,rel:new Map(),friends:[],incoming:[],outgoing:[],feed:[]});g.tab='friends';H();}};
S={from(table){let pattern=null,ids=null,owner=null,mode='read',values=null,id=null;const q={
 select(){return q},limit(){return q},order(){return q},neq(key,value){owner=value;return q},eq(key,value){id=value;return q},
 ilike(key,value){pattern=value;return q},in(key,value){ids=value;return q},insert(value){mode='insert';values=value;return q},delete(){mode='delete';return q},
 then(resolve,reject){return Promise.resolve().then(()=>{
  if(table==='profiles'){if(pattern)return new Promise(done=>friendTest.requests.push({pattern,owner,resolve:done}));return{data:friendTest.profiles.filter(p=>!ids||ids.includes(p.id))};}
  if(table==='friendships'){if(mode==='insert')friendTest.friendships.push({id:'request-a',status:'pending',...values});if(mode==='delete')friendTest.friendships=friendTest.friendships.filter(row=>row.id!==id);return{data:friendTest.friendships};}
  return{data:[]};}).then(resolve,reject)}};return q},rpc:async(name,args)=>{if(name==='accept_friend'){const row=friendTest.friendships.find(row=>row.id===args.req_id);if(row)row.status='accepted';}return{data:null}}};
D.doorReady=true;D.isAdmin=false;friendTest.switchAccount('owner-a');
`+world.slice(world.indexOf('</script>',boot));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const file=path.join(root,url.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();});
  await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.friendTest);
  const panel=page.locator('.world-community'),input=page.locator('#fr-q');
  const open=async()=>{if(!await panel.evaluate(el=>el.open))await panel.locator(':scope>summary').click();};
  const search=async query=>{await open();if(query!==undefined)await input.fill(query);const count=await page.evaluate(()=>friendTest.requests.length);await page.locator('#fr-search-form button').click();await page.waitForFunction(n=>friendTest.requests.length===n+1,count);return count;};
  const respond=async(index,rows,error)=>{await page.evaluate(({index,rows,error})=>friendTest.respond(index,rows,error),{index,rows,error});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));};
  const first={id:'friend-a',nickname:'가나다',bio:'첫 번째 친구',mood:'😊',door_closed:false},second={id:'friend-b',nickname:'라마바',bio:'두 번째 친구',mood:'😊',door_closed:false};
  let request=await search('가나다');await respond(request,[first]);
  assert.equal(await panel.evaluate(el=>el.open),true,'successful search leaves its results expanded');assert.equal(await page.locator('[data-act="fr-request"][data-uid="friend-a"]').isVisible(),true);
  await page.locator('[data-act="fr-request"][data-uid="friend-a"]').click();await page.waitForFunction(()=>friendTest.state.outgoing.length===1);
  assert.equal(await panel.evaluate(el=>el.open),true,'sending a friend request preserves the expanded list');assert.equal(await page.locator('[data-act="fr-cancel"]').first().isVisible(),true);
  await page.locator('[data-act="fr-cancel"]').first().click();await page.waitForFunction(()=>friendTest.state.outgoing.length===0);assert.equal(await panel.evaluate(el=>el.open),true);
  await page.evaluate(()=>{const row={id:'incoming-b',requester:'friend-b',addressee:'owner-a',status:'pending'};friendTest.friendships.push(row);friendTest.state.rel.set('friend-b',{id:row.id,status:'pending',dir:'in'});friendTest.state.incoming=[{req:row.id,p:friendTest.profiles[1]}];friendTest.render();});
  await page.locator('[data-act="fr-accept"][data-req="incoming-b"]').click();await page.waitForFunction(()=>friendTest.state.friends.length===1);assert.equal(await panel.evaluate(el=>el.open),true,'accepting a request leaves the updated friends list open');

  const slow=await search('가나다'),latest=await search('라마바');await respond(latest,[second]);await respond(slow,[first]);
  assert.equal(await input.inputValue(),'라마바');assert.deepEqual(await page.evaluate(()=>friendTest.state.results.map(row=>row.id)),['friend-b'],'an older response cannot replace the newest results');
  request=await search('가나다');await input.fill('새로 입력한 이름');await respond(request,[first]);
  assert.equal(await input.inputValue(),'새로 입력한 이름','typing a new query invalidates the pending response before submitting again');assert.equal(await page.evaluate(()=>friendTest.state.q),'라마바');
  await page.evaluate(()=>friendTest.render());assert.equal(await input.inputValue(),'새로 입력한 이름','a background redraw preserves the current query draft');assert.equal(await panel.evaluate(el=>el.open),true);

  const sameOld=await search('같은이름'),sameNew=await search();await respond(sameNew,[{...second,nickname:'같은이름'}]);await respond(sameOld,[{...first,nickname:'같은이름'}]);
  assert.deepEqual(await page.evaluate(()=>friendTest.state.results.map(row=>row.id)),['friend-b'],'repeating the identical query still accepts only its newest request');
  request=await search('라마바');await panel.locator(':scope>summary').click();await respond(request,[second]);assert.equal(await panel.evaluate(el=>el.open),false,'a response does not reopen a panel deliberately collapsed while waiting');
  await open();assert.equal(await page.locator('[data-act="visit"][data-uid="friend-b"]').last().isVisible(),true);await page.locator('.bottomnav [data-tab="my"]').click();await page.locator('.bottomnav [data-tab="friends"]').click();
  assert.equal(await panel.evaluate(el=>el.open),true);assert.equal(await input.inputValue(),'라마바','returning to the same account keeps the current friend search');

  const oldError=await search('가나다'),newSuccess=await search('라마바');await respond(newSuccess,[second]);await page.evaluate(()=>document.querySelector('#toast').textContent='');await respond(oldError,null,{message:'late old error'});
  assert.equal(await page.locator('#toast').textContent(),'','an old error cannot display a failure after a newer search succeeded');assert.equal(await input.inputValue(),'라마바');
  request=await search('가나다');await page.evaluate(()=>friendTest.switchAccount('owner-b'));assert.equal(await input.inputValue(),'');assert.equal(await panel.evaluate(el=>el.open),false);assert.equal(await page.evaluate(()=>friendTest.state.results),null);
  const other=await search('라마바');assert.equal(await page.evaluate(index=>friendTest.requests[index].owner,other),'owner-b');await respond(other,[second]);await respond(request,[first]);
  assert.equal(await input.inputValue(),'라마바');assert.deepEqual(await page.evaluate(()=>friendTest.state.results.map(row=>row.id)),['friend-b'],'the prior account response cannot replace the current account search');
  request=await search('가나다');await page.evaluate(()=>{friendTest.switchAccount('owner-c');document.querySelector('#toast').textContent='';});await respond(request,null,{message:'prior account error'});assert.equal(await page.locator('#toast').textContent(),'');assert.equal(await input.inputValue(),'');
  request=await search('현재 검색');await respond(request,null,{message:'current request error'});assert.match(await page.locator('#toast').textContent(),/검색하지 못했어요/);assert.equal(await input.inputValue(),'현재 검색','a current failure retains the query for retry');
  request=await search();await respond(request,[first]);assert.equal(await page.locator('[data-act="fr-request"][data-uid="friend-a"]').isVisible(),true,'the current query can be retried normally');
  for(const width of [320,390]){await page.setViewportSize({width,height:844});await open();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  assert.deepEqual(errors,[]);console.log('PASS: friend panel stays expanded after search/request/cancel/accept; latest query and typed drafts win; identical-query races, intentional collapse, tab return and account changes reject stale results/errors.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
