const assert = require('node:assert/strict');
const identity = require('../signup-identity.js');
const today = '2026-09-29';
for (const [birth, code, gender, age] of [
  ['120929', '3', 'male', 14], ['120929', '4', 'female', 14],
  ['110930', '3', 'male', 14], ['110929', '3', 'male', 15],
  ['560930', '1', 'male', 69], ['560929', '2', 'female', 70],
  ['000101', '1', 'male', 126], ['000229', '3', 'male', 26]
]) {
  const result = identity.parseBirth(birth, code, today);
  assert.equal(result.gender, gender); assert.equal(result.age, age);
}
for (const [birth, code] of [
  ['120930', '3'], ['130929', '4'], ['990229', '1'], ['001300', '3'],
  ['000230', '3'], ['270101', '3'], ['110929', '5'], ['110929', '0'], ['110929123', '1']
]) assert.throws(() => identity.parseBirth(birth, code, today));
assert.equal(identity.ageAt('2000-02-29', '2025-02-28'), 24);
assert.equal(identity.ageAt('2000-02-29', '2025-03-01'), 25);
assert.equal(identity.todayKorea(new Date('2026-09-28T14:59:59Z')), '2026-09-28');
assert.equal(identity.todayKorea(new Date('2026-09-28T15:00:00Z')), today);
assert.equal(identity.normalizePhone('+82 10-1234-5678'), '01012345678');
for (const value of ['010123', 'abc01012345678', '010123456789', '+8201012345678']) assert.throws(() => identity.normalizePhone(value));
console.log('PASS: birth dates, age boundaries, leap years, gender codes, KST midnight, telephone format');
