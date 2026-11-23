const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const {JSDOM}=require('jsdom');
const {createQuestionFixture}=require('./fixtures/admin-pajang-question-suggestions.cjs');
const source=fs.readFileSync(path.join(__dirname,'../note/operations.js'),'utf8');

async function fixture(change=()=>{}) {
  const dom=new JSDOM('<!doctype html><main id="host"></main>',{url:'https://fixture.test/world.html',runScripts:'outside-only'});
  const w=dom.window,container=w.document.getElementById('host'),model=createQuestionFixture();
  change(model);w.eval(source);
  let current=true;
  const api=await w.OjjudaOperations.renderPajangQuestionSuggestions({client:model.client,container,isCurrent:()=>current});
  const settle=async()=>{for(let i=0;i<3;i++)await new Promise(setImmediate);};
  return {w,container,model,api,settle,
    button:label=>[...container.querySelectorAll('button')].find(button=>button.textContent===label),
    rows:()=>[...container.querySelectorAll('[data-question-suggestion-id]')],
    setCurrent:value=>{current=value;},
    close(){api?.destroy();dom.window.close();}};
}

test('question suggestions start with all server statuses and show author, received date and plain question text',async()=>{
  const f=await fixture(model=>{
    model.items[0].body='[파장 · 오늘의 질문 제안]\n첫 줄\n[파장 · 오늘의 질문 제안]\n<img src=x onerror="alert(1)">';
  });
  try {
    assert.deepEqual(f.model.calls,[{schema:'ojjuda_note',name:'admin_pajang_question_suggestions',args:{p_status:'all',p_limit:30,p_offset:0}}]);
    assert.equal(f.button('전체').getAttribute('aria-pressed'),'true');
    assert.equal(f.rows().length,30);
    const first=f.rows()[0],second=f.rows()[1];
    assert.equal(first.querySelector('[data-question-body]').textContent,'첫 줄\n[파장 · 오늘의 질문 제안]\n<img src=x onerror="alert(1)">','only the leading routing prefix is hidden');
    assert.equal(first.querySelector('img'),null,'question text is never parsed as HTML');
    assert.equal(first.querySelector('.ops-meta strong').textContent,f.model.items[0].nickname);
    assert.equal(first.querySelector('time').dateTime,f.model.items[0].created_at);
    assert.match(first.textContent,/답변 대기/);assert.match(second.textContent,/답변 완료/);
    assert.ok(second.textContent.includes(f.model.items[1].reply),'existing replies remain readable');
    assert.equal(f.container.querySelector('textarea,form,[contenteditable="true"]'),null,'the dedicated queue is read only');
    assert.equal(f.api.canLeave(),true);assert.equal(f.api.hasDraft(),false);
  } finally {f.close();}
});

test('question filters and pagination query the server and refresh preserves the current page',async()=>{
  const f=await fixture();
  try {
    f.button('다음').click();await f.settle();
    assert.deepEqual(f.model.calls.at(-1).args,{p_status:'all',p_limit:30,p_offset:30});
    assert.equal(f.rows().length,1);assert.equal(f.rows()[0].dataset.questionSuggestionId,f.model.items[30].id);
    assert.equal(f.button('다음'),undefined);
    await f.api.refresh();
    assert.deepEqual(f.model.calls.at(-1).args,{p_status:'all',p_limit:30,p_offset:30});
    f.button('이전').click();await f.settle();
    assert.equal(f.model.calls.at(-1).args.p_offset,0);assert.equal(f.rows().length,30);
    f.button('다음').click();await f.settle();
    f.button('답변 완료').click();await f.settle();
    assert.deepEqual(f.model.calls.at(-1).args,{p_status:'resolved',p_limit:30,p_offset:0});
    assert.equal(f.rows().length,15);assert.equal(f.button('이전'),undefined);
    f.button('답변 대기').click();await f.settle();
    assert.deepEqual(f.model.calls.at(-1).args,{p_status:'open',p_limit:30,p_offset:0});
    assert.equal(f.rows().length,16);
  } finally {f.close();}
});

test('empty question results and denied reads have distinct messages and a working retry',async()=>{
  const f=await fixture(model=>{model.items=[];});
  try {
    assert.match(f.container.textContent,/접수된 질문 제안이 없어요\./);
    assert.equal(f.button('다시 시도'),undefined);
    f.model.fail=true;await f.api.refresh();
    assert.match(f.container.textContent,/질문 제안 목록을 불러오지 못했어요/);
    assert.equal(f.container.textContent.includes('접수된 질문 제안이 없어요.'),false,'an RPC error is not presented as an empty queue');
    f.model.fail=false;f.model.items=createQuestionFixture().items.slice(0,1);
    f.button('다시 시도').click();await f.settle();
    assert.equal(f.rows().length,1);assert.equal(f.button('다시 시도'),undefined);
    assert.equal(f.model.calls.length,3);
  } finally {f.close();}
});

test('leaving a read-only question view is allowed during a request and its late result is ignored',async()=>{
  const f=await fixture();
  try {
    f.model.hold=true;const pending=f.api.refresh();await f.settle();
    assert.equal(typeof f.model.release,'function');
    assert.equal(f.api.canLeave(),true);assert.equal(f.api.hasDraft(),false);
    f.setCurrent(false);f.api.destroy();f.container.textContent='다음 관리자 화면';
    f.model.release();await pending;
    assert.equal(f.container.textContent,'다음 관리자 화면');
    assert.equal(await f.api.refresh(),false);
  } finally {f.close();}
});

test('a changed or missing account cannot receive question suggestions from an earlier session',async()=>{
  const guest=await fixture(model=>{model.owner=null;});
  try {assert.equal(guest.model.calls.length,0);assert.match(guest.container.textContent,/로그인한 뒤 관리자 메뉴를 다시 열어/);}
  finally {guest.close();}
  const f=await fixture();
  try {
    f.model.hold=true;const pending=f.api.refresh();await f.settle();
    f.model.auth('90000000-0000-4000-8000-000000000002');
    assert.match(f.container.textContent,/계정이 바뀌었어요/);
    f.model.release();await pending;
    assert.equal(f.rows().length,0);assert.match(f.container.textContent,/계정이 바뀌었어요/);
  } finally {f.close();}
});
