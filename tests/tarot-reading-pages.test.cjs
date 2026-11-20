const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');
const load = createTarotLoader();
const { DECK, getReading, getSummary } = load('readings.js');
const { buildPersonalReading } = load('personal-reading.js');
const { buildSummaryPages, buildCardPages, splitReaderParagraphs, selectSummaryGroups } = load('reading-pages.js');
const plain = value => JSON.parse(JSON.stringify(value));
const compact = value => String(value).replace(/\s/gu, '');
const original = part => Array.isArray(part.paragraphs) && part.paragraphs.length
  ? Array.from(part.paragraphs).join('') : String(part.body || part.text || '').split(/\n\s*\n/u).join('');
const bodyOf = pages => pages.flatMap(page => page.paragraphs || []).join('');
const linksOf = pages => pages.flatMap(page => page.links || []).map(link => link.url);
const cardsOf = ids => ids.map(id => DECK.find(card => card.id === id));

for (const paragraphs of [
  ['첫 문장이다. 다음 문장에는 1.5배라는 숫자와 “괜찮아?”라는 질문이 있다. 확인하지 않았다면 결정하지 않는다. '.repeat(4)],
  ['줄바꿈도\n그대로 남긴다. ', '다음 원문은 앞 문장과 다른 문단이다. '.repeat(12), ' 마지막 문장이다.'],
  ['공백없는긴단어'.repeat(80)],
  ['조건(“오늘 결정해.”라는 요구도 포함)을 다시 살펴본다. 부담이 크면 멈춰도 된다. '.repeat(8)]
]) {
  const source = paragraphs.join('');
  const split = splitReaderParagraphs(paragraphs, 80);
  assert.equal(split.flat().join(''), source, 'pagination preserves every character, space, quotation, decimal and condition');
  assert.ok(split.every(page => page.length > 0 && page.length <= 2));
  assert.deepEqual(plain(splitReaderParagraphs(paragraphs, 80)), plain(split), 'pagination is deterministic');
}
assert.deepEqual(plain(splitReaderParagraphs([])), []);

const whitespaceKey = value => String(value).trim().replace(/\s+/gu, ' ');
const paragraphsOf = part => Array.isArray(part.paragraphs) && part.paragraphs.length
  ? Array.from(part.paragraphs) : String(part.body || part.text || '').split(/\n\s*\n/u).filter(value => value.trim());
const REMOVED_TOPICS = new Map([
  ['problem-problem-now',['domains-core-problem']],
  ['problem-solution',['domains-problem-solving']],
  ['problem-possible-outcome',['domains-possible-results']],
  ['timeline-past-flow',['domains-past-influence']],
  ['timeline-past-achievements',['domains-past-achievements']],
  ['timeline-future-change',['domains-future-changes']],
  ['problem-situation-now',['timeline-present-luck','domains-present-flow']],
  ['timeline-strengths',['domains-my-tendencies','domains-my-strengths']],
  ['timeline-past-hardships',['domains-past-hardships']],
  ['timeline-future-hardships',['domains-cautions-and-risks','domains-prepare-for-difficulties']],
  ['domains-study-habits',['domains-concentration-obstacles']],
  ['domains-money-attitude',['domains-spending-habits']],
  ['domains-everyday-burdens',['domains-life-balance']],
  ['domains-stress-reactions',['domains-rest-and-recovery']],
  ['domains-good-fortune',['domains-unexpected-help']],
  ['domains-what-i-really-want',['domains-life-direction']],
  ['domains-family-conflict',['domains-family-role']]
]);
const uniqueInOrder = values => {
  const seen = new Set();
  return values.filter(value => {
    const key = whitespaceKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const entriesOf = groups => Array.from(groups).flatMap(group => Array.from(group.sections || [],(part,index) =>
  ({id:group.id + '-' + (part.id || index),part,group,index})));
function excludedIds(entries) {
  const present = new Set(entries.map(entry => entry.id));
  return new Set([...REMOVED_TOPICS].filter(([primary]) => present.has(primary))
    .flatMap(([,donors]) => donors.filter(id => present.has(id))));
}
const textValues = value => typeof value === 'string' ? [value]
  : value && typeof value === 'object' ? Object.values(value).flatMap(textValues) : [];
function uniquePages(pages) {
  assert.ok(pages.length);
  assert.equal(new Set(pages.map(page => page.id)).size,pages.length);
  for (const page of pages) {
    assert.ok(page.id && page.title && page.chapterId && page.chapterTitle && page.groupId && page.groupLabel);
    assert.ok(Array.isArray(page.paragraphs));
    assert.ok(page.id.startsWith(page.chapterId + '-'));
    assert.ok(Array.isArray(page.sourceIds) && page.sourceIds.length);
    assert.equal(new Set(page.sourceIds).size,page.sourceIds.length);
    assert.ok(page.sourceIds.includes(page.sourceId));
  }
}
function chapterPages(pages,id) {
  const items = pages.filter(page => page.chapterId === id);
  assert.ok(items.length,id + ': the retained source is readable');
  assert.deepEqual(items.map(page => page.id),items.map((_,index) => id + '-' + (index + 1)));
  return items;
}
const chapterText = (pages,id) => bodyOf(chapterPages(pages,id));
function assertRetainedChapter(pages,id,part) {
  const chapter = chapterPages(pages,id);
  assert.equal(bodyOf(chapter),original(part),'the representative keeps its own complete original body, without donor subpages');
  for (const page of chapter) {
    assert.deepEqual(Array.from(page.sourceIds),[id]);
    assert.equal(page.sourceId,id);
    assert.equal(page.title,part.title,'the original representative title is used');
    assert.equal(page.chapterTitle,part.title);
    assert.equal(page.sourceTitle,part.title);
    assert.equal(page.subtitle,part.subtitle || '');
  }
  const bodyKeys = paragraphsOf(part).map(whitespaceKey);
  const expected = uniqueInOrder(Array.from(part.summaryLines || []))
    .filter(line => !bodyKeys.some(paragraph => paragraph.includes(whitespaceKey(line))));
  assert.deepEqual(plain(chapter.flatMap(page => page.summaryLines || [])),expected);
  return chapter;
}
function assertSelection(summary) {
  const before = JSON.stringify(summary);
  const originalEntries = entriesOf(summary.groups);
  const excluded = excludedIds(originalEntries);
  const selected = selectSummaryGroups(summary);
  const selectedEntries = entriesOf(selected);
  const expected = originalEntries.filter(entry => !excluded.has(entry.id));
  assert.deepEqual(selectedEntries.map(entry => entry.id),expected.map(entry => entry.id),
    'the shared UI/copy selector removes only the configured donors, in original order');
  selectedEntries.forEach((entry,index) => assert.deepEqual(plain(entry.part),plain(expected[index].part),
    'selection does not rewrite retained text, headings or references'));
  assert.equal(JSON.stringify(summary),before,'the complete raw model stays intact internally');
  assert.deepEqual(plain(selectSummaryGroups(summary)),plain(selected),'selection is deterministic');
  return {selected,selectedEntries,originalEntries,excluded};
}
function assertReferenceMaterial(pages,part) {
  const text = compact(bodyOf(pages));
  for (const detail of part.detailSections || part.sections || []) assert.ok(text.includes(compact(original(detail))));
  if (part.nameGuide) assert.ok(text.includes(compact(part.nameGuide)));
  if (part.sourceNote) assert.ok(text.includes(compact(part.sourceNote.body)));
  for (const reference of [part.reference,part.sourceNote?.reference]) if (reference?.url) {
    assert.ok(linksOf(pages).includes(reference.url));
  }
}

// Unique markers catch removed material being hidden in a representative,
// appendix, source metadata, or the shared selection used by clipboard copy.
const representativeBody = '남겨 둔 대표 설명은 반복되어도 원문 그대로 읽는다.';
const deletionFixture = {
  groups:[
    {id:'problem',label:'나의 이야기',sections:[
      {id:'problem-now',title:'대표의 원래 문제 제목',paragraphs:[representativeBody,representativeBody],summaryLines:[representativeBody]},
      {id:'situation-now',title:'대표의 원래 상황 제목',subtitle:'대표의 원래 부제목',
        paragraphs:['현재 상황의 대표 본문만 남긴다.'],summaryLines:[]}
    ]},
    {id:'timeline',label:'시간의 흐름',sections:[
      {id:'present-luck',title:'삭제제목_시기_702',paragraphs:['삭제본문_시기_702'],summaryLines:['삭제요약_시기_702']}
    ]},
    {id:'domains',label:'분야별 풀이',categories:[{id:'self',label:'나',count:3}],sections:[
      {id:'core-problem',categoryId:'self',title:'삭제제목_핵심_701',paragraphs:['삭제본문_핵심_701'],summaryLines:['삭제요약_핵심_701']},
      {id:'present-flow',categoryId:'self',title:'삭제제목_흐름_703',paragraphs:[],summaryLines:['삭제요약_흐름_703']},
      {id:'not-listed',categoryId:'self',title:'별도로 남길 비슷한 제목',paragraphs:[representativeBody],summaryLines:[]}
    ]}
  ],detailSections:[]
};
const fixtureBefore = JSON.stringify(deletionFixture);
const chosenFixture = assertSelection(deletionFixture);
const fixturePages = buildSummaryPages(deletionFixture);
uniquePages(fixturePages);
for (const entry of chosenFixture.selectedEntries) assertRetainedChapter(fixturePages,entry.id,entry.part);
assert.equal(chapterText(fixturePages,'problem-problem-now'),representativeBody + representativeBody,
  'removing donor topics never trims the retained representative body');
for (const marker of ['삭제제목_시기_702','삭제본문_시기_702','삭제요약_시기_702',
  '삭제제목_핵심_701','삭제본문_핵심_701','삭제요약_핵심_701','삭제제목_흐름_703','삭제요약_흐름_703']) {
  assert.ok(!JSON.stringify(fixturePages).includes(marker),'removed content has no visible or hidden reader subpage');
  assert.ok(!JSON.stringify(chosenFixture.selected).includes(marker),'removed content is absent from the shared clipboard selection');
}
for (const id of chosenFixture.excluded) {
  assert.ok(fixturePages.every(page => page.sourceId !== id && !page.sourceIds.includes(id)));
}
assert.equal(JSON.stringify(deletionFixture),fixtureBefore);
const withoutPrimary = plain(deletionFixture);
withoutPrimary.groups[0].sections = [];
const fallback = assertSelection(withoutPrimary);
assert.equal(fallback.excluded.size,0,'a missing representative cannot cause its donors to disappear');
const fallbackPages = buildSummaryPages(withoutPrimary);
for (const entry of fallback.selectedEntries) assertRetainedChapter(fallbackPages,entry.id,entry.part);
assert.ok(chapterPages(fallbackPages,'domains-present-flow').some(page => page.summaryLines?.length),
  'a summary-only source remains readable when no representative exists');

let summaryCases = 0, uniqueRemovedChecks = 0;
for (const topic of ['overall','love','money','work']) {
  for (const ids of [['fool','justice','pentacles_king'],['star','cups_six','magician']]) {
    const cards = cardsOf(ids),summary = getSummary(cards,topic);
    const before = JSON.stringify(summary);
    const {selected,selectedEntries,originalEntries,excluded} = assertSelection(summary);
    assert.equal(excluded.size,20);
    assert.equal(originalEntries.length,65);
    assert.equal(selectedEntries.length,45);
    const selectedDomains = selected.find(group => group.id === 'domains');
    assert.equal(selectedDomains.categories.length,9,'empty removed categories do not remain in the UI or copy selection');
    for (const category of selectedDomains.categories) {
      assert.equal(category.count,selectedDomains.sections.filter(part => part.categoryId === category.id).length);
      assert.ok(category.count > 0);
    }
    assert.equal(selectedDomains.categories.reduce((total,category) => total + category.count,0),31);
    assert.equal(summary.groups.find(group => group.id === 'domains').sections.length,50,'all fifty domain originals stay in the raw data');
    const pages = buildSummaryPages(summary,{cards});
    uniquePages(pages);
    const solutionPages = chapterPages(pages, 'problem-solution');
    assert.equal(solutionPages[0].art.id, cards[2].id, 'the advice illustration uses the actual third drawn card');
    assert.equal(solutionPages[0].artCaption, `조언 카드 · ${cards[2].name}`);
    assert.ok(solutionPages.slice(1).every(page => !page.art && !page.artCaption),
      'the advice illustration appears once and never interrupts continued prose');
    if (topic === 'overall' && ids.join(',') === 'fool,justice,pentacles_king') {
      assert.equal(new Set(pages.map(page => page.chapterId)).size,72,'the fixed representative draw has 72 chapters including its retained references');
    }
    assert.equal(JSON.stringify(summary),before);
    assert.deepEqual(plain(buildSummaryPages(summary,{cards})),plain(pages));
    for (const entry of selectedEntries) {
      const chapter = assertRetainedChapter(pages,entry.id,entry.part);
      const groupId = entry.group.id === 'domains' ? 'domains:' + entry.part.categoryId : entry.group.id;
      assert.ok(chapter.every(page => page.groupId === groupId));
      if (entry.group.id === 'cards') {
        assert.equal(chapter[0].art.id,cards[entry.index].id);
        assertReferenceMaterial(pages,entry.part);
      }
    }
    const retainedIds = new Set(selectedEntries.map(entry => entry.id));
    assert.deepEqual([...new Set(pages.filter(page => retainedIds.has(page.chapterId)).map(page => page.chapterId))],
      selectedEntries.map(entry => entry.id),'retained chapters keep their original order');
    for (const page of pages) {
      assert.deepEqual(Array.from(page.sourceIds),[page.sourceId],'ordinary chapters never retain donor provenance as hidden source pages');
      assert.equal(excluded.has(page.sourceId),false);
      assert.equal(excluded.has(page.chapterId),false);
    }
    const retainedMaterial = compact(textValues({groups:selected,details:summary.detailSections,ritual:summary.ritual}).join('\n'));
    const visibleText = compact(pages.flatMap(page => [page.title,page.chapterTitle,page.sourceTitle,page.subtitle,
      ...(page.paragraphs || []),...(page.summaryLines || [])]).filter(Boolean).join('\n'));
    for (const entry of originalEntries.filter(entry => excluded.has(entry.id))) {
      for (const text of [entry.part.title,...paragraphsOf(entry.part),...(entry.part.summaryLines || [])]) {
        const key = compact(text);
        // Text shared with a retained source is allowed through that source;
        // donor-only text must not reappear elsewhere in the reader.
        if (key && !retainedMaterial.includes(key)) {
          assert.equal(visibleText.includes(key),false,entry.id + ': unique removed text/title is not exposed');
          uniqueRemovedChecks++;
        }
      }
    }
    for (const group of selected) {
      for (const detail of group.detailSections || []) assert.ok(compact(bodyOf(pages)).includes(compact(original(detail))));
      for (const paragraph of group.basisParagraphs || []) assert.ok(compact(bodyOf(pages)).includes(compact(paragraph)));
      if (group.description) assert.ok(compact(bodyOf(pages)).includes(compact(group.description)));
    }
    for (const [index,detail] of summary.detailSections.entries()) assert.equal(chapterText(pages,'problem-detail-' + index),original(detail));
    const domains = pages.filter(page => page.groupId.startsWith('domains:'));
    assert.equal(new Set(domains.map(page => page.chapterId)).size,31);
    assert.equal(new Set(domains.map(page => page.groupId)).size,9);
    assert.deepEqual([...new Set(domains.map(page => page.sourceId))].sort(),
      selectedEntries.filter(entry => entry.group.id === 'domains').map(entry => entry.id).sort());
    assert.ok(pages.some(page => page.chapterId === 'personal-choose'));
    summaryCases++;
  }
}
assert.ok(uniqueRemovedChecks > 20,'real readings exercise unique donor body/title removal as well as provenance checks');

function assertPersonalOptions(pages, report) {
  for (const option of report.comparison.options) {
    const id = 'personal-' + option.id;
    const chapter = chapterPages(pages,id);
    assert.ok(chapter.every(page => page.groupId === 'personal'));
    const ids = [id,id + '-gain',id + '-burden',id + '-prepare'];
    for (const page of chapter) assert.deepEqual(Array.from(page.sourceIds),ids);
    for (const [key,label] of [['gain','이 선택의 장점'],['burden','감수할 부담'],['prepare','먼저 준비할 것']]) {
      assert.equal(pages.some(page => page.chapterId === id + '-' + key),false, 'each option has one menu entry');
      const criteria = chapter.filter(page => page.sourceId === id + '-' + key);
      assert.ok(criteria.length, 'all three distinct criteria remain readable');
      assert.ok(criteria.every(page => page.subtitle === label));
      assert.equal(bodyOf(criteria),option[key], 'gain, burden and preparation preserve every original character');
    }
    const body = [option.gain,option.burden,option.prepare].map(whitespaceKey);
    const expected = uniqueInOrder(Array.from(option.summaryLines || []))
      .filter(line => !body.some(paragraph => paragraph.includes(whitespaceKey(line))));
    assert.deepEqual(plain(chapter.flatMap(page => page.summaryLines || [])),expected,
      'only option summaries already present in its criteria are omitted');
  }
}
const personalCards = cardsOf(['fool','justice','pentacles_king']);
for (const [topicId,contextId] of [['love','love-crush'],['money','money-agreement']]) {
  const report = buildPersonalReading({cards:personalCards,topicId,contextId});
  const before = JSON.stringify(report);
  const pages = buildSummaryPages(getSummary(personalCards,topicId),{cards:personalCards,personalReport:report});
  uniquePages(pages);
  assert.equal(JSON.stringify(report),before);
  assert.equal(pages.some(page => page.chapterId === 'personal-choose'),false);
  for (const part of [report.connection,...report.primary,...report.followUps]) {
    assertRetainedChapter(pages,'personal-' + part.id,part);
  }
  const text = compact(bodyOf(pages));
  for (const value of [report.example,report.basis,report.comparison.basis]) assert.ok(text.includes(compact(value)));
  assertPersonalOptions(pages,report);
}

// Identical wording has a different purpose under gain/burden/preparation.
// It remains once under EACH criterion; it is not treated like the six topic pairs.
const criterionText = '동의한 조건을 함께 확인한다.';
const optionFixture = {
  question:'두 선택을 비교한다.',label:'예시',example:'이것은 가상의 비교 예시다.',
  comparison:{title:'선택 비교',basis:'두 선택을 같은 조건에서 살펴본다.',basisSummaryLines:[],
    options:[
      {id:'choice-a',key:'a',label:'지금 살펴보기',summaryLines:[criterionText,'다른 고유한 비교 문장은 남긴다.'],
        gain:criterionText,burden:criterionText,prepare:criterionText},
      {id:'choice-b',key:'b',label:'나중에 살펴보기',summaryLines:[criterionText],
        gain:criterionText,burden:criterionText,prepare:criterionText}
    ]}
};
const optionPages = buildSummaryPages({groups:[],detailSections:[]},{personalReport:optionFixture});
uniquePages(optionPages);
assertPersonalOptions(optionPages,optionFixture);
assert.equal(bodyOf(chapterPages(optionPages,'personal-choice-a')).split(criterionText).length - 1,3);
assert.equal(bodyOf(chapterPages(optionPages,'personal-choice-b')).split(criterionText).length - 1,3);

for (const [index,card] of DECK.entries()) {
  const topic = ['overall','love','money','work'][index % 4];
  const reading = getReading(card,topic,index % 3);
  const before = JSON.stringify(reading);
  const pages = buildCardPages(card,reading,{positionLabel:'실제 공개 순서의 자리'});
  uniquePages(pages);
  const [conclusion, ...details] = reading.paragraphs;
  assert.equal(chapterText(pages,'cards-' + card.id),conclusion + (reading.introduction || '') + details.join(''),
    'the complete conclusion leads the card introduction without losing any authored paragraph');
  assert.equal(pages[0].art.id,card.id);
  assert.equal(pages[0].subtitle,'실제 공개 순서의 자리');
  assertReferenceMaterial(pages,reading);
  assert.equal(JSON.stringify(reading),before);
}
console.log('PASS tarot reading pages: ' + summaryCases + ' filtered summaries, 20 donor topics absent from reading/copy selection, 31 visible domains with 50 raw originals, retained titles and bodies, safe missing-primary fallback, intact A/B criteria and 78 unchanged card stories');
