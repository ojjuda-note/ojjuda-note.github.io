const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

const names=['민지','지수','태민'];
const kinds=['minority','mission'];
function fakeRoom(kind){
  const code=kind==='minority'?'AB1234':'FE5678';
  const minority=kind==='minority';
  const choices=minority?['단맛','짠맛']:['공통단어테스트','다른단어테스트'];
  let round=1,phase='waiting',revision=1,seats=0;
  let ready=new Set(),votes=new Map();
  const requests=[];
  let archivedResult;
  function state(me){
    const data={kind,code,title:'투표 QA 방',capacity:3,players:names.slice(0,seats),me,phase,round,revision,
      ready:ready.has(me),readyCount:ready.size,voted:votes.has(me),voteCount:votes.size};
    if(minority&&phase!=='waiting')data.choices=choices;
    if(!minority&&phase==='cards')data.word=choices[Number(me===2)];
    if(phase==='done'){
      if(minority)data.votes=names.map((_,i)=>votes.get(i));
      else Object.assign(data,{choices,odd:2,totals:names.map((_,i)=>[...votes.values()].filter(t=>t===i).length)});
    }
    return data;
  }
  function call(me,rpc,args){
    assert.equal(rpc,'party_vote_multiplayer');assert.equal(args.p_kind,kind);
    const {p_action:act,p_code:requestedCode,p_options:o}=args;
    requests.push([me,act,o]);
    if(archivedResult && me===2 && act==='state')return archivedResult;
    if(act!=='create')assert.equal(requestedCode,code);
    if(act==='create'){
      assert.equal(o.capacity,3);assert.equal(me,0);assert.equal(o.password,'test123');
      seats=1;
    }else if(act==='join'){
      if(o.password!=='test123')return {error:'wrong_password'};
      assert.equal(me,seats);++seats;
      if(seats===3)phase=minority?'vote':'cards';
    }else if(me>=seats){return {error:'not_room_member'};}
    else if(act==='ready'){
      assert.equal(phase,'cards');assert.equal(o.round,round);ready.add(me);
      if(ready.size===3)phase='act';
    }else if(act==='start_vote'){
      assert.equal(me,0);assert.equal(phase,'act');assert.equal(o.round,round);phase='vote';
    }else if(act==='vote'){
      assert.equal(phase,'vote');assert.equal(o.round,round);assert.ok(!votes.has(me));assert.ok(Number.isInteger(o.target));
      if(!minority)assert.notEqual(o.target,me);
      votes.set(me,o.target);if(votes.size===3)phase='done';
    }else if(act==='again'){
      assert.equal(me,0);assert.equal(phase,'done');assert.equal(o.round,round);
      ++round;ready=new Set();votes=new Map();phase=minority?'vote':'cards';
    }else assert.equal(act,'state');
    if(act!=='state')revision++;
    return state(me);
  }
  return {call,code,requests,setResult(result){archivedResult=result;}};
}
async function runGame(browser,kind){
 const players=[],issues=[],room=fakeRoom(kind);
 for(let me=0;me<3;me++){
  const context=await browser.newContext({viewport:{width:320,height:640},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  players.push(page);
  page.on('pageerror',err=>issues.push(String(err)));
  await page.exposeFunction('callVoteRpc',(rpc,params)=>room.call(me,rpc,params));
  await page.route('https://ojjuda.kr/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/config.js'){
      const auth={data:{session:{user:{id:'qa-user-'+me}}}};
      const js='window.OjjudaGetClient=async()=>({auth:{getSession:async()=>('+JSON.stringify(auth)+'),onAuthStateChange(){}},rpc:(rpc,q)=>({abortSignal:async()=>({data:await window.callVoteRpc(rpc,q)})})});';
      return route.fulfill({contentType:'text/javascript',body:js});
    }
    if(!/^\/games\/(mission|minority|party-vote)\//.test(pathname))return route.abort();
    const file=pathname.slice(1)+(pathname.endsWith('/')?'index.html':'');
    return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
  });
 }
 const [host,guest,last]=players;
 const url='https://ojjuda.kr/games/'+kind+'/';
 const action=(p,key)=>p.locator('[data-do="'+key+'"]');
 await host.goto(url);const capacity=host.locator('#entry select[name=capacity]');
 assert.deepEqual(await capacity.locator('option').evaluateAll(opts=>opts.map(o=>Number(o.value))),[3,4,5,6,7,8,9,10,11,12]);
 await capacity.selectOption('3');await host.locator('[name=password]').fill('test123');await host.locator('#entry [type=submit]').click();
 await action(host,'copy').waitFor();assert.ok(host.url().includes(room.code));
 for(const p of [guest,last]){
   await p.goto(url+'?room='+room.code);
   if(p===guest){
    await p.locator('[name=password]').fill('bad-pass');await p.locator('#entry [type=submit]').click();
    await p.getByText('방 비밀번호가 맞지 않아요.').waitFor();
   }
   await p.locator('[name=password]').fill('test123');await p.locator('#entry [type=submit]').click();
   await p.locator('#entry').waitFor({state:'detached'});
 }
 if(kind==='mission'){
   for(let i=0;i<players.length;i++){
    const p=players[i],word=i===2?'다른단어테스트':'공통단어테스트';
    assert.ok(!await p.getByText(word,{exact:true}).isVisible());
    await action(p,'reveal').click();await p.getByText(word,{exact:true}).waitFor();
    assert.ok(!await p.getByText(i===2?'공통단어테스트':'다른단어테스트',{exact:true}).isVisible());
    await action(p,'ready').click();
   }
   await action(host,'start_vote').waitFor();assert.equal(await action(guest,'start_vote').count(),0);
   await action(host,'start_vote').click();
 }
 const ballots=kind==='minority'?[0,0,1]:[2,2,0];
 for(let i=0;i<players.length;i++){
  const page=players[i];await action(page,'vote').first().waitFor();
  const slots=await action(page,'vote').evaluateAll(btns=>btns.map(b=>Number(b.dataset.slot)));
  assert.deepEqual(slots,kind==='minority'?[0,1]:[0,1,2].filter(n=>n!==i));
  await page.locator('[data-do="vote"][data-slot="'+ballots[i]+'"]').click();
  await action(page,'vote').first().waitFor({state:'detached'});
  if(i===0){await page.reload();await action(page,'leave').waitFor();assert.equal(await action(page,'vote').count(),0);}
 }
 await action(host,'again').waitFor();
 assert.equal(await action(guest,'again').count(),0);
 for(const page of players){
  await page.locator('.breakdown').waitFor();
  const result=await page.locator('#view').innerText();
  for(const word of kind==='minority'?['단맛','짠맛','태민']:['공통단어테스트','다른단어테스트','태민'])assert.ok(result.includes(word),result);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 // Resume the full-size room as a returning player and exercise each result branch.
 const allNames=Array.from({length:12},(_,i)=>'참가자 '+(i+1));
 for(const outcome of [0,1]){
  let done={kind,code:room.code,title:'테스트 방',capacity:12,phase:'done',revision:50,round:3,me:11,players:allNames,
    choices:kind==='minority'?['단맛','짠맛']:['공통단어테스트','다른단어테스트']};
  if(kind==='minority')done.votes=allNames.map((_,i)=>outcome===0?i%2:1);
  else Object.assign(done,{odd:11,totals:outcome===0?Array(12).fill(1):[11,1,...Array(10).fill(0)]});
  const expected=kind==='minority'?(outcome===0?'정확히 반반이에요!':'모두 같은 선택이에요!'):
    (outcome===0?'최다 득표가 동점이에요':'정체를 숨겼어요!');
  room.setResult(done);
  await last.reload();
  await last.getByRole('heading',{name:expected,exact:true}).waitFor();
 }
 await action(host,'again').click();
 await action(host,kind==='minority'?'vote':'reveal').first().waitFor();
 assert.equal(room.requests.filter(([,op])=>op==='vote').length,3);
 assert.deepEqual(issues,[]);
 for(const p of players)await p.context().close();
}
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{for(const kind of kinds)await runGame(browser,kind);console.log('Two 3-device vote flows, synchronized results, privacy, passwords, rejoin and replay passed.');}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
