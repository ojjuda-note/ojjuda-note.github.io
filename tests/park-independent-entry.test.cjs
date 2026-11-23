const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const world=read('world.html'),park=read('park/index.html');
const route=read('park/route.js');
const marker='<script>\n// Old Park URLs';
const start=world.indexOf(marker),end=world.indexOf('</script>',start);
assert.ok(start>=0&&end>start,'old Park links redirect in the head before Agit scripts');

function redirected(source,script){
  let target=null;const url=new URL(source,'https://fixture.test');
  const location={href:url.href,origin:url.origin,replace:next=>{target=next;}};
  const scope={URL,location};scope.window=scope;scope.parent=scope;
  vm.runInNewContext(script,scope);
  return target;
}

test('World bookmarks enter standalone Park before loading the large Agit application',()=>{
  const code=world.slice(start+8,end);
  for(const [src,dest] of [
    ['/world.html?place=park','/park/'],
    ['/world.html?tab=park&card=123&keep=memo','/park/?card=123&keep=memo'],
    ['/world.html?place=park&view=glasses','/park/glasses.html'],
    ['/world.html?place=park&compose=memo','/park/?compose=memo']
  ]) assert.equal(redirected(src,code),'https://fixture.test'+dest);
  for(const src of ['/world.html?tab=hub','/world.html?tab=park&game=chess',
    '/world.html?place=park&admin=cards','/world.html?tab=arcade'])
    assert.equal(redirected(src,code),null,'unrelated or privileged route stays intact');
  assert.ok(start<world.indexOf('/shared/diagnostics/diagnostics.js'),
    'old bookmark is rerouted before feature code arrives');
});

test('Park and Note legacy entry files do not bounce back into World',()=>{
  for(const src of ['/park/','/park/?compose=memo','/park/index.html?card=123'])
    assert.equal(redirected(src,route),null);
  assert.equal(redirected('/note/?card=123&keep=memo',route),
    'https://fixture.test/park/?card=123&keep=memo');
  assert.equal(redirected('/note/?utm_source=other&utm_campaign=social',route),
    'https://fixture.test/park/?utm_source=other&utm_campaign=social');
  assert.equal(redirected('/note/glasses.html',route),
    'https://fixture.test/park/glasses.html');
});

test('direct Park removes secret callback parameters without redirecting to World',()=>{
  const url=new URL('https://fixture.test/park/?card=abc&access_token=secret&refresh_token=secret#reply');
  let replaced=null;
  const scope={URL,location:{href:url.href,origin:url.origin,replace(){throw Error('no redirect');}}};
  scope.window=scope;scope.parent=scope;
  scope.history={state:{original:true},replaceState(_state,_title,path){replaced=path;}};
  vm.runInNewContext(route,scope);
  assert.equal(replaced,'/park/?card=abc#reply');
});

test('standalone keeps its navigation, old embedded iframe still hides duplicate chrome',()=>{
  const css=read('park/embedded.css');
  assert.match(park,/dataset\.parkEmbedded = 'true'/);
  assert.match(css,/html\[data-park-embedded\] body \.shell \.bottomnav/);
  assert.match(css,/html\[data-park-embedded\] body #note-my-screen/);
  assert.doesNotMatch(css,/html body #note-my-screen \{ display: none !important/);
  assert.match(park,/<nav class="bottomnav"/);
  assert.match(park,/href="\/park\/"/);
  const manifest=JSON.parse(read('park/manifest.webmanifest'));
  assert.equal(manifest.id,'/world.html?place=park','installed members keep original app identity');
  assert.equal(manifest.start_url,'/park/','installed Park no longer loads Agit');
  assert.match(read('shared/brand/service-banners.js'),/href: '\/park\/'/);
  assert.doesNotMatch(read('shared/brand/service-banners.js'),/link\.dataset\.act = 'agit-park'/);
  assert.match(world,/function Wf\(t\)\{return `<a class="note-link/);
});