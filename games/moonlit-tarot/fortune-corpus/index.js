import { OVERALL_FORTUNES } from './overall.js?v=20261113-tarot-corpus1';
import { LOVE_FORTUNES } from './love.js?v=20261113-tarot-corpus1';
import { MONEY_FORTUNES } from './money.js?v=20261113-tarot-corpus1';
import { WORK_FORTUNES_A } from './work-a.js?v=20261113-tarot-corpus1';
import { WORK_FORTUNES_B } from './work-b.js?v=20261113-tarot-corpus1';
import { WORK_FORTUNES_C1 } from './work-c1.js?v=20261113-tarot-corpus1';
import { WORK_FORTUNES_C2 } from './work-c2.js?v=20261113-tarot-corpus1';

export const CORPUS_VERSION = '20261113-corpus1';

// These are literal, separately written records. Do not replace missing rows
// with generic text or count string combinations as authored records.
export const FORTUNE_ROWS = Object.freeze({
  overall: OVERALL_FORTUNES,
  love: LOVE_FORTUNES,
  money: MONEY_FORTUNES,
  work: [...WORK_FORTUNES_A, ...WORK_FORTUNES_B, ...WORK_FORTUNES_C1, ...WORK_FORTUNES_C2]
});

const corpus = Object.fromEntries(Object.entries(FORTUNE_ROWS).map(([topic, rows]) => {
  const records = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== 4 || !/^[0-9][0-7][0-7]$/.test(row[0]) || row.some(value => typeof value !== 'string' || !value.trim())) {
      throw new Error(`tarot_corpus_invalid_record:${topic}`);
    }
    const [key, oneLine, body, action] = row;
    if (records.has(key)) throw new Error(`tarot_corpus_duplicate_key:${topic}:${key}`);
    records.set(key, Object.freeze({ id: `${topic}:${key}`, key, oneLine, body, action }));
    Object.freeze(row);
  }
  // Refuse an incomplete content release before the application can start a
  // paid reading. A missing key must not be disguised by a fallback paragraph.
  if (records.size !== 640) throw new Error(`tarot_corpus_incomplete:${topic}`);
  Object.freeze(rows);
  return [topic, records];
}));

/** Selection is meaningful and deterministic; it does not randomly swap prose. */
export function getFortune(topic, key) {
  const record = Object.hasOwn(corpus, topic) ? corpus[topic].get(key) : null;
  if (!record) throw new Error(`tarot_corpus_missing_record:${topic}:${key}`);
  return record;
}

export function getCorpusCounts() {
  return Object.fromEntries(Object.entries(corpus).map(([topic, records]) => [topic, records.size]));
}
