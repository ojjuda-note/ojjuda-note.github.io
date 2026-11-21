const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const hello = require('../features/home/agit-welcome.js');

const DAY = 86400000;
const date = (start, offset) => new Date(Date.parse(start + 'T00:00:00Z') + offset * DAY).toISOString().slice(0, 10);
const context = (today, other = {}) => ({ today, hour: 9, seed: 'member-a', events: [], ...other });
function sequence(start, count, options = {}) {
  const state = hello.cleanState({});
  let info;
  for (let i = 0; i < count; i++) info = hello.visit(state, date(start, i), options);
  return { state, info, today: date(start, count - 1) };
}
function greeting(history, other = {}) {
  return hello.chooseGreeting(history.state, history.info, context(history.today, other));
}

const welcomeSource = fs.readFileSync(path.join(__dirname, '../features/home/agit-welcome.js'), 'utf8');
function welcomeFixture(t, navigator = {}) {
  let now = Date.parse('2026-11-19T00:00:00Z'), timerId = 0;
  const timers = new Map(), storage = new Map(), classes = new Set(), attached = new Set();
  const shown = [], settings = {};
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  function element() {
    const listeners = new Map(), children = new Map();
    return {
      open: false,
      setAttribute() {},
      addEventListener(type, callback) { listeners.set(type, callback); },
      querySelector(selector) {
        if (!children.has(selector)) children.set(selector, element());
        return children.get(selector);
      },
      focus() {},
      showModal() { this.open = true; shown.push(this); },
      close() { this.open = false; listeners.get('close')?.(); },
      remove() { attached.delete(this); },
      getClientRects() { return this.open ? [{ width: 320, height: 200 }] : []; }
    };
  }
  const scope = vm.createContext({
    Date: ClockDate,
    navigator,
    document: {
      hidden: false,
      documentElement: { classList: { contains: name => classes.has(name) } },
      body: { classList: { contains: () => false }, append: dialog => attached.add(dialog) },
      querySelector: selector => selector === '#app .shell' ? {} : null,
      querySelectorAll: () => [...attached],
      createElement: element
    },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    setTimeout(callback, delay = 0) {
      const id = ++timerId;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimeout: id => timers.delete(id)
  });
  scope.window = scope;
  vm.runInContext(welcomeSource, scope, { filename: 'agit-welcome.js' });
  const api = scope.OjjudaAgitWelcome;
  t.after(() => { api.revoke(); timers.clear(); });
  async function flush() {
    // Drain the async greeting and Web Locks continuations after each fake timer.
    for (let i = 0; i < 8; i++) await Promise.resolve();
  }
  return {
    api, scope, shown, attached, storage, settings,
    setPark(value) { value ? classes.add('world-park-active') : classes.delete('world-park-active'); },
    enter(member, options = {}) { api.enter({ member, owner: 'member-a', settings, ...options }); },
    async advance(ms) {
      await flush();
      const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        now = timer.at;
        timer.callback();
        await flush();
      }
      now = end;
      await flush();
    }
  };
}

function assertUnshownMember(fixture) {
  assert.equal(fixture.settings.agitWelcome.visitCounts['2026-11-19'], 1, 'the visit is recorded once');
  assert.equal(fixture.settings.agitWelcome.shownDay, null, 'a blocked greeting is not consumed');
  assert.equal(fixture.storage.has('ojjuda.agit-welcome.v1:shown-day'), false);
}

for (const member of [false, true]) {
  const kind = member ? 'member greeting' : 'guest signup prompt';
  test(`${kind} waits during direct Park entry and appears after returning to Agit`, async t => {
    const fixture = welcomeFixture(t);
    fixture.setPark(true);
    fixture.enter(member);
    await fixture.advance(2500);
    assert.equal(fixture.shown.length, 0);
    assert.equal(fixture.api.isOpen(), false);
    if (member) assertUnshownMember(fixture);

    fixture.setPark(false);
    await fixture.advance(1000);
    assert.equal(fixture.shown.length, 1);
    assert.equal(fixture.api.isOpen(), true);
    assert.equal(fixture.shown[0].className.includes('agit-join-dialog'), !member);
    if (member) {
      assert.equal(fixture.settings.agitWelcome.shownDay, '2026-11-19');
      assert.equal(fixture.settings.agitWelcome.visitCounts['2026-11-19'], 1);
    }
  });

  test(`${kind} rechecks Park after the 450ms opening delay`, async t => {
    const fixture = welcomeFixture(t);
    fixture.enter(member);
    await fixture.advance(449);
    assert.equal(fixture.shown.length, 0);
    fixture.setPark(true);
    await fixture.advance(2001);
    assert.equal(fixture.shown.length, 0);
    if (member) assertUnshownMember(fixture);
  });
}

test('a member lookup completed after entering Park cannot show or consume a greeting', async t => {
  const fixture = welcomeFixture(t);
  let resolveIdentity, calls = 0;
  const client = { rpc(name) {
    assert.equal(name, 'get_my_member_identity');
    calls++;
    return new Promise(resolve => { resolveIdentity = resolve; });
  } };
  fixture.enter(true, { client });
  fixture.setPark(true);
  resolveIdentity({ data: { birth_date: '1990-11-19' }, error: null });
  await fixture.advance(2000);
  assert.equal(fixture.shown.length, 0);
  assertUnshownMember(fixture);

  fixture.setPark(false);
  await fixture.advance(1000);
  assert.equal(fixture.shown.length, 1);
  assert.equal(fixture.settings.agitWelcome.shownType, 'birthday');
  assert.equal(fixture.settings.agitWelcome.visitCounts['2026-11-19'], 1);
  assert.equal(calls, 1, 'moving between Park and Agit does not restart the member lookup');
});

test('a member waiting for the daily Web Lock rechecks Park before drawing', async t => {
  let releaseLock;
  const fixture = welcomeFixture(t, { locks: { request(name, work) {
    assert.equal(name, 'ojjuda.agit-welcome.v1:day:2026-11-19');
    return new Promise(resolve => { releaseLock = () => resolve(work()); });
  } } });
  fixture.enter(true);
  await fixture.advance(450);
  assert.equal(typeof releaseLock, 'function', 'the greeting reached the shared daily lock');
  assert.equal(fixture.shown.length, 0);
  fixture.setPark(true);
  releaseLock();
  await fixture.advance(0);
  assert.equal(fixture.shown.length, 0);
  assertUnshownMember(fixture);
});

test('World rendering closes an already open Agit popup only when entering Park', async t => {
  const fixture = welcomeFixture(t);
  fixture.enter(false);
  await fixture.advance(450);
  assert.equal(fixture.api.isOpen(), true, 'Agit still opens the signup prompt after its delay');

  const world = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
  const start = world.indexOf('function H(){'), end = world.indexOf('function ni(', start);
  assert.ok(start >= 0 && end > start, 'the actual World render function is available');
  // Stop at the release renderer: only the popup lifecycle at the render entrance is under test.
  const stopRendering = new Error('release renderer reached');
  fixture.scope.enterReleaseSection = () => { throw stopRendering; };
  vm.runInContext(world.slice(start, end), fixture.scope);
  for (const tab of ['hub', 'park']) {
    fixture.scope.g = tab === 'park' ? { tab: 'place', place: { id: 'park' } } : { tab };
    fixture.scope.worldMainTab = () => tab;
    assert.throws(() => fixture.scope.H(), error => error === stopRendering);
    assert.equal(fixture.api.isOpen(), tab !== 'park');
    assert.equal(fixture.attached.size, tab === 'park' ? 0 : 1);
  }
});

test('Korean dates and hours cross midnight at 15:00 UTC', () => {
  assert.equal(hello.koreaDay(new Date('2026-11-10T14:59:59Z')), '2026-11-10');
  assert.equal(hello.koreaDay(new Date('2026-11-10T15:00:00Z')), '2026-11-11');
  assert.equal(hello.koreaHour(new Date('2026-11-10T15:00:00Z')), 0);
  assert.equal(hello.koreaHour(new Date('2026-11-10T03:00:00Z')), 12);
});

test('the first visit is welcomed; the second visit gets a familiar greeting', () => {
  const state = hello.cleanState({});
  const first = hello.visit(state, '2026-11-10');
  assert.equal(hello.chooseGreeting(state, first, context('2026-11-10')).type, 'first');
  const again = hello.visit(state, '2026-11-11');
  assert.equal(hello.chooseGreeting(state, again, context('2026-11-11')).type, 'return');
});

test('an established member is not falsely called a first-time visitor', () => {
  const member = sequence('2026-11-11', 1, { createdDay: '2026-01-15' });
  assert.equal(member.info.first, false);
  assert.notEqual(greeting(member).type, 'first');
});

test('five, seven, and thirty consecutive days celebrate their own milestone', () => {
  for (const [days, expected] of [[5, 'five'], [7, 'seven'], [30, 'thirty']]) {
    const history = sequence('2026-09-01', days);
    assert.equal(history.info.streak, days);
    assert.equal(greeting(history).type, expected);
  }
});

test('a streak is broken by a missing day but can use previous Agit stamps', () => {
  const state = hello.cleanState({});
  hello.visit(state, '2026-11-01');
  const interrupted = hello.visit(state, '2026-11-03');
  assert.equal(interrupted.streak, 1);
  const resumed = hello.visit(state, '2026-11-05', { stamps: ['2026-11-04'] });
  assert.equal(resumed.streak, 3);
  assert.equal(resumed.daysTotal, 4);
});

test('week and month anniversaries work without a daily streak', () => {
  for (const [last, expected] of [[7, 'week'], [30, 'month']]) {
    const state = hello.cleanState({});
    hello.visit(state, '2026-10-01');
    if (last === 30) hello.visit(state, date('2026-10-01', 27));
    const today = date('2026-10-01', last);
    const info = hello.visit(state, today);
    assert.equal(hello.chooseGreeting(state, info, context(today)).type, expected);
  }
});

test('two and four week absences are welcomed gently', () => {
  for (const [gap, expected] of [[15, 'away'], [37, 'farAway']]) {
    const state = hello.cleanState({});
    hello.visit(state, '2026-09-01');
    const today = date('2026-09-01', gap);
    const info = hello.visit(state, today);
    assert.equal(hello.chooseGreeting(state, info, context(today)).type, expected);
  }
});

test('many arrivals on one day are acknowledged the following day', () => {
  const state = hello.cleanState({});
  for (let i = 0; i < 4; i++) hello.visit(state, '2026-11-03', { createdDay: '2025-09-01' });
  const info = hello.visit(state, '2026-11-04');
  assert.equal(info.yesterdayVisits, 4);
  assert.equal(hello.chooseGreeting(state, info, context('2026-11-04')).type, 'frequent');
  assert.equal(state.days.filter(day => day === '2026-11-03').length, 1);
});

test('birthday greetings take precedence without retaining the date of birth', () => {
  const history = sequence('2026-11-01', 7);
  assert.equal(greeting(history, { birthMonthDay: '11-07' }).type, 'birthday');
  assert.equal('birthDate' in history.state, false);
});

test('Korean holidays override ordinary time-of-day greetings', () => {
  const history = sequence('2026-11-09', 1, { createdDay: '2025-01-01' });
  for (const [event, label] of [['seollal', '새해 복'], ['chuseok', '한가위'], ['christmas', '크리스마스']]) {
    const result = greeting(history, { events: [event] });
    assert.equal(result.type, 'holiday');
    assert.ok(result.title.includes(label));
  }
});

test('morning, lunch, evening, dawn and weekend can all be selected', () => {
  const history = sequence('2026-11-01', 1, { createdDay: '2025-01-01' });
  const found = new Set();
  for (let i = 0; i < 300; i++) {
    const seed = 'member-' + i;
    for (const hour of [6, 12, 19, 2]) {
      const result = hello.chooseGreeting(history.state, history.info,
        context(history.today, { seed, hour }));
      found.add(result.type);
    }
  }
  for (const type of ['morning', 'lunch', 'evening', 'dawn', 'weekend', 'comfort'])
    assert.ok(found.has(type), 'missing ' + type);
});

test('a verified personal ranking improvement is queued only after a known baseline', () => {
  const state = hello.cleanState({});
  const month = '2026-11', today = '2026-11-10';
  assert.equal(hello.observePersonalRecord(state, 'runner', [{ me: true, score: 100 }], month, today), false);
  assert.equal(hello.observePersonalRecord(state, 'runner', [{ me: true, score: 120 }], month, today), true);
  assert.equal(state.pending[0].type, 'new_record');
  assert.equal(hello.observePersonalRecord(state, 'runner', [{ me: true, score: 110 }], month, today), false);
  assert.equal(hello.observePersonalRecord(state, 'runner', [{ nick: 'someone', score: 500 }], month, today), false);
});

test('a shorter best completion time is also a record for timed games', () => {
  const state = hello.cleanState({});
  assert.equal(hello.observePersonalRecord(state, 'mines', [{ me: true, score: 8900 }], '2026-11', '2026-11-10'), false);
  assert.equal(hello.observePersonalRecord(state, 'mines', [{ me: true, score: 8100 }], '2026-11', '2026-11-11'), true);
  assert.equal(state.pending[0].game, 'mines');
});

test('unchanged champion scores do not trigger repeated saves or celebrations', () => {
  const state = hello.cleanState({});
  const leader = { runner: { me: true, score: 200 } };
  assert.equal(hello.observeLeaders(state, leader, '2026-11', '2026-11-10'), true);
  assert.equal(hello.observeLeaders(state, leader, '2026-11', '2026-11-11'), false);
  assert.equal(state.pending.length, 0);
  assert.equal(hello.observeLeaders(state, { runner: { me: true, score: 220 } }, '2026-11', '2026-11-11'), true);
  assert.equal(state.pending[0].type, 'new_record');
});

test('losing first place is recognized only after that same account held it', () => {
  const state = hello.cleanState({});
  const month = '2026-11', today = '2026-11-10';
  assert.equal(hello.observeLeaders(state, { runner: { me: false, score: 130 } }, month, today), false);
  assert.equal(hello.observeLeaders(state, { runner: { me: true, score: 150 } }, month, today), true);
  assert.equal(hello.observeLeaders(state, { runner: { me: false, score: 160 } }, month, '2026-11-11'), true);
  assert.equal(state.pending[0].type, 'rank_overtaken');
  assert.equal(hello.observeLeaders(state, { runner: { me: false, score: 160 } }, month, '2026-11-12'), false);
  const info = hello.visit(state, '2026-11-12', { createdDay: '2025-04-01' });
  assert.equal(hello.chooseGreeting(state, info, context('2026-11-12')).type, 'rank_overtaken');
});

test('champion records do not bleed into a new ranking month', () => {
  const state = hello.cleanState({});
  hello.observeLeaders(state, { runner: { me: true, score: 180 } }, '2026-11', '2026-11-30');
  hello.observeLeaders(state, { runner: { me: false, score: 50 } }, '2026-12', '2026-12-01');
  assert.equal(state.pending.length, 0);
  assert.deepEqual(state.champions, {});
});

test('local and cloud state preserve the most recent popup day', () => {
  const state = hello.mergeStates({ shownDay: '2026-11-11', updatedAt: 100, days: ['2026-11-11'] },
    { shownDay: '2026-11-10', updatedAt: 200, days: ['2026-11-10'] });
  assert.deepEqual(state.days, ['2026-11-10', '2026-11-11']);
  assert.equal(state.shownDay, '2026-11-11');
});

test('hidden existing notification and support dialogs do not block a greeting', () => {
  const previous = global.document;
  const overlays = [{ getClientRects: () => [] }, { getClientRects: () => [] }];
  global.document = {
    hidden: false,
    body: { classList: { contains: () => false } },
    querySelector: selector => selector === '#app .shell' ? {} : null,
    querySelectorAll: () => overlays
  };
  try {
    assert.equal(hello.isBlocked(), false, 'invisible dialogs cannot prevent the hello');
    overlays.push({ getClientRects: () => [{ width: 320, height: 200 }] });
    assert.equal(hello.isBlocked(), true, 'a visible dialog gets priority');
    overlays.pop();
    global.document.hidden = true;
    assert.equal(hello.isBlocked(), true, 'background tabs cannot show the hello');
  } finally {
    if (previous === undefined) delete global.document;
    else global.document = previous;
  }
});

test('administrator previews include all actual variants and correct guest rules', () => {
  const list = hello.previewCatalog();
  assert.ok(list.length > 35, 'all greetings and holiday messages are visible');
  assert.equal(new Set(list.map(item => item.id)).size, list.length);
  assert.equal(list.find(item => item.id === 'join-benefits').condition, '비회원이 새로 접속할 때마다');
  assert.match(list.find(item => item.id === 'frequent-1').condition, /어제 3번 이상/);
  assert.match(list.find(item => item.id === 'birthday-1').title, /생일/);
  assert.ok(list.some(item => item.id === 'holiday-seollal'));
  assert.ok(list.some(item => item.id === 'rank_overtaken-2'));
  assert.equal(hello.preview('nonexistent'), false);
});

test('world entry wires both guest and member greeting and cache-busted CSS/JS', () => {
  const html = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
  for (const fragment of [
    'window.OjjudaAgitWelcome?.enter({member:false',
    'window.OjjudaAgitWelcome?.enter({',
    'window.OjjudaAgitWelcome?.revoke()',
    'window.OjjudaAgitWelcome?.isOpen()',
    '/features/home/agit-welcome.js?v=',
    '/features/home/agit-welcome.css?v='
  ]) assert.ok(html.includes(fragment), fragment);
  const publishedVersion = JSON.parse(fs.readFileSync(path.join(__dirname, '../version.json'), 'utf8')).version;
  assert.match(publishedVersion, /^\d+\.\d+\.\d+-beta$/);
  assert.equal(html.match(/var Go="([^"]+)"/)?.[1], publishedVersion);
  assert.match(fs.readFileSync(path.join(__dirname, '../shared/games/world-game-rankings.js'), 'utf8'),
    /ojjuda:leaders-loaded/);
});

test('daily greeting replaces redundant emoji ornaments with a readable wordmark and accessible close control', () => {
  const css = fs.readFileSync(path.join(__dirname, '../features/home/agit-welcome.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
  assert.match(welcomeSource, /class="agit-welcome-wordmark" aria-hidden="true">아지트<\/div>/);
  assert.doesNotMatch(welcomeSource, /agit-welcome-(?:orbit|heart)/, 'the extra ornament nodes are gone');
  assert.match(css, /\.agit-welcome-wordmark\s*\{[^}]*font:\s*700 clamp\(36px, 9vw, 45px\)/s);
  assert.match(css, /\.agit-welcome-wordmark::before\s*\{[^}]*background:\s*var\(--accent-soft\)/s);
  assert.match(css, /\.agit-welcome-close\s*\{[^}]*width:\s*44px;\s*height:\s*44px;/s,
    'close target is at least 44px wide and tall');
  assert.doesNotMatch(css, /agit-welcome-(?:orbit|heart|pop)/);
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*?\.agit-welcome-wordmark\s*\{/);
  assert.match(html, /agit-welcome\.css\?v=20261121-d08-wordmark1/);
  assert.match(html, /agit-welcome\.js\?v=20261121-d08-wordmark1/);
});
