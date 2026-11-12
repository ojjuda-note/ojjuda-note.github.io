const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),{chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : '/usr/bin/chromium'),headless:true,args:['--no-sandbox']});
 try {
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const pages={ive:{},bts:{}}, managers={}, errors=[], uploads=[];
 let account='admin';
 page.on('pageerror',err=>errors.push(err.message));
 await page.exposeFunction('api',async ({table,select,eq,rpc,args,upload})=>{
   if(upload){uploads.push(upload);return {data:{path:upload}};}
   if(rpc==='is_admin') return {data:account==='admin'};
   if(rpc==='can_edit_fanpage') return {data:account==='admin'||managers[args.p_artist]===account};
   if(rpc==='admin_list_member_accounts') return {data:{items:[{id:'member',nickname:'편집자'}]}};
   if(rpc==='create_fanpage'){pages[args.p_artist]={identity:{name:args.p_name,korean:args.p_name,category:args.p_category}};managers[args.p_artist]=args.p_manager;return {data:null};}
   if(rpc==='assign_fanpage_manager'){managers[args.p_artist]=args.p_manager;return {data:null};}
   if(rpc==='save_fanpage_section'){assert.deepEqual(args.p_expected,pages[args.p_artist][args.p_section]??null);pages[args.p_artist][args.p_section]=args.p_value;return {data:null};}
   if(table==='fanpage_pages') return eq?{data:{sections:pages[eq]}}:{data:Object.entries(pages).map(([artist_id,s])=>({artist_id,identity:s.identity??null}))};
   if(table==='fanpage_managers') return {data:managers[eq]?{member_id:managers[eq],profiles:{nickname:'편집자'}}:null};
   throw Error(rpc || table);
 });
 await page.exposeFunction('who',()=>account);
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!=='https://fan.test') return route.abort();
   if(u.pathname.endsWith('/vendor/supabase.js')) return route.fulfill({contentType:'application/javascript',body:`window.supabase={createClient:()=>({
    auth:{onAuthStateChange:f=>{who().then(id=>f('INITIAL_SESSION',id?{user:{id}}:null))}},
    rpc:(rpc,args)=>api({rpc,args}),
    storage:{from:()=>({upload:(upload)=>api({upload}),getPublicUrl:path=>({data:{publicUrl:'https://media.test/'+path}})})},
    from(table){const q={table};const b={select(s){q.select=s;return b},eq(k,v){q.eq=v;return b},order(){return b},range(){return b},abortSignal(){return api(q)},maybeSingle(){return api(q)},single(){return b}};return b}
   })}`});
   const f=path.join(__dirname,'..',decodeURIComponent(u.pathname));if(!fs.existsSync(f) || !fs.statSync(f).isFile()) return route.abort();
   return route.fulfill({path:f,contentType:({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[path.extname(f)]});
 });
 const root='https://fan.test/features/fanpages/',btn=t=>page.getByRole('button',{name:t,exact:true}), label=t=>page.getByLabel(t,{exact:true});
 await page.goto(root+'index.html');await btn('아이돌 추가').click();
 await label('아이돌 이름').fill('새 팀 <테스트>');await label('페이지 주소 이름 (선택)').fill('qa-artist');
 await label('회원 검색').fill('편집자');await btn('회원 찾기').click();await label('검색 결과').selectOption('member');
 await btn('팬페이지 만들기').click();await page.waitForURL('**/artist.html?group=qa-artist');
 await page.waitForSelector('#profile');assert.equal(await page.locator('h1').innerText(),'새 팀 <테스트>');
 for(const id of ['photos','videos','music','schedule','news','goods']) assert.equal(await page.locator('#'+id).count(),1);
 assert.equal(await page.locator('h1').locator('*').count(),0);
 account='member';await page.reload();
 await btn('팬페이지 관리').click();
 assert.equal(await page.getByText('담당자 지정',{exact:true}).count(),0);
 await label('편집할 항목').selectOption('photos');await btn('사진 항목 추가').click();
 await label('사진 제목').fill('담당 사진');await label('사진 업로드').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('fixture')});
 await btn('변경 사항 저장').click();await page.waitForSelector('[data-photo-index="0"]');assert.ok(uploads[0].startsWith('qa-artist/'));assert.equal(pages['qa-artist'].photos[0].label,'담당 사진');
 await btn('팬페이지 관리').click();await label('편집할 항목').selectOption('videos');await btn('영상 항목 추가').click();await label('제목').fill('테스트 영상');await label('영상 파일 업로드').setInputFiles({name:'movie.mp4',mimeType:'video/mp4',buffer:Buffer.from('fixture')});await btn('변경 사항 저장').click();
 await page.locator('[data-video-index="0"]').click();assert.match(await page.locator('#video-viewer video').getAttribute('src'),/qa-artist\/.+\.mp4/);await btn('영상 닫기').click();
 await page.goto(root+'artist.html?group=ive');await page.waitForSelector('#profile');assert.equal(await btn('팬페이지 관리').isVisible(),false);
 account='admin';await page.reload();await btn('팬페이지 관리').click();await page.locator('summary').filter({hasText:'담당자 지정'}).click();await label('회원 검색').fill('편집자');await btn('회원 찾기').click();await label('검색 결과').selectOption('member');await btn('담당자 지정').click();await page.getByText('담당자를 지정했어요.').waitFor();
 account='member';await page.reload();await btn('팬페이지 관리').click();await label('편집할 항목').selectOption('music');await page.locator('.fan-admin form details summary').first().click();const first=label('제목').first();assert.ok(await first.inputValue());await first.fill('새 음반 제목');await btn('변경 사항 저장').click();await page.getByRole('link',{name:/새 음반 제목/}).first().waitFor();
 account=null;await page.goto(root+'index.html');await label('아이돌 검색').fill('새 팀');await page.getByRole('link',{name:'새 팀 <테스트> 팬페이지 열기'}).waitFor();assert.equal(await btn('아이돌 추가').isVisible(),false);
 assert.deepEqual(errors,[]);console.log('PASS: create, assign, standard mobile template, directory search, restricted management, existing album edit, photo/video uploads and playback.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
