const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

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

async function checkCompass(view, selector, labelSelector, markerSelector) {
  const dial=view.locator(selector);
  const labels=['북','북동','동','남동','남','남서','서','북서'];
  assert.deepEqual(await dial.locator(labelSelector).allTextContents(),labels);
  await view.getByRole('button',{name:'휴대폰 방향 켜기'}).click();
  const stop=view.getByRole('button',{name:'북쪽 고정하기'});
  await stop.waitFor();
  for(const heading of [0,45,90,135,180,225,270,315]){
    await dial.evaluate((el,heading)=>{
      const e=Object.assign(new Event('deviceorientationabsolute'),{absolute:true,alpha:(360-heading)%360,beta:0,gamma:0});
      el.ownerDocument.defaultView.dispatchEvent(e);
    },heading);
    await view.getByText(new RegExp('위(?:쪽)? · '+labels[heading/45]+'쪽$')).waitFor();
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
  }
  await stop.click();
  await view.getByText('북쪽 고정',{exact:true}).waitFor();
}

function clientFixture(hash) {
  return `
    const state=${JSON.stringify(state)}, rows=${JSON.stringify(rows)};
    const flightCheck=new URLSearchParams(location.search).get('flight-check');
    const mode=flightCheck||sessionStorage.fixtureMode||'member';
    const accepted=sessionStorage.accepted==='yes';
    const friend={id:'peer1',name:'라온',age:28,interest:'walk',region:'경기도',body:'함께 걸어요.',range:15,bearing:315};
    const offered={id:'peer2',name:'유진',age:30,interest:'book',region:'서울특별시'};
    state.people=[friend,offered];state.signals=[{src:'me',dst:'peer1'},{src:'peer1',dst:'me'},{src:'peer2',dst:'me'}];
    if(accepted)state.signals.push({src:'me',dst:'peer2'});
    const entry={...state,joined:mode!=='new',body:mode==='new'?'':state.me.body,nickname:'보리',
      question:{...state.question,answers:['책을 골라요.','같이 걸어요.','커피를 마셔요.']}};
    if(mode==='new'||mode==='unanswered'){state.me.body='';entry.body='';}
    window.feedCalls=[];window.heldGender=null;window.releaseFeed=null;
    const messages=[{id:'1',src:'peer1',dst:'me',body:'안녕하세요!',at:1}];
    window.authCalls=0;window.artCalls=[];window.memberCalls=[];window.sendIds=[];
    const db={
      auth:{getUser:async()=>{window.authCalls++;if(flightCheck)await new Promise(resolve=>{window.finishFlight=resolve;});return {data:{user:mode==='guest'?null:{id:'member'}}};},
        getSession:async()=>({data:{session:mode==='guest'?null:{user:{id:mode==='switched'?'next-member':'member'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      functions:{invoke:async()=>({data:{bucket:'fixture',files:{'station.js':'${hash}',...Object.fromEntries(['coffee','walk','vinyl','camera','book','tennis'].map(key=>[key+'.webp','pending']))}}})},
      storage:{from:()=>({download:async key=>{
        if(key.endsWith('station.js'))return {data:await (await fetch('/program')).blob()};
        window.artCalls.push(key.split('/').pop());window.artPending=true;await new Promise(r=>window.addEventListener('finish-art',r,{once:true}));return {error:'fixture image unavailable'};
      }})},
      rpc:(name,p)=>{
        if(name==='pajang_member'){
          window.memberCalls.push(p.p_action);
          if(['entry','state'].includes(p.p_action) && mode==='denied')return Promise.resolve({error:{code:'42501'}});
          if(p.p_action==='state'&&!entry.joined)return Promise.resolve({error:{code:'42501',message:'먼저 파장에 참여해 주세요.'}});
          if(p.p_action==='entry')return Promise.resolve({data:entry});
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
          if(p.p_action==='participate'||p.p_action==='join'){sessionStorage.fixtureMode='member';entry.joined=true;}
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

(async()=>{
  const bundle=await fs.readFile(process.env.PAJANG_TEST_BUNDLE||path.join(feature,'assets/station.js'));
  const hash=crypto.createHash('sha256').update(bundle).digest('hex');
  const browser=await chromium.launch();
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ko-KR'});
    const page=await context.newPage(), errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.route(origin+'/**',async route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:clientFixture(hash)});
      if(pathname==='/features/home/agit-hub.css')return route.fulfill({contentType:'text/css',body:await fs.readFile(path.join(feature,'../home/agit-hub.css'))});
      if(pathname==='/program')return route.fulfill({contentType:'application/javascript',body:bundle});
      if(pathname==='/features/home/agit-hub.js')return route.fulfill({contentType:'text/javascript',body:await fs.readFile(path.join(feature,'../home/agit-hub.js'))});
      if(pathname==='/world.html')return route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="ko"><head>
        <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="/features/home/agit-hub.css"><title>아지트</title>
        <style>body{margin:0;padding:0 16px;background:#faf8f3;--font-b:system-ui,sans-serif}</style>
        <script src="/config.js"></script><script src="/features/home/agit-hub.js"></script></head>
        <body><main class="agit-hub"></main><script>
          const shell=document.createElement('template');shell.innerHTML=OjjudaAgitHub.markup({}, {});
          document.querySelector('main').append(shell.content.querySelector('[data-pajang-launch]'));
        </script></body></html>`});
      const file=pathname.slice(project.length)||'index.html';
      if(!['station.html','station.css','member.mjs','member-main.mjs','load-station.mjs','letterroom.css','dialog-surface.css','assets/favicon.svg','shell.css','shell.mjs','index.html','entry.mjs','preview.mjs','preview.css','questions.mjs','regions.json','dialog.mjs','feed.html'].includes(file))return route.abort();
      const mime={html:'text/html',css:'text/css',mjs:'text/javascript',json:'application/json',svg:'image/svg+xml'}[path.extname(file).slice(1)];
      return route.fulfill({contentType:mime,body:await fs.readFile(path.join(feature,file))});
    });
    const flightDir=path.join(__dirname,'artifacts/pajang-discovery');
    await fs.mkdir(flightDir,{recursive:true});
    await page.goto(origin+'/world.html');
    const banner=page.getByRole('link',{name:/^파장 열기/});
    assert.equal(await banner.getAttribute('href'),project);
    for(const width of [320,390,600,768,1280]){
      await page.setViewportSize({width,height:844});
      await banner.scrollIntoViewIfNeeded();
      const geometry=await banner.evaluate(async el=>{
        const image=el.querySelector('.agit-pajang-art');await image.decode();
        const rect=n=>{const r=n.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom};};
        return {box:rect(el),image:rect(image),loaded:image.naturalWidth,
          text:[...el.querySelectorAll('.agit-pajang-brand,.agit-pajang-title,.agit-pajang-description,.agit-pajang-open')].map(rect)};
      });
      const {box,image,text,loaded}=geometry;
      assert.ok(loaded>0 && box.l>=0 && box.r<=width && image.b<=box.b+1 && image.r<=box.r+1);
      for(const t of text){
        assert.ok(t.l>=box.l && t.r<=box.r+1 && t.t>=box.t && t.b<=box.b+1);
        assert.ok(t.r<=image.l+1 || t.l>=image.r-1 || t.b<=image.t+1 || t.t>=image.b-1,'banner art covers copy at '+width);
      }
      if(width===390||width===1280)await banner.screenshot({path:path.join(flightDir,'agit-pajang-banner-'+width+'.png')});
    }
    await page.setViewportSize({width:390,height:844});
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
      if(member){releasePicture?.();await page.unroute(picture);}
      await page.emulateMedia({reducedMotion:'no-preference'});
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
    const nav=page.getByRole('navigation',{name:'파장 메뉴'});
    const selectMenu=label=>nav.getByRole('link',{name:label,exact:true}).click();
    const expectHome=async()=>{
      const box=await mast.boundingBox();assert.ok(box && box.y>=0 && box.y<65,'Agit exit stays in the viewport');
      assert.equal(await mast.getAttribute('href'),'/world.html');
    };
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
    await expectHome();
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
    await answers.locator('article').first().scrollIntoViewIfNeeded();await expectHome();
    const readingY=await page.evaluate(()=>scrollY);
    await selectMenu('마음함');await page.getByRole('heading',{name:'마음함'}).waitFor();
    await page.goBack();await selected('female');await cards.filter({hasText:rows[1].body}).waitFor();
    assert.ok(Math.abs(await page.evaluate(()=>scrollY)-readingY)<5,'back restores the reading position');
    await page.getByRole('button',{name:'내 주변',exact:true}).click();await page.getByRole('heading',{name:'주변 레이더'}).waitFor();
    await checkCompass(page,'.radar-scope','.radar-bearings text','.scope-person');
    await capture('radar-mobile');
    await page.reload();await page.getByRole('heading',{name:'주변 레이더'}).waitFor();
    await checkCompass(page,'.radar-scope','.radar-bearings text','.scope-person');await expectHome();
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
    await page.getByText('내 책방 답변').waitFor();
    await page.getByRole('button',{name:'공개 소개 수정'}).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();await capture('profile-editor');
    await dialog.getByRole('link',{name:'아지트로',exact:true}).click();await page.waitForURL('**/world.html');
    await page.goto(origin+project+'station.html?view=radar');
    await page.getByRole('heading',{name:'주변 레이더'}).waitFor();
    await checkCompass(page,'.radar-scope','.radar-bearings text','.scope-person');
    await selectMenu('내 파장');await page.setViewportSize({width:1080,height:840});
    await page.screenshot({path:path.join(dir,'pajang-profile-desktop.png'),animations:'disabled'});
    await selectMenu('오늘');await answers.waitFor();await capture('home-desktop');await mast.click();await page.waitForURL('**/world.html');
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('link',{name:/^파장 열기/}).click();
    await page.waitForURL('**/station.html');await nav.waitFor();
    await page.evaluate(()=>{sessionStorage.fixtureMode='new';sessionStorage.removeItem('pajang:answered-round');});
    await page.goto(origin+'/world.html#pajang-radar');
    await page.evaluate(()=>{window.hostMarker='stay';});
    await page.getByRole('link',{name:/^파장 열기/}).click();
    const frame=page.frameLocator('iframe');await frame.getByRole('heading',{name:'처음 만난 날, 어떤 이야기를 나누고 싶나요?'}).waitFor();
    await capture('entry-mobile');
    assert.equal(await frame.locator('#marks button').count(),0,'sample radar does not block the question');
    await frame.locator('.sample-radar summary').click();
    await frame.locator('#marks button').first().waitFor();
    await checkCompass(frame,'#scope','.rose b','#marks button:nth-child(2)');
    await frame.getByRole('link',{name:'아지트로',exact:true}).click();await page.locator('dialog').waitFor({state:'detached'});
    assert.equal(await page.evaluate(()=>window.hostMarker),'stay');
    assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-pajang-launch')),true);
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
    await page.getByText('내 책방 답변').waitFor();
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
      await expectHome();await mast.click();await page.waitForURL('**/world.html');
    }
    console.log('PASS three primary destinations, direct acceptance, scroll-stable home exit, modal exit, direct legacy routes, thread reload/back, join handoff, guest/denied returns and embedded focus restoration');
    console.log('PASS single remote identity check, two requested illustrations out of six, zero rereads after join, delayed-send draft, retry identity, concurrent reads and late signal acceptance');
    // Closing an immediate popup while its member request is pending leaves Agit open.
    await page.evaluate(()=>{sessionStorage.fixtureMode='member';sessionStorage.openTiming='yes';sessionStorage.removeItem('pajang:answered-round');});
    await page.goto(origin+'/world.html?closing=1');
    await page.getByRole('link',{name:/^파장 열기/}).click();
    await page.getByRole('button',{name:'팝업 닫기'}).click();
    await page.waitForTimeout(500);
    assert.ok(page.url().endsWith('world.html?closing=1'));
    assert.equal(await page.locator('dialog').count(),0);
    for(const scenario of ['new','member-cold','member']){
      const timings=[];
      for(let attempt=0;attempt<5;attempt++){
        await page.evaluate(mode=>{sessionStorage.fixtureMode=mode==='new'?'new':'member';sessionStorage.openTiming='yes';
          if(mode!=='member')sessionStorage.removeItem('pajang:answered-round');
          delete sessionStorage.openMs;delete sessionStorage.openStart;},scenario);
        await page.goto(origin+'/world.html?timing='+attempt);
        await page.getByRole('link',{name:/^파장 열기/}).click();
        if(scenario!=='new')await page.waitForURL('**/station.html');
        await page.waitForFunction(()=>sessionStorage.openMs);
        timings.push(await page.evaluate(()=>Number(sessionStorage.openMs)));
      }
      console.log('PAJANG_OPEN_MS',scenario,JSON.stringify(timings),'median',timings.sort((a,b)=>a-b)[2]);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS 320/390/1080px layout, artwork-independent startup, tap/swipe/keyboard, delayed results, cancellation, in-memory revisit, and denial');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
