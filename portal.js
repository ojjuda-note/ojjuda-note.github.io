(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const destinations = { note: '/note/', world: '/world.html' };
  const termsVersion = '2026-09-27';
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
  let identityVersion = 0;
  let authEventVersion = 0;
  let enteringNote = false;
  let recoveryPending = /(?:^|[?&])reset=1(?:&|$)/.test(location.search.slice(1))
    || /(?:^|[&#])type=recovery(?:&|$)/.test(location.hash);
  let recoveryEventSeen = false;
  const postConfirmKey = 'ojjuda_post_confirm_destination';
  let returnQueryDestination = destinationPath(new URLSearchParams(location.search).get('next'))
    ? new URLSearchParams(location.search).get('next') : null;

  function messageFor(error) {
    const text = String(error?.message || error || '').toLowerCase();
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
  }

  function setAuthMode(mode, notice = '') {
    authMode = mode;
    const isSignup = mode === 'signup';
    const isForgot = mode === 'forgot';
    const isReset = mode === 'reset';
    const isNickname = mode === 'nickname';
    $('auth-state').hidden = true;
    form.hidden = false;
    tabs.hidden = isForgot || isReset || isNickname;
    dialog.querySelectorAll('[data-auth-mode]').forEach(button => {
      button.setAttribute('aria-selected', String(button.dataset.authMode === mode));
    });
    dialog.querySelectorAll('.signup-only').forEach(field => { field.hidden = !isSignup; });
    nickname.closest('.field').hidden = !(isSignup || isNickname);
    dialog.querySelector('.email-field').hidden = isReset || isNickname;
    dialog.querySelector('.password-field').hidden = isForgot || isNickname;
    dialog.querySelector('.reset-only').hidden = !isReset;
    forgot.hidden = isSignup || isReset || isNickname;
    forgot.textContent = isForgot ? '로그인으로 돌아가기' : '비밀번호를 잊었어요';
    $('password-label').textContent = isReset ? '새 비밀번호' : '비밀번호';
    password.autocomplete = isSignup || isReset ? 'new-password' : 'current-password';
    $('auth-title').textContent = isSignup ? '반가워요, 처음이죠?' : isForgot ? '비밀번호 찾기' : isReset ? '새 비밀번호 설정' : isNickname ? '닉네임 정하기' : '다시 만나서 반가워요';
    $('auth-intro').textContent = isSignup ? '한 번 가입하면 두 공간을 자유롭게 오갈 수 있어요.'
      : isForgot ? '가입한 이메일로 재설정 링크를 보내드려요.'
        : isReset ? '새로 사용할 비밀번호를 입력해 주세요.'
          : isNickname ? '노트에서 사용할 닉네임을 정해 주세요.'
          : '하나의 계정으로 두 공간을 즐겨요.';
    submit.firstChild.textContent = isSignup ? '회원가입 ' : isForgot ? '재설정 링크 보내기 ' : isReset ? '비밀번호 바꾸기 ' : isNickname ? '노트 시작하기 ' : '로그인 ';
    feedback.textContent = notice;
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
    submit.disabled = busy;
    (mode === 'signup' || mode === 'nickname' ? nickname : mode === 'reset' ? password : email).focus();
  }

  function showState(title, body, buttonText = '로그인 화면으로') {
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
        destination, email: address.toLowerCase(), expiresAt: Date.now() + 2 * 60 * 60 * 1000
      }));
    } catch { /* The redirect query still carries the chosen destination. */ }
  }

  function savedDestination(user) {
    try {
      const stored = JSON.parse(sessionStorage.getItem(postConfirmKey) || 'null');
      if (stored?.expiresAt > Date.now() && stored.email === String(user?.email || '').toLowerCase()
          && destinationPath(stored.destination)) return stored.destination;
    } catch { /* The session store can be unavailable or empty. */ }
    return null;
  }

  function resumedDestination(user) {
    return returnQueryDestination || savedDestination(user);
  }

  function clearReturnDestination() {
    returnQueryDestination = null;
    try { sessionStorage.removeItem(postConfirmKey); } catch { /* Ignore unavailable storage. */ }
    const url = new URL(location.href);
    if (url.searchParams.has('next')) {
      url.searchParams.delete('next');
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
    const noteButton = document.querySelector('[data-destination="note"]');
    noteButton.disabled = true;
    const release = () => { noteButton.disabled = false; enteringNote = false; };
    try {
      const { data: identity, error: identityError } = await client.auth.getUser();
      if (identityError || !identity?.user || identity.user.id !== session.user.id) {
        applySession(null);
        release();
        openAuth('login', 'note');
        feedback.textContent = '로그인을 다시 확인해 주세요.';
        return;
      }
      const candidate = overrideNickname === undefined
        ? String(identity.user.user_metadata?.nickname || '').trim()
        : String(overrideNickname).trim();
      const { data, error } = await client.rpc('ensure_member_for_note', { p_nickname: candidate });
      if (error) {
        release();
        showNicknameSetup(candidate, nicknameIssue(error)
          ? '사용할 수 없는 닉네임이에요. 다른 이름을 입력해 주세요.'
          : '노트 연결에 실패했어요. 잠시 후 다시 시도해 주세요.');
        return;
      }
      if (data !== true) {
        release();
        showNicknameSetup(candidate, '노트 연결을 확인하지 못했어요. 다시 시도해 주세요.');
        return;
      }
      clearReturnDestination();
      location.assign(destinations.note);
    } catch (error) {
      console.warn('노트 회원 준비 실패:', error);
      release();
      showNicknameSetup(overrideNickname || String(session.user.user_metadata?.nickname || ''),
        '노트 연결에 실패했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      release();
    }
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
      const results = await Promise.allSettled([
        client.from('app_admins').select('user_id').eq('user_id', expectedId).maybeSingle(),
        client.schema('ojjuda_note').rpc('is_note_moderator')
      ]);
      if (version !== identityVersion || session?.user?.id !== expectedId) return;
      const world = results[0].status === 'fulfilled' && !results[0].value.error && Boolean(results[0].value.data);
      const note = results[1].status === 'fulfilled' && !results[1].value.error && results[1].value.data === true;
      adminLink.hidden = !(world || note);
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
  }

  function validEmail(value) {
    return /^\S+@\S+\.\S+$/.test(value);
  }

  async function submitForm(event) {
    event.preventDefault();
    if (busy || !client) return;
    feedback.textContent = '';
    const address = email.value.trim();
    const secret = password.value;
    if (authMode !== 'reset' && authMode !== 'nickname' && !validEmail(address)) {
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
        feedback.textContent = '만 14세 이상만 가입할 수 있어요.';
        return;
      }
      if (authMode === 'signup' && !$('policy-check').checked) {
        feedback.textContent = '이용약관과 개인정보처리방침에 동의해 주세요.';
        return;
      }
    }
    if (authMode === 'reset' && secret !== passwordConfirm.value) {
      feedback.textContent = '두 비밀번호가 달라요. 다시 확인해 주세요.';
      passwordConfirm.focus();
      return;
    }

    setBusy(true);
    try {
      if (authMode === 'login') {
        const { data, error } = await client.auth.signInWithPassword({ email: address, password: secret });
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
        const { data, error } = await client.auth.signUp({
          email: address,
          password: secret,
          options: {
            data: {
              nickname: name,
              terms_version: termsVersion,
              agreed_at: new Date().toISOString(),
              age_14_plus: true
            },
            emailRedirectTo: confirmationUrl.href
          }
        });
        if (error) throw error;
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
        const redirectTo = new URL('/?reset=1', location.href).href;
        const { error } = await client.auth.resetPasswordForEmail(address, { redirectTo });
        if (error) throw error;
        showState('메일을 보냈어요', '가입한 이메일이라면 재설정 링크가 도착해요. 메일함을 확인해 주세요.');
      } else if (authMode === 'reset') {
        const { data, error } = await client.auth.updateUser({ password: secret });
        if (error) throw error;
        recoveryPending = false;
        history.replaceState(null, '', location.pathname);
        if (data?.user) applySession({ ...(session || {}), user: data.user });
        showState('비밀번호가 바뀌었어요', '이제 노트나 월드로 이동할 수 있어요.', '공간 고르기');
      }
    } catch (error) {
      console.warn('계정 처리 실패:', error);
      feedback.textContent = messageFor(error);
    } finally {
      password.value = '';
      passwordConfirm.value = '';
      setBusy(false);
    }
  }

  document.querySelectorAll('[data-open-auth]').forEach(button => {
    button.addEventListener('click', () => openAuth(button.dataset.openAuth));
  });
  document.querySelectorAll('[data-destination]').forEach(button => {
    button.addEventListener('click', () => {
      const target = button.dataset.destination;
      if (!destinationPath(target)) return;
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
    form.reset();
    feedback.textContent = '';
    pendingDestination = null;
  });
  forgot.addEventListener('click', () => setAuthMode(authMode === 'forgot' ? 'login' : 'forgot'));
  $('back-to-login').addEventListener('click', () => {
    if (!recoveryPending && session?.user) {
      dialog.close();
      $('places').scrollIntoView({ behavior: 'smooth' });
    } else {
      setAuthMode('login');
      email.focus();
    }
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
          resumeAfterConfirmation(current?.user);
        }
      }, 0);
    });
    const initialVersion = authEventVersion;
    client.auth.getSession().then(({ data, error }) => {
      if (authEventVersion === initialVersion) {
        applySession(error ? null : data?.session);
        resumeAfterConfirmation(error ? null : data?.session?.user);
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
      applySession(null);
      if (recoveryPending) {
        openAuth('forgot');
        feedback.textContent = '링크를 확인하지 못했어요. 새 링크를 요청해 주세요.';
      }
    });
  }
})();
