import { SajuPayment } from './payment.js?v=20261113-saju-lists1';
import { SajuCompatibilityPayment, COMPATIBILITY_PRICE } from './compatibility-payment.mjs?v=20261113-compatibility20-1';
import { compatibilityScoreText } from './compatibility-score-view.mjs?v=20261114-saju-wind1';
import { compatibilityPeopleText, compatibilityPersonLabels } from './compatibility-people-view.mjs?v=20261114-saju-qa1';
import { SajuSavedProfiles, SAVED_PROFILES_PREFIX } from './saved-profiles.mjs?v=20261113-saju-reader1';
import { SajuProfilePicker } from './profile-picker.mjs?v=20261114-saju-qa1';

const $=id=>document.getElementById(id);
const form=$('compatibility-form'),button=$('compatibility-open');
const people=['self','partner'];
const motionQuery=window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion=motionQuery.matches, motionOverride=false;
let initialized=false,signedIn=false,busy=false,quoteBusy=false;
let generation=0,quoteGeneration=0,quote=null,current=null,quoteTimer,expiryTimer;
let modulesPromise,readyPromise,compatibility;
let zodiacModulePromise,zodiacPreviewGeneration=0;
const NETWORK_READING_NOTICE='연결이 잠시 끊겼어요. 남은 이용 시간 동안 이 풀이를 계속 읽을 수 있어요. 다시 확인하려면 연결 후 ‘출생 정보 다시 보기’를 눌러 주세요.';

function zodiacModule() {
  zodiacModulePromise ||= import('./zodiac.mjs?v=20261113-saju-easy1').catch(error=>{zodiacModulePromise=null;throw error;});
  return zodiacModulePromise;
}
function showZodiac(node,zodiac,name='') {
  node.replaceChildren();
  node.hidden=!zodiac||zodiac.status==='unavailable';
  if(node.hidden)return;
  const label=document.createElement('strong'),note=document.createElement('small');
  label.textContent=(name?name+' · ':'')+zodiac.label;note.textContent=zodiac.note;
  node.append(label,note);
}
function updateZodiacPreviews() {
  const generation=++zodiacPreviewGeneration,values=inputs();
  for(const [index,person] of people.entries()) {
    const node=$(person+'-zodiac');
    showZodiac(node,null);
    if(!['year','month','day'].every(field=>$(person+'-'+field).value!==''))continue;
    const input=values[index],stamp=JSON.stringify(input);
    void zodiacModule().then(({zodiacFromBirth})=>{
      if(generation!==zodiacPreviewGeneration||stamp!==JSON.stringify(inputs()[index]))return;
      showZodiac(node,zodiacFromBirth(input));
    }).catch(()=>{});
  }
}

const billing=new SajuPayment({
  onBalance:()=>updateOffer(),
  onIdentityReady:()=>{for(const picker of profilePickers)picker.refresh();},
  onAccountChange:()=>{
    generation++;quoteGeneration++;busy=false;quoteBusy=false;signedIn=false;readyPromise=null;
    resetView(true);updateOffer();
    if(billing.identityReady)Promise.resolve().then(()=>ready()).catch(error=>{
      initialized=true;$('compatibility-error').textContent=requestError(error);$('compatibility-error').hidden=false;updateOffer();
    });
  },
  onModeChange:()=>{
    if(initialized){generation++;quoteGeneration++;busy=false;quoteBusy=false;resetView(true);}
    updateOffer();
  },
});

function options(select,start,end,suffix) {
  for(let value=start;value<=end;value++) {
    const option=document.createElement('option');option.value=String(value);option.textContent=String(value).padStart(suffix==='시'||suffix==='분'?2:1,'0')+suffix;select.append(option);
  }
}
for(const person of people) {
  options($(person+'-month'),1,12,'월');options($(person+'-day'),1,31,'일');
  options($(person+'-hour'),0,23,'시');options($(person+'-minute'),0,59,'분');
}
function updateBirthYearLimit() {
  const max=String(Math.min(2050,Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()))));
  for(const person of people)$(person+'-year').max=max;
}
updateBirthYearLimit();
const profileStore=new SajuSavedProfiles({getIdentity:()=>({userId:billing.identityReady?billing.user:null,anonymous:billing.anonymous===true})});
const profilePickers=people.map((person,index)=>new SajuProfilePicker({
  element:$(person+'-saved-profiles'),store:profileStore,
  read:()=>({...personNames()[index],birth:inputs()[index]}),
  autoSave:{
    fields:['name','gender','year','month','day','calendar','hour','minute','leap-month','time-unknown'].map(field=>$(person+'-'+field)),
    read:()=>({...personNames()[index],birth:inputs()[index]}),delay:600,
  },
  fill:profile=>fillPerson(person,profile),
  clear:()=>fillPerson(person,{name:'',gender:null,birth:{calendar:'solar',year:'',month:'',day:'',leapMonth:false,hour:null,minute:0}}),
}));
function personNames() {
  return people.map(person=>({name:$(person+'-name').value.trim().normalize('NFC'),gender:$(person+'-gender').value||null}));
}
function fillPerson(person,{name,gender,birth}) {
  if(busy)return;
  $(person+'-name').value=name;$(person+'-gender').value=gender||'';
  for(const field of ['year','month','day','calendar'])$(person+'-'+field).value=String(birth[field]);
  $(person+'-leap-month').checked=birth.calendar==='lunar'&&birth.leapMonth;
  $(person+'-time-unknown').checked=birth.hour===null;
  $(person+'-hour').value=birth.hour===null?'':String(birth.hour);
  $(person+'-minute').value=birth.hour===null?'':String(birth.minute);
  changed();
}
function updateFields() {
  for(const person of people) {
    const lunar=$(person+'-calendar').value==='lunar',unknown=$(person+'-time-unknown').checked;
    $(person+'-leap-option').hidden=!lunar;if(!lunar)$(person+'-leap-month').checked=false;
    $(person+'-time-fields').hidden=unknown;
    $(person+'-hour').disabled=busy||unknown;$(person+'-minute').disabled=busy||unknown;
  }
  updateZodiacPreviews();
}
function inputs() {
  const selectedTime=id=>$(id).value===''?NaN:Number($(id).value);
  return people.map(person=>({
    year:Number($(person+'-year').value),month:Number($(person+'-month').value),day:Number($(person+'-day').value),
    calendar:$(person+'-calendar').value,leapMonth:$(person+'-leap-month').checked,
    hour:$(person+'-time-unknown').checked?null:selectedTime(person+'-hour'),
    minute:$(person+'-time-unknown').checked?0:selectedTime(person+'-minute'),
  }));
}
const signature=()=>JSON.stringify([inputs(),personNames()]);
const complete=()=>people.every(person=>['year','month','day'].every(field=>$(person+'-'+field).value!==''))&&form.checkValidity();
function validQuote() {return quote&&quote.owner===billing.user&&quote.mode===billing.modeVersion&&quote.signature===signature()?quote:null;}
function isCurrentActive() {
  return Boolean(current&&current.owner===billing.user&&current.mode===billing.modeVersion&&current.signature===signature()&&compatibility?.isActive(current.access));
}
function clearResult() {
  current=null;$('compatibility-report').replaceChildren();$('compatibility-result').hidden=true;
  $('compatibility-result-title').textContent='두 사람의 궁합';
  $('compatibility-copy').disabled=true;$('compatibility-copy-status').textContent='';$('compatibility-births').textContent='';$('compatibility-expiry').textContent='';
  for(const person of people)showZodiac($(person+'-result-zodiac'),null);
  $('compatibility-entry').hidden=false;
}
function resetView(clearInputs=false) {
  clearTimeout(quoteTimer);clearTimeout(expiryTimer);quote=null;clearResult();
  form.removeAttribute('aria-busy');form.querySelectorAll('fieldset').forEach(fieldset=>fieldset.disabled=false);
  if(clearInputs){form.reset();for(const picker of profilePickers){picker.resetSelection();picker.setDisabled(false);picker.refresh();}}
  $('compatibility-error').hidden=true;$('compatibility-error').textContent='';$('compatibility-status').textContent='';updateFields();
}
function expireCurrent() {
  if(!current||isCurrentActive())return false;
  generation++;clearResult();quote=null;
  $('compatibility-status').textContent='24시간 이용이 끝났어요. 표시된 금액으로 다시 펼칠 때만 새로 결제해요.';
  return true;
}
function scheduleExpiry() {
  clearTimeout(expiryTimer);
  const accesses=[current?.access,validQuote()?.status?.entitlement];
  const remaining=accesses.filter(Boolean).map(access=>compatibility?.remainingMs(access)).filter(value=>Number.isFinite(value)&&value>0);
  if(remaining.length)expiryTimer=setTimeout(()=>{expireCurrent();updateOffer();},Math.max(1,Math.min(...remaining,2147483647)));
}
function updateOffer() {
  const offer=validQuote(),preview=!!billing.adminPreview;
  const active=Boolean(offer?.status?.entitlement&&compatibility?.isActive(offer.status.entitlement));
  const charge=preview||active?0:COMPATIBILITY_PRICE;
  button.dataset.expectedCharge=String(charge);
  $('compatibility-price').textContent=preview?'궁합 · 관리자 미리보기':active?'궁합 · 다시 보기 0쭈':`궁합 · ${COMPATIBILITY_PRICE}쭈`;
  $('compatibility-wallet').textContent=preview?'관리자 미리보기 · 차감 없음':signedIn&&Number.isSafeInteger(billing.balance)?`보유 ${new Intl.NumberFormat('ko-KR').format(billing.balance)}쭈`:initialized?'로그인 후 두 사람의 궁합을 펼칠 수 있어요.':'로그인과 보유 쭈를 확인하고 있어요.';
  $('compatibility-login').hidden=signedIn||preview;
  button.disabled=busy||quoteBusy||!initialized;
  button.querySelector('span').textContent=busy?'두 사람의 궁합을 준비하고 있어요…':quoteBusy?'이용 내역 확인 중…':preview?'궁합 미리보기':active?'궁합 다시 보기 · 0쭈':`${COMPATIBILITY_PRICE}쭈로 궁합 펼치기`;
  $('pair-swap').disabled=busy;$('compatibility-clear').disabled=busy;
  for(const picker of profilePickers)picker.setDisabled(busy);
  scheduleExpiry();
}
async function ready() {
  if(readyPromise)return readyPromise;
  const task=(async()=>{
    const state=await billing.init();
    if(!compatibility)compatibility=new SajuCompatibilityPayment(billing);
    signedIn=state.signedIn===true;initialized=true;
    for(const picker of profilePickers)picker.refresh();
    try{if(billing.client&&!billing.adminPreview)window.OjjudaSiteUsage?.configure({client:billing.client});}catch{}
    updateOffer();return compatibility;
  })();
  readyPromise=task;
  try{return await task;}catch(error){if(readyPromise===task)readyPromise=null;throw error;}
}
async function modules() {
  modulesPromise ||= Promise.all([
    import('./engine.mjs?v=20261113-saju-brief1'),
    import('./compatibility.mjs?v=20261114-saju-wind1'),
    import('./report-view.mjs?v=20261114-saju-qa1'),
  ]).catch(error=>{modulesPromise=null;throw error;});
  return modulesPromise;
}
function requestError(error) {
  return /[가-힣]/.test(error?.message||'')?error.message:'궁합 이용 정보를 확인하지 못했어요. 다시 눌러 확인해 주세요.';
}
async function refreshQuote() {
  clearTimeout(quoteTimer);
  if(busy||!complete()||(!signedIn&&!billing.adminPreview)){updateOffer();return;}
  const id=++quoteGeneration,saved=signature(),owner=billing.user;
  quoteBusy=true;updateOffer();
  try {
    const client=await ready(),[engine]=await modules(),values=inputs();
    const chart=engine.calculateSaju(values[0]),partner=engine.calculateSaju(values[1]);
    const status=await client.status(chart,partner);
    if(id!==quoteGeneration||saved!==signature()||owner!==billing.user)return;
    quote={signature:saved,owner,mode:billing.modeVersion,chart,partner,status};
    expireCurrent();
    $('compatibility-error').hidden=true;
    if($('compatibility-copy-status').textContent===NETWORK_READING_NOTICE)$('compatibility-copy-status').textContent='';
  }catch(error){
    if(id!==quoteGeneration||saved!==signature()||owner!==billing.user)return;
    const keepReading=error?.code==='network'&&isCurrentActive();
    const keepQuote=error?.code==='network'&&compatibility?.isActive(validQuote()?.status?.entitlement);
    if(!keepQuote)quote=null;
    if(current&&!keepReading)clearResult();
    if(keepReading) {
      $('compatibility-error').hidden=true;
      $('compatibility-copy-status').textContent=NETWORK_READING_NOTICE;
    }else if(error?.name!=='SajuInputError'){
      $('compatibility-error').textContent=requestError(error)+(keepQuote?' 남은 이용 시간은 그대로예요. 연결을 확인한 뒤 다시 펼쳐 주세요.':'');
      $('compatibility-error').hidden=false;
    }
  }finally{if(id===quoteGeneration){quoteBusy=false;updateOffer();}}
}
function changed() {
  updateBirthYearLimit();
  generation++;quoteGeneration++;clearTimeout(quoteTimer);busy=false;quoteBusy=false;quote=null;clearResult();
  form.removeAttribute('aria-busy');form.querySelectorAll('fieldset').forEach(fieldset=>fieldset.disabled=false);
  $('compatibility-status').textContent='';$('compatibility-error').hidden=true;updateFields();updateOffer();
  if(!busy&&complete()&&(signedIn||billing.adminPreview))quoteTimer=setTimeout(()=>void refreshQuote(),180);
}
form.addEventListener('input',changed);form.addEventListener('change',changed);
$('pair-swap').addEventListener('click',()=>{
  const fields=['name','gender','year','month','day','calendar','hour','minute'];
  const values=people.map(person=>({
    ...Object.fromEntries(fields.map(field=>[field,$(person+'-'+field).value])),
    leapMonth:$(person+'-leap-month').checked,timeUnknown:$(person+'-time-unknown').checked,
  })).reverse();
  for(const [i,person] of people.entries()){
    const value=values[i];
    for(const field of fields)$(person+'-'+field).value=value[field];
    $(person+'-leap-month').checked=value.leapMonth;$(person+'-time-unknown').checked=value.timeUnknown;
  }
  for(const picker of profilePickers)picker.resetSelection();
  changed();
});
$('compatibility-clear').addEventListener('click',()=>{generation++;quoteGeneration++;quoteBusy=false;resetView(true);updateOffer();});

function copyText(reading,chart,partner,names) {
  const labels=compatibilityPersonLabels(names);
  const lines=['오쭈다 · 별빛 궁합',`${labels[0]}: ${chart.solar.label} · ${chart.timeLabel}`,`${labels[1]}: ${partner.solar.label} · ${partner.timeLabel}`];
  for(const [index,person] of people.entries()) {
    const zodiac=reading.zodiac?.[person];
    if(zodiac)lines.push(`${labels[index]}: ${zodiac.label} · ${zodiac.note}`);
  }
  lines.push(reading.title,'',compatibilityPeopleText(reading,names));
  lines.push('',compatibilityScoreText(reading.score),'');
  lines.push(reading.headline);
  if(reading.scopeNotice)lines.push(reading.scopeNotice);
  lines.push(...reading.paragraphs);
  for(const card of reading.cards)lines.push('',card.label,card.title,...card.paragraphs);
  return lines.join('\n');
}
function expiresLabel(access) {
  if(access.adminPreview)return '관리자 미리보기 · 차감 없음';
  const end=new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}).format(new Date(access.expires_at));
  return `결제 후 24시간 · ${end}까지 · 같은 두 사람 다시 보기 0쭈`;
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  updateBirthYearLimit();
  if(busy||!form.reportValidity())return;
  const clickedCharge=Number(button.dataset.expectedCharge),saved=signature(),values=inputs(),names=personNames();
  const id=++generation;quoteGeneration++;clearTimeout(quoteTimer);quoteBusy=false;busy=true;
  $('compatibility-error').hidden=true;$('compatibility-status').textContent='';
  form.setAttribute('aria-busy','true');form.querySelectorAll('fieldset').forEach(fieldset=>fieldset.disabled=true);updateOffer();
  try {
    const client=await ready();
    if(!signedIn&&!billing.adminPreview)throw new Error('아지트에 로그인한 뒤 궁합을 펼쳐 주세요.');
    const owner=billing.user,mode=billing.modeVersion,[engine,data,view]=await modules();
    const chart=engine.calculateSaju(values[0]),partner=engine.calculateSaju(values[1]);
    if(id!==generation||saved!==signature()||owner!==billing.user||mode!==billing.modeVersion)return;
    const savedProfiles=[];
    for(const picker of profilePickers){
      savedProfiles.push(await picker.saveCurrent());
      if(id!==generation||saved!==signature()||owner!==billing.user||mode!==billing.modeVersion)return;
    }
    const saveWarning=savedProfiles.some(profile=>!profile)?'풀이를 열었지만 일부 입력 정보를 이 기기에 저장하지 못했어요. 출생 정보 화면에서 확인해 주세요.':'';
    const reading=data.buildCompatibilityReading(chart,partner),content=document.createElement('div');
    view.renderCompatibilityReport(content,reading,{names});
    const text=copyText(reading,chart,partner,names);
    if(id!==generation||saved!==signature()||owner!==billing.user||mode!==billing.modeVersion)return;
    const status=await client.status(chart,partner);
    if(id!==generation||saved!==signature()||owner!==billing.user||mode!==billing.modeVersion)return;
    quote={signature:saved,owner,mode,chart,partner,status};
    const required=billing.adminPreview||client.isActive(status.entitlement)?0:COMPATIBILITY_PRICE;
    const receipt=await client.start(chart,partner,{expectedCharge:Math.min(clickedCharge,required)});
    if(id!==generation||saved!==signature()||owner!==billing.user||mode!==billing.modeVersion)return;
    if(!receipt?.ok||!client.isActive(receipt))throw new Error('이용 시간을 확인하지 못했어요. 표시된 금액을 확인하고 다시 펼쳐 주세요.');
    current={owner,mode,signature:saved,chart,partner,reading,copyText:text,access:receipt};
    quote.status={...status,coins:receipt.coins,entitlement:receipt};
    $('compatibility-report').replaceChildren(...content.childNodes);
    const labels=compatibilityPersonLabels(names);
    $('compatibility-result-title').textContent=names.some(person=>person.name)?`${labels.join(' × ')}의 궁합`:'두 사람의 궁합';
    $('compatibility-births').textContent=`${labels[0]} ${chart.solar.label} · ${chart.timeLabel} / ${labels[1]} ${partner.solar.label} · ${partner.timeLabel}`;
    for(const [index,person] of people.entries())showZodiac($(person+'-result-zodiac'),reading.zodiac?.[person],labels[index]);
    $('compatibility-copy-status').textContent=saveWarning;
    $('compatibility-expiry').textContent=expiresLabel(receipt);
    $('compatibility-entry').hidden=true;$('compatibility-result').hidden=false;$('compatibility-copy').disabled=false;
    $('compatibility-result-title').focus({preventScroll:true});window.scrollTo({top:0,behavior:reducedMotion?'instant':'smooth'});
  }catch(error){
    if(id!==generation)return;
    $('compatibility-error').textContent=requestError(error);$('compatibility-error').hidden=false;
    $('compatibility-error').focus({preventScroll:true});
  }finally{
    if(id===generation){busy=false;form.removeAttribute('aria-busy');form.querySelectorAll('fieldset').forEach(fieldset=>fieldset.disabled=false);updateFields();updateOffer();}
  }
});
$('compatibility-edit').addEventListener('click',()=>{
  generation++;clearResult();updateOffer();void refreshQuote();$('self-year').focus({preventScroll:true});
});
$('compatibility-copy').addEventListener('click',async()=>{
  if(expireCurrent()){updateOffer();return;}
  if(!isCurrentActive()||busy)return;
  try{await navigator.clipboard.writeText(current.copyText);$('compatibility-copy-status').textContent='A와 B의 성격과 궁합 풀이를 복사했어요.';}
  catch{$('compatibility-copy-status').textContent='복사 권한을 확인해 주세요.';}
});
function refreshProfiles(){if(!busy)for(const picker of profilePickers)picker.refresh({preserveStatus:picker.statusElement.dataset.state==='error'});}
function resume(){updateBirthYearLimit();refreshProfiles();expireCurrent();updateOffer();if(!busy)void refreshQuote();}
window.addEventListener('focus',resume);window.addEventListener('pageshow',resume);
window.addEventListener('storage',event=>{if(event.key===null||event.key?.startsWith(SAVED_PROFILES_PREFIX))refreshProfiles();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resume();});
function setMotion(){document.documentElement.dataset.reducedMotion=String(reducedMotion);$('motion-toggle').setAttribute('aria-pressed',String(reducedMotion));$('motion-toggle').setAttribute('aria-label',reducedMotion?'움직임 다시 켜기':'움직임 줄이기');}
$('motion-toggle').addEventListener('click',()=>{motionOverride=true;reducedMotion=!reducedMotion;setMotion();});
motionQuery.addEventListener?.('change',event=>{if(!motionOverride){reducedMotion=event.matches;setMotion();}});setMotion();
for(const button of document.querySelectorAll('[data-reading-size] button,button[data-reading-size]')) {
  if(!button.dataset.readingSize)continue;
  button.addEventListener('click',()=>{
    $('compatibility-detailed').dataset.readingSize=button.dataset.readingSize;
    document.querySelectorAll('button[data-reading-size]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
  });
}
updateFields();updateOffer();
void ready().catch(error=>{initialized=true;$('compatibility-error').textContent=requestError(error);$('compatibility-error').hidden=false;updateOffer();});
