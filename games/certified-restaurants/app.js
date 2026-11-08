/* Source-backed guide selections and locations, with separate member ratings. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const CATEGORIES = ['한식', '중식', '일식', '양식', '분식', '디저트', '기타'];
  const PROVIDERS = { michelin: '미쉐린', 'blue-ribbon': '블루리본', 'post-office': '우체국', 'local-guide': '지자체 지정' };
  // Verified original publication registration dates. Never infer these from verification or page edits.
  const SOURCE_REGISTRATIONS = Object.freeze({ 'https://www.daejeon.go.kr/its/ItsdjNormalboardView.do?boardGubun=itsdj01&boardSeq=2211': '2022-10-24' });
  const STORAGE_KEY = 'ojjuda-certified-restaurants-saved-v1';
  const LOCATION_CHOICE_KEY = 'ojjuda-certified-restaurants-location-v1';
  const VIEW_KEY = 'ojjuda-certified-restaurants-view-v1';
  const LIST_PAGE_SIZE = 50, MAP_PAGE_SIZE = 50;
  const MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const entryParams = new URLSearchParams(location.search);
  const embedded = entryParams.get('embedded') === '1';
  const ratingUI = window.OjjudaRestaurantRatings;
  const memberRatings = !!ratingUI && embedded && entryParams.get('member-ratings') === '1' && window.parent !== window;
  const memberRecommendations = embedded && entryParams.get('member-recommendations') === '1' && window.parent !== window;
  const recommendationRequests = new Map();
  let recommendationSequence = 0, recommendationLoad = 0;
  const ratingCache = new Map(), ratingRequests = new Map(), ratingVersions = new Map(), ratingLoads = new Map();
  let ratingSequence = 0, ratingEditor = null, ratingEpoch = 0, sortRequest = 0;
  const mobile = window.matchMedia('(max-width: 760px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { restaurants: [], certified: [], recommended: [], collections: [], visible: [], renderedCount: 0, mapPage: 0, category: '', guide: '', region: '', query: '', savedOnly: false, saved: new Set(), selected: '', position: null, view: 'map', sort: 'name', sortChosen: false, sortBusy: false, sortError: false, loading: true, loadError: false };
  let map = null, backgroundLayer = null, backgroundTimer = null, markers = new Map(), userMarker = null, searchTimer = null, storageWarned = false, loadController = null, locationRequest = 0;
  const bookmarkSvg = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 3h10v14l-5-3-5 3V3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function requestRating(action, payload) {
    if (!memberRatings) return Promise.reject(new Error('로그인 후 별점을 남길 수 있어요.'));
    const requestId = 'rating-' + Date.now().toString(36) + '-' + (++ratingSequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ratingRequests.delete(requestId); reject(new Error('연결이 지연되고 있어요. 다시 시도해 주세요.')); }, 20000);
      ratingRequests.set(requestId, { resolve, reject, timer });
      try { window.parent.postMessage({ type: 'ojjuda:restaurants:ratings', requestId, action, ...payload }, location.origin); }
      catch (error) { clearTimeout(timer); ratingRequests.delete(requestId); reject(error); }
    });
  }
  window.addEventListener('message', event => {
    if (!memberRatings || event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'ojjuda:restaurants:rating-result') return;
    const pending = ratingRequests.get(event.data.requestId);
    if (!pending) return;
    ratingRequests.delete(event.data.requestId); clearTimeout(pending.timer);
    if (event.data.error) pending.reject(new Error(String(event.data.error).slice(0, 160)));
    else pending.resolve(event.data.data);
  });
  function requestRecommendationPage(offset) {
    const requestId = 'recommendations-' + (++recommendationSequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { recommendationRequests.delete(requestId); reject(new Error('추천맛집 연결 지연')); }, 20000);
      recommendationRequests.set(requestId, { resolve, reject, timer });
      try { window.parent.postMessage({ type: 'ojjuda:restaurants:recommendation-data', action: 'page', requestId, offset, limit: 50 }, location.origin); }
      catch (error) { clearTimeout(timer); recommendationRequests.delete(requestId); reject(error); }
    });
  }
  function cancelRecommendationRequests() {
    recommendationRequests.forEach(pending => { clearTimeout(pending.timer); pending.reject(new Error('새 요청으로 변경')); });
    recommendationRequests.clear();
  }
  window.addEventListener('message', event => {
    if (!memberRecommendations || event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'ojjuda:restaurants:recommendations-changed') { void loadRecommendations(); return; }
    if (event.data?.type !== 'ojjuda:restaurants:recommendation-data-result') return;
    const pending = recommendationRequests.get(event.data.requestId);
    if (!pending) return;
    recommendationRequests.delete(event.data.requestId); clearTimeout(pending.timer);
    if (event.data.error) pending.reject(new Error(String(event.data.error).slice(0, 160)));
    else pending.resolve(event.data.data);
  });
  function updateRating(summary) {
    if (!summary || !state.restaurants.some(item => item.id === summary.id) || !Number.isInteger(summary.count) || summary.count < 0 || (summary.count > 0 && (!Number.isFinite(summary.average) || summary.average < 1 || summary.average > 5)) || (summary.count === 0 && summary.average !== null)) return;
    ratingCache.set(summary.id, summary);
    document.querySelectorAll('[data-rating-id]').forEach(node => { if (node.dataset.ratingId === summary.id) ratingUI.renderSummary(node, summary); });
  }
  async function loadRatingSummaries(items, current = () => true) {
    if (!memberRatings) return false;
    const epoch = ratingEpoch, ids = [...new Set(items.map(item => item.id))];
    const byId = new Map(items.map(item => [item.id, item]));
    // Share card requests and fetch every eligible restaurant, including those beyond page 1.
    for (let start = 0; start < ids.length; start += 100) {
      if (epoch !== ratingEpoch || !current()) return false;
      const batch = ids.slice(start, start + 100), pending = new Set();
      batch.forEach(id => { if (ratingLoads.has(id)) pending.add(ratingLoads.get(id)); });
      for (const kind of ['certified', 'recommended']) {
        const missing = batch.filter(id => !ratingCache.has(id) && !ratingLoads.has(id) && (byId.get(id).ratingKind || 'certified') === kind);
        if (!missing.length) continue;
        const versions = new Map(missing.map(id => [id, ratingVersions.get(id) || 0]));
        const targets = new Map(missing.map(id => [byId.get(id).ratingId || id, id]));
        const request = requestRating('summary', { kind, ids: [...targets.keys()] }).then(rows => {
          if (epoch !== ratingEpoch || !Array.isArray(rows)) return;
          rows.forEach(row => {
            const id = row && targets.get(row.id);
            if (id && versions.get(id) === (ratingVersions.get(id) || 0)) updateRating({ ...row, id });
          });
        }).finally(() => { missing.forEach(id => { if (ratingLoads.get(id) === request) ratingLoads.delete(id); }); });
        missing.forEach(id => ratingLoads.set(id, request)); pending.add(request);
      }
      await Promise.allSettled([...pending]);
    }
    return epoch === ratingEpoch && ids.every(id => ratingCache.has(id));
  }
  async function loadCardRatings(items) {
    if (!memberRatings) return;
    const epoch = ratingEpoch;
    await loadRatingSummaries(items);
    if (epoch !== ratingEpoch) return;
    const missing = new Set(items.filter(item => !ratingCache.has(item.id)).map(item => item.id));
    document.querySelectorAll('[data-rating-id]').forEach(node => { if (missing.has(node.dataset.ratingId)) ratingUI.renderSummary(node, null); });
  }
  function disposeRatingEditor() { ratingEditor?.dispose(); ratingEditor = null; }
  function safeHttps(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  }
  function text(value, limit = 300) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }
  // Common spelling variants should not hide the same place from map search.
  function searchKey(value) { return String(value || '').normalize('NFKC').toLocaleLowerCase('ko').replaceAll('부페', '뷔페'); }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
  }
  function sourceDate(value) { return /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value || '') ? value : ''; }
  function dateLabel(value) { return validDate(value) ? value.replaceAll('-', '.') : '미표기'; }
  function hasCoordinates(item) { return typeof item.lat === 'number' && typeof item.lng === 'number' && Number.isFinite(item.lat) && Number.isFinite(item.lng) && Math.abs(item.lat) <= 90 && Math.abs(item.lng) <= 180; }
  function normalize(item) {
    if (!item || !text(item.id) || !text(item.name) || !Array.isArray(item.guides)) return null;
    const guides = item.guides.filter(g => g && Object.hasOwn(PROVIDERS, g.provider) && safeHttps(g.sourceUrl)).map(g => ({ provider: g.provider, label: text(g.label, 80) || (g.provider === 'post-office' ? '추천' : '선정 이력'), year: Number.isInteger(g.year) && g.year >= 1900 && g.year <= 2200 ? g.year : null, yearType: ['edition', 'selection', 'publication', 'source', 'listing'].includes(g.yearType) ? g.yearType : '', sourceUrl: safeHttps(g.sourceUrl), sourceName: text(g.sourceName, 120) || PROVIDERS[g.provider] + (g.provider === 'post-office' ? ' 추천 자료' : ' 선정 출처'), verifiedAt: validDate(g.verifiedAt), sourceAsOf: sourceDate(g.sourceAsOf || item.sourceAsOf), sourceRegisteredAt: safeHttps(g.sourceRegistrationUrl) ? validDate(g.sourceRegisteredAt) : SOURCE_REGISTRATIONS[g.sourceUrl] || '', sourceRegistrationUrl: safeHttps(g.sourceRegistrationUrl) || (SOURCE_REGISTRATIONS[g.sourceUrl] ? safeHttps(g.sourceUrl) : ''), sourceDateType: g.sourceDateType === 'official-page-last-modified' ? 'page-modified' : 'as-of', selectionCriteria: text(g.selectionCriteria, 300) }));
    if (!guides.length) return null;
    const result = { id: text(item.id, 120), name: text(item.name, 160), category: CATEGORIES.includes(item.category) ? item.category : '기타', region: text(item.region, 40) || '지역 미표기', district: text(item.district, 80), address: text(item.address, 300), lat: item.lat, lng: item.lng, menu: Array.isArray(item.menu) ? item.menu.map(v => text(v, 80)).filter(Boolean).slice(0, 8) : [], guides };
    result.sourceRegisteredAt = guides.map(guide => guide.sourceRegisteredAt).filter(Boolean).sort().at(-1) || '';
    result.registrationTime = result.sourceRegisteredAt ? Date.parse(result.sourceRegisteredAt) : 0;
    result.ratingKind = 'certified'; result.ratingId = result.id;
    const coordinateSource = item.coordinateSource;
    if (coordinateSource && text(coordinateSource.name) && safeHttps(coordinateSource.url)) result.coordinateSource = { name: text(coordinateSource.name, 160), url: safeHttps(coordinateSource.url), method: text(coordinateSource.method, 120), checkedAt: validDate(coordinateSource.checkedAt) };
    result.searchText = searchKey([result.name, result.category, result.region, result.district, result.address, ...result.menu].join(' '));
    return result;
  }
  function normalizeRecommendation(item) {
    if (!item || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id || '') || !text(item.name)) return null;
    const date = validDate(typeof item.created_at === 'string' ? item.created_at.slice(0, 10) : '');
    const timestamp = date && Number.isFinite(Date.parse(item.created_at)) ? Date.parse(item.created_at) : 0;
    const result = { id: 'recommended-' + item.id, recommendationId: item.id, ratingKind: 'recommended', ratingId: item.id, name: text(item.name, 160), category: CATEGORIES.includes(item.category) ? item.category : '기타', region: text(item.region, 40) || '지역 미표기', district: '', address: text(item.address), lat: item.latitude, lng: item.longitude, menu: (Array.isArray(item.menu) ? item.menu : [item.menu]).map(value => text(value, 80)).filter(Boolean).slice(0, 8), guides: [], sourceRegisteredAt: timestamp ? date : '', registrationTime: timestamp };
    result.searchText = searchKey([result.name, result.category, result.region, result.address, ...result.menu].join(' '));
    return result;
  }
  function combineRestaurantSources() {
    state.restaurants = [...state.certified, ...state.recommended];
    $('region').replaceChildren(new Option('전국', ''));
    [...new Set(state.restaurants.map(item => item.region))].sort((a, b) => a.localeCompare(b, 'ko')).forEach(region => $('region').append(new Option(region, region)));
    if (![...$('region').options].some(option => option.value === state.region)) state.region = '';
    $('region').value = state.region;
  }
  async function loadRecommendations() {
    if (!memberRecommendations) return;
    const request = ++recommendationLoad;
    cancelRecommendationRequests();
    try {
      const items = [], seen = new Set();
      let offset = 0;
      while (true) {
        const page = await requestRecommendationPage(offset);
        if (request !== recommendationLoad) return;
        if (!page || !Array.isArray(page.rows) || page.offset !== offset || typeof page.hasMore !== 'boolean' || page.rows.length > 50) throw new Error('추천맛집 응답 확인 필요');
        page.rows.forEach(row => { const item = normalizeRecommendation(row); if (item && !seen.has(item.id)) { seen.add(item.id); items.push(item); } });
        if (!page.hasMore) break;
        if (!page.rows.length || offset + page.rows.length > 10000) throw new Error('추천맛집 전체 목록 확인 필요');
        offset += page.rows.length;
      }
      new Set([...state.recommended, ...items].map(item => item.id)).forEach(id => { ratingVersions.set(id, (ratingVersions.get(id) || 0) + 1); ratingCache.delete(id); ratingLoads.delete(id); });
      state.recommended = items; combineRestaurantSources();
      $('recommendations-error').hidden = true; render(false);
    } catch {
      if (request !== recommendationLoad) return;
      state.recommended = []; combineRestaurantSources(); render(false);
      $('recommendations-error').hidden = false;
    }
  }
  function distanceKm(item) {
    if (!state.position || !hasCoordinates(item)) return null;
    const rad = value => value * Math.PI / 180;
    const latDelta = rad(item.lat - state.position.lat), lngDelta = rad(item.lng - state.position.lng);
    const a = Math.sin(latDelta / 2) ** 2 + Math.cos(rad(state.position.lat)) * Math.cos(rad(item.lat)) * Math.sin(lngDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }
  function distanceLabel(km) { return km < 1 ? Math.round(km * 1000) + 'm' : (km < 10 ? km.toFixed(1) : Math.round(km)) + 'km'; }
  function announce(message, error = false) { $('status').textContent = message; $('status').classList.toggle('is-error', error); $('status').hidden = !message; }
  function readSaved() {
    try { const values = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); if (Array.isArray(values)) state.saved = new Set(values.filter(v => typeof v === 'string').slice(0, 2000)); } catch { state.saved = new Set(); }
  }
  function writeSaved() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.saved])); }
    catch { if (!storageWarned) { storageWarned = true; announce('저장 공간을 사용할 수 없어, 저장한 곳은 이 화면을 보는 동안만 유지돼요.'); } }
  }
  function readView() {
    try { const value = localStorage.getItem(VIEW_KEY); if (value === 'list' || value === 'map') return value; } catch {}
    return 'map';
  }
  function badge(guide, includeYear = true) {
    const year = includeYear && guide.year ? ' · ' + guide.year : '';
    return el('span', 'guide-badge ' + (guide.provider === 'michelin' ? 'is-michelin' : guide.provider === 'post-office' ? 'is-post-office' : guide.provider === 'local-guide' ? 'is-local-guide' : 'is-ribbon'), PROVIDERS[guide.provider] + ' ' + guide.label + year);
  }
  function saveButton(item, detail = false) {
    const button = el('button', 'save-button' + (detail ? ' detail-save' : ''));
    button.type = 'button'; button.innerHTML = bookmarkSvg; button.dataset.saveId = item.id;
    button.addEventListener('click', event => { event.stopPropagation(); toggleSaved(item.id); });
    updateSaveButton(button, item);
    return button;
  }
  function updateSaveButton(button, item) {
    const saved = state.saved.has(item.id);
    button.classList.toggle('is-saved', saved);
    button.setAttribute('aria-pressed', String(saved));
    button.setAttribute('aria-label', item.name + (saved ? ' 저장 취소' : ' 저장'));
    button.title = saved ? '저장 취소' : '저장';
  }
  function toggleSaved(id) {
    if (state.saved.has(id)) state.saved.delete(id); else state.saved.add(id);
    writeSaved();
    const item = state.restaurants.find(r => r.id === id);
    document.querySelectorAll('[data-save-id]').forEach(button => { if (button.dataset.saveId === id && item) updateSaveButton(button, item); });
    if (state.savedOnly) render(false);
  }
  function link(label, href, className = '') {
    const node = el('a', className, label); node.href = safeHttps(href); node.target = '_blank'; node.rel = 'noopener noreferrer'; return node;
  }
  function filteredRestaurants() {
    const words = searchKey(state.query).trim().split(/\s+/).filter(Boolean);
    const items = state.restaurants.filter(item => {
      if (state.category && item.category !== state.category) return false;
      if (state.region && item.region !== state.region) return false;
      if (state.savedOnly && !state.saved.has(item.id)) return false;
      const providers = new Set(item.guides.map(g => g.provider));
      if (state.guide === 'both' && !(providers.has('michelin') && providers.has('blue-ribbon'))) return false;
      if (state.guide === 'recommended' && !item.recommendationId) return false;
      if (state.guide && !['both', 'recommended'].includes(state.guide) && !providers.has(state.guide)) return false;
      return words.every(word => item.searchText.includes(word));
    });
    const popularityReady = state.sort === 'popular' && memberRatings && items.every(item => ratingCache.has(item.id));
    return items.sort((a, b) => {
      if (state.sort === 'distance' && state.position) { const distance = (distanceKm(a) ?? Infinity) - (distanceKm(b) ?? Infinity); if (Number.isFinite(distance) && distance !== 0) return distance; if (distanceKm(a) === null && distanceKm(b) !== null) return 1; if (distanceKm(b) === null && distanceKm(a) !== null) return -1; }
      if (state.sort === 'recent') { const recent = b.registrationTime - a.registrationTime; if (recent) return recent; }
      if (popularityReady) {
        const left = ratingCache.get(a.id), right = ratingCache.get(b.id);
        const average = (right.average ?? 0) - (left.average ?? 0);
        if (average) return average;
        if (left.count !== right.count) return right.count - left.count;
      }
      return a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id);
    });
  }
  function syncSortControls() {
    $('sort-order').value = state.sort;
    $('sort-popular').disabled = !memberRatings;
    $('sort-popular').textContent = memberRatings ? '인기순' : '인기순 · 회원 전용';
    const labels = { distance: state.position ? '내 위치에서 가까운 순' : '위치 확인 전 · 이름순', name: '가게 이름순', popular: state.sortBusy ? '인기순 준비 중' : state.sortError ? '인기순 연결 확인 중' : '평균 별점이 높은 순', recent: '자료 등록일이 최신인 순' };
    $('list-label').textContent = labels[state.sort];
    let description = '';
    if (state.sort === 'distance' && !state.position) description = '위치 확인 전에는 이름순으로 표시해요.';
    if (state.sort === 'popular') description = state.sortBusy ? '별점 확인 중 · 현재 이름순' : state.sortError ? '별점을 불러오지 못했어요 · 현재 이름순' : '';
    if (state.sort === 'recent' && state.visible.some(item => !item.sourceRegisteredAt)) description = '등록일 미확인은 뒤에 표시해요.';
    $('sort-description').textContent = description;
    $('sort-description').hidden = !description;
    $('sort-description').classList.toggle('is-error', state.sortError);
    $('retry-sort').hidden = !state.sortError;
    $('cards').setAttribute('aria-busy', String(state.sortBusy));
  }
  async function finishPopularitySort(request, items, fit) {
    const complete = await loadRatingSummaries(items, () => request === sortRequest && state.sort === 'popular');
    if (request !== sortRequest || state.sort !== 'popular') return;
    state.sortBusy = false; state.sortError = !complete;
    if (complete) render(fit);
    else syncSortControls();
  }
  function updateResultCount() {
    if (state.loading || state.loadError) return;
    const total = state.visible.length, located = state.visible.filter(hasCoordinates).length;
    const mapped = state.visible.filter(item => markers.has(item.id)).length;
    const shown = el('span', 'result-shown sr-only', '현재 ' + state.renderedCount + '곳 표시');
    shown.hidden = state.view !== 'list';
    $('result-count').dataset.total = String(total);
    $('result-count').replaceChildren(document.createTextNode('등록 '), el('strong', '', String(total)), document.createTextNode('곳'), shown);
    const coverage = state.view === 'map'
      ? '지도 표시 ' + mapped + (located > mapped ? ' / ' + located : '') + '곳'
      : '지도 가능 ' + located + '곳';
    $('result-coverage').textContent = coverage + (total > located ? ' · 위치 확인 중 ' + (total - located) + '곳' : '');
    $('result-coverage').title = state.view === 'map' ? '위치 확인 ' + located + '곳 중 지도 ' + mapped + '곳 표시' : '위치가 확인되어 지도에 표시할 수 있는 식당 ' + located + '곳';
    $('result-coverage').hidden = false;
  }
  function renderCards(append = false) {
    const container = $('cards');
    if (!append) { container.replaceChildren(); state.renderedCount = 0; }
    $('load-more').hidden = true;
    if (!state.visible.length) {
      const empty = el('div', 'empty-state'); empty.append(el('div', 'empty-symbol', '⌕'), el('h2', '', state.savedOnly ? '저장한 맛집이 없어요' : '조건에 맞는 맛집이 없어요'), el('p', '', state.savedOnly ? '가게의 책갈피를 눌러 모아보세요.' : '다른 음식 종류나 지역으로 찾아보세요.'));
      const reset = el('button', '', '필터 초기화'); reset.type = 'button'; reset.addEventListener('click', resetFilters); empty.append(reset); container.append(empty); updateResultCount(); return;
    }
    const fragment = document.createDocumentFragment();
    const start = state.renderedCount, end = Math.min(start + LIST_PAGE_SIZE, state.visible.length);
    const firstUnknown = state.sort === 'distance' && state.position ? state.visible.findIndex(item => !hasCoordinates(item)) : -1;
    const firstUndated = state.sort === 'recent' ? state.visible.findIndex(item => !item.sourceRegisteredAt) : -1;
    state.visible.slice(start, end).forEach((item, offset) => {
      if (start + offset === firstUnknown) fragment.append(el('h2', 'list-section-title', '거리 정보 없는 식당 · 전국 목록'));
      if (start + offset === firstUndated) fragment.append(el('h2', 'list-section-title', '자료 등록일 미확인'));
      const card = el('article', 'restaurant-card'); card.dataset.restaurantId = item.id; card.dataset.cuisine = item.category; card.dataset.kind = item.ratingKind; card.classList.toggle('is-selected', state.selected === item.id);
      const main = el('button', 'card-main'); main.type = 'button'; main.setAttribute('aria-label', item.name + ' 상세 정보');
      const kicker = el('p', 'card-kicker'); kicker.append(el('span', 'card-category', item.category), el('span', '', [item.region, item.district].filter(Boolean).join(' · ')));
      const distance = distanceKm(item); if (distance !== null) kicker.append(el('span', 'distance', '직선 ' + distanceLabel(distance)));
      else if (state.position) kicker.append(el('span', 'distance-unknown', '거리 미확인'));
      main.append(kicker, el('h2', 'card-name', item.name));
      if (item.menu.length) main.append(el('p', 'card-menu', item.menu.slice(0, 2).join(' · ')));
      if (state.sort === 'recent' && item.sourceRegisteredAt) main.append(el('p', 'card-registered', (item.recommendationId ? '추천 등록 ' : '자료 등록 ') + dateLabel(item.sourceRegisteredAt)));
      const badges = el('div', 'guide-badges'); item.guides.forEach(g => badges.append(badge(g, false)));
      if (item.recommendationId) badges.append(el('span', 'guide-badge is-recommendation', '회원 추천'));
      main.append(badges);
      if (memberRatings) { const summary = el('span', 'card-rating'); summary.dataset.ratingId = item.id; ratingUI.renderSummary(summary, ratingCache.get(item.id)); main.append(summary); }
      main.addEventListener('click', () => selectRestaurant(item.id, true)); card.append(main, saveButton(item)); fragment.append(card);
    });
    container.append(fragment);
    state.renderedCount = end;
    $('load-more').hidden = end >= state.visible.length;
    $('load-more').textContent = '더 보기 · ' + end + ' / ' + state.visible.length + '곳';
    updateResultCount();
    void loadCardRatings(state.visible.slice(start, end));
  }
  function syncPressed() {
    $('category').value = state.category;
    $('guides').querySelectorAll('[data-guide]').forEach(button => { const active = button.dataset.guide === state.guide; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    $('saved-only').setAttribute('aria-pressed', String(state.savedOnly));
    const active = [state.region, state.guide === 'both' ? '미쉐린·블루리본 모두' : state.guide === 'recommended' ? '회원 추천' : state.guide === 'post-office' ? '우체국 추천' : PROVIDERS[state.guide], state.savedOnly ? '저장한 곳' : ''].filter(Boolean);
    $('filter-summary').textContent = active.join(' · '); $('filter-summary').hidden = !active.length;
    $('filter-label').textContent = '가이드' + (state.guide ? ' 1' : '');
    syncSortControls();
  }
  function renderCollections() {
    const section = $('collections'), sources = $('collection-sources');
    section.replaceChildren(); sources.replaceChildren();
    const relevant = state.collections.filter(collection => !state.guide || collection.provider === state.guide);
    section.hidden = !relevant.length;
    section.classList.toggle('is-featured', !!state.guide);
    relevant.forEach(collection => section.append(link(collection.title + ' ↗', collection.url, 'collection-title')));
    state.collections.forEach(collection => { if (collection.sourceUrl) sources.append(link((collection.sourceName || PROVIDERS[collection.provider] + ' 자료 출처') + ' ↗', collection.sourceUrl, 'collection-source')); });
  }
  function render(fit = true) {
    if (state.loading || state.loadError) return;
    if (fit) state.mapPage = 0;
    state.visible = filteredRestaurants();
    const request = ++sortRequest;
    state.sortBusy = state.sort === 'popular' && memberRatings && state.visible.some(item => !ratingCache.has(item.id));
    state.sortError = false;
    if (state.selected && !state.visible.some(item => item.id === state.selected)) state.selected = '';
    const locatedCount = state.visible.filter(hasCoordinates).length;
    if (state.position) setLocationStatus(locatedCount ? state.sort === 'distance' ? '가까운 순 · 거리 미확인 식당은 뒤에 표시' : '내 위치와의 직선거리를 함께 표시해요.' : '이 조건의 식당은 거리 정보가 없어 맛집 목록으로 표시해요.', false, true);
    if (mobile.matches && !state.visible.some(hasCoordinates)) setView('list');
    syncPressed(); renderCollections(); renderCards(); syncMap(fit);
    if (state.sortBusy) void finishPopularitySort(request, [...state.visible], fit);
  }
  function pinIcon(number, selected, recommended = false) {
    return window.L.divIcon({ className: 'restaurant-pin' + (recommended ? ' is-recommendation' : '') + (selected ? ' is-selected' : ''), html: '<div class="pin-core"><span>' + String(number) + '</span></div>', iconSize: [30, 37], iconAnchor: [15, 34], tooltipAnchor: [0, -30] });
  }
  function mapIsVisible() { return state.view === 'map'; }
  function showMapMessage(message, retry = true) { $('map-message-text').textContent = message; $('map-message').hidden = false; $('retry-map').hidden = !retry; }
  function startMapBackgroundTimer() {
    clearTimeout(backgroundTimer);
    backgroundTimer = setTimeout(() => {
      if (mapIsVisible() && backgroundLayer && map.hasLayer(backgroundLayer)) showMapMessage('지도 연결이 지연되고 있어요.');
    }, 18000);
  }
  function loadMapBackground(retry = false) {
    if (backgroundLayer) {
      if (!map.hasLayer(backgroundLayer)) { startMapBackgroundTimer(); backgroundLayer.addTo(map); }
      else if (retry) { startMapBackgroundTimer(); backgroundLayer.redraw(); }
      return;
    }
    const activeTiles = new Set(), failedTiles = new Set();
    const forgetTile = ({ tile }) => {
      activeTiles.delete(tile);
      if (failedTiles.delete(tile) && !failedTiles.size) $('map-message').hidden = true;
    };
    const layer = window.L.tileLayer(MAP_TILE_URL, {
      maxZoom: 19, noWrap: true, keepBuffer: 1,
      updateWhenIdle: true, updateWhenZooming: false,
      referrerPolicy: 'strict-origin-when-cross-origin',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    });
    backgroundLayer = layer;
    startMapBackgroundTimer();
    layer.on({
      loading: startMapBackgroundTimer,
      tileloadstart({ tile }) { activeTiles.add(tile); },
      tileload({ tile }) { failedTiles.delete(tile); },
      tileerror({ tile }) { if (activeTiles.has(tile)) failedTiles.add(tile); },
      tileunload: forgetTile,
      tileabort: forgetTile,
      load() {
        clearTimeout(backgroundTimer);
        if (failedTiles.size) showMapMessage('지도 일부를 불러오지 못했어요.');
        else $('map-message').hidden = true;
      },
      remove() { clearTimeout(backgroundTimer); activeTiles.clear(); failedTiles.clear(); }
    }).addTo(map);
  }
  function ensureMap() {
    if (map) return true;
    if (!mapIsVisible()) return false;
    if (!window.L) { $('map').replaceChildren(el('div', 'map-loading', '가게 정보에서 네이버·카카오맵을 열 수 있어요.')); showMapMessage('지도를 불러오지 못했어요.'); return false; }
    $('map').replaceChildren();
    map = window.L.map('map', { zoomControl: false, attributionControl: true, scrollWheelZoom: false, maxBounds: [[30, 120], [41, 136]], minZoom: 5, maxZoom: 19, preferCanvas: true }).setView([36.2, 127.8], 7);
    window.L.control.zoom({ position: 'topright' }).addTo(map);
    return true;
  }
  function currentMapPage() {
    const allLocated = state.visible.filter(hasCoordinates);
    state.mapPage = Math.max(0, Math.min(state.mapPage, Math.ceil(allLocated.length / MAP_PAGE_SIZE) - 1));
    const start = state.mapPage * MAP_PAGE_SIZE, end = Math.min(start + MAP_PAGE_SIZE, allLocated.length);
    return { allLocated, start, end, located: allLocated.slice(start, end) };
  }
  function changeMapPage(direction) {
    if (state.loading || state.loadError || !mapIsVisible()) return;
    const { allLocated } = currentMapPage();
    const next = Math.max(0, Math.min(state.mapPage + direction, Math.ceil(allLocated.length / MAP_PAGE_SIZE) - 1));
    if (next === state.mapPage) return;
    state.mapPage = next;
    state.selected = '';
    document.querySelectorAll('[data-restaurant-id].is-selected').forEach(card => card.classList.remove('is-selected'));
    syncMap(true);
  }
  function syncMap(fit) {
    if (!mapIsVisible()) return;
    if (!ensureMap()) { $('map-pagination').hidden = true; updateResultCount(); return; }
    const { allLocated, start, end, located } = currentMapPage();
    $('map-pagination').hidden = allLocated.length <= MAP_PAGE_SIZE;
    $('map-prev').disabled = start === 0;
    $('map-next').disabled = end >= allLocated.length;
    $('map-next').textContent = end < allLocated.length ? '더 보기 · ' + Math.min(MAP_PAGE_SIZE, allLocated.length - end) + '곳' : '마지막';
    $('map-page-status').textContent = located.length ? (start + 1) + '–' + end + ' / ' + allLocated.length + '곳' : '0곳';
    const ids = new Set(located.map(item => item.id));
    markers.forEach((marker, id) => { if (!ids.has(id)) { marker.remove(); markers.delete(id); } });
    located.forEach((item, index) => {
      let marker = markers.get(item.id);
      if (!marker) {
        marker = window.L.marker([item.lat, item.lng], { icon: pinIcon(index + 1, state.selected === item.id, !!item.recommendationId), keyboard: true, title: item.name, alt: item.name });
        const tooltip = el('span', '', item.name + (item.recommendationId ? ' · 회원 추천' : '')); marker.bindTooltip(tooltip, { direction: 'top' });
        marker.on('click', () => selectRestaurant(item.id, true)); marker.addTo(map); markers.set(item.id, marker);
      } else { marker.setIcon(pinIcon(index + 1, state.selected === item.id, !!item.recommendationId)); marker.setLatLng([item.lat, item.lng]); }
      marker.setZIndexOffset(state.selected === item.id ? 1000 : 0);
    });
    if (state.position) {
      if (!userMarker) userMarker = window.L.marker([state.position.lat, state.position.lng], { icon: window.L.divIcon({ className: 'user-pin', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }), title: '내 위치', alt: '내 위치' }).bindTooltip('내 위치').addTo(map);
      else userMarker.setLatLng([state.position.lat, state.position.lng]);
    }
    updateResultCount();
    requestAnimationFrame(() => {
      if (!mapIsVisible()) return;
      map.invalidateSize({ animate: false });
      if (fit) {
        if (located.length === 1) map.setView([located[0].lat, located[0].lng], 16, { animate: false });
        else if (located.length > 1) map.fitBounds(located.map(item => [item.lat, item.lng]), { paddingTopLeft: [35, 35], paddingBottomRight: [35, 35], maxZoom: 16, animate: false });
      }
      loadMapBackground();
    });
  }
  function selectRestaurant(id, openDetail) {
    const item = state.restaurants.find(r => r.id === id); if (!item) return;
    state.selected = id;
    document.querySelectorAll('[data-restaurant-id]').forEach(card => card.classList.toggle('is-selected', card.dataset.restaurantId === id));
    const locatedIndex = state.visible.filter(hasCoordinates).findIndex(restaurant => restaurant.id === id);
    if (locatedIndex >= 0) state.mapPage = Math.floor(locatedIndex / MAP_PAGE_SIZE);
    if (mapIsVisible() && hasCoordinates(item)) syncMap(false);
    const { located } = currentMapPage();
    located.forEach((restaurant, index) => { const marker = markers.get(restaurant.id); if (marker) { marker.setIcon(pinIcon(index + 1, restaurant.id === id, !!restaurant.recommendationId)); marker.setZIndexOffset(restaurant.id === id ? 1000 : 0); } });
    if (map && hasCoordinates(item) && mapIsVisible()) { map.setView([item.lat, item.lng], Math.max(map.getZoom(), 16), { animate: !reducedMotion.matches }); }
    if (openDetail) showDetail(item);
  }
  function showDetail(item) {
    if (item.recommendationId) {
      if (memberRecommendations) window.parent.postMessage({ type: 'ojjuda:restaurants:recommendations', id: item.recommendationId }, location.origin);
      return;
    }
    disposeRatingEditor();
    const content = $('detail-content'); content.replaceChildren();
    const cover = el('div', 'detail-cover'), body = el('div', 'detail-body');
    cover.append(el('p', 'detail-kicker', [item.region, item.district, item.category].filter(Boolean).join(' · ')));
    const titleRow = el('div', 'detail-title-row'), title = el('h2', '', item.name); title.id = 'detail-title'; titleRow.append(title, saveButton(item, true)); cover.append(titleRow);
    const facts = el('dl', 'detail-facts');
    facts.append(el('dt', '', '주소'), el('dd', 'detail-address', item.address || '출처에서 주소를 확인해 주세요.'));
    if (item.menu.length) facts.append(el('dt', '', '대표 메뉴'), el('dd', 'detail-menu', item.menu.join(' · ')));
    body.append(facts);
    const ratingSection = el('section', 'detail-ratings');
    if (!memberRatings) {
      ratingSection.append(el('h3', 'detail-section-label', '회원 별점'), el('p', 'rating-login-copy', '로그인하면 1점부터 5점까지, 0.5점 간격으로 별점을 남길 수 있어요.'));
      const login = el('a', 'rating-login-link', '로그인하고 별점 남기기'); login.href = '/?auth=login&next=world'; login.target = '_top'; ratingSection.append(login);
    }
    body.append(ratingSection);
    if (!hasCoordinates(item)) body.append(el('p', 'coord-note', '네이버·카카오맵에서 위치 확인'));
    body.append(el('h3', 'detail-section-label', '선정·추천 정보와 출처'));
    const sources = el('ul', 'source-list');
    item.guides.forEach(guide => {
      const yearType = guide.yearType || (guide.provider === 'post-office' ? 'publication' : guide.provider === 'blue-ribbon' ? 'edition' : 'selection');
      const yearSuffix = { edition: '년판', selection: '년 선정', publication: '년 발행', source: '년 자료', listing: '년 수록' }[yearType];
      const missingYear = { edition: '판본 연도 미확인', selection: '선정 연도 미확인', publication: '발행 연도 미확인', source: '자료 연도 미확인', listing: '수록 연도 미확인' }[yearType];
      const row = el('li', 'source-item'), heading = el('div', 'source-heading'); heading.append(badge(guide, false), el('span', 'source-year', guide.year ? guide.year + yearSuffix : missingYear));
      const checked = (guide.sourceRegisteredAt ? '자료 등록일 ' + dateLabel(guide.sourceRegisteredAt) + ' · ' : '') + (guide.sourceAsOf ? (guide.sourceDateType === 'page-modified' ? '페이지 수정 ' : '자료 기준 ') + guide.sourceAsOf.replaceAll('-', '.') + ' · ' : '') + '출처 확인일 ' + dateLabel(guide.verifiedAt);
      row.append(heading);
      if (guide.selectionCriteria) row.append(el('p', 'source-criteria', guide.selectionCriteria));
      row.append(el('p', 'source-verified', checked), link(guide.sourceName + ' ↗', guide.sourceUrl, 'source-link')); sources.append(row);
      if (guide.sourceRegisteredAt && guide.sourceRegistrationUrl !== guide.sourceUrl) row.append(link('자료 등록일 출처 ↗', guide.sourceRegistrationUrl, 'source-link'));
    });
    if (hasCoordinates(item) && item.coordinateSource) {
      const coordinateRow = el('li', 'coordinate-source');
      coordinateRow.append(link('위치 출처: ' + item.coordinateSource.name + ' ↗', item.coordinateSource.url, 'coordinate-source-link'));
      sources.append(coordinateRow);
    }
    body.append(sources, el('p', 'detail-note', '선정·추천 당시와 현재 영업 상태는 다를 수 있어요. 메뉴·가격·영업시간은 방문 전 가게에서 확인해 주세요.'));
    const query = encodeURIComponent([item.name, item.address].filter(Boolean).join(' ')), links = el('div', 'detail-links');
    links.append(link('네이버지도 ↗', 'https://map.naver.com/p/search/' + query), link('카카오맵 ↗', 'https://map.kakao.com/link/search/' + query));
    const route = hasCoordinates(item) ? 'https://map.kakao.com/link/to/' + encodeURIComponent(item.name) + ',' + item.lat + ',' + item.lng : 'https://map.kakao.com/link/search/' + query;
    links.append(link(hasCoordinates(item) ? '길찾기 ↗' : '주소로 길찾기 검색 ↗', route, 'route-link')); body.append(links);
    content.append(cover, body);
    if (!$('detail').open) $('detail').showModal();
    if (memberRatings) ratingEditor = ratingUI.mountEditor(ratingSection, {
      name: item.name,
      load: async () => {
        const version = ratingVersions.get(item.id) || 0;
        const rows = await requestRating('summary', { ids: [item.id] });
        const summary = Array.isArray(rows) && rows.find(row => row.id === item.id);
        if (!summary) throw new Error('별점을 불러오지 못했어요.');
        if ($('detail').open && state.selected === item.id && ratingSection.isConnected && version === (ratingVersions.get(item.id) || 0)) updateRating(summary);
        return summary;
      },
      save: async score => requestRating('save', { id: item.id, score }),
      isCurrent: () => $('detail').open && state.selected === item.id && ratingSection.isConnected,
      onChange: summary => { ratingVersions.set(item.id, (ratingVersions.get(item.id) || 0) + 1); updateRating(summary); if (state.sort === 'popular') render(false); }
    });
    $('close-detail').focus({ preventScroll: true });
  }
  function setView(view, persist = false) {
    state.view = view; $('workspace').dataset.view = view;
    if (view === 'list' && backgroundLayer) backgroundLayer.remove();
    $('show-map').setAttribute('aria-pressed', String(view === 'map')); $('show-list').setAttribute('aria-pressed', String(view === 'list'));
    if (persist) { try { localStorage.setItem(VIEW_KEY, view); } catch {} }
    updateResultCount();
    if (view === 'map' && !state.loading && !state.loadError) syncMap(true);
  }
  function toggleMapExpansion() {
    const expanded = $('map-panel').classList.toggle('is-expanded');
    document.body.classList.toggle('map-is-expanded', expanded);
    $('map-expand').setAttribute('aria-pressed', String(expanded));
    $('map-expand').setAttribute('aria-label', expanded ? '지도 작게 보기' : '지도 크게 보기');
    $('map-expand-label').textContent = expanded ? '지도 작게 보기' : '지도 크게 보기';
    $('map-expand').querySelector('svg').innerHTML = expanded
      ? '<path d="M4 4l12 12M16 4 4 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>'
      : '<path d="M7 2H2v5m11-5h5v5M2 13v5h5m11-5v5h-5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>';
    requestAnimationFrame(() => { if (map) map.invalidateSize({ animate: false }); if (mapIsVisible()) syncMap(false); });
  }
  function resetFilters() {
    clearTimeout(searchTimer); state.category = ''; state.guide = ''; state.region = ''; state.query = ''; state.savedOnly = false; state.selected = '';
    $('search').value = ''; $('region').value = '';
    announce(''); render(true);
  }
  async function loadData() {
    if (loadController) loadController.abort(); loadController = new AbortController();
    const controller = loadController; state.loading = true; state.loadError = false;
    $('load-more').hidden = true;
    $('result-count').textContent = '맛집을 불러오는 중…';
    $('result-coverage').hidden = true;
    const loading = el('div', 'loading-state'); loading.append(el('span', 'loading-ring'), el('p', '', '확인된 맛집을 불러오고 있어요.')); $('cards').replaceChildren(loading);
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const [response, supplementResponse, seoulResponse, northeastResponse, southwestResponse, southeastResponse, incheonResponse, incheonBResponse, gyeonggiResponse, seongnamResponse, goyangPajuResponse, bucheonGimpoResponse, gyeonggiSlot12Response, gyeonggiSlot13Response, guriSlot15Response, slot17Response, slot18Response, slot19Response, slot20Response, slot21Response, slot23Response, slot25Response, slot26Response, slot27Response, slot28Response, slot30Response, slot32Response, slot33Response, slot34Response, slot36Response, slot37Response, slot38Response, slot39Response, slot41MapResponse, slot44Response, slot45LocationResponse, slot47JejuResponse, slot48SeogwipoResponse, slot49GyeonggiResponse, slot50GangwonResponse, slot51ChungbukResponse, slot52ChungnamResponse, slot55GyeongbukResponse, slot56GyeongnamResponse, slot57JejuResponse, slot59Response, slot61Response, slot62Response, slot63Response, slot64Response, slot65Response, slot66Response, slot68Response, slot69Response, slot70Response, slot71Response, slot74Response, slot75Response] = await Promise.all([
        fetch('./restaurants.json?v=20261105-restaurants-seoul1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-ulsan-tourism.json?v=20261105-restaurants-seoul1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-seoul-blue-ribbon.json?v=20261108-restaurants-slot58-seoulblue-2', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-seoul-visitseoul-northeast.json?v=20261105-restaurants-seoul-oraegage2', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-seoul-visitseoul-southwest.json?v=20261105-restaurants-seoul-sw1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-seoul-visitseoul-southeast.json?v=20261105-restaurants-seoul-se1', { signal: controller.signal, cache: 'no-cache' }),
         fetch('./official-incheon-itour-slot06.json?v=20261106-restaurants-incheon-slot06-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-incheon-itour-slot07.json?v=20261106-restaurants-incheon-slot07-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeonggi-oldshops-slot08.json?v=20261106-restaurants-gyeonggi-slot08-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-seongnam-hipstores-slot09.json?v=20261106-restaurants-seongnam-slot09-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-goyang-paju-slot10.json?v=20261106-restaurants-goyang-paju-slot10-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-bucheon-gimpo-slot11.json?v=20261106-restaurants-slot11-extra1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeonggi-slot12.json?v=20261106-restaurants-slot12-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeonggi-slot13.json?v=20261106-restaurants-slot13-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-guri-slot15.json?v=20261107-restaurants-slot49-guri26-7', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeonggi-slot17.json?v=20261106-restaurants-slot17-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gangwon-slot18.json?v=20261106-restaurants-slot18-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gangwon-slot19.json?v=20261106-restaurants-slot19-1', { signal: controller.signal, cache: 'no-cache' }),
         fetch('./official-gangwon-slot20.json?v=20261106-restaurants-slot20-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-daejeon-slot21.json?v=20261108-restaurants-slot60-daejeon7-fix1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-chungbuk-slot23.json?v=20261106-restaurants-slot23-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-chungnam-slot25.json?v=20261106-restaurants-slot25-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-chungnam-slot26.json?v=20261106-restaurants-slot26-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-chungnam-slot27.json?v=20261106-restaurants-slot27-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gwangju-slot28.json?v=20261108-restaurants-slot54-gwangju-3', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-jeonbuk-slot30.json?v=20261107-restaurants-slot30-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-mokpo-naju-slot32.json?v=20261107-restaurants-slot32-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-daegu-slot33.json?v=20261107-restaurants-slot33-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-daegu-slot34.json?v=20261107-restaurants-slot34-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeongbuk-slot36.json?v=20261107-restaurants-slot36-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeongbuk-slot37.json?v=20261107-restaurants-slot37-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeongbuk-slot38.json?v=20261107-restaurants-slot38-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-busan-slot39.json?v=20261107-restaurants-slot39-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-busan-slot41-michelin-map.json?v=20261107-restaurants-slot41-map1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeongnam-slot44.json?v=20261107-restaurants-slot44-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeongnam-slot45-locations.json?v=20261107-restaurants-slot45-loc1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-jeju-slot47-locations.json?v=20261107-restaurants-slot47-jeju-loc4', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-jeju-slot48-locations.json?v=20261107-restaurants-slot48-seogwipo-loc6', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeonggi-slot49.json?v=20261107-restaurants-slot49-guri26-7', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gangwon-slot50.json?v=20261107-restaurants-slot50-gangwon-5', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-chungbuk-slot51.json?v=20261107-restaurants-slot51-chungbuk-6', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-chungnam-slot52.json?v=20261107-restaurants-slot52-chungnam-10', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeongbuk-slot55.json?v=20261108-restaurants-slot55-gyeongbuk-1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeongnam-slot56.json?v=20261108-restaurants-slot56-gyeongnam-5', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-jeju-slot57.json?v=20261108-restaurants-slot60-daejeon7-fix1', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-busan-daegu-ulsan-slot59.json?v=20261108-restaurants-slot59-bdu6', { signal: controller.signal, cache: 'no-cache' }),
         fetch('./official-incheon-islands-slot61.json?v=20261108-restaurants-slot61-islands4', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-daegu-slot62.json?v=20261108-restaurants-slot62-dalseong5', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-busan-ulsan-slot63.json?v=20261108-restaurants-slot63-gijang-ulju3', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gyeonggi-slot64.json?v=20261108-restaurants-slot64-gyeonggi10', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gangwon-slot65.json?v=20261108-restaurants-slot65-hongcheon7', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-gangwon-slot66.json?v=20261108-restaurants-slot66-gangwon23', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-chungbuk-slot68.json?v=20261108-restaurants-slot68-yeongdong5', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-chungbuk-slot69.json?v=20261108-restaurants-slot69-chungbuk17', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-chungnam-slot70.json?v=20261108-restaurants-slot70-geumsan19', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-chungnam-slot71.json?v=20261108-restaurants-slot71-taean12-yesan12', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-jeonnam-slot74.json?v=20261108-restaurants-slot74-gokseong10', { signal: controller.signal, cache: 'no-cache' }),
        fetch('./official-jeonnam-slot75.json?v=20261108-restaurants-slot75-official34', { signal: controller.signal, cache: 'no-cache' })
      ]);
      if (!response.ok || !supplementResponse.ok || !seoulResponse.ok || !northeastResponse.ok || !southwestResponse.ok || !southeastResponse.ok || !incheonResponse.ok || !incheonBResponse.ok || !gyeonggiResponse.ok || !seongnamResponse.ok || !goyangPajuResponse.ok || !bucheonGimpoResponse.ok || !gyeonggiSlot12Response.ok || !gyeonggiSlot13Response.ok || !guriSlot15Response.ok || !slot17Response.ok || !slot18Response.ok || !slot19Response.ok || !slot20Response.ok || !slot21Response.ok || !slot23Response.ok || !slot25Response.ok || !slot26Response.ok || !slot27Response.ok || !slot28Response.ok || !slot30Response.ok || !slot32Response.ok || !slot33Response.ok || !slot34Response.ok || !slot36Response.ok || !slot37Response.ok || !slot38Response.ok || !slot39Response.ok) throw new Error('Catalog HTTP ' + response.status + '/' + supplementResponse.status + '/' + seoulResponse.status + '/' + northeastResponse.status + '/' + southwestResponse.status + '/' + southeastResponse.status + '/' + incheonResponse.status + '/' + incheonBResponse.status + '/' + gyeonggiResponse.status + '/' + seongnamResponse.status + '/' + goyangPajuResponse.status + '/' + bucheonGimpoResponse.status + '/' + gyeonggiSlot12Response.status + '/' + gyeonggiSlot13Response.status + '/' + guriSlot15Response.status + '/' + slot17Response.status + '/' + slot18Response.status + '/' + slot19Response.status + '/' + slot20Response.status + '/' + slot21Response.status + '/' + slot23Response.status + '/' + slot25Response.status + '/' + slot26Response.status + '/' + slot27Response.status + '/' + slot28Response.status + '/' + slot30Response.status + '/' + slot32Response.status + '/' + slot36Response.status + '/' + slot37Response.status + '/' + slot38Response.status + '/' + slot39Response.status);
      if (!slot41MapResponse.ok) throw new Error('Official Michelin map enrichment HTTP ' + slot41MapResponse.status);
      if (!slot44Response.ok) throw new Error('Official Gyeongnam listing HTTP ' + slot44Response.status);
       if (!slot45LocationResponse.ok) throw new Error('Verified Tongyeong location HTTP ' + slot45LocationResponse.status);
      if (!slot47JejuResponse.ok) throw new Error('Verified Jeju location HTTP ' + slot47JejuResponse.status);
      if (!slot48SeogwipoResponse.ok) throw new Error('Verified Seogwipo location HTTP ' + slot48SeogwipoResponse.status);
      if (!slot49GyeonggiResponse.ok) throw new Error('Official Gyeonggi guide HTTP ' + slot49GyeonggiResponse.status);
      if (!slot50GangwonResponse.ok) throw new Error('Official Gangwon guide HTTP ' + slot50GangwonResponse.status);
      if (!slot51ChungbukResponse.ok) throw new Error('Official Chungbuk guide HTTP ' + slot51ChungbukResponse.status);
      if (!slot52ChungnamResponse.ok) throw new Error('Official Chungnam selections HTTP ' + slot52ChungnamResponse.status);
       if (!slot55GyeongbukResponse.ok) throw new Error('Official Gyeongbuk HTTP ' + slot55GyeongbukResponse.status);
      if (!slot56GyeongnamResponse.ok) throw new Error('Official Gyeongnam slot56 HTTP ' + slot56GyeongnamResponse.status);
      if (!slot57JejuResponse.ok) throw new Error('Official Jeju slot57 HTTP ' + slot57JejuResponse.status);
       if (!slot59Response.ok) throw new Error('Official slot59 HTTP ' + slot59Response.status);
       if (!slot61Response.ok) throw new Error('Official Incheon islands slot61 HTTP ' + slot61Response.status);
      if (!slot62Response.ok) throw new Error('Official Daegu slot62 HTTP ' + slot62Response.status);
      if (!slot63Response.ok) throw new Error('Official Busan Ulsan slot63 HTTP ' + slot63Response.status);
      if (!slot64Response.ok) throw new Error('Official Gyeonggi slot64 HTTP ' + slot64Response.status);
       if (!slot65Response.ok) throw new Error('Official Gangwon slot65 HTTP ' + slot65Response.status);
      if (!slot66Response.ok) throw new Error('Official Gangwon slot66 HTTP ' + slot66Response.status);
      if (!slot68Response.ok) throw new Error('Official Chungbuk slot68 HTTP ' + slot68Response.status);
      if (!slot69Response.ok) throw new Error('Official Chungbuk slot69 HTTP ' + slot69Response.status);
      if (!slot70Response.ok) throw new Error('Official Chungnam slot70 HTTP ' + slot70Response.status);
      if (!slot71Response.ok) throw new Error('Official Chungnam slot71 HTTP ' + slot71Response.status);
      if (!slot74Response.ok) throw new Error('Official Jeonnam slot74 HTTP ' + slot74Response.status);
      if (!slot75Response.ok) throw new Error('Official Jeonnam slot75 HTTP ' + slot75Response.status);
      const slot41Map = await slot41MapResponse.json();
      const slot44 = await slot44Response.json();
       const slot45Locations = await slot45LocationResponse.json();
      const slot47Jeju = await slot47JejuResponse.json();
      const slot48Seogwipo = await slot48SeogwipoResponse.json();
      const slot49Gyeonggi = await slot49GyeonggiResponse.json();
      const slot50Gangwon = await slot50GangwonResponse.json();
      const slot51Chungbuk = await slot51ChungbukResponse.json();
      const slot52Chungnam = await slot52ChungnamResponse.json();
       const slot55Gyeongbuk = await slot55GyeongbukResponse.json();
      const slot56Gyeongnam = await slot56GyeongnamResponse.json();
      const slot57Jeju = await slot57JejuResponse.json();
       const slot59 = await slot59Response.json();
       const slot61 = await slot61Response.json();
      const slot62 = await slot62Response.json();
      const slot63 = await slot63Response.json();
      const slot64 = await slot64Response.json();
       const slot65 = await slot65Response.json();
      const slot66 = await slot66Response.json();
      const slot68 = await slot68Response.json();
      const slot69 = await slot69Response.json();
      const slot70 = await slot70Response.json();
      const slot71 = await slot71Response.json();
      const slot74 = await slot74Response.json();
      const slot75 = await slot75Response.json();
      const [data, supplement, seoul, northeast, southwest, southeast, incheon, incheonB, gyeonggi, seongnam, goyangPaju, bucheonGimpo, gyeonggiSlot12, gyeonggiSlot13, guriSlot15, slot17, slot18, slot19, slot20, slot21, slot23, slot25, slot26, slot27, slot28, slot30, slot32, slot33, slot34, slot36, slot37, slot38, slot39] = await Promise.all([response.json(), supplementResponse.json(), seoulResponse.json(), northeastResponse.json(), southwestResponse.json(), southeastResponse.json(), incheonResponse.json(), incheonBResponse.json(), gyeonggiResponse.json(), seongnamResponse.json(), goyangPajuResponse.json(), bucheonGimpoResponse.json(), gyeonggiSlot12Response.json(), gyeonggiSlot13Response.json(), guriSlot15Response.json(), slot17Response.json(), slot18Response.json(), slot19Response.json(), slot20Response.json(), slot21Response.json(), slot23Response.json(), slot25Response.json(), slot26Response.json(), slot27Response.json(), slot28Response.json(), slot30Response.json(), slot32Response.json(), slot33Response.json(), slot34Response.json(), slot36Response.json(), slot37Response.json(), slot38Response.json(), slot39Response.json()]);
      if (!data || !Array.isArray(data.restaurants) || !supplement || !Array.isArray(supplement.restaurants) || !seoul || !Array.isArray(seoul.restaurants) || !northeast || !Array.isArray(northeast.restaurants) || !southwest || !Array.isArray(southwest.restaurants) || !southeast || !Array.isArray(southeast.restaurants) || !incheon || !Array.isArray(incheon.restaurants) || !incheonB || !Array.isArray(incheonB.restaurants) || !gyeonggi || !Array.isArray(gyeonggi.restaurants) || !seongnam || !Array.isArray(seongnam.restaurants) || !goyangPaju || !Array.isArray(goyangPaju.restaurants) || !bucheonGimpo || !Array.isArray(bucheonGimpo.restaurants) || !Array.isArray(bucheonGimpo.enrichments) || !gyeonggiSlot12 || !Array.isArray(gyeonggiSlot12.restaurants) || !gyeonggiSlot13 || !Array.isArray(gyeonggiSlot13.restaurants) || !guriSlot15 || !Array.isArray(guriSlot15.restaurants) || !slot17 || !Array.isArray(slot17.restaurants) || !slot18 || !Array.isArray(slot18.restaurants) || !slot19 || !Array.isArray(slot19.restaurants) || !slot20 || !Array.isArray(slot20.restaurants) || !slot21 || !Array.isArray(slot21.restaurants) || !Array.isArray(slot21.guideEnrichments) || !slot23 || !Array.isArray(slot23.restaurants) || !slot25 || !Array.isArray(slot25.restaurants) || !slot26 || !Array.isArray(slot26.restaurants) || !slot27 || !Array.isArray(slot27.restaurants) || !slot28 || !Array.isArray(slot28.restaurants) || !slot30 || !Array.isArray(slot30.restaurants) || !slot32 || !Array.isArray(slot32.restaurants) || !slot33 || !Array.isArray(slot33.restaurants) || !slot34 || !Array.isArray(slot34.restaurants) || !slot36 || !Array.isArray(slot36.restaurants) || !slot37 || !Array.isArray(slot37.restaurants) || !slot38 || !Array.isArray(slot38.restaurants) || !slot39 || !Array.isArray(slot39.restaurants)) throw new Error('Invalid dataset');
      if (!slot41Map || !Array.isArray(slot41Map.locationEnrichments) || slot41Map.locationEnrichments.length > 50) throw new Error('Invalid official Michelin map enrichments');
      if (!slot44 || !Array.isArray(slot44.restaurants) || !Array.isArray(slot44.locationEnrichments) || slot44.restaurants.length > 30 || slot44.locationEnrichments.length > 20) throw new Error('Invalid Gyeongnam source data');
       if (!slot45Locations || !Array.isArray(slot45Locations.restaurants) || slot45Locations.restaurants.length !== 0 || !Array.isArray(slot45Locations.locationEnrichments) || slot45Locations.locationEnrichments.length > 20) throw new Error('Invalid Gyeongnam position audit');
      if (!slot47Jeju || !Array.isArray(slot47Jeju.restaurants) || slot47Jeju.restaurants.length !== 0 || !Array.isArray(slot47Jeju.locationEnrichments) || slot47Jeju.locationEnrichments.length > 20) throw new Error('Invalid Jeju official location audit');
      if (!slot48Seogwipo || !Array.isArray(slot48Seogwipo.restaurants) || slot48Seogwipo.restaurants.length !== 0 || !Array.isArray(slot48Seogwipo.locationEnrichments) || slot48Seogwipo.locationEnrichments.length > 20) throw new Error('Invalid Seogwipo official location audit');
      if (!slot49Gyeonggi || !Array.isArray(slot49Gyeonggi.restaurants) || slot49Gyeonggi.restaurants.length > 20) throw new Error('Invalid official Gyeonggi restaurant list');
      if (!slot50Gangwon || !Array.isArray(slot50Gangwon.restaurants) || slot50Gangwon.restaurants.length > 20) throw new Error('Invalid official Gangwon restaurant list');
      if (!slot51Chungbuk || !Array.isArray(slot51Chungbuk.restaurants) || slot51Chungbuk.restaurants.length > 20) throw new Error('Invalid official Chungbuk restaurant list');
      if (!slot52Chungnam || !Array.isArray(slot52Chungnam.restaurants) || slot52Chungnam.restaurants.length > 20) throw new Error('Invalid official Chungnam selections');
       if (!slot55Gyeongbuk || !Array.isArray(slot55Gyeongbuk.restaurants) || slot55Gyeongbuk.restaurants.length > 20) throw new Error('Invalid official Gyeongbuk data');
      if (!slot56Gyeongnam || !Array.isArray(slot56Gyeongnam.restaurants) || slot56Gyeongnam.restaurants.length > 20) throw new Error('Invalid official Gyeongnam slot56 data');
      if (!slot57Jeju || !Array.isArray(slot57Jeju.restaurants) || slot57Jeju.restaurants.length > 20 || !Array.isArray(slot57Jeju.locationEnrichments) || slot57Jeju.locationEnrichments.length > 10) throw new Error('Invalid official Jeju slot57 data');
       if (!slot59 || !Array.isArray(slot59.restaurants) || slot59.restaurants.length > 20) throw new Error('Invalid official slot59 data');
       if (!slot61 || !Array.isArray(slot61.restaurants) || slot61.restaurants.length > 20 || (slot61.addressEnrichments !== undefined && !Array.isArray(slot61.addressEnrichments)) || (Array.isArray(slot61.addressEnrichments) && slot61.addressEnrichments.length > 5)) throw new Error('Invalid Incheon islands slot61 data');
      if (!slot62 || !Array.isArray(slot62.restaurants) || slot62.restaurants.length > 15) throw new Error('Invalid Daegu slot62 data');
      if (!slot63 || !Array.isArray(slot63.restaurants) || slot63.restaurants.length > 15 || !Array.isArray(slot63.addressEnrichments) || slot63.addressEnrichments.length > 5) throw new Error('Invalid official Busan Ulsan slot63 data');
      if (!slot64 || !Array.isArray(slot64.restaurants) || slot64.restaurants.length > 15) throw new Error('Invalid Gyeonggi slot64 data');
       if (!slot65 || !Array.isArray(slot65.restaurants) || slot65.restaurants.length > 15) throw new Error('Invalid Gangwon slot65 data');
      if (!slot66 || !Array.isArray(slot66.restaurants) || slot66.restaurants.length > 30) throw new Error('Invalid Gangwon slot66 data');
      if (!slot68 || !Array.isArray(slot68.restaurants) || slot68.restaurants.length > 30 || !Array.isArray(slot68.guideEnrichments) || slot68.guideEnrichments.length > 30) throw new Error('Invalid Chungbuk slot68 data');
      if (!slot69 || !Array.isArray(slot69.restaurants) || slot69.restaurants.length > 25) throw new Error('Invalid Chungbuk slot69 data');
      if (!slot70 || !Array.isArray(slot70.restaurants) || slot70.restaurants.length !== 19 || !Array.isArray(slot70.guideEnrichments) || slot70.guideEnrichments.length !== 1) throw new Error('Invalid Chungnam slot70 data');
      if (!slot71 || slot71.cycle !== 1 || slot71.slot !== 71 || !Array.isArray(slot71.restaurants) || slot71.restaurants.length !== 24 || !slot71.restaurants.every(row => row.lat === null && row.lng === null && Array.isArray(row.guides) && row.guides.some(g => g.provider === 'local-guide' && g.status === 'official_listing'))) throw new Error('Invalid Chungnam slot71 data');
      if (!slot74 || slot74.cycle !== 1 || slot74.slot !== 74 || !Array.isArray(slot74.restaurants) || slot74.restaurants.length !== 10 || !Array.isArray(slot74.guideEnrichments) || slot74.guideEnrichments.length !== 3 || !slot74.restaurants.every(row => row.lat === null && row.lng === null && row.region === '전남' && row.district === '곡성군')) throw new Error('Invalid Jeonnam slot74 official data');
      if (!slot75 || slot75.cycle !== 1 || slot75.slot !== 75 || !Array.isArray(slot75.restaurants) || slot75.restaurants.length !== 34 || !Array.isArray(slot75.guideEnrichments) || slot75.guideEnrichments.length !== 7 || !slot75.restaurants.every(x => x.region === '전남' && ['고흥군','보성군','화순군'].includes(x.district) && x.lat === null && x.lng === null && Array.isArray(x.guides) && x.guides.some(g => g.provider === 'local-guide' && g.status === 'official_listing'))) throw new Error('Invalid Jeonnam slot75 data');
      // Keep the base catalog and member recommendations unchanged; add only proven municipal listing facts.
      const combined = [...data.restaurants];
      const knownIds = new Set(combined.map(item => item.id));
      const identity = item => [item.region, item.name, item.address].map(v => String(v || '').replace(/\s+/g, '').toLowerCase()).join('|');
      const knownPlaces = new Set(combined.map(identity));
      for (const item of [...supplement.restaurants, ...seoul.restaurants, ...northeast.restaurants, ...southwest.restaurants, ...southeast.restaurants, ...incheon.restaurants, ...incheonB.restaurants, ...gyeonggi.restaurants, ...seongnam.restaurants, ...goyangPaju.restaurants, ...bucheonGimpo.restaurants, ...gyeonggiSlot12.restaurants, ...gyeonggiSlot13.restaurants, ...guriSlot15.restaurants, ...slot17.restaurants, ...slot18.restaurants, ...slot19.restaurants, ...slot20.restaurants, ...slot21.restaurants, ...slot23.restaurants, ...slot25.restaurants, ...slot26.restaurants, ...slot27.restaurants, ...slot28.restaurants, ...slot30.restaurants, ...slot32.restaurants, ...slot33.restaurants, ...slot34.restaurants, ...slot36.restaurants, ...slot37.restaurants, ...slot38.restaurants, ...slot39.restaurants, ...slot44.restaurants, ...slot49Gyeonggi.restaurants, ...slot50Gangwon.restaurants, ...slot51Chungbuk.restaurants, ...slot52Chungnam.restaurants, ...slot55Gyeongbuk.restaurants, ...slot56Gyeongnam.restaurants, ...slot57Jeju.restaurants, ...slot59.restaurants, ...slot61.restaurants, ...slot62.restaurants, ...slot63.restaurants, ...slot64.restaurants, ...slot65.restaurants, ...slot66.restaurants, ...slot68.restaurants, ...slot69.restaurants, ...slot70.restaurants, ...slot71.restaurants, ...slot74.restaurants, ...slot75.restaurants]) {
        const key = identity(item);
        if (knownIds.has(item.id) || knownPlaces.has(key)) continue;
        combined.push(item); knownIds.add(item.id); knownPlaces.add(key);
      }
       // Correct the exact saved-ID Ganghwa restaurant when the current official county address is verified.
       // Retain its guide history and do not infer coordinates from any address.
       for (const patch of (Array.isArray(slot61.addressEnrichments) ? slot61.addressEnrichments : [])) {
         if (!patch || patch.id !== 'local-north-1dec29df6f254886' || patch.expectedName !== '편가네된장') continue;
         const restaurant = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
         if (!restaurant || patch.newAddress !== '인천광역시 강화군 화도면 가능포로89번길 11') continue;
         if (patch.officialSourceUrl !== 'https://www.ganghwa.go.kr/open_content/tour/locinfo/modelRestaurant.do') continue;
         restaurant.address = patch.newAddress;
         restaurant.addressSourceUrl = patch.officialSourceUrl;
         restaurant.addressSourceCheckedAt = patch.checkedAt;
       }
      // Preserve bookmark IDs and selection history when the official 2026 Busan listing proves only a district-name change.
      for (const patch of slot63.addressEnrichments) {
        if (!patch || patch.id !== 'local-busan-taste-fbd95ea18d3f287c' || patch.expectedName !== '일광바다횟집') continue;
        const restaurant = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
        if (!restaurant || patch.newAddress !== '부산광역시 기장군 일광읍 기장해안로 1312') continue;
        if (patch.officialSourceUrl !== 'https://www.visitbusan.net/index.do?menuCd=DOM_000000201002005000&pageNo=113') continue;
        restaurant.address = patch.newAddress;
        restaurant.addressSourceUrl = patch.officialSourceUrl;
        restaurant.addressSourceCheckedAt = patch.checkedAt;
      }
      // Year correction only for the four already-listed, explicitly matched 2026 Gimpo designations.
      // Preserve existing IDs, coordinates, bookmarks and any other guide entries.
      for (const update of bucheonGimpo.enrichments) {
        const item = combined.find(row => row.id === update.id && row.name === update.expectedName && row.region === '경기');
        const guide = item?.guides?.find(g => g.provider === 'local-guide' && g.label === update.matchGuideLabel);
        if (guide && update.replacementGuide?.provider === 'local-guide' && update.replacementGuide?.year === 2026) Object.assign(guide, update.replacementGuide);
      }
      // Preserve 2025 Chungnam province selection and the saved ID while adding the county's independently verified model-restaurant listing.
      // County list publication/verification date is not the restaurant's individual designation year or proof of current operation.
      for (const patch of slot70.guideEnrichments) {
        if (!patch || patch.id !== 'local-chungnam-slot52-geumsan-kimjeongi-samgyetang' || patch.expectedName !== '금산원조김정이삼계탕' || patch.expectedAddress !== '충청남도 금산군 금산읍 인삼약초로 33 대원상가 2층') continue;
        const item = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
        const guide = patch.guide;
        if (!item || !guide || guide.provider !== 'local-guide' || guide.label !== '금산군 모범음식점' || guide.sourceUrl !== 'https://www.geumsan.go.kr/tour/html/sub05/050103.html?GotoPage=2') continue;
        if (!item.guides.some(g => g.provider === guide.provider && g.label === guide.label && g.sourceUrl === guide.sourceUrl)) item.guides.push(guide);
      }
      // Merge exact-match county model listing without replacing older selections or bookmark IDs.
      for (const patch of slot74.guideEnrichments) {
        if (!patch || !patch.id || !patch.expectedName || !patch.expectedAddress) continue;
        const item = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
        const g = patch.guide;
        if (!item || !Array.isArray(item.guides) || !g || g.provider !== 'local-guide' || g.label !== '곡성군 모범음식점' || g.sourceUrl !== 'https://tour.gokseong.go.kr/tour/amusement/eatery/best') continue;
        if (!item.guides.some(row => row.provider === g.provider && row.label === g.label && row.sourceUrl === g.sourceUrl)) item.guides.push(g);
      }
      // Merge independently verified Boseong/Hwasun guides only with exact old ID, name and current address.
      for (const patch of slot75.guideEnrichments) {
        if (!patch || !patch.id || !patch.expectedName || !patch.expectedAddress) continue;
        const item = combined.find(x => x.id === patch.id && x.name === patch.expectedName && x.address === patch.expectedAddress);
        const g = patch.guide;
        if (!item || !Array.isArray(item.guides) || !g || g.provider !== 'local-guide' || !['보성군 모범음식점','화순군 모범음식점'].includes(g.label)) continue;
        if (!item.guides.some(x => x.provider === g.provider && x.label === g.label && x.sourceUrl === g.sourceUrl)) item.guides.push(g);
      }
      // Add the independently verified Okcheon county guide to existing saved IDs only on exact name and current address matches.
      // Keep previous selections, location information, member saves and separate restaurant identities untouched.
      for (const patch of slot68.guideEnrichments) {
        const restaurant = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
        const guide = patch.guide;
        if (!restaurant || !Array.isArray(restaurant.guides) || !guide || guide.provider !== 'local-guide' || guide.sourceUrl !== 'https://www.oc.go.kr/tour/contents.do?key=4087') continue;
        if (!restaurant.guides.some(row => row.provider === guide.provider && row.label === guide.label && row.sourceUrl === guide.sourceUrl)) restaurant.guides.push(guide);
      }
      // Merge verified new municipal certification into an existing saved-ID restaurant without overwriting other guides.
       for (const patch of slot21.guideEnrichments) {
         const restaurant = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
         const guide = patch.guide;
         if (!restaurant || !guide || guide.provider !== 'local-guide' || !Array.isArray(restaurant.guides)) continue;
         if (restaurant.guides.some(g => g.provider === guide.provider && g.label === guide.label && g.sourceUrl === guide.sourceUrl)) continue;
         restaurant.guides.push(guide);
       }
       // Patch an existing Blue Ribbon entry only when the exact ID, name and current address agree.
      // Only official municipal map links are accepted; do not alter selection history.
      for (const patch of (Array.isArray(slot18.locationEnrichments) ? slot18.locationEnrichments : [])) {
        const restaurant = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
        if (!restaurant || restaurant.lat != null || restaurant.lng != null) continue;
        if (!Number.isFinite(patch.lat) || !Number.isFinite(patch.lng)) continue;
        if (!/^https:\/\/www\.chuncheon\.go\.kr\//.test(patch.coordinateSourceUrl || '')) continue;
        restaurant.lat = patch.lat; restaurant.lng = patch.lng;
        restaurant.coordinateSourceUrl = patch.coordinateSourceUrl;
        restaurant.coordinateSourceCheckedAt = patch.coordinateSourceCheckedAt;
      }
      // Official Michelin map-link coordinates apply only to matching saved-ID and unchanged-address restaurants.
      for (const patch of slot41Map.locationEnrichments) {
        const restaurant = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
        if (!restaurant || restaurant.lat != null || restaurant.lng != null) continue;
        if (!Number.isFinite(patch.lat) || !Number.isFinite(patch.lng) || patch.lat < 34.7 || patch.lat > 35.6 || patch.lng < 128.7 || patch.lng > 129.5) continue;
        const verifiedUrl = safeHttps(patch.coordinateSource?.url);
        if (!/^https:\/\/guide\.michelin\.com\/kr\/ko\/busan-region\/busan_1025838\/restaurant\/[a-z0-9-]+$/.test(verifiedUrl)) continue;
        if (!restaurant.guides?.some(guide => guide.provider === 'michelin' && guide.sourceUrl === verifiedUrl)) continue;
        restaurant.lat = patch.lat; restaurant.lng = patch.lng;
        restaurant.coordinateSource = { name: '미쉐린 가이드 공식 식당 지도', url: verifiedUrl, method: 'published-map-coordinate', checkedAt: '2026-11-07' };
      }
      // Exact published business coordinates only: match the original saved ID, name and complete address.
      for (const patch of slot44.locationEnrichments) {
        const restaurant = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
        if (!restaurant || restaurant.lat != null || restaurant.lng != null) continue;
        if (!Number.isFinite(patch.lat) || !Number.isFinite(patch.lng) || patch.lat < 34 || patch.lat > 36 || patch.lng < 127 || patch.lng > 130) continue;
        const coordinateUrl = safeHttps(patch.coordinateSource?.url);
        if (!/^https:\/\/smi\.purpleo\.kr\/article\/\d+$/.test(coordinateUrl)) continue;
        if (!restaurant.guides?.some(guide => guide.provider === 'post-office' && guide.sourceUrl.includes('kphi.koreapost.go.kr/'))) continue;
        restaurant.lat = patch.lat; restaurant.lng = patch.lng;
        restaurant.coordinateSource = { name: text(patch.coordinateSource?.name, 140), url: coordinateUrl, method: text(patch.coordinateSource?.method, 120), checkedAt: validDate(patch.coordinateSource?.checkedAt) };
      }
      // Slot 45: require an unchanged published business name, complete address and two crosschecked public positions.
       for (const patch of slot45Locations.locationEnrichments) {
         const restaurant = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
         if (!restaurant || restaurant.lat != null || restaurant.lng != null || restaurant.region !== '경남' || restaurant.district !== '통영시') continue;
         if (!Number.isFinite(patch.lat) || !Number.isFinite(patch.lng) || patch.lat < 34.5 || patch.lat > 35.3 || patch.lng < 128 || patch.lng > 129) continue;
         const locationUrl = safeHttps(patch.coordinateSource?.url);
         const crosscheckUrl = safeHttps(patch.coordinateSource?.crosscheckUrl);
         if (!/^https:\/\/82rg\.com\/nearby\/restaurant\/\d+$/.test(locationUrl) || !/^https:\/\/xju\.purpleo\.kr\/article\/\d+$/.test(crosscheckUrl)) continue;
         if (!restaurant.guides?.some(guide => guide.provider === 'post-office' && guide.sourceUrl.includes('kphi.koreapost.go.kr/'))) continue;
         restaurant.lat = patch.lat; restaurant.lng = patch.lng;
         restaurant.coordinateSource = { name: text(patch.coordinateSource?.name, 140), url: locationUrl, crosscheckUrl, method: text(patch.coordinateSource?.method, 120), checkedAt: validDate(patch.coordinateSource?.checkedAt) };
       }
      // Slot 47: exact official VisitJeju restaurant name, address, published coordinates only.
      for (const patch of slot47Jeju.locationEnrichments) {
        const restaurant = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
        if (!restaurant || restaurant.region !== '제주' || restaurant.district !== '제주시' || restaurant.lat != null || restaurant.lng != null) continue;
        if (!Number.isFinite(patch.lat) || !Number.isFinite(patch.lng) || patch.lat < 33 || patch.lat > 34 || patch.lng < 126 || patch.lng > 127) continue;
        const officialUrl = safeHttps(patch.coordinateSource?.url);
        if (!/^https:\/\/www\.visitjeju\.net\/kr\/detail\/view\?contentsid=(?:CNTS_|CONT_)[A-Za-z0-9_]+(?:&.*)?$/.test(officialUrl)) continue;
        if (!restaurant.guides?.some(guide => guide.provider === 'blue-ribbon' || guide.provider === 'local-guide')) continue;
        restaurant.lat = patch.lat; restaurant.lng = patch.lng;
        restaurant.coordinateSource = { name: '제주관광공사 VisitJeju 공식 음식점 상세·지도', url: officialUrl, method: 'published-official-tourism-coordinate-exact-name-address', checkedAt: '2026-11-07' };
      }
      // Slot 48: published VisitJeju restaurant detail only; preserve saved ID, guides and original address.
      for (const patch of slot48Seogwipo.locationEnrichments) {
        const restaurant = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
        if (!restaurant || restaurant.region !== '제주' || restaurant.district !== '서귀포시' || restaurant.lat != null || restaurant.lng != null) continue;
        if (!Number.isFinite(patch.lat) || !Number.isFinite(patch.lng) || patch.lat < 33 || patch.lat > 34 || patch.lng < 126 || patch.lng > 127) continue;
        const officialUrl = safeHttps(patch.coordinateSource?.url);
        if (!/^https:\/\/www\.visitjeju\.net\/kr\/detail\/view\?contentsid=(?:CNTS_|CONT_)[A-Za-z0-9_]+(?:&.*)?$/.test(officialUrl)) continue;
        if (!restaurant.guides?.some(guide => guide.provider === 'blue-ribbon' || guide.provider === 'local-guide')) continue;
        restaurant.lat = patch.lat; restaurant.lng = patch.lng;
        restaurant.coordinateSource = { name: '제주관광공사 VisitJeju 공식 음식점 상세·지도', url: officialUrl, method: 'published-official-tourism-coordinate-exact-name-address', checkedAt: '2026-11-07' };
      }
      // Slot 57: preserve existing saved IDs and guide histories; add location only for an exact official match.
      for (const patch of slot57Jeju.locationEnrichments) {
        const restaurant = combined.find(row => row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress);
        if (!restaurant || restaurant.region !== '제주' || restaurant.district !== '제주시' || restaurant.lat != null || restaurant.lng != null) continue;
        if (!Number.isFinite(patch.lat) || !Number.isFinite(patch.lng) || patch.lat < 33 || patch.lat > 34 || patch.lng < 126 || patch.lng > 127) continue;
        const officialUrl = safeHttps(patch.coordinateSource?.url);
        if (!officialUrl.startsWith('https://www.visitjeju.net/kr/detail/view?contentsid=CNTS_')) continue;
        if (!restaurant.guides?.some(g => g.provider === 'blue-ribbon' || g.provider === 'local-guide')) continue;
        restaurant.lat = patch.lat; restaurant.lng = patch.lng;
        restaurant.coordinateSource = { name: '제주관광공사 VisitJeju 공식 음식점 상세·지도', url: officialUrl, method: 'published-official-tourism-coordinate-exact-name-address', checkedAt: '2026-11-08' };
      }
       const ids = new Set(); state.certified = combined.map(normalize).filter(item => item && !ids.has(item.id) && ids.add(item.id));
      state.collections = Array.isArray(data.collections) ? data.collections.filter(collection => collection && Object.hasOwn(PROVIDERS, collection.provider) && text(collection.title) && safeHttps(collection.url)).map(collection => ({ provider: collection.provider, title: text(collection.title, 160), url: safeHttps(collection.url), sourceUrl: safeHttps(collection.sourceUrl), sourceName: text(collection.sourceName, 160), note: text(collection.note, 400) })) : [];
      combineRestaurantSources();
      const localCount = state.certified.filter(item => item.guides.some(g => g.provider === 'local-guide')).length;
      const blueCount = state.certified.filter(item => item.guides.some(g => g.provider === 'blue-ribbon')).length;
      const mappedCount = state.certified.filter(item => typeof item.lat === 'number' && typeof item.lng === 'number' && Number.isFinite(item.lat) && Number.isFinite(item.lng)).length;
      const coverageNote = (data.coverageNote || '').replace(/블루리본 선정·공동선정·수록 이력 \d+곳/, '블루리본 선정·공동선정·수록 이력 ' + blueCount + '곳').replace(/지자체 지정·선정·공식 소개 \d+곳/, '지자체 지정·선정·공식 소개 ' + localCount + '곳').replace(/중복 제외 \d+곳/, '중복 제외 ' + state.certified.length + '곳').replace(/\d+곳은 지도에 표시할 수 있고/, mappedCount + '곳은 지도에 표시할 수 있고');
      $('coverage').textContent = text(coverageNote, 400) || '공식 출처로 확인한 일부 식당부터 제공합니다.';
      const newestDate = [data.updatedAt, supplement.updatedAt, seoul.updatedAt, northeast.updatedAt, southwest.updatedAt, southeast.updatedAt, incheon.updatedAt, incheonB.updatedAt, gyeonggi.updatedAt, seongnam.updatedAt, goyangPaju.updatedAt, bucheonGimpo.updatedAt, gyeonggiSlot12.updatedAt, gyeonggiSlot13.updatedAt, guriSlot15.updatedAt, slot17.updatedAt, slot18.updatedAt, slot19.updatedAt, slot20.updatedAt, slot21.updatedAt, slot23.updatedAt, slot25.updatedAt, slot26.updatedAt, slot27.updatedAt, slot28.updatedAt, slot30.updatedAt, slot32.updatedAt, slot33.updatedAt, slot34.updatedAt, slot36.updatedAt, slot37.updatedAt, slot38.updatedAt, slot41Map.updatedAt, slot44.updatedAt, slot45Locations.updatedAt, slot47Jeju.updatedAt, slot48Seogwipo.updatedAt, slot49Gyeonggi.updatedAt, slot50Gangwon.updatedAt, slot51Chungbuk.updatedAt, slot52Chungnam.updatedAt, slot55Gyeongbuk.updatedAt, slot56Gyeongnam.updatedAt, slot57Jeju.updatedAt, slot69.updatedAt].filter(validDate).sort().at(-1);
      $('updated').textContent = newestDate ? '자료 갱신 ' + dateLabel(newestDate) : '';
      state.loading = false; announce(''); render(true);
      if (combined.length !== state.certified.length) announce('출처를 확인할 수 있는 가게부터 표시했어요. 일부 자료는 확인 중이에요.');
      void loadRecommendations();
    } catch (error) {
      if (controller !== loadController) return;
      state.loading = false; state.loadError = true; $('result-count').textContent = '자료 연결 확인 중';
      const failure = el('div', 'data-error'); failure.append(el('h2', '', '맛집 정보를 불러오지 못했어요'), el('p', '', '인터넷 연결을 확인한 뒤 다시 눌러 주세요.'));
      const retry = el('button', '', '다시 불러오기'); retry.type = 'button'; retry.addEventListener('click', loadData); failure.append(retry); $('cards').replaceChildren(failure);
      announce('맛집 정보 연결이 지연되고 있어요. 목록에서 다시 불러올 수 있어요.', true); setView('list');
    } finally { clearTimeout(timeout); }
  }
  function setLocationStatus(message, chooseRegion = true, quiet = false) {
    $('location-status').textContent = message;
    $('location-bar').hidden = !message;
    $('location-bar').classList.toggle('sr-only', quiet);
    $('choose-region').hidden = !chooseRegion;
  }
  function readLocationChoice() {
    for (const name of ['localStorage', 'sessionStorage']) {
      try { const value = window[name].getItem(LOCATION_CHOICE_KEY); if (['asked', 'denied', 'enabled'].includes(value)) return value; } catch {}
    }
    return '';
  }
  function saveLocationChoice(value) {
    // Store only the prompt choice; never store the user's coordinates.
    for (const name of ['localStorage', 'sessionStorage']) { try { window[name].setItem(LOCATION_CHOICE_KEY, value); return; } catch {} }
  }
  function finishLocationRequest() {
    $('nearby').disabled = false; $('nearby').removeAttribute('aria-busy');
    $('nearby').setAttribute('aria-pressed', String(!!state.position)); $('nearby-label').textContent = '내 위치';
  }
  function requestLocation(centerMap = false) {
    if (!navigator.geolocation) { setLocationStatus('위치를 사용할 수 없어 맛집 목록을 보여드려요.'); return; }
    const request = ++locationRequest;
    saveLocationChoice('asked');
    $('nearby').disabled = true; $('nearby').setAttribute('aria-busy', 'true'); $('nearby-label').textContent = '확인 중';
    setLocationStatus('내 위치를 확인하고 있어요.', false, true);
    const failed = error => {
      if (request !== locationRequest) return;
      if (error?.code === 1) {
        saveLocationChoice('denied'); state.position = null;
        if (userMarker) { userMarker.remove(); userMarker = null; }
      }
      finishLocationRequest(); render(true);
      setLocationStatus(state.position ? '위치를 갱신하지 못해 이전 위치 기준으로 표시해요.' : error?.code === 1 ? '위치 사용이 허용되지 않아 맛집 목록을 보여드려요.' : '위치를 확인하지 못해 맛집 목록을 보여드려요.');
    };
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (request !== locationRequest) return;
        const point = { lat: position.coords?.latitude, lng: position.coords?.longitude };
        if (!hasCoordinates(point)) { failed({ code: 2 }); return; }
        state.position = point; saveLocationChoice('enabled'); finishLocationRequest();
        if (!state.sortChosen) state.sort = 'distance';
        render(true);
        if (centerMap && map && mapIsVisible()) requestAnimationFrame(() => { if (request === locationRequest && mapIsVisible()) map.setView([point.lat, point.lng], 14, { animate: !reducedMotion.matches }); });
      }, failed, { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 });
    } catch { failed({ code: 2 }); }
  }
  async function locateOnEntry() {
    const requestBeforeCheck = locationRequest;
    let permission = '';
    try { if (navigator.permissions?.query) permission = (await navigator.permissions.query({ name: 'geolocation' })).state; } catch {}
    if (requestBeforeCheck !== locationRequest) return;
    if (permission === 'denied') { saveLocationChoice('denied'); setLocationStatus('위치 사용이 꺼져 있어요. 지역을 선택해 주세요.', false, true); return; }
    const choice = readLocationChoice();
    if (permission === 'granted' || !choice || choice === 'enabled') requestLocation();
    else setLocationStatus('내 위치를 누르면 가까운 맛집을 보여드려요.', false, true);
  }

  readSaved(); setView(readView()); syncSortControls();
  $('guide-recommended').hidden = !memberRecommendations;
  if (embedded) $('back-link').hidden = true;
  $('detail').addEventListener('close', disposeRatingEditor);
  window.addEventListener('pagehide', () => {
    disposeRatingEditor();
    ratingEpoch++; sortRequest++;
    recommendationLoad++; cancelRecommendationRequests();
    state.recommended = []; state.restaurants = state.certified;
    document.querySelectorAll('[data-kind="recommended"]').forEach(node => node.remove());
    markers.forEach((marker, id) => { if (id.startsWith('recommended-')) { marker.remove(); markers.delete(id); } });
    ratingRequests.forEach(pending => { clearTimeout(pending.timer); pending.reject(new Error('화면을 닫았어요.')); });
    ratingRequests.clear(); ratingCache.clear(); ratingVersions.clear(); ratingLoads.clear();
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    if (memberRecommendations) { render(false); void loadRecommendations(); }
    if (!memberRatings) return;
    const shown = new Set([...document.querySelectorAll('[data-rating-id]')].map(node => {
      ratingUI.renderSummary(node, undefined); return node.dataset.ratingId;
    }));
    const items = state.restaurants.filter(item => shown.has(item.id));
    if (state.sort === 'popular') render(false);
    else void loadCardRatings(items);
    const selected = state.restaurants.find(item => item.id === state.selected);
    if ($('detail').open && selected) showDetail(selected);
  });
  if (embedded && entryParams.get('member-menu') === '1' && window.parent !== window) {
    $('recommendations-link')?.addEventListener('click', event => {
      if (event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      try {
        window.parent.postMessage({ type: 'ojjuda:restaurants:recommendations' }, location.origin);
        event.preventDefault();
      } catch { /* The canonical top-level link remains available if messaging fails. */ }
    });
  }
  document.querySelector('.skip-link').addEventListener('click', () => setView('list', true));
  $('search-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); state.query = $('search').value; render(true); });
  $('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.query = $('search').value; render(true); }, 130); });
  $('region').addEventListener('change', () => { state.region = $('region').value; render(true); });
  $('sort-order').addEventListener('change', () => {
    const sort = $('sort-order').value;
    if (!['distance', 'name', 'popular', 'recent'].includes(sort) || (sort === 'popular' && !memberRatings)) { syncSortControls(); return; }
    state.sort = sort; state.sortChosen = true; render(true);
    if (sort === 'distance' && !state.position) requestLocation();
  });
  $('retry-sort').addEventListener('click', () => render(true));
  $('retry-recommendations').addEventListener('click', () => { $('recommendations-error').hidden = true; void loadRecommendations(); });
  $('category').addEventListener('change', () => { state.category = CATEGORIES.includes($('category').value) ? $('category').value : ''; render(true); });
  $('guides').addEventListener('click', event => { const button = event.target.closest('[data-guide]'); if (!button) return; state.guide = button.dataset.guide; render(true); });
  $('saved-only').addEventListener('click', () => { state.savedOnly = !state.savedOnly; render(true); });
  $('filter-toggle').addEventListener('click', () => { const open = $('filter-options').hidden; $('filter-options').hidden = !open; $('filter-toggle').setAttribute('aria-expanded', String(open)); });
  $('choose-region').addEventListener('click', () => $('region').focus({ preventScroll: false }));
  $('load-more').addEventListener('click', () => renderCards(true));
  $('map-prev').addEventListener('click', () => changeMapPage(-1));
  $('map-next').addEventListener('click', () => changeMapPage(1));
  $('reset').addEventListener('click', resetFilters);
  $('nearby').addEventListener('click', () => { state.sort = 'distance'; state.sortChosen = true; render(true); requestLocation(true); });
  $('map-expand').addEventListener('click', toggleMapExpansion);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('map-panel').classList.contains('is-expanded') && !$('detail').open) {
      event.preventDefault(); toggleMapExpansion();
    }
  });
  $('show-map').addEventListener('click', () => setView('map', true)); $('show-list').addEventListener('click', () => setView('list', true));
  $('close-detail').addEventListener('click', () => $('detail').close());
  $('detail').addEventListener('click', event => { if (event.target === $('detail')) { const rect = $('detail').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('detail').close(); } });
  $('retry-map').addEventListener('click', () => { $('map-message').hidden = true; if (map) loadMapBackground(true); else location.reload(); });
  const resize = () => { if (mapIsVisible()) syncMap(false); };
  if (mobile.addEventListener) mobile.addEventListener('change', resize); else mobile.addListener(resize);
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { readSaved(); render(false); if ($('detail').open && state.selected) { const item = state.restaurants.find(r => r.id === state.selected); if (item) document.querySelectorAll('[data-save-id]').forEach(button => { if (button.dataset.saveId === item.id) updateSaveButton(button, item); }); } } });
  window.addEventListener('pagehide', () => { locationRequest++; clearTimeout(searchTimer); clearTimeout(backgroundTimer); });
  loadData(); void locateOnEntry();
})();
