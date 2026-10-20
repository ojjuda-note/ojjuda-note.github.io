const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'world-themes.js'),'utf8');
const dom=new JSDOM('<div data-world-theme-settings></div><p data-theme-greeting></p><p data-theme-status></p><textarea id="draft"></textarea>',{url:'https://ojjuda.kr',runScripts:'outside-only'});
const w=dom.window;
try{
 w.localStorage.setItem('ojjuda-world-theme-v1','summer');
 let now=Date.parse('2026-10-08T14:59:59Z'),scheduled,delay;const RealDate=w.Date;w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};w.setTimeout=(callback,ms)=>{scheduled=callback;delay=ms;return 1;};w.clearTimeout=()=>{};
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
 assert.equal(at('2026-12-25','summer'),'christmas','legacy manual argument cannot override the calendar');
 assert.equal(w.document.querySelectorAll('button[data-world-theme]').length,0);
 assert.equal(t.choose,undefined);assert.equal(t.getMode(),'auto');assert.equal(t.getCurrent(),'autumn');
 assert.equal(w.localStorage.getItem('ojjuda-world-theme-v1'),null,'old manual choice removed');
 const draft=w.document.getElementById('draft');draft.value='작성 중인 내용';
 assert.ok(delay>=1000&&delay<=1200,'next Korean midnight is scheduled');
 now=Date.parse('2026-10-08T15:00:01Z');scheduled();assert.equal(t.getCurrent(),'hangeul');
 assert.equal(w.document.documentElement.dataset.worldTheme,'hangeul');assert.equal(draft.value,'작성 중인 내용');assert.equal(w.document.getElementById('draft'),draft);
 now=Date.parse('2026-10-09T15:00:01Z');w.dispatchEvent(new w.Event('pageshow'));assert.equal(t.getCurrent(),'autumn','resuming a suspended tab recalculates its date');
 w.localStorage.setItem('ojjuda-world-theme-v1','summer');t.sync();assert.equal(t.getCurrent(),'autumn','later legacy storage is ignored');
 for(const key of t.order){assert.ok(fs.existsSync(path.join(root,'assets/design',key==='classic'?'welcome.svg':'themes/'+key+'.svg')),key+' has its own artwork');}
 assert.equal(t.scheduleFor(2027).find(e=>e.key==='buddha').date,'2027-05-13');
 console.log('PASS: all 19 designs, KST midnight, lunar holidays through 2050, holiday priority, season fallback, automatic-only mode, legacy choice ignored, midnight and resume updates and draft preservation');
}finally{dom.window.close();}
