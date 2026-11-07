'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const db=read('games/certified-restaurants/restaurants.json'),sheet=read('games/certified-restaurants/official-busan-daegu-ulsan-slot59.json');
const src=read('games/certified-restaurants/sources.json'),audit=read('ops/restaurant-region-audit.json'),release=read('game-release.json');
const app=fs.readFileSync(path.join(root,'games/certified-restaurants/app.js'),'utf8');
assert.equal(sheet.cycle,1);assert.equal(sheet.slot,59);assert.equal(sheet.restaurants.length,6);
for(const [name,region,category,address] of [['화국반점','부산','중식','부산광역시 중구 백산길 3'],['초가식당','대구','한식','대구광역시 중구 동성로 81-2 (동성로1가)'],['가무댕댕','울산','기타','울산광역시 남구 대학로94번길 11(무거동)'],['청산1954','부산','한식','부산광역시 수영구 황령산로 29'],['우봉샤브','부산','한식','부산광역시 해운대구 청사포로 127'],['중앙떡볶이','대구','분식','대구광역시 중구 동성로2길 81 (동성로2가)']]){
 const item=sheet.restaurants.find(x=>x.name===name);assert.ok(item);assert.equal(item.region,region);assert.equal(item.category,category);assert.equal(item.address,address);
 assert.equal(item.lat,null);assert.equal(item.lng,null);assert.equal(item.guides[0].provider,'local-guide');assert.equal(item.guides[0].year,null);assert.equal(item.guides[0].verifiedAt,'2026-11-08');assert.equal(item.guides[0].sourceUrl,item.addressSourceUrl);
 assert.ok(!db.restaurants.some(x=>x.id===item.id||x.region===region&&x.name===name));
}
assert.equal(src.coverage.uniqueRestaurants,3315);assert.equal(src.coverage.providerCounts['local-guide'],2582);assert.equal(src.coverage.coordinatesAvailable,1060);assert.equal(src.coverage.coordinatesMissing,2255);
assert.equal(src.coverage.regionalCounts['부산'],385);assert.equal(src.coverage.regionalCounts['대구'],132);assert.equal(src.coverage.regionalCounts['울산'],37);assert.deepEqual(src.latestCoverageAudit.currentCoverage,src.coverage);
assert.equal(src.coverageAuditHistory.at(-1).slot,59);const e=audit.entries.find(x=>x.cycle===1&&x.slot===59);assert.ok(e);assert.equal(e.additions,6);assert.equal(e.locationCoordinatesAdded,0);assert.equal(e.locationHidden,0);assert.equal(e.locationPending,429);assert.equal(e.pendingLocationInventory.length,429);
assert.ok(e.pendingLocationInventory.every(x=>x.restaurantId&&x.name&&x.currentAddress&&x.region&&x.recheckCycle===2&&x.recheckSlot===59&&Array.isArray(x.evidenceUrls)));
assert.ok(audit.entries.some(x=>x.cycle===1&&x.slot===58));assert.ok(e.carryOver.some(x=>x.cycle===1&&x.slot===53));assert.equal(src.coverage.categoryCounts['기타'],584);assert.equal(src.coverage.categoryCounts['한식'],1968);assert.equal(src.coverage.categoryCounts['분식'],33);
assert.ok(app.includes('official-busan-daegu-ulsan-slot59.json?v='+release.revision));assert.ok(app.includes('...slot59.restaurants'));
assert.ok(fs.readFileSync(path.join(root,'games/certified-restaurants/index.html'),'utf8').includes('./app.js?v='+release.revision));
assert.ok(fs.readFileSync(path.join(root,'world.html'),'utf8').includes('/shared/games/world-game-assets.js?v='+release.revision));
assert.ok(fs.readFileSync(path.join(root,'shared/games/world-game-assets.js'),'utf8').includes("restaurants:'1.11.20'"));
console.log('slot59 official-source, duplicate, location, history and version checks passed');
