'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const base=JSON.parse(read('games/certified-restaurants/restaurants.json'));
const sources=JSON.parse(read('games/certified-restaurants/sources.json'));
const audit=JSON.parse(read('ops/restaurant-region-audit.json'));
const names=[
['local-kto-c2s17-icheon-migok','미곡반상','이천시','한식'],
['local-kto-c2s17-icheon-arbor','아르보르','이천시','디저트'],
['local-kto-c2s17-yeoju-eungam','응암본가','여주시','한식'],
['local-kto-c2s17-yeoju-yeonaeul','여내울 수월정','여주시','한식'],
['local-kto-c2s17-gwangju-cafechujari','카페추자리','광주시','디저트'],
['local-kto-c2s17-gwangju-haewadal','해와달','광주시','한식'],
['local-kto-c2s17-gwangju-bae','배연정소머리국밥','광주시','한식'],
['local-kto-c2s17-gwangju-daetong','대통장어','광주시','한식'],
['local-kto-c2s17-gwangju-namhansanseong-bread','남한산성빵명장','광주시','디저트']
];
assert.equal(new Set(base.restaurants.map(x=>x.id)).size,base.restaurants.length,'saved IDs unique');
for(const [id,name,district,category] of names){
 const r=base.restaurants.find(x=>x.id===id);
 assert.ok(r,id);assert.equal(r.name,name);assert.equal(r.district,district);
 assert.equal(r.region,'경기');assert.equal(r.category,category);
 assert.ok(r.address.startsWith('경기도 '+district+' '));assert.equal(r.lat,null);assert.equal(r.lng,null);
 assert.equal(r.guides.length,1);
 const g=r.guides[0];
 assert.equal(g.provider,'local-guide');assert.equal(g.status,'official_restaurant_listing');
 assert.equal(g.year,null);assert.equal(g.yearType,'source');assert.equal(g.verifiedAt,'2026-11-09');
 assert.match(g.sourceUrl,/^https:\/\/access\.visitkorea\.or\.kr\/food\/detail\.do\?cotId=/);
 assert.equal(r.addressSourceUrl,g.sourceUrl);
 assert.match(g.sourceRegisteredAt,/^20\d\d-\d\d-\d\d$/);
 assert.match(g.sourceLastModifiedAt,/^20\d\d-\d\d-\d\d$/);
}
const ng=base.restaurants.find(x=>x.id==='local-north-e726cf303b81db50');
assert.ok(ng);assert.equal(ng.name,'능골한우가');
assert.equal(ng.address,'경기도 광주시 오포로 147');assert.equal(ng.category,'한식');
assert.equal(ng.lat,37.345650);assert.equal(ng.lng,127.181757);
assert.equal(ng.coordinateSource.url,'https://tja.purpleo.kr/article/1361');
assert.equal(ng.coordinateSource.crosscheckUrl,'https://www.114.co.kr/life/localBillStore/detail/1056057');
assert.ok(ng.guides.some(g=>g.status==='historical_designation'));
const entry=audit.entries.filter(x=>x.cycle===2&&x.slot===17);
assert.equal(entry.length,1);assert.equal(entry[0].additions,9);
assert.equal(entry[0].modifications,1);assert.equal(entry[0].locationCoordinatesAdded,1);
assert.equal(entry[0].locationHidden,0);assert.equal(entry[0].locationPending,27);
assert.equal(entry[0].locationRechecks.length,28);
assert.equal(entry[0].locationRechecks.filter(x=>x.resolved).length,1);
assert.deepEqual(entry[0].assignedRegions,['경기도 이천시','경기도 광주시','경기도 여주시']);
const slot=sources.gyeonggiCycle2Slot17;
assert.equal(slot.addedCount,9);assert.equal(slot.modifiedCount,1);
assert.equal(slot.coordinateAdded,1);assert.equal(slot.locationPending,27);
assert.ok(sources.coverage.uniqueRestaurants>=3662);
assert.ok(sources.coverage.coordinatesAvailable>=1094);
assert.equal(sources.coverage.coordinatesAvailable+sources.coverage.coordinatesMissing,sources.coverage.uniqueRestaurants);
assert.equal(Object.values(sources.coverage.categoryCounts).reduce((a,b)=>a+b,0),sources.coverage.uniqueRestaurants);
assert.equal(Object.values(sources.coverage.regionalCounts).reduce((a,b)=>a+b,0),sources.coverage.uniqueRestaurants);
const history=sources.coverageAuditHistory.find(x=>x.id==='2026-11-09-gyeonggi-c2s17-kto9-neunggol-location1');
assert.ok(history);assert.equal(history.coordinateAddedCount,1);
assert.equal(history.currentCoverage.uniqueRestaurants,3662);
assert.equal(history.currentCoverage.coordinatesAvailable,1094);
const rev=JSON.parse(read('game-release.json')).revision;
assert.ok(read('world.html').includes('world-game-assets.js?v='+rev));
assert.ok(read('shared/games/world-game-assets.js').includes("const revision='"+rev+"'"));
assert.ok(read('games/certified-restaurants/index.html').includes('app.js?v='+rev));
assert.ok(read('games/certified-restaurants/app.js').includes('restaurants.json?v='+rev));
assert.ok(read('games/certified-restaurants/world-restaurant-guide.js').includes('index.html?v='+rev));
console.log('2순환17회차 관광공사 9곳·광주 위치1·검증 대기27 확인 통과');
