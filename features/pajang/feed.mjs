import {call, client, requireMember, showGate} from './member.mjs?v=entry3';

const $ = id => document.getElementById(id);
const cards = $('cards');
const status = $('status');
const refresh = $('refresh');
const more = $('more');
let cursor = null;
let remaining = 0;
let loading = false;
let version = 0;
let sending = false;
let boundary;
let scheduleVersion = 0;
const displayed = new Map();
const people = new Map();

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function updateActions() {
  $('quota').textContent = '오늘 보낼 수 있는 신호 ' + remaining + '개';
  for (const {item, action, relation, chat} of displayed.values()) {
    if (item.own) continue;
    const {sent, received} = people.get(item.peer);
    relation.textContent = sent && received ? '서로 신호를 보냈어요.' : received ? '나에게 신호를 보냈어요. 수락하면 대화할 수 있어요.' : '';
    action.textContent = sent ? '보낸 신호' : received ? '신호 수락하기' : '신호 보내기';
    action.hidden = sent && received;
    chat.hidden = !action.hidden;
    action.disabled = sent || sending || remaining === 0;
  }
}
function addItem(item) {
  const key = [item.peer,item.day,item.slot].join('/');
  if (displayed.has(key)) return;
  const article = element('article', null, 'card');
  const person = element('div', null, 'person');
  const time = element('time', item.day.replaceAll('-', '.') + ' · ' + (item.slot === 'am' ? '오전' : '오후'));
  time.dateTime = item.day;
  person.append(element('strong', item.name + (item.own ? ' · 내 답변' : '')), time);
  const question = element('h2', item.question);
  const answer = element('p', item.body, 'answer');
  article.append(person, question, answer);
  const action = element('button', '신호 보내기');
  const relation = element('span', '', 'relationship');
  const chat = element('a', '대화 열기');
  chat.href = './station.html?chat=' + encodeURIComponent(item.peer);
  chat.hidden = true;
  if (!item.own) {
    const row = element('div', null, 'actions');
    action.type = 'button';
    action.onclick = () => send(item);
    row.append(relation, action, chat);
    article.append(row);
  }
  const prior = people.get(item.peer);
  people.set(item.peer, {sent: item.sent || !!prior?.sent, received: item.received || !!prior?.received});
  displayed.set(key, {item, action, relation, chat});
  cards.append(article);
}
async function send(item) {
  if (item.own || sending || people.get(item.peer)?.sent || !remaining) return;
  sending = true;
  updateActions();
  let resultMessage;
  try {
    const state = await call('signal', {peer:item.peer, answerDay:item.day, answerSlot:item.slot});
    remaining = state.remaining;
    // Saving a signal affects all answers by this member.
    const relation = people.get(item.peer);
    const mutual = relation?.received || state.signals.some(s => s.src === item.peer && s.dst === state.me.id);
    people.set(item.peer, {sent:true, received:mutual});
    resultMessage = mutual ? item.name + '님과 서로 신호를 보냈어요. 대화를 시작할 수 있어요.' : item.name + '님에게 신호를 보냈어요.';
  } catch (error) {
    await loadPage(true);
    resultMessage = error.code === '42501' || error.code === 'PT409'
      ? '이 답변은 지금 신호를 보낼 수 없어요. 목록을 다시 확인해 주세요.'
      : error.code === 'P0001' ? error.message : '신호를 보내지 못했어요. 목록을 확인한 뒤 다시 시도해 주세요.';
  } finally {
    sending = false;
    updateActions();
    status.textContent = resultMessage;
  }
}
async function loadPage(reset) {
  if (!reset && (loading || !cursor)) return;
  const request = ++version;
  loading = true;
  refresh.disabled = true;
  more.disabled = true;
  if (reset) {
    cursor = null;
    displayed.clear();
    people.clear();
    cards.replaceChildren();
    more.hidden = true;
    $('quota').textContent = '';
  }
  status.textContent = '답변을 불러오고 있어요.';
  cards.setAttribute('aria-busy','true');
  try {
    const db = await client();
    const {data,error} = await db.rpc('pajang_answer_feed',{p_cursor:cursor});
    if (request !== version) return;
    if (error) throw error;
    for (const item of data.items) addItem(item);
    cursor = data.nextCursor;
    remaining = data.remaining;
    updateActions();
    status.textContent = displayed.size ? '' : '최근 1년 동안 공개된 회원 답변이 없어요.';
  } catch (error) {
    if (request !== version) return;
    if (error.code === '42501') {
      displayed.clear();
      people.clear();
      cards.replaceChildren();
      showGate('회원 정보를 다시 확인해 주세요.');
      return;
    }
    status.textContent = reset ? '회원 답변을 불러오지 못했어요. 새로고침을 눌러 주세요.' : '다음 답변을 불러오지 못했어요. 답변 더 보기를 다시 눌러 주세요.';
  } finally {
    if (request === version) {
      loading = false;
      refresh.disabled = false;
      more.disabled = false;
      more.hidden = !cursor;
      cards.setAttribute('aria-busy','false');
    }
  }
}
function schedule(entry) {
  clearTimeout(boundary);
  $('write-link').hidden = !!entry.body;
  // At a slot change, remove expired cards while retrieving the freshly visible set.
  const delay = Math.max(250, Date.parse(entry.nextAt) - Date.now() + 10);
  boundary = setTimeout(recheck, Math.min(12 * 3600000, delay));
}
async function recheck() {
  const current = ++scheduleVersion;
  void loadPage(true);
  try {
    const entry = await call('entry');
    if (current !== scheduleVersion) return;
    if (!entry.joined) return location.replace('./?view=feed');
    schedule(entry);
  } catch {
    if (current !== scheduleVersion) return;
    clearTimeout(boundary);
    boundary = setTimeout(recheck, 30000);
  }
}
const entry = await requireMember();
if (entry && !entry.joined) {
  location.replace('./?view=feed');
} else if (entry) {
  $('gate').hidden = true;
  $('welcome').hidden = false;
  refresh.onclick = () => loadPage(true);
  more.onclick = () => loadPage(false);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) recheck(); });
  window.addEventListener('pagehide', () => clearTimeout(boundary), {once:true});
  schedule(entry);
  await loadPage(true);
}
