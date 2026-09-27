// Browser preview and a device adapter share only the display contract below.
// Coordinates remain in this closure and the POST RPC request; never put them
// in URLs, DOM attributes, logs, storage, or an event sent to the device.
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const view = $('glass-view');
  const cardPanel = $('glass-card');
  const expanded = $('glass-expanded');
  const idle = $('glass-idle');
  const status = $('glass-status');
  const prev = $('glass-prev');
  const next = $('glass-next');
  const locate = $('glass-locate');
  const config = window.OJJUDA_CONFIG;
  const client = config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
  const sampleCards = [
    { id: 'sample-1', body: '오늘은 조금 천천히 걸어도 괜찮아. 오래 보고 싶었던 풍경을 만났거든.', distance_band: '근처' },
    { id: 'sample-2', body: '길모퉁이에서 반가운 바람을 만났어요.\n좋은 하루가 되기를.', distance_band: '2km' },
    { id: 'sample-3', body: '이 길을 지나는 사람에게 작은 응원을 보냅니다.', distance_band: '4km' }
  ];
  let cards = [];
  let index = 0;
  let isExpanded = false;
  let batteryLevel = null;
  let loadVersion = 0;

  function validLocation(latitude, longitude) {
    return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
      && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
  }
  function safeDistanceLabel(value) {
    return typeof value === 'string' && /^(?:근처|[1-9]\d{0,3}km)$/.test(value) ? value : '';
  }
  function oneLine(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function updateClock() {
    $('glass-clock').textContent = new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date());
    emitView();
  }
  function setBattery(level) {
    // The browser's Battery API is the phone/computer battery, not necessarily
    // the glasses battery. Only a device adapter may supply this value.
    batteryLevel = Number.isFinite(level) && level >= 0 && level <= 100 ? Math.round(level) : null;
    $('glass-battery').textContent = batteryLevel === null ? '안경 배터리 —' : `안경 배터리 ${batteryLevel}%`;
    emitView();
  }
  function publicView() {
    const card = cards[index];
    return {
      time: $('glass-clock').textContent,
      battery: batteryLevel,
      card: card ? {
        id: card.id,
        index: index + 1,
        count: cards.length,
        oneLine: oneLine(card.body),
        body: card.body,
        distance: card.distance_band
      } : null,
      expanded: isExpanded
    };
  }
  function emitView() {
    if (!view) return;
    window.dispatchEvent(new CustomEvent('ojjuda:glasses-view', { detail: publicView() }));
  }
  function render() {
    const card = cards[index];
    cardPanel.hidden = !card || isExpanded;
    expanded.hidden = !card || !isExpanded;
    idle.hidden = !!card;
    if (!card && !idle.textContent) idle.textContent = '위치를 허용하면 근처 카드를 볼 수 있어요.';
    if (card) {
      const number = `${index + 1} / ${cards.length}`;
      const distance = card.distance_band;
      $('glass-number').textContent = number;
      $('glass-expanded-number').textContent = number;
      $('glass-distance').textContent = distance;
      $('glass-expanded-distance').textContent = distance;
      $('glass-line').textContent = oneLine(card.body);
      $('glass-full').textContent = card.body;
    }
    prev.disabled = !card || index === 0;
    next.disabled = !card || index >= cards.length - 1;
    emitView();
  }
  function setCards(rows, message = '') {
    // Keep only safe display fields, even if a future RPC gains new columns.
    cards = Array.isArray(rows) ? rows.map(row => ({
      id: typeof row.id === 'string' ? row.id : '',
      body: typeof row.body === 'string' ? row.body : '',
      distance_band: safeDistanceLabel(row.distance_band)
    })).filter(card => card.body && card.distance_band) : [];
    index = 0;
    isExpanded = false;
    status.textContent = cards.length
      ? (message || `가까운 카드 ${cards.length}개를 불러왔어요.`)
      : '30km 안에 공개 카드가 없어요.';
    idle.textContent = cards.length ? '' : '가까운 카드가 없어요.';
    render();
  }
  function move(delta) {
    if (!cards.length) return;
    index = Math.min(cards.length - 1, Math.max(0, index + Math.sign(delta)));
    isExpanded = false;
    render();
  }
  function select() {
    if (!cards.length) return;
    isExpanded = !isExpanded;
    render();
    (isExpanded ? $('glass-collapse') : $('glass-select')).focus({ preventScroll: true });
  }
  async function loadNearby(latitude, longitude) {
    if (!validLocation(latitude, longitude)) {
      status.textContent = '위치를 확인할 수 없어요.';
      return;
    }
    if (!client) {
      status.textContent = '노트 연결 설정을 확인해 주세요.';
      return;
    }
    const version = ++loadVersion;
    locate.disabled = true;
    cards = [];
    index = 0;
    isExpanded = false;
    idle.textContent = '가까운 카드를 불러오는 중이에요.';
    render();
    status.textContent = '가까운 카드를 불러오는 중이에요.';
    let result;
    try {
      // Isolated RPC boundary; adjust here if the final database contract changes.
      result = await client.schema('ojjuda_note').rpc('list_cards', {
        p_sort: 'nearby', p_lat: latitude, p_lon: longitude,
        p_radius_m: 30000, p_limit: 30, p_cursor: null
      });
    } catch (_) {
      result = { error: true };
    }
    if (version !== loadVersion) return;
    locate.disabled = false;
    if (result.error) {
      status.textContent = '가까운 카드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
      return;
    }
    setCards(result.data, '가까운 순서로 카드를 보여드려요.');
  }
  function requestLocation() {
    if (!navigator.geolocation) {
      status.textContent = '이 기기에서는 위치 기능을 사용할 수 없어요.';
      return;
    }
    const requestVersion = ++loadVersion;
    locate.disabled = true;
    status.textContent = '위치 허용을 기다리고 있어요.';
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (requestVersion !== loadVersion) return;
        locate.disabled = false;
        void loadNearby(coords.latitude, coords.longitude);
      },
      () => {
        if (requestVersion !== loadVersion) return;
        locate.disabled = false;
        status.textContent = '위치 허용 후 가까운 카드를 볼 수 있어요.';
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  locate.addEventListener('click', requestLocation);
  $('glass-sample').addEventListener('click', () => {
    ++loadVersion;
    locate.disabled = false;
    setCards(sampleCards, '예시 화면입니다. 실제 위치와 관계없는 샘플 카드예요.');
  });
  prev.addEventListener('click', () => move(-1));
  next.addEventListener('click', () => move(1));
  $('glass-select').addEventListener('click', select);
  $('glass-collapse').addEventListener('click', select);
  view.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'Escape' && isExpanded) { event.preventDefault(); select(); }
  });

  // A native companion adapter may call these functions; the view event and
  // getView return display text only, never raw coordinates or distance meters.
  window.OJJUDA_GLASS_PREVIEW = Object.freeze({
    setBattery,
    setLocation: ({ latitude, longitude }) => loadNearby(latitude, longitude),
    setCards,
    move,
    select,
    getView: publicView
  });
  updateClock();
  setInterval(updateClock, 30000);
  render();
})();
