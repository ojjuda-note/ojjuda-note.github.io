(function (root) {
  'use strict';

  // A page owns its requests. A hidden, departed or differently authenticated
  // page must never apply an old response, even if the transport ignores abort.
  function create({onPause = () => {}, onResume = () => {}} = {}) {
    let epoch = 0, away = false, disposed = false, failures = 0, wakeTimer;
    let blocked = root.OjjudaDrinkingAccessReady === false;
    const requests = new Set();
    const listeners = [];
    const active = () => !disposed && !away && !blocked && !root.document.hidden && root.navigator.onLine !== false;
    const cancelled = error => error?.code === 'superseded';
    const obsolete = () => Object.assign(new Error('The room request is no longer current.'), {code:'superseded'});
    function cancel(readsOnly = false) {
      for (const task of requests) {
        if (!readsOnly || task.read) task.cancel();
      }
    }
    function suspend() {
      epoch++;
      clearTimeout(wakeTimer); wakeTimer = undefined;
      cancel();
      onPause();
    }
    function wake() {
      if (!active() || wakeTimer !== undefined) return;
      // focus, visibilitychange and pageshow commonly arrive in one burst.
      wakeTimer = setTimeout(() => {
        wakeTimer = undefined;
        if (active()) onResume();
      }, 0);
    }
    function listen(target, name, callback) {
      target.addEventListener(name, callback);
      listeners.push(() => target.removeEventListener(name, callback));
    }
    listen(root.document, 'visibilitychange', () => {
      if (root.document.hidden) suspend();
      else { away = false; wake(); }
    });
    listen(root, 'pagehide', () => { away = true; suspend(); });
    listen(root, 'pageshow', () => { away = false; wake(); });
    listen(root, 'offline', suspend);
    listen(root, 'online', wake);
    listen(root, 'focus', wake);
    listen(root.document, 'ojjuda:drinking-access', event => {
      blocked = event.detail?.allowed !== true;
      if (blocked) suspend(); else wake();
    });

    async function request(makeRequest, {read = false, timeout = 12000} = {}) {
      if (!active()) throw obsolete();
      const version = epoch, controller = new AbortController();
      let timer, rejectCancelled, wasCancelled = false;
      const interruption = new Promise((_, reject) => { rejectCancelled = reject; });
      const task = {read, cancel() {
        if (wasCancelled) return;
        wasCancelled = true;
        rejectCancelled(obsolete());
        controller.abort();
      }};
      requests.add(task);
      timer = setTimeout(() => {
        rejectCancelled(Object.assign(new Error('연결이 늦어지고 있어요. 다시 확인하고 있어요.'), {code:'connection_timeout'}));
        controller.abort();
      }, timeout);
      try {
        const result = await Promise.race([Promise.resolve().then(() => {
          if (wasCancelled || version !== epoch || !active()) throw obsolete();
          return makeRequest(controller.signal);
        }), interruption]);
        if (wasCancelled || version !== epoch || !active()) throw obsolete();
        return result;
      } catch (error) {
        if (wasCancelled || version !== epoch || !active()) throw obsolete();
        throw error;
      } finally {
        clearTimeout(timer);
        requests.delete(task);
      }
    }

    return Object.freeze({
      active, request, cancelled,
      cancelReads: () => cancel(true),
      pause() { away = true; suspend(); },
      succeeded() { failures = 0; },
      failed() { failures = Math.min(failures + 1, 6); },
      delay(base) {
        const interval = failures ? Math.max(base, 800) * 2 ** Math.min(failures, 4) : base;
        return Math.round(Math.min(12000, interval * (0.85 + Math.random() * 0.3)));
      },
      dispose() {
        disposed = true; suspend();
        listeners.splice(0).forEach(remove => remove());
      }
    });
  }
  root.OjjudaRoomConnection = Object.freeze({create});
})(window);
