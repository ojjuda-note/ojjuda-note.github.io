from pathlib import Path
import re
def edit(name,fn):
 p=Path(name);p.write_text(fn(p.read_text()))
edit('tests/portal-auth-entry.test.cjs',lambda s:s.replace('tab=friends','tab=arcade'))
for f in ['tests/service-notice-ui.test.cjs','tests/matgo-ui.test.cjs','tests/park-note-chat-ui.test.cjs']:
 edit(f,lambda s:s.replace("'world-places.js',",''))
edit('tests/photo-ttang-capture-ui.test.cjs',lambda s:s.replace("page.locator('[data-arcade-games=\"solo\"]')","page.locator('#arcade-test [data-arcade-games=\"solo\"]')").replace("page.locator('[data-arcade-games=\"multi\"]')","page.locator('#arcade-test [data-arcade-games=\"multi\"]')"))
edit('tests/park-note-chat-ui.test.cjs',lambda s:s.replace("parkFixture.enter('cafe')","parkFixture.enter('arcade')").replace('cafe chat remains available','arcade chat remains available').replace("parkFixture.state.place?.id==='library'","parkFixture.state.place?.id==='arcade'").replace('the Park library message invokes the real previous-place step','a retired Park library message returns to the arcade'))
edit('tests/window-safe-area-ui.test.cjs',lambda s:'\n'.join(l for l in s.split('\n') if "page:'house-test/" not in l))
def mobile(s):
 a=s.index('          await page.evaluate(async () => {\n            const {openHouseTest}')
 b=s.index('          await page.evaluate(() => closeHouse());',a)+len('          await page.evaluate(() => closeHouse());')
 return (s[:a]+s[b:]).replace('games, house and login','games and login')
edit('tests/mobile-viewport-ui.test.cjs',mobile)
def refresh(s):
 a=s.index("  await page.evaluate(()=>{failRefresh=false;const doc=");b=s.index('  assert.deepEqual(errors,[]);',a)
 return s[:a]+'''  await page.evaluate(()=>{failRefresh=false;const doc=document.querySelector('iframe').contentDocument;doc.body.innerHTML='<p id="child">공원 카드</p>';attachChild();g.tab='place';g.place.id='park';worldParkNotes={refresh:async()=>{window.childRefreshes=(window.childRefreshes||0)+1;return true;}};});
  await touch('#child',0,110,{child:true});await page.waitForFunction(()=>childRefreshes===1);assert.equal(await page.evaluate(()=>g.place.id),'park');
'''+s[b:]
edit('tests/world-pull-refresh-ui.test.cjs',refresh)
print('Removed retired test fixtures; retained current account, park and game checks.')

import hashlib
for name,digest in {'tests/portal-auth-entry.test.cjs': 'bb8dd3febd9635f0cf8a6eaa08e65f7fda04059db7d6569b2e5458609ad0704e', 'tests/service-notice-ui.test.cjs': 'b69b9f6e2b3c9d205e686d5cd31a8d60164589e931c51fb36a0ce15ebf203219', 'tests/matgo-ui.test.cjs': '1519fb1ec6d2dd05ed71b7717e60d54164ef02d94a208ccac37123f8195fba7a', 'tests/park-note-chat-ui.test.cjs': 'e753d3b9046858b417dfe56a3b031e8f016432e4def04f2c13e2a9bb4234d440', 'tests/photo-ttang-capture-ui.test.cjs': 'f6be596f159b8e5db7f90ee2f6e81e5a585bcc2fa79603cfd7a36a0eba78df1f', 'tests/window-safe-area-ui.test.cjs': '8c8e35233c1b23f0a285ce83a7c723753072fb5217e653dfca140fcb240fcdcc', 'tests/mobile-viewport-ui.test.cjs': 'e9b6cefc47b04fd2718e961e3be8e9fb56a716af4d5ff467b44825d48faf47ed', 'tests/world-pull-refresh-ui.test.cjs': 'f12c11ed0d10b766ac1d0ac40cd6aa1beb359fe269430ef8b407bc798e0f12b5'}.items():
 assert hashlib.sha256(Path(name).read_bytes()).hexdigest()==digest,name
