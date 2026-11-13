import * as scoreRules from './reading-score-rules.mjs?v=20261114-saju-wind2';

// Reference scores summarize confirmed cues used by the existing reading.
// They do not infer missing inputs, predict events, or rewrite the narrative.
const ORDER=['year','month','day','hour'];
const NOTICE='풀이를 숫자로 정리한 참고 점수예요.';
const SCOPE_NOTICE='순풍은 살릴 점, 역풍은 살필 점이에요. 두 점수는 따로 봐요.';
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

const RULES=scoreRules.READING_SCORE_RULES;
const PAIR_RULES=scoreRules.READING_SCORE_PAIR_RULES;
const STEM_RULES=scoreRules.READING_SCORE_STEM_RULES;
const DOMAINS=new Set(RULES.map(rule=>rule.domain));
const sourceKey=source=>[source.file,source.collection,source.code,source.field,source.anchor].join('|');
const uniqueSources=sources=>[...new Map(sources.map(source=>[sourceKey(source),source])).values()];
const ruleValue=value=>Number.isInteger(value)&&value>=0&&value<=2?value:fail();
function textOf(item) {
  return [...(item.paragraphs||[]),item.text,item.description,item.headline,item.title]
    .filter(value=>typeof value==='string').join('\n');
}
function domainOf(item) {
  const suffix=typeof item.id==='string'?item.id.split(/[.-]/).at(-1):'';
  return DOMAINS.has(suffix)?suffix:null;
}
function matchedSources(sources,text) {
  return list(sources).filter(source=>{
    if(!source||typeof source.anchor!=='string'||!source.anchor.trim())fail();
    return text.includes(source.anchor);
  });
}
function narrativeCues(item,context,pillarKeys) {
  const {profile,kind,transits=[]}=context,decade=kind==='daeun',natal=kind==='natal';
  const text=textOf(item),domain=domainOf(item),selected=new Set(pillarKeys),cues=[];
  const declared=item.anchorCodes?.length?item.anchorCodes:item.natalGodCodes?.length?item.natalGodCodes:natal&&item.godCodes?.length?item.godCodes:null;
  const natalEntries=profile.gods.filter(entry=>selected.has(entry.pillarKey)&&(!declared||declared.includes(entry.god.code)))
    .map(entry=>({code:entry.god.code,group:entry.god.group,key:entry.pillarKey+'.'+entry.position,
      factId:(decade?'daeun.reading.':'')+'natal.god.'+entry.pillarKey+'.'+entry.position}));
  const addGod=(entry,scope,period=false)=>{
    const matches=RULES.filter(rule=>rule.code===entry.code&&(!domain||rule.domain===domain)).map(rule=>{
      const helpSources=matchedSources(rule.sources[period?'periodHelp':'help'],text);
      const careSources=matchedSources(rule.sources[period?'periodCare':'care'],text);
      return {rule,help:helpSources.length?ruleValue(rule.help):0,care:careSources.length?ruleValue(rule.care):0,helpSources,careSources};
    }).filter(match=>match.help||match.care);
    if(!matches.length)return;
    // One observed position is one cue, even when the same sentence is listed
    // under several domains. The strongest actually present point on each axis
    // wins; there is no default, minimum, or contribution from an absent axis.
    cues.push({id:scope+'.god.'+entry.key,kind:'ten-god',scope,code:entry.code,domain:domain||'overview',
      help:Math.max(...matches.map(match=>match.help)),care:Math.max(...matches.map(match=>match.care)),
      ruleIds:unique(matches.map(match=>match.rule.id)),factIds:[entry.factId],sources:{
        help:uniqueSources(matches.filter(match=>match.help).flatMap(match=>match.helpSources)),
        care:uniqueSources(matches.filter(match=>match.care).flatMap(match=>match.careSources))}});
  };
  for(const entry of natalEntries)addGod(entry,'natal');
  const periodScopes=[];
  for(const {value,prefix} of transits) {
    const entries=[];
    for(const position of ['stem','branch']) {
      const god=value[position+'God'];
      if(!god?.code)fail();
      if(item.godCodes?.length&&!item.godCodes.includes(god.code))continue;
      const entry={code:god.code,group:god.group,key:position,factId:prefix+'.god.'+position};
      entries.push(entry);addGod(entry,prefix,true);
    }
    periodScopes.push({scope:prefix,entries});
  }
  // Domain cards use the actual period pair when a period is selected. Personal
  // portrait bridges use natal anchors. Keep both scopes and their facts apart.
  const seenPairs=new Set();
  for(const rule of PAIR_RULES) {
    if(domain&&rule.domain!==domain&&rule.domain!=='portrait')continue;
    if(!rule.source?.anchor||!text.includes(rule.source.anchor))continue;
    const scopes=!natal&&rule.source.file==='reader-summary.mjs'?periodScopes:[{scope:'natal',entries:natalEntries}];
    for(const {scope,entries:observed} of scopes) {
      const entries=observed.filter(entry=>rule.groups.includes(entry.group));
      if(!rule.groups.every(group=>entries.some(entry=>entry.group===group)))continue;
      if(new Set(entries.map(entry=>entry.code)).size<2)continue;
      const key=scope+'|'+sourceKey(rule.source);if(seenPairs.has(key))continue;seenPairs.add(key);
      const help=ruleValue(rule.help),care=ruleValue(rule.care);if(!help&&!care)continue;
      cues.push({id:scope+'.'+rule.id,kind:'god-pair',scope,domain:rule.domain,help,care,ruleIds:[rule.id],
        factIds:unique(entries.map(entry=>entry.factId)),sources:{help:help?[rule.source]:[],care:care?[rule.source]:[]}});
    }
  }
  const stemMatches=STEM_RULES.filter(rule=>rule.stem===profile.dayMaster.hanja).map(rule=>{
    const helpSources=matchedSources(rule.sources.help,text),careSources=matchedSources(rule.sources.care,text);
    return {rule,help:helpSources.length?ruleValue(rule.help):0,care:careSources.length?ruleValue(rule.care):0,helpSources,careSources};
  }).filter(match=>match.help||match.care);
  if(stemMatches.length)cues.push({id:'natal.day-master',kind:'day-master',scope:'natal',code:profile.dayMaster.hanja,
    help:Math.max(...stemMatches.map(match=>match.help)),care:Math.max(...stemMatches.map(match=>match.care)),
    ruleIds:stemMatches.map(match=>match.rule.id),factIds:[(decade?'daeun.reading.':'')+'natal.day-master'],sources:{
      help:uniqueSources(stemMatches.filter(match=>match.help).flatMap(match=>match.helpSources)),
      care:uniqueSources(stemMatches.filter(match=>match.care).flatMap(match=>match.careSources))}});
  return cues;
}

function scoreFor(item,context,{all=false,reason=''}={}) {
  const {profile,registry,kind,label,transits=[]}=context;
  const pillarKeys=relatedKeys(item,profile,all),selected=new Set(pillarKeys);
  const natal=kind==='natal',decade=kind==='daeun';
  const comparisonCount=natal?pillarKeys.length*(pillarKeys.length-1)/2:pillarKeys.length*transits.length;
  const coverage={kind,label,knownCharacterCount:profile.knownCharacterCount,usedCharacterCount:pillarKeys.length*2,
    partial:!profile.complete,pillarKeys,comparisonCount};
  if(reason)return unavailable(reason,coverage);
  const cues=narrativeCues(item,context,pillarKeys),sourceIds=[];
  let stemCombinations=0,branchCombinations=0,branchClashes=0;
  const collect=(interactions,prefix,native=false)=>{
    const seen=new Set();
    interactions.forEach((relation,index)=>{
      if(!KINDS.includes(relation.kind))fail();
      if(!selected.has(relation.birthPillarKey)||(native&&!selected.has(relation.otherPillarKey)))return;
      const key=[relation.birthPillarKey,native?relation.otherPillarKey:'period',relation.kind].join(':');
      if(seen.has(key))fail();seen.add(key);
      const id=prefix+'.interaction.'+index,clash=relation.kind==='branch-clash';
      if(clash)branchClashes++;else if(relation.kind==='stem-combination')stemCombinations++;else branchCombinations++;
      cues.push({id,kind:'interaction',scope:prefix,interactionKind:relation.kind,help:clash?0:2,care:clash?2:0,
        ruleIds:[clash?'confirmed-clash':'confirmed-combination'],factIds:[id],sources:{help:[],care:[]}});
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
  const factIds=unique([...sourceIds,...cues.flatMap(cue=>cue.factIds)]);
  if(factIds.some(id=>!registry.has(id))||new Set(cues.map(cue=>cue.id)).size!==cues.length
    ||stemCombinations>comparisonCount||branchCombinations>comparisonCount||branchClashes>comparisonCount)fail();
  if(!cues.length)return unavailable('이 항목은 점수로 정리할 풀이가 충분하지 않아 점수를 표시하지 않았어요.',coverage,factIds);
  const tailwindNumerator=cues.reduce((sum,cue)=>sum+cue.help,0),headwindNumerator=cues.reduce((sum,cue)=>sum+cue.care,0);
  const denominator=2*cues.length;
  const tailwind=Math.round(100*tailwindNumerator/denominator),headwind=Math.round(100*headwindNumerator/denominator);
  coverage.cueCount=cues.length;
  return {version:1,status:'available',available:true,max:100,
    tailwind:{label:'순풍',value:tailwind,summary:'풀이에서 힘이 되는 점을 정리한 점수예요.',reason:'',
      factIds:unique([...sourceIds,...cues.filter(cue=>cue.help).flatMap(cue=>cue.factIds)])},
    headwind:{label:'역풍',value:headwind,summary:'풀이에서 살피고 조정할 점을 정리한 점수예요.',reason:'',
      factIds:unique([...sourceIds,...cues.filter(cue=>cue.care).flatMap(cue=>cue.factIds)])},
    methodNotice:NOTICE,reason:'',scopeNotice:SCOPE_NOTICE+(profile.complete?'':' 확인되지 않은 글자는 빼고 계산했어요.'),factIds,coverage,
    calculation:{rule:'confirmed-reading-cues-v2',cues,cueCount:cues.length,stemCombinations,branchCombinations,branchClashes,comparisonCount,
      tailwindNumerator,tailwindDenominator:denominator,headwindNumerator,headwindDenominator:denominator,
      tailwindFormula:'round(100 × observed help weights / (2 × applicable cue count))',
      headwindFormula:'round(100 × observed care weights / (2 × applicable cue count))'}};
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
      // Each point uses its own prose with the already confirmed monthly facts.
      // No event-specific forecast or new birth information is added.
      for(const key of ['opportunities','people','documents','cautions']) {
        for(const point of list(month[key]))pending.push([point,scoreFor({...point,
          godCodes:month.godCodes,natalGodCodes:month.natalGodCodes,factIds:month.factIds},context)]);
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
      if(current)pending.push([reading,scoreFor(current,contexts.get(current.index),{all:true})]);
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
