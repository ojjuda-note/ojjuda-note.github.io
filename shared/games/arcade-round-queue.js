// A separate storage key per round lets two tabs retain unrelated results.
// Server receipts make replay safe even if the first acknowledgement was lost.
(() => {
  'use strict';
  const prefix = 'ojjuda.arcade-round.v1:';
  const terminal = new Set(['invalid','invalid_time','banned','no_account','request_conflict','period_closed']);
  function create({ actor, send, onSaved }) {
    const entries = new Map(), retryAfter = new Map();
    let timer;
    const key = row => prefix + row.actor + ':' + row.id;
    function remember(entry) {
      try {
        localStorage.setItem(key(entry.row), JSON.stringify(entry.row));
        return true;
      } catch { return false; }
    }
    function readStored() {
      try {
        for (let i=0;i<localStorage.length;i++) {
          const name=localStorage.key(i);
          if (!name?.startsWith(prefix)) continue;
          if (entries.has(name)) continue;
          let row;
          try {row=JSON.parse(localStorage.getItem(name));} catch {continue;}
          if (row && key(row)===name && typeof row.actor==='string' && typeof row.game==='string' &&
              Number.isSafeInteger(row.score) && typeof row.finishedAt==='string') {
            entries.set(name,{ row, durable:true, attempts:0, due:0 });
          }
        }
      } catch {}
    }
    function discard(entry) {
      entries.delete(key(entry.row));
      try { localStorage.removeItem(key(entry.row)); } catch {}
    }
    const lane = entry => entry.row.actor+':'+entry.row.game;
    const due = entry => Math.max(entry.due,retryAfter.get(lane(entry))||0);
    function busyLanes() {
      return new Set([...entries.values()].filter(entry=>entry.active).map(lane));
    }
    function schedule() {
      clearTimeout(timer);
      if(!entries.size){retryAfter.clear();return;}
      const owner=actor(),busy=busyLanes();
      let next=Infinity;
      for (const entry of entries.values()) {
        if (entry.row.actor===owner && !busy.has(lane(entry))) next=Math.min(next,due(entry));
      }
      if (next!==Infinity) timer=setTimeout(resume,Math.max(0,next-Date.now()));
    }
    function attempt(entry, ready) {
      if (entry.active) return entry.active;
      entry.active=Promise.resolve(ready).catch(()=>{}).then(async()=>{
        let receipt;
        if (entry.row.actor!==actor()) return {ok:false,pending:true,durable:entry.durable,reason:'owner_changed'};
        try { receipt=await send(entry.row); }
        catch { receipt={ok:false,reason:'network'}; }
        if (receipt?.ok || terminal.has(receipt?.reason)) {
          if(receipt.ok)retryAfter.set(lane(entry),Date.now()+5200);
          discard(entry);
          if (entry.row.actor===actor()) {
            if(receipt.ok) onSaved?.(entry.row);
            for(const cb of entry.listeners||[]) { try { cb(receipt); } catch {} }
          }
          return receipt;
        }
        entry.attempts++;
        if (!entry.durable) entry.durable=remember(entry);
        entry.due=Date.now()+(receipt?.reason==='too_fast'?5200:Math.min(60000,3000*2**Math.min(5,entry.attempts-1)));
        retryAfter.set(lane(entry),entry.due);
        return {ok:false,pending:true,durable:entry.durable,reason:receipt?.reason||'network'};
      }).finally(()=>{entry.active=null;schedule();});
      return entry.active;
    }
    function resume() {
      readStored();
      if(!entries.size)return;
      const owner=actor(),busy=busyLanes();
      for (const entry of entries.values()) {
        const group=lane(entry);
        if (entry.row.actor===owner && !busy.has(group) && due(entry)<=Date.now()) {
          busy.add(group);
          void attempt(entry);
        }
      }
      schedule();
    }
    function submit(row, listener, ready) {
      if (!row.actor || row.actor!==actor()) return Promise.resolve({ok:false,reason:'owner_changed'});
      if(!entries.has(key(row)))readStored();
      const existing=entries.get(key(row));
      if (existing && (existing.row.game!==row.game || existing.row.score!==row.score)) {
        schedule();
        return Promise.resolve({ok:false,reason:'request_conflict'});
      }
      const entry=existing||{row,durable:false,attempts:0,due:0};
      if (!existing) {entries.set(key(row),entry);entry.durable=remember(entry);}
      if (listener) (entry.listeners||=new Set()).add(listener);
      return attempt(entry,ready);
    }
    return {submit,resume};
  }
  window.OjjudaArcadeRoundQueue={create};
})();
