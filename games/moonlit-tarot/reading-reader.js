/* One reading page at a time. The caller owns the original text and access check. */
export function createReadingReader({ dialog, prefix, canRead = () => true, renderText, renderArtwork, onFinish } = {}) {
  if (!dialog?.ownerDocument || !/^[a-zA-Z][\w-]*$/.test(prefix || '')) throw new TypeError('A dialog and a valid reader prefix are required.');
  const doc = dialog.ownerDocument;
  const win = doc.defaultView;
  const id = name => prefix + '-' + name;
  const make = (tag, className, text) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const button = (name, className, label) => {
    const node = make('button', className, label);
    node.id = id(name);
    node.type = 'button';
    return node;
  };
  const text = (node, value) => {
    if (typeof renderText === 'function') renderText(node, String(value ?? ''));
    else node.textContent = String(value ?? '');
  };

  let pages = [], current = -1, revision = 0, menuOpen = false, swipe = null;
  const shell = make('div', 'reader-shell');
  const header = make('header', 'reader-header');
  const top = make('div', 'reader-topline');
  const menuToggle = button('reader-menu-toggle', 'reader-menu-toggle', '풀이 목록');
  menuToggle.setAttribute('aria-controls', id('reader-menu'));
  menuToggle.setAttribute('aria-expanded', 'false');
  const brand = make('span', 'reader-brand', '달의 마녀');
  const moon = make('span', 'reader-brand-moon', '☾');
  moon.setAttribute('aria-hidden', 'true');
  brand.prepend(moon);
  const close = button('reader-close', 'reader-close modal-close', '×');
  close.dataset.close = dialog.id;
  close.setAttribute('aria-label', '풀이 닫기');
  top.append(menuToggle, brand, close);
  const date = make('p', 'reader-date');
  date.id = id('date');
  const progress = make('div', 'reader-progress');
  progress.id = id('reader-progress');
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-valuemin', '0');
  const progressFill = make('span', 'reader-progress-fill');
  progress.append(progressFill);
  header.append(top, date, progress);

  const body = make('div', 'reader-body');
  body.id = id('reader-body');
  body.tabIndex = 0;
  body.setAttribute('aria-label', '현재 풀이');
  const page = make('article', 'reader-page');
  page.id = id('reader-page');
  page.setAttribute('aria-labelledby', id('title'));
  const title = make('h2', 'reader-title');
  title.id = id('title');
  title.tabIndex = -1;
  page.append(title);
  body.append(page);

  const footer = make('footer', 'reader-footer');
  const nextHint = make('p', 'reader-next-hint');
  nextHint.id = id('reader-next-hint');
  const navigation = make('nav', 'reader-navigation');
  navigation.setAttribute('aria-label', '풀이 쪽 이동');
  const previous = button('reader-prev', 'reader-prev', '이전');
  const count = make('span', 'reader-count');
  count.id = id('reader-count');
  count.setAttribute('aria-live', 'polite');
  count.setAttribute('aria-atomic', 'true');
  const next = button('reader-next', 'reader-next', '다음');
  next.setAttribute('aria-describedby', nextHint.id);
  navigation.append(previous, count, next);
  footer.append(nextHint, navigation);

  const menu = make('section', 'reader-menu');
  menu.id = id('reader-menu');
  menu.hidden = true;
  menu.setAttribute('aria-labelledby', id('reader-menu-title'));
  const menuHeading = make('h3', 'reader-menu-title', '읽을 내용');
  menuHeading.id = id('reader-menu-title');
  const menuScroll = make('div', 'reader-menu-scroll');
  const menuTools = make('div', 'reader-menu-tools');
  menuTools.id = id('reader-menu-tools');
  menuTools.hidden = true;
  const contents = make('nav', 'reader-contents');
  contents.setAttribute('aria-label', '풀이 목록');
  const menuActions = make('div', 'reader-menu-actions');
  menuActions.id = id('reader-menu-actions');
  menuActions.hidden = true;
  menuScroll.append(menuHeading, menuTools, contents);
  menu.append(menuScroll, menuActions);
  shell.append(header, body, footer, menu);
  dialog.classList.add('tarot-reader');
  dialog.setAttribute('aria-labelledby', title.id);
  dialog.replaceChildren(shell);

  // canRead may expire a reading and synchronously call reset(). In that case,
  // the initiating action must not put its old page back into the dialog.
  function allowed() {
    const before = revision;
    try { return canRead() !== false && before === revision; }
    catch { return false; }
  }
  const chapterKey = value => JSON.stringify([String(value.groupId || ''), String(value.chapterId || value.id)]);
  const selectedText = () => {
    const selection = win?.getSelection?.();
    return !!selection && !selection.isCollapsed && !!selection.toString();
  };
  const interactive = target => !!target?.closest?.('input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="combobox"], [role="textbox"], [role="slider"]');

  function hideMenu(focus = false) {
    menuOpen = false;
    menu.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.textContent = '풀이 목록';
    body.inert = false;
    footer.inert = false;
    body.removeAttribute('aria-hidden');
    footer.removeAttribute('aria-hidden');
    if (focus) menuToggle.focus({ preventScroll: true });
  }

  function renderContents() {
    contents.replaceChildren();
    const groups = new Map(), chapters = new Map();
    pages.forEach(item => {
      const key = chapterKey(item);
      if (chapters.has(key)) { chapters.get(key).count++; return; }
      const groupId = String(item.groupId || '');
      if (!groups.has(groupId)) groups.set(groupId, { label: item.groupLabel, chapters: [] });
      const chapter = { key, page: item, count: 1 };
      chapters.set(key, chapter);
      groups.get(groupId).chapters.push(chapter);
    });
    groups.forEach(group => {
      const section = make('section', 'reader-contents-group');
      if (group.label) section.append(make('h4', 'reader-group-label', group.label));
      group.chapters.forEach(chapter => {
        const entry = make('button', 'reader-contents-entry');
        entry.type = 'button';
        entry.dataset.readerTarget = chapter.page.id;
        entry.dataset.readerChapter = chapter.key;
        entry.append(make('span', 'reader-contents-label', chapter.page.chapterTitle || chapter.page.title || ''), make('span', 'reader-contents-pages', chapter.count + '쪽'));
        entry.addEventListener('click', () => { show(chapter.page.id); });
        section.append(entry);
      });
      contents.append(section);
    });
  }

  function paint(index, focus) {
    const item = pages[index];
    if (!item) return false;
    current = index;
    hideMenu();
    page.hidden = false;
    page.dataset.pageId = item.id;
    page.dataset.chapterId = String(item.chapterId || item.id);
    page.dataset.groupId = String(item.groupId || '');
    page.dataset.kind = String(item.kind || '');
    page.replaceChildren();
    if (item.chapterTitle && item.chapterTitle !== item.title) page.append(make('p', 'reader-chapter', item.chapterTitle));
    title.textContent = item.title || item.chapterTitle || '';
    title.classList.toggle('is-centered', title.textContent.length <= 44);
    page.append(title);
    if (item.subtitle) {
      const subtitle = make('p', 'reader-subtitle');
      text(subtitle, item.subtitle);
      page.append(subtitle);
    }
    if (item.art && typeof renderArtwork === 'function') {
      const art = make('div', 'reader-art result-card-art');
      art.setAttribute('role', 'img');
      art.setAttribute('aria-label', String(item.art.name || item.title || '') + ' 카드');
      renderArtwork(art, item.art);
      page.append(art);
    }
    if (Array.isArray(item.summaryLines) && item.summaryLines.length) {
      const summary = make('div', 'reader-summary');
      item.summaryLines.forEach(line => {
        const paragraph = make('p', 'reader-summary-line');
        text(paragraph, line);
        summary.append(paragraph);
      });
      page.append(summary);
    }
    (item.paragraphs || []).forEach(value => {
      const paragraph = make('p', 'reader-paragraph');
      text(paragraph, value);
      page.append(paragraph);
    });
    if (item.links?.length) {
      const links = make('div', 'reader-links');
      item.links.forEach(link => {
        let url;
        try { url = new URL(String(link.url), doc.baseURI); } catch { /* Preserve the label without making an unsafe link. */ }
        const safe = url && ['http:', 'https:'].includes(url.protocol);
        const entry = make(safe ? 'a' : 'span', 'reader-source-link', link.label || link.url || '');
        if (safe) {
          entry.href = url.href;
          entry.target = '_blank';
          entry.rel = 'noopener noreferrer';
          entry.addEventListener('click', event => { if (!allowed()) event.preventDefault(); });
        }
        links.append(entry);
      });
      page.append(links);
    }

    const key = chapterKey(item);
    const chapterPages = pages.filter(candidate => chapterKey(candidate) === key);
    const chapterIndex = chapterPages.findIndex(candidate => candidate.id === item.id);
    count.textContent = (chapterIndex + 1) + ' / ' + chapterPages.length;
    count.setAttribute('aria-label', (chapterIndex + 1) + '쪽, 전체 ' + chapterPages.length + '쪽');
    progress.setAttribute('aria-valuemax', String(chapterPages.length));
    progress.setAttribute('aria-valuenow', String(chapterIndex + 1));
    progress.setAttribute('aria-valuetext', count.getAttribute('aria-label'));
    progress.setAttribute('aria-label', (item.chapterTitle || item.title || '') + ' 읽기 진행');
    progressFill.style.transform = 'scaleX(' + ((chapterIndex + 1) / chapterPages.length) + ')';
    previous.disabled = index === 0;
    previous.textContent = index > 0 && chapterKey(pages[index - 1]) !== key ? '이전 풀이' : '이전';
    next.disabled = false;
    const following = pages[index + 1];
    const nextChapter = following && chapterKey(following) !== key;
    next.textContent = !following ? '읽기 마치기' : nextChapter ? '다음 풀이' : '다음';
    nextHint.textContent = nextChapter ? '다음 · ' + (following.chapterTitle || following.title || '') : '';
    nextHint.hidden = !nextChapter;
    contents.querySelectorAll('[data-reader-target]').forEach(entry => {
      if (entry.dataset.readerChapter === key) entry.setAttribute('aria-current', 'page');
      else entry.removeAttribute('aria-current');
    });
    body.scrollTop = 0;
    if (focus) title.focus({ preventScroll: true });
    return true;
  }

  function show(idOrIndex, { focus = true } = {}) {
    if (!allowed()) return false;
    const index = Number.isInteger(idOrIndex) ? idOrIndex : pages.findIndex(item => item.id === idOrIndex);
    return index >= 0 && index < pages.length ? paint(index, focus) : false;
  }

  function setPages(nextPages, { startId, preserve = true } = {}) {
    if (!Array.isArray(nextPages)) throw new TypeError('Reading pages must be an array.');
    if (!nextPages.length) { reset(); return true; }
    if (!allowed()) return false;
    const ids = new Set();
    const prepared = nextPages.map(item => {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new TypeError('Reading page IDs must be unique, nonempty strings.');
      ids.add(item.id);
      return { ...item, paragraphs: Array.isArray(item.paragraphs) ? [...item.paragraphs] : [], summaryLines: Array.isArray(item.summaryLines) ? [...item.summaryLines] : [], links: Array.isArray(item.links) ? [...item.links] : [] };
    });
    const previousId = preserve ? pages[current]?.id : null;
    pages = prepared;
    const wanted = startId ?? previousId;
    const index = pages.findIndex(item => item.id === wanted);
    renderContents();
    return paint(index < 0 ? 0 : index, false);
  }

  function move(delta) {
    if (!allowed() || menuOpen || current < 0) return false;
    if (delta > 0 && current === pages.length - 1) {
      if (typeof onFinish === 'function') onFinish();
      else dialog.close();
      return true;
    }
    const target = current + delta;
    return target >= 0 && target < pages.length ? paint(target, true) : false;
  }

  function openMenu() {
    if (!allowed() || !pages.length) return false;
    menuOpen = true;
    menu.hidden = false;
    menuToggle.textContent = '닫기';
    menuToggle.setAttribute('aria-expanded', 'true');
    body.inert = true;
    footer.inert = true;
    body.setAttribute('aria-hidden', 'true');
    footer.setAttribute('aria-hidden', 'true');
    (contents.querySelector('[aria-current="page"]') || menuToggle).focus({ preventScroll: true });
    return true;
  }

  function closeMenu() {
    if (!allowed()) return false;
    hideMenu(true);
    return true;
  }

  function reset() {
    revision++;
    pages = [];
    current = -1;
    swipe = null;
    hideMenu();
    title.textContent = '';
    date.textContent = '';
    page.replaceChildren(title);
    page.hidden = true;
    ['pageId', 'chapterId', 'groupId', 'kind'].forEach(key => { delete page.dataset[key]; });
    contents.replaceChildren();
    body.scrollTop = 0;
    count.textContent = '';
    count.removeAttribute('aria-label');
    progress.setAttribute('aria-valuemax', '1');
    progress.setAttribute('aria-valuenow', '0');
    progress.removeAttribute('aria-valuetext');
    progress.removeAttribute('aria-label');
    progressFill.style.transform = 'scaleX(0)';
    nextHint.textContent = '';
    nextHint.hidden = true;
    previous.disabled = next.disabled = true;
    previous.textContent = '이전';
    next.textContent = '다음';
  }

  function setMenuNode(container, node) {
    if (node === container) return;
    if (node == null) container.replaceChildren();
    else container.replaceChildren(node);
    container.hidden = !container.hasChildNodes();
  }

  previous.addEventListener('click', () => { move(-1); });
  next.addEventListener('click', () => { move(1); });
  menuToggle.addEventListener('click', () => { if (menuOpen) closeMenu(); else openMenu(); });
  close.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    hideMenu();
    dialog.close();
  });
  dialog.addEventListener('close', () => { hideMenu(); swipe = null; });
  dialog.addEventListener('cancel', event => {
    if (!menuOpen) return;
    event.preventDefault();
    closeMenu();
  });
  dialog.addEventListener('keydown', event => {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
      return;
    }
    if (menuOpen || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || interactive(event.target) || selectedText()) return;
    if (!body.contains(event.target)) return;
    if (event.key === 'ArrowLeft' && move(-1)) event.preventDefault();
    else if (event.key === 'ArrowRight' && move(1)) event.preventDefault();
  });
  body.addEventListener('touchstart', event => {
    swipe = null;
    if (menuOpen || event.touches.length !== 1 || interactive(event.target) || selectedText()) return;
    const touch = event.touches[0];
    swipe = { id: touch.identifier, x: touch.clientX, y: touch.clientY, scroll: body.scrollTop, time: Date.now() };
  }, { passive: true });
  body.addEventListener('touchmove', event => {
    if (!swipe) return;
    if (event.touches.length !== 1 || body.scrollTop !== swipe.scroll || selectedText()) { swipe = null; return; }
    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - swipe.x), dy = Math.abs(touch.clientY - swipe.y);
    if (dy > 18 && dy >= dx) swipe = null;
  }, { passive: true });
  body.addEventListener('touchend', event => {
    const gesture = swipe;
    swipe = null;
    if (!gesture || menuOpen || event.touches.length || selectedText() || body.scrollTop !== gesture.scroll || Date.now() - gesture.time > 900) return;
    const touch = Array.from(event.changedTouches).find(item => item.identifier === gesture.id);
    if (!touch) return;
    const dx = touch.clientX - gesture.x, dy = Math.abs(touch.clientY - gesture.y);
    if (Math.abs(dx) >= 60 && Math.abs(dx) > dy * 1.5 && dy < 60) move(dx < 0 ? 1 : -1);
  }, { passive: true });
  body.addEventListener('touchcancel', () => { swipe = null; }, { passive: true });

  reset();
  return { setPages, show, reset, openMenu, closeMenu, setMenuTools: node => setMenuNode(menuTools, node), setMenuActions: node => setMenuNode(menuActions, node) };
}
