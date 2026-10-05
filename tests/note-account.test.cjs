const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'note/preview.js'), 'utf8');
const bootAt = source.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange');
assert.ok(bootAt > 0);
const html = fs.readFileSync(path.join(root, 'park/index.html'), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 5)); };
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const plain = value => JSON.parse(JSON.stringify(value));

(async () => {
  let dom, window, document, behavior, calls, run, authUser, profileNickname;
  const user = id => ({ user: { id, email: `${id}@example.test` }, access_token: `test-token-${id}` });
  const button = label => [...document.querySelectorAll('#management-backdrop button')].find(b => b.textContent === label);
  const message = () => document.querySelector('.management-message').textContent;
  const submit = async () => { document.querySelector('.note-account-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await settle(); };
  const click = async id => { document.getElementById(id).click(); await settle(); };
  function boot(id = 'alice') {
    dom?.window.close();
    dom = new JSDOM(html, { url: 'https://ojjuda.test/note/', runScripts: 'outside-only', pretendToBeVisual: true });
    window = dom.window; document = window.document;
    behavior = {}; calls = []; authUser = id ? user(id) : null; profileNickname = '포근한고래';
    window.scrollTo = () => {}; window.HTMLElement.prototype.scrollTo = () => {};
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    run = code => new vm.Script(code).runInContext(dom.getInternalVMContext());
    const api = {
      from(table) {
        assert.equal(table, 'profiles');
        let update, ownerId;
        const query = {
          select() { return query; },
          eq(key, value) { assert.equal(key, 'id'); ownerId = value; return query; },
          update(value) { update = plain(value); return query; },
          async maybeSingle() { calls.push(['profile-read', ownerId]); return behavior.profileRead ? behavior.profileRead() : { data: { nickname: profileNickname }, error: null }; },
          async single() {
            calls.push(['profile-write', ownerId, update]);
            if (behavior.profileWrite) return behavior.profileWrite();
            profileNickname = update.nickname; return { data: { nickname: update.nickname }, error: null };
          }
        }; return query;
      },
      auth: {
        async getSession() { calls.push(['session']); return { data: { session: authUser }, error: null }; },
        async getUser(token) { calls.push(['verify', token]); return behavior.verify ? behavior.verify() : { data: { user: authUser?.user }, error: null }; },
        async updateUser(value) { calls.push(['password', plain(value)]); return behavior.password ? behavior.password() : { data: { user: authUser?.user }, error: null }; },
        async signOut(options) {
          calls.push(['signout', plain(options)]);
          if (behavior.signout) return behavior.signout();
          authUser = null; run('receiveAuth(null)'); return { error: null };
        }
      }
    };
    window.OJJUDA_CONFIG = { supabaseUrl: 'https://project.supabase.co', supabaseKey: 'public-test-key' };
    window.supabase = { createClient(url, key, options) {
      if (!options) return api;
      calls.push(['owner-client', plain(options)]);
      return {
        storage: { from(bucket) {
          assert.ok(['media', 'note-card-photos', 'note-event-photos'].includes(bucket));
          return {
            async remove(paths) { calls.push(['remove', plain(paths), bucket]); const result=behavior.remove ? await behavior.remove(paths) : { error: null }; if(!result.error)behavior.files=(behavior.files||[]).filter(file=>file.bucket_id!==bucket||!paths.includes(file.photo_path));return result; }
          };
        } },
        async rpc(name,args) { calls.push(['rpc', name, plain(args)]); if(behavior.rpc)return behavior.rpc(name,args);return {data:name==='my_account_deletion_files'?(behavior.inventory?await behavior.inventory():(behavior.files||[]).slice(0,100)):null,error:null}; }
      };
    } };
    run(fs.readFileSync(path.join(root, 'account-deletion.js'), 'utf8'));
    run(source.slice(0, bootAt));
    // Keep the real account/dialog/auth-change code; unrelated feed requests are out of scope.
    run(`loadWorldBalance = async () => {}; loadModerator = async () => {}; loadNoteState = async () => {};
      loadFeed = async () => {}; loadMyGender = async () => {}; loadPhotoEntitlements = async () => {};
      leaveNoteAccount = () => window.__leave();`);
    window.__leave = () => calls.push(['leave']);
    run(`session = ${JSON.stringify(authUser)}; authKnown = true; updateAuth();`);
  }
  function switchTo(id) {
    authUser = id ? user(id) : null;
    run(`receiveAuth(${JSON.stringify(authUser)})`);
  }
  async function readyDelete() {
    await click('note-delete-account');
    document.getElementById('note-delete-nickname').value = profileNickname;
    document.querySelector('.note-account-consent input').checked = true;
  }
  try {
    boot(null);
    assert.equal(document.getElementById('note-account-section').hidden, true);
    await click('note-change-password'); assert.equal(run('management.hidden'), true);

    boot(); await run("loadAccountProfile('alice')");
    assert.equal(document.getElementById('note-account-name').textContent, profileNickname);
    assert.equal(document.getElementById('note-account-email').textContent, 'alice@example.test');
    await click('note-change-nickname');
    document.getElementById('note-new-nickname').value = '   '; await submit();
    assert.equal(calls.some(c => c[0] === 'profile-write'), false);
    document.getElementById('note-new-nickname').value = '  반짝고래  '; await submit();
    const write = calls.find(c => c[0] === 'profile-write');
    assert.equal(write[1], 'alice'); assert.equal(write[2].nickname, '반짝고래');
    assert.deepEqual(Object.keys(write[2]).sort(), ['nickname', 'updated_at']);
    assert.equal(document.getElementById('note-account-name').textContent, '반짝고래');
    assert.match(document.querySelector('.management-body').textContent, /닉네임을 저장/);

    boot(); behavior.profileWrite = async () => ({ error: { code: '23505' } });
    await click('note-change-nickname'); await submit();
    assert.match(message(), /이미 쓰고/); assert.equal(button('저장').disabled, false);
    behavior.profileWrite = async () => ({ error: { code: '42501' } }); await submit();
    assert.match(message(), /변경할 수 없어요/);

    boot(); const oldRead = defer(); behavior.profileRead = () => oldRead.promise;
    await click('note-change-nickname'); switchTo('bob');
    oldRead.resolve({ data: { nickname: '<img src=x onerror=alert(1)>' }, error: null }); await settle();
    assert.equal(document.getElementById('note-new-nickname'), null);
    assert.equal(document.querySelector('.management-body img'), null);

    boot(); await click('note-change-password');
    document.getElementById('note-new-password').value = '123';
    document.getElementById('note-confirm-password').value = '123'; await submit();
    assert.match(message(), /6자/);
    document.getElementById('note-new-password').value = 'new-password'; await submit();
    assert.match(message(), /두 비밀번호/); assert.equal(calls.some(c => c[0] === 'password'), false);
    document.getElementById('note-confirm-password').value = 'new-password';
    const pendingPassword = defer(); behavior.password = () => pendingPassword.promise;
    await submit(); await submit(); assert.equal(calls.filter(c => c[0] === 'password').length, 1);
    assert.equal(document.getElementById('note-new-password').disabled, true);
    pendingPassword.resolve({ error: null }); await settle();
    assert.equal(document.getElementById('note-new-password'), null);
    assert.match(document.querySelector('.management-body').textContent, /비밀번호를 바꿨어요/);

    boot(); await click('note-change-password');
    document.getElementById('note-new-password').value = 'new-password';
    document.getElementById('note-confirm-password').value = 'new-password';
    behavior.password = async () => ({ error: { code: 'same_password' } }); await submit();
    assert.match(message(), /지금과 다른/); assert.equal(button('변경').disabled, false);

    boot(); await click('note-logout'); button('취소').click();
    assert.equal(calls.some(c => c[0] === 'signout'), false);
    await click('note-logout'); behavior.signout = async () => ({ error: { message: 'network' } });
    button('로그아웃').click(); await settle();
    assert.equal(calls.some(c => c[0] === 'leave'), false); assert.equal(button('로그아웃').disabled, false);
    behavior.signout = null; button('로그아웃').click(); await settle();
    assert.equal(document.getElementById('note-account-section').hidden, true);
    assert.deepEqual(calls.find(c => c[0] === 'signout')[1], { scope: 'local' });
    assert.equal(calls.filter(c => c[0] === 'leave').length, 1);

    boot(); await click('note-delete-account'); await submit();
    assert.match(message(), /닉네임이 맞지/);
    document.getElementById('note-delete-nickname').value = profileNickname; await submit();
    assert.match(message(), /안내를 확인/); assert.equal(calls.some(c => c[0] === 'session'), false);
    button('취소').click(); assert.equal(calls.some(c => c[0] === 'rpc'), false);

    boot();
    window.localStorage.setItem('ojjuda-note-composer-settings-v1:alice', '{}');
    window.localStorage.setItem('ojjuda-note-composer-settings-v1:bob', '{"font":"serif"}');
    window.localStorage.setItem('ojjuda-world-v1', '{}');
    behavior.files = [...Array.from({length:99},(_,i)=>({bucket_id:'media',photo_path:`alice/${i}.jpg`})),
      {bucket_id:'media',photo_path:'alice/nested/child.jpg'},
      {bucket_id:'note-card-photos',photo_path:'alice/card.jpg'},
      {bucket_id:'note-event-photos',photo_path:'alice/event.jpg'}];
    await readyDelete(); await submit();
    assert.equal(behavior.files.length,0,'World nested files and both Note buckets are drained');
    const removed = calls.find(c => c[0] === 'remove')[1]; assert.equal(removed.length, 100); assert.ok(removed.includes('alice/nested/child.jpg'));
    const owned = calls.find(c => c[0] === 'owner-client')[1];
    assert.equal(owned.global.headers.Authorization, 'Bearer test-token-alice');
    assert.equal(owned.auth.persistSession, false); assert.equal(owned.auth.autoRefreshToken, false);
    assert.ok(calls.findIndex(c => c[0] === 'remove') < calls.findIndex(c => c[1] === 'delete_my_account'));
    assert.deepEqual(calls.filter(c => c[0] === 'rpc').map(c=>c[1]),['prepare_my_account_deletion','my_account_deletion_files','my_account_deletion_files','my_account_deletion_files','delete_my_account']);
    assert.ok(calls.filter(c=>c[0]==='rpc').every(c=>c[2].p_expected_user_id==='alice'),'every RPC names the confirmed owner');
    assert.equal(window.localStorage.getItem('ojjuda-note-composer-settings-v1:alice'), null);
    assert.equal(window.localStorage.getItem('ojjuda-note-composer-settings-v1:bob'), '{"font":"serif"}');
    assert.equal(window.localStorage.getItem('ojjuda-world-v1'), null);
    assert.equal(calls.filter(c => c[0] === 'leave').length, 1);

    boot(); behavior.files=[{bucket_id:'media',photo_path:'alice/photo.jpg'}];
    behavior.remove = async () => ({ error: { message: 'storage unavailable' } });
    await readyDelete(); await submit();
    assert.equal(calls.some(c => c[1] === 'delete_my_account'), false); assert.equal(calls.some(c => c[0] === 'signout'), false);
    assert.match(message(), /탈퇴를 마치지 못/); assert.equal(button('탈퇴하기').disabled, false);

    boot(); behavior.rpc = async () => ({ error: { message: 'network' } });
    await readyDelete(); await submit();
    assert.equal(calls.some(c => c[0] === 'signout'), false); assert.equal(button('탈퇴하기').disabled, false);

    boot(); behavior.verify = async () => ({ data: { user: { id: 'bob' } }, error: null });
    await readyDelete(); await submit(); assert.equal(calls.some(c => c[0] === 'owner-client'), false);

    boot(); const oldList = defer(); behavior.inventory = () => oldList.promise;
    await readyDelete(); await submit(); switchTo('bob');
    oldList.resolve([{bucket_id:'media',photo_path:'alice/old.jpg'}]); await settle();
    assert.equal(calls.some(c => ['remove', 'signout', 'leave'].includes(c[0])||c[1]==='delete_my_account'), false);
    assert.equal(document.getElementById('note-account-email').textContent, 'bob@example.test');
    assert.equal(run('management.hidden'), true);

    console.log('PASS: Note account UI, nickname ownership/duplicate errors, password validation, logout confirmation/error, withdrawal consent/cleanup/token binding and account-switch cancellation. No live accounts modified.');
  } finally { dom?.window.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
