import {call, client, sameMember, requireMember, showGate, answeredRound} from './member.mjs?v=20261126-adult-service1';
import {mountStation, prepareProgram} from './load-station.mjs?v=20261125-lazy-station1';
import {enhanceGuestGate} from './entry-design.mjs?v=20261122-org-display-only1';
import {prepareLocation} from './location.mjs?v=20261125-location-permission1';
import {themeFor, interests} from './questions.mjs?v=20261120-question-copy1';
import {maskedTextLength,textInputMaxLength} from '../../shared/content/text-length.mjs';

const $ = id => document.getElementById(id);
const form = $('answer-form');
const mine = $('mine');
const status = $('my-answer');
const submit = form.querySelector('[type=submit]');
const main = new URL('./station.html', document.baseURI);
const feed = new URL('./station.html#answers', document.baseURI);
const params = new URL(location.href).searchParams;
const view = params.get('view');
const next = params.get('next');
const destinations = {radar:'레이더',inbox:'마음함',chat:'마음함',profile:'내 파장'};
const nextName = Object.hasOwn(destinations,next) ? destinations[next] : '모두의 답변';
if (Object.hasOwn(destinations,next)) {
  feed.hash='';
  feed.searchParams.set('tab',next);
}

// Keep the same document and masthead when a member finishes the entry step.
let handoff;
let program;
let openProgram;
let leaveEntry=()=>{};
function enterMain(destination = main, savedStation) {
  if (window.top !== window) {
    if(!window.frameElement?.isConnected && params.get('embed')==='1')return;
    leaveEntry();
    window.top.location.assign(destination.href);return;
  }
  if (handoff) return handoff;
  openProgram?.();
  leaveEntry();
  $('welcome').hidden=true;
  $('gate').hidden=false;
  window.scrollTo(0,0);
  handoff=(async()=>{
    const style=document.createElement('link');
    style.rel='stylesheet';
    style.dataset.pajangStationStyle='main';
    style.media='print';
    style.href='./station.css?v=20261125-taste-limit1';
    const styled=new Promise((resolve,reject)=>{style.onload=resolve;style.onerror=reject;});
    document.querySelector('link[href*="shell.css"]').before(style);
    await Promise.all([styled,mountStation(async()=>{
      await styled;
      document.getElementById('entry-style').disabled=true;
      style.media='all';
      history.replaceState(history.state,'',destination.href);
      window.scrollTo(0,0);
    },savedStation,program,destination)]);
  })().catch(()=>location.replace(destination.href));
  return handoff;
}

function setupProfile(entry) {
  const {province, city, interest} = form.elements;
  const name = form.elements.namedItem('name');
  name.value = entry.nickname || '';
  name.oninput = () => { name.maxLength = textInputMaxLength(name.value,12); };
  name.oninput();
  for (const item of interests) interest.add(new Option(item.name, item.key));
  const fields = $('join-fields');
  fields.hidden = false;
  fields.disabled = false;
  // Region is optional; the rest of the form can be used before the choices arrive.
  fetch('./regions.json?v=rounds1').then(response => {
    if (!response.ok) throw Error();
    return response.json();
  }).then(catalog => {
    for (const name of Object.keys(catalog)) province.add(new Option(name, name));
    province.onchange = () => {
      const places = catalog[province.value] || [];
      city.replaceChildren(new Option('시·도만 공개', ''));
      for (const place of places) city.add(new Option(place, place));
      $('city-field').hidden = !places.length;
    };
  }).catch(() => { province.disabled = true; });
}

async function start(firstEntry) {
  if (view === 'feed' && firstEntry.joined) return enterMain(feed);
  if (firstEntry.body) return enterMain();
  let entry = firstEntry;
  let radar;
  const choiceList = $('choice-list');
  let choiceKey;
  let saving = false;
  function selectedChoice() { return choiceList.querySelector('input:checked'); }
  function updateAnswer() {
    const picked = selectedChoice();
    const length = maskedTextLength(mine.value);
    mine.required = !picked;
    $('entry-count').textContent = length+' / 220';
    mine.maxLength = textInputMaxLength(mine.value,220);
    mine.setCustomValidity('');
    submit.textContent = mode === 'feed' ? '참여하고 '+nextName+' 보기' : '답변하기';
    submit.disabled = saving || (mode === 'answer' && !picked && (!mine.value.trim() || length>220));
  }
  function paintChoices(theme) {
    const samples = [...new Set((theme.answers||[]).filter(x=>typeof x==='string'&&x.trim()&&maskedTextLength(x)<=220))];
    const key = JSON.stringify([entry.day,entry.slot,theme.id,theme.q,samples]);
    if (key===choiceKey) return;
    if (choiceKey!==undefined) mine.value='';
    choiceKey=key;
    choiceList.replaceChildren(...samples.map(value=>{
      const label=document.createElement('label');
      label.className='pajang-option';
      const radio=document.createElement('input');
      radio.type='radio';radio.name='sample-answer';radio.value=value;
      label.append(radio,document.createTextNode(value));
      return label;
    }));
    $('sample-choices').hidden=!samples.length;
    updateAnswer();
  }
  choiceList.onchange=()=>{mine.value='';updateAnswer();};
  mine.oninput=()=>{const picked=selectedChoice();if(picked)picked.checked=false;updateAnswer();};
  const radarPanel=document.querySelector('.sample-radar');
  async function openRadar(){
    if(!radarPanel.open)return;
    try{
      radar=await import('./preview.mjs?v=compass8');
      radar.setQuestion(entry.question??themeFor(entry.day,entry.slot));
    }catch{document.getElementById('sensor-note').textContent='레이더를 불러오지 못했어요. 접었다가 다시 열어 주세요.';}
  }
  radarPanel.addEventListener('toggle',openRadar);
  if(radarPanel.open)void openRadar();
  if (!entry.joined) setupProfile(entry);
  const updates = typeof BroadcastChannel === 'function' ? new BroadcastChannel('pajang-answers') : null;
  let timer;
  let refreshing = null;
  let mode = 'answer';

  function paint() {
    $('slot-label').textContent = (entry.slot === 'am' ? '오전' : '오후') + ' 질문';
    const theme=entry.question??themeFor(entry.day,entry.slot);
    $('entry-question').textContent=theme.q.join(' ');
    radar?.setQuestion(theme);
    const gender=['male','female'].includes(entry.accountGender)?entry.accountGender:'';
    $('join-fields').dataset.genderTone=gender;
    $('entry-profile-legend').setAttribute('aria-label', gender ? '파장 첫 참여, 가입 성별 '+(gender==='male'?'남성':'여성') : '파장 첫 참여');
    paintChoices(theme);
    updateAnswer();
    clearTimeout(timer);
    const until = Date.parse(entry.nextAt) - Date.now();
    timer = setTimeout(refresh, Math.min(12 * 3600000, Math.max(3000, until + 1000)));
  }

  function refresh() {
    if (refreshing) return refreshing;
    refreshing = call('entry').then(current => {
      if (handoff) return;
      if (current.joined && mode === 'feed') return enterMain(feed);
      if (current.body) return enterMain();
      if (current.joined && !entry.joined) {
        $('join-fields').disabled = true;
        $('join-fields').hidden = true;
      }
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
  const onVisible=()=>{if(!document.hidden)refresh();};
  document.addEventListener('visibilitychange',onVisible);
  const locationRead=new AbortController();
  leaveEntry=()=>{
    locationRead.abort();
    clearTimeout(timer);
    updates?.close();
    radarPanel.removeEventListener('toggle',openRadar);
    document.removeEventListener('visibilitychange',onVisible);
    window.dispatchEvent(new Event('pajang-entry-exit'));
  };
  window.addEventListener('pagehide',leaveEntry,{once:true});
  paint();
  $('gate').hidden = true;
  $('welcome').hidden = false;
  // Questions are usable while the browser finds a position or waits for permission.
  void client().then(async db=>{
    const {data:{session}}=await db.auth.getSession();
    if(!session?.user||locationRead.signal.aborted||!await sameMember(db))return;
    await prepareLocation(entry,db,session.user.id,{signal:locationRead.signal});
  }).catch(()=>{});
  if(entry.locationNotice)status.textContent=entry.locationNotice;
  const write = $('write');
  const browse = $('browse');
  const answerFields = $('answer-fields');
  function openForm(destination, focus = true) {
    mode = destination;
    if (destination === 'feed' && entry.joined) return enterMain(feed);
    const joiningOnly = destination === 'feed';
    write.hidden = true;
    browse.hidden = true;
    form.hidden = false;
    answerFields.hidden = joiningOnly;
    answerFields.disabled = joiningOnly;
    updateAnswer();
    write.setAttribute('aria-expanded', String(!joiningOnly));
    if (focus) (!entry.joined ? form.elements.consent : mine).focus();
  }
  write.onclick = () => openForm('answer');
  browse.onclick = () => openForm('feed');
  $('cancel-form').onclick = () => {
    if (saving) return;
    const trigger = mode === 'feed' ? browse : write;
    mode = 'answer';
    write.hidden = false;
    browse.hidden = false;
    form.hidden = true;
    write.setAttribute('aria-expanded', 'false');
    status.textContent = '';
    trigger.focus();
  };
  // This screen is only reached after a verified member session. Skip its
  // second welcome action and show the answer immediately, without opening the
  // mobile keyboard. A first-time member still completes consent in this form.
  if (view === 'feed' || view === 'write') openForm(view === 'feed' ? 'feed' : 'answer');
  else openForm('answer', false);
  // The member has passed Auth and Pajang membership checks. Installed-app
  // launches show the answer directly, not the decorated public entry scene.
  $('welcome').dataset.memberEntry = 'direct';
  form.onsubmit = async event => {
    event.preventDefault();
    if (saving) return;
    updateAnswer();
    const body = selectedChoice()?.value ?? mine.value.trim();
    if (mode === 'answer' && !body) {
      mine.setCustomValidity('답변을 한 글자 이상 적어 주세요.');
      mine.reportValidity();
      return;
    }
    saving = true;
    updateAnswer();
    const joiningOnly = mode === 'feed';
    status.textContent = joiningOnly ? '참여 정보를 확인하고 있어요.' : '답변을 저장하고 있어요.';
    try {
      const data = joiningOnly ? {} : {body, day:entry.day, slot:entry.slot, archive:true, publicationPolicy:"year-v1"};
      if (!joiningOnly && entry.question) data.questionId = entry.question.id;
      if (!entry.joined) {
        const {province, city, interest, consent} = form.elements;
        Object.assign(data, {
          name:form.elements.namedItem('name').value.trim(),
          region:[province.value, city.value].filter(Boolean).join(' '), interest:interest.value, consent:consent.checked
        });
      }
      const action = joiningOnly ? 'participate' : entry.joined ? 'answer' : 'join';
      const saved=await call(action, data);
      updates?.postMessage('saved');
      enterMain(joiningOnly ? feed : main,saved);
    } catch (error) {
      status.textContent = error.message || '저장하지 못했어요. 다시 시도해 주세요.';
      if (error.code === 'PT409') await refresh();
      saving = false;
      updateAnswer();
    }
  };
}

let entryAction;
let entry = await requireMember(user => entryAction=answeredRound()===user?'state':'entry', db=>{
  // Warm the private program once the server authorizes this account.
  const ready=new Promise(resolve=>{openProgram=resolve;});
  program=prepareProgram(db,ready);
  program.catch(()=>{program=undefined;});
}, result=>{
  // The entry form only needs the private program when it opens the main screen.
  const needed=entryAction==='state'
    ? result?.authenticated&&(result.me?.body||view==='feed')
    : result?.body||(view==='feed'&&result?.joined);
  if(needed)openProgram?.();
});
if (entry) {
  try {
    if(entryAction==='state' && entry.authenticated && (entry.me?.body || view==='feed')) {
      await enterMain(view==='feed'?feed:main,entry);
    } else {
      // A round or membership can change since the routing hint was recorded.
      if(entryAction==='state')entry=await call('entry');
      await start(entry);
    }
  }
  catch { showGate('질문을 불러오지 못했어요. 잠시 후 다시 열어 주세요.'); }
} else enhanceGuestGate();

