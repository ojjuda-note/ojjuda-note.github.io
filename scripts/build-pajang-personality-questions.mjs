import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory=resolve(root,'features/pajang/content');
const files=['personality-social.json','personality-choices.json','personality-emotion.json','personality-calendar.json'];
const groups=files.map(file=>JSON.parse(readFileSync(resolve(directory,file),'utf8')));
const regular=groups.slice(0,3).flat();
const seasonal=groups[3];
assert.equal(regular.length,732);
assert.equal(seasonal.length,204);
const categories=['communication','planning','emotion','social_energy','decision','teamwork','affection','curiosity','empathy','boundaries','independence','values'];
const buckets=categories.map(category=>regular.filter(row=>row.category===category).sort((a,b)=>a.id-b.id));
for(let i=0;i<buckets.length;i++)assert.equal(buckets[i].length,61,categories[i]);
const ordered=Array.from({length:61},(_,index)=>buckets.map(bucket=>bucket[index])).flat();
// The first live window opens with the concrete grievance-expression question.
const first=ordered.findIndex(row=>row.id===20001);
[ordered[0],ordered[first]]=[ordered[first],ordered[0]];
const catalog=[...ordered.map((row,index)=>({...row,ordinal:index+1,occasion:null,edition:null,turn:null})),
  ...seasonal.map(row=>({...row,ordinal:null}))].sort((a,b)=>a.id-b.id);
assert.equal(new Set(catalog.map(row=>row.id)).size,936);
assert.equal(new Set(catalog.map(row=>row.prompt)).size,936);
for(const row of catalog){
  assert.ok(row.id>20000);
  assert.ok(row.prompt.trim()===row.prompt && row.prompt.endsWith('?'),`prompt ${row.id}`);
  assert.equal(row.samples.length,3,`samples ${row.id}`);
  assert.equal(new Set(row.samples).size,3,`distinct samples ${row.id}`);
  assert.ok(row.samples.every(sample=>typeof sample==='string'&&sample.trim()===sample&&sample.length>0));
}
const data=JSON.stringify(catalog,null,2);
const migration=`-- Pajang: concrete, natural questions about behavior and personality.
-- Source: features/pajang/content/personality-*.json (936 hand-reviewed questions).
-- Regenerate with node scripts/build-pajang-personality-questions.mjs.
-- New IDs invalidate stale forms. Existing question/answer snapshots are untouched.
begin;
set local lock_timeout = '5s';
lock table pajang_private.answers in share row exclusive mode;

create table if not exists pajang_private.personality_question_catalog (
  id integer primary key check (id > 20000),
  ordinal integer unique,
  category text not null check (length(trim(category)) > 0),
  prompt text not null unique check (length(trim(prompt)) > 0),
  occasion text,
  edition smallint,
  turn smallint,
  unique(occasion,edition,turn),
  check ((occasion is null and edition is null and turn is null and ordinal is not null and ordinal between 1 and 732)
    or (occasion is not null and edition is not null and edition in (0,1) and turn is not null and turn >= 0 and ordinal is null)),
  samples text[] not null check (
    array_ndims(samples) = 1 and cardinality(samples) = 3
    and array_position(samples,null) is null and array_position(samples,'') is null
  )
);
alter table pajang_private.personality_question_catalog enable row level security;
revoke all on table pajang_private.personality_question_catalog from public,anon,authenticated;

-- A repeat is safe; conflicting edits abort instead of being overwritten.
do $seed$
declare
  reviewed constant jsonb := $catalog$${data}$catalog$::jsonb;
begin
  if exists (
    select from pajang_private.personality_question_catalog q
    join jsonb_to_recordset(reviewed) as p(id integer,ordinal integer,category text,prompt text,
      occasion text,edition smallint,turn smallint,samples text[]) using(id)
    where row(q.ordinal,q.category,q.prompt,q.occasion,q.edition,q.turn,q.samples)
      is distinct from row(p.ordinal,p.category,p.prompt,p.occasion,p.edition,p.turn,p.samples)
  ) then raise exception 'Pajang personality catalog changed; review the concurrent edit'; end if;
  insert into pajang_private.personality_question_catalog(id,ordinal,category,prompt,occasion,edition,turn,samples)
  select id,ordinal,category,prompt,occasion,edition,turn,samples
  from jsonb_to_recordset(reviewed) as p(id integer,ordinal integer,category text,prompt text,
    occasion text,edition smallint,turn smallint,samples text[])
  on conflict(id) do nothing;
  if (select count(*) from pajang_private.personality_question_catalog) <> 936 then
    raise exception 'Expected all 936 reviewed Pajang questions';
  end if;
  -- Never relabel a round that already has an answer to a legacy prompt.
  if exists (select from pajang_private.answers a
    where a.day >= date '2026-11-22' and a.question_prompt is not null
      and not exists(select from pajang_private.personality_question_catalog q where q.prompt=a.question_prompt)) then
    raise exception 'A legacy Pajang answer already exists after the cutover; choose the next unanswered window';
  end if;
end;
$seed$;

create or replace function pajang_private.question_for_window(on_day date,in_slot text)
returns jsonb language sql stable strict set search_path='' as $question$
  with position as (
    select 1+2*(on_day-date '2026-11-18')+(in_slot='pm')::int as legacy_number,
      1+2*(on_day-date '2026-11-22')+(in_slot='pm')::int as number,
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
    select q.id,q.prompt,q.samples,1
    from position p join pajang_private.personality_question_catalog q
      on q.ordinal=1+(p.number-1)%732
    where on_day>=date '2026-11-22'
  )
  select jsonb_build_object('id',id,'q',jsonb_build_array(prompt),'answers',samples)
  from choices order by rank limit 1;
$question$;
revoke all on function pajang_private.question_for_window(date,text) from public,anon,authenticated;

-- Check again at the actual INSERT. An old in-flight RPC may have validated its
-- old question before it waited for this migration's table lock.
create or replace function pajang_private.validate_question_insert()
returns trigger language plpgsql set search_path='' as $guard$
declare expected_prompt text;
begin
  if new.day >= date '2026-11-22' then
    expected_prompt := pajang_private.question_for_window(new.day,new.slot) #>> '{q,0}';
    if expected_prompt is null or new.question_prompt is distinct from expected_prompt then
      raise exception '질문이 바뀌었어요. 새 질문을 확인하고 다시 답해 주세요.' using errcode='PT409';
    end if;
  end if;
  return new;
end;
$guard$;
revoke all on function pajang_private.validate_question_insert() from public,anon,authenticated;
drop trigger if exists pajang_question_prompt_guard on pajang_private.answers;
create trigger pajang_question_prompt_guard before insert on pajang_private.answers
for each row execute function pajang_private.validate_question_insert();
commit;
`;
const names=readdirSync(resolve(root,'supabase/migrations')).filter(name=>name.endsWith('_pajang_personality_questions.sql'));
assert.equal(names.length,1,'Create exactly one migration using supabase migration new first');
const destination=resolve(root,'supabase/migrations',names[0]);
if(process.argv.includes('--check'))assert.equal(readFileSync(destination,'utf8'),migration,'Regenerate the personality migration');
else writeFileSync(destination,migration);
console.log(JSON.stringify({questions:catalog.length,regular:regular.length,seasonal:seasonal.length,categories:categories.length,migration:names[0],bytes:Buffer.byteLength(migration),check:process.argv.includes('--check')}));
