const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../shared/location/location.js'), 'utf8');
const coordinate = () => ({ coords: { latitude: 37.52, longitude: 127.02, accuracy: 5 }, timestamp: Date.now() });

function fixture() {
  const state = { user: { id: 'youth', role: 'park_junior', app_metadata: { park_guardian_account: true } },
    allowed: true, enabled: true, gps: 0, weather: [], storage: new Map(), decisions: [] };
  const db = {
    auth: { getSession: async () => ({ data: { session: state.user ? { user: state.user } : null } }) },
    rpc: async name => {
      if (name === 'ojjuda_location_preference') return { data: { enabled: state.enabled, version: 1 } };
      assert.equal(name, 'park_guardian_location_allowed');
      return { data: state.decisions.length ? state.decisions.shift() : state.allowed };
    }
  };
  const sandbox = vm.createContext({
    Date, Error, Map, Set, DOMException, AbortController, Promise, setTimeout, clearTimeout,
    location: { origin: 'https://park.test', pathname: '/park/' },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    dispatchEvent: event => state.weather.push(event.detail),
    sessionStorage: { getItem: k => state.storage.get(k), setItem: (k,v) => state.storage.set(k,v), removeItem: k => state.storage.delete(k) },
    navigator: {
      permissions: { query: async () => ({ state: state.permission || 'granted' }) },
      geolocation: {
        getCurrentPosition: (ok,fail) => { state.gps++; if (state.measure) state.measure(ok,fail); else ok(coordinate()); },
        watchPosition: ok => { state.gps++; ok(coordinate()); return 1; },
        clearWatch() {}
      }
    }
  });
  vm.runInContext(source, sandbox);
  return { state, api: sandbox.OjjudaLocation, db,
    read: opts => sandbox.OjjudaLocation.readPosition({ db, accountId: 'youth', ...opts }) };
}

test('Park checks the confirmed account and guardian choice before GPS, including manual enable', async () => {
  const { state, read, api, db } = fixture();
  state.allowed = false; state.enabled = false;
  await assert.rejects(read({ allowDisabled:true }), { code:'guardian' });
  await assert.rejects(read({ accountId:null }), { code:'account' });
  assert.equal(state.gps, 0);
  state.user = { id:'other' };
  await assert.rejects(api.authorizePosition(db, 'youth'), /회원 정보/);
});

test('revocation while measuring prevents caching, use and high-accuracy retry', async () => {
  const { state, read } = fixture();
  state.measure = ok => { state.allowed = false; ok(coordinate()); };
  await assert.rejects(read({fresh:true}), { code:'guardian' });
  assert.equal(state.storage.size, 0);
  assert.ok(state.weather.every(cell => cell === null));
  state.allowed = true;
  state.measure = (ok, fail) => { state.allowed = false; fail({ code:2 }); };
  await assert.rejects(read({fresh:true}), { code:'guardian' });
  assert.equal(state.gps, 2);
});

test('Park reuses a lasting grant and never reopens the prompt on an automatic read or retry',async()=>{
  const {state,read}=fixture();
  await read({automatic:true});
  await read({automatic:true});
  assert.equal(state.gps,1);
  state.permission='prompt';
  await assert.rejects(read({automatic:true}),{code:'prompt'});
  assert.equal(state.gps,1);
  assert.equal(state.storage.size,0);
  await read({allowDisabled:true,fresh:true});
  assert.equal(state.gps,2,'a deliberate tap can request location again');
  state.permission='granted';
  state.measure=(_ok,fail)=>{state.permission='prompt';fail({code:2});};
  await assert.rejects(read({automatic:true,fresh:true}),{code:'prompt'});
  assert.equal(state.gps,3,'the precise fallback cannot open a prompt');
});

test('junior weather neither uses saved grid nor starts GPS; revoked card coordinates cannot be reused', async () => {
  const { state, api, db, read } = fixture();
  await read(); assert.equal(state.gps, 1);
  assert.deepEqual(state.weather, []);
  for (const cell of [undefined,{nx:60,ny:127,capturedAt:Date.now()}]) {
    await assert.rejects(api.readWeatherPosition({db, accountId:'youth', cell}), {code:'disabled'});
  }
  state.allowed = false;
  await assert.rejects(read({coarseCache:true}), {code:'guardian'});
  assert.equal(state.gps, 1);
  assert.equal(state.storage.size, 0);
});

test('after withdrawal Park omits coordinates from reading and blocks coordinate writes and nearby searches', async () => {
  const park = fs.readFileSync(path.join(__dirname, '../note/preview.js'), 'utf8');
  const rpcSource = park.slice(park.indexOf('async function noteRpc('), park.indexOf('async function purchasePermanent('));
  const sent = [];
  const ctx = vm.createContext({
    authKnown: true, identityEpoch: 1, session: {user:{id:'child'}}, client:{},
    window: {OjjudaLocation:{authorizePosition:async () => { throw Error('guardian'); }}},
    nearbyPosition:coordinate(), writingPosition:coordinate(),
    query: () => ({rpc: (name, args) => {
      sent.push({name,args}); return Promise.resolve({data:true});
    }})
  });
  vm.runInContext(rpcSource,ctx);
  const params = {p_lat:37.52,p_lon:127.02};
  await ctx.noteRpc('get_card',params);
  assert.equal(sent[0].args.p_lat,null);
  assert.equal(sent[0].args.p_lon,null);
  await assert.rejects(ctx.noteRpc('publish_card',params),/guardian/);
  await assert.rejects(ctx.noteRpc('list_cards',{...params,p_sort:'nearby'}),/guardian/);
  assert.equal(sent.length,1);
  assert.equal(ctx.writingPosition,null);
  assert.equal(ctx.nearbyPosition,null);
});
