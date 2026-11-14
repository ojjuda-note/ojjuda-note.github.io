import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {READING_SCOPES,readingScopeText} from '../games/starlit-saju/reading-scope.mjs';
const {JSDOM}=createRequire(import.meta.url)('jsdom');

test('general and compatibility entry pages disclose the same interpretation limits before purchase',()=>{
  for(const [kind,file] of [['saju','index.html'],['compatibility','compatibility.html']]) {
    const scope=READING_SCOPES[kind];
    const html=readFileSync(new URL(`../games/starlit-saju/${file}`,import.meta.url),'utf8');
    const dom=new JSDOM(html),preview=dom.window.document.querySelector('details.method-preview');
    assert.ok(preview?.querySelector(':scope > summary')?.textContent.trim(),'the homepage has a labelled interpretation-scope disclosure');
    assert.equal(preview.open,false,'long scope information need not fill the first screen');
    const paragraphs=[...preview.querySelectorAll('p')].map(p=>p.textContent);
    for(const paragraph of scope.paragraphs.slice(1))assert.ok(paragraphs.includes(paragraph),
      `${kind}: interpretive limits and shared explanations must be available before purchase`);
    dom.window.close();
    assert.deepEqual(readingScopeText(scope),['',scope.title,...scope.paragraphs]);
    assert.doesNotMatch(readingScopeText(scope).join(' '),/https?:|출처|산식|계산 근거|natal\.|self\./);
  }
});
