const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const hub=require('../features/home/agit-hub.js');

test('the main hub links to personal saju and offers no separate compatibility entry',t=>{
  const dom=new JSDOM(hub.markup({}, {}, '2026-11-13'),{url:'https://ojjuda.kr/world.html?tab=hub'});
  t.after(()=>dom.window.close());
  const document=dom.window.document;
  const personal=document.querySelector('a.agit-saju-banner');
  assert.ok(personal);
  assert.equal(personal.getAttribute('href'),'/games/starlit-saju/');
  assert.equal(document.querySelector('a[href*="compatibility"]'),null);
  assert.doesNotMatch(document.body.textContent,/궁합/);
  assert.match(personal.textContent,/30\s*쭈/);
  assert.match(personal.textContent,/10\s*쭈/);
});

test('the saju first screen links to standalone compatibility before asking for a personal birth profile',async t=>{
  const html=await fs.readFile(path.join(__dirname,'../games/starlit-saju/index.html'),'utf8');
  const dom=new JSDOM(html,{url:'https://ojjuda.kr/games/starlit-saju/'});
  t.after(()=>dom.window.close());
  const {document,Node}=dom.window;
  const nav=document.querySelector('.reading-service-nav');
  const pair=nav?.querySelector('a[href="./compatibility.html"]');
  const form=document.getElementById('birth-form');
  assert.ok(pair,'the first screen exposes compatibility before any personal saju purchase');
  assert.equal(pair.href,'https://ojjuda.kr/games/starlit-saju/compatibility.html');
  assert.match(pair.textContent,/궁합/);
  assert.match(pair.textContent,/20\s*쭈/);
  assert.ok(pair.compareDocumentPosition(form)&Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(pair.closest('form, [hidden], #result'),null,'the link is usable before filling a birthday or unlocking a result');
  assert.equal(document.querySelector('[name="entry-topic"][value="compatibility"]'),null,'compatibility cannot accidentally buy a personal saju topic');
});
