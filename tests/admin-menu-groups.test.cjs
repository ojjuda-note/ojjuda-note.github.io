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
window.eval(read('admin/navigation.js'));
const nav=window.OjjudaAdminNavigation;
assert.equal(nav.GROUPS.length,5,'one task-oriented menu per management group');
assert.deepEqual(Array.from(nav.GROUPS,group=>group.label),
  ['운영 현황','회원·ZU','콘텐츠 관리','신고·안전','운영·보관']);
const actual=nav.GROUPS.flatMap(group=>group.items.map(([area,tab])=>`${area}:${tab}`));
assert.equal(new Set(actual).size,actual.length,'no duplicate functional locations');
for(const [area,tabs] of Object.entries({
  account:['overview','visitors','users','suspended','referrals'],
  content:['cards','messages','groups','photo-stages','risk','map'],
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

const toggle=host.querySelector('[data-act="adm-nav-toggle"]');
nav.toggleDrawer(toggle);
assert.equal(toggle.getAttribute('aria-expanded'),'true');
assert.equal(host.querySelector('.adm-nav-backdrop').hidden,false,'opening exposes the outside-tap close target');
nav.toggleDrawer(host.querySelector('.adm-drawer-head button'));
assert.equal(toggle.getAttribute('aria-expanded'),'false','closing from the drawer updates the menu button');
assert.equal(host.querySelector('.adm-nav-backdrop').hidden,true);
nav.toggleDrawer(toggle);
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
assert.match(read('admin/navigation.css'),/\.adm-nav-body\{display:none;position:fixed/,'mobile panel floats over content');
window.close();
console.log('PASS: five admin groups cover every existing function, search, badges, pins, responsive drawer and editor preservation');
