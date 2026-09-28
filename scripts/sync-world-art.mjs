import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'world.html');
let html = fs.readFileSync(target, 'utf8');
const loaderStart = '<!-- WORLD_ART_ASSETS_START -->';
const loaderEnd = '<!-- WORLD_ART_ASSETS_END -->';
const codeStart = '/* WORLD_ART_INSTALL_START */';
const codeEnd = '/* WORLD_ART_INSTALL_END */';
function replaceOrInsert(source, start, end, content, before) {
  const startAt = source.indexOf(start);
  if (startAt >= 0) {
    const endAt = source.indexOf(end, startAt);
    if (endAt < 0) throw new Error('Incomplete World art marker');
    return source.slice(0, startAt) + content + source.slice(endAt + end.length);
  }
  if (source.split(before).length !== 2) throw new Error('World art insertion boundary is not unique');
  return source.replace(before, content + '\n' + before);
}
const assets = ['avatar', 'furniture', 'pets', 'room'];
for (const asset of assets) {
  if (!fs.existsSync(path.join(root, 'world-art', asset + '.js'))) throw new Error('Missing art asset module: ' + asset);
}
const loader = [loaderStart, ...assets.map(asset => `<script src="world-art/${asset}.js?v=20260928-art1"></script>`), loaderEnd].join('\n');
const install = [codeStart, fs.readFileSync(path.join(root, 'world-art/install.inc.js'), 'utf8').trim(), codeEnd].join('\n');
html = replaceOrInsert(html, loaderStart, loaderEnd, loader, '<script type="module">');
html = replaceOrInsert(html, codeStart, codeEnd, install, 'Object.assign(sr,Ln,im,Pf,yf,mm,$0,Gd,r0,Qp,G0,fp);h0(H);');
fs.writeFileSync(target, html);
console.log('Updated World artwork module references and renderer installation.');
