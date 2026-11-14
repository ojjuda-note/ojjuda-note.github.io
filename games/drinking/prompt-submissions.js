/* Loaded inside the verified adult game shell. Only an accepted suggestion joins the shared pool. */
(() => {
  'use strict';
  const catalog = window.DrinkingPromptCatalog;
  const kinds = ['king','fingers','imagevote'];
  const lists = Object.fromEntries(kinds.map(kind => [kind, [...(catalog[kind] || [])]]));
  const owner = document.getElementById('access-content').dataset.member;
  const queuePrefix = 'oj.party.suggestions.' + owner + '.';
  const canonical = value => value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
  const queued = new Map();
  let activeDeck, loading, sending, retryTimer;
  const invalidSubmissions = new Set(['invalid_prompt','invalid_kind','invalid_flavor']);

  function put(item) {
    const {kind, text, flavor} = item;
    if (!['king','fingers','imagevote','truth'].includes(kind) || typeof text !== 'string' || !text.trim()) return;
    if (kind === 'truth' && !['mild','spicy'].includes(flavor)) return;
    const clean = {kind,text:text.trim()};
    if (kind === 'truth') clean.flavor = flavor;
    const key=queuePrefix+JSON.stringify([kind,clean.flavor || '',canonical(text)]);
    queued.set(key,clean);
    return key;
  }
  try {
    for(let i=0;i<localStorage.length;i++) {
      const key=localStorage.key(i);
      if(key?.startsWith(queuePrefix)) {
        try { put(JSON.parse(localStorage.getItem(key))); } catch {}
      }
    }
  } catch {}
  async function invoke(action, options) {
    const client = await window.OjjudaGetClient();
    const {data:auth,error:authError} = await client.auth.getSession();
    if (authError || !owner || auth?.session?.user?.id !== owner) throw Error('member_changed');
    const {data,error} = await client.rpc('drinking_prompt_suggestions',{p_action:action,p_options:options});
    if (error) throw error;
    return data;
  }
  function refresh() {
    if (loading) return loading;
    loading = (async () => {
      try {
        const pool = await invoke('pool',{});
        if (pool?.truthFull !== true || !['mild','spicy'].every(k => Array.isArray(pool.truth?.[k]))) return false;
        for (const kind of kinds) {
          const merged = new Set([...(catalog[kind] || []),...(pool[kind] || [])]);
          lists[kind].splice(0,lists[kind].length,...merged);
        }
        activeDeck = {mild:[...pool.truth.mild],spicy:[...pool.truth.spicy]};
        return true;
      } catch { return false; }
    })().finally(() => { loading = null; });
    return loading;
  }
  async function flush() {
    if (sending || !queued.size || !navigator.onLine) return;
    sending = true;
    clearTimeout(retryTimer);
    try {
      for (const [key,item] of queued) {
        try {
          const saved = await invoke('submit',item);
          if (!saved?.ok) break;
        } catch (error) {
          // This server rejection applies only to this entry. Connection and account errors can be retried.
          if (!invalidSubmissions.has(error?.message)) throw error;
        }
        queued.delete(key);
        try { localStorage.removeItem(key); } catch {}
      }
    } catch { /* The next online or retry event resumes delivery for this member. */ }
    finally {
      sending = false;
      if (queued.size) retryTimer = setTimeout(flush,30000);
    }
  }
  function submit(kind,text,flavor) {
    if (typeof text !== 'string' || !text.trim()) return;
    const bank = kind === 'truth'
      ? [...(catalog[flavor] || []),...(activeDeck?.[flavor] || [])] : lists[kind];
    if (!bank || bank.some(entry => canonical(entry) === canonical(text))) return;
    const key=put({kind,text,flavor});
    if (!key) return;
    try { localStorage.setItem(key,JSON.stringify(queued.get(key))); } catch {}
    void flush();
  }
  window.addEventListener('online', () => { void flush();void refresh(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { void flush();void refresh(); }
  });
  window.DrinkingPrompts = {
    list:kind => lists[kind],
    truth:() => ({mild:[...(activeDeck?.mild || [])],spicy:[...(activeDeck?.spicy || [])]}),
    ready:refresh(),refresh,submit
  };
  void flush();
})();
