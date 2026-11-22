const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {test}=require('node:test');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'features/pajang/src/app/teen-draft.tsx'),'utf8');
const css=fs.readFileSync(path.join(root,'features/pajang/src/app/teen-draft.css'),'utf8');
const live=['features/pajang/src/main.tsx','features/pajang/src/app/station-app.tsx',
  'features/pajang/index.html','features/pajang/entry.mjs'];
test('teen draft UI keeps real save/delete actions and stays absent from production Pajang entry',async()=>{
  for(const file of live) {
    const text=fs.readFileSync(path.join(root,file),'utf8');
    assert.ok(!text.includes('teen-draft'),file+' must not activate minor service');
  }
  assert.match(source,/export function TeenDraftStudio/);
  assert.match(source,/export function TeenSafetyActions/);
  for(const fragment of ['pajang_teen_draft','onClick={save}','onClick={remove}',
    'type="button" onClick={()=>step(-1)}','type="button" onClick={()=>step(1)}',
    'onTouchStart','onTouchEnd','role="status"','answerId,reason','targetUser:ownerUserId']) {
    assert.ok(source.includes(fragment),'missing functional teen control '+fragment);
  }
  assert.ok(css.includes('750px'));
  assert.ok(css.includes('min-height:44px'));
  const esbuild=require(require.resolve('esbuild',{paths:[path.join(root,'features/pajang')]}));
  const bundled=await esbuild.build({
    entryPoints:[path.join(root,'features/pajang/src/app/teen-draft.tsx')],
    bundle:true,write:false,platform:'browser',format:'esm',
    jsx:'automatic',target:'es2022',loader:{'.tsx':'tsx'}
  });
  assert.ok(bundled.outputFiles.some(file=>file.path.endsWith('.js')),'preview UI should compile');
});
