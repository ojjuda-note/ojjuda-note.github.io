const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const root=path.resolve(__dirname,'..'),admin='10000000-0000-0000-0000-000000000001',writer='10000000-0000-0000-0000-000000000002',closed='10000000-0000-0000-0000-000000000003',other='10000000-0000-0000-0000-000000000004';
const publicFolder='20000000-0000-0000-0000-000000000001',privateFolder='20000000-0000-0000-0000-000000000002';
(async()=>{const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA cron;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE FUNCTION cron.schedule(text,text,text) RETURNS bigint LANGUAGE sql AS $$SELECT 1::bigint$$;
 CREATE TABLE public.profiles(id uuid PRIMARY KEY,nickname text,door_closed boolean NOT NULL DEFAULT false);
 INSERT INTO public.profiles VALUES('${admin}','관리자',false),('${writer}','작성자',false),('${closed}','닫힌방',true),('${other}','다른작성자',false);
 CREATE TABLE public.app_admins(user_id uuid PRIMARY KEY);INSERT INTO public.app_admins VALUES('${admin}');
 CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT EXISTS(SELECT 1 FROM public.app_admins WHERE user_id=auth.uid())$$;
 CREATE FUNCTION public.has_banned(text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT $1 LIKE '%금칙어테스트%'$$;
 CREATE FUNCTION public.risk_pattern() RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT '(죽고[[:space:]]*싶|자해|협박)'$$;
 CREATE TABLE public.admin_log(id bigint GENERATED ALWAYS AS IDENTITY,admin_id uuid,action text,target_user uuid,target text,detail jsonb);
 CREATE FUNCTION public.admin_note(text,uuid,text,jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$INSERT INTO public.admin_log(admin_id,action,target_user,target,detail) VALUES(auth.uid(),$1,$2,$3,$4)$$;
 CREATE TABLE public.media_folders(id uuid PRIMARY KEY,user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,name text,visibility text);
 INSERT INTO public.media_folders VALUES('${publicFolder}','${writer}','공개폴더','all'),('${privateFolder}','${writer}','선택폴더','chosen');
 CREATE TABLE public.house_posts(id text PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,body text NOT NULL CHECK(char_length(btrim(body)) BETWEEN 1 AND 4000),visibility text NOT NULL DEFAULT 'me',folder_id uuid REFERENCES public.media_folders(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),deleted_at timestamptz);
 CREATE TABLE public.media(id text PRIMARY KEY,user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,visibility text DEFAULT 'all',folder_id uuid REFERENCES public.media_folders(id),path text,thumb_path text);
 CREATE TABLE public.media_comments(id text PRIMARY KEY,media_id text NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,author_nick text,body text CHECK(char_length(body) BETWEEN 1 AND 200),created_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE public.place_messages(id bigint PRIMARY KEY,author_id uuid,author_nick text,room text,body text,created_at timestamptz);
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated;
 ALTER TABLE public.house_posts ENABLE ROW LEVEL SECURITY;ALTER TABLE public.media_comments ENABLE ROW LEVEL SECURITY;
 REVOKE ALL ON public.house_posts,public.media_comments,public.media,public.profiles FROM anon,authenticated;
 INSERT INTO public.house_posts(id,user_id,body,visibility,folder_id,deleted_at) VALUES
 ('public','${writer}','공개 원문','all',NULL,NULL),('private','${writer}','비공개 원문','me',NULL,NULL),
 ('folder-public','${writer}','공개 폴더 글','me','${publicFolder}',NULL),('folder-private','${writer}','선택 폴더 글','all','${privateFolder}',NULL),
 ('closed','${closed}','닫힌 방 원문','all',NULL,NULL),('trash','${writer}','휴지통 원문','all',NULL,now()),
 ('risk','${writer}','죽고 싶어요','me',NULL,NULL),('same-id','${writer}','같은 ID 글','all',NULL,NULL);
 INSERT INTO public.media VALUES('public-media','${writer}','all',NULL,'private/file.jpg',NULL),('private-media','${writer}','all','${privateFolder}','private/file2.jpg',NULL),('closed-media','${closed}','all',NULL,'private/file3.jpg',NULL);
 INSERT INTO public.media_comments(id,media_id,author_id,author_nick,body) VALUES
 ('public-comment','public-media','${other}','다른작성자','공개 댓글'),('private-comment','private-media','${other}','다른작성자','비공개 댓글'),
 ('closed-comment','closed-media','${other}','다른작성자','닫힌 방 댓글'),('withdrawn-comment','public-media',NULL,'탈퇴한 사용자','남아 있는 댓글'),('same-id','public-media','${other}','다른작성자','같은 ID 댓글');
 UPDATE public.house_posts SET created_at='2026-10-01T00:00:00Z';UPDATE public.media_comments SET created_at='2026-10-01T00:00:00Z';`);
 await db.exec(fs.readFileSync(path.join(root,'supabase/world_admin_archive_2026_09_28.sql'),'utf8'));
 // Existing archive kinds and rows must survive constraint replacement unchanged.
 for(const kind of ['diary','media','guestbook','intro','chat','media_comment'])await db.query("INSERT INTO ojjuda_world_private.content_archive(kind,source_id,body,created_at,purge_after) VALUES($1,'legacy','legacy body',now(),now()+interval '30 days')",[kind]);
 const migration=fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith('_admin_house_content.sql'));
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8'));
 assert.equal((await db.query('SELECT count(*)::int n FROM ojjuda_world_private.content_archive')).rows[0].n,6);
 await assert.rejects(db.query("INSERT INTO ojjuda_world_private.content_archive(kind,source_id,body,created_at,purge_after) VALUES('unexpected','bad','bad',now(),now()+interval '30 days')"));
 const actor=async(id,role='authenticated')=>db.exec(`SET ROLE ${role};SET request.jwt.claim.sub='${id||''}';`);
 const rpc=async(name,args)=>{const marks=args.map((_,i)=>'$'+(i+1)).join(',');return(await db.query(`SELECT public.${name}(${marks}) result`,args)).rows[0].result;};
 const feed=(kind='all',filter='all',q='',cursor=null,limit=30)=>rpc('admin_house_content_feed',[kind,filter,q,cursor,limit]);
 const edit=(kind,id,body,revision)=>rpc('admin_house_content_edit',[kind,id,body,revision]);
 const remove=(kind,id,revision)=>rpc('admin_house_content_delete',[kind,id,revision]);
 await actor(null,'anon');await assert.rejects(feed());await actor(writer);await assert.rejects(feed(),/not_admin/);await assert.rejects(edit('post','public','불가','0'.repeat(32)),/not_admin/);await actor(null);await assert.rejects(feed(),/not_admin/);
 await actor(admin);await assert.rejects(db.query('SELECT * FROM public.house_posts'));await assert.rejects(db.query('SELECT * FROM ojjuda_house_admin.active_content'));await assert.rejects(db.query('SELECT * FROM ojjuda_world_private.content_archive'));
 const all=await feed();assert.equal(all.items.length,12);assert(!all.items.some(x=>x.id==='trash'));assert(all.items.every(x=>!('path' in x)&&!('full_path' in x)&&!('email' in x)));
 const pub=await feed('post','public');assert.deepEqual(pub.items.map(x=>x.id).sort(),['folder-public','public','same-id']);
 assert((await feed('all','private')).items.some(x=>x.id==='closed'));assert.equal((await feed('all','risk')).items[0].id,'risk');assert.equal((await feed('all','all','공개 원문')).items.length,2);assert.equal((await feed('all','all','%')).items.length,0);
 const paged=[];let cursor=null;do{const page=await feed('all','all','',cursor,3);paged.push(...page.items.map(x=>x.kind+':'+x.id));cursor=page.next_cursor;}while(cursor);
 assert.equal(new Set(paged).size,12);assert.equal(paged.length,12,'same-timestamp and overlapping IDs are not lost or repeated');
 for(const args of [['bad','all'],['all','bad'],['all','all','x'.repeat(101)],['all','all','',{}]])await assert.rejects(feed(...args));
 let row=all.items.find(x=>x.id==='public');let result=await edit('post',row.id,'고친 공개 글',row.revision);assert(result.ok);assert.equal((await edit('post',row.id,'덮어쓰기',row.revision)).reason,'conflict');
 row=(await feed()).items.find(x=>x.id==='public');assert.equal((await feed()).items.find(x=>x.id==='public').author_id,writer);
 await assert.rejects(edit('post',row.id,'x'.repeat(4001),row.revision));await assert.rejects(edit('post',row.id,'금칙어테스트',row.revision));
 assert.equal((await edit('post','trash','다시 노출','0'.repeat(32))).reason,'missing');assert.equal((await remove('post','trash','0'.repeat(32))).reason,'missing');
 let comment=(await feed()).items.find(x=>x.id==='public-comment');await assert.rejects(edit('comment',comment.id,'x'.repeat(201),comment.revision));assert((await edit('comment',comment.id,'고친 댓글',comment.revision)).ok);
 const outcomes={};for(const [kind,id] of [['post','public'],['post','private'],['post','folder-public'],['post','folder-private'],['post','closed'],['comment','public-comment'],['comment','private-comment'],['comment','closed-comment'],['comment','withdrawn-comment']]){
  row=(await feed()).items.find(x=>x.kind===kind&&x.id===id);outcomes[id]=(await remove(kind,id,row.revision)).archived;assert.equal((await remove(kind,id,row.revision)).reason,'missing');
 }
 assert.deepEqual(outcomes,{public:true,private:false,'folder-public':true,'folder-private':false,closed:false,'public-comment':true,'private-comment':false,'closed-comment':false,'withdrawn-comment':false});
 await db.exec('RESET ROLE');
 const archived=(await db.query("SELECT kind,source_id,body,extract(epoch FROM purge_after-archived_at)::int seconds FROM ojjuda_world_private.content_archive WHERE source_id<>'legacy' ORDER BY source_id")).rows;
 assert.deepEqual(archived.map(x=>x.source_id),['folder-public','public','public-comment']);assert(archived.every(x=>x.seconds===30*86400));assert(archived.some(x=>x.kind==='house_post'));
 const logs=(await db.query('SELECT * FROM public.admin_log')).rows;assert.equal(logs.length,11);assert(logs.every(x=>!JSON.stringify(x.detail).includes('원문')&&!('body' in x.detail)&&!('old' in x.detail)));
 assert.equal((await db.query("SELECT count(*)::int n FROM public.house_posts WHERE id IN ('public','private','folder-public','folder-private','closed')")).rows[0].n,0,'moderated records cannot be restored from owner trash');
 assert.equal((await db.query("SELECT count(*)::int n FROM public.house_posts WHERE id='trash' AND deleted_at IS NOT NULL")).rows[0].n,1,'pre-existing owner trash is untouched');
 // Privacy is checked again at commit time, not trusted from the earlier feed.
 await actor(admin);const beforePrivacy=(await feed()).items.find(x=>x.kind==='post'&&x.id==='same-id');await db.exec('RESET ROLE');
 await db.query("UPDATE public.house_posts SET visibility='me' WHERE id='same-id'");await actor(admin);assert.equal((await remove('post','same-id',beforePrivacy.revision)).archived,false);await db.exec('RESET ROLE');
 assert.equal((await db.query("SELECT count(*)::int n FROM ojjuda_world_private.content_archive WHERE source_id='same-id'")).rows[0].n,0,'stale public labels cannot archive newly private content');
 // Deletion, archive creation and audit logging form one transaction.
 await db.query("INSERT INTO public.house_posts(id,user_id,body,visibility) VALUES('rollback',$1,'보존해야 할 글','all')",[other]);
 await db.exec("CREATE FUNCTION public.reject_test_log() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic audit failure';END$$;CREATE TRIGGER reject_test_log BEFORE INSERT ON public.admin_log FOR EACH ROW EXECUTE FUNCTION public.reject_test_log();");
 await actor(admin);const rollback=(await feed()).items.find(x=>x.id==='rollback');await assert.rejects(remove('post','rollback',rollback.revision),/synthetic audit failure/);await db.exec('RESET ROLE');
 assert.equal((await db.query("SELECT count(*)::int n FROM public.house_posts WHERE id='rollback'")).rows[0].n,1);assert.equal((await db.query("SELECT count(*)::int n FROM ojjuda_world_private.content_archive WHERE source_id='rollback'")).rows[0].n,0);await db.exec('DROP TRIGGER reject_test_log ON public.admin_log');
 // A future nullable is_admin implementation must remain fail closed.
 await db.exec("CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$SELECT NULL::boolean$$");await actor(admin);await assert.rejects(feed(),/not_admin/);await assert.rejects(remove('post','rollback',rollback.revision),/not_admin/);await db.exec('RESET ROLE');
 await db.query('DELETE FROM public.profiles WHERE id=$1',[writer]);assert.equal((await db.query("SELECT count(*)::int n FROM ojjuda_world_private.content_archive WHERE source_id<>'legacy'")).rows[0].n,0,'withdrawal cascades archive references');
 assert((await db.query("SELECT prosecdef FROM pg_proc JOIN pg_namespace n ON n.oid=pronamespace WHERE n.nspname='public' AND proname LIKE 'admin_house_content_%'")).rows.every(x=>!x.prosecdef));
 console.log('PASS: admin-only RPCs, private table denial, active-only feed, folder/closed-room privacy, stable cursor, stale edit/delete checks, limits, public-only 30-day archive, unchanged legacy constraint, metadata-only logs and withdrawal cleanup');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
