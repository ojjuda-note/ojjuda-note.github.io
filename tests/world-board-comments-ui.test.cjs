const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:360,height:800}});
 await page.route('https://board.test/',r=>r.fulfill({contentType:'text/html',body:'<main id="comments"></main>'}));await page.goto('https://board.test/');
 await page.addStyleTag({path:path.join(__dirname,'../world-board.css')});await page.addScriptTag({path:path.join(__dirname,'../world-board-comments.js')});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>{
  window.rows=[];window.writes=[];window.active=true;
  window.client={from(table){let operation='read',record,filters=[],start=0,end=30;const q={
   select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},range(a,b){start=a;end=b;return q},limit(n){end=n-1;return q},delete(){operation='delete';return q},insert(r){operation='insert';record=r;return q},
   then(resolve){return Promise.resolve().then(()=>{
    if(operation==='insert'){
     writes.push({table,...record});
     if(rows.some(r=>r.id===record.id))return {error:{code:'23505'}};
     if(window.failOnce){window.failOnce=false;return {error:{code:'offline'}};}
     const row={...record,source:record.post_id?'post':record.diary_id?'diary':'media',record_id:record.post_id||record.diary_id,author:{nickname:'내 닉네임'},author_nick:'내 닉네임',created_at:new Date().toISOString()};rows.unshift(row);
     if(window.uncertainOnce){window.uncertainOnce=false;return {error:{code:'offline'}};}
     return {data:[]};
    }
    const found=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
    if(operation==='delete'){rows=rows.filter(r=>!found.includes(r));return {data:found};}
    return {data:found.slice(start,end+1)};
   }).then(resolve);}
  };return q;}};
  window.mount=source=>{window.active=true;rows=[];writes=[];OjjudaBoardComments.mount(document.querySelector('#comments'),{client,owner:'me',item:{source,id:'parent'},active:()=>active});};
 });
 for(const source of ['post','diary','media']){
  await page.evaluate(source=>mount(source),source);await page.waitForFunction(()=>!document.querySelector('textarea').disabled);
  const body='긴 댓글도 저장해요. <img src=x onerror=alert(1)>\n'.repeat(12);
  await page.getByRole('textbox',{name:'댓글 내용'}).fill(body);await page.getByRole('button',{name:'댓글 등록',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.board-comment-list p')?.textContent.includes('긴 댓글'));
  assert.equal(await page.locator('.board-comment-list p').innerText(),body.trim());assert.equal(await page.locator('.board-comment-list img').count(),0);
  const write=await page.evaluate(()=>writes[0]);assert.equal(write.table,source==='media'?'media_comments':'world_board_comments');assert.equal(write[source==='media'?'media_id':source==='post'?'post_id':'diary_id'],'parent');
  await page.getByRole('button',{name:'내 댓글 삭제'}).click();await page.waitForFunction(()=>!document.querySelector('.board-comment-list li'));
 }
 await page.evaluate(()=>{mount('post');window.failOnce=true;});await page.waitForFunction(()=>!document.querySelector('textarea').disabled);
 await page.getByRole('textbox').fill('실패해도 남는 내용');await page.getByRole('button',{name:'댓글 등록',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('유지'));
 assert.equal(await page.getByRole('textbox').inputValue(),'실패해도 남는 내용');await page.getByRole('button',{name:'댓글 등록',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.board-comment-list li'));
 assert.equal(await page.evaluate(()=>writes[0].id===writes[1].id),true);
 await page.evaluate(()=>{mount('diary');window.uncertainOnce=true;});await page.waitForFunction(()=>!document.querySelector('textarea').disabled);
 await page.getByRole('textbox').fill('응답 유실 뒤 재시도');await page.getByRole('button',{name:'댓글 등록',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('유지'));
 await page.getByRole('button',{name:'댓글 등록',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.board-comment-list li'));
 assert.equal(await page.evaluate(()=>rows.length),1,'uncertain success retries the same id, never a duplicate');
 await page.evaluate(()=>{active=false;document.querySelector('textarea').value='계정 변경';document.querySelector('form').dispatchEvent(new Event('submit',{cancelable:true}));});assert.equal(await page.evaluate(()=>rows.length),1);
 assert.deepEqual(errors,[]);console.log('PASS: board post/diary/shared media comments, long text, safe rendering, deletion, retry idempotency and stale-session protection.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
