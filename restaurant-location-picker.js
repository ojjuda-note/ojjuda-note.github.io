/* A temporary map selection becomes an editor value only after confirmation. */
(function (global) {
  'use strict';

  const REGIONS = Object.freeze([
    ['서울', 37.5665, 126.978], ['경기', 37.2636, 127.0286], ['인천', 37.4563, 126.7052],
    ['강원', 37.8813, 127.73], ['충북', 36.6424, 127.489], ['충남', 36.8151, 127.1139],
    ['세종', 36.4801, 127.289], ['대전', 36.3504, 127.3845], ['전북', 35.8242, 127.1479],
    ['전남', 34.8118, 126.3922], ['광주', 35.1595, 126.8526], ['경북', 36.5684, 128.7294],
    ['경남', 35.2285, 128.6811], ['대구', 35.8714, 128.6014], ['울산', 35.5384, 129.3114],
    ['부산', 35.1796, 129.0756], ['제주', 33.4996, 126.5312]
  ]);
  const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  let active = null;
  const node = (tag, className, text, hook) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    if (hook) el.dataset.rlp = hook;
    return el;
  };
  const button = (text, className, hook) => {
    const el = node('button', className, text, hook); el.type = 'button'; return el;
  };
  function pointFrom(value) {
    if (!value || typeof value.latitude !== 'number' || typeof value.longitude !== 'number' || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) || Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) return null;
    return { latitude: value.latitude, longitude: value.longitude };
  }

  function open({ name = '', region = '', location = null, isCurrent = () => true } = {}) {
    const allowed = () => { try { return isCurrent() === true; } catch { return false; } };
    if (!allowed()) return { result: Promise.resolve(null), close() {} };
    active?.close();
    let resolveResult;
    const result = new Promise(resolve => { resolveResult = resolve; });
    let disposed = false, map = null, tiles = null, marker = null, observer = null, authTimer = null, tileTimer = null, resizeFrame = null;
    let picked = pointFrom(location), tilesReady = false, tileErrors = 0;
    const tileZooms = new WeakMap();
    const previousFocus = document.activeElement;
    const dialog = node('dialog', 'restaurant-location-dialog', undefined, 'dialog');
    dialog.setAttribute('aria-label', '지도에서 맛집 위치 선택');
    const header = node('header', 'rlp-header'), heading = node('div', 'rlp-heading');
    heading.append(node('h2', '', '지도에서 위치 선택'));
    if (typeof name === 'string' && name.trim()) heading.append(node('p', 'rlp-place-name', name.trim()));
    const dismiss = button('×', 'rlp-close', 'close'); dismiss.setAttribute('aria-label', '위치 선택 닫기');
    header.append(heading, dismiss);
    const main = node('div', 'rlp-main');
    main.append(node('p', 'rlp-help', '지도를 누르거나 핀을 옮겨 주세요. 주소는 작성 화면에서 적어 주세요.'));
    const toolbar = node('div', 'rlp-toolbar'), regionLabel = node('label', 'rlp-region');
    const regionSelect = node('select', 'rlp-region-select', undefined, 'region'); regionSelect.setAttribute('aria-label', '지도에서 지역 이동');
    const emptyRegion = node('option', '', '전국'); emptyRegion.value = ''; regionSelect.append(emptyRegion);
    for (const [label] of REGIONS) { const option = node('option', '', label); option.value = label; regionSelect.append(option); }
    const initialRegion = REGIONS.find(item => item[0] === region);
    regionSelect.value = initialRegion ? region : '';
    regionLabel.append(node('span', '', '지역'), regionSelect);
    const center = button('지도 가운데 선택', 'rlp-button rlp-center', 'center');
    toolbar.append(regionLabel, center);
    const mapNode = node('div', 'rlp-map', undefined, 'map'); mapNode.setAttribute('aria-label', '맛집 위치 지도');
    const mapStatus = node('p', 'rlp-map-status', '지도를 불러오는 중…', 'status'); mapStatus.setAttribute('role', 'status'); mapStatus.setAttribute('aria-live', 'polite');
    const retry = button('지도 다시 불러오기', 'rlp-retry', 'retry'); retry.hidden = true;
    main.append(toolbar, mapNode, mapStatus, retry);
    const footer = node('footer', 'rlp-footer'), selection = node('p', 'rlp-selection', undefined, 'selection');
    selection.setAttribute('aria-live', 'polite');
    const actions = node('div', 'rlp-actions'), cancel = button('취소', 'rlp-button rlp-cancel', 'cancel'), confirm = button('이 위치 선택', 'rlp-button rlp-confirm', 'confirm');
    actions.append(cancel, confirm); footer.append(selection, actions); dialog.append(header, main, footer);
    const controller = { result, close: () => finish(null) };
    active = controller;
    const current = () => !disposed && active === controller && allowed();
    function guard() { if (current()) return true; finish(null); return false; }
    function updateControls() {
      confirm.disabled = !current() || !map || !tilesReady || !picked;
      center.disabled = !current() || !map || !tilesReady;
      regionSelect.disabled = !current() || !map;
      selection.textContent = picked ? '위치를 골랐어요. 핀을 옮겨 조정할 수 있어요.' : '아직 위치를 고르지 않았어요.';
    }
    function finish(value) {
      if (disposed) return;
      const answer = value && current() ? pointFrom(value) : null;
      disposed = true;
      if (active === controller) active = null;
      clearInterval(authTimer); clearTimeout(tileTimer);
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      global.removeEventListener('resize', resizeMap);
      global.removeEventListener('pagehide', onPageHide);
      observer?.disconnect();
      if (tiles) { tiles.off('tileload', tileLoaded); tiles.off('tileerror', tileFailed); tiles.off('loading', tileLoading); tiles.off('load', tileComplete); tiles.off('tileunload', viewportChanged); }
      if (marker) marker.off('dragend', dragged);
      if (map) { map.off('click', clicked); map.off('moveend', viewportChanged); map.off('zoomend', viewportChanged); try { map.remove(); } catch {} map = null; }
      if (dialog.open) dialog.close(); dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      resolveResult(answer);
    }
    function resizeMap() {
      if (!guard() || !map) return;
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => { resizeFrame = null; if (current() && map) { map.invalidateSize({ pan: false }); viewportChanged(); } });
    }
    function visibleTilesReady() {
      if (!map || !tiles) return false;
      const bounds = mapNode.getBoundingClientRect(), zoom = Math.round(map.getZoom());
      if (bounds.width <= 0 || bounds.height <= 0) return false;
      return [...(tiles.getContainer()?.querySelectorAll('.leaflet-tile-loaded') || [])].some(tile => {
        if (tileZooms.get(tile) !== zoom) return false;
        const rect = tile.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.right > bounds.left && rect.left < bounds.right && rect.bottom > bounds.top && rect.top < bounds.bottom;
      });
    }
    function refreshTiles() {
      tilesReady = visibleTilesReady();
      if (tilesReady) {
        clearTimeout(tileTimer);
        const partial = tileErrors > 0 && !tiles.isLoading();
        mapStatus.textContent = partial ? '일부 지도가 보이지 않아요. 다시 불러올 수 있어요.' : '확대해서 가게 위치를 정확히 골라 주세요.';
        mapStatus.classList.toggle('rlp-error', partial); retry.hidden = !partial;
      }
      updateControls();
      return tilesReady;
    }
    function showMapError() {
      if (!current()) return;
      tilesReady = visibleTilesReady();
      mapStatus.textContent = tilesReady ? '일부 지도가 보이지 않아요. 다시 불러올 수 있어요.' : '지도를 불러오지 못했어요. 연결을 확인하고 다시 눌러 주세요.';
      mapStatus.classList.add('rlp-error'); retry.hidden = false; updateControls();
    }
    function waitForTiles() {
      clearTimeout(tileTimer);
      tileTimer = setTimeout(() => { if (current() && !tilesReady) showMapError(); }, 12000);
    }
    function tileLoading() {
      if (!current()) return;
      tileErrors = 0;
      if (!refreshTiles()) { mapStatus.textContent = '지도를 불러오는 중…'; mapStatus.classList.remove('rlp-error'); retry.hidden = true; waitForTiles(); }
    }
    function tileLoaded(event) {
      if (!guard()) return;
      if (event?.tile && Number.isFinite(event.coords?.z)) tileZooms.set(event.tile, event.coords.z);
      refreshTiles();
    }
    function tileFailed() {
      if (!guard()) return;
      tileErrors += 1;
      refreshTiles();
      if (tileErrors >= 3) showMapError();
    }
    function tileComplete() {
      if (!guard()) return;
      if (!refreshTiles() || tileErrors) showMapError();
    }
    function viewportChanged() {
      if (!guard() || !map || !tiles) return;
      if (!refreshTiles()) {
        if (!tiles.isLoading() && tileErrors) showMapError();
        else { mapStatus.textContent = '지도를 불러오는 중…'; mapStatus.classList.remove('rlp-error'); retry.hidden = true; waitForTiles(); }
      }
    }
    function clearPicked() {
      picked = null;
      if (marker) { marker.off('dragend', dragged); marker.remove(); marker = null; }
      updateControls();
    }
    function choose(latlng) {
      if (!guard() || !map) return;
      const point = pointFrom({ latitude: latlng?.lat, longitude: latlng?.lng });
      if (!point) return;
      picked = point;
      if (marker) marker.setLatLng([point.latitude, point.longitude]);
      else {
        const icon = global.L.divIcon({ className: 'rlp-marker', html: '<span class="rlp-pin" aria-hidden="true"></span>', iconSize: [32, 40], iconAnchor: [16, 40] });
        marker = global.L.marker([point.latitude, point.longitude], { icon, draggable: true, keyboard: true, title: '선택한 맛집 위치', alt: '선택한 맛집 위치' }).addTo(map);
        marker.on('dragend', dragged);
      }
      updateControls();
    }
    function clicked(event) { choose(event.latlng); }
    function dragged() { if (marker && guard()) choose(marker.getLatLng()); }
    function initMap() {
      if (!guard()) return;
      if (!global.L?.map || !global.L?.tileLayer || !global.L?.marker || !global.L?.divIcon) { showMapError(); return; }
      try {
        map = global.L.map(mapNode, { zoomControl: false, attributionControl: true, keyboard: true, scrollWheelZoom: true, minZoom: 5, maxZoom: 19 });
        global.L.control.zoom({ position: 'topright', zoomInTitle: '지도 확대', zoomOutTitle: '지도 축소' }).addTo(map);
        map.attributionControl.setPrefix(false);
        const start = picked ? [picked.latitude, picked.longitude] : initialRegion ? initialRegion.slice(1) : [36.2, 127.8];
        map.setView(start, picked ? 17 : initialRegion ? 12 : 7);
        map.on('click', clicked); map.on('moveend', viewportChanged); map.on('zoomend', viewportChanged);
        tiles = global.L.tileLayer(TILE_URL, {
          maxZoom: 19,
          attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a>'
        });
        tiles.on('tileload', tileLoaded); tiles.on('tileerror', tileFailed); tiles.on('loading', tileLoading); tiles.on('load', tileComplete); tiles.on('tileunload', viewportChanged); waitForTiles(); tiles.addTo(map);
        if (picked) choose({ lat: picked.latitude, lng: picked.longitude });
        if (typeof global.ResizeObserver === 'function') { observer = new global.ResizeObserver(resizeMap); observer.observe(mapNode); }
        updateControls(); resizeMap();
      } catch {
        if (tiles) { tiles.off('tileload', tileLoaded); tiles.off('tileerror', tileFailed); tiles.off('loading', tileLoading); tiles.off('load', tileComplete); tiles.off('tileunload', viewportChanged); tiles = null; }
        if (marker) { marker.off('dragend', dragged); marker = null; }
        if (map) { try { map.remove(); } catch {} map = null; }
        observer?.disconnect(); observer = null; tilesReady = false;
        showMapError();
      }
    }
    function onPageHide() { finish(null); }
    regionSelect.addEventListener('change', () => {
      if (!guard() || !map) return;
      const regionChoice = REGIONS.find(item => item[0] === regionSelect.value);
      clearPicked();
      map.setView(regionChoice ? regionChoice.slice(1) : [36.2, 127.8], regionChoice ? 12 : 7);
    });
    center.addEventListener('click', () => { if (guard() && map && refreshTiles()) choose(map.getCenter()); });
    confirm.addEventListener('click', () => { if (guard() && map && refreshTiles() && picked) finish(picked); });
    cancel.addEventListener('click', () => finish(null)); dismiss.addEventListener('click', () => finish(null));
    retry.addEventListener('click', () => {
      if (!guard()) return;
      tilesReady = false; tileErrors = 0; retry.hidden = true; mapStatus.classList.remove('rlp-error'); mapStatus.textContent = '지도를 불러오는 중…'; updateControls();
      if (map && tiles) { waitForTiles(); tiles.redraw(); } else initMap();
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    dialog.addEventListener('close', () => finish(null));
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) finish(null);
    });
    document.body.append(dialog);
    try { dialog.showModal(); } catch { finish(null); return controller; }
    global.addEventListener('resize', resizeMap); global.addEventListener('pagehide', onPageHide);
    authTimer = setInterval(() => { if (!dialog.isConnected || !current()) finish(null); }, 750);
    updateControls(); initMap(); dismiss.focus({ preventScroll: true });
    return controller;
  }

  global.OjjudaRestaurantLocationPicker = Object.freeze({ open });
})(window);
