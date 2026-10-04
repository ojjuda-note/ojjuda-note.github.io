/* Personal tools: per-account storage on this browser, no contacts permission yet. */
(function(){
 'use strict';
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const btn=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
 const field=(title,type='text',value='')=>{const label=el('label',title),input=el('input');input.type=type;input.value=value;label.append(input);return {label,input};};
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const money=n=>n.toLocaleString('ko-KR')+'원';
 const states=new Map();let mounted=null,mountedOwner=null,dispose=null;
 const storageKey=owner=>'ojjuda-life-v1:'+owner;
 const protectedMessage='저장된 자료를 읽지 못했어요. 기존 자료를 보호하기 위해 저장을 멈췄어요.';
 const digits=phone=>phone.replace(/[^0-9+]/g,'');
 function read(owner){
  const raw=localStorage.getItem(storageKey(owner));if(!raw)return {contacts:[],entries:[]};
  const data=JSON.parse(raw);
  if(!data||!Array.isArray(data.contacts)||!Array.isArray(data.entries)||!data.contacts.every(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&typeof c.phone==='string')||!data.entries.every(e=>e&&typeof e.id==='string'&&typeof e.memo==='string'&&typeof e.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&Number.isSafeInteger(e.amount)&&e.amount>0&&['income','expense'].includes(e.type)))throw Error('format');
  return {contacts:data.contacts,entries:data.entries};
 }
 function refresh(state,owner){try{Object.assign(state,read(owner),{error:false});}catch{Object.assign(state,{contacts:[],entries:[],error:true});}}
 function load(owner){
  const state=states.get(owner)||{contacts:[],entries:[],drafts:{},open:{},month:today().slice(0,7),query:'',error:false};
  if(owner)refresh(state,owner);
  states.set(owner,state);return state;
 }
 function mount(host,{owner,authorized=()=>true}={}){
  owner=owner||null;
  if(!host){dispose?.();dispose=null;mounted=null;mountedOwner=null;return;}
  if(mounted===host&&mountedOwner===owner)return;dispose?.();mounted=host;mountedOwner=owner;
  const state=load(owner);let alive=true,saving=false;const active=()=>alive&&host.isConnected&&authorized(),renderLists=[];
  const status=el('p','','life-status');status.setAttribute('role','status');
  async function save(change){
   if(!active()||!owner||saving)return false;saving=true;
   const persist=()=>{
    if(!active())return false;
    let current;try{current=read(owner);}catch{state.error=true;status.textContent=protectedMessage;return false;}
    const next=change(current);
    if(next.error){Object.assign(state,current,{error:false});for(const render of renderLists)render();status.textContent=next.error;return false;}
    try{localStorage.setItem(storageKey(owner),JSON.stringify(next));Object.assign(state,next,{error:false});for(const render of renderLists)render();status.textContent='이 기기에 저장했어요.';return true;}catch{status.textContent='저장 공간을 확인해 주세요. 입력한 내용은 그대로 두었어요.';return false;}
   };
   try{
    // The lock and fresh read keep simultaneous windows from replacing each other's records.
    const saved=navigator.locks?.request?await navigator.locks.request(storageKey(owner),persist):persist();
    return saved&&active();
   }catch{if(active())status.textContent='저장하지 못했어요. 입력한 내용은 그대로 두었어요.';return false;}finally{saving=false;}
  }
  host.replaceChildren(el('h2','생활'),status);
  if(state.error)status.textContent=protectedMessage;
  function section(key,title){
   const box=el('details','','life-tool');box.dataset.lifeTool=key;box.open=!!state.open[key];box.ontoggle=()=>state.open[key]=box.open;
   const summary=el('summary'),copy=el('span');copy.append(el('strong',title));summary.append(copy,el('span','＋','life-toggle'));box.append(summary);const body=el('div','','life-tool-body');box.append(body);host.append(box);return body;
  }
  function draftForm(key){const form=el('form');form.dataset.worldSwipe='off';const draft=state.drafts[key]||{};form.oninput=()=>{state.drafts[key]=Object.fromEntries(new FormData(form));};return {form,draft};}
  function named(f,name){f.input.name=name;return f;}
  function confirmation(row,label,accept){const confirm=el('div','','life-confirm');confirm.append(el('span',label),btn('취소',()=>confirm.remove()),btn('삭제하기',()=>{if(active())accept();}));row.querySelector('.life-confirm')?.remove();row.append(confirm);}
  const contacts=section('contacts','주소록');
  if(owner){
   contacts.append(el('p','이 계정·이 기기에만 저장돼요.','life-storage'));
   const search=field('연락처 검색','search',state.query);search.input.oninput=()=>{state.query=search.input.value;renderContacts();};contacts.append(search.label);
   const list=el('div','','life-list');contacts.append(list);
   const {form,draft}=draftForm('contact'),name=named(field('이름','text',draft.name),'name'),phone=named(field('전화번호','tel',draft.phone),'phone');name.input.required=true;name.input.maxLength=40;phone.input.required=true;phone.input.maxLength=40;phone.input.autocomplete='tel';
   form.append(name.label,phone.label);const submit=btn('연락처 저장');submit.type='submit';form.append(submit);contacts.append(form);
   form.onsubmit=async event=>{event.preventDefault();if(!active())return;const originalName=name.input.value,originalPhone=phone.input.value,n=originalName.trim(),p=originalPhone.trim(),normalized=digits(p);if(!n||!/^[+0-9()\-\s]{3,40}$/.test(p)||!/^\+?\d{3,}$/.test(normalized)){status.textContent='이름과 전화번호를 확인해 주세요.';return;}const saved=await save(current=>current.contacts.some(c=>digits(c.phone)===normalized)?{error:'이미 저장한 전화번호예요.'}:{...current,contacts:[...current.contacts,{id:crypto.randomUUID(),name:n,phone:p}]});if(saved&&name.input.value===originalName&&phone.input.value===originalPhone){name.input.value='';phone.input.value='';delete state.drafts.contact;}};
   function renderContacts(){list.replaceChildren();const q=state.query.trim().toLocaleLowerCase(),phoneQuery=digits(q),rows=state.contacts.filter(c=>(c.name+' '+c.phone).toLocaleLowerCase().includes(q)||(/^[+0-9()\-\s]+$/.test(q)&&phoneQuery&&digits(c.phone).includes(phoneQuery))).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
    if(!rows.length)list.append(el('p',q?'검색한 연락처가 없어요.':'아직 저장한 연락처가 없어요.','life-empty'));
    for(const c of rows){const row=el('div','','life-row'),copy=el('div');copy.append(el('strong',c.name));const phone=el('a',c.phone);phone.href='tel:'+c.phone.replace(/[^+0-9]/g,'');copy.append(phone);const remove=btn('삭제',()=>confirmation(row,'이 연락처를 삭제할까요?',()=>save(current=>({...current,contacts:current.contacts.filter(x=>x.id!==c.id)}))));remove.setAttribute('aria-label',c.name+' 연락처 삭제');row.append(copy,remove);list.append(row);}
   }renderLists.push(renderContacts);renderContacts();
  }else contacts.append(el('p','로그인 후 사용할 수 있어요.','life-empty'));
  const ledger=section('ledger','가계부');
  if(owner){
   ledger.append(el('p','이 계정·이 기기에만 저장돼요.','life-storage'));
   const month=field('조회할 월','month',state.month),totals=el('div','','life-totals'),list=el('div','','life-list');month.input.onchange=()=>{state.month=month.input.value;renderLedger();};ledger.append(month.label,totals,list);
   const {form,draft}=draftForm('entry'),date=named(field('날짜','date',draft.date||today()),'date'),memo=named(field('내용','text',draft.memo),'memo'),amount=named(field('금액','number',draft.amount),'amount'),type=el('select'),typeLabel=el('label','수입·지출');type.name='type';for(const [value,text]of [['expense','지출'],['income','수입']]){const option=el('option',text);option.value=value;type.append(option);}type.value=draft.type||'expense';typeLabel.append(type);
   for(const f of [date,memo,amount])f.input.required=true;memo.input.maxLength=80;amount.input.min='1';amount.input.max='999999999999';amount.input.step='1';amount.input.inputMode='numeric';
   const submit=btn('가계부 저장');submit.type='submit';form.append(date.label,typeLabel,memo.label,amount.label,submit);ledger.append(form);
   form.onsubmit=async event=>{event.preventDefault();if(!active())return;const originalMemo=memo.input.value,originalAmount=amount.input.value,n=Number(originalAmount),text=originalMemo.trim(),day=date.input.value,entryType=type.value;if(!text||!Number.isSafeInteger(n)||n<1||n>999999999999||!/^\d{4}-\d{2}-\d{2}$/.test(day)||!['income','expense'].includes(entryType)){status.textContent='날짜, 내용과 금액을 확인해 주세요.';return;}if(await save(current=>({...current,entries:[...current.entries,{id:crypto.randomUUID(),date:day,memo:text,amount:n,type:entryType}]}))){state.month=day.slice(0,7);month.input.value=state.month;if(memo.input.value===originalMemo&&amount.input.value===originalAmount&&date.input.value===day&&type.value===entryType){memo.input.value='';amount.input.value='';delete state.drafts.entry;}renderLedger();}};
   function renderLedger(){const rows=state.entries.filter(e=>e.date.slice(0,7)===state.month).sort((a,b)=>b.date.localeCompare(a.date)),income=rows.filter(e=>e.type==='income').reduce((n,e)=>n+BigInt(e.amount),0n),expense=rows.filter(e=>e.type==='expense').reduce((n,e)=>n+BigInt(e.amount),0n);totals.replaceChildren();for(const [label,value]of [['수입',income],['지출',expense],['남은 금액',income-expense]]){const item=el('div');item.append(el('small',label),el('strong',money(value)));totals.append(item);}list.replaceChildren();if(!rows.length)list.append(el('p','이 달에 기록한 내역이 없어요.','life-empty'));for(const entry of rows){const row=el('div','','life-row'),copy=el('div');copy.append(el('strong',entry.memo),el('small',entry.date),el('span',(entry.type==='income'?'+':'−')+money(entry.amount)));const remove=btn('삭제',()=>confirmation(row,'이 내역을 삭제할까요?',()=>save(current=>({...current,entries:current.entries.filter(x=>x.id!==entry.id)}))));remove.setAttribute('aria-label',entry.memo+' 내역 삭제');row.append(copy,remove);list.append(row);}}
   renderLists.push(renderLedger);renderLedger();
  }else ledger.append(el('p','로그인 후 사용할 수 있어요.','life-empty'));
  const calculator=section('calculator','계산기'),display=el('output','0','life-calc-display'),keys=el('div','','life-calc-keys');display.setAttribute('aria-label','계산 결과');display.setAttribute('aria-live','polite');keys.dataset.worldSwipe='off';
  let value='0',previous=null,operator=null,fresh=true;const compute=(a,b,op)=>op==='+'?a+b:op==='−'?a-b:op==='×'?a*b:b===0?NaN:a/b;
  function press(key){if(!active())return;
   if(key==='C'){value='0';previous=null;operator=null;fresh=true;}
   else if(key==='⌫'){value=fresh?'0':value.slice(0,-1)||'0';if(value==='-')value='0';fresh=false;}
   else if(key==='±'){if(Number.isFinite(Number(value))&&value!=='0')value=value.startsWith('-')?value.slice(1):'-'+value;}
   else if(key==='%'){if(Number.isFinite(Number(value)))value=String(Number(value)/100);}
   else if(['+','−','×','÷','='].includes(key)){const next=Number(value);if(previous!==null&&operator&&!fresh){const result=compute(previous,next,operator);value=Number.isFinite(result)?String(Number.isSafeInteger(result)?result:Number(result.toPrecision(12))):'계산할 수 없어요';previous=Number.isFinite(result)?Number(value):null;}else previous=Number.isFinite(next)?next:null;operator=key==='='?null:key;fresh=true;}
   else{if(fresh||!Number.isFinite(Number(value))){value=key==='.'?'0.':key;fresh=false;}else if(value.length<16){if(key!=='.'||!value.includes('.'))value=value==='0'&&key!=='.'?key:value+key;}}
   display.textContent=value;
  }
  for(const key of ['C','⌫','%','÷','7','8','9','×','4','5','6','−','1','2','3','+','±','0','.','='])keys.append(btn(key,()=>press(key)));calculator.append(display,keys);
  const storage=event=>{if(owner&&active()&&(event.key===storageKey(owner)||event.key===null)){refresh(state,owner);for(const render of renderLists)render();status.textContent=state.error?protectedMessage:'다른 창에서 바뀐 내용을 반영했어요.';}};window.addEventListener('storage',storage);
  const watcher=setInterval(()=>{if(alive&&!authorized()){host.replaceChildren();dispose?.();}},400);
  dispose=()=>{alive=false;clearInterval(watcher);window.removeEventListener('storage',storage);};
 }
 window.OjjudaLife={mount};
})();
