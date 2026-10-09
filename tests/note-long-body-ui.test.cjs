const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args:['--no-sandbox']});
  try {
    for (const width of [360, 1280]) {
      const page = await browser.newPage({viewport:{width,height:900}});
      await page.route('**/*', route => route.abort());
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.setContent(read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,''));
      for (const file of ['note/style.css','note/features.css']) await page.addStyleTag({content:read(file)});
      await page.addScriptTag({content:read('note/preview.js')});
      const result = await page.evaluate(() => {
        const body = '[창작 웹소설] 긴 글의 마지막까지\n\n' + '정류장에 도착하니 어제 맡긴 우산이 기다리고 있었다.\n'.repeat(1200) + '\n끝 문장.';
        feed.hidden = true; detail.hidden = false;
        const card = {id:'00000000-0000-4000-8000-000000000011', kind:'memo', body, tags:['웹소설'], background_key:'42',created_at:new Date().toISOString()};
        slot.replaceChildren(cardElement(card,false,true));
        refreshExpandedBodies();
        const full = slot.querySelector('.note-full-body');
        const reader = full.querySelector('p');
        const article = cardElement(card); document.body.append(article); refreshExpandedBodies();
        const previewHeight = article.querySelector('.photo').getBoundingClientRect().height;
        const readerResult = {fullText:reader.textContent===body, visible:!full.hidden && full.open, readerFont:parseFloat(getComputedStyle(reader).fontSize), previewLength:article.querySelector('.card-quote').textContent.length, previewHeight, readLink:!!article.querySelector('.note-read-more')};
        backdrop.hidden = false;
        text.value = body; resizeComposerText();
        const editor = {maxLength:text.maxLength, body:text.value===body, font:parseFloat(getComputedStyle(text).fontSize), overflow:getComputedStyle(text).overflowY, scrollable:text.scrollHeight>text.clientHeight};
        backdrop.hidden = true;
        article.remove();
        return {readerResult,editor,horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
      });
      assert.equal(result.readerResult.fullText,true);
      assert.equal(result.readerResult.visible,true);
      assert.ok(result.readerResult.readerFont>=16);
      assert.ok(result.readerResult.previewLength<=281);
      assert.ok(result.readerResult.previewHeight<1000);
      assert.equal(result.readerResult.readLink,true);
      assert.deepEqual(result.editor,{maxLength:-1,body:true,font:16,overflow:'auto',scrollable:true});
      assert.equal(result.horizontalOverflow,false);
      assert.deepEqual(errors,[]);
      if (process.env.LONG_NOTE_QA_DIR) await page.screenshot({path:path.join(process.env.LONG_NOTE_QA_DIR,`long-note-${width}.png`)});
      await page.close();
    }
    console.log('PASS: long Note text is readable in bounded mobile/desktop previews, full readers and scrollable writers without truncation.');
  } finally { await browser.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
