-- Reuse the wallet's atomic receipts. A recommendation is priced on the server.
create schema if not exists ojjuda_shop_internal;
revoke all on schema ojjuda_shop_internal from public, anon;
grant usage on schema ojjuda_shop_internal to authenticated;

create or replace function ojjuda_shop_internal.bang_hint_buy(
 p_request_id uuid, p_room_id uuid, p_version integer, p_verify_only boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 v_user uuid := auth.uid();
 v_coins integer;
 v_previous record;
 v_room ojjuda_bang_internal.rooms;
 v_seat integer;
 v_actor integer;
 v_result jsonb;
begin
 if v_user is null or not exists(select 1 from auth.users where id=v_user and not coalesce(is_anonymous,false)) then
  return jsonb_build_object('ok',false,'reason','not_signed_in');
 end if;
 if public.is_banned(v_user) then return jsonb_build_object('ok',false,'reason','banned'); end if;
 if p_request_id is null or p_room_id is null or p_version is null or p_version<0 or p_verify_only is null then
  return jsonb_build_object('ok',false,'reason','invalid');
 end if;
 select coins into v_coins from public.user_private where user_id=v_user for update;
 if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
 select user_id,kind,result into v_previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
 if found then
  if v_previous.user_id<>v_user or v_previous.kind<>'bang_hint'
   or v_previous.result->>'room_id' is distinct from p_room_id::text
   or v_previous.result->>'version' is distinct from p_version::text then
   return jsonb_build_object('ok',false,'reason','request_conflict','coins',v_coins);
  end if;
  return v_previous.result || jsonb_build_object('coins',v_coins);
 end if;
 if p_verify_only then return jsonb_build_object('ok',false,'reason','not_found','coins',v_coins); end if;

 select * into v_room from ojjuda_bang_internal.rooms where id=p_room_id for update;
 v_seat:=array_position(v_room.members,v_user)-1;
 if not found or v_seat is null or v_room.status<>'active' or v_room.expires_at<=clock_timestamp()
  or v_room.state->>'winner' is not null then
  return jsonb_build_object('ok',false,'reason','room_unavailable','coins',v_coins);
 end if;
 if v_room.version<>p_version or (v_room.mode<>'solo' and v_room.deadline<=clock_timestamp()) then
  return jsonb_build_object('ok',false,'reason','state_conflict','coins',v_coins);
 end if;
 v_actor:=coalesce((v_room.state->'pending'->>'player')::integer,(v_room.state->>'current')::integer);
 if v_actor is distinct from v_seat or not coalesce((v_room.state->'players'->v_seat->>'alive')::boolean,false) then
  return jsonb_build_object('ok',false,'reason','not_your_turn','coins',v_coins);
 end if;
 if v_coins<1 then return jsonb_build_object('ok',false,'reason','coins','coins',v_coins,'price',1); end if;
 update public.user_private set coins=coins-1 where user_id=v_user and coins>=1 returning coins into v_coins;
 if not found then return jsonb_build_object('ok',false,'reason','coins'); end if;
 v_result:=jsonb_build_object('ok',true,'kind','bang_hint','price',1,'coins',v_coins,
  'request_id',p_request_id,'room_id',p_room_id,'version',p_version);
 insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,target_id,coins,result)
  values(p_request_id,v_user,'bang_hint',p_room_id,1,v_result);
 return v_result;
end;
$$;
revoke all on function ojjuda_shop_internal.bang_hint_buy(uuid,uuid,integer,boolean) from public, anon;
grant execute on function ojjuda_shop_internal.bang_hint_buy(uuid,uuid,integer,boolean) to authenticated;

create or replace function public.bang_hint_buy(
 p_request_id uuid, p_room_id uuid, p_version integer, p_verify_only boolean default false
) returns jsonb language sql security invoker set search_path = '' as $$
 select ojjuda_shop_internal.bang_hint_buy(p_request_id,p_room_id,p_version,p_verify_only);
$$;
revoke all on function public.bang_hint_buy(uuid,uuid,integer,boolean) from public, anon;
grant execute on function public.bang_hint_buy(uuid,uuid,integer,boolean) to authenticated;

-- The deployed Edge function consumes the stored options when creating a solo
-- game. Override the old role preference here, including requests from old tabs.
do $patch$
declare
 definition text:=pg_get_functiondef('public.bang_online_service(uuid,text,uuid,text,uuid,jsonb,integer,jsonb)'::regprocedure);
 anchor text:='insert into ojjuda_bang_internal.rooms(code,host_id,members,names,title,capacity,create_request,mode,options)';
 prefix text:=$body$if p_options->>'mode'='solo' then
   p_options:=jsonb_set(p_options,'{role}','"random"'::jsonb);
  end if;
  $body$;
begin
 if strpos(definition,prefix)>0 then return; end if;
 if (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 then
  raise exception 'bang_role_patch_anchor_changed';
 end if;
 execute replace(definition,anchor,prefix||anchor);
end;
$patch$;
