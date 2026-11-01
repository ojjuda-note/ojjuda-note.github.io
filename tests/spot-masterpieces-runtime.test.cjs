const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),game=path.join(root,'games','spot-difference');
const read=file=>fs.readFileSync(path.join(game,file),'utf8');
const core=require(path.join(game,'game-core.js'));
const userId='11111111-1111-4111-8111-111111111111',requestId='22222222-2222-4222-8222-222222222222';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const spots=Array.from({length:10},(_,i)=>({x:25+(i%2)*50,y:10+Math.floor(i/2)*20,rx:5,ry:4,text:`다른 곳 ${i+1}`}));
const fixtures=[
 {id:1,title:'기존 그림',original:'/landscape.svg',difference:'/landscape.svg',spots:spots.slice(0,6)},
 {id:82,title:'명화 <img src=x>',category:'masterpiece',difficulty:'very-hard',aspectRatio:2/3,original:'/portrait.svg',difference:'/portrait.svg',spots,
  artwork:{artist:'작가 <strong>이름</strong>',year:1900,museum:'미술관',sourceUrl:'https://museum.example/art/82'}}
];

function checkPreciseTargetBounds(){
 const adjacent={spots:[
  {x:20,y:20,rx:3,ry:3,targetBounds:{left:10,top:10,right:30,bottom:30}},
  {x:32,y:20,rx:12,ry:12,targetBounds:{left:31,top:18,right:33,bottom:22}}
 ]};
 assert.deepEqual(core.hitTest(adjacent,29,20),{index:1,alreadyFound:false},'legacy stages retain their existing ellipse priority');
 assert.equal(core.hitTest(adjacent,10,10),null,'target bounds do not alter legacy puzzles without opt-in');
 const precise={...adjacent,hitMode:'target-bounds'};
 for(const [x,y]of[[29,20],[10,10],[30,10],[10,30],[30,30]]){
  assert.deepEqual(core.hitTest(precise,x,y),{index:0,alreadyFound:false},'the actual edit region wins over a neighboring generous ellipse');
  assert.deepEqual(core.hitTest(precise,x,y,[0]),{index:0,alreadyFound:true},'repeated clicks on a found edit never find its neighbor');
 }
 assert.deepEqual(core.hitTest(precise,35,20),{index:1,alreadyFound:false},'ellipse padding remains available outside the exact edit regions');
 for(const [x,y]of[[NaN,20],[-1,20],[101,20],[20,Infinity]])assert.equal(core.hitTest(precise,x,y),null);
}

function checkProgressNormalization(){
 const receipt={kind:'hint',spot:9,requestId,userId};
 const raw={version:2,current:1,found:{1:[0,1,2,3,4,5,6],82:[0,1,2,3,4,5]},rounds:{82:{...core.freshRound(),status:'payment',paid:[8,9,9,10],hintIndex:9,pending:receipt}}};
 const clean=core.cleanProgress(raw,fixtures);
 assert.deepEqual(clean.found[1],[0,1,2,3,4,5]);assert.equal(clean.rounds[1].status,'won');
 assert.equal(clean.rounds[82].status,'payment','six finds do not complete a ten-answer stage');
 assert.deepEqual(clean.rounds[82].pending,receipt);assert.deepEqual(clean.rounds[82].paid,[8,9]);assert.equal(clean.rounds[82].hintIndex,9);
 raw.found[82]=[...Array(10).keys(),9,10,-1,1.5];
 const won=core.cleanProgress(raw,fixtures);
 assert.deepEqual(won.found[82],[...Array(10).keys()]);assert.equal(won.rounds[82].status,'won');assert.equal(won.rounds[82].pending,null);
 raw.found[1]=[];raw.rounds[1]={...core.freshRound(),status:'payment',pending:{...receipt,spot:6}};
 const legacy=core.cleanProgress(raw,fixtures).rounds[1];
 assert.equal(legacy.pending,null,'legacy stages still reject a seventh hint index');assert.equal(legacy.status,'ready');
}

function domFixture(stored){
 const dom=new JSDOM(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,''),{url:'https://fixture.test/games/spot-difference/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window,$=id=>w.document.getElementById(id),scores=[],requests=[],registered=[];
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.scrollTo=()=>{};w.confirm=()=>true;
 w.document.modelContext={registerTool:tool=>registered.push(tool)};
 const account={ready:true,userId,coins:100,canViewAnswers:true};
 w.JjudaWallet={getState:()=>account,subscribe:fn=>fn(account),refresh:async()=>{},recordClear:async(owner,stage)=>{scores.push({owner,stage});return {ok:true};},buy:async(request,stage)=>{requests.push({...request,stage});return {ok:true,kind:request.kind,stage,spot:request.spot,price:1};}};
 w.JJUDA_PUZZLES=JSON.parse(JSON.stringify(fixtures));
 w.eval(read('game-core.js'));
 w.localStorage.setItem('jjuda-spot-six-v1',JSON.stringify({version:2,current:1,order:[1,0],...stored}));
 w.eval(read('app.js'));
 const load=()=>{for(const im of w.document.querySelectorAll('img'))if(im.onload)im.onload();};
 const state=()=>JSON.parse(w.localStorage.getItem('jjuda-spot-six-v1'));
 const round=()=>{const s=state();return s.rounds[w.JJUDA_PUZZLES[s.current].id];};
 const select=index=>{$('stage-picker').value=index;$('stage-picker').dispatchEvent(new w.Event('change'));load();};
 const tap=(index,zoom=false)=>{
  const p=w.JJUDA_PUZZLES[Number($('stage-picker').value)],surface=$(zoom?'zoom-original':'original').parentElement;
  const width=600,height=width/(p.aspectRatio||1.5);surface.getBoundingClientRect=()=>({left:0,top:0,width,height});
  const point={bubbles:true,clientX:p.spots[index].x*width/100,clientY:p.spots[index].y*height/100};
  surface.dispatchEvent(new w.MouseEvent('pointerdown',point));surface.dispatchEvent(new w.MouseEvent('click',point));
 };
 load();return {w,$,scores,requests,registered,state,round,select,tap};
}

async function checkRuntime(){
 const f=domFixture();try{
  assert.equal(f.state().current,1,'entry retains the original index of the last masterpiece');
  assert.deepEqual(f.state().order,[0,1],'an old shuffled order becomes the fixed difficulty order');
  assert.equal(f.$('found-total').textContent,'10');assert.equal(f.$('dots').children.length,10);assert.match(f.$('gate-copy').textContent,/10개/);
  assert.equal(f.$('stage-picker').querySelector('optgroup[label="세계 명화 · 매우 어려움 · 10곳 찾기"]').children.length,1);
  assert.match(f.$('stage-label').textContent,/ · 매우 어려움$/);
  assert.equal(f.$('artwork-credit').hidden,false);assert.equal(f.$('artwork-credit').querySelectorAll('strong').length,1);
  assert.equal(f.$('artwork-credit').querySelector('img'),null,'artwork metadata is text, never HTML');
  assert.match(f.$('artwork-credit').textContent,/<strong>이름<\/strong>/);
  assert.equal(f.$('artwork-credit').querySelector('a').href,'https://museum.example/art/82');
  assert.equal(f.$('artwork-credit').querySelector('a').rel,'noopener noreferrer');
  f.$('start').click();assert.equal(f.round().hearts,3);assert.equal(f.round().totalMs,60000);
  for(let i=0;i<6;i++)f.tap(i);
  assert.equal(f.round().status,'playing');assert.equal(f.$('found-count').textContent,'6');assert.equal(f.$('found-summary').textContent,'6 / 10');
  assert.equal(f.$('celebration').open,false);assert.equal(f.$('solved-total').textContent,'0');assert.deepEqual(f.scores,[]);
  f.tap(0);assert.equal(f.$('found-count').textContent,'6','a repeated find cannot advance progress');
  for(let i=6;i<9;i++)f.tap(i);
  f.$('hint').click();await flush();
  assert.equal(f.requests.length,1);assert.equal(f.requests[0].stage,82);assert.equal(f.requests[0].spot,9);
  assert.deepEqual(f.round().paid,[9]);assert.equal(f.w.document.querySelectorAll('.hint-mark[data-hint-key="82:9"]').length,4);
  f.$('hide-hint').click();assert.equal(f.w.document.querySelectorAll('.hint-mark').length,4);
  f.$('zoom').click();assert.match(f.$('zoom-status').textContent,/9 \/ 10/);
  f.tap(9,true);await flush();
  assert.equal(f.round().status,'won');assert.equal(f.$('celebration').open,true);assert.equal(f.$('celebration-count').textContent,'10 / 10');
  assert.equal(f.$('found-count').textContent,'10');assert.equal(f.$('solved-total').textContent,'1');
  assert.equal(f.w.document.querySelectorAll('.hint-mark').length,0);assert.equal(f.w.document.querySelectorAll('.mark').length,40);
  assert.ok([...f.w.document.querySelectorAll('.mark')].every(mark=>mark.textContent===''&&mark.children.length===0),'found rings remain unnumbered');
  f.tap(9);assert.deepEqual(f.scores,[{owner:userId,stage:82}],'one completed masterpiece records its true stage exactly once');
  const progress=f.registered.find(t=>t.name==='read_game_progress').execute();assert.equal(progress.target,10);assert.equal(progress.found,10);
  f.select(0);assert.equal(f.$('found-total').textContent,'6');assert.equal(f.$('dots').children.length,6);assert.equal(f.$('artwork-credit').hidden,true);
  assert.doesNotMatch(f.$('stage-label').textContent,/어려움/,'existing daily puzzles do not inherit the masterpiece difficulty');
  assert.ok([...f.w.document.querySelectorAll('.picture')].every(surface=>surface.style.getPropertyValue('--picture-ratio')==='1.5'),'legacy pictures keep their 3:2 shape');
  f.$('start').click();for(let i=0;i<6;i++)f.tap(i);await flush();
  assert.equal(f.$('celebration-count').textContent,'6 / 6');assert.equal(f.$('solved-total').textContent,'2');assert.match(f.$('celebration-title').textContent,/모든 그림/);
  assert.deepEqual(f.scores,[{owner:userId,stage:82},{owner:userId,stage:1}]);
  f.w.JJUDA_PUZZLES[1].artwork.sourceUrl='javascript:alert(1)';f.select(1);
  assert.equal(f.$('artwork-credit').querySelector('a'),null,'non-HTTPS source URLs never become links');
 }finally{f.w.close();}
 const review=domFixture();try{
  review.$('start').click();review.$('reveal-answers').click();
  assert.equal(review.$('answer-count').textContent,'다른 곳 10개');assert.equal(review.$('review-answers').children.length,10);
  assert.equal(review.w.document.querySelectorAll('.answer-mark').length,40);assert.equal(review.round().status,'ready');assert.equal(review.round().deadline,null);
  assert.match(review.$('message').textContent,/정답 10곳/);assert.deepEqual(review.scores,[]);assert.deepEqual(review.requests,[]);
  review.$('close-answers').click();assert.equal(review.round().status,'playing');
 }finally{review.w.close();}
 const pending={kind:'hint',spot:9,requestId,userId};
 const recovery=domFixture({version:2,current:1,found:{82:[...Array(9).keys()]},rounds:{82:{...core.freshRound(),status:'payment',hearts:1,remainingMs:1000,totalMs:120000,paid:[0,8],hintIndex:8,timeBought:true,assisted:true,rankOwner:userId,pending}}});
 try{
  assert.equal(recovery.round().status,'payment');assert.deepEqual(recovery.round().pending,pending);
  assert.equal(recovery.state().current,1);assert.deepEqual(recovery.state().order,[0,1],'receipt recovery does not move its picture to the first position');
  assert.deepEqual(recovery.state().found[82],[],'returning keeps only the unresolved receipt, not previous finds');
  assert.equal(recovery.round().remainingMs,60000);assert.equal(recovery.round().totalMs,60000);assert.equal(recovery.round().hearts,3);
  assert.deepEqual(recovery.round().paid,[]);assert.equal(recovery.round().hintIndex,null);assert.equal(recovery.round().timeBought,false);assert.equal(recovery.round().assisted,false,'confirmed help belongs to the previous round');
  assert.equal(recovery.round().rankOwner,userId,'the unresolved receipt keeps its original owner');
  recovery.$('start').click();await flush();
  assert.equal(recovery.requests.length,1);assert.deepEqual(recovery.requests[0],{...pending,stage:82});
  assert.equal(recovery.round().pending,null);assert.deepEqual(recovery.round().paid,[9]);assert.equal(recovery.round().status,'playing');
  assert.equal(recovery.w.document.querySelectorAll('.hint-mark[data-hint-key="82:9"]').length,4);
 }finally{recovery.w.close();}
}

function checkLayerClipping(){
 const f=domFixture();try{
  const polygon=[[10,10],[30,10],[20,25]];
  const invalid=[null,[],[[10,10],[30,10]],[[10,10],[30,10],[101,25]],[[10,10],[30,10],[-1,25]],[[10,10],[30,10],[NaN,25]],[[10,10],[30,10],[Infinity,25]],[[10,10],[30,10],['20%; url(x)',25]],[[10,10],[30,10],[20,25,40]]];
  const layer=clipPolygon=>({image:'/landscape.svg',blend:'color',regions:[{shape:'rect',x:20,y:20,rx:12,ry:12,spotIndex:0,feather:.12}],...(clipPolygon===undefined?{}:{clipPolygon})});
  f.w.JJUDA_PUZZLES[1].layers=[layer(polygon),layer(),...invalid.map(layer)];f.select(1);
  for(const id of ['difference','zoom-difference']){
   const overlays=[...f.$(id).parentElement.querySelectorAll('.contrast-overlay')];
   assert.equal(overlays.length,invalid.length+2);
   assert.equal(overlays[0].style.clipPath,'polygon(10% 10%,30% 10%,20% 25%)','valid explicit color clips apply in both normal and zoom views');
   assert.match(overlays[0].style.maskImage,/linear-gradient/,'polygon clipping keeps the existing feathered mask');
   assert.equal(overlays[0].style.mixBlendMode,'color');
   assert.ok(overlays.slice(1).every(image=>image.style.clipPath===''),'absent or malformed polygons preserve the previous un-clipped layer behavior');
  }
  assert.equal(f.$('original').parentElement.querySelectorAll('.contrast-overlay').length,0,'the original picture is never clipped');
  assert.equal(f.$('found-total').textContent,'10','visual clipping does not alter answer counts');
 }finally{f.w.close();}
}

async function checkRenderedCircles(){
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.addInitScript(({userId})=>{
   const account={ready:true,userId,coins:100};
   window.JjudaWallet={getState:()=>account,subscribe:fn=>fn(account),refresh:async()=>{},recordClear:async()=>({ok:true}),buy:async(request,stage)=>({ok:true,kind:request.kind,stage,spot:request.spot,price:1})};
  },{userId});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/puzzles.js'))return route.fulfill({contentType:'text/javascript',body:`window.JJUDA_PUZZLES=${JSON.stringify(fixtures)};`});
   if(url.origin!=='https://fixture.test'||/\/(photo-puzzles|masterpiece-puzzles|wallet|supabase)\.js$/.test(url.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
   if(['/portrait.svg','/landscape.svg'].includes(url.pathname)){
    const [width,height]=url.pathname==='/portrait.svg'?[800,1200]:[1500,1000];
    return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#e7ecef"/></svg>`});
   }
   const file=path.join(root,url.pathname);
   return fs.existsSync(file)?route.fulfill({path:file,contentType:file.endsWith('.js')?'text/javascript':undefined}):route.fulfill({status:404,body:''});
  });
  await page.goto('https://fixture.test/games/spot-difference/index.html');await page.waitForFunction(()=>!document.querySelector('#start').disabled);
  for(const index of [0,1]){
   await page.locator('#stage-picker').evaluate((select,index)=>{select.value=String(index);select.dispatchEvent(new Event('change'));},index);
   await page.waitForFunction(()=>!document.querySelector('#start').disabled);await page.locator('#start').click();
   await page.locator('#original').evaluate(im=>{
    const p=JJUDA_PUZZLES[Number(document.querySelector('#stage-picker').value)],r=im.parentElement.getBoundingClientRect(),s=p.spots[0];
    const event={bubbles:true,clientX:r.x+r.width*s.x/100,clientY:r.y+r.height*s.y/100};
    im.parentElement.dispatchEvent(new PointerEvent('pointerdown',event));im.parentElement.dispatchEvent(new MouseEvent('click',event));
   });
   await page.locator('#hint').click();await page.waitForFunction(()=>document.querySelectorAll('.hint-mark').length===4);
   await page.locator('#zoom').click();await page.waitForTimeout(250);
   const ratio=fixtures[index].aspectRatio||1.5;
   for(const actual of await page.locator('#original,#difference,#zoom-original,#zoom-difference').evaluateAll(images=>images.map(im=>{const r=im.getBoundingClientRect();return r.width/r.height;})))assert.ok(Math.abs(actual-ratio)<.001,'normal and zoom pictures preserve their aspect ratio');
   const marks=await page.locator('.mark').evaluateAll(nodes=>nodes.map(mark=>{const r=mark.getBoundingClientRect(),style=getComputedStyle(mark);return {width:r.width,height:r.height,text:mark.textContent,hint:mark.classList.contains('hint-mark'),border:style.borderWidth,color:style.borderColor,shape:style.borderStyle};}));
   assert.equal(marks.length,8,'found and hint rings appear on all four pictures');
   for(const mark of marks){
    assert.ok(mark.width>0&&Math.abs(mark.width-mark.height)<.1,'portrait and landscape markers stay circular');assert.equal(mark.text,'');
    if(mark.hint){assert.equal(mark.shape,'dashed');assert.equal(mark.border,'3px');}
    else{assert.equal(mark.border,'2px');assert.equal(mark.color,'rgb(229, 57, 53)');}
   }
   await page.locator('#close-zoom').click();
  }
  assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();}
}

(async()=>{
 checkPreciseTargetBounds();checkProgressNormalization();checkLayerClipping();await checkRuntime();await checkRenderedCircles();
 console.log('PASS: precise masterpiece edit hits without changing legacy ellipses, safe optional layer clipping, six/ten-answer completion, stage82 single recording, spot9 hint/receipt recovery, safe artwork credits, ten-answer review, portrait/landscape circles in normal and zoom views');
})().catch(error=>{console.error(error);process.exitCode=1;});
