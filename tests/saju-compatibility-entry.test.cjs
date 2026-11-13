const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const hub=require('../features/home/agit-hub.js');

test('the main hub offers compatibility directly alongside personal saju with its separate twenty-ju price',t=>{
  const dom=new JSDOM(hub.markup({}, {}, '2026-11-13'),{url:'https://ojjuda.kr/world.html?tab=hub'});
  t.after(()=>dom.window.close());
  const document=dom.window.document;
  const pair=document.querySelector('a.agit-compatibility-banner');
  const personal=document.querySelector('a.agit-saju-banner');
  assert.ok(pair,'visitors need a main-menu entry without first opening or purchasing personal saju');
  assert.ok(personal,'the existing personal saju entry stays available');
  assert.equal(pair.getAttribute('href'),'/games/starlit-saju/compatibility.html');
  assert.equal(personal.getAttribute('href'),'/games/starlit-saju/');
  assert.equal(pair.closest('.agit-saju-banner'),null,'compatibility is a separate navigable entry');
  assert.match(pair.textContent,/궁합/);
  assert.match(pair.textContent,/20\s*쭈/);
  assert.match(pair.getAttribute('aria-label'),/궁합.*20\s*쭈/);
  assert.match(pair.textContent,/24\s*시간/);
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
