/* The original group fields stay in one form; tools only change their layout. */
(() => {
  'use strict';
  const paths = {
    post: '<path d="M13.5 5.5 18.5 10.5M4 20l5-1 12-12a2.1 2.1 0 0 0-5-5L4 14Z"/>',
    photo: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
    plan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h3m3 0h2"/>',
    poll: '<path d="M4 20V10h4v10m4 0V4h4v16m4 0v-7h2v7M2 20h21"/>',
    bet: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="7.5" cy="7.5" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="16.5" cy="16.5" r=".8"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m4 12 5 5L20 6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
  const node = (tag, className) => Object.assign(document.createElement(tag), {className});

  function install(dialog, form) {
    const head = dialog.querySelector('.dialog-head'), submit = form.querySelector('[type="submit"]');
    const extras = form.querySelector('.composer-extras'), room = form.querySelector('.composer-room');
    const title = form.querySelector('[data-kind-fields]'), schedule = form.querySelector('#schedule-fields');
    const picker = form.querySelector('.kind-picker'), kind = form.elements.kind;
    if (!head || !submit || !extras || !room || !title || !schedule || !kind) return null;

    const body = node('div', 'group-compose-body'), dock = node('div', 'group-compose-dock');
    const toolbar = node('div', 'group-compose-toolbar'), card = node('section', 'group-compose-options');
    const panelHead = node('header', 'group-compose-options-head'), heading = node('h3', '');
    const panelClose = node('button', 'group-compose-panel-close'), content = node('div', 'group-compose-options-body');
    const context = node('button', 'group-compose-context'), status = node('div', 'group-compose-status');
    const panels = {}, buttons = {}, labels = {post:'글', photo:'사진/영상', plan:'계획', poll:'투표', bet:'내기', room:'올릴 그룹'};
    const categories = {post:['post'], plan:['event','trip'], poll:['poll'], bet:['ladder','wheel']};
    const availableKinds = new Set(Array.from(kind.options, option => option.value));
    let active = '', frame = 0, caretMirror = null;
    heading.id = 'group-compose-option-title';
    card.setAttribute('aria-labelledby', heading.id);
    card.hidden = true;
    panelClose.type = context.type = 'button';
    panelClose.setAttribute('aria-label', '옵션 닫기');
    panelClose.innerHTML = icon('close');
    panelHead.append(heading, panelClose);
    card.append(panelHead, content);
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', '글쓰기 옵션');
    for (const key of ['photo','plan','bet','room']) {
      const panel = node('div', 'group-compose-panel');
      panel.id = 'group-compose-' + key;
      panel.dataset.groupPanel = key;
      panel.hidden = true;
      panels[key] = panel;
      content.append(panel);
    }
    function kindChoice(value) {
      if (!availableKinds.has(value)) return null;
      const button = picker?.querySelector('[data-kind-choice="' + value + '"]') || node('button', '');
      button.type = 'button';
      button.dataset.kindChoice = value;
      return button;
    }
    for (const key of ['post','photo','plan','poll','bet']) {
      const button = (['post','poll'].includes(key) && kindChoice(key)) || node('button', '');
      button.classList.add('group-compose-tool');
      button.type = 'button';
      button.dataset.groupTool = key;
      button.setAttribute('aria-label', labels[key]);
      if (panels[key]) {
        button.setAttribute('aria-controls', panels[key].id);
        button.setAttribute('aria-expanded', 'false');
      }
      button.innerHTML = icon(key) + `<span>${labels[key]}</span>`;
      buttons[key] = button;
      toolbar.append(button);
    }
    context.dataset.groupTool = 'room';
    context.setAttribute('aria-controls', panels.room.id);
    context.setAttribute('aria-expanded', 'false');
    buttons.room = context;
    const roomFixed = room.classList.contains('fixed-room') || form.elements.room_id.disabled;
    panels.room.append(room);
    kind.closest('label').hidden = true;
    for (const key of ['bet']) {
      const row = node('div', 'group-compose-kind-row');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', labels[key] + ' 종류');
      for (const value of categories[key]) {
        const choice = kindChoice(value);
        if (!choice) continue;
        choice.textContent = {ladder:'사다리', wheel:'돌림판'}[value];
        row.append(choice);
      }
      panels[key].append(row);
    }
    picker?.remove();
    panels.plan.append(schedule);
    const photo = extras.querySelector('.file-picker'), hint = photo?.nextElementSibling;
    if (photo) panels.photo.append(photo);
    if (hint?.classList.contains('hint')) panels.photo.append(hint);
    panels.photo.append(extras.querySelector('#attachments'));
    extras.querySelectorAll(':scope > br').forEach(el => el.remove());
    extras.open = true;
    extras.querySelector('summary').hidden = true;
    const counter = node('span', 'group-compose-count');
    form.elements.body.insertAdjacentElement('afterend', counter);
    body.append(context, title, ...form.querySelectorAll('.activity-editor'), extras);
    status.append(form.querySelector('.error'), form.querySelector('#upload-status'));
    const oldFooter = submit.closest('.dialog-foot');
    const action = submit.textContent;
    submit.classList.add('group-compose-submit');
    submit.setAttribute('aria-label', action);
    submit.title = action;
    submit.innerHTML = icon('check');
    const closeButton = head.querySelector('[data-close]');
    closeButton.innerHTML = icon('close');
    head.classList.add('group-compose-head');
    head.querySelector('h2').textContent = action === '저장하기' ? '기록 수정' : '글 작성하기';
    head.prepend(closeButton);
    head.append(submit);
    oldFooter.remove();
    dock.append(card, toolbar);
    form.append(head, body, status, dock);
    dialog.classList.add('group-writing-dialog');
    dialog.tabIndex = -1;

    function writingField() {
      const focused = dialog.getRootNode().activeElement;
      return body.contains(focused) && focused.matches('input,textarea') ? focused : null;
    }
    function syncHighlight() {
      // The open tool takes precedence over the underlying post kind.
      // Photo is an attachment panel, and Bet may be open before choosing its game.
      const selected = (active && active !== 'room') ? active :
        categories.plan.includes(kind.value) ? 'plan' :
        categories.bet.includes(kind.value) ? 'bet' :
        kind.value === 'poll' ? 'poll' : 'post';
      for (const key of ['post','photo','plan','poll','bet']) {
        const isSelected = key === selected;
        buttons[key].setAttribute('aria-pressed', String(isSelected));
        buttons[key].dataset.selected = String(isSelected);
      }
    }
    function close(returnFocus = false) {
      if (!active) return false;
      const previous = buttons[active];
      active = '';
      card.hidden = true;
      Object.values(panels).forEach(panel => { panel.hidden = true; });
      Object.keys(panels).forEach(key => buttons[key].setAttribute('aria-expanded', 'false'));
      syncHighlight();
      if (returnFocus && !previous.hidden && !previous.disabled) previous.focus({preventScroll:true});
      return true;
    }
    function open(key, focus = true) {
      const button = buttons[key];
      if (!panels[key] || !button || button.hidden || button.disabled) return;
      active = key;
      heading.textContent = labels[key];
      card.hidden = false;
      for (const name of Object.keys(panels)) {
        panels[name].hidden = name !== key;
        buttons[name].setAttribute('aria-expanded', String(name === key));
      }
      syncHighlight();
      content.scrollTop = 0;
      if (focus) {
        const field = Array.from(panels[key].querySelectorAll('button,input,textarea,select,[tabindex]'))
          .find(el => !el.disabled && !el.closest('[hidden]'));
        (field || panelClose).focus({preventScroll:true});
      }
    }
    function bindTool(button, key) {
      button.addEventListener('pointerdown', event => {
        if (event.button === 0 && event.isPrimary !== false && writingField()) event.preventDefault();
      });
      button.addEventListener('click', event => {
        if (button.disabled || !panels[key]) return;
        const focus = !(event.detail > 0 && writingField());
        if (key === 'plan' && !categories.plan.includes(kind.value)) {
          const value = categories.plan.find(value => availableKinds.has(value));
          if (kind.disabled || !value) return;
          kind.value = value;
          kind.dispatchEvent(new Event('change', {bubbles:true}));
          open(key, focus);
          return;
        }
        if (active === key) close(focus);
        else open(key, focus);
      });
    }
    Object.entries(buttons).forEach(([key, button]) => bindTool(button, key));
    panelClose.addEventListener('pointerdown', event => {
      if (event.button === 0 && event.isPrimary !== false && writingField()) event.preventDefault();
    });
    panelClose.addEventListener('click', event => close(!(event.detail > 0 && writingField())));
    toolbar.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      const visible = Object.values(buttons).filter(button => toolbar.contains(button) && !button.hidden && !button.disabled);
      const index = visible.indexOf(dialog.getRootNode().activeElement);
      if (index < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 :
        (index + (event.key === 'ArrowRight' ? 1 : -1) + visible.length) % visible.length;
      visible[next].focus();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'Escape' && close(true)) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
    form.addEventListener('invalid', event => {
      const panel = event.target.closest('[data-group-panel]');
      if (panel) open(panel.dataset.groupPanel, false);
    }, true);

    function sync() {
      const option = kind.selectedOptions[0], name = form.elements.room_id.selectedOptions[0]?.textContent || '';
      const kindName = categories.plan.includes(kind.value) ? '계획' : kind.value === 'post' ? '글' : option?.textContent || '';
      context.textContent = name + ' · ' + kindName;
      context.setAttribute('aria-label', '올릴 그룹: ' + name + ', ' + kindName);
      context.disabled = roomFixed || form.elements.room_id.disabled;
      for (const [key, values] of Object.entries(categories)) {
        buttons[key].disabled = kind.disabled || !values.some(value => availableKinds.has(value));
      }
      for (const choice of content.querySelectorAll('[data-kind-choice]')) {
        choice.disabled = kind.disabled;
        choice.setAttribute('aria-pressed', String(choice.dataset.kindChoice === kind.value));
      }
      counter.textContent = form.elements.body.value.length.toLocaleString('ko-KR') + ' / 10,000';
      if (active && (buttons[active].hidden || buttons[active].disabled)) close();
      syncHighlight();
    }
    form.addEventListener('input', sync);
    form.addEventListener('change', event => {
      sync();
      if (event.target === kind) {
        if (categories.plan.includes(kind.value)) open('plan', false);
        else {
          close();
          (kind.value === 'post' ? form.elements.body : form.elements.title).focus({preventScroll:true});
        }
      }
    });

    function writingLine(field) {
      const bounds = field.getBoundingClientRect(), style = getComputedStyle(field);
      const pixels = name => parseFloat(style[name]) || 0;
      const lineHeight = pixels('lineHeight') || pixels('fontSize') * 1.4;
      if (field.tagName !== 'TEXTAREA') {
        const contentHeight = field.clientHeight - pixels('paddingTop') - pixels('paddingBottom');
        const top = bounds.top + pixels('borderTopWidth') + pixels('paddingTop') + Math.max(0, (contentHeight - lineHeight) / 2);
        return {top, bottom:top + lineHeight};
      }
      if (!caretMirror) {
        caretMirror = node('div', '');
        caretMirror.setAttribute('aria-hidden', 'true');
        caretMirror.inert = true;
        Object.assign(caretMirror.style, {
          position:'fixed', left:'-10000px', top:'0', visibility:'hidden', pointerEvents:'none',
          boxSizing:'border-box', height:'auto', minHeight:'0', maxHeight:'none',
          margin:'0', border:'0', overflow:'visible'
        });
        document.body.append(caretMirror);
      }
      for (const property of ['fontFamily','fontSize','fontWeight','fontStyle','fontStretch',
        'fontVariant','fontKerning','fontFeatureSettings','fontVariationSettings',
        'letterSpacing','wordSpacing','lineHeight','textAlign','textIndent','textTransform',
        'direction','whiteSpace','wordBreak','overflowWrap','tabSize',
        'paddingTop','paddingRight','paddingBottom','paddingLeft']) caretMirror.style[property] = style[property];
      caretMirror.style.width = `${field.clientWidth}px`;
      const position = field.selectionDirection === 'backward' ? field.selectionStart : field.selectionEnd;
      const marker = node('span', '');
      marker.textContent = field.value.slice(position) || '\u200b';
      caretMirror.replaceChildren(document.createTextNode(field.value.slice(0, position)), marker);
      try {
        const fragment = marker.getClientRects()[0] || marker.getBoundingClientRect();
        const leading = Math.max(0, (lineHeight - fragment.height) / 2);
        const top = bounds.top + pixels('borderTopWidth') + fragment.top - caretMirror.getBoundingClientRect().top - leading - field.scrollTop;
        return {top, bottom:top + lineHeight};
      } finally { caretMirror.replaceChildren(); }
    }
    function ensureVisible() {
      frame = 0;
      if (!dialog.open || Math.abs((window.visualViewport?.scale || 1) - 1) > .02) return;
      const focused = writingField();
      if (!focused) return;
      const area = body.getBoundingClientRect();
      if (!area.height || !focused.getClientRects().length) return;
      let line = writingLine(focused);
      if (focused.tagName === 'TEXTAREA') {
        // A native textarea can scroll its own first line slightly out of view
        // after a keyboard resize. Keep that line inside the field as well as
        // the outer sheet, without changing the selection or the draft.
        const field = focused.getBoundingClientRect();
        const inset = Math.min(6, Math.max(0, (focused.clientHeight - (line.bottom - line.top)) / 2));
        const top = field.top + focused.clientTop + inset;
        const bottom = field.top + focused.clientTop + focused.clientHeight - inset;
        const delta = line.top < top ? line.top - top : line.bottom > bottom ? line.bottom - bottom : 0;
        if (Math.abs(delta) > .5) {
          focused.scrollTop += delta;
          line = writingLine(focused);
        }
      }
      const margin = Math.min(6, Math.max(0, (body.clientHeight - (line.bottom - line.top)) / 2));
      const top = area.top + margin, bottom = area.bottom - margin;
      const delta = line.bottom - line.top > bottom - top ? (line.top + line.bottom - top - bottom) / 2 :
        line.top < top ? line.top - top : line.bottom > bottom ? line.bottom - bottom : 0;
      if (Math.abs(delta) > .5) body.scrollTop += delta;
    }
    function queueVisibility() {
      if (!frame && writingField()) frame = requestAnimationFrame(ensureVisible);
    }
    body.addEventListener('focusin', () => { close(); queueVisibility(); });
    for (const event of ['input','select','keyup','pointerup']) body.addEventListener(event, queueVisibility);
    document.addEventListener('selectionchange', queueVisibility);
    const observer = window.ResizeObserver ? new ResizeObserver(queueVisibility) : null;
    observer?.observe(body);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.addEventListener('close', () => {
      observer?.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', queueVisibility);
      caretMirror?.remove();
      document.body.style.overflow = oldOverflow;
    }, {once:true});
    sync();
    // Keep the first editable focus inside the tap that opened the writer.
    const firstField = form.elements.title;
    firstField.focus({preventScroll:true});
    firstField.setSelectionRange(firstField.value.length, firstField.value.length);
    const api = Object.freeze({sync, open, close});
    form.ojjudaWriter = api;
    return api;
  }
  window.OjjudaGroupComposer = Object.freeze({install});
})();
