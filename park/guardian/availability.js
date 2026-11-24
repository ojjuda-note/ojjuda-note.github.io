(async () => {
  'use strict';
  const status = document.getElementById('availability');
  const config = window.OJJUDA_CONFIG;
  try {
    const response = await fetch(config.supabaseUrl + '/rest/v1/rpc/park_guardian_signup_open', {
      method: 'POST',
      headers: { apikey: config.supabaseKey, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw Error();
    const open = await response.json();
    if (open !== true) {
      status.textContent = '현재 만 12~13세 가입 접수를 준비하고 있어요.';
      return;
    }
    document.getElementById('enrollment').hidden = false;
    status.hidden = true;
  } catch {
    status.textContent = '가입 접수 상태를 확인할 수 없어요. 잠시 후 다시 열어 주세요.';
  }
})();
