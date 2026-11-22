const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('teen page only loads React after verified backend release and consent',async()=>{
  const source=read('features/pajang/teen-entry.mjs');
  const html=read('features/pajang/teen.html');
  const adult=read('features/pajang/member.mjs');
  const main=read('features/pajang/src/teen-main.tsx');
  const pkg=JSON.parse(read('features/pajang/package.json'));
  const release=read('supabase/migrations/20261122172528_pajang_teen_launch_gate.sql');
  const pages=read('.github/workflows/pages-publish.yml');
  execFileSync(process.execPath,['--check',path.join(root,'features/pajang/teen-entry.mjs')]);
  assert.match(html,/meta name="robots" content="noindex,nofollow"/);
  assert.match(html,/teen-entry.mjs/);
  assert.match(html,/teen\.css/);
  assert.match(source,/pajang_teen_entry/);
  assert.ok(source.indexOf('entry.data?.ready!==true')<source.indexOf("await import('./assets/teen.js"));
  assert.match(adult,/pajang_teen_entry/);
  assert.match(adult,/data\?\.ready===true/);
  assert.match(main,/TeenCommunityPage/);
  assert.match(pkg.scripts['build:teen'],/teen-main.tsx/);
  assert.match(pages,/Stage gated teen community bundle/);
  assert.match(release,/enabled boolean not null default false/);
  assert.match(release,/shareWithTeens/);
  assert.match(read('features/pajang/src/app/teen-draft.tsx'),/shareWithTeens:true/);
  const gate={hidden:false},app={hidden:true,replaceChildren(){}},message={textContent:''};
  const nodes={'teen-gate':gate,'teen-app':app,'teen-gate-message':message};
  const user={id:'teen-account',is_anonymous:false};
  const db={auth:{
    getSession:async()=>({data:{session:{user}},error:null}),
    getUser:async()=>({data:{user},error:null}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
  },rpc:async()=>({data:{ready:false,audience:'teen'},error:null})};
  vm.runInNewContext(source,{window:{OjjudaGetClient:async()=>db,addEventListener(){}},
    document:{getElementById:id=>nodes[id]},location:{replace(){throw Error('no redirect while closed');}}});
  for(let i=0;i<12&&!message.textContent.includes('검토');i++)await new Promise(resolve=>setImmediate(resolve));
  assert.match(message.textContent,/검토/);
  assert.equal(app.hidden,true);
  assert.equal(gate.hidden,false);
});
