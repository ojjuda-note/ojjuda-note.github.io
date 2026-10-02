// Actual house-test UI; local isolated owner state, no deployment or server writes.
// ROOT_DIR can point at a separate checkout; QA_OUTPUT_DIR and CHROMIUM_PATH are optional.
// Run: "$CODEX_PRIMARY_RUNTIME_NODE" tests/desk-v7-ui.test.cjs
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright' : 'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const workspace=process.env.QA_WORKSPACE||path.resolve(__dirname,'../..');
const repo=path.resolve(process.env.ROOT_DIR||path.join(__dirname,'..'));
const output=path.resolve(process.env.QA_OUTPUT_DIR||path.join(repo,'house-test/authoring/desk-handles-v7/actual-room'));
const origin='https://fixture.test',version='20261002-desk-v7',args=new Set(process.argv.slice(2));
const directions=['right','left','center'];
const assets=directions.map(d=>'desk-'+d+'-v7.webp');
const defaults={right:{direction:'right',x:9,y:3.5},left:{direction:'left',x:0,y:3.5},center:{direction:'center',x:3.5,y:0}};
const viewports=[{name:'mobile',width:430,height:932},{name:'desktop',width:1100,height:960}]
 .filter(v=>!args.has('--mobile-only')||v.name==='mobile').filter(v=>!args.has('--desktop-only')||v.name==='desktop');
async function main(){
 for(const asset of assets)assert.ok(fs.existsSync(path.join(repo,'house-test/assets',asset)),asset+' not ready');
 assert.match(fs.readFileSync(path.join(repo,'house-test/desk-art.js'),'utf8'),/desk-v7-registration/);
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||process.env.CHROMIUM_PATH||(fs.existsSync(path.join(workspace,'preview-tools/chromium'))?path.join(workspace,'preview-tools/chromium'):undefined),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-software-rasterizer'],headless:true});
 const report={version,root:repo,startedAt:new Date().toISOString(),scope:'actual editor; test-local state only',viewports:[]};
 try{
  for(const viewport of viewports){
   const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},deviceScaleFactor:1});
   const page=await context.newPage(),errors=[],requests=[],failed=[];
   const record={viewport:viewport.name,size:[viewport.width,viewport.height],views:[],consoleErrors:errors,failedRequests:failed};report.viewports.push(record);
   page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
   page.on('request',request=>requests.push(new URL(request.url()).pathname));page.on('requestfailed',request=>failed.push({url:request.url(),error:request.failure()?.errorText}));
   await page.clock.install({time:new Date('2026-10-02T11:00:00+09:00')});
   await page.route('**/*',route=>{
    const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
    if(url.pathname==='/qa')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><button id="open">열기</button><script type="module">import {openHouseTest} from "/house-test/host.js";document.querySelector("#open").onclick=()=>openHouseTest({owner:"local-three-desk-v7-review",authorized:()=>true});</script></html>'});
    if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
    const font=url.pathname.startsWith('/qa-font/');
    const root=font?path.join(workspace,'preview-tools/node_modules/@fontsource/noto-sans-kr'):repo;
    const local=path.resolve(root,'.'+decodeURIComponent(font?url.pathname.slice('/qa-font'.length):url.pathname));
    return local.startsWith(root+path.sep)&&fs.existsSync(local)&&fs.statSync(local).isFile()?route.fulfill({path:local}):route.abort();
   });
   await page.goto(origin+'/qa');
   const open=async()=>{
    await page.locator('#open').click();const frame=page.frameLocator('iframe[title="새 우리집 플레이 테스트"]');
    await frame.locator('#app').waitFor({state:'visible'});await frame.locator('.desk[data-render-state="ready"]').waitFor();
    await frame.locator('body').evaluate(async()=>{const link=document.createElement('link');link.rel='stylesheet';link.href='/qa-font/400.css';const loaded=new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=reject;});document.head.append(link);await loaded;const style=document.createElement('style');style.textContent='body,button,input,output{font-family:"Noto Sans KR",sans-serif!important}';document.head.append(style);await document.fonts.load('16px "Noto Sans KR"','책상 의자 우리집');});return frame;
   };
   let frame=await open();
   const position=locator=>locator.evaluate(node=>({direction:node.dataset.direction,x:Number(node.dataset.x),y:Number(node.dataset.y)}));
   const deskPosition=()=>position(frame.locator('.desk'));
   const bookshelfBefore=await position(frame.locator('.bookshelf'));
   if(await frame.locator('.chair').count()){await frame.getByRole('button',{name:'의자 배치',exact:true}).click();await frame.getByRole('button',{name:'치우기',exact:true}).click();}
   assert.equal(await frame.locator('.chair').count(),0);
   await frame.getByRole('button',{name:'책상 배치',exact:true}).click();
   const contract=await frame.locator('body').evaluate(async()=>{const {FURNITURE}=await import('./furniture-catalog.js?v=20261002-desk-v7');const d=FURNITURE.desk;return {width:d.width,depth:d.depth,height:d.height,directions:d.directions};});
   assert.deepEqual(contract,{width:3,depth:1,height:1.4,directions:['left','center','right']});record.deskContract=contract;
   assert.deepEqual(await frame.locator('#panel-body button[data-direction]').evaluateAll(nodes=>nodes.map(n=>n.dataset.direction)),['left','center','right']);
   const inspectPaint=async(direction)=>{
    await frame.locator('.desk[data-direction="'+direction+'"][data-render-state="ready"]').waitFor();
    const measured=await frame.locator('.desk').evaluate(async(node)=>{
     const {furnitureGeometry}=await import('./furniture.js?v=20261002-desk-v7');
     const {DESK_V7}=await import('./desk-v7-registration.js?v=20261002-desk-v7');
     const {roomPoint}=await import('./model.js?v=20261002-desk-v7');
     const placement={direction:node.dataset.direction,x:Number(node.dataset.x),y:Number(node.dataset.y)},g=furnitureGeometry('desk',placement),registration=DESK_V7[placement.direction];
     const canvas=node.querySelector('canvas'),ctx=canvas.getContext('2d'),pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,density=Number(canvas.dataset.density);
     let painted=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>24)painted++;
     const anchors=[...document.querySelectorAll('.floor-grid .bookshelf-anchor')].map(n=>({x:Number(n.getAttribute('cx')),y:Number(n.getAttribute('cy'))}));
     const expected=registration.anchors.map(([x,y,z])=>roomPoint(x+placement.x-registration.placement.x,y+placement.y-registration.placement.y,z));
     const nearY=Math.max(...registration.anchors.map(p=>p[1]));
     const contacts=registration.anchors.map((world,i)=>({world,point:expected[i]})).filter(p=>Math.abs(p.world[1]-nearY)<1e-6).map(({point})=>{
      const x=(point.x-g.left)*density,y=(point.y-g.top)*density;let found=false;
      for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){const px=Math.round(x+dx),py=Math.round(y+dy);if(px>=0&&py>=0&&px<canvas.width&&py<canvas.height&&pixels[(py*canvas.width+px)*4+3]>24)found=true;}
      return {x,y,paintNearContact:found};
     });
     return {sources:canvas.dataset.sources,canvas:[canvas.width,canvas.height],painted,anchors,expected,nearContacts:contacts,placement};
    });
    assert.equal(measured.sources,'assets/desk-'+direction+'-v7.webp');assert.ok(measured.painted>1000,'Desk canvas is empty or incomplete');
    assert.equal(measured.anchors.length,measured.expected.length);
    measured.anchors.forEach((p,i)=>assert.ok(Math.hypot(p.x-measured.expected[i].x,p.y-measured.expected[i].y)<1e-5,'Displayed anchors differ from roomPoint'));
    assert.ok(measured.nearContacts.every(p=>p.paintNearContact),'A near floor contact has no painted wood nearby');
    return {sources:measured.sources,canvas:measured.canvas,painted:measured.painted,anchorCount:measured.anchors.length,nearContacts:measured.nearContacts};
   };
   const capture=async(direction,suffix)=>{
    await page.clock.runFor(5800);await frame.locator('#notice:not(.show)').waitFor({state:'attached'});await page.waitForTimeout(200);
    const name='desk-'+direction+'-'+viewport.name+'-'+suffix+'.png',file=path.join(output,name);
    if(!args.has('--verify-only'))await frame.locator('#app').screenshot({path:file,style:'div[role="dialog"][aria-label="새 우리집 테스트"] > button{visibility:hidden!important}'});return name;
   };
   for(const direction of directions){
    const entry={direction,screenshots:[]};record.views.push(entry);
    await frame.locator('#panel-body button[data-direction="'+direction+'"]').click();
    await frame.locator('.desk[data-render-state="ready"]').waitFor();
    assert.deepEqual(await deskPosition(),defaults[direction]);
    assert.equal(await frame.locator('#bookshelf-gap-label').textContent(),direction==='center'?'좌우 위치':'벽과 간격');
    assert.ok(await frame.locator('.floor-grid').isVisible());assert.ok(await frame.locator('.wall-grid').isVisible());
    assert.equal(await frame.locator('#placement-done').isDisabled(),false,'Reference pose must not overlap other furniture');
    entry.reference=await deskPosition();entry.referencePaint=await inspectPaint(direction);entry.screenshots.push(await capture(direction,'reference-grid'));
    // Keep a clean normal-room view at the reference pose for visual approval.
    await frame.getByRole('button',{name:'배치 완료',exact:true}).click();
    assert.deepEqual(await deskPosition(),entry.reference);assert.equal(await frame.locator('.floor-grid').count(),0);
    const cameraBox=await frame.locator('#viewport').boundingBox(),deskBox=await frame.locator('.desk').boundingBox();
    // Ordinary mode follows the existing bookshelf camera. Use its real pan
    // gesture to bring the selected desk into view without editing its pose.
    const dx=direction==='center'?cameraBox.x+cameraBox.width*.5-(deskBox.x+deskBox.width*.5):deskBox.x<cameraBox.x+20?cameraBox.x+20-deskBox.x:deskBox.x+deskBox.width>cameraBox.x+cameraBox.width-20?cameraBox.x+cameraBox.width-20-deskBox.x-deskBox.width:0;
    const dy=cameraBox.y+cameraBox.height*.54-(deskBox.y+deskBox.height*.5),start={x:cameraBox.x+cameraBox.width*.5,y:cameraBox.y+cameraBox.height*.75};
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+dx,start.y+dy,{steps:8});await page.mouse.up();
    entry.screenshots.push(await capture(direction,'reference-normal'));
    await page.getByRole('button',{name:'테스트 닫기',exact:true}).click();frame=await open();assert.deepEqual(await deskPosition(),entry.reference,'Reference save/reopen failed');
    await frame.getByRole('button',{name:'책상 배치',exact:true}).click();
    await frame.locator('#bookshelf-gap').focus();await frame.locator('#bookshelf-gap').press('ArrowRight');await frame.locator('.desk[data-render-state="ready"]').waitFor();
    const moved={...entry.reference,x:entry.reference.x+(direction==='right'?-.5:.5)};
    assert.deepEqual(await deskPosition(),moved);assert.equal(await frame.locator('#placement-done').isDisabled(),false);
    entry.halfCell=moved;entry.movedPaint=await inspectPaint(direction);entry.screenshots.push(await capture(direction,'half-cell-grid'));
    await frame.getByRole('button',{name:'배치 완료',exact:true}).click();await page.getByRole('button',{name:'테스트 닫기',exact:true}).click();frame=await open();assert.deepEqual(await deskPosition(),moved,'Half-cell save/reopen failed');
    await frame.getByRole('button',{name:'책상 배치',exact:true}).click();
    await frame.locator('#bookshelf-depth').focus();await frame.locator('#bookshelf-depth').press('ArrowRight');await frame.locator('.desk[data-render-state="ready"]').waitFor();
    assert.deepEqual(await deskPosition(),{...moved,y:moved.y+.5},'Depth slider must move by .5 cell');
    await frame.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await deskPosition(),moved,'Cancel must restore saved pose');
    await page.getByRole('button',{name:'테스트 닫기',exact:true}).click();frame=await open();assert.deepEqual(await deskPosition(),moved,'Canceled draft must not persist');
    assert.deepEqual(await position(frame.locator('.bookshelf')),bookshelfBefore);assert.equal(await frame.locator('.chair').count(),0);entry.saveReopenCancel='passed';
    await frame.getByRole('button',{name:'책상 배치',exact:true}).click();
   }
   // Restore the original right-side reference pose in test-local state.
   await frame.locator('#panel-body button[data-direction="right"]').click();
   await frame.locator('#bookshelf-depth').focus();for(let i=0;i<7;i++)await frame.locator('#bookshelf-depth').press('ArrowRight');
   await frame.locator('.desk[data-render-state="ready"]').waitFor();assert.deepEqual(await deskPosition(),defaults.right);
   await frame.getByRole('button',{name:'배치 완료',exact:true}).click();
   record.finalReference=await deskPosition();record.bookshelfUnchanged=bookshelfBefore;
   record.requestedDeskAssets=[...new Set(requests.filter(url=>/\/desk-.*\.(webp|png)$/.test(url)))].sort();
   assert.deepEqual(record.requestedDeskAssets,assets.map(name=>'/house-test/assets/'+name).sort(),'Old desk assets were requested');
   assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await context.close();
  }
  report.status='passed';
 }catch(error){report.status='failed';report.failure=error.stack;throw error;}
 finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report,null,2));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
