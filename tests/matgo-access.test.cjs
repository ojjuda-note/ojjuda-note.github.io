const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../matgo-access.js'), 'utf8');
function fixture(age = 19) {
  const values = new Map(); let callback;
  const state = { user: { id: 'member-a' }, identity: { age, locked: true }, error: null, rpcCalls: 0 };
  const root = { location: { origin: 'https://fixture.test' },
    localStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  root.parent = root;
  vm.runInNewContext(source, { window: root, setTimeout, clearTimeout });
  const client = { auth: { getUser: async () => ({ data: { user: state.user } }),
    onAuthStateChange: cb => { callback = cb; return { data: { subscription: { unsubscribe() {} } } }; } },
    rpc: async name => { assert.equal(name, 'get_my_member_identity'); state.rpcCalls++; return { data: state.identity, error: state.error }; } };
  root.OjjudaMatgoAccess.configure(client);
  return { api: root.OjjudaMatgoAccess, state, values, client, event: (name, user) => callback(name, user ? { user } : null) };
}
(async () => {
  for (const age of [19, 20, 90]) { const f = fixture(age); await f.api.check(); assert.equal(f.api.allowed(), true); }
  for (const age of [0, 14, 18]) { const f = fixture(age); await assert.rejects(f.api.check(), e => e.code === 'underage'); assert.equal(f.api.allowed(), false); }
  for (const age of [null, '19', 19.1, NaN, 151]) { const f = fixture(age); await assert.rejects(f.api.check()); }
  const guest = fixture(); guest.state.user = null;
  await assert.rejects(guest.api.check(), e => e.code === 'login'); assert.equal(guest.state.rpcCalls, 0);
  const missing = fixture(); missing.state.identity = null;
  await assert.rejects(missing.api.check(), e => e.code === 'identity');
  const spoof = fixture(18); spoof.state.user.user_metadata = { age: 30, adult: true }; spoof.values.set('adultVerified', 'true');
  await assert.rejects(spoof.api.check(), e => e.code === 'underage');
  const outage = fixture(); outage.state.error = new Error('offline'); await assert.rejects(outage.api.check());
  const unlocked = fixture(); unlocked.state.identity.locked = false; await assert.rejects(unlocked.api.check());
  const f = fixture(); await f.api.check(); assert.equal(f.api.visible(),true);
  let revoked = 0; f.api.subscribe(() => revoked++);
  f.event('SIGNED_OUT'); assert.equal(f.api.allowed(), false); assert.equal(f.api.visible(),false); assert.equal(revoked, 1);
  f.state.user = { id: 'member-b' }; await f.api.check();
  f.state.user = { id: 'member-a' }; f.event('SIGNED_IN', f.state.user);
  assert.equal(f.api.allowed(), false); await f.api.check();
  const race = fixture(); let resolve;
  race.client.rpc = () => new Promise(r => { resolve = r; });
  const check = race.api.check();
  while (!resolve) await new Promise(r => setImmediate(r));
  race.event('SIGNED_OUT'); resolve({ data: { age: 19, locked: true } });
  await assert.rejects(check, e => e.code === 'login'); assert.equal(race.api.allowed(), false);
  console.log('PASS: adult/minor boundaries, guest, missing identity, server error, local spoof, logout race and age-based button visibility');
})().catch(error => { console.error(error); process.exitCode = 1; });
