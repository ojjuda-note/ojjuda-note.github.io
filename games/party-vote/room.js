'use strict';

const party = window.DrinkingChild;
const kind = document.documentElement.dataset.game;
const minority = kind === 'minority';
const title = minority ? '소수파 찾기' : '한 명만 다른 미션';
const description = minority
  ? '두 가지 중 더 끌리는 쪽에 몰래 투표해요. 모두 고르면 소수파가 누구인지 공개돼요.'
  : '각자 제시어를 확인하고 동시에 몸짓으로 표현해요. 다른 제시어를 받은 사람을 찾아 투표하세요.';
const view = document.querySelector('#view');
const notice = document.querySelector('#notice');
const roomCode = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
const validCode = code => /^[A-Z0-9]{6}$/.test(code);
let activeCode = validCode(roomCode) ? roomCode : '';
let mode = roomCode ? 'join' : 'create';
let client, actor, room, timer, requestId, requestFingerprint;
let busy = false, polling = false, revealed = false;
let initialized = false, initializing = false, authSubscribed = false;
const connection = window.OjjudaRoomConnection.create({
  onPause: () => {
    cover();
    if (room && navigator.onLine===false) { notice.textContent='연결이 잠시 끊겼어요. 다시 연결하고 있어요.'; notice.dataset.network='1'; }
  },
  onResume: () => { if (room) { render(room, true); void sync(); } else if (!initialized) void init(); }
});

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => (
  {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]
));
const control = (label, action, primary = false) =>
  party?.control(action) ?? '<button type="button" class="' + (primary ? 'action' : 'secondary') + '" data-do="' + action + '">' + label + '</button>';
const sessionKey = () => 'oj.' + kind + '.' + actor + '.last';
function lastRoom() {
  try { return sessionStorage.getItem(sessionKey()); } catch { return ''; }
}
function remember(code) {
  if (party) return;
  try { sessionStorage.setItem(sessionKey(), code); } catch {}
}
function entry() {
  room = null;
  revealed = false;
  clearTimeout(timer);
  if (party) return party.missing();
  const create = mode === 'create';
  const seats = Array.from({length:10}, (_, i) => '<option value="' + (i+3) + '"' + (i === 1 ? ' selected' : '') + '>' + (i+3) + '명</option>').join('');
  view.innerHTML = '<section class="card"><h1>' + title + '</h1><p>' + description + '</p>' +
    '<div class="tabs"><button data-do="create-tab" aria-pressed="' + create + '">방 만들기</button>' +
    '<button data-do="join-tab" aria-pressed="' + !create + '">방 들어가기</button></div>' +
    '<form id="entry">' + (create
      ? '<label>방 제목<input name="title" required maxlength="40" value="' + title + ' 같이 한 판 해요"></label><label>참여 인원<select name="capacity">' + seats + '</select></label>'
      : '<label>방 코드<input name="code" value="' + esc(activeCode) + '" required maxlength="6" minlength="6" autocapitalize="characters" spellcheck="false"></label>') +
    '<label>방 비밀번호<input name="password" type="password" required minlength="4" maxlength="32" placeholder="' +
    (create ? '4자 이상으로 정해 주세요' : '방장이 정한 비밀번호') + '"></label>' +
    '<button class="action" type="submit">' + (create ? '방 만들기' : '입장하기') + '</button></form></section>';
}

function ballots(labels, ownSeat) {
  return '<div class="ballots">' + labels.map((label, index) => index === ownSeat ? '' :
    '<button type="button" data-do="vote" data-slot="' + index + '">' + esc(label) + '</button>').join('') + '</div>';
}
function resultForMinority(s) {
  const groups = s.choices.map((_, option) => s.players.filter((_, i) => s.votes[i] === option));
  const [left, right] = groups.map(group => group.length);
  let heading = '모두 같은 선택이에요!';
  if (left === right) heading = '정확히 반반이에요!';
  else if (left && right) heading = '소수파는 ‘' + esc(s.choices[left < right ? 0 : 1]) + '’!';
  const counts = groups.map((group, i) => '<li><strong>' + esc(s.choices[i]) + ' · ' + group.length +
    '표</strong><span>' + (group.length ? group.map(esc).join(', ') : '선택한 사람 없음') + '</span></li>').join('');
  return '<h1>' + heading + '</h1><ul class="breakdown">' + counts + '</ul>';
}
function resultForMission(s) {
  const high = Math.max(...s.totals);
  const leaders = s.players.filter((_, i) => s.totals[i] === high);
  const heading = leaders.length > 1 ? '최다 득표가 동점이에요' :
    s.totals[s.odd] === high ? '다른 미션을 받은 사람을 찾았어요!' : '정체를 숨겼어요!';
  return '<h1>' + heading + '</h1><p>다른 미션을 받은 사람은 <strong>' + esc(s.players[s.odd]) + '</strong>님이에요.</p>' +
    '<ul class="breakdown"><li>공통 제시어 <strong>' + esc(s.choices[0]) + '</strong></li>' +
    '<li>다른 제시어 <strong>' + esc(s.choices[1]) + '</strong></li></ul>' +
    '<p>최다 득표 · ' + leaders.map(esc).join(', ') + ' (' + high + '표)</p>';
}
function roundView(s) {
  const host = s.me === 0;
  switch (s.phase) {
    case 'waiting':
      return '<h1>' + esc(s.title) + '</h1><p>모두 모이면 시작해요. 초대 링크와 비밀번호를 친구에게 알려 주세요.</p>' +
        '<ol class="members">' + s.players.map((name, i) => '<li' + (i === s.me ? ' class="me"' : '') + '>' +
        esc(name) + (i === 0 ? ' · 방장' : '') + (i === s.me ? ' (나)' : '') + '</li>').join('') + '</ol>' + control('초대 링크 복사', 'copy', true);
    case 'cards':
      return '<h1>내 제시어를 확인하세요</h1><div class="mission-card">' + control(revealed ? '제시어 가리기' : '내 제시어 보기', 'reveal') +
        (revealed ? '<p class="secret">' + esc(s.word) + '</p>' : '') + '</div><p>확인 ' + s.readyCount + ' / ' + s.players.length + '명</p>' +
        (s.ready ? '<p>다른 참가자가 확인하고 있어요.</p>' : revealed ? control('확인했어요', 'ready', true) : '');
    case 'act':
      return '<h1>하나, 둘, 셋! 동시에 표현해요</h1><p>말하지 않고 각자의 제시어를 몸짓으로 표현하세요.</p>' +
        (host ? control('몸짓을 마쳤어요 · 투표 시작', 'start_vote', true) : '<p>몸짓을 마치면 방장이 투표를 시작해요.</p>');
    case 'vote':
      return '<h1>' + (s.voted ? '투표를 마쳤어요' : minority ? '어느 쪽을 고를까요?' : '누가 다른 미션을 받았을까요?') + '</h1>' +
        '<p>투표 ' + s.voteCount + ' / ' + s.players.length + '명</p>' +
        (s.voted ? '<p>모두 투표하면 결과가 공개돼요.</p>' : minority ? ballots(s.choices) : ballots(s.players, s.me));
    case 'done':
      return (minority ? resultForMinority(s) : resultForMission(s)) +
        (party ? '' : host ? control('한 판 더', 'again', true) : '<p>방장이 다음 판을 시작할 수 있어요.</p>');
    default:
      return '<p>게임 상태를 확인하고 있어요…</p>';
  }
}
function render(s, force = false) {
  if (!connection.active()) return;
  if (!s || !/^[A-Z0-9]{6}$/.test(s.code) || !Number.isInteger(s.revision) || !Array.isArray(s.players) ||
      !Number.isInteger(s.me) || s.me<0 || s.me>=s.players.length) throw Error('방 상태를 다시 확인하고 있어요.');
  const changedRoom = !room || room.code !== s.code;
  if (!changedRoom && (s.revision < room.revision || (!force && s.revision === room.revision))) return;
  const newPhase = changedRoom || s.round !== room.round || s.phase !== room.phase;
  if (newPhase) revealed = false;
  if (changedRoom) {
    remember(s.code);
    const url = new URL(location.href);
    url.searchParams.set('room', s.code);
    history.replaceState(null, '', url);
  }
  const focus = newPhase ? null : document.activeElement?.dataset;
  party?.setPhase(s.phase);
  room = s;
  activeCode = s.code;
  view.innerHTML = '<section class="card"><div class="topline"><span>방 ' + esc(party?.code || s.code) + '</span><span>' + s.round +
    '번째 판 · ' + s.players.length + '/' + s.capacity + '명</span></div>' + roundView(s) +
    '<div class="actions">' + control('방 나가기', 'leave') + '</div></section>';
  if (focus?.do) {
    const buttons = view.querySelectorAll('button[data-do]');
    Array.from(buttons).find(b => b.dataset.do === focus.do && b.dataset.slot === focus.slot)?.focus({preventScroll:true});
  }
}

const messages = {
  not_signed_in:'오쭈다 로그인이 필요해요.', banned:'지금은 대전방을 이용할 수 없어요.',
  not_room_member:'방 비밀번호를 입력해 주세요.', room_unavailable:'방이 닫혔거나 시간이 만료됐어요.',
  room_full:'이미 게임이 시작됐거나 자리가 없어요.', room_in_progress:'참여 중인 방에서 먼저 나와 주세요.',
  join_rate_limit:'비밀번호를 여러 번 틀렸어요. 1분 뒤 다시 입력해 주세요.', wrong_password:'방 비밀번호가 맞지 않아요.',
  invalid_password:'비밀번호는 4~32자, 한글은 24자까지 가능해요.', invalid_title:'방 제목과 참여 인원을 확인해 주세요.',
  stale_round:'새 판이 시작됐어요.', invalid_game:'이 게임의 방 코드를 확인해 주세요.',
  invalid_target:'화면에 표시된 선택지 중 하나를 골라 주세요.', invalid_vote:'화면에 표시된 선택지 중 하나를 골라 주세요.',
  already_voted:'이미 투표했어요.', vote_closed:'이미 투표가 마감됐어요.',
  host_only:'방장만 할 수 있어요.', unavailable:'게임 단계가 바뀌었어요. 잠시 뒤 다시 확인해 주세요.'
};
async function api(action, code = '', options = {}) {
  let result;
  try {
    result = await connection.request(signal => client.rpc('party_vote_multiplayer', {
      p_kind:kind, p_action:action, p_code:code, p_options:options
    }).abortSignal(signal), {read:action === 'state'});
  } catch (err) { if (!connection.cancelled(err)) { connection.failed(); err.roomConnectionCounted=true; } throw err; }
  const {data,error} = result;
  if (error || data?.error) {
    const tag = error?.message || data.error;
    if (messages[tag]) connection.succeeded(); else connection.failed();
    const failure = new Error(messages[tag] || '연결을 확인한 뒤 다시 시도해 주세요.');
    failure.code = tag; failure.roomConnectionCounted = true;
    throw failure;
  }
  connection.succeeded();
  return data;
}
function later() {
  clearTimeout(timer);
  if (room && connection.active() && !busy) timer = setTimeout(sync, connection.delay(1100));
}
async function sync() {
  if (!connection.active()) return;
  if (!room || busy || polling) { later(); return; }
  const code = room.code;
  polling = true;
  try {
    const s = await api('state', code);
    if (room?.code === code) {
      render(s);
      if (notice.dataset.network) { notice.textContent = ''; delete notice.dataset.network; }
    }
  } catch (err) {
    if (!connection.cancelled(err) && connection.active() && room?.code === code) {
      notice.textContent = err.message;
      notice.dataset.network = '1';
      if (['room_unavailable','not_room_member'].includes(err.code)) {
        remember(''); mode = 'join'; entry();
      }
    }
  } finally { polling = false; later(); }
}
async function run(task) {
  if (busy || !connection.active()) return;
  busy = true; clearTimeout(timer); connection.cancelReads();
  notice.textContent = ''; delete notice.dataset.network;
  try { await task(); }
  catch (err) { if (!connection.cancelled(err) && connection.active()) notice.textContent = err.message || '연결을 확인해 주세요.'; }
  finally {
    busy = false;
    if (room && connection.active()) void sync();
    else if (!initialized && connection.active()) timer = setTimeout(init, connection.delay(1100));
    else later();
  }
}
view.addEventListener('submit', event => {
  event.preventDefault();
  if (busy || !connection.active() || event.target.id !== 'entry') return;
  const form = new FormData(event.target);
  const password = String(form.get('password') || '');
  const code = String(form.get('code') || '').trim().toUpperCase();
  if (mode === 'join' && !validCode(code)) { notice.textContent = '방 코드 6자리를 확인해 주세요.'; return; }
  const button = event.target.querySelector('[type=submit]');
  button.disabled = true;
  run(async () => {
    try {
      let state;
      if (mode === 'create') {
        const roomTitle = String(form.get('title') || '').trim();
        const capacity = Number(form.get('capacity'));
        const fingerprint = JSON.stringify([roomTitle, capacity, password]);
        if (fingerprint !== requestFingerprint) { requestFingerprint = fingerprint; requestId = crypto.randomUUID(); }
        state = await api('create', '', {title:roomTitle, capacity, password, request_id:requestId});
      } else {
        activeCode = code; initialized = false;
        state = await api('join', code, {password});
      }
      requestFingerprint = null; requestId = null;
      render(state); initialized = true;
    } catch (err) {
      // Resolve an interrupted join from server state without replaying it.
      if (mode === 'join' && messages[err.code]) initialized = true;
      throw err;
    } finally { button.disabled = false; }
  });
});
view.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button || button.disabled || busy || !connection.active()) return;
  const action = button.dataset.do;
  if (action === 'retry') { if (room) void sync(); else void init(); return; }
  if (action === 'create-tab' || action === 'join-tab') {
    mode = action === 'create-tab' ? 'create' : 'join';
    notice.textContent = ''; entry(); return;
  }
  if (!room) return;
  if (action === 'reveal') { revealed = !revealed; render(room, true); return; }
  if (action === 'copy') {
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(
      () => { notice.textContent = '초대 링크를 복사했어요.'; }, () => { notice.textContent = location.href; });
    else notice.textContent = location.href;
    return;
  }
  const current = room;
  if (action === 'leave') {
    if (!window.DrinkingStandaloneExit.confirm(current)) return;
    run(async () => {
      await api('leave', current.code, window.DrinkingStandaloneExit.options(current));
      remember(''); history.replaceState(null, '', location.pathname);
      activeCode = ''; mode = 'create'; entry();
    });
    return;
  }
  if (['ready','start_vote','vote','again'].includes(action)) {
    const options = {round:current.round};
    if (action === 'vote') options.target = Number(button.dataset.slot);
    run(async () => {
      const state = await api(action, current.code, options);
      revealed = false;
      render(state, true);
    });
  }
});
function cover() {
  clearTimeout(timer);
  if (room && revealed) {
    revealed = false;
    view.querySelectorAll('.secret').forEach(node => node.remove());
  }
}

function signedOut() {
  if (party) return party.signedOut();
  clearTimeout(timer); revealed = false; room = null;
  view.innerHTML = '<section class="card"><h1>' + title + '</h1><p>오쭈다에 로그인한 뒤 이 화면으로 돌아와 주세요.</p>' +
    '<a href="/?auth=login&amp;next=world" target="_blank" rel="noopener">오쭈다 로그인</a></section>';
}
function accountChanged(session) {
  const id = session?.user && !session.user.is_anonymous ? session.user.id : null;
  if (id !== (actor || null)) { connection.pause(); room=null; view.replaceChildren(); location.reload(); }
}
async function checkAccount() {
  if (!client || !connection.active()) return;
  try { const {data,error} = await connection.request(() => client.auth.getSession(), {read:true}); if (!error && connection.active()) accountChanged(data.session); } catch {}
}
async function init() {
  if (initializing || !connection.active()) return;
  initializing = true; initialized = false; clearTimeout(timer);
  try {
    client = await connection.request(() => window.OjjudaGetClient(), {read:true});
    if (!connection.active()) return;
    const {data,error} = await connection.request(() => client.auth.getSession(), {read:true});
    if (error) throw error;
    if (!connection.active()) return;
    const user = data.session?.user;
    actor = user && !user.is_anonymous ? user.id : null;
    if (!authSubscribed) { authSubscribed = true; client.auth.onAuthStateChange((_event,session) => accountChanged(session)); }
    if (!actor) { initialized = true; signedOut(); return; }
    if (party && !(await party.connect(client))) { initialized=true; connection.pause(); return; }
    if (!connection.active()) return;
    const last = activeCode || lastRoom();
    if (last) {
      try { const next=await api('state', last); notice.textContent=''; render(next); initialized = true; later(); return; }
      catch (err) {
        if (err.code === 'room_unavailable') { remember(''); notice.textContent = err.message; }
        else if (err.code !== 'not_room_member') throw err;
      }
    }
    initialized = true; entry();
  } catch (err) {
    if (!connection.cancelled(err) && connection.active()) {
      if (!err.roomConnectionCounted) connection.failed(); notice.textContent = err.message || '연결을 확인해 주세요.';
      if (['not_signed_in','banned'].includes(err.code)) initialized = true;
      if (!room) view.innerHTML = control('다시 연결', 'retry');
    }
  } finally {
    initializing = false;
    if (!initialized && connection.active()) timer = setTimeout(init, connection.delay(1100));
  }
}
window.addEventListener('focus', checkAccount);
init();
