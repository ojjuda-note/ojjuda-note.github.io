-- Retire the two game services without changing wallets, rounds or ranking functions.
revoke execute on function public.poker_online_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb),
  ojjuda_poker_internal.room_service(uuid,text,uuid,text,uuid,integer,jsonb,jsonb) from public, anon, authenticated, service_role;
revoke execute on function public.roulette_action(text,jsonb),
  ojjuda_roulette_internal.action(text,jsonb) from public, anon, authenticated, service_role;

create or replace function public.arcade_general_extra_rooms()
returns jsonb language sql stable set search_path to 'pg_catalog' as $$
  select jsonb_build_object('ok', true, 'rooms',
    coalesce(ojjuda_bang_internal.arcade_rooms()->'rooms', '[]'::jsonb)
    || coalesce(ojjuda_arcade_internal.onecard_rooms()->'rooms', '[]'::jsonb)
    || coalesce(ojjuda_yut_internal.directory()->'rooms', '[]'::jsonb));
$$;
