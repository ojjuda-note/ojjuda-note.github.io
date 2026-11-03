/* Source-backed guide selections and locations, with separate member ratings. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const CATEGORIES = ['한식', '중식', '일식', '양식', '분식', '디저트', '기타'];
  const PROVIDERS = { michelin: '미쉐린', 'blue-ribbon': '블루리본', 'post-office': '우체국', 'local-guide': '지자체 지정' };
  const STORAGE_KEY = 'ojjuda-certified-restaurants-saved-v1';
  const LOCATION_CHOICE_KEY = 'ojjuda-certified-restaurants-location-v1';
  const VIEW_KEY = 'ojjuda-certified-restaurants-view-v1';
  const LIST_PAGE_SIZE = 50, MAP_PAGE_SIZE = 50;
  const MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const entryParams = new URLSearchParams(location.search);
  const embedded = entryParams.get('embedded') === '1';
  const ratingUI = window.OjjudaRestaurantRatings;
  const memberRatings = !!ratingUI && embedded && entryParams.get('member-ratings') === '1' && window.parent !== window;
  const ratingCache = new Map(), ratingRequests = new Map(), ratingVersions = new Map();
  let ratingSequence = 0, ratingEditor = null;
  const mobile = window.matchMedia('(max-width: 760px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { restaurants: [], collections: [], visible: [], renderedCount: 0, mapPage: 0, category: '', guide: '', region: '', query: '', savedOnly: false, saved: new Set(), selected: '', position: null, view: 'map', loading: true, loadError: false };
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
  function updateRating(summary) {
    if (!summary || !state.restaurants.some(item => item.id === summary.id)) return;
    ratingCache.set(summary.id, summary);
    document.querySelectorAll('[data-rating-id]').forEach(node => { if (node.dataset.ratingId === summary.id) ratingUI.renderSummary(node, summary); });
  }
  async function loadCardRatings(items) {
    if (!memberRatings) return;
    const ids = items.filter(item => !ratingCache.get(item.id)).map(item => item.id);
    if (!ids.length) return;
    const versions = new Map(ids.map(id => [id, ratingVersions.get(id) || 0]));
    try {
      const rows = await requestRating('summary', { ids });
      if (!Array.isArray(rows)) throw new Error('Invalid ratings');
      rows.forEach(row => { if (versions.get(row.id) === (ratingVersions.get(row.id) || 0)) updateRating(row); });
      const received = new Set(rows.map(row => row.id));
      ids.filter(id => !received.has(id)).forEach(id => {
        document.querySelectorAll('[data-rating-id]').forEach(node => { if (node.dataset.ratingId === id) ratingUI.renderSummary(node, null); });
      });
    } catch {
      document.querySelectorAll('[data-rating-id]').forEach(node => { if (ids.includes(node.dataset.ratingId) && !ratingCache.has(node.dataset.ratingId)) ratingUI.renderSummary(node, null); });
    }
  }
  function disposeRatingEditor() { ratingEditor?.dispose(); ratingEditor = null; }
  function safeHttps(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  }
  function text(value, limit = 300) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }
  function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : ''; }
  function sourceDate(value) { return /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value || '') ? value : ''; }
  function dateLabel(value) { return validDate(value) ? value.replaceAll('-', '.') : '미표기'; }
  function hasCoordinates(item) { return typeof item.lat === 'number' && typeof item.lng === 'number' && Number.isFinite(item.lat) && Number.isFinite(item.lng) && Math.abs(item.lat) <= 90 && Math.abs(item.lng) <= 180; }
  function normalize(item) {
    if (!item || !text(item.id) || !text(item.name) || !Array.isArray(item.guides)) return null;
    const guides = item.guides.filter(g => g && Object.hasOwn(PROVIDERS, g.provider) && safeHttps(g.sourceUrl)).map(g => ({ provider: g.provider, label: text(g.label, 80) || (g.provider === 'post-office' ? '추천' : '선정 이력'), year: Number.isInteger(g.year) && g.year >= 1900 && g.year <= 2200 ? g.year : null, yearType: ['edition', 'selection', 'publication', 'source', 'listing'].includes(g.yearType) ? g.yearType : '', sourceUrl: safeHttps(g.sourceUrl), sourceName: text(g.sourceName, 120) || PROVIDERS[g.provider] + (g.provider === 'post-office' ? ' 추천 자료' : ' 선정 출처'), verifiedAt: validDate(g.verifiedAt), sourceAsOf: sourceDate(g.sourceAsOf || item.sourceAsOf), sourceDateType: g.sourceDateType === 'official-page-last-modified' ? 'page-modified' : 'as-of', selectionCriteria: text(g.selectionCriteria, 300) }));
    if (!guides.length) return null;
    const result = { id: text(item.id, 120), name: text(item.name, 160), category: CATEGORIES.includes(item.category) ? item.category : '기타', region: text(item.region, 40) || '지역 미표기', district: text(item.district, 80), address: text(item.address, 300), lat: item.lat, lng: item.lng, menu: Array.isArray(item.menu) ? item.menu.map(v => text(v, 80)).filter(Boolean).slice(0, 8) : [], guides };
    const coordinateSource = item.coordinateSource;
    if (coordinateSource && text(coordinateSource.name) && safeHttps(coordinateSource.url)) result.coordinateSource = { name: text(coordinateSource.name, 160), url: safeHttps(coordinateSource.url), method: text(coordinateSource.method, 120), checkedAt: validDate(coordinateSource.checkedAt) };
    result.searchText = [result.name, result.category, result.region, result.district, result.address, ...result.menu].join(' ').normalize('NFKC').toLocaleLowerCase('ko');
    return result;
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
    const words = state.query.normalize('NFKC').toLocaleLowerCase('ko').trim().split(/\s+/).filter(Boolean);
    return state.restaurants.filter(item => {
      if (state.category && item.category !== state.category) return false;
      if (state.region && item.region !== state.region) return false;
      if (state.savedOnly && !state.saved.has(item.id)) return false;
      const providers = new Set(item.guides.map(g => g.provider));
      if (state.guide === 'both' && !(providers.has('michelin') && providers.has('blue-ribbon'))) return false;
      if (state.guide && state.guide !== 'both' && !providers.has(state.guide)) return false;
      return words.every(word => item.searchText.includes(word));
    }).sort((a, b) => {
      if (state.position) { const distance = (distanceKm(a) ?? Infinity) - (distanceKm(b) ?? Infinity); if (Number.isFinite(distance) && distance !== 0) return distance; if (distanceKm(a) === null && distanceKm(b) !== null) return 1; if (distanceKm(b) === null && distanceKm(a) !== null) return -1; }
      return a.name.localeCompare(b.name, 'ko');
    });
  }
  function updateResultCount() {
    if (state.loading || state.loadError) return;
    const total = state.visible.length, located = state.visible.filter(hasCoordinates).length;
    const mapped = state.visible.filter(item => markers.has(item.id)).length;
    const shown = el('span', 'result-shown', '현재 ' + state.renderedCount + '곳 표시');
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
    const firstUnknown = state.position ? state.visible.findIndex(item => !hasCoordinates(item)) : -1;
    state.visible.slice(start, end).forEach((item, offset) => {
      if (start + offset === firstUnknown) fragment.append(el('h2', 'list-section-title', '거리 정보 없는 식당 · 전국 목록'));
      const card = el('article', 'restaurant-card'); card.dataset.restaurantId = item.id; card.dataset.cuisine = item.category; card.classList.toggle('is-selected', state.selected === item.id);
      const main = el('button', 'card-main'); main.type = 'button'; main.setAttribute('aria-label', item.name + ' 상세 정보');
      const kicker = el('p', 'card-kicker'); kicker.append(el('span', 'card-category', item.category), el('span', '', [item.region, item.district].filter(Boolean).join(' · ')));
      const distance = distanceKm(item); if (distance !== null) kicker.append(el('span', 'distance', '직선 ' + distanceLabel(distance)));
      else if (state.position) kicker.append(el('span', 'distance-unknown', '거리 미확인'));
      main.append(kicker, el('h2', 'card-name', item.name));
      if (item.menu.length) main.append(el('p', 'card-menu', item.menu.slice(0, 2).join(' · ')));
      const badges = el('div', 'guide-badges'); item.guides.forEach(g => badges.append(badge(g, false))); main.append(badges);
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
    $('categories').querySelectorAll('[data-category]').forEach(button => { const active = button.dataset.category === state.category; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    $('guides').querySelectorAll('[data-guide]').forEach(button => { const active = button.dataset.guide === state.guide; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    $('saved-only').setAttribute('aria-pressed', String(state.savedOnly));
    const active = [state.region, state.guide === 'both' ? '미쉐린·블루리본 모두' : state.guide === 'post-office' ? '우체국 추천' : PROVIDERS[state.guide], state.savedOnly ? '저장한 곳' : ''].filter(Boolean);
    $('filter-summary').textContent = active.join(' · '); $('filter-summary').hidden = !active.length;
    $('filter-label').textContent = '가이드' + (state.guide ? ' 1' : '');
    $('list-label').textContent = state.position ? '내 위치에서 가까운 순' : '가게 이름순';
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
    if (state.selected && !state.visible.some(item => item.id === state.selected)) state.selected = '';
    const locatedCount = state.visible.filter(hasCoordinates).length;
    if (state.position) setLocationStatus(locatedCount ? '가까운 순 · 거리 미확인 식당은 뒤에 표시' : '이 조건의 식당은 거리 정보가 없어 맛집 목록으로 표시해요.', false);
    if (mobile.matches && !state.visible.some(hasCoordinates)) setView('list');
    syncPressed(); renderCollections(); renderCards(); syncMap(fit);
  }
  function pinIcon(number, selected) {
    return window.L.divIcon({ className: 'restaurant-pin' + (selected ? ' is-selected' : ''), html: '<div class="pin-core"><span>' + String(number) + '</span></div>', iconSize: [30, 37], iconAnchor: [15, 34], tooltipAnchor: [0, -30] });
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
        marker = window.L.marker([item.lat, item.lng], { icon: pinIcon(index + 1, state.selected === item.id), keyboard: true, title: item.name, alt: item.name });
        const tooltip = el('span', '', item.name); marker.bindTooltip(tooltip, { direction: 'top' });
        marker.on('click', () => selectRestaurant(item.id, true)); marker.addTo(map); markers.set(item.id, marker);
      } else marker.setIcon(pinIcon(index + 1, state.selected === item.id));
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
    located.forEach((restaurant, index) => { const marker = markers.get(restaurant.id); if (marker) { marker.setIcon(pinIcon(index + 1, restaurant.id === id)); marker.setZIndexOffset(restaurant.id === id ? 1000 : 0); } });
    if (map && hasCoordinates(item) && mapIsVisible()) { map.setView([item.lat, item.lng], Math.max(map.getZoom(), 16), { animate: !reducedMotion.matches }); }
    if (openDetail) showDetail(item);
  }
  function showDetail(item) {
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
      const checked = (guide.sourceAsOf ? (guide.sourceDateType === 'page-modified' ? '페이지 수정 ' : '자료 기준 ') + guide.sourceAsOf.replaceAll('-', '.') + ' · ' : '') + '출처 확인일 ' + dateLabel(guide.verifiedAt);
      row.append(heading);
      if (guide.selectionCriteria) row.append(el('p', 'source-criteria', guide.selectionCriteria));
      row.append(el('p', 'source-verified', checked), link(guide.sourceName + ' ↗', guide.sourceUrl, 'source-link')); sources.append(row);
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
      onChange: summary => { ratingVersions.set(item.id, (ratingVersions.get(item.id) || 0) + 1); updateRating(summary); }
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
      const response = await fetch('./restaurants.json?v=20261103-restaurants-regional1', { signal: controller.signal, cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json(); if (!data || !Array.isArray(data.restaurants)) throw new Error('Invalid dataset');
      const ids = new Set(); state.restaurants = data.restaurants.map(normalize).filter(item => item && !ids.has(item.id) && ids.add(item.id));
      state.collections = Array.isArray(data.collections) ? data.collections.filter(collection => collection && Object.hasOwn(PROVIDERS, collection.provider) && text(collection.title) && safeHttps(collection.url)).map(collection => ({ provider: collection.provider, title: text(collection.title, 160), url: safeHttps(collection.url), sourceUrl: safeHttps(collection.sourceUrl), sourceName: text(collection.sourceName, 160), note: text(collection.note, 400) })) : [];
      $('region').replaceChildren(new Option('전국', ''));
      [...new Set(state.restaurants.map(item => item.region))].sort((a, b) => a.localeCompare(b, 'ko')).forEach(region => $('region').append(new Option(region, region)));
      if (![...$('region').options].some(option => option.value === state.region)) state.region = ''; $('region').value = state.region;
      $('coverage').textContent = text(data.coverageNote, 400) || '공식 출처로 확인한 일부 식당부터 제공합니다.';
      $('updated').textContent = validDate(data.updatedAt) ? '자료 갱신 ' + dateLabel(data.updatedAt) : '';
      state.loading = false; announce(''); render(true);
      if (data.restaurants.length !== state.restaurants.length) announce('출처를 확인할 수 있는 가게부터 표시했어요. 일부 자료는 확인 중이에요.');
    } catch (error) {
      if (controller !== loadController) return;
      state.loading = false; state.loadError = true; $('result-count').textContent = '자료 연결 확인 중';
      const failure = el('div', 'data-error'); failure.append(el('h2', '', '맛집 정보를 불러오지 못했어요'), el('p', '', '인터넷 연결을 확인한 뒤 다시 눌러 주세요.'));
      const retry = el('button', '', '다시 불러오기'); retry.type = 'button'; retry.addEventListener('click', loadData); failure.append(retry); $('cards').replaceChildren(failure);
      announce('맛집 정보 연결이 지연되고 있어요. 목록에서 다시 불러올 수 있어요.', true); setView('list');
    } finally { clearTimeout(timeout); }
  }
  function setLocationStatus(message, chooseRegion = true) {
    $('location-status').textContent = message;
    $('location-bar').hidden = !message;
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
    $('nearby').setAttribute('aria-pressed', String(!!state.position)); $('nearby-label').textContent = '내 주변';
  }
  function requestLocation() {
    if (!navigator.geolocation) { setLocationStatus('위치를 사용할 수 없어 맛집 목록을 보여드려요.'); return; }
    const request = ++locationRequest;
    saveLocationChoice('asked');
    $('nearby').disabled = true; $('nearby').setAttribute('aria-busy', 'true'); $('nearby-label').textContent = '확인 중';
    setLocationStatus('내 위치를 확인하고 있어요.', false);
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
        setLocationStatus('가까운 순으로 보여드려요 · 거리는 직선거리예요.', false); render(true);
      }, failed, { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 });
    } catch { failed({ code: 2 }); }
  }
  async function locateOnEntry() {
    const requestBeforeCheck = locationRequest;
    let permission = '';
    try { if (navigator.permissions?.query) permission = (await navigator.permissions.query({ name: 'geolocation' })).state; } catch {}
    if (requestBeforeCheck !== locationRequest) return;
    if (permission === 'denied') { saveLocationChoice('denied'); setLocationStatus('위치 사용이 꺼져 있어요. 지역을 선택해 주세요.'); return; }
    const choice = readLocationChoice();
    if (permission === 'granted' || !choice || choice === 'enabled') requestLocation();
    else setLocationStatus('내 주변을 누르면 위치를 확인해 가까운 맛집을 보여드려요.');
  }

  readSaved(); setView(readView());
  if (embedded) $('back-link').hidden = true;
  $('detail').addEventListener('close', disposeRatingEditor);
  window.addEventListener('pagehide', () => {
    disposeRatingEditor();
    ratingRequests.forEach(pending => { clearTimeout(pending.timer); pending.reject(new Error('화면을 닫았어요.')); });
    ratingRequests.clear(); ratingCache.clear(); ratingVersions.clear();
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted || !memberRatings) return;
    const shown = new Set([...document.querySelectorAll('[data-rating-id]')].map(node => {
      ratingUI.renderSummary(node, undefined); return node.dataset.ratingId;
    }));
    const items = state.restaurants.filter(item => shown.has(item.id));
    void (async () => { for (let start = 0; start < items.length; start += LIST_PAGE_SIZE) await loadCardRatings(items.slice(start, start + LIST_PAGE_SIZE)); })();
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
  $('categories').addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (!button) return; state.category = button.dataset.category; render(true); });
  $('guides').addEventListener('click', event => { const button = event.target.closest('[data-guide]'); if (!button) return; state.guide = button.dataset.guide; render(true); });
  $('saved-only').addEventListener('click', () => { state.savedOnly = !state.savedOnly; render(true); });
  $('filter-toggle').addEventListener('click', () => { const open = $('filter-options').hidden; $('filter-options').hidden = !open; $('filter-toggle').setAttribute('aria-expanded', String(open)); });
  $('choose-region').addEventListener('click', () => $('region').focus({ preventScroll: false }));
  $('load-more').addEventListener('click', () => renderCards(true));
  $('map-prev').addEventListener('click', () => changeMapPage(-1));
  $('map-next').addEventListener('click', () => changeMapPage(1));
  $('reset').addEventListener('click', resetFilters); $('nearby').addEventListener('click', requestLocation);
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
