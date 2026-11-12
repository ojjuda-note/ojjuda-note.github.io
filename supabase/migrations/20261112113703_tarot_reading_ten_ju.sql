-- Fixed-price tarot purchase. A receipt always returns the same five cards.
-- No client-supplied price or wallet owner is accepted.
create schema if not exists ojjuda_tarot_internal;
revoke all on schema ojjuda_tarot_internal from public, anon;
grant usage on schema ojjuda_tarot_internal to authenticated;

create function ojjuda_tarot_internal.buy_v1(
  p_request_id uuid, p_topic text, p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_user uuid := auth.uid();
  v_coins integer;
  v_previous record;
  v_drawn text[];
  v_result jsonb;
  v_deck constant text[] := array['fool','magician','priestess','empress','emperor','hierophant','lovers','chariot','strength','hermit','wheel','justice','hanged_man','death','temperance','devil','tower','star','moon','sun','judgement','world','wands_ace','wands_two','wands_three','wands_four','wands_five','wands_six','wands_seven','wands_eight','wands_nine','wands_ten','wands_page','wands_knight','wands_queen','wands_king','cups_ace','cups_two','cups_three','cups_four','cups_five','cups_six','cups_seven','cups_eight','cups_nine','cups_ten','cups_page','cups_knight','cups_queen','cups_king','swords_ace','swords_two','swords_three','swords_four','swords_five','swords_six','swords_seven','swords_eight','swords_nine','swords_ten','swords_page','swords_knight','swords_queen','swords_king','pentacles_ace','pentacles_two','pentacles_three','pentacles_four','pentacles_five','pentacles_six','pentacles_seven','pentacles_eight','pentacles_nine','pentacles_ten','pentacles_page','pentacles_knight','pentacles_queen','pentacles_king'];
begin
  if v_user is null then raise exception 'not_signed_in' using errcode='42501'; end if;
  if not exists(select 1 from auth.users where id=v_user and coalesce(is_anonymous,false)=false) then
    return jsonb_build_object('ok',false,'reason','member_required');
  end if;
  if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned'); end if;
  if p_request_id is null or p_topic is null or p_topic not in ('overall','love','money','work') or p_verify_only is null then
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  -- Serialize both repeated requests and the user's balance, matching existing purchases.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text,0));
  select coins into v_coins from public.user_private where user_id=v_user for update;
  if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
  select user_id,kind,result into v_previous
    from ojjuda_note_internal.spend_requests where request_id=p_request_id;
  if found then
    if v_previous.user_id<>v_user or v_previous.kind<>'tarot_reading_v1'
       or v_previous.result->>'topic' is distinct from p_topic then
      return jsonb_build_object('ok',false,'reason','request_conflict');
    end if;
    return v_previous.result || jsonb_build_object('coins',v_coins,'replayed',true);
  end if;
  if p_verify_only then return jsonb_build_object('ok',false,'reason','not_found','coins',v_coins); end if;
  if v_coins<10 then return jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',10); end if;

  select array_agg(id order by position) into v_drawn from (
    select id,row_number() over () as position from (
      select id from unnest(v_deck) as id order by random() limit 5
    ) shuffled
  ) ordered_cards;
  update public.user_private set coins=coins-10
    where user_id=v_user and coins>=10 returning coins into v_coins;
  if not found then return jsonb_build_object('ok',false,'reason','coins'); end if;
  v_result:=jsonb_build_object('ok',true,'request_id',p_request_id,'topic',p_topic,
    'drawn',to_jsonb(v_drawn),'price',10,'coins',v_coins,'deck_version',1,'replayed',false);
  insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result)
    values(p_request_id,v_user,'tarot_reading_v1',10,v_result);
  return v_result;
end;
$function$;
revoke all on function ojjuda_tarot_internal.buy_v1(uuid,text,boolean) from public,anon;
grant execute on function ojjuda_tarot_internal.buy_v1(uuid,text,boolean) to authenticated;

create function public.tarot_reading_buy_v1(
  p_request_id uuid, p_topic text, p_verify_only boolean default false
) returns jsonb language sql security invoker set search_path='' as $function$
  select ojjuda_tarot_internal.buy_v1(p_request_id,p_topic,p_verify_only);
$function$;
revoke all on function public.tarot_reading_buy_v1(uuid,text,boolean) from public,anon;
grant execute on function public.tarot_reading_buy_v1(uuid,text,boolean) to authenticated;
