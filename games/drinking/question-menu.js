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
  const limits={imagevote:120,king:80,truth:240,minority:80};
  const tastes=window.PartyPromptFlavors;
  const format=value=>Array.isArray(value)?value.join(' / '):value;

  function draft(){
    return {mode:'list',topic:'전체',selected:null,written:['',''],ownFlavor:'mild'};
  }
  function markup(kind,submit,flavors){
    const label=labels[kind],paired=kind==='minority';
    const field=(text,index)=>'<label>'+text+'<textarea id="prompt-text-'+index+'" rows="2" maxlength="'+limits[kind]+'"></textarea></label>';
    return '<div class="question-picker">'+
      '<div class="question-modes" role="group" aria-label="'+label+' 정하는 방법"><button type="button" data-mode="list">기존 '+label+'</button><button type="button" data-mode="write">직접 입력</button></div>'+
      tastes.selector(kind,flavors?.length===1?flavors:undefined)+
      '<div data-panel="list"><label>주제<select data-category></select></label><label>'+label+' 선택<select data-question></select></label>'+
      '<p data-selected></p><button type="button" data-another>다른 '+label+' 추천</button><button type="button" data-retry hidden>다시 불러오기</button></div>'+
      '<div data-panel="write" hidden>'+field(paired?'첫 번째 선택지':'내 '+label,0)+(paired?field('두 번째 선택지',1):'')+
      '<label data-write-level>내 '+label+' 수위<select><option value="mild">순한맛</option><option value="spicy">빨간맛</option></select></label>'+
      (paired?'':'<small>직접 쓴 문구는 관리자 검토 후 공용 목록에 등록될 수 있어요.</small>')+'</div>'+
      '<p role="status"></p><button type="submit" class="start action" disabled>'+submit+'</button></div>';
  }

  function mount(form,{kind,state=draft(),load,apply}){
    const picker=form.querySelector('.question-picker');
    const find=selector=>picker.querySelector(selector);
    const category=find('[data-category]'),selection=find('[data-question]'),flavor=find('[data-prompt-flavor]');
    const status=find('[role="status"]'),confirm=find('[type="submit"]'),ownFlavor=find('[data-write-level] select');
    const fields=Array.from(picker.querySelectorAll('textarea'));
    const paired=kind==='minority',levels=new Map();
    const level=line=>levels.get(line)||tastes.level(kind,line);
    let bank=[],rows=[],request=0,loading=true,failed=false,sending=false;
    function value(){
      if(state.mode==='list')return rows[selection.selectedIndex];
      const parts=fields.map(field=>field.value.trim());
      return paired?parts:parts[0];
    }
    function valid(){
      const selected=value(),parts=Array.isArray(selected)?selected:[selected];
      return parts.every(part=>typeof part==='string'&&part.length>0&&part.length<=limits[kind])&&
        (!paired||parts.length===2&&parts[0].toLowerCase()!==parts[1].toLowerCase());
    }
    function sync(){
      const manual=state.mode==='write';
      for(const button of picker.querySelectorAll('[data-mode]'))button.setAttribute('aria-pressed',String(button.dataset.mode===state.mode));
      for(const panel of picker.querySelectorAll('[data-panel]'))panel.hidden=panel.dataset.panel!==state.mode;
      for(const field of fields)field.disabled=!manual;
      find('[data-write-level]').hidden=flavor.value!=='mixed';
      find('[data-retry]').hidden=loading||bank.length>0;
      find('[data-another]').hidden=rows.length<2;
      selection.disabled=!rows.length;category.disabled=category.options.length<2;
      const selected=rows[selection.selectedIndex];
      find('[data-selected]').textContent=selected?format(selected):'';
      status.textContent=manual?(paired&&fields[0].value.trim()&&!valid()&&fields[0].value.trim().toLowerCase()===fields[1].value.trim().toLowerCase()?'서로 다른 선택지를 적어 주세요.':''):
        loading?'문구를 불러오는 중…':failed?'목록을 불러오지 못했어요. 다시 시도하거나 직접 입력해 주세요.':
        !rows.length?'이 수위에 맞는 문구가 없어요. 다른 수위나 직접 입력을 골라 주세요.':'';
      confirm.disabled=sending||!valid();
    }
    function updateList(){
      const items=tastes.filter(kind,bank,flavor.value,level);
      const groups=new Map();
      for(const line of items){
        const topic=themes.find(([,re])=>!re||re.test(format(line)))[0];
        if(!groups.has(topic))groups.set(topic,[]);
        groups.get(topic).push(line);
      }
      const topics=['전체',...themes.map(([name])=>name).filter(name=>groups.has(name))];
      if(!topics.includes(state.topic))state.topic='전체';
      category.replaceChildren(...topics.map(name=>new Option(name,name)));category.value=state.topic;
      rows=state.topic==='전체'?items:groups.get(state.topic);
      let selected=rows.find(line=>JSON.stringify(line)===JSON.stringify(state.selected));
      if(selected===undefined)selected=tastes.recommend(kind,rows,undefined,flavor.value,level);
      state.selected=selected;
      selection.replaceChildren(...rows.map((line,i)=>new Option(format(line),String(i))));
      selection.selectedIndex=rows.indexOf(selected);sync();
    }
    async function refresh(){
      const serial=++request;
      loading=true;failed=false;bank=[];rows=[];selection.replaceChildren();sync();
      try{
        const data=await load();
        if(serial!==request||!form.isConnected)return;
        if(kind==='truth'){
          levels.clear();
          for(const taste of ['mild','spicy'])for(const line of data[taste])levels.set(line,taste);
          bank=[...levels.keys()];
        }else bank=data;
      }catch{
        if(serial!==request||!form.isConnected)return;
        failed=true;
      }
      loading=false;updateList();
    }
    for(const button of picker.querySelectorAll('[data-mode]'))button.onclick=()=>{
      state.mode=button.dataset.mode;sync();if(state.mode==='write')fields[0].focus();
    };
    fields.forEach((field,i)=>{
      field.value=state.written[i];field.oninput=()=>{state.written[i]=field.value;sync();};
    });
    ownFlavor.value=state.ownFlavor;ownFlavor.onchange=()=>{state.ownFlavor=ownFlavor.value;};
    flavor.onchange=()=>{tastes.set(kind,flavor.value);if(!loading)updateList();else sync();};
    category.onchange=()=>{state.topic=category.value;updateList();};
    selection.onchange=()=>{state.selected=rows[selection.selectedIndex];sync();};
    find('[data-another]').onclick=()=>{
      const rest=rows.filter(line=>line!==state.selected);
      state.selected=tastes.recommend(kind,rest,undefined,flavor.value,level);
      selection.selectedIndex=rows.indexOf(state.selected);sync();
    };
    find('[data-retry]').onclick=refresh;
    form.onsubmit=async event=>{
      event.preventDefault();
      if(sending||!form.isConnected||!valid())return;
      const chosen=value(),manual=state.mode==='write';
      const taste=manual?(flavor.value==='mixed'?ownFlavor.value:flavor.value):level(chosen);
      sending=true;confirm.disabled=true;
      try{
        const ok=await apply(chosen,manual,taste);
        if(ok!==false&&manual)tastes.tag(kind,chosen,taste);
      }catch{if(form.isConnected)status.textContent='적용하지 못했어요. 다시 시도해 주세요.';}
      finally{sending=false;if(form.isConnected)confirm.disabled=!valid();}
    };
    void refresh();
    return refresh;
  }
  async function catalog(kind,pair=false){
    const prompts=window.DrinkingPrompts;
    if(!await prompts.refresh(kind))throw Error('catalog unavailable');
    if(kind==='truth')return window.PartyTruthCards.deck(prompts.truth());
    const items=prompts.list(kind);
    return kind==='king'?prompts.kingChoices(items,pair):items;
  }
  window.DrinkingQuestionMenu={draft,markup,mount,catalog};
})();
