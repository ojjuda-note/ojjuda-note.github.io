import { CYCLES, isoToDay, todayInSeoul, addDays, calculate, makeSeries } from './engine.mjs?v=20261113-biorhythm1';
import { CONTENT } from './content.mjs?v=20261113-biorhythm1';

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

function submit({ asSample = false } = {}) {
  const dates = formDates();
  if (!dates) return;
  sample = asSample;
  display(dates.birth, dates.target, {focus: true});
  announce(`${readableDate(dates.target)}의 리듬을 계산했어요.`);
}

function selectDate(date, recenter = false, announceChange = true) {
  if (!current) return;
  clearError();
  try {
    display(current.birthDate, date, {recenter});
    if (announceChange) announce(`${readableDate(date)} · ${current.cycles.map((cycle) => `${cycle.label} ${valueText(cycle.value)}`).join(', ')}`);
  }
  catch (error) { announce(error.message); }
}

function discardResult() {
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
  $('birth-date').value = '1990-01-01';
  $('target-date').value = todayInSeoul();
  submit({asSample:true});
});
$('clear-button').addEventListener('click', () => {
  $('rhythm-form').reset();
  $('target-date').value = todayInSeoul();
  discardResult();
  clearError();
  $('birth-date').focus();
  announce('입력한 생일과 결과를 지웠어요.');
});
for (const id of ['birth-date','target-date']) $(id).addEventListener('input', () => { discardResult(); clearError(); });
$('input-today').addEventListener('click', (event) => {
  event.preventDefault();
  if (current) selectDate(todayInSeoul(),true);
  else { $('target-date').value = todayInSeoul(); clearError(); }
});
$('result-today').addEventListener('click', () => selectDate(todayInSeoul(),true));
$('previous-day').addEventListener('click', () => { if (current && current.targetDate > current.birthDate) selectDate(addDays(current.targetDate,-1),true); });
$('next-day').addEventListener('click', () => { if (current && current.targetDate < '2100-12-31') selectDate(addDays(current.targetDate,1),true); });
$('chart-slider').addEventListener('input', () => {
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
  if (!button || !current) return;
  const id = button.dataset.cycle;
  if (visibleCycles.has(id) && visibleCycles.size === 1) { announce('비교할 수 있도록 선 하나는 남겨 둘게요.'); return; }
  if (visibleCycles.has(id)) visibleCycles.delete(id); else visibleCycles.add(id);
  button.setAttribute('aria-pressed',String(visibleCycles.has(id)));
  renderChart();
});
$('edit-birth').addEventListener('click', () => {
  $('birth-date').focus({preventScroll:true});
  $('rhythm-form').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});
});
$('copy-result').addEventListener('click', async () => {
  if (!current) return;
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

// No account access, analytics, persistent storage, or URL serialization of birth data.
compactMedia.addEventListener?.('change', () => { if (current) renderChart(); });
renderStaticContent();
$('birth-date').max = todayInSeoul();
$('target-date').value = todayInSeoul();
for (const id of ['calculate-button','sample-button','clear-button']) $(id).disabled = false;
