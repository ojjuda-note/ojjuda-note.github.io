(() => {
  'use strict';
  const KEY = 'ojjuda-daily-update-read:';
  const DAY = 86400000, KST = 9 * 3600000;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag); node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  let instance;
  function install({client, getUserId = () => null, isReady = () => true, canShow = () => true} = {}) {
    if (instance || !client?.rpc) return instance;
    let identity = getUserId() || null, epoch = 0, candidate = null, pending = null;
    let timer, serverOffset = 0, lastFetch = 0, saving = false, priorFocus = null;
    const memory = new Map();
    const dialog = el('dialog','daily-updates-dialog'); dialog.id = 'daily-updates-dialog';
    dialog.setAttribute('aria-labelledby','daily-updates-title');
    const content = el('div','daily-updates-content');
    const heading = el('header','daily-updates-heading');
    const date = el('p','daily-updates-date');
    const title = el('h2','daily-updates-title','오늘 달라진 점'); title.id = 'daily-updates-title';
    const list = el('ul','daily-updates-list');
    const footer = el('div','daily-updates-footer');
    const status = el('p','daily-updates-status'); status.setAttribute('role','status');
    const confirm = el('button','daily-updates-confirm','확인'); confirm.type = 'button';
    heading.append(date,title); footer.append(status,confirm); content.append(heading,list,footer);
    dialog.append(content); document.body.append(dialog);
    const userNow = () => getUserId() || null;
    const current = (run,user) => run === epoch && user === identity && user === userNow();
    const keyFor = user => KEY + (user || 'guest');
    function lastRead(user) {
      try { return localStorage.getItem(keyFor(user)) || memory.get(user) || ''; }
      catch { return memory.get(user) || ''; }
    }
    function remember(user,id) {
      const value = [id,lastRead(user)].sort().pop();
      localStorage.setItem(keyFor(user),value); memory.set(user,value);
    }
    function close() {
      if (!dialog.open) return;
      dialog.close();
      if (priorFocus?.isConnected) priorFocus.focus({preventScroll:true});
      priorFocus = null;
    }
    function allowed() {
      if (document.hidden || !isReady() || !canShow() || document.body.classList.contains('gaming')) return false;
      if (document.querySelector('#modal-root:not(:empty),#matgo-overlay,#ttang-overlay,#photo-ttang-overlay')) return false;
      if ([...document.querySelectorAll('dialog[open],[aria-modal="true"]')].some(n => n !== dialog && !n.hidden && !n.closest('[hidden]'))) return false;
      const active = document.activeElement;
      return dialog.contains(active) || !active?.matches('input,textarea,[contenteditable="true"],iframe');
    }
    function expire() {
      if (candidate && Date.now() + serverOffset >= Date.parse(candidate.expires_at)) { candidate = null; close(); }
    }
    function show() {
      expire();
      if (dialog.open || saving || !candidate || !allowed()) return;
      if (lastRead(identity) >= candidate.id) { candidate = null; return; }
      const [,month,day] = candidate.date.split('-');
      date.textContent = `${Number(month)}월 ${Number(day)}일 업데이트`;
      list.replaceChildren(...candidate.items.map(text => el('li','',text)));
      status.textContent = ''; confirm.disabled = false;
      priorFocus = document.activeElement; dialog.showModal(); confirm.focus({preventScroll:true});
    }
    function sync() {
      expire();
      const next = userNow();
      if (next !== identity) {
        epoch++; identity = next; candidate = null; pending = null; lastFetch = 0; saving = false;
        confirm.disabled = false; status.textContent = ''; close();
        void refresh(true); return;
      }
      if (dialog.open && (!isReady() || !canShow())) close();
      if (isReady() && !lastFetch && !pending) void refresh(true);
      show();
    }
    function schedule() {
      clearTimeout(timer);
      const now = Date.now() + serverOffset, elapsed = ((now + KST) % DAY + DAY) % DAY;
      // Check the KST boundary exactly, then more often while the daily summary is prepared.
      const delay = Math.max(1000,Math.min(DAY-elapsed,elapsed < 30*60000 ? 60000 : 5*60000));
      timer = setTimeout(() => { expire(); void refresh(true); },delay);
    }
    async function refresh(force = false) {
      syncIdentityOnly();
      if (document.hidden || !isReady()) { schedule(); return; }
      if (pending) return pending;
      if (!force && Date.now()-lastFetch < 60000) { show(); schedule(); return; }
      const user = identity, run = epoch;
      const request = (async () => {
        try {
          const {data,error} = await client.rpc('get_daily_update_notice');
          if (error) throw error;
          if (!current(run,user) || (data?.viewer || null) !== user) return;
          const server = Date.parse(data?.server_now);
          if (Number.isFinite(server)) serverOffset = server-Date.now();
          lastFetch = Date.now();
          const next = data?.notice;
          const valid = next && /^\d{4}-\d{2}-\d{2}$/.test(next.id) && next.date === next.id
            && Number.isFinite(Date.parse(next.available_at)) && Number.isFinite(Date.parse(next.expires_at))
            && Date.parse(next.available_at) <= Date.now() + serverOffset && Date.now() + serverOffset < Date.parse(next.expires_at)
            && Array.isArray(next.items) && next.items.length > 0 && next.items.length <= 30
            && next.items.every(text => typeof text === 'string' && text.length <= 80);
          if (!valid || lastRead(user) >= next.id) { candidate = null; close(); }
          else if (!candidate || candidate.id !== next.id) { close(); candidate = next; }
          show();
        } catch { /* Keep the app usable and retry; never invent completed changes. */ }
        finally { if (current(run,user)) { pending = null; schedule(); } }
      })();
      pending = request; return request;
    }
    function syncIdentityOnly() {
      const next = userNow();
      if (next === identity) return;
      epoch++; identity = next; candidate = null; pending = null; lastFetch = 0; saving = false; close();
    }
    async function acknowledge() {
      if (saving || !candidate) return;
      const notice = candidate, user = identity, run = epoch;
      if (!current(run,user)) { sync(); return; }
      saving = true; confirm.disabled = true; status.textContent = '';
      try {
        if (user) {
          const {data,error} = await client.rpc('acknowledge_daily_update_notice',{p_date:notice.id});
          if (error || data !== true) throw error || Error('Read receipt failed');
          if (!current(run,user)) return;
          // Server storage is authoritative for members; local storage is an optimization.
          try { remember(user,notice.id); } catch { memory.set(user,notice.id); }
        } else remember(user,notice.id);
        if (!current(run,user)) return;
        candidate = null; close();
      } catch {
        if (current(run,user)) status.textContent = '확인 기록을 저장하지 못했어요. 다시 눌러 주세요.';
      } finally { if (current(run,user)) { saving = false; confirm.disabled = false; } }
    }
    confirm.addEventListener('click',() => void acknowledge());
    dialog.addEventListener('cancel',event => { event.preventDefault(); void acknowledge(); });
    function resume() { if (!document.hidden) void refresh(); }
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('focus',resume);
    window.addEventListener('online',() => void refresh(true));
    window.addEventListener('pageshow',resume);
    window.addEventListener('storage',event => {
      if (event.key === keyFor(identity) && candidate && lastRead(identity) >= candidate.id) { candidate = null; close(); }
    });
    const observer = new MutationObserver(() => sync());
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('focusout',() => setTimeout(show,0));
    // Auth callbacks must not await Supabase RPC calls while its auth lock is held.
    client.auth?.onAuthStateChange?.(() => setTimeout(() => { sync(); void refresh(true); },0));
    instance = {refresh,sync,isOpen:() => dialog.open,acknowledge};
    void refresh(true);
    return instance;
  }
  window.OjjudaDailyUpdates = {install};
})();
