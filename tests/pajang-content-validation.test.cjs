const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {createRequire} = require('node:module');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const test = require('node:test');
const {JSDOM} = require('jsdom');

const feature = path.resolve(__dirname, '../features/pajang');
const {build} = createRequire(path.join(feature, 'package.json'))('esbuild');
const networkError = {code:'08006', message:'연결을 확인하고 다시 시도해 주세요.'};
// This fixture-only token represents the server's word rules. The product never
// loads this token or a client-side word dictionary.
const mask = value => value.replaceAll('금칙','❤️❤️');
const maskValues = value => typeof value === 'string' ? mask(value) : Array.isArray(value)
  ? Array.from(value,maskValues) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key,item]) => [key,maskValues(item)])) : value;
const copy = value => JSON.parse(JSON.stringify(value));
const turn = () => new Promise(resolve => setTimeout(resolve, 10));
async function wait(check, message = 'the UI should finish updating') {
  for (let i = 0; i < 200; i++) { if (check()) return; await turn(); }
  assert.ok(check(), message);
}
const emptyPreferences = () => ({
  relationship_intents:[], meeting_styles:[], relationship_values:[], affection_styles:[], life_priorities:[],
  custom:{meeting_styles:[], relationship_values:[], affection_styles:[], life_priorities:[]},
});
let uiBundle;
function bundleUI() {
  return uiBundle ||= build({
    stdin:{resolveDir:feature, loader:'tsx', contents:`
      import {createRoot} from 'react-dom/client';
      import StationApp from './src/app/station-app';
      import {ExchangeProfileEditor} from './src/app/exchange-profile';
      import {QuestionSuggestionForm} from './src/app/question-suggestion';
      const root = createRoot(document.getElementById('root'));
      root.render(window.formMode === 'exchange'
        ? <ExchangeProfileEditor profileId={window.contentState.me.id} onSaved={() => window.formSaved()}/>
        : window.formMode === 'suggestion'
        ? <QuestionSuggestionForm onBusyChange={() => {}} onSaved={() => window.formSaved()}/>
        : <StationApp initialStation={window.contentState}/>);
      window.unmountContent = () => root.unmount();
    `},
    bundle:true, write:false, format:'iife', platform:'browser', jsx:'automatic',
    define:{'process.env.NODE_ENV':'"production"'},
  }).then(result => result.outputFiles[0].text);
}

// Real forms and navigation run against an isolated RPC boundary. Masking occurs
// in that boundary, not in the forms, and no live account is read or written.
async function fixture(t, {mode='station', body='기존 답변', chat=false, setup=false,freeRemaining=2,paidRemaining=4} = {}) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url:'https://content.test/features/pajang/station.html' + (chat ? '?chat=peer-two' : ''),
    runScripts:'outside-only', pretendToBeVisual:true,
  });
  const w = dom.window, document = w.document;
  w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.OjjudaLocation = {acceptPreference(){}, subscribe(){return () => {};}};
  w.pajangArt = {};
  const me = {id:'member-one', name:'보리', region:'서울특별시', interest:'book', body};
  const peer = {id:'peer-two', name:'라온', region:'서울특별시', interest:'walk', body:'함께 걸어요.'};
  const state = {
    calls:[], writes:[], successes:0, reject:null, coins:150, balanceEvents:[], messages:[], inquiries:new Map(),
    preferences:emptyPreferences(), preferencesVersion:setup ? 0 : 3,
    exchange:{fields:{job:'책방지기', religion:'천주교', bio:'반가워요.'}, age:35, gender:'남성', showAge:false, showGender:false},
    server:{day:'2026-11-19', slot:'am', nextAt:new Date(Date.now()+3600000).toISOString(),
      question:{id:9, q:['함께 무엇을 하고 싶나요?'], answers:[]}, me:setup ? null : me, people:[peer],
      authenticated:true, remaining:freeRemaining+paidRemaining, freeRemaining, paidRemaining, purchasingEnabled:true,
      locationEnabled:false, locationVersion:0, radarOn:false, messages:[],
      signals:chat ? [{src:me.id,dst:peer.id,day:'2026-11-19',note:'안녕',at:1}, {src:peer.id,dst:me.id,day:'2026-11-19',note:'반가워요',at:2}] : []},
  };
  const session = {user:{id:'auth-member',is_anonymous:false},access_token:'fixture-token'};
  const db = {
    auth:{getSession:async () => ({data:{session},error:null}),
      onAuthStateChange:() => ({data:{subscription:{unsubscribe(){}}}})},
    schema:name => { assert.equal(name,'ojjuda_note'); return {rpc:(name,args) => db.rpc(name,args)}; },
    rpc(name,args={}) {
      let promise;
      const headers = {};
      const query = {abortSignal(){return query;}, setHeader(key,value){headers[key]=value;return query;},
        then(resolve,reject) {
          promise ||= Promise.resolve().then(() => {
            const call = {name,args:copy(args),headers:copy(headers)};
            state.calls.push(call);
            const action = name === 'pajang_member' ? args.p_action :
              name === 'pajang_profile_save' ? 'profile' : name === 'submit_inquiry' ? 'suggestion' :
              name === 'pajang_profile_details' && args.p_action === 'save' ? 'exchange' : '';
            if (['answer','edit-answer','signal','message','profile','suggestion','exchange'].includes(action)) {
              state.writes.push(call);
              if (state.reject) return {data:null,error:copy(state.reject)};
              const data = args.p_data;
              const respond = data => {
                const result = {data:copy(data),error:null};
                return state.afterWrite?.(action,result,call) || result;
              };
              if (action === 'message' && state.messages.some(message => message.id === data.id)) return respond(state.server);
              if (action === 'suggestion' && state.inquiries.has(args.p_request_id)) return respond('77777777-7777-4777-8777-777777777777');
              state.successes++;
              if (action === 'profile') {
                state.server.me = {...(state.server.me || me),name:mask(data.name),region:data.region};
                if(Object.hasOwn(data,'interest'))state.server.me.interest=data.interest;
                state.preferences = {...state.preferences,...maskValues(data.preferences)}; state.preferencesVersion++;
                Object.assign(state.server.me,{preferences:copy(state.preferences),preferencesVersion:state.preferencesVersion});
              } else if (action === 'answer' || action === 'edit-answer') state.server.me.body = mask(data.body);
              else if (action === 'signal') {
                state.server.remaining--;
                if(state.server.freeRemaining)state.server.freeRemaining--;else state.server.paidRemaining--;
                state.server.signals.push({src:me.id,dst:peer.id,day:state.server.day,note:mask(data.note),at:3});
              } else if (action === 'message') state.messages.push({id:data.id,src:me.id,dst:peer.id,body:mask(data.body),at:3});
              else if (action === 'exchange') {
                assert.equal(data.profilePerson,me.id);
                assert.equal(data.preferencesVersion,state.preferencesVersion);
                assert.ok(Object.hasOwn(data.preferences,'relationship_intents'));
                state.exchange = {...state.exchange,showAge:data.showAge,showGender:data.showGender,fields:maskValues(data.fields)};
                if(state.exchange.fields.height)state.exchange.fields.height=Number(state.exchange.fields.height);
                state.preferences={...state.preferences,...maskValues(data.preferences)};state.preferencesVersion++;
                Object.assign(state.server.me,{name:mask(data.name),region:data.region,
                   interest:data.interest,preferences:copy(state.preferences),preferencesVersion:state.preferencesVersion});
                const masking = Object.fromEntries(Object.entries(data.fields)
                  .filter(([key,value]) => key !== 'height' && value !== state.exchange.fields[key])
                  .map(([key,submitted]) => [key,{submitted,saved:state.exchange.fields[key]}]));
                return respond({...state.exchange,masking,person:me.id,name:state.server.me.name,region:state.server.me.region,interest:state.server.me.interest,
                  preferences:state.preferences,preferencesVersion:state.preferencesVersion});
              } else if (action === 'suggestion') {
                state.inquiries.set(args.p_request_id,mask(args.p_body));
                return respond('77777777-7777-4777-8777-777777777777');
              }
              return respond(state.server);
            }
            if (name === 'pajang_member') return {data:copy(args.p_action === 'thread' ? state.messages : state.server),error:null};
            if (name === 'pajang_profile_preferences') return {data:{person:args.p_peer || me.id,preferences:copy(state.preferences),version:state.preferencesVersion},error:null};
            if (name === 'pajang_discovery_feed') return {data:{items:[{...peer,peer:peer.id,day:state.server.day,slot:'am',at:1,question:state.server.question.q[0],own:false,sent:false,received:false}],nextCursor:null,total:1,remaining:state.server.remaining},error:null};
            if (name === 'pajang_profile_details' && args.p_action === 'mine') return {data:{...copy(state.exchange),
              person:me.id,name:state.server.me.name,region:state.server.me.region,
               interest:state.server.me.interest,preferences:copy(state.preferences),preferencesVersion:state.preferencesVersion},error:null};
            if (name === 'pajang_exchange' && args.p_action === 'state') return {data:{myCount:state.messages.length,peerCount:0,eligible:false,profile:'none',photos:'none',peerProfile:null},error:null};
            if (name === 'is_admin') return {data:false,error:null};
            throw Error('Unexpected RPC '+name);
          });
          return promise.then(resolve,reject);
        },
      };
      return query;
    },
  };
  w.OjjudaGetClient = async () => db;
  w.formMode = mode; w.contentState = copy(state.server); w.formSaved = () => state.saved = true;
  w.addEventListener('pajang:balance', event => state.balanceEvents.push(event.detail));
  w.eval(await bundleUI());
  t.after(() => { w.unmountContent(); w.close(); });
  const q = selector => document.querySelector(selector);
  const control = label => [...document.querySelectorAll('input,textarea,select')].find(element =>
    element.getAttribute('aria-label') === label || [...element.labels].some(item => item.textContent.trim().startsWith(label)));
  const f = {w,state,q,control,
    alert:() => q('[role="alert"]'),
    button:label => [...document.querySelectorAll('button')].find(button => button.textContent.trim().startsWith(label)),
    async set(element,value) {
      assert.ok(element,'the input should exist');
      if (element.type === 'checkbox') { if (element.checked !== value) element.click(); }
      else {
        const prototype = element.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype :
          element.tagName === 'SELECT' ? w.HTMLSelectElement.prototype : w.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);
        element.dispatchEvent(new w.Event(element.tagName === 'SELECT' ? 'change' : 'input',{bubbles:true}));
      }
      await turn();
    },
    async failed(form) {
      form.requestSubmit();
      await wait(() => f.alert(),'a failed request should show an error');
      assert.equal(state.successes,0); assert.equal(state.saved,undefined);
      assert.equal(q('.toast'),null,'a failed request must not show a success toast');
      assert.equal(state.coins,150); assert.deepEqual(state.balanceEvents,[]);
    },
  };
  await wait(() => mode === 'exchange' ? q('.exchange-editor [type="submit"]') && !q('.exchange-editor [type="submit"]').disabled : mode === 'suggestion'
    ? q('.question-suggestion-form') && !document.body.textContent.includes('계정을 확인하고 있어요.')
    : chat ? q('.composer') : q('.letter-hero button') && !q('.letter-hero button').disabled);
  await turn();
  return f;
}

test('input limits count saved masks and Unicode code points without changing the text', async () => {
  const {maskedTextLength,textInputMaxLength} = await import(pathToFileURL(path.join(feature,'../../shared/content/text-length.mjs')).href);
  assert.equal(maskedTextLength('가❤️❤️나'),3);
  assert.equal(maskedTextLength('😀❤️❤️❤️❤️'),3);
  assert.equal(textInputMaxLength('😀❤️❤️',10),14);
  assert.equal(textInputMaxLength('ordinary text',20),20);
  assert.equal(maskedTextLength('금칙'),2,'length calculation must not filter drafts');
});

async function openPublicProfile(f) {
  f.q('nav [aria-label="내 파장"]').click(); await wait(() => f.button('내 프로필 수정'));
  f.button('내 프로필 수정').click();
  await wait(() => f.q('.unified-profile-editor .profile-intent-field') && !f.q('.exchange-editor .primary').disabled);
}

async function openDetailedProfile(f) { return openPublicProfile(f); }

for (const editing of [false,true]) test(`a ${editing ? 'changed' : 'new'} answer saves the server mask and can be edited near its length limit`, async t => {
  const f = await fixture(t,{body:editing ? '기존 답변' : ''});
  f.q('.letter-hero button').click(); await wait(() => f.q('#editor'));
  const original='가'.repeat(218)+'금칙', canonical=mask(original);
  await f.set(f.q('#editor'),original);
  f.q('dialog form').requestSubmit(); f.q('dialog form').requestSubmit();
  await wait(() => !f.q('dialog') && !f.w.history.state?.pajangNavigation?.modal);
  assert.equal(f.state.server.me.body,canonical); assert.equal(f.state.successes,1);
  assert.equal(f.state.writes[0].args.p_data.body,original,'the server receives the original draft');
  assert.equal(f.state.writes[0].args.p_action,editing ? 'edit-answer' : 'answer');
  assert.equal(f.state.server.remaining,6);
  f.q('.letter-hero button').click(); await wait(() => f.q('#editor'));
  assert.equal(f.q('#editor').value,canonical);
  assert.equal(f.q('#editor').maxLength,223); assert.equal(f.q('.counter').textContent,'219 / 220');
  await f.set(f.q('#editor'),canonical+'나');
  assert.equal(f.q('dialog form button').disabled,false);
  f.q('dialog form').requestSubmit(); await wait(() => !f.q('dialog'));
  assert.equal(f.state.writes[1].args.p_data.previousBody,canonical);
  assert.equal(f.state.server.me.body,canonical+'나'); assert.equal(f.state.successes,2);
});

test('first participation still uses the consented basic form, then the combined editor opens',async t=>{
  const f=await fixture(t,{setup:true});
  f.q('.letter-hero button').click();
  await wait(()=>f.q('.public-profile-form .profile-intent-field'));
  await f.set(f.control('닉네임'),'새 금칙');
  f.q('button[aria-label="친구"]').click();await turn();
  await f.set(f.q('.checkrow input'),true);
  f.q('.public-profile-form').requestSubmit();
  await wait(()=>!f.q('dialog')&&!f.w.history.state?.pajangNavigation?.modal);
  assert.equal(f.state.writes.length,1);
  assert.equal(f.state.writes[0].name,'pajang_profile_save');
  assert.equal(f.state.writes[0].args.p_setup,true);
  assert.equal(f.state.server.me.name,'새 ❤️❤️');
  await openPublicProfile(f);
  assert.equal(f.control('닉네임').value,'새 ❤️❤️');
  assert.equal(f.q('.unified-profile-editor .profile-intent-field')!==null,true);
  f.q('dialog [aria-label="닫기"]').click();
  await wait(()=>!f.q('dialog'));
});

test('one Pajang profile editor preserves masked public fields, tastes and exchange-only details together',async t=>{
  const f=await fixture(t);
  await openPublicProfile(f);
  await f.set(f.control('닉네임'),'새 금칙');
  f.q('button[aria-label="친구"]').click();await turn();
  f.q('button[aria-label="차분한 대화"]').click();await turn();
  const custom='가'.repeat(38)+'금칙';
  await f.set(f.control('만남 스타일 직접 입력'),custom);
  await f.set(f.control('관계에서 중요한 것 직접 입력'),'연락은 hello@example.com');
  await f.set(f.control('자기소개'),'교환 후 금칙 소개');
  f.q('.exchange-editor').requestSubmit();
  await wait(()=>!f.q('dialog')&&!f.w.history.state?.pajangNavigation?.modal);
  assert.equal(f.state.successes,1);
  assert.equal(f.state.writes.length,1);
  assert.equal(f.state.writes[0].name,'pajang_profile_details');
  assert.equal(f.state.writes[0].args.p_action,'save');
  assert.equal(f.state.writes[0].args.p_data.name,'새 금칙');
  assert.deepEqual(f.state.writes[0].args.p_data.preferences.relationship_intents,['friendship']);
  assert.deepEqual(f.state.preferences.relationship_intents,['friendship']);
  assert.deepEqual(f.state.preferences.meeting_styles,['deep_talk']);
  assert.deepEqual(f.state.preferences.custom.meeting_styles,[mask(custom)]);
  assert.deepEqual(f.state.preferences.custom.relationship_values,['연락은 hello@example.com']);
  assert.equal(f.state.server.me.name,'새 ❤️❤️');
  assert.equal(f.state.exchange.fields.bio,'교환 후 ❤️❤️ 소개');
  await openPublicProfile(f);
  assert.equal(f.control('닉네임').value,'새 ❤️❤️');
  assert.equal(f.q('button[aria-label="친구"]').getAttribute('aria-pressed'),'true');
  assert.equal(f.q('button[aria-label="차분한 대화"]').getAttribute('aria-pressed'),'true');
  await f.set(f.control('만남 스타일 직접 입력'),mask(custom)+'나');
  f.q('.exchange-editor').requestSubmit();
  await wait(()=>!f.q('dialog'));
  assert.deepEqual(f.state.preferences.custom.meeting_styles,[mask(custom),mask(custom)+'나']);
  assert.equal(f.state.exchange.fields.religion,'천주교');
});

for (const freeRemaining of [2,0]) test(`a masked signal sends once using ${freeRemaining ? 'free' : 'paid'} quota without another purchase`, async t => {
  const f = await fixture(t,{freeRemaining});
  await wait(() => f.q('#answers .sendlink'));
  f.q('#answers .sendlink').click(); await wait(() => f.q('#editor'));
  await f.set(f.q('#editor'),'함께 금칙 산책해요.');
  f.q('dialog form').requestSubmit(); f.q('dialog form').requestSubmit();
  await wait(() => f.q('.result'));
  assert.equal(f.state.server.signals.length,1); assert.equal(f.state.writes.length,1);
  assert.equal(f.state.server.signals[0].note,'함께 ❤️❤️ 산책해요.');
  assert.deepEqual([f.state.server.remaining,f.state.server.freeRemaining,f.state.server.paidRemaining],freeRemaining ? [5,1,4] : [3,0,3]);
  assert.equal(f.state.coins,150); assert.deepEqual(f.state.balanceEvents,[]);
  assert.equal(f.state.calls.some(call => call.name === 'pajang_signal_purchase'),false);
  f.button('보낸 신호 보기').click(); await wait(() => f.q('.listperson p'));
  assert.equal(f.q('.listperson p').textContent,'함께 ❤️❤️ 산책해요.');
});

test('a lost reply after masked chat delivery retries the same UUID and displays one canonical message', async t => {
  const f = await fixture(t,{chat:true});
  let lost=false;
  f.state.afterWrite=action=>{if(action==='message'&&!lost){lost=true;return {data:null,error:copy(networkError)};}};
  await f.set(f.control('메시지'),'보내려던 금칙 대화'); f.q('.composer').requestSubmit();
  await wait(() => f.alert());
  assert.equal(f.control('메시지').value,'보내려던 금칙 대화');
  assert.equal(f.q('.bubbleline'),null); assert.equal(f.state.messages.length,1);
  f.q('.composer').requestSubmit(); await wait(() => f.q('.bubbleline'));
  assert.equal(f.state.writes[0].args.p_data.id,f.state.writes[1].args.p_data.id);
  assert.equal(f.control('메시지').value,''); assert.equal(f.state.messages.length,1);
  assert.equal(f.q('.bubbleline p').textContent,'보내려던 ❤️❤️ 대화');
  assert.equal(f.state.successes,1); assert.equal(f.state.server.remaining,6);
});

test('exchange profiles accept a matching masking receipt and display the canonical fields with height and religion intact', async t => {
  const f = await fixture(t,{mode:'exchange'});
  await f.set(f.control('직업'),'금칙 책방지기');
  await f.set(f.control('자기소개'),'첫 금칙 · 둘째 금칙 / 연락: hello@example.com, 010-1234-5678');
  await f.set(f.control('키 (cm)'),'175.5');
  await f.set(f.control('나이'),true);
  f.q('.exchange-editor').requestSubmit();
  await wait(() => f.state.saved && f.control('직업').value === f.state.exchange.fields.job,
    'the saved profile should finish rendering before its canonical fields are checked');
  assert.equal(f.alert(),null); assert.equal(f.state.successes,1);
  assert.equal(f.control('직업').value,'❤️❤️ 책방지기');
  assert.equal(f.control('자기소개').value,'첫 ❤️❤️ · 둘째 ❤️❤️ / 연락: hello@example.com, 010-1234-5678');
  assert.equal(f.control('나의 신앙 (선택)').value,'천주교'); assert.equal(f.control('나이').checked,true);
  assert.equal(f.control('키 (cm)').value,'175.5');
});

for (const [name,alter] of [
  ['missing receipt',data=>delete data.masking],
  ['different submitted text',data=>{data.masking.bio.submitted='another request';}],
  ['different receipt output',data=>{data.masking.bio.saved='another response';}],
  ['plain text loss',data=>{data.fields.bio='내용이 지워짐';data.masking.bio.saved=data.fields.bio;}],
  ['missing religion',data=>delete data.fields.religion],
  ['changed height',data=>{data.fields.height=180;}],
  ['changed age visibility',data=>{data.showAge=false;}],
]) test(`exchange masking does not hide ${name}`, async t => {
  const f = await fixture(t,{mode:'exchange'});
  await f.set(f.control('자기소개'),'금칙 소개'); await f.set(f.control('키 (cm)'),'175.5');
  await f.set(f.control('나이'),true);
  f.state.afterWrite=(action,result)=>{if(action==='exchange')alter(result.data);return result;};
  f.q('.exchange-editor').requestSubmit(); await wait(() => f.alert());
  assert.equal(f.state.saved,undefined); assert.equal(f.control('자기소개').value,'금칙 소개');
  assert.equal(f.control('나의 신앙 (선택)').value,'천주교'); assert.equal(f.control('키 (cm)').value,'175.5');
});

test('masked suggestions succeed once and the real daily limit still preserves the draft', async t => {
  const f = await fixture(t,{mode:'suggestion'});
  await f.set(f.q('textarea'),'함께 나누고 싶은 금칙 질문');
  f.state.reject = {code:'22023',message:'하루에 문의는 3건까지 가능해요'};
  f.q('form').requestSubmit(); await wait(() => f.alert()?.textContent.includes('24시간 동안 합쳐서 3개'));
  assert.equal(f.q('textarea').value,'함께 나누고 싶은 금칙 질문');
  f.state.reject = null; f.q('form').requestSubmit(); await wait(() => f.state.saved);
  assert.equal(f.state.writes[0].args.p_request_id,f.state.writes[1].args.p_request_id);
  assert.equal(f.state.writes[0].headers.Authorization,'Bearer fixture-token');
  assert.deepEqual([...f.state.inquiries.values()],['[파장 · 오늘의 질문 제안]\n함께 나누고 싶은 ❤️❤️ 질문']);
  assert.equal(f.q('textarea').value,''); assert.equal(f.state.successes,1);
});

for (const kind of ['answer','signal','chat','public','exchange','suggestion']) test(`${kind} keeps the draft on a genuine network error`, async t => {
  const f = await fixture(t,{mode:kind==='exchange'||kind==='suggestion'?kind:'station',chat:kind==='chat'});
  let input,form;
  if(kind==='public'){
    await openPublicProfile(f);input=f.control('닉네임');form=f.q('.public-profile-form');
  }else if(kind==='answer'||kind==='signal'){
    if(kind==='signal'){await wait(()=>f.q('#answers .sendlink'));f.q('#answers .sendlink').click();}
    else f.q('.letter-hero button').click();
    await wait(()=>f.q('#editor'));input=f.q('#editor');form=f.q('dialog form');
  }else if(kind==='chat'){input=f.control('메시지');form=f.q('.composer');}
  else{input=f.q('textarea');form=f.q('form');}
  await f.set(input,'다시 보낼 금칙 초안');f.state.reject=copy(networkError);
  await f.failed(form);
  assert.equal(input.value,'다시 보낼 금칙 초안');
  assert.equal(f.state.server.remaining,6);assert.equal(f.state.coins,150);
});

let entryBundle;
function bundleEntry() {
  return entryBundle ||= build({entryPoints:[path.join(feature,'entry.mjs')],bundle:true,write:false,format:'esm',platform:'browser',
    plugins:[{name:'entry-fixtures',setup(build){
      build.onResolve({filter:/^\.\/(member|load-station|entry-design|location|preview)\.mjs(\?.*)?$/}, args => ({path:args.path.split('?')[0],namespace:'entry-fixture'}));
      build.onLoad({filter:/.*/,namespace:'entry-fixture'}, ({path:filename}) => ({loader:'js',contents:
        filename === './member.mjs' ? `
          export const client=async()=>window.entryFixture.db;
          export const call=(...args)=>window.entryFixture.call(...args);
          export const sameMember=async()=>true;
          export const answeredRound=()=>undefined;
          export const showGate=message=>{throw Error(message);};
          export async function requireMember(choose,onClient,onResult){
            choose('auth-member');onClient(window.entryFixture.db);onResult(window.entryFixture.entry);
            return window.entryFixture.entry;
          }
        ` : filename === './load-station.mjs' ? `
          export const prepareProgram=async()=>({});
          export async function mountStation(before,saved){await before();window.entryFixture.handoffs.push(saved);}
        ` : filename === './entry-design.mjs' ? 'export const enhanceGuestGate=()=>{};' :
          filename === './location.mjs' ? 'export const prepareLocation=async()=>{};' : 'export const setQuestion=()=>{};',
      }));
    }}],
  }).then(result => result.outputFiles[0].text);
}

for (const scenario of [{joined:false,view:'write',action:'join'},{joined:true,view:'write',action:'answer'},{joined:false,view:'feed',action:'participate'}])
  test(`entry ${scenario.action} hands off canonical masks after a recoverable network failure`, async t => {
    const dom = new JSDOM(await fs.readFile(path.join(feature,'index.html'),'utf8'),{
      url:'https://content.test/features/pajang/?view='+scenario.view,runScripts:'outside-only',pretendToBeVisual:true,
    });
    const w = dom.window, document = w.document;
    t.after(() => {w.dispatchEvent(new w.Event('pagehide'));w.close();});
    w.scrollTo=()=>{};
    w.fetch=async url=>{assert.match(url,/regions\.json/);return {ok:true,json:async()=>({'서울특별시':[]})};};
    const state = w.entryFixture = {
      entry:{joined:scenario.joined,body:'',nickname:'가'.repeat(11)+'❤️❤️',day:'2026-11-19',slot:'am',nextAt:new Date(Date.now()+3600000).toISOString(),question:{id:9,q:['함께 무엇을 하고 싶나요?']}},
      db:{auth:{getSession:async()=>({data:{session:{user:{id:'auth-member'}}}})}},
      calls:[],handoffs:[],reject:true,
      async call(action,data){
        state.calls.push({action,data:copy(data)});
        if(state.reject)throw Object.assign(new w.Error(networkError.message),{code:networkError.code});
        return {authenticated:true,me:{id:'member-one',name:mask(data.name||'보리'),body:mask(data.body||'')}};
      },
    };
    await w.eval('(async()=>{\n'+await bundleEntry()+'\n})()');
    const form = document.querySelector('#answer-form'), mine=document.querySelector('#mine');
    assert.equal(form.hidden,false);
    mine.value='작성 중인 답변';
    if(!scenario.joined){
      assert.equal(form.elements.namedItem('name').maxLength,15,'a masked member nickname can still be edited');
      form.elements.namedItem('name').value='새 금칙';form.elements.consent.checked=true;
    }
    form.requestSubmit();
    await wait(()=>document.querySelector('#my-answer').textContent===networkError.message);
    assert.equal(mine.value,'작성 중인 답변');
    assert.equal(form.hidden,false);assert.equal(document.querySelector('#welcome').hidden,false);
    assert.equal(form.querySelector('[type="submit"]').disabled,false);
    assert.deepEqual(state.handoffs,[]);assert.equal(state.calls[0].action,scenario.action);
    if(!scenario.joined){assert.equal(form.elements.namedItem('name').value,'새 금칙');assert.equal(form.elements.consent.checked,true);}
    state.reject=false;mine.value='수정한 금칙 답변';form.requestSubmit();
    await wait(()=>document.querySelector('link[rel="stylesheet"][href*="station.css"]'));
    document.querySelector('link[rel="stylesheet"][href*="station.css"]').dispatchEvent(new w.Event('load'));
    await wait(()=>state.handoffs.length===1);
    assert.equal(state.calls.length,2);
    assert.equal(state.calls[1].data.body,scenario.view==='feed'?undefined:'수정한 금칙 답변');
    assert.equal(state.handoffs[0].me.body,scenario.view==='feed'?'':'수정한 ❤️❤️ 답변');
    assert.equal(state.handoffs[0].me.name,scenario.joined?'보리':'새 ❤️❤️');
  });
