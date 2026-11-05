-- Flat screw inventory. A stage award is the unit of ownership for both
-- historical and new rewards. Purchases and drills share the same wallet lock.
create table ojjuda_shop_internal.flat_drill_awards (
 user_id uuid not null references auth.users(id) on delete cascade,
 stage integer not null check(stage between 1 and 1000), origin text not null check(origin in ('legacy','first_clear')),
 primary key(user_id,stage)
);
create table ojjuda_shop_internal.flat_drill_first (
 user_id uuid not null references auth.users(id) on delete cascade, stage integer not null check(stage between 1 and 1000),
 run_id uuid not null, attempt_id uuid not null, started_at timestamptz not null default now(), moves integer, lost boolean not null default false,
 primary key(user_id,stage)
);
create table ojjuda_shop_internal.flat_drill_legacy_devices (
 device uuid primary key, user_id uuid not null references auth.users(id) on delete cascade
);
-- Immutable pre-release score evidence bounds an unsigned old browser save.
create table ojjuda_shop_internal.flat_drill_legacy_evidence (
 user_id uuid primary key references auth.users(id) on delete cascade, max_score integer not null
);
alter table ojjuda_shop_internal.flat_drill_awards enable row level security;
alter table ojjuda_shop_internal.flat_drill_first enable row level security;
alter table ojjuda_shop_internal.flat_drill_legacy_devices enable row level security;
alter table ojjuda_shop_internal.flat_drill_legacy_evidence enable row level security;
revoke all on ojjuda_shop_internal.flat_drill_awards,ojjuda_shop_internal.flat_drill_first,
 ojjuda_shop_internal.flat_drill_legacy_devices,
 ojjuda_shop_internal.flat_drill_legacy_evidence from public,anon,authenticated;
insert into ojjuda_shop_internal.flat_drill_legacy_evidence
 select user_id,max(score) from public.game_scores where game='screw_flat' and user_id is not null group by user_id;
-- Old receipts identify the stage but not whether that paid run eventually won.
-- Keep those historical stages pending until their clear can be attributed.
create table ojjuda_shop_internal.flat_drill_legacy_items (
 user_id uuid not null references auth.users(id) on delete cascade, stage integer not null,
 primary key(user_id,stage)
);
alter table ojjuda_shop_internal.flat_drill_legacy_items enable row level security;
revoke all on ojjuda_shop_internal.flat_drill_legacy_items from public,anon,authenticated;
insert into ojjuda_shop_internal.flat_drill_legacy_items
 select distinct user_id,(result->>'stage')::integer from ojjuda_note_internal.spend_requests
 where kind in('screw_flat_hole','screw_flat_moves') and result->>'stage' is not null;
-- A receipt at stage N proves that N-1 stages were previously unlocked.
insert into ojjuda_shop_internal.flat_drill_awards(user_id,stage,origin)
 select x.user_id,s,'legacy' from (
   select user_id,max((result->>'stage')::integer) as highest from ojjuda_note_internal.spend_requests
   where kind in('screw_flat_hole','screw_flat_moves') group by user_id
 ) x cross join lateral generate_series(1,least(x.highest-1,999))s
 where not exists(select 1 from ojjuda_shop_internal.flat_drill_legacy_items i where i.user_id=x.user_id and i.stage=s) on conflict do nothing;
create index flat_drill_spends_by_user on ojjuda_note_internal.spend_requests(user_id)
 where kind='screw_flat_hole' and result->>'payment'='drill';

create function ojjuda_shop_internal.flat_drill_balance(p_user uuid)
 returns integer language sql stable set search_path='' as $$
 select (select count(*) from ojjuda_shop_internal.flat_drill_awards where user_id=p_user)::integer
  -(select count(*) from ojjuda_note_internal.spend_requests where user_id=p_user and kind='screw_flat_hole' and result->>'payment'='drill')::integer;
$$;
revoke all on function ojjuda_shop_internal.flat_drill_balance(uuid) from public,anon,authenticated;

create function ojjuda_shop_internal.flat_drill_action(p_action text,p_stage integer,p_run uuid,p_attempt uuid,
 p_request uuid,p_device uuid,p_legacy integer)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); owner_id uuid; n integer; c integer; bal integer; cap integer; added integer:=0; old record; first_id uuid;
begin
 if u is null then raise exception 'not_signed_in'; end if;
 if public.is_banned(u) or p_stage is null or p_stage not between 1 and 1000 or p_run is null or p_attempt is null
    or p_action is null or p_action not in('start','status','use','fail') then return jsonb_build_object('ok',false,'reason','invalid'); end if;
 select coins into c from public.user_private where user_id=u for update;
 if not found then return jsonb_build_object('ok',false,'reason','wallet_unavailable'); end if;
 if p_action='start' then
   if p_device is not null and p_legacy between 1 and 999 then
     select max_score/10 into cap from ojjuda_shop_internal.flat_drill_legacy_evidence where user_id=u;
     if cap is not null then
       insert into ojjuda_shop_internal.flat_drill_legacy_devices values(p_device,u) on conflict do nothing;
       select user_id into owner_id from ojjuda_shop_internal.flat_drill_legacy_devices where device=p_device;
       if owner_id=u then
         insert into ojjuda_shop_internal.flat_drill_awards select u,s,'legacy' from generate_series(1,least(p_legacy,cap))s
          where not exists(select 1 from ojjuda_shop_internal.flat_drill_legacy_items i where i.user_id=u and i.stage=s)
          on conflict do nothing;
         get diagnostics added=row_count;
       end if;
     end if;
   end if;
   insert into ojjuda_shop_internal.flat_drill_first(user_id,stage,run_id,attempt_id) values(u,p_stage,p_run,p_attempt) on conflict do nothing;
 end if;
 if p_action='fail' then
   update ojjuda_shop_internal.flat_drill_first set lost=true where user_id=u and stage=p_stage and run_id=p_run and moves is null;
 end if;
 select run_id into first_id from ojjuda_shop_internal.flat_drill_first where user_id=u and stage=p_stage and not lost;
 if p_action='use' then
   if p_request is null then return jsonb_build_object('ok',false,'reason','invalid'); end if;
   select * into old from ojjuda_note_internal.spend_requests where request_id=p_request;
   if found and (old.user_id<>u or old.kind<>'screw_flat_hole' or old.result->>'payment' is distinct from 'drill'
     or old.result->>'stage' is distinct from p_stage::text or old.result->>'attempt_id' is distinct from p_attempt::text)
   then return jsonb_build_object('ok',false,'reason','request_conflict'); end if;
 end if;
 select count(*) into n from ojjuda_note_internal.spend_requests where user_id=u and kind='screw_flat_hole'
    and result->>'stage'=p_stage::text and result->>'attempt_id'=p_attempt::text;
 bal:=ojjuda_shop_internal.flat_drill_balance(u);
 if p_action='use' then
   if old.request_id is null then
     if n>=9 or bal<1 then return jsonb_build_object('ok',false,'reason',case when n>=9 then 'limit' else 'empty' end,'balance',bal,'count',n); end if;
     n:=n+1;bal:=bal-1;
     insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result) values(p_request,u,'screw_flat_hole',0,
       jsonb_build_object('ok',true,'stage',p_stage,'attempt_id',p_attempt,'kind','flat_hole','payment','drill','price',0,'count',n,'coins',c));
   end if;
 end if;
 return jsonb_build_object('ok',true,'stage',p_stage,'attempt_id',p_attempt,'balance',bal,'count',n,'legacy_added',added,
   'first',coalesce(first_id=p_run,false) and not exists(select 1 from ojjuda_shop_internal.flat_drill_awards where user_id=u and stage=p_stage));
end;
$$;
create function public.flat_drill_action(p_action text,p_stage integer,p_run uuid,p_attempt uuid,
 p_request uuid default null,p_device uuid default null,p_legacy integer default 0)
 returns jsonb language sql security invoker set search_path='' as $$
 select ojjuda_shop_internal.flat_drill_action(p_action,p_stage,p_run,p_attempt,p_request,p_device,p_legacy);
$$;
revoke all on function ojjuda_shop_internal.flat_drill_action(text,integer,uuid,uuid,uuid,uuid,integer),
 public.flat_drill_action(text,integer,uuid,uuid,uuid,uuid,integer) from public,anon;
grant execute on function ojjuda_shop_internal.flat_drill_action(text,integer,uuid,uuid,uuid,uuid,integer),
 public.flat_drill_action(text,integer,uuid,uuid,uuid,uuid,integer) to authenticated;

-- Only the server that successfully replays a clear may call this endpoint.
create function public.flat_drill_verified_clear(p_user uuid,p_stage integer,p_run uuid,p_moves integer,p_attempt uuid)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare f record; a integer; added integer:=0; reward_status text;
begin
 perform 1 from public.user_private where user_id=p_user for update;
 if not found or public.is_banned(p_user) then return jsonb_build_object('ok',false,'reason','user'); end if;
 if p_stage not between 1 and 1000 or p_moves is null or p_moves<2 then
  return jsonb_build_object('ok',false,'reason','invalid'); end if;
 select count(*) into a from ojjuda_note_internal.spend_requests where user_id=p_user and kind in('screw_flat_hole','screw_flat_moves')
  and result->>'stage'=p_stage::text and result->>'attempt_id'=p_attempt::text;
 select * into f from ojjuda_shop_internal.flat_drill_first where user_id=p_user and stage=p_stage;
 if not found or f.run_id<>p_run or f.attempt_id is distinct from p_attempt or f.lost then reward_status:='retry';
 else
  if f.moves is not null and f.moves<>p_moves then return jsonb_build_object('ok',false,'reason','already_closed'); end if;
  update ojjuda_shop_internal.flat_drill_first set moves=p_moves where user_id=p_user and stage=p_stage and moves is null;
  if a>0 then reward_status:='items_used';
  elsif exists(select 1 from ojjuda_shop_internal.flat_drill_awards where user_id=p_user and stage=p_stage and origin='legacy') then reward_status:='legacy';
  elsif exists(select 1 from ojjuda_shop_internal.flat_drill_legacy_items where user_id=p_user and stage=p_stage) then reward_status:='prior_attempt';
  else
    insert into ojjuda_shop_internal.flat_drill_awards values(p_user,p_stage,'first_clear') on conflict do nothing;
    get diagnostics added=row_count;reward_status:='earned';
  end if;
 end if;
 return jsonb_build_object('ok',true,'reward',reward_status,'added',added,'balance',ojjuda_shop_internal.flat_drill_balance(p_user));
end;
$$;
revoke all on function public.flat_drill_verified_clear(uuid,integer,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.flat_drill_verified_clear(uuid,integer,uuid,integer,uuid) to service_role;
