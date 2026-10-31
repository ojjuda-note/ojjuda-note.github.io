/* Prepare only the public photo/body/tag face of a card for a user-initiated share. */
(() => {
  'use strict';
  let rendererPromise = null;
  const timeout = (promise, milliseconds = 12000) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('card_image_timeout')), milliseconds);
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
  function renderer() {
    if (typeof window.html2canvas === 'function') return Promise.resolve(window.html2canvas);
    if (rendererPromise) return rendererPromise;
    const script = document.createElement('script');
    script.src = '/vendor/html2canvas-1.4.1.min.js'; script.async = true;
    rendererPromise = timeout(new Promise((resolve, reject) => {
      script.onload = () => typeof window.html2canvas === 'function' ? resolve(window.html2canvas) : reject(new Error('card_renderer_unavailable'));
      script.onerror = () => reject(new Error('card_renderer_unavailable'));
      document.head.append(script);
    })).catch(error => { script.remove(); rendererPromise = null; throw error; });
    return rendererPromise;
  }
  async function prepare(photo, { filename = 'ojjuda-card.png', isCurrent = () => true, beforeCapture = () => {} } = {}) {
    const urls = [], controller = new AbortController();
    let alive = true;
    const check = () => {
      if (!alive || !isCurrent()) throw new DOMException('Share preparation was replaced', 'AbortError');
      if (!photo?.isConnected || !photo.matches('.photo')) throw new Error('card_image_missing');
    };
    try {
      check();
      const originalBackground = getComputedStyle(photo).backgroundImage;
      const images = [...originalBackground.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)];
      // Only the public built-in background belongs in the exported card.
      // Decode it first: html2canvas otherwise skips failed images silently.
      const backgrounds = images.map(async match => {
        const source = new URL((match[1] || match[2] || match[3]).trim(), location.href);
        const key = source.pathname.match(/^\/note\/assets\/(\d{2,3})\.jpg$/)?.[1];
        if (source.origin !== location.origin || !key || Number(key) < 10 || Number(key) > 189)
          throw new Error('card_background_not_public');
        const response = await fetch(source.href, { signal: controller.signal, credentials: 'same-origin' });
        check(); if (!response.ok) throw new Error('card_background_unavailable');
        const blob = await response.blob(); check();
        const url = URL.createObjectURL(blob); urls.push(url);
        const image = new Image(); image.src = url;
        await image.decode(); check();
        if (!image.naturalWidth || !image.naturalHeight) throw new Error('card_background_unavailable');
        return [match[0], `url("${url}")`];
      });
      const [capture, replacements] = await timeout(Promise.all([
        renderer(), Promise.all(backgrounds), document.fonts?.ready || Promise.resolve()
      ]));
      check(); beforeCapture(); check();
      const rect = photo.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || getComputedStyle(photo).visibility === 'hidden') throw new Error('card_image_hidden');
      let background = originalBackground;
      for (const [original, prepared] of replacements) background = background.replace(original, prepared);
      const scale = Math.min(2, 2048 / rect.width, 4096 / rect.height, Math.sqrt(4000000 / (rect.width * rect.height)));
      const canvas = await timeout(capture(photo, {
        backgroundColor: null, scale, width: Math.ceil(rect.width), height: Math.ceil(rect.height),
        windowWidth: innerWidth, windowHeight: innerHeight,
        allowTaint: false, useCORS: false, foreignObjectRendering: false, imageTimeout: 8000, logging: false,
        ignoreElements: element => element.matches('.card-photo-thumb,.card-meta,.card-actions,.card-manage'),
        onclone(clonedDocument, captured) {
          check();
          captured.style.backgroundImage = background;
          captured.style.width = `${rect.width}px`; captured.style.height = `${rect.height}px`;
          captured.style.minHeight = '0'; captured.style.maxHeight = 'none';
          captured.querySelectorAll('img,video,iframe,canvas,.card-photo-thumb,.card-meta,.card-actions,.card-manage').forEach(element => element.remove());
          const style = clonedDocument.createElement('style');
          style.textContent = '.photo,.photo *,.photo::before,.photo::after,.photo *::before,.photo *::after{animation:none!important;transition:none!important}';
          clonedDocument.head.append(style);
        }
      }));
      check();
      const blob = await timeout(new Promise(resolve => canvas.toBlob(resolve, 'image/png')));
      check(); if (!blob?.size) throw new Error('card_image_empty');
      return new File([blob], filename, { type: 'image/png', lastModified: Date.now() });
    } finally {
      alive = false; controller.abort(); urls.forEach(url => URL.revokeObjectURL(url));
    }
  }
  window.OjjudaCardShareImage = Object.freeze({ prepare });
})();
