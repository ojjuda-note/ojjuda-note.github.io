'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const base = read('games/certified-restaurants/restaurants.json');
const slot = read('games/certified-restaurants/official-chungnam-slot25.json');
const sources = read('games/certified-restaurants/sources.json');
const audit = read('ops/restaurant-region-audit.json');
const app = fs.readFileSync(path.join(root, 'games/certified-restaurants/app.js'), 'utf8');

test('천안·아산 회차는 시/공공관광 식당 5곳만 추가하고 중복 또는 추정좌표가 없다', () => {
  assert.equal(slot.restaurants.length, 5);
  const ids = new Set(base.restaurants.map(item => item.id));
  const identity = item => [item.region, item.name, item.address].map(v => String(v || '').replace(/\\s+/g, '').toLowerCase()).join('|');
  const places = new Set(base.restaurants.map(identity));
  const added = new Set();
  for (const row of slot.restaurants) {
    assert.ok(row.name && row.address);
    assert.ok(!ids.has(row.id), 'existing saved ID must remain unique: ' + row.id);
    assert.ok(!added.has(row.id), 'duplicate new ID: ' + row.id);
    assert.ok(!places.has(identity(row)), 'duplicate official restaurant: ' + row.name);
    assert.equal(row.lat, null);
    assert.equal(row.lng, null);
    assert.equal(row.guides.length, 1);
    assert.equal(row.guides[0].provider, 'local-guide');
    assert.equal(row.guides[0].year, null);
    assert.equal(row.guides[0].verifiedAt, '2026-11-06');
    assert.ok(row.guides[0].sourceUrl.startsWith('https://'));
    added.add(row.id); places.add(identity(row));
  }
  assert.equal(slot.restaurants.filter(row => row.district.startsWith('천안시')).length, 1);
  assert.equal(slot.restaurants.filter(row => row.district === '아산시').length, 4);
});

test('수록 이력과 지정 이력을 구분하고 추천맛집을 수정하지 않는다', () => {
  assert.equal(slot.restaurants[0].guides[0].yearType, 'selection');
  slot.restaurants.slice(1).forEach(row => assert.equal(row.guides[0].yearType, 'listing'));
  assert.match(app, /official-chungnam-slot25\\.json/);
  assert.match(app, /\\.\\.\\.slot25\\.restaurants/);
  assert.match(app, /state\\.recommended/);
  assert.match(app, /ojjuda-certified-restaurants-saved-v1/);
});

test('회차 운영기록과 출처 집계 일치', () => {
  const entry = audit.entries.find(row => row.cycle === 1 && row.slot === 25);
  assert.ok(entry);
  assert.equal(entry.additions, 5);
  assert.equal(entry.locationCoordinatesAdded, 0);
  assert.equal(entry.locationHidden, 0);
  assert.equal(entry.locationPending, 6);
  const latest = sources.latestCoverageAudit;
  assert.equal(latest.newRestaurantCount, 5);
  assert.equal(latest.currentCoverage.uniqueRestaurants, 3175);
  assert.equal(latest.currentCoverage.regionalCounts['충남'], 51);
  assert.equal(latest.currentCoverage.coordinatesAvailable, 1032);
  assert.equal(latest.currentCoverage.coordinatesMissing, 2143);
});
