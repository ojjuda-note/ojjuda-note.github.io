(() => {
 'use strict';
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const modes = [['all','전체'],['adults','성인전용'],['minors','성인불가'],['range','나이대 설정']];
 const validAge = (value, fallback) => Number.isInteger(Number(value)) && Number(value)>=14 && Number(value)<=120 ? Number(value) : fallback;
 function label(room = {}) {
  if (room.age_policy === 'adults') return '성인전용 · 만 19세 이상';
  if (room.age_policy === 'minors') return '성인불가 · 만 14~18세';
  if (room.age_policy === 'range') return `만 ${validAge(room.min_age,14)}~${validAge(room.max_age,120)}세`;
  return '전체 · 연령 제한 없음';
 }
 function badge(room) { return `<span class="tag age-tag">${escape(label(room))}</span>`; }
 function note(room = {}) { return room.age_eligible === false ? `<p class="hint age-note" role="status">${escape(room.age_note || '이 그룹의 연령 조건에 맞지 않아 이용할 수 없어요.')}</p>` : ''; }
 function fields(room = {}, editing = false) {
  const mode = room.age_policy || 'all', lo = validAge(room.min_age,20), hi = validAge(room.max_age,29);
  return `<fieldset class="age-settings"><legend>참여 연령</legend><label class="field">연령 조건<select name="age_policy">${modes.map(([v,t])=>`<option value="${v}" ${v===mode?'selected':''}>${t}</option>`).join('')}</select></label><div data-age-range ${mode==='range'?'':'hidden'}><label class="field">나이대 빠른 선택<select data-age-preset><option value="">직접 입력</option>${[['14-18','청소년 · 만 14~18세'],['20-29','20대'],['30-39','30대'],['40-49','40대'],['50-59','50대'],['60-69','60대'],['70-120','70세 이상']].map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select></label><div class="two"><label class="field">최소 나이<input name="min_age" type="number" min="14" max="120" step="1" inputmode="numeric" value="${lo}" ${mode==='range'?'required':'disabled'}></label><label class="field">최대 나이<input name="max_age" type="number" min="14" max="120" step="1" inputmode="numeric" value="${hi}" ${mode==='range'?'required':'disabled'}></label></div></div><p class="hint">성인전용: 만 19세 이상 · 성인불가: 만 14~18세.<br>한국 시간 기준, 가입 시 입력한 생년월일로 판단해요. 본인인증된 정보는 아니에요. 방장도 같은 조건을 충족해야 해요.${editing?'<br>기존 그룹원이 새 조건에 맞지 않으면 변경할 수 없어요.':''}</p></fieldset>`;
 }
 function bind(form) {
  if (!form?.elements.age_policy) return;
  const mode=form.elements.age_policy, lo=form.elements.min_age, hi=form.elements.max_age;
  const range=form.querySelector('[data-age-range]'), preset=form.querySelector('[data-age-preset]');
  const validate=()=>hi.setCustomValidity(mode.value==='range' && lo.value!=='' && hi.value!=='' && Number(lo.value)>Number(hi.value)?'최대 나이는 최소 나이 이상이어야 해요.':'');
  const sync=()=>{const on=mode.value==='range';range.hidden=!on;for(const el of [lo,hi]){el.disabled=!on;el.required=on;}preset.disabled=!on;validate();};
  mode.addEventListener('change',sync);
  for(const el of [lo,hi])el.addEventListener('input',()=>{preset.value='';validate();});
  preset.addEventListener('change',()=>{if(preset.value){[lo.value,hi.value]=preset.value.split('-');validate();}});
  sync();
 }
 window.OjjudaGroupAge=Object.freeze({label,badge,note,fields,bind});
})();
