/* The World model owns accounts, purchases and persistence. The frame only renders. */
(function () {
  'use strict';
  window.OjjudaRoom3D = {
    install(app) {
      let frame = null, stage = null, engine = null, timer = null, observer = null, owner = null;
      const current = () => frame?.isConnected && stage?.isConnected && app.identity() === owner;
      const visible = () => {
        const rect = stage?.getBoundingClientRect();
        return current() && !frame.hidden && !document.hidden &&
          !document.querySelector('#gov, #modal-root .modal') &&
          rect.bottom >= -80 && rect.top <= innerHeight + 80;
      };
      const refreshActive = () => engine?.setActive(!!visible());
      const dispose = () => {
        clearTimeout(timer); observer?.disconnect();
        try { engine?.dispose(); } catch (_) {}
        engine = null; frame = null; stage = null;
      };
      const fallback = () => {
        if (!stage?.isConnected) return;
        clearTimeout(timer); stage.classList.remove('room3d-ready');
        stage.querySelector('#room-svg')?.removeAttribute('aria-hidden');
        frame.hidden = true;
        const status = stage.querySelector('.room3d-status');
        status.textContent = '기본 화면으로 열었어요. 그대로 꾸밀 수 있어요.';
        engine?.setActive(false);
      };
      const sync = () => {
        if (!frame?.isConnected || !stage?.isConnected || !engine) return;
        owner = app.identity();
        try {
          const data = app.snapshot();
          refreshActive();
          engine.applyRoom(data);
          const select = stage.querySelector('.room3d-item-select');
          if (select) {
            const options = data.items.map(item => ({id: item.id, name: item.name}));
            const key = JSON.stringify(options);
            if (select.dataset.items !== key) {
              select.replaceChildren(new Option('가구 선택', ''), ...options.map(item => new Option(item.name, item.id)));
              select.dataset.items = key;
            }
            select.value = data.selected || '';
          }
        } catch (error) {
          console.error('Room render failed', error); fallback();
        }
      };
      const ready = () => {
        if (!current() || engine) return;
        engine = frame.contentWindow.Ojjuda3D;
        if (!engine?.applyRoom) return fallback();
        engine.hooks.onSelect = id => { if (current()) app.select(id); };
        engine.hooks.onMove = item => { if (current()) app.move(item); };
        engine.hooks.onInteract = id => { if (current()) app.interact(id); };
        engine.hooks.onWalk = (x, z) => { if (current()) app.walk(x, z); };
        engine.hooks.onError = fallback;
        sync();
        if (!engine || frame.hidden) return;
        clearTimeout(timer); stage.classList.add('room3d-ready');
        stage.querySelector('#room-svg')?.setAttribute('aria-hidden', 'true');
        stage.querySelector('.room3d-status').textContent = '';
        observer = new IntersectionObserver(refreshActive, {rootMargin:'80px'});
        observer.observe(stage);
      };
      window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.source !== frame?.contentWindow || !current()) return;
        if (event.data?.type === 'ojjuda-room-ready') ready();
        if (event.data?.type === 'ojjuda-room-error') fallback();
      });
      const mount = () => {
        const next = document.querySelector('#stage');
        if (next === stage) { owner = app.identity(); sync(); return; }
        dispose();
        if (!next) return;
        stage = next; owner = app.identity(); stage.classList.add('room3d-stage');
        frame = document.createElement('iframe');
        frame.className = 'room3d-frame'; frame.title = '우리집 입체 방';
        frame.src = '/room3d/index.html?v=20261001-wardrobe1';
        const status = document.createElement('span'); status.className = 'room3d-status';
        status.setAttribute('role', 'status'); status.textContent = '우리집을 준비하고 있어요…';
        const controls = document.createElement('div'); controls.className = 'room3d-tools';
        controls.setAttribute('data-world-swipe','off');
        for (const [label,text,delta] of [['방 축소','−',-.15],['원래 크기로','맞춤',0],['방 확대','+',.15]]) {
          const button = document.createElement('button'); button.type = 'button';
          button.setAttribute('aria-label',label); button.textContent = text;
          button.addEventListener('click',()=>engine?.zoom(delta)); controls.append(button);
        }
        stage.append(frame, status, controls);
        if (app.snapshot().editing) {
          const select = document.createElement('select'); select.className = 'room3d-item-select';
          select.setAttribute('aria-label','가구 선택');
          select.addEventListener('change',()=>app.select(select.value || null));
          stage.append(select);
        }
        // Own-house navigation is already available in the single house header.
        const duplicate = document.querySelector('#stage-bar [data-tab="deco"]');
        if (duplicate) duplicate.remove();
        frame.addEventListener('load', () => { if (frame?.contentWindow.Ojjuda3D) ready(); });
        timer = setTimeout(fallback, 20000);
      };
      document.addEventListener('visibilitychange', refreshActive);
      window.addEventListener('pagehide', dispose);
      window.addEventListener('pageshow', () => { if (!frame) mount(); });
      return {mount,sync,dispose};
    }
  };
})();
