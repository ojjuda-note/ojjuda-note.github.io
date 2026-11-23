-- Fix Supabase security advisor 0011 for private Pajang helper functions.
-- These helpers use only pg_catalog operators and schema-qualified function
-- references. This migration changes no data, RLS policies or EXECUTE grants.
-- Production migration version: 20261123042617.
alter function pajang_private.answer_is_visible(date,text,boolean,date,text)
  set search_path = '';
alter function pajang_private.answer_is_visible(date,text,boolean,date,text,smallint)
  set search_path = '';
alter function pajang_private.exchange_photo_path_ok(text)
  set search_path = '';
