/* Ojjuda's first-record-to-today game activity index. No trading or balances. */
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

  function stocksInOrder() {
    const term = search.value.trim().toLocaleLowerCase('ko-KR');
    return games.filter(game => !term || nameOf(game.id).toLocaleLowerCase('ko-KR').includes(term))
      .sort((a, b) => {
        const value = sort === 'price' ? b.priceG - a.priceG
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
      meta.textContent = `${labelDate(game.listedAt)} 상장 · 기록 ${comma(game.savedRecords)}건`;
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
    $('#detail-listed').textContent = `${labelDate(game.listedAt)} 상장`;
    $('#detail-start').textContent = `${labelDate(game.listedAt)} · 1,000G`;
    $('#detail-end').textContent = `${labelDate(game.asOf)} · ${comma(game.priceG)}G`;
    $('#detail-records').textContent = `${comma(game.savedRecords)}건`;
    $('#detail-days').textContent = `${comma(game.recordedDays)}일`;
    $('#detail-last').textContent = labelDate(game.lastRecordAt);
    showChart(game);
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
      if (data?.method !== 'record-activity-v1' || !Array.isArray(data.games) ||
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
  for (const button of document.querySelectorAll('[data-stock-sort]')) {
    button.addEventListener('click', () => {
      sort = button.dataset.stockSort;
      for (const item of document.querySelectorAll('[data-stock-sort]'))
        item.setAttribute('aria-pressed', String(item === button));
      showList();
    });
  }
  void load();
})();
