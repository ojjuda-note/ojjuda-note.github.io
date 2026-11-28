-- Project only the outfit ID from the existing owner row and eligible chat peer
-- rows. Keep the complete private avatar selection in the profile editor.
do $migration$
declare
  definition text := pg_get_functiondef('public.pajang_member(text,jsonb)'::regprocedure);
  own_tail text := $sql$'interest',mine.interest)||coalesce(answer,'{}')$sql$;
  peer_tail text := $sql$'body',a.body,'at',a.at))||pajang_private.rangeinfo(ownloc,l)$sql$;
  own_with_id text := $sql$'interest',mine.interest,'avatarId',mine.avatar->'id')||coalesce(answer,'{}')$sql$;
  peer_with_id text := $sql$'body',a.body,'at',a.at,'avatarId',
    case when exists (
      select from pajang_private.signals sent
      join pajang_private.signals received on received.src=sent.dst and received.dst=sent.src
      where sent.src=mine.id and sent.dst=m.id
    ) then m.avatar->'id' end))||pajang_private.rangeinfo(ownloc,l)$sql$;
begin
  if array_length(string_to_array(definition,own_tail),1) is distinct from 2
    or array_length(string_to_array(definition,peer_tail),1) is distinct from 2
    or strpos(definition,'where pajang_private.clear_pair(mine.id,m.id) and (a.person is not null or exists(')=0
    or strpos(definition,'jsonb_agg(jsonb_strip_nulls(jsonb_build_object(')=0
    or strpos(definition,'ojjuda_restaurants_internal.require_member()')=0 then
    raise exception 'The Pajang member state or access checks changed. Reconcile the avatar projection.';
  end if;
  execute replace(replace(definition,own_tail,own_with_id),peer_tail,peer_with_id);
end;
$migration$;
