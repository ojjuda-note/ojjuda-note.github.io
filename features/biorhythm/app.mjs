import { CYCLES, isoToDay, todayInSeoul, addDays, calculate, makeSeries } from './engine.mjs?v=20261113-biorhythm1';
import { CONTENT } from './content.mjs?v=20261113-biorhythm-paid1';
import { BiorhythmPayment, PRICE } from './payment.mjs?v=20261113-biorhythm-paid1';
import { createSavedBirthdays } from './saved-birthdays.mjs?v=20261113-biorhythm-paid1';

const $ = (id) => document.getElementById(id);
const html = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const colors = { physical: '#bd4e60', emotional: '#227b6e', intellectual: '#7854aa' };
const dash = { physical: '', emotional: '9 5', intellectual: '3 5' };
const hints = { physical: '몸을 위한 한 가지', emotional: '마음에 작은 여백', intellectual: '생각을 정리하는 시간' };
const bands = Object.fromEntries(CONTENT.bands.map((band) => [band.id, band]));
const visibleCycles = new Set(CYCLES.map((cycle) => cycle.id));
const compactMedia = matchMedia('(max-width: 680px)');
let chartGeometry = {width:900,left:46,right:25};
let current = null;
let series = [];
let sample = false;
let statusTimer;
let resultRevision = 0;
const SAMPLE_BIRTH = '1990-01-01';
let inputRevision = 0;
let quoteRevision = 0;
let quote = null;
let shownOffer = null;
let access = null;
let busy = false;
let pendingSelection = null;
let initializing = true;
let expiryTimer;
let quoteExpiryTimer;
let birthDirty = false;
const billing = new BiorhythmPayment({
  onBalance: () => renderPurchase(),
  onAccountChange: () => {
    inputRevision++; quoteRevision++; quote = null; birthDirty = false;
    discardResult();
    $('birth-date').value = '';
    $('target-date').value = todayInSeoul();
    clearError();
    savedBirthdays.clearView(); savedBirthdays.refresh();
    $('payment-status').textContent = '로그인한 계정이 바뀌었어요. 생일을 다시 입력해 주세요.';
    renderPurchase();
    Promise.resolve().then(() => billing.signedIn ? billing.status() : null).catch(() => {});
  }
});
const savedBirthdays = createSavedBirthdays({
  container:$('saved-birthdays'),
  getIdentity:() => ({userId:billing.user,anonymous:billing.anonymous}),
  onSelect:(birth) => {
    if (busy) return;
    inputRevision++; quoteRevision++; quote = null; birthDirty = false;
    discardResult(); clearError();
    $('birth-date').value = birth;
    if (!$('target-date').value || $('target-date').value < birth) $('target-date').value = todayInSeoul();
    $('payment-status').textContent = '저장한 생일을 골랐어요. 표시된 이용료를 확인하고 펼쳐 주세요.';
    renderPurchase(); void refreshQuote();
  },
  onMessage:(message) => announce(message)
});

function saveCurrentBirth() {
  const birth = validBirthInput();
  if (busy || !birthDirty || !birth || !billing.signedIn) return;
  if (savedBirthdays.save(birth,{announce:false,expectedOwner:billing.user})) birthDirty = false;
}

function expiryLabel(receipt) {
  return new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(receipt.expires_at));
}

function quoteIsActive() {
  return quote?.birth === $('birth-date').value && quote.owner === billing.user && billing.isActive(quote.receipt);
}

function renderPurchase() {
  const entitled = quoteIsActive();
  if (!busy) shownOffer = {charge:entitled ? 0 : PRICE,owner:billing.user,birth:$('birth-date').value,
    birthKey:quote?.birth === $('birth-date').value && quote.owner === billing.user ? quote.birthKey : null,epoch:inputRevision};
  $('calculate-button').textContent = busy ? '이용 내역 확인 중…' : entitled ? '이어서 펼치기 · 0쭈' : '5쭈로 내 리듬 펼치기';
  $('calculate-button').disabled = busy || initializing;
  for (const id of ['sample-button','clear-button','birth-date','target-date','input-today']) $(id).disabled = busy;
  savedBirthdays.setDisabled(busy);
  for (const control of $('results').querySelectorAll('button,input,textarea')) control.disabled = busy;
  $('results').inert = busy;
  $('results').setAttribute('aria-busy', String(busy));
  if (!busy && current) {
    $('previous-day').disabled = current.targetDate <= current.birthDate;
    $('next-day').disabled = current.targetDate >= '2100-12-31';
  }
  $('rhythm-form').setAttribute('aria-busy', String(busy));
  $('login-link').hidden = billing.signedIn;
  $('wallet-balance').textContent = Number.isSafeInteger(billing.balance) ? `보유 ${billing.balance.toLocaleString('ko-KR')}쭈` : '';
  $('purchase-offer').textContent = entitled ? `${expiryLabel(quote.receipt)}까지 다시 보기 0쭈 · 한국시간` : '5쭈 · 같은 생일로 결제 후 24시간 이용';
  clearTimeout(quoteExpiryTimer);
  if (entitled) {
    const displayedQuote = quote;
    quoteExpiryTimer = setTimeout(() => {
      if (quote !== displayedQuote || billing.isActive(displayedQuote.receipt)) return;
      if (current && !sample) expireReading();
      else renderPurchase();
    }, billing.remainingMs(displayedQuote.receipt) + 30);
  }
}

function validBirthInput() {
  const birth = $('birth-date').value;
  try { isoToDay(birth); return birth <= todayInSeoul() ? birth : null; } catch { return null; }
}

async function refreshQuote() {
  const birth = validBirthInput(), owner = billing.user, request = ++quoteRevision;
  if (!birth || !billing.signedIn) { quote = null; renderPurchase(); return; }
  const stillCurrent = () => request === quoteRevision && owner === billing.user && birth === $('birth-date').value;
  try {
    const status = await billing.status(birth, {isCurrent:stillCurrent});
    if (!stillCurrent()) return;
    quote = {birth,owner,birthKey:status.birth_key,receipt:status.entitlement};
    renderPurchase();
  } catch (error) {
    if (!stillCurrent()) return;
    quote = null; renderPurchase();
    $('payment-status').textContent = error.message;
  }
}

function expireReading() {
  if (sample || !current) return;
  quote = null; discardResult(); renderPurchase();
  $('payment-status').textContent = '24시간 이용이 끝났어요. 다시 펼치기를 눌러야 새로 5쭈를 사용해요.';
  announce('이용 시간이 끝났어요. 다시 펼치려면 5쭈 버튼을 눌러 주세요.');
}

function hasAccess() {
  if (!current) return false;
  if (sample) return current.birthDate === SAMPLE_BIRTH;
  const allowed = access?.owner === billing.user && billing.signedIn
    && access.birth === current.birthDate && billing.isActive(access.receipt);
  if (!allowed) expireReading();
  return allowed;
}

function setAccess(birth, receipt) {
  access = {birth,owner:billing.user,birthKey:receipt.birth_key,receipt};
  quote = {...access};
  clearTimeout(expiryTimer);
  expiryTimer = setTimeout(() => { if (!sample && current && !billing.isActive(receipt)) expireReading(); }, billing.remainingMs(receipt) + 30);
  renderPurchase();
}

async function initializeBilling() {
  try {
    await billing.init();
    savedBirthdays.refresh();
    try { window.OjjudaSiteUsage?.configure({client:billing.client}); } catch {} // Analytics never block the calculator.
    if (billing.signedIn) {
      await billing.status();
      $('payment-status').textContent = '펼치기를 눌렀을 때만 쭈를 사용해요.';
      if (validBirthInput()) void refreshQuote();
    } else $('payment-status').textContent = '로그인 후 내 리듬을 펼칠 수 있어요. 샘플은 누구나 무료로 볼 수 있어요.';
  } catch (error) { $('payment-status').textContent = error.message; }
  finally { initializing = false; renderPurchase(); }
}

function readableDate(iso, year = true) {
  const date = new Date(isoToDay(iso) * 86400000);
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', ...(year ? {year: 'numeric'} : {}), month: 'long', day: 'numeric', weekday: 'short' }).format(date);
}

function shortDate(iso) {
  const [,month,day] = iso.split('-');
  return `${Number(month)}.${Number(day)}`;
}

function valueText(value) {
  const rounded = Math.round(value);
  return rounded === 0 ? '0' : `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}`;
}

function announce(message) {
  clearTimeout(statusTimer);
  $('status').textContent = message;
  statusTimer = setTimeout(() => { $('status').textContent = ''; }, 3600);
}

function clearError() {
  $('form-error').hidden = true;
  $('form-error').textContent = '';
  $('birth-date').removeAttribute('aria-invalid');
  $('target-date').removeAttribute('aria-invalid');
}

function showError(message, field) {
  $('form-error').textContent = message;
  $('form-error').hidden = false;
  if (field) {
    $(field).setAttribute('aria-invalid', 'true');
    $(field).focus();
  }
}

function formDates() {
  clearError();
  const birth = $('birth-date').value;
  const target = $('target-date').value;
  if (!birth) { showError(CONTENT.errors.birthMissing, 'birth-date'); return null; }
  if (!target) { showError(CONTENT.errors.targetMissing, 'target-date'); return null; }
  try { isoToDay(birth); } catch (error) { showError(error.message, 'birth-date'); return null; }
  if (birth > todayInSeoul()) { showError(CONTENT.errors.birthFuture, 'birth-date'); return null; }
  try { isoToDay(target); } catch (error) { showError(error.message, 'target-date'); return null; }
  if (target < birth) { showError(CONTENT.errors.targetBeforeBirth, 'target-date'); return null; }
  return { birth, target };
}

function phaseFor(cycle) {
  if (cycle.direction === 'turning') return CONTENT.phases[cycle.value >= 0 ? 'crest' : 'trough'];
  if (cycle.band === 'neutral') return CONTENT.phases[cycle.direction === 'rising' ? 'crossingUp' : 'crossingDown'];
  return CONTENT.phases[cycle.direction];
}

function readingFor(cycle, index) {
  const variants = CONTENT.axes[cycle.id].bands[cycle.band];
  const seed = Math.abs(isoToDay(current.birthDate) * 31 + isoToDay(current.targetDate) * 17 + index * 7);
  return variants[seed % variants.length];
}

function renderReadings() {
  const selected = current.targetDate;
  $('result-title').textContent = `${readableDate(selected, false)}의 리듬`;
  $('result-subtitle').textContent = `${selected.slice(0,4)}년 · ${selected === todayInSeoul() ? '오늘 · ' : ''}양력 날짜 기준`;
  $('sample-badge').hidden = !sample;
  $('access-note').textContent = sample ? '무료 샘플 · 1990년 1월 1일 생일로만 보여요.' : `${expiryLabel(access.receipt)}까지 이용 · 날짜를 바꿔도 추가 차감 없음 · 한국시간`;
  $('previous-day').disabled = selected <= current.birthDate;
  $('next-day').disabled = selected >= '2100-12-31';
  const comboId = current.cycles.some((cycle) => cycle.band === 'neutral') ? 'nearZero'
    : current.cycles.every((cycle) => cycle.value > 0) ? 'allPositive'
    : current.cycles.every((cycle) => cycle.value < 0) ? 'allNegative' : 'mixed';
  const combination = CONTENT.combinations.find((item) => item.id === comboId);
  $('summary-title').textContent = combination.title;
  $('summary-body').textContent = combination.description;
  $('rhythm-cards').innerHTML = current.cycles.map((cycle, index) => {
    const axis = CONTENT.axes[cycle.id];
    const reading = readingFor(cycle, index);
    const phase = phaseFor(cycle);
    const arrow = cycle.direction === 'rising' ? '↗' : cycle.direction === 'falling' ? '↘' : '↔';
    return `<article class="rhythm-card ${cycle.id}" aria-labelledby="cycle-${cycle.id}">
      <div class="card-title"><h3 id="cycle-${cycle.id}">${cycle.label}</h3><span>${cycle.period}일 주기</span></div>
      <div class="value-row"><strong class="rhythm-value" aria-label="리듬값 ${valueText(cycle.value)}">${valueText(cycle.value)}</strong><div class="value-labels"><span class="band-label">${html(bands[cycle.band].label)}</span><span class="direction-label"><span aria-hidden="true">${arrow}</span> ${html(phase.label)}</span></div></div>
      <div class="rhythm-meter" aria-hidden="true"><span style="--position:${(cycle.value + 100) / 2}%"></span></div>
      <div class="card-reading"><h4>${html(reading.title)}</h4><p>${html(reading.description)}</p></div>
      <details class="card-more"><summary>이 리듬 더 알아보기</summary><p>${html(axis.introduction)}</p><p>${html(phase.description)}</p><p>${html(axis.measurementNote)}</p></details>
    </article>`;
  }).join('');
  $('suggestion-cards').innerHTML = current.cycles.map((cycle,index) => `<article class="suggestion-card ${cycle.id}"><h4>${hints[cycle.id]}</h4><p>${html(readingFor(cycle,index).suggestion)}</p></article>`).join('');
  const promptIndex = Math.abs(isoToDay(current.birthDate) * 31 + isoToDay(selected) * 17) % CONTENT.reflectionPrompts.length;
  $('reflection-question').textContent = CONTENT.reflectionPrompts[promptIndex];
  $('calculation-evidence').innerHTML = `<p><strong>생일 ${html(readableDate(current.birthDate))} → ${html(readableDate(selected))}</strong><br>태어난 날을 0일로 세면 ${current.days.toLocaleString('ko-KR')}일이 지났어요.</p>
    <ul>${current.cycles.map((cycle) => `<li>${cycle.label}: <code>sin(2π × ${current.days} ÷ ${cycle.period}) × 100</code> = ${Math.abs(cycle.value) < 0.0005 ? '0.000' : cycle.value.toFixed(3)} → 화면 표시 ${valueText(cycle.value)}</li>`).join('')}</ul>
    <p>표시 숫자는 반올림하고, 곡선·구간은 반올림 전 값으로 계산해요. 상승·하강은 선택한 날짜에서 곡선이 향하는 방향이에요.</p>
    <p>+60 이상은 높은 구간, +15 초과~+60 미만은 양의 구간, −15~+15는 기준선 근처, −60 초과~−15 미만은 음의 구간, −60 이하는 낮은 구간으로 나눠요. 화면을 읽기 위한 구분이며 상태를 측정한 분류가 아니에요.</p>
    <p>곡선 기울기의 절댓값이 작은 구간(|cos(2π × 일수 ÷ 주기)| ≤ 0.08)은 꼭대기 또는 바닥 근처로 표시해요. 같은 생일·날짜에서는 같은 설명이 나오며, 숫자와 설명 모두 이름·성별·출생 시간을 사용하지 않아요.</p>`;
}

function renderChart() {
  const selectedIndex = series.findIndex((row) => row.date === current.targetDate);
  const width = compactMedia.matches ? 420 : 900, height = compactMedia.matches ? 250 : 292;
  const left = 46, right = 25, top = 27, bottom = 47;
  chartGeometry = {width,left,right};
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const x = (index) => left + (series.length <= 1 ? plotWidth / 2 : index / (series.length - 1) * plotWidth);
  const y = (value) => top + (100 - value) / 200 * plotHeight;
  const tickCount = Math.min(5, series.length);
  const ticks = [...new Set(Array.from({length: tickCount}, (_,i) => Math.round(i * (series.length - 1) / Math.max(1,tickCount-1))))];
  const summary = current.cycles.map((cycle) => `${cycle.label} ${valueText(cycle.value)}`).join(', ');
  const lines = [100,50,0,-50,-100].map((value) => `<line class="chart-grid${value === 0 ? ' chart-zero' : ''}" x1="${left}" x2="${width-right}" y1="${y(value)}" y2="${y(value)}"/>${Math.abs(value) === 50 ? '' : `<text class="chart-axis" x="${left-12}" y="${y(value)+4}" text-anchor="end">${valueText(value)}</text>`}`).join('');
  const paths = CYCLES.filter((cycle) => visibleCycles.has(cycle.id)).map((cycle) => {
    const path = series.map((row,index) => `${index ? 'L' : 'M'}${x(index).toFixed(2)},${y(row[cycle.id]).toFixed(2)}`).join(' ');
    return `<path class="chart-path" stroke="${colors[cycle.id]}" ${dash[cycle.id] ? `stroke-dasharray="${dash[cycle.id]}"` : ''} d="${path}"/>`;
  }).join('');
  const markerX = x(selectedIndex);
  const tagX = Math.max(left, Math.min(width - right - 68, markerX - 34));
  const markers = CYCLES.filter((cycle) => visibleCycles.has(cycle.id)).map((cycle) => `<circle class="chart-current-point" cx="${markerX}" cy="${y(series[selectedIndex][cycle.id])}" r="5" fill="${colors[cycle.id]}"/>`).join('');
  $('chart-holder').innerHTML = `<svg class="rhythm-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="chart-svg-title chart-svg-description"><title id="chart-svg-title">신체·감정·지성의 날짜별 곡선</title><desc id="chart-svg-description">${html(readableDate(current.targetDate))}: ${summary}. 아래 날짜 선택 막대와 표로도 결과를 확인할 수 있어요.</desc>${lines}<line class="chart-cursor" x1="${markerX}" x2="${markerX}" y1="${top}" y2="${height-bottom}"/>${paths}${markers}${ticks.map((index) => `<text class="chart-axis" x="${x(index)}" y="${height-13}" text-anchor="middle">${shortDate(series[index].date)}</text>`).join('')}<rect class="chart-date-tag" x="${tagX}" y="1" width="68" height="19" rx="4"/><text class="chart-date-label" x="${tagX+34}" y="14" text-anchor="middle">${shortDate(current.targetDate)}</text></svg>`;
  $('chart-dates').textContent = `${series[0].date.replaceAll('-','.')} — ${series.at(-1).date.replaceAll('-','.')} · ${series.length}일`;
  $('chart-slider').max = String(series.length - 1);
  $('chart-slider').value = String(selectedIndex);
  $('chart-slider').setAttribute('aria-valuetext', `${readableDate(current.targetDate)}, ${summary}`);
  $('chart-slider').disabled = series.length <= 1;
  $('slider-date').textContent = readableDate(current.targetDate);
  // Reuse rows when scrubbing so keyboard focus on a table date is preserved.
  const tableKey = `${series[0].date}/${series.at(-1).date}/${current.birthDate}`;
  if ($('chart-table').dataset.window !== tableKey) {
    $('chart-table').innerHTML = series.map((row) => `<tr data-date="${row.date}"><th scope="row">${shortDate(row.date)}</th>${CYCLES.map((cycle) => `<td>${valueText(row[cycle.id])}</td>`).join('')}<td><button type="button" data-date="${row.date}" aria-label="${html(readableDate(row.date))} 풀이 보기">보기</button></td></tr>`).join('');
    $('chart-table').dataset.window = tableKey;
  }
  for (const row of $('chart-table').rows) {
    if (row.dataset.date === current.targetDate) row.setAttribute('aria-current','date');
    else row.removeAttribute('aria-current');
  }
}

function display(birth, target, { focus = false, recenter = true } = {}) {
  current = calculate(birth, target);
  resultRevision += 1;
  if (recenter || !series.some((row) => row.date === target)) series = makeSeries(birth, target);
  $('target-date').value = target;
  $('results').hidden = false;
  $('copy-fallback').hidden = true;
  $('copy-text').value = '';
  renderReadings();
  renderChart();
  if (focus) {
    $('result-title').focus({preventScroll:true});
    $('results').scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
  }
}

async function submit() {
  if (busy || initializing) return;
  const dates = formDates();
  if (!dates) return;
  saveCurrentBirth();
  const wasSample = sample;
  // Consent belongs to the amount actually shown, even if that offer just expired.
  const acceptedOffer = shownOffer;
  if (!acceptedOffer || acceptedOffer.owner !== billing.user || acceptedOffer.birth !== dates.birth || acceptedOffer.epoch !== inputRevision) {
    renderPurchase();
    showError('입력 정보가 바뀌었어요. 표시된 이용료를 확인하고 다시 눌러 주세요.');
    return;
  }
  const clickedCharge = acceptedOffer.charge;
  const revision = ++inputRevision, ownerAtClick = acceptedOffer.owner;
  quoteRevision++;
  const stillCurrent = () => revision === inputRevision && dates.birth === $('birth-date').value
    && dates.target === $('target-date').value && billing.user === ownerAtClick;
  pendingSelection = {...dates,owner:ownerAtClick};
  busy = true; renderPurchase();
  try {
    await billing.init();
    if (!stillCurrent()) return;
    const status = await billing.status(dates.birth, {isCurrent:stillCurrent});
    if (!stillCurrent()) return;
    if (acceptedOffer.birthKey && acceptedOffer.birthKey !== status.birth_key) throw Object.assign(new Error('입력 정보가 바뀌었어요. 다시 확인해 주세요.'), {code:'input_changed'});
    quote = {birth:dates.birth,owner:billing.user,birthKey:status.birth_key,receipt:status.entitlement};
    if (!status.entitlement && clickedCharge === 0) throw Object.assign(new Error('이용 시간이 끝나 금액이 5쭈로 바뀌었어요. 확인한 뒤 다시 눌러 주세요.'), {code:'price_changed'});
    const receipt = status.entitlement || await billing.buy(dates.birth, {expectedCharge:clickedCharge,isCurrent:stillCurrent});
    if (!stillCurrent()) return;
    if (!billing.isActive(receipt)) throw Object.assign(new Error('이용 시간이 끝났어요. 다시 펼치기를 눌러 주세요.'), {code:'access_expired'});
    sample = false;
    setAccess(dates.birth, receipt);
    display(dates.birth, dates.target, {focus:true});
    if (!wasSample) savedBirthdays.save(dates.birth,{announce:false,expectedOwner:ownerAtClick});
    $('payment-status').textContent = receipt.charged === PRICE && !status.entitlement ? '5쭈를 사용했어요. 같은 생일은 24시간 동안 다시 볼 수 있어요.' : '이용 중인 같은 생일의 결과를 추가 차감 없이 열었어요.';
    announce(`${readableDate(dates.target)}의 리듬을 펼쳤어요.`);
  } catch (error) {
    if (stillCurrent()) {
      if (['access_expired','price_changed'].includes(error.code)) quote = null;
      discardResult(); showError(error.message);
      $('payment-status').textContent = error.message;
    }
  } finally { busy = false; pendingSelection = null; renderPurchase(); }
}

function selectDate(date, recenter = false, announceChange = true) {
  if (busy || !hasAccess()) return;
  clearError();
  try {
    display(current.birthDate, date, {recenter});
    if (announceChange) announce(`${readableDate(date)} · ${current.cycles.map((cycle) => `${cycle.label} ${valueText(cycle.value)}`).join(', ')}`);
  }
  catch (error) { announce(error.message); }
}

function discardResult() {
  clearTimeout(expiryTimer);
  access = null;
  resultRevision += 1;
  current = null;
  series = [];
  sample = false;
  $('results').hidden = true;
  $('copy-fallback').hidden = true;
  $('copy-text').value = '';
  for (const id of ['rhythm-cards','suggestion-cards','calculation-evidence','chart-holder','chart-table']) $(id).replaceChildren();
  delete $('chart-table').dataset.window;
}

function renderStaticContent() {
  const sourceById = Object.fromEntries(CONTENT.sources.map((source) => [source.id,source]));
  $('faq-list').innerHTML = CONTENT.faq.map((item) => `<details><summary>${html(item.question)}</summary><p>${html(item.answer)}${(item.sourceIds || []).map((id) => `<a class="faq-source" href="${sourceById[id].url}" target="_blank" rel="noopener noreferrer">참고 자료 ↗</a>`).join('')}</p></details>`).join('');
  $('source-links').innerHTML = CONTENT.sources.slice(0,2).map((source) => `<a class="source-link" href="${source.url}" target="_blank" rel="noopener noreferrer">${html(source.title)} ↗<small>${html(source.author)}${source.year ? ` · ${source.year}` : ''}<br>${html(source.publicationTitle)}</small></a>`).join('');
}

$('rhythm-form').addEventListener('submit', (event) => { event.preventDefault(); submit(); });
$('sample-button').addEventListener('click', () => {
  if (busy) return;
  inputRevision++; quoteRevision++; quote = null; birthDirty = false; discardResult(); clearError();
  $('birth-date').value = SAMPLE_BIRTH;
  $('target-date').value = todayInSeoul();
  sample = true;
  display(SAMPLE_BIRTH, todayInSeoul(), {focus:true});
  renderPurchase();
  announce('1990년 1월 1일 생일의 무료 샘플이에요.');
});
$('clear-button').addEventListener('click', () => {
  if (busy) return;
  inputRevision++; quoteRevision++; quote = null; birthDirty = false;
  $('rhythm-form').reset();
  $('target-date').value = todayInSeoul();
  discardResult();
  clearError();
  $('birth-date').focus();
  announce('입력한 생일과 결과를 지웠어요.');
  renderPurchase();
});
for (const id of ['birth-date','target-date']) $(id).addEventListener('input', () => {
  if (busy) {
    if (pendingSelection?.owner === billing.user) {
      $('birth-date').value = pendingSelection.birth;
      $('target-date').value = pendingSelection.target;
    }
    return;
  }
  inputRevision++; discardResult(); clearError();
  if (id === 'birth-date') { birthDirty = true; quoteRevision++; quote = null; void refreshQuote(); }
  renderPurchase();
});
for (const event of ['change','blur']) $('birth-date').addEventListener(event,saveCurrentBirth);
$('input-today').addEventListener('click', (event) => {
  event.preventDefault();
  if (busy) return;
  if (current) selectDate(todayInSeoul(),true);
  else { inputRevision++; $('target-date').value = todayInSeoul(); clearError(); renderPurchase(); }
});
$('result-today').addEventListener('click', () => selectDate(todayInSeoul(),true));
$('previous-day').addEventListener('click', () => { if (current && current.targetDate > current.birthDate) selectDate(addDays(current.targetDate,-1),true); });
$('next-day').addEventListener('click', () => { if (current && current.targetDate < '2100-12-31') selectDate(addDays(current.targetDate,1),true); });
$('chart-slider').addEventListener('input', () => {
  if (busy) { $('chart-slider').value = String(series.findIndex(row => row.date === current?.targetDate)); return; }
  const row = series[Number($('chart-slider').value)];
  if (row) selectDate(row.date,false,false);
});
$('chart-holder').addEventListener('click', (event) => {
  const svg = $('chart-holder').querySelector('svg');
  if (!svg || !series.length) return;
  const bounds = svg.getBoundingClientRect();
  if (!bounds.width) return;
  const {width,left,right} = chartGeometry;
  const pointX = (event.clientX - bounds.left) / bounds.width * width;
  const index = Math.max(0,Math.min(series.length-1,Math.round((pointX-left)/(width-left-right)*(series.length-1))));
  selectDate(series[index].date);
});
$('chart-table').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-date]');
  if (button) selectDate(button.dataset.date);
});
document.querySelector('.chart-legend').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-cycle]');
  if (!button || busy || !hasAccess()) return;
  const id = button.dataset.cycle;
  if (visibleCycles.has(id) && visibleCycles.size === 1) { announce('비교할 수 있도록 선 하나는 남겨 둘게요.'); return; }
  if (visibleCycles.has(id)) visibleCycles.delete(id); else visibleCycles.add(id);
  button.setAttribute('aria-pressed',String(visibleCycles.has(id)));
  renderChart();
});
$('edit-birth').addEventListener('click', () => {
  if (busy) return;
  $('birth-date').focus({preventScroll:true});
  $('rhythm-form').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
});
$('copy-result').addEventListener('click', async () => {
  if (busy || !hasAccess()) return;
  const revision = resultRevision;
  const text = `오쭈다 · 오늘의 바이오리듬${sample?' (샘플)':''}\n${readableDate(current.targetDate)}\n${current.cycles.map((cycle) => `${cycle.label} ${valueText(cycle.value)} · ${phaseFor(cycle).label}`).join('\n')}\n\n재미로 보는 곡선의 계산값이며 실제 건강·감정·능력을 예측하지 않아요.\nhttps://ojjuda.kr/features/biorhythm/`;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    if (current && revision === resultRevision) announce('생년월일을 뺀 결과를 복사했어요.');
  } catch {
    if (!current || revision !== resultRevision) return;
    $('copy-fallback').hidden = false;
    $('copy-text').value = text;
    $('copy-text').focus();
    $('copy-text').select();
  }
});

// Saved birthdays stay in this browser's member-specific list; raw dates/results never enter telemetry or URLs.
compactMedia.addEventListener?.('change', () => { if (hasAccess()) renderChart(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { hasAccess(); renderPurchase(); } });
window.addEventListener('pageshow', () => { hasAccess(); renderPurchase(); });
renderStaticContent();
$('birth-date').max = todayInSeoul();
$('target-date').value = todayInSeoul();
for (const id of ['sample-button','clear-button']) $(id).disabled = false;
$('payment-status').textContent = '로그인과 보유한 쭈를 확인하고 있어요…';
void initializeBilling();
