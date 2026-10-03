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
  {name:'월드 공통 설정/기록/사진첩',page:'world.html',html:`<div class="modal-bg"><div class="modal">${long}${action}</div></div>`},
  {name:'카드/계정 관리',page:'note/index.html',html:`<div class="dialog-backdrop"><section class="management-dialog"><header class="management-head">카드 관리</header><div class="management-body">${long}</div><footer class="management-footer">${action}</footer></section></div>`},
  {name:'도움말/문의/신고',page:'note/index.html',html:`<div class="dialog-backdrop note-support-layer"><section class="management-dialog"><header class="management-head">도움말</header><div class="management-body">${long}${action}</div></section></div>`},
  {name:'알림',page:'note/index.html',html:`<div class="nn-backdrop"><section class="nn-dialog">${long}${action}</section></div>`},
  {name:'관리자',page:'note/index.html',css:['note/admin.css'],html:`<div class="na-backdrop"><section class="na-panel"><header class="na-head">관리자</header><div class="na-layout">${long}${action}</div></section></div>`},
  {name:'월드 사진 선택',page:'note/index.html',html:`<div class="world-picker"><section class="world-picker-panel"><header class="world-picker-head">사진 선택${action}</header><div class="world-picker-grid">${long}</div></section></div>`},
  {name:'사진 확대',page:'note/index.html',html:'<div class="note-photo-lightbox"><img alt="확대 사진" src="/favicon.svg"><button class="note-photo-lightbox-close" id="audit-action">닫기</button></div>'},
  {name:'오락실 게임 공통',page:'world.html',html:`<div class="gov"><section class="gbox"><div class="ghead">게임</div>${long}${action}</section></div>`},
  {name:'당구/포켓볼',page:'world.html',html:`<div class="gov bl-ov"><section class="gbox bl-box"><div class="ghead">포켓볼</div>${long}${action}</section></div>`},
  {name:'맞고 회원대결 선택/결과',page:'games/matgo-online.html',html:`<div class="dialog"><section>${long}${action}</section></div>`},
  {name:'맞고 PC 선택/결과',page:'games/matgo.html',html:`<div class="modal"><section class="card">${long}${action}</section></div>`},
  {name:'틀린그림찾기 로그인',page:'games/spot-difference/index.html',native:'#auth-dialog',target:'#login-submit'},
  {name:'틀린그림찾기 확대',page:'games/spot-difference/index.html',native:'#zoom-dialog',target:'#close-zoom'},
  {name:'가구 제작 방향 선택',page:'house-test/anchor-editor/index.html',native:'#batch-dialog',target:'#batch-apply'}
];

async function settle(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function checkAction(page, target, bounds) {
  const control = page.locator(target);
  await control.evaluate(node => node.scrollIntoView({block:'nearest',inline:'nearest'}));
  await settle(page);
  const rect = await control.boundingBox();
  assert.ok(rect && rect.height > 0 && rect.y >= bounds.top-1 && rect.y+rect.height <= bounds.bottom+1,
    `control ${JSON.stringify(rect)} outside ${JSON.stringify(bounds)}`);
  const hit=await control.evaluate(node => {
    const r=node.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
    return node===hit || node.contains(hit) ? 'ok' : hit?.tagName+'.'+hit?.className;
  });
  assert.equal(hit,'ok', `control ${JSON.stringify(rect)} is covered by ${hit}`);
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
        try{
          await page.goto('https://fixture.test/'+item.page);
          await page.evaluate(()=>{document.body.classList.remove('matgo-locked');const editor=document.querySelector('#studio-editor');if(editor)editor.hidden=false;const lock=document.querySelector('#studio-locked');if(lock)lock.hidden=true;});
          // Styles loaded after the common stylesheet must also respect safe bounds.
          for(const file of item.css||[])await page.addStyleTag({content:insets(read(file).replace(/@import\s+url\([^)]*\)\s*;/g,''))});
          await page.addStyleTag({content:':root{--app-safe-top:24px;--app-safe-bottom:48px}html{scroll-behavior:auto}'});
          if(item.html)await page.evaluate(html=>document.body.insertAdjacentHTML('beforeend',html),item.html);
          else await page.locator(item.native).evaluate(dialog=>dialog.showModal());
          for(const short of [false,true]){
            const height=short?260:viewport.height,top=short?20:0;
            await page.evaluate(({height,top})=>{Object.assign(auditViewport,{height,top});visualViewport.dispatchEvent(new Event('resize'));},{height,top});
            await settle(page);
            await checkAction(page,item.target||'#audit-action',{top:top+24,bottom:top+height-48});
          }
          console.log('PASS',viewport.width,item.name);
        }catch(error){failures.push(`${viewport.width} ${item.name}: ${error.message}`);}
        await page.close();
      }
      // Exercise the actual photo-source placement function near the system bar and keyboard.
      const page=await context.newPage();page.setDefaultTimeout(4000);
      try{
        await page.goto('https://fixture.test/note/index.html');
        await page.addStyleTag({content:':root{--app-safe-top:24px;--app-safe-bottom:48px}'});
        const source=read('note/preview.js');
        const a=source.indexOf('function openPhotoSourceMenu('),b=source.indexOf('function closePhotoLightbox()',a);
        await page.addScriptTag({content:`let sourceMenu=null,sourceMenuCleanup=null;function node(tag,cls='',text=''){const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;}function closePhotoSourceMenu(){sourceMenuCleanup?.();sourceMenu?.remove();sourceMenu=null;} ${source.slice(a,b)}`});
        for(const short of [false,true]){
          const height=short?260:viewport.height,top=short?20:0;
          await page.evaluate(({height,top})=>{
            Object.assign(auditViewport,{height,top});visualViewport.dispatchEvent(new Event('resize'));
            document.querySelector('#source-anchor')?.remove();const anchor=document.createElement('button');anchor.id='source-anchor';anchor.textContent='사진';anchor.style.cssText=`position:fixed;top:${top+height-170}px;left:10px;height:32px`;document.body.append(anchor);openPhotoSourceMenu('card',anchor);
          },{height,top});
          await settle(page);
          await page.locator('.photo-source-menu button').last().evaluate(node=>node.id='audit-action');
          await checkAction(page,'#audit-action',{top:top+24,bottom:top+height-48});
          await page.evaluate(()=>closePhotoSourceMenu());
        }
        console.log('PASS',viewport.width,'사진 출처 선택');
      }catch(error){failures.push(`${viewport.width} 사진 출처 선택: ${error.message}`);}
      if(!process.env.WINDOW_AUDIT_FILTER)for(const file of ['guide.html','privacy.html','terms.html','delete-account.html','note/glasses.html','admin/index.html']){
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
