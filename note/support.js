(() => {
  'use strict';
  const el = (tag, text, cls) => { const x=document.createElement(tag); if(text!==undefined)x.textContent=text; if(cls)x.className=cls; return x; };
  const button = (text, action) => { const b=el('button',text,'button');b.type='button';b.addEventListener('click',action);return b; };
  const date = value => new Date(value).toLocaleString('ko-KR');
  let client, getUserId=()=>null, panel, layer, content, message, focus, run=0, busy=false;
  let inertState=[],previousOverflow='',targetInquiry=null;
  const validId=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
  async function rpc(name, args={}) { const {data,error}=await client.schema('ojjuda_note').rpc(name,args);if(error)throw error;return data; }
  function valid(epoch,user) {return epoch===run && user===getUserId() && !layer.hidden;}
  function keepFocus(epoch,user) {
    if(!valid(epoch,user))return;
    const active=document.activeElement;
    if(!panel.contains(active)||active?.disabled)panel.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  }
  function close() {
    if(!layer||layer.hidden)return;
    run++;busy=false;targetInquiry=null;layer.hidden=true;content.replaceChildren();message.textContent='';
    for(const [element,prior]of inertState)if(element.isConnected)element.inert=prior;
    inertState=[];document.body.style.overflow=previousOverflow;
    const restoreFocus=focus;focus=null;
    if(restoreFocus?.isConnected&&!restoreFocus.closest('[inert]')&&restoreFocus.getClientRects().length)restoreFocus.focus({preventScroll:true});
  }
  function show(inquiryId) {
    const requested=validId(inquiryId)?inquiryId:null;
    if(!layer.hidden){if(requested){targetInquiry=requested;void home();}return;}
    targetInquiry=requested;
    focus=document.activeElement;previousOverflow=document.body.style.overflow;
    inertState=[...document.body.children].filter(element=>element!==layer&&element instanceof HTMLElement).map(element=>[element,element.inert]);
    for(const [element]of inertState)element.inert=true;
    layer.hidden=false;document.body.style.overflow='hidden';
    panel.querySelector('button').focus();void home();
  }
  function inquiryRow(item) {
    const row=el('article',undefined,'note-inquiry');
    row.dataset.inquiryId=item.id;row.tabIndex=-1;
    row.append(el('small',`${date(item.created_at)} · ${item.status==='resolved'?'답변 완료':'답변 대기'}`),el('p',item.body));
    if(item.reply){row.append(el('strong','관리자 답변'),el('p',item.reply));}
    return row;
  }
  async function home() {
    const epoch=++run,user=getUserId(),requested=targetInquiry;busy=false;message.textContent='';content.replaceChildren(el('p','불러오는 중이에요.'));
    keepFocus(epoch,user);
    try {
      const settings=await rpc('get_note_state');
      if(!valid(epoch,user))return;
      content.replaceChildren();
      for(const [key,title] of [['contact_text','문의처'],['guidelines','이용 안내'],['terms','이용약관'],['privacy','개인정보 처리방침']]) {
        const section=el('details'),summary=el('summary',title),value=typeof settings?.[key]==='string'?settings[key].trim():'';
        section.append(summary);
        if(value)section.append(el('p',value));
        else if(key==='terms'||key==='privacy'){
          const link=el('a',`${title} 보기`,'support-document-link');
          link.href=key==='terms'?'/terms.html':'/privacy.html';section.append(link);
        }else section.append(el('p',key==='contact_text'
          ? '노트 문의는 로그인 후 아래 문의함에 남겨 주세요.'
          : '카드와 답글에서 서로를 존중해 주세요. 신고는 카드의 더 보기에서 접수할 수 있어요.'));
        content.append(section);
      }
      content.append(el('h3','내 문의'),el('p','문의는 본인과 노트 관리자만 볼 수 있어요.','support-help'));
      if(!user){const link=el('a','대문에서 로그인','button');link.href='/';content.append(link);return;}
      const form=el('form',undefined,'support-form'),label=el('label','문의 내용'),field=el('textarea');
      field.id='note-inquiry-body';field.maxLength=2000;field.required=true;field.rows=5;label.htmlFor=field.id;
      const send=el('button','문의 보내기','button primary');send.type='submit';
      form.append(label,field,el('small','2,000자 이내 · 24시간 동안 최대 3건'),send);content.append(form);
      const requestId=crypto.randomUUID();
      form.addEventListener('submit',async event=>{
        event.preventDefault();if(busy||!field.value.trim()||!valid(epoch,user))return;
        busy=true;send.disabled=true;field.disabled=true;message.textContent='문의를 보내는 중이에요.';
        keepFocus(epoch,user);
        try {
          await rpc('submit_inquiry',{p_request_id:requestId,p_body:field.value.trim()});
          if(!valid(epoch,user))return;
          await home();message.textContent='문의를 접수했어요. 이 화면에서 답변을 확인할 수 있어요.';
        } catch(error) {
          if(!valid(epoch,user))return;
          message.textContent=error.code==='22023'?'24시간 동안 문의는 3건까지 보낼 수 있어요.':'보내지 못했어요. 작성한 내용은 유지됩니다. 다시 시도해 주세요.';
        } finally {if(valid(epoch,user)){busy=false;send.disabled=false;field.disabled=false;}}
      });
      const rows=el('div');content.append(rows);
      const inquiries=await rpc('list_my_inquiries')||[];if(!valid(epoch,user))return;
      // A recent answer can refer to an inquiry older than the recent list.
      if(requested&&!inquiries.some(item=>item.id===requested)){
        const older=await rpc('get_my_inquiry',{p_id:requested});if(!valid(epoch,user))return;
        if(older?.id===requested)inquiries.unshift(older);
      }
      if(!inquiries.length)rows.append(el('p','보낸 문의가 없어요.','support-help'));
      else inquiries.forEach(item=>rows.append(inquiryRow(item)));
      if(requested){
        const target=[...rows.children].find(row=>row.dataset.inquiryId===requested);
        if(target){target.scrollIntoView({block:'center',behavior:'auto'});target.focus({preventScroll:true});targetInquiry=null;}
        else message.textContent='해당 문의를 찾을 수 없어요.';
      }
    } catch {if(valid(epoch,user)){content.replaceChildren(el('p','안내를 불러오지 못했어요.'),button('다시 시도',home));keepFocus(epoch,user);}}
  }
  function install(options) {
    if(layer||!options.client)return;
    client=options.client;getUserId=options.getUserId;
    layer=el('div',undefined,'dialog-backdrop note-support-layer');layer.hidden=true;
    panel=el('section',undefined,'management-dialog');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','note-support-title');
    const head=el('header',undefined,'management-head'),title=el('h2','문의·운영 안내');title.id='note-support-title';
    head.append(title,button('닫기',close));content=el('div',undefined,'management-body note-support-content');message=el('p','','management-message');message.setAttribute('role','status');
    panel.append(head,content,message);layer.append(panel);document.body.append(layer);
    document.querySelector('.note-tools')?.append(button('문의·운영 안내',show));
    layer.addEventListener('click',event=>{if(event.target===layer&&!busy)close();});
    layer.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
      if(event.key!=='Tab')return;
      event.stopPropagation();
      const items=[...panel.querySelectorAll('button:not(:disabled),textarea:not(:disabled),summary,a[href]')].filter(x=>x.getClientRects().length);
      const first=items[0],last=items.at(-1);
      if(event.shiftKey&&(document.activeElement===first||!items.includes(document.activeElement))){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!items.includes(document.activeElement))){event.preventDefault();first?.focus();}
    });
    let identity=getUserId();client.auth.onAuthStateChange((_event,session)=>{const next=session?.user?.id||null;if(next!==identity){identity=next;if(!layer.hidden)close();}});
  }
  async function renderAdmin({client:adminClient,container,onChanged=()=>{},isCurrent=()=>true}) {
    let epoch=0,offset=0,filter='open',pending=false;
    const adminRpc=async(name,args={})=>{const {data,error}=await adminClient.schema('ojjuda_note').rpc(name,args);if(error)throw error;return data;};
    const current=n=>n===epoch&&isCurrent()&&container.isConnected;
    async function load() {
      const n=++epoch;container.replaceChildren();
      const filters=el('div',undefined,'support-filter');
      for(const [value,label]of[['open','답변 대기'],['resolved','답변 완료'],['all','전체']]){const b=button(label,()=>{filter=value;offset=0;void load();});b.setAttribute('aria-pressed',String(filter===value));filters.append(b);}
      const rows=el('div'),status=el('p','불러오는 중이에요.');status.setAttribute('role','status');container.append(filters,status,rows);
      try {
        const data=await adminRpc('admin_inquiries',{p_status:filter,p_limit:30,p_offset:offset});if(!current(n))return;
        status.textContent=data?.length?'':'문의가 없어요.';
        for(const item of data||[]){
          const row=inquiryRow(item),form=el('form',undefined,'support-form'),label=el('label','답변'),field=el('textarea');
          field.id=`reply-${item.id}`;label.htmlFor=field.id;field.value=item.reply||'';field.rows=4;field.maxLength=2000;field.required=true;
          const send=el('button',item.reply?'답변 수정':'답변 등록','button primary');send.type='submit';const feedback=el('p','');feedback.setAttribute('role','status');
          form.append(label,field,send,feedback);row.append(form);rows.append(row);
          form.addEventListener('submit',async event=>{
            event.preventDefault();if(pending||!field.value.trim()||!current(n))return;
            const reply=field.value.trim();
            if(!window.confirm('이 답변을 문의 작성자에게 공개할까요?'))return;
            pending=true;send.disabled=true;feedback.textContent='저장 중이에요.';
            try {
              await adminRpc('admin_reply_inquiry',{p_id:item.id,p_reply:reply,p_expected_updated_at:item.updated_at});
              if(!current(n))return;
              // A host refresh failure must not turn a committed reply into a save error.
              try {await onChanged();} catch {/* The reply has already been saved. */}
              if(current(n))await load();
            }
            catch(error){if(current(n))feedback.textContent=error.code==='40001'?'다른 관리자가 답변을 바꿨어요. 문의를 다시 불러와 주세요.':'답변을 저장하지 못했어요. 입력은 유지됩니다.';}
            finally {pending=false;if(current(n))send.disabled=false;}
          });
        }
        const pagination=el('div',undefined,'support-filter');
        if(offset)pagination.append(button('이전',()=>{offset=Math.max(0,offset-30);void load();}));
        if(data?.length===30)pagination.append(button('다음',()=>{offset+=30;void load();}));
        rows.append(pagination);
      }catch{if(current(n)){status.textContent='문의를 불러오지 못했어요. 관리자 권한을 확인해 주세요.';rows.append(button('다시 시도',load));}}
    }
    await load();
  }
  window.OjjudaNoteSupport={install,renderAdmin,open:id=>{if(layer)show(id);},close:()=>{if(layer&&!layer.hidden)close();}};
})();
