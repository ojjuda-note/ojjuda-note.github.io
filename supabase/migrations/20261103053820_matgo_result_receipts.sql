-- Attach an immutable last-round receipt to the existing server settlement.
-- Wallet arithmetic, replay verification, row locks and API grants stay intact.
begin;
set local lock_timeout = '5s';

alter table ojjuda_matgo_internal.wallets
  add column if not exists last_settlement jsonb;
comment on column ojjuda_matgo_internal.wallets.last_settlement is
  'Server-confirmed net gold for last_round; retained across refills and returned only for that exact round.';

do $receipt$
declare
  signature regprocedure := 'ojjuda_matgo_internal.wallet_service_v1(uuid,text,uuid,boolean,uuid,bigint,smallint,integer)'::regprocedure;
  definition text;
  original_acl aclitem[];
  anchor text;
  replacement text;
begin
  if not exists (
    select 1 from pg_attribute
    where attrelid = 'ojjuda_matgo_internal.wallets'::regclass
      and attname = 'last_settlement' and atttypid = 'jsonb'::regtype and not attisdropped
  ) then raise exception 'Unexpected Matgo receipt column type'; end if;

  select pg_get_functiondef(signature), proacl into definition, original_acl
    from pg_proc where oid = signature;
  if position('last_settlement' in definition) > 0 then
    raise exception 'Matgo settlement receipt patch already present';
  end if;

  -- Capture the actual before/after amounts inside the already locked, newly
  -- settled branch. A duplicate round never overwrites this receipt.
  anchor := 'w.gold:=p_gold;w.next_first:=p_first;w.next_carry:=p_carry;';
  replacement := $patch$w.last_settlement:=jsonb_build_object('round_id',w.round_id,
        'before_gold',w.gold,'after_gold',p_gold,'net',p_gold-w.gold);
      w.gold:=p_gold;w.next_first:=p_first;w.next_carry:=p_carry;$patch$;
  if cardinality(string_to_array(definition, anchor)) <> 2 then
    raise exception 'Matgo settlement arithmetic prerequisite changed';
  end if;
  definition := replace(definition, anchor, replacement);

  anchor := 'round_seed=w.round_seed,last_round=w.last_round,';
  replacement := 'round_seed=w.round_seed,last_round=w.last_round,last_settlement=w.last_settlement,';
  if cardinality(string_to_array(definition, anchor)) <> 2 then
    raise exception 'Matgo wallet update prerequisite changed';
  end if;
  definition := replace(definition, anchor, replacement);

  -- Status, starts, refills and an unrelated round do not expose an old
  -- result. An exact-ID retry still returns the original net even if the
  -- wallet has since been refilled or a new round has started in another tab.
  anchor := '''settled'',v_settled,';
  replacement := $patch$'settled',v_settled,
    'settlement',case when p_action in ('round','settle') and p_round is not null
      and w.last_round=p_round and w.last_settlement->>'round_id'=p_round::text
      then w.last_settlement else null end,$patch$;
  if cardinality(string_to_array(definition, anchor)) <> 2 then
    raise exception 'Matgo settlement response prerequisite changed';
  end if;
  definition := replace(definition, anchor, replacement);
  execute definition;

  if (select proacl from pg_proc where oid = signature) is distinct from original_acl then
    raise exception 'Matgo settlement grants changed';
  end if;
end;
$receipt$;

-- Older already-open rule versions still use the ranked settlement wrapper.
-- It refreshes CPU status after a win/loss; retain the just-confirmed receipt
-- while keeping that status response and its legacy counters unchanged.
do $legacy_receipt$
declare
  signature regprocedure := 'ojjuda_matgo_internal.ranked_settle(uuid,uuid,bigint,smallint,integer,text)'::regprocedure;
  definition text;
  original_acl aclitem[];
  anchor text;
  replacement text;
begin
  select pg_get_functiondef(signature), proacl into definition, original_acl
    from pg_proc where oid = signature;
  anchor := 'return s||jsonb_build_object(''settled'',true);';
  replacement := $patch$return s||jsonb_build_object('settled',true,
    'settlement',case when w.last_settlement->>'round_id'=p_round::text
      then w.last_settlement else null end);$patch$;
  if cardinality(string_to_array(definition, anchor)) <> 2 then
    raise exception 'Matgo legacy duplicate response prerequisite changed';
  end if;
  definition := replace(definition, anchor, replacement);

  anchor := 's:=ojjuda_matgo_internal.wallet_with_fun(p_actor,''status'')||jsonb_build_object(''settled'',true);';
  replacement := $patch$s:=ojjuda_matgo_internal.wallet_with_fun(p_actor,'status')
      ||jsonb_build_object('settled',true,'settlement',s->'settlement');$patch$;
  if cardinality(string_to_array(definition, anchor)) <> 2 then
    raise exception 'Matgo legacy status response prerequisite changed';
  end if;
  definition := replace(definition, anchor, replacement);
  execute definition;
  if (select proacl from pg_proc where oid = signature) is distinct from original_acl then
    raise exception 'Matgo legacy settlement grants changed';
  end if;
end;
$legacy_receipt$;

notify pgrst, 'reload schema';
commit;
