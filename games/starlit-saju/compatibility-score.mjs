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
  const temperamentReason=`두 일간의 오행(${stemElements})에서 ${temperamentKind}를 확인해 기본 ${temperamentBase}점을 적용했어요. 같은 오행 80점, 상생 85점, 상극 60점으로 정한 오쭈다 비교 규칙이에요. 일간끼리 천간합이면 10점을 더하며, 이번에는 ${stemCombination?'해당하여 10점을 더했어요':'해당하지 않아 더하지 않았어요'}.`;

  const ratios=[complementRatio(self,partner),complementRatio(partner,self)];
  const complement=rounded(50+50*((ratios[0]+ratios[1])/2));
  const ratioLabels=[...ratios].sort((left,right)=>left-right).map(percentage).join('·');
  const complementReason=`확정 글자 수로 각자의 오행 비중을 나눴어요. 각 오행의 20%를 비교 기준으로 놓고, 그보다 적은 비중을 상대가 더 가진 비중이 채우는 정도를 양방향으로 계산했어요. 두 비율은 ${ratioLabels}이며, 평균 × 50 + 50을 반올림해 ${complement}점이에요. 다섯 비중이 이미 기준을 채우면 해당 비율은 100%로 봐요. 이는 숫자 비교용 기준이며, 용신이나 실제로 필요한 오행을 정하는 방법은 아니에요.`;

  const selfBranch=self.knownPillars.find(pillar=>pillar.key==='day').branch;
  const partnerBranch=partner.knownPillars.find(pillar=>pillar.key==='day').branch;
  const dailyCombination=dayMatches.some(match=>match.kind==='branch-combination');
  const dailyClash=dayMatches.some(match=>match.kind==='branch-clash');
  const sameBranch=selfBranch.hanja===partnerBranch.hanja;
  const daily=dailyCombination?90:dailyClash?40:sameBranch?80:65;
  const dailyKind=dailyCombination?'육합':dailyClash?'충':sameBranch?'같은 글자':'직접 해당하는 육합·충이 없는 조합';
  const dailyReason=`일지 비교 결과는 ‘${dailyKind}’이며 ${daily}점이에요. 일지끼리 육합이면 90점, 충이면 40점, 같은 글자이면 80점, 그 밖에는 65점을 적용해요. 이 수치는 생활 호흡을 비교하기 위한 고정 규칙이며 실제 관계의 좋고 나쁨을 확정하지 않아요.`;

  const stemCombinations=interactions.filter(match=>match.kind==='stem-combination').length;
  const branchCombinations=interactions.filter(match=>match.kind==='branch-combination').length;
  const branchClashes=interactions.filter(match=>match.kind==='branch-clash').length;
  const pairCount=comparisons.length;
  const harmony=rounded(50+(20*stemCombinations+30*branchCombinations-30*branchClashes)/pairCount);
  const harmonyReason=`확정된 기둥 ${pairCount}쌍에서 천간합 ${stemCombinations}쌍, 육합 ${branchCombinations}쌍, 충 ${branchClashes}쌍을 확인했어요. 기둥 쌍마다 기본 50점에 천간합 +20점, 육합 +30점, 충 −30점을 적용한 평균이에요. 계산식은 50 + (20 × ${stemCombinations} + 30 × ${branchCombinations} − 30 × ${branchClashes}) ÷ ${pairCount}이며, 반올림하면 ${harmony}점이에요. 확정되지 않은 기둥은 비교와 나눗셈에서 함께 제외해요.`;

  const item=(id,label,value,summary,reason,factIds)=>({
    id,label,value,summary,reason,factIds:unique([...factIds,`score.${id}`]),
  });
  const items=[
    item('temperament','기본 성향',temperament,
      sameElement?'닮은 성향으로 풀이해요.\n서로 다른 취향도 물어보세요.'
        :generating?'도움을 주고받는 짝으로 봐요.\n필요한 도움을 물어보세요.'
          :stemCombination?'다른 기준 속 연결도 보여요.\n맡을 일을 함께 정해 보세요.'
            :'서로 다른 기준을 맞춰요.\n맡을 일을 함께 정해 보세요.',
      temperamentReason,['self.day-master','partner.day-master','day-master.self-to-partner','day-master.partner-to-self',
        ...dayMatches.filter(match=>match.kind==='stem-combination').map(match=>match.id)]),
    item('complement','서로의 보완',complement,
      (ratios.some(value=>value>0)?'보완할 부분이 있어요.':'보완 점수는 기본값이에요.')+'\n잘하는 일을 나눠 보세요.',
      complementReason,['self.scope','partner.scope','self.elements','partner.elements']),
    item('daily','일상 호흡',daily,
      dailyCombination?'일상을 맞추는 짝으로 봐요.\n작은 약속부터 함께 정해요.'
        :dailyClash?'생활의 차이를 살필 조합이에요.\n서로 편한 속도를 말해 보세요.'
          :sameBranch?'비슷한 생활 기준으로 읽혀요.\n서로 다른 습관도 물어보세요.'
            :'일상 호흡은 기본 점수예요.\n평소 생활 습관을 맞춰 보세요.',
      dailyReason,['day-branches','self.pillar.day','partner.pillar.day',
        ...dayMatches.filter(match=>match.position==='branch').map(match=>match.id)]),
    item('harmony','관계 조화',harmony,
      branchClashes&&stemCombinations+branchCombinations?'통하는 점과 차이가 보여요.\n편한 점부터 이야기해요.'
        :branchClashes?'서로 맞춰 볼 차이가 보여요.\n불편한 점을 차분히 말해요.'
          :stemCombinations+branchCombinations?'서로 연결되는 점이 보여요.\n작은 일부터 힘을 모아 보세요.'
            :'전체 비교는 기본 점수예요.\n생활 속 공통점을 찾아보세요.',
      harmonyReason,['comparison.scope','interaction.counts',...comparisons.map(value=>value.id),...interactions.map(value=>value.id)]),
  ];
  const total=rounded(items.reduce((sum,value)=>sum+value.value,0)/items.length);
  const score={
    version:1,total,max:100,label:'종합 참고 점수',
    summary:'기본 성향·서로의 보완·일상 호흡·관계 조화를 같은 비중으로 모았어요.',
    methodNotice:'오쭈다 고정 규칙으로 비교한 참고 점수예요. 실제 관계의 성공 확률이나 미래 예측은 아니에요.',
    items,
    coverage:{self:self.knownCharacterCount,partner:partner.knownCharacterCount,
      partial:!self.complete||!partner.complete},
  };
  const facts=items.map(value=>({id:`score.${value.id}`,label:`${value.label} 점수 기준`,value:value.reason,origin:'service-reference'}));
  facts.push({id:'score.overall',label:'종합 점수 계산',
    value:`네 항목에 각각 같은 비중을 적용해 (${items.map(value=>value.value).join(' + ')}) ÷ 4를 반올림한 ${total}점이에요. 미확정 글자 수에 따른 별도 감점은 없어요.`,
    origin:'service-reference'});
  return {score,facts};
}
