const assert=require('node:assert/strict');
const path=require('node:path');
const {createRequire}=require('node:module');
const test=require('node:test');
const {JSDOM}=require('jsdom');
const feature=path.resolve(__dirname,'../features/pajang');
const {build}=createRequire(path.join(feature,'package.json'))('esbuild');
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
const turn=()=>new Promise(resolve=>setTimeout(resolve,10));
async function wait(check,message='expected interaction state'){
  for(let i=0;i<200;i++){if(check())return;await turn();}
  assert.ok(check(),message);
}
let bundled;
function bundle(){return bundled??=build({stdin:{resolveDir:feature,loader:'tsx',contents:`
  import {createRoot} from 'react-dom/client';
  import {AnswerLike,AnswerLikesProvider,useAnswerLikes} from './src/app/answer-likes';
  import {PastQuestions,PastAnswerForm} from './src/app/past-questions';
  const root=createRoot(document.getElementById('root'));
  function Copies(){const likes=useAnswerLikes();window.likeCheckpoint=()=>likes.checkpoint();window.hydrateLikes=(rows,version)=>likes.hydrate(rows,version);
    return <><AnswerLike answer={window.answer}/><AnswerLike answer={{...window.answer}}/></>;
  }
  window.renderFixture=()=>root.render(window.mode==='likes'
    ?<AnswerLikesProvider key={window.member+window.generation} owner={window.member}><Copies/></AnswerLikesProvider>
    :window.mode==='list'?<PastQuestions key={window.member} owner={window.member} revision={window.revision} onChoose={window.choose}/>
    :<PastAnswerForm key={window.member+window.generation} owner={window.member} question={window.question}
      onBusyChange={window.busy} onDirtyChange={window.dirty} onSaved={window.saved} onExisting={window.existing} onMyAnswers={window.myAnswers}/>);
  window.unmountFixture=()=>root.unmount();window.renderFixture();
`},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
  .then(result=>result.outputFiles[0].text);}

async function fixture(t,{mode='likes',rpc,question={},shortTimeout=false}={}){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{
    url:'https://pajang.test/features/pajang/station.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,listeners=new Set();
  const state={calls:[],chosen:[],busy:[],dirty:[],saved:0,existing:[],myAnswers:0,
    liked:false,likeCount:2,session:{access_token:'owner-token',user:{id:'auth-owner',is_anonymous:false}}};
  w.mode=mode;w.member='person-owner';w.generation=0;w.revision=0;
  w.answer={peer:'person-peer',day:'2026-11-18',slot:'am',liked:false,likeCount:2};
  w.question={day:'2026-11-17',slot:'pm',question:'약속이 갑자기 취소되면 보통 무엇을 하나요?',answered:false,...question};
  w.choose=value=>state.chosen.push(clone(value));w.busy=value=>state.busy.push(value);w.dirty=value=>state.dirty.push(value);
  w.saved=()=>{state.saved++;return true;};w.existing=value=>state.existing.push(clone(value));w.myAnswers=()=>state.myAnswers++;
  state.changeUser=(id,notify=true)=>{
    state.session=id?{access_token:id+'-token',user:{id,is_anonymous:false}}:null;
    if(notify)for(const listener of listeners)listener(id?'SIGNED_IN':'SIGNED_OUT',state.session);
  };
  const originalTimeout=w.setTimeout.bind(w);
  w.setTimeout=(fn,delay,...args)=>originalTimeout(fn,shortTimeout&&delay===15000?40:delay,...args);
  const db={auth:{getSession:async()=>({data:{session:clone(state.session)},error:null}),
    onAuthStateChange(listener){listeners.add(listener);return {data:{subscription:{unsubscribe(){listeners.delete(listener);}}}};}},
    rpc(name,args){
      let signal,pending;const headers={};
      const query={setHeader(key,value){headers[key]=value;return query;},abortSignal(value){signal=value;return query;},
        then(resolve,reject){
          if(!pending)pending=Promise.resolve().then(()=>{
            state.calls.push({name,args:clone(args),headers:clone(headers),signal});
            const response=Promise.resolve().then(()=>{
              const custom=rpc?.(name,args,state,signal);if(custom!==undefined)return custom;
              if(name==='pajang_answer_like'){
                if(state.liked!==args.p_liked)state.likeCount+=args.p_liked?1:-1;
                state.liked=args.p_liked;
                return {data:{peer:args.p_peer,day:args.p_day,slot:args.p_slot,liked:state.liked,likeCount:state.likeCount}};
              }
              if(name==='pajang_past_questions')return {data:{items:[clone(w.question)],nextCursor:null}};
              if(name==='pajang_my_answers')return {data:[]};
              if(name==='pajang_answer_past_question')return {data:{day:args.p_day,slot:args.p_slot,question:args.p_question,body:args.p_body,saved:true,alreadyAnswered:false}};
              throw Error('Unexpected RPC '+name);
            });
            if(!signal)return response;
            return Promise.race([response,new Promise(done=>{
              const aborted=()=>done({error:{message:'AbortError'}});
              if(signal.aborted)aborted();else signal.addEventListener('abort',aborted,{once:true});
            })]);
          });return pending.then(resolve,reject);
        }};return query;
    }};
  w.OjjudaGetClient=async()=>db;w.eval(await bundle());
  t.after(()=>{w.unmountFixture();w.close();});
  const likes=()=>[...w.document.querySelectorAll('.answer-like')];
  const form=()=>w.document.querySelector('.past-answer-form');
  const textarea=()=>w.document.querySelector('#past-answer-body');
  const submitButton=()=>form()?.querySelector('button[type="submit"]');
  const alert=()=>w.document.querySelector('[role="alert"]');
  const input=async value=>{
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(textarea(),value);
    textarea().dispatchEvent(new w.InputEvent('input',{bubbles:true,inputType:'insertText'}));await turn();
  };
  const submit=()=>form().dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>mode==='likes'?likes().length===2&&!likes()[0].disabled:
    mode==='list'?w.document.querySelector('.past-question-list')||alert():textarea()&&!form().querySelector('[role="status"]'));
  return {w,state,likes,form,textarea,submitButton,alert,input,submit};
}

test('likes are desired-state, account-pinned, and synchronized across duplicate cards',async t=>{
  let finish;
  const f=await fixture(t,{rpc:(name,args)=>name==='pajang_answer_like'&&args.p_liked
    ?new Promise(resolve=>{finish=()=>resolve({data:{peer:args.p_peer,day:args.p_day,slot:args.p_slot,liked:true,likeCount:3}});}):undefined});
  assert.ok(f.likes().every(button=>button.textContent==='2'&&button.querySelector('svg[aria-hidden="true"]')),
    'compact likes show the heart icon and count');
  assert.ok(f.likes().every(button=>button.getAttribute('aria-label')==='좋아요 2개'&&button.getAttribute('aria-pressed')==='false'),
    'the compact control keeps a complete accessible name and state');
  const readBefore=f.w.likeCheckpoint();
  f.likes()[0].click();f.likes()[1].click();await wait(()=>f.state.calls.length===1);
  assert.ok(f.likes().every(button=>button.disabled&&button.getAttribute('aria-busy')==='true'));
  assert.deepEqual(f.state.calls[0].args,{p_peer:'person-peer',p_day:'2026-11-18',p_slot:'am',p_liked:true,p_expected_person:'person-owner'});
  assert.equal(f.state.calls[0].headers.Authorization,'Bearer owner-token');
  finish();await wait(()=>f.likes().every(button=>button.getAttribute('aria-pressed')==='true'));
  f.w.hydrateLikes([{...f.w.answer,likeCount:2,liked:false}],readBefore);await turn();
  assert.ok(f.likes().every(button=>button.textContent==='3'&&button.getAttribute('aria-label')==='좋아요 3개, 취소하기'));
  f.w.hydrateLikes([{...f.w.answer,likeCount:8,liked:true}],f.w.likeCheckpoint());await turn();
  assert.ok(f.likes().every(button=>button.textContent==='8'&&button.getAttribute('aria-label')==='좋아요 8개, 취소하기'));
  f.state.liked=true;f.state.likeCount=8;f.likes()[1].click();await wait(()=>f.state.calls.length===2&&!f.likes()[0].disabled);
  assert.equal(f.state.calls[1].args.p_liked,false);assert.ok(f.likes().every(button=>button.textContent==='7'&&button.getAttribute('aria-label')==='좋아요 7개'));
});

test('a lost like response keeps the count, retries the same intention once, and restores on remount',async t=>{
  let attempts=0;
  const f=await fixture(t,{rpc:(name,_args,state)=>{
    if(name==='pajang_answer_like'&&++attempts===1){state.liked=true;state.likeCount=3;return {error:{message:'offline'}};}
  }});
  f.likes()[0].click();await wait(()=>f.w.document.querySelector('.answer-like-error'));
  assert.equal(f.likes()[0].textContent,'2');assert.equal(f.likes()[0].getAttribute('aria-pressed'),'false');
  f.likes()[1].click();await wait(()=>f.likes()[0].getAttribute('aria-pressed')==='true');
  assert.deepEqual(f.state.calls.map(call=>call.args.p_liked),[true,true]);
  f.w.answer={...f.w.answer,liked:true,likeCount:3};f.w.generation++;f.w.renderFixture();
  await wait(()=>!f.likes()[0].disabled);assert.equal(f.likes()[0].textContent,'3');assert.equal(f.likes()[0].getAttribute('aria-pressed'),'true');
});

test('likes reject a silent account switch and ignore an old member response',async t=>{
  const silent=await fixture(t);silent.state.changeUser('another-user',false);silent.likes()[0].click();
  await wait(()=>silent.w.document.querySelector('.answer-like-error'));
  assert.equal(silent.state.calls.length,0);assert.ok(silent.likes().every(button=>button.disabled));
  let finish;
  const f=await fixture(t,{rpc:(name,args)=>name==='pajang_answer_like'?new Promise(resolve=>{
    finish=()=>resolve({data:{peer:args.p_peer,day:args.p_day,slot:args.p_slot,liked:true,likeCount:3}});
  }):undefined});
  f.likes()[0].click();await wait(()=>f.state.calls.length===1);f.state.changeUser('new-user');
  f.w.member='new-person';f.w.answer={...f.w.answer,liked:false,likeCount:5};f.w.renderFixture();
  await wait(()=>!f.likes()[0].disabled&&f.likes()[0].textContent==='5');
  finish();await turn();assert.equal(f.likes()[0].textContent,'5');assert.equal(f.likes()[0].getAttribute('aria-pressed'),'false');
  assert.equal(f.state.calls[0].signal.aborted,true);
});

test('past questions include unanswered questions, paginate, and reopen with answer state',async t=>{
  const first=Array.from({length:24},(_,i)=>({day:'2026-11-'+String(20-Math.floor(i/2)).padStart(2,'0'),slot:i%2?'am':'pm',question:'내 생각을 묻는 질문 '+i,answered:false,body:null,canEdit:false}));
  let updated=false;
  const f=await fixture(t,{mode:'list',rpc:(name,args)=>name==='pajang_past_questions'?{data:args.p_cursor
    ?{items:[{day:'2026-11-08',slot:'pm',question:'이전 질문',answered:true,body:'내 답변',canEdit:true}],nextCursor:null}
    :{items:first.map((row,i)=>i===0&&updated?{...row,answered:true,body:'새 답변',canEdit:true}:row),nextCursor:{day:'2026-11-09',slot:'am'}}}:undefined});
  assert.equal(f.w.document.querySelectorAll('.past-question-list li').length,24);
  f.w.document.querySelector('.past-question-list button').click();assert.equal(f.state.chosen[0].answered,false);
  f.w.document.querySelector('.history-more').click();await wait(()=>f.w.document.querySelectorAll('.past-question-list li').length===25);
  assert.deepEqual(f.state.calls[1].args,{p_cursor:{day:'2026-11-09',slot:'am'}});
  const last=f.w.document.querySelector('.past-question-list li:last-child button');assert.equal(last.textContent,'답변 수정');last.click();assert.equal(f.state.chosen.at(-1).body,'내 답변');
  updated=true;f.w.revision++;f.w.renderFixture();await wait(()=>f.w.document.querySelector('.past-question-list li:first-child button')?.textContent==='답변 수정');
  assert.equal(f.w.document.querySelectorAll('.past-question-list li').length,24);
});

test('past question list can retry and never offers a hidden answer for a second write',async t=>{
  let attempts=0;
  const f=await fixture(t,{mode:'list',rpc:name=>name==='pajang_past_questions'?(++attempts===1?{error:{message:'offline'}}:
    {data:{items:[{day:'2026-11-18',slot:'am',question:'지난 질문',answered:true,body:null,canEdit:false}],nextCursor:null}}):undefined});
  assert.match(f.alert().textContent,/불러오지 못했어요/);f.alert().querySelector('button').click();
  await wait(()=>f.w.document.querySelector('.past-answered'));assert.equal(f.w.document.querySelector('.past-question-list button'),null);
});

test('past answer submits the original question once, with member identity and 220-character validation',async t=>{
  let finish;
  const f=await fixture(t,{mode:'form',rpc:(name,args)=>name==='pajang_answer_past_question'?new Promise(resolve=>{
    finish=()=>resolve({data:{day:args.p_day,slot:args.p_slot,saved:true,alreadyAnswered:false}});
  }):undefined});
  assert.equal(f.submitButton().disabled,true);
  assert.equal(f.form().querySelector('#past-answer-publication').textContent,'질문과 답변은 질문이 올라온 날부터 최대 365일간 파장 회원에게 보여요.');
  await f.input('가'.repeat(221));assert.equal(f.submitButton().disabled,true);f.submit();await turn();assert.equal(f.state.calls.length,0);
  await f.input('  혼자 쉬거나 미뤄 둔 일을 해요.  ');f.submit();f.submit();await wait(()=>f.state.calls.length===1);
  assert.equal(f.textarea().disabled,true);assert.equal(f.submitButton().disabled,true);
  assert.deepEqual(f.state.calls[0].args,{p_day:'2026-11-17',p_slot:'pm',p_question:f.w.question.question,p_body:'혼자 쉬거나 미뤄 둔 일을 해요.',p_expected_person:'person-owner'});
  assert.equal(f.state.calls[0].headers.Authorization,'Bearer owner-token');finish();await wait(()=>f.state.saved===1);
  assert.deepEqual(f.state.busy,[true,false]);assert.equal(f.state.dirty.at(-1),false);
});

test('existing answers found outside the feed page open editing instead of a new write',async t=>{
  const answer={day:'2026-11-17',slot:'pm',question:'원래 질문',body:'이미 쓴 답변'};
  const f=await fixture(t,{mode:'form',question:{answered:undefined},rpc:name=>name==='pajang_my_answers'?{data:[answer]}:undefined});
  assert.deepEqual(f.state.existing,[{...answer,owner:'person-owner'}]);assert.equal(f.state.calls.length,1);assert.equal(f.submitButton().disabled,true);
});

test('past save conflict keeps the draft and links to My Answers; a timeout remains retryable',async t=>{
  const conflict=await fixture(t,{mode:'form',rpc:name=>name==='pajang_answer_past_question'?{error:{code:'PT409'}}:undefined});
  await conflict.input('계속 보관할 초안');conflict.submit();await wait(()=>conflict.alert());
  assert.equal(conflict.textarea().value,'계속 보관할 초안');assert.equal(conflict.submitButton().disabled,true);
  [...conflict.form().querySelectorAll('button')].find(button=>button.textContent==='내 답변 보기').click();assert.equal(conflict.state.myAnswers,1);
  let attempts=0;
  const timeout=await fixture(t,{mode:'form',shortTimeout:true,rpc:name=>name==='pajang_answer_past_question'&&++attempts===1?new Promise(()=>{}):undefined});
  await timeout.input('❤️❤️'.repeat(220));assert.equal(timeout.submitButton().disabled,false);timeout.submit();await wait(()=>timeout.alert());
  assert.equal(timeout.textarea().value,'❤️❤️'.repeat(220));assert.equal(timeout.submitButton().disabled,false);
  timeout.submit();await wait(()=>timeout.state.saved===1);assert.equal(timeout.state.calls.length,2);
});

test('switching accounts during a past save clears the draft and cannot report success',async t=>{
  let finish;
  const f=await fixture(t,{mode:'form',rpc:(name,args)=>name==='pajang_answer_past_question'?new Promise(resolve=>{
    finish=()=>resolve({data:{day:args.p_day,slot:args.p_slot,saved:true}});
  }):undefined});
  await f.input('옮겨지면 안 되는 초안');f.submit();await wait(()=>f.state.calls.length===1);
  f.state.changeUser('new-user');await wait(()=>f.state.busy.at(-1)===false);
  assert.equal(f.textarea().value,'');assert.equal(f.submitButton().disabled,true);assert.equal(f.state.calls[0].signal.aborted,true);
  finish();await turn();assert.equal(f.state.saved,0);assert.match(f.alert().textContent,/계정이 바뀌었어요/);
});
