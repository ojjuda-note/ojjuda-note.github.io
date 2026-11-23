const assert=require('node:assert/strict');
const path=require('node:path');
const {createRequire}=require('node:module');
const test=require('node:test');
const {JSDOM}=require('jsdom');
const feature=path.resolve(__dirname,'../features/pajang');
const {build}=createRequire(path.join(feature,'package.json'))('esbuild');
const clone=value=>JSON.parse(JSON.stringify(value));
const turn=()=>new Promise(resolve=>setTimeout(resolve,10));
async function wait(check,message='expected form state'){
  for(let i=0;i<200;i++){if(check())return;await turn();}
  assert.ok(check(),message);
}
let bundled;
function bundle(){
  return bundled??=build({stdin:{resolveDir:feature,loader:'tsx',contents:`
    import {createRoot} from 'react-dom/client';
    import {AnswerEditForm} from './src/app/answer-edit';
    const root=createRoot(document.getElementById('root'));
    root.render(<AnswerEditForm answer={window.editTarget}
      onBusyChange={window.editBusy} onDirtyChange={window.editDirty} onSaved={window.editSaved}/>);
    window.unmountEdit=()=>root.unmount();
  `},bundle:true,write:false,format:'iife',platform:'browser',jsx:'automatic',
    define:{'process.env.NODE_ENV':'"production"'}}).then(result=>result.outputFiles[0].text);
}

// The production form and account helper run against local auth/RPC fixtures.
// No live account or answer is read or changed.
async function fixture(t,{save,shortTimeout=false,answer={}}={}){
  const dom=new JSDOM('<!doctype html><div id="root"></div>',{
    url:'https://pajang.test/features/pajang/station.html',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,listeners=new Set();
  const state={calls:[],busy:[],dirty:[],saved:[],events:[],timeouts:[],
    session:{access_token:'owner-token',user:{id:'auth-owner',is_anonymous:false}}};
  w.editTarget={owner:'person-owner',day:'2026-11-17',slot:'pm',question:'기억에 남는 순간은?',body:'처음 함께 걸었던 날',...answer};
  const station={authenticated:true,day:'2026-11-19',slot:'am',me:{id:'person-owner',body:'오늘의 답변'}};
  state.success=()=>({data:clone(station),error:null});
  state.changeUser=(id,notify=true)=>{
    state.session=id?{access_token:id+'-token',user:{id,is_anonymous:false}}:null;
    if(notify)for(const listener of listeners)listener(id?'SIGNED_IN':'SIGNED_OUT',state.session);
  };
  w.editBusy=value=>{state.busy.push(value);state.events.push(['busy',value]);};
  w.editDirty=value=>state.dirty.push(value);
  w.editSaved=value=>{state.saved.push(clone(value));state.events.push(['saved']);return true;};
  const originalTimeout=w.setTimeout.bind(w);
  w.setTimeout=(fn,delay,...args)=>{
    if(delay===15000)state.timeouts.push(delay);
    return originalTimeout(fn,shortTimeout&&delay===15000?30:delay,...args);
  };
  const db={auth:{getSession:async()=>({data:{session:clone(state.session)},error:null}),
    onAuthStateChange(listener){listeners.add(listener);return {data:{subscription:{unsubscribe(){listeners.delete(listener);}}}};}},
    rpc(name,args){
      let signal,pending;const headers={};
      const query={setHeader(key,value){headers[key]=value;return query;},abortSignal(value){signal=value;return query;},
        then(resolve,reject){
          if(!pending)pending=Promise.resolve().then(()=>{
            assert.equal(name,'pajang_member');assert.equal(args.p_action,'edit-history-answer');
            state.calls.push({name,args:clone(args),headers:clone(headers),signal});
            const response=Promise.resolve().then(()=>save?.(args,state,signal)??state.success());
            if(!signal)return response;
            return Promise.race([response,new Promise(done=>{
              const aborted=()=>done({error:{message:'AbortError'}});
              if(signal.aborted)aborted();else signal.addEventListener('abort',aborted,{once:true});
            })]);
          });
          return pending.then(resolve,reject);
        }};
      return query;
    }};
  w.OjjudaGetClient=async()=>db;
  w.eval(await bundle());
  t.after(()=>{w.unmountEdit();w.close();});
  const form=()=>w.document.querySelector('.answer-edit-form');
  const textarea=()=>w.document.querySelector('#history-answer-body');
  const button=()=>form()?.querySelector('button[type="submit"]');
  const alert=()=>form()?.querySelector('[role="alert"]');
  const input=async(value,composing=false)=>{
    Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(textarea(),value);
    textarea().dispatchEvent(new w.InputEvent('input',{bubbles:true,inputType:composing?'insertCompositionText':'insertText',isComposing:composing}));
    await turn();
  };
  const submit=()=>form().dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await wait(()=>textarea()&&!form().querySelector('[role="status"]'));
  return {w,state,form,textarea,button,alert,input,submit};
}

test('only changed nonblank text can save; the request pins the original owner and round',async t=>{
  const f=await fixture(t);
  assert.equal(f.button().disabled,true);
  f.submit();await turn();assert.equal(f.state.calls.length,0);
  await f.input('  \n  ');assert.equal(f.button().disabled,true);
  f.submit();await turn();assert.equal(f.state.calls.length,0);
  await f.input('  다시 떠올린 그날  ');f.submit();await wait(()=>f.state.saved.length===1);
  assert.deepEqual(f.state.calls[0].args.p_data,{day:'2026-11-17',slot:'pm',body:'다시 떠올린 그날',previousBody:'처음 함께 걸었던 날',expectedPerson:'person-owner'});
  assert.equal(f.state.calls[0].headers.Authorization,'Bearer owner-token');
  assert.ok(f.state.calls[0].signal instanceof f.w.AbortSignal);
  assert.deepEqual(f.state.events,[['busy',true],['busy',false],['saved']]);
  assert.equal(f.state.dirty.at(-1),false);
});

test('rapid duplicate submissions issue one save and freeze the pending textarea',async t=>{
  let finish;
  const f=await fixture(t,{save:(_args,state)=>new Promise(resolve=>{finish=()=>resolve(state.success());})});
  await f.input('하나만 저장할 답변');f.submit();f.submit();
  await wait(()=>f.state.calls.length===1);
  assert.equal(f.textarea().disabled,true);assert.equal(f.button().disabled,true);
  assert.match(f.button().textContent,/저장하는 중/);
  finish();await wait(()=>f.state.saved.length===1);
  assert.equal(f.state.calls.length,1);assert.equal(f.textarea().disabled,false);
});

test('an account changed before submission is rejected by the fresh session check',async t=>{
  const f=await fixture(t);await f.input('다른 계정으로 넘기면 안 되는 글');
  f.state.changeUser('other-account',false);f.submit();
  await wait(()=>f.textarea().disabled&&f.alert()?.textContent.includes('계정이 바뀌었어요'));
  assert.equal(f.textarea().value,'');assert.equal(f.state.calls.length,0);
  assert.match(f.alert().textContent,/계정이 바뀌었어요/);assert.equal(f.state.dirty.at(-1),false);
});

test('switching accounts during a save clears the draft and ignores the old response',async t=>{
  let finish;
  const f=await fixture(t,{save:(_args,state)=>new Promise(resolve=>{finish=()=>resolve(state.success());})});
  await f.input('진행 중인 비공개 초안');f.submit();await wait(()=>f.state.calls.length===1);
  f.state.changeUser('other-account');await wait(()=>f.state.busy.at(-1)===false);
  assert.equal(f.textarea().value,'');assert.equal(f.textarea().disabled,true);
  assert.equal(f.button().disabled,true);assert.equal(f.state.calls[0].signal.aborted,true);
  finish();await turn();assert.equal(f.state.saved.length,0);
  f.submit();await turn();assert.equal(f.state.calls.length,1);
});

test('conflict and network errors keep the exact draft and allow an explicit retry',async t=>{
  for(const error of [{code:'PT412',message:'conflict'},{message:'connection lost'}]){
    await t.test(error.code||'network',async t=>{
      let attempts=0;
      const f=await fixture(t,{save:()=>++attempts===1?{error}:undefined});
      const draft='다듬고 있는 답변\n아직 지우지 않아요.';
      await f.input(draft);f.submit();await wait(f.alert);
      assert.equal(f.textarea().value,draft);assert.equal(f.button().disabled,false);
      assert.equal(f.state.saved.length,0);assert.equal(f.state.dirty.at(-1),true);
      if(error.code==='PT412')assert.match(f.alert().textContent,/다른 곳에서.*바뀌었어요/);
      f.submit();await wait(()=>f.state.saved.length===1);
      assert.deepEqual(f.state.calls[0].args,f.state.calls[1].args,'retry retains the original CAS body and target');
    });
  }
});

test('a server-masked historical answer remains editable up to the logical limit without changing its original round',async t=>{
  const original='한'.repeat(218)+'❤️❤️',edited=original+'🙂';
  const f=await fixture(t,{answer:{body:original}});
  assert.equal(f.textarea().value,original);
  assert.equal(f.w.document.querySelector('#history-answer-count').textContent,'219 / 220');
  assert.equal(f.alert(),null);
  await f.input(edited);
  assert.equal(f.w.document.querySelector('#history-answer-count').textContent,'220 / 220');
  assert.equal(f.button().disabled,false);
  assert.equal(f.textarea().hasAttribute('maxlength'),false,'an IME draft must not be truncated by a UTF-16 limit');
  await f.input(edited+'나');
  assert.equal(f.textarea().value,edited+'나');assert.equal(f.button().disabled,true);
  f.submit();await turn();assert.equal(f.state.calls.length,0);
  await f.input(edited);f.submit();await wait(()=>f.state.saved.length===1);
  assert.deepEqual(f.state.calls[0].args.p_data,{day:'2026-11-17',slot:'pm',body:edited,previousBody:original,expectedPerson:'person-owner'});
  assert.equal(f.state.saved[0].me.body,'오늘의 답변','the historical draft must not replace the current answer');
});

test('a masked history save with a lost response retries its original draft and CAS token without a second write',async t=>{
  // This token exists only in the transport fixture; the form does not contain a word catalog.
  const raw='다시 떠올린 금칙 장면',canonical='다시 떠올린 ❤️❤️ 장면';
  let stored='처음 함께 걸었던 날',writes=0,attempts=0;
  const f=await fixture(t,{save:(args,state)=>{
    const request=args.p_data,normalized=request.body.replaceAll('금칙','❤️❤️');
    if(stored!==request.previousBody&&stored!==normalized)return {error:{code:'PT412',message:'conflict'}};
    if(stored!==normalized){stored=normalized;writes++;}
    if(++attempts===1)return {error:{message:'connection lost after commit'}};
    return state.success();
  }});
  await f.input(raw);f.submit();await wait(f.alert);
  assert.equal(stored,canonical);assert.equal(writes,1);assert.equal(f.state.saved.length,0);
  assert.equal(f.textarea().value,raw);assert.equal(f.button().disabled,false);
  f.submit();await wait(()=>f.state.saved.length===1);
  assert.deepEqual(f.state.calls[0].args,f.state.calls[1].args);
  assert.equal(stored,canonical);assert.equal(writes,1);
  assert.equal(f.state.saved[0].me.body,'오늘의 답변');assert.equal(f.state.dirty.at(-1),false);
});

test('editing the current round from history passes the canonical server answer to the station',async t=>{
  const raw='오늘의 금칙 이야기',canonical='오늘의 ❤️❤️ 이야기';
  const f=await fixture(t,{answer:{day:'2026-11-19',slot:'am',body:'오늘의 답변'},save:(args,state)=>{
    const result=state.success();result.data.me.body=args.p_data.body.replaceAll('금칙','❤️❤️');return result;
  }});
  await f.input(raw);f.submit();await wait(()=>f.state.saved.length===1);
  assert.equal(f.state.calls[0].args.p_data.body,raw);
  assert.equal(f.state.saved[0].me.body,canonical);assert.equal(f.alert(),null);
});

test('the RPC deadline releases the lock without discarding the draft',async t=>{
  const f=await fixture(t,{shortTimeout:true,save:()=>new Promise(()=>{})});
  await f.input('연결이 끊겨도 남길 답변');f.submit();await wait(f.alert);
  assert.deepEqual(f.state.timeouts,[15000]);assert.equal(f.state.calls[0].signal.aborted,true);
  assert.equal(f.state.busy.at(-1),false);assert.equal(f.textarea().disabled,false);
  assert.equal(f.textarea().value,'연결이 끊겨도 남길 답변');assert.equal(f.state.saved.length,0);
});

test('a mismatched returned profile cannot replace the current station',async t=>{
  const f=await fixture(t,{save:()=>({data:{authenticated:true,me:{id:'another-person'}}})});
  await f.input('내 답변');f.submit();await wait(()=>f.textarea().disabled&&f.alert()?.textContent.includes('계정이 바뀌었어요'));
  assert.equal(f.state.saved.length,0);assert.equal(f.textarea().value,'');
  assert.match(f.alert().textContent,/계정이 바뀌었어요/);
});

test('220 Hangul or emoji code points are accepted; 221 are preserved but cannot save',async t=>{
  for(const character of ['한','🙂'])await t.test(character,async t=>{
    const f=await fixture(t);const full=character.repeat(220);
    await f.input(full);assert.equal(f.button().disabled,false);
    assert.equal(f.w.document.querySelector('#history-answer-count').textContent,'220 / 220');
    assert.equal(f.textarea().hasAttribute('maxlength'),false);
    await f.input(full+character);assert.equal(f.textarea().value,full+character);
    assert.equal(f.button().disabled,true);assert.match(f.alert().textContent,/220자까지/);
    f.submit();await turn();assert.equal(f.state.calls.length,0);
    await f.input(full);f.submit();await wait(()=>f.state.saved.length===1);
    assert.equal(f.state.calls[0].args.p_data.body,full);
  });
});

test('Korean composition can pass the limit temporarily without truncating the draft',async t=>{
  const f=await fixture(t),field=f.textarea();
  field.dispatchEvent(new f.w.CompositionEvent('compositionstart',{bubbles:true}));
  const composing='한'.repeat(220)+'ㄱ';await f.input(composing,true);
  assert.equal(field.value,composing);assert.equal(f.button().disabled,true);
  const finished='한'.repeat(219)+'가';await f.input(finished,true);
  field.dispatchEvent(new f.w.CompositionEvent('compositionend',{bubbles:true,data:'가'}));
  await turn();assert.equal(field.value,finished);assert.equal(f.button().disabled,false);
  f.submit();await wait(()=>f.state.saved.length===1);
  assert.equal(f.state.calls[0].args.p_data.body,finished);
});
