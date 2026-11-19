-- Allow members to buy signal packs before their daily free signals are used.
-- Sending still uses the daily free allowance first in pajang_member.
-- Preserve quoted-price checks, account guards, locks, receipts and balances.
do $migration$
declare
  definition text := pg_get_functiondef(
    'public.pajang_signal_purchase(text,uuid,uuid,integer,integer,boolean)'::regprocedure);
  free_purchase_limit text := $old$  if (quota->>'freeRemaining')::integer>0 then
    return quota||jsonb_build_object('ok',false,'reason','free_remaining');
  end if;$old$;
begin
  if length(definition)-length(replace(definition,free_purchase_limit,''))<>length(free_purchase_limit) then
    raise exception 'unexpected_pajang_free_signal_purchase_limit';
  end if;
  execute replace(definition,free_purchase_limit,'');
end;
$migration$;
