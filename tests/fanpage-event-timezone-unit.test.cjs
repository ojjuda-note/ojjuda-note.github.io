// Runs the actual catalog cleaner and event-rendering block without network or a browser.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const dir = path.join(__dirname, '../features/fanpages');
const read = file => fs.readFileSync(path.join(dir, file), 'utf8');
const context = vm.createContext({window:{}, URL, location:{href:'https://fan.test/features/fanpages/artist.html?group=boynextdoor',origin:'https://fan.test',search:'?group=boynextdoor'}, URLSearchParams, document:{getElementById:()=>null}});
for (const file of ['artists.js','artists-extra.js','catalog.js']) vm.runInContext(read(file), context);
const artist = context.window.OJJUDA_FAN_ARTISTS.find(a=>a.id==='boynextdoor');
assert.equal(artist.appearances.find(e=>e.title.includes('시애틀')).timeZone,'America/Los_Angeles', 'catalog preserves venue zone');
artist.appearances.push(...[
 {date:'2026-11-15',title:'Korean default'},
 {date:'2026-11-14',endDate:'2026-11-15',timeZone:'America/Los_Angeles',title:'Local range'},
 {date:'2026-11-15',timeZone:'Invalid/Zone',title:'Invalid fallback'}]);
const source = read('fan.js');
const block = source.slice(source.indexOf('    const now = new Date();'), source.indexOf('    const campaigns = artist.campaigns'));
assert.ok(block.includes('const eventCards'), 'execute actual filtering and rendering');
for (const now of ['2026-11-15T14:59:59Z','2026-11-15T15:00:00Z','2026-11-16T02:30:00Z','2026-11-16T03:30:00Z','2026-11-16T07:59:59Z','2026-11-16T08:00:00Z']) {
 class FixedDate extends Date { constructor(...args) {super(...(args.length?args:[now]));} }
 const result = vm.runInNewContext(block+'\n({events,eventCards})',{artist,Date:FixedDate});
 const seattle = result.events.find(e=>e.title.includes('시애틀'));
 assert.equal(Boolean(seattle),now<'2026-11-16T08:00:00Z',now);
 if(seattle) {assert.equal(seattle.date,'2026-11-15');assert.match(result.eventCards,/<time datetime="2026-11-15"><strong>11\.15<\/strong>/);}
 assert.equal(result.events.some(e=>e.title==='Korean default'),now<'2026-11-15T15:00:00Z');
 assert.equal(result.events.some(e=>e.title==='Invalid fallback'),now<'2026-11-15T15:00:00Z');
 assert.equal(result.events.some(e=>e.title==='Local range'),now<'2026-11-16T08:00:00Z');
 const dates=Array.from(result.events,e=>e.date);assert.deepEqual(dates,[...dates].sort());
}
console.log('PASS: six fixed clocks, actual catalog/filter/render block, Seattle date and local expiry, Seoul default, range, invalid zone and date sort.');

for (const [city, date, zone, seoulMidnight, showtime, lastSecond, localMidnight, displayed] of [
 ['샌프란시스코','2026-11-17','America/Los_Angeles','2026-11-17T15:00:00Z','2026-11-18T03:30:00Z','2026-11-18T07:59:59Z','2026-11-18T08:00:00Z','11.17'],
 ['로스앤젤레스','2026-11-20','America/Los_Angeles','2026-11-20T15:00:00Z','2026-11-21T03:30:00Z','2026-11-21T07:59:59Z','2026-11-21T08:00:00Z','11.20'],
 ['멕시코시티','2026-11-24','America/Mexico_City','2026-11-24T15:00:00Z','2026-11-25T02:00:00Z','2026-11-25T05:59:59Z','2026-11-25T06:00:00Z','11.24'],
]) {
 const event = artist.appearances.find(e=>e.title.endsWith(city));
 assert.ok(event, city);
 assert.equal(event.timeZone, zone, city);
 assert.equal(event.date, date, city);
 for (const now of [seoulMidnight, showtime, lastSecond, localMidnight]) {
  class FixedDate extends Date { constructor(...args) {super(...(args.length?args:[now]));} }
  const result = vm.runInNewContext(block+'\n({events,eventCards})',{artist,Date:FixedDate});
  assert.equal(result.events.some(e=>e.title===event.title),now<localMidnight,`${city} at ${now}`);
  assert.equal(result.eventCards.includes(`<time datetime="${date}"><strong>${displayed}</strong>`),now<localMidnight,`${city} rendered at ${now}`);
 }
}
console.log('PASS: twelve fixed clocks for San Francisco, Los Angeles and Mexico City; keep the local date through showtime and the last second of the venue day.');
