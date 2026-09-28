(function (root) {
  'use strict';
  const MIN_AGE = 15, MAX_AGE = 69;
  function todayKorea(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = type => parts.find(part => part.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function ageAt(birthDate, today = todayKorea()) {
    return Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - (today.slice(5) < birthDate.slice(5) ? 1 : 0);
  }
  function parseBirth(birthSix, genderCode, today = todayKorea(), enforceAge = true) {
    if (!/^\d{6}$/.test(birthSix)) throw new Error('생년월일을 숫자 6자리로 입력해 주세요.');
    if (!/^[1-4]$/.test(genderCode)) throw new Error('성별 숫자는 1·2·3·4 중 한 자리로 입력해 주세요.');
    const year = (Number(genderCode) <= 2 ? 1900 : 2000) + Number(birthSix.slice(0, 2));
    const month = Number(birthSix.slice(2, 4)), day = Number(birthSix.slice(4, 6));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('존재하지 않는 생년월일이에요. 날짜를 확인해 주세요.');
    const birthDate = `${year}-${birthSix.slice(2, 4)}-${birthSix.slice(4, 6)}`;
    if (birthDate > today) throw new Error('미래의 생년월일은 입력할 수 없어요.');
    const age = ageAt(birthDate, today);
    if (enforceAge && (age < MIN_AGE || age > MAX_AGE)) throw new Error('만 15~69세만 가입할 수 있어요.');
    return { birthDate, gender: ['1', '3'].includes(genderCode) ? 'male' : 'female', age };
  }
  function normalizePhone(value) {
    let phone = String(value).trim();
    if (!/^(?:\+82[\s-]?)?\d[\d\s-]*$/.test(phone)) throw new Error('전화번호를 확인해 주세요.');
    phone = phone.replace(/[\s-]/g, '');
    if (phone.startsWith('+82')) phone = '0' + phone.slice(3);
    if (!/^(?:010\d{8}|01[16789]\d{7,8}|02\d{7,8}|0(?:[3-6][1-5]|70)\d{7,8})$/.test(phone)) throw new Error('전화번호를 확인해 주세요.');
    return phone;
  }
  function fields(prefix) {
    return `<div class="member-identity-fields" data-identity-prefix="${prefix}">
      <div class="field"><label for="${prefix}-birth">생년월일 6자리 · 성별 숫자 1자리</label>
      <div class="identity-digits"><input class="inp" id="${prefix}-birth" type="text" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="생년월일 6자리" aria-describedby="${prefix}-hint" required><span aria-hidden="true">−</span><input class="inp identity-code" id="${prefix}-code" type="text" inputmode="numeric" maxlength="1" autocomplete="off" placeholder="1" aria-label="성별 숫자 1자리" aria-describedby="${prefix}-hint" required></div>
      <p class="identity-hint" id="${prefix}-hint">1·3 남성 / 2·4 여성 · 뒤의 나머지 숫자는 입력하지 마세요.</p>
      <p class="identity-result" id="${prefix}-result" role="status" aria-live="polite"></p></div>
      <div class="field"><label for="${prefix}-phone">전화번호</label><input class="inp" id="${prefix}-phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="010-0000-0000" required></div>
      <p class="identity-hint">생년월일·만 나이·성별·전화번호를 비공개로 관리해요. 생년월일과 성별은 저장 후 직접 수정할 수 없어요. 입력 정보만으로 본인인증이 되지는 않아요.</p>
    </div>`;
  }
  function read(form, prefix, enforceAge = true) {
    const birthSix = form.querySelector(`#${prefix}-birth`).value.trim();
    const genderCode = form.querySelector(`#${prefix}-code`).value.trim();
    const parsed = parseBirth(birthSix, genderCode, todayKorea(), enforceAge);
    const phone = normalizePhone(form.querySelector(`#${prefix}-phone`).value);
    return { ...parsed, birthSix, genderCode, phone };
  }
  const api = { MIN_AGE, MAX_AGE, todayKorea, ageAt, parseBirth, normalizePhone, fields, read };
  root.OjjudaIdentity = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document !== 'undefined') document.addEventListener('input', event => {
    const group = event.target.closest('[data-identity-prefix]');
    if (!group || event.target.type === 'tel') return;
    const prefix = group.dataset.identityPrefix, output = group.querySelector(`#${prefix}-result`);
    const birth = group.querySelector(`#${prefix}-birth`).value, code = group.querySelector(`#${prefix}-code`).value;
    if (!birth || !code) { output.textContent = ''; return; }
    try {
      const info = parseBirth(birth, code, todayKorea(), group.dataset.existingMember !== 'true');
      output.textContent = `${info.birthDate.replaceAll('-', '.')} · 만 ${info.age}세 · ${info.gender === 'male' ? '남성' : '여성'}`;
      output.dataset.invalid = 'false';
    } catch (error) { output.textContent = error.message; output.dataset.invalid = 'true'; }
  });
})(typeof window !== 'undefined' ? window : globalThis);
