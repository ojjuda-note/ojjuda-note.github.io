import test from 'node:test';
import assert from 'node:assert/strict';
import {compactTopicScenes} from '../games/starlit-saju/topic-reading.mjs';
import {createStoryReader} from '../games/starlit-saju/story-reader.mjs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url),{JSDOM}=require('jsdom');
function paragraph(text,key='paragraph',extra={}) {
  return {text,key,start:0,end:text.length,kind:'prose',summaryIndex:null,...extra};
}
function scene(id,paragraphs=[],extra={}) {
  return {id,source:'money-source',topic:'money',domain:'monthly',period:{id:'month-1',label:'1월'},
    context:['2026년 1월'],semantic:{month:'1'},title:'돈을 쓸 때',label:'재물',group:'1월',
    kind:'prose',paragraphs,aliases:[],summaryTitle:false,...extra};
}
function summary(id='summary',extra={}) {
  return scene(id,[paragraph('이번에 쓸 금액을 먼저 정해 보세요.','summary-action',{kind:'summary',summaryIndex:1})],
    {kind:'summary',summaryTitle:true,title:'지출을 미리 살펴보는 편이에요.',...extra});
}
function compact(scenes) {
  const aliases=new Map(scenes.flatMap(item=>[[item.id,item],[`${item.id}-anchor`,item]]));
  return {scenes:compactTopicScenes(scenes,aliases),aliases};
}
const prose=scenes=>scenes.filter(item=>item.kind==='prose').flatMap(item=>item.paragraphs.map(part=>part.text));

test('only the complete repeated summary sentence is removed; its distinct caution stays',()=>{
  const score={tailwind:80,headwind:20};
  const source=[summary('summary',{score}),scene('advice',[paragraph('이번에 쓸 금액을 먼저 정해 보세요. 다만 이미 약속한 비용은 따로 남겨 두세요.')])];
  const before=JSON.stringify(source),result=compact(source);
  assert.deepEqual(prose(result.scenes),[' 다만 이미 약속한 비용은 따로 남겨 두세요.']);
  assert.equal(result.scenes[0].score,score);
  assert.equal(result.scenes[0].title,'지출을 미리 살펴보는 편이에요.');
  assert.equal(result.scenes[0].paragraphs[0].text,'이번에 쓸 금액을 먼저 정해 보세요.');
  assert.equal(JSON.stringify(source),before,'presentation never rewrites the underlying authored text or values');
});

test('a duplicate-only page redirects its original scene and paragraph anchors to the visible summary',()=>{
  const source=[summary(),scene('repeated',[paragraph('이번에 쓸 금액을 먼저 정해 보세요.')]),
    scene('different',[paragraph('필요한 물건과 갖고 싶은 물건을 나눠 보세요.','different')])];
  const result=compact(source);
  assert.deepEqual(result.scenes.map(item=>item.id),['summary','different']);
  assert.equal(result.aliases.get('repeated'),result.scenes[0]);
  assert.equal(result.aliases.get('repeated-anchor'),result.scenes[0]);
  assert.equal(result.aliases.get('different'),result.scenes[1]);
});

test('quoted examples and attached conditions are kept even when they contain the summary words',()=>{
  const texts=[
    '“이번에 쓸 금액을 먼저 정해 보세요.”라는 말은 함께 쓸 돈을 정할 때의 예시예요.',
    '이번에 쓸 금액을 먼저 정해 보세요, 다만 공동 비용을 먼저 확인한 경우에만요.',
    '‘이번에 쓸 금액을 먼저 정해 보세요. 남은 금액을 같이 확인해요.’라고 말하는 상황을 가정해 볼게요.',
    '(이번에 쓸 금액을 먼저 정해 보세요. 함께 확인한 뒤에요.)라고 권할 수 있어요.',
    '이번에 쓸 금액을 먼저 정해 보세요? 상대에게 물어보는 예시예요.',
  ];
  const result=compact([summary(),...texts.map((text,index)=>scene(`example-${index}`,[paragraph(text,`example-${index}`)],{title:`예시 ${index}`}))]);
  assert.deepEqual(prose(result.scenes),texts,'substring matches never remove the rest of a condition or quotation');
});

test('decimal numbers and contractions never create a false sentence boundary',()=>{
  const text='3.5만 원을 확인해 보세요. 남은 비용도 살펴보세요.';
  const contraction="It's fine. It's fine, only when both agree.";
  const result=compact([summary('summary',{title:'3.5만 원을 확인해 보세요.'}),
    scene('decimal',[paragraph(text)]),
    summary('english-summary',{source:'english',topic:'english',title:"It's fine."}),
    scene('english',[paragraph(contraction)],{source:'english',topic:'english'})]);
  assert.deepEqual(prose(result.scenes),[' 남은 비용도 살펴보세요.'," It's fine, only when both agree."]);
});

test('identical wording stays in other topics, months, people and source interpretations',()=>{
  const sentence='이번에 쓸 금액을 먼저 정해 보세요.';
  const alternatives=[{topic:'work'},{period:{id:'month-2',label:'2월'}},{semantic:{personKey:'partner',personMarker:'B'}},
    {source:'different-calculation'},{context:['출생시간 미상']},{domain:'annual'}];
  const result=compact([summary(),...alternatives.map((extra,index)=>scene(`separate-${index}`,[paragraph(sentence,`separate-${index}`)],extra))]);
  assert.deepEqual(prose(result.scenes),alternatives.map(()=>sentence));
  assert.equal(result.scenes.length,alternatives.length+1);
});

test('scope notices, graph scenes and different meaningful body sentences are not shortened',()=>{
  const text='이번에 쓸 금액을 먼저 정해 보세요.',graph={total:79,items:[62,71,83,76]};
  const result=compact([summary(),scene('scope',[paragraph(text,'scope',{kind:'scope'})],{kind:'scope'}),
    scene('graph',[paragraph(text,'graph')],{kind:'score',graph}),
    scene('first',[paragraph('사람들과 비용을 함께 확인할 수 있어요.','first')],{title:'함께 준비할 때'}),
    scene('second',[paragraph('사람들과 비용을 함께 확인할 수 있어요.','second')],{title:'다른 상황의 예시'})]);
  assert.equal(result.scenes.find(item=>item.id==='scope').paragraphs[0].text,text);
  assert.equal(result.scenes.find(item=>item.id==='graph').graph,graph);
  assert.equal(result.scenes.find(item=>item.id==='graph').paragraphs[0].text,text);
  assert.deepEqual(prose(result.scenes),['사람들과 비용을 함께 확인할 수 있어요.','사람들과 비용을 함께 확인할 수 있어요.']);
});

test('short adjacent scenes share one heading and keep the original alias and text order',()=>{
  const first='필요한 물건부터 골라 보세요.',second='남은 비용도 확인해 보세요.';
  const result=compact([summary(),scene('first',[paragraph(first,'first')]),scene('second',[paragraph(second,'second')]),
    scene('different-heading',[paragraph('약속한 날짜를 확인해 보세요.','third')],{title:'약속을 정할 때'})]);
  assert.deepEqual(result.scenes.map(item=>item.id),['summary','first','different-heading']);
  assert.deepEqual(result.scenes[1].paragraphs.map(item=>item.text),[first,second]);
  assert.equal(result.aliases.get('second-anchor'),result.scenes[1]);
});

test('merged scenes retain two-paragraph and 260-character bounds',()=>{
  const text='고유한 설명을 남겨 두세요. '.repeat(10);
  const result=compact([summary(),scene('first',[paragraph(text,'first')]),scene('second',[paragraph(text,'second')]),
    scene('third',[paragraph('첫 번째 설명이에요.','third'),paragraph('두 번째 설명이에요.','fourth')]),
    scene('fourth',[paragraph('세 번째 설명이에요.','fifth')])]);
  assert.ok(result.scenes.some(item=>item.id==='second'),'long paragraphs never become one crowded scene');
  assert.ok(result.scenes.some(item=>item.id==='fourth'),'three distinct paragraphs never become one scene');
  assert.ok(result.scenes.every(item=>item.paragraphs.length<=2));
});

test('a repeated sentence spanning old page fragments is removed once and all unique remainder is kept',()=>{
  const text='이번에 쓸 금액을 먼저 정해 보세요. 함께 약속한 비용은 따로 남겨 두세요.';
  for(const cut of [11,'이번에 쓸 금액을 먼저 정해 보세요. '.length]) {
    const result=compact([summary(),scene('first',[paragraph(text.slice(0,cut),'split')]),
      scene('second',[paragraph(text.slice(cut),'split',{start:cut,end:text.length})])]);
    assert.deepEqual(prose(result.scenes).map(text=>text.trim()),['함께 약속한 비용은 따로 남겨 두세요.']);
    const remaining=result.scenes.find(item=>item.kind==='prose').paragraphs[0];
    assert.equal(remaining.start,0);assert.equal(remaining.end,remaining.text.length);
    assert.equal(result.aliases.get('first'),result.scenes[0]);
  }
});

test('the rendered reader updates progress and restores removed source anchors after compaction',()=>{
  const dom=new JSDOM('<!doctype html><div id="report"></div>',{url:'https://example.test/'});
  const doc=dom.window.document;
  try {
    doc.documentElement.dataset.reducedMotion='true';
    dom.window.HTMLElement.prototype.scrollIntoView=function(){};
    const host=doc.getElementById('report'),source=doc.createElement('section');
    source.id='reading-topic';
    source.innerHTML='<div class="saju-two-line-summary"><p class="saju-summary-line">지출을 미리 살펴보는 편이에요.</p><p class="saju-summary-line">이번에 쓸 금액을 먼저 정해 보세요.</p></div><h4>돈을 쓸 때</h4><p id="duplicate">이번에 쓸 금액을 먼저 정해 보세요.</p><h4>약속을 정할 때</h4><p>함께 쓸 돈은 서로 확인해 보세요.</p>';
    host.append(source);
    const reader=createStoryReader(host,{pages:[{element:source,id:source.id,label:'재물',group:'1월',domain:'monthly'}]});
    assert.equal(host.querySelectorAll('select.reading-page-select option').length,2);
    assert.equal(host.querySelector('.reading-page-position').textContent,'1 / 2');
    host.querySelector('.story-next').click();
    assert.equal(host.querySelector('.reading-page-position').textContent,'2 / 2');
    assert.equal(host.querySelector('.story-next').disabled,true);
    assert.equal(reader.restore('duplicate'),true);
    assert.equal(host.querySelector('.story-title').textContent,'지출을 미리 살펴보는 편이에요.');
    assert.equal(host.querySelector('.reading-page-position').textContent,'1 / 2');
    assert.equal(reader.restore('reading-topic--story-2'),true,'old generated page links still resolve');
    assert.equal(host.querySelectorAll('.story-stage > article').length,1);
    reader.dispose();
  } finally {dom.window.close();}
});
