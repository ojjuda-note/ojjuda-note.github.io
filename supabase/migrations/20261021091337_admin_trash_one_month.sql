-- One calendar month in Korean time. Deleted content stays private and cannot
-- reappear in normal feeds. Existing earlier expiry dates are never extended.
create schema ojjuda_trash_internal;
revoke all on schema ojjuda_trash_internal from public,anon,authenticated;
grant usage on schema ojjuda_trash_internal to authenticated;

create function ojjuda_trash_internal.month_after(p_at timestamptz)
returns timestamptz language sql immutable strict set search_path=pg_catalog as $$
  select ((p_at at time zone 'Asia/Seoul') + interval '1 month') at time zone 'Asia/Seoul';
$$;
revoke all on function ojjuda_trash_internal.month_after(timestamptz) from public,anon,authenticated;

create table ojjuda_trash_internal.items (
  id uuid primary key default gen_random_uuid(),
  category text not null check(category in ('cards','messages','other')),
  source_table text not null,
  source_id text not null,
  title text not null,
  body text not null default '',
  detail jsonb not null default '{}',
  deleted_at timestamptz not null,
  expires_at timestamptz not null check(expires_at>deleted_at),
  unique(source_table,source_id)
);
alter table ojjuda_trash_internal.items enable row level security;
revoke all on ojjuda_trash_internal.items from public,anon,authenticated;
create index trash_expiry on ojjuda_trash_internal.items(expires_at);
create index trash_category_page on ojjuda_trash_internal.items(category,deleted_at desc,id);

-- Record access without duplicating private message bodies. Audit entries also expire.
create table ojjuda_trash_internal.access_log (
  id bigint generated always as identity primary key,
  admin_id uuid references auth.users(id) on delete set null,
  item_ids text[] not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default ojjuda_trash_internal.month_after(clock_timestamp())
);
alter table ojjuda_trash_internal.access_log enable row level security;
revoke all on ojjuda_trash_internal.access_log from public,anon,authenticated;
revoke all on sequence ojjuda_trash_internal.access_log_id_seq from public,anon,authenticated;
create index trash_access_expiry on ojjuda_trash_internal.access_log(expires_at);

create function ojjuda_trash_internal.capture(p_table text,p_row jsonb,p_reason text default 'deleted')
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_when timestamptz:=clock_timestamp(); v_expiry timestamptz;
  v_category text; v_title text; v_body text; v_detail jsonb; v_author text; v_peer text;
begin
  case p_table
  when 'cards' then
    v_category:='cards'; v_title:=case when p_row->>'parent_id' is null then '삭제한 카드' else '삭제한 답글 카드' end;
    v_when:=coalesce((p_row->>'archived_at')::timestamptz,v_when);
    v_expiry:=(p_row->>'purge_after')::timestamptz;
    select nickname into v_author from public.profiles where id=(p_row->>'author_id')::uuid;
    v_detail:=jsonb_build_object('author_id',p_row->>'author_id','author_name',v_author,
      'parent_id',p_row->>'parent_id','tags',p_row->'tags','created_at',p_row->>'created_at','reason',p_reason);
  when 'friend_messages' then
    v_category:='messages'; v_title:='삭제한 쪽지';
    select nickname into v_author from public.profiles where id=(p_row->>'sender_id')::uuid;
    select nickname into v_peer from public.profiles where id=(p_row->>'recipient_id')::uuid;
    v_detail:=jsonb_build_object('sender_id',p_row->>'sender_id','recipient_id',p_row->>'recipient_id',
      'sender_name',v_author,'recipient_name',v_peer,'created_at',p_row->>'created_at','reason',p_reason);
  when 'inquiries' then
    v_category:='other'; v_title:='삭제한 공원 문의';
    v_detail:=jsonb_build_object('author_id',p_row->>'user_id','reply',p_row->>'reply',
      'created_at',p_row->>'created_at','reason',p_reason);
  when 'feedback' then
    v_category:='other'; v_title:='삭제한 문의·의견';
    v_detail:=jsonb_build_object('author_id',p_row->>'user_id','kind',p_row->>'kind',
      'created_at',p_row->>'created_at','reason',p_reason);
  when 'content_archive' then
    v_category:='other'; v_title:=coalesce(nullif(p_row->>'title',''),'기타 보관 정보');
    v_when:=(p_row->>'archived_at')::timestamptz; v_expiry:=(p_row->>'purge_after')::timestamptz;
    v_detail:=jsonb_build_object('author_name',p_row->>'author_nick','kind',p_row->>'kind',
      'reply',p_row->>'reply','created_at',p_row->>'created_at','reason',p_reason);
  else raise exception 'invalid_trash_source' using errcode='22023';
  end case;
  v_expiry:=least(coalesce(v_expiry,ojjuda_trash_internal.month_after(v_when)),ojjuda_trash_internal.month_after(v_when));
  if v_expiry<=clock_timestamp() then return; end if;
  v_body:=coalesce(p_row->>'body','');
  insert into ojjuda_trash_internal.items(category,source_table,source_id,title,body,detail,deleted_at,expires_at)
    values(v_category,p_table,p_row->>'id',v_title,v_body,v_detail,v_when,v_expiry)
    on conflict(source_table,source_id) do nothing;
end;
$$;
revoke all on function ojjuda_trash_internal.capture(text,jsonb,text) from public,anon,authenticated;

create function ojjuda_trash_internal.capture_deleted()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  perform ojjuda_trash_internal.capture(tg_table_name,to_jsonb(old));
  if tg_table_name='friend_messages' then
    delete from ojjuda_note_internal.world_notification_reads where event_id='world:message:'||old.id;
  end if;
  return old;
end;
$$;
revoke all on function ojjuda_trash_internal.capture_deleted() from public,anon,authenticated;
create trigger trash_deleted_card before delete on ojjuda_note.cards for each row execute function ojjuda_trash_internal.capture_deleted();
create trigger trash_deleted_message before delete on ojjuda_note_internal.friend_messages for each row execute function ojjuda_trash_internal.capture_deleted();
create trigger trash_deleted_inquiry before delete on ojjuda_note_internal.inquiries for each row execute function ojjuda_trash_internal.capture_deleted();
create trigger trash_deleted_feedback before delete on public.feedback for each row execute function ojjuda_trash_internal.capture_deleted();
create trigger trash_deleted_world_archive before delete on ojjuda_world_private.content_archive for each row execute function ojjuda_trash_internal.capture_deleted();

-- Snapshot before auth cascades remove profiles; include replies removed with a
-- withdrawn author's card. No passwords, tokens, coordinates or file URLs copied.
create function ojjuda_trash_internal.capture_withdrawal()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare r record;
begin
  for r in with recursive affected(id) as (
    select id from ojjuda_note.cards where author_id=old.id
    union select c.id from ojjuda_note.cards c join affected a on c.parent_id=a.id
  ) select c.* from ojjuda_note.cards c join affected a on a.id=c.id
  loop perform ojjuda_trash_internal.capture('cards',to_jsonb(r),'account_withdrawal'); end loop;
  for r in select * from ojjuda_note_internal.friend_messages where sender_id=old.id or recipient_id=old.id
  loop perform ojjuda_trash_internal.capture('friend_messages',to_jsonb(r),'account_withdrawal'); end loop;
  for r in select * from ojjuda_note_internal.inquiries where user_id=old.id
  loop perform ojjuda_trash_internal.capture('inquiries',to_jsonb(r),'account_withdrawal'); end loop;
  return old;
end;
$$;
revoke all on function ojjuda_trash_internal.capture_withdrawal() from public,anon,authenticated;
create trigger trash_before_account_withdrawal before delete on auth.users for each row execute function ojjuda_trash_internal.capture_withdrawal();

-- Normalize new archives using the same month boundary, without resetting older ones.
create function ojjuda_trash_internal.set_archive_expiry()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.archived_at is not null then
    if tg_op='INSERT' then
      new.purge_after:=ojjuda_trash_internal.month_after(new.archived_at);
    elsif old.archived_at is null then
      new.purge_after:=ojjuda_trash_internal.month_after(new.archived_at);
    else
      new.purge_after:=least(new.purge_after,ojjuda_trash_internal.month_after(new.archived_at));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function ojjuda_trash_internal.set_archive_expiry() from public,anon,authenticated;
create trigger trash_card_expiry before insert or update of archived_at,purge_after on ojjuda_note.cards for each row execute function ojjuda_trash_internal.set_archive_expiry();
create trigger trash_world_expiry before insert or update of archived_at,purge_after on ojjuda_world_private.content_archive for each row execute function ojjuda_trash_internal.set_archive_expiry();
update ojjuda_note.cards set purge_after=ojjuda_trash_internal.month_after(archived_at)
  where archived_at is not null and purge_after>ojjuda_trash_internal.month_after(archived_at);
update ojjuda_world_private.content_archive set purge_after=ojjuda_trash_internal.month_after(archived_at)
  where purge_after>ojjuda_trash_internal.month_after(archived_at);

create function ojjuda_trash_internal.admin_delete_message(p_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare n integer;
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'admin_required' using errcode='42501'; end if;
  delete from ojjuda_note_internal.friend_messages where id=p_id;
  get diagnostics n=row_count;
  return jsonb_build_object('ok',true,'deleted',n);
end;
$$;
create function public.admin_trash_friend_message(p_id uuid)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
  select ojjuda_trash_internal.admin_delete_message(p_id);
$$;
revoke all on function ojjuda_trash_internal.admin_delete_message(uuid),public.admin_trash_friend_message(uuid) from public,anon,authenticated;
grant execute on function ojjuda_trash_internal.admin_delete_message(uuid),public.admin_trash_friend_message(uuid) to authenticated;

create function ojjuda_trash_internal.admin_list(p_category text default 'all',p_query text default '',p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_result jsonb; v_query text:=lower(btrim(coalesce(p_query,''))); v_ids text[];
begin
  if auth.uid() is null or not coalesce(public.is_admin(),false) then raise exception 'admin_required' using errcode='42501'; end if;
  if p_category is null or p_category not in ('all','accounts','cards','messages','other') or p_offset is null or p_offset not between 0 and 100000 or p_limit is null or p_limit not between 1 and 50 or length(v_query)>100 then
    raise exception 'invalid_trash_page' using errcode='22023';
  end if;
  with retained as materialized (
    select 'saved:'||i.id as id,i.category,i.title,i.body,i.detail,i.deleted_at,i.expires_at,false as restorable,null::uuid as card_id from ojjuda_trash_internal.items i where i.expires_at>statement_timestamp()
    union all
    select 'account:'||w.user_id,'accounts',coalesce(w.nickname,'탈퇴 계정'),
      case when strpos(coalesce(w.email,''),'@')>1 then left(w.email,1)||'***@'||split_part(w.email,'@',2) else '***' end,
      jsonb_build_object('created_at',w.account_created_at),w.withdrawn_at,w.expires_at,false,null::uuid
      from ojjuda_account_internal.withdrawn_member_accounts w where w.expires_at>statement_timestamp()
    union all
    select 'card:'||c.id,'cards',case when c.parent_id is null then '삭제한 카드' else '삭제한 답글 카드' end,c.body,
      jsonb_build_object('author_id',c.author_id,'author_name',p.nickname,'created_at',c.created_at,'parent_id',c.parent_id,'reason',c.archive_reason),
      c.archived_at,c.purge_after,c.archive_group_id=c.id,c.id
      from ojjuda_note.cards c left join public.profiles p on p.id=c.author_id where c.archived_at is not null and c.purge_after>statement_timestamp()
    union all
    select 'world:'||a.id,'other',coalesce(nullif(a.title,''),'기타 보관 정보'),a.body,
      jsonb_build_object('author_name',a.author_nick,'reply',a.reply,'kind',a.kind,'created_at',a.created_at),a.archived_at,a.purge_after,false,null::uuid
      from ojjuda_world_private.content_archive a where a.purge_after>statement_timestamp()
    union all
    select 'chat:'||c.id,'other','보관된 대화',c.body,jsonb_build_object('author_name',c.author_nick,'created_at',c.created_at),
      c.created_at+interval '1 day',c.created_at+interval '30 days',false,null::uuid
      from public.place_messages c where c.created_at<=statement_timestamp()-interval '1 day' and c.created_at>statement_timestamp()-interval '30 days'
  ), matched as materialized (
    select * from retained where v_query='' or strpos(lower(title||' '||body||' '||detail::text),v_query)>0
  ), filtered as materialized (select * from matched where p_category='all' or category=p_category),
  page as materialized (select * from filtered order by deleted_at desc,id offset p_offset limit p_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by p.deleted_at desc,p.id) from page p),'[]'::jsonb),
    'total',(select count(*) from filtered),'counts',coalesce((select jsonb_object_agg(category,n) from (select category,count(*) as n from matched group by category) c),'{}'::jsonb)) into v_result;
  select array_agg(x->>'id') into v_ids from jsonb_array_elements(v_result->'items') x;
  if coalesce(cardinality(v_ids),0)>0 then insert into ojjuda_trash_internal.access_log(admin_id,item_ids) values(auth.uid(),v_ids); end if;
  return v_result;
end;
$$;
create function public.admin_trash_items(p_category text default 'all',p_query text default '',p_offset integer default 0,p_limit integer default 20)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
  select ojjuda_trash_internal.admin_list(p_category,p_query,p_offset,p_limit);
$$;
revoke all on function ojjuda_trash_internal.admin_list(text,text,integer,integer),public.admin_trash_items(text,text,integer,integer) from public,anon,authenticated;
grant execute on function ojjuda_trash_internal.admin_list(text,text,integer,integer),public.admin_trash_items(text,text,integer,integer) to authenticated;

create function ojjuda_trash_internal.purge_expired()
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  delete from ojjuda_trash_internal.items where id in (select id from ojjuda_trash_internal.items where expires_at<=clock_timestamp() order by expires_at limit 5000 for update skip locked);
  delete from ojjuda_trash_internal.access_log where id in (select id from ojjuda_trash_internal.access_log where expires_at<=clock_timestamp() order by expires_at limit 5000 for update skip locked);
end;
$$;
revoke all on function ojjuda_trash_internal.purge_expired() from public,anon,authenticated;
select cron.schedule('ojjuda_trash_one_month','*/5 * * * *','select ojjuda_trash_internal.purge_expired()');
select cron.schedule('ojjuda_note_retention_purge','*/5 * * * *','select ojjuda_note_internal.run_retention_purge()');
select cron.schedule('ojjuda_world_admin_archive_30d','*/5 * * * *','delete from ojjuda_world_private.content_archive where purge_after <= now()');
notify pgrst,'reload schema';
