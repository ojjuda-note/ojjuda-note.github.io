const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261004090241_unify_service_notice.sql'),'utf8');
(async()=>{
 const db=new PGlite(),admin='00000000-0000-4000-8000-000000000001',member='00000000-0000-4000-8000-000000000002';
 await db.exec(`
 CREATE ROLE anon; CREATE ROLE authenticated;
 CREATE SCHEMA auth; CREATE SCHEMA ojjuda_note; CREATE SCHEMA ojjuda_note_internal;
 GRANT USAGE ON SCHEMA auth,ojjuda_note,ojjuda_note_internal TO anon,authenticated;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 CREATE TABLE public.app_config(key text PRIMARY KEY,value jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE ojjuda_note_internal.settings(singleton boolean PRIMARY KEY,notice text,contact_text text,guidelines text,terms text,privacy text,blocked_words text[],updated_at timestamptz,updated_by uuid);
 CREATE TABLE ojjuda_note_internal.user_restrictions(user_id uuid PRIMARY KEY,is_restricted boolean,restricted_until timestamptz,reason text);
 CREATE TABLE ojjuda_note_internal.moderation_actions(id bigserial PRIMARY KEY,moderator_id uuid,action text,reason text,detail jsonb);
 CREATE FUNCTION ojjuda_note_internal.is_note_moderator() RETURNS boolean LANGUAGE sql STABLE AS $$SELECT CASE WHEN current_setting('test.null_admin',true)='true' THEN null ELSE auth.uid()='${admin}' END$$;
 CREATE FUNCTION ojjuda_note_internal.valid_blocked_words(text[]) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$SELECT cardinality($1)<=100$$;
 INSERT INTO ojjuda_note_internal.settings VALUES(true,'기존 공원 공지 원문','연락처','이용 안내','이용 약관','개인정보',ARRAY['차단어'],now(),null);
 INSERT INTO ojjuda_note_internal.user_restrictions VALUES('${member}',true,now()+interval '1 day','제한 사유');
 INSERT INTO public.app_config VALUES('notice','"공통 공지"',now());
 `);
 await db.exec(migration);
 // Existing RPC wrappers and ACLs remain unchanged in production. Reproduce them here.
 await db.exec(`
 CREATE FUNCTION ojjuda_note.get_note_state() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT ojjuda_note_internal.get_note_state()$$;
 CREATE FUNCTION ojjuda_note.admin_settings() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT ojjuda_note_internal.admin_settings()$$;
 CREATE FUNCTION ojjuda_note.admin_patch_service_settings(p_reason text,p_notice text DEFAULT NULL,p_posting_enabled boolean DEFAULT NULL,p_replies_enabled boolean DEFAULT NULL,p_reports_enabled boolean DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT ojjuda_note_internal.admin_patch_service_settings(p_reason,p_notice,p_posting_enabled,p_replies_enabled,p_reports_enabled)$$;
 CREATE FUNCTION ojjuda_note.admin_update_settings(p_notice text,p_posting_enabled boolean,p_replies_enabled boolean,p_reports_enabled boolean,p_reason text DEFAULT '운영설정 수정',p_contact_text text DEFAULT NULL,p_guidelines text DEFAULT NULL,p_terms text DEFAULT NULL,p_privacy text DEFAULT NULL,p_blocked_words text[] DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT ojjuda_note_internal.admin_update_settings(p_notice,p_posting_enabled,p_replies_enabled,p_reports_enabled,p_reason,p_contact_text,p_guidelines,p_terms,p_privacy,p_blocked_words)$$;
 REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ojjuda_note,ojjuda_note_internal FROM PUBLIC,anon,authenticated;
 GRANT EXECUTE ON FUNCTION ojjuda_note.get_note_state(),ojjuda_note_internal.get_note_state() TO anon,authenticated;
 GRANT EXECUTE ON FUNCTION ojjuda_note.admin_settings(),ojjuda_note_internal.admin_settings(),ojjuda_note.admin_patch_service_settings(text,text,boolean,boolean,boolean),ojjuda_note_internal.admin_patch_service_settings(text,text,boolean,boolean,boolean),ojjuda_note.admin_update_settings(text,boolean,boolean,boolean,text,text,text,text,text,text[]),ojjuda_note_internal.admin_update_settings(text,boolean,boolean,boolean,text,text,text,text,text,text[]) TO authenticated;
 `);
 await db.exec(migration); // replacement keeps the installed RPC permissions.
 const value=async(sql,args=[]) => (await db.query(sql,args)).rows[0].value;
 const state=()=>value('SELECT ojjuda_note.get_note_state() AS value');
 const settings=()=>value('SELECT ojjuda_note.admin_settings() AS value');
 const patch=(notice,reason='변경 사유')=>value('SELECT ojjuda_note.admin_patch_service_settings($1,$2,false,false,false) AS value',[reason,notice]);
 const legacy=(notice,contact=null)=>value('SELECT ojjuda_note.admin_update_settings($1,false,false,false,$2,$3) AS value',[notice,'이전 관리자 화면',contact]);
 const setUser=id=>value("SELECT set_config('request.jwt.claim.sub',$1,false) AS value",[id]);
 assert.equal((await state()).notice,'공통 공지','existing World announcement wins over legacy Park text');
 for(const role of ['anon','authenticated']){
  assert.equal(await value(`SELECT has_table_privilege('${role}','public.app_config','INSERT,UPDATE') AS value`),false);
  assert.equal(await value(`SELECT has_function_privilege('${role}','ojjuda_note_internal.service_notice()','EXECUTE') AS value`),false);
 }
 await db.exec('SET ROLE anon');assert.equal((await state()).notice,'공통 공지');await assert.rejects(settings,/permission denied/);await assert.rejects(()=>patch('x'),/permission denied/);
 await db.exec('SET ROLE authenticated');await assert.rejects(settings,/Note moderator required/);await assert.rejects(()=>patch('x'),/Note moderator required/);
 await setUser(member);assert.equal((await state()).restriction_reason,'제한 사유');await assert.rejects(()=>legacy('x'),/Note moderator required/);
 await setUser(admin);assert.equal((await settings()).notice,'공통 공지');
 await value("SELECT set_config('test.null_admin','true',false) AS value");await assert.rejects(settings,/Note moderator required/);await assert.rejects(()=>patch('x'),/Note moderator required/);await assert.rejects(()=>legacy('x'),/Note moderator required/);await value("SELECT set_config('test.null_admin','false',false) AS value");
 await patch('  모든 화면에 표시할 공지  ');assert.equal((await state()).notice,'모든 화면에 표시할 공지');assert.equal((await settings()).notice,'모든 화면에 표시할 공지');assert.equal((await settings()).guidelines,'이용 안내');
 await legacy('옛 관리자 화면에서 저장','변경 연락처');assert.equal((await state()).notice,'옛 관리자 화면에서 저장');assert.equal((await settings()).contact_text,'변경 연락처');assert.equal((await settings()).terms,'이용 약관');assert.equal((await settings()).posting_enabled,true);
 await patch('  ');assert.equal((await state()).notice,'','clearing a shared notice does not resurrect legacy text');
 await patch('가'.repeat(1000));assert.equal((await state()).notice.length,1000);
 for(const notice of [null,'가'.repeat(1001)]){await assert.rejects(()=>patch(notice),/Valid settings/);await assert.rejects(()=>legacy(notice),/Valid settings/)}
 for(const reason of [null,' ','가'.repeat(501)])await assert.rejects(()=>patch('실패',reason),/Valid settings/);
 await db.exec('RESET ROLE');
 assert.equal(await value('SELECT notice AS value FROM ojjuda_note_internal.settings'),'기존 공원 공지 원문','original Park notice stays preserved');
 assert.equal(await value('SELECT count(*) AS value FROM ojjuda_note_internal.moderation_actions'),4,'only successful writes are audited');
 assert.equal(await value("SELECT value #>> '{}' AS value FROM public.app_config WHERE key='notice'"),'가'.repeat(1000));
 // A missing common row is bootstrapped once; an intentionally empty row is preserved.
 await db.exec("UPDATE public.app_config SET value='\"\"' WHERE key='notice'");await db.exec(migration);assert.equal((await state()).notice,'');
 await db.exec("DELETE FROM public.app_config WHERE key='notice'");assert.equal((await state()).notice,'');await db.exec(migration);assert.equal((await state()).notice,'기존 공원 공지 원문');
 // Settings/audit and the common value are one transaction.
 await db.exec("ALTER TABLE ojjuda_note_internal.moderation_actions ADD CONSTRAINT reject_test CHECK(reason<>'거부')");
 await assert.rejects(()=>patch('원자성','거부'),/reject_test/);assert.equal((await state()).notice,'기존 공원 공지 원문');
 await db.close();console.log('PASS: one canonical service notice, legacy text preservation, old/new RPC compatibility, empty/1000-character notices, document preservation, audit/atomicity and anon/member/null-admin denial');
})().catch(e=>{console.error(e);process.exitCode=1});
