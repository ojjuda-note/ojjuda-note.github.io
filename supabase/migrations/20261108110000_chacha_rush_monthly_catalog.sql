-- Keep Chacha Rush score validation and monthly/archive rankings reproducible.
-- The live functions may already include this game; preserve their privileges.
do $migration$
declare definition text;updated text;signature text;
begin
 foreach signature in array array[
  'ojjuda_guest_internal.score_limit(text)',
  'ojjuda_game_internal.submit_score(text,integer)'
 ] loop
  -- Older isolated ranking fixtures do not install the member submission API.
  if to_regprocedure(signature) is null then continue;end if;
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('''chacha_rush''' in definition)=0 then
   if signature='ojjuda_guest_internal.score_limit(text)' and position('WHEN p_game=' in definition)>0 then
    updated:=regexp_replace(definition,'WHEN p_game=''mole'' THEN','WHEN p_game=''chacha_rush'' THEN 9999999 WHEN p_game=''mole'' THEN','i');
   else
    updated:=regexp_replace(definition,'WHEN ''mole'' THEN',
      'WHEN ''chacha_rush'' THEN 9999999 WHEN ''mole'' THEN','i');
   end if;
   if updated=definition then raise exception 'Expected score limit case missing in %',signature;end if;
   execute updated;
  end if;
 end loop;
 definition:=pg_get_functiondef('ojjuda_ranking_internal.catalog()'::regprocedure);
 if position('''chacha_rush''' in definition)=0 then
  updated:=replace(definition,'''archery''','''archery'',''chacha_rush''');
  if updated=definition then raise exception 'Expected ranking catalog entry missing';end if;
  execute updated;
 end if;
end;
$migration$;
notify pgrst,'reload schema';
