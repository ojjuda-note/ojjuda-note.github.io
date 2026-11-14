// A short local form journey. Moving between steps never opens or purchases a reading.
let enginePromise;
const controllers=new WeakMap();

function fieldsFor(form,person) {
  const doc=form.ownerDocument;
  const id=part=>person==='general'
    ? ({name:'person-name',gender:'person-gender',calendar:null,'time-unknown':'time-unknown','leap-month':'leap-month'}[part]||'birth-'+part)
    : person+'-'+part;
  const field=part=>doc.getElementById(id(part));
  const value=part=>field(part)?.value||'';
  const calendar=person==='general'?form.querySelector('input[name="calendar"]:checked')?.value:value('calendar');
  const unknown=field('time-unknown')?.checked===true;
  return {field,name:value('name'),gender:value('gender'),birth:{
    year:Number(value('year')),month:Number(value('month')),day:Number(value('day')),
    calendar:calendar||'solar',leapMonth:field('leap-month')?.checked===true,
    hour:unknown?null:value('hour')===''?NaN:Number(value('hour')),
    minute:unknown?0:value('minute')===''?NaN:Number(value('minute')),
  }};
}

export function attachEntryFlow(form) {
  if(!form?.hasAttribute('data-entry-flow'))return {reset(){},refresh(){}};
  if(controllers.has(form))return controllers.get(form);
  const doc=form.ownerDocument,win=doc.defaultView;
  const panels=[...form.querySelectorAll('[data-flow-step]')];
  const next=form.querySelector('[data-flow-next]'),back=form.querySelector('[data-flow-back]');
  const submit=form.querySelector('button[type="submit"]');
  const validated=new Map(),marked=new Set();
  let index=0,pending=null,sequence=0;
  const busy=()=>form.getAttribute('aria-busy')==='true';
  const personFor=panel=>panel.dataset.flowPerson;
  const stamp=panel=>JSON.stringify(fieldsFor(form,personFor(panel)).birth);
  const invalidField=panel=>[...panel.querySelectorAll('input,select,textarea')].find(field=>field.willValidate&&!field.validity.valid);
  const reduced=()=>doc.documentElement.dataset.reducedMotion==='true'||(doc.documentElement.dataset.reducedMotion!=='false'&&win.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const create=(tag,className,text)=>{const node=doc.createElement(tag);node.className=className;if(text!=null)node.textContent=text;return node;};

  function clearErrors() {
    for(const error of form.querySelectorAll('[data-flow-error]')){error.hidden=true;error.textContent='';}
    for(const field of marked) {
      const ids=(field.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&!id.startsWith(form.id+'-flow-error-'));
      if(ids.length)field.setAttribute('aria-describedby',ids.join(' '));else field.removeAttribute('aria-describedby');
      field.removeAttribute('aria-invalid');
    }
    marked.clear();
  }
  function review() {
    for(const host of form.querySelectorAll('[data-flow-review]')) {
      host.replaceChildren();
      for(const [step,panel] of panels.entries()) {
        const person=personFor(panel);if(!person)continue;
        const data=fieldsFor(form,person),birth=data.birth;
        if(!birth.year||!birth.month||!birth.day)continue;
        const card=create('section','flow-review-person');
        const label=person==='general'?'출생 정보':person==='self'?'A · 나의 정보':'B · 상대의 정보';
        const heading=create('div','flow-review-heading');
        heading.append(create('h3','',data.name?`${label} · ${data.name}`:label));
        const edit=create('button','flow-review-edit','수정');edit.type='button';edit.dataset.flowGo=String(step);edit.setAttribute('aria-label',label+' 수정');
        heading.append(edit);card.append(heading);
        const list=create('dl','');
        const add=(title,text)=>{const row=create('div','');row.append(create('dt','',title),create('dd','',text));list.append(row);};
        add('생일',`${birth.calendar==='lunar'?'음력':'양력'} ${birth.year}.${String(birth.month).padStart(2,'0')}.${String(birth.day).padStart(2,'0')}${birth.leapMonth?' · 윤달':''}`);
        add('태어난 시간',birth.hour===null?'시간 모름':`${String(birth.hour).padStart(2,'0')}:${String(birth.minute).padStart(2,'0')}`);
        if(data.gender)add('성별',data.gender==='male'?'남성':'여성');
        card.append(list);host.append(card);
      }
    }
  }
  function render() {
    form.dataset.flowStep=String(index);form.dataset.flowBusy=String(Boolean(pending));
    panels.forEach((panel,step)=>{panel.hidden=step!==index;});
    for(const choice of form.querySelectorAll('.entry-progress [data-flow-go]')) {
      const step=Number(choice.dataset.flowGo);
      if(step===index)choice.setAttribute('aria-current','step');else choice.removeAttribute('aria-current');
      choice.disabled=step>index||Boolean(pending)||busy();
    }
    if(next){next.hidden=index===panels.length-1;next.disabled=Boolean(pending)||busy();next.textContent=pending?'확인 중…':next.dataset.flowNextLabel||'다음';}
    if(back){back.hidden=index===0;back.disabled=Boolean(pending)||busy();}
    if(submit)submit.hidden=index!==panels.length-1;
    for(const edit of form.querySelectorAll('.flow-review-edit'))edit.disabled=Boolean(pending)||busy();
  }
  function show(step,{focus=true}={}) {
    index=Math.max(0,Math.min(panels.length-1,step));clearErrors();review();render();
    if(focus) {
      const heading=panels[index].querySelector('.flow-step-heading')||panels[index];
      heading.tabIndex=-1;heading.focus({preventScroll:true});
      form.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});
    }
  }
  function fail(panel,message,field) {
    const step=panels.indexOf(panel);if(step!==index)show(step,{focus:false});
    const error=panel.querySelector('[data-flow-error]');
    if(error){error.textContent=message;error.hidden=false;}
    if(field) {
      marked.add(field);field.setAttribute('aria-invalid','true');
      if(error)field.setAttribute('aria-describedby',[field.getAttribute('aria-describedby'),error.id].filter(Boolean).join(' '));
      field.focus({preventScroll:true});
      field.scrollIntoView({block:'center',behavior:reduced()?'instant':'smooth'});
    }else{error?.focus({preventScroll:true});panel.scrollIntoView({block:'start',behavior:reduced()?'instant':'smooth'});}
  }
  function requiredMessage(field) {
    if(!field.validity.valueMissing)return '입력한 생년월일과 시간을 확인해 주세요.';
    if(field.id.endsWith('-year'))return '태어난 연도를 입력해 주세요.';
    if(field.id.endsWith('-month'))return '태어난 월을 선택해 주세요.';
    if(field.id.endsWith('-day'))return '태어난 일을 선택해 주세요.';
    if(field.id.endsWith('-hour'))return '태어난 시를 선택해 주세요.';
    if(field.id.endsWith('-minute'))return '태어난 분을 선택해 주세요.';
    return '빈 항목을 먼저 입력해 주세요.';
  }
  function updateYearLimits() {
    const year=Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()));
    for(const panel of panels)if(personFor(panel))fieldsFor(form,personFor(panel)).field('year').max=String(Math.min(2050,year));
  }
  async function advance() {
    if(pending||busy()||index>=panels.length-1)return;
    updateYearLimits();
    clearErrors();
    const panel=panels[index],invalid=invalidField(panel);
    if(invalid){fail(panel,requiredMessage(invalid),invalid);return;}
    const request={id:++sequence,step:index,signature:personFor(panel)?stamp(panel):''};pending=request;render();
    try {
      if(personFor(panel)) {
        enginePromise ||= import('./engine.mjs?v=20261113-saju-brief1').catch(error=>{enginePromise=null;throw error;});
        const {calculateSaju}=await enginePromise;
        if(pending!==request||index!==request.step||busy()||stamp(panel)!==request.signature)return;
        calculateSaju(fieldsFor(form,personFor(panel)).birth);
        validated.set(panel,request.signature);
      }
      if(pending===request&&!busy())show(index+1);
    }catch(error) {
      if(pending!==request)return;
      const data=personFor(panel)?fieldsFor(form,personFor(panel)):null;
      const part=error?.code==='time'?(data?.field('hour')?.value===''?'hour':'minute'):error?.code==='year'||error?.code==='range'?'year':error?.code==='leap-month'?'leap-month':'day';
      fail(panel,error?.name==='SajuInputError'?error.message:'출생 정보를 확인하지 못했어요. 다시 눌러 주세요.',data?.field(part));
    }finally{if(pending===request){pending=null;render();}}
  }
  function validateFinal() {
    updateYearLimits();
    for(const panel of panels) {
      const invalid=invalidField(panel);
      if(invalid){fail(panel,requiredMessage(invalid),invalid);return false;}
      if(personFor(panel)&&validated.get(panel)!==stamp(panel)) {
        fail(panel,'출생 정보를 확인한 뒤 다음으로 넘어가 주세요.',fieldsFor(form,personFor(panel)).field('year'));return false;
      }
    }
    return true;
  }
  function reset({focus=false}={}) {sequence++;pending=null;validated.clear();show(0,{focus});}
  form.noValidate=true;
  form.addEventListener('submit',event=>{
    // The final click reaches the purchase handler synchronously. In particular,
    // an async step check must not replace the price the person actually clicked.
    const finalStep=index===panels.length-1;
    if(finalStep&&!pending&&!busy()&&validateFinal())return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!finalStep&&!pending&&!busy())void advance();
  },true);
  form.addEventListener('click',event=>{
    const control=event.target.closest('[data-flow-next],[data-flow-back],[data-flow-go]');
    if(!control||!form.contains(control)||control.disabled||busy()||pending)return;
    if(control.hasAttribute('data-flow-next'))void advance();
    else if(control.hasAttribute('data-flow-back'))show(index-1);
    else {const step=Number(control.dataset.flowGo);if(Number.isInteger(step)&&step<=index)show(step);}
  });
  form.addEventListener('keydown',event=>{
    if(event.key!=='Enter'||event.isComposing||event.keyCode===229||event.ctrlKey||event.altKey||event.metaKey||index===panels.length-1)return;
    // A disabled final purchase button must not swallow Enter in an earlier
    // text field. Native select and checkbox keyboard behaviour stays intact.
    if(!event.target.matches('input[type="text"],input[type="number"]'))return;
    event.preventDefault();if(!pending&&!busy())void advance();
  });
  function edited(){sequence++;pending=null;clearErrors();render();win.queueMicrotask(()=>{review();render();});}
  form.addEventListener('input',edited);form.addEventListener('change',edited);
  form.addEventListener('reset',()=>{sequence++;pending=null;validated.clear();win.queueMicrotask(()=>reset());});
  const observer=new win.MutationObserver(()=>render());observer.observe(form,{attributes:true,attributeFilter:['aria-busy']});
  const controller={reset,refresh:()=>{
    sequence++;pending=null;
    // A/B swaps may reuse only birth inputs already validated in this journey.
    const known=new Set(validated.values());
    for(const panel of panels)if(personFor(panel)) {
      const signature=stamp(panel);
      if(known.has(signature))validated.set(panel,signature);else validated.delete(panel);
    }
    review();render();
  }};controllers.set(form,controller);
  show(0,{focus:false});return controller;
}
