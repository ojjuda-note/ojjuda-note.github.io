'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const origin = 'https://ojjuda.kr';
const actor = '541bf0e8-349c-4ee0-b75e-80a5634bc702';
const mime = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.webp':'image/webp', '.png':'image/png', '.wav':'audio/wav'};
const banks = {
  bomb: [['달에서 볼 수 있는 것'], ['동네 골목에서 찾을 수 있는 것']],
  liar: [['금빛 모래시계'], ['은빛 회중시계']],
  minority: [[['여름 바다','겨울 숲']], [['오전 산책','저녁 산책']]],
  mission: [[['돌멩이 줍기','조개 줍기']], [['나뭇잎 접기','종이비행기 접기']]],
  initial: [['ㄱㅅ'], ['ㅁㄷ']],
  king: [['종이배를 타고 떠나는 선장의 인사를 해 주세요.'], ['우주 정류장의 출발 안내를 해 주세요.']],
  fingers: [['하늘색 운동화를 신은 사람'], ['오늘 노란색 옷을 입은 사람']],
  imagevote: [['도서관 명예 사서로 뽑힐 사람은?'], ['달 탐사대의 대장이 될 사람은?']],
  truth: [{mild:['여름에 가고 싶은 곳은?'],spicy:['숨겨 둔 여름 추억은?']}, {mild:['겨울에 가고 싶은 곳은?'],spicy:['숨겨 둔 겨울 추억은?']}]
};
const config = `(()=>{
const user={id:${JSON.stringify(actor)},is_anonymous:false};
const client={
  auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user}}}),onAuthStateChange(f){queueMicrotask(()=>f('INITIAL_SESSION',{user}));return {data:{subscription:{unsubscribe(){}}}};}},
  rpc(n,o){const r=window.contentTestRpc(n,o||{});r.abortSignal=()=>r;return r;}
};window.OjjudaGetClient=async()=>client;
})();`;
function action(p,name){return p.locator('[data-action="'+name+'"]').first();}
async function pageFor(browser, kind) {
  const ctx = await browser.newContext({viewport:{width:365,height:770},isMobile:true});
  const p = await ctx.newPage();
  p.setDefaultTimeout(5000);
  const state = {revision:0,requests:[],errors:[]};
  p.on('pageerror', e=>state.errors.push(String(e)));
  await p.exposeFunction('contentTestRpc', (name,args)=>{
    if(name==='get_my_member_identity')return {data:{locked:true,age:28},error:null};
    if(name==='drinking_content'&&args.p_action==='pool'){
      const ks=args.p_options.kinds;
      state.requests.push([...ks]);
      assert.deepEqual(Array.from(ks),[kind],'fetch only the game being played');
      return {data:{banks:{[kind]:banks[kind][state.revision]}},error:null};
    }
    state.errors.push('unexpected '+name+' '+args.p_action);return {data:null,error:{message:'unexpected'}};
  });
  await p.route(origin+'/**', async route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/config.js')return route.fulfill({contentType:'application/javascript; charset=utf-8',body:config});
    const f=path.resolve(process.env.QA_REPO||'.','.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!fs.existsSync(f))return route.fulfill({status:404,body:''});
    const t=mime[path.extname(f)]||'application/octet-stream';
    return route.fulfill({contentType:/^(text\/|application\/javascript)/.test(t)?t+'; charset=utf-8':t,body:fs.readFileSync(f)});
  });
  await p.goto(origin+'/games/drinking/local/');
  return {p,ctx,state};
}
async function start(p,kind){
  await p.locator('[data-action=open][data-value="'+kind+'"]').click();
  if(kind==='bomb'){
    await action(p,'confirm-bomb-time').click();
    await action(p,'start-bomb').click();
  }else{
    if(kind==='truth')await p.locator('input[name=truth-mode][value=mild]').check();
    await action(p,'start').click();
  }
}
async function inspectRound(p,kind,bank,edit){
  if(kind==='liar'||kind==='mission'){
    await action(p,'reveal').waitFor();
    edit();
    const values=[];
    for(let i=0;i<4;i++){
      await action(p,'reveal').click();
      values.push(await p.locator('.private-card strong').innerText());
      await action(p,'hide').click();
    }
    if(kind==='liar'){
      assert.equal(values.filter(v=>v===bank[0]).length,3);
      assert.equal(values.filter(v=>v==='당신은 라이어').length,1);
    }else{
      assert.equal(values.filter(v=>v===bank[0][0]).length,3);
      assert.equal(values.filter(v=>v===bank[0][1]).length,1);
    }
    return;
  }
  if(kind==='minority'){
    await action(p,'open-vote').waitFor();
    edit();
    for(let i=0;i<2;i++){
      await action(p,'open-vote').click();
      assert.deepEqual(await p.locator('[data-action=cast]').allTextContents(),bank[0]);
      await action(p,'cast').click();
    }
    return;
  }
  if(kind==='initial'){
    await action(p,'initial-go').waitFor();
    assert.equal(await p.locator('.play-body p b').textContent(),bank[0]);
    edit();
    await action(p,'initial-go').click();
    assert.equal(await p.locator('.play-body h2').textContent(),bank[0]);
    await action(p,'word-ok').click();
    assert.equal(await p.locator('.play-body p b').textContent(),bank[0]);
    return;
  }
  if(kind==='bomb'){
    await action(p,'pass-bomb').waitFor();
    assert.equal(await p.locator('.play-body h2').textContent(),bank[0]);
    edit();
    await action(p,'pass-bomb').click();
    assert.equal(await p.locator('.play-body h2').textContent(),bank[0]);
    return;
  }
  if(kind==='truth'){
    await action(p,'truth-pick').waitFor();edit();
    for(let i=0;i<2;i++){
      await action(p,'truth-pick').click();
      assert.equal(await p.locator('.truth-front p').textContent(), bank.mild[0]);
      await action(p,'truth-next').click();
    }
    return;
  }
  if(kind==='king'){
    for(let i=0;i<4;i++){
      await action(p,'reveal').click();
      await action(p,'hide').click();
    }
    await p.locator('#king-mission').waitFor();
    assert.equal(await p.locator('#king-mission').inputValue(),bank[0]);
    edit();await action(p,'royal').click();
    assert.equal(await p.locator('.king-order h2').textContent(),bank[0]);
    return;
  }
  const input=p.locator('#party-question');
  await input.waitFor();
  assert.equal(await input.inputValue(),bank[0]);
  edit();await p.locator('#party-prompt [type=submit]').click();
  if(kind==='fingers'){
    assert.equal(await p.locator('.play-body h2').textContent(),bank[0]);
  }else{
    await action(p,'open-vote').click();
    assert.ok((await p.locator('.play-body p').innerText()).includes(bank[0]));
  }
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  try{
    for(const [kind,history] of Object.entries(banks)){
      const {p,ctx,state}=await pageFor(browser,kind);
      try{
        await start(p,kind);
        await inspectRound(p,kind,history[0],()=>{state.revision=1;});
        const firstLoads=state.requests.length;
        assert.ok(firstLoads>0,'initial pool fetch');
        await action(p,'menu').click();
        await start(p,kind);
        await inspectRound(p,kind,history[1],()=>{});
        assert.ok(state.requests.length>firstLoads,'new pool fetch on following round');
        assert.deepEqual(state.errors,[]);
        console.log(kind+' current round preserved, replacement only on next round');
      }catch(error){
        console.error(kind,state.requests,state.errors,(await p.locator('body').innerText()).slice(-650));
        throw error;
      }finally{await ctx.close();}
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
