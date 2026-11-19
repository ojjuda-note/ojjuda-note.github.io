import {createStoryReader} from './story-reader.mjs?v=20261120-saju-story2';
import {appendReadingDetail,readingDetailText} from './reading-detail.mjs?v=20261114-saju-depth1';

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

function proseView(item,appendParagraphs) {
  const prose=node('div','report-prose reader-prose compatibility-person-prose');
  appendReadingDetail(prose,item,appendParagraphs);
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
    if(intro)page.append(node('p','compatibility-reading-guide','같은 항목에서 A와 B의 모습을 비교해 보세요. 각자의 성향과 생활 예시, 서로 편하게 지낼 방법을 이어서 읽을 수 있어요.'));
    const jumps=node('nav','compatibility-person-jumps');jumps.setAttribute('aria-label','A와 B의 자세한 설명');
    for(const [index,person] of reading.people.entries()) {
      const item=intro?person:person.cards.find(card=>card.topicId===topicId);
      const link=node('a','',`${index===0?'A':'B'}의 설명 보기 ↓`);link.href=`#${item.id}-name`;jumps.append(link);
    }
    page.append(jumps);
    const columns=node('div','compatibility-person-columns');
    for(const [index,person] of reading.people.entries()) {
      const item=intro?person:person.cards.find(card=>card.topicId===topicId);
      const article=node('article','compatibility-person-reading');
      article.id=item.id;article.dataset.personKey=person.key;article.dataset.personMarker=index===0?'A':'B';
      article.dataset.origin=item.origin;article.dataset.factIds=item.factIds.join(' ');
      const name=node('h5','compatibility-person-name',labels[index]);name.id=`${item.id}-name`;name.tabIndex=-1;
      article.setAttribute('aria-labelledby',name.id);
      article.append(name,summaryView(item.summaryLines));
      if(intro&&person.scopeNotice)article.append(node('p','reader-scope-note compatibility-person-scope',person.scopeNotice));
      const content=proseView(item,appendParagraphs);content.id=`${item.id}-detail-content`;
      article.append(content);
      columns.append(article);
    }
    page.append(columns);pages.push({element:page,label,group:'A와 B · 같은 항목 비교'});
  }
  const synthesis=reading.synthesis,page=node('section','compatibility-synthesis');
  page.id='compatibility-synthesis';page.dataset.origin=synthesis.origin;page.dataset.factIds=synthesis.factIds.join(' ');
  const title=node('h4','compatibility-people-title',synthesis.title);title.id='compatibility-synthesis-title';
  page.setAttribute('aria-labelledby',title.id);
  page.append(title,node('p','compatibility-synthesis-people',labels.join(' × ')),summaryView(synthesis.summaryLines,'h5'),
    proseView(synthesis,appendParagraphs));
  pages.push({element:page,label:synthesis.title,group:'두 사람의 궁합'});
  return pages;
}

/** Share the visible domain/item navigation with the ordinary saju reading. */
export function createCompatibilityPager(section,pages) {
  for(const page of pages) {
    page.id=page.element.id;
    page.domain=page.kind==='information'?'information':page.id==='compatibility-synthesis'?'synthesis'
      :page.id.startsWith('compatibility-score')?'scores':page.element.classList.contains('compatibility-people-page')?'people':'details';
  }
  const initialPage=pages.find(page=>page.id==='compatibility-synthesis')||pages[0];
  section.className='compatibility-reading';
  return createStoryReader(section,{pages,initialPage,mode:'compatibility'});
}

/** Copy follows A's complete story, B's complete story, then their synthesis. */
export function compatibilityPeopleText(value,names=[]) {
  const reading=checkedPeople(value),labels=compatibilityPersonLabels(names),lines=[];
  for(const [index,person] of reading.people.entries()) {
    lines.push(labels[index]+' · 성격과 특징',...person.summaryLines,...readingDetailText(person));
    if(person.scopeNotice)lines.push(person.scopeNotice);
    for(const card of person.cards)lines.push('',labels[index]+' · '+card.label,...card.summaryLines,...readingDetailText(card));
    lines.push('');
  }
  const synthesis=reading.synthesis;
  lines.push(synthesis.title,...synthesis.summaryLines,...readingDetailText(synthesis));
  return lines.join('\n');
}
