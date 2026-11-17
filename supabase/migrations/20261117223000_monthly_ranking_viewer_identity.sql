-- A member and this browser's former guest are separate ranking entrants.
begin;

do $migration$
declare
 signature regprocedure;
 definition text;
 guard text := $guard$begin
 if actor is not null then
  if exists(select 1 from auth.users u where u.id=actor and u.is_anonymous is true) then
   actor:=null;
  else
   p_guest_token:=null;
  end if;
 end if;$guard$;
begin
 foreach signature in array array[
  'ojjuda_ranking_internal.current_rows(text,text)'::regprocedure,
  'public.community_game_monthly_personal(text,text)'::regprocedure
 ] loop
  definition:=pg_get_functiondef(signature);
  if position('actor uuid:=auth.uid()' in definition)=0
     or position('if p_guest_token ~' in definition)=0 then
   raise exception 'Unexpected ranking viewer definition: %',signature;
  end if;
  -- Apply the same identity before the existing visibility checks, top-ten
  -- highlighting and personal-rank lookup. No score or rank ordering changes.
  execute regexp_replace(definition,'\mbegin\M',guard,'i');
 end loop;
end;
$migration$;
commit;
