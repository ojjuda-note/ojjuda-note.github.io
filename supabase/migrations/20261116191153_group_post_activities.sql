set local lock_timeout = '5s';

-- Activities share the existing post lifecycle, attachments, reporting and calendar date.
alter table ojjuda_groups_internal.entries
  add column activity jsonb,
  add column activity_result jsonb,
  add constraint group_activity_is_post check (activity is null or (kind='post' and length(btrim(title))>0));

create table ojjuda_groups_internal.activity_votes (
  entry_id uuid not null references ojjuda_groups_internal.entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  choice smallint not null check (choice between 0 and 9),
  primary key (entry_id, user_id)
);
create index group_votes_user on ojjuda_groups_internal.activity_votes(user_id);
alter table ojjuda_groups_internal.activity_votes enable row level security;
revoke all on ojjuda_groups_internal.activity_votes from public, anon, authenticated;

create function ojjuda_groups_internal.activity_labels(items jsonb, require_unique boolean)
returns jsonb language plpgsql stable set search_path='' as $$
declare item jsonb; label text; labels jsonb:='[]';
begin
  if jsonb_typeof(items) is distinct from 'array' then raise exception '항목을 입력해 주세요.'; end if;
  if jsonb_array_length(items) not between 2 and 10 then raise exception '항목은 2~10개 입력해 주세요.'; end if;
  for item in select value from jsonb_array_elements(items) loop
    label:=btrim(item #>> '{}');
    if jsonb_typeof(item)<>'string' or length(label) not between 1 and 40 or label ~ '[[:cntrl:]]' then
      raise exception '각 항목은 한 줄에 1~40자로 입력해 주세요.';
    end if;
    if require_unique and labels ? label then raise exception '같은 이름의 항목을 구분해 주세요.'; end if;
    if public.has_banned(label) then raise exception 'banned_word'; end if;
    labels:=labels || jsonb_build_array(label);
  end loop;
  return labels;
end $$;

create function ojjuda_groups_internal.activity_config(input jsonb)
returns jsonb language plpgsql stable returns null on null input set search_path='' as $$
declare kind text:=input->>'kind'; options jsonb; names jsonb;
begin
  if kind is null or kind not in ('poll','ladder','wheel') then raise exception '종류를 확인해 주세요.'; end if;
  options:=ojjuda_groups_internal.activity_labels(input->'options',kind<>'ladder');
  if kind='ladder' then
    names:=ojjuda_groups_internal.activity_labels(input->'names',true);
    if jsonb_array_length(names)<>jsonb_array_length(options) then raise exception '참가자와 결과의 수를 맞춰 주세요.'; end if;
    return jsonb_build_object('kind',kind,'options',options,'names',names);
  end if;
  return jsonb_build_object('kind',kind,'options',options);
end $$;

-- Each insertion position is equally likely. Record the adjacent swaps so the
-- displayed ladder is the actual path from each participant to their outcome.
create function ojjuda_groups_internal.ladder_rungs(n integer)
returns jsonb language plpgsql volatile set search_path='' as $$
declare rungs integer[]:='{}'; i integer; j integer; target integer; pair integer:=floor(random()*(n-1))::integer;
begin
  rungs:=array[pair,pair];
  for i in 1..n-1 loop
    target:=floor(random()*(i+1))::integer;
    j:=i;
    while j>target loop
      rungs:=array_append(rungs,j-1);
      j:=j-1;
    end loop;
  end loop;
  return to_jsonb(rungs);
end $$;

create function ojjuda_groups_internal.activity_action(action text, p jsonb)
returns jsonb language plpgsql volatile set search_path='' as $$
declare eid uuid:=(p->>'id')::uuid; r uuid; config jsonb; result jsonb; n integer;
  picked integer; counts jsonb; mine integer;
begin
  select room_id into r from ojjuda_groups_internal.entries where id=eid;
  if action<>'activity_state' then
    perform 1 from ojjuda_groups_internal.rooms where id=r and not deleting for share;
  end if;
  if not ojjuda_groups_internal.member(r) then raise exception '그룹원만 이용할 수 있어요.' using errcode='42501'; end if;
  if action='activity_state' then
    select activity,activity_result into config,result from ojjuda_groups_internal.entries where id=eid;
  else
    select activity,activity_result into config,result from ojjuda_groups_internal.entries where id=eid for update;
  end if;
  if config is null then raise exception '참여할 게시물을 찾을 수 없어요.'; end if;
  n:=jsonb_array_length(config->'options');
  if config->>'kind'='poll' then
    if action='activity_vote' then
      picked:=(p->>'choice')::integer;
      if picked is null or picked<0 or picked>=n then raise exception '투표할 항목을 골라 주세요.'; end if;
      insert into ojjuda_groups_internal.activity_votes(entry_id,user_id,choice) values(eid,auth.uid(),picked)
      on conflict(entry_id,user_id) do update set choice=excluded.choice;
    elsif action<>'activity_state' then raise exception '투표 항목을 골라 주세요.'; end if;
    select jsonb_agg(coalesce(t.total,0) order by idx), max(t.my_choice)
      into counts,mine from generate_series(0,n-1) idx left join (
        select choice, count(*) total, max(choice) filter(where user_id=auth.uid()) my_choice
        from ojjuda_groups_internal.activity_votes where entry_id=eid group by choice
      ) t on t.choice=idx;
    return jsonb_build_object('counts',counts,'mine',mine);
  end if;
  if action='activity_draw' then
    if result is null then
      result:=case when config->>'kind'='wheel' then jsonb_build_object('winner',floor(random()*n)::integer)
              else jsonb_build_object('rungs',ojjuda_groups_internal.ladder_rungs(n)) end;
      update ojjuda_groups_internal.entries set activity_result=result where id=eid;
    end if;
  elsif action<>'activity_state' then raise exception '추첨 게시물이에요.'; end if;
  return jsonb_build_object('result',result);
end $$;

revoke all on function ojjuda_groups_internal.activity_labels(jsonb,boolean),
  ojjuda_groups_internal.activity_config(jsonb),ojjuda_groups_internal.ladder_rungs(integer),
  ojjuda_groups_internal.activity_action(text,jsonb) from public,anon,authenticated;

-- Extend the existing authenticated RPC while preserving its installed age,
-- moderation, media and optimistic edit checks. Fail if the service changed.
do $patch$
declare src text:=pg_get_functiondef('ojjuda_groups_internal.service(text,jsonb)'::regprocedure); e record;
begin
  for e in select * from (values
    ($a$if p_action='rooms' then$a$,
     $b$if p_action in ('activity_state','activity_vote','activity_draw') then
       return ojjuda_groups_internal.activity_action(p_action,p);
     end if;
     if p_action='rooms' then$b$),
    ($a$k:=coalesce(p->>'kind','post');$a$,
     $b$if old.id is not null and p ? 'activity' and ojjuda_groups_internal.activity_config(p->'activity') is distinct from old.activity then
       raise exception '게시된 참여 항목은 바꿀 수 없어요.';
     end if;
     k:=coalesce(p->>'kind','post');$b$),
    ($a$ends_at,all_day,media)
   values(eid,r,u,k,$a$,
     $b$ends_at,all_day,activity,media)
   values(eid,r,u,k,$b$),
    ($a$coalesce((p->>'all_day')::boolean,false),media)
   on conflict(id)$a$,
     $b$coalesce((p->>'all_day')::boolean,false),coalesce(old.activity,ojjuda_groups_internal.activity_config(p->'activity')),media)
   on conflict(id)$b$),
    ($a$media=excluded.media,updated_at=clock_timestamp()
   returning to_jsonb(entries.*) into v;$a$,
     $b$media=excluded.media,updated_at=clock_timestamp()
   where entries.room_id=r and entries.author_id=u
   returning to_jsonb(entries.*) into v;
   if v is null then raise exception '이미 사용한 게시물 번호예요.'; end if;$b$)
  ) edits(needle,replacement) loop
    if (length(src)-length(replace(src,e.needle,'')))/length(e.needle)<>1 then
      raise exception 'Group activity migration anchor mismatch: %',e.needle;
    end if;
    src:=replace(src,e.needle,e.replacement);
  end loop;
  execute src;
end $patch$;
