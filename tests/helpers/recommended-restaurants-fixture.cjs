/* Test-only service fixture. The browser suite uses this same public RPC/storage contract. */
function installRecommendedRestaurantsFixture(target, options = {}) {
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const member = '10000000-0000-4000-8000-000000000001';
  const secondMember = '10000000-0000-4000-8000-000000000002';
  const photoBytes = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 255, 217]);
  const state = {
    member, secondMember, user: options.user === undefined ? { id: member } : copy(options.user),
    rows: copy(options.rows || []), calls: [], notices: [], files: new Map(), ratings: new Map(),
    hooks: { rpc: {}, storage: {} }, listeners: new Set(), clock: 0
  };
  const user = () => state.user ? copy(state.user) : null;
  const response = data => ({ data: copy(data), error: null });
  const failure = message => ({ data: null, error: { message, code: 'P0001' } });
  const view = (row, owner) => row ? { ...copy(row), is_owner: row.owner_id === owner } : null;
  const ratingKey = (kind, id, owner) => JSON.stringify([kind, id, owner]);
  const ratingTargetExists = (kind, id) => kind === 'certified' || state.rows.some(row => row.id === id && !row.deleted_at);
  const ratingSummary = (kind, id, owner) => {
    const entries = [...state.ratings.values()].filter(rating => rating.kind === kind && rating.id === id);
    const count = entries.length, total = entries.reduce((sum, rating) => sum + rating.score, 0);
    return { id, average: count ? Math.round(total / count * 100) / 100 : null, count, my_rating: state.ratings.get(ratingKey(kind, id, owner))?.score ?? null };
  };
  for (const rating of options.ratings || []) state.ratings.set(ratingKey(rating.kind, rating.id, rating.user_id), copy(rating));
  for (const row of state.rows) {
    for (const photo of row.photos || []) state.files.set(photo, new target.Blob([photoBytes], { type: 'image/jpeg' }));
  }
  state.setUser = next => {
    state.user = next ? copy(next) : null;
    for (const callback of state.listeners) callback(next ? 'SIGNED_IN' : 'SIGNED_OUT', next ? { user: copy(next) } : null);
  };
  state.client = {
    auth: {
      async getUser() { return { data: { user: user() }, error: null }; },
      onAuthStateChange(callback) {
        state.listeners.add(callback);
        return { data: { subscription: { unsubscribe() { state.listeners.delete(callback); } } } };
      }
    },
    async rpc(name, parameters = {}) {
      const owner = state.user?.id;
      state.calls.push({ type: 'rpc', name, parameters: copy(parameters), owner });
      if (!owner || state.user.is_anonymous) return failure('sign_in_required');
      if (state.hooks.rpc[name]) {
        const intercepted = await state.hooks.rpc[name](parameters, owner);
        if (intercepted !== undefined) return intercepted;
      }
      if (name === 'get_restaurant_rating_summaries' || name === 'set_restaurant_rating') {
        const kind = parameters.p_kind;
        if (!['certified', 'recommended'].includes(kind)) return failure('restaurant_rating_invalid_input');
        if (name === 'get_restaurant_rating_summaries') {
          if (!Array.isArray(parameters.p_ids) || parameters.p_ids.length > 100 || parameters.p_ids.some(id => typeof id !== 'string' || !id || id.length > 120)) return failure('restaurant_rating_invalid_input');
          return response([...new Set(parameters.p_ids)].filter(id => ratingTargetExists(kind, id)).map(id => ratingSummary(kind, id, owner)));
        }
        const id = parameters.p_id, score = parameters.p_score;
        if (typeof id !== 'string' || !id || id.length > 120 || typeof score !== 'number' || !Number.isFinite(score) || score < 1 || score > 5 || !Number.isInteger(score * 2)) return failure('restaurant_rating_invalid_input');
        if (!ratingTargetExists(kind, id)) return failure('restaurant_rating_target_unavailable');
        state.ratings.set(ratingKey(kind, id, owner), { kind, id, user_id: owner, score });
        return response(ratingSummary(kind, id, owner));
      }
      if (name === 'list_restaurant_recommendations') {
        const query = String(parameters.p_query || '').toLowerCase();
        const rows = state.rows.filter(row =>
          (!query || [row.name, row.address, row.menu, row.reason].some(value => String(value).toLowerCase().includes(query))) &&
          (!parameters.p_category || row.category === parameters.p_category) &&
          (!parameters.p_region || row.region === parameters.p_region) &&
          (!parameters.p_mine || row.owner_id === owner));
        const offset = parameters.p_offset || 0, limit = parameters.p_limit || 20;
        return response({ rows: rows.slice(offset, offset + limit).map(row => view(row, owner)), total: rows.length, offset, limit });
      }
      if (name === 'get_restaurant_recommendation') return response(view(state.rows.find(row => row.id === parameters.p_id), owner));
      if (name === 'save_restaurant_recommendation') {
        const previous = state.rows.find(row => row.id === parameters.p_id);
        if (previous && previous.owner_id !== owner) return failure('recommendation_not_owner');
        if (previous && previous.request_id === parameters.p_request_id) return response({ item: view(previous, owner), removed_paths: [] });
        if (previous && parameters.p_expected_updated_at !== previous.updated_at) return failure('recommendation_conflict');
        const photos = parameters.p_photos || [];
        if (photos.length < 1 || photos.length > 12) return failure('recommendation_photos_required');
        if (photos.some(photo => !photo.startsWith(owner + '/' + parameters.p_id + '/') || !state.files.has(photo))) return failure('recommendation_photo_invalid');
        const stamp = new Date(Date.UTC(2026, 10, 3, 8, 0, ++state.clock)).toISOString();
        const row = {
          id: parameters.p_id, owner_id: owner, name: parameters.p_name, category: parameters.p_category,
          region: parameters.p_region, address: parameters.p_address, menu: parameters.p_menu, reason: parameters.p_reason,
          photos: copy(photos), author_name: '추천 회원', created_at: previous?.created_at || stamp,
          updated_at: stamp, is_owner: true, request_id: parameters.p_request_id
        };
        const removed = (previous?.photos || []).filter(photo => !photos.includes(photo));
        state.rows = state.rows.filter(item => item.id !== row.id).concat([row]);
        return response({ item: row, removed_paths: removed });
      }
      if (name === 'delete_restaurant_recommendation') {
        const previous = state.rows.find(row => row.id === parameters.p_id);
        if (!previous) return failure('recommendation_not_found');
        if (previous.owner_id !== owner) return failure('recommendation_not_owner');
        if (parameters.p_expected_updated_at !== previous.updated_at) return failure('recommendation_conflict');
        state.rows = state.rows.filter(row => row.id !== parameters.p_id);
        for (const [key, rating] of state.ratings) if (rating.kind === 'recommended' && rating.id === parameters.p_id) state.ratings.delete(key);
        return response({ id: previous.id, deleted: true, removed_paths: previous.photos });
      }
      throw new Error('Unexpected recommendation RPC: ' + name);
    },
    storage: {
      from(bucket) {
        if (bucket !== 'restaurant-recommendations') throw new Error('Unexpected recommendation storage bucket: ' + bucket);
        return {
          async upload(path, blob, settings) {
            const owner = state.user?.id;
            state.calls.push({ type: 'upload', path, owner, size: blob.size, mime: blob.type, settings: copy(settings) });
            if (state.hooks.storage.upload) {
              const intercepted = await state.hooks.storage.upload(path, blob, settings, owner);
              if (intercepted !== undefined) return intercepted;
            }
            if (!owner || !path.startsWith(owner + '/')) return failure('storage_owner_required');
            state.files.set(path, blob);
            return response({ path });
          },
          async download(path) {
            const owner = state.user?.id;
            state.calls.push({ type: 'download', path, owner });
            if (state.hooks.storage.download) {
              const intercepted = await state.hooks.storage.download(path, owner);
              if (intercepted !== undefined) return intercepted;
            }
            return state.files.has(path) ? { data: state.files.get(path), error: null } : failure('not_found');
          },
          async remove(paths) {
            const owner = state.user?.id;
            state.calls.push({ type: 'remove', paths: copy(paths), owner });
            if (state.hooks.storage.remove) {
              const intercepted = await state.hooks.storage.remove(paths, owner);
              if (intercepted !== undefined) return intercepted;
            }
            if (paths.some(path => state.rows.some(row => row.photos.includes(path)))) return failure('referenced_photo');
            paths.filter(path => path.startsWith(owner + '/')).forEach(path => state.files.delete(path));
            return response(paths.map(name => ({ name })));
          },
          createSignedUrl() { throw new Error('Member photos must not expose signed public URLs'); },
          getPublicUrl() { throw new Error('Member photos must not expose public URLs'); }
        };
      }
    }
  };
  state.getUser = user;
  state.notify = message => state.notices.push(String(message));
  target.rrFixture = state;
  return state;
}

function recommendation(overrides = {}) {
  const owner = overrides.owner_id || '10000000-0000-4000-8000-000000000001';
  const id = overrides.id || '20000000-0000-4000-8000-000000000001';
  return {
    id, owner_id: owner, name: '회원 추천 국수집', category: '한식', region: '대전',
    address: '대전 중구 중교로 45-5', menu: '손칼국수', reason: '직접 방문해서 먹은 국물이 깔끔하고 맛있어요.',
    photos: Array.from({ length: 3 }, (_, index) => owner + '/' + id + '/30000000-0000-4000-8000-' + String(index + 1).padStart(12, '0') + '.jpg'),
    author_name: '추천 회원', created_at: '2026-11-02T00:00:00.000Z', updated_at: '2026-11-02T00:00:00.000Z',
    is_owner: true, request_id: '40000000-0000-4000-8000-000000000001', ...overrides
  };
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

module.exports = { installRecommendedRestaurantsFixture, recommendation, deferred };
