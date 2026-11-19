const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const feature = path.join(root, 'features/pajang');
const origin = 'https://pajang-answer-edit.test';
const address = origin + '/features/pajang/station.html';
const artifacts = path.join(root, 'tests/artifacts/pajang-discovery');
const sample = {
  owner:'11111111-1111-4111-8111-111111111111',
  peer:'22222222-2222-4222-8222-222222222222',
  day:'2026-11-19', slot:'am', currentQuestion:'함께 나누고 싶은 오늘의 작은 행복은 무엇인가요?',
  currentBody:'따뜻한 차를 마시며 오늘 이야기를 나누고 싶어요.',
  publicDay:'2026-11-17', publicSlot:'pm', publicQuestion:'다시 걷고 싶은 길은 어디인가요?',
  publicBody:'노을이 비치던 강변을 다시 걷고 싶어요.',
  privateDay:'2025-09-10', privateSlot:'am', privateQuestion:'오래 간직하고 싶은 순간은 무엇인가요?',
  privateBody:'비 오는 날 함께 들었던 노래를 오래 기억하고 싶어요.'
};

// Only the transport and account are synthetic. The page runs the actual built
// StationApp, its history controller and the production styles, without network writes.
function installFixture(data) {
  const me = {id:data.owner,name:'보리',region:'서울특별시',interest:'book',body:data.currentBody};
  const state = {
    day:data.day,slot:data.slot,nextAt:new Date(Date.now()+3600000).toISOString(),authenticated:true,
    remaining:3,signals:[],messages:[],people:[],me,
    question:{id:19,q:[data.currentQuestion],answers:[]},
    locationEnabled:false,locationVersion:0,radarOn:false
  };
  const historyAnswers = [
    {day:data.day,slot:data.slot,question:data.currentQuestion,body:data.currentBody},
    {day:data.publicDay,slot:data.publicSlot,question:data.publicQuestion,body:data.publicBody},
    {day:data.privateDay,slot:data.privateSlot,question:data.privateQuestion,body:data.privateBody}
  ];
  const feed = [
    {...historyAnswers[1],peer:data.owner,name:me.name,region:me.region,interest:me.interest,
      at:Date.parse('2026-11-17T10:00:00Z'),own:true,sent:false,received:false},
    {...historyAnswers[1],peer:data.peer,name:'은하',region:'서울특별시',interest:'walk',
      at:Date.parse('2026-11-17T10:01:00Z'),body:'나무가 많은 동네 길이 생각나요.',own:false,sent:false,received:false}
  ];
  const listeners = new Set();
  let session = {user:{id:'auth-answer-owner',is_anonymous:false},access_token:'answer-owner-token'};
  const control = window.answerEditFixture = {
    calls:[],unexpected:[],historyReads:0,feedReads:0,historyEvents:0,
    snapshot:()=>structuredClone({state,historyAnswers,feed}),
    changeUser(id) {
      session = id ? {user:{id,is_anonymous:false},access_token:'changed-account-token'} : null;
      for(const listener of listeners)listener(id?'SIGNED_IN':'SIGNED_OUT',session);
    }
  };
  window.addEventListener('popstate',()=>control.historyEvents++,true);
  const ok = data => ({data:structuredClone(data),error:null});
  function query(run) {
    let promise,signal;
    const headers = {};
    const q = {
      setHeader(name,value){headers[name]=value;return q;},
      abortSignal(value){signal=value;return q;},
      then(resolve,reject){promise ||= Promise.resolve().then(()=>run(signal,headers));return promise.then(resolve,reject);}
    };
    return q;
  }
  const db = {
    auth:{
      getSession:async()=>({data:{session},error:null}),
      getUser:async()=>({data:{user:session?.user??null},error:null}),
      onAuthStateChange(listener){listeners.add(listener);return {data:{subscription:{unsubscribe(){listeners.delete(listener);}}}};}
    },
    rpc(name,args) {
      return query((_signal,headers)=>{
        if(name==='is_admin')return ok(false);
        if(name==='pajang_profile_preferences')return ok({person:args.p_peer||data.owner,version:0,preferences:{
          relationship_intents:[],meeting_styles:[],relationship_values:[],affection_styles:[],life_priorities:[],
          custom:{meeting_styles:[],relationship_values:[],affection_styles:[],life_priorities:[]}
        }});
        if(name==='pajang_my_answers'){control.historyReads++;return ok(historyAnswers);}
        if(name==='pajang_discovery_feed'){
          control.feedReads++;return ok({items:feed,total:feed.length,nextCursor:null,remaining:3});
        }
        if(name==='pajang_member'){
          const action=args.p_action,body=args.p_data||{};
          if(action==='state')return ok(state);
          if(action==='edit-history-answer'||action==='edit-answer'){
            control.calls.push({action,data:structuredClone(body),headers:{...headers}});
            const answer=historyAnswers.find(item=>item.day===body.day&&item.slot===body.slot);
            // Fixture-only marker: real masking remains authoritative on the server.
            const savedBody=body.body.replaceAll('금칙','❤️❤️');
            if(!answer||(answer.body!==body.previousBody&&answer.body!==savedBody))return {data:null,error:{code:'PT412',message:'answer changed'}};
            answer.body=savedBody;
            for(const row of feed)if(row.peer===data.owner&&row.day===body.day&&row.slot===body.slot)row.body=savedBody;
            if(body.day===state.day&&body.slot===state.slot)state.me.body=savedBody;
            return ok(state);
          }
        }
        control.unexpected.push({name,args});throw Error('Unexpected RPC '+name);
      });
    }
  };
  window.OjjudaGetClient=async()=>db;
  window.OjjudaLocation={acceptPreference(){},subscribe(){return ()=>{};}};
  window.pajangArt={};window.pajangLoadArt=async()=>undefined;
  window.pajangState=structuredClone(state);
  if(new URL(location.href).searchParams.get('fixture')==='join')window.pajangState.me=null;
}

async function assertFits(page,dialog,width) {
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(dimensions.scroll<=dimensions.width+1,'page fits '+width+'px: '+JSON.stringify(dimensions));
  const box=await dialog.boundingBox();
  assert.ok(box&&box.x>=-1&&box.x+box.width<=width+1,'editor stays within '+width+'px viewport');
  assert.equal(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'editor has no horizontal overflow');
}

(async()=>{
  const bundle=await fs.readFile(process.env.PAJANG_TEST_BUNDLE||path.join(feature,'assets/station.js'));
  const template=(await fs.readFile(path.join(feature,'station.html'),'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace('<main id="gate"','<main hidden id="gate"')
    .replace('id="station" hidden','id="station"')
    .replace('</body>','<script src="/fixture.js"></script><script src="/program.js"></script></body>');
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  let page,checkpoint='setup';
  const errors=[];
  try {
    await fs.mkdir(artifacts,{recursive:true});
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR'});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/features/pajang/station.html')return route.fulfill({contentType:'text/html',body:template});
      if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:`(${installFixture.toString()})(${JSON.stringify(sample)});`});
      if(url.pathname==='/program.js')return route.fulfill({contentType:'text/javascript',body:bundle});
      if(!/\.(?:css|svg|woff2?|webp|png)$/.test(url.pathname))return route.abort();
      const file=path.resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+path.sep))return route.abort();
      try{return await route.fulfill({path:file});}catch{return route.fulfill({status:404,body:''});}
    });
    page=await context.newPage();page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.message));
    let discard=false;
    const confirmations=[];
    page.on('dialog',async dialog=>{
      confirmations.push({type:dialog.type(),message:dialog.message()});
      await (discard?dialog.accept():dialog.dismiss());
    });
    const reset=async(query='')=>{
      if(page.url().startsWith(origin))await page.evaluate(()=>history.replaceState(null,'',location.href));
      await page.goto(address+query);
      await page.getByRole('navigation',{name:'파장 메뉴'}).waitFor();
      if(!query.includes('fixture=join'))await page.locator('#answers .answercard').nth(1).waitFor();
    };
    const editDialog=()=>page.getByRole('dialog',{name:'답변 수정',exact:true});
    const listDialog=()=>page.getByRole('dialog',{name:'내가 남긴 답변',exact:true});
    const currentNavigation=()=>page.getByRole('navigation',{name:'파장 메뉴'});
    const openList=async()=>{
      await currentNavigation().getByRole('link',{name:'내 파장',exact:true}).click();
      await page.getByRole('button',{name:'내가 남긴 답변',exact:true}).click();
      await listDialog().locator('article').nth(1).waitFor();
    };
    const openOldPrivate=async()=>{
      await listDialog().locator('summary').click();
      await listDialog().locator('article').filter({hasText:sample.privateQuestion}).getByRole('button',{name:'답변 수정',exact:true}).click();
      await editDialog().waitFor();
      return editDialog();
    };
    await reset();
    checkpoint='ownership';
    const own=page.locator('#answers .answercard').filter({hasText:sample.publicBody});
    assert.equal(await own.getByRole('button',{name:'답변 수정',exact:true}).count(),1);
    assert.equal(await page.locator('#answers .answercard').filter({hasText:'나무가 많은 동네 길이 생각나요.'})
      .getByRole('button',{name:'답변 수정',exact:true}).count(),0,'another member never gets an edit control');
    assert.equal(await page.locator('#answers').getByText(sample.privateQuestion,{exact:true}).count(),0,'older private history is not part of the public feed fixture');

    checkpoint='private-history';
    await openList();
    const originalUrl=page.url();
    let dialog=await openOldPrivate();
    assert.equal(await dialog.getByLabel('내 이야기',{exact:true}).inputValue(),sample.privateBody);
    assert.equal(await dialog.locator('time').getAttribute('datetime'),sample.privateDay);
    assert.match(await dialog.locator('.sub').first().textContent(),/오전/);
    assert.equal(await dialog.locator('.questionbox').textContent(),sample.privateQuestion);
    assert.equal(await dialog.getByRole('button',{name:'수정 저장하기',exact:true}).isDisabled(),true,'unchanged answer is not submitted');
    assert.equal(await dialog.getByLabel('내 이야기',{exact:true}).evaluate(node=>node===document.activeElement),true);
    for(const width of [320,390,750]){
      await page.setViewportSize({width,height:width===750?750:844});
      await assertFits(page,dialog,width);
      if(width!==320)await page.screenshot({path:path.join(artifacts,`answer-edit-${width}.png`),animations:'disabled'});
    }
    await page.setViewportSize({width:390,height:844});
    const revisedPrivate='가'.repeat(218)+'금칙',savedPrivate='가'.repeat(218)+'❤️❤️';
    await dialog.getByLabel('내 이야기',{exact:true}).fill(revisedPrivate);
    await dialog.getByRole('button',{name:'수정 저장하기',exact:true}).click();
    await listDialog().waitFor();
    await listDialog().locator('summary').click();
    await listDialog().getByText(savedPrivate,{exact:true}).waitFor();
    assert.equal(await listDialog().getByText(revisedPrivate,{exact:true}).count(),0,'the refreshed list shows the canonical server body');
    assert.equal(page.url(),originalUrl,'saving returns to the original settings/list route');
    let control=await page.evaluate(()=>({calls:answerEditFixture.calls,reads:answerEditFixture.historyReads,snapshot:answerEditFixture.snapshot()}));
    assert.ok(control.reads>=2,'the returned private list is read again');
    assert.deepEqual(control.calls[0],{action:'edit-history-answer',data:{
      day:sample.privateDay,slot:sample.privateSlot,body:revisedPrivate,previousBody:sample.privateBody,expectedPerson:sample.owner
    },headers:{Authorization:'Bearer answer-owner-token'}});
    assert.equal(control.snapshot.state.me.body,sample.currentBody,'editing older history does not overwrite the current answer');
    assert.equal(control.snapshot.historyAnswers[2].body,savedPrivate);
    assert.equal(control.snapshot.historyAnswers[2].day,sample.privateDay,'the original writing date is retained');
    assert.equal(confirmations.length,0,'successful saving needs no discard confirmation');

    checkpoint='dirty-back';
    await listDialog().locator('article').filter({hasText:sample.privateQuestion}).getByRole('button',{name:'답변 수정',exact:true}).click();
    dialog=editDialog();await dialog.waitFor();
    assert.equal(await dialog.getByLabel('내 이야기',{exact:true}).inputValue(),savedPrivate);
    assert.equal(await dialog.locator('#history-answer-count').textContent(),'219 / 220');
    await dialog.getByLabel('내 이야기',{exact:true}).fill(savedPrivate+'나');
    assert.equal(await dialog.locator('#history-answer-count').textContent(),'220 / 220');
    assert.equal(await dialog.getByRole('button',{name:'수정 저장하기',exact:true}).isEnabled(),true,'saved hearts remain editable at the logical limit');
    const draft='아직 저장하지 않은 개인적인 기억이에요.';
    await dialog.getByLabel('내 이야기',{exact:true}).fill(draft);
    const before=await page.evaluate(()=>({events:answerEditFixture.historyEvents,modal:history.state.pajangNavigation.modal}));
    await page.evaluate(()=>history.back());
    await page.waitForFunction(before=>answerEditFixture.historyEvents>=before.events+2&&history.state?.pajangNavigation?.modal===before.modal,before);
    assert.deepEqual(confirmations,[{type:'confirm',message:'수정한 내용을 저장하지 않고 닫을까요?'}],'one cancelled browser Back asks exactly once');
    assert.equal(await dialog.getByLabel('내 이야기',{exact:true}).inputValue(),draft,'cancelled Back preserves the draft');
    discard=true;
    await dialog.getByRole('button',{name:'닫기',exact:true}).click();
    await listDialog().waitFor();
    discard=false;
    assert.equal(confirmations.length,2,'explicit close asks once again');
    assert.equal(await page.evaluate(()=>answerEditFixture.calls.length),1,'discarding does not save');
    await listDialog().getByRole('button',{name:'닫기',exact:true}).click();
    await page.waitForFunction(()=>!history.state?.pajangNavigation?.modal);
    assert.equal(new URL(page.url()).searchParams.get('tab'),'profile','closing the list consumes only its overlay');

    checkpoint='own-feed';
    await currentNavigation().getByRole('link',{name:'오늘',exact:true}).click();
    await own.getByRole('button',{name:'답변 수정',exact:true}).click();
    dialog=editDialog();await dialog.waitFor();
    assert.equal(await dialog.locator('.questionbox').textContent(),sample.publicQuestion);
    assert.equal(await dialog.locator('time').getAttribute('datetime'),sample.publicDay);
    assert.match(await dialog.locator('.sub').first().textContent(),/오후/);
    assert.equal(await dialog.getByLabel('내 이야기',{exact:true}).inputValue(),sample.publicBody);
    const revisedPublic='노을이 비치던 금칙 강변을 함께 천천히 걷고 싶어요.';
    const savedPublic='노을이 비치던 ❤️❤️ 강변을 함께 천천히 걷고 싶어요.';
    await dialog.getByLabel('내 이야기',{exact:true}).fill(revisedPublic);
    await dialog.getByRole('button',{name:'수정 저장하기',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    await page.locator('#answers .answercard .quote').filter({hasText:savedPublic}).waitFor();
    assert.equal(await page.locator('#answers .answercard .quote').filter({hasText:revisedPublic}).count(),0);
    assert.equal(await page.getByRole('dialog').count(),0,'feed editing returns directly to the feed');
    assert.equal(await page.locator('#answers .answercard').filter({hasText:'나무가 많은 동네 길이 생각나요.'}).count(),1,'another member answer is retained');
    assert.equal(await page.evaluate(()=>answerEditFixture.snapshot().state.me.body),sample.currentBody);

    checkpoint='current-answer';
    await page.getByRole('button',{name:'내 답변 수정하기',exact:true}).click();
    const today=page.getByRole('dialog',{name:'오전 답변 수정',exact:true});
    await today.waitFor();
    assert.equal(await today.locator('.questionbox').textContent(),sample.currentQuestion);
    assert.equal(await today.getByLabel('내 이야기',{exact:true}).inputValue(),sample.currentBody);
    const revisedCurrent='따뜻한 차와 함께 오늘 있었던 일을 나누고 싶어요.';
    await today.getByLabel('내 이야기',{exact:true}).fill(revisedCurrent);
    await today.getByRole('button',{name:'수정 저장하기',exact:true}).click();
    await today.waitFor({state:'hidden'});
    const latest=await page.evaluate(()=>answerEditFixture.calls.at(-1));
    assert.equal(latest.action,'edit-answer','the current hero keeps its existing current-period API');
    assert.deepEqual(latest.data,{action:'edit-answer',body:revisedCurrent,day:sample.day,slot:sample.slot,
      questionId:19,previousBody:sample.currentBody});
    assert.equal(await page.evaluate(()=>answerEditFixture.snapshot().state.me.body),revisedCurrent);
    assert.deepEqual(await page.evaluate(()=>answerEditFixture.unexpected),[]);

    checkpoint='join-regression';
    await reset('?fixture=join&tab=profile');
    await page.getByRole('button',{name:'참여하기',exact:true}).click();
    await page.locator('.letter-hero h1').waitFor();
    await page.waitForFunction(()=>new URL(location.href).searchParams.get('tab')===null);
    assert.equal(await currentNavigation().getByRole('link',{name:'오늘',exact:true}).getAttribute('aria-current'),'page',
      'enterMember returns to Today even while its account request owns the busy lock');
    await page.getByRole('button',{name:'내 답변 수정하기',exact:true}).waitFor();
    assert.deepEqual(await page.evaluate(()=>answerEditFixture.unexpected),[]);
    assert.deepEqual(errors,[]);
    console.log('PASS: masked private history and own feed edits, canonical list/feed refresh and editable length limits, retained question/date/current answer, one dirty-Back confirmation, current edit API, member entry, 320/390/750 layouts and screenshots; mocked transport only.');
    await context.close();
  } catch(error) {
    if(page)await page.screenshot({path:path.join(artifacts,`answer-edit-failure-${checkpoint}.png`),fullPage:true}).catch(()=>{});
    throw error;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
