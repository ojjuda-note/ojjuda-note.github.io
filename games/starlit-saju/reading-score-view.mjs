let scoreSequence=0;
const node=(tag,className,text)=>{
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
};

function checkedScore(score) {
  const text=value=>typeof value==='string'&&value.trim().length>0;
  const available=score?.status==='available';
  const point=value=>Number.isInteger(value)&&value>=0&&value<=100;
  if(!score||score.version!==1||score.max!==100||!['available','unavailable'].includes(score.status)
    ||score.available!==available||!score.tailwind||!score.headwind
    ||(available?(!point(score.tailwind.value)||!point(score.headwind.value)||!text(score.methodNotice))
      :(score.tailwind.value!==null||score.headwind.value!==null||!text(score.reason)))) {
    throw new Error('순풍과 역풍 점수를 준비하지 못했어요. 다시 불러와 주세요.');
  }
  return score;
}

/** Display independent reference values, never a total or an event probability. */
export function createReadingScore(value,{tagName='section'}={}) {
  const score=checkedScore(value),id=`saju-reading-score-${++scoreSequence}`;
  const panel=node(tagName,'saju-reading-score');
  panel.dataset.readingScoreStatus=score.status;panel.dataset.scoreVersion=String(score.version);
  panel.setAttribute('role','group');panel.setAttribute('aria-label','순풍과 역풍 참고 점수');
  if(!score.available) {
    panel.append(node('p','saju-reading-score-unavailable','점수 없음'),node('p','saju-reading-score-reason',score.reason));
    return panel;
  }
  const heading=node('div','saju-reading-score-heading');
  heading.append(node('p','saju-reading-score-title','순풍과 역풍'),node('p','saju-reading-score-scale','각각 100점 만점'));
  panel.append(heading);
  const items=node('div','saju-wind-items');
  for(const [key,label] of [['tailwind','순풍 · 힘이 되는 점'],['headwind','역풍 · 주의할 점']]) {
    const item=score[key],row=node('div','saju-wind-item');row.dataset.wind=key;
    const top=node('div','saju-wind-label-row');
    const name=node('span','saju-wind-label',label);name.id=`${id}-${key}-label`;
    const value=node('span','saju-wind-value',`${item.value}점`);value.dataset.windValue=String(item.value);value.setAttribute('aria-hidden','true');
    top.append(name,value);
    const meter=node('div','saju-wind-meter');
    meter.setAttribute('role','meter');meter.setAttribute('aria-labelledby',name.id);
    meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');
    meter.setAttribute('aria-valuenow',String(item.value));meter.setAttribute('aria-valuetext',`100점 만점에 ${item.value}점`);
    meter.setAttribute('aria-describedby',`${id}-notice`);
    const fill=node('span','saju-wind-fill');fill.style.width=`${item.value}%`;fill.setAttribute('aria-hidden','true');meter.append(fill);
    row.append(top,meter);items.append(row);
  }
  panel.append(items);
  const notice=node('p','saju-reading-score-notice',score.methodNotice+(score.scopeNotice?' '+score.scopeNotice:''));
  notice.id=`${id}-notice`;panel.append(notice);
  return panel;
}

function addScore(element,item,{point=false}={}) {
  if(!element||!item)return;
  if(element.querySelector(':scope > .saju-reading-score'))return;
  const panel=createReadingScore(item.readingScore,{tagName:point?'dd':'section'});
  const summary=point?[...element.children].filter(child=>child.classList.contains('saju-summary-line')).at(-1)
    :element.querySelector(':scope > .saju-two-line-summary');
  if(summary)summary.after(panel);
  else {
    const heading=element.querySelector(':scope > .report-section-heading,:scope > .reader-headline,:scope > .reader-card-title');
    if(heading)heading.after(panel);else element.prepend(panel);
  }
}

/** Follow the same authored reading units as the two-line summaries. */
export function applyReadingScoreViews(root,report) {
  const overviews=[report.reader.lifelong,report.reader.annual,...report.reader.months];
  const cards=new Map(overviews.flatMap(overview=>overview.cards).map(item=>[item.id,item]));
  for(const element of root.querySelectorAll('.reader-card[data-reader-card]'))addScore(element,cards.get(element.dataset.readerCard));
  for(const [id,overview] of [['reading-lifelong-summary',report.reader.lifelong],['reading-annual-summary',report.reader.annual],
    ...report.reader.months.map(month=>[`reading-month-${month.month}-summary`,month])]) {
    addScore(root.querySelector(`#${id} .reader-intro`),overview);
  }
  const portrait=report.personPortrait;
  if(portrait) {
    addScore(root.querySelector('.portrait-intro'),portrait);
    const portraits=new Map(portrait.cards.map(item=>[item.id,item]));
    for(const element of root.querySelectorAll('.portrait-card[data-portrait-card]'))addScore(element,portraits.get(element.dataset.portraitCard));
  }
  for(const element of root.querySelectorAll('.month-spotlight-card')) {
    const month=Number(element.querySelector('a[href^="#month-title-"]')?.getAttribute('href').replace('#month-title-',''));
    addScore(element,report.reader.months.find(item=>item.month===month));
  }
  if(report.daeun) {
    addScore(root.querySelector(report.daeun.available?'#reading-daeun > .reader-prose':'#reading-daeun'),report.daeun);
    for(const period of report.daeun.periods||[]) {
      const element=root.querySelector(`[data-daeun-period="${period.id}"]`);
      if(!element)continue;
      addScore(element.querySelector(':scope > .daeun-period-body'),period);
      for(const item of [...period.topics,...(period.situations||[])])addScore(element.querySelector(`[data-daeun-topic="${item.id}"]`),item);
    }
  }
  const symbols=report.reader.symbols;
  if(symbols) {
    addScore(root.querySelector('#reading-symbols .reader-intro'),symbols);
    const elements=[...root.querySelectorAll('#reading-symbols .reader-symbol-item')];
    symbols.items.forEach((item,index)=>addScore(elements[index],item));
  }
  const timings=report.reader.timings;
  if(timings) {
    addScore(root.querySelector('#reading-timings .reader-intro'),timings);
    const kinds={opportunities:'이 기간에 살릴 기회',people:'도움을 구해 볼 사람',documents:'문서와 계약을 살필 때',cautions:'이 기간에 조심할 상황과 대처'};
    for(const item of timings.items) {
      const element=root.querySelector(`.reader-timing-card[data-month="${item.month}"]`);
      if(!element)continue;
      addScore(element.querySelector('.reader-timing-content'),item);
      const groups=[...element.querySelectorAll('.reader-timing-group')];
      for(const [key,label] of Object.entries(kinds)) {
        const group=groups.find(value=>value.querySelector('.reader-timing-kind')?.textContent===label);
        const points=[...(group?.querySelectorAll('.reader-timing-point')||[])];
        item[key].forEach((point,index)=>addScore(points[index],point,{point:true}));
      }
    }
  }
}
