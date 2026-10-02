/* Shared coin catalogue. Beta credits and the daily allowance are verified by
 * the server; paid checkout remains unavailable while no provider is connected.
 */
(() => {
  'use strict';
  const packages = Object.freeze([
    { id: 'p1000', won: 1000, coins: 10 },
    { id: 'p3000', won: 3000, coins: 30 },
    { id: 'p5000', won: 5000, coins: 50 },
    { id: 'p10000', won: 10000, coins: 100 },
    { id: 'p30000', won: 30000, coins: 300 },
    { id: 'p50000', won: 50000, coins: 500 }
  ].map(Object.freeze));
  const number = value => value.toLocaleString('ko-KR');
  let options = {}, dialog, opener, selected = packages[0], balanceRun = 0;
  let installedClient = null, subscription = null, state = null, busy = false;

  function select(pack) {
    selected = pack;
    for (const button of dialog.querySelectorAll('[data-ju-pack]')) {
      button.setAttribute('aria-pressed', String(button.dataset.juPack === pack.id));
    }
    dialog.querySelector('[data-ju-selected]').textContent = `${number(pack.coins)}쭈`;
    dialog.querySelector('[data-ju-price]').textContent = state?.enabled ? '0원 (베타 무료)' : `${number(pack.won)}원`;
    updateButton();
  }

  function updateButton() {
    if (!dialog) return;
    const button = dialog.querySelector('.ju-charge-checkout');
    button.disabled = busy || !state?.ok || !state.enabled || state.left < 1 || !options.getUserId?.();
    button.textContent = busy ? '충전 중…' : !options.getUserId?.() ? '로그인 후 무료 충전'
      : !state ? '충전 정보 확인 중' : !state.ok ? '충전 정보를 다시 확인해 주세요'
      : !state.enabled ? '결제 준비 중' : state.left < 1 ? '오늘 무료 충전을 모두 받았어요'
      : `${number(selected.coins)}쭈 무료 충전`;
    for (const pack of dialog.querySelectorAll('[data-ju-pack]')) pack.disabled = busy;
  }

  async function refreshBalance() {
    if (!dialog?.open) return;
    const run = ++balanceRun;
    const userId = options.getUserId?.();
    const balance = dialog.querySelector('[data-ju-balance]');
    const login = dialog.querySelector('[data-ju-login]');
    const remaining = dialog.querySelector('[data-ju-remaining]');
    state = null;
    login.hidden = !!userId;
    login.href = `/?auth=login&next=${options.source === 'note' ? 'note' : 'world'}`;
    balance.textContent = userId ? '확인 중' : '로그인 후 확인';
    remaining.textContent = userId ? '남은 횟수 확인 중' : '로그인 후 남은 횟수를 확인할 수 있어요';
    updateButton();
    if (!userId || !options.client) {
      if (userId) balance.textContent = '확인할 수 없어요';
      return;
    }
    try {
      const { data, error } = await options.client.rpc('beta_charge_status');
      if (run !== balanceRun || !dialog.open || options.getUserId?.() !== userId) return;
      if (error || !data?.ok || !Number.isSafeInteger(data.coins) || !Number.isSafeInteger(data.left)) throw new Error('status_unavailable');
      state = data;
      balance.textContent = `${number(data.coins)}쭈`;
      remaining.textContent = data.enabled ? `오늘 ${data.limit}회 중 ${data.left}회 남았어요` : '무료 충전이 종료되었어요';
      dialog.querySelector('[data-ju-beta-title]').textContent = data.enabled ? `베타 기간 · 하루 ${data.limit}회 무료` : '쭈 충전';
      dialog.querySelector('#ju-charge-payment-status').textContent = data.enabled
        ? '노트와 월드의 무료 횟수는 함께 계산돼요. 매일 밤 12시(한국 시간)에 다시 받을 수 있어요.'
        : '현재 유료 결제를 준비 중이에요. 결제 연결이 완료되면 이용할 수 있어요.';
      dialog.classList.toggle('ju-charge-beta', data.enabled);
      select(selected);
      options.onBalance?.(data.coins, userId);
    } catch {
      if (run === balanceRun && dialog.open && options.getUserId?.() === userId) {
        state = { ok: false };
        balance.textContent = '확인할 수 없어요';
        remaining.textContent = '연결을 확인한 뒤 새로고침해 주세요';
        updateButton();
      }
    }
  }

  async function charge() {
    const userId = options.getUserId?.();
    if (busy || !userId || !state?.ok || !state.enabled || state.left < 1) return;
    const pack = selected;
    const callback = options.onBalance;
    busy = true;
    ++balanceRun;
    updateButton();
    const message = dialog.querySelector('[data-ju-result]');
    message.textContent = '';
    try {
      // Only a product ID is submitted. Price, credit and limits come from SQL.
      const { data, error } = await options.client.rpc('beta_charge', { pack: pack.id });
      if (options.getUserId?.() !== userId) return;
      if (error || !data) throw new Error('charge_unavailable');
      if (data.ok) {
        callback?.(data.coins, userId);
        message.textContent = `${number(data.added)}쭈를 무료로 받았어요!`;
      } else {
        message.textContent = data.reason === 'limit' ? '오늘 무료 충전을 모두 받았어요. 내일 다시 이용해 주세요.'
          : data.reason === 'closed' ? '지금은 무료 충전을 이용할 수 없어요.'
          : '충전하지 못했어요. 계정 상태를 확인해 주세요.';
      }
    } catch {
      if (options.getUserId?.() === userId) message.textContent = '충전 결과를 확인하지 못했어요. 보유 쭈와 남은 횟수를 확인해 주세요.';
    } finally {
      busy = false;
      if (dialog.open) await refreshBalance();
      updateButton();
    }
  }

  function close() { if (dialog?.open) dialog.close(); }

  function createDialog() {
    dialog = document.createElement('dialog');
    dialog.className = 'ju-charge-dialog';
    dialog.id = 'ju-charge-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-labelledby', 'ju-charge-title');
    dialog.setAttribute('aria-describedby', 'ju-charge-description');
    dialog.innerHTML = `
      <header class="ju-charge-heading"><div><p class="ju-charge-eyebrow">오쭈다 노트 · 월드</p><h2 id="ju-charge-title">쭈 충전</h2></div><button class="ju-charge-close" type="button" aria-label="충전창 닫기" autofocus>×</button></header>
      <div class="ju-charge-content">
        <div class="ju-charge-wallet"><span>보유 쭈</span><strong data-ju-balance role="status">확인 중</strong></div>
        <div class="ju-charge-benefit"><strong data-ju-beta-title>베타 기간 · 하루 5회 무료</strong><span data-ju-remaining role="status">남은 횟수 확인 중</span></div>
        <p id="ju-charge-description">원하는 충전 금액을 골라 주세요.<br>쭈는 노트와 월드에서 함께 사용할 수 있어요.</p>
        <div class="ju-charge-grid" role="group" aria-label="충전 상품 6종">${packages.map(pack => `
          <button class="ju-charge-pack" type="button" data-ju-pack="${pack.id}" aria-pressed="${pack.id === selected.id}">
            <span class="ju-charge-coin" aria-hidden="true">쭈</span><strong>${number(pack.coins)}<small>쭈</small></strong><span class="ju-charge-won">${number(pack.won)}원</span>
          </button>`).join('')}
        </div>
        <div class="ju-charge-total" aria-live="polite" aria-atomic="true"><span>선택한 상품 <b data-ju-selected>10쭈</b></span><span>결제 금액 <strong data-ju-price>1,000원</strong></span></div>
        <p class="ju-charge-notice" id="ju-charge-payment-status">노트와 월드의 무료 횟수는 함께 계산돼요. 매일 밤 12시(한국 시간)에 다시 받을 수 있어요.</p>
        <a class="ju-charge-login" data-ju-login href="/?auth=login&next=world" hidden>로그인하고 보유 쭈 확인하기 →</a>
        <p class="ju-charge-result" data-ju-result role="status" aria-live="polite"></p>
      </div>
      <footer class="ju-charge-footer"><button class="ju-charge-checkout" type="button" disabled aria-describedby="ju-charge-payment-status">충전 정보 확인 중</button><button class="ju-charge-refresh" type="button">잔액·횟수 새로고침</button></footer>`;
    document.body.append(dialog);
    dialog.querySelector('.ju-charge-close').addEventListener('click', close);
    dialog.querySelector('.ju-charge-checkout').addEventListener('click', charge);
    dialog.querySelector('.ju-charge-refresh').addEventListener('click', () => { if (!busy) void refreshBalance(); });
    dialog.addEventListener('click', event => {
      const button = event.target.closest('[data-ju-pack]');
      const pack = packages.find(item => item.id === button?.dataset.juPack);
      if (pack && !busy) select(pack);
      if (event.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
      }
    });
    dialog.addEventListener('close', () => {
      ++balanceRun;
      dialog.querySelector('[data-ju-balance]').textContent = '확인 중';
      document.documentElement.classList.remove('ju-charge-open');
      const target = opener?.isConnected ? opener : document.querySelector('[data-ju-charge-open]');
      target?.focus({ preventScroll: true });
    });
  }

  function open() {
    if (!dialog) createDialog();
    if (dialog.open) return;
    opener = document.activeElement;
    state = null;
    dialog.querySelector('[data-ju-result]').textContent = '';
    select(packages[0]);
    dialog.showModal();
    document.documentElement.classList.add('ju-charge-open');
    void refreshBalance();
  }

  function install(next = {}) {
    options = next;
    if (installedClient !== next.client) {
      subscription?.unsubscribe?.();
      installedClient = next.client;
      subscription = next.client?.auth?.onAuthStateChange?.(() => {
        // Do not perform a Supabase request inside its synchronous auth callback.
        // Clear a previous account's balance before the deferred refresh.
        ++balanceRun;
        state = null;
        if (dialog?.open) {
          dialog.querySelector('[data-ju-balance]').textContent = '확인 중';
          dialog.querySelector('[data-ju-result]').textContent = '';
          updateButton();
        }
        setTimeout(() => void refreshBalance(), 0);
      })?.data?.subscription;
    }
  }

  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-ju-charge-open]')) return;
    event.preventDefault();
    open();
  });
  window.OjjudaCharge = Object.freeze({ install, open, close, isOpen: () => !!dialog?.open });
})();
