'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const base=JSON.parse(read('games/certified-restaurants/restaurants.json'));
const sources=JSON.parse(read('games/certified-restaurants/sources.json'));
const audit=JSON.parse(read('ops/restaurant-region-audit.json'));
const ids=[
 'local-kto-c2s14-timeslice','local-kto-c2s14-actioncoffee','local-kto-c2s14-montebianco',
 'local-kto-c2s14-americana','local-kto-c2s14-cheongryujae','local-kto-c2s14-eltove','local-kto-c2s14-steavin'
];
assert.equal(new Set(ids).size,7);
const allIds=base.restaurants.map(r=>r.id);
assert.equal(new Set(allIds).size,allIds.length,'saved restaurant IDs must be unique');
for (const id of ids){
 const row=base.restaurants.find(r=>r.id===id);
 assert.ok(row,id);
 assert.equal(row.region,'경기');
 assert.match(row.district,/^(평택시|오산시|안성시)$/);
 assert.ok(/^경기도 /.test(row.address));
 if(id==='local-kto-c2s14-montebianco'){
  assert.equal(row.lat,36.957624630523);assert.equal(row.lng,126.848351252943);
  assert.equal(row.coordinateSource.url,'https://irc.purpleo.kr/article/4571');
  assert.match(row.coordinateSource.crosscheckUrl,/^https:\/\/access\.visitkorea\.or\.kr\/food\/detail\.do\?/);
 } else {assert.equal(row.lat,null);assert.equal(row.lng,null); }
 assert.ok(['한식','중식','일식','양식','분식','디저트','기타'].includes(row.category));
 assert.equal(row.guides.length,1);
 const g=row.guides[0];
 assert.equal(g.provider,'local-guide');assert.equal(g.year,null);
 assert.equal(g.yearType,'source');assert.equal(g.status,'official_restaurant_listing');
 assert.equal(g.verifiedAt,'2026-11-09');
 assert.match(g.sourceUrl,/^https:\/\/access\.visitkorea\.or\.kr\/food\/detail\.do\?cotId=/);
 assert.ok(row.addressCrosscheckUrl.startsWith('https://'));
}
for(const [id,name] of [['local-north-5bbf2cb589c51030','콩마당'],['local-gg-43bdc197164c73','북극해고등어 오산본점']]){
 const row=base.restaurants.find(r=>r.id===id);
 assert.equal(row.name,name);assert.equal(row.category,'한식');
 assert.ok(row.guides.length>=1);assert.equal(row.lat,null);
 assert.match(row.categoryEvidenceUrl,/^https:\/\/access\.visitkorea\.or\.kr\/food\/detail\.do\?/);
}
const report=audit.entries.filter(x=>x.cycle===2&&x.slot===14);
assert.equal(report.length,1);assert.equal(report[0].additions,7);
assert.equal(report[0].modifications,3);assert.equal(report[0].coordinateAdded,1);
assert.equal(report[0].locationHidden,0);assert.equal(report[0].locationPending,31);
assert.equal(report[0].locationRechecks.length,32);
assert.equal(report[0].locationRechecks.filter(r=>!r.resolved).length,31);
assert.deepEqual(report[0].assignedRegions,['경기도 평택시','경기도 오산시','경기도 안성시']);
const count=sources.coverage;
assert.ok(count.uniqueRestaurants>=3646);
assert.ok(count.coordinatesAvailable>=1088);
assert.ok(count.coordinatesMissing>=0);
assert.equal(sources.gyeonggiCycle2Slot14.coordinateAdded,1);
assert.equal(sources.gyeonggiCycle2Slot14.locationPending,31);
assert.equal(count.coordinatesAvailable+count.coordinatesMissing,count.uniqueRestaurants);
assert.equal(Object.values(count.regionalCounts).reduce((a,b)=>a+b,0),count.uniqueRestaurants);
assert.equal(Object.values(count.categoryCounts).reduce((a,b)=>a+b,0),count.uniqueRestaurants);
assert.equal(sources.gyeonggiCycle2Slot14.addedCount,7);
const release=JSON.parse(read('game-release.json')).revision;
assert.ok(read('shared/games/world-game-assets.js').includes("const revision='"+release+"'"));
assert.ok(read('world.html').includes('world-game-assets.js?v='+release));
const restaurantRevision=read('shared/games/world-game-assets.js').match(/world-restaurant-guide\.js\?v=([\w-]+)/)?.[1];
assert.ok(restaurantRevision,'restaurant cache revision is present');
assert.ok(read('games/certified-restaurants/index.html').includes('app.js?v='+restaurantRevision));
// The unchanged base dataset keeps its own cache when a sidecar updates the app.
assert.match(read('games/certified-restaurants/app.js'), /fetch\('\.\/restaurants\.json\?v=\d{8}-restaurants-[a-z0-9-]+'\s*,\s*\{[^}]*cache:\s*'no-cache'/, 'base restaurant data uses an independently versioned, revalidated fetch');
assert.ok(read('games/certified-restaurants/world-restaurant-guide.js').includes('index.html?v='+restaurantRevision));
console.log('cycle 2 slot 14 verified KTO restaurants and source counts passed');
