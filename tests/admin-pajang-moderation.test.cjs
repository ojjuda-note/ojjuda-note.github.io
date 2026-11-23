const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(path.join(__dirname,'../admin/pajang-moderation.js'),'utf8');
const first = '10000000-0000-4000-8000-000000000001';
const second = '10000000-0000-4000-8000-000000000002';
const ownerId = '90000000-0000-4000-8000-000000000001';
const at = Date.parse('2026-11-19T03:00:00Z');
const clone = value => JSON.parse(JSON.stringify(value));
const answer = (overrides = {}) => ({person:first,day:'2026-11-19',slot:'am',name:'도담',question:'오늘 함께 하고 싶은 일은?',body:'책을 읽어요.',
  at,archived:false,publication_window_days:30,hidden:false,hidden_at:null,reason:'',...overrides});
const message = (index = 1, overrides = {}) => ({id:'20000000-0000-4000-8000-' + String(index).padStart(12,'0'),
  src:index % 2 ? first : second,dst:index % 2 ? second : first,body:'메시지 ' + index,at:at-index,
  hidden:false,hidden_at:null,reason:'',...overrides});
const deferred = () => {let resolve; const promise = new Promise(done => {resolve = done;}); return {promise,resolve};};

async function fixture({view='answers',initialState=null,answers=[answer()],messages=[message()],handler=null,owner=ownerId} = {}) {
  const dom = new JSDOM('<!doctype html><div id="host"></div>',{url:'https://fixture.test/world.html',runScripts:'outside-only'});
  const w = dom.window, container = w.document.querySelector('#host');
  w.eval(source);
  let current = true, authChanged = null, changed = 0, unsubscribed = 0;
  const calls = [], reads = [], data = {answers:clone(answers),messages:clone(messages)};
  const defaultReply = (rpc,args) => {
    if (rpc === 'admin_pajang_answers') {
      const rows = data.answers.filter(row => (args.p_status === 'all' || row.hidden === (args.p_status === 'hidden'))
        && (!args.p_query || [row.name,row.body,row.person].join(' ').includes(args.p_query)));
      return {data:{items:clone(rows.slice(args.p_offset,args.p_offset+args.p_limit)),total_count:rows.length}};
    }
    if (rpc === 'admin_pajang_chats') return {data:{items:[{first_person:first,second_person:second,first_name:'도담',second_name:'소담',
      message_count:data.messages.length,hidden_count:data.messages.filter(row => row.hidden).length,last_at:at}],total_count:1}};
    if (rpc === 'admin_pajang_chat_messages') return {data:{items:clone(data.messages.slice(args.p_offset,args.p_offset+args.p_limit)),total_count:data.messages.length,
      first_person:first,second_person:second,first_name:'도담',second_name:'소담'}};
    if (rpc === 'admin_pajang_moderate') {
      const row = args.p_kind === 'answer' ? data.answers.find(row => row.person === args.p_person && row.day === args.p_day && row.slot === args.p_slot)
        : data.messages.find(row => row.id === args.p_message_id);
      assert.ok(row,'moderation selects an existing synthetic record');
      row.hidden = args.p_action === 'hide'; row.hidden_at = row.hidden ? new Date(at).toISOString() : null; row.reason = row.hidden ? args.p_reason : '';
      return {data:{ok:true,kind:args.p_kind,hidden:row.hidden}};
    }
    throw Error('Unexpected RPC: ' + rpc);
  };
  const client = {
    rpc(rpc,args) {
      calls.push({rpc,args:clone(args)});
      const request = Promise.resolve().then(async () => {
        const result = handler ? await handler(rpc,args,data) : undefined;
        return result === undefined ? defaultReply(rpc,args) : result;
      });
      request.abortSignal = signal => {reads.push({rpc,signal});return request;};
      return request;
    },
    auth:{onAuthStateChange(callback) {authChanged = callback;return {data:{subscription:{unsubscribe() {unsubscribed++;}}}};}}
  };
  const api = w.OjjudaAdminPajang.mount({container,client,getAdminId:() => owner,isCurrent:() => current,initialState,view,onChanged:() => {changed++;}});
  const settle = async () => {for(let i=0;i<3;i++)await new Promise(resolve => setImmediate(resolve));};
  const select = selector => container.querySelector(selector);
  const submit = form => form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await settle();
  return {dom,w,container,api,calls,reads,data,select,submit,settle,
    button:label => [...container.querySelectorAll('button')].find(node => node.textContent === label),
    changed:() => changed, unsubscribed:() => unsubscribed,
    setHandler:next => {handler = next;}, setCurrent:value => {current = value;},
    setOwner:value => {owner = value;}, auth:user => authChanged?.(user ? 'SIGNED_IN' : 'SIGNED_OUT',user ? {user:{id:user}} : null),
    close() {api.destroy();dom.window.close();}};
}

test('answer search, visibility filters and paging send bounded server queries', async () => {
  const answers = Array.from({length:65},(_,index) => answer({person:'10000000-0000-4000-8000-' + String(index+1).padStart(12,'0'),
    name:index === 33 ? '찾을회원' : '회원 ' + index,hidden:index === 33,hidden_at:index === 33 ? new Date(at).toISOString() : null,reason:index === 33 ? '검토 중' : ''}));
  const f = await fixture({answers});
  try {
    assert.deepEqual(f.calls[0],{rpc:'admin_pajang_answers',args:{p_query:'',p_status:'all',p_limit:30,p_offset:0}});
    assert.equal(f.container.querySelectorAll('[data-kind="answer"]').length,30);
    f.button('다음').click(); await f.settle();
    assert.equal(f.calls.at(-1).args.p_offset,30);
    assert.equal(f.select('.apm-page').textContent,'2 / 3페이지');
    f.select('[name="query"]').value = '  찾을회원  ';
    f.select('[name="status"]').value = 'hidden'; f.submit(f.select('.apm-filters')); await f.settle();
    assert.deepEqual(f.calls.at(-1).args,{p_query:'찾을회원',p_status:'hidden',p_limit:30,p_offset:0});
    assert.equal(f.container.querySelectorAll('[data-kind="answer"]').length,1);
    assert.equal(f.select('.apm-badge').textContent,'숨김');
    assert.equal(f.api.getState().query,'찾을회원');
    assert.equal(f.api.getState().status,'hidden');
    f.select('[name="query"]').value = '없는회원'; f.submit(f.select('.apm-filters')); await f.settle();
    assert.match(f.select('.apm-status').textContent,/조건에 맞는 답변이 없어요/);
    assert.equal(f.button('다시 불러오기'),undefined);
  } finally {f.close();}
});

test('hiding requires a reason, prevents duplicate writes, retains failures and reloads a confirmed change', async () => {
  const write = deferred();
  const f = await fixture({handler:rpc => rpc === 'admin_pajang_moderate' ? write.promise : undefined});
  try {
    f.select('[data-moderate="hide"]').click();
    assert.equal(f.api.hasDraft(),false);
    f.select('[name="reason"]').value = ' '; f.submit(f.select('.apm-edit')); await f.settle();
    assert.equal(f.calls.filter(call => call.rpc === 'admin_pajang_moderate').length,0);
    assert.match(f.select('.apm-edit-error').textContent,/2~200자/);
    f.select('[name="reason"]').value = '  운영 정책 위반 확인  ';
    assert.equal(f.api.hasDraft(),true);
    const edit = f.select('.apm-edit'); f.submit(edit); f.submit(edit); await f.settle();
    assert.equal(f.api.canLeave(),false);
    assert.equal(f.select('[name="reason"]').disabled,true);
    assert.equal(f.button('취소').disabled,true);
    assert.equal(f.calls.filter(call => call.rpc === 'admin_pajang_moderate').length,1);
    assert.deepEqual(f.calls.at(-1).args,{p_kind:'answer',p_action:'hide',p_person:first,p_day:'2026-11-19',p_slot:'am',p_message_id:null,p_reason:'운영 정책 위반 확인'});
    await f.api.refresh(); assert.equal(f.calls.filter(call => call.rpc === 'admin_pajang_answers').length,1,'refresh does not overlap a write');
    write.resolve({error:{code:'XX000',message:'temporary fixture failure'}}); await f.settle();
    assert.equal(f.api.canLeave(),true);
    assert.equal(f.select('.apm-badge').textContent,'숨김 아님','a failed hide never changes the visible state');
    assert.equal(f.select('[name="reason"]').value,'  운영 정책 위반 확인  ');
    assert.match(f.select('.apm-edit-error').textContent,/처리하지 못했어요/);
    assert.equal(f.changed(),0);
    f.setHandler(null); f.submit(edit); await f.settle();
    assert.equal(f.select('.apm-edit'),null);
    assert.equal(f.select('.apm-badge').textContent,'숨김');
    assert.ok(f.select('[data-moderate="restore"]'));
    assert.equal(f.changed(),1); assert.equal(f.api.hasDraft(),false); assert.equal(f.api.canLeave(),true);
  } finally {f.close();}
});

test('restore keeps original text, and stale cancelled forms cannot submit a different record', async () => {
  const f = await fixture({answers:[answer({hidden:true,hidden_at:new Date(at).toISOString(),reason:'최초 숨김'}),answer({person:second,body:'두 번째 원문'})]});
  try {
    const original = f.select('.apm-body').textContent;
    f.select('[data-moderate="restore"]').click();
    const staleForm = f.select('.apm-edit'); f.select('[name="reason"]').value = '검토 완료'; f.button('취소').click();
    assert.equal(f.api.hasDraft(),false);
    assert.equal(f.calls.some(call => call.rpc === 'admin_pajang_moderate'),false);
    f.select('[data-moderate="hide"]').click(); f.select('[name="reason"]').value = '다른 사유';
    f.submit(staleForm); await f.settle();
    assert.equal(f.calls.some(call => call.rpc === 'admin_pajang_moderate'),false,'a detached form cannot confirm the newer editor');
    f.button('취소').click(); f.select('[data-moderate="restore"]').click(); f.select('[name="reason"]').value = '재검토 후 공개';
    f.submit(f.select('.apm-edit')); await f.settle();
    assert.equal(f.select('.apm-body').textContent,original);
    assert.equal(f.select('.apm-badge').textContent,'숨김 아님');
    assert.equal(f.calls.find(call => call.rpc === 'admin_pajang_moderate').args.p_action,'restore');
    assert.equal(f.changed(),1);
  } finally {f.close();}
});

test('chat search opens all messages, pages by 50 and returns to the filtered conversation list', async () => {
  const f = await fixture({view:'chats',messages:Array.from({length:55},(_,i) => message(i+1))});
  try {
    f.select('[name="query"]').value = '도담'; f.select('[name="status"]').value = 'visible'; f.submit(f.select('.apm-filters')); await f.settle();
    assert.equal(f.calls.at(-1).rpc,'admin_pajang_chats');
    assert.deepEqual(f.calls.at(-1).args,{p_query:'도담',p_status:'visible',p_limit:30,p_offset:0});
    f.select('[data-open-chat]').click(); await f.settle();
    assert.deepEqual(f.calls.at(-1),{rpc:'admin_pajang_chat_messages',args:{p_first:first,p_second:second,p_limit:50,p_offset:0}});
    assert.equal(f.container.querySelectorAll('[data-kind="message"]').length,50);
    assert.equal(f.select('.apm-thread-heading').textContent,'도담 · 소담');
    f.button('다음').click(); await f.settle();
    assert.equal(f.calls.at(-1).args.p_offset,50);
    assert.equal(f.container.querySelectorAll('[data-kind="message"]').length,5);
    f.select('[data-moderate="hide"]').click(); f.select('[name="reason"]').value = '대화 내용 검토'; f.submit(f.select('.apm-edit')); await f.settle();
    const write = f.calls.find(call => call.rpc === 'admin_pajang_moderate');
    assert.deepEqual(write.args,{p_kind:'message',p_action:'hide',p_person:null,p_day:null,p_slot:null,p_message_id:message(51).id,p_reason:'대화 내용 검토'});
    assert.equal(f.select('.apm-badge').textContent,'숨김');
    assert.equal(f.api.getState().messageOffset,50);
    f.button('대화 목록으로').click(); await f.settle();
    assert.equal(f.calls.at(-1).rpc,'admin_pajang_chats');
    assert.equal(f.calls.at(-1).args.p_status,'visible');
    assert.equal(f.select('[name="query"]').value,'도담');
    assert.equal(f.api.getState().thread,null);
  } finally {f.close();}
});

test('Back releases a delayed thread request without repainting its content', async () => {
  const pending = deferred();
  const f = await fixture({view:'chats',handler:rpc => rpc === 'admin_pajang_chat_messages' ? pending.promise : undefined});
  try {
    f.select('[data-open-chat]').click(); await f.settle();
    const request = f.reads.at(-1); assert.equal(request.signal.aborted,false);
    assert.equal(f.button('대화 목록으로').disabled,false);
    f.button('대화 목록으로').click(); await f.settle();
    assert.equal(request.signal.aborted,true);
    pending.resolve({data:{items:[message(1,{body:'지연된 대화 원문'})],total_count:1,first_person:first,second_person:second,first_name:'도담',second_name:'소담'}});
    await f.settle();
    assert.equal(f.container.textContent.includes('지연된 대화 원문'),false);
    assert.equal(f.container.querySelectorAll('[data-kind="chat"]').length,1);
    assert.equal(f.api.getState().thread,null);
  } finally {f.close();}
});

test('current ownership and auth events clear prior content and ignore late read/write results', async () => {
  for (const writing of [false,true]) {
    const pending = deferred();
    const f = await fixture({handler:rpc => rpc === (writing ? 'admin_pajang_moderate' : 'admin_pajang_answers') ? pending.promise : undefined});
    try {
      if (writing) {f.select('[data-moderate="hide"]').click();f.select('[name="reason"]').value='원래 계정의 사유';f.submit(f.select('.apm-edit'));await f.settle();}
      f.setOwner(second); f.auth(second);
      assert.match(f.container.textContent,/관리자 권한을 확인할 수 없어요/);
      assert.equal(f.select('.apm-body'),null); assert.equal(f.select('[name="reason"]'),null);
      assert.equal(f.api.hasDraft(),false); assert.equal(f.api.canLeave(),true);
      pending.resolve(writing ? {data:{ok:true,kind:'answer',hidden:true}} : {data:{items:[answer({body:'이전 계정 전용 원문'})],total_count:1}});
      await f.settle();
      assert.equal(f.container.textContent.includes('이전 계정 전용 원문'),false);
      assert.equal(f.changed(),0); assert.equal(f.unsubscribed(),1);
      const before = f.calls.length; await f.api.refresh(); assert.equal(f.calls.length,before,'cleared access cannot resume itself');
    } finally {f.close();}
  }
  const pending = deferred(), f = await fixture({handler:() => pending.promise});
  f.api.destroy(); assert.equal(f.reads[0].signal.aborted,true);
  pending.resolve({data:{items:[answer({body:'파기한 화면 원문'})],total_count:1}}); await f.settle();
  assert.equal(f.container.childElementCount,0); f.close();
});

test('permission errors clear originals; invalid responses remain errors instead of empty or successful results', async () => {
  for (const result of [{error:{code:'42501',message:'admin_required'}},{data:{items:[],total_count:'0'}}]) {
    const f = await fixture({handler:() => result});
    try {
      assert.equal(f.select('.apm-body'),null);
      assert.equal(f.container.textContent.includes('조건에 맞는 답변이 없어요'),false);
      if (result.error) {assert.match(f.container.textContent,/관리자 권한/);assert.equal(f.button('다시 불러오기'),undefined);}
      else {assert.match(f.container.textContent,/불러오지 못했어요/);assert.ok(f.button('다시 불러오기'));}
    } finally {f.close();}
  }
  const f = await fixture({handler:rpc => rpc === 'admin_pajang_moderate' ? {data:{ok:true,kind:'message',hidden:true}} : undefined});
  try {
    f.select('[data-moderate="hide"]').click();f.select('[name="reason"]').value='확인 사유';f.submit(f.select('.apm-edit'));await f.settle();
    assert.match(f.select('.apm-edit-error').textContent,/변경 결과를 확인하지 못했어요/); assert.equal(f.changed(),0);
    assert.equal(f.select('.apm-badge').textContent,'숨김 아님');
    f.setHandler(rpc => rpc === 'admin_pajang_moderate' ? Promise.reject({code:'42501',message:'admin_required'}) : undefined);
    f.submit(f.select('.apm-edit'));await f.settle();
    assert.match(f.container.textContent,/관리자 권한/);assert.equal(f.select('.apm-body'),null);assert.equal(f.api.hasDraft(),false);
  } finally {f.close();}
});

test('untrusted original text is rendered literally and restoring navigation never stores message bodies', async () => {
  const payload = '<img src=x onerror="window.executed=true"><script>alert(1)</script>';
  const f = await fixture({answers:[answer({name:payload,question:payload,body:payload,hidden:true,hidden_at:new Date(at).toISOString(),reason:payload})]});
  try {
    assert.equal(f.select('.apm-body').textContent,payload);
    assert.equal(f.select('.apm-question').textContent,payload);
    assert.ok(f.container.textContent.includes('숨김 사유: ' + payload));
    assert.equal(f.container.querySelector('img,script,iframe,svg'),null);assert.equal(f.w.executed,undefined);
    assert.equal(JSON.stringify(f.api.getState()).includes(payload),false);
    f.select('[data-moderate="restore"]').click();f.select('[name="reason"]').value=payload;
    assert.equal(f.container.querySelector('img,script'),null);
  } finally {f.close();}
  const restored = await fixture({view:'chats',messages:Array.from({length:55},(_,i) => message(i+1)),
    initialState:{view:'chats',query:'도담',status:'hidden',offset:0,thread:{first_person:first,second_person:second},messageOffset:50}});
  try {
    assert.equal(restored.calls[0].rpc,'admin_pajang_chat_messages');assert.equal(restored.calls[0].args.p_offset,50);
    assert.equal(restored.container.querySelectorAll('[data-kind="message"]').length,5);
    restored.button('대화 목록으로').click();await restored.settle();
    assert.equal(restored.calls.at(-1).args.p_status,'hidden');
  } finally {restored.close();}
});
