(() => {
  'use strict';
  const KINDS = { bug: '오류 수정', idea: '기능 개선' };
  const STATES = {
    queued: ['접수됨 · 실행 대기', 'queued'], running: ['작업 중', 'running'],
    needs_review: ['검토 필요', 'review'], blocked: ['작업 중단', 'blocked'],
    resolved: ['완료', 'resolved']
  };
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const REJECTIONS = {
    executor_unavailable: '작업 실행기 연결이 준비되지 않아 접수하지 못했어요. 연결 상태를 확인한 뒤 다시 실행해 주세요.',
    invalid_task_content: '실제 작업은 2,000자 이내의 메시지 본문이 필요해요. 첨부파일 내용은 직접 적어 주세요.',
    task_kind_conflict: '이미 다른 종류로 접수한 메시지예요. 기존 작업 종류로 다시 확인하거나 작업 목록을 새로고침해 주세요.',
    invalid_task_kind: '작업 종류를 다시 선택해 주세요.',
    message_not_found: '실행할 내 메시지를 확인하지 못했어요. 대화를 새로고침한 뒤 다시 확인해 주세요.'
  };

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
    const tasks = new Map(), pending = new Map(), rejections = new Map(), choices = new Map();
    let stopped = false, loading = false, revision = 0, hasLoaded = false;
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
        list.replaceChildren(make('li', 'work-placeholder', '아직 실행한 작업이 없습니다. 내 메시지 아래에서 실제 작업을 실행해 보세요.'));
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

    async function refresh() {
      const current = actor();
      if (!current || loading) return false;
      const startedAtRevision = revision;
      loading = true;
      refreshButton.disabled = true;
      try {
        const { data, error } = await client.rpc('admin_ai_meeting_tasks', { p_limit: 30 });
        if (!sameActor(current.id)) return false;
        if (error) {
          if (authError(error)) { onAuthLost(); return false; }
          throw error;
        }
        if (!Array.isArray(data)) throw new Error('invalid_tasks');
        // A list read started before a successful submission must not hide that
        // newly accepted task with an older server snapshot.
        if (revision !== startedAtRevision) return false;
        const previous = JSON.stringify([...tasks.values()]);
        tasks.clear();
        for (const task of data) {
          if (!UUID.test(task?.message_id || '') || !task?.feedback_id) continue;
          tasks.set(task.message_id, task);
          pending.delete(task.message_id);
          rejections.delete(task.message_id);
        }
        const changed = previous !== JSON.stringify([...tasks.values()]);
        if (changed || !hasLoaded) render();
        hasLoaded = true;
        updated.textContent = `최종 조회 ${formatTime(Date.now())}`;
        tell('');
        if (changed) notify();
        return true;
      } catch {
        if (!sameActor(current.id)) return false;
        updated.textContent = '갱신 실패';
        if (!hasLoaded && !tasks.size) list.replaceChildren(make('li', 'work-placeholder', '작업 기록을 확인하지 못했어요. 목록을 새로고침해 주세요.'));
        tell(hasLoaded || tasks.size ? '작업 상태를 불러오지 못했어요. 마지막으로 확인한 기록을 표시합니다.' : '작업 상태를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.');
        return false;
      } finally {
        loading = false;
        if (sameActor(current.id)) refreshButton.disabled = false;
      }
    }

    function eligible(message) {
      return actor() && message.created_by === actor().id && message.sender_kind === 'human' &&
        message.sender_role === 'representative' && message.room === 'hq' && UUID.test(message.id || '');
    }

    async function submit(message, kind) {
      const current = actor();
      if (!current || !eligible(message) || !KINDS[kind] || tasks.has(message.id)) return;
      const prior = pending.get(message.id);
      if (prior?.sending || (prior && prior.kind !== kind)) return;
      const content = typeof message.content === 'string' ? message.content.trim() : '';
      if (!content || content.length > 2000 || (message.file_path && content === '첨부파일을 공유했어요.')) return;
      pending.set(message.id, { kind, sending: true });
      rejections.delete(message.id);
      notify();
      tell('작업 접수를 확인하고 있어요.');
      try {
        const { data, error } = await client.rpc('admin_ai_meeting_create_task', { p_message_id: message.id, p_kind: kind });
        if (!sameActor(current.id)) return;
        if (error) {
          if (authError(error)) { onAuthLost(); return; }
          throw error;
        }
        const task = Array.isArray(data) ? data[0] : data;
        if (!task || task.message_id !== message.id || !task.feedback_id) throw new Error('unconfirmed_task');
        tasks.set(message.id, task);
        pending.delete(message.id);
        render();
        notify();
        tell('작업이 접수됐어요. 실제 작업 목록에서 진행 상황을 확인하세요.');
      } catch (error) {
        if (!sameActor(current.id)) return;
        const rejected = Object.entries(REJECTIONS).find(([code]) => String(error?.message || '').includes(code));
        if (rejected) {
          pending.delete(message.id);
          rejections.set(message.id, rejected[1]);
          notify();
          await refresh();
          if (sameActor(current.id)) tell(rejected[1]);
          return;
        }
        pending.set(message.id, { kind, sending: false });
        notify();
        tell('접수 여부를 아직 확인하지 못했어요. 같은 메시지에서 다시 확인하면 중복 접수되지 않습니다.');
        await refresh();
      }
    }

    function renderAction(message) {
      if (!eligible(message)) return null;
      const row = make('div', 'message-task-actions');
      const existing = tasks.get(message.id);
      if (existing) {
        const [label, state] = stateOf(existing);
        row.append(make('span', `task-status is-${state}`, `실제 작업 · ${label}`));
        return row;
      }
      const content = typeof message.content === 'string' ? message.content.trim() : '';
      if (!content || (message.file_path && content === '첨부파일을 공유했어요.')) return null;
      if (content.length > 2000) {
        row.append(make('span', 'task-action-note', '실제 작업으로 실행하려면 요청을 2,000자 이내로 다시 작성해 주세요.'));
        return row;
      }
      const previous = pending.get(message.id);
      const select = make('select', 'task-kind-select');
      select.setAttribute('aria-label', '실행할 작업 종류');
      for (const [value, label] of Object.entries(KINDS)) {
        const option = make('option', '', label);
        option.value = value;
        select.append(option);
      }
      select.value = previous?.kind || choices.get(message.id) || 'bug';
      select.disabled = !!previous;
      select.addEventListener('change', () => { if (KINDS[select.value]) choices.set(message.id, select.value); });
      const button = make('button', 'task-execute', previous?.sending ? '접수 확인 중…' : previous ? '같은 작업 다시 확인' : '실제 작업 실행');
      button.type = 'button';
      button.disabled = !!previous?.sending;
      button.addEventListener('click', () => submit(message, select.value));
      const rejection = rejections.get(message.id);
      row.append(select, button, make('span', rejection ? 'task-action-note task-error' : 'task-action-note', rejection || (message.file_path
        ? '이 메시지 본문으로 코드 수정을 실행합니다. 첨부파일 내용은 전달되지 않습니다.'
        : '이 메시지 내용으로 사이트 코드를 수정하고 검증·배포합니다.')));
      return row;
    }

    function stop() {
      stopped = true;
      tasks.clear();
      pending.clear();
      rejections.clear();
      choices.clear();
      list.replaceChildren();
      tell('');
      refreshButton.disabled = true;
    }

    refreshButton.addEventListener('click', refresh);
    return { refresh, renderAction, stop, get revision() { return revision; } };
  }

  window.OjjudaMeetingTasks = Object.freeze({ create, stateOf, evidenceUrl });
})();
