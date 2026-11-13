const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

const names=['다은','하늘'];
const initialGame={
  bottle:{phase:'table',shape:'round',direction:'horizontal',positions:[null,null]},
  bomb:{phase:'setup',baseSeconds:20},
  stopwatch:{phase:'setup',target:50},
  truth:{phase:'setup'},
  initial:{phase:'ready',alive:[0,1],initial:'ㅅㄱ',current:0,turn:0}
};
const copy=o=>JSON.parse(JSON.stringify(o));
function roomFor(kind){
  const code='A123BC',mutations=[],issues=[];
  let revision=0,round=1,seats=0,game={phase:'waiting'};
  let scores=[null,null],requests=new Set();
  const patch=(next)=>{game={...game,...next};revision++;};
  function state(me){
    const publicGame=copy(game);
    if(kind==='stopwatch'&&game.phase==='measure'){
      publicGame.submitted=scores.filter(v=>v!=null).length;
      if(scores[me]!=null)publicGame.myScore=scores[me];
    }
    return {code,title:'연결 QA',players:names.slice(0,seats),me,kind,capacity:2,
      revision,round,phase:game.phase,serverMs:Date.now(),game:publicGame};
  }
  function call(me,rpc,q){
    try {
      assert.equal(rpc,'party_live_multiplayer');assert.equal(q.p_kind,kind);
      const action=q.p_action,o=q.p_options;
      if(action==='create'){
        assert.equal(me,0);assert.equal(o.capacity,2);assert.equal(o.password,'test123');
        seats=1;revision++;return state(me);
      }
      assert.equal(q.p_code,code);
      if(action==='join'){
        if(o.password!=='test123')return {error:'wrong_password'};
        assert.equal(seats,1);seats=2;game=copy(initialGame[kind]);revision++;return state(me);
      }
      if(me>=seats)return {error:'not_room_member'};
      if(action==='state')return state(me);
      assert.equal(o.round,round);assert.ok(o.revision>0&&o.revision<=revision);
      assert.match(o.request_id,/^[\da-f-]{36}$/i);assert.ok(!requests.has(o.request_id));requests.add(o.request_id);
      mutations.push([action,me]);
      if(action==='again'){
        assert.equal(me,0);assert.equal(game.phase,'done');
        round++;revision++;game=copy(initialGame[kind]);return state(me);
      }
      switch(kind+':'+action){
      case 'bottle:table':
        assert.equal(me,0);assert.equal(o.shape,'oval');assert.equal(o.direction,'vertical');
        patch({phase:'seating',shape:o.shape,direction:o.direction});break;
      case 'bottle:seat':{
        const positions=copy(game.positions);assert.ok(o.x>0&&o.y>0);positions[me]={x:o.x,y:o.y};patch({positions});break;}
      case 'bottle:spin':
        assert.equal(me,0);assert.ok(game.positions.every(Boolean));patch({phase:'spinning',spinAt:Date.now(),initialDeg:0});break;
      case 'bottle:brake':
        assert.equal(me,0);patch({phase:'braking',started:Date.now(),durationMs:14000,forwardMs:14000,returnMs:0,
          reverseDeg:0,travel:720,initialDeg:0,power:2});break;
      case 'bomb:configure':assert.equal(me,0);assert.equal(o.random,true);patch({phase:'ready',random:true});delete game.baseSeconds;break;
      case 'bomb:start':assert.equal(me,0);patch({phase:'active',topic:'과일',holder:0,turn:0});break;
      case 'bomb:pass':assert.equal(me,game.holder);assert.equal(o.turn,game.turn);patch({holder:1-me,turn:o.turn+1});break;
      case 'initial:start':assert.equal(me,game.current);assert.equal(o.turn,game.turn);patch({phase:'active',endsAt:Date.now()+5000});break;
      case 'initial:answer':assert.equal(me,game.current);assert.equal(o.turn,game.turn);patch({phase:'ready',turn:o.turn+1,current:1-me});break;
      case 'initial:out':assert.equal(me,game.current);assert.equal(o.turn,game.turn);patch({phase:'done',alive:[1-me],lastOut:me,winner:1-me,reason:'중복·오답'});break;
      case 'truth:truth_begin':
        assert.equal(me,0);assert.ok(o.deck.mild.length&&o.deck.spicy.length);patch({phase:'pick',turn:0});break;
      case 'truth:truth_pick':
        assert.equal(me,game.turn);assert.ok([0,1].includes(o.side));patch({phase:'answer',question:'재미있었던 일은?',flavor:'mild'});break;
      case 'truth:truth_answer':case 'truth:truth_pass':
        assert.equal(me,game.turn);patch({phase:me===1?'done':'pick',turn:1});delete game.question;delete game.flavor;break;
      case 'stopwatch:watch_begin':assert.equal(me,0);assert.equal(o.target,51);patch({phase:'measure',target:o.target});break;
      case 'stopwatch:watch_score':
        assert.equal(scores[me],null);assert.ok(Number.isInteger(o.score));scores[me]=o.score;
        if(scores.every(v=>v!=null))patch({phase:'done',scores});else revision++;break;
      default:assert.fail('Unknown feature action '+kind+':'+action);
      }
      return state(me);
    }catch(err){issues.push(err.stack);throw err;}
  }
  return {code,call,patch,issues,mutations,round:()=>round};
}
async function run(browser,kind){
  const room=roomFor(kind),pages=[],errors=[];
  for(let seat=0;seat<2;seat++){
    const context=await browser.newContext({viewport:{width:320,height:640},isMobile:true,hasTouch:true});
    const page=await context.newPage();page.setDefaultTimeout(12000);pages.push(page);
    page.on('pageerror',e=>errors.push(String(e)));
    await page.exposeFunction('qaRpc',(name,q)=>room.call(seat,name,q));
    await page.route('https://ojjuda.kr/**',async r=>{
      const path=new URL(r.request().url()).pathname;
      if(path==='/config.js'){
        const auth={data:{session:{user:{id:'qa-'+seat}}}};
        return r.fulfill({contentType:'text/javascript',body:'window.OjjudaGetClient=async()=>({auth:{getSession:async()=>('+JSON.stringify(auth)+'),onAuthStateChange(){}},rpc:(name,q)=>({abortSignal:async()=>({data:await window.qaRpc(name,q)})})});'});
      }
      if(!path.startsWith('/games/'))return r.abort();
      const file=path.slice(1)+(path.endsWith('/')?'index.html':'');
      if(!fs.existsSync(file))return r.abort();
      const type=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html';
      return r.fulfill({contentType:type,body:fs.readFileSync(file)});
    });
  }
  const [host,guest]=pages;
  const url='https://ojjuda.kr/games/'+kind+'/';
  const click=(p,selector)=>p.locator(selector).click();
  const act=(p,a)=>click(p,'[data-game-action="'+a+'"]');
  const visible=(p,selector)=>p.locator(selector).first().waitFor();
  const layout=async p=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'layout '+kind);
  try{
    await host.goto(url);
    const capacity=host.locator('#entry [name=capacity]');
    await capacity.waitFor();
    assert.deepEqual(await capacity.locator('option').evaluateAll(o=>o.map(x=>+x.value)),Array.from({length:11},(_,i)=>i+2));
    await capacity.selectOption('2');await host.locator('[name=password]').fill('test123');await click(host,'#entry [type=submit]');
    await visible(host,'[data-do=copy]');assert.ok(host.url().includes(room.code));
    await guest.goto(url+'?room='+room.code);await guest.locator('[name=password]').fill('wrong123');await click(guest,'#entry [type=submit]');
    await guest.getByText('방 비밀번호가 맞지 않아요.').waitFor();
    await guest.locator('[name=password]').fill('test123');await click(guest,'#entry [type=submit]');
    await visible(guest,'[data-do=leave]');await guest.reload();await visible(guest,'[data-do=leave]');
    if(kind==='bottle'){
      await host.getByText('타원형 테이블',{exact:true}).click();
      await host.getByText('세로',{exact:true}).click();
      await click(host,'#bottle-table [type=submit]');
      for(let i=0;i<2;i++){
        const surface=pages[i].locator('.bottle-hit');await surface.waitFor();await surface.focus();
        if(i)for(let j=0;j<8;j++)await surface.press('ArrowDown');
        if(i)for(let j=0;j<6;j++)await surface.press('ArrowRight');
        await surface.press('Enter');
      }
      await act(host,'spin');await visible(guest,'.bottle-board');await act(host,'brake');
      await host.getByRole('heading',{name:'서서히 멈추는 중…'}).waitFor();await layout(host);
      room.patch({phase:'done',winner:1,finalDeg:90});
      await guest.getByRole('heading',{name:'하늘님 당첨!'}).waitFor();
    }else if(kind==='bomb'){
      await click(host,'#bomb-random');await guest.getByRole('heading',{name:'랜덤 타이머'}).waitFor();
      assert.doesNotMatch(await guest.locator('#game').innerText(),/\d+초/);
      await act(host,'start');await click(host,'#bomb-pass');await visible(guest,'#bomb-pass');
      await click(guest,'#bomb-pass');await visible(host,'#bomb-pass');room.patch({phase:'done',loser:0});
      await guest.getByRole('heading',{name:'펑! 다은님 당첨!'}).waitFor();
    }else if(kind==='initial'){
      await click(host,'#initial-start');await click(host,'#initial-answer');
      await click(guest,'#initial-start');await click(guest,'#initial-out');await host.getByRole('heading',{name:'다은님 승리!'}).waitFor();
    }else if(kind==='truth'){
      await click(host,'#truth-begin');
      for(let i=0;i<2;i++){
        const active=pages[i],other=pages[1-i];await visible(active,'[data-truth-side]');
        assert.equal(await active.locator('[data-truth-side]').count(),2);
        assert.equal(await other.locator('[data-truth-side]').count(),0);
        await click(active,'[data-truth-side="'+i+'"]');
        await other.getByText('재미있었던 일은?',{exact:true}).waitFor();await layout(active);
        await act(active,i?'truth_pass':'truth_answer');
      }
    }else{
      await click(host,'#watch-plus');await click(host,'#watch-begin');
      for(let i=0;i<2;i++){
        const p=pages[i];await click(p,'#watch-start');
        await p.waitForFunction(()=>document.querySelector('#watch-reading')?.textContent==='–.––');
        await click(p,'#watch-stop');if(!i){await p.getByRole('heading',{name:/내 기록/}).waitFor();await p.reload();await p.getByRole('heading',{name:/내 기록/}).waitFor();}
      }
      for(const p of pages){await visible(p,'.watch-results');assert.equal(await p.locator('.watch-results tbody tr').count(),2);}
    }
    await visible(host,'[data-do=again]');await guest.getByText('방장이 다음 판을 시작할 수 있어요.').waitFor();
    for(const p of pages)await layout(p);
    await click(host,'[data-do=again]');await guest.getByText(/2번째 판/).waitFor();
    assert.equal(room.round(),2);assert.equal(await guest.locator('[data-do=again]').count(),0);
    assert.deepEqual(errors,[]);assert.deepEqual(room.issues,[]);
    console.log(kind+' two-device flow passed');
  }catch(e){console.error(kind,room.mutations,room.issues,errors);throw e;}
  finally{for(const p of pages)await p.context().close();}
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  try{for(const game of Object.keys(initialGame))await run(browser,game);}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
