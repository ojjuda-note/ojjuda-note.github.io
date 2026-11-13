// Product comparison rules, not a traditional fate formula or a probability.
// Only already-confirmed chart facts enter the calculation. Names, gender,
// birth-time guesses, clock time, random state and purchases are not inputs.
const ELEMENTS=['wood','fire','earth','metal','water'];
const ELEMENT_LABELS={wood:'나무',fire:'불',earth:'흙',metal:'쇠',water:'물'};
const unique=values=>[...new Set(values)];
const rounded=value=>Math.max(0,Math.min(100,Math.round(value)));
const percentage=value=>`${(value*100).toFixed(1).replace(/\.0$/,'')}%`;

// Express both quantities over 5 * ownCount * otherCount so missing/extra
// proportions are compared as integers, even with different confirmed scopes.
function complementRatio(own,other) {
  const ownCount=own.knownCharacterCount,otherCount=other.knownCharacterCount;
  let shortage=0,covered=0;
  for(const key of ELEMENTS) {
    const ownElement=own.elements.find(element=>element.key===key).count;
    const otherElement=other.elements.find(element=>element.key===key).count;
    const missing=Math.max(0,ownCount-5*ownElement)*otherCount;
    const extra=Math.max(0,otherElement*ownCount-ownElement*otherCount)*5;
    shortage+=missing;
    covered+=Math.min(missing,extra);
  }
  return shortage===0?1:covered/shortage;
}

/** Compare validated makeProfile results; callers retain the source facts. */
export function buildCompatibilityScore({profiles,comparisons,interactions}) {
  const self=profiles.self,partner=profiles.partner;
  const dayMatches=interactions.filter(match=>match.selfPillarKey==='day'&&match.partnerPillarKey==='day');
  const stemCombination=dayMatches.some(match=>match.kind==='stem-combination');
  const elementDistance=Math.abs(ELEMENTS.indexOf(self.dayMaster.element)-ELEMENTS.indexOf(partner.dayMaster.element));
  const sameElement=elementDistance===0;
  const generating=elementDistance===1||elementDistance===4;
  const temperamentBase=sameElement?80:generating?85:60;
  const temperament=rounded(temperamentBase+(stemCombination?10:0));
  const temperamentKind=sameElement?'같은 오행':generating?'상생 관계':'상극 관계';
  const stemElements=[self.dayMaster.element,partner.dayMaster.element]
    .sort((left,right)=>ELEMENTS.indexOf(left)-ELEMENTS.indexOf(right))
    .map(key=>ELEMENT_LABELS[key]).join('·');
  const temperamentReason=`나를 나타내는 글자를 일간이라고 해요. 두 사람의 일간에 연결된 오행(${stemElements})을 비교한 결과는 ${temperamentKind}예요. 그래서 기본 ${temperamentBase}점에서 시작해요. 오쭈다에서는 같은 오행은 80점, 상생은 85점, 상극은 60점으로 정했어요. 일간끼리 천간합에 해당하면 10점을 더해요. 이번에는 ${stemCombination?'천간합이 있어 10점을 더했어요':'천간합이 없어 더하지 않았어요'}.`;

  const ratios=[complementRatio(self,partner),complementRatio(partner,self)];
  const complement=rounded(50+50*((ratios[0]+ratios[1])/2));
  const ratioLabels=[...ratios].sort((left,right)=>left-right).map(percentage).join('·');
  const complementReason=`확인된 글자 중 각 오행이 얼마나 있는지 비중을 계산했어요. 비교 기준은 오행마다 20%예요. 내 비중이 20%보다 작으면, 상대가 그 오행을 나보다 얼마나 더 가졌는지 봐요. 그 차이로 20%까지 모자란 부분을 얼마나 채울 수 있는지 계산해요. 상대를 기준으로도 똑같이 계산한 두 비율은 ${ratioLabels}예요. 두 비율의 평균 × 50 + 50을 반올림하면 ${complement}점이에요. 다섯 오행이 이미 모두 기준을 채웠다면 그 사람의 비율은 100%로 봐요. 20%는 숫자를 비교하기 위해 정한 기준이에요. 용신이나 실제로 필요한 오행을 정하는 방법은 아니에요.`;

  const selfBranch=self.knownPillars.find(pillar=>pillar.key==='day').branch;
  const partnerBranch=partner.knownPillars.find(pillar=>pillar.key==='day').branch;
  const dailyCombination=dayMatches.some(match=>match.kind==='branch-combination');
  const dailyClash=dayMatches.some(match=>match.kind==='branch-clash');
  const sameBranch=selfBranch.hanja===partnerBranch.hanja;
  const daily=dailyCombination?90:dailyClash?40:sameBranch?80:65;
  const dailyKind=dailyCombination?'육합':dailyClash?'충':sameBranch?'같은 글자':'직접 해당하는 육합·충이 없는 조합';
  const dailyReason=`태어난 날의 아래 글자, 즉 일지를 비교했어요. 결과는 ‘${dailyKind}’이고 점수는 ${daily}점이에요. 오쭈다에서는 일지끼리 육합이면 90점, 충이면 40점, 같은 글자면 80점, 그 밖에는 65점으로 정했어요. 생활 습관을 이야기할 때 참고하는 고정 점수예요. 실제로 두 사람이 잘 맞는지, 잘 맞지 않는지를 확정하는 점수는 아니에요.`;

  const stemCombinations=interactions.filter(match=>match.kind==='stem-combination').length;
  const branchCombinations=interactions.filter(match=>match.kind==='branch-combination').length;
  const branchClashes=interactions.filter(match=>match.kind==='branch-clash').length;
  const pairCount=comparisons.length;
  const harmony=rounded(50+(20*stemCombinations+30*branchCombinations-30*branchClashes)/pairCount);
  const harmonyReason=`사주에서는 해·달·날·시간의 글자 두 개씩을 묶어 기둥이라고 해요. 확정된 기둥 ${pairCount}쌍을 비교했어요. 천간합 ${stemCombinations}쌍, 육합 ${branchCombinations}쌍, 충 ${branchClashes}쌍이 있었어요. 기둥 한 쌍마다 기본 50점에서 시작해 천간합은 20점, 육합은 30점을 더하고 충은 30점을 빼요. 그 점수들의 평균을 구해요. 계산식은 다음과 같아요: 50 + (20 × ${stemCombinations} + 30 × ${branchCombinations} − 30 × ${branchClashes}) ÷ ${pairCount}. 반올림하면 ${harmony}점이에요. 확인할 수 없는 기둥은 비교하지 않고, 평균을 구할 때도 개수에 넣지 않아요.`;

  const item=(id,label,value,summary,reason,factIds)=>({
    id,label,value,summary,reason,factIds:unique([...factIds,`score.${id}`]),
  });
  const items=[
    item('temperament','기본 성향',temperament,
      sameElement?'성향이 닮은 편으로 풀이해요.\n서로 다른 취향도 물어보세요.'
        :generating?'서로 도움이 될 수 있어요.\n어떤 도움이 필요한지 물어보세요.'
          :stemCombination?'다르지만 통할 부분도 있어요.\n각자 잘하는 일을 나눠 보세요.'
            :'중요하게 보는 점이 다를 수 있어요.\n맡을 일을 함께 정해 보세요.',
      temperamentReason,['self.day-master','partner.day-master','day-master.self-to-partner','day-master.partner-to-self',
        ...dayMatches.filter(match=>match.kind==='stem-combination').map(match=>match.id)]),
    item('complement','서로의 보완',complement,
      (ratios.some(value=>value>0)?'서로 보탤 부분이 있어요.':'추가 보완 점수는 없어요.')+'\n잘하는 일을 나눠 맡아 보세요.',
      complementReason,['self.scope','partner.scope','self.elements','partner.elements']),
    item('daily','일상 호흡',daily,
      dailyCombination?'작은 약속으로 가까워질 수 있어요.\n함께 지킬 일을 하나 정해요.'
        :dailyClash?'생활 습관이 다를 수 있어요.\n서로 편한 시간을 말해 보세요.'
          :sameBranch?'익숙한 생활 모습이 있을 수 있어요.\n서로 다른 습관도 물어보세요.'
            :'일상 비교는 기본 점수예요.\n평소 생활 습관을 이야기해요.',
      dailyReason,['day-branches','self.pillar.day','partner.pillar.day',
        ...dayMatches.filter(match=>match.position==='branch').map(match=>match.id)]),
    item('harmony','관계 조화',harmony,
      branchClashes&&stemCombinations+branchCombinations?'잘 맞는 점과 차이가 함께 보여요.\n편했던 일부터 이야기해요.'
        :branchClashes?'서로 생각이 다를 수 있어요.\n불편한 점을 차분히 말해요.'
          :stemCombinations+branchCombinations?'서로 힘을 보탤 점이 보여요.\n작은 일부터 함께 해 보세요.'
            :'전체 비교는 기본 점수예요.\n함께 즐기는 일을 찾아보세요.',
      harmonyReason,['comparison.scope','interaction.counts',...comparisons.map(value=>value.id),...interactions.map(value=>value.id)]),
  ];
  const total=rounded(items.reduce((sum,value)=>sum+value.value,0)/items.length);
  const score={
    version:1,total,max:100,label:'종합 참고 점수',
    summary:'성향·보완·일상·관계, 네 항목을 비교했어요. 각 점수를 똑같이 반영해 평균을 냈어요.',
    methodNotice:'오쭈다 고정 규칙으로 비교한 참고 점수예요. 실제 관계의 성공 확률이나 미래 예측은 아니에요.',
    items,
    coverage:{self:self.knownCharacterCount,partner:partner.knownCharacterCount,
      partial:!self.complete||!partner.complete},
  };
  const facts=items.map(value=>({id:`score.${value.id}`,label:`${value.label} 점수 기준`,value:value.reason,origin:'service-reference'}));
  facts.push({id:'score.overall',label:'종합 점수 계산',
    value:`네 점수를 더한 뒤 4로 나눠 평균을 구했어요. (${items.map(value=>value.value).join(' + ')}) ÷ 4를 반올림하면 ${total}점이에요. 확인할 수 없는 글자가 있다는 이유로 따로 점수를 깎지는 않아요.`,
    origin:'service-reference'});
  return {score,facts};
}
