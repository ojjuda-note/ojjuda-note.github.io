/* Member ratings share one RPC contract in the directory and recommendation views. */
(function (global) {
  'use strict';

  const SCORES = Object.freeze(Array.from({ length: 9 }, (_, index) => 1 + index / 2));
  const scoreOK = value => typeof value === 'number' && SCORES.includes(value);
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  let editorSequence = 0;

  function summaryFrom(raw) {
    if (!raw || typeof raw.id !== 'string') throw new Error('rating_response_invalid');
    const count = Number(raw.count), average = raw.average == null ? null : Number(raw.average);
    const mine = raw.my_rating == null ? null : Number(raw.my_rating);
    if (!Number.isSafeInteger(count) || count < 0 || (count === 0 ? average !== null : !Number.isFinite(average) || average < 1 || average > 5) || (mine !== null && (!scoreOK(mine) || count === 0))) throw new Error('rating_response_invalid');
    return { id: raw.id, average, count, my_rating: mine };
  }

  function create({ client, getUser } = {}) {
    let destroyed = false, generation = 0;
    const pending = new Set();
    const member = () => {
      const user = getUser?.();
      return user?.id && !user.is_anonymous ? String(user.id) : null;
    };
    let observedMember = member();
    const auth = client?.auth?.onAuthStateChange?.((event, session) => {
      const next = session?.user?.id && !session.user.is_anonymous ? String(session.user.id) : null;
      if (event === 'SIGNED_OUT' || (session?.user && next !== observedMember)) {
        generation += 1;
        for (const controller of pending) controller.abort();
      }
      if (event === 'SIGNED_OUT' || session?.user) observedMember = next;
    });
    function validTarget(kind, id) {
      return (kind === 'certified' || kind === 'recommended') && typeof id === 'string' && id.length > 0 && id.length <= 80;
    }
    async function request(name, args) {
      const owner = member(), epoch = generation;
      if (destroyed || !owner || typeof client?.rpc !== 'function') throw new Error('sign_in_required');
      const controller = new AbortController(); pending.add(controller);
      let timer;
      const check = () => { if (destroyed || generation !== epoch || member() !== owner) throw new Error('rating_session_changed'); };
      try {
        check();
        let rpc = client.rpc(name, args);
        if (typeof rpc?.abortSignal === 'function') rpc = rpc.abortSignal(controller.signal);
        const result = await Promise.race([
          Promise.resolve(rpc),
          new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('rating_timeout')); }, 18000); })
        ]);
        check();
        if (result?.error) throw result.error;
        if (!result || !Object.prototype.hasOwnProperty.call(result, 'data')) throw new Error('rating_response_invalid');
        return result.data;
      } finally { clearTimeout(timer); pending.delete(controller); }
    }
    return {
      async getSummaries(kind, ids) {
        if (!Array.isArray(ids) || ids.length > 100 || ids.some(id => !validTarget(kind, id))) throw new Error('rating_targets_invalid');
        if (!ids.length) return [];
        const unique = [...new Set(ids)], wanted = new Set(unique);
        const data = await request('get_restaurant_rating_summaries', { p_kind: kind, p_ids: unique });
        if (!Array.isArray(data)) throw new Error('rating_response_invalid');
        const rows = data.map(summaryFrom);
        if (rows.some(row => !wanted.has(row.id)) || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('rating_response_invalid');
        return rows;
      },
      async setRating(kind, id, score) {
        if (!validTarget(kind, id) || !scoreOK(score)) throw new Error('rating_score_invalid');
        const raw = await request('set_restaurant_rating', { p_kind: kind, p_id: id, p_score: score });
        const result = summaryFrom(raw);
        if (result.id !== id || result.my_rating !== score) throw new Error('rating_response_invalid');
        return result;
      },
      destroy() {
        if (destroyed) return;
        destroyed = true; generation += 1;
        for (const controller of pending) controller.abort();
        pending.clear(); auth?.data?.subscription?.unsubscribe?.();
      }
    };
  }

  function stars(score) {
    const visual = node('span', 'orr-stars', '★★★★★');
    visual.setAttribute('aria-hidden', 'true');
    const fill = node('span', 'orr-stars-fill', '★★★★★');
    fill.style.width = Math.max(0, Math.min(100, (score || 0) * 20)) + '%';
    visual.append(fill);
    return visual;
  }

  /* undefined = loading, null = unavailable, count 0 = a confirmed empty aggregate. */
  function renderSummary(container, summary) {
    container.classList.add('orr-summary');
    container.removeAttribute('aria-label');
    container.replaceChildren();
    if (summary === undefined || summary === null) {
      container.append(node('span', 'orr-summary-note', summary === undefined ? '별점 불러오는 중…' : '별점을 불러오지 못했어요.'));
      return;
    }
    if (!summary.count) {
      container.append(stars(0), node('span', 'orr-summary-note', '아직 별점이 없어요'));
      return;
    }
    const value = Number(summary.average).toFixed(1), count = Number(summary.count).toLocaleString('ko-KR');
    container.setAttribute('aria-label', '평균 별점 ' + value + '점, ' + count + '명 참여');
    container.append(stars(Number(summary.average)), node('strong', 'orr-average', value), node('span', 'orr-count', '· ' + count + '명'));
  }

  function messageFor(error, fallback) {
    const message = String(error?.code || '') + ' ' + String(error?.message || '');
    if (/auth|sign_in_required|member_unavailable|session|jwt|42501/i.test(message)) return '로그인 상태가 바뀌었어요. 맛집 화면을 다시 열어 주세요.';
    if (/rating_daily_limit|rating_limit/i.test(message)) return '오늘 남길 수 있는 별점을 모두 사용했어요. 내일 다시 남겨 주세요.';
    if (/not_found|unavailable/i.test(message)) return '이 맛집의 별점을 확인할 수 없어요. 목록에서 다시 열어 주세요.';
    return fallback;
  }

  function mountEditor(container, { name = '', load, save, isCurrent = () => true, onChange = () => {} } = {}) {
    let disposed = false, loading = true, saving = false, loaded = false, selected = null, saved = null, attempt = 0;
    const current = () => { try { return !disposed && isCurrent() === true; } catch { return false; } };
    container.classList.add('orr-editor');
    container.setAttribute('aria-label', (name ? name + ' ' : '') + '회원 별점');
    const title = node('h3', 'orr-title', '회원 별점'), summary = node('div');
    const help = node('p', 'orr-help', '다녀온 맛집에 별점을 남겨 주세요. 1~5점, 0.5점씩 선택할 수 있어요.');
    const form = node('form', 'orr-form'), fieldset = node('fieldset', 'orr-fieldset'), legend = node('legend', '', '내 별점');
    const preview = node('div', 'orr-preview'), choiceText = node('span', 'orr-selected', '점수를 선택해 주세요.'), choices = node('div', 'orr-choices');
    choiceText.setAttribute('aria-live', 'polite');
    preview.append(stars(0), choiceText);
    const radioName = 'restaurant-rating-' + (++editorSequence), radios = [];
    for (const score of SCORES) {
      const label = node('label', 'orr-choice'), radio = node('input'), caption = node('span', '', score + '점');
      radio.type = 'radio'; radio.name = radioName; radio.value = String(score); radio.required = true; radio.dataset.orr = 'choice';
      radio.addEventListener('change', () => {
        if (!current() || loading || saving || !radio.checked) return;
        selected = score; updateControls(); status.textContent = '';
      });
      label.append(radio, caption); choices.append(label); radios.push(radio);
    }
    fieldset.append(legend, preview, choices);
    const actions = node('div', 'orr-actions'), submit = node('button', 'orr-save', '별점 저장'), retry = node('button', 'orr-retry', '별점 다시 불러오기');
    submit.type = 'submit'; submit.dataset.orr = 'save'; retry.type = 'button'; retry.dataset.orr = 'retry'; retry.hidden = true;
    const status = node('p', 'orr-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    actions.append(submit, retry); form.append(fieldset, actions, status); container.replaceChildren(title, summary, help, form);

    function updateControls() {
      const locked = loading || saving || !loaded || !current();
      fieldset.disabled = locked;
      radios.forEach(radio => { radio.checked = Number(radio.value) === selected; });
      preview.firstChild.replaceWith(stars(selected));
      choiceText.textContent = selected === null ? '점수를 선택해 주세요.' : selected + '점' + (selected === saved ? ' · 내 별점' : ' 선택');
      submit.disabled = locked || selected === null || selected === saved;
      submit.textContent = saving ? '저장하는 중…' : saved === null ? '별점 저장' : '별점 수정';
      retry.disabled = loading || saving || !current();
    }
    function showStatus(text, error = false) {
      status.textContent = text; status.classList.toggle('orr-error', error);
    }
    async function refresh() {
      if (!current() || saving) return;
      const token = ++attempt;
      loading = true; loaded = false; retry.hidden = true; renderSummary(summary, undefined); showStatus(''); updateControls();
      try {
        const result = summaryFrom(await load());
        if (!current() || token !== attempt) return;
        renderSummary(summary, result); saved = selected = result.my_rating; loaded = true;
      } catch (error) {
        if (!current() || token !== attempt) return;
        renderSummary(summary, null); retry.hidden = false;
        showStatus(messageFor(error, '연결을 확인한 뒤 별점을 다시 불러와 주세요.'), true);
      } finally {
        if (current() && token === attempt) { loading = false; updateControls(); }
      }
    }
    retry.addEventListener('click', () => void refresh());
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!current() || !loaded || loading || saving || !scoreOK(selected) || selected === saved) return;
      const value = selected;
      saving = true; retry.hidden = true; showStatus('별점을 저장하는 중이에요…'); updateControls();
      try {
        const result = summaryFrom(await save(value));
        if (!current()) return;
        if (result.my_rating !== value) throw new Error('rating_response_invalid');
        saved = selected = result.my_rating; renderSummary(summary, result);
        showStatus(value + '점으로 저장했어요. 언제든 바꿀 수 있어요.');
        try { onChange(result); } catch { /* A caller's repaint must not turn a confirmed save into a failure. */ }
      } catch (error) {
        if (!current()) return;
        showStatus(messageFor(error, '저장 결과를 확인하지 못했어요. 같은 점수로 다시 저장해 주세요.'), true);
      } finally { if (current()) { saving = false; updateControls(); } }
    });
    renderSummary(summary, undefined); updateControls(); void refresh();
    return { dispose() { if (disposed) return; disposed = true; attempt += 1; fieldset.disabled = true; submit.disabled = true; retry.disabled = true; } };
  }

  global.OjjudaRestaurantRatings = Object.freeze({ create, renderSummary, mountEditor });
})(window);
