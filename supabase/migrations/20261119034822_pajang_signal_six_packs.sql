-- Activate the six approved offers. Existing balances and payment receipts are untouched.
-- These are the live constraint names from the disabled-offer preparation migration.
alter table pajang_private.signal_packs
  drop constraint signal_packs_id_check,
  drop constraint signal_packs_check,
  add constraint signal_packs_id_check check
    (id in ('signal_1','signal_3','signal_5','signal_10','signal_20','signal_30')),
  add constraint signal_packs_check check (quantity = case id
    when 'signal_1' then 1 when 'signal_3' then 3 when 'signal_5' then 5
    when 'signal_10' then 10 when 'signal_20' then 20 when 'signal_30' then 30 end);

-- Expand only the known pack-ID validation. Keep authorization, quoted price and
-- revision checks, request recovery, all locks, debit/credit and receipt writes intact.
do $migration$
declare
  definition text := pg_get_functiondef(
    'public.pajang_signal_purchase(text,uuid,uuid,integer,integer,boolean)'::regprocedure);
  previous_ids text := $old$p_pack not in ('signal_1','signal_3','signal_5')$old$;
  approved_ids text := $new$p_pack not in ('signal_1','signal_3','signal_5','signal_10','signal_20','signal_30')$new$;
begin
  if length(definition)-length(replace(definition,previous_ids,''))<>length(previous_ids) then
    raise exception 'unexpected_pajang_signal_pack_validation';
  end if;
  execute replace(definition,previous_ids,approved_ids);
end;
$migration$;

-- Updates use the existing revision trigger. Old offers advance their revision;
-- new IDs begin at revision 1. Old successful receipts retain their original price.
insert into pajang_private.signal_packs(id,quantity,price,enabled) values
  ('signal_1',1,10,true),
  ('signal_3',3,28,true),
  ('signal_5',5,45,true),
  ('signal_10',10,85,true),
  ('signal_20',20,160,true),
  ('signal_30',30,225,true)
on conflict(id) do update
  set quantity=excluded.quantity,price=excluded.price,enabled=excluded.enabled;
