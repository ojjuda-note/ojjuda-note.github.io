const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(path.join(__dirname,'../daily-updates.js'),'utf8');
const tick=async()=>{for(let n=0;n<5;n++)await new Promise(r=>setImmediate(r));};
const notice={id:'2026-11-06',date:'2026-11-06',items:['게임 뒤로가기 개선','축제·공연 일정 추가']};
function setup({user='member-a',read=false,ready=true,block=false,rpc:custom,stored,now='2026-11-06T14:59:59.000Z'}={}){
 const dom=new JSDOM('<!doctype html><body><main id="app"><button id="previous">게임</button></main><div id="modal-root"></div>',{url:'https://ojjuda.test/world.html',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,state={user,read,ready,block,ackFail:false,requests:[],timers:[],notice:structuredClone(notice)};
 w.Date.now=()=>Date.parse(now);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.setTimeout=(fn,delay)=>{state.timers.push({fn,delay});return state.timers.length;};w.clearTimeout=()=>{};
 if(stored)for(const [k,v]of Object.entries(stored))w.localStorage.setItem(k,v);
 const client={rpc:async(name,args)=>{state.requests.push({name,args});if(custom)return custom(name,args,state);
 if(name==='get_daily_update_notice')return {data:{server_now:now,viewer:state.user,notice:state.read?null:state.notice}};
 if(state.ackFail)return{error:Error('offline')};state.read=true;return{data:true};}};
 w.eval(source);const api=w.OjjudaDailyUpdates.install({client,getUserId:()=>state.user,isReady:()=>state.ready,canShow:()=>!state.block});
 return {dom,w,state,api,dialog:w.document.querySelector('dialog'),close:()=>dom.window.close()};
}
test('minimal popup, member receipt, server-side dismissal after a new browser session',async()=>{
 const f=setup();try{await tick();assert.ok(f.dialog.open);assert.equal(f.dialog.querySelectorAll('li').length,2);assert.equal(f.dialog.querySelectorAll('button').length,1);assert.equal(f.dialog.querySelector('button').textContent,'확인');
 assert.ok(f.state.timers.some(t=>t.delay===1000),'schedule at Korea midnight');
 await f.api.acknowledge();assert.ok(!f.dialog.open);await f.api.refresh(true);assert.ok(!f.dialog.open);
 assert.equal(f.state.requests.filter(r=>r.name==='acknowledge_daily_update_notice').length,1);
 const fresh=setup({read:true});try{await tick();assert.ok(!fresh.dialog.open);}finally{fresh.close();}
 }finally{f.close();}
});
test('guest confirmation survives reload, and another account is independent',async()=>{
 const f=setup({user:null});try{await tick();await f.api.acknowledge();assert.ok(!f.dialog.open);
 const stored=Object.fromEntries(Object.keys(f.w.localStorage).map(k=>[k,f.w.localStorage.getItem(k)]));
 const fresh=setup({user:null,stored});try{await tick();assert.ok(!fresh.dialog.open);fresh.state.user='member-b';fresh.api.sync();await tick();assert.ok(fresh.dialog.open);}finally{fresh.close();}
 }finally{f.close();}
});
test('unready auth, another dialog, games and admin defer without consuming a notice',async()=>{
 const f=setup({ready:false});try{await tick();assert.equal(f.state.requests.length,0);f.state.ready=true;f.state.block=true;f.api.sync();await tick();assert.ok(!f.dialog.open);
 f.state.block=false;f.w.document.querySelector('#modal-root').innerHTML='<div>진행 중인 게임</div>';await tick();assert.ok(!f.dialog.open);
 f.w.document.querySelector('#modal-root').replaceChildren();await tick();assert.ok(f.dialog.open);
 f.state.block=true;f.api.sync();assert.ok(!f.dialog.open);assert.equal(f.state.requests.filter(r=>r.name==='acknowledge_daily_update_notice').length,0);
 f.state.block=false;f.api.sync();assert.ok(f.dialog.open);
 }finally{f.close();}
});
test('failed receipt remains retryable; empty days do not show a popup',async()=>{
 const f=setup();try{await tick();f.state.ackFail=true;await f.api.acknowledge();assert.ok(f.dialog.open);assert.ok(f.dialog.textContent.includes('다시 눌러'));assert.ok(!f.dialog.querySelector('button').disabled);
 f.state.ackFail=false;await f.api.acknowledge();assert.ok(!f.dialog.open);f.state.read=false;f.state.notice=null;await f.api.refresh(true);assert.ok(!f.dialog.open);
 }finally{f.close();}
});
test('stale account response cannot display another account notice',async()=>{
 let resolve;
 const f=setup({rpc:(name,args,state)=>state.user==='member-a'?new Promise(r=>resolve=r):Promise.resolve({data:{viewer:state.user,server_now:'2026-11-06T15:00:00Z',notice:null}})});
 try{f.state.user='member-b';f.api.sync();await tick();resolve({data:{viewer:'member-a',notice}});await tick();assert.ok(!f.dialog.open);}finally{f.close();}
});
test('new next-day notice shows; cross-tab receipt closes it; markup is text only',async()=>{
 const f=setup();try{await tick();await f.api.acknowledge();f.state.read=false;f.state.notice={id:'2026-11-07',date:'2026-11-07',items:['<img src=x onerror=alert(1)>']};await f.api.refresh(true);assert.ok(f.dialog.open);assert.equal(f.dialog.querySelector('img'),null);
 f.w.localStorage.setItem('ojjuda-daily-update-read:member-a','2026-11-07');f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:'ojjuda-daily-update-read:member-a'}));assert.ok(!f.dialog.open);
 }finally{f.close();}
});
