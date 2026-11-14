'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const kinds=['bomb','liar','minority','mission','king','fingers','imagevote','truth','initial'];
async function main(){
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
 try {
  const p=await browser.newPage({viewport:{width:360,height:780}});
  p.setDefaultTimeout(6000);
  const errors=[],origin='https://admin.test';
  p.on('pageerror',e=>errors.push(String(e)));
  await p.route(origin+'/**',route=>{
    const pathname=new URL(route.request().url()).pathname;
    if(pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root"></main></body></html>'});
    const file=path.join(process.cwd(),pathname.slice(1));return route.fulfill({contentType:pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8',body:fs.readFileSync(file)});
  });
  await p.goto(origin);await p.addStyleTag({url:origin+'/admin/drinking-prompts.css'});
  await p.addScriptTag({url:origin+'/admin/drinking-prompts.js'});
  await p.evaluate(kinds=>{
    const table=kinds.flatMap((kind,i)=>Array.from({length:3},(_,row)=>({
      id:(i+1)*100+3-row,kind,revision:1,text:kind+' 기존 '+(3-row),
      ...(kind==='truth'?{flavor:row===1?'spicy':'mild'}:{}),
      ...(['mission','minority'].includes(kind)?{second:'짝 '+(3-row)}:{})
    })));
    const queue=[
      {id:23,kind:'king',text:'플레이어 제안 왕 명령'},
      {id:22,kind:'fingers',text:'플레이어 제안 조건'},
    ];
    const state={table,queue,actor:'admin',denied:false,stale:false,calls:[],nextId:5000};
    const ok=data=>({data,error:null}),err=message=>({data:null,error:{message,code:message==='not_admin'?'42501':'P0001'}});
    const client={
      auth:{onAuthStateChange(fn){state.authChanged=fn;return {data:{subscription:{unsubscribe(){}}}};}},
      async rpc(name,{p_action:a,p_options:o}){
        state.calls.push([name,a,JSON.parse(JSON.stringify(o))]);
        if(state.pause && a==='list'){state.pause=false;await new Promise(resolve=>{state.resume=resolve;});}
        if(state.denied)return err('not_admin');
        if(name==='drinking_prompt_suggestions'){
          if(a==='admin_list')return ok({items:[...queue],next:null});
          const idx=queue.findIndex(v=>v.id===o.id);
          if(idx>=0 && ['approve','reject'].includes(a)){
            const [item]=queue.splice(idx,1);if(a==='approve')table.push({...item,id:++state.nextId,revision:1});
            return ok({ok:true});
          }
        }
        if(name!=='drinking_content'||!kinds.includes(o.kind))throw Error('Unexpected RPC '+name+'/'+a);
        if(a==='list'){
          const rows=table.filter(r=>r.kind===o.kind&&(!o.q||(r.text+' '+(r.second||'')).includes(o.q))&&(!o.flavor||r.flavor===o.flavor)&&(!o.before||r.id<o.before)).sort((a,b)=>b.id-a.id);
          return ok({items:rows.slice(0,2),next:rows.length>2?rows[1].id:null});
        }
        if(a==='add'){table.push({...o,id:++state.nextId,revision:1});return ok({ok:true});}
        const item=table.find(r=>r.kind===o.kind&&r.id===o.id);if(!item)return err('invalid_id');
        if(state.stale){state.stale=false;item.revision++;item.text+=' 최신';}
        if(o.revision!==item.revision)return err('stale_revision');
        if(a==='edit'){Object.assign(item,o,{revision:item.revision+1});return ok({ok:true});}
        if(a==='delete'){table.splice(table.indexOf(item),1);return ok({ok:true});}
        throw Error('Unexpected action '+a);
      }
    };
    window.qa=state;
    state.module=OjjudaAdminDrinkingPrompts.mount({container:document.querySelector('#root'),client,getAdminId:()=>state.actor,isCurrent:()=>true});
  },kinds);
  const button=(name,scope=p)=>scope.getByRole('button',{name,exact:true});
  const row=word=>p.locator('article').filter({hasText:word});
  const picker=p.locator('#drink-catalog-kind'),editor=p.locator('.drink-admin-edit');
  const count=action=>p.evaluate(a=>qa.calls.filter(([,action])=>action===a).length,action);
  const choose=async kind=>{await picker.selectOption(kind);await row(kind+' 기존 3').first().waitFor();};
  await row('bomb 기존 3').waitFor();
  assert.deepEqual((await picker.locator('option').evaluateAll(nodes=>nodes.map(o=>o.value))).sort(),[...kinds].sort());
  await button('더 보기').click();await row('bomb 기존 1').waitFor();
  assert.ok((await p.evaluate(()=>qa.calls)).some(([,a,o])=>a==='list'&&o.kind==='bomb'&&o.before===102));
  for(const kind of kinds){
    await choose(kind);
    const card=row(kind+' 기존 3');
    if(kind==='mission'||kind==='minority'){
      assert.equal(await card.locator('dt').count(),2);
      assert.equal(await card.locator('strong').count(),0);
    }else{
      assert.equal(await card.locator('strong').innerText(),kind+' 기존 3');
      assert.equal(await card.locator('p').count(),kind==='truth'?1:0);
      if(kind==='truth')assert.equal(await card.locator('p').innerText(),'순한맛');
    }
  }
  await choose('mission');await button('새 항목 추가').click();
  await editor.locator('[name=text]').fill('주황 등대');await editor.locator('[name=second]').fill('파란 배');
  await button('저장',editor).click();await row('주황 등대').waitFor();
  assert.ok((await row('주황 등대').innerText()).includes('파란 배'));
  const record=await p.evaluate(()=>qa.table.find(r=>r.text==='주황 등대'));
  assert.equal(record.kind,'mission');assert.equal(record.second,'파란 배');
  await button('수정',row('주황 등대')).click();await editor.locator('[name=second]').fill('초록 산');
  await button('저장',editor).click();await row('초록 산').waitFor();
  const q=p.getByLabel('목록 검색',{exact:true});
  await q.fill('초록 산');await button('검색').click();await p.waitForFunction(()=>qa.calls.some(([,a,o])=>a==='list'&&o.q==='초록 산'));
  assert.equal(await p.locator('article').count(),1);
  p.once('dialog',d=>d.dismiss());await button('삭제',row('주황 등대')).click();assert.equal(await count('delete'),0);
  p.once('dialog',d=>d.accept());await button('삭제',row('주황 등대')).click();await row('주황 등대').waitFor({state:'detached'});assert.equal(await count('delete'),1);
  await choose('initial');await button('새 항목 추가').click();
  const n=await count('add');await editor.locator('[name=text]').fill('가나');await button('저장',editor).click();assert.equal(await count('add'),n);
  await editor.locator('[name=text]').fill('ㅈㅁ');await button('저장',editor).click();await row('ㅈㅁ').waitFor();
  await choose('truth');await p.getByLabel(/^질문 맛 필터/).selectOption('spicy');await button('검색').click();
  await p.waitForFunction(()=>qa.calls.some(([,a,o])=>a==='list'&&o.kind==='truth'&&o.flavor==='spicy'));
  await button('새 항목 추가').click();await editor.locator('[name=flavor]').selectOption('spicy');
  await editor.locator('[name=text]').fill('관리자가 만든 새 카드?');await button('저장',editor).click();
  await row('관리자가 만든 새 카드?').waitFor();
  await choose('liar');await button('수정',row('liar 기존 3')).click();await editor.locator('[name=text]').fill('잘못 덮어쓸 뻔한 말');
  await p.evaluate(()=>qa.stale=true);await button('저장',editor).click();await row('liar 기존 3 최신').waitFor();
  assert.equal(await row('잘못 덮어쓸 뻔한 말').count(),0);
  await button('등록 대기').click();await row('플레이어 제안 왕 명령').waitFor();
  assert.equal(await row('플레이어 제안 왕 명령').locator('p').innerText(),'왕게임');
  await button('등록',row('플레이어 제안 왕 명령')).click();await row('플레이어 제안 왕 명령').waitFor({state:'detached'});
  await button('반려',row('플레이어 제안 조건')).click();await row('플레이어 제안 조건').waitFor({state:'detached'});
  await button('게임별 질문·단어').click();await choose('king');await row('플레이어 제안 왕 명령').waitFor();
  await p.evaluate(()=>qa.denied=true);await button('새로고침').click();await row('플레이어 제안 왕 명령').waitFor({state:'detached'});
  assert.equal(await button('수정').count(),0);assert.equal(await button('삭제').count(),0);
  await p.evaluate(()=>{qa.denied=false;qa.pause=true;});await button('새로고침').click();
  await p.waitForFunction(()=>typeof qa.resume==='function');
  await p.evaluate(()=>{qa.actor='other';qa.authChanged('SIGNED_IN',{user:{id:'other'}});qa.resume();});
  await p.waitForFunction(()=>!document.querySelector('#root').children.length);
  assert.deepEqual(errors,[]);
  console.log('PASS administrator library, nine games, CRUD, pairs, initials, flavors, pagination, stale changes, moderation and permission/account transitions.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
