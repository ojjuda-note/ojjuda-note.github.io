const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');

const root=path.join(__dirname,'..');
const questions=JSON.parse(fs.readFileSync(path.join(root,'features/pajang/content/teen-questions.json'),'utf8'));

test('teen questions stay unpublished, age-scoped and separate from adult matching',()=>{
  assert.equal(questions.status,'draft');
  assert.equal(questions.visibility,'not-published');
  assert.equal(questions.contentType,'self-reflection-only');
  assert.deepEqual(questions.audience,{minAge:14,maxAge:18});
  assert.equal(questions.questions.length,20);
  const ids=new Set();
  const titles=new Set();
  const categories=new Set();
  for(const item of questions.questions){
    assert.match(item.id,/^teen-(friendship|emotion|life|relationship|safety)-\d{2}$/);
    assert.equal(ids.has(item.id),false,'duplicate question id');
    assert.equal(titles.has(item.question),false,'duplicate question');
    ids.add(item.id);titles.add(item.question);categories.add(item.category);
    assert.ok(typeof item.theme==='string'&&item.theme.length>0);
    assert.ok(typeof item.question==='string'&&item.question.length>=20&&item.question.length<=100);
    assert.ok(item.question.endsWith('?'),'free response prompt must be a question');
    assert.doesNotMatch(item.question,/예\s*\/\s*아니오|어느 쪽|둘 중 하나/);
    assert.doesNotMatch(item.question,/전화번호|학교명|실명|자세한 주소|집 주소|계정 비밀번호/);
    assert.equal(item.examples.length,3);
    assert.equal(new Set(item.examples).size,3,'examples should offer distinct reasonable approaches');
    for(const example of item.examples){
      assert.ok(typeof example==='string'&&example.length>=12&&example.length<=120);
      assert.match(example,/[.요]$/);
    }
  }
  assert.deepEqual([...categories].sort(),['emotion','friendship','life','relationship','safety']);
  for(const file of ['features/pajang/index.html','features/pajang/entry.mjs','features/pajang/src/app/station-app.tsx']){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert.ok(!source.includes('teen-questions.json'),'draft must not be loaded by existing adult service');
  }
});
