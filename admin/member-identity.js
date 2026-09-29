/* Admin identity controls. Normal reads contain only a masked contact number. */
(function (root) {
  'use strict';
  const fieldNames = { birth_date: '생년월일', gender: '성별', phone_number: '전화번호' };
  function element(tag, text, className = '') {
    const value = document.createElement(tag);
    if (text) value.textContent = text;
    value.className = className;
    return value;
  }
  function errorMessage(error) {
    const message = String(error?.message || '');
    if (/not_admin|not_signed_in|permission denied/.test(message)) return '관리자 권한을 확인해 주세요.';
    if (/invalid_phone_number/.test(message)) return '전화번호를 확인해 주세요.';
    if (/phone_already_registered|member_identity_phone_number_key/.test(message)) return '다른 회원이 이미 사용 중인 전화번호예요.';
    if (/invalid_birth_date/.test(message)) return '생년월일을 확인해 주세요. 가입일 이후의 생일은 저장할 수 없어요.';
    if (/invalid_gender/.test(message)) return '성별을 선택해 주세요.';
    if (/emergency_reason_required/.test(message)) return '긴급 사유를 5~200자로 입력해 주세요.';
    if (/member_identity_required/.test(message)) return '아직 등록된 전화번호가 없어요.';
    return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
  function modal(options, title) {
    const actor = options.getAdminId();
    if (!actor) return null;
    options.renderModal('<div class="mhead"><h3 id="admin-identity-title"></h3><button class="btn sm ghost" data-act="close" type="button">닫기</button></div><div id="admin-identity-body"></div>', title);
    const body = document.getElementById('admin-identity-body');
    document.getElementById('admin-identity-title').textContent = `${options.nickname}님 ${title}`;
    let valid = true;
    const current = () => valid && body.isConnected && options.getAdminId() === actor;
    const { data } = options.client.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id !== actor) { valid = false; body.replaceChildren(element('p', '로그인 상태가 바뀌었어요. 다시 열어 주세요.', 'note')); }
    });
    const observer = new MutationObserver(() => {
      if (!body.isConnected) { data.subscription.unsubscribe(); observer.disconnect(); }
    });
    observer.observe(document.getElementById('modal-root'), { childList: true });
    return { body, current };
  }
  async function open(options) {
    const view = modal(options, '회원정보 수정');
    if (!view) return;
    const { body, current } = view;
    body.append(element('p', '회원정보를 불러오고 있어요.', 'note'));
    try {
      const result = await options.client.rpc('admin_get_member_identity', { p_user: options.userId });
      if (result.error) throw result.error;
      if (!current()) return;
      let info = result.data;
      body.replaceChildren();
      const form = element('form', '', 'member-identity-fields');
      form.innerHTML = '<div class="field"><label for="admin-member-birth">생년월일</label><input id="admin-member-birth" type="date" min="1900-01-01" required></div><div class="field"><label for="admin-member-gender">성별</label><select class="inp" id="admin-member-gender" required><option value="">선택</option><option value="male">남성</option><option value="female">여성</option></select></div><p class="note" id="admin-member-age"></p><div class="field"><label>현재 전화번호</label><p id="admin-member-masked"></p></div><div class="field"><label for="admin-member-phone">변경할 전화번호</label><input id="admin-member-phone" type="tel" inputmode="tel" autocomplete="off" maxlength="20" placeholder="변경할 때만 입력"></div><p class="note">전화번호 가운데 4자리는 평소에 표시하지 않아요. 전체 번호는 가입자 목록의 긴급 버튼에서 사유를 기록한 뒤 확인할 수 있어요.</p><p class="note" id="admin-member-message" role="status" aria-live="polite"></p><div class="mfoot"><button type="submit" class="btn pri">회원정보 저장</button></div>';
      const birth = form.querySelector('#admin-member-birth'), gender = form.querySelector('#admin-member-gender');
      const phone = form.querySelector('#admin-member-phone'), masked = form.querySelector('#admin-member-masked');
      const age = form.querySelector('#admin-member-age'), message = form.querySelector('#admin-member-message');
      const save = form.querySelector('button[type="submit"]');
      birth.max = root.OjjudaIdentity.todayKorea();
      function renderSaved() {
        birth.value = info.birth_date || ''; gender.value = info.gender || '';
        masked.textContent = info.phone_masked || '등록된 전화번호가 없어요.';
        phone.value = ''; phone.required = !info.registered;
        phone.placeholder = info.registered ? '변경할 때만 입력' : '010-0000-0000';
        age.textContent = info.registered ? `현재 만 ${info.age}세 · 가입 당시 만 ${info.age_at_signup}세` : '회원정보를 아직 등록하지 않았어요.';
      }
      renderSaved(); body.append(form);
      let busy = false;
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy || !current()) return;
        let nextPhone = null;
        try { if (phone.value.trim()) nextPhone = root.OjjudaIdentity.normalizePhone(phone.value); }
        catch (error) { message.textContent = error.message; return; }
        busy = true; save.disabled = true; message.textContent = '';
        const values = { p_user: options.userId, p_birth_date: birth.value, p_gender: gender.value, p_phone: nextPhone };
        birth.disabled = gender.disabled = phone.disabled = true;
        try {
          const saved = await options.client.rpc('admin_update_member_identity', values);
          if (saved.error) throw saved.error;
          if (!current()) return;
          info = saved.data; renderSaved(); message.textContent = '회원정보를 저장했어요.';
          options.onSaved?.();
        } catch (error) { if (current()) message.textContent = errorMessage(error); }
        finally { if (current()) { busy = false; save.disabled = birth.disabled = gender.disabled = phone.disabled = false; } }
      });
    } catch (error) { if (current()) body.replaceChildren(element('p', errorMessage(error), 'note')); }
  }
  function emergency(options) {
    const view = modal(options, '긴급 연락처 확인');
    if (!view) return;
    const { body, current } = view;
    const form = element('form', '', 'member-identity-fields');
    form.innerHTML = '<p class="note">긴급한 연락이 꼭 필요한 경우에만 확인해 주세요. 조회한 관리자·회원·시간·사유를 기록합니다.</p><div class="field"><label for="admin-emergency-reason">긴급 사유</label><textarea class="inp" id="admin-emergency-reason" rows="3" minlength="5" maxlength="200" placeholder="긴급 연락이 필요한 사유를 적어 주세요." required></textarea></div><p class="note" role="status" aria-live="polite"></p><div class="mfoot"><button class="btn pri" type="submit">사유 기록 후 전화번호 확인</button></div>';
    const reason = form.querySelector('textarea'), save = form.querySelector('button'), message = form.querySelector('[role="status"]');
    body.append(form); reason.focus();
    let busy = false;
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || !current()) return;
      const why = reason.value.trim();
      if (why.length < 5) { message.textContent = '긴급 사유를 5~200자로 입력해 주세요.'; return; }
      busy = true; save.disabled = true; reason.disabled = true; message.textContent = '';
      try {
        const result = await options.client.rpc('admin_reveal_member_phone', { p_user: options.userId, p_reason: why });
        if (result.error) throw result.error;
        if (!current()) return;
        const number = element('strong', result.data.phone_number);
        number.style.fontSize = '24px';
        body.replaceChildren(number, element('p', '긴급 조회가 기록됐어요. 전체 번호는 1분 뒤 다시 숨겨집니다.', 'note'));
        options.onSaved?.();
        setTimeout(() => {
          number.textContent = '';
          if (current()) body.replaceChildren(element('p', '전화번호를 다시 숨겼어요. 필요하면 긴급 버튼에서 다시 확인해 주세요.', 'note'));
        }, 60000);
      } catch (error) {
        if (current()) { message.textContent = errorMessage(error); busy = false; save.disabled = reason.disabled = false; }
      }
    });
  }
  root.OjjudaAdminIdentity = { open, emergency, fieldNames };
})(window);
