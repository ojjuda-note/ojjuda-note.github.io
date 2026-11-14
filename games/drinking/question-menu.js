/* Use only the active member catalog. A topic groups existing wording without rewriting it. */
(() => {
  'use strict';
  const themes=[
    ['스킨십·친밀감',/키스|스킨십|성인용품|성관계|성욕|성적 |피임|원나잇|첫날밤|속옷|야한|성인 (작품|영상)|잠자리|포옹/],
    ['연애·데이트',/연애|연인|애인|헤어|짝사랑|고백|사귀|결혼|데이트|소개팅|커플|썸|설레|바람|질투|동거|호감|첫 만남/],
    ['친구·사람',/친구|가족|동료|사람들|부모|첫인상|이 자리|옆 사람|뒤풀이|모임/],
    ['취향·놀이',/취미|노래|춤|여행|영화|게임|파티|술|요리|음식|카페|선물|쇼핑|사진|패션/],
    ['일상·경험',null]
  ];
  const labels={imagevote:'질문',king:'미션',truth:'질문',minority:'선택지'};
  const tastes=window.PartyPromptFlavors;
  const format=value=>Array.isArray(value)?value.join(' / '):value;
  function button(kind){return '<button type="button" class="question-menu-open" data-question-menu>기존 '+labels[kind]+' 선택 · 직접 입력</button>';}
  function open({kind,load,apply,flavors,initial='',pair=false}){
    const content=document.getElementById('access-content');
    if(!content || content.hidden || !window.OjjudaDrinkingAccessReady || content.querySelector('.party-question-dialog[open]'))return;
    for(const previous of document.querySelectorAll('.party-question-dialog:not([open])'))previous.remove();
    const dialog=document.createElement('dialog'),label=labels[kind],paired=kind==='minority';
    dialog.className='party-question-dialog';dialog.setAttribute('aria-labelledby','question-menu-title');
    const max=kind==='truth'?240:kind==='imagevote'?120:80;
    dialog.innerHTML='<form><header><h2 id="question-menu-title">'+label+' 정하기</h2><button type="button" data-close aria-label="닫기">닫기</button></header>'+
      '<div class="question-modes" role="group" aria-label="입력 방법"><button type="button" data-mode="list">목록에서 선택</button><button type="button" data-mode="write">직접 입력</button></div>'+
      tastes.selector(kind,flavors?.length===1?flavors:undefined)+
      '<div data-panel="list"><label>주제<select data-category></select></label><label>'+label+' 선택<select data-question></select></label><p data-selected></p><button type="button" data-another>다른 문구 추천</button><button type="button" data-retry hidden>다시 불러오기</button></div>'+
      '<div data-panel="write"><label>'+(paired?'첫 번째 선택지':label)+'<textarea maxlength="'+max+'" rows="2"></textarea></label>'+(paired?'<label>두 번째 선택지<textarea maxlength="80" rows="2"></textarea></label>':'')+'<label data-write-level>내 문구 수위<select><option value="mild">순한맛</option><option value="spicy">빨간맛</option></select></label></div>'+
      '<p role="status"></p><button type="submit" class="action">'+(paired?'이 선택지로 투표':kind==='truth'?'이 질문으로 시작':'사용하기')+'</button></form>';
    content.append(dialog);const find=s=>dialog.querySelector(s),form=find('form'),cat=find('[data-category]'),selection=find('[data-question]'),flavor=find('[data-prompt-flavor]'),status=find('[role="status"]'),confirm=find('[type="submit"]'),fields=[...dialog.querySelectorAll('textarea')];
    const levels=new Map(),catalogRequests=new Map();
    function loadOnce(flavor){
      if(!catalogRequests.has(flavor)){
        const request=Promise.resolve().then(()=>load(flavor,pair));
        catalogRequests.set(flavor,request);
      }
      return catalogRequests.get(flavor);
    }
    const level=line=>levels.get(line)||tastes.level(kind,line);
    let applying=false;
    const writeLevel=find('[data-write-level] select');
    let mode='list',groups=new Map(),items=[],rows=[],version=0,loading=false;
    const value=()=>mode==='list'?rows[Number(selection.value)]:paired?fields.map(f=>f.value.trim()):fields[0].value.trim();
    function validate(){const v=value(),parts=Array.isArray(v)?v:[v];confirm.disabled=applying||parts.some(p=>!p||p.length>max)||(paired&&parts[0]?.toLowerCase()===parts[1]?.toLowerCase());}
    function select(){find('[data-another]').hidden=rows.length<2;const line=rows[Number(selection.value)];find('[data-selected]').textContent=line?tastes.names[level(line)]+' · '+format(line):'';validate();}
    function refreshList(){rows=cat.value==='전체'?items:groups.get(cat.value)||[];selection.replaceChildren(...rows.map((line,index)=>new Option(format(line),String(index))));
      const pick=tastes.recommend(kind,rows,undefined,flavor.value,level);if(pick!==undefined)selection.value=String(rows.indexOf(pick));select();}
    function sync(){find('[data-write-level]').hidden=flavor.value!=='mixed';for(const b of dialog.querySelectorAll('[data-mode]'))b.setAttribute('aria-pressed',String(b.dataset.mode===mode));for(const p of dialog.querySelectorAll('[data-panel]'))p.hidden=p.dataset.panel!==mode;
      status.textContent=applying?'적용 중…':mode==='write'?'':loading?'불러오는 중…':items.length?'':'고를 문구가 없어요. 직접 입력할 수 있어요.';find('[data-retry]').hidden=loading||items.length>0;validate();}
    async function populate(){const id=++version;loading=true;items=[];groups=new Map();refreshList();sync();let result;
      try{
        if(kind==='truth'){
          const allowed=flavor.value==='mixed'?['mild','spicy']:[flavor.value];
          const lists=await Promise.all(allowed.map(loadOnce));
          if(id!==version||!dialog.open)return;
          levels.clear();lists.forEach((list,i)=>list.forEach(v=>levels.set(v,allowed[i])));result=lists.flat();
        }else result=await loadOnce(null);
      }catch{result=[];}
      if(id!==version||!dialog.open)return;
      items=(result||[]).filter(v=>paired?Array.isArray(v)&&v.length===2&&v.every(t=>typeof t==='string'):typeof v==='string');
      items=tastes.filter(kind,items,flavor.value,level);
      for(const item of items){const key=themes.find(([,re])=>!re||re.test(format(item)))[0];if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
      cat.replaceChildren(...['전체',...themes.map(([key])=>key).filter(key=>groups.has(key))].map(v=>new Option(v,v)));loading=false;refreshList();sync();
    }
    for(const b of dialog.querySelectorAll('[data-mode]'))b.onclick=()=>{mode=b.dataset.mode;sync();if(mode==='write')fields[0].focus();};
    if(!paired)fields[0].value=initial;else if(Array.isArray(initial))fields.forEach((f,i)=>f.value=initial[i]||'');
    for(const f of fields)f.oninput=validate;
    find('[data-another]').onclick=()=>{const pick=tastes.recommend(kind,rows,value(),flavor.value,level);if(pick!==undefined)selection.value=String(rows.indexOf(pick));select();};
    cat.onchange=refreshList;selection.onchange=select;flavor.onchange=()=>{tastes.set(kind,flavor.value);void populate();};find('[data-retry]').onclick=()=>{catalogRequests.clear();void populate();};
    find('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{version++;dialog.remove();},{once:true});
    dialog.addEventListener('cancel',event=>{if(applying)event.preventDefault();});
    form.onsubmit=async event=>{
      event.preventDefault();
      if(applying||confirm.disabled||!dialog.open||content.hidden||!window.OjjudaDrinkingAccessReady)return;
      const selected=value(),manual=mode==='write';
      const chosenFlavor=manual?(flavor.value==='mixed'?writeLevel.value:flavor.value):level(selected);
      applying=true;
      const controls=Array.from(form.elements).filter(control=>!control.disabled);
      for(const control of controls)control.disabled=true;
      form.setAttribute('aria-busy','true');
      status.textContent='적용 중…';
      try{
        const ok=await apply(selected,manual,chosenFlavor);
        if(!dialog.open)return;
        if(ok!==false){
          if(manual)tastes.tag(kind,selected,chosenFlavor);
          dialog.close();
        }else status.textContent='현재 차례와 질문을 다시 확인해 주세요.';
      }catch{
        status.textContent='적용하지 못했어요. 다시 시도해 주세요.';
      }finally{
        applying=false;
        if(dialog.open){
          for(const control of controls)control.disabled=false;
          form.removeAttribute('aria-busy');
          validate();
        }
      }
    };
    dialog.showModal();void populate();
  }
  async function catalog(kind,flavor,pair=false){
    const bank=window.DrinkingPrompts;
    if(!await bank.refresh(kind))return [];
    if(kind==='truth')return window.PartyTruthCards.deck(bank.truth())[flavor];
    const all=bank.list(kind);return kind==='king'?bank.kingChoices(all,pair):all;
  }
  window.DrinkingQuestionMenu={button,open,catalog};
})();
