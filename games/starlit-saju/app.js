import { SajuSavedProfiles, SAVED_PROFILES_PREFIX } from './saved-profiles.mjs?v=20261113-saju-reader1';
import { SajuProfilePicker } from './profile-picker.mjs?v=20261113-saju-reader1';

const $ = id => document.getElementById(id);
const form = $('birth-form');
const submit = $('open-story');
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = reduceQuery.matches;
let motionOverride = false;
let enginePromise;
let detailModulesPromise;
let billingPromise;
let billing;
let billingInitialized = false;
let billingSignedIn = false;
let billingMode = false;
let busy = false;
let submitGeneration = 0;
let currentReading = null;
let currentPerson = null;
let currentDetail = null;
let reportGeneration = 0;
let reportBusy = false;
let toastTimer;

const ELEMENT_WORDS = Object.freeze({wood:'나무',fire:'불',earth:'흙',metal:'쇠',water:'물'});

const STEM_READINGS = {
  "甲": {
    "name": "갑목",
    "symbol": "곧게 자라는 큰 나무",
    "intro": "갑목은 큰 나무에 빗댄 이름이에요. 나무가 뿌리를 내리듯, 내가 중요하게 생각하는 것을 지키는 모습을 떠올려요."
  },
  "乙": {
    "name": "을목",
    "symbol": "바람과 함께 자라는 풀",
    "intro": "을목은 풀과 덩굴에 빗댄 이름이에요. 주변에 맞춰 자라는 풀처럼, 새로운 곳에서 방법을 바꾸며 자라는 모습을 떠올려요."
  },
  "丙": {
    "name": "병화",
    "symbol": "주변을 밝히는 햇살",
    "intro": "병화는 태양에 빗댄 이름이에요. 햇빛을 널리 나누듯, 기쁨이나 생각을 다른 사람에게 전하는 모습을 떠올려요."
  },
  "丁": {
    "name": "정화",
    "symbol": "어둠을 밝혀 주는 등불",
    "intro": "정화는 등불에 빗댄 이름이에요. 등불이 한곳을 밝히듯, 한 가지 일에 마음을 쏟는 모습을 떠올려요."
  },
  "戊": {
    "name": "무토",
    "symbol": "든든하게 서 있는 산",
    "intro": "무토는 산에 빗댄 이름이에요. 산이 제자리를 지키듯, 힘든 일이 있어도 차분하게 버티는 모습을 떠올려요."
  },
  "己": {
    "name": "기토",
    "symbol": "씨앗을 기르는 부드러운 흙",
    "intro": "기토는 씨앗을 기르는 흙에 빗댄 이름이에요. 필요한 것을 챙겨 주고, 작은 일도 꾸준히 돌보는 모습을 떠올려요."
  },
  "庚": {
    "name": "경금",
    "symbol": "형태를 잡는 단단한 쇠",
    "intro": "경금은 단단한 쇠에 빗댄 이름이에요. 필요한 것과 그렇지 않은 것을 가리고, 해야 할 일을 분명하게 정하는 모습을 떠올려요."
  },
  "辛": {
    "name": "신금",
    "symbol": "곱게 다듬어 빛나는 보석",
    "intro": "신금은 잘 다듬은 보석에 빗댄 이름이에요. 작은 차이를 살피며 하나씩 정성껏 다듬는 모습을 떠올려요."
  },
  "壬": {
    "name": "임수",
    "symbol": "넓게 흐르는 큰 물",
    "intro": "임수는 강과 바다에 빗댄 이름이에요. 물이 길을 찾아 흐르듯, 여러 생각을 모아 새로운 길을 찾는 모습을 떠올려요."
  },
  "癸": {
    "name": "계수",
    "symbol": "조용히 스며드는 빗물",
    "intro": "계수는 이슬과 비에 빗댄 이름이에요. 작은 물방울이 스며들듯, 자세히 살피고 생각을 차근차근 정리하는 모습을 떠올려요."
  }
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function appendOptions(select, start, end, suffix, pad = false) {
  const fragment = document.createDocumentFragment();
  for (let value = start; value <= end; value++) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = (pad ? String(value).padStart(2, '0') : String(value)) + suffix;
    fragment.append(option);
  }
  select.append(fragment);
}

appendOptions($('birth-month'), 1, 12, '월');
appendOptions($('birth-day'), 1, 31, '일');
appendOptions($('birth-hour'), 0, 23, '시', true);
appendOptions($('birth-minute'), 0, 59, '분', true);
$('birth-year').max = String(Math.min(2050, Number(new Intl.DateTimeFormat('en', {year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()))));
function setMotion() {
  document.documentElement.dataset.reducedMotion = String(reducedMotion);
  $('motion-toggle').setAttribute('aria-pressed', String(reducedMotion));
  const label = reducedMotion ? '움직임 다시 켜기' : '움직임 줄이기';
  $('motion-toggle').setAttribute('aria-label', label);
  $('motion-toggle').title = label;
}
setMotion();
$('motion-toggle').addEventListener('click', () => {
  motionOverride = true;
  reducedMotion = !reducedMotion;
  setMotion();
});
reduceQuery.addEventListener?.('change', event => {
  if (!motionOverride) { reducedMotion = event.matches; setMotion(); }
});

function clearError() {
  $('form-error').hidden = true;
  $('form-error').textContent = '';
  form.querySelectorAll('[aria-invalid]').forEach(field => {
    field.removeAttribute('aria-invalid');
    const description = (field.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== 'form-error').join(' ');
    if (description) field.setAttribute('aria-describedby', description);
    else field.removeAttribute('aria-describedby');
  });
}
function markInvalidFields(error) {
  const date = ['birth-year','birth-month','birth-day'];
  const fields = {year:['birth-year'],date:[...date,...($('leap-month').checked ? ['leap-month'] : [])],'leap-month':['leap-month'],time:['birth-hour','birth-minute'],future:date,range:['birth-year']}[error.code] || [];
  fields.forEach(id => {
    const field = $(id);
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'),'form-error'].filter(Boolean).join(' '));
  });
}
function updateCalendar() {
  const lunar = form.querySelector('input[name="calendar"]:checked').value === 'lunar';
  $('leap-option').hidden = !lunar;
  $('leap-month').disabled = !lunar;
  if (!lunar) $('leap-month').checked = false;
  clearError();
}
function updateTime() {
  const unknown = $('time-unknown').checked;
  $('time-fields').hidden = unknown;
  $('birth-hour').disabled = unknown;
  $('birth-minute').disabled = unknown;
  $('time-help').textContent = unknown ? '시간을 몰라도 상세 풀이를 볼 수 있어요.' : '한국 표준시로 입력해 주세요. 00시는 자정, 12시는 정오예요.';
  clearError();
}
form.querySelectorAll('input[name="calendar"]').forEach(input => input.addEventListener('change', updateCalendar));
$('time-unknown').addEventListener('change', updateTime);
form.addEventListener('input', clearError);
updateCalendar();
updateTime();

const profileStore=new SajuSavedProfiles({getIdentity:()=>({userId:billingSignedIn?billing?.user:null,anonymous:billing?.anonymous===true})});
const profilePicker=new SajuProfilePicker({
  element:$('saved-profiles'),store:profileStore,
  read:async()=>{
    await readyBilling();
    const person={...readPerson(),birth:readBirth()};
    const signature=personSignature();
    await calculateBirth(person.birth);
    if(signature!==personSignature())throw new Error('입력한 정보가 바뀌었어요. 현재 내용을 다시 저장해 주세요.');
    return person;
  },
  fill:profile=>fillPerson(profile),
  clear:()=>fillPerson({name:'',gender:null,birth:{calendar:'solar',year:'',month:'',day:'',leapMonth:false,hour:null,minute:0}}),
});

function readPerson() {
  return {name:$('person-name').value.trim().normalize('NFC'),gender:$('person-gender').value||null};
}
function personSignature() { return JSON.stringify({...readPerson(),birth:readBirth()}); }
function fillPerson({name,gender,birth}) {
  if (busy) return;
  $('person-name').value=name;
  $('person-gender').value=gender||'';
  form.querySelector(`input[name="calendar"][value="${birth.calendar}"]`).checked=true;
  for(const field of ['year','month','day']) $('birth-'+field).value=String(birth[field]);
  updateCalendar();
  $('leap-month').checked=birth.calendar==='lunar'&&birth.leapMonth;
  $('time-unknown').checked=birth.hour===null;
  $('birth-hour').value=birth.hour===null?'':String(birth.hour);
  $('birth-minute').value=birth.hour===null?'':String(birth.minute);
  updateTime();
  scheduleEntryCheck();
}

function renderPillar(pillar, index) {
  const card = element('article', 'pillar-card' + (pillar.key === 'day' ? ' is-day' : ''));
  card.style.setProperty('--i', index);
  card.append(element('h3', 'pillar-label', {year:'태어난 해',month:'태어난 달',day:'태어난 날',hour:'태어난 시간'}[pillar.key]));
  card.append(element('span', 'pillar-caption', pillar.label));
  if (pillar.hanja && pillar.stem && pillar.branch) {
    const glyphs = element('div', 'pillar-glyphs');
    [pillar.stem, pillar.branch].forEach((part, partIndex) => {
      const glyph = element('span', 'pillar-glyph', part.hanja);
      glyph.style.setProperty('--element-color', part.color);
      glyph.append(element('small', '', `${part.hangul} · ${partIndex ? '아래 글자' : '위 글자'}`));
      glyphs.append(glyph);
    });
    card.append(glyphs, element('p', 'pillar-name', pillar.hangul));
    card.append(element('p', 'pillar-elements', `${ELEMENT_WORDS[pillar.stem.element]} · ${ELEMENT_WORDS[pillar.branch.element]}`));
  } else {
    card.append(element('div', 'pillar-unknown', '✧'));
    card.append(element('p', 'pillar-status', pillar.alternatives?.length ? '시간 확인 필요' : '시간 미상'));
    if (pillar.alternatives?.length) {
      const choices = element('div', 'pillar-alternatives');
      pillar.alternatives.forEach(choice => choices.append(element('span', '', `${choice.hanja} ${choice.hangul}`)));
      card.append(choices, element('p', 'pillar-empty-note', '계절을 나누는 시각 전인지 후인지에 따라 달라져요.'));
    } else card.append(element('p', 'pillar-empty-note', '시간을 알면 펼칠 수 있어요.'));
  }
  return card;
}

function plainWarning(message) {
  if (message==='태어난 시간을 모르므로 시주는 표시하지 않아요.') {
    return '태어난 시간을 몰라서, 시간에 해당하는 두 글자는 비워 두었어요.';
  }
  const count=message.match(/^오행은 확정된 (\d+)글자만 세었어요\. 전체 사주의 오행 비율은 아니에요\.$/);
  if (count) return `확인한 ${count[1]}글자만 나무·불·흙·쇠·물로 나누어 세었어요. 모르는 글자가 있어서 여덟 글자 전체의 모습과는 다를 수 있어요.`;
  if (message.startsWith('입력한 분 안에 절기가 바뀌어 ') || message.startsWith('이 날은 절기가 바뀌어 ')) {
    return message
      .replace('입력한 분 안에 절기가 바뀌어 ','입력한 1분 안에 계절을 나누는 기준 시각이 들어 있어 ')
      .replace('이 날은 절기가 바뀌어 ','이 날에는 계절을 나누는 기준 시각이 있어요. 그래서 ')
      .replaceAll('년주','태어난 해의 글자').replaceAll('월주','태어난 달의 글자')
      .replace('두 후보를 함께','가능한 두 가지 글자 조합을 함께');
  }
  return message;
}

function renderReading(result) {
  const name=currentPerson?.name;
  $('result-title').replaceChildren(document.createTextNode(name?`${name}님의 `:'나의 '),element('em','','운세'));
  $('detailed-title').textContent=name?`${name}님의 운세 풀이`:'나의 운세 풀이';
  $('result-pillars').replaceChildren(...result.pillars.map(renderPillar));
  $('birth-summary').textContent = `양력 ${result.solar.label} · ${result.timeLabel || (result.timeKnown ? '시간 입력' : '태어난 시간 모름')}`;
  $('lunar-summary').textContent = `음력 ${result.lunar.label}`;
  const warningNodes = result.warnings.map(message => element('p', '', plainWarning(message)));
  $('result-warnings').replaceChildren(...warningNodes);
  $('result-warnings').hidden = warningNodes.length === 0;
  const stem = result.dayMaster;
  const reading = STEM_READINGS[stem.hanja];
  $('day-master-glyph').textContent = stem.hanja;
  $('day-master-glyph').style.setProperty('--element-color', stem.color);
  $('day-master-title').textContent = `${reading.name} · ${ELEMENT_WORDS[stem.element]}`;
  $('day-master-symbol').textContent = reading.symbol;
  $('day-master-reading').textContent = reading.intro;
  $('element-count').textContent = `확인된 ${result.knownCharacterCount}글자`;
  const rows = result.elements.map(item => {
    const row = element('div', 'element-row');
    row.style.setProperty('--element-color', item.color);
    const label = element('span', 'element-label');
    label.append(element('b', '', item.hanja), document.createTextNode(ELEMENT_WORDS[item.key] || item.label));
    const track = element('div', 'element-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('div', 'element-fill');
    fill.style.width = `${result.knownCharacterCount ? item.count / result.knownCharacterCount * 100 : 0}%`;
    track.append(fill);
    row.append(label, track, element('span', 'element-value', `${item.count}개`));
    return row;
  });
  $('element-bars').replaceChildren(...rows);
  $('convention-list').replaceChildren(...[...result.warnings.map(message=>`원래 안내: ${message}`),...result.conventions].map(message => element('li', '', message)));
  $('intro').hidden = true;
  $('result').hidden = false;
  document.querySelector('.skip-link').href = '#result-title';
  document.querySelector('.skip-link').textContent = '사주 결과로 바로가기';
  $('result-title').focus({preventScroll:true});
  window.scrollTo({top:0,behavior:reducedMotion ? 'instant' : 'smooth'});
}

const TOPICS = Object.freeze({
  lifelong:{label:'평생운',description:'태어난 때의 사주로 나의 성향과 생활을 살펴봐요.'},
  annual:{label:'올해운',description:'선택한 해의 글자와 내 사주를 함께 살펴봐요.'},
  monthly:{label:'월별운',description:'선택한 연도의 1~12월 전체 풀이를 포함해요.'},
  all:{label:'전체 풀이',description:'평생운과 선택한 연도의 올해운·12개월 월별운을 모두 읽어요.'}
});
let entryQuote = null;
let entryQuoteError = false;
let entryCheckPending = false;
let entryCheckTimer;
let quoteGeneration = 0;
let currentAccess = null;
let accessTimer;

function koreanYear(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en', {year:'numeric',timeZone:'Asia/Seoul'}).format(now));
}
function fillYears(select, birthYear = 1900, preferred = Number(select.value), status=null) {
  const nowYear = koreanYear();
  const activeYears=(status?.entitlements||[]).filter(item=>['annual','monthly'].includes(item.topic)&&activeAccess(item)).map(item=>item.year);
  const choices = [...new Set([nowYear-1,nowYear,nowYear+1,...activeYears])]
    .filter(year => Number.isInteger(year) && year >= birthYear && year >= 1900 && year <= 2050).sort((a,b)=>a-b);
  select.replaceChildren(...choices.map(year => {
    const option = element('option','',`${year}년${year===nowYear?' · 올해':''}`);
    option.value = String(year);
    return option;
  }));
  select.value = String(choices.includes(preferred) ? preferred : choices.includes(nowYear) ? nowYear : choices[0]);
}
fillYears($('entry-year'));
fillYears($('fortune-year'));
function targetFrom(prefix) {
  const topic = document.querySelector(`input[name="${prefix}-topic"]:checked`)?.value || 'lifelong';
  const year = topic==='lifelong' ? 0 : Number($(prefix==='entry'?'entry-year':'fortune-year').value);
  return {topic,year};
}
function targetLabel({topic,year}) {
  if (topic==='all') return `${year}년 전체 풀이`;
  return topic==='lifelong' ? '평생운' : `${year}년 ${topic==='annual'?'운세':'월별운'}`;
}
function sameTarget(left,right) { return left?.topic===right?.topic && left?.year===right?.year; }
function includedTargets(target) {
  return target.topic==='all' ? [{topic:'lifelong',year:0},{topic:'annual',year:target.year},{topic:'monthly',year:target.year}] : [target];
}
function activeAccess(access) {
  return Boolean(access?.adminPreview || (access && billing?.isActive(access)));
}
function owned(status,target) {
  return Boolean(status?.adminPreview || activeAccess(status?.bundle_entitlement)
    || includedTargets(target).every(choice=>status?.entitlements?.some(item => sameTarget(item,choice) && activeAccess(item))));
}
function payable(status,target) {
  return includedTargets(target).reduce((total,choice)=>total+(owned(status,choice)?0:10),0);
}
function priceLabel(status,target) {
  const price=payable(status,target);
  return target.topic==='all' && price>0 && price<30 ? `남은 ${price}쭈` : `${price}쭈`;
}
function accessEndLabel(access) {
  const date=new Date(access?.expires_at);
  if (!Number.isFinite(date.getTime())) return '';
  return `${new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}).format(date)}까지`;
}
function expireCurrentReading(force=false) {
  if (!currentDetail || (!force && activeAccess(currentDetail.access))) return false;
  currentDetail=null;
  $('report-content').replaceChildren();
  delete $('report-content').dataset.topic;
  delete $('report-content').dataset.year;
  $('report-content').removeAttribute('aria-busy');
  $('reading-controls').hidden=true;
  $('report-toc').hidden=true;
  $('copy-reading').disabled=true;
  document.querySelector('.birth-chart-details').hidden=true;
  document.querySelector('.conventions').hidden=true;
  $('result-warnings').hidden=true;
  $('other-reading-options').open=true;
  $('report-status').textContent='24시간 이용이 끝났어요. 다시 볼 풀이를 선택해 결제해 주세요.';
  return true;
}
function scheduleAccessExpiry() {
  clearTimeout(accessTimer);
  if (!billing) return;
  const entry=validEntryQuote()?.status;
  const current=currentAccess?.owner===billing.user ? currentAccess.status : null;
  const candidates=[currentDetail?.access,entry?.bundle_entitlement,current?.bundle_entitlement,
    ...(entry?.entitlements||[]),...(current?.entitlements||[])];
  const remaining=candidates.filter(access=>access && !access.adminPreview)
    .map(access=>billing.remainingMs(access)).filter(value=>Number.isFinite(value)&&value>0);
  if (!remaining.length) return;
  accessTimer=setTimeout(()=>{
    expireCurrentReading();
    updateEntryOffer();
    if (currentReading) updateProductOffer();
  },Math.max(1,Math.min(...remaining,2147483647)));
}
function readBirth() {
  const timeValue=id=>$(id).value===''?NaN:Number($(id).value);
  return {
    year:Number($('birth-year').value),month:Number($('birth-month').value),day:Number($('birth-day').value),
    calendar:form.querySelector('input[name="calendar"]:checked').value,
    leapMonth:$('leap-month').checked,
    hour:$('time-unknown').checked ? null : timeValue('birth-hour'),
    minute:$('time-unknown').checked ? 0 : timeValue('birth-minute')
  };
}
function birthSignature(input=readBirth()) { return JSON.stringify(input); }
function hasBirth() { return ['birth-year','birth-month','birth-day'].every(id => $(id).value !== ''); }
async function calculateBirth(input) {
  enginePromise ||= import('./engine.mjs?v=20261113-saju-brief1').catch(error => { enginePromise=null; throw error; });
  const {calculateSaju} = await enginePromise;
  return calculateSaju(input);
}
function validEntryQuote() {
  return entryQuote && entryQuote.signature===birthSignature() && entryQuote.owner===billing?.user ? entryQuote : null;
}
function updateEntryOffer() {
  const target = targetFrom('entry');
  $('entry-year-field').hidden = target.topic==='lifelong';
  const quote = validEntryQuote();
  const preview = Boolean(billing?.adminPreview);
  const purchased = owned(quote?.status,target);
  document.querySelectorAll('[data-entry-price]').forEach(value => {
    const topic = value.dataset.entryPrice;
    const choice = {topic,year:topic==='lifelong'?0:Number($('entry-year').value)};
    value.textContent = preview ? '차감 없음' : owned(quote?.status,choice) ? '이용 가능' : priceLabel(quote?.status,choice);
  });
  $('entry-price-value').textContent = `${targetLabel(target)} · ${preview?'관리자 미리보기':purchased?'추가 차감 없음':priceLabel(quote?.status,target)}`;
  submit.dataset.expectedCharge=String(preview?0:payable(quote?.status,target));
  scheduleAccessExpiry();
  if (busy) return;
  submit.disabled = entryCheckPending || entryQuoteError;
  submit.querySelector('span').textContent = entryCheckPending ? '구매 내역 확인 중…'
    : preview ? `${targetLabel(target)} 미리보기` : purchased ? `${targetLabel(target)} 다시 보기 · 0쭈` : `${priceLabel(quote?.status,target)}로 ${targetLabel(target)} 펼치기`;
}
function updateProductOffer() {
  expireCurrentReading();
  const target = targetFrom('report');
  $('report-year-field').hidden = target.topic==='lifelong';
  const status = currentAccess?.chart===currentReading && currentAccess.owner===billing?.user ? currentAccess.status : null;
  const purchased = owned(status,target);
  const current = currentDetail && sameTarget(currentDetail,target);
  document.querySelectorAll('[data-report-price]').forEach(value => {
    const topic = value.dataset.reportPrice;
    const choice = {topic,year:topic==='lifelong'?0:Number($('fortune-year').value)};
    value.textContent = status?.adminPreview ? '차감 없음' : owned(status,choice) ? '이용 가능' : priceLabel(status,choice);
  });
  $('product-offer').textContent = `${targetLabel(target)} · ${status?.adminPreview?'관리자 미리보기, 차감 없음':purchased?'이용 시간 안, 다시 보기 0쭈':status?priceLabel(status,target):'구매 내역 확인 필요'}`;
  $('open-product').dataset.expectedCharge=String(status?.adminPreview?0:payable(status,target));
  $('open-product').disabled = reportBusy || !status || Boolean(current);
  if (!reportBusy) $('open-product').textContent = current ? '현재 보고 있는 풀이'
    : status?.adminPreview ? `${targetLabel(target)} 미리보기` : purchased ? `${targetLabel(target)} 다시 보기 · 0쭈` : `${priceLabel(status,target)}로 ${targetLabel(target)} 펼치기`;
  $('report-product-picker').disabled = reportBusy;
  $('fortune-year').disabled = reportBusy;
  scheduleAccessExpiry();
}
function scheduleEntryCheck() {
  clearTimeout(entryCheckTimer);
  quoteGeneration++;
  entryCheckPending=false;
  entryQuoteError=false;
  $('entry-check-error').hidden=true;
  if (entryQuote?.signature!==birthSignature()) entryQuote=null;
  fillYears($('entry-year'),validEntryQuote()?.chart.solar.year || Number($('birth-year').value)||1900,Number($('entry-year').value),validEntryQuote()?.status);
  updateEntryOffer();
  if (!busy && !$('intro').hidden && billingSignedIn && hasBirth() && !validEntryQuote()) entryCheckTimer=setTimeout(()=>void refreshEntryQuote(),180);
}
async function refreshEntryQuote() {
  clearTimeout(entryCheckTimer);
  if (busy || $('intro').hidden || !hasBirth() || !billingSignedIn) { updateEntryOffer(); return; }
  const generation=++quoteGeneration;
  const input=readBirth(),signature=birthSignature(input);
  entryCheckPending=true;
  entryQuoteError=false;
  $('entry-check-error').hidden=true;
  updateEntryOffer();
  try {
    const chart=await calculateBirth(input);
    const payment=await readyBilling();
    if (generation!==quoteGeneration || busy || $('intro').hidden) return;
    const status=await payment.status(chart);
    if (generation!==quoteGeneration || busy || $('intro').hidden) return;
    entryQuote={signature,chart,status,owner:payment.user};
    fillYears($('entry-year'),chart.solar.year,Number($('entry-year').value),status);
  } catch (error) {
    if (generation!==quoteGeneration || busy || $('intro').hidden) return;
    entryQuote=null;
    if (error?.name!=='SajuInputError') {
      entryQuoteError=true;
      $('entry-check-error-text').textContent='구매 내역을 확인하지 못했어요. 쭈는 차감되지 않았어요. 다시 확인해 주세요.';
      $('entry-check-error').hidden=false;
    }
  } finally {
    if (generation===quoteGeneration) { entryCheckPending=false; updateEntryOffer(); }
  }
}
form.addEventListener('input',scheduleEntryCheck);
form.addEventListener('change',scheduleEntryCheck);
$('retry-entry-status').addEventListener('click',()=>void refreshEntryQuote());
document.querySelectorAll('input[name="report-topic"]').forEach(input=>input.addEventListener('change',updateProductOffer));
$('fortune-year').addEventListener('change',updateProductOffer);
document.querySelectorAll('.reading-size-control button').forEach(button=>button.addEventListener('click',()=>{
  const size=button.dataset.readingSize;
  $('detailed-reading').dataset.readingSize=size;
  document.querySelectorAll('.reading-size-control button').forEach(choice=>choice.setAttribute('aria-pressed',String(choice===button)));
}));

async function prepareDetailedReading(chart,target,person=currentPerson||readPerson()) {
  detailModulesPromise ||= Promise.all([
    import('./fortune-data.mjs?v=20261113-saju-reader1'),
    import('./readings.mjs?v=20261113-saju-portrait1'),
    import('./report-view.mjs?v=20261113-saju-portrait1'),
    import('./daeun.mjs?v=20261113-saju-reader1')
  ]).catch(error=>{detailModulesPromise=null;throw error;});
  const [dataModule,readingModule,viewModule,daeunModule]=await detailModulesPromise;
  const now=new Date();
  const fortune=dataModule.analyzeFortune(chart,{year:target.topic==='lifelong'?koreanYear():target.year,now});
  const daeun=['lifelong','all'].includes(target.topic)?daeunModule.analyzeDaeun(chart,{gender:person.gender,now}):null;
  const reading=readingModule.buildDetailedReading(chart,fortune,{daeun});
  const body=reading.copyByCategory?.[target.topic];
  const copyText=typeof body==='string'?[person.name?`${person.name}님의 사주 풀이`:'나의 사주 풀이',body].join('\n\n'):body;
  if (typeof copyText!=='string' || !copyText.trim()) throw new Error('product_reading_incomplete');
  const content=document.createElement('div');
  viewModule.renderDetailedReport(content,{reading,fortune,topic:target.topic});
  return {fortune,reading,content,copyText,target,person:{...person}};
}
function commitDetailedReading(chart,{fortune,reading,content,copyText,target},access) {
  if (!activeAccess(access)) throw Object.assign(new Error('이용 시간이 끝났어요. 표시된 금액을 확인한 뒤 다시 펼쳐 주세요.'),{code:'access_expired'});
  $('report-content').replaceChildren(...content.childNodes);
  currentDetail={chart,topic:target.topic,year:target.year,reading,fortune,copyText,access};
  document.querySelector('.birth-chart-details').hidden=false;
  document.querySelector('.conventions').hidden=false;
  $('result-warnings').hidden=!$('result-warnings').childElementCount;
  $('report-content').dataset.topic=target.topic;
  $('report-content').dataset.year=String(target.year);
  $('report-content').removeAttribute('aria-busy');
  $('current-report-link').href='#reading-summary';
  $('current-report-label').textContent='핵심 운세';
  $('current-reading-title').textContent=`${targetLabel(target)}${target.topic==='monthly'?' · 1~12월 전체':''}`;
  const end=accessEndLabel(access);
  $('current-reading-note').textContent=access.adminPreview?'관리자 미리보기 · 차감 없음'
    : `${target.topic==='all'?'각 항목 결제 후 24시간 · 가장 빠른 만료: ':''}${end} · 다시 보기 0쭈`;
  $('reading-controls').hidden=false;
  $('other-reading-options').open=false;
  $('report-toc').hidden=false;
  $('report-status').textContent='';
  $('report-status').classList.remove('is-loading');
  $('copy-reading').disabled=false;
  $('report-error').hidden=true;
  updateProductOffer();
}
function recordReceipt(status,receipt,target) {
  const next={...status,coins:receipt.coins??status.coins,entitlements:[...(status.entitlements||[])]};
  if (receipt.adminPreview) next.adminPreview=true;
  else if (receipt.legacy_bundle) next.bundle_entitlement={...receipt,price:10};
  else {
    const items=target.topic==='all'?receipt.items:[receipt];
    for (const item of items) {
      next.entitlements=next.entitlements.filter(current=>!sameTarget(current,item));
      next.entitlements.push({...item});
    }
  }
  return next;
}
function openInitialReport(chart,prepared,status,receipt,signature) {
  currentReading=chart;
  currentPerson=prepared.person;
  const access=recordReceipt(status,receipt,prepared.target);
  currentAccess={chart,owner:billing.user,status:access};
  entryQuote={signature,chart,owner:billing.user,status:access};
  reportGeneration++;
  reportBusy=false;
  $('report-product-picker').querySelector(`input[value="${prepared.target.topic}"]`).checked=true;
  fillYears($('fortune-year'),chart.solar.year,prepared.target.year||koreanYear(),access);
  renderReading(chart);
  commitDetailedReading(chart,prepared,receipt);
}
async function refreshReportAccess() {
  if (!currentReading || reportBusy) return;
  const chart=currentReading,generation=++reportGeneration;
  reportBusy=true;
  $('retry-report').disabled=true;
  updateProductOffer();
  try {
    const payment=await readyBilling();
    const status=await payment.status(chart);
    if (generation!==reportGeneration || currentReading!==chart || $('result').hidden) return;
    currentAccess={chart,owner:payment.user,status};
    fillYears($('fortune-year'),chart.solar.year,Number($('fortune-year').value),status);
    if (currentDetail && !owned(status,currentDetail)) expireCurrentReading(true);
    $('report-error').hidden=true;
  } catch {
    if (generation!==reportGeneration || currentReading!==chart) return;
    currentAccess=null;
    expireCurrentReading();
    $('report-error-text').textContent='이용 시간을 확인하지 못했어요. 다시 확인해 주세요.';
    $('report-error').hidden=false;
  } finally {
    if (generation===reportGeneration && currentReading===chart) {
      reportBusy=false;
      $('retry-report').disabled=false;
      updateProductOffer();
    }
  }
}
async function openSelectedProduct() {
  if (reportBusy || !currentReading || !currentAccess) return;
  const clickedCharge=Number($('open-product').dataset.expectedCharge);
  expireCurrentReading();
  const chart=currentReading,target=targetFrom('report');
  if (sameTarget(currentDetail,target)) return;
  const generation=++reportGeneration;
  reportBusy=true;
  $('copy-reading').disabled=true;
  $('report-error').hidden=true;
  $('report-status').textContent=`${targetLabel(target)}의 계산과 풀이를 준비하고 있어요…`;
  $('report-status').classList.add('is-loading');
  updateProductOffer();
  $('open-product').textContent='선택한 풀이 준비 중…';
  let inspected=false;
  try {
    const payment=await readyBilling();
    const status=await payment.status(chart);
    inspected=true;
    if (generation!==reportGeneration || currentReading!==chart || $('result').hidden) return;
    currentAccess={chart,owner:payment.user,status};
    const prepared=await prepareDetailedReading(chart,target);
    if (generation!==reportGeneration || currentReading!==chart || $('result').hidden) return;
    $('open-product').textContent='선택한 항목의 이용 내역 확인 중…';
    const receipt=await payment.start(chart,{...target,expectedCharge:Math.min(clickedCharge,payable(status,target))});
    if (generation!==reportGeneration || currentReading!==chart || $('result').hidden) return;
    if (!receipt?.ok) throw new Error('payment_unverified');
    currentAccess={chart,owner:payment.user,status:recordReceipt(status,receipt,target)};
    commitDetailedReading(chart,prepared,receipt);
    if (receipt.replayed) toast('구매한 항목을 추가 차감 없이 다시 펼쳤어요.');
    $('detailed-title').focus({preventScroll:true});
  } catch (error) {
    if (generation!==reportGeneration || currentReading!==chart || $('result').hidden) return;
    if (!inspected) currentAccess=null;
    expireCurrentReading();
    const message=error?.code&&/[가-힣]/.test(error.message||'')?error.message:'선택한 풀이를 열지 못했어요. 다시 시도해 주세요.';
    $('report-error-text').textContent=message;
    $('report-error').hidden=false;
    if (currentDetail) $('report-status').textContent='';
  } finally {
    if (generation===reportGeneration && currentReading===chart && !$('result').hidden) {
      reportBusy=false;
      $('copy-reading').disabled=!currentDetail;
      $('report-status').classList.remove('is-loading');
      updateProductOffer();
    }
  }
}
$('open-product').addEventListener('click',()=>void openSelectedProduct());
$('retry-report').addEventListener('click',()=>void refreshReportAccess());

function updateBillingStatus() {
  $('login-link').hidden=billingSignedIn;
  if (billing?.adminPreview) $('payment-status').textContent='관리자 미리보기 · 쭈 차감 없음';
  else if (billingSignedIn) $('payment-status').textContent=Number.isFinite(billing.balance)?`보유 ${new Intl.NumberFormat('ko-KR').format(billing.balance)}쭈`:'보유 쭈를 확인하고 있어요.';
  else $('payment-status').textContent='로그인 후 선택한 사주 풀이를 펼칠 수 있어요.';
  updateEntryOffer();
  if (currentReading) updateProductOffer();
}
function resetAfterAccountChange() {
  submitGeneration++;reportGeneration++;quoteGeneration++;
  clearTimeout(entryCheckTimer);
  clearTimeout(accessTimer);
  busy=false;reportBusy=false;entryCheckPending=false;entryQuoteError=false;
  currentReading=null;currentPerson=null;currentDetail=null;currentAccess=null;entryQuote=null;
  $('result').hidden=true;$('intro').hidden=false;
  $('result-title').textContent='나의 운세';$('detailed-title').textContent='나의 운세 풀이';
  for(const id of ['birth-summary','lunar-summary','result-warnings','result-pillars','day-master-glyph','day-master-title','day-master-symbol','day-master-reading','element-count','element-bars','convention-list'])$(id).replaceChildren();
  $('report-content').replaceChildren();
  $('report-content').removeAttribute('aria-busy');
  $('report-toc').hidden=true;$('report-error').hidden=true;$('entry-check-error').hidden=true;
  $('reading-controls').hidden=true;$('other-reading-options').open=false;
  $('copy-reading').disabled=true;
  form.reset();
  profilePicker.resetSelection();profilePicker.setDisabled(false);profilePicker.refresh();
  form.querySelectorAll('fieldset').forEach(fieldset=>{fieldset.disabled=false;});
  form.removeAttribute('aria-busy');
  document.querySelector('.skip-link').href='#birth-form';
  document.querySelector('.skip-link').textContent='출생 정보 입력으로 바로가기';
  fillYears($('entry-year'));
  updateCalendar();updateTime();updateEntryOffer();
}
function recordFortuneVisit() {
  if (!billing?.client || billing.adminPreview) return;
  try { window.OjjudaSiteUsage?.configure({client:billing.client}); } catch {} // Statistics never block a reading.
}

async function readyBilling() {
  if (billingPromise) return billingPromise;
  const task=(async()=>{
    const {SajuPayment}=await import('./payment.js?v=20261113-saju-24h1');
    billing ||= new SajuPayment({
      onBalance:()=>updateBillingStatus(),
      onAccountChange:()=>{
        billingSignedIn=false;billingPromise=null;
        if (billingInitialized) resetAfterAccountChange();
        updateBillingStatus();
        Promise.resolve().then(()=>readyBilling()).catch(()=>{$('payment-status').textContent='로그인 정보를 다시 확인해 주세요. 펼치기를 누르면 재시도해요.';});
      },
      onModeChange:({adminPreview})=>{
        if (billingInitialized&&billingMode!==Boolean(adminPreview)) resetAfterAccountChange();
        billingMode=Boolean(adminPreview);updateBillingStatus();
        if (billingInitialized&&!billingMode) recordFortuneVisit();
      }
    });
    const state=await billing.init();
    recordFortuneVisit();
    billingInitialized=true;billingSignedIn=state.signedIn===true;billingMode=Boolean(state.adminPreview);
    profilePicker.refresh();
    updateBillingStatus();
    scheduleEntryCheck();
    return billing;
  })();
  billingPromise=task;
  try{return await task;}catch(error){if(billingPromise===task)billingPromise=null;throw error;}
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  const clickedCharge=Number(submit.dataset.expectedCharge);
  busy=true;
  const generation=++submitGeneration;
  quoteGeneration++;
  clearTimeout(entryCheckTimer);
  entryCheckPending=false;
  const input=readBirth(),signature=birthSignature(input),person=readPerson(),personKey=personSignature(),target=targetFrom('entry');
  const stillCurrent=()=>generation===submitGeneration&&personKey===personSignature();
  submit.disabled=true;
  submit.querySelector('span').textContent=`${targetLabel(target)} 준비 중…`;
  form.setAttribute('aria-busy','true');
  form.querySelectorAll('fieldset').forEach(fieldset=>{fieldset.disabled=true;});
  profilePicker.setDisabled(true);
  clearError();
  let inspected=false;
  try {
    const payment=await readyBilling();
    if(!stillCurrent())return;
    if(!billingSignedIn&&!payment.adminPreview)throw Object.assign(new Error('사주를 펼치려면 먼저 아지트에서 로그인해 주세요.'),{code:'auth_required'});
    const chart=await calculateBirth(input);
    if(!stillCurrent())return;
    const savedProfile=await profilePicker.saveCurrent();
    const saveWarning=savedProfile?null:$('saved-profiles').querySelector('.profile-picker-status')?.textContent;
    if(!stillCurrent())return;
    const status=await payment.status(chart);
    inspected=true;
    if(!stillCurrent())return;
    entryQuote={signature,chart,status,owner:payment.user};
    entryQuoteError=false;$('entry-check-error').hidden=true;
    const prepared=await prepareDetailedReading(chart,target,person);
    if(!stillCurrent())return;
    submit.querySelector('span').textContent='선택한 항목의 이용 내역 확인 중…';
    const receipt=await payment.start(chart,{...target,expectedCharge:Math.min(clickedCharge,payable(status,target))});
    if(!stillCurrent())return;
    if(!receipt?.ok)throw new Error('payment_unverified');
    openInitialReport(chart,prepared,status,receipt,signature);
    if(saveWarning)toast(saveWarning);
    else if(receipt.replayed)toast('구매한 항목을 추가 차감 없이 다시 펼쳤어요.');
  } catch(error) {
    if(generation!==submitGeneration)return;
    if(!inspected&&billingSignedIn&&error?.name!=='SajuInputError'){
      entryQuoteError=true;
      $('entry-check-error-text').textContent='구매 내역을 확인하지 못했어요. 쭈는 차감되지 않았어요. 다시 확인한 뒤 선택한 풀이를 열어 주세요.';
      $('entry-check-error').hidden=false;
    }else{
      $('form-error').textContent=error?.name==='SajuInputError'||(error?.code&&/[가-힣]/.test(error.message||''))?error.message:'지금은 풀이를 펼치지 못했어요. 잠시 후 다시 눌러 주세요.';
      if(error?.name==='SajuInputError')markInvalidFields(error);
      $('form-error').hidden=false;
      $('form-error').focus({preventScroll:true});
      $('form-error').scrollIntoView({block:'nearest',behavior:reducedMotion?'instant':'smooth'});
    }
  }finally{
    if(generation===submitGeneration){
      busy=false;
      form.querySelectorAll('fieldset').forEach(fieldset=>{fieldset.disabled=false;});
      profilePicker.setDisabled(false);
      form.removeAttribute('aria-busy');
      updateBillingStatus();
    }
  }
});
// Enable only after the submission listener can prevent native GET requests.
updateEntryOffer();
$('payment-status').textContent='로그인과 보유 쭈를 확인하고 있어요.';
void readyBilling().catch(()=>{$('payment-status').textContent='이용 정보를 확인하지 못했어요. 펼치기를 누르면 다시 확인해요.';$('login-link').hidden=false;});
$('edit-birth').addEventListener('click',()=>{
  reportGeneration++;
  reportBusy=false;currentReading=null;currentPerson=null;currentDetail=null;currentAccess=null;
  $('report-content').replaceChildren();
  delete $('report-content').dataset.topic;
  delete $('report-content').dataset.year;
  $('copy-reading').disabled=true;$('result').hidden=true;$('intro').hidden=false;
  document.querySelector('.skip-link').href='#birth-form';
  document.querySelector('.skip-link').textContent='출생 정보 입력으로 바로가기';
  clearError();updateEntryOffer();scheduleEntryCheck();
  $('birth-year').focus({preventScroll:true});
  form.scrollIntoView({block:'center',behavior:reducedMotion?'instant':'smooth'});
});
function toast(message){clearTimeout(toastTimer);$('status').textContent=message;$('status').classList.add('is-visible');toastTimer=setTimeout(()=>$('status').classList.remove('is-visible'),2600);}
$('copy-reading').addEventListener('click',async()=>{
  if (expireCurrentReading()) { updateProductOffer(); return; }
  if(reportBusy||!currentDetail||currentDetail.chart!==currentReading)return;
  try{await navigator.clipboard.writeText(currentDetail.copyText);toast('풀이와 계산 근거를 복사했어요.');}
  catch{toast('복사 권한을 확인해 주세요. 풀이를 직접 선택해 복사할 수도 있어요.');}
});

function resumeAccessCheck() {
  if(!busy)profilePicker.refresh({preserveStatus:profilePicker.statusElement.dataset.state==='error'});
  expireCurrentReading();
  updateEntryOffer();
  if (currentReading) {
    updateProductOffer();
    if (!reportBusy) void refreshReportAccess();
  } else if (!busy && billingSignedIn && hasBirth()) void refreshEntryQuote();
}
window.addEventListener('focus',resumeAccessCheck);
window.addEventListener('pageshow',resumeAccessCheck);
window.addEventListener('storage',event=>{
  if(!busy&&(event.key===null||event.key?.startsWith(SAVED_PROFILES_PREFIX)))profilePicker.refresh({preserveStatus:profilePicker.statusElement.dataset.state==='error'});
});
document.addEventListener('visibilitychange',()=>{
  if (document.visibilityState==='visible') resumeAccessCheck();
});

// Contents links reveal their requested section without exposing every chapter.
function revealReadingTarget(event) {
  const link=event.target.closest('a[href^="#"]');
  const target=link && $(link.hash.slice(1));
  if (!target) return;
  for (let parent=target;parent && parent!==$('result');parent=parent.parentElement) {
    if (parent.tagName==='DETAILS') parent.open=true;
  }
  if (target.tagName==='SUMMARY') target.parentElement.open=true;
}
$('report-toc').addEventListener('click',revealReadingTarget);
document.querySelector('.other-reading-link').addEventListener('click',revealReadingTarget);
