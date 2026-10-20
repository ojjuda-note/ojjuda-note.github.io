const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'world.html'), 'utf8');
let source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replaceAll('import.meta.env', '({})')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
source = source.slice(0, source.indexOf('j1(()=>H());gm('));
source += '\nwindow.friendTest={auth:D,state:g,model:P,actions:sr,render:H,load:ke,notice:openWorldNotification,setClient(client){S=client;}};';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(condition) { for (let i=0; i<50; i++) { if(condition())return; await tick(); } assert.ok(condition(), 'friend UI finishes updating'); }

(async()=>{
 const errors=[], calls=[], messages=[];
 const virtualConsole = new VirtualConsole();virtualConsole.on('jsdomError', error=>errors.push(error.message));
 const dom = new JSDOM('<div id="app"></div><div id="modal-root"></div><div id="toast"></div>', {
  url:'https://ojjuda.kr/world.html?tab=my', runScripts:'outside-only', pretendToBeVisual:true, virtualConsole
 });
 try {
  const w=dom.window;
  w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  w.ResizeObserver=class{observe(){}disconnect(){}};
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  w.fetch=async()=>({ok:true,json:async()=>({}),text:async()=>''});
  w.eval(source);
  const t=w.friendTest, doc=w.document;
  const profiles=['accepted','incoming','decline','outgoing','new'].map(id=>({id,nickname:id==='new'?'새 친구':id,bio:'함께 게임해요',mood:'😊'}));
  let rows=[['a','owner','accepted','accepted'],['b','incoming','owner','pending'],['c','decline','owner','pending'],['d','owner','outgoing','pending']]
    .map(([id,requester,addressee,status])=>({id,requester,addressee,status}));
  let failNext=false, deferred=null;
  const client={from(table){
   assert.ok(['friendships','profiles'].includes(table), 'retired content must never be queried: '+table);
   calls.push(table);
   let action='select', value, ids, key, pattern, excluded;
   const query={select(){return this;},in(field,list){ids=list;return this;},ilike(field,text){pattern=text;return this;},neq(field,id){excluded=id;return this;},limit(){return this;},
    insert(item){action='insert';value=item;return this;},delete(){action='delete';return this;},eq(field,id){key=id;return this;},
    then(resolve,reject){return Promise.resolve().then(async()=>{
     if(table==='friendships'&&action==='select'&&deferred){const pause=deferred;deferred=null;return await pause;}
     if(failNext){failNext=false;return {error:{message:'synthetic offline'}};}
     if(action==='insert'){rows.push({id:'new-request',...value,status:'pending'});messages.push('request');return {data:null};}
     if(action==='delete'){rows=rows.filter(row=>row.id!==key);messages.push('delete:'+key);return {data:null};}
     if(table==='friendships')return {data:rows.filter(row=>row.requester===t.auth.user.id||row.addressee===t.auth.user.id)};
     return {data:profiles.filter(profile=>(!ids||ids.includes(profile.id))&&profile.id!==excluded&&(!pattern||profile.nickname.includes(pattern.slice(1,-1))))};
    }).then(resolve,reject);}
   };return query;
  },async rpc(name,args){assert.equal(name,'accept_friend');rows.find(row=>row.id===args.req_id).status='accepted';messages.push('accept');return {data:true};}};
  t.setClient(client);t.auth.online=true;t.auth.user={id:'owner'};t.state.tab='my';t.render();
  const group=()=>doc.querySelector('[data-my-group="friends"]');
  const click=selector=>{const button=doc.querySelector(selector);assert.ok(button,selector);button.click();};
  assert.equal(calls.length,0,'closed settings do not fetch friends');
  group().open=true;await until(()=>doc.querySelector('#fr-q'));
  assert.equal(group().open,true);
  assert.ok(group().textContent.includes('친구 1명'));
  assert.equal(group().querySelector('[data-act="visit"]'),null);
  assert.deepEqual([...doc.querySelectorAll('.bottomnav [data-tab]')].map(item=>item.textContent.trim()),['오락실','공원','설정']);

  const search=doc.querySelector('#fr-q');search.value='새 친구';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  doc.querySelector('#fr-search-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>doc.querySelector('[data-act="fr-request"][data-uid="new"]'));
  click('[data-act="fr-request"][data-uid="new"]');await until(()=>t.model.outgoing.some(item=>item.p.id==='new'));
  assert.equal(group().open,true,'friend actions remain inside expanded settings');
  assert.equal(doc.querySelector('#fr-q').value,'새 친구','search draft survives an action');
  click('[data-act="fr-accept"][data-req="b"]');await until(()=>t.model.friends.length===2);
  click('[data-act="fr-decline"][data-req="c"]');await until(()=>t.model.incoming.length===0);
  click('[data-act="fr-cancel"][data-req="d"]');await until(()=>!t.model.outgoing.some(item=>item.req==='d'));
  click('[data-act="fr-remove"][data-req="a"]');assert.ok(doc.querySelector('#modal-root').textContent.includes('친구 목록에서 삭제'));
  click('[data-act="confirm-ok"]');await until(()=>!t.model.friends.some(item=>item.id==='accepted'));
  assert.ok(messages.includes('request')&&messages.includes('accept')&&messages.includes('delete:a'));

  t.actions.tab({tab:'arcade'});await t.notice('friends','b');
  assert.equal(t.state.tab,'my');assert.equal(group().open,true,'friend notifications open the settings section');
  t.model.at=0;failNext=true;t.actions['fr-retry']();await until(()=>doc.querySelector('[data-act="fr-retry"]'));
  click('[data-act="fr-retry"]');await until(()=>doc.querySelector('#fr-q'));

  let release;deferred=new Promise(resolve=>{release=resolve;});const oldLoad=t.load();await tick();
  t.auth.user={id:'other-owner'};t.render();
  assert.equal(t.model.friends.length,0);assert.equal(t.model.results,null);assert.equal(group().open,false);
  release({data:rows});await oldLoad;
  assert.equal(t.model.friends.length,0,'a previous account response cannot restore its friend list');
  group().open=true;await until(()=>t.model.loaded);assert.equal(t.model.friends.length,0);
  t.auth.online=false;t.auth.user=null;t.render();
  assert.ok(group().querySelector('[data-act="account-login"]'));
  assert.equal(group().querySelector('#fr-search-form'),null,'guests cannot manage a previous account');
  assert.deepEqual(errors,[]);
  console.log('PASS: settings entry, search, request, accept, decline, cancel, confirmed removal, notification route, retry and account isolation');
 } finally { dom.window.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
