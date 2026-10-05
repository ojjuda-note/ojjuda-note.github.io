-- 오쭈다 포토땅따먹기: 사용자 사진 판 (Supabase SQL 편집기에서 한 번 실행 · 여러 번 실행해도 안전)
create extension if not exists pgcrypto;

create table if not exists public.photo_stages (
  id           uuid primary key default gen_random_uuid(),
  owner        uuid not null references auth.users(id) on delete cascade,
  nick         text check (char_length(nick) <= 30),
  image_path   text not null,
  full_path    text,                                   -- 다 깼을 때 보여 줄 원본 사진
  crop_box     text check (char_length(crop_box) < 80), -- 원본 중 게임 판 위치 "왼,위,폭,높이"(0~1)
  mask_rle     text not null check (char_length(mask_rle) < 200000),
  level        int  not null default 7 check (level between 0 and 19),
  sil_pct      real check (sil_pct between 35 and 75),
  visibility   text not null default 'public' check (visibility in ('public','friends','private')),
  status       text not null default 'pending' check (status in ('pending','approved','rejected','hidden')),
  plays        int  not null default 0,
  clears       int  not null default 0,
  report_count int  not null default 0,
  created_at   timestamptz not null default now()
);
-- 예전 버전으로 표를 이미 만들었다면 빠진 칸만 추가돼요
alter table public.photo_stages add column if not exists full_path text;
alter table public.photo_stages add column if not exists crop_box text;
alter table public.photo_stages add column if not exists sil_pct real;
alter table public.photo_stages add column if not exists visibility text not null default 'public';
alter table public.photo_stages drop constraint if exists photo_stages_sil_pct_check;
alter table public.photo_stages add constraint photo_stages_sil_pct_check check (sil_pct between 35 and 75);
alter table public.photo_stages drop constraint if exists photo_stages_visibility_check;
alter table public.photo_stages add constraint photo_stages_visibility_check check (visibility in ('public','friends','private'));
create index if not exists photo_stages_list_idx  on public.photo_stages(visibility, status, created_at desc);
create index if not exists photo_stages_owner_idx on public.photo_stages(owner, created_at desc);

create table if not exists public.photo_admins (user_id uuid primary key references auth.users(id) on delete cascade);
create table if not exists public.photo_reports (
  stage_id uuid references public.photo_stages(id) on delete cascade,
  reporter uuid references auth.users(id) on delete cascade,
  reason text check (char_length(reason) <= 100),
  created_at timestamptz default now(),
  primary key (stage_id, reporter)
);
alter table public.photo_stages  enable row level security;
alter table public.photo_admins  enable row level security;
alter table public.photo_reports enable row level security;

create or replace function public.photo_is_admin() returns boolean
language sql stable security invoker set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.photo_admins where user_id = auth.uid())
$$;

-- 월드의 수락된 친구 관계를 그대로 사용해요.
create or replace function public.photo_is_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and (auth.uid() = a or auth.uid() = b)
    and exists (select 1 from public.friendships f where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a)))
$$;

drop policy if exists photo_admins_select on public.photo_admins;
create policy photo_admins_select on public.photo_admins for select to anon, authenticated
  using (user_id = (select auth.uid()));

-- 보기 규칙
--   전체공개: 관리자 승인(approved)된 것만 모두에게
--   친구공개: 바로 친구에게 (숨김 제외)
--   비공개 : 나만
--   내 사진은 언제나 나에게, 관리자는 전부
drop policy if exists photo_stages_select on public.photo_stages;
create policy photo_stages_select on public.photo_stages for select using (
     owner = auth.uid()
  or public.photo_is_admin()
  or (visibility = 'public'  and status = 'approved')
  or (visibility = 'friends' and status = 'approved' and public.photo_is_friend(owner, auth.uid()))
);
-- 올리기: 전체공개는 '승인 대기'로, 친구공개·비공개는 바로 사용 가능
drop policy if exists photo_stages_insert on public.photo_stages;
create policy photo_stages_insert on public.photo_stages for insert with check (
  auth.uid() = owner and split_part(image_path, '/', 1) = auth.uid()::text
  and (full_path is null or split_part(full_path, '/', 1) = auth.uid()::text) and plays = 0 and clears = 0 and report_count = 0
  and ((visibility = 'public' and status = 'pending') or (visibility in ('friends','private') and status = 'approved'))
);
drop policy if exists photo_stages_delete on public.photo_stages;
create policy photo_stages_delete on public.photo_stages for delete using (owner = auth.uid() or public.photo_is_admin());

-- 하루 5장까지
create or replace function public.photo_upload_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or new.owner is distinct from auth.uid() then raise exception 'login required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.owner::text, 0));
  new.created_at := now();
  if (select count(*) from photo_stages where owner = new.owner and created_at > now() - interval '1 day') >= 5 then
    raise exception '하루에 5장까지 올릴 수 있어요';
  end if;
  return new;
end $$;
drop trigger if exists photo_upload_limit on public.photo_stages;
create trigger photo_upload_limit before insert on public.photo_stages for each row execute function public.photo_upload_limit();

-- 올린 사람이 공개 범위 바꾸기 (전체공개로 바꾸면 다시 승인 대기)
create or replace function public.photo_set_visibility(p_id uuid, p_vis text) returns text
language plpgsql security definer set search_path = public as $$
declare cur record;
begin
  if p_vis not in ('public','friends','private') then raise exception 'bad visibility'; end if;
  select * into cur from photo_stages where id = p_id for update;
  if auth.uid() is null or cur is null or cur.owner is distinct from auth.uid() then raise exception 'not allowed'; end if;
  if cur.status = 'hidden' then raise exception '신고로 숨겨진 사진이에요'; end if;
  update photo_stages set visibility = p_vis,
         status = case when p_vis = 'public' and not (cur.visibility = 'public' and cur.status = 'approved') then 'pending'
                       when p_vis <> 'public' then 'approved' else cur.status end
   where id = p_id;
  return (select status from photo_stages where id = p_id);
end $$;

-- 관리자: 승인 / 반려 / 숨김
create or replace function public.photo_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not photo_is_admin() then raise exception 'not allowed'; end if;
  if p_status not in ('pending','approved','rejected','hidden') then raise exception 'bad status'; end if;
  update photo_stages set status = p_status where id = p_id;
end $$;

-- 신고: 한 사람당 한 번, 3번이면 자동 숨김
create or replace function public.photo_report(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if not exists (select 1 from photo_stages where id = p_id and
    (owner = auth.uid() or photo_is_admin() or (status = 'approved' and
      (visibility = 'public' or (visibility = 'friends' and photo_is_friend(owner,auth.uid())))))) then
    raise exception 'not allowed';
  end if;
  perform 1 from photo_stages where id = p_id for update;
  insert into photo_reports(stage_id, reporter, reason) values (p_id, auth.uid(), left(p_reason, 100)) on conflict do nothing;
  select count(*) into n from photo_reports where stage_id = p_id;
  update photo_stages set report_count = n, status = case when n >= 3 then 'hidden' else status end where id = p_id;
end $$;

create or replace function public.photo_record(p_id uuid, p_cleared boolean) returns void
language sql security definer set search_path = public as $$
  update photo_stages set plays = plays + case when p_cleared then 0 else 1 end,
                          clears = clears + case when p_cleared then 1 else 0 end
   where id = p_id and status = 'approved' and auth.uid() is not null
     and (owner = auth.uid() or photo_is_admin() or visibility = 'public'
       or (visibility = 'friends' and photo_is_friend(owner,auth.uid())));
$$;

grant execute on function public.photo_is_admin(), public.photo_is_friend(uuid,uuid), public.photo_set_visibility(uuid,text),
  public.photo_set_status(uuid,text), public.photo_report(uuid,text), public.photo_record(uuid,boolean) to authenticated;

-- 사진 저장소
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photo-stages', 'photo-stages', false, 2097152, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "photo-stages upload own" on storage.objects;
create policy "photo-stages upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'photo-stages' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "photo-stages delete own" on storage.objects;
create policy "photo-stages delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'photo-stages' and ((storage.foldername(name))[1] = auth.uid()::text or public.photo_is_admin()));

-- 관리자 등록 (이메일을 바꿔서 실행)
-- insert into public.photo_admins(user_id) select id from auth.users where email = '운영자@이메일' on conflict do nothing;

-- 사진 파일에도 공개 범위를 적용하고, 볼 수 있는 사람에게만 임시 주소를 발급해요.
drop policy if exists "photo-stages read allowed" on storage.objects;
create policy "photo-stages read allowed" on storage.objects for select to anon, authenticated
  using (bucket_id = 'photo-stages' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or public.photo_is_admin()
    or exists (select 1 from public.photo_stages p where p.image_path = name or p.full_path = name)
  ));

revoke all on public.photo_stages, public.photo_admins, public.photo_reports from public, anon, authenticated;
grant select on public.photo_stages, public.photo_admins to anon, authenticated;
grant insert, delete on public.photo_stages to authenticated;
grant all on public.photo_stages, public.photo_admins, public.photo_reports to service_role;
revoke all on function public.photo_is_admin(), public.photo_is_friend(uuid,uuid), public.photo_upload_limit(),
  public.photo_set_visibility(uuid,text), public.photo_set_status(uuid,text), public.photo_report(uuid,text),
  public.photo_record(uuid,boolean) from public, anon, authenticated;
grant execute on function public.photo_is_admin(), public.photo_is_friend(uuid,uuid) to anon, authenticated;
grant execute on function public.photo_set_visibility(uuid,text), public.photo_set_status(uuid,text),
  public.photo_report(uuid,text), public.photo_record(uuid,boolean) to authenticated;
