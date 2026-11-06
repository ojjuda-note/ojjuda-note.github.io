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
  const REVERSE_URL = 'https://photon.komoot.io/reverse';
  const REGION_NAMES = Object.freeze({ 서울: '서울특별시', 경기: '경기도', 인천: '인천광역시', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도', 세종: '세종특별자치시', 대전: '대전광역시', 전북: '전북특별자치도', 전남: '전라남도', 광주: '광주광역시', 경북: '경상북도', 경남: '경상남도', 대구: '대구광역시', 울산: '울산광역시', 부산: '부산광역시', 제주: '제주특별자치도' });
  const REGION_ALIASES = Object.freeze({ 서울: ['서울시', 'Seoul'], 경기: ['Gyeonggi-do', 'Gyeonggi'], 인천: ['Incheon'], 강원: ['강원도', 'Gangwon-do', 'Gangwon'], 충북: ['Chungcheongbuk-do', 'North Chungcheong'], 충남: ['Chungcheongnam-do', 'South Chungcheong'], 세종: ['세종시', 'Sejong'], 대전: ['Daejeon'], 전북: ['전라북도', 'Jeollabuk-do', 'Jeonbuk', 'North Jeolla'], 전남: ['Jeollanam-do', 'South Jeolla'], 광주: ['Gwangju'], 경북: ['Gyeongsangbuk-do', 'North Gyeongsang'], 경남: ['Gyeongsangnam-do', 'South Gyeongsang'], 대구: ['Daegu'], 울산: ['Ulsan'], 부산: ['Busan'], 제주: ['제주도', 'Jeju-do', 'Jeju'] });
  const addressCache = new Map();
  let nextAddressRequest = 0;
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
  const cleanText = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 200) : '';
  function regionFrom(properties) {
    for (const value of [properties.state, properties.city, properties.county]) {
      const name = cleanText(value).toLocaleLowerCase();
      if (!name) continue;
      for (const [short, full] of Object.entries(REGION_NAMES)) if ([short, full, ...(REGION_ALIASES[short] || [])].some(alias => alias.toLocaleLowerCase() === name)) return short;
    }
    return '';
  }
  function addressFrom(data) {
    const properties = data?.features?.[0]?.properties;
    if (!properties || cleanText(properties.countrycode).toUpperCase() !== 'KR') return null;
    const region = regionFrom(properties), street = cleanText(properties.street), number = cleanText(properties.housenumber);
    const parts = region ? [REGION_NAMES[region]] : [];
    // Photon district can be a neighbourhood (e.g. 명동), not necessarily a 구.
    for (const value of [properties.city, properties.county, properties.district, properties.locality]) {
      const part = cleanText(value);
      if (!part || !/[시군구읍면]$/.test(part) || regionFrom({ state: part }) || parts.includes(part)) continue;
      parts.push(part);
    }
    if (street) { parts.push(street); if (number) parts.push(number); }
    const address = street ? parts.join(' ').slice(0, 200) : '';
    return region || address ? { region, address, partial: !street || !number } : null;
  }
  function reverseUrl(point) {
    const configured = global.OjjudaRestaurantMapConfig?.reverseGeocodeUrl;
    const url = new URL(typeof configured === 'string' ? configured : REVERSE_URL);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid_geocoder');
    url.searchParams.set('lat', String(point.latitude)); url.searchParams.set('lon', String(point.longitude));
    url.searchParams.set('radius', '0.1'); url.searchParams.set('limit', '1');
    // The public Photon server supports default/de/en/fr, not lang=ko. Default keeps Korean local names.
    url.searchParams.set('lang', 'default');
    return url.href;
  }

  function open({ name = '', region = '', location = null, isCurrent = () => true } = {}) {
    const allowed = () => { try { return isCurrent() === true; } catch { return false; } };
    if (!allowed()) return { result: Promise.resolve(null), close() {} };
    active?.close();
    let resolveResult;
    const result = new Promise(resolve => { resolveResult = resolve; });
    let disposed = false, map = null, tiles = null, marker = null, observer = null, authTimer = null, tileTimer = null, resizeFrame = null;
    let picked = pointFrom(location), tilesReady = false, tileErrors = 0;
    let addressInfo = null, addressBusy = false, addressFailed = false, addressRequest = 0, addressTimer = null, addressDeadline = null, addressController = null;
    let locating = false, locationRequest = 0, locationTimer = null;
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
    main.append(node('p', 'rlp-help', '지도를 누르거나 핀을 옮겨 주세요.'));
    const toolbar = node('div', 'rlp-toolbar'), regionLabel = node('label', 'rlp-region');
    const regionSelect = node('select', 'rlp-region-select', undefined, 'region'); regionSelect.setAttribute('aria-label', '지도에서 지역 이동');
    const emptyRegion = node('option', '', '전국'); emptyRegion.value = ''; regionSelect.append(emptyRegion);
    for (const [label] of REGIONS) { const option = node('option', '', label); option.value = label; regionSelect.append(option); }
    const initialRegion = REGIONS.find(item => item[0] === region);
    regionSelect.value = initialRegion ? region : '';
    regionLabel.append(node('span', '', '지역'), regionSelect);
    const center = button('내 위치', 'rlp-button rlp-center', 'center');
    toolbar.append(regionLabel, center);
    const locationStatus = node('p', 'rlp-location-status', '', 'location-status'); locationStatus.setAttribute('role', 'status'); locationStatus.hidden = true;
    const mapNode = node('div', 'rlp-map', undefined, 'map'); mapNode.setAttribute('aria-label', '맛집 위치 지도');
    const mapStatus = node('p', 'rlp-map-status', '지도를 불러오는 중…', 'status'); mapStatus.setAttribute('role', 'status'); mapStatus.setAttribute('aria-live', 'polite');
    const retry = button('지도 다시 불러오기', 'rlp-retry', 'retry'); retry.hidden = true;
    main.append(toolbar, locationStatus, mapNode, mapStatus, retry);
    const footer = node('footer', 'rlp-footer'), selection = node('p', 'rlp-selection', undefined, 'selection');
    selection.setAttribute('aria-live', 'polite');
    const actions = node('div', 'rlp-actions'), cancel = button('취소', 'rlp-button rlp-cancel', 'cancel'), confirm = button('이 위치 선택', 'rlp-button rlp-confirm', 'confirm');
    const retryAddress = button('주소 다시 찾기', 'rlp-retry', 'retry-address'); retryAddress.hidden = true;
    actions.append(cancel, confirm); footer.append(selection, retryAddress, actions); dialog.append(header, main, footer);
    const controller = { result, close: () => finish(null) };
    active = controller;
    const current = () => !disposed && active === controller && allowed();
    function guard() { if (current()) return true; finish(null); return false; }
    function updateControls() {
      confirm.disabled = !current() || !map || !tilesReady || !picked || addressBusy || locating;
      center.disabled = !current() || !map || !tilesReady || locating;
      center.textContent = locating ? '확인 중…' : '내 위치';
      if (locating) center.setAttribute('aria-busy', 'true'); else center.removeAttribute('aria-busy');
      regionSelect.disabled = !current() || !map;
      selection.textContent = !picked ? '아직 위치를 고르지 않았어요.' : addressBusy ? '지역과 주소를 확인하고 있어요…' : addressInfo?.address ? addressInfo.address + (addressInfo.partial ? ' · 상세 주소를 확인해 주세요.' : '') : addressFailed ? '주소를 찾지 못했어요. 작성 화면에서 직접 입력해 주세요.' : addressInfo?.region ? REGION_NAMES[addressInfo.region] + ' · 상세 주소는 직접 입력해 주세요.' : '위치를 골랐어요. 핀을 옮겨 조정할 수 있어요.';
      retryAddress.hidden = !picked || !addressFailed || addressBusy;
    }
    function finish(value) {
      if (disposed) return;
      const answer = value && current() ? pointFrom(value) : null;
      if (answer && addressInfo) { if (addressInfo.region) answer.region = addressInfo.region; if (addressInfo.address) answer.address = addressInfo.address; }
      disposed = true;
      if (active === controller) active = null;
      clearInterval(authTimer); clearTimeout(tileTimer); clearTimeout(locationTimer);
      locationRequest++; stopAddressLookup();
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
        mapStatus.textContent = partial ? '일부 지도가 보이지 않아요. 다시 불러올 수 있어요.' : '';
        mapStatus.hidden = !partial;
        mapStatus.classList.toggle('rlp-error', partial); retry.hidden = !partial;
      }
      updateControls();
      return tilesReady;
    }
    function showMapError() {
      if (!current()) return;
      tilesReady = visibleTilesReady();
      mapStatus.hidden = false;
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
      if (!refreshTiles()) { mapStatus.hidden = false; mapStatus.textContent = '지도를 불러오는 중…'; mapStatus.classList.remove('rlp-error'); retry.hidden = true; waitForTiles(); }
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
        else { mapStatus.hidden = false; mapStatus.textContent = '지도를 불러오는 중…'; mapStatus.classList.remove('rlp-error'); retry.hidden = true; waitForTiles(); }
      }
    }
    function clearPicked() {
      locationRequest++; locating = false; clearTimeout(locationTimer); locationStatus.hidden = true;
      stopAddressLookup(); addressInfo = null; addressFailed = false;
      picked = null;
      if (marker) { marker.off('dragend', dragged); marker.remove(); marker = null; }
      updateControls();
    }
    function stopAddressLookup() {
      addressRequest++; clearTimeout(addressTimer); clearTimeout(addressDeadline);
      addressController?.abort(); addressController = null; addressBusy = false;
    }
    function lookupAddress() {
      stopAddressLookup();
      if (!guard() || !picked) return;
      const point = { ...picked }, request = addressRequest;
      const key = point.latitude.toFixed(6) + ',' + point.longitude.toFixed(6), cached = addressCache.get(key);
      addressInfo = null; addressFailed = false;
      const apply = info => {
        if (!current() || request !== addressRequest) return;
        addressInfo = info; addressBusy = false; addressFailed = !info;
        if (info?.region) regionSelect.value = info.region;
        updateControls();
      };
      if (cached && cached.expires > Date.now()) { apply(cached.info); return; }
      addressBusy = true; updateControls();
      const run = async () => {
        if (!guard() || request !== addressRequest) return;
        if (Date.now() < nextAddressRequest) { addressTimer = setTimeout(run, nextAddressRequest - Date.now()); return; }
        nextAddressRequest = Date.now() + 1100;
        const controller = new AbortController(); addressController = controller;
        const deadline = setTimeout(() => controller.abort(), 8000); addressDeadline = deadline;
        try {
          const response = await fetch(reverseUrl(point), { signal: controller.signal, credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin', headers: { Accept: 'application/json' } });
          if (!response.ok) throw new Error('address_lookup_failed');
          const info = addressFrom(await response.json());
          if (!current() || request !== addressRequest) return;
          if (info) { addressCache.set(key, { info, expires: Date.now() + 15 * 60 * 1000 }); if (addressCache.size > 40) addressCache.delete(addressCache.keys().next().value); }
          apply(info);
        } catch { apply(null); }
        finally { clearTimeout(deadline); if (addressController === controller) addressController = null; }
      };
      addressTimer = setTimeout(run, Math.max(450, nextAddressRequest - Date.now()));
    }
    function choose(latlng, lookup = true) {
      if (!guard() || !map) return;
      const point = pointFrom({ latitude: latlng?.lat, longitude: latlng?.lng });
      if (!point) return;
      locationRequest++; locating = false; clearTimeout(locationTimer); locationStatus.hidden = true;
      picked = point;
      if (marker) marker.setLatLng([point.latitude, point.longitude]);
      else {
        const icon = global.L.divIcon({ className: 'rlp-marker', html: '<span class="rlp-pin" aria-hidden="true"></span>', iconSize: [32, 40], iconAnchor: [16, 40] });
        marker = global.L.marker([point.latitude, point.longitude], { icon, draggable: true, keyboard: true, title: '선택한 맛집 위치', alt: '선택한 맛집 위치' }).addTo(map);
        marker.on('dragend', dragged);
      }
      updateControls();
      if (lookup) lookupAddress();
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
        if (picked) choose({ lat: picked.latitude, lng: picked.longitude }, false);
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
    function onPageHide() { addressCache.clear(); finish(null); }
    regionSelect.addEventListener('change', () => {
      if (!guard() || !map) return;
      const regionChoice = REGIONS.find(item => item[0] === regionSelect.value);
      clearPicked();
      map.setView(regionChoice ? regionChoice.slice(1) : [36.2, 127.8], regionChoice ? 12 : 7);
    });
    center.addEventListener('click', () => {
      if (!guard() || !map || !refreshTiles() || locating) return;
      locationStatus.hidden = true;
      if (!navigator.geolocation) { locationStatus.textContent = '현재 위치를 사용할 수 없어요. 지도에서 골라 주세요.'; locationStatus.hidden = false; return; }
      const request = ++locationRequest; locating = true; updateControls();
      const failed = error => {
        if (!current() || request !== locationRequest) return;
        locationRequest++; locating = false; clearTimeout(locationTimer);
        locationStatus.textContent = error?.code === 1 ? '위치 권한을 허용하거나 지도에서 골라 주세요.' : '현재 위치를 확인하지 못했어요. 지도에서 골라 주세요.';
        locationStatus.hidden = false; updateControls();
      };
      locationTimer = setTimeout(() => failed({ code: 3 }), 12000);
      try {
        navigator.geolocation.getCurrentPosition(position => {
          if (!guard() || request !== locationRequest) return;
          const point = pointFrom({ latitude: position.coords?.latitude, longitude: position.coords?.longitude });
          if (!point) { failed({ code: 2 }); return; }
          map.setView([point.latitude, point.longitude], 17);
          choose({ lat: point.latitude, lng: point.longitude });
        }, failed, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
      } catch { failed({ code: 2 }); }
    });
    confirm.addEventListener('click', () => { if (guard() && map && refreshTiles() && picked && !addressBusy && !locating) finish(picked); });
    retryAddress.addEventListener('click', lookupAddress);
    cancel.addEventListener('click', () => finish(null)); dismiss.addEventListener('click', () => finish(null));
    retry.addEventListener('click', () => {
      if (!guard()) return;
      tilesReady = false; tileErrors = 0; retry.hidden = true; mapStatus.hidden = false; mapStatus.classList.remove('rlp-error'); mapStatus.textContent = '지도를 불러오는 중…'; updateControls();
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
