const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const root=path.join(__dirname,'..');
const pause=()=>new Promise(r=>setTimeout(r,5));
async function until(fn,label){for(let i=0;i<600;i++){if(fn())return;await pause();}throw Error('timeout: '+label);}
async function screen(f,actor,{animate=false,saved=null,settings=null,joinCode=null}={}){
 const rules=await import('../games/poker/engine.mjs'),motion=await import('../games/poker/deal-motion.mjs');
 const dom=new JSDOM(fs.readFileSync(path.join(root,'games/poker/index.html'),'utf8'),{url:'https://ojjuda.kr/games/poker/index.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,requests=[],sounds=[],soundCalls=[],messages=[],flights=[],jobs=new Map();let last=null,polls=[],serial=0,now=0;
 w.structuredClone=structuredClone;w.matchMedia=()=>({matches:!animate,addEventListener(){}});
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
 if(animate){
  w.HTMLElement.prototype.animate=function(frames,options){const animation={node:this,frames,options,cancel(){}};flights.push(animation);return animation;};
  w.HTMLElement.prototype.getBoundingClientRect=function(){
   if(this.matches('.deal-deck'))return {left:300,top:240,width:43,height:60};
   const seat=Number(this.dataset.dealSeat),order=Number(this.dataset.dealOrder)||0,positions=[[220,460],[100,130],[330,100],[560,130]];
   if(this.matches('.card')&&Number.isInteger(seat)){const [left,top]=positions[seat];return {left:left+order*35,top,width:seat===0?76:42,height:seat===0?106:59};}
   return {left:0,top:0,width:800,height:700};
  };
 }
 const originalTimeout=w.setTimeout.bind(w),originalClear=w.clearTimeout.bind(w);
 w.setTimeout=(fn,ms)=>{if(fn.name==='read'){polls.push(fn);return originalTimeout(()=>{},60000);}if(animate&&ms<10000){const id=-(++serial);jobs.set(id,{fn,due:now+ms});return id;}return originalTimeout(fn,ms);};
 w.clearTimeout=id=>{if(id<0)jobs.delete(id);else originalClear(id);};
 const parent={postMessage:async message=>{
  messages.push(message);if(message.type!=='rpc')return;requests.push(message.body);
  const data=await f.call(actor,message.body);last=data;
  w.dispatchEvent(new w.MessageEvent('message',{origin:'https://ojjuda.kr',source:parent,data:{source:'ojjuda-world',type:'poker-rpc',id:message.id,data,error:data.error}}));
 }};Object.defineProperty(w,'parent',{value:parent});
 w.__rules=rules;w.__motion=motion;const audio={enabled:true,volume:.45,voiceStyle:'classic'};w.__audio={pokerActionCall:(await import('../games/poker/sound.mjs')).pokerActionCall,createPokerSound:()=>({settings:()=>({...audio}),configure:v=>Object.assign(audio,v),play:(kind,options={})=>{sounds.push(kind);soundCalls.push({kind,...options});},preloadPlayers(){},unlock:async()=>true,pause(){}})};
 if(saved)w.localStorage.setItem('ojjuda.poker.practice.v1.'+actor,JSON.stringify(saved));
 if(settings)w.localStorage.setItem('ojjuda.poker.settings.v2.'+actor,JSON.stringify(settings));
 w.eval(fs.readFileSync(path.join(root,'games/poker/online-client.mjs'),'utf8').replace(/export /g,'')+'\nwindow.__online={createOnlineClient,rotateView};');
 w.eval(fs.readFileSync(path.join(root,'games/poker/app.mjs'),'utf8').replace(/^import \{([^}]+)\} from '([^']+)';/gm,(_,names,file)=>`const {${names}}=window.${file.includes('engine.')?'__rules':file.includes('sound.')?'__audio':file.includes('online-client.')?'__online':'__motion'};`));
 const message=(data,origin='https://ojjuda.kr')=>w.dispatchEvent(new w.MessageEvent('message',{origin,source:parent,data}));
 message({source:'ojjuda-world',type:'poker-init',owner:actor,joinCode});
 const find=s=>w.document.querySelector(s),click=s=>{const el=find(s);assert.ok(el,s);assert.equal(el.disabled,false,s);el.click();};
 await until(()=>last?.wallet,'server wallet');await pause();
 return {w,find,click,requests,sounds,soundCalls,messages,flights,message,get last(){return last;},get motionTime(){return now;},
  async poll(){const p=polls.pop();polls=[];if(p)await p();await pause();},
  finishDeal(){let n=0;while(find('.is-dealing')){assert.ok(++n<100,'motion finishes');const next=[...jobs].sort((a,b)=>a[1].due-b[1].due)[0];assert.ok(next);jobs.delete(next[0]);now=next[1].due;next[1].fn();}},
  close(){w.dispatchEvent(new w.Event('pagehide'));dom.window.close();}
 };
}
module.exports={screen,until,pause};
