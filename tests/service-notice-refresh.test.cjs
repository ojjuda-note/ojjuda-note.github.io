const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(process.env.OJJUDA_WORLD_HTML || path.join(__dirname, '../world.html'), 'utf8');
const config = html.slice(html.indexOf('var wt='), html.indexOf('var Kd='));
const noticeStart = html.includes('function worldNoticeMarkup(') ? 'function worldNoticeMarkup(' : 'function Zg(){';
const markup = html.slice(html.indexOf(noticeStart), html.indexOf('function Uf('));

function fixture(place = 'arcade') {
  const dom = new JSDOM('<div id="app"><main class="main"></main></div>', { url: 'https://fixture.test/world.html', pretendToBeVisual: true });
  const requests = [];
  let redraws = 0, ticks = 0;
  const client = { from(table) {
    assert.equal(table, 'app_config');
    return { select(columns) {
      assert.equal(columns, 'key,value');
      return new Promise((resolve, reject) => requests.push({ resolve, reject }));
    } };
  } };
  const context = vm.createContext({
    window: dom.window, document: dom.window.document, S: client,
    D: { online: true, user: { id: 'member-a' } }, g: { tab: 'place', place: { id: place } },
    $: {}, Date, URL, console, requestAnimationFrame: fn => fn(),
    w: value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    Ts() { ticks++; }, H() { redraws++; }
  });
  vm.runInContext(config + '\n' + markup, context);
  const main = dom.window.document.querySelector('main');
  main.innerHTML = context.Zg() + '<input id="draft" value="작성 중인 내용"><iframe title="공원"></iframe><div id="game">진행 중인 게임</div>';
  const slot = main.querySelector('[data-game-friend-invite-slot]');
  slot.innerHTML = '<button id="invitation">수락</button>';
  const input = main.querySelector('#draft'), frame = main.querySelector('iframe'), game = main.querySelector('#game'), invitation = main.querySelector('#invitation');
  input.focus(); input.setSelectionRange(2, 5);
  return { context, main, requests, input, frame, game, invitation, slot, document: dom.window.document,
    redraws: () => redraws, ticks: () => ticks,
    reply(index, notice, extra = {}) { requests[index].resolve({ data: [{ key: 'notice', value: notice }], error: null, ...extra }); },
    banner() { return main.querySelector('[data-act="notice-open"]'); }
  };
}

for (const place of ['arcade', 'park']) test('delayed notice appears in ' + place + ' without replacing the active screen', async () => {
  const f = fixture(place), loading = f.context.Ls();
  assert.equal(f.banner(), null);
  f.reply(0, '늦게 도착한 공지'); await loading;
  assert.equal(f.banner()?.querySelector('.nb-text').textContent, '늦게 도착한 공지');
  assert.equal(f.slot.previousElementSibling, f.banner(), 'the notice stays above the same invitation slot');
  assert.equal(f.document.activeElement, f.input);
  assert.equal(f.input.value, '작성 중인 내용');
  assert.deepEqual([f.input.selectionStart, f.input.selectionEnd], [2, 5]);
  assert.equal(f.main.querySelector('iframe'), f.frame);
  assert.equal(f.main.querySelector('#game'), f.game);
  assert.equal(f.main.querySelector('#invitation'), f.invitation);
  assert.equal(f.redraws(), 0);
});

test('notice updates, clears, and preserves the ticker on an unchanged refresh', async () => {
  const f = fixture();
  let pending = f.context.Ls(); f.reply(0, '처음 공지'); await pending;
  const first = f.banner(); assert.ok(first);
  pending = f.context.Ls(); f.reply(1, '처음 공지'); await pending;
  assert.equal(f.banner(), first);
  pending = f.context.Ls(); f.reply(2, '새로운 공지'); await pending;
  assert.equal(f.main.querySelectorAll('[data-act="notice-open"]').length, 1);
  assert.equal(f.banner().querySelector('.nb-copy').textContent, '새로운 공지');
  pending = f.context.Ls(); f.reply(3, ''); await pending;
  assert.equal(f.banner(), null);
  assert.equal(f.main.querySelector('#invitation'), f.invitation);
  assert.equal(f.redraws(), 0);
});

test('notice contents are text, not executable markup', async () => {
  const f = fixture(), pending = f.context.Ls(), value = '<img src=x onerror="window.injected=true">';
  f.reply(0, value); await pending;
  assert.equal(f.banner()?.querySelector('.nb-text').textContent, value);
  assert.equal(f.banner().querySelector('img'), null);
  assert.equal(f.banner().getAttribute('aria-label'), '공지: ' + value + ' (눌러서 전체 보기)');
});

test('admin and guest screens retain their existing notice visibility rules', async () => {
  for (const state of ['admin', 'guest']) {
    const f = fixture();
    if (state === 'admin') f.context.g.tab = 'admin';
    else { f.context.D.online = false; f.context.D.user = null; }
    const pending = f.context.Ls(); f.reply(0, '공지'); await pending;
    assert.equal(f.banner(), null);
  }
});

test('a late config response cannot replace a newer notice', async () => {
  const f = fixture(), old = f.context.Ls(), latest = f.context.Ls();
  f.reply(1, '최신 공지'); await latest;
  f.reply(0, '오래된 공지'); await old;
  assert.equal(f.context.wt.notice, '최신 공지');
  assert.equal(f.banner()?.querySelector('.nb-text').textContent, '최신 공지');
});

test('account changes and sign-out discard a pending configuration response', async () => {
  for (const change of ['account', 'signout']) {
    const f = fixture(), pending = f.context.Ls();
    if (change === 'account') f.context.D.user = { id: 'member-b' };
    else { f.context.D.online = false; f.context.D.user = null; }
    f.reply(0, '이전 요청의 공지');
    assert.equal(await pending, false);
    assert.equal(f.context.wt.notice, '');
    assert.equal(f.banner(), null);
  }
});

test('an unsuccessful config refresh preserves the last displayed notice', async () => {
  const f = fixture();
  let pending = f.context.Ls(); f.reply(0, '유지할 공지'); await pending;
  const banner = f.banner(); assert.ok(banner);
  pending = f.context.Ls(); f.reply(1, '', { data: null, error: { message: 'offline' } });
  assert.equal(await pending, false);
  assert.equal(f.banner(), banner);
  assert.equal(f.context.wt.notice, '유지할 공지');
});
