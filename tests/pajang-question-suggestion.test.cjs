const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const feature = path.join(root, 'features/pajang');
const origin = 'https://pajang-question.test';
const address = origin + '/features/pajang/station.html';
const artifacts = path.join(root,'tests/artifacts/pajang-discovery');
const prefix = '[파장 · 오늘의 질문 제안]\n';
const question = '서로에게 소개하고 싶은 작은 행복은 무엇인가요?';

function fixture() {
  const state = {
    day:'2026-11-19', slot:'am', nextAt:new Date(Date.now() + 3600000).toISOString(),
    authenticated:true, remaining:3, signals:[], messages:[], people:[],
    question:{id:12, q:['설레는 사람과 김밥을 싼다면 어떤 재료를 서로 바꿔 넣어 보고 싶나요?'], answers:[]},
    me:{id:'pajang-member', name:'보리', region:'서울특별시', interest:'book', body:'함께 나눌 이야기가 좋아요.'},
    locationEnabled:false, locationVersion:0, radarOn:false
  };
  return `
    const state = ${JSON.stringify(state)};
    const listeners = new Set();
    let session = {user:{id:'auth-member',is_anonymous:false},access_token:'mock-member-token'};
    const control = window.questionFixture = {attempts:[],feedbackWrites:[],responses:[],pending:null,unexpected:[]};
    control.changeUser = id => {
      session = id ? {user:{id,is_anonymous:false},access_token:'mock-next-token'} : null;
      for (const listener of listeners) listener(id ? 'SIGNED_IN' : 'SIGNED_OUT',session);
    };
    const answer = (mode,args) => mode === 'error'
      ? {data:null,error:{code:'XX000',message:'Mock connection failure'}}
      : mode === 'unconfirmed' ? {data:null,error:null} : {data:args.p_request_id,error:null};
    control.finish = (mode='success') => {const resolve=control.pending;control.pending=null;resolve(mode);};
    const db = {
      auth:{
        getSession:async()=>({data:{session},error:null}),
        getUser:async()=>({data:{user:session?.user??null},error:null}),
        onAuthStateChange:listener=>{listeners.add(listener);return {data:{subscription:{unsubscribe(){listeners.delete(listener);}}}};}
      },
      from:table=>({insert:row=>{control.feedbackWrites.push({table,row});throw Error('Unexpected table write');}}),
      schema:name=>({rpc:(operation,args)=>{
        const headers={};let request;
        const query={
          setHeader(key,value){headers[key]=value;return query;},
          then(resolve,reject){
            if(!request)request=Promise.resolve().then(async()=>{
              if(name!=='ojjuda_note'||operation!=='submit_inquiry')throw Error('Unexpected inquiry RPC');
              control.attempts.push({schema:name,operation,args:structuredClone(args),headers:{...headers}});
              let mode=control.responses.shift()||'success';
              if(mode==='pending')mode=await new Promise(done=>{control.pending=done;});
              return answer(mode,args);
            });
            return request.then(resolve,reject);
          }
        };
        return query;
      }}),
      rpc:async(name,args)=>{
        if(name==='pajang_member'&&args.p_action==='state')return {data:structuredClone(state),error:null};
        if(name==='pajang_discovery_feed')return {data:{items:[],total:0,nextCursor:null,remaining:3},error:null};
        if(name==='is_admin')return {data:false,error:null};
        control.unexpected.push(name);throw Error('Unexpected RPC '+name);
      }
    };
    window.OjjudaGetClient=async()=>db;
    window.OjjudaLocation={acceptPreference(){},subscribe(){return ()=>{};}};
    window.pajangArt={};window.pajangLoadArt=async()=>undefined;
    window.pajangState=state;
  `;
}

async function waitForAttempts(page,count) {
  await page.waitForFunction(count=>window.questionFixture.attempts.length===count,count);
}

async function openForm(page) {
  await page.getByRole('button',{name:'이 질문 어때요?',exact:true}).click();
  const dialog = page.getByRole('dialog',{name:'이 질문 어때요?',exact:true});
  await dialog.waitFor();
  const input = dialog.getByRole('textbox',{name:'추천할 질문'});
  await page.waitForFunction(()=>document.activeElement?.id==='question-suggestion-body');
  assert.equal(await input.getAttribute('maxlength'),'200','question length is bounded');
  return {dialog,input,send:dialog.getByRole('button',{name:'질문 보내기',exact:true})};
}

async function assertNoOverflow(page,label) {
  const result = await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));
  assert.ok(result.width<=result.viewport+1,label+': '+JSON.stringify(result));
}

async function pressBack(page) {
  await page.evaluate(()=>new Promise(resolve=>{
    window.addEventListener('popstate',()=>requestAnimationFrame(()=>resolve()),{once:true});
    history.back();
  }));
}

(async()=>{
  const bundle = await fs.readFile(process.env.PAJANG_TEST_BUNDLE||path.join(feature,'assets/station.js'));
  const template = (await fs.readFile(path.join(feature,'station.html'),'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace('<main id="gate"','<main hidden id="gate"')
    .replace('id="station" hidden','id="station"')
    .replace('</body>','<script src="/fixture.js"></script><script src="/program.js"></script></body>');
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {});
  const errors=[];
  try {
    await fs.mkdir(artifacts,{recursive:true});
    const context = await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR'});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      // All reads and writes stay in this fixture. No request reaches production.
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/features/pajang/station.html')return route.fulfill({contentType:'text/html',body:template});
      if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:fixture()});
      if(url.pathname==='/program.js')return route.fulfill({contentType:'text/javascript',body:bundle});
      if(!/\.(?:css|svg|woff2?)$/.test(url.pathname))return route.abort();
      const file=path.resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+path.sep))return route.abort();
      try{
        return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.svg')?'image/svg+xml':'font/woff2',body:await fs.readFile(file)});
      }catch{return route.fulfill({status:404,body:''});}
    });
    const page=await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.message));
    const reset=async()=>{
      await page.goto(address);
      await page.getByRole('button',{name:'이 질문 어때요?',exact:true}).waitFor();
      await page.waitForFunction(()=>!document.querySelector('.question-suggest')?.disabled);
    };
    await reset();
    for(const width of [320,390,750,1280]){
      await page.setViewportSize({width,height:844});
      await assertNoOverflow(page,'today at '+width+'px');
      const cta=page.getByRole('button',{name:'이 질문 어때요?',exact:true});
      const ctaBox=await cta.boundingBox();
      assert.ok(ctaBox&&ctaBox.height>=44,'question suggestion keeps a usable touch area at '+width+'px');
      const near=page.locator('.today-actions .mobile-near');
      if(await near.isVisible()){
        const nearBox=await near.boundingBox();
        assert.ok(ctaBox.x+ctaBox.width<=nearBox.x+1,'suggestion is left of Nearby at '+width+'px');
        assert.ok(Math.abs(ctaBox.y-nearBox.y)<2,'both actions share a row at '+width+'px');
      }
      if(width===390)await page.screenshot({path:path.join(artifacts,'question-suggestion-today.png'),fullPage:true});
      const {dialog}=await openForm(page);
      await assertNoOverflow(page,'question dialog at '+width+'px');
      const box=await dialog.boundingBox();
      assert.ok(box&&box.x>=-1&&box.x+box.width<=width+1,'dialog stays inside viewport at '+width+'px');
      if(width===390)await page.screenshot({path:path.join(artifacts,'question-suggestion-form.png'),fullPage:true});
      await dialog.getByRole('button',{name:'닫기',exact:true}).click();
      await dialog.waitFor({state:'hidden'});
      await page.waitForFunction(()=>!history.state?.pajangQuestionSuggestion);
    }

    await page.setViewportSize({width:390,height:844});
    let form=await openForm(page);
    await form.input.fill('   \n  ');
    assert.equal(await form.send.isDisabled(),true,'whitespace cannot be sent');
    await form.input.fill('  '+question+'  ');
    await form.send.click();
    await form.dialog.waitFor({state:'hidden'});
    await page.getByRole('status').filter({hasText:'질문을 보냈어요.'}).waitFor();
    let attempts=await page.evaluate(()=>window.questionFixture.attempts);
    assert.equal(attempts.length,1);
    assert.equal(attempts[0].schema,'ojjuda_note');
    assert.equal(attempts[0].operation,'submit_inquiry');
    assert.equal(attempts[0].args.p_body,prefix+question,'a trimmed question is visibly identified for administrators');
    assert.match(attempts[0].args.p_request_id,/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i);
    assert.equal(attempts[0].headers.Authorization,'Bearer mock-member-token','write stays bound to the authorizing account');
    assert.deepEqual(await page.evaluate(()=>window.questionFixture.feedbackWrites),[],'question does not enter automated feedback processing');

    await reset();
    await page.evaluate(()=>window.questionFixture.responses.push('error','success'));
    form=await openForm(page);
    await form.input.fill(question);
    await form.send.click();
    await form.dialog.getByRole('alert').waitFor();
    assert.equal(await form.input.inputValue(),question,'failed submission preserves the draft');
    await form.send.click();
    await form.dialog.waitFor({state:'hidden'});
    attempts=await page.evaluate(()=>window.questionFixture.attempts);
    assert.equal(attempts.length,2);
    assert.equal(attempts[0].args.p_request_id,attempts[1].args.p_request_id,'retry uses the same idempotency key');

    await reset();
    await page.evaluate(()=>window.questionFixture.responses.push('pending'));
    form=await openForm(page);
    await form.input.fill(question);
    await form.dialog.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
    await waitForAttempts(page,1);
    assert.equal(await form.input.isDisabled(),true,'pending text is locked');
    assert.equal(await form.dialog.getByRole('button',{name:'닫기',exact:true}).isDisabled(),true,'pending close is locked');
    await pressBack(page);
    await page.waitForFunction(()=>Boolean(history.state?.pajangQuestionSuggestion));
    assert.equal(await form.dialog.isVisible(),true,'Back retains an in-flight submission');
    assert.equal(page.url(),address);
    assert.equal(await page.evaluate(()=>window.questionFixture.attempts.length),1,'rapid duplicate submissions send once');
    await page.evaluate(()=>window.questionFixture.finish());
    await form.dialog.waitFor({state:'hidden'});
    await page.waitForFunction(()=>!history.state?.pajangQuestionSuggestion);
    assert.equal(page.url(),address,'successful pending submission returns to the same page');

    await reset();
    form=await openForm(page);
    await form.input.fill(question);
    await pressBack(page);
    await form.dialog.waitFor({state:'hidden'});
    assert.equal(page.url(),address,'ordinary Back closes only the question form');
    assert.equal(await page.evaluate(()=>window.questionFixture.attempts.length),0);
    await page.evaluate(()=>history.forward());
    await form.dialog.waitFor();
    assert.equal(await form.input.inputValue(),'','Forward restores a fresh suggestion form');
    await pressBack(page);
    await form.dialog.waitFor({state:'hidden'});

    await reset();
    form=await openForm(page);
    await form.input.fill(question);
    await page.evaluate(()=>window.questionFixture.changeUser('another-member'));
    await form.dialog.getByRole('alert').waitFor();
    assert.equal(await form.input.inputValue(),'','account changes erase the previous member draft');
    assert.equal(await form.input.isDisabled(),true);
    assert.equal(await form.send.isDisabled(),true);
    await form.dialog.locator('form').evaluate(form=>form.requestSubmit());
    assert.equal(await page.evaluate(()=>window.questionFixture.attempts.length),0,'account changes cannot send another member draft');

    await reset();
    await page.evaluate(()=>window.questionFixture.responses.push('pending'));
    form=await openForm(page);
    await form.input.fill(question);
    await form.send.click();
    await waitForAttempts(page,1);
    await page.evaluate(()=>{window.questionFixture.changeUser(null);window.questionFixture.finish();});
    await form.dialog.getByRole('alert').waitFor();
    assert.equal(await form.dialog.isVisible(),true,'stale success does not close the new account error');
    assert.equal(await form.input.inputValue(),'');
    assert.equal(await form.send.isDisabled(),true);
    assert.equal(await page.getByRole('status').filter({hasText:'질문을 보냈어요.'}).count(),0,'no success claim after auth invalidation');
    assert.deepEqual(await page.evaluate(()=>window.questionFixture.unexpected),[]);
    assert.deepEqual(errors,[],'no browser exceptions');
    console.log('Pajang question suggestion: responsive layout, focus, validation, inquiry routing, retries, duplicate prevention, Back and account isolation passed.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
