const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {createQuestionFixture}=require('./fixtures/admin-pajang-question-suggestions.cjs');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const origin='https://fixture.test',proof=path.join(__dirname,'artifacts/admin-pajang/questions');
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
  .replace('import { screw3d as screwGame } from "./games/screw/screw3d.js";','const screwGame={};');
world=world.replace('</head>','<link rel="stylesheet" href="/note/operations.css"></head>');
world=world.replace('<script type="module">',`<script>${['admin/service-scope.js','admin/navigation.js','app/world/world-navigation.js','note/operations.js'].map(read).join('\n')}
window.createQuestionFixture=${createQuestionFixture.toString()};</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0,'replace only live boot, retaining actual World navigation and module mounting');

function fixtureBoot() {
  const fixture=window.questionFixture=window.createQuestionFixture();
  S=fixture.client;
  window.OjjudaAdminPajang={mount({container}) {
    const message=document.createElement('p');message.dataset.questionFixtureHome='';message.textContent='합성 파장 답변 관리';
    container.replaceChildren(message);return {canLeave:()=>true,hasDraft:()=>false,destroy(){}};
  }};
  U.overview=async()=>({users:1,reports_open:0,feedback_open:0,errors_24h:0});
  U.logList=async()=>[];
  window.worldQuestionTest={
    state:()=>({service:worldAdminService,area:L.area,tab:L.tab}),canLeave:()=>adminCanLeave(),
    open:(tab,service)=>openWorldAdmin(tab,service)
  };
  gm(()=>{g.tab='friends';H();});H();
  D.online=true;D.user={id:fixture.owner};D.isAdmin=true;
  restoreWorldAdminView(new URL(location.href).searchParams.get('admin'));H();
}
world=world.slice(0,boot)+`(${fixtureBoot.toString()})();\n`+world.slice(world.indexOf('</script>',boot));

(async()=>{
  fs.mkdirSync(proof,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,
    args:['--no-sandbox','--disable-dev-shm-usage']});
  let page;
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR'});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
      if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:world});
      const file=path.join(root,url.pathname);
      return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
    });
    page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const view=page.locator('[data-pajang-question-suggestions]');
    const menu=tab=>page.locator('.adm-menu-group .adm-menu-link[data-v="'+tab+'"]');
    const ready=async count=>{
      await page.waitForFunction(count=>document.querySelectorAll('[data-question-suggestion-id]').length===count
        &&document.querySelector('[data-pajang-question-suggestions] .ops-message')?.textContent==='',count);
    };
    for(const width of [320,390,1280]) {
      await page.setViewportSize({width,height:844});
      await page.goto(origin+'/world.html?admin=pajang-answers&from=pajang');
      await page.locator('[data-question-fixture-home]').waitFor();
      assert.equal(await menu('pajang-questions').count(),1,'the real Pajang content menu exposes question suggestions');
      await menu('pajang-questions').click();await ready(30);
      assert.deepEqual(await page.evaluate(()=>worldQuestionTest.state()),{service:'pajang',area:'content',tab:'pajang-questions'});
      assert.equal(await view.locator('h3').textContent(),'파장 질문 제안');
      assert.equal(await view.getByRole('button',{name:'전체',exact:true}).getAttribute('aria-pressed'),'true');
      assert.deepEqual(await page.evaluate(()=>questionFixture.calls[0]),
        {schema:'ojjuda_note',name:'admin_pajang_question_suggestions',args:{p_status:'all',p_limit:30,p_offset:0}});
      const first=view.locator('[data-question-suggestion-id]').first();
      assert.equal(await first.locator('[data-question-body]').textContent(),
        await page.evaluate(()=>questionFixture.items[0].body.slice('[파장 · 오늘의 질문 제안]\n'.length)));
      assert.equal(await first.locator('.ops-meta strong').textContent(),'질문제안회원 1');
      assert.equal(await first.locator('time').getAttribute('datetime'),'2026-11-19T04:00:00.000Z');
      assert.equal(await view.locator('textarea,form,[contenteditable="true"]').count(),0);
      await first.scrollIntoViewIfNeeded();
      const fits=await first.evaluate(node=>({
        page:document.documentElement.scrollWidth<=innerWidth+1,
        body:node.querySelector('[data-question-body]').scrollWidth<=node.querySelector('[data-question-body]').clientWidth+1
      }));
      assert.equal(fits.page,true,width+'px question list stays within the viewport');
      assert.equal(fits.body,true,width+'px long questions wrap without clipping');
      await page.screenshot({path:path.join(proof,'question-list-'+width+'.png'),animations:'disabled'});

      if(width===390) {
        await view.getByRole('button',{name:'다음',exact:true}).click();await ready(1);
        assert.deepEqual(await page.evaluate(()=>questionFixture.calls.at(-1).args),{p_status:'all',p_limit:30,p_offset:30});
        await view.getByRole('button',{name:'답변 완료',exact:true}).click();await ready(15);
        assert.deepEqual(await page.evaluate(()=>questionFixture.calls.at(-1).args),{p_status:'resolved',p_limit:30,p_offset:0});
        await page.evaluate(()=>{questionFixture.fail=true;});
        await view.getByRole('button',{name:'새로고침',exact:true}).click();
        await view.getByText('질문 제안 목록을 불러오지 못했어요. 권한이나 연결 상태를 확인하고 다시 시도해 주세요.',{exact:true}).waitFor();
        assert.equal(await view.locator('[data-question-suggestion-id]').count(),0);
        await page.evaluate(()=>{questionFixture.fail=false;});
        await view.getByRole('button',{name:'다시 시도',exact:true}).click();await ready(15);
        await page.evaluate(()=>{questionFixture.items=[];});
        await view.getByRole('button',{name:'전체',exact:true}).click();
        await view.getByText('접수된 질문 제안이 없어요.',{exact:true}).waitFor();
        assert.equal(await view.getByRole('button',{name:'다음',exact:true}).count(),0);
      }
    }

    await page.evaluate(()=>{questionFixture.hold=true;});
    await view.getByRole('button',{name:'새로고침',exact:true}).click();
    await page.waitForFunction(()=>typeof questionFixture.release==='function');
    assert.equal(await page.evaluate(()=>worldQuestionTest.canLeave()),true,'a read-only pending request does not trap navigation');
    await menu('pajang-answers').click();await page.locator('[data-question-fixture-home]').waitFor();
    await page.evaluate(()=>questionFixture.release());
    await page.evaluate(()=>new Promise(requestAnimationFrame));
    assert.equal(await view.count(),0,'a late response cannot overwrite the newly selected administrator page');
    assert.equal((await page.evaluate(()=>worldQuestionTest.state())).tab,'pajang-answers');

    await page.goto(origin+'/world.html?admin=pajang-questions&from=pajang');await ready(30);
    assert.equal((await page.evaluate(()=>worldQuestionTest.state())).tab,'pajang-questions','a direct link mounts the same actual operations renderer');
    await page.goto(origin+'/world.html?admin=pajang-questions&from=agit');
    await page.locator('.adm-shell[data-admin-service="agit"]').waitFor();
    assert.equal(await menu('pajang-questions').count(),0,'another service cannot expose the dedicated Pajang menu');
    assert.equal(await page.evaluate(()=>questionFixture.calls.length),0,'a foreign service link never requests Pajang submissions');
    assert.deepEqual(errors,[],'actual World and operations modules have no browser runtime errors');
    console.log('PASS: Pajang question menu and direct entry, all-status default, author/date/question display, server pages/filters, empty/error/retry, read-only route exit and 320/390/1280px layouts. Synthetic data only.');
  } catch(error) {
    if(page&&!page.isClosed())await page.screenshot({path:path.join(proof,'failure.png'),fullPage:true}).catch(()=>{});
    throw error;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
