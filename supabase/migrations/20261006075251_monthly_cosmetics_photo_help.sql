-- Every paid cosmetic is a one-calendar-month entitlement, without automatic renewal.
update ojjuda_shop_internal.products set months=1;
alter table ojjuda_shop_internal.products alter column months set default 1;
alter table ojjuda_shop_internal.products add constraint cosmetics_monthly_only check(months=1);
update ojjuda_shop_internal.entitlements set expires_at=acquired_at+interval '1 month' where expires_at is null;
update ojjuda_shop_internal.receipts set expires_at=created_at+interval '1 month' where expires_at is null;
-- Applied card stickers remain on their cards after the sticker entitlement expires.
-- Keep the existing card-style persistence and require an active entitlement for new use.

-- Receipt identity is account-bound; a lost response can be recovered without another debit.
create or replace function ojjuda_shop_internal.photo_help_buy(p_kind text,p_request_id uuid,p_verify_only boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();c integer;cost integer;previous record;result jsonb;
begin
 if u is null then return jsonb_build_object('ok',false,'reason','login');end if;
 if public.is_banned(u) then return jsonb_build_object('ok',false,'reason','banned');end if;
 if not ojjuda_photo_internal.member_allowed() then return jsonb_build_object('ok',false,'reason','membership');end if;
 if p_kind is null or p_kind not in('heart','time','slow') or p_request_id is null or p_verify_only is null then return jsonb_build_object('ok',false,'reason','invalid');end if;
 cost:=case p_kind when 'time' then 5 else 3 end;
 select coins into c from public.user_private where user_id=u for update;
 if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable');end if;
 select * into previous from ojjuda_note_internal.spend_requests where request_id=p_request_id;
 if found then
  if previous.user_id<>u or previous.kind<>'photo_'||p_kind then return jsonb_build_object('ok',false,'reason','request_conflict');end if;
  return previous.result||jsonb_build_object('coins',c,'replayed',true);
 end if;
 if p_verify_only then return jsonb_build_object('ok',false,'reason','not_found','coins',c);end if;
 if c<cost then return jsonb_build_object('ok',false,'reason','coins','coins',c);end if;
 update public.user_private set coins=coins-cost where user_id=u returning coins into c;
 result:=jsonb_build_object('ok',true,'kind',p_kind,'price',cost,'coins',c,'hearts',case when p_kind='heart' then 1 else 0 end,'duration_seconds',case p_kind when 'time' then 30 when 'slow' then 5 else 0 end,'replayed',false);
 insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result) values(p_request_id,u,'photo_'||p_kind,cost,result);
 return result;
end;$$;
revoke all on function ojjuda_shop_internal.photo_help_buy(text,uuid,boolean) from public,anon;
grant execute on function ojjuda_shop_internal.photo_help_buy(text,uuid,boolean) to authenticated;
create or replace function public.photo_help_buy(p_kind text,p_request_id uuid,p_verify_only boolean default false)
returns jsonb language sql security invoker set search_path='' as $$select ojjuda_shop_internal.photo_help_buy(p_kind,p_request_id,p_verify_only)$$;
revoke all on function public.photo_help_buy(text,uuid,boolean) from public,anon;
grant execute on function public.photo_help_buy(text,uuid,boolean) to authenticated;
