// Reuse the selected reading's own authored units. These are presentation
// summaries, not another calculation, interpretation table or prediction.
const fail = () => { throw new TypeError('확인된 풀이에서 서로 다른 두 줄 요약을 준비하지 못했어요.'); };
const list = value => Array.isArray(value) ? value : fail();
const pairs = {'‘':'’', '“':'”', '「':'」', '『':'』', '(' : ')', '[':']', '{':'}'};
const units = value => {
  if (Array.isArray(value)) return value.flatMap(units);
  if (value == null) return [];
  if (typeof value !== 'string') return fail();
  const text = value.trim(), stack = [], sentences = [];
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    // Preserve contractions inside a quoted sentence as well as outside it.
    if (character === "'" && /[\p{L}\p{N}]/u.test(text[index - 1] || '')
      && /[\p{L}\p{N}]/u.test(text[index + 1] || '')) continue;
    if (stack.at(-1) === character) { stack.pop(); continue; }
    if (Object.hasOwn(pairs, character)) { stack.push(pairs[character]); continue; }
    if (character === '"' || character === "'") { stack.push(character); continue; }
    // A quoted/parenthesized example can contain several sentences before its
    // attached condition ends. Only split at an outer sentence boundary.
    if (stack.length || !/[.!?。！？]/u.test(character)) continue;
    if (character === '.' && /\d/u.test(text[index - 1] || '') && /\d/u.test(text[index + 1] || '')) continue;
    if (index + 1 < text.length && !/\s/u.test(text[index + 1])) continue;
    sentences.push(text.slice(start, index + 1));
    start = index + 1;
  }
  sentences.push(text.slice(start));
  // Keep the whole final authored unit, including unmatched punctuation; no
  // character limit, ellipsis or visual-line clipping changes its conditions.
  return sentences.map(sentence => sentence.trim().replace(/\s+/gu, ' ')).filter(Boolean);
};
const identity = value => value.replace(/[.!?。！？]+["'”’)\]]*$/u, '').trim();
const lastParagraph = item => list(item.paragraphs).at(-1);
const work = overview => list(overview.cards).find(item => item.id?.endsWith('-work'));
const periodAction = period => list(period.topics).find(item => item.id?.endsWith('.work'))?.personalParagraphs?.[3];

/** Add two distinct source-authored units to each available visible reading. */
export function attachReadingSummaryLines(report) {
  if (!report || typeof report !== 'object' || !report.reader) fail();
  const pending = [];
  function add(item, lead, action) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail();
    const opening = units(lead), first = opening[0];
    if (!first) fail();
    // Prefer the explicit action. If it repeats the heading, use its next full
    // sentence, then another complete unit from this same item's own prose.
    const choices = units([action, opening.slice(1), item.paragraphs, item.description,
      item.title, item.headline, item.value]);
    const second = choices.find(value => identity(value) !== identity(first));
    if (!second) fail();
    pending.push([item, [first, second]]);
  }

  const reader = report.reader;
  for (const overview of [reader.lifelong, reader.annual, ...list(reader.months)]) {
    const cards = list(overview?.cards);
    const anchor = overview === reader.lifelong
      ? cards.find(item => item.id === 'natal-character') : work(overview);
    add(overview, overview.headline, anchor ? lastParagraph(anchor) : lastParagraph(overview));
    for (const item of cards) add(item, item.title, lastParagraph(item));
  }

  const portrait = report.personPortrait;
  if (portrait) {
    const cards = list(portrait.cards);
    const anchor = cards.find(item => item.id === 'portrait-decisions');
    add(portrait, portrait.headline, anchor ? lastParagraph(anchor) : lastParagraph(portrait));
    for (const item of cards) add(item, item.title, lastParagraph(item));
  }

  const daeun = report.daeun;
  if (daeun?.available === true) {
    const periods = list(daeun.periods);
    if (!periods.length) fail();
    const selected = periods.find(period => period.isCurrent)
      || (daeun.currentState === 'before-start' ? periods[0] : null);
    add(daeun, daeun.headline, selected ? periodAction(selected) : daeun.paragraphs);
    for (const period of periods) {
      add(period, period.headline, periodAction(period));
      for (const item of list(period.topics)) add(item, item.title, item.personalParagraphs?.[3]);
      for (const item of list(period.situations || [])) add(item, item.title, lastParagraph(item));
    }
  }

  if (reader.symbols) {
    add(reader.symbols, reader.symbols.headline, lastParagraph(reader.symbols));
    for (const item of list(reader.symbols.items)) add(item, item.value, item.description);
  }
  if (reader.timings) {
    // This overview is a guide to all twelve months, with no current-month
    // marker of its own. Keep its authored scope rather than guessing a month.
    add(reader.timings, reader.timings.headline, reader.timings.paragraphs);
    for (const item of list(reader.timings.items)) {
      add(item, item.headline, lastParagraph(item));
      for (const key of ['opportunities', 'people', 'documents', 'cautions']) {
        for (const point of list(item[key])) add(point, point.label, point.text);
      }
    }
  }
  // Validate every pair before changing the report, including malformed input.
  for (const [item, summaryLines] of pending) item.summaryLines = summaryLines;
  return report;
}
