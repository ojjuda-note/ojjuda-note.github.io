// Run after the G2 SDK has been bundled by note/vendor/build.mjs.
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createRequire} from 'node:module';

const [directory,tools]=process.argv.slice(2);
if (!directory || !tools) throw Error('Expected output and npm tools directories');
const output=resolve(directory);
await mkdir(output,{recursive:true});
const source=await readFile('park/glasses.html','utf8');
const match=source.match(/<main\b[\s\S]*?<\/main>/);
if (!match) throw Error('Missing G2 phone controls');
const main=match[0].replace(/<a href="\/park\/" class="back-link">.*?<\/a>/,'')
  .replace(/<p id="glass-signin"[\s\S]*?<\/p>/,'<p id="glass-signin" hidden></p>')
  .replace(/<details id="g2-setup"[\s\S]*?<\/details>/,'<div id="g2-setup" hidden></div>')
  .replace(/<p id="g2-status"[\s\S]*?<\/p>/,'<p id="g2-status" class="status" role="status"></p>');
const js=await readFile('note/glasses.js','utf8');
const localJs=js.replace(/await import\('\/park\/even-g2\.bundle\.mjs\?[^']+'\)/,'window.OjjudaEvenG2');
if (localJs===js || /(?:src|href)="\//.test(main)) throw Error('Check G2 package asset paths');
await writeFile(join(output,'glasses.js'),localJs);
await writeFile(join(output,'index.html'),`<!doctype html>
<html lang="ko" data-even-app="1"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>오쭈다 공원</title>
<link rel="stylesheet" href="./glasses.css"></head><body>
${main}
<script src="./even-g2.js"></script><script src="./supabase.js"></script><script src="./boot.js"></script><script src="./glasses.js"></script>
</body></html>`);
const {build}=createRequire(resolve('note/vendor/package.json'))('esbuild');
await build({entryPoints:['park/even-g2.bundle.mjs'],outfile:join(output,'even-g2.js'),bundle:true,
  format:'iife',globalName:'OjjudaEvenG2',platform:'browser',target:'es2020',minify:true});
for (const [from,to] of [['note/glasses.css','glasses.css'],['note/even-app/boot.js','boot.js'],
  [join(tools,'node_modules/@supabase/supabase-js/dist/umd/supabase.js'),'supabase.js']]) {
  await copyFile(from,join(output,to));
}
