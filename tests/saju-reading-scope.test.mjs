import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {READING_SCOPES,readingScopeText} from '../games/starlit-saju/reading-scope.mjs';

test('general and compatibility entry pages disclose the same interpretation limits before purchase',()=>{
  for(const [kind,file] of [['saju','index.html'],['compatibility','compatibility.html']]) {
    const scope=READING_SCOPES[kind];
    const html=readFileSync(new URL(`../games/starlit-saju/${file}`,import.meta.url),'utf8');
    const preview=html.match(/<details class="method-preview">[\s\S]*?<\/details>/)?.[0];
    assert.ok(preview);
    for(const paragraph of scope.paragraphs.slice(1))assert.ok(preview.includes(`<p>${paragraph}</p>`),
      `${kind}: interpretive limits and shared explanations must be available before purchase`);
    assert.deepEqual(readingScopeText(scope),['',scope.title,...scope.paragraphs]);
    assert.doesNotMatch(readingScopeText(scope).join(' '),/https?:|출처|산식|계산 근거|natal\.|self\./);
  }
});
