import {PLAYER, BOWS, ARROWS, STAGES, CLAY_EVENT, createClayEvent, eventTargetsAt, prepareStage, passersAt, clamp, targetAt, getSpeed, getWindResponse, sortEquipment, launchArrow, launchVolley, stepArrow, predictTrajectory, createSway, stepSway} from './engine.mjs?v=20261102-archery-progression1';
import {drawScenery, drawAnimal, drawClay, drawUfo, drawObstacle, drawPasser, drawEquipmentIcon, drawFirstPersonBow} from './scenery.mjs?v=20261102-archery-progression1';
import {FLIGHT_TIME_SCALE, IMPACT_HOLD, RETURN_DURATION, PREVIEW_RISE, PREVIEW_HOLD, PREVIEW_RETURN, NEAR_PLANE, projectPoint, depthFragments, desiredFollowCamera, desiredPreviewCamera, lerpCamera} from './view.mjs?v=20261102-archery-progression1';
import {createAmmoClient, createRequestId} from './ammo-client.mjs?v=20261102-archery-progression1';

const $ = id => document.getElementById(id);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d', {alpha:false});
// The reordered test game starts a fresh journey; old saves cannot reappear.
const SAVE_KEY = 'forest-archer-progress-v2';
const DRAW_LIMIT = 10;
const STABILIZER_COST = 5;
const CONSUMABLE_LIMIT = 1e8;
const defaults = () => ({version:1,coins:0,clayCredits:0,stabilizers:0,bow:0,arrow:0,eventGun:20,eventBest:0,eventBestByLevel:{},eventPlays:0,mainRounds:0,ownedBows:[0,20],ownedArrows:[0],scopedBows:[],unlocked:STAGES.length,lastStage:1,best:{},sound:true,shots:0,hits:0});
let persistence = true;
function loadProgress(){
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if(!raw || raw.version!==1) return defaults();
    const base=defaults(), finite=(v,f=0)=>Number.isFinite(v)?v:f;
    const ids=(arr,catalog)=>[...new Set([0,...(Array.isArray(arr)?arr:[]).filter(x=>Number.isInteger(x)&&catalog.some(item=>item.id===x))])];
    base.coins=clamp(Math.floor(finite(raw.coins)),0,1e8);
    base.clayCredits=clamp(Math.floor(finite(raw.clayCredits)),0,CONSUMABLE_LIMIT);
    base.stabilizers=clamp(Math.floor(finite(raw.stabilizers)),0,CONSUMABLE_LIMIT);
    base.ownedBows=[...new Set([...ids(raw.ownedBows,BOWS),20])];base.ownedArrows=ids(raw.ownedArrows,ARROWS);
    base.scopedBows=ids(raw.scopedBows,BOWS).filter(id=>base.ownedBows.includes(id)&&BOWS.find(item=>item.id===id)?.scopeCompatible);
    base.bow=base.ownedBows.includes(raw.bow)&&BOWS[raw.bow]?.weaponType!=='gun'?raw.bow:0;base.arrow=base.ownedArrows.includes(raw.arrow)?raw.arrow:0;
    base.eventGun=base.ownedBows.includes(raw.eventGun)&&BOWS[raw.eventGun]?.weaponType==='gun'?raw.eventGun:20;
    base.eventBest=clamp(Math.floor(finite(raw.eventBest)),0,300);base.eventPlays=Math.max(0,Math.floor(finite(raw.eventPlays)));
    base.mainRounds=clamp(Math.floor(finite(raw.mainRounds)),0,1e7);
    for(let level=1;level<=10;level++)if(Number.isFinite(raw.eventBestByLevel?.[level]))base.eventBestByLevel[level]=clamp(Math.floor(raw.eventBestByLevel[level]),0,createClayEvent(level).maxScore);
    base.unlocked=STAGES.length;
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
  return persistence;
}
const state={stage:STAGES[progress.lastStage-1],time:0,score:0,used:0,hits:0,earned:0,shotScores:[],targetMarks:[],stuck:[],effects:[],mode:'ready',held:0,drawStarted:0,steadyStart:1,steadyDuration:.5,steadyActive:false,stabilizerActive:false,stabilizerNotice:'',charge:0,velocityBias:0,aim:{yaw:0,pitch:0},sway:createSway(),shot:null,settle:0,zoom:1,panX:0,panY:0,modal:null,lastFocus:null,feedbackUntil:0,guide:null,guideAt:0};
let w=1,h=1,dpr=1,camera={},pointer=null,lastFrame=performance.now(),audio=null,toastTimer=0,drawTimer=0,keys=new Set();
let ammo=null,roundRegistration=Promise.resolve();
const ammoRemaining=()=>Number.isInteger(ammo?.snapshot?.remaining)?ammo.snapshot.remaining:null;
const ammoOffer=()=>Number.isSafeInteger(ammo?.snapshot?.pack_ammo)&&ammo.snapshot.pack_ammo>0&&Number.isSafeInteger(ammo?.snapshot?.pack_price)&&ammo.snapshot.pack_price>0?{amount:ammo.snapshot.pack_ammo,price:ammo.snapshot.pack_price}:null;
const ammoLocked=()=>!!state.pendingAmmoShot||!!state.roundSaving||!!ammo?.pending;
const preparingMainRound=()=>!state.isEvent&&!state.practiceOnly&&!state.serverRunId&&ammo?.connection!=='unavailable'&&state.mode!=='finished';
function guardAmmoAction(){
  if(!ammoLocked())return false;
  toast(state.roundSaving?'완료한 판을 저장하고 있어요.':state.pendingAmmoShot?'이번 발사 확인을 마친 뒤 이동할 수 있어요.':'이전 처리 결과를 먼저 확인해 주세요. 총알 충전에서 다시 확인할 수 있어요.');return true;
}
function ammoError(result){
  const messages={ammo_empty:'남은 총알이 없어요. 총알을 충전해 주세요.',coins:'쭈가 부족해요. 지갑을 확인해 주세요.',limit:'총알 보유 한도에 도달했어요.',round_too_soon:'완료 시간을 확인하지 못했어요. 사격장을 다시 시작해 주세요.',sign_in:'로그인한 오락실에서 총알을 사용할 수 있어요.',wallet_unavailable:'계정 연결을 확인해 주세요.',unavailable:'계정 연결을 확인해 주세요.',insufficient_funds:'쭈가 부족해요. 지갑을 확인해 주세요.',insufficient_coins:'쭈가 부족해요. 지갑을 확인해 주세요.',insufficient_ammo:'남은 총알이 없어요. 총알을 충전해 주세요.',no_ammo:'남은 총알이 없어요. 총알을 충전해 주세요.',pending:'처리 결과를 확인하고 있어요. 다시 확인을 눌러 주세요.',network:'연결을 확인한 뒤 다시 눌러 주세요.',banned:'이 계정에서는 현재 구매할 수 없어요.',request_conflict:'이전 요청 결과를 먼저 확인해 주세요.',recovered_spend:'현재 잔량을 확인했어요. 이전 발사를 다시 실행하지 않아요.',storage_unavailable:'브라우저 저장을 허용한 뒤 다시 확인해 주세요.'};
  return messages[result?.reason]||'처리를 확인하지 못했어요. 다시 확인해 주세요.';
}
function updateAmmoPanel(){
  const remaining=ammoRemaining(),known=remaining!==null,pending=!!state.pendingAmmoShot,busy=!!state.ammoBusy;
  const recovery=ammo?.pending&&(ammo.pending.status!=='waiting'||ammo.pending.recovered),registrationFailed=preparingMainRound()&&!state.registering;
  $('ammoPanel').classList.toggle('hidden',!state.isEvent&&!recovery&&!state.awaitingRoundSave&&!registrationFailed);
  $('ammoRemaining').textContent=known?remaining.toLocaleString('ko-KR'):'—';
  $('ammoShopBtn').disabled=!!state.pendingAmmoShot||!!state.roundSaving;
  $('ammoStatus').textContent=pending?(busy?'발사 확인 중 · 이벤트 시간이 잠시 멈춰요':'연결을 확인한 뒤 다시 확인을 눌러 주세요. 같은 발사는 중복 차감하지 않아요.'):
    !known?(ammo?.connection==='connecting'?'계정의 총알을 확인하고 있어요.':'로그인한 오락실에서 총알을 확인해 주세요.'):
    state.ammoNotice||(!ammo.snapshot.milestones_granted?'본편 5판을 완료하면 첫 총알 20발을 받아요.':!ammo.snapshot.daily_eligible?'첫 달성 보상을 받았어요. 일일 20발 보충은 다음 날부터 적용돼요.':'하루 한 번, 20발 미만일 때만 20발까지 보충 · 구매분 포함');
  $('ammoRetryBtn').classList.toggle('hidden',busy||(!pending&&!ammo?.pending&&known&&!registrationFailed));
  $('ammoRetryBtn').disabled=busy||!!state.roundSaving;
  $('ammoRetryBtn').textContent=ammo?.pending?'이전 처리 다시 확인':'다시 확인';
}
function onAmmoChange(){
  if(!ammo)return;
  if(Number.isInteger(ammo.snapshot?.main_rounds)&&!state.roundSaving&&progress.mainRounds!==ammo.snapshot.main_rounds){progress.mainRounds=ammo.snapshot.main_rounds;save();updateRound();}
  const remaining=ammoRemaining();
  if(remaining!==null&&state.isEvent&&!state.pendingAmmoShot){
    if(!state.magazinePrimed){state.magazine=Math.min(activeBow().magazineSize,remaining);state.magazinePrimed=true;}
    else state.magazine=Math.min(state.magazine,remaining);
    if(state.magazine===0&&remaining>0&&state.reloadRemaining===0)state.reloadRemaining=activeBow().reloadSeconds;
  }
  updateAmmoPanel();
  if(state.modal==='ammo')renderAmmoShop();
  if(state.modal==='stabilizer')renderStabilizers();
  updatePower();
  resumeRoundRegistration();
}
function resumeRoundRegistration(){
  if(state.deferRegistration&&!state.registering&&!state.isEvent&&state.mode!=='finished'&&!state.roundSaving&&!ammo?.pending&&ammo?.connection==='ready')registerMainRound();
}
function registerMainRound(){
  if(state.registering)return state.roundStart;
  const epoch=state.roundEpoch,requestId=state.runId,stage=state.stage.id;
  state.serverRunId=null;state.deferRegistration=false;state.registering=true;
  state.roundStart=roundRegistration=roundRegistration.catch(()=>null).then(async()=>{
    if(state.roundEpoch!==epoch||state.isEvent)return {ok:false,reason:'stale'};
    const result=await ammo.startRound(requestId,stage);
    if(state.roundEpoch===epoch){
      state.registering=false;
      if(result?.ok)state.serverRunId=result.run_id;
      else{state.deferRegistration=['busy','pending'].includes(result?.reason);state.practiceOnly=result?.reason==='storage_unavailable';if(state.practiceOnly)toast('저장 없이 연습할 수 있어요. 총알 보상과 구매는 저장이 가능한 브라우저에서 이용해 주세요.');}
      updateAmmoPanel();updatePower();
      Promise.resolve().then(resumeRoundRegistration);
    }
    return result;
  });
}
const activeBow=()=>BOWS[state.isEvent?progress.eventGun:progress.bow];
const activeArrow=()=>ARROWS[progress.arrow];
const usingGun=()=>activeBow().weaponType==='gun';
const weaponSteadyDuration=(item=activeBow())=>clamp(Number.isFinite(item.steadyDuration)?item.steadyDuration:.5,.5,2);
const formatSeconds=value=>String(Number(value.toFixed(2)));
const activeProjectile=()=>usingGun()?{...activeBow().ammo,id:activeBow().id,name:activeBow().ammo?.name||'전용 탄환',color:'#c3b477'}:activeArrow();
const hasScope=(id=activeBow().id)=>progress.scopedBows.includes(id)&&progress.ownedBows.includes(id)&&!!BOWS.find(item=>item.id===id)?.scopeCompatible;
const maximumZoom=()=>hasScope()?3:2;
function setAimZoom(value){
  const next=clamp(value,1,maximumZoom()),delta=Math.min(w*1.08,h*1.5)*(next-state.zoom);
  // Magnify around the current aim, keeping the same world direction under the reticle.
  state.panX-=Math.tan(state.aim.yaw)*delta;
  state.panY+=Math.tan(state.aim.pitch)/Math.cos(state.aim.yaw)*delta;
  state.zoom=next;state.guide=null;updateCamera(0,true);
}
function updateZoomControl(){
  if(state.zoom>maximumZoom())setAimZoom(maximumZoom());
  $('zoomBtn').textContent=state.zoom===3?'조준경 3×':`${state.zoom}×`;
  $('zoomBtn').setAttribute('aria-label',state.zoom===maximumZoom()?'원래 크기로':state.zoom===2?'조준경 세 배 확대':'조준 화면 두 배 확대');
}
const shotLimit=()=>state.stage.shots;
const shotUnit=()=>activeBow().burstCount>1?'회':'발';
const drawElapsed=(now=performance.now())=>Math.max(0,(now-state.drawStarted)/1000);
const isSteady=(now=performance.now())=>state.mode==='drawing'&&drawElapsed(now)>=state.steadyStart&&drawElapsed(now)<state.steadyStart+state.steadyDuration;
const effectiveSway=(now=performance.now())=>isSteady(now)?{x:0,y:0}:state.stabilizerActive?{x:state.sway.x*.5,y:state.sway.y*.5}:state.sway;
const aimAngles=(now=performance.now())=>{const sway=effectiveSway(now);return {yaw:state.aim.yaw+sway.x,pitch:state.aim.pitch+sway.y};};
function shotParams(now=performance.now()){return {...aimAngles(now),charge:state.charge,bow:activeBow(),arrow:activeArrow(),velocityBias:state.velocityBias};}
function syncDraw(now=performance.now()){
  state.held=Math.min(DRAW_LIMIT,drawElapsed(now));state.charge=usingGun()?1:clamp(state.held/1.25,0,1);
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
  state.panX=0;state.panY=(state.zoom-1)*Math.min(w*1.08,h*1.5)*Math.tan(state.aim.pitch);
  if(camera.focal)camera=aimCamera();
  state.sway=createSway();state.guide=null;
}
function aimCamera(){return {x:0,y:PLAYER.y,z:0,cx:w/2+state.panX,horizon:h*.405+state.panY,focal:Math.min(w*1.08,h*1.5)*state.zoom};}
function beginTargetPreview(){
  if(state.modal||!state.stage.obstacles.length||(state.mode!=='ready'&&state.mode!=='drawing'))return;
  cancelDraw();state.mode='preview';state.previewElapsed=0;state.previewReturnCamera=null;
  $('shotFeedback').classList.add('hidden');$('flightBadge').classList.remove('hidden');
  $('flightBadge').textContent='장애물 너머 과녁을 미리 확인하세요';updatePower();
}
function returnFromPreview(){
  if(state.mode!=='preview')return;
  state.previewReturnCamera={...camera};state.previewElapsed=PREVIEW_RISE+PREVIEW_HOLD;
}
function updateCamera(dt=0,immediate=false){
  const base=aimCamera();
  if(state.isEvent){camera=base;return;}
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
  updateStabilizerUi();
  const b=activeBow(),a=activeArrow(),projectile=activeProjectile();
  $('bowName').textContent=b.name;$('bowStat').textContent=`${usingGun()?`그립감 ${b.grip} · 탄창 ${b.magazineSize}발 · 장전 ${b.reloadSeconds.toFixed(1)}초`:`그립감 ${b.grip} · 탄성 ${b.elasticity}`}${b.burstCount>1?` · 3연발 · 집탄 ${b.grouping}`:''}${hasScope()?' · 조준경 장착':''}`;
  $('arrowName').textContent=projectile.name;$('arrowStat').textContent=usingGun()?`탄창 ${b.magazineSize}발 · 장전 ${b.reloadSeconds.toFixed(1)}초`:`촉 ${a.tipMass}g · ${a.fletching.name}`;
  $('projectileLabel').textContent=usingGun()?'AMMO':'ARROW';
  $('loadoutSpeed').textContent=`기준 발사속도 ${getSpeed({bow:b,arrow:a,charge:1,velocityBias:0}).toFixed(1)} m/s`;
  $('loadoutSteady').textContent=`조준 안정 ${formatSeconds(weaponSteadyDuration(b))}초 · 당길 때마다 한 번`;
  for(const [id,item,kind] of [['equippedBow',b,'bow'],['equippedArrow',projectile,usingGun()?'bullet':'arrow']]){
    const cv=$(id),cx=cv.getContext('2d');cx.clearRect(0,0,cv.width,cv.height);drawEquipmentIcon(cx,cv.width,cv.height,{...item,kind,tier:item.id,scopeMounted:kind==='bow'&&hasScope(item.id)});
  }
  updateZoomControl();
  $('soundBtn').innerHTML=`${icon(progress.sound?'sound':'mute')}<span>소리 ${progress.sound?'켜짐':'꺼짐'}</span>`;
  $('soundBtn').setAttribute('aria-label',progress.sound?'소리 끄기':'소리 켜기');
}
function updateRound(){
  const s=state.stage;
  $('levelNumber').textContent=state.isEvent?'EV':String(s.id).padStart(2,'0');
  $('stageChapter').textContent=s.subtitle;
  $('stageName').textContent=s.name;
  $('scoreCount').textContent=state.isEvent?state.hits:state.score;$('goalCount').textContent=state.isEvent?s.totalTargets:s.goal;
  $('scoreUnit').textContent=state.isEvent?'개':'점';$('goalLabel').textContent=state.isEvent?'깬 표적 / 전체 표적':'현재 점수 / 참고 목표';
  $('scoreLegend').classList.toggle('hidden',!!state.isEvent);$('missionTitle').textContent=state.isEvent?'제한시간 기록 도전':'이번 한 발의 목표';
  $('distanceLabel').textContent=`${s.distance} m`;
  $('windLabel').textContent=s.wind?`${s.wind>0?'오른쪽':'왼쪽'} 바람 ${Math.abs(s.wind).toFixed(1)}`:'고요한 바람';
  $('stageHint').textContent=s.hint;
  $('mobileHint').textContent=$('stageHint').textContent;
  $('missionFill').style.width=`${Math.min(100,(state.isEvent?state.hits/s.totalTargets:state.score/s.goal)*100)}%`;
  $('missionState').textContent=state.isEvent?`${state.hits}개 격파 · 시간 동안 기록 도전`:state.score>=s.goal?'참고 목표 달성!':'점수와 관계없이 다음 단계로 이동할 수 있어요';
  $('roundProgress').textContent=state.isEvent?`${state.hits} / ${s.totalTargets}개 명중`:`${state.used} / ${shotLimit()}${shotUnit()}`;
  if(!state.isEvent){$('shotDots').innerHTML=Array.from({length:shotLimit()},(_,i)=>`<i class="arrow-dot ${i<state.used?'used':''}"></i>`).join('');$('shotCountLabel').textContent=`${Math.max(0,shotLimit()-state.used)}${shotUnit()} 남음${activeBow().burstCount>1?' · 3연발':''}`;}
  $('journeyCount').textContent=state.isEvent?`최고 ${(progress.eventBestByLevel[s.eventLevel]||0)/10}개`:`${s.id} / ${STAGES.length}`;
  $('journeyCaption').textContent=state.isEvent?`이벤트 ${s.eventLevel}단계 · ${s.targetsPerWave}개씩 등장`:`50단계 자유 선택 · 이벤트까지 ${5-progress.mainRounds%5}판`;
  $('journeySteps').innerHTML=STAGES.map(s=>`<button class="journey-step ${s.id===state.stage.id?'active':''} ${progress.best[s.id]>=s.goal?'done':''}" data-stage="${s.id}" aria-label="${s.id}단계 ${s.name}"><strong>${String(s.id).padStart(2,'0')}</strong><small>${s.distance}m</small></button>`).join('');
  const journey=$('journeySteps');
  journey.classList.toggle('hidden',!!state.isEvent);$('eventBtn').textContent=state.isEvent?'활쏘기로':'접시 사격';
  const level=state.isEvent?s.eventLevel:s.id,limit=state.isEvent?10:STAGES.length;
  $('previousStageBtn').disabled=level<=1||ammoLocked();$('nextStageBtn').disabled=level>=limit||ammoLocked();$('currentStageBtn').disabled=ammoLocked();$('currentStageBtn').textContent=`지금 ${level}단계 다시`;
  if(journey.dataset.current!==String(s.id)){const active=journey.querySelector?.('.active');journey.scrollTop=Math.max(0,(active?.offsetTop||0)-(journey.offsetTop||0)-12);journey.dataset.current=String(s.id);}
  $('gameCanvas').dataset.stage=s.id;$('gameCanvas').dataset.score=state.score;$('gameCanvas').dataset.shots=state.used;
  $('previewBtn').classList.toggle('hidden',!s.obstacles.length);
  updateAmmoPanel();
}
function resetRound(stage=state.stage){
  if(guardAmmoAction())return;
  state.isEvent=stage.kind==='clay';
  state.roundEpoch=(state.roundEpoch||0)+1;state.runId=createRequestId();state.awaitingRoundSave=null;state.deferRegistration=false;state.registering=false;state.practiceOnly=false;state.ammoNotice='';state.ammoLoading=false;
  cancelDraw();state.stage=prepareStage(stage,Math.floor(Math.random()*0x100000000));state.time=0;state.score=0;state.used=0;state.hits=0;state.earned=0;state.shotScores=[];state.targetMarks=[];state.stuck=[];state.effects=[];state.mode='ready';state.shot=null;state.volley=null;state.returnCamera=null;state.settle=0;state.charge=0;state.feedbackUntil=0;state.zoom=1;
  state.stabilizerActive=false;state.stabilizerNotice='';
  state.eventShots=[];state.eventGunStates={};state.magazine=state.isEvent?Math.min(activeBow().magazineSize,ammoRemaining()??0):0;state.magazinePrimed=ammoRemaining()!==null;state.reloadRemaining=0;state.fireCooldown=0;state.ammoHud='';
  $('shotFeedback').classList.add('hidden');$('flightBadge').classList.add('hidden');recenter();resize();setAimZoom(hasScope()?3:1);updateRound();updateHeader();
  beginTargetPreview();
  if(!state.isEvent)registerMainRound();
  else{
    const epoch=state.roundEpoch;state.ammoLoading=true;
    ammo.refresh().then(result=>{if(state.roundEpoch!==epoch)return;state.ammoLoading=false;if(!result?.ok)state.ammoNotice=ammoError(result);onAmmoChange();});
  }
}
function startStage(id){
  if(guardAmmoAction())return;
  if(!Number.isInteger(id)||id<1||id>STAGES.length)return;
  progress.lastStage=id;save();closeModal();resetRound(STAGES[id-1]);
}
function enterEvent(level=Math.max(1,Math.min(10,Math.floor(progress.mainRounds/5)))){
  if(guardAmmoAction())return;
  if(state.mode==='flight'||state.mode==='settling'){toast('이번 발사가 끝나면 이벤트로 이동할 수 있어요.');return;}
  closeModal();resetRound(createClayEvent(level));
}
function exitEvent(){
  if(guardAmmoAction())return;
  if(state.mode==='flight'||state.mode==='settling'){toast('이번 발사가 끝나면 돌아갈 수 있어요.');return;}
  closeModal();resetRound(STAGES[progress.lastStage-1]);
}
function navigateStage(delta){
  if(guardAmmoAction())return;
  if(state.isEvent){const level=clamp(state.stage.eventLevel+delta,1,10);closeModal();resetRound(createClayEvent(level));}
  else startStage(clamp(state.stage.id+delta,1,STAGES.length));
}
function beginDraw(){
  if(state.modal||state.mode!=='ready'||document.hidden||(!state.isEvent&&state.used>=shotLimit()))return false;
  if(preparingMainRound())return false;
  if(state.isEvent&&(state.ammoLoading||ammo?.pending||ammoRemaining()===null||state.reloadRemaining>0||state.fireCooldown>0||state.time>=state.stage.eventDuration))return false;
  if(state.isEvent&&(ammoRemaining()<=0||state.magazine<=0)){toast('총알이 없어요. 총알 충전에서 잔량을 확인해 주세요.');return false;}
  state.mode='drawing';state.held=0;state.drawStarted=performance.now();state.charge=0;state.velocityBias=Math.random()*2-1;
  state.steadyDuration=weaponSteadyDuration();
  state.steadyStart=1+Math.random()*(DRAW_LIMIT-state.steadyDuration-1);state.steadyActive=false;state.guide=null;
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
  const shots=launchVolley({...shotParams(now),burstSeed:Math.floor(Math.random()*0x100000000)});
  for(const shot of shots){shot.startedAt=now;shot.automatic=automatic||drawElapsed(now)>=DRAW_LIMIT;shot.handled=false;shot.launched=!(shot.launchDelay>0);}
  if(state.isEvent){
    state.pendingAmmoShot={shot:shots[0],epoch:state.roundEpoch,runId:state.runId,gunId:activeBow().id};state.mode='ammo-pending';
    state.guide=null;state.steadyActive=false;state.held=0;state.charge=0;clearPointer();keys.clear();
    submitPendingShot();updateRound();updatePower();return;
  }
  state.shot=shots[0];state.volley=shots.length>1?{shots,elapsed:0,startedAt:now,handled:false}:null;
  state.mode='flight';state.used++;state.guide=null;state.steadyActive=false;state.returnCamera=null;
  clearPointer();keys.clear();
  $('shotFeedback').classList.add('hidden');$('flightBadge').classList.remove('hidden');
  $('flightBadge').textContent='슬로모션 · 화살을 따라가는 중';
  sound('shoot');if(navigator.vibrate)navigator.vibrate(12);updateRound();updatePower();
}
async function submitPendingShot(retry=false){
  const pending=state.pendingAmmoShot;if(!pending||state.ammoBusy)return;
  state.ammoBusy=true;updateAmmoPanel();updatePower();
  const result=await (retry?ammo.retryPending():ammo.spend(pending.runId));
  if(state.pendingAmmoShot!==pending||state.roundEpoch!==pending.epoch)return;
  state.ammoBusy=false;
  if(result?.ok){
    const shot=pending.shot;shot.startedAt=performance.now();shot.firedAt=state.time;
    state.eventShots.push(shot);state.shot=shot;state.volley=null;state.mode='ready';state.used++;
    state.magazine=Math.min(Math.max(0,state.magazine-1),ammoRemaining()??0);state.fireCooldown=.14;
    if(state.magazine===0&&(ammoRemaining()??0)>0)state.reloadRemaining=activeBow().reloadSeconds;
    state.pendingAmmoShot=null;state.ammoNotice='';lastFrame=performance.now();sound('shoot');
  }else if(!ammo.pending){
    state.pendingAmmoShot=null;state.mode='ready';state.ammoNotice=ammoError(result);toast(state.ammoNotice);
  }else{state.ammoNotice=ammoError(result);toast(state.ammoNotice);}
  updateRound();updatePower();
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
function recordImpact(shot,born=state.time){
  if(!shot.result||shot.marked)return;shot.marked=true;
  const r=shot.result,hit=r.type==='hit';
  if(hit){const target=r.targetCenter;if(target.kind==='clay'||target.kind==='ufo'){state.stage.brokenPasses??=[];if(!state.stage.brokenPasses.includes(target.passId))state.stage.brokenPasses.push(target.passId);}else{shot.attachment={x:r.point.x-target.x,y:r.point.y-target.y,passId:target.passId};state.targetMarks.push({...shot.attachment,z:target.z,velocity:{...shot.velocity},projectileType:shot.projectileType});}}
  else if(r.type!=='person'&&!(shot.projectileType==='bullet'&&r.type==='miss'))state.stuck.push({...r.point,velocity:{...shot.velocity},projectileType:shot.projectileType});
  state.effects.push({x:r.point.x,y:r.point.y,z:r.point.z,born,hit,kind:r.targetCenter?.kind});
}
function moveAttachedArrows(){
  for(const shot of state.volley?.shots||[state.shot])if(shot?.attachment){const target=targetAt(state.stage,state.time,shot.attachment.passId);shot.position={x:target.x+shot.attachment.x,y:target.y+shot.attachment.y,z:target.z};}
}
function onEventImpact(shot,at=state.time){
  if(shot.handled)return;shot.handled=true;shot.resolvedAt=at;recordImpact(shot,at);
  const result=shot.result,hit=result.type==='hit',reward=hit?10:0;
  const earnedCredit=state.isEvent&&hit&&['clay','ufo'].includes(result.targetCenter?.kind);
  state.score+=result.score;state.shotScores.push(result.score);if(hit)state.hits++;
  if(earnedCredit)progress.clayCredits=Math.min(CONSUMABLE_LIMIT,progress.clayCredits+1);
  state.earned+=reward;progress.coins+=reward;progress.shots++;if(hit)progress.hits++;save();
  $('feedbackTitle').textContent=hit?`${result.targetCenter.kind==='ufo'?'UFO':'접시'} 격파! +1개`:result.zone;
  $('feedbackDetail').textContent=hit?`${state.hits}개 명중 · ${earnedCredit?'+1 접시 점수 · ':''}+${reward} 코인`:'움직이는 표적의 앞을 겨누세요';
  $('shotFeedback').className=`shot-feedback ${hit?'gold':'miss'}`;state.feedbackUntil=state.time+.75;sound(hit?'hit':'miss');updateHeader();updateRound();
}
function stepEvent(dt,now=performance.now()){
  const start=state.time;state.time+=dt;state.fireCooldown=Math.max(0,state.fireCooldown-dt);
  if(state.reloadRemaining>0){state.reloadRemaining=Math.max(0,state.reloadRemaining-dt);if(state.reloadRemaining===0)state.magazine=Math.min(activeBow().magazineSize,ammoRemaining()??0);}
  // A later, faster bullet can arrive first. Probe without changing the real shots,
  // then resolve by impact time so a broken plate cannot score for a later arrival.
  const advances=state.eventShots.filter(shot=>shot.active).map(shot=>{
    const duration=Math.min(dt,Math.max(0,(now-shot.startedAt)/1000)),worldStart=start+dt-duration;
    const probe={...shot,position:{...shot.position},velocity:{...shot.velocity},trail:[...shot.trail]};
    const result=stepArrow(probe,duration,state.stage,worldStart);
    return {shot,duration,worldStart,impactTime:result?worldStart+probe.elapsed-shot.elapsed:Infinity};
  }).sort((a,b)=>a.impactTime-b.impactTime);
  for(const {shot,duration,worldStart} of advances){const before=shot.elapsed,result=stepArrow(shot,duration,state.stage,worldStart);if(result)onEventImpact(shot,worldStart+shot.elapsed-before);}
  state.eventShots=state.eventShots.filter(shot=>shot.active||state.time-(shot.resolvedAt??state.time)<.7);
  if(state.time>=state.stage.eventDuration){cancelDraw();if(!state.eventShots.some(shot=>shot.active)||state.time>=state.stage.eventDuration+8)finishRound();}
}
function onImpact(){
  if(state.volley){
    if(state.volley.handled||state.volley.shots.some(shot=>shot.active))return;
    state.volley.handled=true;
    // A passer blocks the whole trigger. Otherwise three arrows share one best score.
    state.shot=state.volley.shots.find(shot=>shot.result.type==='person')||state.volley.shots.reduce((best,shot)=>shot.result.score>best.result.score?shot:best);
  }
  const shot=state.shot,r=shot.result;if(shot.handled)return;shot.handled=true;state.mode='settling';state.settle=0;
  for(const arrow of state.volley?.shots||[shot])recordImpact(arrow);
  moveAttachedArrows();
  $('flightBadge').textContent='착지 확인 · 조준 화면으로 돌아가요';
  const hit=r.type==='hit';state.score+=r.score;state.shotScores.push(r.score);
  if(hit)state.hits++;
  const reward=hit?Math.ceil(r.score*.8)+2:1;
  state.earned+=reward;progress.coins+=reward;progress.shots++;if(hit)progress.hits++;save();
  state.feedbackUntil=state.time+1.6;
  $('feedbackTitle').textContent=hit?`${state.volley?'3연발 최고점':r.score===10?'정중앙!':'명중!'} +${r.score}점`:r.zone;
  $('feedbackDetail').textContent=hit?`${state.volley?`${state.volley.shots.filter(arrow=>arrow.result.type==='hit').length}/3발 명중`:r.flightTime.toFixed(2)+'초 비행'} · +${reward} 코인`:`${r.type==='person'?'이번 발사 0점 · 사람이 지나간 틈을 노려보세요':r.type==='obstacle'?'벽 위나 기둥 사이의 틈을 노려보세요':r.type==='ground'?'조준을 높이거나 더 길게 당겨보세요':'거리와 바람을 다시 읽어보세요'} · +1 코인`;
  $('shotFeedback').className=`shot-feedback ${!hit?'miss':r.score===10?'gold':''}`;
  sound(hit?(r.score===10?'bull':'hit'):'miss');if(hit&&navigator.vibrate)navigator.vibrate(r.score===10?[15,30,15]:15);
  updateHeader();updateRound();
}
function installScope(id){
  if(guardAmmoAction())return;
  const item=BOWS.find(entry=>entry.id===id);
  if(!item?.scopeCompatible||!progress.ownedBows.includes(id)){toast('조준경을 달 수 있는 장비를 먼저 구매하세요.');return;}
  if(hasScope(id)){toast('이미 이 장비에 조준경이 장착되어 있어요.');return;}
  if(progress.coins<item.scopePrice){toast('조준경을 달 코인이 부족해요.');return;}
  progress.coins-=item.scopePrice;progress.scopedBows.push(id);state.guide=null;
  if(id===activeBow().id)setAimZoom(3);
  save();updateHeader();sound('buy');showShop('bow');toast(`${item.name}에 3배 조준경 장착! 이 장비에만 사용할 수 있어요.`);
}

function finishMainScreen(record, counted){
  if(state.roundEpoch!==record.epoch)return;
  if(counted&&progress.mainRounds>0&&progress.mainRounds%5===0){
    progress.lastStage=Math.min(STAGES.length,record.stage+1);save();
    enterEvent(Math.min(10,progress.mainRounds/5));toast(`${progress.mainRounds}판 완료! 접시 사격 이벤트 ${state.stage.eventLevel}단계`);return;
  }
  save();updateHeader();updateRound();showResult(record.passed,record.bonus);
}
function applyMainCompletion(record,result){
  if(state.roundEpoch!==record.epoch)return;
  state.awaitingRoundSave=null;
  const count=ammo?.snapshot?.main_rounds??result.main_rounds;
  if(Number.isInteger(count))progress.mainRounds=count;
  finishMainScreen(record,true);
}
async function saveFinishedMainRound(record,registration=null){
  state.roundSaving=true;updateRound();updatePower();
  const started=registration||await record.startPromise;
  if(state.roundEpoch!==record.epoch)return;
  if(started?.ok)record.serverRunId=started.run_id;
  const result=started?.ok?await ammo.completeRound(started.run_id,record.stage):started;
  if(state.roundEpoch!==record.epoch)return;
  state.roundSaving=false;
  if(result?.ok){applyMainCompletion(record,result);return;}
  state.awaitingRoundSave=ammo?.pending?record:null;
  if(state.practiceOnly){finishMainScreen(record,false);return;}
  if(!ammo?.snapshot&&ammo?.connection==='unavailable'&&!ammo.pending){
    // Guest/offline practice retains its local event cadence, never server grants.
    progress.mainRounds++;finishMainScreen(record,true);return;
  }
  state.ammoNotice=ammoError(result);toast('완료 기록을 아직 확인하지 못했어요. 총알 충전에서 다시 확인해 주세요.');
  finishMainScreen(record,false);
}
function finishRound(){
  if(state.mode==='finished'||state.roundSaving)return;state.mode='finished';
  const passed=state.score>=state.stage.goal;
  const previous=state.isEvent?progress.eventBestByLevel[state.stage.eventLevel]||0:progress.best[state.stage.id]||0;
  if(state.isEvent){
    progress.eventBestByLevel[state.stage.eventLevel]=Math.max(previous,state.score);progress.eventBest=Math.max(progress.eventBest,state.score);progress.eventPlays++;
    save();updateHeader();updateRound();showResult(passed,0);return;
  }
  progress.best[state.stage.id]=Math.max(previous,state.score);
  let bonus=0;
  if(passed){bonus=previous<state.stage.goal?25:12;progress.coins+=bonus;state.earned+=bonus;sound('clear');}
  const record={epoch:state.roundEpoch,stage:state.stage.id,passed,bonus,startPromise:state.roundStart,serverRunId:state.serverRunId};
  state.awaitingRoundSave=record;save();saveFinishedMainRound(record);
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
function updateStabilizerUi(){
  const count=progress.stabilizers,active=state.stabilizerActive&&state.mode!=='finished';
  $('stabilizerCount').textContent=count>99?'99+':String(count);
  $('stabilizerBtn').classList.toggle('active',active);
  $('stabilizerBtn').setAttribute('aria-label',`안정제 · ${count.toLocaleString('ko-KR')}개 보유${active?' · 이번 판 떨림 50% 적용 중':''}`);
  $('stabilizerBadge').classList.toggle('hidden',!active);
}
function stabilizerUseReason(){
  if(state.mode==='finished'||(!state.isEvent&&state.used>=shotLimit())||(state.isEvent&&state.time>=state.stage.eventDuration))return '이번 판이 끝났어요. 다음 판에서 사용할 수 있어요.';
  if(state.stabilizerActive)return '이번 판에는 이미 사용했어요. 효과는 중복되지 않아요.';
  if(state.mode==='preview')return '과녁 위치를 확인한 뒤 조준 화면에서 사용할 수 있어요.';
  if(state.mode==='flight'||state.mode==='settling'||state.eventShots?.some(shot=>shot.active))return '발사가 끝나고 조준 화면으로 돌아오면 사용할 수 있어요.';
  if(ammoLocked()||state.ammoBusy||state.ammoLoading||preparingMainRound())return '발사·계정 확인과 저장이 끝나면 사용할 수 있어요.';
  if(state.mode!=='ready')return '조준을 시작하기 전에 사용할 수 있어요.';
  if(state.isEvent&&(ammoRemaining()===null||ammoRemaining()<=0))return '총알을 확인하거나 충전한 뒤 사용할 수 있어요.';
  if(progress.stabilizers<1)return '접시 점수 5개로 안정제를 먼저 구매해 주세요.';
  return '';
}
let stabilizerModalHtml='';
function stabilizerMarkup(){
  const useReason=stabilizerUseReason();
  const buyReason=progress.stabilizers>=CONSUMABLE_LIMIT?'안정제 보유 한도에 도달했어요.':progress.clayCredits<STABILIZER_COST?`구매하려면 접시 점수 ${STABILIZER_COST-progress.clayCredits}개가 더 필요해요.`:'';
  return `<p class="eyebrow">STEADY YOUR NEXT SHOT</p><h2 id="modalTitle">안정제</h2><p class="modal-subtitle">접시 사격에서 모은 점수로, 한 판의 떨림을 절반으로 줄여요.</p><div class="stabilizer-summary"><div><small>접시 점수</small><strong>${progress.clayCredits.toLocaleString('ko-KR')}개</strong></div><div><small>보유 안정제</small><strong>${progress.stabilizers.toLocaleString('ko-KR')}개</strong></div></div><div class="stabilizer-rules"><p><strong>접시 점수 5개 = 안정제 1개</strong><br>이벤트에서 접시나 UFO를 1개 깨면 접시 점수 1개를 받아요.</p><p><strong>이번 판 남은 발사에 적용</strong><br>활·석궁·총기의 떨림이 50%로 줄어요. 한 판에 한 번만 사용하며, 다시 시작하거나 다른 판으로 이동하거나 새로고침하면 효과가 끝나요.</p><p>사용하지 않은 안정제와 남은 접시 점수는 이 기기에 저장돼요.</p></div><div class="stabilizer-actions"><button class="button primary-button" data-action="buy-stabilizer" ${buyReason?'disabled':''}>안정제 1개 구매 · 접시 점수 5개</button>${buyReason?`<p class="stabilizer-message">${buyReason}</p>`:''}<button class="button soft-button" data-action="use-stabilizer" ${useReason?'disabled':''}>${icon('tonic')}${state.stabilizerActive?'이번 판에 사용한 안정제':'안정제 1개 사용 · 떨림 50%'}</button><p class="stabilizer-message" role="status">${state.stabilizerNotice||useReason||'사용하면 이번 판 남은 발사에 바로 적용돼요.'}</p><button class="button soft-button" data-action="close">게임으로 돌아가기</button></div>`;
}
function renderStabilizers(){
  if(state.modal!=='stabilizer')return;
  const html=stabilizerMarkup();if(html===stabilizerModalHtml)return;
  const focusedAction=document.activeElement?.dataset?.action;
  $('modalContent').innerHTML=html;stabilizerModalHtml=html;
  if(['buy-stabilizer','use-stabilizer'].includes(focusedAction)){
    const button=$('modalContent').querySelector?.(`[data-action="${focusedAction}"]`);
    if(button&&!button.disabled)button.focus();else $('modalClose').focus();
  }
}
function showStabilizers(){
  cancelDraw();state.stabilizerNotice='';
  stabilizerModalHtml=stabilizerMarkup();openModal('stabilizer',stabilizerModalHtml,true);
}
function buyStabilizer(){
  if(state.modal!=='stabilizer'||progress.clayCredits<STABILIZER_COST||progress.stabilizers>=CONSUMABLE_LIMIT)return false;
  const credits=progress.clayCredits,inventory=progress.stabilizers;
  progress.clayCredits-=STABILIZER_COST;progress.stabilizers++;
  if(!save()){
    progress.clayCredits=credits;progress.stabilizers=inventory;
    state.stabilizerNotice='저장하지 못해 구매를 취소했어요. 접시 점수는 차감되지 않았어요.';
    renderStabilizers();toast(state.stabilizerNotice);return false;
  }
  state.stabilizerNotice='안정제 1개를 구매했어요. 사용할 판에서 직접 사용해 주세요.';
  updateHeader();renderStabilizers();sound('buy');return true;
}
function useStabilizer(){
  if(state.modal!=='stabilizer')return false;
  const reason=stabilizerUseReason();
  if(reason){state.stabilizerNotice=reason;renderStabilizers();toast(reason);return false;}
  const inventory=progress.stabilizers;progress.stabilizers--;
  if(!save()){
    progress.stabilizers=inventory;
    state.stabilizerNotice='저장하지 못해 사용을 취소했어요. 안정제는 그대로 보관돼요.';
    renderStabilizers();toast(state.stabilizerNotice);return false;
  }
  // Only the inventory is persisted. A new/reloaded round never reuses this effect.
  state.stabilizerActive=true;state.guide=null;state.stabilizerNotice='';
  closeModal();updateHeader();updatePower();toast('안정제 사용! 이번 판 남은 발사의 떨림이 절반으로 줄어요.');return true;
}
function renderAmmoShop(){
  const snapshot=ammo?.snapshot,remaining=ammoRemaining(),known=remaining!==null;
  const offer=ammoOffer(),pack=offer?.amount,price=offer?.price;
  const coins=Number.isInteger(snapshot?.coins)?snapshot.coins:null,busy=!!state.ammoBusy;
  const canBuy=known&&!!offer&&coins!==null&&coins>=price&&!busy&&!ammo?.pending;
  const milestoneCount=Number.isInteger(snapshot?.milestones_granted)?snapshot.milestones_granted:0;
  openModal('ammo',`<p class="eyebrow">READY FOR THE NEXT SHOT</p><h2 id="modalTitle">이벤트 총알 충전</h2><p class="modal-subtitle">보유 총알은 계정에 저장돼요. 탄창에 들어 있는 총알도 이 수량에 포함됩니다.</p><div class="ammo-shop-balance"><div><small>보유 총알</small><strong>${known?remaining.toLocaleString('ko-KR'):'—'}</strong><em>발</em></div><div><small>쭈 지갑</small><strong>${coins===null?'—':coins.toLocaleString('ko-KR')}</strong><em>쭈</em></div></div><div class="ammo-rules"><p><strong>5판마다 첫 달성 총알 20발</strong><br>누적 5·10·15·…·50판에서 한 번씩 받아요. 지금까지 ${milestoneCount}/10회 지급.</p><p><strong>하루 한 번, 잔량을 20발까지</strong><br>첫 달성 보상을 받은 다음 날부터 한국 시간 기준으로 확인해요. 19발 이하면 20발로, 20발 이상이면 그대로예요. 그날 사용한 만큼 다시 채워지지 않아요.</p><p>구매한 총알도 보충 기준에 포함되고 다음 날에도 남아요. 게임 코인과 쭈는 별개예요.</p></div><button class="button primary-button ammo-purchase" data-action="buy-ammo" ${canBuy?'':'disabled'}>${busy?'처리 확인 중…':offer?`${pack}발 구매 · ${price}쭈`:'구매 가격 확인 중'}</button><p class="ammo-purchase-note" role="status">${ammo?.pending?'이전 처리 결과를 확인한 뒤 다시 구매할 수 있어요.':!known?'로그인한 오락실에서 잔량을 확인해 주세요.':coins!==null&&coins<price?'쭈가 부족해요. 오락실 지갑에서 확인해 주세요.':state.ammoNotice||'구매 버튼을 누를 때만 쭈가 차감돼요. 자동 구매는 하지 않아요.'}</p><button class="button soft-button" data-action="retry-ammo" ${busy||state.roundSaving?'disabled':''}>${ammo?.pending?'이전 처리 다시 확인':'잔량 다시 확인'}</button><button class="button soft-button" data-action="close">게임으로 돌아가기</button>`,true);
}
function showAmmoShop(){if(state.pendingAmmoShot||state.roundSaving){guardAmmoAction();return;}renderAmmoShop();}
async function buyAmmo(){
  if(state.modal!=='ammo'||state.ammoBusy||ammoLocked()||ammo?.pending)return;
  const snapshot=ammo.snapshot,offer=ammoOffer();if(!snapshot||!offer||!Number.isInteger(snapshot.coins)||snapshot.coins<offer.price)return;
  state.ammoBusy=true;renderAmmoShop();
  const result=await ammo.buy();state.ammoBusy=false;
  state.ammoNotice=result?.ok?`총알 ${ammo.snapshot?.pack_ammo||20}발을 충전했어요.`:ammoError(result);
  if(result?.ok)sound('buy');toast(state.ammoNotice);onAmmoChange();
}
async function retryAmmo(){
  if(state.ammoBusy||state.roundSaving)return;
  if(state.pendingAmmoShot){await submitPendingShot(true);return;}
  const previous=ammo.pending,record=state.awaitingRoundSave;
  if(previous?.action==='round-start'&&previous.requestId===state.runId)state.deferRegistration=false;
  state.ammoBusy=true;updateAmmoPanel();if(state.modal==='ammo')renderAmmoShop();
  const result=await (ammo.pending?ammo.retryPending():ammo.refresh());
  state.ammoBusy=false;state.ammoNotice=result?.ok?'보유 총알을 확인했어요.':ammoError(result);
  if(result?.ok&&previous?.action==='round-start'&&previous.requestId===state.runId){
    state.serverRunId=result.run_id;state.roundStart=Promise.resolve(result);state.deferRegistration=false;
    if(record&&record.epoch===state.roundEpoch){await saveFinishedMainRound(record,result);return;}
  }
  if(result?.ok&&previous?.action==='round-complete'&&record&&record.epoch===state.roundEpoch&&previous.runId===record.serverRunId){applyMainCompletion(record,result);return;}
  if(result?.ok&&!state.isEvent&&!state.serverRunId&&!state.registering&&state.mode!=='finished'&&!ammo.pending){registerMainRound();await state.roundStart;}
  onAmmoChange();toast(state.ammoNotice);
}
function showHelp(){openModal('help',`<p class="eyebrow">MAKE YOUR FIRST SHOT</p><h2 id="modalTitle">손끝으로 배우는 활쏘기</h2><p class="modal-subtitle">한 발씩 쏘다 보면, 바람과 거리의 감각이 생겨요.</p><div class="help-steps"><div class="help-step"><span>01</span><div><strong>누른 채 움직여 조준</strong><p>아래 조준 영역이나 사격장 화면을 누르고 끌어보세요. 조준점은 크게 무작위로 흔들려요.</p></div></div><div class="help-step"><span>02</span><div><strong>손을 떼는 순간 발사</strong><p>활과 석궁은 길게 당길수록 빠르게 날아요. 총기는 조준하고 놓으면 활·석궁 조합의 최고 속도보다 정확히 2배 빠른 탄환을 발사해요. 누른 뒤 1~10초 사이에 무작위로 한 번 흔들림이 멈춰요. 안정 시간은 기본 활 0.5초부터 장비 등급에 따라 길어져 최고급 석궁은 2초예요. 이벤트 총기는 0.5초예요. 10초 안에 손을 떼지 않으면 자동발사해요.</p></div></div><div class="help-step"><span>03</span><div><strong>먼 곳은 위로, 움직이면 앞쪽으로</strong><p>발사하면 화면이 화살을 슬로모션으로 따라가고, 맞거나 땅에 떨어진 뒤 돌아와요. 화살은 날아가며 떨어져요. 처음 3개 사격장에서는 점선으로 궤적을 알려줘요. 단계가 높아질수록 바람이 강해져요. 날리는 나뭇잎의 방향과 속도를 읽어보세요. 담장이 있는 단계는 시작할 때 위에서 과녁을 보여줘요. ‘과녁 보기’로 다시 확인할 수 있어요. 벽 뒤 과녁은 매번 왼쪽·가운데·오른쪽의 다른 위치에 놓여요. 돌담·나무 울타리·여러 기둥이 있고, 기둥 사이에서는 과녁이 보였다 가려져요. 이동 과녁의 속도도 불규칙하게 바뀌어요. 사람이 지나는 단계는 사이가 열릴 때 뒤의 과녁을 맞혀야 해요. 사람에게 닿으면 그 발은 실패해요. 토끼는 가까이, 사슴은 멀리 지나가고, 새는 위아래로 날아요. 동물은 양쪽 중 무작위 방향에서 나타나 속도를 바꿔요.</p></div></div><div class="help-step"><span>04</span><div><strong>코인을 모아 더 좋은 장비로</strong><p>활은 그립감이 높을수록 덜 흔들리고, 탄성이 높을수록 빠르게 쏴요. 화살은 촉이 가벼우면 빠르게 출발하고, 무거우면 감속과 바람에 덜 밀려요. 넓은 날개는 바람을 더 받고, 좁은 날개는 덜 받아요. 활과 화살을 조합해 내 사격에 맞춰보세요. 상점은 기본 장비부터 상위 장비 순으로 배치돼 있고, 능력치별 정렬로 특성을 비교할 수 있어요. 상위 장비로 갈수록 가격 차이가 커져요. 상위 장비에는 3배 조준경을 달 수 있어요. 한번 단 조준경은 그 장비에 귀속돼 옮길 수 없어요. 본편에는 활 10종·석궁 10종이 있어요. 총기 5종은 별도의 접시 사격 이벤트 전용이에요. 일반 석궁은 단발, 레어 석궁만 3연발이에요. 레어 등급이 높으면 집탄성이 좋아져 3발이 더 가깝게 모여요. 3연발은 발사 기회를 한 번 쓰고 세 발 중 최고 점수를 받아요. 한 발이라도 사람에게 닿으면 이번 발사는 0점이에요. 석궁은 빠르게 출발하지만 감속이 커 사거리가 짧아요. 총기는 전용 탄환을 쓰며 화살 옵션이나 당긴 힘에 영향을 받지 않아요.</p></div></div></div><div class="help-note">본편은 5번 발사하면 한 판이 끝나요. 목표 점수와 관계없이 이전·현재·다음 단계를 자유롭게 선택할 수 있어요. 총 50단계에 도전해보세요. 본편을 5판 마칠 때마다 접시 사격 이벤트가 열려요. 초반에는 접시 2개가 천천히 나오고, 단계가 높아지면 최대 10개가 빠르게 나오며 후반에는 UFO도 등장해요. 보유 총알이 있으면 탄창을 비운 뒤 자동으로 장전돼요. 누적 5·10·15·…·50판 첫 달성 때 총알 20발을 받아요. 첫 달성 다음 날부터 하루 한 번, 총알이 19발 이하면 20발로 채워져요. 20발 이상이면 그대로이고, 같은 날 다시 지급하지 않아요. 구매한 총알도 잔량에 포함돼요. 추가 총알은 20발에 1쭈예요. 접시나 UFO를 1개 깨면 접시 점수 1개를 받아요. 접시 점수 5개로 안정제 1개를 구매하고, 상단 안정제 버튼에서 직접 사용하면 이번 판 남은 발사의 떨림이 절반으로 줄어요. 한 판에 한 번만 사용하며, 다음 판·다시 시작·새로고침에는 효과가 이어지지 않아요.<br>총알과 쭈는 계정에, 장비·게임 코인·사격 기록·접시 점수·보유 안정제는 현재 브라우저에 저장돼요.<br>PC: 방향키로 조준 · SPACE를 누르고 있다 놓으면 발사</div><button class="button primary-button" style="width:100%;margin-top:21px" data-action="close">시위 당기러 가기 ${icon('arrow')}</button>`,true);}
let shopTab='bow',shopWeaponFilter='all',shopSort='progression';
const formatCoins=value=>value.toLocaleString('ko-KR');
const statRow=(label,value)=>`<div class="item-stat"><span>${label}</span><strong>${value}</strong></div>`;
const statMeter=(label,value)=>`${statRow(label,`${value} / 100`)}<div class="stat-track"><span style="width:${clamp(value,0,100)}%"></span></div>`;
function showShop(tab=shopTab){
  if(guardAmmoAction())return;
  if(state.mode==='flight'||state.mode==='settling'){toast('이번 발사가 끝난 뒤 상점을 열 수 있어요.');return;}
  if(state.isEvent)tab='bow';
  shopTab=tab;
  const isBow=tab==='bow',catalog=isBow?BOWS.filter(item=>(item.weaponType==='gun')===!!state.isEvent):ARROWS;
  const sortOptions=isBow
    ?state.isEvent
      ?[['progression','기능순 · 2발 → 4발 → 10발'],['magazine','탄창이 큰 순'],['reload','장전이 빠른 순'],['grip','그립감 높은 순']]
      :[['progression','기능순 · 활 → 단발 → 3연발'],['grip','그립감 높은 순'],['elasticity','탄성 높은 순'],['steady','조준 안정 시간이 긴 순'],['grouping','3연발 집탄성이 높은 순']]
    :[['progression','종합 성능순 · 기본 → 상위'],['wind','바람 영향 적은 순'],['stability','속도 안정성 높은 순'],['tip-light','촉이 가벼운 순'],['tip-heavy','촉이 무거운 순']];
  if(!sortOptions.some(([key])=>key===shopSort))shopSort='progression';
  const filtered=isBow&&!state.isEvent&&shopWeaponFilter!=='all'?catalog.filter(item=>shopWeaponFilter==='crossbow-single'?item.weaponType==='crossbow'&&item.burstCount===1:shopWeaponFilter==='crossbow-burst'?item.weaponType==='crossbow'&&item.burstCount>1:item.weaponType===shopWeaponFilter):catalog;
  const items=sortEquipment(filtered,shopSort);
  const owned=isBow?progress.ownedBows:progress.ownedArrows,equipped=state.isEvent?progress.eventGun:progress[tab];
  const b=activeBow(),a=activeArrow(),projectile=activeProjectile(),comboSpeed=getSpeed({bow:b,arrow:a,charge:1,velocityBias:0}).toFixed(1);
  const cards=items.map(item=>{
    const isOwned=owned.includes(item.id),isEquipped=item.id===equipped,gun=item.weaponType==='gun',burst=item.burstCount>1;
    const scopeMounted=isBow&&hasScope(item.id),shortfall=Math.max(0,item.price-progress.coins);
    const scope=isBow&&item.scopeCompatible?`<div class="item-scope"><span>${scopeMounted?'3배 조준경 · 이 장비에 장착됨':'3배 조준경 장착 가능'}</span><small>장착한 장비에 귀속 · 다른 장비로 이동 불가</small>${scopeMounted?'':`<button class="button scope-button" data-install-scope="${item.id}" ${!isOwned||progress.coins<item.scopePrice?'disabled':''}>${isOwned?`${icon('target')}조준경 장착 · ${formatCoins(item.scopePrice)} 코인`:'장비 구입 후 장착'}</button>${isOwned&&progress.coins<item.scopePrice?`<small class="item-budget">조준경까지 ${formatCoins(item.scopePrice-progress.coins)} 코인 더 필요해요</small>`:''}`}</div>`:'';
    const speed=getSpeed({bow:isBow?item:b,arrow:isBow?a:item,charge:1,velocityBias:0}).toFixed(1);
    let stats=isBow
      ?`${statMeter('그립감',item.grip)}${gun?'':statMeter('탄성',item.elasticity)}${statRow('조준 안정',`${formatSeconds(weaponSteadyDuration(item))}초`)}${statRow('발사 방식',burst?'레어 · 3연발':'단발')}`
      :`${statRow('촉 무게',`${item.tipMass} g`)}${statRow('날개',item.fletching.name)}${statRow('바람 영향',`${Math.round(getWindResponse(item)*100)}%`)}${statRow('속도 안정성',`${item.fletching.stability} / 100`)}${statRow('속도 편차',`±${Math.round(item.variance*1000)/10}%`)}`;
    if(burst)stats+=`${statMeter('집탄성',item.grouping)}${statRow('3발 퍼짐',item.grouping>=90?'매우 좁음':item.grouping>=80?'좁음':item.grouping>=65?'보통':item.grouping>=45?'조금 넓음':'넓음')}`;
    if(gun)stats+=`${statRow('탄약',item.ammo.name)}${statRow('탄창',`${item.magazineSize}발`)}${statRow('장전',`${item.reloadLabel} · ${item.reloadSeconds.toFixed(1)}초`)}`;
    const combo=!isBow&&usingGun()?statRow('현재 총기에 적용','활·석궁 전용'):statRow(gun?'전용 탄환 기준':isBow?'현재 화살과 조합':'현재 활과 조합',`${speed} m/s`);
    const category=isBow?(gun?(item.magazineSize===10?'10발 탄창':`${item.magazineSize}발 · ${item.reloadLabel}`):item.weaponType==='crossbow'?(burst?'레어 3연발':'단발 석궁'):'활 · 단발'):item.tag;
    return `<article class="item-card ${isEquipped?'equipped':''} ${burst?'rare-item':''}" data-equipment="${tab}" data-equipment-id="${item.id}"><div class="item-art"><span class="item-tag">${String(item.shopRank).padStart(2,'0')} · ${category}</span><span class="item-owned">${isEquipped?'장착 중':isOwned?'보유 중':''}</span><canvas data-item-art="${item.id}" width="420" height="180" aria-label="${item.name}"></canvas></div><h3>${item.name}</h3><p>${item.description}</p><div class="item-traits">${stats}</div><div class="item-combination">${combo}</div><div class="item-price"><span>가격</span><strong>${item.price===0?'기본 지급':`${formatCoins(item.price)} 코인`}</strong></div>${!isOwned&&shortfall?`<p class="item-budget">${formatCoins(shortfall)} 코인 더 필요해요</p>`:''}<div class="item-actions"><button class="button ${isEquipped?'':'primary-button'}" data-equip="${item.id}" ${isEquipped||(!isOwned&&shortfall)?'disabled':''}>${isEquipped?'장착 중':isOwned?'장착하기':`${icon('coin')}구매하고 장착`}</button></div>${scope}</article>`;
  }).join('');
  const filters=isBow&&!state.isEvent?`<div class="weapon-filters" aria-label="무기 종류">${[['all','전체 20종'],['bow','활 10종'],['crossbow','석궁 전체 10종'],['crossbow-single','단발 석궁 5종'],['crossbow-burst','레어 3연발 5종']].map(([type,label])=>`<button type="button" class="${shopWeaponFilter===type?'active':''}" data-weapon-filter="${type}">${label}</button>`).join('')}</div>`:'';
  const sorting=`<div class="shop-sort"><label for="shopSort">능력치 정렬</label><select id="shopSort" data-shop-sort aria-label="장비 정렬">${sortOptions.map(([key,label])=>`<option value="${key}" ${key===shopSort?'selected':''}>${label}</option>`).join('')}</select></div>`;
  const sortNotes=isBow?state.isEvent?{
    progression:'2발·느린 장전 → 2발·빠른 장전 → 4발·느린 장전 → 4발·빠른 장전 → 10발 탄창 순서예요. 모든 총기의 출발 탄속은 같고, 탄창·장전·그립감으로 골라요.',
    magazine:'탄창이 큰 순서예요. 한 번 장전해서 쏠 수 있는 발수를 비교하고, 다시 채우는 데 걸리는 시간도 함께 확인하세요.',
    reload:'장전 시간이 짧은 순서예요. 표시된 초가 작을수록 다음 탄창을 빨리 사용할 수 있어요.',
    grip:'그립감이 높은 순서예요. 그립감이 높을수록 조준 흔들림이 줄어요. 탄창과 장전 시간은 따로 비교하세요.'
  }:{
    progression:'활 10종 → 일반 단발 석궁 5종 → 레어 3연발 석궁 5종 순서예요. 같은 기능 안에서는 장비 등급이 올라가고 가격 차이도 커져요. 조준 안정은 0.5초에서 2초까지 길어져요.',
    grip:'그립감이 높은 순서예요. 그립감이 높을수록 조준 흔들림이 줄어요. 탄성과 조준 안정 시간은 따로 비교하세요.',
    elasticity:'탄성이 높은 순서예요. 실제 출발 속도는 무기 종류와 화살에 따라 달라지므로, 현재 화살과 조합한 속도도 함께 확인하세요.',
    steady:'조준 안정 시간이 긴 순서예요. 한 번 당길 때 한 번, 1~10초 안의 무작위 구간에서 그 시간만큼 흔들림이 멈춰요.',
    grouping:'레어 3연발 석궁을 집탄성이 높은 순서로 먼저 보여줘요. 높을수록 3발이 더 가까이 모여요. 집탄성 비교가 필요 없는 단발 장비는 그다음에 보여줘요.'
  }:{
    progression:'바람 영향·속도 안정성·감속을 종합한 등급순이에요. 상위일수록 가격 차이가 커져요. 촉 무게는 용도에 맞게 선택하고 각 능력치로 다시 정렬해보세요.',
    wind:'바람 영향이 작은 순서예요. 나무 화살을 100%로 비교하며, 촉 무게와 날개를 함께 계산한 수치예요.',
    stability:'속도 안정성이 높은 순서예요. 수치가 높을수록 발사할 때마다 생기는 속도 편차가 작아요.',
    'tip-light':'촉이 가벼운 순서예요. 같은 활에서 촉만 가벼워지면 더 빠르게 출발해요. 바람 영향은 날개와 함께 비교하세요.',
    'tip-heavy':'촉이 무거운 순서예요. 같은 활에서 촉만 무거워지면 더 느리게 출발해요. 무겁다고 항상 더 멀리 날아가지는 않아요.'
  };
  const orderNote=sortNotes[shopSort];
  openModal('shop',`<p class="eyebrow">THE ARCHER'S WORKSHOP</p><h2 id="modalTitle">나에게 맞는 한 발.</h2><p class="modal-subtitle">${state.isEvent?'이벤트 전용 총기 5종. 2·4·10발 탄창과 장전 속도를 비교해보세요.':isBow?'활 10종 · 석궁 10종. 총기 5종은 접시 사격 이벤트에서 만날 수 있어요.':'촉 무게와 날개에 따라 출발 속도, 감속, 바람에 밀리는 정도가 달라져요.'}</p><div class="shop-top"><div class="shop-tabs"><button class="${isBow?'active':''}" data-shop-tab="bow"> ${state.isEvent?'이벤트 총기 5종':'무기 20종'}</button>${state.isEvent?'':`<button class="${!isBow?'active':''}" data-shop-tab="arrow">화살 ${ARROWS.length}종</button>`}</div><div class="shop-coins">${icon('coin')}<strong>${formatCoins(progress.coins)}</strong></div></div><div class="shop-loadout"><span>지금의 조합</span><strong>${b.name}${hasScope()?' · 조준경':''} + ${projectile.name}</strong><small>기준 발사속도 ${comboSpeed} m/s</small><small class="shop-loadout-steady">조준 안정 ${formatSeconds(weaponSteadyDuration(b))}초</small></div>${state.isEvent?`<button class="button ammo-shop-link" data-action="ammo-shop"><span>보유 총알 <strong>${ammoRemaining()??"—"}발</strong></span><span>${ammoOffer()?`${ammoOffer().amount}발 충전 · ${ammoOffer().price}쭈 →`:'총알 충전 →'}</span></button>`:""}${filters}${sorting}<p class="shop-order-note">${orderNote}</p><div class="shop-grid">${cards}</div><p class="shop-footnote">${state.isEvent?'총기는 접시·UFO 사격 이벤트 전용이에요. 탄창을 비우면 자동 장전하며 장전 중에는 발사할 수 없어요.<br>조준하고 손을 떼면 발사하며, 당기는 시간과 화살 옵션은 탄환 속도에 영향을 주지 않아요.<br>총기에 단 조준경도 해당 총기에 영구 귀속돼요.':isBow?'일반 석궁은 단발, 레어 석궁만 3연발이에요. 집탄성이 높을수록 3발이 더 가깝게 모여요.<br>3연발은 발사 기회 1회를 사용하고 최고 점수 하나를 받아요. 사람이 맞으면 그 발사 전체가 0점이에요.<br>석궁은 빠르게 출발하지만 감속이 커서 사거리가 짧게 설정되어 있어요.<br>총기는 전용 탄환을 사용하고 화살 옵션과 당긴 힘은 적용하지 않아요.<br>조준경은 장착한 장비에 영구 귀속돼요. 다른 장비에는 새로 구매해야 해요.':'바람 영향은 나무 화살을 100%로 비교하며, 낮을수록 바람에 덜 밀려요.<br>무거운 촉이 항상 더 멀리 날아가지는 않아요.'}<br>${state.isEvent?'전용 탄환의 출발 속도는 총기마다 같아요.':'표시 속도는 기준값이며 실제 발사에는 편차가 있어요.'}<br>게임에서 모은 코인으로 구매해요. 장비와 활·석궁 화살은 계속 사용할 수 있어요. 이벤트 총알은 발사할 때 1발씩 소모돼요.</p>`);
  for(const cv of document.querySelectorAll('[data-item-art]')){const item=items.find(entry=>entry.id===+cv.dataset.itemArt);drawEquipmentIcon(cv.getContext('2d'),cv.width,cv.height,{...item,kind:tab,tier:item.id,scopeMounted:isBow&&hasScope(item.id)});}
}
function equipItem(id){
  if(guardAmmoAction())return;
  const kind=shopTab,item=(kind==='bow'?BOWS:ARROWS)[id],owned=kind==='bow'?progress.ownedBows:progress.ownedArrows;
  if(!item)return;
  if(state.isEvent?(kind==='arrow'||item.weaponType!=='gun'):(kind==='bow'&&item.weaponType==='gun')){toast(state.isEvent?'접시 이벤트에는 전용 총기를 사용해요.':'총기는 접시 사격 이벤트에서 사용할 수 있어요.');return;}
  if(!owned.includes(id)){if(progress.coins<item.price){toast('코인을 조금 더 모아보세요.');return;}progress.coins-=item.price;owned.push(id);sound('buy');toast(`${item.name} 구매 완료! 바로 장착했어요.`);}
  else toast(`${item.name} 장착 완료`);
  if(state.isEvent&&id!==progress.eventGun){
    state.eventGunStates[progress.eventGun]={magazine:state.magazine,reloadRemaining:state.reloadRemaining,fireCooldown:state.fireCooldown};
    const loaded=state.eventGunStates[id]||{magazine:Math.min(item.magazineSize,ammoRemaining()??0),reloadRemaining:0,fireCooldown:0};
    state.magazine=Math.min(loaded.magazine,ammoRemaining()??0);state.reloadRemaining=loaded.reloadRemaining;state.fireCooldown=loaded.fireCooldown;
    if(state.magazine===0&&(ammoRemaining()??0)>0&&state.reloadRemaining===0)state.reloadRemaining=item.reloadSeconds;
  }
  progress[state.isEvent?'eventGun':kind]=id;
  if(kind==='bow')setAimZoom(hasScope()?3:Math.min(state.zoom,maximumZoom()));
  state.sway=createSway();state.guide=null;save();updateHeader();updateRound();showShop(kind);
}
function starsFor(score,goal){return score<goal?0:score>=44?3:score>=34?2:1;}
function showResult(passed,bonus){
  const event=state.isEvent,level=event?state.stage.eventLevel:state.stage.id,limit=event?10:STAGES.length;
  const stars=starsFor(state.score,state.stage.goal),bestCount=(progress.eventBestByLevel[state.stage.eventLevel]||0)/10;
  const title=event?`표적 ${state.hits}개 격파!`:passed?'참고 목표를 달성했어요!':'한 판을 마쳤어요.';
  const description=event?`제한시간 기록 · ${state.used}발 사용 · 이 단계 최고 ${bestCount}개`:'점수와 관계없이 원하는 단계로 계속할 수 있어요.';
  const metrics=event?`<div><small>깨뜨린 표적</small><strong>${state.hits}</strong><em>개</em></div><div><small>발사한 탄환</small><strong>${state.used}</strong><em>발</em></div>`:`<div><small>이번 점수</small><strong>${state.score}</strong><em>/ 50</em></div><div><small>명중</small><strong>${state.hits}</strong><em>/ 5${shotUnit()}</em></div>`;
  openModal('result',`<div class="result-content"><div class="result-emblem">${icon(event||passed?'target':'wind')}</div><p class="eyebrow">${event?'YOUR EVENT RECORD':'YOUR NEXT SHOT'}</p><h2 id="modalTitle">${title}</h2><p>${description}</p>${event?'':`<div class="result-stars" aria-label="별 ${stars}개">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div>`}<div class="result-metrics">${metrics}<div><small>획득 코인</small><strong>+${state.earned}</strong></div></div><div class="result-actions stage-result-actions"><button class="button" data-action="previous-stage" ${level<=1?'disabled':''}>이전 단계</button><button class="button" data-action="retry">지금 단계 다시</button><button class="button ${event?'':'primary-button'}" data-action="${event?'next-stage':'next'}" ${level>=limit?'disabled':''}>다음 단계</button>${event?'<button class="button primary-button return-main" data-action="leave-event">본편 계속하기</button>':''}</div><p class="result-note">${event?'깬 개수와 관계없이 다음 판으로 계속할 수 있어요.':bonus?`참고 목표 보너스 ${bonus}코인이 포함되어 있어요.`:'이번에 얻은 코인은 그대로 남아 있어요.'}</p>${ammo?.pending?'<button class="button soft-button" data-action="retry-ammo">이전 처리 다시 확인</button>':''}<button class="text-button" data-action="${event?'event-shop':'result-shop'}">${event?'이벤트 총기':'장비'} 살펴보기 ${icon('bag')}</button></div>`,true);
}
function showStages(){
  if(guardAmmoAction())return;
  if(state.mode==='flight'||state.mode==='settling'){toast('화살이 도착하면 사격장을 바꿀 수 있어요.');return;}
  const chapterNames=['숲길 익히기','움직임 읽기','바람에 맞서기','담장 너머로','궁수의 도전'];
  const ranges=chapterNames.map((name,i)=>({first:i*10+1,last:Math.min(STAGES.length,i*10+10),name})).filter(range=>range.first<=STAGES.length);
  openModal('stages',`<p class="eyebrow">FOLLOW YOUR OWN TRAIL</p><h2 id="modalTitle">어느 숲길로 갈까요?</h2><p class="modal-subtitle">총 ${STAGES.length}단계 · 거리·움직임·바람·장애물을 함께 반영한 난이도 순서예요. 모든 단계를 점수 제한 없이 선택할 수 있어요.</p><nav class="stage-range-nav" aria-label="단계 구간">${ranges.map(range=>`<button type="button" data-stage-range="${range.first}">${range.first}–${range.last}</button>`).join('')}<button type="button" data-action="close">닫기</button></nav><div class="stage-grid">${STAGES.map((s,i)=>{const locked=false,best=progress.best[s.id]||0,stars=starsFor(best,s.goal),range=ranges[Math.floor(i/10)];return `${i%10===0?`<h3 class="stage-section-title" id="stage-range-${s.id}">${String(s.id).padStart(2,'0')}–${range.last} · ${range.name}</h3>`:''}<button class="stage-card ${s.id===state.stage.id?'active':''}" data-stage="${s.id}" ${locked?'disabled':''} aria-label="${s.id}단계 ${s.name}${locked?' 잠김':''}"><span class="stage-index">${String(s.id).padStart(2,'0')}${locked?' · ◇':''}</span><strong>${s.name}</strong><small>${s.distance}m · 참고 목표 ${s.goal}점</small><span class="stage-stars">${locked?'앞 단계를 통과하세요':'★'.repeat(stars)+'☆'.repeat(3-stars)}</span></button>`}).join('')}</div>`);
}
document.addEventListener('click',e=>{
  const btn=e.target.closest('button');if(!btn)return;
  if(btn.classList.contains('shop-open'))showShop();
  if(btn.dataset.shopTab)showShop(btn.dataset.shopTab);
  if(btn.dataset.weaponFilter&&['all','bow','crossbow','crossbow-single','crossbow-burst'].includes(btn.dataset.weaponFilter)){shopWeaponFilter=btn.dataset.weaponFilter;showShop('bow');}
  if(btn.dataset.equip!==undefined)equipItem(+btn.dataset.equip);
  if(btn.dataset.installScope!==undefined)installScope(+btn.dataset.installScope);
  if(btn.dataset.stageRange)$(`stage-range-${btn.dataset.stageRange}`)?.scrollIntoView?.({block:'start',behavior:'smooth'});
  if(btn.dataset.stage){if(state.mode==='flight'||state.mode==='settling'){toast('이번 화살이 도착하면 이동할 수 있어요.');return;}startStage(+btn.dataset.stage);}
  const act=btn.dataset.action;
  if(act==='ammo-shop')showAmmoShop();
  if(act==='buy-ammo')buyAmmo();
  if(act==='buy-stabilizer')buyStabilizer();
  if(act==='use-stabilizer')useStabilizer();
  if(act==='retry-ammo')retryAmmo();
  if(act==='close')closeModal();
  if(act==='retry'){closeModal();resetRound();}
  if(act==='previous-stage')navigateStage(-1);
  if(act==='next-stage')navigateStage(1);
  if(act==='leave-event')exitEvent();
  if(act==='event-shop'){closeModal();showShop();}
  if(act==='next')startStage(Math.min(STAGES.length,state.stage.id+1));
  if(act==='result-shop'){closeModal();showShop();}
});
document.addEventListener('change',e=>{
  if(e.target.id!=='shopSort'||state.modal!=='shop')return;
  const returnFocus=state.lastFocus;
  shopSort=e.target.value;showShop(shopTab);state.lastFocus=returnFocus;$('shopSort').focus();
});
$('helpBtn').addEventListener('click',showHelp);$('stagesBtn').addEventListener('click',showStages);$('modalClose').addEventListener('click',closeModal);
$('eventBtn').addEventListener('click',()=>state.isEvent?exitEvent():enterEvent());
$('ammoShopBtn').addEventListener('click',showAmmoShop);$('ammoRetryBtn').addEventListener('click',retryAmmo);
$('stabilizerBtn').addEventListener('click',showStabilizers);
$('previousStageBtn').addEventListener('click',()=>navigateStage(-1));$('currentStageBtn').addEventListener('click',()=>navigateStage(0));$('nextStageBtn').addEventListener('click',()=>navigateStage(1));
$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))closeModal();});
$('soundBtn').addEventListener('click',()=>{progress.sound=!progress.sound;save();updateHeader();if(progress.sound)sound('hit');});
$('zoomBtn').addEventListener('click',()=>{if(state.modal||ammoLocked()||state.mode==='flight'||state.mode==='settling'||state.mode==='preview')return;cancelDraw();setAimZoom(state.zoom>=maximumZoom()?1:state.zoom+1);updateZoomControl();});
$('recenterBtn').addEventListener('click',()=>{if(ammoLocked()||state.mode==='flight'||state.mode==='settling'||state.mode==='preview')return;cancelDraw();recenter();});
$('previewBtn').addEventListener('click',()=>state.mode==='preview'?returnFromPreview():beginTargetPreview());
document.addEventListener('keydown',e=>{
  if(e.code==='Escape'){if(state.modal)closeModal();else cancelDraw();return;}
  if(state.modal){
    if(e.code==='Tab'){const focusable=[...$('modal').querySelectorAll('button:not(:disabled),select:not(:disabled),[tabindex="0"]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
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
  if(target.active===false)return;
  const p=project(target);if(!p.visible)return;
  const r=target.radius*p.scale;
  ctx.save();
  const ground=project({x:target.x,y:0,z:target.z});
  ellipse(ground.x+3,ground.y+2,r*1.08,Math.max(2,r*.11),'#2f442a24');
  if(target.kind==='clay')drawClay(ctx,p.x,p.y,r,state.time,target.direction);
  else if(target.kind==='ufo')drawUfo(ctx,p.x,p.y,r,state.time,target.direction);
  else if(target.kind!=='target'){
    if(target.kind==='bird')ellipse(ground.x,ground.y,r*.7,Math.max(1,r*.05),'#334b2413');
    drawAnimal(ctx,p.x,p.y,r,target.kind,state.time,target.direction);
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
function drawWall(ob){drawObstacle(ctx,ob,{project,camera,nearPlane:NEAR_PLANE});}

function drawReticle(){
  if(state.mode==='flight'||state.mode==='settling'||state.mode==='finished'||state.mode==='preview')return;
  const p=screenAim(),held=state.mode==='drawing',steady=isSteady();
  const scoped=hasScope()&&state.zoom===3;
  const radius=scoped?4:held?10:8;ctx.save();ctx.lineCap='round';
  if(scoped){
    circle(p.x,p.y,43,'#b3d0b209','#314d3c66',1.2);
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){line(p.x+dx*19,p.y+dy*19,p.x+dx*39,p.y+dy*39,'#244532b3',1);}
    ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillStyle='#284833';ctx.fillText('3×',p.x,p.y+58);
  }
  circle(p.x,p.y,radius,null,'#23372a66',2.7);circle(p.x,p.y,radius,null,held?'#fffceb':'#fffcebcc',1.2);
  for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){line(p.x+dx*(radius+4),p.y+dy*(radius+4),p.x+dx*(radius+9),p.y+dy*(radius+9),'#263b2a77',2.5);line(p.x+dx*(radius+4),p.y+dy*(radius+4),p.x+dx*(radius+9),p.y+dy*(radius+9),'#fffce3e6',1.1);}
  circle(p.x,p.y,1.7,'#fffbe6','#34483188',.7);
  if(held){ctx.beginPath();ctx.arc(p.x,p.y,16,-Math.PI/2,-Math.PI/2+Math.PI*2*state.charge);ctx.strokeStyle=steady?'#caffbc':state.held>2.6?'#e8a776':'#e2c276';ctx.lineWidth=steady?3:2;ctx.stroke();}
  if(steady){ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#294b38';ctx.strokeText('안정',p.x,p.y-25);ctx.fillStyle='#d8ffcb';ctx.fillText('안정',p.x,p.y-25);}
  ctx.restore();
}
function drawGuide(){
  if(state.mode!=='drawing'||state.stage.id>3||state.isEvent)return;
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
  const people=passersAt(state.stage,state.time);
  const planes=[target.z,...[...state.stage.obstacles,...people].flatMap(ob=>[ob.z-ob.depth/2,ob.z+ob.depth/2])];
  // An arrow belongs to the animal it hit, even after the next animal enters.
  const targets=new Map((state.isEvent?eventTargetsAt(state.stage,state.time):[target]).map(subject=>[subject.passId,subject]));
  for(const mark of state.targetMarks)if(mark.passId!==undefined&&!targets.has(mark.passId))targets.set(mark.passId,targetAt(state.stage,state.time,mark.passId));
  const items=[...targets.values()].map(subject=>({kind:'target',z:subject.z,order:0,target:subject}));
  items.push(...state.stage.obstacles.map(ob=>({kind:'wall',z:ob.z-ob.depth/2,order:0,ob})));
  items.push(...people.map(person=>({kind:'person',z:person.z-person.depth/2,order:0,person})));
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
  const addArrow=(tip,velocity,alpha=1,flying=false,projectileType='arrow')=>{
    if(tip.z-camera.z<.6)return;
    if(projectileType==='bullet'){items.push({kind:'bullet',z:surfaceDepth(tip),order:4,point:tip,alpha,flying});return;}
    const length=Math.hypot(velocity.x,velocity.y,velocity.z)||1;
    const tail={x:tip.x-velocity.x/length*.85,y:tip.y-velocity.y/length*.85,z:tip.z-velocity.z/length*.85};
    addLine(tail,tip,'shaft',alpha);
    if(tail.z>camera.z+NEAR_PLANE)items.push({kind:'feather',z:surfaceDepth(tail),order:3,point:tail,tip,alpha});
    items.push({kind:'tip',z:surfaceDepth(tip),order:4,point:tip,tail,alpha,flying});
  };
  for(const stuck of state.stuck)addArrow(stuck,stuck.velocity||{x:0,y:-.5,z:1},.75,false,stuck.projectileType);
  // Keep every hit in target-local coordinates, including each animal pass.
  // Full shafts remain at their original entry angle as the target moves.
  for(const mark of state.targetMarks){const subject=targets.get(mark.passId)||target;addArrow({x:subject.x+mark.x,y:subject.y+mark.y,z:subject.z-.002},mark.velocity||{x:0,y:-.2,z:1},1,false,mark.projectileType);}
  for(const shot of state.isEvent?state.eventShots:state.volley?.shots||[state.shot])if(shot&&shot.launched!==false&&(state.isEvent||state.mode==='flight'||state.mode==='settling')){
    const alpha=state.isEvent?(shot.active?1:Math.max(0,1-(state.time-shot.resolvedAt)/.7)):state.mode==='settling'?Math.max(0,1-state.settle/(IMPACT_HOLD+RETURN_DURATION)):1;
    const points=[...shot.trail,shot.position];
    for(let i=1;i<points.length;i++)addLine(points[i-1],points[i],'trail',alpha);
    if((state.isEvent||state.mode==='flight')&&shot.active)addArrow(shot.position,shot.velocity,1,true,shot.projectileType);
  }
  for(const effect of state.effects)items.push({kind:'effect',z:effect.z-.002,order:5,effect});
  return items.sort((a,b)=>b.z-a.z||a.order-b.order);
}
function drawSceneItem(item){
  if(item.kind==='target'){drawTarget(item.target);return;}
  if(item.kind==='wall'){drawWall(item.ob);return;}
  if(item.kind==='person'){drawPasser(ctx,item.person,{project,camera,nearPlane:NEAR_PLANE,time:state.time});return;}
  ctx.save();ctx.globalAlpha=item.alpha??1;ctx.lineCap='butt';
  if(item.kind==='bullet'){
    const p=project(item.point);if(p.visible)circle(p.x,p.y,clamp(p.scale*.028,1.4,4),'#dcc57c','#5e573d',.7);
  }else if(item.kind==='trail'||item.kind==='shaft'){
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
      if(effect.kind==='clay'||effect.kind==='ufo'){for(let i=0;i<10;i++){const angle=i/10*Math.PI*2,dist=5+age*(25+i*4),x=q.x+Math.cos(angle)*dist,y=q.y+Math.sin(angle)*dist+age*age*28,r=Math.max(1,4-age*2);poly([{x:x-r,y},{x:x+r,y:y-r},{x:x+r*.4,y:y+r}],effect.kind==='ufo'?(i%2?'#96c4c8':'#c9f6e3'):i%2?'#dd743e':'#f4b565');}}
      else if(effect.hit){for(let i=0;i<12;i++){const angle=i/12*Math.PI*2,dist=8+age*42;circle(q.x+Math.cos(angle)*dist,q.y+Math.sin(angle)*dist+age*age*12,Math.max(.5,2-age),i%3?'#f5e3a2':'#fff8da');}circle(q.x,q.y,6+age*32,null,'#fff3b7',1.2);}
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
  if(state.mode==='ready'||state.mode==='drawing'){const sway=effectiveSway();drawFirstPersonBow(ctx,w,h,{charge:state.charge,swayX:sway.x,swayY:sway.y,color:activeBow().color,weaponType:activeBow().weaponType,scopeMounted:hasScope(),tier:activeBow().id,burstCount:activeBow().burstCount,grouping:activeBow().grouping,grip:activeBow().grip,elasticity:activeBow().elasticity,tipMass:activeArrow().tipMass,fletching:activeArrow().fletching,arrowColor:activeArrow().color,drawing:state.mode==='drawing'});}
  drawReticle();
  canvas.dataset.scope=hasScope()?((state.mode==='ready'||state.mode==='drawing')&&state.zoom===3?'active':'mounted'):'none';
  canvas.dataset.camera=state.mode==='preview'?'preview':state.mode==='flight'?'follow':state.mode==='settling'?(state.settle>IMPACT_HOLD?'return':'impact'):'aim';
}
let hudMode='',hudPercent=-1;
function updatePower(){
  if(state.modal==='stabilizer')renderStabilizers();
  const reloading=state.isEvent&&state.reloadRemaining>0,drawing=state.mode==='drawing',steady=isSteady();
  const steadySeconds=formatSeconds(drawing?state.steadyDuration:weaponSteadyDuration());
  const ammoWait=state.isEvent&&(state.ammoLoading||!!state.pendingAmmoShot||!!ammo?.pending||ammoRemaining()===null),empty=state.isEvent&&ammoRemaining()===0;
  const preparing=preparingMainRound();
  const percent=reloading?Math.round(100*(1-state.reloadRemaining/activeBow().reloadSeconds)):drawing?Math.round(state.charge*100):0;
  if(percent!==hudPercent){$('powerFill').style.width=`${percent}%`;$('powerValue').textContent=`${percent}%`;hudPercent=percent;}
  $('drawTiming').classList.toggle('steady',steady);$('drawPad').classList.toggle('steady',steady);
  $('steadyLabel').textContent=reloading?'탄창을 채우고 있어요':steady?`지금! ${steadySeconds}초 조준 안정`:drawing&&drawElapsed()>=state.steadyStart+state.steadyDuration?'안정 구간 끝 · 타이밍을 잡으세요':`1~10초 사이, 한 번은 ${steadySeconds}초 안정`;
  $('autoReleaseLabel').textContent=reloading?`장전 ${state.reloadRemaining.toFixed(1)}초`:drawing?`자동발사까지 ${(Math.ceil(Math.max(0,DRAW_LIMIT-drawElapsed())*10)/10).toFixed(1)}초`:state.isEvent?`탄창 ${state.magazine}/${activeBow().magazineSize}`:state.mode==='flight'&&state.shot?.automatic?'10초 · 자동발사':'최대 10초';
  if(state.isEvent){
    const remaining=Math.max(0,state.stage.eventDuration-state.time);
    $('flightBadge').classList.toggle('hidden',state.mode==='finished');
    $('flightBadge').textContent=`이벤트 ${state.stage.eventLevel} · ${state.stage.targetsPerWave}개씩 · ${remaining.toFixed(1)}초`;
    const ammoKey=`${state.magazine}/${activeBow().magazineSize}/${reloading}`;
    if(state.ammoHud!==ammoKey){state.ammoHud=ammoKey;$('shotDots').innerHTML=Array.from({length:activeBow().magazineSize},(_,i)=>`<i class="ammo-dot ${i>=state.magazine?'used':''}"></i>`).join('');$('shotCountLabel').textContent=`${state.magazine} / ${activeBow().magazineSize}발${reloading?' · 장전 중':''}`;}
  }else if(state.mode==='flight')$('flightBadge').textContent=`${state.volley?`3연발 ${state.volley.shots.filter(shot=>shot.launched).length}/3 · `:'슬로모션 · '}${Math.max(0,Math.round(state.shot.position.z))} m 비행 중`;
  $('previewBtn').textContent=state.mode==='preview'?'조준하기':'과녁 보기';
  $('previewBtn').disabled=state.mode==='flight'||state.mode==='settling'||state.mode==='finished';
  $('eventBtn').disabled=ammoLocked()||state.mode==='flight'||state.mode==='settling';
  const level=state.isEvent?state.stage.eventLevel:state.stage.id,limit=state.isEvent?10:STAGES.length;
  $('previousStageBtn').disabled=ammoLocked()||level<=1;$('nextStageBtn').disabled=ammoLocked()||level>=limit;$('currentStageBtn').disabled=ammoLocked();
  $('drawPad').setAttribute('aria-disabled',reloading||ammoWait||empty||preparing||state.roundSaving?'true':'false');
  const fatigue=drawing&&state.held>2.6;
  $('powerFill').style.background=reloading?'#829b9d':steady?'#5f9a70':fatigue?'#c58f66':'#a4b374';
  const mode=state.mode+activeBow().id+(state.roundSaving?'saving':preparing?'preparing':ammoWait?'ammo-wait':empty?'empty':reloading?'reload':steady?'steady':fatigue?'tired':'');
  canvas.dataset.mode=state.mode;
  if(mode===hudMode)return;hudMode=mode;
  $('drawPad').setAttribute('aria-label',`누른 채 끌어서 조준, 손을 떼면 발사. 1초에서 10초 사이에 한 번 ${steadySeconds}초간 흔들림이 멈추고, 10초가 되면 자동발사합니다. 키보드는 화살표로 조준, 스페이스를 누른 후 떼어 발사.`);
  $('drawPad').classList.toggle('drawing',drawing);$('drawPad').classList.toggle('flying',reloading||state.mode==='flight'||state.mode==='settling'||state.mode==='preview');
  if(state.roundSaving){
    $('powerLabel').textContent='완료 기록 저장 중';$('controlTitle').textContent='이번 판을 계정에 기록해요';$('controlHint').textContent='5판마다 첫 달성 총알 20발을 확인합니다';
  }else if(preparing){
    $('powerLabel').textContent='사격장 준비 중';$('controlTitle').textContent='곧 첫 화살을 쏠 수 있어요';$('controlHint').textContent='연결이 늦어지면 아래 다시 확인을 눌러 주세요';
  }else if(ammoWait){
    $('powerLabel').textContent='총알 확인 중';$('controlTitle').textContent=state.pendingAmmoShot?'놓은 방향 그대로 발사를 확인해요':'계정의 총알을 확인해요';$('controlHint').textContent='확인하는 동안 이벤트 시간은 줄지 않아요';
  }else if(empty){
    $('powerLabel').textContent='보유 총알 0발';$('controlTitle').textContent='총알을 충전해 주세요';$('controlHint').textContent='다음 단계 선택과 본편 복귀는 계속할 수 있어요';
  }else if(reloading){
    $('powerLabel').textContent='자동 장전 중';$('controlTitle').textContent=`${activeBow().magazineSize}발을 다시 채워요`;$('controlHint').textContent='장전이 끝나면 바로 쏠 수 있어요';
  }else if(drawing){
    $('powerLabel').textContent=steady?'조준 안정 · 흔들림 없음':fatigue?'팔이 떨리고 있어요':usingGun()?'발사 준비 완료':'시위를 당기는 중';$('controlTitle').textContent=steady?'지금은 흔들리지 않아요':'손을 떼는 순간, 발사';$('controlHint').textContent=steady?'방향을 조절하고 원하는 순간에 쏘세요':fatigue?'10초가 되면 자동으로 발사돼요':'움직여 조준하고 안정되는 순간을 잡아보세요';
  }else if(state.mode==='preview'){
    $('powerLabel').textContent='과녁 위치를 확인해요';$('controlTitle').textContent='장애물 너머 과녁을 기억하세요';$('controlHint').textContent='곧 사격 위치로 돌아가요 · 과녁 보기로 다시 확인할 수 있어요';
  }else if(state.mode==='flight'){
    $('powerLabel').textContent='슬로모션으로 날아가요';$('controlTitle').textContent='화살을 따라가고 있어요';$('controlHint').textContent='궤적과 떨어지는 위치를 보고 다음 한 발을 준비해요';
  }else if(state.mode==='settling'){
    $('powerLabel').textContent='다음 한 발을 준비해요';$('controlTitle').textContent='호흡을 가다듬고, 다시 한 발';$('controlHint').textContent='곧 다음 화살을 쏠 수 있어요';
  }else{
    $('powerLabel').textContent=usingGun()?'움직이는 표적의 앞을 겨눠요':'활을 당겨보세요';$('controlTitle').textContent='누른 채 조준 · 손을 떼면 발사';$('controlHint').textContent=state.isEvent?'탄창을 비우면 자동 장전 · 접시와 UFO를 노려요':state.practiceOnly?'저장 없이 연습 중 · 계정 총알 보상 제외':activeBow().burstCount>1?`레어 석궁 · 3연발 · ${steadySeconds}초 안정`:`${steadySeconds}초 안정 기회 · 10초 후 자동발사`;
  }
}
function tick(now){
  const dt=Math.min(.25,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(!document.hidden&&!state.modal&&!state.roundSaving&&!(state.isEvent&&(state.ammoLoading||state.pendingAmmoShot||ammo?.pending||ammoRemaining()===null))){
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
    if(state.isEvent){
      if(state.mode!=='finished'&&!state.pendingAmmoShot&&!state.ammoLoading&&!ammo?.pending)stepEvent(dt,now);
    }else if(state.mode==='preview'){
      state.time+=dt;state.previewElapsed+=dt;
      if(state.previewElapsed>=PREVIEW_RISE+PREVIEW_HOLD+PREVIEW_RETURN){state.mode='ready';state.previewReturnCamera=null;keys.clear();$('flightBadge').classList.add('hidden');}
    }else if(state.mode==='flight'){
      // Targets, wind leaves and the arrow share one slowed simulation clock.
      // Work out this delta AFTER a possible real-time ten-second auto release.
      const flightDt=Math.min(dt,Math.max(0,(now-(state.volley?.startedAt??state.shot.startedAt))/1000))*FLIGHT_TIME_SCALE;
      if(state.volley){
        const volley=state.volley,begin=volley.elapsed,end=begin+flightDt,worldStart=state.time;
        let usedTime=0;
        for(const shot of volley.shots){
          if(!shot.active||shot.launchDelay>end)continue;
          const offset=Math.max(0,shot.launchDelay-begin),duration=flightDt-offset;
          if(duration<=0)continue;
          if(!shot.launched){shot.launched=true;sound('shoot');}
          const before=shot.elapsed,result=stepArrow(shot,duration,state.stage,worldStart+offset);
          const consumed=offset+shot.elapsed-before;usedTime=Math.max(usedTime,consumed);
          if(result)recordImpact(shot,worldStart+consumed);
        }
        const flying=volley.shots.some(shot=>shot.active),elapsed=flying?flightDt:usedTime;
        state.time+=elapsed;volley.elapsed+=elapsed;moveAttachedArrows();
        if(!flying)onImpact();
        else state.shot=volley.shots.find(shot=>shot.launched&&shot.active)||volley.shots.find(shot=>shot.launched)||volley.shots[0];
      }else{
        const before=state.shot.elapsed,result=stepArrow(state.shot,flightDt,state.stage,state.time);
        state.time+=state.shot.elapsed-before;
        if(result)onImpact();
      }
    }else if(state.mode==='settling'){
      state.time+=dt*FLIGHT_TIME_SCALE;
      state.settle+=dt;
      moveAttachedArrows();
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
ammo=createAmmoClient({onChange:onAmmoChange});
save();resetRound(state.stage);requestAnimationFrame(tick);
