// Focused blanket comparison through the real house host, controls and painter.
// Only the signed-in owner is a local fixture; production data is never touched.
const {chromium}=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES?process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright':'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{execFileSync}=require('child_process');
const repo=path.resolve(process.env.ROOT_DIR||path.join(__dirname,'..'));
const workspace=path.resolve(process.env.QA_WORKSPACE||path.join(repo,'..'));
const beforeRepo=path.resolve(process.env.BEFORE_DIR||path.join(workspace,'ojjuda-sofa-release'));
const output=path.resolve(process.env.QA_OUTPUT_DIR||path.join(repo,'house-test/qa/sofa-blanket-v2'));
const origin='https://blanket-fixture.test',owner='local-sofa-blanket-review';
const directions=['left','center','right'];
const poses={left:{x:0,y:3,gap:0},center:{x:3,y:0,gap:3},right:{x:7.5,y:3,gap:1}};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fontRoot=path.join(workspace,'preview-tools/node_modules/@fontsource/noto-sans-kr');
const localChromium=path.join(workspace,'preview-tools/chromium');
const report={startedAt:new Date().toISOString(),scope:'Before/after actual host UI and painter; three directions, blanket toggle, 0.5-cell movement, exact cancel restoration.',sources:{},runs:[],screenshots:[],visualReview:'Functional results do not certify natural cloth appearance. Inspect the room and sofa comparison images before approval.'};
let browser;

async function captureVersion(root,label){
 const dir=path.join(output,label);fs.mkdirSync(dir,{recursive:true});
 const runtimeFiles=['sofa-art.js','sofa-blanket-drape.js','sofa-cushion-placement.js','picture-mesh.js','furniture-painter.js'].filter(file=>fs.existsSync(path.join(root,'house-test',file)));
 const result={label,root,commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),runtimeSha256:Object.fromEntries(runtimeFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,'house-test',file)))])),checks:[],poses:[],errors:[],failedRequests:[]};
 report.runs.push(result);
 const context=await browser.newContext({viewport:{width:1100,height:960},deviceScaleFactor:1});
 const page=await context.newPage();let frame;
 page.on('pageerror',error=>result.errors.push(error.message));
 page.on('console',message=>{if(message.type()==='error')result.errors.push(message.text());});
 page.on('requestfailed',request=>result.failedRequests.push({url:request.url(),error:request.failure()?.errorText}));
 await page.clock.install({time:new Date('2026-10-02T11:00:00+09:00')});
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
  if(url.pathname==='/qa')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><button id="open">열기</button><script type="module">import {openHouseTest} from "/house-test/host.js";document.querySelector("#open").onclick=()=>openHouseTest({owner:"'+owner+'",authorized:()=>true});</script></html>'});
  if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
  const font=url.pathname.startsWith('/qa-font/'),base=font?fontRoot:root;
  const file=path.resolve(base,'.'+decodeURIComponent(font?url.pathname.slice('/qa-font'.length):url.pathname));
  return file.startsWith(base+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
 });
 const ready=async()=>{
  await frame.locator('#app').waitFor({state:'visible'});
  await frame.locator('body').evaluate(async()=>{
   await Promise.all([...document.querySelectorAll('.room-bg')].map(image=>image.decode()));
   await new Promise(resolve=>{const check=()=>[...document.querySelectorAll('.furniture')].some(node=>node.dataset.renderState==='loading')?requestAnimationFrame(check):resolve();check();});
  });
  assert.equal(await frame.locator('.furniture[data-render-state="error"]').count(),0);
 };
 const node=()=>frame.locator('.room[data-room="0:0"] .furniture[data-furniture="sofa"]');
 const pose=()=>node().evaluate(n=>({direction:n.dataset.direction,x:Number(n.dataset.x),y:Number(n.dataset.y)}));
 const pixels=()=>node().locator('canvas').evaluate(canvas=>canvas.toDataURL('image/png'));
 const pixelHash=async()=>hash(await pixels());
 const click=async text=>{await frame.getByRole('button',{name:text,exact:true}).click();await ready();};
 const slider=async(selector,value)=>{
  const input=frame.locator(selector),difference=value-Number(await input.inputValue());assert.equal(Math.round(difference*2),difference*2);
  await input.focus();for(let i=0;i<Math.abs(difference)*2;i++)await input.press(difference>0?'ArrowRight':'ArrowLeft');
  await ready();assert.equal(Number(await input.inputValue()),value);
 };
 const blanket=async checked=>{await frame.locator('input[data-accessory="blanket-sofa"]').setChecked(checked);await ready();};
 const capture=async(name,selector)=>{
  await ready();await page.clock.runFor(3000);await frame.locator('#notice:not(.show)').waitFor({state:'attached'});
  const relative=label+'/'+name+'.png';await frame.locator(selector).screenshot({path:path.join(output,relative)});report.screenshots.push(relative);
 };
 try{
  await page.goto(origin+'/qa');await page.locator('#open').click();frame=page.frameLocator('iframe[title="새 우리집 플레이 테스트"]');await ready();
  if(fs.existsSync(path.join(fontRoot,'400.css')))await frame.locator('body').evaluate(async()=>{
   const link=document.createElement('link');link.rel='stylesheet';link.href='/qa-font/400.css';
   const loaded=new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=reject;});document.head.append(link);await loaded;
   const style=document.createElement('style');style.textContent='body,button,input,output{font-family:"Noto Sans KR",sans-serif!important}';document.head.append(style);
   await document.fonts.load('16px "Noto Sans KR"','소파 담요 우리집');
  });
  await click('소파 놓기');await click('배치 완료');
  for(const direction of directions){
   await click('소파 배치');await frame.locator('#panel-body button[data-direction="'+direction+'"]').click();await ready();
   await slider('#bookshelf-depth',poses[direction].y);await slider('#bookshelf-gap',poses[direction].gap);
   assert.ok(await frame.locator('#placement-done').isEnabled());await click('배치 완료');
   const expected={direction,x:poses[direction].x,y:poses[direction].y};assert.deepEqual(await pose(),expected);
   const baselineHash=await pixelHash();
   const layerIds=await node().locator('canvas').evaluate(canvas=>canvas.dataset.layers.split(' '));
   if(label==='after'){
    const expectedOrder={left:['pink-check-cushion','sage-cushion','peach-cushion','cream-floral-cushion'],center:['peach-cushion','cream-floral-cushion'],right:['peach-cushion','cream-floral-cushion','sage-cushion','pink-check-cushion']}[direction];
    const cushions=['cream-floral-cushion','sage-cushion','peach-cushion','pink-check-cushion'];
    for(let i=0;i<expectedOrder.length-1;i++)assert.ok(layerIds.indexOf(expectedOrder[i])>=0&&layerIds.indexOf(expectedOrder[i])<layerIds.indexOf(expectedOrder[i+1]),direction+' cushion order '+expectedOrder.join(' < '));
    for(const id of cushions)assert.ok(layerIds.indexOf('blanket-sofa')>=0&&layerIds.indexOf('blanket-sofa')<layerIds.indexOf(id),direction+' upper blanket must be below '+id);
    assert.equal(layerIds.at(-1),'blanket-sofa-front',direction+' hanging front blanket must be painted last');
    result.checks.push(direction+': directional cushion overlap order, upper blanket below every cushion, hanging blanket drawn last');
   }
   await frame.locator('#overview').click();await capture(direction+'-room','#app');
   await capture(direction+'-in-room','.room[data-room="0:0"] .furniture[data-furniture="sofa"]');
   const image=await pixels(),canvasPath=label+'/'+direction+'-sofa.png';
   // Exact output of the live canvas: no redraw, replacement art or image edit.
   fs.writeFileSync(path.join(output,canvasPath),Buffer.from(image.split(',')[1],'base64'));report.screenshots.push(canvasPath);
   await click('소파 배치');await blanket(false);assert.notEqual(await pixelHash(),baselineHash,direction+' blanket toggle must alter actual pixels');
   await blanket(true);assert.equal(await pixelHash(),baselineHash,direction+' blanket toggle must restore exact original pixels');
   // Right view permits gaps through 1 cell; test its inward half-step.
   await slider('#bookshelf-gap',poses[direction].gap+(direction==='right'?-.5:.5));
   const moved=await pose();assert.equal(Math.abs(moved.x-expected.x),.5);assert.equal(moved.y,expected.y);assert.notEqual(await pixelHash(),baselineHash);
   const movedHash=await pixelHash();await blanket(false);assert.notEqual(await pixelHash(),movedHash);await blanket(true);assert.equal(await pixelHash(),movedHash);
   await click('취소');assert.deepEqual(await pose(),expected);assert.equal(await pixelHash(),baselineHash,direction+' cancel must restore exact saved pixels');
   result.poses.push({saved:expected,moved,baselineHash,movedHash,layerIds,canvas:canvasPath});
   result.checks.push(direction+': visible blanket toggle, exact toggle restoration, 0.5-cell parent movement, moved blanket toggle, exact cancel restoration');
  }
  assert.deepEqual(result.errors,[]);assert.deepEqual(result.failedRequests,[]);result.status='passed';
 }catch(error){result.status='failed';result.failure=error.stack;try{await frame?.locator('#app').screenshot({path:path.join(dir,'failure.png'),timeout:3000});}catch{}throw error;}
 finally{await context.close();}
}

async function comparison(){
 const labels={left:'좌측',center:'정면',right:'우측'};
 const title='소파 담요 · 실제 앱 그림 비교',description='동일한 방 좌표와 낮 조명에서 추출한 실제 소파 그림입니다. 전후 확대 비율은 같습니다.';
 // Include only the Korean font subsets needed by this compact review sheet.
 const used=[...new Set([...title+description+'좌측 정면 우측 수정 전 수정 후'].map(c=>c.codePointAt(0)))];
 const fontFile=path.join(fontRoot,'400.css');let fonts='';
 if(fs.existsSync(fontFile))fonts=(fs.readFileSync(fontFile,'utf8').match(/@font-face\s*\{[^}]+\}/g)||[]).filter(block=>{
  const ranges=block.match(/unicode-range:\s*([^;]+)/)?.[1].split(',').map(range=>range.trim().slice(2).split('-').map(n=>parseInt(n,16)))||[];
  return ranges.some(([first,last=first])=>used.some(code=>code>=first&&code<=last));
 }).map(block=>block.replace(/src:[^;]+;/,()=>{
  const file=block.match(/url\(([^)]+\.woff2)\)/)[1];return 'src:url(data:font/woff2;base64,'+fs.readFileSync(path.resolve(fontRoot,file)).toString('base64')+') format("woff2");';
 })).join('\n');
 const cells=(embed)=>directions.map(direction=>{
  const images=['before','after'].map(label=>{const relative=label+'/'+direction+'-sofa.png',bytes=fs.readFileSync(path.join(output,relative));return {label,relative,bytes,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};});
  // Both live canvases use deviceScaleFactor 1, so one common scale preserves
  // physical sofa size even when hanging cloth expands one canvas's bounds.
  const scale=Math.min(480/Math.max(...images.map(image=>image.width)),316/Math.max(...images.map(image=>image.height)));
  return '<section><h2>'+labels[direction]+'</h2><div class="pair">'+images.map(({label,relative,bytes,width,height})=>{
   const src=embed?'data:image/png;base64,'+bytes.toString('base64'):relative;
   return '<figure><figcaption>'+(label==='before'?'수정 전':'수정 후')+'</figcaption><div class="art"><img style="width:'+width*scale+'px;height:'+height*scale+'px" src="'+src+'" alt="'+labels[direction]+' '+label+' 소파"></div></figure>';
  }).join('')+'</div></section>';
 }).join('');
 const document=embed=>'<!doctype html><html lang="ko"><meta charset="utf-8"><title>소파 담요 수정 비교</title><style>'+fonts+'*{box-sizing:border-box}body{margin:0;padding:24px;background:#f5eee5;color:#40382f;font:16px "Noto Sans KR",sans-serif}h1{font-size:24px;margin:0 0 8px}p{margin:0 0 24px;color:#655d54}section{margin:0 0 22px}h2{font-size:18px;margin:0 0 8px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0;border:1px solid #d9cbbd;border-radius:10px;background:#fffaf4;overflow:hidden}figcaption{padding:10px 14px;border-bottom:1px solid #e5d8cb;font-weight:bold}.art{height:340px;display:flex;align-items:center;justify-content:center;padding:12px}img{object-fit:contain}</style><h1>'+title+'</h1><p>'+description+'</p>'+cells(embed)+'</html>';
 fs.writeFileSync(path.join(output,'comparison.html'),document(false));
 const page=await browser.newPage({viewport:{width:1080,height:1500},deviceScaleFactor:1});
 await page.setContent(document(true));await page.locator('img').evaluateAll(async images=>Promise.all(images.map(image=>image.decode())));await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:path.join(output,'comparison.png'),fullPage:true});await page.close();if(!report.screenshots.includes('comparison.png'))report.screenshots.push('comparison.png');
}

async function main(){
 fs.mkdirSync(output,{recursive:true});
 if(process.env.QA_COMPARISON_ONLY==='1'||process.env.QA_AFTER_ONLY==='1')Object.assign(report,JSON.parse(fs.readFileSync(path.join(output,'report.json'),'utf8')));
 for(const direction of directions){
  const relative='house-test/assets/blanket-sofa-'+direction+'-v1.png';
  const before=hash(fs.readFileSync(path.join(beforeRepo,relative))),after=hash(fs.readFileSync(path.join(repo,relative)));
  report.sources[direction]={relative,before,after,unchanged:before===after};assert.equal(before,after,'Blanket source art must remain unchanged');
 }
 browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||process.env.CHROMIUM_PATH||(fs.existsSync(localChromium)?localChromium:undefined),args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-software-rasterizer']});
 try{
  if(process.env.QA_COMPARISON_ONLY!=='1'){
   if(process.env.QA_AFTER_ONLY==='1'){report.runs=report.runs.filter(run=>run.label==='before');report.screenshots=report.screenshots.filter(file=>file.startsWith('before/'));}
   else await captureVersion(beforeRepo,'before');
   await captureVersion(repo,'after');
  }
  await comparison();report.status='passed';
 }
 catch(error){report.status='failed';report.failure=error.stack;throw error;}
 finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:report.status,runs:report.runs.map(({label,status,checks,errors,failedRequests})=>({label,status,checks,errors,failedRequests})),screenshots:report.screenshots,failure:report.failure},null,2));}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
