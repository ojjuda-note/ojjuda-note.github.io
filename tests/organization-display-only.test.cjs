'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');

test('organization chart remains visible in each service',()=>{
 for(const [file,from] of [['world.html','agit'],['park/index.html','park'],['park/integration.js','park'],['features/pajang/entry-design.mjs','pajang'],['features/pajang/src/app/account-settings.tsx','pajang']]){
  assert.ok(read(file).includes('/features/organization/?from='+from),file);
 }
 const page=read('features/organization/index.html');
 assert.ok(page.includes('page.js?'));
 assert.ok(page.includes('chart.js?'));
 assert.ok(!page.includes('http-equiv="refresh"'));
 assert.ok(read('admin/operations.html').includes('operations.js?'));
 assert.ok(read('admin/app.js').includes('/admin/operations.html'));
});

test('organization chart has no department AI assignment connection',()=>{
 const chart=read('features/organization/chart.js');
 const publicData=JSON.parse(read('features/organization/organization.json'));
 assert.ok(Array.isArray(publicData.organization.headquarters));
 assert.ok(publicData.organization.headquarters.length>0);
 assert.equal(Object.hasOwn(publicData,'ai_assignments'),false);
 assert.doesNotMatch(chart,/assignedAgent|departmentAgents|ai_assignments|assignment_status/);
 assert.ok(read('admin/operations.js').includes("rpc('admin_organization_read')"));
});
