const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
  assert.match(html, /var Go="0\.60\.0-beta"/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(__dirname, '../version.json'), 'utf8')).version,
    '0.60.0-beta');
  assert.match(fs.readFileSync(path.join(__dirname, '../shared/games/world-game-rankings.js'), 'utf8'),
    /ojjuda:leaders-loaded/);
});
