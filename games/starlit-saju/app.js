const $ = id => document.getElementById(id);
const form = $('birth-form');
const submit = $('open-story');
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = reduceQuery.matches;
let motionOverride = false;
let enginePromise;
let busy = false;
let currentReading = null;
let toastTimer;

const STEM_READINGS = {
  '甲': {name:'갑목',symbol:'곧게 자라는 큰 나무',intro:'갑목은 하늘을 향해 자라는 큰 나무를 상징해요. 자신의 기준을 세우고, 오래 지켜 가고 싶은 가치를 돌아보는 글자예요.',nature:['단단한 뿌리, 넓은 가지','무엇을 시작할 때 나만의 원칙이 힘이 되는지 살펴보세요. 성장을 서두르기보다 이미 쌓아 온 경험을 믿어 보는 것도 좋아요.'],relationship:['곁을 지키는 마음','도움을 주는 만큼 상대의 이야기를 듣는 자리도 남겨 두세요. 내가 생각하는 좋은 방법과 상대가 원하는 방법은 다를 수 있어요.'],work:['긴 호흡으로 자라는 일','한 번에 이루려는 큰 목표를 작은 단계로 나누어 보세요. 계획을 지키는 꾸준함과 필요할 때 방향을 바꾸는 유연함을 함께 떠올려 보세요.']},
  '乙': {name:'을목',symbol:'바람과 함께 자라는 풀',intro:'을목은 부드럽게 뻗어 가는 풀과 덩굴을 상징해요. 주변과 어울리면서도 자신만의 방향을 찾아가는 모습을 떠올려 보세요.',nature:['유연함 안에 있는 힘','낯선 상황에 맞추느라 나의 바람을 뒤로 미루고 있지는 않나요? 유연하게 움직이되 지키고 싶은 한 가지는 분명히 적어 보세요.'],relationship:['다정함에도 경계가 필요해요','마음을 살피는 섬세함은 관계를 부드럽게 만들어요. 다만 모두를 만족시키려 애쓰기보다 가능한 일과 어려운 일을 차분히 나눠 보세요.'],work:['작은 연결에서 자라는 가능성','혼자 완벽한 답을 만들기보다 생각을 나누고 한 번 시도해 보세요. 작은 시도를 꾸준히 모으는 방식이 자신에게 맞는지 돌아보세요.']},
  '丙': {name:'병화',symbol:'주변을 밝히는 햇살',intro:'병화는 넓은 곳을 환하게 비추는 태양을 상징해요. 드러내고 나누는 즐거움, 그리고 스스로 쉬는 시간을 함께 돌아보는 글자예요.',nature:['빛을 나누는 기쁨','좋아하는 일을 이야기할 때 어떤 마음이 드는지 살펴보세요. 밝게 보여야 한다는 부담은 내려놓고, 조용한 날의 나도 받아들여 주세요.'],relationship:['따뜻함을 전하는 속도','먼저 다가가는 마음에 상대의 속도도 함께 담아 보세요. 충분히 기다려 주는 태도 역시 따뜻함을 전하는 방법이에요.'],work:['열정이 오래 머무르도록','의욕이 생겼을 때 시작할 작은 일부터 정해 보세요. 쉬는 시간을 계획에 넣으면 처음의 열정을 오래 이어 가는 데 도움이 돼요.']},
  '丁': {name:'정화',symbol:'어둠을 밝혀 주는 등불',intro:'정화는 가까운 곳을 따뜻하게 비추는 등불을 상징해요. 작은 차이를 알아보는 마음과 한 가지에 정성을 기울이는 모습을 떠올려 보세요.',nature:['조용하지만 선명한 빛','마음을 오래 붙잡는 관심사가 무엇인지 살펴보세요. 작은 감각과 생각을 적어 두면 나만의 취향을 더 또렷하게 알아갈 수 있어요.'],relationship:['나의 온기도 돌보기','상대를 챙기느라 내 마음이 지치지 않았는지 물어보세요. 배려를 주고받는 균형과 솔직하게 부탁하는 용기를 함께 생각해 보세요.'],work:['정성이 모여 만드는 깊이','잘하고 싶은 한 가지에 집중할 시간을 마련해 보세요. 세부를 다듬는 만큼 어디에서 마무리할지 정해 두는 것도 좋아요.']},
  '戊': {name:'무토',symbol:'든든하게 서 있는 산',intro:'무토는 넓고 단단한 산을 상징해요. 흔들리는 순간에도 중심을 찾는 마음, 익숙한 틀을 조금 넓히는 여유를 돌아보는 글자예요.',nature:['나를 지탱하는 중심','안정감을 주는 일상의 습관을 찾아보세요. 늘 해 오던 방식이 편안하더라도, 지금의 나에게 맞는지 가끔 새롭게 살펴볼 수 있어요.'],relationship:['듣는 자리도 넉넉하게','책임지려는 마음이 앞설 때 상대가 바라는 도움을 먼저 물어보세요. 해결해 주기보다 곁에서 들어 주는 것으로 충분한 순간도 있어요.'],work:['튼튼한 기초 위의 변화','과정을 차근차근 정리하고 한 단계씩 확인해 보세요. 쌓아 온 방식을 존중하면서 새로운 방법도 작게 시험해 보는 여지를 두세요.']},
  '己': {name:'기토',symbol:'생명을 품는 부드러운 대지',intro:'기토는 씨앗을 품고 돌보는 흙을 상징해요. 일상을 가꾸는 세심함과 가까운 사람을 보살피는 마음을 돌아보는 글자예요.',nature:['작은 돌봄이 쌓이는 곳','눈에 띄지 않는 수고 중 나에게 소중한 일을 찾아보세요. 누군가를 돌보듯 내 몸과 마음의 여유도 일상에 함께 남겨 주세요.'],relationship:['편안함을 나누는 사이','작은 관심이 상대에게 어떻게 전해지는지 물어보세요. 혼자 짐을 맡기보다 함께 나눌 수 있는 일을 구체적으로 이야기해 보세요.'],work:['꼼꼼함에 여백을 더하기','정리하고 가꾸는 일을 작은 순서로 만들어 보세요. 모두 완벽히 준비될 때까지 기다리기보다 충분한 지점에서 시작해도 괜찮아요.']},
  '庚': {name:'경금',symbol:'형태를 잡는 단단한 쇠',intro:'경금은 단단한 금속을 상징해요. 기준을 분명히 세우고 불필요한 것을 덜어 내는 힘, 그 기준을 전하는 방식을 함께 돌아보세요.',nature:['선명한 기준의 힘','무엇이 중요하고 무엇을 내려놓아도 되는지 나눠 보세요. 결정을 내리는 힘에 다시 생각할 여유가 더해지면 선택이 한층 편안해질 수 있어요.'],relationship:['분명함에 부드러움을 담아','솔직한 말이 필요한 순간에도 상대의 감정을 먼저 살펴보세요. 말하려는 내용과 함께 어떤 방식으로 전할지도 생각해 보세요.'],work:['결단을 작은 실행으로','해야 할 일을 선명하게 정하고 바로 옮길 한 단계를 찾아보세요. 결과를 확인하며 방법을 고쳐 가는 과정도 계획의 일부로 남겨 두세요.']},
  '辛': {name:'신금',symbol:'섬세하게 빛나는 보석',intro:'신금은 정교하게 다듬은 보석을 상징해요. 작은 차이를 알아보는 감각과 자신만의 기준을 소중히 여기는 마음을 떠올려 보세요.',nature:['나만의 빛을 알아보기','마음이 편안해지는 취향과 환경을 살펴보세요. 자신을 다듬는 일만큼 이미 가진 좋은 점을 인정하는 시간도 필요해요.'],relationship:['기대하는 마음을 말로','세심하게 알아주길 바라는 마음이 있다면 작은 말로 먼저 전해 보세요. 서로 다른 기준을 알아가는 과정 자체가 관계를 깊게 할 수 있어요.'],work:['완성도와 마침표 사이','중요한 부분에 정성을 쓰되 모든 부분을 같은 기준으로 다듬을 필요는 없어요. 끝내는 시간을 정하고 다음 경험에서 배울 여지를 남겨 보세요.']},
  '壬': {name:'임수',symbol:'넓게 흐르는 큰 물',intro:'임수는 강과 바다처럼 넓게 흐르는 물을 상징해요. 새로운 것을 품는 넓은 시야와 여러 가능성 사이에서 방향을 찾는 마음을 돌아보세요.',nature:['흐름 속에서 찾는 방향','여러 생각이 떠오를 때 지금 가장 마음이 가는 하나를 골라 보세요. 열린 가능성에 작은 방향표가 더해지면 움직이기 편해질 수 있어요.'],relationship:['넓게 듣고 분명히 전하기','다른 관점을 받아들이면서도 나의 생각을 짧게 표현해 보세요. 가까운 관계에서는 솔직한 한마디가 긴 추측보다 도움이 될 때가 있어요.'],work:['가능성을 한 걸음으로','새로운 정보를 모은 뒤 직접 해 볼 작은 일을 정해 보세요. 탐색하는 시간과 실행하는 시간을 나누면 생각을 현실에 연결하기 쉬워져요.']},
  '癸': {name:'계수',symbol:'조용히 스며드는 빗물',intro:'계수는 이슬과 빗물처럼 조용히 스며드는 물을 상징해요. 자세히 관찰하는 마음과 깊이 생각하는 시간을 돌아보는 글자예요.',nature:['작은 신호를 알아보는 마음','마음에 남는 장면과 생각을 짧게 기록해 보세요. 모든 신호의 의미를 찾으려 하기보다 지금 느끼는 감정부터 살펴봐도 괜찮아요.'],relationship:['작은 말로 여는 마음','상대의 마음을 오래 짐작하기보다 궁금한 점을 부드럽게 물어보세요. 나의 바람을 구체적으로 나누면 서로를 이해할 단서가 생겨요.'],work:['깊은 생각을 밖으로 꺼내기','충분히 살펴본 생각 중 하나를 짧은 메모나 작은 결과물로 만들어 보세요. 혼자 다듬는 시간과 의견을 듣는 시간을 번갈아 가져 보세요.']}
};

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function appendOptions(select, start, end, suffix, pad = false) {
  const fragment = document.createDocumentFragment();
  for (let value = start; value <= end; value++) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = (pad ? String(value).padStart(2, '0') : String(value)) + suffix;
    fragment.append(option);
  }
  select.append(fragment);
}

appendOptions($('birth-month'), 1, 12, '월');
appendOptions($('birth-day'), 1, 31, '일');
appendOptions($('birth-hour'), 0, 23, '시', true);
appendOptions($('birth-minute'), 0, 59, '분', true);
$('birth-year').max = String(Math.min(2050, Number(new Intl.DateTimeFormat('en', {year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()))));

function setMotion() {
  document.documentElement.dataset.reducedMotion = String(reducedMotion);
  $('motion-toggle').setAttribute('aria-pressed', String(reducedMotion));
  const label = reducedMotion ? '움직임 다시 켜기' : '움직임 줄이기';
  $('motion-toggle').setAttribute('aria-label', label);
  $('motion-toggle').title = label;
}
setMotion();
$('motion-toggle').addEventListener('click', () => {
  motionOverride = true;
  reducedMotion = !reducedMotion;
  setMotion();
});
reduceQuery.addEventListener?.('change', event => {
  if (!motionOverride) { reducedMotion = event.matches; setMotion(); }
});

function clearError() {
  $('form-error').hidden = true;
  $('form-error').textContent = '';
  form.querySelectorAll('[aria-invalid]').forEach(field => {
    field.removeAttribute('aria-invalid');
    const description = (field.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== 'form-error').join(' ');
    if (description) field.setAttribute('aria-describedby', description);
    else field.removeAttribute('aria-describedby');
  });
}
function markInvalidFields(error) {
  const date = ['birth-year','birth-month','birth-day'];
  const fields = {year:['birth-year'],date:[...date,...($('leap-month').checked ? ['leap-month'] : [])],'leap-month':['leap-month'],time:['birth-hour','birth-minute'],future:date,range:['birth-year']}[error.code] || [];
  fields.forEach(id => {
    const field = $(id);
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'),'form-error'].filter(Boolean).join(' '));
  });
}
function updateCalendar() {
  const lunar = form.querySelector('input[name="calendar"]:checked').value === 'lunar';
  $('leap-option').hidden = !lunar;
  $('leap-month').disabled = !lunar;
  if (!lunar) $('leap-month').checked = false;
  clearError();
}
function updateTime() {
  const unknown = $('time-unknown').checked;
  $('time-fields').hidden = unknown;
  $('birth-hour').disabled = unknown;
  $('birth-minute').disabled = unknown;
  $('time-help').textContent = unknown ? '시간을 몰라도 기본 풀이를 볼 수 있어요.' : '한국 표준시로 입력해 주세요. 00시는 자정, 12시는 정오예요.';
  clearError();
}
form.querySelectorAll('input[name="calendar"]').forEach(input => input.addEventListener('change', updateCalendar));
$('time-unknown').addEventListener('change', updateTime);
form.addEventListener('input', clearError);
updateCalendar();
updateTime();

function renderPillar(pillar, index) {
  const card = element('article', 'pillar-card' + (pillar.key === 'day' ? ' is-day' : ''));
  card.style.setProperty('--i', index);
  card.append(element('h3', 'pillar-label', pillar.label));
  card.append(element('span', 'pillar-caption', {year:'태어난 해',month:'태어난 달',day:'태어난 날',hour:'태어난 시'}[pillar.key]));
  if (pillar.hanja && pillar.stem && pillar.branch) {
    const glyphs = element('div', 'pillar-glyphs');
    [pillar.stem, pillar.branch].forEach((part, partIndex) => {
      const glyph = element('span', 'pillar-glyph', part.hanja);
      glyph.style.setProperty('--element-color', part.color);
      glyph.append(element('small', '', `${part.hangul} · ${partIndex ? '지지' : '천간'}`));
      glyphs.append(glyph);
    });
    card.append(glyphs, element('p', 'pillar-name', pillar.hangul));
    card.append(element('p', 'pillar-elements', `${pillar.stem.elementLabel} · ${pillar.branch.elementLabel}`));
  } else {
    card.append(element('div', 'pillar-unknown', '✧'));
    card.append(element('p', 'pillar-status', pillar.alternatives?.length ? '시간 확인 필요' : '시간 미상'));
    if (pillar.alternatives?.length) {
      const choices = element('div', 'pillar-alternatives');
      pillar.alternatives.forEach(choice => choices.append(element('span', '', `${choice.hanja} ${choice.hangul}`)));
      card.append(choices, element('p', 'pillar-empty-note', '절기 전후에 따라 달라져요.'));
    } else card.append(element('p', 'pillar-empty-note', '시간을 알면 펼칠 수 있어요.'));
  }
  return card;
}

function renderReading(result) {
  $('result-pillars').replaceChildren(...result.pillars.map(renderPillar));
  $('birth-summary').textContent = `양력 ${result.solar.label} · ${result.timeLabel || (result.timeKnown ? '시간 입력' : '태어난 시간 모름')}`;
  $('lunar-summary').textContent = `음력 ${result.lunar.label}`;
  const warningNodes = result.warnings.map(message => element('p', '', message));
  $('result-warnings').replaceChildren(...warningNodes);
  $('result-warnings').hidden = warningNodes.length === 0;
  const stem = result.dayMaster;
  const reading = STEM_READINGS[stem.hanja];
  $('day-master-glyph').textContent = stem.hanja;
  $('day-master-glyph').style.setProperty('--element-color', stem.color);
  $('day-master-title').textContent = `${reading.name} · ${stem.hanja}${{wood:'木',fire:'火',earth:'土',metal:'金',water:'水'}[stem.element]}`;
  $('day-master-symbol').textContent = reading.symbol;
  $('day-master-reading').textContent = reading.intro;
  [['nature','nature'],['relationship','relationship'],['work','work']].forEach(([id,key]) => {
    $(id+'-title').textContent = reading[key][0];
    $(id+'-reading').textContent = reading[key][1];
  });
  $('element-count').textContent = `확인된 ${result.knownCharacterCount}글자`;
  const rows = result.elements.map(item => {
    const row = element('div', 'element-row');
    row.style.setProperty('--element-color', item.color);
    const label = element('span', 'element-label');
    label.append(element('b', '', item.hanja), document.createTextNode(item.label));
    const track = element('div', 'element-track');
    track.setAttribute('aria-hidden', 'true');
    const fill = element('div', 'element-fill');
    fill.style.width = `${result.knownCharacterCount ? item.count / result.knownCharacterCount * 100 : 0}%`;
    track.append(fill);
    row.append(label, track, element('span', 'element-value', `${item.count}개`));
    return row;
  });
  $('element-bars').replaceChildren(...rows);
  $('convention-list').replaceChildren(...result.conventions.map(message => element('li', '', message)));
  $('intro').hidden = true;
  $('result').hidden = false;
  document.querySelector('.skip-link').href = '#result-title';
  document.querySelector('.skip-link').textContent = '사주 결과로 바로가기';
  $('result-title').focus({preventScroll:true});
  window.scrollTo({top:0,behavior:reducedMotion ? 'instant' : 'smooth'});
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  busy = true;
  submit.disabled = true;
  submit.querySelector('span').textContent = '별빛을 모으는 중…';
  form.setAttribute('aria-busy', 'true');
  clearError();
  const input = {
    year:Number($('birth-year').value), month:Number($('birth-month').value), day:Number($('birth-day').value),
    calendar:form.querySelector('input[name="calendar"]:checked').value,
    leapMonth:$('leap-month').checked,
    hour:$('time-unknown').checked ? null : Number($('birth-hour').value),
    minute:$('time-unknown').checked ? 0 : Number($('birth-minute').value)
  };
  form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = true; });
  try {
    enginePromise ||= import('./engine.mjs?v=20261112-starlit-saju1').catch(error => { enginePromise = null; throw error; });
    const {calculateSaju} = await enginePromise;
    const result = calculateSaju(input);
    currentReading = result;
    renderReading(result);
  } catch (error) {
    $('form-error').textContent = error?.name === 'SajuInputError' ? error.message : '지금은 이야기를 펼치지 못했어요. 잠시 후 다시 눌러 주세요.';
    if (error?.name === 'SajuInputError') markInvalidFields(error);
    $('form-error').hidden = false;
    $('form-error').focus({preventScroll:true});
    $('form-error').scrollIntoView({block:'nearest',behavior:reducedMotion ? 'instant' : 'smooth'});
  } finally {
    busy = false;
    submit.disabled = false;
    submit.querySelector('span').textContent = '나의 사주팔자 펼치기';
    form.querySelectorAll('fieldset').forEach(fieldset => { fieldset.disabled = false; });
    form.removeAttribute('aria-busy');
  }
});
// Keep the form inert until its handler is ready. Birth fields also have no
// name attribute, so a failed script cannot put birth data into a GET request.
submit.disabled = false;

$('edit-birth').addEventListener('click', () => {
  $('result').hidden = true;
  $('intro').hidden = false;
  document.querySelector('.skip-link').href = '#birth-form';
  document.querySelector('.skip-link').textContent = '출생 정보 입력으로 바로가기';
  clearError();
  $('birth-year').focus({preventScroll:true});
  form.scrollIntoView({block:'center',behavior:reducedMotion ? 'instant' : 'smooth'});
});

function toast(message) {
  clearTimeout(toastTimer);
  $('status').textContent = message;
  $('status').classList.add('is-visible');
  toastTimer = setTimeout(() => $('status').classList.remove('is-visible'), 2600);
}

$('copy-reading').addEventListener('click', async () => {
  if (!currentReading) return;
  const reading = STEM_READINGS[currentReading.dayMaster.hanja];
  // Deliberately omit the entered birth date and time from the copied reading.
  const lines = ['오쭈다 · 별빛 사주팔자','', ...currentReading.pillars.map(p => `${p.label}: ${p.hanja ? `${p.hanja} (${p.hangul})` : p.alternatives?.length ? `시간 확인 필요 (${p.alternatives.map(a => a.hangul).join(' / ')})` : '시간 미상'}`), '', `${reading.name} · ${reading.symbol}`, reading.intro, '', ...['nature','relationship','work'].flatMap(key => [reading[key][0],reading[key][1],'']), ...currentReading.warnings, '전통 명리 해석을 바탕으로 나를 돌아보는 시간이에요.'];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    toast('생년월일을 제외한 풀이를 복사했어요.');
  } catch {
    toast('복사 권한을 확인해 주세요. 풀이를 직접 선택해 복사할 수도 있어요.');
  }
});
