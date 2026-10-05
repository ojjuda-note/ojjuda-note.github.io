/* Note administration. World administrator rights are enforced by ojjuda_note RPCs. */
(() => {
  'use strict';
  const PAGE_SIZE = 30;
  const ADMIN_BASE = (() => { try { return new URL('.', document.currentScript?.src || location.href).href; } catch { return ''; } })();
  let adminMap = null;
  const FONT_CHOICES = [
    ['default', '고운돋움'], ['round', '둥근 글씨'], ['serif', '명조'],
    ['handwriting', '손글씨'], ['mono', '고정폭']
  ];
  const EFFECT_CHOICES = [
    ['none', '없음'], ['rain', '비 내리기'], ['shimmer', '빛 스치기'],
    ['rainbow', '무지개'], ['snow', '눈 내리기'], ['starlight', '별빛'],
    ['fireflies', '반딧불이'], ['petals', '꽃잎'], ['bubbles', '비눗방울'],
    ['aurora', '오로라'], ['confetti', '색종이'], ['sunbeams', '햇살'],
    ['mist', '안개'], ['ocean', '물결'], ['heartbeat', '빛의 파동'],
    ['orbit', '궤도'], ['glitter', '반짝이'], ['meteor', '별똥별'],
    ['leaves', '나뭇잎'], ['neon', '네온'], ['dawn', '새벽빛'],
    ['sparkle', '고정 반짝임'], ['frame', '고정 테두리']
  ];
  const COLOR_CHOICES = [
    ['default', '기본'], ['red', '빨강'], ['yellow', '노랑'],
    ['green', '초록'], ['blue', '파랑'], ['purple', '보라'],
    ['black', '검정'], ['white', '흰색']
  ];
  const PHOTO_CHOICES = [['', '지정 없음'], ...Array.from({ length: 180 }, (_, index) =>
    [String(index + 10), `사진 ${String(index + 1).padStart(3, '0')}`])];
  const PHOTO_PAGE_SIZE = 12;
  const photoKeyValid = value => /^\d{2,3}$/.test(String(value)) && Number(value) >= 10 && Number(value) <= 189;
  const photoUrl = key => `/note/assets/${key}.jpg?v=20260927-curated180`;
  // Match the World's risk_pattern() for badges; the server decides which rows enter the risk list.
  const RISK_SIGNAL = /(죽고\s*싶|자살|자해|사라지고\s*싶|없어지고\s*싶|살기\s*싫|살고\s*싶지\s*않|끝내고\s*싶|목숨|유서|뛰어내리|맞았|때렸|폭행|협박|학대|성폭|스토킹|죽여\s*버|죽일\s*거)/i;
  const TABS = [
    ['cards', '카드'], ['risk', '위험 신호'], ['events', '이벤트'], ['archive', '보관함'], ['map', '위치 지도'], ['settings', '공지'], ['spam', '도배 방지'],
    ['reports', '신고'], ['inquiries', '문의'], ['users', '카드 이용 제한'], ['actions', '작업 기록']
  ];
  const NOTE_TABS = Object.freeze(TABS.slice(0, 7));
  const VIEW_OF_TAB = { cards: 'card', risk: 'risk', events: 'event', archive: 'archive' }, TAB_OF_VIEW = { card: 'cards', risk: 'risk', event: 'events', archive: 'archive' };
  function openTab(id) {   // 탭을 고르면 카드 종류를 맞추고 불러와요
    if (!confirmLeave()) return false;
    if (VIEW_OF_TAB[id] && filters.cards.view !== VIEW_OF_TAB[id]) Object.assign(filters.cards, { view: VIEW_OF_TAB[id], offset: 0, expiredOffset: 0, query: '', state: 'all' });
    return load(id);
  }
  const TAB_ITEMS = Object.freeze(TABS.map(([id, label]) => Object.freeze({ id, label })));
  const HELP = {
    overview: '콘텐츠와 운영 상태를 확인하세요.',
    settings: '모든 화면에 표시할 공지를 관리합니다.',
    spam: '회원 한 명이 작성하는 카드·답글을 합산합니다. 새 글부터 적용되며, 글을 삭제해도 횟수는 초기화되지 않습니다.',
    map: '위치를 켜고 쓴 카드를 최신순으로 50개씩 지도에 보여 줘요. 익명 카드라 정확한 좌표 대신 약 1km 칸으로 맞춘 대략의 위치예요.',
    cards: '익명카드·답글과 위험 신호를 관리합니다. 상위 카드를 숨기면 그 답글도 함께 숨겨집니다.',
    risk: '위험 표현이 포함된 카드·답글을 확인하고 필요한 조치를 관리합니다.',
    events: '이벤트 카드를 관리합니다.',
    archive: '삭제되거나 기간이 끝난 카드를 한 달 동안 보관합니다. 기간 전에도 바로 영구 삭제할 수 있어요.',
    reports: '신고 내용을 확인하고 카드 공개 여부와 처리 상태를 관리합니다.',
    inquiries: '이용자의 문의를 확인하고 답변합니다.',
    users: '카드·답글 작성을 제한합니다. 계정 전체 이용 정지는 계정 메뉴에서 관리합니다.',
    actions: '카드 관리 변경과 처리 사유를 확인하세요.'
  };
  const ACTIONS = {
    hide: '카드 숨김', restore: '카드 복구', resolve_report: '신고 처리 완료', edit: '카드 수정',
    archive: '카드 보관', archive_card: '카드 보관', restore_archived_card: '보관 카드 복구',
    purge_card: '보관 자료 영구 정리', edit_event: '이벤트 조건 정정',
    restrict_user: '이용 제한', release_user: '이용 제한 해제', add_moderator: '운영자 지정',
    remove_moderator: '운영자 해제', update_settings: '서비스 공지 변경', update_spam_settings: '도배 방지 설정 변경', reply_inquiry: '문의 답변'
  };
  const filters = { cards: { query: '', state: 'all', view: 'card', offset: 0, expiredOffset: 0 }, users: { query: '', offset: 0 }, actions: { offset: 0 }, reports: { offset: 0 } };
  let client = null, onChanged = null, userId = null, subscription = null;
  let instance = 0, pageRun = 0, busy = false, tabId = 'cards', actionReturn = null;
  let previousFocus = null, previousOverflow = '', inertState = [], disabledState = [], embedded = false;
  let externalNav = false, authorized = false, onTabChange = null;
  let root, panel, nav, main, status, closeButton;
  let editPreviewObserver = null;
  let inquiryController = null;
  const draftValues = new Map();
  let extraDraftCheck = () => false;

  function canLeave() { return !busy && inquiryController?.canLeave?.() !== false; }
  function hasDraft() {
    return inquiryController?.hasDraft?.() === true || extraDraftCheck()
      || [...draftValues].some(([control, initial]) => control.isConnected && control.closest('.na-action-form,.na-settings-form') && control.value !== initial);
  }
  function confirmLeave() { return canLeave() && (!hasDraft() || window.confirm('작성 중인 내용을 저장하지 않고 이동할까요?')); }
  function refresh() { return confirmLeave() ? load(tabId) : false; }

  function el(tag, className, value) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (value !== undefined) item.textContent = String(value);
    return item;
  }
  function button(label, action, variant = '') {
    const item = el('button', `btn na-button${variant === 'primary' ? ' pri na-button--primary' : variant === 'danger' ? ' na-button--danger' : ''}`, label);
    item.type = 'button'; item.addEventListener('click', action); return item;
  }
  function formatDate(value) {
    if (!value) return '없음';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '날짜 확인 불가';
    return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
  }
  function shortUser(id) { return id ? `이용자 ${String(id).slice(0, 8)}` : '탈퇴한 이용자'; }
  function number(value) { return Number.isFinite(Number(value)) ? Number(value).toLocaleString('ko-KR') : '0'; }
  function validRun(run) { return !!root && !root.hidden && pageRun === run; }
  function validInstance(run) { return !!root && !root.hidden && instance === run; }
  function setStatus(message = '', error = false) {
    status.textContent = message;
    status.classList.toggle('na-status--error', error);
  }
  function empty(target, message) { target.append(el('p', 'na-empty', message)); }
  function badge(text, variant = '') { return el('span', `na-badge${variant ? ` na-badge--${variant}` : ''}`, text); }
  function sectionTitle(title, help) {
    editPreviewObserver?.disconnect(); editPreviewObserver = null;
    inquiryController?.destroy?.(); inquiryController = null;
    draftValues.clear(); extraDraftCheck = () => false;
    const heading = el('h3', 'h3 na-section-title', title); heading.tabIndex = -1;
    const tools = el('div', 'na-item-header'); tools.append(heading, button('새로고침', refresh)); main.replaceChildren(tools);
    if (help) main.append(el('p', 'na-help', help));
    return heading;
  }
  function focusSection(heading) {
    heading.focus({ preventScroll: true });
    if (embedded) {
      requestAnimationFrame(() => {
        if (heading.isConnected && !root.hidden) heading.scrollIntoView({ block: externalNav ? 'nearest' : 'start' });
      });
    } else {
      main.parentElement.scrollTop = 0;
    }
  }
  function field(label, type = 'text', value = '', help = '') {
    const wrap = el('label', 'na-field');
    const input = el(type === 'textarea' ? 'textarea' : 'input', 'inp na-input');
    if (type !== 'textarea') input.type = type;
    input.value = value ?? '';
    draftValues.set(input, input.value);
    wrap.append(el('span', '', label), input);
    if (help) wrap.append(el('small', '', help));
    return { wrap, input };
  }
  function choiceField(label, choices, value, help = '') {
    const wrap = el('label', 'na-field'); const input = el('select', 'inp na-input');
    wrap.append(el('span', '', label));
    for (const [code, text] of choices) {
      const option = el('option', '', text); option.value = code; input.append(option);
    }
    input.value = value ?? choices[0][0]; wrap.append(input);
    draftValues.set(input, input.value);
    if (help) wrap.append(el('small', '', help));
    return { wrap, input };
  }
  function reasonField() {
    const item = field('처리 사유', 'textarea', '', '변경 내용을 다른 관리자도 이해할 수 있도록 적어 주세요. 최대 500자');
    item.input.required = true; item.input.maxLength = 500; item.input.rows = 3;
    item.input.addEventListener('input', () => item.input.setCustomValidity(''));
    return item;
  }
  function validReason(input) {
    input.setCustomValidity(input.value.trim() ? '' : '처리 사유를 적어 주세요.');
    return input.reportValidity();
  }
  function details(values) {
    const block = el('details', 'na-details'); block.append(el('summary', '', '상세 정보'));
    const list = el('dl');
    for (const [label, value] of values) {
      if (value == null || value === '') continue;
      list.append(el('dt', '', label), el('dd', 'na-id', value));
    }
    block.append(list); return block;
  }
  function pagination(target, offset, total, onPage) {
    const count = Number(total) || 0;
    if (count <= PAGE_SIZE && offset === 0) return;
    const row = el('div', 'na-pagination');
    const before = button('이전', () => onPage(Math.max(0, offset - PAGE_SIZE)));
    const next = button('다음', () => onPage(offset + PAGE_SIZE));
    before.disabled = offset === 0; next.disabled = offset + PAGE_SIZE >= count;
    row.append(before, el('span', '', `${Math.floor(offset / PAGE_SIZE) + 1} / ${Math.max(1, Math.ceil(count / PAGE_SIZE))}`), next);
    target.append(row);
  }
  async function rpc(name, args = {}) {
    const { data, error } = await client.schema('ojjuda_note').rpc(name, args);
    if (error) throw error;
    return data;
  }
  function friendlyError(error) {
    const message = String(error?.message || '').toLowerCase();
    if ((message.includes('moderator') || message.includes('administrator')) && message.includes('restrict')) return '관리자는 이용 제한 대상이 될 수 없어요.';
    if (message.includes('world member') || message.includes('onboard') || message.includes('not found')) return '대상을 찾지 못했어요. 현재 목록과 이용자 번호를 확인해 주세요.';
    if (message.includes('card unavailable')) return '카드를 찾지 못했어요. 목록을 새로 불러온 뒤 확인해 주세요.';
    if (message.includes('recovery period')) return '한 달의 복구 기간이 끝났거나 보관 자료를 찾지 못했어요. 목록을 새로 불러와 주세요.';
    if (message.includes('expired event') || message.includes('started event start')) return '종료된 이벤트나 이미 시작된 이벤트의 시작 시각은 정정할 수 없어요. 목록을 새로 불러와 주세요.';
    if (message.includes('노트 운영 기준')) return '글이나 태그에 작성 금지어가 포함되어 있어요. 내용을 확인해 주세요.';
    if (error?.code === '42501' || message.includes('permission') || message.includes('moderator required') || message.includes('not authorized')) return '이 작업을 할 권한이 없어요. 관리자 권한을 확인해 주세요.';
    if (error?.code === '23514' || error?.code === '22023') return '입력 내용을 확인해 주세요. 글, 태그, 사유의 허용 범위를 벗어났을 수 있어요.';
    return '요청을 완료하지 못했어요. 연결 상태와 현재 권한을 확인한 뒤 다시 시도해 주세요.';
  }
  function lockControls(locked) {
    busy = locked; panel.setAttribute('aria-busy', String(locked));
    if (locked) {
      disabledState = [...panel.querySelectorAll('button,input,textarea,select')].map(control => [control, control.disabled]);
      for (const [control] of disabledState) control.disabled = true;
    } else {
      for (const [control, wasDisabled] of disabledState) if (control.isConnected) control.disabled = wasDisabled;
      disabledState = [];
    }
  }
  async function currentUserMatches() {
    const expected = userId;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!expected || data?.session?.user?.id !== expected) { close(); return false; }
    return true;
  }
  async function drainPendingPhotoCleanup(run) {
    const buckets = new Set(['note-card-photos', 'note-event-photos']);
    let previousBatch = '';
    for (let batch = 0; batch < 10; batch++) {
      if (!validInstance(run)) return { complete: false };
      const rows = await rpc('admin_pending_photo_cleanup', { p_limit: 100 });
      if (!Array.isArray(rows)) throw new Error('Invalid photo cleanup queue');
      if (!rows.length) return { complete: true };
      const signature = JSON.stringify(rows);
      if (signature === previousBatch) return { complete: false };
      previousBatch = signature;
      const groups = new Map();
      for (const row of rows) {
        if (!buckets.has(row.bucket_id) || typeof row.photo_path !== 'string' || !row.photo_path) throw new Error('Invalid photo cleanup path');
        if (!groups.has(row.bucket_id)) groups.set(row.bucket_id, []);
        groups.get(row.bucket_id).push(row.photo_path);
      }
      for (const [bucket, paths] of groups) {
        if (!validInstance(run)) return { complete: false };
        const { error } = await client.storage.from(bucket).remove(paths);
        if (error) throw error;
      }
    }
    const remaining = await rpc('admin_pending_photo_cleanup', { p_limit: 1 });
    return { complete: Array.isArray(remaining) && remaining.length === 0 };
  }
  async function perform(name, args, success, returnTab = tabId, options = {}) {
    if (busy || root.hidden) return;
    const run = instance;
    lockControls(true); setStatus('변경 내용을 저장하고 있어요.');
    try {
      if (!await currentUserMatches() || !validInstance(run)) return;
      await rpc(name, args);
      if (!validInstance(run) || !await currentUserMatches()) return;
      let photoCleanup = null;
      if (options.cleanupPhotos) {
        setStatus('카드를 삭제했어요. 연결된 사진 파일을 정리하고 있어요.');
        try { photoCleanup = await drainPendingPhotoCleanup(run); }
        catch (error) { console.warn('Note photo cleanup:', error); photoCleanup = { complete: false }; }
      }
      if (!validInstance(run)) return;
      if (typeof onChanged === 'function') {
        try { await onChanged({ action: name, ...(typeof args.p_notice === 'string' ? { notice: args.p_notice } : {}) }); }
        catch { /* The saved operation remains successful even if the host refresh fails. */ }
      }
      if (!validInstance(run)) return;
      lockControls(false);
      const refreshed = await load(returnTab);
      if (validInstance(run)) {
        const cleanupMessage = photoCleanup?.complete === false ? ' 사진 파일 일부가 남아 있어요. 보관 화면에서 사진 파일 정리를 다시 시도해 주세요.' : '';
        setStatus(`${success}${cleanupMessage}${refreshed ? '' : ' 목록을 새로 불러오지는 못했어요.'}`, !refreshed || photoCleanup?.complete === false);
      }
    } catch (error) {
      if (!validInstance(run)) return;
      setStatus(friendlyError(error), true);
    } finally {
      if (validInstance(run)) lockControls(false);
    }
  }
  function actionScreen(title, description, build) {
    if (busy) return;
    pageRun++; actionReturn = tabId; setStatus('');
    const heading = sectionTitle(title, description);
    const form = el('form', 'box na-form na-action-form');
    const actions = el('div', 'na-actions');
    actions.append(button('돌아가기', () => { if (confirmLeave()) load(actionReturn || tabId); }));
    build(form, actions);
    form.append(actions); main.append(form);
    focusSection(heading);
  }
  function confirmVisibility(card) {
    const hide = !card.hidden;
    actionScreen(hide ? '카드 숨김' : '카드 복구', hide
      ? '이 카드와 연결된 답글을 공개 화면에서 숨깁니다. 작업 기록과 원문은 보관됩니다.'
      : '이 카드의 숨김을 해제합니다. 상위 카드나 개별 답글이 숨겨져 있으면 해당 콘텐츠는 계속 숨겨집니다.', (form, actions) => {
      form.append(el('blockquote', 'na-card-body', card.body || '삭제된 카드'));
      const reason = reasonField(); form.append(reason.wrap);
      const save = button(hide ? '숨김 처리' : '복구', () => {}, 'primary');
      save.type = 'submit'; actions.append(save);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!validReason(reason.input)) return;
        perform('moderate_card', { p_card_id: card.id || card.card_id, p_hidden: hide, p_reason: reason.input.value.trim() }, hide ? '카드를 숨겼어요.' : '카드의 개별 숨김을 해제했어요.');
      });
    });
  }
  function confirmDeleteCard(card) {
    const label = card.kind === 'comment' ? '답글' : card.kind === 'event' ? '이벤트 카드' : '익명카드';
    actionScreen(`${label} 삭제`, card.kind === 'comment'
      ? '이 답글을 공개 화면에서 내리고 한 달 동안 관리자 보관함에 원문을 남깁니다.'
      : '이 카드와 연결된 답글을 공개 화면에서 내리고 한 달 동안 관리자 보관함에 원문을 남깁니다.', (form, actions) => {
      form.append(el('blockquote', 'na-card-body', card.body || '원문 없음'));
      const reason = reasonField(); form.append(reason.wrap);
      const save = button('삭제 처리', () => {}, 'danger'); save.type = 'submit'; actions.append(save);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!validReason(reason.input)) return;
        perform('admin_archive_card', { p_card_id: card.id, p_reason: reason.input.value.trim() }, '카드를 관리자 보관함으로 옮겼어요.', 'cards');
      });
    });
  }
  function editCard(card) {
    actionScreen('카드 · 답글 수정', '관리자의 수정 이력과 사유는 작업 기록에 남습니다.', (form, actions) => {
      const body = field('글 내용', 'textarea', card.body, '최대 200자 · 줄바꿈 가능'); body.input.required = true; body.input.maxLength = 200; body.input.rows = 6;
      const tags = field('태그', 'text', (card.tags || []).join(', '), '공백이나 쉼표로 구분해 최대 5개, 태그마다 20자 이내'); tags.input.maxLength = 120;
      const reason = reasonField();
      const preview = el('section', 'na-edit-preview');
      const cardKind = card.kind || (card.center_lat != null ? 'event' : 'memo');
      if (cardKind === 'comment') preview.classList.add('na-edit-preview--reply');
      if (cardKind === 'event') preview.classList.add('na-edit-preview--event');
      const photo = el('div', 'na-edit-photo');
      if (photoKeyValid(card.background_key)) photo.style.backgroundImage = `url("${photoUrl(card.background_key)}")`;
      const quote = el('span', 'na-edit-quote');
      const photoTags = el('div', 'na-edit-tags');
      photo.append(quote, photoTags);
      const previewHelp = el('p', 'na-edit-preview-help', '사진과 꾸미기 정보를 불러오는 중이에요.');
      const overflowWarning = el('p', 'na-edit-overflow', '글이 고정된 사진 영역을 넘어요. 저장할 수는 있지만 공개 화면에서 일부가 잘릴 수 있어요.');
      overflowWarning.setAttribute('role', 'status'); overflowWarning.hidden = true;
      preview.append(el('h4', '', '카드 미리보기'), photo, previewHelp, overflowWarning);
      form.append(body.wrap, tags.wrap, preview, reason.wrap);
      const selectedTags = () => [...new Set(tags.input.value.split(/[\s,]+/u).map(value => value.replace(/^#+/, '')).filter(Boolean))];
      let activeStyle = {}, visualReady = false, pendingMeasure = 0;
      function measurePreview() {
        if (!preview.isConnected || !visualReady) return;
        if (!body.input.value.trim()) { overflowWarning.hidden = true; preview.classList.remove('na-edit-preview--overflow'); return; }
        const textOverflow = quote.scrollHeight > quote.clientHeight + 1 || quote.scrollWidth > quote.clientWidth + 1;
        const tagOverlap = photoTags.childElementCount > 0
          && quote.getBoundingClientRect().bottom > photoTags.getBoundingClientRect().top - 6;
        overflowWarning.hidden = !(textOverflow || tagOverlap);
        preview.classList.toggle('na-edit-preview--overflow', textOverflow || tagOverlap);
      }
      function updatePreview() {
        const value = body.input.value.replace(/\r\n?/g, '\n').trim();
        quote.textContent = value || '글 내용 미리보기';
        quote.classList.toggle('na-edit-quote--empty', !value);
        quote.style.fontSize = '';
        if (!activeStyle.size || activeStyle.size === 'normal') {
          if (value.length > 120) quote.style.fontSize = cardKind === 'comment' ? '15px' : '18px';
          else if (value.length > 70) quote.style.fontSize = cardKind === 'comment' ? '17px' : '22px';
        }
        photoTags.replaceChildren(...selectedTags().slice(0, 5).map(tag => el('span', '', `#${tag}`)));
        cancelAnimationFrame(pendingMeasure);
        pendingMeasure = requestAnimationFrame(measurePreview);
      }
      const run = pageRun;
      rpc('admin_card_visual', { p_card_id: card.id }).then(visual => {
        if (!validRun(run) || !preview.isConnected) return;
        if (!visual) { previewHelp.textContent = '꾸미기 정보를 찾지 못해 미리보기 확인이 어려워요.'; return; }
        const styleActive = visual.style_until && new Date(visual.style_until).getTime() > Date.now();
        const photoActive = visual.photo_until && new Date(visual.photo_until).getTime() > Date.now();
        activeStyle = styleActive && visual.style && typeof visual.style === 'object' ? visual.style : {};
        const imageKey = photoActive && visual.photo_key ? visual.photo_key : visual.background_key || card.background_key;
        photo.style.backgroundImage = photoKeyValid(imageKey) ? `url("${photoUrl(imageKey)}")` : '';
        for (const code of ['round', 'serif', 'handwriting', 'mono']) preview.classList.toggle(`na-edit-font-${code}`, activeStyle.font === code);
        for (const code of ['large', 'small']) preview.classList.toggle(`na-edit-size-${code}`, activeStyle.size === code);
        visualReady = true;
        previewHelp.textContent = '고정된 사진 크기에서 글과 태그가 보이는 모습입니다.';
        updatePreview();
        document.fonts?.ready.then(() => { if (validRun(run) && preview.isConnected) measurePreview(); });
      }).catch(error => { if (validRun(run) && preview.isConnected) previewHelp.textContent = `${friendlyError(error)} 미리보기 넘침은 확인하지 못했어요.`; });
      if (typeof ResizeObserver === 'function') {
        editPreviewObserver = new ResizeObserver(measurePreview);
        editPreviewObserver.observe(photo);
      }
      body.input.addEventListener('input', () => { body.input.setCustomValidity(''); updatePreview(); });
      tags.input.addEventListener('input', () => { tags.input.setCustomValidity(''); updatePreview(); });
      updatePreview();
      const save = button('수정 내용 저장', () => {}, 'primary'); save.type = 'submit'; actions.append(save);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const value = body.input.value.replace(/\r\n?/g, '\n').trim();
        const tagValues = selectedTags();
        body.input.setCustomValidity(!value ? '글 내용을 적어 주세요.' : [...value].length > 200 ? '글은 200자 이내로 적어 주세요.' : '');
        tags.input.setCustomValidity(tagValues.length > 5 || tagValues.some(value => [...value].length > 20) ? '태그는 최대 5개이며, 각 20자 이내로 적어 주세요.' : '');
        if (!body.input.reportValidity() || !tags.input.reportValidity() || !validReason(reason.input)) return;
        perform('admin_edit_card', { p_card_id: card.id, p_body: value, p_tags: tagValues, p_reason: reason.input.value.trim() }, '카드를 수정했어요.', 'cards');
      });
    });
  }
  function editCardVisual(card) {
    actionScreen('카드 꾸미기·사진 지정 정정', '관리자는 꾸미기와 사진 지정 기간을 정정할 수 있습니다. 지정 기간이 끝나면 처음 무작위 배정된 무료 사진으로 돌아갑니다. 이용자에게 쭈가 차감되거나 환불되지 않으며 변경 전후 값과 사유가 기록됩니다.', (form, actions) => {
      const content = el('div', 'na-visual-form'); content.append(el('p', 'na-empty', '현재 설정을 불러오는 중이에요.')); form.append(content);
      const run = pageRun;
      rpc('admin_card_visual', { p_card_id: card.id }).then(visual => {
        if (!validRun(run)) return;
        content.replaceChildren();
        if (!visual) { empty(content, '카드의 꾸미기 정보를 찾지 못했어요.'); return; }
        const style = visual.style || {};
        const font = choiceField('글꼴', FONT_CHOICES, style.font);
        const size = choiceField('글자 크기', [['normal', '보통'], ['large', '크게'], ['small', '작게']], style.size);
        const theme = choiceField('색상', [['plain', '기본'], ['rose', '장미'], ['night', '밤']], style.theme);
        const effect = choiceField('꾸미기 효과', EFFECT_CHOICES, style.effect);
        const textColor = choiceField('글씨 색', COLOR_CHOICES, style.textColor);
        const boxColor = choiceField('네모난 글상자 색', COLOR_CHOICES, style.boxColor);
        const styleUntil = field('꾸미기 종료', 'datetime-local', localDateTime(visual.style_until), '비워 두면 꾸미기는 공개 화면에 적용되지 않습니다.');
        const originalPhoto = PHOTO_CHOICES.find(([key]) => key === visual.background_key)?.[1] || '기본';
        let photoKey = PHOTO_CHOICES.some(([key]) => key === visual.photo_key) ? visual.photo_key : '';
        const initialPhotoKey = photoKey; extraDraftCheck = () => content.isConnected && photoKey !== initialPhotoKey;
        let photoPage = photoKey ? Math.floor((Number(photoKey) - 10) / PHOTO_PAGE_SIZE) : 0;
        const photoPanel = el('section', 'na-photo-selector');
        photoPanel.append(el('h4', '', '지정 사진'), el('p', 'na-photo-help', `처음 무작위 배정된 무료 사진: ${originalPhoto} · 아래 사진을 고르면 지정 기간 동안 적용됩니다.`));
        const originalChoice = button('처음 사진 사용', () => selectPhoto(''));
        originalChoice.classList.add('na-photo-original');
        photoPanel.append(originalChoice);
        const photoPreview = el('div', 'na-photo-preview');
        const photoImage = el('img'); photoImage.alt = '';
        const photoCaption = el('span'); photoPreview.append(photoImage, photoCaption);
        const updatePhotoPreview = () => {
          const key = photoKey || visual.background_key;
          if (!PHOTO_CHOICES.some(([value]) => value === key)) {
            photoPreview.hidden = true; return;
          }
          photoPreview.hidden = false;
          photoImage.src = photoUrl(key);
          photoCaption.textContent = photoKey
            ? `지정 사진 · ${PHOTO_CHOICES.find(([value]) => value === key)[1]}`
            : `처음 무작위 배정된 사진 · ${originalPhoto}`;
        };
        photoPanel.append(photoPreview);
        const photoGrid = el('div', 'na-photo-grid'); photoGrid.setAttribute('role', 'group'); photoGrid.setAttribute('aria-label', '지정할 사진 목록');
        const photoPages = el('div', 'na-photo-pages');
        const prev = button('‹ 이전', () => { photoPage--; renderPhotoPage(); });
        const next = button('다음 ›', () => { photoPage++; renderPhotoPage(); });
        const pageLabel = el('label', 'na-photo-page-label'); pageLabel.append(el('span', '', '페이지'));
        const pageSelect = el('select', 'inp na-input');
        const pageCount = Math.ceil((PHOTO_CHOICES.length - 1) / PHOTO_PAGE_SIZE);
        for (let index = 0; index < pageCount; index++) {
          const option = el('option', '', `${index + 1} / ${pageCount}`); option.value = String(index); pageSelect.append(option);
        }
        pageSelect.addEventListener('change', () => { photoPage = Number(pageSelect.value); renderPhotoPage(); });
        pageLabel.append(pageSelect);
        photoPages.append(prev, pageLabel, next);
        photoPages.hidden = pageCount <= 1;
        photoPanel.append(photoGrid, photoPages);
        const photoUntil = field('사진 지정 종료', 'datetime-local', localDateTime(visual.photo_until), '사진을 지정했다면 종료 시각을 지정해 주세요.');
        function selectPhoto(key) {
          photoKey = key;
          originalChoice.setAttribute('aria-pressed', String(!photoKey));
          for (const tile of photoGrid.children) tile.setAttribute('aria-pressed', String(tile.dataset.photoKey === photoKey));
          updatePhotoPreview();
          photoUntil.input.setCustomValidity('');
        }
        function renderPhotoPage() {
          photoGrid.replaceChildren();
          const first = photoPage * PHOTO_PAGE_SIZE;
          for (let index = first; index < Math.min(first + PHOTO_PAGE_SIZE, PHOTO_CHOICES.length - 1); index++) {
            const [key, name] = PHOTO_CHOICES[index + 1];
            const tile = el('button', 'na-photo-tile'); tile.type = 'button'; tile.dataset.photoKey = key;
            tile.setAttribute('aria-pressed', String(key === photoKey));
            const image = el('img'); image.src = photoUrl(key); image.alt = ''; image.loading = 'lazy';
            tile.append(image, el('small', '', name));
            tile.addEventListener('click', () => selectPhoto(key)); photoGrid.append(tile);
          }
          pageSelect.value = String(photoPage);
          prev.disabled = photoPage === 0; next.disabled = photoPage === pageCount - 1;
        }
        selectPhoto(photoKey); renderPhotoPage();
        const reason = reasonField();
        content.append(font.wrap, size.wrap, theme.wrap, effect.wrap,
          textColor.wrap, boxColor.wrap, styleUntil.wrap,
          photoPanel, photoUntil.wrap, reason.wrap);
        const save = button('꾸미기·사진 지정 저장', () => {}, 'primary'); save.type = 'submit'; actions.append(save);
        form.addEventListener('submit', event => {
          event.preventDefault(); if (!validReason(reason.input)) return;
          photoUntil.input.setCustomValidity(photoKey && !photoUntil.input.value ? '사진 종료 시각을 지정해 주세요.' : !photoKey && photoUntil.input.value ? '사진을 선택하거나 종료 시각을 비워 주세요.' : '');
          if (!photoUntil.input.reportValidity()) return;
          const dateValue = (input, original) => input.value ? (input.value === localDateTime(original) ? original : new Date(input.value).toISOString()) : null;
          const nextStyle = { ...style, font: font.input.value, size: size.input.value,
            theme: theme.input.value, effect: effect.input.value,
            textColor: textColor.input.value, boxColor: boxColor.input.value };
          delete nextStyle.backgroundColor;
          perform('admin_edit_card_visual', {
            p_card_id: card.id,
            p_style: nextStyle,
            p_style_until: dateValue(styleUntil.input, visual.style_until),
            p_photo_key: photoKey || null,
            p_photo_until: dateValue(photoUntil.input, visual.photo_until),
            p_reason: reason.input.value.trim()
          }, '카드 꾸미기와 사진 지정 기간을 정정했어요.', 'cards');
        });
        photoUntil.input.addEventListener('input', () => photoUntil.input.setCustomValidity(''));
      }).catch(error => { if (validRun(run)) { content.replaceChildren(); empty(content, friendlyError(error)); } });
    });
  }
  function localDateTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function editEvent(event) {
    actionScreen('이벤트 위치·시간 정정', '운영 정정이며 추가 쭈 차감이나 환불은 없습니다. 변경 전후 값과 사유가 작업 기록에 남습니다.', (form, actions) => {
      const scheduled = new Date(event.starts_at).getTime() > Date.now();
      form.append(el('p', 'na-reason', `현재 시작: ${formatDate(event.starts_at)} · 기존 책정: ${number(event.price_coins)}쭈${scheduled ? '' : ' · 시작 기록은 변경할 수 없습니다.'}`));
      const lat = field('위도', 'number', event.center_lat); lat.input.required = true; lat.input.min = '-90'; lat.input.max = '90'; lat.input.step = 'any';
      const lng = field('경도', 'number', event.center_lon); lng.input.required = true; lng.input.min = '-180'; lng.input.max = '180'; lng.input.step = 'any';
      const radius = field('반경 (km)', 'number', event.radius_km, '1~30km 사이 정수'); radius.input.required = true; radius.input.min = '1'; radius.input.max = '30'; radius.input.step = '1';
      const starts = scheduled ? field('시작 시각', 'datetime-local', localDateTime(event.starts_at), '시작 전 예약 이벤트만 변경할 수 있습니다.') : null;
      if (starts) starts.input.required = true;
      const ends = field('종료 시각', 'datetime-local', localDateTime(event.ends_at), '시작보다 늦고 시작 후 24시간 이내여야 합니다.'); ends.input.required = true;
      const reason = reasonField(); form.append(lat.wrap, lng.wrap, radius.wrap);
      if (starts) form.append(starts.wrap);
      form.append(ends.wrap, reason.wrap);
      const save = button('정정 내용 저장', () => {}, 'primary'); save.type = 'submit'; actions.append(save);
      form.addEventListener('submit', submit => {
        submit.preventDefault(); if (!validReason(reason.input)) return;
        const start = starts && starts.input.value !== localDateTime(event.starts_at) ? new Date(starts.input.value) : new Date(event.starts_at);
        const end = ends.input.value === localDateTime(event.ends_at) ? new Date(event.ends_at) : new Date(ends.input.value);
        if (starts) starts.input.setCustomValidity(!Number.isFinite(start.getTime()) || start <= Date.now() ? '시작 시각은 앞으로 지정해 주세요.' : '');
        ends.input.setCustomValidity(!Number.isFinite(end.getTime()) || end <= Date.now() || end <= start || end - start > 86400000 ? '현재 이후이며 시작 뒤 24시간 이내의 종료 시각을 선택해 주세요.' : '');
        if (![lat.input, lng.input, radius.input, starts?.input, ends.input].filter(Boolean).every(input => input.reportValidity())) return;
        perform('admin_edit_event', { p_card_id: event.id, p_lat: Number(lat.input.value), p_lng: Number(lng.input.value), p_radius_km: Number(radius.input.value), p_starts_at: start.toISOString(), p_ends_at: end.toISOString(), p_reason: reason.input.value.trim() }, '이벤트 조건을 정정했어요.', 'cards');
      });
      starts?.input.addEventListener('input', () => starts.input.setCustomValidity(''));
      ends.input.addEventListener('input', () => ends.input.setCustomValidity(''));
    });
  }
  function restrictUser(user) {
    const restrict = !user.is_restricted;
    actionScreen(restrict ? '노트 이용 제한' : '노트 이용 제한 해제', `${shortUser(user.user_id)} · 월드 계정과 쭈는 그대로 유지됩니다.`, (form, actions) => {
      form.append(el('p', 'na-id', user.user_id));
      if (restrict) form.append(el('p', 'na-warning', '공원의 글 작성·수정과 공감·메모함 추가를 제한합니다. 신고와 문의, 본인 글 삭제는 계속 가능합니다. 기존 글의 공개 여부는 카드 · 답글 메뉴에서 따로 관리하세요.'));
      else if (user.restriction_reason) form.append(el('p', 'na-warning', `현재 제한 사유: ${user.restriction_reason}`));
      const until = field('제한 종료 시각', 'datetime-local', '', '비워 두면 직접 해제할 때까지 유지됩니다. 현재 기기의 시간 기준입니다.');
      if (restrict) form.append(until.wrap);
      const reason = reasonField(); form.append(reason.wrap);
      const save = button(restrict ? '이용 제한 적용' : '이용 제한 해제', () => {}, 'primary'); save.type = 'submit'; actions.append(save);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!validReason(reason.input)) return;
        let deadline = null;
        if (restrict && until.input.value) {
          const date = new Date(until.input.value);
          until.input.setCustomValidity(!Number.isFinite(date.getTime()) || date.getTime() <= Date.now() ? '현재보다 이후의 시각을 선택해 주세요.' : '');
          if (!until.input.reportValidity()) return;
          deadline = date.toISOString();
        }
        perform('admin_restrict_user', { p_user_id: user.user_id, p_restricted: restrict, p_reason: reason.input.value.trim(), p_until: deadline }, restrict ? '노트 이용 제한을 적용했어요.' : '노트 이용 제한을 해제했어요.', 'users');
      });
      until.input.addEventListener('input', () => until.input.setCustomValidity(''));
    });
  }
  async function renderOverview(run) {
    const [overview, settings] = await Promise.all([rpc('admin_overview'), rpc('get_note_state')]);
    if (!validRun(run)) return;
    const stats = el('dl', 'adm-stats na-stats');
    for (const [label, key] of [['익명카드', 'total_memos'], ['답글', 'total_replies'], ['개별 숨김 콘텐츠', 'hidden_cards'], ['접수된 신고', 'open_reports'], ['이용 제한', 'restricted_users']]) {
      const stat = el('div', 'adm-stat na-stat'); stat.append(el('dt', 'adm-l', label), el('dd', 'adm-n', number(overview?.[key]))); stats.append(stat);
    }
    main.append(stats);
    const notice = el('section', 'box na-box na-box--notice'); notice.append(el('h4', '', '현재 공지'), el('p', '', settings?.notice || '등록된 공지가 없어요.'), button('공지 관리', () => load('settings'))); main.append(notice);
  }
  async function renderSettings(run) {
    const settings = await rpc('admin_settings'); if (!validRun(run)) return;
    const form = el('form', 'na-form na-settings-form');
    const controls = el('section', 'box na-box na-settings-group'); controls.append(el('h4', '', '공지 내용'));
    const notice = field('서비스 공지', 'textarea', settings?.notice || '', '최대 1,000자. 비우면 공지가 내려갑니다.'); notice.input.maxLength = 1000; notice.input.rows = 5;
    controls.append(notice.wrap);
    form.append(controls);
    const reason = reasonField(); form.append(reason.wrap);
    const actions = el('div', 'na-actions'); const save = button('공지 저장', () => {}, 'primary'); save.type = 'submit'; actions.append(save); form.append(actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!validReason(reason.input)) return;
      const args = { p_reason: reason.input.value.trim() };
      const newNotice = notice.input.value.trim();
      if (newNotice !== (settings?.notice || '')) args.p_notice = newNotice;
      if (Object.keys(args).length === 1) { setStatus('바뀐 내용이 없어요.'); return; }
      perform('admin_patch_service_settings', args, '공지를 저장했어요.', 'settings');
    }); main.append(form);
  }
  async function renderSpamSettings(run) {
    const settings = await rpc('admin_spam_settings'); if (!validRun(run)) return;
    const form = el('form', 'na-form na-settings-form');
    const group = el('section', 'box na-box na-settings-group');
    group.append(el('h4', '', '도배 방지 기준'));
    const duplicate = field('같은 글 연속 허용 횟수', 'number', settings.max_consecutive, '기본 2회: 같은 글은 연속 3번째부터 막습니다. 띄어쓰기·줄바꿈만 바꾼 글도 같습니다.');
    const seconds = field('작성 횟수를 세는 시간 (초)', 'number', settings.window_seconds, '기본 60초: 최근 1분을 기준으로 계산합니다.');
    const limit = field('이 시간 안에 작성할 수 있는 글 수', 'number', settings.max_posts, '기본 2개: 1분 안에는 3번째 글부터 막습니다.');
    for (const [item, max] of [[duplicate, 10], [seconds, 3600], [limit, 100]]) {
      item.input.min = '1'; item.input.max = String(max); item.input.step = '1'; item.input.required = true;
      group.append(item.wrap);
    }
    const summary = el('p', 'na-help');
    const refreshSummary = () => {
      summary.textContent = `같은 글 연속 ${Number(duplicate.input.value) + 1}번째부터 · 최근 ${Number(seconds.input.value)}초 동안 ${Number(limit.input.value) + 1}번째 글부터 차단`;
    };
    for (const item of [duplicate, seconds, limit]) item.input.addEventListener('input', refreshSummary);
    refreshSummary(); group.append(summary); form.append(group);
    const reason = reasonField(); form.append(reason.wrap);
    const actions = el('div', 'na-actions'); const save = button('도배 방지 저장', () => {}, 'primary'); save.type = 'submit'; actions.append(save); form.append(actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (![duplicate.input, seconds.input, limit.input].every(input => input.reportValidity()) || !validReason(reason.input)) return;
      const values = { max_consecutive: Number(duplicate.input.value), window_seconds: Number(seconds.input.value), max_posts: Number(limit.input.value) };
      if (Object.keys(values).every(key => values[key] === settings[key])) { setStatus('바뀐 내용이 없어요.'); return; }
      perform('admin_update_spam_settings', { p_max_consecutive: values.max_consecutive, p_window_seconds: values.window_seconds, p_max_posts: values.max_posts, p_reason: reason.input.value.trim() }, '도배 방지 설정을 저장했어요.', 'spam');
    });
    main.append(form);
  }
  function searchForm(value, placeholder, submit, states = null, help = '') {
    const form = el('form', 'box na-search'); const query = field('검색', 'search', value, help); query.input.placeholder = placeholder; query.input.maxLength = 200; form.append(query.wrap);
    let select = null;
    if (states) {
      const wrap = el('label', 'na-field'); wrap.append(el('span', '', '개별 숨김')); select = el('select', 'inp na-input');
      for (const [key, label] of [['all', '전체'], ['visible', '숨김 없음'], ['hidden', '숨김']]) {
        const option = el('option', '', label); option.value = key; select.append(option);
      }
      select.value = states; wrap.append(select); form.append(wrap);
    }
    const go = button('검색', () => {}, 'primary'); go.type = 'submit';
    form.append(go, button('초기화', () => submit('', 'all')));
    form.addEventListener('submit', event => { event.preventDefault(); submit(query.input.value.trim(), select?.value); });
    return form;
  }
  function moreCardActions(...controls) {
    const more = el('details', 'na-more-actions');
    more.append(el('summary', '', '추가 작업'));
    const row = el('div', 'na-actions na-more-actions-list');
    row.append(...controls); more.append(row);
    return { more, row };
  }
  async function renderCards(run) {
    const filter = filters.cards;
    if (filter.view === 'event') return renderEvents(run);
    if (filter.view === 'archive') return renderArchive(run);
    if (filter.view === 'risk') {
      main.append(el('p', 'na-warning na-risk-help', '자살·자해·폭력·협박과 관련된 표현을 자동으로 찾은 카드와 답글입니다. 오탐이 있을 수 있으니 내용을 확인해 주세요. 긴급한 상황은 112·119, 자살예방상담은 109로 연결해 주세요.'));
    }
    const riskCount = filter.view === 'card'
      ? rpc('admin_risk_cards', { p_query: '', p_state: 'all', p_limit: 1, p_offset: 0 }).then(rows => ({ count: Number(rows?.[0]?.total_count || 0) }), () => ({ error: true }))
      : Promise.resolve(null);
    const [rows, risk] = await Promise.all([
      rpc(filter.view === 'risk' ? 'admin_risk_cards' : 'admin_cards', { p_query: filter.query, p_state: filter.state, p_limit: PAGE_SIZE, p_offset: filter.offset }),
      riskCount
    ]);
    if (!validRun(run)) return;
    if (risk?.error) main.append(el('p', 'na-warning', '위험 신호를 불러오지 못했어요. 서버 설정을 확인해 주세요.'));
    else if (risk?.count) {
      const alert = el('section', 'box na-box na-risk-summary');
      alert.append(el('strong', '', `⚠️ 위험 신호가 보이는 카드·답글 ${number(risk.count)}개`),
        el('p', '', '내용을 확인하고 필요한 조치를 해 주세요.'),
        button('위험 신호 보기', () => { filters.cards.view = 'risk'; filters.cards.offset = 0; filters.cards.query = ''; filters.cards.state = 'all'; load('cards'); }, 'primary'));
      main.append(alert);
    }
    main.append(searchForm(filter.query, '글 내용이나 태그 검색', (query, state) => { filters.cards = { ...filters.cards, query, state, offset: 0 }; load('cards'); }, filter.state));
    if (!rows?.length) { empty(main, filter.offset ? '이 페이지에 콘텐츠가 없어요.' : '조건에 맞는 카드와 답글이 없어요.'); if (filter.offset) main.append(button('첫 페이지로', () => { filters.cards.offset = 0; load('cards'); })); return; }
    const total = rows[0].total_count; main.append(el('p', 'na-count', `총 ${number(total)}개 · ${filter.offset + 1}–${filter.offset + rows.length}`));
    const list = el('div', 'na-list');
    for (const card of rows) {
      const riskSignal = RISK_SIGNAL.test(String(card.body || ''));
      const item = el('article', `adm-card na-item${riskSignal ? ' na-item--risk' : ''}`); const header = el('div', 'na-item-header');
      const meta = el('p', 'na-meta'); meta.append(badge(card.kind === 'comment' ? '답글' : card.kind === 'event' ? '이벤트 카드' : '익명카드'), badge(card.hidden ? '개별 숨김' : '개별 숨김 없음', card.hidden ? 'warn' : 'good'), el('span', '', formatDate(card.created_at)));
      if (riskSignal) meta.prepend(badge('⚠️ 위험 신호', 'risk'));
      header.append(meta); item.append(header, el('blockquote', 'na-card-body', card.body));
      if (card.tags?.length) { const tags = el('div', 'na-tags'); for (const tag of card.tags) tags.append(el('span', '', `#${tag}`)); item.append(tags); }
      item.append(el('p', 'na-reason', `작성자: ${shortUser(card.author_id)}`));
      if (card.moderation_reason) item.append(el('p', 'na-reason', `공개 상태 처리 사유: ${card.moderation_reason}`));
      item.append(details([['카드 번호', card.id], ['작성자 번호', card.author_id], ['원글 번호', card.parent_id], ['마지막 수정', formatDate(card.edited_at)]]));
      const actions = el('div', 'na-actions');
      actions.append(button('본문·태그 수정', () => editCard(card)), button(card.hidden ? '복구' : '숨김', () => confirmVisibility(card), card.hidden ? '' : 'danger'));
      const more = moreCardActions(button('꾸미기·사진 지정', () => editCardVisual(card)), button('삭제', () => confirmDeleteCard(card), 'danger'));
      if (card.author_id) more.row.append(button('작성자 관리', () => { filters.users = { query: card.author_id, offset: 0 }; load('users'); }));
      if (card.author_id) more.row.append(button('이 작성자의 카드 모두 보기', () => { Object.assign(filters.cards, { view: 'card', query: card.author_id, state: 'all', offset: 0, expiredOffset: 0 }); load('cards'); }));
      item.append(actions, more.more); list.append(item);
    }
    main.append(list); pagination(main, filter.offset, total, offset => { filters.cards.offset = offset; load('cards'); });
  }
  async function renderEvents(run) {
    const filter = filters.cards;
    main.append(searchForm(filter.query, '이벤트 글·카드 번호 검색', (query, state) => { filters.cards = { ...filters.cards, query, state, offset: 0 }; load('cards'); }, filter.state));
    const rows = await rpc('admin_events', { p_query: filter.query, p_state: filter.state, p_limit: PAGE_SIZE, p_offset: filter.offset });
    if (!validRun(run)) return;
    if (!rows?.length) { empty(main, '조건에 맞는 이벤트 카드가 없어요.'); if (filter.offset) main.append(button('첫 페이지로', () => { filter.offset = 0; load('cards'); })); return; }
    const total = rows[0].total_count; main.append(el('p', 'na-count', `총 ${number(total)}개 · 위치·반경·시간 정정은 작업 기록에 남습니다.`));
    const list = el('div', 'na-list');
    for (const event of rows) {
      const item = el('article', 'adm-card na-item');
      const meta = el('p', 'na-meta'); meta.append(badge('이벤트 카드'), badge(event.hidden ? '숨김' : '공개', event.hidden ? 'warn' : 'good'), el('span', '', formatDate(event.created_at)));
      item.append(meta, el('blockquote', 'na-card-body', event.body));
      if (event.tags?.length) { const tags = el('div', 'na-tags'); for (const tag of event.tags) tags.append(el('span', '', `#${tag}`)); item.append(tags); }
      item.append(el('p', 'na-reason', `작성자: ${shortUser(event.author_id)}`));
      item.append(details([['카드 번호', event.id], ['작성자 번호', event.author_id], ['시작', formatDate(event.starts_at)], ['종료', formatDate(event.ends_at)], ['반경', event.radius_km != null ? `${number(event.radius_km * 1000)}m` : '없음'], ['위도', event.center_lat], ['경도', event.center_lon], ['책정 쭈', event.price_coins != null ? `${number(event.price_coins)}쭈` : '없음']]));
      const actions = el('div', 'na-actions');
      const changeTerms = button('위치·시간 정정', () => editEvent(event));
      changeTerms.disabled = new Date(event.ends_at).getTime() <= Date.now();
      if (changeTerms.disabled) changeTerms.title = '종료된 이벤트의 유료 조건은 변경할 수 없습니다.';
      actions.append(button('본문·태그 수정', () => editCard(event)), button(event.hidden ? '복구' : '숨김', () => confirmVisibility(event), event.hidden ? '' : 'danger'));
      const more = moreCardActions(button('꾸미기·사진 지정', () => editCardVisual(event)), changeTerms, button('삭제', () => confirmDeleteCard({ ...event, kind: 'event' }), 'danger'));
      if (event.author_id) more.row.append(button('작성자 관리', () => { filters.users = { query: event.author_id, offset: 0 }; load('users'); }));
      item.append(actions, more.more); list.append(item);
    }
    main.append(list); pagination(main, filter.offset, total, offset => { filters.cards.offset = offset; load('cards'); });
  }
  function viewArchivedThread(archived) {
    actionScreen('보관된 원문과 답글', '보관 시작부터 한 달 동안 관리자만 원문을 볼 수 있습니다. 이후에는 자동으로 영구 정리됩니다.', (form) => {
      const content = el('div', 'na-list'); const more = el('div', 'na-pagination');
      form.append(content, more);
      const run = pageRun;
      let offset = 0, fetching = false;
      async function nextPage() {
        if (fetching || !validRun(run)) return;
        fetching = true; more.replaceChildren();
        if (offset === 0) { content.replaceChildren(); empty(content, '원문과 답글을 불러오는 중이에요.'); }
        try {
          const rows = await rpc('admin_archived_thread', { p_root_id: archived.id, p_limit: 100, p_offset: offset });
          if (!validRun(run)) return;
          if (offset === 0) content.replaceChildren();
          if (!rows?.length && offset === 0) { empty(content, '보관 원문을 찾지 못했어요.'); return; }
          for (const row of rows || []) {
            const item = el('article', 'adm-card na-item');
            item.append(badge(row.kind === 'comment' ? '답글' : row.kind === 'event' ? '이벤트 카드' : '익명카드'), el('blockquote', 'na-card-body', row.body || '원문 없음'));
            if (row.tags?.length) { const tags = el('div', 'na-tags'); for (const tag of row.tags) tags.append(el('span', '', `#${tag}`)); item.append(tags); }
            item.append(details([['카드 번호', row.id], ['작성자 번호', row.author_id], ['작성', formatDate(row.created_at)], ['보관 시작', formatDate(row.archived_at)]])); content.append(item);
          }
          offset += rows?.length || 0;
          const total = Number(rows?.[0]?.total_count) || offset;
          if (offset < total && rows?.length) more.append(el('span', '', `${number(offset)} / ${number(total)}`), button('답글 더 보기', nextPage));
        } catch (error) {
          if (validRun(run)) {
            if (offset === 0) content.replaceChildren();
            more.replaceChildren(el('p', 'na-warning', friendlyError(error)), button('다시 불러오기', nextPage));
          }
        } finally { fetching = false; }
      }
      nextPage();
    });
  }
  function confirmArchiveRestore(archived) {
    actionScreen('보관된 카드 복구', '이 카드와 함께 보관된 답글을 다시 공개 상태로 돌립니다. 개별 숨김 설정은 그대로 유지됩니다.', (form, actions) => {
      form.append(el('blockquote', 'na-card-body', archived.body || '원문 없음'));
      const reason = reasonField(); form.append(reason.wrap);
      const save = button('복구하기', () => {}, 'primary'); save.type = 'submit'; actions.append(save);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!validReason(reason.input)) return;
        perform('restore_archived_card', { p_card_id: archived.id, p_reason: reason.input.value.trim() }, '카드와 답글을 복구했어요.', 'cards');
      });
    });
  }
  function confirmExpiredPurge(archived) {
    actionScreen('보관 자료 영구 정리', '한 달의 원문 보관 기간이 끝났습니다. 원문을 다시 열지 않고 이 묶음과 연결된 답글을 영구 삭제합니다.', (form, actions) => {
      form.append(details([['카드 번호', archived.id], ['보관 시작', formatDate(archived.archived_at)], ['정리 가능', formatDate(archived.purge_after)], ['연결된 답글', number(archived.reply_count)]]));
      const reason = reasonField(); form.append(reason.wrap);
      const save = button('영구 정리', () => {}, 'danger'); save.type = 'submit'; actions.append(save);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!validReason(reason.input)) return;
        if (!window.confirm('영구 정리하면 원문과 답글이 완전히 지워지고 되돌릴 수 없어요. 계속할까요?')) return;
        perform('admin_purge_archived_card', { p_card_id: archived.id, p_reason: reason.input.value.trim() }, '보관 자료를 영구 정리했어요.', 'archive', { cleanupPhotos: true });
      });
    });
  }
  function confirmPurgeNow(list) {   // 원문 보관 중인 카드를 한 달이 지나기 전에 바로 영구 삭제해요
    const replies = list.reduce((sum, a) => sum + (Number(a.reply_count) || 0), 0);
    actionScreen(list.length > 1 ? `보관 카드 ${list.length}개 영구 삭제` : '보관 카드 지금 영구 삭제',
      `원문 보관 기간(한 달)이 끝나기 전에 지금 바로 영구 삭제해요. 카드와 함께 보관된 답글 ${replies}개도 지워지고, 복구할 수 없어요. 아직 보관되지 않은 답글이 딸린 카드는 지우지 않아요.`, (form, actions) => {
      form.append(details(list.length === 1 ? [['카드 번호', list[0].id], ['보관 시작', formatDate(list[0].archived_at)], ['원래 영구 삭제 예정', formatDate(list[0].purge_after)]] : [['카드 수', number(list.length)], ['함께 지워질 답글', number(replies)]]));
      const reason = reasonField(); form.append(reason.wrap);
      const save = button('영구 삭제', () => {}, 'danger'); save.type = 'submit'; actions.append(save);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (!validReason(reason.input)) return;
        if (!window.confirm(`${list.length}개 카드와 답글을 완전히 지워요. 되돌릴 수 없어요. 계속할까요?`)) return;
        perform('admin_purge_archived_now', { p_card_ids: list.map(a => a.id), p_reason: reason.input.value.trim() }, '보관 카드를 영구 삭제했어요.', 'archive', { cleanupPhotos: true });
      });
    });
  }
  async function retryPhotoCleanup() {
    if (busy || root.hidden) return;
    const run = instance;
    lockControls(true); setStatus('남은 사진 파일을 정리하고 있어요.');
    try {
      if (!await currentUserMatches() || !validInstance(run)) return;
      const result = await drainPendingPhotoCleanup(run);
      if (!validInstance(run)) return;
      lockControls(false);
      const refreshed = await load('archive');
      if (validInstance(run)) setStatus(
        `${result.complete ? '사진 파일 정리를 마쳤어요.' : '사진 파일 일부가 남아 있어요. 다시 시도해 주세요.'}${refreshed ? '' : ' 목록을 새로 불러오지는 못했어요.'}`,
        !result.complete || !refreshed
      );
    } catch (error) {
      if (validInstance(run)) {
        console.warn('Note photo cleanup:', error);
        setStatus('사진 파일을 정리하지 못했어요. 삭제한 카드는 복구되지 않아요. 다시 시도해 주세요.', true);
      }
    } finally {
      if (validInstance(run)) lockControls(false);
    }
  }
  async function renderArchive(run) {
    const filter = filters.cards;
    main.append(el('p', 'na-warning', '삭제·만료 후 한 달 동안 원문은 관리자만 볼 수 있습니다. 기간이 끝나면 원문 조회와 복구가 닫히고 자동 영구 정리됩니다. 기간 전에도 "지금 영구 삭제"로 바로 지울 수 있고, 지연된 자료는 아래에서 원문 없이 직접 정리할 수 있습니다.'));
    const [rows, expired, pendingPhotos] = await Promise.all([
      rpc('admin_archived_cards', { p_limit: PAGE_SIZE, p_offset: filter.offset }),
      rpc('admin_expired_archive_queue', { p_limit: PAGE_SIZE, p_offset: filter.expiredOffset }),
      rpc('admin_pending_photo_cleanup', { p_limit: 1 }).catch(error => { console.warn('Note photo cleanup queue:', error); return null; })
    ]);
    if (!validRun(run)) return;
    if (!Array.isArray(pendingPhotos)) {
      const cleanup = el('div', 'na-actions');
      cleanup.append(el('p', 'na-warning', '사진 파일 정리 상태를 확인하지 못했어요. 보관 자료는 아래에서 확인할 수 있어요.'), button('사진 정리 상태 다시 확인', refresh));
      main.append(cleanup);
    } else if (pendingPhotos.length) {
      const cleanup = el('div', 'na-actions');
      cleanup.append(el('p', 'na-warning', '삭제된 카드의 사진 파일 정리가 남아 있어요. 버튼을 누르면 남은 파일을 삭제합니다.'), button('사진 파일 정리', retryPhotoCleanup));
      main.append(cleanup);
    }
    const activeSection = el('section', 'na-archive-section'); activeSection.append(el('h4', '', '원문 보관 중')); main.append(activeSection);
    if (!rows?.length) {
      empty(activeSection, '한 달 보관 중인 카드가 없어요.');
      if (filter.offset) activeSection.append(button('첫 페이지로', () => { filter.offset = 0; load('cards'); }));
    } else {
      const total = rows[0].total_count; activeSection.append(el('p', 'na-count', `보관 중 ${number(total)}개`));
      const bulk = el('div', 'na-actions'); bulk.append(button(`이 페이지 ${number(rows.length)}개 모두 영구 삭제`, () => confirmPurgeNow(rows), 'danger')); activeSection.append(bulk);
      const list = el('div', 'na-list');
      for (const archived of rows) {
        const item = el('article', 'adm-card na-item');
        const meta = el('p', 'na-meta'); meta.append(badge(archived.kind === 'event' ? '이벤트 카드' : archived.kind === 'comment' ? '답글' : '익명카드'), badge('관리자 보관', 'warn'));
        item.append(meta, el('blockquote', 'na-card-body', archived.body || '원문 없음'));
        if (archived.tags?.length) { const tags = el('div', 'na-tags'); for (const tag of archived.tags) tags.append(el('span', '', `#${tag}`)); item.append(tags); }
        const archiveSource = { retention: '기간 만료', owner: '작성자 삭제', admin: '관리자 삭제' }[archived.archive_reason] || '기타';
        item.append(el('p', 'na-reason', `함께 보관된 답글 ${number(archived.reply_count)}개 · 보관 원인: ${archiveSource}`));
        item.append(details([['카드 번호', archived.id], ['작성자 번호', archived.author_id], ['원글 번호', archived.parent_id], ['작성', formatDate(archived.created_at)], ['보관 시작', formatDate(archived.archived_at)], ['영구 삭제 예정', formatDate(archived.purge_after)], ['영구보관', archived.permanent ? '예' : '아니요']]));
        const actions = el('div', 'na-actions'); actions.append(button('원문·답글 보기', () => viewArchivedThread(archived)), button('꾸미기·사진 지정', () => editCardVisual(archived)), button('복구', () => confirmArchiveRestore(archived), 'primary'), button('지금 영구 삭제', () => confirmPurgeNow([archived]), 'danger'));
        item.append(actions); list.append(item);
      }
      activeSection.append(list); pagination(activeSection, filter.offset, total, offset => { filter.offset = offset; load('cards'); });
    }
    const expiredSection = el('section', 'na-archive-section'); expiredSection.append(el('h4', '', '정리 대기')); main.append(expiredSection);
    if (!expired?.length) {
      empty(expiredSection, '정리가 지연된 보관 자료가 없어요.');
      if (filter.expiredOffset) expiredSection.append(button('첫 페이지로', () => { filter.expiredOffset = 0; load('cards'); }));
      return;
    }
    const total = expired[0].total_count; expiredSection.append(el('p', 'na-count', `원문 조회 기간이 끝난 자료 ${number(total)}묶음`));
    const expiredList = el('div', 'na-list');
    for (const archived of expired) {
      const item = el('article', 'adm-card na-item');
      item.append(badge(archived.kind === 'event' ? '이벤트 카드' : archived.kind === 'comment' ? '답글' : '익명카드'), el('p', 'na-reason', `보관 시작: ${formatDate(archived.archived_at)} · 함께 정리할 답글 ${number(archived.reply_count)}개`));
      item.append(details([['카드 번호', archived.id], ['정리 가능', formatDate(archived.purge_after)]]));
      const actions = el('div', 'na-actions'); actions.append(button('영구 정리', () => confirmExpiredPurge(archived), 'danger')); item.append(actions); expiredList.append(item);
    }
    expiredSection.append(expiredList); pagination(expiredSection, filter.expiredOffset, total, offset => { filter.expiredOffset = offset; load('cards'); });
  }
  function confirmReport(report) {
    actionScreen('신고 처리 완료', '이 신고의 검토를 완료로 표시합니다. 카드의 공개 상태는 그대로 유지됩니다.', (form, actions) => {
      form.append(el('blockquote', 'na-card-body', report.body || '삭제된 카드'), el('p', 'na-reason', `신고 사유: ${report.reason || ''}`));
      actions.append(button('처리 완료', () => perform('resolve_report', { p_report_id: report.report_id }, '신고 검토를 완료했어요.', 'reports'), 'primary'));
      form.addEventListener('submit', event => event.preventDefault());
    });
  }
  async function renderReports(run) {
    const all = await rpc('moderation_queue'); if (!validRun(run)) return;
    const rows = all || [];
    const offset = Math.min(filters.reports.offset, Math.max(0, Math.floor((rows.length - 1) / PAGE_SIZE) * PAGE_SIZE));
    filters.reports.offset = offset;
    if (!rows.length) { empty(main, '접수되거나 숨김 처리된 신고가 없어요.'); return; }
    main.append(el('p', 'na-count', `총 ${number(rows.length)}건 · 처리 중인 신고와 숨긴 카드를 함께 표시합니다.`));
    const page = rows.slice(offset, offset + PAGE_SIZE);
    const list = el('div', 'na-list');
    for (const report of page) {
      const item = el('article', 'adm-card na-item'); const meta = el('p', 'na-meta');
      meta.append(badge(report.status === 'resolved' ? '처리 완료' : '접수', report.status === 'resolved' ? 'good' : 'warn'), badge(report.hidden ? '개별 숨김' : '개별 숨김 없음'), el('span', '', formatDate(report.created_at)));
      item.append(meta, el('blockquote', 'na-card-body', report.body || '삭제된 카드'), el('p', 'na-reason', `신고 사유: ${report.reason || ''}`));
      const actions = el('div', 'na-actions');
      if (report.card_id) actions.append(button(report.hidden ? '카드 복구' : '카드 숨김', () => confirmVisibility(report)));
      if (report.status !== 'resolved') actions.append(button('처리 완료', () => confirmReport(report), 'primary'));
      item.append(actions); list.append(item);
    }
    main.append(list); pagination(main, offset, rows.length, next => { filters.reports.offset = next; load('reports'); });
  }
  async function renderUsers(run) {
    const filter = filters.users;
    main.append(searchForm(filter.query, '이용자 번호 전체 또는 일부', query => { filters.users = { query, offset: 0 }; load('users'); }, null, '노트에 참여한 이용자와 관리자를 찾습니다. 카드의 작성자 관리 버튼으로도 이동할 수 있어요.'));
    const rows = await rpc('admin_users', { p_query: filter.query, p_limit: PAGE_SIZE, p_offset: filter.offset });
    if (!validRun(run)) return;
    if (!rows?.length) { empty(main, '조건에 맞는 노트 이용자가 없어요.'); if (filter.offset) main.append(button('첫 페이지로', () => { filters.users.offset = 0; load('users'); })); return; }
    const total = rows[0].total_count; main.append(el('p', 'na-count', `총 ${number(total)}명`)); const list = el('div', 'na-list');
    for (const user of rows) {
      const item = el('article', 'adm-card na-item'); const header = el('div', 'na-item-header'); const meta = el('p', 'na-meta');
      header.append(el('strong', '', shortUser(user.user_id)));
      if (user.is_moderator) meta.append(badge('관리자', 'good'));
      if (user.user_id === userId) meta.append(badge('나'));
      meta.append(badge(user.is_restricted ? '이용 제한 중' : '이용 가능', user.is_restricted ? 'warn' : 'good')); header.append(meta); item.append(header);
      item.append(el('p', 'na-id', user.user_id), el('p', 'na-reason', `작성한 콘텐츠 ${number(user.card_count)}개 · 첫 활동 ${formatDate(user.first_seen)}`));
      if (user.is_restricted) item.append(el('p', 'na-reason', `제한 사유: ${user.restriction_reason || ''}\n종료: ${user.restricted_until ? formatDate(user.restricted_until) : '직접 해제할 때까지'}`));
      const actions = el('div', 'na-actions');
      if (!user.is_moderator) actions.append(button(user.is_restricted ? '이용 제한 해제' : '이용 제한', () => restrictUser(user), user.is_restricted ? '' : 'danger'));
      item.append(actions); list.append(item);
    }
    main.append(list); pagination(main, filter.offset, total, offset => { filters.users.offset = offset; load('users'); });
  }
  // 위치 지도: 위치가 있는 카드를 최신순으로 50개씩 (대략 좌표, 약 1km 칸)
  const loadedAssets = new Map();
  function loadAsset(kind, url) {
    if (!loadedAssets.has(url)) loadedAssets.set(url, new Promise((resolve, reject) => {
      const tag = kind === 'css' ? Object.assign(document.createElement('link'), { rel: 'stylesheet', href: url }) : Object.assign(document.createElement('script'), { src: url, async: true });
      tag.addEventListener('load', () => resolve(true)); tag.addEventListener('error', () => { loadedAssets.delete(url); reject(new Error('load failed')); });
      document.head.append(tag);
    }));
    return loadedAssets.get(url);
  }
  async function ensureMapTool() {
    if (window.OjjudaMap?.create) return true;
    await Promise.all([loadAsset('css', `${ADMIN_BASE}map.css?v=20261004-design1`), loadAsset('js', `${ADMIN_BASE}map.js?v=20260929-pinch`)]);
    return !!window.OjjudaMap?.create;
  }
  function openMappedCard(row) {
    if (row.archived) {
      filters.cards.view = 'archive'; filters.cards.offset = 0; filters.cards.expiredOffset = 0;
      return load('archive');
    }
    Object.assign(filters.cards, { view: 'card', query: row.id, state: 'all', offset: 0, expiredOffset: 0 });
    return load('cards');
  }
  async function renderMap(run) {
    const filter = filters.map || (filters.map = { offset: 0 });
    const [rows, mapReady] = await Promise.all([
      rpc('admin_card_locations', { p_limit: 50, p_offset: filter.offset }),
      ensureMapTool().catch(() => false)
    ]);
    if (!validRun(run)) return;
    if (!rows?.length) {
      empty(main, filter.offset ? '이 페이지에는 위치가 있는 카드가 없어요.' : '위치를 켜고 쓴 카드가 아직 없어요.');
      if (filter.offset) main.append(button('최신 50개로', () => { filters.map.offset = 0; load('map'); }));
      return;
    }
    const total = Number(rows[0].total_count) || rows.length;
    main.append(el('p', 'na-count', `위치가 있는 카드 총 ${number(total)}개 · ${number(filter.offset + 1)}–${number(filter.offset + rows.length)}번째 (최신순)`));
    const box = el('div', 'na-map'); main.append(box);
    const info = el('div', 'na-map-info'); info.append(el('p', 'na-empty', '지도의 점을 누르면 그 자리의 카드가 보여요. 숫자는 같은 자리(약 1km 칸)의 카드 수예요.'));
    main.append(info);
    const groups = new Map();
    for (const row of rows) {
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) continue;
      const key = `${row.lat.toFixed(4)},${row.lon.toFixed(4)}`;
      if (!groups.has(key)) groups.set(key, { lat: row.lat, lng: row.lon, rows: [], count: 0, label: '' });
      const g = groups.get(key); g.rows.push(row); g.count = g.rows.length; g.label = `카드 ${g.count}장 보기`;
    }
    const markers = [...groups.values()], items = new Map();
    const showGroup = entry => {   // 점(또는 합쳐진 점)을 누르면 그 자리의 카드를 보여 줘요
      const members = entry.members || [entry], here = members.flatMap(m => m.rows || []);
      for (const m of markers) m.active = members.includes(m);
      adminMap?.setMarkers(markers);
      info.replaceChildren(el('p', 'na-count', `이 자리의 카드 ${here.length}장`));
      for (const row of here) {
        const card = el('div', 'na-map-card');
        card.append(el('p', 'na-meta', `${formatDate(row.created_at)}${row.archived ? ' · 보관됨' : ''}`), el('blockquote', 'na-card-body', row.body || '원문 없음'));
        card.append(button(row.archived ? '보관함으로 가기' : '카드 관리에서 보기', () => openMappedCard(row)));
        info.append(card);
      }
      items.forEach((item, id) => item.classList.toggle('na-map-on', here.some(row => row.id === id)));
    };
    if (mapReady) {
      const map = window.OjjudaMap.create(box, { center: { lat: markers[0]?.lat ?? 37.5665, lng: markers[0]?.lng ?? 126.978 }, zoom: 12, onMarker: showGroup });
      adminMap = map;
      requestAnimationFrame(() => { if (adminMap === map) map?.setMarkers(markers, true); });
    } else box.replaceWith(el('p', 'na-empty', '지도를 불러오지 못했어요. 아래 목록으로 확인해 주세요.'));
    const list = el('div', 'na-list');
    for (const row of rows) {
      const item = el('article', 'adm-card na-item'); const meta = el('p', 'na-meta');
      meta.append(badge(row.kind === 'comment' ? '답글' : row.kind === 'event' ? '이벤트 카드' : '익명카드'));
      if (row.archived) meta.append(badge('보관됨', 'warn'));
      meta.append(el('span', '', formatDate(row.created_at)));
      item.append(meta, el('blockquote', 'na-card-body', row.body || '원문 없음'));
      if (row.tags?.length) { const tags = el('div', 'na-tags'); for (const tag of row.tags) tags.append(el('span', '', `#${tag}`)); item.append(tags); }
      const actions = el('div', 'na-actions');
      const group = markers.find(g => g.rows.includes(row));
      if (group && mapReady) actions.append(button('지도에서 보기', () => { adminMap?.focusOn({ lat: group.lat, lng: group.lng }, 14); showGroup(group); box.scrollIntoView({ block: 'nearest' }); }));
      actions.append(button(row.archived ? '보관함으로 가기' : '카드 관리에서 보기', () => openMappedCard(row)));
      item.append(actions); items.set(row.id, item); list.append(item);
    }
    main.append(list);
    const pager = el('div', 'na-actions');
    if (filter.offset > 0) pager.append(button('← 더 최신 50개', () => { filters.map.offset = Math.max(0, filter.offset - 50); load('map'); }));
    if (filter.offset + rows.length < total) pager.append(button('이전 50개 →', () => { filters.map.offset = filter.offset + 50; load('map'); }));
    if (pager.childElementCount) main.append(pager);
  }
  async function renderInquiries(run) {
    const target = el('section', 'na-inquiries'); main.append(target);
    if (!window.OjjudaNoteSupport?.renderAdmin) {
      empty(target, '문의 관리 기능을 불러오지 못했어요. 화면을 새로고침해 주세요.'); return;
    }
    const controller = await window.OjjudaNoteSupport.renderAdmin({ client, container: target, onChanged, isCurrent: () => validRun(run) });
    if (!validRun(run)) { controller?.destroy?.(); return; }
    inquiryController = controller;
  }
  async function renderActions(run) {
    const offset = filters.actions.offset;
    const rows = await rpc('admin_actions', { p_limit: PAGE_SIZE, p_offset: offset }); if (!validRun(run)) return;
    if (!rows?.length) { empty(main, '아직 남겨진 작업 기록이 없어요.'); if (offset) main.append(button('첫 페이지로', () => { filters.actions.offset = 0; load('actions'); })); return; }
    const total = rows[0].total_count; main.append(el('p', 'na-count', `총 ${number(total)}건 · 최근 작업부터 표시합니다.`)); const list = el('div', 'na-list');
    for (const action of rows) {
      const item = el('article', 'adm-card na-item'); const header = el('div', 'na-item-header');
      const detail = action.detail;
      const actionLabel = detail?.spam_after ? '도배 방지 설정 변경'
        : detail?.visual_after ? '카드 꾸미기·사진 지정 정정'
        : detail?.after?.radius_km != null ? '이벤트 위치·시간 정정' : ACTIONS[action.action] || '운영 작업';
      header.append(el('strong', '', actionLabel), el('span', 'na-meta', formatDate(action.created_at))); item.append(header);
      item.append(el('p', 'na-reason', `처리자: ${shortUser(action.moderator_id)}\n사유: ${action.reason || '기록된 사유 없음'}`));
      item.append(details([['작업 번호', action.action_id], ['운영자 번호', action.moderator_id], ['이용자 번호', action.subject_user_id], ['카드 번호', action.card_id], ['신고 번호', action.report_id]]));
      const changes = auditChanges(action.detail);
      if (changes.length) {
        const more = el('details', 'na-details'); more.append(el('summary', '', '변경 내용'));
        const values = el('dl');
        for (const [label, value] of changes) values.append(el('dt', '', label), el('dd', '', value));
        more.append(values); item.append(more);
      }
      list.append(item);
    }
    main.append(list); pagination(main, offset, total, next => { filters.actions.offset = next; load('actions'); });
  }
  function auditChanges(detail) {
    if (!detail || typeof detail !== 'object') return [];
    const values = [];
    if (detail.spam_before && detail.spam_after) {
      const describe = value => `같은 글 연속 ${value.max_consecutive}회 · ${value.window_seconds}초에 ${value.max_posts}개 허용`;
      values.push(['변경 전 도배 방지', describe(detail.spam_before)], ['변경 후 도배 방지', describe(detail.spam_after)]);
    }
    for (const [key, label] of [['posting_enabled', '카드 작성'], ['replies_enabled', '답글 작성'], ['reports_enabled', '신고 접수']]) {
      if (typeof detail[key] === 'boolean') values.push([label, detail[key] ? '허용' : '중지']);
    }
    if (Number.isFinite(Number(detail.notice_length)) && detail.notice_length !== undefined) values.push(['공지 길이', `${number(detail.notice_length)}자`]);
    if (detail.blocked_words_changed === true) values.push(['금지어 설정', '저장']);
    if (detail.operating_documents_changed === true) values.push(['운영 문서', '저장']);
    if (Number.isSafeInteger(detail.count)) values.push(['처리한 카드', `${number(detail.count)}개`]);
    if (Object.hasOwn(detail, 'restricted_until')) values.push(['제한 종료', detail.restricted_until ? formatDate(detail.restricted_until) : '지정된 종료 시각 없음']);
    if (Array.isArray(detail.fields)) {
      const fields = detail.fields.map(name => ({ body: '글 내용', tags: '태그' }[name])).filter(Boolean);
      if (fields.length) values.push(['수정 항목', fields.join(', ')]);
    }
    if (detail.before?.radius_km != null && detail.after?.radius_km != null) {
      const eventTerms = terms => `위치 ${terms.lat}, ${terms.lng} · 반경 ${number(terms.radius_km)}km · 시작 ${formatDate(terms.starts_at)} · 종료 ${formatDate(terms.ends_at)}`;
      values.push(['정정 전', eventTerms(detail.before)], ['정정 후', eventTerms(detail.after)]);
      if (detail.price_coins_unchanged != null) values.push(['기존 책정', `${number(detail.price_coins_unchanged)}쭈 (변동 없음)`]);
    }
    if (detail.visual_after) {
      const visual = value => {
        const style = value?.style || {};
        const color = code => COLOR_CHOICES.find(([key]) => key === code)?.[1] || code || '기본';
        return `글꼴 ${style.font || '기본'}, 크기 ${style.size || '보통'}, 색상 ${style.theme || '기본'}, 글씨 색 ${color(style.textColor)}, 글상자 색 ${color(style.boxColor)}, 효과 ${style.effect || '없음'} · 꾸미기 종료 ${formatDate(value?.style_until)} · 지정 사진 ${value?.photo_key || '없음'} · 사진 지정 종료 ${formatDate(value?.photo_until)}`;
      };
      values.push(['정정 전', visual(detail.visual_before)], ['정정 후', visual(detail.visual_after)]);
    }
    if (typeof detail.inquiry_id === 'string') values.push(['문의 번호', detail.inquiry_id]);
    return values;
  }
  async function load(nextTab = tabId) {
    if (!canLeave() || !root || root.hidden) return;
    if (VIEW_OF_TAB[nextTab]) nextTab = TAB_OF_VIEW[filters.cards.view] || 'cards';
    tabId = TABS.some(([id]) => id === nextTab) ? nextTab : 'cards'; actionReturn = null;
    const run = ++pageRun; setStatus('');
    adminMap?.destroy?.(); adminMap = null;
    for (const item of nav.querySelectorAll('[data-admin-tab]')) {
      const selected = item.dataset.adminTab === tabId;
      item.classList.toggle('on', selected);
      if (selected) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    }
    if (typeof onTabChange === 'function') { try { onTabChange(tabId); } catch { /* Keep Note navigation usable if the host refresh fails. */ } }
    const heading = sectionTitle(TABS.find(([id]) => id === tabId)[1], HELP[tabId]);
    focusSection(heading);
    const loading = el('p', 'na-empty', '불러오는 중이에요.'); loading.setAttribute('role', 'status'); main.append(loading);
    try {
      await ({ overview: renderOverview, settings: renderSettings, spam: renderSpamSettings, cards: renderCards, risk: renderCards, events: renderCards, archive: renderCards, map: renderMap, reports: renderReports, inquiries: renderInquiries, users: renderUsers, actions: renderActions }[tabId])(run);
      if (validRun(run)) loading.remove();
      return validRun(run);
    } catch (error) {
      if (!validRun(run)) return;
      loading.remove(); empty(main, '목록을 불러오지 못했어요.'); setStatus(friendlyError(error), true);
      main.append(button('다시 불러오기', () => load(tabId)));
      return false;
    }
  }
  function focusables() {
    return [...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href],summary,[tabindex="0"]')]
      .filter(item => !item.hidden && item.getClientRects().length > 0);
  }
  function ensurePanel() {
    if (root) return;
    root = el('div', 'na-backdrop'); root.id = 'note-admin-backdrop'; root.hidden = true;
    panel = el('section', 'na-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'note-admin-title');
    const header = el('header', 'na-head'); const title = el('div'); const h2 = el('h2', '', '콘텐츠 관리'); h2.id = 'note-admin-title';
    title.append(h2, el('p', '', '카드와 운영 설정을 관리합니다.'));
    closeButton = button('닫기', () => { if (confirmLeave()) close(); }); closeButton.classList.add('na-close'); header.append(title, closeButton);
    const layout = el('div', 'na-layout'); nav = el('nav', 'seg adm-tabs na-nav'); nav.setAttribute('aria-label', '콘텐츠 관리자 메뉴');
    for (const [id, label] of NOTE_TABS) { const item = button(label, () => openTab(id)); item.dataset.adminTab = id; nav.append(item); }
    main = el('div', 'na-main'); main.id = 'note-admin-content'; main.setAttribute('role', 'region'); main.setAttribute('aria-label', '관리 내용');
    status = el('p', 'na-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
    layout.append(nav, main); panel.append(header, layout, status); root.append(panel); document.body.append(root);
    root.addEventListener('keydown', event => {
      if (root.hidden) return;
      if (event.key === 'Escape' && !embedded) { event.preventDefault(); event.stopPropagation(); if (confirmLeave()) actionReturn ? load(actionReturn) : close(); return; }
      if (embedded) return;
      if (event.key !== 'Tab') return;
      const items = focusables(); const first = items[0], last = items.at(-1);
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    });
  }
  function close() {
    instance++; pageRun++; busy = false; actionReturn = null;
    subscription?.unsubscribe(); subscription = null;
    editPreviewObserver?.disconnect(); editPreviewObserver = null;
    inquiryController?.destroy?.(); inquiryController = null;
    draftValues.clear(); extraDraftCheck = () => false;
    adminMap?.destroy?.(); adminMap = null;
    if (!root || root.hidden) return;
    lockControls(false); root.hidden = true; main.replaceChildren(); setStatus('');
    for (const [element, prior] of inertState) if (element.isConnected) element.inert = prior;
    inertState = [];
    if (!embedded) document.body.style.overflow = previousOverflow;
    const focus = previousFocus; previousFocus = null; userId = null; client = null; onChanged = null;
    externalNav = false; authorized = false; onTabChange = null;
    filters.cards = { query: '', state: 'all', view: 'card', offset: 0, expiredOffset: 0 }; filters.users = { query: '', offset: 0 }; filters.reports.offset = 0; filters.actions.offset = 0; filters.map = { offset: 0 };
    if (embedded) {
      embedded = false; root.classList.remove('na-embedded'); root.remove();
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); closeButton.hidden = false;
    } else if (focus?.isConnected && !focus.closest('[inert]')) focus.focus({ preventScroll: true });
  }
  async function activate(options, container) {
    ensurePanel(); instance++; const run = instance;
    embedded = !!container;
    externalNav = embedded && options.externalNav === true;
    authorized = false; onTabChange = options.onTabChange;
    const requested = options.initialTab || options.tabId;
    tabId = TABS.some(([id]) => id === requested) ? requested : 'cards';
    if (VIEW_OF_TAB[tabId]) Object.assign(filters.cards, { view: VIEW_OF_TAB[tabId], offset: 0, expiredOffset: 0 });
    client = options.client; onChanged = options.onChanged; userId = null;
    if (embedded) {
      root.classList.add('na-embedded'); panel.setAttribute('role', 'region'); panel.removeAttribute('aria-modal');
      closeButton.hidden = true; container.append(root);
    } else {
      root.classList.remove('na-embedded'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
      closeButton.hidden = false; document.body.append(root);
      previousFocus = document.activeElement; previousOverflow = document.body.style.overflow;
      inertState = [...document.body.children].filter(item => item !== root && item instanceof HTMLElement).map(item => [item, item.inert]);
      for (const [item] of inertState) item.inert = true;
      document.body.style.overflow = 'hidden';
    }
    root.hidden = false;
    nav.hidden = true;
    main.replaceChildren(el('p', 'na-empty', '관리자 권한을 확인하고 있어요.')); setStatus('');
    if (!embedded) closeButton.focus();
    try {
      const { data, error } = await client.auth.getSession();
      if (!validInstance(run)) return;
      if (error) throw error;
      userId = data?.session?.user?.id;
      if (!userId) { main.replaceChildren(el('p', 'na-empty', '대문에서 로그인한 뒤 다시 열어 주세요.')); return; }
      const auth = client.auth.onAuthStateChange((_event, session) => {
        if (validInstance(run) && session?.user?.id !== userId) close();
      });
      subscription = auth?.data?.subscription || null;
      const allowed = await rpc('is_note_moderator');
      if (!validInstance(run)) return;
      if (allowed !== true) {
        nav.hidden = true; main.replaceChildren(el('p', 'na-empty', '관리자 계정만 사용할 수 있어요.')); return;
      }
      authorized = true; nav.hidden = externalNav;
      filters.cards.offset = 0; filters.cards.expiredOffset = 0; filters.users.offset = 0; filters.actions.offset = 0; filters.reports.offset = 0; filters.map = { offset: 0 };
      await load(tabId);
    } catch (error) {
      if (!validInstance(run)) return;
      nav.hidden = true; main.replaceChildren(el('p', 'na-empty', '관리자 권한을 확인하지 못했어요.')); setStatus(friendlyError(error), true);
    }
  }
  async function open(options = {}) {
    if (!options.client?.schema || !options.client?.auth) return;
    if (root && !root.hidden) {
      if (!embedded) { closeButton.focus(); return; }
      close();
    }
    return activate(options, null);
  }
  async function mount(container, options = {}) {
    if (!(container instanceof HTMLElement) || !options.client?.schema || !options.client?.auth) return;
    if (root && !root.hidden && embedded && client === options.client) {
      if (root.parentElement !== container) container.append(root);
      onChanged = options.onChanged; onTabChange = options.onTabChange;
      externalNav = options.externalNav === true; nav.hidden = externalNav || !authorized;
      const requested = options.initialTab || options.tabId;
      if (requested && !authorized && TAB_ITEMS.some(tab => tab.id === requested)) { tabId = requested; if (VIEW_OF_TAB[requested]) filters.cards.view = VIEW_OF_TAB[requested]; }
      if (requested && requested !== tabId && authorized && !busy) {
        // The host already checked pending writes and confirmed discarding this draft.
        if (options.navigationApproved === true && canLeave()) {
          if (VIEW_OF_TAB[requested] && filters.cards.view !== VIEW_OF_TAB[requested]) Object.assign(filters.cards, { view: VIEW_OF_TAB[requested], offset: 0, expiredOffset: 0, query: '', state: 'all' });
          return load(requested);
        }
        return openTab(requested);
      }
      return;
    }
    if (root && !root.hidden) close();
    return activate(options, container);
  }
  function unmount() { if (embedded) close(); }
  function getTabs() { return NOTE_TABS.map(([id, label]) => ({ id, label })); }
  function selectTab(id) {
    if (!TAB_ITEMS.some(tab => tab.id === id)) return Promise.resolve(false);
    if (!authorized) {
      tabId = id; if (VIEW_OF_TAB[id]) filters.cards.view = VIEW_OF_TAB[id];
      if (typeof onTabChange === 'function') { try { onTabChange(id); } catch {} }
      return Promise.resolve(false);
    }
    return openTab(id);
  }
  async function openReportedCard(options = {}) {
    const report = options.report;
    if (!report || !/^[0-9a-f-]{36}$/i.test(report.card_id || '')) return;
    await open({ client: options.client, initialTab: 'reports', onChanged: options.onChanged });
    if (authorized && root && !root.hidden && !embedded) confirmVisibility(report);
  }
  window.OjjudaNoteAdmin = Object.freeze({ open, close, mount, unmount, getTabs, tabs: TAB_ITEMS, selectTab, openReportedCard, refresh, canLeave, hasDraft });
})();
