import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSaju } from '../games/starlit-saju/engine.mjs';
import { analyzeFortune } from '../games/starlit-saju/fortune-data.mjs';
import { analyzeDaeun } from '../games/starlit-saju/daeun.mjs';
import { buildDetailedReading } from '../games/starlit-saju/readings.mjs';
import { attachReadingSummaryLines } from '../games/starlit-saju/reading-summary-lines.mjs';
import { describePersonalPeriod } from '../games/starlit-saju/reader-summary.mjs';

const now = new Date('2026-11-13T00:00:00Z');
const birth = {year:1990, month:5, day:17, hour:8, minute:37};
const timingKeys = ['opportunities', 'people', 'documents', 'cautions'];
function withoutSummaries(value) {
  if (Array.isArray(value)) return value.map(withoutSummaries);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'summaryLines')
    .map(([key, child]) => [key, withoutSummaries(child)]));
}
function build(input=birth, gender='male') {
  const chart = calculateSaju(input, {now});
  const fortune = analyzeFortune(chart, {year:2026, now});
  const daeun = analyzeDaeun(chart, {gender, now});
  return withoutSummaries(buildDetailedReading(chart, fortune, {daeun}));
}
function targets(report) {
  const reader = report.reader;
  const overviews = [reader.lifelong, reader.annual, ...reader.months];
  return [
    ...overviews.flatMap(item => [item, ...item.cards]),
    report.personPortrait, ...report.personPortrait.cards,
    ...(report.daeun.available ? [report.daeun, ...report.daeun.periods.flatMap(period =>
      [period, ...period.topics, ...period.situations])] : []),
    reader.symbols, ...reader.symbols.items,
    reader.timings, ...reader.timings.items.flatMap(item =>
      [item, ...timingKeys.flatMap(key => item[key])]),
  ];
}
function texts(value) {
  if (typeof value === 'string') return [value.replace(/\s+/gu, ' ')];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).filter(([key]) => !['summaryLines', 'copyText', 'copyByCategory'].includes(key))
    .flatMap(([, child]) => texts(child));
}
const distinct = line => line.replace(/[.!?。！？]+["'”’)\]]*$/u, '').trim();

test('every visible reading gets two source-authored units while all original data and scores remain intact', () => {
  const report = build();
  report.score = {total:66, max:100, items:[{id:'existing', value:66}]};
  const before = structuredClone(report), sources = texts(before);
  assert.equal(attachReadingSummaryLines(report), report);
  assert.deepEqual(withoutSummaries(report), before);
  assert.equal(report.reader.lifelong.cards.length, 18);
  assert.equal(report.reader.annual.cards.length, 7);
  assert.ok(report.reader.months.every(month => month.cards.length === 7));
  assert.equal(report.personPortrait.cards.length, 5);
  assert.equal(report.daeun.periods.length, 9);
  assert.ok(report.daeun.periods.every(period => period.topics.length === 4 && period.situations.length === 2));
  const pointCount = report.reader.timings.items.reduce((sum, item) =>
    sum + timingKeys.reduce((count, key) => count + item[key].length, 0), 0);
  assert.equal(targets(report).length, 210 + pointCount);
  for (const item of targets(report)) {
    assert.equal(item.summaryLines.length, 2, item.id || item.title || item.label);
    assert.notEqual(distinct(item.summaryLines[0]), distinct(item.summaryLines[1]));
    for (const line of item.summaryLines) {
      assert.ok(typeof line === 'string' && line.trim() === line && line.length > 0);
      assert.doesNotMatch(line, /\n|…|\.\.\./);
      assert.ok(sources.some(source => source.includes(line)), `unwritten text: ${line}`);
    }
  }
  const once = structuredClone(report);
  attachReadingSummaryLines(report);
  assert.deepEqual(report, once, 'repeated attachment cannot rotate text or alter the report');
});

test('cards keep their selected result and actual advice, including personal decade actions', () => {
  const report = attachReadingSummaryLines(build());
  const profile=analyzeFortune(calculateSaju(birth,{now}),{year:2026,now}).profile;
  const overviews = [report.reader.lifelong, report.reader.annual, ...report.reader.months];
  for (const item of [...overviews.flatMap(overview => overview.cards), ...report.personPortrait.cards]) {
    assert.ok(item.title.startsWith(item.summaryLines[0]));
    assert.ok(item.paragraphs.at(-1).includes(item.summaryLines[1]), item.id);
  }
  for (const period of report.daeun.periods) {
    for (const item of period.topics) {
      assert.ok(item.title.startsWith(item.summaryLines[0]));
      assert.ok(item.personalParagraphs[3].includes(item.summaryLines[1]), item.id);
    }
    for (const item of period.situations) assert.ok(item.paragraphs.at(-1).includes(item.summaryLines[1]), item.id);
  }
  for (const item of report.reader.symbols.items) {
    assert.equal(item.summaryLines[0], item.value);
    assert.ok(item.description.includes(item.summaryLines[1]));
  }
  for (const item of report.reader.timings.items) {
    assert.ok(item.headline.startsWith(item.summaryLines[0]));
    const action=describePersonalPeriod(profile,item.godCodes,'money','이 기간').paragraphs[3];
    const application=item.detailSections.find(section=>section.title==='이번 달에 적용할 방법');
    assert.deepEqual(application.paragraphs,[action],'added preparation examples preserve the original personal action');
    assert.equal(item.paragraphs.at(-1),action,'the complete period reading still ends with its original practical response');
    assert.ok(action.includes(item.summaryLines[1]),'the second summary unit comes from that same personal response');
    for (const key of timingKeys) for (const point of item[key]) {
      assert.ok(point.label.startsWith(point.summaryLines[0]));
      assert.ok(point.text.includes(point.summaryLines[1]));
    }
  }
});

test('missing gender and an unresolved known-minute boundary never receive decade summaries', () => {
  for (const [input, gender] of [[{...birth, hour:null}, null],
    [{year:2024, month:2, day:4, hour:17, minute:27}, 'female'], [birth, null]]) {
    const report = build(input, gender), original = structuredClone(report);
    attachReadingSummaryLines(report);
    assert.equal(report.daeun.available, false);
    assert.equal(Object.hasOwn(report.daeun, 'summaryLines'), false);
    assert.deepEqual(report.daeun, original.daeun);
    assert.deepEqual(withoutSummaries(report), original);
    assert.ok(targets(report).every(item => item.summaryLines.length === 2));
    assert.equal(report.reader.scopeNotice, original.reader.scopeNotice);
  }
});

test('six-AM decade summaries preserve the assumed-time notice and original unknown natal scope', () => {
  for (const input of [{...birth, hour:null}, {year:2024, month:2, day:4, hour:null}]) {
    const report=build(input), original=structuredClone(report);
    attachReadingSummaryLines(report);
    assert.equal(report.daeun.available,true);assert.equal(report.daeun.timeAssumed,true);
    assert.equal(report.daeun.birthTimeNotice,original.daeun.birthTimeNotice);
    assert.match(report.daeun.birthTimeNotice,/태어난 시간을 몰라.*오전 6시 00분/);
    assert.equal(report.daeun.periods.length,9);
    assert.ok(targets(report).every(item=>item.summaryLines.length===2));
    assert.ok(report.daeun.facts.every(item=>!/^daeun\.reading\.natal\.(?:pillar|god)\.hour(?:\.|$)/.test(item.id)));
    assert.deepEqual(withoutSummaries(report),original,'summary presentation preserves the full reading, scores and assumed-time disclosure');
    assert.equal(report.reader.scopeNotice,original.reader.scopeNotice);
  }
});

test('decade overview respects before-start and after-listed ranges instead of inventing a current period', () => {
  const before = attachReadingSummaryLines(build({year:2022, month:3, day:9, hour:21, minute:51}));
  assert.equal(before.daeun.currentState, 'before-start');
  assert.ok(before.daeun.summaryLines[0].startsWith('처음 살펴볼 시기'));
  const firstWork = before.daeun.periods[0].topics.find(item => item.id.endsWith('.work'));
  assert.ok(firstWork.personalParagraphs[3].includes(before.daeun.summaryLines[1]));
  const after = attachReadingSummaryLines(build({year:1900, month:1, day:1, hour:8, minute:0}));
  assert.equal(after.daeun.currentState, 'after-listed-periods');
  assert.match(after.daeun.summaryLines[0], /이전 기간/);
  assert.match(after.daeun.summaryLines[1], /이번에 계산한 마지막 구간이 지난 뒤/);
  assert.ok(after.daeun.periods.every(period => !period.isCurrent));
});

function smallReport(headline, paragraphs) {
  const overview = () => ({headline, paragraphs:[...paragraphs], cards:[]});
  return {reader:{lifelong:overview(), annual:overview(), months:[]}};
}

test('sentence selection preserves complete long text, decimal values and closing quotes without clipping', () => {
  const lead = '내가 중요하게 여기는 일과 실제로 감당할 수 있는 준비를 충분히 비교한 뒤 다음 선택을 정해요.';
  const action = '준비 시간은 1.5시간으로 적고 “다음에 할 일은 무엇인가요?”라고 물어보세요.';
  const report = attachReadingSummaryLines(smallReport(lead + ' 또 다른 설명이에요.',
    [action + ' 필요한 도움도 물어보세요.']));
  assert.deepEqual(report.reader.lifelong.summaryLines, [lead, action]);
  const quoted = attachReadingSummaryLines(smallReport('“맡을 일을 먼저 정해요.”',
    ['“내가 맡을 범위를 적어 보세요.”']));
  assert.deepEqual(quoted.reader.lifelong.summaryLines,
    ['“맡을 일을 먼저 정해요.”', '“내가 맡을 범위를 적어 보세요.”']);
});

test('quoted and bracketed examples retain their attached conditions after internal sentence endings', () => {
  const lead = '합의한 조건과 경계를 함께 확인해요.';
  for (const action of [
    '‘이 조건이면 끝입니다. 더 하지 마세요.’라고 정한 뒤 확인하세요.',
    '조건(예산은 1.5시간입니다. 추가 작업은 하지 않습니다.)을 정한 뒤 확인하세요.',
    '“조건은 「여기까지입니다. 추가 비용은 없습니다.」라고 적으세요.”라고 말한 뒤 확인하세요.',
    "'Don't add work. Don't extend the deadline.'라고 적은 뒤 서로 확인하세요.",
  ]) {
    const report = attachReadingSummaryLines(smallReport(lead, [action + ' 다음 일은 따로 정하세요.']));
    assert.deepEqual(report.reader.lifelong.summaryLines, [lead, action]);
  }
});

test('a repeated heading falls back to a distinct complete unit from the same authored paragraph', () => {
  const report = attachReadingSummaryLines(smallReport('맡을 일을 나누세요',
    ['맡을 일을 나누세요. 서로 맡은 일을 적어 보세요.']));
  assert.deepEqual(report.reader.lifelong.summaryLines,
    ['맡을 일을 나누세요', '서로 맡은 일을 적어 보세요.']);
});

test('missing source text fails atomically instead of padding with a scope notice or invented advice', () => {
  const report = smallReport('맡을 일을 나누세요', ['서로 맡은 일을 적어 보세요.']);
  report.reader.annual.paragraphs = ['맡을 일을 나누세요.'];
  report.reader.annual.scopeNotice = '이 안내로 요약의 빈자리를 채우면 안 돼요.';
  const before = structuredClone(report);
  assert.throws(() => attachReadingSummaryLines(report), /서로 다른 두 줄 요약/);
  assert.deepEqual(report, before);
  for (const invalid of [null, undefined, {}, {reader:{}}, {reader:{months:[]}}]) {
    assert.throws(() => attachReadingSummaryLines(invalid), /서로 다른 두 줄 요약/);
  }
});
