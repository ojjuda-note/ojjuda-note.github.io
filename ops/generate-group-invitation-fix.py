from pathlib import Path
import hashlib

def blob(text):
    data=text.encode()
    return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()

expected_before = {'groups/app.js': 'fffd1f1748ca0d61503cadd6a21e3594645e250e', 'groups/index.html': '7e3ce9c8e113e611f46dec88790e72b9091a44c4', 'tests/group-board-dom.test.cjs': '5cd2152f9e5f2010acfa76eb524e592f095a54aa', 'tests/package.json': '3d131029b38baa5df5307d5696fe6c1eb619d3f5'}
expected_after = {'groups/app.js': '7f829162e3b830e63d87e9330389edb6142d949f', 'groups/index.html': '8e743f4fad6f5bb07e75ed2e8725963320098aa9', 'tests/group-board-dom.test.cjs': 'ca34388513b274aac4f3fd26f7f41fcf75bcdccd', 'tests/package.json': '5af1e5eac95ffa97c536e492c0652bc13da5cb24', 'tests/group-invitation-age-ui.test.cjs': '1d11755c0fe64f6373bf29ea45f9fbb3c3044514'}
replacements = {'groups/app.js': [("row.dataset.busy='yes';row.querySelectorAll('button').forEach(x=>x.disabled=true);try{", "const controls=[...row.querySelectorAll('button')].map(button=>({button,disabled:button.disabled}));row.dataset.busy='yes';controls.forEach(({button})=>button.disabled=true);try{"), ("finally{delete row.dataset.busy;row.querySelectorAll('button').forEach(x=>x.disabled=false);}return;}", 'finally{delete row.dataset.busy;controls.forEach(({button,disabled})=>button.disabled=disabled);}return;}')], 'groups/index.html': [('/groups/app.js?v=20261111-age-colors1', '/groups/app.js?v=20261111-invite-age-retry1')], 'tests/package.json': [('--test-reporter=spec restaurant-guide-ui.test.cjs', '--test-reporter=spec group-invitation-age-ui.test.cjs restaurant-guide-ui.test.cjs')], 'tests/group-board-dom.test.cjs': [("test('home uses one request and simultaneous refreshes share their work',async()=>{", "test('failed invitation declines preserve age restrictions and can be retried',async()=>{\n  for(const eligible of [false,true]){\n    let pending=deferred();\n    const f=fixture({empty:true,respond:a=>{\n      if(a==='home')return {data:{rooms:[],directory:[],invitations:[{id:entry,room_id:room,group_name:'성인 모임',sender_name:'친구',age_policy:'adults',age_eligible:eligible}]}};\n      if(a==='decline')return pending.promise;\n      if(a==='received')return {data:[]};\n    }});try{\n      await tick();const d=f.w.document,accept=d.querySelector('[data-accept-invite]'),decline=d.querySelector('[data-decline-invite]');\n      assert.equal(accept.disabled,!eligible);decline.click();await tick();\n      assert.equal(accept.disabled,true);assert.equal(decline.disabled,true);\n      pending.resolve({error:{message:'연결 실패'}});await tick();\n      assert.equal(accept.disabled,!eligible,'a failed decline must preserve the age gate');\n      assert.equal(decline.disabled,false);assert.match(d.querySelector('#toast').textContent,/연결 실패/);\n      if(!eligible){accept.click();await tick();assert.equal(f.calls.some(([a])=>a==='accept'),false);}\n      pending=deferred();decline.click();await tick();assert.equal(f.calls.filter(([a])=>a==='decline').length,2);\n      pending.resolve({data:{ok:true}});await tick();assert.equal(d.querySelector('[data-decline-invite]'),null);\n    }finally{f.dom.window.close();}\n  }\n});\ntest('home uses one request and simultaneous refreshes share their work',async()=>{")]}
for filename, edits in replacements.items():
    path=Path(filename)
    text=path.read_text()
    assert blob(text)==expected_before[filename], filename+' base changed'
    for old,new in edits:
        assert text.count(old)==1, filename+' anchor changed'
        text=text.replace(old,new)
    assert blob(text)==expected_after[filename], filename+' generated content mismatch'
    path.write_text(text)
for filename, expected in expected_after.items():
    assert blob(Path(filename).read_text())==expected, filename+' final hash mismatch'
    print(filename,expected)
