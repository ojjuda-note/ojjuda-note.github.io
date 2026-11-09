'use strict';
const a=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'games/certified-restaurants');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const slot=read('official-gangwon-slot20.json'),base=read('restaurants.json'),src=read('sources.json');
const audit=JSON.parse(fs.readFileSync(path.join(root,'ops/restaurant-region-audit.json'),'utf8'));
const all=[...base.restaurants,...fs.readdirSync(dir).filter(n=>/^official-.*\.json$/.test(n)).flatMap(n=>read(n).restaurants||[])];
a.ok(slot.restaurants.length>=29);a.ok(all.length>=3162);
a.equal(new Set(all.map(x=>x.id)).size,all.length);
a.deepEqual(slot.restaurants.slice(0,5).map(x=>x.district),['삼척시','태백시','태백시','태백시','태백시']);
a.deepEqual(slot.restaurants.slice(0,5).map(x=>x.category),['한식','한식','한식','디저트','디저트']);
for(const x of slot.restaurants.slice(0,5)){
 a.equal(x.region,'강원');a.ok(x.address.startsWith('강원특별자치도 '+x.district+' '));
 if(['엄마손태백물닭갈비','서울닭갈비'].includes(x.name)){a.ok(Number.isFinite(x.lat)&&Number.isFinite(x.lng));a.ok(x.coordinateSource?.url?.startsWith('https://'));} else {a.equal(x.lat,null);a.equal(x.lng,null);} a.equal(x.guides.length,1);
 a.equal(x.guides[0].provider,'local-guide');a.equal(x.guides[0].year,null);
 a.equal(x.guides[0].yearType,'listing');a.equal(x.guides[0].status,'official_tourism_partnership');
 a.ok(x.guides[0].sourceUrl.startsWith('https://korean.visitkorea.or.kr/dgtourcard/'));
 a.equal(x.addressSourceUrl,x.guides[0].sourceUrl);
}
a.ok(src.coverage.uniqueRestaurants>=3162);a.ok(src.coverage.coordinatesAvailable>=1029);
a.ok(src.coverage.coordinatesMissing>=2133);a.ok(src.coverage.regionalCounts['강원']>=61, 'later Gangwon listings retain earlier records');
a.ok(src.coverage.providerCounts['local-guide']>=2431);
a.equal(src.localGovernment.municipalTourism20261106GangwonSlot20.recordCount,5);
const log=audit.entries.find(x=>x.cycle===1&&x.slot===20);a.ok(log);
a.equal(log.additions,5);a.equal(log.locationCoordinatesAdded,0);a.equal(log.locationHidden,0);
a.equal(log.locationPending,5);a.equal(log.locationRechecks.length,5);a.ok(audit.active.cycle>=1 && audit.active.slot>=1 && audit.active.slot<=84);
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
a.match(app,/official-gangwon-slot20\.json\?v=\d{8}-restaurants-/);
a.ok(app.includes('...slot20.restaurants'));
const rev=JSON.parse(fs.readFileSync(path.join(root,'game-release.json'),'utf8')).revision;
a.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),/app\.js\?v=\d{8}-restaurants-/);
a.ok(fs.readFileSync(path.join(root,'world.html'),'utf8').includes('shared/games/world-game-assets.js?v='+rev));
a.match(fs.readFileSync(path.join(root,'shared/games/world-game-assets.js'),'utf8'),/restaurants:'1\.\d+\.\d+'/);

const cycle2=audit.entries.find(x=>x.cycle===2&&x.slot===20);
a.ok(cycle2,'cycle 2 slot20 audit exists');
a.equal(cycle2.additions,24);a.equal(cycle2.modifications,2);
a.equal(cycle2.locationCoordinatesAdded,4);a.equal(cycle2.locationHidden,0);
a.equal(cycle2.locationPending,25);a.equal(cycle2.locationRechecks.length,25);
const officialUrl='https://www.sokcho.go.kr/ct/tour/pleasure/restaurant/model';
const sokcho=slot.restaurants.filter(x=>x.id.startsWith('local-gangwon-c2s20-sokcho-'));
a.equal(sokcho.length,17);
const names=['니어앤디어브런치카페','단천면옥','단천식당','대선회집','대포리','딜리조이','와규더테이블','임가원','차이칸'];
for(const name of names){
 const x=sokcho.find(x=>x.name===name);a.ok(x,name);
 a.equal(x.lat,null);a.equal(x.lng,null);
 a.ok(x.address.startsWith('강원특별자치도 속초시 '));
 a.equal(x.guides[0].provider,'local-guide');a.equal(x.guides[0].year,2026);
 a.equal(x.guides[0].yearType,'listing');a.equal(x.guides[0].sourceUrl,officialUrl);
}
a.equal(src.gangwonCycle2Slot20.addedCount,24);
a.equal(src.gangwonCycle2Slot20.locationPending,25);
a.equal(src.coverage.uniqueRestaurants,3691);
a.equal(src.coverage.coordinatesAvailable+src.coverage.coordinatesMissing,src.coverage.uniqueRestaurants);
a.equal(Object.values(src.coverage.categoryCounts).reduce((v,x)=>v+x,0),src.coverage.uniqueRestaurants);
a.equal(Object.values(src.coverage.regionalCounts).reduce((v,x)=>v+x,0),src.coverage.uniqueRestaurants);

console.log('restaurant slot20 verified');
