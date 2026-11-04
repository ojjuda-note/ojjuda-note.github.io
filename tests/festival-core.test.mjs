import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
const source=await readFile(new URL('../games/festival-schedule/core.js',import.meta.url),'utf8');
const core=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const today='2026-11-03';
const fixture=[
 {id:'busan-local',title:'부산 테스트 축제',category:'local',region:'부산',start:'2026-11-07',end:'2026-11-08',status:'scheduled'},
 {id:'seoul-film',title:'서울 테스트 영화제',category:'film',region:'서울',start:'2026-11-25',end:'2026-12-04',status:'scheduled'},
 {id:'past-campus',title:'가을 대학축제',category:'campus',region:'대전',start:'2026-10-28',end:'2026-10-29',status:'scheduled'},
 {id:'ongoing',title:'진행 축제',category:'local',region:'서울',start:'2026-10-30',end:'2026-11-08',status:'scheduled'}
];
const undecided={
 id:'planned-local',title:'태백 미정 축제',category:'local',region:'강원',
 start:null,end:null,dateStatus:'undecided',dateNote:'2027년 1~2월 중 개최 계획',status:'scheduled'
};
test('Korean midnight is independent of host timezone',()=>{
 assert.equal(core.todayKST(new Date('2026-11-02T14:59:59Z')),'2026-11-02');
 assert.equal(core.todayKST(new Date('2026-11-02T15:00:00Z')),today);
});
test('date arithmetic includes leap days and year boundaries',()=>{
 assert.equal(core.addDays('2024-02-28',1),'2024-02-29');
 assert.equal(core.addDays('2026-12-31',1),'2027-01-01');
 assert.deepEqual(core.monthRange(2024,1),{start:'2024-02-01',end:'2024-02-29'});
 assert.throws(()=>core.parseDate('2026-02-29'),RangeError);
});
test('weekend filters include the current weekend on Sunday',()=>{
 for(const day of ['2026-11-03','2026-11-07','2026-11-08'])assert.deepEqual(core.periodRange('weekend',day),{start:'2026-11-07',end:'2026-11-08'});
 assert.deepEqual(core.periodRange('weekend','2026-11-09'),{start:'2026-11-14',end:'2026-11-15'});
});
test('multi-day events appear at both inclusive endpoints',()=>{
 assert.equal(core.overlaps(fixture[3],'2026-10-30','2026-10-30'),true);
 assert.equal(core.overlaps(fixture[3],'2026-11-08','2026-11-08'),true);
 assert.equal(core.overlaps(fixture[3],'2026-11-09','2026-11-09'),false);
});
test('cancellations and postponements override published dates',()=>{
 assert.equal(core.eventStatus({...fixture[0],status:'cancelled'},today),'cancelled');
 assert.equal(core.eventStatus({...fixture[0],status:'postponed'},today),'postponed');
 assert.equal(core.eventStatus(fixture[0],today),'upcoming');
 assert.equal(core.eventStatus(fixture[3],today),'ongoing');
 assert.equal(core.eventStatus(fixture[2],today),'ended');
});
test('shared filters intersect dates, category, region, query and favorites',()=>{
 const before=JSON.stringify(fixture);
 const result=core.filterEvents(fixture,{today,period:'weekend',region:'부산',category:'local',query:'부산 축제',savedOnly:true,saved:new Set(['busan-local']),selectedDate:'2026-11-07'});
 assert.deepEqual(result.map(e=>e.id),['busan-local']);
 assert.equal(core.filterEvents(fixture,{today,category:'campus'}).length,0);
 assert.equal(core.filterEvents(fixture,{today,category:'campus',period:'all'}).length,1);
 for(const opts of [
  {period:'custom',from:'2026-12-01',to:'2026-11-01'},
  {period:'upcoming',selectedDate:'2026-10-30'},
  {period:'weekend',selectedDate:'2026-11-06'}
 ])assert.equal(core.filterEvents(fixture,{today,...opts}).length,0);
 assert.equal(JSON.stringify(fixture),before);
});
test('undecided dates require an explicit status, null dates and a meaningful official plan',()=>{
 assert.equal(core.isDateUndecided(undecided),true);
 assert.equal(core.hasEventDates(undecided),false);
 assert.equal(core.hasEventDates(fixture[0]),true);
 assert.equal(core.hasEventDates({...fixture[0],dateStatus:'confirmed'}),true);
 const invalid=[
  null,{},
  {...undecided,dateStatus:undefined},
  {...undecided,dateNote:''},
  {...undecided,dateNote:'   '},
  {...undecided,dateNote:2027},
  {...undecided,start:undefined},
  {...undecided,start:'2027-01-01',end:'2027-01-09'},
  {...fixture[0],end:null},
  {...fixture[0],end:'2026-11-06'},
  {...fixture[0],start:'2026-02-29'},
  {...fixture[0],dateStatus:'unknown'}
 ];
 for(const event of invalid){
  assert.equal(core.isDateUndecided(event),false);
  assert.equal(core.hasEventDates(event),false);
  assert.equal(core.overlaps(event,'2026-01-01','2027-12-31'),false);
 }
 assert.deepEqual(core.filterEvents(invalid,{today,period:'all'}),[]);
 assert.throws(()=>core.eventStatus({start:null,end:null},today),RangeError);
});
test('undecided plans appear in upcoming, all and their own filter but never in date-bound results',()=>{
 const events=[...fixture,undecided];
 for(const period of ['upcoming','all','undecided']){
  assert.ok(core.filterEvents(events,{today,period}).some(event=>event.id===undecided.id));
 }
 assert.deepEqual(core.filterEvents(events,{today,period:'undecided'}).map(event=>event.id),[undecided.id]);
 for(const options of [
  {period:'weekend'},
  {period:'month'},
  {period:'custom'},
  {period:'custom',from:'2027-01-01',to:'2027-02-28'},
  {period:'all',selectedDate:'2027-01-15'},
  {period:'upcoming',selectedDate:'2027-01-15'},
  {period:'undecided',selectedDate:'2027-01-15'}
 ])assert.equal(core.filterEvents(events,{today,...options}).some(event=>event.id===undecided.id),false);
 assert.equal(core.overlaps(undecided,'2027-01-01','2027-02-28'),false);
 assert.deepEqual(core.filterEvents(events,{
  today,period:'undecided',query:'2027 태백',category:'local',region:'강원',savedOnly:true,saved:[undecided.id]
 }).map(event=>event.id),[undecided.id]);
 assert.deepEqual(core.filterEvents(events,{today,period:'undecided',category:'campus'}),[]);
 assert.deepEqual(core.filterEvents(events,{today,period:'undecided',savedOnly:true,saved:[]}),[]);
});
test('date sorting places published future dates before undecided plans and past editions last',()=>{
 const events=[undecided,...fixture],before=JSON.stringify(events);
 assert.deepEqual(core.filterEvents(events,{today,period:'all'}).map(event=>event.id),[
  'ongoing','busan-local','seoul-film','planned-local','past-campus'
 ]);
 assert.deepEqual(core.filterEvents(events,{today,period:'all',sort:'name'}).map(event=>event.id),[
  'past-campus','busan-local','seoul-film','ongoing','planned-local'
 ]);
 assert.deepEqual(core.filterEvents(events,{today,period:'all',sort:'region'}).map(event=>event.id),[
  'planned-local','past-campus','busan-local','ongoing','seoul-film'
 ]);
 assert.equal(JSON.stringify(events),before);
});
test('undecided status and display preserve explicit cancellation or postponement',()=>{
 assert.equal(core.eventStatus(undecided,today),'undecided');
 assert.equal(core.eventStatus({...undecided,status:'cancelled'},today),'cancelled');
 assert.equal(core.eventStatus({...undecided,status:'postponed'},today),'postponed');
 assert.equal(core.formatRange(undecided),'2027년 1~2월 중 개최 계획 · 날짜 미정');
 assert.equal(core.formatRange('2026-11-03'),'2026년 11월 3일');
 assert.equal(core.formatRange(fixture[0]),'2026년 11월 7일 ~ 8일');
 assert.throws(()=>core.createICS(undecided),{name:'RangeError',message:/before its dates are confirmed/});
 assert.throws(()=>core.createICS({...undecided,start:'2027-01-01',end:'2027-01-09'}),RangeError);
});
test('confirming or changing an official schedule keeps saved IDs and enables exact calendar dates',()=>{
 const saved=new Set([undecided.id]);
 const confirmed={...undecided,dateStatus:'confirmed',start:'2027-01-23',end:'2027-01-31'};
 const moved={...confirmed,start:'2027-02-06',end:'2027-02-14'};
 assert.equal(core.hasEventDates(confirmed),true);
 assert.equal(core.isDateUndecided(confirmed),false);
 assert.equal(core.eventStatus(confirmed,today),'upcoming');
 assert.equal(core.eventStatus(confirmed,'2027-01-25'),'ongoing');
 assert.equal(core.eventStatus(confirmed,'2027-02-01'),'ended');
 assert.equal(core.filterEvents([confirmed],{today,period:'undecided'}).length,0);
 assert.equal(core.filterEvents([confirmed],{today,period:'custom',from:'2027-01-01',to:'2027-01-31',savedOnly:true,saved}).length,1);
 assert.equal(core.filterEvents([moved],{today,period:'custom',from:'2027-01-01',to:'2027-01-31',savedOnly:true,saved}).length,0);
 assert.equal(core.filterEvents([moved],{today,period:'custom',from:'2027-02-01',to:'2027-02-28',savedOnly:true,saved}).length,1);
 assert.equal(core.overlaps(confirmed,'2027-01-31','2027-01-31'),true);
 assert.equal(core.overlaps(moved,'2027-01-31','2027-01-31'),false);
 for(const event of [confirmed,moved]){
  const ics=core.createICS(event,{now:'2026-11-03T04:00:00Z'}).replace(/\r\n[ \t]/g,'');
  assert.match(ics,/UID:festival-planned-local@ojjuda\.kr\r\n/);
  assert.ok(ics.includes(`DTSTART;VALUE=DATE:${event.start.replaceAll('-','')}\r\n`));
  assert.ok(ics.includes(`DTEND;VALUE=DATE:${core.addDays(event.end,1).replaceAll('-','')}\r\n`));
 }
});
test('ICS uses next-day DTEND for an inclusive multi-day festival',()=>{
 const ics=core.createICS(fixture[1],{now:'2026-11-03T04:00:00Z'}).replace(/\r\n[ \t]/g,'');
 assert.match(ics,/UID:festival-seoul-film@ojjuda\.kr\r\n/);
 assert.match(ics,/DTSTART;VALUE=DATE:20261125\r\n/);
 assert.match(ics,/DTEND;VALUE=DATE:20261205\r\n/);
 assert.match(ics,/DTSTAMP:20261103T040000Z\r\n/);
});
test('ICS escapes newlines and folds without splitting Korean text',()=>{
 const event={...fixture[0],status:'cancelled',title:'한글 축제 🎉 '.repeat(15)+', 세미콜론; 백슬래시\\\n새 줄',summary:'줄1\r\nBEGIN:VEVENT\r줄3, 쉼표;'};
 const ics=core.createICS(event,{now:'2026-11-03T04:00:00Z'}),unfolded=ics.replace(/\r\n[ \t]/g,'');
 assert.ok(ics.endsWith('\r\n'));
 assert.equal(ics.replaceAll('\r\n','').includes('\n'),false);
 assert.ok(ics.split('\r\n').every(line=>Buffer.byteLength(line,'utf8')<=75));
 assert.match(unfolded,/STATUS:CANCELLED\r\n/);
 assert.match(unfolded,/\\, 세미콜론\\; 백슬래시\\\\\\n새 줄/);
 assert.equal(unfolded.split('\r\n').filter(line=>line==='BEGIN:VEVENT').length,1);
 assert.ok(unfolded.includes('🎉'));
});

// The fireworks category is independent of local festivals and shares the same calendar filters.
test('fireworks and lights category filters independently with correct date boundaries',()=>{
  const paju={id:'paju-lights',title:'운정 불빛정원',category:'fireworks',region:'경기',start:'2026-10-31',end:'2026-12-31',status:'scheduled',tags:['빛축제']};
  const yeosu={id:'yeosu-media',title:'여수 미디어아트',category:'fireworks',region:'전남',start:'2026-10-09',end:'2026-11-08',status:'scheduled'};
  const local={id:'seosan-flowers',title:'서산국화축제',category:'local',region:'충남',start:'2026-11-06',end:'2026-11-15',status:'scheduled'};
  const events=[paju,yeosu,local];
  assert.equal(core.CATEGORIES.fireworks.label,'불꽃·불빛');
  assert.deepEqual(core.filterEvents(events,{today:'2026-11-04',category:'fireworks',region:'경기'}).map(e=>e.id),[paju.id]);
  assert.deepEqual(core.filterEvents(events,{today:'2026-11-04',category:'fireworks',period:'custom',from:'2026-11-14',to:'2026-11-14'}).map(e=>e.id),[paju.id]);
  assert.deepEqual(core.filterEvents(events,{today:'2026-11-04',category:'local'}).map(e=>e.id),[local.id]);
  assert.equal(core.filterEvents(events,{today:'2027-01-01',category:'fireworks'}).length,0);
});
