'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const origin = 'https://ojjuda.kr';
const actor = '0055c3b4-409a-44b5-9810-17ce24c77a02';
const code = 'P12345';
const pool = {
  king:['승인된 황금 귀마개를 소개해 주세요.'],
  fingers:['승인된 초록 양말을 신은 사람'],
  imagevote:['승인된 바닷속 도서관을 맡을 사람은?'],
  truthFull:true, truth:{mild:['순한맛 검수본 하나?'],spicy:['빨간맛 검수본 둘?']}
};
const adminRow = {id:82,kind:'truth',flavor:'mild',text:'관리자 원본 질문?',revision:3};
const pages = [];
const adminShell = '<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body><main id="manage"></main><script src="/config.js"></script><script src="/admin/drinking-prompts.js"></script><script>OjjudaGetClient().then(client=>OjjudaAdminDrinkingPrompts.mount({container:document.getElementById("manage"),client,getAdminId:()=>'+JSON.stringify(actor)+',isCurrent:()=>true}));</script></body></html>';
function deferred(){
  let resolve;
  const promise = new Promise(r=>{resolve=r});
  return {promise,resolve};
}
function mutation(kind) {
  if(kind==='king')return {phase:'order',card:0,king:0};
  const phase=kind==='truth'?'setup':'prompt';
  return {phase,game:{phase,current:0,turn:0,fingers:[5,5,5],mine:false,submitted:0}};
}
function makeMock({admin=false,member='adult',seat=0,kind='truth'}={}) {
  const records=[],errors=[],delayed=deferred(),gate=deferred(),rooms=new Map();
  const model={row:{...adminRow},queue:[{id:21,kind:'king',flavor:'',text:'새 왕게임 명령을 등록해 주세요.'}],failKind:null,submissions:'fail',agePending:false,member};
  const success=data=>({data,error:null}),fail=message=>({data:null,error:{message}});
  function actions(action) {return records.filter(r=>r.name==='drinking_prompt_suggestions'&&r.opts.p_action===action);}
  async function handler(name,opts={}) {
    records.push({name,opts});
    if(name==='get_my_member_identity'){
      if(model.agePending)await gate.promise;
      return success({age:model.member==='adult'?24:17,locked:true});
    }
    if(name==='is_admin')return success(admin);
    if(model.member!=='adult'){errors.push('Before adult grant: '+name);return fail('adult_required');}
    if(name==='drinking_prompt_suggestions'){
      const a=opts.p_action,o=opts.p_options||{};
      if(a==='pool')return success(pool);
      if(a==='submit') {
        if(model.submissions==='delay')await delayed.promise;
        if(model.submissions==='ok'&&o.kind!==model.failKind)return success({ok:true});
        return fail('offline_test');
      }
      if(!admin){errors.push('Member called '+a);return fail('not_admin');}
      if(a==='admin_list')return success({items:model.queue,next:null});
      if(a==='truth_list')return success({items:model.row?[model.row]:[],next:null});
      if(a==='approve'){model.queue=[];return success({ok:true});}
      if(a==='truth_edit'){assert.equal(o.revision,model.row.revision);model.row={...model.row,...o,revision:o.revision+1};return success({ok:true});}
      if(a==='truth_delete'){assert.equal(o.revision,model.row.revision);model.row=null;return success({ok:true});}
    }
    if(['king_multiplayer','party_live_multiplayer'].includes(name)){
      const roomKind=name==='king_multiplayer'?'king':opts.p_kind;
      const s=rooms.get(roomKind)||{title:'테스트 방',players:['다은','하늘','진아'],capacity:3,code,kind:roomKind,me:seat,revision:1,round:1,...mutation(roomKind)};
      const action=opts.p_action,o=opts.p_options||{};
      if(action==='state'){}else if(action==='order'){Object.assign(s,{phase:'done',mission:o.mission,number:o.number,recipient:1,second:null});s.revision++;}
      else if(['finger_prompt','image_prompt'].includes(action)){
        s.phase=action==='finger_prompt'?'answer':'vote';Object.assign(s.game,{phase:s.phase,question:o.question});s.revision++;
      }else if(action==='truth_add'){
        const added=s.game.added||{mild:0,spicy:0};added[o.flavor]++;s.game.added=added;s.revision++;
      }else if(action==='truth_begin'){
        s.phase='pick';s.game={phase:s.phase,turn:0,mode:o.mode};s.revision++;
        if(o.showFlavor)s.game.cardFlavors=o.mode==='mixed'?['spicy','mild']:[o.mode,o.mode];
      }else {errors.push(name+' unexpected '+action);return fail('unexpected_action');}
      rooms.set(roomKind,s);return success({...s,serverMs:Date.now()});
    }
    errors.push('Unexpected RPC '+name); return fail('unexpected_rpc');
  }
  return {handler,model,records,errors,actions,delayed,gate};
}
async function pageFor(browser,cfg) {
  const mock=makeMock(cfg),context=await browser.newContext({viewport:{width:350,height:740},isMobile:true,hasTouch:true});
  const page=await context.newPage();page.setDefaultTimeout(6000);pages.push([context,mock,page]);
  page.on('pageerror',e=>mock.errors.push(String(e)));
  await page.exposeFunction('testRpc',mock.handler);
  await page.route(origin+'/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    const fulfill=(type,body,status=200)=>route.fulfill({contentType:/^(text\/|application\/javascript)/.test(type)?type+'; charset=utf-8':type,body,status});
    if(pathname==='/config.js'){
      const auth={id:actor,is_anonymous:false};
      return fulfill('application/javascript',`(()=>{let user=${JSON.stringify(auth)};const listeners=[];
        const service={auth:{getUser:async()=>({data:{user}}),getSession:async()=>({data:{session:{user}}}),
        onAuthStateChange(fn){listeners.push(fn);queueMicrotask(()=>fn('INITIAL_SESSION',{user}));return {data:{subscription:{unsubscribe(){}}}};}},
        rpc(name,opts){const p=window.testRpc(name,opts||{});p.abortSignal=()=>p;return p;}};
        window.OjjudaGetClient=async()=>service;window.changeQaUser=id=>{user={id,is_anonymous:false};listeners.forEach(fn=>fn('SIGNED_IN',{user}));};})();`);
    }
    if(pathname==='/qa-admin/')return fulfill('text/html',adminShell);
    if(pathname==='/world.html')return fulfill('text/html','<main id="arcade">오쭈다 오락실</main>');
    const f=path.resolve('.','.'+pathname+(pathname.endsWith('/')?'index.html':''));
    if(!fs.existsSync(f))return fulfill('text/plain','missing',404);
    const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webp':'image/webp','.wav':'audio/wav','.png':'image/png'}[path.extname(f)]||'application/octet-stream';
    return fulfill(type,fs.readFileSync(f));
  });
  return {p:page,m:mock,context};
}
const localUrl=origin+'/games/drinking/local/';
const act=(p,id)=>p.locator('[data-action="'+id+'"]').click();
const before=async p=>p.evaluate(async()=>{await window.DrinkingPrompts.ready});
const callText=(m,kind,word)=>m.actions('submit').some(({opts})=>opts.p_options.kind===kind&&opts.p_options.text===word);
async function seen(check,message){
  for(let i=0;i<80;i++){if(check())return;await new Promise(r=>setTimeout(r,40));}
  assert.fail(message);
}
async function localAcceptance(browser){
  const {p,m}=await pageFor(browser,{});
  await p.goto(localUrl+'#fingers');
  await act(p,'start');await before(p);
  await p.waitForFunction(label=>window.DrinkingPrompts.list('fingers').includes(label),pool.fingers[0]);
  await act(p,'party-suggest');
  const initial=await p.locator('#party-question').inputValue();
  await p.locator('#party-prompt [type=submit]').click();
  await p.getByRole('heading',{name:initial,exact:true}).waitFor();
  await new Promise(r=>setTimeout(r,150));assert.equal(m.actions('submit').length,0,'built-in or previously approved suggestions must stay out of the queue');
  await p.locator('#fold-form [type=submit]').click();
  await p.locator('#party-question').fill(pool.fingers[0]);
  await p.locator('#party-prompt [type=submit]').click();
  await p.getByRole('heading',{name:pool.fingers[0],exact:true}).waitFor();
  assert.equal(m.actions('submit').length,0,'published suggestions must not recur in the queue');
  await p.locator('#fold-form [type=submit]').click();
  const own='나만의 주황 모자를 쓰고 온 사람';
  await p.locator('#party-question').fill(own);m.model.submissions='delay';
  await p.locator('#party-prompt [type=submit]').click();
  await p.getByRole('heading',{name:own,exact:true}).waitFor();
  await seen(()=>callText(m,'fingers',own),'typed condition should be submitted after starting');
  await p.locator('#fold-form [type=submit]').click();await p.locator('#party-question').waitFor();
  m.model.submissions='ok';m.model.failKind='king';m.delayed.resolve();
  await seen(()=>m.actions('submit').length>0,'conditional submit seen');
  await p.goto(localUrl+'#king');await act(p,'start');
  for(let i=0;i<4;i++){await act(p,'reveal');await act(p,'hide');}
  const line='오늘의 달 탐험대 출발 멘트를 말해 주세요.';
  await p.locator('#king-mission').fill(line);await act(p,'royal');
  await p.locator('.king-order').getByRole('heading',{name:line}).waitFor();
  await seen(()=>callText(m,'king',line),'local king text should be submitted');
  await p.getByRole('link',{name:'오쭈다 오락실로',exact:true}).click();await p.waitForURL(origin+'/world.html?tab=arcade');
  console.log('Local suggested and approved pool, typed conditions/missions during slow and failed queueing, arcade return.');
}
async function truthAcceptance(browser){
  const {p,m}=await pageFor(browser,{});
  await p.goto(localUrl+'#truth');
  await act(p,'truth-editor');const dialog=p.locator('#truth-editor');await dialog.waitFor();
  assert.equal(await dialog.locator('[data-edit],[data-delete],#truth-restore,#truth-cancel-edit').count(),0);
  assert.equal(await dialog.getByRole('button',{name:/수정|삭제/}).count(),0);
  await before(p);
  await dialog.locator('#truth-flavor').selectOption('spicy');
  const question='개인 카드로 오늘 처음 해 볼 대화는?';
  await dialog.locator('#truth-question').fill(question);m.model.submissions='delay';await dialog.locator('#truth-submit').click();
  await seen(()=>callText(m,'truth',question),'new member truth question should enter moderation');
  assert.equal(m.actions('submit').at(-1).opts.p_options.flavor,'spicy');
  await dialog.locator('#truth-close').click();await p.evaluate(()=>{Math.random=()=>0;});await act(p,'start');
  await p.locator('[data-action=truth-pick]').first().waitFor();
  // Exercise approved truth cards actually drawn from the authoritative pool.
  const draws=new Set();
  for(let i=0;i<8;i++){
    if(!await p.locator('[data-action=truth-pick]').count()){await act(p,'truth-setup');await act(p,'start');}
    await p.locator('[data-action=truth-pick]').nth(i%2).click();
    draws.add(await p.locator('.truth-front p').textContent());
    if(draws.has(question)&&draws.has(pool.truth.mild[0]))break;
    await act(p,'truth-next');
  }
  assert.ok(draws.has(question),'current member card playable while review pending');assert.ok(draws.has(pool.truth.mild[0]),'approved truth card drawn');
  assert.ok([...draws].every(v=>v===question||v===pool.truth.mild[0]||v===pool.truth.spicy[0]),'replaced/deleted built-ins must not reappear');
  m.delayed.resolve();
  await p.goto(localUrl+'#truth');await act(p,'truth-editor');
  m.model.member='minor';await p.evaluate(()=>window.changeQaUser('16dc86e1-0f7c-4cb4-9fcf-a2a3b193584e'));
  await p.locator('#access-screen[data-state=underage]').waitFor();
  assert.equal(await p.locator('dialog[open]:visible').count(),0);
  console.log('Member add-only truth card, authoritative deck, immediate play, open dialog revoked on account switch.');
}
async function multiAcceptance(browser){
  for(const [kind,word] of [['king','새 왕실 박물관의 개장 방송을 해 주세요.'],['imagevote','우리 중 상상 속 보물섬에 가장 잘 어울리는 사람은?'],['fingers','오늘 노란 종이배를 접어 본 사람']]){
    const {p,m}=await pageFor(browser,{});m.model.submissions='delay';
    await p.goto(origin+'/games/'+kind+'/?room='+code);
    const form=p.locator(kind==='king'?'#order':'#pair-form');
    await form.waitFor();await before(p);
    const input=form.locator(kind==='king'?'[name=mission]':'#pair-question');
    await input.fill(word);await form.locator('[type=submit]').click();
    await p.getByRole('heading',{name:word,exact:true}).waitFor();
    await seen(()=>callText(m,kind,word),'online '+kind+' should submit accepted custom wording');
    m.delayed.resolve();
  }
  const {p,m}=await pageFor(browser,{});
  await p.goto(origin+'/games/truth/?room='+code);const panel=p.locator('#truth-editor');await panel.locator('summary').click();
  assert.equal(await panel.locator('#truth-reset,#truth-list,[data-delete],[data-edit]').count(),0);
  const entered='멀티에서 바로 쓸 수 있는 질문은?';
  await panel.locator('#truth-flavor').selectOption('mild');await panel.locator('#truth-question').fill(entered);await panel.locator('#truth-submit').click();
  await seen(()=>callText(m,'truth',entered),'online member add-only card submitted');await p.locator('#truth-begin').click();
  await p.locator('[data-truth-side]').first().waitFor();
  const begin=m.records.find(r=>r.name==='party_live_multiplayer'&&r.opts.p_action==='truth_begin');
  assert.ok(begin);const deck=begin.opts.p_options.deck;assert.ok(deck.mild.includes(pool.truth.mild[0]));assert.ok(deck.spicy.includes(pool.truth.spicy[0]));
  assert.ok(m.records.some(r=>r.name==='party_live_multiplayer'&&r.opts.p_action==='truth_add'&&r.opts.p_options.question===entered),'server adds the member card to this room independently of queue status');
  const guest=await pageFor(browser,{seat:1});
  await guest.p.goto(origin+'/games/truth/?room='+code);const gpanel=guest.p.locator('#truth-editor');
  await gpanel.locator('summary').click();assert.equal(await guest.p.locator('#truth-begin').count(),0);
  const guestQuestion='방장 아닌 사람이 직접 추가한 질문?';guest.m.model.submissions='delay';
  await gpanel.locator('#truth-question').fill(guestQuestion);await gpanel.locator('#truth-submit').click();
  await seen(()=>guest.m.records.some(r=>r.name==='party_live_multiplayer'&&r.opts.p_action==='truth_add'&&r.opts.p_options.question===guestQuestion),'guest directly adds a question');
  await seen(()=>callText(guest.m,'truth',guestQuestion),'guest question separately enters moderation');
  guest.m.delayed.resolve();
  console.log('Multiplayer custom prompts start immediately, host uses own and published truth questions.');
}
async function settingsAcceptance(browser){
  const labels={mild:'순한맛',spicy:'빨간맛'};
  for(const mode of ['mixed','mild','spicy']){
    for(const show of [false,true]){
      const {p,context}=await pageFor(browser,{});
      await p.setViewportSize({width:320,height:720});
      await p.goto(localUrl+'#truth');
      assert.ok(await p.getByLabel('반반',{exact:true}).isChecked());
      assert.ok(await p.getByLabel('숨기기',{exact:true}).isChecked());
      await p.locator('input[name=truth-mode][value='+mode+']').check();
      await p.getByLabel(show?'보이기':'숨기기',{exact:true}).check();
      assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await act(p,'start');
      for(let i=0;i<4;i++){
        const hand=p.locator('.truth-pair'), cards=hand.locator('.truth-back');
        await hand.waitFor();assert.equal(await cards.count(),2);
        const marked=await hand.locator('.truth-card-label').allTextContents();
        assert.equal(marked.length,show?2:0);
        if(show)assert.deepEqual(marked.slice().sort(),mode==='mixed'?['빨간맛','순한맛'].sort():[labels[mode],labels[mode]]);
        if(!show)assert.ok(!(await cards.evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')).join(' '))).match(/순한맛|빨간맛/));
        await cards.nth(i%2).click();
        const flavor=await p.locator('.truth-front h2').textContent();
        assert.ok(mode==='mixed'||flavor===labels[mode]);if(show)assert.equal(flavor,marked[i%2]);
        await act(p,i%2?'truth-pass':'truth-next');
      }
      await act(p,'truth-setup');assert.ok(await p.locator('input[name=truth-mode][value='+mode+']').isChecked());
      await context.close();
      const online=await pageFor(browser,{});
      await online.p.goto(origin+'/games/truth/?room='+code);
      await online.p.locator('input[name=truth-mode][value='+mode+']').check();
      await online.p.getByLabel(show?'보이기':'숨기기',{exact:true}).check();
      await online.p.locator('#truth-begin').click();await online.p.locator('.truth-hand').waitFor();
      const begin=online.m.records.find(r=>r.opts.p_action==='truth_begin').opts.p_options;
      assert.equal(begin.mode,mode);assert.equal(begin.showFlavor,show);
      const liveLabels=await online.p.locator('.truth-hand .truth-card-label').allTextContents();
      assert.deepEqual(liveLabels,!show?[]:mode==='mixed'?['빨간맛','순한맛']:[labels[mode],labels[mode]]);
      await online.context.close();
    }
  }
  console.log('All six local and room settings, flavor labels, turns, replay and 320px layout passed.');
}
async function permissions(browser){
  const {p,m}=await pageFor(browser,{admin:true});
  await p.goto(origin+'/qa-admin/');
  await p.getByText('새 왕게임 명령을 등록해 주세요.').waitFor();
  await p.getByRole('button',{name:'등록',exact:true}).click();
  await p.getByText('검토할 문구가 없어요.').waitFor();
  await p.getByRole('button',{name:'진실게임 카드 관리'}).click();
  await p.getByText(adminRow.text).waitFor();await p.getByRole('button',{name:'수정',exact:true}).click();
  const form=p.locator('.drink-admin-edit');await form.locator('textarea').fill('관리자가 수정한 질문?');await form.getByRole('button',{name:'저장'}).click();
  await p.getByText('관리자가 수정한 질문?').waitFor();
  p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'삭제',exact:true}).click();await p.getByText('조건에 맞는 카드가 없어요.').waitFor();
  assert.deepEqual(m.actions('truth_edit')[0].opts.p_options,{id:82,revision:3,text:'관리자가 수정한 질문?',flavor:'mild'});
  assert.deepEqual(m.actions('truth_delete')[0].opts.p_options,{id:82,revision:4});
  const refused=await pageFor(browser,{});await refused.p.goto(origin+'/qa-admin/');
  await refused.p.getByText('관리 권한과 회원 정보를 다시 확인해 주세요.').waitFor();
  assert.equal(await refused.p.getByRole('button',{name:'수정',exact:true}).count(),0);
  assert.equal(refused.m.errors.pop(),'Member called admin_list');
  const blocked=await pageFor(browser,{member:'minor'});
  for(const url of [localUrl+'#truth',origin+'/games/truth/?room='+code]){
    await blocked.p.goto(url);await blocked.p.locator('#access-screen[data-state=underage]').waitFor();
    assert.equal(await blocked.p.locator('#truth-editor,[data-action=truth-editor],#game').count(),0);
    assert.equal(blocked.m.records.filter(r=>r.name!=='get_my_member_identity').length,0);
  }
  console.log('Admin queue/registered card edit and delete, non-admin denial and blocked local/multiplayer gate.');
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  try{
    await settingsAcceptance(browser);
    await localAcceptance(browser);await truthAcceptance(browser);await multiAcceptance(browser);await permissions(browser);
    for(const [,m] of pages)assert.deepEqual(m.errors,[]);
  }catch(error){
    for(const [,m,p] of pages)console.log(p.url(),p.isClosed()?'':(await p.locator('body').innerText().catch(()=>'' )).slice(0,420),m.errors, m.records.slice(-5).map(r=>[r.name,r.opts.p_action]));
    throw error;
  }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1});
