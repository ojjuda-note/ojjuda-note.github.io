import {STEM_REFERENCE, GROUP_REFERENCE, ELEMENT_RELATIONS} from './readings-data.mjs?v=20261113-saju-easy1';

// Shared natal evidence and season rules. No annual/monthly calculation, clock,
// partner data or invented pillar enters this registry. Text and order are kept
// identical to the original general reading.
const GROUP_KEYS = ['peer', 'expression', 'wealth', 'authority', 'resource'];
const ELEMENT_KEYS = ['wood', 'fire', 'earth', 'metal', 'water'];
const PILLAR_LABELS = {year:'년주',month:'월주',day:'일주',hour:'시주'};
export const charLabel = value => `${value.hangul}(${value.hanja}) · ${value.elementLabel}(${value.elementHanja}) · ${value.yinYang}`;
const groupEntries = (profile, group) => profile.gods.filter(value => value.god.group === group);
const unique = values => [...new Set(values)];
export function particle(text, consonant, vowel) {
  const syllables = String(text).match(/[가-힣]/g);
  const last = syllables?.[syllables.length - 1];
  return `${text}${last && (last.charCodeAt(0) - 0xac00) % 28 !== 0 ? consonant : vowel}`;
}
export function relationOf(day, target) {
  return ELEMENT_RELATIONS[(ELEMENT_KEYS.indexOf(target) - ELEMENT_KEYS.indexOf(day) + 5) % 5];
}
export function godPosition(entry) {
  return `${entry.pillarLabel} ${entry.positionLabel} ${entry.sourceHangul}(${entry.sourceHanja})`;
}
function godFact(entry) {
  const target = entry.position === 'branch'
    ? `${godPosition(entry)}의 대표 천간은 ${entry.stem.hangul}(${entry.stem.hanja})`
    : godPosition(entry);
  return `${target}이며, 일간과의 십성은 ${entry.god.name}(${entry.god.hanja}) · ${GROUP_REFERENCE[entry.god.group].label}이에요.`;
}
export function interactionFact(value) {
  return `${value.birthPillarLabel}의 ${particle(`${value.birthCharacter.hangul}(${value.birthCharacter.hanja})`,'과','와')} ${value.otherPillarLabel}의 ${value.otherCharacter.hangul}(${value.otherCharacter.hanja}): ${value.pairHangul}(${value.pairHanja}) ${value.label}.`;
}

export function buildNatalReadingData(chart, profile) {
  const facts = [], lookup = new Map();
  function add(id, kind, label, text) {
    if (lookup.has(id)) throw new Error('풀이 근거의 식별자가 중복되었어요.');
    const value = {id,kind,label,text};
    facts.push(value); lookup.set(id,value); return id;
  }
  const natal = {pillars:[],characters:[],elements:[],gods:[],groups:[],interactions:[],reference:{entries:[],notes:[]}};
  for (const key of Object.keys(PILLAR_LABELS)) {
    const value = chart.pillars.find(pillar => pillar.key === key);
    let text;
    if (value && !value.uncertain && value.hanja) {
      text = `${PILLAR_LABELS[key]}는 ${value.hangul}(${value.hanja})로 확정되어 있어요. 천간 ${charLabel(value.stem)}, 지지 ${charLabel(value.branch)}.`;
    } else {
      const alternatives = value?.alternatives || [];
      text = `${PILLAR_LABELS[key]}는 미확정이에요. ${alternatives.length
        ? `절기 경계에 따라 가능한 후보는 ${alternatives.map(candidate => `${candidate.hangul}(${candidate.hanja})`).join(' / ')}이며, 어느 하나를 선택하지 않았어요.`
        : '태어난 시간을 알 수 없어 글자를 채우지 않았어요.'}`;
    }
    natal.pillars.push(add(`natal.pillar.${key}`,'pillar',PILLAR_LABELS[key],text));
  }
  natal.master = add('natal.day-master','day-master','일간',`기준 일간은 ${STEM_REFERENCE[profile.dayMaster.hanja].name}: ${charLabel(profile.dayMaster)}.`);
  natal.scope = add('natal.scope','scope','확정 범위',`네 기둥 중 ${profile.knownPillars.length}개, 천간·지지 ${profile.knownCharacterCount}글자가 확정되어 있어요. ${profile.complete ? '네 기둥의 글자가 모두 확인되어 있어요.' : '미확정 주는 오행·음양·십성·합충 집계에서 제외했어요.'}`);
  for (const pillar of profile.knownPillars) {
    for (const position of ['stem','branch']) {
      natal.characters.push(add(`natal.character.${pillar.key}.${position}`,'character',`${pillar.label} ${position === 'stem' ? '천간' : '지지'}`,charLabel(pillar[position])));
    }
  }
  for (const value of profile.elements) natal.elements.push(add(`natal.element.${value.key}`,'element',`${value.label}(${value.hanja})`,`${particle(value.label,'은','는')} 확정된 글자 중 ${value.count}개예요. (${value.hanja})`));
  natal.yin = add('natal.yin','yin-yang','음의 글자',`확정된 글자 중 음은 ${profile.yinCount}개예요.`);
  natal.yang = add('natal.yang','yin-yang','양의 글자',`확정된 글자 중 양은 ${profile.yangCount}개예요.`);
  for (const value of profile.gods) natal.gods.push(add(`natal.god.${value.pillarKey}.${value.position}`,'ten-god',`${value.pillarLabel} ${value.positionLabel}`,godFact(value)));
  for (const group of GROUP_KEYS) natal.groups.push(add(`natal.group.${group}`,'ten-god-count',GROUP_REFERENCE[group].label,`${GROUP_REFERENCE[group].label} 표기는 ${groupEntries(profile,group).length}곳이에요.`));
  natal.season = add('natal.season','season','출생 절기 계절',profile.season
    ? `확정 월지 ${profile.season.branch.hangul}(${profile.season.branch.hanja})에 따른 절기 계절은 ${profile.season.label}, 범위는 ${profile.season.terms}이에요.`
    : '월주가 미확정이어서 출생 절기 계절을 정하지 않았어요.');
  profile.interactions.forEach((value,index) => natal.interactions.push(add(`natal.interaction.${index}`,'interaction',`${value.birthPillarLabel}·${value.otherPillarLabel} ${value.label}`,interactionFact(value))));
  natal.interactionCount = add('natal.interaction-count','interaction-count','원국 합충 검사 결과',`확정된 원국에서 천간합 ${profile.interactions.filter(value=>value.kind==='stem-combination').length}쌍, 지지육합 ${profile.interactions.filter(value=>value.kind==='branch-combination').length}쌍, 지지충 ${profile.interactions.filter(value=>value.kind==='branch-clash').length}쌍을 확인했어요. 같은 짝이 서로 다른 자리에 있으면 각각 기록해요.`);
  if (profile.reference) {
    const reference=profile.reference, source=reference.source;
    natal.reference.source=add('natal.reference.source','reference-source','분류 자료 출처',`${source.name} ${source.version}, 고정 리비전 ${source.revision}. ${source.url}`);
    for (const value of reference.pillars) {
      const prefix=`natal.reference.${value.pillarKey}`, label=`${value.pillarLabel} ${value.hangul}(${value.hanja})`;
      for (const hidden of value.hiddenStems) {
        natal.reference.entries.push(add(`${prefix}.hidden.${hidden.order}`,'hidden-stem',`${value.pillarLabel} 지장간 ${hidden.order}`,`${label}의 지장간 ${hidden.isMain?'본기':`자료 순서 ${hidden.order}`}: ${charLabel(hidden.stem)}. 일간과의 십성 ${hidden.god.name}(${hidden.god.hanja}) · ${GROUP_REFERENCE[hidden.god.group].label}.`));
      }
      natal.reference.entries.push(add(`${prefix}.life-stage`,'life-stage',`${value.pillarLabel} 십이운성`,`${label}의 지지를 일간 ${profile.dayMaster.hangul}(${profile.dayMaster.hanja})과 비교한 십이운성: ${value.lifeStage.label}(${value.lifeStage.hanja}).`));
      natal.reference.entries.push(add(`${prefix}.nayin`,'nayin',`${value.pillarLabel} 납음`,`${label}의 납음 원자료 명칭: ${value.nayin.hanja}.`));
      natal.reference.entries.push(add(`${prefix}.xun`,'xun',`${value.pillarLabel} 순`,`${label}이 속한 순: ${value.xun.hangul}(${value.xun.hanja}).`));
      natal.reference.entries.push(add(`${prefix}.xun-kong`,'xun-kong',`${value.pillarLabel} 공망`,`${label}의 순에서 빠지는 두 지지: ${value.xunKong.hangul}(${value.xunKong.hanja}).`));
    }
    reference.notes.forEach((text,index)=>natal.reference.notes.push(add(`natal.reference.note.${index}`,'reference-note','원자료 설명',text)));
  }

  return {facts,lookup,natal,add};
}

function rule(id, factIds, text, origin='traditional-symbolic') { return {id,factIds:unique(factIds),text,origin}; }
export function seasonRules(profile) {
  if (!profile.season) return [rule('natal.season-unavailable',['natal.day-master','natal.season'],'일간은 확인되지만 출생 월주가 미확정이므로, 계절과 일간의 관계를 계산한 해석은 제공하지 않아요. 후보 중 한 계절을 선택해 맞춤 성향을 만들지 않았어요.')];
  const relationship = relationOf(profile.dayMaster.element,profile.season.element);
  const target = profile.elements.find(value=>value.key===profile.season.element);
  return [rule(`natal.season.${relationship.key}`,['natal.day-master','natal.season',`natal.element.${profile.dayMaster.element}`,`natal.element.${profile.season.element}`],`일간의 ${particle(profile.dayMaster.elementLabel,'과','와')} 출생 절기 ${profile.season.label}의 대표 오행 ${particle(target.label,'을','를')} 비교하면 ‘${relationship.label}’ 관계예요. ${relationship.definition} 출생 계절을 일간에 연결하는 이 규칙에서는 ${relationship.meaning}라는 상징으로 설명해요. 확정된 원국에서 계절 대표 오행의 글자는 ${target.count}개로 따로 확인돼요.`)];
}
