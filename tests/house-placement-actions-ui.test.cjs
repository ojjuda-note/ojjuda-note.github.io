// Production house iframe with isolated fixture storage and real camera gestures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),workspace=path.dirname(root);
const output=path.resolve(process.env.QA_OUTPUT_DIR||path.join(workspace,'house-opening-proof/placement-actions'));
const font=process.env.SOFA_PROOF_FONT||path.join(workspace,'carpet-studio/NotoSansCJKkr-Regular.otf');
const owner='local-placement-actions-review',key='ojjuda-house-playtest-v1:'+owner,id='side-table';
const fixture='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><button id="open">우리집 열기</button><script type="module">import{openHouseTest}from"/house-test/host.js";document.querySelector("#open").onclick=()=>openHouseTest({owner:"'+owner+'",authorized:()=>true});</script></html>';
const baseline={version:12,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:null,furniture:{[id]:{direction:'center',x:3,y:3}}}],diary:'카메라 이동은 저장한 배치를 바꾸지 않아요.'};
(async()=>{
 fs.mkdirSync(output,{recursive:true});const report={checks:[],quadrants:[],errors:[],screenshots:[]};
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 let page,frame;
 try{
  const context=await browser.newContext({viewport:{width:1100,height:960},deviceScaleFactor:2,hasTouch:true});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.origin!=='https://fixture.test')return route.abort();
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});
   if(u.pathname==='/proof-font.otf'&&fs.existsSync(font))return route.fulfill({path:font,contentType:'font/otf'});
   if(u.pathname==='/favicon.ico')return route.fulfill({status:204});
   const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  if(fs.existsSync(font))await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='@font-face{font-family:PlacementProof;src:url(/proof-font.otf)}body,button,input,output{font-family:PlacementProof,sans-serif!important}';document.head.append(style);},{once:true}));
  page=await context.newPage();page.on('pageerror',error=>report.errors.push(error.message));await page.goto('https://fixture.test/fixture');
  await page.evaluate(({key,baseline})=>localStorage.setItem(key,JSON.stringify(baseline)),{key,baseline});
  await page.locator('#open').click();frame=page.frameLocator('iframe[title="우리집"]');
  const item=frame.locator('[data-room="0:0"] [data-furniture="'+id+'"]'),actions=frame.locator('#placement-actions'),viewport=frame.locator('#viewport');
  const ready=async()=>{await item.locator('canvas').waitFor();await frame.locator('body').evaluate(async()=>{await document.fonts.ready;await new Promise(resolve=>{const check=()=>[...document.querySelectorAll('.furniture')].some(n=>n.dataset.renderState==='loading')?requestAnimationFrame(check):resolve();check();});});assert.equal(await frame.locator('.furniture[data-render-state="error"]').count(),0);};
  const stored=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const edit=async()=>{await frame.getByRole('button',{name:'협탁 배치',exact:true}).click();await ready();await actions.waitFor({state:'visible'});};
  const measure=()=>viewport.evaluate((v,id)=>{
   const rect=node=>{const b=node.getBoundingClientRect();return {x:b.left,y:b.top,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
   const a=document.querySelector('#placement-actions'),n=document.querySelector('[data-room="0:0"] [data-furniture="'+id+'"]');
   return {view:rect(v),item:rect(n),group:rect(a),buttons:[...a.querySelectorAll('button')].filter(b=>!b.hidden).map(rect),quadrant:a.dataset.quadrant,placement:a.dataset.placement,parent:a.parentElement.id,transform:document.querySelector('#world').style.transform};
  },id);
  const check=async expected=>{
   // ResizeObserver and font layout may finish one frame after a camera update.
   await viewport.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const m=await measure(),{view:v,item:n,group:g}=m,left=n.x+n.width/2<v.x+v.width/2,top=n.y+n.height/2<v.y+v.height/2;
   const quadrant=(top?'top':'bottom')+'-'+(left?'left':'right'),placement=(top?'below':'above')+'-'+(left?'right':'left');
   if(expected)assert.equal(quadrant,expected,'real selected item reaches the requested viewport quadrant');
   assert.equal(m.quadrant,quadrant);assert.equal(m.placement,placement);assert.equal(m.parent,'viewport','actions stay outside the scaled world');
   const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
   const expectedX=clamp(left?n.right-v.x+8:n.x-v.x-g.width-8,8,v.width-g.width-8),expectedY=clamp(top?n.bottom-v.y+8:n.y-v.y-g.height-8,8,v.height-g.height-8);
   assert(Math.abs(g.x-v.x-expectedX)<2,'horizontal diagonal placement follows the item');assert(Math.abs(g.y-v.y-expectedY)<2,'vertical diagonal placement follows the item');
   assert(g.x>=v.x+7&&g.right<=v.right-7&&g.y>=v.y+7&&g.bottom<=v.bottom-7,'both actions remain inside the viewport');
   assert.equal(m.buttons.length,2);for(const b of m.buttons)assert(b.width>=44&&b.height>=44,'touch target is at least 44px');
   assert.deepEqual(await stored(),baseline,'camera and action positioning never write furniture changes');return m;
  };
  const capture=async name=>{const file=name+'.png';await viewport.screenshot({path:path.join(output,file)});report.screenshots.push(file);};
  const panTo=async(left,top)=>{
   for(let attempt=0;attempt<5;attempt++){
    const m=await measure(),dx=m.view.x+m.view.width*(left ? .3 : .7)-m.item.x-m.item.width/2,dy=m.view.y+m.view.height*(top ? .3 : .7)-m.item.y-m.item.height/2;
    if(Math.abs(dx)<3&&Math.abs(dy)<3)return;
    const start=await viewport.evaluate((v,{dx,dy})=>{const b=v.getBoundingClientRect(),xs=dx>0?[.15,.25,.4]:[.85,.75,.6],ys=dy>0?[.15,.25,.4]:[.85,.75,.6];for(const x of xs)for(const y of ys){const px=b.left+b.width*x,py=b.top+b.height*y,node=document.elementFromPoint(px,py);if(node&&v.contains(node)&&!node.closest('button,select'))return {x:px-b.left,y:py-b.top};}return null;},{dx,dy});
    assert(start,'a real unoccupied viewport point is available for panning');const box=await viewport.boundingBox();
    await page.mouse.move(box.x+start.x,box.y+start.y);await page.mouse.down();await page.mouse.move(box.x+start.x+dx,box.y+start.y+dy,{steps:12});await page.mouse.up();
   }
  };
  await ready();await edit();assert.equal(await frame.locator('#panel #placement-done').count(),0);assert.equal(await frame.locator('#panel #placement-recall').count(),0);await frame.locator('#panel').getByRole('button',{name:'취소',exact:true}).waitFor();
  assert.equal(await frame.locator('#placement-done').innerText(),'설치');assert.equal(await frame.locator('#placement-recall').innerText(),'회수');
  const beforeZoom=await measure();for(let i=0;i<3;i++)await frame.locator('#zoom-in').click();const afterZoom=await check();assert.notEqual(afterZoom.transform,beforeZoom.transform);assert(Math.abs(afterZoom.group.width-beforeZoom.group.width)<1&&Math.abs(afterZoom.group.height-beforeZoom.group.height)<1,'camera zoom does not scale touch controls');
  for(const [quadrant,left,top]of [['bottom-left',true,false],['top-left',true,true],['top-right',false,true],['bottom-right',false,false]]){await panTo(left,top);const m=await check(quadrant);report.quadrants.push(m);await capture(quadrant);}
  report.checks.push('Real pointer panning reaches all four quadrants; both 44px actions follow the opposite diagonal, stay inside the viewport and retain their size through zoom');
  await page.setViewportSize({width:375,height:812});await check();await capture('mobile-resize');assert.equal(await frame.locator('body').evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await frame.locator('#panel').getByRole('button',{name:'취소',exact:true}).click();await actions.waitFor({state:'hidden'});assert.deepEqual(await stored(),baseline);
  report.checks.push('Resizing to 375px recomputes the action positions; panel Cancel leaves the saved placement unchanged');
  await edit();await frame.locator('#bookshelf-gap').evaluate(n=>{n.value='3.5';n.dispatchEvent(new Event('input',{bubbles:true}));});await ready();assert.deepEqual(await stored(),baseline);assert.equal(await frame.locator('#placement-done').isEnabled(),true);await frame.locator('#placement-done').click();await actions.waitFor({state:'hidden'});
  const installed=structuredClone(baseline);installed.rooms[0].furniture[id].x=3.5;assert.deepEqual(await stored(),installed,'floating Install commits the draft');
  await edit();await frame.locator('#placement-recall').click();await actions.waitFor({state:'hidden'});const recalled=structuredClone(installed);delete recalled.rooms[0].furniture[id];assert.deepEqual(await stored(),recalled,'floating Recall removes only the selected item');assert.equal(await item.count(),0);
  report.checks.push('Floating Install commits the changed pose and Recall removes the selected item');
  // A collision warning must not resize the viewport underneath an active drag.
  await frame.locator('#exit').click();await page.waitForFunction(()=>!document.querySelector('iframe'));await page.setViewportSize({width:1100,height:960});
  const linked={version:12,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:{direction:'right',x:9,y:1.5},furniture:{desk:{direction:'right',x:9,y:3.5},chair:{direction:'left',x:8.3,y:4.825,attachedTo:'desk'}}}],diary:'충돌 경고가 카메라를 움직이면 안 돼요.'};
  await page.evaluate(({key,linked})=>localStorage.setItem(key,JSON.stringify(linked)),{key,linked});await page.locator('#open').click();await frame.locator('#app').waitFor({state:'visible'});await frame.getByRole('button',{name:'의자 배치',exact:true}).click();await frame.locator('[data-furniture="chair"][data-render-state="ready"]').waitFor();await frame.locator('#overview').click();
  const settle=()=>viewport.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const layout=()=>viewport.evaluate(v=>({viewportHeight:v.getBoundingClientRect().height,panelHeight:document.querySelector('#panel').getBoundingClientRect().height,transform:document.querySelector('#world').style.transform,warningVisible:!document.querySelector('#placement-warning').hidden,directionsWidth:document.querySelector('.placement-panel .directions')?.getBoundingClientRect().width,rangeWidths:[...document.querySelectorAll('.placement-panel input[type="range"]')].map(n=>n.getBoundingClientRect().width)}));
  await settle();await page.screenshot({path:path.join(output,'editing-controls-desktop.png')});report.screenshots.push('editing-controls-desktop.png');const beforeWarning=await layout();
  const version=fs.readFileSync(path.join(root,'house-test/app.js'),'utf8').match(/model\.js\?v=([^']+)/)[1];
  const delta=await viewport.evaluate(async(v,version)=>{const {floorPoint}=await import('./model.js?v='+version),{itemSize}=await import('./furniture-catalog.js?v='+version),size=itemSize('desk','right'),a=floorPoint(9+size.w/2,3.5+size.d),b=floorPoint(9+size.w/2,3+size.d),scale=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#world')).transform).a;return {x:(b.x-a.x)*scale,y:(b.y-a.y)*scale};},version);
  const chair=frame.locator('[data-furniture="chair"]'),box=await chair.boundingBox(),start={x:box.x+box.width/2,y:box.y+box.height/2};await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+delta.x,start.y+delta.y,{steps:1});const immediate=await layout();await settle();const afterWarning=await layout();await page.mouse.up();
  report.warningDrag={before:beforeWarning,immediate,after:afterWarning};assert.equal(await frame.locator('#placement-done').isDisabled(),true,'real drag enters the bookshelf collision');assert.equal(afterWarning.warningVisible,true);assert.deepEqual(await stored(),linked);
  assert.equal(afterWarning.viewportHeight,beforeWarning.viewportHeight,'collision warning preserves viewport height during drag');assert.equal(afterWarning.panelHeight,beforeWarning.panelHeight,'collision warning does not expand the compact controls');assert.equal(afterWarning.transform,beforeWarning.transform,'collision warning does not recenter the camera during drag');
  await frame.locator('#panel').getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await stored(),linked);await page.setViewportSize({width:375,height:812});await frame.getByRole('button',{name:'의자 배치',exact:true}).click();await frame.locator('[data-furniture="chair"][data-render-state="ready"]').waitFor();await settle();report.compactMobile=await layout();await page.screenshot({path:path.join(output,'editing-controls-mobile.png')});report.screenshots.push('editing-controls-mobile.png');
  report.checks.push('A real blocked placement drag shows the collision warning without resizing controls or recentering the camera');assert.deepEqual(report.errors,[]);report.status='passed';
 }catch(error){report.status='failed';report.failure=error.stack;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}
 finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:report.status,checks:report.checks,failure:report.failure,output},null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
