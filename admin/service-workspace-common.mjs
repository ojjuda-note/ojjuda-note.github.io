function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(label, action) {
  const value = element('button', label, 'btn');
  value.type = 'button'; value.addEventListener('click', action);
  return value;
}
async function read(query) {
  const {data, error} = await query;
  if (error) throw error;
  return data;
}

export function memberActions(ctx, record) {
  const {client, rpc, mutate, renderModal, getAdminId, refresh, owner, area} = ctx;
  const controls = element('div', null, 'admin-controls'), name = record.nickname || '회원';
  const identity = {client, renderModal, userId:record.id, nickname:name, getAdminId, onSaved:refresh};
  controls.append(button('쭈 수정', () => {
    const input = window.prompt(name + '님에게 지급할 쭈를 입력하세요. 차감은 음수로 입력하세요.');
    if (input === null) return;
    const amount = Number(input), balance = Number(record.coins || 0);
    if (!Number.isSafeInteger(amount) || !amount || Math.abs(amount) > 1000000 || balance + amount < 0) {
      window.alert('보유 잔액 범위에서 1~1,000,000쭈를 입력해 주세요.'); return;
    }
    const reason = window.prompt('작업 기록에 남길 사유를 입력하세요 (2~60자).')?.trim();
    if (!reason || reason.length < 2 || reason.length > 60) return;
    if (window.confirm(name + '님의 쭈를 ' + amount.toLocaleString('ko-KR') + '만큼 변경할까요?')) {
      void mutate(() => rpc('admin_adjust_coins', {p_user:record.id, p_delta:amount, p_reason:reason}));
    }
  }));
  if (area !== 'payment') {
    controls.append(button('닉네임 변경', () => {
      const nick = window.prompt('새 닉네임을 입력하세요.', name)?.trim();
      if (nick && nick !== name && [...nick].length <= 12) void mutate(() => rpc('admin_rename_user', {p_user:record.id, p_nick:nick}));
    }), button('회원정보 수정', () => window.OjjudaAdminIdentity.open(identity)),
    button('긴급 연락처', () => window.OjjudaAdminIdentity.emergency(identity)));
    if (record.id !== owner) {
      const label = record.is_admin ? '관리자 권한 해제' : '관리자 권한 부여';
      controls.append(button(label, () => {
        if (window.confirm(name + '님에게 ' + label + '를 적용할까요?')) void mutate(() => rpc('admin_set_admin', {p_user:record.id, p_on:!record.is_admin}));
      }));
    }
  }
  return controls;
}

export function renderCommon({client, container, rpc, mutate, isCurrent, tab, choose}) {
  const labels = {overview:'운영 요약', errors:'오류 현황', settings:'첫 방문·무료 충전 설정', words:'금칙어'};
  const heading = element('h2', labels[tab]), body = element('div'), status = element('p');
  status.setAttribute('role','status');
  container.replaceChildren(heading, status, body);
  let run = 0;
  function numberForm(parent, label, value, max, save) {
    const form = element('form', null, 'admin-controls'), input = element('input'), caption = element('label', label);
    input.type = 'number'; input.required = true; input.min = '0'; input.max = String(max);
    input.value = input.defaultValue = String(value ?? ''); caption.append(input);
    form.append(caption, element('button', '저장'));
    form.addEventListener('submit', event => { event.preventDefault(); if (form.reportValidity()) void mutate(() => save(input.valueAsNumber)); });
    parent.append(form);
  }
  async function overview(panel) {
    const [account, notes, logs] = await Promise.all([rpc('admin_overview'), read(client.schema('ojjuda_note').rpc('admin_overview')), rpc('admin_log_list', {p_limit:20})]);
    const counts = {...account, reports_open:Number(account.reports_open || 0) + Number(notes?.open_reports || 0)};
    for (const [key,label,target] of [['users','이용 계정','users'],['users_today','오늘 가입','users'],['reports_open','미처리 신고','reports'],['feedback_open','새 의견','feedback'],['errors_24h','24시간 오류','errors'],['charges_today','오늘 충전 횟수','settings'],['banned','정지 계정','suspended']]) {
      panel.append(button(label + ' ' + Number(counts[key] || 0).toLocaleString('ko-KR'), () => choose(target)));
    }
    panel.append(element('h3','최근 관리자 기록'));
    for (const log of logs || []) panel.append(element('p', [log.created_at, log.admin_nick, log.action, log.target_nick, log.reason].filter(Boolean).join(' · ')));
    panel.append(button('전체 기록', () => choose('activity')));
  }
  async function errors(panel) {
    const records = await rpc('admin_errors');
    if (!records?.length) panel.append(element('p','오류 기록이 없어요.'));
    for (const entry of records || []) {
      const item = element('details');
      item.append(element('summary',entry.message), element('p',[entry.created_at,entry.nickname,entry.screen,entry.app_version].filter(Boolean).join(' · ')),
        element('pre',entry.stack), element('small',entry.user_agent));
      panel.append(item);
    }
  }
  async function settings(panel) {
    const rows = await read(client.from('app_config').select('key,value'));
    const config = Object.fromEntries(rows.map(row => [row.key,row.value]));
    numberForm(panel, '첫 방문 선물 (쭈)', config.first_visit_ju, 1000000, amount => rpc('admin_set_first_visit_ju',{p_amount:amount}));
    const free = config.beta_free_charge !== false;
    panel.append(element('p','무료 충전 ' + (free ? '사용 중' : '중지됨')), button(free ? '무료 충전 끄기' : '무료 충전 켜기', () => {
      if (window.confirm('무료 충전 설정을 변경할까요?')) void mutate(() => rpc('admin_set_config',{cfg_key:'beta_free_charge',cfg_value:!free}));
    }));
    numberForm(panel, '1인 하루 충전 횟수', config.beta_charge_daily_limit ?? 5, 100, amount => rpc('admin_set_config',{cfg_key:'beta_charge_daily_limit',cfg_value:amount}));
  }
  async function words(panel) {
    const [added, exceptions, base] = await Promise.all([
      read(client.from('banned_words').select('word,category').order('category').order('word')),
      read(client.from('banned_allow').select('phrase').order('phrase')), read(client.from('banned_base').select('word,active').order('word'))]);
    const categories = {profanity:'욕설', sexual:'음란', drugs:'마약', etc:'기타'};
    const category = element('select'); category.setAttribute('aria-label','금칙어 분류');
    for (const [id,name] of Object.entries(categories)) category.add(new Option(name,id));
    function form(label, max, action, extra) {
      const form = element('form', null, 'admin-controls'), field = element('input'), caption = element('label',label);
      field.required = true; field.maxLength = max; caption.append(field); form.append(caption);
      if (extra) form.append(extra);
      form.append(element('button',label));
      form.addEventListener('submit', e => {e.preventDefault(); const text=field.value.trim(); if(text) action(text);});
      panel.append(form);
    }
    const preview = element('output');
    form('문장 검사',80,text => {preview.textContent=window.OjjudaWordMask.maskText(text, {
      words:added.map(r=>r.word).concat(base.filter(r=>r.active).map(r=>r.word)),allow:exceptions.map(r=>r.phrase)});});
    panel.append(preview);
    form('금칙어 추가',30,word => void mutate(() => rpc('admin_banned_add',{p_word:word,p_category:category.value})),category);
    form('예외 단어 추가',40,phrase => void mutate(() => rpc('admin_allow_add',{p_phrase:phrase})));
    for (const [name, rows, label, action] of [
      ['추가한 금칙어',added,r=>r.word + ' · ' + (categories[r.category] || '기타') + ' 삭제',r=>rpc('admin_banned_remove',{p_word:r.word})],
      ['기본 금칙어',base,r=>r.word + (r.active?' 끄기':' 켜기'),r=>rpc('admin_base_toggle',{p_word:r.word,p_active:!r.active})],
      ['예외 단어',exceptions,r=>r.phrase+' 삭제',r=>rpc('admin_allow_remove',{p_phrase:r.phrase})]]) {
      const group=element('details'), list=element('div',null,'admin-controls');
      group.append(element('summary',name+' ('+rows.length+')'),list); panel.append(group);
      for(const row of rows) list.append(button(label(row),()=>void mutate(()=>action(row))));
    }
  }
  async function refresh() {
    const ticket=++run, fragment=document.createDocumentFragment();
    status.textContent='불러오는 중이에요.';
    try {
      await ({overview,errors,settings,words})[tab](fragment);
      if(isCurrent() && ticket===run){ body.replaceChildren(fragment);status.textContent=''; }
    } catch {
      if(isCurrent() && ticket===run) status.replaceChildren('불러오지 못했어요. ',button('다시 확인',refresh));
    }
  }
  void refresh();
  return {refresh, destroy(){++run;}, hasDraft:()=>[...body.querySelectorAll('input')].some(field=>field.value!==field.defaultValue)};
}
