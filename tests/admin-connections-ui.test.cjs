const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const world=read('world.html');
const renderStart=world.indexOf('function y0()');
const render=world.slice(renderStart,world.indexOf('function ',renderStart+10));
const nav=world.slice(world.indexOf('adminAreas='),world.indexOf('function h0('));
const segment=world.slice(world.indexOf('wr='),world.indexOf(',ah=',world.indexOf('wr=')));
const mountStart=world.indexOf('var connectionsController=');
const mount=world.slice(mountStart,world.indexOf('document.addEventListener("DOMContentLoaded",mountConnections',mountStart));
assert.ok(mountStart>0);

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const context=await browser.newContext({viewport:{width:1200,height:900}});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main style="max-width:1100px;margin:20px auto;padding:16px"><div id="admin-root"></div></main>');
    for(const style of [...world.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]) await page.addStyleTag({content:style[1]});
    await page.addStyleTag({content:read('admin/connections.css')});
    await page.evaluate(()=>{
      window.calls=[];window.mode='success';window.adminAllowed=true;window.adminId='fixture-admin';window.unsubscribed=0;
      Date.now=()=>Date.parse('2026-09-29T10:00:00Z');
      window.fetch=async(url,options)=>{
        calls.push({url,credentials:options.credentials,headers:options.headers});
        if(mode==='error')return{ok:false,status:403};
        const result=url.includes('/jobs?')?{jobs:[{name:'backup',status:'completed',conclusion:mode==='skipped'?'skipped':mode==='failed'?'failure':'success',
          completed_at:mode==='old'?'2026-09-27T08:08:33Z':'2026-09-29T08:08:33Z',
          steps:[{name:'Back up, encrypt, upload and verify',conclusion:mode==='stepFailed'?'failure':'success'}]}]}:
          {workflow_runs:[{id:999,event:'push',status:'completed',conclusion:'success'},{id:123,event:'workflow_dispatch',status:'completed'}]};
        return{ok:true,json:async()=>result};
      };
      window.S={auth:{async getUser(){return{data:{user:adminId?{id:adminId}:null}}},
        onAuthStateChange(cb){window.authChanged=cb;return{data:{subscription:{unsubscribe(){unsubscribed++}}}}}},
        from(table){if(table!=='app_admins')throw new Error('Unexpected private data query');return{select(){return this},eq(_,id){if(id!==adminId)throw new Error('Wrong admin');return this},async maybeSingle(){return{data:adminAllowed?{user_id:adminId}:null}}}}};
      window.D={online:true,isAdmin:true,user:{id:adminId}};window.g={tab:'admin'};
      window.U={cleanupMedia(){throw new Error('Read-only inventory triggered media deletion')}};
      window.noteAdminActive=()=>false;window.z=s=>document.querySelector(s);
    });
    await page.addScriptTag({content:read('admin/connections.js')});
    await page.addScriptTag({content:`var ${nav} var ${segment}; ${render} ${mount}
      function showConnections(){L.tab='connections';L.area=adminAreaForTab(L.tab);document.querySelector('#admin-root').innerHTML=y0();mountConnections();}
      showConnections();`});
    await page.getByText('백업 성공 확인',{exact:true}).waitFor();
    assert.ok(await page.locator('.oc-row').count()>=24);
    assert.equal(await page.getByRole('button',{name:'운영 연결',exact:true}).getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.oc-summary').innerText(),'도메인\n가비아\n운영 DB·원본 사진\nSupabase\n외부 백업\n네이버클라우드');
    assert.ok(await page.locator('.oc-critical').count()>8);
    assert.equal(await page.locator('.oc-backup-status a').getAttribute('href'),'https://github.com/ojjuda-note/ojjuda-note.github.io/actions/runs/123','push-only success cannot stand in for a backup');
    assert.equal(await page.evaluate(()=>calls.every(c=>c.credentials==='omit'&&!('Authorization'in c.headers))),true);
    assert.equal(await page.locator('.oc-link').evaluateAll(links=>links.every(a=>a.rel.includes('noopener')&&a.href.startsWith('https://'))),true);
    await page.screenshot({path:'/tmp/ojjuda-connections-desktop.png'});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'page fits phone width');
    assert.equal(await page.locator('.oc-table-wrap').evaluate(el=>el.scrollWidth>el.clientWidth),true);
    await page.locator('.oc-table-wrap').focus();await page.keyboard.press('ArrowRight');
    await page.waitForFunction(()=>document.querySelector('.oc-table-wrap').scrollLeft>0);
    await page.screenshot({path:'/tmp/ojjuda-connections-mobile.png'});
    for(const [mode,label]of [['skipped','확인 필요 · 백업 미완료'],['failed','확인 필요 · 백업 미완료'],['stepFailed','확인 필요 · 백업 미완료'],['old','확인 필요 · 백업 26시간 경과'],['error','현재 결과 조회 불가']]){
      await page.evaluate(value=>{window.mode=value},mode);
      await page.getByRole('button',{name:'백업 실행 결과 새로고침',exact:true}).click();
      await page.getByText(label,{exact:true}).waitFor();
    }
    await page.evaluate(()=>{adminAllowed=false;connectionsController.refresh()});
    await page.getByText('관리자 권한을 확인할 수 없어요. 다시 로그인해 주세요.',{exact:true}).waitFor();
    assert.equal(await page.locator('.oc-table').count(),0);
    await page.evaluate(()=>{adminAllowed=true;mode='success';showConnections()});
    await page.getByText('백업 성공 확인',{exact:true}).waitFor();
    await page.evaluate(()=>{adminId=null;D.isAdmin=false;authChanged('SIGNED_OUT',null)});
    assert.equal(await page.locator('.oc-table').count(),0);
    await page.evaluate(()=>{document.querySelector('#admin-root').innerHTML=y0();mountConnections()});
    await page.getByText('관리자 계정으로 로그인해야 볼 수 있어요.',{exact:true}).waitFor();
    assert.ok(await page.evaluate(()=>unsubscribed)>=2);
    assert.deepEqual(errors,[]);
    console.log('PASS: real admin route/mount, 24-service inventory, auth/logout, no read-only cleanup, backup step/age/failure checks, mobile overflow and keyboard scrolling.');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
