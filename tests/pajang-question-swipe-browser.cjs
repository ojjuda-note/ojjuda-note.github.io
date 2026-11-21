const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const feature = path.join(root, 'features/pajang');
const {build} = require(path.join(feature, 'node_modules/esbuild'));
const origin = 'https://pajang-question-swipe.test';
const address = origin + '/features/pajang/question-fixture.html';
const owner = '11111111-1111-4111-8111-111111111111';
const questionA = {day:'2026-11-21',slot:'pm',question:'어떤 영화 속 인물을 닮은 사람을 만나면 반가울까요?'};
const questionB = {day:'2026-11-20',slot:'pm',question:'함께 다시 걷고 싶은 길은 어디인가요?'};
const questionC = {...questionA,day:'2026-11-19'};
const answer = (peer,question,body,extra={}) => ({
  peer,name:'테스트 '+peer,region:'대전광역시',interest:'book',at:1,
  own:false,sent:false,received:false,relationship_intents:['conversation'],
  ...question,body,...extra
});
const a1 = answer('peer-a',questionA,'처음 만난 사람과 영화 이야기를 나누고 싶어요.',{sent:true,received:true});
const b1 = answer('peer-b',questionB,'나무 그늘이 있는 동네 길을 다시 걷고 싶어요.');
const aOwn = answer(owner,questionA,'긴답변도빠짐없이보여야해요'.repeat(15),{name:'내 계정',own:true});
const a2 = answer('peer-a2',questionA,'이전 페이지와 같은 질문에 달린 추가 답변이에요.');
const b2 = answer('peer-b2',questionB,'강변에서 바람을 맞으며 걷고 싶어요.');
const c1 = answer('peer-c',questionC,'같은 문장이어도 다른 날짜에 남긴 답변이에요.');
const keys = [
  answer('key-am',{...questionA,slot:'am'},'오전 답변'),
  answer('key-pm',questionA,'오후 답변'),
  answer('key-day',questionC,'다른 날짜 답변'),
  answer('key-wording',{...questionC,question:'같은 날짜라도 질문이 바뀌면 어떤가요?'},'다른 질문 답변')
];
const sample = {owner,a1,b1,aOwn,a2,b2,c1,keys,initial:[a1,b1,aOwn],more:[a1,a2,b2,c1]};

// Only account data and the RPC transport are fixtures. The component, grouping,
// gesture handlers, pagination controller and every stylesheet are production code.
function installFixture(data) {
  const state = {
    day:data.a1.day,slot:data.a1.slot,nextAt:new Date(Date.now()+3600000).toISOString(),
    authenticated:true,remaining:3,signals:[],messages:[],people:[],
    me:{id:data.owner,name:'내 계정',region:'대전광역시',interest:'book',body:'오늘의 내 답변'}
  };
  const control = window.questionSwipeFixture = {
    station:state,calls:[],actions:[],unexpected:[],holdMore:false,releaseMore:null
  };
  const ok = items => ({data:{items:structuredClone(items),total:items.length,nextCursor:null,remaining:3},error:null});
  window.pajangArt = {};
  window.pajangLoadArt = async()=>undefined;
  window.OjjudaGetClient = async()=>({rpc(name,args){
    let promise,signal;
    const query = {
      abortSignal(value){signal=value;return query;},
      then(resolve,reject){
        promise ||= Promise.resolve().then(async()=>{
          if(name!=='pajang_discovery_feed'){
            control.unexpected.push({name,args});throw Error('Unexpected RPC '+name);
          }
          control.calls.push(structuredClone(args));
          if(args.p_cursor&&control.holdMore)await new Promise(done=>{control.releaseMore=done;});
          if(signal?.aborted)throw new DOMException('Aborted','AbortError');
          const scenario=new URL(location.href).searchParams.get('fixture');
          if(scenario==='keys')return ok(data.keys);
          if(args.p_interest==='marriage')return ok([]);
          if(args.p_interest!=='all'||args.p_gender!=='all'||args.p_order!=='latest')return ok([data.a1,data.b1]);
          const split=scenario==='split';
          const result=ok(!args.p_cursor?data.initial:split
            ?args.p_cursor.page===2?data.more.filter(row=>row.peer!==data.c1.peer):[data.c1]
            :data.more);
          result.data.total=6;
          result.data.nextCursor=!args.p_cursor?{page:2}:split&&args.p_cursor.page===2?{page:3}:null;
          return result;
        });
        return promise.then(resolve,reject);
      }
    };
    return query;
  }});
}

async function touchPath(page,points,beforeRelease) {
  const client=await page.context().newCDPSession(page);
  const point=([x,y])=>({x,y,id:1,radiusX:2,radiusY:2,force:1});
  try {
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(points[0])]});
    for(const coordinate of points.slice(1)){
      await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(coordinate)]});
      await page.waitForTimeout(16);
    }
    if(beforeRelease)await beforeRelease();
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(100);
  } finally {await client.detach();}
}

async function swipe(page,direction,{short=false,vertical=false,target='heading',scroll=true,beforeRelease}={}) {
  const touchTarget=typeof target==='string'?page.locator(target==='body'
    ?'#answers .answer-group .answercard .quote':'#answers .answer-group header.question-carousel h3').first():target;
  if(scroll)await touchTarget.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
  const box=await touchTarget.boundingBox();
  assert.ok(box,'question panel has a visible touch target');
  const distance=short?16:Math.min(140,box.width*.6);
  const dx=vertical?8:(direction==='left'?-distance:distance);
  const dy=vertical?-110:2;
  const x=box.x+box.width/2-dx/2;
  const visibleTop=Math.max(20,box.y),visibleBottom=Math.min(page.viewportSize().height-40,box.y+box.height);
  assert.ok(visibleBottom>visibleTop,'touch target intersects the viewport');
  const y=(visibleTop+visibleBottom)/2;
  const before=await page.evaluate(()=>scrollY);
  const start=await page.locator('#answers .answer-group').evaluate(element=>({
    header:element.querySelector('h3').getBoundingClientRect().x,
    answer:element.querySelector('.quote').getBoundingClientRect().x
  }));
  await touchPath(page,Array.from({length:9},(_,i)=>[x+dx*i/8,y+dy*i/8]),beforeRelease?()=>beforeRelease(start):undefined);
  return {before,after:await page.evaluate(()=>scrollY)};
}

(async()=>{
  const built=await build({
    stdin:{contents:`import React from 'react';
      import {createRoot} from 'react-dom/client';
      import AnswerHistory from './src/app/answer-history';
      const fixture=window.questionSwipeFixture;
      const capture=(action)=>(value)=>fixture.actions.push({action,value:structuredClone(value)});
      createRoot(document.getElementById('fixture-root')).render(
        <AnswerHistory active={true} station={fixture.station} revision={0}
          onProfile={capture('profile')} onSignal={capture('signal')} onChat={capture('chat')}
          onWrite={capture('write')} onEdit={capture('edit')}/>
      );`,resolveDir:feature,sourcefile:'question-swipe-fixture.tsx',loader:'tsx'},
    bundle:true,write:false,jsx:'automatic',platform:'browser',target:'es2022',logLevel:'silent'
  });
  const stationTemplate=await fs.readFile(path.join(feature,'station.html'),'utf8');
  const styles=[...stationTemplate.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)]
    .map(match=>match[0]).filter(tag=>!tag.includes('https://'));
  const template=`<!doctype html><html lang="ko" data-world-theme="autumn" data-theme="light"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">${styles.join('\n')}
    <title>파장 질문 넘기기 검증</title></head><body><div id="station">
    <div class="station-layout"><main class="station-content wrap"><div id="fixture-root"></div>
    <div aria-hidden="true" style="height:1000px;flex:none"></div></main></div></div>
    <script src="/fixture.js"></script><script src="/program.js"></script></body></html>`;
  const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  let checkpoint='setup';
  const errors=[];
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ko-KR'});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/features/pajang/question-fixture.html')return route.fulfill({contentType:'text/html',body:template});
      if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:`(${installFixture.toString()})(${JSON.stringify(sample)});`});
      if(url.pathname==='/program.js')return route.fulfill({contentType:'text/javascript',body:built.outputFiles[0].text});
      if(!/\.(?:css|svg|woff2?|webp|png)$/.test(url.pathname))return route.abort();
      const file=path.resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+path.sep))return route.abort();
      try{return await route.fulfill({path:file});}catch{return route.fulfill({status:404,body:''});}
    });
    const page=await context.newPage();page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(error.message));
    const screenshots=path.join(root,'tests/artifacts/pajang-discovery');
    await fs.mkdir(screenshots,{recursive:true});
    const active=()=>page.locator('#answers .answer-group');
    const viewport=()=>page.locator('#answers .question-viewport');
    const previous=()=>active().getByRole('button',{name:'이전 질문',exact:true});
    const next=()=>active().getByRole('button',{name:'다음 질문',exact:true});
    const header=()=>active().locator('header.question-carousel');
    const positions=()=>active().evaluate(element=>({
      header:element.querySelector('h3').getBoundingClientRect().x,
      answer:element.querySelector('.quote').getBoundingClientRect().x
    }));
    const reset=async(query='')=>{
      await page.goto(address+query);
      await page.locator('#answers .cardgrid[aria-busy="false"]').waitFor();
      await header().waitFor();
    };
    const shown=async(rows,index,count)=>{
      await page.waitForFunction(({bodies})=>{
        const visible=[...document.querySelectorAll('#answers .answer-group .answercard .quote')].map(node=>node.textContent);
        return document.querySelector('#answers .question-viewport')?.dataset.moving==='false'
          &&document.querySelector('#answers .question-track')?.getAnimations().every(animation=>animation.playState!=='running')
          &&JSON.stringify(visible)===JSON.stringify(bodies);
      },{bodies:rows.map(row=>row.body)});
      assert.equal(await page.locator('#answers .answer-group').count(),1,'only one question group is rendered');
      assert.equal(await header().locator('h3').textContent(),rows[0].question,'header belongs to its answers');
      assert.equal(await header().locator('time').getAttribute('datetime'),rows[0].day);
      assert.match(await header().locator('time').textContent(),rows[0].slot==='am'?/오전/:/오후/);
      assert.match(await active().locator('.question-position').textContent(),new RegExp(index+'\\s*/\\s*'+count+'(?:\\D|$)'));
    };

    await reset();
    checkpoint='nonadjacent answers and action ownership';
    await shown([a1,aOwn],1,2);
    assert.equal(await previous().isDisabled(),true,'first question has no previous action');
    assert.equal(await header().getAttribute('tabindex'),'0','question has a keyboard focus target');
    await active().locator('.answercard').filter({hasText:aOwn.body}).getByRole('button',{name:'답변 수정',exact:true}).click();
    await active().locator('.answercard').filter({hasText:a1.body}).getByRole('button',{name:'대화하기',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>questionSwipeFixture.actions),[
      {action:'edit',value:aOwn},{action:'chat',value:a1.peer}
    ],'edit and matched chat preserve the selected row and person');

    checkpoint='real mobile touch gestures';
    await swipe(page,'left',{short:true});await shown([a1,aOwn],1,2);
    const vertical=await swipe(page,'left',{vertical:true});await shown([a1,aOwn],1,2);
    assert.ok(vertical.after>vertical.before,'vertical touch still scrolls the page: '+JSON.stringify(vertical));
    const original=await positions();
    await swipe(page,'left',{target:'body',short:true});await shown([a1,aOwn],1,2);
    const restored=await positions();
    assert.ok(Math.abs(restored.header-original.header)<1&&Math.abs(restored.answer-original.answer)<1,
      'a short body drag returns the complete question and answers to their starting position');
    const bodyVertical=await swipe(page,'left',{target:'body',vertical:true});await shown([a1,aOwn],1,2);
    assert.ok(bodyVertical.after>bodyVertical.before,'vertical touch on an answer still scrolls: '+JSON.stringify(bodyVertical));

    checkpoint='question and answers follow the same body drag';
    const actionsBeforeDrag=await page.evaluate(()=>questionSwipeFixture.actions.length);
    await swipe(page,'left',{target:'body',beforeRelease:async start=>{
      const moved=await positions();
      const headingShift=moved.header-start.header,answerShift=moved.answer-start.answer;
      assert.ok(headingShift<=-50,'question follows the finger by at least 50px: '+headingShift);
      assert.ok(Math.abs(headingShift-answerShift)<1,'question and answer move together: '+JSON.stringify({headingShift,answerShift}));
      assert.equal(await viewport().getAttribute('data-dragging'),'true');
      const previews=page.locator('#answers .question-preview');
      assert.ok(await previews.count()>0,'the adjacent question is visible while dragging');
      assert.equal(await previews.evaluateAll(nodes=>nodes.every(node=>node.inert&&node.getAttribute('aria-hidden')==='true')),true,
        'preview panels do not expose duplicate actions to keyboards or screen readers');
      assert.equal(await page.locator('#selected-question').count(),1);
      assert.equal(await page.locator('#question-answers').count(),1);
      await viewport().screenshot({path:path.join(screenshots,'question-panel-drag-390.png')});
    }});
    await shown([b1],2,2);
    assert.equal(await page.evaluate(()=>questionSwipeFixture.actions.length),actionsBeforeDrag,
      'dragging an answer never activates a profile, signal, chat or edit action');
    await active().locator('.answercard .person').click();
    await active().getByRole('button',{name:'신호 보내기',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>questionSwipeFixture.actions.slice(-2)),[
      {action:'profile',value:b1},{action:'signal',value:b1}
    ],'profile and signal use the newly selected question row');
    await swipe(page,'right');await shown([a1,aOwn],1,2);

    checkpoint='buttons and keyboard';
    await next().click();await shown([b1],2,2);
    await previous().click();await shown([a1,aOwn],1,2);
    await header().focus();await page.keyboard.press('ArrowRight');await shown([b1],2,2);
    await header().focus();await page.keyboard.press('ArrowLeft');await shown([a1,aOwn],1,2);
    await header().focus();await page.keyboard.press('ArrowLeft');await shown([a1,aOwn],1,2);

    checkpoint='a swipe from a long answer brings the next question into view';
    const longAnswer=active().locator('.answercard').filter({hasText:aOwn.body}).locator('.quote');
    await longAnswer.evaluate(element=>window.scrollTo({top:scrollY+element.getBoundingClientRect().bottom-innerHeight*.4,behavior:'instant'}));
    assert.ok((await header().boundingBox()).y<0,'the previous heading is above the visible viewport');
    await swipe(page,'left',{target:longAnswer,scroll:false});await shown([b1],2,2);
    const nextHeading=await header().boundingBox();
    assert.ok(nextHeading.y>=-1&&nextHeading.y+nextHeading.height<=page.viewportSize().height,
      'the next question is visible after swiping from deep in a long answer: '+JSON.stringify(nextHeading));
    await previous().click();await shown([a1,aOwn],1,2);

    checkpoint='page boundary loads more answers and then advances';
    await next().click();await shown([b1],2,2);
    await page.evaluate(()=>{questionSwipeFixture.holdMore=true;});
    await next().click();
    await page.waitForFunction(()=>typeof questionSwipeFixture.releaseMore==='function');
    await shown([b1],2,2);
    assert.equal(await header().isVisible(),true,'the current question stays visible while the next page loads');
    const loadingPanel=await active().boundingBox(),loadingViewport=await viewport().boundingBox();
    assert.ok(Math.abs(loadingPanel.x-loadingViewport.x)<=1,'loading does not slide the current answers off screen');
    assert.equal(await page.evaluate(()=>questionSwipeFixture.calls.filter(call=>call.p_cursor).length),1);
    await page.evaluate(()=>questionSwipeFixture.releaseMore());
    await shown([c1],3,3);
    assert.equal(await next().isDisabled(),true,'exhausted last page has no next action');
    await previous().click();await shown([b1,b2],2,3);
    await previous().click();await shown([a1,aOwn,a2],1,3);
    assert.equal(await active().locator('.answercard').count(),3,'duplicate row from another page is not repeated');
    await active().getByRole('button',{name:'신호 보내기',exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>questionSwipeFixture.actions.at(-1)),{action:'signal',value:a2});

    checkpoint='manual pagination keeps the chosen question';
    await reset();
    await page.getByRole('button',{name:'답변 더 보기',exact:true}).click();
    await shown([a1,aOwn,a2],1,3);

    checkpoint='boundary continues through pages containing only known questions';
    await reset('?fixture=split');
    await next().click();await shown([b1],2,2);
    await next().click();await shown([c1],3,3);
    assert.deepEqual(await page.evaluate(()=>questionSwipeFixture.calls.filter(call=>call.p_cursor).map(call=>call.p_cursor)),
      [{page:2},{page:3}],'one next action passes a page of existing answers before reaching the next question');
    await previous().click();await shown([b1,b2],2,3);

    checkpoint='previous action cancels pending boundary navigation';
    await reset();
    await next().click();await shown([b1],2,2);
    await page.evaluate(()=>{questionSwipeFixture.holdMore=true;});
    await next().click();
    await page.waitForFunction(()=>typeof questionSwipeFixture.releaseMore==='function');
    await previous().click();await shown([a1,aOwn],1,2);
    await page.evaluate(()=>questionSwipeFixture.releaseMore());
    await shown([a1,aOwn,a2],1,3);

    checkpoint='filters gender and sort reset to their first question';
    await next().click();await shown([b1,b2],2,3);
    await page.locator('.relationship-filters').getByRole('button',{name:'대화',exact:true}).click();
    await shown([a1],1,2);
    await next().click();await shown([b1],2,2);
    await page.getByRole('radio',{name:'여성 답변',exact:true}).check();
    await shown([a1],1,2);
    await next().click();await shown([b1],2,2);
    await page.getByRole('combobox',{name:'답변 정렬',exact:true}).selectOption('local');
    await shown([a1],1,2);
    assert.deepEqual(await page.evaluate(()=>{
      const {p_interest,p_gender,p_order}=questionSwipeFixture.calls.at(-1);
      return {p_interest,p_gender,p_order};
    }),{p_interest:'conversation',p_gender:'female',p_order:'local'});

    checkpoint='empty filter never retains the previous question';
    await page.locator('.relationship-filters').getByRole('button',{name:'결혼',exact:true}).click();
    await page.locator('#answers .empty').waitFor();
    assert.equal(await header().count(),0);
    assert.equal(await active().locator('.answercard').count(),0);
    await page.getByRole('button',{name:'전체 답변 보기',exact:true}).click();
    await shown([a1],1,2);

    checkpoint='day slot and question wording identify separate groups';
    await reset('?fixture=keys');
    for(let i=0;i<keys.length;i++){
      await shown([keys[i]],i+1,keys.length);
      if(i<keys.length-1)await next().click();
    }

    checkpoint='320 390 and 750 pixel layouts';
    await reset();
    for(const width of [320,390,750]){
      await page.setViewportSize({width,height:width===750?750:844});
      const dimensions=await page.locator('#answers').evaluate(element=>({
        viewport:innerWidth,page:document.documentElement.scrollWidth,
        header:element.querySelector('.answer-group header.question-carousel').getBoundingClientRect().toJSON(),
        group:element.querySelector('.answer-group').getBoundingClientRect().toJSON(),
        overflow:[...element.querySelectorAll('.answer-group .question-carousel,.answer-group .answercard,.answer-group .quote')]
          .filter(node=>node.scrollWidth>node.clientWidth+1).map(node=>node.className)
      }));
      assert.ok(dimensions.page<=width+1,'page fits '+width+'px: '+JSON.stringify(dimensions));
      assert.ok(dimensions.header.left>=-1&&dimensions.header.right<=width+1,'question fits '+width+'px');
      assert.ok(dimensions.group.left>=-1&&dimensions.group.right<=width+1,'answers fit '+width+'px');
      assert.deepEqual(dimensions.overflow,[],'question and long answers have no horizontal overflow at '+width+'px');
      await page.locator('.answer-group').screenshot({path:path.join(screenshots,'question-colors-'+width+'-1.png'),animations:'disabled'});
      await next().click();
      await shown([b1],2,2);
      await page.locator('.answer-group').screenshot({path:path.join(screenshots,'question-colors-'+width+'-2.png'),animations:'disabled'});
      await previous().click();
      await shown([a1,aOwn],1,2);
    }
    await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});
    await page.locator('.answer-group').screenshot({path:path.join(screenshots,'question-colors-dark-1.png'),animations:'disabled'});
    await next().click();
    await shown([b1],2,2);
    await page.locator('.answer-group').screenshot({path:path.join(screenshots,'question-colors-dark-2.png'),animations:'disabled'});

    checkpoint='reduced motion changes the question without a sliding panel';
    await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({reducedMotion:'reduce'});
    await reset();await shown([a1,aOwn],1,2);
    await swipe(page,'left',{target:'body',beforeRelease:async start=>{
      const current=await positions();
      assert.ok(Math.abs(current.header-start.header)<1&&Math.abs(current.answer-start.answer)<1,
        'reduced motion avoids moving the question and answer panel during a swipe');
    }});
    await shown([b1],2,2);
    await previous().click();
    assert.equal(await viewport().getAttribute('data-moving'),'false','reduced motion skips the slide transition');
    await shown([a1,aOwn],1,2);
    assert.deepEqual(await page.evaluate(()=>questionSwipeFixture.unexpected),[]);
    assert.deepEqual(errors,[],'no browser runtime errors');
    console.log('PASS pajang question swipe: whole-panel drag, body touch, scroll, keyboard, callbacks, pagination, filters, reduced motion, 320/390/750px');
    await context.close();
  } catch(error) {
    error.message='['+checkpoint+'] '+error.message;
    throw error;
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
