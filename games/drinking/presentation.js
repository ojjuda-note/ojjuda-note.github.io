/* Presentation only: the room remains the authority for turns, timers and results. */
(() => {
  'use strict';
  if (window.DrinkingPresentation) return;

  const kinds = new Set(['croc', 'bottle', 'bomb', 'stopwatch', 'liar', 'king', 'truth', 'initial', 'minority', 'mission', 'fingers', 'imagevote', 'updown','secretcount','partyroulette','shapematch']);
  const seenResults = new Set();
  const focusable = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const glassAsset = '/games/drinking/assets/result-glass-v2.webp?v=20261114-result-glass2';
  let active = null;
  let host = null;
  let overlay = null;
  let helpButton = null;
  let observer = null;
  let dialog = null;
  let previousFocus = null;
  let inertNodes = [];
  let figureId = 0;
  let glassPreload = null;
  let fitRoot = null;
  let fitObserver = null;
  let fitFrame = 0;
  let fitBox = null;
  let accessAllowed = window.OjjudaDrinkingAccessReady === true;
  let pageSuspended = false;

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function accessible() {
    return !!active && !!host?.isConnected && !host.hidden &&
      accessAllowed && window.OjjudaDrinkingAccessReady === true && !document.hidden && !pageSuspended;
  }

  function playArea() {
    if (!host || !active) return null;
    return active.local ? host.querySelector('.play-body') :
      host.querySelector('#view #game, #view > .card > .inside') || host.querySelector('#view > .card');
  }

  function clearFit() {
    if (fitFrame) cancelAnimationFrame(fitFrame);
    fitFrame = 0;
    fitObserver?.disconnect();
    fitObserver = null;
    if (fitRoot) {
      for (const property of ['--dp-fit-scale', '--dp-play-width', '--dp-play-height']) fitRoot.style.removeProperty(property);
      delete fitRoot.dataset.dpFitted;
    }
    fitRoot = null;
    fitBox = null;
  }

  function fitsPlayArea(root) {
    const area = root.getBoundingClientRect();
    const css = getComputedStyle(root);
    const top = area.top + parseFloat(css.paddingTop || 0);
    const bottom = area.bottom - parseFloat(css.paddingBottom || 0);
    const left = area.left + parseFloat(css.paddingLeft || 0);
    const right = area.right - parseFloat(css.paddingRight || 0);
    if (root.scrollWidth > root.clientWidth + 1 || root.scrollHeight > root.clientHeight + 1) return false;
    const elements = new Set([...root.children, ...root.querySelectorAll('button,input,select,textarea,summary')]);
    for (const element of elements) {
      if (element.closest('[hidden]')) continue;
      let concealed = false;
      for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(element)) {
          concealed = true;
          break;
        }
      }
      if (concealed) continue;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (rect.top < top - 0.5 || rect.bottom > bottom + 0.5 || rect.left < left - 0.5 || rect.right > right + 0.5) return false;
    }
    return true;
  }

  function fitPlayArea() {
    fitFrame = 0;
    if (!accessible()) return;
    const root = playArea();
    if (!root) return;
    if (root !== fitRoot) {
      clearFit();
      fitRoot = root;
      if (typeof ResizeObserver === 'function') {
        fitObserver = new ResizeObserver(entries => {
          const entry = entries.find(item => item.target === fitRoot);
          if (!entry) return;
          const box = Array.isArray(entry.borderBoxSize) ? entry.borderBoxSize[0] : entry.borderBoxSize;
          const width = box?.inlineSize ?? entry.contentRect.width;
          const height = box?.blockSize ?? entry.contentRect.height;
          if (!fitBox || Math.abs(width - fitBox.width) > 1 || Math.abs(height - fitBox.height) > 1) requestFit();
        });
        fitObserver.observe(root, {box: 'border-box'});
      }
    }
    const area = root.getBoundingClientRect();
    if (area.width < 1 || area.height < 1) return;
    fitBox = {width: area.width, height: area.height};
    root.style.setProperty('--dp-play-width', `${Math.floor(area.width)}px`);
    root.style.setProperty('--dp-play-height', `${Math.floor(area.height)}px`);
    const applyScale = scale => root.style.setProperty('--dp-fit-scale', String(scale));
    // Enlarge the actual text, controls and board, never a transformed picture
    // of the page. Dense/short screens keep the readable base size and scroll
    // fallback instead of shrinking controls or hiding the remaining content.
    applyScale(1);
    let lower = 1;
    if (fitsPlayArea(root)) {
      let upper = 1.75;
      applyScale(upper);
      if (fitsPlayArea(root)) lower = upper;
      else for (let step = 0; step < 5; step++) {
        const candidate = (lower + upper) / 2;
        applyScale(candidate);
        if (fitsPlayArea(root)) lower = candidate;
        else upper = candidate;
      }
    }
    applyScale(Math.floor(lower * 100) / 100);
    root.dataset.dpFitted = 'true';
  }

  function requestFit() {
    if (!accessible()) return;
    const root = playArea();
    if (root) root.dataset.dpFitted = 'false';
    if (!fitFrame) fitFrame = requestAnimationFrame(fitPlayArea);
  }

  function layout() {
    const enabled = accessible();
    document.body.classList.toggle('dp-playing', enabled);
    for (const target of [document.body, host]) {
      if (!target) continue;
      if (enabled) {
        target.dataset.dpKind = active.kind;
        target.dataset.dpPhase = active.phase;
        target.dataset.dpMode = active.local ? 'local' : 'online';
      } else {
        delete target.dataset.dpKind;
        delete target.dataset.dpPhase;
        delete target.dataset.dpMode;
      }
    }
    if (helpButton) helpButton.hidden = !enabled;
    if (enabled) requestFit();
  }

  function mount() {
    const content = document.getElementById('access-content');
    if (!content) return false;
    if (host !== content) {
      close(false);
      clearFit();
      host?.removeEventListener('load', requestFit, true);
      host?.removeEventListener('toggle', requestFit, true);
      observer?.disconnect();
      overlay?.remove();
      helpButton?.remove();
      host = content;
      host.addEventListener('load', requestFit, true);
      host.addEventListener('toggle', requestFit, true);
      observer = new MutationObserver(() => {
        if (!accessible()) close(false);
        flush();
      });
      observer.observe(host, { attributes: true, attributeFilter: ['hidden'] });
    }
    if (!overlay?.isConnected) {
      overlay = node('div', 'dp-overlay');
      overlay.dataset.drinkingOverlay = '';
      overlay.hidden = true;
      overlay.addEventListener('click', event => {
        // A click on the presentation must not reach the game's screen-wide
        // "tap to stop" handler underneath it.
        event.stopPropagation();
        if (event.target === overlay) close();
      });
      host.append(overlay);
    }
    if (!helpButton?.isConnected) {
      helpButton = node('button', 'dp-help', '?');
      helpButton.type = 'button';
      helpButton.dataset.drinkingHelp = '';
      helpButton.setAttribute('aria-label', '게임 방법 보기');
      helpButton.title = '게임 방법';
      helpButton.hidden = true;
      helpButton.addEventListener('click', help);
      host.append(helpButton);
    }
    return true;
  }

  function availableFocus() {
    if (!dialog) return [];
    return [...dialog.element.querySelectorAll(focusable)].filter(element => !element.closest('[hidden],[inert]'));
  }

  function focusDialog() {
    if (!dialog || !accessible()) return;
    const target = dialog.element.querySelector('[data-drinking-primary]') || availableFocus()[0] || dialog.element;
    target.focus({ preventScroll: true });
  }

  function onKey(event) {
    if (!dialog || !accessible()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = availableFocus();
    const first = controls[0] || dialog.element;
    const last = controls[controls.length - 1] || first;
    if (!dialog.element.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onFocus(event) {
    if (dialog && accessible() && !dialog.element.contains(event.target)) focusDialog();
  }

  function close(restore = true) {
    if (!dialog && !inertNodes.length) return;
    const dismissed = dialog;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('focusin', onFocus, true);
    for (const [element, value] of inertNodes) {
      if (value === null) element.removeAttribute('inert');
      else element.setAttribute('inert', value);
    }
    inertNodes = [];
    dialog = null;
    document.body.classList.remove('dp-dialog-open');
    if (overlay) {
      overlay.hidden = true;
      overlay.replaceChildren();
    }
    const target = previousFocus;
    previousFocus = null;
    if (restore && accessible()) {
      if (target?.isConnected && target !== document.body && !target.closest('[hidden],[inert]')) target.focus({ preventScroll: true });
      else helpButton?.focus({ preventScroll: true });
    }
    if (restore && dismissed?.type === 'result') {
      document.dispatchEvent(new CustomEvent('ojjuda:drinking-result-dismissed', {
        detail: { kind: dismissed.kind, local: dismissed.local, roundKey: dismissed.roundKey }
      }));
    }
  }

  function open(type, title, manual = false) {
    if (!accessible()) return null;
    const prior = dialog ? previousFocus : document.activeElement;
    close(false);
    previousFocus = prior;
    const panel = node('section', `dp-dialog dp-dialog--${type}`);
    panel.dataset.drinkingDialog = type;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'dp-dialog-title');
    panel.tabIndex = -1;
    const header = node('header', 'dp-dialog-header');
    const heading = node('h2', 'dp-dialog-title', title);
    heading.id = 'dp-dialog-title';
    const dismiss = node('button', 'dp-dismiss', '×');
    dismiss.type = 'button';
    dismiss.dataset.drinkingClose = '';
    dismiss.setAttribute('aria-label', type === 'guide' ? '게임 방법 닫기' : '결과 닫기');
    dismiss.addEventListener('click', () => close());
    if (type === 'result') {
      const gameTitle = window.DrinkingGameGuides?.[active.kind]?.title;
      header.append(node('p', 'dp-result-eyebrow', gameTitle ? `${gameTitle} · 라운드 결과` : '라운드 결과'));
    }
    header.append(heading, dismiss);
    panel.append(header);
    overlay.replaceChildren(panel);
    overlay.hidden = false;
    dialog = { element: panel, type, manual, kind: active.kind, local: active.local, roundKey: active.roundKey };
    for (const child of host.children) {
      if (child === overlay || /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(child.tagName)) continue;
      inertNodes.push([child, child.getAttribute('inert')]);
      child.setAttribute('inert', '');
    }
    document.body.classList.add('dp-dialog-open');
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', onFocus, true);
    return panel;
  }

  function footer(panel, label) {
    const actions = node('footer', 'dp-dialog-footer');
    const button = node('button', 'dp-primary', label);
    button.type = 'button';
    button.dataset.drinkingClose = '';
    button.dataset.drinkingPrimary = '';
    button.addEventListener('click', () => close());
    actions.append(button);
    panel.append(actions);
    focusDialog();
  }

  function guide(manual = false) {
    const guide = window.DrinkingGameGuides?.[active?.kind];
    const data = active?.local ? guide : guide?.multi || guide;
    if (!data || !accessible()) return false;
    const panel = open('guide', `${data.title} 하는 법`, manual);
    if (!panel) return false;
    active.guidePending = false;
    const body = node('div', 'dp-dialog-body dp-guide-body');
    const goal = node('p', 'dp-guide-goal', data.goal);
    goal.id = 'dp-guide-goal';
    panel.setAttribute('aria-describedby', goal.id);
    const steps = node('ol', 'dp-guide-steps');
    for (const text of data.steps || []) steps.append(node('li', '', text));
    body.append(goal, steps);
    if (data.resultNote) body.append(node('p', 'dp-guide-note', data.resultNote));
    panel.append(body);
    footer(panel, '알겠어요');
    return true;
  }

  function glass() {
    const art = node('figure', 'dp-celebration');
    art.setAttribute('aria-hidden', 'true');
    art.dataset.drinkingGlass = '';
    art.dataset.glassReady = 'false';
    const id = `dp-glass-${++figureId}`;
    // Static artwork only. Player names and result copy are never parsed as HTML.
    // Both the photo and liquid use the photo's original coordinates, so the
    // moving surface stays inside the fixed bowl at every responsive size.
    art.innerHTML = `<span class="dp-stage-glow"></span><span class="dp-floor-shadow"></span>
      <svg class="dp-glass-art" viewBox="160 130 950 1000" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
        <defs>
          <linearGradient id="${id}-liquid" x1="265" y1="600" x2="985" y2="600" gradientUnits="userSpaceOnUse">
            <stop stop-color="#54290e" stop-opacity=".72"/><stop offset=".17" stop-color="#b36b26" stop-opacity=".65"/><stop offset=".46" stop-color="#d5a253" stop-opacity=".58"/><stop offset=".78" stop-color="#a66c27" stop-opacity=".67"/><stop offset="1" stop-color="#4e280f" stop-opacity=".72"/>
          </linearGradient>
          <linearGradient id="${id}-depth" x1="620" y1="440" x2="620" y2="900" gradientUnits="userSpaceOnUse"><stop stop-color="#3c210e" stop-opacity="0"/><stop offset="1" stop-color="#321b0b" stop-opacity=".32"/></linearGradient>
          <linearGradient id="${id}-surface" x1="280" y1="424" x2="970" y2="466" gradientUnits="userSpaceOnUse"><stop stop-color="#e9c280" stop-opacity=".22"/><stop offset=".48" stop-color="#edcf95" stop-opacity=".4"/><stop offset="1" stop-color="#a96f2d" stop-opacity=".27"/></linearGradient>
          <clipPath id="${id}-clip"><path d="M282 273H963L984 814Q627 905 265 814Z"/></clipPath>
        </defs>
        <g class="dp-glass-vessel">
          <g clip-path="url(#${id}-clip)">
            <g class="dp-liquid" data-drinking-liquid="">
              <path d="M250 443H1005V970H250Z" fill="url(#${id}-liquid)"/>
              <path d="M250 443H1005V970H250Z" fill="url(#${id}-depth)"/>
              <g class="dp-liquid-wave">
                <ellipse cx="627" cy="443" rx="349" ry="37" fill="url(#${id}-surface)"/>
                <path d="M282 441C337 487 913 488 973 442" stroke="#f3d59a" stroke-opacity=".35" stroke-width="2"/>
                <path d="M304 433C419 405 820 405 949 434" stroke="#ffe5b4" stroke-opacity=".2" stroke-width="1.5"/>
              </g>
            </g>
          </g>
          <image class="dp-glass-reflections" data-drinking-glass-image="" x="0" y="0" width="1254" height="1254"/>
          <path class="dp-glass-sheen" d="M302 323C288 474 292 665 303 789" stroke="#fff1d8" stroke-opacity=".4" stroke-width="5" stroke-linecap="round"/>
        </g>
      </svg>`;
    const photo = art.querySelector('[data-drinking-glass-image]');
    // A slow or failed artwork request must never delay the result or controls.
    // Start the reveal only after the real glass has loaded, keeping the bare
    // liquid layer hidden while the image is in flight.
    photo.addEventListener('load', () => { art.dataset.glassReady = 'true'; }, { once: true });
    photo.addEventListener('error', () => { art.dataset.glassReady = 'error'; }, { once: true });
    photo.setAttribute('href', glassAsset);
    return art;
  }

  function showResult(result) {
    const panel = open('result', result.title || '라운드 결과');
    if (!panel) return;
    seenResults.add(result.identity);
    active.pendingResult = null;
    active.guidePending = false;
    dialog.resultKey = result.identity;
    const body = node('div', 'dp-dialog-body dp-result-body');
    body.append(glass());
    const copy = node('div', 'dp-result-copy');
    if (result.body) {
      const paragraph = node('p', 'dp-result-description', result.body);
      paragraph.id = 'dp-result-description';
      panel.setAttribute('aria-describedby', paragraph.id);
      copy.append(paragraph);
    }
    if (result.names?.length) {
      const names = node('ul', 'dp-result-names');
      names.setAttribute('aria-label', '결과에 해당하는 사람');
      for (const name of result.names) names.append(node('li', '', name));
      copy.append(names);
    }
    body.append(copy);
    panel.append(body);
    footer(panel, '결과 확인');
  }

  function flush() {
    layout();
    if (!accessible()) return;
    if (!glassPreload) {
      glassPreload = new Image();
      glassPreload.decoding = 'async';
      glassPreload.src = glassAsset;
    }
    if (active.pendingResult && !active.urgent) {
      const result = active.pendingResult;
      if (!seenResults.has(result.identity)) showResult(result);
      else active.pendingResult = null;
      return;
    }
    if (active.guidePending && !active.urgent && !dialog) guide();
  }

  function enter(kind, options = {}) {
    if (!kinds.has(kind)) return;
    const local = options.local === true;
    if (!active || active.kind !== kind || active.local !== local) {
      leave();
      active = { kind, local, phase: 'entry', roundKey: null, urgent: false, guidePending: true, pendingResult: null };
    }
    if (mount()) flush();
  }

  function update(value = {}) {
    if (!active) return;
    if (!mount()) return;
    const nextPhase = value.phase == null ? active.phase : String(value.phase);
    const nextRound = value.roundKey == null ? active.roundKey : String(value.roundKey);
    const changed = nextPhase !== active.phase || nextRound !== active.roundKey;
    active.phase = nextPhase;
    active.roundKey = nextRound;
    active.urgent = value.urgent === true;
    if (changed) {
      active.pendingResult = null;
      if (dialog?.type === 'result') close(false);
    }
    if (active.urgent) {
      active.guidePending = false;
      active.pendingResult = null;
      if (dialog?.type === 'result' || (dialog?.type === 'guide' && !dialog.manual)) close(false);
    }
    const result = value.result;
    if (result && result.key !== undefined && result.key !== null && !active.urgent) {
      const identity = `${active.local ? 'local' : 'online'}:${active.kind}:${String(result.key)}`;
      if (!seenResults.has(identity)) {
        active.pendingResult = {
          identity,
          title: String(result.title || '라운드 결과'),
          body: String(result.body || ''),
          names: Array.isArray(result.names) ? result.names.map(name => String(name)) : []
        };
      }
    }
    flush();
  }

  function help() {
    if (!active || !mount() || !accessible()) return;
    guide(true);
  }

  function leave() {
    close(false);
    clearFit();
    host?.removeEventListener('load', requestFit, true);
    host?.removeEventListener('toggle', requestFit, true);
    active = null;
    layout();
    observer?.disconnect();
    observer = null;
    overlay?.remove();
    helpButton?.remove();
    overlay = null;
    helpButton = null;
    host = null;
  }

  function suspend() {
    close(false);
    if (active) active.pendingResult = null;
    layout();
  }

  document.addEventListener('ojjuda:drinking-access', event => {
    accessAllowed = event.detail?.allowed === true;
    if (!accessAllowed) suspend();
    else if (active && mount()) flush();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend();
    else if (active && mount()) flush();
  });
  window.addEventListener('pagehide', () => { pageSuspended = true; suspend(); });
  window.addEventListener('pageshow', () => {
    pageSuspended = false;
    if (active && mount()) flush();
  });
  window.addEventListener('resize', requestFit, {passive: true});
  window.visualViewport?.addEventListener('resize', requestFit, {passive: true});
  document.fonts?.ready.then(requestFit);
  window.DrinkingPresentation = Object.freeze({ enter, update, help, leave });
})();
