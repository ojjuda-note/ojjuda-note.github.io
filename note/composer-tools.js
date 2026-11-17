/* Keep the existing editor fields and their listeners; only their presentation moves. */
(() => {
  'use strict';
  const icons = {
    photo: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    font: '<path d="m3 19 6-14 6 14M5 14h8m4-3h4m-2 0v8m-2 0h4"/>',
    color: '<path d="m12 3 7 9a7 7 0 1 1-14 0Z"/><path d="M8 15a4 4 0 0 0 4 4"/>',
    effect: '<path d="m10 3 2.4 6.6L19 12l-6.6 2.4L10 21l-2.4-6.6L1 12l6.6-2.4ZM20 2v6m-3-3h6m-2 11v6m-3-3h6"/>',
    location: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>'
  };
  const labels = { photo: '사진·배경', font: '글꼴·크기', color: '글씨·글상자 색', effect: '꾸미기 효과', location: '위치', settings: '표시 설정' };
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function install({ onOpen } = {}) {
    const composer = document.querySelector('.composer');
    if (!composer) return null;
    if (composer.ojjudaTools) return composer.ojjudaTools;
    const find = selector => composer.querySelector(selector);
    const body = find('.composer-body'), footer = find('.composer-footer');
    const more = find('#compose-more'), content = find('#compose-more-content');
    const summary = more?.querySelector('summary');
    if (!body || !footer || !content || !summary) return null;

    const dock = make('div', 'compose-tools-dock');
    const toolbar = make('div', 'compose-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', '글쓰기 옵션');
    const panels = {}, buttons = {};
    for (const [key, label] of Object.entries(labels)) {
      const panel = make('section', 'compose-tool-panel');
      panel.id = `compose-panel-${key}`;
      panel.dataset.composePanel = key;
      panel.setAttribute('aria-label', label);
      panel.hidden = true;
      panels[key] = panel;
      const button = make('button', 'compose-tool');
      button.type = 'button';
      button.dataset.composeTool = key;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-controls', panel.id);
      button.setAttribute('aria-expanded', 'false');
      button.tabIndex = key === 'photo' ? 0 : -1;
      // Icons are fixed application markup, never author-provided text.
      button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[key]}</svg>`;
      buttons[key] = button;
      toolbar.append(button);
    }
    const move = (selector, parent) => {
      const element = find(selector);
      if (element) parent.append(element);
      return element;
    };
    const attachment = make('div', 'compose-attachment');
    move('#card-photo-attach', attachment);
    move('#card-photo-remove', attachment);
    panels.photo.append(attachment);
    move('#event-photo-choice', panels.photo);
    move('#note-photo-pick', panels.photo);

    const effectFields = make('div', 'note-style-controls');
    const effectLabel = find('#compose-effect')?.closest('label');
    if (effectLabel) effectFields.append(effectLabel);
    panels.effect.append(effectFields);
    move('.ju-compose-tools', panels.effect);
    move('#note-style-controls', panels.font);
    const convert = move('#convert-calligraphy', panels.font);
    move('.note-color-fields', panels.color);
    move('#card-location-consent', panels.location);
    move('#note-event-fields', panels.location);
    move('.compose-publish-settings', panels.settings);
    const identityQuick = find('#quick-identity')?.closest('.compose-quick');
    if (identityQuick) panels.settings.append(identityQuick);
    for (const row of [...content.querySelectorAll('.identity-row')]) panels.settings.append(row);
    const help = find('.note-setting-help');
    content.replaceChildren(...Object.values(panels));
    if (help) panels.font.append(help);

    const tagEntry = make('label', 'compose-tag-entry');
    tagEntry.append(make('span', 'visually-hidden', '태그'));
    const tags = move('#compose-tags', tagEntry);
    if (tags) tags.placeholder = '#태그를 입력해 주세요';
    body.prepend(tagEntry);
    const selection = make('div', 'compose-selection-summary');
    const selectionButton = make('button', 'compose-selection-button');
    selectionButton.type = 'button';
    selectionButton.setAttribute('aria-controls', panels.settings.id);
    selectionButton.setAttribute('aria-expanded', 'false');
    selection.append(selectionButton);
    find('.compose-status')?.after(selection);

    const head = find('.composer-head'), publish = find('#publish-card');
    head?.querySelector(':scope > span')?.remove();
    if (head && publish) head.append(publish);
    dock.append(more, toolbar);
    composer.append(dock);
    composer.classList.add('composer-tools-ready');
    composer.tabIndex = -1;
    let active = null, blocked = false, guest = false;

    function setExpanded(key) {
      for (const [name, button] of Object.entries(buttons)) {
        const value = String(name === key);
        if (button.getAttribute('aria-expanded') !== value) button.setAttribute('aria-expanded', value);
        panels[name].hidden = name !== key;
      }
      selectionButton.setAttribute('aria-expanded', String(key === 'settings'));
    }
    function close(returnFocus = true) {
      const previous = active;
      const wasOpen = more.open;
      active = null;
      more.open = false;
      setExpanded(null);
      if (returnFocus && previous && !buttons[previous].disabled) buttons[previous].focus({ preventScroll: true });
      return wasOpen;
    }
    function open(key, focus = true) {
      if (!buttons[key] || blocked || guest || buttons[key].disabled) return false;
      active = key;
      setExpanded(key);
      summary.textContent = labels[key];
      summary.setAttribute('aria-label', `${labels[key]} 설정 닫기`);
      more.open = true;
      content.scrollTop = 0;
      if (focus) summary.focus({ preventScroll: true });
      onOpen?.(key);
      return true;
    }
    for (const [key, button] of Object.entries(buttons)) button.addEventListener('click', () => {
      if (active === key && more.open) close();
      else open(key);
    });
    selectionButton.addEventListener('click', () => active === 'settings' ? close() : open('settings'));
    summary.addEventListener('click', event => { event.preventDefault(); close(); });
    more.addEventListener('toggle', () => {
      if (!more.open && active) close(false);
      else if (more.open && !active) open('font', false);
    });
    toolbar.addEventListener('focusin', event => {
      const focused = event.target.closest('.compose-tool');
      if (focused) for (const button of Object.values(buttons)) button.tabIndex = button === focused ? 0 : -1;
    });
    toolbar.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const available = Object.values(buttons).filter(button => !button.disabled);
      if (!available.length) return;
      event.preventDefault();
      const current = available.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? available.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length;
      available[next].focus({ preventScroll: true });
    });
    composer.addEventListener('focusin', event => {
      if (event.target.id === 'compose-text' || event.target.id === 'compose-tags') close(false);
    });
    function sync(state = {}) {
      guest = !!state.guest;
      blocked = !!state.disabled;
      toolbar.hidden = guest;
      tagEntry.hidden = guest;
      selection.hidden = guest;
      if (convert) {
        const parent = guest ? body : panels.font;
        if (convert.parentElement !== parent) {
          if (guest) body.insertBefore(convert, find('#guest-compose-login'));
          else panels.font.prepend(convert);
        }
      }
      const available = {
        photo: !find('#card-photo-attach')?.hidden || !find('#note-photo-pick')?.hidden || !find('#event-photo-choice')?.hidden,
        location: !find('#card-location-consent')?.hidden || !find('#note-event-fields')?.hidden
      };
      for (const [key, button] of Object.entries(buttons)) {
        button.disabled = blocked || guest || available[key] === false;
        const selected = String(!!state.selected?.[key]);
        if (button.dataset.selected !== selected) button.dataset.selected = selected;
        const required = key === 'location' && !guest && !!state.locationRequired;
        if (button.dataset.required !== String(required)) button.dataset.required = String(required);
        const label = labels[key] + (required ? ' · 확인 필요' : '');
        if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
      }
      selectionButton.disabled = blocked;
      const identity = find('#quick-identity'), gender = find('#quick-gender');
      const name = identity?.selectedOptions?.[0]?.textContent || '익명';
      const sex = gender?.closest('.quick-choice')?.hidden ? '' : gender?.value === 'private' ? '성별 비공개' : gender?.selectedOptions?.[0]?.textContent;
      const value = [name, sex, '전체 공개'].filter(Boolean).join(' · ');
      if (selectionButton.textContent !== value) selectionButton.textContent = value;
      selectionButton.setAttribute('aria-label', `${value} · 표시 설정 열기`);
      if (publish) {
        const label = publish.textContent || '등록하기';
        publish.setAttribute('aria-label', label);
        publish.title = label;
        publish.classList.toggle('has-price', /\d\s*(ZU|쭈)/i.test(label));
      }
      if (guest || (active && buttons[active].disabled)) close(false);
      const enabled = Object.values(buttons).filter(button => !button.disabled);
      if (enabled.length && !enabled.some(button => button.tabIndex === 0)) enabled[0].tabIndex = 0;
    }
    const api = Object.freeze({ open, close, sync, isOpen: () => more.open });
    composer.ojjudaTools = api;
    return api;
  }
  window.OjjudaComposerTools = Object.freeze({ install });
})();
