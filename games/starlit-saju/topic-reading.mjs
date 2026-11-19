const OPEN_PAIRS={'‘':'’','“':'”','「':'」','『':'』','(':')','[':']','{':'}'};
const identity=text=>text.trim().replace(/\s+/gu,' ');

// A quoted example, decimal or attached condition remains one authored unit.
// Only a complete unit also displayed in this topic's summary can be removed.
function sentenceRanges(text) {
  const ranges=[],stack=[];let start=0;
  for(let index=0;index<text.length;index++) {
    const character=text[index];
    if(character==="'"&&/[\p{L}\p{N}]/u.test(text[index-1]||'')
      &&/[\p{L}\p{N}]/u.test(text[index+1]||''))continue;
    if(stack.at(-1)===character){stack.pop();continue;}
    if(Object.hasOwn(OPEN_PAIRS,character)){stack.push(OPEN_PAIRS[character]);continue;}
    if(character==='"'||character==="'"){stack.push(character);continue;}
    if(stack.length||!/[.!?。！？]/u.test(character))continue;
    if(character==='.'&&/\d/u.test(text[index-1]||'')&&/\d/u.test(text[index+1]||''))continue;
    if(index+1<text.length&&!/\s/u.test(text[index+1]))continue;
    ranges.push({start,end:index+1});start=index+1;
  }
  if(start<text.length)ranges.push({start,end:text.length});
  return ranges;
}

function scopeFor(scene) {
  return JSON.stringify([scene.source,scene.topic,scene.domain,scene.period||null,
    scene.context,scene.semantic]);
}

function joinParts(parts) {
  const joined=[];
  for(const part of parts) {
    const previous=joined.at(-1);
    if(previous&&previous.key===part.key&&previous.end===part.start
      &&previous.kind===part.kind&&previous.summaryIndex===part.summaryIndex) {
      previous.text+=part.text;previous.end=part.end;
    } else joined.push({...part});
  }
  return joined;
}

/** Shorten repeated presentation within one person, period and source topic. */
export function compactTopicScenes(scenes,aliases) {
  const groups=new Map(),copies=new Map(),redirects=new Map();
  for(const scene of scenes) {
    const key=scopeFor(scene);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(scene);
    copies.set(scene,{...scene,paragraphs:scene.paragraphs.map(part=>({...part})),aliases:[...scene.aliases]});
  }

  for(const siblings of groups.values()) {
    const summaries=new Map(),paragraphs=new Map();
    for(const scene of siblings) {
      if(scene.summaryTitle)summaries.set(0,(summaries.get(0)||'')+scene.title);
      for(const part of scene.paragraphs) {
        if(part.summaryIndex!==null)summaries.set(part.summaryIndex,(summaries.get(part.summaryIndex)||'')+part.text);
        else if(scene.kind==='prose'&&part.kind==='prose') {
          if(!paragraphs.has(part.key))paragraphs.set(part.key,{text:'',parts:[]});
          const paragraph=paragraphs.get(part.key);
          paragraph.text+=part.text;paragraph.parts.push({scene,part});
        }
      }
    }
    const summaryUnits=new Set([...summaries.values()].flatMap(text=>sentenceRanges(text)
      .map(range=>identity(text.slice(range.start,range.end)))).filter(Boolean));
    if(!summaryUnits.size)continue;
    const summaryScene=siblings.find(scene=>scene.summaryTitle);
    for(const paragraph of paragraphs.values()) {
      const ranges=sentenceRanges(paragraph.text);
      const kept=ranges.filter(range=>!summaryUnits.has(identity(paragraph.text.slice(range.start,range.end))));
      if(kept.length===ranges.length)continue;
      let offset=0;
      for(const {scene,part} of paragraph.parts) {
        const copy=copies.get(scene),index=scene.paragraphs.indexOf(part);
        let text=kept.filter(range=>range.end>part.start&&range.start<part.end)
          .map(range=>paragraph.text.slice(Math.max(range.start,part.start),Math.min(range.end,part.end))).join('');
        if(!text.trim())text='';
        copy.paragraphs[index]={...part,text,start:offset,end:offset+text.length};
        offset+=text.length;
      }
    }
    for(const scene of siblings) {
      const copy=copies.get(scene);
      copy.paragraphs=copy.paragraphs.filter(part=>part.text.trim());
      if(scene.kind==='prose'&&scene.paragraphs.length&&!copy.paragraphs.length
        &&!scene.score&&!scene.graph&&summaryScene)redirects.set(copy,copies.get(summaryScene));
    }
  }

  const compact=[];
  for(const original of scenes) {
    const scene=copies.get(original);
    if(redirects.has(scene))continue;
    const previous=compact.at(-1);
    if(previous&&scene.kind==='prose'&&previous.kind==='prose'
      &&scopeFor(scene)===scopeFor(previous)&&scene.title===previous.title
      &&!scene.score&&!previous.score&&!scene.graph&&!previous.graph) {
      const paragraphs=joinParts([...previous.paragraphs,...scene.paragraphs]);
      if(paragraphs.length<=2&&paragraphs.reduce((size,part)=>size+part.text.length,0)<=260) {
        previous.paragraphs=paragraphs;redirects.set(scene,previous);continue;
      }
    }
    compact.push(scene);
  }
  const target=scene=>{
    let current=copies.get(scene)||scene;
    while(redirects.has(current))current=redirects.get(current);
    return current;
  };
  for(const [id,scene] of aliases)aliases.set(id,target(scene));
  for(const scene of scenes) {
    const destination=target(scene);
    aliases.set(scene.id,destination);
    if(destination.id!==scene.id)destination.aliases.push(scene.id,...scene.aliases);
  }
  return compact;
}
