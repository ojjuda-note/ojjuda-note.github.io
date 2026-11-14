/* Loaded inside the verified adult game shell. Only an accepted suggestion joins the shared pool. */
(() => {
  'use strict';
  const kinds = new Set(['bomb','liar','minority','mission','initial','king','fingers','imagevote','truth']);
  const banks = new Map();
  const loads = new Map();
  const owner = document.getElementById('access-content').dataset.member;
  const queuePrefix = 'oj.party.suggestions.' + owner + '.';
  const canonical = value => value.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
  const queued = new Map();
  let sending, retryTimer;
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
  async function invoke(name, action, options) {
    const client = await window.OjjudaGetClient();
    const {data:auth,error:authError} = await client.auth.getSession();
    if (authError || !owner || auth?.session?.user?.id !== owner) throw Error('member_changed');
    const {data,error} = await client.rpc(name,{p_action:action,p_options:options});
    if (error) throw error;
    return data;
  }
  const textItem = item => typeof item === 'string' && item.trim().length > 0;
  function validBank(kind, bank) {
    if (kind === 'truth') {
      return ['mild','spicy'].every(flavor => Array.isArray(bank?.[flavor]) && bank[flavor].every(textItem));
    }
    if (!Array.isArray(bank)) return false;
    if (kind === 'minority' || kind === 'mission') {
      return bank.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(textItem));
    }
    return bank.every(textItem);
  }
  // Reuse an unchanged array so local shuffle bags survive a new round. Replace it on edits
  // so a round that already holds the old array can finish without changing its questions.
  function refresh(kind) {
    if (!kinds.has(kind)) return Promise.resolve(false);
    if (loads.has(kind)) return loads.get(kind);
    const request = (async () => {
      try {
        const result = await invoke('drinking_content','pool',{kinds:[kind]});
        const bank = result?.banks?.[kind];
        if (!validBank(kind,bank)) return false;
        if (JSON.stringify(bank) !== JSON.stringify(banks.get(kind))) banks.set(kind,bank);
        return true;
      } catch { return false; }
    })().finally(() => loads.delete(kind));
    loads.set(kind,request);
    return request;
  }
  function recommendations(kind) {
    let round, snapshot;
    return async (roundKey, previous) => {
      if (round !== roundKey) {round=roundKey;snapshot=null;}
      if (!snapshot) snapshot=refresh(kind).then(ok=>ok?banks.get(kind):null);
      const request=snapshot, bank=await request;
      if (!bank) {
        if (snapshot===request) snapshot=null;
        return '';
      }
      const other=bank.filter(item=>item!==previous);
      const items=other.length?other:bank;
      return items[Math.floor(Math.random()*items.length)] || '';
    };
  }
  async function flush() {
    if (sending || !queued.size || !navigator.onLine) return;
    sending = true;
    clearTimeout(retryTimer);
    try {
      for (const [key,item] of queued) {
        try {
          const saved = await invoke('drinking_prompt_suggestions','submit',item);
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
      ? banks.get('truth')?.[flavor] : banks.get(kind);
    if (bank?.some(entry => canonical(entry) === canonical(text))) return;
    const key=put({kind,text,flavor});
    if (!key) return;
    try { localStorage.setItem(key,JSON.stringify(queued.get(key))); } catch {}
    void flush();
  }
  window.addEventListener('online',flush);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void flush(); });
  window.DrinkingPrompts = {
    managed:kind => kinds.has(kind),
    list:kind => banks.get(kind) || [],
    truth:() => banks.get('truth') || {mild:[],spicy:[]},
    refresh,recommendations,submit
  };
  void flush();
})();
