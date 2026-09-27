/* A small, local slippy map. Tiles load only after the user opens a map. */
(() => {
  'use strict';
  const TILE = 256, RAD = Math.PI / 180;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const project = (lat, lng, zoom) => {
    const scale = TILE * 2 ** zoom;
    const phi = clamp(lat, -85.0511, 85.0511) * RAD;
    return { x: (lng + 180) / 360 * scale,
      y: (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2 * scale };
  };
  const unproject = (x, y, zoom) => {
    const scale = TILE * 2 ** zoom;
    return { lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) / RAD,
      lng: x / scale * 360 - 180 };
  };
  function create(host, { center = { lat: 37.5665, lng: 126.978 }, zoom = 12, onSelect, onEvent, onMove } = {}) {
    if (!(host instanceof HTMLElement)) return null;
    const stage = document.createElement('div'); stage.className = 'oj-map-stage';
    if (onSelect) {
      stage.tabIndex = 0;
      stage.setAttribute('role', 'group');
      stage.setAttribute('aria-label', '이벤트 위치 지도. 방향키로 지도를 이동하고 아래 버튼으로 중심을 선택하세요.');
    }
    const tiles = document.createElement('div'); tiles.className = 'oj-map-tiles';
    const overlay = document.createElement('div'); overlay.className = 'oj-map-overlay';
    const controls = document.createElement('div'); controls.className = 'oj-map-controls';
    const plus = document.createElement('button'), minus = document.createElement('button');
    plus.type = minus.type = 'button'; plus.textContent = '+'; minus.textContent = '−';
    plus.setAttribute('aria-label', '지도 확대'); minus.setAttribute('aria-label', '지도 축소');
    controls.append(plus, minus);
    const credit = document.createElement('a'); credit.className = 'oj-map-credit';
    credit.href = 'https://www.openstreetmap.org/copyright'; credit.target = '_blank'; credit.rel = 'noopener';
    credit.textContent = '© OpenStreetMap contributors';
    stage.append(tiles, overlay, controls, credit); host.replaceChildren(stage);
    let current = { lat: center.lat, lng: center.lng }, z = zoom, selected = null, selectionRadius = 0, circles = [];
    let pointer = null, dragged = false;
    const metresPerPixel = (lat, level) => 156543.03392 * Math.cos(lat * RAD) / 2 ** level;
    function fitSelection() {
      if (!selected || !selectionRadius || !host.clientWidth || !host.clientHeight) return;
      const limit = Math.min(host.clientWidth, host.clientHeight) * .34;
      while (z > 4 && selectionRadius / metresPerPixel(selected.lat, z) > limit) z--;
      while (z < 17 && selectionRadius / metresPerPixel(selected.lat, z + 1) <= limit) z++;
    }
    function draw() {
      const width = host.clientWidth, height = host.clientHeight;
      if (!width || !height) return;
      const c = project(current.lat, current.lng, z), n = 2 ** z;
      const startX = Math.floor((c.x - width / 2) / TILE), endX = Math.floor((c.x + width / 2) / TILE);
      const startY = Math.max(0, Math.floor((c.y - height / 2) / TILE));
      const endY = Math.min(n - 1, Math.floor((c.y + height / 2) / TILE));
      const existing = new Map([...tiles.children].map(img => [img.dataset.key, img]));
      const live = new Set();
      for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {
        const tx = ((x % n) + n) % n, key = `${z}/${tx}/${y}`; live.add(key);
        let img = existing.get(key);
        if (!img) {
          img = document.createElement('img'); img.alt = ''; img.decoding = 'async'; img.dataset.key = key;
          img.src = `https://tile.openstreetmap.org/${key}.png`;
          tiles.append(img);
        }
        img.style.left = `${Math.round(x * TILE - c.x + width / 2)}px`;
        img.style.top = `${Math.round(y * TILE - c.y + height / 2)}px`;
      }
      for (const [key, img] of existing) if (!live.has(key)) img.remove();
      overlay.replaceChildren();
      for (const entry of circles) {
        if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lng) || !Number.isFinite(entry.radius_m)) continue;
        const p = project(entry.lat, entry.lng, z);
        const x = p.x - c.x + width / 2, y = p.y - c.y + height / 2;
        const radius = Math.min(5000, entry.radius_m / metresPerPixel(entry.lat, z));
        const circle = document.createElement(onEvent ? 'button' : 'span');
        if (onEvent) circle.type = 'button';
        else circle.setAttribute('aria-hidden', 'true');
        circle.className = 'oj-map-circle';
        circle.style.cssText = `left:${x}px;top:${y}px;width:${radius * 2}px;height:${radius * 2}px`;
        if (onEvent) {
          circle.setAttribute('aria-label', entry.in_range ? '이벤트 범위와 내용 보기' : '이벤트 범위 보기');
          circle.addEventListener('click', event => { event.stopPropagation(); onEvent(entry); });
        }
        else circle.style.pointerEvents = 'none';
        overlay.append(circle);
      }
      if (selected) {
        const p = project(selected.lat, selected.lng, z);
        const x = p.x - c.x + width / 2, y = p.y - c.y + height / 2;
        if (selectionRadius) {
          const radius = Math.min(5000, selectionRadius / metresPerPixel(selected.lat, z));
          const range = document.createElement('span'); range.className = 'oj-map-selected-range';
          range.style.cssText = `left:${x}px;top:${y}px;width:${radius * 2}px;height:${radius * 2}px`;
          range.setAttribute('aria-hidden', 'true'); overlay.append(range);
          const label = document.createElement('span'); label.className = 'oj-map-range-label';
          label.textContent = `선택 범위 · ${selectionRadius / 1000}km`;
          overlay.append(label);
        }
        const marker = document.createElement('span');
        marker.className = 'oj-map-selection';
        marker.style.left = `${x}px`;
        marker.style.top = `${y}px`;
        marker.setAttribute('aria-hidden', 'true'); overlay.append(marker);
      }
    }
    function zoomTo(delta) { z = clamp(z + delta, 4, 17); draw(); onMove?.({ ...current }); }
    plus.addEventListener('click', () => zoomTo(1)); minus.addEventListener('click', () => zoomTo(-1));
    stage.addEventListener('wheel', event => { event.preventDefault(); zoomTo(event.deltaY < 0 ? 1 : -1); }, { passive: false });
    stage.addEventListener('keydown', event => {
      if (event.target !== stage || !onSelect) return;
      const directions = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      const direction = directions[event.key];
      if (!direction) return;
      event.preventDefault();
      const center = project(current.lat, current.lng, z), step = event.shiftKey ? 16 : 64;
      const point = unproject(center.x + direction[0] * step, center.y + direction[1] * step, z);
      current = { lat: clamp(point.lat, -85, 85), lng: clamp(point.lng, -180, 180) };
      draw(); onMove?.({ ...current });
    });
    stage.addEventListener('pointerdown', event => {
      if (event.target.closest('button,a')) return;
      pointer = { x: event.clientX, y: event.clientY, start: project(current.lat, current.lng, z) };
      dragged = false; stage.setPointerCapture(event.pointerId);
    });
    stage.addEventListener('pointermove', event => {
      if (!pointer) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) dragged = true;
      const point = unproject(pointer.start.x - dx, pointer.start.y - dy, z);
      current = { lat: clamp(point.lat, -85, 85), lng: clamp(point.lng, -180, 180) }; draw();
    });
    stage.addEventListener('pointerup', event => {
      if (!pointer) return;
      const wasDragged = dragged; pointer = null;
      if (wasDragged) { onMove?.({ ...current }); return; }
      if (!onSelect) return;
      const bounds = host.getBoundingClientRect(), c = project(current.lat, current.lng, z);
      selected = unproject(c.x + event.clientX - bounds.left - bounds.width / 2,
        c.y + event.clientY - bounds.top - bounds.height / 2, z);
      draw(); onSelect(selected);
    });
    stage.addEventListener('pointercancel', () => { pointer = null; });
    const resize = new ResizeObserver(() => { fitSelection(); draw(); }); resize.observe(host); draw();
    return { setCenter(value) { current = { lat: value.lat, lng: value.lng }; draw(); },
      getCenter() { return { ...current }; },
      setSelection(value) { selected = value; if (value) { current = { lat: value.lat, lng: value.lng }; fitSelection(); } draw(); },
      setSelectionRadius(metres) { selectionRadius = Number.isFinite(metres) && metres > 0 ? metres : 0; fitSelection(); draw(); },
      setCircles(value) { circles = Array.isArray(value) ? value : []; draw(); },
      invalidate: draw, destroy() { resize.disconnect(); host.replaceChildren(); } };
  }
  window.OjjudaMap = Object.freeze({ create });
})();
