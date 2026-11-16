import {appendReadingDetail,readingDetailText} from './reading-detail.mjs?v=20261114-saju-depth1';

const ITEM_IDS=['temperament','complement','daily','harmony'];
const SCORE_SUMMARY='두 사람의 성향과 함께 지내는 모습을 한눈에 살펴봐요.';
const node=(tag,className,text)=>{
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
};

function checkedScore(score) {
  const point=value=>Number.isInteger(value)&&value>=0&&value<=100;
  const text=value=>typeof value==='string'&&value.trim().length>0;
  const count=value=>Number.isInteger(value)&&value>=2&&value<=8&&value%2===0;
  if(!score||score.version!==1||score.max!==100||!point(score.total)||
    !text(score.label)||!text(score.summary)||!text(score.methodNotice)||
    !Array.isArray(score.items)||score.items.length!==ITEM_IDS.length||
    score.items.some((item,index)=>!item||item.id!==ITEM_IDS[index]||!point(item.value)||
      !text(item.label)||!text(item.summary)||!text(item.reason)||!Array.isArray(item.factIds))||
    score.total!==Math.round(score.items.reduce((sum,item)=>sum+item.value,0)/ITEM_IDS.length)||
    !count(score.coverage?.self)||!count(score.coverage?.partner)||
    score.coverage.partial!==(score.coverage.self<8||score.coverage.partner<8)) {
    throw new Error('궁합 점수를 준비하지 못했어요. 다시 불러와 주세요.');
  }
  return score;
}

/** Create a local score panel; the caller retains the existing purchase gate. */
export function createCompatibilityScoreboard(value) {
  const score=checkedScore(value);
  const section=node('section','compatibility-scoreboard');
  section.setAttribute('aria-labelledby','compatibility-score-title');
  section.dataset.scoreVersion=String(score.version);

  const heading=node('header','compatibility-score-heading');
  const title=node('h4','','궁합 점수 한눈에 보기');
  title.id='compatibility-score-title';
  heading.append(title,node('p','','100점 만점 · 사주 참고 점수'));
  section.append(heading);

  const grid=node('div','compatibility-score-grid');
  const total=node('div','compatibility-score-total');
  total.append(node('p','compatibility-score-eyebrow','종합 궁합'));
  const number=node('p','compatibility-score-number');
  const points=node('strong','',String(score.total));
  points.dataset.scoreTotal=String(score.total);
  number.append(points,node('span','','점'),node('small','','/ 100'));
  total.append(number,node('p','compatibility-score-label',score.label),
    node('p','compatibility-score-summary',SCORE_SUMMARY));
  grid.append(total);

  const items=node('div','compatibility-score-items');
  for(const item of score.items) {
    const row=node('article','compatibility-score-item');
    row.dataset.scoreItem=item.id;row.dataset.factIds=item.factIds.join(' ');
    const labelId=`compatibility-score-${item.id}-label`;
    const summaryId=`compatibility-score-${item.id}-summary`;
    const top=node('div','compatibility-score-item-heading');
    const label=node('h5','',item.label);label.id=labelId;
    const value=node('p','compatibility-score-item-value',`${item.value}점`);
    value.setAttribute('aria-hidden','true');
    top.append(label,value);
    const meter=node('div','compatibility-score-meter');
    meter.setAttribute('role','meter');
    meter.setAttribute('aria-labelledby',labelId);
    meter.setAttribute('aria-describedby',summaryId);
    meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');
    meter.setAttribute('aria-valuenow',String(item.value));
    meter.setAttribute('aria-valuetext',`100점 만점에 ${item.value}점`);
    const fill=node('span','compatibility-score-fill');
    fill.style.width=`${item.value}%`;fill.setAttribute('aria-hidden','true');
    meter.append(fill);
    const summary=node('p','compatibility-score-item-summary',item.summary);
    summary.id=summaryId;
    row.append(top,meter,summary);
    if(item.paragraphs?.length) {
      const link=node('a','compatibility-score-detail-link','이 항목의 설명 읽기 →');
      link.href=`#compatibility-score-detail-${item.id}`;
      link.setAttribute('aria-label',`${item.label} 자세한 풀이 읽기`);row.append(link);
    }
    items.append(row);
  }
  grid.append(items);section.append(grid);

  const notice=node('p','compatibility-score-notice','풀이를 숫자로 정리한 참고 점수예요.');
  section.append(notice);
  return section;
}

/** Each score has its own complete story, reached from its bar or item list. */
export function createCompatibilityScoreDetails(value,{appendParagraphs}={}) {
  const score=checkedScore(value),pages=[];
  const append=appendParagraphs||((parent,paragraphs)=>{
    for(const text of paragraphs)parent.append(node('p','',text));
  });
  for(const item of score.items) {
    if(!item.paragraphs?.length)continue;
    const section=node('section','compatibility-score-detail');
    section.id=`compatibility-score-detail-${item.id}`;
    const title=node('h4','compatibility-people-title',item.label);
    title.id=section.id+'-title';section.setAttribute('aria-labelledby',title.id);
    const value=node('p','compatibility-detail-score-value',`${item.value}점 / 100점`);
    const summary=node('div','compatibility-two-line-summary');
    const lines=Array.isArray(item.summaryLines)&&item.summaryLines.length===2?item.summaryLines:[item.summary];
    summary.setAttribute('role','group');summary.setAttribute('aria-label',lines.length===2?'두 줄 요약':'항목 요약');
    lines.forEach(line=>summary.append(node('p','compatibility-summary-line',line)));
    const prose=node('div','report-prose reader-prose');
    appendReadingDetail(prose,item,append);
    const back=node('a','compatibility-score-detail-link','전체 점수와 막대그래프 보기 →');
    back.href='#compatibility-scores';
    section.append(title,value,summary,prose,back);
    pages.push({element:section,label:`${item.label} 풀이`,group:'점수별 풀이'});
  }
  return pages;
}

export function compatibilityScoreText(value) {
  const score=checkedScore(value);
  const lines=['궁합 점수 · 100점 만점',`종합 궁합: ${score.total}점 · ${score.label}`,SCORE_SUMMARY];
  for(const item of score.items)lines.push(`${item.label}: ${item.value}점`,item.summary,...readingDetailText(item));
  lines.push('풀이를 숫자로 정리한 참고 점수예요.');
  return lines.join('\n');
}
