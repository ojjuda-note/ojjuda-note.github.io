const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const feature = path.join(root, 'features/pajang');
const origin = 'https://pajang-preferences.test';
const address = origin + '/features/pajang/station.html';
const artifacts = path.join(root, 'tests/artifacts/pajang-discovery/profile-preferences');
const intentOptions = [
  ['conversation', '대화', '대화 상대'], ['casual', '편한 만남', '편한 만남'],
  ['friendship', '친구', '친구'], ['dating', '연애', '연애 상대'], ['marriage', '결혼', '결혼 상대']
];
const groupLabels = ['만남 스타일', '관계에서 중요한 것', '마음을 표현하는 방식', '생활에서 중요한 것'];

function emptyPreferences() {
  return {
    relationship_intents:[], meeting_styles:[], relationship_values:[], affection_styles:[], life_priorities:[],
    custom:{meeting_styles:[], relationship_values:[], affection_styles:[], life_priorities:[]}
  };
}

function fixture() {
  const state = {
    day:'2026-11-19', slot:'am', nextAt:new Date(Date.now() + 3600000).toISOString(),
    authenticated:true, remaining:3, signals:[], messages:[], people:[],
    question:{id:12, q:['서로에게 소개하고 싶은 작은 행복은 무엇인가요?'], answers:[]},
    me:{id:'11111111-1111-4111-8111-111111111111', name:'보리', region:'서울특별시', interest:'book', body:'함께 나눌 이야기가 좋아요.'},
    locationEnabled:false, locationVersion:0, radarOn:false
  };
  const base = {
    region:'서울특별시', day:'2026-11-19', slot:'am', at:1,
    sent:false, received:false, own:false, question:state.question.q[0]
  };
  const rows = [
    {...base, peer:'22222222-2222-4222-8222-222222222222', name:'은하', interest:'book', body:'서로 책을 골라 주고 싶어요.', relationship_intents:['conversation','friendship']},
    {...base, peer:'33333333-3333-4333-8333-333333333333', name:'단비', interest:'walk', body:'먼저 함께 산책하며 알아가요.', relationship_intents:['casual','dating']},
    {...base, peer:'44444444-4444-4444-8444-444444444444', name:'다솜', interest:'coffee', body:'함께할 미래를 이야기해요.', relationship_intents:['marriage']},
    {...base, peer:'55555555-5555-4555-8555-555555555555', name:'솔', interest:'vinyl', body:'오늘은 음악 이야기가 하고 싶어요.', relationship_intents:[]}
  ];
  return `
    const state = ${JSON.stringify(state)};
    const rows = ${JSON.stringify(rows)};
    const emptyPreferences = ${emptyPreferences.toString()};
    const records = new Map();
    records.set(state.me.id,{person:state.me.id,preferences:emptyPreferences(),version:0});
    for (const row of rows) records.set(row.peer,{
      person:row.peer,version:1,
      preferences:{...emptyPreferences(),relationship_intents:[...row.relationship_intents],custom:{...emptyPreferences().custom,meeting_styles:['별 보며 걷기']}}
    });
    const listeners = new Set();
    let session = {user:{id:'auth-member',is_anonymous:false},access_token:'mock-member-token'};
    const control = window.preferenceFixture = {
      reads:[],saves:[],feeds:[],unexpected:[],readResponses:[],saveResponses:[],pendingReads:[],pendingSaves:[],
      emptyFilter:'',pagination:false,deniedFeed:false,historyEvents:0
    };
    window.addEventListener('popstate',()=>control.historyEvents++,true);
    control.changeUser = id => {
      session = id ? {user:{id,is_anonymous:false},access_token:'mock-next-token'} : null;
      for (const listener of listeners) listener(id ? 'SIGNED_IN' : 'SIGNED_OUT',session);
    };
    control.record = () => structuredClone(records.get(state.me.id));
    control.finishRead = () => control.pendingReads.shift()?.();
    control.finishSave = () => control.pendingSaves.shift()?.();
    const error = (code,message) => ({data:null,error:{code,message}});
    function query(run) {
      let promise,signal;
      const q = {
        abortSignal(value){signal=value;return q;},
        setHeader(){return q;},
        then(resolve,reject){
          promise ||= Promise.resolve().then(()=>run(signal));
          return promise.then(resolve,reject);
        }
      };
      return q;
    }
    const db = {
      auth:{
        getSession:async()=>({data:{session},error:null}),
        getUser:async()=>({data:{user:session?.user??null},error:null}),
        onAuthStateChange:listener=>{listeners.add(listener);return {data:{subscription:{unsubscribe(){listeners.delete(listener);}}}};}
      },
      rpc:(name,args)=>query(async signal=>{
        if(name==='pajang_member' && args.p_action==='state')return {data:structuredClone(state),error:null};
        if(name==='is_admin')return {data:false,error:null};
        if(name==='pajang_profile_preferences'){
          const peer=args.p_peer || state.me.id;
          control.reads.push({peer,account:session?.user?.id??null});
          const mode=control.readResponses.shift() || 'success';
          const snapshot=structuredClone(records.get(peer));
          if(mode==='pending')await new Promise(resolve=>{
            control.pendingReads.push(resolve);
            signal?.addEventListener('abort',resolve,{once:true});
          });
          if(mode==='error')return error('XX000','프로필을 불러오지 못했어요.');
          if(mode==='denied'||!snapshot)return error('42501','프로필을 볼 수 없어요.');
          return {data:snapshot,error:null};
        }
        if(name==='pajang_profile_save'){
          control.saves.push(structuredClone(args));
          const mode=control.saveResponses.shift() || 'success';
          if(mode==='pending')await new Promise(resolve=>{
            control.pendingSaves.push(resolve);
            signal?.addEventListener('abort',resolve,{once:true});
          });
          if(mode==='error')return error('XX000','프로필을 저장하지 못했어요. 다시 시도해 주세요.');
          const current=records.get(state.me.id), data=args.p_data;
          if(mode==='conflict'||data.preferencesVersion!==current.version)return error('PT412','다른 화면에서 프로필을 변경했어요. 다시 열어 주세요.');
          const record={person:state.me.id,preferences:structuredClone(data.preferences),version:current.version+1};
          records.set(state.me.id,record);
          Object.assign(state.me,{name:data.name||state.me.name,region:data.region,interest:data.interest,
            preferences:record.preferences,preferencesVersion:record.version});
          return {data:structuredClone(state),error:null};
        }
        if(name==='pajang_discovery_feed'){
          control.feeds.push(structuredClone(args));
          if(control.deniedFeed)return error('42501','회원 정보를 확인해 주세요.');
          let source=rows;
          if(control.pagination)source=Array.from({length:26},(_,i)=>({...rows[0],peer:'page-'+i,name:'대화 친구 '+(i+1),at:i}));
          const filtered=source.filter(row=>args.p_interest==='all'||row.relationship_intents.includes(args.p_interest));
          const selected=control.emptyFilter===args.p_interest?[]:filtered;
          const offset=args.p_cursor?.offset??0;
          const items=selected.slice(offset,offset+24);
          return {data:{items,total:selected.length,remaining:3,
            nextCursor:offset+24<selected.length?{offset:offset+24,interest:args.p_interest}:null},error:null};
        }
        control.unexpected.push(name);throw Error('Unexpected RPC '+name);
      })
    };
    window.OjjudaGetClient=async()=>db;
    window.OjjudaLocation={acceptPreference(){},subscribe(){return ()=>{};}};
    window.pajangArt={};window.pajangLoadArt=async()=>undefined;
    window.pajangState=state;
  `;
}

async function assertNoOverflow(page,label) {
  const bounds=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));
  assert.ok(bounds.width<=bounds.viewport+1,label+': '+JSON.stringify(bounds));
}

async function openProfile(page,{ready=true}={}) {
  await page.getByRole('navigation',{name:'파장 메뉴'}).getByRole('link',{name:'내 파장',exact:true}).click();
  await page.getByRole('button',{name:'공개 소개 수정',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'프로필 수정',exact:true});
  await dialog.waitFor();
  const save=dialog.getByRole('button',{name:'프로필 저장',exact:true});
  if(ready){
    await save.waitFor();
    await page.waitForFunction(button=>!button.disabled,await save.elementHandle());
  }
  return {dialog,save};
}

async function closeProfile(page,dialog) {
  await dialog.getByRole('button',{name:'닫기',exact:true}).click();
  await dialog.waitFor({state:'hidden'});
  await page.waitForFunction(()=>!history.state?.pajangNavigation?.modal);
}

async function openGroup(dialog,label) {
  const group=dialog.locator('details').filter({hasText:label});
  const summary=group.locator('summary');
  if(!await group.evaluate(node=>node.open))await summary.click();
  return group;
}

(async()=>{
  const bundle=await fs.readFile(process.env.PAJANG_TEST_BUNDLE||path.join(feature,'assets/station.js'));
  const template=(await fs.readFile(path.join(feature,'station.html'),'utf8'))
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'')
    .replace('<main id="gate"','<main hidden id="gate"')
    .replace('id="station" hidden','id="station"')
    .replace('</body>','<script src="/fixture.js"></script><script src="/program.js"></script></body>');
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {});
  const errors=[];
  try{
    await fs.mkdir(artifacts,{recursive:true});
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR'});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      // Every request is fixture-local; this test never reads or mutates production.
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/features/pajang/station.html')return route.fulfill({contentType:'text/html',body:template});
      if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:fixture()});
      if(url.pathname==='/program.js')return route.fulfill({contentType:'text/javascript',body:bundle});
      if(!/\.(?:css|svg|woff2?)$/.test(url.pathname))return route.abort();
      const file=path.resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+path.sep))return route.abort();
      try{return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.svg')?'image/svg+xml':'font/woff2',body:await fs.readFile(file)});}
      catch{return route.fulfill({status:404,body:''});}
    });
    const page=await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.message));
    const reset=async()=>{
      if(page.url().startsWith(origin))await page.evaluate(()=>history.replaceState(null,'',location.href));
      await page.goto(address);
      await page.locator('#answers .answercard').nth(3).waitFor();
    };
    await reset();

    // Relationship filters are server requests; an unclassified member remains in All.
    const answers=page.locator('#answers');
    const filters=answers.locator('[aria-label="원하는 인연으로 필터"]');
    assert.deepEqual(await filters.getByRole('button').allTextContents(),['전체',...intentOptions.map(([,label])=>label)]);
    assert.equal(await answers.locator('.answercard').count(),4,'All includes members without an inferred intention');
    const unclassified=answers.locator('.answercard').filter({hasText:'오늘은 음악 이야기가 하고 싶어요.'});
    assert.equal(await unclassified.locator('.answer-intents .tag').count(),0,'an existing hobby is not converted into a relationship intention');
    const conversationCard=answers.locator('.answercard').filter({hasText:'서로 책을 골라 주고 싶어요.'});
    assert.match(await conversationCard.locator('.answer-intents').textContent(),/대화/);
    assert.match(await conversationCard.locator('.answer-intents').textContent(),/친구/);
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      await assertNoOverflow(page,'relationship filters at '+width+'px');
      await answers.screenshot({path:path.join(artifacts,'relationship-feed-'+width+'.png'),animations:'disabled'});
    }
    for(const [key,label] of intentOptions){
      await filters.getByRole('button',{name:label,exact:true}).click();
      await page.waitForFunction(key=>window.preferenceFixture.feeds.some(call=>call.p_interest===key),key);
      await answers.locator('.cardgrid[aria-busy="false"]').waitFor();
      assert.equal(await filters.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true');
      assert.equal(await answers.locator('.answercard').count(),1,'one matching fixture answer for '+key);
      assert.equal(await answers.locator('.feednumber').getAttribute('aria-label'),'답변 1개');
    }
    await page.evaluate(()=>{window.preferenceFixture.emptyFilter='marriage';});
    await filters.getByRole('button',{name:'전체',exact:true}).click();
    await answers.locator('.cardgrid[aria-busy="false"]').waitFor();
    await filters.getByRole('button',{name:'결혼',exact:true}).click();
    await answers.getByRole('heading',{name:'이 인연을 원하는 회원의 답변이 아직 없어요',exact:true}).waitFor();
    assert.equal(await answers.locator('.answercard').count(),0);
    assert.equal(await answers.locator('.feednumber').getAttribute('aria-label'),'답변 0개');
    await answers.getByRole('button',{name:'전체 답변 보기',exact:true}).click();
    await answers.locator('.answercard').nth(3).waitFor();
    assert.equal(await filters.getByRole('button',{name:'전체',exact:true}).getAttribute('aria-pressed'),'true');

    // A profile opened from an answer displays only that member's chosen public information.
    await answers.locator('.answercard').filter({hasText:'서로 책을 골라 주고 싶어요.'}).getByRole('button',{name:/은하/}).click();
    const publicMember=page.getByRole('dialog').getByRole('region',{name:'공개 프로필',exact:true});
    await publicMember.locator('summary').filter({hasText:'만남 스타일'}).click();
    await publicMember.locator('.preference-tags').getByText('별 보며 걷기',{exact:true}).waitFor();
    assert.ok((await page.evaluate(()=>window.preferenceFixture.reads)).some(read=>read.peer==='22222222-2222-4222-8222-222222222222'));
    await page.getByRole('dialog').screenshot({path:path.join(artifacts,'public-member-profile.png'),animations:'disabled'});
    await closeProfile(page,page.getByRole('dialog'));

    let form=await openProfile(page);
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      await assertNoOverflow(page,'public profile editor at '+width+'px');
      const box=await form.dialog.boundingBox();
      assert.ok(box&&box.x>=-1&&box.x+box.width<=width+1,'profile editor fits '+width+'px');
      for(const label of groupLabels){
        const group=form.dialog.locator('details').filter({hasText:label});
        assert.equal(await group.evaluate(node=>node.open),false,label+' starts collapsed');
      }
      await form.dialog.screenshot({path:path.join(artifacts,'profile-collapsed-'+width+'.png'),animations:'disabled'});
    }
    const intents=form.dialog.getByRole('group',{name:'원하는 인연',exact:true});
    assert.equal(await intents.getByRole('button',{pressed:true}).count(),0,'legacy members start unclassified');
    await intents.getByRole('button',{name:'대화 상대',exact:true}).click();
    await intents.getByRole('button',{name:'친구',exact:true}).click();
    assert.equal(await intents.getByRole('button',{pressed:true}).count(),2,'multiple relationship intentions are allowed');
    let meeting=await openGroup(form.dialog,'만남 스타일');
    assert.ok(await meeting.getByRole('button',{pressed:false}).count()>=24,'meeting styles provide broad examples');
    for(const label of ['차분한 대화','유쾌한 수다','고민 나누기'])await meeting.getByRole('button',{name:label,exact:true}).click();
    assert.equal(await meeting.getByRole('button',{pressed:true}).count(),3,'users are not limited to two presets');
    const custom=meeting.getByRole('textbox',{name:'만남 스타일 직접 입력',exact:true});
    await custom.fill('  별 보며 걷기  ');
    await meeting.getByRole('button',{name:'만남 스타일 추가',exact:true}).click();
    await meeting.getByRole('button',{name:'별 보며 걷기 삭제',exact:true}).waitFor();
    await custom.fill('별 보며 걷기');
    const addCustom=meeting.getByRole('button',{name:'만남 스타일 추가',exact:true});
    if(await addCustom.isEnabled())await addCustom.click();
    assert.equal(await meeting.getByRole('button',{name:'별 보며 걷기 삭제',exact:true}).count(),1,'duplicate custom labels are not added');
    await form.dialog.screenshot({path:path.join(artifacts,'profile-multiple-choices-390.png'),animations:'disabled'});
    await meeting.locator('summary').click();
    for(const label of groupLabels.slice(1)){
      const group=await openGroup(form.dialog,label);
      assert.ok(await group.getByRole('button',{pressed:false}).count()>=24,label+' provides broad examples');
      await group.locator('summary').click();
    }
    await form.save.click();
    await form.dialog.waitFor({state:'hidden'});
    let saves=await page.evaluate(()=>window.preferenceFixture.saves);
    assert.equal(saves.length,1,'one atomic public profile save');
    assert.equal(saves[0].p_setup,false);
    assert.equal(saves[0].p_data.profilePerson,'11111111-1111-4111-8111-111111111111','save is bound to the profile opened for editing');
    assert.equal(saves[0].p_data.preferencesVersion,0);
    assert.deepEqual(saves[0].p_data.preferences.relationship_intents,['conversation','friendship']);
    assert.deepEqual(saves[0].p_data.preferences.meeting_styles,['deep_talk','playful_chat','share_worries']);
    assert.deepEqual(saves[0].p_data.preferences.custom.meeting_styles,['별 보며 걷기']);
    assert.equal(saves[0].p_data.interest,'book','existing profile artwork survives the new choices');
    assert.deepEqual(saves[0].p_data.preferences.life_priorities,[],'unselected groups remain empty');
    const ownSummary=page.getByRole('region',{name:'공개 프로필',exact:true});
    await openGroup(ownSummary,'만남 스타일');
    await ownSummary.locator('.preference-tags').getByText('별 보며 걷기',{exact:true}).waitFor();

    form=await openProfile(page);
    assert.equal(await form.dialog.getByRole('group',{name:'원하는 인연',exact:true}).getByRole('button',{pressed:true}).count(),2,'saved intentions are restored');
    meeting=await openGroup(form.dialog,'만남 스타일');
    assert.equal(await meeting.locator('.preference-chips').first().getByRole('button',{pressed:true}).count(),3,'saved presets are restored');
    await meeting.getByRole('button',{name:'별 보며 걷기 삭제',exact:true}).waitFor();
    await page.evaluate(()=>window.preferenceFixture.saveResponses.push('error'));
    await form.dialog.getByLabel('닉네임',{exact:true}).fill('새 보리');
    await form.save.click();
    await form.dialog.getByRole('alert').waitFor();
    assert.equal(await form.dialog.getByLabel('닉네임',{exact:true}).inputValue(),'새 보리','save failure preserves the nickname draft');
    assert.equal(await meeting.locator('.preference-chips').first().getByRole('button',{pressed:true}).count(),3,'save failure preserves selected presets');
    assert.equal(await page.evaluate(()=>window.preferenceFixture.record().version),1,'failed save does not change the saved profile');
    await form.save.click();
    await form.dialog.waitFor({state:'hidden'});
    saves=await page.evaluate(()=>window.preferenceFixture.saves);
    assert.equal(saves[1].p_data.preferencesVersion,1);
    assert.equal(saves[2].p_data.preferencesVersion,1,'retry uses the same expected version');

    // Clearing choices sends explicit empty arrays; closing without saving keeps the saved values.
    form=await openProfile(page);
    await form.dialog.getByRole('group',{name:'원하는 인연',exact:true}).getByRole('button',{name:'대화 상대',exact:true}).click();
    await form.dialog.getByRole('group',{name:'원하는 인연',exact:true}).getByRole('button',{name:'친구',exact:true}).click();
    meeting=await openGroup(form.dialog,'만남 스타일');
    for(const label of ['차분한 대화','유쾌한 수다','고민 나누기'])await meeting.getByRole('button',{name:label,exact:true}).click();
    await meeting.getByRole('button',{name:'별 보며 걷기 삭제',exact:true}).click();
    await form.save.click();
    await form.dialog.waitFor({state:'hidden'});
    const cleared=await page.evaluate(()=>window.preferenceFixture.saves.at(-1));
    assert.deepEqual(cleared.p_data.preferences.relationship_intents,[]);
    assert.deepEqual(cleared.p_data.preferences.meeting_styles,[]);
    assert.deepEqual(cleared.p_data.preferences.custom.meeting_styles,[]);
    form=await openProfile(page);
    await form.dialog.getByRole('group',{name:'원하는 인연',exact:true}).getByRole('button',{name:'연애 상대',exact:true}).click();
    await closeProfile(page,form.dialog);
    form=await openProfile(page);
    assert.equal(await form.dialog.getByRole('group',{name:'원하는 인연',exact:true}).getByRole('button',{pressed:true}).count(),0,'unsaved selections are not persisted');
    await closeProfile(page,form.dialog);

    // A failed or incomplete read must never turn existing choices into an empty save.
    await page.evaluate(()=>window.preferenceFixture.readResponses.push('error'));
    form=await openProfile(page,{ready:false});
    await form.dialog.getByText('프로필 선택항목을 불러오지 못했어요.',{exact:true}).waitFor();
    assert.equal(await form.save.isDisabled(),true,'save is disabled after a failed profile read');
    await form.dialog.getByRole('button',{name:'다시 불러오기',exact:true}).click();
    await page.waitForFunction(button=>!button.disabled,await form.save.elementHandle());
    await closeProfile(page,form.dialog);
    await page.evaluate(()=>window.preferenceFixture.readResponses.push('pending'));
    form=await openProfile(page,{ready:false});
    await form.dialog.getByText('프로필 선택항목을 불러오고 있어요.',{exact:true}).waitFor();
    assert.equal(await form.save.isDisabled(),true,'save is disabled while a profile read is pending');
    await page.waitForFunction(()=>window.preferenceFixture.pendingReads.length===1);
    await page.evaluate(()=>window.preferenceFixture.finishRead());
    await page.waitForFunction(button=>!button.disabled,await form.save.elementHandle());
    await closeProfile(page,form.dialog);

    await reset();
    await page.evaluate(()=>{window.preferenceFixture.pagination=true;});
    await filters.getByRole('button',{name:'대화',exact:true}).click();
    await answers.locator('.cardgrid[aria-busy="false"]').waitFor();
    assert.equal(await answers.locator('.answercard').count(),24,'only the server page is shown initially');
    assert.equal(await answers.locator('.feednumber').getAttribute('aria-label'),'답변 26개','the server filtered total is shown');
    await answers.getByRole('button',{name:'답변 더 보기',exact:true}).click();
    await answers.locator('.answercard').nth(25).waitFor();
    const cursorCall=await page.evaluate(()=>window.preferenceFixture.feeds.find(call=>call.p_cursor));
    assert.equal(cursorCall.p_interest,'conversation','pagination keeps the relationship filter');
    assert.deepEqual(cursorCall.p_cursor,{offset:24,interest:'conversation'});
    await page.evaluate(()=>{window.preferenceFixture.deniedFeed=true;});
    await filters.getByRole('button',{name:'친구',exact:true}).click();
    await answers.getByRole('alert').waitFor();
    assert.equal(await answers.locator('.answercard').count(),0,'authorization failure clears previously visible answers');

    assert.deepEqual(errors,[],'no uncaught browser errors');
    assert.deepEqual(await page.evaluate(()=>window.preferenceFixture.unexpected),[],'no unexpected RPCs');
    console.log('PASS optional public profile preferences and desired-relationship discovery');
    await context.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
