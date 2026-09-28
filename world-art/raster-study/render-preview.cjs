#!/usr/bin/env node
'use strict';
// Rebuild only the three-sprite comparison. Never imports or modifies world.html.
// Run: node world-art/raster-study/render-preview.cjs
const fs = require('fs');
const path = require('path');
const directory = __dirname;
const repository = path.resolve(directory, '../..');
const source = fs.readFileSync(path.join(directory, 'room-before.svg'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(directory, 'fixture.json'), 'utf8'));
const assets = {avatar:'avatar.webp', dog:'dachshund.webp', sofa:'sofa.webp'};
let after = source;
for (const [key, file] of Object.entries(assets)) {
  if (!fs.existsSync(path.join(directory, file))) throw new Error('Missing image: '+file);
  const slot=fixture.slots[key];
  if (!Object.values(slot).every(Number.isFinite)) throw new Error('Invalid coordinates: '+key);
  const region=new RegExp('<!--study:'+key+':start-->[\\s\\S]*?<!--study:'+key+':end-->','g');
  if ([...source.matchAll(region)].length !== 1) throw new Error('Expected one visual slot: '+key);
  const anchor=key==='avatar'?[0,-3]:fixture.anchors[key];
  const radii=key==='avatar'?[14,3.2]:key==='dog'?[18,4.5]:[30,10];
  const shadow=`<ellipse cx="${anchor[0]}" cy="${anchor[1]}" rx="${radii[0]}" ry="${radii[1]}" fill="#5e4536" opacity=".07"/><ellipse cx="${anchor[0]}" cy="${anchor[1]}" rx="${radii[0]*.74}" ry="${radii[1]*.68}" fill="#5e4536" opacity=".045"/>`;
  const image=shadow+`<image data-study-art="${key}" href="${file}" x="${slot.x}" y="${slot.y}" width="${slot.width}" height="${slot.height}" preserveAspectRatio="xMidYMid meet"/>`;
  after=after.replace(region,`<!--study:${key}:start-->${image}<!--study:${key}:end-->`);
}
fs.writeFileSync(path.join(directory,'room-after.svg'),after);
const inline=(svg,prefix)=>svg.replace(/href="(avatar|dachshund|sofa)\.webp"/g,'href="world-art/raster-study/$1.webp"').replace(/\bid="([^"]+)"/g,(_,id)=>'id="'+prefix+id+'"').replace(/url\(#([^\)]+)\)/g,(_,id)=>'url(#'+prefix+id+')');
const html=`<!doctype html>
<html lang="ko">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f3f1f9"><meta name="robots" content="noindex"><title>캐릭터·강아지·소파 3종 비교 · 오쭈다월드</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f3f1f9;color:#29283d;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif}button,a{-webkit-tap-highlight-color:transparent}a{color:inherit;text-decoration:none}.page{max-width:820px;margin:0 auto;padding:22px 18px 40px}.head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.brand{font-size:12px;font-weight:700;color:#8b809b}.back{font-size:12px;color:#766e83;padding:8px 0}h1{font-size:23px;letter-spacing:-.8px;line-height:1.4;margin:0 0 7px}p{font-size:12px;line-height:1.65;margin:0;color:#797285;word-break:keep-all}.compare{margin:18px 0 28px;background:#fff;border:1px solid #e6e2ed;border-radius:25px;overflow:hidden;box-shadow:0 10px 28px #46406408}.controls{display:flex;gap:5px;margin:14px auto 4px;padding:4px;background:#f1eff6;border-radius:99px;width:max-content}.controls button{border:0;background:transparent;color:#8b8399;min-width:110px;min-height:39px;border-radius:99px;font:600 13px system-ui;cursor:pointer}.controls button[aria-pressed="true"]{background:#fff;color:#d5578b;box-shadow:0 2px 9px #29213d0b}.controls button:focus-visible{outline:2px solid #d5578b;outline-offset:2px}.stage{position:relative;max-width:700px;margin:0 auto;padding:5px 11px 11px}.scene[hidden]{display:none!important}.scene svg{display:block;width:100%;height:auto;aspect-ratio:400/380}.view-label{text-align:center;padding:0 12px 15px;font-size:11px;color:#918899}.assets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.asset{margin:0;background:#fff;border:1px solid #e6e2ed;border-radius:23px;overflow:hidden}.art{height:250px;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 65%,#fff 30%,#f7f4fa 100%);padding:16px}.art img{display:block;width:100%;height:100%;object-fit:contain}.asset figcaption{padding:4px 17px 17px;font-size:13px;font-weight:650}.section-title{font-size:15px;margin:0 0 12px;letter-spacing:-.3px}.foot{margin-top:16px;text-align:center;font-size:11px;color:#9a92a5}@media(max-width:600px){.page{padding:16px 14px 28px}h1{font-size:21px}.compare{margin-top:15px;border-radius:22px}.stage{padding:2px 2px 6px}.controls{margin-top:12px}.assets{grid-template-columns:1fr;gap:13px}.art{height:300px;padding:18px}.asset.avatar .art{height:390px}.asset figcaption{padding-bottom:17px}.section-title{font-size:14px}.compare{margin-bottom:24px}}@media(prefers-reduced-motion:no-preference){.controls button{transition:background .15s,color .15s}}
</style></head>
<body><main class="page"><header><div class="head"><span class="brand">오쭈다월드 · 그림 비교</span><a class="back" href="world.html">월드로 ↗</a></div><h1>캐릭터·강아지·소파 3종 비교</h1><p>세 소재만 교체한 시험 화면이에요.<br>다른 가구와 방은 이전 그림입니다.</p></header>
<section class="compare" aria-label="같은 방의 그림 비교"><div class="controls" role="group" aria-label="그림 선택"><button type="button" data-view="before" aria-pressed="false" aria-controls="scene-before">이전</button><button type="button" data-view="after" aria-pressed="true" aria-controls="scene-after">새 소재</button></div><div class="stage"><div class="scene" id="scene-before" role="img" aria-label="이전 그림의 거실" hidden>${inline(source,'before-')}</div><div class="scene" id="scene-after" role="img" aria-label="캐릭터, 강아지, 소파 세 소재를 바꾼 같은 거실">${inline(after,'after-')}</div></div><div class="view-label" id="view-label" aria-live="polite">새 소재 · 3종만 교체</div></section>
<section aria-label="새 소재 크게 보기"><h2 class="section-title">가까이 보기</h2><div class="assets"><figure class="asset avatar"><div class="art"><img src="world-art/raster-study/avatar.webp" width="1024" height="1536" alt="분홍 카디건과 청바지를 입고 손을 흔드는 캐릭터" decoding="async"></div><figcaption>캐릭터</figcaption></figure><figure class="asset"><div class="art"><img src="world-art/raster-study/dachshund.webp" width="1536" height="1024" alt="갈색 털과 긴 귀가 있는 닥스훈트 강아지" decoding="async"></div><figcaption>강아지</figcaption></figure><figure class="asset"><div class="art"><img src="world-art/raster-study/sofa.webp" width="1536" height="1024" alt="천의 질감이 보이는 파란 소파" decoding="async"></div><figcaption>소파</figcaption></figure></div></section><p class="foot">같은 방에서 그림만 비교해 보세요.</p></main>
<script>
const controls=[...document.querySelectorAll('[data-view]')];
function show(view){for(const button of controls)button.setAttribute('aria-pressed',String(button.dataset.view===view));document.getElementById('scene-before').hidden=view!=='before';document.getElementById('scene-after').hidden=view!=='after';document.getElementById('view-label').textContent=view==='after'?'새 소재 · 3종만 교체':'이전 그림';}
for(const button of controls)button.addEventListener('click',()=>show(button.dataset.view));
</script></body></html>`;
fs.writeFileSync(path.join(repository,'world-art-quality.html'),html);
console.log(JSON.stringify({page:'world-art-quality.html',images:Object.values(assets),replacedSlots:3,coordinates:fixture.slots}));
