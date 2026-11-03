import {PLAYER, BOWS, ARROWS, SCOPES, getScopePrice, STAGES, STAGE_GEAR_BANDS, CLAY_EVENT, createClayEvent, eventTargetsAt, prepareStage, passersAt, retirePasser, clamp, targetAt, applyAnimalHit, getAnimalAttachmentPoint, getSpeed, getArrowMass, getArrowConsistency, getArrowVariance, getArrowDragRate, getWindResponse, sortEquipment, launchArrow, launchVolley, stepArrow, predictTrajectory, createSway, stepSway} from './engine.mjs?v=20261104-archery-passer-retire1';
import {drawScenery, drawAnimal, drawClay, drawUfo, drawObstacle, drawPasser, drawEquipmentIcon, drawFirstPersonBow, drawBullseyeImpact, drawBullseyeVignette} from './scenery.mjs?v=20261104-archery-eagle-dive1';
import {FLIGHT_TIME_SCALE, IMPACT_HOLD, RETURN_DURATION, PREVIEW_RISE, PREVIEW_HOLD, PREVIEW_RETURN, NEAR_PLANE, projectPoint, depthFragments, desiredFollowCamera, desiredPreviewCamera, clearShotCamera, lerpCamera} from './view.mjs?v=20261104-archery-eagle-dive1';
import {createBullseyeCinematic, sampleBullseyeCinematic, desiredBullseyeCamera} from './cinematic.mjs?v=20261104-archery-eagle-dive1';
import {evaluateCoachShot} from './coach.mjs?v=20261104-archery-passer-retire1';
import {createAmmoClient, createRequestId, LAUNCH_EPOCH} from './ammo-client.mjs?v=20261104-archery-eagle-layout1';
import {LASER_PRICE, LASER_CLICK_DEGREES, LASER_MAX_CLICKS, canEquipLaser, normalizeLaserSettings, traceLaserPoint} from './laser.mjs?v=20261104-archery-passer-retire1';

const $ = id => document.getElementById(id);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d', {alpha:false}), touchpad = $('aimTouchpad');
// A trial URL only requests the mode. A live administrator parent must approve
// this iframe before it can create inventory, start play or use any account API.
const adminTrialRequested=/(?:^|[?&])adminTrial=1(?:&|$)/.test(window.location?.search||'');
let adminTrialActive=false,adminTrialIdentity=null,adminTrialTimer=null,adminTrialDenied=false;
const trialBlocked=()=>adminTrialRequested&&!adminTrialActive;
// The single-player launch starts a new journey. Never import test progress,
// equipment or recovery requests, including later writes from an old open tab.
const SAVE_KEY = 'forest-archer-progress-single-v4';
const STAGE_CATALOG = 'missions-220-v1';
const DRAW_LIMIT = 10;
const AIM_SWAY_SCALE = .68;
const MAX_AIM_YAW = .48;
const MIN_AIM_PITCH = -.22;
const MAIN_MAX_PITCH = Math.PI / 3;
const LASER_CLICK_RADIANS = LASER_CLICK_DEGREES * Math.PI / 180;
const STEADY_SETTLE_SECONDS = .6;
const STABILIZER_COST = 5;
const CONSUMABLE_LIMIT = 1e8;
const ANIMAL_NAMES = Object.freeze({rabbit:"토끼",wildcat:"살쾡이",deer:"사슴",pigeon:"비둘기",eagle:"독수리",cheetah:"치타",bird:"새"});
const defaults = () => ({version:1,launchEpoch:LAUNCH_EPOCH,stageCatalog:STAGE_CATALOG,coins:0,clayCredits:0,stabilizers:0,coachEnabled:true,bow:0,arrow:0,eventGun:20,eventBest:0,eventBestByLevel:{},eventPlays:0,mainRounds:0,ownedBows:[0,20],ownedArrows:[0],scopedBows:[],scopeLoadouts:{},laserLoadouts:{},unlocked:1,lastStage:1,best:{},sound:true,shots:0,hits:0});
// Older saves marked every mission as unlocked. Only passing scores establish
// progress; neither a selected mission nor a completed-but-failed round does.
function unlockedStage(best){
  let next=1;
  while(next<STAGES.length&&Number.isFinite(best[next])&&best[next]>=STAGES[next-1].goal)next++;
  return next;
}
function stageCleared(id,saved=progress){
  return Number.isInteger(id)&&id>=1&&id<=STAGES.length&&Number.isFinite(saved.best[id])&&saved.best[id]>=STAGES[id-1].goal;
}
function stageAvailable(id,saved=progress){
  // Keep genuine older clears replayable without opening the gaps before them
  // or the next uncleared mission beyond the sequential frontier. Only the
  // approved temporary admin trial can visit every valid mission freely.
  return Number.isInteger(id)&&id>=1&&id<=STAGES.length&&(adminTrialActive||id<=saved.unlocked||stageCleared(id,saved));
}
// Only these weapons could own a paid scope before magnification choices existed.
const LEGACY_SCOPE_IDS=new Set([3,7,8,9,10,11,12,13,14,15,16,17,18,19,22,23,24]);
function loadScopeLoadouts(raw,ownedBows){
  const loadouts={},allowed=(id,zoom)=>ownedBows.includes(id)&&getScopePrice(id,zoom)!==null;
  if(!Object.hasOwn(raw,'scopeLoadouts')){
    // Do not use the inventory helper: it inserts the starter weapon for free.
    for(const id of new Set(Array.isArray(raw.scopedBows)?raw.scopedBows:[]))
      if(Number.isInteger(id)&&LEGACY_SCOPE_IDS.has(id)&&allowed(id,3))loadouts[id]={owned:[3],equipped:3};
    return loadouts;
  }
  const saved=raw.scopeLoadouts;
  if(!saved||typeof saved!=='object'||Array.isArray(saved))return loadouts;
  for(const [key,entry] of Object.entries(saved)){
    const id=Number(key);
    if(!Number.isInteger(id)||String(id)!==key||!ownedBows.includes(id)||!entry||typeof entry!=='object'||Array.isArray(entry)||!Array.isArray(entry.owned))continue;
    const owned=[...new Set(entry.owned.filter(zoom=>Number.isInteger(zoom)&&allowed(id,zoom)))].sort((a,b)=>a-b);
    if(owned.length)loadouts[id]={owned,equipped:owned.includes(entry.equipped)?entry.equipped:owned.at(-1)};
  }
  return loadouts;
}
function loadLaserLoadouts(saved,ownedBows){
  const loadouts={};
  if(!saved||typeof saved!=='object'||Array.isArray(saved))return loadouts;
  for(const [key,entry] of Object.entries(saved)){
    const id=Number(key),item=BOWS.find(weapon=>weapon.id===id);
    if(!Number.isInteger(id)||String(id)!==key||!ownedBows.includes(id)||!canEquipLaser(item)||!entry||typeof entry!=='object'||Array.isArray(entry))continue;
    loadouts[id]=normalizeLaserSettings(entry);
  }
  return loadouts;
}
let persistence = true, pendingBowLaserRefund = 0;
function bowLaserRefund(raw){
  if(!Array.isArray(raw.ownedBows)||!raw.laserLoadouts||typeof raw.laserLoadouts!=='object'||Array.isArray(raw.laserLoadouts))return 0;
  return Object.entries(raw.laserLoadouts).reduce((total,[key,entry])=>{
    const id=Number(key),item=BOWS.find(weapon=>weapon.id===id);
    // Refund only records that the previous loader accepted for an owned bow.
    // Do not infer a purchase from the starter weapon added by normalization.
    return total+(String(id)===key&&Number.isInteger(id)&&item?.weaponType==='bow'&&raw.ownedBows.includes(id)&&entry&&typeof entry==='object'&&!Array.isArray(entry)?LASER_PRICE:0);
  },0);
}
function removeTestSaves(){
  const keys=new Set([1,2,3,4].map(version=>`forest-archer-progress-v${version}`));
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(/^forest-archer-ammo-(?:pending|recovery)-v[123]:/.test(key||''))keys.add(key);
    }
  }catch{}
  for(const key of keys){try{localStorage.removeItem(key);}catch{}}
}
function loadProgress(){
  removeTestSaves();
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if(!raw || raw.version!==1 || raw.launchEpoch!==LAUNCH_EPOCH || raw.stageCatalog!==STAGE_CATALOG) return defaults();
    const base=defaults(), finite=(v,f=0)=>Number.isFinite(v)?v:f;
    const ids=(arr,catalog)=>[...new Set([0,...(Array.isArray(arr)?arr:[]).filter(x=>Number.isInteger(x)&&catalog.some(item=>item.id===x))])];
    base.coins=clamp(Math.floor(finite(raw.coins)),0,1e8);
    base.clayCredits=clamp(Math.floor(finite(raw.clayCredits)),0,CONSUMABLE_LIMIT);
    base.stabilizers=clamp(Math.floor(finite(raw.stabilizers)),0,CONSUMABLE_LIMIT);
    base.coachEnabled=raw.coachEnabled!==false;
    base.ownedBows=[...new Set([...ids(raw.ownedBows,BOWS),20])];base.ownedArrows=ids(raw.ownedArrows,ARROWS);
    base.scopeLoadouts=loadScopeLoadouts(raw,base.ownedBows);
    base.scopedBows=Object.keys(base.scopeLoadouts).map(Number);
    base.laserLoadouts=loadLaserLoadouts(raw.laserLoadouts,base.ownedBows);
    base.bow=base.ownedBows.includes(raw.bow)&&BOWS[raw.bow]?.weaponType!=='gun'?raw.bow:0;base.arrow=base.ownedArrows.includes(raw.arrow)?raw.arrow:0;
    base.eventGun=base.ownedBows.includes(raw.eventGun)&&BOWS[raw.eventGun]?.weaponType==='gun'?raw.eventGun:20;
    base.eventBest=clamp(Math.floor(finite(raw.eventBest)),0,300);base.eventPlays=Math.max(0,Math.floor(finite(raw.eventPlays)));
    base.mainRounds=clamp(Math.floor(finite(raw.mainRounds)),0,1e7);
    for(let level=1;level<=10;level++)if(Number.isFinite(raw.eventBestByLevel?.[level]))base.eventBestByLevel[level]=clamp(Math.floor(raw.eventBestByLevel[level]),0,createClayEvent(level).maxScore);
    for(const [key,score] of Object.entries(raw.best||{})){
      const id=Number(key);
      if(Number.isInteger(id)&&id>=1&&id<=STAGES.length&&Number.isFinite(score))
        base.best[id]=clamp(Math.floor(score),0,150);
    }
    base.unlocked=unlockedStage(base.best);
    const lastStage=clamp(Math.floor(finite(raw.lastStage,1)),1,STAGES.length);
    base.lastStage=stageAvailable(lastStage,base)?lastStage:base.unlocked;
    base.shots=Math.max(0,finite(raw.shots));base.hits=Math.max(0,finite(raw.hits));
    base.sound=raw.sound!==false;
    pendingBowLaserRefund=bowLaserRefund(raw);
    return base;
  }catch{persistence=false;return defaults();}
}
let progress=adminTrialRequested?defaults():loadProgress();
function save(){
  if(adminTrialRequested){$('saveStatus').textContent=adminTrialActive?'관리자 체험 · 기록 저장 안 함':'관리자 체험 권한을 확인하고 있어요';return adminTrialActive;}
  try{
    // The credit and removal of the old bow records commit together. Keep the
    // pending credit on a failed write, so a retry cannot lose or repeat it.
    const next=pendingBowLaserRefund?{...progress,coins:clamp(progress.coins+pendingBowLaserRefund,0,1e8)}:progress;
    localStorage.setItem(SAVE_KEY,JSON.stringify(next));
    if(pendingBowLaserRefund){progress.coins=next.coins;pendingBowLaserRefund=0;$('coinCount').textContent=formatCoins(progress.coins);}
    persistence=true;
  }catch{persistence=false;}
  $('saveStatus').textContent=persistence?'진행 상황은 이 기기에 자동 저장됩니다':'저장할 수 없어요 · 현재 플레이는 계속할 수 있어요';
  $('saveFooter').classList.toggle('visually-hidden',persistence);
  $('saveFooter').classList.toggle('save-error',!persistence);
  return persistence;
}
const state={stage:STAGES[progress.lastStage-1],time:0,score:0,used:0,hits:0,arrowHits:0,earned:0,shotScores:[],shotMaxScores:[],targetMarks:[],stuck:[],effects:[],mode:'ready',held:0,drawStarted:0,steadyStart:1,steadyDuration:.5,steadyActive:false,stabilizerActive:false,stabilizerNotice:'',charge:0,velocityBias:0,burstSeed:0,aim:{yaw:0,pitch:0},sway:createSway(),shot:null,settle:0,zoom:1,panX:0,panY:0,modal:null,lastFocus:null,feedbackUntil:0,guide:null,guideAt:0};
state.cinematic=null;
state.laserStep=1;
state.laserAdjustOpen=false;
state.coachSaid=false;state.coachReady=false;state.coachLastCueAt=-Infinity;state.coachCueUntil=0;state.coachLastCheck=-Infinity;
let w=1,h=1,dpr=1,camera={},pointer=null,lastFrame=performance.now(),audio=null,toastTimer=0,drawTimer=0,keys=new Set();
let laserDial=null;
const laserGearAngles={horizontalClicks:0,verticalClicks:0};
let ammo=null,roundRegistration=Promise.resolve();
const resultUUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
let resultBridge=null,finishedMainRound=null;
function reportFinishedMainRound(){
  if(adminTrialRequested||!resultBridge||!finishedMainRound||finishedMainRound.sent||window.parent===window)return;
  try{
    window.parent.postMessage({source:'ojjuda-archery-game',type:'round-finished',kind:'main',
      owner:resultBridge.owner,sessionId:resultBridge.sessionId,runId:finishedMainRound.runId,stage:finishedMainRound.stage},window.location.origin);
    finishedMainRound.sent=true;
  }catch{}
}
window.addEventListener('message',event=>{
  if(window.parent===window||event.source!==window.parent||event.origin!==window.location.origin)return;
  const message=event.data;
  if(message?.source!=='ojjuda-archery-world'||message.type!=='init'||message.launchEpoch!==LAUNCH_EPOCH||!resultUUID.test(message.sessionId||''))return;
  if(message.owner!==null&&(typeof message.owner!=='string'||!message.owner))return;
  if(adminTrialRequested){
    if(adminTrialDenied)return;
    if(message.adminTrial!==true||typeof message.owner!=='string'||!message.owner.trim()){
      denyAdminTrial('관리자 전용 체험이에요.','오락실에서 관리자 계정으로 로그인한 뒤 아이템 체험을 열어 주세요.');return;
    }
    if(adminTrialIdentity){
      if(message.owner!==adminTrialIdentity.owner||message.sessionId!==adminTrialIdentity.sessionId)denyAdminTrial('체험 연결이 바뀌었어요.','게임 목록으로 돌아가 관리자 체험을 다시 열어 주세요.');
      return;
    }
    startAdminTrial(message);return;
  }
  if(message.adminTrial===true)return;
  // Keep completion tied to this iframe's first account/session handshake.
  // A late finish must not consume the trial of a different signed-in owner.
  if(!resultBridge)resultBridge={owner:message.owner,sessionId:message.sessionId};
  reportFinishedMainRound();
});
const ammoRemaining=()=>Number.isInteger(ammo?.snapshot?.remaining)?ammo.snapshot.remaining:null;
const ammoStockLabel=()=>adminTrialActive?'무제한':`${ammoRemaining()??'—'}발`;
const ammoOffer=()=>Number.isSafeInteger(ammo?.snapshot?.pack_ammo)&&ammo.snapshot.pack_ammo>0&&Number.isSafeInteger(ammo?.snapshot?.pack_price)&&ammo.snapshot.pack_price>0?{amount:ammo.snapshot.pack_ammo,price:ammo.snapshot.pack_price}:null;
async function refreshAmmoStatus(){
  if(!ammo||ammo.pending||state.ammoRefreshing)return;
  state.ammoRefreshing=true;
  try{await ammo.refresh();}finally{state.ammoRefreshing=false;onAmmoChange();}
}
const ammoLocked=()=>!!state.pendingAmmoShot||!!state.roundSaving||!!ammo?.pending;
const preparingMainRound=()=>!state.isEvent&&!state.practiceOnly&&!state.serverRunId&&ammo?.connection!=='unavailable'&&state.mode!=='finished';
function guardAmmoAction(){
  if(trialBlocked())return true;
  if(!ammoLocked())return false;
  toast(state.roundSaving?'완료한 판을 저장하고 있어요.':state.pendingAmmoShot?'이번 발사 확인을 마친 뒤 이동할 수 있어요.':'이전 처리 결과를 먼저 확인해 주세요. 총알 충전에서 다시 확인할 수 있어요.');return true;
}
function ammoError(result){
  const messages={progress_reset:'이전 테스트 기록은 초기화됐어요. 새 판에서 시작해 주세요.',update_required:'게임이 새로 시작됐어요. 오락실을 새로고침해 주세요.',ammo_empty:'남은 총알이 없어요. 총알을 충전해 주세요.',coins:'쭈가 부족해요. 지갑을 확인해 주세요.',limit:'총알 보유 한도에 도달했어요.',round_too_soon:'완료 시간을 확인하지 못했어요. 사격장을 다시 시작해 주세요.',sign_in:'로그인한 오락실에서 총알을 사용할 수 있어요.',wallet_unavailable:'계정 연결을 확인해 주세요.',unavailable:'계정 연결을 확인해 주세요.',insufficient_funds:'쭈가 부족해요. 지갑을 확인해 주세요.',insufficient_coins:'쭈가 부족해요. 지갑을 확인해 주세요.',insufficient_ammo:'남은 총알이 없어요. 총알을 충전해 주세요.',no_ammo:'남은 총알이 없어요. 총알을 충전해 주세요.',pending:'처리 결과를 확인하고 있어요. 다시 확인을 눌러 주세요.',network:'연결을 확인한 뒤 다시 눌러 주세요.',banned:'이 계정에서는 현재 구매할 수 없어요.',request_conflict:'이전 요청 결과를 먼저 확인해 주세요.',recovered_spend:'현재 잔량을 확인했어요. 이전 발사를 다시 실행하지 않아요.',storage_unavailable:'브라우저 저장을 허용한 뒤 다시 확인해 주세요.'};
  return messages[result?.reason]||'처리를 확인하지 못했어요. 다시 확인해 주세요.';
}
function updateAmmoPanel(){
  const remaining=ammoRemaining(),known=remaining!==null,pending=!!state.pendingAmmoShot,busy=!!state.ammoBusy;
  const recovery=ammo?.pending&&(ammo.pending.status!=='waiting'||ammo.pending.recovered),registrationFailed=preparingMainRound()&&!state.registering;
  $('ammoPanel').classList.toggle('hidden',!state.isEvent&&!recovery&&!state.awaitingRoundSave&&!registrationFailed);
  $('ammoRemaining').textContent=adminTrialActive?'∞':known?remaining.toLocaleString('ko-KR'):'—';
  $('ammoShopBtn').disabled=!!state.pendingAmmoShot||!!state.roundSaving;
  $('ammoShopBtn').textContent=adminTrialActive?'체험 총알 안내':'총알 충전';
  if(adminTrialActive){
    $('ammoStatus').textContent='체험 총알 무제한 · 탄창과 장전 시간은 실제 장비와 같아요.';
    $('ammoRetryBtn').classList.add('hidden');return;
  }
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
  if(state.modal==='event-ready')renderEventReady();
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
function activeLaser(id=activeBow().id){
  const item=BOWS.find(weapon=>weapon.id===id),settings=progress.laserLoadouts[id];
  return !trialBlocked()&&canEquipLaser(item)&&progress.ownedBows.includes(id)&&settings?normalizeLaserSettings(settings):null;
}
const laserEnabled=()=>!state.isEvent&&activeLaser()?.enabled===true;
function sightAngles(aim=state.aim){
  const settings=laserEnabled()?activeLaser():null;
  return {yaw:aim.yaw-(settings?.horizontalClicks||0)*LASER_CLICK_RADIANS,
    pitch:aim.pitch-(settings?.verticalClicks||0)*LASER_CLICK_RADIANS};
}
function viewAimAngles(){
  const sight=sightAngles();
  // An extreme manual zero can point behind the player. Until it faces the
  // range again, keep input and explicit zoom on the forward weapon axis.
  return Math.cos(sight.yaw)*Math.cos(sight.pitch)>1e-8?sight:{...state.aim};
}
function centerSightAngles(){
  const {cx,horizon,focal}=camera;
  if(!(focal>0)||![cx,horizon,w,h].every(Number.isFinite))return null;
  const yaw=Math.atan2(w/2-cx,focal);
  return {yaw,pitch:Math.atan((horizon-h/2)/focal*Math.cos(yaw))};
}
const laserControlsReady=()=>!trialBlocked()&&!document.hidden&&!state.modal&&!state.isEvent&&state.mode==='ready'&&!ammoLocked()&&!!activeLaser();
function laserFrame(now=performance.now()){
  // Keep the same physical sight visible before drawing, so its current zero
  // can be judged on the target while the calibration controls are available.
  if(!laserEnabled()||document.hidden||state.modal||(state.mode!=='drawing'&&!laserControlsReady()))return null;
  return traceLaserPoint({...shotParams(now),settings:activeLaser(),distance:state.stage.distance,obstacles:state.stage.obstacles,people:passersAt(state.stage,state.time)});
}
function setLaserSettings(patch,id=activeBow().id){
  if(!laserControlsReady()||id!==activeBow().id||!patch||typeof patch!=='object'||Array.isArray(patch))return false;
  const before=progress.laserLoadouts,settings=normalizeLaserSettings({...activeLaser(),...patch});
  progress.laserLoadouts={...before,[id]:settings};
  if(!save()){progress.laserLoadouts=before;toast('레이저 보정값을 저장하지 못했어요. 브라우저 저장을 확인해 주세요.');return false;}
  if(laserEnabled())suspendLaserCoach();
  updateLaserPanel();hudMode='';updatePower();render();return true;
}
function adjustLaser(axis,detents,rotate=true){
  if(!laserControlsReady()||!['horizontalClicks','verticalClicks'].includes(axis)||!Number.isInteger(detents))return false;
  if(!setLaserSettings({[axis]:activeLaser()[axis]+detents*state.laserStep}))return false;
  if(rotate){laserGearAngles[axis]+=detents*15;updateLaserPanel();}
  return true;
}
function toggleLaser(){return laserControlsReady()&&setLaserSettings({enabled:!activeLaser().enabled});}
function resetLaser(){
  if(!setLaserSettings({horizontalClicks:0,verticalClicks:0}))return false;
  laserGearAngles.horizontalClicks=0;laserGearAngles.verticalClicks=0;updateLaserPanel();return true;
}
function setLaserStep(step){
  if(!laserControlsReady()||![1,10].includes(step))return false;
  clearLaserDial();state.laserStep=step;updateLaserPanel();return true;
}
function openLaserAdjustments(){
  if(!laserControlsReady())return false;
  state.laserAdjustOpen=true;updateLaserPanel();positionLaserAdjustments();$('laserHorizontalGear').focus({preventScroll:true});return true;
}
function positionLaserAdjustments(){
  if(!state.laserAdjustOpen)return;
  clearLaserDial();
  const popup=$('laserPopover');
  for(const edge of ['top','right','bottom','left'])popup.style[edge]='';
  const ray=traceLaserPoint({...shotParams(),settings:activeLaser(),distance:state.stage.distance,obstacles:state.stage.obstacles,people:passersAt(state.stage,state.time)});
  if(!ray)return;
  const point=project(ray.point),field=canvas.getBoundingClientRect(),box=popup.getBoundingClientRect();
  const x=field.left+point.x,y=field.top+point.y,margin=14;
  if(!point.visible||x<box.left-margin||x>box.left+box.width+margin||y<box.top-margin||y>box.top+box.height+margin)return;
  // Place the controls away from the sight when opened or resized. Never move
  // them during a gear gesture, which would shift the dial under the finger.
  if((window.innerWidth||w)>(window.innerHeight||h)){
    popup.style.right='auto';popup.style.left='8px';
  }else{
    popup.style.top='auto';popup.style.bottom='8px';
  }
}
function closeLaserAdjustments(restoreFocus=false){
  const wasOpen=state.laserAdjustOpen;
  state.laserAdjustOpen=false;clearLaserDial();updateLaserPanel();
  if(wasOpen&&restoreFocus)$('laserAdjustBtn').focus({preventScroll:true});
  return wasOpen;
}
function updateLaserNumber(prefix,value){
  const display=$(`${prefix}Value`),degrees=value*LASER_CLICK_DEGREES;
  if(display.dataset.value===String(value))return;
  const digits=String(Math.round(Math.abs(degrees)*100)).padStart(4,'0');
  display.dataset.value=String(value);display.dataset.degrees=degrees.toFixed(2);
  display.setAttribute('aria-label',`${value<0?'−':'+'}${Math.abs(degrees).toFixed(2)}도 보정`);
  $(`${prefix}Sign`).textContent=value<0?'−':'+';
  for(let index=0;index<4;index++)$(`${prefix}Digit${index}`).style.transform=`translateY(-${Number(digits[index])*10}%)`;
}
function updateLaunchAngle(now=performance.now()){
  const hud=$('launchAngleHud');
  const visible=!trialBlocked()&&!state.isEvent&&(state.mode==='ready'||state.mode==='drawing');
  hud.hidden=!visible;hud.classList.toggle('hidden',!visible);
  if(!visible)return;
  // Read the same elevation that launchVolley receives, including the current
  // hand movement. This is independent of both target distance and sight zero.
  const degrees=Number((shotParams(now).pitch*180/Math.PI).toFixed(2)).toFixed(2);
  for(const id of ['launchAngleValue','laserLaunchAngleValue']){
    const value=$(id);if(value.dataset.degrees===degrees)continue;
    value.dataset.degrees=degrees;value.textContent=`${degrees}°`;
  }
}
function updateLaserPanel(){
  const settings=!state.isEvent?activeLaser():null,visible=!!settings,ready=visible&&laserControlsReady();
  $('laserPanel').classList.toggle('hidden',!visible);$('laserPanel').dataset.locked=ready?'false':'true';
  if(!ready){clearLaserDial();state.laserAdjustOpen=false;}
  const open=ready&&state.laserAdjustOpen;
  $('laserPopover').hidden=!open;$('laserPopover').classList.toggle('hidden',!open);
  $('laserAdjustBtn').setAttribute('aria-expanded',String(open));
  for(const id of ['laserToggleBtn','laserAdjustBtn'])$(id).disabled=!ready;
  for(const id of ['laserStep1Btn','laserStep10Btn','laserResetBtn','laserHorizontalGear','laserVerticalGear'])$(id).disabled=!open;
  if(!visible)return;
  $('laserWeaponLabel').textContent=activeBow().name;
  $('laserToggleBtn').textContent=settings.enabled?'레이저 ON':'레이저 OFF';$('laserToggleBtn').setAttribute('aria-pressed',String(settings.enabled));
  const status=!ready?(state.mode==='drawing'?'영점 조절 잠김 · 빨간 점으로 겨누고 손을 놓으면 발사해요.':'영점 조절 잠김 · 다음 조준 전에 바꿀 수 있어요.'):settings.enabled?'빨간 점을 보며 톱니로 영점을 조절하세요.':'레이저를 켜면 보정한 빨간 점으로 조준할 수 있어요.';
  if($('laserStatus').textContent!==status)$('laserStatus').textContent=status;
  for(const step of [1,10]){$(`laserStep${step}Btn`).classList.toggle('active',state.laserStep===step);$(`laserStep${step}Btn`).setAttribute('aria-pressed',String(state.laserStep===step));}
  for(const [axis,prefix,label] of [['horizontalClicks','laserHorizontal','좌우'],['verticalClicks','laserVertical','상하']]){
    const gear=$(`${prefix}Gear`),value=settings[axis],degrees=value*LASER_CLICK_DEGREES;
    gear.setAttribute('aria-valuemin',String(-LASER_MAX_CLICKS*LASER_CLICK_DEGREES));gear.setAttribute('aria-valuemax',String(LASER_MAX_CLICKS*LASER_CLICK_DEGREES));
    gear.setAttribute('aria-valuenow',String(Number(degrees.toFixed(2))));gear.setAttribute('aria-valuetext',`${label} 보정 ${value<0?'−':'+'}${Math.abs(degrees).toFixed(2)}도`);
    $(`${prefix}Rotor`).style.transform=`rotate(${laserGearAngles[axis]}deg)`;updateLaserNumber(prefix,value);
  }
}
function clearLaserDial(){
  const held=laserDial;laserDial=null;
  if(held){held.element.classList.remove('is-turning');try{held.element.releasePointerCapture(held.id);}catch{}}
}
const weaponSteadyDuration=(item=activeBow())=>clamp(Number.isFinite(item.steadyDuration)?item.steadyDuration:.5,.5,2);
const formatSeconds=value=>String(Number(value.toFixed(2)));
const activeProjectile=()=>usingGun()?{...activeBow().ammo,id:activeBow().id,name:activeBow().ammo?.name||'전용 탄환',color:'#c3b477'}:activeArrow();
const equippedScope=(id=activeBow().id)=>{
  const loadout=progress.scopeLoadouts[id],zoom=loadout?.equipped;
  return progress.ownedBows.includes(id)&&Array.isArray(loadout?.owned)&&loadout.owned.includes(zoom)&&getScopePrice(id,zoom)!==null?zoom:1;
};
const hasScope=(id=activeBow().id)=>equippedScope(id)>1;
const maximumZoom=()=>equippedScope();
function setAimZoom(value){
  if(value!==1&&value!==maximumZoom())return false;
  const next=value,delta=Math.min(w*1.08,h*1.5)*(next-state.zoom);
  let sight=viewAimAngles(),centeredZoom=false;
  if(laserEnabled()){
    const ray=sightAngles(),x=camera.cx+Math.tan(ray.yaw)*camera.focal;
    const y=camera.horizon-Math.tan(ray.pitch)/Math.cos(ray.yaw)*camera.focal;
    // An invisible zeroed sight must not pull the view far away during zoom.
    // Keep the current viewport center as the anchor until the next hold.
    if(!(Math.cos(ray.yaw)*Math.cos(ray.pitch)>1e-8&&x>=0&&x<=w&&y>=0&&y<=h)){
      const center=centerSightAngles();
      if(center){sight=center;centeredZoom=true;}
    }
  }
  // Explicit zoom keeps the visible sight in place, even when the weapon is
  // raised well above a manually zeroed laser. It never changes the launch.
  state.panX-=Math.tan(sight.yaw)*delta;
  state.panY+=Math.tan(sight.pitch)/Math.cos(sight.yaw)*delta;
  state.zoom=next;state.guide=null;updateCamera(0,true);
  if(state.mode==='ready'||state.mode==='drawing')clampAim(!centeredZoom);
  return true;
}
function updateZoomControl(){
  const zoom=maximumZoom();
  if(state.zoom!==1&&state.zoom!==zoom)setAimZoom(zoom);
  $('zoomBtn').textContent=state.zoom>1?`조준경 ${state.zoom}×`:'1×';
  $('zoomBtn').disabled=zoom===1;
  $('zoomBtn').setAttribute('aria-label',zoom===1?'조준경을 장착하면 확대할 수 있어요':state.zoom===zoom?'원래 크기로':`조준경 ${zoom}배 확대`);
}
const shotLimit=()=>state.stage.shots;
const shotUnit=()=>activeBow().burstCount>1?'회':'발';
// Record each actual launch, so changing weapons later cannot change the
// completed round's denominator. Historical hit counters keep counting triggers.
const roundMaxScore=()=>state.shotMaxScores.reduce((sum,score)=>sum+score,0)||shotLimit()*10;
const drawElapsed=(now=performance.now())=>Math.max(0,(now-state.drawStarted)/1000);
const isSteady=(now=performance.now())=>state.mode==='drawing'&&drawElapsed(now)>=state.steadyStart&&drawElapsed(now)<state.steadyStart+state.steadyDuration;
const effectiveSway=(now=performance.now())=>{
  let settlingScale=1;
  const elapsed=drawElapsed(now);
  if(state.mode==='drawing'&&elapsed<state.steadyStart+state.steadyDuration){
    // Ease into the full still interval without snapping the reticle to center.
    // The underlying sway keeps moving, so its full motion returns at expiry.
    const remaining=clamp((state.steadyStart-elapsed)/STEADY_SETTLE_SECONDS,0,1);
    settlingScale=remaining*remaining*(3-2*remaining);
  }
  if(settlingScale===0)return {x:0,y:0};
  const scale=AIM_SWAY_SCALE*(state.stabilizerActive ? .5 : 1)*settlingScale;
  return {x:state.sway.x*scale,y:state.sway.y*scale};
};
const aimAngles=(now=performance.now())=>{const sway=effectiveSway(now);return {yaw:state.aim.yaw+sway.x,pitch:state.aim.pitch+sway.y};};
function shotParams(now=performance.now()){return {...aimAngles(now),charge:state.charge,bow:activeBow(),arrow:activeArrow(),velocityBias:state.velocityBias,burstSeed:state.burstSeed};}
function syncDraw(now=performance.now()){
  state.held=Math.min(DRAW_LIMIT,drawElapsed(now));state.charge=usingGun()?1:clamp(state.held/1.25,0,1);
  const steady=isSteady(now);if(steady!==state.steadyActive)state.guide=null;state.steadyActive=steady;
}
function stopCoachVoice(){try{window.speechSynthesis?.cancel();}catch{}}
function suspendLaserCoach(){
  stopCoachVoice();state.coachReady=false;state.coachSaid=false;state.coachCueUntil=0;state.coachWindowAnnounced=false;
  state.coachLastCheck=-Infinity;state.coachLastCueAt=-Infinity;setCoachCue(false);
}
function setCoachCue(visible){
  const cue=$('coachCue');
  if(!cue)return;
  visible=visible&&!laserEnabled();cue.classList.toggle('hidden',!visible);cue.classList.toggle('is-ready',visible);
  cue.setAttribute('aria-hidden',visible?'false':'true');
}
function announceCoach(){
  if(!progress.sound||laserEnabled())return;
  const synth=window.speechSynthesis,Utterance=window.SpeechSynthesisUtterance;
  if(synth&&Utterance){
    try{
      const cue=new Utterance('쏴!');cue.lang='ko-KR';cue.rate=1.15;cue.pitch=1;cue.volume=.85;
      const voice=synth.getVoices?.().find(voice=>/^ko(?:-|_)/i.test(voice.lang));if(voice)cue.voice=voice;
      cue.onerror=()=>{if(progress.sound&&progress.coachEnabled&&!state.isEvent&&!laserEnabled()&&state.mode==='drawing'&&state.coachReady)sound('coach');};
      synth.cancel();synth.speak(cue);return;
    }catch{}
  }
  sound('coach');
}
function updateCoach(now){
  if(laserEnabled()){
    if(state.coachReady||state.coachSaid||state.coachCueUntil)suspendLaserCoach();
    state.coachLastCheck=-Infinity;return;
  }
  if(state.mode!=='drawing'||state.isEvent||!progress.coachEnabled){state.coachReady=false;state.coachCueUntil=0;return;}
  if(now-state.coachLastCheck<62.5)return;
  state.coachLastCheck=now;
  const result=evaluateCoachShot(shotParams(now),state.stage,state.time,{held:drawElapsed(now),steadyStart:state.steadyStart,steadyDuration:state.steadyDuration});
  const wasReady=state.coachReady;state.coachReady=result.ready;
  if(!result.ready||!wasReady)state.coachWindowAnnounced=false;
  state.coachCueUntil=result.ready?now+150:0;
  if(result.ready&&((!state.coachWindowAnnounced&&now-state.coachLastCueAt>=450)||now-state.coachLastCueAt>=1400)){
    state.coachSaid=true;state.coachWindowAnnounced=true;state.coachLastCueAt=now;announceCoach();
  }
}
function clearDrawTimer(){clearTimeout(drawTimer);drawTimer=0;}
function clearPointer(){
  const heldPointer=pointer;pointer=null;
  touchpad.dataset.active='false';
  if(heldPointer){try{heldPointer.el.releasePointerCapture(heldPointer.id);}catch{}}
}
function scheduleAutoRelease(){
  clearDrawTimer();
  if(laserEnabled())return;
  drawTimer=setTimeout(()=>{
    drawTimer=0;if(state.mode!=='drawing'||laserEnabled())return;
    if(document.hidden||state.modal){cancelDraw();return;}
    if(drawElapsed()<DRAW_LIMIT){scheduleAutoRelease();return;}
    releaseShot(true);
  },Math.max(0,state.drawStarted+DRAW_LIMIT*1000-performance.now()));
}
function recenter(){
  const t=targetAt(state.stage,state.time),settings=laserEnabled()?activeLaser():null;
  // Center the chosen sight with its saved manual zero. No range, weapon or
  // trajectory calculation supplies a new correction on the player's behalf.
  state.aim.yaw=(settings?.horizontalClicks||0)*LASER_CLICK_RADIANS;
  state.aim.pitch=Math.atan2(t.y-PLAYER.y,state.stage.distance)+(settings?.verticalClicks||0)*LASER_CLICK_RADIANS;
  clampAim(false);
  const sight=viewAimAngles();
  state.panX=0;state.panY=(state.zoom-1)*Math.min(w*1.08,h*1.5)*Math.tan(sight.pitch)/Math.cos(sight.yaw);
  if(camera.focal){camera=aimCamera();if(state.mode==='ready'||state.mode==='drawing')clampAim();}
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
function cinematicFrame(){
  if(!state.cinematic||state.mode!=='settling')return null;
  const frame=sampleBullseyeCinematic(state.cinematic,state.settle);
  if(frame.phase==='done')return null;
  if(frame.phase==='return'){const t=frame.progress;frame.time+=(state.time-frame.time)*t*t*(3-2*t);}
  return frame;
}
const renderTime=()=>cinematicFrame()?.time??state.time;
const impactHold=()=>state.cinematic?state.cinematic.flightDuration+state.cinematic.holdDuration:IMPACT_HOLD;
const impactReturn=()=>state.cinematic?.returnDuration??RETURN_DURATION;
function rememberFlight(shot,time){
  if(shot.projectileType!=='arrow')return;
  const frames=shot.replayFrames??=[];
  const frame={point:{...shot.position},velocity:{...shot.velocity},time};
  if(frames.length&&Math.abs(frames.at(-1).time-time)<1e-10)frames[frames.length-1]=frame;else frames.push(frame);
  if(frames.length>240)frames.shift();
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
  const replay=cinematicFrame();
  if(replay&&!state.cinematic.reducedMotion){
    const target=targetAt(state.stage,replay.time,state.cinematic.shot.attachment?.passId);
    const close=desiredBullseyeCamera({...replay,targetCenter:target},base,{w,h});
    const replayShot={position:replay.point,velocity:replay.velocity,shaftLength:replay.shaftLength};
    if(immediate)state.cinematic.entryCamera=desiredFollowCamera(state.shot.position,base,{w,h});
    const ease=value=>value*value*(3-2*value);
    if(replay.phase==='return'){
      // Return from the wall-clearing view actually shown at impact, so the
      // first return frame cannot jump back behind an occluding wall.
      if(immediate||!state.returnCamera)state.returnCamera=immediate?clearShotCamera(close,state.stage,replayShot,{w,h}):{...camera};
      camera=lerpCamera(state.returnCamera,base,ease(replay.progress));
    }
    else{
      const enter=clamp(state.settle/state.cinematic.entryDuration,0,1);
      camera=lerpCamera(state.cinematic.entryCamera||camera,close,ease(enter));
      // Entry starts from the prior live follow view, but the replay shaft must
      // stay in front of the near plane while that short transition completes.
      const speed=Math.hypot(replay.velocity.x,replay.velocity.y,replay.velocity.z)||1;
      const tailZ=replay.point.z-replay.velocity.z/speed*replay.shaftLength;
      camera.z=Math.min(camera.z,tailZ-NEAR_PLANE-.25);
      camera=clearShotCamera(camera,state.stage,replayShot,{w,h});
    }
    return;
  }
  const follow=desiredFollowCamera(state.shot.position,base,{w,h});
  if(state.mode==='settling'&&state.settle>impactHold()){
    if(immediate||!state.returnCamera)state.returnCamera=immediate?(state.shot.result?.type==='hit'?clearShotCamera(follow,state.stage,state.shot,{w,h}):follow):{...camera};
    const t=clamp((state.settle-impactHold())/impactReturn(),0,1);
    camera=lerpCamera(state.returnCamera,base,t*t*(3-2*t));
  }else{
    camera=immediate?follow:lerpCamera(camera,follow,1-Math.exp(-9*dt));
    if(!state.shot.result||state.shot.result.type==='hit')camera=clearShotCamera(camera,state.stage,state.shot,{w,h});
  }
}
function resize(){
  const r=canvas.getBoundingClientRect(),width=Math.max(1,r.width),height=Math.max(1,r.height);
  if(pointer&&(width!==w||height!==h))cancelDraw();
  w=width;h=height;dpr=Math.min(2,devicePixelRatio||1);
  canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
  updateCamera(0,true);
  if(state.mode==='ready'||state.mode==='drawing')clampAim();
  if(state.laserAdjustOpen)positionLaserAdjustments();
  ctx.setTransform(dpr,0,0,dpr,0,0);state.guide=null;
}
function project(p){
  return projectPoint(p,camera);
}
function screenAim(){const a=aimAngles();return {x:camera.cx+Math.tan(a.yaw)*camera.focal,y:camera.horizon-Math.tan(a.pitch)/Math.cos(a.yaw)*camera.focal};}
function aimBounds(){
  const left=Math.min(42,w*.12),top=Math.min(58,h*.2);
  return {left,right:w-left,top,bottom:Math.max(top+1,h*2/3-Math.min(14,h*.06))};
}
function clampAim(pan=true){
  state.aim.yaw=clamp(state.aim.yaw,-MAX_AIM_YAW,MAX_AIM_YAW);state.aim.pitch=clamp(state.aim.pitch,MIN_AIM_PITCH,state.isEvent ? .58 : MAIN_MAX_PITCH);
  if(!pan)return;
  const sight=viewAimAngles(),x=camera.cx+Math.tan(sight.yaw)*camera.focal,bounds=aimBounds();
  // Keep horizontal tracking smooth at the edges. Elevation changes only the
  // firing angle: the ground and target must not rise with an upward aim.
  if(x<bounds.left)state.panX+=bounds.left-x;else if(x>bounds.right)state.panX+=bounds.right-x;
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
    if(type==='bull'){tone(95,0,.18,.065,'triangle',42);tone(660,.03,.19,.05);tone(880,.10,.24,.045);tone(1320,.21,.44,.035);}
    if(type==='cinematic')tone(160,0,.48,.018,'triangle',680);
    if(type==='coach'){tone(880,0,.075,.045,'triangle');tone(1175,.065,.12,.045,'triangle');}
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
  $('bowName').textContent=b.name;$('bowStat').textContent=`${usingGun()?`그립감 ${b.grip} · 탄창 ${b.magazineSize}발 · 장전 ${b.reloadSeconds.toFixed(1)}초`:`그립감 ${b.grip} · 탄성 ${b.elasticity}`}${b.burstCount>1?` · 3연발 · 집탄 ${b.grouping}`:''}${hasScope()?` · ${equippedScope()}배 조준경 장착`:''}`;
  $('arrowName').textContent=projectile.name;$('arrowStat').textContent=usingGun()?`탄창 ${b.magazineSize}발 · 장전 ${b.reloadSeconds.toFixed(1)}초`:`촉 ${a.tipMass}g · ${a.fletching.name}${a.ability?` · ${a.ability.label}`:''}`;
  $('projectileLabel').textContent=usingGun()?'AMMO':'ARROW';
  $('loadoutSpeed').textContent=`기준 발사속도 ${getSpeed({bow:b,arrow:a,charge:1,velocityBias:0}).toFixed(1)} m/s`;
  $('loadoutSteady').textContent=`조준 안정 ${formatSeconds(weaponSteadyDuration(b))}초 · 당길 때마다 한 번`;
  for(const [id,item,kind] of [['equippedBow',b,'bow'],['equippedArrow',projectile,usingGun()?'bullet':'arrow']]){
    const cv=$(id),cx=cv.getContext('2d');cx.clearRect(0,0,cv.width,cv.height);drawEquipmentIcon(cx,cv.width,cv.height,{...item,kind,tier:item.id,scopeMounted:kind==='bow'&&hasScope(item.id)});
  }
  updateZoomControl();
}
function updateRound(){
  const s=state.stage;
  $('gunReload').classList.toggle('hidden',!state.isEvent);
  $('levelNumber').textContent=state.isEvent?'EV':String(s.id).padStart(2,'0');
  $('stageChapter').textContent=s.subtitle;
  $('stageName').textContent=s.name;
  $('gearRecommendation').textContent=state.isEvent?'':`${s.gearLabel}${s.longRange?` · ${s.distance}m 장거리 화살`:''} 권장`;
  $('gearRecommendation').classList.toggle('hidden',!!state.isEvent);
  $('scoreCount').textContent=state.isEvent?state.hits:state.score;$('goalCount').textContent=state.isEvent?s.totalTargets:s.goal;
  $('scoreUnit').textContent=state.isEvent?'개':'점';$('goalLabel').textContent=state.isEvent?'깬 표적 / 전체 표적':'현재 점수 / 목표 점수';
  $('scoreLegend').classList.toggle('hidden',!!state.isEvent);$('missionTitle').textContent=state.isEvent?'제한시간 기록 도전':'이번 한 발의 목표';
  $('distanceLabel').textContent=`${s.distance} m`;
  $('windLabel').textContent=s.wind?`${s.wind>0?'→ 오른쪽':'← 왼쪽'} 바람 ${Number(Math.abs(s.wind).toPrecision(2))}`:'바람 없음';
  $('stageHint').textContent=s.hint;
  $('mobileHint').textContent=$('stageHint').textContent;
  $('missionFill').style.width=`${Math.min(100,(state.isEvent?state.hits/s.totalTargets:state.score/s.goal)*100)}%`;
  $('missionState').textContent=state.isEvent?`${state.hits}개 격파 · 시간 동안 기록 도전`:state.score>=s.goal?'목표 점수 달성!':`목표 ${s.goal}점을 달성해 이번 판을 통과하세요`;
  $('roundProgress').textContent=state.isEvent?`${state.hits} / ${s.totalTargets}개 명중`:`${state.used} / ${shotLimit()}회 발사`;
  if(!state.isEvent){$('shotDots').innerHTML=Array.from({length:shotLimit()},(_,i)=>`<i class="arrow-dot ${i<state.used?'used':''}"></i>`).join('');$('shotCountLabel').textContent=`${Math.max(0,shotLimit()-state.used)}${shotUnit()} 남음${activeBow().burstCount>1?' · 3연발':''}`;}
  $('journeyCount').textContent=state.isEvent?`최고 ${(progress.eventBestByLevel[s.eventLevel]||0)/10}개`:`${s.id} / ${STAGES.length}`;
  $('journeyCaption').textContent=state.isEvent?`이벤트 ${s.eventLevel}단계 · ${s.targetsPerWave}개씩 등장`:adminTrialActive?`전체 ${STAGES.length}단계 자유 선택 · 모든 장비 체험`:`${progress.unlocked}단계까지 열림 · 이벤트까지 ${5-progress.mainRounds%5}판`;
  $('journeySteps').innerHTML=STAGES.map(s=>{const locked=!stageAvailable(s.id);return `<button class="journey-step ${s.id===state.stage.id?'active':''} ${stageCleared(s.id)?'done':''}" data-stage="${s.id}" ${locked?'disabled':''} aria-label="${s.id}단계 ${s.name}${locked?' 잠김':''}"><strong>${String(s.id).padStart(2,'0')}</strong><small>${locked?'잠김':`${s.distance}m`}</small></button>`}).join('');
  const journey=$('journeySteps');
  journey.classList.toggle('hidden',!!state.isEvent);
  if(journey.dataset.current!==String(s.id)){const active=journey.querySelector?.('.active');journey.scrollTop=Math.max(0,(active?.offsetTop||0)-(journey.offsetTop||0)-12);journey.dataset.current=String(s.id);}
  $('gameCanvas').dataset.stage=s.id;$('gameCanvas').dataset.score=state.score;$('gameCanvas').dataset.shots=state.used;
  $('previewBtn').classList.toggle('hidden',!s.obstacles.length);
  updateAmmoPanel();
}
function resetRound(stage=state.stage){
  if(guardAmmoAction())return;
  if(stage.kind!=='clay'&&!stageAvailable(stage.id)){toast(`${progress.unlocked}단계부터 차례로 통과해 주세요.`);return;}
  state.isEvent=stage.kind==='clay';
  if(!state.isEvent){state.eventReturnStage=null;state.eventMainResult=null;}
  state.eventStarted=!state.isEvent;
  state.resultSummary=null;
  state.pendingEventLevel=null;
  state.roundEpoch=(state.roundEpoch||0)+1;state.runId=createRequestId();state.awaitingRoundSave=null;state.deferRegistration=false;state.registering=false;state.practiceOnly=false;state.ammoNotice='';state.ammoLoading=false;
  cancelDraw();state.stage=prepareStage(stage,Math.floor(Math.random()*0x100000000));state.time=0;state.score=0;state.used=0;state.hits=0;state.arrowHits=0;state.earned=0;state.shotScores=[];state.shotMaxScores=[];state.targetMarks=[];state.stuck=[];state.effects=[];state.mode='ready';state.shot=null;state.volley=null;state.cinematic=null;state.coachSaid=false;state.coachReady=false;state.coachLastCueAt=-Infinity;state.coachCueUntil=0;state.coachLastCheck=-Infinity;state.returnCamera=null;state.settle=0;state.charge=0;state.feedbackUntil=0;state.zoom=1;
  state.stabilizerActive=false;state.stabilizerNotice='';
  state.eventShots=[];state.eventGunStates={};state.magazine=state.isEvent?Math.min(activeBow().magazineSize,ammoRemaining()??0):0;state.magazinePrimed=ammoRemaining()!==null;state.reloadRemaining=0;state.fireCooldown=0;state.ammoHud='';
  $('shotFeedback').classList.add('hidden');$('flightBadge').classList.add('hidden');recenter();resize();setAimZoom(equippedScope());updateRound();updateHeader();
  beginTargetPreview();
  if(!state.isEvent)registerMainRound();
  else{
    const epoch=state.roundEpoch;state.ammoLoading=true;
    ammo.refresh().then(result=>{if(state.roundEpoch!==epoch)return;state.ammoLoading=false;if(!result?.ok)state.ammoNotice=ammoError(result);onAmmoChange();});
    showEventReady();
  }
}
function startStage(id){
  if(guardAmmoAction())return;
  if(window.OjjudaGameResults?.canPlay?.()===false)return;
  if(state.mode==='flight'||state.mode==='settling'){toast('이번 발사가 끝나면 사격장을 바꿀 수 있어요.');return;}
  if(!Number.isInteger(id)||id<1||id>STAGES.length)return;
  if(!stageAvailable(id)){toast(`${progress.unlocked}단계부터 차례로 통과해 주세요.`);return;}
  progress.lastStage=id;save();dismissModal();resetRound(STAGES[id-1]);
}
function enterEvent(level=Math.max(1,Math.min(10,Math.floor(progress.mainRounds/5)))){
  if(guardAmmoAction())return;
  if(window.OjjudaGameResults?.canPlay?.()===false)return;
  if(state.mode==='flight'||state.mode==='settling'){toast('이번 발사가 끝나면 이벤트로 이동할 수 있어요.');return;}
  if(!state.isEvent){
    state.eventReturnStage=state.stage.id;
    // Keep this completed main round separate from the event's score. Event
    // purchases and result redraws must neither grant nor discard its clear.
    state.eventMainResult={stage:state.stage.id,completed:state.mode==='finished',score:state.score,goal:state.stage.goal};
  }
  dismissModal();resetRound(createClayEvent(level));
}
function exitEvent(){
  if(!state.isEvent)return;
  if(guardAmmoAction())return;
  if(state.mode==='flight'||state.mode==='settling'){toast('이번 발사가 끝나면 돌아갈 수 있어요.');return;}
  startStage(progress.lastStage);
}
const mainStageForChoices=()=>state.isEvent?(state.eventReturnStage||progress.lastStage):state.stage.id;
function mainRoundCleared(){
  if(state.isEvent){
    const result=state.eventMainResult;
    return !!result&&result.stage===mainStageForChoices()&&result.completed&&result.score>=result.goal;
  }
  return state.mode==='finished'&&state.score>=state.stage.goal;
}
const mainGoalForChoices=()=>state.isEvent?(state.eventMainResult?.goal??STAGES[mainStageForChoices()-1].goal):state.stage.goal;
const canAdvanceStage=()=>mainStageForChoices()<STAGES.length&&stageAvailable(mainStageForChoices()+1)&&
  (adminTrialActive||(state.mode==='finished'&&mainRoundCleared()));
function navigateStage(delta){
  if(guardAmmoAction())return;
  if(delta>0&&!canAdvanceStage()){
    toast(mainStageForChoices()>=STAGES.length?'마지막 단계예요.':!stageAvailable(mainStageForChoices()+1)&&mainRoundCleared()?`${progress.unlocked}단계부터 차례로 통과해 주세요.`:state.isEvent&&mainRoundCleared()?'접시 사격을 마친 뒤 다음 단계를 선택해 주세요.':`이번 활쏘기 판에서 목표 ${mainGoalForChoices()}점을 달성해야 다음 단계로 갈 수 있어요.`);return;
  }
  startStage(clamp(mainStageForChoices()+delta,1,STAGES.length));
}
function centerLaserForDraw(){
  if(!laserEnabled())return true;
  const zero=activeLaser(),sight=centerSightAngles();
  if(!sight)return false;
  // A new hold starts the physical sight in the middle of the existing view.
  // Apply only the player's manual zero: do not seek a target or solve a shot.
  const yaw=sight.yaw+zero.horizontalClicks*LASER_CLICK_RADIANS;
  const pitch=sight.pitch+zero.verticalClicks*LASER_CLICK_RADIANS;
  const rounding=1e-12;
  if(yaw < -MAX_AIM_YAW-rounding || yaw > MAX_AIM_YAW+rounding || pitch < MIN_AIM_PITCH-rounding || pitch > MAIN_MAX_PITCH+rounding){
    toast('현재 보정각으로는 화면 가운데를 조준할 수 없어요.\n영점을 조절한 뒤 다시 눌러 주세요.');
    return false;
  }
  state.aim.yaw=clamp(yaw,-MAX_AIM_YAW,MAX_AIM_YAW);state.aim.pitch=clamp(pitch,MIN_AIM_PITCH,MAIN_MAX_PITCH);
  state.sway=createSway();state.guide=null;
  return true;
}
function beginDraw(){
  if(trialBlocked())return false;
  if(state.modal||state.mode!=='ready'||document.hidden||(!state.isEvent&&state.used>=shotLimit()))return false;
  if(state.isEvent&&!state.eventStarted)return false;
  if(preparingMainRound())return false;
  if(state.isEvent&&(state.ammoLoading||ammo?.pending||ammoRemaining()===null||state.reloadRemaining>0||state.fireCooldown>0||state.time>=state.stage.eventDuration))return false;
  if(state.isEvent&&(ammoRemaining()<=0||state.magazine<=0)){toast('총알이 없어요. 총알 충전에서 잔량을 확인해 주세요.');return false;}
  if(!centerLaserForDraw())return false;
  closeLaserAdjustments();stopCoachVoice();state.coachSaid=false;state.coachReady=false;state.coachLastCueAt=-Infinity;state.coachCueUntil=0;state.coachLastCheck=-Infinity;
  state.mode='drawing';state.held=0;state.drawStarted=performance.now();state.charge=0;state.velocityBias=Math.random()*2-1;
  state.steadyDuration=weaponSteadyDuration();
  state.steadyStart=1+Math.random()*(DRAW_LIMIT-state.steadyDuration-1);state.steadyActive=false;state.guide=null;
  state.burstSeed=Math.floor(Math.random()*0x100000000);
  scheduleAutoRelease();sound('draw');updatePower();if(laserEnabled())render();return true;
}
function cancelDraw(){
  clearDrawTimer();closeLaserAdjustments();
  stopCoachVoice();state.coachCueUntil=0;state.coachReady=false;setCoachCue(false);
  if(state.mode==='drawing'){state.mode='ready';state.charge=0;state.held=0;state.steadyActive=false;}
  clearPointer();keys.clear();
}
function releaseShot(automatic=false,now=performance.now()){
  if(state.mode!=='drawing')return;
  if(automatic&&laserEnabled())return;
  if(document.hidden||state.modal){cancelDraw();return;}
  syncDraw(now);clearDrawTimer();
  const shots=launchVolley(shotParams(now));
  for(const shot of shots){shot.startedAt=now;shot.automatic=!laserEnabled()&&(automatic||drawElapsed(now)>=DRAW_LIMIT);shot.handled=false;shot.launched=!(shot.launchDelay>0);if(shot.launched)rememberFlight(shot,state.time);}
  if(state.isEvent){
    state.pendingAmmoShot={shot:shots[0],epoch:state.roundEpoch,runId:state.runId,gunId:activeBow().id};state.mode='ammo-pending';
    state.guide=null;state.steadyActive=false;state.held=0;state.charge=0;clearPointer();keys.clear();
    submitPendingShot();updateRound();updatePower();return;
  }
  state.shot=shots[0];state.volley=shots.length>1?{shots,elapsed:0,startedAt:now,handled:false}:null;
  state.shotMaxScores.push(shots.length*10);
  state.mode='flight';state.used++;state.guide=null;state.steadyActive=false;state.returnCamera=null;state.cinematic=null;
  clearPointer();keys.clear();
  $('shotFeedback').classList.add('hidden');$('flightBadge').classList.remove('hidden');
  $('flightBadge').textContent='비행 중 · 화살을 따라가는 중';
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
function moveTouchAim(e){
  if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
  const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;
  pointer.x=e.clientX;pointer.y=e.clientY;
  if(!dx&&!dy)return;
  // Move the visible sight by the finger's CSS-pixel delta, then apply that
  // angular change to the weapon. A large zero must not slow the red dot.
  const sight=viewAimAngles();
  const x=Math.tan(sight.yaw)*camera.focal+dx;
  const y=Math.tan(sight.pitch)/Math.cos(sight.yaw)*camera.focal-dy;
  const yaw=Math.atan2(x,camera.focal),pitch=Math.atan(y/camera.focal*Math.cos(yaw));
  state.aim.yaw+=yaw-sight.yaw;
  state.aim.pitch+=pitch-sight.pitch;
  clampAim();state.guide=null;
}
function onPointerDown(e){
  if(e.button!==0||e.isPrimary===false||pointer||!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
  const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
  if(x<0||x>=rect.width||y<(laserEnabled()?0:rect.height*2/3)||y>=rect.height)return;
  if(!beginDraw())return;e.preventDefault();e.currentTarget.focus({preventScroll:true});
  pointer={id:e.pointerId,el:e.currentTarget,x:e.clientX,y:e.clientY};
  touchpad.dataset.active='true';
  e.currentTarget.setPointerCapture(e.pointerId);
}
function onPointerMove(e){
  if(!pointer||pointer.id!==e.pointerId||state.mode!=='drawing')return;
  e.preventDefault();const now=performance.now();
  if(!laserEnabled()&&drawElapsed(now)>=DRAW_LIMIT){releaseShot(true,now);return;}
  moveTouchAim(e);
}
function onPointerUp(e){
  if(!pointer||pointer.id!==e.pointerId||e.button!==0)return;
  e.preventDefault();const now=performance.now(),automatic=!laserEnabled()&&drawElapsed(now)>=DRAW_LIMIT;
  if(!automatic)moveTouchAim(e);
  releaseShot(automatic,now);
}
for(const el of [touchpad]){
  el.addEventListener('pointerdown',onPointerDown);el.addEventListener('pointermove',onPointerMove);el.addEventListener('pointerup',onPointerUp);
  const cancelPointer=e=>{if(pointer&&pointer.id===e.pointerId)cancelDraw();};
  el.addEventListener('pointercancel',cancelPointer);el.addEventListener('lostpointercapture',cancelPointer);el.addEventListener('contextmenu',e=>e.preventDefault());
}
function bindLaserGear(element,axis){
  const angleAt=(event,center)=>Math.hypot(event.clientX-center.x,event.clientY-center.y)<6?null:Math.atan2(event.clientY-center.y,event.clientX-center.x);
  element.addEventListener('pointerdown',event=>{
    if(!laserControlsReady()||element.disabled||event.button!==0||event.isPrimary===false||laserDial||!Number.isFinite(event.clientX)||!Number.isFinite(event.clientY))return;
    event.preventDefault();event.stopPropagation();element.focus({preventScroll:true});
    const rect=element.getBoundingClientRect(),center={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
    laserDial={id:event.pointerId,element,axis,center,lastAngle:angleAt(event,center),total:0,detents:0,startAngle:laserGearAngles[axis]};
    element.classList.add('is-turning');element.setPointerCapture(event.pointerId);
  });
  element.addEventListener('pointermove',event=>{
    const held=laserDial;if(!held||held.element!==element||held.id!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();
    if(!laserControlsReady()){clearLaserDial();return;}
    const angle=angleAt(event,held.center);
    if(angle===null){held.lastAngle=null;return;}
    if(held.lastAngle===null){held.lastAngle=angle;return;}
    let delta=angle-held.lastAngle;if(delta>Math.PI)delta-=Math.PI*2;if(delta<-Math.PI)delta+=Math.PI*2;
    held.lastAngle=angle;held.total+=delta*180/Math.PI;laserGearAngles[axis]=held.startAngle+held.total;
    const turns=held.total/15,detents=turns<0?Math.ceil(turns-1e-9):Math.floor(turns+1e-9),change=detents-held.detents;
    if(change){held.detents=detents;adjustLaser(axis,change,false);}
    updateLaserPanel();
  });
  const finish=event=>{if(laserDial?.element===element&&laserDial.id===event.pointerId){event.preventDefault();event.stopPropagation();clearLaserDial();}};
  element.addEventListener('pointerup',finish);element.addEventListener('pointercancel',finish);element.addEventListener('lostpointercapture',finish);
  element.addEventListener('wheel',event=>{
    if(!laserControlsReady()||element.disabled)return;
    const delta=event.deltaY||event.deltaX;if(!Number.isFinite(delta)||!delta)return;
    event.preventDefault();event.stopPropagation();adjustLaser(axis,delta<0?1:-1);
  },{passive:false});
  element.addEventListener('keydown',event=>{
    if(element.disabled||!state.laserAdjustOpen)return;
    const increase=['ArrowRight','ArrowUp','Equal','NumpadAdd'].includes(event.code)||event.key==='+';
    const decrease=['ArrowLeft','ArrowDown','Minus','NumpadSubtract'].includes(event.code)||event.key==='-';
    if(increase||decrease||event.code==='Space'||event.code==='Enter'){
      event.preventDefault();event.stopPropagation();if(increase||decrease)adjustLaser(axis,increase?1:-1);
    }
  });
  element.addEventListener('keyup',event=>{keys.delete(event.code);event.stopPropagation();});
}
bindLaserGear($('laserHorizontalGear'),'horizontalClicks');bindLaserGear($('laserVerticalGear'),'verticalClicks');
function recordImpact(shot,born=state.time){
  if(!shot.result||shot.marked)return;shot.marked=true;
  const r=shot.result,hit=r.type==='hit';
  if(hit&&ANIMAL_NAMES[r.targetCenter?.kind])shot.animalHit={...applyAnimalHit(state.stage,r.targetCenter,r.score,born),kind:r.targetCenter.kind};
  if(hit){const target=r.targetCenter;if(target.kind==='clay'||target.kind==='ufo'){state.stage.brokenPasses??=[];if(!state.stage.brokenPasses.includes(target.passId))state.stage.brokenPasses.push(target.passId);}else{shot.attachment={x:r.point.x-target.x,y:r.point.y-target.y,passId:target.passId,...(r.animalAttachment?{animal:r.animalAttachment}:{})};shot.targetMark={...shot.attachment,z:target.z,velocity:{...shot.velocity},projectileType:shot.projectileType,born};state.targetMarks.push(shot.targetMark);}}
  else if(r.type!=='person'&&!(shot.projectileType==='bullet'&&r.type==='miss'))state.stuck.push({...r.point,velocity:{...shot.velocity},projectileType:shot.projectileType,born});
  shot.impactEffect={x:r.point.x,y:r.point.y,z:r.point.z,born,hit,kind:r.targetCenter?.kind};state.effects.push(shot.impactEffect);
}
function moveAttachedArrows(){
  for(const shot of state.volley?.shots||[state.shot])if(shot?.attachment){const target=targetAt(state.stage,state.time,shot.attachment.passId);shot.position=(shot.attachment.animal&&getAnimalAttachmentPoint(target,shot.attachment.animal))||{x:target.x+shot.attachment.x,y:target.y+shot.attachment.y,z:target.z};}
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
  if(!state.isEvent||!state.eventStarted||state.mode==='finished')return;
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
    // Keep one real arrow for camera, effects and the existing coin reward.
    // The volley score is summed separately; a passer still voids the trigger.
    state.shot=state.volley.shots.find(shot=>shot.result.type==='person')||state.volley.shots.reduce((best,shot)=>shot.result.score>best.result.score?shot:best);
  }
  const shot=state.shot,r=shot.result;if(shot.handled)return;shot.handled=true;state.mode='settling';state.settle=0;
  state.cinematic=createBullseyeCinematic(shot,shot.targetMark?.born??shot.replayFrames?.at(-1)?.time??state.time,{reducedMotion:!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches});
  if(state.cinematic)state.cinematic.entryCamera={...camera};
  for(const arrow of state.volley?.shots||[shot])recordImpact(arrow);
  moveAttachedArrows();
  $('flightBadge').textContent=state.cinematic?'명중 순간 · 화살을 따라':'착지 확인 · 조준 화면으로 돌아가요';
  const scoredShots=state.volley?.shots||[shot];
  const score=r.type==='person'?0:scoredShots.reduce((sum,arrow)=>sum+arrow.result.score,0);
  const hit=r.type==='hit';state.score+=score;state.shotScores.push(score);
  state.arrowHits+=scoredShots.filter(arrow=>arrow.result.type==='hit').length;
  if(hit)state.hits++;
  const reward=hit?Math.ceil(r.score*.8)+2:1;
  state.earned+=reward;progress.coins+=reward;progress.shots++;if(hit)progress.hits++;save();
  state.feedbackUntil=state.time+1.6;
  const animalZone=hit&&r.targetCenter?.kind&&r.targetCenter.kind!=='target'?r.zone:'';
  const animalHits=(state.volley?.shots||[shot]).map(arrow=>arrow.animalHit).filter(result=>result?.applied);
  const animalHit=animalHits.find(result=>result.justKilled)||animalHits.at(-1);
  const animalStatus=animalHit?`${ANIMAL_NAMES[animalHit.kind]} ${animalHit.killed?'쓰러짐':`체력 ${animalHit.health}/${animalHit.maxHealth}`} · `:'';
  $('feedbackTitle').textContent=hit?`${state.volley?'3연발 합계'+(animalZone?` · ${animalZone}`:''):animalZone||(r.score===10?'정중앙!':'명중!')} +${score}점`:r.zone;
  $('feedbackDetail').textContent=hit?`${animalStatus}${state.volley?`${state.volley.shots.filter(arrow=>arrow.result.type==='hit').length}/3발 명중`:r.flightTime.toFixed(2)+'초 비행'} · +${reward} 코인`:`${r.type==='person'?'이번 발사 0점 · 맞은 사람은 다음 발사부터 빠져요':r.type==='obstacle'?'벽 위나 기둥 사이의 틈을 노려보세요':r.type==='ground'?'조준을 높이거나 더 길게 당겨보세요':'거리와 바람을 다시 읽어보세요'} · +1 코인`;
  $('shotFeedback').className=`shot-feedback ${!hit?'miss':r.score===10?'gold':''}${state.cinematic&&!state.cinematic.reducedMotion?' hidden':''}`;
  sound(state.cinematic?'cinematic':hit?(r.score===10?'bull':'hit'):'miss');if(hit&&!state.cinematic&&navigator.vibrate)navigator.vibrate(r.score===10?[15,30,15]:15);
  updateHeader();updateRound();
}
function installScope(id,magnification){
  if(guardAmmoAction())return false;
  if(state.mode==='flight'||state.mode==='settling'||state.mode==='preview'){toast('이번 발사가 끝난 뒤 조준경을 바꿀 수 있어요.');return false;}
  const item=BOWS.find(entry=>entry.id===id),price=getScopePrice(item,magnification);
  if(!Number.isInteger(id)||!Number.isInteger(magnification)||price===null){toast('이 장비에서 사용할 수 없는 조준경이에요.');return false;}
  if(!progress.ownedBows.includes(id)){toast('조준경을 달 장비를 먼저 구매하세요.');return false;}
  const previous=progress.scopeLoadouts[id],owned=previous?.owned||[],alreadyOwned=owned.includes(magnification);
  if(alreadyOwned&&previous.equipped===magnification){toast(`이미 ${magnification}배 조준경이 장착되어 있어요.`);return true;}
  if(!alreadyOwned&&progress.coins<price){toast('조준경을 살 코인이 부족해요.');return false;}
  const coins=progress.coins,loadouts=progress.scopeLoadouts,summary=progress.scopedBows;
  progress.scopeLoadouts={...loadouts,[id]:{owned:[...new Set([...owned,magnification])].sort((a,b)=>a-b),equipped:magnification}};
  progress.scopedBows=Object.keys(progress.scopeLoadouts).map(Number);
  if(!alreadyOwned)progress.coins-=price;
  if(!save()){
    progress.coins=coins;progress.scopeLoadouts=loadouts;progress.scopedBows=summary;
    toast('조준경을 저장하지 못했어요. 브라우저 저장을 허용한 뒤 다시 시도해 주세요.');return false;
  }
  state.guide=null;if(id===activeBow().id)setAimZoom(magnification);
  updateHeader();if(!alreadyOwned)sound('buy');showShop('bow');
  toast(`${item.name}에 ${magnification}배 조준경 장착! ${alreadyOwned?'구매한 배율은 무료로 바꿀 수 있어요.':'이 장비에 영구 귀속돼요.'}`);return true;
}
function installLaser(id){
  if(guardAmmoAction()||document.hidden||state.isEvent||state.mode!=='ready'||(state.modal&&state.modal!=='shop'))return false;
  const item=BOWS.find(weapon=>weapon.id===id);
  if(!Number.isInteger(id)||!canEquipLaser(item)||!progress.ownedBows.includes(id)){toast('레이저는 첫 석궁부터 장착할 수 있어요. 석궁을 먼저 구매하세요.');return false;}
  const owned=!!activeLaser(id);
  if(!owned&&progress.coins<LASER_PRICE){toast('레이저를 살 코인이 부족해요.');return false;}
  const coins=progress.coins,loadouts=progress.laserLoadouts,bow=progress.bow;
  if(!owned){progress.coins-=LASER_PRICE;progress.laserLoadouts={...loadouts,[id]:normalizeLaserSettings()};}
  progress.bow=id;
  if(!save()){progress.coins=coins;progress.laserLoadouts=loadouts;progress.bow=bow;toast('레이저를 저장하지 못했어요. 브라우저 저장을 확인해 주세요.');return false;}
  setAimZoom(equippedScope());state.sway=createSway();state.guide=null;closeModal();updateHeader();updateRound();updatePower();
  if(laserEnabled())suspendLaserCoach();
  if(!owned)sound('buy');
  if(owned)openLaserAdjustments();else{closeLaserAdjustments();$('laserAdjustBtn').focus({preventScroll:true});}
  toast(owned?`${item.name} · 조준 전에 레이저 영점을 맞추세요.`:`${item.name}에 레이저를 달았어요. 이 무기에 영구 귀속돼요.`);return true;
}

function finishMainScreen(record, counted){
  if(state.roundEpoch!==record.epoch)return;
  if(counted&&progress.mainRounds>0&&progress.mainRounds%5===0){
    progress.lastStage=record.stage;save();
    // The completed main round remains visible until the player chooses the event.
    // Entering it still captures this round's real clear and uses the same ammo flow.
    state.pendingEventLevel=Math.min(10,progress.mainRounds/5);
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
  const result=started?.ok?await ammo.completeRound(started.run_id,record.stage,record.score):started;
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
  if(state.isEvent&&!state.eventStarted)return;
  if(state.mode==='finished'||state.roundSaving)return;state.mode='finished';
  const passed=state.score>=state.stage.goal;
  const previous=state.isEvent?progress.eventBestByLevel[state.stage.eventLevel]||0:progress.best[state.stage.id]||0;
  if(state.isEvent){
    progress.eventBestByLevel[state.stage.eventLevel]=Math.max(previous,state.score);progress.eventBest=Math.max(progress.eventBest,state.score);progress.eventPlays++;
    // The result keeps exchange, gun purchases and stage choices together.
    // Reopening it after a purchase must never settle the event a second time.
    save();updateHeader();updateRound();showResult(passed,0);
    return;
  }
  finishedMainRound={runId:state.runId,stage:state.stage.id,sent:false};
  reportFinishedMainRound();
  progress.best[state.stage.id]=Math.max(previous,state.score);
  progress.unlocked=unlockedStage(progress.best);
  let bonus=0;
  if(passed){bonus=previous<state.stage.goal?25:12;progress.coins+=bonus;state.earned+=bonus;sound('clear');}
  const record={epoch:state.roundEpoch,stage:state.stage.id,score:state.score,passed,bonus,startPromise:state.roundStart,serverRunId:state.serverRunId};
  state.awaitingRoundSave=record;save();saveFinishedMainRound(record);
}

function openModal(type,html,narrow=false){
  if(trialBlocked())return;
  cancelDraw();if(!state.modal)state.lastFocus=document.activeElement;state.modal=type;
  $('modalContent').innerHTML=html;$('modal').classList.toggle('narrow',narrow);$('modal').dataset.view=type;
  $('modal').setAttribute('aria-labelledby','modalTitle');
  $('modalClose').classList.toggle('hidden',type==='result'||type==='event-ready');$('menuBtn').setAttribute('aria-expanded',type==='menu'?'true':'false');
  $('modalBackdrop').classList.remove('hidden');document.body.style.overflow='hidden';
  if(type==='result'||type==='event-ready'){
    const current=$('modalContent').querySelector?.(`[data-action="${type==='event-ready'?'start-event':'retry'}"]`);
    if(current&&!current.disabled)current.focus();else{$('modal').setAttribute('tabindex','-1');$('modal').focus();}
  }else $('modalClose').focus();
}
function dismissModal(){
  if(!state.modal)return;state.modal=null;$('modalBackdrop').classList.add('hidden');document.body.style.overflow='';
  $('menuBtn').setAttribute('aria-expanded','false');
  state.lastFocus?.focus?.();state.lastFocus=null;
}
function closeModal(){
  if(!state.modal)return;
  if(state.mode==='finished'&&state.resultSummary){
    if(state.modal!=='result')showResult(state.resultSummary.passed,state.resultSummary.bonus);
    return;
  }
  if(state.isEvent&&!state.eventStarted){if(state.modal!=='event-ready')showEventReady();return;}
  dismissModal();
}
function eventStartReason(){
  if(state.ammoLoading||ammoLocked()||ammoRemaining()===null)return '총알 확인이 끝나면 시작할 수 있어요.';
  if(ammoRemaining()<=0)return '총알을 충전한 뒤 시작해 주세요.';
  return '';
}
function eventReadyMarkup(){
  const reason=eventStartReason(),gun=activeBow();
  return `<div class="event-ready-content"><p class="eyebrow">READY WHEN YOU ARE</p><h2 id="modalTitle">접시 사격 준비</h2><p class="modal-subtitle">시작 버튼을 누르면 표적과 제한 시간이 움직여요.</p><div class="event-ready-summary"><div><small>이벤트</small><strong>${state.stage.eventLevel}단계 · ${state.stage.targetsPerWave}개씩</strong></div><div><small>제한 시간</small><strong>${state.stage.eventDuration.toFixed(1)}초</strong></div><div><small>선택한 총기</small><strong>${gun.name}</strong></div><div><small>보유 총알</small><strong>${ammoStockLabel()}</strong></div></div><p class="stabilizer-message" role="status">${reason||'조준하고 손을 떼면 발사해요. 탄창을 비우면 자동으로 장전해요.'}</p><button class="button primary-button event-start-button" data-action="start-event" ${reason?'disabled':''}>사격 시작</button><div class="event-ready-actions"><button class="button soft-button" data-action="event-shop">${icon('bag')}${adminTrialActive?'총기 교체':'총기 구매·장착'}</button><button class="button soft-button" data-action="ammo-shop">${icon('coin')}${adminTrialActive?'체험 총알 무제한':'총알 충전'}</button></div><button class="text-button" data-action="leave-event" ${ammoLocked()?'disabled':''}>활쏘기로 돌아가기</button></div>`;
}
let eventReadyHtml='';
function showEventReady(){
  if(!state.isEvent||state.eventStarted||state.mode==='finished')return;
  eventReadyHtml=eventReadyMarkup();openModal('event-ready',eventReadyHtml,true);
}
function renderEventReady(){
  if(state.modal!=='event-ready')return;
  const html=eventReadyMarkup();if(html===eventReadyHtml)return;
  const action=document.activeElement?.dataset?.action;
  $('modalContent').innerHTML=html;eventReadyHtml=html;
  const button=$('modalContent').querySelector?.(`[data-action="${action||'start-event'}"]`);
  if(button&&!button.disabled)button.focus();
}
function startEvent(){
  if(!state.isEvent||state.eventStarted||state.mode!=='ready'||state.modal!=='event-ready')return false;
  const reason=eventStartReason();if(reason){toast(reason);renderEventReady();return false;}
  state.eventStarted=true;state.time=0;state.eventGunStates={};
  state.magazine=Math.min(activeBow().magazineSize,ammoRemaining());state.magazinePrimed=true;state.reloadRemaining=0;state.fireCooldown=0;
  dismissModal();lastFrame=performance.now();updateRound();updatePower();return true;
}
function updateStabilizerUi(){
  const count=progress.stabilizers,active=state.stabilizerActive&&state.mode!=='finished';
  $('stabilizerCount').textContent=adminTrialActive?'∞':count>99?'99+':String(count);
  $('stabilizerBtn').classList.toggle('active',active);
  $('stabilizerBtn').setAttribute('aria-label',`안정제 · ${adminTrialActive?'체험 중 무제한':`${count.toLocaleString('ko-KR')}개 보유`}${active?' · 이번 판 떨림 50% 적용 중':''}`);
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
function canExchangeStabilizer(){
  return !adminTrialRequested&&progress.clayCredits>=STABILIZER_COST&&progress.stabilizers<CONSUMABLE_LIMIT;
}
function eventStabilizerExchange(){
  return state.isEvent&&state.mode==='finished'&&!!state.resultSummary;
}
function stabilizerMarkup(){
  const exchange=eventStabilizerExchange(),useReason=stabilizerUseReason();
  if(adminTrialActive)return `<p class="eyebrow">관리자 아이템 체험</p><h2 id="modalTitle">안정제 무제한 체험</h2><p class="modal-subtitle">활·석궁·총기의 흔들림을 이번 판 동안 50% 줄여요. 매 판 한 번씩 사용할 수 있어요.</p><div class="stabilizer-summary"><div><small>체험용 안정제</small><strong>무제한</strong></div><div><small>이번 판</small><strong>${state.stabilizerActive?'사용 중':'사용 전'}</strong></div></div><div class="stabilizer-actions"><button class="button primary-button" data-action="use-stabilizer" ${useReason?'disabled':''}>${icon('tonic')}안정제 사용 · 떨림 50%</button><p class="stabilizer-message" role="status">${state.stabilizerNotice||useReason||'구매 없이 사용할 수 있어요. 체험 재고와 기록은 저장되지 않아요.'}</p><button class="button soft-button" data-action="close">게임으로 돌아가기</button></div>`;
  const buyReason=progress.stabilizers>=CONSUMABLE_LIMIT?'안정제 보유 한도에 도달했어요.':progress.clayCredits<STABILIZER_COST?`구매하려면 접시 점수 ${STABILIZER_COST-progress.clayCredits}개가 더 필요해요.`:'';
  const useButton=exchange?'':`<button class="button soft-button" data-action="use-stabilizer" ${useReason?'disabled':''}>${icon('tonic')}${state.stabilizerActive?'이번 판에 사용한 안정제':'안정제 1개 사용 · 떨림 50%'}</button>`;
  const notice=state.stabilizerNotice||(exchange?'교환한 안정제는 다음 판에서 직접 사용할 수 있어요.':useReason||'사용하면 이번 판 남은 발사에 바로 적용돼요.');
  return `<p class="eyebrow">STEADY YOUR NEXT SHOT</p><h2 id="modalTitle">${exchange?'안정제 교환':'안정제'}</h2>
    <p class="modal-subtitle">${exchange?'접시 사격을 마쳤어요. 모은 점수로 다음 판에 쓸 안정제를 준비하세요.':'접시 사격에서 모은 점수로, 한 판의 떨림을 절반으로 줄여요.'}</p>
    <div class="stabilizer-summary"><div><small>접시 점수</small><strong>${progress.clayCredits.toLocaleString('ko-KR')}개</strong></div><div><small>보유 안정제</small><strong>${progress.stabilizers.toLocaleString('ko-KR')}개</strong></div></div>
    <div class="stabilizer-rules"><p><strong>접시 점수 5개 = 안정제 1개</strong><br>이벤트에서 접시나 UFO를 1개 깨면 접시 점수 1개를 받아요.</p><p><strong>${exchange?'사용할 판에서 한 번씩':'이번 판 남은 발사에 적용'}</strong><br>활·석궁·총기의 떨림이 50%로 줄어요. 한 판에 한 번만 사용하며, 다시 시작하거나 다른 판으로 이동하거나 새로고침하면 효과가 끝나요.</p><p>사용하지 않은 안정제와 남은 접시 점수는 이 기기에 저장돼요.</p></div>
    <div class="stabilizer-actions"><button class="button primary-button" data-action="buy-stabilizer" ${buyReason?'disabled':''}>안정제 1개 ${exchange?'교환':'구매'} · 접시 점수 5개</button>${buyReason?`<p class="stabilizer-message">${buyReason}</p>`:''}${useButton}<p class="stabilizer-message" role="status">${notice}</p><button class="button soft-button" data-action="close">${exchange?'다음으로':'게임으로 돌아가기'}</button></div>`;
}
function renderStabilizers(){
  if(state.modal!=='stabilizer')return;
  if(!adminTrialActive&&eventStabilizerExchange()&&!canExchangeStabilizer()){closeModal();return;}
  const html=stabilizerMarkup();if(html===stabilizerModalHtml)return;
  const focusedAction=document.activeElement?.dataset?.action;
  $('modalContent').innerHTML=html;stabilizerModalHtml=html;
  if(['buy-stabilizer','use-stabilizer'].includes(focusedAction)){
    const button=$('modalContent').querySelector?.(`[data-action="${focusedAction}"]`);
    if(button&&!button.disabled)button.focus();else $('modalClose').focus();
  }
}
function showStabilizers(){
  if(trialBlocked())return;
  if(!adminTrialActive&&eventStabilizerExchange()&&!canExchangeStabilizer()){closeModal();return;}
  cancelDraw();state.stabilizerNotice='';
  stabilizerModalHtml=stabilizerMarkup();openModal('stabilizer',stabilizerModalHtml,true);
}
function buyStabilizer(){
  if(!(state.modal==='stabilizer'||state.modal==='result'&&eventStabilizerExchange())||!canExchangeStabilizer())return false;
  const exchange=eventStabilizerExchange();
  const credits=progress.clayCredits,inventory=progress.stabilizers;
  progress.clayCredits-=STABILIZER_COST;progress.stabilizers++;
  if(!save()){
    progress.clayCredits=credits;progress.stabilizers=inventory;
    state.stabilizerNotice=`저장하지 못해 ${exchange?'교환':'구매'}를 취소했어요. 접시 점수는 차감되지 않았어요.`;
    refreshStabilizerPurchase();toast(state.stabilizerNotice);return false;
  }
  state.stabilizerNotice=`안정제 1개를 ${exchange?'교환':'구매'}했어요. 사용할 판에서 직접 사용해 주세요.`;
  updateHeader();refreshStabilizerPurchase();sound('buy');if(exchange)toast(state.stabilizerNotice);return true;
}
function refreshStabilizerPurchase(){
  if(state.modal!=='result'){renderStabilizers();return;}
  showResult(state.resultSummary.passed,state.resultSummary.bonus);
  $('modalContent').querySelector?.(`[data-action="${canExchangeStabilizer()?'buy-stabilizer':'result-shop'}"]`)?.focus();
}
function useStabilizer(){
  if(trialBlocked())return false;
  if(state.modal!=='stabilizer')return false;
  const reason=stabilizerUseReason();
  if(reason){state.stabilizerNotice=reason;renderStabilizers();toast(reason);return false;}
  const inventory=progress.stabilizers;if(!adminTrialActive)progress.stabilizers--;
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
  if(adminTrialActive){openModal('ammo',`<p class="eyebrow">관리자 아이템 체험</p><h2 id="modalTitle">체험 총알은 무제한이에요</h2><p class="modal-subtitle">총기 5종을 자유롭게 바꿔 써보세요. 탄창 수와 장전 시간은 일반 게임과 같아요.</p><div class="ammo-rules"><p><strong>쭈와 보유 총알을 쓰지 않아요</strong><br>체험에서 쏜 총알과 점수는 계정에 반영되지 않아요.</p></div><button class="button primary-button" data-action="trial-events">다른 이벤트 선택</button><button class="button soft-button" data-action="close">게임으로 돌아가기</button>`,true);return;}
  const snapshot=ammo?.snapshot,remaining=ammoRemaining(),known=remaining!==null;
  const offer=ammoOffer(),pack=offer?.amount,price=offer?.price;
  const coins=Number.isInteger(snapshot?.coins)?snapshot.coins:null,busy=!!state.ammoBusy;
  const canBuy=known&&!!offer&&coins!==null&&coins>=price&&!busy&&!ammo?.pending;
  const milestoneCount=Number.isInteger(snapshot?.milestones_granted)?snapshot.milestones_granted:0;
  openModal('ammo',`<p class="eyebrow">READY FOR THE NEXT SHOT</p><h2 id="modalTitle">이벤트 총알 충전</h2><p class="modal-subtitle">보유 총알은 계정에 저장돼요. 탄창에 들어 있는 총알도 이 수량에 포함됩니다.</p><div class="ammo-shop-balance"><div><small>보유 총알</small><strong>${known?remaining.toLocaleString('ko-KR'):'—'}</strong><em>발</em></div><div><small>쭈 지갑</small><strong>${coins===null?'—':coins.toLocaleString('ko-KR')}</strong><em>쭈</em></div></div><div class="ammo-rules"><p><strong>5판마다 첫 달성 총알 20발</strong><br>누적 5·10·15·…·50판에서 한 번씩 받아요. 지금까지 ${milestoneCount}/10회 지급.</p><p><strong>하루 한 번, 잔량을 20발까지</strong><br>첫 달성 보상을 받은 다음 날부터 한국 시간 기준으로 확인해요. 19발 이하면 20발로, 20발 이상이면 그대로예요. 그날 사용한 만큼 다시 채워지지 않아요.</p><p>구매한 총알도 보충 기준에 포함되고 다음 날에도 남아요. 게임 코인과 쭈는 별개예요.</p></div><button class="button primary-button ammo-purchase" data-action="buy-ammo" ${canBuy?'':'disabled'}>${busy?'처리 확인 중…':offer?`${pack}발 구매 · ${price}쭈`:'구매 가격 확인 중'}</button><p class="ammo-purchase-note" role="status">${ammo?.pending?'이전 처리 결과를 확인한 뒤 다시 구매할 수 있어요.':!known?'로그인한 오락실에서 잔량을 확인해 주세요.':coins!==null&&coins<price?'쭈가 부족해요. 오락실 지갑에서 확인해 주세요.':state.ammoNotice||'구매 버튼을 누를 때만 쭈가 차감돼요. 자동 구매는 하지 않아요.'}</p><button class="button soft-button" data-action="retry-ammo" ${busy||state.roundSaving?'disabled':''}>${ammo?.pending?'이전 처리 다시 확인':'잔량 다시 확인'}</button><button class="button soft-button" data-action="close">게임으로 돌아가기</button>`,true);
}
function showAmmoShop(){if(state.pendingAmmoShot||state.roundSaving){guardAmmoAction();return;}renderAmmoShop();}
async function buyAmmo(){
  if(adminTrialRequested)return;
  if(state.modal!=='ammo'||state.ammoBusy||ammoLocked()||ammo?.pending)return;
  const snapshot=ammo.snapshot,offer=ammoOffer();if(!snapshot||!offer||!Number.isInteger(snapshot.coins)||snapshot.coins<offer.price)return;
  state.ammoBusy=true;renderAmmoShop();
  const result=await ammo.buy();state.ammoBusy=false;
  state.ammoNotice=result?.ok?`총알 ${ammo.snapshot?.pack_ammo||10}발을 충전했어요.`:ammoError(result);
  if(result?.ok)sound('buy');toast(state.ammoNotice);onAmmoChange();
}
async function retryAmmo(){
  if(trialBlocked()||!ammo)return;
  if(state.ammoBusy||state.roundSaving)return;
  if(state.pendingAmmoShot){await submitPendingShot(true);return;}
  const previous=ammo.pending,record=state.awaitingRoundSave;
  if(previous?.action==='round-start'&&previous.requestId===state.runId)state.deferRegistration=false;
  state.ammoBusy=true;updateAmmoPanel();if(state.modal==='ammo')renderAmmoShop();
  const result=await (ammo.pending?ammo.retryPending():ammo.refresh());
  state.ammoBusy=false;state.ammoNotice=result?.ok?'보유 총알을 확인했어요.':ammoError(result);
  if(previous?.action==='coach-buy'){
    state.ammoNotice=result?.ok||result?.reason==='coach_basic'?'코치는 이제 무료 기본 기능이에요. 이전 처리 결과를 확인했어요.':ammoError(result);
  }
  if(result?.ok&&previous?.action==='round-start'&&previous.requestId===state.runId){
    state.serverRunId=result.run_id;state.roundStart=Promise.resolve(result);state.deferRegistration=false;
    if(record&&record.epoch===state.roundEpoch){await saveFinishedMainRound(record,result);return;}
  }
  if(result?.ok&&previous?.action==='round-complete'&&record&&record.epoch===state.roundEpoch&&previous.runId===record.serverRunId){applyMainCompletion(record,result);return;}
  if(result?.ok&&!state.isEvent&&!state.serverRunId&&!state.registering&&state.mode!=='finished'&&!ammo.pending){registerMainRound();await state.roundStart;}
  onAmmoChange();toast(state.ammoNotice);
}
function showHelp(){
  if(adminTrialActive){openModal('help',`<p class="eyebrow">관리자 아이템 체험</p><h2 id="modalTitle">모든 아이템을 써보세요</h2><div class="help-note"><p><strong>활 10종 · 석궁 10종 · 총기 5종 · 화살 19종</strong><br>무기 상점에서 구매 없이 장착할 수 있어요. 각 무기에서 사용할 수 있는 2·3·6·8배 조준경도 모두 열려 있어요. 상점에서 무료로 바꿔 장착할 수 있어요.</p><p><strong>누른 채 끌어 조준하고, 손을 떼면 발사</strong><br>일반 조준은 화면 아래 1/3에서, 레이저 조준은 사격장 전체에서 시작해요. 레이저는 누를 때마다 사격장 가운데에서 나타나요.<br>장비의 성능·흔들림·탄도·탄창·장전 시간은 일반 게임과 같아요. 사격장 위쪽 발사각은 수평 0°를 기준으로 활을 들어 올린 실제 각도예요. 45°처럼 각도를 높여 쏠 수 있고, 같은 각도여도 활·화살·당긴 힘에 따라 날아가는 거리가 달라져요. 각도를 바꿔도 조준 화면의 높이는 그대로예요. 안정제를 쓰면 이번 판의 흔들림이 절반으로 줄어요.</p><p><strong>레이저 영점도 자유롭게 체험</strong><br>석궁 10종의 레이저가 열려 있어요. 영점 조절을 누르면 톱니를 열 수 있어요. 조준 전에 0.05° 또는 0.50°씩 톱니를 돌려 영점을 맞추세요. 톱니의 보정각은 활과 레이저가 벌어진 각도이며, 사격장 위쪽의 실제 발사각과 달라요. 누른 동안 빨간 점으로 겨눈 뒤 손을 놓으면 발사해요. 레이저 사용 중에는 10초 자동발사와 코치 안내가 쉬어요. 보정값은 체험이 끝나면 저장되지 않아요.</p><p><strong>총알과 안정제 무제한</strong><br>상단의 총기·이벤트 체험에서 1~10단계를 바로 선택해요. 8단계부터는 UFO도 등장해요. 활·석궁 사격장은 메뉴의 전체 단계에서 골라요.</p><p>체험 장비·점수·코인은 저장되지 않으며 계정의 쭈와 총알도 사용하지 않아요. 위쪽 ‘일반 게임으로’ 버튼을 누르면 원래 게임으로 돌아가요.</p></div><button class="button primary-button" data-action="close">체험 계속하기</button>`,true);return;}
  openModal('help',`<p class="eyebrow">MAKE YOUR FIRST SHOT</p><h2 id="modalTitle">손끝으로 배우는 활쏘기</h2><p class="modal-subtitle">한 발씩 쏘다 보면, 바람과 거리의 감각이 생겨요.</p><div class="help-steps"><div class="help-step"><span>01</span><div><strong>화면 아래에서 끌어 조준</strong><p>사격장 화면 아래 3분의 1은 보이지 않는 조작 영역이에요. 그곳을 누른 채 손가락을 움직이면 위쪽 조준점도 같은 방향과 거리만큼 움직여요. 레이저를 켜면 사격장 어느 부분이든 눌러 조준할 수 있고, 빨간 점은 누를 때마다 사격장 가운데에서 시작해요. 확대해도 손가락과 1:1로 움직이고, 손가락을 멈추면 조준 이동도 멈춰요. 손을 떼면 현재 조준점 방향으로 발사돼요.</p></div></div><div class="help-step"><span>02</span><div><strong>손을 떼는 순간 발사</strong><p>활과 석궁은 길게 당길수록 빠르게 날아요. 총기는 조준하고 놓으면 활·석궁 조합의 최고 속도보다 정확히 2배 빠른 탄환을 발사해요. 누른 뒤 1~10초 사이에 무작위로 한 번 흔들림이 서서히 줄어들어 멈춰요. 안정 시간이 끝나면 바로 다시 흔들려요. 안정 시간은 기본 활 0.5초부터 장비 등급에 따라 길어져 최고급 석궁은 2초예요. 이벤트 총기는 0.5초예요. 레이저를 끈 상태에서는 10초 안에 손을 떼지 않으면 자동발사해요. 레이저를 켰다면 누르는 동안 계속 겨눌 수 있고, 손을 놓을 때만 발사해요.</p></div></div><div class="help-step"><span>03</span><div><strong>발사각을 보며 높이 조절하기</strong><p>사격장 위쪽 발사각은 수평 0°를 기준으로 활을 들어 올린 실제 각도예요. 활과 석궁은 최대 60°까지 올릴 수 있어요. 45°를 들었다면 실제로 그 각도로 발사되고, 활·화살·당긴 힘과 바람에 따라 날아가는 거리가 달라져요. 각도를 올리거나 내려도 조준 화면의 높이는 그대로예요. 발사하면 화면이 날아가는 화살을 따라가고, 맞거나 땅에 떨어진 뒤 돌아와요. 벽·기둥이 있는 곳에서는 화살이 꽂히는 지점이 보이도록 시점을 보정해요. 둥근 과녁의 10점 중앙에 맞으면 실제 마지막 비행을 가까이 다시 보여주고, 금빛 충격파와 파편이 퍼지는 짧은 명중 장면이 나와요. 점수와 코인은 한 번만 받아요. 화살은 날아가며 떨어져요. 1~4단계 기본 고정 과녁 다음에는 5~8단계 높은 고정 과녁으로 위쪽 조준을 익혀요. 이어서 이동 과녁, 바람, 높낮이, 양옆 벽, 기둥 순서로 10·20·30·50m를 연습해요. 처음 여덟 단계는 바람이 없어요. 13~16단계의 바람 읽기에서는 멈춘 과녁을 겨누며 옆으로 밀리는 화살을 느껴보세요. 나뭇잎이 흐르는 쪽으로 화살도 밀리니 바람 반대쪽을 겨누고, 멀수록 더 보정해보세요. 상단의 화살표와 수치로 바람 방향과 세기를 확인할 수 있어요. 처음 3개 사격장에서는 점선으로 궤적을 알려줘요. 담장이 있는 단계는 시작할 때 위에서 과녁을 보여줘요. ‘과녁 보기’로 다시 확인할 수 있어요. 양옆 벽 사이로 과녁이 3/4, 1/2, 1/3 보이는 순서로 익혀요. 기둥 연습에서는 움직이는 과녁이 약 3/4 보이도록 배치돼요. 벽과 과녁의 위치는 함께 달라져 틈이 유지되고, 벽에는 과녁 표시가 없어요. 나중에는 지나는 사람 사이의 과녁, 벽 뒤에 완전히 숨은 고정·이동 과녁, 여러 장애물을 섞은 과제를 만나요. 완전히 가린 벽은 과녁을 60·65·70·80m에 두고 벽 뒤에 충분한 공간을 마련했어요. 충분히 당긴 화살도 벽을 넘어 과녁으로 내려오도록 겨눠보세요. 사람이 나오는 판에서는 한 명이 과녁 바로 앞을 빠르게 왕복하거나 여러 명이 겹쳐 지나가다가 잠깐 틈이 열려요. 화살이 도착할 때 틈이 열리도록 기다렸다 쏘세요. 사람에게 맞으면 이번 발사는 0점이에요. 이동 과녁의 속도도 불규칙하게 바뀌어요. 움직이는 원형 과녁은 이전보다 2배 빠르게 움직여요. 토끼·살쾡이·사슴·비둘기·독수리·치타도 각각 10·20·30·50m에서 만나요. 토끼는 껑충 뛰고 살쾡이는 빨라졌다 느려지며, 사슴은 크게 도약해요. 비둘기는 빠르게 상하로 출렁이고 독수리는 완만하게 활공해요. 치타는 강하게 가속하는 구간이 있어요. 독수리는 천천히 활공하고, 나머지 동물은 뒤에 나올수록 몸집에 비해 더 빠르게 움직여요. 동물은 양쪽 중 무작위 방향에서 나타나 속도를 바꾸며 반대편으로 지나가요. 동물은 심장 10점, 머리 8점, 몸통 5점, 다리·귀 3점으로 맞힌 부위에 따라 점수가 달라져요. 화면에 그려진 몸에만 맞고 다리 사이나 몸 주변의 빈 공간은 통과해요. 맞힌 점수만큼 피해가 쌓여 토끼 5점, 살쾡이 8점, 사슴 10점, 비둘기 12점, 독수리 15점, 치타 18점에 도달하면 그 자리에서 쓰러져요. 쓰러진 동물에 다시 맞혀도 점수를 얻지 않아요. 명중 안내에서 부위·점수·남은 체력을 확인하세요.</p></div></div><div class="help-step"><span>04</span><div><strong>코인을 모아 더 좋은 장비로</strong><p>활은 그립감이 높을수록 덜 흔들리고, 탄성이 높을수록 빠르게 쏴요. 화살은 촉·몸통·깃의 조합으로 성능이 정해져요. 총 무게가 가벼우면 같은 활에서 더 빠르게 출발하고, 가는 몸통은 바람과 공기 저항을 줄여요. 큰 깃은 자세를 빨리 잡지만 저항도 늘어요. 상위 화살은 부품을 함께 개선해 기준 속도와 일관성이 좋아지고, 바람과 감속의 영향은 줄어요. 상점에서 재질·굵기와 전체 성능을 비교해보세요. 화살은 일반 12종, 특수 2종, 장거리 5종으로 총 19종이 있어요. 장거리 화살은 60·80·100·120·150m에 맞춰 무게와 공기 저항이 단계적으로 줄어들고, 같은 거리에서 더 빠르게 도착해 덜 떨어져요. 탄성 화살은 과녁에 못 미쳐 땅에 닿으면 한 번 튕겨 더 날아가고, 튕긴 뒤에는 속도가 줄어요. 자석 화살은 실제 표적 중심 5m 안으로 가까워지면 중앙 쪽으로 조금 휘어요. 크게 빗나간 화살을 되돌리거나 벽·기둥을 통과하지는 않아요. 특수 능력은 활·석궁에서만 작동해요. 코치는 누구나 무료로 쓰는 기본 기능이에요. 구매나 시간 제한 없이 처음부터 켜져 있어요. 낙하·바람·움직이는 표적까지 계산해 명중하기 좋은 순간에 “쏴!” 하고 알려줘요. 좋은 타이밍이 올 때마다 안내하고, 소리를 꺼도 좋은 조준 상태에서는 상단 표시가 계속 켜져요. 게임 메뉴에서 코치를 켜거나 끌 수 있어요. 1~20단계는 기본 활, 21~48단계는 하위 활·석궁, 49~105단계는 중간 활·석궁, 106~220단계는 상위 활·석궁을 기준으로 맞췄어요. 기존 마지막 판 뒤에는 과제 순서대로 60·80·100·120·150m 장거리 100개 판이 이어져요. 장거리에서는 거리별 장거리 화살 5종으로 더 빠르고 낮은 탄도로 쏴보세요. 단계 이름 아래와 단계 목록에 권장 등급이 표시돼요. 상점은 기본 활부터 레어 석궁까지 성장 순서로 배치돼 있어요. 그립감과 탄성이 번갈아 조금씩 높아지고, 이전 단계의 능력치는 떨어지지 않아요. 능력치별 정렬로도 비교할 수 있어요. 상위 장비로 갈수록 가격 차이가 커져요. 조준경은 2·3·6·8배 네 종류예요. 성장 순서의 무기 1~5번은 2배, 6~10번은 2·3배, 11~15번은 2·3·6배, 16~20번은 네 배율을 모두 사용할 수 있어요. 구매한 배율은 해당 무기에 영구 귀속되고, 보유한 배율끼리 무료로 바꿔 장착할 수 있어요. 확대 버튼은 기본 1배와 현재 장착 배율을 오가요. 조준경이 없으면 1배로 보여요. 빠른 동물이 화면 밖으로 벗어나면 1배로 바꿔 동물과 앞쪽 겨냥점을 함께 보세요. 레이저 포인터는 첫 석궁부터 석궁 10종에 각각 500코인으로 달 수 있어요. 아래의 영점 조절을 누르면 톱니를 열 수 있어요. 조준을 시작하기 전에 좌우·상하 톱니를 돌려 영점을 맞추세요. 시계 방향은 오른쪽·위쪽, 반대 방향은 왼쪽·아래쪽 보정이에요. 한 칸에 0.05° 또는 0.50°를 고를 수 있고, 톱니 옆에는 +7.50°처럼 보정각이 표시돼요. 이 숫자는 활과 레이저가 벌어진 각도이며 거리를 입력하는 칸이 아니에요. 활을 들어 올린 실제 발사각은 사격장 위쪽에서 확인하세요. 영점을 조절하면 빨간 점은 반대쪽으로 옮겨져요. 빨간 점을 같은 지점에 다시 겨누면 상하 +는 더 높게, 좌우 +는 더 오른쪽으로 발사돼요. 좌우는 바람에 밀리는 방향의 반대로 직접 맞추세요. 빨간 점은 발사 전과 영점 조절 중에도 보여요. 사격장을 누르면 보정 장치는 잠기고, 빨간 점이 화면 가운데에서 나타나요. 포인터로 겨눈 뒤 손을 놓으면 화살이 나가며, 레이저를 켠 동안은 10초 자동발사와 코치 안내가 쉬어요. 레이저를 끄면 기존 코치 설정이 돌아와요. 보정이 틀리면 화살도 빗나갈 수 있어요. 레이저와 영점은 해당 무기에 귀속되며 총기에는 달 수 없어요. 본편에는 활 10종·석궁 10종이 있어요. 총기 5종은 별도의 접시 사격 이벤트 전용이에요. 일반 석궁은 단발, 레어 석궁만 3연발이에요. 레어 등급이 높으면 집탄성이 좋아져 3발이 더 가깝게 모여요. 3연발의 첫 화살은 조준한 방향으로, 나머지 두 발은 그 주변으로 나가요. 발사 기회를 한 번 쓰고 세 발의 점수를 모두 합쳐요. 세 발이 10점에 맞으면 30점이며, 다섯 번 모두 맞히면 150점이에요. 한 발이라도 사람에게 닿으면 이번 발사는 0점이에요. 석궁도 활과 같은 탄도 규칙을 써요. 상위 장비로 바꿔도 그립감이나 탄성이 줄지 않아요. 총기는 전용 탄환을 쓰며 화살 옵션이나 당긴 힘에 영향을 받지 않아요.</p></div></div></div><div class="help-note">본편은 5번 발사하면 한 판이 끝나요. 이번 판의 목표 점수를 달성하면 다음 단계로 갈 수 있어요. 부족하면 지금 단계에 다시 도전하거나 이전 단계로 돌아갈 수 있어요. 총 ${STAGES.length}개 미션에 도전해보세요. 본편을 5판 마칠 때마다 접시 사격 준비 화면이 열려요. 총기와 총알을 확인하고 ‘사격 시작’을 눌러야 제한 시간과 표적이 움직여요. 이벤트가 끝나면 직전에 마친 본편을 기준으로 이전·지금·다음 단계를 고를 수 있어요. 다음 단계는 그 본편 판의 목표를 달성했을 때 열려요. 초반에는 접시 2개가 천천히 나오고, 단계가 높아지면 최대 10개가 빠르게 나오며 후반에는 UFO도 등장해요. 보유 총알이 있으면 탄창을 비운 뒤 자동으로 장전돼요. 누적 5·10·15·…·50판 첫 달성 때 총알 20발을 받아요. 첫 달성 다음 날부터 하루 한 번, 총알이 19발 이하면 20발로 채워져요. 20발 이상이면 그대로이고, 같은 날 다시 지급하지 않아요. 구매한 총알도 잔량에 포함돼요. 추가 총알은 10발에 5쭈예요. 접시나 UFO를 1개 깨면 접시 점수 1개를 받아요. 이벤트가 끝나면 안정제 교환과 총기 구매·장착, 이어 할 단계 선택을 한 창에서 보여줘요. 접시 점수 5개로 안정제 1개를 교환하며, 접시 점수가 부족해도 총기를 구매할 수 있어요. 본편 목표를 달성했다면 다음 단계로 이어 갈 수 있어요. 상단 안정제 버튼에서 직접 사용하면 이번 판 남은 발사의 떨림이 절반으로 줄어요. 한 판에 한 번만 사용하며, 다음 판·다시 시작·새로고침에는 효과가 이어지지 않아요.<br>총알·쭈는 계정에, 장비·게임 코인·사격 기록·접시 점수·보유 안정제·코치 켜기/끄기는 현재 브라우저에 저장돼요.<br>PC: 방향키로 조준 · SPACE를 누르고 있다 놓으면 발사</div><button class="button primary-button" style="width:100%;margin-top:21px" data-action="close">시위 당기러 가기 ${icon('arrow')}</button>`,true);}
let shopTab='bow',shopWeaponFilter='all',shopSort='progression';
const formatCoins=value=>value.toLocaleString('ko-KR');
const formatStat=value=>String(Number(value.toFixed(2)));
const statRow=(label,value)=>`<div class="item-stat"><span>${label}</span><strong>${value}</strong></div>`;
const statMeter=(label,value)=>`${statRow(label,`${value} / 100`)}<div class="stat-track"><span style="width:${clamp(value,0,100)}%"></span></div>`;
function scopeOptionsMarkup(item,isOwned){
  if(!item.scopeMagnifications?.length)return '';
  const loadout=progress.scopeLoadouts[item.id],equipped=equippedScope(item.id);
  const options=item.scopeMagnifications.map(zoom=>{
    const name=SCOPES.find(scope=>scope.magnification===zoom)?.name||`${zoom}배 조준경`;
    const price=getScopePrice(item,zoom),owned=!!loadout?.owned.includes(zoom),selected=equipped===zoom;
    const disabled=!isOwned||selected||(!owned&&progress.coins<price);
    const label=selected?'장착 중':owned?'보유 · 무료 장착':`${formatCoins(price)} 코인`;
    return `<button type="button" class="button scope-button" data-install-scope="${item.id}" data-scope-zoom="${zoom}" aria-label="${item.name} · ${name} · ${label}" aria-pressed="${selected}" ${disabled?'disabled':''}><strong>${zoom}배</strong><small>${label}</small></button>`;
  }).join('');
  return `<div class="item-scope"><span>${equipped>1?`${equipped}배 조준경 장착 중`:'조준경 선택'}</span><small>${isOwned?'구매한 배율은 이 장비에 영구 귀속 · 무료로 교체':'무기를 먼저 구매하면 조준경을 장착할 수 있어요.'}</small><div class="scope-options">${options}</div></div>`;
}
function laserShopMarkup(item,isOwned){
  if(!canEquipLaser(item))return '';
  const owned=!!activeLaser(item.id),disabled=!isOwned||state.mode!=='ready'||(!owned&&progress.coins<LASER_PRICE);
  return `<button type="button" class="button laser-shop-button" data-install-laser="${item.id}" ${disabled?'disabled':''}><strong>${owned?'레이저 영점 조절':`레이저 구매 · ${formatCoins(LASER_PRICE)} 코인`}</strong><small>${state.mode!=='ready'?'다음 조준 전에 조절할 수 있어요':owned?'톱니를 돌려 사전 보정 · 손을 놓으면 발사':'이 석궁에 영구 귀속'}</small></button>`;
}
function showShop(tab=shopTab){
  if(guardAmmoAction())return;
  if(state.mode==='flight'||state.mode==='settling'){toast('이번 발사가 끝난 뒤 상점을 열 수 있어요.');return;}
  if(state.isEvent||!['bow','arrow'].includes(tab))tab='bow';
  shopTab=tab;
  const isBow=tab==='bow',catalog=isBow?BOWS.filter(item=>(item.weaponType==='gun')===!!state.isEvent):ARROWS;
  const sortOptions=isBow
    ?state.isEvent
      ?[['progression','성능순 · 기본 → 상위'],['magazine','탄창이 큰 순'],['reload','장전이 빠른 순'],['grip','그립감 높은 순']]
      :[['progression','성능순 · 기본 활 → 레어 석궁'],['grip','그립감 높은 순'],['elasticity','탄성 높은 순'],['steady','조준 안정 시간이 긴 순'],['grouping','3연발 집탄성이 높은 순']]
    :[['progression','성능순 · 기본 → 상위'],['wind','바람 영향 적은 순'],['stability','일관성이 높은 순'],['tip-light','촉이 가벼운 순'],['tip-heavy','촉이 무거운 순']];
  if(!sortOptions.some(([key])=>key===shopSort))shopSort='progression';
  const filtered=isBow&&!state.isEvent&&shopWeaponFilter!=='all'?catalog.filter(item=>shopWeaponFilter==='crossbow-single'?item.weaponType==='crossbow'&&item.burstCount===1:shopWeaponFilter==='crossbow-burst'?item.weaponType==='crossbow'&&item.burstCount>1:item.weaponType===shopWeaponFilter):catalog;
  const items=sortEquipment(filtered,shopSort);
  const owned=isBow?progress.ownedBows:progress.ownedArrows,equipped=state.isEvent?progress.eventGun:progress[tab];
  const b=activeBow(),a=activeArrow(),projectile=activeProjectile(),comboSpeed=getSpeed({bow:b,arrow:a,charge:1,velocityBias:0}).toFixed(1);
  const cards=items.map(item=>{
    const isOwned=owned.includes(item.id),isEquipped=item.id===equipped,gun=item.weaponType==='gun',burst=item.burstCount>1;
    const shortfall=Math.max(0,item.price-progress.coins),scope=isBow?scopeOptionsMarkup(item,isOwned):'',laser=isBow?laserShopMarkup(item,isOwned):'';
    const speed=getSpeed({bow:isBow?item:b,arrow:isBow?a:item,charge:1,velocityBias:0}).toFixed(1);
    let stats=isBow
      ?`${statMeter('그립감',item.grip)}${gun?'':statMeter('탄성',item.elasticity)}${statRow('조준 안정',`${formatSeconds(weaponSteadyDuration(item))}초`)}${statRow('발사 방식',burst?'레어 · 3연발':'단발')}`
      :`${statRow('촉',`${item.tip.material} · ${item.tip.shape}`)}${statRow('촉 무게',`${formatStat(item.tipMass)} g`)}${statRow('몸통',`${item.shaft.material} · ${formatStat(item.shaft.diameter)} mm`)}${statRow('몸통 무게',`${formatStat(item.shaftMass)} g`)}${statRow('깃',`${item.fletching.material} · ${item.fletching.name}`)}${statRow('깃 무게',`${formatStat(item.fletching.mass)} g`)}${statRow('총 무게',`${formatStat(getArrowMass(item))} g`)}${statRow('바람 영향',`${Math.round(getWindResponse(item)*100)}%`)}${statRow('감속 영향',`${Math.round(getArrowDragRate(item)/getArrowDragRate(ARROWS[0])*100)}%`)}${statRow('일관성',`${formatStat(getArrowConsistency(item))} / 100`)}${statRow('속도 편차',`±${Math.round(getArrowVariance(item)*1000)/10}%`)}`;
    if(isBow&&!gun&&item.gearLabel)stats=statRow('장비 등급',item.gearLabel)+stats;
    if(!isBow&&item.longRange)stats=statRow('권장 장거리',`${item.recommendedDistance}m · 속도·직진성 강화`)+stats;
    if(!isBow&&item.ability)stats=statRow('특수 능력',item.ability.label)+stats+statRow(item.ability.type==='bounce'?'반발':'유도',item.ability.type==='bounce'?'과녁 앞 · 1회':'중심 5m 이내');
    if(burst)stats+=`${statMeter('집탄성',item.grouping)}${statRow('3발 퍼짐',item.grouping>=90?'매우 좁음':item.grouping>=80?'좁음':item.grouping>=65?'보통':item.grouping>=45?'조금 넓음':'넓음')}`;
    if(gun)stats+=`${statRow('탄약',item.ammo.name)}${statRow('탄창',`${item.magazineSize}발`)}${statRow('장전',`${item.reloadLabel} · ${item.reloadSeconds.toFixed(1)}초`)}`;
    const combo=!isBow&&usingGun()?statRow('현재 총기에 적용','활·석궁 전용'):statRow(gun?'전용 탄환 기준':isBow?'현재 화살과 조합':'현재 활과 조합',`${speed} m/s`);
    const category=isBow?(gun?(item.magazineSize===10?'10발 탄창':`${item.magazineSize}발 · ${item.reloadLabel}`):item.weaponType==='crossbow'?(burst?'레어 3연발':'단발 석궁'):'활 · 단발'):item.tag;
    return `<article class="item-card ${isEquipped?'equipped':''} ${burst?'rare-item':''}" data-equipment="${tab}" data-equipment-id="${item.id}"><div class="item-art"><span class="item-tag">${String(item.shopRank).padStart(2,'0')} · ${category}</span><span class="item-owned">${isEquipped?'장착 중':isOwned?(adminTrialActive?'체험 가능':'보유 중'):''}</span><canvas data-item-art="${item.id}" width="420" height="180" aria-label="${item.name}"></canvas></div><h3>${item.name}</h3><p>${item.description}</p><div class="item-traits">${stats}</div><div class="item-combination">${combo}</div><div class="item-price"><span>가격</span><strong>${item.price===0?'기본 지급':`${formatCoins(item.price)} 코인`}</strong></div>${!isOwned&&shortfall?`<p class="item-budget">${formatCoins(shortfall)} 코인 더 필요해요</p>`:''}<div class="item-actions"><button class="button ${isEquipped?'':'primary-button'}" data-equip="${item.id}" ${isEquipped||(!isOwned&&shortfall)?'disabled':''}>${isEquipped?'장착 중':isOwned?'장착하기':`${icon('coin')}구매하고 장착`}</button></div>${scope}${laser}</article>`;
  }).join('');
  const filters=isBow&&!state.isEvent?`<div class="weapon-filters" aria-label="무기 종류">${[['all','전체 20종'],['bow','활 10종'],['crossbow','석궁 전체 10종'],['crossbow-single','단발 석궁 5종'],['crossbow-burst','레어 3연발 5종']].map(([type,label])=>`<button type="button" class="${shopWeaponFilter===type?'active':''}" data-weapon-filter="${type}">${label}</button>`).join('')}</div>`:'';
  const sorting=`<div class="shop-sort"><label for="shopSort">능력치 정렬</label><select id="shopSort" data-shop-sort aria-label="장비 정렬">${sortOptions.map(([key,label])=>`<option value="${key}" ${key===shopSort?'selected':''}>${label}</option>`).join('')}</select></div>`;
  const sortNotes=isBow?state.isEvent?{
    progression:'상위 총기일수록 그립감이 좋아지고 장전 시간이 짧아져요. 탄창은 2발 → 4발 → 6발 → 8발 → 10발로 늘고, 이전 성능은 떨어지지 않아요. 모든 총기의 출발 탄속은 같아요.',
    magazine:'탄창이 큰 순서예요. 한 번 장전해서 쏠 수 있는 발수를 비교하고, 다시 채우는 데 걸리는 시간도 함께 확인하세요.',
    reload:'장전 시간이 짧은 순서예요. 표시된 초가 작을수록 다음 탄창을 빨리 사용할 수 있어요.',
    grip:'그립감이 높은 순서예요. 그립감이 높을수록 조준 흔들림이 줄어요. 탄창과 장전 시간은 따로 비교하세요.'
  }:{
    progression:'활 10종 → 일반 단발 석궁 5종 → 레어 3연발 석궁 5종 순서예요. 그립감과 탄성이 번갈아 조금씩 높아지고, 이미 얻은 성능은 유지돼요. 조준 안정 시간도 0.5초에서 2초까지 길어져요.',
    grip:'그립감이 높은 순서예요. 그립감이 높을수록 조준 흔들림이 줄어요. 탄성과 조준 안정 시간은 따로 비교하세요.',
    elasticity:'탄성이 높은 순서예요. 탄성이 높을수록 빠르게 출발해요. 실제 속도는 당긴 힘과 화살의 속도 편차도 영향을 받아요.',
    steady:'조준 안정 시간이 긴 순서예요. 한 번 당길 때 한 번, 1~10초 안의 무작위 구간에서 그 시간만큼 흔들림이 멈춰요.',
    grouping:'레어 3연발 석궁을 집탄성이 높은 순서로 먼저 보여줘요. 높을수록 3발이 더 가까이 모여요. 집탄성 비교가 필요 없는 단발 장비는 그다음에 보여줘요.'
  }:{
    progression:'일반 화살 12종은 촉·몸통·깃을 함께 개선해요. 상위로 갈수록 총 무게는 조금씩 줄고, 기준 속도와 일관성은 좋아지며 바람 영향과 감속은 줄어요. 특수 화살은 최상위 일반 화살의 기본 성능에 서로 다른 능력을 더해요.',
    wind:'바람 영향이 작은 순서예요. 나무 화살을 100%로 비교해요. 몸통·깃이 받는 옆바람과 화살 전체 무게를 함께 반영해요.',
    stability:'화살 전체의 일관성이 높은 순서예요. 촉·몸통의 정밀도와 깃의 제어를 함께 반영하며, 높을수록 발사할 때마다 생기는 속도 편차가 작아요.',
    'tip-light':'촉이 가벼운 순서예요. 실제 발사 속도는 몸통·깃까지 합친 총 무게에 따라 달라져요. 전체 속도와 바람 영향도 함께 비교하세요.',
    'tip-heavy':'촉이 무거운 순서예요. 촉의 무게만으로 전체 성능을 판단할 수 없어요. 총 무게와 몸통·깃의 조합도 함께 비교하세요.'
  };
  const orderNote=sortNotes[shopSort];
  openModal('shop',`<p class="eyebrow">THE ARCHER'S WORKSHOP</p><h2 id="modalTitle">${state.isEvent?'총기 상점':'무기 상점'}</h2><p class="modal-subtitle">${adminTrialActive?'모든 장비가 체험용으로 열려 있어요. ':''}${state.isEvent?'이벤트 전용 총기 5종. 2·4·6·8·10발 탄창과 장전 속도를 비교해보세요.':isBow?'활 10종 · 석궁 10종. 총기 5종은 접시 사격 이벤트에서 만날 수 있어요.':'일반 12종 · 특수 2종 · 장거리 5종. 발사 속도와 감속, 권장 거리를 비교해보세요.'}</p><div class="shop-top"><div class="shop-tabs"><button class="${isBow?'active':''}" data-shop-tab="bow"> ${state.isEvent?'이벤트 총기 5종':'무기 20종'}</button>${state.isEvent?'':`<button class="${!isBow?'active':''}" data-shop-tab="arrow">화살 ${ARROWS.length}종</button>`}</div><div class="shop-coins">${icon('coin')}<strong>${formatCoins(progress.coins)}</strong></div></div><div class="shop-loadout"><span>지금의 조합</span><strong>${b.name}${hasScope()?` · ${equippedScope()}배 조준경`:''} + ${projectile.name}</strong><small>기준 발사속도 ${comboSpeed} m/s</small><small class="shop-loadout-steady">조준 안정 ${formatSeconds(weaponSteadyDuration(b))}초</small></div>${state.isEvent?`<button class="button ammo-shop-link" data-action="ammo-shop"><span>보유 총알 <strong>${ammoStockLabel()}</strong></span><span>${adminTrialActive?'체험 총알 안내 →':ammoOffer()?`${ammoOffer().amount}발 충전 · ${ammoOffer().price}쭈 →`:'총알 충전 →'}</span></button>`:""}${filters}${sorting}<p class="shop-order-note">${orderNote}</p><div class="shop-grid">${cards}</div><p class="shop-footnote">${state.isEvent?'총기는 접시·UFO 사격 이벤트 전용이에요. 탄창을 비우면 자동 장전하며 장전 중에는 발사할 수 없어요.<br>조준하고 손을 떼면 발사하며, 당기는 시간과 화살 옵션은 탄환 속도에 영향을 주지 않아요.<br>조준경을 지원하는 총기에는 기존처럼 3배 조준경을 달 수 있고, 해당 총기에 영구 귀속돼요.':isBow?'일반 석궁은 단발, 레어 석궁만 3연발이에요. 첫 화살은 조준한 방향으로 나가고, 나머지 두 발은 집탄성이 높을수록 더 가깝게 모여요.<br>3연발은 발사 기회 1회를 사용하고 세 발의 점수를 합산해 최대 30점을 받아요. 사람이 맞으면 그 발사 전체가 0점이에요.<br>활과 석궁은 같은 탄도 규칙을 써요. 성장 순서대로 그립·탄성·조준 안정 성능이 유지되거나 좋아져요.<br>총기는 전용 탄환을 사용하고 화살 옵션과 당긴 힘은 적용하지 않아요.<br>조준경은 2·3·6·8배예요. 성장 순서로 무기 다섯 종마다 2배 → 2·3배 → 2·3·6배 → 전 배율을 사용할 수 있어요.<br>구매한 배율은 해당 무기에 영구 귀속돼요. 같은 무기에서 보유한 배율을 바꿀 때는 무료이며, 다른 무기에는 새로 구매해야 해요.<br>레이저는 첫 석궁부터 석궁 10종에 각각 500코인으로 영구 귀속돼요. 조준 전에 톱니로 영점을 맞추고, 누른 동안 빨간 점으로 겨눈 뒤 손을 놓으면 발사해요. 레이저 사용 중에는 자동발사와 코치 안내가 쉬어요.':'바람·감속 영향은 나무 화살을 100%로 비교해요. 낮을수록 바람에 덜 밀리고 속도를 오래 유지해요.<br>촉·몸통·깃의 무게와 형태가 함께 성능을 만들어요. 큰 깃은 자세를 빨리 잡지만 저항도 늘어나므로 완성된 화살의 수치를 비교하세요.<br>상위 화살은 기준 속도와 일관성이 조금씩 좋아지고, 바람 영향과 감속은 줄어요. 금빛·은빛은 색상 마감이에요.<br>장거리 화살 5종은 60·80·100·120·150m에 맞춰 더 가벼워지고 저항이 줄어, 실제 속도가 높아지고 낙하가 줄어요.<br>탄성 화살은 과녁 앞 땅에서 한 번 튕기며 속도가 줄어요. 자석 화살은 실제 표적 중심 5m 안에서 조금 휘어요.<br>두 화살 모두 벽·기둥에 막히고, 총기에는 적용되지 않아요.'}<br>${state.isEvent?'전용 탄환의 출발 속도는 총기마다 같아요.':'표시 속도는 기준값이며 실제 발사에는 편차가 있어요.'}<br>${adminTrialActive?'모든 장비와 호환 조준경을 구매 없이 사용할 수 있어요. 총알과 안정제는 무제한이며, 체험이 끝나면 장비와 기록은 저장되지 않아요.':'게임에서 모은 코인으로 구매해요. 장비와 활·석궁 화살은 계속 사용할 수 있어요. 이벤트 총알은 발사할 때 1발씩 소모돼요.'}</p>`);
  for(const cv of document.querySelectorAll('[data-item-art]')){const item=items.find(entry=>entry.id===+cv.dataset.itemArt);drawEquipmentIcon(cv.getContext('2d'),cv.width,cv.height,{...item,kind:tab,tier:item.id,scopeMounted:isBow&&hasScope(item.id)});}
}
function toggleCoach(){
  if(state.modal!=='menu'||state.isEvent||laserEnabled())return;
  progress.coachEnabled=!progress.coachEnabled;state.coachReady=false;state.coachCueUntil=0;
  stopCoachVoice();setCoachCue(false);save();showMenu();
  $('modalContent').querySelector?.('[data-action="toggle-coach"]')?.focus();
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
  if(kind==='bow')setAimZoom(equippedScope());
  state.sway=createSway();state.guide=null;save();updateHeader();updateRound();showShop(kind);
}
function starsFor(score,goal){return score<goal?0:score>=44?3:score>=34?2:1;}
function stageChoiceMarkup(className){
  const level=mainStageForChoices(),busy=ammoLocked()||state.mode==='flight'||state.mode==='settling';
  const next=canAdvanceStage(),nextHint=level>=STAGES.length?'마지막 단계':next?`${level+1}단계`:mainRoundCleared()&&!stageAvailable(level+1)?'앞 단계 통과 후':'이번 판 통과 후';
  return `<div class="${className}" aria-label="이어 할 활쏘기 단계 선택"><button class="button stage-choice" data-action="previous-stage" data-game-result-play ${!stageAvailable(level-1)||busy?'disabled':''}><strong>이전 단계</strong><small>${level<=1?'첫 단계':`${level-1}단계`}</small></button><button class="button stage-choice" data-action="retry" data-game-result-play ${busy?'disabled':''}><strong>지금 단계</strong><small>${level}단계 다시</small></button><button class="button stage-choice primary-button" data-action="next-stage" data-game-result-play ${!next||busy?'disabled':''}><strong>다음 단계</strong><small>${nextHint}</small></button></div>`;
}
function eventRewardsMarkup(){
  if(adminTrialActive)return `<section class="event-rewards" aria-label="체험 계속하기"><p>총알·안정제 무제한 · 체험 기록은 저장되지 않아요.</p><div class="event-reward-actions"><button class="button primary-button" data-action="trial-events">다른 이벤트 체험</button><button class="button soft-button" data-action="result-shop">${icon('bag')}총기 교체</button></div></section>`;
  return `<section class="event-rewards" aria-label="이벤트 보상"><p>접시 점수 ${progress.clayCredits.toLocaleString('ko-KR')}개 · 안정제 ${progress.stabilizers.toLocaleString('ko-KR')}개 · ${formatCoins(progress.coins)}코인</p><div class="event-reward-actions"><button class="button primary-button" data-action="buy-stabilizer" ${canExchangeStabilizer()?'':'disabled'}>${icon('tonic')}안정제 · 접시 5개</button><button class="button soft-button" data-action="result-shop">${icon('bag')}총기 상점</button></div>${state.stabilizerNotice?`<p class="stabilizer-message" role="status">${state.stabilizerNotice}</p>`:''}</section>`;
}
function showResult(passed,bonus){
  state.resultSummary={passed,bonus};
  const event=state.isEvent,level=mainStageForChoices();
  const stars=starsFor(state.score,state.stage.goal),bestCount=(progress.eventBestByLevel[state.stage.eventLevel]||0)/10;
  const cleared=mainRoundCleared();
  const title=event?`표적 ${state.hits}개 격파!`:`${level}단계 ${cleared?'통과':'다시 도전'}`;
  const description=adminTrialActive?(event?'체험을 마쳤어요. 다른 이벤트와 총기도 자유롭게 비교해 보세요.':'체험 결과예요. 다른 장비나 사격장을 골라 계속 시험해 보세요.'):event?`활쏘기 ${level}단계에 이어 이벤트를 마쳤어요.<br>${cleared?'본편 목표를 달성했어요. 안정제와 총기를 준비한 뒤 이어 할 단계를 고르세요.':`본편에서 목표 ${mainGoalForChoices()}점을 달성해야 다음 단계로 갈 수 있어요. 지금 단계에 다시 도전하세요.`}`:
    cleared?'목표를 달성했어요. 이어 할 단계를 골라주세요.':`목표 ${state.stage.goal}점에 도달하지 못했어요. 지금 단계에 다시 도전해 보세요.`;
  const metrics=event?`<div><small>깨뜨린 표적</small><strong>${state.hits}</strong><em>개</em></div><div><small>발사한 탄환</small><strong>${state.used}</strong><em>발</em></div>`:`<div><small>이번 점수</small><strong>${state.score}</strong><em>/ ${roundMaxScore()}</em></div><div><small>명중 화살</small><strong>${state.arrowHits}</strong><em>/ ${roundMaxScore()/10}발</em></div>`;
  const note=adminTrialActive?'관리자 체험 · 점수·장비·코인은 저장되지 않아요.':event?`이번 이벤트 최고 ${bestCount}개 · 다음은 활쏘기 차례예요.`:bonus?`목표 달성 보너스 ${bonus}코인이 포함되어 있어요.`:'이번에 얻은 코인은 그대로 남아 있어요.';
  openModal('result',`<div class="result-content ${event?'event-result':''}"><div class="result-emblem">${icon(event||passed?'target':'wind')}</div><p class="eyebrow">${event?'YOUR EVENT RECORD':'YOUR NEXT SHOT'}</p><h2 id="modalTitle">${title}</h2><p>${description}</p>${event?'':`<div class="result-stars" aria-label="별 ${stars}개">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div>`}<div class="result-metrics">${metrics}<div><small>${adminTrialActive?'체험 코인':'획득 코인'}</small><strong>+${state.earned}</strong></div></div>${event?eventRewardsMarkup():''}${stageChoiceMarkup('result-actions stage-result-actions')}<p class="result-note">${note}</p>${ammo?.pending?'<button class="button soft-button" data-action="retry-ammo">이전 처리 다시 확인</button>':''}${event?'':`<button class="button soft-button result-shop-button" data-action="result-shop">${icon('bag')}무기 상점</button>`}${!event&&state.pendingEventLevel?'<button class="button primary-button" data-action="continue-event" data-game-result-play>접시 사격</button>':''}<button class="text-button" data-action="menu">메뉴</button></div>`,true);
  const content=window.OjjudaGameResults&&$('modalContent').querySelector?.('.result-content');
  if(!adminTrialActive&&window.OjjudaGameResults&&content){
    const extra=[...content.querySelectorAll('.event-rewards,[data-action="retry-ammo"],[data-action="continue-event"]')].filter(element=>!element.parentElement.closest('.event-rewards'));
    window.OjjudaGameResults.decorate(content,{game:'archery',outcome:event?'complete':cleared?'success':'failure',metric:event?`표적 ${state.hits}개 · ${state.used}발`:`${level}단계 · ${state.score} / ${state.stage.goal}점`,score:state.score,key:state.runId,actions:[content.querySelector('.stage-result-actions')],extra});
    const heading=content.querySelector('h2');if(heading)$('modal').setAttribute('aria-labelledby',heading.id);
    content.querySelector('[data-action="retry"]')?.focus();
  }
}
function showMenu(){
  if(trialBlocked())return;
  const level=mainStageForChoices(),event=state.isEvent,finished=state.mode==='finished';
  const action=(name,symbol,title,detail)=>`<button class="menu-action" data-action="${name}">${icon(symbol)}<span><strong>${title}</strong><small>${detail}</small></span></button>`;
  const choices=!event||finished?stageChoiceMarkup('menu-stage-actions'):'';
  const route=event?action('ammo-shop','coin',adminTrialActive?'체험 총알 무제한':'총알 충전',`보유 ${ammoStockLabel()}`):action('stages','grid','전체 단계',adminTrialActive?`전체 ${STAGES.length}단계 자유 선택`:`${progress.unlocked}단계까지 열림 · 클리어한 판 다시 하기`);
  const subtitle=adminTrialActive?'관리자 체험 · 모든 단계·장비 사용 · 기록 저장 안 함':event?`접시 사격 이벤트 ${state.stage.eventLevel}단계 · 활쏘기 5판마다 한 번`:`지금 ${level}단계 · 접시 사격 이벤트까지 ${5-progress.mainRounds%5}판`;
  const coachSetting=event?'':`<button class="menu-action" data-action="toggle-coach" aria-pressed="${!laserEnabled()&&progress.coachEnabled}" ${laserEnabled()?'disabled':''}>${icon('target')}<span><strong>${laserEnabled()?'코치 · 레이저 사용 중':`코치 ${progress.coachEnabled?'켜짐':'꺼짐'}`}</strong><small>${laserEnabled()?'레이저를 끄면 이전 코치 설정으로 돌아와요.':`무료 기본 기능 · 눌러서 ${progress.coachEnabled?'끄기':'켜기'}`}</small></span></button>`;
  openModal('menu',`<div class="game-menu"><p class="eyebrow">TAKE YOUR NEXT SHOT</p><h2 id="modalTitle">게임 메뉴</h2><p class="modal-subtitle">${subtitle}</p>${choices}<div class="menu-actions">${route}${adminTrialActive?action('trial-events','target','총기·이벤트 체험','1~10단계 자유 선택 · 총기 5종'):''}${action('stabilizers','tonic','안정제',adminTrialActive?'무제한 체험 · 이번 판 떨림 50%':`${progress.stabilizers}개 보유 · 이번 판 떨림 50%`)}<button class="menu-action" data-action="toggle-sound" aria-pressed="${progress.sound}">${icon(progress.sound?'sound':'mute')}<span><strong>소리 ${progress.sound?'켜짐':'꺼짐'}</strong><small>눌러서 ${progress.sound?'끄기':'켜기'}</small></span></button>${coachSetting}${action('help','help','게임 방법','조준·장비·이벤트 안내')}</div>${event&&!finished?`<button class="button soft-button menu-return" data-action="leave-event" ${ammoLocked()?'disabled':''}>활쏘기로 돌아가기</button>`:''}<button class="button primary-button" data-action="close">${finished?'결과로 돌아가기':'게임 계속하기'}</button></div>`,true);
}
function showTrialEvents(){
  if(!adminTrialActive||guardAmmoAction())return;
  if(state.mode==='flight'||state.mode==='settling'){toast('이번 발사가 끝나면 이벤트를 바꿀 수 있어요.');return;}
  const events=Array.from({length:10},(_,index)=>createClayEvent(index+1));
  openModal('trial-events',`<p class="eyebrow">관리자 아이템 체험</p><h2 id="modalTitle">총기·이벤트 체험</h2><p class="modal-subtitle">총기 5종과 조준경을 자유롭게 바꿔 써보세요. 총알과 안정제는 무제한이며, 장전 시간은 일반 게임과 같아요.</p><div class="trial-event-grid">${events.map(event=>`<button type="button" class="button" data-trial-event="${event.eventLevel}"><strong>이벤트 ${event.eventLevel}단계${event.eventLevel>=8?' · UFO':''}</strong><small>${event.targetsPerWave}개씩 등장 · ${event.eventDuration.toFixed(1)}초</small></button>`).join('')}</div><button class="button soft-button" data-action="stages">활·석궁 사격장 선택</button>`);
}
function showStages(){
  if(guardAmmoAction())return;
  if(state.mode==='flight'||state.mode==='settling'){toast('화살이 도착하면 사격장을 바꿀 수 있어요.');return;}
  const chapters=[];
  for(const stage of STAGES){
    const previous=chapters.at(-1);
    if(previous?.chapterId===stage.chapterId)previous.last=stage.id;
    else chapters.push({chapterId:stage.chapterId,first:stage.id,last:stage.id,name:stage.chapterName});
  }
  const ranges=STAGE_GEAR_BANDS.map((band,index)=>({...band,name:['기초','응용','심화','최종'][index]}));
  openModal('stages',`<p class="eyebrow">FOLLOW YOUR OWN TRAIL</p><h2 id="modalTitle">어느 숲길로 갈까요?</h2><p class="modal-subtitle">총 ${STAGES.length}개 미션 · 고정 과녁부터 이동·가림막·동물·복합 장애물까지 한 가지씩 익혀요. 121~220단계는 60·80·100·120·150m 장거리 미션이에요. 상위 활·석궁과 거리별 장거리 화살을 권장해요. ${adminTrialActive?'관리자 체험에서는 모든 단계를 자유롭게 선택할 수 있어요.':'앞 단계를 통과하면 다음 단계가 열려요. 클리어한 판은 다시 선택할 수 있어요.'}</p><nav class="stage-range-nav" aria-label="단계 구간">${ranges.map(range=>`<button type="button" data-stage-range="${range.first}" aria-label="${range.first}~${range.last}단계 ${range.gearLabel} 권장"><strong>${range.first}–${range.last}</strong><small>${range.name}</small></button>`).join('')}</nav><div class="stage-grid">${STAGES.map(s=>{const locked=!stageAvailable(s.id),best=progress.best[s.id]||0,stars=starsFor(best,s.goal),range=chapters.find(chapter=>chapter.chapterId===s.chapterId);return `${s.id===range.first?`<h3 class="stage-section-title" id="stage-chapter-${s.chapterId}">${String(s.id).padStart(2,'0')}–${range.last} · ${range.name}</h3>`:''}<button class="stage-card ${s.id===state.stage.id?'active':''}" id="stage-range-${s.id}" data-stage="${s.id}" ${locked?'disabled':''} aria-label="${s.id}단계 ${s.name}${locked?' 잠김':''}"><span class="stage-index">${String(s.id).padStart(2,'0')}${locked?' · 잠김':''}</span><strong>${s.name}</strong><small>${s.gearLabel}${s.longRange?` + ${s.distance}m 화살`:""} 권장</small><small>${s.distance}m · 목표 점수 ${s.goal}점</small><span class="stage-stars">${locked?'앞 단계를 통과하세요':'★'.repeat(stars)+'☆'.repeat(3-stars)}</span></button>`}).join('')}</div>`);
}
document.addEventListener('click',e=>{
  if(trialBlocked())return;
  const btn=e.target.closest('button');if(!btn||btn.disabled)return;
  if(btn.dataset.trialEvent!==undefined&&adminTrialActive){const level=Number(btn.dataset.trialEvent);if(Number.isInteger(level)&&level>=1&&level<=10)enterEvent(level);return;}
  if(btn.classList.contains('shop-open'))showShop();
  if(btn.dataset.shopTab)showShop(btn.dataset.shopTab);
  if(btn.dataset.weaponFilter&&['all','bow','crossbow','crossbow-single','crossbow-burst'].includes(btn.dataset.weaponFilter)){shopWeaponFilter=btn.dataset.weaponFilter;showShop('bow');}
  if(btn.dataset.equip!==undefined)equipItem(+btn.dataset.equip);
  if(btn.dataset.installScope!==undefined)installScope(Number(btn.dataset.installScope),Number(btn.dataset.scopeZoom));
  if(btn.dataset.installLaser!==undefined){installLaser(Number(btn.dataset.installLaser));return;}
  if(btn.dataset.laserAction==='open'){openLaserAdjustments();return;}
  if(btn.dataset.laserAction==='close'){closeLaserAdjustments(true);return;}
  if(btn.dataset.laserAction==='toggle'){toggleLaser();return;}
  if(btn.dataset.laserAction==='reset'){resetLaser();return;}
  if(btn.dataset.laserStep!==undefined){setLaserStep(Number(btn.dataset.laserStep));return;}
  if(btn.dataset.stageRange)$(`stage-range-${btn.dataset.stageRange}`)?.scrollIntoView?.({block:'start',behavior:'smooth'});
  if(btn.dataset.stage){if(state.mode==='flight'||state.mode==='settling'){toast('이번 화살이 도착하면 이동할 수 있어요.');return;}startStage(+btn.dataset.stage);}
  const act=btn.dataset.action;
  if(act==='trial-events')showTrialEvents();
  if(act==='start-event')startEvent();
  if(act==='continue-event'&&state.modal==='result'&&!state.isEvent&&state.mode==='finished'&&state.pendingEventLevel)enterEvent(state.pendingEventLevel);
  if(act==='ammo-shop')showAmmoShop();
  if(act==='buy-ammo')buyAmmo();
  if(act==='buy-stabilizer')buyStabilizer();
  if(act==='toggle-coach')toggleCoach();
  if(act==='use-stabilizer')useStabilizer();
  if(act==='retry-ammo')retryAmmo();
  if(act==='close')closeModal();
  if(['retry','previous-stage','next-stage','next'].includes(act)&&['result','menu'].includes(state.modal))navigateStage(act==='retry'?0:act==='previous-stage'?-1:1);
  if(act==='leave-event')exitEvent();
  if((act==='event-shop'||act==='result-shop')&&['result','event-ready'].includes(state.modal))showShop('bow');
  if(act==='menu')showMenu();
  if(act==='stages')showStages();
  if(act==='help')showHelp();
  if(act==='stabilizers')showStabilizers();
  if(act==='toggle-sound'&&state.modal==='menu'){progress.sound=!progress.sound;save();updateHeader();showMenu();if(progress.sound)sound('hit');$('modalContent').querySelector?.('[data-action="toggle-sound"]')?.focus();}
});
document.addEventListener('change',e=>{
  if(trialBlocked())return;
  if(e.target.id!=='shopSort'||state.modal!=='shop')return;
  const returnFocus=state.lastFocus;
  shopSort=e.target.value;showShop(shopTab);state.lastFocus=returnFocus;$('shopSort').focus();
});
$('menuBtn').addEventListener('click',showMenu);$('modalClose').addEventListener('click',closeModal);
$('ammoShopBtn').addEventListener('click',showAmmoShop);$('ammoRetryBtn').addEventListener('click',retryAmmo);
$('stabilizerBtn').addEventListener('click',showStabilizers);
$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))closeModal();});
$('zoomBtn').addEventListener('click',()=>{if(trialBlocked()||state.modal||ammoLocked()||state.mode==='flight'||state.mode==='settling'||state.mode==='preview')return;cancelDraw();setAimZoom(state.zoom===1?maximumZoom():1);updateZoomControl();});
$('recenterBtn').addEventListener('click',()=>{if(trialBlocked()||ammoLocked()||state.mode==='flight'||state.mode==='settling'||state.mode==='preview')return;cancelDraw();recenter();});
$('previewBtn').addEventListener('click',()=>{if(!trialBlocked())state.mode==='preview'?returnFromPreview():beginTargetPreview();});
document.addEventListener('keydown',e=>{
  if(trialBlocked())return;
  if(e.code==='Escape'){if(state.laserAdjustOpen){e.preventDefault();closeLaserAdjustments(true);}else if(state.modal)closeModal();else cancelDraw();return;}
  if(state.modal){
    if(e.code==='Tab'){const focusable=[...$('modal').querySelectorAll('button:not(:disabled):not(.hidden),select:not(:disabled),[tabindex="0"]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    return;
  }
  if(e.code.startsWith('Arrow')){e.preventDefault();keys.add(e.code);}
  if(e.code==='Space'&&!e.repeat&&!(document.activeElement?.tagName==='BUTTON')){e.preventDefault();beginDraw();}
});
document.addEventListener('keyup',e=>{if(trialBlocked())return;keys.delete(e.code);if(e.code==='Space'&&!state.modal&&!pointer){e.preventDefault();releaseShot();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelDraw();else void refreshAmmoStatus();lastFrame=performance.now();});
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
  if(target.kind==='clay')drawClay(ctx,p.x,p.y,r,renderTime(),target.direction);
  else if(target.kind==='ufo')drawUfo(ctx,p.x,p.y,r,renderTime(),target.direction);
  else if(target.kind!=='target'){
    if(['bird','pigeon','eagle'].includes(target.kind))ellipse(ground.x,ground.y,r*.7,Math.max(1,r*.05),'#334b2413');
    drawAnimal(ctx,p.x,p.y,r,target.kind,target.poseTime??renderTime(),target.direction,target);
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
  if(state.mode==='drawing'&&laserEnabled())return;
  const p=screenAim(),held=state.mode==='drawing',steady=isSteady();
  const scoped=hasScope()&&state.zoom===equippedScope();
  const radius=scoped?4:held?10:8;ctx.save();ctx.lineCap='round';
  if(scoped){
    circle(p.x,p.y,43,'#b3d0b209','#314d3c66',1.2);
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){line(p.x+dx*19,p.y+dy*19,p.x+dx*39,p.y+dy*39,'#244532b3',1);}
    ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillStyle='#284833';ctx.fillText(`${equippedScope()}×`,p.x,p.y+58);
  }
  circle(p.x,p.y,radius,null,'#23372a66',2.7);circle(p.x,p.y,radius,null,held?'#fffceb':'#fffcebcc',1.2);
  for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){line(p.x+dx*(radius+4),p.y+dy*(radius+4),p.x+dx*(radius+9),p.y+dy*(radius+9),'#263b2a77',2.5);line(p.x+dx*(radius+4),p.y+dy*(radius+4),p.x+dx*(radius+9),p.y+dy*(radius+9),'#fffce3e6',1.1);}
  circle(p.x,p.y,1.7,'#fffbe6','#34483188',.7);
  if(held){ctx.beginPath();ctx.arc(p.x,p.y,16,-Math.PI/2,-Math.PI/2+Math.PI*2*state.charge);ctx.strokeStyle=steady?'#caffbc':state.held>2.6?'#e8a776':'#e2c276';ctx.lineWidth=steady?3:2;ctx.stroke();}
  ctx.restore();
}
function drawGuide(){
  if(state.mode!=='drawing'||state.stage.id>3||state.isEvent||laserEnabled())return;
  if(!state.guide||state.time-state.guideAt>.055){state.guide=predictTrajectory(shotParams(),state.stage,state.time,4);state.guideAt=state.time;}
  ctx.save();ctx.lineCap='round';ctx.setLineDash([2,7]);ctx.strokeStyle='#fffbdd9c';ctx.lineWidth=1.4;ctx.beginPath();let began=false;
  for(const point of state.guide.points){if(point.z<2)continue;const p=project(point);if(!p.visible)continue;if(!began){ctx.moveTo(p.x,p.y);began=true;}else ctx.lineTo(p.x,p.y);}
  ctx.stroke();ctx.setLineDash([]);
  const result=state.guide.result;
  if(result){const p=project(result.point);circle(p.x,p.y,result.type==='hit'?4:3,null,result.type==='hit'?'#fff9bd':'#fff9d77c',1.5);}
  ctx.restore();
}
function drawLaser(){
  const frame=laserFrame();canvas.dataset.laser=frame?state.mode:'off';
  if(!frame){for(const key of ['laserX','laserY','laserZ','laserScreenX','laserScreenY','laserBlocked'])delete canvas.dataset[key];return;}
  for(const axis of ['x','y','z'])canvas.dataset[`laser${axis.toUpperCase()}`]=String(frame.point[axis]);
  canvas.dataset.laserBlocked=String(frame.blocked);
  const point=project(frame.point);canvas.dataset.laserScreenX=String(point.x);canvas.dataset.laserScreenY=String(point.y);
  if(!point.visible||point.x<-10||point.x>w+10||point.y<-10||point.y>h+10)return;
  ctx.save();ctx.shadowColor='#ff263f';ctx.shadowBlur=12;circle(point.x,point.y,4,'#ff3048');ctx.shadowBlur=0;
  circle(point.x,point.y,1.4,'#fff1ec');circle(point.x,point.y,7,null,'#ff345b70',1);ctx.restore();
}
// Every shaft and trail is split at occluder planes before painter sorting.
// The actual target silhouette hides only the parts that are behind it.
function sceneItems(target){
  const replay=cinematicFrame(),time=renderTime(),people=passersAt(state.stage,time);
  const planes=[target.z,...[...state.stage.obstacles,...people].flatMap(ob=>[ob.z-ob.depth/2,ob.z+ob.depth/2])];
  // An arrow belongs to the animal it hit, even after the next animal enters.
  const targets=new Map((state.isEvent?eventTargetsAt(state.stage,time):[target]).map(subject=>[subject.passId,subject]));
  for(const mark of state.targetMarks)if(mark.passId!==undefined&&!targets.has(mark.passId))targets.set(mark.passId,targetAt(state.stage,time,mark.passId));
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
    if(tail.z>camera.z+NEAR_PLANE)items.push({kind:'feather',z:surfaceDepth(tail),order:3,point:tail,tip,alpha,visualVelocity:velocity});
    items.push({kind:'tip',z:surfaceDepth(tip),order:4,point:tip,tail,alpha,flying,visualVelocity:velocity});
  };
  for(const stuck of state.stuck)if((stuck.born??0)<=time+1e-9)addArrow(stuck,stuck.velocity||{x:0,y:-.5,z:1},.75,false,stuck.projectileType);
  // Keep every hit in target-local coordinates, including each animal pass.
  // Only the celebrated shaft flexes around its fixed tip for 0.60 seconds.
  // The saved entry velocity and all physical attachments remain untouched.
  for(const mark of state.targetMarks){
    if((mark.born??0)>time+1e-9||(replay?.phase==='flight'&&mark===state.cinematic.shot.targetMark))continue;
    let visualVelocity=mark.velocity||{x:0,y:-.2,z:1};
    if(replay&&!replay.reducedMotion&&mark===state.cinematic.shot.targetMark&&replay.impactAge>=0&&replay.impactAge<.60){
      const age=replay.impactAge,decay=(1-age/.60)**2;
      const yaw=.085*Math.sin(age*Math.PI*22)*decay,pitch=.05*Math.sin(age*Math.PI*26)*decay;
      const side=visualVelocity.x*Math.cos(yaw)+visualVelocity.z*Math.sin(yaw),forward=visualVelocity.z*Math.cos(yaw)-visualVelocity.x*Math.sin(yaw);
      visualVelocity={x:side,y:visualVelocity.y*Math.cos(pitch)-forward*Math.sin(pitch),z:forward*Math.cos(pitch)+visualVelocity.y*Math.sin(pitch)};
    }
    const subject=targets.get(mark.passId)||target;
    const attached=(mark.animal&&getAnimalAttachmentPoint(subject,mark.animal))||{x:subject.x+mark.x,y:subject.y+mark.y,z:subject.z};
    addArrow({...attached,z:attached.z-.002},visualVelocity,1,false,mark.projectileType);
  }
  if(replay?.phase==='flight'){
    const points=state.cinematic.frames.filter(frame=>frame.time<=replay.time).slice(-36).map(frame=>frame.point);
    points.push(replay.point);
    for(let i=1;i<points.length;i++)addLine(points[i-1],points[i],'trail',.9);
    addArrow(replay.point,replay.velocity,1,true);
  }
  for(const shot of !replay?(state.isEvent?state.eventShots:state.volley?.shots||[state.shot]):[])if(shot&&shot.launched!==false&&(state.isEvent||state.mode==='flight'||state.mode==='settling')){
    const alpha=state.isEvent?(shot.active?1:Math.max(0,1-(state.time-shot.resolvedAt)/.7)):state.mode==='settling'?Math.max(0,1-state.settle/(IMPACT_HOLD+RETURN_DURATION)):1;
    const points=[...shot.trail,shot.position];
    for(let i=1;i<points.length;i++)addLine(points[i-1],points[i],'trail',alpha);
    if((state.isEvent||state.mode==='flight')&&shot.active)addArrow(shot.position,shot.velocity,1,true,shot.projectileType);
  }
  for(const effect of state.effects)if(effect.born<=time+1e-9)items.push({kind:'effect',z:effect.z-.002,order:5,effect});
  return items.sort((a,b)=>b.z-a.z||a.order-b.order);
}
function drawSceneItem(item){
  if(item.kind==='target'){drawTarget(item.target);return;}
  if(item.kind==='wall'){drawWall(item.ob);return;}
  if(item.kind==='person'){drawPasser(ctx,item.person,{project,camera,nearPlane:NEAR_PLANE,time:renderTime()});return;}
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
    const effect=item.effect,replay=cinematicFrame(),age=renderTime()-effect.born,q=project(effect);
    if(replay&&effect===state.cinematic.shot.impactEffect){
      const mark=state.cinematic.shot.targetMark,subject=targetAt(state.stage,replay.time,mark?.passId);
      const impact=mark?project({x:subject.x+mark.x,y:subject.y+mark.y,z:subject.z-.002}):q;
      if(impact.visible&&replay.phase!=='flight')drawBullseyeImpact(ctx,w,h,{x:impact.x,y:impact.y,age:replay.impactAge,scale:clamp(impact.scale/85,.65,1.5),reducedMotion:state.cinematic.reducedMotion});
    }else if(q.visible&&age>=0&&age<1.5){
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
  const replay=cinematicFrame(),time=renderTime();
  drawScenery(ctx,w,h,{time,stage:state.stage,project,camera});
  const target=targetAt(state.stage,time);
  for(const item of sceneItems(target))drawSceneItem(item);
  drawGuide();
  if(state.mode==='ready'||state.mode==='drawing'){const sway=effectiveSway();drawFirstPersonBow(ctx,w,h,{charge:state.charge,swayX:sway.x,swayY:sway.y,color:activeBow().color,weaponType:activeBow().weaponType,scopeMounted:hasScope(),tier:activeBow().id,burstCount:activeBow().burstCount,grouping:activeBow().grouping,grip:activeBow().grip,elasticity:activeBow().elasticity,tipMass:activeArrow().tipMass,fletching:activeArrow().fletching,arrowColor:activeArrow().color,drawing:state.mode==='drawing'});}
  drawReticle();drawLaser();
  if(replay)drawBullseyeVignette(ctx,w,h,{age:state.settle,duration:impactHold()+impactReturn(),impactAge:replay.phase==='flight'?-1:replay.impactAge,entryMask:replay.entryMask,reducedMotion:state.cinematic.reducedMotion});
  canvas.dataset.scope=hasScope()?((state.mode==='ready'||state.mode==='drawing')&&state.zoom===equippedScope()?'active':'mounted'):'none';
  canvas.dataset.scopeMagnification=String(equippedScope());canvas.dataset.scopeZoom=String(state.zoom);
  canvas.dataset.cinematic=replay?.phase??'none';
  canvas.dataset.camera=replay?(replay.phase==='return'?'return':`bullseye-${replay.phase}`):state.mode==='preview'?'preview':state.mode==='flight'?'follow':state.mode==='settling'?(state.settle>impactHold()?'return':'impact'):'aim';
}
let hudMode='',hudPercent=-1,gunReloadUi={};
function updateGunReload(reloading){
  if(!state.isEvent){gunReloadUi={};return;}
  const weapon=activeBow(),loading=state.ammoLoading||ammoRemaining()===null;
  const phase=state.mode==='finished'?'finished':loading?'loading':reloading?'reloading':state.magazine>0?'ready':'empty';
  const labels={finished:'이벤트 종료',loading:'탄창 확인 중',reloading:'장전 중',ready:'사격 준비',empty:'탄창 비어 있음'};
  const time=reloading?`${state.reloadRemaining.toFixed(1)}초`:`탄창 ${state.magazine} / ${weapon.magazineSize}발`;
  const percent=reloading?Math.round(clamp(1-state.reloadRemaining/weapon.reloadSeconds,0,1)*100):state.magazine>0?100:0;
  if(gunReloadUi.phase!==phase){
    // Only the phase label is live; the countdown never announces every frame.
    $('gunReloadLabel').textContent=labels[phase];
    $('gunReload').classList.toggle('reloading',phase==='reloading');
  }
  if(gunReloadUi.time!==time)$('gunReloadTime').textContent=time;
  if(gunReloadUi.percent!==percent||gunReloadUi.phase!==phase){
    $('gunReloadFill').style.width=`${percent}%`;
    $('gunReloadProgress').setAttribute('aria-valuenow',String(percent));
    $('gunReloadProgress').setAttribute('aria-valuetext',reloading?`장전 ${percent}%`:labels[phase]);
  }
  gunReloadUi={phase,time,percent};
}
function updatePower(){
  updateLaunchAngle();
  updateLaserPanel();
  if(state.modal==='stabilizer')renderStabilizers();
  const eventWaiting=state.isEvent&&!state.eventStarted;
  const reloading=state.isEvent&&state.reloadRemaining>0,drawing=state.mode==='drawing',steady=isSteady(),replay=cinematicFrame(),laser=laserEnabled();
  touchpad.dataset.laser=laser?'true':'false';
  $('flightBadge').classList.toggle('bullseye',replay?.phase==='impact');
  updateGunReload(reloading);
  const steadySeconds=formatSeconds(drawing?state.steadyDuration:weaponSteadyDuration());
  const ammoWait=state.isEvent&&(state.ammoLoading||!!state.pendingAmmoShot||!!ammo?.pending||ammoRemaining()===null),empty=state.isEvent&&ammoRemaining()===0;
  const preparing=preparingMainRound();
  const percent=reloading?Math.round(100*(1-state.reloadRemaining/activeBow().reloadSeconds)):drawing?Math.round(state.charge*100):0;
  if(percent!==hudPercent){$('powerFill').style.width=`${percent}%`;$('powerValue').textContent=`${percent}%`;hudPercent=percent;}
  $('drawTiming').classList.toggle('steady',steady);canvas.classList.toggle('steady',steady);
  const settlingAim=drawing&&!steady&&drawElapsed()>=state.steadyStart-STEADY_SETTLE_SECONDS&&drawElapsed()<state.steadyStart;
  $('steadyLabel').textContent=reloading?'탄창을 채우고 있어요':steady?`지금! ${steadySeconds}초 조준 안정`:settlingAim?'서서히 안정되는 중':drawing&&drawElapsed()>=state.steadyStart+state.steadyDuration?'안정 구간 끝 · 타이밍을 잡으세요':`1~10초 사이, 한 번은 ${steadySeconds}초 안정`;
  $('autoReleaseLabel').textContent=reloading?'자동 장전':laser?'손 떼면 발사':drawing?`자동발사까지 ${(Math.ceil(Math.max(0,DRAW_LIMIT-drawElapsed())*10)/10).toFixed(1)}초`:state.isEvent?`탄창 ${state.magazine}/${activeBow().magazineSize}`:state.mode==='flight'&&state.shot?.automatic?'10초 · 자동발사':'최대 10초';
  if(state.isEvent){
    const remaining=Math.max(0,state.stage.eventDuration-state.time);
    $('flightBadge').classList.toggle('hidden',state.mode==='finished');
    $('flightBadge').textContent=eventWaiting?`이벤트 ${state.stage.eventLevel} · 시작 대기`:`이벤트 ${state.stage.eventLevel} · ${state.stage.targetsPerWave}개씩 · ${remaining.toFixed(1)}초`;
    const ammoKey=`${state.magazine}/${activeBow().magazineSize}/${reloading}`;
    if(state.ammoHud!==ammoKey){state.ammoHud=ammoKey;$('shotDots').innerHTML=Array.from({length:activeBow().magazineSize},(_,i)=>`<i class="ammo-dot ${i>=state.magazine?'used':''}"></i>`).join('');$('shotCountLabel').textContent=`${state.magazine} / ${activeBow().magazineSize}발${reloading?' · 장전 중':''}`;}
  }else if(state.mode==='flight'){
    const effect=state.shot.bounceCount>0?'1회 튕김 · ':state.shot.magnetActive?'근접 유도 · ':'';
    $('flightBadge').textContent=`${effect|| (state.volley?`3연발 ${state.volley.shots.filter(shot=>shot.launched).length}/3 · `:'화살 추적 · ')}${Math.max(0,Math.round(state.shot.position.z))} m 비행 중`;
  }else if(state.mode==='settling'&&state.cinematic){
    $('flightBadge').textContent=replay?.phase==='flight'?'명중 순간 · 화살을 따라':replay?.phase==='impact'?'✦ 정중앙! 10점 ✦':'멋진 한 발 · 조준 화면으로';
  }
  $('previewBtn').textContent=state.mode==='preview'?'조준하기':'과녁 보기';
  $('previewBtn').disabled=state.mode==='flight'||state.mode==='settling'||state.mode==='finished';
  touchpad.setAttribute('aria-disabled',eventWaiting||reloading||ammoWait||empty||preparing||state.roundSaving||!['ready','drawing'].includes(state.mode)?'true':'false');
  const fatigue=drawing&&state.held>2.6;
  $('powerFill').style.background=reloading?'#829b9d':steady?'#5f9a70':fatigue?'#c58f66':'#a4b374';
  const coachCue=drawing&&!state.isEvent&&!laser&&progress.coachEnabled&&performance.now()<state.coachCueUntil;
  setCoachCue(coachCue);
  const mode=state.mode+activeBow().id+(laser?'laser':'')+(replay?.phase??'')+(coachCue?'coach':'')+(eventWaiting?'event-wait':'')+(state.roundSaving?'saving':preparing?'preparing':ammoWait?'ammo-wait':empty?'empty':reloading?'reload':steady?'steady':fatigue?'tired':'');
  canvas.dataset.mode=state.mode;
  if(mode===hudMode)return;hudMode=mode;
  touchpad.setAttribute('aria-label',`${laser?'사격장 전체 조준 영역. ':'화면 아래 3분의 1 조준 영역. '}손가락을 움직인 방향과 거리만큼 위쪽 ${laser?'빨간 레이저 점':'조준점'}이 움직이며 손을 떼면 발사. 흔들림이 서서히 줄어들어 1초에서 10초 사이에 한 번 ${steadySeconds}초간 멈추고, 안정 시간이 끝나면 바로 다시 흔들립니다. ${laser?'조준 영역을 누르면 레이저가 사격장 가운데에서 시작합니다. 레이저를 사용하는 동안에는 자동으로 발사하지 않습니다. 영점은 조준 전에만 조절할 수 있습니다.':'10초가 되면 자동발사합니다.'} 키보드는 화살표로 조준, 스페이스를 누른 후 떼어 발사.`);
  canvas.classList.toggle('drawing',drawing);canvas.classList.toggle('flying',reloading||state.mode==='flight'||state.mode==='settling'||state.mode==='preview');
  if(state.roundSaving){
    if(adminTrialActive){$('powerLabel').textContent='체험 결과 확인 중';$('controlTitle').textContent='이번 판을 마무리해요';$('controlHint').textContent='체험 점수는 저장되지 않아요';return;}
    $('powerLabel').textContent='완료 기록 저장 중';$('controlTitle').textContent='이번 판을 계정에 기록해요';$('controlHint').textContent='5판마다 첫 달성 총알 20발을 확인합니다';
  }else if(preparing){
    $('powerLabel').textContent='사격장 준비 중';$('controlTitle').textContent='곧 첫 화살을 쏠 수 있어요';$('controlHint').textContent='연결이 늦어지면 아래 다시 확인을 눌러 주세요';
  }else if(eventWaiting){
    $('powerLabel').textContent='접시 사격 시작 대기';$('controlTitle').textContent='준비되면 시작 버튼을 눌러 주세요';$('controlHint').textContent='시작하기 전에는 제한 시간이 줄지 않아요';
  }else if(ammoWait){
    $('powerLabel').textContent='총알 확인 중';$('controlTitle').textContent=state.pendingAmmoShot?'놓은 방향 그대로 발사를 확인해요':'계정의 총알을 확인해요';$('controlHint').textContent='확인하는 동안 이벤트 시간은 줄지 않아요';
  }else if(empty){
    $('powerLabel').textContent='보유 총알 0발';$('controlTitle').textContent='총알을 충전해 주세요';$('controlHint').textContent='메뉴에서 활쏘기로 돌아갈 수 있어요';
  }else if(reloading){
    $('powerLabel').textContent='자동 장전 중';$('controlTitle').textContent=`${activeBow().magazineSize}발을 다시 채워요`;$('controlHint').textContent='장전이 끝나면 바로 쏠 수 있어요';
  }else if(drawing){
    $('powerLabel').textContent=steady?'조준 안정 · 흔들림 없음':fatigue?'팔이 떨리고 있어요':usingGun()?'발사 준비 완료':'시위를 당기는 중';$('controlTitle').textContent=steady?'지금은 흔들리지 않아요':'손을 떼는 순간, 발사';$('controlHint').textContent=laser?'빨간 점으로 조준 · 원하는 순간에 손을 놓으세요':steady?'방향을 조절하고 원하는 순간에 쏘세요':fatigue?'10초가 되면 자동으로 발사돼요':'움직인 만큼 조준 · 손을 떼면 발사';
  }else if(state.mode==='preview'){
    $('powerLabel').textContent='과녁 위치를 확인해요';$('controlTitle').textContent='장애물 너머 과녁을 기억하세요';$('controlHint').textContent='곧 사격 위치로 돌아가요 · 과녁 보기로 다시 확인할 수 있어요';
  }else if(state.mode==='flight'){
    $('powerLabel').textContent='화살이 날아가고 있어요';$('controlTitle').textContent='화살을 따라가고 있어요';$('controlHint').textContent='궤적과 떨어지는 위치를 보고 다음 한 발을 준비해요';
  }else if(replay&&replay.phase!=='return'){
    $('powerLabel').textContent=replay.phase==='flight'?'명중 순간을 따라가요':'정중앙! 완벽한 한 발';$('controlTitle').textContent=replay.phase==='flight'?'과녁을 향해, 마지막 순간':'정중앙에 꽂혔어요';$('controlHint').textContent=replay.phase==='flight'?'':state.volley?`이 화살 10점 · 3연발 합계 ${state.shotScores.at(-1)}점`:'10점 · 멋진 한 발!';
  }else if(state.mode==='settling'){
    $('powerLabel').textContent='다음 한 발을 준비해요';$('controlTitle').textContent='호흡을 가다듬고, 다시 한 발';$('controlHint').textContent='곧 다음 화살을 쏠 수 있어요';
  }else{
    $('powerLabel').textContent=usingGun()?'움직이는 표적의 앞을 겨눠요':'활을 당겨보세요';$('controlTitle').textContent=laser?'사격장을 누르고 끌어 조준':'화면 아래 1/3을 끌어 조준';$('controlHint').textContent=state.isEvent?'탄창을 비우면 자동 장전 · 접시와 UFO를 노려요':laser?'누르면 빨간 점이 가운데에서 시작 · 끌어 조준하고 손을 놓으면 발사':state.practiceOnly?'저장 없이 연습 중 · 계정 총알 보상 제외':activeBow().burstCount>1?`레어 석궁 · 3연발 · ${steadySeconds}초 안정`:`${steadySeconds}초 안정 기회 · 10초 후 자동발사`;
  }
}
function tick(now){
  if(trialBlocked())return;
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
      if(state.mode==='drawing'&&!laserEnabled()&&drawElapsed(now)>=DRAW_LIMIT)releaseShot(true,now);
    }
    if(state.isEvent){
      if(state.eventStarted&&state.mode!=='finished'&&!state.pendingAmmoShot&&!state.ammoLoading&&!ammo?.pending)stepEvent(dt,now);
    }else if(state.mode==='preview'){
      state.time+=dt;state.previewElapsed+=dt;
      if(state.previewElapsed>=PREVIEW_RISE+PREVIEW_HOLD+PREVIEW_RETURN){state.mode='ready';state.previewReturnCamera=null;keys.clear();$('flightBadge').classList.add('hidden');}
    }else if(state.mode==='flight'){
      // Targets, wind leaves and the arrow share one real-time simulation clock.
      // Work out this delta AFTER a possible real-time ten-second auto release.
      const flightDt=Math.min(dt,Math.max(0,(now-(state.volley?.startedAt??state.shot.startedAt))/1000))*FLIGHT_TIME_SCALE;
      if(state.volley){
        const volley=state.volley,begin=volley.elapsed,end=begin+flightDt,worldStart=state.time;
        let usedTime=0;
        for(const shot of volley.shots){
          if(!shot.active||shot.launchDelay>end)continue;
          const offset=Math.max(0,shot.launchDelay-begin),duration=flightDt-offset;
          if(duration<=0)continue;
          if(!shot.launched){shot.launched=true;rememberFlight(shot,worldStart+offset);sound('shoot');}
          const before=shot.elapsed,result=stepArrow(shot,duration,state.stage,worldStart+offset);
          const consumed=offset+shot.elapsed-before;usedTime=Math.max(usedTime,consumed);
          rememberFlight(shot,worldStart+consumed);
          if(result)recordImpact(shot,worldStart+consumed);
        }
        const flying=volley.shots.some(shot=>shot.active),elapsed=flying?flightDt:usedTime;
        state.time+=elapsed;volley.elapsed+=elapsed;moveAttachedArrows();
        if(!flying)onImpact();
        else state.shot=volley.shots.find(shot=>shot.launched&&shot.active)||volley.shots.find(shot=>shot.launched)||volley.shots[0];
      }else{
        const before=state.shot.elapsed,result=stepArrow(state.shot,flightDt,state.stage,state.time);
        state.time+=state.shot.elapsed-before;
        rememberFlight(state.shot,state.time);
        if(result)onImpact();
      }
    }else if(state.mode==='settling'){
      if(!state.cinematic)state.time+=dt*FLIGHT_TIME_SCALE;
      state.settle+=dt;
      if(state.cinematic&&!state.cinematic.soundPlayed&&state.settle>=state.cinematic.flightDuration){
        state.cinematic.soundPlayed=true;$('shotFeedback').classList.remove('hidden');sound('bull');if(navigator.vibrate)navigator.vibrate([18,35,28]);
      }
      moveAttachedArrows();
      if(state.settle>=impactHold()+impactReturn()){
        if(state.cinematic){state.effects=state.effects.filter(effect=>effect!==state.cinematic.shot.impactEffect);state.cinematic=null;}
        // Retire actual person hits only when the whole trigger has settled.
        // Every arrow in a burst still faces the same people this turn.
        for(const shot of state.volley?.shots||[state.shot])if(shot?.result?.type==='person')retirePasser(state.stage,shot.result.personId);
        $('flightBadge').classList.add('hidden');state.returnCamera=null;camera=aimCamera();
        if(state.used>=shotLimit())finishRound();else{state.mode='ready';state.held=0;state.charge=0;}
      }
    }else state.time+=dt;
    if(state.mode==='drawing')updateCoach(now);
    updateCamera(dt);
    if(state.feedbackUntil&&state.time>state.feedbackUntil){$('shotFeedback').classList.add('hidden');state.feedbackUntil=0;}
    state.effects=state.effects.filter(e=>state.time-e.born<1.6);
  }
  render();updatePower();requestAnimationFrame(tick);
}
function createTrialAmmoClient(){
  let rounds=0,disposed=false;
  const runs=new Map();
  const snapshot=()=>Object.freeze({remaining:CONSUMABLE_LIMIT,main_rounds:rounds,milestones_granted:0,daily_eligible:false,coins:0});
  const answer=extra=>Promise.resolve(disposed||!adminTrialActive?{ok:false,reason:'unavailable'}:{ok:true,...snapshot(),...extra});
  return {
    get snapshot(){return snapshot();},
    get connection(){return disposed||!adminTrialActive?'unavailable':'ready';},
    get pending(){return null;},
    refresh:()=>answer(),
    startRound(requestId,stage){
      if(disposed||!adminTrialActive||!resultUUID.test(requestId||'')||!Number.isInteger(stage)||stage<1||stage>STAGES.length)return Promise.resolve({ok:false,reason:'invalid'});
      if(!runs.has(requestId))runs.set(requestId,{stage,completed:false});
      if(runs.size>100)runs.delete(runs.keys().next().value);
      return answer({run_id:requestId});
    },
    completeRound(runId,stage,score){
      const run=runs.get(runId);
      if(disposed||!adminTrialActive||!run||run.stage!==stage||!Number.isInteger(score)||score<0||score>150)return Promise.resolve({ok:false,reason:'invalid'});
      if(!run.completed){run.completed=true;rounds++;}
      return answer();
    },
    spend:()=>answer(),
    buy:()=>Promise.resolve({ok:false,reason:'trial_only'}),
    buyCoach:()=>Promise.resolve({ok:false,reason:'trial_only'}),
    retryPending:()=>Promise.resolve({ok:false,reason:'nothing_pending'}),
    dispose(){disposed=true;runs.clear();}
  };
}
function showTrialGate(title,detail){
  $('adminTrialGateTitle').textContent=title;$('adminTrialGateDetail').textContent=detail;
  $('adminTrialGate').classList.remove('hidden');
  const shell=document.querySelector?.('.app-shell');if(shell)shell.inert=true;
  $('adminTrialGate').focus?.();
}
function denyAdminTrial(title,detail){
  adminTrialDenied=true;adminTrialActive=false;clearTimeout(adminTrialTimer);adminTrialTimer=null;
  ammo?.dispose?.();cancelDraw();state.mode='blocked';
  showTrialGate(title,detail);
}
function startAdminTrial(message){
  if(adminTrialDenied||adminTrialActive)return;
  clearTimeout(adminTrialTimer);adminTrialTimer=null;
  adminTrialIdentity={owner:message.owner,sessionId:message.sessionId};adminTrialActive=true;
  const scopeLoadouts=Object.fromEntries(BOWS.filter(item=>item.scopeMagnifications?.length).map(item=>
    [item.id,{owned:[...item.scopeMagnifications],equipped:Math.max(...item.scopeMagnifications)}]));
  const laserLoadouts=Object.fromEntries(BOWS.filter(canEquipLaser).map(item=>[item.id,normalizeLaserSettings()]));
  progress={...defaults(),ownedBows:BOWS.map(item=>item.id),ownedArrows:ARROWS.map(item=>item.id),
    scopeLoadouts,scopedBows:Object.keys(scopeLoadouts).map(Number),laserLoadouts,stabilizers:1};
  ammo=createTrialAmmoClient();
  $('adminTrialGate').classList.add('hidden');$('adminTrialBanner').classList.remove('hidden');
  const shell=document.querySelector?.('.app-shell');if(shell){shell.inert=false;shell.classList.add('admin-trial-active');}
  document.body.classList?.add('admin-trial-active');
  // Reloading the brand's normal URL inside a trial parent could write normal
  // progress. Trial navigation stays in this temporary session instead.
  document.querySelector?.('.brand')?.removeAttribute?.('href');
  lastFrame=performance.now();save();resetRound(STAGES[0]);requestAnimationFrame(tick);
}
function bootAdminTrial(){
  state.mode='blocked';
  showTrialGate('관리자 권한을 확인하고 있어요.','잠시만 기다려 주세요. 확인이 끝나면 모든 아이템을 체험할 수 있어요.');
  if(window.parent===window||!window.parent||!window.location?.origin||window.location.origin==='null'){
    denyAdminTrial('오락실에서 체험을 열어 주세요.','관리자 계정으로 로그인한 뒤 바람의 궁수의 아이템 체험을 선택해 주세요.');return;
  }
  adminTrialTimer=setTimeout(()=>denyAdminTrial('체험 연결을 확인하지 못했어요.','게임 목록으로 돌아가 관리자 체험을 다시 열어 주세요.'),10000);
  try{window.parent.postMessage({source:'ojjuda-archery-game',type:'ready'},window.location.origin);}
  catch{denyAdminTrial('체험 연결을 확인하지 못했어요.','게임 목록으로 돌아가 관리자 체험을 다시 열어 주세요.');}
}
if(adminTrialRequested)bootAdminTrial();
else{ammo=createAmmoClient({onChange:onAmmoChange});save();resetRound(state.stage);requestAnimationFrame(tick);}
