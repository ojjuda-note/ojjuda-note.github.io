import {PLAYER, BOWS, ARROWS, STAGES, clamp, targetAt, getSpeed, launchArrow, stepArrow, predictTrajectory, createSway, stepSway} from './engine.mjs?v=20261102-archery-wind1';
import {drawScenery, drawAnimal, drawEquipmentIcon, drawFirstPersonBow} from './scenery.mjs?v=20261102-archery-flight1';
import {FLIGHT_TIME_SCALE, IMPACT_HOLD, RETURN_DURATION, PREVIEW_RISE, PREVIEW_HOLD, PREVIEW_RETURN, NEAR_PLANE, projectPoint, depthFragments, desiredFollowCamera, desiredPreviewCamera, lerpCamera} from './view.mjs?v=20261102-archery-flight1';

const $ = id => document.getElementById(id);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d', {alpha:false});
const SAVE_KEY = 'forest-archer-progress-v1';
const DRAW_LIMIT = 10, STEADY_DURATION = 0.5;
const defaults = () => ({version:1,coins:0,bow:0,arrow:0,ownedBows:[0],ownedArrows:[0],unlocked:1,lastStage:1,best:{},sound:true,shots:0,hits:0});
let persistence = true;
function loadProgress(){
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if(!raw || raw.version!==1) return defaults();
    const base=defaults(), finite=(v,f=0)=>Number.isFinite(v)?v:f;
    const ids=arr=>[...new Set([0,...(Array.isArray(arr)?arr:[]).filter(x=>Number.isInteger(x)&&x>=0&&x<4)])];
    base.coins=clamp(Math.floor(finite(raw.coins)),0,1e8);
    base.ownedBows=ids(raw.ownedBows);base.ownedArrows=ids(raw.ownedArrows);
    base.bow=base.ownedBows.includes(raw.bow)?raw.bow:0;base.arrow=base.ownedArrows.includes(raw.arrow)?raw.arrow:0;
    base.unlocked=clamp(Math.floor(finite(raw.unlocked,1)),1,STAGES.length);
    base.lastStage=clamp(Math.floor(finite(raw.lastStage,1)),1,base.unlocked);
    for(const s of STAGES) if(Number.isFinite(raw.best?.[s.id]))base.best[s.id]=clamp(Math.floor(raw.best[s.id]),0,50);
    base.sound=raw.sound!==false;base.shots=Math.max(0,finite(raw.shots));base.hits=Math.max(0,finite(raw.hits));
    return base;
  }catch{persistence=false;return defaults();}
}
let progress=loadProgress();
function save(){
  try{localStorage.setItem(SAVE_KEY,JSON.stringify(progress));persistence=true;}catch{persistence=false;}
  $('saveStatus').textContent=persistence?'진행 상황은 이 기기에 자동 저장됩니다':'이 브라우저에서 저장할 수 없어요. 현재 플레이는 계속할 수 있어요.';
}
const state={stage:STAGES[progress.lastStage-1],time:0,score:0,used:0,hits:0,earned:0,shotScores:[],targetMarks:[],stuck:[],effects:[],mode:'ready',held:0,drawStarted:0,steadyStart:1,steadyActive:false,charge:0,velocityBias:0,aim:{yaw:0,pitch:0},sway:createSway(),shot:null,settle:0,zoom:1,panX:0,panY:0,modal:null,lastFocus:null,feedbackUntil:0,guide:null,guideAt:0};
let w=1,h=1,dpr=1,camera={},pointer=null,lastFrame=performance.now(),audio=null,toastTimer=0,drawTimer=0,keys=new Set();
const activeBow=()=>BOWS[progress.bow];
const activeArrow=()=>ARROWS[progress.arrow];
const shotLimit=()=>state.stage.shots;
const drawElapsed=(now=performance.now())=>Math.max(0,(now-state.drawStarted)/1000);
const isSteady=(now=performance.now())=>state.mode==='drawing'&&drawElapsed(now)>=state.steadyStart&&drawElapsed(now)<state.steadyStart+STEADY_DURATION;
const effectiveSway=(now=performance.now())=>isSteady(now)?{x:0,y:0}:state.sway;
const aimAngles=(now=performance.now())=>{const sway=effectiveSway(now);return {yaw:state.aim.yaw+sway.x,pitch:state.aim.pitch+sway.y};};
function shotParams(now=performance.now()){return {...aimAngles(now),charge:state.charge,bow:activeBow(),arrow:activeArrow(),velocityBias:state.velocityBias};}
function syncDraw(now=performance.now()){
  state.held=Math.min(DRAW_LIMIT,drawElapsed(now));state.charge=clamp(state.held/1.25,0,1);
  const steady=isSteady(now);if(steady!==state.steadyActive)state.guide=null;state.steadyActive=steady;
}
function clearDrawTimer(){clearTimeout(drawTimer);drawTimer=0;}
function clearPointer(){const heldPointer=pointer;pointer=null;if(heldPointer){try{heldPointer.el.releasePointerCapture(heldPointer.id);}catch{}}}
function scheduleAutoRelease(){
  clearDrawTimer();
  drawTimer=setTimeout(()=>{
    drawTimer=0;if(state.mode!=='drawing')return;
    if(document.hidden||state.modal){cancelDraw();return;}
    if(drawElapsed()<DRAW_LIMIT){scheduleAutoRelease();return;}
    releaseShot(true);
  },Math.max(0,state.drawStarted+DRAW_LIMIT*1000-performance.now()));
}
function recenter(){
  const t=targetAt(state.stage,state.time);
  state.aim.yaw=0;
  state.aim.pitch=Math.atan2(t.y-PLAYER.y,state.stage.distance);
  state.panX=0;state.panY=state.zoom===2?h*.2:0;
  if(camera.focal)camera=aimCamera();
  state.sway=createSway();state.guide=null;
}
function aimCamera(){return {x:0,y:PLAYER.y,z:0,cx:w/2+state.panX,horizon:h*.405+state.panY,focal:Math.min(w*1.08,h*1.5)*state.zoom};}
function beginTargetPreview(){
  if(state.modal||!state.stage.obstacles.length||(state.mode!=='ready'&&state.mode!=='drawing'))return;
  cancelDraw();state.mode='preview';state.previewElapsed=0;state.previewReturnCamera=null;
  $('shotFeedback').classList.add('hidden');$('flightBadge').classList.remove('hidden');
  $('flightBadge').textContent='담장 너머 과녁을 미리 확인하세요';updatePower();
}
function returnFromPreview(){
  if(state.mode!=='preview')return;
  state.previewReturnCamera={...camera};state.previewElapsed=PREVIEW_RISE+PREVIEW_HOLD;
}
function updateCamera(dt=0,immediate=false){
  const base=aimCamera();
  if(state.mode==='preview'){
    const overview=desiredPreviewCamera(state.stage,targetAt(state.stage,state.time),base,{w,h}),elapsed=state.previewElapsed;
    if(immediate)state.previewReturnCamera=null;
    if(elapsed<PREVIEW_RISE){const t=clamp(elapsed/PREVIEW_RISE,0,1);camera=lerpCamera(base,overview,t*t*(3-2*t));}
    else if(elapsed<PREVIEW_RISE+PREVIEW_HOLD)camera=overview;
    else{const t=clamp((elapsed-PREVIEW_RISE-PREVIEW_HOLD)/PREVIEW_RETURN,0,1);camera=lerpCamera(state.previewReturnCamera||overview,base,t*t*(3-2*t));}
    return;
  }
  if(!state.shot||(state.mode!=='flight'&&state.mode!=='settling')){camera=base;return;}
  const follow=desiredFollowCamera(state.shot.position,base,{w,h});
  if(state.mode==='settling'&&state.settle>IMPACT_HOLD){
    if(immediate||!state.returnCamera)state.returnCamera=immediate?follow:{...camera};
    const t=clamp((state.settle-IMPACT_HOLD)/RETURN_DURATION,0,1);
    camera=lerpCamera(state.returnCamera,base,t*t*(3-2*t));
  }else{
    camera=immediate?follow:lerpCamera(camera,follow,1-Math.exp(-9*dt));
  }
}
function resize(){
  const r=canvas.getBoundingClientRect();w=Math.max(1,r.width);h=Math.max(1,r.height);dpr=Math.min(2,devicePixelRatio||1);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  updateCamera(0,true);
  ctx.setTransform(dpr,0,0,dpr,0,0);state.guide=null;
}
function project(p){
  return projectPoint(p,camera);
}
function screenAim(){const a=aimAngles();return {x:camera.cx+Math.tan(a.yaw)*camera.focal,y:camera.horizon-Math.tan(a.pitch)/Math.cos(a.yaw)*camera.focal};}
function clampAim(){
  state.aim.yaw=clamp(state.aim.yaw,-.48,.48);state.aim.pitch=clamp(state.aim.pitch,-.22,.58);
  const x=camera.cx+Math.tan(state.aim.yaw)*camera.focal,y=camera.horizon-Math.tan(state.aim.pitch)/Math.cos(state.aim.yaw)*camera.focal;
  // Keep the same world-angle range at every zoom. The view pans near an edge.
  if(x<42)state.panX+=Math.ceil((42-x)/24)*24;else if(x>w-42)state.panX-=Math.ceil((x-w+42)/24)*24;
  if(y<58)state.panY+=Math.ceil((58-y)/24)*24;else if(y>h-78)state.panY-=Math.ceil((y-h+78)/24)*24;
  camera.cx=w/2+state.panX;camera.horizon=h*.405+state.panY;
}
function sound(type){
  if(!progress.sound)return;
  try{
    audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();
    const now=audio.currentTime;
    const tone=(freq,start,duration,volume,wave='sine',end=freq)=>{
      const o=audio.createOscillator(),g=audio.createGain();o.type=wave;o.frequency.setValueAtTime(freq,now+start);o.frequency.exponentialRampToValueAtTime(Math.max(25,end),now+start+duration);
      g.gain.setValueAtTime(0,now+start);g.gain.linearRampToValueAtTime(volume,now+start+.012);g.gain.exponentialRampToValueAtTime(.0001,now+start+duration);o.connect(g).connect(audio.destination);o.start(now+start);o.stop(now+start+duration+.02);
    };
    if(type==='draw')tone(180,0,.1,.025,'triangle',230);
    if(type==='shoot'){tone(180,0,.16,.07,'triangle',45);tone(670,0,.09,.025,'sawtooth',80);}
    if(type==='hit'){tone(520,0,.13,.045);tone(780,.07,.25,.045);}
    if(type==='bull'){tone(660,0,.16,.05);tone(880,.07,.19,.045);tone(1320,.16,.35,.035);}
    if(type==='miss')tone(110,0,.15,.04,'triangle',40);
    if(type==='buy'){tone(600,0,.12,.04);tone(900,.07,.23,.04);}
    if(type==='clear'){[523,659,784,1047].forEach((f,i)=>tone(f,i*.10,.4,.035));}
  }catch{}
}
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.remove('hidden');toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),2700);}
function updateHeader(){
  $('coinCount').textContent=progress.coins.toLocaleString('ko-KR');
  const b=activeBow(),a=activeArrow();
  $('bowName').textContent=b.name;$('bowStat').textContent=`흔들림 ${Math.round(b.sway/BOWS[0].sway*100)}% · 최대 ${b.speed} m/s`;
  $('arrowName').textContent=a.name;$('arrowStat').textContent=`바람 저항 ${Math.round((1-a.windFactor/ARROWS[0].windFactor)*100)}% · 속도 편차 ±${Math.round(a.variance*1000)/10}%`;
  for(const [id,item,kind] of [['equippedBow',b,'bow'],['equippedArrow',a,'arrow']]){
    const cv=$(id),cx=cv.getContext('2d');cx.clearRect(0,0,cv.width,cv.height);drawEquipmentIcon(cx,cv.width,cv.height,{kind,tier:item.id,color:item.color});
  }
  $('soundBtn').innerHTML=`${icon(progress.sound?'sound':'mute')}<span>소리 ${progress.sound?'켜짐':'꺼짐'}</span>`;
  $('soundBtn').setAttribute('aria-label',progress.sound?'소리 끄기':'소리 켜기');
}
function updateRound(){
  const s=state.stage;
  $('levelNumber').textContent=String(s.id).padStart(2,'0');
  $('stageChapter').textContent=s.subtitle;
  $('stageName').textContent=s.name;
  $('scoreCount').textContent=state.score;$('goalCount').textContent=s.goal;
  $('distanceLabel').textContent=`${s.distance} m`;
  $('windLabel').textContent=s.wind?`${s.wind>0?'오른쪽':'왼쪽'} 바람 ${Math.abs(s.wind).toFixed(1)}`:'고요한 바람';
  $('stageHint').textContent=s.hint;
  $('mobileHint').textContent=$('stageHint').textContent;
  $('missionFill').style.width=`${Math.min(100,state.score/(s.goal)*100)}%`;
  $('missionState').textContent=state.score>=s.goal?'통과 점수 달성!':state.used===0?'차분하게 시작해요':`통과까지 ${Math.max(0,s.goal-state.score)}점`;
  $('roundProgress').textContent=`${state.used} / ${shotLimit()}발`;
  $('shotDots').innerHTML=Array.from({length:shotLimit()},(_,i)=>`<i class="arrow-dot ${i<state.used?'used':''}"></i>`).join('');
  $('shotCountLabel').textContent=`${Math.max(0,shotLimit()-state.used)}발 남음`;
  $('journeyCount').textContent=`${progress.unlocked} / ${STAGES.length}`;
  $('journeyCaption').textContent=progress.unlocked>=12?'마지막 사격장까지 열린 궁수의 여정':'숲길에서 시작하는 궁수의 여정';
  $('journeySteps').innerHTML=STAGES.map(s=>`<button class="journey-step ${s.id===state.stage.id?'active':''} ${progress.best[s.id]>=s.goal?'done':''}" data-stage="${s.id}" ${s.id>progress.unlocked?'disabled':''} aria-label="${s.id}단계 ${s.name}${s.id>progress.unlocked?' 잠김':''}">${s.id>progress.unlocked?icon('lock'):`<strong>${String(s.id).padStart(2,'0')}</strong>`}<small>${s.distance}m</small></button>`).join('');
  $('gameCanvas').dataset.stage=s.id;$('gameCanvas').dataset.score=state.score;$('gameCanvas').dataset.shots=state.used;
  $('previewBtn').classList.toggle('hidden',!s.obstacles.length);
}
function resetRound(stage=state.stage){
  cancelDraw();state.stage=stage;state.time=0;state.score=0;state.used=0;state.hits=0;state.earned=0;state.shotScores=[];state.targetMarks=[];state.stuck=[];state.effects=[];state.mode='ready';state.shot=null;state.returnCamera=null;state.settle=0;state.charge=0;state.feedbackUntil=0;state.zoom=1;
  $('zoomBtn').textContent='1×';$('shotFeedback').classList.add('hidden');$('flightBadge').classList.add('hidden');recenter();resize();updateRound();updateHeader();
  beginTargetPreview();
}
function startStage(id){
  if(id>progress.unlocked||id<1)return;
  progress.lastStage=id;save();closeModal();resetRound(STAGES[id-1]);
}
function beginDraw(){
  if(state.modal||state.mode!=='ready'||document.hidden||state.used>=shotLimit())return false;
  state.mode='drawing';state.held=0;state.drawStarted=performance.now();state.charge=0;state.velocityBias=Math.random()*2-1;
  state.steadyStart=1+Math.random()*(DRAW_LIMIT-STEADY_DURATION-1);state.steadyActive=false;state.guide=null;
  scheduleAutoRelease();sound('draw');updatePower();return true;
}
function cancelDraw(){
  clearDrawTimer();
  if(state.mode==='drawing'){state.mode='ready';state.charge=0;state.held=0;state.steadyActive=false;}
  clearPointer();keys.clear();
}
function releaseShot(automatic=false,now=performance.now()){
  if(state.mode!=='drawing')return;
  if(document.hidden||state.modal){cancelDraw();return;}
  syncDraw(now);clearDrawTimer();
  state.shot=launchArrow(shotParams(now));state.shot.startedAt=now;state.shot.automatic=automatic||drawElapsed(now)>=DRAW_LIMIT;
  state.mode='flight';state.used++;state.guide=null;state.shot.handled=false;state.steadyActive=false;state.returnCamera=null;
  clearPointer();keys.clear();
  $('shotFeedback').classList.add('hidden');$('flightBadge').classList.remove('hidden');
  $('flightBadge').textContent='슬로모션 · 화살을 따라가는 중';
  sound('shoot');if(navigator.vibrate)navigator.vibrate(12);updateRound();updatePower();
}
function onPointerDown(e){
  if(e.button!==0||pointer)return;
  if(!beginDraw())return;e.preventDefault();e.currentTarget.focus({preventScroll:true});pointer={id:e.pointerId,el:e.currentTarget,x:e.clientX,y:e.clientY,yaw:state.aim.yaw,pitch:state.aim.pitch};
  e.currentTarget.setPointerCapture(e.pointerId);
}
function onPointerMove(e){
  if(!pointer||pointer.id!==e.pointerId||state.mode!=='drawing')return;
  e.preventDefault();const sensitivity=(w<500?1.35:1.05)/camera.focal;
  state.aim.yaw=pointer.yaw+(e.clientX-pointer.x)*sensitivity;
  state.aim.pitch=pointer.pitch-(e.clientY-pointer.y)*sensitivity;clampAim();
}
function onPointerUp(e){
  if(!pointer||pointer.id!==e.pointerId)return;
  onPointerMove(e);e.preventDefault();releaseShot();
}
for(const el of [canvas,$('drawPad')]){
  el.addEventListener('pointerdown',onPointerDown);el.addEventListener('pointermove',onPointerMove);el.addEventListener('pointerup',onPointerUp);
  el.addEventListener('pointercancel',()=>cancelDraw());el.addEventListener('lostpointercapture',()=>{if(pointer)cancelDraw();});el.addEventListener('contextmenu',e=>e.preventDefault());
}
function onImpact(){
  const shot=state.shot,r=shot.result;if(shot.handled)return;shot.handled=true;state.mode='settling';state.settle=0;
  $('flightBadge').textContent='착지 확인 · 조준 화면으로 돌아가요';
  const hit=r.type==='hit';state.score+=r.score;state.shotScores.push(r.score);
  if(hit){state.hits++;const target=r.targetCenter;shot.attachment={x:r.point.x-target.x,y:r.point.y-target.y};state.targetMarks.push({...shot.attachment,z:target.z,velocity:{...shot.velocity}});}
  else state.stuck.push({...r.point,velocity:{...shot.velocity}});
  const reward=hit?Math.ceil(r.score*.8)+2:1;
  state.earned+=reward;progress.coins+=reward;progress.shots++;if(hit)progress.hits++;save();
  state.effects.push({x:r.point.x,y:r.point.y,z:r.point.z,born:state.time,hit});
  state.feedbackUntil=state.time+1.6;
  $('feedbackTitle').textContent=hit?`${r.score===10?'정중앙!':'명중!'} +${r.score}점`:r.zone;
  $('feedbackDetail').textContent=hit?`${r.flightTime.toFixed(2)}초 비행 · +${reward} 코인`:`${r.type==='obstacle'?'조금 더 높이, 힘을 조절해보세요':r.type==='ground'?'조준을 높이거나 더 길게 당겨보세요':'거리와 바람을 다시 읽어보세요'} · +1 코인`;
  $('shotFeedback').className=`shot-feedback ${!hit?'miss':r.score===10?'gold':''}`;
  sound(hit?(r.score===10?'bull':'hit'):'miss');if(hit&&navigator.vibrate)navigator.vibrate(r.score===10?[15,30,15]:15);
  updateHeader();updateRound();
}
function finishRound(){
  if(state.mode==='finished')return;state.mode='finished';
  const passed=state.score>=state.stage.goal;
  const previous=progress.best[state.stage.id]||0;
  progress.best[state.stage.id]=Math.max(previous,state.score);
  let bonus=0;
  if(passed){bonus=previous<state.stage.goal?25:12;progress.coins+=bonus;state.earned+=bonus;progress.unlocked=Math.max(progress.unlocked,Math.min(STAGES.length,state.stage.id+1));sound('clear');}
  save();updateHeader();updateRound();showResult(passed,bonus);
}
function openModal(type,html,narrow=false){
  cancelDraw();state.lastFocus=document.activeElement;state.modal=type;
  $('modalContent').innerHTML=html;$('modal').classList.toggle('narrow',narrow);$('modalBackdrop').classList.remove('hidden');document.body.style.overflow='hidden';$('modalClose').focus();
}
function closeModal(){
  if(!state.modal)return;state.modal=null;$('modalBackdrop').classList.add('hidden');document.body.style.overflow='';
  state.lastFocus?.focus?.();state.lastFocus=null;
  if(state.mode==='finished')resetRound(state.stage);
}
function showHelp(){openModal('help',`<p class="eyebrow">MAKE YOUR FIRST SHOT</p><h2 id="modalTitle">손끝으로 배우는 활쏘기</h2><p class="modal-subtitle">한 발씩 쏘다 보면, 바람과 거리의 감각이 생겨요.</p><div class="help-steps"><div class="help-step"><span>01</span><div><strong>누른 채 움직여 조준</strong><p>아래 조준 영역이나 사격장 화면을 누르고 끌어보세요. 조준점은 크게 무작위로 흔들려요.</p></div></div><div class="help-step"><span>02</span><div><strong>손을 떼는 순간 발사</strong><p>길게 당길수록 빠르게 날아요. 누른 뒤 1~10초 사이에 한 번, 무작위로 0.5초간 흔들림이 멈춰요. 10초 안에 손을 떼지 않으면 자동발사해요.</p></div></div><div class="help-step"><span>03</span><div><strong>먼 곳은 위로, 움직이면 앞쪽으로</strong><p>발사하면 화면이 화살을 슬로모션으로 따라가고, 맞거나 땅에 떨어진 뒤 돌아와요. 화살은 날아가며 떨어져요. 처음 3개 사격장에서는 점선으로 궤적을 알려줘요. 단계가 높아질수록 바람이 강해져요. 날리는 나뭇잎의 방향과 속도를 읽어보세요. 담장이 있는 단계는 시작할 때 위에서 과녁을 보여줘요. ‘과녁 보기’로 다시 확인할 수 있어요.</p></div></div><div class="help-step"><span>04</span><div><strong>코인을 모아 더 좋은 장비로</strong><p>좋은 활은 조준 흔들림을 줄여줘요. 좋은 화살은 속도 편차를 줄이고 바람에도 덜 밀려요. 모은 코인으로 구매하고 장착하세요.</p></div></div></div><div class="help-note">5발을 쏴 통과 점수를 넘기면 다음 사격장이 열려요.<br>장비·코인·마지막 단계는 현재 브라우저에 저장돼요.<br>PC: 방향키로 조준 · SPACE를 누르고 있다 놓으면 발사</div><button class="button primary-button" style="width:100%;margin-top:21px" data-action="close">시위 당기러 가기 ${icon('arrow')}</button>`,true);}
let shopTab='bow';
function showShop(tab=shopTab){
  if(state.mode==='flight'||state.mode==='settling'){toast('이번 화살이 도착한 뒤 상점을 열 수 있어요.');return;}
  shopTab=tab;
  const items=tab==='bow'?BOWS:ARROWS,owned=tab==='bow'?progress.ownedBows:progress.ownedArrows,equipped=progress[tab];
  openModal('shop',`<p class="eyebrow">THE ARCHER'S WORKSHOP</p><h2 id="modalTitle">나에게 맞는 한 발.</h2><p class="modal-subtitle">코인을 모아 더 안정적인 활과 화살을 구매하고 장착하세요.</p><div class="shop-top"><div class="shop-tabs"><button class="${tab==='bow'?'active':''}" data-shop-tab="bow">활</button><button class="${tab==='arrow'?'active':''}" data-shop-tab="arrow">화살</button></div><div class="shop-coins">${icon('coin')}<strong>${progress.coins.toLocaleString('ko-KR')}</strong></div></div><div class="shop-grid">${items.map(item=>{const isOwned=owned.includes(item.id),isEquipped=item.id===equipped;const stability=tab==='bow'?Math.round((1-item.sway/BOWS[0].sway)*100):Math.round((1-item.variance/ARROWS[0].variance)*100);return `<article class="item-card ${isEquipped?'equipped':''}"><div class="item-art"><span class="item-tag">${item.tag}</span><span class="item-owned">${isEquipped?'장착 중':isOwned?'보유 중':''}</span><canvas data-item-art="${item.id}" width="420" height="180"></canvas></div><h3>${item.name}</h3><p>${item.description}</p><div class="item-stat"><span>${tab==='bow'?'흔들림 감소':'속도 편차 감소'}</span><strong>${stability}%</strong></div><div class="stat-track"><span style="width:${12+stability*.88}%"></span></div><div class="item-stat"><span>${tab==='bow'?'최대 기본 속도':'발사 속도 편차'}</span><strong>${tab==='bow'?`${item.speed} m/s`:`±${Math.round(item.variance*1000)/10}%`}</strong></div>${tab==='arrow'?`<div class="item-stat"><span>바람 영향 감소</span><strong>${Math.round((1-item.windFactor/ARROWS[0].windFactor)*100)}%</strong></div>`:''}<div class="item-actions"><button class="button ${isEquipped?'':'primary-button'}" data-equip="${item.id}" ${isEquipped||(!isOwned&&progress.coins<item.price)?'disabled':''}>${isEquipped?'장착 중':isOwned?'장착하기':`${icon('coin')}${item.price} 구매`}</button></div></article>`;}).join('')}</div><p class="shop-footnote">${tab==='arrow'?'바람 영향 감소는 나무 화살 기준이에요. ':''}게임에서 모은 코인으로 구매해요. 장비는 영구 보유하며 화살은 소모되지 않아요.</p>`);
  for(const cv of document.querySelectorAll('[data-item-art]')){const item=items[+cv.dataset.itemArt];drawEquipmentIcon(cv.getContext('2d'),cv.width,cv.height,{kind:tab,tier:item.id,color:item.color});}
}
function equipItem(id){
  const kind=shopTab,item=(kind==='bow'?BOWS:ARROWS)[id],owned=kind==='bow'?progress.ownedBows:progress.ownedArrows;
  if(!item)return;
  if(!owned.includes(id)){if(progress.coins<item.price){toast('코인을 조금 더 모아보세요.');return;}progress.coins-=item.price;owned.push(id);sound('buy');toast(`${item.name} 구매 완료! 바로 장착했어요.`);}
  else toast(`${item.name} 장착 완료`);
  progress[kind]=id;state.sway=createSway();save();updateHeader();showShop(kind);
}
function starsFor(score,goal){return score<goal?0:score>=44?3:score>=34?2:1;}
function showResult(passed,bonus){
  const last=state.stage.id===STAGES.length;
  const stars=starsFor(state.score,state.stage.goal);
  openModal('result',`<div class="result-content"><div class="result-emblem">${icon(passed?'target':'wind')}</div><p class="eyebrow">${passed?'A SHOT TO REMEMBER':'EVERY SHOT IS A NEW START'}</p><h2 id="modalTitle">${passed?(last?'당신은 바람의 궁수!':'다음 숲길이 열렸어요.'): '한 발씩, 더 가까이.'}</h2><p>${passed?(last?'거리와 바람, 움직임까지 읽어냈어요.':'흔들림 속에서 찾아낸 멋진 타이밍이에요.'):`${state.stage.goal}점이면 통과예요. 조준을 조금 바꿔 다시 도전해요.`}</p><div class="result-stars" aria-label="별 ${stars}개">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div><div class="result-metrics"><div><small>이번 점수</small><strong>${state.score}</strong><em>/ 50</em></div><div><small>명중</small><strong>${state.hits}</strong><em>/ 5발</em></div><div><small>획득 코인</small><strong>+${state.earned}</strong></div></div><div class="result-actions"><button class="button" data-action="retry">다시 도전</button><button class="button primary-button" data-action="${passed&&!last?'next':'result-shop'}">${passed&&!last?`다음 사격장 ${icon('chevron')}`:`장비 살펴보기 ${icon('bag')}`}</button></div><p style="font-size:9px;margin-top:18px">${bonus?`통과 보너스 ${bonus}코인이 포함되어 있어요.`:'이번에 얻은 코인은 그대로 남아 있어요.'}</p></div>`,true);
}
function showStages(){
  if(state.mode==='flight'||state.mode==='settling'){toast('화살이 도착하면 사격장을 바꿀 수 있어요.');return;}
  openModal('stages',`<p class="eyebrow">FOLLOW YOUR OWN TRAIL</p><h2 id="modalTitle">어느 숲길로 갈까요?</h2><p class="modal-subtitle">가까운 과녁에서 바람 부는 숲 너머까지. 한 단계씩 열어보세요.</p><div class="stage-grid">${STAGES.map(s=>{const locked=s.id>progress.unlocked,best=progress.best[s.id]||0,stars=starsFor(best,s.goal);return `<button class="stage-card ${s.id===state.stage.id?'active':''}" data-stage="${s.id}" ${locked?'disabled':''}><span class="stage-index">${locked?'◇':String(s.id).padStart(2,'0')}</span><strong>${s.name}</strong><small>${s.distance}m · ${s.goal}점 통과</small><span class="stage-stars">${locked?'앞 단계를 통과하세요':'★'.repeat(stars)+'☆'.repeat(3-stars)}</span></button>`}).join('')}</div>`);
}
document.addEventListener('click',e=>{
  const btn=e.target.closest('button');if(!btn)return;
  if(btn.classList.contains('shop-open'))showShop();
  if(btn.dataset.shopTab)showShop(btn.dataset.shopTab);
  if(btn.dataset.equip!==undefined)equipItem(+btn.dataset.equip);
  if(btn.dataset.stage){if(state.mode==='flight'||state.mode==='settling'){toast('이번 화살이 도착하면 이동할 수 있어요.');return;}startStage(+btn.dataset.stage);}
  const act=btn.dataset.action;
  if(act==='close')closeModal();
  if(act==='retry'){closeModal();resetRound();}
  if(act==='next')startStage(Math.min(12,state.stage.id+1));
  if(act==='result-shop'){closeModal();showShop();}
});
$('helpBtn').addEventListener('click',showHelp);$('stagesBtn').addEventListener('click',showStages);$('modalClose').addEventListener('click',closeModal);
$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))closeModal();});
$('soundBtn').addEventListener('click',()=>{progress.sound=!progress.sound;save();updateHeader();if(progress.sound)sound('hit');});
$('zoomBtn').addEventListener('click',()=>{if(state.mode==='flight'||state.mode==='settling'||state.mode==='preview')return;cancelDraw();state.zoom=state.zoom===1?2:1;state.panX=0;state.panY=state.zoom===2?h*.2:0;$('zoomBtn').textContent=`${state.zoom}×`;resize();clampAim();$('zoomBtn').setAttribute('aria-label',state.zoom===1?'조준 화면 두 배 확대':'원래 크기로');});
$('recenterBtn').addEventListener('click',()=>{if(state.mode==='flight'||state.mode==='settling'||state.mode==='preview')return;cancelDraw();recenter();});
$('previewBtn').addEventListener('click',()=>state.mode==='preview'?returnFromPreview():beginTargetPreview());
document.addEventListener('keydown',e=>{
  if(e.code==='Escape'){if(state.modal)closeModal();else cancelDraw();return;}
  if(state.modal){
    if(e.code==='Tab'){const focusable=[...$('modal').querySelectorAll('button:not(:disabled),[tabindex="0"]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    return;
  }
  if(e.code.startsWith('Arrow')){e.preventDefault();keys.add(e.code);}
  if(e.code==='Space'&&!e.repeat&&!(document.activeElement?.tagName==='BUTTON')){e.preventDefault();beginDraw();}
});
document.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'&&!state.modal){e.preventDefault();releaseShot();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelDraw();lastFrame=performance.now();});
window.addEventListener('blur',()=>cancelDraw());new ResizeObserver(resize).observe(canvas);

function poly(points,fill,stroke=null,width=1){
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
}
function line(x1,y1,x2,y2,color,width=1){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
function circle(x,y,r,fill,stroke=null,width=1){ctx.beginPath();ctx.arc(x,y,Math.max(.01,r),0,Math.PI*2);if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}}
function ellipse(x,y,rx,ry,fill){ctx.beginPath();ctx.ellipse(x,y,Math.max(.01,rx),Math.max(.01,ry),0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();}
function roundRect(x,y,width,height,r,fill,stroke=null){ctx.beginPath();ctx.roundRect(x,y,width,height,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
function drawTarget(target){
  const p=project(target);if(!p.visible)return;
  const r=target.radius*p.scale;
  ctx.save();
  const ground=project({x:target.x,y:0,z:target.z});
  ellipse(ground.x+3,ground.y+2,r*1.08,Math.max(2,r*.11),'#2f442a24');
  if(target.kind!=='target'){
    if(target.kind==='bird')ellipse(ground.x,ground.y,r*.7,Math.max(1,r*.05),'#334b2413');
    drawAnimal(ctx,p.x,p.y,r,target.kind,state.time);
  }else{
    const footL=project({x:target.x-target.radius*.72,y:0,z:target.z-.1});
    const footR=project({x:target.x+target.radius*.72,y:0,z:target.z-.1});
    line(p.x-r*.36,p.y+r*.25,footL.x,footL.y,'#796744',Math.max(3,r*.10));
    line(p.x+r*.36,p.y+r*.25,footR.x,footR.y,'#8c784e',Math.max(3,r*.10));
    line(p.x,p.y+r*.4,ground.x+r*.4,ground.y,'#72613e',Math.max(2,r*.075));
    circle(p.x+2,p.y+2,r*1.08,'#2d3d2525');
    circle(p.x,p.y,r*1.055,'#b49a67','#796b49',Math.max(.6,r*.035));
    const rings=['#f3f0d7','#394b43','#7397a2','#c76e55','#e4bd58'];
    for(let i=0;i<5;i++){circle(p.x,p.y,r*(1-i*.2),rings[i]);circle(p.x,p.y,r*(1-i*.2),null,'#243e3124',Math.max(.3,r*.01));}
    circle(p.x,p.y,r*.10,null,'#a37e3060',.7);circle(p.x,p.y,Math.max(.7,r*.018),'#94723c');
    ctx.globalAlpha=.07;line(p.x-r*.85,p.y-r*.3,p.x+r*.85,p.y-r*.3,'#fefbe8',Math.max(1,r*.015));ctx.globalAlpha=1;
  }
  ctx.restore();
}
function drawWall(ob){
  const z=ob.z-ob.depth/2;
  if(z<=camera.z+NEAR_PLANE)return;
  const a=project({x:ob.x-ob.width/2,y:0,z}),b=project({x:ob.x+ob.width/2,y:0,z}),c=project({x:ob.x+ob.width/2,y:ob.height,z}),d=project({x:ob.x-ob.width/2,y:ob.height,z});
  const topBackLeft=project({x:ob.x-ob.width/2,y:ob.height,z:z+ob.depth}),topBackRight=project({x:ob.x+ob.width/2,y:ob.height,z:z+ob.depth});
  const wallShade=ctx.createLinearGradient(0,d.y,0,a.y);wallShade.addColorStop(0,'#9a997b');wallShade.addColorStop(1,'#747c62');
  poly([a,b,c,d],wallShade,'#657154',1);poly([d,c,topBackRight,topBackLeft],'#b6b195');
  const rows=4,cols=6;
  for(let i=1;i<rows;i++){const yy=d.y+(a.y-d.y)*i/rows;line(d.x,yy,c.x,yy,'#65705770',1);}
  for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
    const xx=d.x+(c.x-d.x)*(col+(row%2?.5:0))/cols;
    if(xx>d.x+1&&xx<c.x-1)line(xx,d.y+(a.y-d.y)*row/rows,xx,d.y+(a.y-d.y)*(row+1)/rows,'#626f5860',.8);
  }
  line(d.x,d.y,c.x,c.y,'#ccd0a48c',2);
  // Moss is decoration only; the solid masonry rectangle matches the collision box.
  for(let i=0;i<11;i++){const xx=d.x+(c.x-d.x)*(i+.3)/11;ellipse(xx,d.y+2+(i%3),Math.max(2,(c.x-d.x)/24),2+i%3,'#718455');}
}
function drawReticle(){
  if(state.mode==='flight'||state.mode==='settling'||state.mode==='finished'||state.mode==='preview')return;
  const p=screenAim(),held=state.mode==='drawing',steady=isSteady();
  const radius=held?10:8;ctx.save();ctx.lineCap='round';
  circle(p.x,p.y,radius,null,'#23372a66',2.7);circle(p.x,p.y,radius,null,held?'#fffceb':'#fffcebcc',1.2);
  for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){line(p.x+dx*(radius+4),p.y+dy*(radius+4),p.x+dx*(radius+9),p.y+dy*(radius+9),'#263b2a77',2.5);line(p.x+dx*(radius+4),p.y+dy*(radius+4),p.x+dx*(radius+9),p.y+dy*(radius+9),'#fffce3e6',1.1);}
  circle(p.x,p.y,1.7,'#fffbe6','#34483188',.7);
  if(held){ctx.beginPath();ctx.arc(p.x,p.y,16,-Math.PI/2,-Math.PI/2+Math.PI*2*state.charge);ctx.strokeStyle=steady?'#caffbc':state.held>2.6?'#e8a776':'#e2c276';ctx.lineWidth=steady?3:2;ctx.stroke();}
  if(steady){ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#294b38';ctx.strokeText('안정',p.x,p.y-25);ctx.fillStyle='#d8ffcb';ctx.fillText('안정',p.x,p.y-25);}
  ctx.restore();
}
function drawGuide(){
  if(state.mode!=='drawing'||state.stage.id>3)return;
  if(!state.guide||state.time-state.guideAt>.055){state.guide=predictTrajectory(shotParams(),state.stage,state.time,4);state.guideAt=state.time;}
  ctx.save();ctx.lineCap='round';ctx.setLineDash([2,7]);ctx.strokeStyle='#fffbdd9c';ctx.lineWidth=1.4;ctx.beginPath();let began=false;
  for(const point of state.guide.points){if(point.z<2)continue;const p=project(point);if(!p.visible)continue;if(!began){ctx.moveTo(p.x,p.y);began=true;}else ctx.lineTo(p.x,p.y);}
  ctx.stroke();ctx.setLineDash([]);
  const result=state.guide.result;
  if(result){const p=project(result.point);circle(p.x,p.y,result.type==='hit'?4:3,null,result.type==='hit'?'#fff9bd':'#fff9d77c',1.5);}
  ctx.restore();
}
// Every shaft and trail is split at occluder planes before painter sorting.
// The actual target silhouette hides only the parts that are behind it.
function sceneItems(target){
  const planes=[target.z,...state.stage.obstacles.flatMap(ob=>[ob.z-ob.depth/2,ob.z+ob.depth/2])];
  const items=[{kind:'target',z:target.z,order:0,target},...state.stage.obstacles.map(ob=>({kind:'wall',z:ob.z-ob.depth/2,order:0,ob}))];
  const surfaceDepth=(a,b=a)=>{
    const z=(a.z+b.z)/2;
    // The masonry top is part of the front-wall draw call. A shaft clearing
    // that top (or resting on it) must be painted on its visible surface.
    const wall=state.stage.obstacles.find(ob=>a.z>=ob.z-ob.depth/2-1e-7&&a.z<=ob.z+ob.depth/2+1e-7&&b.z>=ob.z-ob.depth/2-1e-7&&b.z<=ob.z+ob.depth/2+1e-7&&Math.min(a.y,b.y)>=ob.height-1e-7);
    return wall?wall.z-wall.depth/2-.001:z;
  };
  const addLine=(a,b,kind,alpha=1)=>{
    for(const part of depthFragments(a,b,planes,camera.z))items.push({...part,z:surfaceDepth(part.a,part.b),kind,alpha,order:kind==='trail'?1:2});
  };
  const addArrow=(tip,velocity,alpha=1,flying=false)=>{
    if(tip.z-camera.z<.6)return;
    const length=Math.hypot(velocity.x,velocity.y,velocity.z)||1;
    const tail={x:tip.x-velocity.x/length*.85,y:tip.y-velocity.y/length*.85,z:tip.z-velocity.z/length*.85};
    addLine(tail,tip,'shaft',alpha);
    if(tail.z>camera.z+NEAR_PLANE)items.push({kind:'feather',z:surfaceDepth(tail),order:3,point:tail,tip,alpha});
    items.push({kind:'tip',z:surfaceDepth(tip),order:4,point:tip,tail,alpha,flying});
  };
  for(const stuck of state.stuck)addArrow(stuck,stuck.velocity||{x:0,y:-.5,z:1},.75);
  // Keep every hit in target-local coordinates, including birds and deer.
  // Full shafts remain at their original entry angle as the target moves.
  for(const mark of state.targetMarks)addArrow({x:target.x+mark.x,y:target.y+mark.y,z:target.z-.002},mark.velocity||{x:0,y:-.2,z:1});
  const shot=state.shot;
  if(shot&&(state.mode==='flight'||state.mode==='settling')){
    const alpha=state.mode==='settling'?Math.max(0,1-state.settle/(IMPACT_HOLD+RETURN_DURATION)):1;
    const points=[...shot.trail,shot.position];
    for(let i=1;i<points.length;i++)addLine(points[i-1],points[i],'trail',alpha);
    if(state.mode==='flight')addArrow(shot.position,shot.velocity,1,true);
  }
  for(const effect of state.effects)items.push({kind:'effect',z:effect.z-.002,order:5,effect});
  return items.sort((a,b)=>b.z-a.z||a.order-b.order);
}
function drawSceneItem(item){
  if(item.kind==='target'){drawTarget(item.target);return;}
  if(item.kind==='wall'){drawWall(item.ob);return;}
  ctx.save();ctx.globalAlpha=item.alpha??1;ctx.lineCap='butt';
  if(item.kind==='trail'||item.kind==='shaft'){
    const a=project(item.a),b=project(item.b);
    if(item.kind==='trail')line(a.x,a.y,b.x,b.y,'#fff9d7a6',1.7);
    else{
      line(a.x,a.y,b.x,b.y,'#51462f',clamp((a.scale+b.scale)*.012,1.4,3.2));
      line(a.x,a.y,b.x,b.y,'#e5c984',.8);
    }
  }else if(item.kind==='tip'||item.kind==='feather'){
    const p=project(item.point);
    if(p.visible){
      const q=project(item.kind==='tip'?item.tail:item.tip),dx=p.x-q.x,dy=p.y-q.y,l=Math.hypot(dx,dy)||1;
      if(item.kind==='tip'){
        poly([{x:p.x+dx/l*2,y:p.y+dy/l*2},{x:p.x-dx/l*3-dy/l*2.2,y:p.y-dy/l*3+dx/l*2.2},{x:p.x-dx/l*3+dy/l*2.2,y:p.y-dy/l*3-dx/l*2.2}],'#344b3b');
        if(item.flying)circle(p.x,p.y,6,null,'#fff9d95c',1);
      }else{
        line(p.x-dy/l*3,p.y+dx/l*3,p.x-dx/l*4,p.y-dy/l*4,'#e4bd70',1.8);
        line(p.x+dy/l*3,p.y-dx/l*3,p.x-dx/l*4,p.y-dy/l*4,'#f6e7ba',1.6);
      }
    }
  }else if(item.kind==='effect'){
    const effect=item.effect,age=state.time-effect.born,q=project(effect);
    if(q.visible&&age<1.5){
      ctx.globalAlpha=Math.max(0,1-age/1.5);
      if(effect.hit){for(let i=0;i<12;i++){const angle=i/12*Math.PI*2,dist=8+age*42;circle(q.x+Math.cos(angle)*dist,q.y+Math.sin(angle)*dist+age*age*12,Math.max(.5,2-age),i%3?'#f5e3a2':'#fff8da');}circle(q.x,q.y,6+age*32,null,'#fff3b7',1.2);}
      else ellipse(q.x,q.y,6+age*14,2+age*4,'#dad0a85e');
    }
  }
  ctx.restore();
}
function render(){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  drawScenery(ctx,w,h,{time:state.time,stage:state.stage,project,camera});
  const target=targetAt(state.stage,state.time);
  for(const item of sceneItems(target))drawSceneItem(item);
  drawGuide();
  if(state.mode==='ready'||state.mode==='drawing'){const sway=effectiveSway();drawFirstPersonBow(ctx,w,h,{charge:state.charge,swayX:sway.x,swayY:sway.y,color:activeBow().color,drawing:state.mode==='drawing'});}
  drawReticle();
  canvas.dataset.camera=state.mode==='preview'?'preview':state.mode==='flight'?'follow':state.mode==='settling'?(state.settle>IMPACT_HOLD?'return':'impact'):'aim';
}
let hudMode='',hudPercent=-1;
function updatePower(){
  const percent=state.mode==='drawing'?Math.round(state.charge*100):0;
  if(percent!==hudPercent){$('powerFill').style.width=`${percent}%`;$('powerValue').textContent=`${percent}%`;hudPercent=percent;}
  const steady=isSteady(),drawing=state.mode==='drawing';
  $('drawTiming').classList.toggle('steady',steady);$('drawPad').classList.toggle('steady',steady);
  $('steadyLabel').textContent=steady?'지금! 0.5초 조준 안정':drawing&&drawElapsed()>=state.steadyStart+STEADY_DURATION?'안정 구간 끝 · 타이밍을 잡으세요':'1~10초 사이, 한 번은 0.5초 안정';
  $('autoReleaseLabel').textContent=drawing?`자동발사까지 ${(Math.ceil(Math.max(0,DRAW_LIMIT-drawElapsed())*10)/10).toFixed(1)}초`:state.mode==='flight'&&state.shot?.automatic?'10초 · 자동발사':'최대 10초';
  if(state.mode==='flight')$('flightBadge').textContent=`슬로모션 · ${Math.max(0,Math.round(state.shot.position.z))} m 비행 중`;
  $('previewBtn').textContent=state.mode==='preview'?'조준하기':'과녁 보기';
  $('previewBtn').disabled=state.mode==='flight'||state.mode==='settling'||state.mode==='finished';
  const fatigue=state.mode==='drawing'&&state.held>2.6;
  $('powerFill').style.background=steady?'#5f9a70':fatigue?'#c58f66':'#a4b374';
  const mode=state.mode+(steady?'steady':fatigue?'tired':'');
  if(mode===hudMode)return;hudMode=mode;
  $('drawPad').classList.toggle('drawing',state.mode==='drawing');$('drawPad').classList.toggle('flying',state.mode==='flight'||state.mode==='settling'||state.mode==='preview');
  if(state.mode==='drawing'){
    $('powerLabel').textContent=steady?'조준 안정 · 흔들림 없음':fatigue?'팔이 떨리고 있어요':'시위를 당기는 중';$('controlTitle').textContent=steady?'지금은 흔들리지 않아요':'손을 떼는 순간, 발사';$('controlHint').textContent=steady?'방향을 조절하고 원하는 순간에 쏘세요':fatigue?'10초가 되면 자동으로 발사돼요':'움직여 조준하고 안정되는 순간을 잡아보세요';
  }else if(state.mode==='preview'){
    $('powerLabel').textContent='과녁 위치를 확인해요';$('controlTitle').textContent='담장 너머 과녁을 기억하세요';$('controlHint').textContent='곧 사격 위치로 돌아가요 · 과녁 보기로 다시 확인할 수 있어요';
  }else if(state.mode==='flight'){
    $('powerLabel').textContent='슬로모션으로 날아가요';$('controlTitle').textContent='화살을 따라가고 있어요';$('controlHint').textContent='궤적과 떨어지는 위치를 보고 다음 한 발을 준비해요';
  }else if(state.mode==='settling'){
    $('powerLabel').textContent='다음 한 발을 준비해요';$('controlTitle').textContent='호흡을 가다듬고, 다시 한 발';$('controlHint').textContent='곧 다음 화살을 쏠 수 있어요';
  }else{
    $('powerLabel').textContent='활을 당겨보세요';$('controlTitle').textContent='누른 채 조준 · 손을 떼면 발사';$('controlHint').textContent='0.5초 안정 기회 · 10초 후 자동발사';
  }
  canvas.dataset.mode=state.mode;
}
function tick(now){
  const dt=Math.min(.25,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(!document.hidden&&!state.modal){
    if(state.mode==='ready'||state.mode==='drawing'){
      const move=dt*.20/state.zoom;
      if(keys.has('ArrowLeft'))state.aim.yaw-=move;if(keys.has('ArrowRight'))state.aim.yaw+=move;
      if(keys.has('ArrowUp'))state.aim.pitch+=move;if(keys.has('ArrowDown'))state.aim.pitch-=move;
      if(keys.size)clampAim();
      if(state.mode==='drawing')syncDraw(now);
      stepSway(state.sway,dt,activeBow(),state.mode==='drawing'?state.held:0);
      // The deadline uses real elapsed time, independently of capped simulation frames.
      if(state.mode==='drawing'&&drawElapsed(now)>=DRAW_LIMIT)releaseShot(true,now);
    }
    if(state.mode==='preview'){
      state.time+=dt;state.previewElapsed+=dt;
      if(state.previewElapsed>=PREVIEW_RISE+PREVIEW_HOLD+PREVIEW_RETURN){state.mode='ready';state.previewReturnCamera=null;keys.clear();$('flightBadge').classList.add('hidden');}
    }else if(state.mode==='flight'){
      // Targets, wind leaves and the arrow share one slowed simulation clock.
      // Work out this delta AFTER a possible real-time ten-second auto release.
      const flightDt=Math.min(dt,Math.max(0,(now-state.shot.startedAt)/1000))*FLIGHT_TIME_SCALE;
      const before=state.shot.elapsed,result=stepArrow(state.shot,flightDt,state.stage,state.time);
      state.time+=state.shot.elapsed-before;
      if(result)onImpact();
    }else if(state.mode==='settling'){
      state.time+=dt*FLIGHT_TIME_SCALE;
      state.settle+=dt;
      if(state.shot.attachment){const target=targetAt(state.stage,state.time);state.shot.position={x:target.x+state.shot.attachment.x,y:target.y+state.shot.attachment.y,z:target.z};}
      if(state.settle>=IMPACT_HOLD+RETURN_DURATION){
        $('flightBadge').classList.add('hidden');state.returnCamera=null;camera=aimCamera();
        if(state.used>=shotLimit())finishRound();else{state.mode='ready';state.held=0;state.charge=0;}
      }
    }else state.time+=dt;
    updateCamera(dt);
    if(state.feedbackUntil&&state.time>state.feedbackUntil){$('shotFeedback').classList.add('hidden');state.feedbackUntil=0;}
    state.effects=state.effects.filter(e=>state.time-e.born<1.6);
  }
  render();updatePower();requestAnimationFrame(tick);
}
save();resetRound(state.stage);requestAnimationFrame(tick);
