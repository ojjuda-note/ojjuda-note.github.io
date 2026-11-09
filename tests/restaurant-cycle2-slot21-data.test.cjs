'use strict';
const a=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'games/certified-restaurants');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const official=JSON.parse(read('games/certified-restaurants/official-daejeon-slot21.json'));
const base=JSON.parse(read('games/certified-restaurants/restaurants.json'));
const src=JSON.parse(read('games/certified-restaurants/sources.json'));
const audit=JSON.parse(read('ops/restaurant-region-audit.json'));
const expected=[
['local-daejeon-c2s21-daedeok-hongguli','홍굴이부추손칼국수','대덕구','한식','선비마을로5번길 3',93],
['local-daejeon-c2s21-daedeok-hwanggeum','황금칼국수','대덕구','한식','대전로 1357',94],
['local-daejeon-c2s21-daedeok-piljjamppong','필짬뽕','대덕구','중식','한남로137번길 43',121],
['local-daejeon-c2s21-yuseong-solbatmuk','솔밭묵집','유성구','한식','관평로 43, 1층',99],
['local-daejeon-c2s21-donggu-pungmidang','풍미당','동구','한식','선화로196번길 80, 1층',91],
['local-daejeon-c2s21-seogu-galma-jjamppong','갈마짬뽕','서구','중식','월평동로 5-11, 1층',113]
];
const all=[...base.restaurants,...fs.readdirSync(dir).filter(n=>/^official-.*\\.json$/.test(n)).flatMap(n=>JSON.parse(fs.readFileSync(path.join(dir,n),'utf8')).restaurants||[])];
a.equal(new Set(all.map(x=>x.id)).size,all.length,'저장 식당 ID가 중복되지 않음');
for(const [id,name,district,category,addressSuffix,page] of expected){
 const x=official.restaurants.find(v=>v.id===id);a.ok(x,id);
 a.equal(x.name,name);a.equal(x.district,district);a.equal(x.region,'대전');a.equal(x.category,category);
 a.equal(x.address,'대전광역시 '+district+' '+addressSuffix);
 a.equal(x.lat,null);a.equal(x.lng,null,'근거 없는 수치좌표는 null');
 a.equal(x.guides.length,1);
 const g=x.guides[0];a.equal(g.provider,'local-guide');a.equal(g.year,2026);
 a.equal(g.yearType,'publication');a.equal(g.sourceAsOf,'2026-10');
 a.equal(g.status,'official_publication_listing');a.equal(g.verifiedAt,'2026-11-10');
 const url='https://ebook.ebooknara.com/2026/1008/files/basic-html/page'+page+'.html';
 a.equal(g.sourceUrl,url);a.equal(x.addressSourceUrl,url);
 a.ok(!('operatingStatus' in x));
 a.equal(all.filter(y=>y.id===id).length,1);
}
a.equal(official.cycle2Slot21Supplement.addedCount,6);
a.equal(official.cycle2Slot21Supplement.coordinateAdded,0);
a.equal(official.cycle2Slot21Supplement.locationsExcluded,0);
const entry=audit.entries.filter(e=>e.cycle===2&&e.slot===21);
a.equal(entry.length,1);a.equal(entry[0].additions,6);a.equal(entry[0].modifications,0);
a.equal(entry[0].locationCoordinatesAdded,0);a.equal(entry[0].locationHidden,0);
a.equal(entry[0].locationPending,108);
a.deepEqual(entry[0].assignedRegions,['대전광역시 동구','대전광역시 중구','대전광역시 서구','대전광역시 유성구','대전광역시 대덕구']);
a.equal(entry[0].locationRechecks.filter(x=>expected.some(y=>y[0]===x.id)).length,6);
a.ok(entry[0].unresolved.some(x=>x.name==='옥경이식당'),'상충 주소 후보 보류 기록');
a.ok(entry[0].locationRechecks.some(x=>x.name==='숯골원조냉면식당'&&x.unconfirmedReason.includes('121/122')));
a.equal(src.daejeonCycle2Slot21.newRestaurantCount,6);
a.equal(src.daejeonCycle2Slot21.locationPending,108);
const history=src.coverageAuditHistory.find(e=>e.id==='2026-11-10-daejeon-c2s21-citybook6');
a.ok(history);
a.equal(history.previousCoverage.uniqueRestaurants,3691);
a.equal(history.currentCoverage.uniqueRestaurants,3697);
a.equal(history.currentCoverage.regionalCounts['대전'],123);
a.equal(history.currentCoverage.coordinatesMissing,2584+6);
a.equal(history.currentCoverage.categoryCounts['한식'],2250+4);
a.equal(history.currentCoverage.categoryCounts['중식'],152+2);
a.ok(src.coverage.uniqueRestaurants>=3697,'후속 회차 확장 허용');
a.equal(src.coverage.uniqueRestaurants,src.coverage.coordinatesAvailable+src.coverage.coordinatesMissing);
a.equal(src.coverage.uniqueRestaurants,Object.values(src.coverage.categoryCounts).reduce((x,y)=>x+y,0));
a.equal(src.coverage.uniqueRestaurants,Object.values(src.coverage.regionalCounts).reduce((x,y)=>x+y,0));
const revision=JSON.parse(read('game-release.json')).revision;
a.ok(read('shared/games/world-game-assets.js').includes("const revision='"+revision+"'"));
a.ok(read('world.html').includes('world-game-assets.js?v='+revision));
a.ok(read('shared/games/world-game-assets.js').includes('world-restaurant-guide.js?v='+revision));
a.ok(read('games/certified-restaurants/world-restaurant-guide.js').includes('index.html?v='+revision));
a.ok(read('games/certified-restaurants/index.html').includes('app.js?v='+revision));
a.ok(read('games/certified-restaurants/app.js').includes('restaurants.json?v='+revision));
a.ok(read('games/certified-restaurants/app.js').includes('official-daejeon-slot21.json?v='+revision));
console.log('PASS: 2순환21회차 대전 시청책자 신규6·좌표0·대기108·리비전·집계');
