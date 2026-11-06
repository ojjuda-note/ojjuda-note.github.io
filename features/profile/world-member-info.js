(function () {
  'use strict';
  let active = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  async function open(options) {
    const { client, getUserId, email, renderModal, closeModal, onSupport, entry = false, onSaved } = options;
    const owner = getUserId();
    if (!owner || !client || !window.OjjudaIdentity) return;
    active?.dispose();
    const title = entry ? '기본정보를 입력해 주세요' : '개인정보 수정';
    renderModal(`<div class="mhead"><h3>${title}</h3><button class="btn sm ghost" data-act="close">닫기</button></div><div id="world-member-info"><p role="status">개인정보를 불러오고 있어요.</p></div>`, title);
    const root = document.getElementById('world-member-info');
    const observer = new MutationObserver(() => {
      if (getUserId() !== owner) {
        if (root.isConnected) closeModal();
        dispose();
      } else if (!root.isConnected) dispose();
    });
    const dispose = () => { observer.disconnect(); if (active?.root === root) active = null; };
    active = { root, dispose };
    observer.observe(document.body, { childList: true, subtree: true });
    const current = () => active?.root === root && root.isConnected && getUserId() === owner;
    const errorMessage = error => /phone_already_registered|member_identity_phone_number_key/.test(error?.message || '')
      ? '이미 가입된 전화번호예요. 다른 번호를 입력해 주세요.'
      : /invalid_phone_number/.test(error?.message || '') ? '전화번호를 확인해 주세요.'
      : /identity_locked/.test(error?.message || '') ? '이미 등록된 정보예요. 창을 다시 열어 확인해 주세요.'
      : '저장하지 못했어요. 입력한 내용은 그대로 있으니 다시 시도해 주세요.';
    try {
      const result = Object.hasOwn(options, 'identity') ? { data: options.identity } : await client.rpc('get_my_member_identity');
      if (!current()) return;
      if (result.error) throw result.error;
      const identity = result.data;
      root.innerHTML = `${entry ? '<p>아직 등록하지 않은 기본정보가 있어요. 아래 빈칸을 채워 주세요.</p>' : ''}<p class="note">생년월일·전화번호와 로그인 이메일은 다른 회원에게 공개되지 않아요.</p>
        <div class="field"><label for="wm-email">로그인 이메일</label><input class="inp" id="wm-email" type="email" value="${escape(email)}" readonly></div>
        <form id="world-member-form">
        ${identity ? `<div class="field"><label for="wm-birth-date">생년월일</label><input class="inp" id="wm-birth-date" value="${escape(identity.birth_date)}" readonly></div>
          <div class="field"><label for="wm-gender">성별</label><input class="inp" id="wm-gender" value="${identity.gender === 'male' ? '남성' : identity.gender === 'female' ? '여성' : '미등록'}" readonly></div>
          <p class="note">생년월일·성별을 잘못 입력하셨다면 정정 문의를 보내 주세요.</p>
          <button class="btn sm" type="button" id="wm-correction">생년월일·성별 정정 문의</button>
          <div class="field" style="margin-top:16px"><label for="wm-phone">전화번호</label><input class="inp" id="wm-phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" required value="${escape(identity.phone_number)}" placeholder="010-0000-0000"></div>`
          : `${window.OjjudaIdentity.fields('wm')}<label class="chk"><input id="wm-consent" type="checkbox" required> 생년월일·성별·전화번호의 비공개 저장과 회원정보 관리 목적 이용에 동의해요.</label><p><a href="/privacy.html" target="_blank" rel="noopener">개인정보처리방침</a></p>`}
        <p id="wm-message" role="status" aria-live="polite"></p>
        <div class="mfoot"><button class="btn" type="button" data-act="close">닫기</button><button class="btn pri" type="submit">${identity ? '전화번호 저장' : '개인정보 등록'}</button></div></form>`;
      const form = root.querySelector('form'), message = root.querySelector('#wm-message');
      if (!identity) form.querySelector('[data-identity-prefix]').dataset.existingMember = 'true';
      root.querySelector('#wm-correction')?.addEventListener('click', () => {
        if (!current()) return;
        closeModal(); onSupport();
      });
      let busy = false;
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || !current()) return;
        let params;
        try {
          if (identity) params = { p_phone: window.OjjudaIdentity.normalizePhone(form.querySelector('#wm-phone').value) };
          else {
            if (!form.querySelector('#wm-consent').checked) { message.textContent = '개인정보 저장에 동의해 주세요.'; return; }
            const value = window.OjjudaIdentity.read(form, 'wm', false);
            params = { p_birth_six: value.birthSix, p_gender_code: value.genderCode, p_phone: value.phone, p_consent: true };
          }
        } catch (error) { message.textContent = error.message; return; }
        busy = true;
        form.setAttribute('aria-busy', 'true');
        const controls = [...form.querySelectorAll('input,button')];
        controls.forEach(control => { control.disabled = true; });
        message.textContent = '저장하고 있어요.';
        try {
          const saved = await client.rpc(identity ? 'update_my_phone_number' : 'complete_my_member_identity', params);
          if (!current()) return;
          if (saved.error) throw saved.error;
          onSaved?.();
          if (entry) { closeModal(); dispose(); return; }
          if (!identity) { await open({ client, getUserId, email, renderModal, closeModal, onSupport, onSaved }); return; }
          form.querySelector('#wm-phone').value = saved.data?.phone_number || params.p_phone;
          message.textContent = '전화번호를 저장했어요.';
        } catch (error) { if (current()) message.textContent = errorMessage(error); }
        finally {
          busy = false;
          if (current()) { controls.forEach(control => { control.disabled = false; }); form.removeAttribute('aria-busy'); }
        }
      });
      root.querySelector('#wm-phone, #wm-birth')?.focus({ preventScroll: true });
    } catch {
      if (current()) {
        root.innerHTML = '<p role="alert">개인정보를 불러오지 못했어요.</p><button class="btn" id="wm-retry">다시 불러오기</button>';
        root.querySelector('#wm-retry').addEventListener('click', () => { if (current()) void open(options); });
      }
    }
  }
  function createEntryPrompt(options) {
    let visit = null;
    const complete = value => value?.birth_date && ['male', 'female'].includes(value.gender) && String(value.phone_number || '').trim();
    function sync() {
      const owner = options.getUserId();
      if (!owner || !options.isVillage()) { visit?.observer?.disconnect(); visit = null; return; }
      if (visit?.owner === owner) return;
      visit?.observer?.disconnect();
      const currentVisit = visit = { owner };
      const current = () => visit === currentVisit && options.getUserId() === owner && options.isVillage();
      void (async () => {
        let result;
        try { result = await options.client.rpc('get_my_member_identity'); }
        catch { result = { error: true }; }
        if (!current() || (!result.error && complete(result.data))) return;
        const show = () => {
          if (!current()) { currentVisit.observer?.disconnect(); return; }
          // Do not replace a notice, password prompt, or another form already being used.
          if (document.querySelector('[role="dialog"], dialog[open]')) return;
          currentVisit.observer?.disconnect();
          const settings = { ...options, email: options.getEmail(), entry: true };
          if (!result.error) settings.identity = result.data;
          void open(settings);
        };
        currentVisit.observer = new MutationObserver(show);
        currentVisit.observer.observe(document.body, { childList: true, subtree: true });
        show();
      })();
    }
    return { sync };
  }
  window.OjjudaMemberInfo = { open, createEntryPrompt };
})();
