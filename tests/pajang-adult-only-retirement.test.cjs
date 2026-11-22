const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Pajang stays 19+ with no retired youth UI, endpoints or deploy artifacts',()=>{
  const retired=[
  ".github/workflows/pajang-teen-safety.yml",
  "admin/pajang-teen.css",
  "admin/pajang-teen.html",
  "admin/pajang-teen.js",
  "docs/pajang-age-segmentation.md",
  "docs/pajang-teen-launch-review.md",
  "docs/pajang-teen-moderation-runbook.md",
  "docs/pajang-teen-privacy-draft.md",
  "docs/pajang-teen-terms-draft.md",
  "features/pajang/content/teen-questions.json",
  "features/pajang/src/app/teen-draft.css",
  "features/pajang/src/app/teen-draft.tsx",
  "features/pajang/src/app/teen-feed.css",
  "features/pajang/src/app/teen-feed.tsx",
  "features/pajang/src/teen-main.tsx",
  "features/pajang/teen-data.html",
  "features/pajang/teen-data.mjs",
  "features/pajang/teen-entry.css",
  "features/pajang/teen-entry.mjs",
  "features/pajang/teen-safety.html",
  "features/pajang/teen.html",
  "tests/pajang-teen-admin-ui.test.cjs",
  "tests/pajang-teen-draft-ui.test.cjs",
  "tests/pajang-teen-entry.test.cjs",
  "tests/pajang-teen-private-drafts-db.test.cjs",
  "tests/pajang-teen-questions.test.cjs",
  "tests/pajang-teen-self-erasure-ui.test.cjs"
];
  for(const name of retired){
    assert.equal(fs.existsSync(path.join(root,name)),false,'retired path remains: '+name);
  }
  const main=read('features/pajang/member.mjs');
  const home=read('features/pajang/index.html');
  const admin=read('admin/pajang-moderation.js');
  const loader=read('admin/world-admin-loader.js');
  const deploy=read('.github/workflows/pages-publish.yml');
  const discovery=read('.github/workflows/pajang-discovery.yml');
  const catalog=read('docs/source-layout.json');
  const scripts=JSON.parse(read('features/pajang/package.json')).scripts;
  const cleanup=read('supabase/migrations/20261122181500_pajang_adult_only_remove_teen.sql');
  assert.match(home,/만 19세 이상/);
  assert.match(main,/만 19세 이상 회원 전용/);
  assert.match(main,/rpc\('pajang_member'/);
  assert.doesNotMatch(main,/pajang_teen|teen\.html/);
  assert.doesNotMatch(admin,/pajang-teen|청소년 답변/);
  assert.doesNotMatch(loader,/teen-review/);
  assert.doesNotMatch(deploy,/build:teen|teen\.js|teen\.css|teen community bundle/);
  assert.doesNotMatch(discovery,/pajang-teen|teen-to-teen/);
  assert.doesNotMatch(catalog,/features\/pajang\/assets\/teen\./);
  assert.ok(scripts.build,'adult protected bundle must remain configured');
  assert.equal(Object.hasOwn(scripts,'build:teen'),false);
  for(const fn of ['pajang_teen_draft','pajang_teen_feed','pajang_teen_interact',
    'pajang_teen_entry','pajang_teen_erase_own','admin_pajang_teen_moderation','admin_pajang_teen_comments']){
    assert.ok(cleanup.includes('drop function if exists public.'+fn),'youth RPC not removed: '+fn);
  }
  assert.ok(cleanup.includes('drop schema if exists pajang_teen_private cascade'));
  assert.ok(cleanup.includes('Youth service unexpectedly contains'));
  assert.ok(!cleanup.includes('drop function if exists public.pajang_age_group'));
  assert.ok(!cleanup.includes('drop function if exists public.pajang_member'));
});
