import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createThrow,sampleThrow,drawRack,drawThrow} from '../games/yut/toss.mjs';
import {createBoard} from '../games/yut/board.mjs';
import {FINISH,newGame,nodeName} from '../games/yut/rules.mjs';

test('each stick rebounds briefly once and settles on its rolled face in the pile',()=>{
  const arrangements=new Set();
  for(let bits=0;bits<16;bits++){
    const faces=[0,1,2,3].map(i=>(bits>>i)&1);
    const plan=createThrow(faces,123+bits);
    const rest=sampleThrow(plan,plan.totalMs),upper=rest[plan.upper];
    assert.notEqual(plan.upper,plan.base);
    assert.equal(upper.baseIndex,plan.base);
    assert.ok(upper.contact && upper.contact.gap<.001 && Math.abs(upper.pitch)>.05);
    arrangements.add([plan.base,plan.upper,Math.round(upper.yaw*10)].join('/'));
    for(const rod of plan.rods){
      const at=t=>sampleThrow(plan,t)[rod.index];
      const impact=rod.delay+rod.flight;
      const apex=at(rod.delay+rod.flight*.5).height, contact=at(impact);
      const rebound=at(impact+rod.bounce*.5);
      assert.ok(apex>150);
      assert.ok(Math.abs(contact.arc)<.001&&Math.abs(contact.pitch)>.1);
      assert.ok(rod.bounce>=150 && rod.bounce<=250);
      assert.ok(rebound.phase==='bounce' && rebound.arc>apex*.012 && rebound.arc<apex*.1);
      for(let t=impact+rod.bounce+1;t<=plan.totalMs;t+=16)assert.equal(at(t).arc,0);
      for(const boundary of [impact,impact+rod.bounce,rod.finish]){
        const left=at(boundary-.01),right=at(boundary+.01);
        assert.ok(Math.hypot(left.x-right.x,left.depth-right.depth,left.height-right.height)<.1);
      }
      const end=at(plan.settleMs+1);
      assert.ok(end.settled);
      if(rod.index!==plan.upper)assert.equal(end.height,0);
      assert.equal(end.roll,rod.face===1?0:Math.PI);
    }
    assert.ok(plan.totalMs-plan.settleMs>=450);
  }
  assert.ok(arrangements.size>4);
});

test('the same single flat face bears the backdo inscription in the rack and landed throw',()=>{
  let count=0;const gradient=()=>({addColorStop(){}});
  const ctx=new Proxy({createLinearGradient:gradient,createRadialGradient:gradient,fillText(text){if(text==='한 칸 뒤로')count++;}},
    {get:(target,key)=>target[key]??(()=>{})});
  drawRack(ctx,400,85);assert.equal(count,1);
  for(let mask=0;mask<16;mask++){
    const faces=Array.from({length:4},(_,i)=>(mask>>i)&1),plan=createThrow(faces,903+mask);
    count=0;drawRack(ctx,390,70,faces,903+mask);assert.equal(count,faces[3]);
    count=0;drawThrow(ctx,390,500,plan,plan.totalMs);assert.equal(count,faces[3]);
  }
});

test('the arcade entrance, piece controls, winning move and rematch work together',async t=>{
  const html=readFileSync(new URL('../games/yut/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://example.test/games/yut/',runScripts:'outside-only'});
  const {window:w}=dom, doc=w.document, frames=new Map();
  const prefs={matches:false,addEventListener(){}};
  for(const [key,val] of Object.entries({window:w,document:doc,location:w.location,history:w.history,matchMedia:()=>prefs})){
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:val});
  }
  let fid=0;
  globalThis.requestAnimationFrame=f=>{frames.set(++fid,f);return fid;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  const gradient=()=>({addColorStop(){}});
  const marks=new Map();
  const ctx=new Proxy({createLinearGradient:gradient,createRadialGradient:gradient,fillText:(word,x,y)=>marks.set(word,[x,y])},{get(target,key){return target[key]??(()=>{});}});
  w.HTMLCanvasElement.prototype.getContext=()=>ctx;
  w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({width:390,height:500,left:0,top:0});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.matchMedia=()=>prefs;
  w.eval(readFileSync(new URL('../shared/games/game-results.js',import.meta.url),'utf8'));
  t.after(()=>dom.window.close());
  const first=()=>doc.querySelector('#actions button'), text=id=>doc.getElementById(id).textContent;
  const tick=()=>{const queued=[...frames.values()];frames.clear();queued.forEach(f=>f(performance.now()+4000));};
  const until=async(pred,limit=100)=>{for(let i=0;i<limit;i++){if(pred())return;await new Promise(r=>setTimeout(r,20));}assert.fail('state did not arrive');};
  const firstSeatReady=async()=>{
    const layer=doc.getElementById('first-seat');
    assert.equal(layer.hidden,false);
    assert.equal(first().textContent,'선 정하기');
    assert.equal(first().disabled,false);
    assert.equal(layer.classList.contains('resolved'),false);
    first().click();
    assert.equal(first().disabled,true);
    await until(()=>layer.classList.contains('resolved'),260);
    assert.match(text('first-seat-heading'),/1번 산호 팀부터 시작/);
    assert.equal(layer.hidden,false);
    assert.equal(first().textContent,'시작하기');
    assert.equal(first().disabled,false);
    first().click();
    assert.equal(layer.hidden,true);
  };
  const drawFirstSeat=()=>{
    let calls=0;
    t.mock.method(Math,'random',()=>calls++===3?0:.99);
  };
  function setFaces(n){let i=0;t.mock.method(Math,'random',()=>i++%4<n?0.1:0.9);}
  const selected=()=>doc.querySelector('#reserve-pawns [aria-pressed="true"], #move-tools:not([hidden]) [data-pawn][aria-pressed="true"]')?.dataset.pawn;
  const reserve=doc.getElementById('reserve-pawns');
  // Keep the opening route ordinary by placing all effects at the end of the candidate list.
  t.mock.method(Math,'random',()=>.99);
  await import('../games/yut/play.mjs');
  const dialogButton=name=>[...doc.querySelectorAll('#dialog-body button')].find(b=>b.textContent===name);
  const selectValue=(id,value)=>{
    const el=doc.getElementById(id);el.value=String(value);el.dispatchEvent(new w.Event('change'));
  };
  const entryButton=name=>[...doc.querySelectorAll('#entry-controls button')].find(b=>b.textContent===name);
  assert.equal(doc.body.dataset.mpEntry,'true');assert.ok(doc.getElementById('tabletop').hidden);
  assert.equal(entryButton('컴퓨터 대전').getAttribute('aria-pressed'),'true');
  entryButton('온라인 대전').click();assert.equal(doc.getElementById('public-room-host').hidden,false);
  assert.ok(doc.querySelector('[data-arcade-rooms]'));assert.equal(entryButton('방 코드로 참가'),undefined);
  entryButton('같은 기기').click();assert.equal(doc.getElementById('public-room-host').hidden,true);
  const recordNote=doc.querySelector('#entry-controls .ge-copy');
  assert.equal(recordNote.hidden,false);
  assert.match(recordNote.textContent,/첫 번째 팀\(산호 팀\).*내 월간 연승/);
  assert.equal(doc.getElementById('game-mode').value,'island');
  selectValue('team-count',8);assert.equal(doc.getElementById('team-pieces-7').value,'4');
  selectValue('team-count',2);entryButton('컴퓨터 대전').click();assert.equal(recordNote.hidden,true);drawFirstSeat();entryButton('게임 시작하기').click();await firstSeatReady();
  assert.equal(doc.body.dataset.mpEntry,'false');assert.equal(doc.getElementById('tabletop').hidden,false);
  assert.equal(doc.getElementById('entry-controls').childElementCount,0);
  const bonus=doc.getElementById('bonus-roll'),chips=doc.getElementById('result-picker');
  const chip=value=>chips.querySelectorAll('button')[value];
  const tossLayer=doc.getElementById('toss-layer');
  function castPointer(target,type,id=4){
    const e=new w.MouseEvent(type,{bubbles:true,button:0,detail:1});
    Object.defineProperty(e,'pointerId',{value:id});target.dispatchEvent(e);
  }
  const trigger=first();
  castPointer(trigger,'pointerdown');assert.ok(tossLayer.classList.contains('shuffling'));
  tick();tick();assert.equal(first(),trigger);assert.equal(text('toss-label'),'떼면 던져요');
  castPointer(w,'pointerup',9);assert.ok(tossLayer.classList.contains('shuffling'));
  castPointer(w,'pointercancel');assert.equal(tossLayer.hidden,true);
  castPointer(w,'pointerup');assert.equal(first().textContent,'윷 던지기');
  castPointer(trigger,'pointerdown');w.dispatchEvent(new w.Event('blur'));
  assert.equal(tossLayer.hidden,true);
  for(const n of [4,0]){
    setFaces(n);prefs.matches=false;
    if(n===4){
      castPointer(first(),'pointerdown');assert.equal(text('outcome'),'');
      castPointer(w,'pointerup');
    }else{
      const control=first();
      control.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
      control.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',repeat:true,bubbles:true,cancelable:true}));
      tick();assert.ok(tossLayer.classList.contains('shuffling'));
      control.dispatchEvent(new w.KeyboardEvent('keyup',{key:' ',bubbles:true,cancelable:true}));
    }
    assert.equal(tossLayer.classList.contains('shuffling'),false);
    assert.ok(bonus.hidden);assert.equal(doc.getElementById('toss-layer').hidden,false);
    tick();await until(()=>first().textContent==='한 번 더 던지기');
    assert.equal(bonus.hidden,false);assert.equal(bonus.querySelectorAll('.game-result-spark').length,24);
    assert.equal(reserve.querySelectorAll('button:enabled').length,0);
  }
  prefs.matches=true;setFaces(3);first().click();
  assert.ok(bonus.hidden);assert.equal(first().textContent,'이동할 칸 선택');
  marks.clear();tick();
  for(const resultName of ['윷','모','걸'])assert.ok(marks.has(resultName));
  assert.equal(reserve.querySelectorAll('button:enabled').length,4);
  assert.deepEqual([...chips.children].map(b=>b.textContent),['윷 4칸','모 5칸','걸 3칸']);
  chip(1).click();reserve.querySelector('[data-pawn="2"]').click();assert.match(first().textContent,/5칸/);first().click();
  assert.deepEqual([...chips.children].map(b=>b.textContent),['윷 4칸','걸 3칸']);
  assert.equal(selected(),undefined);
  assert.equal(doc.querySelectorAll('#pawn-picker button').length,1);
  const tileMenu=()=>[...doc.querySelectorAll('#dialog-body button')];
  const viewAll=()=>{first().click();return tileMenu().map(b=>b.textContent);};
  // Home and the pawn already on square 5 can use either roll, including both forks.
  assert.equal(viewAll().length,6);
  doc.getElementById('close').click();
  const fresh=reserve.querySelector('[data-pawn="0"]');fresh.click();
  assert.equal(viewAll().length,6);doc.getElementById('close').click();
  const taps=()=>{const hits=[];ctx.fillText=(word,x,y)=>{if(word==='걸')hits.push([x,y]);};tick();return hits;};
  const goals=taps();assert.equal(goals.length,3);
  ctx.fillText=(word,x,y)=>marks.set(word,[x,y]);
  // Tap the reserve's three-step landing without choosing a roll.
  first().click();
  const entry=tileMenu().find(b=>b.textContent===nodeName(3)+' · 걸');
  assert.ok(entry);entry.click();
  assert.ok(chips.hidden);assert.match(text('move-result'),/윷 · 4칸/);
  // A roll of five can bring out a fresh pawn, or a roll of one can move the pawn on four.
  t.mock.method(Math,'random',()=>.99);
  doc.getElementById('settings').click();dialogButton('게임 시작').click();drawFirstSeat();dialogButton('계속하기').click();await firstSeatReady();
  for(const n of [4,0,1]){setFaces(n);first().click();}
  chip(0).click();first().click();
  marks.clear();tick();
  const shared=marks.get('모·도');assert.ok(shared);
  doc.getElementById('board').dispatchEvent(new w.MouseEvent('click',{clientX:shared[0],clientY:shared[1],bubbles:true}));
  assert.deepEqual(tileMenu().map(b=>b.textContent).sort(),['1번 말 · 도 1칸','새 말 · 모 5칸'].sort());
  tileMenu().find(b=>b.textContent.startsWith('새 말')).click();
  assert.equal(reserve.querySelectorAll('button').length,2);
  assert.equal(text('move-result'),'도 · 1칸');
  // Restart, bank enough yuts to finish, and watch the final move land.
  t.mock.method(Math,'random',()=>.99);
  doc.getElementById('settings').click();dialogButton('게임 시작').click();drawFirstSeat();dialogButton('계속하기').click();await firstSeatReady();
  setFaces(4);for(let n=0;n<32;n++)first().click();
  assert.equal(bonus.hidden,false);assert.equal(bonus.querySelectorAll('.game-result-spark').length,0);
  setFaces(1);first().click();
  for(let turn=0;turn<50;turn++){
    if(!chips.hidden)chip(0).click();
    if(first().textContent==='골인하기'&&!reserve.querySelector('button')&&doc.querySelectorAll('#pawn-picker button').length===1){
      prefs.matches=false;first().click();break;
    }
    first().click();
  }
  assert.equal(doc.querySelector('.game-result-card'),null);
  await until(()=>doc.querySelector('.game-result-card'));
  const card=doc.querySelector('.game-result-card');
  assert.equal(card.querySelector('.game-result-monthly-link').search,'?game=yut');
  assert.equal(card.querySelectorAll('.yut-round-summary li').length,2);
  assert.match(card.querySelector('.yut-round-summary li').textContent,/1위산호 팀골인 4\/4/);
  assert.equal(card.dataset.resultOutcome,'success');assert.match(card.textContent,/산호 팀 승리!/);
  assert.match(card.textContent,/말 4개 모두 골인/);assert.ok(card.querySelector('.game-result-confetti'));
  assert.ok(card.querySelector('.game-result-spark'));
  const resultButton=label=>[...doc.querySelectorAll('.game-result-actions button')].find(b=>b.textContent===label);
  resultButton('윷판 보기').click();await until(()=>!doc.querySelector('.game-result-card'));
  first().click();assert.equal(doc.querySelectorAll('.game-result-confetti').length,0);
  t.mock.method(Math,'random',()=>.99);drawFirstSeat();resultButton('다시 한 판').click();await firstSeatReady();await until(()=>!doc.querySelector('.game-result-card'));
  assert.equal(doc.querySelector('dialog').open,false);
  assert.equal(text('goals'),'골인 0/4');
  assert.equal(reserve.querySelectorAll('button').length,4);
  assert.equal(first().textContent,'윷 던지기');
  doc.getElementById('settings').click();
  assert.equal(dialogButton('효과음 켜짐').getAttribute('aria-pressed'),'true');
  dialogButton('효과음 켜짐').click();
  assert.equal(dialogButton('효과음 꺼짐').getAttribute('aria-pressed'),'false');
  assert.equal(w.localStorage.getItem('ojjuda.yut.sound'),'off');
  dialogButton('효과음 꺼짐').click();
  assert.equal(w.localStorage.getItem('ojjuda.yut.sound'),'on');
  dialogButton('특수 칸').click();
  const places=[...doc.querySelectorAll('.event-card small')].map(el=>el.textContent);
  assert.deepEqual([...doc.querySelectorAll('.event-card strong')].map(el=>el.textContent),['업기','뒤로','꽝']);
  assert.equal(new Set(places).size,3);
  assert.ok(places.every(place=>place&&!place.includes(' · ')));
  doc.getElementById('close').click();
  // Bank a yut before backdo, use it to enter and then visibly retrace a square.
  prefs.matches=true;setFaces(4);first().click();
  let marked=0;t.mock.method(Math,'random',()=>marked++%4===3?.1:.9);first().click();
  assert.equal(chip(1).textContent,'뒤로 1칸');assert.equal(chip(1).disabled,true);
  chip(0).click();first().click();
  assert.equal(text('move-result'),'뒤로 1칸');
  assert.equal(first().textContent,'뒤로 1칸 이동');first().click();
  doc.getElementById('settings').click();dialogButton('게임 시작').click();drawFirstSeat();dialogButton('계속하기').click();await firstSeatReady();
  prefs.matches=true;setFaces(1);first().click();tick();
  const [x,y]=marks.get('도착');
  doc.getElementById('board').dispatchEvent(new w.MouseEvent('click',{clientX:x,clientY:y,bubbles:true}));
  assert.equal(first().textContent,'컴퓨터 차례');
  doc.getElementById('settings').click();dialogButton('놀이 방법').click();
  assert.equal(doc.querySelectorAll('#dialog-body ol li').length,2);
  assert.equal(doc.querySelector('#dialog-body details').open,false);
  assert.ok(dialogButton('이번 판 특수 칸 보기'));
  doc.getElementById('close').click();doc.getElementById('settings').click();
  const options=doc.querySelector('#dialog-body details');assert.equal(options.open,false);
  const participantCount=doc.getElementById('team-count');
  assert.equal(participantCount.closest('details'),null);
  assert.deepEqual([...participantCount.options].map(o=>Number(o.value)),[2,3,4,5,6,7,8]);
  options.querySelector('summary').click();assert.equal(options.open,true);
  selectValue('team-count',8);assert.equal(doc.getElementById('game-mode').value,'island');
  const animals=new Set();
  for(let t=0;t<8;t++){
    animals.add(doc.getElementById('team-animal-'+t).value);
    assert.equal(doc.getElementById('team-pieces-'+t).value,'4');
    assert.deepEqual([...doc.getElementById('team-pieces-'+t).options].map(o=>o.value),['2','3','4']);
  }
  assert.equal(animals.size,8);
  selectValue('team-count',2);selectValue('team-pieces-0',2);selectValue('team-pieces-1',2);selectValue('game-mode','easy');
  prefs.matches=false;t.mock.method(Math,'random',()=>.99);
  dialogButton('한 기기').click();dialogButton('게임 시작').click();drawFirstSeat();dialogButton('계속하기').click();await firstSeatReady();
  assert.equal(doc.getElementById('event-key'),null);doc.getElementById('settings').click();dialogButton('특수 칸').click();
  assert.equal(text('dialog-title'),'이번 판 특수 칸');assert.equal(doc.querySelectorAll('.event-card').length,3);
  assert.match(text('dialog-body'),/대기 말 하나를 업어요/);doc.getElementById('close').click();
  assert.equal(first().textContent,'윷 던지기');
  const rack=doc.getElementById('rack-canvas');
  assert.equal(rack.getAttribute('aria-label'),'던질 윷 네 가락');assert.equal(text('note'),'');
  assert.equal(rack.width,390);
  assert.equal(rack.height,500);
  assert.equal(text('goals'),'골인 0/2');
  assert.equal(doc.querySelector('.scene').nextElementSibling.id,'reserve');
  assert.equal(reserve.querySelectorAll('button:disabled').length,2);
  assert.match(text('reserve-team'),/산호/);
  setFaces(1);first().focus();first().click();
  assert.equal(doc.getElementById('toss-layer').hidden,false);assert.equal(text('outcome'),'');assert.ok(first().disabled);
  tick();
  await until(()=>first().textContent==='1칸 이동');
  await new Promise(r=>setTimeout(r,350));
  assert.match(text('team-title'),/산호/);
  assert.equal(doc.activeElement,first());
  assert.equal(text('note'),'');assert.match(doc.getElementById('board').getAttribute('aria-description'),/금빛 칸/);
  assert.equal(selected(),'0');
  assert.equal(text('outcome'),'도 · 1칸'); assert.ok(doc.getElementById('toss-layer').hidden);
  assert.equal(rack.getAttribute('aria-label'),'던진 윷 네 가락 · 도 · 1칸');
  tick();
  const canvas=doc.getElementById('board');
  function eventAt(target,type,x,y){
    const e=new w.MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true,cancelable:true});
    Object.defineProperty(e,'pointerId',{value:1});target.dispatchEvent(e);
  }
  const pointer=(type,x,y)=>eventAt(canvas,type,x,y);
  assert.ok(!marks.has('대기 2'));assert.ok(marks.has('도착'));
  const second=reserve.querySelector('[data-pawn="1"]');
  const destination=marks.get('도착');
  eventAt(second,'pointerdown',170,530);eventAt(w,'pointermove',...destination);tick();
  assert.equal(selected(),'1');
  eventAt(w,'pointercancel',...destination);assert.equal(first().textContent,'1칸 이동');
  eventAt(second,'pointerdown',170,530);eventAt(w,'pointermove',170,520);eventAt(w,'pointerup',170,520);
  assert.equal(first().textContent,'1칸 이동');
  eventAt(second,'pointerdown',170,530);eventAt(w,'pointermove',...destination);tick();
  eventAt(w,'pointerup',...destination);
  await until(()=>text('team-title').includes('바다')&&first().textContent==='윷 던지기');
  assert.match(text('reserve-team'),/바다/);
  assert.equal(reserve.querySelectorAll('button:disabled').length,2);
  prefs.matches=true;setFaces(2);first().click();
  assert.ok(doc.getElementById('toss-layer').hidden);
  assert.equal(first().textContent,'2칸 이동');
  first().click();
  assert.equal(rack.getAttribute('aria-label'),'던진 윷 네 가락 · 개 · 2칸');
  setFaces(4);first().click();
  assert.equal(first().textContent,'한 번 더 던지기');
  setFaces(1);first().click();chip(0).click();
  assert.equal(selected(),'1');
  first().click();
  assert.match(text('team-title'),/산호/);
  assert.deepEqual([...doc.querySelectorAll('#actions button')].map(b=>b.textContent),['지름길로 이동','바깥길로 이동']);
  assert.equal(reserve.querySelectorAll('button').length,1);
  const otherPawn=reserve.querySelector('[data-pawn="0"]');
  otherPawn.focus();otherPawn.click();
  assert.equal(selected(),'0');assert.equal(first().textContent,'1칸 이동');
  assert.equal(doc.activeElement.dataset.pawn,'0');
  doc.querySelector('#pawn-picker [data-pawn="1"]').click();tick();
  // A single tap of the sign commits the selected route without a dialog.
  pointer('click',...marks.get('지름길'));
  assert.ok(!doc.querySelector('dialog').open);
  assert.ok(text('team-title').includes('바다'));
  doc.getElementById('team-title').click();assert.ok(doc.querySelector('dialog').open);
  assert.equal(doc.querySelectorAll('.score-card').length,2);
  doc.getElementById('close').click();doc.getElementById('settings').click();
  [...doc.querySelectorAll('#dialog-body button')].find(b=>b.textContent==='놀이 방법').click();
  assert.ok(dialogButton('이번 판 특수 칸 보기'));
  doc.getElementById('close').click();doc.getElementById('settings').click();
  doc.querySelector('#dialog-body details summary').click();
  assert.equal(doc.getElementById('team-animal-0').options.length,12);
  dialogButton('컴퓨터 대결').click();
  selectValue('team-count',3);selectValue('team-pieces-0',4);selectValue('team-pieces-1',3);
  selectValue('team-animal-0',11);selectValue('team-animal-1',6);selectValue('game-mode','island');
  dialogButton('게임 시작').click();drawFirstSeat();dialogButton('계속하기').click();await firstSeatReady();
  doc.getElementById('team-title').click();
  assert.equal(text('goals'),'골인 0/4');
  const scores=doc.querySelectorAll('.score-card');
  assert.equal(scores.length,3);
  for(let i=1;i<=4;i++)assert.ok(scores[0].textContent.includes(i+'번 말 · 돼지'));
  assert.match(scores[1].textContent,/컴퓨터.*골인 0\/3/);
  assert.equal(text('reserve-team'),'산호 · 돼지');
  assert.deepEqual([...reserve.querySelectorAll('button')].map(el=>[el.textContent,el.childElementCount,el.firstElementChild.tagName]),Array(4).fill(['',1,'CANVAS']));
  for(const b of reserve.querySelectorAll('button'))assert.match(b.getAttribute('aria-label'),/돼지/);
  doc.getElementById('close').click();
  setFaces(1);first().click();reserve.querySelector('[data-pawn="3"]').click();first().click();
  assert.match(text('team-title'),/바다/);assert.equal(first().textContent,'컴퓨터 차례');assert.equal(first().disabled,true);
  await until(()=>text('team-title').includes('자두'),450);
  await until(()=>text('team-title').includes('산호'),450);
  assert.equal(first().textContent,'윷 던지기');assert.equal(first().disabled,false);
  doc.getElementById('settings').click();dialogButton('온라인 멀티').click();
  assert.equal(doc.getElementById('setup').hidden,false);
  assert.equal(doc.querySelector('#entry-controls [aria-pressed="true"]').textContent,'온라인 대전');
  assert.ok(doc.querySelector('[data-arcade-rooms]'));
  assert.equal(doc.getElementById('join-code'),null);

});

test('an invited player returning to a finished room sees their own outcome once',async t=>{
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const host=Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url');
  const html=readFileSync(new URL('../games/yut/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://example.test/games/yut/#room='+host,runScripts:'outside-only'});
  const w=dom.window,doc=w.document;
  t.after(()=>w.close());
  w.matchMedia=()=>({matches:true,addEventListener(){}});
  for(const [key,value] of Object.entries({window:w,document:doc,location:w.location,history:w.history,
    sessionStorage:w.sessionStorage,matchMedia:w.matchMedia,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}})){
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  const game=newGame(2);
  game.winner=game.team=1;game.phase='won';game.revision=42;game.pawns[1]=game.pawns[1].map(()=>[FINISH]);
  w.sessionStorage.setItem('island-yut:key:'+host,JSON.stringify(await crypto.subtle.exportKey('jwk',keys.privateKey)));
  w.sessionStorage.setItem('island-yut:state:'+host,JSON.stringify({seats:[host,'guest'],game}));
  let heartbeat;
  t.mock.method(globalThis,'setInterval',callback=>{heartbeat=callback;return 1;});
  const channel={on(){return this;},subscribe(fn){fn('SUBSCRIBED');},async send(){}};
  const saves=[];let attempts=0;
  w.OjjudaGetClient=()=>({channel:()=>channel,async removeChannel(){},auth:{async getSession(){return {data:{session:null}};}}});
  w.OjjudaGuestScores={async yut(round,won){
    saves.push([round,won]);
    if(++attempts===1)throw Error('offline');
    return {ok:true};
  }};
  w.HTMLCanvasElement.prototype.getContext=()=>null;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.eval(readFileSync(new URL('../shared/games/game-results.js',import.meta.url),'utf8'));
  await import('../games/yut/play.mjs?finished-room');
  const wait=async pred=>{for(let n=0;n<100&&!pred();n++)await new Promise(r=>setTimeout(r,10));assert.ok(pred());};
  await wait(()=>heartbeat&&doc.querySelector('.game-result-card'));
  const card=doc.querySelector('.game-result-card');
  assert.equal(card.dataset.resultOutcome,'failure');assert.match(card.textContent,/바다 팀 승리!/);
  assert.equal(card.querySelector('.game-result-effects').childElementCount,0);
  assert.ok(doc.getElementById('setup').hidden);assert.equal(doc.querySelector('.game-result-dialog').open,true);
  const retry=card.querySelector('.yut-round-summary button');
  await wait(()=>!retry.hidden);retry.click();
  await wait(()=>card.textContent.includes('월간 기록 저장됨'));
  assert.match(card.textContent,/산호 팀 패배 · 월간 기록 저장됨/);
  heartbeat();assert.equal(doc.querySelector('.game-result-card'),card);
  assert.deepEqual(saves,[[game.roundId,false],[game.roundId,false]]);
  const online=[...card.querySelectorAll('button')].find(b=>b.textContent==='온라인 대전');online.click();
  await wait(()=>!doc.querySelector('.game-result-card')&&!doc.getElementById('setup').hidden);
  assert.equal(doc.querySelector('#entry-controls [aria-pressed=true]').textContent,'온라인 대전');
  assert.equal(w.location.hash,'');
});

for(const reducedMotion of [false,true])test(`back-to-carry announces the pickup and moves the pair together with reduced motion ${reducedMotion}`,async t=>{
  const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const host=Buffer.from(await crypto.subtle.exportKey('raw',keys.publicKey)).toString('base64url');
  const html=readFileSync(new URL('../games/yut/index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://example.test/games/yut/#room='+host,runScripts:'outside-only'});
  const w=dom.window,doc=w.document,prefs={matches:reducedMotion,addEventListener(){}};
  t.after(()=>w.close());
  w.matchMedia=()=>prefs;
  for(const [key,value] of Object.entries({window:w,document:doc,location:w.location,history:w.history,
    sessionStorage:w.sessionStorage,matchMedia:w.matchMedia,requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}})){
    Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  const game=newGame(2);
  game.phase='move';game.steps=2;game.pendingRolls=[2];game.revision=1;
  game.eventTiles={3:'carry',4:'back'};game.islandTiles={};
  game.pawns[0][0]=[1,2];game.pawns[1][0]=[1,2,3];
  w.sessionStorage.setItem('island-yut:key:'+host,JSON.stringify(await crypto.subtle.exportKey('jwk',keys.privateKey)));
  w.sessionStorage.setItem('island-yut:state:'+host,JSON.stringify({seats:[host,'guest'],game}));
  t.mock.method(globalThis,'setInterval',()=>0);
  const channel={on(){return this;},subscribe(fn){fn('SUBSCRIBED');},async send(){}};
  w.OjjudaGetClient=()=>({channel:()=>channel,async removeChannel(){}});
  w.HTMLCanvasElement.prototype.getContext=()=>null;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  const action=()=>doc.querySelector('#actions button');
  const state=()=>JSON.parse(w.sessionStorage.getItem('island-yut:state:'+host)).game;
  const wait=async pred=>{for(let n=0;n<250&&!pred();n++)await new Promise(r=>setTimeout(r,10));assert.ok(pred());};
  await import('../games/yut/play.mjs?back-carry-'+reducedMotion);
  await wait(()=>doc.querySelector('#pawn-picker [data-pawn="0"]')&&!doc.querySelector('dialog').open);
  doc.querySelector('#pawn-picker [data-pawn="0"]').click();
  assert.equal(action().textContent,'2칸 이동 · 뒤로');
  action().click();
  await wait(()=>action()?.textContent==='한 번 더 던지기'&&!action().disabled);
  assert.equal(doc.getElementById('note').textContent,'뒤로 · 업기 · 잡기 · 한 번 더');
  assert.deepEqual(state().pawns[0],[[1,2,3],[1,2,3],[],[]]);
  assert.equal(state().lastMove.pickedUp,1);
  assert.deepEqual([...doc.querySelectorAll('#reserve-pawns [data-pawn]')].map(b=>b.dataset.pawn),['2','3']);
  // The captured opponent grants another throw, so the same UI can move the new pair.
  prefs.matches=true;let face=0;t.mock.method(Math,'random',()=>face++%4<2?.1:.9);
  action().click();
  doc.querySelector('#pawn-picker [data-pawn="0"]').click();
  assert.equal(action().textContent,'2칸 이동');
  prefs.matches=reducedMotion;action().click();
  await wait(()=>state().revision===4&&action().textContent==='상대 팀 차례');
  assert.deepEqual(state().pawns[0],[[1,2,3,4,5],[1,2,3,4,5],[],[]]);
  assert.deepEqual(state().lastMove.indices,[0,1]);
  assert.match(doc.getElementById('team-title').textContent,/바다/);
});

test('board dragging uses the chosen pawn and its legal squares, including after rotation',()=>{
  globalThis.window={devicePixelRatio:1,addEventListener(){},removeEventListener(){}};
  globalThis.matchMedia=()=>({matches:true});
  let frame;
  globalThis.requestAnimationFrame=fn=>{frame=fn;return 1;};
  globalThis.cancelAnimationFrame=()=>{};
  const draw=()=>frame(performance.now());
  const grad=()=>({addColorStop(){}});
  const tags=new Map();
  const ctx=new Proxy({createLinearGradient:grad,createRadialGradient:grad,fillText:(s,x,y)=>tags.set(s,[x,y])},
    {get:(obj,key)=>obj[key]??(()=>{})});
  const handlers=new Map(),bounds={left:0,top:0,width:390,height:390};
  const canvas={width:390,height:390,style:{},getContext:()=>ctx,getBoundingClientRect:()=>bounds,
    addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener(){},
    setPointerCapture(){},releasePointerCapture(){},classList:{toggle(){}}};
  const options=[{team:0,index:0,from:1,to:2},{team:0,index:1,from:7,to:8}];
  let touched=null,selected=null;const drops=[];
  const board=createBoard(canvas,n=>{touched=n},i=>{selected=i;board.setMoves(options,i)},(i,n)=>drops.push([i,n]));
  const pointer=(type,x,y)=>handlers.get(type)({pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:x,clientY:y,preventDefault(){}});
  board.setState({activeTeam:0,pieces:[{team:0,index:0,node:1},{team:0,index:1,node:7}]});
  for(const orientation of [0,90]){
    board.setMoves([],null);
    if(orientation)board.rotate();
    board.setTargets([1,2,7,8]);draw();
    const spans=new Map();
    for(let y=0;y<390;y+=4)for(let x=0;x<390;x+=4){
      touched=null;pointer('click',x,y);
      if(touched===null)continue;
      const box=spans.get(touched)??[x,y,x,y];
      spans.set(touched,[Math.min(x,box[0]),Math.min(y,box[1]),Math.max(x,box[2]),Math.max(y,box[3])]);
    }
    const center=n=>{const [x,y,right,bottom]=spans.get(n);return [(x+right)/2,(y+bottom)/2];};
    assert.equal(spans.size,4);
    board.setTargets([]);board.setMoves(options,null);draw();
    const start=center(1),legal=center(2),illegal=center(8);
    const before=drops.length;
    pointer('pointerdown',...start);pointer('pointermove',...illegal);pointer('pointerup',...illegal);
    assert.equal(drops.length,before);
    pointer('pointerdown',...start);pointer('pointermove',...legal);pointer('pointercancel',...legal);
    assert.equal(drops.length,before);
    pointer('pointerdown',...start);pointer('pointermove',...legal);draw();pointer('pointerup',...legal);
    assert.equal(selected,0);
    assert.deepEqual(drops.slice(before),[[0,2]]);
  }
  board.setState({activeTeam:0,eventTiles:{},islandTiles:{},pieces:[{team:0,index:0,node:1},{team:1,index:0,node:2},{team:1,index:1,node:2}],
    waiting:[{team:0,index:1}],snap:true});
  board.setMoves([options[0]],null);tags.clear();draw();
  assert.deepEqual([...tags.keys()].sort(),['산호 1','바다 1·2'].sort());
  const before=drops.length,source=tags.get('산호 1'),occupied=tags.get('바다 1·2');
  pointer('pointerdown',...source);pointer('pointermove',...occupied);draw();pointer('pointerup',...occupied);
  assert.deepEqual(drops.slice(before),[[0,2]]);
  board.destroy();
});

test('destination light rises, accepts a drop on its shaft and stops animating',()=>{
  globalThis.window={devicePixelRatio:1,addEventListener(){},removeEventListener(){}};
  let reduced=false;
  globalThis.matchMedia=()=>({matches:reduced});
  let pending=null;
  globalThis.requestAnimationFrame=fn=>{pending=fn;return 1;};
  globalThis.cancelAnimationFrame=()=>{pending=null;};
  const paint=time=>{const run=pending;assert.ok(run);pending=null;run(time);};
  const grad=()=>({addColorStop(){}});
  const ctx=new Proxy({createLinearGradient:grad,createRadialGradient:grad},{get:(o,k)=>o[k]??(()=>{})});
  const handlers=new Map(),canvas={style:{},classList:{toggle(){}},width:390,height:390,
    getContext:()=>ctx,getBoundingClientRect:()=>({left:0,top:0,width:390,height:390}),
    addEventListener:(k,v)=>handlers.set(k,v),removeEventListener(){}};
  let hit=null;
  const board=createBoard(canvas,n=>{hit=n});
  const tap=(x,y)=>{hit=null;handlers.get('click')({clientX:x,clientY:y});return hit;};
  board.setTargets([22]);paint(100);
  const base=[];
  for(let y=0;y<390;y++)if(tap(195,y)===22)base.push(y);
  const above=base[0]-9;
  assert.ok(base.length>=30);
  assert.equal(tap(195,above),null);
  paint(700);assert.equal(tap(195,above),22);
  paint(1500);assert.equal(pending,null);
  board.setTargets([]);paint(1510);
  assert.equal(tap(195,above),null);assert.equal(pending,null);
  reduced=true;board.setTargets([22]);paint(1520);
  assert.equal(tap(195,above),22);assert.equal(pending,null);
  board.destroy();
});

test('board landmarks stay fixed when pieces enter, hop across or leave the far row',()=>{
  globalThis.window={devicePixelRatio:1,addEventListener(){},removeEventListener(){}};
  globalThis.matchMedia=()=>({matches:false});
  let frame;
  globalThis.requestAnimationFrame=fn=>{frame=fn;return 1;};
  globalThis.cancelAnimationFrame=()=>{};
  const gradient=()=>({addColorStop(){}});
  for(const [width,height] of [[390,400],[706,408],[1138,779],[590,245]]){
    const marks=new Map();
    const ctx=new Proxy({createRadialGradient:gradient,createLinearGradient:gradient,fillText:(s,x,y)=>marks.set(s,[x,y])},
      {get:(o,k)=>o[k]??(()=>{})});
    const canvas={width,height,style:{},classList:{toggle(){}},getContext:()=>ctx,
      getBoundingClientRect:()=>({left:0,top:0,width,height}),addEventListener(){},removeEventListener(){}};
    const board=createBoard(canvas),eventTiles={5:'back',10:'carry',22:'home'};
    const state=(pieces,activeTeam=0,snap=true)=>board.setState({pieces,activeTeam,snap,eventTiles});
    const sample=time=>{marks.clear();frame(time);return ['뒤로','업기','꽝'].map(key=>{assert.ok(marks.has(key));return marks.get(key);});};
    for(let turn=0;turn<4;turn++){
      state([]);if(turn)board.rotate();
      const reference=sample(performance.now()+900);
      for(const node of [0,5,10,15]){
        const pawn={team:0,index:0,node};
        state([pawn],0,false);
        const start=performance.now();
        for(const ms of [0,65,132,230,300])assert.deepEqual(sample(start+ms),reference);
        state([pawn,{...pawn,index:1}],1);assert.deepEqual(sample(start+700),reference);
        state([]);assert.deepEqual(sample(start+900),reference);
      }
    }
    board.destroy();
  }
});
