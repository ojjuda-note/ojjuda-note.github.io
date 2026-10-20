from pathlib import Path
import hashlib

root = Path.cwd()
path = root / 'world.html'
assert hashlib.sha256(path.read_bytes()).hexdigest() == '15b00f0b34841b0fabc9b71a2ccef49a00388e6c4b7f36ea53dbd219740b9807', 'Unexpected World source'
s = path.read_text()
assert 'var Go="0.45.129-beta"' in s, 'Unexpected World version'

def replace(old, new):
    global s
    assert s.count(old) == 1, f'Expected one match: {old[:100]}'
    s = s.replace(old, new)

def section(start, end, new):
    global s
    a = s.index(start)
    b = s.index(end, a + len(start))
    s = s[:a] + new + s[b:]

section('async function ke(){', 'async function wd(){', '''async function ke(){
 syncWorldFriendOwner();
 const owner=P.searchOwner,epoch=P.ownerEpoch;
 if(!owner)return P;
 if(P.loading)return P.loading;
 const current=()=>D.online&&D.user?.id===owner&&P.searchOwner===owner&&P.ownerEpoch===epoch;
 const pending=(async()=>{
  const rows=Fe(await S.from("friendships").select("id,requester,addressee,status"));
  if(!current())return P;
  const rel=new Map();
  for(const row of rows){
   if(row.requester!==owner&&row.addressee!==owner)continue;
   const id=row.requester===owner?row.addressee:row.requester;
   rel.set(id,{id:row.id,status:row.status,dir:row.requester===owner?"out":"in"});
  }
  const ids=[...rel.keys()];
  const profiles=ids.length?Fe(await S.from("profiles").select("id,nickname,bio,mood,mood_text,avatar,profile_photo_path").in("id",ids)):[];
  if(!current())return P;
  const byId=new Map(profiles.filter(profile=>!Le(profile.id)).map(profile=>[profile.id,profile]));
  const requests=dir=>[...rel].filter(([,value])=>value.status==="pending"&&value.dir===dir).map(([id,value])=>({req:value.id,p:byId.get(id)})).filter(value=>value.p);
  P.rel=rel;
  P.friends=[...rel].filter(([,value])=>value.status==="accepted").map(([id])=>byId.get(id)).filter(Boolean).sort((a,b)=>a.nickname.localeCompare(b.nickname,"ko"));
  P.incoming=requests("in");P.outgoing=requests("out");P.feed=[];
  P.loaded=true;P.loadError=false;P.at=Date.now();return P;
 })();
 P.loading=pending;
 try{return await pending;}catch(error){if(current())P.loadError=true;throw error;}
 finally{if(P.loading===pending)P.loading=null;}
}
''')
replace('P.searchOwner=owner;P.searchRun=(P.searchRun||0)+1;P.searchDraft="";P.communityOpen=false;P.results=null;P.q="";', '''P.searchOwner=owner;P.ownerEpoch=(P.ownerEpoch||0)+1;P.searchRun=(P.searchRun||0)+1;P.searchDraft="";P.communityOpen=false;P.results=null;P.q="";
 P.loaded=false;P.loading=null;P.loadError=false;P.at=0;P.friends=[];P.incoming=[];P.outgoing=[];P.feed=[];P.rel=new Map();''')
replace('const results=Fe(await S.from("profiles").select(ks()).ilike("nickname",pattern).neq("id",owner).limit(20));', 'const results=Fe(await S.from("profiles").select("id,nickname,bio,mood,mood_text,avatar,profile_photo_path").ilike("nickname",pattern).neq("id",owner).limit(20));')
section('function Ag(t){', 'function Mg(){', '''function Ag(profile){
 const rel=P.rel.get(profile.id);
 if(!rel)return `<button class="btn sm pri" data-act="fr-request" data-uid="${w(profile.id)}">친구 신청</button>`;
 if(rel.status==="accepted")return '<span class="note">친구예요</span>';
 return rel.dir==="in"?`<button class="btn sm pri" data-act="fr-accept" data-req="${w(rel.id)}">수락</button>`:`<button class="btn sm" data-act="fr-cancel" data-req="${w(rel.id)}">신청 취소</button>`;
}
function Cg(){
 syncWorldFriendOwner();
 if(!D.online||!D.user||P.loading||P.loadError||P.loaded&&Date.now()-P.at<2e4)return;
 const owner=P.searchOwner,epoch=P.ownerEpoch;
 ke().then(()=>{if(D.user?.id===owner&&P.ownerEpoch===epoch&&g.tab==="my")ii();}).catch(error=>{
  if(D.user?.id!==owner||P.ownerEpoch!==epoch)return;
  console.error(error);if(g.tab==="my")ii();
 });
}
document.addEventListener("toggle",event=>{
 const group=event.target;
 if(!group.matches?.('[data-my-group="friends"]')||!group.isConnected)return;
 if(group.dataset.friendOwner!==(D.online?D.user?.id||"":""))return;
 P.communityOpen=group.open;if(group.open)Cg();
},true);
''')
section('function Of(){', 'function Il(', '''function Of(){
 if(!D.online||!D.user)return '<p class="note">로그인하면 친구를 찾고 관리할 수 있어요.</p><button class="btn pri" data-act="account-login">로그인</button>';
 if(P.loadError)return '<p role="status">친구 목록을 불러오지 못했어요.</p><button class="btn" data-act="fr-retry">다시 불러오기</button>';
 if(!P.loaded)return '<p class="note" role="status">친구 목록을 불러오는 중이에요.</p>';
 const person=profile=>`${Il(profile)}<div class="mid"><b>${w(profile.nickname)}</b><div class="note ell">${w(profile.bio||"")}</div></div>`;
 let markup=`<section class="world-friend-section"><h3>친구 찾기</h3><form id="fr-search-form" class="row"><input class="inp" id="fr-q" maxlength="12" placeholder="닉네임 검색" value="${w(P.searchDraft??P.q)}" aria-label="친구 닉네임 검색" autocomplete="off"><button class="btn pri" type="submit">검색</button></form>`;
 if(P.results){
  const results=P.results.filter(profile=>!Le(profile.id));
  markup+=results.length?results.map(profile=>`<div class="world-friend-row">${person(profile)}<div class="world-friend-actions">${Ag(profile)}</div></div>`).join(""):`<p class="note">'${w(P.q)}'(으)로 찾은 사람이 없어요.</p>`;
 }
 markup+='</section>';
 markup+=`<section class="world-friend-section"><h3>받은 친구 신청 <span class="badge">${P.incoming.length}</span></h3>`;
 markup+=P.incoming.length?P.incoming.map(item=>`<div class="world-friend-row">${person(item.p)}<div class="world-friend-actions"><button class="btn sm pri" data-act="fr-accept" data-req="${w(item.req)}">수락</button><button class="btn sm ghost" data-act="fr-decline" data-req="${w(item.req)}">거절</button></div></div>`).join(""):'<p class="note">받은 친구 신청이 없어요.</p>';
 markup+=`</section><section class="world-friend-section"><h3>친구 ${P.friends.length}명</h3>`;
 markup+=P.friends.length?P.friends.map(profile=>`<div class="world-friend-row">${person(profile)}<div class="world-friend-actions"><button class="btn sm ghost danger" data-act="fr-remove" data-req="${w(P.rel.get(profile.id).id)}" data-name="${w(profile.nickname)}">친구 삭제</button></div></div>`).join(""):'<p class="note">아직 친구가 없어요. 닉네임으로 친구를 찾아보세요.</p>';
 markup+='</section><section class="world-friend-section"><h3>보낸 친구 신청</h3>';
 markup+=P.outgoing.length?P.outgoing.map(item=>`<div class="world-friend-row">${person(item.p)}<div class="world-friend-actions"><span class="note">수락 대기 중</span><button class="btn sm ghost" data-act="fr-cancel" data-req="${w(item.req)}">신청 취소</button></div></div>`).join(""):'<p class="note">보낸 친구 신청이 없어요.</p>';
 return markup+'</section>';
}
''')
section('async function ai(t,e,o){', 'var Pf={', '''async function ai(button,action,message){
 const owner=D.online?D.user?.id:null;
 if(!owner)return M("로그인 후 친구를 관리할 수 있어요");
 const current=()=>D.online&&D.user?.id===owner;
 if(button)button.disabled=true;
 try{const result=await action();if(!current())return;if(message)M(typeof message==="function"?message(result):message);ii();}
 catch(error){if(!current())return;console.error(error);M("처리하지 못했어요. 잠시 뒤 다시 시도해 주세요");if(button)button.disabled=false;}
}
''')
replace('var Pf={"fr-request"', 'var Pf={"fr-retry"(){P.loadError=false;P.at=0;Cg()},"fr-request"')
replace('"친구가 됐어요! 서로의 방에 방명록을 남길 수 있어요"', '"친구가 됐어요! 함께 게임을 즐겨보세요"')
replace('"fr-remove"(t){Tt(`${t.name}님과 친구를 끊을까요?`,"친구 끊기",()=>ai(null,()=>ji(t.req),"친구를 끊었어요"))}', '"fr-remove"(t){const owner=D.user?.id;Tt(`${t.name}님을 친구 목록에서 삭제할까요?`,"친구 삭제",()=>{if(D.user?.id===owner)ai(null,()=>ji(t.req),"친구를 삭제했어요")})}')
replace('if(g.tab!=="friends")return;console.error(error);M("검색하지 못했어요.', 'if(g.tab!=="my")return;console.error(error);M("검색하지 못했어요.')
replace('  <h3 class="my-section-title">이용 설정</h3>', '''  <details class="my-menu-group world-friends-settings" data-my-group="friends" data-friend-owner="${w(D.online?D.user?.id||"":"")}"${P.communityOpen?" open":""}><summary class="my-menu-summary"><span class="my-menu-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v2"/></svg></span><span class="my-menu-copy"><span class="my-menu-title">친구 관리${D.online&&P.incoming.length?` <span class="badge">${P.incoming.length}</span>`:""}</span><span class="my-menu-caption">친구 찾기 · 신청 · 목록</span></span></summary><div class="my-menu-body">${Of()}</div></details>
  <h3 class="my-section-title">이용 설정</h3>''')
replace('  if(type==="friends")await ke();else if(type==="guestbook"){await _d();K1()}else await m1();', '''  if(type==="friends"){
   await ke();if(D.user?.id!==user||g.tab!==from)return;
   dt();sr.tab({tab:"my"});
   const group=document.querySelector('[data-my-group="friends"]');
   if(group){group.open=true;P.communityOpen=true;group.scrollIntoView({block:"start",behavior:qt?"auto":"smooth"});}
   return;
  }
  if(type==="guestbook"){await _d();K1()}else await m1();''')
replace('var Go="0.45.129-beta"', 'var Go="0.45.130-beta"')
replace('/my-menu.css?v=20261005-profile-account1', '/my-menu.css?v=20261021-friends1')
replace('const community=z(".world-community"),input=z("#fr-q");', 'const community=document.querySelector(\'[data-my-group="friends"]\'),input=z("#fr-q");')
assert hashlib.sha256(s.encode()).hexdigest() == '75146dc472326373fc7d6b625cc11d66978194e80d6efb7f2aae74a59a1b109e', 'Unexpected patch result'
path.write_text(s)
(root/'version.json').write_text('{\n  "version": "0.45.130-beta"\n}\n')
print('Updated World friend management:', hashlib.sha256(path.read_bytes()).hexdigest())

# Small text edits keep the existing settings styling and regression fixtures.

p = root / 'my-menu.css'
text = p.read_text()
assert hashlib.sha256(text.encode()).hexdigest() == '3dbabade3abb449db2aa00242b7cc24c57bef4d1210ac91478b59f71df62336a'
assert text.count('.my-menu-body .note { font-size: 12px; line-height: 1.6; }\n.my-menu-body p, .my-menu-body a { overflow-wrap: anywhere; }\n') == 1
text = text.replace('.my-menu-body .note { font-size: 12px; line-height: 1.6; }\n.my-menu-body p, .my-menu-body a { overflow-wrap: anywhere; }\n', '.my-menu-body .note { font-size: 12px; line-height: 1.6; }\n.world-friend-section + .world-friend-section { margin-top: 24px; }\n.world-friend-section #fr-search-form { display: flex; flex-wrap: nowrap; gap: 8px; }\n.world-friend-section #fr-q { flex: 1; width: 0; min-width: 0; }\n.world-friend-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 12px 0; border-top: 1px solid var(--line); }\n.world-friend-row .mid { flex: 1; min-width: 80px; max-width: 100%; overflow: hidden; }\n.world-friend-row .mid b { overflow-wrap: anywhere; }\n.world-friend-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; margin-left: auto; max-width: 100%; }\n.world-friend-actions .btn { min-height: 36px; }\n.my-menu-body p, .my-menu-body a { overflow-wrap: anywhere; }\n')
assert hashlib.sha256(text.encode()).hexdigest() == 'd4e382b6e4c4a280a2730e1c515365f1d72f63e36043648272169d716bcfea0e'
p.write_text(text)

p = root / 'tests/my-menu-ui.test.cjs'
text = p.read_text()
assert hashlib.sha256(text.encode()).hexdigest() == '8e67b1e5d34eb1387dd29da73edb7b5740b8d0286b6482d29de558012d608168'
assert text.count("const renderer = world.slice(rendererStart, rendererEnd);\nconst noteLinkRenderer = world.slice(rendererEnd, world.indexOf('function Zg()', rendererEnd));\n") == 1
text = text.replace("const renderer = world.slice(rendererStart, rendererEnd);\nconst noteLinkRenderer = world.slice(rendererEnd, world.indexOf('function Zg()', rendererEnd));\n", "const renderer = world.slice(rendererStart, rendererEnd);\nconst friendRenderer = world.slice(world.indexOf('function Ag('), world.indexOf('function Cg()'))\n  + world.slice(world.indexOf('function Of()'), world.indexOf('function Il('));\nconst noteLinkRenderer = world.slice(rendererEnd, world.indexOf('function Zg()', rendererEnd));\n")
assert text.count("    window.g = {};\n    window.yi = ['😊', '😌', '😴'];\n") == 1
text = text.replace("    window.g = {};\n    window.yi = ['😊', '😌', '😴'];\n", '    window.g = {};\n    window.P = { loaded: true, communityOpen: false, incoming: [{req:\'request-a\',p:{id:\'friend-a\',nickname:\'새 친구\',bio:\'함께 게임해요\'}}],\n      outgoing: [], friends: [{id:\'friend-b\',nickname:\'기존 친구\',bio:\'반가워요\'}], results: null, q:\'\',\n      rel: new Map([[\'friend-b\',{id:\'request-b\',status:\'accepted\'}]]) };\n    window.Il = () => \'<span class="ini">나</span>\';\n    window.Le = () => false;\n    window.yi = [\'😊\', \'😌\', \'😴\'];\n')
assert text.count("  await page.addScriptTag({ content: read('world-park-notes.js') });\n  await page.addScriptTag({ content: renderer + noteLinkRenderer });\n  await page.addScriptTag({ content: doorAction });\n") == 1
text = text.replace("  await page.addScriptTag({ content: read('world-park-notes.js') });\n  await page.addScriptTag({ content: renderer + noteLinkRenderer });\n  await page.addScriptTag({ content: doorAction });\n", "  await page.addScriptTag({ content: read('world-park-notes.js') });\n  await page.addScriptTag({ content: friendRenderer + renderer + noteLinkRenderer });\n  await page.addScriptTag({ content: doorAction });\n")
assert text.count("  await exerciseGroups(page, '.my-hub');\n  for (const id of ['p-nick', 'p-bio', 'p-mt', 'n-friend']) {\n") == 1
text = text.replace("  await exerciseGroups(page, '.my-hub');\n  for (const id of ['p-nick', 'p-bio', 'p-mt', 'n-friend']) {\n", '  await exerciseGroups(page, \'.my-hub\');\n  assert.equal(await page.locator(\'[data-my-group="friends"] #fr-q\').isVisible(), true);\n  for (const action of [\'fr-accept\', \'fr-decline\', \'fr-remove\']) {\n    assert.equal(await page.locator(`[data-my-group="friends"] [data-act="${action}"]`).isVisible(), true);\n  }\n  assert.equal(await page.locator(\'[data-my-group="friends"] [data-act="visit"]\').count(), 0);\n  for (const id of [\'p-nick\', \'p-bio\', \'p-mt\', \'n-friend\']) {\n')
assert text.count("  assert.equal(await page.locator('#n-friend').isChecked(), false);\n  const expectedActions = ['account-delete-open', 'accent', 'logout', 'member-info-open', 'mood-pick', 'profile-photo', 'profile-save', 'pw-open', 'support-open', 'theme', 'unblock'].sort();\n  assert.deepEqual(await page.locator('.my-hub [data-act]').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.act))].sort()), expectedActions,\n") == 1
text = text.replace("  assert.equal(await page.locator('#n-friend').isChecked(), false);\n  const expectedActions = ['account-delete-open', 'accent', 'logout', 'member-info-open', 'mood-pick', 'profile-photo', 'profile-save', 'pw-open', 'support-open', 'theme', 'unblock'].sort();\n  assert.deepEqual(await page.locator('.my-hub [data-act]').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.act))].sort()), expectedActions,\n", "  assert.equal(await page.locator('#n-friend').isChecked(), false);\n  const expectedActions = ['account-delete-open', 'accent', 'fr-accept', 'fr-decline', 'fr-remove', 'logout', 'member-info-open', 'mood-pick', 'profile-photo', 'profile-save', 'pw-open', 'support-open', 'theme', 'unblock'].sort();\n  assert.deepEqual(await page.locator('.my-hub [data-act]').evaluateAll(nodes => [...new Set(nodes.map(node => node.dataset.act))].sort()), expectedActions,\n")
assert hashlib.sha256(text.encode()).hexdigest() == '25c2af1a3420da1ad9c14869ec7c0941c5d86fcc21ccf7b430591dd9cd388f97'
p.write_text(text)

p = root / 'tests/package.json'
text = p.read_text()
assert hashlib.sha256(text.encode()).hexdigest() == '055fc2c3065a27a8e288f5f0fd0e0e034f33f15bb13d598356b728fda178c1ab'
assert text.count('    "test:screw": "node screw3d.test.cjs && node screw3d-ui.test.cjs && node screw-flat.test.cjs && node screw-flat-purchases.test.cjs && node screw-flat-pictures.test.cjs && node screw-modes-ui.test.cjs",\n    "test:unit": "node world-three-menus.test.cjs && node mines-dom.test.cjs && node mines-ranking-db.test.cjs && node saetbyeol-dom.test.cjs && node saetbyeol-expansion.test.cjs && node saetbyeol-boss-balance.test.cjs && node saetbyeol-booster.test.cjs && node saetbyeol-ranking-db.test.cjs && node ojjuda-tour-dom.test.cjs && node ojjuda-tour-ranking-db.test.cjs && node adult-menu-visibility.test.cjs && node world-adult-resume.test.cjs && node game-friend-invites-db.test.cjs && node profile-color-security.test.cjs && node account-deletion.test.cjs && node inline-scripts.test.cjs && node community-game-ranking-db.test.cjs && node game-win-streak-db.test.cjs && node member-identity.test.cjs && node portal-auth-entry.test.cjs && node member-identity-db.test.cjs && node account-recovery-db.test.cjs && node account-recovery-edge.test.cjs && node note-moderation-db.test.cjs && node note-tag-visibility.test.cjs && node note-preview-photo.test.cjs && node note-album-autosave.test.cjs && node note-composer-settings.test.cjs && node note-account.test.cjs && node world-rpc-security.test.cjs && node world-legacy-cleanup-db.test.cjs && node world-presence.test.cjs && node game-verification.test.cjs && node breakout-items.test.cjs && node breakout-score-db.test.cjs && node feedback-ai-db.test.cjs && npm run test:feedback-dispatch && npm run test:feedback-gateway && node auto-card-visuals-db.test.cjs && node feedback-diagnostics-db.test.cjs && node matgo-engine.test.cjs && node matgo-multipliers.test.mjs && node matgo-captured-zoom.test.mjs && node matgo-bonus.test.mjs && node matgo-gukjin.test.mjs && node matgo-special-rules.test.mjs && node matgo-first-ppuk.test.mjs && node matgo-access.test.cjs && node matgo-gold.test.cjs && node matgo-refill.test.cjs && node matgo-difficulty.test.mjs && node matgo-stakes.test.cjs && node matgo-parity.test.cjs && node matgo-edge.test.cjs && node matgo-online.test.cjs && node ju-charge-db.test.cjs && node ju-shop-db.test.cjs && node ju-game-prices-db.test.cjs && node admin-account-directories-db.test.cjs && node admin-activity-db.test.cjs && node service-notice-db.test.cjs && node profile-photo-db.test.cjs && node arcade-rooms-db.test.cjs && node ttang-collision.test.cjs && node photo-ttang-collision.test.cjs && node photo-ttang-db.test.cjs && node ttang-corners.test.cjs && node monthly-cosmetics-photo-help-db.test.cjs && node shop-composer.test.cjs && node shop-read-cache.test.cjs && node guest-ranking-db.test.cjs",\n    "test:feedback-dispatch": "node feedback-ai-dispatch-db.test.cjs",\n') == 1
text = text.replace('    "test:screw": "node screw3d.test.cjs && node screw3d-ui.test.cjs && node screw-flat.test.cjs && node screw-flat-purchases.test.cjs && node screw-flat-pictures.test.cjs && node screw-modes-ui.test.cjs",\n    "test:unit": "node world-three-menus.test.cjs && node mines-dom.test.cjs && node mines-ranking-db.test.cjs && node saetbyeol-dom.test.cjs && node saetbyeol-expansion.test.cjs && node saetbyeol-boss-balance.test.cjs && node saetbyeol-booster.test.cjs && node saetbyeol-ranking-db.test.cjs && node ojjuda-tour-dom.test.cjs && node ojjuda-tour-ranking-db.test.cjs && node adult-menu-visibility.test.cjs && node world-adult-resume.test.cjs && node game-friend-invites-db.test.cjs && node profile-color-security.test.cjs && node account-deletion.test.cjs && node inline-scripts.test.cjs && node community-game-ranking-db.test.cjs && node game-win-streak-db.test.cjs && node member-identity.test.cjs && node portal-auth-entry.test.cjs && node member-identity-db.test.cjs && node account-recovery-db.test.cjs && node account-recovery-edge.test.cjs && node note-moderation-db.test.cjs && node note-tag-visibility.test.cjs && node note-preview-photo.test.cjs && node note-album-autosave.test.cjs && node note-composer-settings.test.cjs && node note-account.test.cjs && node world-rpc-security.test.cjs && node world-legacy-cleanup-db.test.cjs && node world-presence.test.cjs && node game-verification.test.cjs && node breakout-items.test.cjs && node breakout-score-db.test.cjs && node feedback-ai-db.test.cjs && npm run test:feedback-dispatch && npm run test:feedback-gateway && node auto-card-visuals-db.test.cjs && node feedback-diagnostics-db.test.cjs && node matgo-engine.test.cjs && node matgo-multipliers.test.mjs && node matgo-captured-zoom.test.mjs && node matgo-bonus.test.mjs && node matgo-gukjin.test.mjs && node matgo-special-rules.test.mjs && node matgo-first-ppuk.test.mjs && node matgo-access.test.cjs && node matgo-gold.test.cjs && node matgo-refill.test.cjs && node matgo-difficulty.test.mjs && node matgo-stakes.test.cjs && node matgo-parity.test.cjs && node matgo-edge.test.cjs && node matgo-online.test.cjs && node ju-charge-db.test.cjs && node ju-shop-db.test.cjs && node ju-game-prices-db.test.cjs && node admin-account-directories-db.test.cjs && node admin-activity-db.test.cjs && node service-notice-db.test.cjs && node profile-photo-db.test.cjs && node arcade-rooms-db.test.cjs && node ttang-collision.test.cjs && node photo-ttang-collision.test.cjs && node photo-ttang-db.test.cjs && node ttang-corners.test.cjs && node monthly-cosmetics-photo-help-db.test.cjs && node shop-composer.test.cjs && node shop-read-cache.test.cjs && node guest-ranking-db.test.cjs",\n    "test:feedback-dispatch": "node feedback-ai-dispatch-db.test.cjs",\n', '    "test:screw": "node screw3d.test.cjs && node screw3d-ui.test.cjs && node screw-flat.test.cjs && node screw-flat-purchases.test.cjs && node screw-flat-pictures.test.cjs && node screw-modes-ui.test.cjs",\n    "test:unit": "node world-friend-settings.test.cjs && node world-three-menus.test.cjs && node mines-dom.test.cjs && node mines-ranking-db.test.cjs && node saetbyeol-dom.test.cjs && node saetbyeol-expansion.test.cjs && node saetbyeol-boss-balance.test.cjs && node saetbyeol-booster.test.cjs && node saetbyeol-ranking-db.test.cjs && node ojjuda-tour-dom.test.cjs && node ojjuda-tour-ranking-db.test.cjs && node adult-menu-visibility.test.cjs && node world-adult-resume.test.cjs && node game-friend-invites-db.test.cjs && node profile-color-security.test.cjs && node account-deletion.test.cjs && node inline-scripts.test.cjs && node community-game-ranking-db.test.cjs && node game-win-streak-db.test.cjs && node member-identity.test.cjs && node portal-auth-entry.test.cjs && node member-identity-db.test.cjs && node account-recovery-db.test.cjs && node account-recovery-edge.test.cjs && node note-moderation-db.test.cjs && node note-tag-visibility.test.cjs && node note-preview-photo.test.cjs && node note-album-autosave.test.cjs && node note-composer-settings.test.cjs && node note-account.test.cjs && node world-rpc-security.test.cjs && node world-legacy-cleanup-db.test.cjs && node world-presence.test.cjs && node game-verification.test.cjs && node breakout-items.test.cjs && node breakout-score-db.test.cjs && node feedback-ai-db.test.cjs && npm run test:feedback-dispatch && npm run test:feedback-gateway && node auto-card-visuals-db.test.cjs && node feedback-diagnostics-db.test.cjs && node matgo-engine.test.cjs && node matgo-multipliers.test.mjs && node matgo-captured-zoom.test.mjs && node matgo-bonus.test.mjs && node matgo-gukjin.test.mjs && node matgo-special-rules.test.mjs && node matgo-first-ppuk.test.mjs && node matgo-access.test.cjs && node matgo-gold.test.cjs && node matgo-refill.test.cjs && node matgo-difficulty.test.mjs && node matgo-stakes.test.cjs && node matgo-parity.test.cjs && node matgo-edge.test.cjs && node matgo-online.test.cjs && node ju-charge-db.test.cjs && node ju-shop-db.test.cjs && node ju-game-prices-db.test.cjs && node admin-account-directories-db.test.cjs && node admin-activity-db.test.cjs && node service-notice-db.test.cjs && node profile-photo-db.test.cjs && node arcade-rooms-db.test.cjs && node ttang-collision.test.cjs && node photo-ttang-collision.test.cjs && node photo-ttang-db.test.cjs && node ttang-corners.test.cjs && node monthly-cosmetics-photo-help-db.test.cjs && node shop-composer.test.cjs && node shop-read-cache.test.cjs && node guest-ranking-db.test.cjs",\n    "test:feedback-dispatch": "node feedback-ai-dispatch-db.test.cjs",\n')
assert hashlib.sha256(text.encode()).hexdigest() == 'a6b4b5e916d464e36c03bc255b0b5a81a5551af3a1b6e710d803d83d5574244a'
p.write_text(text)
