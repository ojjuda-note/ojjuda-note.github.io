const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');const {chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://review.test/photo',r=>r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="#cedacf"/><circle cx="240" cy="150" r="90" fill="#9ab6a0"/></svg>'}));
 await page.setContent('<style>:root{--surface:white;--surface-2:#f5f6fc;--ink:#23264a;--ink-2:#626894;--line:#daddef;--accent:#f0679a;--accent-ink:#a93263;--accent-soft:#fbedf2}*{box-sizing:border-box}body{background:#edeff9;font-family:sans-serif;margin:12px}.btn,.inp{padding:8px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}button{cursor:pointer}</style><main id="inbox"></main>');
 await page.addStyleTag({path:path.join(__dirname,'../admin/review-inbox.css')});await page.addScriptTag({path:path.join(__dirname,'../admin/review-inbox.js')});
 await page.evaluate(()=>{
  window.calls=[];window.owner='admin';window.fail=false;window.navigated=[];window.confirm=()=>true;
  const base={author_nick:'작성자 <img src=x>',author_id:'member',owner_id:'member',created_at:'2026-10-01T00:00:00Z',is_private:false,revision:'rev',meta:{},body:'확인할 내용',status:'active'};
  window.rows=[{...base,key:'world_report:1',kind:'world_report',id:'1',priority:0,title:'신고 · abuse'},
   {...base,key:'game_photo:2',kind:'game_photo',id:'2',priority:1,status:'pending',bucket:'photo-stages',path:'thumb',full_path:'full',meta:{visibility:'public'}},
   {...base,key:'chat:3',kind:'chat',id:'3',priority:2,title:'park-1',body:'위험 신호가 감지된 문장'},
   {...base,key:'board_comment:4',kind:'board_comment',id:'4',priority:3,body:'긴 댓글 전체 '.repeat(100),meta:{revision:'bodyrev'}},
   {...base,key:'video:5',kind:'video',id:'5',priority:3,bucket:'media',path:'thumb',full_path:'full',body:'동영상'}];
  window.client={storage:{from(){return {createSignedUrl:async()=>({data:{signedUrl:'https://review.test/photo'}})}}},async rpc(name,args){calls.push({name,args});if(fail)return {error:{message:'offline'}};
   if(name==='admin_review_feed'){const items=rows.filter(r=>(args.p_kind==='all'||r.kind===args.p_kind)&&(args.p_state==='all'||args.p_state==='priority'&&r.priority<3||args.p_state==='pending'&&r.priority===1||args.p_state==='reports'&&r.priority===0||args.p_state==='risk'&&r.priority===2)&&(!args.p_q||r.body.includes(args.p_q)));return {data:{items,has_more:false,next_cursor:null,counts:{all:rows.length,pending:rows.filter(r=>r.priority===1).length,reports:rows.filter(r=>r.priority===0).length,risk:rows.filter(r=>r.priority===2).length,matched:items.length}}};}
   if(name==='admin_review_detail')return {data:rows.find(r=>r.key===args.p_key)};
   if(name==='admin_review_action'){const row=rows.find(r=>r.key===args.p_key);row.priority=3;row.status=args.p_action;return {data:{ok:true}};}
   if(name==='admin_house_content_edit'){rows.find(r=>r.id===args.p_id).body=args.p_body;return {data:{ok:true}};}
   return {error:{message:'unexpected'}};
  }};
  window.controller=OjjudaReviewInbox.mount({container:document.querySelector('#inbox'),client,getAdminId:()=>owner,onNavigate:r=>navigated.push(r.key)});
 });
 const idle=()=>page.waitForFunction(()=>document.querySelector('.ri-list').getAttribute('aria-busy')==='false');await idle();
 assert.deepEqual(await page.locator('.ri-card').evaluateAll(xs=>xs.map(x=>Number(x.dataset.priority))),[0,1,2,3,3]);assert.equal(await page.locator('.ri-meta img').count(),0);
 const photo=page.locator('[data-key="game_photo:2"]');await page.waitForFunction(()=>!document.querySelector('[data-key="game_photo:2"] button').disabled);
 await photo.getByRole('button',{name:'승인 · 공개'}).click();await idle();assert.equal(await page.evaluate(()=>calls.some(c=>c.name==='admin_review_action'&&c.args.p_action==='approved')),true);
 const comment=page.locator('[data-key="board_comment:4"]');await comment.getByText('전체 내용 보기',{exact:true}).click();await page.waitForSelector('[data-key="board_comment:4"] .ri-body');assert.ok((await comment.locator('.ri-body').innerText()).length>500);
 await comment.getByRole('button',{name:'수정',exact:true}).click();await comment.getByRole('textbox',{name:'본문 수정'}).fill('관리자가 수정한 긴 댓글 '.repeat(30));await comment.getByRole('button',{name:'수정 저장'}).click();await idle();assert.equal(await page.evaluate(()=>calls.at(-2).name),'admin_house_content_edit');
 await page.getByRole('combobox',{name:'콘텐츠 종류'}).selectOption('chat');await idle();assert.equal(await page.locator('.ri-card').count(),1);
 await page.getByRole('combobox',{name:'콘텐츠 종류'}).selectOption('all');await idle();
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 if(process.env.REVIEW_INBOX_QA_DIR)await page.screenshot({path:path.join(process.env.REVIEW_INBOX_QA_DIR,'admin-review-inbox-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});if(process.env.REVIEW_INBOX_QA_DIR)await page.screenshot({path:path.join(process.env.REVIEW_INBOX_QA_DIR,'admin-review-inbox-mobile.png')});
 await page.evaluate(()=>fail=true);await page.getByRole('button',{name:'새로고침',exact:true}).click();await idle();assert.equal(await page.locator('.ri-card').count(),0);assert.match(await page.locator('.ri-status').innerText(),/불러오지 못했어요/);assert.ok((await page.locator('.ri-stats').innerText()).includes('—'),'errors never claim zero pending reviews');
 await page.evaluate(()=>{owner='other';document.querySelector('.ri-heading button').click();});assert.deepEqual(errors,[]);
 console.log('PASS: unified review priorities, private preview gating, inline approval/comment editing, full content, kind filters, responsive layout, failure and account guards.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
