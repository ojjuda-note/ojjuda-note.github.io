(() => {
  'use strict';
  const KINDS = { bug: '오류 수정', idea: '기능 개선' };
  const STATES = {
    queued: ['접수됨 · 실행 대기', 'queued'], running: ['작업 중', 'running'],
    needs_review: ['검토 필요', 'review'], blocked: ['작업 중단', 'blocked'],
    resolved: ['완료', 'resolved']
  };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function stateOf(task) {
    if (task.status === 'queued') {
      if (task.dispatch_status === 'failed') return ['실행 전달 실패', 'blocked'];
      if (task.dispatch_status === 'dispatching') return ['실행 전달 중', 'queued'];
      if (task.dispatch_status === 'dispatched') return ['실행 시작 대기', 'queued'];
    }
    return STATES[task.status] || ['상태 확인 필요', 'unknown'];
  }

  function evidenceUrl(value) {
    if (typeof value !== 'string' || !value) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port ||
        url.username || url.password || url.search) return null;
      if (!/^\/ojjuda-note\/(?:ojjuda-note\.github\.io|ojjuda-codex-worker)\/(?:actions\/runs\/[0-9]+(?:\/job\/[0-9]+)?|pull\/[0-9]+|commit\/[0-9a-f]{7,40})\/?$/i.test(url.pathname)) return null;
      return url.href;
    } catch { return null; }
  }

  function create({ client, getUser, elements, onChange = () => {}, onAuthLost = () => {}, formatTime }) {
    const { list, updated, feedback, refreshButton } = elements;
    const tasks = new Map();
    let stopped = false, refreshPromise = null, refreshAgain = false, revision = 0, hasLoaded = false;
    const make = (tag, className, value) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (value !== undefined) node.textContent = value;
      return node;
    };
    const actor = () => stopped ? null : getUser();
    const sameActor = id => actor()?.id === id;
    const notify = () => { revision += 1; onChange(); };
    const tell = value => { feedback.textContent = value || ''; };
    const authError = error => /not_admin|not_signed_in|jwt.*expired|invalid.*jwt|permission denied/i.test(
      `${error?.code || ''} ${error?.message || ''}`
    );

    function link(value, label) {
      const url = evidenceUrl(value);
      if (!url) return null;
      const item = make('a', 'task-link', label);
      item.href = url;
      item.target = '_blank';
      item.rel = 'noopener noreferrer';
      return item;
    }

    function render() {
      if (!tasks.size) {
        list.replaceChildren(make('li', 'work-placeholder', '아직 접수된 작업이 없습니다. 회의에 수정·개선 지시를 보내면 자동으로 접수됩니다.'));
        return;
      }
      const ordered = [...tasks.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      list.replaceChildren(...ordered.map(task => {
        const row = make('li', 'task-card');
        const heading = make('div', 'task-heading');
        const [label, state] = stateOf(task);
        const when = Number.isFinite(Date.parse(task.created_at)) ? formatTime(task.created_at) : '접수 시간 확인 중';
        heading.append(make('span', `task-status is-${state}`, label), make('span', 'task-kind', KINDS[task.kind] || '개발 요청'), make('time', '', when));
        row.append(heading, make('p', 'task-content', typeof task.content === 'string' ? task.content : '요청 내용 확인 중'));
        if (typeof task.summary === 'string' && task.summary) row.append(make('p', 'task-summary', task.summary));
        if (typeof task.result === 'string' && task.result && task.result !== task.summary) row.append(make('p', 'task-result', task.result));
        if (task.dispatch_status === 'failed') row.append(make('p', 'task-error',
          typeof task.dispatch_error === 'string' && task.dispatch_error.trim()
            ? task.dispatch_error : '실행기로 전달하지 못했습니다. 목록을 새로고침해 상태를 확인해 주세요.'));
        const links = make('div', 'task-links');
        const result = link(task.evidence_url, '결과 확인 ↗');
        if (result) links.append(result);
        if (/^[0-9]+$/.test(String(task.worker_run_id || ''))) {
          const run = link(`https://github.com/ojjuda-note/ojjuda-codex-worker/actions/runs/${task.worker_run_id}`, '실행 기록 ↗');
          if (run && run.href !== result?.href) links.append(run);
        }
        row.append(links);
        return row;
      }));
    }

    async function loadSnapshot(actorId) {
      try {
        const { data, error } = await client.rpc('admin_ai_meeting_tasks', { p_limit: 30 });
        if (!sameActor(actorId)) return false;
        if (error) {
          if (authError(error)) { onAuthLost(); return false; }
          throw error;
        }
        if (!Array.isArray(data)) throw new Error('invalid_tasks');
        const previous = JSON.stringify([...tasks.values()]);
        tasks.clear();
        for (const task of data) {
          if (!UUID.test(task?.message_id || '') || !task?.feedback_id) continue;
          tasks.set(task.message_id, task);
        }
        const changed = previous !== JSON.stringify([...tasks.values()]);
        if (changed || !hasLoaded) render();
        hasLoaded = true;
        updated.textContent = `최종 조회 ${formatTime(Date.now())}`;
        tell('');
        if (changed) notify();
        return true;
      } catch {
        if (!sameActor(actorId)) return false;
        updated.textContent = '갱신 실패';
        if (!hasLoaded && !tasks.size) list.replaceChildren(make('li', 'work-placeholder', '작업 기록을 확인하지 못했어요. 목록을 새로고침해 주세요.'));
        tell(hasLoaded || tasks.size ? '작업 상태를 불러오지 못했어요. 마지막으로 확인한 기록을 표시합니다.' : '작업 상태를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.');
        return false;
      }
    }

    function refresh({ fresh = false } = {}) {
      const current = actor();
      if (!current) return Promise.resolve(false);
      if (refreshPromise) {
        // A reply may finish while polling is in flight. Read once more after
        // that snapshot so its newly submitted task is included immediately.
        if (fresh) refreshAgain = true;
        return refreshPromise;
      }
      refreshButton.disabled = true;
      refreshPromise = (async () => {
        let result = false;
        do {
          refreshAgain = false;
          result = await loadSnapshot(current.id);
        } while (refreshAgain && sameActor(current.id));
        return result;
      })().finally(() => {
        refreshPromise = null;
        if (sameActor(current.id)) refreshButton.disabled = false;
      });
      return refreshPromise;
    }

    function renderBadge(message) {
      if (!actor() || message.sender_kind !== 'human' || message.room !== 'hq' || !UUID.test(message.id || '')) return null;
      const existing = tasks.get(message.id);
      if (!existing) return null;
      const row = make('div', 'message-task-status');
      const [label, state] = stateOf(existing);
      row.append(make('span', `task-status is-${state}`, `실제 작업 · ${label}`));
      return row;
    }

    function stop() {
      stopped = true;
      refreshAgain = false;
      tasks.clear();
      list.replaceChildren();
      tell('');
      refreshButton.disabled = true;
    }

    refreshButton.addEventListener('click', () => refresh({ fresh: true }));
    return { refresh, renderBadge, stop, get revision() { return revision; } };
  }

  window.OjjudaMeetingTasks = Object.freeze({ create, stateOf, evidenceUrl });
})();
