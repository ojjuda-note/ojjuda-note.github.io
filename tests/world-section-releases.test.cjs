const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'world.html'),'utf8');
const slice=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)));
const source=[
  slice('function worldMainTab()', '// The Agit hub'),
  slice('var Go="','var ce='),
  slice('function sectionUpdateMarkup()', 'function Zg()'),
  slice('const sectionChecks=', 'var O1=')
].join('\n');

function fixture(){
  const dom=new JSDOM('<main class="main"><textarea></textarea><div data-game-friend-invite-slot></div></main>');
  dom.window.document.body.id='app';
  const requests=[],routes=[];
  const c=vm.createContext({URL,Date,document:dom.window.document,w:String,g:{tab:'hub'},
    location:{href:'https://ojjuda.kr/world.html?tab=hub',replace:url=>routes.push(new URL(url))},
    worldParkNotes:{canLeave:()=>true},
    fetch:(url,options)=>new Promise(resolve=>requests.push({url,options,reply:body=>resolve({ok:true,json:async()=>body})}))});
  vm.runInContext(source,c);
  function enter(id){
    c.g.tab=['park','arcade'].includes(id)?'place':id;
    c.g.place=c.g.tab==='place'?{id}:null;
    c.enterReleaseSection();
    c.showSectionUpdate();
  }
  return {c,requests,routes,enter,document:dom.window.document};
}
test('installed versions match three independent release files and appear in settings',()=>{
  const {c}=fixture();
  const sections=vm.runInContext('sectionReleases',c);
  for(const [id,manifest] of Object.entries({hub:'/version.json',arcade:'/features/arcade/version.json',park:'/park/version.json'})){
    assert.equal(sections[id].manifest,manifest);
    const published=JSON.parse(fs.readFileSync(path.join(root,manifest),'utf8')).version;
    assert.equal(sections[id].version,published);
  }
  assert.ok(html.includes('data-section-versions><h3>버전 정보</h3>'));
});
test('late checks stay with their section, preserve drafts and do not change installed versions',async()=>{
  const {c,requests,enter,document}=fixture();
  const text=document.querySelector('textarea');text.value='작성 중';
  enter('hub');const hub=c.checkSectionRelease();
  enter('arcade');const arcade=c.checkSectionRelease();
  enter('park');const park=c.checkSectionRelease();
  assert.deepEqual(requests.map(r=>r.url.split('?')[0]),['/version.json','/features/arcade/version.json','/park/version.json']);
  assert.ok(requests.every(r=>r.options.cache==='no-store'));
  requests[1].reply({version:'8.0.0'});await arcade;
  requests[0].reply({version:'9.0.0-beta'});await hub;
  assert.equal(document.querySelector('[data-section-update]'),null);
  const installed=c.installedSectionVersion();requests[2].reply({version:installed});await park;
  enter('arcade');assert.match(document.querySelector('[data-section-update]').textContent,/오락실 8\.0\.0/);
  assert.notEqual(c.installedSectionVersion(),'8.0.0');
  assert.equal(document.querySelector('textarea'),text);assert.equal(text.value,'작성 중');
  enter('my');assert.match(document.querySelector('[data-section-update]').textContent,/아지트 9\.0\.0-beta/);
  assert.equal(requests.length,3);
  enter('park');assert.equal(document.querySelector('[data-section-update]'),null);
});
test('applying a Park update keeps the Park route and respects an unfinished edit',async()=>{
  const {c,requests,routes,enter}=fixture();
  c.location.href='https://ojjuda.kr/world.html?tab=arcade&game=yut&card=12#saved';
  enter('park');
  const done=c.checkSectionRelease();requests[0].reply({version:'7.0.0'});await done;
  c.worldParkNotes.canLeave=()=>false;c.I1();assert.equal(routes.length,0);
  c.worldParkNotes.canLeave=()=>true;c.I1();
  assert.equal(routes[0].searchParams.get('tab'),'park');
  assert.equal(routes[0].searchParams.get('place'),'park');
  assert.equal(routes[0].searchParams.get('game'),null);
  assert.equal(routes[0].searchParams.get('card'),'12');
  assert.equal(routes[0].hash,'#saved');
});
test('release checks respect prerelease ordering and ignore malformed responses',()=>{
 const {c}=fixture();
 for(const [next,current,answer] of [
  ['0.67.0-beta','0.66.1-beta',true],['1.2.0','1.2.0-beta',true],
  ['1.2.0-beta.11','1.2.0-beta.9',true],['1.2.0-alpha','1.2.0',false],
  ['1.2.0+build.4','1.2.0',false],[['1.2.0'],'1.0.0',null],['<bad>','1.0.0',null]
 ])assert.equal(c.newerSectionVersion(next,current),answer);
});
test('publishing a Park-only bump stamps just the Park version into the shell',t=>{
 const temp=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'ojjuda-sections-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 for(const file of ['version.json','features/arcade/version.json','park/version.json','world.html']){
  fs.mkdirSync(path.dirname(path.join(temp,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(temp,file));
 }
 const {execFileSync}=require('node:child_process');
 const stamp=()=>execFileSync(process.execPath,[path.join(root,'scripts/sync-section-versions.mjs'),temp]);
 stamp();assert.equal(fs.readFileSync(path.join(temp,'world.html'),'utf8'),html);
 fs.writeFileSync(path.join(temp,'park/version.json'),'{"version":"25.1.8"}');stamp();
 assert.equal(fs.readFileSync(path.join(temp,'world.html'),'utf8'),html.replace(/(park:\{name:'공원',version:')[^']+/,(_,prefix)=>prefix+'25.1.8'));
});
