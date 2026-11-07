import {
  CATEGORIES, SECTIONS, sectionOf, REGIONS, todayKST, parseDate, isoDate, addDays,
  monthRange, periodRange, overlaps, eventStatus, filterEvents,
  formatRange, createICS, hasEventDates, isDateUndecided, attendanceValue, attendanceBand
} from './core.js?v=20261106-festival-scale1';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'ojjuda.festival.saved.v1';
const DATA_URL = new URL('./events.json', import.meta.url);
const MAP_URL = new URL('./assets/korea-provinces.json', import.meta.url);
const NATIONAL_BOUNDS = [[33.0, 124.7], [38.65, 131.95]];
const VIEW_MODES = ['map', 'calendar', 'list'];
const PERIODS = ['upcoming', 'weekend', 'month', 'undecided', 'all', 'custom'];
const OWN_QUERY_KEYS = ['q', 'region', 'category', 'period', 'from', 'to', 'date', 'view', 'month', 'saved', 'sort', 'scale', 'event'];
const STATUS_LABELS = { ongoing: '진행 중', upcoming: '예정', undecided: '일정 미정', ended: '종료', cancelled: '취소', postponed: '연기' };
const paths = {
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 5h2m4 0h2"/>',
  reset: '<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>',
  sparkles: '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Zm7-1v4m-2-2h4M4 18v4m-2-2h4"/>',
  bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Zm6-2v16m6-14v16"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  'chevron-left': '<path d="m15 5-7 7 7 7"/>',
  'chevron-right': '<path d="m9 5 7 7-7 7"/>',
  'shield-check': '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z"/><path d="m8 12 3 3 5-6"/>',
  music: '<path d="M9 18V5l11-2v13M9 8l11-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="17" cy="16" rx="3" ry="2.5"/>',
  film: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 8h4m-4 8h4m10-8h4m-4 8h4M7 12h10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ticket: '<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Z"/><path d="M15 5v2m0 3v2m0 3v4"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
  'external-link': '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.5 6.6-4m-6.6 7 6.6 4"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v6c0 5-2 7-5 7s-5-2-5-7V4Zm0 2H4v3c0 2 1.5 3 3.5 3M17 6h3v3c0 2-1.5 3-3.5 3"/>'
};
function svg(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths[name] || paths.sparkles}</svg>`;
}
function icon(name) { return `<span class="icon">${svg(name)}</span>`; }
function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => { node.innerHTML = svg(node.dataset.icon); });
}
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function safeURL(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
  catch { return ''; }
}
function validDate(value) {
  try { parseDate(value); return true; } catch { return false; }
}
function validMonth(value) { return /^\d{4}-\d{2}$/.test(value || '') && validDate(`${value}-01`); }
function readSaved() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string').slice(0, 2000) : []);
  } catch { return new Set(); }
}
function readRoute() {
  const p = new URLSearchParams(location.search);
  const selectedDate = validDate(p.get('date')) ? p.get('date') : '';
  const sort = ['date', 'name', 'region', 'scale_desc', 'scale_asc'].includes(p.get('sort')) ? p.get('sort') : 'date';
  const scale = ['all', 'under10k', '10kto50k', '50kto200k', '200kto1m', 'over1m', 'unknown'].includes(p.get('scale')) ? p.get('scale') : 'all';
  return {
    query: (p.get('q') || '').slice(0, 300),
    category: scale !== 'all' || ['scale_desc','scale_asc'].includes(sort) ? 'festival' : (Object.hasOwn(SECTIONS, p.get('category')) || Object.hasOwn(CATEGORIES, p.get('category'))) ? p.get('category') : 'all',
    region: REGIONS.includes(p.get('region')) ? p.get('region') : 'all',
    period: PERIODS.includes(p.get('period')) ? p.get('period') : 'upcoming',
    from: validDate(p.get('from')) ? p.get('from') : '',
    to: validDate(p.get('to')) ? p.get('to') : '',
    selectedDate,
    view: p.get('period') === 'undecided' && p.get('view') !== 'map' ? 'list' : VIEW_MODES.includes(p.get('view')) ? p.get('view') : 'map',
    month: selectedDate ? selectedDate.slice(0, 7) : validMonth(p.get('month')) ? p.get('month') : today.slice(0, 7),
    savedOnly: p.get('saved') === '1',
    sort, scale, position: null
  };
}

let today = todayKST();
let state = readRoute();
let saved = readSaved();
let events = [];
let eventById = new Map();
let updatedAt = '';
let currentEventId = '';
let filteredEvents = [];
let map;
let markerLayer;
let provinceLayer;
let labelLayer;
let tileLayer;
let locationMarker;
let mapReady = false;
let loading = false;
let detailMap = false;
let toastTimer;
let previousFocus;
let restoringRoute = false;
let frameRequest = 0;

function writeRoute({ push = false } = {}) {
  if (restoringRoute) return;
  const url = new URL(location.href);
  OWN_QUERY_KEYS.forEach(key => url.searchParams.delete(key));
  const values = {
    q: state.query || '', category: state.category === 'all' ? '' : state.category,
    region: state.region === 'all' ? '' : state.region,
    period: state.period === 'upcoming' ? '' : state.period,
    from: state.period === 'custom' ? state.from : '', to: state.period === 'custom' ? state.to : '',
    date: state.selectedDate, view: state.view === 'map' && state.period !== 'undecided' ? '' : state.view,
    month: state.month === today.slice(0, 7) ? '' : state.month,
    saved: state.savedOnly ? '1' : '', sort: ['date', 'distance'].includes(state.sort) ? '' : state.sort,
    scale: state.scale === 'all' ? '' : state.scale,
    event: currentEventId
  };
  Object.entries(values).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  if (url.href !== location.href) {
    try {
      const method = push && window.top === window ? 'pushState' : 'replaceState';
      history[method]({ ...history.state, festivalEvent: currentEventId || null }, '', url);
    } catch { /* Navigation state is optional in restricted embedded browsers. */ }
  }
}
function updateState(changes, { fit = false } = {}) {
  state = { ...state, ...changes };
  if (state.category !== 'festival') {
    state.scale = 'all';
    if (state.sort === 'scale_desc' || state.sort === 'scale_asc') state.sort = 'date';
  }
  if (state.selectedDate && state.view === 'calendar') state.month = state.selectedDate.slice(0, 7);
  syncControls();
  render();
  writeRoute();
  if (fit) requestMapFit();
}
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').classList.add('show');
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 3700);
}
function dateLabel(iso) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' }).format(parseDate(iso));
}
function displayStatus(event) {
  const key = eventStatus(event, today);
  if (key === 'upcoming') {
    const days = Math.round((parseDate(event.start) - parseDate(today)) / 86400000);
    return { key, label: days <= 30 ? `D-${days}` : STATUS_LABELS[key] };
  }
  return { key, label: STATUS_LABELS[key] || key };
}
function syncControls() {
  if ($('search').value !== state.query) $('search').value = state.query;
  $('region').value = state.region;
  $('period').value = state.period;
  $('sort').value = state.sort;
  $('scale').value = state.scale;
  $('scale-filter').hidden = state.category !== 'festival';
  $('date-from').value = state.from;
  $('date-to').value = state.to;
  $('custom-dates').hidden = state.period !== 'custom';
  const reversed = state.period === 'custom' && state.from && state.to && state.from > state.to;
  $('date-error').textContent = reversed ? '종료일을 시작일 이후로 선택해 주세요.' : '';
  $('date-from').setAttribute('aria-invalid', String(Boolean(reversed)));
  $('date-to').setAttribute('aria-invalid', String(Boolean(reversed)));
  document.querySelectorAll('[data-category]').forEach(button => {
    const active = button.dataset.category === state.category;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-view]').forEach(button => {
    if (button.tagName !== 'BUTTON') return;
    const active = button.dataset.view === state.view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('saved-toggle').setAttribute('aria-pressed', String(state.savedOnly));
  $('nearby-search').setAttribute('aria-pressed', String(state.sort === 'distance' && !!state.position));
  $('nearby-search-label').textContent = state.sort === 'distance' && state.position ? '내 주변 거리순 해제' : '내 주변 행사 찾기';
  $('workspace').dataset.view = state.view;
  $('map-panel').hidden = state.view !== 'map';
  $('calendar-panel').hidden = state.view !== 'calendar';
  $('selection-bar').hidden = !state.selectedDate;
  $('selected-date-label').textContent = state.selectedDate ? `${dateLabel(state.selectedDate)} 열리는 행사` : '';
  if (map && state.view === 'map') requestAnimationFrame(() => map.invalidateSize({ pan: false }));
}
function getBaseEvents() {
  return filterEvents(events, { ...state, selectedDate: '', saved }, today);
}
function distanceKm(event, position = state.position) {
  if (!position || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return Infinity;
  const radians = degrees => degrees * Math.PI / 180;
  const latitude = radians(event.lat - position.lat);
  const longitude = radians(event.lng - position.lng);
  const arc = Math.sin(latitude / 2) ** 2 + Math.cos(radians(position.lat)) * Math.cos(radians(event.lat)) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(arc)));
}
function formatDistance(km) { return km < 10 ? `${km.toFixed(1)}km` : `${Math.round(km).toLocaleString('ko-KR')}km`; }
function getVisibleEvents() {
  let result = filterEvents(events, { ...state, saved }, today);
  if (state.view === 'calendar') {
    const month = monthRange(state.month);
    result = result.filter(event => overlaps(event, month.start, month.end));
  }
  if (state.sort === 'distance' && state.position) result.sort((a, b) => distanceKm(a) - distanceKm(b));
  return result;
}
function render() {
  if (loading) return;
  filteredEvents = getVisibleEvents();
  const heading = state.period === 'undecided' ? '일정 미정' : state.savedOnly ? '저장한 행사' : state.region !== 'all' ? `${state.region} 행사` : '전국 행사';
  $('results-heading').firstChild.textContent = `${heading} `;
  $('result-count').textContent = filteredEvents.length;
  const savedCount = events.filter(event => saved.has(event.id)).length;
  $('saved-count').textContent = savedCount;
  $('saved-count').hidden = savedCount === 0;
  const month = Number(state.month.slice(5, 7));
  $('list-label').textContent = state.sort === 'distance' && state.position ? '내 위치에서 가까운 순 · 직선거리' : state.period === 'undecided' ? '개최 예정 · 날짜 발표 전' : state.selectedDate ? `${dateLabel(state.selectedDate)}의 일정` : state.view === 'calendar' ? `${month}월의 일정` : state.sort === 'region' ? '지역별로 모아보기' : state.sort === 'name' ? '이름순으로 모아보기' : state.sort === 'scale_desc' ? '방문객 규모 큰 순 · 미확인 마지막' : state.sort === 'scale_asc' ? '방문객 규모 작은 순 · 미확인 마지막' : '가까운 일정부터';
  const undecidedCount = filterEvents(events, { ...state, period: 'undecided', selectedDate: '', from: '', to: '', saved }, today).length;
  $('planning-bar').hidden = undecidedCount === 0 && state.period !== 'undecided';
  $('planning-note').textContent = state.period === 'undecided' ? '날짜가 발표되면 캘린더에 표시해요.' : '날짜 발표를 기다리는 행사도 있어요.';
  $('undecided-toggle').textContent = state.period === 'undecided' ? '전체 일정 보기' : `일정 미정 ${undecidedCount}개 보기`;
  $('undecided-toggle').setAttribute('aria-pressed', String(state.period === 'undecided'));
  const unlocatedCount = filteredEvents.filter(event => !Number.isFinite(event.lat) || !Number.isFinite(event.lng)).length;
  $('location-note').hidden = state.view !== 'map' || unlocatedCount === 0;
  $('location-note').textContent = `지도 위치 확인 전 ${unlocatedCount}개는 목록에서 확인할 수 있어요.`;
  $('checked-at').textContent = (updatedAt || '').slice(0, 10).replaceAll('-', '.') || '확인 중';
  renderList();
  renderCalendar();
  renderMapMarkers();
  updateProvinceStyles();
}
function compactDateRange(event) {
  if (isDateUndecided(event)) return event.dateNote;
  const start = parseDate(event.start), end = parseDate(event.end);
  const year = start.getUTCFullYear(), endYear = end.getUTCFullYear();
  const datePart = date => `${date.getUTCMonth() + 1}.${date.getUTCDate()}`;
  const showYear = year !== Number(today.slice(0, 4)) || year !== endYear;
  const first = `${showYear ? year + '.' : ''}${datePart(start)}`;
  if (event.start === event.end) return first;
  return `${first} – ${year !== endYear ? endYear + '.' : ''}${datePart(end)}`;
}
function categoryLabel(event) {
  if (event.category === 'sport') return event.sportType ? `${event.sportType} · 스포츠` : '스포츠';
  if (sectionOf(event) === 'performance' && event.category === 'local') return '공연·연주회';
  return CATEGORIES[event.category]?.label || '행사';
}
function attendanceText(event) {
  const count = attendanceValue(event);
  if (count === null) return '방문객 규모 미확인';
  const a = event.attendance;
  const quantity = count >= 10000 ? `${(count / 10000).toLocaleString('ko-KR', {maximumFractionDigits: 1})}만 명` : `${count.toLocaleString('ko-KR')}명`;
  if (a.kind === 'forecast') return `${a.year}년 공식 예상 · 약 ${quantity}`;
  if (a.kind === 'previous') return `${a.year}년 방문객 · 약 ${quantity} (참고)`;
  return `${a.year}년 실제 방문객 · 약 ${quantity}`;
}
function cardMarkup(event) {
  const category = CATEGORIES[event.category];
  const status = displayStatus(event);
  const isSaved = saved.has(event.id);
  const distance = state.sort === 'distance' ? distanceKm(event) : Infinity;
  return `<article class="event-card ${status.key === 'ended' ? 'is-ended' : ''} ${isDateUndecided(event) ? 'is-undecided' : ''}" data-event-card="${escapeHTML(event.id)}" style="--category-color:${category.ink}">
    <button class="card-main" data-open-event="${escapeHTML(event.id)}" aria-label="${escapeHTML(event.title)} 상세 정보">
      <span class="card-topline"><span class="card-category">${escapeHTML(categoryLabel(event))}</span><span class="card-status ${status.key}">${status.label}</span></span>
      <strong class="card-title">${escapeHTML(event.title)}</strong>
      <span class="card-meta"><span class="card-date" title="${escapeHTML(formatRange(event))}">${escapeHTML(compactDateRange(event))}</span><span class="card-location">${escapeHTML([...new Set([event.region, event.city].filter(Boolean))].join(' '))}</span>${Number.isFinite(distance) ? `<span class="card-distance">내 위치에서 ${formatDistance(distance)}</span>` : ''}</span>
      ${sectionOf(event) === 'festival' ? `<span class="card-attendance ${attendanceValue(event) === null ? 'is-unknown' : ''}">${escapeHTML(attendanceText(event))}</span>` : ''}
    </button>
    <button class="card-save ${isSaved ? 'saved' : ''}" data-save-event="${escapeHTML(event.id)}" aria-pressed="${isSaved}" aria-label="${escapeHTML(event.title)} ${isSaved ? '관심 행사에서 해제' : '관심 행사로 저장'}">${icon('bookmark')}</button>
  </article>`;
}
function renderList() {
  if (filteredEvents.length) {
    $('event-list').innerHTML = filteredEvents.map(cardMarkup).join('');
    return;
  }
  const archive = state.period !== 'undecided' && state.category === 'festival' && events.some(event => event.category === 'campus' && hasEventDates(event) && event.end < today);
  const reversed = state.period === 'custom' && state.from && state.to && state.from > state.to;
  const title = reversed ? '선택한 날짜를 확인해 주세요' : state.savedOnly ? '저장한 행사가 보이지 않아요' : '조건에 맞는 행사가 없어요';
  const description = state.scale !== 'all' ? '해당 규모의 공식 방문객 자료가 아직 없어요. 규모 미확인 또는 다른 구간도 확인해 보세요.' : reversed ? '종료일이 시작일보다 앞서 있어요.' : state.savedOnly ? '행사의 책갈피를 눌러 저장하거나, 선택한 검색 조건을 바꿔보세요.' : state.period === 'undecided' ? '이 조건에서 공식 개최 예고가 확인된 일정 미정 행사는 아직 없어요.' : archive ? '대학축제는 주로 학기 중에 열려요. 확인된 지난 축제도 볼 수 있어요.' : '지역·날짜·종류를 바꾸면 다른 즐거움을 찾을 수 있어요.';
  $('event-list').innerHTML = `<div class="empty-state"><span class="empty-symbol">${icon('calendar')}</span><h3>${title}</h3><p>${description}</p><button data-action="${archive ? 'campus-archive' : 'reset-filters'}">${archive ? '지난 대학축제 보기' : '전체 행사 다시 보기'}</button></div>`;
}
function renderCalendar() {
  const range = monthRange(state.month);
  const first = parseDate(range.start);
  const firstCell = addDays(range.start, -first.getUTCDay());
  const numDays = parseDate(range.end).getUTCDate();
  const rows = Math.ceil((first.getUTCDay() + numDays) / 7);
  const total = rows * 7;
  const base = getBaseEvents();
  const period = periodRange(state.period, today, state.from, state.to);
  $('calendar-month').textContent = `${first.getUTCFullYear()}년 ${first.getUTCMonth() + 1}월`;
  $('calendar-grid').style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
  const days = [];
  for (let offset = 0; offset < total; offset++) {
    const date = addDays(firstCell, offset);
    const insidePeriod = !period || (date >= period.start && date <= period.end);
    const dayEvents = insidePeriod ? base.filter(event => overlaps(event, date, date)) : [];
    const classes = ['calendar-day', date.slice(0, 7) !== state.month ? 'outside' : '', date === today ? 'today' : '', date === state.selectedDate ? 'selected' : ''].filter(Boolean).join(' ');
    const previews = dayEvents.slice(0, 2).map(event => {
      const cat = CATEGORIES[event.category];
      const status = eventStatus(event, today);
      const title = ['cancelled', 'postponed'].includes(status) ? `${STATUS_LABELS[status]} · ${event.title}` : event.title;
      return `<span class="calendar-event" style="--event-bg:${cat.bg};--event-color:${cat.ink}" title="${escapeHTML(title)}">${escapeHTML(title)}</span>`;
    }).join('');
    const dots = [...new Set(dayEvents.map(event => event.category))].map(category => `<i style="background:${CATEGORIES[category].color}"></i>`).join('');
    days.push(`<button class="${classes}" data-calendar-date="${date}" aria-label="${escapeHTML(dateLabel(date))}, 행사 ${dayEvents.length}개" aria-pressed="${date === state.selectedDate}"${date === today ? ' aria-current="date"' : ''}><span class="day-number">${parseDate(date).getUTCDate()}</span>${previews}${dayEvents.length > 2 ? `<span class="calendar-more">+${dayEvents.length - 2}개 더</span>` : ''}<span class="day-dots">${dots}${dayEvents.length ? `<span>${dayEvents.length}</span>` : ''}</span></button>`);
  }
  $('calendar-grid').innerHTML = days.join('');
}
function toggleSaved(id) {
  if (!eventById.has(id)) return;
  if (saved.has(id)) saved.delete(id); else saved.add(id);
  let persistent = true;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify([...saved])); } catch { persistent = false; }
  render();
  if (currentEventId) renderDetail(eventById.get(currentEventId));
  toast(persistent ? (saved.has(id) ? '관심 행사에 저장했어요.' : '관심 행사에서 해제했어요.') : '현재 화면에만 저장했어요. 이 브라우저에서는 영구 저장을 사용할 수 없어요.');
}
function renderDetail(event) {
  if (!event) return;
  const cat = CATEGORIES[event.category];
  const status = displayStatus(event);
  const isSaved = saved.has(event.id);
  const officialURL = safeURL(event.officialUrl) || safeURL(event.sourceUrl);
  const sourceURL = safeURL(event.sourceUrl);
  const mapQuery = [event.region, event.city, event.venue].filter(Boolean).join(' ');
  const mapURL = `https://map.naver.com/p/search/${encodeURIComponent(event.address || mapQuery)}`;
  const undecided = isDateUndecided(event);
  const hasLocation = Number.isFinite(event.lat) && Number.isFinite(event.lng);
  const unavailable = undecided || ['cancelled', 'postponed'].includes(status.key);
  const access = Array.isArray(event.accessNote) ? event.accessNote.join(' · ') : event.accessNote || (event.category === 'campus' ? '외부인 출입·공연 관람 조건은 학교 공식 안내를 확인해 주세요.' : '세부 입장 조건은 공식 안내를 확인해 주세요.');
  const statusNote = status.key === 'cancelled' ? `취소된 행사입니다.${hasEventDates(event) ? ' 아래 날짜는 기존에 공지된 일정입니다.' : ''}` : status.key === 'postponed' ? `연기된 행사입니다. 새 일정은 공식 공지를 확인해 주세요.${hasEventDates(event) ? ' 아래 날짜는 기존 일정입니다.' : ''}` : undecided ? '공식 개최 계획이 발표됐어요. 정확한 날짜는 아직 발표 전이며 예정 시기는 바뀔 수 있어요.' : event.statusNote || '';
  $('event-detail').innerHTML = `<div class="detail-cover" style="--tile-bg:${cat.bg};--tile-ink:${cat.ink}">
    <button class="dialog-close" data-action="close-event" aria-label="행사 상세 닫기">${icon('close')}</button>
    <span class="detail-kind">${icon(cat.icon)}${escapeHTML(categoryLabel(event))}<span>· ${status.label}</span></span>
    <h2 id="detail-title">${escapeHTML(event.title)}</h2>
    <div class="detail-subtitle">${escapeHTML([event.region, event.city].filter(Boolean).join(' · '))}</div>
  </div><div class="detail-body">
    <p class="detail-summary">${escapeHTML(event.summary || '자세한 프로그램은 공식 안내에서 확인해 주세요.')}</p>
    ${statusNote ? `<p class="detail-notice" role="status">${escapeHTML(statusNote)}</p>` : ''}
    <dl class="detail-facts">
      <dt>${icon('calendar')}일정</dt><dd>${escapeHTML(formatRange(event))}</dd>
      <dt>${icon('clock')}시간</dt><dd>${escapeHTML(event.scheduleNote || '공식 안내 확인')}</dd>
      <dt>${icon('pin')}장소</dt><dd>${escapeHTML(event.venue || '장소 미정')}${event.address ? `<small>${escapeHTML(event.address)}</small>` : ''}${hasLocation ? `<a class="venue-link" href="${escapeHTML(mapURL)}" target="_blank" rel="noopener noreferrer">네이버 지도에서 보기 ${icon('external-link')}</a>` : '<small>지도 위치가 확인되면 표시해요.</small>'}</dd>
      <dt>${icon('ticket')}요금</dt><dd>${escapeHTML(event.priceNote || '공식 안내 확인')}</dd>
      ${sectionOf(event) === 'festival' ? `<dt>${icon('people')}방문객 규모</dt><dd>${escapeHTML(attendanceText(event))}${attendanceValue(event) !== null ? `<small>행사 전체 방문객 수 기준 · 이전 회차는 올해 예상치가 아니에요.</small><a class="venue-link" href="${escapeHTML(safeURL(event.attendance.sourceUrl))}" target="_blank" rel="noopener noreferrer">규모 근거: ${escapeHTML(event.attendance.sourceName)} ${icon('external-link')}</a>` : '<small>방문객 수가 공식 발표되면 갱신해요.</small>'}</dd>` : ''}
      <dt>${icon('people')}입장 안내</dt><dd>${escapeHTML(access)}</dd>
    </dl>
    <div class="detail-notice">${event.geoApprox ? '지도는 대표 행사장 부근을 표시해요. ' : ''}방문 전 공식 페이지에서 최신 시간·장소·입장 조건을 확인해 주세요.</div>
    <div class="detail-actions">
      ${officialURL ? `<a class="primary-button" href="${escapeHTML(officialURL)}" target="_blank" rel="noopener noreferrer">공식 안내 보기 ${icon('external-link')}</a>` : ''}
      <button class="secondary-button" data-download-event="${escapeHTML(event.id)}"${unavailable ? ` disabled title="${undecided ? '날짜가 발표되면 캘린더에 추가할 수 있어요.' : '취소·연기된 행사는 새 일정 확인 후 추가해 주세요.'}"` : ''}>${icon('calendar')}${undecided ? '날짜 발표 후 추가' : '캘린더에 추가'}</button>
      <button class="secondary-button detail-save ${isSaved ? 'saved' : ''}" data-save-event="${escapeHTML(event.id)}" aria-pressed="${isSaved}" aria-label="${isSaved ? '관심 행사에서 해제' : '관심 행사로 저장'}">${icon('bookmark')}</button>
      <button class="secondary-button share-button" data-share-event="${escapeHTML(event.id)}" aria-label="이 행사 공유">${icon('share')}</button>
    </div>
    <p class="source-line">출처: ${sourceURL ? `<a href="${escapeHTML(sourceURL)}" target="_blank" rel="noopener noreferrer">${escapeHTML(event.sourceName || '행사 공식 안내')}</a>` : escapeHTML(event.sourceName || '공식 안내')}<br>정보 확인일 ${escapeHTML(event.sourceCheckedAt || updatedAt.slice(0, 10))} · 내려받은 캘린더 일정은 자동 갱신되지 않아요.</p>
  </div>`;
  $('event-dialog').setAttribute('aria-labelledby', 'detail-title');
}
function openEvent(id, { fromRoute = false } = {}) {
  const event = eventById.get(id);
  if (!event) { if (id) toast('이 행사 정보는 현재 목록에 없어요.'); return; }
  const wasOpen = $('event-dialog').open;
  if (!wasOpen) previousFocus = document.activeElement;
  currentEventId = id;
  renderDetail(event);
  if (!wasOpen) {
    $('event-dialog').showModal();
    document.documentElement.style.overflow = 'hidden';
    $('event-dialog').querySelector('.dialog-close')?.focus();
  }
  if (!fromRoute) writeRoute({ push: !wasOpen });
}
function closeEvent({ fromRoute = false } = {}) {
  if (!$('event-dialog').open && !currentEventId) return;
  currentEventId = '';
  if ($('event-dialog').open) $('event-dialog').close();
  if (!$('about-dialog').open) document.documentElement.style.overflow = '';
  if (!fromRoute) writeRoute();
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
}
function showAbout() {
  $('about-dialog').showModal();
  document.documentElement.style.overflow = 'hidden';
}
function closeAbout() {
  $('about-dialog').close();
  if (!$('event-dialog').open) document.documentElement.style.overflow = '';
}
function downloadEvent(id) {
  const event = eventById.get(id);
  if (!event || !hasEventDates(event) || ['cancelled', 'postponed'].includes(eventStatus(event, today))) return;
  const url = URL.createObjectURL(new Blob([createICS(event)], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `festival-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}.ics`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  toast('내려받은 일정 파일을 캘린더 앱에서 열어주세요.');
}
async function shareEvent(id) {
  const event = eventById.get(id);
  if (!event) return;
  const url = new URL(location.href);
  url.searchParams.set('event', id);
  const payload = { title: event.title, text: `${event.title} · ${formatRange(event)}`, url: url.href };
  if (navigator.share) {
    try { await navigator.share(payload); return; }
    catch (error) { if (error?.name === 'AbortError') return; }
  }
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(url.href);
    toast('행사 주소를 복사했어요.');
  } catch {
    const field = document.createElement('textarea');
    field.value = url.href;
    field.style.cssText = 'position:fixed;left:0;top:0;opacity:0;';
    const container = $('event-dialog').open ? $('event-detail') : document.body;
    container.append(field);
    field.focus();
    field.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* Manual-copy fallback below. */ }
    field.remove();
    if (copied) toast('행사 주소를 복사했어요.');
    else window.prompt('아래 행사 주소를 복사해 주세요.', url.href);
  }
}
function resetFilters() {
  updateState({ query: '', category: 'all', region: 'all', period: 'upcoming', from: '', to: '', selectedDate: '', savedOnly: false, sort: 'date', scale: 'all', month: today.slice(0, 7) }, { fit: true });
}
function showCampusArchive() {
  const campus = events.filter(event => event.category === 'campus' && hasEventDates(event)).sort((a, b) => b.end.localeCompare(a.end));
  const mostRecent = campus.find(event => event.end < today) || campus[0];
  updateState({ category: 'campus', period: 'all', query: '', region: 'all', savedOnly: false, selectedDate: '', from: '', to: '', view: 'calendar', month: (mostRecent?.end || today).slice(0, 7) });
}
function shiftMonth(direction) {
  const date = parseDate(`${state.month}-01`);
  date.setUTCMonth(date.getUTCMonth() + direction);
  const month = isoDate(date).slice(0, 7);
  const range = monthRange(month);
  updateState({ month, selectedDate: '', period: 'custom', from: range.start, to: range.end });
}
function selectPeriod(period) {
  const changes = { period, selectedDate: '' };
  if (period === 'undecided') changes.view = 'list';
  if (period === 'weekend') changes.month = periodRange(period, today).start.slice(0, 7);
  else if (period === 'month' || (period === 'upcoming' && state.month < today.slice(0, 7))) changes.month = today.slice(0, 7);
  else if (period === 'custom' && state.from) changes.month = state.from.slice(0, 7);
  updateState(changes, { fit: true });
}
function bindInteractions() {
  $('region').innerHTML = '<option value="all">전국</option>' + REGIONS.map(region => `<option value="${region}">${region}</option>`).join('');
  $('search').addEventListener('input', () => updateState({ query: $('search').value, selectedDate: '' }, { fit: true }));
  $('region').addEventListener('change', () => updateState({ region: $('region').value, selectedDate: '' }, { fit: true }));
  $('period').addEventListener('change', () => selectPeriod($('period').value));
  $('sort').addEventListener('change', () => {
    const sort = $('sort').value;
    if (sort === 'distance') {
      if (state.position) updateState({ sort }, { fit: true });
      else { syncControls(); locateUser({ sortByDistance: true }); }
      return;
    }
    updateState({ sort, ...(sort.startsWith('scale_') ? { category: 'festival' } : {}) }, { fit: sort.startsWith('scale_') });
  });
  $('scale').addEventListener('change', () => updateState({ category: 'festival', scale: $('scale').value, selectedDate: '' }, { fit: true }));
  if (window.top !== window) {
    document.querySelector('.brand').addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      resetFilters();
    });
  }
  $('reset').addEventListener('click', resetFilters);
  $('saved-toggle').addEventListener('click', () => {
    if (state.savedOnly) { resetFilters(); return; }
    updateState({ view: 'list', savedOnly: true, query: '', category: 'all', region: 'all', period: 'all', selectedDate: '', from: '', to: '' });
  });
  ['date-from', 'date-to'].forEach(id => $(id).addEventListener('change', () => {
    const from = $('date-from').value, to = $('date-to').value;
    updateState({ from, to, selectedDate: '', month: (from || to || today).slice(0, 7) }, { fit: true });
  }));
  $('month-prev').addEventListener('click', () => shiftMonth(-1));
  $('month-next').addEventListener('click', () => shiftMonth(1));
  $('calendar-today').addEventListener('click', () => updateState({ month: today.slice(0, 7), selectedDate: '', period: 'month', from: '', to: '' }));
  $('map-fit').addEventListener('click', () => { if (map) fitNational(); });
  $('map-expand').addEventListener('click', toggleMapExpansion);
  $('nearby-search').addEventListener('click', () => {
    if (state.sort === 'distance' && state.position) updateState({ sort: 'date' });
    else if (state.position) updateState({ sort: 'distance' }, { fit: true });
    else locateUser({ sortByDistance: true });
  });
  $('map-style').addEventListener('click', toggleMapStyle);
  $('map-locate').addEventListener('click', () => locateUser());
  $('map-locate-direct').addEventListener('click', () => locateUser());
  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.openEvent) { openEvent(button.dataset.openEvent); return; }
    if (button.dataset.saveEvent) { toggleSaved(button.dataset.saveEvent); return; }
    if (button.dataset.downloadEvent) { downloadEvent(button.dataset.downloadEvent); return; }
    if (button.dataset.shareEvent) { void shareEvent(button.dataset.shareEvent); return; }
    if (button.dataset.category) { updateState({ category: button.dataset.category, selectedDate: '', ...(button.dataset.category === 'festival' ? {} : { scale: 'all' }) }, { fit: true }); return; }
    if (button.dataset.view) {
      const changes = { view: button.dataset.view };
      if (changes.view === 'calendar' && state.period === 'undecided') Object.assign(changes, { period: 'upcoming', selectedDate: '' });
      updateState(changes, { fit: changes.view === 'map' }); return;
    }
    if (button.dataset.calendarDate) { updateState({ selectedDate: button.dataset.calendarDate, month: button.dataset.calendarDate.slice(0, 7) }); return; }
    switch (button.dataset.action) {
      case 'about': showAbout(); break;
      case 'close-about': closeAbout(); break;
      case 'close-event': closeEvent(); break;
      case 'clear-date': updateState({ selectedDate: '' }); break;
      case 'campus-archive': showCampusArchive(); break;
      case 'reset-filters': resetFilters(); break;
      case 'undecided-events': selectPeriod(state.period === 'undecided' ? 'upcoming' : 'undecided'); break;
      case 'retry-load': void loadEvents(); break;
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('map-panel').classList.contains('is-expanded')) {
      event.preventDefault(); toggleMapExpansion(); return;
    }
    if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && !$('event-dialog').open && !$('about-dialog').open) {
      event.preventDefault(); $('search').focus();
    }
  });
  $('event-dialog').addEventListener('cancel', event => { event.preventDefault(); closeEvent(); });
  $('event-dialog').addEventListener('click', event => { if (event.target === $('event-dialog')) closeEvent(); });
  $('about-dialog').addEventListener('cancel', event => { event.preventDefault(); closeAbout(); });
  $('about-dialog').addEventListener('click', event => { if (event.target === $('about-dialog')) closeAbout(); });
  window.addEventListener('storage', event => {
    if (event.key === SAVE_KEY) { saved = readSaved(); render(); if (currentEventId) renderDetail(eventById.get(currentEventId)); }
  });
  window.addEventListener('popstate', () => {
    restoringRoute = true;
    state = readRoute();
    syncControls(); render();
    const id = new URLSearchParams(location.search).get('event');
    if (id && eventById.has(id)) openEvent(id, { fromRoute: true }); else closeEvent({ fromRoute: true });
    restoringRoute = false;
    requestMapFit();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && today !== todayKST()) { today = todayKST(); render(); }
  });
}

const REGION_BY_CODE = { '11': '서울', '21': '부산', '22': '대구', '23': '인천', '24': '광주', '25': '대전', '26': '울산', '29': '세종', '31': '경기', '32': '강원', '33': '충북', '34': '충남', '35': '전북', '36': '전남', '37': '경북', '38': '경남', '39': '제주' };
const REGION_CENTERS = {
  서울: [37.58, 126.93], 부산: [35.12, 129.04], 대구: [35.85, 128.57], 인천: [37.43, 126.55],
  광주: [35.16, 126.83], 대전: [36.34, 127.33], 울산: [35.56, 129.26], 세종: [36.56, 127.23],
  경기: [37.37, 127.35], 강원: [37.75, 128.33], 충북: [36.94, 127.77], 충남: [36.53, 126.73],
  전북: [35.73, 127.11], 전남: [34.77, 126.91], 경북: [36.39, 128.88], 경남: [35.36, 128.16], 제주: [33.40, 126.55]
};
const LARGE_REGIONS = new Set(['경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주']);
function featureRegion(feature) {
  return feature.properties?.region || REGION_BY_CODE[String(feature.properties?.code)] || REGIONS.find(region => String(feature.properties?.name || '').startsWith(region)) || '';
}
function provinceStyle(feature, highlighted = false) {
  const region = featureRegion(feature);
  const chosen = state.region === region;
  return {
    color: chosen ? '#5d805b' : '#a8bca2', weight: chosen || highlighted ? 1.7 : .85,
    opacity: detailMap ? .3 : .85,
    fillColor: chosen ? '#c7dfb7' : highlighted ? '#dbe8cf' : ['#e7eddc', '#e1e9d4', '#e9eedd', '#dde8d1'][Math.max(0, REGIONS.indexOf(region)) % 4],
    fillOpacity: detailMap ? .08 : .97
  };
}
function selectRegion(region) { if (REGIONS.includes(region)) updateState({ region, selectedDate: '' }, { fit: true }); }
async function setupMap() {
  if (!window.L) {
    $('map-message').hidden = false;
    $('map-message').textContent = '지도를 불러오지 못했어요. 목록과 캘린더에서 일정을 확인할 수 있어요.';
    return;
  }
  const L = window.L;
  map = L.map('festival-map', {
    zoomControl: false, attributionControl: true, scrollWheelZoom: true,
    minZoom: 5, maxZoom: 18, zoomSnap: .25, zoomDelta: .75,
    maxBounds: [[30.5, 121], [41, 135.5]], maxBoundsViscosity: .5
  });
  L.control.zoom({ position: 'topright', zoomInTitle: '지도 확대', zoomOutTitle: '지도 축소' }).addTo(map);
  map.attributionControl.setPrefix(false);
  map.attributionControl.addAttribution('<a href="https://github.com/southkorea/southkorea-maps" target="_blank" rel="noopener noreferrer">통계청 · southkorea-maps</a>');
  map.createPane('provinceLabels');
  map.getPane('provinceLabels').style.zIndex = '420';
  map.getPane('provinceLabels').style.pointerEvents = 'none';
  markerLayer = L.layerGroup().addTo(map);
  labelLayer = L.layerGroup().addTo(map);
  fitNational();
  map.on('zoomend', () => { renderMapMarkers(); renderRegionLabels(); });
  new ResizeObserver(() => {
    if (state.view === 'map') requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  }).observe($('map-panel'));
  try {
    const response = await fetch(MAP_URL);
    if (!response.ok) throw new Error(`Map HTTP ${response.status}`);
    const geo = await response.json();
    if (geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) throw new Error('Invalid map data');
    provinceLayer = L.geoJSON(geo, {
      style: feature => provinceStyle(feature),
      onEachFeature: (feature, layer) => {
        const region = featureRegion(feature);
        layer.bindTooltip(escapeHTML(region || feature.properties?.name || ''), { sticky: true, direction: 'top' });
        layer.on('mouseover', () => layer.setStyle(provinceStyle(feature, true)));
        layer.on('mouseout', () => layer.setStyle(provinceStyle(feature)));
        layer.on('click', () => selectRegion(region));
      }
    }).addTo(map);
    provinceLayer.eachLayer(layer => {
      const element = layer.getElement?.();
      if (element) {
        const region = featureRegion(layer.feature);
        element.setAttribute('tabindex', '0');
        element.setAttribute('role', 'button');
        element.setAttribute('aria-label', `${region} 행사 보기`);
        element.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRegion(region); }
        });
      }
    });
    mapReady = true;
    renderRegionLabels();
    renderMapMarkers();
    updateProvinceStyles();
    if (state.region !== 'all') requestMapFit();
  } catch (error) {
    mapReady = true;
    console.warn('축제일정 지도 불러오기 실패:', error.message);
    $('map-message').textContent = '지역 지도를 불러오지 못했어요. 행사 마커·목록·캘린더는 사용할 수 있어요.';
    $('map-message').hidden = false;
    renderMapMarkers();
  }
}
function fitNational() {
  if (!map) return;
  map.fitBounds(NATIONAL_BOUNDS, { padding: [18, 24], animate: false });
}
function toggleMapExpansion() {
  const expanded = $('map-panel').classList.toggle('is-expanded');
  document.body.classList.toggle('map-is-expanded', expanded);
  $('map-expand').setAttribute('aria-pressed', String(expanded));
  $('map-expand').setAttribute('aria-label', expanded ? '지도 작게 보기' : '지도 크게 보기');
  $('map-expand-label').textContent = expanded ? '지도 작게 보기' : '지도 크게 보기';
  $('map-expand').querySelector('.icon').innerHTML = svg(expanded ? 'close' : 'expand');
  if (map) requestAnimationFrame(() => map.invalidateSize({ pan: false }));
}
function requestMapFit() {
  cancelAnimationFrame(frameRequest);
  frameRequest = requestAnimationFrame(() => {
    if (!map || state.view !== 'map') return;
    map.invalidateSize({ pan: false });
    if (state.sort === 'distance' && state.position) {
      map.setView([state.position.lat, state.position.lng], 10, { animate: false });
      return;
    }
    if (state.region !== 'all' && provinceLayer) {
      let bounds;
      provinceLayer.eachLayer(layer => { if (featureRegion(layer.feature) === state.region) bounds = layer.getBounds(); });
      if (bounds?.isValid()) { map.fitBounds(bounds, { padding: [45, 60], maxZoom: 10, animate: false }); return; }
    }
    const points = filteredEvents.filter(event => Number.isFinite(event.lat) && Number.isFinite(event.lng)).map(event => [event.lat, event.lng]);
    if ((state.query || state.category !== 'all' || state.savedOnly || state.selectedDate) && points.length) {
      map.fitBounds(window.L.latLngBounds(points), { padding: [50, 70], maxZoom: 10, animate: false });
    } else fitNational();
  });
}
function updateProvinceStyles() {
  if (!provinceLayer) return;
  const counts = new Map();
  filterEvents(events, { ...state, region: 'all', saved }, today).forEach(event => counts.set(event.region, (counts.get(event.region) || 0) + 1));
  provinceLayer.eachLayer(layer => {
    layer.setStyle(provinceStyle(layer.feature));
    const region = featureRegion(layer.feature);
    layer.setTooltipContent(`${escapeHTML(region)} · ${counts.get(region) || 0}개 행사`);
  });
}
function renderRegionLabels() {
  if (!map || !labelLayer) return;
  labelLayer.clearLayers();
  if (detailMap && map.getZoom() >= 9) return;
  const zoom = map.getZoom();
  Object.entries(REGION_CENTERS).forEach(([region, coordinate]) => {
    if (!LARGE_REGIONS.has(region) && zoom < 7.25) return;
    window.L.marker(coordinate, {
      pane: 'provinceLabels', interactive: false, keyboard: false,
      icon: window.L.divIcon({ className: 'province-label', html: escapeHTML(region), iconSize: [48, 18], iconAnchor: [24, 9] })
    }).addTo(labelLayer);
  });
}
function renderMapMarkers() {
  if (!map || !markerLayer) return;
  markerLayer.clearLayers();
  const candidates = filteredEvents.filter(event => Number.isFinite(event.lat) && Number.isFinite(event.lng));
  const groups = [];
  const radius = map.getZoom() >= 12 ? 27 : 39;
  candidates.forEach(event => {
    const point = map.latLngToLayerPoint([event.lat, event.lng]);
    let group = groups.find(item => item.point.distanceTo(point) < radius);
    if (!group) { group = { point, events: [], lat: 0, lng: 0 }; groups.push(group); }
    group.events.push(event);
    group.lat += event.lat;
    group.lng += event.lng;
  });
  groups.forEach(group => {
    const categories = [...new Set(group.events.map(event => event.category))];
    const cat = categories.length === 1 ? CATEGORIES[categories[0]] : { color: '#355c46', icon: 'sparkles' };
    const count = group.events.length;
    const title = count === 1 ? group.events[0].title : `${count}개 행사 보기`;
    const html = `<span class="pin-bubble" style="--marker:${cat.color}">${count > 1 ? count : icon(cat.icon)}</span>`;
    const marker = window.L.marker([group.lat / count, group.lng / count], {
      title, alt: title, riseOnHover: true,
      icon: window.L.divIcon({ className: 'festival-marker', html, iconSize: [36, 36], iconAnchor: [18, 36], popupAnchor: [0, -32] })
    });
    const popup = `<p class="popup-heading">${count > 1 ? `이 주변의 행사 ${count}개` : escapeHTML(categoryLabel(group.events[0]))}</p>${group.events.map(event => `<button class="popup-event" data-open-event="${escapeHTML(event.id)}"><strong>${escapeHTML(event.title)}</strong><span>${escapeHTML(formatRange(event))} · ${STATUS_LABELS[eventStatus(event, today)]}</span></button>`).join('')}`;
    marker.bindPopup(popup, { maxWidth: 285, minWidth: 210, autoPanPadding: [25, 35], keepInView: true });
    marker.on('popupopen', event => {
      event.popup.getElement()?.querySelectorAll('[data-open-event]').forEach(button => {
        button.onclick = click => {
          click.stopPropagation();
          openEvent(button.dataset.openEvent);
        };
      });
    });
    marker.addTo(markerLayer);
  });
}
function toggleMapStyle() {
  if (!map) { toast('지도를 먼저 불러와 주세요.'); return; }
  detailMap = !detailMap;
  if (detailMap) {
    let errors = 0;
    tileLayer = window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>'
    });
    tileLayer.on('tileerror', () => {
      errors += 1;
      if (errors >= 3 && detailMap) {
        detailMap = false;
        map.removeLayer(tileLayer);
        tileLayer = undefined;
        updateMapStyleButton();
        updateProvinceStyles();
        renderRegionLabels();
        $('map-message').textContent = '상세 지도 연결이 원활하지 않아 기본 지도로 표시했어요.';
        $('map-message').hidden = false;
      }
    });
    tileLayer.addTo(map);
    $('map-message').hidden = true;
  } else if (tileLayer) {
    map.removeLayer(tileLayer);
    tileLayer = undefined;
  }
  updateMapStyleButton();
  updateProvinceStyles();
  renderRegionLabels();
}
function updateMapStyleButton() {
  $('map-style').innerHTML = `${icon('layers')}<span>${detailMap ? '기본 지도' : '상세 지도'}</span>`;
  $('map-style').setAttribute('aria-pressed', String(detailMap));
}
function locateUser({ sortByDistance = false } = {}) {
  if (!navigator.geolocation) { toast('이 브라우저에서는 현재 위치를 사용할 수 없어요.'); return; }
  $('map-locate').disabled = true;
  $('map-locate-direct').disabled = true;
  $('nearby-search').disabled = true;
  toast('현재 위치를 확인하고 있어요.');
  navigator.geolocation.getCurrentPosition(position => {
    $('map-locate').disabled = false;
    $('map-locate-direct').disabled = false;
    $('nearby-search').disabled = false;
    const { latitude: lat, longitude: lng } = position.coords;
    if (lat < 30.5 || lat > 41 || lng < 121 || lng > 135.5) { toast('현재 위치가 대한민국 지도 표시 범위를 벗어나 있어요.'); return; }
    state.position = { lat, lng };
    if (sortByDistance) state.sort = 'distance';
    syncControls(); render(); writeRoute();
    if (map) {
      if (locationMarker) map.removeLayer(locationMarker);
      locationMarker = window.L.circleMarker([lat, lng], { radius: 7, color: '#fff', weight: 3, fillColor: '#4f7ec4', fillOpacity: 1 }).addTo(map).bindTooltip('내 위치');
      if (state.view === 'map') { map.closePopup(); map.setView([lat, lng], 10, { animate: false }); }
    }
    toast(sortByDistance ? '가까운 축제·경기부터 보여드려요. 거리는 직선거리예요.' : '지도에 내 위치를 표시했어요.');
  }, error => {
    $('map-locate').disabled = false;
    $('map-locate-direct').disabled = false;
    $('nearby-search').disabled = false;
    toast(error.code === 1 ? '위치 사용이 허용되지 않았어요. 지역을 직접 선택해 주세요.' : '현재 위치를 확인하지 못했어요. 지역을 직접 선택해 주세요.');
  }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
}
async function loadEvents() {
  if (loading) return;
  loading = true;
  $('event-list').innerHTML = '<div class="loading-state"><div class="loading-ring"></div><p>행사를 불러오고 있어요.</p></div>';
  try {
    const response = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.events)) throw new Error('Invalid event data');
    const seen = new Set();
    events = payload.events.filter(event => {
      if (!event || typeof event.id !== 'string' || !event.title || !Object.hasOwn(CATEGORIES, event.category) || (!hasEventDates(event) && !isDateUndecided(event)) || seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    }).map(event => ({ ...event, end: event.end || event.start }));
    eventById = new Map(events.map(event => [event.id, event]));
    updatedAt = typeof payload.updatedAt === 'string' ? payload.updatedAt : '';
    loading = false;
    syncControls();
    render();
    const requestedEvent = new URLSearchParams(location.search).get('event');
    if (requestedEvent) {
      if (eventById.has(requestedEvent)) openEvent(requestedEvent, { fromRoute: true });
      else { toast('이 행사 정보는 현재 목록에 없어요.'); writeRoute(); }
    }
  } catch (error) {
    loading = false;
    console.warn('축제일정 데이터 불러오기 실패:', error.message);
    $('event-list').innerHTML = '<div class="empty-state"><span class="empty-symbol">' + icon('info') + '</span><h3>일정을 불러오지 못했어요</h3><p>인터넷 연결을 확인하고 다시 시도해 주세요.</p><button data-action="retry-load">다시 불러오기</button></div>';
    $('result-count').textContent = '—';
  }
}

fillIcons();
bindInteractions();
syncControls();
await Promise.allSettled([loadEvents(), setupMap()]);
