const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});try{
const registry=fs.readFileSync(path.join(__dirname,'../world.html'),'utf8').match(/function worldRankGames\(\)\{return \{[\s\S]*?\n\};\}/)[0];
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent('<style>:root{--surface:#fffdf9;--ink:#302b38;--ink-2:#8a818e;--line:#ece7ee;--accent:#d883a2;--accent-ink:#a94474;--accent-soft:#f5e6ee}body{background:#f7f3f6;font-family:sans-serif;padding:8px}button{cursor:pointer}</style><main id="board" data-board-root></main>');
await page.addStyleTag({path:path.join(__dirname,'../world-board.css')});await page.addScriptTag({path:path.join(__dirname,'../world-board.js')});
await page.evaluate(()=>{
window.calls=[];window.openedGames=[];window.fail=false;window.viewer='a';window.items=['text','image','video'].flatMap(kind=>Array.from({length:47},(_,i)=>({id:kind+'-'+String(i).padStart(2,'0'),source:kind==='text'?'post':'media',kind,title:i===0?'첫 제목 '+kind:'',body:kind+' 내용 '+i+' <img src=x onerror=alert(1)> '+('긴 내용 '.repeat(15)),created_at:new Date(Date.UTC(2026,8,30,0,0,-i)).toISOString(),like_count:i===12?99:0,is_liked:false})));
function query(table){const filters=[],orders=[];let from=0,to=999;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},in(k,v){filters.push([k,v]);return q},lte(){return q},order(k,o){orders.push([k,o]);return q},range(a,b){from=a;to=b;return q},limit(n){to=n-1;return q},insert(){return q},delete(){return q},then(resolve){calls.push({table,filters,orders,from,to});if(window.fail){window.fail=false;return Promise.resolve({error:{message:'offline'}}).then(resolve);}let data=table==='world_board_likes'?[]:items.map(r=>({...r,type:r.kind,thumb_path:r.kind+'/'+r.id+'.jpg'})).filter(r=>filters.every(([k,v])=>Array.isArray(v)?v.includes(r[k]):r[k]===v));data.sort((a,b)=>{for(const[k,o]of orders){const diff=a[k]<b[k]?-1:a[k]>b[k]?1:0;if(diff)return o.ascending?diff:-diff;}return 0;});return Promise.resolve({data:data.slice(from,to+1)}).then(resolve);}};return q;}
window.client={
 from:query,
 rpc(name,{p_game}){calls.push({rpc:name,game:p_game});if(p_game==='runner'&&!window.rankRetried){window.rankRetried=true;return Promise.resolve({error:{message:'offline'}});}return Promise.resolve({data:p_game==='mole'?[{nick:'긴닉네임 <img src=x onerror=alert(1)>',score:1234}]:[]});},
 schema(){return {rpc(){return Promise.resolve({data:[{id:'card-1',body:'오늘도 수고했어요',like_count:10}]});}};},
 storage:{from(){return {createSignedUrls(paths){return Promise.resolve({data:paths.map(path=>({path,signedUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}))});},createSignedUrl(){return Promise.resolve({data:{signedUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}});}};}}
};
window.mount=()=>OjjudaBoard.mount(document.querySelector('#board'),{client,owner:viewer,games:{mole:{name:'두더지 잡기',emoji:'🔨',unit:'점'},runner:{name:'쭈 달리기',emoji:'🏃',unit:'점'},stacker:{name:'탑 쌓기',emoji:'🏗️',unit:'층'},breakout:{name:'벽돌깨기',emoji:'🎾',unit:'점'},spot:{name:'틀린그림찾기',emoji:'🔎',unit:'곳'},screw:{name:'나사 풀기',emoji:'🔩',unit:'점'}},authorized:()=>viewer==='a',onOpenGame:id=>openedGames.push(id)});mount();
});
await page.waitForFunction(()=>document.querySelectorAll('[data-latest=text] .board-row').length===5);
assert.equal(await page.locator('.board-best').count(),4);
for(const kind of ['card','text','image','video'])assert.equal(await page.locator(`[data-best=${kind}] .board-row`).count(),1);
assert.equal(await page.locator('.board-leader').count(),6);
assert.ok((await page.locator('[data-game=mole]').innerText()).includes('1,234점'));
assert.equal(await page.locator('[data-game=mole] img').count(),0,'nickname renders as text');
await page.locator('[data-game=runner] .board-leader-retry').click();await page.waitForSelector('[data-game=runner] .board-leader-empty');
assert.equal(await page.locator('.board-leader-empty').count(),5,'no invented winners');
assert.equal(await page.locator('.board-rank-page').count(),2);
for(const slide of await page.locator('.board-rank-page').all())assert.equal(await slide.locator('tbody tr').count(),3);
assert.equal(await page.locator('th.board-leader-game .board-game-open').count(),6,'enabled boards expose game names as native buttons');
await page.locator('[data-game=mole] .board-game-open').click();await page.locator('[data-game=runner] .board-game-open').focus();await page.keyboard.press('Enter');await page.locator('[data-game=stacker] .board-game-open').focus();await page.keyboard.press('Space');
assert.deepEqual(await page.evaluate(()=>openedGames),['mole','runner','stacker'],'click, Enter and Space open the correct game id');
await page.evaluate(()=>{viewer='other-account';document.querySelector('[data-game=mole] .board-game-open').click();viewer='a';});assert.deepEqual(await page.evaluate(()=>openedGames),['mole','runner','stacker'],'a stale unauthorized game button cannot open a game');
for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'interactive game names fit mobile width '+width);assert.equal(await page.locator('.board-rank-page').first().locator('.board-game-open').evaluateAll(buttons=>buttons.every(button=>{const box=button.getBoundingClientRect(),cell=button.closest('th').getBoundingClientRect();return box.width>0&&box.left>=cell.left-.5&&box.right<=cell.right+.5;})),true,'game links stay inside their ranking column');}
await page.clock.install();await page.clock.pauseAt(new Date());
await page.mouse.move(0,0);await page.evaluate(()=>{const stale=document.querySelector('[data-game=mole] .board-game-open');document.activeElement?.blur();OjjudaBoard.refresh();stale.click();});assert.deepEqual(await page.evaluate(()=>openedGames),['mole','runner','stacker'],'a replaced ranking button cannot open a game after refresh');
await page.clock.runFor(4999);assert.equal(await page.locator('.board-leaders').getAttribute('data-rank-page'),'0','first page stays five seconds');
await page.clock.runFor(1);assert.equal(await page.locator('.board-leaders').getAttribute('data-rank-page'),'1','five seconds advances');
await page.clock.runFor(5279);assert.equal(await page.locator('.board-leaders').getAttribute('data-rank-page'),'1','dwell starts after 280ms slide');
await page.clock.runFor(1);assert.equal(await page.locator('.board-leaders').getAttribute('data-rank-page'),'0','wraps to first page');
await page.evaluate(()=>document.querySelector('[aria-label="게임순위 자동 넘김 일시정지"]').click());await page.clock.runFor(12000);assert.equal(await page.locator('.board-leaders').getAttribute('data-rank-page'),'0','pause stops automatic movement');
await page.evaluate(()=>document.querySelector('[aria-label="다음 게임순위"]').click());assert.equal(await page.locator('.board-leaders').getAttribute('data-rank-page'),'1');
await page.clock.runFor(300);const swipeBox=await page.locator('.board-rank-viewport').boundingBox();await page.mouse.move(swipeBox.x+30,swipeBox.y+25);await page.mouse.down();await page.mouse.move(swipeBox.x+150,swipeBox.y+27);await page.mouse.up();
assert.equal(await page.locator('.board-leaders').getAttribute('data-rank-page'),'0','horizontal swipe goes back');
assert.deepEqual(await page.evaluate(()=>openedGames),['mole','runner','stacker'],'swiping the ranking board does not activate a game');
await page.clock.resume();
for(const box of await page.locator('.board-best').all())assert.ok((await box.boundingBox()).height<=115,'BEST height approximately halved');
for(const kind of ['text','image','video']){assert.equal(await page.locator(`[data-latest=${kind}] .board-row`).count(),5);assert.ok((await page.locator(`[data-best=${kind}] .board-row`).first().innerText()).startsWith(kind+' 내용 12'));}
assert.equal(await page.locator('img[onerror]').count(),0,'post body is text, never HTML');assert.equal(await page.locator('[data-latest=image] .board-thumb img').count(),5);assert.equal(await page.locator('[data-latest=video] .board-thumb img').count(),5);assert.equal(await page.locator('video').count(),0,'previews never load videos');assert.equal(await page.locator('[data-latest=video] .board-thumb-play').count(),5);
for(const kind of ['image','video']){const boxes=await page.locator(`[data-latest=${kind}] .board-row`).first().evaluate(row=>{const copy=row.querySelector('.board-row-text').getBoundingClientRect(),thumb=row.querySelector('.board-thumb').getBoundingClientRect();return {copyRight:copy.right,left:thumb.left,width:thumb.width,height:thumb.height};});assert.equal(boxes.width,44);assert.equal(boxes.height,44);assert.ok(boxes.left>boxes.copyRight);}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile has no horizontal overflow');
await page.locator('[data-latest=text] .board-more').click();await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===20);
await page.locator('.board-load').click();await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===40);await page.locator('.board-load').click();await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===47);
assert.equal(await page.locator('.board-load').count(),0);assert.equal((await page.locator('.board-row').allTextContents()).length,new Set(await page.locator('.board-row').allTextContents()).size);
await page.locator('.board-row').first().click();await page.waitForSelector('[aria-label="공감 0"]');assert.equal(await page.locator('[role=dialog] img').count(),0);await page.locator('[aria-label="공감 0"]').click();await page.waitForSelector('[aria-label="공감 1"]');
await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.press('Escape');await page.locator('[role=dialog]').waitFor({state:'detached'});assert.equal(await page.locator('[role=dialog]').count(),0);assert.equal(await page.evaluate(()=>OjjudaBoard.back()),true);await page.waitForSelector('[data-latest=image] .board-row');
await page.locator('[data-latest=image] .board-more').click();await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===20);assert.equal(await page.locator('.board-thumb img').count(),20);await page.evaluate(()=>window.fail=true);await page.locator('.board-load').click();await page.getByRole('button',{name:'다시 시도'}).click();await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===40);
await page.evaluate(()=>OjjudaBoard.refresh());await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===20);assert.ok((await page.locator('.board-list-heading').innerText()).includes('앨범 전체글'),'refresh preserves category');
await page.evaluate(()=>OjjudaBoard.back());await page.waitForSelector('[data-latest=video] .board-row');await page.screenshot({path:process.env.BOARD_SCREENSHOT||'/tmp/board-mobile.png',fullPage:true});
await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.addScriptTag({content:'var _r={mole:{name:"두더지 잡기",unit:"점"},runner:{name:"쭈 달리기",unit:"점"},stacker:{name:"탑 쌓기",unit:"층"},breakout:{name:"벽돌깨기",unit:"점"},spot:{name:"틀린그림찾기",unit:"곳"}};'+registry});
await page.evaluate(()=>{window.OjjudaMatgoAccess={visible:()=>false};OjjudaBoard.mount(document.querySelector('#board'),{client,owner:viewer,games:worldRankGames()});});
assert.equal(await page.locator('.board-game-open').count(),0,'standalone boards without an opening callback keep game names noninteractive');assert.ok((await page.locator('[data-game=mole] th.board-leader-game').innerText()).includes('두더지 잡기'));
assert.equal(await page.locator('.board-leader').count(),12);assert.equal(await page.locator('.board-rank-page').count(),4);
for(const key of ['carom4','carom3','pool8','screw_box','screw_flat','janggi','chess'])assert.equal(await page.locator(`[data-game=${key}]`).count(),1);
assert.equal(await page.locator('[data-game=screw]').count(),0,'no combined screw ranking');
assert.equal(await page.locator('[data-game=matgo]').count(),0,'existing visibility rule preserved');
await page.evaluate(()=>{OjjudaMatgoAccess.visible=()=>true;OjjudaBoard.mount(document.querySelector('#board'),{client,owner:viewer,games:worldRankGames()});});assert.equal(await page.locator('[data-game=matgo]').count(),1);
for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[aria-label="게임순위 자동 넘김 시작"]').waitFor();assert.equal(await page.locator('[aria-label="게임순위 자동 넘김 시작"]').count(),1,'reduced motion defaults to paused');
await page.setViewportSize({width:390,height:844});await page.locator('.board-leaders').screenshot({path:'/tmp/chalkboard-ranking.png'});
await page.evaluate(()=>{viewer=null;mount();});assert.equal(await page.locator('.board-row').count(),0,'session change clears prior records');assert.ok((await page.locator('#board').innerText()).includes('로그인'));
await page.clock.runFor(6000);assert.equal(await page.locator('.board-leaders').count(),0,'logout disposes carousel');assert.deepEqual(errors,[]);console.log('PASS: game-name links and keyboard activation, stale/unauthorized protection, standalone noninteractive labels, chalkboard ranking, exact 5-second dwell and 280ms slide, pause/swipe, distinct game variants, reduced motion, timer cleanup, BEST/latest lists, pagination, retry, refresh, detail/like/back, XSS safety, session clearing and mobile/desktop layout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
