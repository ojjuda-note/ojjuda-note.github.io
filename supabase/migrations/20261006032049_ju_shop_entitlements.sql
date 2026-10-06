-- Server-priced, atomic purchases. No client writes to balances or entitlements.
create schema if not exists ojjuda_shop_internal;
revoke all on schema ojjuda_shop_internal from public,anon;
grant usage on schema ojjuda_shop_internal to authenticated;
create table ojjuda_shop_internal.products(
 key text primary key, name text not null, slot text not null,
 price integer not null check(price>0), months integer not null default 0 check(months in(0,1)),
 active boolean not null default false
);
create table ojjuda_shop_internal.entitlements(
 user_id uuid not null references auth.users(id) on delete cascade,
 product text not null references ojjuda_shop_internal.products(key),
 expires_at timestamptz, acquired_at timestamptz not null default now(),
 primary key(user_id,product)
);
create table ojjuda_shop_internal.receipts(
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null, product text not null references ojjuda_shop_internal.products(key),
 price integer not null check(price>=0), expires_at timestamptz, created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
create table ojjuda_shop_internal.selections(
 user_id uuid not null references auth.users(id) on delete cascade,
 slot text not null,product text not null,
 primary key(user_id,slot), foreign key(user_id,product) references ojjuda_shop_internal.entitlements(user_id,product) on delete cascade
);
alter table ojjuda_shop_internal.products enable row level security;
alter table ojjuda_shop_internal.entitlements enable row level security;
alter table ojjuda_shop_internal.receipts enable row level security;
alter table ojjuda_shop_internal.selections enable row level security;
revoke all on all tables in schema ojjuda_shop_internal from public,anon,authenticated;
insert into ojjuda_shop_internal.products(key,name,slot,price,months,active) values
 ('card_stickers','마음 스티커 6종','sticker',5,0,true),
 ('card_fonts','책갈피 글꼴 3종','font',5,1,true),
 ('card_foil','금빛 카드 테두리','effect',10,1,true),
 ('profile_flower','꽃빛 프로필 테두리','frame',5,1,true),
 ('profile_mint','민트 프로필 테두리','frame',5,1,true),
 ('nickname_star','별빛 이름 장식','nickname',5,1,true),
 ('game_night','밤하늘 오락실 테마','game',5,0,true);
create function ojjuda_shop_internal.owns(p_user uuid,p_product text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from ojjuda_shop_internal.entitlements e where e.user_id=p_user and e.product=p_product and (e.expires_at is null or e.expires_at>now()));
$$;
-- Internal only: grants deliberately exclude application roles.
revoke all on function ojjuda_shop_internal.owns(uuid,text) from public,anon,authenticated;
create function ojjuda_shop_internal.state() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();c integer;begin
 if u is null then return jsonb_build_object('ok',false,'reason','login');end if;
 select coins into c from public.user_private where user_id=u;
 if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable');end if;
 return jsonb_build_object('ok',true,'coins',c,
 'products',(select coalesce(jsonb_agg(to_jsonb(p) order by p.slot,p.key),'[]') from ojjuda_shop_internal.products p where active),
 'owned',(select coalesce(jsonb_agg(jsonb_build_object('key',e.product,'expires_at',e.expires_at)),'[]') from ojjuda_shop_internal.entitlements e where user_id=u and (expires_at is null or expires_at>now())),
 'selected',(select coalesce(jsonb_object_agg(s.slot,s.product),'{}') from ojjuda_shop_internal.selections s where s.user_id=u and ojjuda_shop_internal.owns(u,s.product)));
end;$$;
create function ojjuda_shop_internal.buy(p_product text,p_request uuid,p_verify_only boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();p ojjuda_shop_internal.products;old ojjuda_shop_internal.receipts;c integer;until_at timestamptz;spent integer;
begin
 if u is null then return jsonb_build_object('ok',false,'reason','login');end if;
 if public.is_banned(u) then return jsonb_build_object('ok',false,'reason','banned');end if;
 if p_request is null or p_verify_only is null then return jsonb_build_object('ok',false,'reason','invalid');end if;
 select coins into c from public.user_private where user_id=u for update;
 if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable');end if;
 select * into old from ojjuda_shop_internal.receipts where user_id=u and request_id=p_request;
 if found then
  if old.product is distinct from p_product then return jsonb_build_object('ok',false,'reason','request_conflict');end if;
  return jsonb_build_object('ok',true,'coins',c,'spent',old.price,'expires_at',old.expires_at,'replayed',true);
 end if;
 if p_verify_only then return jsonb_build_object('ok',false,'reason','not_found','coins',c);end if;
 select * into p from ojjuda_shop_internal.products where key=p_product and active;
 if not found then return jsonb_build_object('ok',false,'reason','unavailable');end if;
 if ojjuda_shop_internal.owns(u,p_product) then
  select expires_at into until_at from ojjuda_shop_internal.entitlements where user_id=u and product=p_product;spent:=0;
 else
  if c<p.price then return jsonb_build_object('ok',false,'reason','coins','coins',c);end if;
  until_at:=case when p.months=1 then now()+interval '1 month' else null end;spent:=p.price;
  update public.user_private set coins=coins-spent where user_id=u returning coins into c;
  insert into ojjuda_shop_internal.entitlements(user_id,product,expires_at) values(u,p_product,until_at)
   on conflict(user_id,product) do update set expires_at=excluded.expires_at,acquired_at=now();
 end if;
 insert into ojjuda_shop_internal.receipts(user_id,request_id,product,price,expires_at) values(u,p_request,p_product,spent,until_at);
 return jsonb_build_object('ok',true,'coins',c,'spent',spent,'expires_at',until_at,'replayed',false);
end;$$;
create function ojjuda_shop_internal.equip(p_slot text,p_product text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();begin
 if u is null then return jsonb_build_object('ok',false,'reason','login');end if;
 if public.is_banned(u) then return jsonb_build_object('ok',false,'reason','banned');end if;
 if p_slot not in('frame','nickname','game') then return jsonb_build_object('ok',false,'reason','invalid');end if;
 if p_product is null then delete from ojjuda_shop_internal.selections where user_id=u and slot=p_slot;
 else
  if not exists(select 1 from ojjuda_shop_internal.products where key=p_product and slot=p_slot and active) or not ojjuda_shop_internal.owns(u,p_product) then return jsonb_build_object('ok',false,'reason','not_owned');end if;
  insert into ojjuda_shop_internal.selections values(u,p_slot,p_product) on conflict(user_id,slot) do update set product=excluded.product;
 end if;
 return jsonb_build_object('ok',true);
end;$$;
create function ojjuda_shop_internal.public_decor(p_users uuid[]) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or p_users is null or cardinality(p_users)>100 then return '{}'::jsonb;end if;
 return (select coalesce(jsonb_object_agg(user_id,decor),'{}') from (
 select s.user_id,jsonb_object_agg(s.slot,jsonb_build_object('key',s.product,'expires_at',e.expires_at)) decor from ojjuda_shop_internal.selections s
 join ojjuda_shop_internal.entitlements e on e.user_id=s.user_id and e.product=s.product
 where s.user_id=any(p_users) and s.slot in('frame','nickname') and(e.expires_at is null or e.expires_at>now()) group by s.user_id) q);
end;$$;
create function public.ju_shop_state() returns jsonb language sql security invoker set search_path='' as $$select ojjuda_shop_internal.state()$$;
create function public.ju_shop_buy(p_product text,p_request uuid,p_verify_only boolean default false) returns jsonb language sql security invoker set search_path='' as $$select ojjuda_shop_internal.buy(p_product,p_request,p_verify_only)$$;
create function public.ju_shop_equip(p_slot text,p_product text) returns jsonb language sql security invoker set search_path='' as $$select ojjuda_shop_internal.equip(p_slot,p_product)$$;
create function public.ju_shop_public_decor(p_users uuid[]) returns jsonb language sql security invoker set search_path='' as $$select ojjuda_shop_internal.public_decor(p_users)$$;
revoke all on function ojjuda_shop_internal.state(),ojjuda_shop_internal.buy(text,uuid,boolean),ojjuda_shop_internal.equip(text,text),ojjuda_shop_internal.public_decor(uuid[]) from public,anon;
grant execute on function ojjuda_shop_internal.state(),ojjuda_shop_internal.buy(text,uuid,boolean),ojjuda_shop_internal.equip(text,text),ojjuda_shop_internal.public_decor(uuid[]) to authenticated;
revoke all on function public.ju_shop_state(),public.ju_shop_buy(text,uuid,boolean),public.ju_shop_equip(text,text),public.ju_shop_public_decor(uuid[]) from public,anon;
grant execute on function public.ju_shop_state(),public.ju_shop_buy(text,uuid,boolean),public.ju_shop_equip(text,text),public.ju_shop_public_decor(uuid[]) to authenticated;

CREATE OR REPLACE FUNCTION ojjuda_note_internal.valid_card_style(p_style jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT coalesce(p_style->>'shopSticker','none') in ('none','heart','clover','moon','coffee','flower','cheer')
    AND coalesce(p_style->>'shopFont','none') in ('none','book','letter','poster')
    AND coalesce(p_style->>'shopEffect','none') in ('none','foil')
    AND p_style IS NOT NULL AND jsonb_typeof(p_style) = 'object'
    AND octet_length(p_style::text) <= 512
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(CASE WHEN jsonb_typeof(p_style) = 'object'
        THEN p_style ELSE '{}'::jsonb END) AS k(key)
      WHERE k.key NOT IN
        ('font', 'size', 'theme', 'effect', 'textColor', 'backgroundColor', 'boxColor', 'boxTransparency','shopSticker','shopFont','shopEffect')
    )
    AND coalesce(p_style->>'font', 'default') IN
      ('default', 'round', 'serif', 'handwriting', 'mono')
    AND coalesce(p_style->>'size', 'normal') IN ('normal', 'large', 'small')
    AND coalesce(p_style->>'theme', 'plain') IN ('plain', 'rose', 'night')
    AND coalesce(p_style->>'effect', 'none') IN
      ('none', 'sparkle', 'frame',
       'rain', 'shimmer', 'rainbow', 'snow', 'starlight',
       'fireflies', 'petals', 'bubbles', 'aurora', 'confetti',
       'sunbeams', 'mist', 'ocean', 'heartbeat', 'orbit',
       'glitter', 'meteor', 'leaves', 'neon', 'dawn')
    AND coalesce(p_style->>'textColor', 'default') IN
      ('default', 'red', 'yellow', 'green', 'blue', 'purple', 'black', 'white')
    AND coalesce(p_style->>'backgroundColor', 'default') IN
      ('default', 'red', 'yellow', 'green', 'blue', 'purple', 'black', 'white')
    AND coalesce(p_style->>'boxColor', 'default') IN
      ('default', 'red', 'yellow', 'green', 'blue', 'purple', 'black', 'white')
    AND (p_style->>'boxTransparency' IS NULL OR (p_style->>'boxTransparency') ~ '^(100|[1-9]?[0-9])$');
$function$;


CREATE OR REPLACE FUNCTION ojjuda_note_internal.upsert_card_style(p_card_id uuid, p_style jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_style jsonb; v_font_until timestamptz; v_effect_until timestamptz;
BEGIN
  IF p_card_id IS NULL OR NOT ojjuda_note_internal.valid_card_style(coalesce(p_style, '{}'::jsonb)) THEN
    RAISE EXCEPTION 'Invalid card style' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_style->>'shopSticker','none')<>'none' AND NOT ojjuda_shop_internal.owns(auth.uid(),'card_stickers') THEN RAISE EXCEPTION 'Sticker not owned' USING ERRCODE='42501'; END IF;
  IF coalesce(p_style->>'shopFont','none')<>'none' THEN
    IF NOT ojjuda_shop_internal.owns(auth.uid(),'card_fonts') THEN RAISE EXCEPTION 'Font not owned' USING ERRCODE='42501';END IF;
    SELECT expires_at INTO v_font_until FROM ojjuda_shop_internal.entitlements WHERE user_id=auth.uid() AND product='card_fonts';
  END IF;
  IF coalesce(p_style->>'shopEffect','none')<>'none' THEN
    IF NOT ojjuda_shop_internal.owns(auth.uid(),'card_foil') THEN RAISE EXCEPTION 'Effect not owned' USING ERRCODE='42501';END IF;
    SELECT expires_at INTO v_effect_until FROM ojjuda_shop_internal.entitlements WHERE user_id=auth.uid() AND product='card_foil';
  END IF;
  v_style := jsonb_build_object(
    'shopSticker',coalesce(p_style->>'shopSticker','none'),
    'shopFont',coalesce(p_style->>'shopFont','none'),'shopFontUntil',v_font_until,
    'shopEffect',coalesce(p_style->>'shopEffect','none'),'shopEffectUntil',v_effect_until,
    'font', coalesce(p_style->>'font', 'default'),
    'size', coalesce(p_style->>'size', 'normal'),
    'theme', coalesce(p_style->>'theme', 'plain'),
    'effect', coalesce(p_style->>'effect', 'none'),
    'textColor', coalesce(p_style->>'textColor', 'default'),
    'backgroundColor', coalesce(p_style->>'backgroundColor', 'default'),
    'boxColor', coalesce(p_style->>'boxColor', 'default'),
    'boxTransparency', coalesce((p_style->>'boxTransparency')::integer, 80)
  );
  INSERT INTO ojjuda_note_internal.card_visuals (card_id, style, style_until)
  VALUES (p_card_id, v_style, statement_timestamp() + interval '1 month')
  ON CONFLICT (card_id) DO UPDATE SET
    style = EXCLUDED.style, style_until = EXCLUDED.style_until,
    updated_at = statement_timestamp();
END;
$function$;

-- A permanent sticker remains on its card after the existing monthly style expires.
CREATE OR REPLACE FUNCTION ojjuda_note_internal.card_visual_for(p_card_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
 SELECT jsonb_build_object(
  'style', CASE WHEN v.style_until > statement_timestamp() THEN v.style
    ELSE jsonb_build_object('font','default','size','normal','theme','plain','effect','none',
      'shopSticker',coalesce(v.style->>'shopSticker','none')) END,
  'style_until',CASE WHEN v.style_until > statement_timestamp() THEN v.style_until END,
  'photo_key',CASE WHEN v.photo_until > statement_timestamp() THEN v.photo_key
    WHEN c.background_key ~ '^([1-9][0-9]|1[0-8][0-9])$' THEN c.background_key END,
  'photo_until',CASE WHEN v.photo_until > statement_timestamp() THEN v.photo_until END)
 FROM ojjuda_note.cards c LEFT JOIN ojjuda_note_internal.card_visuals v ON v.card_id=c.id WHERE c.id=p_card_id;
$function$;
