-- Automatic names are claimed inside the Auth signup transaction. Merely opening
-- the form cannot consume names. Failed signups roll back both claims and counters.
set local lock_timeout = '4s';
create table ojjuda_account_internal.signup_nickname_bases (
  id integer generated always as identity primary key,
  nickname text not null unique check (nickname ~ '^[가-힣]{1,4} [가-힣]{1,4}$'),
  next_suffix bigint not null default 1 check (next_suffix > 0)
);
create table ojjuda_account_internal.signup_nickname_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null unique check (char_length(nickname) between 1 and 12),
  requested_name text not null
);
alter table ojjuda_account_internal.signup_nickname_bases enable row level security;
alter table ojjuda_account_internal.signup_nickname_claims enable row level security;
revoke all on ojjuda_account_internal.signup_nickname_bases,
  ojjuda_account_internal.signup_nickname_claims from public,anon,authenticated;
revoke all on sequence ojjuda_account_internal.signup_nickname_bases_id_seq from public,anon,authenticated;

with words as (select
  array['노래하는', '춤추는', '웃는', '달리는', '꿈꾸는', '날아가는', '반짝이는', '산책하는',
        '여행하는', '수영하는', '그리는', '요리하는', '독서하는', '연주하는', '응원하는', '인사하는',
        '기다리는', '속삭이는', '미소짓는', '손뼉치는', '하품하는', '기지개켠', '졸고있는', '뒹구는',
        '숨은', '탐험하는', '모험하는', '첨벙대는', '소풍가는', '별보는', '산오르는', '길찾는']::text[] as actions,
  array['딸기', '사과', '포도', '복숭아', '자두', '살구', '수박', '참외',
        '귤', '유자', '감', '배', '앵두', '오디', '산딸기', '무화과',
        '레몬', '망고', '바나나', '체리', '석류', '멜론', '대추', '키위',
        '연필', '우산', '풍선', '모자', '방울', '양말', '리본', '단추',
        '책갈피', '찻잔', '그네', '종이배', '피리', '연', '색연필', '비눗방울',
        '구름', '별빛', '달빛', '햇살', '노을', '바람', '이슬', '눈꽃',
        '새싹', '꽃잎', '나뭇잎', '솔방울', '도토리', '밤송이', '민들레', '해바라기',
        '무지개', '파도', '산들바람', '은하수', '샛별', '눈송이', '풀잎', '물방울', '우주']::text[] as things,
  array['고래', '토끼', '여우', '수달', '고양이', '강아지', '다람쥐', '판다',
        '오리', '펭귄', '부엉이', '참새', '돌고래', '바다표범', '너구리', '고슴도치',
        '사슴', '코알라', '햄스터', '기린', '얼룩말', '코끼리', '하마', '사자',
        '호랑이', '치타', '표범', '늑대', '곰', '양', '염소', '알파카',
        '병아리', '앵무새', '까치', '제비', '갈매기', '두루미', '백조', '공작',
        '거북이', '개구리', '도롱뇽', '달팽이', '나비', '꿀벌', '무당벌레', '잠자리',
        '반딧불이', '물개', '해달', '바다사자', '해마', '불가사리', '문어', '오징어',
        '복어', '금붕어', '잉어', '가오리', '새우', '가재', '게', '청설모']::text[] as animals)
insert into ojjuda_account_internal.signup_nickname_bases(nickname)
select a.word || ' ' || b.word from words,
  unnest(actions || things) with ordinality a(word, position),
  unnest(animals || things) with ordinality b(word, position)
where a.word <> b.word order by a.position,b.position;

create function ojjuda_account_internal.pick_signup_nickname(p_preferred text)
returns text language plpgsql set search_path = '' as $$
declare
  v_base record;
  v_name text;
  v_start integer;
  v_number bigint;
begin
  -- Shared with every profile nickname write, including manually chosen names.
  perform pg_catalog.pg_advisory_xact_lock(18299417,1);
  if exists(select from ojjuda_account_internal.signup_nickname_bases where nickname=p_preferred)
    and not exists(select from public.profiles where nickname=p_preferred)
    and not exists(select from ojjuda_account_internal.signup_nickname_claims where nickname=p_preferred)
    and not public.has_banned(p_preferred) then
    return p_preferred;
  end if;
  select 1+floor(random()*coalesce(max(id),1))::integer into v_start
    from ojjuda_account_internal.signup_nickname_bases;
  -- Inspect the entire remaining base-name pool before adding any number.
  for v_base in
    select b.nickname from ojjuda_account_internal.signup_nickname_bases b
    where not exists(select from public.profiles p where p.nickname=b.nickname)
      and not exists(select from ojjuda_account_internal.signup_nickname_claims c where c.nickname=b.nickname)
    order by (b.id >= v_start) desc,b.id
  loop
    if not public.has_banned(v_base.nickname) then return v_base.nickname; end if;
  end loop;
  -- Only exhausted pools reach this branch. Counters are per base and transactional.
  for v_base in
    select b.nickname,b.next_suffix from ojjuda_account_internal.signup_nickname_bases b
    order by (b.nickname=p_preferred) desc nulls last,b.next_suffix,(b.id >= v_start) desc,b.id
  loop
    if public.has_banned(v_base.nickname) then continue; end if;
    v_number := v_base.next_suffix;
    while char_length(v_base.nickname || v_number::text) <= 12 loop
      v_name := v_base.nickname || v_number::text;
      update ojjuda_account_internal.signup_nickname_bases set next_suffix=v_number+1
        where nickname=v_base.nickname;
      if not exists(select from public.profiles where nickname=v_name)
        and not exists(select from ojjuda_account_internal.signup_nickname_claims where nickname=v_name)
        and not public.has_banned(v_name) then return v_name; end if;
      v_number := v_number+1;
    end loop;
  end loop;
  raise exception 'nickname_unavailable' using errcode='22023';
end;
$$;
revoke all on function ojjuda_account_internal.pick_signup_nickname(text) from public,anon,authenticated;

create function ojjuda_account_internal.claim_signup_nickname()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if new.raw_user_meta_data->>'nickname_auto' is distinct from 'true' then return new; end if;
  v_name := ojjuda_account_internal.pick_signup_nickname(new.raw_user_meta_data->>'nickname');
  insert into ojjuda_account_internal.signup_nickname_claims(user_id,nickname,requested_name)
    values(new.id,v_name,coalesce(new.raw_user_meta_data->>'nickname',''));
  update auth.users set raw_user_meta_data = pg_catalog.jsonb_set(
    coalesce(raw_user_meta_data,'{}'::jsonb)-'nickname_auto','{nickname}',to_jsonb(v_name)) where id=new.id;
  return new;
end;
$$;
revoke all on function ojjuda_account_internal.claim_signup_nickname() from public,anon,authenticated;
create trigger claim_signup_nickname after insert on auth.users
  for each row when (new.raw_user_meta_data->>'nickname_auto' = 'true')
  execute function ojjuda_account_internal.claim_signup_nickname();

-- Auth may write its original input metadata again after INSERT. Keep the claim
-- authoritative in both email metadata copies until the profile is created.
create function ojjuda_account_internal.keep_claimed_signup_nickname()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
begin
  if tg_relid='auth.users'::regclass then
    select nickname into v_name from ojjuda_account_internal.signup_nickname_claims where user_id=new.id;
    if found then
      new.raw_user_meta_data := pg_catalog.jsonb_set(coalesce(new.raw_user_meta_data,'{}'::jsonb)-'nickname_auto','{nickname}',to_jsonb(v_name));
    end if;
  elsif tg_relid='auth.identities'::regclass and new.provider='email' then
    select nickname into v_name from ojjuda_account_internal.signup_nickname_claims where user_id=new.user_id;
    if found then
      new.identity_data := pg_catalog.jsonb_set(coalesce(new.identity_data,'{}'::jsonb)-'nickname_auto','{nickname}',to_jsonb(v_name));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function ojjuda_account_internal.keep_claimed_signup_nickname() from public,anon,authenticated;
create trigger keep_claimed_signup_nickname before update of raw_user_meta_data on auth.users
  for each row execute function ojjuda_account_internal.keep_claimed_signup_nickname();
create trigger keep_claimed_signup_nickname before insert or update of identity_data,provider on auth.identities
  for each row when (new.provider='email') execute function ojjuda_account_internal.keep_claimed_signup_nickname();

create function ojjuda_account_internal.protect_signup_nickname_claim()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_claim ojjuda_account_internal.signup_nickname_claims%rowtype;
begin
  if tg_op='UPDATE' and new.nickname is not distinct from old.nickname then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(18299417,1);
  select * into v_claim from ojjuda_account_internal.signup_nickname_claims where user_id=new.id;
  if found and tg_op='INSERT' then
    -- Accept either the returned Auth name or an older signup response. An explicit
    -- new nickname is still respected, subject to normal uniqueness and moderation.
    if new.nickname in (v_claim.nickname,v_claim.requested_name) then new.nickname := v_claim.nickname; end if;
    delete from ojjuda_account_internal.signup_nickname_claims where user_id=new.id;
    update auth.users set raw_user_meta_data=pg_catalog.jsonb_set(
      coalesce(raw_user_meta_data,'{}'::jsonb)-'nickname_auto','{nickname}',to_jsonb(new.nickname)) where id=new.id;
  end if;
  if exists(select from ojjuda_account_internal.signup_nickname_claims where nickname=new.nickname and user_id<>new.id) then
    raise exception 'nickname already reserved' using errcode='23505',constraint='profiles_nickname_key';
  end if;
  -- This trigger runs before the existing banned_check trigger, so it validates
  -- the final assigned nickname too. The existing UNIQUE index is retained.
  return new;
end;
$$;
revoke all on function ojjuda_account_internal.protect_signup_nickname_claim() from public,anon,authenticated;
create trigger automatic_nickname_claim before insert or update of nickname on public.profiles
  for each row execute function ojjuda_account_internal.protect_signup_nickname_claim();
