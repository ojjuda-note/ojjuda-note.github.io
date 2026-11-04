const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const festival=read('world-festival-schedule.js'),restaurant=read('world-restaurant-guide.js');
const festivalCss=read('world-festival-schedule.css'),restaurantCss=read('world-restaurant-guide.css');
const assets=read('world-game-assets.js'),world=read('world.html'),release=JSON.parse(read('game-release.json'));
for(const [name,source] of [['festival',festival],['restaurant',restaurant]]){
assert.match(source,/class="agit-home-link"/i,name+' renders the Agit home logo button');
assert.match(source,/aria-label="오쭈다 아지트 홈으로 이동"/,name+' exposes the home destination');
assert.match(source,/favicon\.svg/,name+' uses the official Agit mark');
assert.match(source,/오쭈다 아지트/,name+' shows the Agit wordmark');
assert.match(source,/window\.location\.assign\('\/world\.html'\)/,name+' routes the logo to Agit home');
}
assert.match(festivalCss,/\.agit-home-link/);assert.match(restaurantCss,/\.agit-home-link/);
assert.match(assets,/festival:'1\.1\.2'/);assert.match(assets,/restaurants:'1\.8\.3'/);
assert.ok(world.includes('/world-game-assets.js?v='+release.revision));
assert.ok(assets.includes("const revision='"+release.revision+"';"));
console.log('PASS: festival and restaurant headers show an accessible Agit logo that routes home');
