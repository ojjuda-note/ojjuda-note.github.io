const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{fixture,A}=require('./matgo-online-fixture.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const wait=async check=>{for(let i=0;i<400;i++){if(check())return;await new Promise(r=>setTimeout(r,5));}throw Error('entry did not settle');};
(async()=>{
 // Muting sound or lacking Web Audio must never bypass the solo entrance.
 for(const muted of [false,true]){
  const dom=new JSDOM('<html data-viewport-page="matgo-solo"><body></body></html>',{url:'https://fixture.test',runScripts:'outside-only'}),w=dom.window;
  try{
   w.localStorage.setItem('ojjuda-matgo-sound',muted?'off':'on');
   w.eval(read('games/matgo-start.mjs').replace(/export function/g,'function')+'\nwindow.entry=waitForMatgoStart;window.openSolo=openMatgoSolo;');
   assert.equal(w.openSolo({isTrusted:false}),false,'synthetic clicks cannot hand off a start');
   assert.equal(w.sessionStorage.getItem('ojjuda-matgo-entry-handoff'),null);
   let started=false;const pending=w.entry();pending.then(()=>{started=true;});await Promise.resolve();
   assert.equal(started,false);assert.ok(w.document.querySelector('#matgo-start-play'));
   assert.equal(w.entry(),pending,'repeated initialization shares one entrance');
   assert.equal(w.document.querySelectorAll('#matgo-start').length,1);
   w.document.querySelector('#matgo-start-play').click();await Promise.resolve();
   assert.equal(started,false,'synthetic clicks cannot start a round');
  }finally{w.close();}
 }
 for(const kind of ['valid','reloaded','expired','future','mismatch','query-only']){
  const dom=new JSDOM('<html data-viewport-page="matgo-solo"><body></body></html>',{url:'https://fixture.test/games/matgo.html?entry=once',runScripts:'outside-only'}),w=dom.window;
  try{
   if(!['reloaded','query-only'].includes(kind))w.sessionStorage.setItem('ojjuda-matgo-entry-handoff',JSON.stringify({id:kind==='mismatch'?'other':'once',at:Date.now()+(kind==='expired'?-61000:kind==='future'?60000:0)}));
   w.eval(read('games/matgo-start.mjs').replace(/export function/g,'function')+'\nwindow.entry=waitForMatgoStart;');
   let started=false;const pending=w.entry();pending.then(()=>started=true);await Promise.resolve();
   assert.equal(started,kind==='valid',kind+' handoff');
   assert.equal(!!w.document.querySelector('#matgo-start-play'),kind!=='valid',kind+' entrance');
   assert.equal(w.sessionStorage.getItem('ojjuda-matgo-entry-handoff'),null,'handoff is always consumed once');
   assert.equal(w.entry(),pending,'repeated starts reuse the same gate');
  }finally{w.close();}
 }
 const f=await fixture();
 try{
  const existing=await f.call(A,{action:'online_create'});assert.ok(existing.room);
  const dom=new JSDOM(read('games/matgo-online.html'),{url:'https://fixture.test/games/matgo-online.html',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
  try{
   const invoke=async(_,{body})=>{calls.push(body);return {data:await f.call(A,body)};};
   w.OjjudaMatgoAccess={check:async()=>{},allowed:()=>true,subscribe:()=>()=>{},getClient:()=>({functions:{invoke},auth:{getSession:async()=>({data:{session:null}})}})};
   const noop=()=>{},wallet={status:async()=>(await invoke('matgo',{body:{action:'status'}})).data};
   w.__entryDeps={shuffledFloorSlots:noop,floorStackIds:noop,CARDS:[],isPi:noop,piVal:noop,score:noop,floorLayout:noop,heldPairMonths:noop,piClaimMessage:noop,cardSVG:noop,backSVG:noop,createWallet:()=>wallet,createOnlineMotion:()=>({cancel:noop}),createOnlineSound:()=>({cancel:noop}),cpuPortraitHTML:noop,createVentControls:()=>({sync:noop})};
   const source=read('games/matgo-online.mjs').replace(/^import \{([^}]+)\} from '[^']+';/gm,(_,names)=>`const {${names.replace(/ as /g,':')}}=window.__entryDeps;`);
   await w.eval('(async()=>{'+source+'\n})()');
   assert.ok(w.document.querySelector('.game-entry #resume-room'));
   assert.equal(w.document.querySelector('.waiting'),null);
   assert.deepEqual(calls.map(b=>b.action),['status'],'reopening does not automatically enter the saved match');
   w.document.querySelector('#resume-room').click();
   await wait(()=>w.document.querySelector('#invite-code'));
   assert.equal(w.document.querySelector('#invite-code').textContent,existing.room.code);
   assert.deepEqual(calls.map(b=>b.action),['status','online_read'],'resume reads the same room without creating a match or charging gold');
  }finally{w.close();}
 }finally{await f.db.close();}
 console.log('PASS: muted/no-audio solo entrance, one start gate, and explicit multiplayer resume through real server rules');
})().catch(error=>{console.error(error);process.exitCode=1;});
