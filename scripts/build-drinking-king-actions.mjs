import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {catalogRoot,validateDrinkingCatalog} from './lib/drinking-catalogs.mjs';

// Historical catalogs remain unchanged so applied migrations can still be verified.
// This is the current king catalog for both the server pool and bundled wording.
export function createKingActionsPlan({root=catalogRoot}={}){
  const catalog=JSON.parse(fs.readFileSync(path.join(root,'games/drinking/content/king-actions.json'),'utf8'));
  if(catalog.revision!=='20261121-king-actions1')throw Error('Unknown king action catalog');
  const entries=[];
  for(const flavor of ['mild','spicy']){
    const words=catalog[flavor];
    if(!Array.isArray(words)||words.length!==40||words.filter(text=>text.startsWith('둘이 ')).length!==20){
      throw Error('Each flavor needs 20 solo and 20 two-person actions');
    }
    for(const body of words)entries.push({body,flavor});
  }
  validateDrinkingCatalog('king',entries.map(entry=>entry.body));
  const json=JSON.stringify(entries,null,2);
  if(json.includes('$actions$'))throw Error('Unexpected SQL delimiter in an action');
  const sql=`-- Replace king recommendations with short actions that need no props or travel.
-- Archive prior wording; retain moderation records and already-dealt room snapshots.
begin;
select pg_advisory_xact_lock(24613,911);
lock table ojjuda_arcade_internal.drinking_content_items in share row exclusive mode;
do $migration$
declare
 actions constant jsonb := $actions$${json}$actions$::jsonb;
 action jsonb;
 existing_id integer;
begin
 update ojjuda_arcade_internal.drinking_content_items c
 set active=false,revision=c.revision+1
 where c.kind='king' and c.active and not exists(
  select 1 from jsonb_array_elements(actions) a
  where c.body=a->>'body' and c.second is null
 );

 for action in select value from jsonb_array_elements(actions) loop
  select id into existing_id from ojjuda_arcade_internal.drinking_content_items
  where kind='king' and body=action->>'body' and second is null
  order by active desc,id limit 1;
  if existing_id is null then
   insert into ojjuda_arcade_internal.drinking_content_items(kind,body,party_pick,prompt_flavor)
   values('king',action->>'body',true,action->>'flavor');
  else
   update ojjuda_arcade_internal.drinking_content_items
   set active=true,party_pick=true,prompt_flavor=action->>'flavor',revision=revision+1
   where id=existing_id and (active,party_pick,prompt_flavor)
    is distinct from (true,true,action->>'flavor');
  end if;
 end loop;

 if (select count(*) from ojjuda_arcade_internal.drinking_content_items where kind='king' and active)
    <>jsonb_array_length(actions) then
  raise exception 'king_action_catalog_count_mismatch';
 end if;
 if exists(
  select 1 from jsonb_array_elements(actions) a where not exists(
   select 1 from ojjuda_arcade_internal.drinking_content_items c
   where c.kind='king' and c.active and c.party_pick and c.second is null
    and c.body=a->>'body' and c.prompt_flavor=a->>'flavor'
  )
 ) then raise exception 'king_action_catalog_mismatch'; end if;
end;
$migration$;
commit;
`;
  const migrationDir=path.join(root,'supabase/migrations');
  const files=fs.readdirSync(migrationDir).filter(file=>file.endsWith('_drinking_king_simple_actions.sql'));
  if(files.length!==1)throw Error('Create one king action migration with the Supabase CLI first');
  const clientPath=path.join(root,'games/drinking/community-prompts.js');
  const client=fs.readFileSync(clientPath,'utf8');
  const pattern=/^  king: \[\n[\s\S]*?^  \](,?)/gm;
  if([...client.matchAll(pattern)].length!==1)throw Error('Expected one bundled king catalog');
  const formatted=JSON.stringify(entries.map(entry=>entry.body),null,2).split('\n')
    .map((line,i)=>i?'  '+line:line).join('\n');
  const clientSource=client.replace(pattern,(_,comma)=>'  king: '+formatted+comma);
  return {catalog,entries,sql,migrationPath:path.join(migrationDir,files[0]),clientPath,clientSource};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const plan=createKingActionsPlan();
  for(const [file,expected] of [[plan.migrationPath,plan.sql],[plan.clientPath,plan.clientSource]]){
    if(process.argv.includes('--check')){
      if(fs.readFileSync(file,'utf8')!==expected)throw Error('King action catalog differs from '+file);
    }else fs.writeFileSync(file,expected);
  }
  console.log('king: '+plan.entries.length+' actions; '+path.basename(plan.migrationPath));
}
