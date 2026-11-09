'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const p=require('node:path');
const root=p.resolve(__dirname,'..');
const read=x=>fs.readFileSync(p.join(root,x),'utf8');
const restaurants=JSON.parse(read('games/certified-restaurants/restaurants.json')).restaurants;
const sources=JSON.parse(read('games/certified-restaurants/sources.json'));
const audit=JSON.parse(read('ops/restaurant-region-audit.json'));
const ids=["local-kto-c2s09-eaceebc3","local-kto-c2s09-0ebad68c","local-kto-c2s09-46c3f083","local-kto-c2s09-3dfc5828","local-kto-c2s09-43880594","local-kto-c2s09-75ed7661","local-kto-c2s09-214af9f8"];
test('cycle 2 slot 9 KTO seven are sourced without fabricated guide years or coordinates',()=>{
 const found=ids.map(id=>restaurants.find(x=>x.id===id));
 assert.equal(new Set(ids).size,7);assert.equal(found.length,7);
 for(const item of found){assert.ok(item);assert.equal(item.region,'경기');assert.match(item.district,/^(성남시|용인시)/);assert.equal(item.lat,null);assert.equal(item.lng,null);assert.equal(item.guides.length,1);const guide=item.guides[0];assert.equal(guide.provider,'local-guide');assert.equal(guide.year,null);assert.equal(guide.yearType,'listing');assert.equal(guide.verifiedAt,'2026-11-09');assert.equal(guide.status,'official_restaurant_listing');assert.match(guide.sourceUrl,/^https:\/\/access\.visitkorea\.or\.kr\/food\/detail\.do\?cotId=/);}
 assert.equal(sources.gyeonggiCycle2Slot9.addedCount,7);
 assert.equal(audit.entries.filter(x=>x.cycle===2&&x.slot===9).length,1);
 assert.equal(audit.entries.find(x=>x.cycle===2&&x.slot===9).locationPending,33);
 assert.equal(Object.values(sources.coverage.regionalCounts).reduce((a,b)=>a+b,0),sources.coverage.uniqueRestaurants);
 assert.equal(Object.values(sources.coverage.categoryCounts).reduce((a,b)=>a+b,0),sources.coverage.uniqueRestaurants);
 assert.equal(sources.coverage.coordinatesAvailable+sources.coverage.coordinatesMissing,sources.coverage.uniqueRestaurants);
});
test('restaurant game cache and revision align without changing agit version',()=>{const revision='20261109-restaurants-c2s09-kto-seven1';assert.ok(read('games/certified-restaurants/app.js').includes('restaurants.json?v='+revision));assert.ok(read('games/certified-restaurants/index.html').includes('app.js?v='+revision));assert.ok(read('world.html').includes('world-game-assets.js?v='+revision));assert.ok(read('shared/games/world-game-assets.js').includes("const revision='"+revision+"'"));assert.equal(JSON.parse(read('game-release.json')).revision,revision);});
