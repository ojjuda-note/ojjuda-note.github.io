import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune } from '../games/starlit-saju/fortune-data.mjs';
import { buildDetailedReading } from '../games/starlit-saju/readings.mjs';
import { getReadingSources } from '../games/starlit-saju/sources.mjs';

const now = new Date('2026-11-13T00:00:00+09:00');
function reading(input, year = 2026) {
  const chart = calculateSaju(input, { now });
  return buildDetailedReading(chart, analyzeFortune(chart, { year, now }));
}

test('the complete reading retains every fact internally and copies all three visible products without an evidence appendix', () => {
  for (const input of [
    { year: 2005, month: 12, day: 23, hour: 8, minute: 37 },
    { year: 2024, month: 2, day: 4, hour: null },
  ]) {
    const report = reading(input);
    const rows = report.evidence.all.groups.flatMap(group => group.rows);
    assert.equal(new Set(rows.map(row => row.factId)).size, rows.length);
    assert.deepEqual(rows.map(row => row.factId).sort(), report.facts.map(fact => fact.id).sort());
    for (const row of rows) {
      assert.equal(row.value,report.facts.find(fact=>fact.id===row.factId).text,row.factId);
      assert.ok(!report.copyByCategory.all.includes(row.label+': '+row.value),row.factId);
    }
    for (const overview of [report.reader.lifelong,report.reader.annual,...report.reader.months]) {
      for(const item of [overview,...overview.cards]) {
        assert.ok(report.copyByCategory.all.includes(item.title));
        for(const paragraph of item.paragraphs)assert.ok(report.copyByCategory.all.includes(paragraph));
      }
    }
    const advice = [...report.adviceByCategory.lifelong, ...report.adviceByCategory.annual, ...report.months.flatMap(month => month.advice)];
    for (const item of advice) for (const field of ['title', 'why', 'action', 'caution']) {
      assert.equal(report.copyByCategory.all.includes(item[field]),field!=='why',`${item.id}.${field}`);
    }
    assert.equal(report.copyText, report.copyByCategory.all);
  }
});

test('selected-year source records stay internal while lifelong copies remain independent of the forecast year', () => {
  const input = { year: 2005, month: 12, day: 23, hour: 8, minute: 37 };
  const first = reading(input, 2026), next = reading(input, 2027);
  assert.deepEqual(first.copyByCategory.lifelong, next.copyByCategory.lifelong);
  assert.match(first.copyByCategory.all, /평생운과 2026년 올해운·월별운/);
  assert.match(next.copyByCategory.all, /평생운과 2027년 올해운·월별운/);
  for (const source of getReadingSources('all', 2026)) {
    for (const field of ['title', 'publisher', 'url', 'usedFor', 'limitation']) {
      assert.ok(source[field],`${source.id}.${field} remains available internally`);
      assert.ok(!first.copyByCategory.all.includes(source[field]), `${source.id}.${field}`);
    }
  }
  assert.equal(getReadingSources('all', 2026).some(source => source.id === 'kasi-2026-calendar-check'), true);
  assert.equal(getReadingSources('all', 2027).some(source => source.id === 'kasi-2026-calendar-check'), false);
});
