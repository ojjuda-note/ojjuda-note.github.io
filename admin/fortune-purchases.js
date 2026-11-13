/* Read-only purchase receipts. The server filters records and checks administrator access. */
(() => {
  'use strict';
  const PAGE_SIZE = 30;
  const MAX_OFFSET = 2147483647;
  const PRODUCTS = { all: '전체', tarot: '타로', saju: '사주', biorhythm: '바이오리듬' };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const dateFormat = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const number = value => value.toLocaleString('ko-KR');
  const count = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const validDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const parsed = new Date(value + 'T00:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : '';
  };
  const filters = state => ({
    product: Object.hasOwn(PRODUCTS, state?.product) ? state.product : 'all',
    query: typeof state?.query === 'string' ? state.query.slice(0, 100) : '',
    from: validDate(state?.from), to: validDate(state?.to)
  });
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const authError = error => ['42501', 'PGRST301', 'PGRST302'].includes(error?.code)
    || /admin_required|not_admin|not_signed_in|permission denied|jwt.*(?:expired|invalid)/i.test(error?.message || '');
  function validResponse(data) {
    const hasBiorhythm = data && Object.hasOwn(data, 'biorhythm_count');
    return data && Array.isArray(data.items) && data.items.length <= PAGE_SIZE
      && ['total_count', 'total_ju', 'tarot_count', 'saju_count'].every(key => count(data[key]))
      && (!hasBiorhythm || count(data.biorhythm_count))
      && data.tarot_count + data.saju_count + (hasBiorhythm ? data.biorhythm_count : 0) === data.total_count
      && data.total_count >= data.items.length
      && data.items.every(row => row && UUID.test(row.request_id || '') && UUID.test(row.user_id || '')
        && ['tarot', 'saju', 'biorhythm'].includes(row.product) && count(row.coins) && row.coins > 0
        && (row.product !== 'biorhythm' || hasBiorhythm && data.biorhythm_count > 0)
        && typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))
        && (row.nickname === null || typeof row.nickname === 'string')
        && typeof row.topic_title === 'string'
        && (row.year === null || Number.isSafeInteger(row.year) && row.year > 0 && row.year <= 9999));
  }

  function mount({ container, client, getAdminId, isCurrent = () => true, initialState = null }) {
    let owner = getAdminId?.() || null, destroyed = false, run = 0, subscription = null;
    let applied = filters(initialState);
    let offset = Number.isSafeInteger(initialState?.offset) && initialState.offset >= 0 && initialState.offset <= MAX_OFFSET ? initialState.offset : 0;
    let productInput, queryInput, fromInput, toInput, submitButton, refreshButton, summary, list, status, pager, filterError;
    const active = () => !destroyed && isCurrent() && !!owner && getAdminId?.() === owner;
    const valid = version => active() && version === run;
    const draft = () => productInput ? filters({ product: productInput.value, query: queryInput.value, from: fromInput.value, to: toInput.value }) : filters(initialState?.draft || applied);
    const getState = () => ({ ...applied, offset, draft: draft() });
    function destroy() {
      if (destroyed) return;
      destroyed = true; run++; owner = null;
      subscription?.unsubscribe?.(); subscription = null;
      container.replaceChildren();
    }
    function clearAccess(message = '관리자 계정으로 다시 열어 주세요.') {
      if (destroyed || !isCurrent()) return;
      run++; owner = null;
      subscription?.unsubscribe?.(); subscription = null;
      const messageNode = el('p', 'afp-message', message);
      messageNode.setAttribute('role', 'status');
      container.replaceChildren(messageNode);
    }
    function stillValid(version) {
      if (valid(version)) return true;
      if (!destroyed && isCurrent() && getAdminId?.() !== owner) clearAccess();
      return false;
    }
    const control = (text, action, className = 'btn afp-button') => {
      const node = el('button', className, text); node.type = 'button';
      node.addEventListener('click', action); return node;
    };
    function setBusy(value) {
      submitButton.disabled = value; refreshButton.disabled = value;
      list.setAttribute('aria-busy', String(value));
    }
    function renderSummary(data) {
      const metrics = [
        ['결제 항목', number(data.total_count) + '건'], ['차감 합계', number(data.total_ju) + '쭈'],
        ['타로', number(data.tarot_count) + '건'], ['사주', number(data.saju_count) + '건']
      ];
      if (Object.hasOwn(data, 'biorhythm_count')) metrics.push(['바이오리듬', number(data.biorhythm_count) + '건']);
      summary.replaceChildren(...metrics.map(([label, value]) => {
        const item = el('div', 'afp-metric'); item.append(el('dt', '', label), el('dd', '', value)); return item;
      }));
    }
    function renderItems(items) {
      list.replaceChildren(...items.map(row => {
        const item = el('li', 'afp-purchase');
        const main = el('div', 'afp-purchase-main'), member = el('div', 'afp-member');
        const id = el('span', 'afp-member-id', `회원 ${row.user_id.slice(0, 8)}…${row.user_id.slice(-4)}`);
        id.title = row.user_id;
        member.append(el('strong', 'afp-nickname', row.nickname?.trim() || '이름 없는 회원'), id);
        const product = el('div', 'afp-product');
        product.append(el('span', 'afp-badge is-' + row.product, PRODUCTS[row.product]),
          el('strong', 'afp-topic', row.topic_title.trim() || '항목 미확인'));
        if (row.year !== null) product.append(el('span', 'afp-year', `대상 연도 ${row.year}년`));
        const charge = el('div', 'afp-charge');
        charge.append(el('span', '', '실제 차감'), el('strong', '', number(row.coins) + '쭈'));
        main.append(member, product, charge);
        const footer = el('div', 'afp-purchase-footer');
        const time = el('time', 'afp-time', dateFormat.format(new Date(row.created_at)));
        time.dateTime = row.created_at; time.title = '한국시간 (Asia/Seoul)';
        const when = el('div', 'afp-when', '결제일시 '); when.append(time);
        const detail = el('details', 'afp-identifiers'), ids = el('dl');
        detail.append(el('summary', '', '회원·결제 번호'));
        ids.append(el('dt', '', '회원 ID'), el('dd', '', row.user_id),
          el('dt', '', '결제 번호'), el('dd', '', row.request_id));
        detail.append(ids); footer.append(when, detail); item.append(main, footer); return item;
      }));
    }
    function renderPager(total) {
      if (!total) return;
      const page = Math.floor(offset / PAGE_SIZE) + 1, pages = Math.ceil(total / PAGE_SIZE);
      const back = control('이전', () => { offset = Math.max(0, offset - PAGE_SIZE); void refresh(); });
      const next = control('다음', () => { offset += PAGE_SIZE; void refresh(); });
      back.disabled = offset === 0; next.disabled = offset + PAGE_SIZE >= total || offset + PAGE_SIZE > MAX_OFFSET;
      pager.append(back, el('span', 'afp-page-number', `${number(page)} / ${number(pages)}페이지`), next);
      if (offset) pager.append(control('첫 페이지', () => { offset = 0; void refresh(); }, 'btn sm afp-first'));
    }
    async function refresh(reset = false) {
      if (!active()) { clearAccess(); return; }
      if (reset) offset = 0;
      const version = ++run;
      const args = { p_product: applied.product, p_query: applied.query.trim(), p_from: applied.from || null,
        p_to: applied.to || null, p_limit: PAGE_SIZE, p_offset: offset };
      setBusy(true); status.textContent = '구매내역을 불러오고 있어요.';
      summary.replaceChildren(); list.replaceChildren(); pager.replaceChildren();
      try {
        const { data, error } = await client.rpc('admin_fortune_purchases', args);
        if (!stillValid(version)) return;
        if (error) {
          if (authError(error)) { clearAccess('관리자 권한을 확인할 수 없어요. 다시 로그인해 주세요.'); return; }
          throw error;
        }
        if (!validResponse(data)) throw new Error('invalid_purchase_history');
        renderSummary(data); renderItems(data.items); renderPager(data.total_count);
        status.textContent = data.items.length
          ? `조회 조건에 맞는 ${number(data.total_count)}건 중 ${number(offset + 1)}–${number(offset + data.items.length)}건 · 최근 결제순`
          : offset && data.total_count ? '이 페이지에 남은 기록이 없어요. 첫 페이지를 확인해 주세요.' : '조건에 맞는 구매내역이 없어요.';
      } catch (error) {
        if (!stillValid(version)) return;
        summary.replaceChildren(); list.replaceChildren(); pager.replaceChildren();
        status.textContent = error?.code === '22023' ? '조회 조건을 확인하고 다시 조회해 주세요.' : '구매내역을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.';
        pager.append(control('다시 불러오기', () => { void refresh(); }));
      } finally { if (valid(version)) setBusy(false); }
    }
    const api = { getState, refresh, destroy };
    if (!owner || typeof client?.rpc !== 'function') {
      clearAccess('관리자 계정만 구매내역을 볼 수 있어요.'); return api;
    }
    const section = el('section', 'afp-history'); section.setAttribute('aria-label', '운세·리듬 구매내역');
    const heading = el('div', 'afp-heading'), copy = el('div');
    copy.append(el('h3', '', '운세·리듬 구매내역'),
      el('p', 'afp-help', '타로·사주·바이오리듬의 결제 항목과 실제 차감한 쭈를 확인해요. 바이오리듬 기본 이용료는 5쭈예요. 날짜와 시간은 한국시간(Asia/Seoul) 기준이에요.'));
    refreshButton = control('새로고침', () => { void refresh(); }); heading.append(copy, refreshButton);
    const form = el('form', 'afp-filters'); form.setAttribute('aria-label', '구매내역 조회 조건');
    const field = (label, input, className = '') => {
      const wrapper = el('label', 'afp-field' + (className ? ' ' + className : ''));
      wrapper.append(el('span', '', label), input); form.append(wrapper);
      return input;
    };
    productInput = el('select'); productInput.name = 'product';
    for (const [value, label] of Object.entries(PRODUCTS)) {
      const option = el('option', '', label); option.value = value; productInput.append(option);
    }
    field('상품', productInput);
    queryInput = el('input'); queryInput.type = 'search'; queryInput.name = 'query'; queryInput.maxLength = 100;
    queryInput.placeholder = '닉네임 또는 전체 회원 ID'; queryInput.autocomplete = 'off'; field('회원 찾기', queryInput, 'afp-search');
    fromInput = el('input'); fromInput.type = 'date'; fromInput.name = 'from'; field('시작일', fromInput);
    toInput = el('input'); toInput.type = 'date'; toInput.name = 'to'; field('종료일', toInput);
    function fill(value) { productInput.value = value.product; queryInput.value = value.query; fromInput.value = value.from; toInput.value = value.to; }
    fill(filters(initialState?.draft || applied));
    const buttons = el('div', 'afp-filter-actions');
    submitButton = el('button', 'btn pri afp-submit', '조회'); submitButton.type = 'submit';
    buttons.append(submitButton, control('초기화', () => {
      applied = filters(); offset = 0; fill(applied); filterError.textContent = ''; void refresh();
    })); form.append(buttons);
    filterError = el('p', 'afp-filter-error'); filterError.setAttribute('role', 'alert');
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!active()) { clearAccess(); return; }
      const next = draft(); next.query = next.query.trim();
      if (next.from && next.to && next.from > next.to) {
        filterError.textContent = '시작일은 종료일보다 늦을 수 없어요.'; fromInput.focus(); return;
      }
      filterError.textContent = ''; applied = next; fill(next); void refresh(true);
    });
    summary = el('dl', 'afp-summary'); summary.setAttribute('aria-label', '조회 조건 전체 합계');
    status = el('p', 'afp-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    list = el('ol', 'afp-list'); list.setAttribute('aria-label', '결제 내역');
    pager = el('nav', 'afp-pager'); pager.setAttribute('aria-label', '구매내역 페이지');
    section.append(heading, form, filterError, summary,
      el('p', 'afp-note', '전체 풀이는 항목별 결제 내역으로 표시합니다. 무료 미리보기는 포함되지 않습니다.'), status, list, pager);
    container.replaceChildren(section);
    subscription = client.auth?.onAuthStateChange?.((_event, session) => {
      if (session?.user?.id !== owner) clearAccess();
    })?.data?.subscription;
    void refresh();
    return api;
  }
  window.OjjudaAdminFortunePurchases = Object.freeze({ mount });
})();
