const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname,'..'), read = file => fs.readFileSync(path.join(root,file),'utf8');
(async()=>{
 const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  const page = await browser.newPage({viewport:{width:1280,height:850}}), errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>route.abort());
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main style="max-width:960px;padding:14px;margin:auto"><div id="host"></div></main>');
  for(const style of [...read('world.html').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]) await page.addStyleTag({content:style[1]});
  await page.addStyleTag({content:read('admin/activity.css')});
  await page.evaluate(()=>{
   window.owner='fixture-admin';window.current=true;window.calls=[];window.mode='normal';window.pending=[];window.unsubscribed=0;
   window.client={auth:{onAuthStateChange(fn){window.authChanged=fn;return{data:{subscription:{unsubscribe(){unsubscribed++}}}}}},rpc:async(name,params)=>{
    if(name!=='admin_activity_list')throw new Error('Unexpected write');calls.push(params);
    if(mode==='slow')return new Promise(resolve=>pending.push(resolve));
    if(mode==='error')return{error:{code:'503'}};
    if(mode==='denied')return{error:{code:'42501'}};
    const total=params.p_action?2:65, count=Math.max(0,Math.min(params.p_limit,total-params.p_offset));
    return{data:{total_count:total,actions:[{action:'coins',count:2},{action:'custom_action',count:63}],items:Array.from({length:count},(_,i)=>({id:String(total-params.p_offset-i),source:params.p_source,action:params.p_action||'coins',created_at:'2026-10-04T08:00:00Z',admin_id:'fixture-admin',admin_nick:'<img src=x onerror=alert(1)>',target_nick:'대상 회원',reason:'운영 사유 '.repeat(20),detail:{delta:10},target:'긴-자료번호-'.repeat(15)}))}};
   }};
  });
  await page.addScriptTag({content:read('admin/activity.js')});
  await page.evaluate(()=>{window.mount=()=>window.controller=OjjudaAdminActivity.mount({container:document.getElementById('host'),client,getAdminId:()=>owner,isCurrent:()=>current});mount()});
  await page.getByText('총 65건 · 1 / 3페이지 · 최근 작업부터 표시',{exact:true}).waitFor();
  assert.equal(await page.locator('.aa-card').count(),30); assert.equal(await page.locator('.aa-card img').count(),0,'log text cannot inject HTML');
  await page.getByRole('button',{name:'다음',exact:true}).click(); await page.getByText('총 65건 · 2 / 3페이지 · 최근 작업부터 표시',{exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>calls.at(-1))).p_offset,30);
  await page.getByLabel('작업 분류').selectOption('coins');await page.getByText('총 2건 · 1 / 1페이지 · 최근 작업부터 표시',{exact:true}).waitFor();
  assert.equal((await page.evaluate(()=>calls.at(-1))).p_offset,0);assert.equal(await page.getByRole('button',{name:'다음',exact:true}).isDisabled(),true);
  await page.getByLabel('기록 공간').selectOption('park');await page.getByText('총 65건 · 1 / 3페이지 · 최근 작업부터 표시',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>calls.at(-1)),{p_source:'park',p_action:null,p_limit:30,p_offset:0});
  await page.getByRole('button',{name:'다음',exact:true}).click();await page.getByText('총 65건 · 2 / 3페이지 · 최근 작업부터 표시',{exact:true}).waitFor();
  await page.evaluate(()=>{const state=controller.getState();controller.destroy();controller=OjjudaAdminActivity.mount({container:document.getElementById('host'),client,getAdminId:()=>owner,isCurrent:()=>current,initialSource:'world',initialState:state})});
  await page.getByText('총 65건 · 2 / 3페이지 · 최근 작업부터 표시',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('기록 공간').inputValue(),'park','redraw restores the selected source and page');
  await page.evaluate(()=>{controller.destroy();controller=OjjudaAdminActivity.mount({container:document.getElementById('host'),client,getAdminId:()=>owner,isCurrent:()=>current,initialSource:'note-actions'})});
  await page.getByText('총 65건 · 1 / 3페이지 · 최근 작업부터 표시',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('기록 공간').inputValue(),'park','legacy note action links enter Park history');
  await page.locator('.aa-detail summary').first().click();
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:850});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${width}: no horizontal overflow`);
   if(process.env.ACTIVITY_QA_DIR)await page.screenshot({path:path.join(process.env.ACTIVITY_QA_DIR,`activity-${width}.png`)});
  }
  await page.evaluate(()=>{mode='slow'});await page.getByLabel('기록 공간').selectOption('world');await page.getByLabel('기록 공간').selectOption('park');
  await page.evaluate(()=>{pending[1]({data:{items:[{id:'new',action:'restore',admin_nick:'최신 결과'}],total_count:1,actions:[]}})});
  await page.getByText('처리자: 최신 결과',{exact:true}).waitFor();
  await page.evaluate(()=>{pending[0]({data:{items:[{id:'old',action:'hide',admin_nick:'오래된 결과'}],total_count:1,actions:[]}})});
  assert.equal(await page.getByText('처리자: 오래된 결과',{exact:true}).count(),0,'a stale response cannot overwrite a changed source');
  await page.evaluate(()=>{mode='error';controller.refresh()});await page.getByText('작업 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',{exact:true}).waitFor();
  assert.equal(await page.locator('.aa-card').count(),0);await page.evaluate(()=>mode='normal');await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();await page.locator('.aa-card').first().waitFor();
  await page.evaluate(()=>{mode='denied';controller.refresh()});await page.getByText('관리자 권한을 확인할 수 없어요. 다시 로그인해 주세요.',{exact:true}).waitFor();
  await page.evaluate(()=>{mode='slow';controller.refresh();owner=null;authChanged('SIGNED_OUT',null)});
  await page.getByText('관리자 계정으로 다시 열어 주세요.',{exact:true}).waitFor();
  await page.evaluate(()=>pending.at(-1)({data:{items:[{id:'secret',admin_nick:'로그아웃 뒤 결과'}],total_count:1,actions:[]}}));
  assert.equal(await page.locator('.aa-card').count(),0);
  await page.evaluate(()=>{controller.destroy();document.getElementById('host').textContent='다른 화면';authChanged('SIGNED_OUT',null)});
  assert.equal(await page.locator('#host').textContent(),'다른 화면');assert.equal(await page.evaluate(()=>unsubscribed),3);
  assert.deepEqual(errors,[]);console.log('PASS: read-only history filters/pages, escaped logs, 320/390/1280 layouts, retries, denied access, stale results, logout and unmount protection');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
