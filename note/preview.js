// World and Note use the same origin, Supabase project, and default Auth storage.
const $ = selector => document.querySelector(selector);
const config = window.OJJUDA_CONFIG;
const localStage = config?.localStage === true && ['localhost', '127.0.0.1'].includes(location.hostname)
  && config.supabaseUrl === 'https://jucuqqbynilwlhqxyzrd.supabase.co';
const client = config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null;
const columns = 'id,kind,parent_id,body,display_name,tags,background_key,created_at,like_count,reply_count,is_mine,is_liked,is_bookmarked,identity_mode,style,photo_key,style_until,photo_until,archive_due_at,permanent';
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
let nearbyPosition = null, nearbyOffset = 0, writingPosition = null, eventPosition = null;
let nearbySnapshot = null;
let publishRequestId = null, locationRun = 0;
let replyDueChecking = false, replyDueRun = 0;
let photoRequestId = null;
let eventMap = null;
let composerMapFetchRun = 0, composerMapTimer = null;
let feedSnapshot = null, feedLoading = false, replyLoading = false;
let noteState = null, noteStateRun = 0, noticeElement = null, featureMessage = null;
let initialCardId = new URL(location.href).searchParams.get('card');
const reactionPending = new Set();
let draftController = null, draftTools = null, draftStatus = null, draftConfirm = null, draftLoading = false;
let requestedDraftContent = null, composerRun = 0, identityEpoch = 0;
let notificationController = null;
let retentionButton = null, retentionRun = 0;
const validCardId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
const PHOTO_FIRST = 10, PHOTO_LAST = 111, PHOTO_PAGE_SIZE = 12;
const FONT_CODES = ['default', 'round', 'serif', 'handwriting', 'mono'];
const EFFECT_CODES = ['none', 'sparkle', 'frame', 'rain', 'shimmer', 'rainbow', 'snow',
  'starlight', 'fireflies', 'petals', 'bubbles', 'aurora', 'confetti', 'sunbeams',
  'mist', 'ocean', 'heartbeat', 'orbit', 'glitter', 'meteor', 'leaves', 'neon', 'dawn'];
const COLOR_PALETTE = {
  red: { label: '빨강', solid: '#dc3049', wash: '#dc304963', box: '#b31d37db' },
  yellow: { label: '노랑', solid: '#e5a800', wash: '#ffd63f70', box: '#ffdf59e8' },
  green: { label: '초록', solid: '#238d56', wash: '#43ae6c69', box: '#21854ee3' },
  blue: { label: '파랑', solid: '#3c78d9', wash: '#3e84df69', box: '#2659a8dd' },
  purple: { label: '보라', solid: '#8855cb', wash: '#8b5bd66e', box: '#6d40addd' },
  black: { label: '검정', solid: '#151622', wash: '#10132099', box: '#121425e8' },
  white: { label: '흰색', solid: '#ffffff', wash: '#ffffff75', box: '#fffffff0' }
};
let photoPage = 0;
let selectedPhotoKey = null;
function photoAssetKey(value) {
  const key = String(value ?? '');
  return /^\d{2,3}$/.test(key) && Number(key) >= PHOTO_FIRST && Number(key) <= PHOTO_LAST ? key : null;
}
function setPhotoBackground(element, value) {
  const key = photoAssetKey(value);
  element.classList.toggle('note-plain', !key);
  element.classList.remove('image-forest', 'image-lake');
  element.style.backgroundImage = key ? `url("assets/${key}.jpg")` : '';
}
function colorLuminance(hex) {
  const channels = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = channels.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
}
function colorContrast(first, second) {
  const values = [colorLuminance(first), colorLuminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}
function applyVisualStyle(element, style = {}) {
  for (const cls of [...element.classList]) {
    if (/^note-(?:theme|font|size|effect)-/.test(cls)) element.classList.remove(cls);
  }
  if (['rose', 'night'].includes(style.theme)) element.classList.add(`note-theme-${style.theme}`);
  if (FONT_CODES.includes(style.font) && style.font !== 'default') element.classList.add(`note-font-${style.font}`);
  if (['large', 'small'].includes(style.size)) element.classList.add(`note-size-${style.size}`);
  if (EFFECT_CODES.includes(style.effect) && style.effect !== 'none') element.classList.add(`note-effect-${style.effect}`);
  const textColor = COLOR_PALETTE[style.textColor];
  const backgroundColor = COLOR_PALETTE[style.backgroundColor];
  const boxColor = COLOR_PALETTE[style.boxColor];
  const textHex = textColor?.solid || '#ffffff';
  const boxHex = boxColor?.box || '#17203ab8';
  element.style.setProperty('--note-text-color', textHex);
  element.style.setProperty('--note-bg-color', backgroundColor?.wash || 'transparent');
  element.style.setProperty('--note-box-color', boxHex);
  element.classList.toggle('note-low-contrast', colorContrast(textHex, boxHex) < 4.5);
  element.style.setProperty('--note-outline', colorLuminance(boxHex) > .25 ? '#101020' : '#ffffff');
}


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
function archiveDueThisMonth(value) {
  const due = Date.parse(value);
  if (!Number.isFinite(due)) return false;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric' })
    .formatToParts(new Date());
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  // The deadline may be represented as the first UTC day after the Korean month ends.
  const end = Date.UTC(year, month, 2) - 9 * 3600000;
  return due >= Date.now() && due < end;
}
function parentArchiveDue(card) { return card?.effective_archive_due_at || card?.archive_due_at; }
function replyContext() {
  const due = parentArchiveDue(cache.get(parentId));
  return archiveDueThisMonth(due)
    ? `상위 카드가 ${dateLabel(due)}에 공개 종료될 예정이에요. 이 답글도 함께 삭제될 수 있습니다.`
    : '이 카드에 답글을 이어 주세요. 상위 카드가 삭제되면 답글도 함께 삭제돼요.';
}
async function refreshReplyArchiveNotice(parent, run) {
  if (!validCardId(parent) || !client) return;
  const check = ++replyDueRun;
  replyDueChecking = true; updateComposer();
  try {
    const card = await noteRpc('get_card', { p_id: parent, p_lat: null, p_lon: null });
    if (run !== composerRun || check !== replyDueRun || backdrop.hidden || kind !== 'comment' || parentId !== parent) return;
    if (card) cache.set(parent, card);
    $('#compose-context').textContent = card ? replyContext() : '상위 카드를 찾지 못했어요. 답글을 등록할 수 없을 수 있어요.';
  } catch {
    if (run === composerRun && check === replyDueRun && !backdrop.hidden && kind === 'comment')
      $('#compose-context').textContent = '상위 카드 공개 종료일을 확인하지 못했어요. 등록 전에 다시 확인해 주세요.';
  } finally {
    if (run === composerRun && check === replyDueRun) { replyDueChecking = false; updateComposer(); }
  }
}

function cardElement(card, compact = false, expanded = false) {
  const item = node('article', compact ? 'reply-card' : 'photo-card');
  if (card.kind === 'event') item.classList.add('note-event-card');
  item.dataset.cardId = card.id;
  const open = node('button', 'photo-open');
  open.type = 'button';
  open.dataset.open = card.id;
  open.setAttribute('aria-label', '카드 크게 보기');
  if (expanded) { open.disabled = true; delete open.dataset.open; }
  const style = card.style && typeof card.style === 'object' ? card.style : {};
  const visiblePhoto = card.photo_key || card.background_key;
  const photo = node('span', 'photo');
  setPhotoBackground(photo, visiblePhoto);
  applyVisualStyle(photo, style);
  const quote = node('span', 'card-quote');
  const hiddenEvent = card.kind === 'event' && card.body == null;
  const body = hiddenEvent ? '범위 안에서만 보이는 이벤트' : typeof card.body === 'string' ? card.body : '';
  body.split('\n').forEach((line, index) => {
    if (index) quote.append(document.createElement('br'));
    quote.append(document.createTextNode(line));
  });
  if (body.length > 120 && (!style.size || style.size === 'normal')) quote.style.fontSize = compact ? '15px' : '18px';
  else if (body.length > 70 && (!style.size || style.size === 'normal')) quote.style.fontSize = compact ? '17px' : '22px';
  quote.style.overflowWrap = 'anywhere';
  const tagRow = node('span', 'card-tags');
  for (const tag of Array.isArray(card.tags) ? card.tags.slice(0, 5) : []) {
    tagRow.append(node('span', '', `#${tag}`));
  }
  photo.append(node('span', 'photo-shade'), node('span', 'note-color-wash'), quote, tagRow);
  open.append(photo);
  item.append(open);

  const meta = node('div', 'card-meta');
  const person = node('span');
  person.append(node('strong', '', card.display_name || '익명'));
  person.append(node('small', '', dateLabel(card.created_at)));
  meta.append(node('span', visiblePhoto === '11' ? 'avatar avatar-green' : 'avatar', 'ㅇ'), person);
  if (!compact) {
    if (typeof card.distance_band === 'string') {
      const label = card.distance_band === '근처' ? '근처 · 약 1km 이내' : card.distance_band;
      meta.append(node('span', 'meta-tail', label));
    } else meta.append(node('span', 'meta-tail', card.kind === 'event' ? '이벤트' : card.kind === 'comment' ? '답글 카드' : '익명카드'));
  }
  item.append(meta);

  if (hiddenEvent) return item;

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
  if (card.kind !== 'event') actions.append(reply, like);
  if (!compact && card.kind !== 'event') {
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
  if (nearbyPosition && !positionIsFresh(nearbyPosition)) nearbyPosition = null;
  const version = ++feedRun;
  feedLoading = true;
  if (!more) {
    feedCursor = null; feedSnapshot = new Date().toISOString();
    nearbyOffset = 0; nearbySnapshot = feedSnapshot;
    if (detail.hidden) cache.clear();
    state(list, '카드를 불러오는 중이에요.'); banner('카드를 불러오는 중');
  } else list.querySelector('[data-more-feed]')?.remove();
  if (feedMode !== 'all' && !session?.user) {
    ready = true; feedLoading = false; banner('');
    state(list, '대문에서 로그인하면 메모함과 내 카드를 볼 수 있어요.'); updateComposer(); return;
  }
  if (feedMode === 'all' && feedSort === 'nearby' && !nearbyPosition) {
    feedLoading = false; ready = true; banner('');
    const note = node('p', 'reply-empty', '정확한 GPS 좌표는 비공개로 저장되고, 다른 사람에게는 근사 거리만 표시돼요. 위치를 허용하면 가까운 카드부터 볼 수 있어요.');
    const button = node('button', 'button primary', '위치 확인'); button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { nearbyPosition = await currentPosition(); if (version === feedRun) loadFeed(); }
      catch { if (version === feedRun) { button.disabled = false; message('위치를 확인하지 못했어요. 권한을 확인한 뒤 다시 눌러 주세요.'); } }
    });
    list.replaceChildren(note, button); return;
  }
  // A prior browser grant can be reused without raising a new permission prompt.
  if (!more && feedMode === 'all' && !feedTerm && feedSort !== 'nearby' && !nearbyPosition) {
    const grantedPosition = await positionIfAlreadyGranted();
    if (version !== feedRun) return;
    if (grantedPosition) nearbyPosition = grantedPosition;
  }
  let data, error;
  if (feedMode === 'all' && !feedTerm) {
    try {
      data = await noteRpc('list_cards', { p_sort: feedSort === 'latest' ? 'recent' : feedSort,
        p_lat: nearbyPosition?.latitude ?? null, p_lon: nearbyPosition?.longitude ?? null,
        p_radius_m: 30000, p_limit: 20,
        p_cursor: { offset: nearbyOffset, snapshot: nearbySnapshot } });
    } catch (cause) { error = cause; }
  } else {
    try { ({ data, error } = await filteredFeed()); } catch (cause) { error = cause; }
  }
  if (version !== feedRun) return;
  feedLoading = false;
  if (error) {
    console.warn('Note feed:', error);
    if (!more) state(list, feedSort === 'nearby' && error?.name === 'GeolocationPositionError'
      ? '근처 카드를 보려면 위치 사용을 허용해 주세요.' : '카드를 불러오지 못했어요.');
    banner(feedSort === 'nearby' && error?.name === 'GeolocationPositionError' ? '위치 권한을 확인해 주세요' : '노트 연결을 확인해 주세요');
    const retry = node('button', 'button', '다시 시도');
    retry.type = 'button'; retry.dataset.retryFeed = more ? 'more' : 'first'; list.append(retry);
    updateComposer(); return;
  }
  ready = true; banner('');
  if (!more) list.replaceChildren();
  for (const card of data || []) {
    if (card.kind === 'event' && card.body == null) continue;
    const exists = list.querySelector(`[data-card-id="${card.id}"]`);
    cache.set(card.id, card);
    if (!exists) {
      if (card.kind === 'event') {
        let pinned = list.querySelector('.note-pinned-events');
        if (!pinned) {
          pinned = node('section', 'note-pinned-events'); pinned.setAttribute('aria-label', '범위 안의 이벤트');
          pinned.append(node('h2', '', '지금 볼 수 있는 이벤트')); list.prepend(pinned);
        }
        pinned.append(cardElement(card));
      } else list.append(cardElement(card));
    }
  }
  if (!more && !data?.length) state(list, feedTerm ? '검색 결과가 없어요.' : feedMode === 'saved'
    ? '저장한 카드가 없어요. 카드의 책갈피를 눌러 담아 보세요.' : feedMode === 'mine'
      ? '아직 작성한 카드가 없어요.' : feedSort === 'popular'
        ? '최근 7일에 올라온 카드가 없어요.' : '아직 카드가 없어요. 첫 카드를 써 보세요.');
  if (!more && feedMode === 'all' && !feedTerm && !nearbyPosition) {
    const invitation = node('div', 'note-location-invite');
    const description = node('span', '', session?.user
      ? '위치를 켜면 주변 이벤트와 대략적인 거리를 볼 수 있어요.'
      : '로그인하고 위치를 켜면 주변 이벤트를 볼 수 있어요.');
    const action = session?.user ? node('button', 'button', '위치 확인') : node('a', 'button', '대문에서 로그인');
    if (session?.user) {
      action.type = 'button';
      action.addEventListener('click', async () => {
        action.disabled = true; description.textContent = '위치를 확인하는 중이에요.';
        try {
          const position = await currentPosition();
          if (version !== feedRun) return;
          nearbyPosition = position; loadFeed();
        } catch {
          if (version !== feedRun) return;
          description.textContent = '위치를 확인하지 못했어요. 권한을 확인한 뒤 다시 눌러 주세요.';
          action.disabled = false;
        }
      });
    } else action.href = '/?next=note';
    invitation.append(description, action); list.prepend(invitation);
  }
  if (data?.length) feedCursor = data.at(-1);
  if (feedMode === 'all' && !feedTerm) nearbyOffset += data?.length || 0;
  if (data?.length === 20) {
    const next = node('button', 'button', '더 보기'); next.type = 'button'; next.dataset.moreFeed = ''; list.append(next);
  }
  updateComposer();
  consumeInitialCard();
}
function currentPosition() {
  return new Promise((resolve, reject) => {
    const unavailable = message => Object.assign(new Error(message), { name: 'GeolocationPositionError' });
    if (!navigator.geolocation) { reject(unavailable('Location unavailable')); return; }
    navigator.geolocation.getCurrentPosition(
      value => resolve({ latitude: value.coords.latitude, longitude: value.coords.longitude,
        capturedAt: value.timestamp }),
      error => reject(unavailable(error.message || 'Location denied')),
      { enableHighAccuracy: false, maximumAge: 120000, timeout: 12000 }
    );
  });
}
function positionIsFresh(position) {
  return Number.isFinite(position?.capturedAt) && Date.now() - position.capturedAt < 120000;
}
async function positionIfAlreadyGranted() {
  if (!navigator.geolocation || !navigator.permissions?.query) return null;
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    if (permission.state === 'granted') return await currentPosition();
  } catch { /* No implicit request when browser permissions cannot be inspected. */ }
  return null;
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
  const position = positionIsFresh(nearbyPosition) ? nearbyPosition : null;
  try { card = await noteRpc('get_card', { p_id: id, p_lat: position?.latitude ?? null,
    p_lon: position?.longitude ?? null }); }
  catch (cause) { error = cause; }
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
  const eventCard = card.kind === 'event';
  $('#detail [data-compose="reply"]').hidden = eventCard;
  $('#detail [data-compose="reply"]').disabled = eventCard || !canWrite('comment');
  slot.replaceChildren(cardElement(card, false, true));
  if (eventCard) {
    $('#reply-count').textContent = '0';
    if (card.body == null) {
      const note = node('p', 'reply-empty', !session?.user ? '이벤트 내용을 보려면 대문에서 로그인해 주세요.'
        : '이벤트 내용은 표시된 기간·범위 안에서만 보여요. 정확한 GPS 좌표는 비공개로 사용됩니다.');
      const locate = session?.user ? node('button', 'button', '내 위치에서 다시 확인') : node('a', 'button', '대문에서 로그인');
      if (session?.user) {
        locate.type = 'button';
        locate.addEventListener('click', async () => {
          locate.disabled = true;
          try { nearbyPosition = await currentPosition(); await renderDetail(); }
          catch { locate.disabled = false; note.textContent = '위치를 확인하지 못했어요. 권한을 확인한 뒤 다시 시도해 주세요.'; }
        });
      } else locate.href = '/?next=note';
      slot.append(note, locate);
    }
    state(replies, '이벤트 카드에는 답글을 작성할 수 없어요.');
  } else {
    $('#reply-count').textContent = String(card.reply_count || 0);
    loadReplies(id, version);
  }
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
  $('#feed-title').textContent = mode === 'all' ? '오쭈다노트 카드' : '메모함';
  $('#note-collection-tabs').hidden = mode === 'all';
  $('.side-sort-group').hidden = mode !== 'all';
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
  $('#connection-status').after(noticeElement, featureMessage);
  retentionButton = node('button', 'button', '보관 알림'); retentionButton.type = 'button';
  retentionButton.hidden = true; retentionButton.addEventListener('click', showRetentionAlerts);
  $('.note-tools').append(retentionButton);
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
  $('#side-collection-slot').append(collectionTabs);
  const sorts = $('.feed-sort-tabs');
  sorts.classList.add('feed-sort-tabs'); sorts.replaceChildren();
  for (const [sort, label] of [['latest', '최신'], ['popular', '인기'], ['nearby', '근처']]) {
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
  $('#event-start').addEventListener('click', () => openComposer('event'));
  $('#event-select-center').addEventListener('click', () => {
    const center = eventMap?.getCenter();
    if (center) selectEventPosition(center);
    else $('#event-location-status').textContent = '지도를 불러오지 못했어요. 다시 열어 주세요.';
  });
  $('#card-location-button').addEventListener('click', async event => {
    const run = ++locationRun;
    event.currentTarget.disabled = true; $('#card-location-status').textContent = '위치를 확인하는 중이에요.';
    try {
      const position = await currentPosition();
      if (run !== locationRun || backdrop.hidden || kind === 'event') return;
      writingPosition = position; $('#card-location-status').textContent = '위치를 확인했어요. 정확한 좌표는 카드에 표시되지 않아요.';
    } catch {
      if (run !== locationRun || backdrop.hidden) return;
      writingPosition = null; $('#card-location-status').textContent = '위치를 사용할 수 없어요. 권한을 확인하고 다시 시도해 주세요.';
    } finally { if (run === locationRun) { $('#card-location-button').disabled = false; updateComposer(); } }
  });
  for (const selector of ['#compose-font', '#compose-size', '#compose-effect']) {
    $(selector).addEventListener('change', () => { applyComposeStyle(); recordDraft(); });
  }
  for (const selector of ['#event-radius', '#event-hours']) $(selector).addEventListener('input', updateEventPrice);
}
async function refreshRetentionAlerts() {
  const run = ++retentionRun, userId = session?.user?.id;
  retentionButton.hidden = !userId;
  if (!userId) return;
  try {
    const rows = await noteRpc('list_retention_alerts');
    if (run !== retentionRun || session?.user?.id !== userId) return;
    const unread = (rows || []).filter(row => !row.read_at).length;
    retentionButton.textContent = unread ? `보관 알림 ${unread}` : '보관 알림';
  } catch (error) { if (run === retentionRun) console.warn('Note retention:', error); }
}
async function showRetentionAlerts() {
  if (!session?.user) return;
  const run = showManagement('보관 알림');
  state(managementBody, '보관 알림을 불러오는 중이에요.');
  try {
    const rows = await noteRpc('list_retention_alerts');
    if (run !== managementRun) return;
    managementBody.replaceChildren(node('p', 'management-help', '익명카드와 답글 카드는 각각 약 6개월 후 공개가 끝납니다. 답글 영구보관은 상위 카드가 모두 영구보관된 경우에만 가능하고, 카드당 10쭈예요.'));
    if (!rows?.length) managementBody.append(node('p', 'reply-empty', '새 보관 알림이 없어요.'));
    for (const item of rows || []) {
      const row = node('article', 'management-row');
      const summary = node('span'); summary.append(node('strong', '', (item.body || '익명카드').slice(0, 70)),
        node('small', '', `${item.parent_due || item.reason === 'parent_due' ? '상위 카드와 함께 종료 예정' : '공개 종료 예정'}: ${dateLabel(item.archive_due_at)}`));
      row.append(summary);
      if (validCardId(item.card_id)) {
        const open = managementButton('카드 보기', () => { closeManagement(); openCard(item.card_id); });
        row.append(open);
        const permanent = managementButton('10쭈로 영구보관', () => {
          const reply = item.kind === 'comment';
          const prompt = reply
            ? '상위 카드가 모두 영구보관된 경우에만 답글을 영구보관할 수 있어요. 상위 카드 작성자가 삭제하거나 탈퇴하면 영구보관된 답글도 함께 삭제될 수 있습니다. 10쭈에 진행할까요?'
            : '이 카드를 10쭈에 영구보관할까요?';
          if (!window.confirm(prompt)) return;
          const requestId = crypto.randomUUID();
          managementAction(() => purchasePermanent(item.card_id, requestId),
            async () => { await loadWorldBalance(session?.user?.id); await refreshCards(false); await showRetentionAlerts(); });
        });
        row.append(permanent);
      }
      managementBody.append(row);
    }
    const unread = (rows || []).filter(item => !item.read_at && validCardId(item.id));
    await Promise.allSettled(unread.map(item => noteRpc('mark_retention_alert_read', { p_id: item.id })));
    if (run === managementRun) await refreshRetentionAlerts();
  } catch (error) {
    if (run !== managementRun) return;
    console.warn('Note retention alerts:', error);
    state(managementBody, '알림을 불러오지 못했어요.');
    managementFooter.append(managementButton('다시 시도', showRetentionAlerts));
  }
}

function installStyleChoices() {
  for (const field of document.querySelectorAll('[data-color-field]')) {
    const group = field.dataset.colorField;
    const labelText = field.querySelector('legend').textContent;
    const row = field.querySelector('.note-color-choices');
    for (const [code, choice] of [['default', { label: '기본' }], ...Object.entries(COLOR_PALETTE)]) {
      const label = node('label', 'note-color-choice'); label.dataset.color = code;
      label.title = `${labelText}: ${choice.label}`;
      if (choice.solid) label.style.setProperty('--swatch', choice.solid);
      const input = node('input'); input.type = 'radio'; input.name = group; input.value = code;
      input.checked = code === 'default'; input.setAttribute('aria-label', `${labelText} ${choice.label}`);
      input.addEventListener('change', () => { applyComposeStyle(); recordDraft(); });
      label.append(input, node('span'));
      row.append(label);
    }
  }
  const randomPhoto = $('input[name="photo-choice"][value="plain"]');
  randomPhoto.addEventListener('change', () => {
    if (!randomPhoto.checked) return;
    selectedPhotoKey = null; $('#photo-selection').textContent = '기본 사진 무작위';
    applyComposeStyle(); recordDraft();
  });
  $('#photo-gallery-toggle').addEventListener('click', () => {
    const gallery = $('#photo-gallery');
    gallery.hidden = !gallery.hidden;
    $('#photo-gallery-toggle').setAttribute('aria-expanded', String(!gallery.hidden));
    if (!gallery.hidden) renderPhotoPage();
  });
  $('#photo-prev').addEventListener('click', () => { if (photoPage > 0) { photoPage--; renderPhotoPage(); } });
  $('#photo-next').addEventListener('click', () => {
    if (PHOTO_FIRST + (photoPage + 1) * PHOTO_PAGE_SIZE <= PHOTO_LAST) { photoPage++; renderPhotoPage(); }
  });
}
function setColorChoice(group, code) {
  const choices = document.getElementsByName(group);
  const chosen = [...choices].find(choice => choice.value === code) || [...choices].find(choice => choice.value === 'default');
  if (chosen) chosen.checked = true;
}
function renderPhotoPage() {
  const grid = $('#photo-grid'); grid.replaceChildren();
  const first = PHOTO_FIRST + photoPage * PHOTO_PAGE_SIZE;
  for (let number = first; number <= Math.min(PHOTO_LAST, first + PHOTO_PAGE_SIZE - 1); number++) {
    const key = String(number), title = `사진 ${String(number - PHOTO_FIRST + 1).padStart(3, '0')}`;
    const tile = node('label', 'note-photo-tile'); tile.title = `${title} · 10쭈/1개월`;
    const input = node('input'); input.type = 'radio'; input.name = 'photo-choice'; input.value = key;
    input.checked = selectedPhotoKey === key; input.setAttribute('aria-label', title);
    input.addEventListener('change', () => {
      selectedPhotoKey = key; $('#photo-selection').textContent = `${title} 선택 · 게시 후 10쭈/1개월`;
      applyComposeStyle(); recordDraft();
    });
    const img = node('img'); img.src = `assets/${key}.jpg`; img.alt = ''; img.loading = 'lazy';
    tile.append(input, img, node('small', '', title)); grid.append(tile);
  }
  $('#photo-page-status').textContent = `${photoPage + 1} / ${Math.ceil((PHOTO_LAST - PHOTO_FIRST + 1) / PHOTO_PAGE_SIZE)}`;
  $('#photo-prev').disabled = photoPage === 0;
  $('#photo-next').disabled = first + PHOTO_PAGE_SIZE > PHOTO_LAST;
}

function currentStyle() {
  return { font: $('#compose-font').value, size: $('#compose-size').value, theme: $('#compose-theme').value,
    effect: $('#compose-effect').value,
    textColor: $('input[name="textColor"]:checked')?.value || 'default',
    backgroundColor: $('input[name="backgroundColor"]:checked')?.value || 'default',
    boxColor: $('input[name="boxColor"]:checked')?.value || 'default' };
}
function chosenPhoto() { return selectedPhotoKey || 'plain'; }
function applyComposeStyle() {
  const preview = $('.compose-photo'), style = currentStyle();
  const photo = $('#note-photo-pick').hidden || chosenPhoto() === 'plain' ? backgroundKey : chosenPhoto();
  setPhotoBackground(preview, photo);
  applyVisualStyle(preview, style);
}
function updateEventPrice() {
  const radius = Number($('#event-radius').value), hours = Number($('#event-hours').value);
  const valid = Number.isInteger(radius) && radius >= 1 && radius <= 30 && Number.isInteger(hours) && hours >= 1 && hours <= 24;
  $('#event-price').textContent = valid ? `${radius}km × ${hours}시간 = ${(100 * radius * hours).toLocaleString('ko-KR')}쭈` : '반경 1~30km, 시간 1~24시간을 정수로 입력해 주세요.';
  if (kind === 'event') submit.textContent = valid ? `${(100 * radius * hours).toLocaleString('ko-KR')}쭈 결제 후 등록` : '범위와 시간을 확인해 주세요';
  updateComposer();
  return valid;
}
function eventCircles(rows) {
  return (rows || []).map(item => ({ id: item.event_id,
    lat: Number(item.center_lat), lng: Number(item.center_lon), radius_m: Number(item.radius_km) * 1000 }));
}
async function refreshComposerMap(center) {
  if (!center || !eventMap || backdrop.hidden || kind !== 'event') return;
  const run = ++composerMapFetchRun, editor = composerRun;
  try {
    const events = await noteRpc('list_event_map', { p_lat: center.lat, p_lon: center.lng, p_limit: 100 });
    if (run === composerMapFetchRun && editor === composerRun && !backdrop.hidden) eventMap?.setCircles(eventCircles(events));
  } catch {
    if (run === composerMapFetchRun && editor === composerRun && !backdrop.hidden)
      $('#event-location-status').textContent = '기존 이벤트 범위를 불러오지 못했어요. 새 이벤트 중심은 지도에서 직접 지정해 주세요.';
  }
}
function scheduleComposerMap(center) {
  clearTimeout(composerMapTimer);
  composerMapTimer = setTimeout(() => refreshComposerMap(center), 180);
}
function selectEventPosition(point) {
  if (!point || backdrop.hidden || kind !== 'event' || busy) return;
  eventPosition = { latitude: point.lat, longitude: point.lng };
  eventMap?.setSelection(point);
  $('#event-location-status').textContent = '이벤트 위치를 선택했어요. 지정한 위치와 원형 범위가 다른 사람에게 보여요.';
  scheduleComposerMap(point);
  updateComposer();
}
function prepareEventMap() {
  if (eventMap) { eventMap.invalidate(); return; }
  eventMap = window.OjjudaMap?.create($('#event-map'), { center: nearbyPosition
    ? { lat: nearbyPosition.latitude, lng: nearbyPosition.longitude } : undefined,
    onMove: scheduleComposerMap,
    onSelect: selectEventPosition });
  if (eventMap) refreshComposerMap(eventMap.getCenter());
}

function draftContent() {
  return { body: text.value, tags: tags.value, background_key: backgroundKey, kind, parent_id: parentId,
    style: currentStyle(), photo_key: kind === 'memo' && chosenPhoto() !== 'plain' ? chosenPhoto() : null };
}
function restoreDraft(content) {
  if (!content || backdrop.hidden || editingId || composerUserId !== session?.user?.id) return;
  kind = content.kind; parentId = content.parent_id; backgroundKey = content.background_key;
  text.value = content.body; tags.value = content.tags;
  $('input[name="identity"][value="anonymous"]').checked = true;
  const style = content.style && typeof content.style === 'object' ? content.style : {};
  $('#compose-font').value = FONT_CODES.includes(style.font) ? style.font : 'default';
  $('#compose-size').value = ['large', 'small'].includes(style.size) ? style.size : 'normal';
  $('#compose-theme').value = ['rose', 'night'].includes(style.theme) ? style.theme : 'plain';
  $('#compose-effect').value = EFFECT_CODES.includes(style.effect) ? style.effect : 'none';
  for (const group of ['textColor', 'backgroundColor', 'boxColor']) setColorChoice(group, style[group]);
  selectedPhotoKey = kind === 'memo' ? photoAssetKey(content.photo_key) : null;
  $('input[name="photo-choice"][value="plain"]').checked = !selectedPhotoKey;
  $('#photo-selection').textContent = selectedPhotoKey
    ? `사진 ${String(Number(selectedPhotoKey) - PHOTO_FIRST + 1).padStart(3, '0')} 선택 · 게시 후 10쭈/1개월`
    : '기본 사진 무작위';
  if (selectedPhotoKey) photoPage = Math.floor((Number(selectedPhotoKey) - PHOTO_FIRST) / PHOTO_PAGE_SIZE);
  applyComposeStyle();
  $('#compose-title').textContent = kind === 'comment' ? '답글 카드 쓰기' : '새 카드 쓰기';
  $('#compose-context').textContent = kind === 'comment' ? replyContext() : '사진 위에 마음을 적어 주세요.';
  updateComposer();
  if (kind === 'comment') void refreshReplyArchiveNotice(parentId, composerRun);
}
function recordDraft() {
  if (!draftController || editingId || kind === 'event' || backdrop.hidden || draftLoading || !session?.user) return;
  try { draftController.change(draftContent()); } catch (error) { draftStatus.textContent = error.message; }
}
function setComposerInputs() {
  const disabled = busy || draftLoading;
  text.disabled = disabled; tags.disabled = disabled;
  for (const selector of ['#compose-font', '#compose-size', '#compose-effect', '#event-select-center', '#event-radius', '#event-hours', '#photo-gallery-toggle', '#photo-prev', '#photo-next']) $(selector).disabled = disabled;
  document.querySelectorAll('.note-color-choice input, input[name="photo-choice"]').forEach(input => { input.disabled = disabled; });
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
  draftTools.append(draftStatus, save, restore, discard, parent, draftConfirm); $('#compose-more-content').append(draftTools);
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
  const visual = currentStyle();
  const extra = selectedPhotoKey || tags.value.trim() || visual.font !== 'default'
    || visual.size !== 'normal' || visual.effect !== 'none'
    || ['textColor', 'backgroundColor', 'boxColor'].some(key => visual[key] !== 'default');
  $('#compose-more>summary').textContent = extra ? '꾸미기 · 추가 설정 (선택됨)' : '꾸미기 · 추가 설정';
  const values = parsedTags();
  $('#compose-tag-display').textContent = values?.length ? values.map(value => `#${value}`).join('  ') : '';
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
  else if (kind === 'comment' && replyDueChecking) composeMessage.textContent = '상위 카드 공개 종료일 확인 중';
  else if (kind !== 'event' && !editingId && !writingPosition) composeMessage.textContent = '위치를 확인한 뒤 등록할 수 있어요.';
  else if (kind === 'event' && !eventPosition) composeMessage.textContent = '지도에서 이벤트 중심을 정해 주세요.';
  else if (kind === 'event' && !validEventOptions()) composeMessage.textContent = '반경과 시간을 범위 안의 정수로 입력해 주세요.';
  else composeMessage.textContent = busy ? (editingId ? '수정 중' : '등록 중')
    : kind === 'event' ? '이벤트 범위와 금액을 확인해 주세요.'
      : $('input[name="identity"]:checked')?.value === 'nickname' ? '월드 닉네임 공개' : '익명 카드';
  submit.disabled = busy || draftLoading || replyDueChecking || !client || !ready || !session?.user || !canWrite() || !text.value.trim()
    || text.value.length > 200 || text.value.split('\n').length > 8 || !values
    || (kind !== 'event' && !editingId && !writingPosition) || (kind === 'event' && (!eventPosition || !validEventOptions()));
  if (draftTools) draftTools.hidden = !!editingId || kind === 'event' || !session?.user;
  if ($('#note-draft-parent')) $('#note-draft-parent').hidden = kind !== 'comment' || !parentId;
}
function validEventOptions() {
  const radius = Number($('#event-radius').value), hours = Number($('#event-hours').value);
  return Number.isInteger(radius) && radius >= 1 && radius <= 30 && Number.isInteger(hours) && hours >= 1 && hours <= 24;
}
async function openComposer(mode, card = null) {
  if (busy || draftLoading) return;
  const run = ++composerRun, epoch = identityEpoch;
  focusBefore = document.activeElement;
  editingId = card?.is_mine ? card.id : null;
  composerUserId = session?.user?.id || null;
  kind = editingId ? card.kind : mode === 'event' ? 'event' : mode === 'reply' && stack.length ? 'comment' : 'memo';
  parentId = editingId ? card.parent_id : kind === 'comment' ? stack.at(-1) : null;
  backgroundKey = editingId ? card.background_key : String(PHOTO_FIRST + Math.floor(Math.random() * (PHOTO_LAST - PHOTO_FIRST + 1)));
  writingPosition = null; eventPosition = null; publishRequestId = crypto.randomUUID(); photoRequestId = crypto.randomUUID(); locationRun++;
  replyDueChecking = false; replyDueRun++;
  $('#note-photo-pick').hidden = !!editingId || kind !== 'memo';
  $('#compose-more').open = false;
  $('#photo-gallery').hidden = true; $('#photo-gallery-toggle').setAttribute('aria-expanded', 'false');
  $('#photo-grid').replaceChildren(); photoPage = 0; selectedPhotoKey = null;
  $('input[name="photo-choice"][value="plain"]').checked = true;
  $('#photo-selection').textContent = '기본 사진 무작위';
  $('#card-location-consent').hidden = kind === 'event' || !!editingId;
  $('#card-location-status').textContent = '위치를 확인해야 등록할 수 있어요.';
  $('#note-event-fields').hidden = kind !== 'event';
  $('#event-location-status').textContent = '지도를 누르거나 Tab으로 지도에 초점을 맞춘 뒤 방향키로 이동하고 아래 버튼으로 중심을 선택해 주세요. 지정한 위치와 범위는 다른 사람에게 보입니다.';
  $('#compose-title').textContent = editingId ? '내 카드 수정' : kind === 'event' ? '이벤트 카드 쓰기' : kind === 'comment' ? '답글 카드 쓰기' : '새 카드 쓰기';
  $('#compose-context').textContent = editingId ? '글과 태그를 수정할 수 있어요.' : kind === 'comment' ? replyContext() : '마음을 카드에 적어 주세요.';
  submit.textContent = editingId ? '수정하기' : kind === 'event' ? '100쭈 결제 후 등록' : '등록하기';
  const style = editingId && card.style && typeof card.style === 'object' ? card.style : {};
  $('#compose-font').value = FONT_CODES.includes(style.font) ? style.font : 'default';
  $('#compose-size').value = ['large', 'small'].includes(style.size) ? style.size : 'normal';
  $('#compose-theme').value = ['rose', 'night'].includes(style.theme) ? style.theme : 'plain';
  $('#compose-effect').value = EFFECT_CODES.includes(style.effect) ? style.effect : 'none';
  for (const group of ['textColor', 'backgroundColor', 'boxColor']) setColorChoice(group, style[group]);
  applyComposeStyle(); updateEventPrice();
  text.value = editingId ? card.body : ''; tags.value = editingId ? card.tags.join(', ') : '';
  const identityMode = editingId && card.identity_mode === 'nickname' ? 'nickname' : 'anonymous';
  $(`input[name="identity"][value="${identityMode}"]`).checked = true;
  requestedDraftContent = draftContent();
  if (draftConfirm) draftConfirm.hidden = true;
  updateComposer(); backdrop.hidden = false; lockPage(true); text.focus();
  if (kind === 'event') { eventMap?.destroy(); eventMap = null; prepareEventMap(); }
  if (kind === 'comment' && !editingId) void refreshReplyArchiveNotice(parentId, run);
  if (!editingId && kind !== 'event' && draftController && composerUserId) {
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
  composerRun++; replyDueRun++; replyDueChecking = false; draftLoading = false; setComposerInputs();
  backdrop.hidden = true; writingPosition = null; eventPosition = null; locationRun++; composerMapFetchRun++;
  clearTimeout(composerMapTimer); eventMap?.destroy(); eventMap = null; lockPage(false);
  if (focusBefore?.isConnected) focusBefore.focus({ preventScroll: true });
}
async function publishCard() {
  if (busy || submit.disabled || !client || !ready) return;
  let body = text.value.replace(/\r\n?/g, '\n').trim(), values = parsedTags();
  if (!body || body.length > 200 || body.split('\n').length > 8 || !values) return;
  const editId = editingId, actionUserId = composerUserId;
  const identityMode = $('input[name="identity"]:checked')?.value === 'nickname' ? 'nickname' : 'anonymous';
  const selectedPhoto = kind === 'memo' && !editId ? chosenPhoto() : 'plain';
  const selectedPhotoRequestId = photoRequestId;
  if (kind === 'comment' && !editId && archiveDueThisMonth(parentArchiveDue(cache.get(parentId)))
    && !window.confirm(`상위 카드가 ${dateLabel(parentArchiveDue(cache.get(parentId)))}에 공개 종료될 예정이에요. 이 답글도 함께 삭제될 수 있습니다. 등록할까요?`)) return;
  if (kind === 'event') {
    const cost = Number($('#event-radius').value) * Number($('#event-hours').value) * 100;
    if (!validEventOptions() || !eventPosition || !window.confirm(`이벤트 ${cost.toLocaleString('ko-KR')}쭈를 결제하고 등록할까요?`)) return;
  } else if (!editId && selectedPhoto !== 'plain' && !window.confirm('카드를 등록한 뒤 제공 사진 배경 1개월 이용료 10쭈를 결제할까요?')) {
    return;
  }
  let draftToken = null, publishKind = kind, publishParent = parentId;
  recordDraft(); busy = true; setComposerInputs(); updateComposer();
  if (!editId && kind !== 'event' && draftController) {
    try {
      draftToken = await draftController.preparePublish();
      body = draftToken.content.body.replace(/\r\n?/g, '\n').trim(); values = parsedTags(draftToken.content.tags);
      publishKind = draftToken.content.kind; publishParent = draftToken.content.parent_id;
      if (publishKind !== kind || publishParent !== parentId) throw new Error('임시 글의 원글이 바뀌었어요. 작성창을 다시 열어 확인해 주세요.');
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
    if (editId) {
      ({ data, error } = await query().from('cards').update({ body, tags: values, identity_mode: identityMode }).eq('id', editId).select('id').maybeSingle());
    } else if (publishKind === 'event') {
      data = await noteRpc('publish_event', { p_request_id: publishRequestId, p_body: body, p_tags: values,
        p_identity_mode: identityMode, p_style: currentStyle(), p_lat: eventPosition.latitude,
        p_lon: eventPosition.longitude, p_radius_km: Number($('#event-radius').value),
        p_starts_at: new Date().toISOString(), p_duration_hours: Number($('#event-hours').value) });
    } else {
      data = await noteRpc('publish_card', { p_request_id: publishRequestId, p_body: body, p_tags: values,
        p_identity_mode: identityMode, p_style: currentStyle(), p_lat: writingPosition?.latitude,
        p_lon: writingPosition?.longitude, p_parent_id: publishParent });
    }
    if (data?.ok === false) throw new Error('게시가 완료되지 않았어요.');
  } catch (cause) { error = cause; }
  const publishedId = data?.id || data?.card_id;
  if (session?.user?.id !== actionUserId) { busy = false; setComposerInputs(); updateComposer(); return; }
  if (!error && publishedId && draftToken) {
    try {
      const cleanup = await draftController.published(draftToken);
      if (!cleanup.cleared && session?.user?.id === actionUserId) message('카드는 등록됐어요. 다른 창의 임시 글이 남아 있으니 확인해 주세요.');
    } catch (cleanupError) {
      if (session?.user?.id === actionUserId) message('카드는 등록됐어요. 임시 글의 정리 상태를 확인해 주세요.');
    }
  } else if (draftToken) draftController.cancelPublish();
  busy = false; setComposerInputs();
  if (session?.user?.id !== actionUserId) { updateComposer(); return; }
  if (error || !publishedId) {
    console.warn('Note publish:', error);
    updateComposer(); composeMessage.textContent = editId ? '수정하지 못했어요. 권한과 연결을 확인해 주세요' : '등록하지 못했어요. 다시 시도해 주세요'; return;
  }
  if (editId && publishedId) {
    try { await noteRpc('set_card_style', { p_card_id: publishedId, p_style: currentStyle() }); }
    catch (styleError) { console.warn('Note style:', styleError); message('글은 저장됐지만 꾸미기는 적용되지 않았어요.'); }
  }
  let photoPurchaseFailed = false;
  if (!editId && selectedPhoto !== 'plain') {
    try {
      await noteRpc('purchase_card_photo', { p_card_id: publishedId, p_photo_key: selectedPhoto, p_request_id: selectedPhotoRequestId });
      void loadWorldBalance(actionUserId);
    } catch (photoError) { console.warn('Note photo purchase:', photoError); photoPurchaseFailed = true; }
  }
  const spent = Number(data?.coins_spent ?? data?.cost_coins);
  if (publishKind === 'event' && Number.isFinite(spent)) {
    message(`이벤트를 등록했어요. 서버에서 ${spent.toLocaleString('ko-KR')}쭈를 차감했어요.`);
    void loadWorldBalance(actionUserId);
  }
  if (publishKind === 'comment' && archiveDueThisMonth(data?.effective_archive_due_at))
    message(`답글이 등록됐어요. 상위 카드와 함께 ${dateLabel(data.effective_archive_due_at)}에 공개 종료될 수 있어요. 보관 알림을 확인해 주세요.`);
  text.value = ''; tags.value = '';
  closeComposer(false);
  await refreshCards(editId || publishKind === 'comment');
  if (publishKind === 'comment') void refreshRetentionAlerts();
  if (photoPurchaseFailed) {
    showManagement('카드는 등록됐어요');
    managementBody.append(node('p', 'management-help', '사진 배경 결제가 완료되지 않아 기본 배경으로 등록됐어요. 다시 시도하거나 기본 배경으로 계속 이용할 수 있어요.'));
    managementFooter.append(managementButton('사진 결제 다시 시도', () => managementAction(
      () => noteRpc('purchase_card_photo', { p_card_id: publishedId, p_photo_key: selectedPhoto, p_request_id: selectedPhotoRequestId }),
      async () => { closeManagement(); await refreshCards(false); await loadWorldBalance(actionUserId); }
    ), true));
    managementFooter.append(managementButton('기본 배경으로 두기', () => closeManagement()));
  }
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
async function purchasePermanent(cardId, requestId) {
  const result = await noteRpc('make_card_permanent', { p_card_id: cardId, p_request_id: requestId });
  if (result?.ok === false) throw new Error(result.reason || '영구보관을 처리하지 못했어요.');
  return result;
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
    const reason = error?.message || '';
    managementMessage.textContent = /parent_not_permanent/i.test(reason)
      ? '상위 카드가 모두 영구보관된 후에 답글을 영구보관할 수 있어요.'
      : reason === 'coins' ? '쭈 잔액이 부족해요. 월드에서 잔액을 확인해 주세요.'
        : reason === 'card_unavailable' ? '이 카드는 삭제되었거나 현재 영구보관할 수 없어요.'
          : '처리하지 못했어요. 로그인과 권한을 확인한 뒤 다시 시도해 주세요.';
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
    if (card.kind !== 'event') managementBody.append(managementButton('수정하기', () => { closeManagement(); openComposer('edit', card); }));
    if (card.kind === 'memo') {
      managementBody.append(managementButton('사진 배경 · 10쭈/1개월', () => showPhotoChoices(card)));
    }
    if (['memo', 'comment'].includes(card.kind) && !card.permanent) {
      managementBody.append(managementButton('영구보관 · 10쭈', () => confirmPermanent(card)));
    }
    managementBody.append(managementButton('삭제하기', () => confirmDelete(card)));
  } else {
    managementBody.append(managementButton('신고하기', () => card.kind === 'event' ? reportEvent(card) : reportCard(card)));
    if (card.kind !== 'event') managementBody.append(managementButton('작성자 차단', () => confirmBlock(card)));
  }
  cancelManagement();
}
function showPhotoChoices(card) {
  showManagement('사진 배경 선택');
  managementBody.append(node('p', 'management-help', '제공 사진 한 장을 선택하면 10쭈가 차감되고 1개월간 적용돼요. 자동 연장은 하지 않아요.'));
  if (card.photo_until) managementBody.append(node('p', 'management-help', `현재 사진 만료: ${dateLabel(card.photo_until)}`));
  const choices = node('div', 'note-photo-choice');
  const pages = node('div', 'note-photo-pages');
  let page = 0;
  const render = () => {
    choices.replaceChildren(); pages.replaceChildren();
    const first = PHOTO_FIRST + page * PHOTO_PAGE_SIZE;
    for (let number = first; number <= Math.min(PHOTO_LAST, first + PHOTO_PAGE_SIZE - 1); number++) {
      const key = String(number), title = `사진 ${String(number - PHOTO_FIRST + 1).padStart(3, '0')}`;
      const button = node('button', 'button'); button.type = 'button';
      const img = node('img'); img.src = `assets/${key}.jpg`; img.alt = ''; img.loading = 'lazy';
      button.append(img, node('strong', '', title), node('small', '', '10쭈 · 1개월'));
      button.addEventListener('click', () => {
        if (!window.confirm(`${title}을 10쭈에 1개월 동안 적용할까요?`)) return;
        const requestId = crypto.randomUUID();
        managementAction(() => noteRpc('purchase_card_photo', { p_card_id: card.id, p_photo_key: key, p_request_id: requestId }),
          async () => { closeManagement(); await refreshCards(stack.length > 0); await loadWorldBalance(session?.user?.id); });
      });
      choices.append(button);
    }
    const prev = node('button', 'button', '이전'); prev.type = 'button'; prev.disabled = page === 0;
    prev.addEventListener('click', () => { page--; render(); });
    const next = node('button', 'button', '다음'); next.type = 'button';
    next.disabled = first + PHOTO_PAGE_SIZE > PHOTO_LAST;
    next.addEventListener('click', () => { page++; render(); });
    pages.append(prev, node('span', '', `${page + 1} / ${Math.ceil((PHOTO_LAST - PHOTO_FIRST + 1) / PHOTO_PAGE_SIZE)}`), next);
  };
  render(); managementBody.append(choices, pages); cancelManagement();
}
function confirmPermanent(card) {
  showManagement('영구보관할까요?');
  managementBody.append(node('p', 'management-help', card.kind === 'comment'
    ? '상위 카드가 모두 영구보관되어야 답글을 영구보관할 수 있어요. 10쭈가 한 번 차감됩니다. 상위 카드 작성자가 삭제하거나 탈퇴하면 영구보관된 답글도 함께 삭제될 수 있습니다.'
    : '이 카드를 영구보관하면 10쭈가 차감돼요. 같은 카드에 다시 결제하지 않아요.'));
  cancelManagement();
  const requestId = crypto.randomUUID();
  managementFooter.append(managementButton('10쭈로 영구보관', () => managementAction(
    () => purchasePermanent(card.id, requestId),
    async () => { closeManagement(); await refreshCards(stack.length > 0); await loadWorldBalance(session?.user?.id); }
  ), true));
}
function confirmDelete(card) {
  showManagement('카드를 삭제할까요?');
  managementBody.append(node('p', 'management-help', '공개 화면에서 내리고 이어진 답글도 함께 숨겨요. 관리자는 1개월 동안 복구할 수 있고, 이후 영구 삭제됩니다.'));
  cancelManagement();
  managementFooter.append(managementButton('카드와 답글 삭제', () => managementAction(async () => {
    const count = await noteRpc('archive_my_card', { p_card_id: card.id });
    if (count !== 1) throw new Error('삭제할 카드를 찾지 못했어요.');
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
function reportEvent(card) {
  if (!noteState?.reports_enabled) { message('신고 접수가 잠시 쉬고 있어요.'); return; }
  showManagement('이벤트 신고');
  managementBody.append(node('p', 'management-help', '이벤트 범위 안에 있는지 위치를 다시 확인해요. 정확한 GPS 좌표는 공개되지 않고 신고 확인에만 사용됩니다.'));
  const reason = reasonField('신고 사유'); cancelManagement();
  managementFooter.append(managementButton('위치 확인 후 신고', async () => {
    if (!validReason(reason) || managementBusy) return;
    const run = managementRun;
    managementMessage.textContent = '위치를 확인하는 중이에요.';
    try {
      const position = await currentPosition();
      if (run !== managementRun || !session?.user) return;
      managementAction(() => noteRpc('report_event', { p_card_id: card.id, p_reason: reason.value.trim(),
        p_lat: position.latitude, p_lon: position.longitude }), () => {
        showManagement('신고를 접수했어요');
        managementBody.append(node('p', 'management-help', '관리자가 내용을 확인합니다.'));
        managementFooter.append(managementButton('닫기', () => closeManagement(), true));
      });
    } catch { if (run === managementRun) managementMessage.textContent = '위치를 확인하지 못했어요. 권한을 확인하고 다시 시도해 주세요.'; }
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
function installManagement() {
  const tools = node('div', 'note-tools');
  const blocks = managementButton('차단 목록', showBlocks); blocks.id = 'note-blocks'; blocks.hidden = true;
  const reports = managementButton('관리자 모드', () => {
    if (!moderator || !session?.user) return;
    window.location.assign('/world.html?admin=note');
  }); reports.id = 'note-moderation'; reports.hidden = true;
  tools.append(blocks, reports); $('#side-tools').append(tools);
  managementClose.addEventListener('click', () => closeManagement());
  management.addEventListener('click', event => { if (event.target === management) closeManagement(); });
  document.addEventListener('keydown', event => {
    const dialog = !management.hidden ? managementPanel : !backdrop.hidden ? $('.composer') : null;
    if (!dialog) return;
    if (event.key === 'Escape' && !management.hidden) { event.preventDefault(); closeManagement(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')]
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
    retentionRun++; nearbyPosition = null; writingPosition = null; eventPosition = null;
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
    refreshRetentionAlerts();
    notificationController?.refresh?.();
    if (changed) loadFeed();
    else consumeInitialCard();
  }, 0);
}

installManagement(); installStyleChoices(); installFeatures(); installStageAuth(); installDrafts();
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
    loadWorldBalance(session?.user?.id); loadNoteState(); refreshRetentionAlerts();
    if (backdrop.hidden && management.hidden) refreshCards(stack.length > 0);
  });
} else {
  authKnown = true; banner('노트 연결 설정을 확인해 주세요');
  state(list, '카드를 불러올 수 없어요.'); updateAuth();
}
