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
  let rows = [], index = 0, thread = null, sample = false, feedRun = 0, autoRun = 0;
  let battery = null, charging = false, weather = null, speed = null, speedUntil = 0;
  let weatherHint = '날씨 · 위치 필요', permission, autoPaused = false;
  const dist = band => {
    if (band === '근처') return '1km 이내';
    return typeof band === 'string' && /^[1-9]\d{0,4}km$/.test(band) ? band + ' 이내' : '거리 미확인';
  };
  const brief = value => {
    const chars = Array.from(value.replace(/\s+/g, ' ').trim());
    return chars.length > 16 ? chars.slice(0, 15).join('') + '…' : chars.join('');
  };
  function model() {
    const now = Date.now();
    const cards = rows.slice(index, index + 2).map((row, offset) => ({
      body: row.body, oneLine: brief(row.body), distance: row.distance, id: row.id,
      index: index + offset + 1, count: rows.length
    }));
    let reader = null;
    if (thread && cards[0]) {
      const t = thread, reply = t.items[t.at-1];
      const label = t.error ? '다시 시도 ↓' : t.total === null ? '답카드 확인 중' :
        t.total ? '답카드 ' + t.total + '개 ↓' : '답카드 없음';
      reader = {title:reply ? '답카드 ' + t.at + '/' + t.total + (t.error ? ' · 다시 시도 ↓' : '') : '원글 · '+label,
        body:reply?.body ?? cards[0].body, distance:reply?.distance ?? cards[0].distance,
        prev:t.at>0, next:t.at<t.items.length || (!t.busy && (!!t.next || t.error))};
    }
    return {time:clock.format(now), battery, charging, speed:now<speedUntil ? speed : null,
      weather:weather && weather.expiresAt>now ? weather.text : weatherHint,
      cards, card:cards[0] || null, expanded:!!reader, reader, sample};
  }
  function render() {
    const view = model();
    byId('glass-sample').textContent = sample ? '예시 닫기' : '예시 보기';
    byId('glass-signin').hidden = owner !== null;
    byId('glass-clock').textContent = view.time;
    byId('glass-battery').textContent = (battery == null ? '—' : battery) + '%' + (charging ? ' ⚡' : '');
    byId('glass-weather').textContent = view.weather;
    byId('glass-speed').textContent = (view.speed ?? '—') + ' km/h';
    buttons.forEach((button,n) => {
      const slot = n ? 'second' : 'first', card = view.cards[n];
      byId('glass-'+slot+'-body').textContent = card?.oneLine ?? (n ? '—' : '근처 공원 카드');
      byId('glass-'+slot+'-distance').textContent = card?.distance ?? '';
      button.disabled = !card;
    });
    buttons[0].parentElement.hidden = view.expanded;
    const full = byId('glass-full');
    full.hidden = !view.expanded;
    byId('glass-reader-heading').textContent = view.reader?.title ?? '';
    const body = byId('glass-reader-body'), text = view.reader?.body ?? '';
    if (body.textContent !== text) { body.textContent = text; body.scrollTop = 0; }
    byId('glass-reader-distance').textContent = view.reader?.distance ?? '';
    byId('glass-prev').disabled = view.reader ? !view.reader.prev : !index;
    byId('glass-next').disabled = view.reader ? !view.reader.next : index >= rows.length-1;
    byId('glass-prev').textContent = thread?.at === 1 ? '원글' : '이전';
    byId('glass-next').textContent = thread?.error ? '다시 시도' : (thread?.at === 0 && view.reader.next ? '답카드 보기' : '다음');
    window.dispatchEvent(new CustomEvent('ojjuda:glasses-view', {detail:view}));
  }
  function closeThread() { thread?.controller.abort(); thread = null; }
  function setCards(data, message = '') {
    const old = rows[index]?.id;
    const keepPosition = !!thread || index > 0;
    rows = (Array.isArray(data) ? data : []).filter(row =>
      row && typeof row.body === 'string' && row.body.trim() && !row.tags?.includes('19금') &&
      (!row.kind || row.kind === 'memo')
    ).map(row => ({id:row.id, body:row.body, distance:dist(row.distance_band)}));
    index = keepPosition ? Math.max(0,rows.findIndex(row=>row.id===old)) : 0;
    if (!old || rows[index]?.id !== old) closeThread();
    status.textContent = message;
    render();
  }
  async function readReplies(t, advance=false) {
    if (t.busy) return;
    t.busy = true; t.error = false; render();
    try {
      let result;
      if (sample) {
        const items = t.id==='sample-0' ? [
          {id:'sample-r1',body:'저도 이 길을 좋아해요.',distance_band:'근처'},
          {id:'sample-r2',body:'다음엔 저도 걸어볼게요.',distance_band:'3km'}] : [];
        result = {items,total:items.length,next:null};
      } else {
        const {data,error} = await db.schema('ojjuda_note').rpc('glasses_replies',{
          p_parent:t.id,p_lat:t.fix.latitude,p_lon:t.fix.longitude,p_after:t.next,p_snapshot:t.snapshot
        }).abortSignal(t.controller.signal);
        if (error) throw error;
        result = data;
      }
      if (thread !== t || owner !== t.owner) return;
      if (!result) {
        rows.splice(index,1); index=Math.max(0,Math.min(index,rows.length-1)); closeThread();
        status.textContent='이제 볼 수 없는 카드예요.'; return;
      }
      const seen = new Set(t.items.map(row=>row.id));
      for (const row of result.items) if (row.body && !seen.has(row.id)) {
        t.items.push({id:row.id,body:row.body,distance:dist(row.distance_band)}); seen.add(row.id);
      }
      t.total = Math.max(t.items.length,result.total); t.next = result.next; t.snapshot = result.snapshot;
      if (advance && t.at<t.items.length) ++t.at;
    } catch { if (thread===t) t.error=true; }
    finally { t.busy=false; if (thread===t || !thread) render(); }
  }
  function move(delta) {
    if (thread) {
      const t=thread;
      if (delta<0) t.at=Math.max(0,t.at-1);
      else if (t.at<t.items.length) ++t.at;
      else if (t.next || t.error) { void readReplies(t,true); return; }
    } else index=Math.max(0,Math.min(rows.length-1,index+Math.sign(delta)));
    render();
  }
  function select(offset = 0) {
    if (thread) { closeThread(); render(); byId('glass-first').focus({preventScroll:true}); return; }
    if (!rows[index+offset] || (!sample && !tracking?.fix)) return;
    index+=offset;
    thread={id:rows[index].id,owner,fix:tracking?.fix,controller:new AbortController(),items:[],
      at:0,total:null,next:null,snapshot:null,busy:false,error:false};
    void readReplies(thread);
    byId('glass-full').focus({preventScroll:true});
  }
  function setBattery(level, isCharging = false) {
    battery = Number.isFinite(level) && level >= 0 && level <= 100 ? Math.round(level) : null;
    charging = isCharging === true;
    render();
  }
  async function loadCards(position, expected) {
    if (!db || !position || tracking !== expected) return;
    const run = ++feedRun;
    try {
      const cards=[], snapshot=new Date().toISOString();
      for (let offset=0; offset<=5000 && cards.length<30; offset+=30) {
        const {data,error}=await db.schema('ojjuda_note').rpc('list_cards',{
          p_sort:'nearby', p_lat:position.latitude, p_lon:position.longitude,
          p_radius_m:30000, p_limit:30, p_cursor:{offset,snapshot}
        }).abortSignal(expected.controller.signal);
        if (run!==feedRun || expected!==tracking) return;
        if (error) throw error;
        cards.push(...(data || []).filter(row=>row.kind==='memo'));
        if (!data || data.length<30) break;
      }
      setCards(cards.slice(0,30),'가까운 순');
      if (!rows.length) status.textContent = '30km 이내에 공개 카드가 없어요.';
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
    weatherHint = owner === null ? '날씨 · 로그인 필요' : '날씨 · 위치 필요';
    locate.textContent = '내 위치로 보기'; locate.disabled = false;
    render();
  }
  async function loadWeather(fix, active) {
    let grid = service.weatherCell(fix);
    // Some G2 fixes omit accuracy. Use an already-permitted browser grid when available.
    if (!grid && active.native && !Number.isFinite(fix.accuracy) && service.readWeatherPosition) {
      if (active.gridFallbackPending || Date.now() < (active.gridFallbackRetry || 0)) return;
      active.gridFallbackPending=true; active.gridFallbackRetry=Date.now()+60000;
      try { grid=await service.readWeatherPosition({db,accountId:active.owner,signal:active.controller.signal}); }
      catch { /* Keep the accuracy/permission hint if neither source returns a grid. */ }
      finally { active.gridFallbackPending=false; }
      if (tracking!==active || active.lastFix>fix.capturedAt && active.grid) return;
    }
    if (!grid) {
      active.weatherRequest?.abort(); active.weatherRequest=null; active.grid=null; weather=null;
      weatherHint=Number.isFinite(fix.accuracy) && fix.accuracy<=5000 ? '국내 관측 지역 밖' : '날씨 · 위치 확인 중';
      return;
    }
    const key = grid.nx + ',' + grid.ny;
    if (active.grid === key && (active.weatherRequest || Date.now()<active.weatherRetry)) return;
    active.weatherRequest?.abort();
    const request = new AbortController();
    const abort = () => request.abort();
    active.controller.signal.addEventListener('abort',abort,{once:true});
    const timer = setTimeout(abort,12000);
    if (active.grid !== key) weather = null;
    active.grid=key; active.weatherRequest=request; active.weatherRetry=Date.now()+60000;
    weatherHint='날씨 확인 중';
    const current=()=>tracking===active && active.weatherRequest===request;
    try {
      await service.authorizePosition(db,active.owner,{weather:true,signal:request.signal});
      if (!current()) return;
      if (request.signal.aborted) throw Error('weather_timeout');
      const endpoint=new URL('/functions/v1/theme-weather',config.supabaseUrl);
      endpoint.search=new URLSearchParams({nx:grid.nx,ny:grid.ny});
      const response=await fetch(endpoint,{headers:{apikey:config.supabaseKey},signal:request.signal});
      if (!response.ok) throw Error('weather');
      const data=await response.json();
      if (!current()) return;
      if (data.source!=='kma' || !(data.expiresAt>Date.now()) || (!Number.isFinite(data.temperature)&&!data.label)) throw Error('weather');
      weather={text:[Number.isFinite(data.temperature) ? data.temperature+'°C' : '',data.label].filter(Boolean).join(' · '),expiresAt:data.expiresAt};
      active.weatherRetry=data.expiresAt; weatherHint='날씨 갱신 중';
    } catch(error) {
      if (current()) weatherHint=error?.code==='disabled'?'날씨 · 위치 사용 제한':'기상청 응답 대기';
    } finally {
      clearTimeout(timer); active.controller.signal.removeEventListener('abort',abort);
      if (current()) {active.weatherRequest=null; render();}
    }
  }
  function acceptFix(value, active) {
    if (tracking !== active || !active || document.hidden) return;
    const {latitude, longitude, accuracy, speed:meters} = value || {};
    const at = value?.capturedAt ?? value?.timestamp ?? Date.now();
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 ||
        Math.abs(longitude)>180 || !Number.isFinite(at) || Date.now()-at > 30000 || at > Date.now()+2000) return;
    if (active.lastFix && at < active.lastFix) return;
    active.lastFix = at;
    active.fix = {latitude,longitude};
    speed = Number.isFinite(meters) && meters >= 0 ? Math.round(meters * 36) / 10 : null;
    speedUntil = Math.min(at, Date.now()) + 15000;
    if (Date.now() >= active.nextFeed) {
      active.nextFeed = Date.now()+60000;
      void loadCards({latitude,longitude}, active);
    }
    void loadWeather({latitude,longitude,accuracy,capturedAt:at}, active);
    render();
  }
  async function beginLocation(automatic = false) {
    if (tracking) {
      if (!automatic) { autoPaused=true; resetFeed(); }
      return;
    }
    if (!owner || !db || !service) { status.textContent = '공원에 로그인한 뒤 위치를 켜 주세요.'; return; }
    autoPaused=false;
    const active = {owner,controller:new AbortController(),nextFeed:0};
    tracking = active; sample = false; ++feedRun; setCards([], '위치를 확인하고 있어요.');
    locate.textContent = '위치 끄기'; weatherHint='날씨 · 위치 확인 중'; render();
    const signal = active.controller.signal;
    try {
      const choice = await service.preference(db, owner, {refresh:true,signal});
      if (!choice.enabled) throw Error('공원 설정에서 위치를 켜 주세요.');
      await service.authorizePosition(db,owner,{park:true,signal});
      if (tracking !== active) return;
      if (hardware && !automatic) {
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

  function resetFeed() {
    ++autoRun; sample=false; stopTracking();
    setCards([],owner===null ? '공원 로그인 후 내 위치로 가까운 카드를 볼 수 있어요.' : '내 위치로 보기를 눌러 주세요.');
  }
  async function autoLocate() {
    const run=++autoRun, id=owner;
    if (!id || !service || sample || tracking || autoPaused || document.hidden) return;
    try {
      const allowed=await navigator.permissions?.query({name:'geolocation'});
      if (run!==autoRun || id!==owner || !allowed) return;
      if (permission!==allowed) {
        permission?.removeEventListener('change',permissionChanged);
        permission=allowed; allowed.addEventListener('change',permissionChanged);
      }
      if (allowed.state!=='granted') return;
      const choice=await service.preference(db,id,{refresh:true});
      if (run===autoRun && id===owner && !tracking && !sample && !document.hidden && choice.enabled && allowed.state==='granted') void beginLocation(true);
    } catch { /* Manual location also supports companion apps without a Permissions API. */ }
  }
  function permissionChanged() {
    if (permission?.state==='granted') { void autoLocate(); return; }
    if (tracking && !tracking.native) resetFeed();
  }
  byId('glass-sample').onclick = () => {
    if (sample) { resetFeed(); void autoLocate(); return; }
    ++autoRun; stopTracking(); sample=true;
    setCards(samples.map((body,i)=>({body,id:'sample-'+i,distance_band:['근처','2km','4km'][i]})), '예시 카드 · 가까운 순');
  };
  buttons.forEach((button,n) => {button.onclick=()=>select(n);});
  byId('glass-full').onclick = () => select();
  byId('glass-prev').onclick = () => move(-1);
  byId('glass-next').onclick = () => move(1);
  locate.onclick = () => { ++autoRun; return beginLocation(); };
  byId('glass-view').addEventListener('keydown', event => {
    if (['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
    else if (event.key === 'Escape' && thread) select();
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
        owner = id; autoPaused=false; resetFeed(); stopPreference(); stopPreference = () => {};
        // Wait until Supabase releases its auth lock.
        setTimeout(() => {
          if (owner !== id) return;
          if (id && service) stopPreference = service.observe(db,id,choice => {
            if (id === owner && tracking && !choice.enabled) resetFeed();
          });
          void autoLocate();
        }, 0);
      }).data.subscription;
    } catch { status.textContent = '공원에 연결하지 못했어요.'; }
  }
  async function connectG2() {
    const message = byId('g2-status');
    message.textContent = 'G2 연결을 기다리는 중…';
    const hint = setTimeout(() => { message.textContent = 'Even Realities 앱의 개발자 모드에서 QR을 열어 주세요.'; }, 10000);
    try {
      const {attachEvenG2} = await import('/park/even-g2.bundle.mjs?v=20261125-even-g2-replies1');
      hardware = await attachEvenG2(window.OJJUDA_GLASS_PREVIEW);
      byId('g2-setup').hidden = true;
      message.textContent = 'G2 화면을 열었어요.';
    } catch { message.textContent = 'G2 연결을 확인하고 Even Realities 앱에서 QR을 다시 스캔해 주세요.'; }
    finally { clearTimeout(hint); }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { ++autoRun; if (tracking) resetFeed(); }
    else void autoLocate();
  });
  window.addEventListener('pagehide', event => {
    ++autoRun; closeThread();
    if (tracking) resetFeed();
    if (!event.persisted) { clearInterval(timer); stopPreference(); permission?.removeEventListener('change',permissionChanged); subscription?.unsubscribe(); hardware?.dispose(); }
  });
  render(); void initFeed();
  if (new URL(location.href).searchParams.get('g2') === '1') void connectG2();
})();
