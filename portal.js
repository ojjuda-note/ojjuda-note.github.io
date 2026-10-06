(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const destinations = { note: '/world.html?place=park', world: '/world.html', home: '/world.html?tab=home', board: '/world.html?tab=board', my: '/world.html?tab=my', photo: '/photo-ttang.html' };
  const termsVersion = '2026-09-29-age14';
  const config = window.OJJUDA_CONFIG;
  const client = config?.supabaseUrl && config?.supabaseKey && window.supabase?.createClient
    ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey)
    : null;

  const dialog = $('auth-dialog');
  const form = $('auth-form');
  const tabs = dialog.querySelector('.auth-tabs');
  const feedback = $('auth-feedback');
  const email = $('email');
  const password = $('password');
  const passwordConfirm = $('password-confirm');
  const nickname = $('nickname');
  const submit = $('auth-submit');
  function prepareIdentity() {
    if (!window.OjjudaIdentity?.fields) return false;
    if (!$('signup-identity-slot').innerHTML) $('signup-identity-slot').innerHTML = window.OjjudaIdentity.fields('signup');
    return true;
  }
  prepareIdentity();
  const forgot = $('forgot-trigger');
  const accountActions = $('account-actions');
  const signedInActions = $('signed-in-actions');
  const adminLink = $('admin-link');
  const logoutButton = $('logout-button');

  let authMode = 'login';
  let session = null;
  let authReady = false;
  let pendingDestination = null;
  let busy = false;
  let recoveryGrant = null, recoveryCompleted = false;
  let identityVersion = 0;
  let authEventVersion = 0;
  let authViewVersion = 0;
  let enteringNote = false;
  let recoveryPending = /(?:^|[?&])reset=1(?:&|$)/.test(location.search.slice(1))
    || /(?:^|[&#])type=recovery(?:&|$)/.test(location.hash);
  let recoveryEventSeen = false;
  const postConfirmKey = 'ojjuda_post_confirm_destination';
  const authQuery = new URLSearchParams(location.search);
  const validReturnCard = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
  let returnCard = authQuery.get('next') === 'note' && validReturnCard(authQuery.get('card'))
    ? authQuery.get('card') : null;
  let returnQueryDestination = destinationPath(authQuery.get('next')) ? authQuery.get('next') : null;
  let requestedAuthMode = ['login', 'signup', 'forgot'].includes(authQuery.get('auth'))
    ? authQuery.get('auth') : returnQueryDestination ? 'login' : null;

  function messageFor(error) {
    const text = String(error?.message || error || '').toLowerCase();
    if (text.includes('rejoin_wait_3_days')) return '탈퇴 후 3일(72시간)이 지난 뒤 다시 가입할 수 있어요.';
    if (text.includes('phone_already_registered') || text.includes('member_identity_phone_number_key')) return '이미 가입된 전화번호예요. 기존 계정으로 로그인해 주세요.';
    if (authMode === 'signup' && text.includes('database error')) return '이미 가입된 전화번호인지 확인해 주세요. 탈퇴 후 3일(72시간) 동안도 같은 이메일이나 전화번호로 다시 가입할 수 없어요.';
    if (text.includes('recovery_rate_limited')) return '확인 요청이 많아요. 15분 뒤 다시 시도해 주세요.';
    if (text.includes('recovery_expired')) return '확인 시간이 지났거나 이미 사용했어요. 회원정보를 다시 확인해 주세요.';
    if (text.includes('recovery_restart_required')) return '변경 결과를 확인하지 못했어요. 회원정보 확인부터 다시 진행해 주세요.';
    if (text.includes('recovery_password_mismatch')) return '두 비밀번호가 달라요. 다시 확인해 주세요.';
    if (text.includes('invalid_recovery_password')) return '새 비밀번호를 6자 이상으로 입력해 주세요. 너무 긴 비밀번호는 사용할 수 없어요.';
    if (text.includes('recovery_unavailable')) return '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
    if (text.includes('invalid_recovery_details')) return '이메일·전화번호·생년월일·성별을 모두 확인해 주세요.';
    if (text.includes('invalid login credentials')) return '이메일이나 비밀번호를 확인해 주세요.';
    if (text.includes('email not confirmed')) return '메일 인증을 마친 뒤 로그인해 주세요.';
    if (text.includes('already registered') || text.includes('already exists')) return '이미 가입된 이메일이에요. 로그인해 주세요.';
    if (text.includes('password') && (text.includes('short') || text.includes('weak') || text.includes('6'))) return '비밀번호를 6자 이상으로 정해 주세요.';
    if (text.includes('rate limit') || text.includes('too many')) return '요청이 많아요. 잠시 후 다시 시도해 주세요.';
    if (text.includes('network') || text.includes('fetch') || text.includes('failed to fetch')) return '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.';
    if (text.includes('expired') || text.includes('invalid token') || text.includes('session')) return '링크가 만료됐어요. 새 링크를 요청해 주세요.';
    return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.';
  }

  function setBusy(value) {
    busy = value;
    submit.disabled = value;
    form.setAttribute('aria-busy', String(value));
    dialog.querySelectorAll('[data-auth-mode]').forEach(button => { button.disabled = value; });
    forgot.disabled = value;
    $('recovery-reset-button').disabled = value;
    $('back-to-login').disabled = value;
    for (const id of ['email', 'recovery-phone', 'recovery-birth', 'recovery-gender']) $(id).disabled = value;
  }

  function clearRecoveryGrant() {
    recoveryGrant = null;
    $('recovery-reset-button').hidden = true;
  }

  async function recoveryRequest(body) {
    const { data, error } = await client.functions.invoke('member-recovery', { body });
    if (error) {
      let code = 'recovery_unavailable';
      try { code = (await error.context.json()).error || code; } catch {}
      throw new Error(code);
    }
    return data;
  }

  function setAuthMode(mode, notice = '') {
    authViewVersion++;
    authMode = mode;
    const isSignup = mode === 'signup';
    const isForgot = mode === 'forgot';
    const isReset = mode === 'reset' || mode === 'direct-reset';
    if (mode !== 'direct-reset') clearRecoveryGrant();
    recoveryCompleted = false;
    password.value = passwordConfirm.value = '';
    const isNickname = mode === 'nickname';
    $('auth-state').hidden = true;
    form.hidden = false;
    tabs.hidden = isForgot || isReset || isNickname;
    dialog.querySelectorAll('[data-auth-mode]').forEach(button => {
      button.setAttribute('aria-selected', String(button.dataset.authMode === mode));
    });
    dialog.querySelectorAll('.signup-only').forEach(field => { field.hidden = !isSignup; });
    $('recovery-identity-slot').hidden = !isForgot;
    if (prepareIdentity()) $('recovery-birth').max = window.OjjudaIdentity.todayKorea();
    nickname.closest('.field').hidden = !(isSignup || isNickname);
    dialog.querySelector('.email-field').hidden = isReset || isNickname;
    dialog.querySelector('.password-field').hidden = isForgot || isNickname;
    dialog.querySelector('.password-confirm-field').hidden = !(isSignup || isReset);
    passwordConfirm.required = isSignup || isReset;
    passwordConfirm.disabled = !(isSignup || isReset);
    forgot.hidden = isSignup || isReset || isNickname;
    forgot.textContent = isForgot ? '로그인으로 돌아가기' : '비밀번호를 잊었어요';
    $('password-label').textContent = isReset ? '새 비밀번호' : '비밀번호';
    $('password-confirm-label').textContent = isReset ? '새 비밀번호 확인' : '비밀번호 확인';
    password.autocomplete = isSignup || isReset ? 'new-password' : 'current-password';
    $('auth-title').textContent = isSignup ? '오쭈다 월드' : isForgot ? '비밀번호 찾기' : isReset ? '새 비밀번호 설정' : isNickname ? '닉네임 정하기' : '오쭈다 월드';
    $('auth-intro').textContent = isSignup ? '한 번 가입하면 오쭈다 월드의 모든 공간을 이용할 수 있어요.'
      : isForgot ? '등록된 이메일·전화번호·생년월일·성별을 모두 입력해 주세요.'
        : isReset ? '새 비밀번호를 입력하고, 확인 칸에 한 번 더 입력해 주세요.'
          : isNickname ? '월드에서 사용할 닉네임을 정해 주세요.'
          : '우리집부터 공원과 오락실까지, 오쭈다 월드에서 함께해요.';
    submit.firstChild.textContent = isSignup ? '회원가입 ' : isForgot ? '회원정보 확인 ' : isReset ? '확인 ' : isNickname ? '월드 시작하기 ' : '로그인 ';
    feedback.textContent = notice;
    if ((isSignup || isForgot) && !prepareIdentity()) feedback.textContent = '회원정보 입력 화면을 불러오지 못했어요. 다시 시도해 주세요.';
    submit.disabled = busy || !client || ((isSignup || isForgot) && !window.OjjudaIdentity);
  }

  function showDialog() {
    if (!dialog.open) dialog.showModal();
  }

  function openAuth(mode, destination) {
    if (destination !== undefined) pendingDestination = destination;
    else if (!pendingDestination) pendingDestination = returnQueryDestination;
    setAuthMode(mode);
    showDialog();
    if (!client) {
      feedback.textContent = '로그인 연결을 불러오지 못했어요. 잠시 후 새로고침해 주세요.';
      submit.disabled = true;
      return;
    }
    submit.disabled = busy || (['signup', 'forgot'].includes(mode) && !window.OjjudaIdentity);
    (mode === 'signup' || mode === 'nickname' ? nickname : mode === 'reset' ? password : email).focus();
  }

  function showState(title, body, buttonText = '로그인 화면으로') {
    authViewVersion++;
    password.value = passwordConfirm.value = '';
    clearRecoveryGrant();
    recoveryCompleted = false;
    authMode = 'state';
    $('auth-title').textContent = title;
    $('auth-intro').textContent = '';
    tabs.hidden = true;
    form.hidden = true;
    $('auth-state').hidden = false;
    $('auth-state-message').textContent = body;
    $('back-to-login').textContent = buttonText;
    showDialog();
  }

  function destinationPath(key) {
    return Object.hasOwn(destinations, key) ? destinations[key] : null;
  }

  function rememberAfterEmail(destination, address) {
    if (!destinationPath(destination)) return;
    try {
      sessionStorage.setItem(postConfirmKey, JSON.stringify({
        destination, card: destination === 'note' ? returnCard : null,
        email: address.toLowerCase(), expiresAt: Date.now() + 2 * 60 * 60 * 1000
      }));
    } catch { /* The redirect query still carries the chosen destination. */ }
  }

  function savedDestination(user) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(postConfirmKey) || 'null');
      if (stored?.expiresAt > Date.now() && stored.email === String(user?.email || '').toLowerCase()
          && destinationPath(stored.destination)) {
        if (!returnCard && stored.destination === 'note' && validReturnCard(stored.card)) returnCard = stored.card;
        return stored.destination;
      }
    } catch { /* The session store can be unavailable or empty. */ }
    return null;
  }

  function resumedDestination(user) {
    return returnQueryDestination || savedDestination(user);
  }

  function clearReturnDestination() {
    returnQueryDestination = null;
    returnCard = null;
    try { sessionStorage.removeItem(postConfirmKey); } catch { /* Ignore unavailable storage. */ }
    const url = new URL(location.href);
    if (url.searchParams.has('next')) {
      url.searchParams.delete('next');
      url.searchParams.delete('card');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }

  function goToDestination(key) {
    const path = destinationPath(key);
    if (key === 'note') {
      void enterNote();
    } else if (path) {
      clearReturnDestination();
      location.assign(path);
    }
  }

  function showNicknameSetup(candidate, notice) {
    openAuth('nickname', 'note');
    nickname.value = candidate || '';
    feedback.textContent = notice;
    nickname.focus();
  }

  function nicknameIssue(error) {
    const code = String(error?.code || '');
    const detail = String(error?.message || '').toLowerCase();
    return code === '23505' || code === '22023'
      || /nickname|banned|forbidden|금지|닉네임/.test(detail);
  }

  async function enterNote(overrideNickname) {
    if (enteringNote) return;
    if (!client || !session?.user) {
      openAuth('login', 'note');
      return;
    }
    enteringNote = true;
    const expectedUserId = session.user.id;
    const expectedIdentityVersion = identityVersion;
    const expectedViewVersion = authViewVersion;
    const noteButton = document.querySelector('[data-destination="note"]');
    if (noteButton) noteButton.disabled = true;
    const release = () => { if (noteButton) noteButton.disabled = false; enteringNote = false; };
    const accountChanged = () => session?.user?.id !== expectedUserId || identityVersion !== expectedIdentityVersion
      || authViewVersion !== expectedViewVersion;
    try {
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (accountChanged()) return;
      if (identityError || !identity?.user || identity.user.id !== session.user.id) {
        applySession(null);
        openAuth('login', 'note');
        feedback.textContent = '로그인을 다시 확인해 주세요.';
        return;
      }
      const candidate = overrideNickname === undefined
        ? String(identity.user.user_metadata?.nickname || '').trim()
        : String(overrideNickname).trim();
      const { data, error } = await client.rpc('ensure_member_for_note', { p_nickname: candidate });
      if (accountChanged()) return;
      if (error) {
        showNicknameSetup(candidate, nicknameIssue(error)
          ? '사용할 수 없는 닉네임이에요. 다른 이름을 입력해 주세요.'
          : '공원 연결에 실패했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      if (data !== true) {
        showNicknameSetup(candidate, '공원 연결을 확인하지 못했어요. 다시 시도해 주세요.');
        return;
      }
      const notePath = destinations.note + (returnCard ? `&card=${encodeURIComponent(returnCard)}` : '');
      clearReturnDestination();
      location.assign(notePath);
    } catch (error) {
      console.warn('노트 회원 준비 실패:', error);
      if (accountChanged()) return;
      showNicknameSetup(overrideNickname || String(session.user.user_metadata?.nickname || ''),
        '공원 연결에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      release();
    }
  }

  function resolveAuthEntry(user) {
    if (requestedAuthMode) {
      const mode = requestedAuthMode;
      requestedAuthMode = null;
      const url = new URL(location.href);
      url.searchParams.delete('auth');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
      // Existing sessions resume the chosen space; recovery links take priority.
      if ((!user || mode === 'forgot') && !recoveryPending) openAuth(mode, returnQueryDestination);
    }
    resumeAfterConfirmation(user);
  }

  function resumeAfterConfirmation(user) {
    if (!user || busy || dialog.open || recoveryPending) return;
    const destination = resumedDestination(user);
    if (destination) goToDestination(destination);
  }

  function renderAccount() {
    $('account-loading').hidden = authReady;
    const user = session?.user;
    accountActions.hidden = !authReady || Boolean(user);
    signedInActions.hidden = !authReady || !user;
    if (user) {
      const label = String(user.user_metadata?.nickname || '').trim();
      $('account-badge').textContent = label ? `${label}님` : '내 계정';
    } else {
      adminLink.hidden = true;
      $('account-badge').textContent = '내 계정';
    }
  }

  async function checkAdmin(expectedId, version) {
    adminLink.hidden = true;
    try {
      // A stored session is only UI state. Verify identity with Auth before checking roles.
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (identityError || identity?.user?.id !== expectedId || version !== identityVersion) return;
      const role = await client.from('app_admins').select('user_id').eq('user_id', expectedId).maybeSingle();
      if (version !== identityVersion || session?.user?.id !== expectedId) return;
      adminLink.hidden = Boolean(role.error) || !role.data;
    } catch (error) {
      console.warn('관리자 권한 확인 실패:', error);
    }
  }

  function applySession(next) {
    const oldId = session?.user?.id || null;
    const newId = next?.user?.id || null;
    session = next || null;
    authReady = true;
    if (oldId !== newId) {
      identityVersion++;
      adminLink.hidden = true;
      if (newId) void checkAdmin(newId, identityVersion);
    }
    renderAccount();
    if (prepareIdentity()) window.OjjudaPortalAvailability?.ready();
    else window.OjjudaPortalAvailability?.fail('일부 로그인 기능을 불러오지 못했어요. 다시 시도하거나 손님으로 둘러보세요.');
  }

  function validEmail(value) {
    return /^\S+@\S+\.\S+$/.test(value);
  }

  async function submitForm(event) {
    event.preventDefault();
    if (['signup', 'forgot'].includes(authMode) && !prepareIdentity()) {
      feedback.textContent = '회원정보 입력 화면을 불러오지 못했어요. 다시 시도해 주세요.';
      return;
    }
    if (busy || !client) return;
    feedback.textContent = '';
    const address = email.value.trim();
    const secret = password.value;
    const isPasswordReset = authMode === 'reset' || authMode === 'direct-reset';
    if (authMode === 'direct-reset' && (!recoveryGrant || Date.now() >= recoveryGrant.expiresAt)) {
      setAuthMode('forgot', messageFor('recovery_expired')); return;
    }
    let signupIdentity = null, recoveryDetails = null;
    if (authMode === 'signup') {
      try { signupIdentity = window.OjjudaIdentity.read(form, 'signup'); }
      catch (error) { feedback.textContent = error.message; return; }
    }
    if (authMode === 'forgot') {
      try {
        const birth = $('recovery-birth').value, gender = $('recovery-gender').value;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(birth) || !['male', 'female'].includes(gender)
          || Number(birth.slice(0, 4)) < 1900 || Number(birth.slice(0, 4)) > 2099) throw new Error('생년월일과 성별을 확인해 주세요.');
        const code = String((Number(birth.slice(0, 4)) < 2000 ? 1 : 3) + (gender === 'female' ? 1 : 0));
        window.OjjudaIdentity.parseBirth(birth.slice(2).replaceAll('-', ''), code, undefined, false);
        recoveryDetails = { email: address, birth_date: birth, gender,
          phone: window.OjjudaIdentity.normalizePhone($('recovery-phone').value) };
      } catch (error) { feedback.textContent = error.message; return; }
    }
    if (!isPasswordReset && authMode !== 'nickname' && !validEmail(address)) {
      feedback.textContent = '이메일 주소를 확인해 주세요.';
      email.focus();
      return;
    }
    if (authMode !== 'forgot' && authMode !== 'nickname' && secret.length < 6) {
      feedback.textContent = '비밀번호는 6자 이상으로 입력해 주세요.';
      password.focus();
      return;
    }
    if (authMode === 'signup' || authMode === 'nickname') {
      const name = nickname.value.trim();
      if (!name || name.length > 12) {
        feedback.textContent = '닉네임을 1~12자로 입력해 주세요.';
        nickname.focus();
        return;
      }
      if (authMode === 'signup' && !$('age-check').checked) {
        feedback.textContent = '만 14세 이상인지 확인해 주세요.';
        return;
      }
      if (authMode === 'signup' && !$('policy-check').checked) {
        feedback.textContent = '이용약관과 개인정보처리방침에 동의해 주세요.';
        return;
      }
    }
    if ((authMode === 'signup' || isPasswordReset) && secret !== passwordConfirm.value) {
      feedback.textContent = passwordConfirm.value ? '두 비밀번호가 달라요. 다시 확인해 주세요.' : '비밀번호 확인을 입력해 주세요.';
      passwordConfirm.focus();
      return;
    }

    const requestView = authViewVersion;
    const currentView = () => dialog.open && authViewVersion === requestView;
    setBusy(true);
    try {
      if (authMode === 'login') {
        const { data, error } = await client.auth.signInWithPassword({ email: address, password: secret });
        if (!currentView()) return;
        if (error) throw error;
        if (!data?.session?.user) throw new Error('missing_session');
        applySession(data.session);
        const destination = pendingDestination || resumedDestination(data.session.user);
        pendingDestination = null;
        dialog.close();
        if (destination) goToDestination(destination);
        else $('places').scrollIntoView({ behavior: 'smooth' });
      } else if (authMode === 'signup') {
        const name = nickname.value.trim();
        const confirmationUrl = new URL('/', location.href);
        if (destinationPath(pendingDestination)) confirmationUrl.searchParams.set('next', pendingDestination);
        if (pendingDestination === 'note' && returnCard) confirmationUrl.searchParams.set('card', returnCard);
        const { data, error } = await client.auth.signUp({
          email: address,
          password: secret,
          options: {
            data: {
              nickname: name,
              terms_version: termsVersion,
              agreed_at: new Date().toISOString(),
              birth_yymmdd: signupIdentity.birthSix,
              gender_code: signupIdentity.genderCode,
              phone_number: signupIdentity.phone,
              age_14_or_older: true
            },
            emailRedirectTo: confirmationUrl.href
          }
        });
        if (!currentView()) return;
        if (error) throw error;
        for (const input of $('signup-identity-slot').querySelectorAll('input')) input.value = '';
        $('signup-result').textContent = '';
        if (data?.session?.user) {
          applySession(data.session);
          const destination = pendingDestination;
          pendingDestination = null;
          dialog.close();
          if (destination) goToDestination(destination);
          else $('places').scrollIntoView({ behavior: 'smooth' });
        } else {
          rememberAfterEmail(pendingDestination, address);
          pendingDestination = null;
          showState('이메일을 확인해 주세요', '가입 확인 메일을 보냈어요. 메일함에서 인증한 뒤 로그인해 주세요.');
        }
      } else if (authMode === 'nickname') {
        await enterNote(nickname.value.trim());
      } else if (authMode === 'forgot') {
        const data = await recoveryRequest({ action: 'check', ...recoveryDetails });
        if (!currentView()) return;
        if (data?.verified === false) { feedback.textContent = '회원정보가 일치하지 않아요. 입력한 네 가지 정보를 확인해 주세요.'; return; }
        if (data?.verified !== true || !/^[a-f0-9]{64}$/.test(data.reset_token)) throw new Error('recovery_unavailable');
        for (const id of ['recovery-phone', 'recovery-birth', 'recovery-gender']) $(id).value = '';
        showState('회원정보를 확인했어요', '초기화를 누르면 새 비밀번호를 설정할 수 있어요. 5분 안에 진행해 주세요.', '정보 다시 확인');
        recoveryGrant = { token: data.reset_token, expiresAt: Date.now() + 300000 };
        $('recovery-reset-button').hidden = false;
      } else if (authMode === 'direct-reset') {
        const grant = recoveryGrant;
        const data = await recoveryRequest({ action: 'reset', token: grant.token, password: secret, password_confirmation: passwordConfirm.value });
        if (!currentView() || recoveryGrant !== grant) return;
        if (data?.reset !== true) throw new Error('recovery_restart_required');
        recoveryPending = false;
        history.replaceState(null, '', location.pathname);
        showState('비밀번호가 바뀌었어요', '새 비밀번호로 다시 로그인해 주세요.', '로그인하기');
        recoveryCompleted = true;
      } else if (authMode === 'reset') {
        const { data, error } = await client.auth.updateUser({ password: secret });
        if (!currentView()) return;
        if (error) throw error;
        recoveryPending = false;
        history.replaceState(null, '', location.pathname);
        if (data?.user) applySession({ ...(session || {}), user: data.user });
        showState('비밀번호가 바뀌었어요', '이제 월드로 이동할 수 있어요.', '공간 고르기');
      }
    } catch (error) {
      console.warn('계정 처리 실패:', error);
      if (!currentView()) return;
      if (authMode === 'direct-reset' && !/invalid_recovery_password|recovery_password_mismatch/.test(error.message || '')) setAuthMode('forgot', messageFor(error));
      else feedback.textContent = messageFor(error);
    } finally {
      if (authViewVersion === requestView) {
        password.value = '';
        passwordConfirm.value = '';
      }
      setBusy(false);
    }
  }

  document.querySelectorAll('[data-open-auth]').forEach(button => {
    button.addEventListener('click', () => openAuth(button.dataset.openAuth, 'world'));
  });
  document.querySelectorAll('[data-destination]').forEach(button => {
    button.addEventListener('click', event => {
      const target = button.dataset.destination;
      if (!destinationPath(target)) return;
      event.preventDefault();
      if (session?.user) goToDestination(target);
      else openAuth('login', target);
    });
  });
  dialog.querySelectorAll('[data-auth-mode]').forEach(button => {
    button.addEventListener('click', () => setAuthMode(button.dataset.authMode));
  });
  dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    // A login can close this dialog and immediately reopen it for a nickname retry.
    if (dialog.open) return;
    clearRecoveryGrant();
    recoveryCompleted = false;
    form.reset();
    feedback.textContent = '';
    if ($('signup-result')) $('signup-result').textContent = '';
    pendingDestination = null;
  });
  forgot.addEventListener('click', () => setAuthMode(authMode === 'forgot' ? 'login' : 'forgot'));
  $('back-to-login').addEventListener('click', () => {
    if (recoveryGrant) { setAuthMode('forgot'); email.focus(); }
    else if (recoveryCompleted) { setAuthMode('login'); email.focus(); }
    else if (!recoveryPending && session?.user) {
      dialog.close();
      $('places').scrollIntoView({ behavior: 'smooth' });
    } else {
      setAuthMode('login');
      email.focus();
    }
  });
  $('recovery-reset-button').addEventListener('click', () => {
    if (busy) return;
    if (!recoveryGrant || Date.now() >= recoveryGrant.expiresAt) setAuthMode('forgot', messageFor('recovery_expired'));
    else { setAuthMode('direct-reset'); password.focus(); }
  });
  form.addEventListener('submit', submitForm);
  logoutButton.addEventListener('click', async () => {
    if (!client || logoutButton.disabled) return;
    logoutButton.disabled = true;
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      applySession(null);
      clearReturnDestination();
    } catch (error) {
      console.warn('로그아웃 실패:', error);
      alert('로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      logoutButton.disabled = false;
    }
  });

  if (!client) {
    authReady = true;
    renderAccount();
    resolveAuthEntry(null);
    window.OjjudaPortalAvailability?.fail();
    console.error('오쭈다 계정 연결 정보를 확인해 주세요.');
  } else {
    client.auth.onAuthStateChange((event, current) => {
      authEventVersion++;
      // Supabase warns against awaiting another auth operation in this callback.
      setTimeout(() => {
        applySession(current);
        if (event === 'PASSWORD_RECOVERY') {
          recoveryEventSeen = true;
          recoveryPending = true;
          openAuth('reset');
        } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          resolveAuthEntry(current?.user);
        }
      }, 0);
    });
    const initialVersion = authEventVersion;
    client.auth.getSession().then(({ data, error }) => {
      if (authEventVersion === initialVersion) {
        applySession(error ? null : data?.session);
        resolveAuthEntry(error ? null : data?.session?.user);
        if (error) window.OjjudaPortalAvailability?.fail();
      }
      if (recoveryPending && !recoveryEventSeen) {
        setTimeout(() => {
          if (recoveryEventSeen || dialog.open) return;
          if (session?.user) openAuth('reset');
          else {
            openAuth('forgot');
            feedback.textContent = '링크가 만료됐어요. 새 링크를 요청해 주세요.';
          }
        }, 0);
      }
    }).catch(error => {
      console.warn('세션 확인 실패:', error);
      if (authEventVersion !== initialVersion) return;
      applySession(null);
      resolveAuthEntry(null);
      window.OjjudaPortalAvailability?.fail();
      if (recoveryPending) {
        openAuth('forgot');
        feedback.textContent = '링크를 확인하지 못했어요. 새 링크를 요청해 주세요.';
      }
    });
  }
})();
