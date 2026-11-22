-- Teen launch gate: safe-by-default until legal review, moderation staffing and Play policy approval.
-- Existing adult Pajang remains unaffected. New teen data is inaccessible to direct table roles.
create table pajang_teen_private.release_control (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  enabled_at timestamptz,
  enabled_by uuid references auth.users(id)
);
insert into pajang_teen_private.release_control(singleton,enabled) values(true,false);
alter table pajang_teen_private.release_control enable row level security;
revoke all on pajang_teen_private.release_control from public,anon,authenticated,service_role;

create function pajang_teen_private.launch_enabled() returns boolean
language sql stable security definer set search_path=''
as $ready$
  select coalesce((select enabled from pajang_teen_private.release_control where singleton),false);
$ready$;
revoke all on function pajang_teen_private.launch_enabled() from public,anon,authenticated,service_role;

create function public.pajang_teen_entry() returns jsonb
language plpgsql stable security definer set search_path=''
as $entry$
declare
  user_id uuid:=ojjuda_restaurants_internal.require_member();
  band text;
begin
  band:=public.pajang_age_group();
  return jsonb_build_object(
    'ready', band='teen' and pajang_teen_private.launch_enabled(),
    'audience',case when band='teen' then 'teen' else 'restricted' end
  );
end;
$entry$;
revoke all on function public.pajang_teen_entry() from public,anon,authenticated,service_role;
grant execute on function public.pajang_teen_entry() to authenticated;

alter table pajang_teen_private.drafts
  add column share_consented_at timestamptz;

do $guard$
declare
  signature text;
  body text;
  from_text text;
  to_text text;
  affected integer;
begin
  -- All three end-user entry points must fail closed before public launch.
  foreach signature in array array[
    'public.pajang_teen_draft(text,jsonb)',
    'public.pajang_teen_feed(text,integer)',
    'public.pajang_teen_interact(text,uuid,jsonb)'
  ] loop
    body:=pg_get_functiondef(signature::regprocedure);
    from_text:='if public.pajang_age_group() is distinct from ''teen'' then';
    to_text:='if not pajang_teen_private.launch_enabled() or public.pajang_age_group() is distinct from ''teen'' then';
    affected:=(length(body)-length(replace(body,from_text,'')))/length(from_text);
    if body is null or affected<>1 then
      raise exception 'Unexpected youth entry function: %',signature;
    end if;
    execute replace(body,from_text,to_text);
  end loop;

  -- Posting to peers requires an explicit, per-submit consent and an auditable timestamp.
  signature:='public.pajang_teen_draft(text,jsonb)';
  body:=pg_get_functiondef(signature::regprocedure);

  from_text:='p_data - array[''questionId'',''body'']';
  to_text:='p_data - array[''questionId'',''body'',''shareWithTeens'']';
  if (length(body)-length(replace(body,from_text,'')))/length(from_text)<>1 then
    raise exception 'Unexpected teen post input schema';
  end if;
  body:=replace(body,from_text,to_text);

  from_text:='or jsonb_typeof(p_data->''body'') is distinct from ''string'' then';
  to_text:='or jsonb_typeof(p_data->''body'') is distinct from ''string'' or p_data->''shareWithTeens'' is distinct from ''true''::jsonb then';
  if (length(body)-length(replace(body,from_text,'')))/length(from_text)<>1 then
    raise exception 'Unexpected teen post consent validator';
  end if;
  body:=replace(body,from_text,to_text);

  from_text:='insert into pajang_teen_private.drafts(owner_id,question_id,body)';
  to_text:='insert into pajang_teen_private.drafts(owner_id,question_id,body,share_consented_at)';
  if (length(body)-length(replace(body,from_text,'')))/length(from_text)<>1 then
    raise exception 'Unexpected teen draft insert';
  end if;
  body:=replace(body,from_text,to_text);

  from_text:='values(actor,v_question_id,draft_body)';
  to_text:='values(actor,v_question_id,draft_body,now())';
  if (length(body)-length(replace(body,from_text,'')))/length(from_text)<>1 then
    raise exception 'Unexpected teen draft insert values';
  end if;
  body:=replace(body,from_text,to_text);

  from_text:='review_status=''pending'',reviewed_at=null,reviewed_by=null';
  to_text:='review_status=''pending'',reviewed_at=null,reviewed_by=null,share_consented_at=excluded.share_consented_at';
  if (length(body)-length(replace(body,from_text,'')))/length(from_text)<>1 then
    raise exception 'Unexpected teen draft update';
  end if;
  body:=replace(body,from_text,to_text);
  execute body;

  -- Only responses backed by documented sharing consent can be exposed.
  signature:='public.pajang_teen_feed(text,integer)';
  body:=pg_get_functiondef(signature::regprocedure);
  from_text:='where x.question_id=p_question and x.review_status=''approved''';
  to_text:='where x.question_id=p_question and x.review_status=''approved'' and x.share_consented_at is not null';
  if (length(body)-length(replace(body,from_text,'')))/length(from_text)<>1 then
    raise exception 'Unexpected teen feed visibility guard';
  end if;
  execute replace(body,from_text,to_text);
end;
$guard$;

comment on function public.pajang_teen_entry() is
  'App launch readiness; no teen content returned unless server launch gate is active.';
comment on table pajang_teen_private.release_control is
  'Keep disabled until legal/Google Play review and actual moderation operations are verified.';
