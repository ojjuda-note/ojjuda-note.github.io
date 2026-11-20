/* Shared renderer for the public organization directory and protected admin details. */
(() => {
  'use strict';
  const COLORS = ['#47658e', '#3d7c80', '#6b689e', '#8b6347', '#64765b'];
  const DEPT_WIDTH = 294, DEPT_GAP = 18, HQ_GAP = 26, BOARD_PAD = 42;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const button = (text, className) => { const node = el('button', className, text); node.type = 'button'; return node; };
  const list = value => Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : [];
  const level = value => value === '本部長' ? '총괄' : String(value || '조직');
  const cleanQuery = value => value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
  const hasParallelDivisions = record => record.node.level === '부' && record.node.name === '오락실사업부' && record.children.length === 3;
  const departmentWidth = record => hasParallelDivisions(record) ? DEPT_WIDTH * 3 + DEPT_GAP * 2 : DEPT_WIDTH;
  const headquartersWidth = record => Math.max(DEPT_WIDTH, record.children.reduce((sum, dept) => sum + departmentWidth(dept), 0) + Math.max(0, record.children.length - 1) * DEPT_GAP);

  function mount(host, payload, options = {}) {
    const publicMode = options.publicMode === true;
    const organization = payload?.organization;
    if (!organization || !Array.isArray(organization.headquarters) || !organization.headquarters.length || !Array.isArray(organization.representative) || organization.representative.length < 3) throw Error('invalid_organization');
    const abort = new AbortController(), signal = abort.signal;
    const on = (node, type, handler, options = {}) => node.addEventListener(type, handler, { ...options, signal });
    const teamMap = new Map((Array.isArray(payload.teams) ? payload.teams : []).filter(t => typeof t?.team === 'string').map(t => [t.team, t]));
    const assignments = publicMode ? null : payload.ai_assignments;
    const departmentIds = new Map((Array.isArray(payload.departments) ? payload.departments : [])
      .filter(d => typeof d?.name === 'string' && typeof (d.department_id || d.id) === 'string')
      .map(d => [d.name, d.department_id || d.id]));
    const departmentAgents = new Map((Array.isArray(assignments?.departments) ? assignments.departments : [])
      .filter(a => typeof a?.department_id === 'string').map(a => [a.department_id, a]));
    const records = [], byId = new Map();
    let destroyed = false, scale = 1, selected = null, width = 0, height = 0, resizeFrame = 0, initialFrame = 0;
    let matches = [], searchTimer = 0, lastTrigger = null, suppressClick = false;
    const pointers = new Map();
    let gesture = null;
    function record(node, parent = null, depth = 0) {
      if (!node || typeof node.name !== 'string' || depth > 24 || records.length >= 1500) throw Error('invalid_organization');
      const result = { id: 'org-' + records.length, node, parent, children: [], element: null, team: teamMap.get(node.name) };
      result.path = parent ? [...parent.path, parent.node.name] : [];
      result.owner = node.level === '팀' ? result : parent?.owner || null;
      records.push(result); byId.set(result.id, result);
      if (Array.isArray(node.children)) result.children = node.children.map(child => record(child, result, depth + 1));
      return result;
    }
    const ceo = record({ name: '대표', level: '대표' });
    const leadership = organization.representative.map(n => record(n, ceo));
    ceo.children = leadership;
    const chief = leadership[1];
    const hqs = organization.headquarters.map(n => record(n, chief));
    const tf = organization.project_tf ? record(organization.project_tf, chief) : null;
    chief.children = [...hqs, ...(tf ? [tf] : [])];
    const root = el('div', 'org-app');
    const goalStrip = el('div', 'goal-strip'), goals = el('div', 'goals');
    goals.append(el('span', 'goals-label', '공동 목표'));
    const memberTarget = Number(payload.company_goal?.members);
    if (Number.isFinite(memberTarget) && memberTarget > 0) goals.append(el('span', 'goal', '회원가입 ' + memberTarget.toLocaleString('ko-KR') + '명'));
    if (payload.company_goal?.play_store) goals.append(el('span', 'goal', 'Play 스토어 등록'));
    const updated = el('span', 'updated');
    const updateDate = new Date(payload.updated_at);
    if (payload.updated_at && !Number.isNaN(updateDate.getTime())) updated.textContent = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(updateDate) + ' 기준';
    if (!publicMode) goalStrip.append(goals);
    else goalStrip.classList.add('public-summary');
    goalStrip.append(updated);
    const workspace = el('section', 'workspace'); workspace.setAttribute('aria-label', '오쭈다 전체 조직도');
    const toolbar = el('div', 'toolbar'), searchWrap = el('div', 'search-wrap');
    const searchIcon = el('span', 'search-icon', '⌕'); searchIcon.setAttribute('aria-hidden', 'true');
    const inputLabel = el('label', 'sr-only', '부서, 팀, 담당 업무 검색'); inputLabel.htmlFor = 'org-search';
    const input = el('input', 'org-search'); input.id = 'org-search'; input.type = 'search'; input.placeholder = '부서·팀·담당 업무 찾기'; input.autocomplete = 'off'; input.spellcheck = false;
    input.setAttribute('aria-controls', 'org-search-results'); input.setAttribute('aria-expanded', 'false');
    const clearSearch = button('×', 'clear-search'); clearSearch.hidden = true; clearSearch.setAttribute('aria-label', '검색어 지우기');
    const results = el('div', 'search-results'); results.id = 'org-search-results'; results.hidden = true; results.setAttribute('aria-label', '검색 결과');
    const announcements = el('div', 'sr-only'); announcements.setAttribute('role', 'status'); announcements.setAttribute('aria-live', 'polite');
    searchWrap.append(inputLabel, searchIcon, input, clearSearch, results);
    const controls = el('div', 'view-controls');
    const fitButton = button('전체 보기', 'button'); fitButton.id = 'fit-chart';
    const readableButton = button('읽기 크기', 'button'); readableButton.id = 'readable-chart';
    const zoomControls = el('div', 'zoom-controls'); zoomControls.setAttribute('role', 'group'); zoomControls.setAttribute('aria-label', '조직도 확대·축소');
    const minus = button('−', 'zoom-button'); minus.id = 'zoom-out'; minus.setAttribute('aria-label', '축소');
    const plus = button('+', 'zoom-button'); plus.id = 'zoom-in'; plus.setAttribute('aria-label', '확대');
    const zoomValue = el('output', 'zoom-value', '100%'); zoomValue.setAttribute('aria-label', '확대 비율');
    zoomControls.append(minus, zoomValue, plus); controls.append(fitButton, readableButton, zoomControls); toolbar.append(searchWrap, controls);
    const jumpBar = el('nav', 'jump-bar'); jumpBar.setAttribute('aria-label', '본부 바로가기'); jumpBar.append(el('span', 'jump-label', '바로가기'));
    const jumpRecords = [ceo, ...hqs, leadership[2]];
    jumpRecords.forEach((r, i) => {
      const jump = button('', 'jump-button'); jump.dataset.nodeId = r.id;
      if (i > 0 && i <= hqs.length) { const dot = el('span', 'jump-dot'); dot.style.setProperty('--branch', COLORS[(i - 1) % COLORS.length]); jump.append(dot); }
      jump.append(document.createTextNode(r.node.name)); on(jump, 'click', () => locate(r, true)); jumpBar.append(jump);
    });
    const canvasWrap = el('div', 'canvas-wrap'), viewport = el('div', 'chart-viewport'); viewport.tabIndex = 0; viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', '전체 조직도. 방향키로 이동하고 더하기, 빼기 키로 확대·축소할 수 있어요.');
    const spacer = el('div', 'chart-spacer'), board = el('div', 'chart-board');
    const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); lines.classList.add('org-lines'); lines.setAttribute('aria-hidden', 'true');
    board.append(lines);
    const leaders = el('div', 'leadership');
    function makeNode(r) {
      const b = button('', 'node'); b.dataset.nodeId = r.id; b.setAttribute('aria-haspopup', 'dialog');
      b.append(el('span', 'node-label', level(r.node.level)), el('span', 'node-title', r.node.name));
      const detail = list(r.node.detail);
      if (detail.length) b.append(el('span', 'node-detail', detail.slice(0, 2).join(' · ')));
      on(b, 'click', event => { if (!suppressClick) { lastTrigger = event.currentTarget; openDetails(r); } });
      r.element = b;
      return b;
    }
    [[ceo, 'ceo'], [leadership[0], 'secretary'], [chief, 'chief'], [leadership[2], 'audit'], ...(tf ? [[tf, 'tf']] : [])].forEach(([r, kind]) => {
      const wrap = el('div', 'leader ' + kind); wrap.append(makeNode(r)); leaders.append(wrap);
    });
    board.append(leaders);
    const groups = el('div', 'org-groups');
    function renderItems(children, parent) {
      if (!children.length) return;
      const allLeaves = children.every(r => !r.children.length && !list(r.node.detail).length);
      const wrap = el('div', 'items' + (allLeaves && children.length > 1 ? ' leaf-grid' : ''));
      children.forEach(r => { const item = el('div', 'item'); item.append(makeNode(r)); renderItems(r.children, item); wrap.append(item); });
      parent.append(wrap);
    }
    hqs.forEach((hq, i) => {
      const group = el('section', 'hq-group'); group.style.setProperty('--branch', COLORS[i % COLORS.length]); group.setAttribute('aria-label', hq.node.name);
      group.style.width = headquartersWidth(hq) + 'px';
      const heading = el('h2', 'hq-heading'); heading.append(makeNode(hq));
      const columns = el('div', 'dept-columns');
      hq.children.forEach(dept => {
        const column = el('section', 'dept-column' + (hasParallelDivisions(dept) ? ' arcade-department' : '')); column.setAttribute('aria-label', dept.node.name);
        column.style.width = departmentWidth(dept) + 'px';
        const deptHeading = el('h3', 'dept-heading'); deptHeading.append(makeNode(dept)); column.append(deptHeading);
        const divisions = el('div', 'division-list');
        dept.children.forEach(division => {
          const divisionEl = el('section', 'division'); const divisionHeading = el('h4', 'division-heading'); divisionHeading.append(makeNode(division));
          const teams = el('div', 'team-list');
          division.children.forEach(team => { const teamEl = el('div', 'team'); teamEl.append(makeNode(team)); renderItems(team.children, teamEl); teams.append(teamEl); });
          divisionEl.append(divisionHeading, teams); divisions.append(divisionEl);
        });
        column.append(divisions); columns.append(column);
      });
      group.append(heading, columns); groups.append(group);
    });
    const calculatedWidth = hqs.reduce((sum, hq) => sum + headquartersWidth(hq), 0) + (hqs.length - 1) * HQ_GAP + BOARD_PAD * 2;
    board.style.width = calculatedWidth + 'px';
    board.append(groups); spacer.append(board); viewport.append(spacer);
    const tip = el('div', 'canvas-tip', '빈 곳을 끌어 이동 · 팀을 누르면 담당 업무'); tip.setAttribute('aria-hidden', 'true');
    canvasWrap.append(viewport, tip);
    const footer = el('div', 'canvas-footer');
    footer.append(el('p', '', '모든 조직을 펼쳐 두었어요. 본부 이름을 누르면 바로 이동해요.'));
    const counts = new Map(); records.forEach(r => counts.set(r.node.level, (counts.get(r.node.level) || 0) + 1));
    footer.append(el('p', 'organization-count', ['본부', '부', '과', '팀', '실'].filter(k => counts.has(k)).map(k => k + ' ' + counts.get(k)).join(' · ')));
    workspace.append(toolbar, jumpBar, canvasWrap, footer);
    const dialog = el('dialog', 'detail-dialog'); dialog.setAttribute('aria-labelledby', 'detail-title');
    const detailTop = el('div', 'detail-top'), detailHeading = el('div'), kicker = el('p', 'detail-kicker'), detailTitle = el('h2'); detailTitle.id = 'detail-title'; detailTitle.tabIndex = -1;
    const close = button('×', 'close-detail'); close.setAttribute('aria-label', '담당 업무 닫기');
    detailHeading.append(kicker, detailTitle); detailTop.append(detailHeading, close);
    const detailBody = el('div', 'detail-body'); dialog.append(detailTop, detailBody);
    root.append(goalStrip, workspace, announcements, dialog); host.replaceChildren(root);

    function clearSelected() { if (selected?.element) selected.element.classList.remove('selected'); selected = null; }
    function markSelected(r) { clearSelected(); selected = r; r.element?.classList.add('selected'); }
    function appendSection(title, content) {
      if (!content?.length) return;
      const section = el('section', 'detail-section'); section.append(el('h3', '', title));
      if (typeof content === 'string') section.append(el('p', '', content));
      else { const ul = el('ul'); content.forEach(text => ul.append(el('li', '', text))); section.append(ul); }
      detailBody.append(section);
    }
    function assignedAgent(r) {
      if (!assignments) return null;
      if (r === chief) return assignments.coordinator || null;
      if (r === leadership[2]) return assignments.auditor || null;
      for (let current = r; current && current !== chief; current = current.parent) {
        const departmentId = current.team?.department_id || departmentIds.get(current.node.name);
        if (departmentId) return departmentAgents.get(departmentId) || null;
      }
      return null;
    }
    function appendAgent(r) {
      if (publicMode) return;
      const agent = assignedAgent(r);
      if (!agent) {
        if (r === chief || r === leadership[2] || departmentIds.has(r.node.name)) appendSection('담당 AI', '배정 확인 필요');
        return;
      }
      const name = typeof agent.name === 'string' ? agent.name.trim() : '';
      const id = typeof agent.agent_id === 'string' ? agent.agent_id.trim() : '';
      if (!name || !id) { appendSection('담당 AI', '배정 확인 필요'); return; }
      const linked = typeof agent.automation_id === 'string' && agent.automation_id.trim();
      const executionStates = {
        scheduled: linked ? '예약 활성 · 실행 결과 미검증' : '실행 미연결',
        paused: linked ? '일시중지' : '실행 미연결',
        unconnected: '실행 미연결'
      };
      const execution = Object.hasOwn(executionStates, agent.execution_status) ? executionStates[agent.execution_status] : '상태 미확인';
      const details = [name, '담당 ID: ' + id,
        '배정: ' + (agent.assignment_status === 'assigned' ? '완료' : agent.assignment_status === 'pending' ? '대기' : '확인 필요'),
        '자동 실행: ' + execution];
      const verified = new Date(agent.verified_at);
      if (agent.verified_at && !Number.isNaN(verified.getTime())) details.push('확인: ' + new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
      }).format(verified));
      appendSection('담당 AI', details);
    }
    function openDetails(r) {
      hideResults(); markSelected(r); kicker.textContent = level(r.node.level); detailTitle.textContent = r.node.name; detailBody.replaceChildren();
      if (r.path.length) detailBody.append(el('p', 'detail-path', r.path.join(' › ')));
      appendAgent(r);
      appendSection('담당 업무', r.team?.mission || list(r.node.detail));
      if (r.owner && r.owner !== r) {
        const section = el('section', 'detail-section'); section.append(el('h3', '', '담당 팀'));
        const ownerButton = button(r.owner.node.name + '  ›', 'detail-child'); on(ownerButton, 'click', () => openDetails(r.owner)); section.append(ownerButton); detailBody.append(section);
      }
      if (!publicMode) {
        appendSection('점검할 내용', list(r.team?.checks));
        appendSection('공동 목표에 기여할 일', list(r.team?.company_goal_contribution));
      }
      if (r.children.length) {
        const section = el('section', 'detail-section'); section.append(el('h3', '', r.node.level === '팀' || r.node.level === '항목' ? '담당 항목' : '산하 조직'));
        const children = el('div', 'detail-children' + (hasParallelDivisions(r) ? ' detail-children-columns' : ''));
        r.children.forEach(child => { const b = button('', 'detail-child'); b.append(el('span', '', child.node.name), el('span', '', '›')); on(b, 'click', () => openDetails(child)); children.append(b); });
        section.append(children); detailBody.append(section);
      }
      if (!publicMode) appendSection('업무 확인 자료', list(r.team?.evidence));
      const locateButton = button('조직도에서 보기', 'button primary detail-locate'); on(locateButton, 'click', () => { dialog.close(); locate(r, true); }); detailBody.append(locateButton);
      if (!r.team?.mission && !list(r.node.detail).length && !r.children.length) detailBody.prepend(el('p', 'detail-note', '등록된 담당 업무가 아직 없어요.'));
      if (!dialog.open) dialog.showModal();
      dialog.scrollTop = 0; detailTitle.focus({ preventScroll: true });
    }
    on(close, 'click', () => dialog.close());
    on(dialog, 'click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
    on(dialog, 'close', () => { lastTrigger?.isConnected && lastTrigger.focus({ preventScroll: true }); });
    function boardRect(r) {
      const rect = r.element.getBoundingClientRect(), origin = board.getBoundingClientRect();
      return { left: (rect.left - origin.left) / scale, top: (rect.top - origin.top) / scale, width: rect.width / scale, height: rect.height / scale };
    }
    function anchor(r, side) { const b = boardRect(r); return { x: b.left + b.width / 2, y: b.top + (side === 'bottom' ? b.height : 0) }; }
    function path(d, className) { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); if (className) p.setAttribute('class', className); lines.append(p); }
    function connect(parent, children, busOffset = 25) {
      if (!children.length) return;
      const a = anchor(parent, 'bottom'), points = children.map(r => anchor(r, 'top')), busY = Math.min(...points.map(p => p.y)) - busOffset;
      path(`M ${a.x} ${a.y} V ${busY} H ${points[0].x} M ${Math.min(...points.map(p => p.x))} ${busY} H ${Math.max(...points.map(p => p.x))}`);
      points.forEach(p => path(`M ${p.x} ${busY} V ${p.y}`));
    }
    function redraw() {
      if (destroyed) return;
      width = board.offsetWidth; height = board.offsetHeight; lines.replaceChildren(); lines.setAttribute('width', width); lines.setAttribute('height', height); lines.setAttribute('viewBox', `0 0 ${width} ${height}`);
      connect(ceo, leadership, 27); connect(chief, hqs, 28); hqs.forEach(hq => connect(hq, hq.children, 28));
      hqs.forEach(hq => hq.children.filter(hasParallelDivisions).forEach(dept => connect(dept, dept.children, 24)));
      if (tf) { const a = anchor(chief, 'bottom'), b = boardRect(tf), y = b.top + b.height / 2; path(`M ${a.x} ${a.y} V ${y} H ${b.left}`, 'independent'); }
      updateSpace();
    }
    function minimumScale() { return Math.min(.15, Math.max(.045, Math.min(viewport.clientWidth / width, viewport.clientHeight / height) * .9)); }
    function updateSpace() { board.style.transform = `scale(${scale})`; spacer.style.width = Math.max(viewport.clientWidth, width * scale) + 'px'; spacer.style.height = Math.max(viewport.clientHeight, height * scale) + 'px'; zoomValue.value = Math.round(scale * 100) + '%'; zoomValue.textContent = zoomValue.value; minus.disabled = scale <= minimumScale() + .001; plus.disabled = scale >= 1.75; }
    function setScale(value, point) {
      if (!width || !height) return;
      const x = point?.x ?? viewport.clientWidth / 2, y = point?.y ?? viewport.clientHeight / 2;
      const boardX = (viewport.scrollLeft + x) / scale, boardY = (viewport.scrollTop + y) / scale;
      scale = Math.max(minimumScale(), Math.min(1.75, value)); updateSpace();
      viewport.scrollLeft = boardX * scale - x; viewport.scrollTop = boardY * scale - y;
    }
    function fit() {
      scale = Math.min(1, (viewport.clientWidth - 24) / width, (viewport.clientHeight - 24) / height); scale = Math.max(minimumScale(), scale); updateSpace(); viewport.scrollLeft = 0; viewport.scrollTop = 0;
      announcements.textContent = '전체 조직을 한 화면에 맞췄어요. ' + Math.round(scale * 100) + '퍼센트';
    }
    function locate(r, focus = false) {
      if (!r.element || destroyed) return;
      const b = boardRect(r); scale = 1; updateSpace();
      viewport.scrollLeft = b.left + b.width / 2 - viewport.clientWidth / 2; viewport.scrollTop = Math.max(0, b.top - 65);
      markSelected(r); if (focus) r.element.focus({ preventScroll: true }); announcements.textContent = r.node.name + ' 위치로 이동했어요.';
    }
    on(fitButton, 'click', fit);
    on(readableButton, 'click', () => { if (scale < .4 && !selected) locate(chief, true); else setScale(1); announcements.textContent = '읽기 편한 100퍼센트 크기로 바꿨어요.'; });
    on(plus, 'click', () => setScale(scale * 1.25)); on(minus, 'click', () => setScale(scale / 1.25));
    on(viewport, 'keydown', event => {
      if (event.target !== viewport) return;
      if (['+', '=', '-', '_', 'Home', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault();
      if (event.key === '+' || event.key === '=') setScale(scale * 1.25);
      if (event.key === '-' || event.key === '_') setScale(scale / 1.25);
      if (event.key === 'Home') fit();
      if (event.key === 'ArrowLeft') viewport.scrollLeft -= 100;
      if (event.key === 'ArrowRight') viewport.scrollLeft += 100;
      if (event.key === 'ArrowUp') viewport.scrollTop -= 100;
      if (event.key === 'ArrowDown') viewport.scrollTop += 100;
    });
    on(viewport, 'wheel', event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); const r = viewport.getBoundingClientRect(); setScale(scale * Math.exp(-event.deltaY * .006), { x: event.clientX - r.left, y: event.clientY - r.top }); } }, { passive: false });
    function startGesture() {
      const points = [...pointers.values()];
      if (points.length >= 2) {
        const a = points[0], b = points[1], rect = viewport.getBoundingClientRect();
        gesture = { type: 'pinch', distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), scale, boardX: (viewport.scrollLeft + (a.x + b.x) / 2 - rect.left) / scale, boardY: (viewport.scrollTop + (a.y + b.y) / 2 - rect.top) / scale };
      } else if (points.length) gesture = { type: 'pan', x: points[0].x, y: points[0].y, left: viewport.scrollLeft, top: viewport.scrollTop };
      else gesture = null;
    }
    on(viewport, 'pointerdown', event => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); startGesture();
      if (!event.target.closest('button')) viewport.setPointerCapture(event.pointerId);
      if (pointers.size > 1) suppressClick = true;
    });
    on(viewport, 'pointermove', event => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gesture.type === 'pinch') {
        const [a, b] = [...pointers.values()]; if (!b) return;
        const rect = viewport.getBoundingClientRect(), middleX = (a.x + b.x) / 2 - rect.left, middleY = (a.y + b.y) / 2 - rect.top;
        scale = Math.max(minimumScale(), Math.min(1.75, gesture.scale * Math.hypot(b.x - a.x, b.y - a.y) / gesture.distance)); updateSpace();
        viewport.scrollLeft = gesture.boardX * scale - middleX; viewport.scrollTop = gesture.boardY * scale - middleY;
      } else {
        const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
        if (Math.abs(dx) + Math.abs(dy) < 6 && !suppressClick) return;
        suppressClick = true; viewport.classList.add('dragging');
        if (!viewport.hasPointerCapture(event.pointerId)) viewport.setPointerCapture(event.pointerId);
        viewport.scrollLeft = gesture.left - dx; viewport.scrollTop = gesture.top - dy;
      }
    });
    function releasePointer(event) {
      pointers.delete(event.pointerId); if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId); startGesture();
      if (!pointers.size) { viewport.classList.remove('dragging'); setTimeout(() => { suppressClick = false; }, 0); }
    }
    on(viewport, 'pointerup', releasePointer); on(viewport, 'pointercancel', releasePointer);
    on(viewport, 'click', event => { if (suppressClick) { event.stopPropagation(); event.preventDefault(); } }, { capture: true });
    function hideResults() { results.hidden = true; input.setAttribute('aria-expanded', 'false'); }
    function search() {
      const query = cleanQuery(input.value.trim()); clearSearch.hidden = !query; records.forEach(r => r.element?.classList.remove('search-hit')); results.replaceChildren();
      if (!query) { matches = []; hideResults(); announcements.textContent = ''; return; }
      matches = records.map(r => ({ r, name: cleanQuery(r.node.name), text: cleanQuery([r.node.name, ...list(r.node.detail), r.team?.mission || ''].join(' ')) })).filter(x => x.text.includes(query)).sort((a, b) => Number(b.name === query) - Number(a.name === query) || Number(b.name.startsWith(query)) - Number(a.name.startsWith(query))).map(x => x.r);
      matches.forEach(r => r.element?.classList.add('search-hit')); results.append(el('p', 'search-summary', matches.length ? matches.length + '곳을 찾았어요.' : '찾는 부서가 없어요. 다른 이름으로 검색해 보세요.'));
      matches.forEach(r => {
        const b = button('', 'search-result'); b.append(el('strong', '', r.node.name), el('small', '', r.path.slice(-3).join(' › ')));
        on(b, 'click', () => { locate(r, true); lastTrigger = r.element; openDetails(r); }); results.append(b);
      });
      results.hidden = false; input.setAttribute('aria-expanded', 'true'); announcements.textContent = matches.length + '곳을 찾았어요.';
    }
    on(input, 'input', event => { clearTimeout(searchTimer); if (!event.isComposing) searchTimer = setTimeout(search, 100); });
    on(input, 'compositionend', search); on(input, 'focus', () => { if (input.value.trim()) search(); });
    on(input, 'keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); hideResults(); }
      if (event.key === 'ArrowDown' && matches.length) { event.preventDefault(); results.querySelector('button')?.focus(); }
      if (event.key === 'Enter') { event.preventDefault(); clearTimeout(searchTimer); search(); if (matches[0]) { locate(matches[0], true); lastTrigger = matches[0].element; openDetails(matches[0]); } }
    });
    on(clearSearch, 'click', () => { input.value = ''; search(); input.focus(); });
    on(document, 'pointerdown', event => { if (!searchWrap.contains(event.target)) hideResults(); });
    on(results, 'keydown', event => {
      if (event.key === 'Escape') { hideResults(); input.focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const buttons = [...results.querySelectorAll('button')], index = buttons.indexOf(document.activeElement); event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
      }
    });
    const observer = new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(redraw); }); observer.observe(board); observer.observe(viewport);
    initialFrame = requestAnimationFrame(() => {
      redraw();
      // Start with readable labels. The complete sheet remains one click away.
      locate(ceo); clearSelected();
    });
    document.fonts?.ready.then(() => { if (!destroyed) redraw(); });
    return {
      destroy() { destroyed = true; abort.abort(); observer.disconnect(); cancelAnimationFrame(resizeFrame); cancelAnimationFrame(initialFrame); clearTimeout(searchTimer); if (dialog.open) dialog.close(); pointers.clear(); records.length = 0; byId.clear(); teamMap.clear(); departmentIds.clear(); departmentAgents.clear(); host.replaceChildren(); },
      fit, locate
    };
  }
  window.OjjudaOrganizationChart = { mount };
})();

