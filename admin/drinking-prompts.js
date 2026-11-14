(() => {
  'use strict';
  const games = {
    bomb: {name:'시간폭탄', field:'주제'},
    liar: {name:'라이어 찾기', field:'제시어'},
    minority: {name:'소수파 찾기', field:'첫 번째 선택지', second:'두 번째 선택지'},
    mission: {name:'한 명만 다른 미션', field:'다수의 제시어', second:'한 명의 제시어'},
    king: {name:'왕게임', field:'명령', limit:80},
    fingers: {name:'손병호 게임', field:'조건'},
    imagevote: {name:'이미지 게임', field:'질문'},
    truth: {name:'진실게임', field:'질문', limit:240},
    initial: {name:'초성 대결', field:'두 글자 단어 또는 초성', limit:2}
  };
  const flavors = {mild:'순한맛', spicy:'빨간맛'};
  const initials = /^(?:[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}|[가-힣]{2})$/u;

  function el(tag, classes='', text) {
    const node=document.createElement(tag);
    node.className=classes;
    if (text!==undefined) node.textContent=text;
    return node;
  }
  function button(label,fn,primary=false) {
    const node=el('button',primary?'btn sm pri':'btn sm',label);
    node.type='button';node.onclick=fn;
    return node;
  }
  function field(label,control) {
    const node=el('label','field',label);node.append(control);return node;
  }
  function flavorSelect(all=false) {
    const select=el('select','inp');
    if (all) select.append(new Option('모든 맛',''));
    for (const [key,label] of Object.entries(flavors)) select.append(new Option(label,key));
    return select;
  }
  function normalize(value) {
    return value.normalize('NFC').trim().replace(/\s+/gu,' ');
  }
  function mount({container,client,getAdminId,isCurrent}) {
    const owner=getAdminId(), items=new Map();
    let page='catalog',kind='bomb',cursor=null,search='',tag='',editing=null;
    let busy=false,writing=false,closed=false,denied=false;
    const current=()=>!closed && owner && getAdminId()===owner && isCurrent();
    const frame=el('section','ap-stage drink-admin'),head=el('div','ap-head'),tabs=el('div','ap-actions');
    const toolbar=el('div','drink-admin-toolbar'),form=el('form','drink-admin-filter');
    const status=el('p','note'),newSlot=el('div'),list=el('div','ap-list'),input=el('input','inp');
    const select=el('select','inp'), filter=flavorSelect(true), flavorField=field('질문 맛 필터',filter);
    status.setAttribute('role','status');input.type='search';input.maxLength=240;
    select.id='drink-catalog-kind';
    for(const [key,game] of Object.entries(games))select.append(new Option(game.name,key));
    const searchBtn=el('button','btn sm','검색');searchBtn.type='submit';
    form.append(field('목록 검색',input),flavorField,searchBtn);
    const refresh=button('새로고침',()=>load(false)),more=button('더 보기',()=>load(true));
    const pending=button('등록 대기',()=>switchPage('queue')),catalog=button('게임별 질문·단어',()=>switchPage('catalog'));
    const add=button('새 항목 추가',()=>openEditor('new'),true);
    head.append(el('h3','h3','술게임 질문·단어 관리'),refresh);
    tabs.append(catalog,pending);
    toolbar.append(field('게임 선택',select),add);
    frame.append(head,tabs,toolbar,form,status,newSlot,list,more);container.replaceChildren(frame);

    function controls() {
      for(const node of frame.querySelectorAll('button,input,select,textarea'))node.disabled=busy||denied;
      refresh.disabled=busy;
      more.hidden=cursor===null||denied;
      form.hidden=toolbar.hidden=page!=='catalog'||denied;
      flavorField.hidden=kind!=='truth';
      form.classList.toggle('has-flavor',kind==='truth');
      pending.setAttribute('aria-pressed',String(page==='queue'));
      catalog.setAttribute('aria-pressed',String(page==='catalog'));
    }
    function clear() {
      cursor=null;items.clear();editing=null;newSlot.replaceChildren();list.replaceChildren();
    }
    async function call(action,options) {
      const rpc=page==='queue'?'drinking_prompt_suggestions':'drinking_content';
      const {data,error}=await client.rpc(rpc,{p_action:action,p_options:options});
      if(error||data?.error)throw error||Error(data.error);
      return data;
    }
    function issue(error) {
      if(['42501','PGRST301','PGRST303'].includes(error?.code)||
        ['not_admin','not_signed_in','adult_required','member_identity_required','banned'].includes(error?.message)){
        denied=true;clear();return '관리 권한과 회원 정보를 다시 확인해 주세요.';
      }
      if(error?.message==='duplicate_prompt')return '같은 항목이 이미 등록되어 있어요.';
      if(error?.message==='last_prompt')return kind==='truth'?'순한맛과 빨간맛에 질문을 하나씩 남겨 주세요.':'게임에 사용할 마지막 항목은 남겨 주세요.';
      if(error?.message==='invalid_prompt'||error?.message==='invalid_flavor')return '입력한 내용을 다시 확인해 주세요.';
      return '요청을 마치지 못했어요. 다시 시도해 주세요.';
    }
    async function load(append=false) {
      if(!current()||busy||(append&&cursor===null))return;
      busy=true;controls();status.textContent='불러오는 중이에요.';
      try {
        const options=append?{before:cursor}:{};
        if(page==='catalog'){
          options.kind=kind;
          if(search)options.q=search;
          if(tag&&kind==='truth')options.flavor=tag;
        }
        const data=await call(page==='queue'?'admin_list':'list',options);
        if(!current())return;
        if(!Array.isArray(data?.items)||!(data.next===null||Number.isSafeInteger(data.next)))throw Error('invalid_list');
        if(!append)clear();
        denied=false;
        for(const row of data.items){
          if(!row||!Number.isSafeInteger(row.id)||row.id<1||!Object.hasOwn(games,row.kind)||typeof row.text!=='string')continue;
          if(row.kind==='truth'&&!Object.hasOwn(flavors,row.flavor))continue;
          if(page==='catalog'&&(row.kind!==kind||!Number.isSafeInteger(row.revision)||(games[kind].second&&typeof row.second!=='string')))continue;
          items.set(row.id,row);
        }
        cursor=data.next;draw();
        status.textContent=items.size?'문구 '+items.size+'개를 표시하고 있어요.':page==='queue'?'검토할 문구가 없어요.':'조건에 맞는 항목이 없어요.';
      }catch(error){if(current())status.textContent=issue(error);}
      finally{busy=false;if(current())controls();}
    }
    function switchPage(next) {
      if(!current()||busy||page===next)return;
      page=next;clear();void load(false);
    }
    select.onchange=()=>{
      if(!current()||busy||!Object.hasOwn(games,select.value))return;
      kind=select.value;search=input.value='';tag=filter.value='';clear();void load(false);
    };
    function applyFilters(){
      if(!current()||busy||page!=='catalog')return;
      search=input.value.trim();tag=kind==='truth'?filter.value:'';clear();void load(false);
    }
    form.onsubmit=e=>{e.preventDefault();applyFilters();};
    filter.onchange=applyFilters;

    async function change(action,opts) {
      if(!current()||busy||denied)return;
      writing=busy=true;controls();
      let notice='';
      try {
        const result=await call(action,opts);
        if(!current())return;
        if(result?.ok!==true)throw Error('invalid_change');
        notice={approve:'기본 문구에 등록했어요.',reject:'제안을 반려했어요.',add:'새 항목을 추가했어요.',edit:'항목을 수정했어요.',delete:'항목을 삭제했어요.'}[action];
      }catch(error){
        if(!current())return;
        if(['review_closed','stale_revision','card_removed'].includes(error?.message))notice='다른 관리자가 먼저 처리했어요. 최신 목록을 확인해 주세요.';
        else status.textContent=issue(error);
      }finally{busy=writing=false;if(current())controls();}
      if(notice&&current()){
        clear();await load(false);
        if(current()&&!denied)status.textContent=notice+' '+status.textContent;
      }
    }
    function openEditor(id){
      if(!current()||busy||denied)return;
      editing=id;draw();
      frame.querySelector('.drink-admin-edit [name=text]')?.focus();
    }
    function editor(row) {
      const game=games[kind],edit=el('form','drink-admin-edit');
      const body=el(game.second||kind==='initial'?'input':'textarea','inp');
      const second=game.second?el('input','inp'):null,flavor=kind==='truth'?flavorSelect():null;
      body.name='text';body.value=row?.text??'';body.maxLength=game.limit||120;body.required=true;
      if(body.tagName==='TEXTAREA')body.rows=2;
      if(kind==='initial')body.placeholder='예: 사과 또는 ㅅㄱ';
      edit.append(field(game.field,body));
      if(second){
        second.name='second';second.value=row?.second??'';second.maxLength=120;second.required=true;
        edit.append(field(game.second,second));
      }
      if(flavor){
        flavor.name='flavor';flavor.value=row?.flavor||tag||'mild';edit.append(field('질문 맛',flavor));
      }
      const save=el('button','btn sm pri','저장');save.type='submit';
      const actions=el('div','ap-actions');
      actions.append(save,button('취소',()=>{
        editing=null;draw();
        (row?list.querySelector('[data-id="'+row.id+'"] button'):add)?.focus();
      }));
      edit.append(actions);
      edit.oninput=()=>{body.setCustomValidity('');second?.setCustomValidity('');};
      edit.onsubmit=e=>{
        e.preventDefault();
        if(!current()||busy||denied)return;
        const opts={kind,text:normalize(body.value)};
        if(!opts.text)body.setCustomValidity(game.field+' 내용을 입력해 주세요.');
        if(kind==='initial'&&!initials.test(opts.text))body.setCustomValidity('한글 두 글자 단어 또는 초성을 입력해 주세요. 예: 사과, ㅅㄱ');
        if(second){
          opts.second=normalize(second.value);
          if(!opts.second||opts.text.toLowerCase()===opts.second.toLowerCase())second.setCustomValidity('서로 다른 두 항목을 입력해 주세요.');
        }
        if(!edit.reportValidity())return;
        if(flavor)opts.flavor=flavor.value;
        if(row){opts.id=row.id;opts.revision=row.revision;}
        void change(row?'edit':'add',opts);
      };
      return edit;
    }
    function draw() {
      newSlot.replaceChildren();
      if(editing==='new')newSlot.append(editor(null));
      const cards=[];
      for(const row of items.values()){
        const game=games[row.kind],item=el('article','ap-card');
        item.dataset.id=row.id;
        if(editing===row.id&&page==='catalog'){item.append(editor(row));cards.push(item);continue;}
        const actions=el('div','ap-actions');
        if(game.second){
          const pair=el('dl','drink-admin-pair');
          pair.append(el('dt','',game.field),el('dd','',row.text),el('dt','',game.second),el('dd','',row.second));item.append(pair);
        }else item.append(el('strong','',row.text));
        const details=[];
        if(page==='queue')details.push(game.name);
        if(row.kind==='truth')details.push(flavors[row.flavor]);
        if(details.length)item.append(el('p','note',details.join(' · ')));
        item.append(actions);
        if(page==='queue'){
          actions.append(button('등록',()=>change('approve',{id:row.id}),true),button('반려',()=>change('reject',{id:row.id})));
        }else{
          actions.append(button('수정',()=>openEditor(row.id)),button('삭제',()=>{
            const content=game.second?row.text+' / '+row.second:row.text;
            if(current()&&!busy&&window.confirm('이 항목을 '+game.name+'에서 삭제할까요?\n\n'+content))void change('delete',{kind,id:row.id,revision:row.revision});
          }));
        }
        cards.push(item);
      }
      list.replaceChildren(...cards);
    }
    const sub=client.auth.onAuthStateChange((_event,session)=>{
      if(session?.user?.id!==owner){closed=true;clear();frame.remove();}
    }).data.subscription;
    controls();void load(false);
    return {refresh:()=>load(false),canLeave:()=>!writing,destroy(){closed=true;sub.unsubscribe();frame.remove();}};
  }
  window.OjjudaAdminDrinkingPrompts=Object.freeze({mount});
})();
