'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('department directory is not reachable through service settings',()=>{
  for(const file of ['world.html','park/index.html','park/integration.js','features/pajang/entry-design.mjs','features/pajang/src/app/account-settings.tsx']){
    assert.doesNotMatch(read(file),/\/features\/organization\/\?from=/,file);
  }
  assert.doesNotMatch(read('admin/app.js'),/\/admin\/operations\.html/);
  assert.doesNotMatch(read('admin/service-scope.js'),/\['organization'\]/);
});

test('retired organization pages redirect without disclosing department data',()=>{
  for(const [file,destination] of [['admin/operations.html','/admin/'],['features/organization/index.html','/']]){
    const html=read(file);
    assert.match(html,/http-equiv="refresh"/);
    assert.ok(html.includes('content="0;url='+destination+'"'));
    assert.doesNotMatch(html,/조직도|admin_organization_read|ai_assignments/);
  }
  for(const file of ['features/organization/organization.json','features/organization/chart.js','features/organization/page.js','features/organization/style.css','admin/operations.js']){
    assert.equal(fs.existsSync(path.join(root,file)),false,file);
  }
});
