'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema pajang_private; create schema ojjuda_admin_internal;
      create table pajang_private.answers (
        person uuid not null, day date not null, body text not null,
        at bigint, slot text not null, question_prompt text,
        archived boolean not null default false,
        primary key (person,day,slot)
      );
      create table ojjuda_admin_internal.pajang_answer_moderation (
        person uuid, day date, slot text
      );
      create view pajang_private.visible_answers as
        select a.person,a.day,a.body,a.at,a.slot,a.question_prompt,a.archived
        from pajang_private.answers a
        where not exists (
          select 1 from ojjuda_admin_internal.pajang_answer_moderation h
          where h.person=a.person and h.day=a.day and h.slot=a.slot
        );
      create function pajang_private.legacy_prompt(date,text) returns text
        language sql immutable as $$ select 'example'::text $$;
      create function pajang_private.answer_is_visible(
        answer_day date,answer_slot text,shared_beyond_round boolean,
        current_day date,current_slot text
      ) returns boolean language sql immutable parallel safe
        return answer_day between current_day-364 and current_day
        and ((answer_day=current_day and answer_slot=current_slot)
        or (shared_beyond_round and
            (answer_day<current_day or (answer_slot='am' and current_slot='pm'))));
      create function public.pajang_member(p_action text, p_data jsonb)
        returns jsonb language plpgsql security definer set search_path='' as $$
      declare mine record; today date; active_window record;
        val text; stamp bigint; question jsonb;
      begin
        if false then
          insert into pajang_private.answers(person,day,slot,body,at,question_prompt,archived)
          values(mine.id,today,active_window.slot,val,stamp,
            coalesce(question #>> '{q,0}',pajang_private.legacy_prompt(today,active_window.slot)),
            (p_data->'archive') is not distinct from 'true'::jsonb)
          on conflict(person,day,slot) do nothing;
          perform pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,active_window.slot)
            from pajang_private.visible_answers a;
        end if;
        return '{}'::jsonb;
      end $$;
      create function public.pajang_answer_feed(p_cursor jsonb)
        returns integer language plpgsql as $$
      declare today date:=date '2026-11-21'; current_slot text:='pm'; out_count int;
      begin
        select count(*) into out_count from pajang_private.visible_answers a
        where pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,current_slot);
        return out_count;
      end $$;
      create function public.pajang_discovery_feed(
        p_cursor jsonb,p_interest text,p_order text,p_gender text
      ) returns integer language plpgsql as $$
      declare today date:=date '2026-11-21'; current_slot text:='pm'; out_count int;
      begin
        select count(*) into out_count from pajang_private.visible_answers a
        where pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,current_slot);
        return out_count;
      end $$;
      create function pajang_private.read_public_profile_preferences(p_peer uuid)
        returns integer language plpgsql as $$
      declare today date:=date '2026-11-21'; current_slot text:='pm'; out_count int;
      begin
        select count(*) into out_count from pajang_private.visible_answers a
        where pajang_private.answer_is_visible(a.day,a.slot,a.archived,today,current_slot);
        return out_count;
      end $$;
    `);

    const migration = fs.readFileSync(path.join(__dirname,
      '../supabase/migrations/20261121044000_pajang_publication_policy_replay.sql'), 'utf8');
    await db.exec(migration);
    await db.exec(migration); // replay remains idempotent

    const user = '00000000-0000-4000-8000-000000000001';
    await db.query(`insert into pajang_private.answers
      (person,day,slot,body,question_prompt,archived,publication_window_days)
      values ($1,date '2026-10-23','pm','30-day answer','prompt',true,30),
             ($1,date '2025-11-22','am','365-day answer','prompt',true,365)`,[user]);
    const at = async (days, window) => (await db.query(
      `select pajang_private.answer_is_visible(
        date '2026-11-21'-$1::integer,'pm',true,date '2026-11-21','pm',$2::smallint) as visible`,
      [days,window])).rows[0].visible;
    assert.equal(await at(29,30),true);
    assert.equal(await at(30,30),false);
    assert.equal(await at(364,365),true);
    assert.equal(await at(365,365),false);
    assert.equal(await at(364,30),false);

    const policy = (await db.query(`select publication_window_days
      from pajang_private.visible_answers where person=$1 order by day`,[user])).rows;
    assert.deepEqual(policy.map(x=>x.publication_window_days),[365,30]);
    await assert.rejects(() => db.query(`insert into pajang_private.answers
      (person,day,slot,body,archived,publication_window_days)
      values ($1,date '2026-11-21','pm','invalid',false,365)`,[user]), /check/i);

    for (const name of [
      'public.pajang_member(text,jsonb)',
      'public.pajang_answer_feed(jsonb)',
      'public.pajang_discovery_feed(jsonb,text,text,text)',
      'pajang_private.read_public_profile_preferences(uuid)'
    ]) {
      const definition = (await db.query(
        'select pg_get_functiondef($1::regprocedure) as text',[name])).rows[0].text;
      assert.match(definition,/a\.publication_window_days/);
      assert.doesNotMatch(definition,/answer_is_visible\(a\.day,a\.slot,a\.archived,today,(current_slot|active_window\.slot)\)/);
      if(name.startsWith('public.pajang_member')) {
        assert.match(definition,/publicationPolicy/);
        assert.match(definition,/publication_window_days\)/);
      }
    }
    console.log('PASS: Pajang publication policy replays twice, preserves 30/365-day boundaries, rejects invalid windows, and patches four readers');
  } finally {
    await db.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
