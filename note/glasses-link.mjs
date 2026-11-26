const hex = bytes => Array.from(bytes, value => value.toString(16).padStart(2,'0')).join('');
const validProof = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

// Only the challenge leaves the app in a URL. The proof stays in Even storage.
export function createG2Link({load, save, complete, accept, change, now = Date.now, cryptoApi = globalThis.crypto}) {
  let pending, url = '', generation = 0, checking = false, preparing, retryAfter = 0;
  const fresh = item => item && validProof(item.proof) && Number.isSafeInteger(item.until) &&
    item.until > now()/1000 && item.until <= now()/1000+660;
  async function prepare() {
    if (fresh(pending) && url) return;
    if (preparing || now() < retryAfter) return preparing;
    const current = generation;
    preparing = (async () => {
      let item;
      try { item = JSON.parse(await load()); } catch {}
      if (!fresh(item)) {
        item = {proof:hex(cryptoApi.getRandomValues(new Uint8Array(32))), until:Math.floor(now()/1000)+600, opened:false};
        if (await save(JSON.stringify(item)) === false) throw Error('storage');
      }
      const digest = await cryptoApi.subtle.digest('SHA-256', new TextEncoder().encode('park-g2-link-v1:'+item.until+':'+item.proof));
      if (generation !== current) return;
      pending = item;
      url = 'https://ojjuda.kr/park/g2-connect.html#'+hex(new Uint8Array(digest))+'.'+item.until;
      change();
    })().catch(() => { if (current === generation) {url='';retryAfter=now()+15000;change();} })
      .finally(() => {if(current === generation) preparing=null;});
    return preparing;
  }
  function opened() {
    if (!fresh(pending) || !url) return false;
    pending.opened=true;
    void save(JSON.stringify(pending)).catch(()=>{});
    return true;
  }
  async function check(force = false) {
    if (!fresh(pending)) {url='';await prepare();return;}
    if ((!pending.opened && !force) || checking || (!force && now()<retryAfter)) return;
    const item=pending, current=generation;
    checking=true;
    retryAfter=now()+4000;
    try {
      if (await complete(item.proof,item.until) && generation===current && item===pending) {
        await accept(item.proof);
        if (current===generation) await clear();
      }
    } catch { /* A lost response is safe to retry until the approval expires. */ }
    finally { if (current===generation) checking=false; }
  }
  async function clear() {
    ++generation; pending=null;url='';preparing=null;checking=false;retryAfter=0;
    change();
    try { await save(''); } catch {}
  }
  return {prepare, opened, check, clear, get href(){return fresh(pending)?url:'';}};
}
