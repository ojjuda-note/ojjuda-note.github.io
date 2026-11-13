const textNode=(tag,className,text)=>{
  const element=document.createElement(tag);
  element.className=className;
  element.textContent=text;
  return element;
};
const validLines=item=>Array.isArray(item?.summaryLines)&&item.summaryLines.length===2
  &&item.summaryLines.every(line=>typeof line==='string'&&line.trim());

function groupFor(item,tag='div') {
  if(!validLines(item))throw new Error('두 줄 요약을 준비하지 못했어요. 다시 불러와 주세요.');
  const group=document.createElement(tag);
  group.className='saju-two-line-summary';
  group.setAttribute('role','group');
  group.setAttribute('aria-label','두 줄 요약');
  group.dataset.origin=item.origin||'service-reference';
  if(item.factIds?.length)group.dataset.factIds=item.factIds.join(' ');
  return group;
}

// Reuse a matching heading so its anchor, full text and reading order survive.
// The detailed prose stays in place; no line clamp or ellipsis hides its scope.
function addSummary(element,item,{lead=null,before=null}={}) {
  if(!element||!item?.summaryLines)return;
  if(element.querySelector(':scope > .saju-two-line-summary'))return;
  const group=groupFor(item);
  const heading=lead||element.querySelector(':scope > .reader-headline, :scope > .reader-card-title, :scope > .portrait-headline, :scope > .portrait-card-title, :scope > .month-spotlight-headline');
  if(heading?.parentElement===element&&heading.textContent.trim()===item.summaryLines[0]) {
    heading.replaceWith(group);
    heading.classList.add('saju-summary-line');
    group.append(heading);
  } else {
    group.append(textNode('p','saju-summary-line',item.summaryLines[0]));
    if(heading?.parentElement===element)heading.after(group);
    else element.insertBefore(group,before||element.firstChild);
  }
  group.append(textNode('p','saju-summary-line',item.summaryLines[1]));
}

// Keep dt/dd semantics and every original character when the selected sentence
// starts the original explanation. A longer remainder remains readable below.
function addPointSummary(point,item) {
  if(!point||!item?.summaryLines||point.classList.contains('saju-two-line-summary'))return;
  const label=point.querySelector(':scope > dt'),body=point.querySelector(':scope > dd');
  if(!label||!body)return;
  const group=groupFor(item);
  point.classList.add('saju-two-line-summary');
  for(const attribute of [...group.attributes])if(attribute.name!=='class')point.setAttribute(attribute.name,attribute.value);
  if(label.textContent.trim()===item.summaryLines[0])label.classList.add('saju-summary-line');
  else body.before(textNode('dt','saju-summary-line',item.summaryLines[0]));
  if(body.textContent.trim()===item.summaryLines[1])body.classList.add('saju-summary-line');
  else {
    const line=textNode('dd','saju-summary-line',item.summaryLines[1]);
    const original=body.textContent;
    body.before(line);
    if(original.startsWith(item.summaryLines[1]))body.textContent=original.slice(item.summaryLines[1].length);
    body.classList.add('saju-summary-remainder');
  }
}

/** Add summaries only to general saju data, before the existing pager mounts. */
export function applyReadingSummaryViews(root,report) {
  const overviews=[report.reader.lifelong,report.reader.annual,...report.reader.months];
  const cards=new Map(overviews.flatMap(overview=>overview.cards).map(item=>[item.id,item]));
  for(const element of root.querySelectorAll('.reader-card[data-reader-card]')) {
    addSummary(element,cards.get(element.dataset.readerCard));
  }
  for(const [id,overview] of [['reading-lifelong-summary',report.reader.lifelong],['reading-annual-summary',report.reader.annual],
    ...report.reader.months.map(month=>[`reading-month-${month.month}-summary`,month])]) {
    addSummary(root.querySelector(`#${id} .reader-intro`),overview);
  }
  const portrait=report.personPortrait;
  if(portrait) {
    addSummary(root.querySelector('.portrait-intro'),portrait);
    const portraits=new Map(portrait.cards.map(item=>[item.id,item]));
    for(const element of root.querySelectorAll('.portrait-card[data-portrait-card]'))addSummary(element,portraits.get(element.dataset.portraitCard));
  }
  for(const element of root.querySelectorAll('.month-spotlight-card')) {
    const month=Number(element.querySelector('a[href^="#month-title-"]')?.getAttribute('href').replace('#month-title-',''));
    addSummary(element,report.reader.months.find(item=>item.month===month));
  }
  if(report.daeun?.available) {
    addSummary(root.querySelector('#reading-daeun > .reader-prose'),report.daeun);
    for(const period of report.daeun.periods) {
      const element=root.querySelector(`[data-daeun-period="${period.id}"]`);
      if(!element)continue;
      const body=element.querySelector(':scope > .daeun-period-body');
      addSummary(body,period,{before:body.querySelector(':scope > .reader-prose')});
      for(const item of [...period.topics,...(period.situations||[])])addSummary(element.querySelector(`[data-daeun-topic="${item.id}"]`),item);
    }
  }
  const symbols=report.reader.symbols;
  if(symbols) {
    addSummary(root.querySelector('#reading-symbols .reader-intro'),symbols);
    const elements=[...root.querySelectorAll('#reading-symbols .reader-symbol-item')];
    symbols.items.forEach((item,index)=>addSummary(elements[index],item));
  }
  const timings=report.reader.timings;
  if(timings) {
    addSummary(root.querySelector('#reading-timings .reader-intro'),timings);
    const kinds={opportunities:'이 기간에 살릴 기회',people:'도움을 구해 볼 사람',documents:'문서와 계약을 살필 때',cautions:'이 기간에 조심할 상황과 대처'};
    for(const item of timings.items) {
      const element=root.querySelector(`.reader-timing-card[data-month="${item.month}"]`);
      if(!element)continue;
      addSummary(element.querySelector('.reader-timing-content'),item);
      const groups=[...element.querySelectorAll('.reader-timing-group')];
      for(const [key,label] of Object.entries(kinds)) {
        const group=groups.find(value=>value.querySelector('.reader-timing-kind')?.textContent===label);
        const points=[...(group?.querySelectorAll('.reader-timing-point')||[])];
        item[key].forEach((point,index)=>addPointSummary(points[index],point));
      }
    }
  }
}
