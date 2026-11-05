'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname,'..');
const dir = path.join(root,'games/certified-restaurants');
const supplement = JSON.parse(fs.readFileSync(path.join(dir,'official-goyang-paju-slot10.json'),'utf8'));
const app = fs.readFileSync(path.join(dir,'app.js'),'utf8');
const html = fs.readFileSync(path.join(dir,'index.html'),'utf8');
const source = JSON.parse(fs.readFileSync(path.join(dir,'sources.json'),'utf8'));
test('Goyang and Paju official listings are distinct, sourced, and not guessed coordinates',()=>{
 assert.equal(supplement.restaurants.length,7);
 assert.equal(new Set(supplement.restaurants.map(x=>x.id)).size,7);
 for(const item of supplement.restaurants){
  assert.match(item.address,/^경기도 (고양시|파주시) /);
  assert.equal(item.lat,null); assert.equal(item.lng,null);
  assert.ok(['한식','중식','일식','양식','분식','디저트','기타'].includes(item.category));
  assert.ok(item.guides.length>0);
  assert.ok(item.guides.every(guide=>guide.provider==='local-guide' && guide.sourceUrl.startsWith('https://') && guide.year===null && guide.verifiedAt==='2026-11-06'));
 }
 assert.equal(supplement.restaurants.filter(x=>x.district.startsWith('고양시')).length,3);
 assert.equal(supplement.restaurants.filter(x=>x.district==='파주시').length,4);
 assert.ok(supplement.restaurants.filter(x=>x.name!=='오두산막국수').every(x=>x.guides.every(g=>g.status==='official_restaurant_listing')));
 assert.equal(supplement.restaurants.find(x=>x.name==='오두산막국수').guides[0].status,'historical_designation');
});
test('app loads and deduplicates supplement while preserving member recommendations',()=>{
 assert.match(app,/fetch\('\.\/official-goyang-paju-slot10\.json\?v=/);
 assert.match(app,/\.\.\.goyangPaju\.restaurants/);
 assert.match(html,/app\.js\?v=20261106-restaurants-goyang-paju-slot10-1/);
 assert.ok(source.coverage.uniqueRestaurants >= 3099);
 assert.ok(source.coverage.coordinatesAvailable >= 1023);
 assert.ok(source.coverageAuditHistory.some(entry=>entry.id==='2026-11-06-gyeonggi-slot10-goyang-paju' && entry.newRestaurantCount===7));
});
