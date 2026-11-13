import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  BiorhythmSavedBirthdays, createSavedBirthdays, normalizeSavedBirthday,
  SAVED_BIRTHDAYS_LIMIT, SAVED_BIRTHDAYS_PREFIX
} from '../features/biorhythm/saved-birthdays.mjs';

const { JSDOM } = createRequire(import.meta.url)('jsdom');
const MEMBER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MEMBER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NOW = Date.parse('2026-11-13T03:00:00Z');
const code = expected => error => error?.name === 'SavedBirthdayError' && error.code === expected;
function memoryStorage() {
  return {
    values: new Map(), reads: [], writes: [],
    getItem(key) { this.reads.push(key); return this.values.get(key) ?? null; },
    setItem(key, value) { this.writes.push([key, value]); this.values.set(key, value); }
  };
}
function fixture(options = {}) {
  let identity = { userId: MEMBER_A, anonymous: false }, now = NOW;
  const storage = options.storage || memoryStorage();
  const settings = { getIdentity: () => identity, storage, now: () => new Date(now), ...options };
  const store = new BiorhythmSavedBirthdays(settings);
  return {
    storage, store, settings,
    identity(value) { identity = value; },
    owner(value) { identity = { userId: value, anonymous: false }; },
    advance(value) { now += value; },
    raw: () => storage.values.get(SAVED_BIRTHDAYS_PREFIX + MEMBER_A)
  };
}
function harness(t, f = fixture(), options = {}) {
  const dom = new JSDOM('<form><div id="birthdays"></div></form>', { url: 'https://ojjuda.kr/features/biorhythm/' });
  const container = dom.window.document.querySelector('#birthdays'), selections = [], messages = [];
  let submissions = 0;
  container.closest('form').addEventListener('submit', event => { event.preventDefault(); submissions++; });
  const picker = createSavedBirthdays({ ...f.settings, container,
    onSelect: birth => selections.push(birth), onMessage: (text, meta) => messages.push({ text, ...meta }), ...options });
  t.after(() => { picker.destroy(); dom.window.close(); });
  return { ...f, dom, container, picker, selections, messages,
    q: selector => container.querySelector(selector), qa: selector => [...container.querySelectorAll(selector)],
    get submissions() { return submissions; } };
}

test('birthday-only entries are member scoped, deduplicated and retained after the 24-hour access window', () => {
  const f = fixture();
  assert.equal(f.store.save('1990-01-01'), '1990-01-01');
  f.store.save('2000-02-29');
  const before = f.raw(), writes = f.storage.writes.length;
  f.advance(3 * 86400000);
  assert.equal(f.store.save('1990-01-01'), '1990-01-01');
  assert.equal(f.storage.writes.length, writes);
  assert.equal(f.raw(), before);
  const reloaded = new BiorhythmSavedBirthdays(f.settings);
  assert.deepEqual(reloaded.list(), ['2000-02-29', '1990-01-01']);
  assert.deepEqual(JSON.parse(f.raw()), { version: 1, owner: MEMBER_A, birthdays: ['2000-02-29', '1990-01-01'] });
  assert.deepEqual([...f.storage.values.keys()], [SAVED_BIRTHDAYS_PREFIX + MEMBER_A]);
  const detached = reloaded.list(); detached[0] = '1900-01-01';
  assert.equal(reloaded.list()[0], '2000-02-29');
});

test('only valid canonical solar dates from 1900 through the Korean current day are saved', () => {
  const f = fixture();
  for (const birth of ['1900-01-01', '2000-02-29', '2026-11-13']) f.store.save(birth);
  const writes = f.storage.writes.length;
  for (const birth of ['', null, 19900101, '1990-1-01', ' 1990-01-01', '1990-01-01T00:00:00Z',
    '1899-12-31', '2101-01-01', '1900-02-29', '2025-02-29', '2000-02-30', '2000-13-01', '<img src=x>']) {
    assert.throws(() => f.store.save(birth), code('invalid_birth'));
  }
  assert.throws(() => f.store.save('2026-11-14'), code('future_birth'));
  assert.equal(f.storage.writes.length, writes);
  assert.throws(() => normalizeSavedBirthday('2026-11-14', { now: new Date('2026-11-13T14:59:59Z') }), code('future_birth'));
  assert.equal(normalizeSavedBirthday('2026-11-14', { now: new Date('2026-11-13T15:00:00Z') }), '2026-11-14');
});

test('the 20-entry limit never evicts another birthday; deletion and duplicates still work', () => {
  const f = fixture();
  for (let i = 1; i <= SAVED_BIRTHDAYS_LIMIT; i++) f.store.save(`1990-01-${String(i).padStart(2, '0')}`);
  const before = f.raw();
  assert.throws(() => f.store.save('1991-01-01'), code('limit'));
  assert.equal(f.raw(), before);
  assert.equal(f.store.save('1990-01-01'), '1990-01-01');
  assert.equal(f.raw(), before);
  assert.equal(f.store.remove('1990-01-01'), true);
  assert.equal(f.store.remove('1990-01-01'), false);
  f.store.save('1991-01-01');
  assert.equal(f.store.list().length, SAVED_BIRTHDAYS_LIMIT);
});

test('guest, anonymous and unconfirmed identities never read or write any member storage', () => {
  const f = fixture();
  for (const identity of [null, {}, { userId: MEMBER_A }, { userId: MEMBER_A, anonymous: true },
    { userId: MEMBER_A, anonymous: 0 }, { userId: 'fake-user', anonymous: false }]) {
    f.identity(identity);
    for (const action of [() => f.store.list(), () => f.store.save('1990-01-01'), () => f.store.remove('1990-01-01')]) {
      assert.throws(action, code('not_signed_in'));
    }
  }
  assert.equal(f.storage.reads.length, 0);
  assert.equal(f.storage.writes.length, 0);
});

test('account namespaces and expected-owner checks keep birthdays out of another member’s list', () => {
  const f = fixture(); f.store.save('1990-01-01');
  f.owner(MEMBER_B);
  assert.deepEqual(f.store.list(), []);
  assert.throws(() => f.store.save('1990-01-01', { expectedOwner: MEMBER_A }), code('account_changed'));
  assert.throws(() => f.store.remove('1990-01-01', { expectedOwner: MEMBER_A }), code('account_changed'));
  f.store.save('2000-02-29');
  f.owner(MEMBER_A.toUpperCase());
  assert.deepEqual(f.store.list(), ['1990-01-01']);
  assert.equal(f.storage.values.size, 2);
});

test('identity changes during reads or writes never expose or copy the previous member’s birthdays', () => {
  for (const operation of ['getItem', 'setItem']) {
    const f = fixture(); f.store.save('1990-01-01');
    const original = f.storage[operation];
    f.storage[operation] = function (...args) { const result = original.apply(this, args); f.owner(MEMBER_B); return result; };
    assert.throws(() => operation === 'getItem' ? f.store.list() : f.store.save('2000-02-29'), code('account_changed'));
    assert.equal(f.storage.values.has(SAVED_BIRTHDAYS_PREFIX + MEMBER_B), false);
  }
});

test('invalid or oversized stored data is never shown or silently overwritten', () => {
  const envelope = birthdays => ({ version: 1, owner: MEMBER_A, birthdays });
  const cases = ['{broken', 'x'.repeat(4097), JSON.stringify({ ...envelope([]), owner: MEMBER_B }),
    JSON.stringify({ ...envelope([]), version: 2 }), JSON.stringify({ ...envelope([]), receipt: { paid: true } }),
    ...[['1900-02-29'], ['2026-11-14'], ['<img src=x>'], [19900101], ['1990-01-01', '1990-01-01'],
      Array.from({ length: 21 }, (_, i) => `1990-01-${String(i + 1).padStart(2, '0')}`)].map(value => JSON.stringify(envelope(value)))];
  for (const raw of cases) {
    const f = fixture(); f.storage.values.set(SAVED_BIRTHDAYS_PREFIX + MEMBER_A, raw);
    for (const action of [() => f.store.list(), () => f.store.save('2000-02-29'), () => f.store.remove('1990-01-01')]) {
      assert.throws(action, error => ['corrupt', 'unsupported_version'].includes(error.code));
    }
    assert.equal(f.raw(), raw);
    assert.equal(f.storage.writes.length, 0);
  }
});

test('storage failures and silently dropped writes cannot report success', () => {
  const blocked = { getIdentity: () => ({ userId: MEMBER_A, anonymous: false }) };
  Object.defineProperty(blocked, 'storage', { get() { throw new Error('blocked'); } });
  const store = new BiorhythmSavedBirthdays(blocked);
  assert.throws(() => store.list(), code('storage_unavailable'));
  assert.throws(() => store.save('1990-01-01'), code('storage_unavailable'));
  const f = fixture(); f.store.save('1990-01-01'); const before = f.raw();
  f.storage.setItem = () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); };
  assert.throws(() => f.store.save('2000-02-29'), code('storage_full'));
  assert.throws(() => f.store.remove('1990-01-01'), code('storage_full'));
  assert.equal(f.raw(), before);
  const ignored = fixture(); ignored.storage.setItem = () => {};
  assert.throws(() => ignored.store.save('1990-01-01'), code('storage_unavailable'));
  assert.deepEqual(ignored.store.list(), []);
});

test('the picker begins empty and only explicit saves create rows; selecting/deleting never submits the form', t => {
  const h = harness(t);
  assert.equal(h.qa('.saved-birthday').length, 0, 'the fixed free sample is never seeded automatically');
  assert.equal(h.storage.writes.length, 0);
  assert.equal(h.picker.save('1990-01-01'), '1990-01-01', 'a user may explicitly save the same date as the sample');
  h.picker.save('1990-01-01');
  assert.equal(h.qa('.saved-birthday').length, 1);
  assert.equal(h.storage.writes.length, 1);
  const writes = h.storage.writes.length;
  h.q('.saved-birthday-use').click();
  assert.deepEqual(h.selections, ['1990-01-01']);
  assert.equal(h.storage.writes.length, writes, 'selection only fills the caller’s input');
  assert.equal(h.submissions, 0, 'selection cannot trigger a purchase form');
  for (const button of h.qa('button')) assert.equal(button.type, 'button');
  assert.match(h.q('.saved-birthday-use').textContent, /양력 1990\. 01\. 01\./);
  h.q('.saved-birthday-delete').click();
  assert.deepEqual(h.store.list(), []);
  assert.equal(h.submissions, 0);
  assert.match(h.q('.saved-birthdays-status').textContent, /삭제.*이용권은 그대로/);
  assert.equal(h.dom.window.document.activeElement, h.q('.saved-birthdays-title'));
});

test('switching account or logging out clears the visible list; stale clicks cannot fill the next member’s form', t => {
  const h = harness(t); h.picker.save('1990-01-01');
  const stale = h.q('.saved-birthday-use');
  h.owner(MEMBER_B); stale.click();
  assert.deepEqual(h.selections, []);
  assert.equal(h.qa('.saved-birthday').length, 0);
  h.picker.save('2000-02-29');
  assert.equal(h.qa('.saved-birthday').length, 1);
  h.identity(null); h.picker.refresh();
  assert.equal(h.qa('.saved-birthday').length, 0);
  assert.match(h.q('.saved-birthdays-empty').textContent, /로그인/);
  h.owner(MEMBER_A); h.picker.refresh();
  assert.match(h.q('.saved-birthday-use').textContent, /1990/);
  h.picker.clearView();
  assert.equal(h.qa('.saved-birthday').length, 0);
  assert.equal(h.storage.values.size, 2, 'clearing the view does not delete persistent birthdays or entitlements');
  h.picker.refresh();
  assert.match(h.q('.saved-birthday-use').textContent, /1990/);
});

test('stale programmatic saves cannot move a birthday into a newly signed-in account', t => {
  const h = harness(t); h.picker.save('1990-01-01');
  h.owner(MEMBER_B);
  assert.equal(h.picker.save('2000-02-29'), null);
  assert.equal(h.storage.values.has(SAVED_BIRTHDAYS_PREFIX + MEMBER_B), false);
  assert.equal(h.qa('.saved-birthday').length, 0);
  assert.match(h.q('.saved-birthdays-status').textContent, /계정이 바뀌/);
});

test('busy state blocks list selection/deletion while a successful personal result may still be saved', t => {
  const h = harness(t); h.picker.save('1990-01-01');
  h.picker.setDisabled(true);
  assert.ok(h.qa('button').every(button => button.disabled));
  h.q('.saved-birthday-use').click(); h.q('.saved-birthday-delete').click();
  assert.deepEqual(h.selections, []);
  assert.equal(h.store.list().length, 1);
  assert.equal(h.picker.save('2000-02-29', { announce: false }), '2000-02-29');
  assert.ok(h.qa('button').every(button => button.disabled));
  h.picker.setDisabled(false);
  assert.ok(h.qa('button').every(button => !button.disabled));
});

test('failed autosave returns null, preserves previous entries and exposes an alert rather than success', t => {
  const h = harness(t); h.picker.save('1990-01-01');
  h.storage.setItem = () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); };
  assert.equal(h.picker.save('2000-02-29'), null);
  assert.equal(h.qa('.saved-birthday').length, 1);
  assert.equal(h.q('.saved-birthdays-status').getAttribute('role'), 'alert');
  assert.match(h.q('.saved-birthdays-status').textContent, /저장 공간이 부족/);
  assert.equal(h.messages.at(-1).error, true);
  h.q('.saved-birthday-delete').click();
  assert.equal(h.qa('.saved-birthday').length, 1);
  assert.doesNotMatch(h.q('.saved-birthdays-status').textContent, /삭제했어요/);
});

test('storage refreshes affect only the current member and destroyed pickers cannot read or write', t => {
  const h = harness(t); h.picker.save('1990-01-01');
  const reads = h.storage.reads.length;
  h.dom.window.dispatchEvent(new h.dom.window.StorageEvent('storage', { key: SAVED_BIRTHDAYS_PREFIX + MEMBER_B }));
  assert.equal(h.storage.reads.length, reads);
  h.store.save('2000-02-29');
  h.dom.window.dispatchEvent(new h.dom.window.StorageEvent('storage', { key: SAVED_BIRTHDAYS_PREFIX + MEMBER_A }));
  assert.equal(h.qa('.saved-birthday').length, 2);
  const stale = h.q('.saved-birthday-use');
  h.picker.destroy();
  const after = [h.storage.reads.length, h.storage.writes.length];
  stale.click(); h.picker.refresh();
  assert.equal(h.picker.save('2001-01-01'), null);
  h.dom.window.dispatchEvent(new h.dom.window.StorageEvent('storage', { key: null }));
  assert.deepEqual([h.storage.reads.length, h.storage.writes.length], after);
  assert.deepEqual(h.selections, []);
  assert.equal(h.container.textContent, '');
});
