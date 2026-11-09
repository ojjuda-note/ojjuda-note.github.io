'use strict';
const a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'games/certified-restaurants');
const file=(f)=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
const add=file('official-gangwon-slot18.json'),base=file('restaurants.json'),sources=file('sources.json');
const audit=JSON.parse(fs.readFileSync(path.join(root,'ops/restaurant-region-audit.json'),'utf8'));
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
const sidecars=fs.readdirSync(dir).filter(x=>/^official-.*\.json$/.test(x));
const all=[...base.restaurants,...sidecars.flatMap(x=>file(x).restaurants||[])];
a.equal(add.restaurants.length,13);
a.ok(all.length>=3153);
a.equal(new Set(all.map(x=>x.id)).size,all.length);
a.equal(add.restaurants.filter(x=>x.district==='춘천시').length,8);
a.equal(add.restaurants.filter(x=>x.district==='원주시').length,5);
for(const r of add.restaurants){
 a.equal(r.region,'강원');a.ok(r.address.startsWith('강원특별자치도 '+r.district+' '));
 a.equal(r.guides.length,1);a.equal(r.guides[0].provider,'local-guide');
 a.equal(r.guides[0].year,null);a.equal(r.guides[0].yearType,'listing');
 a.equal(r.guides[0].status,'official_tourism_listing');
 a.ok(r.guides[0].sourceUrl.startsWith('https://www.'));
}
a.equal(add.restaurants.filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lng)).length,10);
a.ok(add.restaurants.filter(x=>Number.isFinite(x.lat)).every(x=>x.district==='춘천시' ? x.coordinateSourceUrl===x.addressSourceUrl : /^https:\/\/xju\.purpleo\.kr\/article\/\d+$/.test(x.coordinateSourceUrl)));
a.equal(add.restaurants.filter(x=>x.district==='원주시'&&x.lat===null&&x.lng===null).length,3);
a.equal(add.locationEnrichments.length,1);
const p=add.locationEnrichments[0],prev=base.restaurants.find(x=>x.id===p.id);
a.equal(p.expectedName,prev.name);a.equal(p.expectedAddress,prev.address);
a.equal(prev.lat,null);a.equal(prev.lng,null);a.ok(p.coordinateSourceUrl.startsWith('https://www.chuncheon.go.kr/'));
a.ok(app.includes('...slot18.restaurants'));a.ok(app.includes('slot18.locationEnrichments'));
const rev=JSON.parse(fs.readFileSync(path.join(root,'game-release.json'),'utf8')).revision;
const restaurantRevision=fs.readFileSync(path.join(root,'shared/games/world-game-assets.js'),'utf8').match(/world-restaurant-guide\.js\?v=([\w-]+)/)?.[1];
a.ok(restaurantRevision);a.match(app,/official-gangwon-slot18\.json\?v=\d{8}-restaurants-/);
a.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),/app\.js\?v=\d{8}-restaurants-/);
a.ok(fs.readFileSync(path.join(root,'world.html'),'utf8').includes('shared/games/world-game-assets.js?v='+rev));
a.match(fs.readFileSync(path.join(root,'shared/games/world-game-assets.js'),'utf8'),/restaurants:'1\.\d+\.\d+'/);
a.ok(sources.coverage.uniqueRestaurants>=3153);
a.ok(sources.coverage.coordinatesAvailable>=1028);
a.ok(sources.coverage.coordinatesMissing>=2125);
a.ok(sources.coverage.providerCounts['local-guide']>=2422);
a.ok(sources.coverage.regionalCounts['강원']>=52);
a.ok(sources.coverage.categoryCounts['한식']>=1852);
const log=audit.entries.find(e=>e.cycle===1&&e.slot===18);
a.ok(log);a.equal(log.additions,8);a.equal(log.modifications,1);
a.equal(log.locationCoordinatesAdded,5);a.equal(log.locationHidden,0);
a.equal(log.locationPending,4);a.equal(log.locationRechecks.length,4);

const second=audit.entries.filter(e=>e.cycle===2&&e.slot===18);
a.equal(second.length,1);a.equal(second[0].additions,5);a.equal(second[0].modifications,2);
a.equal(second[0].locationCoordinatesAdded,6);a.equal(second[0].locationHidden,0);
a.equal(second[0].locationPending,3);a.equal(second[0].locationRechecks.length,3);
a.equal(sources.gangwonCycle2Slot18.addedCount,5);
a.equal(sources.gangwonCycle2Slot18.coordinateAdded,6);
a.ok(sources.coverage.uniqueRestaurants>=3667);
a.ok(sources.coverage.coordinatesAvailable>=1100);
a.equal(sources.coverage.coordinatesAvailable+sources.coverage.coordinatesMissing,sources.coverage.uniqueRestaurants);
const expectedNew=[
 ['local-gangwon-c2s18-chuncheon-todam-charcoal-dakgalbi','토담숯불닭갈비',37.9296186943565],
 ['local-gangwon-c2s18-chuncheon-gamjabat','감자밭',37.9295909692917],
 ['local-gangwon-c2s18-chuncheon-byeoldang-makguksu','별당막국수',37.8720784028616],
 ['local-gangwon-c2s18-chuncheon-gomhotdog','박사마을곰핫도그',37.9010318362981],
 ['local-gangwon-c2s18-wonju-sorotgil','소롯길',null]
];
for(const [id,name,lat] of expectedNew){
 const item=add.restaurants.find(x=>x.id===id);
 a.ok(item);a.equal(item.name,name);a.equal(item.lat,lat);a.equal(item.guides[0].year,null);
}
for(const id of ['local-gangwon-slot18-wonju-namgyeong-musil','local-gangwon-slot18-wonju-deokcheon-makguksu']){
 const item=add.restaurants.find(x=>x.id===id);
 a.ok(item);a.ok(Number.isFinite(item.lat));a.ok(item.coordinateSource.url.startsWith('https://xju.purpleo.kr/article/'));
}

console.log('restaurant slot18 initial and cycle2 verified');
