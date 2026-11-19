const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const {execFileSync} = require('node:child_process');
const previousRelease='71785aabf407ca239a27b4811e252a962a725717';

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

async function checkCompass(view, selector, labelSelector, markerSelector, centerSelector) {
  const dial=view.locator(selector);
  const labels=['북','북동','동','남동','남','남서','서','북서'];
  assert.deepEqual(await dial.locator(labelSelector).allTextContents(),labels);
  const centerBefore=centerSelector?await dial.locator(centerSelector).evaluate(node=>{
    const box=node.getBoundingClientRect(),scope=node.closest('.radar-scope').getBoundingClientRect();
    return [box.x+box.width/2-scope.x,box.y+box.height/2-scope.y];
  }):null;
  await view.getByRole('button',{name:'휴대폰 방향 켜기'}).click();
  const stop=view.getByRole('button',{name:'북쪽 고정하기'});
  await stop.waitFor();
  for(const heading of [0,45,90,135,180,225,270,315]){
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
      await view.getByText(new RegExp('위(?:쪽)? · '+labels[heading/45]+'쪽$')).waitFor();
    }finally{
      await dial.evaluate((el,id)=>el.ownerDocument.defaultView.clearInterval(id),sensor);
    }
    const geometry=await dial.evaluate((el,{labelSelector,markerSelector})=>{
      const rect=el.getBoundingClientRect();
      function point(node){
        const p=node.getBoundingClientRect();
        const x=p.x+p.width/2-rect.x-rect.width/2, y=p.y+p.height/2-rect.y-rect.height/2;
        return {angle:(Math.atan2(x,-y)*180/Math.PI+360)%360,
          inside:p.left>=rect.left && p.right<=rect.right && p.top>=rect.top && p.bottom<=rect.bottom};
      }
      return {labels:[...el.querySelectorAll(labelSelector)].map(point),person:point(el.querySelector(markerSelector))};
    },{labelSelector,markerSelector});
    function difference(a,b){return Math.abs((a-b+540)%360-180);}
    geometry.labels.forEach((v,i)=>{
      assert.ok(v.inside && difference(v.angle,i*45-heading)<3,'방위 위치: '+labels[i]+' / '+heading+' '+JSON.stringify(v));
    });
    assert.ok(difference(geometry.person.angle,315-heading)<3,'북서쪽 사람이 같은 각도로 이동');
    if(centerSelector){
      const center=await dial.locator(centerSelector).evaluate(node=>{
        const box=node.getBoundingClientRect(),scope=node.closest('.radar-scope').getBoundingClientRect();
        return [box.x+box.width/2-scope.x,box.y+box.height/2-scope.y];
      });
      assert.ok(center.every((value,i)=>Math.abs(value-centerBefore[i])<1),'같은 구역은 휴대폰 방향과 관계없이 중앙에 유지');
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
    ];
    const privateDirection={id:'private1',name:'새롬',interest:'walk',region:'서울특별시',body:'방향은 공유하지 않아요.',range:3};
    window.setNearbyCount=count=>{
      state.people=[friend,offered,...sameCell.slice(0,count),nearDirection,privateDirection];
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
    window.authCalls=0;window.artCalls=[];window.memberCalls=[];window.sendIds=[];window.programCalls=0;
    window.accountWrites=[];window.profileReads=[];window.adminChecks=0;
    let authSession=mode==='guest'?null:{user:{id:mode==='switched'?'next-member':'member'},access_token:'fixture-token'};
    const authListeners=new Set();
    const db={
      auth:{getUser:async()=>{window.authCalls++;if(flightCheck||sessionStorage.holdEntryIdentity==='yes')await new Promise(resolve=>{window.finishFlight=resolve;});return {data:{user:mode==='guest'?null:{id:'member'}}};},
        getSession:async()=>({data:{session:authSession}}),
        onAuthStateChange:listener=>{authListeners.add(listener);return {data:{subscription:{unsubscribe(){authListeners.delete(listener);}}}};},
        signOut:async options=>{window.accountWrites.push({action:'signOut',...options});sessionStorage.lastSignOutScope=options.scope;authSession=null;sessionStorage.fixtureMode='guest';for(const listener of authListeners)listener('SIGNED_OUT',null);return {error:null};}},
      from:table=>({select:columns=>({eq:(column,id)=>({maybeSingle:async()=>{
        window.profileReads.push({table,columns,column,id});return {data:{nickname:'오쭈다보리'}};
      }})})}),
      functions:{invoke:async()=>({data:{bucket:'fixture',files:{'station.js':'${hash}',...Object.fromEntries(['coffee','walk','vinyl','camera','book','tennis'].map(key=>[key+'.webp','pending']))}}})},
      storage:{from:()=>({download:async key=>{
        if(key.endsWith('station.js')){window.programCalls++;return {data:await (await fetch('/program')).blob()};}
        window.artCalls.push(key.split('/').pop());window.artPending=true;await new Promise(r=>window.addEventListener('finish-art',r,{once:true}));return {error:'fixture image unavailable'};
      }})},
      rpc:(name,p)=>{
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
      const wait=()=>new Promise(r=>setTimeout(r,180));
      for(const [obj,key] of [[db.auth,'getUser'],[db.functions,'invoke']]){
        const original=obj[key];obj[key]=async(...args)=>{await wait();return original(...args);};
      }
      const rpc=db.rpc;
      db.rpc=(name,...args)=>{
        if(name==='pajang_discovery_feed'){
          const read=rpc(name,...args);
          return {abortSignal:async signal=>{await wait();return read.abortSignal(signal);}};
        }
        return wait().then(()=>rpc(name,...args));
      };
      const from=db.storage.from;
      db.storage.from=(...args)=>{
        const bucket=from(...args),download=bucket.download;
        bucket.download=async key=>{if(key.endsWith('station.js'))await wait();return download(key);};
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
  await settings.getByRole('button',{name:'사용법',exact:true}).click();
  const help=page.getByRole('dialog',{name:'파장 이용 안내'});
  await help.waitFor();
  const profileUrl=page.url();
  await page.goBack();await help.waitFor({state:'detached'});
  assert.equal(page.url(),profileUrl,'Back closes the dialog before leaving its page');
  await heading('내 파장').waitFor();
  await page.goBack();await heading('마음함').waitFor();
  await page.goForward();await heading('내 파장').waitFor();
  await settings.getByRole('button',{name:'공개 소개 수정',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'프로필 수정'});
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
    let legacyLocationPage=false,openingBaseline=false;
    const previousFiles=new Map(['index.html','entry.mjs','member.mjs','member-main.mjs','load-station.mjs','station.html'].map(file=>[file,execFileSync('git',['show',previousRelease+':features/pajang/'+file],{cwd:path.join(feature,'../..'),maxBuffer:1e6})]));
    page.on('pageerror',err=>errors.push(err.message));
    await page.route(origin+'/**',async route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:clientFixture(hash)});
      if(pathname==='/features/home/agit-hub.css')return route.fulfill({contentType:'text/css',body:await fs.readFile(path.join(feature,'../home/agit-hub.css'))});
      if(pathname==='/features/account/settings-list.css')return route.fulfill({contentType:'text/css',body:await fs.readFile(path.join(feature,'../account/settings-list.css'))});
      if(pathname==='/program')return route.fulfill({contentType:'application/javascript',body:bundle});
      if(pathname==='/features/home/agit-hub.js')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(feature,'../home/agit-hub.js'))});
      if(pathname==='/features/home/location-warmup.mjs')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(feature,'../home/location-warmup.mjs'))});
      if(pathname==='/world.html')return route.fulfill({contentType:'text/html',body:`<!doctype html>
        <html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
        <link rel="stylesheet" href="/features/home/agit-hub.css"><title>아지트</title>
        <script src="/config.js"></script><script src="/features/home/agit-hub.js"></script><script type="module" src="/features/home/location-warmup.mjs"></script>
        <main></main><script>document.querySelector('main').innerHTML=OjjudaAgitHub.markup({},{});</script></html>`});
      if(pathname==='/shared/navigation/section-back.js')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(feature,'../../shared/navigation/section-back.js'))});
      if(pathname==='/shared/location/location.js')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(feature,'../../shared/location/location.js'))});
      const file=pathname.slice(project.length)||'index.html';
      if(legacyLocationPage&&file==='location.mjs')return route.fulfill({contentType:'text/javascript',body:'export async function prepareLocation(state){return state;}'});
      if(!['station.html','station.css','radar-motion.css','member.mjs','member-main.mjs','load-station.mjs','location.mjs','letterroom.css','dialog-surface.css','assets/favicon.svg','shell.css','shell.mjs','index.html','entry.mjs','preview.mjs','preview.css','questions.mjs','regions.json','dialog.mjs','feed.html'].includes(file))return route.abort();
      const mime={html:'text/html',css:'text/css',mjs:'text/javascript',json:'application/json',svg:'image/svg+xml'}[path.extname(file).slice(1)];
      let body=openingBaseline&&previousFiles.has(file)?previousFiles.get(file):await fs.readFile(path.join(feature,file));
      if(legacyLocationPage&&file.endsWith('.html'))body=body.toString().replace(/<script[^>]*src="\/shared\/location\/location\.js[^>]*><\/script>/,'');
      return route.fulfill({contentType:mime,body});
    });
    await checkNavigation(page);
    if(process.env.PAJANG_NAVIGATION_ONLY==='1'){assert.deepEqual(errors,[]);return;}
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
      if(!member)assert.match(await page.locator('#publication-note').textContent(),/1년\(365일\)/);
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
    for(const width of [320,390,1080]){
      await page.setViewportSize({width,height:844});
      assert.ok(await answers.evaluate(el=>el.scrollWidth<=document.documentElement.clientWidth));
      const bounds=await group.boundingBox();
      assert.equal(bounds.width,74);assert.equal(bounds.height,26);
      const title=await answers.getByRole('heading',{name:'모두의 답변'}).boundingBox();
      assert.ok(bounds.x>=title.x+title.width-1 && Math.abs((bounds.y+bounds.height/2)-(title.y+title.height/2))<10);
      await answers.screenshot({path:path.join(dir,'answers-'+width+'.png'),animations:'disabled'});
    }
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
    const sameCellButton=page.locator('.scope-same-cell');
    await sameCellButton.waitFor();
    assert.match(await sameCellButton.getAttribute('aria-label'),/나와 같은 구역 2명/);
    assert.equal(await sameCellButton.textContent(),'나+2');
    assert.equal(await page.locator('.scope-person').count(),2,'only the two direction-sharing members get directional dots');
    assert.ok((await page.locator('.scope-person').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label')))).every(label=>!label.includes('새롬')),
      'direction-private people are never assigned a made-up bearing');
    await page.locator('.radar-alternates').getByRole('button',{name:'새롬',exact:true}).click();
    assert.match(await page.locator('.radar-kicker').innerText(),/방향 비공개/);
    assert.equal(await sameCellButton.getAttribute('aria-pressed'),'false');
    await sameCellButton.click();
    assert.equal(await page.locator('.radar-identity h2').innerText(),'도담');
    assert.equal(await sameCellButton.getAttribute('aria-pressed'),'true');
    assert.match(await page.locator('.radar-kicker').innerText(),/같은 위치 구역/);
    await sameCellButton.click();
    assert.equal(await page.locator('.radar-identity h2').innerText(),'소담','the center cycles through same-cell people');
    await page.getByRole('button',{name:'공개 정보 보기'}).click();
    await page.getByRole('dialog').getByRole('heading',{name:'소담',exact:true}).waitFor();
    await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();
    await sameCellButton.click();
    assert.equal(await page.locator('.radar-identity h2').innerText(),'도담','cycling returns to the first same-cell person');
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      const layout=await sameCellButton.evaluate(node=>{
        const box=node.getBoundingClientRect(),scope=node.closest('.radar-scope').getBoundingClientRect();
        const overlap=[...node.closest('.radar-scope').querySelectorAll('.scope-person')].some(person=>{
          const peer=person.getBoundingClientRect();
          const distance=Math.hypot(box.x+box.width/2-peer.x-peer.width/2,box.y+box.height/2-peer.y-peer.height/2);
          return distance<(box.width+peer.width)/2;
        });
        return {inside:box.left>=scope.left&&box.right<=scope.right&&box.top>=scope.top&&box.bottom<=scope.bottom,
          centered:Math.abs(box.x+box.width/2-scope.x-scope.width/2)<1&&Math.abs(box.y+box.height/2-scope.y-scope.height/2)<1,overlap};
      });
      assert.deepEqual(layout,{inside:true,centered:true,overlap:false},'same-cell center and nearby direction dots fit at '+width+'px');
      await page.locator('.radar-scope').screenshot({path:path.join(dir,'pajang-radar-same-cell-'+width+'.png'),animations:'disabled'});
    }
    await checkRadarMotion(page,'.radar-scope');
    await checkCompass(page,'.radar-scope','.radar-bearings text','.scope-person','.scope-same-cell');
    await page.evaluate(()=>window.setNearbyCount(1));
    await page.getByRole('button',{name:/나와 같은 구역 1명/}).waitFor();
    await sameCellButton.click();
    assert.equal(await page.locator('.radar-identity h2').innerText(),'도담');
    assert.equal(await sameCellButton.textContent(),'나+1');
    await page.evaluate(()=>window.setNearbyCount(0));
    await sameCellButton.waitFor({state:'detached'});
    assert.equal(await page.locator('.scope-self').innerText(),'나','without same-cell members the ordinary self marker remains');
    await page.evaluate(()=>window.setNearbyCount(2));
    await page.getByRole('button',{name:/나와 같은 구역 2명/}).waitFor();
    console.log('PASS same-cell center, single/multiple profiles, no invented bearings, compass-stable center and half-speed reduced-motion-safe waves');
    await capture('radar-mobile');
    await page.reload();await page.getByRole('heading',{name:'주변 레이더'}).waitFor();
    await sameCellButton.waitFor();
    await checkCompass(page,'.radar-scope','.radar-bearings text','.scope-person','.scope-same-cell');await expectHeaderClean();
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
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      assert.ok(await settings.evaluate(el=>el.scrollWidth<=document.documentElement.clientWidth));
      assert.ok(await accountHome.evaluate(el=>el.getBoundingClientRect().height>=44));
      const rows=await settings.locator('.ojjuda-settings-list > .ojjuda-settings-row').evaluateAll(elements=>elements.map(el=>{
        const {top,bottom,left,right,height}=el.getBoundingClientRect();
        return {top,bottom,left,right,height};
      }));
      assert.equal(rows.length,14,'account settings and the three app entries use the shared list rows');
      for(const [index,row] of rows.entries()){
        assert.ok(row.height>=44,`settings row ${index+1} has a full touch target at ${width}px`);
        assert.ok(row.left>=0&&row.right<=width+1,'settings rows stay within the viewport');
        assert.ok(Math.abs(row.left-rows[0].left)<=1&&Math.abs(row.right-rows[0].right)<=1,'settings rows align in one full-width column');
        if(index)assert.ok(row.top>=rows[index-1].bottom-1,'settings rows stack vertically without overlap');
      }
      await accountPage.evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));
      await accountPage.screenshot({path:path.join(dir,'account-settings-'+width+'.png'),animations:'disabled'});
    }
    await settings.getByRole('button',{name:'로그아웃',exact:true}).click();
    const logout=page.getByRole('dialog',{name:'로그아웃',exact:true});
    await logout.locator('button[type="submit"]:enabled').waitFor();
    assert.match(await logout.textContent(),/아지트·공원·파장이 함께 로그아웃/);
    await logout.getByRole('button',{name:'취소',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.accountWrites),[],'cancelling logout does not change the account');
    await settings.getByRole('button',{name:'회원 탈퇴',exact:true}).click();
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
    await settings.getByRole('button',{name:'회원 탈퇴',exact:true}).click();
    await nickname.waitFor();assert.equal(await nickname.inputValue(),'');assert.equal(await consent.isChecked(),false);
    await withdrawal.getByRole('button',{name:'닫기',exact:true}).click();
    await settings.getByRole('button',{name:'로그아웃',exact:true}).click();
    await logout.locator('button[type="submit"]:enabled').waitFor();
    await logout.getByRole('button',{name:'로그아웃',exact:true}).click();
    await page.getByRole('link',{name:'오쭈다 로그인하기'}).waitFor();
    assert.equal(await page.evaluate(()=>sessionStorage.lastSignOutScope),'local','the mocked sign-out completes at the Pajang entrance');
    await page.evaluate(()=>{sessionStorage.fixtureMode='member';});
    await page.goto(origin+project+'station.html?tab=profile');await settings.waitFor();
    console.log('PASS profile-only Agit button, integrated account menus, nickname/consent confirmation, safe cancellation and local logout');
    await page.getByRole('button',{name:'공개 소개 수정'}).click();
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
    await checkCompass(page,'.radar-scope','.radar-bearings text','.scope-person');
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
    await page.locator('#mine').fill('한 번 열린 화면에서 답변을 남겨요.');
    await page.locator('#answer-form [type=submit]').click();await nav.waitFor();
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
    await page.evaluate(()=>{sessionStorage.fixtureMode='new';});
    await page.goto(origin+project+'station.html?tab=profile');
    await page.getByText('파장 첫 참여',{exact:true}).waitFor();
    await page.evaluate(()=>window.beforeJoin=document.querySelector('.pajang-mast'));
    await page.locator('[name=consent]').check();await page.getByRole('button',{name:'참여하고 내 파장 보기'}).click();
    await page.getByRole('heading',{name:'내 파장'}).waitFor();
    assert.equal(await page.evaluate(()=>window.beforeJoin===document.querySelector('.pajang-mast')),true,'member entry preserves the document');
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
    await page.goto(origin+project+'station.html');await page.getByRole('link',{name:'오쭈다 로그인하기'}).waitFor();
    assert.equal(await nav.count(),0,'a different auth session cannot mount the previous member state');
    await page.evaluate(()=>{sessionStorage.fixtureMode='unanswered';});
    await page.goto(origin+project+'station.html');
    await questionCard.getByRole('button',{name:'내 답변 쓰기'}).click();
    await page.getByRole('dialog').waitFor();
    for(const mode of ['guest','denied']){
      await page.evaluate(m=>{sessionStorage.fixtureMode=m;},mode);
      await page.goto(origin+project+'station.html');
      await page.locator('#gate p').filter({hasText:mode==='guest'?'로그인한':'이 계정은'}).waitFor();
      assert.equal(await page.locator('.flight-scene').count(),0);
      await expectHeaderClean();
      if(mode==='guest')assert.equal(await page.getByRole('link',{name:'오쭈다 로그인하기'}).getAttribute('href'),'/?auth=login&next=pajang');
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
        assert.equal(entryDocuments.length-opened,1,scenario+' opens just one Pajang document');
        const reads=await page.evaluate(()=>window.memberCalls.filter(action=>['entry','state'].includes(action)));
        assert.deepEqual(reads,scenario==='member'&&!openingBaseline?['state']:scenario==='new'?['entry']:['entry','state'],scenario+' uses only necessary member reads');
        if(!openingBaseline)assert.equal(await page.evaluate(()=>window.programCalls),scenario==='new'?0:1,'only a member entering the main screen downloads its program');
      }
      openingTimes[version][scenario]=timings.sort((a,b)=>a-b)[2];
      console.log('PAJANG_OPEN_MS',version,scenario,JSON.stringify(timings),'median',openingTimes[version][scenario]);
    }
    }
    for(const scenario of ['member-cold','member'])assert.ok(openingTimes.after[scenario]<openingTimes.before[scenario]-50,scenario+' overlaps startup waits');
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
    assert.equal(await sameCellButton.count(),0,'hidden location also hides the same-cell group');
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
    assert.equal(await sameCellButton.count(),0,'turning location off in Park clears the same-cell group');
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
      assert.equal(await sameCellButton.count(),0,'an unresolved position does not reveal same-cell members');
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
