const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const root=path.resolve(__dirname,'..');
 await page.route('https://board.test/**',r=>{const u=new URL(r.request().url());if(u.pathname==='/')return r.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><style>:root{--surface:#fff;--surface-2:#faf9fc;--ink:#29283f;--ink-2:#76758b;--line:#e3dfeb;--accent-ink:#645095}body{font-family:sans-serif;background:#f7f5fa;margin:0;padding:16px}.btn{font:inherit;border:1px solid #dedbe7;background:#fff;border-radius:22px;padding:10px 16px}.btn.pri{background:#705598;color:white}h2{font-size:22px}</style><main id="board"></main><script src="/world-board.js"></script><link rel="stylesheet" href="/world-board.css">`});const f=path.join(root,u.pathname);return f.startsWith(root+path.sep)&&fs.existsSync(f)?r.fulfill({path:f}):r.abort();});
 await page.goto('https://board.test/');
 await page.evaluate(()=>{
  window.comments=[];window.item={id:'example-post',source:'post',kind:'text',title:'이렇게 열심히 해도...',body:'아무도 몰라준다.ㅎㅎ\n그런데도 계속 부족한 것만 보인다.',created_at:new Date().toISOString(),like_count:0,is_liked:false};
  window.client={schema(){return {rpc:async()=>({data:[]})}},from(table){let filters=[],start=0,end=30,record=null,deleting=false;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},lte(){return q},order(){return q},range(a,b){start=a;end=b;return q},limit(n){end=n-1;return q},insert(r){record=r;return q},delete(){deleting=true;return q},then(resolve){if(record&&table==='world_board_comments')comments.unshift({...record,source:'post',record_id:record.post_id,author:{nickname:'댓글 작성자'},created_at:new Date().toISOString()});let data=(table==='world_board_feed'?[item]:table==='world_board_comments'?comments:[]).filter(r=>filters.every(([k,v])=>r[k]===v));if(deleting)comments=comments.filter(r=>!data.includes(r));return Promise.resolve({data:data.slice(start,end+1)}).then(resolve)}};return q}};
  OjjudaBoard.mount(document.querySelector('#board'),{client,owner:'member'});
 });
 await page.locator('[data-latest=text] .board-row').click();
 await page.getByRole('textbox',{name:'댓글 내용'}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('.board-comment-form textarea').disabled);
 assert.equal(await page.locator('[role=dialog] h3').innerText(),'이렇게 열심히 해도...');
 assert.equal(await page.locator('[role=dialog] .board-comments').count(),1,'the exact board detail includes the reply form');
 await page.getByRole('textbox',{name:'댓글 내용'}).fill('조금씩 해내고 있는 것도 충분히 대단해요.');
 await page.getByRole('button',{name:'댓글 등록',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.board-comment-list p')?.textContent.includes('조금씩'));
 assert.equal(await page.evaluate(()=>comments.length),1);
 await page.getByRole('button',{name:'닫기',exact:true}).click();
 await page.locator('[data-latest=text] .board-comment-link').click();
 await page.waitForFunction(()=>document.activeElement===document.querySelector('.board-comment-form textarea'));
 assert.equal(await page.locator('.board-comment-list p').innerText(),'조금씩 해내고 있는 것도 충분히 대단해요.');
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/workspace/scratch/f6fc9416cab4/ojjuda-media-work/board-detail-comments.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: real board detail lazily loads comments, submits, reopens the same thread, focuses reply and fits mobile/desktop.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
