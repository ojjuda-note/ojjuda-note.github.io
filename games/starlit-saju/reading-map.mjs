// Targets are pages already constructed from this purchased reading.
function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value) node.textContent = value;
  return node;
}

function link(label, target, className) {
  const anchor = element('a', className, label);
  anchor.href = '#' + target;
  return anchor;
}

function overview({id, title, lines, topics, periods, detail}) {
  const root = element('section', 'reading-map');
  root.id = id;
  root.setAttribute('aria-labelledby', id + '-title');
  const heading = element('h3', 'map-title', title);
  heading.id = id + '-title';
  heading.tabIndex = -1;
  const summary = element('div', 'map-summary');
  summary.append(heading, element('p', 'map-lead', lines[0]));
  const action = element('div', 'map-action');
  action.append(element('strong', '', '해볼 일'), element('p', '', lines[1]));
  summary.append(action, link('이 풀이 자세히 읽기', detail, 'map-deep-link'));
  root.append(summary);
  const nav = element('nav', 'map-topics');
  nav.setAttribute('aria-label', '궁금한 주제');
  nav.append(element('h4', '', '궁금한 주제'));
  const list = element('ul', 'map-topic-list');
  for (const {label, target, preview} of topics) {
    const row = element('li');
    const anchor = link('', target, 'map-topic');
    anchor.append(element('strong', '', label), element('span', 'map-preview', preview));
    row.append(anchor);
    list.append(row);
  }
  nav.append(list);
  root.append(nav);
  if (periods?.length) {
    const months = element('nav', 'map-periods');
    months.setAttribute('aria-label', '시기별 풀이');
    for (const {label, target, current} of periods) {
      const anchor = link(label, target, 'map-period');
      if (current) anchor.setAttribute('aria-label', label + ' · 이번 달');
      months.append(anchor);
    }
    root.append(months);
  }
  return root;
}

export function personalReadingMap(root, reading, fortune, topic, initialPage) {
  const month = fortune.months.find(item => item.isCurrent)?.month || 1;
  const monthly = topic === 'monthly';
  const life = topic === 'lifelong' || topic === 'all';
  const scope = life ? reading.reader.lifelong : monthly
    ? reading.reader.months.find(item => item.month === month) : reading.reader.annual;
  const prefix = life ? 'natal' : monthly ? 'month-' + month : 'annual';
  const topics = [];
  for (const [key, label] of [['money','돈'],['work','일과 진로'],['relationships','연애와 관계'],['learning','공부와 성장']]) {
    const card = scope.cards.find(item => item.id === prefix + '-' + key);
    const page = card && root.querySelector('[data-reader-card="' + card.id + '"]');
    if (page) topics.push({label, target: page.id, preview: card.summaryLines[0]});
  }
  const periods = [];
  if (topic === 'all') periods.push({label: fortune.year + '년', target: 'reading-annual'});
  if (life && root.querySelector('#reading-daeun')) periods.push({label:'10년 대운', target:'reading-daeun'});
  if (monthly || topic === 'all') {
    periods.push({label:'월별 적용 기간',target:'reading-month-periods'});
    for (const item of fortune.months) periods.push({label:item.month + '월',target:'reading-month-' + item.month,current:item.isCurrent});
  }
  const lead = life ? reading.personPortrait || scope : scope;
  const map=overview({
    id:'saju-overview', title:life ? '나의 타고난 성향' : monthly ? fortune.year + '년 ' + month + '월의 운세' : fortune.year + '년의 운세',
    lines:lead.summaryLines, topics, periods, detail:initialPage.id
  });
  if (life) {
    const related = element('nav','map-related');
    related.setAttribute('aria-label','가족과 생활');
    for (const key of ['parents','children','contracts','health']) {
      const card = scope.cards.find(item => item.id === 'natal-' + key);
      const page = card && root.querySelector('[data-reader-card="' + card.id + '"]');
      if (page) related.append(link(card.label,page.id,'map-related-link'));
    }
    if (related.childElementCount) map.querySelector('.map-topics').append(related);
  }
  return map;
}

export function pairReadingMap(reading) {
  const topics = [
    {label:'두 사람의 성격', target:'compatibility-people-overview', preview:'같은 상황에서 각자 어떻게 생각하고 행동하는지'},
    {label:'관계에서의 차이', target:'compatibility-people-relationships', preview:'사람을 대하는 두 사람의 방식'},
    {label:'힘들 때의 반응', target:'compatibility-people-pressure', preview:'서로 부담을 느끼는 순간과 대처 방법'},
    {label:'궁합 점수', target:'compatibility-scores', preview:reading.score.total + '점 / 100점 · 항목별 점수 보기'}
  ];
  return overview({id:'pair-overview', title:'두 사람이 만났을 때', lines:reading.synthesis.summaryLines,
    topics,detail:'compatibility-synthesis'});
}

// Use the same available pages as the reader's navigation, including its purchase scope.
function addPeriodIndex(index, {label,fieldLabel,periods,currentId}) {
  if (!periods.size) return;
  const group = element('details','map-index-group');
  group.append(element('summary','',label));
  const field = element('label','map-period-select', fieldLabel);
  const select = element('select');
  const list = element('ul');
  for (const [id,period] of periods) {
    const option = element('option','',period.label);
    option.value = id;
    select.append(option);
  }
  if (periods.has(currentId)) select.value = currentId;
  function showLinks() {
    list.replaceChildren();
    for (const page of periods.get(select.value).pages) {
      const item = element('li');
      item.append(link(page.label,page.id,''));
      list.append(item);
    }
  }
  select.addEventListener('change',showLinks);
  showLinks();
  field.append(select);
  group.append(field,list);
  index.append(group);
}

function addFullIndex(map, groups, periodMenus) {
  const index = element('details', 'map-index');
  index.append(element('summary', '', '전체 목차'));
  for (const menu of periodMenus) addPeriodIndex(index,menu);
  for (const [label, pages] of groups) {
    const group = element('details', 'map-index-group');
    group.append(element('summary', '', label));
    const list = element('ul');
    for (const page of pages) {
      const item = element('li');
      item.append(link(page.label, page.element.id, ''));
      list.append(item);
    }
    group.append(list);
    index.append(group);
  }
  map.append(index);
}
export function indexPages(map, pages, groupName, periodMenus = []) {
  const groups = new Map();
  for (const page of pages) {
    const label = groupName(page);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(page);
  }
  addFullIndex(map, groups, periodMenus);
}

// The overview and the detailed reader are mutually exclusive reading views.
export function connectReadingMap(host, map) {
  const back = element('button','map-return','요약과 주제 목록');
  back.type = 'button';
  back.id = map.id + '-back';
  host.prepend(map,back);
  function display(showOverview) {
    host.dataset.mapView = showOverview ? 'overview' : 'detail';
    map.hidden = !showOverview;
    back.hidden = showOverview;
  }
  function showOverview(focus = false) {
    display(true);
    if (focus) map.querySelector('.map-title').focus();
  }
  back.addEventListener('click', () => showOverview(true));
  showOverview();
  return {
    showOverview,
    revealDetail() { display(false); },
    contains(target) { return map.contains(target) || back === target; }
  };
}
