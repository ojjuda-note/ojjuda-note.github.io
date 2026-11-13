(() => {
  'use strict';
  const site = 'https://ojjuda-party-arcade-lab.mj830417686850.chatgpt.site';
  const channel = 'ojjuda.member-check.v1';
  const opener = window.opener;
  const status = document.getElementById('verify-status');
  const again = document.getElementById('verify-again');
  const back = document.getElementById('return-site');
  const login = document.getElementById('verify-login');
  const profile = document.getElementById('verify-profile');
  const messages = {
    login:'오쭈다에 로그인한 뒤 이 창에서 다시 확인해 주세요.',
    identity:'내 정보에서 생년월일을 등록한 뒤 다시 확인해 주세요.',
    underage:'만 19세부터 이용할 수 있어요.',
    unavailable:'회원 정보를 확인할 수 없어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.'
  };
  let setup, lastNonce, version = 0, approved = false, member;
  function send(type, extra = {}) {
    if (opener && !opener.closed) opener.postMessage({channel, type, ...extra},site);
  }
  function denied(code) {
    approved = false;
    status.textContent = messages[code] || messages.unavailable;
    back.hidden = true;
    again.hidden = false;
    login.hidden = code !== 'login';
    profile.hidden = code !== 'identity';
  }
  function invalidate(code) {
    version++;lastNonce = null;
    if (approved) send('revoke');
    denied(code);
  }
  async function prepare() {
    const service = await window.OjjudaGetClient();
    const access = window.OjjudaMatgoAccess;
    access.configure(service);
    access.subscribe(err => {
      // A denial also rejects its own request below. Only invalidate an existing grant.
      if (approved) invalidate(err?.code || 'unavailable');
    });
    return access;
  }
  async function check(nonce) {
    const current = ++version;
    lastNonce = nonce;
    try {
      if (!navigator.onLine) throw Error('offline');
      if (!setup) setup = prepare().catch(err => { setup = null; throw err; });
      const identity = await (await setup).check();
      if (current !== version) return;
      if (!navigator.onLine || !identity?.userId || !Number.isInteger(identity.age) || identity.age < 19) throw Error('unavailable');
      if (member && member !== identity.userId) {
        member = identity.userId;
        invalidate('unavailable');return;
      }
      member = identity.userId;
      approved = true;
      status.textContent = '확인됐어요. 이 창을 열어 둔 채 원래 창으로 돌아가 주세요.';
      login.hidden = profile.hidden = again.hidden = true;
      back.hidden = false;
      send('result',{nonce,allowed:true});
    } catch (err) {
      if (current !== version) return;
      if (approved) send('revoke');
      denied(err?.code || 'unavailable');
      send('result',{nonce,allowed:false});
    }
  }
  window.addEventListener('message', event => {
    const data = event.data;
    if (!opener || event.origin !== site || event.source !== opener || data?.channel !== channel ||
        data.type !== 'check' || typeof data.nonce !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.nonce)) return;
    if (data.nonce !== lastNonce) void check(data.nonce);
  });
  again.onclick = () => {
    // On mobile the Site may be suspended while this tab is visible.
    if (lastNonce) void check(lastNonce);
    send('ready');
  };
  back.onclick = () => { try { opener.focus(); } catch {} };
  window.addEventListener('pagehide', () => invalidate('unavailable'));
  window.addEventListener('offline', () => invalidate('unavailable'));
  window.addEventListener('pageshow', e => { if (e.persisted) send('ready'); });
  if (opener) send('ready');
  else { status.textContent = '원래 창으로 돌아가 회원 확인 버튼을 눌러 주세요.'; }
})();
