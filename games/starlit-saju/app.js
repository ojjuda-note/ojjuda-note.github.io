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
let currentDetail = null;
let reportGeneration = 0;
let reportBusy = false;
let toastTimer;

const STEM_READINGS = {
  "甲": {
    "name": "갑목",
    "symbol": "곧게 자라는 큰 나무",
    "intro": "갑목은 하늘을 향해 자라는 큰 나무를 상징해요. 자신의 기준을 세우고, 오래 지켜 가고 싶은 가치를 돌아보는 글자예요."
  },
  "乙": {
    "name": "을목",
    "symbol": "바람과 함께 자라는 풀",
    "intro": "을목은 부드럽게 뻗어 가는 풀과 덩굴을 상징해요. 주변과 어울리면서도 자신만의 방향을 찾아가는 모습을 떠올려 보세요."
  },
  "丙": {
    "name": "병화",
    "symbol": "주변을 밝히는 햇살",
    "intro": "병화는 넓은 곳을 환하게 비추는 태양을 상징해요. 드러내고 나누는 즐거움, 그리고 스스로 쉬는 시간을 함께 돌아보는 글자예요."
  },
  "丁": {
    "name": "정화",
    "symbol": "어둠을 밝혀 주는 등불",
    "intro": "정화는 가까운 곳을 따뜻하게 비추는 등불을 상징해요. 작은 차이를 알아보는 마음과 한 가지에 정성을 기울이는 모습을 떠올려 보세요."
  },
  "戊": {
    "name": "무토",
    "symbol": "든든하게 서 있는 산",
    "intro": "무토는 넓고 단단한 산을 상징해요. 흔들리는 순간에도 중심을 찾는 마음, 익숙한 틀을 조금 넓히는 여유를 돌아보는 글자예요."
  },
  "己": {
    "name": "기토",
    "symbol": "생명을 품는 부드러운 대지",
    "intro": "기토는 씨앗을 품고 돌보는 흙을 상징해요. 일상을 가꾸는 세심함과 가까운 사람을 보살피는 마음을 돌아보는 글자예요."
  },
  "庚": {
    "name": "경금",
    "symbol": "형태를 잡는 단단한 쇠",
    "intro": "경금은 단단한 금속을 상징해요. 기준을 분명히 세우고 불필요한 것을 덜어 내는 힘, 그 기준을 전하는 방식을 함께 돌아보세요."
  },
  "辛": {
    "name": "신금",
    "symbol": "섬세하게 빛나는 보석",
    "intro": "신금은 정교하게 다듬은 보석을 상징해요. 작은 차이를 알아보는 감각과 자신만의 기준을 소중히 여기는 마음을 떠올려 보세요."
  },
  "壬": {
    "name": "임수",
    "symbol": "넓게 흐르는 큰 물",
    "intro": "임수는 강과 바다처럼 넓게 흐르는 물을 상징해요. 새로운 것을 품는 넓은 시야와 여러 가능성 사이에서 방향을 찾는 마음을 돌아보세요."
  },
  "癸": {
    "name": "계수",
    "symbol": "조용히 스며드는 빗물",
    "intro": "계수는 이슬과 빗물처럼 조용히 스며드는 물을 상징해요. 자세히 관찰하는 마음과 깊이 생각하는 시간을 돌아보는 글자예요."
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

function renderPillar(pillar, index) {
  const card = element('article', 'pillar-card' + (pillar.key === 'day' ? ' is-day' : ''));
  card.style.setProperty('--i', index);
  card.append(element('h3', 'pillar-label', pillar.label));
  card.append(element('span', 'pillar-caption', {year:'태어난 해',month:'태어난 달',day:'태어난 날',hour:'태어난 시'}[pillar.key]));
  if (pillar.hanja && pillar.stem && pillar.branch) {
    const glyphs = element('div', 'pillar-glyphs');
    [pillar.stem, pillar.branch].forEach((part, partIndex) => {
      const glyph = element('span', 'pillar-glyph', part.hanja);
      glyph.style.setProperty('--element-color', part.color);
      glyph.append(element('small', '', `${part.hangul} · ${partIndex ? '지지' : '천간'}`));
      glyphs.append(glyph);
    });
    card.append(glyphs, element('p', 'pillar-name', pillar.hangul));
    card.append(element('p', 'pillar-elements', `${pillar.stem.elementLabel} · ${pillar.branch.elementLabel}`));
  } else {
    card.append(element('div', 'pillar-unknown', '✧'));
    card.append(element('p', 'pillar-status', pillar.alternatives?.length ? '시간 확인 필요' : '시간 미상'));
    if (pillar.alternatives?.length) {
      const choices = element('div', 'pillar-alternatives');
      pillar.alternatives.forEach(choice => choices.append(element('span', '', `${choice.hanja} ${choice.hangul}`)));
      card.append(choices, element('p', 'pillar-empty-note', '절기 전후에 따라 달라져요.'));
    } else card.append(element('p', 'pillar-empty-note', '시간을 알면 펼칠 수 있어요.'));
  }
  return card;
}

function renderReading(result) {
  $('result-pillars').replaceChildren(...result.pillars.map(renderPillar));
  $('birth-summary').textContent = `양력 ${result.solar.label} · ${result.timeLabel || (result.timeKnown ? '시간 입력' : '태어난 시간 모름')}`;
  $('lunar-summary').textContent = `음력 ${result.lunar.label}`;
  const warningNodes = result.warnings.map(message => element('p', '', message));
  $('result-warnings').replaceChildren(...warningNodes);
  $('result-warnings').hidden = warningNodes.length === 0;
  const stem = result.dayMaster;
  const reading = STEM_READINGS[stem.hanja];
  $('day-master-glyph').textContent = stem.hanja;
  $('day-master-glyph').style.setProperty('--element-color', stem.color);
  $('day-master-title').textContent = `${reading.name} · ${stem.hanja}${{wood:'木',fire:'火',earth:'土',metal:'金',water:'水'}[stem.element]}`;
  $('day-master-symbol').textContent = reading.symbol;
  $('day-master-reading').textContent = reading.intro;
  $('element-count').textContent = `확인된 ${result.knownCharacterCount}글자`;
  const rows = result.elements.map(item => {
    const row = element('div', 'element-row');
    row.style.setProperty('--element-color', item.color);
    const label = element('span', 'element-label');
    label.append(element('b', '', item.hanja), document.createTextNode(item.label));
    const track = element('div', 'element-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('div', 'element-fill');
    fill.style.width = `${result.knownCharacterCount ? item.count / result.knownCharacterCount * 100 : 0}%`;
    track.append(fill);
    row.append(label, track, element('span', 'element-value', `${item.count}개`));
    return row;
  });
  $('element-bars').replaceChildren(...rows);
  $('convention-list').replaceChildren(...result.conventions.map(message => element('li', '', message)));
  $('intro').hidden = true;
  $('result').hidden = false;
  document.querySelector('.skip-link').href = '#result-title';
  document.querySelector('.skip-link').textContent = '사주 결과로 바로가기';
  $('result-title').focus({preventScroll:true});
  window.scrollTo({top:0,behavior:reducedMotion ? 'instant' : 'smooth'});
}

const TOPICS = Object.freeze({
  lifelong:{label:'평생운',description:'원국을 바탕으로 성향과 삶의 주제를 읽어요.'},
  annual:{label:'올해운',description:'선택한 한 해의 글자와 원국을 함께 읽어요.'},
  monthly:{label:'월별운',description:'선택한 연도의 1~12월 전체 풀이를 포함해요.'}
});
let entryQuote = null;
let entryQuoteError = false;
let entryCheckPending = false;
let entryCheckTimer;
let quoteGeneration = 0;
let currentAccess = null;

function koreanYear(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en', {year:'numeric',timeZone:'Asia/Seoul'}).format(now));
}
function fillYears(select, birthYear = 1900, preferred = Number(select.value)) {
  const nowYear = koreanYear();
  const choices = [nowYear-1,nowYear,nowYear+1].filter(year => year >= birthYear && year >= 1900 && year <= 2050);
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
  return topic==='lifelong' ? '평생운' : `${year}년 ${topic==='annual'?'운세':'월별운'}`;
}
function sameTarget(left,right) { return left?.topic===right?.topic && left?.year===right?.year; }
function owned(status,target) {
  return Boolean(status?.adminPreview || status?.bundle_entitlement || status?.entitlements?.some(item => item.topic===target.topic && Number(item.year)===target.year));
}
function readBirth() {
  return {
    year:Number($('birth-year').value),month:Number($('birth-month').value),day:Number($('birth-day').value),
    calendar:form.querySelector('input[name="calendar"]:checked').value,
    leapMonth:$('leap-month').checked,
    hour:$('time-unknown').checked ? null : Number($('birth-hour').value),
    minute:$('time-unknown').checked ? 0 : Number($('birth-minute').value)
  };
}
function birthSignature(input=readBirth()) { return JSON.stringify(input); }
function hasBirth() { return ['birth-year','birth-month','birth-day'].every(id => $(id).value !== ''); }
async function calculateBirth(input) {
  enginePromise ||= import('./engine.mjs?v=20261113-saju-topics1').catch(error => { enginePromise=null; throw error; });
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
    value.textContent = preview ? '차감 없음' : owned(quote?.status,choice) ? '구매 완료' : '10쭈';
  });
  $('entry-price-value').textContent = `${targetLabel(target)} · ${preview?'관리자 미리보기':purchased?'추가 차감 없음':'10쭈'}`;
  if (busy) return;
  submit.disabled = entryCheckPending || entryQuoteError;
  submit.querySelector('span').textContent = entryCheckPending ? '구매 내역 확인 중…'
    : preview ? `${targetLabel(target)} 미리보기` : purchased ? `${targetLabel(target)} 다시 보기 · 0쭈` : `10쭈로 ${targetLabel(target)} 펼치기`;
}
function updateProductOffer() {
  const target = targetFrom('report');
  $('report-year-field').hidden = target.topic==='lifelong';
  const status = currentAccess?.chart===currentReading && currentAccess.owner===billing?.user ? currentAccess.status : null;
  const purchased = owned(status,target);
  const current = currentDetail && sameTarget(currentDetail,target);
  document.querySelectorAll('[data-report-price]').forEach(value => {
    const topic = value.dataset.reportPrice;
    const choice = {topic,year:topic==='lifelong'?0:Number($('fortune-year').value)};
    value.textContent = status?.adminPreview ? '차감 없음' : owned(status,choice) ? '구매 완료' : '10쭈';
  });
  $('product-offer').textContent = `${targetLabel(target)} · ${status?.adminPreview?'관리자 미리보기, 차감 없음':purchased?'구매한 풀이, 추가 차감 없음':status?'10쭈':'구매 내역 확인 필요'}`;
  $('open-product').disabled = reportBusy || !status || Boolean(current);
  if (!reportBusy) $('open-product').textContent = current ? '현재 보고 있는 풀이'
    : status?.adminPreview ? `${targetLabel(target)} 미리보기` : purchased ? `${targetLabel(target)} 다시 보기 · 0쭈` : `10쭈로 ${targetLabel(target)} 펼치기`;
  $('report-product-picker').disabled = reportBusy;
  $('fortune-year').disabled = reportBusy;
}
function scheduleEntryCheck() {
  clearTimeout(entryCheckTimer);
  quoteGeneration++;
  entryCheckPending=false;
  entryQuoteError=false;
  $('entry-check-error').hidden=true;
  if (entryQuote?.signature!==birthSignature()) entryQuote=null;
  fillYears($('entry-year'),validEntryQuote()?.chart.solar.year || Number($('birth-year').value)||1900);
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
    fillYears($('entry-year'),chart.solar.year);
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

async function prepareDetailedReading(chart,target) {
  detailModulesPromise ||= Promise.all([
    import('./fortune-data.mjs?v=20261113-saju-topics1'),
    import('./readings.mjs?v=20261113-saju-topics1'),
    import('./report-view.mjs?v=20261113-saju-topics1')
  ]).catch(error=>{detailModulesPromise=null;throw error;});
  const [dataModule,readingModule,viewModule]=await detailModulesPromise;
  const fortune=dataModule.analyzeFortune(chart,{year:target.topic==='lifelong'?koreanYear():target.year,now:new Date()});
  const reading=readingModule.buildDetailedReading(chart,fortune);
  const copyText=reading.copyByCategory?.[target.topic];
  if (typeof copyText!=='string' || !copyText.trim()) throw new Error('product_reading_incomplete');
  const content=document.createElement('div');
  viewModule.renderDetailedReport(content,{reading,fortune,topic:target.topic});
  return {fortune,reading,content,copyText,target};
}
function commitDetailedReading(chart,{fortune,reading,content,copyText,target}) {
  $('report-content').replaceChildren(...content.childNodes);
  currentDetail={chart,topic:target.topic,year:target.year,reading,fortune,copyText};
  $('report-content').dataset.topic=target.topic;
  $('report-content').dataset.year=String(target.year);
  $('report-content').removeAttribute('aria-busy');
  $('detailed-intro').textContent=target.topic==='monthly' ? reading.monthsIntro : reading.sections.find(section=>section.id===target.topic)?.summary || reading.intro;
  $('current-report-link').href=target.topic==='monthly'?'#reading-months':`#reading-${target.topic}`;
  $('current-report-label').textContent=target.topic==='monthly'?'12개월 풀이':targetLabel(target);
  $('report-toc').hidden=false;
  $('report-status').textContent=`현재 보는 풀이: ${targetLabel(target)}${target.topic==='monthly'?' · 1~12월 전체':''}`;
  $('report-status').classList.remove('is-loading');
  $('copy-reading').disabled=false;
  $('report-error').hidden=true;
  updateProductOffer();
}
function recordReceipt(status,receipt,target) {
  const next={...status,coins:receipt.coins??status.coins,entitlements:[...(status.entitlements||[])]};
  if (receipt.adminPreview) next.adminPreview=true;
  else if (receipt.legacy_bundle) next.bundle_entitlement=next.bundle_entitlement||{price:10};
  else if (!next.entitlements.some(item=>sameTarget(item,target))) next.entitlements.push({...target,price:10,request_id:receipt.request_id});
  return next;
}
function openInitialReport(chart,prepared,status,receipt,signature) {
  currentReading=chart;
  const access=recordReceipt(status,receipt,prepared.target);
  currentAccess={chart,owner:billing.user,status:access};
  entryQuote={signature,chart,owner:billing.user,status:access};
  reportGeneration++;
  reportBusy=false;
  $('report-product-picker').querySelector(`input[value="${prepared.target.topic}"]`).checked=true;
  fillYears($('fortune-year'),chart.solar.year,prepared.target.year||koreanYear());
  renderReading(chart);
  commitDetailedReading(chart,prepared);
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
    $('report-error').hidden=true;
  } catch {
    if (generation!==reportGeneration || currentReading!==chart) return;
    currentAccess=null;
    $('report-error-text').textContent='구매 내역을 확인하지 못했어요. 지금 보고 있는 풀이는 유지되며, 새 차감은 하지 않아요.';
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
    const receipt=await payment.start(chart,target);
    if (generation!==reportGeneration || currentReading!==chart || $('result').hidden) return;
    if (!receipt?.ok) throw new Error('payment_unverified');
    currentAccess={chart,owner:payment.user,status:recordReceipt(status,receipt,target)};
    commitDetailedReading(chart,prepared);
    if (receipt.replayed) toast('구매한 항목을 추가 차감 없이 다시 펼쳤어요.');
    $('detailed-title').focus({preventScroll:true});
  } catch (error) {
    if (generation!==reportGeneration || currentReading!==chart || $('result').hidden) return;
    if (!inspected) currentAccess=null;
    const message=error?.code&&/[가-힣]/.test(error.message||'')?error.message:'선택한 풀이를 열지 못했어요. 다시 시도해 주세요.';
    $('report-error-text').textContent=`${message} 현재 보이는 ${targetLabel(currentDetail)}는 그대로 두었어요.`;
    $('report-error').hidden=false;
    $('report-status').textContent=`현재 보는 풀이: ${targetLabel(currentDetail)}`;
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
  busy=false;reportBusy=false;entryCheckPending=false;entryQuoteError=false;
  currentReading=null;currentDetail=null;currentAccess=null;entryQuote=null;
  $('result').hidden=true;$('intro').hidden=false;
  $('report-content').replaceChildren();
  $('report-content').removeAttribute('aria-busy');
  $('report-toc').hidden=true;$('report-error').hidden=true;$('entry-check-error').hidden=true;
  $('copy-reading').disabled=true;
  form.reset();
  form.querySelectorAll('fieldset').forEach(fieldset=>{fieldset.disabled=false;});
  form.removeAttribute('aria-busy');
  document.querySelector('.skip-link').href='#birth-form';
  document.querySelector('.skip-link').textContent='출생 정보 입력으로 바로가기';
  fillYears($('entry-year'));
  updateCalendar();updateTime();updateEntryOffer();
}
async function readyBilling() {
  if (billingPromise) return billingPromise;
  const task=(async()=>{
    const {SajuPayment}=await import('./payment.js?v=20261113-saju-topics1');
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
      }
    });
    const state=await billing.init();
    billingInitialized=true;billingSignedIn=state.signedIn===true;billingMode=Boolean(state.adminPreview);
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
  busy=true;
  const generation=++submitGeneration;
  quoteGeneration++;
  clearTimeout(entryCheckTimer);
  entryCheckPending=false;
  const input=readBirth(),signature=birthSignature(input),target=targetFrom('entry');
  submit.disabled=true;
  submit.querySelector('span').textContent=`${targetLabel(target)} 준비 중…`;
  form.setAttribute('aria-busy','true');
  form.querySelectorAll('fieldset').forEach(fieldset=>{fieldset.disabled=true;});
  clearError();
  let inspected=false;
  try {
    const payment=await readyBilling();
    if(generation!==submitGeneration)return;
    if(!billingSignedIn&&!payment.adminPreview)throw Object.assign(new Error('사주를 펼치려면 먼저 아지트에서 로그인해 주세요.'),{code:'auth_required'});
    const chart=await calculateBirth(input);
    const status=await payment.status(chart);
    inspected=true;
    if(generation!==submitGeneration)return;
    entryQuote={signature,chart,status,owner:payment.user};
    entryQuoteError=false;$('entry-check-error').hidden=true;
    const prepared=await prepareDetailedReading(chart,target);
    if(generation!==submitGeneration)return;
    submit.querySelector('span').textContent='선택한 항목의 이용 내역 확인 중…';
    const receipt=await payment.start(chart,target);
    if(generation!==submitGeneration)return;
    if(!receipt?.ok)throw new Error('payment_unverified');
    openInitialReport(chart,prepared,status,receipt,signature);
    if(receipt.replayed)toast('구매한 항목을 추가 차감 없이 다시 펼쳤어요.');
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
  reportBusy=false;currentReading=null;currentDetail=null;currentAccess=null;
  $('copy-reading').disabled=true;$('result').hidden=true;$('intro').hidden=false;
  document.querySelector('.skip-link').href='#birth-form';
  document.querySelector('.skip-link').textContent='출생 정보 입력으로 바로가기';
  clearError();updateEntryOffer();scheduleEntryCheck();
  $('birth-year').focus({preventScroll:true});
  form.scrollIntoView({block:'center',behavior:reducedMotion?'instant':'smooth'});
});
function toast(message){clearTimeout(toastTimer);$('status').textContent=message;$('status').classList.add('is-visible');toastTimer=setTimeout(()=>$('status').classList.remove('is-visible'),2600);}
$('copy-reading').addEventListener('click',async()=>{
  if(reportBusy||!currentDetail||currentDetail.chart!==currentReading)return;
  try{await navigator.clipboard.writeText(currentDetail.copyText);toast('현재 보고 있는 항목의 풀이와 계산 근거를 복사했어요.');}
  catch{toast('복사 권한을 확인해 주세요. 풀이를 직접 선택해 복사할 수도 있어요.');}
});
