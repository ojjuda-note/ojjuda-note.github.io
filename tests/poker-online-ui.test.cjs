const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const {fixture}=require('./poker-online-fixture.cjs');
const root=path.join(__dirname,'..');
const pause=()=>new Promise(r=>setTimeout(r,5));
async function until(fn,label){for(let i=0;i<600;i++){if(fn())return;await pause();}throw Error('timeout: '+label);}
(async()=>{
 const f=await fixture(),rules=await import('../games/poker/engine.mjs'),motion=await import('../games/poker/deal-motion.mjs');const screens=[];
 function screen(actor){
  const dom=new JSDOM(fs.readFileSync(path.join(root,'games/poker/index.html'),'utf8'),{url:'https://ojjuda.kr/games/poker/index.html',runScripts:'outside-only',pretendToBeVisual:true});screens.push(dom);
  const w=dom.window,requests=[],sounds=[];let last=null,polls=[];
  w.structuredClone=structuredClone;w.matchMedia=()=>({matches:true,addEventListener(){}});
  w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
  const originalTimeout=w.setTimeout.bind(w);w.setTimeout=(fn,ms)=>{if(ms===1200||ms===5000){polls.push(fn);return originalTimeout(()=>{},60000);}return originalTimeout(fn,ms);};
  const parent={postMessage:async message=>{
   if(message.type!=='rpc')return;requests.push(message.body);
   const data=await f.call(actor,message.body);last=data;
   w.dispatchEvent(new w.MessageEvent('message',{origin:'https://ojjuda.kr',source:parent,data:{source:'ojjuda-world',type:'poker-rpc',id:message.id,data,error:data.error}}));
  }};Object.defineProperty(w,'parent',{value:parent});
  w.__rules=rules;w.__motion=motion;const audio={enabled:true,volume:.45};w.__audio={createPokerSound:()=>({settings:()=>audio,configure:v=>Object.assign(audio,v),play:x=>sounds.push(x),unlock:async()=>true,pause(){}})};
  w.eval(fs.readFileSync(path.join(root,'games/poker/online-client.mjs'),'utf8').replace(/export /g,'')+'\nwindow.__online={createOnlineClient,rotateView};');
  const source=fs.readFileSync(path.join(root,'games/poker/app.mjs'),'utf8');
  w.eval(source.replace(/^import \{([^}]+)\} from '([^']+)';/gm,(_,names,file)=>`const {${names}}=window.${file.includes('engine.')?'__rules':file.includes('sound.')?'__audio':file.includes('online-client.')?'__online':'__motion'};`));
  w.dispatchEvent(new w.MessageEvent('message',{origin:'https://ojjuda.kr',source:parent,data:{source:'ojjuda-world',type:'poker-init',owner:actor}}));
  const find=s=>w.document.querySelector(s),click=s=>{const el=find(s);assert.ok(el,s);assert.equal(el.disabled,false,s);el.click();};
  return {w,find,click,requests,sounds,get last(){return last;},async poll(){const p=polls.pop();polls=[];const n=requests.length;if(p)p();await until(()=>requests.length>n&&last?.room,'poll');await pause();}};
 }
 try{
  const a=screen(f.users[0]),b=screen(f.users[1]);
  a.click('[data-action=online]');b.click('[data-action=online]');
  await until(()=>a.find('#poker-create')&&b.find('#poker-join')&&a.requests.length===2&&b.requests.length===2,'online lobby');await pause();
  a.find('#poker-create [name=capacity]').value='2';a.find('#poker-create').dispatchEvent(new a.w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>a.find('.online-seat.occupied'),'created');const code=a.last.room.code;
  b.find('#poker-join [name=code]').value=code;b.find('#poker-join').dispatchEvent(new b.w.Event('submit',{bubbles:true,cancelable:true}));
  await until(()=>b.find('.online-seat.occupied'),'joined');await a.poll();
  await until(()=>!a.find('[data-action=online-start]').disabled,'host start');
  a.click('[data-action=online-start]');await until(()=>a.find('.my-cards .card'),'deal on host');await b.poll();
  await until(()=>b.find('.my-cards .card'),'deal on guest');
  assert.equal(a.find('.my-cards').children.length,4);assert.equal(b.find('.my-cards').children.length,4);
  assert.equal(a.find('[data-action=select]'),null,'host cannot act on guest choice');assert.ok(b.find('[data-action=select]'));
  assert.equal(a.find('.seat-cards').querySelectorAll('img').length,0,'hole cards are absent from DOM');
  assert.notDeepEqual([...a.w.document.querySelectorAll('.my-cards img')].map(x=>x.src),[...b.w.document.querySelectorAll('.my-cards img')].map(x=>x.src),'members see different private hands');
  b.click('[data-card="0"]');b.click('[data-action=select]');await until(()=>b.find('.my-cards').children.length===3,'discard');
  b.click('[data-card="0"]');b.click('[data-action=select]');await until(()=>b.find('[data-action=select]')===null,'guest open');await a.poll();
  await until(()=>a.find('[data-action=select]'),'host choice');assert.equal(a.find('.seat-cards').querySelectorAll('img').length,1,'only selected card is public');
  a.click('[data-card="0"]');a.click('[data-action=select]');await until(()=>a.find('.my-cards').children.length===3,'host discard');a.click('[data-card="0"]');a.click('[data-action=select]');await until(()=>a.last?.room?.game?.phase==='betting','betting');await b.poll();
  const active=a.last.room.game.turn===a.last.room.seat?a:b;
  assert.ok(active.find('[data-action=check]'),'rotated client exposes correct human turn');
  active.click('[data-action=check]');await until(()=>active.last.room.game.turn!==active.last.room.seat,'check committed');
  const bankBefore=JSON.parse(a.w.localStorage.getItem('ojjuda.poker.practice.v1.'+f.users[0])).bank;
  a.click('[data-action=online-leave]');assert.match(a.find('#exit-dialog p').textContent,/다이/);a.click('#confirm-exit');await until(()=>a.last.room===null,'leave');
  assert.equal(JSON.parse(a.w.localStorage.getItem('ojjuda.poker.practice.v1.'+f.users[0])).bank,bankBefore,'online chips do not overwrite practice wallet');
  console.log('PASS: two independent browser DOMs create/join/start, see private hands, choose/open, rotate turns, bet and leave through real server rules');
 }finally{screens.forEach(d=>d.window.close());await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
