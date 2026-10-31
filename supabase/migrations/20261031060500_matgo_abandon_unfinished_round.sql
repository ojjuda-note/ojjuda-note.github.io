-- Retire only an explicitly identified unfinished solo round. Balances,
-- purchase receipts, historical results and online settlement locks are retained.
create function ojjuda_matgo_internal.abandon_round(p_actor uuid,p_round uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare state jsonb;removed integer;
begin
 perform pg_advisory_xact_lock(1280136271,1);
 -- Reuse the authoritative age, membership and ban checks before any write.
 state:=public.matgo_wallet_service(p_actor,'status');
 update ojjuda_matgo_internal.wallets
 set round_id=null,round_seed=null,round_cpu_level=null,round_rules_version=null
 where user_id=p_actor and online_room is null and round_id=p_round;
 get diagnostics removed=row_count;
 state:=public.matgo_wallet_service(p_actor,'status');
 return state||jsonb_build_object('abandoned',removed=1);
end;$$;
revoke all on function ojjuda_matgo_internal.abandon_round(uuid,uuid) from public,anon,authenticated,service_role;
create function public.matgo_abandon_round(p_actor uuid,p_round uuid)
returns jsonb language sql security definer set search_path='' as $$
 select ojjuda_matgo_internal.abandon_round(p_actor,p_round);
$$;
revoke all on function public.matgo_abandon_round(uuid,uuid) from public,anon,authenticated;
grant execute on function public.matgo_abandon_round(uuid,uuid) to service_role;
