import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const versions={liar:'20261114061001',king:'20261114061002',minority:'20261114061003',mission:'20261114061004',bomb:'20261114061005',truth:'20261114061006',fingers:'20261114061007',imagevote:'20261114061008',initial:'20261114061009'};
const kind=process.argv[2];
if(!Object.hasOwn(versions,kind))throw Error('Choose one drinking game catalog.');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'games/drinking/content',kind+'.json'),'utf8'));
if(catalog.kind!==kind||!Array.isArray(catalog.entries)||catalog.entries.length<2)throw Error('Invalid catalog');
const pair=kind==='minority'||kind==='mission';
const truth=kind==='truth';
const canonical=text=>text.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
const seen=new Set();
for(const entry of catalog.entries){
  if(truth&&!['mild','spicy'].includes(entry?.flavor))throw Error('Invalid truth flavor');
  const parts=pair?entry:[truth?entry.body:entry];
  if(!Array.isArray(parts)||parts.length!==(pair?2:1))throw Error('Invalid choice pair');
  for(const text of parts){
    if(typeof text!=='string'||text!==text.trim()||!text||[...text].length>(kind==='king'?80:truth?240:120)||text.includes('$cards$'))throw Error('Invalid wording: '+text);
    if(kind==='initial'&&!/^[ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ]{2}$/.test(text))throw Error('Invalid initials');
  }
  const normalized=parts.map(canonical);
  if(pair&&normalized[0]===normalized[1])throw Error('Identical choices');
  const key=JSON.stringify(pair?normalized.sort():normalized);
  if(seen.has(key))throw Error('Repeated wording: '+key);
  seen.add(key);
}
if(truth&&!['mild','spicy'].every(flavor=>catalog.entries.some(entry=>entry.flavor===flavor)))throw Error('Both truth flavors are required');
const sql=truth?`-- Replace every truth card while retaining only hashes that prevent old suggestions returning.
-- Dealt questions and current room decks are snapshots, not foreign keys to these cards.
begin;
select pg_advisory_xact_lock(24613,911);
-- Submissions do not take the catalog advisory lock. Keep the hash snapshot
-- and the queue deletion together while those inserts wait for this commit.
lock table ojjuda_arcade_internal.drinking_prompt_queue in share row exclusive mode;
insert into ojjuda_arcade_internal.drinking_prompt_baseline(fingerprint)
select fingerprint from ojjuda_arcade_internal.drinking_truth_history on conflict do nothing;
insert into ojjuda_arcade_internal.drinking_prompt_baseline(fingerprint)
select fingerprint from ojjuda_arcade_internal.drinking_prompt_queue where kind='truth' on conflict do nothing;
delete from ojjuda_arcade_internal.drinking_truth_history;
delete from ojjuda_arcade_internal.drinking_truth_cards;
delete from ojjuda_arcade_internal.drinking_prompt_queue where kind='truth';
insert into ojjuda_arcade_internal.drinking_truth_cards(flavor,body,party_pick)
select entry->>'flavor',entry->>'body',true
from jsonb_array_elements($cards$${JSON.stringify(catalog.entries,null,2)}$cards$::jsonb) entry;
insert into ojjuda_arcade_internal.drinking_truth_history(fingerprint,card_id)
select ojjuda_arcade_internal.drinking_prompt_fingerprint('truth',flavor,body),id
from ojjuda_arcade_internal.drinking_truth_cards;
commit;
`:`-- Replace the ${kind} catalog completely. Current room snapshots remain untouched.
begin;
select pg_advisory_xact_lock(24613,911);
${['king','fingers','imagevote'].includes(kind)?`-- Submissions do not take the catalog advisory lock. Keep the hash snapshot
-- and the queue deletion together while those inserts wait for this commit.
lock table ojjuda_arcade_internal.drinking_prompt_queue in share row exclusive mode;
insert into ojjuda_arcade_internal.drinking_prompt_baseline(fingerprint)
select fingerprint from ojjuda_arcade_internal.drinking_prompt_queue where kind='${kind}' on conflict do nothing;
`:''}delete from ojjuda_arcade_internal.drinking_prompts where kind='${kind}';
delete from ojjuda_arcade_internal.drinking_content_items where kind='${kind}';
${['king','fingers','imagevote'].includes(kind)?`delete from ojjuda_arcade_internal.drinking_prompt_queue where kind='${kind}';
`:''}insert into ojjuda_arcade_internal.drinking_content_items(kind,body,second,party_pick)
select '${kind}',${pair?"entry->>0,entry->>1":"entry#>>'{}',null"},true
from jsonb_array_elements($cards$${JSON.stringify(catalog.entries,null,2)}$cards$::jsonb) entry;
commit;
`;
const output=path.join(root,'supabase/migrations',versions[kind]+'_drinking_rebuild_'+kind+'.sql');
fs.writeFileSync(output,sql);
const legacyFile=['liar','minority','mission','bomb'].includes(kind)?'round-prompts.js':'community-prompts.js';
if(kind!=='initial'){
  const file=path.join(root,'games/drinking',legacyFile);
  let source=fs.readFileSync(file,'utf8');
  for(const section of truth?['mild','spicy']:[kind]){
    const entries=truth?catalog.entries.filter(entry=>entry.flavor===section).map(entry=>entry.body):catalog.entries;
    const pattern=new RegExp('^  '+section+': \\[\\n[\\s\\S]*?^  \\](,?)','m');
    if(!pattern.test(source))throw Error('Legacy catalog section missing');
    const formatted=JSON.stringify(entries,null,2).split('\n').map((line,i)=>i?'  '+line:line).join('\n');
    source=source.replace(pattern,(_,comma)=>'  '+section+': '+formatted+comma);
  }
  fs.writeFileSync(file,source);
}
console.log(`${kind}: ${catalog.entries.length} reviewed entries; ${path.relative(root,output)}`);
