// Themes organize related readings. The caller retains the original source,
// topic, person and period as separate reading and deduplication boundaries.
const THEMES={
  overview:{id:'overview',label:'전체 흐름',order:0},
  character:{id:'character',label:'성격·성향',order:10},
  relationships:{id:'relationships',label:'연애·관계',order:20},
  work:{id:'work',label:'일·진로·배움',order:30},
  money:{id:'money',label:'재물·계약',order:40},
  lifestyle:{id:'lifestyle',label:'생활·컨디션',order:50},
  timing:{id:'timing',label:'기회·주의점',order:60},
  symbols:{id:'symbols',label:'색·숫자·방향',order:70},
  supplements:{id:'supplements',label:'생활 속 추가 해설',order:75},
  other:{id:'other',label:'그밖의 풀이',order:80},
  information:{id:'information',label:'풀이 안내',order:90},
};
const GENERAL_IDS={
  'portrait-decisions':'character',
  'portrait-relationships':'relationships',
  'portrait-work':'work',
  'portrait-pressure':'lifestyle',
  'portrait-adjustment':'relationships',
  'natal-character':'character',
  'natal-aptitude':'work',
  'natal-life-path':'overview',
  'natal-relationships':'relationships',
  'natal-parents':'relationships',
  'natal-children':'relationships',
  'natal-work':'work',
  'natal-career-examples':'work',
  'natal-learning':'work',
  'natal-money':'money',
  'natal-contracts':'money',
  'natal-helpers':'relationships',
  'natal-boundaries':'relationships',
  'natal-health':'lifestyle',
  'natal-space':'lifestyle',
  'natal-safety':'lifestyle',
  'natal-cautions':'timing',
  'natal-response':'timing',
  // One supplemental source can cover several calculated subjects. Its hidden
  // stems are not a personality-only reading; its stages are not a forecast.
  'natal-supplement-hidden':'supplements',
  'natal-supplement-stages':'supplements',
  'annual-supplement-hidden':'supplements',
  'annual-supplement-stages':'supplements',
};
const PERIOD_CARDS={relationships:'relationships',work:'work',money:'money',learning:'work',
  opportunities:'timing',cautions:'timing',response:'timing'};
for(const [topic,theme] of Object.entries(PERIOD_CARDS)) {
  GENERAL_IDS[`annual-${topic}`]=theme;
  for(let month=1;month<=12;month++)GENERAL_IDS[`month-${month}-${topic}`]=theme;
}
for(let month=1;month<=12;month++) {
  GENERAL_IDS[`month-${month}-supplement-hidden`]='supplements';
  GENERAL_IDS[`month-${month}-supplement-stages`]='supplements';
}
const DECADE_TOPICS={money:'money',documents:'money',work:'work',learning:'work',
  relationships:'relationships',people:'relationships'};
const TIMING_KINDS={opportunities:'timing',people:'relationships',documents:'money',cautions:'timing'};
const TIMING_TOPICS={opportunity:'timing',coordination:'timing',people:'relationships',
  document:'money',caution:'timing',change:'timing'};
const ADVICE_TOPICS={companion:'relationships',competitor:'money',creator:'work',critic:'work',
  opportunist:'money',manager:'money',challenger:'work',officer:'work',explorer:'work',scholar:'work',
  connect:'relationships',clash:'relationships','no-pair':'timing'};
const OVERVIEWS={lifelong:'character',annual:'overview',monthly:'overview',timing:'timing',advice:'lifestyle'};
const PEOPLE_TOPICS={overview:'character',decisions:'character',relationships:'relationships',
  work:'work',pressure:'lifestyle',adjustment:'relationships'};
const COMPATIBILITY_CARDS={foundation:'character',zodiac:'relationships',connection:'relationships',
  differences:'relationships',everyday:'lifestyle',conversation:'relationships'};
const COMPATIBILITY_SCORES={temperament:'character',complement:'relationships',daily:'lifestyle',harmony:'relationships'};
const GENERAL_SOURCES={
  'reading-person-portrait':'character',
  'reading-daeun':'overview',
  'reading-symbols':'symbols',
  'reading-timings':'timing',
  'reading-month-periods':'information',
  'reading-coverage':'information',
};
const lookup=(table,id)=>typeof id==='string'&&Object.hasOwn(table,id)?table[id]:null;

function generalTheme(scene,semantic) {
  for(const id of [semantic.readerCard,semantic.portraitCard,semantic.readingSupplement,scene.topic,scene.source]) {
    const theme=lookup(GENERAL_IDS,id);if(theme)return theme;
  }
  for(const id of [semantic.daeunTopic,scene.topic,scene.source]) {
    const match=typeof id==='string'&&id.match(/^daeun\.reading\.period\.[1-9]\d*\.(money|documents|work|learning|relationships|people)$/);
    if(match)return DECADE_TOPICS[match[1]];
  }
  const timing=lookup(TIMING_KINDS,semantic.timingKind)||lookup(TIMING_TOPICS,semantic.timingTopic);
  if(timing)return timing;
  const advice=typeof semantic.adviceId==='string'&&semantic.adviceId.match(
    /^(?:natal|annual|month\.(?:[1-9]|1[0-2]))\.advice\.(?:god\.(companion|competitor|creator|critic|opportunist|manager|challenger|officer|explorer|scholar)|(connect|clash|no-pair))$/);
  if(advice)return ADVICE_TOPICS[advice[1]||advice[2]];
  const source=scene.source||'';
  const direct=lookup(GENERAL_SOURCES,source);if(direct)return direct;
  if(source==='reading-summary')return scene.domain==='lifelong'?'character':'overview';
  if(/^daeun\.reading\.period\.[1-9]\d*$/.test(source)||/^reading-daeun-period-[1-9]\d*$/.test(source)
    ||/^reading-month-(?:[1-9]|1[0-2])$/.test(source))return 'overview';
  return lookup(OVERVIEWS,semantic.readingOverview)||'other';
}

function compatibilityTheme(scene,semantic) {
  const people=lookup(PEOPLE_TOPICS,semantic.compatibilityTopic);if(people)return people;
  const card=lookup(COMPATIBILITY_CARDS,semantic.readerCard);if(card)return card;
  for(const id of [scene.topic,scene.source]) {
    if(typeof id!=='string')continue;
    const person=id.match(/^(?:compatibility-people-|person-(?:self|partner)-)(overview|decisions|relationships|work|pressure|adjustment)$/);
    if(person)return PEOPLE_TOPICS[person[1]];
    const score=id.match(/^compatibility-score-detail-(temperament|complement|daily|harmony)$/);
    if(score)return COMPATIBILITY_SCORES[score[1]];
  }
  if(['compatibility-synthesis','compatibility-reading-overview','compatibility-scores'].includes(scene.source))return 'overview';
  if(scene.source==='compatibility-reading-coverage')return 'information';
  return 'other';
}

/** Return a display group only; never rewrite a source, score, person or date. */
export function getReadingTheme(scene,{mode='general'}={}) {
  const value=scene||{},semantic=value.semantic||{};
  const key=value.domain==='information'?'information':mode==='compatibility'
    ?compatibilityTheme(value,semantic):generalTheme(value,semantic);
  const theme={...THEMES[key]};
  if(mode==='compatibility'&&key==='relationships')theme.label='관계·대화';
  if(mode==='compatibility'&&key==='overview')theme.label=value.domain==='scores'?'궁합 점수':'종합 궁합';
  return theme;
}
