(() => {
  'use strict';
  const LABELS = {
    representative: ['대표', '대'], director: ['AI 총괄본부장', '본'], growth: ['회원성장 AI', '성'],
    marketing: ['마케팅 AI', '마'], quality: ['품질안정 AI', '품'], ux: ['UX AI', 'U'],
    platform: ['플랫폼운영 AI', '플'], design: ['디자인 AI', '디']
  };
  const ACCEPTED = new Set(['image/jpeg', 'image/png', 'application/pdf', 'text/plain']);
  const BUCKET = 'ai-meeting-files';
  const $ = id => document.getElementById(id);
  const ui = {
    guard: $('guard'), room: $('room'), messages: $('messages'), feedback: $('feedback'),
    target: $('target'), text: $('message'), file: $('file'), filePreview: $('file-preview'),
    send: $('send'), retryBox: $('retry-box'), retry: $('retry'), refresh: $('refresh')
  };
  const config = window.OJJUDA_CONFIG;
  let client, user, busy = false, loading = false, polling = null, signature = '', retryId = null;

  const tell = message => { ui.feedback.textContent = message || ''; };
  const guard = message => { ui.room.hidden = true; ui.guard.hidden = false; ui.guard.textContent = message; };
  const formatTime = date => new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(new Date(date));

  function make(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function retryVisibility(id) {
    retryId = id;
    ui.retryBox.hidden = !id;
  }

  function filePreview() {
    const file = ui.file.files?.[0];
    ui.filePreview.hidden = !file;
    ui.filePreview.replaceChildren();
    if (!file) return;
    ui.filePreview.append(make('span', '', `첨부 예정: ${file.name} · ${(file.size / 1024 / 1024).toFixed(1)}MB`));
    const remove = make('button', '', '제거');
    remove.type = 'button';
    remove.addEventListener('click', () => { ui.file.value = ''; filePreview(); });
    ui.filePreview.append(remove);
  }

  async function downloadAttachment(path) {
    const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { tell('첨부파일을 열지 못했어요. 다시 시도해 주세요.'); return; }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  function renderMessage(message) {
    const human = message.sender_kind === 'human';
    const role = LABELS[message.sender_role] || ['AI 담당자', 'AI'];
    const row = make('article', `message-row${human ? ' human' : ''}`);
    const avatar = make('span', `avatar ${human ? 'representative' : message.sender_role}`, role[1]);
    avatar.setAttribute('aria-hidden', 'true');
    const body = make('div', 'message-body');
    const meta = make('div', 'message-meta');
    meta.append(make('span', 'message-name', role[0]));
    meta.append(make('time', 'message-time', formatTime(message.created_at)));
    const bubble = make('div', 'bubble', message.content);
    body.append(meta, bubble);
    if (message.file_path && message.file_name) {
      const link = make('button', 'file-link', `📎 ${message.file_name}`);
      link.type = 'button';
      link.addEventListener('click', () => downloadAttachment(message.file_path));
      body.append(link);
    }
    row.append(avatar, body);
    return row;
  }

  async function loadMessages() {
    if (!user || loading) return;
    loading = true;
    try {
      const { data, error } = await client.from('ai_meeting_messages')
        .select('id,created_at,sender_kind,sender_role,content,file_name,file_path')
        .eq('room', 'hq').order('created_at', { ascending: false }).limit(80);
      if (error) throw error;
      const rows = (data || []).reverse();
      const next = rows.map(item => item.id).join(',');
      if (next === signature) return;
      const atBottom = ui.messages.scrollHeight - ui.messages.scrollTop - ui.messages.clientHeight < 130;
      signature = next;
      if (!rows.length) {
        ui.messages.replaceChildren(make('div', 'empty', '첫 회의를 시작해 보세요.\nAI 본부장이 관련 담당자의 의견을 모아 답변합니다.'));
      } else {
        ui.messages.replaceChildren(...rows.map(renderMessage));
      }
      if (atBottom || rows.length <= 3) ui.messages.scrollTop = ui.messages.scrollHeight;
    } catch {
      tell('대화 기록을 불러오지 못했어요. 잠시 후 새로고침해 주세요.');
    } finally { loading = false; }
  }

  function friendlyError(code) {
    if (code === 'ai_not_configured') return '서버의 AI 연결 설정이 아직 완료되지 않았어요.';
    if (code === 'rate_limited') return '요청이 많아요. 잠시 뒤 다시 시도해 주세요.';
    if (code === 'message_expired') return '오래된 메시지는 재요청할 수 없어요. 새 메시지로 보내 주세요.';
    if (code === 'not_admin' || code === 'not_signed_in') return '관리자 인증이 필요해요. 다시 로그인해 주세요.';
    return 'AI 답변을 받지 못했어요. 잠시 뒤 다시 시도해 주세요.';
  }

  async function askAi(id) {
    const { data, error } = await client.functions.invoke('ai-meeting', { body: { message_id: id } });
    if (error || !data?.ok) {
      let payload = data;
      if (!payload && error?.context?.json) {
        try { payload = await error.context.json(); } catch { /* no details */ }
      }
      throw new Error(friendlyError(payload?.error));
    }
  }

  async function requestReply(id) {
    ui.send.disabled = true;
    ui.send.textContent = 'AI 답변 기다리는 중…';
    try {
      await askAi(id);
      retryVisibility(null);
      tell('');
      await loadMessages();
    } catch (error) {
      retryVisibility(id);
      tell(error.message || 'AI 응답을 확인하지 못했어요.');
    } finally {
      ui.send.disabled = false;
      ui.send.textContent = '회의에 보내기 ↗';
    }
  }

  async function send() {
    if (!user || busy) return;
    const content = ui.text.value.trim();
    const file = ui.file.files?.[0];
    if (!content && !file) { tell('메시지나 파일을 입력해 주세요.'); ui.text.focus(); return; }
    if (content.length > 4000) { tell('메시지는 4,000자 이내로 작성해 주세요.'); return; }
    if (file && (!ACCEPTED.has(file.type) || file.size > 8388608)) {
      tell('PDF, TXT, JPG, PNG 파일만 8MB 이내로 첨부할 수 있어요.'); return;
    }
    busy = true;
    ui.send.disabled = true;
    ui.send.textContent = '전송 중…';
    tell('');
    retryVisibility(null);
    let uploadedPath = null;
    let savedMessageId = null;
    try {
      let safeName = null;
      if (file) {
        safeName = file.name.normalize('NFKC').replace(/[^0-9A-Za-z가-힣._-]/g, '_').slice(-80) || 'attachment';
        uploadedPath = `${user.id}/${crypto.randomUUID()}_${safeName}`;
        const result = await client.storage.from(BUCKET).upload(uploadedPath, file, {
          contentType: file.type, upsert: false, cacheControl: '3600'
        });
        if (result.error) throw new Error('파일을 올리지 못했어요. 다시 시도해 주세요.');
      }
      const { data, error } = await client.from('ai_meeting_messages').insert({
        room: 'hq', created_by: user.id, sender_kind: 'human', sender_role: 'representative',
        target_role: ui.target.value, content: content || '첨부파일을 공유했어요.',
        file_path: uploadedPath, file_name: safeName
      }).select('id').single();
      if (error || !data?.id) throw new Error('메시지를 저장하지 못했어요. 다시 시도해 주세요.');
      savedMessageId = data.id;
      ui.text.value = '';
      ui.file.value = '';
      filePreview();
      await loadMessages();
      await requestReply(savedMessageId);
    } catch (error) {
      if (uploadedPath && !savedMessageId) await client.storage.from(BUCKET).remove([uploadedPath]).catch(() => {});
      tell(error.message || '전송 중 문제가 생겼어요.');
    } finally {
      busy = false;
      ui.send.disabled = false;
      ui.send.textContent = '회의에 보내기 ↗';
    }
  }

  async function initialize() {
    if (!config?.supabaseUrl || !config?.supabaseKey || !window.supabase?.createClient) {
      guard('연결 설정을 확인할 수 없어요. 잠시 후 다시 열어 주세요.'); return;
    }
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
    try {
      const auth = await client.auth.getUser();
      if (auth.error || !auth.data?.user) { guard('로그인 후 관리자 계정으로 열어 주세요.'); return; }
      const role = await client.from('app_admins').select('user_id').eq('user_id', auth.data.user.id).maybeSingle();
      if (role.error) { guard('관리자 권한을 확인하지 못했어요.'); return; }
      if (!role.data) { guard('관리자만 이용할 수 있는 회의실입니다.'); return; }
      user = auth.data.user;
      ui.guard.hidden = true;
      ui.room.hidden = false;
      await loadMessages();
      polling = setInterval(() => { if (!document.hidden) loadMessages(); }, 6500);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) loadMessages(); });
      client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') { user = null; if (polling) clearInterval(polling); guard('로그아웃되었습니다. 다시 로그인해 주세요.'); }
      });
    } catch { guard('회의실을 열지 못했어요. 잠시 후 다시 시도해 주세요.'); }
  }

  ui.file.addEventListener('change', filePreview);
  ui.send.addEventListener('click', send);
  ui.refresh.addEventListener('click', loadMessages);
  ui.retry.addEventListener('click', async () => {
    if (!retryId || busy) return;
    const id = retryId;
    busy = true;
    try { await requestReply(id); }
    finally { busy = false; }
  });
  ui.text.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault(); send();
    }
  });
  initialize();
})();
