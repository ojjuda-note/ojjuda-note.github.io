import {createReadingNavigator} from './reading-navigator.mjs?v=20261120-saju-themes1';
import {createReadingProgress} from './reader-presentation.mjs?v=20261120-saju-clean1';
import {attachReadingSwipe} from './reading-swipe.mjs?v=20261120-saju-story2';
import {createReadingMotion} from './reading-motion.mjs?v=20261114-saju-slide1';
import {compactTopicScenes} from './topic-reading.mjs?v=20261120-saju-topic1';
import {arrangeRelatedReadings} from './related-reader.mjs?v=20261120-saju-themes1';

const SUMMARY='.saju-two-line-summary,.compatibility-two-line-summary';
const SEMANTIC=['readerCard','portraitCard','daeunTopic','readingSupplement','personKey','personMarker','compatibilityTopic','month','timingKind','timingTopic','readingOverview','adviceId'];
const SKIP='nav,button,select,option,.report-section-heading,.portrait-summary-table,.timing-table-details,.reader-inline-links,.reader-detail-link,.compatibility-person-jumps,.compatibility-reading-guide,.month-navigation-label,.month-heading,.daeun-period-summary,.reader-timing-heading';
const LABEL='.reader-card-label,.portrait-card-label,.reader-label,.month-spotlight-label,.compatibility-person-name,.compatibility-people-title,.reader-timing-kind';
const DATES='.month-period,.daeun-dates,.reader-timing-period,.daeun-time-notice';
const keyboardBindings=new WeakMap();
const node=(doc,tag,className,text)=>{
  const element=doc.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
};

/** Sentence-boundary pieces concatenate to the original text, including spaces. */
export function splitStoryText(text,limit=240) {
  if(typeof text!=='string'||!text)return [];
  const sentences=[];let start=0;
  for(const match of text.matchAll(/[.!?。！？…]+[”’"'」』)\]]*\s+/gu)) {
    const end=match.index+match[0].length;
    sentences.push({text:text.slice(start,end),start,end});start=end;
  }
  if(start<text.length)sentences.push({text:text.slice(start),start,end:text.length});
  const chunks=[];
  for(const sentence of sentences) {
    const previous=chunks.at(-1);
    if(previous&&previous.text.length+sentence.text.length<=limit) {
      previous.text+=sentence.text;previous.end=sentence.end;
    } else chunks.push({...sentence});
  }
  return chunks;
}

function semanticData(element) {
  const values={};
  for(let current=element;current;current=current.parentElement) {
    for(const key of SEMANTIC)if(values[key]===undefined&&current.dataset[key]!==undefined)values[key]=current.dataset[key];
  }
  return values;
}

function contextsFor(element) {
  const values=[];
  for(const owner of [element.closest('.month-reading'),element.closest('.daeun-period'),element.closest('.reader-timing-card')]) {
    const date=owner?.querySelector('.month-period,.daeun-dates,.reader-timing-period');
    if(date?.textContent.trim())values.push(date.textContent.trim());
  }
  const notice=element.closest('.reader-daeun')?.querySelector(':scope > .daeun-time-notice');
  if(notice?.textContent.trim())values.push(notice.textContent.trim());
  return [...new Set(values)];
}

/** Flatten authored reading units; no calculations, copy data or purchases change. */
export function collectStoryScenes(pages,{defaults=new Map(),mode='general'}={}) {
  const registered=new Set(pages.map(page=>page.element));
  const scenes=[],aliases=new Map(),menuTargets=new Set(),topics=[];
  let paragraphSerial=0;
  const bind=(id,scene)=>{if(id&&scene&&!aliases.has(id))aliases.set(id,scene);};
  const sourceText=(element)=>{
    const clone=element.cloneNode(true);
    for(const hidden of clone.querySelectorAll('[aria-hidden="true"]'))hidden.remove();
    return clone.textContent.trim();
  };
  for(const page of pages) {
    if(page.kind==='contents') {if(page.element.id)menuTargets.add(page.element.id);continue;}
    const firstIndex=scenes.length;
    let ordinal=0;
    const base={page,source:page.id||page.element.id,topic:page.id||page.element.id,
      label:page.label,group:page.menuGroup||page.group,domain:page.domain||'lifelong',
      period:page.period,
      context:contextsFor(page.element),semantic:semanticData(page.element),title:'',pending:[],pendingIds:[],deferredIds:[],lastSummary:null};
    function emit(state,{title=state.title||state.label,paragraphs=[],kind='prose',graph=null,summaryTitle=false}={}) {
      const id=ordinal++===0?base.source:`${base.source}--story-${ordinal}`;
      const scene={id,source:base.source,topic:state.topic,label:state.label,group:state.group,
        domain:state.domain,period:state.period,title,paragraphs,kind,graph,summaryTitle,
        context:[...state.context],semantic:{...state.semantic},aliases:[]};
      scenes.push(scene);bind(id,scene);
      for(const alias of state.pendingIds.splice(0)){bind(alias,scene);scene.aliases.push(alias);}
      return scene;
    }
    function flush(state) {
      if(!state.pending.length)return null;
      const pending=state.pending.splice(0);
      return emit(state,{paragraphs:pending,kind:pending[0]?.kind||'prose'});
    }
    function paragraph(element,state,{summaryIndex=null,kind='prose'}={}) {
      const text=typeof element==='string'?element:element.textContent;
      if(!text?.trim())return;
      const key=`${base.source}:p${++paragraphSerial}`;
      for(const part of splitStoryText(text)) {
        if(state.pending.length>=2||state.pending.reduce((sum,item)=>sum+item.text.length,0)+part.text.length>260)flush(state);
        if(typeof element!=='string'&&part.start===0&&element.id)state.pendingIds.push(element.id);
        state.pending.push({...part,key,summaryIndex,kind});
      }
    }
    function summary(element,state) {
      flush(state);
      const lines=[...element.children].filter(child=>child.matches('.saju-summary-line,.compatibility-summary-line'));
      if(!lines.length)return;
      const originalTitle=state.title,title=lines[0].textContent;
      const first=emit(state,{title,kind:'summary',summaryTitle:true});
      bind(element.id,first);bind(lines[0].id,first);
      const body=lines.slice(1);
      for(const line of body) {
        const index=lines.indexOf(line),key=`${base.source}:p${++paragraphSerial}`;
        for(const part of splitStoryText(line.textContent)) {
          let current=scenes.at(-1);
          if(current!==first&&current.topic!==state.topic)current=first;
          if(current.paragraphs.length>=2||current.paragraphs.reduce((sum,item)=>sum+item.text.length,0)+part.text.length>260) {
            current=emit(state,{title,kind:'summary'});
          }
          current.paragraphs.push({...part,key,summaryIndex:index,kind:'summary'});
          if(part.start===0)bind(line.id,current);
        }
      }
      state.lastSummary=first;state.title='';
      // The opening uses its selected core sentence once. Any extra authored
      // headline sentences remain readable afterwards instead of repeating it.
      if(originalTitle&&originalTitle!==title) {
        const remainder=originalTitle.startsWith(title)?originalTitle.slice(title.length):originalTitle;
        if(remainder.trim()&&!lines.some(line=>line.textContent.trim()===remainder.trim())) {
          paragraph(remainder,state,{kind:'headline'});flush(state);
        }
      }
      for(const child of element.children)if(!lines.includes(child)) {
        if(child.matches('.saju-reading-score'))walk(child,state);
        else if(child.matches('.saju-summary-remainder')){paragraph(child,state);flush(state);}
      }
    }
    function walk(element,state) {
      if(element.nodeType!==1)return;
      if(element!==page.element&&registered.has(element))return;
      const start=scenes.length;
      if(element.matches(SKIP)) {
        if(element.matches('nav')&&element.id)menuTargets.add(element.id);
        else for(const target of [element,...element.querySelectorAll('[id]')])if(target.id)state.deferredIds.push(target.id);
        return;
      }
      if(element.matches(DATES))return;
      if(element.matches('.saju-reading-score')) {
        flush(state);
        const scene=state.lastSummary||scenes.slice(firstIndex).find(item=>item.topic===state.topic)
          ||emit(state,{title:state.label,kind:'summary'});
        scene.score=element.cloneNode(true);
        for(const target of [element,...element.querySelectorAll('[id]')])bind(target.id,scene);
        return;
      }
      if(element.matches('.compatibility-scoreboard')) {
        flush(state);
        const scene=emit(state,{title:'두 사람의 궁합 점수',kind:'score',graph:element.cloneNode(true)});
        const guide=element.querySelector('.compatibility-score-summary');
        if(guide?.textContent.trim()) {
          const key=`${base.source}:p${++paragraphSerial}`;
          scene.paragraphs=splitStoryText(guide.textContent).map(part=>({...part,key,summaryIndex:null,kind:'prose'}));
        }
        for(const target of [element,...element.querySelectorAll('[id]')])bind(target.id,scene);
        return;
      }
      if(element.matches('.compatibility-person-reading,.reader-symbol-item,.month-spotlight-card,.reader-timing-point,.advice-card')) {
        flush(state);
        const name=element.querySelector(':scope > .compatibility-person-name');
        const label=element.querySelector(':scope > .reader-card-label,:scope > .month-spotlight-label,:scope > dt:not(.saju-summary-line),:scope > .advice-title');
        const local={...state,topic:element.id||`${base.source}-part-${scenes.length-firstIndex+1}`,
          label:name?`${name.textContent} · ${page.label}`:label?sourceText(label):state.label,
          title:'',semantic:{...state.semantic,...semanticData(element)},pending:[],pendingIds:element.id?[element.id]:[],deferredIds:[],lastSummary:null};
        if(element.matches(SUMMARY))summary(element,local);
        else for(const child of element.children)walk(child,local);
        flush(local);
        if(scenes[start]){bind(element.id,scenes[start]);for(const id of local.deferredIds)bind(id,scenes[start]);}
        return;
      }
      if(element.matches(SUMMARY)) {summary(element,state);return;}
      if(element.matches('.reader-scope-note')&&(element.tagName==='P'||!element.childElementCount)) {
        if(!element.textContent.trim())return;
        flush(state);
        const local={...state,title:'풀이 참고',pending:[],pendingIds:[...state.pendingIds,...(element.id?[element.id]:[])],lastSummary:null};
        state.pendingIds.length=0;paragraph(element,local,{kind:'scope'});flush(local);return;
      }
      if(element.matches('.compatibility-synthesis-people')) {state.label=`${element.textContent} · ${page.label}`;return;}
      if(element.matches(LABEL)){if(element.id)state.deferredIds.push(element.id);return;}
      if(element.matches('.reading-body-heading,h1,h2,h3,h4,h5,h6')) {
        flush(state);if(element.id)state.pendingIds.push(element.id);state.title=sourceText(element);return;
      }
      if(element.matches('p,dd,li')) {paragraph(element,state,{kind:page.kind==='information'?'scope':'prose'});return;}
      if(element.matches('dt')) {flush(state);if(element.id)state.pendingIds.push(element.id);state.title=element.textContent.trim();return;}
      for(const child of element.children)walk(child,state);
      flush(state);
      if(scenes[start])bind(element.id,scenes[start]);
    }
    walk(page.element,base);flush(base);
    const first=scenes[firstIndex];
    if(first) {
      bind(base.source,first);
      for(let parent=page.element.parentElement;parent;parent=parent.parentElement)bind(parent.id,first);
      for(const id of base.deferredIds)bind(id,first);
      for(const id of base.pendingIds)bind(id,scenes.at(-1));
    }
  }
  scenes.splice(0,scenes.length,...compactTopicScenes(scenes,aliases));
  scenes.splice(0,scenes.length,...arrangeRelatedReadings(scenes,{mode}));
  for(const [element,page] of defaults)if(element?.id) {
    const first=aliases.get(page?.id||page?.element?.id);if(first)aliases.set(element.id,first);
  }
  const byTopic=new Map();
  for(const scene of scenes) {
    if(!byTopic.has(scene.topic)) {
      byTopic.set(scene.topic,[]);
      topics.push({id:scene.id,element:{id:scene.id},label:scene.label,group:scene.group,menuGroup:scene.group,domain:scene.domain,period:scene.period,theme:scene.theme});
    }
    byTopic.get(scene.topic).push(scene);
  }
  for(const siblings of byTopic.values())for(const [index,scene] of siblings.entries()) {
    scene.position=index+1;scene.total=siblings.length;
  }
  return {scenes,aliases,menuTargets,topics};
}

/** Only the current flat scene is mounted; the source report never stays visible. */
export function createStoryReader(container,{pages,initialPage,defaults=new Map(),mode='general'}={}) {
  const doc=container.ownerDocument,model=collectStoryScenes(pages,{defaults,mode});
  if(!model.scenes.length)throw new Error('읽을 이야기를 준비하지 못했어요. 다시 불러와 주세요.');
  const prefix=mode==='compatibility'?'compatibility':'reading';
  const select=node(doc,'select','reading-page-select');select.id=mode==='compatibility'?'compatibility-page-select':'reading-page-select';select.hidden=true;
  const scenesById=new Map(model.scenes.map(scene=>[scene.id,scene]));
  const topicFirst=new Map();
  for(const scene of model.scenes) {
    if(!topicFirst.has(scene.topic))topicFirst.set(scene.topic,scene.id);
    const option=node(doc,'option','',`${scene.label} · ${scene.position}/${scene.total}`);option.value=scene.id;select.append(option);
  }
  const domains=mode==='compatibility'?[{id:'synthesis',label:'종합'},{id:'people',label:'두 사람'},{id:'scores',label:'점수'},{id:'details',label:'항목별 궁합'},{id:'information',label:'풀이 안내'}]
    :[{id:'lifelong',label:'평생운'},{id:'daeun',label:'대운'},{id:'annual',label:'올해운'},{id:'monthly',label:'월별운'},{id:'information',label:'풀이 안내'}];
  const picker=createReadingNavigator({select,pages:model.topics,domains,domainForPage:page=>page.domain,groupForPage:page=>page.menuGroup,
    periodForPage:page=>page.period,themeForPage:page=>page.theme,
    topicForScene:id=>topicFirst.get(scenesById.get(id)?.topic)});
  const toolbar=node(doc,'div','story-toolbar');
  const position=node(doc,'p','reading-page-position story-position');position.id=`${prefix}-page-position`;position.setAttribute('role','status');position.setAttribute('aria-live','polite');
  toolbar.append(picker.element,position);
  const progress=createReadingProgress(doc);progress.element.setAttribute('aria-describedby',position.id);
  const stage=node(doc,'div','story-stage');stage.id=`${prefix}-story-stage`;
  const controls=node(doc,'nav','story-steps');controls.setAttribute('aria-label','이야기 넘기기');
  const previous=node(doc,'button','reading-pager-step story-previous','‹');previous.type='button';previous.setAttribute('aria-label','이전 이야기');
  const next=node(doc,'button','reading-pager-step story-next','›');next.type='button';next.setAttribute('aria-label','다음 이야기');
  if(mode==='compatibility'){previous.dataset.compatibilityStep='previous';next.dataset.compatibilityStep='next';}
  controls.append(previous,next);
  container.replaceChildren(select,toolbar,progress.element,stage,controls);
  container.classList.add('story-reader');container.dataset.readerPaged='true';container.dataset.mapView='detail';
  container.removeAttribute('aria-labelledby');container.setAttribute('aria-label',mode==='compatibility'?'두 사람의 궁합 풀이':'사주 풀이');
  container.dataset.storyScenes=String(model.scenes.length);
  let current=null,currentElement=null,motion=null;
  function render(scene) {
    const article=node(doc,'article',`story-scene story-scene--${scene.kind}`);article.id=scene.id;article.tabIndex=-1;
    article.dataset.storyScene=scene.id;article.dataset.storySource=scene.source;article.dataset.storyTopic=scene.topic;article.dataset.storyKind=scene.kind;
    article.dataset.readingTheme=scene.theme.id;
    if(scene.period)article.dataset.storyPeriod=scene.period.id;
    article.dataset.readerPage=scene.id;
    if(mode==='compatibility'){article.dataset.compatibilityCurrent='true';article.dataset.compatibilityPage=scene.source;}
    else article.dataset.readerCurrent='true';
    Object.assign(article.dataset,scene.semantic);
    const label=node(doc,'p','story-label',scene.label===scene.title?scene.group:scene.label);
    const title=node(doc,'h3','story-title',scene.title);title.id=`scene-${scene.id}-title`;title.tabIndex=-1;
    if(scene.summaryTitle)title.dataset.storySummaryIndex='0';
    article.setAttribute('aria-labelledby',title.id);article.append(label,title);
    if(scene.score) {
      const score=scene.score.cloneNode(true);
      if(score.tagName==='DD') {
        const replacement=node(doc,'section',score.className);
        for(const attribute of [...score.attributes])replacement.setAttribute(attribute.name,attribute.value);
        replacement.append(...score.childNodes);article.append(replacement);
      } else article.append(score);
    }
    const body=node(doc,'div','story-body');
    for(const item of scene.paragraphs) {
      const paragraph=node(doc,'p','',item.text);
      paragraph.dataset.storyParagraph=item.key;paragraph.dataset.storyStart=String(item.start);paragraph.dataset.storyEnd=String(item.end);
      if(item.summaryIndex!==null)paragraph.dataset.storySummaryIndex=String(item.summaryIndex);
      body.append(paragraph);
    }
    if(body.childElementCount)article.append(body);
    if(scene.graph) {
      const graph=scene.graph.cloneNode(true);if(graph.id===article.id)graph.removeAttribute('id');article.append(graph);
    }
    if(scene.context.length)article.append(node(doc,'p','story-context',scene.context.join(' · ')));
    return article;
  }
  function show(scene,{move=false}={}) {
    if(!scene)return false;
    const changed=current!==scene;
    const transition=move&&changed&&current?motion?.prepare(Math.sign(model.scenes.indexOf(scene)-model.scenes.indexOf(current))):null;
    if(!transition)motion?.cancel();
    current=scene;
    if(changed||!currentElement){currentElement=render(scene);stage.replaceChildren(currentElement);}
    select.value=scene.id;picker.sync();
    const index=model.scenes.indexOf(scene);previous.disabled=index===0;next.disabled=index===model.scenes.length-1;
    position.textContent=`${scene.position} / ${scene.total}`;
    progress.update(scene.position,scene.total,`${scene.label} · ${scene.position} / ${scene.total}`);
    if(move) {
      stage.scrollTop=0;
      if(container.getBoundingClientRect().top<0)container.scrollIntoView({block:'start',behavior:'instant'});
    }
    motion?.finish(transition,currentElement);return currentElement;
  }
  function revealId(id,{move=false}={}) {
    if(model.menuTargets.has(id)){picker.focus({open:true});return picker.dialog.querySelector('.story-menu-title');}
    const scene=model.aliases.get(id)||scenesById.get(id);if(!scene)return false;
    const element=show(scene,{move});
    // An old chart label may remain only for an accessible meter description.
    // All aliases focus the visible scene heading, never a hidden source label.
    return element.querySelector('.story-title');
  }
  previous.addEventListener('click',()=>show(model.scenes[model.scenes.indexOf(current)-1],{move:true}));
  next.addEventListener('click',()=>show(model.scenes[model.scenes.indexOf(current)+1],{move:true}));
  select.addEventListener('change',()=>show(scenesById.get(select.value),{move:true}));
  const priorKeyboard=keyboardBindings.get(container);if(priorKeyboard)container.removeEventListener('keydown',priorKeyboard);
  const keyboard=event=>{
    if(!['ArrowLeft','ArrowRight'].includes(event.key)||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey
      ||event.target.closest('dialog,input,select,textarea,[contenteditable="true"]'))return;
    event.preventDefault();(event.key==='ArrowLeft'?previous:next).click();
  };
  container.addEventListener('keydown',keyboard);keyboardBindings.set(container,keyboard);
  show(model.aliases.get(initialPage?.id||initialPage?.element?.id)||model.scenes[0]);
  motion=createReadingMotion(container,{getCurrentPage:()=>currentElement});
  const disposeSwipe=attachReadingSwipe(container,{previous,next,motion});
  return {restore:id=>Boolean(revealId(id)),revealId,reveal:target=>Boolean(revealId(target?.id)),
    hasTarget:id=>model.aliases.has(id)||scenesById.has(id)||model.menuTargets.has(id),
    dispose(){
      container.removeEventListener('keydown',keyboard);
      if(keyboardBindings.get(container)===keyboard)keyboardBindings.delete(container);
      disposeSwipe();
    },
    get currentElement(){return currentElement;}};
}
