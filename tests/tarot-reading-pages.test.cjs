const assert = require('node:assert/strict');
const { createTarotLoader } = require('./tarot-module-fixture.cjs');
const load = createTarotLoader();
const { DECK, getReading, getSummary } = load('readings.js');
const { buildPersonalReading } = load('personal-reading.js');
const { buildSummaryPages, buildCardPages, splitReaderParagraphs } = load('reading-pages.js');
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
const MERGED_TOPICS = [
  ['problem-problem-now', 'domains-core-problem'],
  ['problem-solution', 'domains-problem-solving'],
  ['problem-possible-outcome', 'domains-possible-results'],
  ['timeline-past-flow', 'domains-past-influence'],
  ['timeline-past-achievements', 'domains-past-achievements'],
  ['timeline-future-change', 'domains-future-changes']
];
const domainToCanonical = new Map(MERGED_TOPICS.map(([canonical, domain]) => [domain, canonical]));
const uniqueInOrder = values => {
  const seen = new Set();
  return values.filter(value => {
    const key = whitespaceKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
function uniquePages(pages) {
  assert.ok(pages.length);
  assert.equal(new Set(pages.map(page => page.id)).size, pages.length, 'page IDs never collide across chapters or appendices');
  for (const page of pages) {
    assert.ok(page.id && page.title && page.chapterId && page.chapterTitle && page.groupId && page.groupLabel);
    assert.ok(Array.isArray(page.paragraphs));
    assert.ok(page.id.startsWith(page.chapterId + '-'));
    assert.ok(Array.isArray(page.sourceIds) && page.sourceIds.length, 'every chapter retains its original source IDs');
    assert.equal(new Set(page.sourceIds).size, page.sourceIds.length);
    assert.ok(page.sourceIds.includes(page.sourceId), 'each page points to the source actually displayed');
  }
}
function chapterPages(pages, id) {
  const items = pages.filter(page => page.chapterId === id);
  assert.ok(items.length, id + ': the original meaning has a reachable chapter');
  assert.deepEqual(items.map(page => page.id), items.map((_, index) => id + '-' + (index + 1)));
  return items;
}
function chapterText(pages, id) {
  return bodyOf(chapterPages(pages, id));
}
function assertChapterSources(pages, id, sources, dedupeParagraphs = false) {
  const chapter = chapterPages(pages, id);
  const allParagraphs = sources.flatMap(source => paragraphsOf(source.part));
  const expectedParagraphs = dedupeParagraphs ? uniqueInOrder(allParagraphs) : allParagraphs;
  assert.equal(bodyOf(chapter), expectedParagraphs.join(''),
    id + ': every unique paragraph, condition and example survives in original order');
  for (const page of chapter) assert.deepEqual(Array.from(page.sourceIds), sources.map(source => source.id));
  const bodyKeys = allParagraphs.map(whitespaceKey);
  const expectedSummaries = uniqueInOrder(sources.flatMap(source => Array.from(source.part.summaryLines || [])))
    .filter(line => !bodyKeys.some(paragraph => paragraph.includes(whitespaceKey(line))));
  assert.deepEqual(plain(chapter.flatMap(page => page.summaryLines || [])), expectedSummaries,
    id + ': only summaries already present in this chapter body or repeated exactly are omitted');
  // A retained paragraph keeps the provenance of its first occurrence.
  const seen = new Set();
  for (const source of sources) {
    const expected = paragraphsOf(source.part).filter(paragraph => {
      const key = whitespaceKey(paragraph);
      if (dedupeParagraphs && seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    assert.equal(bodyOf(chapter.filter(page => page.sourceId === source.id)), expected.join(''),
      source.id + ': retained text remains attached to its actual source');
  }
  return chapter;
}
function assertReferenceMaterial(pages, part) {
  const text = compact(bodyOf(pages));
  for (const detail of part.detailSections || part.sections || []) {
    assert.ok(text.includes(compact(original(detail))), 'the detailed original card/source explanation is preserved');
  }
  if (part.nameGuide) assert.ok(text.includes(compact(part.nameGuide)));
  if (part.sourceNote) assert.ok(text.includes(compact(part.sourceNote.body)));
  for (const reference of [part.reference, part.sourceNote?.reference]) if (reference?.url) {
    assert.ok(linksOf(pages).includes(reference.url), 'the original source link remains reachable');
  }
}

// A controlled fixture proves real repetition is removed, rather than merely
// reducing counters or accepting whatever the production builder returns.
const shared = '조건을 확인한 뒤 10쭈를 준비한다.';
const extraSummary = '계약서를 다시 읽는 것이 먼저다.';
const primaryParagraphs = [
  shared,
  '확인하지 않았다면 서두르지 않는다.',
  '오늘 확인한 뒤 결정한다.',
  '“지금 결정해.”라는 말을 들어도 확인이 먼저다.'
];
const domainParagraphs = [
  '  조건을  확인한 뒤 10쭈를 준비한다.  ',
  '조건을 확인한 뒤 30쭈를 준비한다.',
  '확인했다면 서두르지 않는다.',
  '내일 확인한 뒤 결정한다.',
  '“지금 결정해?”라는 말을 들어도 확인이 먼저다.',
  '확인한 뒤 기다린다. 확인한 뒤 기다린다.'
];
const fixture = {
  groups: [
    {id:'problem',label:'나의 이야기',sections:[
      {id:'problem-now',title:'지금 살펴볼 문제',paragraphs:primaryParagraphs,
        summaryLines:[shared,extraSummary]},
      {id:'another-view',title:'지금 살펴볼 문제',paragraphs:[shared,shared],
        summaryLines:['같은 제목이어도 다른 관점은 따로 남긴다.']},
      {id:'body-backed-summary',title:'이미 본문에 있는 요약',paragraphs:[shared],summaryLines:[shared]},
      {id:'summary-only',title:'요약만 있는 항목',paragraphs:[],
        summaryLines:['본문이 없어도 이 고유한 요약은 읽을 수 있어야 한다.']}
    ]},
    {id:'domains',label:'분야별 풀이',categories:[{id:'solutions',label:'문제 해결',count:2}],sections:[
      {id:'core-problem',categoryId:'solutions',title:'문제의 핵심',paragraphs:domainParagraphs,
        summaryLines:['조건을  확인한 뒤 10쭈를 준비한다.',extraSummary,'비용은 1.5배인지 확인한다.']},
      {id:'different-perspective',categoryId:'solutions',title:'문제의 핵심',paragraphs:['상대가 동의했는지도 따로 살펴본다.'],
        summaryLines:[shared]}
    ]}
  ],
  detailSections:[]
};
const fixtureBefore = JSON.stringify(fixture);
const fixturePages = buildSummaryPages(fixture);
uniquePages(fixturePages);
assert.equal(JSON.stringify(fixture), fixtureBefore);
const joinedFixture = chapterPages(fixturePages, 'problem-problem-now');
assert.equal(bodyOf(joinedFixture), [
  ...primaryParagraphs,
  '조건을 확인한 뒤 30쭈를 준비한다.',
  '확인했다면 서두르지 않는다.',
  '내일 확인한 뒤 결정한다.',
  '“지금 결정해?”라는 말을 들어도 확인이 먼저다.',
  '확인한 뒤 기다린다. 확인한 뒤 기다린다.'
].join(''), 'only the whitespace-equivalent duplicate disappears; numbers, negation, time, quotes and repeated sentences inside a paragraph stay intact');
assert.equal(bodyOf(joinedFixture).split(shared).length - 1, 1);
assert.deepEqual(plain(joinedFixture.flatMap(page => page.summaryLines || [])),
  [extraSummary,'비용은 1.5배인지 확인한다.'], 'body-backed summaries disappear while unique summary sentences remain');
for (const page of joinedFixture) assert.deepEqual(Array.from(page.sourceIds), ['problem-problem-now','domains-core-problem']);
assert.equal(fixturePages.some(page => page.chapterId === 'domains-core-problem'), false);
assert.equal(chapterText(fixturePages, 'problem-another-view'), shared + shared,
  'unlisted viewpoints and standalone bodies are not deduplicated even when titles or prose match');
assert.deepEqual(plain(chapterPages(fixturePages, 'domains-different-perspective').flatMap(page => page.summaryLines || [])), [shared],
  'a summary found only in another chapter is not silently deleted here');
const onlySummary = chapterPages(fixturePages, 'problem-summary-only');
assert.equal(onlySummary.length, 1);
assert.deepEqual(Array.from(onlySummary[0].summaryLines), ['본문이 없어도 이 고유한 요약은 읽을 수 있어야 한다.']);
assert.ok(fixturePages.every(page => page.paragraphs.length || page.summaryLines?.length || page.links?.length || page.art),
  'removing repeated summaries never leaves an empty reading page');
const fixtureChapters = [...new Set(fixturePages.filter(page => ['problem','domains:solutions'].includes(page.groupId)).map(page => page.chapterId))];
assert.deepEqual(fixtureChapters, ['problem-problem-now','problem-another-view','problem-body-backed-summary','problem-summary-only','domains-different-perspective']);
assert.equal(chapterPages(fixturePages,'problem-body-backed-summary').length,1, 'a body-backed summary loses its redundant standalone page');
assert.equal(bodyOf(chapterPages(fixturePages,'problem-body-backed-summary')),shared);
const separateOriginalPages = fixture.groups.flatMap(group => group.sections).reduce((count, part) =>
  count + (part.summaryLines?.length ? 1 : 0) + splitReaderParagraphs(paragraphsOf(part)).length, 0);
const actualFixturePages = fixturePages.filter(page => ['problem','domains:solutions'].includes(page.groupId)).length;
assert.ok(actualFixturePages < separateOriginalPages, 'the known repetitive fixture produces fewer actual pages as well as fewer menu entries');

// Without the canonical partner, a source must stay independently readable.
const loneDomain = {groups:[{id:'domains',label:'분야별 풀이',categories:[{id:'solutions',label:'문제 해결',count:1}],
  sections:[fixture.groups[1].sections[0]]}],detailSections:[]};
const lonePages = buildSummaryPages(loneDomain);
assertChapterSources(lonePages,'domains-core-problem',[{id:'domains-core-problem',part:loneDomain.groups[0].sections[0]}]);

let summaryCases = 0;
for (const topic of ['overall', 'love', 'money', 'work']) {
  for (const ids of [
    ['fool', 'justice', 'pentacles_king'],
    ['star', 'cups_six', 'magician']
  ]) {
    const cards = cardsOf(ids), summary = getSummary(cards, topic);
    const before = JSON.stringify(summary);
    const pages = buildSummaryPages(summary, { cards });
    uniquePages(pages);
    assert.equal(JSON.stringify(summary), before, 'building pages does not rewrite the source or the full-copy model');
    assert.deepEqual(plain(buildSummaryPages(summary, { cards })), plain(pages));
    const entries = summary.groups.flatMap(group => Array.from(group.sections, (part,index) =>
      ({id:group.id + '-' + (part.id || index),part,group,index})));
    const byId = new Map(entries.map(entry => [entry.id,entry]));
    const primarySources = new Map(MERGED_TOPICS);
    for (const entry of entries) {
      if (domainToCanonical.has(entry.id)) {
        assert.equal(pages.some(page => page.chapterId === entry.id), false, 'an integrated topic has no second menu entry');
        const canonical = domainToCanonical.get(entry.id);
        assert.ok(chapterPages(pages,canonical).every(page => page.sourceIds.includes(entry.id)),
          entry.id + ': its original meaning is traceable through the retained chapter');
        continue;
      }
      const otherId = primarySources.get(entry.id);
      const sources = [entry, ...(otherId ? [byId.get(otherId)] : [])];
      assert.ok(sources.every(Boolean), 'all six real-world pairs have their exact expected source');
      const chapter = assertChapterSources(pages,entry.id,sources,!!otherId);
      if (entry.group.id === 'domains') assert.ok(chapter.every(page => page.groupId === 'domains:' + entry.part.categoryId));
      else assert.ok(chapter.every(page => page.groupId === entry.group.id));
      if (entry.group.id === 'cards') {
        assert.equal(chapter[0].art.id,cards[entry.index].id);
        assertReferenceMaterial(pages,entry.part);
      }
    }
    const expectedMainOrder = Array.from(entries.filter(entry => !domainToCanonical.has(entry.id)), entry => entry.id);
    const mainIds = new Set(expectedMainOrder);
    const actualMainOrder = [...new Set(pages.filter(page => mainIds.has(page.chapterId)).map(page => page.chapterId))];
    assert.deepEqual(actualMainOrder,expectedMainOrder, 'canonical topics keep their original positions; other perspectives keep their order');
    for (const group of summary.groups) {
      for (const detail of group.detailSections || []) assert.ok(compact(bodyOf(pages)).includes(compact(original(detail))));
      for (const paragraph of group.basisParagraphs || []) assert.ok(compact(bodyOf(pages)).includes(compact(paragraph)));
      if (group.description) assert.ok(compact(bodyOf(pages)).includes(compact(group.description)));
    }
    for (const [index,detail] of summary.detailSections.entries()) {
      assert.equal(chapterText(pages,'problem-detail-' + index),original(detail),
        'selected corpus explanations, cautions and practical advice are not part of the six-topic removal');
    }
    const independentDomains = new Set(pages.filter(page => page.groupId.startsWith('domains:')).map(page => page.chapterId));
    assert.equal(independentDomains.size,44);
    assert.equal(new Set(pages.filter(page => page.groupId.startsWith('domains:')).map(page => page.groupId)).size,10);
    const domainSources = new Set(pages.flatMap(page => page.sourceIds).filter(id => id.startsWith('domains-')));
    assert.deepEqual([...domainSources].sort(),Array.from(entries.filter(entry => entry.group.id === 'domains'),entry => entry.id).sort(),
      'all fifty original domain meanings survive, including the six now under their canonical topics');
    assert.ok(pages.some(page => page.chapterId === 'personal-choose'));
    summaryCases++;
  }
}

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
    assertChapterSources(pages,'personal-' + part.id,[{id:'personal-' + part.id,part}]);
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
  assert.equal(chapterText(pages,'cards-' + card.id),(reading.introduction || '') + original(reading),
    'standalone card stories remain character-for-character unchanged');
  assert.equal(pages[0].art.id,card.id);
  assert.equal(pages[0].subtitle,'실제 공개 순서의 자리');
  assertReferenceMaterial(pages,reading);
  assert.equal(JSON.stringify(reading),before);
}
console.log('PASS tarot reading pages: ' + summaryCases + ' source-preserving summaries, six exact topic merges, 44 independent domains with all 50 meanings, fewer duplicate pages, intact A/B criteria, 78 unchanged card stories and immutable raw data');
