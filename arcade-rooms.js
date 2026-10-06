(function () {
  'use strict';
  const games = { janggi: ['🀄', '장기'], chess: ['♟️', '체스'], carom4: ['🎱', '4구'], carom3: ['🎯', '3구'], pool8: ['🎱', '포켓볼'], matgo: ['🎴', '맞고'] };
  const layouts = [['eheh', '상마상마'], ['hehe', '마상마상'], ['ehhe', '상마마상'], ['heeh', '마상상마']];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const errors = {
    not_signed_in: '로그인한 회원만 대전방을 이용할 수 있어요.', banned: '지금은 대전방을 이용할 수 없어요.',
    invalid_title: '방 제목을 1~40자로 입력해 주세요.', room_full: '다른 사람이 먼저 참여했어요. 다른 방을 골라 주세요.',
    room_unavailable: '이미 닫혔거나 참여할 수 없는 방이에요.', room_in_progress: '참여 중인 방이 있어요. 내 방에서 이어서 하거나 대기를 취소해 주세요.',
    match_in_progress: '진행 중인 맞고를 먼저 마무리해 주세요.', room_rate_limit: '방을 너무 빠르게 만들었어요. 잠시 후 다시 시도해 주세요.',
    room_already_started: '상대가 참여해 대전이 시작됐어요. 내 방에서 이어서 해 주세요.',
    adult_required: '맞고는 생년월일을 등록한 만 19세 이상 회원만 이용할 수 있어요.',
    gold_empty: '맞고 골드를 먼저 충전해 주세요.', not_room_owner: '방장만 대기를 취소할 수 있어요.'
  };
  function message(error) {
    const code = Object.keys(errors).find(key => String(error?.message || error?.code || '').includes(key));
    return errors[code] || '연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
  function shortcut(kind) {
    return `<button class="btn pri arcade-create-shortcut" data-arcade-action="create" data-kind="${escape(kind)}">방 제목을 정하고 공개 대전방 만들기</button>`;
  }
  function markup() { return '<section class="arcade-rooms" data-arcade-rooms aria-label="오락실 대전방"></section>'; }
  function feedMarkup() { return '<div class="arcade-room-feed" data-arcade-room-feed data-room-list aria-label="채팅에 게시된 대전방"></div>'; }
  function create(options) {
    let root = null, list = null, owner = null, epoch = 0, timer = null, polling = false, busy = false, disposed = false;
    let rooms = [], mine = null, canMatgo = false, issue = '', signature = '', openedMatch = null;
    let filter = '', query = '';
    const current = id => !disposed && id && options.getUserId() === id;
    async function call(action, params = {}) {
      const { data, error } = await options.client.rpc('arcade_room_service', { p_action: action, ...params });
      if (error) throw error;
      if (!data?.ok) throw Error('unavailable');
      return data;
    }
    function schedule() {
      if (timer) return;
      if (!disposed && owner && (root?.isConnected || mine?.status === 'waiting' || mine?.status === 'playing')) timer = setTimeout(poll, 4000);
    }
    function card(room) {
      const [emoji, name] = games[room.kind] || ['🎮', '게임'];
      const playing = room.status === 'playing';
      const action = room.is_member ? (playing ? '이어서 하기' : '대기 중') : playing ? '대전 중' : '참여';
      return `<article class="arcade-room-card${room.is_member ? ' mine' : ''}">
        <div class="arcade-room-game"><span aria-hidden="true">${emoji}</span><b>${name}</b></div>
        <div class="arcade-room-copy"><span class="arcade-room-number">방 #${room.room_no}${room.is_host ? ' · 내 방' : room.is_member ? ' · 참여한 방' : ''}</span><h4>${escape(room.title)}</h4><p>${escape(room.host_name)} <span>· ${room.players}/${room.capacity}명</span></p></div>
        <div class="arcade-room-actions"><span class="arcade-room-state${playing ? ' playing' : ''}">${playing ? '대전 중' : '상대 기다리는 중'}</span>
        <button class="btn sm${!playing || room.is_member ? ' pri' : ''}" data-arcade-action="join" data-room="${room.room_no}"${busy || (playing && !room.is_member) || (!playing && room.is_member) ? ' disabled' : ''}>${action}</button>
        ${room.is_host && !playing ? `<button class="arcade-cancel" data-arcade-action="cancel" data-room="${room.room_no}"${busy ? ' disabled' : ''}>대기 취소</button>` : ''}</div></article>`;
    }
    function render() {
      if (!root?.isConnected) return;
      if (!root.querySelector('[data-room-filter]')) {
        root.innerHTML = `<div class="arcade-rooms-head"><div><h3>대전방</h3><p>만든 방이 아래 채팅창에 올라와요</p></div><button class="btn pri" data-arcade-action="create">＋ 방 만들기</button></div>
          <div class="arcade-room-filters"><select aria-label="대전방 게임 선택" data-room-filter><option value="">모든 게임</option></select><input class="inp" type="search" data-room-search maxlength="40" placeholder="방번호 또는 제목 검색" aria-label="방번호 또는 제목 검색"></div>
          <p class="arcade-room-issue" data-room-issue role="status" hidden></p>
          <button class="arcade-room-retry" data-arcade-action="refresh">방 목록 새로고침</button>`;
        root.querySelector('[data-room-search]').value = query;
        signature = '';
      }
      let nextList = document.querySelector('[data-arcade-room-feed]') || root.querySelector('[data-room-list]');
      // Older cached shells can still display rooms until their next refresh.
      if (!nextList) { nextList = document.createElement('div'); nextList.dataset.roomList = ''; root.append(nextList); }
      if (list !== nextList) { list = nextList; signature = ''; }
      const select = root.querySelector('[data-room-filter]');
      const choices = Object.entries(games).filter(([kind]) => kind !== 'matgo' || canMatgo);
      if (select.options.length !== choices.length + 1) {
        select.innerHTML = '<option value="">모든 게임</option>' + choices.map(([kind, [, name]]) => `<option value="${kind}">${name}</option>`).join('');
        if (!choices.some(([kind]) => kind === filter)) filter = '';
      }
      select.value = filter;
      const warning = root.querySelector('[data-room-issue]');
      warning.hidden = !issue; warning.textContent = issue;
      const text = query.trim().replace(/^#/, '').toLocaleLowerCase();
      const shown = rooms.filter(r => (!filter || r.kind === filter) && (!text || String(r.room_no).includes(text) || r.title.toLocaleLowerCase().includes(text)));
      if (mine && !shown.some(r => r.room_no === mine.room_no)) shown.unshift(mine);
      shown.sort((a, b) => a.room_no - b.room_no);
      const next = JSON.stringify([shown, busy, owner]);
      if (signature !== next) {
        const chat = list.closest('.plog'), atBottom = chat && chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
        signature = next;
        list.innerHTML = shown.length ? shown.map(card).join('')
          : `<p class="arcade-room-empty">${owner ? query || filter ? '조건에 맞는 방이 없어요.' : '아직 열린 방이 없어요.<br>첫 대전방을 만들어 보세요.' : '로그인하면 대전방을 만들고 참여할 수 있어요.'}</p>`;
        if (atBottom) chat.scrollTop = chat.scrollHeight;
      }
      root.querySelector('[data-arcade-action="create"]').disabled = busy || !owner;
    }
    async function openMatch(room, automatic = false) {
      const actor = owner;
      if (!room?.match_id || room.status !== 'playing' || !room.is_member || !current(actor)) return;
      if (automatic && (openedMatch === room.match_id || !options.canOpen())) return;
      // Mark before awaiting to prevent overlapping polls opening the same game twice.
      const previous = openedMatch; openedMatch = room.match_id;
      try { await options.onOpen(room, actor); }
      catch (error) { if (current(actor)) { openedMatch = previous; options.notify(message(error)); } }
    }
    async function poll() {
      clearTimeout(timer); timer = null;
      if (polling || busy || disposed || !owner) { schedule(); return; }
      const actor = owner, revision = epoch;
      polling = true;
      try {
        const data = await call('list');
        if (!current(actor) || revision !== epoch) return;
        rooms = data.rooms || []; mine = data.mine; canMatgo = data.can_matgo === true; issue = '';
        render(); await openMatch(mine, true);
      } catch (error) { if (current(actor) && revision === epoch) { issue = message(error); render(); } }
      finally { polling = false; schedule(); }
    }
    function sync() {
      if (disposed) return;
      const actor = options.getUserId();
      if (actor !== owner) {
        epoch++; owner = actor; rooms = []; mine = null; openedMatch = null; issue = ''; signature = '';
        canMatgo = options.matgoAllowed?.() === true; clearTimeout(timer); timer = null;
      }
      const node = document.querySelector('[data-arcade-rooms]');
      const changed = root !== node; root = node;
      if (changed) signature = '';
      render();
      if (changed && root && owner) void poll(); else schedule();
    }
    function layoutSelect(selected) {
      return `<label class="field">장기 시작 배치<select class="inp" name="layout">${layouts.map(([code, label]) => `<option value="${code}"${code === selected ? ' selected' : ''}>${label}</option>`).join('')}</select></label>`;
    }
    function revealMine() { list?.querySelector('.arcade-room-card.mine')?.scrollIntoView({ block: 'nearest' }); }
    function created(room) {
      sync();
      if (!owner || !room?.is_host || !room.is_member || !Number.isSafeInteger(room.room_no) || !games[room.kind] || typeof room.title !== 'string' || room.status !== 'waiting') { void poll(); return; }
      // The same-origin game sends the server's safe room card; joining still requires the RPC.
      epoch++; mine = room; rooms = rooms.filter(r => r.room_no !== room.room_no); rooms.push(room);
      issue = ''; render(); revealMine(); void poll();
    }
    async function perform(action, params, actor) {
      busy = true; epoch++; render();
      try {
        const data = await call(action, params);
        if (!current(actor)) return null;
        mine = data.room.status === 'closed' ? null : data.room;
        rooms = rooms.filter(r => r.room_no !== data.room.room_no);
        if (mine) rooms.unshift(mine);
        issue = ''; render(); return data.room;
      } finally { busy = false; render(); schedule(); }
    }
    function openCreate(kind = 'janggi') {
      sync();
      if (!owner) { options.notify(errors.not_signed_in); return; }
      if (mine) { options.goArcade(); options.closeModal(); options.notify(errors.room_in_progress); return; }
      const allowed = Object.entries(games).filter(([id]) => id !== 'matgo' || canMatgo || options.matgoAllowed?.());
      if (!allowed.some(([id]) => id === kind)) kind = allowed[0][0];
      const actor = owner, initial = games[kind][1] + ' 같이 한 판 해요';
      options.renderModal(`<div class="mhead"><h3>대전방 만들기</h3><button class="btn sm ghost" data-act="close">닫기</button></div>
        <form id="arcade-room-form" class="arcade-room-form"><label class="field">게임<select class="inp" name="kind">${allowed.map(([id, [emoji, name]]) => `<option value="${id}"${id === kind ? ' selected' : ''}>${emoji} ${name}</option>`).join('')}</select></label>
        <label class="field">방 제목<input class="inp" name="title" maxlength="40" required value="${escape(initial)}" autocomplete="off"></label>
        <div data-create-layout${kind === 'janggi' ? '' : ' hidden'}>${layoutSelect('eheh')}</div>
        <p class="note">방번호는 자동으로 붙어요. 만든 방은 오락실 채팅창에 공개돼요.</p><p data-room-message role="status"></p>
        <div class="mfoot"><button class="btn" type="button" data-act="close">취소</button><button class="btn pri" type="submit">방 만들고 기다리기</button></div></form>`, '대전방 만들기');
      const form = document.getElementById('arcade-room-form');
      let previousTitle = initial, request = null, lastParams = '';
      form.elements.kind.onchange = () => {
        const value = form.elements.kind.value;
        if (form.elements.title.value === previousTitle) form.elements.title.value = games[value][1] + ' 같이 한 판 해요';
        previousTitle = games[value][1] + ' 같이 한 판 해요';
        form.querySelector('[data-create-layout]').hidden = value !== 'janggi';
      };
      form.onsubmit = async event => {
        event.preventDefault(); if (busy || !current(actor)) return;
        const title = form.elements.title.value.trim(), kind = form.elements.kind.value, layout = form.elements.layout.value;
        if (!title || [...title].length > 40) { form.querySelector('[data-room-message]').textContent = errors.invalid_title; return; }
        const fingerprint = JSON.stringify([kind, title, layout]);
        if (fingerprint !== lastParams) { request = crypto.randomUUID(); lastParams = fingerprint; }
        const controls = [...form.querySelectorAll('input,select,button')]; controls.forEach(el => el.disabled = true);
        form.querySelector('[data-room-message]').textContent = '방을 만들고 있어요…';
        try {
          if(kind==='matgo'&&typeof window.openMatgo==='function'){options.closeModal();options.goArcade();await window.openMatgo({createTitle:title,createRequest:request});return;}
          const room = await perform('create', { p_kind: kind, p_title: title, p_options: { request_id: request, layout } }, actor);
          if (!room) return;
          if (form.isConnected) options.closeModal(); options.goArcade(); sync(); revealMine();
          options.notify(`방 #${room.room_no}을 만들었어요. 상대가 참여하면 시작해요.`); void poll();
        } catch (error) { if (current(actor) && form.isConnected) form.querySelector('[data-room-message]').textContent = message(error); }
        finally { controls.forEach(el => el.disabled = false); }
      };
      form.elements.title.focus(); form.elements.title.select();
    }
    async function join(room, layout) {
      const actor = owner;
      if (busy || !current(actor)) return;
      try {
        if(room.kind==='matgo'&&!room.is_member&&typeof window.openMatgo==='function'){await window.openMatgo({joinRoom:room.room_no});return;}
        const updated = await perform('join', { p_room: room.room_no, p_options: layout ? { layout } : {} }, actor);
        if (!updated) return;
        if (document.getElementById('arcade-join-form')) options.closeModal();
        await openMatch(updated); void poll();
      } catch (error) { if (current(actor)) { options.notify(message(error)); void poll(); } }
    }
    function chooseRoom(room) {
      if (room.kind !== 'janggi' || room.is_member) { void join(room); return; }
      options.renderModal(`<div class="mhead"><h3>방 #${room.room_no} 참여</h3><button class="btn sm ghost" data-act="close">닫기</button></div><form id="arcade-join-form"><p>${escape(room.title)}</p>${layoutSelect('hehe')}<div class="mfoot"><button type="submit" class="btn pri">이 배치로 참여</button></div></form>`, '장기방 참여');
      document.getElementById('arcade-join-form').onsubmit = event => { event.preventDefault(); void join(room, event.target.elements.layout.value); };
    }
    async function click(event) {
      const button = event.target.closest('[data-arcade-action]');
      if (!button || button.disabled || disposed) return;
      const action = button.dataset.arcadeAction;
      if (action === 'create') { openCreate(button.dataset.kind); return; }
      if (action === 'refresh') { void poll(); return; }
      const room = rooms.find(r => String(r.room_no) === button.dataset.room) || (String(mine?.room_no) === button.dataset.room ? mine : null);
      if (!room || busy) return;
      if (action === 'join') chooseRoom(room);
      if (action === 'cancel') {
        const actor = owner;
        try { await perform('cancel', { p_room: room.room_no }, actor); if (current(actor)) options.notify('대전방을 닫았어요.'); }
        catch (error) { if (current(actor)) options.notify(message(error)); }
        void poll();
      }
    }
    function input(event) {
      if (!root?.contains(event.target)) return;
      if (event.target.matches('[data-room-search]')) { query = event.target.value; render(); }
      if (event.target.matches('[data-room-filter]')) { filter = event.target.value; render(); }
    }
    document.addEventListener('click', click);
    document.addEventListener('input', input);
    document.addEventListener('change', input);
    return { sync, openCreate, created, refresh: poll, dispose() { disposed = true; epoch++; clearTimeout(timer); document.removeEventListener('click', click); document.removeEventListener('input', input); document.removeEventListener('change', input); } };
  }
  window.OjjudaArcadeRooms = { create, markup, feedMarkup, shortcut, message };
})();
