const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),feature=path.join(root,'features/pajang');
const origin='https://pajang-answer-interactions.test',address=origin+'/features/pajang/station.html';
const artifacts=path.join(root,'tests/artifacts/pajang-discovery');

// The real application, modal history and styles run against an in-memory API.
// Fixture-only localStorage represents server persistence across browser reloads.
function installFixture(){
  const owner='11111111-1111-4111-8111-111111111111',peer='22222222-2222-4222-8222-222222222222';
  const current={day:'2026-11-21',slot:'am',question:'새로운 모임에 가면 먼저 말을 거는 편인가요?'};
  const old={day:'2026-11-19',slot:'pm',question:'의견이 다를 때 상대방과 어떻게 이야기하나요?'};
  const empty={day:'2026-11-20',slot:'pm',question:'아무 약속이 없는 휴일에는 무엇을 하며 보내나요?'};
  const offpage={day:'2026-11-18',slot:'pm',question:'친구에게 서운한 일이 생기면 어떻게 하나요?'};
  const me={id:owner,name:'보리',region:'서울특별시',interest:'book',body:'먼저 인사하고 천천히 이야기를 시작해요.'};
  const station={...current,question:{id:19,q:[current.question],answers:[]},nextAt:new Date(Date.now()+3600000).toISOString(),
    authenticated:true,remaining:3,signals:[],messages:[],people:[],me,locationEnabled:false,locationVersion:0,radarOn:false};
  const my=[{...current,body:me.body},{...old,body:'먼저 상대의 이유를 듣고 제 생각을 말해요.'},{...offpage,body:'마음이 가라앉은 뒤 솔직하게 이야기해요.'}];
  const feed=[{...old,peer:owner,name:me.name,region:me.region,interest:me.interest,body:my[1].body,own:true,sent:false,received:false,at:1},
    {...old,peer,name:'은하',region:'서울특별시',interest:'walk',body:'다른 생각을 들으면 궁금한 점부터 물어봐요.',own:false,sent:false,received:false,at:2},
    {...offpage,peer,name:'은하',region:'서울특별시',interest:'walk',body:'대화를 조금 쉬었다가 다시 시작해요.',own:false,sent:false,received:false,at:3}];
  let likes=JSON.parse(localStorage.getItem('fixture-likes')||'{}');
  const key=row=>(row.peer||owner)+'/'+row.day+'/'+row.slot;
  const liked=row=>({...row,liked:likes[key(row)]===true,likeCount:(row.peer===peer?3:1)+(likes[key(row)]?1:0)});
  const listeners=new Set();let session={user:{id:'auth-owner',is_anonymous:false},access_token:'owner-token'};
  const control=window.answerInteractionsFixture={calls:[],unexpected:[],feedReads:0,historyReads:0,listReads:0,historyEvents:0,failPastOnce:false,
    changeUser(id){session={user:{id,is_anonymous:false},access_token:'changed-token'};for(const listener of listeners)listener('SIGNED_IN',session);},
    snapshot:()=>structuredClone({station,my,feed,likes}),empty,old,offpage,owner,peer};
  window.addEventListener('popstate',()=>control.historyEvents++,true);
  const ok=data=>({data:structuredClone(data),error:null});
  function query(run){let promise,signal;const headers={};const q={
    setHeader(name,value){headers[name]=value;return q;},abortSignal(value){signal=value;return q;},
    then(resolve,reject){promise??=Promise.resolve().then(()=>run(signal,headers));return promise.then(resolve,reject);}};return q;}
  const db={auth:{getSession:async()=>({data:{session},error:null}),getUser:async()=>({data:{user:session?.user},error:null}),
    onAuthStateChange(listener){listeners.add(listener);return {data:{subscription:{unsubscribe(){listeners.delete(listener);}}}};}},
    rpc(name,args){return query((_signal,headers)=>{
      if(name==='is_admin')return ok(false);
      if(name==='pajang_profile_preferences')return ok({person:args.p_peer||owner,version:0,preferences:{relationship_intents:[],meeting_styles:[],relationship_values:[],affection_styles:[],life_priorities:[],custom:{meeting_styles:[],relationship_values:[],affection_styles:[],life_priorities:[]}}});
      if(name==='pajang_discovery_feed'){control.feedReads++;return ok({items:feed.map(liked),total:feed.length,nextCursor:null,remaining:3});}
      if(name==='pajang_my_answers'){control.historyReads++;return ok(my.map(answer=>liked({...answer,peer:owner})));}
      if(name==='pajang_past_questions'){
        control.listReads++;return ok({items:[empty,old,offpage].map(question=>{
          const answer=my.find(answer=>answer.day===question.day&&answer.slot===question.slot);
          return {...question,answered:!!answer,body:answer?.body??null,canEdit:!!answer};
        }),nextCursor:null});
      }
      if(name==='pajang_answer_like'){
        control.calls.push({name,args:structuredClone(args),headers:{...headers}});
        if(args.p_expected_person!==owner||session.user.id!=='auth-owner')return {error:{code:'42501',message:'account changed'}};
        const answer=feed.find(row=>row.peer===args.p_peer&&row.day===args.p_day&&row.slot===args.p_slot);
        likes[key(answer)]=args.p_liked;localStorage.setItem('fixture-likes',JSON.stringify(likes));
        return ok({peer:args.p_peer,day:args.p_day,slot:args.p_slot,...liked(answer)});
      }
      if(name==='pajang_answer_past_question'){
        control.calls.push({name,args:structuredClone(args),headers:{...headers}});
        if(control.failPastOnce){control.failPastOnce=false;return {error:{message:'offline'}};}
        if(args.p_expected_person!==owner||session.user.id!=='auth-owner')return {error:{code:'42501',message:'account changed'}};
        if(my.some(row=>row.day===args.p_day&&row.slot===args.p_slot))return {error:{code:'PT409',message:'already answered'}};
        const answer={day:args.p_day,slot:args.p_slot,question:args.p_question,body:args.p_body.replaceAll('금칙','❤️❤️')};
        my.unshift(answer);feed.unshift({...answer,peer:owner,name:me.name,region:me.region,interest:me.interest,own:true,sent:false,received:false,at:Date.now()});
        return ok({...answer,saved:true,alreadyAnswered:false});
      }
      if(name==='pajang_member'){
        if(args.p_action==='state')return ok(station);
        if(args.p_action==='edit-history-answer'){
          control.calls.push({name,args:structuredClone(args),headers:{...headers}});
          const body=args.p_data,answer=my.find(row=>row.day===body.day&&row.slot===body.slot);
          if(answer.body!==body.previousBody)return {error:{code:'PT412'}};
          answer.body=body.body;
          for(const row of feed)if(row.peer===owner&&row.day===body.day&&row.slot===body.slot)row.body=body.body;
          return ok(station);
        }
      }
      control.unexpected.push({name,args});throw Error('Unexpected RPC '+name);
    });}
  };
  window.OjjudaGetClient=async()=>db;window.OjjudaLocation={acceptPreference(){},subscribe(){return ()=>{};}};
  window.pajangArt={};window.pajangLoadArt=async()=>undefined;window.pajangState=structuredClone(station);
}

async function fits(page,dialog,width){
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'page fits '+width);
  const box=await dialog.boundingBox();assert.ok(box&&box.x>=-1&&box.x+box.width<=width+1,'dialog fits '+width);
  assert.equal(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth+1),true,'no horizontal dialog scroll');
}

(async()=>{
  const bundle=await fs.readFile(process.env.PAJANG_TEST_BUNDLE||path.join(feature,'assets/station.js'));
  const template=(await fs.readFile(path.join(feature,'station.html'),'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace('<main id="gate"','<main hidden id="gate"').replace('id="station" hidden','id="station"')
    .replace('</body>','<script src="/fixture.js"></script><script src="/program.js"></script></body>');
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  let page,checkpoint='setup';const errors=[];
  try{
    await fs.mkdir(artifacts,{recursive:true});
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR'});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
      if(url.pathname==='/features/pajang/station.html')return route.fulfill({contentType:'text/html',body:template});
      if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:`(${installFixture.toString()})();`});
      if(url.pathname==='/program.js')return route.fulfill({contentType:'text/javascript',body:bundle});
      if(!/\.(?:css|svg|woff2?|webp|png)$/.test(url.pathname))return route.abort();
      const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))return route.abort();
      try{return await route.fulfill({path:file});}catch{return route.fulfill({status:404,body:''});}
    });
    page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
    let discard=false,confirmations=0;
    page.on('dialog',async dialog=>{confirmations++;await (discard?dialog.accept():dialog.dismiss());});
    await page.goto(address);await page.locator('#answers .answercard').nth(1).waitFor();
    const navigation=()=>page.getByRole('navigation',{name:'파장 메뉴'});
    const pastList=()=>page.getByRole('dialog',{name:'지난 질문',exact:true});
    const pastForm=()=>page.getByRole('dialog',{name:'지난 질문에 답변하기',exact:true});
    const editForm=()=>page.getByRole('dialog',{name:'답변 수정',exact:true});
    const emptyQuestion='아무 약속이 없는 휴일에는 무엇을 하며 보내나요?';
    const own=()=>page.locator('#answers .answercard').filter({hasText:'먼저 상대의 이유를 듣고 제 생각을 말해요.'});

    checkpoint='like-keyboard-and-reload';
    await own().locator('.answer-like').focus();await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('#answers .answer-like')?.getAttribute('aria-pressed')==='true');
    assert.equal(await own().locator('.answer-like').textContent(),'2','the compact control shows its heart and count');
    assert.equal(await own().locator('.answer-like b').textContent(),'2');
    assert.equal(await own().locator('.answer-like').getAttribute('aria-label'),'좋아요 2개, 취소하기');
    assert.equal(await own().getByRole('button',{name:'답변 수정',exact:true}).count(),1,'editing stays independent');
    assert.equal(await page.locator('#answers .answercard').nth(1).getByRole('button',{name:'신호 보내기',exact:true}).count(),1,'signals stay independent');
    await page.reload();await own().waitFor();assert.equal(await own().locator('.answer-like').getAttribute('aria-pressed'),'true');
    await page.screenshot({path:path.join(artifacts,'answer-interactions-390.png'),animations:'disabled'});

    checkpoint='own-answer-sync';
    await navigation().getByRole('link',{name:'내 파장',exact:true}).click();await page.getByRole('button',{name:'내가 남긴 답변',exact:true}).click();
    const mine=page.getByRole('dialog',{name:'내가 남긴 답변',exact:true});
    const myOld=mine.locator('article').filter({hasText:'먼저 상대의 이유를 듣고 제 생각을 말해요.'});
    await myOld.waitFor();assert.equal(await myOld.locator('.answer-like').getAttribute('aria-pressed'),'true');
    await myOld.locator('.answer-like').click();await page.waitForFunction(()=>[...document.querySelectorAll('.own-history article')].some(article=>
      article.textContent.includes('먼저 상대의 이유를 듣고 제 생각을 말해요.')&&article.querySelector('.answer-like')?.getAttribute('aria-pressed')==='false'));
    await mine.getByRole('button',{name:'닫기',exact:true}).click();await mine.waitFor({state:'hidden'});
    await navigation().getByRole('link',{name:'오늘',exact:true}).click();assert.equal(await own().locator('.answer-like').getAttribute('aria-pressed'),'false');

    checkpoint='past-empty-question';
    await page.getByRole('button',{name:'지난 질문',exact:true}).click();await pastList().locator('li').nth(2).waitFor();
    const unanswered=pastList().locator('li').filter({hasText:emptyQuestion});assert.equal(await unanswered.getByRole('button',{name:'답변하기',exact:true}).count(),1);
    await page.screenshot({path:path.join(artifacts,'past-questions-390.png'),animations:'disabled'});
    await unanswered.getByRole('button',{name:'답변하기',exact:true}).click();await pastForm().waitFor();
    const editor=pastForm().getByLabel('내 이야기',{exact:true});await editor.waitFor();
    await page.waitForFunction(()=>document.activeElement?.id==='past-answer-body');
    assert.equal(await pastForm().locator('.questionbox').textContent(),emptyQuestion);
    assert.equal(await pastForm().locator('#past-answer-publication').textContent(),'질문과 답변은 질문이 올라온 날부터 최대 365일간 파장 회원에게 보여요.');
    for(const width of [320,390,750]){
      await page.setViewportSize({width,height:width===750?750:844});await fits(page,pastForm(),width);
      await page.screenshot({path:path.join(artifacts,`past-answer-${width}.png`),animations:'disabled'});
    }
    await page.setViewportSize({width:320,height:420});await fits(page,pastForm(),320);
    await editor.fill('산책하고 혼자 책을 읽으며 쉬어요.');
    await pastForm().getByRole('button',{name:'답변하기',exact:true}).scrollIntoViewIfNeeded();
    const saveBox=await pastForm().getByRole('button',{name:'답변하기',exact:true}).boundingBox();
    assert.ok(saveBox&&saveBox.y>=0&&saveBox.y+saveBox.height<=420,'save remains reachable above a keyboard-sized viewport');
    await page.screenshot({path:path.join(artifacts,'past-answer-keyboard-320.png'),animations:'disabled'});

    checkpoint='draft-back-and-retry';
    const beforeBack=await page.evaluate(()=>({events:answerInteractionsFixture.historyEvents,modal:history.state.pajangNavigation.modal}));
    await page.evaluate(()=>history.back());
    await page.waitForFunction(before=>answerInteractionsFixture.historyEvents>=before.events+2&&history.state?.pajangNavigation?.modal===before.modal,beforeBack);
    await pastForm().waitFor();assert.equal(await editor.inputValue(),'산책하고 혼자 책을 읽으며 쉬어요.');
    assert.equal(confirmations,1,'back navigation protects a draft');
    await page.evaluate(()=>answerInteractionsFixture.failPastOnce=true);
    await pastForm().getByRole('button',{name:'답변하기',exact:true}).click();await pastForm().getByRole('alert').waitFor();
    assert.equal(await editor.inputValue(),'산책하고 혼자 책을 읽으며 쉬어요.');
    await pastForm().getByRole('button',{name:'답변하기',exact:true}).click();await pastList().waitFor();
    await pastList().locator('li').filter({hasText:emptyQuestion}).getByRole('button',{name:'답변 수정',exact:true}).waitFor();
    const result=await page.evaluate(()=>({calls:answerInteractionsFixture.calls,reads:answerInteractionsFixture.listReads,snapshot:answerInteractionsFixture.snapshot()}));
    const writes=result.calls.filter(call=>call.name==='pajang_answer_past_question');assert.equal(writes.length,2);
    assert.equal(writes[1].args.p_expected_person,result.snapshot.station.me.id);assert.equal(writes[1].headers.Authorization,'Bearer owner-token');
    assert.equal(result.snapshot.my.filter(row=>row.question===emptyQuestion).length,1);assert.ok(result.reads>=2);
    assert.equal(confirmations,1,'saving never asks to discard the saved draft');

    checkpoint='reopen-existing-answer';
    await pastList().locator('li').filter({hasText:emptyQuestion}).getByRole('button',{name:'답변 수정',exact:true}).click();await editForm().waitFor();
    assert.equal(await editForm().getByLabel('내 이야기',{exact:true}).inputValue(),'산책하고 혼자 책을 읽으며 쉬어요.');
    await editForm().getByRole('button',{name:'닫기',exact:true}).click();await pastList().waitFor();
    await pastList().getByRole('button',{name:'닫기',exact:true}).click();await pastList().waitFor({state:'hidden'});
    await page.setViewportSize({width:390,height:844});
    if(await page.locator('#selected-question').textContent()!==emptyQuestion)await page.getByRole('button',{name:'이전 질문',exact:true}).click();
    await page.locator('#answers').getByText('산책하고 혼자 책을 읽으며 쉬어요.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'지난 질문',exact:true}).click();await pastList().locator('li').filter({hasText:emptyQuestion}).getByRole('button',{name:'답변 수정',exact:true}).waitFor();
    await pastList().getByRole('button',{name:'닫기',exact:true}).click();await pastList().waitFor({state:'hidden'});

    checkpoint='off-page-existing-answer';
    for(let i=0;i<2;i++)await page.getByRole('button',{name:'다음 질문',exact:true}).click();
    await page.locator('.answer-group .question-answer-link').getByText('답변하기',{exact:true}).click();await editForm().waitFor();
    assert.equal(await editForm().getByLabel('내 이야기',{exact:true}).inputValue(),'마음이 가라앉은 뒤 솔직하게 이야기해요.');
    assert.equal(await page.evaluate(()=>answerInteractionsFixture.calls.filter(call=>call.name==='pajang_answer_past_question').length),2,'existing answer never starts another write');
    assert.deepEqual(await page.evaluate(()=>answerInteractionsFixture.unexpected),[]);assert.deepEqual(errors,[]);
    console.log('PASS answer likes, server persistence, past-question write/edit/back/retry, mobile widths and keyboard viewport');
  }catch(error){
    console.error('Browser checkpoint:',checkpoint);if(page)await page.screenshot({path:path.join(artifacts,'answer-interactions-failure.png'),fullPage:true}).catch(()=>{});throw error;
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
