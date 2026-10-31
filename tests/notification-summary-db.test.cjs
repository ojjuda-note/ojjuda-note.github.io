const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migrations=path.join(__dirname,'../supabase/migrations');
const update=fs.readdirSync(migrations).find(name=>name.endsWith('_notification_summary_and_retired_reads.sql'));
assert.ok(update,'notification summary migration exists');
const read=name=>fs.readFileSync(path.join(migrations,name),'utf8');

(async()=>{
 const db=new PGlite(),A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002',C='00000000-0000-4000-8000-000000000003';
 const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const value=async(sql,args=[])=>((await db.query(sql,args)).rows[0]?.value);
 async function member(user,sql,args=[]){
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
  await db.exec('set role authenticated');
  try{return await value(sql,args);}finally{await db.exec('reset role');}
 }
 try{
  await db.exec(`
   create role anon;create role authenticated;create schema auth;create schema ojjuda_note;create schema ojjuda_note_internal;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,ojjuda_note to authenticated;
   create table auth.users(id uuid primary key);create table public.profiles(id uuid primary key,nickname text);
   create table public.friendships(id text primary key,requester uuid,addressee uuid,status text,created_at timestamptz default now(),accepted_at timestamptz);
   create table public.blocks(blocker uuid,blocked uuid);create table ojjuda_note_internal.blocks(blocker_id uuid,blocked_id uuid);
   create table public.guestbook(id text,owner_id uuid,author_id uuid,hidden boolean,is_read boolean,created_at timestamptz);
   create table public.media(id text,user_id uuid);create table public.media_comments(id text,media_id text,author_id uuid,created_at timestamptz);
   create function public.is_admin() returns boolean language sql stable as $$select false$$;
   create function public.is_banned(uuid) returns boolean language sql stable as $$select false$$;
   create function public.blocked_between(a uuid,b uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.blocks where (blocker=a and blocked=b) or (blocker=b and blocked=a))$$;
   create table ojjuda_note_internal.test_notifications(user_id uuid,id uuid,kind text,card_id uuid,inquiry_id uuid,created_at timestamptz,read_at timestamptz);
   create function ojjuda_note_internal.visible_notifications() returns table(id uuid,kind text,card_id uuid,inquiry_id uuid,created_at timestamptz,read_at timestamptz) language sql stable security definer set search_path='' as $$select id,kind,card_id,inquiry_id,created_at,read_at from ojjuda_note_internal.test_notifications where user_id=auth.uid()$$;
   create function ojjuda_note_internal.mark_notifications_read(uuid[],timestamptz,timestamptz) returns integer language sql as $$select 0$$;
   create table ojjuda_note_internal.test_retention(user_id uuid,id uuid,card_id uuid,kind text,body text,archive_due_at timestamptz,reason text,created_at timestamptz,read_at timestamptz);
   create function ojjuda_note.list_retention_alerts() returns table(id uuid,card_id uuid,kind text,body text,archive_due_at timestamptz,reason text,created_at timestamptz,read_at timestamptz) language sql stable security definer set search_path='' as $$select id,card_id,kind,body,archive_due_at,reason,created_at,read_at from ojjuda_note_internal.test_retention where user_id=auth.uid()$$;
   revoke all on function ojjuda_note.list_retention_alerts() from public,anon;grant execute on function ojjuda_note.list_retention_alerts() to authenticated;
   insert into auth.users values('${A}'),('${B}'),('${C}');insert into public.profiles values('${A}','A'),('${B}','B'),('${C}','C');
   insert into public.friendships(id,requester,addressee,status) values('accepted','${A}','${B}','accepted'),('pending','${C}','${A}','pending');
  `);
  for(const name of ['20260928065241_shared_app_notifications.sql','20261020222420_friend_messages.sql'])await db.exec(read(name));
  await db.exec(`
   insert into ojjuda_note_internal.test_notifications values
    ('${A}','${id(1)}','reply','${id(101)}',null,now(),null),
    ('${A}','${id(2)}','like','${id(101)}',null,now(),now()),
    ('${B}','${id(3)}','like','${id(102)}',null,now(),null);
   insert into ojjuda_note_internal.friend_messages(id,sender_id,recipient_id,body,request_id) values
    ('${id(11)}','${B}','${A}','private A message','${id(21)}'),
    ('${id(12)}','${A}','${B}','private B message','${id(22)}');
   insert into ojjuda_note_internal.test_retention values
    ('${A}','${id(31)}','${id(41)}','root','private retention A',now()+interval '1 day','due',now(),null),
    ('${A}','${id(32)}','${id(42)}','root','already read',now()+interval '1 day','due',now(),now()),
    ('${A}','${id(33)}',null,'root','missing card',now()+interval '1 day','due',now(),null),
    ('${A}','${id(34)}','${id(44)}','root','invalid date','infinity','due',now(),null),
    ('${B}','${id(35)}','${id(45)}','root','private retention B',now()+interval '1 day','due',now(),null);
  `);
  const baseline=new Map();
  for(const user of [A,B,C])baseline.set(user,await member(user,'select public.list_app_notifications() as value'));
  await db.exec(read(update));
  for(const user of [A,B,C]){
   const after=await member(user,'select public.list_app_notifications() as value');
   assert.deepEqual(after.items,baseline.get(user).items,'live inbox metadata and order remain identical');
   assert.equal(after.unread_count,baseline.get(user).unread_count,'existing unread counts are preserved');
   const summary=await member(user,'select public.app_notification_summary() as value');
   assert.deepEqual(summary,{notifications:after.unread_count,retention:user===C?0:1});
   assert.deepEqual(Object.keys(summary).sort(),['notifications','retention'],'no card body, target or identity is returned');
  }
  assert.equal(await value("select has_function_privilege('anon','public.app_notification_summary()','execute') as value"),false);
  assert.equal(await value("select has_function_privilege('authenticated','public.app_notification_summary()','execute') as value"),true);
  const metadata=await value("select jsonb_build_object('definer',prosecdef,'volatility',provolatile,'config',proconfig) as value from pg_proc where oid='public.app_notification_summary()'::regprocedure");
  assert.equal(metadata.definer,false);assert.equal(metadata.volatility,'s');assert.deepEqual(metadata.config,['search_path=""']);
  await assert.rejects(()=>member(null,'select public.app_notification_summary() as value'),/Sign in required/);
  await db.exec('set role anon');
  await assert.rejects(()=>value('select public.app_notification_summary() as value'),/permission denied/);
  await db.exec('reset role');
  for(const table of ['public.blocks','ojjuda_note_internal.blocks']){
   await db.query(`insert into ${table} values($1,$2)`,[A,B]);
   const inbox=await member(A,'select public.list_app_notifications() as value');
   assert.ok(!inbox.items.some(item=>item.id==='world:message:'+id(11)),'blocked message stays excluded');
   assert.equal((await member(A,'select public.app_notification_summary() as value')).notifications,inbox.unread_count);
   await db.exec(`delete from ${table}`);
  }
  await member(A,'select public.mark_app_notifications_read($1::text[],$2::timestamptz,null) as value',[[`world:message:${id(11)}`],baseline.get(A).items.find(x=>x.id===`world:message:${id(11)}`).created_at]);
  assert.equal((await member(A,'select public.app_notification_summary() as value')).notifications,baseline.get(A).unread_count-1,'read markers still affect badges');
  await db.exec('alter table public.guestbook rename to retired_guestbook;alter table public.media rename to retired_media;alter table public.media_comments rename to retired_media_comments;');
  assert.equal((await member(A,'select public.app_notification_summary() as value')).notifications,baseline.get(A).unread_count-1,'badge no longer depends on retired tables');
  await member(A,'select public.list_app_notifications() as value');
  for(const table of ['test_notifications','test_retention','friend_messages'])assert.equal(await value(`select has_table_privilege('authenticated','ojjuda_note_internal.${table}','select') as value`),false,'underlying private tables remain inaccessible');
  console.log('PASS: one scoped summary, unchanged inbox/read markers, account/block isolation, finite retention counts, no bodies, invoker permissions and removed retired-table reads.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
