const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

for (const [service, destination] of [['park','/park/'],['pajang','/features/pajang/station.html?tab=profile']]) {
  test(service + ' help, creator and nested policy pages preserve the source service', () => {
    for (const file of ['guide.html','features/guide/creator.html','terms.html','privacy.html','delete-account.html','policies/2026-09-29/terms.html','policies/pajang-revision.html','child-safety.html']) {
      const dom = new JSDOM(read(file),{url:'https://ojjuda.kr/'+file+'?from='+service,runScripts:'outside-only',pretendToBeVisual:true});
      try {
        const {window} = dom, doc = window.document;
        window.matchMedia = () => ({matches:false});
        if (file === 'guide.html') {
          window.eval(read('features/guide/guide.js'));
          assert.deepEqual([...doc.querySelectorAll('main .guide-section')].map(s=>s.id),[service]);
        }
        window.eval(read('shared/navigation/section-back.js'));
        for (const anchor of doc.querySelectorAll('a[href]')) {
          const url = new URL(anchor.href);
          if (url.origin !== window.location.origin) continue;
          assert.notEqual(url.pathname,'/world.html',file+' '+anchor.textContent);
          if (anchor.matches('[data-section-return]')) assert.equal(url.pathname+url.search,destination);
          if (!anchor.getAttribute('href').startsWith('#') && /(?:privacy|terms|delete-account|pajang-revision|guide|creator)\.html$/.test(url.pathname)) assert.equal(url.searchParams.get('from'),service);
        }
      } finally { dom.window.close(); }
    }
  });
}
