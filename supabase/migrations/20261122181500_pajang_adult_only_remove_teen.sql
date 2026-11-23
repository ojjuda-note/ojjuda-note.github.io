-- 2026-11-22: user decision — Pajang is an adult-only (age 19+) service.
-- Permanently retire the never-opened teen question, reply, reporting, and
-- account-erasure service. Keep the shared verified age check and the adult RPCs.
-- Never discard actual member content silently if a concurrent write occurred.
do $safety$
declare
 member_rows bigint;
begin
 if to_regnamespace('pajang_teen_private') is null then return; end if;
 select
   (select count(*) from pajang_teen_private.drafts)
 + (select count(*) from pajang_teen_private.comments)
 + (select count(*) from pajang_teen_private.likes)
 + (select count(*) from pajang_teen_private.blocks)
 + (select count(*) from pajang_teen_private.reports)
 + (select count(*) from pajang_teen_private.comment_reports)
 + (select count(*) from pajang_teen_private.moderation_events)
 into member_rows;
 if member_rows<>0 then
   raise exception 'Youth service unexpectedly contains % member records; preserve them and review before deleting',member_rows;
 end if;
 if exists(select from pajang_teen_private.release_control where enabled) then
   raise exception 'Youth service is not locked; refuse a potentially unsafe teardown';
 end if;
end;
$safety$;

-- Explicitly remove all public youth RPCs, including the retired report-hold
-- draft, if it had ever been applied to a different environment.
drop function if exists public.pajang_teen_draft(text,jsonb);
drop function if exists public.pajang_teen_feed(text,integer);
drop function if exists public.pajang_teen_interact(text,uuid,jsonb);
drop function if exists public.pajang_teen_entry();
drop function if exists public.pajang_teen_erase_own();
drop function if exists public.admin_pajang_teen_moderation(text,uuid,uuid);
drop function if exists public.admin_pajang_teen_comments(text,uuid);
drop function if exists public.admin_pajang_teen_report_hold(text,uuid,boolean);

-- Drops only the isolated youth feature schema: its 20 unused question records,
-- empty tables, checks, indexes, triggers and private helper functions.
-- Adult pajang_private, identity data, adult chat and adult media are untouched.
drop schema if exists pajang_teen_private cascade;
