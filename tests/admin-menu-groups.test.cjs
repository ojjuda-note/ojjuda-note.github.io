const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

const browser=new JSDOM('<div id="host"></div><main id="working-editor">작성 중인 내용</main>',{
  url:'https://ojjuda.kr/world.html',runScripts:'outside-only'
});
const {window}=browser;
window.eval(read('admin/service-scope.js'));
window.eval(read('admin/navigation.js'));
const nav=window.OjjudaAdminNavigation;
assert.equal(nav.GROUPS.length,5,'one task-oriented menu per management group');
assert.deepEqual(Array.from(nav.GROUPS,group=>group.label),
  ['운영 현황','회원·ZU','콘텐츠 관리','신고·안전','운영·보관']);
const actual=nav.GROUPS.flatMap(group=>group.items.map(([area,tab])=>`${area}:${tab}`));
assert.equal(new Set(actual).size,actual.length,'no duplicate functional locations');
for(const [area,tabs] of Object.entries({
  account:['overview','visitors','users','suspended','referrals'],
  content:['cards','messages','pajang-answers','pajang-chats','groups','photo-stages','drinking-prompts','risk','map'],
  trash:['trash-all','trash-accounts','trash-cards','trash-messages','trash-other'],
  support:['reports','feedback','note-users'],
  payment:['settings','users'],
  operations:['notice','spam','words','connections','errors','activity'],
  library:['assets']
}))for(const tab of tabs)assert.ok(actual.includes(`${area}:${tab}`),`keep ${area}/${tab}`);
assert.equal(nav.activeGroup('payment','users'),'members');
assert.equal(nav.activeGroup('account','users'),'members');
assert.equal(nav.activeGroup('content','risk'),'safety');
assert.equal(nav.activeGroup('trash','trash-accounts'),'members');

const summary={reports_open:5,feedback_open:2,errors_24h:1};
const host=window.document.getElementById('host');
host.innerHTML=nav.render({area:'account',tab:'overview',summary});
const counts={};
host.querySelectorAll('[data-admin-count]').forEach(badge=>{counts[badge.dataset.adminCount]=badge.textContent});
assert.equal(counts['support:reports'],'5');
assert.equal(counts['support:feedback'],'2');
assert.equal(counts['operations:errors'],'1');
assert.match(host.textContent,/상품권 등록/);
assert.match(host.textContent,/원고실/);

assert.equal(host.querySelectorAll('[data-admin-folder]').length,6,'all five folders and the full index stay visible');
assert.deepEqual([...host.querySelectorAll('.adm-menu-group:not([hidden])')].map(e=>e.dataset.group),['status']);
nav.selectFolder(host.querySelector('[data-admin-folder="content"]'));
assert.deepEqual([...host.querySelectorAll('.adm-menu-group:not([hidden])')].map(e=>e.dataset.group),['content']);
assert.equal(host.querySelector('[data-admin-folder="content"]').getAttribute('aria-pressed'),'true');
nav.selectFolder(host.querySelector('[data-admin-folder="all"]'));
assert.equal(host.querySelectorAll('.adm-menu-group:not([hidden])').length,5,'full folder view shows all five sections');
const search=host.querySelector('[data-admin-search]');
search.value='포토땅';nav.filter(search);
assert.deepEqual([...host.querySelectorAll('.adm-menu-group:not([hidden])')].map(e=>e.dataset.group),['content']);
assert.equal(host.querySelectorAll('.adm-menu-item:not([hidden]) .adm-menu-link[data-v="photo-stages"]').length,1);
search.value='';nav.filter(search);
assert.equal(host.querySelectorAll('.adm-menu-group:not([hidden])').length,5);

assert.equal(nav.togglePin('account','visitors'),true);
nav.replaceNav({area:'payment',tab:'users',summary});
assert.equal(host.querySelectorAll('.adm-menu-favorites [data-v="visitors"]').length,2,'pin is a row with a link and its star');
assert.equal(host.querySelector('.adm-menu-link[aria-current="page"]').dataset.area,'payment');
assert.equal(window.document.getElementById('working-editor').textContent,'작성 중인 내용','pin refresh never resets an editor');
assert.equal(nav.togglePin('account','not-real'),false,'unknown menu keys cannot be persisted');
assert.deepEqual(JSON.parse(window.localStorage.getItem('ojjuda.world.admin-favorites-v1')),['account:visitors']);
const searchAfterPin=host.querySelector('[data-admin-search]');
searchAfterPin.value='가입자';nav.filter(searchAfterPin);
nav.replaceNav({area:'content',tab:'cards',summary});
assert.equal(host.querySelector('[data-admin-search]').value,'','changing pages clears stale search filters');
assert.match(read('world.html'),/admin\/navigation\.js\?v=/);
assert.match(read('world.html'),/wrapAdminLayout\(y0\(\)\)/);
assert.match(read('admin/navigation.css'),/\.adm-folder-tabs\{display:grid/,'folder tabs remain visible');
assert.ok(!host.querySelector('details'),'navigation does not depend on collapsed groups');

// Global favorites may remember another service, but only the current service's
// dedicated entries and the same shared entries may be rendered or searched.
for(const tab of ['messages','cards','pajang-answers'])assert.equal(nav.togglePin('content',tab),true);
const scope=window.OjjudaAdminScope;
const commonKeys=Array.from(actual.filter(key=>scope.common.includes(key.split(':')[1]))).sort();
for(const service of ['agit','park','pajang']){
  const home=scope.services[service].home,area=service==='agit'?'account':'content';
  host.innerHTML=nav.render({service,area,tab:home,summary});
  assert.equal(host.querySelector('.adm-navigation').dataset.service,service);
  assert.equal(host.querySelector('[data-admin-folder="content"] span').textContent,scope.services[service].label+' 관리');
  const items=[...host.querySelectorAll('.adm-menu-groups [data-act="adm-open"]')];
  for(const item of items)assert.equal(scope.allows(service,item.dataset.v),true,`${service} never renders ${item.dataset.v}`);
  assert.deepEqual(items.filter(item=>scope.common.includes(item.dataset.v)).map(item=>`${item.dataset.area}:${item.dataset.v}`).sort(),commonKeys,'shared entries retain identical registry destinations in every service');
  assert.equal(host.querySelectorAll('.adm-menu-favorites [data-v="visitors"]').length,2,'a common favorite remains available');
  for(const [owner,tab,label] of [['agit','messages','쪽지 관리'],['park','cards','카드'],['pajang','pajang-answers','파장 답변 관리']]){
    const links=host.querySelectorAll(`.adm-menu-favorites .adm-menu-link[data-v="${tab}"]`);
    assert.equal(links.length,owner===service?1:0,'foreign service favorites stay absent');
    const input=host.querySelector('[data-admin-search]');input.value=label;nav.filter(input);
    const matches=host.querySelectorAll(`.adm-menu-item:not([hidden]) .adm-menu-link[data-v="${tab}"]`);
    assert.equal(matches.length,owner===service?2:0,'search cannot reveal another service through menus or favorites');
    if(owner!==service)assert.equal(host.querySelector(`.adm-menu-link[data-v="${tab}"]`),null);
  }
}
const persisted=window.localStorage.getItem('ojjuda.world.admin-favorites-v1');
window.eval(read('admin/navigation.js'));
host.innerHTML=window.OjjudaAdminNavigation.render({service:'pajang',area:'content',tab:'pajang-answers',summary});
assert.equal(window.localStorage.getItem('ojjuda.world.admin-favorites-v1'),persisted,'changing service never deletes another service’s favorites');
assert.equal(host.querySelector('.adm-menu-favorites [data-v="cards"]'),null,'saved favorites remain scoped after reload');
assert.equal(host.querySelector('.adm-menu-favorites [data-v="messages"]'),null);
assert.ok(host.querySelector('.adm-menu-favorites [data-v="pajang-answers"]'));
window.close();
console.log('PASS: admin folders, service separation, shared destinations, scoped search/favorites, badges and editor preservation');
