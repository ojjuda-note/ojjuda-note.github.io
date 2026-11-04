/* Member recommendations use the signed-in member's existing Supabase client. */
(function (global) {
  'use strict';

  const CATEGORIES = ['한식', '중식', '일식', '양식', '분식', '디저트', '기타'];
  const REGIONS = ['서울', '경기', '인천', '강원', '충북', '충남', '세종', '대전', '전북', '전남', '광주', '경북', '경남', '대구', '울산', '부산', '제주'];
  const MIN_PHOTOS = 1, MAX_PHOTOS = 12, PAGE_SIZE = 24;
  const SOURCE_LIMIT = 20 * 1024 * 1024, OUTPUT_LIMIT = 4 * 1024 * 1024, PHOTO_EDGE = 1600;
  const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined && text !== null) el.textContent = String(text);
    return el;
  };
  const hook = (el, name) => { el.dataset.rr = name; return el; };
  const button = (text, className, name) => {
    const el = node('button', className || 'rr-button', text);
    el.type = 'button';
    return name ? hook(el, name) : el;
  };
  const textValue = value => typeof value === 'string' ? value : '';
  const dateLabel = value => {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(d);
  };
  const uid = () => global.crypto.randomUUID();
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  class DelayError extends Error {
    constructor() { super('연결이 지연되고 있어요. 잠시 후 다시 시도해 주세요.'); this.name = 'DelayError'; }
  }
  function timed(promise, ms = 18000, onTimeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { onTimeout?.(); reject(new DelayError()); }, ms);
      Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  }
  function locationFrom(value) {
    if (!value || typeof value.latitude !== 'number' || typeof value.longitude !== 'number' || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) || Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) return null;
    return { latitude: value.latitude, longitude: value.longitude };
  }
  function mapLink(name, address, location = null) {
    const point = locationFrom(location);
    const link = node('a', 'rr-button rr-map-link', point ? '선택한 지도 위치 보기 ↗' : '지도에서 찾기 ↗');
    link.href = point ? 'https://map.kakao.com/link/map/' + encodeURIComponent(name || '추천 맛집') + ',' + point.latitude + ',' + point.longitude : 'https://map.kakao.com/?q=' + encodeURIComponent([address, name].filter(Boolean).join(' '));
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', (name || '입력한 주소') + (point ? ' 선택한 지도 위치 보기, 새 창' : ' 지도에서 찾기, 새 창'));
    return link;
  }
  function optionSelect(values, placeholder) {
    const select = node('select', 'rr-input');
    if (placeholder) { const first = node('option', '', placeholder); first.value = ''; select.append(first); }
    values.forEach(value => { const option = node('option', '', value); option.value = value; select.append(option); });
    return select;
  }
  function friendlyError(error, fallback) {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (/auth|login|session|jwt|permission|forbidden|42501|not_authenticated|not_member|sign_in_required|member_unavailable/i.test(code + ' ' + message)) return '로그인 상태를 확인한 뒤 다시 열어 주세요.';
    if (/conflict|stale|version|updated/i.test(code + ' ' + message)) return '이 글이 다른 화면에서 변경됐어요. 최신 글을 확인한 뒤 다시 수정해 주세요.';
    if (error?.name === 'DelayError') return error.message;
    return fallback;
  }
  async function resizePhoto(file) {
    if (!file?.size) throw new Error('비어 있는 파일이에요. 다른 사진을 골라 주세요.');
    if (file.size > SOURCE_LIMIT) throw new Error('사진 한 장은 20MB 이하로 골라 주세요.');
    if (file.type && !MIME_TYPES.includes(file.type.toLowerCase())) throw new Error('JPG·PNG·WEBP 사진만 올릴 수 있어요.');
    const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!isJpeg && !isPng && !isWebp) throw new Error('JPG·PNG·WEBP 사진 파일인지 확인해 주세요.');
    let decoded, objectUrl;
    try {
      if (typeof global.createImageBitmap === 'function') decoded = await global.createImageBitmap(file, { imageOrientation: 'from-image' });
      else {
        objectUrl = URL.createObjectURL(file);
        decoded = new Image(); decoded.src = objectUrl;
        if (decoded.decode) await decoded.decode();
        else await new Promise((resolve, reject) => { decoded.onload = resolve; decoded.onerror = reject; });
      }
      const width = decoded.width || decoded.naturalWidth, height = decoded.height || decoded.naturalHeight;
      if (!width || !height || width * height > 64000000) throw new Error('사진 해상도가 너무 커요. 크기를 줄여 다시 골라 주세요.');
      const ratio = Math.min(1, PHOTO_EDGE / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('사진을 준비하지 못했어요. 다시 시도해 주세요.');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(decoded, 0, 0, canvas.width, canvas.height);
      const encode = quality => new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('사진을 준비하지 못했어요.')), 'image/jpeg', quality));
      let blob = await encode(.86);
      if (blob.size > OUTPUT_LIMIT) blob = await encode(.68);
      if (!blob.size || blob.size > OUTPUT_LIMIT) throw new Error('사진 용량을 줄이지 못했어요. 다른 사진을 골라 주세요.');
      return blob;
    } catch (error) {
      if (error instanceof Error && /사진|해상도|용량/.test(error.message)) throw error;
      throw new Error('이 사진을 열 수 없어요. 다른 JPG·PNG·WEBP 사진을 골라 주세요.');
    } finally {
      decoded?.close?.();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  function create({ client, getUser, notify = () => {}, onLogin, returnLabel = '' } = {}) {
    let current = null, destroyed = false, authSubscription = null;
    let mapGeneration = 0;
    const mapReads = new Set(), changeListeners = new Set();
    const ratings = global.OjjudaRestaurantRatings?.create({ client, getUser }) || null;
    const photoUrls = new Map();
    const cleanupQueues = new Map(), cleanupLocks = new Set();
    const cleanupKey = owner => 'ojjuda.restaurant-photo-cleanup.v1.' + owner;
    const memberId = () => {
      const user = getUser?.();
      return user?.id && !user.is_anonymous ? String(user.id) : null;
    };
    let observedMember = memberId();
    const active = session => !destroyed && current === session && !session.disposed && memberId() === session.owner;
    const check = session => { if (!active(session) || !session.owner) throw new Error('계정이 바뀌었어요. 추천맛집을 다시 열어 주세요.'); };
    const visible = (session, view) => active(session) && session.view === view;
    function cancelMapReads() {
      mapGeneration += 1;
      for (const controller of mapReads) controller.abort();
      mapReads.clear();
    }
    function changed() {
      if (destroyed || !memberId()) return;
      for (const listener of changeListeners) { try { listener(); } catch { /* A closed directory cannot interrupt a saved recommendation. */ } }
    }
    function observeAuth() {
      if (authSubscription || !client?.auth?.onAuthStateChange) return;
      const result = client.auth.onAuthStateChange((event, authSession) => {
        const next = authSession?.user?.id && !authSession.user.is_anonymous ? String(authSession.user.id) : null;
        if (event === 'SIGNED_OUT' || (authSession?.user && next !== observedMember)) cancelMapReads();
        if (event === 'SIGNED_OUT' || authSession?.user) observedMember = next;
        const session = current;
        if (!session) return;
        const changed = event === 'SIGNED_OUT' || (authSession?.user && (authSession.user.id !== session.owner || authSession.user.is_anonymous));
        if (changed) queueMicrotask(() => { if (current === session) close(true); });
      });
      authSubscription = result?.data?.subscription || null;
    }
    async function read(session, name, args) {
      check(session);
      const controller = new AbortController(); session.reads.add(controller);
      try {
        let request = client.rpc(name, args);
        if (request?.abortSignal) request = request.abortSignal(controller.signal);
        const result = await timed(request, 18000, () => controller.abort());
        check(session);
        if (result.error) throw result.error;
        return result.data;
      } finally { session.reads.delete(controller); }
    }

    /* All persistence names and payloads live here; no draft is published locally. */
    const api = {
      bucket: 'restaurant-recommendations',
      path(owner, post, photo) { return owner + '/' + post + '/' + photo + '.jpg'; },
      async list(session, offset) {
        return read(session, 'list_restaurant_recommendations', { p_query: session.filters.query || '', p_category: session.filters.category || null, p_region: session.filters.region || null, p_mine: session.filters.mine, p_limit: PAGE_SIZE, p_offset: offset });
      },
      async detail(session, id) { return read(session, 'get_restaurant_recommendation', { p_id: id }); },
      save(payload) { return client.rpc('save_restaurant_recommendation_with_location', payload); },
      remove(id, updatedAt) { return client.rpc('delete_restaurant_recommendation', { p_id: id, p_expected_updated_at: updatedAt || null }); }
    };
    function rowFrom(value) {
      const raw = value?.item || value?.restaurant || value?.row || (Array.isArray(value) ? value[0] : value);
      if (!raw?.id) return null;
      const location = locationFrom(raw);
      return { ...raw, id: String(raw.id), owner_id: textValue(raw.owner_id || raw.user_id), name: textValue(raw.name), category: textValue(raw.category), region: textValue(raw.region), address: textValue(raw.address), latitude: location?.latitude ?? null, longitude: location?.longitude ?? null, menu: Array.isArray(raw.menu) ? raw.menu.join(', ') : textValue(raw.menu || raw.recommended_menu), reason: textValue(raw.reason || raw.recommendation), photos: (Array.isArray(raw.photos) ? raw.photos : Array.isArray(raw.photo_paths) ? raw.photo_paths : []).map(photo => typeof photo === 'string' ? photo : photo?.path).filter(path => typeof path === 'string'), author_name: textValue(raw.author_name || raw.nickname) || '회원', updated_at: raw.updated_at || null };
    }
    function rowsFrom(data) { return (Array.isArray(data) ? data : data?.items || data?.rows || data?.restaurants || []).map(rowFrom).filter(Boolean); }
    async function getMapPage({ offset = 0, limit = 50 } = {}) {
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new Error('recommendation_invalid_input');
      const owner = memberId();
      if (destroyed || !owner || typeof client?.rpc !== 'function') throw new Error('sign_in_required');
      observeAuth();
      const generation = mapGeneration, controller = new AbortController();
      const checkMember = () => { if (destroyed || controller.signal.aborted || generation !== mapGeneration || memberId() !== owner) throw new Error('recommendation_session_changed'); };
      mapReads.add(controller);
      try {
        checkMember();
        let request = client.rpc('list_restaurant_recommendations', { p_query: '', p_category: null, p_region: null, p_mine: false, p_limit: limit, p_offset: offset });
        if (typeof request?.abortSignal === 'function') request = request.abortSignal(controller.signal);
        const result = await timed(request, 18000, () => controller.abort());
        checkMember();
        if (result?.error) throw result.error;
        const data = result?.data;
        if (!data || !Array.isArray(data.rows) || data.rows.length > limit || !Number.isSafeInteger(data.total) || data.total < 0) throw new Error('recommendation_response_invalid');
        // The existing member RPC cannot request a page starting after offset 10000.
        if (data.total > 10050) throw new Error('recommendation_map_limit');
        const rows = data.rows.map(raw => {
          const row = rowFrom(raw);
          if (!row || !UUID.test(row.id)) throw new Error('recommendation_response_invalid');
          return { id: row.id, name: row.name, category: row.category, region: row.region, address: row.address, menu: row.menu, latitude: row.latitude, longitude: row.longitude, created_at: typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at)) ? row.created_at : null };
        });
        const hasMore = offset + rows.length < data.total;
        if (hasMore && !rows.length) throw new Error('recommendation_response_invalid');
        if (hasMore && offset + rows.length > 10000) throw new Error('recommendation_map_limit');
        return { rows, total: data.total, offset, limit, hasMore };
      } finally { mapReads.delete(controller); }
    }
    function own(session, row) { return active(session) && row?.owner_id === session.owner; }
    function validPath(path) {
      if (typeof path !== 'string') return false;
      const parts = path.split('/');
      return parts.length === 3 && UUID.test(parts[0]) && UUID.test(parts[1]) && parts[2].endsWith('.jpg') && UUID.test(parts[2].slice(0, -4));
    }
    function clearPhotoUrls() {
      for (const entry of photoUrls.values()) if (entry.url) URL.revokeObjectURL(entry.url);
      photoUrls.clear();
    }
    function cleanupQueue(owner) {
      if (!UUID.test(owner || '')) return new Set();
      if (!cleanupQueues.has(owner)) {
        let saved = [];
        try { saved = JSON.parse(global.localStorage.getItem(cleanupKey(owner)) || '[]'); } catch {}
        cleanupQueues.set(owner, new Set((Array.isArray(saved) ? saved.slice(0, 2000) : []).filter(path => validPath(path) && path.startsWith(owner + '/'))));
      }
      return cleanupQueues.get(owner);
    }
    function rememberCleanup(owner) {
      if (!UUID.test(owner || '')) return;
      const paths = [...cleanupQueue(owner)];
      try { if (paths.length) global.localStorage.setItem(cleanupKey(owner), JSON.stringify(paths)); else global.localStorage.removeItem(cleanupKey(owner)); } catch { /* The in-memory queue still supports retry when storage is unavailable. */ }
    }
    function renderCleanup(session) {
      if (!active(session) || !session.owner || !session.cleanupStatus) return;
      const pending = cleanupQueue(session.owner).size;
      session.cleanupStatus.hidden = !pending; session.cleanupStatus.replaceChildren();
      if (!pending) return;
      const running = cleanupLocks.has(session.owner);
      session.cleanupStatus.append(node('span', '', running ? '사진을 정리하고 있어요…' : '사진 일부 정리가 남아 있어요. 다시 시도할 수 있어요.'));
      const retry = button('사진 정리 다시 시도', 'rr-link-button', 'cleanup-retry'); retry.disabled = running;
      retry.onclick = () => void flushCleanup(session); session.cleanupStatus.append(retry);
    }
    function queueCleanup(session, paths) {
      if (!active(session) || !session.owner) return;
      const pending = cleanupQueue(session.owner);
      for (const path of paths || []) if (validPath(path) && path.startsWith(session.owner + '/')) pending.add(path);
      rememberCleanup(session.owner); renderCleanup(session);
    }
    async function flushCleanup(session) {
      if (!active(session) || !session.owner || cleanupLocks.has(session.owner)) return false;
      const owner = session.owner, pending = cleanupQueue(owner), paths = [...pending].slice(0, 100);
      if (!paths.length) { renderCleanup(session); return true; }
      cleanupLocks.add(owner); renderCleanup(session);
      let success = false;
      try {
        check(session);
        const result = await timed(client.storage.from(api.bucket).remove(paths));
        if (result?.error) throw result.error;
        if (memberId() !== owner) return false;
        paths.forEach(path => pending.delete(path)); rememberCleanup(owner); success = true;
      } catch { /* Keep exact paths for this member's next explicit or opening retry. */ }
      finally {
        cleanupLocks.delete(owner);
        if (current?.owner === owner && active(current)) renderCleanup(current);
      }
      if (success && pending.size && current?.owner === owner && active(current)) void flushCleanup(current);
      return success;
    }
    function discardDraftPhotos(session, editor) {
      if (!editor || editor.uncertain || editor.saving || !active(session)) return;
      const paths = editor.photos.filter(photo => photo.path && photo.uploaded && !editor.originalPaths.includes(photo.path)).map(photo => photo.path);
      if (paths.length) { queueCleanup(session, paths); void flushCleanup(session); }
    }
    async function photoUrl(session, path, refresh = false) {
      check(session);
      if (!validPath(path)) throw new Error('사진을 찾지 못했어요.');
      const key = session.owner + ':' + path, view = session.view, cached = photoUrls.get(key);
      if (!refresh && cached) return cached.promise;
      if (cached?.url) URL.revokeObjectURL(cached.url);
      const entry = {};
      entry.promise = (async () => {
        const { data, error } = await timed(client.storage.from(api.bucket).download(path));
        check(session);
        if (!visible(session, view) || photoUrls.get(key) !== entry) throw new Error('사진 화면이 바뀌었어요.');
        if (error || !data?.size) throw new Error('사진을 불러오지 못했어요.');
        entry.url = URL.createObjectURL(data);
        return entry.url;
      })().catch(error => { if (photoUrls.get(key) === entry) photoUrls.delete(key); throw error; });
      photoUrls.set(key, entry);
      return entry.promise;
    }
    function picture(session, view, path, alt, { local = false, retry = true, className = '' } = {}) {
      const frame = node('div', 'rr-picture ' + className), img = node('img');
      // Lazy loading can wait for visibility, but this image stays hidden until load.
      img.alt = alt; img.decoding = 'async'; img.loading = 'eager';
      const status = node('span', 'rr-picture-status', '사진을 불러오는 중…');
      frame.append(img, status); img.hidden = true;
      let attempt = 0;
      const load = async refresh => {
        const token = ++attempt;
        status.replaceChildren(document.createTextNode('사진을 불러오는 중…')); status.hidden = false; img.hidden = true;
        try {
          const url = local ? path : await photoUrl(session, path, refresh);
          if (!visible(session, view) || token !== attempt) return;
          img.onload = () => { if (visible(session, view) && token === attempt) { img.hidden = false; status.hidden = true; } };
          img.onerror = () => failure(token);
          img.src = url;
        } catch { failure(token); }
      };
      const failure = token => {
        if (!visible(session, view) || token !== attempt) return;
        img.hidden = true; status.hidden = false; status.replaceChildren(document.createTextNode('사진을 불러오지 못했어요.'));
        if (retry && !local) { const again = button('사진 다시 보기', 'rr-link-button', 'photo-retry'); again.onclick = () => void load(true); status.append(again); }
      };
      void load(false);
      return frame;
    }
    function releaseEditor(editor) {
      if (!editor) return;
      editor.disposed = true;
      editor.picker?.close(); editor.picker = null;
      for (const photo of editor.photos) if (photo.localUrl) URL.revokeObjectURL(photo.localUrl);
      editor.photos = [];
    }
    function resetView(session, kind, title) {
      session.view += 1; session.screen = kind;
      session.ratingEditor?.dispose(); session.ratingEditor = null;
      for (const request of session.reads) request.abort(); session.reads.clear();
      clearPhotoUrls();
      session.body.replaceChildren(); session.body.scrollTop = 0;
      session.heading.textContent = title;
      session.back.hidden = kind === 'list';
      session.body.dataset.rr = kind;
      return session.view;
    }
    function statusBlock(message, retry) {
      const box = node('div', 'rr-state');
      const text = node('p', '', message); text.setAttribute('role', 'status'); box.append(text);
      if (retry) { const action = button('다시 불러오기', 'rr-button', 'reload'); action.onclick = retry; box.append(action); }
      return box;
    }
    function updateCount(session) {
      if (!session.listCount) return;
      session.listCount.textContent = session.total === null ? '추천 ' + session.rows.length + '곳' : '추천 ' + session.total.toLocaleString('ko-KR') + '곳';
    }
    function renderCard(session, view, row) {
      const article = node('article', 'rr-card'), openButton = button('', 'rr-card-open', 'card');
      openButton.dataset.id = row.id;
      openButton.setAttribute('aria-label', row.name + ' 추천 글 보기');
      if (row.photos[0]) openButton.append(picture(session, view, row.photos[0], row.name + ' 대표 사진', { retry: false, className: 'rr-card-picture' }));
      else openButton.append(node('span', 'rr-card-empty-photo', '사진을 확인해 주세요'));
      const body = node('span', 'rr-card-body'), meta = node('span', 'rr-card-meta');
      meta.append(node('span', 'rr-category', row.category || '기타'), node('span', '', row.region));
      body.append(meta, node('strong', 'rr-card-name', row.name), node('span', 'rr-card-address', row.address));
      if (row.menu) body.append(node('span', 'rr-card-menu', row.menu));
      if (ratings) {
        const rating = node('span'); rating.dataset.rrRatingId = row.id;
        global.OjjudaRestaurantRatings.renderSummary(rating, undefined); body.append(rating);
      }
      const author = node('span', 'rr-card-author');
      author.append(node('span', '', row.author_name), node('span', '', dateLabel(row.created_at)));
      body.append(author); openButton.append(body); openButton.onclick = () => void showDetail(session, row.id); article.append(openButton);
      return article;
    }
    async function loadListRatings(session, view, rows) {
      if (!ratings || !rows.length || !visible(session, view)) return;
      const wanted = new Set(rows.map(row => row.id));
      const targets = [...session.grid.querySelectorAll('[data-rr-rating-id]')].filter(el => wanted.has(el.dataset.rrRatingId));
      try {
        const summaries = await ratings.getSummaries('recommended', [...wanted]);
        if (!visible(session, view)) return;
        const byId = new Map(summaries.map(summary => [summary.id, summary]));
        for (const target of targets) if (session.grid.contains(target)) global.OjjudaRestaurantRatings.renderSummary(target, byId.get(target.dataset.rrRatingId) || null);
      } catch {
        if (visible(session, view)) for (const target of targets) if (session.grid.contains(target)) global.OjjudaRestaurantRatings.renderSummary(target, null);
      }
    }
    async function loadList(session, append = false) {
      if (!active(session) || session.screen !== 'list' || session.listBusy) return;
      const view = session.view, version = ++session.listVersion, offset = append ? session.rows.length : 0;
      session.listBusy = true; session.listError.replaceChildren(); session.more.disabled = true;
      if (!append) { session.grid.replaceChildren(statusBlock('추천 맛집을 불러오는 중이에요…')); session.rows = []; session.total = null; updateCount(session); }
      try {
        const data = await api.list(session, offset);
        if (!visible(session, view) || version !== session.listVersion) return;
        const rows = rowsFrom(data);
        if (!append) session.grid.replaceChildren();
        const seen = new Set(session.rows.map(row => row.id));
        for (const row of rows) if (!seen.has(row.id)) { session.rows.push(row); seen.add(row.id); session.grid.append(renderCard(session, view, row)); }
        void loadListRatings(session, view, rows);
        session.total = Number.isFinite(Number(data?.total)) ? Number(data.total) : null;
        session.hasMore = typeof data?.has_more === 'boolean' ? data.has_more : session.total !== null ? session.rows.length < session.total : rows.length === PAGE_SIZE;
        updateCount(session);
        if (!session.rows.length) {
          const filtered = session.filters.query || session.filters.category || session.filters.region || session.filters.mine;
          const empty = statusBlock(filtered ? '조건에 맞는 추천 맛집이 없어요.' : '아직 올라온 추천 맛집이 없어요.');
          empty.prepend(node('span', 'rr-empty-symbol', '🍽'));
          const next = button(filtered ? '검색 조건 지우기' : '첫 맛집 추천하기', 'rr-button rr-primary', filtered ? 'clear-filters' : 'compose');
          next.onclick = () => { if (filtered) { session.filters = { query: '', category: '', region: '', mine: false }; showList(session); } else showEditor(session); };
          empty.append(next); session.grid.append(empty);
        }
      } catch (error) {
        if (!visible(session, view) || version !== session.listVersion) return;
        const target = append ? session.listError : session.grid;
        target.replaceChildren(statusBlock(friendlyError(error, '추천 맛집을 불러오지 못했어요. 연결을 확인해 주세요.'), () => void loadList(session, append)));
      } finally {
        if (visible(session, view) && version === session.listVersion) { session.listBusy = false; session.more.disabled = false; session.more.hidden = !session.hasMore || !session.rows.length; }
      }
    }
    function showList(session) {
      if (!active(session)) return;
      discardDraftPhotos(session, session.editor);
      releaseEditor(session.editor); session.editor = null; session.detail = null;
      const view = resetView(session, 'list', '추천맛집');
      session.listBusy = false; session.hasMore = false;
      const intro = node('section', 'rr-intro');
      intro.append(node('p', 'rr-eyebrow', '함께 찾은 맛집'), node('h2', '', '회원들이 직접 추천한 맛집'), node('p', 'rr-intro-copy', '좋았던 한 끼를 사진과 함께 나눠 주세요.'));
      const compose = button('+ 맛집 추천하기', 'rr-button rr-primary', 'compose'); compose.onclick = () => showEditor(session); intro.append(compose);
      const search = node('form', 'rr-search'); search.setAttribute('role', 'search');
      const searchInput = hook(node('input', 'rr-input'), 'search-input'); searchInput.type = 'search'; searchInput.maxLength = 100; searchInput.placeholder = '가게명·메뉴·주소 검색'; searchInput.setAttribute('aria-label', '추천 맛집 검색'); searchInput.value = session.filters.query;
      const searchButton = button('검색', 'rr-button rr-search-button', 'search-submit'); searchButton.type = 'submit';
      search.append(searchInput, searchButton); search.onsubmit = event => { event.preventDefault(); session.filters.query = searchInput.value.trim(); showList(session); };
      const categories = node('div', 'rr-categories'); categories.setAttribute('aria-label', '음식 분류');
      ['', ...CATEGORIES].forEach(category => {
        const item = button(category || '전체', 'rr-chip', 'category-filter'); item.dataset.category = category; item.setAttribute('aria-pressed', String(session.filters.category === category));
        item.onclick = () => { session.filters.category = category; showList(session); }; categories.append(item);
      });
      const filters = node('div', 'rr-filters'), region = hook(optionSelect(REGIONS, '전국'), 'region-filter'); region.value = session.filters.region; region.setAttribute('aria-label', '지역 선택'); region.onchange = () => { session.filters.region = region.value; showList(session); };
      const mine = button('내가 추천한 곳', 'rr-chip rr-mine', 'mine-filter'); mine.setAttribute('aria-pressed', String(session.filters.mine)); mine.onclick = () => { session.filters.mine = !session.filters.mine; showList(session); };
      filters.append(region, mine);
      const toolbar = node('div', 'rr-list-toolbar'); session.listCount = node('p', 'rr-list-count', '추천 맛집');
      const refresh = button('새로고침', 'rr-link-button', 'reload'); refresh.onclick = () => { if (!session.listBusy) void loadList(session); }; toolbar.append(session.listCount, refresh);
      session.grid = node('div', 'rr-grid'); session.listError = node('div', 'rr-list-error');
      session.more = button('더 보기', 'rr-button rr-more', 'load-more'); session.more.hidden = true; session.more.onclick = () => void loadList(session, true);
      session.body.append(intro, search, categories, filters, toolbar, session.grid, session.listError, session.more);
      if (visible(session, view)) void loadList(session);
    }

    async function showDetail(session, id) {
      if (!active(session)) return;
      discardDraftPhotos(session, session.editor);
      releaseEditor(session.editor); session.editor = null;
      const view = resetView(session, 'detail', '맛집 이야기');
      session.body.append(statusBlock('추천 글을 불러오는 중이에요…'));
      try {
        const row = rowFrom(await api.detail(session, id));
        if (!visible(session, view)) return;
        if (!row) { session.body.replaceChildren(statusBlock('이 추천 글을 찾을 수 없어요.')); return; }
        renderDetail(session, row);
      } catch (error) {
        if (visible(session, view)) session.body.replaceChildren(statusBlock(friendlyError(error, '추천 글을 불러오지 못했어요.'), () => void showDetail(session, id)));
      }
    }
    function renderDetail(session, row) {
      const view = resetView(session, 'detail', '맛집 이야기'); session.detail = row;
      const gallery = node('section', 'rr-gallery'); gallery.setAttribute('aria-label', row.name + ' 사진');
      const hero = hook(node('div', 'rr-gallery-hero'), 'gallery-image'), controls = node('div', 'rr-gallery-controls');
      const previous = button('←', 'rr-gallery-arrow', 'gallery-prev'), next = button('→', 'rr-gallery-arrow', 'gallery-next'), counter = node('span', 'rr-gallery-counter');
      previous.setAttribute('aria-label', '이전 사진'); next.setAttribute('aria-label', '다음 사진'); counter.setAttribute('aria-live', 'polite');
      const thumbs = node('div', 'rr-thumbnails'); let index = 0;
      const display = selected => {
        if (!visible(session, view) || !row.photos.length) return;
        index = (selected + row.photos.length) % row.photos.length;
        hero.replaceChildren(picture(session, view, row.photos[index], row.name + ' 사진 ' + (index + 1)));
        counter.textContent = (index + 1) + ' / ' + row.photos.length;
        [...thumbs.children].forEach((item, i) => item.setAttribute('aria-pressed', String(i === index)));
      };
      row.photos.forEach((path, i) => { const thumb = button('', 'rr-thumbnail'); thumb.setAttribute('aria-label', (i + 1) + '번째 사진 보기'); thumb.append(picture(session, view, path, '', { retry: false })); thumb.onclick = () => display(i); thumbs.append(thumb); });
      previous.onclick = () => display(index - 1); next.onclick = () => display(index + 1);
      previous.disabled = next.disabled = row.photos.length < 2;
      controls.append(previous, counter, next); gallery.append(hero, controls, thumbs);
      if (row.photos.length) display(0); else hero.append(statusBlock('사진을 찾지 못했어요.'));
      const content = node('div', 'rr-detail-content'), meta = node('div', 'rr-detail-meta'); meta.append(node('span', 'rr-category', row.category), node('span', '', row.region));
      content.append(meta, node('h2', 'rr-detail-name', row.name), node('p', 'rr-detail-author', row.author_name + (dateLabel(row.created_at) ? ' · ' + dateLabel(row.created_at) : '')));
      if (ratings) {
        const ratingSection = node('section'); content.append(ratingSection);
        session.ratingEditor = global.OjjudaRestaurantRatings.mountEditor(ratingSection, {
          name: row.name,
          load: async () => (await ratings.getSummaries('recommended', [row.id])).find(summary => summary.id === row.id),
          save: score => ratings.setRating('recommended', row.id, score),
          isCurrent: () => visible(session, view),
          onChange: changed
        });
      }
      const address = node('section', 'rr-detail-section'); address.append(node('h3', '', '위치'), node('p', '', row.address), mapLink(row.name, row.address, row));
      const menu = node('section', 'rr-detail-section'); menu.append(node('h3', '', '추천 메뉴'), node('p', '', row.menu));
      const reason = node('section', 'rr-detail-section'); reason.append(node('h3', '', '이래서 추천해요'), node('p', 'rr-reason', row.reason));
      content.append(address, menu, reason);
      if (own(session, row)) {
        const actions = node('div', 'rr-owner-actions'), edit = button('수정', 'rr-button', 'edit'), remove = button('삭제', 'rr-button rr-danger-text', 'delete');
        edit.onclick = () => { if (own(session, row) && !session.busy) showEditor(session, row); };
        remove.onclick = () => void deletePost(session, row); actions.append(edit, remove); content.append(actions);
      }
      session.body.append(gallery, content);
    }

    function field(name, labelText, type, value, maxLength, placeholder) {
      const wrap = node('label', 'rr-field'), title = node('span', 'rr-field-title', labelText);
      const control = type === 'category' ? optionSelect(CATEGORIES, '분류를 골라 주세요') : type === 'region' ? optionSelect(REGIONS, '지역을 골라 주세요') : node(type === 'textarea' ? 'textarea' : 'input', 'rr-input');
      hook(control, 'field-' + name); control.name = name; control.required = true; control.value = value || '';
      if (control.tagName === 'INPUT') control.type = 'text';
      if (maxLength) control.maxLength = maxLength;
      if (placeholder) control.placeholder = placeholder;
      if (type === 'textarea') control.rows = 5;
      wrap.append(title, control); return { wrap, control };
    }
    function formMessage(editor, text, error = false) {
      if (editor.disposed) return;
      editor.status.textContent = text; editor.status.classList.toggle('rr-error', error);
    }
    function editorControls(session, editor) {
      if (!active(session) || session.editor !== editor || editor.disposed) return;
      const locked = editor.processing || editor.saving || !!editor.uncertain || !!editor.picker;
      editor.form.querySelectorAll('input,select,textarea,button').forEach(control => { control.disabled = locked; });
      editor.submit.disabled = locked || editor.photos.length < MIN_PHOTOS || editor.photos.length > MAX_PHOTOS;
      editor.submit.textContent = editor.saving ? '저장하는 중…' : editor.existing ? '수정 내용 저장' : '추천 등록';
      editor.add.disabled = locked || editor.photos.length >= MAX_PHOTOS;
      editor.reconcile.hidden = !editor.uncertain; editor.reconcile.disabled = editor.saving;
      editor.count.textContent = editor.photos.length + ' / ' + MAX_PHOTOS + '장';
    }
    function photoGrid(session, editor) {
      const view = session.view; editor.photoGrid.replaceChildren();
      editor.photos.forEach((photo, index) => {
        const tile = node('div', 'rr-edit-photo'); tile.dataset.key = photo.key;
        tile.append(picture(session, view, photo.localUrl || photo.path, '선택한 사진 ' + (index + 1), { local: !!photo.localUrl, retry: !photo.localUrl }));
        if (index === 0) tile.append(node('span', 'rr-cover-label', '대표'));
        const remove = button('×', 'rr-remove-photo', 'photo-remove'); remove.dataset.key = photo.key; remove.setAttribute('aria-label', (index + 1) + '번째 사진 삭제');
        remove.onclick = () => {
          if (!active(session) || session.editor !== editor || editor.processing || editor.saving || editor.uncertain) return;
          editor.photos = editor.photos.filter(item => item !== photo);
          if (photo.path && photo.uploaded && !editor.originalPaths.includes(photo.path)) { queueCleanup(session, [photo.path]); void flushCleanup(session); }
          if (photo.localUrl) URL.revokeObjectURL(photo.localUrl);
          editor.dirty = true; photoGrid(session, editor); editorControls(session, editor);
          formMessage(editor, editor.photos.length < MIN_PHOTOS ? '사진을 ' + MIN_PHOTOS + '장 이상 골라 주세요.' : '');
        };
        tile.append(remove);
        if (index > 0) {
          const cover = button('대표로', 'rr-cover-button', 'photo-cover'); cover.dataset.key = photo.key;
          cover.onclick = () => { if (editor.processing || editor.saving || editor.uncertain || !active(session)) return; editor.photos = [photo, ...editor.photos.filter(item => item !== photo)]; editor.dirty = true; photoGrid(session, editor); editorControls(session, editor); };
          tile.append(cover);
        }
        editor.photoGrid.append(tile);
      });
    }
    async function addPhotos(session, editor, files) {
      if (!active(session) || session.editor !== editor || editor.processing || editor.saving || editor.uncertain) return;
      const capacity = MAX_PHOTOS - editor.photos.length;
      if (capacity <= 0) { formMessage(editor, '사진은 최대 ' + MAX_PHOTOS + '장까지 올릴 수 있어요.', true); return; }
      const list = Array.from(files), selected = list.slice(0, capacity), errors = [];
      if (list.length > capacity) errors.push('사진은 최대 ' + MAX_PHOTOS + '장까지 올릴 수 있어요.');
      editor.processing = true; editorControls(session, editor);
      for (let i = 0; i < selected.length; i += 1) {
        if (!active(session) || session.editor !== editor) break;
        const file = selected[i], signature = [file.name, file.size, file.lastModified].join(':');
        if (editor.photos.some(photo => photo.signature === signature)) { errors.push('이미 고른 사진은 한 번만 추가했어요.'); continue; }
        formMessage(editor, '사진을 준비하는 중이에요… ' + (i + 1) + '/' + selected.length);
        try {
          const blob = await resizePhoto(file);
          if (!active(session) || session.editor !== editor || editor.disposed) break;
          const photo = { key: uid(), signature, blob, localUrl: URL.createObjectURL(blob), path: null, uploaded: false };
          editor.photos.push(photo); editor.dirty = true; photoGrid(session, editor); editorControls(session, editor); await tick();
        } catch (error) { errors.push(error.message); }
      }
      editor.processing = false;
      if (active(session) && session.editor === editor) {
        editorControls(session, editor);
        formMessage(editor, [...new Set(errors)].join(' ') || (editor.photos.length < MIN_PHOTOS ? '사진을 ' + MIN_PHOTOS + '장 이상 골라 주세요.' : '사진 준비가 끝났어요.'), errors.length > 0);
      }
    }
    function renderLocation(editor, message = '지역·주소를 확인해 주세요.') {
      editor.locationOpen.textContent = editor.location ? '지도 위치 변경' : '지도에서 위치 선택';
      editor.locationClear.hidden = !editor.location;
      editor.locationStatus.textContent = editor.location ? '지도 위치 선택 완료 · ' + message : '지도 위치가 없으면 지도 핀이 표시되지 않고 거리순에서는 맨 뒤에 나와요. 지도에서 위치를 선택해 주세요.';
    }
    async function chooseLocation(session, editor) {
      if (!active(session) || session.editor !== editor || editor.disposed || editor.processing || editor.saving || editor.uncertain || editor.picker) return;
      if (!global.OjjudaRestaurantLocationPicker?.open) { formMessage(editor, '지도를 불러오지 못했어요. 맛집 화면을 다시 열어 주세요.', true); return; }
      let picker;
      try {
        picker = global.OjjudaRestaurantLocationPicker.open({
          name: editor.fields.name.value.trim(), region: editor.fields.region.value, location: editor.location,
          isCurrent: () => active(session) && session.editor === editor && !editor.disposed && !editor.saving && !editor.processing
        });
        editor.picker = picker; editorControls(session, editor);
        const selected = await picker.result;
        if (!active(session) || session.editor !== editor || editor.disposed || editor.picker !== picker) return;
        if (selected !== null) {
          const point = locationFrom(selected);
          if (!point) throw new Error('invalid_location');
          const region = textValue(selected.region).trim(), address = textValue(selected.address).trim();
          const hasRegion = REGIONS.includes(region), hasAddress = address.length >= 5 && address.length <= 200;
          if (hasRegion) { editor.fields.region.value = region; editor.fields.region.setCustomValidity(''); }
          if (hasAddress) { editor.fields.address.value = address; editor.fields.address.setCustomValidity(''); }
          const message = hasRegion && hasAddress ? '지역·주소를 자동으로 입력했어요. 상세 주소를 확인해 주세요.'
            : hasRegion ? '지역을 입력했어요. 주소는 직접 입력해 주세요.'
            : hasAddress ? '주소를 입력했어요. 지역은 직접 선택해 주세요.'
            : '주소를 찾지 못했어요. 지역·주소를 직접 입력해 주세요.';
          editor.location = point; editor.locationAddress = editor.fields.address.value.trim(); editor.locationRegion = editor.fields.region.value; editor.dirty = true; renderLocation(editor, message);
          formMessage(editor, message);
        }
      } catch {
        if (active(session) && session.editor === editor && !editor.disposed) formMessage(editor, '지도 위치를 선택하지 못했어요. 다시 시도해 주세요.', true);
      } finally {
        if (editor.picker === picker) editor.picker = null;
        if (active(session) && session.editor === editor && !editor.disposed) { editorControls(session, editor); editor.locationOpen.focus({ preventScroll: true }); }
      }
    }
    function showEditor(session, row = null) {
      if (!active(session) || (row && !own(session, row))) return;
      releaseEditor(session.editor);
      resetView(session, 'editor', row ? '추천 글 수정' : '맛집 추천하기');
      const form = node('form', 'rr-editor'); form.noValidate = false;
      const editor = { id: row?.id || uid(), existing: row, form, dirty: false, processing: false, saving: false, uncertain: null, disposed: false, location: locationFrom(row), locationAddress: textValue(row?.address).trim(), locationRegion: textValue(row?.region).trim(), picker: null, photos: (row?.photos || []).map(path => ({ key: uid(), path, uploaded: true })), fields: {}, originalPaths: row?.photos || [] };
      session.editor = editor;
      form.append(node('p', 'rr-editor-intro', '직접 다녀온 맛집을 회원들에게 소개해 주세요.'));
      const name = field('name', '가게명', 'text', row?.name, 80, '지점이 있다면 함께 적어 주세요');
      const category = field('category', '음식 분류', 'category', row?.category);
      const region = field('region', '지역', 'region', row?.region);
      const address = field('address', '주소', 'text', row?.address, 200, '도로명 주소와 층·호수를 적어 주세요');
      const menu = field('menu', '추천 메뉴', 'text', row?.menu, 160, '꼭 먹어 보면 좋을 메뉴');
      const reason = field('reason', '추천 이유', 'textarea', row?.reason, 1000, '맛, 분위기, 방문 팁을 자유롭게 적어 주세요');
      address.control.minLength = 5; reason.control.minLength = 5;
      const pair = node('div', 'rr-field-pair'); pair.append(category.wrap, region.wrap);
      const location = node('div', 'rr-address-action');
      editor.locationOpen = button('지도에서 위치 선택', 'rr-button rr-location-open', 'location-open');
      editor.locationOpen.onclick = () => void chooseLocation(session, editor);
      editor.locationClear = button('지도 위치 해제', 'rr-link-button', 'location-clear');
      editor.locationClear.onclick = () => {
        if (!active(session) || session.editor !== editor || editor.disposed || editor.processing || editor.saving || editor.uncertain || editor.picker) return;
        editor.location = null; editor.dirty = true; renderLocation(editor); formMessage(editor, '선택한 지도 위치를 해제했어요.');
      };
      editor.locationStatus = hook(node('p', 'rr-location-status'), 'location-status'); editor.locationStatus.setAttribute('role', 'status');
      location.append(editor.locationOpen, editor.locationClear, editor.locationStatus); renderLocation(editor);
      for (const [key, item] of Object.entries({ name, category, region, address, menu, reason })) {
         editor.fields[key] = item.control;
         const onEdit = () => {
           item.control.setCustomValidity(''); editor.dirty = true;
           if ((key === 'address' || key === 'region') && editor.location &&
               (editor.fields.address.value.trim() !== editor.locationAddress || editor.fields.region.value !== editor.locationRegion)) {
             // Never keep a stale map pin after a member changes the street or region.
             editor.location = null;
             renderLocation(editor);
             formMessage(editor, '주소나 지역이 바뀌어 기존 지도 위치를 해제했어요. 새 위치를 선택해 주세요.', true);
           }
         };
         item.control.oninput = onEdit;
         if (key === 'address' || key === 'region') item.control.onchange = onEdit;
       }
      form.append(name.wrap, pair, address.wrap, location, menu.wrap, reason.wrap);
      const photos = node('section', 'rr-photo-section'), photoHeading = node('div', 'rr-photo-heading');
      editor.count = hook(node('span', 'rr-photo-count'), 'photo-count'); photoHeading.append(node('h3', '', '맛집 사진'), editor.count);
      photos.append(photoHeading, node('p', 'rr-photo-help', MIN_PHOTOS + '~' + MAX_PHOTOS + '장, 첫 사진이 대표 사진이에요'), node('p', 'rr-photo-types', 'JPG·PNG·WEBP · 한 장당 20MB 이하'));
      editor.photoGrid = node('div', 'rr-edit-photos'); editor.add = button('+ 사진 추가', 'rr-button rr-photo-add', 'photo-add');
      const input = hook(node('input'), 'photo-input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp'; input.multiple = true; input.hidden = true; input.setAttribute('aria-label', '맛집 사진 선택');
      editor.add.onclick = () => input.click(); input.onchange = () => { const files = Array.from(input.files || []); input.value = ''; if (files.length) void addPhotos(session, editor, files); };
      photos.append(editor.photoGrid, editor.add, input); form.append(photos);
      editor.status = hook(node('p', 'rr-form-status'), 'form-status'); editor.status.setAttribute('role', 'status'); editor.status.setAttribute('aria-live', 'polite');
      editor.reconcile = button('저장 결과 확인', 'rr-button', 'reconcile'); editor.reconcile.hidden = true; editor.reconcile.onclick = () => void reconcileSave(session, editor);
      editor.submit = button(row ? '수정 내용 저장' : '추천 등록', 'rr-button rr-primary rr-submit', 'submit'); editor.submit.type = 'submit';
      const footer = node('div', 'rr-editor-footer'); footer.append(editor.status, editor.reconcile, editor.submit); form.append(footer);
      form.onsubmit = event => { event.preventDefault(); void savePost(session, editor); };
      session.body.append(form); photoGrid(session, editor); editorControls(session, editor);
      name.control.focus({ preventScroll: true });
    }

    function ask(session, { title, message, accept = '확인', destructive = false }) {
      if (!active(session) || session.confirm) return Promise.resolve(false);
      return new Promise(resolve => {
        const dialog = hook(node('dialog', 'rr-confirm'), 'confirm-dialog'); dialog.setAttribute('aria-label', title);
        const previous = document.activeElement;
        const cancel = button('취소', 'rr-button', 'confirm-cancel'), yes = button(accept, 'rr-button ' + (destructive ? 'rr-danger' : 'rr-primary'), 'confirm-accept');
        const actions = node('div', 'rr-confirm-actions'); actions.append(cancel, yes);
        dialog.append(node('h2', '', title), node('p', '', message), actions);
        const done = value => { if (session.confirm?.dialog !== dialog) return; session.confirm = null; dialog.close(); dialog.remove(); if (active(session) && previous?.isConnected) previous.focus({ preventScroll: true }); resolve(value && active(session)); };
        session.confirm = { dialog, done };
        cancel.onclick = () => done(false); yes.onclick = () => done(true);
        dialog.addEventListener('cancel', event => { event.preventDefault(); done(false); });
        document.body.append(dialog); dialog.showModal(); cancel.focus();
      });
    }
    function disposal(session) {
      if (session.disposed) return;
      discardDraftPhotos(session, session.editor);
      session.disposed = true; session.view += 1;
      session.ratingEditor?.dispose(); session.ratingEditor = null;
      clearInterval(session.authTimer); clearTimeout(session.searchTimer);
      session.confirm?.done(false);
      for (const request of session.reads) request.abort(); session.reads.clear();
      releaseEditor(session.editor); session.editor = null;
      clearPhotoUrls();
      session.dialog.close(); session.dialog.remove();
      document.body.style.overflow = session.previousOverflow;
      if (!session.wasGaming) document.body.classList.remove('gaming');
      if (session.previousFocus?.isConnected) session.previousFocus.focus({ preventScroll: true });
      if (current === session) current = null;
    }
    function close(force = false) {
      const session = current;
      if (!session) return true;
      if (force === true || !active(session)) { disposal(session); return true; }
      if (session.editor?.picker) { session.editor.picker.close(); return false; }
      if (session.confirm) { session.confirm.done(false); return false; }
      if (session.busy || session.editor?.saving || session.editor?.processing) { notify('처리가 끝날 때까지 잠시 기다려 주세요.'); return false; }
      if (session.editor?.dirty || session.editor?.uncertain) {
        return ask(session, { title: '작성을 마칠까요?', message: session.editor.uncertain ? '저장 결과가 아직 확인되지 않았어요. 닫은 뒤에는 내 추천 목록에서 확인해 주세요.' : '저장하지 않은 내용은 사라져요.', accept: '닫기' }).then(yes => { if (yes && current === session) { disposal(session); return true; } return false; });
      }
      disposal(session); return true;
    }
    async function back(session) {
      if (!active(session)) return close(true);
      if (session.editor?.picker) { session.editor.picker.close(); return true; }
      if (session.confirm) { session.confirm.done(false); return true; }
      if (session.busy || session.editor?.saving || session.editor?.processing) return false;
      if (session.editor?.dirty || session.editor?.uncertain) {
        const yes = await ask(session, { title: '작성을 마칠까요?', message: session.editor.uncertain ? '저장 결과가 아직 확인되지 않았어요. 내 추천 목록에서 다시 확인해 주세요.' : '저장하지 않은 내용은 사라져요.', accept: '나가기' });
        if (!yes) return false;
      }
      if (!active(session)) return false;
      const existing = session.editor?.existing;
      if (existing) void showDetail(session, existing.id); else showList(session);
      return true;
    }
    async function openDetail(id) {
      if (typeof id !== 'string' || !UUID.test(id) || destroyed) return false;
      const owner = memberId(), generation = mapGeneration;
      if (!owner) { open(); return false; }
      if (current && active(current)) {
        if (current.screen === 'detail' && current.detail?.id === id) { current.dialog.focus(); return true; }
        if (await close() === false) return false;
      }
      if (destroyed || memberId() !== owner || mapGeneration !== generation) return false;
      return open({ id });
    }
    function open({ id = null } = {}) {
      if (destroyed) return false;
      if (id !== null && (typeof id !== 'string' || !UUID.test(id))) return false;
      const owner = memberId();
      if (owner && (!client?.rpc || !client?.storage)) { notify('추천맛집을 불러오지 못했어요. 다시 열어 주세요.'); return false; }
      if (current && active(current)) { if (!current.editor?.picker) current.dialog.focus(); return true; }
      if (current) disposal(current);
      observeAuth();
      const dialog = hook(node('dialog', 'recommended-restaurants-dialog'), 'dialog'); dialog.setAttribute('aria-label', '회원 추천맛집');
      const header = node('header', 'rr-header'), backButton = button('←', 'rr-header-button', 'back'), heading = node('h1', '', '추천맛집'), closeButton = button('×', 'rr-header-button', 'close');
      backButton.setAttribute('aria-label', '이전 화면으로'); closeButton.setAttribute('aria-label', '추천맛집 닫기');
      if (returnLabel) { closeButton.textContent = '← ' + returnLabel; closeButton.classList.add('rr-return-button'); closeButton.setAttribute('aria-label', returnLabel + '으로 돌아가기'); }
      header.append(backButton, heading, closeButton);
      const cleanupStatus = hook(node('aside', 'rr-cleanup-status'), 'cleanup-status'); cleanupStatus.hidden = true; cleanupStatus.setAttribute('role', 'status');
      const body = node('main', 'rr-body'); dialog.append(header, cleanupStatus, body);
      const session = { owner, dialog, body, heading, cleanupStatus, back: backButton, previousFocus: document.activeElement, previousOverflow: document.body.style.overflow, wasGaming: document.body.classList.contains('gaming'), disposed: false, view: 0, screen: 'list', reads: new Set(), filters: { query: '', category: '', region: '', mine: false }, rows: [], total: null, listVersion: 0, listBusy: false, busy: false, editor: null, detail: null, confirm: null };
      current = session;
      backButton.onclick = () => void back(session); closeButton.onclick = () => close();
      dialog.addEventListener('cancel', event => { event.preventDefault(); if (session.screen === 'list') close(); else void back(session); });
      dialog.addEventListener('keydown', event => { if (event.key === 'Escape') event.stopPropagation(); });
      session.authTimer = setInterval(() => { if (current === session && memberId() !== owner) close(true); }, 750);
      document.body.append(dialog); document.body.style.overflow = 'hidden'; document.body.classList.add('gaming'); dialog.showModal();
      if (owner) { if (id) void showDetail(session, id); else showList(session); renderCleanup(session); void flushCleanup(session); }
      else {
        backButton.hidden = true;
        const message = '로그인하면 회원들의 추천 맛집을 보고 글을 올릴 수 있어요.';
        const box = statusBlock(message);
        if (typeof onLogin === 'function') { const login = button('로그인', 'rr-button rr-primary', 'login'); login.onclick = () => { close(true); onLogin(); }; box.append(login); }
        body.append(box); notify(message);
      }
      closeButton.focus({ preventScroll: true });
      return true;
    }

    /* Persistence handlers are kept below the view code for contract review. */
    async function savePost(session, editor) {
      if (!active(session) || session.editor !== editor || editor.processing || editor.saving || editor.uncertain || editor.picker) return;
      const minimum = { name: 1, address: 5, menu: 1, reason: 5 };
      for (const [key, min] of Object.entries(minimum)) {
        const control = editor.fields[key];
        control.setCustomValidity(control.value.trim().length < min ? (min === 1 ? '내용을 적어 주세요.' : '5자 이상 적어 주세요.') : '');
      }
      if (!editor.form.reportValidity()) return;
      if (editor.photos.length < MIN_PHOTOS || editor.photos.length > MAX_PHOTOS) { formMessage(editor, '사진을 ' + MIN_PHOTOS + '~' + MAX_PHOTOS + '장 골라 주세요.', true); return; }
      formMessage(editor, '저장 준비 중이에요…');
      await persistEditor(session, editor);
    }
    function definiteFailure(error) {
      const code = String(error?.code || '');
      const message = String(error?.message || '');
      return /^P[0-9A-Z]{4}$|^22[0-9A-Z]{3}$|^23[0-9A-Z]{3}$|^42501$/.test(code) || /^(recommendation_|sign_in_required|member_unavailable)/.test(message) || /^PGRST/.test(code);
    }
    function validationMessage(error) {
      const message = String(error?.message || '');
      if (/photos_required/.test(message)) return '사진은 ' + MIN_PHOTOS + '~' + MAX_PHOTOS + '장 필요해요. 선택한 사진을 확인해 주세요.';
      if (/photo_invalid/.test(message)) return '사진 저장을 확인하지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
      if (/location_invalid/.test(message)) return '지도에서 가게 위치를 다시 선택해 주세요.';
      if (/invalid_input/.test(message)) return '가게 정보와 추천 이유를 다시 확인해 주세요.';
      if (/not_found/.test(message)) return '이 추천 글을 찾을 수 없어요. 목록에서 다시 확인해 주세요.';
      return friendlyError(error, '저장하지 못했어요. 작성한 내용은 그대로 있으니 다시 시도해 주세요.');
    }
    async function removePhotos(session, paths) {
      if (!active(session) || !session.owner) return false;
      const safe = [...new Set(Array.isArray(paths) ? paths : [])].filter(path => validPath(path) && path.startsWith(session.owner + '/'));
      if (!safe.length) return true;
      queueCleanup(session, safe);
      return flushCleanup(session);
    }
    async function uploadedPhoto(session, photo) {
      check(session);
      if (photo.uploaded) return;
      if (photo.uploadAttempt?.settled && photo.uploadAttempt.result && !photo.uploadAttempt.result.error) { photo.uploaded = true; return; }
      if (!photo.uploadAttempt || photo.uploadAttempt.settled) {
        const attempt = { settled: false };
        attempt.promise = Promise.resolve(client.storage.from(api.bucket).upload(photo.path, photo.blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })).then(result => { attempt.settled = true; attempt.result = result; return result; }, error => { attempt.settled = true; attempt.error = error; throw error; });
        photo.uploadAttempt = attempt;
      }
      const result = await timed(photo.uploadAttempt.promise, 25000); check(session);
      if (result.error) {
        if (String(result.error.statusCode || result.error.status) === '409' || /duplicate|already exists/i.test(String(result.error.message || result.error.error || ''))) {
          // A retried upload may have succeeded before its response was lost.
          const existing = await timed(client.storage.from(api.bucket).download(photo.path)); check(session);
          if (existing.error || existing.data?.size !== photo.blob.size) throw result.error;
          const [saved, local] = await Promise.all([existing.data.arrayBuffer(), photo.blob.arrayBuffer()]); check(session);
          const a = new Uint8Array(saved), b = new Uint8Array(local);
          if (a.length !== b.length || a.some((value, i) => value !== b[i])) throw result.error;
        } else throw result.error;
      }
      photo.uploaded = true;
    }
    function makePayload(editor) {
      const f = editor.fields;
      return { p_id: editor.id, p_request_id: uid(), p_name: f.name.value.trim(), p_category: f.category.value, p_region: f.region.value, p_address: f.address.value.trim(), p_menu: f.menu.value.trim(), p_reason: f.reason.value.trim(), p_photos: editor.photos.map(photo => photo.path), p_expected_updated_at: editor.existing?.updated_at || null, p_location: editor.location ? { latitude: editor.location.latitude, longitude: editor.location.longitude } : { latitude: null, longitude: null } };
    }
    function completeSave(session, editor, row, removed = []) {
      if (!active(session) || session.editor !== editor) return;
      const wasEdit = !!editor.existing;
      editor.dirty = false; editor.uncertain = null; editor.saving = false;
      void removePhotos(session, removed);
      releaseEditor(editor); session.editor = null;
      notify(wasEdit ? '추천 글을 수정했어요.' : '맛집 추천을 등록했어요.');
      renderDetail(session, row);
      changed();
    }
    async function runSave(session, editor, operation) {
      check(session); editor.saving = true; editor.uncertain = null; editorControls(session, editor);
      operation.settled = false; operation.result = null; operation.error = null;
      const promise = Promise.resolve(api.save(operation.payload)).then(result => { operation.settled = true; operation.result = result; return result; }, error => { operation.settled = true; operation.error = error; throw error; });
      operation.promise = promise;
      try {
        const result = await timed(promise, 25000); check(session);
        if (result.error) throw result.error;
        const row = rowFrom(result.data);
        if (!row || row.id !== editor.id || row.request_id !== operation.payload.p_request_id) throw new DelayError();
        completeSave(session, editor, row, result.data?.removed_paths || []);
      } catch (error) {
        if (!active(session) || session.editor !== editor) return;
        if (definiteFailure(error)) {
          editor.uncertain = null; formMessage(editor, validationMessage(error), true);
        } else {
          editor.uncertain = operation;
          formMessage(editor, '저장 결과를 확인하지 못했어요. 작성한 내용은 그대로 있으니 아래에서 결과를 확인해 주세요.', true);
        }
      } finally {
        editor.saving = false;
        if (active(session) && session.editor === editor) editorControls(session, editor);
      }
    }
    async function persistEditor(session, editor) {
      editor.saving = true; editorControls(session, editor);
      try {
        for (let i = 0; i < editor.photos.length; i += 1) {
          check(session);
          const photo = editor.photos[i];
          if (!photo.path) photo.path = api.path(session.owner, editor.id, uid());
          if (!validPath(photo.path) || !photo.path.startsWith(session.owner + '/' + editor.id + '/')) throw new Error('사진 저장 위치를 확인하지 못했어요.');
          if (!photo.uploaded) { formMessage(editor, '사진을 저장하는 중이에요… ' + (i + 1) + '/' + editor.photos.length); await uploadedPhoto(session, photo); }
        }
        check(session); formMessage(editor, '추천 글을 저장하는 중이에요…');
        const operation = { payload: makePayload(editor), settled: false };
        await runSave(session, editor, operation);
      } catch (error) {
        if (active(session) && session.editor === editor) formMessage(editor, friendlyError(error, '사진을 저장하지 못했어요. 선택한 사진과 작성 내용은 그대로 있으니 다시 시도해 주세요.'), true);
      } finally {
        editor.saving = false;
        if (active(session) && session.editor === editor) editorControls(session, editor);
      }
    }
    async function reconcileSave(session, editor) {
      const operation = editor.uncertain;
      if (!operation || editor.saving || !active(session) || session.editor !== editor) return;
      editor.saving = true; editorControls(session, editor); formMessage(editor, '저장 결과를 확인하는 중이에요…');
      let replay = false;
      try {
        const row = rowFrom(await api.detail(session, editor.id)); check(session);
        if (row?.request_id === operation.payload.p_request_id) {
          const removed = operation.result?.data?.removed_paths || editor.originalPaths.filter(path => !row.photos.includes(path));
          completeSave(session, editor, row, removed); return;
        }
        if (!operation.settled) { formMessage(editor, '아직 저장 결과를 기다리고 있어요. 잠시 후 다시 확인해 주세요.'); return; }
        if (operation.result && !operation.result.error && rowFrom(operation.result.data)?.request_id === operation.payload.p_request_id) {
          completeSave(session, editor, row || rowFrom(operation.result.data), operation.result.data?.removed_paths || []); return;
        }
        const error = operation.result?.error || operation.error;
        if (definiteFailure(error)) { editor.uncertain = null; formMessage(editor, validationMessage(error), true); return; }
        if (row && row.updated_at !== editor.existing?.updated_at) {
          formMessage(editor, '이 글이 다른 화면에서 변경됐어요. 작성한 내용을 확인한 뒤 목록에서 최신 글을 열어 주세요.', true); return;
        }
        // The preceding lookup completed, and the first call has settled.
        // Reusing BOTH identifiers makes an ambiguous network retry idempotent.
        replay = true;
      } catch (error) {
        if (active(session) && session.editor === editor) formMessage(editor, friendlyError(error, '아직 저장 결과를 확인하지 못했어요. 연결을 확인하고 다시 눌러 주세요.'), true);
      } finally {
        editor.saving = false;
        if (active(session) && session.editor === editor) editorControls(session, editor);
      }
      if (replay && active(session) && session.editor === editor) await runSave(session, editor, operation);
    }
    function deletionStatus(session, text, retry) {
      if (!active(session) || session.screen !== 'detail') return;
      session.body.querySelector('[data-rr="delete-status"]')?.remove();
      const box = hook(node('div', 'rr-delete-status'), 'delete-status'); box.setAttribute('role', 'status');
      box.append(node('p', '', text));
      if (retry) { const again = button('삭제 결과 확인', 'rr-button', 'delete-reconcile'); again.onclick = retry; box.append(again); }
      session.body.querySelector('.rr-detail-content')?.append(box);
    }
    function finishDelete(session, row, result) {
      if (!active(session)) return;
      session.busy = false;
      void removePhotos(session, result?.removed_paths || row.photos);
      notify('추천 글을 삭제했어요.'); showList(session);
      changed();
    }
    async function checkDelete(session, row, operation) {
      if (!active(session) || session.busy) return;
      session.busy = true;
      try {
        const currentRow = rowFrom(await api.detail(session, row.id)); check(session);
        if (!currentRow) { finishDelete(session, row, operation.result?.data); return; }
        if (!operation.settled) { deletionStatus(session, '아직 삭제 결과를 기다리고 있어요.', () => void checkDelete(session, row, operation)); return; }
        if (operation.result?.error && definiteFailure(operation.result.error)) { deletionStatus(session, validationMessage(operation.result.error)); return; }
        deletionStatus(session, '삭제가 완료되지 않았어요. 글을 확인한 뒤 다시 삭제해 주세요.');
      } catch { if (active(session)) deletionStatus(session, '삭제 결과를 확인하지 못했어요. 연결을 확인해 주세요.', () => void checkDelete(session, row, operation)); }
      finally { session.busy = false; }
    }
    async function deletePost(session, row) {
      if (!own(session, row) || session.busy) return;
      const yes = await ask(session, { title: '추천 글을 삭제할까요?', message: '이 글과 올린 사진이 삭제돼요.', accept: '삭제', destructive: true });
      if (!yes || !own(session, row)) return;
      session.busy = true;
      const operation = { settled: false };
      deletionStatus(session, '추천 글을 삭제하는 중이에요…');
      try {
        check(session);
        operation.promise = Promise.resolve(api.remove(row.id, row.updated_at)).then(result => { operation.settled = true; operation.result = result; return result; }, error => { operation.settled = true; operation.error = error; throw error; });
        const result = await timed(operation.promise, 25000); check(session);
        if (result.error) throw result.error;
        if (!result.data?.deleted) throw new DelayError();
        finishDelete(session, row, result.data);
      } catch (error) {
        if (!active(session)) return;
        deletionStatus(session, definiteFailure(error) ? validationMessage(error) : '삭제 결과를 확인하지 못했어요. 다시 확인해 주세요.', definiteFailure(error) ? null : () => void checkDelete(session, row, operation));
      } finally { session.busy = false; }
    }

    return { open, openDetail, getMapPage, cancelMapReads, subscribeChanges(listener) { if (typeof listener !== 'function' || destroyed) return () => {}; changeListeners.add(listener); return () => changeListeners.delete(listener); }, close, ratings, back() { const session = current; if (!session) return true; if (session.confirm) { session.confirm.done(false); return true; } return session.screen === 'list' ? close() : back(session); }, destroy() { if (destroyed) return; close(true); destroyed = true; cancelMapReads(); changeListeners.clear(); ratings?.destroy(); authSubscription?.unsubscribe?.(); authSubscription = null; clearPhotoUrls(); }, isOpen: () => !!current && !current.disposed };
  }
  global.OjjudaRecommendedRestaurants = { create };
})(window);
