-- 파장 청소년 질문/답변 4단계: 본인만 보는 임시 답변과 보호용 데이터 모델
-- 아직 공개 피드나 채팅 경로는 만들지 않는다. 기존 성인 파장 RPC에 연결하지 않는다.
create schema if not exists pajang_teen_private;
revoke all on schema pajang_teen_private from public,anon,authenticated,service_role;

create table pajang_teen_private.questions(
  id text primary key,
  category text not null check (category in ('friendship','emotion','life','relationship','safety')),
  prompt text not null check(char_length(prompt) between 20 and 140),
  position smallint not null unique check(position between 1 and 100)
);
insert into pajang_teen_private.questions(id,category,prompt,position) values
  ('teen-friendship-01', 'friendship', '친구가 나와 전혀 다른 의견을 말할 때 대화를 어떻게 이어가나요?', 1),
  ('teen-friendship-02', 'friendship', '친구가 실수해서 속상해할 때 평소 어떻게 도와주나요?', 2),
  ('teen-friendship-03', 'friendship', '처음 함께 활동하는 사람들과 친해질 때 어떤 모습을 보이나요?', 3),
  ('teen-friendship-04', 'friendship', '친한 친구와 약속에 대한 생각이 달라졌을 때 어떻게 조정하나요?', 4),
  ('teen-friendship-05', 'friendship', '친구가 다른 사람을 험담할 때 어떤 태도를 보이나요?', 5),
  ('teen-emotion-06', 'emotion', '기대했던 일이 계획대로 되지 않았을 때 마음을 어떻게 정리하나요?', 6),
  ('teen-emotion-07', 'emotion', '새로운 일을 앞두고 긴장될 때 어떤 행동이 도움이 되나요?', 7),
  ('teen-emotion-08', 'emotion', '누군가 내 마음을 오해했을 때 어떻게 설명하려고 하나요?', 8),
  ('teen-emotion-09', 'emotion', '내 실수를 발견했을 때 가장 먼저 어떤 행동을 하나요?', 9),
  ('teen-emotion-10', 'emotion', '힘든 하루를 보낸 뒤 스스로를 돌보기 위해 어떤 일을 하나요?', 10),
  ('teen-life-11', 'life', '일주일 뒤까지 끝내야 할 일이 생기면 어떻게 계획을 세우나요?', 11),
  ('teen-life-12', 'life', '함께 하는 활동에서 맡고 싶은 역할을 어떻게 고르나요?', 12),
  ('teen-life-13', 'life', '평소와 다른 새로운 취미를 시작할 때 어떤 방식으로 배우나요?', 13),
  ('teen-life-14', 'life', '갑자기 계획이 바뀌어 시간이 비면 그 시간을 어떻게 보내나요?', 14),
  ('teen-relationship-15', 'relationship', '호감이 가는 사람이 생겼을 때 상대를 배려하며 어떻게 표현하나요?', 15),
  ('teen-relationship-16', 'relationship', '친구나 좋아하는 사람과 연락하는 속도가 다를 때 어떻게 맞춰 가나요?', 16),
  ('teen-relationship-17', 'relationship', '누군가 내 관심을 부담스러워하는 것 같으면 어떻게 행동하나요?', 17),
  ('teen-relationship-18', 'relationship', '친구나 좋아하는 사람에게 서운한 마음이 들면 어떻게 전하나요?', 18),
  ('teen-relationship-19', 'relationship', '사람들과 가까워질 때 서로 지켜야 할 약속은 무엇이라고 생각하나요?', 19),
  ('teen-safety-20', 'safety', '온라인에서 불편한 말을 들었을 때 자신을 보호하려면 어떻게 행동하나요?', 20);

create table pajang_teen_private.drafts(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null references pajang_teen_private.questions(id),
  body text not null check(char_length(replace(body,'❤️❤️','♥')) between 1 and 220),
  review_status text not null default 'private' check(review_status in ('private','approved','hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  unique(owner_id,question_id)
);
create index pajang_teen_drafts_review_idx on pajang_teen_private.drafts(review_status,updated_at desc);

create table pajang_teen_private.blocks(
  owner_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(owner_id,target_user_id),
  check(owner_id<>target_user_id)
);

create table pajang_teen_private.reports(
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid not null references pajang_teen_private.drafts(id) on delete cascade,
  reason text not null check(reason in ('bullying','privacy','inappropriate','other')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique(reporter_id,draft_id)
);
create index pajang_teen_reports_open_idx on pajang_teen_private.reports(created_at) where resolved_at is null;

alter table pajang_teen_private.questions enable row level security;
alter table pajang_teen_private.drafts enable row level security;
alter table pajang_teen_private.blocks enable row level security;
alter table pajang_teen_private.reports enable row level security;
revoke all on all tables in schema pajang_teen_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema pajang_teen_private from public,anon,authenticated,service_role;

-- 안전한 본인 답변 API: 질문 카탈로그 + 자기 임시답변만 반환.
create function public.pajang_teen_draft(p_action text default 'state',p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $teen$
declare
  actor uuid := ojjuda_restaurants_internal.require_member();
  question_id text;
  target_user uuid;
  answer_id uuid;
  draft_body text;
  reason text;
  affected integer;
begin
  if public.pajang_age_group() is distinct from 'teen' then
    raise exception '청소년 전용 기능입니다.' using errcode='42501';
  end if;
  if jsonb_typeof(p_data) is distinct from 'object' then
    raise exception '요청을 확인해 주세요.' using errcode='22023';
  end if;
  if p_action='state' then
    if p_data <> '{}'::jsonb then
      raise exception '요청을 확인해 주세요.' using errcode='22023';
    end if;
    return jsonb_build_object(
      'mode','private',
      'questions',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'category',q.category,'question',q.prompt) order by q.position) from pajang_teen_private.questions q),'[]'::jsonb),
      'answers',coalesce((select jsonb_agg(jsonb_build_object('questionId',d.question_id,'body',d.body,'updatedAt',d.updated_at) order by d.updated_at desc) from pajang_teen_private.drafts d where d.owner_id=actor),'[]'::jsonb)
    );
  elsif p_action='save' then
    if p_data - array['questionId','body'] <> '{}'::jsonb
       or jsonb_typeof(p_data->'questionId') is distinct from 'string'
       or jsonb_typeof(p_data->'body') is distinct from 'string' then
      raise exception '질문과 답변을 확인해 주세요.' using errcode='22023';
    end if;
    question_id := p_data->>'questionId';
    if not exists(select from pajang_teen_private.questions where id=question_id) then
      raise exception '존재하지 않는 질문입니다.' using errcode='22023';
    end if;
    draft_body := btrim(p_data->>'body');
    if char_length(replace(draft_body,'❤️❤️','♥')) not between 1 and 220 then
      raise exception '답변은 1~220자로 적어 주세요.' using errcode='22023';
    end if;
    draft_body := public.mask_banned(draft_body);
    insert into pajang_teen_private.drafts(owner_id,question_id,body)
      values(actor,question_id,draft_body)
      on conflict(owner_id,question_id)
      do update set body=excluded.body,updated_at=now(),review_status='private',reviewed_at=null,reviewed_by=null
      returning id into answer_id;
    return jsonb_build_object('saved',true,'questionId',question_id,'body',draft_body,'id',answer_id);
  elsif p_action='delete' then
    if p_data - array['questionId'] <> '{}'::jsonb
       or jsonb_typeof(p_data->'questionId') is distinct from 'string' then
      raise exception '질문을 확인해 주세요.' using errcode='22023';
    end if;
    delete from pajang_teen_private.drafts
      where owner_id=actor and question_id=p_data->>'questionId';
    get diagnostics affected=row_count;
    return jsonb_build_object('deleted',affected>0);
  elsif p_action in ('block','unblock') then
    if p_data - array['targetUser'] <> '{}'::jsonb
       or jsonb_typeof(p_data->'targetUser') is distinct from 'string'
       or coalesce(p_data->>'targetUser','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then
      raise exception '차단할 회원을 확인해 주세요.' using errcode='22023';
    end if;
    target_user := (p_data->>'targetUser')::uuid;
    if target_user=actor or not exists (
      select from ojjuda_account_internal.member_identity i
      where i.user_id=target_user
        and extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date)) between 14 and 18
    ) then
      raise exception '이 회원은 차단할 수 없어요.' using errcode='42501';
    end if;
    if p_action='block' then
      insert into pajang_teen_private.blocks(owner_id,target_user_id)
        values(actor,target_user) on conflict do nothing;
    else
      delete from pajang_teen_private.blocks where owner_id=actor and target_user_id=target_user;
    end if;
    return jsonb_build_object('blocked',p_action='block');
  elsif p_action='report' then
    if p_data - array['answerId','reason'] <> '{}'::jsonb
       or jsonb_typeof(p_data->'answerId') is distinct from 'string'
       or coalesce(p_data->>'answerId','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
       or jsonb_typeof(p_data->'reason') is distinct from 'string' then
      raise exception '신고 내용을 확인해 주세요.' using errcode='22023';
    end if;
    answer_id := (p_data->>'answerId')::uuid;
    reason := p_data->>'reason';
    if reason not in ('bullying','privacy','inappropriate','other') then
      raise exception '신고 사유를 선택해 주세요.' using errcode='22023';
    end if;
    -- 승인된 청소년 답변만 신고. 현재 공개 피드는 없으며, 응답 본문은 신고자에게 전달하지 않는다.
    if not exists(
      select from pajang_teen_private.drafts d
      join ojjuda_account_internal.member_identity i on i.user_id=d.owner_id
      where d.id=answer_id and d.owner_id<>actor and d.review_status='approved'
        and extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date)) between 14 and 18
    ) then
      raise exception '신고할 수 없는 답변입니다.' using errcode='42501';
    end if;
    insert into pajang_teen_private.reports(reporter_id,draft_id,reason)
      values(actor,answer_id,reason)
      on conflict(reporter_id,draft_id) do nothing;
    return jsonb_build_object('reported',true);
  else
    raise exception '지원하지 않는 요청입니다.' using errcode='22023';
  end if;
end;
$teen$;
revoke all on function public.pajang_teen_draft(text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pajang_teen_draft(text,jsonb) to authenticated;

-- 관리자 전용 검토/신고 접수 API. 승인 처리해도 게시 API는 아직 존재하지 않는다.
create function public.admin_pajang_teen_moderation(p_action text,p_answer uuid default null,p_report uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $admin$
declare
  manager uuid:=auth.uid();
  affected integer;
begin
  if manager is null or not coalesce(public.is_admin(),false) then
    raise exception '관리자 권한이 필요합니다.' using errcode='42501';
  end if;
  if p_action='queue' then
    if p_answer is not null or p_report is not null then
      raise exception '요청을 확인해 주세요.' using errcode='22023';
    end if;
    return jsonb_build_object(
      'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'draftId',r.draft_id,'reason',r.reason,'createdAt',r.created_at) order by r.created_at desc) from (select * from pajang_teen_private.reports where resolved_at is null order by created_at desc limit 50) r),'[]'::jsonb),
      'drafts',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'body',d.body,'questionId',d.question_id,'status',d.review_status) order by d.updated_at desc) from (select * from pajang_teen_private.drafts order by updated_at desc limit 50) d),'[]'::jsonb)
    );
  elsif p_action in ('approve','hide') then
    if p_answer is null or p_report is not null then
      raise exception '답변을 확인해 주세요.' using errcode='22023';
    end if;
    update pajang_teen_private.drafts
      set review_status=case when p_action='approve' then 'approved' else 'hidden' end,
          reviewed_by=manager,reviewed_at=now()
      where id=p_answer;
    get diagnostics affected=row_count;
    if affected=0 then raise exception '답변을 찾을 수 없어요.' using errcode='P0002'; end if;
    return jsonb_build_object('updated',true,'status',case when p_action='approve' then 'approved' else 'hidden' end);
  elsif p_action='resolve' then
    if p_report is null or p_answer is not null then
      raise exception '신고를 확인해 주세요.' using errcode='22023';
    end if;
    update pajang_teen_private.reports set resolved_by=manager,resolved_at=now()
      where id=p_report and resolved_at is null;
    get diagnostics affected=row_count;
    return jsonb_build_object('resolved',affected>0);
  end if;
  raise exception '지원하지 않는 요청입니다.' using errcode='22023';
end;
$admin$;
revoke all on function public.admin_pajang_teen_moderation(text,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_pajang_teen_moderation(text,uuid,uuid) to authenticated;

-- 설계상 승인된 초안조차 공개/검색/채팅으로 읽을 수 없다.
comment on function public.pajang_teen_draft(text,jsonb) is
  '청소년 본인만 사용할 수 있는 비공개 임시답변·신고·차단 API. 대외 공개 피드 없음.';
