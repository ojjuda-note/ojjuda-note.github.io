const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const {execFileSync} = require('node:child_process');
const {calendarCases,selectCalendarDate,palette,distinctPalettes}=require('./theme-browser-helpers.cjs');
const themeOnly=process.env.PAJANG_THEME_ONLY==='1';
const navigationOnly=process.env.PAJANG_NAVIGATION_ONLY==='1';
const previousRelease='71785aabf407ca239a27b4811e252a962a725717';
const startupDelayMs=180;

const feature = path.resolve(__dirname, '../features/pajang');
const origin = 'https://pajang.test';
const project = '/features/pajang/';
const me = {id:'me',name:'보리',age:29,region:'서울특별시',interest:'coffee',body:'같이 걸을래요.',at:1};
const state = {day:'2026-11-17',slot:'pm',question:{id:1,q:['처음 만난 날, 어떤 이야기를 나누고 싶나요?']},
  nextAt:new Date(Date.now()+3600000).toISOString(),authenticated:true,remaining:3,signals:[],messages:[],people:[],me};
const base = {region:'서울특별시',day:'2026-11-17',slot:'am',at:1,sent:false,received:false,own:false};
const rows = [
  {...base,peer:'a',name:'은하',interest:'book',question:'쉬는 날을 같이 보낸다면 어디에 가고 싶나요?',body:'동네 책방에 들러서 서로에게 어울리는 책을 한 권씩 골라주고 싶어요.'},
  {...base,peer:'b',name:'단비',interest:'walk',question:'쉬는 날을 같이 보낸다면 어디에 가고 싶나요?',body:'나란히 걸으면서 같은 풍경을 보고 웃을 때요.'},
];
const signalOffers=[[1,10,2],[3,28,2],[5,45,2],[10,85,1],[20,160,1],[30,225,1]]
  .map(([quantity,price,revision])=>({id:'signal_'+quantity,quantity,price,revision}));
const toolbarAssets=[
  '/shared/brand/service-header.css','/note/notifications.js','/note/notifications.css',
  '/shared/share/page-share.js','/shared/share/page-share.css',
  '/shared/auth/invite-referral.js',
  '/features/wallet/ju-charge.js','/features/wallet/ju-charge.css','/ju-coins/ju-coins.css',
  ...['coin','10','30','50','100','300','500'].map(name=>'/ju-coins/'+name+'.svg')
];

async function checkServiceHeader(page,width) {
  await page.waitForFunction(()=>document.querySelector('[data-pajang-balance]')?.textContent==='129,447');
  const result=await page.locator('.pajang-mast').evaluate(header=>{
    const rect=node=>{const {left,right,top,bottom,width,height}=node.getBoundingClientRect();return {left,right,top,bottom,width,height};};
    const visible=node=>node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden';
    const brand=header.querySelector('.ojjuda-service-brand'),actions=header.querySelector('.ojjuda-service-actions');
    const invite=header.querySelector('[data-share-page="pajang"]');
    const nodes=[brand,actions,header.querySelector('.ojjuda-service-home'),invite,header.querySelector('[data-notifications-open]'),header.querySelector('[data-ju-charge-open]')];
    const navigation=document.querySelector('#station .station-nav');
    return {brand:rect(brand),actions:rect(actions),visible:nodes.every(visible),bounds:nodes.map(rect),
      controls:[invite,header.querySelector('[data-notifications-open]'),header.querySelector('[data-ju-charge-open]')].map(rect),
      nav:navigation&&visible(navigation)?rect(navigation):null,inviteText:invite.innerText,
      scrollWidth:document.documentElement.scrollWidth,
      flex:getComputedStyle(header.querySelector('.ojjuda-service-header')).display,
      styles:[...document.styleSheets].map(sheet=>new URL(sheet.href||location.href).pathname)};
  });
  assert.equal(result.flex,'flex','the shared header stylesheet is active at '+width+'px');
  assert.ok(result.visible,'brand, invitation, notification and balance controls are visible at '+width+'px');
  assert.equal(result.inviteText,'초대','the invitation label remains visible at '+width+'px');
  assert.ok(result.scrollWidth<=width+1,'the page has no horizontal overflow at '+width+'px');
  assert.ok(result.brand.right<=result.actions.left+1,'brand and account controls do not overlap at '+width+'px: '+JSON.stringify(result));
  assert.ok(result.bounds.every(box=>box.width>0&&box.height>0&&box.left>=-1&&box.right<=width+1),'all header controls fit at '+width+'px');
  const overlaps=(a,b)=>a.left<b.right-1&&b.left<a.right-1&&a.top<b.bottom-1&&b.top<a.bottom-1;
  for(let i=0;i<result.controls.length;i++)for(let j=i+1;j<result.controls.length;j++)
    assert.equal(overlaps(result.controls[i],result.controls[j]),false,'header controls do not overlap at '+width+'px: '+JSON.stringify(result));
  if(result.nav)for(const box of [result.brand,result.actions])
    assert.equal(overlaps(result.nav,box),false,'station navigation clears the header controls at '+width+'px: '+JSON.stringify(result));
  for(const stylesheet of ['/shared/brand/service-header.css','/shared/share/page-share.css','/features/pajang/account-toolbar.css','/features/pajang/signal-purchase.css'])
    assert.ok(result.styles.includes(stylesheet),'fixture serves '+stylesheet);
}

async function checkSignalPurchaseLayout(page,dir) {
  const menu=page.getByRole('navigation',{name:'파장 메뉴'});
  await page.evaluate(()=>window.setSignalQuota(3));
  await menu.getByRole('link',{name:'내 파장',exact:true}).click();
  await page.getByRole('region',{name:'파장 설정',exact:true}).getByRole('button',{name:'신호 구매',exact:true}).click();
  const prepaid=page.getByRole('dialog',{name:'추가 신호 구매',exact:true});
  await prepaid.locator('.signal-offers label').nth(5).waitFor();
  assert.match(await prepaid.locator('.signal-wallet-note').textContent(),/오늘 무료 3개/);
  assert.equal(await prepaid.locator('button[type="submit"]').isDisabled(),true,'pre-purchasing still requires an explicit pack choice');
  await prepaid.locator('input[name="signal-pack"][value="signal_3"]').check();
  await prepaid.locator('button[type="submit"]:enabled').waitFor();
  assert.equal(await prepaid.locator('button[type="submit"]').textContent(),'28쭈로 신호 3개 구매');
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    assert.ok(await prepaid.evaluate(el=>el.scrollWidth<=el.clientWidth),'pre-purchase offers fit the mobile dialog');
    await prepaid.screenshot({path:path.join(dir,'signal-purchase-with-free-'+width+'.png'),animations:'disabled'});
  }
  assert.equal(await page.evaluate(()=>window.signalPurchaseCalls.length),0,'opening and selecting a pack with free signals never buys automatically');
  await prepaid.getByRole('button',{name:'닫기',exact:true}).click();await prepaid.waitFor({state:'detached'});
  await page.getByRole('heading',{name:'내 파장',exact:true}).waitFor();
  await menu.getByRole('link',{name:'오늘',exact:true}).click();
  await page.locator('#answers .cardgrid[aria-busy="false"]').waitFor();
  await page.evaluate(()=>window.setSignalQuota(0));
  await page.getByRole('button',{name:'신호 더하기',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'추가 신호 구매',exact:true});
  await dialog.locator('.signal-offers label').nth(5).waitFor();
  assert.deepEqual(await dialog.locator('.signal-offers strong').allTextContents(),signalOffers.map(offer=>'신호 '+offer.quantity+'개'));
  assert.deepEqual(await dialog.locator('.signal-offers b').allTextContents(),signalOffers.map(offer=>offer.price+'쭈'));
  for(const width of [320,390,1080]){
    await page.setViewportSize({width,height:844});
    const layout=await dialog.locator('.signal-offers').evaluate(grid=>{
      const css=getComputedStyle(grid),dialog=grid.closest('dialog'),box=dialog.getBoundingClientRect();
      const packs=[...grid.querySelectorAll('label')].map(label=>{const {left,right,top,bottom,height}=label.getBoundingClientRect();return {left,right,top,bottom,height};});
      return {display:css.display,columns:css.gridTemplateColumns.trim().split(/\s+/).length,
        inside:box.left>=-.5&&box.right<=innerWidth+.5,overflow:dialog.scrollWidth>dialog.clientWidth,packs};
    });
    assert.equal(layout.display,'grid');assert.equal(layout.columns,3,'six offers keep three columns at '+width+'px');
    assert.ok(layout.inside&&!layout.overflow,'the purchase dialog fits at '+width+'px');
    assert.ok(layout.packs.every(pack=>pack.height>=44&&pack.left>=0&&pack.right<=width+1));
    assert.ok(Math.abs(layout.packs[0].top-layout.packs[2].top)<1&&layout.packs[3].top>=layout.packs[0].bottom,
      'six offers use two rows at '+width+'px');
    await dialog.screenshot({path:path.join(dir,'signal-purchase-'+width+'.png'),animations:'disabled'});
  }
  assert.equal(await page.evaluate(()=>window.signalPurchaseCalls.length),0,'viewing the catalogue never purchases signals');
  await dialog.getByRole('button',{name:'닫기',exact:true}).click();await dialog.waitFor({state:'detached'});
  await page.evaluate(()=>window.setSignalQuota(3));
  await page.waitForFunction(()=>document.querySelector('.budget b')?.textContent==='3 / 3');
  await page.locator('#answers .cardgrid[aria-busy="false"]').waitFor();
}

function checkStartupRequests(trace,version,scenario) {
  if(scenario==='new')return;
  const detail=version+' '+scenario+' '+JSON.stringify(trace);
  function request(name) {
    const matches=trace.filter(item=>item.name===name);
    assert.equal(matches.length,1,'one '+name+' startup request: '+detail);
    assert.ok(Number.isFinite(matches[0].end),'completed '+name+' startup request: '+detail);
    return matches[0];
  }
  function overlaps(first,second) {
    const a=request(first),b=request(second);
    const duration=Math.min(a.end,b.end)-Math.max(a.start,b.start);
    assert.ok(duration>startupDelayMs/2,first+' overlaps '+second+' by more than half a mocked wait: '+detail);
  }
  const manifest=request('manifest'),program=request('program');
  assert.ok(program.start>=manifest.end,'program waits for its manifest: '+detail);
  if(version==='before') {
    assert.ok(manifest.start>=request('member:entry').end,'baseline authorizes the program after entry: '+detail);
  } else {
    const initial=scenario==='member-cold'?'member:entry':'member:state';
    overlaps('identity',initial);
    overlaps('manifest',initial);
    overlaps('manifest','identity');
    overlaps('program',scenario==='member-cold'?'member:state':'feed');
  }
}

async function checkPeopleLayout(view) {
  await view.locator('.scope-person').evaluateAll(nodes=>Promise.all(nodes.flatMap(node=>node.getAnimations())
    .filter(animation=>animation.effect?.getComputedTiming().iterations!==Infinity)
    .map(animation=>animation.finished.catch(()=>{}))));
  const result=await view.locator('.radar-scope').evaluate(scope=>{
    const bounds=scope.getBoundingClientRect();
    const box=node=>{
      const r=node.getBoundingClientRect();
      return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
    };
    const inside=r=>r.left>=bounds.left-.5&&r.right<=bounds.right+.5&&r.top>=bounds.top-.5&&r.bottom<=bounds.bottom+.5;
    const visible=node=>!!node&&node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden'&&Number(getComputedStyle(node).opacity)>0;
    const clear=color=>color==='transparent'||color==='rgba(0, 0, 0, 0)';
    const people=[...scope.querySelectorAll('.scope-person')].map(node=>{
      const name=node.querySelector('.scope-person-name'),dot=node.querySelector('.scope-person-dot'),rect=box(node),css=getComputedStyle(node),radius=css.borderRadius;
      const dotBox=dot?box(dot):null,dotCss=dot?getComputedStyle(dot):null;
      return {name:node.getAttribute('aria-label'),box:rect,inside:inside(rect),compact:node.classList.contains('scope-person-compact'),
        initial:name?.textContent.trim(),nameVisible:visible(name),nameFits:!!name&&inside(box(name)),font:name?Number.parseFloat(getComputedStyle(name).fontSize):0,
        circle:Math.abs(rect.width-rect.height)<1&&(radius==='50%'||Number.parseFloat(radius)>=rect.width/2-.5),icons:node.querySelectorAll('svg,.scope-person-avatar').length,
        transparentTarget:clear(css.backgroundColor)&&css.backgroundImage==='none'&&css.boxShadow==='none'&&['Top','Right','Bottom','Left'].every(edge=>clear(css['border'+edge+'Color'])||Number.parseFloat(css['border'+edge+'Width'])===0),
        dot:dotBox&&{...dotBox,visible:visible(dot),inside:inside(dotBox),filled:!clear(dotCss.backgroundColor),
          circle:Math.abs(dotBox.width-dotBox.height)<.5&&(dotCss.borderRadius==='50%'||Number.parseFloat(dotCss.borderRadius)>=dotBox.width/2-.5),
          centered:Math.abs(dotBox.left+dotBox.width/2-rect.left-rect.width/2)<.5&&Math.abs(dotBox.top+dotBox.height/2-rect.top-rect.height/2)<.5}};
    });
    const boxes=[...people.map(p=>({name:p.name,box:p.box})),{name:'나',box:box(scope.querySelector('.scope-self'))}];
    const overlaps=[];
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i].box,b=boxes[j].box;
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlaps.push([boxes[i].name,boxes[j].name]);
    }
    return {people,overlaps};
  });
  assert.ok(result.people.every(p=>p.inside&&p.box.width>=24&&p.box.height>=24),'every person keeps a generous touch target inside the dial: '+JSON.stringify(result.people));
  assert.ok(result.people.every(p=>p.initial&&Array.from(p.initial).length===1&&p.circle&&p.icons===0),'every person keeps one initial and no person icon');
  assert.ok(result.people.every(p=>p.compact?
    !p.nameVisible&&p.transparentTarget&&p.dot?.visible&&p.dot.inside&&p.dot.filled&&p.dot.circle&&p.dot.centered&&p.dot.width>=8&&p.dot.width<=14&&p.dot.width<p.box.width/2:
    p.nameVisible&&p.nameFits&&p.font>=12&&!p.dot?.visible),'crowded people show only small dots; separate people show readable initials: '+JSON.stringify(result.people));
  assert.deepEqual(result.overlaps,[],'person markers and the self marker do not cover one another');
}

async function checkCompass(view, selector, labelSelector, markerSelector, centerSelector) {
  const dial=view.locator(selector);
  const labels=['북','북동','동','남동','남','남서','서','북서'];
  assert.deepEqual(await dial.locator(labelSelector).allTextContents(),labels);
  const markerModes=()=>dial.locator('.scope-person').evaluateAll(nodes=>nodes.map(node=>[node.getAttribute('aria-label'),node.classList.contains('scope-person-compact')]));
  const modesBefore=selector==='.radar-scope'?await markerModes():null;
  const centerBefore=centerSelector?await dial.locator(centerSelector).evaluateAll(nodes=>nodes.map(node=>{
    const box=node.getBoundingClientRect(),scope=node.closest('.radar-scope').getBoundingClientRect();
    return {name:node.getAttribute('aria-label')||node.textContent.trim(),point:[box.x+box.width/2-scope.x,box.y+box.height/2-scope.y]};
  })):null;
  await view.getByRole('button',{name:'휴대폰 방향 켜기'}).click();
  const stop=view.getByRole('button',{name:'북쪽 고정하기'});
  await stop.waitFor();
  for(const heading of [0,1,359,1,45,90,135,180,225,270,315]){
    const sensor=await dial.evaluate((el,heading)=>{
      const win=el.ownerDocument.defaultView;
      function send(){
        const screenAngle=win.screen.orientation?.angle??win.orientation??0;
        win.dispatchEvent(Object.assign(new Event('deviceorientationabsolute'),{
          absolute:true,alpha:(screenAngle-heading+360)%360,beta:0,gamma:0
        }));
      }
      send();
      return win.setInterval(send,50);
    },heading);
    try{
      await view.getByText(new RegExp('위(?:쪽)? · '+labels[Math.round(heading/45)%8]+'쪽$')).waitFor();
      await view.waitForFunction(({selector,heading})=>{
        const scope=document.querySelector(selector),compass=scope?.querySelector('.radar-compass');
        const drawn=compass?-Number(compass.getAttribute('transform')?.match(/rotate\(([-\d.]+)/)?.[1]):
          Number.parseFloat(scope?.querySelector('.rose')?.style.getPropertyValue('--heading'));
        return Number.isFinite(drawn)&&Math.abs((drawn-heading+540)%360-180)<.25;
      },{selector,heading});
    }finally{
      await dial.evaluate((el,id)=>el.ownerDocument.defaultView.clearInterval(id),sensor);
    }
    const geometry=await dial.evaluate((el,{labelSelector,markerSelector})=>{
      const rect=el.getBoundingClientRect();
      function point(node){
        const p=node.getBoundingClientRect();
        let cx=p.x+p.width/2,cy=p.y+p.height/2;
        if(node.tagName.toLowerCase()==='line'){
          const anchor=node.ownerSVGElement.createSVGPoint();
          anchor.x=node.x1.baseVal.value;anchor.y=node.y1.baseVal.value;
          const rendered=anchor.matrixTransform(node.getScreenCTM());cx=rendered.x;cy=rendered.y;
        }
        const x=cx-rect.x-rect.width/2, y=cy-rect.y-rect.height/2;
        return {angle:(Math.atan2(x,-y)*180/Math.PI+360)%360,
          inside:node.tagName.toLowerCase()==='line'?cx>=rect.left&&cx<=rect.right&&cy>=rect.top&&cy<=rect.bottom:
            p.left>=rect.left && p.right<=rect.right && p.top>=rect.top && p.bottom<=rect.bottom};
      }
      return {labels:[...el.querySelectorAll(labelSelector)].map(point),person:point(el.querySelector(markerSelector))};
    },{labelSelector,markerSelector});
    function difference(a,b){return Math.abs((a-b+540)%360-180);}
    geometry.labels.forEach((v,i)=>{
      assert.ok(v.inside && difference(v.angle,i*45-heading)<3,'방위 위치: '+labels[i]+' / '+heading+' '+JSON.stringify(v));
    });
    assert.ok(geometry.person.inside&&difference(geometry.person.angle,315-heading)<3,'북서쪽 사람의 근사 방위 기준점이 휴대폰 방향에 맞춰 이동');
    if(centerSelector){
      const centers=await dial.locator(centerSelector).evaluateAll(nodes=>nodes.map(node=>{
        const box=node.getBoundingClientRect(),scope=node.closest('.radar-scope').getBoundingClientRect();
        return {name:node.getAttribute('aria-label')||node.textContent.trim(),point:[box.x+box.width/2-scope.x,box.y+box.height/2-scope.y]};
      }));
      assert.deepEqual(centers.map(p=>p.name),centerBefore.map(p=>p.name));
      assert.ok(centers.every((p,j)=>p.point.every((value,i)=>Math.abs(value-centerBefore[j].point[i])<1)),'고정 배치한 원은 방향 변화와 북쪽 경계의 센서 흔들림에도 이동하지 않음');
    }
    if(selector==='.radar-scope'){
      await checkPeopleLayout(view);
      assert.deepEqual(await markerModes(),modesBefore,'compass rotation and north-boundary noise never switch dots and initial circles');
    }
  }
  await stop.click();
  await view.getByText('북쪽 고정',{exact:true}).waitFor();
}

async function checkRadarMotion(page,selector){
  const dial=page.locator(selector);
  const motion=()=>dial.evaluate(el=>['::before','::after'].map(pseudo=>{
    const css=getComputedStyle(el,pseudo);
    return {name:css.animationName,duration:css.animationDuration,delay:css.animationDelay,opacity:Number(css.opacity),pointerEvents:css.pointerEvents};
  }));
  const animated=await motion();
  assert.deepEqual(animated.map(v=>[v.name,v.duration,v.delay]),[['pajang-ripple','9.6s','0s'],['pajang-ripple','9.6s','-4.8s']],
    'two outward waves move at half speed while preserving their spacing');
  assert.ok(animated.every(v=>v.pointerEvents==='none'),'waves never cover profile tap targets');
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.ok((await motion()).every(v=>v.name==='none'&&v.opacity>0),'reduced motion retains visible static rings');
  await page.emulateMedia({reducedMotion:'no-preference'});
}

function clientFixture(hash) {
  return `
    const state=${JSON.stringify(state)}, rows=${JSON.stringify(rows)};
    const signalOffers=${JSON.stringify(signalOffers)},walletCoins=129447;
    state.freeRemaining=state.remaining;state.paidRemaining=0;state.purchasingEnabled=true;
    window.walletReads=[];window.toolbarCalls=[];window.signalPurchaseCalls=[];
    window.setSignalQuota=remaining=>{state.remaining=remaining;state.freeRemaining=remaining;document.dispatchEvent(new Event('visibilitychange'));};
    const signalWallet=()=>({ok:true,coins:walletCoins,remaining:state.remaining,freeRemaining:state.freeRemaining,
      paidRemaining:state.paidRemaining,purchasingEnabled:true,offers:signalOffers});
    const boundRead=data=>{const query=Promise.resolve({data});query.setHeader=()=>query;query.abortSignal=()=>query;return query;};
    state.locationEnabled=localStorage.locationEnabled!=='false';
    state.locationVersion=Number(localStorage.locationVersion||0);
    window.geoWrites=[];
    window.geoReadCount=0;
    const nativePosition=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    Object.defineProperty(navigator.geolocation,'getCurrentPosition',{configurable:true,value:(ok,fail,options)=>{
      window.geoReadCount++;
      if(sessionStorage.holdEntryLocation==='yes'){
        window.finishEntryLocation=()=>ok({coords:{latitude:37.5665,longitude:126.978,accuracy:30}});
      }else nativePosition(ok,fail,options);
    }});
    if(sessionStorage.holdEntryLocation==='yes')state.radarOn=false;
    const flightCheck=new URLSearchParams(location.search).get('flight-check');
    const mode=flightCheck||sessionStorage.fixtureMode||'member';
    // Pajang person IDs and Auth user IDs deliberately differ, including for administrators.
    const accepted=sessionStorage.accepted==='yes';
    const friend={id:'peer1',name:'라온',age:28,interest:'walk',region:'경기도',body:'함께 걸어요.',range:15,bearing:315};
    const offered={id:'peer2',name:'유진',age:30,interest:'book',region:'서울특별시'};
    const nearDirection={id:'near-northwest',name:'가온',interest:'walk',region:'서울특별시',body:'가까운 공원에서 걸어요.',range:1,bearing:315};
    const sameCell=[
      {id:'nearby1',name:'도담',interest:'coffee',region:'서울특별시',body:'동네에서 따뜻한 차를 마셔요.',range:1,sameCell:true},
      {id:'nearby2',name:'소담',interest:'book',region:'서울특별시',body:'가까운 책방에서 만나요.',range:1,sameCell:true},
      {id:'nearby3',name:'한별',interest:'walk',region:'서울특별시',body:'같은 동네의 산책길을 나눠요.',range:1,sameCell:true},
    ];
    const privateDirection={id:'private1',name:'새롬',interest:'walk',region:'서울특별시',body:'방향은 공유하지 않아요.',range:3};
    window.setNearbyCount=(count,directionCount=1)=>{
      const farther=[friend,...['다온','해솔'].slice(0,directionCount-1).map((name,i)=>({...friend,id:'farther'+i,name}))];
      state.people=[...farther,offered,...sameCell.slice(0,count),nearDirection,privateDirection];
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.setDenseRadar=(sameCount=0)=>{
      const names=['그루','다온','보미','세봄','아라','여울','이든','지우','채원','하늘','별빛','햇살가득한아주긴닉네임'];
      state.people=[1,3,7,15].flatMap((range,band)=>Array.from({length:3},(_,j)=>{
        if(band===0&&j<sameCount)return sameCell[j];
        const i=band*3+j;
        return {id:'dense-'+i,name:names[i],interest:['coffee','book','walk'][j],region:'서울특별시',body:'한 방향에 모인 사람도 따로 보여요.',range,bearing:315};
      }));
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.setSparseRadar=(count=5)=>{
      const spots=[[1,315],[3,90],[7,180],[15,270],[7,45],[15,225]];
      const names=['나래','다솜','라임','마루','바다','새봄'];
      state.people=[...spots.slice(0,count).map(([range,bearing],i)=>({id:'sparse-'+i,name:names[i],interest:'walk',region:'서울특별시',body:'서로 떨어진 사람은 첫 글자로 보여요.',range,bearing})),privateDirection];
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.setSameCellOverlap=()=>{
      state.people=[sameCell[0],{...nearDirection,bearing:270},privateDirection];
      document.dispatchEvent(new Event('visibilitychange'));
    };
    window.setNearbyCount(2);state.signals=[{src:'me',dst:'peer1'},{src:'peer1',dst:'me'},{src:'peer2',dst:'me'}];
    if(accepted)state.signals.push({src:'me',dst:'peer2'});
    const entry={...state,joined:mode!=='new',body:mode==='new'?'':state.me.body,nickname:'보리',
      question:{...state.question,answers:['책을 골라요.','같이 걸어요.','커피를 마셔요.']}};
    delete entry.me;
    if(mode==='new'||mode==='unanswered'){state.me.body='';entry.body='';}
    window.feedCalls=[];window.heldGender=null;window.releaseFeed=null;
    const messages=[{id:'1',src:'peer1',dst:'me',body:'안녕하세요!',at:1}];
    window.authCalls=0;window.artCalls=[];window.memberCalls=[];window.answerWrites=[];window.sendIds=[];window.programCalls=0;
    window.accountWrites=[];window.profileReads=[];window.adminChecks=0;
    let authSession=mode==='guest'?null:{user:{id:mode==='switched'?'next-member':'member'},access_token:'fixture-token'};
    const authListeners=new Set();
    const db={
      auth:{getUser:async()=>{window.authCalls++;if(flightCheck||sessionStorage.holdEntryIdentity==='yes')await new Promise(resolve=>{window.finishFlight=resolve;});return {data:{user:mode==='guest'?null:{id:'member'}}};},
        getSession:async()=>({data:{session:authSession}}),
        onAuthStateChange:listener=>{authListeners.add(listener);return {data:{subscription:{unsubscribe(){authListeners.delete(listener);}}}};},
        signOut:async options=>{window.accountWrites.push({action:'signOut',...options});sessionStorage.lastSignOutScope=options.scope;authSession=null;sessionStorage.fixtureMode='guest';for(const listener of authListeners)listener('SIGNED_OUT',null);return {error:null};}},
      from:table=>({select:columns=>({eq:(column,id)=>({maybeSingle:async()=>{
        if(table==='user_private'&&columns==='coins'&&column==='user_id'){
          window.walletReads.push({table,columns,column,id});return {data:{coins:walletCoins}};
        }
        window.profileReads.push({table,columns,column,id});return {data:{nickname:'오쭈다보리'}};
      }})})}),
      schema:name=>{
        if(name!=='ojjuda_note')throw Error('unexpected support schema');
        return {rpc:async operation=>{
          if(operation==='get_note_state')return {data:{}};
          if(operation==='list_my_inquiries')return {data:[]};
          if(operation==='list_retention_alerts')return {data:[]};
          throw Error('unexpected support write: '+operation);
        }};
      },
      functions:{invoke:async()=>({data:{bucket:'fixture',files:{'station.js':'${hash}',...Object.fromEntries(['coffee','walk','vinyl','camera','book','tennis'].map(key=>[key+'.webp','pending']))}}})},
      storage:{from:()=>({download:async key=>{
        if(key.endsWith('station.js')){window.programCalls++;return {data:await (await fetch('/program')).blob()};}
        window.artCalls.push(key.split('/').pop());window.artPending=true;await new Promise(r=>window.addEventListener('finish-art',r,{once:true}));return {error:'fixture image unavailable'};
      }})},
      rpc:(name,p)=>{
        if(name==='pajang_signal_wallet')return boundRead(signalWallet());
        if(name==='pajang_signal_purchase'){window.signalPurchaseCalls.push(p);throw Error('unexpected signal purchase in layout fixture');}
        if(name==='app_notification_summary'){window.toolbarCalls.push(name);return Promise.resolve({data:{notifications:2,retention:0}});}
        if(name==='list_app_notifications')return Promise.resolve({data:{items:[],unread_count:2,as_of:'2026-11-19T00:00:00Z',has_more:false,next_cursor:null}});
        if(name==='beta_charge_status')return Promise.resolve({data:{ok:true,enabled:true,coins:walletCoins,left:5,limit:5}});
        if(name==='is_admin'){window.adminChecks++;return Promise.resolve({data:mode==='admin'});}
        if(name==='ojjuda_location_preference'){
          state.locationEnabled=localStorage.locationEnabled!=='false';state.locationVersion=Number(localStorage.locationVersion||0);
          if(typeof p.p_enabled==='boolean'){
            if(p.p_expected_version!==state.locationVersion)return Promise.resolve({error:{code:'PT412',message:'다른 화면에서 위치 설정이 바뀌었어요.'}});
            state.locationEnabled=p.p_enabled;state.locationVersion++;
            localStorage.locationEnabled=String(p.p_enabled);localStorage.locationVersion=String(state.locationVersion);
            if(!p.p_enabled)state.radarOn=false;
          }
          return Promise.resolve({data:{enabled:state.locationEnabled,version:state.locationVersion}});
        }

        if(name==='pajang_member'){
          if(p.p_action==='delete')window.accountWrites.push({action:'delete'});
          state.locationEnabled=localStorage.locationEnabled!=='false';state.locationVersion=Number(localStorage.locationVersion||0);
          if(!state.locationEnabled)state.radarOn=false;
          window.memberCalls.push(p.p_action);
          if(['join','participate','answer','edit-answer'].includes(p.p_action))
            window.answerWrites.push({action:p.p_action,...structuredClone(p.p_data)});
          if(['entry','state'].includes(p.p_action) && mode==='denied')return Promise.resolve({error:{code:'42501'}});
          if(p.p_action==='state'&&!entry.joined)return Promise.resolve({error:{code:'42501',message:'먼저 파장에 참여해 주세요.'}});
          if(p.p_action==='entry')return Promise.resolve({data:entry});
          if(p.p_action==='radar-enable'||p.p_action==='radar-disable'){
            if(window.locationSaveError)return Promise.resolve({error:{code:'P0001',message:'위치 설정 저장에 실패했어요. 다시 시도해 주세요.'}});
            if(p.p_data.automatic&&(!state.locationEnabled||p.p_data.locationVersion!==state.locationVersion))return Promise.resolve({data:structuredClone(state)});
            window.geoWrites.push(p.p_data);
            state.radarOn=p.p_action==='radar-enable';state.radarDirectionOn=state.radarOn;
            if(!p.p_data.automatic){
              state.locationEnabled=state.radarOn;state.locationVersion++;
              localStorage.locationEnabled=String(state.locationEnabled);localStorage.locationVersion=String(state.locationVersion);
            }
            const result={data:structuredClone(state)};
            if(window.holdLocationSave&&p.p_data.automatic)return new Promise(resolve=>{window.finishLocationSave=()=>resolve(result);});
            return Promise.resolve(result);
          }
          if(p.p_action==='edit-answer'){
            const {body,previousBody,day,slot,questionId}=p.p_data;
            if(day!==state.day||slot!==state.slot||questionId!==state.question.id)return Promise.resolve({error:{code:'PT409'}});
            if(previousBody!==state.me.body && body!==state.me.body)return Promise.resolve({error:{code:'PT412'}});
            state.me.body=body;
            const own=rows.find(r=>r.own);
            if(own)own.body=body;
            else rows.unshift({...state.me,peer:state.me.id,day,slot,own:true,question:state.question.q[0]});
            return Promise.resolve({data:structuredClone(state)});
          }
          if(p.p_action==='signal' && p.p_data.peer==='peer2'){
            return (async()=>{
              if(window.holdSignal)await new Promise(r=>{window.releaseSignal=r;});
              sessionStorage.accepted='yes';state.signals.push({src:'me',dst:'peer2'});state.remaining--;
              return {data:structuredClone(state)};
            })();
          }
          if(p.p_action==='thread'&&p.p_data.peer==='peer2')return Promise.resolve({data:[]});
          if(p.p_action==='thread'){
            if(window.holdRead)return new Promise(resolve=>{window.releaseRead=()=>resolve({data:structuredClone(messages)});});
            return Promise.resolve({data:structuredClone(messages)});
          }
          if(p.p_action==='message')return (async()=>{
            const {peer,id,body}=p.p_data;window.sendIds.push(id);
            if(!messages.some(m=>m.id===id))messages.push({src:'me',dst:peer,id,body,at:2});
            if(window.failReply){window.failReply=false;return {error:{message:'연결이 끊겼어요.'}};}
            if(window.holdWrite)await new Promise(r=>{window.releaseWrite=r;});
            return {data:structuredClone(state)};
          })();
          if(p.p_action==='participate'||p.p_action==='join'){sessionStorage.fixtureMode='member';entry.joined=true;if(p.p_data.body)state.me.body=p.p_data.body;}
          return Promise.resolve({data:structuredClone(state)});
        }
        if(name==='pajang_my_answers')return Promise.resolve({data:[{...rows[0],body:'내 책방 답변'}]});
        if(name==='pajang_profile_preferences')return Promise.resolve({data:{person:p.p_peer||state.me.id,version:0,preferences:{
          relationship_intents:[],meeting_styles:[],relationship_values:[],affection_styles:[],life_priorities:[],
          custom:{meeting_styles:[],relationship_values:[],affection_styles:[],life_priorities:[]}
        }}});
        if(name==='pajang_discovery_visibility')return Promise.resolve({data:{visible:false,hasGender:true}});
        if(name==='pajang_exchange')return Promise.resolve({data:{myCount:0,peerCount:1,eligible:false,profile:'none',photos:'none',fields:{}}});
        if(name!=='pajang_discovery_feed')throw Error(name);
        return {abortSignal:async signal=>{
          const gender=p.p_gender;window.feedCalls.push(gender);
          if(gender===window.heldGender)await new Promise(r=>{window.releaseFeed=r;signal.addEventListener('abort',r,{once:true});});
          if(signal.aborted){window.aborted=(window.aborted||0)+1;return {error:{code:'aborted'}};}
          if(window.denied)return {error:{code:'42501'}};
          const items=rows.filter((row,i)=>(gender==='all'||gender===(i===0?'male':'female'))&&(p.p_interest==='all'||p.p_interest===row.interest));
          return {data:{items,total:items.length,nextCursor:null,remaining:3}};
        }};
      }
    };
    if(sessionStorage.openTiming){
      window.openRequests=[];
      const delayed=async(name,read)=>{
        const request={name,start:performance.now()};window.openRequests.push(request);
        await new Promise(r=>setTimeout(r,${startupDelayMs}));
        try{return await read();}finally{request.end=performance.now();}
      };
      for(const [obj,key] of [[db.auth,'getUser'],[db.functions,'invoke']]){
        const original=obj[key];obj[key]=(...args)=>delayed(key==='getUser'?'identity':'manifest',()=>original(...args));
      }
      const rpc=db.rpc;
      db.rpc=(name,...args)=>{
        if(name==='pajang_discovery_feed'){
          const read=rpc(name,...args);
          return {abortSignal:signal=>delayed('feed',()=>read.abortSignal(signal))};
        }
        return delayed(name==='pajang_member'?'member:'+args[0].p_action:name,()=>rpc(name,...args));
      };
      const from=db.storage.from;
      db.storage.from=(...args)=>{
        const bucket=from(...args),download=bucket.download;
        bucket.download=key=>key.endsWith('station.js')?delayed('program',()=>download(key)):download(key);
        return bucket;
      };
      document.addEventListener('click',event=>{
        if(event.target.closest('[data-pajang-launch]'))sessionStorage.openStart=String(Date.now());
      },true);
      function paint(){
        const target=document.querySelector(mode==='new'?'#welcome #write':'#answers article .quote');
        if(target?.getClientRects().length && sessionStorage.openStart){
          sessionStorage.openMs=String(Date.now()-Number(sessionStorage.openStart));return;
        }
        requestAnimationFrame(paint);
      }
      requestAnimationFrame(paint);
    }
    window.OjjudaGetClient=async()=>db;
  `;
}

async function checkNavigation(page){
  const menu=page.getByRole('navigation',{name:'파장 메뉴'});
  const choose=label=>menu.getByRole('link',{name:label,exact:true}).click();
  const heading=label=>page.getByRole('heading',{name:label,exact:true});
  await page.goto(origin+project+'station.html');
  await menu.waitFor();
  await choose('마음함');await heading('마음함').waitFor();
  await choose('내 파장');await heading('내 파장').waitFor();
  const settings=page.getByRole('region',{name:'파장 설정',exact:true});
  const helpMenu=settings.locator('details').filter({has:page.locator('summary').filter({hasText:'도움말'})});
  assert.equal(await helpMenu.evaluate(el=>el.open),false,'a fresh settings page starts with Help collapsed');
  await helpMenu.locator('summary').click();
  assert.equal(await helpMenu.getAttribute('open'),'','Help expands before its child actions are used');
  const organization=helpMenu.getByRole('link',{name:'조직도',exact:true});
  await organization.waitFor({state:'visible'});
  const organizationUrl=new URL(await organization.getAttribute('href'),page.url());
  assert.equal(organizationUrl.origin,origin,'organization stays on the current service origin');
  assert.equal(organizationUrl.pathname,'/features/organization/');
  assert.deepEqual([...organizationUrl.searchParams],[['from','pajang']],'public organization keeps only the allowed Pajang return source');
  assert.equal(await organization.getAttribute('target'),'_top');
  await helpMenu.getByRole('button',{name:'사용법',exact:true}).click();
  const help=page.getByRole('dialog',{name:'파장 이용 안내'});
  await help.waitFor();
  const profileUrl=page.url();
  await page.goBack();await help.waitFor({state:'detached'});
  assert.equal(page.url(),profileUrl,'Back closes the dialog before leaving its page');
  await heading('내 파장').waitFor();
  await page.goBack();await heading('마음함').waitFor();
  await page.goForward();await heading('내 파장').waitFor();
  await settings.getByRole('button',{name:'공개 프로필 수정',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'공개 프로필 수정'});
  await editor.waitFor();
  await editor.getByRole('button',{name:'닫기',exact:true}).click();
  await editor.waitFor({state:'detached'});
  await page.goBack();await heading('마음함').waitFor();
  assert.equal(await page.getByRole('dialog').count(),0,'a button-closed dialog leaves no phantom Back entry');
  await page.goForward();await heading('내 파장').waitFor();
  await page.goForward();await editor.waitFor();
  await editor.getByRole('button',{name:'닫기',exact:true}).click();
  await editor.waitFor({state:'detached'});
  await choose('오늘');
  await page.getByRole('button',{name:'내 주변',exact:true}).click();
  await heading('주변 레이더').waitFor();
  await page.locator('.scope-person').filter({hasText:'라'}).click();
  await page.getByRole('button',{name:'공개 정보 보기'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'대화 열기',exact:true}).click();
  await page.getByRole('textbox',{name:'메시지',exact:true}).waitFor();
  assert.ok(page.url().includes('chat=peer1'));
  await page.getByRole('button',{name:'뒤로가기',exact:true}).click();
  await heading('주변 레이더').waitFor();
  assert.equal(await page.getByRole('dialog').count(),0,'chat Back returns to the actual radar page without reopening its closed profile');
  await page.goForward();await page.getByRole('textbox',{name:'메시지',exact:true}).waitFor();
  await page.reload();await page.getByRole('textbox',{name:'메시지',exact:true}).waitFor();
  await page.getByRole('button',{name:'뒤로가기',exact:true}).click();
  await heading('주변 레이더').waitFor();
  await page.route('https://outside.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>External entry</title>'}));
  await page.goto('https://outside.test/');
  await page.goto(origin+project+'station.html?tab=chat&chat=peer1');
  await page.getByRole('textbox',{name:'메시지',exact:true}).waitFor();
  await page.getByRole('button',{name:'뒤로가기',exact:true}).click();
  await heading('마음함').waitFor();
  await choose('내 파장');
  for(const label of ['이용약관','개인정보처리방침'])assert.equal(await settings.getByRole('link',{name:label,exact:true}).getAttribute('target'),null);
  console.log('PASS Pajang dialog-first Back, real tab history and Forward, closed-dialog cleanup, radar-to-chat return, reload and direct-chat fallback');
}

(async()=>{
  const bundle=await fs.readFile(process.env.PAJANG_TEST_BUNDLE||path.join(feature,'assets/station.js'));
  const hash=crypto.createHash('sha256').update(bundle).digest('hex');
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ko-KR',geolocation:{latitude:37.5665,longitude:126.978,accuracy:30},permissions:['geolocation']});
    const page=await context.newPage(), errors=[];
    await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:'/* Auth client is supplied by the config fixture. */'}));
    await page.route('**/functions/v1/theme-weather**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({kind:null,expiresAt:Date.now()+600000})}));
    let legacyLocationPage=false,openingBaseline=false;
    const previousFiles=new Map();
    page.on('pageerror',err=>errors.push(err.message));
    await page.route(origin+'/**',async route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:clientFixture(hash)});
      if(['/app/world/world-themes.css','/app/world/world-themes.js','/app/world/world-weather.js'].includes(pathname))return route.fulfill({contentType:pathname.endsWith('.css')?'text/css':'text/javascript',body:await fs.readFile(path.join(feature,'../..',pathname))});
      if(pathname==='/features/home/agit-hub.css')return route.fulfill({contentType:'text/css',body:await fs.readFile(path.join(feature,'../home/agit-hub.css'))});
      if(pathname==='/features/account/settings-list.css')return route.fulfill({contentType:'text/css',body:await fs.readFile(path.join(feature,'../account/settings-list.css'))});
      if(pathname==='/note/support.css')return route.fulfill({contentType:'text/css',body:await fs.readFile(path.join(feature,'../../note/support.css'))});
      if(toolbarAssets.includes(pathname))return route.fulfill({
        contentType:pathname.endsWith('.css')?'text/css':pathname.endsWith('.svg')?'image/svg+xml':'text/javascript',
        body:await fs.readFile(path.join(feature,'../..',pathname))
      });
      if(pathname==='/program')return route.fulfill({contentType:'application/javascript',body:bundle});
      if(pathname==='/features/home/agit-hub.js')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(feature,'../home/agit-hub.js'))});
      if(/^\/features\/home\/theme-illustrations\/[a-z0-9-]+\.webp$/.test(pathname)||['/features/home/park-community-3d-20261119.webp','/features/home/pajang-signal-3d-20261119.webp'].includes(pathname))return route.fulfill({contentType:'image/webp',body:await fs.readFile(path.join(feature,'../..',pathname))});
      if(pathname==='/features/home/location-warmup.mjs')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(feature,'../home/location-warmup.mjs'))});
      if(pathname==='/world.html')return route.fulfill({contentType:'text/html',body:`<!doctype html>
        <html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/features/home/agit-hub.css"><title>아지트</title>
        <script src="/config.js"></script><script src="/features/home/agit-hub.js"></script><script type="module" src="/features/home/location-warmup.mjs"></script>
        <main></main><script>document.querySelector('main').innerHTML=OjjudaAgitHub.markup({},{});</script></html>`});
      if(pathname==='/shared/navigation/section-back.js')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(feature,'../../shared/navigation/section-back.js'))});
      if(pathname==='/shared/location/location.js')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(feature,'../../shared/location/location.js'))});
      if(pathname==='/shared/content/text-length.mjs')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(feature,'../../shared/content/text-length.mjs'))});
      const file=pathname.slice(project.length)||'index.html';
      if(legacyLocationPage&&file==='location.mjs')return route.fulfill({contentType:'text/javascript',body:'export async function prepareLocation(state){return state;}'});
      if(!['station.html','station.css','support.css','radar-motion.css','member.mjs','member-main.mjs','load-station.mjs','location.mjs','letterroom.css','dialog-surface.css','assets/favicon.svg','shell.css','entry-design.css','entry-design.mjs','shell.mjs','account-toolbar.mjs','account-toolbar.css','signal-purchase.css','index.html','entry.mjs','preview.mjs','preview.css','questions.mjs','regions.json','dialog.mjs','feed.html'].includes(file))return route.abort();
      const mime={html:'text/html',css:'text/css',mjs:'text/javascript',json:'application/json',svg:'image/svg+xml'}[path.extname(file).slice(1)];
      let body=openingBaseline&&previousFiles.has(file)?previousFiles.get(file):await fs.readFile(path.join(feature,file));
      if(legacyLocationPage&&file.endsWith('.html'))body=body.toString().replace(/<script[^>]*src="\/shared\/location\/location\.js[^>]*><\/script>/,'');
      return route.fulfill({contentType:mime,body});
    });
    if(navigationOnly||!themeOnly)await checkNavigation(page);
    if(navigationOnly){assert.deepEqual(errors,[]);return;}
    // Reuse the real entry, protected member program and their exact stylesheet order.
    const views=[
      {name:'entry',url:'index.html?flight-check=new',selectors:{action:'#write',feature:'.entry-intro'},changing:['nodes.action.background','nodes.feature.background']},
      {name:'member',url:'station.html',selectors:{action:'.dialog .primary',feature:'.letter-hero',menu:'.station-nav a[aria-current=page]'},changing:['nodes.action.background','nodes.feature.background','nodes.menu.background']},
      {name:'radar',url:'station.html?tab=radar',selectors:{feature:{selector:'.radar-scope',pseudo:'::before'},menu:'.station-nav a[aria-current=page]'},changing:['nodes.feature.image','nodes.menu.background']},
      {name:'settings',url:'station.html?tab=profile',selectors:{feature:'.account-agit',list:'.account-settings .ojjuda-settings-list'},changing:['nodes.feature.background']}
    ];
    await page.emulateMedia({reducedMotion:'reduce'});
    for(const view of views){
      await page.goto(origin+project+view.url,{waitUntil:'domcontentloaded'});
      if(view.name==='entry'){
        await page.waitForFunction(()=>typeof window.finishFlight==='function');
        await page.evaluate(()=>window.finishFlight());await page.locator('#write').click();
        await page.locator('#mine').fill('테마가 바뀌어도 남아야 하는 답변');
      }else{
        await page.locator('.station-nav').waitFor();
        if(view.name==='member'){
          await page.getByRole('button',{name:'내 답변 수정하기',exact:true}).click();
          await page.locator('.dialog #editor').fill('테마가 바뀌어도 남아야 하는 답변');
        }
      }
      await page.mouse.move(0,0);await page.evaluate(()=>window.OjjudaWeather?.clear());
      for(const appearance of ['light','dark']){
        await page.emulateMedia({colorScheme:appearance});const samples=[];
        for(const [theme,date] of calendarCases){
          await selectCalendarDate(page,date);const colors=await palette(page,view.selectors);
          assert.equal(colors.theme,theme);assert.equal(colors.body,colors.bg,view.name+' uses the shared background');
          if(view.selectors.action)assert.equal(colors.nodes.action.background,colors.accent,view.name+' primary action follows '+theme);
          samples.push(colors);
        }
        distinctPalettes(samples,'Pajang '+view.name+' '+appearance,['bg','accent',...view.changing]);
        const weather=[];
        for(const kind of [null,'rain','snow']){
          await selectCalendarDate(page,'2026-10-15',kind);const colors=await palette(page,view.selectors);
          assert.equal(colors.weather,kind||'');weather.push(colors);
        }
        assert.equal(new Set(weather.map(colors=>colors.bg)).size,3,view.name+' responds to clear, rain and snow');
        await selectCalendarDate(page,'2026-12-25','snow');assert.equal((await palette(page)).weather,'','holiday palette takes priority');
      }
      if(view.name==='entry')assert.equal(await page.locator('#mine').inputValue(),'테마가 바뀌어도 남아야 하는 답변');
      if(view.name==='member')assert.equal(await page.locator('.dialog #editor').inputValue(),'테마가 바뀌어도 남아야 하는 답변');
    }
    assert.deepEqual(errors,[]);
    console.log('PASS automatic Pajang entry/member/radar/settings palettes, system appearance, rain/snow, holiday priority and draft preservation');
    if(themeOnly)return;
    await page.emulateMedia({colorScheme:'light',reducedMotion:'no-preference'});
    for(const file of ['index.html','entry.mjs','member.mjs','member-main.mjs','load-station.mjs','station.html'])
      previousFiles.set(file,execFileSync('git',['show',previousRelease+':features/pajang/'+file],{cwd:path.join(feature,'../..'),maxBuffer:1e6}));
    const flightDir=path.join(__dirname,'artifacts/pajang-discovery');
    await fs.mkdir(flightDir,{recursive:true});
    for(const [url,ready] of [['index.html?flight-check=new','#welcome #write'],['station.html?flight-check=member','#station #answers']]){
      const member=url.startsWith('station');
      // On the station page, hold the picture past startup: art must never gate real content.
      let releasePicture;
      const picture='**/hillside.webp';
      if(member)await page.route(picture,async route=>{
        await new Promise(resolve=>{releasePicture=resolve;});
        await route.abort();
      });
      await page.goto(origin+project+url,{waitUntil:'commit'});
      const scene=page.locator('#gate .flight-scene');await scene.waitFor();
      await page.waitForFunction(()=>typeof window.finishFlight==='function');
      const positions=await scene.evaluate(el=>{
        const plane=el.querySelector('.paper-plane'),box=el.getBoundingClientRect();
        const animations=el.getAnimations({subtree:true});
        return [0,1332,3100].map(time=>{
          for(const animation of animations){animation.pause();animation.currentTime=time;}
          const p=plane.getBoundingClientRect();
          return [(p.x+p.width/2-box.x)/box.width,(p.y+p.height/2-box.y)/box.height,p.width];
        });
      });
      const [start,crest,door]=positions;
      assert.ok(start[0]<.18 && crest[0]>.35 && door[0]>.74 && door[0]<.8);
      assert.ok(crest[1]<.32 && start[1]>.47 && door[1]>.58 && door[1]<.70 && door[2]<start[2]);
      if(!member){
        await scene.evaluate(async el=>{
          const art=getComputedStyle(el.querySelector('.flight-landscape'),'::after').backgroundImage;
          const img=new Image();img.src=art.slice(5,-2);await img.decode();
          el.getAnimations({subtree:true}).forEach(a=>{a.currentTime=1100;});
        });
        await scene.screenshot({path:path.join(flightDir,'paper-plane-flight.png')});
      }else assert.equal(typeof releasePicture,'function');
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await scene.evaluate(el=>el.getAnimations({subtree:true}).length),0);
      await page.evaluate(()=>window.finishFlight());
      await page.locator(ready).waitFor();
      assert.equal(await scene.isVisible(),false);
      if(!member)assert.match(await page.locator('#publication-note').textContent(),/작성일부터 최대 365일간 파장 회원에게/);
      if(member){releasePicture?.();await page.unroute(picture);}
      await page.emulateMedia({reducedMotion:'no-preference'});
      if(!member){
        await page.locator('.sample-radar summary').click();
        await page.locator('.scope').waitFor();
        await checkRadarMotion(page,'.scope');
      }
    }
    console.log('PASS watercolor flight, upright static alternative, immediate handoff with art pending');
    await page.goto(origin+project+'station.html#answers');
    const answers=page.locator('#answers'), cards=answers.locator('article'), group=answers.getByRole('radiogroup');
    const radio=value=>group.locator('input[value="'+value+'"]');
    const selected=async value=>assert.equal(await radio(value).isChecked(),true);
    await cards.nth(1).waitFor();
    assert.equal(await page.evaluate(()=>window.feedCalls.length),1,'first feed read is shared with the UI');
    assert.equal(await answers.getByRole('heading',{name:rows[0].question}).count(),1);
    assert.equal(await page.evaluate(()=>window.artPending),true,'feed is usable with all artwork still pending');
    assert.equal(await page.evaluate(()=>window.authCalls),1);
    assert.deepEqual(await page.evaluate(()=>window.artCalls.slice().sort()),['book.webp','walk.webp']);
    assert.deepEqual(await group.locator('label span').allTextContents(),['남','','여']);
    const dir=path.join(__dirname,'artifacts/pajang-discovery');
    await fs.mkdir(dir,{recursive:true});
    for(const width of [320,390,750,1080]){
      await page.setViewportSize({width,height:844});
      await checkServiceHeader(page,width);
      await page.locator('.pajang-mast').screenshot({path:path.join(dir,'service-header-'+width+'.png'),animations:'disabled'});
      assert.ok(await answers.evaluate(el=>el.scrollWidth<=document.documentElement.clientWidth));
      const bounds=await group.boundingBox();
      assert.equal(bounds.width,74);assert.equal(bounds.height,26);
      const title=await answers.getByRole('heading',{name:'모두의 답변'}).boundingBox();
      assert.ok(bounds.x>=title.x+title.width-1 && Math.abs((bounds.y+bounds.height/2)-(title.y+title.height/2))<10);
      await answers.screenshot({path:path.join(dir,'answers-'+width+'.png'),animations:'disabled'});
    }
    await checkSignalPurchaseLayout(page,dir);
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{window.heldGender='male';});
    await radio('male').tap();
    await selected('male');await answers.locator('.answer-skeleton').first().waitFor();
    assert.equal(await cards.count(),0);
    await radio('female').tap();
    await cards.filter({hasText:rows[1].body}).waitFor();
    assert.equal(await cards.count(),1);
    await page.waitForFunction(()=>window.aborted===1);
    await page.evaluate(()=>{window.heldGender='all';window.releaseFeed=null;});
    await radio('all').tap();
    await page.waitForFunction(()=>typeof window.releaseFeed==='function');
    assert.equal(await cards.count(),2,'revisited filter paints before its validation request finishes');
    await page.evaluate(()=>{window.heldGender=null;window.releaseFeed();window.dispatchEvent(new Event('finish-art'));});
    await answers.locator('.cardgrid[aria-busy="false"]').waitFor();
    await radio('male').tap();await cards.filter({hasText:rows[0].body}).waitFor();
    await group.scrollIntoViewIfNeeded();
    const left=await radio('male').boundingBox(),right=await radio('female').boundingBox();
    const cdp=await context.newCDPSession(page);
    const y=left.y+left.height/2, x=left.x+left.width/2, end=right.x+right.width/2;
    const calls=await page.evaluate(()=>window.feedCalls.length);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=5;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(end-x)*step/5,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await selected('female');await cards.filter({hasText:rows[1].body}).waitFor();
    assert.deepEqual(await page.evaluate(n=>window.feedCalls.slice(n),calls),['female'],'one request per swipe');
    await answers.screenshot({path:path.join(dir,'answers-female.png'),animations:'disabled'});
    await page.keyboard.press('ArrowLeft');await selected('all');
    await page.evaluate(()=>{window.denied=true;});
    await radio('male').tap();await answers.getByRole('alert').waitFor();
    assert.equal(await cards.count(),0,'denial clears cached member content');
    // Exercise navigation against the real shell, entry, member gate and popup host.
    await page.goto(origin+project+'station.html');
    const mast=page.locator('.pajang-mast .agit-return');
    const accountHome=page.getByRole('link',{name:'아지트 가기',exact:true});
    const nav=page.getByRole('navigation',{name:'파장 메뉴'});
    const selectMenu=label=>nav.getByRole('link',{name:label,exact:true}).click();
    const expectHeaderClean=async()=>assert.equal(await mast.count(),0,'the global masthead has no Agit button');
    const goHome=async()=>{await selectMenu('내 파장');await accountHome.click();await page.waitForURL('**/world.html');};
    const questionCard=page.locator('.letter-hero');
    await questionCard.getByRole('heading',{level:1}).waitFor();
    assert.equal(await questionCard.locator('p,a').count(),0);
    const revise=questionCard.getByRole('button',{name:'내 답변 수정하기'});
    const editor=page.getByRole('dialog',{name:'오후 답변 수정'});
    await revise.click();
    assert.equal(await editor.getByLabel('내 이야기').inputValue(),me.body);
    await editor.getByLabel('내 이야기').fill('취소할 내용');
    await editor.getByRole('button',{name:'닫기'}).click();
    await revise.click();
    assert.equal(await editor.getByLabel('내 이야기').inputValue(),me.body);
    await editor.getByLabel('내 이야기').fill('  ');
    assert.ok(await editor.getByRole('button',{name:'수정 저장하기'}).isDisabled());
    await editor.getByLabel('내 이야기').fill('같이 산책하고 따뜻한 차를 마셔요.');
    await editor.getByRole('button',{name:'수정 저장하기'}).click();
    await editor.waitFor({state:'detached'});
    const editWrite=await page.evaluate(()=>window.answerWrites.at(-1));
    assert.equal(editWrite.action,'edit-answer');
    assert.equal(Object.hasOwn(editWrite,'archive'),false);
    assert.equal(Object.hasOwn(editWrite,'publicationPolicy'),false);
    await cards.filter({hasText:'같이 산책하고 따뜻한 차를 마셔요.'}).waitFor();
    await revise.click();
    assert.equal(await editor.getByLabel('내 이야기').inputValue(),'같이 산책하고 따뜻한 차를 마셔요.');
    await editor.getByRole('button',{name:'닫기'}).click();
    await nav.waitFor();assert.equal(await nav.getByRole('link').count(),3);
    assert.deepEqual(await nav.getByRole('link').allTextContents(),['오늘','마음함','내 파장']);
    await expectHeaderClean();
    const capture=async name=>{
      await page.waitForTimeout(210);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(dir,'pajang-'+name+'.png'),animations:'disabled'});
    };
    await cards.first().waitFor();
    await page.evaluate(async()=>{
      const css=getComputedStyle(document.documentElement).getPropertyValue('--letter-scene');
      const scene=new Image();
      scene.src=css.trim().slice(5,-2);
      await scene.decode();
    });
    await capture('home-mobile');
    await radio('female').tap();await cards.filter({hasText:rows[1].body}).waitFor();
    await answers.locator('article').first().scrollIntoViewIfNeeded();await expectHeaderClean();
    const readingY=await page.evaluate(()=>scrollY);
    await selectMenu('마음함');await page.getByRole('heading',{name:'마음함'}).waitFor();
    await page.goBack();await selected('female');await cards.filter({hasText:rows[1].body}).waitFor();
    assert.ok(Math.abs(await page.evaluate(()=>scrollY)-readingY)<5,'back restores the reading position');
    await page.getByRole('button',{name:'내 주변',exact:true}).click();await page.getByRole('heading',{name:'주변 레이더'}).waitFor();
    const sameCellPeople=page.locator('.scope-person.scope-same-cell');
    const markerByName=name=>page.getByRole('button',{name:new RegExp('^'+name+',')});
    const fixedPeople='.scope-self,.scope-person.scope-same-cell';
    const friendAnchor='.radar-links line[data-person-id="peer1"]';
    const waitSameCellCount=count=>page.waitForFunction(count=>document.querySelectorAll('.scope-person.scope-same-cell').length===count,count);
    const sameCellPositions=()=>sameCellPeople.evaluateAll(nodes=>nodes.map(node=>[node.getAttribute('aria-label'),node.style.left,node.style.top]));
    await sameCellPeople.first().waitFor();
    assert.equal(await sameCellPeople.count(),2,'each same-cell person has an independent radar marker');
    assert.equal(await page.locator('.scope-person').count(),4,'both same-cell people and both directional people are visible');
    assert.equal(await page.locator('.scope-self').innerText(),'나');
    assert.equal(await page.locator('.scope-self').evaluate(node=>node.tagName),'SPAN','the center is an ordinary self marker, not a people counter');
    assert.equal(await page.locator('.radar-scope .cluster-count').count(),0);
    assert.deepEqual((await page.locator('.scope-person-name').allTextContents()).sort(),['도','소','가','라'].sort());
    assert.equal(await sameCellPeople.locator('.scope-person-dot').count(),2,'same-cell people each become a dot instead of one combined marker');
    assert.ok((await page.locator('.scope-person').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')))).every(label=>!label.includes('새롬')),
      'direction-private people are never assigned a made-up bearing');
    assert.equal(await page.locator('.radar-links [data-person-id="private1"]').count(),0);
    assert.equal(await page.locator('.radar-links [data-person-id^="nearby"]').count(),0,'same-cell people have no invented direction anchor');
    const fixedBeforeSelection=await sameCellPositions();
    await page.locator('.radar-alternates').getByRole('button',{name:'새롬',exact:true}).click();
    assert.match(await page.locator('.radar-kicker').innerText(),/방향 비공개/);
    assert.ok(await sameCellPeople.evaluateAll(nodes=>nodes.every(node=>node.getAttribute('aria-pressed')==='false')));
    await markerByName('도담').click();
    assert.equal(await page.locator('.radar-identity h2').innerText(),'도담');
    assert.equal(await markerByName('도담').getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('.radar-kicker').innerText(),/같은 위치 구역/);
    await markerByName('도담').click();
    assert.equal(await page.locator('.radar-identity h2').innerText(),'도담','a marker always selects its own person rather than cycling a hidden group');
    await markerByName('소담').click();
    assert.equal(await page.locator('.radar-identity h2').innerText(),'소담');
    assert.equal(await markerByName('도담').getAttribute('aria-pressed'),'false');
    await page.getByRole('button',{name:'공개 정보 보기'}).click();
    await page.getByRole('dialog').getByRole('heading',{name:'소담',exact:true}).waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
    assert.deepEqual(await sameCellPositions(),fixedBeforeSelection,'selecting a person does not shuffle same-cell markers');
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      await checkPeopleLayout(page);
      await page.locator('.radar-scope').screenshot({path:path.join(dir,'pajang-radar-same-cell-'+width+'.png'),animations:'disabled'});
      await checkCompass(page,'.radar-scope','.radar-bearings text',friendAnchor,fixedPeople);
    }
    await checkRadarMotion(page,'.radar-scope');
    for(const count of [1,3,0]){
      await page.evaluate(count=>window.setNearbyCount(count),count);
      await waitSameCellCount(count);
      assert.equal(await page.locator('.scope-self').innerText(),'나');
      assert.deepEqual(await sameCellPeople.locator('.scope-person-name').allTextContents(),['도','소','한'].slice(0,count));
      if(count){
        const name=['도담','소담','한별'][count-1];
        await markerByName(name).click();
        assert.equal(await page.locator('.radar-identity h2').innerText(),name);
      }
      if(count>1)assert.equal(await sameCellPeople.locator('.scope-person-dot').count(),count,'all people sharing the same cell keep separate dots');
      for(const width of [320,390]){
        await page.setViewportSize({width,height:844});
        await checkPeopleLayout(page);
      }
      if(count===3){
        await page.getByRole('button',{name:'다음 레이더 페이지'}).click();
        await waitSameCellCount(0);
        await markerByName('가온').waitFor();
        assert.equal(await page.locator('.scope-person').count(),1,'the fourth person in one distance band stays on the next page');
        await page.getByRole('button',{name:'이전 레이더 페이지'}).click();
        await waitSameCellCount(3);
      }
    }
    for(const count of [5,6,5]){
      await page.evaluate(count=>window.setSparseRadar(count),count);
      await markerByName('나래').waitFor();
      await page.waitForFunction(count=>document.querySelectorAll('.scope-person').length===count,count);
      assert.equal(await page.locator('.scope-person-compact').count(),count>=6?count:0,
        'five separated people keep initials and six become dots; private directions do not count');
      assert.equal(await page.locator('.radar-links [data-person-id="private1"]').count(),0);
      if(count===6){
        const touchTarget=markerByName('마루'),box=await touchTarget.boundingBox();
        await touchTarget.tap({position:{x:4,y:box.height/2}});
        assert.equal(await page.locator('.radar-identity h2').innerText(),'마루','the transparent area outside the visible dot still selects its own person');
        await markerByName('바다').focus();await page.keyboard.press('Enter');
        assert.equal(await page.locator('.radar-identity h2').innerText(),'바다','a dot remains directly keyboard-selectable');
        assert.equal(await markerByName('바다').getAttribute('aria-pressed'),'true');
        assert.equal(await markerByName('마루').getAttribute('aria-pressed'),'false');
        const dotStyle=marker=>marker.locator('.scope-person-dot').evaluate(node=>{
          const css=getComputedStyle(node);return [css.backgroundColor,css.boxShadow];
        });
        assert.notDeepEqual(await dotStyle(markerByName('바다')),await dotStyle(markerByName('마루')),'the selected dot has a distinct color or halo');
        assert.equal(await markerByName('바다').locator('.scope-person-name').isVisible(),false,'selection keeps the crowded marker small');
      }
      for(const width of [320,390]){
        await page.setViewportSize({width,height:844});
        await checkPeopleLayout(page);
        await page.locator('.radar-scope').screenshot({path:path.join(dir,'pajang-radar-separated-'+count+'-'+width+'.png'),animations:'disabled'});
      }
    }
    await page.evaluate(()=>window.setSameCellOverlap());
    await markerByName('도담').waitFor();
    await page.waitForFunction(()=>document.querySelectorAll('.scope-person').length===2);
    assert.equal(await page.locator('.scope-person-compact').count(),2,'a same-cell display slot and a colliding westward circle both become dots');
    await checkPeopleLayout(page);
    await page.evaluate(()=>window.setNearbyCount(0,2));
    await page.waitForFunction(()=>document.querySelectorAll('.scope-person').length===3);
    for(const name of ['라온','다온']){
      assert.equal(await markerByName(name).locator('.scope-person-dot').isVisible(),true,'both collocated people become dots');
      assert.equal(await markerByName(name).locator('.scope-person-name').isVisible(),false);
    }
    assert.equal(await markerByName('가온').locator('.scope-person-name').isVisible(),true,'the separated person keeps its readable initial');
    assert.equal(await page.locator('.scope-person-compact').count(),2,'only the colliding pair shrinks in a sparse radar');
    await checkCompass(page,'.radar-scope','.radar-bearings text',friendAnchor,'.scope-self,.scope-person');
    await page.evaluate(()=>window.setNearbyCount(2,3));
    await waitSameCellCount(2);
    await page.waitForFunction(()=>document.querySelectorAll('.scope-person').length===6);
    assert.equal(await page.locator('.radar-scope .cluster-count').count(),0,'same-direction people are not collapsed into a numeric badge');
    for(const name of ['라온','다온','해솔']){
      await markerByName(name).click();
      assert.equal(await page.locator('.radar-identity h2').innerText(),name,'a collocated directional marker selects that exact person');
      assert.match(await markerByName(name).getAttribute('aria-label'),/북서쪽/);
    }
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      await checkPeopleLayout(page);
    }
    for(const sameCount of [0,3]){
      await page.evaluate(count=>window.setDenseRadar(count),sameCount);
      await page.waitForFunction(count=>document.querySelectorAll('.scope-person').length===12&&document.querySelectorAll('.scope-person.scope-same-cell').length===count,sameCount);
      assert.equal(await page.locator('.radar-links line').count(),12-sameCount,'only shared directions receive position anchors');
      assert.equal(await page.locator('.scope-person-compact').count(),12,'all twelve people remain independently visible as small dots');
      await markerByName('햇살가득한아주긴닉네임').click();
      assert.equal(await page.locator('.radar-identity h2').innerText(),'햇살가득한아주긴닉네임');
      assert.equal(await markerByName('햇살가득한아주긴닉네임').locator('.scope-person-name').textContent(),'햇');
      assert.equal(await markerByName('햇살가득한아주긴닉네임').locator('.scope-person-name').isVisible(),false,'dense dots hide letters while their full names remain available in details and accessible labels');
      for(const width of [320,390]){
        await page.setViewportSize({width,height:844});
        await checkPeopleLayout(page);
        await checkCompass(page,'.radar-scope','.radar-bearings text','.radar-links line[data-person-id="dense-3"]','.scope-self,.scope-person');
        await page.locator('.radar-scope').screenshot({path:path.join(dir,'pajang-radar-dense-'+sameCount+'-'+width+'.png'),animations:'disabled'});
      }
    }
    await page.evaluate(()=>window.setNearbyCount(2));
    await waitSameCellCount(2);
    await page.setViewportSize({width:390,height:844});
    console.log('PASS sparse initial circles, symmetric collision dots, five/six-person density transitions, generous dot touch targets, keyboard selection, same-cell 0/1/2/3, twelve-person dots, compass/privacy boundaries and half-speed waves');
    await capture('radar-mobile');
    await page.reload();await page.getByRole('heading',{name:'주변 레이더'}).waitFor();
    await sameCellPeople.first().waitFor();
    await checkCompass(page,'.radar-scope','.radar-bearings text',friendAnchor,fixedPeople);await expectHeaderClean();
    await selectMenu('마음함');await page.getByRole('button',{name:'수락하고 대화하기'}).waitFor();
    await capture('inbox-mobile');
    await page.getByRole('button',{name:'대화 열기'}).click();
    await page.getByText('안녕하세요!',{exact:true}).waitFor();assert.ok(page.url().includes('chat=peer1'));
    const composer=page.getByRole('textbox',{name:'메시지',exact:true});
    await composer.fill('반가워요, 라온님.');
    await selectMenu('마음함');await page.goBack();
    await page.getByText('안녕하세요!',{exact:true}).waitFor();
    assert.equal(await composer.inputValue(),'반가워요, 라온님.');
    await capture('chat-mobile');
    const send=page.getByRole('button',{name:'메시지 보내기'});
    await page.evaluate(()=>window.failReply=true);
    await send.click();await page.getByText('연결이 끊겼어요.',{exact:true}).waitFor();
    await page.evaluate(()=>window.holdWrite=true);
    await send.click();await page.waitForFunction(()=>!!window.releaseWrite);
    await composer.fill('다음에 쓰고 있던 문장');
    await page.evaluate(()=>window.releaseWrite());
    await page.getByText('반가워요, 라온님.',{exact:true}).waitFor();
    assert.equal(await composer.inputValue(),'다음에 쓰고 있던 문장');
    assert.equal(await page.locator('.bubbleline').filter({hasText:'반가워요, 라온님.'}).count(),1);
    assert.equal(await page.evaluate(()=>window.sendIds.length===2&&new Set(window.sendIds).size===1),true);
    await page.evaluate(()=>{window.holdRead=true;document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>!!window.releaseRead);
    const before=await page.evaluate(()=>window.memberCalls.filter(x=>x==='thread').length);
    await page.evaluate(()=>{for(let i=0;i<3;i++)document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await page.evaluate(()=>window.memberCalls.filter(x=>x==='thread').length),before);
    await selectMenu('내 파장');
    await page.evaluate(()=>{window.holdRead=false;window.releaseRead();});
    await page.goBack();await composer.waitFor();
    assert.equal(await composer.inputValue(),'다음에 쓰고 있던 문장');
    await page.reload();await page.getByText('안녕하세요!',{exact:true}).waitFor();
    await page.goBack();await page.getByRole('button',{name:'대화 열기'}).waitFor();
    await page.getByRole('button',{name:'수락하고 대화하기'}).click();
    await page.waitForURL('**/*chat=peer2');
    await page.getByText('두 사람의 대화가 열렸어요.').waitFor();
    await selectMenu('내 파장');await page.getByRole('heading',{name:'내 파장'}).waitFor();
    await expectHeaderClean();
    assert.equal(await accountHome.getAttribute('href'),'/world.html');
    assert.equal(await accountHome.getAttribute('target'),'_top');
    const settings=page.getByRole('region',{name:'파장 설정',exact:true});
    assert.deepEqual(await settings.getByRole('heading',{level:2}).allTextContents(),['내 계정','내 활동','이용 안내','앱 다운로드','계정 관리']);
    assert.equal(await settings.getByRole('link',{name:'파장 관리자모드',exact:true}).count(),0);
    await settings.getByRole('button',{name:'내가 남긴 답변',exact:true}).click();
    const ownAnswers=page.getByRole('dialog',{name:'내가 남긴 답변',exact:true});
    await ownAnswers.getByText('내 책방 답변').waitFor();
    await ownAnswers.getByRole('button',{name:'닫기',exact:true}).click();
    await settings.getByRole('button',{name:'답변 공개 설정',exact:true}).click();
    const visibility=page.getByRole('dialog',{name:'답변 공개 설정',exact:true});
    assert.equal(await visibility.getByRole('switch',{name:'성별 필터에 내 답변 표시'}).isChecked(),false);
    await visibility.getByRole('button',{name:'닫기',exact:true}).click();
    await settings.getByRole('button',{name:'파장 기록 삭제',exact:true}).click();
    const deletion=page.getByRole('dialog',{name:'파장 기록 삭제',exact:true});
    await deletion.getByRole('button',{name:'취소',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.memberCalls.includes('delete')),false,'opening and cancelling the record settings does not delete data');
    assert.equal(await settings.getByRole('link',{name:'이용약관',exact:true}).getAttribute('href'),'/terms.html?from=pajang');
    assert.equal(await settings.getByRole('link',{name:'개인정보처리방침',exact:true}).getAttribute('href'),'/privacy.html?from=pajang');
    for(const label of ['이용약관','개인정보처리방침'])assert.equal(await settings.getByRole('link',{name:label,exact:true}).getAttribute('target'),null);
    const accountPage=page.locator('.station-account');
    assert.deepEqual(await settings.locator('[aria-labelledby="account-activity-title"] .ojjuda-settings-label').allTextContents(),
      ['답변 공개 설정','내가 남긴 답변','신호 구매','쭈 충전'],'signal purchase stays directly above coin charging in My Pajang activities');
    assert.equal(await settings.getByRole('button',{name:'쭈 충전',exact:true}).getAttribute('aria-controls'),'ju-charge-dialog','settings exposes the shared coin charge dialog');
    const helpMenu=settings.locator('details').filter({has:page.locator('summary').filter({hasText:'도움말'})});
    const helpRows=helpMenu.locator(':scope > .ojjuda-settings-body > .ojjuda-settings-row');
    const topRows=settings.locator('.ojjuda-settings-list > .ojjuda-settings-row, .ojjuda-settings-list > details.ojjuda-settings-details > summary.ojjuda-settings-row');
    assert.equal(await helpMenu.count(),1,'settings has one Help disclosure');
    assert.equal(await helpMenu.evaluate(el=>el.open),false,'Help is a collapsed top-level menu on entry');
    assert.deepEqual(await helpRows.locator('.ojjuda-settings-label').allTextContents(),['사용법','조직도'],'usage and organization are the two Help children');
    for(const index of [0,1])assert.equal(await helpRows.nth(index).isVisible(),false,'collapsed Help hides both children');
    const readRowBounds=elements=>elements.map(el=>{
      const {top,bottom,left,right,height}=el.getBoundingClientRect();
      return {top,bottom,left,right,height};
    });
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      assert.ok(await settings.evaluate(el=>el.scrollWidth<=document.documentElement.clientWidth));
      assert.ok(await accountHome.evaluate(el=>el.getBoundingClientRect().height>=44));
      const rows=await topRows.evaluateAll(readRowBounds);
      assert.equal(rows.length,16,'the 16 top-level settings rows include the Help summary and exclude its nested actions');
      for(const [index,row] of rows.entries()){
        assert.ok(row.height>=44,`settings row ${index+1} has a full touch target at ${width}px`);
        assert.ok(row.left>=0&&row.right<=width+1,'settings rows stay within the viewport');
        assert.ok(Math.abs(row.left-rows[0].left)<=1&&Math.abs(row.right-rows[0].right)<=1,'settings rows align in one full-width column');
        if(index)assert.ok(row.top>=rows[index-1].bottom-1,'settings rows stack vertically without overlap');
      }
      await accountPage.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
      await accountPage.screenshot({path:path.join(dir,'account-settings-'+width+'.png'),animations:'disabled'});
      await helpMenu.locator('summary').click();
      assert.equal(await helpMenu.evaluate(el=>el.open),true,'the Help summary expands its children');
      const childRows=await helpRows.evaluateAll(readRowBounds);
      assert.equal(childRows.length,2);
      for(const [index,row] of childRows.entries()){
        assert.equal(await helpRows.nth(index).isVisible(),true,'expanded Help exposes both child actions');
        assert.ok(row.height>=44,`Help child ${index+1} has a full touch target at ${width}px`);
        assert.ok(row.left>=0&&row.right<=width+1,'expanded Help children stay within the viewport');
        if(index)assert.ok(row.top>=childRows[index-1].bottom-1,'Help children stack vertically without overlap');
      }
      assert.equal(await topRows.count(),16,'expanding Help never counts nested actions as top-level settings');
      await helpMenu.locator('summary').click();
      assert.equal(await helpMenu.evaluate(el=>el.open),false);
      for(const index of [0,1])assert.equal(await helpRows.nth(index).isVisible(),false,'closing Help hides both children again');
    }
    await settings.getByRole('button',{name:'로그아웃',exact:true}).click();
    const logout=page.getByRole('dialog',{name:'로그아웃',exact:true});
    await logout.locator('button[type="submit"]:enabled').waitFor();
    assert.match(await logout.textContent(),/아지트·공원·파장이 함께 로그아웃/);
    await logout.getByRole('button',{name:'취소',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.accountWrites),[],'cancelling logout does not change the account');
    assert.equal(await settings.getByRole('button',{name:'회원 탈퇴',exact:true}).count(),0,'withdrawal is not a direct settings action');
    const contact=page.getByRole('dialog',{name:'문의·의견',exact:true});
    async function openWithdrawalFromSupport(){
      await settings.getByRole('button',{name:'문의·의견',exact:true}).click();
      await contact.locator('#note-inquiry-body').waitFor();
      const accountDisclosure=contact.locator('[data-support-account]');
      const withdrawalEntry=contact.locator('[data-support-withdrawal]');
      assert.equal(await withdrawalEntry.evaluate(button=>button.closest('[role="dialog"]').lastElementChild===button.closest('footer')),true,
        'withdrawal appears after the support form, inquiry list and status');
      assert.equal(await accountDisclosure.evaluate(node=>node.open),false,'every support opening starts with account management collapsed');
      assert.equal(await withdrawalEntry.isVisible(),false,'the support form does not expose a withdrawal button');
      await withdrawalEntry.evaluate(button=>button.click());
      assert.equal(await contact.isVisible(),true);
      assert.equal(await page.getByRole('dialog',{name:'오쭈다 회원탈퇴',exact:true}).count(),0,'a hidden withdrawal control cannot open confirmation');
      await contact.locator('[data-support-account-toggle]').click();
      assert.equal(await accountDisclosure.evaluate(node=>node.open),true);
      assert.equal(await withdrawalEntry.isVisible(),true);
      assert.equal(await withdrawalEntry.textContent(),'회원 탈퇴 안내');
      assert.equal(await page.getByRole('dialog',{name:'오쭈다 회원탈퇴',exact:true}).count(),0,'expanding account management only shows the 안내 entry');
      assert.deepEqual(await page.evaluate(()=>window.accountWrites),[],'opening support never changes the account');
      await withdrawalEntry.click();
      await contact.waitFor({state:'hidden'});
    }
    await openWithdrawalFromSupport();
    const withdrawal=page.getByRole('dialog',{name:'오쭈다 회원탈퇴',exact:true});
    const nickname=withdrawal.getByLabel('확인을 위해 닉네임 ‘오쭈다보리’을 입력해 주세요.');
    const consent=withdrawal.getByRole('checkbox');
    const confirmWithdrawal=withdrawal.getByRole('button',{name:'회원탈퇴',exact:true});
    await nickname.waitFor();
    assert.deepEqual(await page.evaluate(()=>window.profileReads.at(-1)),{table:'profiles',columns:'nickname',column:'id',id:'member'});
    assert.ok(await confirmWithdrawal.isDisabled());
    await nickname.fill(me.name);await consent.check();
    assert.ok(await confirmWithdrawal.isDisabled(),'a Pajang alias cannot confirm deletion of the integrated account');
    await nickname.fill('오쭈다보리');assert.ok(await confirmWithdrawal.isEnabled());
    await consent.uncheck();assert.ok(await confirmWithdrawal.isDisabled(),'the deletion acknowledgement is also required');
    await withdrawal.screenshot({path:path.join(dir,'account-withdrawal-confirmation.png'),animations:'disabled'});
    await withdrawal.getByRole('button',{name:'취소',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.accountWrites),[],'withdrawal confirmation does not delete data');
    await openWithdrawalFromSupport();
    await nickname.waitFor();assert.equal(await nickname.inputValue(),'');assert.equal(await consent.isChecked(),false);
    await withdrawal.getByRole('button',{name:'닫기',exact:true}).click();
    await settings.getByRole('button',{name:'로그아웃',exact:true}).click();
    await logout.locator('button[type="submit"]:enabled').waitFor();
    await logout.getByRole('button',{name:'로그아웃',exact:true}).click();
    await page.getByRole('link',{name:'로그인',exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>sessionStorage.lastSignOutScope),'local','the mocked sign-out completes at the Pajang entrance');
    await page.evaluate(()=>{sessionStorage.fixtureMode='member';});
    await page.goto(origin+project+'station.html?tab=profile');await settings.waitFor();
    console.log('PASS profile-only Agit button, integrated account menus, nickname/consent confirmation, safe cancellation and local logout');
    await page.getByRole('button',{name:'공개 프로필 수정'}).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();await capture('profile-editor');
    assert.equal(await dialog.getByRole('link',{name:'아지트로',exact:true}).count(),0);
    await dialog.getByRole('button',{name:'닫기'}).click();
    await page.evaluate(()=>{sessionStorage.fixtureMode='admin';});
    await page.goto(origin+project+'station.html?tab=profile');
    const adminEntry=settings.getByRole('link',{name:'파장 관리자모드',exact:true});
    await adminEntry.waitFor();
    assert.equal(await adminEntry.getAttribute('href'),'/world.html?admin=pajang-answers&from=pajang');
    assert.equal(await adminEntry.getAttribute('target'),'_top');
    assert.ok(await adminEntry.evaluate(el=>el.getBoundingClientRect().height>=44));
    await accountPage.screenshot({path:path.join(dir,'account-admin-settings-390.png'),animations:'disabled'});
    await adminEntry.click();
    await page.waitForURL('**/world.html?admin=pajang-answers&from=pajang');
    await page.evaluate(()=>{sessionStorage.fixtureMode='not-admin';});
    await page.goto(origin+project+'station.html?tab=profile');await settings.waitFor();
    await page.waitForFunction(()=>window.adminChecks>0);
    assert.equal(await adminEntry.count(),0,'a verified ordinary member has no administrator entry');
    await page.evaluate(()=>{sessionStorage.fixtureMode='member';});await goHome();
    console.log('PASS server-authorized Pajang administrator entry, top-level service route and ordinary-member concealment');
    await page.goto(origin+project+'station.html?view=radar');
    await page.getByRole('heading',{name:'주변 레이더'}).waitFor();
    await checkCompass(page,'.radar-scope','.radar-bearings text',friendAnchor,fixedPeople);
    await selectMenu('내 파장');await page.setViewportSize({width:1080,height:840});
    await page.screenshot({path:path.join(dir,'pajang-profile-desktop.png'),animations:'disabled'});
    await selectMenu('오늘');await answers.waitFor();await capture('home-desktop');await goHome();
    const banner=page.getByRole('link',{name:/파장.*오늘의 질문 보기/});
    for(const width of [320,390,1080]){
      await page.setViewportSize({width,height:844});
      await banner.scrollIntoViewIfNeeded();
      await banner.locator('img').evaluate(img=>img.decode());
      assert.ok(await banner.evaluate(el=>{
        const box=el.getBoundingClientRect();
        return box.left>=0 && box.right<=window.innerWidth &&
          [...el.querySelectorAll('span,strong,b,small')].every(node=>{
            const text=node.getBoundingClientRect();
            return text.left>=box.left && text.right<=box.right && text.bottom<=box.bottom;
          });
      }),'banner text fits at '+width+'px');
      await banner.screenshot({path:path.join(dir,'agit-pajang-banner-'+width+'.png')});
    }
    await page.setViewportSize({width:390,height:844});
    const entryDocuments=[];
    page.on('request',request=>{
      if(request.isNavigationRequest()&&new URL(request.url()).pathname.startsWith(project))entryDocuments.push(request.url());
    });
    await banner.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/station.html');await nav.waitFor();
    assert.equal(entryDocuments.length,1,'a returning member opens one document with no intermediate popup');
    assert.equal(await page.evaluate(()=>window.authCalls),1);
    await page.evaluate(()=>{sessionStorage.fixtureMode='new';sessionStorage.removeItem('pajang:answered-round');});
    await page.goto(origin+'/world.html#pajang-radar');
    const beforeEntry=entryDocuments.length;
    await banner.click();
    await page.getByRole('heading',{name:'처음 만난 날, 어떤 이야기를 나누고 싶나요?'}).waitFor();
    await page.evaluate(()=>{window.entryMarker=document.querySelector('.pajang-mast');});
    assert.equal(await page.locator('iframe,dialog.agit-pajang-dialog').count(),0);
    await capture('entry-mobile');
    assert.equal(await page.locator('#marks button').count(),0,'sample radar does not block the question');
    await page.locator('.sample-radar summary').click();
    await page.locator('#marks button').first().waitFor();
    await checkCompass(page,'#scope','.rose b','#marks button:nth-child(2)');
    await page.locator('#write').click();await page.locator('[name=consent]').check();
    const entryAnswers=page.locator('#answer-fields');
    assert.equal(await entryAnswers.getByRole('combobox').count(),0,'entry offers no date selector');
    assert.equal(await entryAnswers.getByRole('checkbox').count(),0,'entry offers no publication opt-in');
    assert.match(await entryAnswers.locator('#publication-note').textContent(),/작성일부터 최대 365일간 파장 회원에게/);
    await page.locator('#mine').fill('한 번 열린 화면에서 답변을 남겨요.');
    await page.locator('#answer-form').getByRole('button',{name:'답변하기',exact:true}).click();await nav.waitFor();
    const joinWrite=await page.evaluate(()=>window.answerWrites.find(w=>w.action==='join'));
    assert.equal(joinWrite.archive,true);
    assert.equal(joinWrite.publicationPolicy,'year-v1');
    assert.equal(await page.evaluate(()=>window.entryMarker===document.querySelector('.pajang-mast')),true,'answer submission stays in the same document');
    assert.equal(entryDocuments.length-beforeEntry,1,'a new member answers and enters without a second navigation');
    const focusedQuestion=questionCard.getByRole('heading',{level:1});
    // Reproduce the entry announcement deterministically; React may paint after its RAF.
    await focusedQuestion.waitFor();
    await page.keyboard.press('Tab');
    await focusedQuestion.evaluate(el=>{el.tabIndex=-1;el.focus({preventScroll:true});});
    assert.ok(await focusedQuestion.evaluate(el=>el===document.activeElement&&el.matches(':focus-visible')));
    assert.equal(await focusedQuestion.evaluate(el=>getComputedStyle(el).outlineStyle),'none','the automatically focused question has no input-like box');
    await questionCard.screenshot({path:path.join(dir,'question-without-focus-box.png'),animations:'disabled'});
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(()=>{
      const el=document.activeElement;
      return el?.matches('.letter-copy button:focus-visible')&&getComputedStyle(el).outlineStyle!=='none'&&parseFloat(getComputedStyle(el).outlineWidth)>0;
    }),'keyboard users still see the answer button focus');
    console.log('PASS automatic heading focus without a box, while keyboard controls retain visible focus');
    await goHome();
    await page.evaluate(()=>{sessionStorage.fixtureMode='new';sessionStorage.removeItem('pajang:answered-round');});
    await page.evaluate(()=>{sessionStorage.fixtureMode='new';});
    await page.goto(origin+project+'station.html?tab=profile');
    await page.getByText('파장 첫 참여',{exact:true}).waitFor();
    await page.evaluate(()=>window.beforeJoin=document.querySelector('.pajang-mast'));
    await page.locator('[name=consent]').check();await page.getByRole('button',{name:'참여하고 내 파장 보기'}).click();
    await page.getByRole('heading',{name:'내 파장'}).waitFor();
    assert.equal(await page.evaluate(()=>window.beforeJoin===document.querySelector('.pajang-mast')),true,'member entry preserves the document');
    assert.equal(await page.locator('#answer-fields').isVisible(),false,'participate-only never shows the answer disclosure');
    const joinOnlyWrite=await page.evaluate(()=>window.answerWrites.find(w=>w.action==='participate'));
    assert.equal(Object.hasOwn(joinOnlyWrite,'archive'),false);
    assert.equal(Object.hasOwn(joinOnlyWrite,'publicationPolicy'),false);
    assert.ok(page.url().includes('station.html?tab=profile'));
    assert.equal(await page.evaluate(()=>window.memberCalls.filter(v=>v==='state').length),0,'join uses server response');
    await page.evaluate(()=>{delete sessionStorage.accepted;});
    await page.goto(origin+project+'station.html?tab=inbox');
    await page.evaluate(()=>window.holdSignal=true);
    await page.getByRole('button',{name:'수락하고 대화하기'}).click();
    await page.waitForFunction(()=>!!window.releaseSignal);await selectMenu('내 파장');
    const inboxLink=nav.getByRole('link',{name:'마음함',exact:true});
    assert.equal(await inboxLink.getAttribute('aria-description'),'받은 신호 1개');
    await page.evaluate(()=>window.releaseSignal());
    await page.waitForFunction(()=>!document.querySelector('.station-nav [aria-description]'));
    assert.ok(page.url().endsWith('tab=profile'),'a late acceptance leaves the selected page in place');
    await settings.getByRole('button',{name:'내가 남긴 답변',exact:true}).click();
    await ownAnswers.getByText('내 책방 답변').waitFor();
    await ownAnswers.getByRole('button',{name:'닫기',exact:true}).click();
    await selectMenu('마음함');await page.locator('.listperson').filter({hasText:'유진'}).getByRole('button',{name:'대화 열기'}).waitFor();
    assert.ok(!page.url().includes('chat='));
    await page.evaluate(()=>{sessionStorage.fixtureMode='switched';});
    await page.goto(origin+project+'station.html');await page.getByRole('link',{name:'로그인',exact:true}).waitFor();
    assert.equal(await nav.count(),0,'a different auth session cannot mount the previous member state');
    await page.evaluate(()=>{sessionStorage.fixtureMode='unanswered';});
    await page.goto(origin+project+'station.html');
    await questionCard.getByRole('button',{name:'내 답변 쓰기'}).click();
    const newAnswerDialog=page.getByRole('dialog');
    await newAnswerDialog.waitFor();
    assert.equal(await newAnswerDialog.getByRole('combobox').count(),0,'member composer offers no date selector');
    assert.equal(await newAnswerDialog.getByRole('checkbox').count(),0,'member composer offers no publication opt-in');
    assert.match(await newAnswerDialog.textContent(),/작성일부터 최대 365일간 파장 회원에게/);
    await newAnswerDialog.getByLabel('내 이야기').fill('새로 작성한 답변');
    await newAnswerDialog.getByRole('button',{name:'답변하기',exact:true}).click();
    await newAnswerDialog.waitFor({state:'detached'});
    const answerWrite=await page.evaluate(()=>window.answerWrites.find(w=>w.action==='answer'));
    assert.equal(answerWrite.archive,true);
    assert.equal(answerWrite.publicationPolicy,'year-v1');
    for(const mode of ['guest','denied']){
      await page.evaluate(m=>{sessionStorage.fixtureMode=m;},mode);
      await page.goto(origin+project+'station.html');
      await page.locator('#gate p').filter({hasText:mode==='guest'?'로그인한':'이 계정은'}).waitFor();
      assert.equal(await page.locator('.flight-scene').count(),0);
      await expectHeaderClean();
      if(mode==='guest')assert.equal(await page.getByRole('link',{name:'로그인',exact:true}).getAttribute('href'),'/?auth=login&next=pajang');
      else {await page.getByRole('link',{name:'아지트로 돌아가기'}).click();await page.waitForURL('**/world.html');}
    }
    console.log('PASS three primary destinations, direct acceptance, profile-only Agit exit, modal cancellation, direct legacy routes, thread reload/back, single-document Agit entry and join, and guest/denied returns');
    console.log('PASS single remote identity check, two requested illustrations out of six, zero rereads after join, delayed-send draft, retry identity, concurrent reads and late signal acceptance');
    // Leaving a pending member check must not later reopen Pajang.
    await page.evaluate(()=>{sessionStorage.fixtureMode='member';sessionStorage.openTiming='yes';sessionStorage.holdEntryIdentity='yes';sessionStorage.removeItem('pajang:answered-round');});
    await page.goto(origin+'/world.html?closing=1');
    await banner.click();
    await page.locator('#gate .flight-scene').waitFor();
    await page.goBack();await page.waitForURL('**/world.html?closing=1');
    await page.waitForTimeout(500);
    assert.ok(page.url().endsWith('world.html?closing=1'));
    assert.equal(await page.locator('dialog').count(),0);
    await page.evaluate(()=>{delete sessionStorage.holdEntryIdentity;});
    const openingTimes={};
    for(const version of ['before','after']){
    openingBaseline=version==='before';
    openingTimes[version]={};
    for(const scenario of ['new','member-cold','member']){
      const timings=[];
      for(let attempt=0;attempt<5;attempt++){
        await page.evaluate(mode=>{sessionStorage.fixtureMode=mode==='new'?'new':'member';sessionStorage.openTiming='yes';
          if(mode!=='member')sessionStorage.removeItem('pajang:answered-round');
          delete sessionStorage.openMs;delete sessionStorage.openStart;},scenario);
        await page.goto(origin+'/world.html?timing='+attempt);
        const opened=entryDocuments.length;
        await banner.click();
        if(scenario!=='new')await page.waitForURL('**/station.html');
        await page.waitForFunction(()=>sessionStorage.openMs);
        timings.push(await page.evaluate(()=>Number(sessionStorage.openMs)));
        checkStartupRequests(await page.evaluate(()=>window.openRequests),version,scenario);
        assert.equal(entryDocuments.length-opened,1,scenario+' opens just one Pajang document');
        const reads=await page.evaluate(()=>window.memberCalls.filter(action=>['entry','state'].includes(action)));
        assert.deepEqual(reads,scenario==='member'&&!openingBaseline?['state']:scenario==='new'?['entry']:['entry','state'],scenario+' uses only necessary member reads');
        if(!openingBaseline)assert.equal(await page.evaluate(()=>window.programCalls),scenario==='new'?0:1,'only a member entering the main screen downloads its program');
      }
      openingTimes[version][scenario]=timings.sort((a,b)=>a-b)[2];
      console.log('PAJANG_OPEN_MS',version,scenario,JSON.stringify(timings),'median',openingTimes[version][scenario]);
    }
    }
    // Both cold paths contain three 180ms waits: the current feed can be the final
    // dependency after its program is ready. Check request overlap above rather
    // than requiring a 50ms rendering gain at a requestAnimationFrame boundary.
    assert.ok(openingTimes.after['member-cold']<openingTimes.before['member-cold'],'cold member entry is faster with overlapping startup requests');
    assert.ok(openingTimes.after.member<openingTimes.before.member-50,'member entry overlaps startup waits');
    assert.ok(openingTimes.after.new<openingTimes.before.new+120,'first participation stays responsive');
    await page.goto(origin+project+'station.html?view=radar');
    const locationSwitch=page.getByRole('switch',{name:'내 위치 공개'});
    await locationSwitch.waitFor();
    assert.equal(await locationSwitch.getAttribute('aria-checked'),'true');
    await page.waitForFunction(()=>window.geoWrites.some(p=>p.automatic));
    assert.ok(await page.evaluate(()=>window.geoWrites.some(p=>p.automatic&&p.latCell===3757&&p.lonCell===12698&&!('latitude' in p))));
    await locationSwitch.click();
    await page.waitForFunction(()=>localStorage.locationEnabled==='false');
    await page.reload();await locationSwitch.waitFor();
    assert.equal(await locationSwitch.getAttribute('aria-checked'),'false');
    assert.equal(await page.locator('.scope-person').count(),0,'hidden location also hides nearby people');
    assert.equal(await sameCellPeople.count(),0,'hidden location also hides every same-cell marker');
    assert.equal(await page.evaluate(()=>window.geoWrites.length),0,'off re-entry never uploads a location');
    await context.clearPermissions();
    await locationSwitch.click();
    await page.getByText('위치 권한이 막혀 있어요. 휴대폰 설정에서 브라우저의 위치 권한과 오쭈다 사이트의 위치 허용을 확인해 주세요.',{exact:true}).waitFor();
    assert.equal(await locationSwitch.getAttribute('aria-checked'),'false','denial keeps the saved setting');
    await context.grantPermissions(['geolocation'],{origin});
    await locationSwitch.click();
    await page.waitForFunction(()=>localStorage.locationEnabled==='true');
    await page.reload();await locationSwitch.waitFor();
    assert.equal(await locationSwitch.getAttribute('aria-checked'),'true');
    await page.waitForFunction(()=>window.geoWrites.some(p=>p.automatic));
    assert.ok(await page.evaluate(()=>window.geoWrites.some(p=>p.automatic)));
    await context.clearPermissions();
    await page.reload();await locationSwitch.waitFor();
    await page.getByText('위치 권한이 막혀 있어요. 휴대폰 설정에서 브라우저의 위치 권한과 오쭈다 사이트의 위치 허용을 확인해 주세요.',{exact:true}).last().waitFor();
    assert.equal(await locationSwitch.getAttribute('aria-checked'),'true','browser denial does not overwrite the preference');
    await locationSwitch.click();
    await page.waitForFunction(()=>localStorage.locationEnabled==='false');
    assert.equal(await page.evaluate(()=>window.geoWrites.filter(p=>p.automatic).length),0);
    await page.locator('.radar-location-setting').screenshot({path:path.join(dir,'location-switch.png')});
    console.log('PASS default location request, persistent switch, denied recovery, and coarse-cell-only upload');
    // Weak first fixes recover without storing raw coordinates; cancellation never toggles sharing.
    await page.evaluate(()=>{
      window.locationMode='recover';window.locationWatchCleared=0;
      Object.defineProperties(navigator.geolocation,{
        getCurrentPosition:{configurable:true,value:(ok)=>ok({coords:{latitude:37.5665,longitude:126.978,accuracy:8000}})},
        watchPosition:{configurable:true,value:(ok)=>{
          window.locationSuccess=ok;
          if(window.locationMode==='recover')setTimeout(()=>ok({coords:{latitude:37.5665,longitude:126.978,accuracy:30}}),300);
          return 77;
        }},
        clearWatch:{configurable:true,value:()=>{window.locationWatchCleared++;}}
      });
    });
    await locationSwitch.click();
    await page.getByRole('status').filter({hasText:'더 정확한 위치를 확인하고 있어요.'}).waitFor();
    await page.waitForFunction(()=>localStorage.locationEnabled==='true');
    assert.ok(await page.evaluate(()=>window.locationWatchCleared>0));
    await locationSwitch.click();await page.waitForFunction(()=>localStorage.locationEnabled==='false');
    await page.evaluate(()=>{window.locationMode='hold';window.geoWrites=[];});
    await locationSwitch.click();
    await page.getByRole('button',{name:'위치 확인 취소'}).click();
    await page.getByRole('status').filter({hasText:'위치 확인을 취소했어요.'}).waitFor();
    await page.evaluate(()=>window.locationSuccess({coords:{latitude:37.5665,longitude:126.978,accuracy:30}}));
    assert.equal(await locationSwitch.getAttribute('aria-checked'),'false');
    assert.equal(await page.evaluate(()=>window.geoWrites.length),0);
    await locationSwitch.click();await page.getByRole('button',{name:'위치 확인 취소'}).waitFor();
    await selectMenu('내 파장');
    await page.evaluate(()=>window.locationSuccess({coords:{latitude:37.5665,longitude:126.978,accuracy:30}}));
    assert.equal(await page.evaluate(()=>window.geoWrites.length),0,'leaving the radar cannot enable sharing');
    await selectMenu('오늘');await page.getByRole('button',{name:'내 주변',exact:true}).click();
    await page.evaluate(()=>{window.locationMode='recover';window.locationSaveError=true;});
    await locationSwitch.click();
    await page.getByRole('status').filter({hasText:'위치 설정 저장에 실패했어요. 다시 시도해 주세요.'}).waitFor();
    assert.equal(await locationSwitch.getAttribute('aria-checked'),'false');
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.screenshot({path:path.join(dir,'location-recovery.png')});
    console.log('PASS precise recovery, visible reason, cancellation, navigation cleanup and save-error preservation');
    await page.evaluate(()=>{window.locationSaveError=false;});
    const setShared=async enabled=>page.evaluate(async enabled=>{
      const db=await window.OjjudaGetClient(),service=window.OjjudaLocation;
      const preference=await service.preference(db,'member',{refresh:true});
      await service.setPreference(db,'member',enabled,preference.version);
    },enabled);
    await setShared(true);
    await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='true');
    await page.waitForFunction(()=>window.geoWrites.some(write=>write.automatic));
    await setShared(false);
    await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='false');
    assert.equal(await page.locator('.scope-person').count(),0);
    assert.equal(await sameCellPeople.count(),0,'turning location off in Park clears every same-cell marker');
    console.log('PASS shared Park/Pajang setting changes update the mounted radar in both directions');
    await context.grantPermissions(['geolocation']);
    await page.evaluate(()=>{localStorage.locationEnabled='true';sessionStorage.removeItem('ojjuda:location-cell:member');});
    await page.goto(origin+'/world.html?warm-location=1');
    await page.waitForFunction(()=>sessionStorage.getItem('ojjuda:location-cell:member'));
    assert.equal(await page.evaluate(()=>window.geoReadCount),1,'Agit requests the position before opening Pajang');
    await banner.click();await page.waitForURL('**/station.html');await answers.waitFor();
    await page.waitForFunction(()=>window.geoWrites.some(write=>write.automatic));
    assert.equal(await page.evaluate(()=>window.geoReadCount),0,'Pajang saves the recent Agit cell without another GPS request');
    console.log('PASS Agit preloads a location and Pajang reuses it for member radar storage');
    // A permission prompt or slow GPS must not hold either Agit entry route hostage.
    for(const scenario of ['new','member-cold','member']){
      await page.evaluate(mode=>{
        sessionStorage.fixtureMode=mode==='new'?'new':'member';sessionStorage.holdEntryLocation='yes';
        sessionStorage.removeItem('ojjuda:location-cell:member');localStorage.locationEnabled='true';
        if(mode!=='member')sessionStorage.removeItem('pajang:answered-round');
      },scenario);
      await page.goto(origin+'/world.html?slow-location='+scenario);
      await banner.click();
      if(scenario==='new'){
        await page.locator('#welcome #write').waitFor({timeout:5000});
        await page.locator('#write').click();await page.locator('#mine').fill('위치를 기다리는 동안 답변을 써요.');
        await page.goBack();await page.waitForURL('**/world.html?slow-location=new');
        assert.equal(await page.locator('dialog').count(),0);
        continue;
      }
      await page.waitForURL('**/station.html',{timeout:5000});
      await answers.waitFor({timeout:5000});await page.waitForFunction(()=>!!window.finishEntryLocation);
      assert.equal(await page.evaluate(()=>window.geoWrites.length),0);
      await page.getByRole('button',{name:'내 주변',exact:true}).click();
      await page.getByRole('status').filter({hasText:'위치를 확인하고 있어요.'}).waitFor();
      assert.equal(await page.locator('.scope-person').count(),0);
      assert.equal(await sameCellPeople.count(),0,'an unresolved position does not reveal same-cell members');
      if(scenario==='member-cold'){
        await page.evaluate(()=>{window.holdLocationSave=true;window.finishEntryLocation();});
        await page.waitForFunction(()=>!!window.finishLocationSave);
        await selectMenu('오늘');await revise.click();
        await editor.getByLabel('내 이야기').fill('늦은 위치 응답 뒤에도 남아야 할 답변');
        await editor.getByRole('button',{name:'수정 저장하기'}).click();await editor.waitFor({state:'detached'});
        await page.evaluate(()=>window.finishLocationSave());
        await page.waitForFunction(()=>window.memberCalls.filter(v=>v==='state').length>1);
        await revise.click();assert.equal(await editor.getByLabel('내 이야기').inputValue(),'늦은 위치 응답 뒤에도 남아야 할 답변');
        await editor.getByRole('button',{name:'닫기'}).click();
        await page.getByRole('button',{name:'내 주변',exact:true}).click();await page.locator('.scope-person').first().waitFor();
      }else{
        await locationSwitch.click();await page.waitForFunction(()=>localStorage.locationEnabled==='false');
        await page.evaluate(()=>window.finishEntryLocation());
        assert.equal(await page.evaluate(()=>window.geoWrites.filter(p=>p.automatic).length),0,'late GPS cannot undo a switch change');
        assert.equal(await locationSwitch.getAttribute('aria-checked'),'false');
      }
    }
    await page.evaluate(()=>{delete sessionStorage.holdEntryLocation;});
    console.log('PASS usable Agit entry with unresolved GPS, saved answers survive late location, and off cancels background sharing');
    legacyLocationPage=true;
    await context.grantPermissions(['geolocation']);
    await page.goto(origin+project+'station.html?view=radar&cached-page=1');
    await locationSwitch.waitFor();
    assert.equal(await locationSwitch.getAttribute('aria-checked'),'false');
    assert.equal(await page.evaluate(()=>typeof window.OjjudaLocation.readPosition),'function','the member program includes the provider for already-open older pages');
    await locationSwitch.click();
    await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='true');
    assert.ok(await page.evaluate(()=>window.geoWrites.some(write=>!write.automatic)));
    console.log('PASS cached page without the shared script can still turn location on');

    assert.deepEqual(errors,[]);
    console.log('PASS 320/390/1080px layout, artwork-independent startup, tap/swipe/keyboard, delayed results, cancellation, in-memory revisit, and denial');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

