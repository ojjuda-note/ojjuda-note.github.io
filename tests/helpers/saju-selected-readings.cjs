// Independent test specification for the readings the user chose to keep.
// Do not import the production selection predicate into expected results.
const removedGeneralCards = new Set([
  'natal-character', 'natal-aptitude', 'natal-life-path', 'natal-work', 'natal-cautions', 'natal-response',
  'annual-response', ...Array.from({length: 12}, (_, index) => `month-${index + 1}-response`),
]);
const removedCompatibilityCards = new Set(['foundation', 'connection', 'differences', 'everyday']);
const retainedCard = item => !removedGeneralCards.has(item.id);

function selectedGeneralUnits(report) {
  return [report.personPortrait, ...report.personPortrait.cards,
    ...report.reader.lifelong.cards.filter(retainedCard),
    report.reader.annual, ...report.reader.annual.cards.filter(retainedCard),
    ...report.reader.months.flatMap(month => [month, ...month.cards.filter(retainedCard)]),
    report.daeun, ...report.daeun.periods.flatMap(period => [period, ...period.topics, ...period.situations]),
    report.reader.symbols, ...report.reader.symbols.items];
}

function excludedGeneralUnits(report) {
  return [report.reader.lifelong,
    ...report.reader.lifelong.cards.filter(item => !retainedCard(item)),
    ...report.reader.annual.cards.filter(item => !retainedCard(item)),
    ...report.reader.months.flatMap(month => month.cards.filter(item => !retainedCard(item))),
    ...report.reader.supplements.lifelong, ...report.reader.supplements.annual,
    ...report.reader.supplements.months.flatMap(month => month.cards),
    report.reader.timings, ...report.reader.timings.items.flatMap(item => [item,
      ...item.cautions, ...item.opportunities, ...item.people, ...item.documents])];
}

function isRemovedGeneralStory(scene) {
  if (scene.kind === 'scope') return false;
  const data = scene.data || {};
  return removedGeneralCards.has(data.readerCard) || Boolean(data.readingSupplement)
    || Boolean(data.adviceId) || Boolean(data.timingKind) || ['legacy-lifelong', 'advice', 'monthly-spotlight', 'timing'].includes(data.readingOverview)
    || scene.source === 'reading-timings' || /^reading-timings-month-/.test(scene.source || '');
}

module.exports = {removedGeneralCards, removedCompatibilityCards, retainedCard,
  selectedGeneralUnits, excludedGeneralUnits, isRemovedGeneralStory};
