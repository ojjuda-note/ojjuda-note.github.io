import {createG2Voice,readVoiceReply} from './glasses-voice.mjs?v=20261126-live1';
import {openLiveTurn} from './glasses-live.mjs?v=20261126-live1';
import {createG2Link} from './glasses-link.mjs?v=20261126-easylink1';
import {createSpeedMeter} from './rokid-agent/lib/speed.js?v=20261126-hud1';

(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const status = byId('glass-status');
  const locate = byId('glass-locate');
  const installed = !!document.documentElement?.dataset?.evenApp;
  const buttons = [byId('glass-first'), byId('glass-second')];
  const service = window.OjjudaLocation;
  const config = window.OJJUDA_CONFIG;
  const clock = new Intl.DateTimeFormat('ko-KR', {hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
  const samples = ['오늘은 조금 천천히 걸어도 괜찮아.', '길모퉁이에서 반가운 바람을 만났어요.', '이 길을 지나는 사람에게 작은 응원을 보내요.'];
  let db, owner, hardware, tracking, stopPreference = () => {};
  let rows = [], index = 0, thread = null, sample = false, feedRun = 0;
  let battery = null, charging = false, weather = null;
  let weatherHint = '날씨 · 현재 위치', permission, autoPaused = false;
  let source = 'recent', feedRequest;
  let paused = false;
  let pairRun=0, codeTimer, voiceDeviceGeneration=0;
  async function voiceRequest(payload,token,signal,onQuestion) {
    if (!config?.supabaseKey) throw Error('unavailable');
    const headers={'Content-Type':'application/json',apikey:config.supabaseKey};
    if(token) headers['x-park-device']=token;
    if(onQuestion) headers.Accept='application/x-ndjson';
    const res=await fetch(config.supabaseUrl+'/functions/v1/park-g2-voice',{method:'POST',headers,
      credentials:'omit',body:JSON.stringify(payload),signal});
    return readVoiceReply(res,onQuestion);
  }
  let holding=false;
  const voice=createG2Voice({microphone:on=>hardware?.microphone(on),changed:render,
    openTurn:options=>openLiveTurn({...options,url:config.supabaseUrl.replace(/^https:/,'wss:')+'/functions/v1/park-g2-voice'}),
    forgetToken:()=>{void hardware?.saveVoiceToken('').catch(()=>{});}});
  let tokenReady=false;
  const easyLink=createG2Link({
    load:()=>hardware.loadLinkRequest(), save:value=>hardware.saveLinkRequest(value),
    complete:async(proof,until)=>(await voiceRequest({action:'complete-link',until},proof,AbortSignal.timeout(10000))).linked===true,
    accept:async proof=>{
      if(voice.paired || !hardware) throw Error('changed');
      if(await hardware.saveVoiceToken(proof)===false) throw Error('storage');
      voice.setToken(proof);
      byId('glass-ai-link-status').textContent='';
      byId('g2-status').textContent='GPT 연결 완료 · 터치패드를 길게 눌러 ‘듣는 중’이 뜨면 말하세요.';
      render();
    },change:render
  });
  function cancelVoice(){holding=false;voice.reset();}
  function startVoice(){
    if(paused || document.hidden || !hardware) return;
    if(thread) closeThread();
    return voice.start();
  }
  function toggleVoice(){
    if(paused || document.hidden || !hardware) return;
    if(thread) closeThread();
    return voice.toggle();
  }
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
      const pageLabel=(t.depth>1 ? t.depth+'단계 ' : '')+'답카드 '+t.at+'/'+t.total;
      const current=reply || t.card;
      reader = {title:(reply ? pageLabel + (t.error ? ' · 다시 시도 ↓' : '') : (t.parent ? '답카드 · ' : '원글 · ')+label)
          + (reply?.hasReplies ? ' · 탭해 답 보기' : t.public && t.total>1 ? ' · 최신순' : ''),
        body:current.body, distance:current.distance, hasReplies:!!reply?.hasReplies,
        prev:t.at>0 || !!t.parent, next:t.at<t.items.length || (!t.busy && (!!t.next || t.error))};
    }
    return {time:clock.format(now), battery, charging, speed:tracking?.meter.read(now) ?? null,
      weather:weather && weather.expiresAt>now ? weather.text : weatherHint,
      voice:holding?'GPT\n계속 누르면 듣기 시작해요':voice.screen(), cards, card:cards[0] || null, expanded:!!reader, reader, sample, paused};
  }
  function render() {
    const view = model();
    const panel=byId('glass-ai');
    panel.hidden=!view.voice || view.expanded || paused;
    const listening=voice.phase==='listening';
    const conversation=holding?'계속 누르면 듣기 시작해요':voice.question?
      '내 질문 · '+voice.question+(listening?'':'\nGPT · '+voice.message):voice.message;
    const answer=byId('glass-ai-answer');
    if(answer.textContent!==conversation) {
      answer.textContent=conversation;
      answer.scrollTop=listening?answer.scrollHeight:0;
    }
    byId('glass-ai-heading').hidden=!!voice.question;
    const ask=byId('glass-ai-ask');
    ask.hidden=!hardware || !voice.paired; ask.disabled=voice.phase==='sending';
    ask.textContent=['starting','listening'].includes(voice.phase)?'질문 보내기':'GPT에 묻기';
    byId('glass-ai-pair').hidden=paused || !hardware || !tokenReady || voice.paired;
    const connect=byId('glass-ai-connect');
    if(easyLink.href) connect.href=easyLink.href;
    connect.hidden=!easyLink.href;
    byId('glass-ai-code-button').hidden=installed || !owner || paused;
    byId('glass-ai-unpair').hidden=!hardware || !voice.paired || paused;
    byId('glass-power').textContent = paused ? '화면 켜기' : '화면 끄기';
    byId('glass-view').hidden = paused;
    byId('glass-controls').hidden = paused;
    status.hidden = paused;
    byId('glass-sample').textContent = sample ? '예시 닫기' : '예시 보기';
    byId('glass-signin').hidden = owner !== null || !!document.documentElement?.dataset?.evenApp;
    locate.hidden = sample;
    byId('glass-clock').textContent = view.time;
    byId('glass-battery').textContent = (battery == null ? '—' : battery) + '%' + (charging ? ' ⚡' : '');
    byId('glass-weather').textContent = view.weather;
    byId('glass-speed').textContent = (view.speed ?? '—') + ' km/h';
    byId('glass-selected').hidden = !view.cards.length || view.expanded || view.paused;
    buttons.forEach((button,n) => {
      const slot = n ? 'second' : 'first', card = view.cards[n];
      byId('glass-'+slot+'-body').textContent = card?.oneLine ?? (n ? '—' : '공원 카드');
      byId('glass-'+slot+'-distance').textContent = card?.distance ?? '';
      button.disabled = !card;
    });
    buttons[0].parentElement.hidden = view.expanded;
    const full = byId('glass-full');
    full.hidden = !view.expanded;
    full.ariaLabel = view.reader?.hasReplies ? '달린 답카드 보기' : thread?.parent ? '상위 답카드로 돌아가기' : '본문 닫기';
    byId('glass-children').hidden = !view.reader?.hasReplies;
    byId('glass-back').hidden = !thread?.parent || thread.at<=1;
    byId('glass-reader-heading').textContent = view.reader?.title ?? '';
    const body = byId('glass-reader-body'), text = view.reader?.body ?? '';
    if (body.textContent !== text) { body.textContent = text; body.scrollTop = 0; }
    byId('glass-reader-distance').textContent = view.reader?.distance ?? '';
    byId('glass-prev').disabled = view.reader ? !view.reader.prev : !index;
    byId('glass-next').disabled = view.reader ? !view.reader.next : index >= rows.length-1;
    byId('glass-prev').textContent = thread?.parent && thread.at<=1 ? '상위 답카드' : thread?.at === 1 ? '원글' : '이전';
    byId('glass-next').textContent = thread?.error ? '다시 시도' : (thread?.at === 0 && view.reader.next ? '답카드 보기' : '다음');
    window.dispatchEvent(new CustomEvent('ojjuda:glasses-view', {detail:view}));
  }
  function closeThread() {
    while (thread) { thread.controller.abort(); thread=thread.parent; }
  }
  function back() {
    if (!thread) return;
    thread.controller.abort();
    thread=thread.parent;
    render();
    byId(thread ? 'glass-full' : 'glass-first').focus({preventScroll:true});
  }
  function setCards(data, message = '', order = 'recent') {
    if (source !== order) { closeThread(); index = 0; }
    source = order;
    const old = rows[index]?.id;
    const keepPosition = !!thread || index > 0;
    rows = (Array.isArray(data) ? data : []).filter(row =>
      row && typeof row.body === 'string' && row.body.trim() && !row.tags?.includes('19금') &&
      (!row.kind || row.kind === 'memo')
    ).map(row => ({id:row.id, body:row.body, distance:order === 'recent' ? '' : dist(row.distance_band)}));
    index = keepPosition ? Math.max(0,rows.findIndex(row=>row.id===old)) : 0;
    if (!old || rows[index]?.id !== old) closeThread();
    status.textContent = message;
    byId('glass-retry').hidden = true;
    render();
  }
  async function publicReplies(t) {
    const api = db.schema('ojjuda_note');
    const signal = t.controller.signal;
    if (!t.next) {
      const parent = await api.rpc('get_card', {p_id:t.id}).abortSignal(signal);
      if (parent.error) throw parent.error;
      if (!parent.data || parent.data.kind !== (t.parent ? 'comment' : 'memo') || parent.data.tags?.includes('19금')) return null;
    }
    const snapshot = t.snapshot || new Date().toISOString();
    let query = api.from('public_cards').select('id,body,created_at,reply_count', {count:t.next ? undefined : 'exact'})
      .eq('parent_id',t.id).eq('kind','comment').not('tags','cs','{19금}').lte('created_at',snapshot);
    if (t.next) {
      const {created_at,id} = t.next;
      query = query.or('created_at.lt.'+created_at+',and(created_at.eq.'+created_at+',id.lt.'+id+')');
    }
    const {data,count,error} = await query.order('created_at',{ascending:false}).order('id',{ascending:false})
      .limit(21).abortSignal(signal);
    if (error) throw error;
    const items = data.slice(0,20);
    return {items, snapshot, total:count ?? t.total, next:data.length>20 ? items.at(-1) : null};
  }
  async function readReplies(t, advance=false) {
    if (t.busy) return;
    t.busy = true; t.error = false; render();
    try {
      let result;
      if (sample) {
        const items = t.id==='sample-0' ? [
          {id:'sample-r1',body:'저도 이 길을 좋아해요.',distance_band:'근처',has_replies:true},
          {id:'sample-r2',body:'다음엔 저도 걸어볼게요.',distance_band:'3km'}] : t.id==='sample-r1' ?
          [{id:'sample-r1-1',body:'은행나무 옆 벤치도 좋아요.',distance_band:'2km'}] : [];
        result = {items,total:items.length,next:null};
      } else if (t.public) {
        result = await publicReplies(t);
      } else {
        const {data,error} = await db.schema('ojjuda_note').rpc('glasses_replies',{
          p_parent:t.id,p_lat:t.fix.latitude,p_lon:t.fix.longitude,p_after:t.next,p_snapshot:t.snapshot
        }).abortSignal(t.controller.signal);
        if (error) throw error;
        result = data;
      }
      if (thread !== t || owner !== t.owner) return;
      if (!result) {
        if (t.parent) {
          const parent=t.parent;
          parent.items.splice(parent.at-1,1);
          parent.at=Math.min(parent.at,parent.items.length);
          parent.total=Math.max(parent.items.length,parent.total-1);
          back();
        } else {
          rows.splice(index,1); index=Math.max(0,Math.min(index,rows.length-1)); closeThread();
        }
        status.textContent='이제 볼 수 없는 카드예요.'; return;
      }
      const seen = new Set(t.items.map(row=>row.id));
      for (const row of result.items) if (row.body && !seen.has(row.id)) {
        t.items.push({id:row.id,body:row.body,distance:t.public ? '' : dist(row.distance_band),
          hasReplies:row.has_replies===true || row.reply_count>0}); seen.add(row.id);
      }
      t.total = result.next ? Math.max(t.items.length,result.total) : t.items.length;
      t.next = result.next; t.snapshot = result.snapshot;
      if (t.parent && t.total===0) t.card.hasReplies=false;
      if (advance && t.at<t.items.length) ++t.at;
    } catch { if (thread===t) t.error=true; }
    finally { t.busy=false; if (thread===t || !thread) render(); }
  }
  function move(delta) {
    if (paused) return;
    if (thread) {
      const t=thread;
      if (delta<0 && t.parent && t.at<=1) { back(); return; }
      if (delta<0) t.at=Math.max(0,t.at-1);
      else if (t.at<t.items.length) ++t.at;
      else if (t.next || t.error) { void readReplies(t,true); return; }
    } else index=Math.max(0,Math.min(rows.length-1,index+Math.sign(delta)));
    render();
  }
  function select(offset = 0) {
    if (paused) { togglePower(); return; }
    const parent=thread;
    const card=parent ? parent.items[parent.at-1] : rows[index+offset];
    if (parent && !card?.hasReplies) { back(); return; }
    if (!card) return;
    if (!parent) index+=offset;
    thread={id:card.id,card,parent,depth:(parent?.depth || 0)+1,owner,fix:parent?.fix ?? tracking?.fix,
      public:parent?.public ?? (!sample && (!owner || source!=='nearby')),controller:new AbortController(),items:[],
      at:0,total:null,next:null,snapshot:null,busy:false,error:false};
    void readReplies(thread,!!parent);
    byId('glass-full').focus({preventScroll:true});
  }
  function setBattery(level, isCharging = false) {
    battery = Number.isFinite(level) && level >= 0 && level <= 100 ? Math.round(level) : null;
    charging = isCharging === true;
    render();
  }
  async function loadCards(position, expected, note = '') {
    if (!db || tracking !== expected || sample || paused || document.hidden) return;
    feedRequest?.abort();
    const request = new AbortController();
    feedRequest = request;
    const run = ++feedRun;
    const order = position ? 'nearby' : 'recent';
    const current = () => run===feedRun && expected===tracking && !request.signal.aborted;
    try {
      const cards=[], snapshot=new Date().toISOString();
      for (let offset=0; offset<=5000 && cards.length<30; offset+=30) {
        const {data,error}=await db.schema('ojjuda_note').rpc('list_cards',{
          p_sort:position ? 'nearby' : 'recent', p_lat:position?.latitude ?? null, p_lon:position?.longitude ?? null,
          p_radius_m:30000, p_limit:30, p_cursor:{offset,snapshot}
        }).abortSignal(request.signal);
        if (!current()) return;
        if (error) throw error;
        cards.push(...(data || []).filter(row=>row.kind==='memo'));
        if (!data || data.length<30) break;
      }
      if (position && !cards.length) {
        return loadCards(null,expected,'30km 이내 카드 없음');
      }
      const label = order==='nearby' ? '현재 위치 · 가까운 순' : '공개 카드 · 최신순';
      setCards(cards.slice(0,30),[note,label].filter(Boolean).join(' · '),order);
      if (!rows.length) status.textContent = '아직 공개 카드가 없어요.';
    } catch {
      if (!current()) return;
      if (position) return loadCards(null,expected,'가까운 카드 조회 지연');
      status.textContent = '카드를 불러오지 못했어요. 다시 시도해 주세요.';
      byId('glass-retry').hidden = false;
    } finally {
      if (feedRequest===request) feedRequest=null;
    }
  }
  function stopTracking() {
    const old = tracking;
    tracking = null; ++feedRun;
    feedRequest?.abort(); feedRequest=null;
    old?.controller.abort();
    clearTimeout(old?.timer);
    weather = null;
    weatherHint = autoPaused ? '날씨 · 위치 꺼짐' : '날씨 · 현재 위치';
    locate.textContent = '현재 위치 확인'; locate.disabled = false;
    render();
  }
  async function loadWeather(fix, active) {
    const grid = active.native && fix.accuracy == null ? service.weatherGrid(fix) : service.weatherCell(fix);
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
      if (active.owner) await service.authorizePosition(db,active.owner,{weather:true,signal:request.signal});
      if (!current()) return;
      if (request.signal.aborted) throw Error('weather_timeout');
      const endpoint=new URL('/functions/v1/theme-weather',config.supabaseUrl);
      endpoint.search=new URLSearchParams(installed ? {cell:key} : {nx:grid.nx,ny:grid.ny});
      const response=await fetch(endpoint,{headers:{apikey:config.supabaseKey},signal:request.signal});
      if (!response.ok) throw Error('weather');
      const data=await response.json();
      if (!current()) return;
      if (data.source!=='kma' || !(data.expiresAt>Date.now()) || (!Number.isFinite(data.temperature)&&!data.label)) throw Error('weather');
      weather={text:['현재 위치',Number.isFinite(data.temperature) ? data.temperature+'°C' : '',data.label].filter(Boolean).join(' · '),expiresAt:data.expiresAt};
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
    // Guests use the public feed's distance bands. Keep the precise fix on the phone.
    active.fix = active.owner ? {latitude,longitude} :
      {latitude:Math.round(latitude*1000)/1000, longitude:Math.round(longitude*1000)/1000};
    active.meter.update({latitude,longitude,accuracy,speed:meters,timestamp:at}, Date.now());
    if (Date.now() >= active.nextFeed) {
      active.nextFeed = Date.now()+60000;
      void loadCards(active.fix, active);
    }
    void loadWeather({latitude,longitude,accuracy,capturedAt:at}, active);
    render();
  }
  let locationFailed = false;
  async function beginLocation(manual=false) {
    if (paused || document.hidden || sample || tracking || !db || owner === undefined || !service) return;
    // Member web reads recheck account permissions with the server on every fix.
    const interval = owner && !installed ? 10000 : 2000;
    const active = {owner, native:installed, controller:new AbortController(), nextFeed:0,
      meter:createSpeedMeter(interval === 10000 ? 15000 : 8000)};
    tracking=active; locationFailed=false;
    locate.textContent='위치 끄기'; weatherHint='현재 위치 확인 중'; render();
    if (!rows.length || source!=='recent') void loadCards(null,active,'위치 확인 중');
    const signal=active.controller.signal;
    try {
      if (owner) {
        const choice=await service.preference(db,owner,{refresh:true,signal});
        if (!choice.enabled) throw Error('공원 설정에서 위치를 켜 주세요.');
        await service.authorizePosition(db,owner,{park:true,signal});
      }
      if (tracking!==active) return;
      async function read() {
        let fix;
        const automatic=!manual || !!active.fix;
        if (installed) fix=await window.OjjudaEvenG2.readPhonePosition();
        else if (active.owner) fix=await service.readPosition({db,accountId:active.owner,park:true,fresh:true,cache:false,signal,automatic});
        else fix=await service.readGuestPosition({fresh:true,signal,automatic});
        if (tracking!==active || signal.aborted) return;
        const at=fix?.capturedAt ?? fix?.timestamp ?? Date.now();
        if (!Number.isFinite(fix?.latitude) || !Number.isFinite(fix?.longitude) ||
            Math.abs(fix.latitude)>90 || Math.abs(fix.longitude)>180 || !Number.isFinite(at) ||
            Date.now()-at>30000 || at>Date.now()+2000 || (fix.accuracy!=null && (!Number.isFinite(fix.accuracy) || fix.accuracy<0 || fix.accuracy>5000)))
          throw Error('현재 위치를 확인하지 못했어요.');
        acceptFix(fix,active);
        if (tracking===active) active.timer=setTimeout(()=>read().catch(fail),interval);
      }
      await read();
    } catch(error) { fail(error); }
    function fail(error) {
      if (tracking!==active) return;
      locationFailed=true;
      resetFeed(error?.code==='prompt' ? '' : error?.message || '위치 권한을 확인해 주세요.');
      weatherHint='날씨 · 위치 확인 필요'; render();
    }
  }

  function resetFeed(note = '') {
    sample=false; stopTracking();
    setCards([],note || '공개 카드 불러오는 중');
    if (!document.hidden) void loadCards(null,tracking,note);
  }
  function autoLocate() {
    if (!autoPaused && !locationFailed) void beginLocation();
  }
  function permissionChanged() {
    if (permission?.state==='granted') { locationFailed=false; autoLocate(); }
    else if (tracking && !installed) {
      locationFailed=true; resetFeed('휴대폰 설정에서 위치를 허용해 주세요.');
      weatherHint='날씨 · 위치 확인 필요'; render();
    }
  }
  if (!installed && navigator.permissions?.query) {
    navigator.permissions.query({name:'geolocation'}).then(result=>{
      permission=result; permission.addEventListener('change',permissionChanged);
    }).catch(()=>{});
  }
  function togglePower() {
    paused=!paused;
    if (paused) {
      cancelVoice(); stopTracking(); closeThread();
      if (!sample) setCards([]);
    } else if (!sample) {
      autoLocate();
      if (!tracking) void loadCards(null,tracking);
    }
    render();
  }
  byId('glass-power').onclick = togglePower;
  byId('glass-sample').onclick = () => {
    if (sample) { resetFeed(); autoLocate(); return; }
    stopTracking(); sample=true;
    setCards(samples.map((body,i)=>({body,id:'sample-'+i,distance_band:['근처','2km','4km'][i]})), '예시 카드 · 가까운 순','sample');
  };
  buttons.forEach((button,n) => {button.onclick=()=>select(n);});
  byId('glass-full').onclick = () => select();
  byId('glass-children').onclick = () => select();
  byId('glass-back').onclick = back;
  byId('glass-prev').onclick = () => move(-1);
  byId('glass-next').onclick = () => move(1);
  locate.onclick = () => {
    if (tracking) { autoPaused=true; resetFeed('위치 꺼짐'); return; }
    autoPaused=false; locationFailed=false; return beginLocation(true);
  };
  byId('glass-retry').onclick = () => { void loadCards(tracking?.fix,tracking); };
  byId('glass-view').addEventListener('keydown', event => {
    if (['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
    else if (event.key === 'Escape' && thread) back();
  });
  byId('glass-ai-ask').onclick=toggleVoice;
  byId('glass-ai-connect').onclick=event=>{
    if(!easyLink.opened()) {event.preventDefault();void easyLink.prepare();return;}
    byId('glass-ai-link-status').textContent='공원에서 연결을 승인한 뒤 돌아오세요.';
  };
  byId('glass-ai').onclick=()=>voice.dismiss();
  byId('glass-ai-code-button').onclick=async()=>{
    const button=byId('glass-ai-code-button'), output=byId('glass-ai-code'), account=owner;
    if(!account || button.disabled) return;
    button.disabled=true;
    try {
      const {data,error}=await db.schema('public').rpc('park_g2_voice_code');
      if(error || !/^[A-F0-9]{12}$/.test(data)) throw Error();
      if(account!==owner) return;
      output.textContent=data.match(/.{4}/g).join('-')+' · 5분 동안 유효';
      clearTimeout(codeTimer);codeTimer=setTimeout(()=>{output.textContent='';},300000);
    } catch {if(account===owner) output.textContent='연결 코드를 받지 못했어요. 다시 눌러 주세요.';}
    finally{button.disabled=false;}
  };
  byId('glass-ai-link').onclick=async()=>{
    const run=++pairRun, input=byId('glass-ai-input'), note=byId('glass-ai-link-status');
    const code=input.value.replace(/[-\s]/g,'').toUpperCase();
    if(!/^[A-F0-9]{12}$/.test(code)) {note.textContent='12자리 코드를 입력해 주세요.';return;}
    const button=byId('glass-ai-link');button.disabled=true;note.textContent='연결 중…';
    try{
      const {token}=await voiceRequest({action:'pair',code},null,AbortSignal.timeout(12000));
      if(run!==pairRun || !/^[a-f0-9]{64}$/.test(token)) return;
      if(await hardware.saveVoiceToken(token)===false) throw Error('storage');
      if(run!==pairRun) return;
      input.value='';note.textContent='';voice.setToken(token);await easyLink.clear();render();
    } catch {if(run===pairRun) note.textContent='연결에 실패했어요. 새 코드를 받아 다시 입력해 주세요.';}
    finally{button.disabled=false;}
  };
  byId('glass-ai-unpair').onclick=async()=>{
    ++pairRun;++voiceDeviceGeneration;voice.setToken('');
    await hardware?.saveVoiceToken('').catch(()=>{});await easyLink.clear();render();
  };
  window.OJJUDA_GLASS_PREVIEW = Object.freeze({setBattery,setCards,move,select,getView:model,
    startVoice,toggleVoice,voiceAudio:voice.audio,cancelVoice,
    holdVoice:on=>{holding=on && !paused && !document.hidden && !['starting','listening','sending'].includes(voice.phase);render();},
    glassesMove:d=>voice.scroll(d)||move(d),glassesSelect:()=>{
      if(['starting','listening'].includes(voice.phase)) return voice.finish();
      if(voice.phase!=='sending' && !voice.dismiss()) select();
    },
    setLocation: fix => acceptFix(fix,tracking)});
  let lastTick = '';
  const timer = setInterval(() => {
    if(hardware && tokenReady && !voice.paired && !paused && !document.hidden) void easyLink.check();
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
        cancelVoice();byId('glass-ai-code').textContent='';
        owner = id; autoPaused=false; locationFailed=false; sample=false; stopTracking(); closeThread();
        setCards([], '공개 카드 불러오는 중');
        stopPreference(); stopPreference = () => {};
        // Wait until Supabase releases its auth lock.
        setTimeout(() => {
          if (owner !== id) return;
          if (id && service) stopPreference = service.observe(db,id,choice => {
            if (id===owner && tracking && !choice.enabled) { locationFailed=true; resetFeed('위치 사용 제한'); }
          });
          autoLocate();
          if (!sample && !tracking) void loadCards(null,tracking);
        }, 0);
      }).data.subscription;
    } catch { status.textContent = '공원에 연결하지 못했어요.'; }
  }
  let connecting = false;
  async function connectG2() {
    if (hardware || connecting) return;
    connecting = true;
    const message = byId('g2-status');
    const retry = byId('g2-reconnect');
    retry.hidden = true;
    message.textContent = 'G2 연결을 기다리는 중…';
    let stage = 'SDK';
    try {
      const sdk = await import('/park/even-g2.bundle.mjs?v=20261126-live1');
      if (typeof sdk?.attachEvenG2 !== 'function') throw Error('SDK');
      stage = 'BRIDGE';
      hardware = await sdk.attachEvenG2(window.OJJUDA_GLASS_PREVIEW);
      const generation=++voiceDeviceGeneration;
      try {const token=await hardware.loadVoiceToken();if(generation===voiceDeviceGeneration && /^[a-f0-9]{64}$/.test(token)) voice.setToken(token);}catch{}
      tokenReady=true;
      if(!voice.paired) {await easyLink.prepare();void easyLink.check(true);}
      render();
      byId('g2-setup').hidden = true;
      message.textContent = 'G2 화면을 열었어요.';
    } catch (error) {
      const code = /^(?:DEVICE|DISPLAY(?:-[0-9]+)?)$/.test(error?.message) ? error.message : stage;
      message.textContent = code === 'SDK' ? '안경 모듈을 불러오지 못했어요. (SDK)' :
        code === 'BRIDGE' ? 'Even 앱과 연결되지 않았어요. (BRIDGE)' :
        code === 'DEVICE' ? 'Even 앱에서 G2가 연결되면 아래 버튼을 눌러 주세요. (DEVICE)' :
        'G2 화면을 열지 못했어요. 안경 연결 상태를 확인해 주세요. (' + code + ')';
      retry.hidden = false;
    } finally { connecting = false; }
  }
  byId('g2-reconnect').onclick = connectG2;
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden && hardware && tokenReady && !voice.paired && !paused) void easyLink.check(true);
    if (document.hidden) {
      cancelVoice();

      if (!sample) { stopTracking(); closeThread(); setCards([]); }
    } else if (!sample) {
      autoLocate();
      if (!tracking) void loadCards(null,tracking);
    }
  });
  window.addEventListener('pagehide', event => {
    cancelVoice();
    closeThread();
    stopTracking();
    if (!event.persisted) { clearInterval(timer); stopPreference(); permission?.removeEventListener('change',permissionChanged); subscription?.unsubscribe(); hardware?.dispose(); }
  });
  render(); void initFeed();
  const params=new URL(location.href).searchParams;
  if (params.get('g2') === '1' || document.documentElement?.dataset?.evenApp) void connectG2();
  else if (params.get('developer') === '1') byId('g2-setup').hidden = false;
})();
