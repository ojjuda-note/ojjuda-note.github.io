/* Presentation only: the room remains the authority for turns, timers and results. */
(() => {
  'use strict';
  if (window.DrinkingPresentation) return;

  const kinds = new Set(['croc', 'bottle', 'bomb', 'stopwatch', 'liar', 'king', 'truth', 'initial', 'minority', 'mission', 'fingers', 'imagevote', 'updown']);
  const seenResults = new Set();
  const focusable = 'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  let active = null;
  let host = null;
  let overlay = null;
  let helpButton = null;
  let observer = null;
  let dialog = null;
  let previousFocus = null;
  let inertNodes = [];
  let figureId = 0;
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
  }

  function mount() {
    const content = document.getElementById('access-content');
    if (!content) return false;
    if (host !== content) {
      close(false);
      observer?.disconnect();
      overlay?.remove();
      helpButton?.remove();
      host = content;
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
    const data = window.DrinkingGameGuides?.[active?.kind];
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
    const id = `dp-glass-${++figureId}`;
    // Static artwork only. Player names and result copy are never parsed as HTML.
    art.innerHTML = `<span class="dp-halo"></span><span class="dp-burst-ring"></span>
      <svg class="dp-glass-art" viewBox="0 0 260 280" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${id}-liquid" x1="90" y1="90" x2="170" y2="230" gradientUnits="userSpaceOnUse"><stop stop-color="#ffe6a2"/><stop offset=".42" stop-color="#e7ad3e"/><stop offset="1" stop-color="#bf7529"/></linearGradient>
          <linearGradient id="${id}-glass" x1="66" y1="64" x2="195" y2="221" gradientUnits="userSpaceOnUse"><stop stop-color="#fffdf0" stop-opacity=".82"/><stop offset=".42" stop-color="#fffdf0" stop-opacity=".04"/><stop offset="1" stop-color="#fffdf0" stop-opacity=".34"/></linearGradient>
          <clipPath id="${id}-clip"><path d="M70 59H190L174 218Q130 237 86 218Z"/></clipPath>
        </defs>
        <ellipse class="dp-glass-shadow" cx="130" cy="252" rx="66" ry="10" fill="#0e2c25" opacity=".22"/>
        <g class="dp-glass-vessel">
          <path d="M65 55H195L177 223Q130 244 83 223Z" fill="url(#${id}-glass)" stroke="#fff4cc" stroke-width="3"/>
          <g clip-path="url(#${id}-clip)">
            <g class="dp-liquid" data-drinking-liquid="">
              <path d="M61 104Q94 91 130 102T200 103V243H61Z" fill="url(#${id}-liquid)"/>
              <path class="dp-liquid-wave" d="M61 104Q94 91 130 102T200 103" stroke="#fff0b3" stroke-width="5" stroke-linecap="round"/>
              <circle cx="105" cy="184" r="4" fill="#fff1bc" opacity=".6"/><circle cx="154" cy="159" r="3" fill="#fff1bc" opacity=".65"/><circle cx="127" cy="133" r="2" fill="#fff1bc" opacity=".75"/>
            </g>
          </g>
          <path d="M78 72L93 212M181 73L167 212" stroke="white" stroke-opacity=".48" stroke-width="4" stroke-linecap="round"/>
          <path d="M85 222Q130 241 175 222" stroke="#fff6d6" stroke-width="7" stroke-linecap="round"/>
          <ellipse cx="130" cy="55" rx="65" ry="10" fill="#f5ecc4" fill-opacity=".13" stroke="#fff4cc" stroke-width="3"/>
          <path d="M78 52Q130 39 182 52" stroke="white" stroke-opacity=".85" stroke-width="2" stroke-linecap="round"/>
          <path class="dp-glass-gleam" d="M107 62L88 219" stroke="white" stroke-opacity=".6" stroke-width="8"/>
        </g>
      </svg>`;
    for (let index = 0; index < 18; index++) {
      const spark = node('i', 'dp-spark');
      const angle = index * Math.PI * 2 / 18;
      spark.style.setProperty('--dp-x', `${Math.round(Math.cos(angle) * (94 + index % 3 * 13))}px`);
      spark.style.setProperty('--dp-y', `${Math.round(Math.sin(angle) * (89 + index % 4 * 12))}px`);
      spark.style.setProperty('--dp-delay', `${260 + index % 5 * 70}ms`);
      spark.style.setProperty('--dp-turn', `${index * 31}deg`);
      art.append(spark);
    }
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
  window.DrinkingPresentation = Object.freeze({ enter, update, help, leave });
})();
