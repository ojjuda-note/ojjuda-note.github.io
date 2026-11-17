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
    window.feedCalls=[];window.heldGender=null;window.releaseFeed=null;
    const db={
      auth:{getUser:async()=>({data:{user:{id:'member'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      functions:{invoke:async()=>({data:{bucket:'fixture',files:{'station.js':'${hash}','radio.webp':'pending','book.webp':'pending'}}})},
      storage:{from:()=>({download:async key=>{
        if(key.endsWith('station.js'))return {data:await (await fetch('/program')).blob()};
        window.artPending=true;await new Promise(r=>window.addEventListener('finish-art',r,{once:true}));return {error:'fixture image unavailable'};
      }})},
      rpc:(name,p)=>{
        if(name==='pajang_member')return Promise.resolve({data:p.p_action==='entry'?{joined:true}:state});
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
      if(pathname==='/program')return route.fulfill({contentType:'application/javascript',body:bundle});
      const file=pathname.slice(project.length);
      if(!['station.html','station.css','member.mjs','member-main.mjs','assets/favicon.svg'].includes(file))return route.abort();
      const mime={html:'text/html',css:'text/css',mjs:'text/javascript',svg:'image/svg+xml'}[path.extname(file).slice(1)];
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
    assert.deepEqual(errors,[]);
    console.log('PASS 320/390/1080px layout, artwork-independent startup, tap/swipe/keyboard, delayed results, cancellation, in-memory revisit, and denial');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
