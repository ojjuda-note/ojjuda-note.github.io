import {keepGeneralCard,keepPortraitCard,keepCompatibilityPersonTopic,keepCompatibilityCard} from './reading-selection.mjs?v=20261120-saju-prune1';

const GENERAL_REPRESENTATIVES={
  'natal-character':{anchor:'person-portrait-headline'},
  'natal-aptitude':{portraitCard:'portrait-work'},
  'natal-life-path':{portraitCard:'portrait-work'},
  'natal-work':{portraitCard:'portrait-work'},
  'natal-cautions':{portraitCard:'portrait-pressure'},
  'natal-response':{portraitCard:'portrait-work'},
};
const COMPATIBILITY_REPRESENTATIVES={
  foundation:'compatibility-score-detail-temperament',
  connection:'compatibility-score-detail-complement',
  differences:'compatibility-score-detail-harmony',
  everyday:'compatibility-score-detail-daily',
};
const COMPATIBILITY_SOURCES={
  'compatibility-reading-card-1':'foundation',
  'compatibility-reading-card-3':'connection',
  'compatibility-reading-card-4':'differences',
  'compatibility-reading-card-5':'everyday',
};

function removal(scene,mode) {
  const data=scene.semantic||{};
  if(mode==='compatibility') {
    const card=data.readerCard||COMPATIBILITY_SOURCES[scene.source];
    if(card&&!keepCompatibilityCard(card))return {kind:'compatibility-card',card};
    if(data.compatibilityTopic&&!keepCompatibilityPersonTopic(data.compatibilityTopic))return {kind:'person'};
    if(scene.source==='compatibility-reading-overview')return {kind:'compatibility-overview'};
    return null;
  }
  if(data.readerCard&&!keepGeneralCard(data.readerCard))return {kind:'general-card',card:data.readerCard};
  if(data.portraitCard&&!keepPortraitCard(data.portraitCard))return {kind:'portrait'};
  if(data.readingOverview==='legacy-lifelong')return {kind:'legacy-lifelong'};
  if(data.readingSupplement)return {kind:'supplement'};
  if(data.adviceId||data.readingOverview==='advice')return {kind:'advice'};
  if(data.readingOverview==='monthly-spotlight')return {kind:'spotlight'};
  if(data.readingOverview==='timing'||data.timingKind||scene.source==='reading-timings'
    ||/^reading-timings-month-(?:[1-9]|1[0-2])$/u.test(scene.source||''))return {kind:'timing'};
  return null;
}

function person(scene) {
  return scene.semantic?.personKey||scene.semantic?.personMarker||'';
}

function sameBoundary(left,right,{pair=false}={}) {
  if(person(left)!==person(right))return false;
  if((left.period?.id||'')!==(right.period?.id||''))return false;
  if(!pair&&left.domain!==right.domain)return false;
  const month=scene=>scene.semantic?.month||scene.period?.id?.match(/^month-(\d+)$/u)?.[1]||'';
  return String(month(left))===String(month(right));
}

function representative(scene,reason,kept,aliases,mode) {
  const pair=mode==='compatibility';
  const suitable=target=>target&&kept.has(target)&&sameBoundary(scene,target,{pair});
  const anchor=id=>{const target=aliases.get(id);return suitable(target)?target:null;};
  const matching=predicate=>{
    let fallback=null;
    for(const target of kept)if(suitable(target)&&predicate(target)) {
      if(target.summaryTitle||target.kind==='summary')return target;
      if(!fallback)fallback=target;
    }
    return fallback;
  };
  if(reason.kind==='compatibility-card') {
    const source=COMPATIBILITY_REPRESENTATIVES[reason.card];
    return source?(anchor(source)||matching(target=>target.source===source)):null;
  }
  if(reason.kind==='compatibility-overview') {
    return anchor('compatibility-synthesis')||matching(target=>target.source==='compatibility-synthesis');
  }
  if(reason.kind==='legacy-lifelong')return anchor('person-portrait-headline')||anchor('reading-person-portrait');
  if(reason.kind==='general-card') {
    const selected=GENERAL_REPRESENTATIVES[reason.card];
    if(selected?.anchor)return anchor(selected.anchor)||anchor('reading-person-portrait');
    if(selected?.portraitCard)return matching(target=>target.semantic?.portraitCard===selected.portraitCard);
    const period=reason.card.match(/^(annual|month-(?:[1-9]|1[0-2]))-response$/u);
    if(period)return matching(target=>target.semantic?.readerCard===`${period[1]}-work`);
  }
  // A removed supplement or an ambiguous old shortcut must not silently open
  // another month, person, or an unrelated first item in the report.
  return null;
}

function preservedNotices(removed,mode,existingIds) {
  const paragraphs=new Map();
  for(const [scene,reason] of removed)for(const [index,part] of (scene.paragraphs||[]).entries()) {
    if(reason.kind==='supplement'||(scene.kind!=='scope'&&part.kind!=='scope'))continue;
    const key=part.key||`${scene.id}:scope:${index}`;
    if(!paragraphs.has(key))paragraphs.set(key,{scene,text:'',pieces:[]});
    const paragraph=paragraphs.get(key);paragraph.text+=part.text;
    paragraph.pieces.push({scene,part});
  }
  const source=mode==='compatibility'?'compatibility-reading-coverage':'reading-coverage';
  const notices=[],redirects=new Map(),seen=new Map();let serial=0;
  for(const paragraph of paragraphs.values()) {
    const key=JSON.stringify([person(paragraph.scene),paragraph.text]);
    const duplicate=seen.get(key);
    if(duplicate) {
      for(const {scene} of paragraph.pieces)if(!redirects.has(scene))redirects.set(scene,duplicate);
      continue;
    }
    let first=null;
    for(const {scene,part} of paragraph.pieces) {
      const data=scene.semantic||{},semantic={};
      for(const name of ['personKey','personMarker'])if(data[name]!==undefined)semantic[name]=data[name];
      let id;do{id=`${source}-notice-${++serial}`;}while(existingIds.has(id));
      existingIds.add(id);
      const notice={...scene,id,source,topic:source+(person(scene)?`-${person(scene)}`:''),
        domain:'information',period:undefined,group:'풀이 안내',
        label:data.personMarker?`${data.personMarker} · 풀이 안내`:'풀이 안내',title:'풀이 안내',
        kind:'scope',summaryTitle:false,paragraphs:[part],semantic,context:[],aliases:[],score:null,graph:null};
      notices.push(notice);if(!first)first=notice;
      if(!redirects.has(scene))redirects.set(scene,notice);
    }
    if(first)seen.set(key,first);
  }
  return {notices,redirects};
}

/** Select authored representatives without changing their text, scores or order. */
export function selectRepresentativeReadings(scenes,aliases,{mode='general'}={}) {
  const kept=[],removed=new Map();
  for(const scene of scenes) {
    const reason=removal(scene,mode);
    if(reason)removed.set(scene,reason);else kept.push(scene);
  }
  if(!removed.size)return scenes;
  const retained=new Set(kept),originalAliases=new Map(aliases);
  const {notices,redirects}=preservedNotices(removed,mode,new Set([...scenes.map(scene=>scene.id),...aliases.keys()]));
  for(const [scene,reason] of removed)if(!redirects.has(scene)) {
    const target=representative(scene,reason,retained,originalAliases,mode);
    if(target)redirects.set(scene,target);
  }
  for(const [id,scene] of aliases) {
    if(retained.has(scene))continue;
    const target=redirects.get(scene);
    if(target)aliases.set(id,target);else aliases.delete(id);
  }
  for(const [scene,target] of redirects) {
    if(!retained.has(scene))aliases.set(scene.id,target);
  }
  for(const notice of notices)aliases.set(notice.id,notice);
  return [...kept,...notices];
}
