/* Administrator-only review of group posts, attachments, comments and reports. */
(() => {
  'use strict';
  const PAGE_SIZE = 30;
  const bucket = 'group-media';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const niceDate = value => value ? new Date(value).toLocaleString('ko-KR', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '';
  const label = { post: '이야기', event: '약속', trip: '여행' };
  const filters = [
    ['all', '전체 글'], ['risk', '위험 신호'], ['reported', '신고 있음'],
    ['photo', '사진 포함'], ['video', '동영상 포함']
  ];

  function mount({ container, client, getAdminId, isCurrent, initialState = {} }) {
    let active = true, busy = false, more = false, request = 0;
    let items = [], filter = initialState.filter || 'all', query = initialState.query || '';
    const extras = new Map(), urls = new Map(), pending = new Map();
    let watcher = null;
    if (!filters.some(([k]) => k === filter)) filter = 'all';

    container.innerHTML = `<section class="agroups">
      <header class="agroups-heading">
        <div><h3>그룹 관리</h3><p>모든 그룹의 글·사진·동영상·댓글을 모아 봅니다. 관리자만 열람할 수 있어요.</p></div>
        <button type="button" data-ag-refresh>새로고침</button>
      </header>
      <form class="agroups-search" data-ag-search>
        <label for="agroups-filter">보기</label>
        <select id="agroups-filter" name="filter">${filters.map(([key, title]) =>
          `<option value="${key}" ${key === filter ? 'selected' : ''}>${title}</option>`).join('')}</select>
        <label for="agroups-query">검색</label>
        <input id="agroups-query" name="query" maxlength="100" placeholder="그룹·작성자·글 내용" value="${esc(query)}">
        <button type="submit">찾기</button>
      </form>
      <div class="agroups-message" data-ag-status role="status" aria-live="polite"></div>
      <div class="agroups-list" data-ag-list></div>
      <button class="agroups-more" data-ag-more type="button" hidden>이전 글 더 보기</button>
    </section>`;
    const $ = selector => container.querySelector(selector);
    const list = $('[data-ag-list]'), status = $('[data-ag-status]'), moreButton = $('[data-ag-more]');
    const valid = () => active && container.isConnected && isCurrent() && !!getAdminId();
    const say = (message, error = false) => {
      if (!active) return;
      status.textContent = message;
      status.classList.toggle('error', error);
    };
    const rpc = async (action, payload = {}) => {
      if (!valid()) throw Error('관리자 권한을 확인해 주세요.');
      const { data, error } = await client.rpc('group_admin_board', { p_action: action, p_payload: payload });
      if (error) throw error;
      if (!valid()) throw Error('관리자 화면이 닫혔어요.');
      return data;
    };
    const getExtra = id => {
      if (!extras.has(id)) extras.set(id, { commentsVisible: false, reportsVisible: false, comments: null, reports: null });
      return extras.get(id);
    };
    const attachment = (entry, file, i) => {
      const path = String(file.path || '');
      if (!path || (!file.mime?.startsWith('image/') && !file.mime?.startsWith('video/'))) return '';
      const source = urls.get(path);
      const caption = esc(file.name || (file.mime.startsWith('video/') ? '그룹 동영상' : '그룹 사진'));
      const image = file.mime.startsWith('image/');
      return `<figure class="agroups-media">
        <div class="agroups-media-frame" data-ag-path="${esc(path)}">
          ${source ? (image
            ? `<img alt="${caption}" src="${source}" loading="lazy">`
            : `<video controls playsinline preload="metadata" src="${source}"></video>`)
            : image
              ? `<span data-ag-load-image="${esc(path)}">사진 불러오는 중…</span>`
              : `<button type="button" data-ag-video="${esc(path)}">▶ 동영상 재생</button>`}
        </div>
        <figcaption>${caption} <span>${i + 1}/${entry.media.length}</span></figcaption>
      </figure>`;
    };
    const comments = extra => {
      if (!extra.commentsVisible) return '';
      if (!extra.comments) return '<p class="agroups-muted">댓글 불러오는 중…</p>';
      return `<div class="agroups-subitems">${extra.comments.length ? extra.comments.map(c =>
        `<div class="agroups-comment"><strong>${esc(c.author_name)}</strong>
          <time>${niceDate(c.created_at)}</time>
          ${c.risk_detected ? '<span class="agroups-flag">위험 문구</span>' : ''}
          <p>${esc(c.body)}</p></div>`).join('') : '<p>댓글이 없어요.</p>'}</div>`;
    };
    const reports = (entry, extra) => {
      if (!extra.reportsVisible) return '';
      if (!extra.reports) return '<p class="agroups-muted">신고 내역 불러오는 중…</p>';
      return `<div class="agroups-subitems">${extra.reports.length ? extra.reports.map(r =>
        `<div class="agroups-comment"><strong>${esc(r.reporter_name)} · ${r.status === 'open' ? '접수' : '처리 완료'}</strong>
          <time>${niceDate(r.created_at)}</time><p>${esc(r.reason)}</p></div>`).join('') : '<p>신고가 없어요.</p>'}
        ${entry.report_count ? `<button data-ag-resolve="${entry.id}" type="button">이 글의 신고 처리 완료</button>` : ''}
      </div>`;
    };
    const card = entry => {
      const extra = getExtra(entry.id);
      return `<article class="agroups-card" data-ag-entry="${esc(entry.id)}">
        <div class="agroups-meta">
          <strong>${esc(entry.room_name)}</strong>
          <span>${esc(entry.author_name)} · ${niceDate(entry.created_at)}</span>
          <small>${esc(label[entry.kind] || '글')}</small>
        </div>
        <div class="agroups-flags">
          ${entry.risk_detected ? '<span class="agroups-flag">⚠ 위험 문구 감지</span>' : ''}
          ${entry.report_count ? `<span class="agroups-flag report">신고 ${entry.report_count}건</span>` : ''}
        </div>
        ${entry.title ? `<h4>${esc(entry.title)}</h4>` : ''}
        ${entry.body ? `<p class="agroups-body">${esc(entry.body)}</p>` : ''}
        ${entry.location ? `<p class="agroups-muted">장소 · ${esc(entry.location)}</p>` : ''}
        ${entry.starts_at ? `<p class="agroups-muted">일정 · ${niceDate(entry.starts_at)} ~ ${niceDate(entry.ends_at)}</p>` : ''}
        ${Array.isArray(entry.media) && entry.media.length ? `<div class="agroups-attachments">${entry.media.map((file, i) => attachment(entry, file, i)).join('')}</div>` : ''}
        <div class="agroups-actions">
          <button type="button" data-ag-comments="${entry.id}">댓글 ${entry.comment_count || 0} ${extra.commentsVisible ? '접기' : '보기'}</button>
          <button type="button" data-ag-reports="${entry.id}">신고 내역 ${extra.reportsVisible ? '접기' : '보기'}</button>
          ${entry.updated_at !== entry.created_at ? '<small>수정됨</small>' : ''}
        </div>
        ${comments(extra)}${reports(entry, extra)}
      </article>`;
    };
    const render = () => {
      if (!valid()) return;
      watcher?.disconnect();
      list.innerHTML = items.map(card).join('') ||
        '<p class="agroups-empty">조건에 맞는 그룹 글이 없어요.</p>';
      moreButton.hidden = !more;
      if ('IntersectionObserver' in window) {
        watcher = new IntersectionObserver(entries => {
          for (const item of entries) {
            if (item.isIntersecting) {
              watcher.unobserve(item.target);
              void download(item.target.dataset.agLoadImage);
            }
          }
        }, { rootMargin: '250px' });
        list.querySelectorAll('[data-ag-load-image]').forEach(el => watcher.observe(el));
      } else {
        list.querySelectorAll('[data-ag-load-image]').forEach(el => void download(el.dataset.agLoadImage));
      }
    };
    const updateMedia = path => {
      if (!valid()) return;
      const url = urls.get(path);
      for (const frame of list.querySelectorAll('[data-ag-path]')) {
        if (frame.dataset.agPath !== path) continue;
        const file = items.flatMap(p => p.media || []).find(f => f.path === path);
        if (!file) continue;
        frame.replaceChildren();
        if (!url) {
          const button = document.createElement('button');
          button.textContent = '첨부 다시 불러오기';
          button.dataset.agVideo = path;
          frame.append(button);
        } else if (file.mime.startsWith('image/')) {
          const img = document.createElement('img');
          img.src = url;
          img.alt = file.name || '그룹 사진';
          img.loading = 'lazy';
          frame.append(img);
        } else {
          const video = document.createElement('video');
          video.src = url;
          video.controls = true;
          video.playsInline = true;
          video.preload = 'metadata';
          frame.append(video);
        }
      }
    };
    const download = async path => {
      if (!path || !valid() || pending.has(path) || urls.has(path)) return;
      const task = (async () => {
        try {
          const { data, error } = await client.storage.from(bucket).download(path);
          if (error) throw error;
          if (!valid()) return;
          urls.set(path, URL.createObjectURL(data));
          updateMedia(path);
        } catch (error) {
          if (!valid()) return;
          for (const frame of list.querySelectorAll('[data-ag-path]')) {
            if (frame.dataset.agPath !== path) continue;
            frame.innerHTML = `<button type="button" data-ag-video="${esc(path)}">불러오기 재시도</button>`;
          }
          say('일부 첨부 파일을 불러오지 못했어요. 다시 시도할 수 있어요.', true);
        } finally { pending.delete(path); }
      })();
      pending.set(path, task);
      return task;
    };
    async function fetchFeed(append = false) {
      if (!valid()) return;
      busy = true;
      const current = ++request;
      const last = append ? items.at(-1) : null;
      $('[data-ag-refresh]').disabled = true;
      moreButton.disabled = true;
      if (!append) { items = []; extras.clear(); list.innerHTML = '<p class="agroups-muted">글을 불러오는 중…</p>'; }
      say('그룹 글을 확인하고 있어요…');
      try {
        const rows = await rpc('feed', {
          filter, query, before: last?.created_at || null, before_id: last?.id || null
        });
        if (!valid() || current !== request) return;
        const found = Array.isArray(rows) ? rows : [];
        more = found.length > PAGE_SIZE;
        items = append ? items.concat(found.slice(0, PAGE_SIZE)) : found.slice(0, PAGE_SIZE);
        render();
        say(`그룹 글 ${items.length}개 표시 중${more ? ' · 더 보기 가능' : ''}`);
      } catch (error) {
        if (valid()) {
          if (!append) list.innerHTML = '<p class="agroups-empty">목록을 불러오지 못했어요.</p>';
          say(error.message || '조회 실패', true);
        }
      } finally {
        if (current === request) {
          busy = false;
          if (valid()) { $('[data-ag-refresh]').disabled = false; moreButton.disabled = false; }
        }
      }
    }
    const getId = element => element?.dataset.agComments || element?.dataset.agReports || element?.dataset.agResolve;
    const toggleExtra = async (id, type) => {
      const entry = items.find(p => p.id === id);
      if (!entry) return;
      const extra = getExtra(id);
      const visible = type + 'Visible';
      extra[visible] = !extra[visible];
      render();
      if (!extra[visible] || extra[type]) return;
      try {
        extra[type] = await rpc(type, { entry_id: id });
        render();
      } catch (error) { say(error.message || '내역을 불러오지 못했어요.', true); }
    };
    container.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button || button.disabled || !valid()) return;
      if (button.hasAttribute('data-ag-refresh')) { void fetchFeed(); return; }
      if (button.hasAttribute('data-ag-more')) { void fetchFeed(true); return; }
      if (button.dataset.agVideo) { button.disabled = true; await download(button.dataset.agVideo); if (button.isConnected) button.disabled = false; return; }
      const id = getId(button);
      if (!id) return;
      if (button.dataset.agComments) { void toggleExtra(id, 'comments'); return; }
      if (button.dataset.agReports) { void toggleExtra(id, 'reports'); return; }
      if (button.dataset.agResolve) {
        if (!window.confirm('이 글에 접수된 신고를 모두 처리 완료로 표시할까요?')) return;
        button.disabled = true;
        try {
          await rpc('resolve', { entry_id: id });
          const entry = items.find(p => p.id === id);
          if (entry) entry.report_count = 0;
          const extra = getExtra(id);
          extra.reports = null;
          render();
          if (extra.reportsVisible) void toggleExtra(id, 'reports').then(() => toggleExtra(id, 'reports'));
          say('신고를 처리 완료로 표시했어요.');
        } catch (error) { say(error.message || '신고 처리 실패', true); if (button.isConnected) button.disabled = false; }
      }
    });
    $('[data-ag-search]').addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      filter = form.elements.filter.value;
      query = form.elements.query.value.trim();
      void fetchFeed();
    });
    $('[data-ag-search]').elements.filter.addEventListener('change', event => {
      filter = event.target.value;
      query = $('[data-ag-search]').elements.query.value.trim();
      void fetchFeed();
    });
    void fetchFeed();
    return {
      destroy() {
        active = false;
        ++request;
        watcher?.disconnect();
        urls.forEach(url => URL.revokeObjectURL(url));
        urls.clear();
        container.replaceChildren();
      },
      refresh() { return fetchFeed(); },
      getState() { return { filter, query }; }
    };
  }

  window.OjjudaAdminGroups = { mount };
})();
