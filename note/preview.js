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
const EVENT_PHOTO_BUCKET = 'note-event-photos';
let eventPhotoBlob = null, eventPhotoPreviewUrl = null, eventPhotoRequestId = null;
let eventPhotoPreparing = false, eventPhotoError = '', eventPhotoRun = 0;
let eventHadPhoto = false, eventPhotoRemove = false, eventCurrentPhotoUrl = null;
let eventMap = null;
let composerMapFetchRun = 0, composerMapTimer = null;
let feedSnapshot = null, feedLoading = false, replyLoading = false;
let noteState = null, noteStateRun = 0, noticeElement = null, featureMessage = null;
let initialCardId = new URL(location.href).searchParams.get('card');
const reactionPending = new Set();
let draftController = null, draftStatus = null, draftLoading = false;
let requestedDraftContent = null, composerRun = 0, identityEpoch = 0;
let localComposerBaseline = null, localComposerDirty = false, localComposerStored = false;
let notificationController = null;
const validCardId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
const PHOTO_FIRST = 10, PHOTO_LAST = 17, PHOTO_PAGE_SIZE = 12;
const PHOTO_VERSION = '20260927-new';
const photoUrl = key => `assets/${key}.jpg?v=${PHOTO_VERSION}`;
const FONT_CODES = ['default', 'round', 'serif', 'handwriting', 'mono'];
const EFFECT_CODES = ['none', 'sparkle', 'frame', 'rain', 'shimmer', 'rainbow', 'snow',
  'starlight', 'fireflies', 'petals', 'bubbles', 'aurora', 'confetti', 'sunbeams',
  'mist', 'ocean', 'heartbeat', 'orbit', 'glitter', 'meteor', 'leaves', 'neon', 'dawn'];
const COLOR_PALETTE = {
  red: { label: '빨강', solid: '#dc3049', box: '#dc30492e' },
  yellow: { label: '노랑', solid: '#e5a800', box: '#e5a80033' },
  green: { label: '초록', solid: '#238d56', box: '#238d5630' },
  blue: { label: '파랑', solid: '#3c78d9', box: '#3c78d933' },
  purple: { label: '보라', solid: '#8855cb', box: '#8855cb33' },
  black: { label: '검정', solid: '#151622', box: '#1516222b' },
  white: { label: '흰색', solid: '#ffffff', box: '#ffffff33' }
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
  element.classList.remove('image-featured');
  element.style.backgroundImage = key ? `url("${photoUrl(key)}")` : '';
}
async function loadEventBackground(element, card) {
  const position = positionIsFresh(nearbyPosition) ? nearbyPosition : null;
  const userId = session?.user?.id;
  if (!client || (!position && !card.is_mine) || !userId || card.kind !== 'event'
    || card.body == null || Date.parse(card.event_ends_at) <= Date.now()) return;
  try {
    const path = card.is_mine ? card.event_photo_path || await noteRpc('get_my_event_photo_path', { p_card_id: card.id })
      : await noteRpc('get_event_photo_path', {
        p_card_id: card.id, p_lat: position.latitude, p_lon: position.longitude
      });
    if (!path || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i.test(path)
      || !element.isConnected || session?.user?.id !== userId) return;
    const { data, error } = await client.storage.from(EVENT_PHOTO_BUCKET).createSignedUrl(path, 120);
    if (error) throw error;
    if (element.isConnected && session?.user?.id === userId && data?.signedUrl)
      element.style.backgroundImage = `url("${data.signedUrl.replaceAll('"', '%22')}")`;
  } catch (error) { console.warn('Note event background:', error); }
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
  const boxColor = COLOR_PALETTE[style.boxColor];
  const textHex = textColor?.solid || '#ffffff';
  const boxHex = boxColor?.box || '#17203a26';
  element.style.setProperty('--note-text-color', textHex);
  element.style.setProperty('--note-box-color', boxHex);
  element.classList.toggle('note-low-contrast', colorContrast(textHex, boxHex) < 4.5);
  element.style.setProperty('--note-outline', colorLuminance(textHex) > .25 ? '#101020' : '#ffffff');
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

const expandedBodyEntries = new Set();
function refreshExpandedBodies() {
  for (const entry of expandedBodyEntries) {
    if (!entry.item.isConnected) { expandedBodyEntries.delete(entry); continue; }
    entry.full.hidden = !photoQuoteClipped(entry.photo, entry.quote, entry.tagRow);
  }
}
function photoQuoteClipped(photo, quote, tagRow) {
  const photoBounds = photo.getBoundingClientRect(), quoteBounds = quote.getBoundingClientRect();
  const tagBounds = tagRow.getBoundingClientRect();
  return quote.scrollHeight > quote.clientHeight + 1 || quote.scrollWidth > quote.clientWidth + 1
    || quoteBounds.top < photoBounds.top + 8 || quoteBounds.bottom > photoBounds.bottom - 8
    || (tagRow.childElementCount > 0
      && (quoteBounds.bottom + 6 > tagBounds.top || tagRow.scrollWidth > tagRow.clientWidth + 1));
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
  const hiddenEvent = card.kind === 'event' && card.body == null;
  setPhotoBackground(photo, hiddenEvent ? null : visiblePhoto);
  if (card.kind === 'event' && !hiddenEvent) void loadEventBackground(photo, card);
  applyVisualStyle(photo, style);
  const quote = node('span', 'card-quote');
  const body = hiddenEvent ? '범위 안에서만 보이는 이벤트' : typeof card.body === 'string' ? card.body : '';
  fillCardQuote(quote, body, compact, style);
  const tagRow = node('span', 'card-tags');
  for (const tag of Array.isArray(card.tags) ? card.tags.slice(0, 5) : []) {
    tagRow.append(node('span', '', `#${tag}`));
  }
  photo.append(node('span', 'photo-shade'), quote, tagRow);
  open.append(photo);
  item.append(open);
  if (expanded && !hiddenEvent) {
    const full = node('details', 'note-full-body');
    full.hidden = true;
    full.append(node('summary', '', '전체 글 보기'), node('p', '', body));
    item.append(full);
    expandedBodyEntries.add({ item, photo, quote, tagRow, full });
    requestAnimationFrame(refreshExpandedBodies);
  }

  const meta = node('div', 'card-meta');
  const person = node('span');
  person.append(node('strong', '', card.display_name || '익명'));
  person.append(node('small', '', dateLabel(card.created_at)));
  meta.append(node('span', visiblePhoto === '11' ? 'avatar avatar-green' : 'avatar', 'ㅇ'), person);
  if (!compact) {
    if (typeof card.distance_band === 'string' && card.distance_band.trim()) {
      meta.append(node('span', 'meta-tail', card.distance_band));
    } else if (card.kind === 'event' || card.kind === 'comment') {
      const eventStatus = card.is_mine && card.kind === 'event'
        ? Date.parse(card.event_ends_at) <= Date.now() ? '종료' : Date.parse(card.event_starts_at) > Date.now() ? '시작 전' : '진행 중'
        : null;
      meta.append(node('span', 'meta-tail', eventStatus ? `이벤트 · ${eventStatus}` : card.kind === 'event' ? '이벤트' : '답글 카드'));
    }
  }
  item.append(meta);

  if (hiddenEvent) return item;

  const actions = node('div', 'card-actions');
  const reply = node('button');
  reply.type = 'button';
  reply.setAttribute('aria-label', `답글 ${card.reply_count || 0}개, 카드 열기`);
  if (expanded) {
    reply.dataset.compose = 'reply';
    reply.style.display = 'inline-flex';
    reply.setAttribute('aria-label', '이 카드에 답글 쓰기');
  } else reply.dataset.open = card.id;
  reply.append(icon('reply'), node('span', 'action-label', '답글'), node('span', 'action-count', card.reply_count || 0));
  const like = node('button');
  like.type = 'button'; like.dataset.reaction = 'like'; like.dataset.cardId = card.id;
  like.setAttribute('aria-label', card.is_liked ? '공감 취소' : '공감');
  like.setAttribute('aria-pressed', String(!!card.is_liked));
  like.disabled = reactionPending.has(`like:${card.id}`) || !canReact(!!card.is_liked);
  like.append(icon('heart'), node('span', 'action-count', card.like_count || 0));
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
  share.setAttribute('aria-label', '카드 공유하기');
  actions.append(share);
  item.append(actions);
  if (session?.user) {
    const manage = node('button', 'card-manage', '더 보기');
    manage.type = 'button'; manage.dataset.manageCard = card.id;
    manage.setAttribute('aria-label', card.is_mine ? '내 카드 수정 또는 삭제' : '카드 신고 또는 작성자 차단');
    actions.append(manage);
  }
  return item;
}
function fillCardQuote(quote, body, compact, style) {
  body.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
    if (index) quote.append(document.createElement('br'));
    quote.append(document.createTextNode(line));
  });
  if (body.length > 120 && (!style.size || style.size === 'normal')) quote.style.fontSize = compact ? '15px' : '18px';
  else if (body.length > 70 && (!style.size || style.size === 'normal')) quote.style.fontSize = compact ? '17px' : '22px';
  quote.style.overflowWrap = 'anywhere';
}
function previewCardWidth(compact) {
  const area = compact ? $('#reply-list') : $('.feed-layout');
  let width = area?.getBoundingClientRect().width || 0;
  if (width < 180) {
    const main = $('.main'), css = getComputedStyle(main);
    const available = main.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
    width = compact ? available - 42 : available;
  }
  return Math.max(180, Math.min(compact ? 310 : 560, width));
}
function cardPhotoOverflows(body, values = []) {
  if (!body) return false;
  const compact = kind === 'comment', style = currentStyle();
  const probe = node('div', compact ? 'reply-card' : kind === 'event' ? 'photo-card note-event-card' : 'photo-card');
  probe.style.cssText = `position:fixed;left:-10000px;top:0;width:${previewCardWidth(compact)}px;visibility:hidden;pointer-events:none`;
  const photo = node('span', 'photo'), quote = node('span', 'card-quote'), tagRow = node('span', 'card-tags');
  applyVisualStyle(photo, style);
  fillCardQuote(quote, body, compact, style);
  for (const value of values) tagRow.append(node('span', '', `#${value}`));
  photo.append(quote, tagRow); probe.append(photo); document.body.append(probe);
  try {
    return photoQuoteClipped(photo, quote, tagRow);
  } finally { probe.remove(); }
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
  if (!client || (more && feedLoading)) return false;
  const searchContext = $('#feed-search-context');
  if (searchContext) {
    searchContext.hidden = !feedTerm || feedMode !== 'all';
    searchContext.querySelector('span').textContent = feedTerm
      ? `${feedSearchKind === 'tag' ? '태그' : '본문'} 검색 · ${feedTerm}` : '';
  }
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
    state(list, feedMode === 'events' ? '대문에서 로그인하면 내 이벤트를 볼 수 있어요.'
      : '대문에서 로그인하면 메모함과 내 카드를 볼 수 있어요.'); updateComposer(); return true;
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
    list.replaceChildren(note, button); return true;
  }
  // A prior browser grant can be reused without raising a new permission prompt.
  if (!more && feedMode === 'all' && !feedTerm && feedSort !== 'nearby' && !nearbyPosition) {
    const grantedPosition = await positionIfAlreadyGranted();
    if (version !== feedRun) return false;
    if (grantedPosition) nearbyPosition = grantedPosition;
  }
  let data, error;
  if (feedMode === 'events') {
    try { data = await noteRpc('list_my_events', {}); } catch (cause) { error = cause; }
  } else if (feedMode === 'all' && !feedTerm) {
    try {
      data = await noteRpc('list_cards', { p_sort: feedSort === 'latest' ? 'recent' : feedSort,
        p_lat: nearbyPosition?.latitude ?? null, p_lon: nearbyPosition?.longitude ?? null,
        p_radius_m: 30000, p_limit: 20,
        p_cursor: { offset: nearbyOffset, snapshot: nearbySnapshot } });
    } catch (cause) { error = cause; }
  } else {
    try { ({ data, error } = await filteredFeed()); } catch (cause) { error = cause; }
  }
  if (version !== feedRun) return false;
  feedLoading = false;
  if (error) {
    console.warn('Note feed:', error);
    if (!more) state(list, feedSort === 'nearby' && error?.name === 'GeolocationPositionError'
      ? '근처 카드를 보려면 위치 사용을 허용해 주세요.' : '카드를 불러오지 못했어요.');
    banner(feedSort === 'nearby' && error?.name === 'GeolocationPositionError' ? '위치 권한을 확인해 주세요' : '노트 연결을 확인해 주세요');
    const retry = node('button', 'button', '다시 시도');
    retry.type = 'button'; retry.dataset.retryFeed = more ? 'more' : 'first'; list.append(retry);
    updateComposer(); return false;
  }
  ready = true; banner('');
  if (!more) list.replaceChildren();
  for (const card of data || []) {
    if (card.kind === 'event' && card.body == null) continue;
    const exists = list.querySelector(`[data-card-id="${card.id}"]`);
    cache.set(card.id, card);
    if (!exists) {
      if (card.kind === 'event' && feedMode !== 'events') {
        let pinned = list.querySelector('.note-pinned-events');
        if (!pinned) {
          pinned = node('section', 'note-pinned-events'); pinned.setAttribute('aria-label', '범위 안의 이벤트');
          pinned.append(node('h2', '', '지금 볼 수 있는 이벤트')); list.prepend(pinned);
        }
        pinned.append(cardElement(card));
      } else list.append(cardElement(card));
    }
  }
  if (!more && !data?.length) state(list, feedMode === 'events' ? '아직 만든 이벤트가 없어요.' : feedTerm ? '검색 결과가 없어요.' : feedMode === 'saved'
    ? '저장한 카드가 없어요. 카드의 책갈피를 눌러 담아 보세요.' : feedMode === 'mine'
      ? '아직 작성한 카드가 없어요.' : feedSort === 'popular'
        ? '최근 7일에 올라온 카드가 없어요.' : '아직 카드가 없어요. 첫 카드를 써 보세요.');
  if (data?.length) feedCursor = data.at(-1);
  if (feedMode === 'all' && !feedTerm) nearbyOffset += data?.length || 0;
  if (feedMode !== 'events' && data?.length === 20) {
    const next = node('button', 'button', '더 보기'); next.type = 'button'; next.dataset.moreFeed = ''; list.append(next);
  }
  updateComposer();
  consumeInitialCard();
  return true;
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
function updateCardUrl(id = null, push = false) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('card', id); else url.searchParams.delete('card');
  history[push ? 'pushState' : 'replaceState']({ noteNavigation: push }, '', url);
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
  $('.replies').hidden = false;
  state(slot, '카드를 불러오는 중이에요.'); state(replies, '답글을 불러오는 중이에요.');
  $('#detail [data-compose="reply"]').disabled = true;
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (backdrop.hidden && management.hidden) $('.back-button').focus({ preventScroll: true });
  // Always recheck visibility: a saved card may have been blocked or hidden.
  let card, error;
  const position = positionIsFresh(nearbyPosition) ? nearbyPosition : null;
  try {
    card = await noteRpc('get_card', { p_id: id, p_lat: position?.latitude ?? null,
      p_lon: position?.longitude ?? null });
    // The author can manage their own event even when they are outside its paid range.
    if (session?.user && (!card || (card.kind === 'event' && card.body == null))) {
      const ownEvent = await noteRpc('get_my_event', { p_card_id: id });
      if (ownEvent) card = ownEvent;
    }
  }
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
  $('.replies').hidden = eventCard;
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
    state(replies, '');
  } else {
    $('#reply-count').textContent = String(card.reply_count || 0);
    loadReplies(id, version);
  }
}
function openCard(id) {
  if (!validCardId(id) || !ready) return;
  const alreadyLinked = new URL(location.href).searchParams.get('card') === id;
  stack.push(id); updateCardUrl(id, !alreadyLinked); renderDetail();
}
function goBack() {
  if (history.state?.noteNavigation) { history.back(); return; }
  if (stack.length > 1) { stack.pop(); updateCardUrl(stack.at(-1)); renderDetail(); }
  else showFeed();
}
window.addEventListener('popstate', () => {
  const id = new URL(location.href).searchParams.get('card');
  if (validCardId(id)) {
    if (!ready) { initialCardId = id; return; }
    stack.length = 0; stack.push(id); void renderDetail();
  } else showFeed(false);
});

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
function selectCollection(mode, preserveMessage = false) {
  feedMode = mode; if (!preserveMessage) message(''); showFeed();
  $('#feed-title').textContent = mode === 'all' ? '오쭈다노트 카드' : mode === 'events' ? '내 이벤트' : '메모함';
  $('#note-collection-tabs').hidden = mode === 'all' || mode === 'events';
  $('.feed-sort-tabs').hidden = mode !== 'all';
  document.querySelectorAll('[data-collection]').forEach(button => {
    const selected = button.dataset.collection === mode;
    button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected));
  });
  for (const nav of document.querySelectorAll('.side-nav button, .bottomnav button')) {
    const selected = mode === 'all' ? nav.dataset.show === 'feed'
      : mode === 'events' ? nav.dataset.show === 'events' : nav.dataset.show === 'saved';
    nav.classList.toggle('on', selected);
    if (selected) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current');
  }
  const eventNav = $('[data-show="events"]');
  if (eventNav) {
    eventNav.classList.toggle('on', mode === 'events');
    if (mode === 'events') eventNav.setAttribute('aria-current', 'page');
    else eventNav.removeAttribute('aria-current');
  }
  return loadFeed();
}
function setCardLocationSwitch(on, status, pending = false) {
  const button = $('#card-location-button');
  button.setAttribute('aria-checked', String(on));
  button.querySelector('.note-switch-state').textContent = pending ? '확인 중' : on ? '켜짐' : '꺼짐';
  $('#card-location-status').textContent = status;
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
  const sorts = $('.feed-sort-tabs');
  sorts.classList.add('feed-sort-tabs'); sorts.replaceChildren();
  const searchContext = node('div', 'feed-search-context'); searchContext.id = 'feed-search-context';
  searchContext.hidden = true; searchContext.setAttribute('role', 'status');
  const searchLabel = node('span');
  const clearSearch = node('button', '', '검색 지우기'); clearSearch.type = 'button';
  clearSearch.addEventListener('click', () => { feedTerm = ''; input.value = ''; loadFeed(); });
  searchContext.append(searchLabel, clearSearch); sorts.after(searchContext);
  const syncSortButtons = () => sorts.querySelectorAll('button').forEach(item => {
    const selected = item.dataset.sort === feedSort;
    item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected));
  });
  for (const [sort, label] of [['latest', '최신'], ['popular', '인기'], ['nearby', '근처']]) {
    const button = node('button', sort === feedSort ? 'selected' : '', label); button.type = 'button';
    button.dataset.sort = sort; button.setAttribute('aria-pressed', String(sort === feedSort));
    button.addEventListener('click', () => {
      const clearedSearch = sort === 'nearby' && Boolean(feedTerm || input.value);
      if (sort === 'nearby') { feedTerm = ''; input.value = ''; }
      if (feedSort === sort && !clearedSearch) return;
      feedSort = sort; syncSortButtons(); loadFeed();
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
    if (feedTerm && feedSort === 'nearby') { feedSort = 'latest'; syncSortButtons(); }
    loadFeed();
  });
  reset.addEventListener('click', () => { input.value = ''; feedTerm = ''; loadFeed(); input.focus(); });
  input.addEventListener('search', () => { if (!input.value && feedTerm) { feedTerm = ''; loadFeed(); } });
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) input.focus();
  });
  $('#event-start').addEventListener('click', () => openComposer('event'));
  $('#event-photo-file').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) void selectEventPhoto(file);
  });
  $('#event-photo-clear').addEventListener('click', () => {
    const removeExisting = kind === 'event' && !!editingId && eventHadPhoto;
    clearEventPhoto();
    if (removeExisting) {
      eventPhotoRemove = true;
      $('#event-photo-status').textContent = '기본 사진으로 변경할게요.';
    }
    recordDraft();
  });
  $('#event-select-center').addEventListener('click', () => {
    const center = eventMap?.getCenter();
    if (center) selectEventPosition(center);
    else $('#event-location-status').textContent = '지도를 불러오지 못했어요. 다시 열어 주세요.';
  });
  $('#card-location-button').addEventListener('click', async () => {
    if ($('#card-location-button').getAttribute('aria-checked') === 'true') {
      locationRun++;
      writingPosition = null;
      setCardLocationSwitch(false, '위치를 껐어요. 등록하려면 다시 켜 주세요.');
      updateComposer();
      return;
    }
    const run = ++locationRun;
    writingPosition = null;
    setCardLocationSwitch(true, '위치를 확인하는 중이에요.', true);
    updateComposer();
    try {
      const position = await currentPosition();
      if (run !== locationRun || backdrop.hidden || kind === 'event' || editingId) return;
      writingPosition = position;
      setCardLocationSwitch(true, '위치를 켰어요. 정확한 좌표는 카드에 표시되지 않아요.');
    } catch {
      if (run !== locationRun || backdrop.hidden) return;
      writingPosition = null;
      setCardLocationSwitch(false, '위치를 켤 수 없어요. 권한을 확인하고 다시 시도해 주세요.');
    } finally { if (run === locationRun) updateComposer(); }
  });
  for (const selector of ['#compose-font', '#compose-size', '#compose-effect']) {
    $(selector).addEventListener('change', () => { applyComposeStyle(); recordDraft(); });
  }
  for (const selector of ['#event-radius', '#event-hours']) $(selector).addEventListener('input', () => { updateEventPrice(); recordDraft(); });
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
    selectedPhotoKey = null;
    updateFeaturedPhoto();
    applyComposeStyle(); recordDraft();
  });
  const pageJump = $('#photo-page-jump');
  const pageCount = Math.ceil((PHOTO_LAST - PHOTO_FIRST + 1) / PHOTO_PAGE_SIZE);
  pageJump.closest('.note-photo-pages').hidden = pageCount <= 1;
  for (let page = 0; page < pageCount; page++) {
    const first = page * PHOTO_PAGE_SIZE + 1;
    const last = Math.min(first + PHOTO_PAGE_SIZE - 1, PHOTO_LAST - PHOTO_FIRST + 1);
    const option = node('option', '', `${page + 1} · ${String(first).padStart(3, '0')}–${String(last).padStart(3, '0')}`);
    option.value = String(page); pageJump.append(option);
  }
  pageJump.addEventListener('change', () => { photoPage = Number(pageJump.value); renderPhotoPage(); });
  $('#photo-gallery-toggle').addEventListener('click', () => {
    const gallery = $('#photo-gallery');
    gallery.hidden = !gallery.hidden;
    $('#photo-gallery-toggle').setAttribute('aria-expanded', String(!gallery.hidden));
    if (!gallery.hidden) { updateFeaturedPhoto(); renderPhotoPage(); }
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
function updateFeaturedPhoto() {
  const selected = photoAssetKey(selectedPhotoKey);
  const name = selected ? `사진 ${String(Number(selected) - PHOTO_FIRST + 1).padStart(3, '0')}` : '기본 사진 무작위';
  const price = selected ? '직접 선택 · 10쭈 / 1개월' : '무료 · 게시 전 미리보기';
  $('#photo-featured-image').src = photoUrl(selected || backgroundKey);
  $('#photo-featured-image').alt = selected ? `${name} 미리보기` : '기본 사진 미리보기';
  $('#photo-featured-name').textContent = name;
  $('#photo-featured-detail').textContent = price;
  $('#photo-featured-badge').textContent = selected ? '선택됨' : '무료';
  $('#photo-featured-badge').classList.toggle('is-selected', !!selected);
  $('#photo-selection').textContent = selected ? `${name} 선택됨 · 게시 후 10쭈 / 1개월` : '기본 사진 무작위 · 무료';
}
function renderPhotoPage() {
  const grid = $('#photo-grid'); grid.replaceChildren();
  const first = PHOTO_FIRST + photoPage * PHOTO_PAGE_SIZE;
  for (let number = first; number <= Math.min(PHOTO_LAST, first + PHOTO_PAGE_SIZE - 1); number++) {
    const key = String(number), title = `사진 ${String(number - PHOTO_FIRST + 1).padStart(3, '0')}`;
    const tile = node('label', 'note-photo-tile'); tile.title = `${title} · 10쭈 / 1개월`;
    const input = node('input'); input.type = 'radio'; input.name = 'photo-choice'; input.value = key;
    input.checked = selectedPhotoKey === key; input.setAttribute('aria-label', `${title}, 10쭈로 1개월`);
    input.addEventListener('change', () => {
      selectedPhotoKey = key; updateFeaturedPhoto();
      applyComposeStyle(); recordDraft();
    });
    const img = node('img'); img.src = photoUrl(key); img.alt = ''; img.loading = 'lazy';
    const caption = node('span', 'note-photo-tile-caption', title);
    const mark = node('span', 'note-photo-tile-mark', '✓'); mark.setAttribute('aria-hidden', 'true');
    tile.append(input, img, caption, mark); grid.append(tile);
  }
  $('#photo-page-status').textContent = `${photoPage + 1} / ${Math.ceil((PHOTO_LAST - PHOTO_FIRST + 1) / PHOTO_PAGE_SIZE)}`;
  $('#photo-page-jump').value = String(photoPage);
  $('#photo-prev').disabled = photoPage === 0;
  $('#photo-next').disabled = first + PHOTO_PAGE_SIZE > PHOTO_LAST;
}

function currentStyle() {
  return { font: $('#compose-font').value, size: $('#compose-size').value, theme: $('#compose-theme').value,
    effect: $('#compose-effect').value,
    textColor: $('input[name="textColor"]:checked')?.value || 'default',
    boxColor: $('input[name="boxColor"]:checked')?.value || 'default' };
}
function chosenPhoto() { return selectedPhotoKey || 'plain'; }
function clearEventPhoto() {
  eventPhotoRun++;
  if (eventPhotoPreviewUrl) URL.revokeObjectURL(eventPhotoPreviewUrl);
  eventPhotoPreviewUrl = null; eventPhotoBlob = null; eventPhotoRequestId = null;
  eventPhotoPreparing = false; eventPhotoError = ''; eventHadPhoto = false; eventPhotoRemove = false; eventCurrentPhotoUrl = null;
  $('#event-photo-file').value = '';
  $('#event-photo-clear').hidden = true;
  const status = $('#event-photo-status');
  status.textContent = 'JPG·PNG·WebP · 10MB 이하 · 추가 쭈 없음';
  status.classList.remove('is-error');
  if (kind === 'event') { applyComposeStyle(); updateComposer(); }
}
async function prepareEventPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)
    throw new Error('JPG·PNG·WebP 사진을 10MB 이하로 골라 주세요.');
  let source, temporaryUrl;
  try {
    if (typeof createImageBitmap === 'function') source = await createImageBitmap(file);
    else {
      temporaryUrl = URL.createObjectURL(file);
      source = new Image(); source.src = temporaryUrl;
      await source.decode();
    }
    const width = source.width || source.naturalWidth, height = source.height || source.naturalHeight;
    if (!width || !height || width * height > 40000000)
      throw new Error('사진 크기가 너무 커요. 다른 사진을 골라 주세요.');
    const scale = Math.min(1, 1600 / Math.max(width, height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .84));
    if (blob?.size > 3 * 1024 * 1024)
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .7));
    if (!blob || blob.size > 3 * 1024 * 1024) throw new Error('사진을 줄일 수 없어요. 다른 사진을 골라 주세요.');
    return blob;
  } finally { source?.close?.(); if (temporaryUrl) URL.revokeObjectURL(temporaryUrl); }
}
async function selectEventPhoto(file) {
  if (!file || kind !== 'event' || busy) return;
  const run = ++eventPhotoRun;
  eventPhotoPreparing = true; eventPhotoError = '';
  $('#event-photo-status').textContent = '사진을 준비하는 중이에요…';
  $('#event-photo-status').classList.remove('is-error');
  updateComposer();
  try {
    const blob = await prepareEventPhoto(file);
    if (run !== eventPhotoRun || kind !== 'event' || backdrop.hidden) return;
    if (eventPhotoPreviewUrl) URL.revokeObjectURL(eventPhotoPreviewUrl);
    eventPhotoBlob = blob; eventPhotoPreviewUrl = URL.createObjectURL(blob);
    eventPhotoRequestId = crypto.randomUUID();
    eventPhotoRemove = false;
    $('#event-photo-status').textContent = `${file.name.slice(0, 40)} · 내 사진 적용`;
    $('#event-photo-clear').hidden = false;
    applyComposeStyle(); recordDraft();
  } catch (error) {
    if (run !== eventPhotoRun || backdrop.hidden) return;
    eventPhotoError = error.message || '사진을 읽지 못했어요. 다시 선택해 주세요.';
    $('#event-photo-status').textContent = eventPhotoError;
    $('#event-photo-status').classList.add('is-error');
  } finally { if (run === eventPhotoRun) { eventPhotoPreparing = false; updateComposer(); } }
}
function applyComposeStyle() {
  const preview = $('.compose-photo'), style = currentStyle();
  const photo = $('#note-photo-pick').hidden || chosenPhoto() === 'plain' ? backgroundKey : chosenPhoto();
  setPhotoBackground(preview, photo);
  if (kind === 'event' && (eventPhotoPreviewUrl || (!eventPhotoRemove && eventCurrentPhotoUrl)))
    preview.style.backgroundImage = `url("${eventPhotoPreviewUrl || eventCurrentPhotoUrl}")`;
  applyVisualStyle(preview, style);
  if (!backdrop.hidden) updateComposer();
}
async function showExistingEventPhoto(card, run) {
  if (!(card?.has_event_photo || card?.event_photo_path) || !client) return;
  try {
    const path = card.event_photo_path || await noteRpc('get_my_event_photo_path', { p_card_id: card.id });
    if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/i.test(path || '')) return;
    const { data, error } = await client.storage.from(EVENT_PHOTO_BUCKET).createSignedUrl(path, 120);
    if (error) throw error;
    if (run === composerRun && !backdrop.hidden && editingId === card.id && !eventPhotoRemove) {
      eventCurrentPhotoUrl = data?.signedUrl?.replaceAll('"', '%22') || null;
      applyComposeStyle();
    }
  } catch (error) { console.warn('Note own event photo:', error); }
}
function updateEventPrice() {
  const radius = Number($('#event-radius').value), hours = Number($('#event-hours').value);
  const validRadius = validEventInteger($('#event-radius').value, 1, 30);
  const valid = validRadius && validEventInteger($('#event-hours').value, 1, 24);
  eventMap?.setSelectionRadius(validRadius ? radius * 1000 : 0);
  if (kind === 'event' && eventPosition && !backdrop.hidden)
    $('#event-location-status').textContent = validRadius
      ? `선택한 위치에서 반경 ${radius}km가 파란 원으로 표시돼요. 분홍 원은 기존 이벤트 범위예요.`
      : '반경은 1~30km 사이의 정수로 입력해 주세요.';
  $('#event-price').textContent = valid ? `${radius}km × ${hours}시간 = ${(100 * radius * hours).toLocaleString('ko-KR')}쭈` : '반경 1~30km, 시간 1~24시간을 정수로 입력해 주세요.';
  if (kind === 'event' && !editingId) submit.textContent = valid ? `${(100 * radius * hours).toLocaleString('ko-KR')}쭈 결제 후 등록` : '범위와 시간을 확인해 주세요';
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
  const radius = Number($('#event-radius').value);
  $('#event-location-status').textContent = Number.isInteger(radius) && radius >= 1 && radius <= 30
    ? `선택한 위치에서 반경 ${radius}km가 파란 원으로 표시돼요. 분홍 원은 기존 이벤트 범위예요.`
    : '위치를 선택했어요. 반경을 1~30km 사이의 정수로 입력해 주세요.';
  scheduleComposerMap(point);
  recordDraft();
  updateComposer();
}
function prepareEventMap() {
  if (eventMap) { eventMap.invalidate(); return; }
  eventMap = window.OjjudaMap?.create($('#event-map'), { center: eventPosition
    ? { lat: eventPosition.latitude, lng: eventPosition.longitude }
    : nearbyPosition ? { lat: nearbyPosition.latitude, lng: nearbyPosition.longitude } : undefined,
    onMove: scheduleComposerMap,
    onSelect: selectEventPosition });
  if (eventMap) {
    const radius = Number($('#event-radius').value);
    eventMap.setSelectionRadius(Number.isInteger(radius) && radius >= 1 && radius <= 30 ? radius * 1000 : 0);
    refreshComposerMap(eventMap.getCenter());
  }
}

function draftContent() {
  return { body: text.value, tags: tags.value, background_key: backgroundKey, kind, parent_id: parentId,
    style: currentStyle(), photo_key: kind === 'memo' && chosenPhoto() !== 'plain' ? chosenPhoto() : null };
}
function localComposerKey() {
  if (!composerUserId || (!editingId && kind !== 'event')) return null;
  return `ojjuda-note-local-composer-v1:${composerUserId}:${editingId ? `edit:${editingId}` : 'event'}`;
}
function localComposerContent() {
  return { kind, editingId, body: text.value, tags: tags.value, style: currentStyle(),
    identity: $('input[name="identity"]:checked')?.value || 'anonymous', backgroundKey,
    eventPosition: kind === 'event' && !editingId ? eventPosition : null,
    eventPhotoSelected: kind === 'event' && !editingId ? !!eventPhotoBlob : false,
    radius: $('#event-radius').value, hours: $('#event-hours').value,
    requestId: kind === 'event' && !editingId ? publishRequestId : null };
}
function clearLocalComposer() {
  const key = localComposerKey();
  if (key) { try { sessionStorage.removeItem(key); } catch { /* Session storage may be blocked. */ } }
  localComposerDirty = false; localComposerStored = false;
}
function recordLocalComposer() {
  const key = localComposerKey();
  if (!key || backdrop.hidden || !localComposerBaseline) return;
  const content = localComposerContent();
  localComposerDirty = JSON.stringify(content) !== localComposerBaseline;
  if (!localComposerDirty) { clearLocalComposer(); return; }
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), content }));
    localComposerStored = true;
  } catch { localComposerStored = false; }
}
function restoreLocalComposer() {
  const key = localComposerKey();
  if (!key) return false;
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(key) || 'null'); }
  catch { clearLocalComposer(); return false; }
  const content = saved?.content, age = Date.now() - Number(saved?.savedAt);
  if (!content || content.kind !== kind || content.editingId !== editingId
    || !Number.isFinite(age) || age < 0 || age > 7 * 86400000
    || typeof content.body !== 'string' || content.body.length > 200
    || typeof content.tags !== 'string' || content.tags.length > 120
    || !content.style || typeof content.style !== 'object') {
    clearLocalComposer(); return false;
  }
  text.value = content.body; tags.value = content.tags;
  backgroundKey = photoAssetKey(content.backgroundKey) || backgroundKey;
  $('#compose-font').value = FONT_CODES.includes(content.style.font) ? content.style.font : 'default';
  $('#compose-size').value = ['large', 'small'].includes(content.style.size) ? content.style.size : 'normal';
  $('#compose-theme').value = ['rose', 'night'].includes(content.style.theme) ? content.style.theme : 'plain';
  $('#compose-effect').value = EFFECT_CODES.includes(content.style.effect) ? content.style.effect : 'none';
  for (const group of ['textColor', 'boxColor']) setColorChoice(group, content.style[group]);
  $(`input[name="identity"][value="${content.identity === 'nickname' ? 'nickname' : 'anonymous'}"]`).checked = true;
  if (kind === 'event' && !editingId) {
    const position = content.eventPosition;
    eventPosition = position && Number.isFinite(position.latitude) && Number.isFinite(position.longitude)
      && Math.abs(position.latitude) <= 90 && Math.abs(position.longitude) <= 180
      ? { latitude: position.latitude, longitude: position.longitude } : null;
    $('#event-radius').value = /^\d{1,2}$/.test(String(content.radius)) ? String(content.radius) : '1';
    $('#event-hours').value = /^\d{1,2}$/.test(String(content.hours)) ? String(content.hours) : '1';
    if (validCardId(content.requestId)) publishRequestId = content.requestId;
    if (eventPosition) $('#event-location-status').textContent = '이전에 고른 이벤트 위치를 복구했어요.';
    if (content.eventPhotoSelected) {
      eventPhotoError = '이전 사진은 다시 선택해 주세요. 기본 사진으로 바꿀 수도 있어요.';
      $('#event-photo-status').textContent = eventPhotoError;
      $('#event-photo-status').classList.add('is-error');
      $('#event-photo-clear').hidden = false;
    }
  }
  applyComposeStyle(); updateEventPrice();
  localComposerDirty = JSON.stringify(localComposerContent()) !== localComposerBaseline;
  if (!localComposerDirty) { clearLocalComposer(); return false; }
  localComposerStored = true;
  return true;
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
  for (const group of ['textColor', 'boxColor']) setColorChoice(group, style[group]);
  selectedPhotoKey = kind === 'memo' ? photoAssetKey(content.photo_key) : null;
  $('input[name="photo-choice"][value="plain"]').checked = !selectedPhotoKey;
  updateFeaturedPhoto();
  if (selectedPhotoKey) photoPage = Math.floor((Number(selectedPhotoKey) - PHOTO_FIRST) / PHOTO_PAGE_SIZE);
  applyComposeStyle();
  $('#compose-title').textContent = kind === 'comment' ? '답글 카드 쓰기' : '새 카드 쓰기';
  $('#compose-context').textContent = kind === 'comment' ? replyContext() : '사진 위에 마음을 적어 주세요.';
  updateComposer();
  if (kind === 'comment') void refreshReplyArchiveNotice(parentId, composerRun);
}
function recordDraft() {
  if (editingId || kind === 'event') { recordLocalComposer(); return; }
  if (!draftController || backdrop.hidden || draftLoading || !session?.user) return;
  try { draftController.change(draftContent()); }
  catch (error) { draftStatus.textContent = error.message; draftStatus.hidden = false; }
}
function setComposerInputs() {
  const disabled = busy || draftLoading;
  text.disabled = disabled; tags.disabled = disabled;
  $('#card-location-button').disabled = disabled;
  for (const selector of ['#compose-font', '#compose-size', '#compose-effect', '#event-select-center', '#event-radius', '#event-hours', '#photo-gallery-toggle', '#photo-prev', '#photo-next', '#photo-page-jump']) $(selector).disabled = disabled;
  $('#event-photo-file').disabled = disabled || eventPhotoPreparing;
  $('#event-photo-clear').disabled = disabled || eventPhotoPreparing;
  document.querySelectorAll('.note-color-choice input, input[name="photo-choice"]').forEach(input => { input.disabled = disabled; });
  document.querySelectorAll('input[name="identity"]').forEach(input => { input.disabled = disabled; });
}
function installDrafts() {
  if (!client || !window.OjjudaNoteDrafts) return;
  draftStatus = node('span', 'note-draft-alert'); draftStatus.hidden = true;
  draftStatus.setAttribute('role', 'status'); draftStatus.setAttribute('aria-live', 'polite');
  $('.composer-footer').append(draftStatus);
  draftController = window.OjjudaNoteDrafts.create({ rpc: noteRpc, getUserId: () => session?.user?.id || null,
    onStatus: snapshot => {
      const needsAttention = snapshot.state === 'conflict' || snapshot.state === 'error';
      draftStatus.textContent = needsAttention ? snapshot.message : '';
      draftStatus.hidden = !needsAttention || backdrop.hidden || editingId || kind === 'event';
    } });
}

function parsedTags(raw = tags.value) {
  const values = raw.split(',').map(value => value.trim().replace(/^#/, '').trim()).filter(Boolean);
  return values.length <= 5 && values.every(value => value.length <= 20) && new Set(values).size === values.length ? values : null;
}
function validEventBody(value) {
  return value.length <= 200
    && /[^\s\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u.test(value);
}
function validEventPosition(position = eventPosition) {
  return !!position && Number.isFinite(position.latitude) && Number.isFinite(position.longitude)
    && Math.abs(position.latitude) <= 90 && Math.abs(position.longitude) <= 180;
}
function validEventInteger(value, minimum, maximum) {
  const raw = String(value).trim();
  return /^\d{1,2}$/.test(raw) && Number(raw) >= minimum && Number(raw) <= maximum;
}
function updateComposer() {
  if (!backdrop.hidden) resizeComposerText();
  $('#compose-count').textContent = `${text.value.length} / 200자`;
  const visual = currentStyle();
  const extra = selectedPhotoKey || tags.value.trim() || visual.font !== 'default'
    || visual.size !== 'normal' || visual.effect !== 'none'
    || ['textColor', 'boxColor'].some(key => visual[key] !== 'default');
  $('#compose-more>summary').textContent = extra ? '꾸미기 · 추가 설정 (선택됨)' : '꾸미기 · 추가 설정';
  const values = parsedTags();
  const previewTags = tags.value.split(',').map(value => value.trim().replace(/^#/, '').trim()).filter(Boolean).slice(0, 5);
  $('#compose-tag-display').replaceChildren(...previewTags.map(value => node('span', '', `#${value.slice(0, 20)}`)));
  const overflows = !backdrop.hidden && !!text.value.trim()
    && (composerPhotoOverflows() || cardPhotoOverflows(text.value, previewTags));
  let warning = $('#compose-overflow-warning');
  if (!warning) {
    warning = node('span', 'compose-overflow-warning'); warning.id = 'compose-overflow-warning';
    $('#compose-count').before(warning);
  }
  warning.textContent = overflows ? '사진에 글이 다 보이지 않아요. 등록할 때 확인할 수 있어요.' : '';
  warning.hidden = !overflows;
  if (!client || !ready) composeMessage.textContent = '노트 연결 확인 후 등록 가능';
  else if (!authKnown) composeMessage.textContent = '로그인 확인 중';
  else if (!session?.user) {
    const link = node(localStage ? 'button' : 'a', '', localStage ? '테스트 로그인' : '대문에서 로그인');
    if (localStage) { link.type = 'button'; link.dataset.stageLogin = ''; }
    else link.href = '/';
    composeMessage.replaceChildren(link);
  } else if (!canWrite()) composeMessage.textContent = writingMessage();
  else if (text.value.length > 200) composeMessage.textContent = '글은 200자 이내로 작성해 주세요';
  else if (kind === 'event' && !validEventBody(text.value)) composeMessage.textContent = '이벤트 내용을 입력해 주세요.';
  else if (!values) composeMessage.textContent = '태그는 중복 없이 5개까지, 각 20자 이내';
  else if (kind === 'comment' && replyDueChecking) composeMessage.textContent = '상위 카드 공개 종료일 확인 중';
  else if (kind !== 'event' && !editingId && !writingPosition) composeMessage.textContent = '위치를 켜고 확인한 뒤 등록할 수 있어요.';
  else if (kind === 'event' && !editingId && !validEventPosition()) composeMessage.textContent = '지도에서 이벤트 중심을 정해 주세요.';
  else if (kind === 'event' && eventPhotoPreparing) composeMessage.textContent = '사진을 준비하는 중이에요.';
  else if (kind === 'event' && eventPhotoError) composeMessage.textContent = eventPhotoError;
  else if (kind === 'event' && !editingId && !validEventOptions()) composeMessage.textContent = '반경과 시간을 범위 안의 정수로 입력해 주세요.';
  else composeMessage.textContent = busy ? (editingId ? '수정 중' : '등록 중')
    : kind === 'event' && !editingId ? '이벤트 범위와 금액을 확인해 주세요.'
      : $('input[name="identity"]:checked')?.value === 'nickname' ? '월드 닉네임 공개' : '익명 카드';
  submit.disabled = busy || draftLoading || replyDueChecking || eventPhotoPreparing || !!eventPhotoError || !client || !ready || !session?.user || !canWrite() || !text.value.trim()
    || text.value.length > 200 || !values
    || (kind !== 'event' && !editingId && !writingPosition)
    || (kind === 'event' && (!validEventBody(text.value)
      || (!editingId && (!validEventPosition() || !validEventOptions()))));
}
function resizeComposerText() {
  const photo = $('.compose-photo');
  text.style.height = 'auto';
  const minimum = 88;
  const maximum = Math.max(minimum, photo.clientHeight * .72);
  text.style.height = `${Math.min(maximum, Math.max(minimum, text.scrollHeight))}px`;
}
function composerPhotoOverflows() {
  const tagsRow = $('#compose-tag-display');
  return text.scrollHeight > text.clientHeight + 1 || (tagsRow.childElementCount > 0
    && text.getBoundingClientRect().bottom + 6 > tagsRow.getBoundingClientRect().top);
}
function validEventOptions() {
  return validEventInteger($('#event-radius').value, 1, 30)
    && validEventInteger($('#event-hours').value, 1, 24);
}
async function openComposer(mode, card = null) {
  if (busy || draftLoading) return;
  const run = ++composerRun, epoch = identityEpoch;
  if (card?.kind === 'event' && card.is_mine) {
    try {
      const latest = await noteRpc('get_my_event', { p_card_id: card.id });
      if (run !== composerRun || epoch !== identityEpoch) return;
      if (!latest) { message('이벤트가 삭제되었거나 수정할 수 없어요.'); return; }
      card = latest;
    } catch (error) {
      console.warn('Note event edit:', error);
      message('이벤트 정보를 불러오지 못했어요. 다시 시도해 주세요.'); return;
    }
  }
  focusBefore = document.activeElement;
  editingId = card?.is_mine ? card.id : null;
  composerUserId = session?.user?.id || null;
  kind = editingId ? card.kind : mode === 'event' ? 'event' : mode === 'reply' && stack.length ? 'comment' : 'memo';
  clearEventPhoto();
  localComposerBaseline = null; localComposerDirty = false; localComposerStored = false;
  parentId = editingId ? card.parent_id : kind === 'comment' ? stack.at(-1) : null;
  backgroundKey = editingId ? card.background_key : String(PHOTO_FIRST + Math.floor(Math.random() * (PHOTO_LAST - PHOTO_FIRST + 1)));
  writingPosition = null; eventPosition = null; publishRequestId = crypto.randomUUID(); photoRequestId = crypto.randomUUID(); locationRun++;
  replyDueChecking = false; replyDueRun++;
  $('#note-photo-pick').hidden = !!editingId || kind !== 'memo';
  $('#event-photo-choice').hidden = kind !== 'event';
  if (kind === 'event' && editingId) {
    eventHadPhoto = !!(card.has_event_photo || card.event_photo_path);
    if (eventHadPhoto) {
      $('#event-photo-status').textContent = '현재 사진 유지 · 다른 사진을 선택하거나 기본 사진으로 바꿀 수 있어요.';
      $('#event-photo-clear').hidden = false;
    }
  }
  $('#compose-more').open = false;
  $('#photo-gallery').hidden = true; $('#photo-gallery-toggle').setAttribute('aria-expanded', 'false');
  $('#photo-grid').replaceChildren(); photoPage = 0; selectedPhotoKey = null;
  $('input[name="photo-choice"][value="plain"]').checked = true;
  updateFeaturedPhoto();
  $('#card-location-consent').hidden = kind === 'event' || !!editingId;
  setCardLocationSwitch(false, '카드를 등록하려면 위치를 켜 주세요. 정확한 좌표는 비공개로 저장돼요.');
  $('#note-event-fields').hidden = kind !== 'event' || !!editingId;
  $('#event-radius').value = '1'; $('#event-hours').value = '1';
  $('#event-location-status').textContent = '지도를 누르거나 Tab으로 지도에 초점을 맞춘 뒤 방향키로 이동하고 아래 버튼으로 중심을 선택해 주세요. 지정한 위치와 범위는 다른 사람에게 보입니다.';
  $('#compose-title').textContent = editingId ? kind === 'event' ? '내 이벤트 수정' : '내 카드 수정' : kind === 'event' ? '이벤트 카드 쓰기' : kind === 'comment' ? '답글 카드 쓰기' : '새 카드 쓰기';
  $('#compose-context').textContent = editingId ? kind === 'event'
    ? '글·태그·꾸미기·사진을 수정할 수 있어요. 구매한 위치·반경·기간은 그대로 유지돼요.'
    : '글과 태그를 수정할 수 있어요.' : kind === 'comment' ? replyContext() : '마음을 카드에 적어 주세요.';
  submit.textContent = editingId ? '수정하기' : kind === 'event' ? '100쭈 결제 후 등록' : '등록하기';
  const style = editingId && card.style && typeof card.style === 'object' ? card.style : {};
  $('#compose-font').value = FONT_CODES.includes(style.font) ? style.font : 'default';
  $('#compose-size').value = ['large', 'small'].includes(style.size) ? style.size : 'normal';
  $('#compose-theme').value = ['rose', 'night'].includes(style.theme) ? style.theme : 'plain';
  $('#compose-effect').value = EFFECT_CODES.includes(style.effect) ? style.effect : 'none';
  for (const group of ['textColor', 'boxColor']) setColorChoice(group, style[group]);
  applyComposeStyle(); updateEventPrice();
  text.value = editingId ? card.body : ''; tags.value = editingId ? card.tags.join(', ') : '';
  const identityMode = editingId && card.identity_mode === 'nickname' ? 'nickname' : 'anonymous';
  $(`input[name="identity"][value="${identityMode}"]`).checked = true;
  let restoredLocalComposer = false;
  if (editingId || kind === 'event') {
    localComposerBaseline = JSON.stringify(localComposerContent());
    restoredLocalComposer = restoreLocalComposer();
  }
  if (restoredLocalComposer) $('#compose-context').textContent = '이전에 작성하던 내용을 복구했어요.';
  requestedDraftContent = draftContent();
  if (draftStatus) draftStatus.hidden = true;
  updateComposer(); backdrop.hidden = false; lockPage(true); updateComposer(); text.focus();
  if (kind === 'event' && editingId && eventHadPhoto) void showExistingEventPhoto(card, run);
  if (kind === 'event' && !editingId) {
    eventMap?.destroy(); eventMap = null; prepareEventMap();
    if (eventPosition) {
      const point = { lat: eventPosition.latitude, lng: eventPosition.longitude };
      eventMap?.setCenter(point); eventMap?.setSelection(point); scheduleComposerMap(point);
    }
  }
  if (kind === 'comment' && !editingId) void refreshReplyArchiveNotice(parentId, run);
  if (!editingId && kind !== 'event' && draftController && composerUserId) {
    draftLoading = true; setComposerInputs(); updateComposer();
    try {
      const restored = await draftController.resume(requestedDraftContent);
      if (run === composerRun && epoch === identityEpoch && !backdrop.hidden) restoreDraft(restored);
    }
    catch (error) {
      if (run === composerRun) { draftStatus.textContent = error.message || '임시 글을 불러오지 못했어요.'; draftStatus.hidden = false; }
    }
    finally {
      if (run === composerRun) { draftLoading = false; setComposerInputs(); updateComposer(); if (!backdrop.hidden) text.focus(); }
    }
  }
}

function closeComposer(saveDraft = true) {
  if (busy) return;
  if (saveDraft) {
    recordDraft();
    if (localComposerDirty && !window.confirm(localComposerStored
      ? '작성 중인 내용이 있어요. 같은 탭에서 다시 열면 복구됩니다. 닫을까요?'
      : '작성 중인 내용을 보관하지 못했어요. 닫으면 사라집니다. 닫을까요?')) return;
  } else if (editingId || kind === 'event') clearLocalComposer();
  composerRun++; replyDueRun++; replyDueChecking = false; draftLoading = false; setComposerInputs();
  backdrop.hidden = true; writingPosition = null; eventPosition = null; locationRun++; composerMapFetchRun++;
  clearEventPhoto();
  setCardLocationSwitch(false, '카드를 등록하려면 위치를 켜 주세요. 정확한 좌표는 비공개로 저장돼요.');
  clearTimeout(composerMapTimer); eventMap?.destroy(); eventMap = null; lockPage(false);
  if (focusBefore?.isConnected) focusBefore.focus({ preventScroll: true });
}
async function publishCard() {
  if (busy || submit.disabled || !client || !ready) return;
  let body = text.value.replace(/\r\n?/g, '\n').trim(), values = parsedTags();
  if (!body || body.length > 200 || !values) return;
  const editId = editingId, actionUserId = composerUserId;
  if (kind === 'event' && (!validEventBody(body) || eventPhotoPreparing || eventPhotoError
    || (!editId && (!validEventPosition() || !validEventOptions())))) { updateComposer(); return; }
  const identityMode = $('input[name="identity"]:checked')?.value === 'nickname' ? 'nickname' : 'anonymous';
  const selectedPhoto = kind === 'memo' && !editId ? chosenPhoto() : 'plain';
  const selectedPhotoRequestId = photoRequestId;
  const selectedEventPhoto = kind === 'event' ? eventPhotoBlob : null;
  const selectedEventPhotoRequestId = eventPhotoRequestId;
  const removeEventPhoto = kind === 'event' && !!editId && eventPhotoRemove;
  if (kind === 'comment' && !editId && archiveDueThisMonth(parentArchiveDue(cache.get(parentId)))
    && !window.confirm(`상위 카드가 ${dateLabel(parentArchiveDue(cache.get(parentId)))}에 공개 종료될 예정이에요. 이 답글도 함께 삭제될 수 있습니다. 등록할까요?`)) return;
  if ((composerPhotoOverflows() || cardPhotoOverflows(body, values))
    && !window.confirm('글이나 태그 일부가 사진 안에 다 보이지 않습니다. 카드 크게 보기에서 전체 글을 볼 수 있어요. 그래도 등록할까요?')) return;
  if (kind === 'event' && !editId) {
    const cost = Number($('#event-radius').value) * Number($('#event-hours').value) * 100;
    if (!window.confirm(`이벤트 ${cost.toLocaleString('ko-KR')}쭈를 결제하고 등록할까요?`)) return;
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
      if (!body || body.length > 200 || !values) throw new Error('보관된 내용을 확인해 주세요.');
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
  let eventPhotoPath = null;
  if (publishKind === 'event' && selectedEventPhoto) {
    eventPhotoPath = `${actionUserId}/${selectedEventPhotoRequestId}.jpg`;
    try {
      const { error: uploadError } = await client.storage.from(EVENT_PHOTO_BUCKET).upload(
        eventPhotoPath, selectedEventPhoto, { contentType: 'image/jpeg', upsert: false, cacheControl: '300' });
      if (uploadError) {
        // Retrying the same request can encounter the file uploaded just before a lost response.
        if (String(uploadError.statusCode) !== '409' && !/already exists|duplicate/i.test(uploadError.message || ''))
          throw uploadError;
      }
    } catch (uploadError) {
      console.warn('Note event photo upload:', uploadError);
      busy = false; setComposerInputs(); updateComposer();
      composeMessage.textContent = editId ? '사진을 올리지 못했어요. 이벤트는 수정되지 않았어요. 다시 시도해 주세요.'
        : '사진을 올리지 못했어요. 이벤트 비용은 차감되지 않았어요. 다시 시도해 주세요.';
      return;
    }
  }
  let data, error;
  try {
    if (editId && publishKind === 'event') {
      data = await noteRpc('update_my_event', { p_card_id: editId, p_body: body,
        p_tags: values, p_identity_mode: identityMode, p_style: currentStyle(),
        p_photo_path: eventPhotoPath, p_remove_photo: removeEventPhoto });
    } else if (editId) {
      ({ data, error } = await query().from('cards').update({ body, tags: values, identity_mode: identityMode }).eq('id', editId).select('id').maybeSingle());
    } else if (publishKind === 'event') {
      data = await noteRpc(eventPhotoPath ? 'publish_event_with_photo' : 'publish_event', { p_request_id: publishRequestId, p_body: body, p_tags: values,
        p_identity_mode: identityMode, p_style: currentStyle(), p_lat: eventPosition.latitude,
        p_lon: eventPosition.longitude, p_radius_km: Number($('#event-radius').value),
        p_starts_at: new Date().toISOString(), p_duration_hours: Number($('#event-hours').value),
        ...(eventPhotoPath ? { p_photo_path: eventPhotoPath } : {}) });
    } else {
      data = await noteRpc('publish_card', { p_request_id: publishRequestId, p_body: body, p_tags: values,
        p_identity_mode: identityMode, p_style: currentStyle(), p_lat: writingPosition?.latitude,
        p_lon: writingPosition?.longitude, p_parent_id: publishParent });
    }
    if (data?.ok === false) throw Object.assign(new Error(data.reason === 'coins'
      ? `쭈 잔액이 부족해요. ${Number(data.required || 0).toLocaleString('ko-KR')}쭈가 필요해요.`
      : '게시가 완료되지 않았어요.'), { code: 'EVENT_REJECTED' });
  } catch (cause) { error = cause; }
  if (error && eventPhotoPath && error.code) {
    // A rejected database transaction leaves the uploaded file unattached.
    try {
      const { error: cleanupError } = await client.storage.from(EVENT_PHOTO_BUCKET).remove([eventPhotoPath]);
      if (cleanupError) throw cleanupError;
    }
    catch (cleanupError) { console.warn('Note event photo cleanup:', cleanupError); }
  }
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
    updateComposer();
    composeMessage.textContent = /Invalid event (?:input|edit)/i.test(error?.message || '')
      ? editId ? '이벤트 글·태그·사진을 확인해 주세요.' : '이벤트 글·태그·위치·반경·시간을 확인해 주세요.'
      : error?.code === 'EVENT_REJECTED' ? error.message
        : editId ? '수정하지 못했어요. 권한과 연결을 확인해 주세요' : '등록하지 못했어요. 다시 시도해 주세요';
    return;
  }
  if (editId && publishedId && publishKind !== 'event') {
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
  if (publishKind === 'event' && !editId && Number.isFinite(spent)) {
    message(`이벤트를 등록했어요. 서버에서 ${spent.toLocaleString('ko-KR')}쭈를 차감했어요.`);
    void loadWorldBalance(actionUserId);
  }
  if (publishKind === 'event' && editId) message('이벤트를 수정했어요.');
  if (publishKind === 'comment' && archiveDueThisMonth(data?.effective_archive_due_at))
    message(`답글이 등록됐어요. 상위 카드와 함께 ${dateLabel(data.effective_archive_due_at)}에 공개 종료될 수 있어요. 알림을 확인해 주세요.`);
  text.value = ''; tags.value = '';
  closeComposer(false);
  if (!editId && publishKind !== 'comment') {
    // A new card can be hidden by an older search, saved-only view, or popular sort.
    feedSort = 'latest'; feedTerm = '';
    const searchInput = $('#tag-search');
    if (searchInput) searchInput.value = '';
    document.querySelectorAll('.feed-sort-tabs [data-sort]').forEach(button => {
      const selected = button.dataset.sort === feedSort;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const refreshed = await selectCollection(publishKind === 'event' ? 'events' : 'all', true);
    if (publishKind === 'memo') message(refreshed
      ? '카드가 등록됐어요. 최신 목록을 새로 불러왔어요.'
      : '카드는 등록됐어요. 목록을 불러오지 못해 다시 시도해 주세요.');
  } else {
    await refreshCards(editId || publishKind === 'comment');
  }
  if (publishKind === 'comment') void notificationController?.refresh?.();
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
window.ojjudaRefreshFeed = () => loadFeed();
function manageCard(id) {
  const card = cache.get(id);
  if (!card || !session?.user) return;
  showManagement(card.is_mine ? '내 카드 관리' : '카드 관리');
  managementBody.append(node('p', 'management-help', '노트의 글과 차단 설정을 관리합니다.'));
  if (card.is_mine) {
    const eventEnded = card.kind === 'event' && Date.parse(card.event_ends_at) <= Date.now();
    if (eventEnded) managementBody.append(node('p', 'management-help', '종료된 이벤트는 수정할 수 없지만 삭제할 수 있어요.'));
    else managementBody.append(managementButton(card.kind === 'event' ? '이벤트 수정' : '수정하기', () => { closeManagement(); openComposer('edit', card); }));
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
      const img = node('img'); img.src = photoUrl(key); img.alt = ''; img.loading = 'lazy';
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
    pages.hidden = PHOTO_LAST - PHOTO_FIRST + 1 <= PHOTO_PAGE_SIZE;
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
    async () => { closeManagement(); await refreshCards(stack.length > 0); await loadWorldBalance(session?.user?.id); await notificationController?.refresh?.(); }
  ), true));
}
function confirmDelete(card) {
  showManagement(card.kind === 'event' ? '이벤트를 삭제할까요?' : '카드를 삭제할까요?');
  managementBody.append(node('p', 'management-help', card.kind === 'event'
    ? '이벤트가 즉시 내려갑니다. 이미 결제한 쭈는 돌려받지 않아요. 관리자는 삭제 내용을 1개월 동안 확인할 수 있어요.'
    : '공개 화면에서 내리고 이어진 답글도 함께 숨겨요. 관리자는 1개월 동안 복구할 수 있고, 이후 영구 삭제됩니다.'));
  cancelManagement();
  managementFooter.append(managementButton(card.kind === 'event' ? '이벤트 삭제' : '카드와 답글 삭제', () => managementAction(async () => {
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
  const events = event.target.closest('[data-show="events"]');
  if (events) { selectCollection('events'); return; }
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
window.addEventListener('resize', () => { if (!backdrop.hidden) updateComposer(); refreshExpandedBodies(); });
document.fonts?.addEventListener?.('loadingdone', () => { if (!backdrop.hidden) updateComposer(); refreshExpandedBodies(); });
submit.addEventListener('click', publishCard);
document.querySelectorAll('input[name="identity"]').forEach(input => input.addEventListener('change', () => { updateComposer(); recordDraft(); }));

function receiveAuth(current) {
  const changed = session?.user?.id !== current?.user?.id;
  session = current; authKnown = true;
  if (changed) {
    identityEpoch++;
    // Remove prior-account content immediately, before asynchronous requests finish.
    worldCoins = null; balanceRun++; moderator = false; moderatorRun++;
    nearbyPosition = null; writingPosition = null; eventPosition = null;
    noteState = null; noteStateRun++; reactionPending.clear(); message('');
    composerRun++; draftLoading = false; draftController?.setUser(current?.user?.id); setComposerInputs();
    notificationController?.close?.();
    feedRun++; detailRun++; cache.clear(); stack.length = 0;
    slot.replaceChildren(); replies.replaceChildren(); state(list, '카드를 불러오는 중이에요.');
    closeManagement(true); backdrop.hidden = true; clearEventPhoto(); lockPage(false);
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

installManagement(); installStyleChoices(); installFeatures(); installStageAuth(); installDrafts();
window.OjjudaNoteSupport?.install({ client, getUserId: () => session?.user?.id || null });
notificationController = window.OjjudaNoteNotifications?.install({
  client, getUserId: () => session?.user?.id || null,
  onOpenCard: id => openCard(id),
  onOpenInquiry: id => window.OjjudaNoteSupport?.open?.(id),
  onKeepCard: (id, cardKind) => confirmPermanent({ id, kind: cardKind })
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
    loadWorldBalance(session?.user?.id); loadNoteState(); notificationController?.refresh?.();
    if (backdrop.hidden && management.hidden) refreshCards(stack.length > 0);
  });
} else {
  authKnown = true; banner('노트 연결 설정을 확인해 주세요');
  state(list, '카드를 불러올 수 없어요.'); updateAuth();
}
