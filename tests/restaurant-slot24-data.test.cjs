'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'games/certified-restaurants');
const data=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const slot=data('official-chungbuk-slot24.json'),base=data('restaurants.json'),sources=data('sources.json');
const audit=JSON.parse(fs.readFileSync(path.join(root,'ops/restaurant-region-audit.json'),'utf8'));
assert.equal(slot.restaurants.length,8);
assert.equal(slot.completeRegionalCollection,false);
const allIds=new Set(base.restaurants.map(x=>x.id));
for(const name of fs.readdirSync(dir).filter(x=>/^official-.*\.json$/.test(x))){
 for(const r of data(name).restaurants||[]){assert.ok(!allIds.has(r.id),'duplicate ID: '+r.id);allIds.add(r.id);}
}
assert.deepEqual(slot.restaurants.reduce((out,r)=>{out[r.district]=(out[r.district]||0)+1;return out;},{}),{'제천시':7,'충주시':1});
for(const r of slot.restaurants){
 assert.equal(r.region,'충북');assert.ok(r.address.startsWith('충청북도 '+r.district+' '));
 assert.equal(r.lat,null);assert.equal(r.lng,null);
 assert.ok(['한식','양식','디저트'].includes(r.category));
 assert.equal(r.guides.length,1);
 const g=r.guides[0];assert.equal(g.provider,'local-guide');assert.equal(g.year,null);assert.equal(g.yearType,'listing');
 assert.match(g.sourceUrl,/^https:\/\/(tour\.jecheon\.go\.kr|tour\.chungbuk\.go\.kr)\//);
 assert.equal(g.verifiedAt,'2026-11-06');assert.equal(r.addressSourceUrl,g.sourceUrl);
 assert.equal(r.coordinateSource,undefined);
}
assert.ok(sources.coverage.uniqueRestaurants>=3178);
assert.ok(sources.coverage.regionalCounts['충북']>=225);
assert.equal(sources.latestCoverageAudit.id,'2026-11-06-chungbuk-slot24-official-tourism');
const entries=audit.entries.filter(e=>e.cycle===1&&e.slot===24);
assert.equal(entries.length,1);assert.equal(entries[0].additions,8);
assert.equal(entries[0].locationCoordinatesAdded,0);assert.equal(entries[0].locationHidden,0);
assert.equal(entries[0].locationPending,24);assert.equal(entries[0].locationRechecks.length,24);
const app=fs.readFileSync(path.join(dir,'app.js'),'utf8');
assert.match(app,/fetch\('\.\/official-chungbuk-slot24\.json\?v=/);
assert.ok(app.includes('...slot24.restaurants'));
const release=JSON.parse(fs.readFileSync(path.join(root,'game-release.json'),'utf8')).revision;
const assets=fs.readFileSync(path.join(root,'world-game-assets.js'),'utf8');
const world=fs.readFileSync(path.join(root,'world.html'),'utf8');
assert.ok(assets.includes("const revision='"+release+"';"));
assert.ok(world.includes('/world-game-assets.js?v='+release));
assert.match(assets,/restaurants:'1\.9\.(?:3[1-9]|[4-9]\d+)'/);
console.log('restaurant slot24 verified');
