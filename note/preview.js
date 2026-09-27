// World and Note use the same origin, Supabase project, and default Auth storage.
const $ = selector => document.querySelector(selector);
const config = window.OJJUDA_CONFIG;
const localStage = config?.localStage === true && ['localhost', '127.0.0.1'].includes(location.hostname)
  && config.supabaseUrl === 'https://jucuqqbynilwlhqxyzrd.supabase.co';
const client = config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
const columns = 'id,kind,parent_id,body,display_name,tags,background_key,created_at,like_count,reply_count,is_mine,is_liked,is_bookmarked,identity_mode';
const feed = $('#feed'), detail = $('#detail'), list = $('#feed-list');
const slot = $('#detail-card-slot'), replies = $('#reply-list');
const backdrop = $('#composer-backdrop'), text = $('#compose-text'), tags = $('#compose-tags');
const submit = $('#publish-card'), composeMessage = $('#compose-message');
const cache = new Map(), stack = [];
let session = null, authKnown = false, ready = false, busy = false, authEventVersion = 0;
let focusBefore = null, kind = 'memo', parentId = null, backgroundKey = '10';
let feedCursor = null, replyCursor = null, feedRun = 0, detailRun = 0;
let stageAuth = null;
let worldCoins = null, balanceRun = 0;
let editingId = null, composerUserId = null, moderator = false, moderatorRun = 0;
let feedMode = 'all', feedSort = 'latest', feedTerm = '', feedSearchKind = 'body';
let feedSnapshot = null, feedLoading = false, replyLoading = false;
let noteState = null, noteStateRun = 0, noticeElement = null, featureMessage = null;
let initialCardId = new URL(location.href).searchParams.get('card');
const reactionPending = new Set();
let draftController = null, draftTools = null, draftStatus = null, draftConfirm = null, draftLoading = false;
let requestedDraftContent = null, composerRun = 0, identityEpoch = 0;
let notificationController = null;
const validCardId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');


function node(name, className, value) {
  const item = document.createElement(name);
  if (className) item.className = className;
  if (value !== undefined) item.textContent = String(value);
  return item;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${name}`);
  svg.append(use);
  return svg;
}
function state(place, value) { place.replaceChildren(node('p', 'reply-empty', value)); }
function banner(value) {
  $('#connection-message').textContent = value;
  $('#connection-status').hidden = !value;
}
function query() { return client.schema('ojjuda_note'); }
function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'numeric', day: 'numeric'
  }).format(date);
}

function cardElement(card, compact = false, expanded = false) {
  const item = node('article', compact ? 'reply-card' : 'photo-card');
  item.dataset.cardId = card.id;
  const open = node('button', 'photo-open');
  open.type = 'button';
  open.dataset.open = card.id;
  open.setAttribute('aria-label', '카드 크게 보기');
  if (expanded) { open.disabled = true; delete open.dataset.open; }
  const photo = node('span', `photo ${card.background_key === '11' ? 'image-forest' : 'image-lake'}`);
  const quote = node('span', 'card-quote');
  const body = typeof card.body === 'string' ? card.body : '';
  body.split('\n').forEach((line, index) => {
    if (index) quote.append(document.createElement('br'));
    quote.append(document.createTextNode(line));
  });
  if (body.length > 120) quote.style.fontSize = compact ? '15px' : '18px';
  else if (body.length > 70) quote.style.fontSize = compact ? '17px' : '22px';
  quote.style.overflowWrap = 'anywhere';
  const tagRow = node('span', 'card-tags');
  for (const tag of Array.isArray(card.tags) ? card.tags.slice(0, 5) : []) {
    tagRow.append(node('span', '', `#${tag}`));
  }
  photo.append(node('span', 'photo-shade'), quote, tagRow);
  open.append(photo);
  item.append(open);

  const meta = node('div', 'card-meta');
  const person = node('span');
  person.append(node('strong', '', card.display_name || '익명'));
  person.append(node('small', '', dateLabel(card.created_at)));
  meta.append(node('span', card.background_key === '11' ? 'avatar avatar-green' : 'avatar', 'ㅇ'), person);
  if (!compact) meta.append(node('span', 'meta-tail', card.kind === 'comment' ? '답글 카드' : '사진 카드'));
  item.append(meta);

  const actions = node('div', 'card-actions');
  const reply = node('button');
  reply.type = 'button';
  if (expanded) {
    reply.dataset.compose = 'reply';
    reply.style.display = 'inline-flex';
    reply.setAttribute('aria-label', '이 카드에 답글 쓰기');
  } else reply.dataset.open = card.id;
  reply.append(icon('reply'), document.createTextNode(' 답글 '), node('span', '', card.reply_count || 0));
  const like = node('button');
  like.type = 'button'; like.dataset.reaction = 'like'; like.dataset.cardId = card.id;
  like.setAttribute('aria-label', card.is_liked ? '공감 취소' : '공감');
  like.setAttribute('aria-pressed', String(!!card.is_liked));
  like.disabled = reactionPending.has(`like:${card.id}`) || !canReact(!!card.is_liked);
  like.append(icon('heart'), document.createTextNode(` ${card.like_count || 0}`));
  actions.append(reply, like);
  if (!compact) {
    const save = node('button', 'save');
    save.type = 'button'; save.dataset.reaction = 'bookmark'; save.dataset.cardId = card.id;
    save.setAttribute('aria-label', card.is_bookmarked ? '메모함에서 빼기' : '메모함에 담기');
    save.setAttribute('aria-pressed', String(!!card.is_bookmarked));
    save.disabled = reactionPending.has(`bookmark:${card.id}`) || !canReact(!!card.is_bookmarked);
    save.append(icon('bookmark'));
    actions.append(save);
  }
  const share = node('button', 'card-share', '공유');
  share.type = 'button'; share.dataset.shareCard = card.id;
  actions.append(share);
  item.append(actions);
  if (session?.user) {
    const manage = node('button', 'card-manage', '더 보기');
    manage.type = 'button'; manage.dataset.manageCard = card.id;
    manage.setAttribute('aria-label', card.is_mine ? '내 카드 수정 또는 삭제' : '카드 신고 또는 작성자 차단');
    item.append(manage);
  }
  return item;
}

function message(value) {
  if (featureMessage) { featureMessage.textContent = value; featureMessage.hidden = !value; }
}
function cursorFilter(cursor, ascending = false, popular = false) {
  if (!cursor || !validCardId(cursor.id) || !Number.isFinite(Date.parse(cursor.created_at))) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.created_at)) return null;
  // Keep PostgreSQL microseconds: rounding to milliseconds can skip tied rows.
  const time = cursor.created_at, op = ascending ? 'gt' : 'lt';
  const tie = `created_at.${op}.${time},and(created_at.eq.${time},id.${op}.${cursor.id})`;
  if (!popular) return tie;
  const count = Number(cursor.like_count);
  if (!Number.isSafeInteger(count) || count < 0) return null;
  return `like_count.lt.${count},and(like_count.eq.${count},or(${tie}))`;
}
function filteredFeed() {
  let request = query().from('public_cards').select(columns);
  // Saved and own collections include replies as well as root cards.
  if (feedMode === 'all') request = request.eq('kind', 'memo');
  if (feedMode === 'saved') request = request.eq('is_bookmarked', true);
  if (feedMode === 'mine') request = request.eq('is_mine', true);
  if (feedTerm) {
    if (feedSearchKind === 'tag') request = request.contains('tags', [feedTerm.replace(/^#/, '')]);
    else request = request.ilike('body', `%${feedTerm.replace(/[\\%_]/g, '\\$&')}%`);
  }
  if (feedSnapshot) request = request.lte('created_at', feedSnapshot);
  if (feedSort === 'popular') {
    request = request.gte('created_at', new Date(Date.parse(feedSnapshot) - 7 * 86400000).toISOString());
    request = request.order('like_count', { ascending: false });
  }
  const after = cursorFilter(feedCursor, false, feedSort === 'popular');
  if (after) request = request.or(after);
  return request.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20);
}
async function loadFeed(more = false) {
  if (!client || (more && feedLoading)) return;
  const version = ++feedRun;
  feedLoading = true;
  if (!more) {
    feedCursor = null; feedSnapshot = new Date().toISOString();
    if (detail.hidden) cache.clear();
    state(list, '카드를 불러오는 중이에요.'); banner('카드를 불러오는 중');
  } else list.querySelector('[data-more-feed]')?.remove();
  if (feedMode !== 'all' && !session?.user) {
    ready = true; feedLoading = false; banner('');
    state(list, '대문에서 로그인하면 메모함과 내 카드를 볼 수 있어요.'); updateComposer(); return;
  }
  let data, error;
  try { ({ data, error } = await filteredFeed()); } catch (cause) { error = cause; }
  if (version !== feedRun) return;
  feedLoading = false;
  if (error) {
    console.warn('Note feed:', error);
    if (!more) { ready = false; state(list, '카드를 불러오지 못했어요.'); }
    banner('노트 연결을 확인해 주세요');
    const retry = node('button', 'button', '다시 시도');
    retry.type = 'button'; retry.dataset.retryFeed = more ? 'more' : 'first'; list.append(retry);
    updateComposer(); return;
  }
  ready = true; banner('');
  if (!more) list.replaceChildren();
  for (const card of data || []) {
    const exists = list.querySelector(`[data-card-id="${card.id}"]`);
    cache.set(card.id, card);
    if (!exists) list.append(cardElement(card));
  }
  if (!more && !data?.length) state(list, feedTerm ? '검색 결과가 없어요.' : feedMode === 'saved'
    ? '저장한 카드가 없어요. 카드의 책갈피를 눌러 담아 보세요.' : feedMode === 'mine'
      ? '아직 작성한 카드가 없어요.' : feedSort === 'popular'
        ? '최근 7일에 올라온 카드가 없어요.' : '아직 카드가 없어요. 첫 카드를 써 보세요.');
  if (data?.length) feedCursor = data.at(-1);
  if (data?.length === 20) {
    const next = node('button', 'button', '더 보기'); next.type = 'button'; next.dataset.moreFeed = ''; list.append(next);
  }
  updateComposer();
  consumeInitialCard();
}
function consumeInitialCard() {
  if (!initialCardId || !authKnown || !ready) return;
  const id = initialCardId; initialCardId = null;
  if (validCardId(id)) openCard(id);
}
function updateCardUrl(id = null) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('card', id); else url.searchParams.delete('card');
  history.replaceState(null, '', url);
}

function showFeed(updateUrl = true) {
  detailRun++; replyLoading = false; stack.length = 0;
  if (updateUrl) updateCardUrl();
  feed.hidden = false; detail.hidden = true;
  window.scrollTo({ top: 0, behavior: 'auto' });
}
async function loadReplies(id, version, more = false) {
  if (more && replyLoading) return;
  replyLoading = true;
  if (!more) { replyCursor = null; state(replies, '답글을 불러오는 중이에요.'); }
  else replies.querySelector('[data-more-replies]')?.remove();
  let data, error;
  try {
    let request = query().from('public_cards').select(columns)
      .eq('kind', 'comment').eq('parent_id', id);
    const after = cursorFilter(replyCursor, true);
    if (after) request = request.or(after);
    ({ data, error } = await request.order('created_at', { ascending: true })
      .order('id', { ascending: true }).limit(30));
  } catch (cause) { error = cause; }
  if (version !== detailRun || stack.at(-1) !== id) return;
  replyLoading = false;
  if (error) {
    console.warn('Note replies:', error);
    if (!more) state(replies, '답글을 불러오지 못했어요.');
    const retry = node('button', 'button', '다시 시도');
    retry.type = 'button'; retry.dataset.retryReplies = more ? 'more' : 'first'; replies.append(retry);
    return;
  }
  if (!more) replies.replaceChildren();
  for (const card of data || []) { cache.set(card.id, card); replies.append(cardElement(card, true)); }
  if (!more && !data?.length) state(replies, '아직 답글이 없어요.');
  if (data?.length) replyCursor = data.at(-1);
  if (data?.length === 30) {
    const next = node('button', 'button', '답글 더 보기');
    next.type = 'button'; next.dataset.moreReplies = ''; replies.append(next);
  }
}
async function renderDetail() {
  if (!client || !stack.length) return;
  const id = stack.at(-1), version = ++detailRun;
  feed.hidden = true; detail.hidden = false;
  state(slot, '카드를 불러오는 중이에요.'); state(replies, '답글을 불러오는 중이에요.');
  $('#detail [data-compose="reply"]').disabled = true;
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (backdrop.hidden && management.hidden) $('.back-button').focus({ preventScroll: true });
  // Always recheck visibility: a saved card may have been blocked or hidden.
  let card, error;
  try {
    ({ data: card, error } = await query().from('public_cards').select(columns).eq('id', id).maybeSingle());
  } catch (cause) { error = cause; }
  if (version !== detailRun) return;
  if (error) {
    console.warn('Note card:', error);
    state(slot, '카드를 불러오지 못했어요.'); state(replies, '잠시 후 다시 열어 주세요.'); return;
  }
  if (!card) {
    cache.delete(id); $('#reply-count').textContent = '0';
    state(slot, '삭제되었거나 볼 수 없는 카드예요.'); state(replies, ''); return;
  }
  cache.set(id, card);
  $('#detail [data-compose="reply"]').disabled = !canWrite();
  slot.replaceChildren(cardElement(card, false, true));
  $('#reply-count').textContent = String(card.reply_count || 0);
  loadReplies(id, version);
}
function openCard(id) {
  if (!validCardId(id) || !ready) return;
  stack.push(id); updateCardUrl(id); renderDetail();
}
function goBack() {
  if (stack.length > 1) { stack.pop(); updateCardUrl(stack.at(-1)); renderDetail(); }
  else showFeed();
}

function canWrite(cardKind = kind) {
  return !!noteState && !noteState.is_restricted
    && (cardKind === 'comment' ? noteState.replies_enabled : noteState.posting_enabled);
}
function canReact(alreadySelected = false) {
  return alreadySelected || (!!noteState && !noteState.is_restricted);
}
function writingMessage(cardKind = kind) {
  if (!noteState) return '노트 운영 상태를 확인하는 중이에요';
  if (noteState.is_restricted) return `노트 이용이 제한되어 있어요${noteState.restriction_reason ? `: ${noteState.restriction_reason}` : ''}`;
  if (cardKind === 'comment' && !noteState.replies_enabled) return '답글 등록이 잠시 쉬고 있어요';
  if (cardKind !== 'comment' && !noteState.posting_enabled) return '새 카드 등록이 잠시 쉬고 있어요';
  return '';
}
async function loadNoteState() {
  const run = ++noteStateRun, userId = session?.user?.id || null;
  try {
    const data = await noteRpc('get_note_state');
    if (run !== noteStateRun || (session?.user?.id || null) !== userId) return;
    noteState = data;
    const values = [data.notice, data.is_restricted ? writingMessage() : '',
      !data.posting_enabled ? '새 카드 등록이 잠시 쉬고 있어요.' : '',
      !data.replies_enabled ? '답글 등록이 잠시 쉬고 있어요.' : ''].filter(Boolean);
    noticeElement.replaceChildren(...values.map(value => node('p', '', value)));
    noticeElement.hidden = !values.length;
  } catch (error) {
    if (run !== noteStateRun) return;
    noteState = null; console.warn('Note state:', error);
    noticeElement.replaceChildren(node('p', '', '운영 상태를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.'));
    noticeElement.hidden = false;
  }
  updateComposer(); updateReactionButtons();
}
function updateReactionButtons() {
  document.querySelectorAll('[data-reaction]').forEach(button => {
    const card = cache.get(button.dataset.cardId);
    const selected = !!card?.[button.dataset.reaction === 'like' ? 'is_liked' : 'is_bookmarked'];
    button.disabled = reactionPending.has(`${button.dataset.reaction}:${button.dataset.cardId}`) || !canReact(selected);
  });
}
function replaceVisibleCard(card) {
  cache.set(card.id, card);
  for (const item of document.querySelectorAll('article[data-card-id]')) {
    if (item.dataset.cardId !== card.id) continue;
    if (list.contains(item) && feedMode === 'saved' && !card.is_bookmarked) { item.remove(); continue; }
    item.replaceWith(cardElement(card, item.classList.contains('reply-card'), slot.contains(item)));
  }
  if (feedMode === 'saved' && !list.querySelector('article')) state(list, '저장한 카드가 없어요.');
}
async function toggleReaction(cardId, reaction) {
  if (!['like', 'bookmark'].includes(reaction)) return;
  const card = cache.get(cardId), key = `${reaction}:${cardId}`, userId = session?.user?.id, epoch = identityEpoch;
  if (!card || reactionPending.has(key)) return;
  if (!userId) { message('대문에서 로그인하면 공감하고 메모함에 저장할 수 있어요.'); return; }
  const field = reaction === 'like' ? 'is_liked' : 'is_bookmarked', wasSelected = !!card[field];
  if (!canReact(wasSelected)) { message(writingMessage()); return; }
  reactionPending.add(key); updateReactionButtons(); message('');
  try {
    const request = wasSelected
      ? query().from('reactions').delete().eq('card_id', cardId).eq('user_id', userId).eq('kind', reaction)
      : query().from('reactions').insert({ card_id: cardId, user_id: userId, kind: reaction });
    const { error } = await request;
    // A second browser may have already saved the same reaction.
    if (error && error.code !== '23505') throw error;
    if (session?.user?.id !== userId || identityEpoch !== epoch) return;
    const { data, error: readError } = await query().from('public_cards').select(columns).eq('id', cardId).maybeSingle();
    if (readError) throw readError;
    if (session?.user?.id !== userId || identityEpoch !== epoch) return;
    if (!data) { await refreshCards(stack.length > 0); message('삭제되었거나 볼 수 없는 카드예요.'); return; }
    replaceVisibleCard(data);
    if ((reaction === 'like' && feedSort === 'popular') || (reaction === 'bookmark' && feedMode === 'saved')) await loadFeed();
    message(reaction === 'bookmark' ? (data.is_bookmarked ? '메모함에 담았어요.' : '메모함에서 뺐어요.') : '');
  } catch (error) {
    if (session?.user?.id !== userId || identityEpoch !== epoch) return;
    console.warn('Note reaction:', error);
    message('반영 여부를 확인하지 못했어요. 카드를 새로고침한 뒤 다시 확인해 주세요.');
  } finally {
    if (session?.user?.id === userId && identityEpoch === epoch) { reactionPending.delete(key); updateReactionButtons(); }
  }
}
function shareCard(cardId) {
  if (!validCardId(cardId)) return;
  const url = new URL(location.pathname, location.origin); url.searchParams.set('card', cardId);
  showManagement('카드 공유');
  managementBody.append(node('p', 'management-help', '이 링크로 카드를 열 수 있어요. 삭제되거나 숨김 처리된 카드는 보이지 않습니다.'));
  const label = node('label', 'field-label', '카드 링크'); label.htmlFor = 'note-share-url';
  const input = node('input', 'note-share-url'); input.id = 'note-share-url'; input.type = 'url';
  input.value = url.href; input.readOnly = true; input.addEventListener('focus', () => input.select());
  managementBody.append(label, input);
  managementFooter.append(managementButton('링크 복사', async () => {
    try { await navigator.clipboard.writeText(url.href); managementMessage.textContent = '링크를 복사했어요.'; }
    catch { input.focus(); input.select(); managementMessage.textContent = '선택된 링크를 복사해 주세요.'; }
  }, true));
  if (navigator.share) managementFooter.append(managementButton('다른 앱으로 공유', async () => {
    try { await navigator.share({ title: '오쭈다노트', url: url.href }); }
    catch (error) { if (error.name !== 'AbortError') managementMessage.textContent = '링크 복사를 이용해 주세요.'; }
  }));
}
function selectCollection(mode) {
  feedMode = mode; message(''); showFeed();
  $('#feed-title').textContent = mode === 'all' ? '사진 카드' : '메모함';
  $('#note-collection-tabs').hidden = mode === 'all';
  document.querySelectorAll('[data-collection]').forEach(button => {
    const selected = button.dataset.collection === mode;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  for (const nav of document.querySelectorAll('.side-nav button, .bottomnav button')) {
    const selected = mode === 'all' ? nav.dataset.show === 'feed' : nav.dataset.show === 'saved';
    nav.classList.toggle('on', selected);
    if (selected) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current');
  }
  loadFeed();
}
function installFeatures() {
  const nickname = $('input[name="identity"][value="nickname"]');
  nickname.disabled = false; nickname.closest('label').classList.remove('disabled-choice');
  nickname.closest('label').title = '선택하면 월드 닉네임으로 공개됩니다';
  featureMessage = node('p', 'note-feature-message'); featureMessage.hidden = true;
  featureMessage.setAttribute('role', 'status'); featureMessage.setAttribute('aria-live', 'polite');
  noticeElement = node('aside', 'note-notice'); noticeElement.hidden = true;
  noticeElement.setAttribute('aria-label', '노트 운영 안내');
  $('.note-tools').after(noticeElement, featureMessage);
  for (const nav of document.querySelectorAll('.side-nav, .bottomnav')) {
    const saved = nav.querySelector('button:nth-child(2)');
    if (saved) { saved.disabled = false; saved.removeAttribute('title'); saved.dataset.show = 'saved'; }
  }
  const collectionTabs = node('div', 'tabs note-collection-tabs'); collectionTabs.id = 'note-collection-tabs';
  collectionTabs.setAttribute('role', 'group'); collectionTabs.setAttribute('aria-label', '메모함 종류'); collectionTabs.hidden = true;
  for (const [mode, label] of [['saved', '저장한 카드'], ['mine', '내 카드']]) {
    const button = node('button', '', label); button.type = 'button'; button.dataset.collection = mode;
    button.setAttribute('aria-pressed', 'false'); button.addEventListener('click', () => selectCollection(mode)); collectionTabs.append(button);
  }
  $('.feed-column').prepend(collectionTabs);
  const sorts = $('.feed-column > .tabs:not(.note-collection-tabs)'); sorts.replaceChildren();
  for (const [sort, label] of [['latest', '최근순'], ['popular', '인기있는 · 7일']]) {
    const button = node('button', sort === feedSort ? 'selected' : '', label); button.type = 'button';
    button.dataset.sort = sort; button.setAttribute('aria-pressed', String(sort === feedSort));
    button.addEventListener('click', () => {
      if (feedSort === sort) return; feedSort = sort;
      sorts.querySelectorAll('button').forEach(item => {
        item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button));
      }); loadFeed();
    }); sorts.append(button);
  }
  const panel = $('#search-panel'), toggle = $('#search-toggle');
  toggle.disabled = false; toggle.removeAttribute('title'); toggle.setAttribute('aria-label', '카드 검색');
  const form = node('form', 'note-search-form');
  const label = node('label', '', '카드 검색'); label.htmlFor = 'tag-search';
  const selector = node('select'); selector.id = 'note-search-kind'; selector.setAttribute('aria-label', '검색 범위');
  for (const [value, title] of [['body', '본문'], ['tag', '태그 일치']]) {
    const option = node('option', '', title); option.value = value; selector.append(option);
  }
  const input = node('input'); input.id = 'tag-search'; input.type = 'search'; input.maxLength = 100;
  input.placeholder = '검색어를 입력하세요';
  const search = node('button', 'button primary', '검색'); search.type = 'submit';
  const reset = node('button', 'button', '초기화'); reset.type = 'button';
  form.append(label, selector, input, search, reset); panel.replaceChildren(form);
  form.addEventListener('submit', event => {
    event.preventDefault(); feedTerm = input.value.trim(); feedSearchKind = selector.value;
    if (feedTerm.startsWith('#')) { feedTerm = feedTerm.slice(1); feedSearchKind = 'tag'; selector.value = 'tag'; }
    loadFeed();
  });
  reset.addEventListener('click', () => { input.value = ''; feedTerm = ''; loadFeed(); input.focus(); });
  input.addEventListener('search', () => { if (!input.value && feedTerm) { feedTerm = ''; loadFeed(); } });
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) input.focus();
  });
}

function draftContent() {
  return { body: text.value, tags: tags.value, background_key: backgroundKey, kind, parent_id: parentId };
}
function restoreDraft(content) {
  if (!content || backdrop.hidden || editingId || composerUserId !== session?.user?.id) return;
  kind = content.kind; parentId = content.parent_id; backgroundKey = content.background_key;
  text.value = content.body; tags.value = content.tags;
  $('input[name="identity"][value="anonymous"]').checked = true;
  $('.compose-photo').classList.toggle('image-forest', backgroundKey === '11');
  $('.compose-photo').classList.toggle('image-lake', backgroundKey === '10');
  $('#compose-title').textContent = kind === 'comment' ? '답글 카드 쓰기' : '새 카드 쓰기';
  $('#compose-context').textContent = kind === 'comment' ? '보관한 답글은 원래 카드에 등록됩니다.' : '사진 위에 마음을 적어 주세요.';
  updateComposer();
}
function recordDraft() {
  if (!draftController || editingId || backdrop.hidden || draftLoading || !session?.user) return;
  try { draftController.change(draftContent()); } catch (error) { draftStatus.textContent = error.message; }
}
function setComposerInputs() {
  const disabled = busy || draftLoading;
  text.disabled = disabled; tags.disabled = disabled;
  document.querySelectorAll('input[name="identity"]').forEach(input => { input.disabled = disabled; });
  draftTools?.querySelectorAll('button').forEach(button => { button.disabled = disabled; });
}
function confirmDraftAction(action) {
  draftConfirm.replaceChildren(node('p', '', action === 'reload'
    ? '지금 입력한 내용을 서버의 임시 글로 바꿀까요?' : '지금 입력과 보관 중인 임시 글을 지울까요?'));
  const cancel = node('button', 'button', '취소'); cancel.type = 'button';
  cancel.addEventListener('click', () => { draftConfirm.hidden = true; });
  const apply = node('button', 'button primary', action === 'reload' ? '서버 글 불러오기' : '임시 글 지우기'); apply.type = 'button';
  apply.addEventListener('click', async () => {
    if (draftLoading || busy) return;
    const userId = composerUserId, run = composerRun, epoch = identityEpoch;
    draftLoading = true; setComposerInputs(); updateComposer();
    try {
      if (action === 'reload') {
        const restored = await draftController.reloadRemote();
        if (run === composerRun && epoch === identityEpoch && session?.user?.id === userId) {
          if (restored) restoreDraft(restored); else { text.value = ''; tags.value = ''; }
        }
      } else {
        await draftController.discard();
        if (run === composerRun && epoch === identityEpoch && session?.user?.id === userId) {
          text.value = ''; tags.value = ''; kind = requestedDraftContent.kind; parentId = requestedDraftContent.parent_id;
          restoreDraft({ ...requestedDraftContent, body: '', tags: '' });
        }
      }
      if (run === composerRun && epoch === identityEpoch) draftConfirm.hidden = true;
    } catch (error) { if (run === composerRun && epoch === identityEpoch && session?.user?.id === userId) draftStatus.textContent = error.message || '보관 글을 처리하지 못했어요.'; }
    finally { if (run === composerRun && epoch === identityEpoch) { draftLoading = false; setComposerInputs(); updateComposer(); } }
  });
  draftConfirm.append(cancel, apply); draftConfirm.hidden = false; apply.focus();
}
function installDrafts() {
  if (!client || !window.OjjudaNoteDrafts) return;
  draftTools = node('div', 'note-draft-tools'); draftTools.hidden = true;
  draftStatus = node('p', 'note-draft-status'); draftStatus.setAttribute('role', 'status'); draftStatus.setAttribute('aria-live', 'polite');
  const save = node('button', 'button', '지금 임시 저장'); save.type = 'button';
  save.addEventListener('click', async () => {
    recordDraft(); save.disabled = true;
    try { await draftController.save(); } catch (error) { draftStatus.textContent = error.message || '저장하지 못했어요.'; }
    finally { save.disabled = busy || draftLoading; }
  });
  const restore = node('button', 'button', '보관 글 불러오기'); restore.type = 'button';
  restore.addEventListener('click', () => confirmDraftAction('reload'));
  const discard = node('button', 'button', '임시 글 지우기'); discard.type = 'button';
  discard.addEventListener('click', () => confirmDraftAction('discard'));
  const parent = node('button', 'button', '답글 원글 보기'); parent.type = 'button'; parent.id = 'note-draft-parent'; parent.hidden = true;
  parent.addEventListener('click', () => { if (parentId) { closeComposer(); openCard(parentId); } });
  draftConfirm = node('div', 'note-draft-confirm'); draftConfirm.hidden = true;
  draftTools.append(draftStatus, save, restore, discard, parent, draftConfirm); $('.composer-footer').before(draftTools);
  draftController = window.OjjudaNoteDrafts.create({ rpc: noteRpc, getUserId: () => session?.user?.id || null,
    onStatus: snapshot => { draftStatus.textContent = snapshot.message; } });
}

function parsedTags(raw = tags.value) {
  const values = raw.split(',').map(value => value.trim().replace(/^#/, '').trim()).filter(Boolean);
  return values.length <= 5 && values.every(value => value.length <= 20) && new Set(values).size === values.length ? values : null;
}
function updateComposer() {
  const lines = text.value.replace(/\r\n?/g, '\n').split('\n');
  $('#compose-count').textContent = `${text.value.length} / 200자`;
  const values = parsedTags();
  $('#compose-tag-display').textContent = values?.length ? values.map(value => `#${value}`).join('  ') : '#태그는 사진 아래쪽에 보여요';
  if (!client || !ready) composeMessage.textContent = '노트 연결 확인 후 등록 가능';
  else if (!authKnown) composeMessage.textContent = '로그인 확인 중';
  else if (!session?.user) {
    const link = node(localStage ? 'button' : 'a', '', localStage ? '테스트 로그인' : '대문에서 로그인');
    if (localStage) { link.type = 'button'; link.dataset.stageLogin = ''; }
    else link.href = '/';
    composeMessage.replaceChildren(link);
  } else if (!canWrite()) composeMessage.textContent = writingMessage();
  else if (text.value.length > 200 || lines.length > 8) composeMessage.textContent = '글은 200자·8줄 이내로 작성해 주세요';
  else if (!values) composeMessage.textContent = '태그는 중복 없이 5개까지, 각 20자 이내';
  else composeMessage.textContent = busy ? (editingId ? '수정 중' : '등록 중')
    : $('input[name="identity"]:checked')?.value === 'nickname' ? '월드 닉네임 공개' : '익명 카드';
  submit.disabled = busy || draftLoading || !client || !ready || !session?.user || !canWrite() || !text.value.trim()
    || text.value.length > 200 || text.value.split('\n').length > 8 || !values;
  if (draftTools) draftTools.hidden = !!editingId || !session?.user;
  if ($('#note-draft-parent')) $('#note-draft-parent').hidden = kind !== 'comment' || !parentId;
}
async function openComposer(mode, card = null) {
  if (busy || draftLoading) return;
  const run = ++composerRun, epoch = identityEpoch;
  focusBefore = document.activeElement;
  editingId = card?.is_mine ? card.id : null;
  composerUserId = session?.user?.id || null;
  kind = editingId ? card.kind : mode === 'reply' && stack.length ? 'comment' : 'memo';
  parentId = editingId ? card.parent_id : kind === 'comment' ? stack.at(-1) : null;
  backgroundKey = editingId ? card.background_key : Math.random() < .5 ? '10' : '11';
  $('#compose-title').textContent = editingId ? '내 카드 수정' : kind === 'comment' ? '답글 카드 쓰기' : '새 카드 쓰기';
  $('#compose-context').textContent = editingId ? '글과 태그를 수정할 수 있어요.' : kind === 'comment' ? '이 카드에 답글을 이어 주세요.' : '사진 위에 마음을 적어 주세요.';
  submit.textContent = editingId ? '수정하기' : '등록하기';
  $('.compose-photo').classList.toggle('image-forest', backgroundKey === '11');
  $('.compose-photo').classList.toggle('image-lake', backgroundKey === '10');
  text.value = editingId ? card.body : ''; tags.value = editingId ? card.tags.join(', ') : '';
  const identityMode = editingId && card.identity_mode === 'nickname' ? 'nickname' : 'anonymous';
  $(`input[name="identity"][value="${identityMode}"]`).checked = true;
  requestedDraftContent = draftContent();
  if (draftConfirm) draftConfirm.hidden = true;
  updateComposer(); backdrop.hidden = false; lockPage(true); text.focus();
  if (!editingId && draftController && composerUserId) {
    draftLoading = true; setComposerInputs(); updateComposer();
    try {
      const restored = await draftController.resume(requestedDraftContent);
      if (run === composerRun && epoch === identityEpoch && !backdrop.hidden) restoreDraft(restored);
    }
    catch (error) { if (run === composerRun) draftStatus.textContent = error.message || '임시 글을 불러오지 못했어요.'; }
    finally {
      if (run === composerRun) { draftLoading = false; setComposerInputs(); updateComposer(); if (!backdrop.hidden) text.focus(); }
    }
  }
}

function closeComposer(saveDraft = true) {
  if (busy) return;
  if (saveDraft) recordDraft();
  composerRun++; draftLoading = false; setComposerInputs();
  backdrop.hidden = true; lockPage(false);
  if (focusBefore?.isConnected) focusBefore.focus({ preventScroll: true });
}
async function publishCard() {
  if (busy || submit.disabled || !client || !ready) return;
  let body = text.value.replace(/\r\n?/g, '\n').trim(), values = parsedTags();
  if (!body || body.length > 200 || body.split('\n').length > 8 || !values) return;
  const editId = editingId, actionUserId = composerUserId;
  const identityMode = $('input[name="identity"]:checked')?.value === 'nickname' ? 'nickname' : 'anonymous';
  let draftToken = null, publishKind = kind, publishParent = parentId, publishBackground = backgroundKey;
  recordDraft(); busy = true; setComposerInputs(); updateComposer();
  if (!editId && draftController) {
    try {
      draftToken = await draftController.preparePublish();
      body = draftToken.content.body.replace(/\r\n?/g, '\n').trim(); values = parsedTags(draftToken.content.tags);
      publishKind = draftToken.content.kind; publishParent = draftToken.content.parent_id; publishBackground = draftToken.content.background_key;
      if (!body || body.length > 200 || body.split('\n').length > 8 || !values) throw new Error('보관된 내용을 확인해 주세요.');
    } catch (error) {
      draftController.cancelPublish(); busy = false; setComposerInputs(); updateComposer();
      composeMessage.textContent = error.message || '임시 글 저장을 확인한 뒤 등록해 주세요.'; return;
    }
  }
  // getUser revalidates the identity; the DB checks membership and ownership with RLS.
  let identity, authError;
  try {
    ({ data: identity, error: authError } = await client.auth.getUser());
  } catch (cause) { authError = cause; }
  if (session?.user?.id !== actionUserId) { busy = false; setComposerInputs(); updateComposer(); return; }
  if (authError || !identity?.user?.id) {
    draftController?.cancelPublish(); busy = false; setComposerInputs(); receiveAuth(null);
    composeMessage.textContent = '대문에서 로그인해 주세요'; return;
  }
  if (identity.user.id !== actionUserId) {
    draftController?.cancelPublish(); busy = false; setComposerInputs(); updateComposer(); composeMessage.textContent = '계정이 변경됐어요. 작성창을 다시 열어 주세요'; return;
  }
  let data, error;
  try {
    const request = editId ? query().from('cards').update({ body, tags: values, identity_mode: identityMode }).eq('id', editId)
      : query().from('cards').insert({
        author_id: identity.user.id, kind: publishKind, parent_id: publishParent, body, tags: values, background_key: publishBackground, identity_mode: identityMode
      });
    ({ data, error } = await request.select('id').maybeSingle());
  } catch (cause) { error = cause; }
  if (session?.user?.id !== actionUserId) { busy = false; setComposerInputs(); updateComposer(); return; }
  if (!error && data?.id && draftToken) {
    try {
      const cleanup = await draftController.published(draftToken);
      if (!cleanup.cleared && session?.user?.id === actionUserId) message('카드는 등록됐어요. 다른 창의 임시 글이 남아 있으니 확인해 주세요.');
    } catch (cleanupError) {
      if (session?.user?.id === actionUserId) message('카드는 등록됐어요. 임시 글의 정리 상태를 확인해 주세요.');
    }
  } else if (draftToken) draftController.cancelPublish();
  busy = false; setComposerInputs();
  if (session?.user?.id !== actionUserId) { updateComposer(); return; }
  if (error || !data?.id) {
    console.warn('Note publish:', error);
    updateComposer(); composeMessage.textContent = editId ? '수정하지 못했어요. 권한과 연결을 확인해 주세요' : '등록하지 못했어요. 다시 시도해 주세요'; return;
  }
  text.value = ''; tags.value = '';
  closeComposer(false);
  await refreshCards(editId || publishKind === 'comment');
}
function updateAuth() {
  const accountText = !authKnown ? '계정 확인 중'
    : session?.user ? (localStage ? '테스트 계정 연결됨' : `오쭈다 계정 연결됨${worldCoins === null ? '' : ` · ${worldCoins.toLocaleString('ko-KR')}쭈`}`)
      : (localStage ? '테스트 로그인 필요' : '대문에서 로그인해 주세요');
  $('#account-status').textContent = accountText;
  if ($('#mobile-account-status')) $('#mobile-account-status').textContent = accountText;
  if ($('#note-blocks')) $('#note-blocks').hidden = !session?.user;
  if ($('#note-moderation')) $('#note-moderation').hidden = !session?.user || !moderator;
  if (stageAuth) {
    stageAuth.toggle.textContent = session?.user ? '테스트 로그아웃' : '테스트 로그인';
    if (session?.user) stageAuth.form.hidden = true;
  }
  updateComposer();
}

async function loadWorldBalance(userId) {
  const version = ++balanceRun;
  worldCoins = null;
  if (!userId || localStage) { updateAuth(); return; }
  let data, error;
  try { ({ data, error } = await client.from('user_private').select('coins').eq('user_id', userId).maybeSingle()); }
  catch (cause) { error = cause; }
  if (version !== balanceRun || session?.user?.id !== userId) return;
  if (!error && data && Number.isFinite(Number(data.coins))) worldCoins = Number(data.coins);
  updateAuth();
}

// Note management uses Note RPCs only. World identity and coin rows are never mutated.
const management = node('div', 'dialog-backdrop');
management.id = 'management-backdrop'; management.hidden = true;
const managementPanel = node('section', 'management-dialog');
managementPanel.setAttribute('role', 'dialog'); managementPanel.setAttribute('aria-modal', 'true');
managementPanel.setAttribute('aria-labelledby', 'management-title');
const managementHeader = node('header', 'management-head');
const managementTitle = node('h2'); managementTitle.id = 'management-title';
const managementClose = node('button', 'icon-button'); managementClose.type = 'button';
managementClose.setAttribute('aria-label', '관리창 닫기'); managementClose.append(icon('close'));
managementHeader.append(managementTitle, managementClose);
const managementBody = node('div', 'management-body');
const managementMessage = node('p', 'management-message');
managementMessage.setAttribute('role', 'status'); managementMessage.setAttribute('aria-live', 'polite');
const managementFooter = node('footer', 'management-footer');
managementPanel.append(managementHeader, managementBody, managementMessage, managementFooter);
management.append(managementPanel); document.body.append(management);
let managementFocus = null, managementBusy = false, managementRun = 0;

function lockPage(locked) {
  $('.shell').inert = locked;
  document.body.style.overflow = locked ? 'hidden' : '';
}
function managementButton(label, action, primary = false) {
  const button = node('button', primary ? 'button primary' : 'button', label);
  button.type = 'button'; button.addEventListener('click', action); return button;
}
function showManagement(title) {
  if (management.hidden) managementFocus = document.activeElement;
  managementRun++; managementBusy = false; managementClose.disabled = false;
  managementTitle.textContent = title; managementBody.replaceChildren();
  managementMessage.textContent = ''; managementFooter.replaceChildren();
  management.hidden = false; lockPage(true);
  managementClose.focus();
  return managementRun;
}
function closeManagement(force = false) {
  if (managementBusy && !force) return;
  managementRun++; management.hidden = true; managementBusy = false;
  managementBody.replaceChildren(); managementFooter.replaceChildren(); managementMessage.textContent = '';
  lockPage(false);
  if (managementFocus?.isConnected) managementFocus.focus({ preventScroll: true });
}
function cancelManagement() { managementFooter.append(managementButton('취소', () => closeManagement())); }
function reasonField(label) {
  const fieldLabel = node('label', 'field-label', label); fieldLabel.htmlFor = 'note-reason';
  const field = node('textarea', 'management-reason'); field.id = 'note-reason';
  field.rows = 4; field.required = true; field.minLength = 2; field.maxLength = 500;
  field.placeholder = '2자 이상, 500자 이내로 적어 주세요';
  managementBody.append(fieldLabel, field); return field;
}
function validReason(field) {
  if (!field.reportValidity()) return false;
  if (field.value.trim().length >= 2) return true;
  managementMessage.textContent = '공백을 제외하고 사유를 2자 이상 적어 주세요.';
  field.focus(); return false;
}
async function noteRpc(name, parameters = {}) {
  const { data, error } = await query().rpc(name, parameters);
  if (error) throw error;
  return data;
}
async function managementAction(action, after) {
  if (managementBusy || !session?.user) return;
  const run = managementRun, userId = session.user.id;
  managementBusy = true; managementMessage.textContent = '처리 중이에요.';
  managementPanel.querySelectorAll('button, textarea').forEach(item => { item.disabled = true; });
  try {
    await action();
    if (run !== managementRun || session?.user?.id !== userId) return;
    managementBusy = false;
    await after();
  } catch (error) {
    if (run !== managementRun) return;
    console.warn('Note management:', error);
    managementMessage.textContent = '처리하지 못했어요. 로그인과 권한을 확인한 뒤 다시 시도해 주세요.';
  } finally {
    if (run === managementRun) {
      managementBusy = false;
      managementPanel.querySelectorAll('button, textarea').forEach(item => { item.disabled = false; });
    }
  }
}
async function refreshCards(keepDetail = false) {
  feedRun++; detailRun++; cache.clear();
  slot.replaceChildren(); replies.replaceChildren(); $('#reply-count').textContent = '0';
  if (!keepDetail || !stack.length) showFeed();
  await loadFeed();
  if (keepDetail && stack.length) await renderDetail();
}
function manageCard(id) {
  const card = cache.get(id);
  if (!card || !session?.user) return;
  showManagement(card.is_mine ? '내 카드 관리' : '카드 관리');
  managementBody.append(node('p', 'management-help', '노트의 글과 차단 설정을 관리합니다.'));
  if (card.is_mine) {
    managementBody.append(managementButton('수정하기', () => { closeManagement(); openComposer('edit', card); }));
    managementBody.append(managementButton('삭제하기', () => confirmDelete(card)));
  } else {
    managementBody.append(managementButton('신고하기', () => reportCard(card)));
    managementBody.append(managementButton('작성자 차단', () => confirmBlock(card)));
  }
  cancelManagement();
}
function confirmDelete(card) {
  showManagement('카드를 삭제할까요?');
  managementBody.append(node('p', 'management-help', '이 카드와 이어진 모든 답글이 함께 삭제됩니다. 삭제한 내용은 되돌릴 수 없어요.'));
  cancelManagement();
  managementFooter.append(managementButton('카드와 답글 삭제', () => managementAction(async () => {
    const { data, error } = await query().from('cards').delete().eq('id', card.id).select('id').maybeSingle();
    if (error || !data?.id) throw error || new Error('Card is unavailable');
  }, async () => { closeManagement(); await refreshCards(false); }), true));
}
function reportCard(card) {
  if (!noteState?.reports_enabled) { message('신고 접수가 잠시 쉬고 있어요.'); return; }
  showManagement('카드 신고');
  managementBody.append(node('p', 'management-help', '신고 사유를 적어 주세요. 노트 관리자가 확인합니다.'));
  const reason = reasonField('신고 사유'); cancelManagement();
  managementFooter.append(managementButton('신고 보내기', () => {
    if (!validReason(reason)) return;
    const value = reason.value.trim();
    managementAction(() => noteRpc('report_card', { p_card_id: card.id, p_reason: value }), () => {
      showManagement('신고를 접수했어요');
      managementBody.append(node('p', 'management-help', '노트 관리자가 내용을 확인합니다.'));
      managementFooter.append(managementButton('닫기', () => closeManagement(), true));
    });
  }, true));
  reason.focus();
}
function confirmBlock(card) {
  showManagement('작성자를 차단할까요?');
  managementBody.append(node('p', 'management-help', '이 작성자의 카드와 이어진 답글이 내 노트 화면에서 숨겨집니다. 차단 목록에서 해제할 수 있어요. 월드의 차단 설정에는 적용되지 않습니다.'));
  cancelManagement();
  managementFooter.append(managementButton('노트에서 차단', () => managementAction(
    () => noteRpc('block_card_author', { p_card_id: card.id }),
    async () => { closeManagement(); await refreshCards(false); }
  ), true));
}
async function showBlocks() {
  if (!session?.user) return;
  const run = showManagement('노트 차단 목록');
  state(managementBody, '차단 목록을 불러오는 중이에요.');
  try {
    const data = await noteRpc('list_blocks');
    if (run !== managementRun) return;
    managementBody.replaceChildren(node('p', 'management-help', '차단을 해제하면 해당 작성자의 카드를 다시 볼 수 있어요.'));
    if (!data?.length) managementBody.append(node('p', 'reply-empty', '차단한 작성자가 없어요.'));
    (data || []).forEach((block, index) => {
      const row = node('div', 'management-row');
      const label = node('span'); label.append(node('strong', '', `차단한 작성자 ${index + 1}`), node('small', '', `${dateLabel(block.created_at)} 차단`));
      row.append(label, managementButton('차단 해제', () => managementAction(
        () => noteRpc('unblock_author', { p_block_id: block.block_id }),
        async () => { await refreshCards(false); await showBlocks(); }
      ))); managementBody.append(row);
    });
  } catch (error) {
    if (run !== managementRun) return;
    console.warn('Note blocks:', error); state(managementBody, '차단 목록을 불러오지 못했어요.');
    managementFooter.append(managementButton('다시 시도', showBlocks));
  }
}
async function loadModerator(userId) {
  const run = ++moderatorRun;
  moderator = false; updateAuth();
  if (!userId) return;
  try {
    const data = await noteRpc('is_note_moderator');
    if (run !== moderatorRun || session?.user?.id !== userId) return;
    moderator = data === true; updateAuth();
  } catch (error) { console.warn('Note moderation role:', error); }
}
async function showModeration() {
  if (!session?.user || !moderator) return;
  const run = showManagement('노트 신고 관리');
  state(managementBody, '신고를 불러오는 중이에요.');
  try {
    const data = await noteRpc('moderation_queue');
    if (run !== managementRun) return;
    managementBody.replaceChildren(node('p', 'management-help', '노트의 카드와 답글만 처리합니다. 숨김 처리하면 이어진 답글도 공개 화면에서 숨겨집니다.'));
    if (!data?.length) managementBody.append(node('p', 'reply-empty', '접수된 신고가 없어요.'));
    for (const report of data || []) {
      const row = node('article', 'moderation-item');
      row.append(node('p', 'moderation-date', `${dateLabel(report.created_at)} · ${report.status === 'resolved' ? '처리 완료' : '접수'} · ${report.hidden ? '숨김' : '공개'}`));
      row.append(node('blockquote', '', report.body || '삭제된 카드'));
      row.append(node('p', 'moderation-reason', `신고 사유: ${report.reason || ''}`));
      const actions = node('div', 'moderation-actions');
      if (report.card_id) actions.append(managementButton(report.hidden ? '카드 복구' : '카드 숨김', () => confirmModeration(report)));
      if (report.status !== 'resolved') actions.append(managementButton('처리 완료', () => managementAction(
        () => noteRpc('resolve_report', { p_report_id: report.report_id }), showModeration
      )));
      row.append(actions); managementBody.append(row);
    }
  } catch (error) {
    if (run !== managementRun) return;
    console.warn('Note moderation queue:', error); state(managementBody, '신고를 불러오지 못했어요. 관리자 권한을 확인해 주세요.');
    managementFooter.append(managementButton('다시 시도', showModeration));
  }
}
function confirmModeration(report) {
  const hide = !report.hidden;
  showManagement(hide ? '카드 숨김 처리' : '카드 복구');
  managementBody.append(node('p', 'management-help', hide ? '카드와 이어진 답글을 공개 화면에서 숨깁니다.' : '카드와 이어진 답글을 다시 공개합니다. 별도로 숨김 처리된 답글은 유지됩니다.'));
  const reason = reasonField('처리 사유');
  managementFooter.append(managementButton('돌아가기', showModeration));
  managementFooter.append(managementButton(hide ? '숨김 처리' : '복구', () => {
    if (!validReason(reason)) return;
    const value = reason.value.trim();
    managementAction(() => noteRpc('moderate_card', { p_card_id: report.card_id, p_hidden: hide, p_reason: value }),
      async () => { await refreshCards(false); await showModeration(); });
  }, true));
  reason.focus();
}
function installManagement() {
  const account = node('p', 'mobile-account-status'); account.id = 'mobile-account-status';
  const tools = node('div', 'note-tools');
  const blocks = managementButton('차단 목록', showBlocks); blocks.id = 'note-blocks'; blocks.hidden = true;
  const reports = managementButton('관리자 모드', () => {
    if (!moderator || !session?.user) return;
    window.location.assign('/world.html?admin=note');
  }); reports.id = 'note-moderation'; reports.hidden = true;
  tools.append(account, blocks, reports); $('#connection-status').after(tools);
  managementClose.addEventListener('click', () => closeManagement());
  management.addEventListener('click', event => { if (event.target === management) closeManagement(); });
  document.addEventListener('keydown', event => {
    const dialog = !management.hidden ? managementPanel : !backdrop.hidden ? $('.composer') : null;
    if (!dialog) return;
    if (event.key === 'Escape' && !management.hidden) { event.preventDefault(); closeManagement(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      .filter(item => !item.hidden && item.getClientRects().length > 0);
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0], last = focusable.at(-1);
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  });
}

function installStageAuth() {
  if (!localStage || !client) return;
  const shell = node('div', 'stage-auth');
  const toggle = node('button', 'button', '테스트 로그인');
  toggle.type = 'button';
  const form = node('form', 'stage-auth-form');
  form.hidden = true;
  const email = node('input'), password = node('input');
  email.type = 'email'; email.required = true; email.autocomplete = 'username';
  email.placeholder = '이메일'; email.setAttribute('aria-label', '테스트 계정 이메일');
  password.type = 'password'; password.required = true; password.autocomplete = 'current-password';
  password.placeholder = '비밀번호'; password.setAttribute('aria-label', '테스트 계정 비밀번호');
  const login = node('button', 'button primary', '로그인');
  login.type = 'submit';
  const message = node('span', 'stage-auth-message');
  message.setAttribute('role', 'status');
  form.append(email, password, login, message);
  shell.append(toggle, form);
  $('#connection-status').after(shell);
  stageAuth = { toggle, form, email };
  toggle.addEventListener('click', async () => {
    if (session?.user) {
      toggle.disabled = true;
      const { error } = await client.auth.signOut();
      toggle.disabled = false;
      if (error) message.textContent = '로그아웃 실패';
    } else {
      form.hidden = !form.hidden;
      if (!form.hidden) email.focus();
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    login.disabled = true; message.textContent = '로그인 중';
    try {
      const { error } = await client.auth.signInWithPassword({ email: email.value, password: password.value });
      message.textContent = error ? '로그인 실패' : '';
    } catch {
      message.textContent = '로그인 실패';
    } finally {
      password.value = ''; login.disabled = false;
    }
  });
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-stage-login]')) {
    if (stageAuth) { closeComposer(); stageAuth.form.hidden = false; stageAuth.email.focus(); }
    return;
  }
  const reaction = event.target.closest('[data-reaction]');
  if (reaction && !reaction.disabled) { toggleReaction(reaction.dataset.cardId, reaction.dataset.reaction); return; }
  const share = event.target.closest('[data-share-card]');
  if (share) { shareCard(share.dataset.shareCard); return; }
  const saved = event.target.closest('[data-show="saved"]');
  if (saved) { selectCollection('saved'); return; }
  const manage = event.target.closest('[data-manage-card]');
  if (manage) { manageCard(manage.dataset.manageCard); return; }
  const open = event.target.closest('[data-open]');
  if (open && !open.disabled) { openCard(open.dataset.open); return; }
  const compose = event.target.closest('[data-compose]');
  if (compose) { openComposer(compose.dataset.compose); return; }
  const show = event.target.closest('[data-show="feed"]');
  if (show) { show.classList.contains('back-button') ? goBack() : selectCollection('all'); return; }
  if (event.target.closest('[data-more-feed]')) { loadFeed(true); return; }
  const retryFeed = event.target.closest('[data-retry-feed]');
  if (retryFeed) { retryFeed.remove(); loadFeed(retryFeed.dataset.retryFeed === 'more'); return; }
  if (event.target.closest('[data-more-replies]')) { loadReplies(stack.at(-1), detailRun, true); return; }
  const retryReplies = event.target.closest('[data-retry-replies]');
  if (retryReplies) { retryReplies.remove(); loadReplies(stack.at(-1), detailRun, retryReplies.dataset.retryReplies === 'more'); }
});
$('#close-composer').addEventListener('click', closeComposer);
backdrop.addEventListener('click', event => { if (event.target === backdrop) closeComposer(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !backdrop.hidden) closeComposer(); });
text.addEventListener('input', () => { updateComposer(); recordDraft(); });
tags.addEventListener('input', () => { updateComposer(); recordDraft(); });
submit.addEventListener('click', publishCard);
document.querySelectorAll('input[name="identity"]').forEach(input => input.addEventListener('change', updateComposer));

function receiveAuth(current) {
  const changed = session?.user?.id !== current?.user?.id;
  session = current; authKnown = true;
  if (changed) {
    identityEpoch++;
    // Remove prior-account content immediately, before asynchronous requests finish.
    worldCoins = null; balanceRun++; moderator = false; moderatorRun++;
    noteState = null; noteStateRun++; reactionPending.clear(); message('');
    composerRun++; draftLoading = false; draftController?.setUser(current?.user?.id); setComposerInputs();
    notificationController?.close?.();
    feedRun++; detailRun++; cache.clear(); stack.length = 0;
    slot.replaceChildren(); replies.replaceChildren(); state(list, '카드를 불러오는 중이에요.');
    closeManagement(true); backdrop.hidden = true; lockPage(false);
    text.value = ''; tags.value = ''; editingId = null; composerUserId = null;
    showFeed(!initialCardId);
  }
  updateAuth();
  // Auth callbacks must finish before using Supabase for further requests.
  setTimeout(() => {
    if (session?.user?.id !== current?.user?.id) return;
    draftController?.setUser(current?.user?.id);
    loadWorldBalance(current?.user?.id); loadModerator(current?.user?.id); loadNoteState();
    notificationController?.refresh?.();
    if (changed) loadFeed();
    else consumeInitialCard();
  }, 0);
}

installManagement(); installFeatures(); installStageAuth(); installDrafts();
window.OjjudaNoteSupport?.install({ client, getUserId: () => session?.user?.id || null });
notificationController = window.OjjudaNoteNotifications?.install({
  client, getUserId: () => session?.user?.id || null,
  onOpenCard: id => openCard(id),
  onOpenInquiry: id => window.OjjudaNoteSupport?.open?.(id)
});
if (client) {
  client.auth.onAuthStateChange((_event, current) => {
    authEventVersion++;
    receiveAuth(current);
  });
  const initialAuthVersion = authEventVersion;
  client.auth.getSession().then(({ data, error }) => {
    if (authEventVersion !== initialAuthVersion) return;
    if (error) console.warn('Note Auth:', error);
    receiveAuth(error ? null : data?.session || null);
  }).catch(error => {
    console.warn('Note Auth:', error);
    if (authEventVersion === initialAuthVersion) { authKnown = true; updateAuth(); loadNoteState(); consumeInitialCard(); }
  });
  loadFeed();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    loadWorldBalance(session?.user?.id); loadNoteState();
    if (backdrop.hidden && management.hidden) refreshCards(stack.length > 0);
  });
} else {
  authKnown = true; banner('노트 연결 설정을 확인해 주세요');
  state(list, '카드를 불러올 수 없어요.'); updateAuth();
}
