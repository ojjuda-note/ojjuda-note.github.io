-- Expose the selected look ID on rows the caller can already see. Returning
-- the scalar leaves pose, background and exchanged profile fields private.
do $migration$
declare
  change record;
  definition text;
  mutual_only text := $old$case when exists (
      select from pajang_private.signals sent
      join pajang_private.signals received on received.src=sent.dst and received.dst=sent.src
      where sent.src=mine.id and sent.dst=m.id
    ) then m.avatar->'id' end$old$;
begin
  for change in select * from (values
    ('public.pajang_member(text,jsonb)',mutual_only,$new$m.avatar->'id'$new$),
    ('pajang_private.nearby_people(uuid,date,text,pajang_private.locations)',
      'select m.id,m.name,m.region,m.interest,geo.info,',
      $new$select m.id,m.name,m.region,m.interest,geo.info,m.avatar->'id' as avatar_id,$new$),
    ('pajang_private.nearby_people(uuid,date,text,pajang_private.locations)',
      $old$'answers',g.answers)||g.info$old$,
      $new$'answers',g.answers,'avatarId',g.avatar_id)||g.info$new$),
    ('public.pajang_discovery_feed(jsonb,text,text,text)',
      'select x.*,a.question_prompt as question,a.body,',
      $new$select x.*,p.avatar->'id' as "avatarId",a.question_prompt as question,a.body,$new$),
    ('pajang_private.read_public_profile_preferences(uuid)',
      $old$return jsonb_build_object('person',target,$old$,
      $new$return jsonb_build_object('person',target,
    'avatarId',(select p.avatar->'id' from pajang_private.people p where p.id=target),$new$)
  ) as changes(signature,previous,replacement)
  loop
    definition := pg_get_functiondef(change.signature::regprocedure);
    if array_length(string_to_array(definition,change.previous),1) is distinct from 2 then
      raise exception 'Unexpected portrait projection in %. Reconcile before applying.',change.signature;
    end if;
    execute replace(definition,change.previous,change.replacement);
  end loop;
end;
$migration$;
