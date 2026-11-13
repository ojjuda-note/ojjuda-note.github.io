import {
  STEM_REFERENCE, GROUP_REFERENCE, GOD_REFERENCE,
  RELATION_REFERENCE, GROUP_PAIR_RULES, PRACTICE_SUGGESTIONS,
} from './readings-data.mjs?v=20261113-saju-easy1';
import { attachPlainLanguage } from './plain-language.mjs?v=20261113-saju-easy1';
import { attachAdvice } from './advice.mjs?v=20261113-saju-easy1';
import { attachDeeperReadings } from './deeper-reading.mjs?v=20261113-saju-easy1';
import { attachStageReadings } from './stage-reading.mjs?v=20261113-saju-easy1';
import { attachReaderSummary } from './reader-summary.mjs?v=20261113-saju-easy1';
import { attachReaderExtras } from './reader-extras.mjs?v=20261113-saju-easy1';
import { buildDaeunReading, copyDaeunReading } from './daeun-reading.mjs?v=20261114-saju-wind2';
import { buildPersonPortrait } from './person-portrait.mjs?v=20261113-saju-easy1';
import { attachReadingSummaryLines } from './reading-summary-lines.mjs?v=20261114-saju-wind1';
import { attachReadingScores, readingScoreCopy } from './reading-score.mjs?v=20261114-saju-wind2';
import { buildNatalReadingData, seasonRules, charLabel, particle, relationOf, godPosition, interactionFact } from './natal-reading-data.mjs?v=20261114-saju-wind1';

const GROUP_KEYS = ['peer', 'expression', 'wealth', 'authority', 'resource'];
const groupEntries = (profile, group) => profile.gods.filter(value => value.god.group === group);
const unique = values => [...new Set(values)];
const referenceIds = reference => reference?.source ? [reference.source,...reference.entries,...reference.notes] : [];

function createFacts(chart, fortune) {
  const profile = fortune.profile;
  const {facts,lookup,natal,add} = buildNatalReadingData(chart,profile);

  function transitFacts(transit, prefix, label) {
    const result = {prefix,label,header:[],gods:[],characters:[],overlaps:[],interactions:[],notes:[],reference:{entries:[],notes:[]}};
    result.header.push(add(`${prefix}.pillar`,'transit-pillar',`${label} 간지`,`${label}의 간지: ${transit.hangul}(${transit.hanja}).`));
    result.header.push(add(`${prefix}.period`,'period',`${label} 적용 구간`,`${transit.start.label} ${transit.start.term}부터 ${transit.end.label} ${transit.end.term} 직전까지, 한국 표준시 기준이에요.`));
    if (transit.yearHanja) result.header.push(add(`${prefix}.term-year`,'term-year','해당 절기년',`${transit.solarTermYear}년 절기년 · 년주 ${transit.yearHangul}(${transit.yearHanja}).`));
    for (const position of ['stem','branch']) {
      const part = transit[position], god = transit[position+'God'];
      result.characters.push(add(`${prefix}.character.${position}`,'transit-character',`${label} ${position==='stem'?'천간':'지지'}`,charLabel(part)));
      result.gods.push(add(`${prefix}.god.${position}`,'transit-ten-god',`${label} ${position==='stem'?'천간':'지지 본기'} 십성`,`${label}의 ${position==='stem' ? `천간 ${part.hangul}(${part.hanja})` : `지지 ${part.hangul}(${part.hanja})의 본기 ${transit.branchMainStem.hangul}(${transit.branchMainStem.hanja})`} → 일간 ${profile.dayMaster.hangul}(${profile.dayMaster.hanja}) 기준 십성: ${god.name}(${god.hanja}) · ${GROUP_REFERENCE[god.group].label}.`));
      const count = profile.elements.find(value=>value.key===part.element).count;
      result.overlaps.push(add(`${prefix}.overlap.${position}`,'element-overlap',`${label} ${position==='stem'?'천간':'지지'} 오행의 원국 표기`,`${label}의 ${position==='stem'?'천간':'지지'} 오행 ${particle(part.elementLabel,'은','는')} 원국의 확정된 부분에 ${count}글자 있어요.`));
    }
    transit.interactions.forEach((value,index)=>result.interactions.push(add(`${prefix}.interaction.${index}`,'interaction',`${value.birthPillarLabel}와 ${label}의 ${value.label}`,interactionFact(value))));
    result.interactionCount = add(`${prefix}.interaction-count`,'interaction-count',`${label} 합충 검사 결과`,`${particle(label,'과','와')} 확정된 원국 사이에는 천간합 ${transit.interactions.filter(value=>value.kind==='stem-combination').length}쌍, 지지육합 ${transit.interactions.filter(value=>value.kind==='branch-combination').length}쌍, 지지충 ${transit.interactions.filter(value=>value.kind==='branch-clash').length}쌍이 있어요.`);
    (transit.notes || []).forEach((text,index)=>result.notes.push(add(`${prefix}.note.${index}`,'calendar-note',`${label} 기준 안내`,text)));
    if(transit.reference){
      const reference=transit.reference,source=reference.source;
      result.reference.source=add(`${prefix}.reference.source`,'reference-source',`${label} 분류 자료 출처`,`${source.name} ${source.version}, 고정 리비전 ${source.revision}. ${source.url}`);
      for(const value of reference.pillars){
        const itemPrefix=`${prefix}.reference.${value.pillarKey}`,itemLabel=`${value.pillarLabel} ${value.hangul}(${value.hanja})`;
        for(const hidden of value.hiddenStems){
          result.reference.entries.push(add(`${itemPrefix}.hidden.${hidden.order}`,'hidden-stem',`${value.pillarLabel} 지장간 ${hidden.order}`,`${itemLabel}의 지장간 ${hidden.isMain?'본기':`자료 순서 ${hidden.order}`}: ${charLabel(hidden.stem)}. 사용자 일간과의 십성 ${hidden.god.name}(${hidden.god.hanja}) · ${GROUP_REFERENCE[hidden.god.group].label}.`));
        }
        result.reference.entries.push(add(`${itemPrefix}.life-stage`,'life-stage',`${value.pillarLabel} 십이운성`,`${itemLabel}의 지지를 사용자 일간 ${profile.dayMaster.hangul}(${profile.dayMaster.hanja})과 비교한 십이운성: ${value.lifeStage.label}(${value.lifeStage.hanja}).`));
        result.reference.entries.push(add(`${itemPrefix}.nayin`,'nayin',`${value.pillarLabel} 납음`,`${itemLabel}의 납음 원자료 명칭: ${value.nayin.hanja}.`));
        result.reference.entries.push(add(`${itemPrefix}.xun`,'xun',`${value.pillarLabel} 순`,`${itemLabel}이 속한 순: ${value.xun.hangul}(${value.xun.hanja}).`));
        result.reference.entries.push(add(`${itemPrefix}.xun-kong`,'xun-kong',`${value.pillarLabel} 공망`,`${itemLabel}의 순에서 빠지는 두 지지: ${value.xunKong.hangul}(${value.xunKong.hanja}). 해당 시기 간지의 분류이며 원국에 미치는 영향은 판정하지 않았어요.`));
      }
      reference.notes.forEach((text,index)=>result.reference.notes.push(add(`${prefix}.reference.note.${index}`,'reference-note',`${label} 원자료 설명`,text)));
    }
    return result;
  }
  const annual = transitFacts(fortune.annual,'annual',`${fortune.year}년 세운`);
  const months = [...fortune.months].sort((a,b)=>a.month-b.month).map(value=>transitFacts(value,`month.${value.month}`,`${fortune.year}년 ${value.month}월 월운`));
  return {facts,lookup,natal,annual,months};
}

function references() {
  const seen = new Set(), practices = new Set();
  return {
    take(keys) {
      return unique(keys).filter(key=>!seen.has(key)).map(key=>{
        seen.add(key); const [kind,id] = key.split(':');
        const value=({stem:STEM_REFERENCE,god:GOD_REFERENCE,group:GROUP_REFERENCE,relation:RELATION_REFERENCE}[kind])[id];
        return value.description || value.definition;
      });
    },
    practice(groups) {
      return unique(groups).filter(group=>!practices.has(group)).map(group=>{practices.add(group);return PRACTICE_SUGGESTIONS[group];});
    },
  };
}
function rule(id, factIds, text, origin='traditional-symbolic') { return {id,factIds:unique(factIds),text,origin}; }
function makeChapter(registry,id,title,summary,factIds,rules=[],reference=[],practice=[],referenceRules=[]) {
  const ids = unique([...factIds,...rules.flatMap(value=>value.factIds),...referenceRules.flatMap(value=>value.factIds)]), calculation = ids.map(value=>registry.lookup.get(value).text);
  const interpretation = rules.map(value=>value.text);
  return {id,title,summary,factIds:ids,calculation,interpretation,rules,referenceRules,reference:[...reference,...referenceRules.map(value=>value.text)],practice,paragraphs:[...calculation,...interpretation],basis:calculation};
}
function groupFactIds(profile,group) {
  return [`natal.group.${group}`,...groupEntries(profile,group).map(value=>`natal.god.${value.pillarKey}.${value.position}`)];
}
function groupRules(profile,groups,prefix='natal') {
  return groups.map(group=>{
    const entries = groupEntries(profile,group), definition = GROUP_REFERENCE[group];
    const texts = unique(entries.map(value=>`${value.god.name}(${GOD_REFERENCE[value.god.code].meaning})`));
    const locations = entries.map(value=>`${value.pillarLabel} ${value.positionLabel}`).join('·');
    return rule(`${prefix}.group-reading.${group}`,groupFactIds(profile,group),entries.length
      ? `${definition.label} ${entries.length}곳의 실제 자리: ${locations}. 여기에서 확인된 ${texts.join(' / ')}를 함께 읽는 규칙을 적용했어요. ${texts.length>1?'같은 십성군 안에서도 일간과 음양이 같은 관계와 다른 관계가 함께 표시되어, 한 방향의 뜻으로만 줄이지 않고 두 주제를 나란히 읽어요.':'이 십성군에는 한 종류의 관계가 표시되어, 확인된 이름의 주제를 해당 자리와 연결해 읽어요.'}`
      : `확정된 ${profile.knownCharacterCount}글자의 천간·지지 본기에는 ${definition.label} 표기가 없어요. 따라서 이 십성군의 특정한 성향이나 사건을 이 자료에서 도출하지 않았어요. ${profile.complete?'여기서 사용하지 않은 나머지 지장간까지 없다고 말하는 것은 아니에요.':'미확정 주에 무엇이 있는지도 알 수 없으므로 없는 능력이나 나쁜 결과로 바꾸어 해석하지 않아요.'}`);
  });
}
function interactionRules(interactions,ids,prefix) {
  if (!interactions.length) return [rule(`${prefix}.no-pair`,[`${prefix}.interaction-count`],'확정된 글자의 조합 중 천간합·지지육합·지지충에 해당하는 짝이 없어, 이 세 종류의 관계 해석을 추가하지 않았어요.')];
  return Object.keys(RELATION_REFERENCE).filter(kind=>interactions.some(value=>value.kind===kind)).map(kind=>{
    const indices = interactions.map((value,index)=>value.kind===kind?index:-1).filter(index=>index>=0);
    const entries = indices.map(index=>interactions[index]);
    const places = entries.map(value=>`${value.birthPillarLabel}↔${value.otherPillarLabel} ${value.pairHangul}(${value.pairHanja})`).join('; ');
    const definition = RELATION_REFERENCE[kind];
    return rule(`${prefix}.interpret.${kind}`,indices.map(index=>ids[index]),`${definition.label} 규칙의 대상은 ${places}, 총 ${entries.length}쌍이에요. 이 짝에는 ‘${definition.meaning}’이라는 공통 규칙을 적용해요. ${kind==='branch-clash'?'두 지지의 방향을 하나로 합치기보다, 서로 다른 방향을 함께 두고 조정하는 주제로 읽어요.':'각 글자를 따로 읽는 데 더해, 둘이 연결되거나 서로 맞추는 주제로 함께 읽어요.'} ${entries.length>1?'같은 종류의 관계가 여러 자리에 있으므로, 위에 적힌 각 짝의 위치를 구별해서 비교해요.':''}`.trim());
  });
}
function pairRules(profile) {
  return GROUP_PAIR_RULES.filter(value=>groupEntries(profile,value.left).length && groupEntries(profile,value.right).length).map(value=>{
    const left = GROUP_REFERENCE[value.left], right = GROUP_REFERENCE[value.right];
    const l = groupEntries(profile,value.left), r = groupEntries(profile,value.right);
    return rule(`natal.pair.${value.id}`,[...groupFactIds(profile,value.left),...groupFactIds(profile,value.right)],`${value.title} · 서비스 작성 참고 설명: ${left.label} ${l.length}곳(${l.map(godPosition).join(', ')})과 ${right.label} ${r.length}곳(${r.map(godPosition).join(', ')})이 모두 확인되는 조건에 연결한 공통 해설이에요. ${value.reading}`,'service-reference');
  });
}
function transitGodRule(profile,transit,position,prefix) {
  const god = transit[position+'God'], entries = groupEntries(profile,god.group);
  const target = position==='stem'?transit.stem:transit.branchMainStem;
  const relation = relationOf(profile.dayMaster.element,target.element);
  const parity = profile.dayMaster.yinYang===target.yinYang ? '같고' : '다르고';
  const original = entries.length
    ? `원국에도 ${entries.map(godPosition).join('·')}의 ${GROUP_REFERENCE[god.group].label} ${entries.length}곳이 있어 같은 주제가 겹쳐 표시돼요.`
    : `이 십성군은 원국의 확정된 부분에는 없고 이번 ${prefix==='annual'?'세운':'월운'}의 비교에서 나타나요.`;
  return rule(`${prefix}.god-reading.${position}`,[`${prefix}.god.${position}`,'natal.day-master',...groupFactIds(profile,god.group)],`일간 ${particle(`${profile.dayMaster.hangul}(${profile.dayMaster.hanja})`,'과','와')} 대상 천간 ${particle(`${target.hangul}(${target.hanja})`,'은','는')} 음양이 ${parity}, 오행은 ‘${relation.label}’ 관계여서 ${particle(god.name,'으로','로')} 분류돼요. 이 분류의 공통 주제인 ‘${GOD_REFERENCE[god.code].meaning}’에 연결해 읽어요. ${original}`);
}
function overlapRules(profile,transit,prefix) {
  return ['stem','branch'].map(position=>{
    const part = transit[position], observed = profile.elements.find(value=>value.key===part.element);
    const relationship = relationOf(profile.dayMaster.element,part.element);
    return rule(`${prefix}.element-reading.${position}`,[`${prefix}.character.${position}`,`${prefix}.overlap.${position}`,'natal.day-master',`natal.element.${part.element}`],`${transit.hangul}의 ${position==='stem'?'천간':'지지'} 오행 ${particle(part.elementLabel,'을','를')} 원국과 비교하면, 확정된 원국에 같은 오행이 ${observed.count}글자 있어요. 일간과의 관계는 ‘${relationship.label}’이며, ${relationship.meaning}라는 주제로 연결해 읽어요. ${observed.count?'해당 시기 글자와 원국에 같은 오행이 표시되는 구성이라 두 자료의 공통점을 확인할 수 있어요.':'확정된 원국에서 보이지 않던 오행이 해당 시기 글자에 표시되어 두 자료의 차이를 확인할 수 있어요.'}`);
  });
}

function lifelongChapters(chart,fortune,registry) {
  const p=fortune.profile,n=registry.natal,ref=references();
  const chapter=(...args)=>makeChapter(registry,...args);
  const leading=p.dominantElements.map(value=>`${value.label} ${value.count}개`).join('·');
  const missing=p.missingElements.map(value=>value.label).join('·');
  const groupCounts=GROUP_KEYS.map(key=>`${GROUP_REFERENCE[key].label} ${groupEntries(p,key).length}곳`).join(', ');
  const relationsForDay=p.interactions.map((value,index)=>({value,index})).filter(item=>item.value.birthPillarKey==='day'||item.value.otherPillarKey==='day');
  const allPairRules=pairRules(p);
  return [
    chapter('natal-picture','원국 전체 · 확정된 글자와 미확정 부분','네 기둥의 계산 상태를 먼저 확인해요.',[n.scope,n.master,...n.pillars],[rule('natal.scope-reading',[n.scope,...n.pillars],`이 풀이에 사용하는 원국: ${p.knownPillars.map(value=>`${value.label} ${value.hangul}(${value.hanja})`).join(' · ')}. ${p.complete?'확정된 네 기둥의 천간과 지지를 각각 살피고, 글자 사이의 관계를 비교해요.':'미확정 주는 후보와 사유만 공개하고, 그 주에서 나온 성향·십성·합충을 만들어 넣지 않았어요.'}`)],['원국은 태어날 때의 년주·월주·일주·시주를 말해요. 각 기둥의 천간과 지지를 합해 사주팔자라고 불러요.']),
    chapter('day-season','일간과 출생 계절 · 관계를 계산한 범위','일간의 상징과 월지의 계절을 구분해서 읽어요.',[n.master,n.season],seasonRules(p),ref.take([`stem:${p.dayMaster.hanja}`])),
    chapter('element-yinyang','오행과 음양 · 실제 글자의 분포','글자 수를 모두 보여 주며 강약 점수로 바꾸지 않아요.',[...n.characters,...n.elements,n.yin,n.yang],[
      rule('natal.element-counts',[...n.elements,n.scope],`확정된 ${p.knownCharacterCount}글자에서 가장 많이 표시된 오행: ${leading}. ${missing?`${particle(missing,'은','는')} 현재 확정된 부분에서 0개로 집계돼요.`:'목·화·토·금·수가 모두 한 글자 이상 표시되어 있어요.'} 각 천간과 지지의 대표 오행을 같은 비중으로 세어 비교한 결과예요.`),
      rule('natal.yinyang-counts',[n.yin,n.yang,n.scope],`음 ${p.yinCount}개와 양 ${p.yangCount}개를 비교하면 ${p.yinCount===p.yangCount?'두 표기의 수가 같아요.':`${p.yinCount>p.yangCount?'음':'양'} 표기가 ${Math.abs(p.yinCount-p.yangCount)}개 더 많아요.`} 위의 글자별 목록에서 어떤 자리가 음과 양으로 나뉘는지 함께 확인할 수 있어요.`),
    ],['지지의 대표 오행을 한 글자로 세는 방식과 지장간의 여러 천간을 세는 방식은 서로 달라요. 이 화면의 오행 수는 전자의 방식이에요.']),
    chapter('ten-gods','십성 전체 · 각 자리에서 실제로 나온 관계','일간을 제외한 모든 천간·지지 본기를 공개해요.',[...n.gods,...n.groups],[rule('natal.all-gods',[...n.gods,...n.groups],`확정된 ${p.gods.length}자리의 분류는 ${groupCounts}이에요. 천간은 해당 글자를 직접 비교하고, 지지는 대표 천간인 본기를 일간과 비교했어요. 지지 자체의 음양을 그대로 십성 계산에 쓰지 않았으며, 같은 이름이 다른 자리에 있으면 각 자리를 모두 남겼어요.`)],ref.take(unique(p.gods.map(value=>`god:${value.god.code}`)))),
    chapter('natal-interactions','원국의 모든 합·충 · 어느 글자끼리 만나는가','찾아낸 관계를 상위 몇 개로 줄이지 않아요.',[n.interactionCount,...n.interactions],interactionRules(p.interactions,n.interactions,'natal'),ref.take(unique(p.interactions.map(value=>`relation:${value.kind}`)))),
    chapter('relationships','인연과 자기 기준 · 비겁과 일주 관련 자료','관계에 참고하는 자료와 사건 예측을 구분해요.',[...groupFactIds(p,'peer'),'natal.pillar.day',...relationsForDay.map(item=>n.interactions[item.index])],groupRules(p,['peer']),ref.take(['group:peer']),ref.practice(['peer'])),
    chapter('work','일과 역할 · 식상과 관성을 함께 읽기','표현·제작과 기준·책임의 실제 위치를 확인해요.',[...groupFactIds(p,'expression'),...groupFactIds(p,'authority')],groupRules(p,['expression','authority']),ref.take(['group:expression','group:authority']),ref.practice(['expression','authority'])),
    chapter('resources','재물의 분류 · 재성의 실제 위치와 종류','수익 예측 대신 재성으로 분류된 근거를 보여줘요.',groupFactIds(p,'wealth'),groupRules(p,['wealth']),ref.take(['group:wealth']),ref.practice(['wealth'])),
    chapter('learning-inner','배움·내면과 주제의 연결 · 공통 참고 해설','인성과 시주의 확인 상태를 보고, 함께 표시되는 주제의 참고 설명을 읽어요.',[...groupFactIds(p,'resource'),'natal.pillar.hour'],groupRules(p,['resource']),ref.take(['group:resource']),ref.practice(['resource']),allPairRules),
    ...(n.reference.source ? [chapter('source-reference','지장간·십이운성·납음·순과 공망 · 원자료 전체','확정된 각 주에서 조회한 분류를 생략 없이 보여줘요.',[n.reference.source,...n.reference.entries],[],n.reference.notes.map(id=>registry.lookup.get(id).text))] : []),
  ];
}

function annualChapters(fortune,registry) {
  const p=fortune.profile,a=fortune.annual,t=registry.annual,ref=references();
  const chapter=(...args)=>makeChapter(registry,...args);
  const forGroups=groups=>unique(groups.flatMap(group=>groupFactIds(p,group)));
  return [
    chapter('annual-overview',`${fortune.year}년 세운 · 간지와 적용 시각`,'입춘 기준의 세운과 두 십성 관계를 확인해요.',[...t.header,...t.characters,...t.gods,...t.notes,...referenceIds(t.reference)],[transitGodRule(p,a,'stem','annual'),transitGodRule(p,a,'branch','annual')],ref.take([`god:${a.stemGod.code}`,`god:${a.branchGod.code}`])),
    chapter('annual-interactions','세운과 원국의 모든 합·충','년주·월주·일주·시주와 비교한 결과를 빠짐없이 보여줘요.',[t.interactionCount,...t.interactions],interactionRules(a.interactions,t.interactions,'annual'),ref.take(unique(a.interactions.map(value=>`relation:${value.kind}`)))),
    chapter('annual-relationships','관계의 관점 · 세운의 십성과 원국의 비겁','계산된 관계 분류를 인연의 주제와 연결해 설명해요.',[...t.gods,...forGroups(['peer']),'natal.pillar.day'],[rule('annual.relationship-lens',[...t.gods,...forGroups(['peer'])],`${fortune.year}년 세운의 천간은 ${a.stemGod.name}, 지지 본기는 ${a.branchGod.name}이며, 원국의 비겁은 ${groupEntries(p,'peer').length}곳이에요. ${a.stemGod.group==='peer'||a.branchGod.group==='peer'?'세운에도 비겁으로 분류되는 대상이 있어 자기 기준·동료의 관점을 해당 시기 글자와 연결해 읽어요.':'세운의 두 대상은 비겁이 아닌 다른 십성군으로 분류되어, 원국의 비겁과 시기 글자가 서로 다른 주제를 가리키는 구성으로 읽어요.'}`)],ref.take(['group:peer']),ref.practice(['peer'])),
    chapter('annual-work-money','일과 재물의 관점 · 식상·관성·재성의 실제 분류','세운과 원국에서 같은 주제가 어디에 나타나는지 설명해요.',[...t.gods,...forGroups(['expression','authority','wealth'])],['expression','authority','wealth'].map(group=>{
      const targets=['stem','branch'].filter(position=>a[position+'God'].group===group);
      const count=groupEntries(p,group).length;
      return rule(`annual.domain.${group}`,[...t.gods,...groupFactIds(p,group)],`${GROUP_REFERENCE[group].label}은 원국 ${count}곳, ${fortune.year}년 세운의 천간·지지 본기 중 ${targets.length}곳으로 분류돼요. ${targets.length?`세운에서 해당하는 자리는 ${targets.map(position=>position==='stem'?'천간':'지지 본기').join('·')}이며, ${GROUP_REFERENCE[group].meaning}의 주제가 양쪽 자료에 어떻게 놓이는지 비교하는 규칙이에요.`:`세운의 두 대상에는 해당 십성군이 없어 이 시기의 해당 분류를 추가로 만들지 않았어요. 원국 ${count}곳이라는 자료는 그대로 유지해요.`}`);
    }),ref.take(['group:expression','group:authority','group:wealth']),ref.practice(['expression','authority','wealth'])),
    chapter('annual-learning','배움과 내면의 관점 · 인성의 비교','학습·지원의 분류가 확인된 자리만 읽어요.',[...t.gods,...forGroups(['resource']),'natal.pillar.hour'],[rule('annual.resource-lens',[...t.gods,...forGroups(['resource'])],`원국의 인성은 ${groupEntries(p,'resource').length}곳이고, ${fortune.year}년 세운에서는 ${['stem','branch'].filter(position=>a[position+'God'].group==='resource').length}곳이 인성으로 분류돼요. 원국의 해당 자리는 ${groupEntries(p,'resource').map(godPosition).join('·')||'확정된 부분에서 없음'}이에요. 원국에서 반복되는 학습·지원의 주제와 해당 세운에서 확인되는 분류를 구별해 함께 읽어요.`)],ref.take(['group:resource']),ref.practice(['resource'])),
    chapter('annual-elements','오행의 겹침과 풀이 범위','세운의 오행을 원국과 비교하며 생활 조언과 예측을 구분해요.',[...t.overlaps,...t.characters,...registry.natal.elements],overlapRules(p,a,'annual'),['생활 리듬에 관한 제안은 일반적인 생활 참고예요. 건강·질병·수명이나 사고 시점을 이 원국과 세운에서 계산한 것은 아니에요.']),
  ];
}

function monthlyReadings(fortune,registry) {
  const p=fortune.profile,ref=references();
  return [...fortune.months].sort((a,b)=>a.month-b.month).map((month,index)=>{
    const t=registry.months[index],prefix=t.prefix;
    const make=(...args)=>makeChapter(registry,...args);
    const stemGroups=groupFactIds(p,month.stemGod.group),branchGroups=groupFactIds(p,month.branchGod.group);
    const chapters=[
      make('month-stem','월간 · 일간과 월의 천간이 맺는 관계','음양과 오행의 관계로 분류한 십성을 설명해요.',[...t.header,...t.notes,t.characters[0],t.gods[0],...stemGroups,...referenceIds(t.reference)],[transitGodRule(p,month,'stem',prefix)],ref.take([`god:${month.stemGod.code}`,`group:${month.stemGod.group}`])),
      make('month-branch','월지 · 대표 천간으로 계산한 십성','월지의 본기를 사용한 계산 근거를 공개해요.',[t.characters[1],t.gods[1],...branchGroups],[transitGodRule(p,month,'branch',prefix)],ref.take([`god:${month.branchGod.code}`,`group:${month.branchGod.group}`])),
      make('month-interactions','원국과의 모든 합·충','이 월간지와 확정된 원국 사이의 관계 전체예요.',[t.interactionCount,...t.interactions],interactionRules(month.interactions,t.interactions,prefix),ref.take(unique(month.interactions.map(value=>`relation:${value.kind}`)))),
      make('month-elements','원국과의 오행 겹침·차이','월의 두 글자를 실제 원국 오행 수와 비교해요.',[...t.overlaps,...registry.natal.elements],overlapRules(p,month,prefix)),
    ];
    return {
      month:month.month,year:fortune.year,title:`${month.month}월 · ${month.hangul}(${month.hanja})`,
      summary:`천간 ${month.stemGod.name} · 지지 본기 ${month.branchGod.name} · 원국과의 합·충 ${month.interactions.length}쌍`,
      periodLabel:`${month.start.label} ${month.start.term} ~ ${month.end.label} ${month.end.term} 전 (한국 표준시)`,
      chapters,basis:[...t.header,...t.gods,...t.interactions,...t.notes].map(id=>registry.lookup.get(id).text),practice:[],
      factIds:unique(chapters.flatMap(value=>value.factIds)),
    };
  });
}

function buildEvidence(fortune,registry) {
  const n=registry.natal;
  const group=(id,title,ids,notes=[])=>({id,title,rows:unique(ids).map(factId=>{const value=registry.lookup.get(factId);return{factId,label:value.label,value:value.text};}),notes});
  const natalGroups=()=>[
    group('natal-pillars','네 기둥 전체와 미확정 후보',[n.scope,n.master,...n.pillars]),
    group('natal-characters','확정된 천간·지지의 오행과 음양',n.characters),
    group('natal-counts','오행·음양 집계',[...n.elements,n.yin,n.yang],['각 확정 글자를 같은 비중으로 센 수량이에요.']),
    group('natal-gods','십성의 모든 자리',[...n.gods,...n.groups],['일간 본인은 제외하고 지지는 본기만 사용했어요.']),
    group('natal-season','출생 절기 계절',[n.season]),
    group('natal-interactions','원국의 모든 천간합·지지육합·지지충',[n.interactionCount,...n.interactions]),
    ...(n.reference.source?[group('natal-reference','지장간·십이운성·납음·순과 공망 원자료',[n.reference.source,...n.reference.entries,...n.reference.notes])]:[]),
  ];
  const transitGroup=(t)=>group(`${t.prefix}-all`,`${t.label}의 전체 계산자료`,[...t.header,...t.characters,...t.gods,...t.overlaps,t.interactionCount,...t.interactions,...t.notes]);
  const transitGroups=t=>[transitGroup(t),...(t.reference.source?[group(`${t.prefix}-reference`,`${t.label}의 안쪽 글자와 전통 분류 전체`,referenceIds(t.reference))]:[])];
  return {
    lifelong:{title:'평생운 풀이에 사용한 전체 계산자료',groups:natalGroups()},
    annual:{title:`${fortune.year}년 연간 풀이에 사용한 전체 계산자료`,groups:[...natalGroups(),...transitGroups(registry.annual)]},
    monthly:{title:`${fortune.year}년 월별 풀이에 사용한 전체 계산자료`,groups:[...natalGroups(),...registry.months.flatMap(transitGroups)]},
    all:{title:`평생운과 ${fortune.year}년 올해운·월별운의 전체 계산자료`,groups:[...natalGroups(),...transitGroups(registry.annual),...registry.months.flatMap(transitGroups)]},
  };
}

function methodMetadata(fortune,topic='all') {
  const profile=fortune.profile;
  return {
    title:'풀이 기준과 범위',
    description:'입력한 생일로 사주 글자를 계산한 뒤, 전통적인 뜻에 따라 풀이해요. 계산한 내용과 그 내용을 해석한 설명은 나누어 보여드려요. 참고 설명과 생활에서 해볼 일도 함께 담았어요.',
    reuseNotice:'같은 글자와 관계가 나오면 같은 설명을 써요. 여러 특징을 함께 설명한 문장과 생활 예시는 오쭈다가 작성했어요. 같은 특징이 나온 풀이에 함께 쓰는 참고 설명이에요.',
    calculated:[
      '태어난 해·달·날·시간의 글자와, 아직 정할 수 없는 부분의 후보와 이유',
      '나무·불·흙·쇠·물의 개수와 음양의 개수, 나를 나타내는 글자와 태어난 계절의 관계',
      '다른 글자를 친구·표현·돈·약속·배움의 이야기로 읽는 이름과 그 위치·개수',
      '태어난 사주에서 어울리거나 차이가 부딪히는 글자 조합 전체(합·충)',
      ...(topic==='annual'?[fortune.year+'년 한 해의 글자와 날짜, 내 사주와의 관계 전체(세운)']
        :topic==='monthly'?[fortune.year+'년 12개월의 글자와 날짜, 내 사주와의 관계 전체(월운)']
        :topic==='all'?[fortune.year+'년 한 해와 12개월의 글자·날짜, 내 사주와의 관계 전체']:[]),
      '아래쪽 글자에 연결된 글자 전체(지장간)와 십이운성·납음·순·공망의 원래 자료',
      ...(topic==='annual'?['올해 글자의 안쪽에 연결된 글자 전체와 나를 나타내는 글자와의 관계, 전통 분류의 원래 이름']
        :topic==='monthly'?['12개월 각각의 안쪽에 연결된 글자 전체와 나를 나타내는 글자와의 관계, 전통 분류의 원래 이름']
        :topic==='all'?['올해와 12개월 각각의 안쪽 글자 전체, 내 기준 글자와의 관계와 전통 분류']:[]),
      '태어난 사주에 두 가지 특징을 나타내는 이름이 함께 있는지 확인',
    ],
    notCalculated:[
      '10년씩 나누어 보는 운세와 시작 나이(대운), 나이에 따라 어떤 사건이 생기는지',
      '내 사주가 강한지 약한지, 어떤 기운이 이로운지에 대한 종합 판단(신강·신약·용신·희신·기신·격국)',
      '안쪽 글자마다 이름과 중요도를 더 자세히 정하거나 계절에 따라 힘을 다르게 매기는 것(중기·여기·통근·조후)',
      '짝을 이루는 글자가 다른 기운으로 바뀌는지와 그 밖의 조합·이름이 미치는 영향(합화·삼합·방합·형·파·해·원진·신살·공망)',
      '수입 금액, 합격·결혼 날짜, 병·사고·수명처럼 실제로 일어날 일을 정하는 것',
      '태어난 지역에 맞춰 시간을 따로 고치거나, 옛날에 쓰던 시계 차이를 맞추는 것(태양시·과거 표준시·서머타임)',
    ],
    warnings:[
      ...(!profile.complete?['아직 정할 수 없는 글자가 있어 확인된 '+profile.knownCharacterCount+'글자만 읽어요. 확인한 부분에 어떤 이름이 없더라도, 아직 모르는 부분에는 있을 수 있어요.']:[]),
      '친구·표현·돈·약속·배움의 개수를 셀 때는 나를 나타내는 기준 글자 자체를 빼고 다른 자리만 세어요.',
      '아래쪽 글자는 대표가 되는 글자로 관계를 읽어요. 안쪽에 연결된 다른 글자들은 별도 자료에서 모두 보여 드려요.',
      '별도 자료의 안쪽 글자를 기존 개수에 더해 세지 않아요. 전통 분류의 이름을 보여 주는 것과 그 이름이 삶에 영향을 준다고 판단하는 것은 달라요.',
      '사주에 합이나 충이 있어도, 그 때문에 실제 사건이 일어난다는 뜻은 아니에요.',
      '현재 한국 시계인 한국 표준시(UTC+9)로 계산해요. 해외 출생이나 과거의 시계 차이는 따로 맞추지 않아요.',
      '글자마다 한 개씩 똑같이 세어요. 개수가 많다고 더 좋은 운이거나 더 뛰어난 능력이라는 뜻은 아니에요.',
      ...(!profile.season?['계절이 바뀌는 시각 전후를 확인할 수 없어요. 그래서 태어난 계절에 따른 풀이는 넣지 않았어요.']:[]),
    ],
  };
}
function adviceCopy(advice) {
  if(!advice?.length)return [];
  const lines=['','선택에 도움이 되는 제안'];
  for(const item of advice)lines.push('',item.title,'해 볼 일: '+item.action,'함께 살펴볼 점: '+item.caution);
  return lines;
}
const summaryCopy = item => [...(Array.isArray(item?.summaryLines) ? ['두 줄 요약',...item.summaryLines] : []),...readingScoreCopy(item)];
function readerCopy(overview,periodLabel='') {
  if (!overview) return [];
  const lines=['',overview.title,overview.headline,...(periodLabel?[periodLabel]:[]),...summaryCopy(overview),...(overview.paragraphs||[])];
  for (const card of overview.cards||[]) {
    lines.push('',card.label,card.title,...summaryCopy(card),...card.paragraphs);
    if(card.scopeNotice) lines.push('풀이 범위: '+card.scopeNotice);
  }
  return lines;
}
function readerExtrasCopy(extras) {
  if(!extras) return [];
  const lines=['',extras.title,extras.headline,...summaryCopy(extras),...(extras.paragraphs||[])];
  for(const item of extras.items||[]) {
    if(item.value!=null) lines.push('',item.label+': '+item.value,...summaryCopy(item),item.description);
    else {
      lines.push('',item.title,item.periodLabel,item.headline,...summaryCopy(item),...(item.paragraphs||[]));
      for(const [key,label] of [['opportunities','기회'],['people','도움을 구할 사람'],['documents','문서와 계약'],['cautions','주의할 점']]) {
        lines.push(label,...(item[key]||[]).flatMap(value=>[...summaryCopy(value),value.label+': '+value.text]));
      }
    }
  }
  return lines;
}
function copyCategory(report,topic) {
  const topics=topic==='all'?['lifelong','annual','monthly']:[topic];
  const title=topic==='all'?`전체 풀이 · 평생운과 ${report.year}년 올해운·월별운`:
    topic==='lifelong'?'평생운 · 나의 사주와 생활 이야기':report.year+'년 '+(topic==='annual'?'올해운':'월별운');
  const lines=['오쭈다 · 별빛 사주팔자',title];
  if(report.reader.scopeNotice) lines.push(report.reader.scopeNotice);
  for(const current of topics) {
    if(current==='lifelong'&&report.personPortrait) {
      const portrait=report.personPortrait;
      lines.push('',portrait.title,portrait.headline,...summaryCopy(portrait),...portrait.paragraphs);
      for(const card of portrait.cards)lines.push('',card.label,card.title,...summaryCopy(card),...card.paragraphs);
      if(portrait.scopeNotice)lines.push(portrait.scopeNotice);
      lines.push('','항목별 상세 풀이');
    }
    if(current==='monthly') for(const month of report.reader.months) {
      const detail=report.months.find(value=>value.month===month.month);
      lines.push(...readerCopy(month,detail?.periodLabel||''),...adviceCopy(detail?.advice));
    }
    else {
      const periodLabel=current==='annual'?report.facts.find(fact=>fact.id==='annual.period')?.text||'':'';
      lines.push(...readerCopy(report.reader[current],periodLabel),...adviceCopy(report.adviceByCategory[current]));
    }
    if(current==='lifelong'&&report.daeun)lines.push('',copyDaeunReading(report.daeun));
    if(current==='lifelong') lines.push(...readerExtrasCopy(report.reader.symbols));
    if(current==='monthly') lines.push(...readerExtrasCopy(report.reader.timings));
  }
  return lines.join('\n');
}

/** No external requests, randomness, user storage or fabricated chart entries.
 * Every calculated sentence is registered and linked from chapter.factIds.
 * Interpretation rules and shared references remain distinct in the result. */
export function buildDetailedReading(chart,fortune,{daeun=null}={}) {
  const profile=fortune?.profile;
  if(!profile?.dayMaster || !STEM_REFERENCE[profile.dayMaster.hanja] || chart?.dayMaster?.hanja!==profile.dayMaster.hanja
    || !Array.isArray(fortune.months) || fortune.months.length!==12 || new Set(fortune.months.map(value=>value.month)).size!==12
    || fortune.months.some(value=>!Number.isInteger(value.month)||value.month<1||value.month>12))throw new Error('확인된 사주 분석으로 풀이를 다시 준비해 주세요.');
  const registry=createFacts(chart,fortune);
  const report={
    year:fortune.year,title:`${STEM_REFERENCE[profile.dayMaster.hanja].name} 원국과 ${fortune.year}년의 계산·해설`,
    intro:`확정된 ${profile.knownCharacterCount}글자와 실제로 계산한 관계만 풀이의 근거로 사용해요. 계산된 자료와 그 위에 적용한 해석 규칙은 서로 구분해서 읽어 주세요.`,
    method:methodMetadata(fortune),facts:registry.facts,
    methodByCategory:Object.fromEntries(['lifelong','annual','monthly','all'].map(topic=>[topic,methodMetadata(fortune,topic)])),
    sections:[
      {id:'lifelong',title:'평생운 · 원국의 장기 주제',kicker:'NATAL CHART',summary:'확정된 원국의 구성과 관계를 읽어요. 나이별 대운이나 정해진 사건의 순서를 계산한 내용은 아니에요.',chapters:lifelongChapters(chart,fortune,registry)},
      {id:'annual',title:`${fortune.year}년 연간운`,kicker:'YEARLY CHART',summary:`${fortune.annual.hangul}(${fortune.annual.hanja}) 세운과 실제 원국의 관계예요. ${fortune.annual.notes.join(' ')}`,chapters:annualChapters(fortune,registry)},
    ],
    monthsIntro:fortune.notes.join(' '),months:monthlyReadings(fortune,registry),
    evidence:buildEvidence(fortune,registry),
  };
  attachPlainLanguage(report,chart,fortune);
  attachAdvice(report,fortune);
  attachDeeperReadings(report,fortune);
  attachStageReadings(report,fortune);
  attachReaderSummary(report,chart,fortune);
  attachReaderExtras(report,chart,fortune);
  report.personPortrait=buildPersonPortrait({profile:fortune.profile,facts:report.facts,chapters:report.sections.find(section=>section.id==='lifelong').chapters});
  if(daeun) {
    report.daeun=buildDaeunReading(chart,daeun);
    report.daeunCalculation=daeun;
    const methods=[report.method,report.methodByCategory.lifelong,report.methodByCategory.all];
    for(const method of methods) {
      method.notCalculated=method.notCalculated.filter(text=>!text.startsWith('10년씩 나누어 보는'));
      if(daeun.available)method.calculated.push('성별과 태어난 해의 글자, 절기까지의 시간으로 계산한 10년 운세(대운). 시작 시점과 순서, 각 기간과 내 사주의 관계');
      else method.notCalculated.unshift(daeun.message);
    }
    report.sections.find(section=>section.id==='lifelong').summary=daeun.available
      ?'내 성격과 평소의 생활 모습을 읽어요. 10년 단위 운세는 따로 골라 볼 수 있어요.'
      :'확인한 사주 글자로 내 성격과 생활 모습을 읽어요. '+daeun.message;
  }
  attachReadingSummaryLines(report);
  attachReadingScores(report,chart,fortune);
  report.copyByCategory=Object.fromEntries(['lifelong','annual','monthly','all'].map(topic=>[topic,copyCategory(report,topic)]));
  report.copyText=report.copyByCategory.all;
  return report;
}
