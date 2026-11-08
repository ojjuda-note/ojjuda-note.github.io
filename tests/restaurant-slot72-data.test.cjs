'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const text = p => fs.readFileSync(path.join(root, p), 'utf8');
const base = read('games/certified-restaurants/restaurants.json');
const sidecar = read('games/certified-restaurants/official-jeonbuk-slot72.json');
const source = read('games/certified-restaurants/sources.json');
const audit = read('ops/restaurant-region-audit.json');
const app = text('games/certified-restaurants/app.js');
const entryPage = text('games/certified-restaurants/index.html');
const guide = text('games/certified-restaurants/world-restaurant-guide.js');
const assets = text('shared/games/world-game-assets.js');
const world = text('world.html');
const release = read('game-release.json');

assert.equal(sidecar.cycle, 1);
assert.equal(sidecar.slot, 72);
assert.equal(sidecar.restaurants.length, 58);
assert.deepEqual(sidecar.regionalAdds, {'완주군':35,'진안군':7,'무주군':10,'장수군':6});
const names = new Set(base.restaurants.map(x => x.id));
assert.equal(names.size, base.restaurants.length);
const regions = new Map();
const categories = new Set(['한식','중식','일식','양식','분식','디저트','기타']);
for (const restaurant of sidecar.restaurants) {
  assert.equal(restaurant.region, '전북');
  assert.ok(categories.has(restaurant.category));
  assert.match(restaurant.address, /^전북특별자치도 (완주군|진안군|무주군|장수군) /);
  assert.equal(restaurant.lat, null); assert.equal(restaurant.lng, null);
  assert.ok(!names.has(restaurant.id), 'saved IDs should not collide');
  names.add(restaurant.id);
  assert.ok(restaurant.guides?.length === 1);
  const g = restaurant.guides[0];
  assert.equal(g.provider, 'local-guide');
  assert.equal(g.year, null);
  assert.equal(g.verifiedAt, '2026-11-08');
  assert.match(g.sourceUrl, /^https:\/\//);
  assert.equal(g.sourceUrl, restaurant.addressSourceUrl);
  assert.ok(['official_listing','tourism_directory'].includes(g.status));
  if (restaurant.district === '진안군') {
    assert.equal(g.status, 'tourism_directory');
    assert.equal(g.yearType, 'listing');
  } else {
    assert.equal(g.status, 'official_listing');
    assert.equal(g.yearType, 'selection');
  }
  regions.set(restaurant.district, (regions.get(restaurant.district)||0)+1);
}
assert.deepEqual(Object.fromEntries(regions), sidecar.regionalAdds);
assert.equal(sidecar.restaurants.filter(r=>r.guides[0].status==='tourism_directory').length, 7);
assert.equal(sidecar.restaurants.filter(r=>r.guides[0].status==='official_listing').length, 51);
for (const savedName of ['약수가든','원조화심두부','화심순두부본점']) {
  assert.ok(base.restaurants.some(r=>r.region==='전북'&&r.district==='완주군'&&r.name===savedName));
  assert.ok(!sidecar.restaurants.some(r=>r.name===savedName));
}
assert.equal(source.jeonbukSlot72.newCount, sidecar.restaurants.length);
assert.equal(source.jeonbukSlot72.sourceFile, 'games/certified-restaurants/official-jeonbuk-slot72.json');
assert.ok(source.coverage.uniqueRestaurants >= base.restaurants.length + sidecar.restaurants.length);
assert.equal(source.coverage.uniqueRestaurants, source.coverage.coordinatesAvailable + source.coverage.coordinatesMissing);
assert.equal(Object.values(source.coverage.categoryCounts).reduce((a,b)=>a+b,0), source.coverage.uniqueRestaurants);
const record = audit.entries.find(row=>row.cycle===1&&row.slot===72);
assert.ok(record);
assert.equal(audit.entries.filter(row=>row.cycle===1&&row.slot===72).length,1);
assert.equal(record.additions,58); assert.equal(record.modifications,0);
assert.equal(record.locationCoordinatesAdded,0); assert.equal(record.locationHidden,0);
assert.equal(record.locationPending,89);
assert.equal(record.pendingLocationInventory.length,89);
assert.ok(record.pendingLocationInventory.every(row=>row.restaurantId&&row.name&&row.currentAddress&&row.region&&row.recheckCycle===2&&row.recheckSlot===72));
assert.ok(record.addedRestaurantIds.every(id=>sidecar.restaurants.some(r=>r.id===id)));
assert.match(app, /official-jeonbuk-slot72\\.json\\?v=\\d{8}-restaurants-/);
assert.match(app, /\\.\\.\\.slot72\\.restaurants/);
assert.ok(entryPage.includes('app.js?v='+release.revision));
assert.ok(guide.includes('index.html?v='+release.revision));
assert.ok(assets.includes("const revision='"+release.revision+"'"));
assert.ok(world.includes('world-game-assets.js?v='+release.revision));
console.log('Jeonbuk slot72: 58 unique official listings, 89 rechecks, caches and selection distinctions pass');
