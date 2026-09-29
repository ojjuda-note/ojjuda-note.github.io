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
  function create(host, { center = { lat: 37.5665, lng: 126.978 }, zoom = 12, onSelect, onEvent, onMove, onMarker } = {}) {
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
    let current = { lat: center.lat, lng: center.lng }, z = zoom, selected = null, selectionRadius = 0, circles = [], markers = [];
    const pointers = new Map();
    let gesture = null, dragged = false, tapTarget = null, frame = 0;
    const metresPerPixel = (lat, level) => 156543.03392 * Math.cos(lat * RAD) / 2 ** level;
    function fitSelection() {
      if (!selected || !selectionRadius || !host.clientWidth || !host.clientHeight) return;
      const limit = Math.min(host.clientWidth, host.clientHeight) * .34;
      while (z > 4 && selectionRadius / metresPerPixel(selected.lat, z) > limit) z = Math.max(4, z - 1);
      while (z + 1 <= 17 && selectionRadius / metresPerPixel(selected.lat, z + 1) <= limit) z++;
    }
    function draw() {
      const width = host.clientWidth, height = host.clientHeight;
      if (!width || !height) return;
      const level = Math.floor(z), size = TILE * 2 ** (z - level);
      const c = project(current.lat, current.lng, z), n = 2 ** level;
      const startX = Math.floor((c.x - width / 2) / size), endX = Math.floor((c.x + width / 2) / size);
      const startY = Math.max(0, Math.floor((c.y - height / 2) / size));
      const endY = Math.min(n - 1, Math.floor((c.y + height / 2) / size));
      const existing = new Map([...tiles.children].map(img => [img.dataset.key, img]));
      const live = new Set();
      for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {
        const tx = ((x % n) + n) % n, key = `${level}/${tx}/${y}`; live.add(key);
        let img = existing.get(key);
        if (!img) {
          img = document.createElement('img'); img.alt = ''; img.decoding = 'async'; img.dataset.key = key;
          img.src = `https://tile.openstreetmap.org/${key}.png`;
          tiles.append(img);
        }
        const left = Math.round(x * size - c.x + width / 2), top = Math.round(y * size - c.y + height / 2);
        img.style.left = `${left}px`; img.style.top = `${top}px`;
        img.style.width = `${Math.round((x + 1) * size - c.x + width / 2) - left}px`;
        img.style.height = `${Math.round((y + 1) * size - c.y + height / 2) - top}px`;
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
      const spots = [];   // 관리자 위치 지도의 점: 화면에서 가까운 점은 하나로 합쳐 장 수를 적어요
      for (const entry of markers) {
        if (!Number.isFinite(entry.lat) || !Number.isFinite(entry.lng)) continue;
        const p = project(entry.lat, entry.lng, z);
        const x = p.x - c.x + width / 2, y = p.y - c.y + height / 2;
        if (x < -24 || y < -24 || x > width + 24 || y > height + 24) continue;
        const near = spots.find(spot => Math.abs(spot.x - x) < 20 && Math.abs(spot.y - y) < 20);
        if (near) { near.members.push(entry); near.count += entry.count || 1; near.active = near.active || !!entry.active; }
        else spots.push({ x, y, members: [entry], count: entry.count || 1, active: !!entry.active });
      }
      for (const spot of spots) {
        const dot = document.createElement(onMarker ? 'button' : 'span');
        dot.className = `oj-map-marker${spot.active ? ' on' : ''}`;
        dot.style.cssText = `left:${spot.x}px;top:${spot.y}px`;
        if (spot.count > 1) dot.textContent = String(spot.count);
        if (onMarker) {
          dot.type = 'button'; dot.setAttribute('aria-label', spot.members.length > 1 ? `카드 ${spot.count}장 모인 곳 확대하기` : (spot.members[0].label || '카드 위치'));
          dot.addEventListener('click', event => {
            event.stopPropagation();
            if (spot.members.length > 1 && z < 15) {   // 여러 자리가 겹쳐 있으면 먼저 확대해요
              const lats = spot.members.map(m => m.lat), lngs = spot.members.map(m => m.lng);
              current = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
              z = clamp(z + 2, 4, 17); draw(); onMove?.({ ...current }); return;
            }
            onMarker(spot.members.length === 1 ? spot.members[0] : { lat: spot.members[0].lat, lng: spot.members[0].lng, count: spot.count, members: spot.members });
          });
        } else dot.setAttribute('aria-hidden', 'true');
        overlay.append(dot);
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
    const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const distance = (a, b) => Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    function restartGesture() {
      const [a, b] = pointers.values();
      if (!a) { gesture = null; return; }
      const c = project(current.lat, current.lng, z);
      if (!b) { gesture = { start: a, center: c }; return; }
      const mid = midpoint(a, b), bounds = host.getBoundingClientRect();
      gesture = { zoom: z, distance: distance(a, b),
        anchor: unproject(c.x + mid.x - bounds.left - bounds.width / 2,
          c.y + mid.y - bounds.top - bounds.height / 2, z) };
    }
    function queueDraw() {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); });
    }
    stage.addEventListener('pointerdown', event => {
      if (event.target.closest('.oj-map-controls,a') || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (!pointers.size) {
        dragged = false;
        tapTarget = event.target.closest('.oj-map-marker,.oj-map-circle');
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      stage.setPointerCapture(event.pointerId);
      if (pointers.size > 1) { dragged = true; tapTarget = null; }
      restartGesture();
    });
    stage.addEventListener('pointermove', event => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const [a, b] = pointers.values();
      let point;
      if (b) {
        const mid = midpoint(a, b), bounds = host.getBoundingClientRect();
        z = clamp(gesture.zoom + Math.log2(distance(a, b) / gesture.distance), 4, 17);
        const anchor = project(gesture.anchor.lat, gesture.anchor.lng, z);
        point = unproject(anchor.x - (mid.x - bounds.left - bounds.width / 2),
          anchor.y - (mid.y - bounds.top - bounds.height / 2), z);
        dragged = true;
      } else {
        const dx = a.x - gesture.start.x, dy = a.y - gesture.start.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) dragged = true;
        if (!dragged) return;
        point = unproject(gesture.center.x - dx, gesture.center.y - dy, z);
      }
      current = { lat: clamp(point.lat, -85, 85), lng: clamp(point.lng, -180, 180) };
      queueDraw();
    });
    function endPointer(event) {
      if (!pointers.delete(event.pointerId)) return;
      if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
      restartGesture();
      if (pointers.size) return;
      if (dragged) { onMove?.({ ...current }); return; }
      if (event.type !== 'pointerup') return;
      // Capture keeps gestures alive when tiles/markers redraw. Forward a simple tap to its original marker.
      if (tapTarget) { if (tapTarget.isConnected) tapTarget.click(); return; }
      if (!onSelect) return;
      const bounds = host.getBoundingClientRect(), c = project(current.lat, current.lng, z);
      selected = unproject(c.x + event.clientX - bounds.left - bounds.width / 2,
        c.y + event.clientY - bounds.top - bounds.height / 2, z);
      draw(); onSelect(selected);
    }
    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);
    stage.addEventListener('lostpointercapture', endPointer);
    stage.addEventListener('click', event => {
      if ((dragged || tapTarget) && event.detail && event.target.closest('.oj-map-marker,.oj-map-circle')) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    const resize = new ResizeObserver(() => { fitSelection(); draw(); }); resize.observe(host); draw();
    return { setCenter(value) { current = { lat: value.lat, lng: value.lng }; draw(); },
      getCenter() { return { ...current }; },
      getZoom() { return z; },
      setSelection(value) { selected = value; if (value) { current = { lat: value.lat, lng: value.lng }; fitSelection(); } draw(); },
      setSelectionRadius(metres) { selectionRadius = Number.isFinite(metres) && metres > 0 ? metres : 0; fitSelection(); draw(); },
      setCircles(value) { circles = Array.isArray(value) ? value : []; draw(); },
      setMarkers(value, fit = false) {   // 점 찍기. fit이면 모든 점이 보이게 중심과 확대를 맞춰요
        markers = Array.isArray(value) ? value : [];
        const points = markers.filter(m => Number.isFinite(m.lat) && Number.isFinite(m.lng));
        if (fit && points.length && host.clientWidth && host.clientHeight) {
          const lats = points.map(m => m.lat), lngs = points.map(m => m.lng);
          current = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
          z = 16;
          while (z > 4) {
            const a = project(Math.max(...lats), Math.min(...lngs), z), b = project(Math.min(...lats), Math.max(...lngs), z);
            if (Math.abs(b.x - a.x) <= host.clientWidth * .8 && Math.abs(b.y - a.y) <= host.clientHeight * .8) break;
            z--;
          }
        }
        draw();
      },
      focusOn(value, level) { if (value && Number.isFinite(value.lat) && Number.isFinite(value.lng)) { current = { lat: value.lat, lng: value.lng }; if (Number.isFinite(level)) z = clamp(level, 4, 17); draw(); } },
      invalidate: draw, destroy() { cancelAnimationFrame(frame); pointers.clear(); gesture = null; resize.disconnect(); host.replaceChildren(); } };
  }
  window.OjjudaMap = Object.freeze({ create });
})();
