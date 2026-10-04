/* Account-private schedules; calendar date/time values are Korean local values. */
(()=>{
 'use strict';
 const TABLE='life_schedule_events',PAGE=200,states=new Map();
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
 const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')&&s>='1900-01-01'&&s<='2200-12-31'&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 function occurs(row,date){if(date<row.date||row.repeat_until&&date>row.repeat_until)return false;if(row.repeat==='none')return row.date===date;if(row.repeat==='monthly')return row.date.slice(8)===date.slice(8);return row.repeat==='weekly'&&(Date.parse(date+'T00:00:00Z')-Date.parse(row.date+'T00:00:00Z'))/86400000%7===0;}
 function mount(host,{owner,client,authorized=()=>true,month,selected,onChange=()=>{},onNavigate=()=>{}}={}){
  if(!owner||!client){host.append(el('p',owner?'일정 연결을 불러오지 못했어요. 새로고침해 주세요.':'로그인하면 내 일정을 저장할 수 있어요.','life-empty'));return {setView(){},destroy(){}};}
  const state=states.get(owner)||{draft:null,editing:null,id:crypto.randomUUID(),open:false};states.set(owner,state);
  let alive=true,busy=false,serial=0,rows=[],viewMonth=month,viewDate=selected,loadedMonth=null;
  const active=()=>alive&&host.isConnected&&authorized();
  const status=el('p','','life-status');status.setAttribute('role','status');
  const toolbar=el('div','','schedule-toolbar'),add=button('＋ 일정 추가',()=>{if(busy||!active())return;if(!state.open){state.draft={date:viewDate,title:'',time:'',memo:'',repeat:'none',repeat_until:''};state.editing=null;state.id=crypto.randomUUID();state.open=true;fill();}fields.title.focus();}),refresh=button('일정 새로고침',()=>{if(!busy)void load();});
  toolbar.append(add,refresh);const list=el('div','','schedule-list');list.setAttribute('aria-label','선택한 날짜의 일정');
  const form=el('form','','schedule-form'),heading=el('h3','일정 추가'),notice=el('p','','life-storage'),fields={};form.dataset.worldSwipe='off';form.append(heading,notice);
  function field(labelText,name,type){const label=el('label',labelText),input=el(type==='textarea'?'textarea':type==='select'?'select':'input');if(input.tagName==='INPUT')input.type=type;input.name=name;input.setAttribute('aria-label',labelText);label.append(input);form.append(label);fields[name]=input;return input;}
  field('일정 제목','title','text').maxLength=100;fields.title.required=true;field('일정 날짜','date','date').required=true;fields.date.min='1900-01-01';fields.date.max='2200-12-31';
  field('시간 (선택·한국 시간)','time','time');const repeat=field('반복','repeat','select');for(const [value,label] of [['none','반복 안 함'],['weekly','매주'],['monthly','매월']]){const o=el('option',label);o.value=value;repeat.append(o);}
  field('반복 종료일 (선택)','repeat_until','date');fields.repeat_until.max='2200-12-31';field('메모','memo','textarea').maxLength=2000;fields.memo.rows=3;
  const hint=el('p','시간을 비우면 종일 일정이에요. 매월 반복은 해당 날짜가 없는 달을 건너뛰어요.','life-storage'),save=button('일정 저장');save.type='submit';const cancel=button('취소',()=>{if(!busy)clear();});const actions=el('div','','schedule-actions');actions.append(save,cancel);form.append(hint,actions);
  host.append(el('p','내 계정에 저장되며 나만 볼 수 있어요. 시간은 한국 시간 기준이에요.','life-storage'),toolbar,status,list,form);
  function readDraft(){state.draft=Object.fromEntries(new FormData(form));if(state.draft.repeat==='none')state.draft.repeat_until='';}
  function fill(){form.hidden=!state.open;heading.textContent=state.editing?'일정 수정':'일정 추가';save.textContent=state.editing?'수정 저장':'일정 저장';notice.textContent=state.editing?.repeat!=='none'&&state.editing?'반복 일정 전체에 적용됩니다.':'';for(const [key,f]of Object.entries(fields))f.value=state.draft?.[key]||'';fields.repeat.value=state.draft?.repeat||'none';fields.repeat_until.parentElement.hidden=fields.repeat.value==='none';fields.repeat_until.min=fields.date.value;}
  function clear(){state.open=false;state.editing=null;state.draft=null;state.id=crypto.randomUUID();fill();}
  form.oninput=()=>{readDraft();fields.repeat_until.min=fields.date.value;};repeat.onchange=()=>{readDraft();if(repeat.value==='none')fields.repeat_until.value='';fields.repeat_until.parentElement.hidden=repeat.value==='none';};
  function lock(value){busy=value;for(const f of form.elements)f.disabled=value;add.disabled=value;refresh.disabled=value;list.querySelectorAll('button').forEach(b=>b.disabled=value);}
  function draw(){
   const counts={};const [y,m]=viewMonth.split('-').map(Number),days=new Date(y,m,0).getDate();for(let i=1;i<=days;i++){const date=viewMonth+'-'+String(i).padStart(2,'0');const count=rows.filter(r=>occurs(r,date)).length;if(count)counts[date]=count;}onChange(counts);
   list.replaceChildren();if(loadedMonth!==viewMonth)return;
   const dayRows=rows.filter(r=>occurs(r,viewDate)).sort((a,b)=>(a.time||'').localeCompare(b.time||'')||a.title.localeCompare(b.title,'ko')||a.id.localeCompare(b.id));
   if(!dayRows.length)list.append(el('p','이 날짜에 등록한 일정이 없어요.','life-empty'));
   for(const row of dayRows){const item=el('article','','schedule-event'),copy=el('div','','schedule-copy');copy.append(el('small',(row.time||'종일')+(row.repeat==='none'?'':row.repeat==='weekly'?' · 매주':' · 매월')),el('strong',row.title));if(row.memo)copy.append(el('p',row.memo));
    const edit=button('수정',()=>{if(busy||!active())return;state.draft={date:row.date,time:row.time||'',title:row.title,memo:row.memo,repeat:row.repeat,repeat_until:row.repeat_until||''};state.editing={id:row.id,revision:row.revision,repeat:row.repeat};state.id=row.id;state.open=true;fill();fields.title.focus();});edit.setAttribute('aria-label',row.title+' 일정 수정');
    const remove=button('삭제',()=>{if(busy||!active())return;const box=el('div','','life-confirm');box.append(el('span',row.repeat==='none'?'이 일정을 삭제할까요?':'이 반복 일정 전체를 삭제할까요?'),button('취소',()=>box.remove()),button('삭제하기',()=>mutate(async()=>{const {data,error}=await client.from(TABLE).update({deleted_at:new Date().toISOString()}).eq('user_id',owner).eq('id',row.id).eq('revision',row.revision).is('deleted_at',null).select('id');if(error)throw error;if(!data?.length)throw Error('conflict');if(active()&&state.editing?.id===row.id)clear();},'일정을 삭제했어요.')));item.querySelector('.life-confirm')?.remove();item.append(box);});remove.setAttribute('aria-label',row.title+' 일정 삭제');
    const controls=el('div','','schedule-actions');controls.append(edit,remove);item.append(copy,controls);list.append(item);
   }
  }
  async function load(){
   if(!active()||busy)return false;const request=++serial,wanted=viewMonth;loadedMonth=null;rows=[];draw();status.textContent='일정을 불러오고 있어요.';refresh.disabled=true;
   try{const collected=[];for(let start=0;;start+=PAGE){const {data,error}=await client.rpc('life_schedule_month',{p_month:wanted+'-01'}).range(start,start+PAGE-1);if(!active()||request!==serial)return false;if(error)throw error;collected.push(...(data||[]));if((data||[]).length<PAGE)break;}
    rows=collected;loadedMonth=wanted;draw();status.textContent='';return true;
   }catch{if(active()&&request===serial)status.textContent='일정을 불러오지 못했어요. 일정 새로고침을 눌러 주세요.';return false;}finally{if(active()&&request===serial)refresh.disabled=false;}
  }
  async function mutate(operation,message){if(!active()||busy)return;serial++;lock(true);status.textContent='저장하고 있어요.';try{await operation();if(!active())return;lock(false);const loaded=await load();if(active()&&loaded)status.textContent=message;}catch(e){if(active()){draw();status.textContent=e?.message==='conflict'?'다른 기기에서 바뀐 일정이에요. 새로고침 후 확인해 주세요.':'저장하지 못했어요. 입력한 내용은 그대로 두었으니 다시 시도해 주세요.';}}finally{if(active())lock(false);}}
  form.onsubmit=e=>{e.preventDefault();if(!active()||busy)return;readDraft();const d=state.draft;if(!validDate(d.date)||!d.title.trim()||d.title.length>100||d.memo.length>2000||!['none','weekly','monthly'].includes(d.repeat)||d.time&&!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(d.time)||d.repeat_until&&(!validDate(d.repeat_until)||d.repeat_until<d.date)){status.textContent='날짜와 반복 종료일을 확인해 주세요.';return;}
   const record={user_id:owner,id:state.id,date:d.date,time:d.time||null,title:d.title.trim(),memo:d.memo,repeat:d.repeat,repeat_until:d.repeat==='none'?null:d.repeat_until||null};
   void mutate(async()=>{if(state.editing){const {user_id,id,...changes}=record;const {data,error}=await client.from(TABLE).update(changes).eq('user_id',owner).eq('id',id).eq('revision',state.editing.revision).is('deleted_at',null).select('id');if(error)throw error;if(!data?.length)throw Error('conflict');}
    else{const {error}=await client.from(TABLE).upsert(record,{onConflict:'user_id,id',ignoreDuplicates:true});if(error)throw error;const {data,error:readError}=await client.from(TABLE).select('date,time,title,memo,repeat,repeat_until,deleted_at').eq('user_id',owner).eq('id',record.id).single();if(readError)throw readError;if(data.deleted_at||Object.keys(record).filter(k=>!['user_id','id'].includes(k)).some(k=>data[k]!==record[k]))throw Error('conflict');}
    if(active()){clear();onNavigate(record.date);}
   },'내 계정에 일정을 저장했어요.');
  };
  fill();void load();
  return {setView(nextMonth,nextDate){if(!active())return;const changed=nextMonth!==viewMonth;if(!changed&&viewDate===nextDate)return;viewMonth=nextMonth;viewDate=nextDate;if(changed&&!busy)void load();else draw();},destroy(){alive=false;serial++;}};
 }
 window.OjjudaSchedule={mount,occurs};
})();
