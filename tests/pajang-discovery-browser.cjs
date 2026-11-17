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
  {...base,peer:'b',name:'단비',interest:'walk',question:'처음 만났을 때 편해지는 순간은 언제예요?',body:'나란히 걸으면서 같은 풍경을 보고 웃을 때요.'},
];

function clientFixture(hash) {
  return `
    const state=${JSON.stringify(state)}, rows=${JSON.stringify(rows)};
    const mode=sessionStorage.fixtureMode||'member';
    const friend={id:'peer1',name:'라온',age:28,interest:'walk',region:'경기도'};
    const offered={id:'peer2',name:'유진',age:30,interest:'book',region:'서울특별시'};
    state.people=[friend,offered];state.signals=[{src:'me',dst:'peer1'},{src:'peer1',dst:'me'},{src:'peer2',dst:'me'}];
    const entry={...state,joined:mode!=='new',body:mode==='new'?'':state.me.body,nickname:'보리',
      question:{...state.question,answers:['책을 골라요.','같이 걸어요.','커피를 마셔요.']}};
    if(mode==='new')state.me.body='';
    window.feedCalls=[];window.heldGender=null;window.releaseFeed=null;
    const db={
      auth:{getUser:async()=>({data:{user:mode==='guest'?null:{id:'member'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      functions:{invoke:async()=>({data:{bucket:'fixture',files:{'station.js':'${hash}','radio.webp':'pending','book.webp':'pending'}}})},
      storage:{from:()=>({download:async key=>{
        if(key.endsWith('station.js'))return {data:await (await fetch('/program')).blob()};
        window.artPending=true;await new Promise(r=>window.addEventListener('finish-art',r,{once:true}));return {error:'fixture image unavailable'};
      }})},
      rpc:(name,p)=>{
        if(name==='pajang_member'){
          if(p.p_action==='entry' && mode==='denied')return Promise.resolve({error:{code:'42501'}});
          if(p.p_action==='entry')return Promise.resolve({data:entry});
          if(p.p_action==='thread')return Promise.resolve({data:[{id:'1',src:'peer1',dst:'me',body:'안녕하세요!',at:1}]});
          if(p.p_action==='participate'||p.p_action==='join'){sessionStorage.fixtureMode='member';entry.joined=true;}
          return Promise.resolve({data:state});
        }
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
      if(pathname==='/world.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/features/home/agit-hub.css"><title>아지트</title><script src="/config.js"></script><button data-pajang-launch>파장 열기</button><script type="module">import {openPajang} from "/features/pajang/dialog.mjs";document.querySelector("button").onclick=e=>openPajang(e.currentTarget);</script></html>'});
      const file=pathname.slice(project.length)||'index.html';
      if(!['station.html','station.css','member.mjs','member-main.mjs','load-station.mjs','nocturne.css','dialog-surface.css','assets/favicon.svg','shell.css','shell.mjs','index.html','entry.mjs','preview.mjs','preview.css','questions.mjs','regions.json','dialog.mjs','feed.html'].includes(file))return route.abort();
      const mime={html:'text/html',css:'text/css',mjs:'text/javascript',json:'application/json',svg:'image/svg+xml'}[path.extname(file).slice(1)];
      return route.fulfill({contentType:mime,body:await fs.readFile(path.join(feature,file))});
    });
    await page.goto(origin+project+'station.html#answers');
    const answers=page.locator('#answers'), cards=answers.locator('article'), group=answers.getByRole('radiogroup');
    const radio=value=>group.locator('input[value="'+value+'"]');
    const selected=async value=>assert.equal(await radio(value).isChecked(),true);
    await cards.nth(1).waitFor();
    assert.equal(await page.evaluate(()=>window.artPending),true,'feed is usable with all artwork still pending');
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
    await nav.waitFor();assert.equal(await nav.getByRole('link').count(),5);
    await expectHome();
    const capture=async name=>{
      await page.waitForTimeout(210);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:path.join(dir,'pajang-'+name+'.png'),animations:'disabled'});
    };
    await cards.first().waitFor();
    await page.evaluate(async()=>{
      const css=getComputedStyle(document.documentElement).getPropertyValue('--night-scene');
      const scene=new Image();
      scene.src=css.trim().slice(5,-2);
      await scene.decode();
    });
    await capture('home-mobile');
    await radio('female').tap();await cards.filter({hasText:rows[1].body}).waitFor();
    await answers.locator('article').first().scrollIntoViewIfNeeded();await expectHome();
    const readingY=await page.evaluate(()=>scrollY);
    await selectMenu('레이더');await page.getByRole('heading',{name:'주변 레이더'}).waitFor();
    await capture('radar-mobile');
    await page.goBack();await selected('female');await cards.filter({hasText:rows[1].body}).waitFor();
    assert.ok(Math.abs(await page.evaluate(()=>scrollY)-readingY)<5,'back restores the reading position');
    await selectMenu('레이더');await page.getByRole('heading',{name:'주변 레이더'}).waitFor();
    await page.reload();await page.getByRole('heading',{name:'주변 레이더'}).waitFor();await expectHome();
    await selectMenu('신호함');await page.getByRole('button',{name:'신호 수락하기'}).waitFor();
    await capture('inbox-mobile');
    await selectMenu('대화');await page.getByRole('button',{name:'대화 열기'}).click();
    await page.getByText('안녕하세요!',{exact:true}).waitFor();assert.ok(page.url().includes('chat=peer1'));
    const composer=page.getByRole('textbox',{name:'메시지',exact:true});
    await composer.fill('반가워요, 라온님.');
    await selectMenu('신호함');await page.goBack();
    await page.getByText('안녕하세요!',{exact:true}).waitFor();
    assert.equal(await composer.inputValue(),'반가워요, 라온님.');
    await capture('chat-mobile');
    await page.reload();await page.getByText('안녕하세요!',{exact:true}).waitFor();
    await page.goBack();await page.getByRole('button',{name:'대화 열기'}).waitFor();
    await selectMenu('내 파장');await page.getByRole('heading',{name:'내 파장'}).waitFor();
    await page.getByRole('button',{name:'공개 소개 수정'}).click();
    const dialog=page.getByRole('dialog');await dialog.waitFor();await capture('profile-editor');
    await dialog.getByRole('link',{name:'아지트로',exact:true}).click();await page.waitForURL('**/world.html');
    await page.goto(origin+project+'station.html?view=radar');
    await page.getByRole('heading',{name:'주변 레이더'}).waitFor();
    await selectMenu('내 파장');await page.setViewportSize({width:1080,height:840});
    await page.screenshot({path:path.join(dir,'pajang-profile-desktop.png'),animations:'disabled'});
    await selectMenu('오늘');await answers.waitFor();await mast.click();await page.waitForURL('**/world.html');
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>{sessionStorage.fixtureMode='new';window.hostMarker='stay';});
    await page.goto(origin+'/world.html#pajang-radar');
    await page.evaluate(()=>{window.hostMarker='stay';});
    await page.getByRole('button',{name:'파장 열기'}).click();
    const frame=page.frameLocator('iframe');await frame.getByRole('heading',{name:'처음 만난 날, 어떤 이야기를 나누고 싶나요?'}).waitFor();
    await capture('entry-mobile');
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
    for(const mode of ['guest','denied']){
      await page.evaluate(m=>{sessionStorage.fixtureMode=m;},mode);
      await page.goto(origin+project+'station.html');
      await page.locator('#gate p').filter({hasText:mode==='guest'?'로그인한':'이 계정은'}).waitFor();
      await expectHome();await mast.click();await page.waitForURL('**/world.html');
    }
    console.log('PASS five destinations, scroll-stable home exit, modal exit, direct legacy routes, thread reload/back, join handoff, guest/denied returns and embedded focus restoration');
    assert.deepEqual(errors,[]);
    console.log('PASS 320/390/1080px layout, artwork-independent startup, tap/swipe/keyboard, delayed results, cancellation, in-memory revisit, and denial');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
