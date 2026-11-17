import {call, requireMember, showGate} from './member.mjs?v=3';
import {themeFor, interests} from './questions.mjs?v=rounds1';

const $ = id => document.getElementById(id);
const form = $('answer-form');
const mine = $('mine');
const status = $('my-answer');
const submit = form.querySelector('[type=submit]');
const main = new URL('./station.html', location.href);

function enterMain() {
  if (window.top === window) location.replace(main.href);
  else window.top.location.assign(main.href);
}

async function setupProfile(entry) {
  const response = await fetch('./regions.json?v=rounds1');
  if (!response.ok) throw Error();
  const catalog = await response.json();
  const {province, city, age, interest} = form.elements;
  form.elements.namedItem('name').value = entry.nickname || '';
  if (entry.age != null) {
    age.value = entry.age;
    age.readOnly = true;
  }
  for (const name of Object.keys(catalog)) province.add(new Option(name, name));
  for (const item of interests) interest.add(new Option(item.name, item.key));
  province.onchange = () => {
    const places = catalog[province.value] || [];
    city.replaceChildren(new Option('시·도만 공개', ''));
    for (const place of places) city.add(new Option(place, place));
    $('city-field').hidden = !places.length;
  };
  const fields = $('join-fields');
  fields.hidden = false;
  fields.disabled = false;
}

async function start(firstEntry) {
  if (firstEntry.body) return enterMain();
  let entry = firstEntry;
  const {setQuestion} = await import('./preview.mjs?v=3');
  if (!entry.joined) await setupProfile(entry);
  const updates = typeof BroadcastChannel === 'function' ? new BroadcastChannel('pajang-answers') : null;
  let timer;
  let refreshing = null;

  function paint() {
    $('slot-label').textContent = (entry.slot === 'am' ? '오전' : '오후') + ' 질문';
    setQuestion(themeFor(entry.day, entry.slot));
    clearTimeout(timer);
    const until = Date.parse(entry.nextAt) - Date.now();
    timer = setTimeout(refresh, Math.min(12 * 3600000, Math.max(3000, until + 1000)));
  }

  function refresh() {
    if (refreshing) return refreshing;
    refreshing = call('entry').then(current => {
      if (current.body) return enterMain();
      if (entry.day !== current.day || entry.slot !== current.slot) {
        mine.value = '';
        status.textContent = '새 시간대의 질문이 열렸어요.';
      }
      entry = current;
      paint();
    }).catch(error => {
      if (error.code === '42501') return location.reload();
      clearTimeout(timer);
      timer = setTimeout(refresh, 30000);
    }).finally(() => { refreshing = null; });
    return refreshing;
  }

  if (updates) updates.onmessage = refresh;
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('pagehide', () => { clearTimeout(timer); updates?.close(); }, {once:true});
  paint();
  $('gate').hidden = true;
  $('welcome').hidden = false;
  const write = $('write');
  write.onclick = () => {
    write.hidden = true;
    form.hidden = false;
    write.setAttribute('aria-expanded', 'true');
    mine.focus();
  };
  mine.oninput = () => mine.setCustomValidity('');
  form.onsubmit = async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const body = mine.value.trim();
    if (!body) {
      mine.setCustomValidity('답변을 한 글자 이상 적어 주세요.');
      mine.reportValidity();
      return;
    }
    submit.disabled = true;
    status.textContent = '답변을 저장하고 있어요.';
    try {
      const data = {body, day:entry.day, slot:entry.slot};
      if (!entry.joined) {
        const {province, city, interest, age, consent} = form.elements;
        Object.assign(data, {
          name:form.elements.namedItem('name').value.trim(), age:Number(age.value),
          region:[province.value, city.value].filter(Boolean).join(' '), interest:interest.value, consent:consent.checked
        });
      }
      await call(entry.joined ? 'answer' : 'join', data);
      updates?.postMessage('saved');
      enterMain();
    } catch (error) {
      status.textContent = error.message || '저장하지 못했어요. 다시 시도해 주세요.';
      if (error.code === 'PT409') await refresh();
      submit.disabled = false;
    }
  };
}

const entry = await requireMember();
if (entry) {
  try { await start(entry); }
  catch { showGate('질문을 불러오지 못했어요. 잠시 후 다시 열어 주세요.'); }
}
