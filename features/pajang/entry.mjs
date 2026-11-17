import {call,requireMember} from './member.mjs?v=3';
import {themeFor,interests,regions} from './questions.mjs?v=3';

const entry=await requireMember();
if(entry) {
  const {setQuestion}=await import('./preview.mjs?v=3');
  const $=id=>document.getElementById(id), form=$('answer-form'),write=$('write'),mine=$('mine'),status=$('my-answer');
  setQuestion(themeFor(entry.day));
  $('gate').hidden=true;$('welcome').hidden=false;
  mine.value=entry.body||'';
  if(entry.body){write.textContent='오늘의 답변 수정하기';$('return-main').hidden=false;}
  if(!entry.joined){
    const fields=$('join-fields');fields.hidden=false;
    fields.innerHTML='<div class="fieldrow"><label>닉네임<input name="name" required maxlength="12"></label><label>만 나이<input name="age" type="number" min="19" max="110" required></label></div><div class="fieldrow"><label>활동 지역<select name="region"></select></label><label>나의 취향<select name="interest"></select></label></div><label class="consent"><input name="consent" type="checkbox" required> 만 19세 이상이며 닉네임·나이·지역·취향과 오늘의 답변을 파장 회원에게 공개합니다.</label>';
    form.elements.name.value=entry.nickname||'';
    if(entry.age!=null){form.elements.age.value=entry.age;form.elements.age.readOnly=true;}
    for(const r of regions)form.elements.region.add(new Option(r,r));
    for(const i of interests)form.elements.interest.add(new Option(i.name,i.key));
  }
  write.onclick=()=>{write.hidden=true;form.hidden=false;write.setAttribute('aria-expanded','true');mine.focus();};
  mine.oninput=()=>mine.setCustomValidity('');
  form.onsubmit=async event=>{
    event.preventDefault();const submit=form.querySelector('[type=submit]');if(submit.disabled)return;
    const body=mine.value.trim();if(!body){mine.setCustomValidity('답변을 한 글자 이상 적어 주세요.');mine.reportValidity();return;}
    submit.disabled=true;status.textContent='답변을 저장하고 있어요.';
    try{
      const data={body,day:entry.day};
      if(!entry.joined)Object.assign(data,{name:form.elements.name.value.trim(),age:Number(form.elements.age.value),region:form.elements.region.value,interest:form.elements.interest.value,consent:form.elements.consent.checked});
      await call(entry.joined?'answer':'join',data);
      window.top.location.assign(new URL('./station.html',location.href).href);
    }catch(e){status.textContent=e.message||'저장하지 못했어요. 다시 시도해 주세요.';submit.disabled=false;}
  };
}
