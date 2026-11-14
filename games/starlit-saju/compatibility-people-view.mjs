import {attachReadingSwipe} from './reading-swipe.mjs?v=20261114-saju-slide1';
import {createReadingMotion} from './reading-motion.mjs?v=20261114-saju-slide1';
import {createReadingNavigator} from './reading-navigator.mjs?v=20261114-saju-flow1';

const PERSON_KEYS=['self','partner'];
const TOPIC_IDS=['decisions','relationships','work','pressure','adjustment'];

function node(tag,className,text) {
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
}

function checkedPeople(reading) {
  const text=value=>typeof value==='string'&&value.trim().length>0;
  const facts=new Set((reading?.facts||[]).map(fact=>fact.id));
  const block=value=>value&&text(value.id)&&text(value.headline||value.title)
    &&Array.isArray(value.summaryLines)&&value.summaryLines.length===2&&value.summaryLines.every(text)
    &&Array.isArray(value.paragraphs)&&value.paragraphs.length>0&&value.paragraphs.every(text)
    &&Array.isArray(value.factIds)&&value.factIds.length>0&&value.factIds.every(id=>facts.has(id));
  if(!Array.isArray(reading?.people)||reading.people.length!==2
    ||reading.people.some((person,index)=>person.key!==PERSON_KEYS[index]||!block(person)
      ||!Array.isArray(person.cards)||person.cards.length!==TOPIC_IDS.length
      ||person.cards.some((card,index)=>card.topicId!==TOPIC_IDS[index]||!text(card.label)||!block(card)))
    ||!block(reading.synthesis)) {
    throw new Error('두 사람의 성격과 종합 궁합을 준비하지 못했어요. 다시 불러와 주세요.');
  }
  return reading;
}

/** A/B stays visible even when a name is empty or both names are identical. */
export function compatibilityPersonLabels(names=[]) {
  return PERSON_KEYS.map((key,index)=>{
    const name=typeof names[index]?.name==='string'?names[index].name.trim():'';
    const marker=index===0?'A':'B';
    return name?`${marker} · ${name}`:marker;
  });
}

function summaryView(lines,headingTag='h6') {
  const summary=node('div','compatibility-two-line-summary');
  summary.setAttribute('role','group');summary.setAttribute('aria-label','두 줄 요약');
  lines.forEach((text,index)=>summary.append(node(index===0?headingTag:'p','compatibility-summary-line',text)));
  return summary;
}

function proseView(paragraphs,appendParagraphs) {
  const prose=node('div','report-prose reader-prose compatibility-person-prose');
  appendParagraphs(prose,paragraphs);
  return prose;
}

/** Build only text nodes. The caller keeps the detached purchase-gated render. */
export function createCompatibilityPeoplePages(value,{names=[],appendParagraphs}) {
  const reading=checkedPeople(value),labels=compatibilityPersonLabels(names),pages=[];
  for(const topicId of ['overview',...TOPIC_IDS]) {
    const intro=topicId==='overview';
    const label=intro?'성격과 특징':reading.people[0].cards.find(card=>card.topicId===topicId).label;
    const page=node('section','compatibility-people-page');
    page.id=`compatibility-people-${topicId}`;page.dataset.compatibilityTopic=topicId;
    const title=node('h4','compatibility-people-title',label);title.id=`${page.id}-title`;
    page.setAttribute('aria-labelledby',title.id);page.append(title);
    if(intro)page.append(node('p','compatibility-reading-guide','같은 항목에서 A와 B의 모습을 비교해 보세요. 더 궁금하면 각자의 자세한 풀이를 펼쳐 읽어요.'));
    const columns=node('div','compatibility-person-columns');
    for(const [index,person] of reading.people.entries()) {
      const item=intro?person:person.cards.find(card=>card.topicId===topicId);
      const article=node('article','compatibility-person-reading');
      article.id=item.id;article.dataset.personKey=person.key;article.dataset.personMarker=index===0?'A':'B';
      article.dataset.origin=item.origin;article.dataset.factIds=item.factIds.join(' ');
      const name=node('h5','compatibility-person-name',labels[index]);name.id=`${item.id}-name`;
      article.setAttribute('aria-labelledby',name.id);
      article.append(name,summaryView(item.summaryLines));
      const details=node('details','reading-body-details compatibility-person-details');
      const toggle=node('summary','reading-body-toggle',`${index===0?'A':'B'} 자세히 읽기`);
      toggle.id=`${item.id}-detail-toggle`;
      const content=node('div','reading-body-content');content.id=`${item.id}-detail-content`;
      toggle.setAttribute('aria-controls',content.id);
      if(intro&&person.scopeNotice)content.append(node('p','reader-scope-note compatibility-person-scope',person.scopeNotice));
      content.append(proseView(item.paragraphs,appendParagraphs));
      details.append(toggle,content);article.append(details);
      columns.append(article);
    }
    page.append(columns);pages.push({element:page,label,group:'A와 B · 같은 항목 비교'});
  }
  const synthesis=reading.synthesis,page=node('section','compatibility-synthesis');
  page.id='compatibility-synthesis';page.dataset.origin=synthesis.origin;page.dataset.factIds=synthesis.factIds.join(' ');
  const title=node('h4','compatibility-people-title',synthesis.title);title.id='compatibility-synthesis-title';
  page.setAttribute('aria-labelledby',title.id);
  page.append(title,node('p','compatibility-synthesis-people',labels.join(' × ')),summaryView(synthesis.summaryLines,'h5'),
    proseView(synthesis.paragraphs,appendParagraphs));
  pages.push({element:page,label:synthesis.title,group:'두 사람의 궁합'});
  return pages;
}

/** Share the visible domain/item navigation with the ordinary saju reading. */
export function createCompatibilityPager(section,pages) {
  const navigation=node('nav','reading-pager compatibility-reading-pager');
  navigation.id='compatibility-reading-pager';navigation.tabIndex=-1;
  navigation.setAttribute('aria-label','궁합 읽을 내용');
  const label=node('label','reading-pager-label','읽을 내용');label.htmlFor='compatibility-page-select';
  const select=node('select','reading-page-select');select.id='compatibility-page-select';
  const groups=new Map();
  for(const page of pages) {
    if(!page.element.id)throw new Error('궁합 읽기 목록을 준비하지 못했어요.');
    page.element.dataset.compatibilityPage=page.element.id;
    page.focus=page.element.querySelector('h4,h5,h6,summary')||page.element;
    page.focus.tabIndex=-1;page.element.tabIndex=-1;
    if(!groups.has(page.group)) {
      const group=node('optgroup');group.label=page.group;groups.set(page.group,group);select.append(group);
    }
    const option=node('option','',page.label);option.value=page.element.id;groups.get(page.group).append(option);
  }
  const domainForPage=page=>page.element.id==='compatibility-synthesis'?'synthesis'
    :page.element.id==='compatibility-scores'?'scores'
    :page.element.classList.contains('compatibility-people-page')?'people':'details';
  const picker=createReadingNavigator({select,pages,domainForPage,
    domains:[{id:'synthesis',label:'종합'},{id:'people',label:'A·B 성격'},{id:'scores',label:'점수'},{id:'details',label:'자세히'}],
    groupForPage:page=>({synthesis:'두 사람의 종합',people:'같은 항목으로 비교',scores:'점수와 막대',details:'항목별 궁합'})[domainForPage(page)]});
  label.hidden=true;
  const controls=node('div','reading-pager-controls');
  const previous=node('button','reading-pager-step','이전');previous.type='button';previous.dataset.compatibilityStep='previous';
  const position=node('p','reading-page-position');position.id='compatibility-page-position';
  position.setAttribute('role','status');position.setAttribute('aria-live','polite');
  const next=node('button','reading-pager-step','다음');next.type='button';next.dataset.compatibilityStep='next';
  controls.append(previous,position,next);navigation.append(label,select,picker.element,controls,
    node('p','reading-swipe-hint','본문을 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전 항목으로 넘어가요.'));
  select.setAttribute('aria-describedby',position.id);
  picker.toggle.setAttribute('aria-describedby',position.id);

  const managed=new Set();
  for(const page of pages) {
    let element=page.element;managed.add(element);
    while(element.parentElement&&element.parentElement!==section) {
      for(const sibling of element.parentElement.children)managed.add(sibling);
      element=element.parentElement;managed.add(element);
    }
  }
  const back=node('a','reader-detail-link reading-back-to-picker','다른 내용 고르기');back.href=`#${navigation.id}`;
  back.addEventListener('click',event=>{
    if(event.button||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    event.preventDefault();picker.focus({open:true});
    navigation.scrollIntoView({block:'start',behavior:document.documentElement.dataset.reducedMotion==='true'?'instant':'smooth'});
  });
  const readable=pages.filter(page=>!page.support);let current,lastReading,motion=null;
  function show(page,{move=false}={}) {
    if(!page)return false;
    let transition=null;
    if(move&&current&&current!==page)transition=motion?.prepare(Math.sign(pages.indexOf(page)-pages.indexOf(current)));
    else motion?.cancel();
    for(const element of managed)element.hidden=!(element===page.element||element.contains(page.element)||page.element.contains(element));
    if(current)current.element.removeAttribute('data-compatibility-current');
    current=page;page.element.dataset.compatibilityCurrent='true';
    if(!page.support)lastReading=page;
    if(page.element.tagName==='DETAILS')page.element.open=true;
    select.value=page.element.id;
    picker.sync();
    const index=readable.indexOf(page);
    previous.textContent=page.support?'풀이로':'이전';previous.disabled=page.support?!lastReading:index===0;
    next.disabled=page.support||index===readable.length-1;
    position.textContent=page.support?page.label:`${index+1} / ${readable.length} · ${page.label}`;
    page.element.append(back);
    if(move) {
      // Keep focus on the control so arrows and repeated steps keep working.
      navigation.scrollIntoView({block:'start',behavior:transition||document.documentElement.dataset.reducedMotion==='true'?'instant':'smooth'});
    }
    motion?.finish(transition,page.element);
    return true;
  }
  select.addEventListener('change',()=>show(pages.find(page=>page.element.id===select.value),{move:true}));
  previous.addEventListener('click',()=>show(current.support?lastReading:readable[readable.indexOf(current)-1],{move:true}));
  next.addEventListener('click',()=>show(readable[readable.indexOf(current)+1],{move:true}));
  section.querySelector(':scope > .report-section-heading').after(navigation);
  show(readable.find(page=>page.element.id==='compatibility-synthesis')||readable[0]);
  motion=createReadingMotion(section,{getCurrentPage:()=>current?.element});
  attachReadingSwipe(section,{previous,next,motion});
  return {reveal(target) {
    if(navigation.contains(target))return false;
    let page;
    for(let element=target;element&&element!==section;element=element.parentElement) {
      page=pages.find(item=>item.element===element);if(page)break;
    }
    if(!show(page))return false;
    for(let element=target;element&&element!==section;element=element.parentElement)if(element.tagName==='DETAILS')element.open=true;
    return true;
  }};
}

/** Copy follows A's complete story, B's complete story, then their synthesis. */
export function compatibilityPeopleText(value,names=[]) {
  const reading=checkedPeople(value),labels=compatibilityPersonLabels(names),lines=[];
  for(const [index,person] of reading.people.entries()) {
    lines.push(labels[index]+' · 성격과 특징',...person.summaryLines,...person.paragraphs);
    if(person.scopeNotice)lines.push(person.scopeNotice);
    for(const card of person.cards)lines.push('',labels[index]+' · '+card.label,...card.summaryLines,...card.paragraphs);
    lines.push('');
  }
  const synthesis=reading.synthesis;
  lines.push(synthesis.title,...synthesis.summaryLines,...synthesis.paragraphs);
  return lines.join('\n');
}
