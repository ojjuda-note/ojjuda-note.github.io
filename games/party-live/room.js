(() => {
  'use strict';

  const party = window.DrinkingChild;
  const kind = document.documentElement.dataset.game;
  const title = document.querySelector('header strong').textContent;
  const feature = window.PartyLiveGame;
  const descriptions = {
    updown: '1부터 100 사이에 숨은 숫자를 찾아요. 차례대로 숫자를 고르고 UP·DOWN 힌트로 범위를 좁혀요.',
    fingers: '조건에 해당하면 손가락을 하나 접어요. 다섯 손가락을 먼저 접으면 걸려요.',
    imagevote: '질문에 가장 잘 어울리는 한 사람을 골라요. 모두 투표하면 가장 많이 지목된 사람을 공개해요.',
    bottle: '각자 자리를 고른 뒤 술병이 누구를 가리킬지 지켜보세요.',
    bomb: '내 차례에 주제에 맞는 말을 하고 폭탄을 다음 사람에게 넘기세요.',
    stopwatch: '시간이 숨겨지면 감으로 멈추세요. 목표 시간에 가장 가까운 사람이 이겨요.',
    truth: '내 차례에 카드 하나를 뒤집어 순한맛 또는 빨간맛 질문에 답해요.',
    initial: '내 차례에 초성에 맞는 단어를 말하세요. 5초가 지나면 탈락해요.'
  };
  const view = document.querySelector('#view');
  const notice = document.querySelector('#notice');
  const codeParam = new URLSearchParams(location.search).get('room') || '';
  const validCode = code => /^[A-Z0-9]{6}$/.test(code);
  let activeCode = validCode(codeParam.toUpperCase()) ? codeParam.toUpperCase() : '';
  let mode = codeParam ? 'join' : 'create';
  let client, actor, room, timer, requestId, requestFingerprint;
  let busy = false, polling = false, mounted = false;
  let lastMutation;
  let clockRequest = -1, serverOffset = Date.now() - performance.now();

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => (
    {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]
  ));
  const control = (label, action, primary=false) =>
    party?.control(action) ?? '<button type="button" class="' + (primary ? 'action' : 'secondary') + '" data-do="' + action + '">' + label + '</button>';
  const sessionKey = () => 'oj.' + kind + '.' + actor + '.last';
  function lastRoom() {
    try { return sessionStorage.getItem(sessionKey()); } catch { return ''; }
  }
  function remember(code) {
    if (party) return;
    try { sessionStorage.setItem(sessionKey(), code); } catch {}
  }
  function unmount() {
    if (mounted) feature.unmount?.();
    mounted = false;
  }
  function entry() {
    unmount(); room = null; clearTimeout(timer);
    if (party) return party.missing();
    const create = mode === 'create';
    const seats = Array.from({length:11}, (_,i) => {
      const n = i+2;
      return '<option value="' + n + '"' + (n===4 ? ' selected' : '') + '>' + n + '명</option>';
    }).join('');
    view.innerHTML = '<section class="card"><h1>' + title + '</h1><p>' + descriptions[kind] + '</p>' +
      '<div class="tabs"><button data-do="create-tab" aria-pressed="' + create + '">방 만들기</button>' +
      '<button data-do="join-tab" aria-pressed="' + !create + '">방 들어가기</button></div>' +
      '<form id="entry">' + (create
        ? '<label>방 제목<input name="title" required maxlength="40" value="' + title + ' 같이 한 판 해요"></label>' +
          '<label>참여 인원<select name="capacity">' + seats + '</select></label>'
        : '<label>방 코드<input name="code" value="' + esc(activeCode) + '" required maxlength="6" minlength="6" autocapitalize="characters" spellcheck="false"></label>') +
      '<label>방 비밀번호<input name="password" autocomplete="' + (create?'new-password':'current-password') + '" type="password" required minlength="4" maxlength="32" placeholder="' +
      (create ? '4자 이상으로 정해 주세요' : '방장이 정한 비밀번호') + '"></label>' +
      '<button class="action" type="submit">' + (create ? '방 만들기' : '입장하기') + '</button></form></section>';
  }
  function lobby(s) {
    return '<h1>' + esc(s.title) + '</h1><p>모두 모이면 시작해요. 초대 링크와 비밀번호를 친구에게 알려 주세요.</p>' +
      '<ol class="members">' + s.players.map((player,i) => '<li' + (i===s.me?' class="me"':'') + '>' +
        esc(player) + (i===0?' · 방장':'') + (i===s.me?' (나)':'') + '</li>').join('') + '</ol>' + control('초대 링크 복사','copy',true);
  }
  function render(s) {
    const first = !room || room.code !== s.code;
    if (!first && s.revision <= room.revision) return;
    const previousFocus = !first && s.round===room.round && s.phase===room.phase ? document.activeElement : null;
    unmount();
    if (first) {
      remember(s.code);
      const url = new URL(location.href);
      url.searchParams.set('room',s.code);
      history.replaceState(null,'',url);
    }
    party?.setPhase(s.phase);
    room = s; activeCode = s.code;
    const ui = {esc, now:()=>performance.now()+serverOffset, send:(action,opts)=>send(s,action,opts)};
    const playing = s.phase !== 'waiting';
    const replay = party || s.phase !== 'done' ? '' : s.me===0 ? control('한 판 더','again',true) : '<p>방장이 다음 판을 시작할 수 있어요.</p>';
    view.innerHTML = '<section class="card"><div class="topline"><span>방 ' + esc(party?.code || s.code) + '</span><span>' +
      s.round + '번째 판 · ' + s.players.length + '/' + s.capacity + '명</span></div><div id="game">' +
      (playing ? feature.view(s,ui) : lobby(s)) + '</div><div class="actions">' + replay + control('방 나가기','leave') + '</div></section>';
    if (playing) { mounted = true; feature.mount?.(s,ui); }
    if (previousFocus?.id) document.getElementById(previousFocus.id)?.focus({preventScroll:true});
  }
  const messages = {
    not_signed_in:'오쭈다 로그인이 필요해요.', banned:'지금은 대전방을 이용할 수 없어요.',
    not_room_member:'방 비밀번호를 입력해 주세요.', room_unavailable:'방이 닫혔거나 시간이 만료됐어요.',
    room_full:'이미 게임이 시작됐거나 자리가 없어요.', room_in_progress:'참여 중인 방에서 먼저 나와 주세요.',
    join_rate_limit:'비밀번호를 여러 번 틀렸어요. 1분 뒤 다시 입력해 주세요.', wrong_password:'방 비밀번호가 맞지 않아요.',
    invalid_password:'다른 방 비밀번호를 입력해 주세요.', invalid_title:'방 제목과 참여 인원을 확인해 주세요.',
    stale_round:'새 판이 시작됐어요.', stale_state:'게임이 진행됐어요. 현재 화면을 확인해 주세요.',
    invalid_game:'이 게임의 방 코드를 확인해 주세요.', host_only:'방장만 할 수 있어요.',
    unavailable:'게임 단계가 바뀌었어요. 현재 화면을 확인해 주세요.',
    not_your_turn:'내 차례에 눌러 주세요.', invalid_action:'지금 사용할 수 없는 동작이에요.',
    invalid_target:'화면에서 다시 골라 주세요.', invalid_settings:'테이블 모양과 방향을 골라 주세요.',
    invalid_seat:'테이블 안에서 병 가운데와 조금 떨어진 자리를 골라 주세요.',
    seat_taken:'다른 참가자의 자리와 겹쳐요. 조금 옆을 눌러 주세요.',
    invalid_deck:'선택한 맛의 질문 목록을 확인해 주세요.',
    invalid_mode:'카드 구성을 다시 골라 주세요.', invalid_visibility:'카드 맛을 보일지 숨길지 다시 골라 주세요.',
    invalid_score:'시간 기록을 확인해 주세요.', already_scored:'이미 기록을 제출했어요.',
    invalid_time:'선택할 수 있는 범위에서 시간을 골라 주세요.', stale_turn:'이미 차례가 바뀌었어요.'
  };
  async function api(action,code='',options={}) {
    const started = performance.now();
    const {data,error} = await client.rpc('party_live_multiplayer',{
      p_kind:kind,p_action:action,p_code:code,p_options:options
    }).abortSignal(AbortSignal.timeout(12000));
    if (error || data?.error) {
      const tag = error?.message || data.error;
      const failure = new Error(messages[tag] || feature.messages?.[tag] || '연결을 확인한 뒤 다시 시도해 주세요.');
      failure.code=tag; throw failure;
    }
    if (started>=clockRequest && Number.isFinite(data?.serverMs)) {
      serverOffset=data.serverMs - (started+performance.now())/2;
      clockRequest=started;
    }
    return data;
  }
  function later() {
    clearTimeout(timer);
    if (room && navigator.onLine && !document.hidden) timer=setTimeout(sync,room.phase==='done'?2000:room.phase==='waiting'?1100:700);
  }
  async function sync() {
    if (!room || busy || polling || !navigator.onLine || document.hidden) { later(); return; }
    const code=room.code;
    polling=true;
    try {
      const next=await api('state',code);
      if (room?.code===code) {
        render(next);
        if (notice.dataset.network) { notice.textContent=''; delete notice.dataset.network; }
      }
    } catch (err) {
      if (room?.code===code) {
        notice.textContent=err.message;notice.dataset.network='1';
        if (['room_unavailable','not_room_member'].includes(err.code)) { remember('');mode='join';entry(); }
      }
    } finally { polling=false;later(); }
  }
  async function run(task) {
    if (busy) return false;
    busy=true; notice.textContent=''; delete notice.dataset.network;
    let refresh=false;
    try { await task();return true; }
    catch (err) {
      notice.textContent=err.message||'연결을 확인해 주세요.';
      refresh=['stale_round','stale_state','stale_turn','unavailable','not_your_turn','already_scored'].includes(err.code);
      return false;
    } finally {
      busy=false;
      if (refresh) void sync();
      else later();
    }
  }
  function send(snapshot,action,opts={}) {
    if (room!==snapshot) return Promise.resolve(false);
    return run(async()=>{
      const options={...opts,round:snapshot.round,revision:snapshot.revision};
      const fingerprint=JSON.stringify([snapshot.code,action,options]);
      if (lastMutation?.fingerprint!==fingerprint) lastMutation={fingerprint,id:crypto.randomUUID()};
      options.request_id=lastMutation.id;
      const next=await api(action,snapshot.code,options);
      lastMutation=null;
      if (room?.code===snapshot.code) render(next);
    });
  }
  view.addEventListener('submit',event=>{
    if (event.target.id!=='entry') return;
    event.preventDefault();if (busy) return;
    const form=new FormData(event.target);
    const password=String(form.get('password')||'');
    const code=String(form.get('code')||'').trim().toUpperCase();
    if (mode==='join'&&!validCode(code)) { notice.textContent='방 코드 6자리를 확인해 주세요.';return; }
    const button=event.target.querySelector('[type=submit]');
    button.disabled=true;
    run(async()=>{
      try {
        let next;
        if (mode==='create') {
          const roomTitle=String(form.get('title')||'').trim();
          const capacity=Number(form.get('capacity'));
          const fingerprint=JSON.stringify([roomTitle,capacity,password]);
          if (fingerprint!==requestFingerprint) { requestFingerprint=fingerprint;requestId=crypto.randomUUID(); }
          next=await api('create','',{title:roomTitle,capacity,password,request_id:requestId});
        } else next=await api('join',code,{password});
        requestFingerprint=null;requestId=null;render(next);
      } finally { button.disabled=false; }
    });
  });
  view.addEventListener('click',event=>{
    const b=event.target.closest('button[data-do],button[data-game-action]');
    if (!b||b.disabled||busy) return;
    if (b.hasAttribute('data-game-action')) {
      if (room) void send(room,b.dataset.gameAction);
      return;
    }
    const action=b.dataset.do;
    if (action==='retry') { location.reload();return; }
    if (action==='create-tab'||action==='join-tab') {
      mode=action==='create-tab'?'create':'join';notice.textContent='';entry();return;
    }
    if (!room) return;
    if (action==='copy') {
      const link=location.href;
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(()=>{notice.textContent='초대 링크를 복사했어요.';},()=>{notice.textContent=link;});
      else notice.textContent=link;
      return;
    }
    if (action==='again') { void send(room,action);return; }
    if (action==='leave') {
      const current=room;
      if (!window.DrinkingStandaloneExit.confirm(current)) return;
      run(async()=>{
        await api('leave',current.code, window.DrinkingStandaloneExit.options(current));
        remember('');history.replaceState(null,'',location.pathname);
        activeCode='';mode='create';entry();
      });
    }
  });
  function signedOut() {
    if (party) return party.signedOut();
    unmount();clearTimeout(timer);room=null;
    view.innerHTML='<section class="card"><h1>'+title+'</h1><p>오쭈다에 로그인한 뒤 이 화면으로 돌아와 주세요.</p>'+
      '<a href="/?auth=login&amp;next=world" target="_blank" rel="noopener">오쭈다 로그인</a></section>';
  }
  async function checkAccount() {
    if (!client || !navigator.onLine || document.hidden) return;
    try {
      const {data,error}=await client.auth.getSession();
      if (!error && data && (data.session?.user?.id || null)!==(actor || null)) location.reload();
    } catch { /* The access check retries when the network is available. */ }
  }
  async function init() {
    try {
      client=await window.OjjudaGetClient();
      const {data,error}=await client.auth.getSession();if (error) throw error;
      const user=data.session?.user;actor=user?.id;
      client.auth.onAuthStateChange((_event,session)=>{
        if ((session?.user?.id||null)!==(actor||null)) location.reload();
      });
      if (!user||user.is_anonymous) { signedOut();return; }
      if (party && !(await party.connect(client))) return;
      const last=activeCode||lastRoom();
      if (last) {
        try { render(await window.DrinkingConnection.readRoom(()=>api('state',last)));later();return; }
        catch (err) {
          if (err.code==='room_unavailable') { remember('');notice.textContent=err.message; }
          else if (err.code!=='not_room_member') throw err;
        }
      }
      entry();
    } catch (err) {
      notice.textContent=err.message||'연결을 확인해 주세요.';
      view.innerHTML=control('다시 연결','retry');
    }
  }
  document.addEventListener('visibilitychange',()=>{if (document.hidden) clearTimeout(timer);else if(room)void sync();});
  window.addEventListener('pagehide',()=>clearTimeout(timer));
  window.addEventListener('pageshow',()=>{if(room)void sync();});
  window.addEventListener('drinking-reconnected',()=>{ if(room)void sync(); });
  window.addEventListener('focus',checkAccount);
  init();
})();
