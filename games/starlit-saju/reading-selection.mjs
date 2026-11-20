// Keep one authored reading for overlapping subjects. These choices affect
// presentation and copy only; calculated facts and score objects stay intact.
const GENERAL_REMOVED=new Set([
  'natal-character','natal-aptitude','natal-life-path','natal-work','natal-cautions','natal-response',
  'annual-response',...Array.from({length:12},(_,index)=>`month-${index+1}-response`),
]);
const PORTRAIT_REMOVED=new Set();
const COMPATIBILITY_PERSON_REMOVED=new Set();
const COMPATIBILITY_REMOVED=new Set(['foundation','connection','differences','everyday']);

export const keepGeneralCard=id=>!GENERAL_REMOVED.has(id);
export const keepPortraitCard=id=>!PORTRAIT_REMOVED.has(id);
export const keepCompatibilityPersonTopic=topicId=>!COMPATIBILITY_PERSON_REMOVED.has(topicId);
export const keepCompatibilityCard=id=>!COMPATIBILITY_REMOVED.has(id);
