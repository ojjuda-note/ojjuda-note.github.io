import {getReadingSources} from './sources.mjs?v=20261113-saju-reader1';

function node(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text != null) value.textContent = text;
  return value;
}

function addParagraphs(parent, paragraphs, className = '') {
  for (const text of paragraphs || []) {
    if (typeof text === 'string' && text.trim()) parent.append(node('p', className, text));
  }
}

function addBasis(parent, basis) {
  if (!basis?.length) return;
  const box = node('aside', 'reading-basis');
  box.setAttribute('aria-label', '풀이의 단서');
  box.append(node('span', 'basis-label', '풀이의 단서'));
  addParagraphs(box, basis);
  parent.append(box);
}

function addPractice(parent, practice) {
  if (!practice?.length) return;
  const box = node('div', 'reading-practice');
  box.append(node('p', 'practice-label', '생활에서 해 볼 수 있는 일'));
  const list = node('ul');
  for (const text of practice) list.append(node('li', '', text));
  box.append(list);
  parent.append(box);
}

function addReadingBlock(parent, label, paragraphs, className) {
  if (!paragraphs?.length) return;
  const block=node('div', `report-prose ${className}`);
  block.append(node('p','reading-kind',label));
  addParagraphs(block,paragraphs);
  parent.append(block);
}

function addReference(parent,reference) {
  if (!reference?.length) return;
  const block=node('aside','shared-reference');
  block.setAttribute('aria-label','공통 참고 설명');
  block.append(node('p','reading-kind','공통 참고 설명'));
  addParagraphs(block,reference);
  parent.append(block);
}

function chapterView(chapter, index, sectionId, headingTag = 'h4') {
  const article = node('section', 'report-chapter');
  const id = `${sectionId}-chapter-${index + 1}`;
  article.setAttribute('aria-labelledby', id);
  const heading = node(headingTag, 'chapter-title');
  heading.id = id;
  heading.tabIndex = -1;
  const number = node('span', 'chapter-number', String(index + 1).padStart(2, '0'));
  number.setAttribute('aria-hidden', 'true');
  heading.append(number, document.createTextNode(chapter.title));
  article.append(heading);
  if (chapter.summary) article.append(node('h5','chapter-summary',chapter.summary));
  if (chapter.easyParagraphs?.length) {
    const easy=node('div','report-prose easy-reading');
    addParagraphs(easy,chapter.easyParagraphs);
    article.append(easy);
  }
  addPractice(article, chapter.practice);
  const details=node('details','chapter-evidence');
  details.open=!chapter.easyParagraphs?.length;
  details.append(node('summary','', '이 풀이의 근거 보기'));
  const detailContent=node('div','chapter-evidence-content');
  if (Array.isArray(chapter.calculation) || Array.isArray(chapter.interpretation)) {
    addReadingBlock(detailContent,'계산에서 확인한 내용',chapter.calculation,'calculated-reading');
    addReadingBlock(detailContent,'적용한 해석 규칙',chapter.interpretation,'interpreted-reading');
  } else {
    const prose=node('div','report-prose');
    addParagraphs(prose,chapter.paragraphs);
    detailContent.append(prose);
    addBasis(detailContent,chapter.basis);
  }
  addReference(detailContent,chapter.reference);
  details.append(detailContent);
  article.append(details);
  return article;
}

function adviceView(advice, sectionId, notice) {
  if (!advice?.length) return null;
  const section=node('section','reading-advice');
  section.id=`${sectionId}-advice`;
  section.setAttribute('aria-labelledby',`${section.id}-title`);
  const title=node('p','advice-section-title','선택에 도움이 되는 제안');
  title.id=`${section.id}-title`;
  title.tabIndex=-1;
  section.append(title,node('p','advice-notice',notice));
  for (const item of advice) {
    const card=node('article','advice-card');
    card.dataset.adviceId=item.id;
    card.dataset.origin=item.origin;
    const heading=node('h4','advice-title',item.title);
    const reason=node('h5','advice-why',item.why);
    card.append(heading,reason);
    const prose=node('div','report-prose advice-prose');
    for (const [label,text,className] of [['해 볼 일',item.action,'advice-action'],['함께 살펴볼 점',item.caution,'advice-caution']]) {
      if (!text) continue;
      const paragraph=node('p',className);
      paragraph.append(node('strong','advice-label',label),node('span','',text));
      prose.append(paragraph);
    }
    card.append(prose);
    section.append(card);
  }
  return section;
}

function guideView(guide, glossary) {
  const section=node('section','reading-guide');
  section.setAttribute('aria-labelledby','reading-guide-title');
  const title=node('h3','',guide?.title||'사주, 이렇게 읽어 주세요');
  title.id='reading-guide-title';
  section.append(title);
  addParagraphs(section,guide?.paragraphs||['먼저 쉬운 풀이를 읽어 보세요. 자세한 글자와 계산은 각 이야기 아래의 ‘이 풀이의 근거 보기’에서 확인할 수 있어요.']);
  if (glossary?.length) {
    const details=node('details','reading-glossary');
    details.id='reading-glossary';
    details.append(node('summary','','사주 단어를 쉬운 말로 보기'));
    const list=node('dl','glossary-list');
    for (const entry of glossary) {
      const item=node('div','glossary-entry');
      const definition=node('dd');
      definition.append(node('p','',entry.meaning));
      if (entry.example) definition.append(node('p','glossary-example',entry.example));
      item.append(node('dt','',entry.term),definition);
      list.append(item);
    }
    details.append(list);
    section.append(details);
  }
  return section;
}

function reportSection(section, number, advice, adviceNotice) {
  const container = node('section', 'report-section');
  const sectionId = `reading-${section.id}`;
  container.id = sectionId;
  container.setAttribute('aria-labelledby', `${sectionId}-title`);
  const header = node('header', 'report-section-heading');
  const index = node('span', 'section-index', number);
  index.setAttribute('aria-hidden', 'true');
  header.append(index, node('p', 'small-kicker', section.kicker || (section.id === 'lifelong' ? 'THE ROOTS OF YOUR STORY' : 'THE YEAR AHEAD')));
  const title = node('h3', '', section.title);
  title.id = `${sectionId}-title`;
  title.tabIndex = -1;
  header.append(title);
  header.append(node('p', 'section-summary', section.summary));
  container.append(header);
  if (section.chapters.length > 3) {
    const outline = node('details', 'chapter-outline');
    outline.open=true;
    outline.append(node('summary', '', '단원 바로가기'));
    const list = node('ol');
    section.chapters.forEach((chapter, index) => {
      const item = node('li');
      const anchor = node('a', '', chapter.title);
      anchor.href = `#${sectionId}-chapter-${index + 1}`;
      item.append(anchor);
      list.append(item);
    });
    if (advice?.length) {
      const item=node('li');
      const anchor=node('a','','선택에 도움이 되는 제안');
      anchor.href=`#${sectionId}-advice`;
      item.append(anchor);list.append(item);
    }
    outline.append(list);
    container.append(outline);
  }
  section.chapters.forEach((chapter, index) => container.append(chapterView(chapter, index, sectionId)));
  const suggestions=adviceView(advice,sectionId,adviceNotice);
  if (suggestions) container.append(suggestions);
  return container;
}

function monthView(month, calculated, open, adviceNotice) {
  const detail = node('details', 'month-reading' + (calculated?.isCurrent ? ' is-current' : ''));
  detail.id = `reading-month-${month.month}`;
  detail.open = open;
  const summary = node('summary', 'month-heading');
  summary.id = `month-title-${month.month}`;
  const number = node('span', 'month-number', String(month.month).padStart(2, '0'));
  number.setAttribute('aria-hidden', 'true');
  const intro = node('span', 'month-heading-text');
  const titleRow = node('span', 'month-heading-title');
  titleRow.append(node('span', '', month.title));
  if (calculated?.isCurrent) titleRow.append(node('span', 'current-month-tag', '지금의 흐름'));
  intro.append(titleRow);
  const mark = node('span', 'month-toggle-symbol', '＋');
  mark.setAttribute('aria-hidden', 'true');
  summary.append(number, intro, mark);
  detail.append(summary);
  const content = node('div', 'month-content');
  const period = month.periodLabel || (calculated?.start?.label && calculated?.end?.label ? `${calculated.start.label} ~ ${calculated.end.label}` : '');
  if (period) content.append(node('p', 'month-period', period));
  content.append(node('p', 'month-overview', month.summary));
  month.chapters.forEach((chapter, index) => content.append(chapterView(chapter, index, detail.id)));
  const suggestions=adviceView(month.advice,detail.id,adviceNotice);
  if (suggestions) content.append(suggestions);
  if (month.basis?.length || month.reference?.length) {
    const basis=node('details','month-calculation chapter-evidence');
    basis.append(node('summary','','이 달의 날짜와 글자 확인하기'));
    const inner=node('div','chapter-evidence-content');
    addBasis(inner,month.basis);
    addReference(inner,month.reference);
    basis.append(inner);
    content.append(basis);
  }
  addPractice(content, month.practice);
  detail.append(content);
  detail.setAttribute('aria-labelledby', summary.id);
  return detail;
}

function evidenceView(evidence) {
  const section=node('section','report-section evidence-section');
  section.id='reading-evidence';
  section.setAttribute('aria-labelledby','reading-evidence-title');
  const header=node('header','report-section-heading');
  header.append(node('p','small-kicker','THE CALCULATED RECORD'));
  const title=node('h3','','풀이에 쓴 자료 전체');
  title.id='reading-evidence-title';title.tabIndex=-1;
  header.append(title,node('p','section-summary','여기에는 풀이에 쓴 글자와 계산을 모두 담았어요. 더 알고 싶은 항목을 눌러 펼쳐 보세요.'));
  section.append(header);
  for (const group of evidence.groups) {
    const detail=node('details','evidence-group');
    const summary=node('summary','',group.title);
    detail.append(summary);
    const list=node('dl','evidence-rows');
    for (const row of group.rows || []) {
      const item=node('div','evidence-row');
      if (row.factId) item.dataset.factId=row.factId;
      item.append(node('dt','',row.label),node('dd','',row.value));
      list.append(item);
    }
    detail.append(list);
    const notes=node('div','evidence-notes');
    addParagraphs(notes,group.notes);
    detail.append(notes);
    section.append(detail);
  }
  return section;
}

function methodView(method) {
  const section=node('section','report-section method-section');
  section.id='reading-method';
  section.setAttribute('aria-labelledby','reading-method-title');
  const header=node('header','report-section-heading');
  header.append(node('p','small-kicker','HOW THIS READING IS MADE'));
  const title=node('h3','',method.title||'이 풀이를 만드는 방법');
  title.id='reading-method-title';title.tabIndex=-1;
  header.append(title);
  section.append(header);
  addParagraphs(section,[method.description,method.reuseNotice],'method-description');
  for (const [label,items] of [['이 풀이에 담은 것',method.calculated],['아직 계산하지 않은 것',method.notCalculated]]) {
    if (!items?.length) continue;
    const block=node('div','method-list');
    block.append(node('h4','',label));
    const list=node('ul');
    items.forEach(text=>list.append(node('li','',text)));
    block.append(list);section.append(block);
  }
  if (method.warnings?.length) {
    const details=node('details','chapter-evidence method-details');
    details.append(node('summary','','시간과 계산의 자세한 기준 보기'));
    const inner=node('div','chapter-evidence-content');
    addParagraphs(inner,method.warnings);
    details.append(inner);section.append(details);
  }
  return section;
}

function sourcesView(topic,year) {
  const section=node('section','report-section sources-section');
  section.id='reading-sources';
  section.setAttribute('aria-labelledby','reading-sources-title');
  const header=node('header','report-section-heading');
  header.append(node('p','small-kicker','THE SOURCES BEHIND THE READING'));
  const title=node('h3','','풀이에 참고한 자료');
  title.id='reading-sources-title';title.tabIndex=-1;
  header.append(title,node('p','section-summary','어떤 자료를 썼고, 어디까지 확인할 수 있는지 함께 적었어요. 자료 이름을 누르면 원래 페이지가 새 탭에서 열려요.'));
  section.append(header);
  for (const source of getReadingSources(topic,year)) {
    const item=node('article','source-entry');
    item.dataset.sourceId=source.id;
    const heading=node('h4','source-title');
    const link=node('a','',source.title);
    link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';
    link.setAttribute('aria-label',`${source.title} · 새 탭에서 열기`);
    const mark=node('span','source-link-mark','↗');mark.setAttribute('aria-hidden','true');
    link.append(mark);heading.append(link);
    item.append(heading,node('h5','source-use',source.usedFor),node('p','source-publisher',source.publisher),node('p','source-limitation',source.limitation));
    section.append(item);
  }
  return section;
}

function monthSection(reading, fortune) {
  const section = node('section', 'report-section months-section');
  section.id = 'reading-months';
  section.setAttribute('aria-labelledby', 'reading-months-title');
  const header = node('header', 'report-section-heading');
  const index = node('span', 'section-index', '03');
  index.setAttribute('aria-hidden', 'true');
  header.append(index, node('p', 'small-kicker', 'TWELVE CHAPTERS OF THE YEAR'));
  const title = node('h3', '', `${fortune.year}년, 열두 달의 이야기`);
  title.id = 'reading-months-title';
  title.tabIndex = -1;
  header.append(title, node('p', 'section-summary', '보고 싶은 달을 눌러 보세요. 그달의 글자와 내 사주가 어떤 관계인지 쉬운 말로 설명해 드려요.'));
  section.append(header);
  const controls = node('div', 'months-controls');
  controls.append(node('p', 'months-note', reading.monthsIntro || '월별 흐름은 절기가 바뀌는 날을 기준으로 나누어요. 각 달을 펼치면 적용 기간을 볼 수 있어요.'));
  const expand = node('button', 'secondary-button');
  expand.id = 'toggle-all-months';
  expand.type = 'button';
  controls.append(expand);
  section.append(controls);
  const jumps = node('nav', 'month-jumps');
  jumps.setAttribute('aria-label', '월별 풀이 바로가기');
  jumps.id='reading-month-navigation';
  const calculated = new Map(fortune.months.map(month => [month.month, month]));
  const currentMonth = fortune.months.find(month => month.isCurrent)?.month;
  const initiallyOpen = currentMonth || 1;
  const details = reading.months.map(month => monthView(month, calculated.get(month.month), month.month === initiallyOpen, reading.adviceNotice));
  for (const detail of details) {
    const month = Number(detail.id.replace('reading-month-', ''));
    const jump = node('button', 'month-jump' + (month === currentMonth ? ' is-current' : ''), `${month}월`);
    jump.type = 'button';
    jump.setAttribute('aria-controls', detail.id);
    jump.setAttribute('aria-label',`${month}월 풀이 펼쳐 읽기${month===currentMonth?' · 지금의 흐름':''}`);
    jump.addEventListener('click', () => {
      detail.open = true;
      updateExpand();
      const noMotion = document.documentElement.dataset.reducedMotion === 'true';
      detail.scrollIntoView({block:'start', behavior:noMotion ? 'instant' : 'smooth'});
      detail.querySelector('summary').focus({preventScroll:true});
    });
    jumps.append(jump);
  }
  section.append(node('p','month-navigation-label','원하는 달로 바로가기'),jumps, ...details);
  const updateExpand = () => {
    const allOpen = details.every(detail => detail.open);
    expand.textContent = allOpen ? '모두 접기' : '모두 펼치기';
    expand.setAttribute('aria-expanded', String(allOpen));
    expand.setAttribute('aria-label', allOpen ? '열두 달 풀이 모두 접기' : '열두 달 풀이 모두 펼치기');
    [...jumps.children].forEach((jump,index)=>{
      jump.setAttribute('aria-expanded',String(details[index].open));
      jump.classList.toggle('is-open',details[index].open);
    });
  };
  expand.setAttribute('aria-controls', details.map(detail => detail.id).join(' '));
  expand.addEventListener('click', () => {
    const next = !details.every(detail => detail.open);
    details.forEach(detail => { detail.open = next; });
    updateExpand();
  });
  details.forEach(detail => detail.addEventListener('toggle', updateExpand));
  updateExpand();
  return section;
}

/** Render plain-text reading data atomically, preserving the prior view on error. */
export function renderDetailedReport(container, {reading, fortune, topic}) {
  const sections = reading?.sections;
  const months = reading?.months;
  const method = reading?.methodByCategory?.[topic] || reading?.method;
  if (!['lifelong','annual','monthly'].includes(topic) || !method || !Array.isArray(reading.evidence?.[topic]?.groups)) {
    throw new Error('선택한 풀이의 계산 근거를 준비하지 못했어요. 다시 불러와 주세요.');
  }
  if (topic==='monthly' && (!Array.isArray(months) || months.length!==12 || new Set(months.map(month=>month.month)).size!==12
      || months.some(month=>!Number.isInteger(month.month)||month.month<1||month.month>12||!Array.isArray(month.chapters)))) {
    throw new Error('월별 풀이를 모두 준비하지 못했어요. 다시 불러와 주세요.');
  }
  const fragment = document.createDocumentFragment();
  fragment.append(guideView(reading.guide,reading.glossary));
  if (topic==='monthly') fragment.append(monthSection({...reading,months:[...months].sort((a,b)=>a.month-b.month)},fortune));
  else {
    const section=sections?.find(value=>value.id===topic);
    if (!section?.chapters?.length) throw new Error('선택한 풀이를 준비하지 못했어요.');
    fragment.append(reportSection(section,topic==='lifelong'?'01':'02',reading.adviceByCategory?.[topic],reading.adviceNotice));
  }
  fragment.append(evidenceView(reading.evidence[topic]),methodView(method),sourcesView(topic,fortune.year));
  container.replaceChildren(fragment);
}
