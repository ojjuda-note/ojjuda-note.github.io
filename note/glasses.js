(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const status = byId('glass-status');
  const locate = byId('glass-locate');
  const buttons = [byId('glass-first'), byId('glass-second')];
  const service = window.OjjudaLocation;
  const config = window.OJJUDA_CONFIG;
  const clock = new Intl.DateTimeFormat('ko-KR', {hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
  const samples = ['오늘은 조금 천천히 걸어도 괜찮아.', '길모퉁이에서 반가운 바람을 만났어요.', '이 길을 지나는 사람에게 작은 응원을 보내요.'];
  let db, owner, hardware, tracking, stopPreference = () => {};
  let rows = [], index = 0, expanded = false, sample = false, feedRun = 0;
  let battery = null, charging = false, weather = null, speed = null, speedUntil = 0;
  const brief = value => {
    const chars = Array.from(value.replace(/\s+/g, ' ').trim());
    return chars.length > 23 ? chars.slice(0, 22).join('') + '…' : chars.join('');
  };
  function model() {
    const now = Date.now();
    const cards = rows.slice(index, index + 2).map((row, offset) => ({
      body: row.body, oneLine: brief(row.body), distance: row.distance, id: row.id,
      index: index + offset + 1, count: rows.length
    }));
    return {time: clock.format(now), battery, charging, speed: now < speedUntil ? speed : null,
      weather: weather && weather.expiresAt > now ? weather.text : '—° · 날씨 —',
      cards, card: cards[0] || null, expanded, sample};
  }
  function render() {
    const view = model();
    byId('glass-sample').textContent = sample ? '최근 카드' : '예시 보기';
    byId('glass-clock').textContent = view.time;
    byId('glass-battery').textContent = (battery == null ? '—' : battery) + '%' + (charging ? ' ⚡' : '');
    byId('glass-weather').textContent = view.weather;
    byId('glass-speed').textContent = (view.speed ?? '—') + ' km/h';
    buttons.forEach((button, n) => {
      button.textContent = view.cards[n]?.oneLine || (n ? '—' : '표시할 카드가 없어요.');
      button.disabled = !view.cards[n];
    });
    buttons[0].parentElement.hidden = expanded;
    const full = byId('glass-full');
    full.hidden = !expanded;
    full.textContent = expanded ? view.card?.body || '' : '';
    byId('glass-prev').disabled = !index;
    byId('glass-next').disabled = index >= rows.length - 1;
    window.dispatchEvent(new CustomEvent('ojjuda:glasses-view', {detail:view}));
  }
  function setCards(data, message = '') {
    const old = rows[index]?.id;
    rows = (Array.isArray(data) ? data : []).filter(row =>
      row && typeof row.body === 'string' && row.body.trim() && !row.tags?.includes('19금') &&
      (!row.kind || row.kind === 'memo')
    ).map(row => ({id:row.id, body:row.body,
      distance: /^(근처|[1-9]\d{0,3}km)$/.test(row.distance_band || '') ? row.distance_band : ''}));
    index = Math.max(0, rows.findIndex(row => row.id === old));
    if (!old || rows[index]?.id !== old) expanded = false;
    status.textContent = message || (rows.length ? '' : '표시할 공원 카드가 없어요.');
    render();
  }
  function move(delta) {
    index = Math.max(0, Math.min(rows.length - 1, index + Math.sign(delta)));
    expanded = false;
    render();
  }
  function select(offset = 0) {
    if (!rows[index + offset]) return;
    index += offset; expanded = !expanded; render();
    byId(expanded ? 'glass-full' : 'glass-first').focus({preventScroll:true});
  }
  function setBattery(level, isCharging = false) {
    battery = Number.isFinite(level) && level >= 0 && level <= 100 ? Math.round(level) : null;
    charging = isCharging === true;
    render();
  }
  async function loadCards(position, expected = tracking) {
    if (!db) return;
    const run = ++feedRun;
    try {
      const {data,error} = await db.schema('ojjuda_note').rpc('list_cards', {
        p_sort:position ? 'nearby' : 'recent', p_lat:position?.latitude ?? null, p_lon:position?.longitude ?? null,
        p_radius_m:30000, p_limit:30, p_cursor:{offset:0}
      });
      if (run !== feedRun || expected !== tracking) return;
      if (error) throw error;
      setCards((data || []).filter(row => row.kind === 'memo'), position ? '가까운 공원 카드' : '최근 공원 카드');
      if (!rows.length) status.textContent = position ? '근처에 공개 카드가 없어요.' : '공개 카드가 없어요.';
    } catch {
      if (run === feedRun && expected === tracking) setCards([], '카드를 불러오지 못했어요. 다시 시도해 주세요.');
    }
  }
  function stopTracking() {
    const old = tracking;
    tracking = null; ++feedRun;
    old?.controller.abort();
    clearTimeout(old?.timer);
    if (old?.native) void hardware?.stopLocation().catch(() => {});
    weather = null; speed = null; speedUntil = 0;
    locate.textContent = '내 위치로 보기'; locate.disabled = false;
    render();
  }
  async function loadWeather(fix, active) {
    const grid = service.weatherCell(fix);
    if (!grid || active.weatherBusy) return;
    const key = grid.nx + ',' + grid.ny;
    if (active.grid !== key) weather = null;
    if (active.grid === key && Date.now() < active.weatherRetry) return;
    active.grid = key; active.weatherRetry = Date.now() + 60000; active.weatherBusy = true;
    try {
      await service.authorizePosition(db, active.owner, {weather:true, signal:active.controller.signal});
      if (tracking !== active) return;
      const endpoint = new URL('/functions/v1/theme-weather', config.supabaseUrl);
      endpoint.search = new URLSearchParams({nx:grid.nx, ny:grid.ny});
      const response = await fetch(endpoint, {headers:{apikey:config.supabaseKey}, signal:active.controller.signal});
      if (!response.ok) return;
      const data = await response.json();
      if (tracking !== active || data.source !== 'kma' || !(data.expiresAt > Date.now())) return;
      const temp = Number.isFinite(data.temperature) ? data.temperature + '°' : '—°';
      weather = {text:temp + ' · ' + (data.label || '날씨 —'), expiresAt:data.expiresAt};
      active.weatherRetry = data.expiresAt;
      render();
    } catch { /* The unavailable field remains empty. */ }
    finally { active.weatherBusy = false; }
  }
  function acceptFix(value, active) {
    if (tracking !== active || !active || document.hidden) return;
    const {latitude, longitude, accuracy, speed:meters} = value || {};
    const at = value?.capturedAt ?? value?.timestamp ?? Date.now();
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 ||
        Math.abs(longitude)>180 || !Number.isFinite(at) || Date.now()-at > 30000 || at > Date.now()+2000) return;
    if (active.lastFix && at < active.lastFix) return;
    active.lastFix = at;
    speed = Number.isFinite(meters) && meters >= 0 ? Math.round(meters * 36) / 10 : null;
    speedUntil = Math.min(at, Date.now()) + 15000;
    if (Date.now() >= active.nextFeed) {
      active.nextFeed = Date.now()+60000;
      void loadCards({latitude,longitude}, active);
    }
    void loadWeather({latitude,longitude,accuracy,capturedAt:at}, active);
    render();
  }
  async function beginLocation() {
    if (tracking) {
      stopTracking(); setCards([]); void loadCards(null); return;
    }
    if (!owner || !db || !service) { status.textContent = '공원에 로그인한 뒤 위치를 켜 주세요.'; return; }
    const active = {owner,controller:new AbortController(),nextFeed:0};
    tracking = active; sample = false; ++feedRun; setCards([], '위치를 확인하고 있어요.');
    locate.textContent = '위치 끄기';
    const signal = active.controller.signal;
    try {
      const choice = await service.preference(db, owner, {refresh:true,signal});
      if (!choice.enabled) throw Error('공원 설정에서 위치를 켜 주세요.');
      await service.authorizePosition(db,owner,{park:true,signal});
      if (tracking !== active) return;
      if (hardware) {
        active.native = true;
        await hardware.startLocation(fix => acceptFix(fix, active));
      } else {
        const read = async () => {
          const fix = await service.readPosition({db,accountId:active.owner,park:true,fresh:true,cache:false,signal});
          acceptFix(fix,active);
          if (tracking === active) active.timer = setTimeout(() => read().catch(fail), 8000);
        };
        await read();
      }
    } catch (error) { fail(error); }
    function fail(error) {
      if (tracking !== active) return;
      stopTracking(); setCards([], error?.message || '위치를 확인하지 못했어요. 다시 시도해 주세요.');
    }
  }

  function recent() {
    sample = false; stopTracking(); setCards([], '공원 카드를 불러오는 중…'); void loadCards(null);
  }
  byId('glass-sample').onclick = () => {
    if (sample) { recent(); return; }
    stopTracking(); sample = true;
    setCards(samples.map((body,i) => ({body,id:'sample-'+i})), '예시 카드');
  };
  buttons.forEach((button,n) => {button.onclick=()=>select(n);});
  byId('glass-full').onclick = () => select();
  byId('glass-prev').onclick = () => move(-1);
  byId('glass-next').onclick = () => move(1);
  locate.onclick = beginLocation;
  byId('glass-view').addEventListener('keydown', event => {
    if (['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
    else if (event.key === 'Escape' && expanded) select();
  });
  window.OJJUDA_GLASS_PREVIEW = Object.freeze({setBattery,setCards,move,select,getView:model,
    setLocation: fix => acceptFix(fix,tracking)});
  let lastTick = '';
  const timer = setInterval(() => {
    const v = model();
    const next = [v.time,v.speed,v.weather].join('|');
    if (next !== lastTick) { lastTick = next; render(); }
  }, 1000);
  let subscription;
  async function initFeed() {
    try {
      db = await window.OjjudaGetClient();
      subscription = db.auth.onAuthStateChange((_event,session) => {
        const id = session?.user && !session.user.is_anonymous ? session.user.id : null;
        if (owner === id) return;
        owner = id; stopPreference(); stopPreference = () => {};
        // Wait until Supabase releases its auth lock.
        setTimeout(() => {
          if (owner !== id) return;
          if (id && service) stopPreference = service.observe(db,id,choice => {
            if (id === owner && tracking && !choice.enabled) recent();
          });
          recent();
        }, 0);
      }).data.subscription;
    } catch { status.textContent = '공원에 연결하지 못했어요.'; }
  }
  async function connectG2() {
    const message = byId('g2-status');
    message.textContent = 'G2 연결을 기다리는 중…';
    const hint = setTimeout(() => { message.textContent = 'Even Realities 앱의 개발자 모드에서 QR을 열어 주세요.'; }, 10000);
    try {
      const {attachEvenG2} = await import('/park/even-g2.bundle.mjs?v=20261125-even-g2-hud1');
      hardware = await attachEvenG2(window.OJJUDA_GLASS_PREVIEW);
      byId('g2-setup').hidden = true;
      message.textContent = 'G2 화면을 열었어요.';
    } catch { message.textContent = 'G2 연결을 확인하고 Even Realities 앱에서 QR을 다시 스캔해 주세요.'; }
    finally { clearTimeout(hint); }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && tracking) recent(); });
  window.addEventListener('pagehide', event => {
    if (tracking) { stopTracking(); setCards([]); }
    if (!event.persisted) { clearInterval(timer); stopPreference(); subscription?.unsubscribe(); hardware?.dispose(); }
  });
  render(); void initFeed();
  if (new URL(location.href).searchParams.get('g2') === '1') void connectG2();
})();
