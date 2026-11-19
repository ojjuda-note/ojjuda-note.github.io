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

function uniquePages(pages) {
  assert.ok(pages.length);
  assert.equal(new Set(pages.map(page => page.id)).size, pages.length, 'page IDs never collide across chapters or appendices');
  for (const page of pages) {
    assert.ok(page.id && page.title && page.chapterId && page.chapterTitle && page.groupId && page.groupLabel);
    assert.ok(Array.isArray(page.paragraphs));
    assert.ok(page.id.startsWith(page.chapterId + '-'));
  }
}
function chapterText(pages, id) {
  const items = pages.filter(page => page.chapterId === id);
  assert.ok(items.length, id + ': every original chapter is reachable');
  assert.deepEqual(items.map(page => page.id), items.map((_, index) => id + '-' + (index + 1)));
  return bodyOf(items);
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
    assert.equal(JSON.stringify(summary), before, 'building pages does not rewrite the source reading');
    assert.deepEqual(plain(buildSummaryPages(summary, { cards })), plain(pages));
    for (const group of summary.groups) {
      for (const [index, part] of group.sections.entries()) {
        const chapterId = group.id + '-' + (part.id || index);
        assert.equal(chapterText(pages, chapterId), original(part), 'short pages retain the entire original section, exactly once and in order');
        const chapter = pages.filter(page => page.chapterId === chapterId);
        assert.deepEqual(plain(chapter.flatMap(page => page.summaryLines || [])), Array.from(part.summaryLines || []));
        if (group.id === 'domains') assert.ok(chapter.every(page => page.groupId === 'domains:' + part.categoryId));
        if (group.id === 'cards') {
          assert.equal(chapter[0].art.id, cards[index].id, 'portraits use the actual revealed card in the same order');
          assertReferenceMaterial(pages, part);
        }
      }
      for (const detail of group.detailSections || []) assert.ok(compact(bodyOf(pages)).includes(compact(original(detail))));
      for (const paragraph of group.basisParagraphs || []) assert.ok(compact(bodyOf(pages)).includes(compact(paragraph)));
      if (group.description) assert.ok(compact(bodyOf(pages)).includes(compact(group.description)));
    }
    for (const [index, detail] of summary.detailSections.entries()) {
      assert.equal(chapterText(pages, 'problem-detail-' + index), original(detail),
        'selected corpus explanations, cautions and practical advice are not lost');
    }
    const domainChapters = new Set(pages.filter(page => page.groupId.startsWith('domains:')).map(page => page.chapterId));
    assert.equal(domainChapters.size, 50);
    assert.equal(new Set(pages.filter(page => page.groupId.startsWith('domains:')).map(page => page.groupId)).size, 10);
    assert.ok(pages.some(page => page.chapterId === 'personal-choose'), 'an unselected situation remains optional');
    summaryCases++;
  }
}

const personalCards = cardsOf(['fool', 'justice', 'pentacles_king']);
for (const [topicId, contextId] of [['love', 'love-crush'], ['money', 'money-agreement']]) {
  const report = buildPersonalReading({ cards: personalCards, topicId, contextId });
  const before = JSON.stringify(report);
  const pages = buildSummaryPages(getSummary(personalCards, topicId), { cards: personalCards, personalReport: report });
  uniquePages(pages);
  assert.equal(JSON.stringify(report), before);
  assert.equal(pages.some(page => page.chapterId === 'personal-choose'), false, 'a chosen situation replaces the optional prompt');
  for (const part of [report.connection, ...report.primary, ...report.followUps]) {
    assert.equal(chapterText(pages, 'personal-' + part.id), original(part), 'every situation, role and follow-up keeps the whole answer');
  }
  const text = compact(bodyOf(pages));
  for (const value of [report.example, report.basis, report.comparison.basis]) assert.ok(text.includes(compact(value)));
  for (const option of report.comparison.options) for (const key of ['gain', 'burden', 'prepare']) {
    assert.equal(chapterText(pages, 'personal-' + option.id + '-' + key), option[key],
      'both choices retain their original gain, burden and preparation');
  }
}

for (const [index, card] of DECK.entries()) {
  const topic = ['overall', 'love', 'money', 'work'][index % 4];
  const reading = getReading(card, topic, index % 3);
  const before = JSON.stringify(reading);
  const pages = buildCardPages(card, reading, { positionLabel: '실제 공개 순서의 자리' });
  uniquePages(pages);
  assert.equal(chapterText(pages, 'cards-' + card.id), (reading.introduction || '') + original(reading));
  assert.equal(pages[0].art.id, card.id);
  assert.equal(pages[0].subtitle, '실제 공개 순서의 자리');
  assertReferenceMaterial(pages, reading);
  assert.equal(JSON.stringify(reading), before);
}
console.log('PASS tarot reading pages: ' + summaryCases + ' full summaries, all 50 domains, 78 card stories, actual portraits, source references, personal choices, exact text conservation and stable unique pages');
