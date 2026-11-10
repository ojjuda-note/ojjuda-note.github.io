/* Real World routing, directory bridge and member controller; only transport is a fixture. */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.join(__dirname, '..'), read = file => fs.readFileSync(path.join(root, file), 'utf8');
let source = read('world.html').match(/<script type="module">([\s\S]*?)<\/script>/)[1];
// jsdom evaluates a classic-script excerpt; the real page loads these as ESM.
// Neither module participates in the restaurant-routing behavior under test.
source = source.replaceAll('import.meta.env', '({})')
  .replace(/^import \{ installChachaRushPortal \} from [^\n]+$/m, 'const installChachaRushPortal = () => ({ open() {} });')
  .replace(/^import \{ chooseJanggiProMove \} from [^\n]+$/m, 'const chooseJanggiProMove = () => null;');
source = source.slice(0, source.indexOf('j1(()=>H());gm('));
source += `window.recommendationEntry={auth:D,actions:sr,open:openWorldGameLink,close:El,setupNavigation:gm,
 setClient:client=>S=client,getController:()=>worldRecommendedRestaurants,catalog:()=>_r,
 route(){py=()=>{};sr.tab=({tab})=>{g.tab='place';g.place={id:tab};};bm=true;
 resolveWorldProfilePhoto=()=>{};m1=()=>{};x1=()=>Promise.resolve();return my();}};`;
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(check, message) { for (let n=0;n<100;n++) { if(check())return;await tick(); } assert.fail(message); }
function fixture(query='') {
 const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
 const dom=new JSDOM('<div id="app"></div><div id="modal-root"></div><div id="toast"></div>',{url:'https://ojjuda.kr/world.html'+query,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole});
 const w=dom.window,intervals=new Map(),calls=[],created=[];let intervalId=0,navigation;
 w.setInterval=fn=>{intervals.set(++intervalId,fn);return intervalId;};w.clearInterval=id=>intervals.delete(id);
 w.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});w.ResizeObserver=class{observe(){}disconnect(){}};
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 w.fetch=async()=>({ok:true,json:async()=>({}),text:async()=>''});w.OjjudaGameAssets={ready:()=>true,load:async()=>{}};
  w.eval(read('games/certified-restaurants/restaurant-ratings.js'));w.eval(read('games/certified-restaurants/recommended-restaurants.js'));const create=w.OjjudaRecommendedRestaurants.create;
 w.OjjudaRecommendedRestaurants.create=options=>{const controller=create(options);created.push({options,controller});return controller;};
 w.eval(read('games/certified-restaurants/world-restaurant-guide.js'));w.eval(source);
 w.OjjudaWorldNavigation={install(options){navigation=options;return{};}};
 const api=w.recommendationEntry,$=selector=>w.document.querySelector(selector);
 const client=()=>({auth:{onAuthStateChange(){return{data:{subscription:{unsubscribe(){}}}};}},
  async rpc(name,args){calls.push({name,args,owner:api.auth.user?.id||null});assert.equal(name,'list_restaurant_recommendations','navigation never writes member records');return{data:{rows:[],total:0,offset:0,limit:24},error:null};},
  storage:{from(){return{async remove(){assert.fail('navigation does not delete photos');},async download(){assert.fail('empty lists do not fetch photos');}};}}});
  api.setClient(client());const setUser=(id,anonymous=false)=>{api.auth.online=!!id;api.auth.user=id?{id,is_anonymous:anonymous}:null;};setUser(null);
 const send=(frame,{origin=w.location.origin,source=frame.contentWindow,type='ojjuda:restaurants:recommendations'}={})=>w.dispatchEvent(new w.MessageEvent('message',{origin,source,data:{type}}));
 return{dom,w,api,$,calls,created,client,setUser,send,navigation:()=>navigation,pollAuth(){for(const fn of [...intervals.values()])fn();},
  async memberReady(){await until(()=>$('[data-rr=compose]'),'the member list is ready');await tick();},
  dirty(){$('[data-rr=compose]').click();const input=$('[data-rr=field-name]');input.value='작성 중인 추천';input.dispatchEvent(new w.Event('input',{bubbles:true}));},
  close(){w.OjjudaRestaurantGuide.close(true);for(const{controller}of created)controller.destroy();dom.window.close();assert.deepEqual(errors,[],'no uncaught bridge or World errors');}};
}
(async()=>{
 const normal=fixture();try{
  normal.setUser(A);normal.api.open('restaurants');const frame=normal.$('.restaurant-guide-dialog iframe');
  assert.ok(frame,'the certified directory is the parent view');assert.equal(normal.api.catalog().recommendations,undefined,'recommendations have no standalone arcade tile');
   assert.equal(new URL(frame.src).searchParams.get('member-menu'),'1');assert.equal(new URL(frame.src).searchParams.get('member-ratings'),'1','members receive the rating controls');assert.equal(normal.$('[data-rr=dialog]'),null);assert.equal(normal.calls.length,0);
  normal.send(frame,{origin:'https://other.invalid'});normal.send(frame,{source:normal.w});normal.send(frame,{type:'unrecognized-menu'});
  assert.equal(normal.$('[data-rr=dialog]'),null,'foreign origin, wrong frame and wrong message cannot open the member view');assert.equal(normal.calls.length,0);
  normal.send(frame);await normal.memberReady();assert.equal(normal.calls[0].owner,A);assert.equal(normal.created[0].options.getUser().id,A);
  assert.equal(normal.$('[data-rr=close]').textContent,'← 아지트');await normal.api.setupNavigation(()=>{});
  assert.equal(normal.navigation().closeOverlay(),true);
  assert.equal(normal.$('[data-rr=dialog],.restaurant-guide-dialog'),null,'one Back leaves both layers for the arcade');
  assert.equal(normal.w.document.body.classList.contains('gaming'),false);
 }finally{normal.close();}
 for(const query of ['?game=recommendations','?game=restaurants&restaurantView=recommendations']){
  const guest=fixture(query);try{
   guest.api.route();assert.ok(guest.$('.restaurant-guide-dialog iframe'),query+' creates the directory first');assert.ok(guest.$('[data-rr=dialog]'),query+' opens its recommendation child');
   assert.equal(guest.calls.length,0,'guest aliases do not query member records');let logins=0;guest.api.actions['account-login']=()=>{logins++;};guest.$('[data-rr=login]').click();
   assert.equal(logins,1,'the nested guest prompt keeps the established login action');assert.equal(guest.$('[data-rr=dialog]'),null);
  }finally{guest.close();}
 }
  const anonymous=fixture();try{
   anonymous.setUser(A,true);anonymous.api.open('recommendations');
   const frame=anonymous.$('.restaurant-guide-dialog iframe');
   assert.ok(frame,'anonymous accounts can browse the public directory');
   assert.equal(new URL(frame.src).searchParams.has('member-ratings'),false,'an anonymous UUID never enables member rating controls');
   assert.ok(anonymous.$('[data-rr=login]'),'anonymous registration shows the existing login action');
   assert.equal(anonymous.$('[data-rr=compose],[data-rr=editor]'),null,'anonymous accounts cannot reach registration');
   anonymous.w.dispatchEvent(new anonymous.w.MessageEvent('message',{origin:anonymous.w.location.origin,source:frame.contentWindow,data:{type:'ojjuda:restaurants:ratings',requestId:'anonymous-read',action:'summary',ids:['mingles']}}));
   await tick();assert.equal(anonymous.calls.length,0,'a forged anonymous rating request never reaches member RPCs');
   anonymous.setUser(A);anonymous.pollAuth();
   assert.equal(anonymous.$('[data-rr=dialog],.restaurant-guide-dialog'),null,'a same-ID anonymous-to-member change closes the old guest view');
   anonymous.api.open('restaurants');const memberFrame=anonymous.$('.restaurant-guide-dialog iframe');
   assert.equal(new URL(memberFrame.src).searchParams.get('member-ratings'),'1');
   anonymous.setUser(A,true);anonymous.pollAuth();
   assert.equal(anonymous.$('[data-rr=dialog],.restaurant-guide-dialog'),null,'a same-ID membership downgrade closes the rating-enabled view');
   assert.equal(anonymous.calls.length,0,'membership transitions never submit a rating or recommendation');
  }finally{anonymous.close();}
 const dirty=fixture();try{
  dirty.setUser(A);dirty.api.open('recommendations');await dirty.memberReady();dirty.dirty();const frame=dirty.$('.restaurant-guide-dialog iframe');
  const first=dirty.api.close(),repeated=dirty.api.close();assert.equal(typeof first.then,'function');assert.equal(repeated,first,'global close shares one pending parent/child confirmation');
  assert.equal(dirty.w.document.querySelectorAll('[data-rr=confirm-dialog]').length,1);dirty.$('[data-rr=confirm-cancel]').click();assert.equal(await first,false);
  assert.equal(dirty.$('.restaurant-guide-dialog iframe'),frame,'cancelling keeps the parent alive');assert.equal(dirty.$('[data-rr=field-name]').value,'작성 중인 추천','cancelling preserves the actual member draft');
  const accepted=dirty.api.close();dirty.$('[data-rr=confirm-accept]').click();assert.equal(await accepted,true);assert.equal(dirty.$('[data-rr=dialog],.restaurant-guide-dialog'),null,'accepting closes child and parent once');
  assert.equal(dirty.w.document.body.classList.contains('gaming'),false);
 }finally{dirty.close();}
 const account=fixture();try{
  account.setUser(A);account.api.open('recommendations');await account.memberReady();account.dirty();
  const staleFrame=account.$('.restaurant-guide-dialog iframe'),staleSource=staleFrame.contentWindow,before=account.calls.length;
  account.setUser(B);account.pollAuth();assert.equal(account.$('[data-rr=dialog],.restaurant-guide-dialog'),null,'an account change force-clears both private child and parent');
  assert.equal(account.calls.length,before,'changing accounts does not replay an old member request');account.api.open('restaurants');const currentFrame=account.$('.restaurant-guide-dialog iframe');
  account.send(currentFrame,{source:staleSource});assert.equal(account.$('[data-rr=dialog]'),null,'a detached frame cannot reopen a later account view');
  account.send(currentFrame);await account.memberReady();assert.equal(account.calls.at(-1).owner,B);assert.equal(account.created.length,1,'the controller reads the current account on reuse');
  account.api.setClient(account.client());account.api.open('recommendations');await account.memberReady();assert.equal(account.created.length,2,'a replaced authenticated client gets a new controller');
  assert.equal(account.created[0].controller.isOpen(),false);
 }finally{account.close();}
 const race=fixture();try{
  let release,ready=false;race.w.OjjudaGameAssets={ready:()=>ready,load:id=>{assert.equal(id,'restaurants');return new Promise(resolve=>{release=resolve;});}};
  race.setUser(A);race.api.open('recommendations');assert.equal(race.$('.restaurant-guide-dialog'),null);race.setUser(B);ready=true;release();await tick();await tick();
  assert.equal(race.$('.restaurant-guide-dialog'),null,'assets requested by an old account cannot open a nested view');race.api.open('recommendations');await race.memberReady();assert.equal(race.calls.at(-1).owner,B);
 }finally{race.close();}
  console.log('PASS: real nested restaurant bridge, member-only rating controls and registration, anonymous UUID and forged-message rejection, membership transitions, origin/frame guards, directory cleanup, protected drafts and single Back to Arcade, guest/canonical/legacy entry, account replacement and stale asset isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
