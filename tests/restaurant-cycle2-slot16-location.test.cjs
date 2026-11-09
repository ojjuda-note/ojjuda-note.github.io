'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const data=JSON.parse(read('games/certified-restaurants/restaurants.json'));
const src=JSON.parse(read('games/certified-restaurants/sources.json'));
const audit=JSON.parse(read('ops/restaurant-region-audit.json'));
const coords=[
['blue-regional-gosan-tteokgalbi-uijeongbu','고산떡갈비',37.7423098068151,127.047799543838,'smi.purpleo.kr/article/6759'],
['local-kto-c2s16-jinmiok','진미옥설렁탕',37.9090852,127.0529322,'qbh.purpleo.kr/article/162698']];
for(const [id,name,lat,lng,url] of coords){
 const row=data.restaurants.find(x=>x.id===id);
 assert.ok(row,id);assert.equal(row.name,name);assert.equal(row.lat,lat);assert.equal(row.lng,lng);
 assert.ok(row.coordinateSource.url.includes(url));
 assert.ok(row.coordinateSource.crosscheckUrl.startsWith('https://'));
 assert.equal(row.coordinateSource.checkedAt,'2026-11-09');assert.ok(row.guides.length>0);
}
const entries=audit.entries.filter(x=>x.cycle===2&&x.slot===16);
assert.equal(entries.length,1);assert.equal(entries[0].additions,7);assert.equal(entries[0].modifications,3);
assert.equal(entries[0].coordinateAdded,2);assert.equal(entries[0].locationHidden,0);
assert.equal(entries[0].locationPending,29);assert.equal(entries[0].locationRechecks.length,31);
assert.equal(entries[0].locationRechecks.filter(x=>x.resolved).length,2);
assert.equal(src.gyeonggiCycle2Slot16.coordinateAdded,2);
assert.equal(src.gyeonggiCycle2Slot16.locationPending,29);
assert.equal(src.coverage.coordinatesAvailable+src.coverage.coordinatesMissing,src.coverage.uniqueRestaurants);
assert.deepEqual(src.coverage,src.latestCoverageAudit.currentCoverage);
assert.equal(src.latestCoverageAudit.coordinateAddedCount,2);
const revision=JSON.parse(read('game-release.json')).revision;
assert.ok(read('world.html').includes('world-game-assets.js?v='+revision));
assert.ok(read('shared/games/world-game-assets.js').includes("const revision='"+revision+"'"));
assert.ok(read('games/certified-restaurants/index.html').includes('app.js?v='+revision));
assert.ok(read('games/certified-restaurants/app.js').includes('restaurants.json?v='+revision));
assert.ok(read('games/certified-restaurants/world-restaurant-guide.js').includes('index.html?v='+revision));
console.log('2순환16회차 2곳 좌표·집계·리비전 검증 통과');
