// Presentation scores from already-confirmed relationships. These ratios do
// not rank ten gods, infer missing pillars, predict events or change the prose.
const ORDER=['year','month','day','hour'];
const NOTICE='풀이를 숫자로 정리한 참고 점수예요.';
const ZERO_NOTICE='두 점수는 따로 봐요. 0점은 이 항목에서 해당 표시가 없다는 뜻이에요.';
const unique=values=>[...new Set(values)];
const fail=()=>{throw new Error('확인된 풀이로 순풍·역풍 점수를 다시 준비해 주세요.');};
const list=value=>Array.isArray(value)?value:fail();
const KINDS=['stem-combination','branch-combination','branch-clash'];

function relatedKeys(item,profile,all=false) {
  if(all)return profile.knownPillars.map(pillar=>pillar.key);
  const keys=new Set(['day']);
  const codes=item.natalGodCodes?.length?item.natalGodCodes:item.godCodes;
  if(codes?.length) {
    for(const entry of profile.gods)if(codes.includes(entry.god.code))keys.add(entry.pillarKey);
  } else {
    for(const id of item.factIds||[]) {
      const match=id.match(/^(?:daeun\.reading\.)?natal\.(?:god|character|pillar)\.(year|month|day|hour)(?:\.|$)/);
      if(match)keys.add(match[1]);
    }
  }
  for(const id of item.factIds||[]) {
    if(id==='natal.season'&&profile.season)keys.add('month');
    const match=id.match(/^natal\.interaction\.(\d+)$/);
    if(match) {
      const relation=profile.interactions[Number(match[1])];
      if(!relation)fail();
      keys.add(relation.birthPillarKey);keys.add(relation.otherPillarKey);
    }
  }
  return ORDER.filter(key=>keys.has(key)&&profile.knownPillars.some(pillar=>pillar.key===key));
}

function unavailable(reason,coverage,factIds=[]) {
  return {version:1,status:'unavailable',available:false,max:100,
    tailwind:{label:'순풍',value:null,summary:'',reason,factIds:[]},
    headwind:{label:'역풍',value:null,summary:'',reason,factIds:[]},
    methodNotice:NOTICE,reason,scopeNotice:'',factIds:[...factIds],coverage,calculation:null};
}

function scoreFor(item,context,{all=false,reason=''}={}) {
  const {profile,registry,kind,label,transits=[]}=context;
  const pillarKeys=relatedKeys(item,profile,all),selected=new Set(pillarKeys);
  const natal=kind==='natal',decade=kind==='daeun';
  const comparisonCount=natal?pillarKeys.length*(pillarKeys.length-1)/2:pillarKeys.length*transits.length;
  const coverage={kind,label,knownCharacterCount:profile.knownCharacterCount,usedCharacterCount:pillarKeys.length*2,
    partial:!profile.complete,pillarKeys,comparisonCount};
  if(reason)return unavailable(reason,coverage);
  if(!comparisonCount)return unavailable('서로 비교할 확정된 자리가 부족해 점수를 정하지 않았어요.',coverage);
  let stemCombinations=0,branchCombinations=0,branchClashes=0;
  const supportIds=[],cautionIds=[],sourceIds=[];
  const collect=(interactions,prefix,native=false)=>{
    const seen=new Set();
    interactions.forEach((relation,index)=>{
      if(!KINDS.includes(relation.kind))fail();
      if(!selected.has(relation.birthPillarKey)||(native&&!selected.has(relation.otherPillarKey)))return;
      const key=[relation.birthPillarKey,native?relation.otherPillarKey:'period',relation.kind].join(':');
      if(seen.has(key))fail();seen.add(key);
      const id=prefix+'.interaction.'+index;
      if(relation.kind==='branch-clash'){branchClashes++;cautionIds.push(id);}
      else {supportIds.push(id);if(relation.kind==='stem-combination')stemCombinations++;else branchCombinations++;}
    });
  };
  if(natal) {
    sourceIds.push('natal.day-master','natal.scope','natal.interaction-count',...pillarKeys.map(key=>'natal.pillar.'+key));
    collect(profile.interactions,'natal',true);
  } else if(decade) {
    sourceIds.push('daeun.reading.natal.day-master',...pillarKeys.map(key=>'daeun.reading.natal.pillar.'+key));
    for(const {value,prefix} of transits) {
      sourceIds.push(...value.factIds,...pillarKeys.map(key=>prefix+'.comparison.'+key));
      collect(value.interactions,prefix);
    }
  } else {
    sourceIds.push('natal.day-master','natal.scope',...pillarKeys.map(key=>'natal.pillar.'+key));
    for(const {value,prefix} of transits) {
      sourceIds.push(prefix+'.pillar',prefix+'.period',prefix+'.interaction-count');
      collect(value.interactions,prefix);
    }
  }
  const factIds=unique([...sourceIds,...supportIds,...cautionIds]);
  if(factIds.some(id=>!registry.has(id))||stemCombinations>comparisonCount||branchCombinations>comparisonCount||branchClashes>comparisonCount)fail();
  const tailwind=Math.round(100*(stemCombinations+branchCombinations)/(comparisonCount*2));
  const headwind=Math.round(100*branchClashes/comparisonCount);
  return {version:1,status:'available',available:true,max:100,
    tailwind:{label:'순풍',value:tailwind,summary:'함께 맞추고 이어 갈 부분을 정리한 점수예요.',reason:'',factIds:unique([...sourceIds,...supportIds])},
    headwind:{label:'역풍',value:headwind,summary:'차이를 살피고 조정할 부분을 정리한 점수예요.',reason:'',factIds:unique([...sourceIds,...cautionIds])},
    methodNotice:NOTICE,reason:'',scopeNotice:ZERO_NOTICE+(profile.complete?'':' 확인되지 않은 글자는 빼고 계산했어요.'),factIds,coverage,
    calculation:{rule:'confirmed-pair-ratios-v1',stemCombinations,branchCombinations,branchClashes,comparisonCount,
      tailwindNumerator:stemCombinations+branchCombinations,tailwindDenominator:comparisonCount*2,
      headwindNumerator:branchClashes,headwindDenominator:comparisonCount,
      tailwindFormula:'round(100 × (stemCombinations + branchCombinations) / (2 × comparisonCount))',
      headwindFormula:'round(100 × branchClashes / comparisonCount)'}};
}

/** Attach atomically after all visible readings exist, before creating copies. */
export function attachReadingScores(report,chart,fortune) {
  const profile=fortune?.profile;
  if(!report?.reader||!profile?.knownPillars?.length||chart?.dayMaster?.hanja!==profile.dayMaster?.hanja)fail();
  const facts=[...list(report.facts),...(report.daeun?list(report.daeun.facts):[])];
  const registry=new Set(facts.map(fact=>fact.id));
  if(registry.size!==facts.length)fail();
  const base={profile,registry},pending=[];
  const natal={...base,kind:'natal',label:'확인된 원국'};
  const annual={...base,kind:'annual',label:`${fortune.year}년`,transits:[{value:fortune.annual,prefix:'annual'}]};
  const monthContexts=new Map(list(fortune.months).map(month=>[month.month,{...base,kind:'monthly',label:`${fortune.year}년 ${month.month}월`,
    transits:[{value:month,prefix:`month.${month.month}`}]}]));
  const add=(item,context,options)=>{
    if(!item||!context)fail();
    pending.push([item,scoreFor(item,context,options)]);
  };
  const cards=(overview,context)=>{
    add(overview,context,{all:true});
    for(const item of list(overview.cards)) {
      const reason=item.id==='natal-health'?'건강이나 질병은 점수로 판단하지 않아요.'
        :item.id==='natal-safety'?'사고가 생길 가능성은 점수로 판단하지 않아요.':'';
      add(item,context,{reason});
    }
  };
  cards(report.reader.lifelong,natal);cards(report.reader.annual,annual);
  for(const month of list(report.reader.months))cards(month,monthContexts.get(month.month));
  if(report.personPortrait)cards(report.personPortrait,natal);
  const symbols=report.reader.symbols;
  if(symbols)for(const item of [symbols,...list(symbols.items)])add(item,natal,{reason:'색·숫자·방향은 점수로 계산하지 않아요.'});
  const timings=report.reader.timings;
  if(timings) {
    add(timings,{...base,kind:'monthly-summary',label:`${fortune.year}년 12개월`,transits:[...monthContexts.values()].flatMap(context=>context.transits)},{all:true});
    for(const month of list(timings.items)) {
      const context=monthContexts.get(month.month);
      add(month,context);
      // These points are applications of the same confirmed monthly reading.
      // Keep that scope instead of inventing another event-specific forecast.
      for(const key of ['opportunities','people','documents','cautions']) {
        for(const point of list(month[key]))pending.push([point,scoreFor(month,context)]);
      }
    }
  }
  if(report.daeun) {
    const reading=report.daeun,calculation=report.daeunCalculation;
    if(!calculation||reading.available!==calculation.available)fail();
    if(!reading.available)add(reading,{...base,kind:'daeun',label:'대운'},{reason:reading.message||'대운을 확정할 정보가 부족해 점수를 정하지 않았어요.'});
    else {
      const contexts=new Map(list(calculation.periods).map(period=>[period.index,{...base,kind:'daeun',label:period.startLabel+' ~ '+period.endLabel+' 직전',
        transits:[{value:period,prefix:'daeun.reading.period.'+period.index}]}]));
      for(const period of list(reading.periods)) {
        const context=contexts.get(period.index);
        add(period,context,{all:true});
        for(const topic of [...list(period.topics),...list(period.situations||[])])add(topic,context);
      }
      const current=reading.periods.find(period=>period.isCurrent);
      if(current)add(reading,contexts.get(current.index),{all:true});
      else add(reading,{...base,kind:'daeun',label:'현재 대운'},{reason:reading.currentState==='before-start'
        ?'첫 대운이 시작되기 전이라 현재 점수는 표시하지 않아요.'
        :'현재 시점은 계산한 대운 구간 밖이라 점수를 표시하지 않아요.'});
    }
  }
  for(const [item,score] of pending)item.readingScore=score;
  return report;
}

/** User copies include the reading and values, never formulas or evidence. */
export function readingScoreCopy(item) {
  const score=item?.readingScore;
  if(!score)return [];
  if(!score.available)return ['순풍·역풍: '+score.reason];
  return [`순풍 ${score.tailwind.value}/${score.max}점 · 역풍 ${score.headwind.value}/${score.max}점`,score.methodNotice,score.scopeNotice];
}
