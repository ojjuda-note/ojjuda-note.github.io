// World and Note use the same origin, Supabase project, and default Auth storage.
const $ = selector => document.querySelector(selector);
// Match the server's character limit without counting a masked phrase four times.
const maskedTextLength = value => [...String(value ?? '').replaceAll('❤️❤️', '♥')].length;
const textInputMaxLength = (value, limit) => limit + String(value ?? '').length - maskedTextLength(value);
const config = window.OJJUDA_CONFIG;
const localStage = config?.localStage === true && ['localhost', '127.0.0.1'].includes(location.hostname)
  && config.supabaseUrl === 'https://jucuqqbynilwlhqxyzrd.supabase.co';
const client = window.OjjudaParkOpening?.client || (config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey) : null);
if (window.OjjudaParkOpening) window.OjjudaParkOpening.client = client;
const columns = 'id,kind,parent_id,body,display_name,tags,background_key,created_at,like_count,reply_count,is_mine,is_liked,is_bookmarked,identity_mode,style,photo_key,style_until,photo_until,archive_due_at,permanent';
const feed = $('#feed'), detail = $('#detail'), list = $('#feed-list');
const slot = $('#detail-card-slot'), replies = $('#reply-list');
const backdrop = $('#composer-backdrop'), text = $('#compose-text'), tags = $('#compose-tags');
const submit = $('#publish-card'), composeMessage = $('#compose-message');
const cache = new Map(), stack = [];
let feedReturnPoint = null;
let session = null, authKnown = false, ready = false, busy = false, authEventVersion = 0;
let focusBefore = null, kind = 'memo', parentId = null, backgroundKey = null;
let feedCursor = null, replyCursor = null, feedRun = 0, detailRun = 0;
let stageAuth = null;
let worldCoins = null, balanceRun = 0;
let accountNickname = null, accountProfileRun = 0;
let editingId = null, composerUserId = null, moderator = false, moderatorRun = 0;
let feedMode = 'all', feedSort = 'latest', feedTerm = '';
let nearbyPosition = null, nearbyOffset = 0, writingPosition = null, eventPosition = null;
let stopLocationPreference = () => {}, writingLocationController = null;
function parkJunior() {
  return session?.user?.app_metadata?.park_guardian_account === true || session?.user?.role === 'park_junior';
}
function locationIsEnabled() {
  return Boolean(authKnown && session?.user?.id && !session.user.is_anonymous
    && window.OjjudaLocation?.current(session.user.id)?.enabled !== false);
}
function watchLocationPreference(userId) {
  stopLocationPreference(); stopLocationPreference = () => {};
  if (!userId || !window.OjjudaLocation) return;
  const epoch = identityEpoch;
  let previous;
  const apply = choice => {
    if (epoch !== identityEpoch || session?.user?.id !== userId) return;
    const wasEnabled = previous; previous = choice.enabled;
    if (!choice.enabled) {
      locationRun++; writingLocationController?.abort();
      nearbyPosition = null; writingPosition = null;
      setCardLocationSwitch(false, '공원과 파장의 위치를 껐어요.');
      updateComposer();
      if (ready) { if(!detail.hidden)void renderDetail();else void loadFeed(false,true); }
    } else if (wasEnabled === false) {
      if (!backdrop.hidden && !editingId && kind !== 'event') { if(!writingLocationController)void autoWritingLocation(composerRun); }
      else void positionIfAlreadyGranted().then(position => {
        if (position && epoch === identityEpoch && locationIsEnabled()) { nearbyPosition = position; quietLocatedReload(); }
      });
    }
  };
  stopLocationPreference = window.OjjudaLocation.observe(client, userId, apply);
  void window.OjjudaLocation.preference(client, userId, {
    refresh: true, legacyDisabled: readComposerSettings(userId).locationEnabled === false
  }).catch(() => {});
}
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
let feedPages = 0, backgroundLocating = false, feedDeferred = false;
function quietLocatedReload(tries = 0) {   // 허용된 위치가 늦게 도착해도 현재 첫 페이지를 갱신해요(근처 포함)
  if (!nearbyPosition || feedMode !== 'all' || feedTerm || feedPages > 1 || !detail.hidden) return;
  if (feedLoading) { if (tries < 20) setTimeout(() => quietLocatedReload(tries + 1), 300); return; }
  loadFeed(false, true);
}
let feedSnapshot = null, feedLoading = false, replyLoading = false;
let feedRecoveryTimer = null;
let noteState = null, noteStateRun = 0, noticeElement = null, featureMessage = null;
const parkEmbedded = window.parent !== window && location.pathname.startsWith('/park/');
const guestReturnKey = 'ojjuda.park.compose-login.v1';
let guestReturn = null;
try {
  const stored = JSON.parse(sessionStorage.getItem(guestReturnKey));
  sessionStorage.removeItem(guestReturnKey);
  if (stored && stored.until > Date.now() && typeof stored.body === 'string' && maskedTextLength(stored.body) <= 200
      && (stored.parent === null || stored.parent === new URL(location.href).searchParams.get('card'))) guestReturn = stored;
} catch {}
let initialParkCompose = parkEmbedded && new URL(location.href).searchParams.get('compose') === 'memo';
window.canCloseParkNote = () => {
  if (busy) { message('저장이 끝날 때까지 기다려 주세요.'); return false; }
  return backdrop.hidden || (!text.value.trim() && !cardPhotoBlob && !eventPhotoBlob) || confirm('작성 중인 카드를 닫고 이동할까요?');
};
let initialCardId = new URL(location.href).searchParams.get('card');
let initialKeepId = ['memo','comment'].includes(new URL(location.href).searchParams.get('keep')) ? initialCardId : null;
const reactionPending = new Set();
let draftController = null, draftStatus = null, draftLoading = false, composerTools = null;
let requestedDraftContent = null, composerRun = 0, identityEpoch = 0;
let localComposerBaseline = null, localComposerDirty = false, localComposerStored = false;
let notificationController = null;
const validCardId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
function noteLoginHref(cardId = parentId || (!detail.hidden ? stack.at(-1) : null)) {
  return '/?auth=login&next=note' + (validCardId(cardId) ? `&card=${encodeURIComponent(cardId)}` : '');
}
const PHOTO_PAGE_SIZE = 12;
const PHOTO_GROUPS = [
  { label: '사진', first: 10, last: 189 },
  { label: '한 색 수묵', first: 190, last: 225 },
  { label: '두 색 수묵', first: 226, last: 261 },
  { label: '여러 색 수묵', first: 262, last: 297 }
];
const PHOTO_FIRST = PHOTO_GROUPS[0].first, PHOTO_LAST = PHOTO_GROUPS.at(-1).last;
const FONT_CODES = ['default', 'round', 'serif', 'nanum-myeongjo', 'handwriting', 'heart', 'calligraphy', 'mono'];
const FREE_FONT_CODES = ['default', 'round', 'serif'];
const fontPurchaseRequests = new Map();
async function ensureComposeFont(userId, epoch, run) {
  const font = $('#compose-font').value;
  if (FREE_FONT_CODES.includes(font)) return true;
  const unchangedCard = editingId && cache.get(editingId);
  if (unchangedCard?.style?.font === font && Date.parse(unchangedCard.style_until) > Date.now()) return true;
  const current = () => session?.user?.id === userId && identityEpoch === epoch
    && composerRun === run && !backdrop.hidden && $('#compose-font').value === font;
  let failureMessage = '';
  busy = true; setComposerInputs(); updateComposer();
  try {
    const licenses = await noteRpc('list_my_card_font_entitlements');
    if (!current()) return false;
    if (licenses.some(item => item.font === font && Date.parse(item.expires_at) > Date.now())) return true;
    const label = $('#compose-font').selectedOptions[0].textContent.split(' · 10')[0];
    if (!window.confirm(`${label} 글꼴을 10쭈로 구매할까요? 구매한 시각부터 1개월 동안 여러 카드에 사용할 수 있어요. 기간이 끝나면 카드 글꼴도 기본으로 돌아가며, 자동 갱신은 없어요.`)) return false;
    const key = `${userId}:${font}`;
    if (!fontPurchaseRequests.has(key)) fontPurchaseRequests.set(key, crypto.randomUUID());
    const result = await noteRpc('purchase_card_font', { p_font: font, p_request_id: fontPurchaseRequests.get(key) });
    if (!current()) return false;
    fontPurchaseRequests.delete(key);
    if (!result?.expires_at || Date.parse(result.expires_at) <= Date.now()) throw Error('Font entitlement expired');
    void loadWorldBalance(userId);
    return true;
  } catch (error) {
    if (current()) failureMessage = /Insufficient coins/i.test(error.message || '')
      ? '쭈가 부족해요. 쭈를 충전하거나 기본 무료 글꼴을 골라 주세요.'
      : '글꼴 이용권을 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
    return false;
  } finally {
    if (session?.user?.id === userId && identityEpoch === epoch && composerRun === run) {
      busy = false; setComposerInputs(); updateComposer();
      if (failureMessage) composeMessage.textContent = failureMessage;
    }
  }
}
const SELF_HOSTED_FONTS = ['heart', 'nanum-myeongjo'];
const EFFECT_CODES = ['none', 'sparkle', 'frame', 'rain', 'shimmer', 'rainbow', 'snow',
  'starlight', 'fireflies', 'petals', 'bubbles', 'aurora', 'confetti', 'sunbeams',
  'mist', 'ocean', 'heartbeat', 'orbit', 'glitter', 'meteor', 'leaves', 'neon', 'dawn'];
// 사진 위에서 자연스럽게: 글씨는 부드러운 색, 글상자는 같은 계열의 깊은 색을 반투명 유리처럼 깔아요.
// 안쪽 이름(red, yellow …)은 예전 그대로라, 이미 올린 카드도 새 색으로 보여요. deep은 색 고르기 단추에 보이는 글상자 색이에요.
const COLOR_PALETTE = {
  white: { label: '흰색', solid: '#FFFDF7', box: '#FFFDF7A8', deep: '#EFE9DF' },
  black: { label: '먹색', solid: '#2E2B36', box: '#1C1A2466', deep: '#3A3644' },
  red: { label: '장미', solid: '#FFBFCF', box: '#7A2E4466', deep: '#B85C74' },
  yellow: { label: '레몬', solid: '#FFDF7E', box: '#6B531566', deep: '#C9A43E' },
  green: { label: '민트', solid: '#AEEACF', box: '#1F5C4866', deep: '#4E9C80' },
  blue: { label: '하늘', solid: '#BCD6FF', box: '#26457566', deep: '#5B84C4' },
  purple: { label: '라벤더', solid: '#D6C4FF', box: '#47327466', deep: '#8A72C4' }
};
let photoPage = 0;
let selectedPhotoKey = null;
let photoEntitlements = new Map(), photoEntitlementRun = 0;
function photoAssetKey(value) {
  const key = String(value ?? '');
  return /^\d{2,3}$/.test(key) && Number(key) >= PHOTO_FIRST && Number(key) <= PHOTO_LAST ? key : null;
}
function photoGroupFor(key) {
  return PHOTO_GROUPS.find(group => Number(key) >= group.first && Number(key) <= group.last) || PHOTO_GROUPS[0];
}
function photoName(key, prefix = '사진') {
  const group = photoGroupFor(key);
  const index = Number(key) - group.first + 1;
  return group === PHOTO_GROUPS[0] ? `${prefix} ${String(index).padStart(3, '0')}` : `${group.label} ${String(index).padStart(2, '0')}`;
}
const photoPageFor = key => Math.floor((Number(key) - PHOTO_FIRST) / PHOTO_PAGE_SIZE);
function installPhotoGroups(element, selectGroup) {
  for (const group of PHOTO_GROUPS) {
    const button = node('button', 'button', group.label);
    button.type = 'button'; button.value = String(group.first);
    button.addEventListener('click', () => selectGroup(group));
    element.append(button);
  }
}
function markPhotoGroup(element, group) {
  for (const button of element.children) button.setAttribute('aria-pressed', String(Number(button.value) === group.first));
}
function photoThumbnail(key) {
  const img = node('img');
  img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
  const original = `/note/assets/${key}.jpg`;
  if (Number(key) > PHOTO_GROUPS[0].last) {
    img.addEventListener('error', () => { img.src = original; }, { once: true });
    img.src = `/note/assets/cards/480/${key}.webp`;
  } else img.src = original;
  return img;
}
function activePhotoEntitlement(key, entitlements = photoEntitlements) {
  const expiry = entitlements.get(key);
  return expiry && Date.parse(expiry) > Date.now() ? expiry : null;
}
async function loadPhotoEntitlements(userId) {
  if (!userId || session?.user?.id !== userId) throw new Error('계정이 변경됐어요.');
  const run = ++photoEntitlementRun;
  const rows = await noteRpc('list_my_card_photo_entitlements');
  if (session?.user?.id !== userId) throw new Error('계정이 변경됐어요.');
  if (!Array.isArray(rows)) throw new Error('구매 내역을 확인할 수 없어요.');
  const entitlements = new Map();
  for (const row of rows) {
    const key = photoAssetKey(row?.photo_key);
    if (key && Date.parse(row?.expires_at) > Date.now()) entitlements.set(key, row.expires_at);
  }
  if (run === photoEntitlementRun) {
    photoEntitlements = entitlements;
    if (!backdrop.hidden) updateFeaturedPhoto();
    if (!$('#photo-gallery').hidden) renderPhotoPage();
  }
  return entitlements;
}
async function photoActionFor(key, userId) {
  const entitlements = await loadPhotoEntitlements(userId);
  if (activePhotoEntitlement(key, entitlements)) return 'apply_owned_card_photo';
  const title = photoName(key);
  return window.confirm(`${title}을 10 ZU에 1개월 동안 사용할까요? 구매 기간에는 다른 카드에도 적용할 수 있어요.`)
    ? 'purchase_card_photo' : null;
}
function observeBackgrounds(options) {
  return typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) revealFeedBackground(entry.target);
    }, options) : null;
}
const feedBackgroundObserver = observeBackgrounds({ rootMargin: '600px 0px' });
const replyBackgroundObserver = observeBackgrounds({ root: replies, rootMargin: '0px 200px' });
function backgroundObserver(photo) {
  return photo.closest('.reply-card') ? replyBackgroundObserver : feedBackgroundObserver;
}
function revealFeedBackground(photo) {
  const key = photo.dataset.pendingBackground;
  const ink = inkCards.has(photo);
  if (!key && !ink) return;
  backgroundObserver(photo)?.unobserve(photo);
  if (key) {
    delete photo.dataset.pendingBackground;
    setPhotoBackground(photo, key);
  }
  if (ink) drawInkCard(photo);
}
function setPhotoBackground(element, value) {
  const key = photoAssetKey(value);
  element.classList.toggle('note-plain', !key);
  element.classList.remove('image-forest', 'image-lake');
  if (key && element.dataset.imageSizes) {
    const img = node('img', 'park-card-background');
    img.alt = ''; img.draggable = false; img.decoding = 'async';
    img.sizes = element.dataset.imageSizes;
    img.addEventListener('error', () => img.removeAttribute('srcset'), { once: true });
    img.srcset = [480, 800, 1200].map(width => `/note/assets/cards/${width}/${key}.webp ${width}w`).join(', ');
    img.src = `/note/assets/${key}.jpg`;
    element.prepend(img);
  } else {
    element.style.backgroundImage = key ? `url("/note/assets/${key}.jpg")` : '';
  }
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
function boxTransparencyColor(hex, value = 80) {
  const raw = Number(value), level = Number.isInteger(raw) && raw >= 0 && raw <= 100 ? raw : 80;
  const base = parseInt(hex.slice(7, 9), 16) / 255;
  const opacity = level <= 80 ? base * level / 80 : base + (1 - base) * (level - 80) / 20;
  return `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${opacity.toFixed(3)})`;
}
function setBoxTransparency(value) {
  const level = Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100 ? Number(value) : 25;
  const slider = $('#compose-box-transparency'), number = $('#compose-box-transparency-value');
  if (slider) slider.value = String(level);
  if (number) number.value = String(level);
}
function applyVisualStyle(element, style = {}) {
  window.OjjudaDecorations?.decorateCard(element,style);
  for (const cls of [...element.classList]) {
    if (/^note-(?:theme|font|size|effect)-/.test(cls)) element.classList.remove(cls);
  }
  if (['rose', 'night'].includes(style.theme)) element.classList.add(`note-theme-${style.theme}`);
  if (FONT_CODES.includes(style.font) && style.font !== 'default') element.classList.add(`note-font-${style.font}`);
  if (['large', 'small'].includes(style.size)) element.classList.add(`note-size-${style.size}`);
  if (EFFECT_CODES.includes(style.effect) && style.effect !== 'none') element.classList.add(`note-effect-${style.effect}`);
  const textColor = COLOR_PALETTE[style.textColor];
  const boxColor = COLOR_PALETTE[style.boxColor];
  const textHex = textColor?.solid || (style.font === 'calligraphy' ? '#191A17' : '#FFFDF7');
  const darkText = colorLuminance(textHex) < .3;   // 어두운 글씨면 기본 글상자를 밝은 유리로
  const boxHex = boxColor?.box || (darkText ? '#FFFDF7A8' : '#1C1A2447');
  element.style.setProperty('--note-text-color', textHex);
  element.style.setProperty('--note-box-color', boxTransparencyColor(boxHex, style.boxTransparency));
  const boxLevel = Number(style.boxTransparency);
  element.style.setProperty('--note-box-blur', `${(6 * (Number.isFinite(boxLevel) ? Math.max(0, Math.min(100, boxLevel)) : 80) / 100).toFixed(2)}px`);
  element.classList.toggle('note-box-transparent', Number(style.boxTransparency) === 0);
  element.style.setProperty('--note-shadow', darkText ? 'rgba(255,253,247,.55)' : 'rgba(12,12,24,.42)');
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
function showFeedLoading() {
  if (!parkEmbedded) { state(list, '카드를 불러오는 중이에요.'); return; }
  const status = node('p', 'park-feed-loading-status', '🌷 쭈가 오늘의 카드를 모으는 중…');
  status.setAttribute('role', 'status');
  const cards = Array.from({ length: 3 }, () => {
    const card = node('div', 'park-skeleton-card'); card.setAttribute('aria-hidden', 'true');
    const photo = node('div', 'park-skeleton-photo');
    photo.append(node('span', 'park-skeleton-quote'), node('span', 'park-skeleton-quote short'));
    const meta = node('div', 'park-skeleton-meta'); meta.append(node('span'), node('span'));
    card.append(photo, meta); return card;
  });
  list.replaceChildren(status, ...cards);
}
function banner(value) {
  $('#connection-message').textContent = value;
  $('#connection-status').hidden = !value;
}
function query() { return client.schema('ojjuda_note'); }
// 대화 이름을 제공하지 않는 예전 응답과 이벤트 카드는 기존 자동 이름을 사용해요.
// 기존 카드는 32×32 조합을 유지해 이미 보이던 이름이 바뀌지 않게 해요.
const ANON_ALIAS_EXPANDED_AT = Date.parse('2026-09-28T03:00:00+09:00');
const ANON_LEGACY_COUNT = 32;
const ANON_ADJ = ['수줍은', '졸린', '반짝이는', '포근한', '용감한', '느긋한', '상냥한', '씩씩한', '말랑한', '조용한', '설레는', '엉뚱한',
  '다정한', '새침한', '동글동글한', '꿈꾸는', '산책하는', '노래하는', '배고픈', '웃는', '수다쟁이', '따뜻한', '시원한', '보송보송한',
  '몽글몽글한', '반가운', '차분한', '궁금한', '행복한', '장난꾸러기', '달콤한', '느릿한',
  '맑은', '해맑은', '산뜻한', '싱그러운', '향기로운', '평온한', '즐거운', '명랑한', '활기찬', '신나는', '친절한', '재치 넘치는',
  '똑똑한', '당당한', '부지런한', '꼼꼼한', '멋진', '귀여운', '깜찍한', '사랑스러운', '빛나는', '소중한', '화사한', '정겨운',
  '순한', '알록달록한', '폭신한', '푸근한', '사뿐한', '살금살금 걷는', '두근거리는', '한가로운'];
const ANON_NOUN = ['고래', '고양이', '강아지', '토끼', '수달', '펭귄', '다람쥐', '여우', '판다', '햄스터', '부엉이', '거북이', '오리', '코알라', '고슴도치', '너구리',
  '사슴', '해파리', '돌고래', '참새', '나비', '무지개', '구름', '별', '달', '새싹', '도토리', '솜사탕', '우산', '연필', '해바라기', '눈사람',
  '기린', '얼룩말', '코끼리', '하마', '사자', '호랑이', '표범', '치타', '알파카', '양', '염소', '병아리', '앵무새', '까치', '비둘기', '개구리',
  '달팽이', '반딧불이', '잠자리', '매미', '꿀벌', '무당벌레', '문어', '복어', '해마', '불가사리', '조개', '산호', '솔방울', '나뭇잎', '민들레', '별똥별'];
function anonAlias(id, createdAt) {
  let h = 2166136261; for (const ch of String(id || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } h >>>= 0;
  const expanded = Number.isFinite(Date.parse(createdAt)) && Date.parse(createdAt) >= ANON_ALIAS_EXPANDED_AT;
  const adjCount = expanded ? ANON_ADJ.length : ANON_LEGACY_COUNT;
  const nounCount = expanded ? ANON_NOUN.length : ANON_LEGACY_COUNT;
  const noun = ANON_NOUN[Math.floor(h / adjCount) % nounCount];
  return { name: `${ANON_ADJ[h % adjCount]} ${noun}`, icon: noun[0] };   // 동그라미엔 한글 한 글자 (고양이 → 고)
}
// 이름 앞 동그라미: 카드를 올릴 때 글쓴이가 고른 성별 (남 파랑 · 여 빨강 · 비공개 회색). 카드마다 고정돼요. 서버는 성별만 알려 주고 누가 썼는지는 알려 주지 않아요
const GENDER_LOOK = { male: ['남', '#4A7BE0'], female: ['여', '#E2525C'], private: ['비', '#A7ABB8'] };
const genderCache = new Map(), genderWanted = new Set(); let genderTimer = null, myGender = 'private';
let myIdentity = null, myIdentityReady = false, myIdentityPromise = null;
// 새 카드의 표시 선택만 계정별로 기억해요. 위치 좌표나 임시 글은 저장하지 않아요.
const composerSettingsFallback = new Map();
function readComposerSettings(userId = session?.user?.id) {
  let saved = userId ? composerSettingsFallback.get(userId) : null;
  if (userId && !saved) {
    try { saved = JSON.parse(localStorage.getItem(`ojjuda-note-composer-settings-v1:${userId}`) || 'null'); }
    catch { /* Storage may be blocked or contain an older, invalid value. */ }
  }
  return {
    identity: saved?.identity === 'nickname' ? 'nickname' : 'anonymous',
    gender: saved?.gender === 'private' ? 'private' : 'profile',
    locationEnabled: typeof saved?.locationEnabled === 'boolean' ? saved.locationEnabled : true,
    font: FONT_CODES.includes(saved?.font) ? saved.font : 'default',
    size: ['normal', 'large', 'small'].includes(saved?.size) ? saved.size : 'normal',
    boxTransparency: Number.isInteger(saved?.boxTransparency) && saved.boxTransparency >= 0 && saved.boxTransparency <= 100
      ? saved.boxTransparency : 25
  };
}
function rememberComposerSetting(name, value) {
  const userId = session?.user?.id;
  if (!userId || composerUserId !== userId || backdrop.hidden || editingId || busy || draftLoading) return;
  if (!(name === 'identity' && ['anonymous', 'nickname'].includes(value))
    && !(name === 'gender' && ['private', 'profile'].includes(value))
    && !(name === 'locationEnabled' && typeof value === 'boolean')
    && !(name === 'font' && FONT_CODES.includes(value))
    && !(name === 'size' && ['normal', 'large', 'small'].includes(value))
    && !(name === 'boxTransparency' && Number.isInteger(value) && value >= 0 && value <= 100)) return;
  const settings = { ...readComposerSettings(userId), [name]: value };
  try {
    localStorage.setItem(`ojjuda-note-composer-settings-v1:${userId}`, JSON.stringify(settings));
    composerSettingsFallback.delete(userId);
  } catch { composerSettingsFallback.set(userId, settings); }
}
function paintGender(avatar, gender) {
  const [label, color] = GENDER_LOOK[gender] || GENDER_LOOK.private;
  avatar.textContent = label; avatar.style.background = color; avatar.style.color = '#fff';
  avatar.setAttribute('aria-label', gender === 'male' ? '남성' : gender === 'female' ? '여성' : '성별 비공개'); avatar.title = avatar.getAttribute('aria-label');
}
function paintGenderFor(id) { document.querySelectorAll(`[data-gender-card="${id}"]`).forEach(a => paintGender(a, genderCache.get(id) || 'private')); }
function wantGender(id) {
  if (!id || genderCache.has(id) || !client) return;
  genderWanted.add(id); clearTimeout(genderTimer); genderTimer = setTimeout(fetchGenders, 60);
}
async function fetchGenders() {
  const ids = [...genderWanted].slice(0, 100); genderWanted.clear(); if (!ids.length) return;
  try {
    const rows = await noteRpc('card_genders', { p_ids: ids });
    for (const id of ids) genderCache.set(id, 'private');
    for (const r of rows || []) if (r?.card_id) genderCache.set(r.card_id, r.gender);
    ids.forEach(paintGenderFor);
  } catch (error) { console.warn('Note gender:', error); }   // 아직 SQL을 안 돌렸으면 회색(비)으로 둬요
  if (genderWanted.size) genderTimer = setTimeout(fetchGenders, 60);
}
async function loadMyGender(userId) {
  if (!client || !userId) return null;
  if (myIdentityPromise) return myIdentityPromise;
  const pending = (async () => {
    const { data, error } = await client.rpc('get_my_member_identity');
    if (session?.user?.id !== userId) return null;
    if (error) throw error;
    myIdentity = data || null; myIdentityReady = true;
    myGender = ['male', 'female'].includes(data?.gender) ? data.gender : 'private';
    setGenderInputs();
    return myIdentity;
  })();
  myIdentityPromise = pending;
  try { return await pending; }
  finally { if (myIdentityPromise === pending) myIdentityPromise = null; }
}
function setGenderInputs(reset = false) {
  const chosen = $('input[name="gender"]:checked')?.value;
  const preferred = readComposerSettings().gender === 'private' ? 'private' : myGender;
  const value = !reset && !backdrop.hidden && (chosen === myGender || chosen === 'private') ? chosen : preferred;
  document.querySelectorAll('input[name="gender"]').forEach(input => {
    const allowed = input.value === 'private' || input.value === myGender;
    input.closest('label').hidden = !allowed;
    input.disabled = !allowed || !session?.user || busy || draftLoading;
    input.checked = input.value === value;
  });
  syncQuickChoices();
}
async function showMemberInfo(afterSave = null) {
  const userId = session?.user?.id;
  if (!userId) return;
  const run = showManagement('내 회원정보');
  state(managementBody, '회원정보를 확인하고 있어요.');
  try {
    await loadMyGender(userId);
    if (run !== managementRun || session?.user?.id !== userId) return;
    managementBody.replaceChildren();
    if (myIdentity) {
      const info = node('dl', 'member-identity-summary');
      for (const [label, value] of [['생년월일', myIdentity.birth_date], ['현재 나이', `만 ${myIdentity.age}세`], ['가입 당시 나이', `만 ${myIdentity.age_at_signup}세`], ['성별', myIdentity.gender === 'male' ? '남성' : '여성']]) info.append(node('dt', '', label), node('dd', '', value));
      managementBody.append(info, node('p', 'management-help', '생년월일·나이·전화번호는 다른 회원에게 공개되지 않아요. 생년월일·성별은 직접 수정할 수 없으며, 잘못 입력한 정보는 고객지원으로 정정을 요청해 주세요.'));
      const form = node('form', 'member-identity-fields');
      const label = node('label', '', '전화번호'); label.htmlFor = 'member-phone-edit';
      const phone = node('input'); phone.id = 'member-phone-edit'; phone.type = 'tel'; phone.inputMode = 'tel';
      phone.autocomplete = 'tel'; phone.maxLength = 20; phone.required = true;
      phone.placeholder = '010-0000-0000'; phone.value = myIdentity.phone_number;
      form.append(label, phone, node('p', 'identity-hint', '전화번호는 수정할 수 있어요.'));
      managementBody.append(form);
      const save = managementButton('전화번호 저장', () => form.requestSubmit(), true);
      managementFooter.append(save);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (managementBusy || run !== managementRun || session?.user?.id !== userId) return;
        let nextPhone;
        try { nextPhone = window.OjjudaIdentity.normalizePhone(phone.value); }
        catch (error) { managementMessage.textContent = error.message; return; }
        managementMessage.textContent = '';
        managementBusy = true; save.disabled = true; phone.disabled = true; managementClose.disabled = true;
        try {
          const { data, error } = await client.rpc('update_my_phone_number', { p_phone: nextPhone });
          if (error) throw error;
          if (run !== managementRun || session?.user?.id !== userId) return;
          myIdentity = data; phone.value = data.phone_number;
          managementMessage.textContent = '전화번호를 저장했어요.';
        } catch (error) {
          if (run === managementRun && session?.user?.id === userId) managementMessage.textContent = /phone_already_registered|member_identity_phone_number_key/.test(error.message || '') ? '이미 가입된 전화번호예요. 다른 번호를 입력해 주세요.' : /invalid_phone_number/.test(error.message || '') ? '전화번호를 확인해 주세요.' : '전화번호를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.';
        } finally {
          if (run === managementRun) { managementBusy = false; save.disabled = false; phone.disabled = false; managementClose.disabled = false; }
        }
      });
      return;
    }
    managementBody.append(node('p', 'management-help', '카드에 표시할 성별을 위해 기존 회원은 생년월일·성별·전화번호를 한 번 등록해 주세요. 저장 후 생년월일과 성별은 직접 바꿀 수 없어요.'));
    const form = node('form');
    form.innerHTML = window.OjjudaIdentity.fields('member');
    form.querySelector('[data-identity-prefix]').dataset.existingMember = 'true';
    const consentLabel = node('label', 'identity-consent');
    const consent = node('input'); consent.type = 'checkbox'; consent.required = true;
    consentLabel.append(consent, node('span', '', '입력한 정보가 정확하며 생년월일·성별·전화번호의 비공개 저장과 회원정보 관리 목적의 이용에 동의해요.'));
    const policy = node('a', '', '개인정보처리방침 보기'); policy.href = '/privacy.html'; policy.target = '_blank'; policy.rel = 'noopener';
    form.append(consentLabel, policy); managementBody.append(form);
    const save = managementButton('회원정보 저장', () => form.requestSubmit(), true);
    managementFooter.append(save);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (managementBusy || !consent.checked) return;
      let identity;
      try { identity = window.OjjudaIdentity.read(form, 'member', false); }
      catch (error) { managementMessage.textContent = error.message; return; }
      managementBusy = true; save.disabled = true; managementClose.disabled = true;
      try {
        const { error } = await client.rpc('complete_my_member_identity', { p_birth_six: identity.birthSix, p_gender_code: identity.genderCode, p_phone: identity.phone, p_consent: true });
        if (error) throw error;
        if (run !== managementRun || session?.user?.id !== userId) return;
        myIdentityReady = false; await loadMyGender(userId);
        if (run !== managementRun || session?.user?.id !== userId) return;
        closeManagement(true);
        if (afterSave) afterSave(); else showMemberInfo();
      } catch (error) {
        if (run === managementRun) managementMessage.textContent = /phone_already_registered|member_identity_phone_number_key/.test(error.message || '') ? '이미 가입된 전화번호예요. 다른 번호를 입력해 주세요.' : /identity_locked/.test(error.message || '') ? '이미 등록한 회원정보는 직접 수정할 수 없어요.' : '회원정보를 저장하지 못했어요. 입력 정보를 확인하고 다시 시도해 주세요.';
      } finally { if (run === managementRun) { managementBusy = false; save.disabled = false; managementClose.disabled = false; } }
    });
  } catch (error) {
    if (run === managementRun) state(managementBody, '회원정보를 불러오지 못했어요. 잠시 후 다시 열어 주세요.');
  }
}
// 자동 태그: 본문에 나온 낱말만 고르고, 직접 쓴 태그와 지운 태그를 우선한다.
// The scheduled publisher uses the same tiers and Korean word boundaries (see the regression test).
const TAG_WORDS = [
  `누리호 면접 지각 NASA 게임대상 만두 붉은사막 스쿼시 안세영 이력서 출근 퇴근 단감 레이더 로봇 반도체 보드게임 붕어빵 빨래 새잎 설거지 슬리퍼 올빼미
우산 운동화 이불 이어폰 청소 친구 카드값 하늘다람쥐 향수 강아지 고양이 그림 기타 꽃 노을 답장 독감 동료 둥지 등산 메일 발표 부모님 비밀번호 사직서
사진 샤워 아이스크림 알람 양말 월급 월세 이직 책 커피 통장 퍼즐 합격 해킹 화분 회의 가계부 가족 과자 국물 국수 귤 김치 냉장고 노래 늦잠 단풍 달걀
도시락 떡볶이 라면 로켓 목성 문단속 미술관 박물관 빵집 산불 산책길 상사 세탁기 쓰레기 안경 야식 열쇠 위성 초콜릿 카레 허리 화성 간식 고분 과일 구름
드라마 메시지 바람 서점 유물 주식 축제 택배 햇빛 햇살 계단 농담 무역 베개 병원 빵 사진첩 시험 영화 자료 전시 전화 정류장 출근길 충전기 퇴근길 휴가
휴대폰 디저트 레시피 배드민턴 버스 서류 소파 숙제 신발 야구 여행 지하철 책상 편의점 AI 공연 마트 말투 반찬 비 알림 엘리베이터 장바구니 카페 골목
동네 문자 보안 수출 아빠 엄마 영상 침대 파일 한글 할인 고백 금요일 메모 소금 아버지 안부 운동 월요일 눈물 라디오 배달 연애 짝사랑 맛집 약 연락
우승 거절 게임 공부 사랑 장보기 후회 반려동물 설렘 시장 통화 가을 겨울 봄 여름 요리 우주 음료 음악 지도 취업 감사 걱정 마우스 산책 서운함 우편물
주말 하늘 고민 기후 다툼 사과 식당 약속 공원 모기 새벽 업무 오해 지출 만남 저녁밥 취미 부탁 쇼핑 절약 회사 휴식 건강 대전 부산 서울 스마트폰 제주
청주 10대 20대 30대 40대 50대 60대 과학 첫인사 행사 모임 상담 집안일 퇴직 실수 응원 취향 식비 잔고 월급날 김치찌개 완벽 점심시간 점심때
요청 수정 시계 메신저 수다 배달비 이체일 입꼬리 가격표 계산기 창가 창밖 옆자리 단톡방 밥상 그릇 문장 토요일 일요일 맞은편 TV 싱크대 숟가락
전자레인지 곰탕 햇볕 셀카 주머니 장갑 조명 오타 단어 메뉴 습관 재료 포장 볶음밥 양배추 커버 스트레스 코드 챕터 우유 세제 옷걸이 첫눈 잔소리 입맛
소식 양보 축하 생일 옷차림 냄새 주황빛 냉면 국 고장 결제 음악회 통장잔고 영어 국어 벚꽃 강아지풀 병아리 종이 딸기 책방 도서관 산더미 서른 음식 문제 창문 가게 공기
위로 칭찬 혼잣말 앞날 질문 버튼 순간 말동무 손잡이 성격 용기 재생 어린이집 유치원 학교 학원 운동회 소풍 나들이 우체국 우체통 우표 엽서 서류봉투 손글씨 문방구 문구점 연필 공책 독서록 메모장 책갈피 서재 소설 에세이 시집 작가 동화책 만화책 동네친구 동창 조카 손주 할머니 할아버지 언니 동생 형제 자매 사촌 생일선물 기념일 집들이 자취방 자취 이사 보증금 식재료 순두부 두부 김치볶음밥 만둣국 비빔밥 떡국 된장찌개 감자 오이 토마토 바나나 자몽 사과주스 딸기우유 식빵 소금빵 토스트 베이글 샐러드 캠핑 피크닉 물병 돗자리 배낭 강변 바닷가 해변 파도 숲길 산길 정원 장미 민들레 정원수 미용실 이발 머리카락 염색 일기 스티커 산책로 헬스장 사물함 경조사 안부인사 야근 회식 휴게실 인수인계 출근버스 정기권 환승 막내 수험생 시험지 면접관 생일케이크 우연 여전히 천천히 그날 초조 서론 설명 해명 집안 다행 보람 아쉬움 결정권 문고리 잠금 막차 마감 기한 빨랫감 연습 일정표 미안 고마움 답답 뿌듯 불안 서운 감정 잠버릇 어릴적 웃음 표정 음정 안도 안정 심정 고마워 꿈 선택지 기쁨 어색 하루치 보답 안타까움 손질 필름 필름카메라 만년필 목도리 손뜨개 뜨개질 독서 독서모임 독립서점 동네책방 뜨개실 코바늘 북클럽 수업 도예 머그잔 텃밭 모종 상추 바질 씨앗 화분받침 구독 해지 이체 저축 공과금 전기요금 관리비 배터리 고사리 버섯 김밥 재즈 카메라 양말짝 손편지 한강 수영 기타줄 새우 배달앱 조깅 러닝 마라톤 완주 스케치 수채화 노을빛 보조배터리 옥상 물감 자전거 텀블러 장마철 친절 준비 기억 시작 출발 결정 피곤 선택 안심 기대 긴장 인정 검색 대답 대화 인사 지원 실감`,
  `혼자 성공 소리 옷 눈치 분위기 기회 간격 여유 계산 속도 결심 자존감 집중 장소 날짜 자리 바퀴 장면 타이밍 절반 결과 편지 모레 아침 점심 저녁 오후
기분 가격 계획 밥 의자 손끝 조각 재촉 그리움 외로움 머리 밑단 접시 시간표 시각 단계 갈등 계절 페이지 일정 색 행복 토닥토닥 잠 부담 기운 어린이
일상 옆구리 오랜만 자유 관심 깜빡 안전 고생 운동장 고구마 요가 장난감 동물원 어깨 목 마음 정신 짐 돈 느리게 자기비판 조급함 눈길 작년 올해`,
  `하루 오늘 내일 어제 생각 시간 사람 일 말 몸 밤 낮 집 손 눈 문 길 물 차 끝 답 얘기 이야기 별일 매일 언젠가`
];
const TAG_ACTIONS = new Set(`완벽 고백 걱정 고민 지각 면접 출근 퇴근 연락 운동 친절 감사 준비 공부 후회 기억 생각 시작 출발 축하 양보 결정 거절 사랑 피곤 실수 수다 통화 요리
선택 청소 빨래 설거지 쇼핑 약속 안심 합격 연애 기대 긴장 지출 인정 검색 사과 부탁 대답 대화 샤워 발표 산책 전화 인사 지원 칭찬 실감 결제 연습 이야기 얘기 말 초조 서운 어색 미안 답답 뿌듯 불안 설명 고생 위로 다정 손질 독서 구독 해지 이체 저축 조깅 완주 스케치`.split(/\s+/));
const TAG_PARTICLE = /^(?:(?:들)?(?:에게서|에게|한테서|한테|께서|께|에서|으로부터|으로서|으로써|으로|에까지|에라도|에|부터|까지|처럼|보다|밖에|만큼|마다|조차|대로|이랑|랑|하고|이라도|라도|이나|나|이든|든|과|와|은|는|을|를|이|가|로|의|도|만|엔|에선|서|인|이다|이다가|이라|라|이라서|라서|이고|이고도|인데|인데도|인지는|인지|일수록|이니까|니까|이었던|였던|이었다|였다)?(?:에는|에도|까지|부터|은|는|에|도|만|요|만이라도)?)$/u;
const TAG_PREDICATE = /^(?:하|한|할|함|해|했|합니|됩니|되|된|될|돼|됐)[가-힣]*$/u;
const tagRanks = new Map(TAG_WORDS.flatMap((words, rank) =>
  words.split(/\s+/).map(word => [word.toLowerCase(), rank])));

function standaloneTagName(token) {
  return /^[A-Za-z][A-Za-z0-9]{1,13}$/.test(token) ||
    (/^[가-힣]{2,10}$/u.test(token) && !/(?:다|요|어|아|했|네|지|까|고|게|서|는|은|면|든|만|야|죠|래|니|다가|려다가|지만|려고)$/u.test(token)
      && !/^(?:그냥|정말|진짜|너무|조금|계속|다시|아직|벌써|누구|어디|이거|그거|저거|아무|아무것|함께|가끔|항상)$/u.test(token));
}

const TAG_COMPOUND = /(?:카메라|목도리|자전거|배터리|이어폰|충전기|키보드|마우스|머그잔|텀블러|키링|가방|노트북|도서관|미술관|박물관|책방|서점|빵집|맛집|시장|극장|공방|수업|전시회|음악회|공연장|클럽|동호회|연습장|산책로|산책길|등산로|운동장|정류장|기차역|공원|놀이터|목걸이|팔찌|반지|케이스|향수|운동화|티셔츠|스니커즈|강아지|고양이|강아지풀|꽃다발|나무|라떼|커피|케이크|샌드위치|파스타|볶음밥|김밥|국밥|국수|도시락|찌개|주스|쿠키|독서회|콘서트|동아리|음악제|영화제|전시관|망원경|현미경|에이드|스무디|청바지|카디건|보온병|휴게소|박람회)$/u;
const TAG_UNKNOWN = /^([가-힣A-Za-z0-9]{2,18}?)(들)?(으로부터|에게서|한테서|에서는|에서도|에서|에게|한테|처럼|까지|부터|으로|이랑|에는|에선|엔|을|를|은|는|이|가|에|로|랑)(?:도|는|만)?$/u;
const TAG_GENERIC = /^(?:누군가|누군|누구|무언가|무엇|무슨|어디|여기|저기|거기|자기|어떻게|하나|하루|누가|서로|요즘|지금|이번|지난|그때|가끔|한참|갑자기|나머지|한가운데|가운데|하나쯤|부분|결국|자꾸|괜히|역시|그래도|그렇게|이렇게|저렇게|어쩐지|아무것|이것|저것|그것|이곳|저곳|그곳|남들|평소|정도|다음|처음|마지막|나중|사이|그동안|아무|바로|잠깐|조금|한번|진짜|정말|그냥|드디어|아직|벌써|계속|다시|너무|모두|전부|대부분|내일|오늘|어제|누군가랑|이유|예전|며칠|나랑|당장|분들|때문|덕분|주변|다음번|오전|사실|예상|것밖|뿐만|[0-9]+(?:시|분|년|월|일)?)$/u;
// Several verbal and adverbial endings look identical to noun particles.
const TAG_NON_NOUN = /(?:대로|없이|같이|듯이|(?:다|냐|라|자|이|드|추|루|내|려|보|되|하|가|오|르|리|지|있|없)는|(?:다|려다|하나|어|려)가(?:도|는|만)?|(?:같|않|싶|좋|많|있|없|작|적|젊|높|짧|얇|남|맞|받|입|찾|먹|읽|넓|낮|늦|찍|깊|찮)(?:은|을)|(?:하|되|오|가|있|없|같|않|보|르|리|나|지|받|찾|먹|잡|놓|듣|웃|우|주)는|(?:려|다)기에|(?:하|리|보|쉬|알)기(?:로|엔)|으려|면서|느라)$/u;
const TAG_BAD_STEM = /(?:려다|하다|되다|보다|하는|같은|이는|라는|려는|면서|느라|려다가|하다가|되다가|보다가|하기|리기|기기|말없|정신없|보기|잡기|전에|날에|때만큼|쪽으)$/u;
const TAG_DETAILS = new Set('돈 밑단 어깨 접시 외로움 그리움 자존감 취향 목도리 밥'.split(' '));

const TAG_TOPIC_CONTEXT = /(?:다|어요|아요|네요|더라|였어|했어|예요|이에요|을|를|에서|에게|한테)$/u;

function tagCandidate(token, soleToken, nextToken) {
  if (token.startsWith('#')) {
    const tag = token.slice(1);
    return tag.length <= 20 && /[가-힣A-Za-z]/u.test(tag) ? { tag, weight: 100, explicit: true } : null;
  }

  for (let end = Math.min(token.length, 20); end > 0; end--) {
    const tag = token.slice(0, end), key = tag.toLowerCase(), ending = token.slice(end);
    const tier = tagRanks.get(key);
    const compound = tier === undefined && end >= 3 && TAG_COMPOUND.test(tag);
    if (tier === undefined && !compound) continue;
    const derived = (key === '우연' && ending === '히') || (key === '안정' && ending.startsWith('적'));
    if (!TAG_PARTICLE.test(ending) && !derived && !(TAG_ACTIONS.has(key) && TAG_PREDICATE.test(ending))) continue;
    let weight = compound || tier === 0 ? 6 : TAG_DETAILS.has(key) ? 5 : tier === 1 ? 3 : 1;
    if ((compound || tier === 0) && tag.length >= 3) weight++;
    if (weight >= 5 && /^(?:을|를)$/u.test(ending)) weight++;
    if (weight >= 5 && /^(?:랑|이랑|와|과|하고)$/u.test(ending)) weight--;
    return { tag, weight };
  }

  if (/^[A-Z][A-Z0-9]{1,9}$/.test(token)) return { tag: token, weight: 6 };
  const duration = token.match(/^([1-9][0-9]?(?:분|시간|초|시|주|개월|년|살))(?:에|이|가|은|는|을|를|만|쯤|째|까지|부터)?$/u);
  if (duration) return { tag: duration[1], weight: 3 };
  if (TAG_EXPRESSIONS.has(token)) return { tag: token, weight: 3 };
  const parsed = token.match(TAG_UNKNOWN);
  if (parsed && !TAG_GENERIC.test(parsed[1]) && !TAG_NON_NOUN.test(token)) {
    const tag = parsed[1], particle = parsed[3];
    // Use the final consonant to keep 바나나를 and 만년필을 intact.
    const last = tag.charCodeAt(tag.length - 1) - 0xac00;
    const final = last >= 0 && last <= 11171 ? last % 28 : -1;
    const wrongParticle = final >= 0 && (final === 0 ? /^(을|은|이|이랑|으로)$/u : /^(를|는|가|랑)$/u).test(particle);
    // 는 is also the productive present-tense verb ending. Unknown stems need
    // stronger evidence than that ending alone.
    if ((particle !== '는' || TAG_TOPIC_CONTEXT.test(nextToken)) && !wrongParticle && !TAG_BAD_STEM.test(tag)) return { tag, weight: /^(?:을|를)$/u.test(particle) ? 7 : 6 };
  }
  if (/^[A-Z][A-Z0-9]{1,11}$/.test(token) || (soleToken && standaloneTagName(token))) {
    return { tag: token, weight: 5 };
  }
  if (nextToken && /^(?:먹었다|먹었어|먹으러|먹고|마셨다|마셨어|마시러|샀다|샀어|사러|찍었다|찍었어|찍으러|읽었다|읽었어|읽으러|보러|보냈다|신었다|입었다|키우기|만들었다|갔다|다녀왔다|탔다)$/u.test(nextToken) && standaloneTagName(token)
    && !TAG_GENERIC.test(token) && !TAG_NON_NOUN.test(token)
    && !/(?:부터|까지|라도|보다|려고|으로|보다가|면서|다가|다시|마저|만큼|을|를|에|로|도|만|와|며|씩|뿐|히|리|쪽)$/u.test(token)) {
    return { tag: token, weight: 3 };
  }
  return null;
}

const TAG_SUPPORT = new Set('마음 생각 시간 밤 낮 집 손 눈 문 길 물 차 끝 답 얘기 이야기 별일 내일 사람 일 말 몸 하루'.split(' '));
const TAG_EXPRESSIONS = new Set('아쉽네 아쉽다 아쉬운 부끄럽다 기뻤다 신났다 씁쓸했다 울컥했다 뿌듯하다 잠깐만요 괜찮다고 귀엽다 웃었다 고마웠다 고맙다고 그립다 쉬었다 지쳤다 지쳤나 느긋하게 말똥말똥하다 재밌었다 고생했다 보고싶다 설렌다 고마워요 반갑다 힘들다 반가웠다 걷다 좋아진다 망설였다 괜찮아 설렜다 춥다 따뜻하다 속상했다 외롭다 시원하다 후련하다'.split(' '));

function suggestTags(body, limit = 5) {
  const tokens = [...String(body || '').matchAll(/(#[가-힣A-Za-z0-9_]+|[가-힣A-Za-z0-9]+)([^가-힣A-Za-z0-9#]*)/gu)];
  const terms = tokens.map((match, i) => tagCandidate(match[1], tokens.length === 1,
    /^[ \t]+$/.test(match[2]) ? tokens[i + 1]?.[1] || '' : ''));
  // A repeated bare name also identifies a topic outside the vocabulary.
  const mentions = new Map();
  terms.forEach((item, pos) => {
    const key = (item?.tag || tokens[pos][1]).toLowerCase();
    mentions.set(key, (mentions.get(key) || 0) + 1);
  });
  terms.forEach((item, pos) => {
    const tag = tokens[pos][1];
    if (!item && mentions.get(tag.toLowerCase()) > 1 && !TAG_GENERIC.test(tag) && !/(?:도|를|랑|의|에|로)$/u.test(tag) && standaloneTagName(tag)) {
      terms[pos] = { tag, weight: 6 };
    }
  });
  // In a phrase such as '돈 걱정', the first noun has no particle. Spacing and
  // punctuation distinguish a phrase from the last and first words of two sentences.
  const paired = terms.map((item, i) => !!item && item.weight >= 3
    && terms[i + 1]?.weight >= 3 && tokens[i][1] === item.tag && /^[ \t]+$/.test(tokens[i][2]));
  const matches = new Map();
  terms.forEach((item, pos) => {
    if (!item) return;
    const key = item.tag.toLowerCase();
    const weight = item.weight + (paired[pos] || paired[pos - 1] ? 2 : 0);
    const previous = matches.get(key);
    if (previous) {
      previous.count++;
      previous.weight = Math.max(previous.weight, weight);
      previous.explicit ||= !!item.explicit;
    } else matches.set(key, { ...item, pos, count: 1, weight });
  });
  // Repetition helps a supporting noun, while everyday filler stays a last resort.
  const ranked = [...matches.values()].map(item => ({
    ...item, score: item.weight + (item.weight > 1 ? Math.min(item.count - 1, 2) * 3 : 0)
  })).sort((a, b) => b.score - a.score || a.pos - b.pos);
  if (!ranked.length) return [];
  // Fill the next slots with supporting words from the same body.
  const selected = [];
  for (const item of ranked) {
    if (selected.length >= Math.min(limit, 5)) break;
    if (selected.length === 0 || item.score >= 5 || (selected.length < 3 && item.score >= 3)
      || (selected.length < 2 && TAG_SUPPORT.has(item.tag))) selected.push(item);
  }
  return selected.sort((a, b) => Number(!!b.explicit) - Number(!!a.explicit) || a.pos - b.pos)
    .map(item => item.tag);
}
let autoTagMode = true, manualTags = [], rejectedTags = new Set(), autoTagsNow = [];
// 일반 카드의 첨부 사진은 비공개 저장소에서 읽을 때마다 서명합니다.
const CARD_PHOTO_BUCKET = 'note-card-photos';
const CARD_VIDEO_BUCKET = 'note-card-videos';
let cardPhotoBlob = null, cardPhotoUrl = null, cardPhotoRequestId = null, cardPhotoPreparing = false, cardPhotoRun = 0;
let cardVideoPrepared = null, cardMediaController = null, cardMediaUploadController = null, cardMediaProgress = '';
let cardPhotoEditPath = null;
const cardPhotoCache = new Map(), cardPhotoWanted = new Set();
let cardPhotoTimer = null, cardPhotoRefreshTimer = null, photoLightbox = null, photoLightboxFocus = null;
let photoLightboxRun = 0;
function wantCardPhoto(id) {
  if (!validCardId(id) || !client || !session?.user) return;
  const hit = cardPhotoCache.get(id);
  if (hit && Date.now() - hit.at < (hit.url ? 8 * 60 * 1000 : 60 * 1000)) {
    paintCardPhoto(id); return;
  }
  cardPhotoWanted.add(id);
  clearTimeout(cardPhotoTimer); cardPhotoTimer = setTimeout(fetchCardPhotos, 80);
}
async function fetchCardPhotos() {
  cardPhotoTimer = null;
  const ids = [...cardPhotoWanted].slice(0, 100);
  for (const id of ids) cardPhotoWanted.delete(id);
  if (!ids.length || !session?.user) return;
  const epoch = identityEpoch, userId = session.user.id;
  try {
    const rows = await noteRpc('card_media_paths', { p_ids: ids });
    if (epoch !== identityEpoch || session?.user?.id !== userId) return;
    let byPath = new Map();
    const paths = (rows || []).map(row => row.photo_path).filter(Boolean);
    if (paths.length) {
      let data, error;
      try { ({ data, error } = await client.storage.from(CARD_PHOTO_BUCKET).createSignedUrls(paths, 600)); }
      catch (cause) { error = cause; }
      if (epoch !== identityEpoch || session?.user?.id !== userId) return;
      // A linked attachment that cannot be signed is an error, not an empty photo.
      if (error) console.warn('Note card photo signing:', error);
      byPath = new Map((data || []).filter(item => !item.error && item.signedUrl).map(item => [item.path, item.signedUrl]));
    }
    const linked = new Map((rows || []).map(row => [row.card_id, row]));
    for (const id of ids) {
      const media = linked.get(id), path = media?.photo_path, url = byPath.get(path) || null;
      cardPhotoCache.set(id, { url, failed: !!path && !url, at: Date.now(),
        videoPath: media?.video_path || null, duration: media?.duration, width: media?.width, height: media?.height });
    }
    ids.forEach(paintCardPhoto);
    scheduleCardPhotoRefresh();
  } catch (error) {
    console.warn('Note card photos:', error);
    if (epoch === identityEpoch && session?.user?.id === userId)
      ids.filter(id => cardPhotoCache.get(id)?.failed).forEach(paintCardPhoto);
  }
  if (cardPhotoWanted.size && epoch === identityEpoch && session?.user?.id === userId)
    cardPhotoTimer = setTimeout(fetchCardPhotos, 80);
}
function applyCardPhoto(thumb, url, failed = false, media = null) {
  const isVideo = !!media?.videoPath;
  const shown = !!url || failed || isVideo;
  thumb.hidden = !shown;
  thumb.classList.toggle('photo-load-failed', failed);
  thumb.style.backgroundImage = '';
  if (!thumb.dataset.photoLabel) thumb.dataset.photoLabel = thumb.getAttribute('aria-label') || '사진 크게 보기';
  thumb.dataset.mediaKind = isVideo ? 'video' : 'photo';
  if (isVideo) thumb.dataset.videoPath = media.videoPath; else delete thumb.dataset.videoPath;
  thumb.setAttribute('aria-label', isVideo ? '첨부 영상 재생' : failed ? '첨부 사진을 불러오지 못했어요. 다시 불러오기' : thumb.dataset.photoLabel);
  thumb.title = isVideo ? `영상 재생${media.duration ? ` · ${Math.ceil(media.duration)}초` : ''}` : failed ? '사진 다시 불러오기' : '첨부 사진 크게 보기';
  if (url) thumb.dataset.photoUrl = url; else delete thumb.dataset.photoUrl;
  thumb.dataset.photoState = failed ? 'error' : url ? 'ready' : 'empty';
  thumb.replaceChildren();
  if (url) {
    const img = node('img'); img.alt = ''; img.decoding = 'async'; img.loading = 'lazy';
    const epoch = identityEpoch;
    img.addEventListener('error', () => {
      if (epoch !== identityEpoch || !thumb.isConnected || thumb.dataset.photoUrl !== url) return;
      const id = thumb.dataset.photoCard;
      cardPhotoCache.set(id, { ...cardPhotoCache.get(id), url: null, failed: true, at: Date.now() }); paintCardPhoto(id);
    }, { once: true });
    img.src = url; thumb.append(img);
  } else if (failed && !isVideo) thumb.textContent = '사진\n재시도';
  if (isVideo) {
    const play = node('span', 'card-video-badge', '▶'); play.setAttribute('aria-hidden', 'true'); thumb.append(play);
  }
  const frame = thumb.closest('.card-photo-frame, .compose-photo');
  frame?.classList.toggle('has-card-photo', shown);
  requestTagFit();
}
function paintCardPhoto(id) {
  const hit = cardPhotoCache.get(id);
  document.querySelectorAll(`[data-photo-card="${id}"]`).forEach(thumb => applyCardPhoto(thumb, hit?.url, !!hit?.failed, hit));
  if (editingId === id && !backdrop.hidden && cardPhotoEditPath) syncCardPhotoAttach();
}
function activateCardPhoto(thumb) {
  if (thumb.dataset.mediaKind === 'video') { void openCardVideo(thumb); return; }
  if (thumb.dataset.photoState === 'error') {
    cardPhotoCache.set(thumb.dataset.photoCard, { url: null, failed: true, at: 0 });
    thumb.textContent = '불러오는 중';
    wantCardPhoto(thumb.dataset.photoCard);
    return;
  }
  openPhotoLightbox(thumb.dataset.photoUrl, thumb.dataset.protectPhoto === 'true');
}
function scheduleCardPhotoRefresh() {
  clearTimeout(cardPhotoRefreshTimer); cardPhotoRefreshTimer = null;
  if (!session?.user) return;
  const next = [...cardPhotoCache.values()].filter(hit => hit.url)
    .reduce((minimum, hit) => Math.min(minimum, hit.at + 8 * 60 * 1000), Infinity);
  if (!Number.isFinite(next)) return;
  cardPhotoRefreshTimer = setTimeout(() => {
    for (const [id, hit] of cardPhotoCache) {
      if (!hit.url || Date.now() - hit.at < 8 * 60 * 1000) continue;
      cardPhotoCache.delete(id);
      if (document.querySelector(`[data-photo-card="${id}"]`)) wantCardPhoto(id);
    }
    scheduleCardPhotoRefresh();
  }, Math.max(1000, next - Date.now()));
}
// Photos attach to the current card/event; the retired World album is not used.
function selectDevicePhoto(target, anchor) {
  if (!anchor || anchor.hidden || anchor.disabled || anchor.getAttribute('aria-disabled') === 'true') return;
  const input = $(target === 'event' ? '#event-photo-file' : '#card-photo-file');
  if (input && !input.disabled) input.click();
}
function closePhotoLightbox() {
  photoLightboxRun++;
  if (!photoLightbox || photoLightbox.hidden) return;
  photoLightbox.hidden = true; photoLightbox.querySelector('img').removeAttribute('src');
  const video = photoLightbox.querySelector('video');
  if (video) {
    video.pause(); video.removeAttribute('src'); video.removeAttribute('poster'); video.load();
  }
  if (photoLightboxFocus?.isConnected) photoLightboxFocus.focus({ preventScroll: true });
  photoLightboxFocus = null;
}
function ensurePhotoLightbox() {
  if (!photoLightbox) {
    photoLightbox = node('div', 'note-photo-lightbox');
    photoLightbox.hidden = true;
    photoLightbox.setAttribute('role', 'dialog'); photoLightbox.setAttribute('aria-modal', 'true');
    photoLightbox.setAttribute('aria-label', '카드 사진');
    const img = node('img'); img.alt = '카드에 넣은 사진';
    const video = node('video'); video.hidden = true; video.controls = true; video.playsInline = true;
    video.preload = 'none'; video.setAttribute('aria-label', '카드에 넣은 영상');
    video.setAttribute('controlslist', 'nodownload');
    const status = node('p', 'note-media-status'); status.hidden = true;
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    video.addEventListener('error', () => {
      if (photoLightbox.hidden || video.hidden || !video.getAttribute('src')) return;
      status.textContent = '영상을 재생하지 못했어요. 닫은 뒤 다시 눌러 주세요.'; status.hidden = false;
    });
    video.addEventListener('playing', () => { status.hidden = true; });
    const close = node('button', 'note-photo-lightbox-close', '닫기'); close.type = 'button';
    photoLightbox.append(img, video, status, close); document.body.append(photoLightbox);
    photoLightbox.addEventListener('click', event => {
      if (event.target === photoLightbox || event.target === close) closePhotoLightbox();
    });
    document.addEventListener('keydown', event => {
      if (photoLightbox.hidden) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePhotoLightbox(); }
      if (event.key === 'Tab') {
        if (video.hidden) { event.preventDefault(); close.focus(); }
        else if (!event.shiftKey && document.activeElement === close) { event.preventDefault(); video.focus(); }
        else if (event.shiftKey && document.activeElement === video) { event.preventDefault(); close.focus(); }
      }
    }, true); // Native video controls can consume Escape before it bubbles.
  }
}
function openPhotoLightbox(url, protect = false) {
  if (!url || !session?.user) return;
  closePhotoLightbox(); ensurePhotoLightbox();
  photoLightboxFocus = document.activeElement;
  photoLightbox.setAttribute('aria-label', '카드 사진');
  const img = photoLightbox.querySelector('img'); img.hidden = false;
  img.dataset.protectPhoto = String(protect); img.src = url;
  photoLightbox.querySelector('video').hidden = true;
  photoLightbox.querySelector('.note-media-status').hidden = true;
  photoLightbox.hidden = false;
  photoLightbox.querySelector('button').focus({ preventScroll: true });
}
async function openCardVideo(thumb) {
  const path = thumb.dataset.videoPath;
  if (!path || !client || !session?.user) return;
  closePhotoLightbox(); ensurePhotoLightbox();
  const run = ++photoLightboxRun, epoch = identityEpoch, userId = session.user.id;
  photoLightboxFocus = document.activeElement;
  photoLightbox.setAttribute('aria-label', '카드 영상');
  photoLightbox.querySelector('img').hidden = true;
  const video = photoLightbox.querySelector('video'); video.hidden = false;
  if (thumb.dataset.photoUrl) video.poster = thumb.dataset.photoUrl;
  const status = photoLightbox.querySelector('.note-media-status');
  status.textContent = '영상을 불러오는 중이에요.'; status.hidden = false;
  photoLightbox.hidden = false; photoLightbox.querySelector('button').focus({ preventScroll: true });
  try {
    // Only the selected attachment receives a video URL. The feed loads posters, never video bytes.
    const { data, error } = await client.storage.from(CARD_VIDEO_BUCKET).createSignedUrl(path, 600);
    if (run !== photoLightboxRun || epoch !== identityEpoch || userId !== session?.user?.id || photoLightbox.hidden) return;
    if (error || !data?.signedUrl) throw error || new Error('missing_video_url');
    video.src = data.signedUrl; status.hidden = true;
    // This follows a deliberate tap. Browsers that require another tap retain the native play control.
    const playing = video.play(); playing?.catch(() => {});
  } catch (error) {
    if (run !== photoLightboxRun || epoch !== identityEpoch || photoLightbox.hidden) return;
    console.warn('Note card video:', error);
    status.textContent = '영상을 불러오지 못했어요. 닫은 뒤 다시 눌러 주세요.'; status.hidden = false;
  }
}
async function selectCardPhoto(file) {
  if (!file || busy || parkJunior() || !(kind === 'memo' || kind === 'comment') || (editingId && !cardPhotoEditPath)) return;
  cardMediaController?.abort();
  const controller = new AbortController(); cardMediaController = controller;
  const run = ++cardPhotoRun, composer = composerRun, epoch = identityEpoch;
  const isVideo = /^video\//i.test(file.type) || /\.(mp4|mov|m4v|webm)$/i.test(file.name || '');
  cardMediaProgress = isVideo ? '영상을 확인하는 중이에요.' : '사진을 준비하는 중이에요.';
  cardPhotoPreparing = true; updateComposer();
  try {
    let prepared = null;
    if (isVideo) {
      const helper = window.ojjudaCardVideo || await import('/note/card-video.js?v=20261120-video1');
      if (controller.signal.aborted) return;
      prepared = await helper.prepareCardVideo(file, { signal: controller.signal, onProgress: ({ phase, progress }) => {
        if (run !== cardPhotoRun || epoch !== identityEpoch || controller.signal.aborted) return;
        const percent = Math.min(100, Math.max(0, Math.round((progress || 0) * 100)));
        cardMediaProgress = phase === 'processing' ? `영상을 최적화하는 중이에요. ${percent}%`
          : phase === 'poster' ? '영상 미리보기를 만드는 중이에요.' : '영상을 확인하는 중이에요.';
        updateComposer();
      } });
    }
    const blob = prepared?.posterBlob || await prepareEventPhoto(file, 10 * 1024 * 1024);
    if (run !== cardPhotoRun || composer !== composerRun || epoch !== identityEpoch
      || controller.signal.aborted || backdrop.hidden || (editingId && !cardPhotoEditPath) || !(kind === 'memo' || kind === 'comment')) return;
    if (cardPhotoUrl) URL.revokeObjectURL(cardPhotoUrl);
    cardPhotoBlob = blob; cardPhotoUrl = URL.createObjectURL(blob); cardPhotoRequestId = crypto.randomUUID();
    cardVideoPrepared = prepared;
    cardMediaProgress = prepared ? `영상 ${Math.ceil(prepared.duration)}초 · ${(prepared.blob.size / 1024 / 1024).toFixed(1)}MB · 준비됐어요.` : '';
  } catch (error) {
    if (run === cardPhotoRun && !controller.signal.aborted) {
      cardMediaProgress = error.message || '첨부 파일을 읽지 못했어요. 다시 골라 주세요.'; message(cardMediaProgress);
    }
  } finally {
    if (run === cardPhotoRun) { cardMediaController = null; cardPhotoPreparing = false; syncCardPhotoAttach(); updateComposer(); }
  }
}
function clearCardPhoto() {
  cardPhotoRun++;
  cardMediaController?.abort(); cardMediaController = null;
  cardMediaUploadController?.abort(); cardMediaUploadController = null;
  if (cardPhotoUrl) URL.revokeObjectURL(cardPhotoUrl);
  cardPhotoBlob = null; cardPhotoUrl = null; cardPhotoRequestId = null; cardPhotoPreparing = false;
  cardVideoPrepared = null; cardMediaProgress = '';
  const input = $('#card-photo-file'); if (input) input.value = '';
  syncCardPhotoAttach();
}
function syncCardPhotoAttach() {
  const attach = $('#card-photo-attach'), remove = $('#card-photo-remove');
  if (!attach || !remove) return;
  const allowed = !parkJunior() && (!editingId || !!cardPhotoEditPath) && (kind === 'memo' || kind === 'comment');
  const previewUrl = cardPhotoUrl || (editingId && cardPhotoEditPath ? cardPhotoCache.get(editingId)?.url : null);
  const disabled = !allowed || busy || draftLoading;
  $('#card-photo-file').disabled = disabled;
  remove.disabled = disabled;
  attach.hidden = !allowed; remove.hidden = !allowed || (!cardPhotoUrl && !cardPhotoPreparing);
  attach.tabIndex = allowed ? 0 : -1;
  attach.classList.toggle('has-photo', !!previewUrl);
  attach.style.backgroundImage = previewUrl ? `url("${previewUrl.replaceAll('"', '%22')}")` : '';
  attach.title = editingId || cardPhotoUrl ? '사진·영상 바꾸기' : '사진·영상 첨부';
  attach.setAttribute('aria-label', attach.title);
  remove.setAttribute('aria-label', cardPhotoPreparing ? '첨부 준비 취소' : editingId ? '첨부 교체 취소' : '첨부 빼기');
  const mediaStatus = $('#card-media-status');
  if (mediaStatus) {
    mediaStatus.hidden = !allowed;
    mediaStatus.textContent = cardMediaProgress || '사진 또는 1분 미만 영상 · 영상은 자동으로 용량을 줄여요.';
  }
  attach.closest('.compose-photo')?.classList.toggle('has-card-photo-attach', allowed);
  attach.classList.toggle('is-busy', cardPhotoPreparing);
  attach.setAttribute('aria-disabled', String(disabled));
  syncComposerTools();
}
async function prepareCardPhotoEdit(cardId, run) {
  const epoch = identityEpoch;
  try {
    const rows = await noteRpc('card_photo_paths', { p_ids: [cardId] });
    if (epoch !== identityEpoch || run !== composerRun || backdrop.hidden || editingId !== cardId) return;
    cardPhotoEditPath = rows?.find(row => row.card_id === cardId)?.photo_path || null;
    $('#compose-context').textContent = cardPhotoEditPath
      ? '글·태그와 첨부한 사진·영상을 바꿀 수 있어요.'
      : '글과 태그를 수정할 수 있어요. 사진·영상은 처음 작성할 때만 첨부할 수 있어요.';
    if (cardPhotoEditPath) { cardPhotoCache.delete(cardId); wantCardPhoto(cardId); }
    syncCardPhotoAttach();
  } catch (error) {
    if (epoch !== identityEpoch || run !== composerRun || backdrop.hidden || editingId !== cardId) return;
    console.warn('Note editable photo:', error);
    $('#compose-context').textContent = '글과 태그를 수정할 수 있어요. 첨부 정보를 확인하려면 작성창을 다시 열어 주세요.';
  }
}
// 글쓰기 창 아래쪽의 이름·성별 빠른 선택 (꾸미기 · 추가 설정 안의 선택지와 서로 맞춰져요)
function syncQuickChoices() {
  const nameBox = $('#quick-identity'), genderBox = $('#quick-gender'); if (!nameBox || !genderBox) return;
  const card = kind === 'comment' ? cache.get(editingId || parentId) : null;
  const replyAlias = editingId ? (card?.identity_mode === 'anonymous' && card.display_name) : card?.my_reply_alias;
  const anonymous = $('input[name="identity"][value="anonymous"]');
  if (replyAlias) anonymous.checked = true;
  const identity = $('input[name="identity"]:checked')?.value || 'anonymous';
  const option = nameBox.querySelector('option[value="anonymous"]');
  const label = replyAlias || '익명';
  if (option.textContent !== label) option.textContent = label;
  const selected = $('input[name="gender"]:checked')?.value;
  const gender = selected === 'private' || selected === myGender ? selected : myGender;
  const choices = myGender === 'private' ? ['private'] : [myGender, 'private'];
  if ([...genderBox.options].map(option => option.value).join(',') !== choices.join(',')) {
    genderBox.replaceChildren(...choices.map(value => new Option(value === 'private' ? '비공개' : value === 'male' ? '남' : '여', value)));
  }
  document.querySelectorAll('input[name="gender"]').forEach(input => {
    input.checked = input.value === gender;
    input.disabled = !choices.includes(input.value) || busy || draftLoading || !session?.user;
    input.closest('label').hidden = !choices.includes(input.value);
  });
  if (nameBox.value !== identity) nameBox.value = identity;
  if (genderBox.value !== gender) genderBox.value = gender;
  const nickname = $('input[name="identity"][value="nickname"]');
  nameBox.querySelector('option[value="nickname"]').disabled = !nickname || nickname.closest('label')?.classList.contains('disabled-choice');
  const disabled = busy || draftLoading || !session?.user;
  const resolvingReply = kind === 'comment' && replyDueChecking;
  nameBox.disabled = disabled || !!replyAlias || resolvingReply;
  if (nickname) nickname.disabled = nameBox.disabled || nickname.closest('label')?.classList.contains('disabled-choice');
  genderBox.disabled = disabled;
  genderBox.closest('.quick-choice').hidden = !!editingId;   // 성별은 올릴 때 정해져서 수정할 때는 바꿀 수 없어요
}
function pickQuickChoice(group, value) {
  const input = $(`input[name="${group}"][value="${value}"]`); if (!input || input.disabled || (group === 'gender' && value !== myGender && value !== 'private')) { syncQuickChoices(); return; }
  input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); updateComposer();
}
const tagList = raw => String(raw || '').split(/[\s,]+/u).map(value => value.replace(/^#+/, '')).filter(Boolean);
function initialComposerTags(raw = '') {
  const values = tagList(raw);
  if (!editingId && kind !== 'event' && tagList(feedTerm).includes('19금') && !values.includes('19금')) values.unshift('19금');
  return values.join(', ');
}
function refreshAutoTags() {   // 내가 쓴 태그 + 남은 자리에 자동 태그 (모두 5개까지)
  const mine = manualTags, room = Math.max(0, 5 - mine.length);
  autoTagsNow = room > 0 ? suggestTags(text.value, 12).filter(t => !mine.includes(t) && !rejectedTags.has(t)).slice(0, room) : [];
  tags.value = [...mine, ...autoTagsNow].join(', ');
}
function noteTagEdit() {   // 직접 쓴 태그를 우선하고, 다섯 자리를 넘으면 자동 태그부터 빼요
  const now = tagList(tags.value);
  const previousAuto = new Set(autoTagsNow);
  const mine = now.filter(t => !previousAuto.has(t)).slice(0, 5);
  const keepAuto = now.filter(t => previousAuto.has(t)).slice(0, 5 - mine.length);
  const kept = now.filter(t => !previousAuto.has(t) || keepAuto.includes(t)).slice(0, 5);
  for (const t of autoTagsNow) if (!kept.includes(t)) rejectedTags.add(t);
  manualTags = kept.filter(t => !previousAuto.has(t));
  autoTagsNow = kept.filter(t => previousAuto.has(t));
  if (now.length > 5) tags.value = kept.join(', ');
}
function shownName(card) {
  const name = card.display_name;
  if (name && name !== '익명') {
    const iconWord = card.identity_mode === 'anonymous' ? name.split(' ').at(-1) : name;
    return { name, icon: [...iconWord][0] || 'ㅇ' };
  }
  return card.id ? anonAlias(card.id, card.created_at) : { name: '익명', icon: 'ㅇ' };
}

let cardDateFormatter;
function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  cardDateFormatter ??= new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: 'numeric', day: 'numeric'
  });
  return cardDateFormatter.format(date);
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

// Shrink the chips together before wrapping; never cut off a tag to fit the row.
function fitTagRow(row) {
  if (!row?.clientWidth) return;
  row.classList.remove('tags-wrap');
  let fits = false;
  for (let step = 0; step <= 5; step++) {
    row.style.setProperty('--tag-font', `${11 - step * .5}px`);
    row.style.setProperty('--tag-pad', `${10 - step * 1.4}px`);
    row.style.setProperty('--tag-gap', `${6 - step * .6}px`);
    if (row.scrollWidth <= row.clientWidth + 1) { fits = true; break; }
  }
  row.classList.toggle('tags-wrap', !fits);
  const frame = row.closest('.card-photo-frame, .compose-photo') || row.closest('.photo');
  frame?.style.setProperty('--card-tags-height', `${row.childElementCount ? row.offsetHeight : 0}px`);
}
let tagFitFrame = null;
function requestTagFit() {
  if (tagFitFrame !== null) return;
  tagFitFrame = requestAnimationFrame(() => {
    tagFitFrame = null;
    refreshExpandedBodies();
  });
}
const expandedBodyEntries = new Set(), quoteFitEntries = new Set();
const inkCards = new WeakMap();
function inkOptions(style, width, cardTags) {
  const inkColor = COLOR_PALETTE[style.textColor]?.solid;
  return { width, inkColor, tags: cardTags, zoom: style.size === 'small' ? .85 : style.size === 'large' ? 1.12 : 1 };
}
function renderParkInk(canvas, body, options) {
  const renderer = window.ParkCalligraphy;
  if (!renderer?.render?.(canvas, body, options)) return false;
  const bounds = renderer.inkBounds?.(canvas);
  let frame = canvas.previousElementSibling;
  if (!frame?.classList.contains('park-ink-box-frame')) {
    if (!bounds) return true;
    frame = node('span', 'park-ink-box-frame');
    frame.setAttribute('aria-hidden', 'true');
    const sheet = node('span', 'park-ink-sheet');
    sheet.append(node('span', 'park-ink-box'));
    frame.append(sheet);
    canvas.before(frame);
  }
  frame.hidden = !bounds;
  if (bounds) {
    const left = Math.max(0, bounds.x - .026), top = Math.max(0, bounds.y - .032);
    const right = Math.min(1, bounds.x + bounds.width + .026);
    const bottom = Math.min(1, bounds.y + bounds.height + .032);
    Object.assign(frame.querySelector('.park-ink-box').style, {
      left: `${left * 100}%`, top: `${top * 100}%`,
      width: `${(right - left) * 100}%`, height: `${(bottom - top) * 100}%`
    });
  }
  return true;
}
function drawInkCard(photo) {
  const job = inkCards.get(photo);
  if (!job) return;
  const canvas = job.canvas;
  if (canvas.dataset.inkReady === 'true') return;
  if (renderParkInk(canvas, job.body, job.options)) {
    canvas.dataset.inkReady = 'true';
    requestTagFit();
  }
}
let composeInkFrame = 0, composeInkRun = 0, composeInkComposing = false;
function syncComposeInkDisplay() {
  const photo = $('.compose-photo'), canvas = $('#compose-ink-art');
  const on = photo?.classList.contains('park-ink-overlay');
  const preview = on && !composeInkComposing && document.activeElement !== text
    && !!text.value.trim() && canvas?.dataset.inkReady === 'true';
  photo?.classList.toggle('park-ink-preview', !!preview);
  photo?.classList.toggle('park-ink-writing', !!on && !preview);
}
function syncComposeInk(selected, style, previewTags) {
  const photo = $('.compose-photo'), canvas = $('#compose-ink-art');
  if (!canvas || !photo) return;
  const on = selected && !!window.ParkCalligraphy && !backdrop.hidden;
  photo.classList.toggle('park-ink-overlay', on);
  // The same native field stays centered on the photo in both writing modes.
  // Focus/IME uses the readable input; the painted preview appears after editing.
  cancelAnimationFrame(composeInkFrame);
  const run = ++composeInkRun;
  canvas.hidden = !on;
  if (!on) { delete canvas.dataset.inkReady; composeInkComposing = false; }
  syncComposeInkDisplay();
  if (!on || composeInkComposing) return;
  const body = text.value, options = inkOptions(style, 720, previewTags);
  composeInkFrame = requestAnimationFrame(() => {
    if (run !== composeInkRun || backdrop.hidden) return;
    if (renderParkInk(canvas, body, options)) canvas.dataset.inkReady = 'true';
    else delete canvas.dataset.inkReady;
    syncComposeInkDisplay();
  });
}
function fitPhotoQuote(photo, quote, tagRow) {
  // A hidden feed has zero bounds, not an overflowing card. Leave its layout intact.
  if (!photo.isConnected || photo.getBoundingClientRect().width <= 0) return;
  photo.style.height = '';
  const minimumHeight = photo.getBoundingClientRect().height;
  // Tags have their own fitting rules; settle their layout before measuring the quote.
  fitTagRow(tagRow);
  // Measure at the authored CSS size first so a short wide line is not penalized by its character count.
  quote.style.fontSize = '';
  if (inkCards.get(photo)?.canvas.dataset.inkReady === 'true') return;
  if (!photoQuoteClipped(photo, quote, tagRow)) return;
  const authored = parseFloat(getComputedStyle(quote).fontSize);
  let best = Math.min(12, authored);
  let low = Math.floor(best) + 1, high = Math.ceil(authored) - 1;
  while (low <= high) {
    const size = Math.floor((low + high) / 2);
    quote.style.fontSize = `${size}px`;
    if (photoQuoteClipped(photo, quote, tagRow)) high = size - 1;
    else { best = size; low = size + 1; }
  }
  quote.style.fontSize = `${best}px`;
  // Fixed-ratio faces use the full-text disclosure for overflow.
  if (getComputedStyle(photo).aspectRatio === 'auto' && photoQuoteClipped(photo, quote, tagRow)) {
    photo.style.height = `${Math.ceil(Math.max(minimumHeight, quote.scrollHeight + (tagRow.childElementCount ? tagRow.offsetHeight * 2 + 80 : 70)))}px`;
  }
}
function refreshExpandedBodies() {
  for (const entry of quoteFitEntries) {
    if (!entry.photo.isConnected) {
      if (entry.photo.dataset.pendingBackground || inkCards.has(entry.photo)) backgroundObserver(entry.photo)?.unobserve(entry.photo);
      quoteFitEntries.delete(entry);
      continue;
    }
    fitPhotoQuote(entry.photo, entry.quote, entry.tagRow);
  }
  // Each card's tags were fitted with its quote. Only the composer is separate.
  fitTagRow($('#compose-tag-display'));
  for (const entry of expandedBodyEntries) {
    if (!entry.item.isConnected) { expandedBodyEntries.delete(entry); continue; }
    if (entry.photo.getBoundingClientRect().width <= 0) continue;
    entry.full.hidden = !photoQuoteClipped(entry.photo, entry.quote, entry.tagRow);
  }
}
// Optional brush engine is not on the first-feed critical path.
window.addEventListener('ojjuda:park-calligraphy-ready', () => {
  for (const entry of quoteFitEntries) {
    if (!entry.photo.isConnected || entry.photo.dataset.pendingBackground || !inkCards.has(entry.photo)) continue;
    drawInkCard(entry.photo);
  }
  if (!backdrop.hidden) updateComposer();
  requestTagFit();
});
function photoQuoteClipped(photo, quote, tagRow) {
  const ink = inkCards.get(photo);
  if (ink?.canvas.dataset.inkReady === 'true') return ink.body.length > 36 || ink.body.split('\n').length > 6;
  const photoBounds = photo.getBoundingClientRect(), quoteBounds = quote.getBoundingClientRect();
  const tagBounds = tagRow.getBoundingClientRect();
  return quote.scrollHeight > quote.clientHeight + 1 || quote.scrollWidth > quote.clientWidth + 1
    || quoteBounds.top < photoBounds.top + 8 || quoteBounds.bottom > photoBounds.bottom - 8
    || (tagRow.childElementCount > 0
      && quoteBounds.bottom + 6 > tagBounds.top);
}
function cardElement(card, compact = false, expanded = false, deferBackground = false) {
  const item = node('article', compact ? 'reply-card' : 'photo-card');
  if (card.kind === 'event') item.classList.add('note-event-card');
  item.dataset.cardId = card.id;
  const frame = node('div', 'card-photo-frame');
  const open = node(expanded ? 'div' : 'button', 'photo-open');
  if (expanded) open.style.cursor = 'default';
  else {
    open.type = 'button';
    open.dataset.open = card.id;
    open.setAttribute('aria-label', card.kind === 'event' ? '이벤트/광고 카드 크게 보기' : '카드 크게 보기');
  }
  const style = card.style && typeof card.style === 'object' ? card.style : {};
  const visiblePhoto = card.photo_key || card.background_key;
  const photo = node('span', 'photo');
  if (card.kind === 'event') photo.dataset.protectPhoto = String(!card.is_mine);
  const hiddenEvent = card.kind === 'event' && card.body == null;
  // Keep the original ink canvas even if its large renderer finishes loading later.
  const useInk = !hiddenEvent && style.font === 'calligraphy' && typeof card.body === 'string';
  const key = hiddenEvent ? null : photoAssetKey(visiblePhoto);
  if (key && card.kind !== 'event' && document.documentElement.hasAttribute('data-park-webp')) {
    photo.dataset.imageSizes = compact ? 'min(67vw, 500px)' : 'min(100vw, 750px)';
  }
  const observer = compact ? replyBackgroundObserver : feedBackgroundObserver;
  if (key && deferBackground && card.kind !== 'event' && observer) {
    photo.dataset.pendingBackground = key;
    observer.observe(photo);
  } else {
    setPhotoBackground(photo, key);
  }
  if (card.kind === 'event' && !hiddenEvent) void loadEventBackground(photo, card);
  applyVisualStyle(photo, style);
  const quote = node('span', 'card-quote');
  const body = hiddenEvent ? '범위 안에서만 보이는 이벤트' : typeof card.body === 'string' ? card.body : '';
  fillCardQuote(quote, body);
  const tagRow = node('span', 'card-tags');
  const cardTags = Array.isArray(card.tags) ? card.tags.slice(0, 5) : [];
  for (const tag of cardTags) {
    const chip = node('span', '', `#${tag}`); chip.dataset.tag = tag; chip.setAttribute('role', 'button'); chip.title = `#${tag} 태그로 찾기`;
    chip.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); searchTagFn?.(tag); });
    chip.tabIndex = 0;
    chip.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault(); event.stopPropagation(); searchTagFn?.(tag);
    });
    tagRow.append(chip);
  }
  photo.append(node('span', 'photo-shade'));
  if (useInk) {
    photo.classList.add('park-ink-overlay');
    if (!expanded) open.setAttribute('aria-label', body + ', 카드 크게 보기');
    const options = inkOptions(style, expanded ? 1080 : compact ? 480 : 720, cardTags);
    const canvas = node('canvas', 'park-ink-art');
    canvas.setAttribute('aria-hidden', 'true');
    photo.append(canvas);
    inkCards.set(photo, { canvas, body, options });
    if (observer && deferBackground) observer.observe(photo);
    else drawInkCard(photo);
  }
  photo.append(quote, tagRow);
  open.append(photo); frame.append(open);
  quoteFitEntries.add({ photo, quote, tagRow });
  if (card.kind === 'event') frame.append(node('span', 'note-event-badge', '이벤트/광고'));
  if ((card.kind === 'memo' || card.kind === 'comment') && card.id) {
    const thumb = node('button', 'card-photo-thumb'); thumb.type = 'button'; thumb.hidden = true;
    thumb.dataset.photoCard = card.id;
    thumb.dataset.protectPhoto = String(!card.is_mine);
    thumb.setAttribute('aria-label', '첨부 사진 크게 보기');
    thumb.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      activateCardPhoto(thumb);
    });
    frame.append(thumb);
    const known = cardPhotoCache.get(card.id);
    if (known) applyCardPhoto(thumb, known.url, !!known.failed, known);
    wantCardPhoto(card.id);
  }
  item.append(frame);
  requestTagFit();
  if (expanded && !hiddenEvent) {
    const full = node('details', 'note-full-body');
    full.hidden = true;
    full.append(node('summary', '', '전체 글 보기'), node('p', '', body));
    item.append(full);
    expandedBodyEntries.add({ item, photo, quote, tagRow, full });
  }

  const meta = node('div', 'card-meta');
  const person = node('span');
  const who = shownName(card);
  person.append(node('strong', '', who.name));
  person.append(node('small', '', dateLabel(card.created_at)));
  const avatar = node('span', 'avatar', ''); avatar.dataset.genderCard = card.id || '';
  paintGender(avatar, genderCache.get(card.id) || 'private'); wantGender(card.id);
  meta.append(avatar, person);
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
    reply.dataset.replyTo = card.id;
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
function fillCardQuote(quote, body) {
  body.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
    if (index) quote.append(document.createElement('br'));
    quote.append(document.createTextNode(line));
  });
  quote.style.overflowWrap = 'anywhere';
}
function previewCardWidth(compact) {
  const original = $('#detail-card-slot .photo-card')?.getBoundingClientRect().width
    || $('#feed-list .photo-card')?.getBoundingClientRect().width
    || $('.compose-photo').clientWidth;
  return compact ? original * 2 / 3 : original;
}
function cardPhotoOverflows(body, values = []) {
  if (!body) return false;
  const compact = kind === 'comment', style = currentStyle();
  if (style.font === 'calligraphy' && window.ParkCalligraphy) return false;
  const probe = node('article', compact ? 'reply-card' : kind === 'event' ? 'photo-card note-event-card' : 'photo-card');
  probe.style.maxWidth = 'none';
  const host = node('div', 'park-photo-cards');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${previewCardWidth(compact)}px;visibility:hidden;pointer-events:none`;
  const photo = node('span', 'photo'), quote = node('span', 'card-quote'), tagRow = node('span', 'card-tags');
  applyVisualStyle(photo, style);
  fillCardQuote(quote, body);
  for (const value of values) tagRow.append(node('span', '', `#${value}`));
  photo.append(quote, tagRow); probe.append(photo); host.append(probe); $('#main').append(host);
  try {
    fitPhotoQuote(photo, quote, tagRow);
    return photoQuoteClipped(photo, quote, tagRow);
  } finally { host.remove(); }
}

function message(value) {
  if (featureMessage) { featureMessage.textContent = value; featureMessage.hidden = !value; }
}
let flashTimer = null;
function flashMessage(value, ms = 2500) {   // 짧게 보여 주고 저절로 사라지는 안내
  message(value); clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { if (featureMessage?.textContent === value) message(''); }, ms);
}
let tagTabReset = null, searchTagFn = null;
let resetPopularTags = null;
function filterSearchOnlyTags(request, searchTag = '') {
  return tagList(searchTag).includes('19금') ? request : request.not('tags', 'cs', '{19금}');
}
function canDisplayTaggedCard(card) {
  return tagList(feedTerm).includes('19금') || !card?.tags?.includes('19금');
}
function cursorFilter(cursor) {
  if (!cursor || !validCardId(cursor.id) || !Number.isFinite(Date.parse(cursor.created_at))) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.created_at)) return null;
  // Keep PostgreSQL microseconds: rounding to milliseconds can skip tied rows.
  const time = cursor.created_at;
  return `created_at.lt.${time},and(created_at.eq.${time},id.lt.${cursor.id})`;
}
function filteredFeed() {
  // Tag searches and personal collections show all visible matches, newest first.
  let request = filterSearchOnlyTags(query().from('public_cards').select(columns), feedTerm);
  // Saved and own collections include replies as well as root cards.
  if (feedMode === 'all') request = request.eq('kind', 'memo');
  if (feedMode === 'saved') request = request.eq('is_bookmarked', true);
  if (feedMode === 'mine') request = request.eq('is_mine', true);
  if (feedTerm) request = request.contains('tags', tagList(feedTerm));
  if (feedSnapshot) request = request.lte('created_at', feedSnapshot);
  const after = cursorFilter(feedCursor);
  if (after) request = request.or(after);
  return request.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20);
}
const FEED_REQUEST_TIMEOUT_MS = 8500;
async function feedWithinDeadline(pending, controller = null) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(pending),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Park feed timed out');
          error.name = 'TimeoutError';
          reject(error);
          controller?.abort();
        }, FEED_REQUEST_TIMEOUT_MS);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function getFeedCards(parameters) {
  const controller = new AbortController();
  // Reuse the same authenticated RPC boundary as other Park actions. This
  // keeps fixture overrides and production read/abort behavior consistent.
  return feedWithinDeadline(noteRpc('list_cards', parameters, controller.signal), controller);
}
async function loadFeed(more = false, quiet = false) {
  if (!client || (more && feedLoading)) return false;
  if (feedRecoveryTimer !== null) { clearTimeout(feedRecoveryTimer); feedRecoveryTimer = null; }
  window.OjjudaParkFeedStarted = true;
  if (!more) feedDeferred = false;
  const searchContext = $('#feed-search-context');
  if (searchContext) {
    searchContext.hidden = !feedTerm || feedMode !== 'all';
    searchContext.querySelector('span').textContent = feedTerm ? `태그 검색 · ${feedTerm}` : '';
  }
  if (!locationIsEnabled() || (nearbyPosition && !positionIsFresh(nearbyPosition))) nearbyPosition = null;
  const version = ++feedRun;
  feedLoading = true;
  if (!more) {
    // 첫 페이지는 휴대폰 시계를 기준 시각으로 보내지 않아요. 휴대폰 시계가 서버보다 늦으면 방금 올린 카드가 빠지기 때문이에요.
    // 서버가 자기 시각을 쓰고, 다음 페이지 기준은 받은 카드 중 가장 최근 카드의 시각으로 정해요.
    feedCursor = null; feedSnapshot = null;
    nearbyOffset = 0; nearbySnapshot = null;
    if (detail.hidden) cache.clear();
    feedPages = 0;
    if (!quiet) { showFeedLoading(); banner('카드를 불러오는 중'); }
  } else list.querySelector('[data-more-feed]')?.remove();
  if (feedMode !== 'all' && !session?.user) {
    ready = true; feedLoading = false; banner('');
    state(list, feedMode === 'events' ? '대문에서 로그인하면 내 이벤트를 볼 수 있어요.'
      : '대문에서 로그인하면 메모함과 내 카드를 볼 수 있어요.'); updateComposer(); return true;
  }
  if (feedMode === 'all' && feedSort === 'nearby' && !nearbyPosition) {
    feedLoading = false; ready = true; banner('');
    const note = node('p', 'reply-empty', '위치를 확인하면 반경 30km 안의 카드를 가까운 순서로 볼 수 있어요.');
    const button = node('button', 'button primary', locationIsEnabled() ? '위치 확인' : '위치 켜기'); button.type = 'button';
    button.addEventListener('click', () => refreshNearbyPosition(button, version));
    list.replaceChildren(note, button); return true;
  }
  // Public cards load before location warm-up, which starts after first paint.
  let data, error;
  if (feedMode === 'events') {
    try { data = await feedWithinDeadline(noteRpc('list_my_events', {})); } catch (cause) { error = cause; }
  } else if (feedMode === 'all' && !feedTerm) {
    try {
      const pendingOpening = !more && !quiet && feedSort === 'latest' && !nearbyPosition
        ? window.OjjudaParkOpening?.take?.(session?.user?.id) : undefined;
      const opening = pendingOpening ? await feedWithinDeadline(pendingOpening) : undefined;
      if (version !== feedRun) return false;
      data = opening ? opening.data : await getFeedCards({ p_sort: feedSort === 'latest' ? 'recent' : feedSort,
        p_lat: nearbyPosition?.latitude ?? null, p_lon: nearbyPosition?.longitude ?? null,
        p_radius_m: 30000, p_limit: 20,
        p_cursor: nearbySnapshot ? { offset: nearbyOffset, snapshot: nearbySnapshot } : { offset: nearbyOffset } });
    } catch (cause) { error = cause; }
  } else {
    try { ({ data, error } = await feedWithinDeadline(filteredFeed())); } catch (cause) { error = cause; }
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
    // Retry one transient failure in place; never loop, overlap a newer load, or retry hidden screens.
    if (!more && !quiet && (error?.name === 'TimeoutError' || error?.code === '57014'
      || Number(error?.status) >= 500)) {
      feedRecoveryTimer = setTimeout(() => {
        feedRecoveryTimer = null;
        if (version === feedRun && !feedLoading && !feed.hidden && !document.hidden) {
          void loadFeed(false, true);
        }
      }, 1400);
    }
    updateComposer(); return false;
  }
  ready = true; banner(feedMode === 'all' && feedSort === 'nearby' ? '현재 위치 기준 · 반경 30km' : '');
  if (!more) {
    list.replaceChildren();
    let newest = null;
    for (const card of data || []) if (card?.created_at && (!newest || Date.parse(card.created_at) > Date.parse(newest))) newest = card.created_at;
    feedSnapshot = newest; nearbySnapshot = newest;
  }
  let shown = 0;
  for (const card of data || []) {
    if (!canDisplayTaggedCard(card)) continue;
    if (card.kind === 'event' && card.body == null) continue;
    shown++;
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
      } else list.append(cardElement(card, false, false, more || shown > 3));
    }
  }
  if (!more && !shown) state(list, feedMode === 'events' ? '아직 만든 이벤트가 없어요.' : feedTerm ? '검색 결과가 없어요.' : feedMode === 'saved'
    ? '저장한 카드가 없어요. 카드의 책갈피를 눌러 담아 보세요.' : feedMode === 'mine'
      ? '아직 작성한 카드가 없어요.' : feedSort === 'popular'
        ? '최근 7일에 올라온 카드가 없어요.' : feedSort === 'nearby'
          ? '현재 위치에서 30km 안에 공개된 카드가 없어요.' : '아직 카드가 없어요. 첫 카드를 써 보세요.');
  if (!more && !shown && feedMode === 'all' && feedSort === 'nearby') {
    const locate = node('button', 'button', '위치 다시 확인'); locate.type = 'button';
    locate.addEventListener('click', () => refreshNearbyPosition(locate, version));
    list.append(locate);
  }
  feedPages++;
  if (data?.length) feedCursor = data.at(-1);
  if (feedMode === 'all' && !feedTerm) nearbyOffset += data?.length || 0;
  if (feedMode !== 'events' && data?.length === 20) {
    const next = node('button', 'button', '더 보기'); next.type = 'button'; next.dataset.moreFeed = ''; list.append(next);
  }
  updateComposer();
  consumeInitialCard();
  if (!stack.length) resumeGuestWriting(null);
  // Location is optional; fetch it after cards have had time to paint.
  if (!more && !quiet && feedMode === 'all' && !feedTerm && feedSort !== 'nearby'
      && !nearbyPosition && !backgroundLocating && !document.hidden) {
    backgroundLocating = true;
    const locationEpoch = identityEpoch;
    const locateAfterPaint = () => {
      if (locationEpoch !== identityEpoch || version !== feedRun
          || !locationIsEnabled() || nearbyPosition || document.hidden || !detail.hidden) {
        backgroundLocating = false;
        return;
      }
      void positionIfAlreadyGranted().then(grantedPosition => {
        if (locationEpoch !== identityEpoch || version !== feedRun
            || !grantedPosition || nearbyPosition || !locationIsEnabled()) return;
        nearbyPosition = grantedPosition;
        quietLocatedReload();
      }).catch(() => {}).finally(() => { backgroundLocating = false; });
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => requestAnimationFrame(locateAfterPaint));
    } else setTimeout(locateAfterPaint, 0);
  }
  return true;
}
function locationErrorText(error) {
  if (typeof error?.code === 'string') return error.message;
  if (error?.code === 1) return '위치 권한을 허용한 뒤 다시 눌러 주세요.';
  if (error?.code === 2) return '휴대폰 위치를 켜고 다시 시도해 주세요.';
  if (error?.code === 3) return '위치 확인 시간이 지났어요. 다시 시도해 주세요.';
  return '위치를 확인하지 못했어요. 다시 시도해 주세요.';
}
async function refreshNearbyPosition(button, version) {
  const epoch = identityEpoch, label = button.textContent;
  button.disabled = true; button.textContent = '위치 확인 중…'; message('');
  try {
    const position = await currentPosition(true, true);
    if (version !== feedRun || epoch !== identityEpoch || feedMode !== 'all' || feedSort !== 'nearby') return;
    nearbyPosition = position;
    await loadFeed();
  } catch (error) {
    if (version === feedRun && epoch === identityEpoch) message(locationErrorText(error));
  } finally {
    if (button.isConnected) { button.disabled = false; button.textContent = label; }
  }
}
async function currentPosition(fresh = false, enable = false, signal) {
  const service = window.OjjudaLocation, userId = session?.user?.id;
  if (!authKnown || !userId || session.user.is_anonymous) throw Error('로그인 후 위치를 이용해 주세요.');
  if (!service?.authorizePosition) throw Error('위치 기능을 불러오지 못했어요. 새로고침해 주세요.');
  const choice = await service.preference(client, userId);
  const position = await service.readPosition({db:client,accountId:userId,fresh,allowDisabled:enable,signal,park:true});
  if (userId && userId !== session?.user?.id) throw Error('회원 정보를 다시 확인해 주세요.');
  if (enable && userId && !choice.enabled) await service.setPreference(client,userId,true,choice.version);
  return position;
}
function positionIsFresh(position) {
  return Number.isFinite(position?.capturedAt) && Date.now() - position.capturedAt < 120000;
}
async function positionIfAlreadyGranted() {
  if (!locationIsEnabled() || !navigator.geolocation || !navigator.permissions?.query) return null;
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    if (permission.state === 'granted') return await currentPosition();
  } catch { /* No implicit request when browser permissions cannot be inspected. */ }
  return null;
}
function consumeInitialCard() {
  if (initialParkCompose && authKnown && ready) { initialParkCompose = false; openComposer('memo'); }
  if (!initialCardId || !authKnown) return;
  const id = initialCardId; initialCardId = null;
  if (validCardId(id)) openCard(id);
}
function updateCardUrl(id = null, push = false) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('card', id); else url.searchParams.delete('card');
  const state = push
    ? { ...history.state, noteMy: false, noteNavigation: true, previousCardId: new URL(location.href).searchParams.get('card') }
    : { ...history.state, noteNavigation: false };
  const managed = window.OjjudaParkHistory?.isTransition?.() === true;
  history[push && !managed ? 'pushState' : 'replaceState'](state, '', url);
}

function showFeed(updateUrl = true, returnPoint = null) {
  feedReturnPoint = null;
  detailRun++; replyLoading = false; stack.length = 0;
  if (updateUrl) updateCardUrl();
  feed.hidden = false; detail.hidden = true;
  requestTagFit();
  const opener = returnPoint && list.querySelector(returnPoint.selector);
  opener?.focus({ preventScroll: true });
  window.scrollTo({ top: opener ? returnPoint.top : 0, behavior: 'auto' });
}
async function loadReplies(id, version, more = false) {
  if (more && replyLoading) return;
  replyLoading = true;
  const pageButton = more ? replies.querySelector('[data-more-replies]') : null;
  if (pageButton) pageButton.disabled = true;
  if (!more) {
    replyCursor = null;
    state(replies, '답글을 불러오는 중이에요.');
    replies.scrollLeft = 0;
  }
  let data, error;
  try {
    let request = filterSearchOnlyTags(query().from('public_cards').select(columns)
      .eq('kind', 'comment').eq('parent_id', id), feedTerm);
    const after = cursorFilter(replyCursor);
    if (after) request = request.or(after);
    ({ data, error } = await request.order('created_at', { ascending: false })
      .order('id', { ascending: false }).limit(30));
  } catch (cause) { error = cause; }
  if (version !== detailRun || stack.at(-1) !== id) return;
  replyLoading = false;
  pageButton?.remove();
  if (error) {
    console.warn('Note replies:', error);
    if (!more) state(replies, '답글을 불러오지 못했어요.');
    const retry = node('button', 'button', '다시 시도');
    retry.type = 'button'; retry.dataset.retryReplies = more ? 'more' : 'first'; replies.append(retry);
    return;
  }
  if (!more) replies.replaceChildren();
  for (const [index, card] of (data || []).entries()) {
    cache.set(card.id, card); replies.append(cardElement(card, true, false, more || index >= 2));
  }
  if (!more && !data?.length) state(replies, '아직 답글이 없어요.');
  if (data?.length) replyCursor = data.at(-1);
  if (data?.length === 30) {
    const next = node('button', 'button', '답글 더 보기');
    next.type = 'button'; next.dataset.moreReplies = ''; replies.append(next);
  }
}
async function renderDetail(opener = document.activeElement) {
  if (!client || !stack.length) return;
  const id = stack.at(-1), version = ++detailRun;
  if (!feed.hidden && list.contains(opener) && opener.dataset.open === id) {
    const control = opener.classList.contains('photo-open') ? '.photo-open' : '.card-actions button';
    feedReturnPoint = { selector: `${control}[data-open="${id}"]`, top: window.scrollY };
  }
  feed.hidden = true; detail.hidden = false;
  banner('');
  $('.replies').hidden = false;
  state(slot, '카드를 불러오는 중이에요.'); state(replies, '답글을 불러오는 중이에요.');
  $('#reply-count').textContent = '0';
  $('#detail [data-compose="reply"]').disabled = true;
  window.scrollTo({ top: 0, behavior: 'auto' });
  if (backdrop.hidden && management.hidden) $('.back-button').focus({ preventScroll: true });
  // Always recheck visibility: a saved card may have been blocked or hidden.
  let card, error;
  const position = positionIsFresh(nearbyPosition) ? nearbyPosition : null;
  try {
    card = await noteRpc('get_card', { p_id: id, p_lat: position?.latitude ?? null,
      p_lon: position?.longitude ?? null });
    if (version !== detailRun) return;
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
    state(slot, '카드를 불러오지 못했어요.'); state(replies, '');
    const retry = node('button', 'button', '카드 다시 불러오기');
    retry.type = 'button'; retry.dataset.retryCard = '';
    retry.onclick = () => { if (version === detailRun) void renderDetail(); };
    slot.append(retry);
    return;
  }
  if (!card) {
    cache.delete(id); $('#reply-count').textContent = '0';
    state(slot, '삭제되었거나 볼 수 없는 카드예요.'); state(replies, ''); return;
  }
  if (!canDisplayTaggedCard(card)) {
    cache.delete(id); $('#reply-count').textContent = '0';
    state(slot, '이 카드는 ‘19금’ 태그를 검색했을 때만 볼 수 있어요.'); state(replies, '');
    const search = node('button', 'button', '19금 태그 검색'); search.type = 'button';
    search.addEventListener('click', () => searchTagFn?.('19금')); slot.append(search);
    return;
  }
  ready = true;
  cache.set(id, card);
  if(initialKeepId===id){
    initialKeepId=null;const url=new URL(location.href);url.searchParams.delete('keep');history.replaceState(history.state,'',url);
    if(card.is_mine&&!card.permanent&&['memo','comment'].includes(card.kind))confirmPermanent(card);
  }
  const eventCard = card.kind === 'event';
  $('.replies').hidden = eventCard;
  $('#detail [data-compose="reply"]').hidden = eventCard;
  $('#detail [data-compose="reply"]').disabled = eventCard || (!!session?.user && !canWrite('comment'));
  $('#detail [data-compose="reply"]').dataset.replyTo = card.id;
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
      } else locate.href = noteLoginHref(card.id);
      slot.append(note, locate);
    }
    state(replies, '');
  } else {
    $('#reply-count').textContent = String(card.reply_count || 0);
    loadReplies(id, version);
    resumeGuestWriting(id);
  }
}
function openCard(id, opener) {
  if (!validCardId(id) || !authKnown) return;
  const alreadyLinked = new URL(location.href).searchParams.get('card') === id;
  stack.push(id); updateCardUrl(id, !alreadyLinked); renderDetail(opener);
}
function returnToParentCard() {
  const id = stack.at(-1);
  const parent = cache.get(id)?.parent_id;
  if (!validCardId(parent)) { goBack(); return; }
  if (history.state?.previousCardId === parent) { history.back(); return; }

  // Shared links and notifications can open a reply without visiting its parent.
  stack.splice(0, stack.length, parent);
  updateCardUrl(parent);
  void renderDetail();
}
function goBack() {
  if (history.state?.noteNavigation) { history.back(); return; }
  if (stack.length > 1) { stack.pop(); updateCardUrl(stack.at(-1)); renderDetail(); }
  else returnToFeed(true, feedReturnPoint);
}
function returnToFeed(updateUrl = true, returnPoint = null) {
  showFeed(updateUrl, returnPoint);
  if (feedDeferred) void loadFeed();
}
window.addEventListener('popstate', event => {
  if (window.OjjudaParkHistory?.handles?.(event.state)) return;
  const id = new URL(location.href).searchParams.get('card');
  if (validCardId(id)) {
    if (!authKnown) { initialCardId = id; return; }
    stack.length = 0; stack.push(id); void renderDetail();
  } else { initialCardId = null; returnToFeed(false, feedReturnPoint); }
});

function canWrite() {
  return !!noteState && !noteState.is_restricted;
}
function canReact(alreadySelected = false) {
  return alreadySelected || (!!noteState && !noteState.is_restricted);
}
function writingMessage() {
  if (!noteState) return '노트 운영 상태를 확인하는 중이에요';
  if (noteState.is_restricted) return `노트 이용이 제한되어 있어요${noteState.restriction_reason ? `: ${noteState.restriction_reason}` : ''}`;
  return '';
}
async function loadNoteState() {
  const run = ++noteStateRun, userId = session?.user?.id || null;
  try {
    const data = await noteRpc('get_note_state');
    if (run !== noteStateRun || (session?.user?.id || null) !== userId) return;
    noteState = data;
    const values = [data.is_restricted ? writingMessage() : ''].filter(Boolean);
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
  if (!canDisplayTaggedCard(card)) {
    cache.delete(card.id);
    for (const item of document.querySelectorAll('article[data-card-id]')) {
      if (item.dataset.cardId === card.id) item.remove();
    }
    if (stack.at(-1) === card.id) void renderDetail();
    return;
  }
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
  const url = new URL('/park/', location.origin); url.searchParams.set('card', cardId);
  const shareText = 'https://ojjuda.com';
  const run = showManagement('카드 공유'), epoch = identityEpoch, userId = session?.user?.id || null;
  let sharing = false, feedbackRun = 0;
  const current = () => run === managementRun && epoch === identityEpoch && !management.hidden
    && (session?.user?.id || null) === userId && cache.get(cardId)?.id === cardId;
  const card = cache.get(cardId);
  const kakaoConfigured = card?.kind !== 'event' && !!window.OjjudaKakaoShare?.isConfigured();
  managementBody.append(node('p', 'management-help', card?.kind === 'event'
    ? '이 링크로 카드를 열 수 있어요.' : kakaoConfigured
      ? '카카오톡에서는 카드 이미지와 ‘카드 보기’ 버튼을 함께 보내요.'
      : '앱에 따라 사진만 전달될 수 있어요. 카드 링크도 함께 복사해요.'));
  const label = node('label', 'field-label', '카드 링크'); label.htmlFor = 'note-share-url';
  const input = node('input', 'note-share-url'); input.id = 'note-share-url'; input.type = 'url';
  input.value = url.href; input.readOnly = true; input.addEventListener('focus', () => input.select());
  managementBody.append(label, input);
  const copy = managementButton('링크 복사', async () => {
    if (!current() || sharing) return;
    const feedback = ++feedbackRun;
    try { await navigator.clipboard.writeText(url.href); if (current() && feedback === feedbackRun) managementMessage.textContent = '링크를 복사했어요.'; }
    catch { if (current() && feedback === feedbackRun) { input.focus(); input.select(); managementMessage.textContent = '선택된 링크를 복사해 주세요.'; } }
  }); copy.dataset.cardShareAction = 'copy'; managementFooter.append(copy);
  // Event visibility depends on location. Keep its existing gated link share.
  if (card?.kind === 'event') {
    if (navigator.share) {
      const share = managementButton('다른 앱으로 공유', async () => {
        if (!current() || sharing) return;
        sharing = true; share.disabled = true; ++feedbackRun;
        try { await navigator.share({ title: '오쭈다 공원', text: shareText, url: url.href }); }
        catch (error) { if (current() && error.name !== 'AbortError') managementMessage.textContent = '링크 복사를 이용해 주세요.'; }
        finally { if (current()) { sharing = false; share.disabled = false; } }
      }, true);
      share.dataset.cardShareAction = 'share'; managementFooter.append(share);
    }
    return;
  }
  let file = null, attempt = 0;
  let kakao = null, preparedKakao = null, kakaoRun = 0;
  if (kakaoConfigured) {
    pendingCardShareCleanup = () => {
      ++kakaoRun;
      preparedKakao?.dispose(); preparedKakao = null;
    };
    kakao = managementButton('카카오톡 공유', () => {
      if (!current() || sharing || kakao.disabled || !file) return;
      const feedback = ++feedbackRun;
      if (preparedKakao) {
        // Reach the SDK in this fresh click; awaiting the image upload here
        // would lose the activation needed for Kakao's popup or app handoff.
        try {
          preparedKakao.send();
          preparedKakao.dispose(); preparedKakao = null;
          kakao.textContent = '다시 카카오톡 공유';
          managementMessage.textContent = '카카오톡에서 받는 사람을 선택해 주세요.';
        } catch (error) {
          console.warn('Kakao card share:', error);
          preparedKakao?.dispose(); preparedKakao = null;
          kakao.textContent = '카카오톡 공유';
          managementMessage.textContent = '카카오톡을 열지 못했어요. 다시 시도해 주세요.';
        }
        return;
      }
      const preparing = ++kakaoRun;
      const active = () => current() && preparing === kakaoRun;
      sharing = true; kakao.disabled = true; kakao.textContent = '카카오톡 준비 중…';
      managementMessage.textContent = '보낼 카드를 준비하고 있어요.';
      const title = Array.from(String(cache.get(cardId)?.body || '').replace(/\s+/g, ' ').trim()).slice(0, 80).join('') || '공원 카드';
      window.OjjudaKakaoShare.prepare(file, { cardUrl: url.href, title, isCurrent: active }).then(prepared => {
        if (!active()) { prepared.dispose(); return; }
        preparedKakao = prepared; kakao.textContent = '카카오톡으로 보내기';
        if (feedback === feedbackRun) managementMessage.textContent = '준비됐어요. ‘카카오톡으로 보내기’를 눌러 주세요.';
      }).catch(error => {
        if (!active()) return;
        console.warn('Kakao card preparation:', error);
        kakao.textContent = '카카오톡 공유';
        if (feedback === feedbackRun) managementMessage.textContent = /kakao_(not_configured|key_conflict)/.test(error.message)
          ? '카카오톡 공유 설정을 확인해야 해요. 지금은 링크 복사를 이용해 주세요.'
          : '카카오톡 공유를 준비하지 못했어요. 다시 시도하거나 링크를 복사해 주세요.';
      }).finally(() => { if (active()) { sharing = false; kakao.disabled = false; } });
    }, true);
    kakao.dataset.cardShareAction = 'kakao'; kakao.disabled = true; managementFooter.append(kakao);
  }
  if (navigator.share) {
    const link = managementButton('링크만 공유', async () => {
      if (!current() || sharing) return;
      sharing = true; link.disabled = true; ++feedbackRun; managementMessage.textContent = '';
      try { await navigator.share({ title: '오쭈다 공원', text: shareText, url: url.href }); }
      catch (error) { if (current() && error.name !== 'AbortError') managementMessage.textContent = '링크 복사를 이용해 주세요.'; }
      finally { if (current()) { sharing = false; link.disabled = false; } }
    });
    link.dataset.cardShareAction = 'link'; managementFooter.append(link);
  }
  const fileShareData = value => {
    if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return null;
    const title = Array.from(String(cache.get(cardId)?.body || '').replace(/\s+/g, ' ').trim()).slice(0, 80).join('') || '공원 카드';
    // Put the card link in the caption itself: some file-sharing apps drop the
    // separate URL field. Do not send it twice in both text and url.
    const combined = { files: [value], title, text: `${url.href}\n${shareText}` };
    try { if (navigator.canShare(combined)) return combined; } catch {}
    const imageOnly = { files: [value] };
    try { if (navigator.canShare(imageOnly)) return imageOnly; } catch {}
    return null;
  };
  const action = managementButton('다른 앱으로 공유', () => {
    if (!current() || sharing || action.disabled) return;
    if (!file) { void prepareImage(); return; }
    const payload = fileShareData(file), feedback = ++feedbackRun;
    let shareFailed = false;
    managementMessage.textContent = '';
    // Start copying inside the same click, before share() consumes activation.
    // Never await clipboard access: a prompt, denial or slow clipboard must not
    // prevent the native share sheet from opening immediately.
    let copied;
    try { copied = navigator.clipboard.writeText(url.href); }
    catch (error) { copied = Promise.reject(error); }
    Promise.resolve(copied).then(() => {
      if (current() && feedback === feedbackRun && !shareFailed)
        managementMessage.textContent = '링크도 복사했어요. 사진만 전달되면 붙여넣어 주세요.';
    }, () => {
      if (current() && feedback === feedbackRun && !shareFailed)
        managementMessage.textContent = '링크가 빠지면 링크 복사를 눌러 주세요.';
    });
    if (!payload) {
      const download = node('a'), objectUrl = URL.createObjectURL(file);
      download.href = objectUrl; download.download = file.name; download.hidden = true;
      document.body.append(download); download.click(); download.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000); return;
    }
    sharing = true; action.disabled = true;
    let shared;
    // No asynchronous preparation here: preserve the button's user activation.
    try { shared = navigator.share(payload); }
    catch (error) { shared = Promise.reject(error); }
    Promise.resolve(shared).catch(error => {
      if (current() && feedback === feedbackRun && error.name !== 'AbortError') {
        shareFailed = true;
        managementMessage.textContent = '공유하지 못했어요. 다시 시도하거나 링크만 공유해 주세요.';
      }
    }).finally(() => { if (current()) { sharing = false; action.disabled = false; } });
  }, !kakaoConfigured);
  action.dataset.cardShareAction = 'share'; action.disabled = true; managementFooter.append(action);
  async function prepareImage() {
    const preparing = ++attempt;
    file = null; action.disabled = true; action.dataset.cardShareAction = 'share'; ++feedbackRun;
    if (kakao) kakao.disabled = true;
    action.textContent = '카드 준비 중…'; managementMessage.textContent = '';
    const active = () => current() && preparing === attempt;
    try {
      if (!active() || !['memo', 'comment'].includes(cache.get(cardId)?.kind)) throw new Error('card_image_unavailable');
      const photo = [...document.querySelectorAll(`article[data-card-id="${cardId}"] .photo`)].find(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden';
      });
      if (!photo || !window.OjjudaCardShareImage) throw new Error('card_image_unavailable');
      revealFeedBackground(photo);
      const prepared = await window.OjjudaCardShareImage.prepare(photo, {
        filename: `ojjuda-card-${cardId}.png`, isCurrent: active, beforeCapture: refreshExpandedBodies
      });
      if (!active()) return;
      file = prepared;
      const supported = !!fileShareData(file);
      action.dataset.cardShareAction = supported ? 'share' : 'save';
      action.textContent = supported ? '다른 앱으로 공유' : '카드 이미지 저장'; action.disabled = false;
      if (kakao) kakao.disabled = false;
    } catch (error) {
      if (!active()) return;
      console.warn('Card image preparation:', error);
      managementMessage.textContent = '카드 이미지를 준비하지 못했어요. 다시 시도해 주세요.';
      action.dataset.cardShareAction = 'retry'; action.textContent = '다시 시도'; action.disabled = false;
    }
  }
  void prepareImage();
}
function selectCollection(mode, preserveMessage = false) {
  // Collection tabs do not show the tag field. Clear the tag filter
  // so saved and own cards do not appear empty without an explanation.
  if (mode !== 'all') {
    feedTerm = '';
    tagTabReset?.();
  }
  feedMode = mode; if (!preserveMessage) message(''); showFeed();
  $('#feed-title').textContent = mode === 'all' ? '공원 카드' : mode === 'events' ? '내 이벤트' : mode === 'mine' ? '내 카드' : '보관함';
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
function setCardLocationSwitch(on, status, pending = false, failed = false) {
  const button = $('#card-location-button');
  button.setAttribute('aria-checked', String(on));
  button.querySelector('.note-switch-state').textContent = pending ? '확인 중' : on ? '켜짐' : '꺼짐';
  const statusElement = $('#card-location-status');
  statusElement.textContent = status;
  statusElement.hidden = !failed;
  button.title = status;
  button.setAttribute('aria-busy', String(pending));
}
function installFeatures() {
  const nickname = $('input[name="identity"][value="nickname"]');
  nickname.disabled = false; nickname.closest('label').classList.remove('disabled-choice');
  nickname.closest('label').title = '선택하면 계정 닉네임이 표시돼요.';
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
  clearSearch.addEventListener('click', () => {
    feedTerm = ''; tagInput.value = ''; loadFeed();
  });
  searchContext.append(searchLabel, clearSearch); sorts.after(searchContext);
  let tagTabOn = false;
  const syncSortButtons = () => sorts.querySelectorAll('button').forEach(item => {
    const selected = tagTabOn ? item.dataset.sort === 'tag' : item.dataset.sort === feedSort;
    item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected));
  });
  // 태그 탭: 태그로 카드 찾기 + 요즘 많이 쓰는 태그
  const tagPanel = node('div', 'note-tag-panel'); tagPanel.id = 'note-tag-panel'; tagPanel.hidden = true;
  const tagForm = node('form', 'note-tag-form');
  const tagInput = node('input'); tagInput.type = 'search'; tagInput.maxLength = 120; tagInput.placeholder = '#태그로 찾기 (공백·쉼표로 구분)'; tagInput.setAttribute('aria-label', '태그로 찾기, 공백이나 쉼표로 구분');
  const tagGo = node('button', 'button primary', '찾기'); tagGo.type = 'submit';
  tagForm.append(tagInput, tagGo);
  const tagChips = node('div', 'note-tag-chips'); tagChips.setAttribute('aria-label', '요즘 많이 쓰는 태그');
  tagPanel.append(tagForm, tagChips); sorts.after(tagPanel);
  let popularTagsAt = 0, pendingTagEpoch = null;
  const loadPopularTags = async () => {
    const epoch = identityEpoch;
    if (!authKnown || pendingTagEpoch === epoch) return;
    if (Date.now() - popularTagsAt < 300000 && tagChips.childElementCount) return;
    pendingTagEpoch = epoch;
    try {
      const { data, error } = await filterSearchOnlyTags(query().from('public_cards').select('tags').eq('kind', 'memo'))
        .order('created_at', { ascending: false }).limit(200);
      if (epoch !== identityEpoch) return;
      if (error) throw error;
      const count = new Map();
      for (const row of data || []) for (const t of Array.isArray(row.tags) ? row.tags : []) count.set(t, (count.get(t) || 0) + 1);
      const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 12);
      tagChips.replaceChildren(node('span', 'note-tag-chips-title', top.length ? '요즘 많이 쓰는 태그' : '아직 태그가 달린 카드가 없어요'),
        ...top.map(([t]) => { const chip = node('button', 'note-tag-chip', `#${t}`); chip.type = 'button'; chip.addEventListener('click', () => searchTag(t)); return chip; }));
      popularTagsAt = Date.now();
    } catch (error) {
      if (epoch !== identityEpoch) return;
      console.warn('Note popular tags:', error);
      const retry = node('button', 'note-tag-chip', '인기 태그 다시 불러오기');
      retry.type = 'button'; retry.addEventListener('click', loadPopularTags);
      tagChips.replaceChildren(retry);
    } finally {
      if (pendingTagEpoch === epoch) pendingTagEpoch = null;
    }
  };
  resetPopularTags = () => {
    popularTagsAt = 0;
    tagChips.replaceChildren();
    if (!tagPanel.hidden) setTimeout(() => {
      if (!tagPanel.hidden && !feed.hidden && feedMode === 'all') void loadPopularTags();
    }, 0);
  };
  const openTagTab = () => { tagTabOn = true; tagPanel.hidden = false; syncSortButtons(); void loadPopularTags(); };
  const closeTagTab = () => { tagTabOn = false; tagPanel.hidden = true; tagInput.value = ''; };
  const searchTag = tag => {
    const t = tagList(tag).join(' '); if (!t) return;
    tagInput.value = t;
    feedTerm = t; if (feedSort === 'nearby') feedSort = 'latest';
    openTagTab();
    if (feedMode !== 'all' || !detail.hidden) selectCollection('all'); else loadFeed();
  };
  searchTagFn = searchTag;
  tagTabReset = () => { closeTagTab(); syncSortButtons(); };
  tagForm.addEventListener('submit', event => { event.preventDefault(); searchTag(tagInput.value); });
  tagInput.addEventListener('search', () => { if (!tagInput.value && feedTerm) { feedTerm = ''; loadFeed(); } });
  const selectSort = (sort, { focusTag = false } = {}) => {
    if (sort === 'tag') {
      if (!tagTabOn) openTagTab();
      if (focusTag) tagInput.focus({ preventScroll: true });
      return;
    }
    const wasTag = tagTabOn; closeTagTab();
    const clearedSearch = (sort === 'nearby' || wasTag) && Boolean(feedTerm);
    if (sort === 'nearby' || wasTag) feedTerm = '';
    if (feedSort === sort && !clearedSearch && !wasTag) return;
    feedSort = sort; syncSortButtons(); loadFeed();
  };
  let feedSwipe = null;
  for (const [sort, label] of [['latest', '최신'], ['popular', '인기'], ['nearby', '근처'], ['tag', '태그']]) {
    const button = node('button', sort === feedSort ? 'selected' : '', label); button.type = 'button';
    button.dataset.sort = sort; button.setAttribute('aria-pressed', String(sort === feedSort));
    button.addEventListener('click', () => {
      if (feedSwipe) feedSwipe.goTo(sort, { focusTag: true });
      else selectSort(sort, { focusTag: true });
    }); sorts.append(button);
  }
  if (window.OjjudaFeedSwipe) {
    const viewport = node('div', 'note-feed-viewport');
    const page = node('div', 'note-feed-page');
    sorts.after(viewport); viewport.append(page); page.append(tagPanel, searchContext, list);
    feedSwipe = window.OjjudaFeedSwipe.create({ root: feed, tabs: sorts, viewport, page,
      getActive: () => tagTabOn ? 'tag' : feedSort, select: selectSort,
      enabled: () => feedMode === 'all' });
  }
  $('#event-photo-file').addEventListener('change', event => {
    const file = event.target.files?.[0]; event.target.value = '';
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
    if (busy || draftLoading || backdrop.hidden || editingId || kind === 'event' || composerUserId !== session?.user?.id) return;
    const userId=session.user.id, service=window.OjjudaLocation;
    if(writingLocationController&&!locationIsEnabled()){
      locationRun++;writingLocationController.abort();writingLocationController=null;writingPosition=null;
      setCardLocationSwitch(false,'위치 확인을 취소했어요. 공원과 파장은 꺼진 상태예요.');updateComposer();return;
    }
    if (!service) { setCardLocationSwitch(false,'위치 기능을 불러오지 못했어요. 새로고침해 주세요.',false,true); return; }
    try {
      const choice=await service.preference(client,userId);
      if (composerUserId!==userId || session?.user?.id!==userId || backdrop.hidden) return;
      if (choice.enabled) {
        $('#card-location-button').disabled=true;
        await service.setPreference(client,userId,false,choice.version);
        rememberComposerSetting('locationEnabled',false);
        locationRun++; writingLocationController?.abort();writingPosition=null;nearbyPosition=null;
        setCardLocationSwitch(false,'공원과 파장의 위치를 껐어요.');updateComposer();
      } else await loadWritingLocation(composerRun,true);
    } catch(error) {
      if(session?.user?.id===userId&&!backdrop.hidden)setCardLocationSwitch(locationIsEnabled(),locationErrorText(error),false,true);
    }finally{if(session?.user?.id===userId)$('#card-location-button').disabled=busy||draftLoading;}
  });
  $('#compose-box-transparency')?.addEventListener('input', event => {
    setBoxTransparency(event.target.value);
    rememberComposerSetting('boxTransparency', Number(event.target.value));
    applyComposeStyle(); recordDraft();
  });
  const transparencyNumber = $('#compose-box-transparency-value');
  transparencyNumber?.addEventListener('input', event => {
    const value = event.target.valueAsNumber;
    if (!Number.isInteger(value) || value < 0 || value > 100) return;
    setBoxTransparency(value); rememberComposerSetting('boxTransparency', value);
    applyComposeStyle(); recordDraft();
  });
  transparencyNumber?.addEventListener('change', event => {
    setBoxTransparency(Math.max(0, Math.min(100, Number(event.target.value))));
    rememberComposerSetting('boxTransparency', Number(event.target.value));
    applyComposeStyle(); recordDraft();
  });
  for (const [selector, setting] of [['#compose-font', 'font'], ['#compose-size', 'size'], ['#compose-effect', null]]) {
    $(selector).addEventListener('change', event => {
      if (setting === 'font' && SELF_HOSTED_FONTS.includes(event.target.value)) {
        // A newly selected font wins over a previously purchased font.
        // Keep the member's sticker, effect and ownership untouched.
        const decorations = window.OjjudaDecorations?.styleFields?.();
        if (decorations?.shopFont && decorations.shopFont !== 'none')
          window.OjjudaDecorations?.setStyle?.({ ...decorations, shopFont: 'none' });
      }
      if (setting) rememberComposerSetting(setting, event.target.value);
      applyComposeStyle(); recordDraft();
    });
  }
  // Run before the decoration control dispatches its preview update, so the
  // last font explicitly chosen by the member is also the one saved.
  document.addEventListener('change', event => {
    const selected = event.target;
    if (backdrop.hidden || !selected?.matches?.('[data-shop-style="Font"]')
      || !['book', 'letter', 'poster'].includes(selected.value)) return;
    const font = $('#compose-font');
    if (!SELF_HOSTED_FONTS.includes(font.value)) return;
    font.value = 'default';
    rememberComposerSetting('font', 'default');
  }, true);
  for (const selector of ['#event-radius', '#event-hours']) $(selector).addEventListener('input', () => { updateEventPrice(); recordDraft(); });
}
function installStyleChoices() {
  for (const field of document.querySelectorAll('[data-color-field]')) {
    const group = field.dataset.colorField;
    const labelText = field.querySelector('legend').textContent;
    const row = field.querySelector('.note-color-choices');
    for (const [code, choice] of [['default', { label: '없음' }], ...Object.entries(COLOR_PALETTE)]) {
      const label = node('label', 'note-color-choice'); label.dataset.color = code;
      label.title = `${labelText}: ${choice.label}`;
      if (choice.solid) label.style.setProperty('--swatch', group === 'boxColor' ? choice.deep || choice.solid : choice.solid);
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
  installPhotoGroups($('#photo-groups'), group => {
    photoPage = photoPageFor(group.first); renderPhotoPage();
  });
  const pageJump = $('#photo-page-jump');
  pageJump.addEventListener('change', () => { photoPage = Number(pageJump.value); renderPhotoPage(); });
  $('#photo-gallery-toggle').addEventListener('click', () => {
    const gallery = $('#photo-gallery');
    gallery.hidden = !gallery.hidden;
    $('#photo-gallery-toggle').setAttribute('aria-expanded', String(!gallery.hidden));
    if (!gallery.hidden) { updateFeaturedPhoto(); renderPhotoPage(); }
  });
  $('#photo-prev').addEventListener('click', () => { photoPage--; renderPhotoPage(); });
  $('#photo-next').addEventListener('click', () => { photoPage++; renderPhotoPage(); });
}
function setColorChoice(group, code) {
  const choices = document.getElementsByName(group);
  const chosen = [...choices].find(choice => choice.value === code) || [...choices].find(choice => choice.value === 'default');
  if (chosen) chosen.checked = true;
}
function updatePaidSubmit() {
  submit.classList.toggle('ju-paid-action', !editingId && (kind === 'event' || !!selectedPhotoKey && !activePhotoEntitlement(selectedPhotoKey)));
}
function updateFeaturedPhoto() {
  updatePaidSubmit();
  const selected = photoAssetKey(selectedPhotoKey);
  const name = selected ? photoName(selected, '제공 배경') : '기본 배경 무작위';
  const ownedUntil = selected && activePhotoEntitlement(selected);
  const price = selected ? ownedUntil ? `구매한 배경 · ${dateLabel(ownedUntil)}까지 사용` : '배경 이용권 · 10 ZU / 1개월' : '무료 · 이 배경으로 등록';
  const featured = $('#photo-featured-image'), key = selected || photoAssetKey(backgroundKey);
  if (key) featured.src = `/note/assets/${key}.jpg`;
  else featured.removeAttribute('src');
  $('#photo-featured-image').alt = selected ? `${name} 미리보기` : '기본 배경 미리보기';
  $('#photo-featured-name').textContent = name;
  $('#photo-featured-detail').textContent = price;
  for (const id of ['photo-featured-detail', 'photo-featured-badge', 'photo-selection']) $('#' + id).classList.toggle('ju-paid-price', !!selected && !ownedUntil);
  $('#photo-featured-badge').textContent = selected ? ownedUntil ? '사용 중' : '선택됨' : '무료';
  $('#photo-featured-badge').classList.toggle('is-selected', !!selected);
  $('#photo-selection').textContent = selected ? ownedUntil ? `${name} 사용 중 · ${dateLabel(ownedUntil)}까지 추가 결제 없이 사용` : `${name} 선택됨 · 10 ZU / 1개월` : '기본 배경 무작위 · 무료';
}
function renderPhotoPage() {
  const grid = $('#photo-grid'); grid.replaceChildren();
  const first = PHOTO_FIRST + photoPage * PHOTO_PAGE_SIZE;
  const group = photoGroupFor(first);
  const startPage = photoPageFor(group.first), endPage = photoPageFor(group.last);
  const pageJump = $('#photo-page-jump');
  if (pageJump.dataset.group !== String(group.first)) {
    pageJump.dataset.group = String(group.first);
    pageJump.replaceChildren();
    for (let page = startPage; page <= endPage; page++) {
      const from = (page - startPage) * PHOTO_PAGE_SIZE + 1;
      const to = Math.min(from + PHOTO_PAGE_SIZE - 1, group.last - group.first + 1);
      const option = node('option', '', `${page - startPage + 1} · ${from}–${to}`);
      option.value = String(page); pageJump.append(option);
    }
  }
  markPhotoGroup($('#photo-groups'), group);
  for (let number = first; number <= Math.min(group.last, first + PHOTO_PAGE_SIZE - 1); number++) {
    const key = String(number), title = photoName(key);
    const ownedUntil = activePhotoEntitlement(key);
    const accessLabel = ownedUntil ? `구매함 · ${dateLabel(ownedUntil)}까지 사용` : '구매·갱신 · 10 ZU / 1개월';
    const tile = node('label', 'note-photo-tile' + (ownedUntil ? '' : ' ju-paid-choice')); tile.title = `${title} · ${accessLabel}`;
    const input = node('input'); input.type = 'radio'; input.name = 'photo-choice'; input.value = key;
    input.disabled = busy || draftLoading;
    input.checked = selectedPhotoKey === key; input.setAttribute('aria-label', `${title}, ${accessLabel}`);
    input.addEventListener('change', () => {
      selectedPhotoKey = key; updateFeaturedPhoto();
      applyComposeStyle(); recordDraft();
    });
    const img = photoThumbnail(key);
    const caption = node('span', 'note-photo-tile-caption', title);
    const mark = node('span', 'note-photo-tile-mark', '✓'); mark.setAttribute('aria-hidden', 'true');
    tile.append(input, img, caption, mark); grid.append(tile);
  }
  $('#photo-page-status').textContent = `${photoPage - startPage + 1} / ${endPage - startPage + 1}`;
  pageJump.value = String(photoPage);
  $('#photo-prev').disabled = busy || draftLoading || photoPage === startPage;
  $('#photo-next').disabled = busy || draftLoading || photoPage === endPage;
}

let fontBeforeConversion = 'default';
function toggleCalligraphy() {
  if (busy || draftLoading) return;
  if (isGuestComposer()) { loginForComposer(true); return; }
  if (!session?.user || backdrop.hidden) return;
  const font = $('#compose-font');
  if (font.value === 'calligraphy') font.value = fontBeforeConversion;
  else { fontBeforeConversion = font.value; font.value = 'calligraphy'; }
  font.dispatchEvent(new Event('change', { bubbles: true }));
}
function loginForComposer(convert) {
  if (busy || !isGuestComposer()) return;
  try {
    sessionStorage.setItem(guestReturnKey, JSON.stringify({
      body: text.value, parent: parentId, convert, requestId: publishRequestId, backgroundKey,
      until: Date.now() + 15 * 60_000
    }));
  } catch {
    if (text.value && !confirm('이 브라우저에서는 로그인 후 글을 이어 쓸 수 없어요. 로그인할까요?')) return;
  }
  (parkEmbedded ? parent : window).location.assign(noteLoginHref(parentId));
}
function resumeGuestWriting(parent) {
  if (!guestReturn || guestReturn.parent !== parent || !authKnown || !backdrop.hidden) return;
  const pending = guestReturn;
  guestReturn = null;
  if (pending.until > Date.now()) void openComposer(parent ? 'reply' : 'memo', null, parent, pending);
}
function currentStyle() {
  if (isGuestComposer()) return {};
  return { ...window.OjjudaDecorations?.styleFields(), font: $('#compose-font').value, size: $('#compose-size').value, theme: $('#compose-theme').value,
    effect: $('#compose-effect').value,
    textColor: $('input[name="textColor"]:checked')?.value || 'default',
    boxColor: $('input[name="boxColor"]:checked')?.value || 'default',
    boxTransparency: Number($('#compose-box-transparency')?.value ?? 25) };
}
function chosenPhoto() { return selectedPhotoKey || 'plain'; }
function randomDefaultBackground() {
  return String(PHOTO_FIRST + Math.floor(Math.random() * (PHOTO_LAST - PHOTO_FIRST + 1)));
}
async function loadGuestBackground(requestId, run, epoch) {
  let key;
  try {
    key = photoAssetKey(await noteRpc('guest_card_background', { p_request_id: requestId }));
  } catch { /* A guest can still publish with the same request ID while the preview is offline. */ }
  if (run !== composerRun || epoch !== identityEpoch || backdrop.hidden || backgroundKey !== null) return;
  if (!key && !composerUserId) return;
  backgroundKey = key || randomDefaultBackground();
  updateFeaturedPhoto();
  if (!selectedPhotoKey) setPhotoBackground($('.compose-photo'), backgroundKey);
  if (composeMessage.textContent === '배경은 등록할 때 자동으로 정해져요.') updateComposer();
}
function clearEventPhoto() {
  eventPhotoRun++;
  if (eventPhotoPreviewUrl) URL.revokeObjectURL(eventPhotoPreviewUrl);
  eventPhotoPreviewUrl = null; eventPhotoBlob = null; eventPhotoRequestId = null;
  eventPhotoPreparing = false; eventPhotoError = ''; eventHadPhoto = false; eventPhotoRemove = false; eventCurrentPhotoUrl = null;
  $('#event-photo-file').value = '';
  $('#event-photo-clear').hidden = true;
  const status = $('#event-photo-status');
  status.textContent = 'JPG·PNG·WebP · 10MB 이하 · 추가 ZU 없음';
  status.classList.remove('is-error');
  if (kind === 'event') { applyComposeStyle(); updateComposer(); }
}
async function prepareEventPhoto(file, maxBytes = 10 * 1024 * 1024) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > maxBytes)
    throw new Error(`JPG·PNG·WebP 사진을 ${Math.round(maxBytes / 1048576)}MB 이하로 골라 주세요.`);
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
    const blob = await prepareEventPhoto(file, 10 * 1024 * 1024);
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
  if (photo === null) preview.style.backgroundImage = 'none';
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
  $('#event-price').textContent = valid ? `${radius}km × ${hours}시간 = ${(100 * radius * hours).toLocaleString('ko-KR')} ZU` : '반경 1~30km, 시간 1~24시간을 정수로 입력해 주세요.';
  if (kind === 'event' && !editingId) submit.textContent = valid ? `${(100 * radius * hours).toLocaleString('ko-KR')} ZU 결제 후 등록` : '범위와 시간을 확인해 주세요';
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
    || typeof content.body !== 'string' || maskedTextLength(content.body) > 200
    || typeof content.tags !== 'string' || content.tags.length > 120
    || !content.style || typeof content.style !== 'object') {
    clearLocalComposer(); return false;
  }
  text.value = content.body; tags.value = initialComposerTags(content.tags); manualTags = tagList(tags.value); rejectedTags = new Set(); autoTagsNow = [];
  backgroundKey = photoAssetKey(content.backgroundKey) || backgroundKey;
  window.OjjudaDecorations?.setStyle(content.style);
  $('#compose-font').value = FONT_CODES.includes(content.style.font) ? content.style.font : 'default';
  $('#compose-size').value = ['large', 'small'].includes(content.style.size) ? content.style.size : 'normal';
  $('#compose-theme').value = ['rose', 'night'].includes(content.style.theme) ? content.style.theme : 'plain';
  $('#compose-effect').value = EFFECT_CODES.includes(content.style.effect) ? content.style.effect : 'none';
  for (const group of ['textColor', 'boxColor']) setColorChoice(group, content.style[group]);
  setBoxTransparency(content.style.boxTransparency);
  if (editingId) $(`input[name="identity"][value="${content.identity === 'nickname' ? 'nickname' : 'anonymous'}"]`).checked = true;
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
  $('.composer').dataset.mode = kind === 'memo' ? 'memo-new' : kind;
  $('#note-photo-pick').hidden = kind !== 'memo';
  text.value = content.body; tags.value = initialComposerTags(content.tags); manualTags = tagList(tags.value); rejectedTags = new Set(); autoTagsNow = [];
  const style = content.style && typeof content.style === 'object' ? content.style : {};
  window.OjjudaDecorations?.setStyle(style);
  $('#compose-font').value = FONT_CODES.includes(style.font) ? style.font : 'default';
  $('#compose-size').value = ['large', 'small'].includes(style.size) ? style.size : 'normal';
  $('#compose-theme').value = ['rose', 'night'].includes(style.theme) ? style.theme : 'plain';
  $('#compose-effect').value = EFFECT_CODES.includes(style.effect) ? style.effect : 'none';
  for (const group of ['textColor', 'boxColor']) setColorChoice(group, style[group]);
  setBoxTransparency(style.boxTransparency);
  selectedPhotoKey = kind === 'memo' ? photoAssetKey(content.photo_key) : null;
  $('input[name="photo-choice"][value="plain"]').checked = !selectedPhotoKey;
  updateFeaturedPhoto();
  if (selectedPhotoKey) photoPage = photoPageFor(selectedPhotoKey);
  applyComposeStyle();
  $('#compose-title').textContent = kind === 'comment' ? '답글 카드 쓰기' : '새 카드 쓰기';
  $('#compose-context').textContent = kind === 'comment' ? replyContext() : '사진 위에 마음을 적어 주세요.';
  updateComposer();
  if (kind === 'comment') void refreshReplyArchiveNotice(parentId, composerRun);
}
function recordDraft() { /* 작성 중인 글은 저장하지 않아요. */ }
function setComposerInputs() {
  const disabled = busy || draftLoading;
  text.disabled = disabled; tags.disabled = disabled;
  $('#card-location-button').disabled = disabled;
  for (const selector of ['#compose-font', '#compose-size', '#compose-effect', '#compose-box-transparency', '#compose-box-transparency-value', '#event-select-center', '#event-radius', '#event-hours', '#photo-gallery-toggle', '#photo-page-jump']) { const input = $(selector); if (input) input.disabled = disabled; }
  const pageGroup = photoGroupFor(PHOTO_FIRST + photoPage * PHOTO_PAGE_SIZE);
  $('#photo-prev').disabled = disabled || photoPage === photoPageFor(pageGroup.first);
  $('#photo-next').disabled = disabled || photoPage === photoPageFor(pageGroup.last);
  $('#photo-groups').querySelectorAll('button').forEach(button => { button.disabled = disabled; });
  $('#event-photo-file').disabled = disabled || eventPhotoPreparing;
  $('#event-photo-clear').disabled = disabled || eventPhotoPreparing;
  $('#card-photo-file').disabled = disabled;
  $('#card-photo-remove').disabled = disabled;
  document.querySelectorAll('.note-color-choice input, input[name="photo-choice"]').forEach(input => { input.disabled = disabled; });
  document.querySelectorAll('input[name="identity"]').forEach(input => { input.disabled = disabled; });
  syncComposerTools();
}
function syncComposerTools() {
  if (!composerTools) return;
  const style = currentStyle();
  composerTools.sync({
    guest: isGuestComposer(), disabled: busy || draftLoading,
    locationRequired: !editingId && (kind === 'event' ? !validEventPosition() : !writingPosition),
    selected: {
      photo: !!(selectedPhotoKey || cardPhotoBlob || cardPhotoEditPath || eventPhotoPreviewUrl || eventCurrentPhotoUrl),
      font: style.font !== 'default' || style.size !== 'normal' || (style.shopFont && style.shopFont !== 'none'),
      color: style.textColor !== 'default',
      box: style.boxColor !== 'default' || style.boxTransparency !== 25,
      effect: style.effect !== 'none' || ['shopEffect', 'shopSticker'].some(key => style[key] && style[key] !== 'none'),
      location: kind === 'event' ? validEventPosition() : !!writingPosition,
      settings: $('#quick-identity')?.value === 'nickname' || $('#quick-gender')?.value !== 'private'
    }
  });
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
  const values = tagList(raw);
  return values.length <= 5 && values.every(value => maskedTextLength(value) <= 20)
    && new Set(values).size === values.length ? values : null;
}
function validEventBody(value) {
  return maskedTextLength(value) <= 200
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
function isGuestComposer() {
  return authKnown && !session?.user && !composerUserId && !editingId && (kind === 'memo' || kind === 'comment');
}
function updateComposer() {
  text.maxLength = textInputMaxLength(text.value, 200);
  tags.maxLength = textInputMaxLength(tags.value, 120);
  const selected = !isGuestComposer() && $('#compose-font').value === 'calligraphy';
  const convert = $('#convert-calligraphy');
  convert.setAttribute('aria-pressed', String(selected));
  convert.textContent = selected ? '캘리그라피 해제' : '캘리그라피로 변환 · 10쭈 / 1개월';
  convert.disabled = busy || draftLoading || !authKnown;
  updatePaidSubmit();
  $('.compose-photo')?.classList.toggle('tags-chip', document.activeElement !== tags && !!tags.value.trim());
  syncQuickChoices();
  syncCardPhotoAttach();
  const visual = currentStyle();
  const previewTags = tagList(tags.value).slice(0, 5);
  syncComposeInk(selected, visual, previewTags);
  if (!backdrop.hidden && text.parentNode === $('.compose-photo')) resizeComposerText();
  $('#compose-count').textContent = `${maskedTextLength(text.value)} / 200자`;
  const extra = visual.boxTransparency !== 25 || selectedPhotoKey || tags.value.trim() || visual.font !== 'default'
    || visual.size !== 'normal' || visual.effect !== 'none'
    || ['textColor', 'boxColor'].some(key => visual[key] !== 'default');
  if (composerTools) syncComposerTools();
  else $('#compose-more>summary').textContent = extra ? '꾸미기 · 추가 설정 (선택됨)' : '꾸미기 · 추가 설정';
  const values = parsedTags();
  $('#compose-tag-display').replaceChildren(...previewTags.map(value => node('span', '', `#${value.slice(0, 20)}`)));
  fitTagRow($('#compose-tag-display'));
  const overflows = !backdrop.hidden && !!text.value.trim()
    && (composerPhotoOverflows() || cardPhotoOverflows(text.value, previewTags));
  let warning = $('#compose-overflow-warning');
  if (!warning) {
    warning = node('span', 'compose-overflow-warning'); warning.id = 'compose-overflow-warning';
    $('#compose-count').before(warning);
  }
  warning.textContent = overflows ? '사진에 글이 다 보이지 않아요. 등록할 때 확인할 수 있어요.' : '';
  warning.hidden = !overflows;
  if (isGuestComposer()) {
    submit.disabled = busy || !client || !ready || replyDueChecking || !validEventBody(text.value);
    composeMessage.textContent = busy ? '등록 중' : !client || !ready ? '공원 연결 확인 중'
      : backgroundKey === null ? '배경은 등록할 때 자동으로 정해져요.' : '기본 글꼴로 익명 등록돼요.';
    return;
  }
  if (!client || !ready) composeMessage.textContent = '노트 연결 확인 후 등록 가능';
  else if (!authKnown) composeMessage.textContent = '로그인 확인 중';
  else if (!session?.user) {
    const link = node(localStage ? 'button' : 'a', '', localStage ? '테스트 로그인' : '대문에서 로그인');
    if (localStage) { link.type = 'button'; link.dataset.stageLogin = ''; }
    else link.href = noteLoginHref();
    composeMessage.replaceChildren(link);
  } else if (!canWrite()) composeMessage.textContent = writingMessage();
  else if (maskedTextLength(text.value) > 200) composeMessage.textContent = '글은 200자 이내로 작성해 주세요';
  else if (kind === 'event' && !validEventBody(text.value)) composeMessage.textContent = '이벤트 내용을 입력해 주세요.';
  else if (!values) composeMessage.textContent = '태그는 중복 없이 5개까지, 각 20자 이내';
  else if (kind === 'comment' && replyDueChecking) composeMessage.textContent = '상위 카드 공개 종료일 확인 중';
  else if (kind !== 'event' && !editingId && !writingPosition) composeMessage.textContent = composerTools
    ? '아래 위치 아이콘을 눌러 위치를 켜 주세요.' : '위치를 켜고 확인한 뒤 등록할 수 있어요.';
  else if (kind === 'event' && !editingId && !validEventPosition()) composeMessage.textContent = '지도에서 이벤트 중심을 정해 주세요.';
  else if (kind === 'event' && eventPhotoPreparing) composeMessage.textContent = '사진을 준비하는 중이에요.';
  else if (cardPhotoPreparing) composeMessage.textContent = cardMediaProgress || '첨부 파일을 준비하는 중이에요.';
  else if (kind === 'event' && eventPhotoError) composeMessage.textContent = eventPhotoError;
  else if (kind === 'event' && !editingId && !validEventOptions()) composeMessage.textContent = '반경과 시간을 범위 안의 정수로 입력해 주세요.';
  else composeMessage.textContent = busy ? (editingId ? '수정 중' : '등록 중')
    : kind === 'event' && !editingId ? '이벤트 범위와 금액을 확인해 주세요.'
      : '';
  submit.disabled = busy || draftLoading || replyDueChecking || eventPhotoPreparing || cardPhotoPreparing || !!eventPhotoError || !client || !ready || !session?.user || !canWrite() || !text.value.trim()
    || maskedTextLength(text.value) > 200 || !values
    || (kind !== 'event' && !editingId && !writingPosition)
    || (kind === 'event' && (!validEventBody(text.value)
      || (!editingId && (!validEventPosition() || !validEventOptions()))));
}
let measureBox = null;
function fitComposerWidth(photo) {   // 글쓰기 창의 글상자도 글씨 길이에 맞는 너비로
  if (!photo?.clientWidth) return;
  if (!measureBox) { measureBox = document.createElement('div'); measureBox.setAttribute('aria-hidden', 'true');
    Object.assign(measureBox.style, { position: 'absolute', visibility: 'hidden', left: '-9999px', top: '0', whiteSpace: 'pre-wrap', wordBreak: 'keep-all', overflowWrap: 'anywhere', width: 'max-content' }); document.body.append(measureBox); }
  const cs = getComputedStyle(text);
  for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight', 'paddingLeft', 'paddingRight']) measureBox.style[k] = cs[k];
  const max = photo.clientWidth * 0.84, min = Math.min(max, photo.clientWidth * 0.36);
  measureBox.style.maxWidth = `${max}px`; measureBox.textContent = (text.value || text.placeholder || ' ') + '\u200b';
  text.style.width = `${Math.round(Math.min(max, Math.max(min, measureBox.getBoundingClientRect().width + 8)))}px`;
}
function resizeComposerText() {
  const photo = $('.compose-photo');
  fitComposerWidth(photo);
  text.style.height = 'auto';
  const minimum = 88;
  const maximum = Math.max(minimum, photo.clientHeight - 70);
  text.style.fontSize = '';
  let size = parseFloat(getComputedStyle(text).fontSize);
  while (text.scrollHeight > maximum && size > 12) {
    size -= 1; text.style.fontSize = `${size}px`;
  }
  text.style.height = `${Math.min(maximum, Math.max(minimum, text.scrollHeight))}px`;
}
function composerPhotoOverflows() {
  if ($('.compose-photo').classList.contains('park-ink-overlay')) return false;
  const tagsRow = $('#compose-tag-display');
  return text.scrollHeight > text.clientHeight + 1 || (tagsRow.childElementCount > 0
    && text.getBoundingClientRect().bottom + 6 > tagsRow.getBoundingClientRect().top);
}
function validEventOptions() {
  return validEventInteger($('#event-radius').value, 1, 30)
    && validEventInteger($('#event-hours').value, 1, 24);
}
async function openComposer(mode, card = null, replyTo = null, pending = null) {
  if (busy || draftLoading) return;
  composeInkComposing = false;
  if (!authKnown && client) { message('계정을 확인하고 있어요. 잠시 후 다시 눌러 주세요.'); return; }
  if (parkJunior() && (mode === 'event' || card?.kind === 'event')) {
    message('공원 청소년 계정은 일반 카드와 답글을 쓸 수 있어요.');
    return;
  }
  fontBeforeConversion = 'default';
  const guest = !session?.user;
  if (guest && (card || !['new', 'memo', 'reply'].includes(mode))) {
    const href = noteLoginHref(replyTo || undefined);
    let target = window;
    try { if (parkEmbedded && parent.location.origin === location.origin) target = parent; } catch {}
    target.location.assign(href); return;
  }
  const replyTarget = mode === 'reply' ? (validCardId(replyTo) ? replyTo : stack.at(-1)) : null;
  if (mode === 'reply' && !validCardId(replyTarget)) { message('답글을 달 카드를 다시 열어 주세요.'); return; }
  const run = ++composerRun, epoch = identityEpoch;
  if (session?.user && !card?.is_mine) {
    const userId = session.user.id;
    // Auth already loads this identity. Reuse it so an opening tap can focus
    // the native field before any await and open the mobile keyboard.
    if (!myIdentityReady) {
      try { await loadMyGender(userId); }
      catch { message('회원정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
    }
    if (run !== composerRun || epoch !== identityEpoch || session?.user?.id !== userId) return;
    if (!myIdentity) { showMemberInfo(() => openComposer(mode, card, replyTarget, pending)); return; }
  }
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
  if (composerUserId) void loadPhotoEntitlements(composerUserId).catch(error => console.warn('Note photo entitlement:', error));
  kind = editingId ? card.kind : mode === 'event' ? 'event' : mode === 'reply' ? 'comment' : 'memo';
  $('.composer').toggleAttribute('data-guest', guest);
  const login = $('#guest-compose-login');
  login.hidden = !guest;
  login.href = noteLoginHref(replyTarget || undefined);
  cardPhotoEditPath = null;
  clearEventPhoto(); clearCardPhoto();
  $('.compose-photo')?.classList.remove('has-card-photo');
  localComposerBaseline = null; localComposerDirty = false; localComposerStored = false;
  parentId = editingId ? card.parent_id : kind === 'comment' ? replyTarget : null;
  const guestRequestId = validCardId(pending?.requestId) ? pending.requestId : null;
  const returningBackground = guestRequestId ? photoAssetKey(pending.backgroundKey) : null;
  if (editingId) backgroundKey = card.photo_key || card.background_key;
  else if (guest) backgroundKey = null;
  else backgroundKey = guestRequestId ? returningBackground : randomDefaultBackground();
  publishRequestId = guest && guestRequestId ? guestRequestId : crypto.randomUUID();
  writingPosition = null; eventPosition = null; photoRequestId = crypto.randomUUID(); locationRun++;
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
  if (composerTools) composerTools.close(false);
  else $('#compose-more').open = false;
  $('#photo-gallery').hidden = true; $('#photo-gallery-toggle').setAttribute('aria-expanded', 'false');
  $('#photo-grid').replaceChildren(); photoPage = 0; selectedPhotoKey = null;
  $('input[name="photo-choice"][value="plain"]').checked = true;
  updateFeaturedPhoto();
  $('#card-location-consent').hidden = guest || kind === 'event' || !!editingId;
  setCardLocationSwitch(false, '카드를 등록하려면 위치를 켜 주세요. 정확한 좌표는 비공개로 저장돼요.');
  $('#note-event-fields').hidden = kind !== 'event' || !!editingId;
  $('#event-radius').value = '1'; $('#event-hours').value = '1';
  $('#event-location-status').textContent = '지도를 누르거나 Tab으로 지도에 초점을 맞춘 뒤 방향키로 이동하고 아래 버튼으로 중심을 선택해 주세요. 지정한 위치와 범위는 다른 사람에게 보입니다.';
  $('.composer').dataset.mode = !editingId && kind === 'memo' ? 'memo-new' : editingId ? 'edit' : kind;
  $('.composer').dataset.kind = kind;
  $('#compose-title').textContent = editingId ? kind === 'event' ? '내 이벤트 수정' : '내 카드 수정' : kind === 'event' ? '이벤트 카드 쓰기' : kind === 'comment' ? '답글 카드 쓰기' : '글 작성하기';
  $('#compose-context').textContent = editingId ? kind === 'event'
    ? '글·태그·꾸미기·사진을 수정할 수 있어요. 구매한 위치·반경·기간은 그대로 유지돼요.'
    : '글과 태그를 수정할 수 있어요.' : kind === 'comment' ? replyContext() : '마음을 카드에 적어 주세요.';
  submit.textContent = editingId ? '수정하기' : kind === 'event' ? '100 ZU 결제 후 등록' : '등록하기';
  const style = editingId ? (card.style && typeof card.style === 'object' ? card.style : {}) : readComposerSettings();
  window.OjjudaDecorations?.setStyle(style);
  $('#compose-font').value = FONT_CODES.includes(style.font) ? style.font : 'default';
  $('#compose-size').value = ['large', 'small'].includes(style.size) ? style.size : 'normal';
  $('#compose-theme').value = ['rose', 'night'].includes(style.theme) ? style.theme : 'plain';
  $('#compose-effect').value = EFFECT_CODES.includes(style.effect) ? style.effect : 'none';
  for (const group of ['textColor', 'boxColor']) setColorChoice(group, style[group]);
  setBoxTransparency(editingId ? (style.boxTransparency ?? 80) : style.boxTransparency);
  applyComposeStyle(); updateEventPrice();
  text.value = editingId ? card.body : ''; tags.value = editingId ? card.tags.join(', ') : guest ? '' : initialComposerTags();
  const identityMode = editingId ? (card.identity_mode === 'nickname' ? 'nickname' : 'anonymous') : readComposerSettings().identity;
  $(`input[name="identity"][value="${identityMode}"]`).checked = true;
  setGenderInputs(true);
  autoTagMode = !guest && !editingId; manualTags = tagList(tags.value); rejectedTags = new Set(); autoTagsNow = [];
  clearLocalComposer();
  requestedDraftContent = draftContent();
  if (!guest && draftController && !requestedDraftContent.background_key)
    requestedDraftContent.background_key = randomDefaultBackground();
  if (draftStatus) draftStatus.hidden = true;
  setComposerInputs();
  updateComposer(); backdrop.hidden = false; lockPage(true);
  if (autoTagMode) refreshAutoTags();
  updateComposer();
  $('.composer-body').scrollTop = 0;
  // Focus only while opening; later photo/location/render updates keep the
  // member's chosen field and caret, including native calligraphy input.
  text.focus({ preventScroll: true });
  text.setSelectionRange(text.value.length, text.value.length);
  if (guest) void loadGuestBackground(publishRequestId, run, epoch);
  if (editingId && (kind === 'memo' || kind === 'comment')) void prepareCardPhotoEdit(editingId, run);
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
      if (run === composerRun) { draftLoading = false; setComposerInputs(); updateComposer(); }
    }
  }
  if (pending && run === composerRun && epoch === identityEpoch && !backdrop.hidden) {
    if (!text.value || text.value === pending.body || (pending.body && confirm('로그인 전에 쓰던 글을 이어 쓸까요?'))) {
      if (!guest && guestRequestId && parentId === pending.parent) {
        backgroundKey = returningBackground;
        selectedPhotoKey = null;
        $('input[name="photo-choice"][value="plain"]').checked = true;
        updateFeaturedPhoto(); applyComposeStyle();
        if (!backgroundKey) void loadGuestBackground(guestRequestId, run, epoch);
      }
      if (pending.body) {
        text.value = pending.body;
        text.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    if (!guest && pending.convert && $('#compose-font').value !== 'calligraphy') toggleCalligraphy();
    else if (!guest && !pending.convert) {
      if (composerTools) composerTools.open('font');
      else $('#compose-more').open = true;
    }
  }
  if (!guest && !editingId && kind !== 'event' && run === composerRun && !backdrop.hidden) autoWritingLocation(run);
}
async function loadWritingLocation(run, enable = false) {
  const button=$('#card-location-button'),userId=session?.user?.id;
  if(!button||run!==composerRun||backdrop.hidden||$('#card-location-consent').hidden||!userId)return;
  const request=++locationRun;writingLocationController?.abort();
  const controller=new AbortController();writingLocationController=controller;
  writingPosition=null;setCardLocationSwitch(enable||locationIsEnabled(),'위치를 확인하고 있어요.',true);updateComposer();
  try {
    const position=await currentPosition(false,enable,controller.signal);
    if(request!==locationRun||run!==composerRun||backdrop.hidden||userId!==session?.user?.id||!locationIsEnabled())return;
    writingPosition=position;nearbyPosition=position;
    if(enable)rememberComposerSetting('locationEnabled',true);
    setCardLocationSwitch(true,'공원과 파장에서 함께 사용해요.');
  }catch(error){
    if(request===locationRun&&run===composerRun&&!backdrop.hidden){
      writingPosition=null;setCardLocationSwitch(locationIsEnabled(),locationErrorText(error),false,true);
    }
  }finally{if(request===locationRun){writingLocationController=null;updateComposer();}}
}
async function autoWritingLocation(run) {
  const userId=session?.user?.id;
  if(!userId||!window.OjjudaLocation)return;
  try {
    $('#card-location-button').disabled=true;
    const choice=await window.OjjudaLocation.preference(client,userId,{legacyDisabled:readComposerSettings().locationEnabled===false});
    if(run!==composerRun||backdrop.hidden||userId!==session?.user?.id)return;
    if(!choice.enabled){setCardLocationSwitch(false,'공원과 파장의 위치가 꺼져 있어요.');return;}
    if(writingPosition)return;
    $('#card-location-button').disabled=busy||draftLoading;
    await loadWritingLocation(run);
  }catch(error){if(run===composerRun&&!backdrop.hidden)setCardLocationSwitch(false,locationErrorText(error),false,true);}
  finally{if(run===composerRun)$('#card-location-button').disabled=busy||draftLoading;}
}

function closeComposer(saveDraft = true) {
  if (busy) return;
  writingLocationController?.abort();
  composeInkComposing = false;
  composerTools?.close(false);
  clearLocalComposer();
  composerRun++; replyDueRun++; replyDueChecking = false; draftLoading = false; setComposerInputs();
  backdrop.hidden = true; writingPosition = null; eventPosition = null; locationRun++; composerMapFetchRun++;
  cardPhotoEditPath = null;
  clearEventPhoto(); clearCardPhoto();
  setCardLocationSwitch(false, '카드를 등록하려면 위치를 켜 주세요. 정확한 좌표는 비공개로 저장돼요.');
  clearTimeout(composerMapTimer); eventMap?.destroy(); eventMap = null; lockPage(false);
  if (focusBefore?.isConnected) focusBefore.focus({ preventScroll: true });
}
async function uploadCardPhotoFile(userId, blob, requestId, video = null) {
  if (session?.user?.id !== userId || !validCardId(requestId))
    throw new Error('계정이나 첨부 정보를 다시 확인해 주세요.');
  if (video) {
    const controller = new AbortController(); cardMediaUploadController = controller;
    const epoch = identityEpoch;
    try {
      const helper = window.ojjudaCardVideoUpload || await import('/note/card-video-upload.js?v=20261120-video1');
      if (controller.signal.aborted || epoch !== identityEpoch || session?.user?.id !== userId) throw new Error('계정이 변경됐어요.');
      return await helper.uploadCardVideo({ client, supabaseUrl: config.supabaseUrl, userId, requestId, video,
        posterBlob: blob, signal: controller.signal, onProgress: ({ phase, progress }) => {
          if (epoch !== identityEpoch || session?.user?.id !== userId || controller.signal.aborted) return;
          cardMediaProgress = phase === 'uploading' ? `영상을 올리는 중이에요. ${Math.round(progress * 100)}%` : '올린 영상을 확인하는 중이에요.';
          composeMessage.textContent = cardMediaProgress; syncCardPhotoAttach();
        } });
    } finally { if (cardMediaUploadController === controller) cardMediaUploadController = null; }
  }
  const path = `${userId}/${requestId}.jpg`;
  const { error } = await client.storage.from(CARD_PHOTO_BUCKET).upload(
    path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '600' });
  if (error && String(error.statusCode) !== '409' && !/already exists|duplicate/i.test(error.message || '')) throw error;
  if (session?.user?.id !== userId) throw new Error('계정이 변경됐어요.');
  return path;
}
async function removeCardMediaFiles(path, videoPath = null) {
  const paths = [[CARD_PHOTO_BUCKET, path]];
  // Video paths share the poster's immutable request ID. Policies reject deletion while linked.
  if (videoPath) paths.push([CARD_VIDEO_BUCKET, videoPath]);
  for (const [bucket, objectPath] of paths) {
    try {
      const { error } = await client.storage.from(bucket).remove([objectPath]);
      if (error) console.warn('Note attachment cleanup:', error);
    } catch (error) { console.warn('Note attachment cleanup:', error); }
  }
}
async function replacePublishedCardPhoto(cardId, userId, path, expectedPath) {
  if (session?.user?.id !== userId || !validCardId(cardId) || !expectedPath)
    throw new Error('기존 첨부가 있는 카드만 사진·영상을 바꿀 수 있어요.');
  const result = await noteRpc('replace_card_photo', { p_card_id: cardId, p_path: path, p_expected_path: expectedPath });
  if (session?.user?.id !== userId) return;
  cardPhotoCache.delete(cardId);
  if (result?.previous_path && result.previous_path !== path) {
    await removeCardMediaFiles(result.previous_path, result.previous_video_path || result.previous_path.replace(/\.jpg$/, '.mp4'));
  }
}
async function showPublishedFeed(publishKind, values, cardPhotoFailed = false) {
  // A new card can be hidden by an older tag search, saved-only view, or popular sort.
  feedSort = 'latest'; feedTerm = ''; tagTabReset?.();
  document.querySelectorAll('.feed-sort-tabs [data-sort]').forEach(button => {
    const selected = button.dataset.sort === feedSort;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const refreshed = await selectCollection(publishKind === 'event' ? 'events' : 'all', true);
  if (publishKind === 'memo') {
    if (cardPhotoFailed) message('카드는 올렸지만 첨부 파일을 붙이지 못했어요. 다시 시도해 주세요.');
    else if (refreshed) flashMessage(values.includes('19금') ? '카드를 올렸어요. ‘19금’ 태그 검색에서 볼 수 있어요.' : '카드를 올렸어요', 3500);
    else message('카드는 올렸어요. 목록을 불러오지 못했어요. 새로고침해 주세요.');
  }
}

async function publishGuestCard(body) {
  const run = composerRun, reply = kind === 'comment';
  busy = true; setComposerInputs(); updateComposer();
  let result, error;
  try {
    result = await noteRpc('publish_guest_card', {
      p_request_id: publishRequestId, p_body: body, p_parent_id: parentId
    });
  } catch (cause) { error = cause; }
  if (run !== composerRun || !isGuestComposer()) return;
  busy = false; setComposerInputs(); updateComposer();
  if (!result?.card_id) {
    composeMessage.textContent = noteSpamMessage(error) || '등록하지 못했어요. 내용을 확인한 뒤 다시 시도해 주세요.';
    return;
  }
  text.value = ''; tags.value = ''; closeComposer(false);
  if (reply) {
    await refreshCards(true);
    flashMessage('답글을 올렸어요.', 3500);
  } else await showPublishedFeed('memo', result.tags || []);
}
async function publishCard() {
  if (busy || submit.disabled || !client || !ready) return;
  if (autoTagMode && tagList(tags.value).length <= 5) {
    noteTagEdit();
    refreshAutoTags();
  }
  let body = text.value.replace(/\r\n?/g, '\n').trim(), values = parsedTags();
  if (!body || maskedTextLength(body) > 200 || !values) return;
  if (cardPhotoPreparing) { composeMessage.textContent = '첨부 파일을 준비하는 중이에요. 잠시 뒤 등록해 주세요.'; return; }
  const editId = editingId, actionUserId = composerUserId, actionEpoch = identityEpoch, actionComposerRun = composerRun;
  // Login may finish before the first guest preview arrived. Use one member draw if publishing first.
  if (composerUserId && !editId && backgroundKey === null) {
    backgroundKey = randomDefaultBackground(); updateFeaturedPhoto(); applyComposeStyle();
  }
  const previewBackgroundKey = backgroundKey;
  const selectedCardPhoto = (!editId || cardPhotoEditPath) && (kind === 'memo' || kind === 'comment') ? cardPhotoBlob : null;
  const selectedCardVideo = selectedCardPhoto ? cardVideoPrepared : null;
  const selectedCardPhotoExpectedPath = cardPhotoEditPath;
  const selectedCardPhotoId = cardPhotoRequestId;
  if (kind === 'event' && (!validEventBody(body) || eventPhotoPreparing || eventPhotoError
    || (!editId && (!validEventPosition() || !validEventOptions())))) { updateComposer(); return; }
  const identityMode = $('input[name="identity"]:checked')?.value === 'nickname' ? 'nickname' : 'anonymous';
  const selectedPhoto = kind === 'memo' && !editId ? chosenPhoto() : 'plain';
  const selectedPhotoRequestId = photoRequestId;
  let selectedPhotoAction = null;
  const selectedEventPhoto = kind === 'event' ? eventPhotoBlob : null;
  const selectedEventPhotoRequestId = eventPhotoRequestId;
  const removeEventPhoto = kind === 'event' && !!editId && eventPhotoRemove;
  if (kind === 'comment' && !editId && archiveDueThisMonth(parentArchiveDue(cache.get(parentId)))
    && !window.confirm(`상위 카드가 ${dateLabel(parentArchiveDue(cache.get(parentId)))}에 공개 종료될 예정이에요. 이 답글도 함께 삭제될 수 있습니다. 등록할까요?`)) return;
  if ((composerPhotoOverflows() || cardPhotoOverflows(body, values))
    && !window.confirm('글이나 태그 일부가 사진 안에 다 보이지 않습니다. 카드 크게 보기에서 전체 글을 볼 수 있어요. 그래도 등록할까요?')) return;
  if (kind === 'event' && !editId) {
    const cost = Number($('#event-radius').value) * Number($('#event-hours').value) * 100;
    if (!window.confirm(`이벤트 ${cost.toLocaleString('ko-KR')} ZU를 결제하고 등록할까요?`)) return;
  } else if (!editId && selectedPhoto !== 'plain') {
    busy = true; setComposerInputs(); updateComposer();
    try { selectedPhotoAction = await photoActionFor(selectedPhoto, actionUserId); }
    catch (entitlementError) {
      console.warn('Note photo entitlement:', entitlementError);
      busy = false; setComposerInputs(); updateComposer();
      composeMessage.textContent = '구매 내역을 확인하지 못했어요. 잠시 뒤 다시 등록해 주세요.';
      return;
    }
    if (session?.user?.id !== actionUserId || actionEpoch !== identityEpoch || actionComposerRun !== composerRun || backdrop.hidden || !selectedPhotoAction) {
      busy = false; setComposerInputs(); updateComposer(); return;
    }
    busy = false; setComposerInputs(); updateComposer();
  }
  if (kind === 'comment' && !editId && !validCardId(parentId)) {
    composeMessage.textContent = '답글을 달 카드를 다시 열어 주세요.'; return;
  }
  if (isGuestComposer()) {
    await publishGuestCard(body);
    return;
  }
  if (!await ensureComposeFont(actionUserId, actionEpoch, actionComposerRun)) return;
  if (session?.user?.id !== actionUserId || identityEpoch !== actionEpoch || composerRun !== actionComposerRun || backdrop.hidden) return;
  let draftToken = null, publishKind = kind, publishParent = parentId;
  recordDraft(); busy = true; setComposerInputs(); updateComposer();
  if (!editId && kind !== 'event' && draftController) {
    try {
      draftToken = await draftController.preparePublish();
      body = draftToken.content.body.replace(/\r\n?/g, '\n').trim(); values = parsedTags(draftToken.content.tags);
      publishKind = draftToken.content.kind; publishParent = draftToken.content.parent_id;
      if (publishKind !== kind || publishParent !== parentId) throw new Error('임시 글의 원글이 바뀌었어요. 작성창을 다시 열어 확인해 주세요.');
      if (draftToken.content.background_key !== previewBackgroundKey) throw new Error('임시 글의 사진이 바뀌었어요. 작성창을 다시 열어 확인해 주세요.');
      if (!body || maskedTextLength(body) > 200 || !values) throw new Error('보관된 내용을 확인해 주세요.');
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
  let cardPhotoUploadPath = null;
  if (selectedCardPhoto) {
    try { cardPhotoUploadPath = await uploadCardPhotoFile(actionUserId, selectedCardPhoto, selectedCardPhotoId, selectedCardVideo); }
    catch (photoError) {
      if (actionEpoch !== identityEpoch || actionUserId !== session?.user?.id || actionComposerRun !== composerRun) return;
      console.warn('Note card photo upload:', photoError);
      draftController?.cancelPublish(); busy = false; setComposerInputs(); updateComposer();
      composeMessage.textContent = selectedCardVideo ? (photoError.message || '영상을 올리지 못했어요. 다시 시도해 주세요.')
        : '사진을 올리지 못했어요. 사진과 글을 그대로 두었으니 다시 시도해 주세요.';
      return;
    }
  }
  if (actionEpoch !== identityEpoch || actionUserId !== session?.user?.id || actionComposerRun !== composerRun) return;
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
  if (!editId) {
    const genderChoice = $('input[name="gender"]:checked')?.value;
    try {
      if (!myIdentity || ![myGender, 'private'].includes(genderChoice)) throw new Error('invalid_gender');
      await noteRpc('set_my_gender', { p_gender: genderChoice });
    } catch (genderError) {
      draftController?.cancelPublish?.(); busy = false; setComposerInputs(); updateComposer();
      composeMessage.textContent = '회원정보와 성별 표시를 확인하지 못했어요. 다시 등록해 주세요.'; return;
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
        p_background_key: previewBackgroundKey,
        p_identity_mode: identityMode, p_style: currentStyle(), p_lat: eventPosition.latitude,
        p_lon: eventPosition.longitude, p_radius_km: Number($('#event-radius').value),
        p_starts_at: new Date().toISOString(), p_duration_hours: Number($('#event-hours').value),
        ...(eventPhotoPath ? { p_photo_path: eventPhotoPath } : {}) });
    } else {
      data = await noteRpc(cardPhotoUploadPath ? 'publish_card_with_photo' : 'publish_card', { p_request_id: publishRequestId, p_body: body, p_tags: values,
        p_background_key: previewBackgroundKey,
        p_identity_mode: identityMode, p_style: currentStyle(), p_lat: writingPosition?.latitude,
        p_lon: writingPosition?.longitude, p_parent_id: publishParent,
        ...(cardPhotoUploadPath ? { p_photo_path: cardPhotoUploadPath } : {}) });
    }
    if (data?.ok === false) throw Object.assign(new Error(data.reason === 'coins'
      ? `ZU 잔액이 부족해요. ${Number(data.required || 0).toLocaleString('ko-KR')} ZU가 필요해요.`
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
  if (session?.user?.id !== actionUserId || actionEpoch !== identityEpoch || actionComposerRun !== composerRun) return;
  if (error || !publishedId) {
    busy = false; setComposerInputs();
    console.warn('Note publish:', error);
    updateComposer();
    composeMessage.textContent = error?.code === 'guardian' || error?.message === 'park_guardian_location_required'
      ? '보호자가 위치 이용에 동의한 뒤 다시 등록해 주세요.'
      : noteSpamMessage(error) || (/Invalid event (?:input|edit)/i.test(error?.message || '')
      ? editId ? '이벤트 글·태그·사진을 확인해 주세요.' : '이벤트 글·태그·위치·반경·시간을 확인해 주세요.'
      : error?.code === 'EVENT_REJECTED' ? error.message
        : editId ? '수정하지 못했어요. 권한과 연결을 확인해 주세요' : '등록하지 못했어요. 다시 시도해 주세요');
    return;
  }
  if (!editId && publishKind === 'memo') {
    document.dispatchEvent(new CustomEvent('ojjuda:card-published', {
      detail: { userId: actionUserId, cardId: publishedId }
    }));
  }
  if (editId && publishedId && publishKind !== 'event') {
    try { await noteRpc('set_card_style', { p_card_id: publishedId, p_style: currentStyle() }); }
    catch (styleError) { console.warn('Note style:', styleError); message('글은 저장됐지만 꾸미기는 적용되지 않았어요.'); }
  }
  let cardPhotoFailed = false, cardPhotoConflict = false;
  if (selectedCardPhoto && cardPhotoUploadPath) {
    try {
      if (editId) await replacePublishedCardPhoto(publishedId, actionUserId, cardPhotoUploadPath, selectedCardPhotoExpectedPath);
      else cardPhotoCache.delete(publishedId);
    }
    catch (photoError) {
      console.warn('Note card photo:', photoError); cardPhotoFailed = true;
      cardPhotoConflict = photoError?.code === '40001';
    }
  }
  if (session?.user?.id !== actionUserId) return;
  let photoPurchaseFailed = false;
  if (!editId && selectedPhoto !== 'plain') {
    try {
      await noteRpc(selectedPhotoAction, { p_card_id: publishedId, p_photo_key: selectedPhoto, p_request_id: selectedPhotoRequestId });
      void loadPhotoEntitlements(actionUserId).catch(error => console.warn('Note photo entitlement:', error));
      if (selectedPhotoAction === 'purchase_card_photo') void loadWorldBalance(actionUserId);
    } catch (photoError) { console.warn('Note photo purchase:', photoError); photoPurchaseFailed = true; }
  }
  if (session?.user?.id !== actionUserId) return;
  const spent = Number(data?.coins_spent ?? data?.cost_coins);
  if (publishKind === 'event' && !editId && Number.isFinite(spent)) {
    message(`이벤트를 등록했어요. 서버에서 ${spent.toLocaleString('ko-KR')} ZU를 차감했어요.`);
    void loadWorldBalance(actionUserId);
  }
  if (publishKind === 'event' && editId) message('이벤트를 수정했어요.');
  if (publishKind === 'comment' && archiveDueThisMonth(data?.effective_archive_due_at))
    message(`답글이 등록됐어요. 상위 카드와 함께 ${dateLabel(data.effective_archive_due_at)}에 공개 종료될 수 있어요. 알림을 확인해 주세요.`);
  if (session?.user?.id !== actionUserId || actionEpoch !== identityEpoch || actionComposerRun !== composerRun) return;
  busy = false; setComposerInputs();
  text.value = ''; tags.value = '';
  closeComposer(false);
  if (!editId && publishKind !== 'comment') {
    await showPublishedFeed(publishKind, values, cardPhotoFailed);
  } else {
    await refreshCards(editId || publishKind === 'comment');
  }
  if (session?.user?.id !== actionUserId) return;
  if (publishKind === 'comment') void notificationController?.refresh?.();
  if (photoPurchaseFailed || cardPhotoFailed) {
    showManagement(editId ? '글은 수정됐어요' : '카드는 등록됐어요');
    if (photoPurchaseFailed) {
      managementBody.append(node('p', 'management-help', '사진 배경 적용이 완료되지 않아 기본 배경으로 등록됐어요. 구매 내역을 확인한 뒤 다시 시도하거나 기본 배경으로 계속 이용할 수 있어요.'));
      const retryBackground = managementButton('사진 배경 적용 다시 시도', () => managementPhotoAction(publishedId, selectedPhoto, selectedPhotoRequestId,
        async () => {
          photoPurchaseFailed = false; retryBackground.remove(); keepBackground.remove();
          await refreshCards(false); await loadWorldBalance(actionUserId);
          if (cardPhotoFailed) managementMessage.textContent = '사진 배경을 적용했어요. 카드 첨부는 다시 시도해 주세요.';
          else closeManagement();
        }
      ), true);
      const keepBackground = managementButton('기본 배경으로 두기', () => {
        photoPurchaseFailed = false; retryBackground.remove(); keepBackground.remove();
        if (cardPhotoFailed) managementMessage.textContent = '기본 배경으로 둘게요. 카드 첨부는 다시 시도할 수 있어요.';
        else closeManagement();
      });
      managementFooter.append(retryBackground, keepBackground);
    }
    if (cardPhotoFailed) {
      pendingCardPhotoCleanup = { userId: actionUserId, path: `${actionUserId}/${selectedCardPhotoId}.jpg`,
        videoPath: selectedCardVideo ? `${actionUserId}/${selectedCardPhotoId}.mp4` : null };
      if (cardPhotoConflict) {
        managementBody.append(node('p', 'management-help', '다른 화면에서 첨부가 먼저 바뀌었어요. 카드를 다시 열어 확인한 뒤 교체해 주세요.'));
        managementFooter.append(managementButton('카드 다시 열기', () => { closeManagement(); openCard(publishedId); }, true));
        return;
      }
      managementBody.append(node('p', 'management-help', '글은 수정됐지만 첨부 교체는 완료되지 않았어요. 아래에서 다시 바꿀 수 있어요.'));
      const retryCardPhoto = managementButton('첨부 교체 다시 시도', () => managementAction(
        () => replacePublishedCardPhoto(publishedId, actionUserId, cardPhotoUploadPath, selectedCardPhotoExpectedPath),
        async () => {
          cardPhotoFailed = false; pendingCardPhotoCleanup = null; retryCardPhoto.remove();
          await refreshCards(false);
          if (photoPurchaseFailed) managementMessage.textContent = '첨부를 바꿨어요. 제공 배경 결제는 다시 시도해 주세요.';
          else closeManagement();
        }
      ), true);
      managementFooter.append(retryCardPhoto);
    }
  }
}
function updateAuth() {
  const juniorHelp = $('#park-junior-writing-help');
  if (juniorHelp) juniorHelp.hidden = !parkJunior();
  const accountText = !authKnown ? '계정 확인 중'
    : session?.user ? (localStage ? '테스트 계정 연결됨' : `오쭈다 계정 연결됨${worldCoins === null ? '' : ` · ${worldCoins.toLocaleString('ko-KR')} ZU`}`)
      : (localStage ? '테스트 로그인 필요' : '대문에서 로그인해 주세요');
  $('#account-status').textContent = accountText;
  $('#note-account-section').hidden = !session?.user;
  $('#note-account-email').textContent = session?.user?.email || '';
  $('#note-account-name').textContent = session?.user ? accountNickname || '내 계정' : '';
  for (const balance of document.querySelectorAll('[data-note-balance]')) {
    balance.textContent = worldCoins === null ? '—' : worldCoins.toLocaleString('ko-KR');
    const label = worldCoins === null ? '보유 ZU 확인, 충전 열기' : `보유 ${worldCoins.toLocaleString('ko-KR')} ZU, 충전 열기`;
    balance.closest('a')?.setAttribute('aria-label', label);
    balance.closest('a')?.setAttribute('title', label);
  }
  if ($('#mobile-account-status')) $('#mobile-account-status').textContent = accountText;
  if ($('#note-blocks')) $('#note-blocks').hidden = !session?.user;
  if ($('#note-member-info')) $('#note-member-info').hidden = !session?.user;
  if ($('#note-moderation')) $('#note-moderation').hidden = !session?.user || !moderator;
  if ($('#note-admin-entry')) $('#note-admin-entry').hidden = !session?.user || !moderator;
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

async function fetchAccountNickname(userId) {
  const { data, error } = await client.from('profiles').select('nickname').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (!data?.nickname) throw new Error('profile_unavailable');
  return data.nickname;
}
async function loadAccountProfile(userId) {
  const run = ++accountProfileRun;
  if (!userId || !client) return;
  try {
    const nickname = await fetchAccountNickname(userId);
    if (run !== accountProfileRun || session?.user?.id !== userId) return;
    accountNickname = nickname; updateAuth();
  } catch { /* Keep account actions available so a failed read can be retried. */ }
}
function accountErrorMessage(error) {
  const code = error?.code || '', reason = error?.message || '';
  if (error?.userMessage) return error.userMessage;
  if (code === '23505') return '이미 쓰고 있는 닉네임이에요. 다른 닉네임을 적어 주세요.';
  if (/banned_word/i.test(reason)) return '닉네임에 사용할 수 없는 표현이 있어요.';
  if (code === '23514') return '닉네임은 1자부터 12자까지 적어 주세요.';
  if (code === '42501' || code === 'PGRST116') return '지금은 닉네임을 변경할 수 없어요. 문의·의견에서 도움을 요청해 주세요.';
  if (code === 'same_password' || /same password|different.*password/i.test(reason)) return '지금과 다른 비밀번호를 정해 주세요.';
  if (code === 'weak_password') return '더 안전한 비밀번호를 정해 주세요. 영문·숫자·기호를 섞어 보세요.';
  if (/reauthentication|session|jwt|not_signed_in|account_changed/i.test(code + ' ' + reason)) return '로그인 상태가 바뀌었어요. 다시 로그인한 뒤 시도해 주세요.';
  return '처리하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
}
async function accountAction(action, after) {
  if (managementBusy || !session?.user) return;
  const run = managementRun, userId = session.user.id;
  managementBusy = true; managementMessage.textContent = '처리 중이에요.';
  managementPanel.querySelectorAll('button, input').forEach(item => { item.disabled = true; });
  try {
    const result = await action(userId, run);
    if (run !== managementRun || session?.user?.id !== userId) return;
    managementBusy = false;
    after?.(result);
  } catch (error) {
    if (run === managementRun && session?.user?.id === userId) managementMessage.textContent = accountErrorMessage(error);
  } finally {
    if (run === managementRun) {
      managementBusy = false;
      managementPanel.querySelectorAll('button, input').forEach(item => { item.disabled = false; });
    }
  }
}
function accountField(form, id, label, type = 'text') {
  const caption = node('label', '', label); caption.htmlFor = id;
  const input = node('input', 'note-account-input'); input.id = id; input.type = type; input.required = true;
  input.autocomplete = type === 'password' ? 'new-password' : 'off';
  form.append(caption, input); return input;
}
function accountFormFooter(form, label, danger = false) {
  cancelManagement();
  form.id = 'note-account-form';
  const save = node('button', danger ? 'button' : 'button primary', label);
  save.type = 'submit'; save.setAttribute('form', form.id);
  if (danger) save.classList.add('note-account-danger');
  managementFooter.append(save);
}
function accountSuccess(messageText) {
  managementBody.replaceChildren(node('p', 'management-help', messageText));
  managementMessage.textContent = ''; managementFooter.replaceChildren(managementButton('확인', () => closeManagement(), true));
  managementFooter.firstElementChild.focus();
}
async function showNicknameChange() {
  const userId = session?.user?.id; if (!userId) return;
  const run = showManagement('닉네임 변경'); state(managementBody, '닉네임을 확인하고 있어요.');
  try {
    const nickname = await fetchAccountNickname(userId);
    if (run !== managementRun || session?.user?.id !== userId) return;
    const form = node('form', 'note-account-form'); form.noValidate = true;
    managementBody.replaceChildren(node('p', 'management-help', '오쭈다 계정에서 사용하는 닉네임이에요.'), form);
    const input = accountField(form, 'note-new-nickname', '닉네임'); input.value = nickname;
    const syncLimit = () => { input.maxLength = textInputMaxLength(input.value, 12); };
    input.addEventListener('input', syncLimit); syncLimit();
    accountFormFooter(form, '저장'); input.focus();
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (run !== managementRun || session?.user?.id !== userId) return;
      const value = input.value.trim();
      if (!value || maskedTextLength(value) > 12) { managementMessage.textContent = '닉네임은 1자부터 12자까지 적어 주세요.'; input.focus(); return; }
      void accountAction(async () => {
        const { data, error } = await client.from('profiles').update({ nickname: value, updated_at: new Date().toISOString() }).eq('id', userId).select('nickname').single();
        if (error) throw error;
        if (!data?.nickname) throw new Error('profile_unavailable');
        return data.nickname;
      }, saved => { accountProfileRun++; accountNickname = saved; updateAuth(); accountSuccess('닉네임을 저장했어요.'); });
    });
  } catch {
    if (run !== managementRun || session?.user?.id !== userId) return;
    state(managementBody, '닉네임을 불러오지 못했어요.');
    managementFooter.append(managementButton('다시 시도', showNicknameChange));
  }
}
function showPasswordChange() {
  const userId = session?.user?.id; if (!userId) return;
  const run = showManagement('비밀번호 변경');
  const form = node('form', 'note-account-form'); form.noValidate = true;
  managementBody.append(node('p', 'management-help', '오쭈다 계정의 비밀번호가 바뀌어요.'), form);
  const password = accountField(form, 'note-new-password', '새 비밀번호', 'password'); password.minLength = 6;
  password.placeholder = '6자 이상';
  const confirmation = accountField(form, 'note-confirm-password', '새 비밀번호 확인', 'password');
  accountFormFooter(form, '변경'); password.focus();
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (run !== managementRun || session?.user?.id !== userId) return;
    if (password.value.length < 6) { managementMessage.textContent = '비밀번호는 6자 이상 적어 주세요.'; password.focus(); return; }
    if (password.value !== confirmation.value) { managementMessage.textContent = '두 비밀번호가 달라요. 다시 확인해 주세요.'; confirmation.focus(); return; }
    void accountAction(async () => {
      const { error } = await client.auth.updateUser({ password: password.value });
      if (error) throw error;
    }, () => { password.value = ''; confirmation.value = ''; accountSuccess('비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 써 주세요.'); });
  });
}
function leaveNoteAccount() { (parkEmbedded ? window.parent : window).location.assign('/park/'); }
function showAccountLogout() {
  if (!session?.user) return;
  showManagement('로그아웃');
  managementBody.append(node('p', 'management-help', '이 브라우저에서 오쭈다 계정을 로그아웃할까요?'));
  cancelManagement();
  managementFooter.append(managementButton('로그아웃', () => accountAction(async userId => {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    if (!session?.user || session.user.id === userId) { if (session?.user) receiveAuth(null); leaveNoteAccount(); }
  }), true));
}
async function deleteNoteAccount(userId, run) {
  const current = () => {
    if (run !== managementRun || session?.user?.id !== userId) throw new Error('account_changed');
  };
  const { data, error } = await client.auth.getSession(); current();
  if (error) throw error;
  const deletionSession = data?.session;
  if (deletionSession?.user?.id !== userId || !deletionSession.access_token) throw new Error('account_changed');
  const verified = await client.auth.getUser(deletionSession.access_token); current();
  if (verified.error) throw verified.error;
  if (verified.data?.user?.id !== userId) throw new Error('account_changed');
  // Bind every destructive request to the account that confirmed this dialog.
  // A later login in another tab must never retarget the parameterless deletion RPC.
  const owner = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
    global: { headers: { Authorization: `Bearer ${deletionSession.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `ojjuda-delete-${userId}-${run}` }
  });
  try {
    if (!window.OjjudaAccountDeletion) throw new Error('deletion_module_unavailable');
    await window.OjjudaAccountDeletion.run({ client: owner, userId,
      isCurrent: () => run === managementRun && session?.user?.id === userId });
  } catch (error) {
    if (error?.message === 'account_changed') throw error;
    throw { userMessage: window.OjjudaAccountDeletion?.message(error)
      || '탈퇴 기능을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.' };
  }
  try { localStorage.removeItem(`ojjuda-note-composer-settings-v1:${userId}`); } catch {}
  composerSettingsFallback.delete(userId);
  if (session?.user?.id !== userId) return;
  try { localStorage.removeItem('ojjuda-world-v1'); } catch {}
  try { await client.auth.signOut({ scope: 'local' }); } catch {}
  if (!session?.user || session.user.id === userId) { if (session?.user) receiveAuth(null); leaveNoteAccount(); }
}
async function showAccountDeletion() {
  const userId = session?.user?.id; if (!userId) return;
  const run = showManagement('회원 탈퇴'); state(managementBody, '계정을 확인하고 있어요.');
  try {
    const nickname = await fetchAccountNickname(userId);
    if (run !== managementRun || session?.user?.id !== userId) return;
    const form = node('form', 'note-account-form'); form.noValidate = true;
    managementBody.replaceChildren(
      node('p', 'management-help note-account-warning', '탈퇴하면 오쭈다 계정이 삭제돼요. 방·다이어리·사진·영상·친구·ZU와 공원의 카드·답글·이벤트가 삭제되며 되돌릴 수 없어요.'),
      node('p', 'management-help', '계정정보는 1개월간 비공개 보관 후 삭제해요. 같은 이메일이나 전화번호로 3일(72시간) 동안 재가입할 수 없어요. 다른 사람의 방명록·댓글은 ‘탈퇴한 사용자’로 남아요.'), form);
    const input = accountField(form, 'note-delete-nickname', `확인을 위해 닉네임 ‘${nickname}’을 입력해 주세요`);
    const consentLabel = node('label', 'note-account-consent'), consent = node('input'); consent.type = 'checkbox';
    consentLabel.append(consent, node('span', '', '오쭈다 계정과 모든 활동이 삭제되는 것을 확인했어요.')); form.append(consentLabel);
    accountFormFooter(form, '탈퇴하기', true); input.focus();
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (run !== managementRun || session?.user?.id !== userId) return;
      if (input.value.trim() !== nickname) { managementMessage.textContent = '닉네임이 맞지 않아요.'; input.focus(); return; }
      if (!consent.checked) { managementMessage.textContent = '오쭈다 계정 탈퇴 안내를 확인해 주세요.'; consent.focus(); return; }
      void accountAction(deleteNoteAccount);
    });
  } catch {
    if (run !== managementRun || session?.user?.id !== userId) return;
    state(managementBody, '계정을 불러오지 못했어요.');
    managementFooter.append(managementButton('다시 시도', showAccountDeletion));
  }
}

// Card moderation stays in Note RPCs; shared account actions use the World account above.
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
let pendingCardPhotoCleanup = null;
let pendingCardShareCleanup = null;

function lockPage(locked) {
  $('.shell').inert = locked;
  document.body.style.overflow = locked ? 'hidden' : '';
}
function managementButton(label, action, primary = false, paid = false) {
  const button = node('button', (primary ? 'button primary' : 'button') + (paid ? ' ju-paid-action' : ''), label);
  button.type = 'button'; button.addEventListener('click', action); return button;
}
function showManagement(title) {
  const shareCleanup = pendingCardShareCleanup; pendingCardShareCleanup = null; shareCleanup?.();
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
  const shareCleanup = pendingCardShareCleanup; pendingCardShareCleanup = null; shareCleanup?.();
  const cleanup = pendingCardPhotoCleanup; pendingCardPhotoCleanup = null;
  if (cleanup && session?.user?.id === cleanup.userId) {
    // 카드에 실제로 붙어 있다면 저장소 정책이 삭제를 거부합니다.
    void removeCardMediaFiles(cleanup.path, cleanup.videoPath);
  }
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
function noteSpamMessage(error) {
  if (!['PNS01', 'PNS02'].includes(error?.code)) return '';
  let details = {};
  try { details = JSON.parse(error.details || '{}'); } catch { /* Use safe defaults below. */ }
  const amount = (value, fallback) => Number.isSafeInteger(value) && value > 0 ? value : fallback;
  if (error.code === 'PNS01') return `같은 글은 연속 ${amount(details.max_consecutive, 2)}회까지만 쓸 수 있어요. 내용을 바꿔 주세요.`;
  const seconds = amount(details.window_seconds, 60);
  const windowText = seconds % 60 === 0 ? `${seconds / 60}분` : `${seconds}초`;
  return `${windowText}에 ${amount(details.max_posts, 2)}개까지만 쓸 수 있어요. ${amount(details.retry_after_seconds, 1)}초 뒤 다시 시도해 주세요.`;
}
async function noteRpc(name, parameters = {}, signal = null) {
  if (parameters.p_lat != null || parameters.p_lon != null) {
    const userId = session?.user?.id, epoch = identityEpoch;
    try {
      if (!authKnown || !userId || !window.OjjudaLocation?.authorizePosition)
        throw Error('로그인 후 위치를 이용해 주세요.');
      await window.OjjudaLocation.authorizePosition(client, userId, { park: true, signal });
      if (epoch !== identityEpoch || userId !== session?.user?.id) throw Error('회원 정보를 다시 확인해 주세요.');
    } catch (error) {
      if (epoch !== identityEpoch || userId !== session?.user?.id) throw error;
      nearbyPosition = null; writingPosition = null;
      if (signal?.aborted || !['list_cards','get_card'].includes(name) || parameters.p_sort === 'nearby') throw error;
      parameters = { ...parameters, p_lat: null, p_lon: null };
    }
  }
  const pending = query().rpc(name, parameters);
  const { data, error } = await (signal && typeof pending.abortSignal === 'function'
    ? pending.abortSignal(signal) : pending);
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
      : reason === 'coins' ? 'ZU 잔액이 부족해요. 공원 상단에서 잔액을 확인해 주세요.'
        : reason === 'card_unavailable' ? '이 카드는 삭제되었거나 현재 영구보관할 수 없어요.'
          : '처리하지 못했어요. 로그인과 권한을 확인한 뒤 다시 시도해 주세요.';
  } finally {
    if (run === managementRun) {
      managementBusy = false;
      managementPanel.querySelectorAll('button, textarea').forEach(item => { item.disabled = false; });
    }
  }
}
async function managementPhotoAction(cardId, key, requestId, after) {
  if (managementBusy || !session?.user) return;
  const run = managementRun, userId = session.user.id;
  managementBusy = true; managementMessage.textContent = '구매 내역을 확인하는 중이에요.';
  managementPanel.querySelectorAll('button').forEach(item => { item.disabled = true; });
  let action;
  try { action = await photoActionFor(key, userId); }
  catch (error) {
    console.warn('Note photo entitlement:', error);
    if (run === managementRun) managementMessage.textContent = '구매 내역을 확인하지 못했어요. 다시 시도해 주세요.';
  } finally {
    if (run === managementRun) {
      managementBusy = false;
      managementPanel.querySelectorAll('button').forEach(item => { item.disabled = false; });
    }
  }
  if (!action || run !== managementRun || session?.user?.id !== userId) {
    if (run === managementRun && action === null) managementMessage.textContent = '';
    return;
  }
  managementMessage.textContent = '';
  await managementAction(async () => {
    const result = await noteRpc(action, { p_card_id: cardId, p_photo_key: key,
      p_request_id: action === 'apply_owned_card_photo' ? crypto.randomUUID() : requestId });
    void loadPhotoEntitlements(userId).catch(error => console.warn('Note photo entitlement:', error));
    return result;
  }, after);
}
function refreshVisibleCard() {
  // Revalidate the visible thread now and its list once when the reader returns.
  feedRun++; feedLoading = false; feedDeferred = true;
  cache.clear();
  return renderDetail();
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
  managementBody.append(node('p', 'management-help', '공원의 글과 차단 설정을 관리합니다.'));
  if (card.is_mine) {
    const eventEnded = card.kind === 'event' && Date.parse(card.event_ends_at) <= Date.now();
    if (eventEnded) managementBody.append(node('p', 'management-help', '종료된 이벤트는 수정할 수 없지만 삭제할 수 있어요.'));
    else managementBody.append(managementButton(card.kind === 'event' ? '이벤트 수정' : '수정하기', () => { closeManagement(); openComposer('edit', card); }));
    if (card.kind === 'memo') {
      managementBody.append(managementButton('제공 배경 선택 · 구매한 사진은 기간 내 무료', () => showPhotoChoices(card)));
    }
    if (['memo', 'comment'].includes(card.kind) && !card.permanent) {
      managementBody.append(managementButton('영구보관 · 10 ZU', () => confirmPermanent(card), false, true));
    }
    managementBody.append(managementButton('삭제하기', () => confirmDelete(card)));
  } else {
    managementBody.append(managementButton('신고하기', () => card.kind === 'event' ? reportEvent(card) : reportCard(card)));
    if (card.kind !== 'event') managementBody.append(managementButton('작성자 차단', () => confirmBlock(card)));
  }
  cancelManagement();
}
function showPhotoChoices(card) {
  const run = showManagement('배경 선택'), userId = session?.user?.id;
  managementBody.append(node('p', 'management-help', '배경별로 10 ZU를 내면 1개월 동안 다른 카드에도 추가 결제 없이 적용할 수 있어요. 기간이 끝나면 다시 구매할 수 있으며 자동 연장은 하지 않아요.'));
  if (card.photo_until) managementBody.append(node('p', 'management-help', `현재 사진 만료: ${dateLabel(card.photo_until)}`));
  const groups = node('div', 'note-photo-groups');
  groups.setAttribute('role', 'group'); groups.setAttribute('aria-label', '배경 종류');
  const choices = node('div', 'note-photo-choice');
  const pages = node('div', 'note-photo-pages');
  let page = photoPageFor(photoAssetKey(card.photo_key || card.background_key) || PHOTO_FIRST);
  const render = () => {
    choices.replaceChildren(); pages.replaceChildren();
    const first = PHOTO_FIRST + page * PHOTO_PAGE_SIZE;
    const group = photoGroupFor(first);
    const startPage = photoPageFor(group.first), endPage = photoPageFor(group.last);
    markPhotoGroup(groups, group);
    for (let number = first; number <= Math.min(group.last, first + PHOTO_PAGE_SIZE - 1); number++) {
      const key = String(number), title = photoName(key);
      const button = node('button', 'button'); button.type = 'button';
      const img = photoThumbnail(key);
      const ownedUntil = activePhotoEntitlement(key);
      button.classList.toggle('ju-paid-choice', !ownedUntil);
      button.append(img, node('strong', '', title), node('small', '', ownedUntil ? `${dateLabel(ownedUntil)}까지 사용` : '구매·갱신 10 ZU · 1개월'));
      button.addEventListener('click', async () => {
        const requestId = crypto.randomUUID();
        await managementPhotoAction(card.id, key, requestId,
          async () => { closeManagement(); await refreshCards(stack.length > 0); await loadWorldBalance(session?.user?.id); });
        // A declined or failed purchase leaves the picker open. Restore its page boundaries.
        if (run === managementRun && session?.user?.id === userId && !managementBusy) render();
      });
      choices.append(button);
    }
    const prev = node('button', 'button', '이전'); prev.type = 'button'; prev.disabled = page === startPage;
    prev.addEventListener('click', () => { page--; render(); });
    const next = node('button', 'button', '다음'); next.type = 'button';
    next.disabled = page === endPage;
    next.addEventListener('click', () => { page++; render(); });
    pages.append(prev, node('span', '', `${page - startPage + 1} / ${endPage - startPage + 1}`), next);
  };
  installPhotoGroups(groups, group => { page = photoPageFor(group.first); render(); });
  render(); managementBody.append(groups, choices, pages); cancelManagement();
  if (userId) void loadPhotoEntitlements(userId).then(() => {
    if (run === managementRun && session?.user?.id === userId && !managementBusy) render();
  }).catch(error => {
    console.warn('Note photo entitlement:', error);
    if (run === managementRun) managementMessage.textContent = '구매 내역은 배경을 누르면 다시 확인할 수 있어요.';
  });
}
function confirmPermanent(card) {
  showManagement('영구보관할까요?');
  managementBody.append(node('p', 'management-help', card.kind === 'comment'
    ? '상위 카드가 모두 영구보관되어야 답글을 영구보관할 수 있어요. 10 ZU가 한 번 차감됩니다. 상위 카드 작성자가 삭제하거나 탈퇴하면 영구보관된 답글도 함께 삭제될 수 있습니다.'
    : '이 카드를 영구보관하면 10 ZU가 차감돼요. 같은 카드에 다시 결제하지 않아요.'));
  cancelManagement();
  const requestId = crypto.randomUUID();
  managementFooter.append(managementButton('10 ZU로 영구보관', () => managementAction(
    () => purchasePermanent(card.id, requestId),
    async () => { closeManagement(); await refreshCards(stack.length > 0); await loadWorldBalance(session?.user?.id); await notificationController?.refresh?.(); }
  ), true, true));
}
function confirmDelete(card) {
  showManagement(card.kind === 'event' ? '이벤트를 삭제할까요?' : '카드를 삭제할까요?');
  managementBody.append(node('p', 'management-help', card.kind === 'event'
    ? '이벤트가 즉시 내려갑니다. 이미 결제한 ZU는 돌려받지 않아요. 관리자는 삭제 내용을 1개월 동안 확인할 수 있어요.'
    : '공개 화면에서 내리고 이어진 답글도 함께 숨겨요. 관리자는 1개월 동안 복구할 수 있고, 이후 영구 삭제됩니다.'));
  cancelManagement();
  managementFooter.append(managementButton(card.kind === 'event' ? '이벤트 삭제' : '카드와 답글 삭제', () => managementAction(async () => {
    const count = await noteRpc('archive_my_card', { p_card_id: card.id });
    if (count !== 1) throw new Error('삭제할 카드를 찾지 못했어요.');
  }, async () => { closeManagement(); await refreshCards(false); }), true));
}
function reportCard(card) {
  closeManagement();
  window.OjjudaNoteSupport?.report({ content: card.body, onSubmit: async ({ reasonText, isCurrent }) => {
    if (!isCurrent() || !session?.user) throw new Error('Report unavailable');
    await noteRpc('report_card', { p_card_id: card.id, p_reason: reasonText });
  }});
}
function reportEvent(card) {
  closeManagement();
  window.OjjudaNoteSupport?.report({ content: card.body,
    help: '이벤트 범위 안에 있는지 위치를 다시 확인해요. 정확한 GPS 좌표는 공개되지 않고 신고 확인에만 사용됩니다.',
    submitLabel: '위치 확인 후 신고',
    onSubmit: async ({ reasonText, isCurrent }) => {
      let position;
      try { position = await currentPosition(); }
      catch { throw { userMessage: '위치를 확인하지 못했어요. 권한을 확인하고 다시 시도해 주세요.' }; }
      if (!isCurrent() || !session?.user) throw new Error('Report unavailable');
      await noteRpc('report_event', { p_card_id: card.id, p_reason: reasonText,
        p_lat: position.latitude, p_lon: position.longitude });
    }
  });
}
function confirmBlock(card) {
  showManagement('작성자를 차단할까요?');
  managementBody.append(node('p', 'management-help', '이 작성자의 카드와 이어진 답글이 내 노트 화면에서 숨겨집니다. 차단 목록에서 해제할 수 있어요. 아지트의 차단 설정에는 적용되지 않습니다.'));
  cancelManagement();
  managementFooter.append(managementButton('공원에서 차단', () => managementAction(
    () => noteRpc('block_card_author', { p_card_id: card.id }),
    async () => { closeManagement(); await refreshCards(false); }
  ), true));
}
async function showBlocks() {
  if (!session?.user) return;
  const run = showManagement('공원 차단 목록');
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
  $('#note-change-nickname').addEventListener('click', showNicknameChange);
  $('#note-change-password').addEventListener('click', showPasswordChange);
  $('#note-logout').addEventListener('click', showAccountLogout);
  const tools = node('div', 'note-tools');
  const blocks = managementButton('차단 목록', showBlocks); blocks.id = 'note-blocks'; blocks.hidden = true;
  const reports = managementButton('관리자 모드 열기', () => {
    if (!moderator || !session?.user) return;
    (parkEmbedded ? window.parent : window).location.assign('/admin/?from=park&admin=cards');
  }); reports.id = 'note-moderation'; reports.className = 'btn pri'; reports.hidden = true;
  $('#note-admin-entry').append(reports);
  const memberInfo = managementButton('내 회원정보', () => showMemberInfo()); memberInfo.id = 'note-member-info'; memberInfo.hidden = true;
  tools.append(memberInfo, blocks); $('#side-tools').append(tools);
  managementClose.addEventListener('click', () => { if (!window.OjjudaParkHistory?.closeOverlay?.()) closeManagement(); });
  management.addEventListener('click', event => { if (event.target === management && !window.OjjudaParkHistory?.closeOverlay?.()) closeManagement(); });
  document.addEventListener('keydown', event => {
    const dialog = !management.hidden ? managementPanel : !backdrop.hidden ? $('.composer') : null;
    if (!dialog) return;
    if (event.key === 'Escape' && !management.hidden) { event.preventDefault(); closeManagement(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')]
      .filter(item => !item.hidden && item.tabIndex >= 0 && item.getClientRects().length > 0);
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
  if (open && !open.disabled) { openCard(open.dataset.open, open); return; }
  const compose = event.target.closest('[data-compose]');
  if (compose) { openComposer(compose.dataset.compose, null, compose.dataset.replyTo); return; }
  const show = event.target.closest('[data-show="feed"]');
  if (show) { show.classList.contains('back-button') ? returnToParentCard() : selectCollection('all'); return; }
  if (event.target.closest('[data-more-feed]')) { loadFeed(true); return; }
  const retryFeed = event.target.closest('[data-retry-feed]');
  if (retryFeed) { retryFeed.remove(); loadFeed(retryFeed.dataset.retryFeed === 'more'); return; }
  if (event.target.closest('[data-more-replies]')) { loadReplies(stack.at(-1), detailRun, true); return; }
  const retryReplies = event.target.closest('[data-retry-replies]');
  if (retryReplies) { retryReplies.remove(); loadReplies(stack.at(-1), detailRun, retryReplies.dataset.retryReplies === 'more'); }
});
function requestCloseComposer() {
  if (window.canCloseParkNote?.() !== false) closeComposer();
}
$('#convert-calligraphy').addEventListener('click', toggleCalligraphy);
$('#guest-compose-login').addEventListener('click', event => {
  event.preventDefault();
  event.stopPropagation();
  loginForComposer(false);
});
$('#close-composer').addEventListener('click', requestCloseComposer);
backdrop.addEventListener('click', event => { if (event.target === backdrop) requestCloseComposer(); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || event.defaultPrevented || backdrop.hidden) return;
  if (composerTools?.close()) { event.preventDefault(); return; }
  requestCloseComposer();
});
text.addEventListener('input', () => { if (autoTagMode && document.activeElement !== tags) refreshAutoTags(); updateComposer(); recordDraft(); });
text.addEventListener('focus', syncComposeInkDisplay);
text.addEventListener('blur', syncComposeInkDisplay);
text.addEventListener('compositionstart', () => { composeInkComposing = true; syncComposeInkDisplay(); });
text.addEventListener('compositionend', () => { composeInkComposing = false; if (autoTagMode) refreshAutoTags(); updateComposer(); });
tags.addEventListener('input', () => { noteTagEdit(); updateComposer(); });
tags.addEventListener('focus', () => updateComposer()); tags.addEventListener('blur', () => updateComposer());
window.addEventListener('resize', () => { if (!backdrop.hidden) updateComposer(); requestTagFit(); });
document.fonts?.addEventListener?.('loadingdone', () => { if (!backdrop.hidden) updateComposer(); requestTagFit(); });
submit.addEventListener('click', publishCard);
document.querySelectorAll('input[name="identity"]').forEach(input => input.addEventListener('change', () => {
  rememberComposerSetting('identity', input.value); updateComposer(); recordDraft();
}));
document.querySelectorAll('input[name="gender"]').forEach(input => input.addEventListener('change', () => {
  if (input.value === 'private' || input.value === myGender) rememberComposerSetting('gender', input.value === 'private' ? 'private' : 'profile');
  syncQuickChoices();
}));
$('#quick-identity')?.addEventListener('change', event => pickQuickChoice('identity', event.target.value));
$('#card-photo-file')?.addEventListener('change', event => {
  const file = event.target.files?.[0]; event.target.value = '';
  if (file) void selectCardPhoto(file);
});
$('#card-photo-attach')?.addEventListener('click', event => {
  if (event.target.closest('input')) return;
  event.preventDefault();
  if (!session?.user) { $('#card-photo-file').click(); return; }
  selectDevicePhoto('card', event.currentTarget);
});
$('#card-photo-attach')?.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  const input = $('#card-photo-file');
  if (!event.currentTarget.hidden && !input.disabled) {
    if (session?.user) selectDevicePhoto('card', event.currentTarget);
    else input.click();
  }
});
$('#card-photo-remove')?.addEventListener('click', event => {
  event.preventDefault(); clearCardPhoto(); updateComposer();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') scheduleCardPhotoRefresh();
  else closePhotoLightbox();
});
window.addEventListener('pagehide', closePhotoLightbox);
$('#quick-gender')?.addEventListener('change', event => pickQuickChoice('gender', event.target.value));


function receiveAuth(current) {
  const previousUserId=session?.user?.id;
  const firstSession = !authKnown;
  const changed = session?.user?.id !== current?.user?.id;
  session = current; authKnown = true;
  window.OjjudaParkAccount?.syncIdentity();
  if (changed) {
    stopLocationPreference();writingLocationController?.abort();window.OjjudaLocation?.forget(previousUserId);
    accountNickname = null; accountProfileRun++;
    identityEpoch++;
    myIdentity = null; myIdentityReady = false; myIdentityPromise = null; myGender = 'private'; setGenderInputs(true);
    // Remove prior-account content immediately, before asynchronous requests finish.
    cardPhotoCache.clear(); cardPhotoWanted.clear();
    clearTimeout(cardPhotoTimer); clearTimeout(cardPhotoRefreshTimer);
    cardPhotoTimer = null; cardPhotoRefreshTimer = null;
    photoLightboxFocus = null; closePhotoLightbox();
    photoEntitlements = new Map(); photoEntitlementRun++;
    worldCoins = null; balanceRun++; moderator = false; moderatorRun++;
    nearbyPosition = null; writingPosition = null; eventPosition = null;
    noteState = null; noteStateRun++; reactionPending.clear(); message('');
    composerRun++; busy = false; draftLoading = false; draftController?.setUser(current?.user?.id); setComposerInputs();
    notificationController?.close?.();
    feedRun++; detailRun++; ready = false; feedDeferred = false; cache.clear(); stack.length = 0;
    slot.replaceChildren(); replies.replaceChildren(); state(list, '카드를 불러오는 중이에요.');
    closeManagement(true); backdrop.hidden = true; clearEventPhoto(); clearCardPhoto(); lockPage(false);
    text.value = ''; tags.value = ''; editingId = null; composerUserId = null;
    showFeed(!initialCardId);
  }
  if (firstSession || changed) resetPopularTags?.();
  updateAuth();
  // Start the feed once for this identity, outside the auth callback.
  const epoch = identityEpoch;
  setTimeout(() => {
    if (epoch !== identityEpoch) return;
    if (firstSession || changed) {
      watchLocationPreference(current?.user?.id);
      feedDeferred = validCardId(initialCardId);
      if (feedDeferred) consumeInitialCard();
      else void loadFeed();
    }
    draftController?.setUser(current?.user?.id);
    loadWorldBalance(current?.user?.id); loadModerator(current?.user?.id); loadNoteState();
    if (changed || accountNickname === null) void loadAccountProfile(current?.user?.id);
    if (current?.user?.id && !myIdentityReady) void loadMyGender(current.user.id).catch(() => {});
    notificationController?.refresh?.();
    if (!firstSession && !changed) consumeInitialCard();
  }, 0);
}

installManagement(); installStyleChoices(); installFeatures(); installStageAuth(); installComposerSheet();
function installComposerSheet() {
  if (window.OjjudaComposerTools) {
    composerTools = window.OjjudaComposerTools.install({
      onOpen: panel => { if (panel === 'location') requestAnimationFrame(() => eventMap?.invalidate?.()); }
    });
    syncComposerTools();
    return;
  }
  const more = $('#compose-more'), body = $('.composer-body'), summary = more?.querySelector('summary');
  if (!more || !body || !summary) return;
  const settle = () => {
    const photo = $('.compose-photo');
    const stickyTop = photo ? parseFloat(getComputedStyle(photo).top) || 0 : 0;
    const visiblePhotoHeight = Math.max(0, (photo?.offsetHeight || 0) + stickyTop);
    body.scrollTo({ top: Math.max(0, more.offsetTop - visiblePhotoHeight - 10), behavior: 'smooth' });
  };
  more.addEventListener('toggle', () => { if (more.open) requestAnimationFrame(settle); });
  let drag = null, skipClick = false;
  summary.addEventListener('pointerdown', event => { drag = { y: event.clientY, top: body.scrollTop, moved: false, id: event.pointerId }; });
  summary.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) > 6) { drag.moved = true; try { summary.setPointerCapture(event.pointerId); } catch {} }
    if (!drag.moved) return;
    event.preventDefault();
    if (!more.open && dy < -12) more.open = true;   // 끌어올리면 열려요
    body.scrollTop = drag.top - dy;
  });
  const end = event => { if (drag?.moved) skipClick = true; drag = null; try { summary.releasePointerCapture(event.pointerId); } catch {} };
  summary.addEventListener('pointerup', end); summary.addEventListener('pointercancel', end);
  summary.addEventListener('click', event => { if (skipClick) { event.preventDefault(); skipClick = false; } });
}
window.OjjudaCharge?.install({ client, getUserId: () => session?.user?.id || null, source: 'note',
  onBalance: (coins, userId) => { if (session?.user?.id === userId) { balanceRun++; worldCoins = coins; updateAuth(); } } });
window.OjjudaNoteSupport?.install({ client, getUserId: () => session?.user?.id || null, source: 'note',
  getScreen: () => document.body.classList.contains('note-my-open') ? 'my' : detail.hidden ? feedMode : 'card', appVersion: '0.45.50-beta',
  onWithdrawal: () => {
    if (!session?.user || managementBusy || window.canCloseParkNote?.() === false) return;
    void showAccountDeletion();
  }
});
notificationController = window.OjjudaNoteNotifications?.install({
  refreshClosedBadge: !parkEmbedded, // World owns the visible bell when Park is embedded.
  onGiftClaimed: userId => loadWorldBalance(userId),
  client, getUserId: () => session?.user?.id || null,
  onOpenCard: id => { window.OjjudaNoteNavigation?.leaveMy(); openCard(id); },
  canOpenWorldTarget: type => !parkJunior() && (type === 'friends' || type === 'message'),
  allowInviteNavigation: false,
  onOpenWorld: (type,id) => {
    if (type === 'friends') window.OjjudaParkFull?.navigate('friends');
    if (type === 'message') void window.OjjudaParkAccount?.messages()?.openMessage(id);
  },
  onOpenInquiry: id => window.OjjudaNoteSupport?.open?.(id),
  onKeepCard: (id, cardKind) => confirmPermanent({ id, kind: cardKind })
});
if (client) {
  client.auth.onAuthStateChange((event, current) => {
    // Do not show a public guest entrance before the stored session is loaded.
    if (event === 'INITIAL_SESSION' && !current?.user) return;
    authEventVersion++;
    receiveAuth(current);
  });
  const initialAuthVersion = authEventVersion;
  feedWithinDeadline(client.auth.getSession()).then(({ data, error }) => {
    if (authEventVersion !== initialAuthVersion) return;
    if (error) console.warn('Note Auth:', error);
    receiveAuth(error ? null : data?.session || null);
  }).catch(error => {
    console.warn('Note Auth:', error);
    if (authEventVersion === initialAuthVersion) receiveAuth(null);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    loadWorldBalance(session?.user?.id); loadNoteState(); notificationController?.refresh?.();
    void loadAccountProfile(session?.user?.id);
    if (backdrop.hidden && management.hidden) {
      if (stack.length) void refreshVisibleCard();
      else void refreshCards(false);
    }
  });
} else {
  authKnown = true; banner('공원 연결 설정을 확인해 주세요');
  state(list, '카드를 불러올 수 없어요.'); updateAuth();
}

document.addEventListener('ojjuda:decoration-style',()=>{if(!backdrop.hidden){applyComposeStyle();recordDraft();}});
