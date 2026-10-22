const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom'),{fixture}=require('./poker-online-fixture.cjs'),{screen,until,pause}=require('./poker-ui-fixture.cjs');
const root=path.join(__dirname,'..');
(async()=>{
 // Settle real side pots, then render the server-shaped snapshot through the normal bridge.
 // A side-pot payout can be smaller than the player's total contribution.
 const {SevenPoker,evaluateFive,compare}=await import('../games/poker/engine.mjs');
 const guide=new JSDOM(fs.readFileSync(path.join(root,'games/poker/index.html'),'utf8'));
 try{
  const rows=[...guide.window.document.querySelectorAll('.rank-list li')];assert.equal(rows.length,13);
  let previous=null;
  for(const row of rows){
   const images=[...row.querySelectorAll('.rank-card')];assert.equal(images.length,5);
   const cards=images.map(image=>{
    const src=image.getAttribute('src');assert.ok(fs.existsSync(path.join(root,'games/poker',src)),src);
    const [,suit,face]=src.match(/\/([CHDS])-(\d+|[JQKA])\.svg$/);
    return 'CHDS'.indexOf(suit)*13+({J:11,Q:12,K:13,A:14}[face]||Number(face))-2;
   });
   assert.equal(new Set(cards).size,5);const hand=evaluateFive(cards);
   assert.equal(hand.name,row.querySelector('h3').textContent,'every pictured example must match the actual game rules');
   if(previous)assert.ok(compare(previous,hand.score)>0,'pictured ranks descend in game strength');
   previous=hand.score;
  }
 }finally{guide.window.close();}
 for(const scenario of [
  {totals:[1001,50,510,1001],title:'일부 판돈 획득',received:982,net:-19},
  {totals:[1500,50,510,1500],title:'일부 판돈 획득',received:1980,net:480},
  {totals:[1020,50,510,1020],title:'일부 판돈 획득',received:1020,net:0},
  {totals:[1001,50,510,1001],swap:2,title:'승리했습니다',received:2562,net:1561,victory:true},
  {totals:[1200,50,1001,1001],swap:3,title:'두리 승리',received:199,net:-1001}
 ]){
  const g=new SevenPoker({names:['나','하루','두리','보리']});
  const hands=[[39,4,45,36,15,28,49],[17,22,2,41,5,7,8],[12,25,9,35,3,10,14],[13,20,43,48,24,31,6]];
  if(scenario.swap)[hands[0],hands[scenario.swap]]=[hands[scenario.swap],hands[0]];
  g.players.forEach((p,i)=>Object.assign(p,{cards:hands[i],up:hands[i].slice(2,6),initial:5000,total:scenario.totals[i],stack:5000-scenario.totals[i],bet:0,folded:i===1}));
  g.street=7;g.finish();
  assert.equal(g.result.net[0],scenario.net);assert.equal(g.result.payouts[0],scenario.received);
  assert.equal(g.result.payouts.reduce((a,b)=>a+b,0),g.pot,'settlement conserves the whole pot');
  // Check another member's rotated view as well as the host's own view.
  for(const seat of [0,2]){
   const room={id:'settled-fixture',mode:'multi',status:'finished',round:1,version:1,seat,hostSeat:0,ready:[false,false,false,false],departed:[false,false,false,false],capacity:4,code:'RESULT',names:g.players.map(p=>p.name),game:{...JSON.parse(JSON.stringify(g)),pot:g.pot,legal:null}};
   const s=await screen({call:async()=>({room,wallet:{gold:g.players[seat].stack,locked:true,free_left:2}})},'result-view');
   try{
    assert.ok(s.find('[data-action=resume]'),'reopening a finished hand shows the entry first');
    assert.equal(s.find('.my-cards'),null);s.click('[data-action=resume]');
    assert.equal(s.find('.result-breakdown div:first-child dd').textContent,scenario.totals[seat].toLocaleString('ko-KR')+' G');
    assert.equal(s.find('.result-breakdown div:last-child dd').textContent,g.result.payouts[seat].toLocaleString('ko-KR')+' G');
    assert.equal(s.find('.result-net-label').textContent,'최종 손익');
    if(seat===0){
     assert.ok(s.find('.felt .table-start-overlay [data-action=online-ready]'),'rematch starts from the table popup');
     s.click('[data-action=inspect-result]');assert.equal(s.find('.table-start-overlay'),null);
     assert.equal(s.find('.player').hasAttribute('inert'),false,'reviewing the result makes cards accessible');
     s.click('[data-action=show-start]');assert.ok(s.find('.felt .table-start-overlay'));
     assert.equal(s.find('.result-copy b').textContent,scenario.title);
     assert.equal(s.find('.result-banner').classList.contains('result-win'),!!scenario.victory);
     const amount=s.find('.result-banner>strong');
     assert.equal(amount.classList.contains('loss'),scenario.net<0);
     assert.equal(amount.textContent,'최종 손익'+(scenario.net>0?'+':'')+scenario.net.toLocaleString('ko-KR')+'G');
    }
   }finally{s.close();}
  }
 }
 console.log('PASS: side-pot losses, profits, break-even, full wins and refunds show accurate settlement details in rotated views');
 const f=await fixture(),opened=[],screens=[];
 try{
  const A=f.users[0],s=await screen(f,A,{animate:true,saved:{bank:999999999,rounds:999,audio:{enabled:false,volume:.25}}});screens.push(s);
  assert.equal(s.last.wallet.gold,5000,'forged legacy local balance is ignored');
  assert.ok(s.find('.waiting-felt .table-start-overlay [data-action=start]'));
  assert.equal(s.requests.some(r=>r.action==='create'),false,'showing the start popup does not spend an ante');
  assert.equal(s.find('[data-action=sound]').textContent,'소리 끔');
  s.click('[data-action=sound]');assert.equal(s.find('#sound-dialog').open,true);
  assert.equal(s.w.document.querySelectorAll('[name=poker-voice]').length,4);
  assert.equal(s.find('[name=poker-voice]:checked').value,'classic','legacy sound settings default to the original voice');
  assert.equal(s.find('[data-action=sound-test]').disabled,true,'preview respects mute');
  const rpcCount=s.requests.length;s.click('[name=poker-voice][value=korean]');
  assert.equal(s.find('[name=poker-voice]:checked').value,'korean');assert.equal(s.requests.length,rpcCount,'voice selection never spends gold or sends a move');
  const soundSettings=JSON.parse(s.w.localStorage.getItem('ojjuda.poker.settings.v2.'+A));
  assert.equal(soundSettings.audio.voiceStyle,'korean');assert.equal(soundSettings.audio.enabled,false);
  s.click('#sound-dialog [data-close-dialog]');
  s.click('[data-action=start]');assert.equal(s.find('[data-action=start]').disabled,true);s.find('[data-action=start]').click();
  await until(()=>s.find('.is-dealing'),'server solo deal');
  assert.equal(s.requests.filter(r=>r.action==='create').length,1,'repeated start taps create only one hand');
  assert.equal(s.find('.table-start-overlay'),null,'starting dismisses the popup');
  assert.equal(s.find('[data-card="1"]').disabled,true);assert.equal(s.w.document.querySelectorAll('.dealing').length,13);
  s.finishDeal();assert.equal(s.sounds.filter(x=>x==='card').length,13);
  assert.ok(s.motionTime<=1200,'the initial deal finishes within 1.2 seconds');
  assert.ok(s.w.document.body.classList.contains('poker-playing'));
  assert.equal(s.messages.find(x=>x.type==='table-view'&&x.playing)?.playing,true);
  assert.equal(s.w.document.querySelectorAll('.back .card-index').length,0,'large indices never reveal hidden cards');
  const throws=s.flights.filter(x=>x.node.classList.contains('flying-card'));
  assert.equal(throws.length,13);assert.deepEqual(throws.slice(0,8).map(x=>Number.parseFloat(x.node.style.left)),[100,330,560,220,135,365,595,255]);
  assert.ok(throws.every(x=>!x.node.querySelector('img')),'moving card backs hide opponents');
  assert.equal(s.w.document.querySelectorAll('.my-cards .card').length,4);
  s.click('[data-card="1"]');assert.equal(s.w.document.querySelectorAll('.my-cards .dealing').length,0);
  const call=f.call;let rejectMove;
  f.call=(actor,body)=>body.action==='move'?new Promise(resolve=>{rejectMove=()=>resolve({error:'invalid_move'});}):call(actor,body);
  const beforeMove=s.requests.length;s.click('[data-action=select]');
  assert.equal(s.find('.actions').getAttribute('aria-busy'),'true');
  assert.equal(s.find('[data-action=select]').disabled,true);assert.match(s.find('#status').textContent,/반영/);
  s.find('[data-action=select]').click();assert.equal(s.requests.length,beforeMove+1,'repeated taps submit only one move');
  rejectMove();await until(()=>!s.find('.actions').hasAttribute('aria-busy'),'failed move unlock');
  assert.equal(s.find('[data-card="1"]').getAttribute('aria-pressed'),'true','failed request retains the selected card');
  assert.equal(s.find('[data-action=select]').disabled,false);assert.equal(s.sounds.includes('discard'),false,'failed move does not play a success cue');
  f.call=call;s.click('[data-action=select]');
  await until(()=>s.w.document.querySelectorAll('.my-cards .card').length===3,'server discard');
  const originalHand=[...s.last.room.game.players[0].cards];
  s.click('[data-card="0"]');
  assert.equal(s.find('.public-cards .card').dataset.card,'0','selected public card moves to the right group');
  assert.deepEqual([...s.w.document.querySelectorAll('.private-cards .card')].map(c=>c.dataset.card),['1','2'],'private cards stay together on the left');
  assert.match(s.find('.public-cards .card').getAttribute('aria-label'),/공개 예정/,'selection is a preview until confirmed');
  s.click('[data-card="2"]');
  assert.equal(s.find('.public-cards .card').dataset.card,'2','changing the selection moves the intended card');
  assert.deepEqual([...s.last.room.game.players[0].cards],originalHand,'visual grouping never reorders the server hand');
  s.click('[data-action=select]');await until(()=>s.last.room.game.phase==='betting','server open');await pause();
  assert.ok(s.last.room.game.players[0].up.includes(originalHand[2]),'the original selected index is sent to the server');
  assert.equal(s.find('.public-cards [data-card="2"]').classList.contains('public'),true);
  assert.equal(s.w.document.querySelectorAll('.private-cards .card').length,2);

  assert.equal(s.w.document.querySelectorAll('.my-cards .dealing').length,1);s.finishDeal();
  assert.ok(s.sounds.includes('discard'));assert.ok(s.sounds.includes('reveal'));
  s.click('[data-seat="1"]');assert.equal(s.w.document.querySelectorAll('#cards-content .back').length,2);s.click('#cards-dialog [data-close-dialog]');
  s.message({source:'ojjuda-world',type:'poker-exit-request'});s.click('#confirm-exit');assert.equal(s.messages.at(-1).type,'exit');
  const resumed=await screen(f,A,{settings:soundSettings});screens.push(resumed);assert.equal(resumed.last.room.game.phase,'betting','server resumes the same solo round');
  assert.ok(resumed.find('.table-start-overlay [data-action=resume]'),'saved solo hand opens at the entry');
  assert.equal(resumed.find('.my-cards'),null,'cards stay hidden until resume is selected');
  const reads=resumed.requests.length;await resumed.poll();assert.equal(resumed.requests.length,reads,'solo entry does not advance computer turns');
  resumed.click('[data-action=resume]');await pause();assert.ok(resumed.find('.my-cards'),'resume opens the saved hand without a new ante');
  resumed.click('[data-action=sound]');assert.equal(resumed.find('[name=poker-voice]:checked').value,'korean','selected Korean voice survives reopening');
  resumed.click('#sound-enabled');assert.equal(resumed.find('[data-action=sound-test]').disabled,false);
  resumed.click('[data-action=sound-test]');assert.equal(resumed.sounds.at(-1),'half');resumed.click('#sound-dialog [data-close-dialog]');
  const spokenSeats=()=>new Set(resumed.soundCalls.filter(call=>Number.isInteger(call.seat)&&!call.foleyOnly).map(call=>call.seat));
  for(let step=0;step<24&&spokenSeats().size<4;step++){
   const room=resumed.last.room,g=room.game;
   assert.notEqual(g.phase,'finished','all four seats speak before the hand ends');
   if(g.phase==='betting'&&g.turn===0){
    const version=room.version;resumed.click(g.legal.check?'[data-action=check]':'[data-action=call]');
    await until(()=>resumed.last.room.version>version,'own confirmed action');
   }else{
    await f.db.query("update ojjuda_poker_internal.rooms set deadline=clock_timestamp()-interval '1 second' where id=$1",[room.id]);
    await resumed.poll();
   }
  }
  assert.deepEqual([...spokenSeats()].sort(),[0,1,2,3],'the real solo flow identifies me and all three computers');
  resumed.click('[data-action=online-leave]');resumed.click('#confirm-exit');await until(()=>resumed.last.room===null,'solo leave settlement');
  assert.equal(resumed.last.wallet.locked,false);
  await f.db.query('update ojjuda_poker_internal.wallets set gold=1000 where user_id=$1',[A]);
  const threshold=await screen(f,A);screens.push(threshold);assert.equal(threshold.find('[data-action=refill]'),null,'exactly 1,000 G cannot refill');
  await f.db.query('update ojjuda_poker_internal.wallets set gold=999 where user_id=$1',[A]);
  const refill=await screen(f,A);screens.push(refill);refill.click('[data-action=refill]');await until(()=>refill.last.wallet.free_left===1,'first free refill');assert.equal(refill.last.wallet.gold,5999);assert.equal(refill.find('[data-action=refill]'),null);
  await f.db.query('update ojjuda_poker_internal.wallets set gold=800,free_used=2 where user_id=$1',[A]);
  const paid=await screen(f,A);screens.push(paid);paid.click('[data-action=refill]');assert.equal(paid.find('#refill-dialog').open,true);assert.match(paid.find('#refill-dialog').textContent,/5쭈/);
  assert.equal(paid.requests.some(x=>x.action==='refill'),false,'opening paid confirmation cannot debit coins');
  paid.click('#refill-dialog [data-close-dialog]');assert.equal(paid.requests.some(x=>x.action==='refill'),false,'cancel never debits');
  paid.click('[data-action=refill]');paid.click('#confirm-refill');await until(()=>paid.last.wallet.charged===5,'paid refill');assert.equal(paid.last.wallet.coins,15);assert.equal(paid.last.wallet.gold,5800);assert.equal(paid.find('#refill-dialog').open,false);
    const world=fs.readFileSync(path.join(root,'world.html'),'utf8');
    const gateStyle=world.match(/html:not\(\[data-ojjuda-poker="true"\]\)[^{]+\{[^}]+\}/)[0];
    const dom=new JSDOM('<style>'+gateStyle+'</style><button data-act="game-open" data-v="poker">세븐포커</button>',{url:'https://fixture.test/world.html',runScripts:'outside-only'});opened.push(dom);
    const w=dom.window;let age=18,authChanged,intervals=new Map(),timer=0;
    w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
    w.setInterval=fn=>{intervals.set(++timer,fn);return timer;};w.clearInterval=id=>intervals.delete(id);
    w.eval(fs.readFileSync(path.join(root,'matgo-access.js'),'utf8'));
    w.OjjudaMatgoAccess.configure({auth:{getUser:async()=>({data:{user:{id:'adult'}}}),onAuthStateChange:fn=>{authChanged=fn;return {data:{subscription:{unsubscribe(){}}}};}},rpc:async()=>({data:{age,locked:true}})});
    w.eval(fs.readFileSync(path.join(root,'world-poker-game.js'),'utf8'));
    const card=()=>w.getComputedStyle(w.document.querySelector('[data-v="poker"]')).display;
    assert.equal(card(),'none','unknown age defaults hidden');
    let error='';await w.OjjudaPokerGame.open({owner:'adult',onError:m=>error=m});assert.equal(w.document.querySelector('iframe'),null);assert.match(error,/19세/);
    assert.equal(card(),'none','18-year-olds cannot see the poker card');
    assert.equal(w.OjjudaMatgoAccess.visible(),false,'underage members cannot access adult games');
    age=18;await w.OjjudaPokerGame.open({owner:'adult'});assert.equal(card(),'none');assert.equal(w.document.querySelector('iframe'),null);
    age=19;await w.OjjudaPokerGame.open({owner:'adult'});assert.notEqual(card(),'none');assert.ok(w.document.querySelector('dialog[open]'));assert.ok(w.document.body.classList.contains('gaming'));
    const tableDialog=w.document.querySelector('dialog'),frame=w.document.querySelector('iframe');
    const viewMessage=(origin,source,playing)=>w.dispatchEvent(new w.MessageEvent('message',{origin,source,data:{source:'ojjuda-poker',type:'table-view',playing}}));
    viewMessage('https://other.invalid',frame.contentWindow,true);assert.equal(tableDialog.classList.contains('poker-table-open'),false,'foreign origins cannot change the game shell');
    viewMessage(w.location.origin,w,true);assert.equal(tableDialog.classList.contains('poker-table-open'),false,'unrelated windows cannot change the game shell');
    viewMessage(w.location.origin,frame.contentWindow,true);assert.ok(tableDialog.classList.contains('poker-table-open'),'playing uses the complete viewport');
    viewMessage(w.location.origin,frame.contentWindow,false);assert.equal(tableDialog.classList.contains('poker-table-open'),false,'entry restores the shared game header');
    age=18;await assert.rejects(()=>w.OjjudaMatgoAccess.refresh(),/19세/);for(const fn of [...intervals.values()])fn();
    assert.equal(card(),'none');assert.equal(w.document.querySelector('iframe'),null,'19-to-18 eligibility change closes game');assert.equal(intervals.size,0,'closing cleans interval');
    age=19;await w.OjjudaPokerGame.open({owner:'adult'});authChanged('SIGNED_OUT',null);
    assert.equal(card(),'none');assert.equal(w.document.querySelector('iframe'),null,'logout hides and closes game');
    age=null;await w.OjjudaPokerGame.open({owner:'adult'});assert.equal(card(),'none');assert.equal(w.document.querySelector('iframe'),null,'missing age denied');
    assert.match(world,/OjjudaPokerGame\?\.close\(\)/,'opening another game closes poker');
    console.log('PASS: server solo, dealer flight order and privacy, sound, resume, account refills, paid confirmation and 18/19 bridge access');
 }finally{screens.forEach(s=>s.close());opened.forEach(d=>d.window.close());await f.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
