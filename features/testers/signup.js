'use strict';
const form = document.querySelector('#signup');
const status = document.querySelector('#status');
const button = document.querySelector('#submit');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const apps = [...form.querySelectorAll('[name=app]:checked')].map(input => input.value);
  if (!apps.length) { status.textContent = '참여할 앱을 하나 이상 골라 주세요.'; return; }
  if (form.elements.website.value) return;
  button.disabled = true;
  status.textContent = '신청을 접수하고 있어요…';
  try {
    const response = await fetch('https://ziezbdjofcugznowiuda.supabase.co/rest/v1/blog_tester_applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: 'sb_publishable_iUpPUBr2HlJr9LhDRVtB0Q_toJUMazo', Prefer: 'return=minimal' },
      body: JSON.stringify({ email: form.elements.email.value.trim().toLowerCase(), apps, consent_version: '2026-11-18-v1' })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      if (response.status !== 409 || error.code !== '23505') throw new Error('submission_failed');
    }
    status.textContent = '신청이 접수되었습니다. 고맙습니다!\n운영자가 확인한 뒤 참여 방법을 안내합니다. 같은 이메일로 신청한 이력이 있다면 기존 신청이 유지됩니다. 앱 변경은 운영자에게 이메일로 알려 주세요.';
    form.reset();
  } catch {
    status.textContent = '신청을 접수하지 못했어요. 잠시 후 다시 시도해 주세요. 계속 어렵다면 mj830417@gmail.com으로 문의해 주세요.';
  } finally { button.disabled = false; }
});