import {getReadingSources} from './sources.mjs?v=20261113-saju-reader1';
import {applyReadingSummaryViews} from './reading-summary-view.mjs?v=20261113-saju-summary1';
import {applyReadingScoreViews} from './reading-score-view.mjs?v=20261114-saju-wind1';
import {createCompatibilityScoreboard} from './compatibility-score-view.mjs?v=20261114-saju-wind1';
import {createCompatibilityPeoplePages,createCompatibilityPager} from './compatibility-people-view.mjs?v=20261114-saju-slide1';
import {attachReadingSwipe} from './reading-swipe.mjs?v=20261114-saju-slide1';
import {createReadingMotion} from './reading-motion.mjs?v=20261114-saju-slide1';

const readingPagers=new WeakMap();
const pagerDocuments=new WeakSet();

function revealPagedTarget(target) {
  const container=target?.closest('[data-reader-paged]');
  return container?readingPagers.get(container)?.reveal(target):false;
}

export function restoreReadingPage(container,pageId) {
  if(typeof pageId!=='string'||!pageId)return false;
  const target=[...container.querySelectorAll('[data-reader-page]')].find(element=>element.id===pageId);
  return target?Boolean(revealPagedTarget(target)):false;
}

function watchReadingTargets(doc) {
  if(pagerDocuments.has(doc))return;
  pagerDocuments.add(doc);
  doc.addEventListener('click',event=>{
    if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.target.closest?.('a[href^="#"]');
    const target=link&&doc.getElementById(link.hash.slice(1));
    if(target&&revealPagedTarget(target))target.focus({preventScroll:true});
  },true);
  doc.defaultView?.addEventListener('hashchange',()=>{
    const target=doc.getElementById(doc.defaultView.location.hash.slice(1));
    if(target&&revealPagedTarget(target)) {
      target.focus({preventScroll:true});
      target.scrollIntoView({block:'start',behavior:'instant'});
    }
  });
}

function node(tag, className, text) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (text != null) value.textContent = text;
  return value;
}

function addParagraphs(parent, paragraphs, className = '') {
  const isStory=parent.classList.contains('reader-prose')||parent.classList.contains('easy-reading');
  for (const text of paragraphs || []) {
    if (typeof text !== 'string' || !text.trim()) continue;
    const paragraph=node('p',className);
    const parts=isStory?readingSentenceGroups(text):[text];
    if(parts.length===1)paragraph.textContent=text;
    else for(const part of parts)paragraph.append(node('span','reader-sentence-group',part));
    parent.append(paragraph);
  }
}

// Keep every original character (including spaces) for copying and evidence.
// Only long stories gain visual breaks at complete sentence boundaries.
function readingSentenceGroups(text) {
  if(text.length<180)return [text];
  const parts=[];
  let start=0,sentences=0;
  for(const match of text.matchAll(/[.!?。！？…]+[”’"'」』)\]]*\s+/gu)) {
    const end=match.index+match[0].length;
    sentences++;
    if((end-start<90&&sentences<3)||text.length-end<45)continue;
    parts.push(text.slice(start,end));
    start=end;sentences=0;
  }
  parts.push(text.slice(start));
  return parts;
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
    revealPagedTarget(target);
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

function readingSummaryTable(captionText, columns, className) {
  const table=node('table',`reading-summary-table ${className}`);
  // Explicit roles preserve the native table relationships when small screens
  // display each row as a card instead of squeezing several narrow columns.
  table.setAttribute('role','table');
  table.append(node('caption','reading-summary-caption',captionText));
  const head=node('thead');head.setAttribute('role','rowgroup');
  const headings=node('tr');headings.setAttribute('role','row');
  for(const text of columns) {
    const cell=node('th','',text);
    cell.scope='col';cell.setAttribute('role','columnheader');
    headings.append(cell);
  }
  head.append(headings);
  const body=node('tbody');body.setAttribute('role','rowgroup');
  table.append(head,body);
  return {table,body};
}

function summaryCell(label,className='') {
  const cell=node('td',className);cell.setAttribute('role','cell');
  const mobileLabel=node('span','summary-cell-label',label);
  mobileLabel.setAttribute('aria-hidden','true');
  cell.append(mobileLabel);
  return cell;
}

function summaryLink(label,targetId,accessibleLabel) {
  const link=readingLink(label,targetId,'summary-row-link');
  link.setAttribute('aria-label',accessibleLabel);
  const arrow=node('span','summary-link-arrow','↓');arrow.setAttribute('aria-hidden','true');
  link.append(arrow);
  return link;
}

function portraitSummaryTable(portrait) {
  const {table,body}=readingSummaryTable('한눈에 보는 나',['상황','내 모습'],'portrait-summary-table');
  for(const [index,item] of portrait.cards.entries()) {
    const row=node('tr');row.setAttribute('role','row');
    row.dataset.portraitCard=item.id;
    const label=node('th','summary-row-heading');
    label.scope='row';label.setAttribute('role','rowheader');
    label.append(summaryLink(item.label,`person-portrait-topic-${index+1}`,`${item.label} 자세한 풀이로 이동`));
    const description=summaryCell('내 모습','summary-person-description');
    description.append(node('p','summary-cell-text',item.title));
    row.append(label,description);body.append(row);
  }
  return table;
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
    card.append(heading);
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

function personPortraitView(portrait, facts, original, visibleScopeNotice='') {
  const validText=value=>typeof value==='string'&&value.trim();
  if(!portrait||!validText(portrait.title)||!validText(portrait.headline)
    ||!Array.isArray(portrait.paragraphs)||!portrait.paragraphs.length||portrait.paragraphs.some(value=>!validText(value))
    ||!Array.isArray(portrait.cards)||!portrait.cards.length||!Array.isArray(portrait.factIds)||!Array.isArray(facts)
    ||portrait.cards.some(card=>!validText(card.id)||!validText(card.label)||!validText(card.title)
      ||!Array.isArray(card.paragraphs)||!card.paragraphs.length||card.paragraphs.some(value=>!validText(value))
      ||!Array.isArray(card.factIds)||!card.factIds.length)) {
    throw new Error('나의 성격 풀이를 준비하지 못했어요. 다시 불러와 주세요.');
  }
  const registry=new Map(facts.map(fact=>[fact.id,fact]));
  const factIds=[...new Set([...portrait.factIds,...portrait.cards.flatMap(card=>card.factIds)])];
  if(factIds.some(id=>!registry.has(id)))throw new Error('성격 풀이의 계산 근거를 확인하지 못했어요.');
  const section=node('section','person-portrait reader-overview');
  section.id='reading-person-portrait';
  section.dataset.origin=portrait.origin||'service-reference';
  section.dataset.factIds=factIds.join(' ');
  section.setAttribute('aria-labelledby','person-portrait-headline');
  const intro=node('header','reader-intro portrait-intro');
  const headline=node('h4','reader-headline portrait-headline',portrait.headline);
  headline.id='person-portrait-headline';headline.tabIndex=-1;
  const prose=node('div','report-prose reader-prose portrait-prose');
  addParagraphs(prose,portrait.paragraphs);
  intro.append(headline,portraitSummaryTable(portrait),prose);
  section.append(intro);

  // The portrait table already links to all five personal stories. The contents
  // below cover the remaining life topics without repeating those same buttons.
  const topics=original.querySelector('.reader-topic-nav');
  const cards=node('div','portrait-cards');
  for(const [index,item] of portrait.cards.entries()) {
    const card=node('article','portrait-card');
    const headingId=`person-portrait-topic-${index+1}`;
    card.setAttribute('aria-labelledby',headingId);
    card.dataset.portraitCard=item.id;
    card.dataset.origin=item.origin||portrait.origin||'service-reference';
    card.dataset.factIds=item.factIds.join(' ');
    const label=node('h4','portrait-card-label');
    label.id=headingId;label.tabIndex=-1;
    const number=node('span','portrait-card-number',String(index+1).padStart(2,'0'));
    number.setAttribute('aria-hidden','true');
    label.append(number,document.createTextNode(item.label));
    card.append(label,node('h5','portrait-card-title',item.title));
    const body=node('div','report-prose reader-prose portrait-prose');
    addParagraphs(body,item.paragraphs);
    const evidenceLink=readingLink('이 성격 풀이의 근거','reading-person-portrait-evidence','reader-detail-link');
    evidenceLink.setAttribute('aria-label',`${item.label} 풀이의 근거 보기`);
    card.append(body,evidenceLink);
    cards.append(card);
  }
  section.append(topics,cards);

  const evidence=node('details','portrait-evidence');
  evidence.id='reading-person-portrait-evidence';evidence.tabIndex=-1;
  evidence.append(node('summary','full-reading-toggle','이 성격 풀이의 근거'));
  const evidenceBody=node('div','full-reading-body');
  addParagraphs(evidenceBody,[portrait.methodNotice,portrait.selectionNotice,portrait.scopeNotice===visibleScopeNotice?'':portrait.scopeNotice],'method-description');
  const rows=node('dl','evidence-rows');
  for(const id of factIds) {
    const fact=registry.get(id);
    const row=node('div','portrait-evidence-row evidence-row');
    row.dataset.factId=id;
    row.append(node('dt','',fact.label),node('dd','',fact.text));
    rows.append(row);
  }
  evidenceBody.append(rows,readingLink('전체 사주 계산과 자료 보기','reading-evidence','reader-detail-link'));
  evidence.append(evidenceBody);section.append(evidence);

  // Keep the prior explanations available, without repeating them before the
  // new answer to "what kind of person am I?". Existing anchors still reveal it.
  const extra=node('details','portrait-previous');
  extra.id='reading-personality-more';
  extra.append(node('summary','full-reading-toggle','성격·적성의 다른 풀이'));
  const extraBody=node('div','portrait-previous-body');
  extraBody.append(original.querySelector('.reader-intro'));
  for(const id of ['natal-character','natal-aptitude','natal-life-path']) {
    const card=original.querySelector(`[data-reader-card="${id}"]`);
    if(card)extraBody.append(card);
  }
  extra.append(extraBody);
  original.append(extra);
  return section;
}

function reportSection(section, advice, overview, period=null, portrait=null, facts=[], scopeNotice='') {
  const container = node('section', 'report-section');
  const sectionId = `reading-${section.id}`;
  container.id = sectionId;
  container.tabIndex=-1;
  container.setAttribute('aria-labelledby', `${sectionId}-title`);
  const header = node('header', 'report-section-heading');
  const title = node('h3', '', portrait?.title || overview?.title || section.title);
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
  const original=readerOverview(overview,sectionId,section.chapters);
  if(portrait)container.append(personPortraitView(portrait,facts,original,scopeNotice));
  container.append(original,full);
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
  header.append(title, node('p', 'section-summary', '한 달씩 골라 일·돈·관계에서 살펴볼 점을 읽어 보세요.'));
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
      revealPagedTarget(detail);
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
  for (const [id,label,detail] of [['lifelong','평생운','내 성격과 생활 이야기'],['annual','올해운',`${year}년의 흐름`],['months','월별운',`${year}년 1~12월 전체`]]) {
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

function timingSummaryTable(timings) {
  const items=[...timings.items].sort((a,b)=>a.month-b.month);
  if(items.length!==12||new Set(items.map(item=>item.month)).size!==12
    ||items.some(item=>!Number.isInteger(item.month)||item.month<1||item.month>12
      ||typeof item.periodLabel!=='string'||!item.periodLabel.trim()
      ||[item.opportunities,item.cautions].some(points=>!Array.isArray(points)
        ||points.some(point=>typeof point.label!=='string'||!point.label.trim())))) {
    throw new Error('월별 기회와 주의점의 계산 내용을 모두 준비하지 못했어요.');
  }
  const {table,body}=readingSummaryTable('월별 기회와 주의점 한눈에 보기',
    ['월과 기간','살릴 기회','조심할 상황'],'timing-summary-table');
  for(const item of items) {
    const row=node('tr');row.setAttribute('role','row');row.dataset.month=String(item.month);
    row.dataset.factIds=(item.factIds||[]).join(' ');
    const month=node('th','summary-row-heading');month.scope='row';month.setAttribute('role','rowheader');
    month.append(summaryLink(`${item.month}월`,`reading-timings-month-${item.month}`,`${item.month}월 기회와 주의점 자세히 읽기`),
      node('p','summary-period',item.periodLabel));
    row.append(month);
    for(const [key,label] of [['opportunities','살릴 기회'],['cautions','조심할 상황']]) {
      const cell=summaryCell(label,`summary-${key}`);
      const list=node('ul','summary-points');
      for(const point of item[key]) {
        const text=node('li','summary-point',point.label);
        if(point.topic)text.dataset.topic=point.topic;
        list.append(text);
      }
      cell.append(list);row.append(cell);
    }
    body.append(row);
  }
  return table;
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
    content.append(node('h5','reader-timing-kind','나의 성향과 이 시기의 주의점'));
    const prose=node('div','report-prose reader-prose');
    addParagraphs(prose,item.paragraphs);
    if (prose.childNodes.length) content.append(prose);
    const opportunities=timingPoints(item.opportunities,'이 기간에 살릴 기회');
    const people=timingPoints(item.people,'도움을 구해 볼 사람');
    const documents=timingPoints(item.documents,'문서와 계약을 살필 때');
    const cautions=timingPoints(item.cautions,'이 기간에 조심할 상황과 대처');
    if (cautions) content.append(cautions);
    if (opportunities) content.append(opportunities);
    if (people) content.append(people);
    if (documents) content.append(documents);
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
  const comparison=node('details','timing-table-details');
  const comparisonToggle=node('summary','full-reading-toggle');
  comparisonToggle.append(node('span','','열두 달 비교표'),node('small','','12개월'));
  const comparisonBody=node('div','timing-table-body');
  comparisonBody.append(timingSummaryTable(timings));
  comparison.append(comparisonToggle,comparisonBody);
  body.append(nav,comparison,list);
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
  if(reading.timeAssumed===true)section.append(node('p','reader-scope-note daeun-time-notice',reading.birthTimeNotice));
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
    details.id=period.id;
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
    for(const topic of [...period.topics,...(period.situations||[])]) {
      const article=node('article','daeun-topic');
      article.id=topic.id;
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
export function renderCompatibilityReport(container, reading, {names=[]}={}) {
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
  const pages=createCompatibilityPeoplePages(reading,{names,appendParagraphs:addParagraphs});
  section.append(...pages.map(page=>page.element));
  const score=createCompatibilityScoreboard(reading.score);score.id='compatibility-scores';
  section.append(score);pages.push({element:score,label:'궁합 점수',group:'두 사람의 궁합'});
  const overview=readerOverview({
    ...reading,
    origin:reading.origin||'service-reference',
    factIds:reading.factIds||reading.facts.map(fact=>fact.id)
  },sectionId,[],false);
  if (reading.scopeNotice) overview.querySelector('.reader-intro').append(node('p','reader-scope-note',reading.scopeNotice));
  section.append(overview);
  const intro=overview.querySelector('.reader-intro');intro.id='compatibility-reading-overview';
  pages.push({element:intro,label:'비교의 핵심',group:'궁합 자세히 읽기'});
  const cards=[...overview.querySelectorAll('.reader-card')];
  cards.forEach((element,index)=>{
    element.id=`compatibility-reading-card-${index+1}`;
    pages.push({element,label:reading.cards[index].label,group:'궁합 자세히 읽기'});
  });
  const pager=createCompatibilityPager(section,pages);
  section.dataset.readerPaged='true';readingPagers.set(section,pager);
  watchReadingTargets(section.ownerDocument);
  container.replaceChildren(section);
}

// Keep the purchased reading in its original DOM. Only its current reading unit
// and the ancestors needed to reach it are shown; the calculation is untouched.
function buildReadingPager(root,{reading,fortune,topic}) {
  const pages=[],pageByNode=new Map(),defaults=new Map();
  const find=id=>root.querySelector(`[id="${id}"]`);
  const all=(scope,selector)=>[...(scope?.querySelectorAll(selector)||[])];
  let serial=0,host=root,current=null,lastReading=null,motion=null;
  function add(element,label,group,options={}) {
    if(!element)return null;
    if(pageByNode.has(element))return pageByNode.get(element);
    if(!element.id)element.id=`reading-page-${++serial}`;
    const page={element,id:element.id,label,group,menuGroup:group,kind:'reading',inMenu:true,...options};
    page.focus=element.matches('summary')?element:element.querySelector('h4,h3,h5,h6,summary')||element;
    page.focus.tabIndex=-1;element.tabIndex=-1;element.dataset.readerPage=page.id;
    pages.push(page);pageByNode.set(element,page);return page;
  }
  function cards(scope,overview,prefix,options={}) {
    const nodes=new Map(all(scope,'.reader-card').map(element=>[element.dataset.readerCard,element]));
    for(const item of overview?.cards||[])add(nodes.get(item.id),item.label,`${prefix} · ${item.navGroup||'분야별 풀이'}`,options);
  }
  function materials(scope,prefix,{inMenu=false}={}) {
    for(const full of all(scope,'.reading-full-text').filter(element=>!element.classList.contains('reader-symbol-sources'))) {
      add(full,`${prefix} 계산·해석 자료`,'근거와 자료',{kind:'support',inMenu});
      for(const chapter of all(full,'.report-chapter')) {
        const heading=chapter.querySelector('.chapter-title');
        add(chapter,heading?.lastChild?.textContent||'계산 단원',`${prefix} · 계산 단원`,{kind:'support',inMenu:false});
      }
    }
    for(const advice of all(scope,'.reading-more-advice')) {
      add(advice,`${prefix} 생활 제안`,'생활 제안',{kind:'support',inMenu:true});
      for(const item of all(advice,'.advice-card'))add(item,item.querySelector('.advice-title')?.textContent||'생활 제안',`${prefix} · 생활 제안`,{kind:'support',inMenu:false});
    }
  }
  const lifelong=find('reading-lifelong');
  if(lifelong) {
    const intro=lifelong.querySelector('.portrait-intro')||lifelong.querySelector('.reader-intro');
    const first=add(intro,'나의 성격 요약','평생운 · 나의 성격',{showHeading:true});
    defaults.set(lifelong,first);
    const portraitCards=new Map(all(lifelong,'.portrait-card').map(element=>[element.dataset.portraitCard,element]));
    for(const item of reading.personPortrait?.cards||[])add(portraitCards.get(item.id),item.label,'평생운 · 나의 성격');
    add(lifelong.querySelector('.portrait-previous .reader-intro'),'성격·적성의 다른 풀이','평생운 · 다른 성격 풀이');
    cards(lifelong,reading.reader?.lifelong,'평생운');
    add(find('reading-person-portrait-evidence'),'성격 풀이의 근거','근거와 자료',{kind:'support',inMenu:false});
    materials(lifelong,'평생운',{inMenu:true});
  }
  const daeun=find('reading-daeun');
  if(daeun) {
    const overview=add(daeun,'대운 · 10년 흐름','평생운 · 긴 흐름',{childLinks:false});
    defaults.set(daeun,overview);
    for(const period of all(daeun,'.daeun-period')) {
      const age=period.querySelector('.daeun-age')?.textContent||'10년 구간';
      add(period,age,`10년 흐름 · ${age}`,{inMenu:false});
      for(const part of all(period,'.daeun-topic'))add(part,part.querySelector('.reader-card-label').textContent,`10년 흐름 · ${age}`,{inMenu:false});
    }
    add(find('reading-daeun-evidence'),'10년 흐름의 계산 근거','근거와 자료',{kind:'support',inMenu:false});
  }
  const symbols=find('reading-symbols');
  if(symbols)add(symbols,'색·숫자·방향','평생운 · 생활');
  const annual=find('reading-annual');
  if(annual) {
    const first=add(annual.querySelector('.reader-intro'),`${fortune.year}년 운세 요약`,`${fortune.year}년 올해운`,{showHeading:true});
    defaults.set(annual,first);
    cards(annual,reading.reader?.annual,`${fortune.year}년 올해운`);
    materials(annual,'올해운',{inMenu:true});
  }
  const months=find('reading-months');
  const activeMonth=fortune.months.find(month=>month.isCurrent)?.month||1;
  if(months) {
    add(months.querySelector('.months-spotlight'),'지금부터 두 달 요약',`${fortune.year}년 월별운`,{showHeading:true});
    const overviews=new Map((reading.reader?.months||[]).map(month=>[month.month,month]));
    for(let month=1;month<=12;month++) {
      const element=find(`reading-month-${month}`),group=`${fortune.year}년 월별운 · ${month}월`;
      const first=add(element,`${month}월 운세 요약`,group,{menuGroup:`${fortune.year}년 월별운`});
      const overview=element?.querySelector('.reader-overview');if(overview)defaults.set(overview,first);
      if(month===activeMonth)defaults.set(months,first);
      cards(element,overviews.get(month),group,{group,inMenu:false});
      materials(element,`${month}월`);
      const timing=find(`reading-timings-month-${month}`)?.closest('.reader-timing-card');
      add(timing,`${month}월 기회와 주의점`,group,{inMenu:false});
      for(const part of all(timing,'.reader-timing-group'))add(part,part.querySelector('.reader-timing-kind').textContent,group,{inMenu:false});
    }
    const controls=months.querySelector('.months-controls');
    add(controls,'월별 적용 기간','근거와 자료',{kind:'support',inMenu:false});
    const expand=find('toggle-all-months');if(expand)expand.hidden=true;
    add(find('reading-month-navigation'),'달 선택 목록',`${fortune.year}년 월별운`,{kind:'contents',inMenu:false});
  }
  const timings=find('reading-timings');
  if(timings) {
    const first=add(timings,'월별 기회·주의점과 비교표',`${fortune.year}년 월별운`,{childLinks:false});
    defaults.set(timings,first);
  }
  for(const nav of all(root,'.reader-topic-nav')) {
    if(nav.classList.contains('reader-timing-navigation'))continue;
    // The existing contents remain a reachable page, but are not repeated above
    // every selected subject. Their old IDs and all their links remain intact.
    add(nav,'분야별 목차','읽기 목록',{kind:'contents',inMenu:false});
  }
  for(const [id,label] of [['reading-guide','풀이 안내·용어'],['reading-evidence','풀이 근거 전체'],['reading-method','계산 방법과 범위'],['reading-sources','참고 자료']]) {
    add(find(id),label,'근거와 자료',{kind:'support'});
  }
  const allNav=find('reading-all');
  if(allNav)add(allNav,'전체 풀이 목록','읽기 목록',{kind:'contents',inMenu:false});
  if(!pages.length)throw new Error('읽을 내용을 나누지 못했어요. 다시 불러와 주세요.');

  function parentPage(element) {
    for(let parent=element.parentElement;parent&&parent!==host;parent=parent.parentElement) {
      if(pageByNode.has(parent))return pageByNode.get(parent);
    }
    return null;
  }
  // Month and ten-year summaries offer a short list of their own sections.
  // The original cards and their h4/h5/paragraph order are never moved.
  for(const page of pages) {
    if(page.childLinks===false||page.kind==='contents')continue;
    const children=pages.filter(child=>child!==page&&child.kind!=='contents'&&parentPage(child.element)===page);
    if(!children.length)continue;
    const existingOutline=page.element.querySelector('.chapter-outline');
    if(existingOutline&&page.kind==='support')continue;
    const links=node('nav','reading-page-sections');
    links.setAttribute('aria-label',`${page.label} 세부 내용`);
    const list=node('ul');
    for(const child of children) {
      const item=node('li');item.append(readingLink(child.label,child.id,'reading-page-section-link'));list.append(item);
    }
    links.append(list);page.element.append(links);
  }

  const navigation=node('nav','reading-pager');navigation.id='reading-pager';navigation.tabIndex=-1;
  navigation.setAttribute('aria-label','운세 분야 선택');
  const label=node('label','reading-pager-label','읽을 내용');label.htmlFor='reading-page-select';
  const select=node('select','reading-page-select');select.id='reading-page-select';
  const groups=new Map();
  for(const page of pages.filter(page=>page.inMenu)) {
    if(!groups.has(page.menuGroup)) {
      const group=node('optgroup');group.label=page.menuGroup;groups.set(page.menuGroup,group);select.append(group);
    }
    const option=node('option','',page.label);option.value=page.id;groups.get(page.menuGroup).append(option);
  }
  const temporary=node('optgroup');temporary.label='지금 읽는 세부 내용';
  const controls=node('div','reading-pager-controls');
  const previous=node('button','reading-pager-step','이전');previous.type='button';
  const position=node('p','reading-page-position');position.id='reading-page-position';position.setAttribute('role','status');position.setAttribute('aria-live','polite');
  const next=node('button','reading-pager-step','다음');next.type='button';
  controls.append(previous,position,next);navigation.append(label,select,controls,
    node('p','reading-swipe-hint','본문을 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전 항목으로 넘어가요.'));
  const back=readingLink('다른 분야 고르기','reading-pager','reader-detail-link reading-back-to-picker');

  const managed=new Set();
  for(const page of pages) {
    let element=page.element;
    managed.add(element);
    while(element.parentElement&&element.parentElement!==root) {
      for(const sibling of element.parentElement.children)managed.add(sibling);
      element=element.parentElement;
    }
  }
  for(const element of root.children)managed.add(element);
  const originallyHidden=new Set([...managed].filter(element=>element.hidden));
  for(const element of managed)element.dataset.readerBranch='';
  const readable=pages.filter(page=>page.kind==='reading');
  function show(page,{move=false}={}) {
    if(!page)return false;
    let transition=null;
    if(move&&current&&current!==page)transition=motion?.prepare(Math.sign(pages.indexOf(page)-pages.indexOf(current)));
    else motion?.cancel();
    const contexts=new Set();
    for(let ancestor=page.element;ancestor&&ancestor!==host;ancestor=ancestor.parentElement) {
      if(ancestor.tagName==='DETAILS') {
        ancestor.open=true;
        const summary=ancestor.querySelector(':scope > summary');if(summary)contexts.add(summary);
      }
      if(ancestor.classList.contains('daeun-period')) {
        const dates=ancestor.querySelector('.daeun-dates');if(dates)contexts.add(dates);
      }
      if(ancestor.classList.contains('reader-daeun')) {
        const notice=ancestor.querySelector(':scope > .daeun-time-notice');if(notice)contexts.add(notice);
      }
      if(ancestor.classList.contains('month-reading')) {
        const dates=ancestor.querySelector('.month-period');if(dates)contexts.add(dates);
      }
    }
    if(page.showHeading) {
      const heading=page.element.closest('.report-section')?.querySelector(':scope > .report-section-heading');
      if(heading)contexts.add(heading);
    }
    for(const element of managed) {
      const ownsPage=pageByNode.has(element);
      const visible=element===page.element||element.contains(page.element)
        ||(!ownsPage&&page.element.contains(element))||contexts.has(element);
      element.hidden=originallyHidden.has(element)||!visible;
    }
    if(current)current.element.removeAttribute('data-reader-current');
    current=page;page.element.dataset.readerCurrent='true';
    if(page.kind==='reading')lastReading=page;
    temporary.replaceChildren();temporary.remove();
    if(!page.inMenu) {
      const option=node('option','',`${page.group} · ${page.label}`);option.value=page.id;
      temporary.append(option);select.append(temporary);
    }
    select.value=page.id;
    const index=readable.indexOf(page),siblings=readable.filter(item=>item.group===page.group);
    const supporting=page.kind!=='reading';
    previous.textContent=supporting?'풀이로':'이전';
    previous.disabled=supporting?!lastReading:index<=0;
    next.disabled=supporting||index===readable.length-1;
    position.textContent=supporting?page.label:`${page.group} · ${siblings.indexOf(page)+1} / ${siblings.length}`;
    select.setAttribute('aria-describedby',position.id);
    page.element.append(back);
    if(move) {
      // Keep the picker or step button focused for consecutive keyboard choices.
      // Links into the reading still focus their destination in readingLink().
      navigation.scrollIntoView({block:'start',behavior:transition||document.documentElement.dataset.reducedMotion==='true'?'instant':'smooth'});
    }
    motion?.finish(transition,page.element);
    return true;
  }
  function pageFor(target) {
    if(navigation.contains(target))return null;
    for(let element=target;element&&element!==host;element=element.parentElement) {
      if(pageByNode.has(element))return pageByNode.get(element);
      if(defaults.has(element))return defaults.get(element);
      const contained=pages.find(page=>element.contains(page.element));
      if(contained)return contained;
    }
    return null;
  }
  select.addEventListener('change',()=>show(pages.find(page=>page.id===select.value),{move:true}));
  previous.addEventListener('click',()=>show(current.kind==='reading'?readable[readable.indexOf(current)-1]:lastReading,{move:true}));
  next.addEventListener('click',()=>show(readable[readable.indexOf(current)+1],{move:true}));
  root.prepend(navigation);
  const initial=topic==='monthly'?defaults.get(months):defaults.get(lifelong||annual)||readable[0];
  show(initial);
  return {mount(container) {
    host=container;container.dataset.readerPaged='true';
    motion=createReadingMotion(container,{getCurrentPage:()=>current?.element});
    attachReadingSwipe(container,{previous,next,motion});
    readingPagers.set(container,{reveal:target=>{
      if(!show(pageFor(target)))return false;
      for(let element=target;element&&element!==container;element=element.parentElement) {
        if(element.tagName==='DETAILS')element.open=true;
      }
      return true;
    }});
    watchReadingTargets(container.ownerDocument);
  }};
}

// The result keeps the interpretation, while technical records remain in data.
function removeReadingReferenceViews(root) {
  const removedIds=new Set();
  for(const element of root.querySelectorAll('.reading-full-text,.portrait-evidence,.support-details,.chapter-evidence')) {
    if(element.id)removedIds.add(element.id);
    for(const child of element.querySelectorAll('[id]'))removedIds.add(child.id);
    element.remove();
  }
  for(const link of root.querySelectorAll('a[href^="#"]')) {
    if(removedIds.has(link.getAttribute('href').slice(1)))link.remove();
  }
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
    fragment.append(reportSection(section,reading.adviceByCategory?.[item],reading.reader?.[item],item==='annual'?fortune.annual:null,
      item==='lifelong'?reading.personPortrait:null,reading.facts,reading.reader?.scopeNotice));
    if(item==='lifelong'&&reading.daeun) {
      fragment.append(daeunView(reading.daeun));
      relatedTopics.push(['대운 · 10년 흐름','reading-daeun']);
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
  removeReadingReferenceViews(fragment);
  applyReadingSummaryViews(fragment,reading);
  applyReadingScoreViews(fragment,reading);
  const pager=buildReadingPager(fragment,{reading,fortune,topic});
  container.replaceChildren(fragment);
  pager.mount(container);
}
