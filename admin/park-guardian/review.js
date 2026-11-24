(async () => {
  'use strict';
  const byId = id => document.getElementById(id);
  const client = await window.OjjudaGetClient();
  const {data, error} = await client.rpc('is_admin');
  if (error || data !== true) {
    byId('state').textContent = '관리자 계정으로 로그인해 주세요.';
    return;
  }
  const status = await client.rpc('park_guardian_signup_open');
  byId('state').textContent = status.data === true ? '가입 접수 중' : '가입 개시 전입니다. 보호자 또는 자녀 정보를 접수하지 마세요.';
  if (status.error || status.data !== true) return;
  byId('review').hidden = false;
  byId('send').onclick = async () => {
    const recipient = byId('recipient');
    if (!recipient.value || !recipient.reportValidity()) return;
    const response = await fetch('/park/guardian/notice-v1.txt', {cache:'no-store'});
    if (!response.ok) { byId('state').textContent='동의 안내문을 불러오지 못했어요.'; return; }
    const body = await response.text();
    location.href = 'mailto:' + encodeURIComponent(recipient.value.trim()) + '?' +
      new URLSearchParams({subject:'오쭈다 공원 법정대리인 동의 안내', body}).toString().replaceAll('+','%20');
  };
  const clear = () => { byId('result').textContent = ''; byId('code').textContent = ''; };
  const form = byId('decision');
  form.addEventListener('input', clear);
  byId('action').onchange = () => {
    const issuing = byId('action').value === 'issue';
    for (const id of ['birth','location']) {
      byId(id+'-label').hidden = !issuing;
      byId(id).disabled = !issuing;
    }
    byId('verified').checked = false;
  };
  form.onsubmit = async event => {
    event.preventDefault();
    clear();
    byId('save').disabled = true;
    const issuing = byId('action').value === 'issue';
    const args = {p_guardian_email:byId('guardian').value.trim(),p_child_email:byId('child').value.trim(),p_evidence_id:byId('evidence').value.trim()};
    try {
      const response = issuing
        ? await client.rpc('park_guardian_record_reply', {...args,p_birth:byId('birth').value,p_location:byId('location').value==='yes'})
        : await client.rpc('park_guardian_change_choice', {...args,p_decision:byId('action').value});
      if (response.error) throw response.error;
      form.reset(); byId('action').onchange();
      byId('result').textContent = issuing ? '확인된 보호자에게만 아래 코드를 보내세요. 48시간 동안 한 번 사용할 수 있어요.' : '보호자의 선택을 반영했어요.';
      if (issuing) byId('code').textContent = response.data;
    } catch {
      byId('result').textContent = '저장되지 않았어요. 가입 연령, 이메일, 처리한 회신인지 확인해 주세요.';
    } finally { byId('save').disabled = false; }
  };
  window.addEventListener('pagehide', () => { form.reset(); clear(); });
})().catch(() => { document.getElementById('state').textContent = '관리자 정보를 확인하지 못했어요.'; });
