const assert=require('node:assert/strict');
const path=require('node:path');
const test=require('node:test');
const {JSDOM,VirtualConsole}=require('jsdom');
const {buildSync}=require('../features/pajang/node_modules/esbuild');

const program=buildSync({stdin:{resolveDir:path.resolve(__dirname,'../features/pajang'),loader:'tsx',contents:`
  import {createRoot} from 'react-dom/client';
  import {QuestionSuggestionForm} from './src/app/question-suggestion';
  const root=createRoot(document.getElementById('root'));
  window.renderSuggestion=period=>root.render(<QuestionSuggestionForm period={period}
    onBusyChange={window.suggestionBusy} onSaved={window.suggestionSaved}/>);
  window.closeSuggestion=()=>root.render(null);
  window.disposeSuggestion=()=>root.unmount();
`},bundle:true,write:false,format:'iife',target:'es2022',jsx:'automatic',
  define:{'process.env.NODE_ENV':'"production"'}}).outputFiles[0].text;

const clone=value=>JSON.parse(JSON.stringify(value));
const turn=()=>new Promise(resolve=>setTimeout(resolve,10));
const upcoming={day:'2026-11-22',slot:'pm',startsAt:'2026-11-22T09:00:00Z',
  prompt:'계획이 갑자기 바뀌면 어떻게 하나요?'};
const following={day:'2026-11-23',slot:'am',startsAt:'2026-11-22T21:00:00Z',
  prompt:'친구에게 서운한 일이 생기면 어떻게 이야기하나요?'};
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}

// The real form and account helper use only these local auth/RPC fixtures.
// A held request deliberately ignores cancellation so late-result guards are exercised.
async function fixture(t,{preview,identity,period='2026-11-22:am'}={}){
  const errors=[],console=new VirtualConsole();console.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{
    url:'https://pajang.test/features/pajang/station.html',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console});
  const w=dom.window,listeners=new Set();
  const state={calls:[],writes:[],busy:[],saved:0,authReads:0,
    session:{access_token:'owner-token',user:{id:'auth-owner',is_anonymous:false}}};
  state.changeUser=(id,notify=true)=>{
    state.session=id?{access_token:id+'-token',user:{id,is_anonymous:false}}:null;
    if(notify)for(const listener of listeners)listener(id?'SIGNED_IN':'SIGNED_OUT',clone(state.session));
  };
  w.suggestionBusy=value=>state.busy.push(value);
  w.suggestionSaved=()=>state.saved++;
  const db={auth:{
    async getSession(){
      const count=++state.authReads;
      return identity?identity(state,count):{data:{session:clone(state.session)},error:null};
    },
    onAuthStateChange(listener){listeners.add(listener);return {data:{subscription:{unsubscribe(){listeners.delete(listener);}}}};}
  },rpc(name,args){
    let signal,pending;const headers={};
    const query={
      setHeader(key,value){headers[key]=value;return query;},
      abortSignal(value){signal=value;return query;},
      then(resolve,reject){
        if(!pending)pending=Promise.resolve().then(()=>{
          const call={name,args:clone(args),headers:clone(headers),signal};state.calls.push(call);
          assert.equal(name,'pajang_next_question');
          return preview?preview(call,state.calls.length):{data:clone(upcoming),error:null};
        });
        return pending.then(resolve,reject);
      }
    };
    return query;
  },schema(name){state.writes.push(name);throw Error('Preview must not submit an inquiry');}};
  w.OjjudaGetClient=async()=>db;w.eval(program);
  t.after(()=>{w.disposeSuggestion();w.close();assert.deepEqual(errors,[]);});
  const form=()=>w.document.querySelector('.question-suggestion-form');
  const textarea=()=>w.document.querySelector('#question-suggestion-body');
  const section=()=>w.document.querySelector('section[aria-label="다음 질문"]');
  const prompt=()=>section()?.querySelector('.questionbox p')?.textContent;
  const submit=()=>form()?.querySelector('button[type="submit"]');
  async function until(check){
    for(let n=0;n<200;n++){if(check())return;await turn();}
    assert.fail('Question preview did not settle: '+w.document.body.textContent+'\n'+errors.join('\n'));
  }
  async function input(value){
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(textarea(),value);
    textarea().dispatchEvent(new w.InputEvent('input',{bubbles:true,inputType:'insertText'}));
    await turn();
  }
  w.renderSuggestion(period);
  await until(()=>textarea()&&listeners.size===1&&!form().querySelector('[role="status"]'));
  return {w,state,listeners,form,textarea,section,prompt,submit,until,input};
}

test('the server preview shows its question and start time without prefilling or submitting a suggestion',async t=>{
  const pending=deferred();
  const f=await fixture(t,{preview:()=>pending.promise});
  await f.until(()=>f.state.calls.length===1);
  assert.equal(f.textarea().value,'');
  assert.equal(f.textarea().placeholder,'추천하고 싶은 질문을 적어 주세요.');
  assert.match(f.section().textContent,/불러오는 중/);
  assert.equal(f.submit().disabled,true);
  const request=f.state.calls[0];
  assert.equal(request.name,'pajang_next_question');
  assert.deepEqual(request.args,{},'the server chooses the next slot; the client supplies no date or question');
  assert.deepEqual(request.headers,{Authorization:'Bearer owner-token'});
  assert.ok(request.signal instanceof f.w.AbortSignal);
  pending.resolve({data:clone(upcoming),error:null});
  await f.until(()=>f.prompt()===upcoming.prompt);
  assert.equal(f.section().querySelector('time').getAttribute('datetime'),upcoming.startsAt);
  assert.equal(f.section().querySelector('time').textContent,'2026.11.22 · 오후');
  assert.equal(f.textarea().value,'','the next question is information, not a suggested draft');
  assert.equal(f.submit().disabled,true);
  assert.deepEqual(f.state.writes,[]);assert.deepEqual(f.state.busy,[]);assert.equal(f.state.saved,0);
});

test('a preview error and explicit retry preserve the exact editable suggestion draft',async t=>{
  const first=deferred(),second=deferred();
  const f=await fixture(t,{preview:(_call,count)=>count===1?first.promise:second.promise});
  await f.until(()=>f.state.calls.length===1);
  const draft='  내가 추천할 질문\n어떤 선택을 하는 편인가요?  ';
  await f.input(draft);
  first.resolve({data:null,error:{code:'XX000',message:'connection unavailable'}});
  await f.until(()=>f.section()?.querySelector('button'));
  assert.equal(f.textarea().value,draft);assert.equal(f.textarea().disabled,false);
  assert.equal(f.submit().disabled,false,'preview failure does not block submitting an original question');
  const retry=f.section().querySelector('button');
  assert.equal(retry.type,'button');assert.equal(retry.textContent,'다시 보기');
  retry.click();await f.until(()=>f.state.calls.length===2);
  assert.equal(f.textarea().value,draft);assert.match(f.section().textContent,/불러오는 중/);
  second.resolve({data:clone(upcoming),error:null});
  await f.until(()=>f.prompt()===upcoming.prompt);
  assert.equal(f.textarea().value,draft);assert.equal(f.submit().disabled,false);
  assert.deepEqual(f.state.writes,[]);assert.equal(f.state.saved,0);
});

test('a changed session is rejected before the next-question RPC can use another member token',async t=>{
  const f=await fixture(t,{identity:(state,count)=>{
    if(count===2)state.changeUser('other-account',false);
    return {data:{session:clone(state.session)},error:null};
  }});
  await f.until(()=>f.section()?.querySelector('button'));
  assert.equal(f.state.calls.length,0,'a fresh session must still belong to the member who opened the form');
  assert.equal(f.prompt(),undefined);
  assert.equal(f.textarea().value,'');
  assert.deepEqual(f.state.writes,[]);
});

test('switching accounts clears the draft and hides a late previous-member preview',async t=>{
  const pending=deferred();
  const f=await fixture(t,{preview:()=>pending.promise});
  await f.until(()=>f.state.calls.length===1);await f.input('이전 계정의 작성 중인 질문');
  f.state.changeUser('other-account');
  await f.until(()=>f.textarea().disabled&&f.section()===null);
  assert.equal(f.textarea().value,'');assert.equal(f.submit().disabled,true);
  assert.match(f.form().querySelector('[role="alert"]').textContent,/계정이 바뀌었어요/);
  assert.equal(f.state.calls[0].signal.aborted,true);
  pending.resolve({data:clone(upcoming),error:null});await turn();await turn();
  assert.equal(f.section(),null);assert.equal(f.state.calls.length,1);
  assert.equal(f.w.document.body.textContent.includes(upcoming.prompt),false);
  assert.deepEqual(f.state.writes,[]);assert.equal(f.state.saved,0);
});

test('closing and reopening for another member ignores the closed form response',async t=>{
  const old=deferred();
  const f=await fixture(t,{preview:(_call,count)=>count===1?old.promise:{data:clone(following),error:null}});
  await f.until(()=>f.state.calls.length===1);await f.input('닫힌 창에만 있던 질문');
  f.w.closeSuggestion();await f.until(()=>f.form()===null&&f.listeners.size===0);
  assert.equal(f.state.calls[0].signal.aborted,true);
  f.state.changeUser('new-member');f.w.renderSuggestion('2026-11-22:pm');
  await f.until(()=>f.prompt()===following.prompt);
  assert.equal(f.state.calls.length,2);
  assert.equal(f.state.calls[1].headers.Authorization,'Bearer new-member-token');
  assert.equal(f.textarea().value,'');
  old.resolve({data:clone(upcoming),error:null});await turn();await turn();
  assert.equal(f.prompt(),following.prompt,'the closed form cannot replace the new member preview');
  assert.equal(f.textarea().value,'');assert.deepEqual(f.state.writes,[]);
});

test('a new period refreshes the next question while keeping the existing suggestion draft',async t=>{
  const next=deferred();
  const f=await fixture(t,{preview:(_call,count)=>count===1?{data:clone(upcoming),error:null}:next.promise});
  await f.until(()=>f.prompt()===upcoming.prompt);
  const draft='바뀌는 시간대에도 계속 다듬고 있는 질문';await f.input(draft);
  f.w.renderSuggestion('2026-11-22:pm');await f.until(()=>f.state.calls.length===2);
  assert.equal(f.prompt(),undefined,'the previous next-question label is cleared while the new period loads');
  assert.equal(f.textarea().value,draft);
  next.resolve({data:clone(following),error:null});await f.until(()=>f.prompt()===following.prompt);
  assert.equal(f.section().querySelector('time').textContent,'2026.11.23 · 오전');
  assert.equal(f.textarea().value,draft);assert.equal(f.submit().disabled,false);
  f.w.renderSuggestion('2026-11-22:pm');await turn();await turn();
  assert.equal(f.state.calls.length,2,'rerendering the same period does not repeat the preview read');
  assert.deepEqual(f.state.calls[1].args,{});assert.deepEqual(f.state.writes,[]);
});

test('a late previous-period preview cannot overwrite the new period or its draft',async t=>{
  const old=deferred(),current=deferred();
  const f=await fixture(t,{preview:(_call,count)=>count===1?old.promise:current.promise});
  await f.until(()=>f.state.calls.length===1);await f.input('시간이 바뀌어도 남겨 둘 질문');
  f.w.renderSuggestion('2026-11-22:pm');await f.until(()=>f.state.calls.length===2);
  assert.equal(f.state.calls[0].signal.aborted,true);
  current.resolve({data:clone(following),error:null});await f.until(()=>f.prompt()===following.prompt);
  old.resolve({data:clone(upcoming),error:null});await turn();await turn();
  assert.equal(f.prompt(),following.prompt);
  assert.equal(f.textarea().value,'시간이 바뀌어도 남겨 둘 질문');
  assert.equal(f.state.calls.length,2);assert.deepEqual(f.state.writes,[]);
});
