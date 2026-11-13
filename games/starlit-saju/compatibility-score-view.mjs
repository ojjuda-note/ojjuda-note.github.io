const ITEM_IDS=['temperament','complement','daily','harmony'];
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

const coverageText=score=>`확인한 글자: 나 ${score.coverage.self}/8 · 상대 ${score.coverage.partner}/8. ${score.coverage.partial?'확정되지 않은 부분은 제외하고 비교했어요.':'두 사람의 여덟 글자를 모두 비교했어요.'}`;

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
    node('p','compatibility-score-summary',score.summary),
    node('p','compatibility-score-average','네 항목을 같은 비중으로 합산했어요.'));
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
    meter.setAttribute('aria-valuetext',`100점 만점 중 ${item.value}점`);
    const fill=node('span','compatibility-score-fill');
    fill.style.width=`${item.value}%`;fill.setAttribute('aria-hidden','true');
    meter.append(fill);
    const summary=node('p','compatibility-score-item-summary',item.summary);
    summary.id=summaryId;
    row.append(top,meter,summary);items.append(row);
  }
  grid.append(items);section.append(grid);

  const notice=node('p','compatibility-score-notice',score.methodNotice);
  section.append(notice);
  const details=node('details','compatibility-score-details');
  details.append(node('summary','','점수 기준과 계산 범위'));
  const body=node('div','compatibility-score-method');
  body.append(node('p','',coverageText(score)),
    node('p','',`종합 ${score.total}점은 네 항목의 점수를 더한 뒤 4로 나누고 반올림한 값이에요. 각 항목은 25%씩 반영해요.`));
  const reasons=node('dl','compatibility-score-reasons');
  for(const item of score.items) {
    const row=node('div','');
    row.dataset.factIds=item.factIds.join(' ');
    row.append(node('dt','',`${item.label} · ${item.value}점`),node('dd','',item.reason));
    reasons.append(row);
  }
  body.append(reasons);details.append(body);section.append(details);
  return section;
}

export function compatibilityScoreText(value) {
  const score=checkedScore(value);
  const lines=['궁합 점수 · 100점 만점',`종합 궁합: ${score.total}점 · ${score.label}`,score.summary];
  for(const item of score.items)lines.push(`${item.label}: ${item.value}점`,item.summary,item.reason);
  lines.push('종합은 네 항목을 25%씩 반영한 평균을 반올림한 점수예요.',coverageText(score),score.methodNotice);
  return lines.join('\n');
}
