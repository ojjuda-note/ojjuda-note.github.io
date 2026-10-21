const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'games/poker/index.html'),'utf8');
const source=fs.readFileSync(path.join(root,'games/poker/app.mjs'),'utf8');
const key='ojjuda.poker.practice.v1.test-adult';
(async()=>{
  const rules=await import('../games/poker/engine.mjs');
  const opened=[];
  function screen(saved=null){
    const dom=new JSDOM(html,{url:'https://fixture.test/games/poker/index.html',runScripts:'outside-only',pretendToBeVisual:true});opened.push(dom);
    const w=dom.window,messages=[],sounds=[],jobs=new Map();let serial=0;
    const parent={postMessage:m=>messages.push(m)};Object.defineProperty(w,'parent',{value:parent});
    w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
    w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
    w.setTimeout=(fn,ms)=>{const id=++serial;jobs.set(id,{fn,ms});return id;};w.clearTimeout=id=>jobs.delete(id);
    if(saved)w.localStorage.setItem(key,saved);
    w.__rules=rules;
    const audio={enabled:true,volume:.45};
    w.__audio={createPokerSound:()=>({settings:()=>({...audio}),configure:v=>Object.assign(audio,v),unlock:()=>Promise.resolve(true),play:cue=>sounds.push(cue),pause:()=>sounds.push('pause')})};
    w.eval(source.replace(/^import \{([^}]+)\} from [^;]+;/,'const {$1}=window.__rules;').replace(/^import \{([^}]+)\} from [^;]+;/m,'const {$1}=window.__audio;'));
    const message=(data,origin='https://fixture.test')=>w.dispatchEvent(new w.MessageEvent('message',{data,source:parent,origin}));
    const click=selector=>{const b=w.document.querySelector(selector);assert.ok(b,selector);assert.equal(b.disabled,false,selector+' enabled');b.click();};
    const tick=()=>{const entry=[...jobs].find(([,j])=>j.ms<1000);if(entry){jobs.delete(entry[0]);entry[1].fn();return true;}return false;};
    return {w,messages,sounds,message,click,tick,init:()=>message({source:'ojjuda-world',type:'poker-init',owner:'test-adult'})};
  }
  try{
    const s=screen();assert.equal(s.messages[0].type,'ready');
    s.message({source:'ojjuda-world',type:'poker-init',owner:'test-adult'},'https://untrusted.test');
    assert.equal(s.w.document.querySelector('[data-action="start"]'),null,'untrusted frame cannot initialize');
    s.init();s.click('[data-action="sound"]');
    assert.equal(s.w.document.querySelector('#sound-dialog').open,true);
    const volume=s.w.document.querySelector('#sound-volume');volume.value=25;volume.dispatchEvent(new s.w.Event('input',{bubbles:true}));
    s.w.document.querySelector('#sound-enabled').click();
    assert.deepEqual(JSON.parse(s.w.localStorage.getItem(key)).audio,{enabled:false,volume:.25});
    assert.equal(s.w.document.querySelector('[data-action="sound"]').textContent,'소리 끔');
    s.click('#sound-dialog [data-close-dialog]');s.click('[data-action="start"]');
    assert.ok(s.sounds.includes('deal'));

    assert.equal(s.w.document.querySelectorAll('.my-cards .card').length,4);
    assert.equal(s.w.document.querySelector('[data-action="select"]').disabled,true);
    s.click('[data-card="1"]');
    assert.equal(s.w.document.querySelectorAll('.my-cards .dealing').length,0,'selecting a card does not replay the deal');
    assert.equal(s.w.document.querySelectorAll('.seat .back img').length,0,'hidden cards never render face assets');
    for(const img of s.w.document.querySelectorAll('.card-face'))assert.ok(fs.existsSync(path.join(root,'games/poker',img.getAttribute('src'))),'card artwork exists');
    s.click('[data-action="select"]');
    assert.equal(s.w.document.querySelectorAll('.my-cards .card').length,3);assert.ok(s.sounds.includes('select'));assert.ok(s.sounds.includes('discard'));
    s.click('[data-card="0"]');s.click('[data-action="select"]');
    assert.equal(s.w.document.querySelectorAll('.my-cards .card').length,4);
    assert.equal(s.w.document.querySelectorAll('.my-cards .public').length,2);assert.equal(s.w.document.querySelectorAll('.my-cards .dealing').length,1,'only the fourth card animates after opening');assert.ok(s.sounds.includes('reveal'));
    for(const seat of s.w.document.querySelectorAll('.seat'))assert.equal(seat.querySelectorAll('.card:not(.back)').length,2,'only two public opponent cards initially');
    s.click('[data-seat="1"]');assert.equal(s.w.document.querySelectorAll('#cards-content .back').length,2,'zoom cannot expose hidden cards');
    s.w.document.querySelector('#cards-dialog [data-close-dialog]').click();
    const saved=s.w.localStorage.getItem(key),r=screen(saved);r.init();r.click('[data-action="resume"]');
    assert.equal(r.w.document.querySelectorAll('.my-cards .card').length,4,'saved in-flight deal resumes');assert.equal(r.w.document.querySelector('[data-action="sound"]').textContent,'소리 끔','sound preferences restored');
    let steps=0;
    while(!r.w.document.querySelector('.result-banner')){
      assert.ok(++steps<200,'UI hand finishes');
      const call=r.w.document.querySelector('.actions .call');
      if(call)call.click();else assert.ok(r.tick(),'scheduled AI advances');
    }
    const done=JSON.parse(r.w.localStorage.getItem(key));assert.equal(done.rounds,1);assert.equal(done.saved.phase,'finished');
    r.click('[data-action="lobby"]');assert.ok(r.w.document.querySelector('[data-action="start"]'));
    assert.equal(JSON.parse(r.w.localStorage.getItem(key)).rounds,1,'opening lobby cannot count hand twice');
    s.message({source:'ojjuda-world',type:'poker-exit-request'});assert.equal(s.w.document.querySelector('#exit-dialog').open,true);
    s.click('#confirm-exit');assert.equal(s.messages.at(-1).type,'exit','Back exits through parent');
    const conflicting=screen(saved);conflicting.init();conflicting.w.dispatchEvent(new conflicting.w.StorageEvent('storage',{key,newValue:'changed'}));
    assert.match(conflicting.w.document.body.textContent,/다른 창에서 진행/);
    conflicting.w.dispatchEvent(new conflicting.w.Event('pagehide'));assert.equal(conflicting.w.localStorage.getItem(key),saved,'conflicting tab cannot overwrite progress');
    const low=screen(JSON.stringify({bank:800,rounds:1,wins:0}));low.init();low.click('[data-action="refill"]');
    assert.equal(JSON.parse(low.w.localStorage.getItem(key)).bank,5800,'refill adds to remaining gold');
    assert.equal(low.w.document.querySelector('[data-action="refill"]'),null,'no repeated refill above threshold');

    const world=fs.readFileSync(path.join(root,'world.html'),'utf8');
    const gateStyle=world.match(/html:not\(\[data-ojjuda-poker="true"\]\)[^{]+\{[^}]+\}/)[0];
    const dom=new JSDOM('<style>'+gateStyle+'</style><button data-act="game-open" data-v="poker">세븐포커</button>',{url:'https://fixture.test/world.html',runScripts:'outside-only'});opened.push(dom);
    const w=dom.window;let age=19,authChanged,intervals=new Map(),timer=0;
    w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
    w.setInterval=fn=>{intervals.set(++timer,fn);return timer;};w.clearInterval=id=>intervals.delete(id);
    w.eval(fs.readFileSync(path.join(root,'matgo-access.js'),'utf8'));
    w.OjjudaMatgoAccess.configure({auth:{getUser:async()=>({data:{user:{id:'adult'}}}),onAuthStateChange:fn=>{authChanged=fn;return {data:{subscription:{unsubscribe(){}}}};}},rpc:async()=>({data:{age,locked:true}})});
    w.eval(fs.readFileSync(path.join(root,'world-poker-game.js'),'utf8'));
    const card=()=>w.getComputedStyle(w.document.querySelector('[data-v="poker"]')).display;
    assert.equal(card(),'none','unknown age defaults hidden');
    let error='';await w.OjjudaPokerGame.open({owner:'adult',onError:m=>error=m});assert.equal(w.document.querySelector('iframe'),null);assert.match(error,/20세/);
    assert.equal(card(),'none','19-year-olds cannot see the poker card');
    assert.equal(w.OjjudaMatgoAccess.visible(),true,'other adult games keep their existing eligibility');
    age=18;await w.OjjudaPokerGame.open({owner:'adult'});assert.equal(card(),'none');assert.equal(w.document.querySelector('iframe'),null);
    age=20;await w.OjjudaPokerGame.open({owner:'adult'});assert.notEqual(card(),'none');assert.ok(w.document.querySelector('dialog[open]'));assert.ok(w.document.body.classList.contains('gaming'));
    age=19;await w.OjjudaMatgoAccess.refresh();for(const fn of [...intervals.values()])fn();
    assert.equal(card(),'none');assert.equal(w.document.querySelector('iframe'),null,'20-to-19 eligibility change closes game');assert.equal(intervals.size,0,'closing cleans interval');
    age=20;await w.OjjudaPokerGame.open({owner:'adult'});authChanged('SIGNED_OUT',null);
    assert.equal(card(),'none');assert.equal(w.document.querySelector('iframe'),null,'logout hides and closes game');
    age=null;await w.OjjudaPokerGame.open({owner:'adult'});assert.equal(card(),'none');assert.equal(w.document.querySelector('iframe'),null,'missing age denied');
    assert.match(world,/OjjudaPokerGame\?\.close\(\)/,'opening another game closes poker');
    console.log('PASS: poker selection, public cards, zoom privacy, AI turn flow, restore, refill, exit, tab conflict, sound settings and 19/20 age access');
  }finally{opened.forEach(d=>d.window.close());}
})().catch(e=>{console.error(e);process.exitCode=1;});
