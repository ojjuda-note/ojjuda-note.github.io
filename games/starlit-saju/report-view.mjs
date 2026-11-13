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

function supportDetails(id, titleText, className) {
  const section=node('details',`report-section support-details ${className}`);
  section.id=id;
  section.setAttribute('aria-labelledby',`${id}-title`);
  const summary=node('summary','support-summary');
  const title=node('h3','',titleText);
  title.id=`${id}-title`;
  summary.append(title);
  const body=node('div','support-content');
  section.append(summary,body);
  return {section,body};
}

function readingLink(label, targetId, className = '') {
  const link=node('a',className,label);
  link.href=`#${targetId}`;
  link.addEventListener('click',event=>{
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target=document.getElementById(targetId);
    if (!target) return;
    let details=target.closest('details');
    while (details) {
      details.open=true;
      details=details.parentElement?.closest('details');
    }
    event.preventDefault();
    target.focus({preventScroll:true});
    target.scrollIntoView({block:'start',behavior:document.documentElement.dataset.reducedMotion==='true'?'instant':'smooth'});
  });
  return link;
}

function readerOverview(overview, sectionId, chapters=[], showLabel=false, fallbackEvidenceId=null, parentHeadingId=null) {
  if (!overview || typeof overview.headline!=='string' || !overview.headline.trim()
      || !Array.isArray(overview.cards) || !Array.isArray(overview.paragraphs)) {
    throw new Error('쉬운 운세 풀이를 준비하지 못했어요. 다시 불러와 주세요.');
  }
  const section=node('section','reader-overview');
  section.id=`${sectionId}-summary`;
  section.dataset.origin=overview.origin;
  section.dataset.factIds=(overview.factIds||[]).join(' ');
  section.setAttribute('aria-labelledby',parentHeadingId||`${section.id}-title`);
  const intro=node('header','reader-intro');
  if (showLabel) intro.append(node('p','reader-label',overview.title));
  if (!parentHeadingId) {
    const headline=node('h4','reader-headline',overview.headline);
    headline.id=`${section.id}-title`;
    headline.tabIndex=-1;
    intro.append(headline);
  }
  const prose=node('div','report-prose reader-prose');
  addParagraphs(prose,overview.paragraphs);
  intro.append(prose);
  section.append(intro);
  const topicNav=node('nav','reader-topic-nav');
  topicNav.setAttribute('aria-label',`${overview.title} 주제 바로가기`);
  const navGroups=new Map();
  const cards=node('div','reader-cards');
  for (const [index,item] of overview.cards.entries()) {
    const card=node('article','reader-card');
    const headingId=`${sectionId}-topic-${index+1}`;
    card.setAttribute('aria-labelledby',headingId);
    card.dataset.readerCard=item.id;
    card.dataset.origin=item.origin;
    card.dataset.factIds=(item.factIds||[]).join(' ');
    const label=node('h4','reader-card-label',item.label);
    label.id=headingId;
    label.tabIndex=-1;
    const title=node('h5','reader-card-title',item.title);
    card.append(label,title);
    const body=node('div','report-prose reader-prose');
    addParagraphs(body,item.paragraphs);
    card.append(body);
    const chapterIndex=chapters.findIndex(chapter=>chapter.id===item.chapterId);
    const evidenceId=chapterIndex>=0?`${sectionId}-chapter-${chapterIndex+1}`:fallbackEvidenceId;
    if (evidenceId) {
      const evidenceLink=readingLink('이 풀이의 근거',evidenceId,'reader-detail-link');
      evidenceLink.setAttribute('aria-label',`${item.label} 풀이의 근거 보기`);
      card.append(evidenceLink);
    }
    cards.append(card);
    const groupName=typeof item.navGroup==='string'?item.navGroup:'';
    if (!navGroups.has(groupName)) {
      const group=node('div','reader-topic-group');
      if (groupName) group.append(node('p','reader-topic-group-label',groupName));
      const links=node('div','reader-topic-links');
      group.append(links);
      navGroups.set(groupName,links);
      topicNav.append(group);
    }
    navGroups.get(groupName).append(readingLink(item.label,headingId,'reader-topic-link'));
  }
  section.append(topicNav,cards);
  return section;
}

function fullReadingDetails(sectionId, chapters, advice, extra = null) {
  const details=node('details','reading-full-text');
  details.id=`${sectionId}-details`;
  const summary=node('summary','full-reading-toggle');
  summary.append(node('span','','계산·해석 자료 펼쳐보기'),node('small','',`${chapters.length}개 단원`));
  details.append(summary);
  const body=node('div','full-reading-body');
  if (chapters.length>3) {
    const outline=node('details','chapter-outline');
    outline.append(node('summary','','단원 바로가기'));
    const list=node('ol');
    chapters.forEach((chapter,index)=>{
      const item=node('li');
      item.append(readingLink(chapter.title,`${sectionId}-chapter-${index+1}`));
      list.append(item);
    });
    if (advice?.length) {
      const item=node('li');
      item.append(readingLink('생활 제안',`${sectionId}-advice`));
      list.append(item);
    }
    outline.append(list);
    body.append(outline);
  }
  chapters.forEach((chapter,index)=>body.append(chapterView(chapter,index,sectionId)));
  if (extra) extra(body);
  details.append(body);
  return details;
}

function moreAdvice(advice, sectionId) {
  const suggestions=adviceView(advice,sectionId);
  if (!suggestions) return null;
  const details=node('details','reading-more-advice');
  details.append(node('summary','full-reading-toggle','생활에 적용해 보기'),suggestions);
  return details;
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

function adviceView(advice, sectionId) {
  if (!advice?.length) return null;
  const section=node('section','reading-advice');
  section.id=`${sectionId}-advice`;
  section.tabIndex=-1;
  section.setAttribute('aria-labelledby',`${section.id}-title`);
  const title=node('p','advice-section-title','오쭈다의 생활 제안');
  title.id=`${section.id}-title`;
  title.tabIndex=-1;
  section.append(title);
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

function guideView(guide, glossary, adviceNotice) {
  const {section,body}=supportDetails('reading-guide','풀이 안내·용어','reading-guide');
  addParagraphs(body,guide?.paragraphs||['계산 근거는 각 단원 아래에서 펼쳐볼 수 있어요.']);
  if (adviceNotice) body.append(node('p','advice-notice',adviceNotice));
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
    body.append(details);
  }
  return section;
}

function reportSection(section, advice, overview, period=null) {
  const container = node('section', 'report-section');
  const sectionId = `reading-${section.id}`;
  container.id = sectionId;
  container.tabIndex=-1;
  container.setAttribute('aria-labelledby', `${sectionId}-title`);
  const header = node('header', 'report-section-heading');
  const title = node('h3', '', overview?.title || section.title);
  title.id = `${sectionId}-title`;
  title.tabIndex = -1;
  header.append(title);
  if (period?.start?.label && period?.end?.label) header.append(node('p','reading-period',`${period.start.label}부터 ${period.end.label} 전까지`));
  container.append(header);
  const full=fullReadingDetails(sectionId,section.chapters,advice,body=>{
    const originalIntro=node('header','full-reading-intro');
    if (section.kicker) originalIntro.append(node('p','reading-kind',section.kicker));
    originalIntro.append(node('h4','',section.title));
    if (section.summary) originalIntro.append(node('p','report-prose',section.summary));
    body.prepend(originalIntro);
  });
  container.append(readerOverview(overview,sectionId,section.chapters),full);
  const suggestions=moreAdvice(advice,sectionId);
  if (suggestions) container.append(suggestions);
  return container;
}

function monthView(month, calculated, open, overview) {
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
  if (overview?.headline) intro.append(node('span','month-headline',overview.headline));
  const mark = node('span', 'month-toggle-symbol', '＋');
  mark.setAttribute('aria-hidden', 'true');
  summary.append(number, intro, mark);
  detail.append(summary);
  const content = node('div', 'month-content');
  const period = month.periodLabel || (calculated?.start?.label && calculated?.end?.label ? `${calculated.start.label} ~ ${calculated.end.label}` : '');
  if (period) content.append(node('p', 'month-period', period));
  content.append(readerOverview(overview,detail.id,month.chapters,false,null,summary.id));
  const full=fullReadingDetails(detail.id,month.chapters,month.advice,body=>{
    body.append(node('p','month-overview',month.summary));
    if (month.basis?.length || month.reference?.length) {
      const basis=node('details','month-calculation chapter-evidence');
      basis.append(node('summary','','이 달의 날짜와 글자 확인하기'));
      const inner=node('div','chapter-evidence-content');
      addBasis(inner,month.basis);
      addReference(inner,month.reference);
      basis.append(inner);
      body.append(basis);
    }
    addPractice(body,month.practice);
  });
  content.append(full);
  const suggestions=moreAdvice(month.advice,detail.id);
  if (suggestions) content.append(suggestions);
  detail.append(content);
  detail.setAttribute('aria-labelledby', summary.id);
  return detail;
}

function evidenceView(evidence) {
  const {section,body}=supportDetails('reading-evidence','풀이 근거 전체','evidence-section');
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
    body.append(detail);
  }
  return section;
}

function methodView(method, cards=[]) {
  const {section,body}=supportDetails('reading-method','풀이 범위·계산 기준','method-section');
  addParagraphs(body,[method.description,method.reuseNotice],'method-description');
  const scopes=cards.filter(card=>card.scopeNotice);
  if(scopes.length) {
    const block=node('div','method-list');
    block.append(node('h4','','항목별 참고 범위'));
    const list=node('ul');
    for(const card of scopes) list.append(node('li','',`${card.label}: ${card.scopeNotice}`));
    block.append(list);body.append(block);
  }
  for (const [label,items] of [['이 풀이에 담은 것',method.calculated],['아직 계산하지 않은 것',method.notCalculated]]) {
    if (!items?.length) continue;
    const block=node('div','method-list');
    block.append(node('h4','',label));
    const list=node('ul');
    items.forEach(text=>list.append(node('li','',text)));
    block.append(list);body.append(block);
  }
  if (method.warnings?.length) {
    const block=node('div','method-list');
    block.append(node('h4','','시간과 계산의 기준'));
    addParagraphs(block,method.warnings,'method-description');
    body.append(block);
  }
  return section;
}

function sourcesView(topic,year) {
  const {section,body}=supportDetails('reading-sources','자료 출처','sources-section');
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
    body.append(item);
  }
  return section;
}

function monthSpotlight(overviews, currentMonth, year) {
  const start=currentMonth||1;
  const spotlight=node('section','months-spotlight');
  spotlight.setAttribute('aria-label',currentMonth?'지금부터 이어지는 월별 흐름':`${year}년의 시작`);
  spotlight.append(node('p','reader-label',currentMonth?'지금부터 이어지는 흐름':`${year}년의 시작`));
  const cards=node('div','month-spotlight-cards');
  for (const month of [start,start+1].filter(value=>value<=12)) {
    const overview=overviews.get(month);
    if (!overview) continue;
    const card=node('article','month-spotlight-card');
    card.dataset.origin=overview.origin;
    card.dataset.factIds=(overview.factIds||[]).join(' ');
    card.append(node('p','month-spotlight-label',`${month}월${month===currentMonth?' · 지금의 흐름':''}`),node('h4','month-spotlight-headline',overview.headline),readingLink(`${month}월 펼쳐 읽기`,`month-title-${month}`,'reader-detail-link'));
    cards.append(card);
  }
  spotlight.append(cards);
  return spotlight;
}

function monthSection(reading, fortune) {
  const section = node('section', 'report-section months-section');
  section.id = 'reading-months';
  section.tabIndex=-1;
  section.setAttribute('aria-labelledby', 'reading-months-title');
  const header = node('header', 'report-section-heading');
  const title = node('h3', '', `${fortune.year}년, 열두 달의 이야기`);
  title.id = 'reading-months-title';
  title.tabIndex = -1;
  header.append(title, node('p', 'section-summary', '한 달씩, 내게 어떤 흐름으로 읽히는지 살펴보세요.'));
  section.append(header);
  const calculated = new Map(fortune.months.map(month => [month.month, month]));
  const currentMonth = fortune.months.find(month => month.isCurrent)?.month;
  const initiallyOpen = currentMonth || 1;
  const overviews=new Map((reading.reader?.months||[]).map(month=>[month.month,month]));
  section.append(monthSpotlight(overviews,currentMonth,fortune.year));
  const controls = node('div', 'months-controls');
  const periodInfo=node('details','months-period-info');
  periodInfo.append(node('summary','','월별 적용 기간'),node('p','months-note',reading.monthsIntro || '각 달을 펼치면 적용 기간을 볼 수 있어요.'));
  controls.append(periodInfo);
  const expand = node('button', 'secondary-button');
  expand.id = 'toggle-all-months';
  expand.type = 'button';
  controls.append(expand);
  section.append(controls);
  const jumps = node('nav', 'month-jumps');
  jumps.setAttribute('aria-label', '월별 풀이 바로가기');
  jumps.id='reading-month-navigation';
  const details = reading.months.map(month => monthView(month, calculated.get(month.month), month.month === initiallyOpen,overviews.get(month.month)));
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
  const displayDetails=[...details.filter(detail=>Number(detail.dataset.month||detail.id.replace('reading-month-',''))===initiallyOpen),...details.filter(detail=>Number(detail.dataset.month||detail.id.replace('reading-month-',''))!==initiallyOpen)];
  section.append(node('p','month-navigation-label','원하는 달로 바로가기'),jumps, ...displayDetails);
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

function allNavigation(year) {
  const nav=node('nav','all-reading-navigation');
  nav.id='reading-all';
  nav.setAttribute('aria-labelledby','reading-all-title');
  const title=node('h3','','전체 풀이 바로가기');
  title.id='reading-all-title';title.tabIndex=-1;
  nav.append(title);
  const links=node('div','all-reading-links');
  for (const [id,label,detail] of [['lifelong','평생운','나의 바탕과 생활 이야기'],['annual','올해운',`${year}년의 흐름`],['months','월별운',`${year}년 1~12월 전체`]]) {
    const link=readingLink('',`reading-${id}`);
    link.append(node('strong','',label),node('span','',detail));links.append(link);
  }
  nav.append(links);
  return nav;
}

function supplementSection(id, reading, className) {
  if (!reading || typeof reading.title!=='string' || typeof reading.headline!=='string'
      || !Array.isArray(reading.paragraphs) || !Array.isArray(reading.items)) {
    throw new Error('추가 풀이를 준비하지 못했어요. 다시 불러와 주세요.');
  }
  const section=node('section',`report-section reader-supplement ${className}`);
  section.id=id;
  section.tabIndex=-1;
  section.dataset.origin=reading.origin;
  section.dataset.factIds=(reading.factIds||[]).join(' ');
  section.setAttribute('aria-labelledby',`${id}-title`);
  const header=node('header','report-section-heading');
  const title=node('h3','',reading.title);
  title.id=`${id}-title`;
  title.tabIndex=-1;
  header.append(title);
  const body=node('div','reader-supplement-content');
  const intro=node('div','reader-intro');
  intro.append(node('h4','reader-headline',reading.headline));
  const prose=node('div','report-prose reader-prose');
  addParagraphs(prose,reading.paragraphs);
  intro.append(prose);
  body.append(intro);
  section.append(header,body);
  return {section,body};
}

function timingPoints(items, title) {
  if (!items?.length) return null;
  const group=node('section','reader-timing-group');
  group.append(node('h5','reader-timing-kind',title));
  const list=node('dl','reader-timing-points');
  for (const item of items) {
    const point=node('div','reader-timing-point');
    if (item.topic) point.dataset.topic=item.topic;
    point.append(node('dt','',item.label),node('dd','',item.text));
    list.append(point);
  }
  group.append(list);
  return group;
}

function timingsView(timings, reading, fortune) {
  const {section,body}=supplementSection('reading-timings',timings,'reader-timings');
  const nav=node('nav','reader-topic-nav reader-timing-navigation');
  nav.setAttribute('aria-label','기회와 주의할 시기 월별 바로가기');
  const links=node('div','reader-topic-links');
  const months=new Map(reading.months.map(month=>[month.month,month]));
  const currentMonth=fortune.months.find(month=>month.isCurrent)?.month;
  const initiallyOpen=currentMonth||timings.items[0]?.month;
  const list=node('div','reader-timing-list');
  for (const item of timings.items) {
    const headingId=`reading-timings-month-${item.month}`;
    links.append(readingLink(`${item.month}월`,headingId,'reader-topic-link'));
    const article=node('details','reader-timing-card');
    article.open=item.month===initiallyOpen;
    article.dataset.month=String(item.month);
    article.dataset.origin=item.origin||timings.origin;
    article.dataset.factIds=(item.factIds||[]).join(' ');
    article.setAttribute('aria-labelledby',headingId);
    const summary=node('summary','reader-timing-heading');
    summary.id=headingId;
    const heading=node('h4','reader-timing-summary');
    if (item.month===currentMonth) heading.append(node('span','reader-label','지금의 흐름'));
    heading.append(node('span','reader-timing-title',item.title));
    if (item.headline) heading.append(node('span','reader-timing-headline',item.headline));
    if (item.periodLabel) heading.append(node('span','reader-timing-period',item.periodLabel));
    summary.append(heading);
    const content=node('div','reader-timing-content');
    const prose=node('div','report-prose reader-prose');
    addParagraphs(prose,item.paragraphs);
    if (prose.childNodes.length) content.append(prose);
    const opportunities=timingPoints(item.opportunities,'기회로 읽는 부분');
    const people=timingPoints(item.people,'도움을 구해 볼 사람');
    const documents=timingPoints(item.documents,'문서와 계약을 살필 때');
    const cautions=timingPoints(item.cautions,'주의해서 볼 부분');
    if (opportunities) content.append(opportunities);
    if (people) content.append(people);
    if (documents) content.append(documents);
    if (cautions) content.append(cautions);
    const actionLinks=node('div','reader-inline-links');
    actionLinks.append(readingLink(`${item.month}월 운세 함께 읽기`,`month-title-${item.month}`,'reader-detail-link'));
    const chapterIndex=months.get(item.month)?.chapters.findIndex(chapter=>chapter.id===item.chapterId)??-1;
    if (chapterIndex>=0) {
      const evidence=readingLink('이 시기의 근거',`reading-month-${item.month}-chapter-${chapterIndex+1}`,'reader-detail-link');
      evidence.setAttribute('aria-label',`${item.month}월 시기 해석의 근거 보기`);
      actionLinks.append(evidence);
    }
    content.append(actionLinks);
    article.append(summary,content);
    if (item.month===initiallyOpen) list.prepend(article);
    else list.append(article);
  }
  nav.append(links);
  body.append(nav,list);
  return section;
}

function symbolsView(symbols) {
  const {section,body}=supplementSection('reading-symbols',symbols,'reader-symbols');
  const list=node('div','reader-symbol-list');
  for (const item of symbols.items) {
    const article=node('article','reader-symbol-item');
    article.append(node('h4','reader-card-label',item.label),node('h5','reader-card-title',item.value));
    const prose=node('div','report-prose reader-prose');
    addParagraphs(prose,[item.description]);
    article.append(prose);
    list.append(article);
  }
  body.append(list);
  if (symbols.sources?.length) {
    const details=node('details','reading-full-text reader-symbol-sources');
    details.id='reading-symbols-sources';
    details.append(node('summary','full-reading-toggle','색·숫자·방향의 자료 출처'));
    const sourceBody=node('div','full-reading-body');
    for (const source of symbols.sources) {
      const article=node('article','source-entry');
      const title=node('h4','source-title');
      const link=node('a','',source.title);
      link.href=source.url;
      link.target='_blank';
      link.rel='noopener noreferrer';
      link.setAttribute('aria-label',`${source.title} · 새 탭에서 열기`);
      title.append(link);
      article.append(title,node('p','source-use',source.usedFor),node('p','source-limitation',source.limitation));
      sourceBody.append(article);
    }
    details.append(sourceBody);
    body.append(details);
  }
  return section;
}

function addRelatedTopics(nav, links) {
  if (!nav || !links.length) return;
  const group=node('div','reader-topic-group reader-related-topics');
  group.append(node('p','reader-topic-group-label','함께 보기'));
  const list=node('div','reader-topic-links');
  for (const [label,target] of links) list.append(readingLink(label,target,'reader-topic-link'));
  group.append(list);
  nav.append(group);
}

function daeunView(reading) {
  const section=node('section','report-section reader-daeun');
  section.id='reading-daeun';section.tabIndex=-1;
  section.setAttribute('aria-labelledby','reading-daeun-title');
  const header=node('header','report-section-heading');
  const title=node('h3','',reading.title);
  title.id='reading-daeun-title';
  header.append(title);
  section.append(header);
  if(!reading.available) {
    section.append(node('p','reader-scope-note',reading.message));
    return section;
  }
  const intro=node('div','report-prose reader-prose');
  intro.append(node('h4','reader-headline',reading.headline));
  addParagraphs(intro,reading.paragraphs);
  section.append(intro);
  const nav=node('nav','reader-topic-links daeun-nav');
  nav.setAttribute('aria-label','10년 흐름 바로가기');
  const list=node('div','daeun-periods');
  for(const period of reading.periods) {
    const targetId=period.id+'-title';
    nav.append(readingLink(period.ageLabel+(period.isCurrent?' · 지금':''),targetId,'reader-topic-link'));
    const details=node('details','daeun-period');
    details.dataset.daeunPeriod=period.id;
    details.dataset.factIds=period.factIds.join(' ');
    details.classList.toggle('is-current',period.isCurrent);
    details.open=period.isCurrent||(!reading.currentIndex&&period===reading.periods[0]);
    const summary=node('summary','daeun-period-summary');
    const heading=node('h4','daeun-age',period.ageLabel);
    heading.id=targetId;heading.tabIndex=-1;
    if(period.isCurrent)summary.append(node('span','daeun-current','지금의 흐름'));
    summary.append(heading,node('span','daeun-subtitle',period.subtitle));
    const body=node('div','daeun-period-body');
    body.append(node('p','daeun-dates',period.periodLabel));
    const prose=node('div','report-prose reader-prose');
    addParagraphs(prose,period.paragraphs);
    body.append(prose);
    for(const topic of period.topics) {
      const article=node('article','daeun-topic');
      article.dataset.daeunTopic=topic.id;
      article.dataset.factIds=topic.factIds.join(' ');
      article.append(node('h5','reader-card-label',topic.label),node('h6','reader-card-title',topic.title));
      const paragraphs=node('div','report-prose reader-prose');
      addParagraphs(paragraphs,topic.paragraphs);
      article.append(paragraphs);
      body.append(article);
    }
    body.append(readingLink('이 시기의 계산 근거','reading-daeun-evidence','reader-detail-link'));
    details.append(summary,body);
    if(period.isCurrent)list.prepend(details);
    else list.append(details);
  }
  section.append(nav,list);
  const evidence=node('details','reading-full-text daeun-evidence');
  evidence.id='reading-daeun-evidence';evidence.tabIndex=-1;
  evidence.append(node('summary','full-reading-toggle','10년 흐름의 계산 근거 펼쳐보기'));
  const body=node('div','full-reading-body');
  if(reading.method?.label)body.append(node('p','reading-kind',reading.method.label));
  addParagraphs(body,[reading.methodNotice,...(reading.method?.notes||[])],'method-description');
  const facts=node('dl','evidence-rows');
  for(const fact of reading.facts) {
    const row=node('div','evidence-row');
    row.dataset.factId=fact.id;row.dataset.origin=fact.origin;
    row.append(node('dt','',fact.label),node('dd','',fact.value));
    facts.append(row);
  }
  body.append(facts);
  for(const source of reading.sources||[]) {
    const article=node('article','source-entry');
    const heading=node('h4','source-title');
    const link=node('a','',source.title);
    link.href=source.url;link.target='_blank';link.rel='noopener noreferrer';
    heading.append(link);
    article.append(heading,node('p','source-publisher',source.publisher),node('p','source-use',source.usedFor),node('p','source-limitation',source.limitation));
    body.append(article);
  }
  evidence.append(body);section.append(evidence);
  return section;
}

/** Render both people's interpretation and every comparison fact together. */
export function renderCompatibilityReport(container, reading) {
  if (!reading || !Array.isArray(reading.facts) || !Array.isArray(reading.cards)) {
    throw new Error('궁합 풀이를 준비하지 못했어요. 다시 불러와 주세요.');
  }
  const sectionId='compatibility-reading';
  const section=node('section','report-section compatibility-reading');
  section.id=sectionId;
  section.tabIndex=-1;
  section.setAttribute('aria-labelledby',`${sectionId}-title`);
  const header=node('header','report-section-heading');
  const title=node('h3','',reading.title);
  title.id=`${sectionId}-title`;
  title.tabIndex=-1;
  header.append(title);
  section.append(header);
  const overview=readerOverview({
    ...reading,
    origin:reading.origin||'service-reference',
    factIds:reading.factIds||reading.facts.map(fact=>fact.id)
  },sectionId,[],false,`${sectionId}-evidence`);
  if (reading.scopeNotice) overview.querySelector('.reader-intro').append(node('p','reader-scope-note',reading.scopeNotice));
  section.append(overview);
  const details=node('details','reading-full-text compatibility-evidence');
  details.id=`${sectionId}-evidence`;
  details.tabIndex=-1;
  const summary=node('summary','full-reading-toggle');
  summary.append(node('span','','궁합 계산 근거 펼쳐보기'),node('small','',`${reading.facts.length}개 항목`));
  const body=node('div','full-reading-body');
  if (reading.methodNotice) addParagraphs(body,[reading.methodNotice],'method-description');
  const facts=node('dl','evidence-rows');
  for (const fact of reading.facts) {
    const row=node('div','evidence-row');
    row.dataset.factId=fact.id;
    row.dataset.origin=fact.origin;
    row.append(node('dt','',fact.label),node('dd','',fact.value));
    facts.append(row);
  }
  body.append(facts);
  details.append(summary,body);
  section.append(details);
  container.replaceChildren(section);
}

/** Render plain-text reading data atomically, preserving the prior view on error. */
export function renderDetailedReport(container, {reading, fortune, topic}) {
  const sections = reading?.sections;
  const months = reading?.months;
  const method = reading?.methodByCategory?.[topic] || reading?.method;
  if (!['lifelong','annual','monthly','all'].includes(topic) || !method || !Array.isArray(reading.evidence?.[topic]?.groups)) {
    throw new Error('선택한 풀이의 계산 근거를 준비하지 못했어요. 다시 불러와 주세요.');
  }
  if (['monthly','all'].includes(topic) && (!Array.isArray(months) || months.length!==12 || new Set(months.map(month=>month.month)).size!==12
      || months.some(month=>!Number.isInteger(month.month)||month.month<1||month.month>12||!Array.isArray(month.chapters)))) {
    throw new Error('월별 풀이를 모두 준비하지 못했어요. 다시 불러와 주세요.');
  }
  const fragment = document.createDocumentFragment();
  const relatedTopics=[];
  if (topic==='all') fragment.append(allNavigation(fortune.year));
  const visibleTopics=topic==='all'?['lifelong','annual']:topic==='monthly'?[]:[topic];
  for (const item of visibleTopics) {
    const section=sections?.find(value=>value.id===item);
    if (!section?.chapters?.length) throw new Error('선택한 풀이를 준비하지 못했어요.');
    fragment.append(reportSection(section,reading.adviceByCategory?.[item],reading.reader?.[item],item==='annual'?fortune.annual:null));
    if(item==='lifelong'&&reading.daeun) {
      fragment.append(daeunView(reading.daeun));
      relatedTopics.push(['10년 단위 흐름','reading-daeun']);
    }
  }
  if (['monthly','all'].includes(topic)) fragment.append(monthSection({...reading,months:[...months].sort((a,b)=>a.month-b.month)},fortune));
  if (['monthly','all'].includes(topic) && reading.reader?.timings) {
    fragment.append(timingsView(reading.reader.timings,reading,fortune));
    relatedTopics.push(['기회와 주의할 시기','reading-timings']);
  }
  if (['lifelong','all'].includes(topic) && reading.reader?.symbols) {
    fragment.append(symbolsView(reading.reader.symbols));
    relatedTopics.push(['색·숫자·방향','reading-symbols']);
  }
  if (['lifelong','all'].includes(topic)) relatedTopics.push(['상대와의 궁합','compatibility-section']);
  fragment.append(guideView(reading.guide,reading.glossary,reading.adviceNotice),evidenceView(reading.evidence[topic]),methodView(method,['lifelong','all'].includes(topic)?reading.reader.lifelong.cards:[]),sourcesView(topic,fortune.year));
  const summaryTarget=topic==='monthly'?fragment.querySelector('.months-spotlight'):fragment.querySelector('.reader-intro');
  const topicsTarget=topic==='monthly'?fragment.querySelector('.month-reading[open] .reader-topic-nav'):fragment.querySelector('.reader-topic-nav');
  const detailTarget=topic==='monthly'?fragment.querySelector('.month-reading[open] .reading-full-text>.full-reading-toggle'):fragment.querySelector('.reading-full-text>.full-reading-toggle');
  if (summaryTarget) { summaryTarget.id='reading-summary';summaryTarget.tabIndex=-1; }
  if (summaryTarget && reading.reader?.scopeNotice) summaryTarget.append(node('p','reader-scope-note',reading.reader.scopeNotice));
  if (topicsTarget) { topicsTarget.id='reading-topics';topicsTarget.tabIndex=-1; }
  addRelatedTopics(topicsTarget,relatedTopics);
  if (detailTarget) { detailTarget.id='reading-details';detailTarget.tabIndex=-1; }
  container.replaceChildren(fragment);
}
