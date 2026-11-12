-- Pin the five-tier policy on new rounds. Existing snapshots keep their version.
set local lock_timeout = '5s';

alter table ojjuda_matgo_internal.wallets drop constraint wallets_round_rules_version_check;
alter table ojjuda_matgo_internal.wallets add constraint wallets_round_rules_version_check
  check (round_rules_version in (10,11,12,13,14));

create or replace function ojjuda_matgo_internal.cpu_tier_for_gold(p_gold bigint)
returns smallint language sql immutable security invoker set search_path='' as $$
  select (case when p_gold > 500000 then 5
               when p_gold > 200000 then 4
               when p_gold >= 100000 then 3
               when p_gold > 5000 then 2
               else 1 end)::smallint;
$$;

do $upgrade$
declare
  definition text := pg_get_functiondef('ojjuda_matgo_internal.wallet_service_v1(uuid,text,uuid,boolean,uuid,bigint,smallint,integer)'::regprocedure);
  round_version text := 'w.round_rules_version:=13;';
  response_field text := '''stake_offer'',null,';
begin
  if cardinality(string_to_array(definition,round_version)) <> 2 or
     cardinality(string_to_array(definition,response_field)) <> 2 then
    raise exception 'Unexpected Matgo wallet definition';
  end if;
  definition := replace(definition,round_version,'w.round_rules_version:=14;');
  execute replace(definition,response_field,'''cpu_rules_version'',14,'||response_field);
end;
$upgrade$;
