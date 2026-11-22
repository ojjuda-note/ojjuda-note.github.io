-- 파장 청소년 전용 공개 답변과 댓글/공감
-- 서로의 답변은 만 14~18세의 인증 회원에게만, 관리자 승인 이후에만 조회된다.
-- 기존 성인 파장의 테이블·RPC·화면과 연동하지 않는다.
create table pajang_teen_private.comments(
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references pajang_teen_private.drafts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check(char_length(replace(body,'❤️❤️','♥')) between 1 and 200),
  review_status text not null default 'pending' check(review_status in ('pending','approved','hidden')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);
create index pajang_teen_comments_feed_idx on pajang_teen_private.comments(draft_id,review_status,created_at);
create index pajang_teen_comments_author_idx on pajang_teen_private.comments(author_id,created_at desc);

create table pajang_teen_private.likes(
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid not null references pajang_teen_private.drafts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(owner_id,draft_id)
);
create index pajang_teen_likes_draft_idx on pajang_teen_private.likes(draft_id);

create table pajang_teen_private.comment_reports(
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  comment_id uuid not null references pajang_teen_private.comments(id) on delete cascade,
  reason text not null check(reason in ('bullying','privacy','inappropriate','other')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  unique(reporter_id,comment_id)
);
create index pajang_teen_comment_reports_open_idx on pajang_teen_private.comment_reports(created_at desc)
  where resolved_at is null;

create table pajang_teen_private.moderation_events(
  id bigint generated always as identity primary key,
  moderator_id uuid not null references auth.users(id),
  kind text not null check(kind in ('comment','comment_report')),
  target_id uuid not null,
  action text not null check(action in ('approve','hide','resolve')),
  created_at timestamptz not null default now()
);

alter table pajang_teen_private.comments enable row level security;
alter table pajang_teen_private.likes enable row level security;
alter table pajang_teen_private.comment_reports enable row level security;
alter table pajang_teen_private.moderation_events enable row level security;
revoke all on all tables in schema pajang_teen_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema pajang_teen_private from public,anon,authenticated,service_role;

create function public.pajang_teen_feed(p_question text,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $feed$
declare
  viewer uuid:=ojjuda_restaurants_internal.require_member();
  published jsonb;
begin
  if public.pajang_age_group() is distinct from 'teen' then
    raise exception '청소년 전용 기능입니다.' using errcode='42501';
  end if;
  if p_question is null or not exists(select from pajang_teen_private.questions where id=p_question)
      or p_limit is null or p_limit not between 1 and 30 then
    raise exception '질문을 다시 선택해 주세요.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',d.id,'questionId',d.question_id,'authorId',d.owner_id,'authorName','파장 회원',
      'body',d.body,'updatedAt',d.updated_at,
      'liked',exists(select from pajang_teen_private.likes l
        where l.draft_id=d.id and l.owner_id=viewer),
      'likeCount',(select count(*) from pajang_teen_private.likes l where l.draft_id=d.id),
      'commentCount',(select count(*) from pajang_teen_private.comments c
        join ojjuda_account_internal.member_identity ci on ci.user_id=c.author_id
        where c.draft_id=d.id and c.review_status='approved'
        and extract(year from age((now() at time zone 'Asia/Seoul')::date,ci.birth_date)) between 14 and 18
        and not exists(select from pajang_teen_private.blocks b
          where (b.owner_id=viewer and b.target_user_id=c.author_id)
             or (b.owner_id=c.author_id and b.target_user_id=viewer)))
    ) order by d.updated_at desc,d.id),'[]'::jsonb) into published
  from (
    select x.id,x.question_id,x.owner_id,x.body,x.updated_at
    from pajang_teen_private.drafts x
    join ojjuda_account_internal.member_identity i on i.user_id=x.owner_id
    where x.question_id=p_question and x.review_status='approved'
      and extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date)) between 14 and 18
      and not exists(select from pajang_teen_private.blocks b
        where (b.owner_id=viewer and b.target_user_id=x.owner_id)
           or (b.owner_id=x.owner_id and b.target_user_id=viewer))
    order by x.updated_at desc,x.id
    limit p_limit
  ) d;
  return jsonb_build_object('questionId',p_question,'items',published,'visibility','teen-only');
end;
$feed$;
revoke all on function public.pajang_teen_feed(text,integer) from public,anon,authenticated,service_role;
grant execute on function public.pajang_teen_feed(text,integer) to authenticated;

create function public.pajang_teen_interact(p_action text,p_target uuid,p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $interact$
declare
  viewer uuid:=ojjuda_restaurants_internal.require_member();
  target_author uuid;
  reply jsonb;
  reply_id uuid;
  message text;
  reason text;
  affected integer;
begin
  if public.pajang_age_group() is distinct from 'teen' then
    raise exception '청소년 전용 기능입니다.' using errcode='42501';
  end if;
  if p_target is null or jsonb_typeof(p_data) is distinct from 'object' then
    raise exception '요청을 다시 확인해 주세요.' using errcode='22023';
  end if;
  if p_action='report-comment' then
    if p_data - array['reason'] <> '{}'::jsonb or jsonb_typeof(p_data->'reason') is distinct from 'string' then
      raise exception '신고 사유를 선택해 주세요.' using errcode='22023';
    end if;
    reason:=p_data->>'reason';
    if reason not in ('bullying','privacy','inappropriate','other') then
      raise exception '신고 사유를 선택해 주세요.' using errcode='22023';
    end if;
    if not exists(
      select from pajang_teen_private.comments c
      join pajang_teen_private.drafts d on d.id=c.draft_id
      join ojjuda_account_internal.member_identity owner_age on owner_age.user_id=d.owner_id
      join ojjuda_account_internal.member_identity commenter_age on commenter_age.user_id=c.author_id
      where c.id=p_target and c.review_status='approved' and d.review_status='approved'
        and c.author_id<>viewer
        and extract(year from age((now() at time zone 'Asia/Seoul')::date,owner_age.birth_date)) between 14 and 18
        and extract(year from age((now() at time zone 'Asia/Seoul')::date,commenter_age.birth_date)) between 14 and 18
        and not exists(select from pajang_teen_private.blocks b
          where (b.owner_id=viewer and b.target_user_id=d.owner_id)
             or (b.owner_id=d.owner_id and b.target_user_id=viewer))
    ) then raise exception '이 댓글은 신고할 수 없어요.' using errcode='42501'; end if;
    insert into pajang_teen_private.comment_reports(reporter_id,comment_id,reason)
      values(viewer,p_target,reason) on conflict(reporter_id,comment_id) do nothing;
    return jsonb_build_object('reported',true);
  end if;
  if p_action not in ('comments','comment','like') then
    raise exception '지원하지 않는 요청입니다.' using errcode='22023';
  end if;
  select d.owner_id into target_author from pajang_teen_private.drafts d
  join ojjuda_account_internal.member_identity i on i.user_id=d.owner_id
  where d.id=p_target and d.review_status='approved'
    and extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date)) between 14 and 18
    and not exists(select from pajang_teen_private.blocks b
      where (b.owner_id=viewer and b.target_user_id=d.owner_id)
         or (b.owner_id=d.owner_id and b.target_user_id=viewer));
  if target_author is null then
    raise exception '이 답변을 이용할 수 없어요.' using errcode='42501';
  end if;
  if p_action='comments' then
    if p_data<>'{}'::jsonb then raise exception '잘못된 요청입니다.' using errcode='22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,'authorId',c.author_id,'authorName','파장 회원',
      'body',c.body,'createdAt',c.created_at,
      'reviewStatus',case when c.review_status='approved' then 'approved' else 'pending' end
    ) order by c.created_at,c.id),'[]'::jsonb) into reply
    from (
      select c.id,c.author_id,c.body,c.created_at,c.review_status
      from pajang_teen_private.comments c
      join ojjuda_account_internal.member_identity i on i.user_id=c.author_id
      where c.draft_id=p_target and (c.review_status='approved'
        or (c.author_id=viewer and c.review_status='pending'))
        and extract(year from age((now() at time zone 'Asia/Seoul')::date,i.birth_date)) between 14 and 18
        and not exists(select from pajang_teen_private.blocks b
          where (b.owner_id=viewer and b.target_user_id=c.author_id)
            or (b.owner_id=c.author_id and b.target_user_id=viewer))
      order by c.created_at desc,c.id desc limit 50
    ) c;
    return jsonb_build_object('items',reply);
  elsif p_action='comment' then
    if p_data - array['body'] <> '{}'::jsonb or jsonb_typeof(p_data->'body') is distinct from 'string' then
      raise exception '댓글을 확인해 주세요.' using errcode='22023';
    end if;
    message:=btrim(p_data->>'body');
    if char_length(replace(message,'❤️❤️','♥')) not between 1 and 200 then
      raise exception '댓글은 1~200자로 작성해 주세요.' using errcode='22023';
    end if;
    if (select count(*) from pajang_teen_private.comments
      where author_id=viewer and created_at>=now()-interval '1 day')>=20 then
      raise exception '하루 댓글 작성 횟수를 초과했어요.' using errcode='42501';
    end if;
    message:=public.mask_banned(message);
    insert into pajang_teen_private.comments(draft_id,author_id,body)
      values(p_target,viewer,message) returning id into reply_id;
    return jsonb_build_object('submitted',true,'status','pending','id',reply_id);
  else
    if p_data - array['liked'] <> '{}'::jsonb or jsonb_typeof(p_data->'liked') is distinct from 'boolean' then
      raise exception '공감 요청을 확인해 주세요.' using errcode='22023';
    end if;
    if p_data->'liked'='true'::jsonb then
      insert into pajang_teen_private.likes(owner_id,draft_id) values(viewer,p_target) on conflict do nothing;
    else
      delete from pajang_teen_private.likes where owner_id=viewer and draft_id=p_target;
    end if;
    return jsonb_build_object('liked',p_data->'liked','likeCount',
      (select count(*) from pajang_teen_private.likes where draft_id=p_target));
  end if;
end;
$interact$;
revoke all on function public.pajang_teen_interact(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.pajang_teen_interact(text,uuid,jsonb) to authenticated;

create function public.admin_pajang_teen_comments(p_action text,p_target uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $admin$
declare
  manager uuid:=auth.uid();
  affected integer;
  status text;
begin
  if manager is null or not coalesce(public.is_admin(),false) then
    raise exception '관리자 권한이 필요합니다.' using errcode='42501';
  end if;
  if p_action='queue' then
    if p_target is not null then raise exception '잘못된 요청입니다.' using errcode='22023'; end if;
    return jsonb_build_object(
      'comments',coalesce((select jsonb_agg(jsonb_build_object(
        'id',c.id,'draftId',c.draft_id,'body',c.body,'createdAt',c.created_at
      ) order by c.created_at desc)
      from (select * from pajang_teen_private.comments
        where review_status='pending' order by created_at asc limit 50)c),'[]'::jsonb),
      'reports',coalesce((select jsonb_agg(jsonb_build_object(
        'id',r.id,'commentId',r.comment_id,'reason',r.reason,'createdAt',r.created_at
      ) order by r.created_at desc)
      from (select * from pajang_teen_private.comment_reports
        where resolved_at is null order by created_at asc limit 50)r),'[]'::jsonb)
    );
  elsif p_action in ('approve','hide') then
    if p_target is null then raise exception '댓글을 확인해 주세요.' using errcode='22023'; end if;
    status:=case when p_action='approve' then 'approved' else 'hidden' end;
    update pajang_teen_private.comments set review_status=status,reviewed_by=manager,reviewed_at=now()
      where id=p_target;
    get diagnostics affected=row_count;
    if affected=0 then raise exception '댓글을 찾지 못했어요.' using errcode='P0002'; end if;
    insert into pajang_teen_private.moderation_events(moderator_id,kind,target_id,action)
      values(manager,'comment',p_target,p_action);
    return jsonb_build_object('updated',true,'status',status);
  elsif p_action='resolve-report' then
    if p_target is null then raise exception '신고를 확인해 주세요.' using errcode='22023'; end if;
    update pajang_teen_private.comment_reports set resolved_by=manager,resolved_at=now()
      where id=p_target and resolved_at is null;
    get diagnostics affected=row_count;
    if affected>0 then
      insert into pajang_teen_private.moderation_events(moderator_id,kind,target_id,action)
        values(manager,'comment_report',p_target,'resolve');
    end if;
    return jsonb_build_object('resolved',affected>0);
  end if;
  raise exception '지원하지 않는 요청입니다.' using errcode='22023';
end;
$admin$;
revoke all on function public.admin_pajang_teen_comments(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_pajang_teen_comments(text,uuid) to authenticated;

comment on function public.pajang_teen_feed(text,integer) is
  '검토 승인된 14~18세 이용자 답변만 같은 연령대에게 조회. 성인·미성년 범위 밖·차단한 계정은 차단.';
comment on function public.pajang_teen_interact(text,uuid,jsonb) is
  '청소년만 공감·댓글·신고 가능. 댓글은 별도 관리자 승인 후 공개.';
