const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});try{
const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent('<style>:root{--surface:#fffdf9;--ink:#302b38;--ink-2:#8a818e;--line:#ece7ee;--accent:#d883a2;--accent-ink:#a94474;--accent-soft:#f5e6ee}body{background:#f7f3f6;font-family:sans-serif;padding:8px}button{cursor:pointer}</style><main id="board" data-board-root></main>');
await page.addStyleTag({path:path.join(__dirname,'../world-board.css')});await page.addScriptTag({path:path.join(__dirname,'../world-board.js')});
await page.evaluate(()=>{
window.calls=[];window.fail=false;window.viewer='a';window.items=['text','image','video'].flatMap(kind=>Array.from({length:47},(_,i)=>({id:kind+'-'+String(i).padStart(2,'0'),source:kind==='text'?'post':'media',kind,title:i===0?'첫 제목 '+kind:'',body:kind+' 내용 '+i+' <img src=x onerror=alert(1)> '+('긴 내용 '.repeat(15)),created_at:new Date(Date.UTC(2026,8,30,0,0,-i)).toISOString(),like_count:i===12?99:0,is_liked:false})));
function query(table){const filters=[],orders=[];let from=0,to=999;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},lte(){return q},order(k,o){orders.push([k,o]);return q},range(a,b){from=a;to=b;return q},limit(n){to=n-1;return q},insert(){return q},delete(){return q},then(resolve){calls.push({table,filters,orders,from,to});if(window.fail){window.fail=false;return Promise.resolve({error:{message:'offline'}}).then(resolve);}let data=table==='world_board_likes'?[]:items.filter(r=>filters.every(([k,v])=>r[k]===v));data.sort((a,b)=>{for(const[k,o]of orders){const diff=a[k]<b[k]?-1:a[k]>b[k]?1:0;if(diff)return o.ascending?diff:-diff;}return 0;});return Promise.resolve({data:data.slice(from,to+1)}).then(resolve);}};return q;}
window.client={
 from:query,
 schema(){return {rpc(){return Promise.resolve({data:[{id:'card-1',body:'오늘도 수고했어요',like_count:10}]});}};},
 storage:{from(){return {createSignedUrl(){return Promise.resolve({data:{signedUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'}});}};}}
};
window.mount=()=>OjjudaBoard.mount(document.querySelector('#board'),{client,owner:viewer,authorized:()=>viewer==='a'});mount();
});
await page.waitForFunction(()=>document.querySelectorAll('[data-latest=text] .board-row').length===5);
assert.equal(await page.locator('.board-best').count(),4);for(const kind of ['text','image','video']){assert.equal(await page.locator(`[data-latest=${kind}] .board-row`).count(),5);assert.ok((await page.locator(`[data-best=${kind}] .board-row`).first().innerText()).startsWith(kind+' 내용 12'));}
assert.equal(await page.locator('img').count(),0,'post body is text, never HTML');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile has no horizontal overflow');
await page.locator('[data-latest=text] .board-more').click();await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===20);
await page.locator('.board-load').click();await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===40);await page.locator('.board-load').click();await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===47);
assert.equal(await page.locator('.board-load').count(),0);assert.equal((await page.locator('.board-row').allTextContents()).length,new Set(await page.locator('.board-row').allTextContents()).size);
await page.locator('.board-row').first().click();await page.waitForSelector('[aria-label="공감 0"]');assert.equal(await page.locator('[role=dialog] img').count(),0);await page.locator('[aria-label="공감 0"]').click();await page.waitForSelector('[aria-label="공감 1"]');
await page.keyboard.press('Escape');assert.equal(await page.locator('[role=dialog]').count(),0);assert.equal(await page.evaluate(()=>OjjudaBoard.back()),true);await page.waitForSelector('[data-latest=image] .board-row');
await page.locator('[data-latest=image] .board-more').click();await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===20);await page.evaluate(()=>window.fail=true);await page.locator('.board-load').click();await page.getByRole('button',{name:'다시 시도'}).click();await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===40);
await page.evaluate(()=>OjjudaBoard.refresh());await page.waitForFunction(()=>document.querySelectorAll('.board-row').length===20);assert.ok((await page.locator('.board-list-heading').innerText()).includes('앨범 전체글'),'refresh preserves category');
await page.evaluate(()=>OjjudaBoard.back());await page.waitForSelector('[data-latest=video] .board-row');await page.screenshot({path:'/workspace/scratch/162a9ca2081e/board-mobile.png',fullPage:true});
await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await page.evaluate(()=>{viewer=null;mount();});assert.equal(await page.locator('.board-row').count(),0,'session change clears prior records');assert.ok((await page.locator('#board').innerText()).includes('로그인'));
assert.deepEqual(errors,[]);console.log('PASS: four BEST areas, three five-row lists, real sort queries, 47-row pagination, retry, refresh, detail/like/back, XSS safety, session clearing and mobile/desktop layout');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
