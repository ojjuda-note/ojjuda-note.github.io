/* First-record index with isolated, server-verified practice-G trading. */
(() => {
  'use strict';

  const names = Object.freeze({
    mole:'두더지 잡기', runner:'쭈 달리기', stacker:'탑 쌓기', screw:'나사 풀기',
    ttang:'땅따먹기', billiards:'당구', breakout:'벽돌깨기', janggi:'장기',
    photo_ttang:'포토 땅따먹기', spot:'틀린그림 찾기', tour:'오쭈다 투어',
    mines:'지뢰찾기', saetbyeol:'샛별 키우기', tank:'탱크', chess:'체스',
    matgo:'맞고', poker:'포커', sacheonseong:'사천성', bang:'뱅',
    roulette:'룰렛', archery:'바람의 궁수', solitaire:'솔리테어',
    chacha_rush:'차차 러시!'
  });
  const aliases = Object.freeze({
    screw_box:'screw', screw_flat:'screw',
    carom3:'billiards', carom4:'billiards', pool8:'billiards'
  });
  const $ = selector => document.querySelector(selector);
  const comma = number => Number(number).toLocaleString('ko-KR');
  const money = number => `${comma(number)}G`;
  const labelDate = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso || '')
    ? iso.slice(2).replace(/-/g, '.') : '—';
  const dayNumber = iso => Date.parse(`${iso}T00:00:00Z`);
  const nameOf = game => names[game] || game;
  const goodId = id => typeof id === 'string' && /^[a-z0-9_]{2,40}$/.test(id);
  const plusPct = value => `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}%`;
  const tone = value => value > 0 ? 'up' : value < 0 ? 'down' : 'flat';

  const list = $('#stock-list'), status = $('#market-status'), search = $('#stock-search');
  const layout = $('#market-layout'), refresh = $('#refresh-market');
  let games = [], selected = '', sort = 'change', client = null, loading = false;
  let account = null, memberId = null, side = 'buy', ordering = false, checkingAccount = false;
  const requested = new URL(location.href).searchParams.get('game');
  selected = aliases[requested] || requested || '';

  function choose(id) {
    const game = games.find(item => item.id === id);
    if (!game) return;
    selected = id;
    const url = new URL(location.href);
    url.searchParams.set('game', id);
    history.replaceState(null, '', url);
    for (const button of list.querySelectorAll('[data-game]'))
      button.setAttribute('aria-pressed', String(button.dataset.game === id));
    showDetail(game);
  }

  const selectedStock = () => games.find(game => game.id === selected);
  const holdingFor = game => account?.holdings?.find(item => item.game === game) || null;
  function orderQuantity() {
    const raw = $('#trade-quantity').value.trim();
    const qty = Number(raw);
    return /^\d+$/.test(raw) && Number.isInteger(qty) && qty >= 1 && qty <= 100 ? qty : null;
  }

  function showTrade() {
    const game = selectedStock(), qty = orderQuantity(), holding = game && holdingFor(game.id);
    const available = Number(holding?.shares || 0);
    const cost = qty && game ? qty * game.priceG : null;
    $('#trade-buy').setAttribute('aria-pressed', String(side === 'buy'));
    $('#trade-sell').setAttribute('aria-pressed', String(side === 'sell'));
    $('#trade-estimate').textContent = cost === null ? '—' : money(cost);
    const button = $('#trade-submit');
    button.className = side === 'sell' ? 'sell' : '';
    const canTrade = !!account && !!game && !!qty && !ordering &&
      (side === 'buy' ? game.status !== 'delisted' && account.cashG >= cost : available >= qty);
    button.disabled = !canTrade;
    button.textContent = ordering ? '처리 중…' : !account ? '로그인 후 거래 가능'
      : game?.status === 'delisted' && side === 'buy' ? '상장폐지 · 매수 불가'
      : game?.status === 'delisted' && side === 'sell' ? '보유 주식 정리 매도'
      : side === 'buy' ? '매수하기' : '매도하기';
  }

  function showAccount() {
    const signedIn = !!account;
    $('#wallet-login').hidden = signedIn;
    $('#wallet-dashboard').hidden = !signedIn;
    const holdings = $('#portfolio-list');
    holdings.replaceChildren();
    $('#trade-history-list').replaceChildren();
    if (!signedIn) {
      $('#portfolio-empty').textContent = '로그인하면 보유 주식이 보여요.';
      $('#portfolio-empty').hidden = false;
      $('#trade-history').hidden = true;
      showTrade();
      return;
    }

    const byId = new Map(games.map(game => [game.id, game]));
    const value = account.holdings.reduce((sum, holding) =>
      sum + holding.shares * (byId.get(holding.game)?.priceG || 0), 0);
    const profit = account.cashG + value - account.starterG;
    $('#wallet-cash').textContent = money(account.cashG);
    $('#wallet-holdings-value').textContent = money(value);
    const profitNode = $('#wallet-profit');
    profitNode.textContent = `${profit > 0 ? '+' : ''}${money(profit)}`;
    profitNode.className = tone(profit);

    $('#portfolio-empty').hidden = account.holdings.length > 0;
    $('#portfolio-empty').textContent = '아직 보유한 주식이 없어요.';
    for (const holding of account.holdings) {
      const stock = byId.get(holding.game);
      const current = holding.shares * (stock?.priceG || 0);
      const gain = current - holding.costBasisG;
      const item = document.createElement('div'); item.className = 'portfolio-item';
      const left = document.createElement('div');
      const pick = document.createElement('button'); pick.type = 'button';
      pick.textContent = nameOf(holding.game);
      pick.addEventListener('click', () => {
        if (stock) { choose(holding.game); layout.scrollIntoView({behavior:'smooth',block:'start'}); }
      });
      const meta = document.createElement('small'); meta.textContent = `${comma(holding.shares)}주 보유`;
      left.append(pick,meta);
      const right = document.createElement('div');
      const amount = document.createElement('strong'); amount.textContent = money(current);
      const change = document.createElement('small'); change.className = tone(gain);
      change.textContent = `${gain > 0 ? '+' : ''}${money(gain)}`;
      right.append(amount,change); item.append(left,right); holdings.append(item);
    }
    $('#trade-history').hidden = !account.trades.length;
    for (const trade of account.trades) {
      const item = document.createElement('div'); item.className = 'trade-history-item';
      const left = document.createElement('span');
      left.textContent = `${trade.side === 'buy' ? '매수' : '매도'} · ${nameOf(trade.game)} · ${trade.quantity}주`;
      const right = document.createElement('span'); right.textContent = money(trade.totalG);
      item.append(left,right); $('#trade-history-list').append(item);
    }
    showTrade();
  }

  async function loadAccount() {
    if (!client || checkingAccount) return;
    checkingAccount = true;
    try {
      const {data:{user},error:authError} = await client.auth.getUser();
      if (authError || !user) { account = null; memberId = null; showAccount(); return; }
      memberId = user.id;
      const {data,error} = await client.rpc('community_game_stock_account');
      if (error || !Number.isSafeInteger(data?.cashG) || !Array.isArray(data.holdings) ||
        !Array.isArray(data.trades)) throw error || Error('invalid_account');
      if (memberId !== user.id) return;
      account = {cashG:data.cashG,starterG:Number(data.starterG) || 10000,
        holdings:data.holdings.filter(item => goodId(item.game) &&
          Number.isSafeInteger(item.shares) && item.shares > 0 &&
          Number.isSafeInteger(item.costBasisG) && item.costBasisG >= 0),
        trades:data.trades.filter(item => goodId(item.game))};
      showAccount();
    } catch (error) {
      account = null; showAccount();
      $('#wallet-login').textContent = '투자 지갑에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
      console.warn('Stock account', error?.message || error);
    } finally { checkingAccount = false; }
  }

  async function submitOrder() {
    const stock = selectedStock(), qty = orderQuantity();
    if (!client || !account || !stock || !qty || ordering) return;
    const capturedSide = side, capturedGame = stock.id;
    ordering = true; $('#trade-message').textContent = ''; showTrade();
    try {
      const {data,error} = await client.rpc('community_game_stock_order', {
        p_game:capturedGame,p_side:capturedSide,p_quantity:qty,
        p_request_id:crypto.randomUUID()
      });
      if (error || !data?.ok) throw error || Error('order_failed');
      $('#trade-message').textContent = `${capturedSide === 'buy' ? '매수' : '매도'} 완료 · ${qty}주 · ${money(data.totalG)}`;
      await loadAccount();
    } catch (error) {
      const code = String(error?.message || '');
      $('#trade-message').textContent = code.includes('insufficient_funds') ? '보유 G가 부족해요.'
        : code.includes('insufficient_shares') ? '보유한 주식 수량이 부족해요.'
        : code.includes('stock_unavailable') ? '종목 가격을 새로고침해 주세요.'
        : code.includes('stock_delisted') ? '상장폐지된 종목은 매수할 수 없어요.'
        : code.includes('login_required') ? '로그인 후 다시 시도해 주세요.'
        : '거래하지 못했어요. 잠시 후 다시 시도해 주세요.';
      console.warn('Stock order', code);
    } finally { ordering = false; showTrade(); }
  }

  function stocksInOrder() {
    const term = search.value.trim().toLocaleLowerCase('ko-KR');
    return games.filter(game => !term || nameOf(game.id).toLocaleLowerCase('ko-KR').includes(term))
      .sort((a, b) => {
      const value = a.status === 'delisted' && b.status !== 'delisted' ? 1
        : b.status === 'delisted' && a.status !== 'delisted' ? -1
        : sort === 'price' ? b.priceG - a.priceG
          : sort === 'records' ? b.savedRecords - a.savedRecords
          : sort === 'listed' ? a.listedAt.localeCompare(b.listedAt)
          : b.changePct - a.changePct;
        return value || nameOf(a.id).localeCompare(nameOf(b.id), 'ko-KR');
      });
  }

  function showList() {
    list.replaceChildren();
    const ordered = stocksInOrder();
    $('#list-empty').hidden = ordered.length > 0;
    for (const game of ordered) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stock-item';
      button.dataset.game = game.id;
      button.setAttribute('aria-pressed', String(game.id === selected));
      button.setAttribute('aria-label', `${nameOf(game.id)}, ${comma(game.priceG)}G, ${plusPct(game.changePct)}. 자세히 보기`);
      const left = document.createElement('span');
      const name = document.createElement('span'); name.className = 'stock-name'; name.textContent = nameOf(game.id);
      const meta = document.createElement('span'); meta.className = 'stock-meta';
      meta.textContent = game.status === 'delisted' ? '상장폐지 · 정리 매도만 가능'
        : `${labelDate(game.listedAt)} 상장 · 기록 ${comma(game.savedRecords)}건`;
      left.append(name, meta);
      const right = document.createElement('span'); right.className = 'stock-value';
      const amount = document.createElement('strong'); amount.textContent = `${comma(game.priceG)}G`;
      const change = document.createElement('span'); change.className = tone(game.changePct);
      change.textContent = plusPct(game.changePct);
      right.append(amount, change);
      button.append(left, right);
      button.addEventListener('click', () => choose(game.id));
      list.append(button);
    }
  }

  function svgElement(type, attributes = {}, label = '') {
    const element = document.createElementNS('http://www.w3.org/2000/svg', type);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    if (label) element.textContent = label;
    return element;
  }

  function showChart(game) {
    const svg = $('#stock-chart'); svg.replaceChildren();
    const history = game.history.filter(point =>
      /^\d{4}-\d{2}-\d{2}$/.test(point.date) &&
      Number.isFinite(point.priceG) && point.priceG > 0);
    if (!history.length) return;

    const width = 600, height = 280, left = 49, right = 18, top = 22, bottom = 34;
    const firstTime = dayNumber(history[0].date), lastTime = Math.max(firstTime + 86400000, dayNumber(game.asOf));
    const allPrices = [1000, ...history.map(point => point.priceG)];
    const minimum = Math.min(...allPrices), maximum = Math.max(...allPrices);
    const padding = Math.max(12, (maximum - minimum) * .18);
    const minPrice = Math.max(0, minimum - padding), maxPrice = maximum + padding;
    const xOf = date => left + (dayNumber(date) - firstTime) / (lastTime - firstTime) * (width - left - right);
    const yOf = price => top + (maxPrice - price) / (maxPrice - minPrice) * (height - top - bottom);
    const color = game.priceG >= 1000 ? '#178366' : '#d45466';

    const title = svgElement('title', {}, `${nameOf(game.id)}의 저장 기록 기반 주가`);
    const description = svgElement('desc', {},
      `${game.listedAt}에 1,000G로 시작해 ${game.asOf} 기준 ${comma(game.priceG)}G입니다.`);
    svg.append(title, description);
    for (let i = 0; i <= 4; i++) {
      const value = minPrice + (maxPrice - minPrice) * i / 4;
      const y = yOf(value);
      svg.append(svgElement('line', {x1:left, y1:y, x2:width-right, y2:y, stroke:'#dce9dd', 'stroke-width':1}));
      svg.append(svgElement('text', {x:left-9, y:y+4, fill:'#6d8677', 'font-size':11, 'text-anchor':'end'}, comma(Math.round(value))));
    }
    svg.append(svgElement('line', {x1:left, y1:yOf(1000), x2:width-right, y2:yOf(1000), stroke:'#a6bda9', 'stroke-dasharray':'5 5', 'stroke-width':1.4}));

    const points = history.map(point => ({x:xOf(point.date), y:yOf(point.priceG)}));
    let step = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      step += ` L ${points[i].x} ${points[i-1].y} L ${points[i].x} ${points[i].y}`;
    }
    step += ` L ${width-right} ${points[points.length-1].y}`;
    const baseY = height - bottom;
    const area = `${step} L ${width-right} ${baseY} L ${points[0].x} ${baseY} Z`;
    svg.append(svgElement('path', {d:area, fill:color, 'fill-opacity':'.09'}));
    svg.append(svgElement('path', {d:step, fill:'none', stroke:color, 'stroke-width':3, 'stroke-linejoin':'round', 'stroke-linecap':'round'}));
    svg.append(svgElement('circle', {cx:width-right, cy:points[points.length-1].y, r:5, fill:color, stroke:'#fff', 'stroke-width':2}));
    svg.setAttribute('aria-label', description.textContent);
  }

  function showDetail(game) {
    $('#detail-name').textContent = nameOf(game.id);
    $('#detail-price').textContent = `${comma(game.priceG)}G`;
    const change = $('#detail-change'); change.textContent = plusPct(game.changePct);
    change.className = `price-change ${tone(game.changePct)}`;
    $('#detail-status').hidden = game.status !== 'delisted';
    $('#detail-listed').textContent = `${labelDate(game.listedAt)} 상장`;
    $('#detail-start').textContent = `${labelDate(game.listedAt)} · 1,000G`;
    $('#detail-end').textContent = `${labelDate(game.asOf)} · ${comma(game.priceG)}G`;
    $('#detail-records').textContent = `${comma(game.savedRecords)}건`;
    $('#detail-visits').textContent = `${comma(game.visits || 0)}회`;
    $('#detail-minutes').textContent = `${comma(game.playMinutes || 0)}분`;
    $('#detail-unique').textContent = `${comma(game.uniqueVisitors || 0)}명`;
    $('#detail-updates').textContent = `${comma(game.updates || 0)}회`;
    $('#detail-days').textContent = `${comma(game.recordedDays)}일`;
    $('#detail-last').textContent = labelDate(game.lastRecordAt);
    showChart(game);
    $('#trade-message').textContent = '';
    showTrade();
  }

  async function load() {
    if (loading) return;
    loading = true; refresh.disabled = true;
    status.textContent = '운영 기록을 불러오는 중이에요…';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      if (!client) {
        const config = window.OJJUDA_CONFIG;
        if (!config?.supabaseUrl || !config?.supabaseKey || !window.supabase?.createClient)
          throw Error('연결 정보를 불러오지 못했어요.');
        client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey);
      }
      const {data, error} = await client.rpc('community_game_stock_history').abortSignal(controller.signal);
      if (error) throw error;
      if (!['record-activity-v1','visit-time-v2','balanced-v3'].includes(data?.method) || !Array.isArray(data.games) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(data.asOf)) throw Error('시세 형식을 확인하지 못했어요.');
      games = data.games.filter(game => goodId(game.id) && Number.isInteger(game.priceG) &&
        game.priceG > 0 && Number.isInteger(game.savedRecords) &&
        Array.isArray(game.history) && /^\d{4}-\d{2}-\d{2}$/.test(game.listedAt))
        .map(game => ({...game, changePct:Number(game.changePct) || 0, asOf:data.asOf}));
      $('#stock-count').textContent = comma(games.length);
      $('#stock-asof').textContent = labelDate(data.asOf);
      $('#stock-records').textContent = comma(games.reduce((total, game) => total + game.savedRecords, 0));
      if (!games.length) throw Error('아직 상장할 기록이 없어요.');
      if (!games.some(game => game.id === selected))
        selected = games.slice().sort((a,b) => b.changePct - a.changePct)[0].id;
      showList(); choose(selected);
      layout.hidden = false; status.textContent = '';
      showAccount();
      void loadAccount();
    } catch (error) {
      status.textContent = '게임 시세를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.';
      if (!games.length) layout.hidden = true;
      console.warn('Ojjuda market', error?.message || error);
    } finally {
      clearTimeout(timer); loading = false; refresh.disabled = false;
    }
  }

  search.addEventListener('input', showList);
  refresh.addEventListener('click', () => void load());
  $('#trade-quantity').addEventListener('input', showTrade);
  $('#trade-buy').addEventListener('click', () => { side = 'buy'; $('#trade-message').textContent=''; showTrade(); });
  $('#trade-sell').addEventListener('click', () => { side = 'sell'; $('#trade-message').textContent=''; showTrade(); });
  $('#trade-submit').addEventListener('click', () => void submitOrder());
  for (const button of document.querySelectorAll('[data-stock-sort]')) {
    button.addEventListener('click', () => {
      sort = button.dataset.stockSort;
      for (const item of document.querySelectorAll('[data-stock-sort]'))
        item.setAttribute('aria-pressed', String(item === button));
      showList();
    });
  }
  showAccount();
  void load();
})();
