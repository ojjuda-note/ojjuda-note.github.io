const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname,'..');
const origin = 'https://admin-pajang.test';
const proof = path.join(__dirname,'artifacts/admin-pajang');
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const worldBase = [...read('world.html').matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(match => match[1]).join('\n');
assert.ok(worldBase.includes('.btn'),'use the real World base styles used by the administrator shell');
const styles = ['app/world/world-design.css','app/world/world-themes.css','app/world/world-green.css',
  'admin/shell.css','admin/navigation.css','admin/pajang-moderation.css'];
const allowed = new Set([...styles,'admin/pajang-moderation.js']);
const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>파장 관리자 합성 데이터 시각 검사</title><link rel="stylesheet" href="/fixture-world.css">
${styles.map(file => `<link rel="stylesheet" href="/${file}">`).join('\n')}
<style>.pajang-ui-fixture{width:min(1100px,100%);margin:24px auto;padding:0 16px;box-sizing:border-box;min-width:0}.pajang-ui-fixture #host{grid-column:1/-1;min-width:0;width:100%}</style>
</head><body class="world-redesign"><main class="pajang-ui-fixture adm-shell" data-admin-service="pajang">
<header class="adm-header"><div class="adm-title-row"><span class="adm-eyebrow">합성 데이터 시각 검사</span><h2 class="h2">파장 관리자모드</h2></div></header>
<div id="host" class="adm-workspace"></div></main><script src="/admin/pajang-moderation.js"></script><script>adminFixture.mount('answers');</script></body></html>`;

function initializeFixture() {
  const id = number => '10000000-0000-4000-8000-' + String(number).padStart(12,'0');
  const at = Date.parse('2026-11-19T03:00:00Z');
  const names = {[id(1)]:'검증도담',[id(2)]:'검증소담',[id(3)]:'검증별빛'};
  const answers = [
    {person:id(1),day:'2026-11-19',slot:'am',name:names[id(1)],question:'쉬는 날을 함께 보낸다면 무엇을 하고 싶나요?',
      body:'나란히 걸으면서 같은 풍경을 보고 싶어요.\n서로 좋아하는 책 이야기도 나누고 싶어요.',at,archived:true,publication_window_days:30,hidden:false,hidden_at:null,reason:''},
    {person:id(2),day:'2026-11-18',slot:'pm',name:names[id(2)],question:'마음을 편하게 해 주는 장소가 있나요?',
      body:'긴 글도 화면 밖으로 나가지 않는지 확인하는 합성 답변이에요.\nhttps://example.invalid/' + 'a'.repeat(135),at:at-3600000,archived:true,publication_window_days:365,
      hidden:true,hidden_at:new Date(at).toISOString(),reason:'검증용 사유입니다. 운영 화면의 긴 설명이 좁은 화면에서도 자연스럽게 줄바꿈되는지 확인해요.'},
    {person:id(3),day:'2026-11-18',slot:'am',name:names[id(3)],question:null,
      body:'따뜻한 차 한 잔과 함께 쉬고 싶어요.',at:at-7200000,archived:false,publication_window_days:30,hidden:false,hidden_at:null,reason:''}
  ];
  const messages = Array.from({length:6},(_,index) => ({
    id:'20000000-0000-4000-8000-' + String(index+1).padStart(12,'0'),
    src:index%2 ? id(2) : id(1),dst:index%2 ? id(1) : id(2),at:at-index*60000,
    body:index === 0 ? '안녕하세요. 함께 읽고 싶은 책이 있나요?\n이 메시지는 화면 검사용 합성 데이터예요.'
      : index === 2 ? 'https://example.invalid/' + 'b'.repeat(150) : ['반가워요. 편하게 이야기 나눠요.','동네 책방에서 천천히 골라 보고 싶어요.'][index%2],
    hidden:index === 1,hidden_at:index === 1 ? new Date(at).toISOString() : null,reason:index === 1 ? '검증을 위해 숨긴 합성 메시지입니다.' : ''
  }));
  const fixture = window.adminFixture = {calls:[],writes:[],changes:0,holdWrite:false,releaseWrite:null};
  const copy = value => JSON.parse(JSON.stringify(value));
  const client = {
    auth:{onAuthStateChange() {return {data:{subscription:{unsubscribe() {}}}};}},
    async rpc(name,args) {
      fixture.calls.push({name,args:copy(args)});
      if (name === 'admin_pajang_answers') {
        const rows = answers.filter(row => (args.p_status === 'all' || row.hidden === (args.p_status === 'hidden'))
          && (!args.p_query || [row.name,row.body].join(' ').includes(args.p_query)));
        return {data:{items:copy(rows.slice(args.p_offset,args.p_offset+args.p_limit)),total_count:rows.length}};
      }
      if (name === 'admin_pajang_chats') {
        const included = messages.length && (args.p_status === 'all' || messages.some(row => row.hidden === (args.p_status === 'hidden')))
          && (!args.p_query || [names[id(1)],names[id(2)],...messages.map(row => row.body)].join(' ').includes(args.p_query));
        return {data:{items:included ? [{first_person:id(1),second_person:id(2),first_name:names[id(1)],second_name:names[id(2)],
          message_count:messages.length,hidden_count:messages.filter(row => row.hidden).length,last_at:at}] : [],total_count:included ? 1 : 0}};
      }
      if (name === 'admin_pajang_chat_messages') {
        if (args.p_first !== id(1) || args.p_second !== id(2)) throw Error('Unexpected synthetic conversation');
        return {data:{items:copy(messages.slice(args.p_offset,args.p_offset+args.p_limit)),total_count:messages.length,
          first_person:id(1),second_person:id(2),first_name:names[id(1)],second_name:names[id(2)]}};
      }
      if (name === 'admin_pajang_moderate') {
        if (!['answer','message'].includes(args.p_kind) || !['hide','restore'].includes(args.p_action)
          || Array.from(args.p_reason.trim()).length < 2 || Array.from(args.p_reason.trim()).length > 200) throw Error('Invalid synthetic moderation request');
        const row = args.p_kind === 'answer' ? answers.find(row => row.person === args.p_person && row.day === args.p_day && row.slot === args.p_slot)
          : messages.find(row => row.id === args.p_message_id);
        if (!row) throw Error('Missing synthetic record');
        fixture.writes.push(copy(args));
        if (fixture.holdWrite) await new Promise(resolve => {fixture.releaseWrite = resolve;});
        fixture.releaseWrite = null; fixture.holdWrite = false;
        row.hidden = args.p_action === 'hide';row.hidden_at = row.hidden ? new Date(at).toISOString() : null;row.reason = row.hidden ? args.p_reason : '';
        return {data:{ok:true,kind:args.p_kind,hidden:row.hidden}};
      }
      throw Error('Unexpected synthetic RPC: ' + name);
    }
  };
  fixture.mount = view => {
    fixture.controller?.destroy();
    fixture.controller = window.OjjudaAdminPajang.mount({container:document.getElementById('host'),client,
      getAdminId:() => id(99),isCurrent:() => true,view,onChanged:() => {fixture.changes++;}});
  };
}

(async () => {
  fs.mkdirSync(proof,{recursive:true});
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  let page, lastScreen = 'initial';
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR',hasTouch:true});
    // Every source file and every RPC is synthetic/local; live service requests are blocked.
    await context.route('**/*',async route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/fixture') return route.fulfill({contentType:'text/html',body:html});
      if (url.pathname === '/fixture-world.css') return route.fulfill({contentType:'text/css',body:worldBase});
      const file = url.pathname.slice(1);
      if (!allowed.has(file)) return route.abort();
      return route.fulfill({path:path.join(root,file)});
    });
    await context.addInitScript(initializeFixture);
    page = await context.newPage();
    const errors = [];page.on('pageerror',error => errors.push(error.message));
    const ready = () => page.waitForFunction(() => document.querySelector('.apm-list')?.getAttribute('aria-busy') === 'false');
    async function checkLayout(label) {
      const result = await page.evaluate(() => {
        const visible = node => node.getClientRects().length > 0;
        const targets = [...document.querySelectorAll('.apm-panel button,.apm-panel input,.apm-panel select,.apm-panel textarea,.apm-panel summary')].filter(visible);
        const undersized = targets.filter(node => {const box = node.getBoundingClientRect();return box.width < 43.5 || box.height < 43.5;})
          .map(node => ({tag:node.tagName,text:node.textContent.slice(0,35),width:node.getBoundingClientRect().width,height:node.getBoundingClientRect().height}));
        const text = [...document.querySelectorAll('.apm-panel,.apm-card,.apm-body,.apm-question,.apm-edit')].filter(visible);
        const clipped = text.filter(node => node.scrollWidth > node.clientWidth + 1 ||
          node.scrollHeight > node.clientHeight + 1 && ['hidden','clip'].includes(getComputedStyle(node).overflowY)).map(node => node.className);
        const outside = targets.filter(node => {const box = node.getBoundingClientRect();return box.left < -1 || box.right > innerWidth + 1;}).map(node => node.tagName);
        return {pageFits:document.documentElement.scrollWidth <= innerWidth + 1,undersized,clipped,outside};
      });
      assert.equal(result.pageFits,true,label + ' fits the viewport width');
      assert.deepEqual(result.undersized,[],label + ' has 44px touch targets');
      assert.deepEqual(result.clipped,[],label + ' keeps long content readable without clipping');
      assert.deepEqual(result.outside,[],label + ' keeps controls inside the viewport');
      const last = page.locator('.apm-panel button:visible').last();
      await last.scrollIntoViewIfNeeded();
      assert.equal(await last.evaluate(node => {const box = node.getBoundingClientRect();return box.top >= -1 && box.bottom <= innerHeight + 1;}),true,
        label + ' allows vertical scrolling to the last control');
    }
    async function capture(label) {
      lastScreen = label;await checkLayout(label);await page.evaluate(() => scrollTo(0,0));
      await page.screenshot({path:path.join(proof,label + '.png'),fullPage:true,animations:'disabled',caret:'hide'});
    }
    async function restoreFirst(kind) {
      const first = page.locator(`[data-kind="${kind}"]`).first();
      await first.locator('[data-moderate="restore"]').click();
      await first.locator('[name="reason"]').fill('합성 검증을 마쳐 다시 표시합니다.');
      await first.getByRole('button',{name:'복구 확정',exact:true}).click();await ready();
      await first.locator('[data-moderate="hide"]').waitFor();
      assert.equal(await first.locator('.apm-badge').textContent(),'숨김 아님');
    }
    for (const width of [320,390,1280]) {
      await page.setViewportSize({width,height:844});await page.goto(origin + '/fixture');await ready();
      assert.equal(await page.locator('[data-kind="answer"]').count(),3);
      await capture('answers-' + width);
      const answer = page.locator('[data-kind="answer"]').first();
      const original = await answer.locator('.apm-body').textContent();
      await answer.locator('[data-moderate="hide"]').click();
      await answer.getByRole('button',{name:'숨김 확정',exact:true}).click();
      assert.equal(await page.evaluate(() => adminFixture.writes.length),0,'an empty reason never reaches the RPC');
      await answer.locator('[name="reason"]').fill('합성 답변의 표시 상태를 검사합니다. 긴 사유도 작은 화면 안에서 읽을 수 있어요.');
      await capture('answer-reason-' + width);
      await page.evaluate(() => {adminFixture.holdWrite = true;});
      await answer.getByRole('button',{name:'숨김 확정',exact:true}).click();
      await page.waitForFunction(() => typeof adminFixture.releaseWrite === 'function');
      assert.equal(await page.evaluate(() => adminFixture.controller.canLeave()),false);
      assert.equal(await answer.getByRole('button',{name:'취소',exact:true}).isDisabled(),true);
      await page.evaluate(() => adminFixture.releaseWrite());await ready();
      await answer.locator('[data-moderate="restore"]').waitFor();
      assert.equal(await answer.locator('.apm-body').textContent(),original,'hiding retains the original text');
      await restoreFirst('answer');
      await page.evaluate(() => adminFixture.mount('chats'));await ready();
      assert.equal(await page.locator('[data-kind="chat"]').count(),1);await capture('chats-' + width);
      await page.locator('[data-open-chat]').click();await ready();
      assert.equal(await page.locator('[data-kind="message"]').count(),6);await capture('messages-' + width);
      const message = page.locator('[data-kind="message"]').first();
      await message.locator('[data-moderate="hide"]').click();
      await message.locator('[name="reason"]').fill('합성 메시지의 숨김과 복구를 확인합니다.');await capture('message-reason-' + width);
      await message.getByRole('button',{name:'숨김 확정',exact:true}).click();await ready();
      await message.locator('[data-moderate="restore"]').waitFor();await restoreFirst('message');
      await page.getByRole('button',{name:'대화 목록으로',exact:true}).click();await ready();
      assert.equal(await page.locator('[data-kind="chat"]').count(),1);await checkLayout('chat-return-' + width);
      assert.deepEqual(await page.evaluate(() => adminFixture.writes.map(write => [write.p_kind,write.p_action])),
        [['answer','hide'],['answer','restore'],['message','hide'],['message','restore']]);
      assert.equal(await page.evaluate(() => adminFixture.changes),4);
      assert.equal(await page.evaluate(() => adminFixture.controller.canLeave()),true);
    }
    assert.deepEqual(errors,[],'the real module has no browser runtime errors');
    await context.close();
    console.log('PASS: Pajang answer/chat/message screens, inline reasons and hide/restore, 44px targets, long-content wrapping and vertical reachability at 320/390/1280px. Synthetic data only.');
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({path:path.join(proof,'failure-' + lastScreen + '.png'),fullPage:true}).catch(() => {});
    throw error;
  } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode = 1;});
