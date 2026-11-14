import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const kinds=['liar','king','minority','mission','bomb','truth','fingers','imagevote','initial'];
const kind=process.argv[2];
if(!kinds.includes(kind))throw Error('Choose one drinking game catalog.');
const contentDir=path.join(root,'games/drinking/content');
const base=JSON.parse(fs.readFileSync(path.join(contentDir,kind+'.json'),'utf8'));
const addition=JSON.parse(fs.readFileSync(path.join(contentDir,'expansions/party300',kind+'.json'),'utf8'));
if(addition.kind!==kind||addition.release!=='party300'||!Array.isArray(addition.entries)||addition.entries.length!==300)throw Error('An expansion must add exactly 300 entries.');
const pair=kind==='minority'||kind==='mission';
const truth=kind==='truth';
const initial=kind==='initial';
const initialLetters='ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const initialPattern=/^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$/u;
const initialWordPattern=/^[가-힣]{2}$/u;
if(initial){
  if(base.entries.some(text=>typeof text!=='string'||!initialPattern.test(text)))throw Error('Keep the original two-initial catalog.');
  const counts=new Map();
  for(const word of addition.entries){
    if(typeof word!=='string'||!initialWordPattern.test(word))throw Error('Add actual two-syllable Hangul words.');
    const key=[...word].map(letter=>initialLetters[Math.floor((letter.codePointAt(0)-0xac00)/588)]).join('');
    counts.set(key,(counts.get(key)||0)+1);
  }
  if(counts.size!==60||[...counts.values()].some(count=>count!==5)||base.entries.some(key=>!counts.has(key)))throw Error('Provide five words for each of 60 initial keys, including every original key.');
}
let currentBase=base.entries;
let corrections=[];
if(kind==='bomb'){
  const correction=JSON.parse(fs.readFileSync(path.join(contentDir,'corrections/bomb-quick-categories.json'),'utf8'));
  corrections=correction.entries;
  if(correction.kind!==kind||!Array.isArray(corrections)||corrections.length!==base.entries.length)throw Error('Correct every original bomb topic.');
  const mapping=new Map(corrections.map(entry=>[entry.from,entry.to]));
  if(mapping.size!==base.entries.length||base.entries.some(word=>!mapping.has(word)))throw Error('Corrections must match the original bomb catalog exactly.');
  currentBase=base.entries.map(word=>mapping.get(word));
}
const entries=[...currentBase,...addition.entries];
const canonical=text=>text.normalize('NFKC').replace(/\s+/gu,'').toLowerCase();
const seen=new Set();
for(const entry of entries){
  if(truth&&!['mild','spicy'].includes(entry?.flavor))throw Error('Invalid truth flavor');
  const parts=pair?entry:[truth?entry.body:entry];
  if(!Array.isArray(parts)||parts.length!==(pair?2:1))throw Error('Invalid choice pair');
  for(const text of parts){
    if(typeof text!=='string'||text!==text.trim()||!text||[...text].length>(kind==='king'?80:truth?240:120)||text.includes('$cards$'))throw Error('Invalid wording: '+text);
    if(initial&&!initialPattern.test(text)&&!initialWordPattern.test(text))throw Error('Invalid initial or word');
  }
  const normalized=parts.map(canonical);
  if(pair&&normalized[0]===normalized[1])throw Error('Identical choices');
  const key=JSON.stringify(pair?normalized.sort():normalized);
  if(seen.has(key))throw Error('Repeated wording, including the existing catalog: '+key);
  seen.add(key);
}
const migrationDir=path.join(root,'supabase/migrations');
const migrationNames=fs.readdirSync(migrationDir).filter(name=>name.endsWith('_drinking_expand_'+kind+'_300.sql'));
if(migrationNames.length!==1)throw Error('Create exactly one migration with the Supabase CLI before building this expansion.');
const json=JSON.stringify(addition.entries,null,2);
const initialSql=initial?fs.readFileSync(path.join(root,'scripts/sql/drinking-initial-word-bank.sql'),'utf8').trimEnd()+'\n':'';
const correctionSql=corrections.length?`-- Replace the old thought-heavy categories while retaining their IDs and flags.
-- Room topics and deadlines are snapshots and deliberately remain untouched.
do $fix$
declare corrected integer;
begin
 update ojjuda_arcade_internal.drinking_content_items c
 set body=entry->>'to',revision=c.revision+1
 from jsonb_array_elements($corrections$${JSON.stringify(corrections,null,2)}$corrections$::jsonb) entry
 where c.kind='bomb' and c.body=entry->>'from' and c.second is null;
 get diagnostics corrected=row_count;
 if corrected<>${corrections.length} then raise exception 'Bomb catalog changed; review the correction before applying'; end if;
end;
$fix$;
`:'';
const sql=`-- Add 300 reviewed ${kind} entries; preserve existing IDs, queues and room snapshots.
begin;
select pg_advisory_xact_lock(24613,911);
${correctionSql}${initialSql}${truth?`with added as (
 insert into ojjuda_arcade_internal.drinking_truth_cards(flavor,body,party_pick)
 select entry->>'flavor',entry->>'body',true
 from jsonb_array_elements($cards$${json}$cards$::jsonb) entry
 returning id,flavor,body
)
insert into ojjuda_arcade_internal.drinking_truth_history(fingerprint,card_id)
select ojjuda_arcade_internal.drinking_prompt_fingerprint('truth',flavor,body),id from added;`:`insert into ojjuda_arcade_internal.drinking_content_items(kind,body,second,party_pick)
select '${kind}',${pair?"entry->>0,entry->>1":"entry#>>'{}',null"},true
from jsonb_array_elements($cards$${json}$cards$::jsonb) entry;`}${initial?"\nnotify pgrst,'reload schema';":''}
commit;
`;
fs.writeFileSync(path.join(migrationDir,migrationNames[0]),sql);
// Keep the previously applied rebuild migration and its base manifest intact.
// Only current client catalogs combine that base with this reviewed expansion.
if(kind!=='initial'){
  const file=path.join(root,'games/drinking',['liar','minority','mission','bomb'].includes(kind)?'round-prompts.js':'community-prompts.js');
  let source=fs.readFileSync(file,'utf8');
  for(const section of truth?['mild','spicy']:[kind]){
    const values=truth?entries.filter(entry=>entry.flavor===section).map(entry=>entry.body):entries;
    const pattern=new RegExp('^  '+section+': \\[\\n[\\s\\S]*?^  \\](,?)','m');
    if(!pattern.test(source))throw Error('Client catalog section missing');
    const formatted=JSON.stringify(values,null,2).split('\n').map((line,i)=>i?'  '+line:line).join('\n');
    source=source.replace(pattern,(_,comma)=>'  '+section+': '+formatted+comma);
  }
  fs.writeFileSync(file,source);
}
console.log(`${kind}: ${base.entries.length} kept + ${addition.entries.length} new = ${entries.length}; ${migrationNames[0]}`);
