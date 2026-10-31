const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {assignAwards, normalizeCode, validateBatch} = require('../admin/reward-coupon-batch.js');

const today = '2026-11-01';
const pending = ['a', 'b', 'c', 'd'].map(id => ({id, blocked_reason: null}));
const item = (id, extra = {}) => ({
  id, file: {name: id + '.png', type: 'image/png', size: 100},
  awardId: id, code: 'COUPON-' + id.toUpperCase(), expires: '2027-02-28',
  title: '편의점 상품권', status: 'ready', ...extra
});
const validate = (items, awards = pending, options = {today}) => validateBatch(items, awards, options);
const errorsFor = (result, id) => result.errors.filter(error => error.id === id).map(error => error.message).join(' ');

test('browser and CommonJS expose the same pure API', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../admin/reward-coupon-batch.js'), 'utf8'), {window});
  assert.deepEqual(Object.keys(window.OjjudaCouponBatch).sort(), ['assignAwards', 'normalizeCode', 'validateBatch']);
  assert.equal(window.OjjudaCouponBatch.normalizeCode('ab-12  cd'), 'AB12CD');
  assert.equal(normalizeCode(' \tab-12\ncd\u00a0 '), 'AB12CD');
  assert.equal(normalizeCode(null), '');
});

test('assignment reserves every existing winner before filling gaps without mutation', () => {
  const inputs = [item('new', {awardId: null, status: 'reading'}), item('later', {awardId: 'a'}),
    item('sent', {awardId: 'b', status: 'sent'}), item('stale', {awardId: 'gone'}),
    item('extra', {awardId: null}), item('overflow', {awardId: null})];
  for (const entry of inputs) {Object.freeze(entry.file); Object.freeze(entry);}
  Object.freeze(inputs);
  const awards = [{id: 'blocked', blocked_reason: 'banned'}, ...pending, pending[2]];
  const before = JSON.stringify({inputs, awards});
  const assigned = assignAwards(inputs, awards);
  assert.deepEqual(assigned.map(entry => entry.awardId), ['c', 'a', 'b', 'gone', 'd', null]);
  assert.equal(JSON.stringify({inputs, awards}), before);
  assert.notEqual(assigned, inputs);
  assigned.forEach((entry, i) => {assert.notEqual(entry, inputs[i]); assert.equal(entry.file, inputs[i].file);});
  assert.deepEqual(assignAwards(assigned, [...awards].reverse()), assigned, 'refreshing or reordering never reallocates existing assignments');
});

test('removed winners and in-flight reservations cannot be handed to new files', () => {
  const original = [item('a', {status: 'uncertain'}), item('b', {status: 'sending'}),
    item('new', {awardId: null, status: 'queued'})];
  const assigned = assignAwards(original, [pending[1], pending[2], pending[0]]);
  assert.deepEqual(assigned.map(entry => entry.awardId), ['a', 'b', 'c']);
  const refreshed = assignAwards(assigned, [pending[3]]);
  assert.deepEqual(refreshed.map(entry => entry.awardId), ['a', 'b', 'c']);
  assert.match(errorsFor(validate(refreshed, [pending[3]]), 'new'), /지급 대기/);
  for (const status of ['sending', 'sent', 'uncertain']) {
    assert.equal(assignAwards([item('lost', {awardId: null, status})], pending)[0].awardId, null,
      'an incomplete in-flight or sent record is not silently moved to another winner');
  }
});

test('ready and safely failed entries may send; incomplete and uncertain sends cannot', () => {
  assert.deepEqual(validate([item('a'), item('b', {status: 'failed'})]), {valid: true, errors: [], readyCount: 2});
  for (const status of ['queued', 'reading', 'sending', 'uncertain', 'unexpected']) {
    const result = validate([item('a', {status}), item('b')]);
    assert.equal(result.valid, false, status);
    assert.equal(result.readyCount, 1, 'only independently valid active entries are counted');
    assert.ok(errorsFor(result, 'a'));
  }
  assert.deepEqual(validate([]), {valid: false, errors: [], readyCount: 0});
  assert.deepEqual(validate([item('a', {status: 'sent', file: null, title: '', expires: ''})]),
    {valid: false, errors: [], readyCount: 0}, 'sent fields are not revalidated');
});

test('duplicate awards and normalized codes are rejected including already sent coupons', () => {
  for (const sent of [false, true]) {
    const status = sent ? 'sent' : 'ready';
    const sameAward = validate([item('a', {status}), item('b', {awardId: 'a'}), item('c')]);
    assert.equal(sameAward.valid, false); assert.equal(sameAward.readyCount, 1);
    assert.match(errorsFor(sameAward, 'b'), /같은 당첨/);
    const sameCode = validate([item('a', {status, code: 'aB-cD 12'}), item('b', {code: 'ABCD12'}), item('c')]);
    assert.equal(sameCode.valid, false); assert.equal(sameCode.readyCount, 1);
    assert.match(errorsFor(sameCode, 'b'), /동일한 쿠폰번호/);
  }
});

test('missing, removed, blocked and anonymous winners never count as ready', () => {
  for (const [awardId, awards] of [[null, pending], ['missing-member', pending], ['a', []],
    ['a', [{id: 'a', blocked_reason: 'banned'}]], ['a', [{id: 'a', blocked_reason: 'not_a_member'}]],
    ['a', [{id: 'a', blocked_reason: 'unconfirmed_member'}]]]) {
    const result = validate([item('a', {awardId})], awards);
    assert.equal(result.valid, false); assert.equal(result.readyCount, 0); assert.ok(result.errors.length);
  }
});

test('expiration dates are real calendar dates and include the current day', () => {
  assert.equal(validate([item('a', {expires: today})]).valid, true);
  assert.equal(validate([item('a', {expires: '2028-02-29'})]).valid, true);
  for (const expires of ['2026-10-31', '2027-02-29', '2100-02-29', '2027-04-31', '2027-13-01',
    '2027-00-01', '2027-01-00', '2027-1-01', '0000-01-01', '2027-01-01T00:00:00Z', '']) {
    assert.equal(validate([item('a', {expires})]).valid, false, expires);
  }
  assert.equal(validate([item('a', {expires: '2000-02-29'})], pending, {today: '2000-02-28'}).valid, true);
  assert.equal(validate([item('a')], pending, {today: '2026-02-30'}).readyCount, 0);
});

test('coupon format, title length and upload byte boundaries match the form requirements', () => {
  for (const code of ['A'.repeat(6), 'A'.repeat(80), 'ab-cd 12']) assert.equal(validate([item('a', {code})]).valid, true);
  for (const code of ['', 'ABCDE', 'A'.repeat(81), '가나다라마바사', 'ABCD_1', 'ABCD.1']) {
    assert.equal(validate([item('a', {code})]).valid, false, code);
  }
  for (const title of ['상품', '가'.repeat(120), '🎁'.repeat(120)]) assert.equal(validate([item('a', {title})]).valid, true);
  for (const title of ['', ' \t ', '가'.repeat(121)]) assert.equal(validate([item('a', {title})]).valid, false);
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    for (const size of [1, 5242880]) assert.equal(validate([item('a', {file: {type, size, name: 'coupon'}})]).valid, true);
  }
  for (const file of [null, {type: 'image/gif', size: 1}, {type: 'image/png', size: 0},
    {type: 'image/png', size: 5242881}, {type: 'image/png', size: NaN}, {type: 'image/png', size: 1.5}]) {
    assert.equal(validate([item('a', {file})]).valid, false);
  }
});

test('validation leaves file, assignments, codes and pending records untouched', () => {
  const inputs = [item('a', {code: 'ab-cd 12'}), item('b')], before = JSON.stringify({inputs, pending});
  assert.equal(validate(inputs).valid, true);
  assert.equal(JSON.stringify({inputs, pending}), before);
});
