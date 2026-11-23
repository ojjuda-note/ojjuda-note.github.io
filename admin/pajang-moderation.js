/* Pajang moderation. Each RPC independently verifies administrator membership. */
(() => {
  'use strict';
  const PAGE_SIZE = 30, MESSAGE_SIZE = 50, MAX_OFFSET = 100000;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const STATUSES = {all:'전체', visible:'숨김 아님', hidden:'숨김'};
  const timeFormat = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', dateStyle:'medium', timeStyle:'short'});
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const timestamp = value => count(value) && Number.isFinite(new Date(value).getTime());
  const id = value => typeof value === 'string' && UUID.test(value);
  const nullableText = value => value === null || typeof value === 'string';
  const day = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
  };
  const moderation = row => typeof row.hidden === 'boolean' && typeof row.reason === 'string'
    && (row.hidden ? typeof row.hidden_at === 'string' && Number.isFinite(Date.parse(row.hidden_at)) : row.hidden_at === null);
  const answer = row => row && id(row.person) && day(row.day) && ['am','pm'].includes(row.slot)
    && nullableText(row.name) && nullableText(row.question) && typeof row.body === 'string' && timestamp(row.at)
    && typeof row.archived === 'boolean' && [30,365].includes(row.publication_window_days) && moderation(row);
  const room = row => row && id(row.first_person) && id(row.second_person) && row.first_person !== row.second_person
    && nullableText(row.first_name) && nullableText(row.second_name) && count(row.message_count) && row.message_count > 0
    && count(row.hidden_count) && row.hidden_count <= row.message_count && timestamp(row.last_at);
  const message = (row, thread) => row && id(row.id) && typeof row.body === 'string' && timestamp(row.at) && moderation(row)
    && ((row.src === thread.first_person && row.dst === thread.second_person)
      || (row.src === thread.second_person && row.dst === thread.first_person));
  const validPage = (data, limit, offset, validRow) => data && Array.isArray(data.items) && data.items.length <= limit
    && count(data.total_count) && data.total_count >= data.items.length
    && (!data.items.length || offset + data.items.length <= data.total_count) && data.items.every(validRow);
  const permissionError = error => ['42501','PGRST301','PGRST302'].includes(error?.code)
    || /admin_required|not_admin|not_signed_in|permission denied|jwt.*(?:expired|invalid)/i.test(error?.message || '');
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const displayName = value => value?.trim() || '이름 없는 회원';
  const offsetValue = (value, size) => count(value) && value <= MAX_OFFSET ? Math.floor(value / size) * size : 0;

  function mount({container, client, getAdminId, isCurrent = () => container.isConnected, initialState = null, view = 'answers', onChanged}) {
    view = view === 'chats' ? 'chats' : 'answers';
    const saved = initialState?.view && initialState.view !== view ? null : initialState;
    let owner = getAdminId?.() || null, destroyed = false, generation = 0, subscription = null, readController = null;
    let loading = false, mutating = false, editor = null, pageControls = [];
    let query = typeof saved?.query === 'string' ? saved.query.trim().slice(0,100) : '';
    let statusFilter = Object.hasOwn(STATUSES, saved?.status) ? saved.status : 'all';
    let offset = offsetValue(saved?.offset, PAGE_SIZE), messageOffset = offsetValue(saved?.messageOffset, MESSAGE_SIZE);
    let thread = view === 'chats' && id(saved?.thread?.first_person) && id(saved?.thread?.second_person)
      && saved.thread.first_person !== saved.thread.second_person
      ? {first_person:saved.thread.first_person, second_person:saved.thread.second_person} : null;
    const title = view === 'answers' ? '파장 답변 관리' : '파장 채팅 관리';
    const panel = el('section','apm-panel'); panel.setAttribute('aria-label',title);
    const active = () => !destroyed && !!owner && getAdminId?.() === owner && isCurrent() && panel.parentNode === container;
    const valid = version => active() && version === generation;
    const abortRead = () => {readController?.abort(); readController = null;};
    function clearAccess() {
      generation++; abortRead(); owner = null; editor = null; loading = mutating = false;
      query = ''; statusFilter = 'all'; offset = messageOffset = 0; thread = null;
      subscription?.unsubscribe?.(); subscription = null;
      if (!destroyed && panel.parentNode === container) {
        const notice = el('p','apm-status','관리자 권한을 확인할 수 없어요. 관리자 계정으로 다시 열어 주세요.');
        notice.setAttribute('role','status'); panel.replaceChildren(notice);
      }
    }
    function current(version) {
      if (valid(version)) return true;
      if (!destroyed && owner && getAdminId?.() !== owner) clearAccess();
      return false;
    }
    function ensureAccess() {if (active()) return true; if (!destroyed && owner && getAdminId?.() !== owner) clearAccess(); return false;}
    const control = (text, action, className = 'btn apm-button') => {
      const node = el('button',className,text); node.type = 'button'; node.addEventListener('click',action); return node;
    };
    const heading = el('div','apm-heading'), headingCopy = el('div');
    headingCopy.append(el('h3','',title), el('p','apm-help','원문을 삭제하지 않고 숨김 상태만 바꿔요. 복구한 내용은 기존 공개 기간과 회원 설정을 따라 표시돼요.'));
    const reload = control('새로고침',() => {void refresh();});
    heading.append(headingCopy,reload);
    const form = el('form','apm-filters'); form.setAttribute('aria-label',title + ' 조회 조건');
    const queryLabel = el('label','apm-query'), queryInput = el('input');
    queryInput.type = 'search'; queryInput.name = 'query'; queryInput.maxLength = 100; queryInput.value = query; queryInput.autocomplete = 'off';
    queryInput.placeholder = view === 'answers' ? '닉네임 또는 답변 내용' : '참여자 닉네임 또는 메시지 내용';
    queryLabel.append(el('span','',view === 'answers' ? '답변 찾기' : '대화 찾기'),queryInput);
    const statusLabel = el('label'), statusInput = el('select'); statusInput.name = 'status';
    for (const [value,label] of Object.entries(STATUSES)) {const option = el('option','',label); option.value = value; statusInput.append(option);}
    statusInput.value = statusFilter; statusLabel.append(el('span','','표시 상태'),statusInput);
    const search = el('button','btn pri apm-button','조회'); search.type = 'submit'; form.append(queryLabel,statusLabel,search);
    const back = control('대화 목록으로',() => {
      if (!ensureAccess() || mutating || editor) return;
      thread = null; messageOffset = 0; void load();
    }); back.classList.add('apm-back');
    const threadHeading = el('h4','apm-thread-heading');
    const status = el('p','apm-status'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
    const list = el('ol','apm-list'), pager = el('nav','apm-pager'); pager.setAttribute('aria-label',title + ' 페이지');
    panel.append(heading,form,back,threadHeading,status,list,pager); container.replaceChildren(panel);

    function controls() {
      const blocked = loading || mutating || !!editor;
      for (const node of [queryInput,statusInput,search,reload]) node.disabled = blocked;
      back.disabled = mutating || !!editor;
      for (const item of pageControls) item.node.disabled = blocked || !item.enabled;
      for (const node of list.querySelectorAll('[data-moderate],[data-open-chat]')) node.disabled = blocked;
      if (editor) for (const node of [editor.input,editor.submit,editor.cancel]) node.disabled = mutating;
      list.setAttribute('aria-busy',String(loading || mutating));
      panel.setAttribute('aria-busy',String(mutating));
    }
    function closeEditor(focus = false) {
      if (!editor || mutating) return;
      const previous = editor; editor = null; previous.form.remove(); previous.trigger.setAttribute('aria-expanded','false');
      controls(); if (focus && previous.trigger.isConnected) previous.trigger.focus();
    }
    function time(value) {
      const node = el('time','apm-time',timeFormat.format(new Date(value)));
      node.dateTime = new Date(value).toISOString(); node.title = '한국시간'; return node;
    }
    function identifiers(values) {
      const detail = el('details','apm-identifiers'), fields = el('dl');
      detail.append(el('summary','','회원·기록 번호'));
      for (const [label,value] of values) fields.append(el('dt','',label),el('dd','',value));
      detail.append(fields); return detail;
    }
    function addModeration(article,row,kind) {
      const badge = el('span','apm-badge' + (row.hidden ? ' is-hidden' : ''),row.hidden ? '숨김' : '숨김 아님');
      article.querySelector('.apm-card-header').append(badge);
      if (row.hidden) {
        const note = el('div','apm-moderation-note');
        note.append(el('p','','숨김 사유: ' + row.reason),time(Date.parse(row.hidden_at))); article.append(note);
      }
      const action = row.hidden ? 'restore' : 'hide', label = kind === 'answer' ? '답변' : '메시지';
      const trigger = control(label + (row.hidden ? ' 복구' : ' 숨기기'),() => openEditor(article,row,kind,action,trigger));
      trigger.dataset.moderate = action; trigger.setAttribute('aria-expanded','false'); article.append(trigger);
    }
    function renderAnswers(items) {
      list.setAttribute('aria-label','파장 답변');
      for (const row of items) {
        const article = el('li','apm-card'); article.dataset.kind = 'answer';
        const header = el('div','apm-card-header'); header.append(el('strong','',displayName(row.name)),time(row.at));
        article.append(header,el('p','apm-round',row.day + (row.slot === 'am' ? ' 오전' : ' 오후')),
          el('h4','apm-question',row.question || '질문 정보 없음'),el('p','apm-body',row.body),
          identifiers([['회원',row.person],['회차',row.day + ' ' + row.slot]]));
        addModeration(article,row,'answer'); list.append(article);
      }
    }
    function renderRooms(items) {
      list.setAttribute('aria-label','파장 대화 목록');
      for (const row of items) {
        const article = el('li','apm-card'); article.dataset.kind = 'chat';
        const header = el('div','apm-card-header'); header.append(el('strong','',displayName(row.first_name) + ' · ' + displayName(row.second_name)),time(row.last_at));
        const open = control('대화 내용 보기',() => {
          if (!ensureAccess() || loading || mutating || editor) return;
          thread = {first_person:row.first_person,second_person:row.second_person}; messageOffset = 0; void load();
        }); open.dataset.openChat = '';
        article.append(header,el('p','apm-round','메시지 ' + row.message_count.toLocaleString('ko-KR') + '개 · 숨김 ' + row.hidden_count.toLocaleString('ko-KR') + '개'),
          identifiers([['첫 번째 회원',row.first_person],['두 번째 회원',row.second_person]]),open); list.append(article);
      }
    }
    function renderMessages(data) {
      list.setAttribute('aria-label','파장 대화 메시지');
      threadHeading.textContent = displayName(data.first_name) + ' · ' + displayName(data.second_name);
      for (const row of data.items) {
        const article = el('li','apm-card'); article.dataset.kind = 'message';
        const header = el('div','apm-card-header'); header.append(el('strong','',displayName(row.src === data.first_person ? data.first_name : data.second_name)),time(row.at));
        article.append(header,el('p','apm-body',row.body),identifiers([['보낸 회원',row.src],['받는 회원',row.dst],['메시지',row.id]]));
        addModeration(article,row,'message'); list.append(article);
      }
    }
    function renderPager(total,size,currentOffset) {
      pageControls = []; pager.replaceChildren();
      if (!total) return;
      const go = value => {if (!ensureAccess() || loading || mutating || editor) return; if (thread) messageOffset = value; else offset = value; void load();};
      const previous = control('이전',() => go(Math.max(0,currentOffset-size))), next = control('다음',() => go(currentOffset+size));
      pageControls.push({node:previous,enabled:currentOffset>0},{node:next,enabled:currentOffset+size<total && currentOffset+size<=MAX_OFFSET});
      pager.append(previous,el('span','apm-page',`${Math.floor(currentOffset/size)+1} / ${Math.ceil(total/size)}페이지`),next);
      if (currentOffset) {const first = control('첫 페이지',() => go(0)); pageControls.push({node:first,enabled:true}); pager.append(first);}
    }
    async function load(notice = '') {
      if (!ensureAccess() || mutating) return;
      closeEditor(); abortRead(); readController = new AbortController();
      const version = ++generation, currentThread = thread && {...thread}, size = currentThread ? MESSAGE_SIZE : PAGE_SIZE, currentOffset = currentThread ? messageOffset : offset;
      const rpcName = currentThread ? 'admin_pajang_chat_messages' : view === 'chats' ? 'admin_pajang_chats' : 'admin_pajang_answers';
      const args = currentThread ? {p_first:currentThread.first_person,p_second:currentThread.second_person,p_limit:size,p_offset:currentOffset}
        : {p_query:query,p_status:statusFilter,p_limit:size,p_offset:currentOffset};
      loading = true; list.replaceChildren(); pager.replaceChildren(); pageControls = []; controls();
      form.hidden = !!currentThread; back.hidden = threadHeading.hidden = !currentThread; threadHeading.textContent = currentThread ? '대화 내용' : '';
      status.textContent = '내용을 불러오는 중이에요.';
      try {
        const request = client.rpc(rpcName,args);
        const {data,error} = await (typeof request?.abortSignal === 'function' ? request.abortSignal(readController.signal) : request);
        if (!current(version)) return;
        if (error) {if (permissionError(error)) {clearAccess(); return;} throw error;}
        const validThread = !currentThread || data?.first_person === currentThread.first_person && data?.second_person === currentThread.second_person
          && nullableText(data.first_name) && nullableText(data.second_name);
        if (!validThread || !validPage(data,size,currentOffset,currentThread ? row => message(row,currentThread) : view === 'chats' ? room : answer)) throw Error('invalid_pajang_response');
        if (currentThread) renderMessages(data); else if (view === 'chats') renderRooms(data.items); else renderAnswers(data.items);
        renderPager(data.total_count,size,currentOffset);
        const summary = data.items.length ? `${data.total_count.toLocaleString('ko-KR')}건 중 ${currentOffset+1}–${currentOffset+data.items.length}건 · 최근순 · 한국시간`
          : currentOffset && data.total_count ? '이 페이지에 남은 기록이 없어요. 첫 페이지를 확인해 주세요.'
            : currentThread ? '이 대화에 메시지가 없어요.' : view === 'chats' ? '조건에 맞는 대화가 없어요.' : '조건에 맞는 답변이 없어요.';
        status.textContent = (notice ? notice + ' ' : '') + summary;
      } catch (error) {
        if (!current(version)) return;
        if (permissionError(error)) {clearAccess(); return;}
        list.replaceChildren(); pager.replaceChildren(); pageControls = [];
        status.textContent = (notice ? notice + ' ' : '') + (error?.code === '22023' ? '조회 조건을 확인하고 다시 조회해 주세요.' : '내용을 불러오지 못했어요. 다시 불러오기를 눌러 주세요.');
        const retry = control('다시 불러오기',() => {void load(notice);}); pageControls.push({node:retry,enabled:true}); pager.append(retry);
      } finally {if (valid(version)) {loading = false; readController = null; controls();}}
    }
    function openEditor(article,row,kind,action,trigger) {
      if (!ensureAccess() || loading || mutating || editor) return;
      const form = el('form','apm-edit'), label = el('label'), input = el('textarea');
      form.noValidate = true; input.name = 'reason'; input.rows = 2; input.maxLength = 200; input.required = true;
      const verb = action === 'hide' ? '숨김' : '복구'; label.append(el('span','',verb + ' 사유'),input);
      const help = el('p','apm-help','사유를 2~200자로 적어 주세요. 원문은 삭제되지 않아요.');
      const error = el('p','apm-edit-error'); error.setAttribute('role','alert');
      const submit = el('button','btn pri apm-button',verb + ' 확정'); submit.type = 'submit';
      const cancel = control('취소',() => {if (!mutating) closeEditor(true);});
      const actions = el('div','apm-edit-actions'); actions.append(submit,cancel); form.append(label,help,error,actions);
      const edit = editor = {row,kind,action,form,input,error,submit,cancel,trigger}; trigger.setAttribute('aria-expanded','true'); article.append(form);
      form.addEventListener('submit',event => {event.preventDefault(); void moderate(edit);});
      controls(); input.focus();
    }
    async function moderate(edit) {
      if (!edit || edit !== editor || !ensureAccess() || loading || mutating) return;
      const reason = edit.input.value.trim(), length = Array.from(reason).length;
      if (length < 2 || length > 200) {edit.error.textContent = '사유를 2~200자로 입력해 주세요.'; edit.input.focus(); return;}
      edit.error.textContent = ''; mutating = true; abortRead(); const version = ++generation; controls();
      const args = {p_kind:edit.kind,p_action:edit.action,p_person:edit.kind === 'answer' ? edit.row.person : null,
        p_day:edit.kind === 'answer' ? edit.row.day : null,p_slot:edit.kind === 'answer' ? edit.row.slot : null,
        p_message_id:edit.kind === 'message' ? edit.row.id : null,p_reason:reason};
      let updated = false;
      try {
        const {data,error} = await client.rpc('admin_pajang_moderate',args);
        if (!current(version)) return;
        if (error) {if (permissionError(error)) {clearAccess(); return;} throw error;}
        if (data?.ok !== true || data.kind !== edit.kind || data.hidden !== (edit.action === 'hide')) throw Error('unconfirmed_moderation');
        updated = true; mutating = false; closeEditor();
        try {onChanged?.();} catch { /* The server already confirmed the change. */ }
        if (current(version)) await load(edit.action === 'hide' ? '숨겼어요.' : '복구했어요.');
      } catch (error) {
        if (!current(version)) return;
        if (permissionError(error)) {clearAccess(); return;}
        edit.error.textContent = error?.message === 'unconfirmed_moderation' ? '변경 결과를 확인하지 못했어요. 취소한 뒤 새로고침해 주세요.'
          : error?.code === 'P0002' ? '원문을 찾을 수 없어요. 취소한 뒤 새로고침해 주세요.'
            : '처리하지 못했어요. 입력한 사유를 확인하고 다시 시도해 주세요.';
      } finally {
        if (!updated && valid(version)) {mutating = false; controls();}
      }
    }
    async function refresh() {if (!ensureAccess() || mutating) return; closeEditor(); await load();}
    form.addEventListener('submit',event => {
      event.preventDefault(); if (!ensureAccess() || loading || mutating || editor) return;
      query = queryInput.value.trim().slice(0,100); queryInput.value = query;
      statusFilter = Object.hasOwn(STATUSES,statusInput.value) ? statusInput.value : 'all'; offset = 0; void load();
    });
    const api = {
      refresh, canLeave:() => !mutating, hasDraft:() => !!editor?.input.value.trim(),
      getState:() => ({view,query,status:statusFilter,offset,thread:thread && {...thread},messageOffset}),
      destroy() {
        if (destroyed) return;
        destroyed = true; generation++; abortRead(); owner = null; editor = null; mutating = false;
        subscription?.unsubscribe?.(); subscription = null;
        if (panel.parentNode === container) panel.remove();
      }
    };
    if (!owner || typeof client?.rpc !== 'function') {clearAccess(); return api;}
    subscription = client.auth?.onAuthStateChange?.((_event,session) => {if (session?.user?.id !== owner) clearAccess();})?.data?.subscription;
    void load(); return api;
  }
  window.OjjudaAdminPajang = Object.freeze({mount});
})();
