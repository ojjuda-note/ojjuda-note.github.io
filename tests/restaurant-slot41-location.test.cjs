'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const base = file('games/certified-restaurants/restaurants.json');
const patch = file('games/certified-restaurants/official-busan-slot41-michelin-map.json');
const sources = file('games/certified-restaurants/sources.json');
const audit = file('ops/restaurant-region-audit.json');
const app = fs.readFileSync(path.join(root,'games/certified-restaurants/app.js'),'utf8');
const expected = [
  'anmok', 'jeongjitgan', 'l-essence', 'hanwolgwan', 'meerok-super',
  'eonyang-bulgogi-busanjip', 'post-2026-24-0-1', 'jin-dweji-gomtang'
];
assert.deepEqual(patch.locationEnrichments.map(row => row.id), expected);
assert.equal(patch.updatedAt, '2026-11-07');
for (const item of patch.locationEnrichments) {
  const matching = base.restaurants.filter(row => row.id === item.id);
  assert.equal(matching.length, 1, item.id + ': existing ID retained');
  const old = matching[0];
  assert.equal(old.name, item.expectedName, item.id + ': exact name');
  assert.equal(old.address, item.expectedAddress, item.id + ': exact address');
  assert.equal(old.lat, null, item.id + ': previous latitude is missing');
  assert.equal(old.lng, null, item.id + ': previous longitude is missing');
  assert.ok(item.lat > 34.7 && item.lat < 35.6 && item.lng > 128.7 && item.lng < 129.5, item.id + ': plausible published Busan map link');
  assert.equal(item.coordinateSource.method, 'published-map-coordinate');
  assert.match(item.coordinateSource.url, /^https:\/\/guide\.michelin\.com\/kr\/ko\/busan-region\/busan_1025838\/restaurant\/[a-z0-9-]+$/);
  assert.ok(old.guides.some(g => g.provider === 'michelin' && g.sourceUrl === item.coordinateSource.url), item.id + ': same Michelin restaurant');
}
assert.ok(app.includes('slot41Map.locationEnrichments'), 'map enrichment is loaded by the real page');
assert.ok(app.includes('row.id === patch.id && row.name === patch.expectedName && row.address === patch.expectedAddress'), 'ID and address must match to apply map positions');
assert.ok(app.includes('restaurant.lat != null || restaurant.lng != null'), 'never overwrite known coordinates');
assert.ok(app.includes("guide.provider === 'michelin' && guide.sourceUrl === verifiedUrl"), 'only matching official source is trusted');
const slot41Coverage = sources.mapCoverageAuditHistory.find(row => row.cycle === 1 && row.slot === 41)?.currentCoverage;
assert.ok(slot41Coverage, 'historical slot41 coverage is retained');
assert.equal(slot41Coverage.uniqueRestaurants, 3249);
assert.equal(slot41Coverage.coordinatesAvailable, 1040);
assert.equal(slot41Coverage.coordinatesMissing, 2209);
assert.ok(sources.coverage.uniqueRestaurants >= slot41Coverage.uniqueRestaurants, 'later regional additions remain possible');
assert.ok(sources.coverage.coordinatesAvailable >= slot41Coverage.coordinatesAvailable, 'later location repairs remain possible');
const entry = audit.entries.find(row => row.cycle === 1 && row.slot === 41);
assert.ok(entry);
assert.equal(entry.locationCoordinatesAdded, 8);
assert.equal(entry.locationHidden, 0);
assert.equal(entry.locationPending, 61);
assert.equal(entry.locationRechecks.filter(row => row.status === 'resolved').length, 8);
const release = file('game-release.json');
const assets = fs.readFileSync(path.join(root,'shared/games/world-game-assets.js'),'utf8');
const world = fs.readFileSync(path.join(root,'world.html'),'utf8');
assert.ok(assets.includes("const revision='" + release.revision + "'"));
assert.ok(world.includes('world-game-assets.js?v=' + release.revision));
console.log('restaurant slot41 Michelin location enrichment verified');
