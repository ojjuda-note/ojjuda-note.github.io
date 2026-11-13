import { isoToDay, todayInSeoul } from './engine.mjs?v=20261113-biorhythm1';

// Input conveniences only. Birthdays stay in this browser, scoped to a member.
// No network, billing, reading, balance, or 24-hour access data belongs here.
export const SAVED_BIRTHDAYS_PREFIX = 'ojjuda-biorhythm-birthdays-v1:';
export const SAVED_BIRTHDAYS_LIMIT = 20;
const MAX_JSON_LENGTH = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const messages = Object.freeze({
  not_signed_in: '로그인하면 입력한 생일을 이 브라우저에 저장할 수 있어요.',
  account_changed: '로그인한 계정이 바뀌었어요. 생일 목록을 다시 확인해 주세요.',
  invalid_birth: '실제로 있는 양력 생년월일을 입력해 주세요.',
  future_birth: '미래의 날짜는 생일로 저장할 수 없어요.',
  clock: '기기의 현재 날짜를 확인해 주세요.',
  limit: '생일은 최대 20개까지 저장해요. 필요 없는 생일을 삭제한 뒤 다시 입력해 주세요.',
  not_found: '이 생일이 목록에서 삭제됐어요. 다시 확인해 주세요.',
  storage_unavailable: '생일을 저장하거나 불러오지 못했어요. 브라우저의 저장 설정을 확인해 주세요.',
  storage_full: '이 브라우저의 저장 공간이 부족해 생일을 저장하지 못했어요.',
  corrupt: '저장된 생일 목록을 읽지 못했어요. 새로고침한 뒤 다시 확인해 주세요.',
  unsupported_version: '생일 목록의 저장 형식이 달라요. 최신 화면으로 새로고침해 주세요.'
});

export class SavedBirthdayError extends Error {
  constructor(code) {
    const key = Object.hasOwn(messages, code) ? code : 'storage_unavailable';
    super(messages[key]);
    this.name = 'SavedBirthdayError';
    this.code = key;
  }
}
const fail = code => { throw new SavedBirthdayError(code); };
const storageError = error => new SavedBirthdayError(error?.name === 'QuotaExceededError' ? 'storage_full' : 'storage_unavailable');
const sameKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

export function normalizeSavedBirthday(value, { now = new Date() } = {}) {
  try { isoToDay(value); } catch { fail('invalid_birth'); }
  let today;
  try { today = todayInSeoul(now); } catch { fail('clock'); }
  if (value > today) fail('future_birth');
  return value;
}

export class BiorhythmSavedBirthdays {
  constructor(options = {}) {
    if (typeof options.getIdentity !== 'function') throw new TypeError('getIdentity is required');
    this.getIdentity = options.getIdentity;
    this.storageOption = Object.hasOwn(options, 'storage') ? () => options.storage : () => globalThis.localStorage;
    this.now = options.now || (() => new Date());
  }
  ownerId() {
    let identity;
    try { identity = this.getIdentity(); } catch { fail('not_signed_in'); }
    if (identity?.anonymous !== false || typeof identity.userId !== 'string' || !UUID.test(identity.userId)) fail('not_signed_in');
    return identity.userId.toLowerCase();
  }
  assertOwner(owner) {
    let current;
    try { current = this.ownerId(); } catch { fail('account_changed'); }
    if (current !== owner) fail('account_changed');
  }
  storage() {
    try {
      const storage = this.storageOption();
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error();
      return storage;
    } catch (error) { throw storageError(error); }
  }
  read(owner, storage) {
    this.assertOwner(owner);
    let raw;
    try { raw = storage.getItem(SAVED_BIRTHDAYS_PREFIX + owner); } catch (error) { throw storageError(error); }
    this.assertOwner(owner);
    if (raw === null) return [];
    if (typeof raw !== 'string' || raw.length > MAX_JSON_LENGTH) fail('corrupt');
    let envelope;
    try { envelope = JSON.parse(raw); } catch { fail('corrupt'); }
    if (!sameKeys(envelope, ['version', 'owner', 'birthdays'])) fail('corrupt');
    if (envelope.version !== 1) fail('unsupported_version');
    if (envelope.owner !== owner || !Array.isArray(envelope.birthdays)
      || envelope.birthdays.length > SAVED_BIRTHDAYS_LIMIT) fail('corrupt');
    const now = this.now(), birthdays = [];
    for (const birth of envelope.birthdays) {
      try { normalizeSavedBirthday(birth, { now }); } catch { fail('corrupt'); }
      if (birthdays.includes(birth)) fail('corrupt');
      birthdays.push(birth);
    }
    this.assertOwner(owner);
    return birthdays;
  }
  write(owner, storage, birthdays) {
    this.assertOwner(owner);
    const value = JSON.stringify({ version: 1, owner, birthdays });
    try { storage.setItem(SAVED_BIRTHDAYS_PREFIX + owner, value); } catch (error) { throw storageError(error); }
    this.assertOwner(owner);
    let actual;
    try { actual = storage.getItem(SAVED_BIRTHDAYS_PREFIX + owner); } catch (error) { throw storageError(error); }
    this.assertOwner(owner);
    if (actual !== value) fail('storage_unavailable');
  }
  list() {
    const owner = this.ownerId();
    return this.read(owner, this.storage());
  }
  save(value, { expectedOwner = null } = {}) {
    const owner = this.ownerId();
    if (expectedOwner !== null && (typeof expectedOwner !== 'string' || expectedOwner.toLowerCase() !== owner)) fail('account_changed');
    const birth = normalizeSavedBirthday(value, { now: this.now() });
    const storage = this.storage(), birthdays = this.read(owner, storage);
    if (birthdays.includes(birth)) return birth;
    if (birthdays.length >= SAVED_BIRTHDAYS_LIMIT) fail('limit');
    this.write(owner, storage, [birth, ...birthdays]);
    return birth;
  }
  remove(value, { expectedOwner = null } = {}) {
    const owner = this.ownerId();
    if (expectedOwner !== null && (typeof expectedOwner !== 'string' || expectedOwner.toLowerCase() !== owner)) fail('account_changed');
    const birth = normalizeSavedBirthday(value, { now: this.now() });
    const storage = this.storage(), birthdays = this.read(owner, storage);
    if (!birthdays.includes(birth)) return false;
    this.write(owner, storage, birthdays.filter(item => item !== birth));
    return true;
  }
}

let nextHeading = 0;
export function createSavedBirthdays(options = {}) {
  const { container, onSelect = () => {}, onMessage = () => {} } = options;
  if (!container?.ownerDocument) throw new TypeError('A saved-birthday container is required');
  const store = new BiorhythmSavedBirthdays(options);
  const document = container.ownerDocument, view = document.defaultView;
  const node = (tag, className, text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const section = node('section', 'saved-birthdays');
  const heading = node('h3', 'saved-birthdays-title', '저장한 생일');
  heading.id = `saved-birthdays-title-${++nextHeading}`;
  section.setAttribute('aria-labelledby', heading.id);
  const help = node('p', 'saved-birthdays-help', '이 브라우저에 회원별로 저장해요. 목록 선택·삭제는 쭈를 사용하지 않아요.');
  const list = node('ul', 'saved-birthdays-list');
  list.setAttribute('aria-label', '저장한 생일 목록');
  const empty = node('p', 'saved-birthdays-empty');
  const status = node('p', 'saved-birthdays-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  section.append(heading, help, list, empty, status);
  container.replaceChildren(section);
  let owner = null, birthdays = [], disabled = false, destroyed = false;

  function report(message, error = false, notify = true, code = null) {
    if (destroyed) return;
    status.textContent = message;
    status.setAttribute('role', error ? 'alert' : 'status');
    status.setAttribute('aria-live', error ? 'assertive' : 'polite');
    if (notify) { try { onMessage(message, { error, code }); } catch {} }
  }
  function currentOwner() {
    try { return store.ownerId(); } catch { return null; }
  }
  function label(birth) {
    const [year, month, day] = birth.split('-');
    return `양력 ${year}. ${month}. ${day}.`;
  }
  function live(expectedOwner) {
    if (destroyed) return false;
    if (currentOwner() !== expectedOwner || !expectedOwner) {
      refresh();
      return false;
    }
    return !disabled;
  }
  function render() {
    list.replaceChildren();
    list.hidden = birthdays.length === 0;
    empty.hidden = birthdays.length > 0;
    empty.textContent = owner ? '생일을 입력하면 여기에 자동으로 저장돼요.' : messages.not_signed_in;
    const renderedOwner = owner;
    for (const birth of birthdays) {
      const item = node('li', 'saved-birthday');
      const use = node('button', 'saved-birthday-use', label(birth));
      use.type = 'button'; use.disabled = disabled;
      use.setAttribute('aria-label', `${label(birth)} 입력하기`);
      use.addEventListener('click', () => {
        if (!live(renderedOwner) || !container.contains(use)) return;
        try {
          if (!store.list().includes(birth)) { refresh(); throw new SavedBirthdayError('not_found'); }
          store.assertOwner(renderedOwner);
          onSelect(birth);
        } catch (error) { handleError(error); }
      });
      const remove = node('button', 'saved-birthday-delete', '삭제');
      remove.type = 'button'; remove.disabled = disabled;
      remove.setAttribute('aria-label', `${label(birth)} 목록에서 삭제`);
      remove.addEventListener('click', () => {
        if (!live(renderedOwner) || !container.contains(remove)) return;
        try {
          const index = birthdays.indexOf(birth);
          const removed = store.remove(birth, { expectedOwner: renderedOwner });
          if (!refresh()) return;
          report(removed ? '목록에서 생일을 삭제했어요. 이용권은 그대로 유지돼요.' : messages.not_found, !removed);
          const buttons = list.querySelectorAll('.saved-birthday-delete');
          (buttons[Math.min(index, buttons.length - 1)] || heading).focus();
        } catch (error) { handleError(error); }
      });
      item.append(use, remove); list.append(item);
    }
  }
  function handleError(error, notify = true) {
    if (destroyed) return;
    if (currentOwner() !== owner || error?.code === 'account_changed' || error?.code === 'not_signed_in') {
      owner = null; birthdays = []; render();
    }
    report(error instanceof SavedBirthdayError ? error.message : messages.storage_unavailable, true, notify, error?.code || 'storage_unavailable');
  }
  function refresh() {
    if (destroyed) return false;
    owner = currentOwner(); birthdays = [];
    report('', false, false);
    if (!owner) { render(); return true; }
    try {
      birthdays = store.list();
      store.assertOwner(owner);
      render();
      return true;
    } catch (error) {
      birthdays = []; render(); handleError(error, false); return false;
    }
  }
  function save(birth, { announce = true, expectedOwner = null } = {}) {
    if (destroyed) return null;
    const targetOwner = expectedOwner || owner || currentOwner();
    try {
      const saved = store.save(birth, { expectedOwner: targetOwner });
      if (!refresh()) return null;
      report('생일을 목록에 저장했어요.', false, announce);
      return saved;
    } catch (error) { handleError(error, announce); return null; }
  }
  function clearView() {
    if (destroyed) return;
    owner = null; birthdays = []; report('', false, false); render();
  }
  function setDisabled(value) {
    if (destroyed) return;
    disabled = value === true;
    for (const button of list.querySelectorAll('button')) button.disabled = disabled;
  }
  function storageChanged(event) {
    if (destroyed) return;
    const current = currentOwner();
    if (current !== owner || event.key === null || event.key === SAVED_BIRTHDAYS_PREFIX + current) refresh();
  }
  function destroy() {
    if (destroyed) return;
    destroyed = true; owner = null; birthdays = [];
    view?.removeEventListener('storage', storageChanged);
    container.replaceChildren();
  }
  heading.tabIndex = -1;
  view?.addEventListener('storage', storageChanged);
  refresh();
  return Object.freeze({ refresh, save, clearView, setDisabled, destroy });
}
