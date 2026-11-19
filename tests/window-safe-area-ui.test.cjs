/* Exercise every popup family with long contents, a system bar, and a shortened viewport. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const insets = css => css.replace(/env\(safe-area-inset-(top|bottom|left|right)(?:,[^)]*)?\)/g,(_,side)=>({top:'24px',bottom:'48px',left:'0px',right:'0px'}[side]));
const long = '<div style="height:700px;flex-shrink:0">긴 내용</div>';
const action = '<button id="audit-action" type="button" style="min-height:44px">확인</button>';
const cases = [
  {name:'아지트 공통 설정',page:'world.html',html:`<div class="modal-bg"><div class="modal">${long}${action}</div></div>`},
  {name:'카드/계정 관리',page:'park/index.html',html:`<div class="dialog-backdrop"><section class="management-dialog"><header class="management-head">카드 관리</header><div class="management-body">${long}</div><footer class="management-footer">${action}</footer></section></div>`},
  {name:'문의·의견 아지트',page:'world.html',support:'world'},
  {name:'문의·의견 공원',page:'park/index.html',support:'note'},
  // Pajang loads these styles after its station styles, through account-support.mjs.
  {name:'문의·의견 파장',page:'features/pajang/station.html',support:'pajang',css:['note/support.css','features/pajang/support.css']},
  {name:'알림',page:'park/index.html',html:`<div class="nn-backdrop"><section class="nn-dialog">${long}${action}</section></div>`},
  {name:'관리자',page:'park/index.html',css:['note/admin.css'],html:`<div class="na-backdrop"><section class="na-panel"><header class="na-head">관리자</header><div class="na-layout">${long}${action}</div></section></div>`},
  {name:'사진 확대',page:'park/index.html',html:'<div class="note-photo-lightbox"><img alt="확대 사진" src="/favicon.svg"><button class="note-photo-lightbox-close" id="audit-action">닫기</button></div>'},
  {name:'오락실 게임 공통',page:'world.html',html:`<div class="gov"><section class="gbox"><div class="ghead">게임</div>${long}${action}</section></div>`},
  // The full-screen game has six grid rows; long board content scrolls inside
  // .bl-can. A direct 700px child creates a row the actual game never renders.
  {name:'당구/포켓볼',page:'world.html',targets:['#audit-game-close','#audit-action'],html:`<div class="gov bl-ov"><section class="gbox bl-box"><div class="ghead"><span class="gt">포켓볼</span><button class="gx" id="audit-game-close">닫기</button></div><div class="bl-hud">나 · 친구</div><div class="bl-play"><div class="bl-can">${long}</div><div class="bl-power">샷 힘</div></div><p class="bl-msg">조준해 주세요</p><div class="bl-aim">조준 기준</div><div class="bl-ctrl">${action}</div></section></div>`},
  {name:'맞고 회원대결 선택/결과',page:'games/matgo-online.html',html:`<div class="dialog"><section>${long}${action}</section></div>`},
  {name:'맞고 PC 선택/결과',page:'games/matgo.html',html:`<div class="modal"><section class="card">${long}${action}</section></div>`},
  {name:'틀린그림찾기 로그인',page:'games/spot-difference/index.html',native:'#auth-dialog',target:'#login-submit'},
  {name:'틀린그림찾기 확대',page:'games/spot-difference/index.html',native:'#zoom-dialog',target:'#close-zoom'},
];

async function settle(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function checkAction(page, target, bounds) {
  const control = page.locator(target);
  await control.evaluate(node => node.scrollIntoView({block:'nearest',inline:'nearest'}));
  await settle(page);
  const rect = await control.boundingBox();
  assert.ok(rect && rect.height > 0 && rect.y >= bounds.top-1 && rect.y+rect.height <= bounds.bottom+1,
    `control ${JSON.stringify(rect)} outside ${JSON.stringify(bounds)}`);
  if(bounds.left!==undefined){
    assert.ok(rect.x>=bounds.left-1&&rect.x+rect.width<=bounds.right+1,
      `control ${target} ${JSON.stringify(rect)} exceeds dialog width ${JSON.stringify(bounds)}`);
    const text=await control.evaluate(node=>{
      const range=document.createRange();range.selectNodeContents(node);return range.getBoundingClientRect().toJSON();
    });
    assert.ok(text.left>=rect.x-1&&text.right<=rect.x+rect.width+1&&text.top>=rect.y-1&&text.bottom<=rect.y+rect.height+1,
      `text in ${target} ${JSON.stringify(text)} overflows its control ${JSON.stringify(rect)}`);
  }
  const hit=await control.evaluate(node => {
    const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return node===hit || node.contains(hit) ? 'ok' : hit?.tagName+'.'+hit?.className;
  });
  assert.equal(hit,'ok', `control ${JSON.stringify(rect)} is covered by ${hit}`);
}
async function installSupport(page,source) {
  await page.addScriptTag({content:read('note/support.js')});
  await page.evaluate(source=>{
    window.auditSupportWithdrawals=0;
    const failure={error:{message:'Layout fixture: keep the form and show its error status'}};
    const client={
      auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      schema:()=>({rpc:async name=>{
        if(name==='get_note_state')return {data:{}};
        if(name==='list_my_inquiries')return {data:[]};
        if(name==='submit_inquiry')return failure;
        throw Error('Unexpected support RPC: '+name);
      }}),
      from:name=>({insert:async()=>{
        if(name!=='feedback')throw Error('Unexpected support table: '+name);
        return failure;
      }})
    };
    OjjudaNoteSupport.install({client,source,getUserId:()=>'11111111-1111-4111-8111-111111111111',
      onWithdrawal:()=>{window.auditSupportWithdrawals++;}});
    if(source==='pajang')document.querySelector('.note-support-layer').classList.add('pajang-support-layer');
    OjjudaNoteSupport.open();
  },source);
  await page.locator('#note-inquiry-body').waitFor();
}
async function supportOrder(page) {
  const geometry=await page.locator('.note-support-layer').evaluate(layer=>{
    const content=layer.querySelector('.note-support-content'),status=layer.querySelector('.management-message');
    // The old flex body shrank while its visible children overflowed into the footer.
    // Measuring just the body's box or the DOM order would miss the reported overlap.
    const children=[...content.querySelectorAll('*')].filter(node=>node.getClientRects().length);
    const contentBottom=Math.max(...children.map(node=>node.getBoundingClientRect().bottom));
    const message=status.getBoundingClientRect(),footer=layer.querySelector('.support-account-footer').getBoundingClientRect();
    return {contentBottom,messageTop:message.top,messageBottom:message.bottom,hasMessage:!!status.textContent,
      footerTop:footer.top};
  });
  assert.ok(geometry.contentBottom<=geometry.footerTop+1,
    `support content overlaps account management: ${JSON.stringify(geometry)}`);
  if(geometry.hasMessage){
    assert.ok(geometry.contentBottom<=geometry.messageTop+1,
      `support content overlaps its status: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.messageBottom<=geometry.footerTop+1,
      `support status overlaps account management: ${JSON.stringify(geometry)}`);
  }
}
async function checkSupport(page,bounds,fontScale) {
  const prefix='.note-support-layer';
  for(const view of ['inquiries','feedback']){
    try{
      // Restore reused controls before each view, so inherited font sizes are not
      // multiplied twice. Enlarge text only; keep the service's actual layout CSS.
      await page.evaluate(()=>{for(const [node,font]of window.auditSupportFonts||[])node.style.fontSize=font;});
      await page.locator(`${prefix} [data-support-view="${view}"]`).click();
      const field=view==='inquiries'?'#note-inquiry-body':'#support-feedback-body';
      await page.locator(field).waitFor();
      if(view==='inquiries')await page.locator(`${prefix} .support-help`).filter({hasText:'보낸 문의가 없어요.'}).waitFor();
      await page.evaluate(scale=>{
        const nodes=[...document.querySelector('.note-support-layer').querySelectorAll('*')];
        const sizes=nodes.map(node=>parseFloat(getComputedStyle(node).fontSize));
        window.auditSupportFonts=nodes.map(node=>[node,node.style.fontSize]);
        if(scale!==1)nodes.forEach((node,index)=>{node.style.fontSize=sizes[index]*scale+'px';});
      },fontScale);
      await settle(page);
      const panel=await page.locator(`${prefix}>.management-dialog`).boundingBox();
      const visible={top:Math.max(bounds.top,panel.y),bottom:Math.min(bounds.bottom,panel.y+panel.height),
        left:panel.x,right:panel.x+panel.width};
      for(const target of ['.management-head button','[data-support-view="feedback"]','[data-support-view="inquiries"]'])
        await checkAction(page,`${prefix} ${target}`,visible);
      await supportOrder(page);
      if(view==='inquiries')await checkAction(page,`${prefix} .note-support-content>div:last-child .support-help`,visible);
      await checkAction(page,`${prefix} .support-form button[type="submit"]`,visible);
      // A failed mock request keeps both the form and a real multi-line status.
      // No service or account mutation leaves this fixture.
      await page.locator(field).fill('작은 화면에서 문의창 배치를 확인합니다.');
      await page.locator(`${prefix} .support-form button[type="submit"]`).click();
      await page.locator(`${prefix} .management-message`).filter({hasText:'보내지 못했어요.'}).waitFor();
      await supportOrder(page);
      await checkAction(page,`${prefix} .support-form button[type="submit"]`,visible);
      await checkAction(page,`${prefix} .management-message`,visible);
      await checkAction(page,`${prefix} [data-support-account-toggle]`,visible);
      assert.equal(await page.locator(`${prefix} [data-support-account]`).evaluate(node=>node.open),false);
      await page.locator(`${prefix} [data-support-account-toggle]`).click();
      await supportOrder(page);
      await checkAction(page,`${prefix} [data-support-withdrawal]`,visible);
      assert.equal(await page.evaluate(()=>auditSupportWithdrawals),0,'revealing account management must not change the account');
    }catch(error){throw Error(`${view}, text ${fontScale}x: ${error.message}`);}
  }
}
(async () => {
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  const failures=[];
  try {
    for (const viewport of [{width:320,height:480},{width:640,height:360}]) {
      const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
      await context.addInitScript(() => {
        const viewport=new EventTarget();window.auditViewport={height:innerHeight,top:0};
        Object.defineProperties(viewport,{height:{get:()=>auditViewport.height},offsetTop:{get:()=>auditViewport.top},scale:{get:()=>1}});
        Object.defineProperty(window,'visualViewport',{value:viewport});
      });
      await context.route('**/*',route=>{
        const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
        const f=path.join(root,u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.abort();
        if(f.endsWith('.html')) {
          const html=fs.readFileSync(f,'utf8').replace(/<script\b([^>]*)>[\s\S]*?<\/script>/gi,(all,attrs)=>/(?:mobile|matgo)-viewport\.js/.test(attrs)?all:'');
          return route.fulfill({contentType:'text/html',body:insets(html)});
        }
        if(f.endsWith('.css'))return route.fulfill({contentType:'text/css',body:insets(read(path.relative(root,f)))});
        return route.fulfill({path:f});
      });
      for(const item of cases.filter(item=>!process.env.WINDOW_AUDIT_FILTER||item.name.includes(process.env.WINDOW_AUDIT_FILTER))){
        const page=await context.newPage();page.setDefaultTimeout(4000);
        let scenario='opening';
        try{
          await page.goto('https://fixture.test/'+item.page);
          await page.evaluate(()=>{document.body.classList.remove('matgo-locked');const editor=document.querySelector('#studio-editor');if(editor)editor.hidden=false;const lock=document.querySelector('#studio-locked');if(lock)lock.hidden=true;});
          // Styles loaded after the common stylesheet must also respect safe bounds.
          for(const file of item.css||[])await page.addStyleTag({content:insets(read(file).replace(/@import\s+url\([^)]*\)\s*;/g,''))});
          await page.addStyleTag({content:':root{--app-safe-top:24px;--app-safe-bottom:48px}html{scroll-behavior:auto}'});
          if(item.support)await installSupport(page,item.support);
          else if(item.html)await page.evaluate(html=>document.body.insertAdjacentHTML('beforeend',html),item.html);
          else await page.locator(item.native).evaluate(dialog=>dialog.showModal());
          for(const short of [false,true]){
            const height=short?260:viewport.height,top=short&&!item.support?20:0;
            scenario=`height ${height}px`;
            // Pajang does not install mobile-viewport.js. Resize the actual viewport
            // for these cases rather than adding a loader absent from production.
            if(item.support)await page.setViewportSize({width:viewport.width,height});
            await page.evaluate(({height,top})=>{Object.assign(auditViewport,{height,top});visualViewport.dispatchEvent(new Event('resize'));},{height,top});
            await settle(page);
            if(item.support)await checkSupport(page,{top:top+24,bottom:top+height-48},short?1.5:1);
            else for(const target of item.targets||[item.target||'#audit-action'])await checkAction(page,target,{top:top+24,bottom:top+height-48});
          }
          console.log('PASS',viewport.width,item.name);
        }catch(error){
          failures.push(`${viewport.width} ${item.name} ${scenario}: ${error.message}`);
          if(item.support){
            const dir=path.join(__dirname,'artifacts/pajang-discovery/support-layout');fs.mkdirSync(dir,{recursive:true});
            await page.screenshot({path:path.join(dir,`${item.support}-${viewport.width}.png`)}).catch(()=>{});
          }
        }
        await page.close();
      }
      if(!process.env.WINDOW_AUDIT_FILTER)for(const file of ['guide.html','privacy.html','terms.html','delete-account.html','park/glasses.html','admin/index.html']){
        const documentPage=await context.newPage();documentPage.setDefaultTimeout(4000);
        try{
          await documentPage.goto('https://fixture.test/'+file);
          await documentPage.evaluate(()=>{
            if(document.querySelector('#auth-required'))document.querySelector('#auth-required').hidden=false;
            const links=[...document.querySelectorAll('a,button')].filter(node=>node.getClientRects().length && !node.closest('.to-top,.skip,.skip-link'));
            links.at(-1).id='audit-document-end';scrollTo(0,document.body.scrollHeight);
          });
          await checkAction(documentPage,'#audit-document-end',{top:0,bottom:viewport.height-48});
          if(await documentPage.locator('.to-top').count())await checkAction(documentPage,'.to-top',{top:24,bottom:viewport.height-48});
          console.log('PASS',viewport.width,file);
        }catch(error){failures.push(`${viewport.width} ${file}: ${error.message}`);}
        await documentPage.close();
      }
      await context.close();
    }
  }finally{await browser.close();}
  if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
  else console.log('PASS: all popup families remain reachable above system bars and keyboards');
})().catch(error=>{console.error(error);process.exitCode=1;});
