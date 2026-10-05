const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const world=fs.readFileSync(path.join(root,'world.html'),'utf8');
const refresh=world.slice(world.indexOf('function worldRefreshKey(){'),world.indexOf('async function gm(t){'));
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><main class="main"><h2 id="target">메뉴</h2><input id="draft" value="작성 중"><div id="inner" style="overflow:auto;height:80px"><div style="height:500px">스크롤</div></div><iframe></iframe></main>');
  await page.addScriptTag({content:fs.readFileSync(path.join(root,'world-pull-refresh.js'),'utf8')});
  await page.addScriptTag({content:`
   var D={online:true,user:{id:'member'}},g={tab:'my',place:{id:'cafe',me:{gx:3,gy:7}}},L={area:'content',tab:'posts'},worldNavigation=null,worldHouseClose=null,worldParkNotes=null;
   window.reads=0;window.renders=0;window.waitRefresh=null;window.failRefresh=false;
   async function _d(){reads++;if(waitRefresh)await waitRefresh;if(failRefresh)throw Error('offline');}
   async function Ls(){}async function ke(){}function H(){renders++;document.querySelector('#draft').value='server';}
   function adminCanLeave(){return true;}var sr={'adm-refresh':async()=>{reads++;}};
   ${refresh}
   var worldPullRefresh=OjjudaWorldPullRefresh.install({key:worldRefreshKey,refresh:refreshWorldView});
   window.attachChild=()=>worldPullRefresh.attachDocument(document.querySelector('iframe').contentDocument);
  `});
  async function touch(selector,dx=0,dy=110,options={}){
   await page.evaluate(({selector,dx,dy,options})=>{
    const doc=options.child?document.querySelector('iframe').contentDocument:document,el=doc.querySelector(selector);
    const point=(x,y)=>new Touch({identifier:1,target:el,clientX:x,clientY:y});
    el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[point(100,100)],changedTouches:[point(100,100)]}));
    el.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[point(100+dx,100+dy)],changedTouches:[point(100+dx,100+dy)]}));
    el.dispatchEvent(new TouchEvent(options.cancel?'touchcancel':'touchend',{bubbles:true,touches:[],changedTouches:[point(100+dx,100+dy)]}));
   },{selector,dx,dy,options});
  }
  const cdp=await context.newCDPSession(page),box=await page.locator('#target').boundingBox(),x=box.x+30,y=box.y+10;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*14}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForFunction(()=>renders===1);
  await page.evaluate(()=>{reads=0;renders=0;});
  await touch('#target');await page.waitForFunction(()=>renders===1);
  assert.deepEqual(await page.evaluate(()=>({tab:g.tab,position:g.place.me,draft:document.querySelector('#draft').value,reads})),{tab:'my',position:{gx:3,gy:7},draft:'작성 중',reads:1});
  for(const args of [['#target',0,30],['#target',110,10],['#target',0,-110],['#target',0,110,{cancel:true}],['#draft']])await touch(...args);
  await page.evaluate(()=>document.querySelector('#inner').scrollTop=40);await touch('#inner');
  await page.evaluate(()=>{const d=document.createElement('div');d.role='dialog';d.textContent='dialog';document.body.append(d)});await touch('#target');await page.locator('[role=dialog]').evaluate(el=>el.remove());
  assert.equal(await page.evaluate(()=>reads),1,'scroll, horizontal, short, cancelled, editable and modal gestures do not refresh');
  await page.evaluate(()=>{waitRefresh=new Promise(resolve=>window.finishRefresh=resolve);});await touch('#target');await touch('#target');assert.equal(await page.evaluate(()=>reads),2,'only one refresh at a time');
  await page.evaluate(()=>{g.tab='life';finishRefresh();waitRefresh=null;});await page.waitForFunction(()=>document.querySelector('.world-pull-indicator').hidden);assert.equal(await page.evaluate(()=>renders),1,'a late refresh cannot repaint a new route');
  await page.evaluate(()=>failRefresh=true);await touch('#target');await page.waitForFunction(()=>document.querySelector('.world-pull-indicator').textContent.includes('못했어요'));assert.equal(await page.evaluate(()=>g.tab),'life');
  await page.evaluate(()=>{failRefresh=false;const doc=document.querySelector('iframe').contentDocument;doc.body.innerHTML='<p id="child">우리집 기록</p>';attachChild();g.tab='home';worldHouseClose=()=>{};worldHouseClose.refresh=async()=>{window.childRefreshes=(window.childRefreshes||0)+1;return true;};document.querySelector('iframe').parentElement.setAttribute('data-house-mount','');doc.defaultView.OjjudaHouseRefresh=async()=>{window.childRefreshes=(window.childRefreshes||0)+1;return true;};});
  await touch('#child',0,110,{child:true});await page.waitForFunction(()=>childRefreshes===1);assert.equal(await page.evaluate(()=>g.tab),'home');
  assert.deepEqual(errors,[]);console.log('PULL REFRESH PASS: current route/position/drafts, nested frame, ordinary scrolling, horizontal gestures, short/cancel/multirun guards, errors and route races');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
