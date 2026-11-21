import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory=resolve(root,'features/pajang/content');
const files=['relationship-attraction-dates.json','relationship-contact-affection.json','relationship-conflict-values.json'];
const questions=files.flatMap(file=>JSON.parse(readFileSync(resolve(directory,file),'utf8')));
const categories=['attraction','communication','dates','affection','values','conflict'];
const buckets=categories.map(category=>questions.filter(row=>row.category===category).sort((a,b)=>a.id-b.id));
assert.equal(questions.length,72);
for(let i=0;i<buckets.length;i++)assert.equal(buckets[i].length,12,categories[i]);
const catalog=Array.from({length:12},(_,index)=>buckets.map(bucket=>bucket[index])).flat()
  .map((row,index)=>({...row,ordinal:index+1}));
assert.deepEqual(questions.map(row=>row.id).sort((a,b)=>a-b),Array.from({length:72},(_,i)=>50001+i));
assert.equal(new Set(questions.map(row=>row.prompt)).size,72);
const existingFiles=['personality-social.json','personality-choices.json','personality-emotion.json','personality-calendar.json','personality-revisions.json'];
const existing=existingFiles.flatMap(file=>JSON.parse(readFileSync(resolve(directory,file),'utf8')));
const existingPrompts=new Set(existing.map(row=>row.prompt));
const existingIds=new Set(existing.map(row=>row.id));
for(const row of catalog){
  assert.equal(typeof row.prompt,'string');
  assert.ok(row.prompt.trim()===row.prompt && row.prompt.endsWith('?'),`prompt ${row.id}`);
  assert.ok(!existingPrompts.has(row.prompt) && !existingIds.has(row.id),`existing question ${row.id}`);
  assert.equal(row.samples.length,3,`samples ${row.id}`);
  assert.equal(new Set(row.samples).size,3,`distinct samples ${row.id}`);
  assert.ok(row.samples.every(sample=>typeof sample==='string'&&sample.trim()===sample&&sample.length>0),`sample copy ${row.id}`);
}
const migration=`-- Pajang: 72 open questions about attraction and relationships.
-- Source: features/pajang/content/relationship-*.json, reviewed with 216 samples.
-- Regenerate with node scripts/build-pajang-relationship-questions.mjs.
-- Preserve published windows, original catalogs, saved prompts and answers.
begin;
set local lock_timeout = '5s';
lock table pajang_private.answers in share row exclusive mode;

create table if not exists pajang_private.relationship_question_catalog (
  id integer primary key check (id between 50001 and 50072),
  ordinal integer not null unique check (ordinal between 1 and 72),
  category text not null check (category in ('attraction','communication','dates','affection','values','conflict')),
  prompt text not null unique check (length(trim(prompt)) > 0),
  samples text[] not null check (
    array_ndims(samples) = 1 and cardinality(samples) = 3
    and array_position(samples,null) is null and array_position(samples,'') is null
  )
);
alter table pajang_private.relationship_question_catalog enable row level security;
revoke all on table pajang_private.relationship_question_catalog from public,anon,authenticated;

-- Identical retries are safe; a concurrent edit is never silently overwritten.
do $seed$
declare
  reviewed constant jsonb := $catalog$${JSON.stringify(catalog,null,2)}$catalog$::jsonb;
begin
  if exists (
    select from pajang_private.relationship_question_catalog q
    join jsonb_to_recordset(reviewed) as p(id integer,ordinal integer,category text,prompt text,samples text[]) using(id)
    where row(q.ordinal,q.category,q.prompt,q.samples)
      is distinct from row(p.ordinal,p.category,p.prompt,p.samples)
  ) then raise exception 'Pajang relationship catalog changed; review the concurrent edit'; end if;
  if exists (
    select from jsonb_to_recordset(reviewed) as p(id integer,prompt text)
    join pajang_private.personality_question_catalog q on q.id=p.id or q.prompt=p.prompt
  ) or exists (
    select from jsonb_to_recordset(reviewed) as p(id integer)
    join pajang_private.question_catalog q using(id)
  ) then raise exception 'Pajang relationship question conflicts with an existing catalog'; end if;
  insert into pajang_private.relationship_question_catalog(id,ordinal,category,prompt,samples)
  select id,ordinal,category,prompt,samples
  from jsonb_to_recordset(reviewed) as p(id integer,ordinal integer,category text,prompt text,samples text[])
  on conflict(id) do nothing;
  if (select count(*) from pajang_private.relationship_question_catalog) <> 72 then
    raise exception 'Expected all 72 reviewed Pajang relationship questions';
  end if;
end;
$seed$;

create or replace function pajang_private.question_for_window(on_day date,in_slot text)
returns jsonb language sql stable strict set search_path='' as $question$
  with position as (
    select 1+2*(on_day-date '2026-11-18')+(in_slot='pm')::int as legacy_number,
      1+2*(on_day-date '2026-11-22')+(in_slot='pm')::int as number,
      (2*(on_day-date '2026-11-23')+(in_slot='pm')::int)%804 as round_index,
      extract(year from on_day)::int % 2 as edition
    where on_day>=date '2026-11-18' and in_slot in ('am','pm')
  ), choices as (
    select q.id,q.prompt,q.samples,0 as rank
    from position p cross join pajang_private.question_occasion(on_day) e
    join pajang_private.question_catalog q on q.occasion=e.kind
      and q.edition=p.edition and q.turn=2*e.day_no+(in_slot='pm')::int
    where on_day<date '2026-11-22'
    union all
    select q.id,q.prompt,q.samples,case when q.id=p.legacy_number then 1 else 2 end
    from position p join pajang_private.question_catalog q
      on q.occasion is null and q.id in(p.legacy_number,1+(p.legacy_number-1)%732)
    where on_day<date '2026-11-22'
    union all
    select q.id,q.prompt,q.samples,0
    from position p cross join pajang_private.question_occasion(on_day) e
    join pajang_private.personality_question_catalog q on q.occasion=e.kind
      and q.edition=p.edition and q.turn=2*e.day_no+(in_slot='pm')::int
    where on_day>=date '2026-11-22'
    union all
    select q.id,q.prompt,q.samples,2
    from position p join pajang_private.personality_question_catalog q
      on q.ordinal=case
        when on_day<date '2026-11-23' then 1+(p.number-1)%732
        else 1+(2+p.round_index-(p.round_index*72+803)/804)%732
      end
    where on_day>=date '2026-11-22'
    union all
    select q.id,q.prompt,q.samples,1
    from position p join pajang_private.relationship_question_catalog q
      on p.round_index=(q.ordinal-1)*804/72
    where on_day>=date '2026-11-23'
  )
  select jsonb_build_object('id',id,'q',jsonb_build_array(prompt),'answers',samples)
  from choices order by rank limit 1;
$question$;
revoke all on function pajang_private.question_for_window(date,text) from public,anon,authenticated;

-- Start after the current day; calendar questions retain priority. Spread the
-- 72 new questions evenly through 804 slots, instead of exhausting them up front.
-- Subtract already scheduled relationship slots to continue the 732-question
-- general pool from ordinal 3. Each regular prompt appears once per cycle.
-- Validate under the answers lock: never attach an existing answer to a new prompt.
do $published$
begin
  if exists (
    select from pajang_private.answers a
    where a.day>=date '2026-11-23'
      and a.question_prompt is distinct from (pajang_private.question_for_window(a.day,a.slot)#>>'{q,0}')
  ) then raise exception 'An answered Pajang window would change; choose a later relationship cutover'; end if;
end;
$published$;
-- The existing BEFORE INSERT guard checks the new selector after waiting for
-- this table lock, so a stale in-flight answer cannot slip through the cutover.
commit;
`;
const names=readdirSync(resolve(root,'supabase/migrations')).filter(name=>name.endsWith('_pajang_relationship_questions.sql'));
assert.equal(names.length,1,'Create exactly one migration using supabase migration new first');
const destination=resolve(root,'supabase/migrations',names[0]);
if(process.argv.includes('--check'))assert.equal(readFileSync(destination,'utf8'),migration,'Regenerate the relationship migration');
else writeFileSync(destination,migration);
console.log(JSON.stringify({questions:catalog.length,categories:categories.length,samples:catalog.length*3,migration:names[0],bytes:Buffer.byteLength(migration),check:process.argv.includes('--check')}));
