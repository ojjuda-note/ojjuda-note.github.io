'use strict';
const a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'games/certified-restaurants');
const file=(f)=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
const add=file('official-gangwon-slot18.json'),base=file('restaurants.json'),sources=file('sources.json');
const audit=JSON.parse(fs.readFileSync(path.join(root,'ops/restaurant-region-audit.json'),'utf8'));
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
const sidecars=fs.readdirSync(dir).filter(x=>/^official-.*\.json$/.test(x));
const all=[...base.restaurants,...sidecars.flatMap(x=>file(x).restaurants||[])];
a.ok(add.restaurants.length>=12,'four additional city-tourism listings are preserved');
a.ok(all.length>=3153);
a.equal(new Set(all.map(x=>x.id)).size,all.length);
a.ok(add.restaurants.filter(x=>x.district==='춘천시').length>=7);
a.ok(add.restaurants.filter(x=>x.district==='원주시').length>=5);
for(const r of add.restaurants){
 a.equal(r.region,'강원');a.ok(r.address.startsWith('강원특별자치도 '+r.district+' '));
 a.equal(r.guides.length,1);a.equal(r.guides[0].provider,'local-guide');
 a.equal(r.guides[0].year,null);a.equal(r.guides[0].yearType,'listing');
 a.equal(r.guides[0].status,'official_tourism_listing');
 a.ok(r.guides[0].sourceUrl.startsWith('https://www.'));
}
a.ok(add.restaurants.filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lng)).length>=9,'existing five plus three newly mapped entries are safe');
a.ok(add.restaurants.filter(x=>x.district==='춘천시'&&Number.isFinite(x.lat)).every(x=>x.coordinateSourceUrl===x.addressSourceUrl));
a.ok(add.restaurants.filter(x=>x.district==='원주시'&&Number.isFinite(x.lat)).every(x=>x.coordinateSourceUrl?.startsWith('https://')&&x.coordinateCrosscheckUrl===x.addressSourceUrl));
a.ok(add.restaurants.filter(x=>x.district==='원주시'&&x.lat===null&&x.lng===null).length>=3,'unconfirmed locations remain unmapped');
a.equal(add.locationEnrichments.length,1);
const p=add.locationEnrichments[0],prev=base.restaurants.find(x=>x.id===p.id);
a.equal(p.expectedName,prev.name);a.equal(p.expectedAddress,prev.address);
a.equal(prev.lat,null);a.equal(prev.lng,null);a.ok(p.coordinateSourceUrl.startsWith('https://www.chuncheon.go.kr/'));
a.ok(app.includes('...slot18.restaurants'));a.ok(app.includes('slot18.locationEnrichments'));
const rev=JSON.parse(fs.readFileSync(path.join(root,'game-release.json'),'utf8')).revision;
a.ok(app.includes('./official-gangwon-slot18.json?v='+rev),'the edited file has the current game cache revision');
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
const newlyAdded=[
['local-gangwon-c2s18-chuncheon-todam','토담숯불닭갈비'],
['local-gangwon-c2s18-chuncheon-wooseong-umuk','우성닭갈비'],
['local-gangwon-c2s18-chuncheon-gamjabat','감자밭'],
['local-gangwon-c2s18-wonju-munmak-deokgok','문막덕곡막국수']
];
for(const [id,name] of newlyAdded){const r=add.restaurants.find(x=>x.id===id);
 a.ok(r,id);a.equal(r.name,name);a.ok(r.address.startsWith('강원특별자치도 '));
 a.equal(r.guides[0].year,null);a.equal(r.guides[0].status,'official_tourism_listing');
}
for(const id of ['local-gangwon-slot18-wonju-namgyeong-musil','local-gangwon-slot18-wonju-deokcheon-makguksu']){
 const r=add.restaurants.find(x=>x.id===id);a.ok(Number.isFinite(r?.lat)&&Number.isFinite(r?.lng),id);
 a.equal(r.coordinateSourceCheckedAt,'2026-11-10');
}
const c2=audit.entries.find(e=>e.cycle===2&&e.slot===18);
a.ok(c2);a.equal(c2.additions,4);a.equal(c2.modifications,5);
a.equal(c2.locationCoordinatesAdded,5);a.equal(c2.locationHidden,0);a.equal(c2.locationPending,3);
a.equal(c2.locationRechecks.length,3);a.equal(sources.gangwonCycle2Slot18.addedCount,4);
a.equal(sources.gangwonCycle2Slot18.modifiedCount,5);
a.equal(sources.latestCoverageAudit.slot,18);
a.deepEqual(sources.coverage,sources.latestCoverageAudit.currentCoverage);
console.log('restaurant slot18 and cycle2 follow-up verified');
