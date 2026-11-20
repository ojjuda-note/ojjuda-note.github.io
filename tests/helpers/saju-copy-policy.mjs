// Independent expectations for the user's chosen representative readings.
// These lists do not import the production selection predicates.
const removedCards=new Set([
  'natal-character','natal-aptitude','natal-life-path','natal-work','natal-cautions','natal-response',
  'annual-response',...Array.from({length:12},(_,index)=>`month-${index+1}-response`),
]);
export const expectedGeneralCard=id=>!removedCards.has(id);
const selectedCards=overview=>overview.cards.filter(card=>expectedGeneralCard(card.id));
export const authoredCopyBody=item=>(item.detailSections
  ?item.detailSections.flatMap(section=>[section.title,...section.paragraphs]):item.paragraphs||[]).join('\n');

export function expectedGeneralCopyGroups(report) {
  const reader=report.reader;
  return {
    lifelong:[report.personPortrait,...report.personPortrait.cards,...selectedCards(reader.lifelong),
      ...(report.daeun?[report.daeun,...report.daeun.periods.flatMap(period=>[period,...period.topics,...(period.situations||[])])]:[]),
      reader.symbols,...reader.symbols.items],
    annual:[reader.annual,...selectedCards(reader.annual)],
    monthly:reader.months.flatMap(month=>[month,...selectedCards(month)]),
  };
}
