const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const migrations = path.join(__dirname, '../supabase/migrations');
const migration = suffix => fs.readFileSync(path.join(migrations, fs.readdirSync(migrations).find(n => n.endsWith(suffix))), 'utf8');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

async function fixture({ apply = true } = {}) {
  const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;create schema ojjuda_account_deletion;create schema ojjuda_restaurants_internal;
create table auth.users(id uuid primary key,is_anonymous boolean default false,deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
create table public.profiles(id uuid primary key references auth.users(id),nickname text,created_at timestamptz not null default now());
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function public.is_banned(uuid) returns boolean language sql stable as $$select false$$;
create function ojjuda_account_deletion.pending() returns boolean language sql stable as $$select coalesce(current_setting('test.pending',true),'')='yes'$$;
create function ojjuda_account_deletion.check_owner(uuid) returns uuid language sql as $$select auth.uid()$$;
create function ojjuda_restaurants_internal.photo_path_valid(text) returns boolean language sql immutable as $$select false$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb);
alter table storage.objects enable row level security;
create function storage.allow_any_operation(text[]) returns boolean language sql stable as $$select coalesce(current_setting('storage.operation',true),'')=any($1)$$;
grant usage on schema auth,storage to anon,authenticated;grant select,insert,update,delete on storage.objects to anon,authenticated;
create policy broad_legacy on storage.objects for all to anon,authenticated using(true) with check(true);`);

await db.exec(`create schema ojjuda_note;create schema ojjuda_note_internal;
create table public.user_private(user_id uuid primary key,banned_until timestamptz);
create table public.friendships(id text primary key,requester uuid,addressee uuid,status text,created_at timestamptz default now(),accepted_at timestamptz);
create table public.blocks(blocker uuid,blocked uuid);create table ojjuda_note_internal.blocks(blocker_id uuid,blocked_id uuid);
create table public.guestbook(id text,owner_id uuid,author_id uuid,hidden boolean,is_read boolean,created_at timestamptz);
create table public.media(id text,user_id uuid);create table public.media_comments(id text,media_id text,author_id uuid,created_at timestamptz);
create function public.is_admin() returns boolean language sql stable as $$select coalesce(current_setting('test.admin',true),'')='yes'$$;
create function public.blocked_between(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.blocks where (blocker=a and blocked=b) or (blocker=b and blocked=a))$$;
create function ojjuda_note_internal.visible_notifications() returns table(id uuid,kind text,card_id uuid,inquiry_id uuid,created_at timestamptz,read_at timestamptz) language sql as $$select null::uuid,null::text,null::uuid,null::uuid,null::timestamptz,null::timestamptz where false$$;
create function ojjuda_note_internal.mark_notifications_read(uuid[],timestamptz,timestamptz) returns integer language sql as $$select 0$$;
create function ojjuda_note.list_retention_alerts() returns table(id uuid,card_id uuid,created_at timestamptz,archive_due_at timestamptz,read_at timestamptz) language sql as $$select null::uuid,null::uuid,null::timestamptz,null::timestamptz,null::timestamptz where false$$;
grant usage on schema ojjuda_note to authenticated;`);

  await db.exec(`
    create schema ojjuda_account_internal;
    create table ojjuda_account_internal.member_identity(user_id uuid primary key references auth.users(id),birth_date date not null,source text not null default 'self_reported');
    alter table ojjuda_account_internal.member_identity enable row level security;
    revoke all on schema ojjuda_account_internal from public,anon,authenticated;
    grant usage on schema ojjuda_account_internal to authenticated;
    revoke all on ojjuda_account_internal.member_identity from public,anon,authenticated;
    create function ojjuda_account_internal.age_on(p_birth date,p_today date) returns integer
      language sql immutable strict set search_path=pg_catalog as $$
      select extract(year from p_today)::integer-extract(year from p_birth)::integer
        -case when to_char(p_today,'MMDD')<to_char(p_birth,'MMDD') then 1 else 0 end;
    $$;
    create function public.check_banned_cols() returns trigger language plpgsql as $$begin return new;end$$;
  `);
  for (const suffix of ['_shared_app_notifications.sql', '_friend_messages.sql', '_notification_summary_and_retired_reads.sql',
    '_private_group_board.sql', '_group_member_invitations.sql', '_group_reliability_performance.sql',
    '_group_recent_member_invitations.sql', '_group_member_invite_sharing.sql', '_group_admin_moderation.sql',
    '_group_media_previews.sql', '_group_legacy_photo_backfill_access.sql']) await db.exec(migration(suffix));
  const val = async (q, p = []) => (await db.query(q, p)).rows[0]?.value;
  const as = n => db.exec(`reset role;set role ${n ? 'authenticated' : 'anon'};select set_config('request.jwt.claim.sub','${n ? uid(n) : ''}',false);`);
  const board = (action,p={}) => val('select public.group_board($1,$2::jsonb) value',[action,JSON.stringify(p)]);
  const invite = (action,p={}) => val('select public.group_invitation($1,$2::jsonb) value',[action,JSON.stringify(p)]);
  const changeAge = async (n, age, days = 0) => {
    await db.exec('reset role');
    await db.query(`insert into ojjuda_account_internal.member_identity(user_id,birth_date)
      values($1,((now() at time zone 'Asia/Seoul')::date-make_interval(years=>$2::int)+make_interval(days=>$3::int))::date)
      on conflict(user_id) do update set birth_date=excluded.birth_date`,[uid(n),age,days]);
  };
  const ages = {1:27,2:17,3:35,5:19,6:18,7:20,8:29,9:30,11:13,12:14,13:150,14:151};
  for (let n = 1; n <= 14; n++) {
    await db.query('insert into auth.users(id,is_anonymous) values($1,$2)',[uid(n),n===10]);
    await db.query('insert into public.profiles(id,nickname) values($1,$2)',[uid(n),'회원'+n]);
    if (ages[n] !== undefined) await changeAge(n,ages[n]);
  }
  if (apply) await db.exec(migration('_group_age_policy.sql'));
  return {db,val,as,board,invite,changeAge};
}

test('age policy: legacy groups, creator validation, idempotence, birthdays and private privileges', async () => {
  const f = await fixture({apply:false}); const {db,val,as,board}=f;
  try {
    await as(1);
    const legacy=(await board('create_room',{name:'기존 그룹'})).id;
    await board('save',{id:uid(101),room_id:legacy,kind:'post',body:'기존 기록',media:[]});
    await db.exec('reset role'); await db.exec(migration('_group_age_policy.sql'));
    await as(1);
    assert.equal((await board('rooms'))[0].age_policy,'all');
    assert.equal((await board('rooms'))[0].age_allowed,true);
    assert.equal((await board('feed',{room_id:legacy}))[0].body,'기존 기록');
    const adult=(await board('create_room',{name:'어른 모임',age_policy:'adult'})).id;
    const range=(await board('create_room',{id:uid(110),name:'20대',age_policy:'range',min_age:20,max_age:29})).id;
    assert.equal((await board('create_room',{id:uid(110),name:'20대',age_policy:'range',min_age:20,max_age:29})).id,range);
    await assert.rejects(board('create_room',{id:uid(110),name:'다른 범위',age_policy:'range',min_age:20,max_age:39}),/다른 연령 조건/);
    await board('rename',{room_id:range,name:'20대 친구들',description:'변경',age_policy:'all',min_age:null,max_age:null});
    let room=(await board('rooms')).find(x=>x.id===range);
    assert.deepEqual([room.age_policy,room.min_age,room.max_age],['range',20,29]);
    assert.equal(room.age_allowed,true);
    for(const p of [
      {age_policy:'nope'},{age_policy:'range'}, {age_policy:'range',min_age:30,max_age:20},
      {age_policy:'range',min_age:13,max_age:29},{age_policy:'range',min_age:20,max_age:151},
      {age_policy:'range',min_age:20.5,max_age:29},{age_policy:'range',min_age:[20],max_age:29},
      {age_policy:'range',min_age:null,max_age:29},{age_policy:'range',min_age:'1e1',max_age:29},
      {age_policy:'all',min_age:20,max_age:29},{age_policy:'adult',min_age:19,max_age:150}
    ]) await assert.rejects(board('create_room',{name:'잘못된 범위',...p}),e=>e.code==='22023');
    await assert.rejects(board('create_room',{name:'청소년 모임',age_policy:'minor'}),/14~18세/);
    await as(2);await assert.rejects(board('create_room',{name:'어른 모임',age_policy:'adult'}),/19세 이상/);
    await assert.rejects(board('create_room',{name:'20대',age_policy:'range',min_age:20,max_age:29}),/20~29세/);
    assert.ok((await board('create_room',{name:'청소년',age_policy:'minor'})).id);
    await as(4);
    assert.ok((await board('create_room',{name:'정보 미등록도 전체',age_policy:'all'})).id);
    for(const p of [{age_policy:'adult'},{age_policy:'minor'},{age_policy:'range',min_age:14,max_age:150}])
      await assert.rejects(board('create_room',{name:'연령 정보 필요',...p}),/연령 정보/);
    const directory=await board('directory');
    assert.equal(directory.find(x=>x.id===adult).age_allowed,false);
    assert.match(directory.find(x=>x.id===adult).age_message,/연령 정보/);
    assert.ok(!JSON.stringify(directory).includes('birth_date'));
    await as(12);assert.ok((await board('create_room',{name:'최소 연령',age_policy:'minor'})).id);
    await as(11);await assert.rejects(board('create_room',{name:'미달',age_policy:'minor'}),/14~18세/);
    await as(5);assert.ok((await board('create_room',{name:'19세 생일',age_policy:'adult'})).id);
    await f.changeAge(5,19,1); await as(5);
    await assert.rejects(board('create_room',{name:'생일 전날',age_policy:'adult'}),/19세 이상/);
    await db.exec('reset role');
    for(const [birth,day,expected] of [['2007-11-11','2026-11-10',18],['2007-11-11','2026-11-11',19],['2008-02-29','2026-02-28',17],['2008-02-29','2026-03-01',18]])
      assert.equal(await val('select ojjuda_account_internal.age_on($1::date,$2::date) value',[birth,day]),expected);
    await db.exec("set time zone 'Pacific/Honolulu'");
    assert.equal(await val('select ojjuda_groups_internal.registered_age($1) value',[uid(1)]),27,'server session zone does not change Korean birthday rules');
    for(const signature of ['registered_age(uuid)','age_matches(text,integer,integer,integer)','age_message(text,integer,integer,integer)','age_details(ojjuda_groups_internal.rooms,integer)','require_room_age(uuid,uuid)','guard_member_age()','member(uuid)'])
      for(const role of ['anon','authenticated']) assert.equal(await val('select has_function_privilege($1,$2,\'execute\') value',[role,'ojjuda_groups_internal.'+signature]),false,signature+' is private');
    assert.equal(await val("select prosecdef value from pg_proc where oid='ojjuda_groups_internal.registered_age(uuid)'::regprocedure"),false);
    await as(1);await assert.rejects(val('select ojjuda_groups_internal.registered_age($1) value',[uid(2)]),e=>e.code==='42501');
    await assert.rejects(db.query('select * from ojjuda_account_internal.member_identity'));
    await assert.rejects(db.query('select * from ojjuda_groups_internal.rooms'));
    await db.exec("begin read only");
    try {assert.ok((await val("select public.group_home('') value")).rooms.length);}finally{await db.exec('rollback');}
    await as(0);await assert.rejects(board('rooms'));await assert.rejects(f.invite('received'));
    await as(10);await assert.rejects(board('rooms'));await assert.rejects(f.invite('received'));
  } finally {await db.close();}
});

test('age policy: approval, invitation, shared-link and internal-RPC paths cannot bypass the rule', async () => {
  const f=await fixture();const {db,val,as,board,invite,changeAge}=f;
  try {
    await as(1);
    const adult=(await board('create_room',{name:'성인',age_policy:'adult'})).id;
    const legacy=(await board('invite',{room_id:adult})).code;
    const link=(await invite('link',{room_id:adult})).code;
    const ranged=(await board('create_room',{name:'20대',age_policy:'range',min_age:20,max_age:29})).id;
    const rangeLink=(await invite('link',{room_id:ranged})).code;
    for(const n of [2,4,6,11]) {
      await as(n);
      assert.equal((await invite('preview_link',{code:link})).age_allowed,false);
      await assert.rejects(board('request',{room_id:adult}),e=>e.code==='42501');
      await assert.rejects(board('join',{code:legacy}),e=>e.code==='42501');
      await assert.rejects(invite('accept_link',{code:link}),e=>e.code==='42501');
      await assert.rejects(val("select ojjuda_groups_internal.service('request',$1::jsonb) value",[JSON.stringify({room_id:adult})]),e=>e.code==='42501');
      await assert.rejects(val("select ojjuda_groups_internal.invitation_service('accept_link',$1::jsonb) value",[JSON.stringify({code:link})]),e=>e.code==='42501');
    }
    await as(1);
    for(const n of [2,4,6])await assert.rejects(invite('send',{room_id:adult,user_id:uid(n)}),e=>e.code==='42501');
    const matches=await invite('search',{room_id:adult,query:''});
    assert.ok(matches.some(x=>x.user_id===uid(5)));
    assert.ok(!matches.some(x=>[uid(2),uid(4),uid(6)].includes(x.user_id)));
    const incoming=(await invite('send',{room_id:adult,user_id:uid(5)})).id;
    await as(5);
    const received=(await invite('received')).find(x=>x.id===incoming);
    assert.deepEqual([received.age_policy,received.age_allowed],['adult',true]);
    assert.equal((await invite('accept',{id:incoming})).joined,true);
    assert.equal((await invite('accept',{id:incoming})).joined,true);
    await changeAge(5,18);await as(5);
    await assert.rejects(invite('accept',{id:incoming}),/19세 이상/,'accepted idempotence does not bypass current eligibility');
    await assert.rejects(invite('accept_link',{code:link}),/19세 이상/);
    await assert.rejects(invite('link',{room_id:adult}),/19세 이상/);
    assert.equal((await invite('preview_link',{code:link})).age_allowed,false);
    await db.exec('reset role');
    await db.query('update auth.users set raw_user_meta_data=$1::jsonb where id=$2',
      [JSON.stringify({age:35,adult:true,birth_date:'1991-01-01'}),uid(5)]);
    await as(5);await assert.rejects(invite('accept_link',{code:link}),/19세 이상/,'client metadata never supplies authorization age');
    await as(1);await assert.rejects(board('transfer',{room_id:adult,user_id:uid(5)}),/19세 이상/);
    for(const n of [7,8]) {await as(n);assert.equal((await invite('preview_link',{code:rangeLink})).age_allowed,true);await invite('accept_link',{code:rangeLink});}
    await as(9);assert.equal((await invite('preview_link',{code:rangeLink})).age_allowed,false);await assert.rejects(invite('accept_link',{code:rangeLink}),/20~29세/);
    await as(2);const minor=(await board('create_room',{name:'청소년',age_policy:'minor'})).id;
    await as(6);await board('request',{room_id:minor});
    await changeAge(6,19);await as(2);
    await assert.rejects(board('approve',{room_id:minor,user_id:uid(6)}),/14~18세/);
    assert.ok((await board('requests',{room_id:minor})).some(x=>x.user_id===uid(6)),'failed approval rolls back request removal');
    await as(6);await board('cancel_request',{room_id:minor});
    await changeAge(6,18);await as(2);const toDecline=(await invite('send',{room_id:minor,user_id:uid(6)})).id;
    await changeAge(6,19);await as(6);
    assert.equal((await invite('received'))[0].age_allowed,false);
    await assert.rejects(invite('accept',{id:toDecline}),/14~18세/);
    assert.equal((await invite('decline',{id:toDecline})).joined,false,'decline is still available after a birthday');
    await db.exec('reset role');
    await assert.rejects(db.query('insert into ojjuda_groups_internal.members(room_id,user_id) values($1,$2)',[minor,uid(6)]),/14~18세/);
    await assert.rejects(db.query('insert into ojjuda_groups_internal.requests(room_id,user_id) values($1,$2)',[minor,uid(6)]),/14~18세/);
  } finally {await db.close();}
});

test('age policy: birthdays revoke content and original/preview storage but preserve leave and owner cleanup', async () => {
  const f=await fixture();const {db,val,as,board,invite,changeAge}=f;
  try {
    await as(2);const room=(await board('create_room',{name:'청소년의 기록',age_policy:'minor'})).id;
    const link=(await invite('link',{room_id:room})).code;
    const postId=uid(200),commentId=uid(201);
    const photo=`${uid(2)}/${room}/${postId}/${uid(202)}.jpg`,preview=photo.replace(/\.jpg$/,'.thumb.webp');
    await db.exec("select set_config('storage.operation','object.upload',false)");
    for(const [name,mime] of [[photo,'image/jpeg'],[preview,'image/webp']])
      await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('group-media',$1,$2,$3)",[name,uid(2),JSON.stringify({size:2048,mimetype:mime})]);
    const saved=await board('save',{id:postId,room_id:room,kind:'post',body:'회원 전용 내용',media:[{path:photo,name:'사진.jpg'}]});
    assert.equal(saved.media[0].preview_path,preview);
    await as(6);await invite('accept_link',{code:link});await board('comment',{id:postId,comment_id:commentId,body:'친구의 댓글'});
    const all=(await board('create_room',{name:'전체 그룹'})).id;
    await board('save',{id:uid(210),room_id:all,kind:'post',body:'전체 이용 가능',media:[]});
    await db.exec("select set_config('storage.operation','object.get_authenticated',false)");
    assert.equal(await val("select count(*)::int value from storage.objects where bucket_id='group-media'"),2);
    await changeAge(6,19);await as(6);
    const rooms=await board('rooms');const expired=rooms.find(r=>r.id===room);
    assert.equal(expired.age_allowed,false);assert.match(expired.age_message,/14~18세/);
    for(const action of ['feed','members','requests'])await assert.rejects(board(action,{room_id:room}),e=>e.code==='42501');
    const day=await val("select to_char((now() at time zone 'Asia/Seoul')::date,'YYYY-MM-DD') value");
    await assert.rejects(board('calendar',{room_id:room,month:day}),e=>e.code==='42501');
    await assert.rejects(board('comments',{id:postId}),e=>e.code==='42501');
    await assert.rejects(board('comment',{id:postId,comment_id:uid(211),body:'우회'}),e=>e.code==='42501');
    await assert.rejects(board('delete_comment',{comment_id:commentId}),e=>e.code==='42501');
    await assert.rejects(board('save',{room_id:room,id:uid(212),kind:'post',body:'우회',media:[]}),e=>e.code==='42501');
    await assert.rejects(board('remove',{id:postId}),e=>e.code==='42501');
    assert.deepEqual((await board('feed')).map(x=>x.body),['전체 이용 가능'],'combined feed filters every room');
    assert.equal((await board('calendar',{month:day})).find(x=>x.day===day).count,1,'combined calendar excludes inaccessible rooms');
    await db.exec("select set_config('storage.operation','object.get_authenticated',false)");
    assert.equal(await val("select count(*)::int value from storage.objects where bucket_id='group-media'"),0,'both original and preview reads are blocked');
    await db.exec("select set_config('storage.operation','object.upload',false)");
    await assert.rejects(db.query("insert into storage.objects(bucket_id,name,owner_id) values('group-media',$1,$2)",[`${uid(6)}/${room}/${uid(212)}/${uid(213)}.jpg`,uid(6)]));
    await assert.rejects(invite('link',{room_id:room}),e=>e.code==='42501');
    await assert.rejects(val('select public.group_report($1,$2) value',[postId,'우회 신고']),e=>e.code==='42501');
    assert.equal((await board('leave',{room_id:room})).ok,true);
    assert.ok(!(await board('rooms')).some(x=>x.id===room));
    // Existing moderator-only media review is retained without granting membership.
    await as(3);await db.exec("select set_config('test.admin','yes',false);select set_config('storage.operation','object.get_authenticated',false)");
    assert.equal(await val("select count(*)::int value from storage.objects where bucket_id='group-media'"),2);
    await db.exec("select set_config('test.admin','',false)");
    assert.equal(await val("select count(*)::int value from storage.objects where bucket_id='group-media'"),0);
    await changeAge(2,19);await as(2);
    assert.equal((await board('rooms')).find(x=>x.id===room).age_allowed,false);
    await assert.rejects(board('feed',{room_id:room}),e=>e.code==='42501');
    await assert.rejects(board('leave',{room_id:room}),/방장은/);
    await board('delete_room',{room_id:room});
    assert.deepEqual((await board('deletion_files',{room_id:room})).sort(),[photo,preview].sort());
    await db.exec("select set_config('storage.operation','object.delete_many',false)");
    await db.query("delete from storage.objects where bucket_id='group-media'");
    await board('finish_delete',{room_id:room});
    assert.ok(!(await board('rooms')).some(x=>x.id===room),'aged-out owners can finish deleting without content access');
  } finally {await db.close();}
});
