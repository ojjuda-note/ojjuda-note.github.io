import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {catalogRoot,drinkingKinds,isPairKind,loadDrinkingCatalog,loadDrinkingPolish} from './lib/drinking-catalogs.mjs';

function jsonLiteral(value){
  const json=JSON.stringify(value,null,2);
  let delimiter='$wording$';
  while(json.includes(delimiter))delimiter=delimiter.slice(0,-1)+'x$';
  return delimiter+json+delimiter+'::jsonb';
}

export function createPolishPlan(kind,{root=catalogRoot}={}){
  if(!drinkingKinds.includes(kind))throw Error('Choose one drinking game catalog');
  const correction=loadDrinkingPolish(kind,{root});
  if(!correction)throw Error('The reviewed natural1 correction manifest is missing: '+kind);
  if(!correction.entries.length)throw Error('No wording changed; no polish migration is needed: '+kind);
  const original=loadDrinkingCatalog(kind,{root,includePolish:false});
  const catalog=loadDrinkingCatalog(kind,{root});
  if(catalog.length!==original.length)throw Error('Wording corrections must preserve the catalog count');
  const migrationDir=path.join(root,'supabase/migrations');
  const names=fs.readdirSync(migrationDir).filter(name=>new RegExp('^\\d+_drinking_polish_'+kind+'\\.sql$').test(name));
  if(names.length!==1)throw Error('Create exactly one new polish migration with the Supabase CLI first: '+kind);
  const truth=kind==='truth',pair=isPairKind(kind);
  const table='ojjuda_arcade_internal.'+(truth?'drinking_truth_cards':'drinking_content_items');
  const body=side=>truth?`(entry->'${side}')->>'body'`:pair?`(entry->'${side}')->>0`:`(entry->'${side}')#>>'{}'`;
  const second=side=>pair?`(entry->'${side}')->>1`:'null::text';
  const match=truth?`c.flavor=(entry->'from')->>'flavor' and c.body=${body('from')}`
    :`c.kind='${kind}' and c.body=${body('from')} and c.second is not distinct from ${second('from')}`;
  const assignment=`body=${body('to')}${pair?',second='+second('to'):''},revision=c.revision+1`;
  let blockTag='$polish$';
  while(JSON.stringify(correction.entries).includes(blockTag))blockTag=blockTag.slice(0,-1)+'x$';
  const sql=`-- Polish ${kind} wording in place; preserve IDs, flags, queues and live room snapshots.
begin;
select pg_advisory_xact_lock(24613,911);
do ${blockTag}
declare
 edits constant jsonb:=${jsonLiteral(correction.entries)};
 corrected integer;
begin
 -- Every source must identify exactly one row, including archived rows. A missing
 -- source and a duplicate source must not cancel out in a total row-count check.
 if exists(select 1 from jsonb_array_elements(edits) entry
  where (select count(*) from ${table} c where ${match})<>1) then
  raise exception '${kind}_wording_source_changed';
 end if;
${truth?` -- A prior spelling may already belong to this card, never to a different one.
 if exists(select 1 from jsonb_array_elements(edits) entry
  join ${table} c on ${match}
  join ojjuda_arcade_internal.drinking_truth_history h
   on h.fingerprint=ojjuda_arcade_internal.drinking_prompt_fingerprint('truth',c.flavor,${body('to')})
  where h.card_id is distinct from c.id) then raise exception 'truth_wording_history_conflict'; end if;
 with changed as (
  update ${table} c set ${assignment}
  from jsonb_array_elements(edits) entry where ${match}
  returning c.id,c.flavor,c.body
 ), remembered as (
  insert into ojjuda_arcade_internal.drinking_truth_history(fingerprint,card_id)
  select ojjuda_arcade_internal.drinking_prompt_fingerprint('truth',flavor,body),id from changed
  on conflict(fingerprint) do nothing returning card_id
 )
 select count(*) into corrected from changed;`
 :` -- The existing remember trigger adds new king/fingers/imagevote fingerprints;
 -- older fingerprints and moderation records remain intact.
 update ${table} c set ${assignment}
 from jsonb_array_elements(edits) entry where ${match};
 get diagnostics corrected=row_count;`}
 if corrected<>${correction.entries.length} then raise exception '${kind}_wording_row_count_changed'; end if;
end;
${blockTag};
commit;
`;
  let clientPath=null,clientSource=null;
  if(kind!=='initial'){
    clientPath=path.join(root,'games/drinking',['liar','minority','mission','bomb'].includes(kind)?'round-prompts.js':'community-prompts.js');
    clientSource=fs.readFileSync(clientPath,'utf8');
    for(const section of truth?['mild','spicy']:[kind]){
      const values=truth?catalog.filter(entry=>entry.flavor===section).map(entry=>entry.body):catalog;
      const pattern=new RegExp('^  '+section+': \\[\\n[\\s\\S]*?^  \\](,?)','gm');
      if([...clientSource.matchAll(pattern)].length!==1)throw Error('Find exactly one current client catalog section: '+section);
      const formatted=JSON.stringify(values,null,2).split('\n').map((line,i)=>i?'  '+line:line).join('\n');
      clientSource=clientSource.replace(pattern,(_,comma)=>'  '+section+': '+formatted+comma);
    }
    if(truth){
      // An old official card may have been saved before it became official.
      // Keep its identity for filtering without putting it back in either deck.
      const active=new Set(catalog.map(entry=>entry.body));
      const retired=[...new Set(correction.entries.map(edit=>edit.from.body))].filter(body=>!active.has(body));
      const retiredCode='window.DrinkingPromptCatalog.retiredTruth = '+JSON.stringify(retired,null,2)+';\n';
      const retiredPattern=/^window\.DrinkingPromptCatalog\.retiredTruth = \[\n[\s\S]*?^\];\n?/gm;
      const existing=[...clientSource.matchAll(retiredPattern)].length;
      if(existing>1)throw Error('Find at most one retired truth catalog');
      clientSource=existing?clientSource.replace(retiredPattern,retiredCode):clientSource+'\n'+retiredCode;
    }
  }
  return {kind,correction,original,catalog,sql,migrationPath:path.join(migrationDir,names[0]),clientPath,clientSource};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const plan=createPolishPlan(process.argv[2]);
  fs.writeFileSync(plan.migrationPath,plan.sql);
  if(plan.clientPath)fs.writeFileSync(plan.clientPath,plan.clientSource);
  console.log(`${plan.kind}: ${plan.correction.entries.length} corrected in ${plan.catalog.length} existing entries; ${path.basename(plan.migrationPath)}`);
}
