const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

const names=['다은','하늘'];
function roomFor(kind){
  const code='A123BC', mutations=[], issues=[], requestIds=new Set();
  let revision=0, round=1, seats=0, phase='waiting', turn=0;
  const secret=73;
  let game={phase:'waiting'};
  function reset(){
    phase='guess';turn=0;game={phase,current:0,turn:0,low:1,high:100};
  }
  function state(me){
    return {code,title:'술게임 테스트',players:names.slice(0,seats),me,kind,capacity:2,
      revision,round,phase,serverMs:Date.now(),game:{...game}};
  }
  function call(me, rpc, q){
    try{
      assert.equal(rpc,'party_live_multiplayer');assert.equal(q.p_kind,kind);
      const action=q.p_action,options=q.p_options;
      if(action==='create'){
        assert.equal(me,0);assert.equal(options.capacity,2);assert.equal(options.password,'test123');
        seats=1;revision++;return state(me);
      }
      assert.equal(q.p_code,code);
      if(action==='join'){
        if(options.password!=='test123')return {error:'wrong_password'};
        assert.equal(seats,1);seats=2;reset();revision++;return state(me);
      }
      if(me>=seats)return {error:'not_room_member'};
      if(action==='state')return state(me);
      assert.equal(options.round,round);assert.ok(options.revision>0&&options.revision<=revision);
      assert.match(options.request_id,/^[\da-f-]{36}$/i);assert.ok(!requestIds.has(options.request_id));
      requestIds.add(options.request_id);mutations.push([action,me]);
      if(action==='again'){
        assert.equal(me,0);assert.equal(phase,'done');
        round++;reset();revision++;return state(me);
      }
      assert.equal(options.turn,turn);
      assert.equal(action,'updown_guess');assert.equal(phase,'guess');
      assert.equal(me,game.current);assert.ok(Number.isInteger(options.guess));
      const guess=options.guess;assert.ok(guess>=game.low&&guess<=game.high);
      const hint=guess===secret?'hit':guess<secret?'up':'down';
      turn++;game.turn=turn;
      if(hint==='hit'){phase='done';Object.assign(game,{phase,answer:secret,winner:me});}
      else{
        game.current=1-me;
        if(hint==='up')game.low=guess+1;else game.high=guess-1;
      }
      Object.assign(game,{lastGuess:guess,lastSeat:me,hint});
      revision++;return state(me);
    }catch(err){issues.push(err.stack);throw err;}
  }
  return {code,issues,mutations,call,round:()=>round};
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
  const visible=(p,selector)=>p.locator(selector).first().waitFor();
  const layout=async p=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'layout '+kind);
  try{
    await host.goto(url);
    const goBack=host.locator('header a');
    assert.match(await goBack.getAttribute('href'), /ojjuda-party-arcade-lab.*#updown$/);
    const capacity=host.locator('#entry [name=capacity]');
    await capacity.waitFor();
    assert.deepEqual(await capacity.locator('option').evaluateAll(o=>o.map(x=>+x.value)),Array.from({length:11},(_,i)=>i+2));
    await capacity.selectOption('2');await host.locator('[name=password]').fill('test123');await click(host,'#entry [type=submit]');
    await visible(host,'[data-do=copy]');assert.ok(host.url().includes(room.code));
    await guest.goto(url+'?room='+room.code);await guest.locator('[name=password]').fill('wrong123');await click(guest,'#entry [type=submit]');
    await guest.getByText('방 비밀번호가 맞지 않아요.').waitFor();
    await guest.locator('[name=password]').fill('test123');await click(guest,'#entry [type=submit]');
    await visible(guest,'[data-do=leave]');await guest.reload();await visible(guest,'[data-do=leave]');
    const range=async(p,lo,hi)=>p.locator('#updown-range').filter({hasText:new RegExp(lo+'\\s*~\\s*'+hi)}).waitFor();
    const play=async(seat,guess)=>{
      const [active,watch]=[pages[seat],pages[1-seat]];
      const form=active.locator('#updown-form');
      await form.waitFor();await watch.locator('#updown-form').waitFor({state:'detached'});
      await active.locator('#updown-guess').fill(String(guess));
      await form.locator('[type=submit]').click();
    };
    for(const p of pages)await range(p,1,100);
    const first=host.locator('#updown-guess');
    await first.fill('101');assert.ok(!await first.evaluate(el=>el.validity.valid));
    await click(host,'#updown-form [type=submit]');assert.equal(room.mutations.length,0);
    await play(0,50);
    for(const p of pages){await visible(p,'[data-hint=up]');await range(p,51,100);}
    await guest.reload();await range(guest,51,100);await visible(guest,'[data-hint=up]');
    await play(1,75);
    for(const p of pages){await visible(p,'[data-hint=down]');await range(p,51,74);}
    await play(0,73);
    for(const p of pages){
      await visible(p,'[data-result]');
      assert.match(await p.locator('[data-result]').innerText(),/다은/);
      assert.match(await p.locator('#game').innerText(),/73/);
      assert.equal(await p.locator('#updown-guess').count(),0);
    }
    await visible(host,'[data-do=again]');await guest.getByText('방장이 다음 판을 시작할 수 있어요.').waitFor();
    for(const p of pages)await layout(p);
    await click(host,'[data-do=again]');await guest.getByText(/2번째 판/).waitFor();
    await range(guest,1,100);await visible(host,'#updown-form');
    assert.equal(room.round(),2);assert.equal(await guest.locator('[data-do=again]').count(),0);
    assert.deepEqual(errors,[]);assert.deepEqual(room.issues,[]);
    console.log(kind+' two-device flow passed');
  }catch(e){console.error(kind,room.mutations,room.issues,errors);throw e;}
  finally{for(const p of pages)await p.context().close();}
}
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  try{await run(browser,'updown');}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
