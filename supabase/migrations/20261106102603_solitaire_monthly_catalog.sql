-- Include Solitaire in current monthly leaders and automatic month-end archives.
do $migration$
declare definition text;updated text;
begin
 definition:=pg_get_functiondef('ojjuda_ranking_internal.catalog()'::regprocedure);
 if position('''solitaire''' in definition)=0 then
  updated:=replace(definition,'''mines''','''solitaire'',''mines''');
  if updated=definition then raise exception 'Expected ranking catalog entry missing';end if;
  execute updated;
 end if;
end;
$migration$;
notify pgrst,'reload schema';
