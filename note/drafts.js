/* Private Note drafts reuse the caller's existing World client and session.
 * No credentials, wallet state, uploads, or administrator APIs are stored here.
 */
(function (global) {
  'use strict';
  const MAX_REVISION = Number.MAX_SAFE_INTEGER;
  const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
  // 서버(데이터베이스)는 꾸미기 설정 같은 안쪽 항목의 순서를 다시 정렬해서 돌려줘요.
  // 순서만 다르고 내용이 같으면 같은 글로 봐야, 게시한 글이 임시 글로 다시 저장되지 않아요.
  const ordered = value => Array.isArray(value) ? value.map(ordered)
    : value && typeof value === 'object' ? Object.keys(value).sort().reduce((out, key) => { out[key] = ordered(value[key]); return out; }, {}) : value;
  const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
  const conflictError = error => error?.code === 'PT409' || error?.code === '40001' || error?.status === 409;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function content(value) {
    const style = value?.style ?? null, photoKey = value?.photo_key ?? null;
    if (!value || typeof value.body !== 'string' || typeof value.tags !== 'string'
      || value.body.length > 20000 || value.tags.length > 480
      || typeof value.background_key !== 'string' || !/^\d{2,3}$/.test(value.background_key)
      || Number(value.background_key) < 10 || Number(value.background_key) > 111
      || !['memo', 'comment'].includes(value.kind)
      || (style !== null && (typeof style !== 'object' || Array.isArray(style)
        || JSON.stringify(style).length > 512))
      || (photoKey !== null && (typeof photoKey !== 'string' || !/^\d{2,3}$/.test(photoKey)
        || Number(photoKey) < 10 || Number(photoKey) > 111))
      || (value.kind === 'memo' ? value.parent_id !== null : !uuid.test(value.parent_id || ''))) {
      throw new Error('임시 글 정보를 확인해 주세요.');
    }
    // Keep a fixed field order so equality does not depend on JSON key ordering.
    return { body: value.body, tags: value.tags, background_key: value.background_key,
      kind: value.kind, parent_id: value.parent_id, style, photo_key: photoKey };
  }
  function snapshot(value) {
    const row = Array.isArray(value) ? value[0] : value;
    const revision = Number(row?.revision);
    if (!row || !Number.isSafeInteger(revision) || revision < 0 || revision > MAX_REVISION) {
      throw new Error('임시 글 응답을 확인하지 못했어요.');
    }
    return { revision, content: row.content == null ? null : content(row.content), updated_at: row.updated_at || null };
  }
  function create(options) {
    if (typeof options?.rpc !== 'function' || typeof options?.getUserId !== 'function') {
      throw new Error('Draft controller requires the existing Note RPC and account getter');
    }
    const delay = options.debounceMs ?? 900;
    let storage = options.storage;
    if (storage === undefined) { try { storage = global.sessionStorage; } catch { storage = null; } }
    let userId = null, epoch = 0, timer = null, chain = Promise.resolve(), loadPromise = null;
    let saved = { revision: 0, content: null, updated_at: null };
    let current = null, loaded = false, dirty = false, conflict = false, publishing = false;
    let state = 'idle', message = '', backupAvailable = true;

    function key() { return `ojjuda-note-draft-v1:${userId}`; }
    function view() {
      return { state, message, hasDraft: current !== null || saved.content !== null,
        conflict, dirty, loaded, publishing, revision: saved.revision,
        content: copy(current), updated_at: saved.updated_at, backupAvailable };
    }
    function status(next, value) {
      state = next; message = value; options.onStatus?.(view());
    }
    function cancelTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
    function context() {
      if (!userId || options.getUserId() !== userId) {
        throw new Error('대문에서 로그인해 주세요.');
      }
      return { userId, epoch };
    }
    function unchanged(ctx) { return ctx.epoch === epoch && ctx.userId === userId && options.getUserId() === userId; }
    function requireCurrent(ctx) {
      if (!unchanged(ctx)) throw new Error('계정이 변경됐어요. 작성창을 다시 열어 주세요.');
    }
    function backup() {
      if (!userId || !current) return;
      try {
        if (!storage) throw new Error('Storage unavailable');
        storage.setItem(key(), JSON.stringify({ revision: saved.revision, content: current, dirty, conflict }));
        backupAvailable = true;
      } catch { backupAvailable = false; }
    }
    function removeBackup() { try { storage?.removeItem(key()); } catch { /* Do not mask a cloud result. */ } }
    function readBackup() {
      try {
        const parsed = JSON.parse(storage?.getItem(key()) || 'null');
        if (!parsed || !Number.isSafeInteger(parsed.revision) || parsed.revision < 0) return null;
        return { revision: parsed.revision, content: content(parsed.content), dirty: !!parsed.dirty, conflict: !!parsed.conflict };
      } catch { return null; }
    }
    function schedule() {
      cancelTimer();
      if (!dirty || conflict || publishing || !userId) return;
      timer = setTimeout(() => { timer = null; save().catch(() => {}); }, delay);
    }
    function queued(fn) {
      const result = chain.catch(() => {}).then(fn);
      chain = result.catch(() => {});
      return result;
    }
    async function request(name, args, ctx) {
      requireCurrent(ctx);
      let response;
      try { response = await options.rpc(name, args); }
      catch (error) { requireCurrent(ctx); throw error; }
      requireCurrent(ctx);
      // Accept either the app's unwrapped RPC or Supabase's {data,error} result.
      if (response && Object.prototype.hasOwnProperty.call(response, 'error')) {
        if (response.error) throw response.error;
        response = response.data;
      }
      return snapshot(response);
    }
    function failed(error) {
      if (conflictError(error)) {
        conflict = true; cancelTimer(); backup();
        status('conflict', '다른 창이나 기기에서 글이 바뀌었어요. 지금 입력은 유지했어요.');
      } else {
        backup();
        status('error', backupAvailable ? '서버에 보관하지 못했어요. 이 탭의 입력은 남아 있어요.'
          : '서버에 보관하지 못했어요. 창을 닫기 전에 입력을 복사해 주세요.');
      }
    }
    function setUser(nextUserId) {
      const next = nextUserId || null;
      if (next === userId) return;
      backup(); cancelTimer(); epoch++; userId = next;
      saved = { revision: 0, content: null, updated_at: null };
      current = null; loaded = false; dirty = false; conflict = false; publishing = false;
      loadPromise = null; chain = Promise.resolve();
      status('idle', next ? '작성하면 자동 보관돼요.' : '로그인하면 임시 글을 보관할 수 있어요.');
    }
    async function load() {
      if (loaded) return;
      if (loadPromise) return loadPromise;
      const ctx = context();
      loadPromise = (async () => {
        const remote = await request('read_draft', {}, ctx);
        const local = current ? { revision: saved.revision, content: current, dirty, conflict } : readBackup();
        saved = remote; loaded = true;
        if (local?.dirty || local?.conflict) {
          current = copy(local.content);
          if (same(current, remote.content)) { dirty = false; conflict = false; }
          else { dirty = true; conflict = local.conflict || local.revision !== remote.revision; }
        } else { current = copy(remote.content); dirty = false; conflict = false; }
        if (current) backup(); else removeBackup();
        if (conflict) status('conflict', '다른 창이나 기기의 글과 달라요. 입력을 확인한 뒤 불러와 주세요.');
        else status(current ? (dirty ? 'dirty' : 'saved') : 'idle', current ? (dirty ? '변경 내용 보관 대기' : '임시 보관됨') : '작성하면 자동 보관돼요.');
      })();
      try { await loadPromise; }
      finally { if (unchanged(ctx)) loadPromise = null; }
    }
    function resume(initialContent) {
      const ctx = context();
      return queued(async () => {
        requireCurrent(ctx);
        // Reopening the writer checks for another device's latest saved version.
        // Queue the read after local writes so their responses cannot race it.
        loaded = false;
        try { await load(); }
        catch (error) {
          requireCurrent(ctx);
          const local = readBackup();
          if (!current && local) {
            current = local.content; saved.revision = local.revision; dirty = local.dirty; conflict = local.conflict;
          }
          if (!current && initialContent) { current = content(initialContent); dirty = true; }
          failed(error);
        }
        requireCurrent(ctx);
        if (!current && initialContent) { current = content(initialContent); dirty = true; backup(); }
        if (dirty && loaded && !conflict) schedule();
        options.onRestore?.(copy(current));
        return copy(current);
      });
    }
    function change(value) {
      context(); const next = content(value);
      if (same(current, next)) return;
      current = next; dirty = !same(current, saved.content); backup();
      if (!conflict) status(dirty ? 'dirty' : 'saved', dirty ? '변경 내용 보관 대기' : '임시 보관됨');
      schedule();
    }
    function save() {
      cancelTimer(); const ctx = context();
      return queued(async () => {
        requireCurrent(ctx);
        try {
          await load(); requireCurrent(ctx);
          if (conflict) throw Object.assign(new Error('다른 창에서 바뀐 글을 확인해 주세요.'), { code: 'PT409' });
          if (!current || !dirty) return copy(saved);
          const sent = copy(current);
          status('saving', '보관 중…');
          const result = await request('save_draft', { p_expected_revision: saved.revision, p_content: sent }, ctx);
          saved = result; dirty = !same(current, sent); backup();
          status(dirty ? 'dirty' : 'saved', dirty ? '변경 내용 보관 대기' : '임시 보관됨');
          if (dirty) schedule();
          return copy(result);
        } catch (error) { if (unchanged(ctx)) failed(error); throw error; }
      });
    }
    function discard() {
      cancelTimer(); const ctx = context();
      return queued(async () => {
        requireCurrent(ctx);
        try {
          await load(); requireCurrent(ctx);
          if (conflict) throw Object.assign(new Error('다른 창에서 바뀐 글을 확인해 주세요.'), { code: 'PT409' });
          const result = await request('discard_draft', { p_expected_revision: saved.revision }, ctx);
          saved = result; current = null; dirty = false; conflict = false; publishing = false; removeBackup();
          status('idle', '임시 글을 지웠어요.'); return copy(result);
        } catch (error) { if (unchanged(ctx)) failed(error); throw error; }
      });
    }
    async function preparePublish() {
      const ctx = context(); cancelTimer();
      if (publishing) throw new Error('등록 결과를 확인하는 중이에요.');
      publishing = true;
      try {
        await save();
        requireCurrent(ctx);
        // Do not publish text that changed during the save request.
        if (dirty || conflict || !saved.content) throw new Error('입력이 바뀌었어요. 확인한 뒤 다시 등록해 주세요.');
        return { revision: saved.revision, content: copy(saved.content), userId, epoch };
      } catch (error) { if (unchanged(ctx)) { publishing = false; schedule(); } throw error; }
    }
    function cancelPublish() { publishing = false; schedule(); }
    function published(token) {
      cancelTimer(); const ctx = context();
      return queued(async () => {
        requireCurrent(ctx);
        if (!token || token.userId !== userId || token.epoch !== epoch) return { cleared: false };
        try {
          const result = await request('discard_draft', { p_expected_revision: token.revision }, ctx);
          saved = result; publishing = false;
          if (same(current, token.content)) { current = null; dirty = false; conflict = false; removeBackup(); }
          else { dirty = !!current; backup(); schedule(); }
          status(dirty ? 'dirty' : 'idle', dirty ? '새 입력 보관 대기' : '등록한 임시 글을 정리했어요.');
          return { cleared: true };
        } catch (error) {
          if (unchanged(ctx)) {
            publishing = false; conflict = true; backup();
            status('conflict', '글 등록은 완료됐어요. 임시 글을 다시 확인해 주세요.');
          }
          // Publication already succeeded. Never turn cleanup failure into a retry of INSERT.
          return { cleared: false, conflict: conflictError(error) };
        }
      });
    }
    function reloadRemote() {
      cancelTimer(); const ctx = context();
      return queued(async () => {
        const result = await request('read_draft', {}, ctx);
        saved = result; current = copy(result.content); loaded = true;
        dirty = false; conflict = false; publishing = false;
        if (current) backup(); else removeBackup();
        status(current ? 'saved' : 'idle', current ? '서버의 임시 글을 불러왔어요.' : '보관된 임시 글이 없어요.');
        options.onRestore?.(copy(current)); return copy(current);
      });
    }
    function online() { if (dirty && userId && !conflict && !publishing) save().catch(() => {}); }
    function leave(event) {
      if (!dirty) return;
      backup();
      if (!backupAvailable) { event.preventDefault(); event.returnValue = ''; }
    }
    global.addEventListener?.('online', online);
    global.addEventListener?.('beforeunload', leave);
    return { setUser, resume, change, save, discard, preparePublish, published, cancelPublish,
      reloadRemote, getSnapshot: view,
      destroy() { cancelTimer(); backup(); epoch++; global.removeEventListener?.('online', online); global.removeEventListener?.('beforeunload', leave); } };
  }
  global.OjjudaNoteDrafts = Object.freeze({ create });
})(window);
