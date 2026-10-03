// Actual house UI, original PNGs and room painter; isolated local storage only.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const repo=path.resolve(process.env.ROOT_DIR||path.join(__dirname,'..')),workspace=path.resolve(repo,'..');
const output=path.resolve(process.env.QA_OUTPUT_DIR||path.join(repo,'house-test/qa/sofa-accessories-v1'));
const origin='https://fixture.test',version='20261003-lamp1',owner='local-sofa-accessories-review',key='ojjuda-house-playtest-v1:'+owner;
const ids=['cream-floral-cushion','sage-cushion','peach-cushion','pink-check-cushion'],directions=['left','center','right'];
const labels={'cream-floral-cushion':'크림 꽃무늬 쿠션','sage-cushion':'세이지 쿠션','peach-cushion':'피치 쿠션','pink-check-cushion':'분홍 체크 쿠션','blanket-sofa':'분홍 담요',sofa:'소파','blanket-floor':'분홍 담요'};
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function main(){
 fs.mkdirSync(output,{recursive:true});
 const report={scope:'Independent props: actual UI, raster sources, storage and mobile controls',checks:[],paint:[],screenshots:[],errors:[],failedRequests:[]};
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 let context,page,frame;const requests=[];
 try{
  context=await browser.newContext({viewport:{width:1100,height:960},deviceScaleFactor:1,hasTouch:true});page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>requests.push(new URL(r.url()).pathname));page.on('requestfailed',r=>report.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
  await page.clock.install({time:new Date('2026-10-03T11:00:00+09:00')});
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname==='/qa')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><button id="open">열기</button><script type="module">import {openHouseTest} from "/house-test/host.js";document.querySelector("#open").onclick=()=>openHouseTest({owner:"'+owner+'",authorized:()=>true});</script></html>'});if(u.pathname==='/favicon.ico')return route.fulfill({status:204});if(u.pathname==='/qa-font.otf'&&process.env.SOFA_PROOF_FONT)return route.fulfill({path:process.env.SOFA_PROOF_FONT,contentType:'font/otf'});const file=path.resolve(repo,'.'+decodeURIComponent(u.pathname));return file.startsWith(repo+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();});
  if(process.env.SOFA_PROOF_FONT)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='@font-face{font-family:ProofKorean;src:url(/qa-font.otf)}body,button,input,output{font-family:ProofKorean,sans-serif!important}';document.head.append(style);},{once:true}));
  await page.goto(origin+'/qa');
  const ready=async()=>{await frame.locator('#app').waitFor({state:'visible'});await frame.locator('body').evaluate(async()=>{await Promise.all([...document.querySelectorAll('.room-bg')].map(im=>im.decode()));await document.fonts.ready;await new Promise(resolve=>{const check=()=>[...document.querySelectorAll('.furniture')].some(n=>n.dataset.renderState==='loading')?requestAnimationFrame(check):resolve();check();});});assert.equal(await frame.locator('.furniture[data-render-state="error"]').count(),0);};
  const open=async()=>{await page.locator('#open').click();frame=page.frameLocator('iframe[title="우리집"]');await ready();};
  const close=async()=>{await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('iframe'));};
  const reopen=async()=>{await close();await open();};
  const click=async label=>{await frame.getByRole('button',{name:label,exact:true}).click();await ready();};
  const node=id=>frame.locator('.room[data-room="0:0"] .furniture[data-furniture="'+id+'"]');
  const pose=id=>node(id).evaluate(n=>({direction:n.dataset.direction,x:Number(n.dataset.x),y:Number(n.dataset.y),...(n.dataset.elevation===undefined?{}:{elevation:Number(n.dataset.elevation)}),...(n.dataset.mode?{mode:n.dataset.mode}:{})}));
  const poses=async()=>Object.fromEntries(await Promise.all(ids.map(async id=>[id,await pose(id)])));
  const edit=async(id,placed=true)=>{if(id==='blanket-sofa'&&placed){await node(id).dispatchEvent('click');await ready();return;}await frame.locator('[data-category="'+(ids.includes(id)||id==='blanket-floor'?'accessories':'furniture')+'"]').click();await click(labels[id]+(placed?' 배치':' 놓기'));};
  const stored=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const pixelHash=async id=>hash(await node(id).locator('canvas.furniture-paint').evaluate(c=>c.toDataURL()));
  const capture=async name=>{await ready();await page.clock.runFor(3000);const file=name+'.png';await frame.locator('#app').screenshot({path:path.join(output,file)});report.screenshots.push(file);};
  const slider=async(selector,value)=>{const input=frame.locator(selector);await input.evaluate((n,v)=>{n.value=String(v);n.dispatchEvent(new Event('input',{bubbles:true}));},value);await ready();assert.equal(Number(await input.inputValue()),value);};
  const direction=async d=>{await frame.locator('#panel-body button[data-direction="'+d+'"]').click();await ready();};
  const inspect=async(id,editing=false)=>{
   const result=await node(id).evaluate(async(n,{id,version,editing})=>{
    const {furnitureGeometry}=await import('./furniture.js?v='+version),{roomPoint,floorPoint}=await import('./model.js?v='+version),{itemSize}=await import('./furniture-catalog.js?v='+version),{SOFA_V1}=await import('./sofa-v1-registration.js?v='+version);
    const placement={direction:n.dataset.direction,x:Number(n.dataset.x),y:Number(n.dataset.y),...(n.dataset.elevation===undefined?{}:{elevation:Number(n.dataset.elevation)}),...(n.dataset.mode?{mode:n.dataset.mode}:{})};const g=furnitureGeometry(id,placement),canvas=n.querySelector('canvas.furniture-paint'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let painted=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>24)painted++;
    const size=itemSize(id,placement.direction,placement),expected=id==='sofa'?SOFA_V1[placement.direction].mesh.anchors.filter(a=>a.kind==='physical'&&Math.abs(a.world.z)<1e-8).map(a=>roomPoint(placement.x+a.world.x,placement.y+a.world.y,a.world.z)):id==='blanket-floor'?g.registration.worldCorners.map(p=>roomPoint(p.x,p.y,p.z)):[[placement.x,placement.y],[placement.x+size.w,placement.y],[placement.x+size.w,placement.y+size.d],[placement.x,placement.y+size.d]].map(p=>floorPoint(...p));
    const layers=(g.art.layers||[]).map(l=>({id:l.id,image:l.image,source:JSON.stringify(l.triangles.map(t=>t.source)),center:l.triangles.flatMap(t=>t.target).reduce((a,p,_,list)=>({x:a.x+p.x/list.length,y:a.y+p.y/list.length}),{x:0,y:0})}));
    return {id,placement,sources:canvas.dataset.sources.split(' '),painted,anchorError:Math.max(0,...g.anchors.map((p,i)=>Math.hypot(p.x-expected[i].x,p.y-expected[i].y))),anchors:g.anchors,svg:editing?[...document.querySelectorAll('.room.selected .floor-grid .bookshelf-anchor')].map(n=>({x:Number(n.getAttribute('cx')),y:Number(n.getAttribute('cy'))})):[],layers,zIndex:Number(n.style.zIndex)};
   },{id,version,editing});
   assert(result.painted>200,id+' actual PNG paints visible pixels');assert(result.anchorError<1e-5,id+' anchor geometry');
   if(editing){assert.equal(result.svg.length,result.anchors.length);result.svg.forEach((p,i)=>assert(Math.hypot(p.x-result.anchors[i].x,p.y-result.anchors[i].y)<1e-5));}
   const d=result.placement.direction,expected=id==='sofa'?['left-arm','body','right-arm'].map(p=>'assets/sofa-'+d+'-'+p+'-v1.png'):[id==='blanket-floor'?'assets/blanket-floor-'+d+'.png':'assets/'+id+'-'+d+'-v1.png'];if(ids.includes(id)){assert(result.sources.includes(expected[0]),id+' approved PNG source');assert(result.sources.every(source=>source===expected[0]||/^assets\/(?:sofa-(left|center|right)-(left-arm|right-arm|body)|blanket-sofa-(left|center|right))-v1\.png$/.test(source)),'only approved sofa occlusion masks may supplement a prop PNG');}else assert.deepEqual([...result.sources].sort(),expected.sort());
   report.paint.push({...result,layers:result.layers.map(({source,...l})=>({...l,sourceTriangleSha256:hash(source)}))});return result;
  };
  await open();assert.equal(await node('sofa').count(),0);for(const id of ids)assert.equal(await node(id).count(),0);
  const original={bookshelf:await pose('bookshelf'),desk:await pose('desk'),bookshelfPixels:await pixelHash('bookshelf'),deskPixels:await pixelHash('desk')};
  const preserved=async()=>{assert.deepEqual(await pose('bookshelf'),original.bookshelf);assert.deepEqual(await pose('desk'),original.desk);assert.equal(await pixelHash('bookshelf'),original.bookshelfPixels);assert.equal(await pixelHash('desk'),original.deskPixels);};
  await edit('sofa',false);assert.equal(await frame.locator('input[data-accessory]').count(),0);await inspect('sofa',true);await click('설치');await reopen();for(const id of ids)assert.equal(await node(id).count(),0);assert.equal('accessories' in (await stored()).rooms[0].furniture.sofa,false);
  report.checks.push('A newly placed sofa is bare; cushions and blankets require explicit placement');
  // Restore an actual prior schema snapshot. Expected geometry is independently
  // fixed in sofa-accessories-v11-geometry.json and verified by the model test.
  const legacy=await stored();legacy.version=11;legacy.rooms[0].furniture['blanket-floor']={direction:'center',x:3.5,y:4.5};legacy.rooms[0].furniture.sofa.accessories=Object.fromEntries(ids.map(id=>[id,true]));await close();await page.evaluate(({key,legacy})=>localStorage.setItem(key,JSON.stringify(legacy)),{key,legacy});await open();
  for(const id of ids)await inspect(id);await capture('desktop-migrated');await reopen();assert.equal((await stored()).version,13);
  for(const id of ids.filter(id=>id!=='blanket-sofa')){
   const initial=await pose(id),beforeAll=await poses(),sofa=await pose('sofa'),pixels=await pixelHash(id),saved=await stored();
   await edit(id);assert.equal(await frame.locator('input[data-accessory]').count(),0);const before=await inspect(id,true);await slider('#bookshelf-gap',2);await slider('#accessory-height',1.2);const moved=await inspect(id,true);assert.notDeepEqual(moved.placement,initial);assert.equal(moved.layers[0].source,before.layers[0].source);assert(Math.hypot(moved.layers[0].center.x-before.layers[0].center.x,moved.layers[0].center.y-before.layers[0].center.y)>1);await click('취소');assert.deepEqual(await poses(),beforeAll);assert.deepEqual(await pose('sofa'),sofa);assert.equal(await pixelHash(id),pixels);assert.deepEqual(await stored(),saved);
   await edit(id);for(const d of directions){await direction(d);await slider('#bookshelf-gap',3);await slider('#bookshelf-depth',3);await slider('#accessory-height',.7);await inspect(id,true);assert(await frame.locator('#placement-done').isEnabled());}const final=await pose(id);await click('설치');await reopen();assert.deepEqual(await pose(id),final);assert.deepEqual(await pose('sofa'),sofa);for(const other of ids.filter(v=>v!==id))assert.deepEqual(await pose(other),beforeAll[other]);
  }
  report.checks.push('All four cushions independently move, change height, rotate using all three real PNGs, cancel exactly, save and reopen without changing their sofa or peers');
  const props=await poses();await edit('sofa');await slider('#bookshelf-gap',.5);await click('설치');await reopen();assert.deepEqual(await poses(),props);
  await edit('sofa');await direction('right');assert(await frame.locator('#placement-done').isDisabled());await click('취소');await preserved();
  const sofaViews={left:{gap:0,y:3},center:{gap:3,y:0},right:{gap:1,y:3}};
  for(const d of directions){await edit('sofa');await direction(d);await slider('#bookshelf-depth',sofaViews[d].y);await slider('#bookshelf-gap',sofaViews[d].gap);assert(await frame.locator('#placement-done').isEnabled());await inspect('sofa',true);await click('설치');assert.deepEqual(await poses(),props);}
  report.checks.push('Moving or rotating the sofa leaves all prop positions fixed; standing furniture collision protection remains');
  await edit('blanket-floor');await slider('#bookshelf-gap',3.5);await slider('#bookshelf-depth',4.5);assert(await frame.locator('#placement-done').isEnabled());const floor=await inspect('blanket-floor',true);assert.equal(floor.placement.mode,'floor');assert(floor.zIndex<Number(await node('sofa').evaluate(n=>n.style.zIndex)));await click('설치');const floorSaved=await pose('blanket-floor');await edit('blanket-floor');await slider('#bookshelf-gap',4);await click('취소');assert.deepEqual(await pose('blanket-floor'),floorSaved);
  await edit('sofa');await click('회수');await reopen();assert.equal(await node('sofa').count(),0);assert.deepEqual(await poses(),props);
  for(const d of directions){await edit('blanket-floor');await direction(d);await slider('#bookshelf-depth',4.5);await slider('#bookshelf-gap',d==='right'?4.5:4);await inspect('blanket-floor',true);await click('설치');}
  await frame.locator('#overview').click();await capture('desktop-independent');await page.setViewportSize({width:375,height:812});await edit(ids[0]);await slider('#accessory-height',1.4);await capture('mobile-independent-controls');await click('취소');assert.deepEqual(await poses(),props);const mobile=await frame.locator('body').evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.equal(mobile.width,mobile.scroll);report.mobile=mobile;
  const removed=ids[0];await edit(removed);await click('회수');await reopen();assert.equal(await node(removed).count(),0);for(const id of ids.slice(1))assert.deepEqual(await pose(id),props[id]);await edit(removed,false);await click('취소');assert.equal(await node(removed).count(),0);
  // Explicit new placement works independently even after its original parent
  // is gone; removing another prop never brings an earlier removal back.
  await edit(removed,false);await slider('#bookshelf-gap',3);await slider('#bookshelf-depth',3);await slider('#accessory-height',0);const newlyPlaced=await pose(removed);await click('설치');await reopen();assert.deepEqual(await pose(removed),newlyPlaced);assert.equal(await node('sofa').count(),0);await edit(removed);await click('회수');await edit(ids[1]);await click('회수');await reopen();assert.equal(await node(removed).count(),0);assert.equal(await node(ids[1]).count(),0);for(const id of ids.slice(2))assert.deepEqual(await pose(id),props[id]);await preserved();
  report.checks.push('Mobile controls fit 375px; floor blanket remains independent; removing the sofa preserves props and removed props do not regenerate; standalone add and cancel both work');
  const expectedAssets=directions.flatMap(d=>[...['left-arm','body','right-arm'].map(p=>'/house-test/assets/sofa-'+d+'-'+p+'-v1.png'),...ids.map(id=>'/house-test/assets/'+id+'-'+d+'-v1.png'),'/house-test/assets/blanket-floor-'+d+'.png']).concat(['left','center'].map(d=>'/house-test/assets/blanket-sofa-'+d+'-v1.png')).sort();report.requestedSources=[...new Set(requests.filter(p=>/\/assets\/(?:sofa-|cream-floral-cushion-|sage-cushion-|peach-cushion-|pink-check-cushion-|blanket-sofa-|blanket-floor-)/.test(p)))].sort();assert.deepEqual(report.requestedSources,expectedAssets);assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);report.status='passed';
 }catch(error){report.status='failed';report.failure=error.stack;try{await frame?.locator('#app').screenshot({path:path.join(output,'failure.png'),timeout:3000});}catch{}throw error;}
 finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await context?.close();await browser.close();console.log(JSON.stringify({status:report.status,checks:report.checks,errors:report.errors,failure:report.failure,screenshots:report.screenshots},null,2));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
