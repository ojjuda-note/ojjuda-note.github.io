// Run after the G2 SDK has been bundled by note/vendor/build.mjs.
import {copyFile, mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';

const [directory,tools]=process.argv.slice(2);
if (!directory || !tools) throw Error('Expected output and npm tools directories');
const output=resolve(directory);
await mkdir(output,{recursive:true});
const source=await readFile('park/glasses.html','utf8');
const match=source.match(/<main\b[\s\S]*?<\/main>/);
if (!match) throw Error('Missing G2 phone controls');
const main=match[0].replace(/<a href="\/park\/" class="back-link">.*?<\/a>/,'')
  .replace(/<p id="glass-signin"[\s\S]*?<\/p>/,'<p id="glass-signin" hidden></p>')
  .replace(/<details id="g2-setup"[\s\S]*?<\/details>/,'<div id="g2-setup" hidden></div>');
const js=await readFile('note/glasses.js','utf8');
const localJs=js.replace(/import\('\/park\/even-g2\.bundle\.mjs\?[^']+'\)/,"import('./even-g2.bundle.mjs')");
if (localJs===js || /(?:src|href)="\//.test(main)) throw Error('Check G2 package asset paths');
await writeFile(join(output,'glasses.js'),localJs);
await writeFile(join(output,'index.html'),`<!doctype html>
<html lang="ko" data-even-app="1"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>오쭈다 공원</title>
<link rel="stylesheet" href="./glasses.css"></head><body>
${main}
<script src="./supabase.js"></script><script src="./boot.js"></script><script src="./glasses.js"></script>
</body></html>`);
for (const [from,to] of [['note/glasses.css','glasses.css'],['note/even-app/boot.js','boot.js'],
  ['park/even-g2.bundle.mjs','even-g2.bundle.mjs'],
  [join(tools,'node_modules/@supabase/supabase-js/dist/umd/supabase.js'),'supabase.js']]) {
  await copyFile(from,join(output,to));
}
