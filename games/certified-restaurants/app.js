/* Verified restaurant directory. Ratings and locations come only from the source dataset. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const CATEGORIES = ['한식', '중식', '일식', '양식', '분식', '디저트', '기타'];
  const PROVIDERS = { michelin: '미쉐린', 'blue-ribbon': '블루리본', 'post-office': '우체국' };
  const STORAGE_KEY = 'ojjuda-certified-restaurants-saved-v1';
  const mobile = window.matchMedia('(max-width: 700px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const state = { restaurants: [], collections: [], visible: [], category: '', guide: '', region: '', query: '', savedOnly: false, saved: new Set(), selected: '', position: null, view: 'list', loading: true, loadError: false };
  let map = null, backgroundLayer = null, backgroundController = null, markers = new Map(), userMarker = null, searchTimer = null, storageWarned = false, loadController = null, locationRequest = 0;
  const bookmarkSvg = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 3h10v14l-5-3-5 3V3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function safeHttps(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  }
  function text(value, limit = 300) { return typeof value === 'string' ? value.trim().slice(0, limit) : ''; }
  function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value : ''; }
  function sourceDate(value) { return /^\d{4}-\d{2}(?:-\d{2})?$/.test(value || '') ? value : ''; }
  function dateLabel(value) { return validDate(value) ? value.replaceAll('-', '.') : '미표기'; }
  function hasCoordinates(item) { return typeof item.lat === 'number' && typeof item.lng === 'number' && Number.isFinite(item.lat) && Number.isFinite(item.lng) && Math.abs(item.lat) <= 90 && Math.abs(item.lng) <= 180; }
  function normalize(item) {
    if (!item || !text(item.id) || !text(item.name) || !Array.isArray(item.guides)) return null;
    const guides = item.guides.filter(g => g && Object.hasOwn(PROVIDERS, g.provider) && safeHttps(g.sourceUrl)).map(g => ({ provider: g.provider, label: text(g.label, 80) || (g.provider === 'post-office' ? '추천' : '선정 이력'), year: Number.isInteger(g.year) && g.year >= 1900 && g.year <= 2200 ? g.year : null, sourceUrl: safeHttps(g.sourceUrl), sourceName: text(g.sourceName, 120) || PROVIDERS[g.provider] + (g.provider === 'post-office' ? ' 추천 자료' : ' 선정 출처'), verifiedAt: validDate(g.verifiedAt), sourceAsOf: sourceDate(g.sourceAsOf || item.sourceAsOf) }));
    if (!guides.length) return null;
    const result = { id: text(item.id, 120), name: text(item.name, 160), category: CATEGORIES.includes(item.category) ? item.category : '기타', region: text(item.region, 40) || '지역 미표기', district: text(item.district, 80), address: text(item.address, 300), lat: item.lat, lng: item.lng, menu: Array.isArray(item.menu) ? item.menu.map(v => text(v, 80)).filter(Boolean).slice(0, 8) : [], guides };
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
  function badge(guide, includeYear = true) {
    const year = includeYear && guide.year ? ' · ' + guide.year : '';
    return el('span', 'guide-badge ' + (guide.provider === 'michelin' ? 'is-michelin' : guide.provider === 'post-office' ? 'is-post-office' : 'is-ribbon'), PROVIDERS[guide.provider] + ' ' + guide.label + year);
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
  function renderCards() {
    const container = $('cards'); container.replaceChildren();
    if (!state.visible.length) {
      const empty = el('div', 'empty-state'); empty.append(el('div', 'empty-symbol', '⌕'), el('h2', '', state.savedOnly ? '저장한 맛집이 없어요' : '조건에 맞는 맛집이 없어요'), el('p', '', state.savedOnly ? '가게의 책갈피를 눌러 모아보세요.' : '다른 음식 종류나 지역으로 찾아보세요.'));
      const reset = el('button', '', '필터 초기화'); reset.type = 'button'; reset.addEventListener('click', resetFilters); empty.append(reset); container.append(empty); return;
    }
    const fragment = document.createDocumentFragment();
    state.visible.forEach((item, index) => {
      const card = el('article', 'restaurant-card'); card.dataset.restaurantId = item.id; card.classList.toggle('is-selected', state.selected === item.id);
      const main = el('button', 'card-main'); main.type = 'button'; main.setAttribute('aria-label', item.name + ' 상세 정보');
      const kicker = el('p', 'card-kicker'); kicker.append(el('span', '', [item.region, item.district, item.category].filter(Boolean).join(' · ')));
      const distance = distanceKm(item); if (distance !== null) kicker.append(el('span', 'distance', '직선 ' + distanceLabel(distance)));
      main.append(el('h2', 'card-name', item.name), kicker);
      if (item.menu.length) main.append(el('p', 'card-menu', item.menu.slice(0, 2).join(' · ')));
      const badges = el('div', 'guide-badges'); item.guides.forEach(g => badges.append(badge(g, false))); main.append(badges);
      main.addEventListener('click', () => selectRestaurant(item.id, true)); card.append(main, saveButton(item)); fragment.append(card);
    });
    container.append(fragment);
  }
  function syncPressed() {
    $('categories').querySelectorAll('[data-category]').forEach(button => { const active = button.dataset.category === state.category; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    $('guides').querySelectorAll('[data-guide]').forEach(button => { const active = button.dataset.guide === state.guide; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    $('saved-only').setAttribute('aria-pressed', String(state.savedOnly));
    const active = [state.region, state.guide === 'both' ? '미쉐린·블루리본 모두' : state.guide === 'post-office' ? '우체국 추천' : PROVIDERS[state.guide], state.savedOnly ? '저장한 곳' : '', state.position ? '가까운 순' : ''].filter(Boolean);
    $('filter-summary').textContent = active.join(' · '); $('filter-summary').hidden = !active.length;
    $('filter-label').textContent = '필터' + (active.length ? ' ' + active.length : '');
  }
  function renderCollections() {
    const section = $('collections'), sources = $('collection-sources');
    section.replaceChildren(); sources.replaceChildren();
    const relevant = state.collections.filter(collection => !state.guide || collection.provider === state.guide);
    section.hidden = !relevant.length;
    section.classList.toggle('is-featured', !!state.guide);
    relevant.forEach(collection => section.append(link(collection.title + ' ↗', collection.url, 'collection-title')));
    state.collections.forEach(collection => { if (collection.sourceUrl) sources.append(link('우체국 추천 자료 출처 ↗', collection.sourceUrl, 'collection-source')); });
  }
  function render(fit = true) {
    if (state.loading || state.loadError) return;
    state.visible = filteredRestaurants();
    if (state.selected && !state.visible.some(item => item.id === state.selected)) state.selected = '';
    $('result-count').replaceChildren(el('strong', '', String(state.visible.length)), document.createTextNode('곳' + (state.position ? ' · 가까운 순' : '')));
    if (mobile.matches && !state.visible.some(hasCoordinates)) setView('list');
    syncPressed(); renderCollections(); renderCards(); syncMap(fit);
  }
  function pinIcon(number, selected) {
    return window.L.divIcon({ className: 'restaurant-pin' + (selected ? ' is-selected' : ''), html: '<div class="pin-core"><span>' + String(number) + '</span></div>', iconSize: [30, 37], iconAnchor: [15, 34], tooltipAnchor: [0, -30] });
  }
  function mapIsVisible() { return state.view === 'map'; }
  function showMapMessage(message, retry = true) { $('map-message-text').textContent = message; $('map-message').hidden = false; $('retry-map').hidden = !retry; }
  async function loadMapBackground() {
    if (backgroundController) backgroundController.abort();
    const controller = new AbortController(); backgroundController = controller;
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch('./korea-provinces.json', { signal: controller.signal, cache: 'force-cache' });
      if (!response.ok) throw new Error('Map background unavailable');
      const data = await response.json();
      if (controller !== backgroundController) return;
      if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw new Error('Invalid map background');
      if (backgroundLayer) backgroundLayer.remove();
      backgroundLayer = window.L.geoJSON(data, { interactive: false, style: { color: '#c3d0c7', weight: 1, fillColor: '#f8faf5', fillOpacity: 1 } }).addTo(map);
      backgroundLayer.bringToBack();
      $('map-message').hidden = true;
    } catch (error) {
      if (controller === backgroundController) showMapMessage('지역 지도를 불러오지 못했어요. 가게 정보의 지도 링크를 이용해 주세요.');
    } finally { clearTimeout(timeout); }
  }
  function ensureMap() {
    if (map) return true;
    if (!mapIsVisible()) return false;
    if (!window.L) { $('map').replaceChildren(el('div', 'map-loading', '가게 정보에서 네이버·카카오맵을 열 수 있어요.')); showMapMessage('지도를 불러오지 못했어요.'); return false; }
    $('map').replaceChildren();
    map = window.L.map('map', { zoomControl: false, attributionControl: true, scrollWheelZoom: false, maxBounds: [[30, 120], [41, 136]], minZoom: 5, maxZoom: 12, preferCanvas: true }).setView([36.2, 127.8], 7);
    window.L.control.zoom({ position: 'topright' }).addTo(map);
    map.attributionControl?.addAttribution('<a href="https://github.com/southkorea/southkorea-maps" target="_blank" rel="noopener noreferrer">KOSTAT · 2018 경계</a>');
    void loadMapBackground();
    return true;
  }
  function syncMap(fit) {
    if (!mapIsVisible() || !ensureMap()) return;
    const located = state.visible.filter(hasCoordinates), ids = new Set(located.map(item => item.id));
    markers.forEach((marker, id) => { if (!ids.has(id)) { marker.remove(); markers.delete(id); } });
    located.forEach((item, index) => {
      let marker = markers.get(item.id);
      if (!marker) {
        marker = window.L.marker([item.lat, item.lng], { icon: pinIcon(index + 1, state.selected === item.id), keyboard: true, title: item.name, alt: item.name });
        const tooltip = el('span', '', item.name); marker.bindTooltip(tooltip, { direction: 'top' });
        marker.on('click', () => selectRestaurant(item.id, true)); marker.addTo(map); markers.set(item.id, marker);
      } else marker.setIcon(pinIcon(index + 1, state.selected === item.id));
    });
    if (state.position) {
      if (!userMarker) userMarker = window.L.marker([state.position.lat, state.position.lng], { icon: window.L.divIcon({ className: 'user-pin', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }), title: '내 위치', alt: '내 위치' }).bindTooltip('내 위치').addTo(map);
      else userMarker.setLatLng([state.position.lat, state.position.lng]);
    }
    const missing = state.visible.length - located.length;
    $('map-caption-text').textContent = located.length ? '지역 개요도 · ' + located.length + '곳 표시' + (missing ? ' · ' + missing + '곳은 가게별 지도 링크' : '') : (state.visible.length ? '위치 정보는 목록의 지도 링크에서 확인하세요.' : '조건에 맞는 위치가 없어요.');
    requestAnimationFrame(() => {
      if (!mapIsVisible()) return;
      map.invalidateSize({ animate: false });
      if (!fit) return;
      if (state.position && located.length) {
        map.fitBounds([[state.position.lat, state.position.lng], [located[0].lat, located[0].lng]], { padding: [65, 65], maxZoom: 10, animate: false });
      } else if (located.length === 1) map.setView([located[0].lat, located[0].lng], 10, { animate: false });
      else if (located.length > 1) map.fitBounds(located.map(item => [item.lat, item.lng]), { paddingTopLeft: [35, 60], paddingBottomRight: [35, 35], maxZoom: 10, animate: false });
    });
  }
  function selectRestaurant(id, openDetail) {
    const item = state.restaurants.find(r => r.id === id); if (!item) return;
    state.selected = id;
    document.querySelectorAll('[data-restaurant-id]').forEach(card => card.classList.toggle('is-selected', card.dataset.restaurantId === id));
    const located = state.visible.filter(hasCoordinates);
    located.forEach((restaurant, index) => { const marker = markers.get(restaurant.id); if (marker) { marker.setIcon(pinIcon(index + 1, restaurant.id === id)); marker.setZIndexOffset(restaurant.id === id ? 1000 : 0); } });
    if (map && hasCoordinates(item) && mapIsVisible()) { map.setView([item.lat, item.lng], Math.max(map.getZoom(), 10), { animate: !reducedMotion.matches }); }
    if (openDetail) showDetail(item);
  }
  function showDetail(item) {
    const content = $('detail-content'); content.replaceChildren();
    content.append(el('p', 'detail-kicker', [item.region, item.district, item.category].filter(Boolean).join(' · ')));
    const titleRow = el('div', 'detail-title-row'), title = el('h2', '', item.name); title.id = 'detail-title'; titleRow.append(title, saveButton(item, true)); content.append(titleRow);
    if (item.menu.length) content.append(el('p', 'detail-menu', item.menu.join(' · ')));
    const address = el('div', 'detail-address'); address.append(el('span', 'detail-address-label', '주소'), document.createTextNode(item.address || '출처에서 주소를 확인해 주세요.')); content.append(address);
    if (!hasCoordinates(item)) content.append(el('p', 'coord-note', '네이버·카카오맵에서 위치 확인'));
    content.append(el('h3', 'detail-section-label', '선정·추천 정보와 출처'));
    const sources = el('ul', 'source-list');
    item.guides.forEach(guide => {
      const yearSuffix = guide.provider === 'post-office' ? '년 발행' : guide.provider === 'blue-ribbon' ? '년판' : '년 선정';
      const missingYear = guide.provider === 'post-office' ? '발행 연도 미확인' : guide.provider === 'blue-ribbon' ? '판본 연도 미확인' : '선정 연도 미확인';
      const row = el('li', 'source-item'), heading = el('div', 'source-heading'); heading.append(badge(guide, false), el('span', 'source-year', guide.year ? guide.year + yearSuffix : missingYear));
      const checked = (guide.sourceAsOf ? '자료 기준 ' + guide.sourceAsOf.replaceAll('-', '.') + ' · ' : '') + '출처 확인일 ' + dateLabel(guide.verifiedAt);
      row.append(heading, el('p', 'source-verified', checked), link(guide.sourceName + ' ↗', guide.sourceUrl, 'source-link')); sources.append(row);
    });
    content.append(sources, el('p', 'detail-note', '선정·추천 당시와 현재 영업 상태는 다를 수 있어요. 메뉴·가격·영업시간은 방문 전 가게에서 확인해 주세요.'));
    const query = encodeURIComponent([item.name, item.address].filter(Boolean).join(' ')), links = el('div', 'detail-links');
    links.append(link('네이버지도 ↗', 'https://map.naver.com/p/search/' + query), link('카카오맵 ↗', 'https://map.kakao.com/link/search/' + query));
    const route = hasCoordinates(item) ? 'https://map.kakao.com/link/to/' + encodeURIComponent(item.name) + ',' + item.lat + ',' + item.lng : 'https://map.kakao.com/link/search/' + query;
    links.append(link(hasCoordinates(item) ? '길찾기 ↗' : '주소로 길찾기 검색 ↗', route, 'route-link')); content.append(links);
    if (!$('detail').open) $('detail').showModal();
    $('close-detail').focus({ preventScroll: true });
  }
  function setView(view) {
    state.view = view; $('workspace').dataset.view = view;
    $('show-map').setAttribute('aria-pressed', String(view === 'map')); $('show-list').setAttribute('aria-pressed', String(view === 'list'));
    if (view === 'map') syncMap(true);
  }
  function resetFilters() {
    clearTimeout(searchTimer); locationRequest++; $('nearby').disabled = false; $('nearby').removeAttribute('aria-busy'); state.category = ''; state.guide = ''; state.region = ''; state.query = ''; state.savedOnly = false; state.position = null; state.selected = '';
    $('search').value = ''; $('region').value = '';
    if (userMarker) { userMarker.remove(); userMarker = null; }
    announce(''); render(true);
  }
  async function loadData() {
    if (loadController) loadController.abort(); loadController = new AbortController();
    const controller = loadController; state.loading = true; state.loadError = false;
    $('result-count').textContent = '맛집을 불러오는 중…';
    const loading = el('div', 'loading-state'); loading.append(el('span', 'loading-ring'), el('p', '', '확인된 맛집을 불러오고 있어요.')); $('cards').replaceChildren(loading);
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch('./restaurants.json', { signal: controller.signal, cache: 'no-cache' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json(); if (!data || !Array.isArray(data.restaurants)) throw new Error('Invalid dataset');
      const ids = new Set(); state.restaurants = data.restaurants.map(normalize).filter(item => item && !ids.has(item.id) && ids.add(item.id));
      state.collections = Array.isArray(data.collections) ? data.collections.filter(collection => collection && Object.hasOwn(PROVIDERS, collection.provider) && text(collection.title) && safeHttps(collection.url)).map(collection => ({ provider: collection.provider, title: text(collection.title, 160), url: safeHttps(collection.url), sourceUrl: safeHttps(collection.sourceUrl), note: text(collection.note, 400) })) : [];
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
  function requestLocation() {
    if (!navigator.geolocation) { announce('이 브라우저에서는 현재 위치를 사용할 수 없어요. 지역을 골라 찾아주세요.', true); return; }
    const request = ++locationRequest; const button = $('nearby'); button.disabled = true; button.setAttribute('aria-busy', 'true'); announce('현재 위치를 확인하고 있어요.');
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest) return;
      button.disabled = false; button.removeAttribute('aria-busy');
      state.position = { lat: position.coords.latitude, lng: position.coords.longitude };
      announce('선택한 조건 안에서 가까운 순으로 보여드려요. 거리는 직선거리예요.'); render(true);
    }, error => {
      if (request !== locationRequest) return;
      button.disabled = false; button.removeAttribute('aria-busy');
      announce(error.code === 1 ? '위치 사용이 허용되지 않았어요. 지역을 골라 계속 찾아볼 수 있어요.' : '현재 위치를 확인하지 못했어요. 잠시 뒤 다시 누르거나 지역을 골라 주세요.', true);
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 });
  }

  readSaved();
  if (new URLSearchParams(location.search).get('embedded') === '1') $('back-link').hidden = true;
  document.querySelector('.skip-link').addEventListener('click', () => setView('list'));
  $('search-form').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); state.query = $('search').value; render(true); });
  $('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.query = $('search').value; render(true); }, 130); });
  $('region').addEventListener('change', () => { state.region = $('region').value; render(true); });
  $('categories').addEventListener('click', event => { const button = event.target.closest('[data-category]'); if (!button) return; state.category = button.dataset.category; render(true); });
  $('guides').addEventListener('click', event => { const button = event.target.closest('[data-guide]'); if (!button) return; state.guide = button.dataset.guide; render(true); });
  $('saved-only').addEventListener('click', () => { state.savedOnly = !state.savedOnly; render(true); });
  $('filter-toggle').addEventListener('click', () => { const open = $('filter-options').hidden; $('filter-options').hidden = !open; $('filter-toggle').setAttribute('aria-expanded', String(open)); });
  $('reset').addEventListener('click', resetFilters); $('nearby').addEventListener('click', requestLocation);
  $('show-map').addEventListener('click', () => setView('map')); $('show-list').addEventListener('click', () => setView('list'));
  $('close-detail').addEventListener('click', () => $('detail').close());
  $('detail').addEventListener('click', event => { if (event.target === $('detail')) { const rect = $('detail').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('detail').close(); } });
  $('retry-map').addEventListener('click', () => { $('map-message').hidden = true; if (map) void loadMapBackground(); else location.reload(); });
  const resize = () => { if (mapIsVisible()) syncMap(false); };
  if (mobile.addEventListener) mobile.addEventListener('change', resize); else mobile.addListener(resize);
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { readSaved(); render(false); if ($('detail').open && state.selected) { const item = state.restaurants.find(r => r.id === state.selected); if (item) document.querySelectorAll('[data-save-id]').forEach(button => { if (button.dataset.saveId === item.id) updateSaveButton(button, item); }); } } });
  window.addEventListener('pagehide', () => { clearTimeout(searchTimer); if (backgroundController) backgroundController.abort(); });
  loadData();
})();
