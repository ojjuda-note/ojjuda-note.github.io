const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'world-themes.js'),'utf8');
const dom=new JSDOM('<div data-world-theme-settings></div><p data-theme-greeting></p><p data-theme-status></p><textarea id="draft"></textarea>',{url:'https://ojjuda.kr',runScripts:'outside-only'});
const w=dom.window;
try{
 w.eval(source);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 const t=w.OjjudaThemes,at=(d,m='auto')=>t.resolve(d+'T03:00:00Z',m);
 assert.equal(t.order.length,19);
 const dates={'2026-01-01':'newyear','2026-02-14':'valentine','2026-03-14':'white','2026-05-05':'children','2026-05-08':'parents','2026-05-15':'teachers','2026-08-15':'liberation','2026-10-09':'hangeul','2026-10-31':'halloween','2026-11-11':'pepero','2026-12-25':'christmas','2026-02-16':'seollal','2026-02-17':'seollal','2026-02-18':'seollal','2026-05-24':'buddha','2026-09-24':'chuseok','2026-09-25':'chuseok','2026-09-26':'chuseok','2027-02-07':'seollal','2027-05-13':'buddha','2027-09-15':'chuseok','2050-05-28':'buddha'};
 for(const [date,key] of Object.entries(dates))assert.equal(at(date),key,date);
 for(const [date,key] of [['2026-02-19','winter'],['2026-03-01','spring'],['2026-06-01','summer'],['2026-09-01','autumn'],['2026-12-01','winter'],['2026-12-26','winter'],['2026-10-10','autumn']])assert.equal(at(date),key,date+' reverts to season');
 assert.equal(t.resolve('2026-10-08T14:59:59.999Z'),'autumn');
 assert.equal(t.resolve('2026-10-08T15:00:00.000Z'),'hangeul');
 assert.equal(t.resolve('2026-10-09T15:00:00.000Z'),'autumn');
 assert.equal(t.eventsOn('2028-10-03T03:00:00Z')[0],'chuseok');
 assert.equal(at('2026-12-25','summer'),'summer','manual selection beats calendar');
 assert.equal(at('2026-12-25','__proto__'),'christmas','invalid storage cannot select prototype keys');
 assert.equal(at('2026-02-17','classic'),'classic','automatic application can be disabled');
 assert.equal(w.document.querySelectorAll('button[data-world-theme]').length,19);
 const draft=w.document.getElementById('draft');draft.value='작성 중인 내용';
 w.document.querySelector('[data-world-theme=summer]').click();
 assert.equal(t.getMode(),'summer');assert.equal(w.document.documentElement.dataset.worldTheme,'summer');assert.equal(draft.value,'작성 중인 내용');assert.equal(w.document.getElementById('draft'),draft,'theme change preserves DOM');
 assert.equal(w.localStorage.getItem('ojjuda-world-theme-v1'),'summer');
 const check=w.document.querySelector('[data-theme-auto]');check.checked=true;check.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(t.getMode(),'auto');
 t.choose('christmas');w.localStorage.setItem('ojjuda-world-theme-v1','spring');w.dispatchEvent(new w.StorageEvent('storage',{key:'ojjuda-world-theme-v1'}));assert.equal(t.getCurrent(),'spring','other tabs synchronize');
 assert.equal(t.choose('not-a-theme'),false);
 for(const key of t.order){assert.ok(fs.existsSync(path.join(root,'assets/design',key==='classic'?'welcome.svg':'themes/'+key+'.svg')),key+' has its own artwork');}
 assert.equal(t.scheduleFor(2027).find(e=>e.key==='buddha').date,'2027-05-13');
 console.log('PASS: all 19 designs, KST midnight, lunar holidays through 2050, holiday priority, season fallback, manual mode, persistent selection, cross-tab sync and draft preservation');
}finally{dom.window.close();}
