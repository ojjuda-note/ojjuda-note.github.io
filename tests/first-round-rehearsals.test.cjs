'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {chromium}=require('playwright');
const {browserSession,origin}=require('./helpers/drinking-browser-fixture.cjs');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');

// Numbers are positions on the actual playing surface, in row order.
// Strings click named game controls; input, clock and drag exercises use their native events.
const paths={
  sacheonseong:[0,2,1,3,6,8],mines:['⚑ 깃발 모드',3,5,8],solitaire:[2,0,3,1],chess:[9,5,5,2],janggi:[9,5,5,6],
  screw:[0,2,'↷ 뒷면으로',1],screw_flat:[0,3,2,4],ttang:[5,1,0],photo_ttang:[5,9,8],
  runner:['점프','점프','점프'],chacha_rush:['오른쪽 →','점프','부스터'],mole:[4,2],
  stacker:['블록 놓기','블록 놓기','블록 놓기'],breakout:[['range',76],'공 보내기',['wait',1880],['range',26],'공 보내기',['wait',1880]],
  saetbyeol:[6,2,2,5,'성장 · 첫 강화'],spot:['A 쭈다의 후드','B 왼쪽 뒤 자전거'],
  billiards:['샷'],carom3:['샷'],pool8:['샷'],onecard:[0,'원카드!',1,2],
  matgo:['내 1월 송학','1월 소나무 바닥패','스톱'],yut:['윷 던지기',0,2],tour:['주사위 굴리기','도시 매입 · 100만','다음 차례'],
  tank:['이동 →','이동 →'],bang:['빗나감!','맥주'],
  croc:[1,2],bottle:['위쪽 자리','술병 돌리기','멈추기',['bottle']],bomb:[0,['text','사과'],['text','포도']],
  stopwatch:['시작',['wait',120],'멈추기'],liar:['내 카드 보기','카드 가리기',['text','넓고 짭짤해요'],1],
  king:['역할 확인',0,2,'명령 내리기','패스'],truth:[0,2,'패스'],initial:['5초 시작',['text','수건']],
  minority:[1],mission:['제시어 보기','가리기','몸짓을 했어요',1],fingers:[1,'그대로 두기'],imagevote:[0,1],
  updown:[['text','50'],['text','65'],['text','59']],secretcount:['설정 닫기','누르기','턴 넘기기','누르기','누르기','누르기'],
  partyroulette:['결과 열기','다음 사람에게','결과 확인'],shapematch:['연습 시작','초록 동그라미']
};
async function act(pane,step){
  if(typeof step==='number')return pane.locator('[data-cell="'+step+'"]').click();
  if(typeof step==='string')return pane.getByRole('button',{name:step,exact:true}).click();
  const [op,val]=step;
  if(op==='wait')return pane.page().waitForTimeout(val);
  if(op==='range')return pane.getByRole('slider').fill(String(val));
  if(op==='text'){const input=pane.locator('.round-input input');await input.fill(val);return input.press('Enter');}
  if(op==='bottle'){
    const angle=await pane.locator('.bottle-needle').evaluate(el=>Number(el.style.transform.match(/rotate\((\d+)/)[1]));
    return pane.locator('.bottle-seat').nth(angle/120).click();
  }
}
test('all opening rounds finish with their actual controls and leave game state untouched',{timeout:240000},async t=>{
  const browser=await chromium.launch({headless:true,...(process.env.OJJUDA_CHROMIUM_PATH?{executablePath:process.env.OJJUDA_CHROMIUM_PATH}:{})});t.after(()=>browser.close());
  const errors=[];
  const f=await browserSession(browser,{actor:'practice-member',rpc:()=>({}),errors,viewport:{width:390,height:844}});
  const p=f.page;p.setDefaultTimeout(4500);
  await p.goto(origin+'/games/sacheonseong/');await p.locator('#options-open').click();await p.locator('#practice').click();
  const panel=p.locator('.round-pane:visible');
  await panel.waitFor();
  const music=fs.readFileSync(path.join(root,'shared/games/arcade-music.js'),'utf8').match(/const games = new Set\('([^']+)'/)[1].split(' ');
  assert.deepEqual(Object.keys(paths).sort(),[...music,'screw_flat','carom3','pool8'].sort());
  const partyStart=Object.keys(paths).indexOf('croc');
  for(const [index,[id,walk]] of Object.entries(paths).entries()){
    await t.test(id,async()=>{
      if(id==='croc')await p.goto(origin+'/tests/drinking-presentation-frame.html');
      if(index>=partyStart)await p.evaluate(kind=>{DrinkingPresentation.enter(kind,{local:true});if(!document.querySelector('[data-drinking-dialog]'))document.querySelector('[data-drinking-help]').click();},id);
      else if(id!=='sacheonseong')await p.evaluate(kind=>OjjudaArcadePractice.show(kind,{replay:true}),id);
      await p.locator('.round-pane[data-game="'+id+'"]:visible').waitFor();
      try{
        if(id==='sacheonseong'){
          await act(panel,0);await p.getByRole('button',{name:'동작별 도움말',exact:true}).click();
          assert.equal(await p.locator('.lesson-tab:visible').count(),3);
          await p.getByRole('button',{name:'첫 판 연습',exact:true}).click();
          assert.equal(await panel.locator('[data-cell="0"]').getAttribute('aria-pressed'),'true');
          await panel.getByRole('button',{name:'처음부터'}).click();
        }
        for(const step of walk)await act(panel,step);
        await p.locator('.round-pane[data-complete="true"]:visible').waitFor();
        assert.ok((await panel.locator('.rehearsal-feedback').innerText()).length>=10);
        assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
        const broken=await panel.locator('img').evaluateAll(async imgs=>{await Promise.all(imgs.map(i=>i.decode().catch(()=>{})));return imgs.filter(i=>!i.naturalWidth).map(i=>i.src);});
        assert.deepEqual(broken,[]);
        await p.locator('.lesson-actions .ap-done:visible').click();
        if(id==='sacheonseong')assert.equal(await p.locator('#timer').innerText(),'00:00.00');
      }finally{if(await panel.count())await p.locator('.lesson-actions .ap-skip:visible').click();}
    });
  }
  await p.evaluate(()=>{DrinkingPresentation.enter('partyroulette',{local:false});if(!document.querySelector('[data-drinking-dialog]'))document.querySelector('[data-drinking-help]').click();});
  await panel.waitFor();for(const action of [0,'준비 완료','결과 확인'])await act(panel,action);
  await p.locator('.round-pane[data-complete="true"]:visible').waitFor();
  assert.equal(f.calls.length,0);assert.deepEqual(errors,[]);
});
