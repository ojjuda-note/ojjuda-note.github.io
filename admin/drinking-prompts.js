(() => {
  'use strict';
  const kinds={king:'왕게임 명령', fingers:'손병호 게임 조건', imagevote:'이미지 게임 질문', truth:'진실게임 질문'};
  const flavors={mild:'순한맛', spicy:'빨간맛'};

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
  function mount({container,client,getAdminId,isCurrent}) {
    const owner=getAdminId(),items=new Map();
    let page='queue',cursor=null,search='',tag='',editing=null,busy=false,writing=false,closed=false;
    const current=()=>!closed && owner && getAdminId()===owner && isCurrent();
    const frame=el('section','ap-stage'), head=el('div','ap-head'),tabs=el('div','ap-actions'),form=el('form','drink-admin-filter');
    const status=el('p','note'),list=el('div','ap-list'),input=el('input','inp'),filter=flavorSelect(true);
    status.setAttribute('role','status');input.type='search';input.maxLength=240;
    const searchBtn=el('button','btn sm','검색');searchBtn.type='submit';
    form.append(field('질문 검색',input),field('질문 맛',filter),searchBtn);
    const refresh=button('새로고침',()=>load(false)),more=button('더 보기',()=>load(true));
    const pending=button('등록 대기',()=>switchPage('queue')),truth=button('진실게임 카드 관리',()=>switchPage('truth'));
    head.append(el('h3','h3','술게임 질문·명령 검토'),refresh);
    tabs.append(pending,truth);
    frame.append(head,tabs,form,status,list,more);container.replaceChildren(frame);

    function controls() {
      for (const node of frame.querySelectorAll('button,input,select,textarea')) node.disabled=busy;
      more.hidden=cursor===null;
      form.hidden=page!=='truth';
      pending.setAttribute('aria-pressed',String(page==='queue'));
      truth.setAttribute('aria-pressed',String(page==='truth'));
    }
    function clear() {cursor=null;items.clear();editing=null;list.replaceChildren();}
    async function call(action,options) {
      const {data,error}=await client.rpc('drinking_prompt_suggestions',{p_action:action,p_options:options});
      if(error || data?.error) throw error||Error(data.error);
      return data;
    }
    function issue(error) {
      if(error?.code==='42501'||['not_admin','not_signed_in','adult_required','member_identity_required','banned'].includes(error?.message)){
        clear();return '관리 권한과 회원 정보를 다시 확인해 주세요.';
      }
      if(error?.message==='duplicate_prompt')return '같은 질문이 이미 등록되어 있어요.';
      if(error?.message==='invalid_prompt'||error?.message==='invalid_flavor')return '질문의 내용과 맛을 확인해 주세요.';
      return '요청을 마치지 못했어요. 다시 시도해 주세요.';
    }
    async function load(append) {
      if(!current()||busy||(append&&cursor===null))return;
      busy=true;controls();status.textContent='불러오는 중이에요.';
      try {
        const options=append?{before:cursor}:{};
        if(page==='truth'){if(search)options.q=search;if(tag)options.flavor=tag;}
        const data=await call(page==='queue'?'admin_list':'truth_list',options);
        if(!current())return;
        if(!Array.isArray(data?.items)||!(data.next===null||Number.isSafeInteger(data.next)))throw Error('invalid_list');
        if(!append)clear();
        for(const row of data.items){
          if(!Number.isSafeInteger(row.id)||row.id<1||!Object.hasOwn(kinds,row.kind)||typeof row.text!=='string')continue;
          if(row.kind==='truth'&&!Object.hasOwn(flavors,row.flavor))continue;
          if(page==='truth'&&(row.kind!=='truth'||!Number.isSafeInteger(row.revision)))continue;
          items.set(row.id,row);
        }
        cursor=data.next;draw();
        status.textContent=items.size?'문구 '+items.size+'개를 표시하고 있어요.':page==='queue'?'검토할 문구가 없어요.':'조건에 맞는 카드가 없어요.';
      } catch(error) {if(current())status.textContent=issue(error);}
      finally {busy=false;if(current())controls();}
    }
    function switchPage(next) {
      if(!current()||busy||page===next)return;
      page=next;clear();void load(false);
    }
    form.onsubmit=e=>{
      e.preventDefault();if(busy)return;
      search=input.value.trim();tag=filter.value;clear();void load(false);
    };
    async function change(action,opts) {
      if(!current()||busy)return;
      writing=busy=true;controls();
      let reload=false,notice='';
      try {
        const result=await call(action,opts);if(!current())return;
        if(result?.ok!==true)throw Error('invalid_review');
        reload=true;
        notice={approve:'기본 문구에 등록했어요.',reject:'제안을 반려했어요.',truth_edit:'진실게임 카드를 수정했어요.',truth_delete:'진실게임 카드를 삭제했어요.'}[action];
      } catch(error) {
        if(!current())return;
        if(['review_closed','stale_revision','card_removed'].includes(error?.message)){reload=true;notice='다른 관리자가 먼저 처리했어요. 최신 목록을 확인해 주세요.';}
        else status.textContent=issue(error);
      } finally {busy=writing=false;if(current())controls();}
      if(reload&&current()){
        items.delete(opts.id);editing=null;draw();
        await load(false);
        if(current()&&status.textContent!=='관리 권한과 회원 정보를 다시 확인해 주세요.')status.textContent=notice+' '+status.textContent;
      }
    }
    function editor(row) {
      const edit=el('form','drink-admin-edit'),body=el('textarea','inp'),flavor=flavorSelect();
      body.value=row.text;body.maxLength=240;body.required=true;body.rows=3;flavor.value=row.flavor;
      const save=el('button','btn sm pri','저장');save.type='submit';
      const actions=el('div','ap-actions');
      actions.append(save,button('취소',()=>{editing=null;draw();}));
      edit.append(field('질문',body),field('질문 맛',flavor),actions);
      edit.onsubmit=e=>{e.preventDefault();if(body.value.trim())void change('truth_edit',{id:row.id,revision:row.revision,text:body.value.trim(),flavor:flavor.value});};
      return edit;
    }
    function draw() {
      const cards=[];
      for(const row of items.values()){
        const item=el('article','ap-card');
        const label=kinds[row.kind]+(row.kind==='truth'?' · '+flavors[row.flavor]:'');
        item.append(el('strong','',label));
        if(editing===row.id&&page==='truth'){item.append(editor(row));cards.push(item);continue;}
        const actions=el('div','ap-actions');item.append(el('p','note',row.text),actions);
        if(page==='queue'){
          actions.append(button('등록',()=>change('approve',{id:row.id}),true),button('반려',()=>change('reject',{id:row.id})));
        }else{
          actions.append(button('수정',()=>{editing=row.id;draw();list.querySelector('textarea')?.focus();}),button('삭제',()=>{
            if(window.confirm('이 질문을 진실게임 카드에서 삭제할까요?\n\n'+row.text))void change('truth_delete',{id:row.id,revision:row.revision});
          }));
        }
        cards.push(item);
      }
      list.replaceChildren(...cards);
    }
    const sub=client.auth.onAuthStateChange((_event,session)=>{
      if(session?.user?.id!==owner){closed=true;clear();container.replaceChildren();}
    }).data.subscription;
    controls();void load(false);
    return {refresh:()=>load(false),canLeave:()=>!writing,destroy(){closed=true;sub.unsubscribe();container.replaceChildren();}};
  }
  window.OjjudaAdminDrinkingPrompts=Object.freeze({mount});
})();
