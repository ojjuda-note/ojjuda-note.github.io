'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.env.QA_REPO||'.'),origin='https://ojjuda.kr';
const kinds=['croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown'];
const config=`(() => {
  const user={id:'08cdd38b-9175-4f8d-b849-c498b91d31dc',is_anonymous:false};
  const success=data=>({data,error:null});
  const service={auth:{getUser:async()=>success({user}),getSession:async()=>success({session:{user}}),
   onAuthStateChange(cb){queueMicrotask(()=>cb('INITIAL_SESSION',{user}));return {data:{subscription:{unsubscribe(){}}}};}},
   rpc(name,opts){let answer;
     if(name==='get_my_member_identity') answer={age:26,locked:true};
     else if(name==='drinking_content'&&opts.p_action==='pool'){
       const banks={bomb:['국수 종류','사계절 음식'],liar:['도토리','삼각자'],minority:[['봄비','가을바람'],['돛단배','잠수함']],mission:[['수영하기','그물 던지기'],['박수치기','북 치기']],initial:['ㄱㅅ','ㅂㅅ'],king:['황금 귀마개를 소개해 주세요.'],fingers:['초록 양말을 신은 사람'],imagevote:['바닷속 도서관을 맡을 사람은?'],truth:{mild:['순한맛 검수본 하나?'],spicy:['빨간맛 검수본 둘?']}};answer={banks:Object.fromEntries((opts.p_options.kinds).map(k=>[k,banks[k]]))};
     }else if(name==='drinking_prompt_suggestions'&&opts.p_action==='submit') answer={ok:true};
     else throw Error('Unexpected RPC '+name);
     const p=Promise.resolve(success(answer));p.abortSignal=()=>p;return p;
   }};
  window.OjjudaGetClient=async()=>service;
})();`;
function content(url){
  const name=new URL(url).pathname;
  if(name==='/config.js')return ['application/javascript; charset=utf-8',Buffer.from(config)];
  const file=path.join(root,name.endsWith('/')?name+'index.html':name);
  return [({'.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.webp':'image/webp','.png':'image/png','.wav':'audio/wav'})[path.extname(file)]||'application/octet-stream',fs.readFileSync(file)];
}
const S=a=>'[data-action="'+a+'"]';
async function exercise(ui,k){
 const {click,wait,query,text,value,write,advance,seat}=ui;
 const a=(act)=>click(S(act)), submit=id=>click('#'+id+' [type=submit]');
 const afterStart={croc:S('tooth'),bottle:S('set-bottle-table'),bomb:S('start-bomb'),stopwatch:S('watch-go'),liar:S('reveal'),king:S('reveal'),truth:S('truth-pick'),initial:S('initial-go'),minority:S('open-vote'),mission:S('reveal'),fingers:'#party-question',imagevote:'#party-question',updown:'#updown-value'};
 await wait('.game-card');
 assert.equal(await query('.game-card'),13);
 await click(S('open')+'[data-value="'+k+'"]');
 if(k==='bomb')await a('random-bomb-time');else await a('start');
 await wait(afterStart[k]);
 if(k==='croc'){
  assert.equal(await query(S('tooth')),24);
  for(let i=0;i<24&&!await query(S('ack-bite'));i++)await click(S('tooth')+':not([disabled])');
  await a('ack-bite');
 }else if(k==='bottle'){
  await a('set-bottle-table');await wait('.seat-surface');
  for(const [x,y] of [[.2,.5],[.5,.2],[.8,.5],[.5,.8]])await seat(x,y);
  assert.equal(await query('.seat'),4);await a('spin');await a('brake');
  await advance(21000);await wait('.winning-seat');
  assert.equal(await query('.winning-seat'),1);
 }else if(k==='bomb'){
  assert.doesNotMatch(await text('.play-body h2'),/\d/);
  await a('start-bomb');await a('pass-bomb');await advance(32000);await advance(1200);
 }else if(k==='stopwatch'){
  for(let i=0;i<4;i++){await a('watch-go');await advance(1200);await a('watch-stop');await a('watch-next');}
  assert.equal(await query('.watch-results tbody tr'),4);
 }else if(['liar','mission','king'].includes(k)){
  for(let i=0;i<4;i++){await a('reveal');await a('hide');}
  if(k==='king'){await write('#king-second','2','change');await a('royal');assert.equal(await query('.king-order dd'),2);}
  else await a('start-vote');
 }else if(k==='truth'){
  for(let i=0;i<4;i++){assert.equal(await query('.truth-back'),2);await a('truth-pick');assert.ok((await text('.truth-front p')).trim());await a(i%2?'truth-pass':'truth-next');}
 }else if(k==='initial'){
  await a('initial-go');await a('word-ok');
  for(let i=0;i<3;i++){await a('initial-go');if(i===1)await advance(5200);else await a('word-out');if(i<2)await a('initial-ready');}
 }else if(k==='fingers'){
  for(let i=0;i<5;i++){await submit('party-prompt');await click('#fold-form input[value="0"]');await submit('fold-form');}
 }else if(k==='imagevote'){await submit('party-prompt');}
 else if(k==='updown'){
  await write('#updown-value','0');await submit('updown-form');assert.ok(await text('#updown-error'));
  for(let i=0;i<7&&await query('#updown-range');i++){
   const ns=(await text('#updown-range strong')).match(/\d+/g).map(Number);
   await write('#updown-value',String(Math.floor((ns[0]+ns.at(-1))/2)));await submit('updown-form');
  }
 }
 if(['liar','mission','minority','imagevote'].includes(k)){
  for(let i=0;i<4;i++){await a('open-vote');await a('cast');}
 }
 // Restart through each game's real result controls, then re-enter the catalog.
 const replay=({bottle:'spin',bomb:'bomb-setup',stopwatch:'watch-setup',truth:'truth-setup'})[k]||'start';
 await a(replay);
 if(k==='bomb')await a('confirm-bomb-time');else if(k==='truth'||k==='stopwatch')await a('start');
 await wait(k==='bottle'?S('brake'):afterStart[k]);
 await a('menu');await wait('.game-card');assert.equal(await query('.game-card'),13);
}
async function browserDriver(b,errors){
 const context=await b.newContext({viewport:{width:370,height:780},isMobile:true,hasTouch:true});
 const p=await context.newPage();p.setDefaultTimeout(5500);
 p.on('pageerror',e=>errors.push(String(e)));
 await p.route(origin+'/**',async route=>{try{const [contentType,body]=content(route.request().url());await route.fulfill({contentType,body});}catch(err){errors.push('resource '+route.request().url()+' '+err.message);await route.fulfill({status:404,body:'not found'});}});
 await p.clock.install();await p.goto(origin+'/games/drinking/local/');
 const one=s=>p.locator(s).first();
 return {wait:s=>one(s).waitFor(),query:s=>p.locator(s).count(),text:s=>one(s).innerText(),value:s=>one(s).inputValue(),click:s=>one(s).click(),
 write:(s,v,event)=>event==='change'?one(s).selectOption(v):one(s).fill(v),advance:ms=>p.clock.fastForward(ms),close:()=>context.close(),
 seat:async (x,y)=>{const s=one('.seat-surface'),b=await s.boundingBox();await s.click({position:{x:x*b.width,y:y*b.height}});},
 diagnostic:()=>p.locator('#app').textContent().catch(()=>'')};
}
async function main(){
 const errors=[],failed=[];
 const jsdom=process.env.QA_DOM_SIM==='1';
 const browser=jsdom?null:await require('playwright').chromium.launch({executablePath:process.env.BROWSER_PATH||'/usr/bin/google-chrome',args:['--no-sandbox'],headless:true});
 try{
  for(const k of kinds){
   let ui;
   try{ui=jsdom?await require('./simulator.cjs')({content,origin,errors}):await browserDriver(browser,errors);
    await exercise(ui,k);console.log('PASS',k,'finish, replay and menu');}
   catch(e){console.error('FAIL',k,e.message,ui?String(await ui.diagnostic()).slice(-350):'');failed.push(k);}
   finally{if(ui)await ui.close();}
  }
 }finally{if(browser)await browser.close();}
 assert.deepEqual(errors,[],'browser error(s): '+errors.join('; '));assert.deepEqual(failed,[],'failed '+failed.join(', '));
}
main().catch(e=>{console.error(e);process.exitCode=1});
