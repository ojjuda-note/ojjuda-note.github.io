/* Online controls reuse the existing 3D renderer; only the server advances rules. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s), escape = safeText;
  const messages = {
    not_signed_in:'온라인은 로그인한 오쭈다 월드에서 이용해 주세요.', banned:'지금은 온라인 게임을 이용할 수 없어요.',
    room_full:'방이 가득 찼어요.', room_not_found:'방 번호를 다시 확인해 주세요.', room_unavailable:'종료되었거나 대기 시간이 지난 방이에요.',
    room_already_started:'이미 시작한 방이에요.', room_in_progress:'참여 중인 방이 있어요. 같은 방으로 돌아갈게요.',
    room_rate_limit:'잠시 후 다시 방을 만들어 주세요.', need_players:'두 명 이상 모이면 시작할 수 있어요.',
    not_room_owner:'방장만 게임을 시작할 수 있어요.', state_conflict:'차례가 바뀌었어요. 현재 게임을 다시 불러옵니다.',
    not_your_turn:'지금은 내 차례가 아니에요.', invalid_choice:'현재 고를 수 있는 항목을 선택해 주세요.',
    bad_request:'입력한 내용을 다시 확인해 주세요.', unavailable:'연결을 다시 확인하고 있어요. 잠시 기다려 주세요.'
  };
  let selected = false, room = null, busy = false, polling = false, animating = false, connected = true, pending = null;
  let epoch = 0, timer = 0, offset = 0, controlsKey = '', resultKey = '', activeId = null;
  const requests = new Map();
  const access = () => window.ojjudaMarbleAccess;
  const available = () => access()?.available === true && access()?.owner && access().owner !== 'guest';
  const storageKey = () => 'ojjuda-marble-online:' + access()?.owner;
  const active = () => selected && !!room?.game;
  const spectating = () => active() && !!room.game.players[room.seat]?.bankrupt;
  const canAct = () => active() && room.status === 'active' && room.seat === room.game.turn && !spectating() && !busy && !pending && !animating && connected;
  const issue = text => { $('#marbleIssue').textContent = text; $('#marbleConnection').textContent = text; };
  function remember(value) { try { if (value) localStorage.setItem(storageKey(), value); else localStorage.removeItem(storageKey()); } catch {} }
  function remembered() { try { return localStorage.getItem(storageKey()); } catch { return null; } }
  function rpc(body) {
    if (!available()) return Promise.reject(Object.assign(Error(messages.not_signed_in), {code:'not_signed_in'}));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { requests.delete(requestId); reject(Object.assign(Error(messages.unavailable), {code:'unavailable'})); }, 20000);
      requests.set(requestId, {resolve, reject, timeout});
      ojjudaPost({type:'ojjuda-marble-request', requestId, body});
    });
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || event.origin !== location.origin || event.data?.source !== 'ojjuda-world') return;
    const message = event.data;
    if (message.type === 'ojjuda-tour-init' && !window.ojjudaMarbleAccess) {
      window.ojjudaMarbleAccess = {owner:message.owner, available:message.onlineAvailable === true};
      if (selected) void refresh();
    }
    if (message.type !== 'ojjuda-marble-response') return;
    const pendingRequest = requests.get(message.replyTo); if (!pendingRequest) return;
    requests.delete(message.replyTo); clearTimeout(pendingRequest.timeout);
    const result = message.result;
    if (result?.ok) pendingRequest.resolve(result);
    else { const code = Object.hasOwn(messages, result?.error) ? result.error : 'unavailable'; pendingRequest.reject(Object.assign(Error(messages[code]), {code})); }
  });
  function schedule() { clearTimeout(timer); if (selected && available()) timer = setTimeout(refresh, document.hidden ? 8000 : 2200); }
  function renderLobby() {
    $('#tourLocal').hidden = selected;
    $('#marbleLobby').hidden = !selected;
    const waiting = room?.status === 'waiting';
    $('#marbleMenu').hidden = !!room;
    $('#marbleWaiting').hidden = !waiting;
    $('#tourModeHelp').textContent = '각자 기기에서 방 번호로 모여요. 로그인한 회원 2~8명이 함께해요.';
    $('#tourMode').querySelectorAll('button').forEach(button => {
      const on = button.dataset.tourMode === 'online'; button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on));
    });
    $('#marbleLobby').querySelectorAll('button,input,select').forEach(el => el.disabled = busy || !!pending || !available());
    if (!available()) issue(messages.not_signed_in);
    if (waiting) {
      $('#marbleRoomTitle').textContent = room.title; $('#marbleRoomCode').textContent = room.code;
      $('#marbleRoomCount').textContent = `${room.names.length} / ${room.capacity}명 · ${room.maxRound ? room.maxRound+'라운드' : '무제한'}`;
      $('#marbleMembers').innerHTML = room.names.map((name,i) => `<li><span class="face">${avatar(i)}</span><span>${escape(name)}</span><small>${i === room.hostSeat ? '방장 ' : ''}${i === room.seat ? '· 나' : ''}</small></li>`).join('');
      $('#marbleStart').hidden = room.seat !== room.hostSeat;
      $('#marbleStart').disabled = busy || !!pending || room.names.length < 2;
      $('#marbleWaitHelp').textContent = room.seat === room.hostSeat ? '친구에게 방 번호를 알려 주세요. 두 명 이상 모이면 시작할 수 있어요.' : '방장이 시작하면 함께 게임에 들어가요.';
    }
  }
  function tick() {
    if (!active()) return;
    const seconds = Math.max(0, Math.ceil((Date.parse(room.deadline) - Date.now() - offset) / 1000));
    $('#marbleClock').textContent = room.status === 'active' ? (spectating() ? '관전 중 · ' : room.seat === room.game.turn ? '내 차례 · ' : '상대 차례 · ') + seconds+'초' : '게임 종료';
  }
  function controls() {
    if (!active()) return;
    $('#marbleGameBar').hidden = false; $('#marbleControls').hidden = false;
    $('#marbleGameRoom').textContent = `방 ${room.code} · ${room.game.players[room.seat]?.name || ''}`;
    $('#quitBtn').textContent = '기권'; $('#quitBtn').classList.toggle('hidden', spectating() || room.status !== 'active');
    tick();
    const own = canAct(), pr = room.prompt;
    const key = JSON.stringify([room.id,room.version,own,busy,!!pending,animating,connected]);
    if (controlsKey === key) return; controlsKey = key;
    rollResolve = null; pickResolve = null; pickAllowed = null; R.pickSet = null; R.diceReady = false; R.holding = false;
    $('#rollBtn').classList.add('hidden'); $('#seg').classList.add('off');
    const el = $('#marbleControls'); el.classList.toggle('waiting', !own);
    if (room.status === 'finished') { el.innerHTML = '<p>게임이 끝났어요. 결과를 확인해 주세요.</p>'; return; }
    if (!own) {
      const text = spectating() ? '탈락 · 남은 참가자의 경기를 지켜보세요.' : busy || pending ? '선택을 전달하고 있어요…' : animating ? '게임이 진행되고 있어요…' : !connected ? messages.unavailable : `${room.game.players[room.game.turn].name}님이 선택하고 있어요.`;
      el.innerHTML = `<p>${escape(text)}</p>`; say(text); return;
    }
    say(pr.title);
    let choices;
    if (pr.kind === 'roll') {
      choices = '<button type="button" data-marble-roll>🎲 주사위 굴리기</button>';
      R.diceReady = true; rollResolve = () => void sendMove({type:'roll'});
    } else if (pr.tiles.length) {
      choices = `<label class="marble-destination">목적지 선택 <select aria-label="목적지 선택" id="marbleDestination">${pr.choices.filter(c=>c.value!=='skip').map(c=>`<option value="${c.value}">${escape(c.label)}</option>`).join('')}</select></label><button type="button" data-marble-destination>선택하기</button>`;
      const skip = pr.choices.findIndex(c => c.value === 'skip'); if (skip >= 0) choices += `<button type="button" data-marble-choice="${skip}">${escape(pr.choices[skip].label)}</button>`;
      pickAllowed = pr.tiles; R.pickSet = pr.tiles; R.pickMsg = '반짝이는 칸에서 골라 주세요.';
      pickResolve = value => void sendMove({type:'choose', value:value < 0 ? 'skip' : value});
    } else choices = pr.choices.map((c,i) => `<button type="button" data-marble-choice="${i}">${escape(c.label)}</button>`).join('');
    el.innerHTML = `<h2>${escape(pr.title)}</h2><p>${escape(pr.text || '가운데 주사위를 눌러도 굴릴 수 있어요.')}</p><div class="marble-choices">${choices}</div>`;
  }
  function showResult() {
    const key = room.id+':'+room.version; if (resultKey === key) return; resultKey = key;
    const winner = room.game.players[room.game.winner];
    $('#sheet').classList.add('hidden'); $('#s2Title').textContent = winner ? winner.name+' 우승!' : '게임 종료';
    $('#s2Bust').innerHTML = winner ? ga(winner,{bust:true,expr:'happy'}) : '';
    $('#s2Body').innerHTML = `<p>${escape(room.game.reason)} · 최종 자산 순위</p>${rankingHTML()}<p role="status">참가자 모두의 기록을 게임 순위에 저장했어요.</p>`;
    $('#s2Btns').innerHTML = '<button class="btn" type="button" data-marble-lobby>온라인 로비로</button>';
    $('#sheet2').classList.remove('hidden'); sfx('win');
  }
  async function accept(next,at=epoch) {
    if (!selected || at !== epoch) return;
    if (next && room?.id === next.id && next.version < room.version) return;
    if (next) offset = next.serverTime-Date.now();
    if (next && room?.id === next.id && next.version === room.version) { connected = true; controls(); tick(); return; }
    const previous = room; room = next; controlsKey = ''; connected = true;
    remember(room?.id); issue('');
    if (!room?.game) { activeId = null; $('#game').classList.add('hidden'); $('#setup').classList.remove('hidden'); renderLobby(); return; }
    const first = activeId !== room.id;
    animating = true; controls();
    try {
      if (!first && previous?.version+1 === room.version && !document.hidden && (room.game.events?.length || 0) <= 5) {
        for (const ev of room.game.events || []) {
          if (at !== epoch) return;
          if (ev.kind === 'dice') { sfx('roll'); await guard(rollDice3D(ev.a,ev.b)); }
          if (ev.kind === 'move' && G.players[ev.p]) {
            if (ev.steps) await walk(G.players[ev.p],ev.steps);
            else { G.players[ev.p].pos = ev.to; placePieces(); hop(G.players[ev.p]); }
          }
        }
      }
      if (at !== epoch) return;
      G = JSON.parse(JSON.stringify(room.game));
      if (first) { begin({online:true}); activeId = room.id; }
      if (!R.ok) { issue('이 기기에서 3D 화면을 열지 못했어요. 다른 브라우저에서 다시 열어 주세요.'); return; }
      render(); placePieces(); setFace(cur());
      $('#log').innerHTML = G.log.map(text => `<li>${escape(text)}</li>`).join('');
      if (room.status === 'finished') showResult();
    } catch(e) { if (e !== STALE) { G = JSON.parse(JSON.stringify(room.game)); render(); } }
    finally { if (at === epoch) { animating = false; controlsKey = ''; controls(); } }
  }
  async function refresh() {
    clearTimeout(timer); timer = 0;
    if (!selected || busy || polling || animating || !available()) { schedule(); return; }
    const at = epoch; polling = true;
    try {
      const body = pending || (room ? {action:'read',room_id:room.id} : {action:'mine'});
      const data = await rpc(body); if (at !== epoch) return;
      pending = null; connected = true; issue(''); await accept(data.room,at); if (!active()) renderLobby();
    } catch(e) {
      if (at !== epoch) return;
      if (e.code !== 'unavailable') pending = null;
      if (e.code === 'room_not_found' || e.code === 'room_unavailable') { room = null; remember(null); activeId = null; G = null; GEN++; $('#game').classList.add('hidden'); $('#setup').classList.remove('hidden'); renderLobby(); }
      connected = false; issue(e.message); controlsKey = ''; controls();
    } finally { polling = false; if (at === epoch) schedule(); }
  }
  async function mutate(body) {
    if (!selected || busy || pending || animating || !available()) return;
    const at = epoch; busy = true;
    if (['create','start','move','surrender'].includes(body.action)) body.request_id = crypto.randomUUID();
    pending = body; if (active()) controls(); else renderLobby();
    try {
      const data = await rpc(body); if (at !== epoch) return;
      pending = null; issue(''); await accept(data.room,at);
    } catch(e) {
      if (at !== epoch) return;
      if (e.code !== 'unavailable') pending = null;
      connected = e.code !== 'unavailable'; issue(e.message);
      if (e.code === 'room_in_progress') { room = null; await accept((await rpc({action:'mine'})).room,at); }
    } finally {
      if (at === epoch) { busy = false; controlsKey = ''; if (active()) controls(); else renderLobby(); schedule(); }
    }
  }
  const sendMove = command => canAct() ? mutate({action:'move',room_id:room.id,version:room.version,command}) : undefined;
  async function open() {
    if (selected) return;
    selected = true; epoch++; busy = false; connected = true; room = null; activeId = null;
    renderLobby(); if (!available()) return;
    const at = epoch, stored = remembered(); busy = true; renderLobby();
    try { const data = await rpc(stored ? {action:'read',room_id:stored} : {action:'mine'}); await accept(data.room,at); }
    catch(e) { if (at === epoch) { if (e.code === 'room_not_found' || e.code === 'room_unavailable') remember(null); else issue(e.message); } }
    finally { if (at === epoch) { busy = false; if (active()) controls(); else renderLobby(); schedule(); } }
  }
  function local() {
    if (!selected) return;
    selected = false; epoch++; GEN++; clearTimeout(timer); timer = 0; pending = null; busy = false; activeId = null;
    if (room?.game) G = null; room = null; rollResolve = null; pickResolve = null; R.pickSet = null; R.diceReady = false;
    $('#tourLocal').hidden = false; $('#marbleLobby').hidden = true; $('#marbleGameBar').hidden = true; $('#marbleControls').hidden = true;
    $('#quitBtn').textContent = '끝내기'; $('#sheet2').classList.add('hidden'); issue('');
  }
  $('#marbleCreate').onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget;
    void mutate({action:'create',options:{title:form.elements.title.value.trim(),capacity:+form.elements.capacity.value,maxRound:+form.elements.rounds.value}});
  };
  $('#marbleJoin').onsubmit = event => { event.preventDefault(); void mutate({action:'join',code:$('#marbleCode').value.trim().toUpperCase()}); };
  $('#marbleStart').onclick = () => room && void mutate({action:'start',room_id:room.id,version:room.version});
  $('#marbleLeave').onclick = () => room && void mutate({action:'leave',room_id:room.id});
  $('#marbleCopy').onclick = async () => { try { await navigator.clipboard.writeText(room.code); issue('방 번호를 복사했어요. 친구에게 알려 주세요.'); } catch { issue('방 번호 '+room.code+'를 친구에게 알려 주세요.'); } };
  $('#marbleControls').onclick = event => {
    const button = event.target.closest('button'); if (!button || !canAct()) return;
    if (button.hasAttribute('data-marble-roll')) void sendMove({type:'roll'});
    else if (button.hasAttribute('data-marble-destination')) void sendMove({type:'choose',value:+$('#marbleDestination').value});
    else if (button.dataset.marbleChoice !== undefined) { const choice = room.prompt.choices[+button.dataset.marbleChoice]; if (choice) void sendMove({type:'choose',value:choice.value}); }
  };
  const quit = $('#quitBtn').onclick;
  $('#quitBtn').onclick = () => {
    if (!active()) return quit();
    if (busy || pending || room.status !== 'active' || spectating()) return;
    if (confirm('기권하면 이번 게임에서 탈락하고 관전하게 돼요. 기권할까요?')) void mutate({action:'surrender',room_id:room.id,version:room.version});
  };
  $('#s2Btns').addEventListener('click', event => { if (event.target.closest('[data-marble-lobby]') && room) { $('#sheet2').classList.add('hidden'); void mutate({action:'leave',room_id:room.id}); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && selected) void refresh(); });
  document.addEventListener('ojjuda-marble:ready', () => { if (selected) { renderLobby(); void refresh(); } });
  window.MarbleOnline = {open,local,selected:()=>selected,active,canAct,spectating};
  setInterval(tick,1000);
  // Also covers an iframe whose initial ready reply arrived before this script loaded.
  ojjudaPost({type:'ojjuda-game-ready',game:'ojjuda-tour'});
})();
