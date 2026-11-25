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
    me:{id:'11111111-1111-4111-8111-111111111111', name:'보리', region:'서울특별시', interest:'book', avatarId:101, gender:'male', body:'함께 나눌 이야기가 좋아요.'},
    locationEnabled:false, locationVersion:0, radarOn:false
  };
  const base = {
    region:'서울특별시', day:'2026-11-19', slot:'am', at:1,
    sent:false, received:false, own:false, question:state.question.q[0]
  };
  const rows = [
    {...base, peer:'22222222-2222-4222-8222-222222222222', name:'은하', avatarId:9, interest:'book', body:'서로 책을 골라 주고 싶어요.', relationship_intents:['conversation','friendship']},
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
    const ownAnswer={...rows[0],peer:state.me.id,own:true,name:state.me.name,body:state.me.body,avatarId:state.me.avatarId,gender:state.me.gender,relationship_intents:[]};
    let privateProfile={fields:{drinking:'가끔 마셔요',smoking:'피우지 않아요',bio:'반가워요.'},avatar:{id:101,form:'full',bg:0},avatarCollection:'male',age:35,gender:'남성',showAge:false,showGender:true};
    for (const row of rows) records.set(row.peer,{
      person:row.peer,avatarId:row.peer===rows[0].peer?120:row.avatarId,version:1,
      preferences:{...emptyPreferences(),relationship_intents:[...row.relationship_intents],custom:{...emptyPreferences().custom,meeting_styles:['별 보며 걷기']}}
    });
    const listeners = new Set();
    let session = {user:{id:'auth-member',is_anonymous:false},access_token:'mock-member-token'};
    const control = window.preferenceFixture = {
      reads:[],saves:[],feeds:[],unexpected:[],readResponses:[],saveResponses:[],pendingReads:[],pendingSaves:[],
      detailReads:[],detailSaves:[],detailReadResponses:[],detailSaveResponses:[],pendingDetailReads:[],pendingDetailSaves:[],
      emptyFilter:'',pagination:false,deniedFeed:false,historyEvents:0
    };
    window.addEventListener('popstate',()=>control.historyEvents++,true);
    control.changeUser = id => {
      session = id ? {user:{id,is_anonymous:false},access_token:'mock-next-token'} : null;
      for (const listener of listeners) listener(id ? 'SIGNED_IN' : 'SIGNED_OUT',session);
    };
    control.record = () => structuredClone(records.get(state.me.id));
    control.detail = () => {
      const record=records.get(state.me.id);
      return structuredClone({...privateProfile,person:state.me.id,name:state.me.name,region:state.me.region,interest:state.me.interest,
        preferences:record.preferences,preferencesVersion:record.version});
    };
    control.finishRead = () => control.pendingReads.shift()?.();
    control.finishSave = () => control.pendingSaves.shift()?.();
    control.finishDetailRead = () => control.pendingDetailReads.shift()?.();
    control.finishDetailSave = () => control.pendingDetailSaves.shift()?.();
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
          const record={person:state.me.id,preferences:{...current.preferences,...structuredClone(data.preferences)},version:current.version+1};
          records.set(state.me.id,record);
          Object.assign(state.me,{name:data.name||state.me.name,region:data.region,
            preferences:record.preferences,preferencesVersion:record.version});
          if(Object.hasOwn(data,'interest'))state.me.interest=data.interest;
          return {data:structuredClone(state),error:null};
        }
        if(name==='pajang_profile_details'&&args.p_action==='mine'){
          control.detailReads.push(structuredClone(args));
          const mode=control.detailReadResponses.shift() || 'success';
          const snapshot=control.detail();
          if(mode==='pending')await new Promise(resolve=>{
            control.pendingDetailReads.push(resolve);
            signal?.addEventListener('abort',resolve,{once:true});
          });
          if(mode==='error')return error('XX000','교환용 프로필을 불러오지 못했어요.');
          return {data:snapshot,error:null};
        }
        if(name==='pajang_profile_details'&&args.p_action==='save'){
          control.detailSaves.push(structuredClone(args));
          const mode=control.detailSaveResponses.shift() || 'success';
          if(mode==='pending')await new Promise(resolve=>control.pendingDetailSaves.push(resolve));
          if(mode==='error')return error('XX000','프로필을 저장하지 못했어요. 다시 시도해 주세요.');
          const current=records.get(state.me.id),data=args.p_data;
          if(data.profilePerson!==state.me.id)return error('42501','회원 정보를 확인해 주세요.');
          if(mode==='conflict'||data.preferencesVersion!==current.version)return error('PT412','다른 화면에서 프로필을 변경했어요. 다시 열어 주세요.');
          const record={person:state.me.id,preferences:{...current.preferences,...structuredClone(data.preferences)},version:current.version+1};
          records.set(state.me.id,record);
          privateProfile={...privateProfile,fields:structuredClone(data.fields),showAge:data.showAge??privateProfile.showAge,showGender:data.showGender??privateProfile.showGender};
          if(data.avatar)privateProfile.avatar=structuredClone(data.avatar);
          state.me.avatarId=privateProfile.showGender?privateProfile.avatar.id:201;
          state.me.gender=privateProfile.showGender?'male':null;
          Object.assign(state.me,{name:data.name.trim(),region:data.region,interest:data.interest,
             preferences:record.preferences,preferencesVersion:record.version});
          return {data:control.detail(),error:null};
        }
        if(name==='pajang_discovery_feed'){
          control.feeds.push(structuredClone(args));
          if(control.deniedFeed)return error('42501','회원 정보를 확인해 주세요.');
          let source=[...rows,ownAnswer];
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
  await page.waitForFunction(()=>!history.state?.pajangNavigation?.modal);
  await page.getByRole('navigation',{name:'파장 메뉴'}).getByRole('link',{name:'내 파장',exact:true}).click();
  await page.getByRole('button',{name:'내 프로필 수정',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'내 프로필 수정',exact:true});
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

// The public and exchange editors now share one entry point.
async function openDetails(page,options) { return openProfile(page,options); }

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
      if(!/\.(?:css|svg|woff2?|webp)$/.test(url.pathname))return route.abort();
      const file=path.resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+path.sep))return route.abort();
      try{return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.svg')?'image/svg+xml':url.pathname.endsWith('.webp')?'image/webp':'font/woff2',body:await fs.readFile(file)});}
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
    assert.equal(await answers.locator('.answercard').count(),5,'All includes my answer and members without an inferred intention');
    const ownPortrait=answers.locator('.answercard').filter({hasText:'함께 나눌 이야기가 좋아요.'}).locator('.pj-character-portrait');
    assert.match(await ownPortrait.evaluate(el=>el.style.backgroundImage),/avatars-male-20261125-01\.webp/);
    assert.match(await ownPortrait.getAttribute('aria-label'),/흰 티와 청바지/);
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
      assert.equal(await answers.locator('.history-heading .feednumber').count(),0,'the answer heading has no count badge');
    }
    await page.evaluate(()=>{window.preferenceFixture.emptyFilter='marriage';});
    await filters.getByRole('button',{name:'전체',exact:true}).click();
    await answers.locator('.cardgrid[aria-busy="false"]').waitFor();
    await filters.getByRole('button',{name:'결혼',exact:true}).click();
    await answers.getByRole('heading',{name:'이 인연을 원하는 회원의 답변이 아직 없어요',exact:true}).waitFor();
    assert.equal(await answers.locator('.answercard').count(),0);
    assert.equal(await answers.locator('.history-heading .feednumber').count(),0,'the answer heading has no count badge');
    await answers.getByRole('button',{name:'전체 답변 보기',exact:true}).click();
    await answers.locator('.answercard').nth(3).waitFor();
    assert.equal(await filters.getByRole('button',{name:'전체',exact:true}).getAttribute('aria-pressed'),'true');

    // A profile opened from an answer displays only that member's chosen public information.
    await answers.locator('.answercard').filter({hasText:'서로 책을 골라 주고 싶어요.'}).getByRole('button',{name:/은하/}).click();
    const publicMember=page.getByRole('dialog').getByRole('region',{name:'공개 프로필',exact:true});
    await publicMember.getByRole('heading',{name:'나를 표현하는 취향',exact:true}).waitFor();
    await publicMember.locator('.preference-tags').getByText('별 보며 걷기',{exact:true}).waitFor();
    assert.match(await page.getByRole('dialog').locator('.pj-character-portrait').evaluate(el=>el.style.backgroundImage),/avatars-male-20261125-05\.webp/,
      'the opened public profile uses the current portrait even when its feed card was older');
    assert.equal(await publicMember.getByText('만남 스타일',{exact:true}).isVisible(),true,'a peer\'s public tastes are visible without opening an editor or disclosure');
    assert.ok((await page.evaluate(()=>window.preferenceFixture.reads)).some(read=>read.peer==='22222222-2222-4222-8222-222222222222'));
    await page.getByRole('dialog').screenshot({path:path.join(artifacts,'public-member-profile.png'),animations:'disabled'});
    await closeProfile(page,page.getByRole('dialog'));

    // All editable fields share one entry and one atomic RPC.
    let form=await openProfile(page);
    const settings=page.locator('.station-account');
    const onlyButton=()=>settings.getByRole('button',{name:'내 프로필 수정',exact:true});
    assert.equal(await settings.getByRole('button',{name:'공개 프로필 수정'}).count(),0);
    assert.equal(await settings.getByRole('button',{name:'교환용 프로필·취향 수정'}).count(),0);
    assert.equal(await form.dialog.locator('.unified-public-profile').count(),1);
    assert.equal(await form.dialog.locator('.unified-private-profile').count(),1);
    assert.equal(await form.dialog.locator('.unified-public-profile .unified-public-tastes').count(),1,
      'tastes appear inside the public profile');
    assert.equal(await form.dialog.locator('.unified-private-profile').evaluate(node=>node.open),true,
      'exchange-only fields are expanded when the editor opens');
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      await assertNoOverflow(page,'unified profile at '+width+'px');
      const box=await form.dialog.boundingBox();
      assert.ok(box&&box.x>=-1&&box.x+box.width<=width+1,'unified profile editor fits '+width);
      await form.dialog.screenshot({path:path.join(artifacts,'unified-profile-'+width+'.png'),animations:'disabled'});
    }
    const intentions=form.dialog.getByRole('group',{name:'원하는 인연',exact:true});
    await intentions.getByRole('button',{name:'대화 상대',exact:true}).click();
    await intentions.getByRole('button',{name:'친구',exact:true}).click();
    await form.dialog.getByLabel('닉네임',{exact:true}).fill('새 보리');
    await form.dialog.getByLabel('공개할 활동 지역 시·도').selectOption('경기도');

    const meeting=await openGroup(form.dialog,'만남 스타일');
    await meeting.getByRole('button',{name:'차분한 대화',exact:true}).click();
    await meeting.getByRole('textbox',{name:'만남 스타일 직접 입력',exact:true}).fill('별 보며 걷기');
    await meeting.getByRole('button',{name:'만남 스타일 추가',exact:true}).click();
    const options=meeting.locator('.preference-chips').first().getByRole('button');
    for(const n of [1,2,3])await options.nth(n).click();
    assert.equal(await meeting.getByRole('button',{pressed:true}).count(),5);
    assert.ok(await options.nth(4).isDisabled());
    assert.ok(await meeting.getByRole('textbox').isDisabled());
    assert.equal(await options.first().evaluate(el=>getComputedStyle(el,'::before').content),'none');
    assert.notEqual(await options.first().evaluate(el=>getComputedStyle(el).backgroundColor),
      await options.nth(4).evaluate(el=>getComputedStyle(el).backgroundColor));
    const values=await openGroup(form.dialog,'관계에서 중요한 것');
    assert.ok(await values.getByRole('button').first().isEnabled());
    await openGroup(form.dialog,'만남 스타일');
    for(const n of [1,2,3])await options.nth(n).click();
    assert.ok(await meeting.getByRole('textbox').isEnabled());
    const art=await openGroup(form.dialog,'대표 취향');
    await art.getByRole('button',{name:'카페',exact:true}).click();
    await form.dialog.getByRole('button',{name:'캐릭터 선택',exact:true}).click();
    assert.equal(await form.dialog.getByRole('button',{name:'여자',exact:true}).count(),0);
    await form.dialog.getByRole('button',{name:'책방 가는 날 대두형',exact:true}).click();

    const privateSection=form.dialog.locator('.unified-private-profile');
    assert.equal(await privateSection.evaluate(node=>node.open),true,'exchange details start expanded');
    await form.dialog.getByLabel('직업',{exact:true}).fill('책방지기');
    await form.dialog.getByLabel('자기소개',{exact:false}).fill('서로 이야기를 나누고 싶어요.');
    await form.dialog.locator('.unified-private-fields .exchange-check').filter({hasText:'나이'}).locator('input[type="checkbox"]').check();
    const genderCheckbox=()=>form.dialog.locator('.exchange-check').filter({hasText:'성별'}).getByRole('checkbox');
    await genderCheckbox().uncheck();
    assert.match(await form.dialog.locator('.pj-avatar-stage').getAttribute('aria-label'),/^나무 분장 대두형/);
    await form.save.click();
    await form.dialog.waitFor({state:'hidden'});
    let detailSaves=await page.evaluate(()=>window.preferenceFixture.detailSaves);
    assert.equal(detailSaves.length,1,'one RPC saves all the public and exchanged fields');
    assert.equal((await page.evaluate(()=>window.preferenceFixture.saves)).length,0,
      'the old independent public editor never writes on the combined path');
    const first=detailSaves[0].p_data;
    assert.equal(first.profilePerson,'11111111-1111-4111-8111-111111111111');
    assert.equal(first.name,'새 보리');
    assert.equal(first.region,'경기도');
    assert.deepEqual(first.preferences.relationship_intents,['conversation','friendship']);
    assert.deepEqual(first.preferences.meeting_styles,['deep_talk']);
    assert.deepEqual(first.preferences.custom.meeting_styles,['별 보며 걷기']);
    assert.equal(first.fields.job,'책방지기');
    assert.equal(first.fields.bio,'서로 이야기를 나누고 싶어요.');
    assert.equal(first.interest,'coffee');
    assert.deepEqual(first.avatar,{id:102,form:'mini',bg:0});
    assert.equal(first.showGender,false);
    assert.equal(first.showAge,true);
    assert.deepEqual(await page.evaluate(()=>window.preferenceFixture.detail().name),'새 보리');
    assert.equal(await page.evaluate(()=>window.preferenceFixture.detail().region),'경기도');
    assert.deepEqual(await page.evaluate(()=>window.preferenceFixture.record().preferences.relationship_intents),['conversation','friendship']);
    assert.equal(await settings.getByRole('region',{name:'공개 프로필',exact:true}).count(),0,
      'settings does not add an extra profile summary card');
    assert.equal(await onlyButton().count(),1,'settings has exactly one profile editor link');
    await page.getByRole('navigation',{name:'파장 메뉴'}).getByRole('link',{name:'오늘',exact:true}).click();
    assert.match(await ownPortrait.getAttribute('aria-label'),/나무/,'a stale feed row cannot reveal the hidden outfit');
    assert.equal(await ownPortrait.getAttribute('data-gender-tone'),null);

    form=await openProfile(page);
    assert.equal(await form.dialog.getByLabel('닉네임',{exact:true}).inputValue(),'새 보리');
    assert.equal(await form.dialog.getByLabel('공개할 활동 지역 시·도').inputValue(),'경기도');
    assert.equal(await form.dialog.getByRole('group',{name:'원하는 인연',exact:true})
      .getByRole('button',{pressed:true}).count(),2);
    const privateAgain=form.dialog.locator('.unified-private-profile');
    assert.equal(await privateAgain.evaluate(node=>node.open),true,'exchange details reopen expanded');
    assert.equal(await form.dialog.getByLabel('직업',{exact:true}).inputValue(),'책방지기');
    await form.dialog.getByRole('button',{name:'캐릭터 선택',exact:true}).click();
    const savedOutfit=form.dialog.getByRole('button',{name:'책방 가는 날 대두형',exact:true});
    assert.equal(await savedOutfit.getAttribute('aria-pressed'),'true','hiding gender preserves the member’s private selection');
    await savedOutfit.click();
    await genderCheckbox().check();
    assert.match(await form.dialog.locator('.pj-avatar-stage').getAttribute('aria-label'),/^책방 가는 날 대두형/);
    await form.dialog.getByLabel('닉네임',{exact:true}).fill('고친 보리');
    await form.dialog.getByLabel('직업',{exact:true}).fill('새 직업');
    await page.evaluate(()=>window.preferenceFixture.detailSaveResponses.push('error'));
    await form.save.click();
    await form.dialog.getByRole('alert').waitFor();
    assert.equal(await form.dialog.getByLabel('닉네임',{exact:true}).inputValue(),'고친 보리');
    assert.equal(await form.dialog.getByLabel('직업',{exact:true}).inputValue(),'새 직업');
    assert.equal(await page.evaluate(()=>window.preferenceFixture.detail().name),'새 보리',
      'failed save leaves the original public data');
    assert.equal(await page.evaluate(()=>window.preferenceFixture.detail().fields.job),'책방지기',
      'failed save leaves the private data');
    await form.save.click();await form.dialog.waitFor({state:'hidden'});
    detailSaves=await page.evaluate(()=>window.preferenceFixture.detailSaves);
    assert.equal(detailSaves.length,3);
    assert.equal(detailSaves[1].p_data.preferencesVersion,1);
    assert.equal(detailSaves[2].p_data.preferencesVersion,1,'retry uses the original expected version');
    assert.equal(await page.evaluate(()=>window.preferenceFixture.detail().name),'고친 보리');
    assert.equal(await page.evaluate(()=>window.preferenceFixture.detail().fields.job),'새 직업');
    await page.getByRole('navigation',{name:'파장 메뉴'}).getByRole('link',{name:'오늘',exact:true}).click();
    assert.match(await ownPortrait.getAttribute('aria-label'),/책방 가는 날/,'showing gender restores the saved outfit without reloading');
    assert.equal(await ownPortrait.getAttribute('data-gender-tone'),'male');

    // Clearing the public relationship choices must not erase exchange details.
    form=await openProfile(page);
    const chosen=form.dialog.getByRole('group',{name:'원하는 인연',exact:true});
    for(const label of ['대화 상대','친구'])await chosen.getByRole('button',{name:label,exact:true}).click();
    await form.save.click();await form.dialog.waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>window.preferenceFixture.record().preferences.relationship_intents),[]);
    assert.equal(await page.evaluate(()=>window.preferenceFixture.detail().fields.job),'새 직업');

    // One read supplies the entire edit screen; errors/pending reads never allow a blank overwrite.
    await page.evaluate(()=>window.preferenceFixture.detailReadResponses.push('error'));
    form=await openProfile(page,{ready:false});
    await form.dialog.getByRole('alert').waitFor();
    assert.equal(await form.dialog.locator('.exchange-editor').count(),0);
    await form.dialog.getByRole('button',{name:'다시 시도',exact:true}).click();
    await form.save.waitFor();await page.waitForFunction(button=>!button.disabled,await form.save.elementHandle());
    await closeProfile(page,form.dialog);
    await page.evaluate(()=>window.preferenceFixture.detailReadResponses.push('pending'));
    form=await openProfile(page,{ready:false});
    await form.dialog.getByText('회원정보와 취향을 확인하고 있어요.',{exact:true}).waitFor();
    assert.equal(await form.dialog.locator('.exchange-editor').count(),0);
    await page.waitForFunction(()=>window.preferenceFixture.pendingDetailReads.length===1);
    await page.evaluate(()=>window.preferenceFixture.finishDetailRead());
    await form.save.waitFor();await page.waitForFunction(button=>!button.disabled,await form.save.elementHandle());
    await closeProfile(page,form.dialog);

    await reset();
    await page.evaluate(()=>{window.preferenceFixture.pagination=true;});
    await filters.getByRole('button',{name:'대화',exact:true}).click();
    await answers.locator('.cardgrid[aria-busy="false"]').waitFor();
    assert.equal(await answers.locator('.answercard').count(),24,'only the server page is shown initially');
    assert.equal(await answers.locator('.history-heading .feednumber').count(),0,'the answer heading has no count badge');
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
