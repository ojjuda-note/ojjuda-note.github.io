// Convert the offline replay log into small production layout/budget metadata.
// The long move witnesses stay local; no answer sequences are published.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const log=path.join(__dirname,'../fixtures/flat-certified-work.jsonl');
const file=path.join(root,'screw-flat-physics.js');
const entries=fs.readFileSync(log,'utf8').trim().split('\n').map(JSON.parse).sort((a,b)=>a.stage-b.stage);
if(entries.length!==988||entries.some(r=>r.error||!r.route||r.moves!==r.route.length))throw Error('Incomplete physics certificates');
const stages=Array.from({length:989},(_,i)=>i+12).filter(stage=>stage!==25);
if(stages.some((stage,i)=>stage!==entries[i].stage))throw Error('Missing or duplicate certified stage');
const rows=entries.map(({stage,layout,moves})=>`${stage},${layout[0]},${layout[1]},${moves}`).join('\n');
const replacement=`const VALIDATED_LAYOUTS=Object.fromEntries(\`\n${rows}\n\`.trim().split(/\\s+/).map(row=>{const [stage,variant,gap,moves]=row.split(',').map(Number);return[stage,[variant,gap,moves]];}));`;
const source=fs.readFileSync(file,'utf8');
const marker=/const VALIDATED_LAYOUTS=(?:\{\}|Object\.fromEntries\(`\n[\s\S]*?\n`\.trim\(\)\.split\(\/\\s\+\/\)\.map\(row=>\{const \[stage,variant,gap,moves\]=row\.split\(','\)\.map\(Number\);return\[stage,\[variant,gap,moves\]\];\}\)\));/;
if(!marker.test(source))throw Error('Production layout marker is missing');
fs.writeFileSync(file,source.replace(marker,replacement));
console.log(`Generated ${entries.length} production board layouts and budgets; full witness file remains local.`);
