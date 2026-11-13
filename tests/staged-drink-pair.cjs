const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium}=require('playwright');

const names=['다은','하늘'];
function roomFor(kind){
  const code='A123BC', mutations=[], issues=[], requestIds=new Set();
  let revision=0, round=1, seats=0, phase='waiting', turn=0;
  let hands=[5,5], replies=[null,null], question='';
  function reset(){
    phase='prompt';turn=0;hands=[5,5];replies=[null,null];question='';
  }
  function state(me){
    const game={phase,turn,current:kind==='fingers'?turn%2:0};
    if(kind==='fingers')game.fingers=hands.slice();
    if(question)game.question=question;
    if(phase==='answer'||phase==='vote'){
      game.mine=replies[me]!==null;
      game.submitted=replies.filter(v=>v!==null).length;
    }
    if(phase==='done'){
      if(kind==='fingers')game.losers=[0,1].filter(i=>hands[i]===0);
      else{
        game.counts=[0,1].map(seat=>replies.filter(target=>target===seat).length);
        game.winners=[0,1].filter(seat=>game.counts[seat]===Math.max(...game.counts));
      }
    }
    return {code,title:'술게임 테스트',players:names.slice(0,seats),me,kind,capacity:2,
      revision,round,phase,serverMs:Date.now(),game};
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
      if(phase==='prompt'){
        assert.equal(me,kind==='fingers'?turn%2:0);assert.equal(action,kind==='fingers'?'finger_prompt':'image_prompt');
        assert.ok(options.question.trim());question=options.question;phase=kind==='fingers'?'answer':'vote';
      }else{
        assert.equal(replies[me],null);
        if(kind==='fingers'){
          assert.equal(phase,'answer');assert.equal(action,'finger_answer');assert.equal(typeof options.fold,'boolean');
          replies[me]=options.fold;
        }else{
          assert.equal(phase,'vote');assert.equal(action,'image_vote');assert.ok([0,1].includes(options.target));replies[me]=options.target;
        }
        if(replies.every(v=>v!==null)){
          if(kind==='imagevote')phase='done';
          else{
            hands=hands.map((count,i)=>count-Number(replies[i]));phase=hands.includes(0)?'done':'prompt';
            if(phase==='prompt'){turn++;question='';replies=[null,null];}
          }
        }
      }
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
    assert.match(await goBack.getAttribute('href'), /ojjuda-party-arcade-lab.*#(?:fingers|imagevote)$/);
    const capacity=host.locator('#entry [name=capacity]');
    await capacity.waitFor();
    assert.deepEqual(await capacity.locator('option').evaluateAll(o=>o.map(x=>+x.value)),Array.from({length:11},(_,i)=>i+2));
    await capacity.selectOption('2');await host.locator('[name=password]').fill('test123');await click(host,'#entry [type=submit]');
    await visible(host,'[data-do=copy]');assert.ok(host.url().includes(room.code));
    await guest.goto(url+'?room='+room.code);await guest.locator('[name=password]').fill('wrong123');await click(guest,'#entry [type=submit]');
    await guest.getByText('방 비밀번호가 맞지 않아요.').waitFor();
    await guest.locator('[name=password]').fill('test123');await click(guest,'#entry [type=submit]');
    await visible(guest,'[data-do=leave]');await guest.reload();await visible(guest,'[data-do=leave]');
    const rounds=kind==='fingers'?5:1;
    for(let turn=0;turn<rounds;turn++){
      const author=pages[turn%2],peer=pages[1-turn%2];
      await visible(author,'#pair-form');
      assert.equal(await peer.locator('#pair-form').count(),0);
      if(turn===0){
        await click(author,'#pair-suggest');
        assert.ok((await author.locator('#pair-question').inputValue()).trim());
      }
      const question=(kind==='fingers'?'손 접기':'분위기 메이커')+' <b>질문</b> '+(turn+1);
      await author.locator('#pair-question').fill(question);
      await click(author,'#pair-form [type=submit]');
      await peer.getByText(question,{exact:true}).waitFor();
      assert.equal(await peer.locator('#game b').filter({hasText:'질문'}).count(),0);
      if(kind==='fingers'){
        for(const p of pages){await visible(p,'[data-fold=yes]');await visible(p,'[data-fold=no]');}
        await click(host,'[data-fold=yes]');
      }else{
        for(let i=0;i<2;i++){
          await visible(pages[i],'[data-seat="'+(1-i)+'"]');
          await visible(pages[i],'[data-seat="'+i+'"]');
        }
        await click(host,'[data-seat="0"]');
      }
      await visible(host,'[data-submitted]');
      if(turn===0){
        await host.reload();await visible(host,'[data-submitted]');
        assert.equal(await host.locator('[data-fold], [data-seat]').count(),0);
        if(kind==='imagevote')for(const p of pages){assert.equal(await p.locator('[data-result]').count(),0);assert.doesNotMatch(await p.locator('#game').innerText(),/\d+표/);}
      }
      await click(guest,kind==='fingers'?'[data-fold=yes]':'[data-seat="0"]');
      if(turn+1<rounds)await visible(pages[(turn+1)%2],'#pair-form');
    }
    for(const p of pages){
      await visible(p,'[data-result]');const rows=p.locator('.pair-scores li');
      assert.equal(await rows.count(),2);
      for(const name of names){
        const row=rows.filter({hasText:name});
        assert.equal(await row.count(),1);
        assert.match(await row.innerText(),kind==='imagevote'?(name===names[0]?/2\s*표/:/0\s*표/):/0/);
      }
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
  try{for(const game of ['fingers','imagevote'])await run(browser,game);}
  finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
