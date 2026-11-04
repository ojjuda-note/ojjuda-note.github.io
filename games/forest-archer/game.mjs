import {createCoinExchangeClient,COIN_PACKS,COINS_PER_ZU} from './coin-exchange.mjs?v=20261104-archery-reset5';
import {PLAYER, BOWS, ARROWS, BULLETS, getBullet, SCOPES, getScopePrice, getScoreCoinReward, STAGES, STAGE_GEAR_BANDS, prepareStage, passersAt, retirePasser, clamp, targetAt, applyAnimalHit, getAnimalAttachmentPoint, getSpeed, getArrowMass, getArrowConsistency, getArrowVariance, getArrowDragRate, getWindResponse, sortEquipment, launchArrow, launchVolley, stepArrow, predictTrajectory, createSway, stepSway} from './engine.mjs?v=20261104-archery-coin-shop1';
import {drawScenery, drawAnimal, drawClay, drawUfo, drawObstacle, drawPasser, drawEquipmentIcon, drawFirstPersonBow, drawBullseyeImpact, drawBullseyeVignette} from './scenery.mjs?v=20261104-archery-bullet-penetration1';
import {FLIGHT_TIME_SCALE, IMPACT_HOLD, RETURN_DURATION, PREVIEW_RISE, PREVIEW_HOLD, PREVIEW_RETURN, NEAR_PLANE, projectPoint, depthFragments, desiredFollowCamera, desiredPreviewCamera, clearShotCamera, lerpCamera} from './view.mjs?v=20261104-archery-eagle-dive1';
import {createBullseyeCinematic, sampleBullseyeCinematic, desiredBullseyeCamera} from './cinematic.mjs?v=20261104-archery-eagle-dive1';
import {createBulletCinematic, sampleBulletCinematic, desiredBulletCamera} from './bullet-cinematic.mjs?v=20261104-archery-bullet-penetration1';
import {drawCinematicBullet, drawBulletMark, drawBulletImpact, drawBulletVignette} from './bullet-effects.mjs?v=20261104-archery-bullet-cinematic1';
import {evaluateCoachShot} from './coach.mjs?v=20261104-archery-coin-shop1';
import {createAmmoClient, createRequestId, LAUNCH_EPOCH} from './ammo-client.mjs?v=20261104-archery-reset5';
import {LASER_PRICE, LASER_CLICK_DEGREES, LASER_MAX_CLICKS, canEquipLaser, normalizeLaserSettings, traceLaserPoint} from './laser.mjs?v=20261104-archery-coin-shop1';

const $ = id => document.getElementById(id);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const canvas = $('gameCanvas'), ctx = canvas.getContext('2d', {alpha:false}), touchpad = $('aimTouchpad');
// The requested full reset starts a new journey. Never import earlier progress,
// equipment or purchase recovery, including later writes from an old open tab.
const SAVE_KEY = 'forest-archer-progress-single-v5';
const STAGE_CATALOG = 'missions-220-v1';
const FIREARM_CATALOG = 'snipers-bullets-v1';
const DRAW_LIMIT = 10;
const AIM_SWAY_SCALE = .68;
const MAX_AIM_YAW = .48;
const MIN_AIM_PITCH = -.22;
const MAIN_MAX_PITCH = Math.PI / 3;
const LASER_CLICK_RADIANS = LASER_CLICK_DEGREES * Math.PI / 180;
const STEADY_SETTLE_SECONDS = .6;
const STABILIZER_COST = 5;
const STABILIZER_COIN_COST = 100;
const CONSUMABLE_LIMIT = 1e8;
const ANIMAL_NAMES = Object.freeze({rabbit:"토끼",wildcat:"살쾡이",deer:"사슴",pigeon:"비둘기",eagle:"독수리",cheetah:"치타",bird:"새"});
const defaults = () => ({version:1,launchEpoch:LAUNCH_EPOCH,stageCatalog:STAGE_CATALOG,firearmCatalog:FIREARM_CATALOG,coins:0,coinExchangeReceipts:[],clayCredits:0,stabilizers:0,coachEnabled:true,bow:0,arrow:0,bullet:0,eventGun:20,eventBest:0,eventBestByLevel:{},eventPlays:0,mainRounds:0,ownedBows:[0],ownedArrows:[0],ownedBullets:[],scopedBows:[],scopeLoadouts:{},laserLoadouts:{},unlocked:1,lastStage:1,best:{},sound:true,shots:0,hits:0});
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
  // or the next uncleared mission beyond the sequential frontier.
  return Number.isInteger(id)&&id>=1&&id<=STAGES.length&&((id<=saved.unlocked)||stageCleared(id,saved));
}
// Only these weapons could own a paid scope before magnification choices existed.
const LEGACY_SCOPE_IDS=new Set([3,7,8,9,10,11,12,13,14,15,16,17,18,19,20,22,23,24]);
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
    return total+(String(id)===key&&Number.isInteger(id)&&item?.weaponType==='bow'&&raw.ownedBows.includes(id)&&entry&&typeof entry==='object'&&!Array.isArray(entry)?500:0);
  },0);
}
function removeTestSaves(){
  const keys=new Set([...([1,2,3,4].map(version=>`forest-archer-progress-v${version}`)),'forest-archer-progress-single-v4']);
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(/^forest-archer-ammo-(?:pending|recovery)-v[1234]:/.test(key||'')||/^forest-archer-coin-exchange-v1:/.test(key||''))keys.add(key);
    }
  }catch{}
  for(const key of keys){try{localStorage.removeItem(key);}catch{}}
}
function migrateLegacyGuns(raw){
  if(raw.firearmCatalog===FIREARM_CATALOG)return raw;
  const gunId=id=>Number.isInteger(id)&&id>=20&&id<=24?20:id;
  const oldOwned=Array.isArray(raw.ownedBows)?raw.ownedBows:[];
  const next={...raw,bow:gunId(raw.bow),eventGun:gunId(raw.eventGun),ownedBows:oldOwned.map(gunId)};
  if(Array.isArray(raw.scopedBows))next.scopedBows=raw.scopedBows.map(id=>Number.isInteger(id)&&id>=22&&id<=24?20:id);
  if(raw.scopeLoadouts&&typeof raw.scopeLoadouts==='object'&&!Array.isArray(raw.scopeLoadouts)){
    next.scopeLoadouts={...raw.scopeLoadouts};
    const entries=oldOwned.filter(id=>Number.isInteger(id)&&id>=20&&id<=24).map(id=>({id,entry:raw.scopeLoadouts[id]}))
      .filter(({entry})=>entry&&typeof entry==='object'&&!Array.isArray(entry)&&Array.isArray(entry.owned));
    const owned=[...new Set(entries.flatMap(({id,entry})=>entry.owned.filter(zoom=>getScopePrice(20,zoom)!==null&&(id===20||id>=22&&zoom===3))))].sort((a,b)=>a-b);
    if(owned.length){
      const selected=entries.find(({id})=>id===raw.bow)||entries.find(({id})=>id===raw.eventGun);
      next.scopeLoadouts[20]={owned,equipped:owned.includes(selected?.entry.equipped)?selected.entry.equipped:owned.at(-1)};
    }
    for(const id of [21,22,23,24])delete next.scopeLoadouts[id];
  }
  return next;
}
function loadProgress(){
  removeTestSaves();
  try {
    const stored = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if(!stored || stored.version!==1 || stored.launchEpoch!==LAUNCH_EPOCH || stored.stageCatalog!==STAGE_CATALOG) return defaults();
    const raw=migrateLegacyGuns(stored);
    const base=defaults(), finite=(v,f=0)=>Number.isFinite(v)?v:f;
    const ids=(arr,catalog)=>[...new Set([0,...(Array.isArray(arr)?arr:[]).filter(x=>Number.isInteger(x)&&catalog.some(item=>item.id===x))])];
    base.coins=clamp(Math.floor(finite(raw.coins)),0,1e8);
    base.coinExchangeReceipts=[...new Set((Array.isArray(raw.coinExchangeReceipts)?raw.coinExchangeReceipts:[]).filter(id=>typeof id==='string'&&/^[a-f0-9-]{36}:[a-f0-9-]{36}$/i.test(id)))];
    base.clayCredits=clamp(Math.floor(finite(raw.clayCredits)),0,CONSUMABLE_LIMIT);
    base.stabilizers=clamp(Math.floor(finite(raw.stabilizers)),0,CONSUMABLE_LIMIT);
    base.coachEnabled=raw.coachEnabled!==false;
    base.ownedBows=ids(raw.ownedBows,BOWS);base.ownedArrows=ids(raw.ownedArrows,ARROWS);
    const savedBullets=stored.firearmCatalog===FIREARM_CATALOG&&Array.isArray(raw.ownedBullets)?raw.ownedBullets:[];
    base.ownedBullets=[...new Set(savedBullets.filter(id=>Number.isInteger(id)&&BULLETS.some(item=>item.id===id)))];
    if(base.ownedBows.some(id=>BOWS[id]?.weaponType==='gun')&&!base.ownedBullets.includes(0))base.ownedBullets.unshift(0);
    base.bullet=base.ownedBullets.includes(raw.bullet)?raw.bullet:0;
    base.scopeLoadouts=loadScopeLoadouts(raw,base.ownedBows);
    base.scopedBows=Object.keys(base.scopeLoadouts).map(Number);
    base.laserLoadouts=loadLaserLoadouts(raw.laserLoadouts,base.ownedBows);
    base.bow=base.ownedBows.includes(raw.bow)?raw.bow:0;base.arrow=base.ownedArrows.includes(raw.arrow)?raw.arrow:0;
    base.eventGun=base.ownedBows.includes(raw.eventGun)&&BOWS[raw.eventGun]?.weaponType==='gun'?raw.eventGun:20;
    base.eventBest=clamp(Math.floor(finite(raw.eventBest)),0,300);base.eventPlays=Math.max(0,Math.floor(finite(raw.eventPlays)));
    base.mainRounds=clamp(Math.floor(finite(raw.mainRounds)),0,1e7);
    for(let level=1;level<=10;level++)if(Number.isFinite(raw.eventBestByLevel?.[level]))base.eventBestByLevel[level]=clamp(Math.floor(raw.eventBestByLevel[level]),0,CONSUMABLE_LIMIT);
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
let progress=loadProgress();
function save(){
  let exchangeChanged=false;
  try{
    const saved=localStorage.getItem(SAVE_KEY);
    let stored=null;
    // Malformed old saves already load as fresh progress; they must not block
    // saving that recovery. Storage access failures still stop the write.
    try{stored=JSON.parse(saved||'null');}catch(error){if(!(error instanceof SyntaxError))throw error;}
    exchangeChanged=stored?.launchEpoch===LAUNCH_EPOCH&&Array.isArray(stored.coinExchangeReceipts)&&stored.coinExchangeReceipts.some(id=>!progress.coinExchangeReceipts.includes(id));
    if(exchangeChanged)throw Error('exchange changed in another window');
    // The credit and removal of the old bow records commit together. Keep the
    // pending credit on a failed write, so a retry cannot lose or repeat it.
    const next=pendingBowLaserRefund?{...progress,coins:clamp(progress.coins+pendingBowLaserRefund,0,1e8)}:progress;
    localStorage.setItem(SAVE_KEY,JSON.stringify(next));
    if(pendingBowLaserRefund){progress.coins=next.coins;pendingBowLaserRefund=0;$('coinCount').textContent=formatCoins(progress.coins);}
    persistence=true;
  }catch{persistence=false;}
  $('saveStatus').textContent=persistence?'진행 상황은 이 기기에 자동 저장됩니다':exchangeChanged?'다른 창에서 코인을 교환했어요 · 게임을 다시 열어 주세요':'저장할 수 없어요 · 현재 플레이는 계속할 수 있어요';
  $('saveFooter').classList.toggle('visually-hidden',persistence);
  $('saveFooter').classList.toggle('save-error',!persistence);
  return persistence;
}
const state={stage:STAGES[progress.lastStage-1],time:0,score:0,used:0,hits:0,arrowHits:0,earned:0,shotScores:[],shotMaxScores:[],targetMarks:[],stuck:[],effects:[],mode:'ready',held:0,drawStarted:0,steadyStart:1,steadyDuration:.5,steadyActive:false,stabilizerActive:false,stabilizerNotice:'',charge:0,velocityBias:0,burstSeed:0,aim:{yaw:0,pitch:0},sway:createSway(),shot:null,settle:0,zoom:1,panX:0,panY:0,modal:null,lastFocus:null,feedbackUntil:0,guide:null,guideAt:0};
state.cinematic=null;
state.isEvent=false;
state.magazine=0;state.reloadRemaining=0;state.roundShotLimit=5;
state.laserStep=1;
state.laserAdjustOpen=false;
state.coachSaid=false;state.coachReady=false;state.coachLastCueAt=-Infinity;state.coachCueUntil=0;state.coachLastCheck=-Infinity;
let w=1,h=1,dpr=1,camera={},pointer=null,lastFrame=performance.now(),audio=null,toastTimer=0,drawTimer=0,keys=new Set();
let laserDial=null;
const laserGearAngles={horizontalClicks:0,verticalClicks:0};
let coinExchange=null;
let ammo=null,roundRegistration=Promise.resolve();
const resultUUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
let resultBridge=null,finishedMainRound=null;
function reportFinishedMainRound(){
  if((!resultBridge)||!finishedMainRound||finishedMainRound.sent||window.parent===window)return;
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

  if(message.adminTrial===true)return;
  // Keep completion tied to this iframe's first account/session handshake.
  // A late finish must not consume the trial of a different signed-in owner.
  if(!resultBridge)resultBridge={owner:message.owner,sessionId:message.sessionId};
  reportFinishedMainRound();
});

async function refreshAmmoStatus(){
  if(!ammo||ammo.pending||state.ammoRefreshing)return;
  state.ammoRefreshing=true;
  try{await ammo.refresh();}finally{state.ammoRefreshing=false;onAmmoChange();}
}
const ammoLocked=()=>!!state.roundSaving||!!ammo?.pending;
const preparingMainRound=()=>!state.practiceOnly&&!state.serverRunId&&ammo?.connection!=='unavailable'&&state.mode!=='finished';
function guardAmmoAction(){
  if(!ammoLocked())return false;
  toast(state.roundSaving?'완료한 판을 저장하고 있어요.':'이전 기록 처리를 먼저 확인해 주세요. 아래 다시 확인을 눌러 주세요.');return true;
}
function ammoError(result){
  const messages={progress_reset:'이전 테스트 기록은 초기화됐어요. 새 판에서 시작해 주세요.',update_required:'오락실을 새로고침해 주세요.',round_too_soon:'완료 시간을 확인하지 못했어요. 사격장을 다시 시작해 주세요.',sign_in:'로그인한 오락실에서 기록을 저장할 수 있어요.',unavailable:'계정 연결을 확인해 주세요.',pending:'기록 처리 결과를 확인하고 있어요. 다시 확인을 눌러 주세요.',network:'연결을 확인한 뒤 다시 눌러 주세요.',request_conflict:'이전 기록 처리 결과를 먼저 확인해 주세요.',recovered_spend:'이전 처리 결과를 확인했어요. 새 발사나 구매는 실행하지 않았어요.',storage_unavailable:'브라우저 저장을 허용한 뒤 다시 확인해 주세요.',ammo_retired:'총알 재고와 충전은 더 이상 사용하지 않아요.'};
  return messages[result?.reason]||'기록 처리를 확인하지 못했어요. 다시 확인해 주세요.';
}
function updateAmmoPanel(){
  const busy=!!state.ammoBusy,recovery=ammo?.pending&&(ammo.pending.status!=='waiting'||ammo.pending.recovered);
  const registrationFailed=preparingMainRound()&&!state.registering;
  $('ammoPanel').classList.toggle('hidden',!recovery&&!state.awaitingRoundSave&&!registrationFailed);
  $('ammoStatus').textContent=state.roundSaving?'완료 기록을 저장하고 있어요.':state.ammoNotice||'기록 연결을 확인한 뒤 다시 확인을 눌러 주세요.';
  $('ammoRetryBtn').classList.toggle('hidden',busy||(!recovery&&!registrationFailed&&!state.awaitingRoundSave));
  $('ammoRetryBtn').disabled=busy||!!state.roundSaving;
  $('ammoRetryBtn').textContent=ammo?.pending?'이전 기록 다시 확인':'다시 확인';
}
function onAmmoChange(){
  if(!ammo)return;
  coinExchange?.updateBalance(ammo.snapshot?.coins);
  if(Number.isInteger(ammo.snapshot?.main_rounds)&&!state.roundSaving&&progress.mainRounds!==ammo.snapshot.main_rounds){progress.mainRounds=ammo.snapshot.main_rounds;save();updateRound();}
  updateAmmoPanel();
  if(state.modal==='stabilizer')renderStabilizers();
  updatePower();resumeRoundRegistration();
}
function resumeRoundRegistration(){
  if(state.deferRegistration&&!state.registering&&state.mode!=='finished'&&!state.roundSaving&&!ammo?.pending&&ammo?.connection==='ready')registerMainRound();
}
function registerMainRound(){
  if(state.registering)return state.roundStart;
  const epoch=state.roundEpoch,requestId=state.runId,stage=state.stage.id;
  state.serverRunId=null;state.deferRegistration=false;state.registering=true;
  state.roundStart=roundRegistration=roundRegistration.catch(()=>null).then(async()=>{
    if(state.roundEpoch!==epoch)return {ok:false,reason:'stale'};
    const result=await ammo.startRound(requestId,stage);
    if(state.roundEpoch===epoch){
      state.registering=false;
      if(result?.ok)state.serverRunId=result.run_id;
      else{state.deferRegistration=['busy','pending'].includes(result?.reason);state.practiceOnly=result?.reason==='storage_unavailable';if(state.practiceOnly)toast('저장 없이 연습할 수 있어요. 기록은 저장이 가능한 브라우저에서 보관할 수 있어요.');}
      updateAmmoPanel();updatePower();
      Promise.resolve().then(resumeRoundRegistration);
    }
    return result;
  });
}
const activeBow=()=>BOWS[progress.bow];
const activeArrow=()=>ARROWS[progress.arrow];
const usingGun=()=>activeBow().weaponType==='gun';
const activeBullet=()=>getBullet(progress.bullet);
const ownsGun=()=>progress.ownedBows.some(id=>BOWS[id]?.weaponType==='gun');
function prepareGunRound(){
  state.magazine=0;state.reloadRemaining=usingGun()?activeBow().reloadSeconds:0;
}
function stepGunReload(dt){
  if(!usingGun()||state.reloadRemaining<=0||state.mode==='finished')return;
  state.reloadRemaining=Math.max(0,state.reloadRemaining-dt);
  if(state.reloadRemaining===0)state.magazine=activeBow().magazineSize;
}
function weaponCategoryLocked(item){
  return state.used>0&&state.mode!=='finished'&&usingGun()!==(item.weaponType==='gun');
}
function activeLaser(id=activeBow().id){
  const item=BOWS.find(weapon=>weapon.id===id),settings=progress.laserLoadouts[id];
  return (canEquipLaser(item))&&progress.ownedBows.includes(id)&&settings?normalizeLaserSettings(settings):null;
}
const laserEnabled=()=>activeLaser()?.enabled===true;
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
const laserControlsReady=()=>(!document.hidden)&&!state.modal&&state.mode==='ready'&&!ammoLocked()&&!!activeLaser();
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
  resetCoachCue();
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
  const visible=(state.mode==='ready'||state.mode==='drawing');
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
  const settings=activeLaser(),visible=!!settings,ready=visible&&laserControlsReady();
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
const activeProjectile=()=>usingGun()?activeBullet():activeArrow();
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
const shotLimit=()=>state.roundShotLimit||state.stage.shots;
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
  const handSwayFactor=activeBow().handSwayFactor??1;
  if(settlingScale===0||handSwayFactor===0)return {x:0,y:0};
  const scale=AIM_SWAY_SCALE*handSwayFactor*(state.stabilizerActive ? .5 : 1)*settlingScale;
  return {x:state.sway.x*scale,y:state.sway.y*scale};
};
const aimAngles=(now=performance.now())=>{const sway=effectiveSway(now);return {yaw:state.aim.yaw+sway.x,pitch:state.aim.pitch+sway.y};};
function shotParams(now=performance.now()){return {...aimAngles(now),charge:state.charge,bow:activeBow(),arrow:activeArrow(),bullet:activeBullet(),velocityBias:state.velocityBias,burstSeed:state.burstSeed};}
function syncDraw(now=performance.now()){
  state.held=Math.min(DRAW_LIMIT,drawElapsed(now));state.charge=usingGun()?1:clamp(state.held/1.25,0,1);
  const steady=isSteady(now);if(steady!==state.steadyActive)state.guide=null;state.steadyActive=steady;
}
function stopCoachVoice(){try{window.speechSynthesis?.cancel();}catch{}}
function resetCoachCue(){
  stopCoachVoice();state.coachReady=false;state.coachSaid=false;state.coachCueUntil=0;state.coachWindowAnnounced=false;
  state.coachLastCheck=-Infinity;state.coachLastCueAt=-Infinity;setCoachCue(false);
}
function setCoachCue(visible){
  const cue=$('coachCue');
  if(!cue)return;
  visible=!!visible;cue.classList.toggle('hidden',!visible);cue.classList.toggle('is-ready',visible);
  cue.setAttribute('aria-hidden',visible?'false':'true');
}
function announceCoach(){
  if(!progress.sound)return;
  const synth=window.speechSynthesis,Utterance=window.SpeechSynthesisUtterance;
  if(synth&&Utterance){
    try{
      const cue=new Utterance('쏴!');cue.lang='ko-KR';cue.rate=1.15;cue.pitch=1;cue.volume=.85;
      const voice=synth.getVoices?.().find(voice=>/^ko(?:-|_)/i.test(voice.lang));if(voice)cue.voice=voice;
      cue.onerror=()=>{if(progress.sound&&progress.coachEnabled&&state.mode==='drawing'&&state.coachReady)sound('coach');};
      synth.cancel();synth.speak(cue);return;
    }catch{}
  }
  sound('coach');
}
function updateCoach(now){
  if(state.mode!=='drawing'||!progress.coachEnabled){state.coachReady=false;state.coachCueUntil=0;return;}
  if(now-state.coachLastCheck<62.5)return;
  state.coachLastCheck=now;
  const result=evaluateCoachShot(shotParams(now),state.stage,state.time,{held:drawElapsed(now),steadyStart:state.steadyStart,steadyDuration:state.steadyDuration,releaseLimitSeconds:laserEnabled()?Infinity:DRAW_LIMIT});
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
  const frame=(state.cinematic.kind==='bullet'?sampleBulletCinematic:sampleBullseyeCinematic)(state.cinematic,state.settle);
  if(frame.phase==='done')return null;
  if(frame.phase==='return'){const t=frame.progress;frame.time+=(state.time-frame.time)*t*t*(3-2*t);}
  return frame;
}
const renderTime=()=>cinematicFrame()?.time??state.time;
const impactHold=()=>state.cinematic?state.cinematic.flightDuration+state.cinematic.holdDuration:IMPACT_HOLD;
const impactReturn=()=>state.cinematic?.returnDuration??RETURN_DURATION;
function rememberFlight(shot,time){
  if(shot.projectileType!=='arrow'&&shot.projectileType!=='bullet')return;
  const frames=shot.replayFrames??=[];
  const append=frame=>{
    const previous=frames.at(-1);
    if(previous&&Math.abs(previous.time-frame.time)<1e-10){
      if(previous.incomingVelocity)frame.incomingVelocity={...previous.incomingVelocity};
      frames[frames.length-1]=frame;
    }else frames.push(frame);
    if(frames.length>240)frames.shift();
  };
  // A rendered frame may cross several walls. Keep their exact contact clocks
  // and the discontinuous velocities, rather than slowing before the wall.
  for(let index=shot.recordedPenetrations||0;index<(shot.penetrations?.length||0);index++){
    const entry=shot.penetrations[index];
    append({point:{...entry.point},velocity:{...entry.velocityAfter},incomingVelocity:{...entry.velocityBefore},time:entry.time});
  }
  if(shot.projectileType==='bullet')shot.recordedPenetrations=shot.penetrations?.length||0;
  append({point:{...shot.position},velocity:{...shot.velocity},time});
}
function penetrationSummary(shot,details=false){
  const hits=shot?.penetrations;if(!hits?.length)return '';
  const material=hits.every(hit=>hit.material==='wood')?'나무벽':hits.every(hit=>hit.material==='stone')?'돌벽':'벽';
  const title=`${material} ${hits.length}회 관통`;
  if(!details)return title;
  const speed=Math.round((shot.penetrationSpeedRatio??1)*100),drop=Math.round((shot.penetrationDropRatio??1)*100);
  return `${title} · 속도 ${speed}% · ${shot.wallDropReference>0?`기본탄 대비 낙차 ${drop-100}%`:`낙차 ${drop}%`}`;
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
  const replay=cinematicFrame();
  if(replay&&!state.cinematic.reducedMotion){
    const target=targetAt(state.stage,replay.time,state.cinematic.shot.attachment?.passId);
    const close=(replay.kind==='bullet'?desiredBulletCamera:desiredBullseyeCamera)({...replay,targetCenter:target},base,{w,h});
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
  state.aim.yaw=clamp(state.aim.yaw,-MAX_AIM_YAW,MAX_AIM_YAW);state.aim.pitch=clamp(state.aim.pitch,MIN_AIM_PITCH,MAIN_MAX_PITCH);
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
    if(type==='bullet-flight'){tone(105,0,.70,.016,'triangle',460);tone(1800,.48,.26,.008,'sine',390);}
    if(type==='bullet-bull'){tone(140,0,.12,.07,'triangle',40);tone(1800,0,.045,.025,'sawtooth',380);tone(920,.05,.18,.035);tone(1380,.13,.30,.03);}
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
  $('bowName').textContent=b.name;$('bowStat').textContent=`${usingGun()?`손떨림 ${b.handSwayFactor===0?'없음':`${Math.round((b.handSwayFactor??1)*100)}%`} · 탄창 ${b.magazineSize}발 · 장전 ${b.reloadSeconds.toFixed(1)}초`:`그립감 ${b.grip} · 탄성 ${b.elasticity}`}${b.burstCount>1?` · 3연발 · 집탄 ${b.grouping}`:''}${hasScope()?` · ${equippedScope()}배 조준경 장착`:''}`;
  $('arrowName').textContent=projectile.name;$('arrowStat').textContent=usingGun()?`탄속 ${projectile.speedRatio}배 · ${projectile.dropRatio===0?'낙차 없음':`낙차 ${Math.round(projectile.dropRatio*100)}%`}`:`촉 ${a.tipMass}g · ${a.fletching.name}${a.ability?` · ${a.ability.label}`:''}`;
  $('projectileLabel').textContent=usingGun()?'AMMO':'ARROW';
  $('loadoutSpeed').textContent=`기준 발사속도 ${getSpeed({bow:b,arrow:a,bullet:activeBullet(),charge:1,velocityBias:0}).toFixed(1)} m/s`;
  $('loadoutSteady').textContent=b.handSwayFactor===0?'손떨림 없음 · 항상 조준 안정':`조준 안정 ${formatSeconds(weaponSteadyDuration(b))}초 · 당길 때마다 한 번`;
  for(const [id,item,kind] of [['equippedBow',b,'bow'],['equippedArrow',projectile,usingGun()?'bullet':'arrow']]){
    const cv=$(id),cx=cv.getContext('2d');cx.clearRect(0,0,cv.width,cv.height);drawEquipmentIcon(cx,cv.width,cv.height,{...item,kind,tier:item.visualTier??item.id,scopeMounted:kind==='bow'&&hasScope(item.id)});
  }
  updateZoomControl();
}
function updateRound(){
  const s=state.stage;
  $('gunReload').classList.toggle('hidden',!usingGun());
  $('levelNumber').textContent=String(s.id).padStart(2,'0');
  $('stageChapter').textContent=s.subtitle;$('stageName').textContent=s.name;
  $('gearRecommendation').textContent=`${s.gearLabel}${s.longRange?` · ${s.distance}m 장거리 화살`:''} 권장`;
  $('gearRecommendation').classList.remove('hidden');
  $('scoreCount').textContent=state.score;$('goalCount').textContent=s.goal;
  $('scoreUnit').textContent='점';$('goalLabel').textContent='현재 점수 / 목표 점수';
  $('scoreLegend').classList.remove('hidden');$('missionTitle').textContent='이번 한 발의 목표';
  $('distanceLabel').textContent=`${s.distance} m`;
  $('windLabel').textContent=s.wind?`${s.wind>0?'→ 오른쪽':'← 왼쪽'} 바람 ${Number(Math.abs(s.wind).toPrecision(2))}`:'바람 없음';
  $('stageHint').textContent=s.hint;$('mobileHint').textContent=s.hint;
  $('missionFill').style.width=`${Math.min(100,state.score/s.goal*100)}%`;
  $('missionState').textContent=state.score>=s.goal?'목표 점수 달성!':`목표 ${s.goal}점을 달성해 이번 판을 통과하세요`;
  $('roundProgress').textContent=`${state.used} / ${shotLimit()}회 발사`;
  $('shotDots').innerHTML=Array.from({length:shotLimit()},(_,i)=>`<i class="arrow-dot ${i<state.used?'used':''}"></i>`).join('');
  $('shotCountLabel').textContent=`${Math.max(0,shotLimit()-state.used)}${shotUnit()} 남음${activeBow().burstCount>1?' · 3연발':''}`;
  $('journeyCount').textContent=`${s.id} / ${STAGES.length}`;
  $('journeyCaption').textContent=(`${progress.unlocked}단계까지 열림`);
  $('journeySteps').innerHTML=STAGES.map(s=>{const locked=!stageAvailable(s.id);return `<button class="journey-step ${s.id===state.stage.id?'active':''} ${stageCleared(s.id)?'done':''}" data-stage="${s.id}" ${locked?'disabled':''} aria-label="${s.id}단계 ${s.name}${locked?' 잠김':''}"><strong>${String(s.id).padStart(2,'0')}</strong><small>${locked?'잠김':`${s.distance}m`}</small></button>`}).join('');
  const journey=$('journeySteps');journey.classList.remove('hidden');
  if(journey.dataset.current!==String(s.id)){const active=journey.querySelector?.('.active');journey.scrollTop=Math.max(0,(active?.offsetTop||0)-(journey.offsetTop||0)-12);journey.dataset.current=String(s.id);}
  $('gameCanvas').dataset.stage=s.id;$('gameCanvas').dataset.score=state.score;$('gameCanvas').dataset.shots=state.used;
  $('previewBtn').classList.toggle('hidden',!s.obstacles.length);updateAmmoPanel();
}
function resetRound(stage=state.stage){
  if(guardAmmoAction())return;
  if(stage.kind==='clay'||!stageAvailable(stage.id)){toast(`${progress.unlocked}단계부터 차례로 통과해 주세요.`);return;}
  state.isEvent=false;
  state.resultSummary=null;
  state.roundEpoch=(state.roundEpoch||0)+1;state.runId=createRequestId();state.awaitingRoundSave=null;state.deferRegistration=false;state.registering=false;state.practiceOnly=false;state.ammoNotice='';state.ammoLoading=false;
  cancelDraw();state.stage=prepareStage(stage,Math.floor(Math.random()*0x100000000));state.time=0;state.score=0;state.used=0;state.hits=0;state.arrowHits=0;state.earned=0;state.shotScores=[];state.shotMaxScores=[];state.targetMarks=[];state.stuck=[];state.effects=[];state.mode='ready';state.shot=null;state.volley=null;state.cinematic=null;state.coachSaid=false;state.coachReady=false;state.coachLastCueAt=-Infinity;state.coachCueUntil=0;state.coachLastCheck=-Infinity;state.returnCamera=null;state.settle=0;state.charge=0;state.feedbackUntil=0;state.zoom=1;
  state.stabilizerActive=false;state.stabilizerNotice='';
  state.roundShotLimit=usingGun()?10:state.stage.shots;prepareGunRound();
  $('shotFeedback').classList.add('hidden');$('flightBadge').classList.add('hidden');recenter();resize();setAimZoom(equippedScope());updateRound();updateHeader();
  beginTargetPreview();
  registerMainRound();
}
function startStage(id){
  if(guardAmmoAction())return;
  if(window.OjjudaGameResults?.canPlay?.()===false)return;
  if(state.mode==='flight'||state.mode==='settling'){toast('이번 발사가 끝나면 사격장을 바꿀 수 있어요.');return;}
  if(!Number.isInteger(id)||id<1||id>STAGES.length)return;
  if(!stageAvailable(id)){toast(`${progress.unlocked}단계부터 차례로 통과해 주세요.`);return;}
  progress.lastStage=id;save();dismissModal();resetRound(STAGES[id-1]);
}
const mainStageForChoices=()=>state.stage.id;
function mainRoundCleared(){return state.mode==='finished'&&state.score>=state.stage.goal;}
const mainGoalForChoices=()=>state.stage.goal;
const canAdvanceStage=()=>mainStageForChoices()<STAGES.length&&stageAvailable(mainStageForChoices()+1)&&
  ((state.mode==='finished'&&mainRoundCleared()));
function navigateStage(delta){
  if(guardAmmoAction())return;
  if(delta>0&&!canAdvanceStage()){
    toast(mainStageForChoices()>=STAGES.length?'마지막 단계예요.':!stageAvailable(mainStageForChoices()+1)&&mainRoundCleared()?`${progress.unlocked}단계부터 차례로 통과해 주세요.`:`이번 활쏘기 판에서 목표 ${mainGoalForChoices()}점을 달성해야 다음 단계로 갈 수 있어요.`);return;
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

  if(state.modal||state.mode!=='ready'||document.hidden||state.used>=shotLimit())return false;
  if(preparingMainRound())return false;
  if(usingGun()&&(state.reloadRemaining>0||state.magazine<=0))return false;
  if(!centerLaserForDraw())return false;
  closeLaserAdjustments();stopCoachVoice();state.coachSaid=false;state.coachReady=false;state.coachLastCueAt=-Infinity;state.coachCueUntil=0;state.coachLastCheck=-Infinity;
  state.mode='drawing';state.held=0;state.drawStarted=performance.now();state.charge=0;state.velocityBias=Math.random()*2-1;
  const motionFree=activeBow().handSwayFactor===0;
  state.steadyDuration=motionFree?DRAW_LIMIT:weaponSteadyDuration();
  state.steadyStart=motionFree?0:1+Math.random()*(DRAW_LIMIT-state.steadyDuration-1);state.steadyActive=motionFree;state.guide=null;
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
  if(usingGun()){
    if(state.reloadRemaining>0||state.magazine<=0){cancelDraw();return;}
    state.magazine--;

  }
  state.shot=shots[0];state.volley=shots.length>1?{shots,elapsed:0,startedAt:now,handled:false}:null;
  state.shotMaxScores.push(shots.length*10);
  state.mode='flight';state.used++;state.guide=null;state.steadyActive=false;state.returnCamera=null;state.cinematic=null;
  clearPointer();keys.clear();
  $('shotFeedback').classList.add('hidden');$('flightBadge').classList.remove('hidden');
  $('flightBadge').textContent=usingGun()?'비행 중 · 탄환을 따라가는 중':'비행 중 · 화살을 따라가는 중';
  sound('shoot');if(navigator.vibrate)navigator.vibrate(12);updateRound();updatePower();
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

function onImpact(){
  if(state.volley){
    if(state.volley.handled||state.volley.shots.some(shot=>shot.active))return;
    state.volley.handled=true;
    // Keep one real arrow for camera and impact effects.
    // The volley score is summed separately; a passer still voids the trigger.
    state.shot=state.volley.shots.find(shot=>shot.result.type==='person')||state.volley.shots.reduce((best,shot)=>shot.result.score>best.result.score?shot:best);
  }
  const shot=state.shot,r=shot.result;if(shot.handled)return;shot.handled=true;state.mode='settling';state.settle=0;
  state.cinematic=(shot.projectileType==='bullet'?createBulletCinematic:createBullseyeCinematic)(shot,shot.targetMark?.born??shot.replayFrames?.at(-1)?.time??state.time,{reducedMotion:!!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches});
  if(state.cinematic)state.cinematic.entryCamera={...camera};
  for(const arrow of state.volley?.shots||[shot])recordImpact(arrow);
  moveAttachedArrows();
  $('flightBadge').textContent=state.cinematic?(state.cinematic.kind==='bullet'?'명중 순간 · 탄환을 따라':'명중 순간 · 화살을 따라'):'착지 확인 · 조준 화면으로 돌아가요';
  const scoredShots=state.volley?.shots||[shot];
  const score=r.type==='person'?0:scoredShots.reduce((sum,arrow)=>sum+arrow.result.score,0);
  const hit=r.type==='hit';state.score+=score;state.shotScores.push(score);
  state.arrowHits+=scoredShots.filter(arrow=>arrow.result.type==='hit').length;
  if(hit)state.hits++;
  const reward=hit?scoredShots.reduce((sum,arrow)=>sum+(arrow.result.type==='hit'?getScoreCoinReward(arrow.result.score,state.stage.id):0),0):1;
  state.earned+=reward;progress.coins+=reward;progress.shots++;if(hit)progress.hits++;save();
  state.feedbackUntil=state.time+1.6;
  const animalZone=hit&&r.targetCenter?.kind&&r.targetCenter.kind!=='target'?r.zone:'';
  const animalHits=(state.volley?.shots||[shot]).map(arrow=>arrow.animalHit).filter(result=>result?.applied);
  const animalHit=animalHits.find(result=>result.justKilled)||animalHits.at(-1);
  const animalStatus=animalHit?`${ANIMAL_NAMES[animalHit.kind]} ${animalHit.killed?'쓰러짐':`체력 ${animalHit.health}/${animalHit.maxHealth}`} · `:'';
  $('feedbackTitle').textContent=hit?`${state.volley?'3연발 합계'+(animalZone?` · ${animalZone}`:''):animalZone||(r.score===10?'정중앙!':'명중!')} +${score}점`:r.zone;
  $('feedbackDetail').textContent=hit?`${animalStatus}${state.volley?`${state.volley.shots.filter(arrow=>arrow.result.type==='hit').length}/3발 명중`:r.flightTime.toFixed(2)+'초 비행'} · +${reward} 코인`:`${r.type==='person'?'이번 발사 0점 · 맞은 사람은 다음 발사부터 빠져요':r.type==='obstacle'?'벽 위나 기둥 사이의 틈을 노려보세요':r.type==='ground'?'조준을 높이거나 더 길게 당겨보세요':'거리와 바람을 다시 읽어보세요'} · +1 코인`;
  if(shot.penetrations?.length){
    $('feedbackDetail').textContent+=` · ${penetrationSummary(shot,true)}`;
  }
  $('shotFeedback').className=`shot-feedback ${!hit?'miss':r.score===10?'gold':''}${state.cinematic&&!state.cinematic.reducedMotion?' hidden':''}`;
  sound(state.cinematic?(state.cinematic.kind==='bullet'?'bullet-flight':'cinematic'):hit?(r.score===10?'bull':'hit'):'miss');if(hit&&!state.cinematic&&navigator.vibrate)navigator.vibrate(r.score===10?[15,30,15]:15);
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
  updateHeader();if(!alreadyOwned)sound('buy');showShop('scope',id);
  toast(`${item.name}에 ${magnification}배 조준경 장착! ${alreadyOwned?'구매한 배율은 무료로 바꿀 수 있어요.':'이 장비에 영구 귀속돼요.'}`);return true;
}
function installLaser(id){
  if(guardAmmoAction()||document.hidden||state.mode!=='ready'||(state.modal&&state.modal!=='shop'))return false;
  const item=BOWS.find(weapon=>weapon.id===id);
  if(!Number.isInteger(id)||!canEquipLaser(item)||!progress.ownedBows.includes(id)){toast('레이저는 첫 석궁부터 장착할 수 있어요. 석궁을 먼저 구매하세요.');return false;}
  if(weaponCategoryLocked(item)){toast('총과 활·석궁은 판을 시작하기 전에 바꿀 수 있어요.');return false;}
  const owned=!!activeLaser(id);
  if(!owned&&progress.coins<LASER_PRICE){toast('레이저를 살 코인이 부족해요.');return false;}
  const coins=progress.coins,loadouts=progress.laserLoadouts,bow=progress.bow;
  if(!owned){progress.coins-=LASER_PRICE;progress.laserLoadouts={...loadouts,[id]:normalizeLaserSettings()};}
  progress.bow=id;
  if(!save()){progress.coins=coins;progress.laserLoadouts=loadouts;progress.bow=bow;toast('레이저를 저장하지 못했어요. 브라우저 저장을 확인해 주세요.');return false;}
  if(state.used===0){state.roundShotLimit=state.stage.shots;prepareGunRound();}
  setAimZoom(equippedScope());state.sway=createSway();state.guide=null;closeModal();updateHeader();updateRound();updatePower();
  resetCoachCue();
  if(!owned)sound('buy');
  if(owned)openLaserAdjustments();else{closeLaserAdjustments();$('laserAdjustBtn').focus({preventScroll:true});}
  toast(owned?`${item.name} · 조준 전에 레이저 영점을 맞추세요.`:`${item.name}에 레이저를 달았어요. 이 무기에 영구 귀속돼요.`);return true;
}

function finishMainScreen(record, counted){
  if(state.roundEpoch!==record.epoch)return;
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
    // Guest/offline practice retains its local completed-round count.
    progress.mainRounds++;finishMainScreen(record,true);return;
  }
  state.ammoNotice=ammoError(result);toast('완료 기록을 아직 확인하지 못했어요. 아래 다시 확인을 눌러 주세요.');
  finishMainScreen(record,false);
}
function finishRound(){
  if(state.mode==='finished'||state.roundSaving)return;state.mode='finished';
  const passed=state.score>=state.stage.goal;
  const previous=progress.best[state.stage.id]||0;
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

  cancelDraw();if(!state.modal)state.lastFocus=document.activeElement;state.modal=type;
  $('modalContent').innerHTML=html;$('modal').classList.toggle('narrow',narrow);$('modal').dataset.view=type;
  $('modal').setAttribute('aria-labelledby','modalTitle');
  $('modalClose').classList.toggle('hidden',type==='result');$('menuBtn').setAttribute('aria-expanded',type==='menu'?'true':'false');
  $('modalBackdrop').classList.remove('hidden');document.body.style.overflow='hidden';
  if(type==='result'){
    const current=$('modalContent').querySelector?.(`[data-action="${'retry'}"]`);
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
  dismissModal();
}

function updateStabilizerUi(){
  const count=progress.stabilizers,active=state.stabilizerActive&&state.mode!=='finished';
  $('stabilizerCount').textContent=(count>99?'99+':String(count));
  $('stabilizerBtn').classList.toggle('active',active);
  $('stabilizerBtn').setAttribute('aria-label',`안정제 · ${(`${count.toLocaleString('ko-KR')}개 보유`)}${active?' · 이번 판 떨림 50% 적용 중':''}`);
  $('stabilizerBadge').classList.toggle('hidden',!active);
}
function stabilizerUseReason(){
  if(state.mode==='finished'||state.used>=shotLimit())return '이번 판이 끝났어요. 다음 판에서 사용할 수 있어요.';
  if(state.stabilizerActive)return '이번 판에는 이미 사용했어요. 효과는 중복되지 않아요.';
  if(state.mode==='preview')return '과녁 위치를 확인한 뒤 조준 화면에서 사용할 수 있어요.';
  if(state.mode==='flight'||state.mode==='settling')return '발사가 끝나고 조준 화면으로 돌아오면 사용할 수 있어요.';
  if(ammoLocked()||state.ammoBusy||preparingMainRound())return '기록 확인과 저장이 끝나면 사용할 수 있어요.';
  if(state.mode!=='ready')return '조준을 시작하기 전에 사용할 수 있어요.';
  if(progress.stabilizers<1)return '코인으로 안정제를 먼저 구매해 주세요.';
  return '';
}
let stabilizerModalHtml='';
function canExchangeStabilizer(){
  return (progress.stabilizers<CONSUMABLE_LIMIT)&&(progress.clayCredits>=STABILIZER_COST||progress.coins>=STABILIZER_COIN_COST);
}
function stabilizerMarkup(){
  const useReason=stabilizerUseReason();

  const legacy=progress.clayCredits>=STABILIZER_COST;
  const buyReason=progress.stabilizers>=CONSUMABLE_LIMIT?'안정제 보유 한도에 도달했어요.':!legacy&&progress.coins<STABILIZER_COIN_COST?`구매하려면 ${STABILIZER_COIN_COST-progress.coins}코인이 더 필요해요.`:'';
  return `<p class="eyebrow">STEADY YOUR NEXT SHOT</p><h2 id="modalTitle">안정제</h2><p class="modal-subtitle">한 판 동안 조준 흔들림을 절반으로 줄여요.</p><div class="stabilizer-summary"><div><small>게임 코인</small><strong>${formatCoins(progress.coins)}</strong></div><div><small>보유 안정제</small><strong>${progress.stabilizers.toLocaleString('ko-KR')}개</strong></div></div><div class="stabilizer-rules"><p><strong>안정제 1개 · ${STABILIZER_COIN_COST}코인</strong><br>사용하면 이번 판 남은 발사부터 흔들림이 50%로 줄어요. 한 판에 한 번 사용할 수 있어요.</p>${progress.clayCredits?`<p>이전 교환 점수 ${progress.clayCredits.toLocaleString('ko-KR')}개를 보관 중이에요. ${STABILIZER_COST}개가 모여 있으면 코인보다 먼저 사용해 안정제 1개로 교환해요.</p>`:''}<p>사용하지 않은 안정제는 저장돼요. 다시 시작하거나 다른 판으로 이동하면 사용 중인 효과가 끝나요.</p></div><div class="stabilizer-actions"><button class="button primary-button" data-action="buy-stabilizer" ${buyReason?'disabled':''}>안정제 1개 · ${legacy?'이전 점수 5개':`${STABILIZER_COIN_COST}코인`}</button>${buyReason?`<p class="stabilizer-message">${buyReason}</p>`:''}<button class="button soft-button" data-action="use-stabilizer" ${useReason?'disabled':''}>${icon('tonic')}${state.stabilizerActive?'이번 판에 사용한 안정제':'안정제 1개 사용 · 떨림 50%'}</button><p class="stabilizer-message" role="status">${state.stabilizerNotice||useReason||'사용하면 이번 판 남은 발사에 바로 적용돼요.'}</p><button class="button soft-button" data-action="close">게임으로 돌아가기</button></div>`;
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

  cancelDraw();state.stabilizerNotice='';stabilizerModalHtml=stabilizerMarkup();openModal('stabilizer',stabilizerModalHtml,true);
}
function buyStabilizer(){
  if(state.modal!=='stabilizer'||!canExchangeStabilizer())return false;
  const coins=progress.coins,credits=progress.clayCredits,inventory=progress.stabilizers;
  if(credits>=STABILIZER_COST)progress.clayCredits-=STABILIZER_COST;else progress.coins-=STABILIZER_COIN_COST;
  progress.stabilizers++;
  if(!save()){
    progress.coins=coins;progress.clayCredits=credits;progress.stabilizers=inventory;
    state.stabilizerNotice='저장하지 못해 구매를 취소했어요. 코인과 교환 점수는 그대로 보관돼요.';
    renderStabilizers();toast(state.stabilizerNotice);return false;
  }
  state.stabilizerNotice='안정제 1개를 준비했어요. 사용할 판에서 직접 사용해 주세요.';
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

async function retryAmmo(){
  if((!ammo))return;
  if(state.ammoBusy||state.roundSaving)return;
  const previous=ammo.pending,record=state.awaitingRoundSave;
  if(previous?.action==='round-start'&&previous.requestId===state.runId)state.deferRegistration=false;
  state.ammoBusy=true;updateAmmoPanel();
  const result=await (ammo.pending?ammo.retryPending():ammo.refresh());
  state.ammoBusy=false;state.ammoNotice=result?.ok?'기록 연결을 확인했어요.':ammoError(result);
  if(previous?.action==='coach-buy'){
    state.ammoNotice=result?.ok||result?.reason==='coach_basic'?'코치는 이제 무료 기본 기능이에요. 이전 처리 결과를 확인했어요.':ammoError(result);
  }
  if(result?.ok&&previous?.action==='round-start'&&previous.requestId===state.runId){
    state.serverRunId=result.run_id;state.roundStart=Promise.resolve(result);state.deferRegistration=false;
    if(record&&record.epoch===state.roundEpoch){await saveFinishedMainRound(record,result);return;}
  }
  if(result?.ok&&previous?.action==='round-complete'&&record&&record.epoch===state.roundEpoch&&previous.runId===record.serverRunId){applyMainCompletion(record,result);return;}
  if(result?.ok&&!state.serverRunId&&!state.registering&&state.mode!=='finished'&&!ammo.pending){registerMainRound();await state.roundStart;}
  onAmmoChange();toast(state.ammoNotice);
}
function showHelp(){

  openModal('help',`<p class="eyebrow">MAKE YOUR FIRST SHOT</p><h2 id="modalTitle">손끝으로 배우는 활쏘기</h2><p class="modal-subtitle">한 발씩 쏘다 보면, 바람과 거리의 감각이 생겨요.</p><div class="help-steps"><div class="help-step"><span>01</span><div><strong>화면 아래에서 끌어 조준</strong><p>사격장 화면 아래 3분의 1은 보이지 않는 조작 영역이에요. 그곳을 누른 채 손가락을 움직이면 위쪽 조준점도 같은 방향과 거리만큼 움직여요. 레이저를 켜면 사격장 어느 부분이든 눌러 조준할 수 있고, 빨간 점은 누를 때마다 사격장 가운데에서 시작해요. 확대해도 손가락과 1:1로 움직이고, 손가락을 멈추면 조준 이동도 멈춰요. 손을 떼면 현재 조준점 방향으로 발사돼요.</p></div></div><div class="help-step"><span>02</span><div><strong>손을 떼는 순간 발사</strong><p>활과 석궁은 길게 당길수록 빠르게 날아요. 총의 기본 탄환은 최고 화살보다 2배 빠르고, 같은 거리의 낙차는 절반이에요. 총알을 업그레이드하면 더 빠르고 곧게 날며, 직선 탄환은 기본 탄환의 3배 속도로, 벽에 닿기 전까지 낙차 없이 날아요. 누른 뒤 1~10초 사이에 무작위로 한 번 흔들림이 서서히 줄어들어 멈춰요. 안정 시간이 끝나면 바로 다시 흔들려요. 안정 시간은 기본 활 0.5초부터 장비 등급에 따라 길어져 최고급 석궁과 일반 총은 2초예요. 정밀 저격총은 기본 총 대비 손떨림이 25%이고, 무진동 저격총은 조준 내내 손떨림이 없어요. 레이저를 끈 상태에서는 10초 안에 손을 떼지 않으면 자동발사해요. 레이저를 켰다면 누르는 동안 계속 겨눌 수 있고, 손을 놓을 때만 발사해요.</p></div></div><div class="help-step"><span>03</span><div><strong>발사각을 보며 높이 조절하기</strong><p>사격장 위쪽 발사각은 수평 0°를 기준으로 무기를 들어 올린 실제 각도예요. 활·석궁·총은 최대 60°까지 올릴 수 있어요. 45°를 들었다면 실제로 그 각도로 발사되고, 활·화살·당긴 힘과 바람에 따라 날아가는 거리가 달라져요. 각도를 올리거나 내려도 조준 화면의 높이는 그대로예요. 발사하면 화면이 날아가는 화살이나 총알을 따라가고, 맞거나 땅에 떨어진 뒤 돌아와요. 벽·기둥이 있는 곳에서는 화살이 꽂히는 지점이 보이도록 시점을 보정해요. 화살로 둥근 과녁의 10점 중앙에 맞으면 실제 마지막 비행을 가까이 다시 보여주고, 금빛 충격파와 파편이 퍼지는 짧은 명중 장면이 나와요. 점수와 코인은 한 번만 받아요. 10점당 1단계 10코인부터 단계마다 1코인씩 더 받아요. 8점은 11단계 9코인, 12단계 10코인부터 단계마다 1코인씩 더 받아요. 그 이전 8점과 다른 점수의 보상은 기존과 같아요. 화살은 날아가며 떨어져요. 1~4단계 기본 고정 과녁 다음에는 5~8단계 높은 고정 과녁으로 위쪽 조준을 익혀요. 이어서 이동 과녁, 바람, 높낮이, 양옆 벽, 기둥 순서로 10·20·30·50m를 연습해요. 처음 여덟 단계는 바람이 없어요. 13~16단계의 바람 읽기에서는 멈춘 과녁을 겨누며 옆으로 밀리는 화살을 느껴보세요. 나뭇잎이 흐르는 쪽으로 화살도 밀리니 바람 반대쪽을 겨누고, 멀수록 더 보정해보세요. 상단의 화살표와 수치로 바람 방향과 세기를 확인할 수 있어요. 처음 3개 사격장에서는 점선으로 궤적을 알려줘요. 담장이 있는 단계는 시작할 때 위에서 과녁을 보여줘요. ‘과녁 보기’로 다시 확인할 수 있어요. 양옆 벽 사이로 과녁이 3/4, 1/2, 1/3 보이는 순서로 익혀요. 기둥 연습에서는 움직이는 과녁이 약 3/4 보이도록 배치돼요. 벽과 과녁의 위치는 함께 달라져 틈이 유지되고, 벽에는 과녁 표시가 없어요. 나중에는 지나는 사람 사이의 과녁, 벽 뒤에 완전히 숨은 고정·이동 과녁, 여러 장애물을 섞은 과제를 만나요. 완전히 가린 벽은 과녁을 60·65·70·80m에 두고 벽 뒤에 충분한 공간을 마련했어요. 충분히 당긴 화살도 벽을 넘어 과녁으로 내려오도록 겨눠보세요. 사람이 나오는 판에서는 한 명이 과녁 바로 앞을 빠르게 왕복하거나 여러 명이 겹쳐 지나가다가 잠깐 틈이 열려요. 화살이 도착할 때 틈이 열리도록 기다렸다 쏘세요. 사람에게 맞으면 이번 발사는 0점이에요. 맞은 사람은 다음 발사부터 그 판이 끝날 때까지 빠지고, 새 판에서는 다시 나타나요. 이동 과녁의 속도도 불규칙하게 바뀌어요. 움직이는 원형 과녁은 이전보다 2배 빠르게 움직여요. 토끼·살쾡이·사슴·비둘기·독수리·치타도 각각 10·20·30·50m에서 만나요. 토끼는 껑충 뛰고 살쾡이는 빨라졌다 느려지며, 사슴은 크게 도약해요. 비둘기는 빠르게 상하로 출렁이고 독수리는 완만하게 활공해요. 치타는 강하게 가속하는 구간이 있어요. 독수리는 천천히 활공하고, 나머지 동물은 뒤에 나올수록 몸집에 비해 더 빠르게 움직여요. 동물은 양쪽 중 무작위 방향에서 나타나 속도를 바꾸며 반대편으로 지나가요. 동물은 심장 10점, 머리 8점, 몸통 5점, 다리·귀 3점으로 맞힌 부위에 따라 점수가 달라져요. 화면에 그려진 몸에만 맞고 다리 사이나 몸 주변의 빈 공간은 통과해요. 맞힌 점수만큼 피해가 쌓여 토끼 5점, 살쾡이 8점, 사슴 10점, 비둘기 12점, 독수리 15점, 치타 18점에 도달하면 그 자리에서 쓰러져요. 쓰러진 동물에 다시 맞혀도 점수를 얻지 않아요. 명중 안내에서 부위·점수·남은 체력을 확인하세요.</p></div></div><div class="help-step"><span>04</span><div><strong>코인을 모아 더 좋은 장비로</strong><p>활은 그립감이 높을수록 덜 흔들리고, 탄성이 높을수록 빠르게 쏴요. 화살은 촉·몸통·깃의 조합으로 성능이 정해져요. 총 무게가 가벼우면 같은 활에서 더 빠르게 출발하고, 가는 몸통은 바람과 공기 저항을 줄여요. 큰 깃은 자세를 빨리 잡지만 저항도 늘어요. 상위 화살은 부품을 함께 개선해 기준 속도와 일관성이 좋아지고, 바람과 감속의 영향은 줄어요. 상점에서 재질·굵기와 전체 성능을 비교해보세요. 화살은 일반 12종, 특수 2종, 장거리 5종으로 총 19종이 있어요. 장거리 화살은 60·80·100·120·150m에 맞춰 무게와 공기 저항이 단계적으로 줄어들고, 같은 거리에서 더 빠르게 도착해 덜 떨어져요. 탄성 화살은 과녁에 못 미쳐 땅에 닿으면 한 번 튕겨 더 날아가고, 튕긴 뒤에는 속도가 줄어요. 자석 화살은 실제 표적 중심 5m 안으로 가까워지면 중앙 쪽으로 조금 휘어요. 크게 빗나간 화살을 되돌리거나 벽·기둥을 통과하지는 않아요. 특수 능력은 활·석궁에서만 작동해요. 코치는 활·석궁·총 조준에서 누구나 무료로 쓰는 기본 기능이에요. 구매나 시간 제한 없이 처음부터 켜져 있어요. 낙하·바람·움직이는 표적까지 계산해 명중하기 좋은 순간에 “쏴!” 하고 알려줘요. 좋은 타이밍이 올 때마다 안내하고, 소리를 꺼도 좋은 조준 상태에서는 상단 표시가 계속 켜져요. 게임 메뉴에서 코치를 켜거나 끌 수 있어요. 1~20단계는 기본 활, 21~48단계는 하위 활·석궁, 49~105단계는 중간 활·석궁, 106~220단계는 상위 활·석궁을 기준으로 맞췄어요. 기존 마지막 판 뒤에는 과제 순서대로 60·80·100·120·150m 장거리 100개 판이 이어져요. 장거리에서는 거리별 장거리 화살 5종으로 더 빠르고 낮은 탄도로 쏴보세요. 단계 이름 아래와 단계 목록에 권장 등급이 표시돼요. 상점은 활·화살·조준경으로 나뉘어요. 활 탭은 기본 활 → 일반 석궁 → 레어 석궁 → 총 3종 순서예요. 총을 구매하면 기본 탄환을 함께 받아요. 화살 탭의 총알 목록에서 고속·정밀·직선 탄환을 구매해 모든 총에 사용할 수 있어요. 구매한 총알 종류는 계속 보유하며, 어느 종류든 한 판에 10발을 사용해요. 그립감과 탄성이 번갈아 조금씩 높아지고, 이전 단계의 능력치는 떨어지지 않아요. 능력치별 정렬로도 비교할 수 있어요. 상위 장비로 갈수록 가격 차이가 커져요. 조준경은 2·3·6·8배 네 종류예요. 성장 순서의 무기 1~5번은 2배, 6~10번은 2·3배, 11~15번은 2·3·6배, 16번 이후 석궁과 총은 네 배율을 모두 사용할 수 있어요. 구매한 배율은 해당 무기에 영구 귀속되고, 보유한 배율끼리 무료로 바꿔 장착할 수 있어요. 확대 버튼은 기본 1배와 현재 장착 배율을 오가요. 조준경이 없으면 1배로 보여요. 빠른 동물이 화면 밖으로 벗어나면 1배로 바꿔 동물과 앞쪽 겨냥점을 함께 보세요. 레이저 포인터는 첫 석궁부터 석궁 10종에 각각 ${formatCoins(LASER_PRICE)}코인으로 달 수 있어요. 아래의 영점 조절을 누르면 톱니를 열 수 있어요. 조준을 시작하기 전에 좌우·상하 톱니를 돌려 영점을 맞추세요. 시계 방향은 오른쪽·위쪽, 반대 방향은 왼쪽·아래쪽 보정이에요. 한 칸에 0.05° 또는 0.50°를 고를 수 있고, 톱니 옆에는 +7.50°처럼 보정각이 표시돼요. 이 숫자는 활과 레이저가 벌어진 각도이며 거리를 입력하는 칸이 아니에요. 활을 들어 올린 실제 발사각은 사격장 위쪽에서 확인하세요. 영점을 조절하면 빨간 점은 반대쪽으로 옮겨져요. 빨간 점을 같은 지점에 다시 겨누면 상하 +는 더 높게, 좌우 +는 더 오른쪽으로 발사돼요. 좌우는 바람에 밀리는 방향의 반대로 직접 맞추세요. 빨간 점은 발사 전과 영점 조절 중에도 보여요. 사격장을 누르면 보정 장치는 잠기고, 빨간 점이 화면 가운데에서 나타나요. 포인터로 겨눈 뒤 손을 놓으면 화살이 나가며, 레이저를 켠 동안에도 코치가 실제 화살 궤적을 확인해 알려줘요. 10초가 지나도 자동으로 쏘지 않으며 손을 놓으면 발사해요. 보정이 틀리면 화살도 빗나갈 수 있어요. 레이저와 영점은 해당 무기에 귀속되며 총기에는 달 수 없어요. 본편에는 활 10종·석궁 10종·총 3종과 총알 4종이 있어요. 총은 마지막 석궁 다음에 있고, 같은 사격장에서 사용할 수 있어요. 일반 석궁은 단발, 레어 석궁만 3연발이에요. 레어 등급이 높으면 집탄성이 좋아져 3발이 더 가깝게 모여요. 3연발의 첫 화살은 조준한 방향으로, 나머지 두 발은 그 주변으로 나가요. 발사 기회를 한 번 쓰고 세 발의 점수를 모두 합쳐요. 세 발이 10점에 맞으면 30점이며, 다섯 번 모두 맞히면 150점이에요. 한 발이라도 사람에게 닿으면 이번 발사는 0점이에요. 석궁도 활과 같은 탄도 규칙을 써요. 상위 장비로 바꿔도 그립감이나 탄성이 줄지 않아요. 총기는 전용 탄환을 쓰며 화살 옵션이나 당긴 힘에 영향을 받지 않아요. 총알은 나무벽과 돌벽을 관통해요. 나무벽마다 진입 속도가 20% 줄고 관통 뒤 구간의 낙차가 20% 늘어요. 돌벽은 각각 50%예요. 두 벽의 효과는 곱해서 누적돼요. 직선 탄환도 관통하면 기본탄 낙차의 나무 20%·돌 50%가 생겨요. 두 벽이면 나무 44%·돌 125%·혼합 80%로 누적돼요.</p></div></div></div><div class="help-note">활·석궁은 5번 발사하면 한 판이 끝나고, 총은 10발을 쏘면 한 판이 끝나요. 총으로 새 판을 시작하면 1초 동안 10발을 장전해요. 첫 발을 쏜 뒤에는 활·석궁과 총 사이를 바꿀 수 없으니 발사 전이나 한 판을 마친 뒤 바꿔주세요. 이번 판의 목표 점수를 달성하면 다음 단계로 갈 수 있어요. 부족하면 지금 단계에 다시 도전하거나 이전 단계로 돌아갈 수 있어요. 총 ${STAGES.length}개 미션에 도전해보세요.<br>상단 안정제 버튼에서 직접 사용하면 이번 판 남은 발사의 떨림이 절반으로 줄어요. 한 판에 한 번 사용할 수 있고 새 판에서는 다시 사용해야 해요. 안정제는 게임 코인으로 준비할 수 있으며, 기존 교환 점수와 보유 안정제도 계속 사용할 수 있어요.<br>장비·게임 코인·사격 기록·보유 안정제·코치 설정은 현재 브라우저에 저장돼요.<br>PC: 방향키로 조준 · SPACE를 누르고 있다 놓으면 발사</div><button class="button primary-button" style="width:100%;margin-top:21px" data-action="close">사격하러 가기 ${icon('arrow')}</button>`,true);}
let shopTab='bow',shopWeaponFilter='all',shopSort='progression',shopScopeWeapon=null,shopCoinPack=10;
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
    const label=selected?'장착 중':owned?'보유 · 무료 장착':`${formatCoins(price)} 코인 · 구매`;
    return `<button type="button" class="button scope-button" data-install-scope="${item.id}" data-scope-zoom="${zoom}" aria-label="${item.name} · ${name} · ${label}" aria-pressed="${selected}" ${disabled?'disabled':''}><strong>${zoom}배</strong><small>${label}</small></button>`;
  }).join('');
  return `<div class="item-scope"><span>${equipped>1?`${equipped}배 조준경 장착 중`:'조준경 선택'}</span><small>${isOwned?'구매한 배율은 이 장비에 영구 귀속 · 무료로 교체':'무기를 먼저 구매하면 조준경을 장착할 수 있어요.'}</small><div class="scope-options">${options}</div></div>`;
}
function laserShopMarkup(item,isOwned){
  if(!canEquipLaser(item))return '';
  const owned=!!activeLaser(item.id),disabled=!isOwned||state.mode!=='ready'||(!owned&&progress.coins<LASER_PRICE);
  return `<button type="button" class="button laser-shop-button" data-install-laser="${item.id}" ${disabled?'disabled':''}><strong>${owned?'레이저 영점 조절':`레이저 구매 · ${formatCoins(LASER_PRICE)} 코인`}</strong><small>${state.mode!=='ready'?'다음 조준 전에 조절할 수 있어요':owned?'톱니를 돌려 사전 보정 · 손을 놓으면 발사':'이 석궁에 영구 귀속'}</small></button>`;
}
function shopTabsMarkup(){
  const active=shopTab==='bullet'?'arrow':shopTab;
  return `<div class="shop-top"><nav class="shop-tabs" aria-label="아이템 종류">${[['bow','활'],['arrow','화살'],['scope','조준경'],['coin','코인']].map(([tab,label])=>`<button type="button" class="${active===tab?'active':''}" data-shop-tab="${tab}" aria-pressed="${active===tab}">${label}</button>`).join('')}</nav></div>`;
}
function shopHeadingMarkup(){
  return `<div class="shop-heading"><h2 id="modalTitle">무기 상점</h2><div class="shop-coins">${icon('coin')}<strong>${formatCoins(progress.coins)}</strong></div></div>${('')}${shopTabsMarkup()}`;
}
function creditExchangedCoins(receipt){

  const id=`${receipt.owner}:${receipt.request_id}`;
  // Refresh the shared local save while the exchange client's cross-tab lock is held.
  const latest=loadProgress();
  if(latest.coinExchangeReceipts.includes(id)){progress=latest;updateHeader();return true;}
  if(latest.coins>1e8-receipt.game_coins)return false;
  const previous=progress;
  progress={...latest,coins:latest.coins+receipt.game_coins,coinExchangeReceipts:[...latest.coinExchangeReceipts,id]};
  if(!save()){progress=previous;return false;}
  updateHeader();return true;
}
function showCoinShop(){
  const pending=coinExchange?.pending,busy=!!coinExchange?.busy,available=(!!coinExchange?.available);
  const amount=pending?.zu||shopCoinPack,coins=amount*COINS_PER_ZU,balance=coinExchange?.balance??ammo?.snapshot?.coins;
  const shortage=Number.isSafeInteger(balance)&&balance<amount;
  const needsUpdate=coinExchange?.connection==='update';
  const reason=(!available?needsUpdate?'오락실의 상점 연결을 새로 불러와야 해요. 아래 버튼을 눌러 주세요.':'오락실에서 로그인한 뒤 코인 상점을 열어 주세요.':!pending&&shortage?'표시된 ZU가 부족해요. 교환 버튼을 누르면 현재 잔액으로 다시 확인해요.':'');
  const action=available?'exchange-coins':'connect-coin-shop';
  const label=!available?((needsUpdate?'상점 연결 새로고침':'오락실에서 코인 교환')):busy?'교환 확인 중…':pending?'교환 내역 다시 확인':`${formatCoins(amount)} ZU → ${formatCoins(coins)}코인 교환`;
  openModal('shop',`<div class="shop-layout">${shopHeadingMarkup()}<section class="shop-coin-panel" aria-label="코인 교환"><h3>코인 교환</h3><p>10 ZU = 100코인</p>${available&&Number.isSafeInteger(balance)?`<p class="shop-zu-balance">보유 <strong>${formatCoins(balance)} ZU</strong></p>`:''}<div class="coin-pack-options" aria-label="교환할 ZU 선택">${COIN_PACKS.map(zu=>`<button type="button" class="button coin-pack-button" data-coin-pack="${zu}" aria-pressed="${amount===zu}" ${busy||pending?'disabled':''}><strong>${formatCoins(zu)} ZU</strong><small>${formatCoins(zu*COINS_PER_ZU)}코인</small></button>`).join('')}</div><button type="button" class="button primary-button coin-exchange-button" data-action="${action}" ${busy?'disabled':''}>${label}</button><p class="coin-exchange-notice" role="status">${coinExchange?.notice||reason||'교환한 코인으로 활·화살·조준경을 구매하세요.'}</p><small class="shop-coin-save-note">게임 코인과 장비는 현재 기기에 저장돼요.</small></section></div>`);
}
function reconnectCoinShop(){
  if(state.modal!=='shop'||shopTab!=='coin'||coinExchange?.busy)return;
  if((!save())){toast('진행 상황을 저장하지 못했어요. 저장 공간을 확인해 주세요.');return;}
  // Re-open the authenticated host too: replacing only game assets leaves an
  // already-open shell without the new account-bound purchase callbacks.
  const url=window.location.origin+'/world.html?tab=arcade&game=archery&archery_shop=coin&game_update=20261104-archery-reset5';
  try{window.parent.location.replace(url);}catch{window.location.assign(url);}
}
async function exchangeShopCoins(){
  if((state.modal!=='shop'||shopTab!=='coin')||!coinExchange?.available||coinExchange.busy)return;
  if(guardAmmoAction())return;
  if(!coinExchange.pending&&progress.coins>1e8-shopCoinPack*COINS_PER_ZU){toast('게임 코인을 사용한 뒤 교환해 주세요.');return;}
  const result=await (coinExchange.pending?coinExchange.retry():coinExchange.exchange(shopCoinPack));
  if(result.ok){sound('buy');toast(coinExchange.notice);void ammo?.refresh?.();}
}
function showScopeShop(){
  const weapons=BOWS.filter(item=>progress.ownedBows.includes(item.id)&&item.scopeMagnifications?.length);
  const item=weapons.find(item=>item.id===shopScopeWeapon)||weapons[0];
  if(!item)return;
  shopScopeWeapon=item.id;
  const options=weapons.map(weapon=>`<option value="${weapon.id}" ${weapon.id===item.id?'selected':''}>${weapon.name}${weapon.id===progress.bow?' · 사용 중':''}</option>`).join('');
  openModal('shop',`<div class="shop-layout">${shopHeadingMarkup()}<section class="shop-scope-panel" aria-label="조준경 구매"><label for="shopScopeWeapon">장착할 무기</label><select id="shopScopeWeapon">${options}</select><p class="shop-scope-hint">선택한 무기에 맞는 조준경이에요. 구매하면 이 무기에 바로 장착돼요.</p>${scopeOptionsMarkup(item,true)}${laserShopMarkup(item,true)}</section><p class="shop-footnote">조준경은 무기별로 보관돼요. 보유한 배율은 무료로 바꿀 수 있어요.<br>다른 무기의 조준경을 구매해도 현재 사용 중인 무기는 바뀌지 않아요.</p></div>`);
}
function showShop(tab=shopTab,scopeWeaponId){
  if(guardAmmoAction())return;
  if(state.mode==='flight'||state.mode==='settling'){toast('이번 발사가 끝난 뒤 상점을 열 수 있어요.');return;}
  if(!['bow','arrow','bullet','scope','coin'].includes(tab))tab='bow';
  if(tab==='coin'){const entering=shopTab!=='coin';shopTab=tab;showCoinShop();if(entering)void refreshAmmoStatus();return;}
  if(tab==='scope'){
    if(Number.isInteger(scopeWeaponId)&&progress.ownedBows.includes(scopeWeaponId))shopScopeWeapon=scopeWeaponId;
    else if(shopTab!=='scope'||!progress.ownedBows.includes(shopScopeWeapon))shopScopeWeapon=progress.bow;
    shopTab=tab;showScopeShop();return;
  }
  shopTab=tab;
  const isBow=tab==='bow',isBullet=tab==='bullet',catalog=isBow?BOWS:isBullet?BULLETS:ARROWS;
  const sortOptions=isBullet?[['progression','기본 → 고속 → 정밀 → 직선']]:isBow
    ?[['progression','성능순 · 활 → 석궁 → 총'],['grip','그립감 높은 순'],['elasticity','탄성·위력 높은 순'],['steady','조준 안정 시간이 긴 순'],['grouping','3연발 집탄성이 높은 순']]
    :[['progression','성능순 · 기본 → 상위'],['wind','바람 영향 적은 순'],['stability','일관성이 높은 순'],['tip-light','촉이 가벼운 순'],['tip-heavy','촉이 무거운 순']];
  if(!sortOptions.some(([key])=>key===shopSort))shopSort='progression';
  const filtered=isBow&&shopWeaponFilter!=='all'?catalog.filter(item=>shopWeaponFilter==='crossbow-single'?item.weaponType==='crossbow'&&item.burstCount===1:shopWeaponFilter==='crossbow-burst'?item.weaponType==='crossbow'&&item.burstCount>1:item.weaponType===shopWeaponFilter):catalog;
  const items=sortEquipment(filtered,shopSort);
  const owned=isBow?progress.ownedBows:isBullet?progress.ownedBullets:progress.ownedArrows,equipped=progress[tab];
  const b=activeBow(),a=activeArrow(),selectedBullet=activeBullet(),projectile=activeProjectile(),comboSpeed=getSpeed({bow:b,arrow:a,bullet:selectedBullet,charge:1,velocityBias:0}).toFixed(1);
  const expandedItems=new Set(Array.from(document.querySelectorAll('details[data-equipment-details][open]'),element=>element.dataset.equipmentDetails));
  const cards=items.map(item=>{
    const isOwned=owned.includes(item.id),isEquipped=isOwned&&item.id===equipped,gun=item.weaponType==='gun',burst=item.burstCount>1;
    const categoryLocked=isBow&&weaponCategoryLocked(item),bulletLocked=isBullet&&!ownsGun(),noSway=gun&&item.handSwayFactor===0;
    const shortfall=Math.max(0,item.price-progress.coins);
    const scopeLink=isBow&&isOwned&&item.scopeMagnifications?.length?`<button type="button" class="button item-scope-link" data-scope-weapon="${item.id}">조준경${canEquipLaser(item)?' · 레이저':''} 보기</button>`:'';
    const speed=isBullet?item.muzzleSpeed.toFixed(1):getSpeed({bow:isBow?item:b,arrow:isBow?a:item,bullet:selectedBullet,charge:1,velocityBias:0}).toFixed(1);
    let stats=isBow
      ?`${statMeter('그립감',item.grip)}${gun?'':statMeter('탄성',item.elasticity)}${statRow('조준 안정',noSway?'항상 안정':`${formatSeconds(weaponSteadyDuration(item))}초`)}${statRow('발사 방식',burst?'레어 · 3연발':'단발')}`
      :isBullet?`${statRow('탄속',`${speed} m/s`)}${statRow('기본 탄환 대비 속도',`${formatStat(item.speedRatio)}배`)}${statRow('같은 거리의 낙하량',item.dropRatio===0?'없음 · 직선':`${Math.round(item.dropRatio*100)}%`)}${statRow('적용 무기','총 3종 공용')}${statRow('사용 방식','영구 보유 · 한 판 10발')}`
      :`${statRow('촉',`${item.tip.material} · ${item.tip.shape}`)}${statRow('촉 무게',`${formatStat(item.tipMass)} g`)}${statRow('몸통',`${item.shaft.material} · ${formatStat(item.shaft.diameter)} mm`)}${statRow('몸통 무게',`${formatStat(item.shaftMass)} g`)}${statRow('깃',`${item.fletching.material} · ${item.fletching.name}`)}${statRow('깃 무게',`${formatStat(item.fletching.mass)} g`)}${statRow('총 무게',`${formatStat(getArrowMass(item))} g`)}${statRow('바람 영향',`${Math.round(getWindResponse(item)*100)}%`)}${statRow('감속 영향',`${Math.round(getArrowDragRate(item)/getArrowDragRate(ARROWS[0])*100)}%`)}${statRow('일관성',`${formatStat(getArrowConsistency(item))} / 100`)}${statRow('속도 편차',`±${Math.round(getArrowVariance(item)*1000)/10}%`)}`;
    if(isBow&&item.gearLabel)stats=statRow('장비 등급',item.gearLabel)+stats;
    if(!isBow&&!isBullet&&item.longRange)stats=statRow('권장 장거리',`${item.recommendedDistance}m · 속도·직진성 강화`)+stats;
    if(!isBow&&!isBullet&&item.ability)stats=statRow('특수 능력',item.ability.label)+stats+statRow(item.ability.type==='bounce'?'반발':'유도',item.ability.type==='bounce'?'과녁 앞 · 1회':'중심 5m 이내');
    if(burst)stats+=`${statMeter('집탄성',item.grouping)}${statRow('3발 퍼짐',item.grouping>=90?'매우 좁음':item.grouping>=80?'좁음':item.grouping>=65?'보통':item.grouping>=45?'조금 넓음':'넓음')}`;
    if(gun)stats+=`${statRow('손떨림',noSway?'없음':`기본 총의 ${Math.round((item.handSwayFactor??1)*100)}%`)}${statRow('선택한 탄환',selectedBullet.name)}${statRow('한 판',`${item.magazineSize}발`)}${statRow('장전',`${item.reloadSeconds.toFixed(1)}초`)}`;
    const combo=isBullet?statRow('기본 탄환',item.id===0?'총 구매 시 무료 지급':'총 구매 후 업그레이드'):!isBow&&usingGun()?statRow('현재 총기에 적용','활·석궁 전용'):statRow(gun?'전용 탄환 기준':isBow?'현재 화살과 조합':'현재 활과 조합',`${speed} m/s`);
    const category=isBow?(gun?'유료 총기 · 한 판 10발':item.weaponType==='crossbow'?(burst?'레어 3연발':'단발 석궁'):'활 · 단발'):isBullet?'총 3종 공용':item.tag;
    const detailKey=`${tab}:${item.id}`;
    const quick=isBullet?`탄속 ${formatStat(item.speedRatio)}배 · ${item.dropRatio===0?'낙하 없음':`낙하 ${Math.round(item.dropRatio*100)}%`}`:gun?`${noSway?'항상 안정':`손떨림 ${Math.round((item.handSwayFactor??1)*100)}%`} · 한 판 ${item.magazineSize}발`:isBow?`${formatSeconds(weaponSteadyDuration(item))}초 조준 안정 · ${speed} m/s`:`${formatStat(getArrowMass(item))} g · 바람 영향 ${Math.round(getWindResponse(item)*100)}%`;
    const detailLabel=isBullet?'탄환 자세히':'성능 자세히';
    const priceLabel=(item.price===0?'기본 지급':isOwned?'보유 장비':`${formatCoins(item.price)} 코인`);
    const actionLabel=bulletLocked?(item.id===0?'총 구매 시 지급':'총 구매 후 사용'):categoryLocked?'판이 끝난 뒤 장착':isEquipped?'장착 중':isOwned?'장착하기':shortfall?'코인 부족':'구매하고 장착';
    return `<article class="item-card item-card-compact ${isEquipped?'equipped':''} ${burst?'rare-item':''}" data-equipment="${tab}" data-equipment-id="${item.id}"><div class="item-card-summary"><div class="item-art"><span class="item-rank">${String(item.shopRank).padStart(2,'0')}</span><canvas data-item-art="${item.id}" width="240" height="240" aria-label="${item.name}"></canvas></div><div class="item-main"><div class="item-meta"><span class="item-tag">${category}</span>${isOwned?`<span class="item-owned">${isEquipped?'장착 중':('보유')}</span>`:''}</div><h3>${item.name}</h3><p class="item-quick">${quick}</p><div class="item-purchase"><div class="item-price"><strong>${priceLabel}</strong></div><div class="item-actions"><button class="button ${isEquipped?'':'primary-button'}" data-equip="${item.id}" ${isEquipped||categoryLocked||bulletLocked||(!isOwned&&shortfall)?'disabled':''}>${actionLabel}</button></div></div>${scopeLink}</div></div><details class="item-details" data-equipment-details="${detailKey}" ${expandedItems.has(detailKey)?'open':''}><summary><span>${detailLabel}</span><span class="item-detail-indicator" aria-hidden="true">+</span></summary><div class="item-detail-body"><p class="item-description">${item.description}</p><div class="item-traits">${stats}</div><div class="item-combination">${combo}</div>${(isOwned)?`<div class="item-list-price">${statRow('기본 가격',item.price===0?'기본 지급':`${formatCoins(item.price)} 코인`)}</div>`:''}${!isOwned&&shortfall?`<p class="item-budget">${formatCoins(shortfall)} 코인 더 필요해요</p>`:''}</div></details></article>`;
  }).join('');
  const filters=isBow?`<div class="weapon-filters" aria-label="무기 종류">${[['all',`전체 ${BOWS.length}종`],['bow','활 10종'],['crossbow','석궁 전체 10종'],['crossbow-single','단발 석궁 5종'],['crossbow-burst','레어 3연발 5종'],['gun',`총 ${BOWS.filter(item=>item.weaponType==='gun').length}종`]].map(([type,label])=>`<button type="button" class="${shopWeaponFilter===type?'active':''}" data-weapon-filter="${type}">${label}</button>`).join('')}</div>`:'';
  const projectileFilters=isBow?'':`<div class="weapon-filters projectile-filters" aria-label="화살과 총알">${[['arrow',`화살 ${ARROWS.length}종`],['bullet',`총알 ${BULLETS.length}종`]].map(([kind,label])=>`<button type="button" class="${tab===kind?'active':''}" data-projectile-tab="${kind}" aria-pressed="${tab===kind}">${label}</button>`).join('')}</div>`;
  const sorting=isBullet?`<p class="shop-bullet-note">${ownsGun()?'기본 탄환 대비 성능 · 모든 총에서 함께 사용해요.':'총을 먼저 구매하세요. 기본 탄환은 함께 지급돼요.'}</p>`:`<div class="shop-sort"><label for="shopSort">능력치 정렬</label><select id="shopSort" data-shop-sort aria-label="장비 정렬">${sortOptions.map(([key,label])=>`<option value="${key}" ${key===shopSort?'selected':''}>${label}</option>`).join('')}</select></div>`;
  const sortNotes=isBullet?{progression:'총알은 한 번 구매하면 계속 보유해요. 모든 총이 같은 보유 목록과 선택한 탄환을 공유하며, 새 판마다 선택한 탄환 10발을 준비해요. 별도의 총알 재고는 없어요.'}:isBow?{
    progression:'활 10종 → 일반 단발 석궁 5종 → 레어 3연발 석궁 5종 → 총 3종 순서예요. 총은 기본 손떨림, 25% 손떨림, 항상 안정의 세 단계예요. 총알은 총 3종이 함께 사용해요.',
    grip:'그립감이 높은 순서예요. 그립감이 높을수록 조준 흔들림이 줄어요. 실제 속도와 조준 안정 시간도 함께 비교하세요.',
    elasticity:'활·석궁의 탄성과 총의 위력 순서예요. 활·석궁의 실제 속도는 당긴 힘과 화살도 영향을 받아요. 총은 전용 탄환의 고정된 속도로 발사해요.',
    steady:'무진동 저격총은 항상 안정 상태예요. 다른 장비는 한 번 조준할 때 1~10초 안의 무작위 구간에서 잠시 흔들림이 멈춰요.',
    grouping:'레어 3연발 석궁을 집탄성이 높은 순서로 먼저 보여줘요. 높을수록 3발이 더 가까이 모여요. 단발 장비는 그다음에 보여줘요.'
  }:{
    progression:'일반 화살 12종은 촉·몸통·깃을 함께 개선해요. 상위로 갈수록 총 무게는 줄고, 기준 속도와 일관성은 좋아지며 바람 영향과 감속은 줄어요. 특수 화살 2종과 장거리 화살 5종도 비교해보세요.',
    wind:'바람 영향이 작은 순서예요. 나무 화살을 100%로 비교해요. 몸통·깃이 받는 옆바람과 화살 전체 무게를 함께 반영해요.',
    stability:'화살 전체의 일관성이 높은 순서예요. 촉·몸통의 정밀도와 깃의 제어를 함께 반영하며, 높을수록 발사할 때마다 생기는 속도 편차가 작아요.',
    'tip-light':'촉이 가벼운 순서예요. 실제 발사 속도는 몸통·깃까지 합친 총 무게에 따라 달라져요. 전체 속도와 바람 영향도 함께 비교하세요.',
    'tip-heavy':'촉이 무거운 순서예요. 촉의 무게만으로 전체 성능을 판단할 수 없어요. 총 무게와 몸통·깃의 조합도 함께 비교하세요.'
  };
  const orderNote=sortNotes[shopSort];
  const guide=isBullet
    ?'총을 구매하면 기본 탄환이 무료로 지급돼요. 고속·정밀·직선 탄환은 한 번 구매해 계속 사용할 수 있어요.<br>성능은 기본 탄환과 같은 거리에서 비교해요. 직선 탄환은 기본 탄환보다 3배 빠르고 벽에 닿기 전까지 곧게 날아요.<br>한 판 10발을 모두 쏘면 끝나고, 새 판에서는 1초 동안 다시 10발을 준비해요.<br>나무벽 관통: 속도 ×0.8 · 관통 뒤 낙차 ×1.2. 돌벽 관통: 속도 ×0.5 · 낙차 ×1.5. 여러 벽은 곱해서 누적하며, 직선 탄환도 관통하면 기본탄 대비 나무 20%·돌 50%의 낙차가 생겨요. 두 벽은 나무 44%·돌 125%·혼합 80%예요.'
    :isBow?'기본총을 포함한 총 3종은 모두 코인으로 구매해야 해요.<br>활·석궁은 한 판에 5번, 총은 한 판에 10발을 발사해요. 레어 석궁은 한 번에 3발을 쏘고 세 발의 점수를 합산해요.<br>첫 발 이후에는 활·석궁과 총 사이를 바꿀 수 없어요. 판을 시작하기 전이나 끝낸 뒤 바꿔주세요.<br>총 3종은 기본 손떨림 100% → 25% → 손떨림 없음 순서예요. 무진동 저격총은 조준하는 동안 항상 안정돼요. 총 구매 시 기본 탄환을 함께 받아요.<br>조준경은 2·3·6·8배이며 장비마다 사용할 수 있는 배율이 달라요. 구매한 배율은 해당 무기에 영구 귀속되고, 보유 배율끼리는 무료로 교체해요.<br>석궁의 레이저는 해당 무기에 영구 귀속돼요. 조준 전에 영점을 맞춘 뒤 빨간 점으로 겨누고 손을 놓으면 발사해요. 레이저로 조준할 때도 코치 안내가 나와요.'
    :'바람·감속 영향은 나무 화살을 100%로 비교해요. 낮을수록 바람에 덜 밀리고 속도를 오래 유지해요.<br>촉·몸통·깃의 무게와 형태가 함께 성능을 만들어요. 전체 성능과 조합 속도를 함께 비교하세요.<br>장거리 화살은 60·80·100·120·150m에 맞춰 무게와 저항을 줄였어요. 탄성 화살은 한 번 튕기고, 자석 화살은 표적 중심 5m 안에서 조금 휘어요.<br>화살과 화살의 특수 능력은 활·석궁에서 사용해요. 총은 화살 탭의 총알 목록에서 선택한 전용 탄환을 써요.';
  openModal('shop',`<div class="shop-layout">${shopHeadingMarkup()}<details class="shop-loadout"><summary><span>장착 중</span><strong>${b.name}</strong><span class="item-detail-indicator" aria-hidden="true">+</span></summary><div class="shop-loadout-body"><strong>${projectile.name}${hasScope()?` · ${equippedScope()}배 조준경`:''}</strong><span>발사속도 ${comboSpeed} m/s · ${usingGun()&&b.handSwayFactor===0?'항상 안정':`조준 안정 ${formatSeconds(weaponSteadyDuration(b))}초`}</span>${usingGun()?'<span>한 판 10발 · 새 판 장전 1초</span>':''}</div></details><div class="shop-controls">${filters}${projectileFilters}${sorting}</div><div class="shop-grid">${cards}</div><details class="shop-guide"><summary><span>장비 선택 안내</span><span class="item-detail-indicator" aria-hidden="true">+</span></summary><p class="shop-order-note">${orderNote}</p><p class="shop-footnote">${guide}<br>${('게임에서 모은 코인으로 구매하고 계속 보유할 수 있어요.')}</p></details></div>`);
  for(const cv of document.querySelectorAll('[data-item-art]')){const item=items.find(entry=>entry.id===+cv.dataset.itemArt);drawEquipmentIcon(cv.getContext('2d'),cv.width,cv.height,{...item,kind:tab,tier:item.visualTier??item.id,scopeMounted:isBow&&hasScope(item.id)});}
}
function toggleCoach(){
  if(state.modal!=='menu')return;
  progress.coachEnabled=!progress.coachEnabled;state.coachReady=false;state.coachCueUntil=0;
  stopCoachVoice();setCoachCue(false);save();showMenu();
  $('modalContent').querySelector?.('[data-action="toggle-coach"]')?.focus();
}
function equipItem(id){
  if(guardAmmoAction()||state.mode==='flight'||state.mode==='settling')return;
  const kind=shopTab,catalog=kind==='bow'?BOWS:kind==='arrow'?ARROWS:kind==='bullet'?BULLETS:null;
  const inventoryKey=kind==='bow'?'ownedBows':kind==='arrow'?'ownedArrows':'ownedBullets';
  const item=catalog?.[id],owned=progress[inventoryKey];
  if(!item)return;
  if(kind==='bullet'&&!ownsGun()){toast('총을 먼저 구매하면 기본 탄환을 함께 받아요.');return;}
  if(kind==='bow'&&weaponCategoryLocked(item)){toast('총과 활·석궁은 판을 시작하기 전에 바꿀 수 있어요.');return;}
  const alreadyOwned=owned.includes(id),coins=progress.coins,previous=progress[kind],previousOwned=[...owned];
  const previousBullets=[...progress.ownedBullets],previousBullet=progress.bullet;
  if(!alreadyOwned){if(progress.coins<item.price){toast('코인을 조금 더 모아보세요.');return;}progress.coins-=item.price;owned.push(id);}
  progress[kind]=id;
  const grantBasic=kind==='bow'&&item.weaponType==='gun'&&!progress.ownedBullets.includes(0);
  if(grantBasic)progress.ownedBullets.unshift(0);
  if(kind==='bow'&&item.weaponType==='gun'&&!progress.ownedBullets.includes(progress.bullet))progress.bullet=0;
  if(!save()){
    progress.coins=coins;progress[kind]=previous;progress[inventoryKey]=previousOwned;
    progress.ownedBullets=previousBullets;progress.bullet=previousBullet;
    toast('장비를 저장하지 못해 구매와 장착을 취소했어요.');return;
  }
  if(kind==='bow'){
    if(state.mode!=='finished'&&state.used===0){state.roundShotLimit=usingGun()?10:state.stage.shots;prepareGunRound();}
    setAimZoom(equippedScope());
  }
  if(!alreadyOwned)sound('buy');toast(`${item.name} ${alreadyOwned?'장착 완료':'구매 완료! 바로 장착했어요.'}${grantBasic?' · 기본 탄환 지급':''}`);
  state.sway=createSway();state.guide=null;updateHeader();updateRound();showShop(kind);
}
function starsFor(score,goal){return score<goal?0:score>=44?3:score>=34?2:1;}
function stageChoiceMarkup(className){
  const level=mainStageForChoices(),busy=ammoLocked()||state.mode==='flight'||state.mode==='settling';
  const next=canAdvanceStage(),nextHint=level>=STAGES.length?'마지막 단계':next?`${level+1}단계`:mainRoundCleared()&&!stageAvailable(level+1)?'앞 단계 통과 후':'이번 판 통과 후';
  return `<div class="${className}" aria-label="이어 할 활쏘기 단계 선택"><button class="button stage-choice" data-action="previous-stage" data-game-result-play ${!stageAvailable(level-1)||busy?'disabled':''}><strong>이전 단계</strong><small>${level<=1?'첫 단계':`${level-1}단계`}</small></button><button class="button stage-choice" data-action="retry" data-game-result-play ${busy?'disabled':''}><strong>지금 단계</strong><small>${level}단계 다시</small></button><button class="button stage-choice primary-button" data-action="next-stage" data-game-result-play ${!next||busy?'disabled':''}><strong>다음 단계</strong><small>${nextHint}</small></button></div>`;
}

function showResult(passed,bonus){
  state.resultSummary={passed,bonus};
  const level=mainStageForChoices(),stars=starsFor(state.score,state.stage.goal),cleared=mainRoundCleared();
  const title=`${level}단계 ${cleared?'통과':'다시 도전'}`;
  const description=(cleared?'목표를 달성했어요. 이어 할 단계를 골라주세요.':`목표 ${state.stage.goal}점에 도달하지 못했어요. 지금 단계에 다시 도전해 보세요.`);
  const metrics=`<div><small>이번 점수</small><strong>${state.score}</strong><em>/ ${roundMaxScore()}</em></div><div><small>명중 발수</small><strong>${state.arrowHits}</strong><em>/ ${roundMaxScore()/10}발</em></div>`;
  const note=(bonus?`목표 달성 보너스 ${bonus}코인이 포함되어 있어요.`:'이번에 얻은 코인은 그대로 남아 있어요.');
  openModal('result',`<div class="result-content"><div class="result-emblem">${icon(passed?'target':'wind')}</div><p class="eyebrow">YOUR NEXT SHOT</p><h2 id="modalTitle">${title}</h2><p>${description}</p><div class="result-stars" aria-label="별 ${stars}개">${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</div><div class="result-metrics">${metrics}<div><small>${('획득 코인')}</small><strong>+${state.earned}</strong></div></div>${stageChoiceMarkup('result-actions stage-result-actions')}<button type="button" class="button primary-button result-shop-button" data-action="result-shop">${icon('bag')}<span><strong>장비 구매</strong><small>활 · 화살 · 조준경 · 코인</small></span>${icon('arrow')}</button><p class="result-note">${note}</p>${ammo?.pending?'<button class="button soft-button" data-action="retry-ammo">이전 처리 다시 확인</button>':''}<button class="text-button" data-action="menu">메뉴</button></div>`,true);
  const content=window.OjjudaGameResults&&$('modalContent').querySelector?.('.result-content');
  if((window.OjjudaGameResults)&&content){
    const extra=[...content.querySelectorAll('[data-action="retry-ammo"]')];
    window.OjjudaGameResults.decorate(content,{game:'archery',outcome:cleared?'success':'failure',metric:`${level}단계 · ${state.score} / ${state.stage.goal}점`,score:state.score,key:state.runId,actions:[content.querySelector('.stage-result-actions'),content.querySelector('[data-action="result-shop"]')],extra});
    const heading=content.querySelector('h2');if(heading)$('modal').setAttribute('aria-labelledby',heading.id);
    content.querySelector('[data-action="retry"]')?.focus();
  }
}
function showMenu(){

  const level=mainStageForChoices(),finished=state.mode==='finished';
  const action=(name,symbol,title,detail)=>`<button class="menu-action" data-action="${name}">${icon(symbol)}<span><strong>${title}</strong><small>${detail}</small></span></button>`;
  const choices=stageChoiceMarkup('menu-stage-actions');
  const route=action('stages','grid','전체 단계',(`${progress.unlocked}단계까지 열림 · 클리어한 판 다시 하기`));
  const subtitle=(`지금 ${level}단계 · ${usingGun()?'총 10발':'활·석궁 5회'} 사격`);
  const coachSetting=`<button class="menu-action" data-action="toggle-coach" aria-pressed="${progress.coachEnabled}">${icon('target')}<span><strong>코치 ${progress.coachEnabled?'켜짐':'꺼짐'}</strong><small>무료 기본 기능 · 눌러서 ${progress.coachEnabled?'끄기':'켜기'}</small></span></button>`;
  openModal('menu',`<div class="game-menu"><p class="eyebrow">TAKE YOUR NEXT SHOT</p><h2 id="modalTitle">게임 메뉴</h2><p class="modal-subtitle">${subtitle}</p>${choices}<div class="menu-actions">${route}${action('weapons','bag','무기 상점',('활 10종 · 석궁 10종 · 총 3종 · 총알 4종'))}${action('stabilizers','tonic','안정제',(`${progress.stabilizers}개 보유 · 이번 판 떨림 50%`))}<button class="menu-action" data-action="toggle-sound" aria-pressed="${progress.sound}">${icon(progress.sound?'sound':'mute')}<span><strong>소리 ${progress.sound?'켜짐':'꺼짐'}</strong><small>눌러서 ${progress.sound?'끄기':'켜기'}</small></span></button>${coachSetting}${action('help','help','게임 방법','조준·장비·발사각 안내')}</div><button class="button primary-button" data-action="close">${finished?'결과로 돌아가기':'게임 계속하기'}</button></div>`,true);
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
  openModal('stages',`<p class="eyebrow">FOLLOW YOUR OWN TRAIL</p><h2 id="modalTitle">어느 숲길로 갈까요?</h2><p class="modal-subtitle">총 ${STAGES.length}개 미션 · 고정 과녁부터 이동·가림막·동물·복합 장애물까지 한 가지씩 익혀요. 121~220단계는 60·80·100·120·150m 장거리 미션이에요. 상위 활·석궁과 거리별 장거리 화살을 권장해요. ${('앞 단계를 통과하면 다음 단계가 열려요. 클리어한 판은 다시 선택할 수 있어요.')}</p><nav class="stage-range-nav" aria-label="단계 구간">${ranges.map(range=>`<button type="button" data-stage-range="${range.first}" aria-label="${range.first}~${range.last}단계 ${range.gearLabel} 권장"><strong>${range.first}–${range.last}</strong><small>${range.name}</small></button>`).join('')}</nav><div class="stage-grid">${STAGES.map(s=>{const locked=!stageAvailable(s.id),best=progress.best[s.id]||0,stars=starsFor(best,s.goal),range=chapters.find(chapter=>chapter.chapterId===s.chapterId);return `${s.id===range.first?`<h3 class="stage-section-title" id="stage-chapter-${s.chapterId}">${String(s.id).padStart(2,'0')}–${range.last} · ${range.name}</h3>`:''}<button class="stage-card ${s.id===state.stage.id?'active':''}" id="stage-range-${s.id}" data-stage="${s.id}" ${locked?'disabled':''} aria-label="${s.id}단계 ${s.name}${locked?' 잠김':''}"><span class="stage-index">${String(s.id).padStart(2,'0')}${locked?' · 잠김':''}</span><strong>${s.name}</strong><small>${s.gearLabel}${s.longRange?` + ${s.distance}m 화살`:""} 권장</small><small>${s.distance}m · 목표 점수 ${s.goal}점</small><span class="stage-stars">${locked?'앞 단계를 통과하세요':'★'.repeat(stars)+'☆'.repeat(3-stars)}</span></button>`}).join('')}</div>`);
}
document.addEventListener('click',e=>{

  const btn=e.target.closest('button');if(!btn||btn.disabled)return;
  if(btn.classList.contains('shop-open'))showShop();
  if(btn.dataset.shopTab)showShop(btn.dataset.shopTab==='arrow'&&usingGun()?'bullet':btn.dataset.shopTab);
  if(['arrow','bullet'].includes(btn.dataset.projectileTab))showShop(btn.dataset.projectileTab);
  if(btn.dataset.coinPack!==undefined&&COIN_PACKS.includes(Number(btn.dataset.coinPack))&&!coinExchange?.busy&&!coinExchange?.pending){shopCoinPack=Number(btn.dataset.coinPack);showShop('coin');}
  if(btn.dataset.scopeWeapon!==undefined)showShop('scope',Number(btn.dataset.scopeWeapon));
  if(btn.dataset.weaponFilter&&['all','bow','crossbow','crossbow-single','crossbow-burst','gun'].includes(btn.dataset.weaponFilter)){shopWeaponFilter=btn.dataset.weaponFilter;showShop('bow');}
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
  if(act==='exchange-coins')void exchangeShopCoins();
  if(act==='connect-coin-shop')reconnectCoinShop();
  if(act==='buy-stabilizer')buyStabilizer();
  if(act==='toggle-coach')toggleCoach();
  if(act==='use-stabilizer')useStabilizer();
  if(act==='retry-ammo')retryAmmo();
  if(act==='close')closeModal();
  if(['retry','previous-stage','next-stage','next'].includes(act)&&['result','menu'].includes(state.modal))navigateStage(act==='retry'?0:act==='previous-stage'?-1:1);
  if(act==='result-shop'&&['result','menu'].includes(state.modal)||act==='weapons')showShop('bow');
  if(act==='menu')showMenu();
  if(act==='stages')showStages();
  if(act==='help')showHelp();
  if(act==='stabilizers')showStabilizers();
  if(act==='toggle-sound'&&state.modal==='menu'){progress.sound=!progress.sound;save();updateHeader();showMenu();if(progress.sound)sound('hit');$('modalContent').querySelector?.('[data-action="toggle-sound"]')?.focus();}
});
document.addEventListener('change',e=>{

  if(state.modal!=='shop'||!['shopSort','shopScopeWeapon'].includes(e.target.id))return;
  const returnFocus=state.lastFocus,id=e.target.id;
  if(id==='shopScopeWeapon')showShop('scope',Number(e.target.value));
  else{shopSort=e.target.value;showShop(shopTab);}
  state.lastFocus=returnFocus;$(id).focus();
});
$('menuBtn').addEventListener('click',showMenu);$('modalClose').addEventListener('click',closeModal);
$('ammoRetryBtn').addEventListener('click',retryAmmo);
$('stabilizerBtn').addEventListener('click',showStabilizers);
$('modalBackdrop').addEventListener('click',e=>{if(e.target===$('modalBackdrop'))closeModal();});
$('zoomBtn').addEventListener('click',()=>{if((state.modal)||ammoLocked()||state.mode==='flight'||state.mode==='settling'||state.mode==='preview')return;cancelDraw();setAimZoom(state.zoom===1?maximumZoom():1);updateZoomControl();});
$('recenterBtn').addEventListener('click',()=>{if((ammoLocked())||state.mode==='flight'||state.mode==='settling'||state.mode==='preview')return;cancelDraw();recenter();});
$('previewBtn').addEventListener('click',()=>{state.mode==='preview'?returnFromPreview():beginTargetPreview();});
document.addEventListener('keydown',e=>{

  if(e.code==='Escape'){if(state.laserAdjustOpen){e.preventDefault();closeLaserAdjustments(true);}else if(state.modal)closeModal();else cancelDraw();return;}
  if(state.modal){
    if(e.code==='Tab'){const focusable=[...$('modal').querySelectorAll('button:not(:disabled):not(.hidden),select:not(:disabled),[tabindex="0"]')];const first=focusable[0],last=focusable.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    return;
  }
  if(e.code.startsWith('Arrow')){e.preventDefault();keys.add(e.code);}
  if(e.code==='Space'&&!e.repeat&&!(document.activeElement?.tagName==='BUTTON')){e.preventDefault();beginDraw();}
});
document.addEventListener('keyup',e=>{;keys.delete(e.code);if(e.code==='Space'&&!state.modal&&!pointer){e.preventDefault();releaseShot();}});
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
  if(state.mode!=='drawing'||state.stage.id>3||laserEnabled())return;
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
  const targets=new Map([target].map(subject=>[subject.passId,subject]));
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
  const addArrow=(tip,velocity,alpha=1,flying=false,projectileType='arrow',presentation={})=>{
    if(tip.z-camera.z<.6)return;
    if(projectileType==='bullet'){items.push({kind:'bullet',z:surfaceDepth(tip),order:4,point:tip,velocity,alpha,flying,...presentation});return;}
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
    if(mark.projectileType!=='bullet'&&replay&&!replay.reducedMotion&&mark===state.cinematic.shot.targetMark&&replay.impactAge>=0&&replay.impactAge<.60){
      const age=replay.impactAge,decay=(1-age/.60)**2;
      const yaw=.085*Math.sin(age*Math.PI*22)*decay,pitch=.05*Math.sin(age*Math.PI*26)*decay;
      const side=visualVelocity.x*Math.cos(yaw)+visualVelocity.z*Math.sin(yaw),forward=visualVelocity.z*Math.cos(yaw)-visualVelocity.x*Math.sin(yaw);
      visualVelocity={x:side,y:visualVelocity.y*Math.cos(pitch)-forward*Math.sin(pitch),z:forward*Math.cos(pitch)+visualVelocity.y*Math.sin(pitch)};
    }
    const subject=targets.get(mark.passId)||target;
    const attached=(mark.animal&&getAnimalAttachmentPoint(subject,mark.animal))||{x:subject.x+mark.x,y:subject.y+mark.y,z:subject.z};
    const focus=replay?.kind==='bullet'&&mark===state.cinematic.shot.targetMark;
    addArrow({...attached,z:attached.z-.002},visualVelocity,1,false,mark.projectileType,{focus,age:focus?replay.impactAge:Math.max(0,time-mark.born),reducedMotion:!!replay?.reducedMotion});
  }
  if(replay?.phase==='flight'){
    const points=state.cinematic.frames.filter(frame=>frame.time<=replay.time).slice(-36).map(frame=>frame.point);
    points.push(replay.point);
    for(let i=1;i<points.length;i++)addLine(points[i-1],points[i],'trail',.9);
    addArrow(replay.point,replay.velocity,1,true,state.cinematic.shot.projectileType,{cinematic:replay.kind==='bullet',spin:replay.spin,progress:replay.progress,shaftLength:replay.shaftLength});
  }
  for(const shot of !replay?(state.volley?.shots||[state.shot]):[])if(shot&&shot.launched!==false&&(state.mode==='flight'||state.mode==='settling')){
    const alpha=state.mode==='settling'?Math.max(0,1-state.settle/(IMPACT_HOLD+RETURN_DURATION)):1;
    const points=[...shot.trail,shot.position];
    for(let i=1;i<points.length;i++)addLine(points[i-1],points[i],'trail',alpha);
    if(state.mode==='flight'&&shot.active)addArrow(shot.position,shot.velocity,1,true,shot.projectileType);
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
    const p=project(item.point);
    if(p.visible){
      if(item.cinematic){
        const speed=Math.hypot(item.velocity.x,item.velocity.y,item.velocity.z)||1,length=item.shaftLength??.12;
        const tail=project({x:item.point.x-item.velocity.x/speed*length,y:item.point.y-item.velocity.y/speed*length,z:item.point.z-item.velocity.z/speed*length});
        drawCinematicBullet(ctx,{tip:p,tail,spin:item.spin,progress:item.progress,alpha:item.alpha});
      }else if(!item.flying)drawBulletMark(ctx,{point:p,age:item.age,focus:item.focus,reducedMotion:item.reducedMotion});
      else circle(p.x,p.y,clamp(p.scale*.028,1.4,4),'#dcc57c','#5e573d',.7);
    }
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
      if(impact.visible&&replay.phase!=='flight')(replay.kind==='bullet'?drawBulletImpact:drawBullseyeImpact)(ctx,w,h,{x:impact.x,y:impact.y,age:replay.impactAge,scale:clamp(impact.scale/85,.65,1.5),reducedMotion:state.cinematic.reducedMotion});
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
  if(state.mode==='ready'||state.mode==='drawing'){const sway=effectiveSway();drawFirstPersonBow(ctx,w,h,{charge:state.charge,swayX:sway.x,swayY:sway.y,color:activeBow().color,weaponType:activeBow().weaponType,scopeMounted:hasScope(),tier:activeBow().visualTier??activeBow().id,burstCount:activeBow().burstCount,grouping:activeBow().grouping,grip:activeBow().grip,elasticity:activeBow().elasticity,tipMass:activeArrow().tipMass,fletching:activeArrow().fletching,arrowColor:activeArrow().color,drawing:state.mode==='drawing'});}
  drawReticle();drawLaser();
  if(replay)(replay.kind==='bullet'?drawBulletVignette:drawBullseyeVignette)(ctx,w,h,{age:state.settle,duration:impactHold()+impactReturn(),impactAge:replay.phase==='flight'?-1:replay.impactAge,entryMask:replay.entryMask,reducedMotion:state.cinematic.reducedMotion});
  canvas.dataset.scope=hasScope()?((state.mode==='ready'||state.mode==='drawing')&&state.zoom===equippedScope()?'active':'mounted'):'none';
  canvas.dataset.scopeMagnification=String(equippedScope());canvas.dataset.scopeZoom=String(state.zoom);
  canvas.dataset.cinematic=replay?.phase??'none';
  canvas.dataset.cinematicKind=replay?(replay.kind==='bullet'?'bullet':'arrow'):'none';
  canvas.dataset.camera=replay?(replay.phase==='return'?'return':`bullseye-${replay.phase}`):state.mode==='preview'?'preview':state.mode==='flight'?'follow':state.mode==='settling'?(state.settle>impactHold()?'return':'impact'):'aim';
}
let hudMode='',hudPercent=-1,gunReloadUi={};
function updateGunReload(reloading){
  if(!usingGun()){gunReloadUi={};return;}
  const weapon=activeBow();
  const phase=reloading?'reloading':state.magazine>0?'ready':'empty';
  const labels={reloading:'장전 중',ready:'사격 준비',empty:'탄창 비어 있음'};
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
  const reloading=usingGun()&&state.reloadRemaining>0,drawing=state.mode==='drawing',steady=isSteady(),replay=cinematicFrame(),laser=laserEnabled();
  touchpad.dataset.laser=laser?'true':'false';
  $('flightBadge').classList.toggle('bullseye',replay?.phase==='impact');
  updateGunReload(reloading);
  const motionFree=activeBow().handSwayFactor===0;
  const steadySeconds=formatSeconds(drawing?state.steadyDuration:weaponSteadyDuration());
  const preparing=preparingMainRound();
  const percent=reloading?Math.round(100*(1-state.reloadRemaining/activeBow().reloadSeconds)):drawing?Math.round(state.charge*100):0;
  if(percent!==hudPercent){$('powerFill').style.width=`${percent}%`;$('powerValue').textContent=`${percent}%`;hudPercent=percent;}
  $('drawTiming').classList.toggle('steady',steady);canvas.classList.toggle('steady',steady);
  const settlingAim=drawing&&!steady&&drawElapsed()>=state.steadyStart-STEADY_SETTLE_SECONDS&&drawElapsed()<state.steadyStart;
  $('steadyLabel').textContent=reloading?'탄창을 채우고 있어요':motionFree?'손떨림 없음 · 항상 안정':steady?`지금! ${steadySeconds}초 조준 안정`:settlingAim?'서서히 안정되는 중':drawing&&drawElapsed()>=state.steadyStart+state.steadyDuration?'안정 구간 끝 · 타이밍을 잡으세요':`1~10초 사이, 한 번은 ${steadySeconds}초 안정`;
  $('autoReleaseLabel').textContent=reloading?'자동 장전':laser?'손 떼면 발사':drawing?`자동발사까지 ${(Math.ceil(Math.max(0,DRAW_LIMIT-drawElapsed())*10)/10).toFixed(1)}초`:usingGun()?`탄창 ${state.magazine}/${activeBow().magazineSize}`:state.mode==='flight'&&state.shot?.automatic?'10초 · 자동발사':'최대 10초';
  if(state.mode==='flight'){
    const penetration=penetrationSummary(state.shot);
    const effect=penetration?`${penetration} · `:state.shot.bounceCount>0?'1회 튕김 · ':state.shot.magnetActive?'근접 유도 · ':'';
    $('flightBadge').textContent=`${effect|| (state.volley?`3연발 ${state.volley.shots.filter(shot=>shot.launched).length}/3 · `:usingGun()?'탄환 추적 · ':'화살 추적 · ')}${Math.max(0,Math.round(state.shot.position.z))} m 비행 중`;
  }else if(state.mode==='settling'&&state.cinematic){
    $('flightBadge').textContent=replay?.phase==='flight'?(replay.kind==='bullet'?'명중 순간 · 탄환을 따라':'명중 순간 · 화살을 따라'):replay?.phase==='impact'?'✦ 정중앙! 10점 ✦':'멋진 한 발 · 조준 화면으로';
  }
  $('previewBtn').textContent=state.mode==='preview'?'조준하기':'과녁 보기';
  $('previewBtn').disabled=state.mode==='flight'||state.mode==='settling'||state.mode==='finished';
  touchpad.setAttribute('aria-disabled',reloading||preparing||state.roundSaving||!['ready','drawing'].includes(state.mode)?'true':'false');
  const fatigue=drawing&&state.held>2.6;
  $('powerFill').style.background=reloading?'#829b9d':steady?'#5f9a70':fatigue?'#c58f66':'#a4b374';
  const coachCue=drawing&&progress.coachEnabled&&performance.now()<state.coachCueUntil;
  setCoachCue(coachCue);
  const mode=state.mode+activeBow().id+(laser?'laser':'')+(replay?.phase??'')+(coachCue?'coach':'')+(state.roundSaving?'saving':preparing?'preparing':reloading?'reload':steady?'steady':fatigue?'tired':'');
  canvas.dataset.mode=state.mode;
  if(mode===hudMode)return;hudMode=mode;
  touchpad.setAttribute('aria-label',`${laser?'사격장 전체 조준 영역. ':'화면 아래 3분의 1 조준 영역. '}손가락을 움직인 방향과 거리만큼 위쪽 ${laser?'빨간 레이저 점':'조준점'}이 움직이며 손을 떼면 발사. ${motionFree?'손떨림 없이 조준합니다.':`흔들림이 서서히 줄어들어 1초에서 10초 사이에 한 번 ${steadySeconds}초간 멈추고, 안정 시간이 끝나면 바로 다시 흔들립니다.`} ${laser?'조준 영역을 누르면 레이저가 사격장 가운데에서 시작합니다. 레이저를 사용하는 동안에는 자동으로 발사하지 않습니다. 영점은 조준 전에만 조절할 수 있습니다.':'10초가 되면 자동발사합니다.'} 키보드는 화살표로 조준, 스페이스를 누른 후 떼어 발사.`);
  canvas.classList.toggle('drawing',drawing);canvas.classList.toggle('flying',reloading||state.mode==='flight'||state.mode==='settling'||state.mode==='preview');
  if(state.roundSaving){

    $('powerLabel').textContent='완료 기록 저장 중';$('controlTitle').textContent='이번 판을 계정에 기록해요';$('controlHint').textContent='완료 기록을 확인한 뒤 다음 판으로 이어가요';
  }else if(preparing){
    $('powerLabel').textContent='사격장 준비 중';$('controlTitle').textContent=usingGun()?'곧 첫 탄환을 쏠 수 있어요':'곧 첫 화살을 쏠 수 있어요';$('controlHint').textContent='연결이 늦어지면 아래 다시 확인을 눌러 주세요';
  }else if(reloading){
    $('powerLabel').textContent='자동 장전 중';$('controlTitle').textContent=`이번 판 ${activeBow().magazineSize}발을 준비해요`;$('controlHint').textContent='장전이 끝나면 바로 쏠 수 있어요';
  }else if(drawing){
    $('powerLabel').textContent=steady?'조준 안정 · 흔들림 없음':fatigue?'팔이 떨리고 있어요':usingGun()?'발사 준비 완료':'시위를 당기는 중';$('controlTitle').textContent=steady?'지금은 흔들리지 않아요':'손을 떼는 순간, 발사';$('controlHint').textContent=laser?'빨간 점으로 조준 · 원하는 순간에 손을 놓으세요':steady?'방향을 조절하고 원하는 순간에 쏘세요':fatigue?'10초가 되면 자동으로 발사돼요':'움직인 만큼 조준 · 손을 떼면 발사';
  }else if(state.mode==='preview'){
    $('powerLabel').textContent='과녁 위치를 확인해요';$('controlTitle').textContent='장애물 너머 과녁을 기억하세요';$('controlHint').textContent='곧 사격 위치로 돌아가요 · 과녁 보기로 다시 확인할 수 있어요';
  }else if(state.mode==='flight'){
    $('powerLabel').textContent=usingGun()?'탄환이 날아가고 있어요':'화살이 날아가고 있어요';$('controlTitle').textContent=usingGun()?'탄환을 따라가고 있어요':'화살을 따라가고 있어요';$('controlHint').textContent='궤적과 떨어지는 위치를 보고 다음 한 발을 준비해요';
  }else if(replay&&replay.phase!=='return'){
    $('powerLabel').textContent=replay.phase==='flight'?(replay.kind==='bullet'?'탄환의 회전을 따라가요':'명중 순간을 따라가요'):'정중앙! 완벽한 한 발';$('controlTitle').textContent=replay.phase==='flight'?'과녁을 향해, 마지막 순간':replay.kind==='bullet'?'정중앙에 명중했어요':'정중앙에 꽂혔어요';$('controlHint').textContent=replay.phase==='flight'?'':state.volley?`이 화살 10점 · 3연발 합계 ${state.shotScores.at(-1)}점`:'10점 · 멋진 한 발!';
  }else if(state.mode==='settling'){
    $('powerLabel').textContent='다음 한 발을 준비해요';$('controlTitle').textContent='호흡을 가다듬고, 다시 한 발';$('controlHint').textContent=usingGun()?'곧 다음 탄환을 쏠 수 있어요':'곧 다음 화살을 쏠 수 있어요';
  }else{
    $('powerLabel').textContent=usingGun()?'움직이는 표적의 앞을 겨눠요':'활을 당겨보세요';$('controlTitle').textContent=laser?'사격장을 누르고 끌어 조준':'화면 아래 1/3을 끌어 조준';$('controlHint').textContent=usingGun()?'한 판에 10발 · 모두 쏘면 결과 확인':laser?'누르면 빨간 점이 가운데에서 시작 · 끌어 조준하고 손을 놓으면 발사':state.practiceOnly?'저장 없이 연습 중':activeBow().burstCount>1?`레어 석궁 · 3연발 · ${steadySeconds}초 안정`:`${steadySeconds}초 안정 기회 · 10초 후 자동발사`;
  }
}
function tick(now){

  const dt=Math.min(.25,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  if(!document.hidden&&!state.modal&&!state.roundSaving){
    stepGunReload(dt);
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
    if(state.mode==='preview'){
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
        state.cinematic.soundPlayed=true;$('shotFeedback').classList.remove('hidden');sound(state.cinematic.kind==='bullet'?'bullet-bull':'bull');if(navigator.vibrate)navigator.vibrate(state.cinematic.kind==='bullet'?[24,30,12]:[18,35,28]);
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
coinExchange=createCoinExchangeClient({onCredit:creditExchangedCoins,onChange:()=>{if(state.modal==='shop'&&shopTab==='coin')showCoinShop();}});
ammo=createAmmoClient({onChange:onAmmoChange,recordsOnly:true});save();resetRound(state.stage);requestAnimationFrame(tick);
if(/(?:^|[?&])shop=coin(?:&|$)/.test(window.location.search||''))showShop('coin');
