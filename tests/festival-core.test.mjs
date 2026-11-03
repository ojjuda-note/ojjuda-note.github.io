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
