/* Personal ledger uses the existing Ojjuda Supabase session. No new service. */
(() => {
 'use strict';
 const drafts=new Map(),TABLE='life_ledger_entries',PAGE=30;
 const categories=['식비','교통','쇼핑','주거·통신','건강','문화·여가','교육','월급','용돈','기타'];
 const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e;};
 const button=(text,fn)=>{const b=node('button',text);b.type='button';b.onclick=fn;return b;};
 const money=n=>BigInt(n||0).toLocaleString('ko-KR')+'원';
 const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='1900-01-01'&&s<='9999-12-31'&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const uuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||'');
 const bounds=m=>{const [y,n]=m.split('-').map(Number);return [m+'-01',n===12?`${y+1}-01-01`:`${y}-${String(n+1).padStart(2,'0')}-01`];};
 const message=e=>e?.message==='conflict'?'다른 곳에서 바뀐 기록이에요. 새로고침 후 다시 수정해 주세요.':'서버에 저장하지 못했어요. 입력한 내용은 그대로 두었으니 다시 시도해 주세요.';
 function mount(host,{owner,client,authorized=()=>true}={}){
  if(!owner){host.append(node('p','로그인 후 사용할 수 있어요.','life-empty'));return()=>{};}
  if(!client){host.append(node('p','가계부 연결을 불러오지 못했어요. 새로고침해 주세요.','life-empty'));return()=>{};}
  const state=drafts.get(owner)||{month:today().slice(0,7),draft:{date:today(),type:'expense',category:'기타'},editing:null,id:crypto.randomUUID()};drafts.set(owner,state);
  let alive=true,busy=false,loading=false,serial=0,rows=[],offset=0,started=false;
  const active=()=>alive&&host.isConnected&&authorized();
  host.append(node('p','내 계정에 저장돼요. 다른 기기에서도 볼 수 있고, 나만 열람할 수 있어요.','life-storage'));
  const status=node('p','','life-status');status.setAttribute('role','status');host.append(status);
  const toolbar=node('div','','ledger-toolbar'),monthLabel=node('label','조회할 월'),month=node('input');month.type='month';month.value=state.month;month.min='1900-01';month.max='9998-12';monthLabel.append(month);
  const refresh=button('새로고침',()=>load());toolbar.append(monthLabel,refresh);host.append(toolbar);
  const totals=node('div','','life-totals'),chart=node('div','','ledger-categories'),list=node('div','','life-list'),more=button('더보기',()=>load(true));more.hidden=true;host.append(totals,chart);
  const form=node('form'),fields={};form.dataset.worldSwipe='off';
  function field(title,name,type){const label=node('label',title),input=node('input');input.name=name;input.setAttribute('aria-label',title);input.type=type;label.append(input);fields[name]=input;form.append(label);return input;}
  const date=field('날짜','date','date');date.required=true;date.min='1900-01-01';date.max='9998-12-31';
  function select(title,name,options){const label=node('label',title),input=node('select');input.name=name;input.setAttribute('aria-label',title);for(const [value,text]of options){const o=node('option',text);o.value=value;input.append(o);}label.append(input);fields[name]=input;form.append(label);}
  select('수입·지출','type',[['expense','지출'],['income','수입']]);select('분류','category',categories.map(x=>[x,x]));
  field('내용','memo','text').maxLength=80;fields.memo.required=true;
  const amount=field('금액','amount','number');amount.required=true;amount.min='1';amount.max='999999999999';amount.step='1';amount.inputMode='numeric';
  const submit=button('가계부 저장');submit.type='submit';const cancel=button('수정 취소',()=>clear());cancel.hidden=true;form.append(submit,cancel);host.append(form,list,more);
  const importBox=node('div','','ledger-import');host.append(importBox);
  function readDraft(){state.draft=Object.fromEntries(new FormData(form));}
  form.oninput=readDraft;
  function fill(){for(const [key,input]of Object.entries(fields))input.value=state.draft[key]||'';submit.textContent=state.editing?'수정 저장':'가계부 저장';cancel.hidden=!state.editing;}
  function clear(){state.editing=null;state.id=crypto.randomUUID();state.draft={date:fields.date.value||today(),type:fields.type.value||'expense',category:fields.category.value||'기타'};fill();}
  function lock(on){busy=on;month.disabled=on;for(const e of form.elements)e.disabled=on;importButton.disabled=on;}
  const base=()=>client.from(TABLE).select('id,user_id,date,type,category,memo,amount,revision,deleted_at').eq('user_id',owner);
  function drawRows(){list.replaceChildren();if(!rows.length)list.append(node('p','이 달에 기록한 내역이 없어요.','life-empty'));
   for(const r of rows){const item=node('div','','life-row'),copy=node('div');copy.append(node('strong',r.memo),node('small',r.date+' · '+r.category),node('span',(r.type==='income'?'+':'−')+money(r.amount),r.type==='income'?'ledger-income':'ledger-expense'));
    const edit=button('수정',()=>{if(!active()||busy)return;state.editing={id:r.id,revision:r.revision};state.id=r.id;state.draft={date:r.date,type:r.type,category:r.category,memo:r.memo,amount:String(r.amount)};fill();form.scrollIntoView({block:'nearest'});fields.memo.focus();});edit.setAttribute('aria-label',r.memo+' 내역 수정');
    const remove=button('삭제',()=>{if(!active()||busy)return;const confirm=node('div','','life-confirm');confirm.append(node('span','이 내역을 삭제할까요?'),button('취소',()=>confirm.remove()),button('삭제하기',()=>mutate(async()=>{const {data,error}=await client.from(TABLE).update({deleted_at:new Date().toISOString()}).eq('user_id',owner).eq('id',r.id).eq('revision',r.revision).is('deleted_at',null).select('id');if(error)throw error;if(!data?.length)throw Error('conflict');if(state.editing?.id===r.id)clear();},'삭제했어요.')));item.querySelector('.life-confirm')?.remove();item.append(confirm);});remove.setAttribute('aria-label',r.memo+' 내역 삭제');item.append(copy,edit,remove);list.append(item);
   }
  }
  function drawSummary(data){totals.replaceChildren();for(const [label,value]of [['수입',data.income],['지출',data.expense],['남은 금액',data.balance]]){const box=node('div');box.append(node('small',label),node('strong',money(value)));totals.append(box);}
   chart.replaceChildren();const groups=data.categories||[],sum=BigInt(data.expense||0);if(groups.length)chart.append(node('h3','분류별 지출'));
   for(const g of groups){const row=node('div','','ledger-category'),bar=node('span','','ledger-bar');bar.style.width=(sum?Number(BigInt(g.amount)*100n/sum):0)+'%';row.append(node('span',g.category),node('strong',money(g.amount)),bar);chart.append(row);}
  }
  async function load(append=false){
   if(!active()||busy||append&&loading)return false;started=true;const request=++serial,selected=state.month;loading=true;refresh.disabled=true;more.disabled=true;
   if(!append){rows=[];offset=0;totals.replaceChildren();chart.replaceChildren();list.replaceChildren();more.hidden=true;}status.textContent='가계부를 불러오는 중이에요.';
   try{const [start,end]=bounds(selected),query=base().is('deleted_at',null).gte('date',start).lt('date',end).order('date',{ascending:false}).order('id',{ascending:false}).range(append?offset:0,(append?offset:0)+PAGE-1);
    const [page,summary]=await Promise.all([query,append?Promise.resolve(null):client.rpc('life_ledger_month',{p_month:start})]);if(!active()||request!==serial)return false;if(page.error)throw page.error;if(summary?.error)throw summary.error;
    rows=append?[...rows,...page.data.filter(r=>!rows.some(x=>x.id===r.id))]:page.data;offset+=(page.data||[]).length;if(summary)drawSummary(summary.data);drawRows();more.hidden=page.data.length<PAGE;status.textContent='';return true;
   }catch{if(active()&&request===serial){status.textContent='가계부를 불러오지 못했어요. 새로고침을 눌러 다시 시도해 주세요.';more.hidden=!append;}return false;}
   finally{if(active()&&request===serial){loading=false;refresh.disabled=false;more.disabled=false;}}
  }
  async function mutate(operation,success){if(!active()||busy)return;lock(true);serial++;loading=false;try{await operation();if(!active())return;lock(false);const loaded=await load();if(active()&&loaded)status.textContent=success;}catch(e){if(active())status.textContent=message(e);}finally{if(active()){lock(false);refresh.disabled=false;more.disabled=false;}}}
  form.onsubmit=event=>{event.preventDefault();if(!active()||busy)return;readDraft();const d=state.draft,n=Number(d.amount);if(!validDate(d.date)||!d.memo.trim()||!Number.isSafeInteger(n)||n<1||n>999999999999)return;
   const record={user_id:owner,id:state.id,date:d.date,type:d.type,category:d.category,memo:d.memo.trim(),amount:n};
   void mutate(async()=>{if(state.editing){const {data,error}=await client.from(TABLE).update({date:record.date,type:record.type,category:record.category,memo:record.memo,amount:n}).eq('user_id',owner).eq('id',record.id).eq('revision',state.editing.revision).is('deleted_at',null).select('id');if(error)throw error;if(!data?.length)throw Error('conflict');}
    else{const {error}=await client.from(TABLE).upsert(record,{onConflict:'user_id,id',ignoreDuplicates:true});if(error)throw error;const {data,error:readError}=await base().eq('id',record.id).single();if(readError)throw readError;if(data.deleted_at||['date','type','category','memo','amount'].some(k=>String(data[k])!==String(record[k])))throw Error('conflict');}
    if(!active())return;state.month=record.date.slice(0,7);month.value=state.month;clear();
   },'내 계정에 저장했어요.');
  };
  month.onchange=()=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(month.value)&&month.validity.valid){state.month=month.value;if(!busy)void load();}};
  function legacy(){const raw=localStorage.getItem('ojjuda-life-v1:'+owner);if(!raw)return [];const parsed=JSON.parse(raw);if(!Array.isArray(parsed.entries))throw Error('invalid');return parsed.entries.map(e=>{if(!uuid(e.id)||!validDate(e.date)||!['income','expense'].includes(e.type)||typeof e.memo!=='string'||!e.memo.trim()||e.memo.length>80||!Number.isSafeInteger(e.amount)||e.amount<1||e.amount>999999999999)throw Error('invalid');return {id:e.id,user_id:owner,date:e.date,type:e.type,memo:e.memo.trim(),amount:e.amount,category:'기타'};});}
  const importButton=button('이 기기의 기존 기록 가져오기',()=>mutate(async()=>{const entries=legacy();for(let i=0;i<entries.length;i+=100){if(!active())return;const {error}=await client.from(TABLE).upsert(entries.slice(i,i+100),{onConflict:'user_id,id',ignoreDuplicates:true});if(error)throw error;}},'기존 기록을 가져왔어요. 이미 옮긴 기록은 중복 저장하지 않았어요.'));
  try{if(legacy().length){importBox.append(node('p','기존 기록을 내 계정으로 복사해요. 이 기기의 원본은 그대로 남아요.','life-storage'),importButton);}}catch{importBox.append(node('p','기존 기록을 읽지 못했어요. 원본은 그대로 보관하고 있어요.','life-storage'));}
  fill();const details=host.closest('details');const onToggle=()=>{if(details.open&&!started)void load();};details?.addEventListener('toggle',onToggle);if(!details||details.open)void load();
  return()=>{alive=false;serial++;details?.removeEventListener('toggle',onToggle);};
 }
 window.OjjudaLedger={mount};
})();
