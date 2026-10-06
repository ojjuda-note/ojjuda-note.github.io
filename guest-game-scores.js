/* Guest scores use a separate, non-persistent API client, never a member session. */
(() => {
  'use strict';
  const games = new Set(['mole','runner','stacker','breakout','screw','screw_box','screw_flat','spot','ttang']);
  const storageKey = 'ojjuda.guest-ranking.v1';
  let client, identity;
  function token() {
    if (identity) return identity;
    try { identity = localStorage.getItem(storageKey); } catch {}
    if (!/^[a-f0-9]{64}$/.test(identity || '')) {
      identity = [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2,'0')).join('');
      try { localStorage.setItem(storageKey, identity); } catch {}
    }
    return identity;
  }
  function api() {
    const config = window.OJJUDA_CONFIG;
    if (!client && config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient) {
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
        auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'ojjuda-guest-ranking-api'}
      });
    }
    if (!client) throw new Error('손님 기록 서버에 연결하지 못했어요.');
    return client;
  }
  async function rpc(name, args) {
    const {data,error} = await api().rpc(name,args).abortSignal(AbortSignal.timeout(10000));
    if (error) throw error;
    return data;
  }
  async function submit(game, score, requestId = crypto.randomUUID()) {
    if (!games.has(game) || !Number.isSafeInteger(score) || score < 0) return {ok:false,reason:'invalid'};
    const args = {p_game:game,p_score:score,p_guest_token:token(),p_request_id:requestId};
    let result = await rpc('submit_guest_game_score',args);
    if (result?.reason === 'too_fast') {
      await new Promise(resolve => setTimeout(resolve,5100));
      result = await rpc('submit_guest_game_score',args);
    }
    if (result?.ok) window.dispatchEvent(new CustomEvent('ojjuda:game-record-saved',{detail:{guest:true}}));
    return result || {ok:false};
  }
  async function ranking(game, period = 'day') {
    if (!games.has(game)) return [];
    return await rpc('guest_game_ranking',{p_game:game,p_period:period,p_guest_token:token()}) || [];
  }
  window.OjjudaGuestScores = Object.freeze({submit,ranking});
})();
