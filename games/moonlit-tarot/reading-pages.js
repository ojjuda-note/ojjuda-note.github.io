// Presentation only: every sentence comes from the existing reading data.
// Keeping this separate from the view also keeps copying independent of the current page.
const strings = values => Array.isArray(values) ? values.filter(value => typeof value === 'string' && value.trim()) : [];
const paragraphsOf = part => strings(part?.paragraphs).length
  ? strings(part.paragraphs)
  : strings(String(part?.body || part?.text || '').split(/\n\s*\n/u));
const textKey = value => value.trim().replace(/\s+/gu, ' ');

// Keep one representative for overlapping topics. Removed topics do not get
// hidden pages, submenu entries or a second route through the copied reading.
const representativeTopics = [
  ['problem-problem-now', ['domains-core-problem']],
  ['problem-solution', ['domains-problem-solving']],
  ['problem-possible-outcome', ['domains-possible-results']],
  ['timeline-past-flow', ['domains-past-influence']],
  ['timeline-past-achievements', ['domains-past-achievements']],
  ['timeline-future-change', ['domains-future-changes']],
  ['problem-situation-now', ['timeline-present-luck', 'domains-present-flow']],
  ['timeline-strengths', ['domains-my-tendencies', 'domains-my-strengths']],
  ['timeline-past-hardships', ['domains-past-hardships']],
  ['timeline-future-hardships', ['domains-cautions-and-risks', 'domains-prepare-for-difficulties']],
  ['domains-study-habits', ['domains-concentration-obstacles']],
  ['domains-money-attitude', ['domains-spending-habits']],
  ['domains-everyday-burdens', ['domains-life-balance']],
  ['domains-stress-reactions', ['domains-rest-and-recovery']],
  ['domains-good-fortune', ['domains-unexpected-help']],
  ['domains-what-i-really-want', ['domains-life-direction']],
  ['domains-family-conflict', ['domains-family-role']]
];

/** One selection policy for the reader and its complete-copy action. */
export function selectSummaryGroups(summary) {
  const groups = Array.isArray(summary.groups) && summary.groups.length ? summary.groups
    : [{ id: 'problem', label: '나의 이야기', sections: summary.sections || [] }];
  const sourceIds = new Set(groups.flatMap(group => (group.sections || []).map((part, index) => `${group.id}-${part.id || index}`)));
  const removed = new Set(representativeTopics.filter(([id]) => sourceIds.has(id)).flatMap(([, related]) => related));
  return groups.map(group => {
    const sections = (group.sections || []).filter((part, index) => !removed.has(`${group.id}-${part.id || index}`));
    const selected = { ...group, sections };
    if (group.categories) selected.categories = group.categories.map(category => ({
      ...category, count: sections.filter(part => part.categoryId === category.id).length
    })).filter(category => category.count);
    return selected;
  }).filter(group => group.sections.length || group.description || group.detailSections?.length || group.basisParagraphs?.length);
}

/** Split at sentence/word boundaries, retaining the original characters and order. */
export function splitReaderParagraphs(paragraphs, maxChars = 240) {
  const limit = Number.isFinite(maxChars) && maxChars >= 40 ? Math.floor(maxChars) : 240;
  const pages = [];
  let page = [], size = 0;
  const add = value => {
    if (page.length && (size + value.length > limit || page.length >= 2)) {
      pages.push(page); page = []; size = 0;
    }
    page.push(value); size += value.length;
  };
  for (const paragraph of strings(paragraphs)) {
    let remaining = paragraph;
    while (remaining.length > limit) {
      const prefix = remaining.slice(0, limit + 1);
      const boundaries = [...prefix.matchAll(/[.!?。！？…]+[”’"'」』)\]]*\s+/gu)];
      let end = boundaries.length ? boundaries.at(-1).index + boundaries.at(-1)[0].length : 0;
      if (end < limit / 3) {
        const spaces = [...prefix.matchAll(/\s+/gu)];
        end = spaces.length ? spaces.at(-1).index + spaces.at(-1)[0].length : 0;
      }
      // A single unbroken word stays intact and can wrap/scroll in the reader.
      if (!end) break;
      add(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }
    if (remaining) add(remaining);
  }
  if (page.length) pages.push(page);
  return pages;
}

function chapter(pages, group, part, index, extras = {}) {
  const chapterId = `${group.id}-${part.id || index}`;
  const sources = extras.sources || [{ id: chapterId, part }];
  const title = part.title;
  const common = {
    chapterId, chapterTitle: extras.chapterTitle || title,
    groupId: group.id, groupLabel: group.label,
    title, sourceIds: sources.map(source => source.id),
    kind: extras.kind || 'reading'
  };
  const bodyKeys = sources.flatMap(source => paragraphsOf(source.part).map(textKey));
  const seenSummaries = new Set();
  const start = pages.length;
  for (const source of sources) {
    const sourceTitle = source.part.title || title;
    const page = { ...common, sourceId: source.id, sourceTitle, subtitle: source.part.subtitle || '' };
    const paragraphs = paragraphsOf(source.part);
    const summaryLines = strings(source.part.summaryLines).filter(line => {
      const key = textKey(line);
      if (bodyKeys.some(body => body.includes(key)) || seenSummaries.has(key)) return false;
      seenSummaries.add(key);
      return true;
    });
    if (summaryLines.length) pages.push({ ...page, summaryLines, paragraphs: [], kind: 'summary' });
    for (const chunk of splitReaderParagraphs(paragraphs)) pages.push({ ...page, paragraphs: chunk });
  }
  if (pages.length === start) pages.push({ ...common, sourceId: sources[0].id, sourceTitle: part.title, subtitle: part.subtitle || '', paragraphs: [] });
  if (extras.art) {
    pages[start].art = extras.art;
    if (extras.artCaption) pages[start].artCaption = extras.artCaption;
  }
  if (extras.links?.length) pages[pages.length - 1].links = extras.links;
  for (let offset = start; offset < pages.length; offset++) pages[offset].id = `${chapterId}-${offset - start + 1}`;
}

const appendix = { id: 'appendix', label: '카드의 뜻과 참고 이야기' };
function cardAppendix(pages, part, key, title) {
  if (part.nameGuide) chapter(pages, appendix, {
    id: `${key}-name`, title: `${title} · 이름의 뜻`, paragraphs: [part.nameGuide]
  });
  (part.detailSections || part.sections || []).forEach((detail, index) => chapter(pages, appendix, {
    ...detail, id: `${key}-detail-${index}`, title: detail.title,
    subtitle: [title, detail.subtitle].filter(Boolean).join(' · ')
  }, index, { chapterTitle: `${title} · ${detail.title}` }));
  const links = [part.reference, part.sourceNote?.reference]
    .filter(reference => reference?.url)
    .map(reference => ({ label: reference.label || '참고 자료 읽기', url: reference.url }));
  if (links.length || part.sourceNote?.body) chapter(pages, appendix, {
    id: `${key}-sources`, title: `${title} · 참고 자료`,
    paragraphs: part.sourceNote?.body ? [part.sourceNote.body] : []
  }, 0, { links, kind: 'reference' });
}

function personalPages(pages, report) {
  const group = { id: 'personal', label: '내 상황에 맞는 풀이' };
  if (!report) {
    chapter(pages, group, {
      id: 'choose', title: '지금 내 고민에 맞춰 읽기',
      paragraphs: ['풀이 목록에서 지금 내 상황을 골라 보세요. 같은 세 장의 카드로 상황별 풀이와 두 선택의 장단점을 함께 볼 수 있어요.']
    });
    return;
  }
  chapter(pages, group, { id: 'question', title: report.question, subtitle: report.label, paragraphs: [report.example] });
  if (report.connection) chapter(pages, group, report.connection);
  (report.primary || []).forEach((part, index) => chapter(pages, group, part, index));
  if (report.comparison) {
    const comparison = report.comparison;
    chapter(pages, group, {
      id: 'comparison', title: comparison.title, subtitle: '두 선택 비교',
      paragraphs: [comparison.basis], summaryLines: comparison.basisSummaryLines
    });
    (comparison.options || []).forEach(option => {
      const title = `${option.key.toUpperCase()}. ${option.label}`;
      const part = { id: option.id, title, summaryLines: option.summaryLines, paragraphs: [] };
      const sources = [{ id: `${group.id}-${option.id}`, part }];
      for (const [key, label] of [['gain', '이 선택의 장점'], ['burden', '감수할 부담'], ['prepare', '먼저 준비할 것']]) sources.push({
        id: `${group.id}-${option.id}-${key}`, part: { subtitle: label, paragraphs: [option[key]] }
      });
      chapter(pages, group, part, 0, { sources });
    });
  }
  (report.followUps || []).forEach((part, index) => chapter(pages, group, part, index));
  if (report.basis) chapter(pages, appendix, { id: 'personal-basis', title: '상황별 풀이의 범위', paragraphs: [report.basis] });
}

export function buildSummaryPages(summary, { cards = [], personalReport = null } = {}) {
  const pages = [], notes = [];
  for (const group of selectSummaryGroups(summary)) {
    for (const [index, part] of (group.sections || []).entries()) {
      const category = group.categories?.find(item => item.id === part.categoryId);
      const target = category ? { id: `domains:${category.id}`, label: category.label } : group;
      // Chapter IDs remain tied to the source section, even when grouped by category in the menu.
      const start = pages.length;
      const adviceCard = group.id === 'problem' && part.id === 'solution' ? cards[2] : null;
      chapter(pages, { id: group.id, label: target.label }, part, index, {
        art: group.id === 'cards' ? cards.find(card => card.id === part.cardId) : adviceCard,
        artCaption: adviceCard ? `조언 카드 · ${adviceCard.name}` : ''
      });
      for (let page = start; page < pages.length; page++) pages[page].groupId = target.id;
      if (group.id === 'cards') cardAppendix(notes, part, part.id || `card-${index}`, part.displayName || cards[index]?.name || part.title);
    }
    if (group.id === 'problem') {
      (summary.detailSections || []).forEach((part, index) => chapter(pages, group, { ...part, id: `detail-${index}` }, index));
      if (summary.ritual && !summary.ritualInReading) chapter(pages, group, {
        id: 'ritual', title: '이렇게 해 보세요', paragraphs: [summary.ritual]
      });
    }
    if (group.description) chapter(notes, appendix, {
      id: `${group.id}-description`, title: `${group.label} · 읽는 방법`, paragraphs: [group.description]
    });
    (group.detailSections || []).forEach((part, index) => chapter(notes, appendix, {
      ...part, id: `${group.id}-detail-${index}`
    }, index, { chapterTitle: `세 카드를 함께 읽는 법 · ${part.title}` }));
    if (group.basisParagraphs?.length) chapter(notes, appendix, {
      id: `${group.id}-basis`, title: '풀이 방식과 범위', paragraphs: group.basisParagraphs
    });
  }
  personalPages(pages, personalReport);
  return [...pages, ...notes];
}

export function buildCardPages(card, reading, { positionLabel = '' } = {}) {
  const pages = [];
  const title = reading.displayName || card.name;
  const [conclusion, ...details] = paragraphsOf(reading);
  chapter(pages, { id: 'cards', label: '카드 이야기' }, {
    id: card.id, title, subtitle: positionLabel || reading.positionLabel || '',
    paragraphs: [conclusion, reading.introduction, ...details].filter(Boolean)
  }, 0, { art: card });
  cardAppendix(pages, reading, card.id, title);
  chapter(pages, appendix, {
    id: 'reading-scope', title: '이 설명은 어떻게 만들었나요?',
    paragraphs: ['옛 타로 그림에 담긴 뜻을 오쭈다에서 쉬운 말로 풀어 썼어요. 생활 속 이야기는 카드의 뜻을 이해하도록 만든 예시예요. 실제로 있었던 일이나 앞으로 생길 일을 알아낸 내용은 아니에요.']
  });
  return pages;
}
