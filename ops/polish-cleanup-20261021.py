from pathlib import Path
import sys,re,json,subprocess
root=Path(sys.argv[1])
def edit(f,fn):
 p=root/f;p.write_text(fn(p.read_text()))
edit('AGENTS.md',lambda s:s.rstrip()+'\n')
edit('world.html',lambda s:s.replace('data-act="house-login"','data-act="account-login"').replace('var worldParkNotes=','sr["account-login"]=()=>{location.href="/?auth=login&next=world";};\nvar worldParkNotes='))
edit('tests/adult-menu-visibility.test.cjs',lambda s:s.replace('world-board.js','world-game-rankings.js').replace('OjjudaBoard','OjjudaGameRankings'))
def adult(s):
 a=s.index('allowed=true;await');b=s.index('\nw.eval',a)
 return (s[:a]+s[b:]).replace('Adult menus: comics hidden/fail-closed/last section, photo game hidden until adult','Retired comics absent, photo game hidden until adult')
edit('tests/adult-menu-visibility.test.cjs',adult)
edit('tests/world-profile-draft-ui.test.cjs',lambda s:s.replace('data-tab="friends"','data-tab="arcade"'))
def admin(s):
 s=s.replace("{ area: 'content', tab: 'review' }","{ area: 'content', tab: 'photo-stages' }")
 s=s.replace("    await assertRefreshPreservesHost('review');\n    await tab('house-content'); await assertRefreshPreservesHost('house-content');\n",'')
 s=s.replace('[data-v="posts"]','[data-v="chats"]').replace("worldTest.admin.pk), 'risk'","worldTest.admin.cr), '__risk__'")
 a=s.index("    // The real legacy editor's asynchronous save")
 b=s.index("    await page.goto('https://fixture.test/world.html?admin=note-actions')",a)
 s=s[:a]+"    await area('content'); await tab('archive');\n    assert.equal(await page.evaluate(() => fixture.options.note.initialTab), 'archive');\n    assert.equal(await page.locator('[data-act=\"adm-content-kind\"]').count(), 0);\n\n"+s[b:]
 return s
edit('tests/admin-navigation-ui.test.cjs',admin)
def menu(s):
 s=s.replace("'p-mt', 'n-guestbook', 'n-friend'","'p-mt', 'n-friend'")
 s=s.replace("  assert.equal(await page.locator('#n-guestbook').isChecked(), true);\n",'')
 s=s.replace("'accent', 'defvis', 'door-toggle', 'logout'","'accent', 'logout'")
 s=s.replace(", 'https://github.com/songys/Chatbot_data'",'')
 a=s.index("  const door = page.locator('[data-act=\"door-toggle\"]');")
 b=s.index('  // Existing setting handlers',a)
 return s[:a]+"  assert.equal(await page.locator('[data-act=\"door-toggle\"]').count(), 0);\n  assert.equal(await page.locator('#n-guestbook').count(), 0);\n\n"+s[b:]
edit('tests/my-menu-ui.test.cjs',menu)
def portal(s):
 s=s.replace('tab=friends','tab=arcade').replace("count(), 2, 'World entrance and direct Home login destination'","count(), 1, 'World entrance'")
 s=s.replace("count(), 5, 'all actual bottom menus'","count(), 3, 'all actual bottom menus'")
 s='\n'.join(l for l in s.split('\n') if 'existing room image loads' not in l)
 a=s.index("      assert.equal(await page.locator('.ojjuda-copy--map')")
 b=s.index("    await page.goto(origin + '/?auth=signup",a) if "    await page.goto(origin + '/?auth=signup" in s[a:] else -1
 # Replace the obsolete 49-feature sitemap/guide checks while retaining auth and legacy park link tests.
 end=s.index("    await page.goto(origin + '/?auth=",a)
 segment=s[a:end]
 close=segment.rfind('    }')
 if close<0: raise RuntimeError('portal loop boundary')
 s=s[:a]+"      assert.equal(await page.locator('main section').count(), 3);\n      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));\n    }\n"+s[end:]
 s=s.replace('49 searchable features, real guide targets, room asset','three feature links and current guides')
 return s
edit('tests/world-portal-ui.test.cjs',portal)
# The friend directory and legacy board database have been retired; game invitation tests stay.
deleted=['tests/world-friend-search-ui.test.cjs','tests/world-board-db.test.cjs']
subprocess.run(['git','rm','-f','--',*deleted],cwd=root,check=True,stdout=subprocess.DEVNULL)
edit('tests/package.json',lambda s:json.dumps({**json.loads(s),'scripts':{k:' && '.join(c for c in v.split(' && ') if not any(Path(f).name in c for f in deleted)) for k,v in json.loads(s)['scripts'].items()}},ensure_ascii=False,indent=2)+'\n')
edit('tests/world-three-menus.test.cjs',lambda s:s.replace('rankGames:worldRankGames','rankGames:worldRankGames,adminTabs:adminTabsByArea,adminState:L,adminMarkup:y0').replace("  assert.ok(w.document.querySelector('.my-hub [data-tab=admin]'));", """  assert.ok(w.document.querySelector('.my-hub [data-tab=admin]'));
  assert.deepEqual(Array.from(t.adminTabs.content,x=>x[0]),['photo-stages','chats','cards','events','risk','map','archive']);
  assert.equal(t.adminTabs.operations.some(x=>x[0]==='quiz'),false);
  t.adminState.area='content';t.adminState.tab='archive';t.adminState.archiveType='posts';
  assert.ok(t.adminMarkup().includes('world-note-admin'),'archive always uses retained park cards');
  assert.equal(/house-test|world-life\\.js|world-board-comments|world-house-visit/.test(html),false);
  assert.equal(typeof t.actions['account-login'],'function');"""))
print('Updated settings, admin, entry and surviving regression coverage.')

edit('world-portal.css',lambda s:s.replace('repeat(5,minmax(0,1fr))','repeat(3,minmax(0,1fr))')+'\n.world-welcome{grid-template-columns:1fr;max-width:900px;margin-inline:auto}\n')
edit('index.html',lambda s:s.replace('/world-portal.css?v=20261005-copy1','/world-portal.css?v=20261021-1'))
(root/'supabase/functions/auto-house-media/index.ts').write_text('// Retired with the house/album feature on 2026-10-21. No storage or database access.\nDeno.serve(() => new Response(JSON.stringify({error:"feature_retired"}), {status:410,headers:{"content-type":"application/json","cache-control":"no-store"}}));\n')
