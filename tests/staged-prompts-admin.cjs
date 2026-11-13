'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');

async function main(){
 const root=process.argv[2]||process.cwd(),file=path.resolve(root,'admin/drinking-prompts.js');
 const executablePath=process.env.BROWSER_PATH||['/usr/bin/google-chrome','/usr/bin/chromium'].find(p=>fs.existsSync(p));
 const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main id="admin"></main>');
  await page.addScriptTag({path:file});
  await page.evaluate(()=>{
   const queue=[{id:20,kind:'truth',flavor:'mild',text:'<img src=x onerror=alert(1)> 누구?'},{id:19,kind:'fingers',flavor:null,text:'오늘 웃은 사람 접어!'},{id:18,kind:'king',flavor:null,text:'별명 만들기'}];
   const cards=[{id:4,kind:'truth',flavor:'mild',text:'기본 질문',revision:1}];
   window.calls=[];window.actor='reviewer';
   const client={
    auth:{onAuthStateChange(cb){window.changed=cb;return {data:{subscription:{unsubscribe(){}}}};}},
    async rpc(name,{p_action:act,p_options:opts}){
     window.calls.push([name,act,opts]);
     if(window.denied)return {error:{message:'not_admin',code:'42501'}};
     const {id,before,flavor,q}=opts;
     if(act==='admin_list'){
      const rows=queue.filter(r=>!before||r.id<before);
      return {data:{items:rows.slice(0,2),next:rows.length>2?rows[1].id:null}};
     }
     if(act==='approve'||act==='reject'){
      const i=queue.findIndex(r=>r.id===id);
      if(i<0)throw Error('invalid request');
      if(act==='approve'&&queue[i].kind==='truth')cards.push({...queue[i],id:30,revision:1});
      queue.splice(i,1);
      return {data:{ok:true}};
     }
     if(act==='truth_list')return {data:{items:cards.filter(r=>(!flavor||r.flavor===flavor)&&(!q||r.text.includes(q))),next:null}};
     const card=cards.find(r=>r.id===id);
     if(act==='truth_edit'){
      if(window.race){window.race=false;card.revision++;return {error:{message:'stale_revision'}};}
      if(!card||card.revision!==opts.revision)throw Error('bad edit revision');
      Object.assign(card,{text:opts.text,flavor:opts.flavor,revision:card.revision+1});return {data:{ok:true}};
     }
     if(act==='truth_delete'){
      if(!card||card.revision!==opts.revision)throw Error('bad delete revision');
      cards.splice(cards.indexOf(card),1);return {data:{ok:true}};
     }
     throw Error('unrecognized RPC');
    }
   };
   window.controller=window.OjjudaAdminDrinkingPrompts.mount({container:document.querySelector('#admin'),client,getAdminId:()=>window.actor,isCurrent:()=>true});
  });
  const button=(label,where=page)=>where.getByRole('button',{name:label,exact:true});
  const card=(txt)=>page.locator('article').filter({hasText:txt});
  const count=()=>page.locator('article').count(),state=()=>page.locator('[role=status]').innerText();
  await card('오늘 웃은 사람').waitFor();
  assert.equal(await count(),2);assert.equal(await page.locator('img').count(),0);
  await button('더 보기').click();await card('별명 만들기').waitFor();
  assert.deepEqual(await page.evaluate(()=>window.calls.find(([,a,o])=>a==='admin_list'&&o.before)?.[2]),{before:19});
  await button('등록',card('<img')).click();await card('<img').waitFor({state:'detached'});
  assert.match(await state(),/등록/);
  await button('반려',card('별명 만들기')).click();await card('별명 만들기').waitFor({state:'detached'});
  await button('진실게임 카드 관리').click();
  await card('<img').waitFor();await card('기본 질문').waitFor();assert.equal(await page.locator('img').count(),0);
  await page.getByLabel('질문 검색').fill('기본 질문');
  await page.getByLabel('질문 맛').selectOption('mild');await button('검색').click();
  await card('<img').waitFor({state:'detached'});assert.equal(await count(),1);
  assert.deepEqual(await page.evaluate(()=>window.calls.at(-1)[2]),{q:'기본 질문',flavor:'mild'});
  await button('수정',card('기본 질문')).click();
  const editor=()=>page.locator('form.drink-admin-edit');
  await editor().locator('textarea').fill('수정된 질문');await editor().locator('select').selectOption('spicy');
  await page.evaluate(()=>{window.race=true;});await button('저장',editor()).click();
  await page.getByText(/먼저 처리/).waitFor();
  await button('수정',card('기본 질문')).click();await editor().locator('textarea').fill('수정된 질문');
  await editor().locator('select').selectOption('spicy');await button('저장',editor()).click();
  await page.getByText(/카드를 수정했어요/).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.calls.findLast(([,a])=>a==='truth_edit')[2]),{id:4,revision:2,text:'수정된 질문',flavor:'spicy'});
  await page.getByLabel('질문 검색').fill('');await page.getByLabel('질문 맛').selectOption('spicy');await button('검색').click();
  await card('수정된 질문').waitFor();assert.match(await card('수정된 질문').textContent(),/빨간맛/);
  page.once('dialog',d=>d.dismiss());await button('삭제',card('수정된 질문')).click();
  assert.equal(await page.evaluate(()=>window.calls.filter(([,a])=>a==='truth_delete').length),0);
  page.once('dialog',d=>d.accept());await button('삭제',card('수정된 질문')).click();
  await card('수정된 질문').waitFor({state:'detached'});
  assert.deepEqual(await page.evaluate(()=>window.calls.findLast(([,a])=>a==='truth_delete')[2]),{id:4,revision:3});
  await button('등록 대기').click();await card('오늘 웃은 사람').waitFor();
  await page.evaluate(()=>{window.denied=true;});await button('새로고침').click();
  await page.getByText(/권한과 회원 정보/).waitFor();assert.equal(await count(),0);
  await page.evaluate(()=>{window.denied=false;});await button('새로고침').click();await card('오늘 웃은 사람').waitFor();
  await page.evaluate(()=>{window.actor=null;window.changed('SIGNED_OUT',null);});assert.equal(await page.locator('#admin').textContent(),'');
  assert.deepEqual(errors,[]);console.log('PASS admin mobile moderation, escaping, pagination, approve/reject, canonical edits, delete confirmation, race and access loss');
 } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
