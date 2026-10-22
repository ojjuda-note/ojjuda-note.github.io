const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
const start = html.indexOf('function worldAccountEntry(');
const end = html.indexOf('async function Un(', start);
assert.ok(start > 0 && end > start);
const source = html.slice(start, end);

async function open(query = '', options = {}) {
  const calls = [], tasks = [];
  const user = options.member ? { id: 'fixture-member' } : null;
  let listener, reads = 0;
  const location = new URL('https://ojjuda.kr/world.html' + query);
  location.reload = () => calls.push('reload');
  const state = { online: false, user: null };
  const context = {
    location, URL, URLSearchParams, D: state,
    ui: /type=recovery/.test(location.hash) || location.searchParams.get('reset') === '1',
    ga: false, Tr: false, em: null, $c: null,
    worldParkNotes: { requested: location.searchParams.get('place') === 'park' },
    xd() {}, yc() {}, clearWorldAdminView() {},
    nr(mode) { calls.push('auth:' + mode); },
    enterWorldGuest(start) { state.online = false; state.parkGuest = true; state.user = null; calls.push('guest'); start(); },
    async Un(member) { state.user = member; state.online = true; state.parkGuest = false; context.Tr = true; calls.push('member'); },
    setTimeout(callback) { tasks.push(callback); },
    S: options.noClient ? null : {
      auth: {
        onAuthStateChange(callback) { listener = callback; },
        async getSession() {
          reads++;
          if (options.stalled) return new Promise(() => {});
          if (options.reject) throw new Error('fixture network failure');
          if (options.eventFirst) {
            listener('SIGNED_IN', { user: { id: 'event-member' } });
            while (tasks.length) tasks.shift()();
          }
          return { data: { session: user ? { user } : null }, error: options.error ? { message: 'fixture failure' } : null };
        }
      }
    }
  };
  vm.runInNewContext(source, context);
  await context.om(() => calls.push('start'), () => {});
  while (tasks.length) tasks.shift()();
  return { calls, state, reads };
}

(async () => {
  const login = html.match(/sr\["account-login"\]=\(\)=>\{[^\n]+\};/)[0];
  for (const [place, destination] of [['park', 'note'], ['arcade', 'world']]) {
    const location = {}, sr = {};
    vm.runInNewContext(login, { sr, location, g: { tab: 'my', place: { id: place } } });
    sr['account-login']();
    assert.equal(location.href, '/?auth=login&next=' + destination, 'login from Settings returns to the originating menu');
  }
  for (const query of ['', '?tab=arcade', '?place=park', '?tab=park', '?tab=my', '?utm_source=share']) {
    const guest = await open(query);
    assert.deepEqual(guest.calls, ['guest', 'start'], query + ': first visits browse without a login form');
    assert.equal(guest.state.online, false);
    assert.equal(guest.state.parkGuest, true);
    assert.equal(guest.state.user, null);
    const member = await open(query, { member: true });
    assert.deepEqual(member.calls, ['member'], query + ': an existing account must stay signed in');
    assert.equal(member.state.user.id, 'fixture-member');
    assert.equal(member.state.parkGuest, false);
  }
  for (const query of ['?auth=login', '?auth=signup', '?admin=trash', '?notice=message', '?code=callback', '#access_token=fixture&type=signup']) {
    assert.deepEqual((await open(query)).calls, ['auth:login'], query + ': explicit account entry must keep the account flow');
  }
  for (const query of ['?reset=1', '#type=recovery&access_token=fixture']) {
    assert.deepEqual((await open(query)).calls, ['auth:forgot']);
    assert.deepEqual((await open(query, { member: true })).calls, ['auth:reset']);
  }
  for (const options of [{ noClient: true }, { error: true }, { reject: true }]) {
    assert.deepEqual((await open('', options)).calls, ['guest', 'start'], 'public browsing remains available on an unavailable auth client');
    assert.deepEqual((await open('?admin=trash', options)).calls, ['auth:login'], 'an admin route never turns into anonymous admin access');
  }
  assert.deepEqual((await open('?place=park&guest=1', { stalled: true })).calls, ['guest', 'start'], 'the explicit browse escape still bypasses a stalled account check');
  for (const error of [false, true]) {
    const result = await open('', { eventFirst: true, error });
    assert.deepEqual(result.calls, ['member'], 'a signed-in event racing with an empty/error session response must not be replaced by a guest');
  }
  console.log('PASS: first visits browse, saved sessions stay signed in, account/admin/recovery entry is retained, unavailable auth falls back safely, and session races cannot overwrite a member');
})().catch(error => { console.error(error); process.exitCode = 1; });
