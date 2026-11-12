(function(global){
  'use strict';

  function createBoard(surfaces, zoomDialog, buttons) {
    const preference = global.matchMedia('(prefers-reduced-motion: reduce)');
    let paused = preference.matches;
    let renderer = null;
    let entries = [];
    let active = false;
    let elapsed = 0;
    let previous = null;
    let request = null;
    let paintedZoom = null;

    function cancel() {
      if (request !== null) global.cancelAnimationFrame(request);
      request = null;
      previous = null;
    }

    function paint() {
      if (!renderer || document.hidden) return;
      const zoom = zoomDialog.open;
      for (const entry of entries) {
        if (entry.zoom !== zoom) continue;
        const {canvas, context} = entry;
        context.setTransform(canvas.width / 900, 0, 0, canvas.height / 600, 0, 0);
        renderer.draw(context, entry.side, elapsed);
      }
      paintedZoom = zoom;
    }

    function tick(time) {
      request = null;
      if (!active || !renderer || paused || document.hidden) return;
      if (previous === null || time - previous >= 1000 / 30) {
        if (previous !== null) elapsed += Math.min(.15, (time - previous) / 1000);
        previous = time;
        paint();
      }
      request = global.requestAnimationFrame(tick);
    }

    function sync(running = active) {
      active = running;
      if (!renderer) return;
      if (!document.hidden && paintedZoom !== zoomDialog.open) paint();
      if (!running || paused || document.hidden) cancel();
      else if (request === null) request = global.requestAnimationFrame(tick);
    }

    function updateButtons() {
      for (const button of buttons) {
        button.hidden = !renderer;
        button.textContent = paused ? '움직임 재생' : '움직임 멈춤';
        button.setAttribute('aria-pressed', String(paused));
      }
    }

    function clear() {
      cancel();
      for (const {canvas} of entries) canvas.remove();
      entries = [];
      renderer = null;
      active = false;
      elapsed = 0;
      paintedZoom = null;
      updateButtons();
    }

    function load(image, scene) {
      clear();
      renderer = global.OjjudaMotionRenderer.create(image, scene);
      const width = Math.min(1536, Math.max(1, image.naturalWidth));
      try {
        for (const surface of surfaces) {
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = Math.round(width * 2 / 3);
          canvas.className = 'native-motion-canvas';
          canvas.setAttribute('aria-hidden', 'true');
          const context = canvas.getContext('2d', {alpha: false});
          if (!context) throw new Error('그림을 표시할 수 없어요.');
          surface.insertBefore(canvas, surface.querySelector('.marks'));
          entries.push({canvas, context, zoom: surface.classList.contains('zoom-picture'), side: surface.dataset.side === 'difference' ? 1 : 0});
        }
        paint();
        updateButtons();
      } catch (error) {
        clear();
        throw error;
      }
    }

    for (const button of buttons) button.addEventListener('click', () => {
      paused = !paused;
      updateButtons();
      sync();
    });
    preference.addEventListener?.('change', event => {
      paused = event.matches;
      updateButtons();
      sync();
    });
    zoomDialog.addEventListener('close', () => sync());
    document.addEventListener('visibilitychange', () => sync());
    global.addEventListener('pagehide', cancel);
    return {load, clear, sync};
  }

  global.OjjudaMotionBoard = {createBoard};
})(window);
