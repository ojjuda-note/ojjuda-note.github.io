const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require('@electric-sql/pglite');

const ADMIN = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const MEMBER = '44444444-4444-4444-8444-444444444444';
const id = number => '33333333-3333-4333-8333-' + String(number).padStart(12, '0');
const photo = number => `${AUTHOR}/${id(number)}.jpg`;
const video = number => photo(number).replace('.jpg', '.mp4');

test('administrators can inspect retained Park uploads without widening member or Storage access', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage; create schema ojjuda_note; create schema ojjuda_note_internal;
    grant usage on schema auth,storage,ojjuda_note,ojjuda_note_internal to anon,authenticated,service_role;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.app_admins(user_id uuid primary key);
    insert into public.app_admins values('${ADMIN}');
    create function ojjuda_note_internal.is_note_moderator() returns boolean
      language sql stable security definer set search_path='' as
      $$select auth.uid() is not null and exists(select 1 from public.app_admins where user_id=auth.uid())$$;
    create table ojjuda_note.cards(id uuid primary key,author_id uuid,kind text not null,
      parent_id uuid,archived_at timestamptz,purge_after timestamptz);
    create table ojjuda_note_internal.card_moderation(card_id uuid primary key,hidden boolean not null);
    create table ojjuda_note_internal.card_photos(card_id uuid primary key references ojjuda_note.cards(id) on delete cascade,
      author_id uuid not null,photo_path text unique not null);
    create table ojjuda_note_internal.card_video_uploads(photo_path text primary key,video_path text unique not null,
      author_id uuid not null,duration double precision not null,width integer not null,height integer not null);
    create table ojjuda_note_internal.event_ads(card_id uuid primary key references ojjuda_note.cards(id) on delete cascade,
      author_id uuid not null,photo_path text,starts_at timestamptz,ends_at timestamptz);
    create table ojjuda_note_internal.note_photo_tombstones(bucket_id text,photo_path text,
      card_id uuid not null,primary key(bucket_id,photo_path));
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null,
      name text not null,owner_id text not null,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    alter table ojjuda_note.cards enable row level security;
    alter table ojjuda_note_internal.card_photos enable row level security;
    alter table ojjuda_note_internal.card_video_uploads enable row level security;
    alter table ojjuda_note_internal.event_ads enable row level security;
    alter table ojjuda_note_internal.note_photo_tombstones enable row level security;
    grant select,insert,update,delete on storage.objects to authenticated;
    create function storage.allow_any_operation(ops text[]) returns boolean language sql stable as
      $$select coalesce(current_setting('test.storage_operation',true),'')=any(ops)$$;
    create function ojjuda_note_internal.note_photo_tombstoned(b text,p text) returns boolean
      language sql stable security definer set search_path='' as
      $$select exists(select 1 from ojjuda_note_internal.note_photo_tombstones where bucket_id=b and photo_path=p)$$;
    create view ojjuda_note.public_cards as select c.* from ojjuda_note.cards c where c.archived_at is null
      and not exists(select 1 from ojjuda_note_internal.card_moderation m where m.card_id=c.id and m.hidden);
    create function ojjuda_note_internal.card_photo_signable(p_path text) returns boolean
      language sql stable security definer set search_path='' as
      $$select auth.uid() is not null and exists(select 1 from ojjuda_note_internal.card_photos p
        join ojjuda_note.public_cards c on c.id=p.card_id where p.photo_path=p_path and c.kind in ('memo','comment'))$$;
    create function ojjuda_note_internal.card_video_signable(p_path text) returns boolean
      language sql stable security definer set search_path='' as
      $$select exists(select 1 from ojjuda_note_internal.card_video_uploads v where v.video_path=p_path
        and ojjuda_note_internal.card_photo_signable(v.photo_path))$$;
    create function ojjuda_note_internal.event_photo_signable(p_path text) returns boolean
      language sql stable security definer set search_path='' as
      $$select auth.uid() is not null and exists(select 1 from ojjuda_note_internal.event_ads e
        join ojjuda_note.public_cards c on c.id=e.card_id where e.photo_path=p_path and c.kind='event'
          and e.starts_at<=statement_timestamp() and e.ends_at>statement_timestamp())$$;
    create function ojjuda_note.card_media_paths(p_ids uuid[])
      returns table(card_id uuid,photo_path text,video_path text,duration double precision,width integer,height integer)
      language sql stable security definer set search_path='' as
      $$select p.card_id,p.photo_path,v.video_path,v.duration,v.width,v.height from ojjuda_note_internal.card_photos p
        left join ojjuda_note_internal.card_video_uploads v on v.photo_path=p.photo_path
        where p.card_id=any((coalesce(p_ids,'{}'::uuid[]))[1:100])
          and ojjuda_note_internal.card_photo_signable(p.photo_path)$$;
    create policy member_photo_sign on storage.objects for select to authenticated using(bucket_id='note-card-photos'
      and storage.allow_any_operation(array['object.sign','object.sign_many']) and ojjuda_note_internal.card_photo_signable(name));
    create policy member_video_sign on storage.objects for select to authenticated using(bucket_id='note-card-videos'
      and storage.allow_any_operation(array['object.sign','object.sign_many']) and ojjuda_note_internal.card_video_signable(name));
    create policy member_event_sign on storage.objects for select to authenticated using(bucket_id='note-event-photos'
      and storage.allow_any_operation(array['object.sign']) and ojjuda_note_internal.event_photo_signable(name));
    revoke all on all tables in schema ojjuda_note,ojjuda_note_internal from public,anon,authenticated,service_role;
  `);
  const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.value;
  const as = async (user, callback, role = 'authenticated') => {
    await scalar("select set_config('request.jwt.claim.sub',$1,false) as value", [user || '']);
    await db.exec(`set role ${role}`);
    try { return await callback(); } finally { await db.exec('reset role'); }
  };
  const media = (numbers, user = ADMIN, role) => as(user, () => scalar(
    "select coalesce(jsonb_agg(r order by card_id),'[]'::jsonb) as value from ojjuda_note.admin_card_media_paths($1::uuid[]) r",
    [numbers === null ? null : numbers.map(id)]), role);
  const signable = (bucket, file, user = ADMIN) => as(user, () => scalar(
    'select ojjuda_note_internal.admin_card_media_signable($1,$2) as value', [bucket, file]));
  const storage = async (operation, user) => {
    await scalar("select set_config('test.storage_operation',$1,false) as value", [operation]);
    return as(user, () => scalar("select coalesce(jsonb_agg(bucket_id||':'||name order by bucket_id,name),'[]'::jsonb) as value from storage.objects"));
  };
  async function attachment(number, {kind = 'memo', hidden = false, archived = false, expired = false,
    hasVideo = false, tombstonePhoto = false, tombstoneVideo = false} = {}) {
    await db.query(`insert into ojjuda_note.cards(id,author_id,kind,archived_at,purge_after) values($1,$2,$3,
      case when $4 then now()-interval '1 day' end,case when $4 then now()+$5::interval end)`,
    [id(number), AUTHOR, kind, archived, expired ? '-1 second' : '7 days']);
    if (hidden) await db.query('insert into ojjuda_note_internal.card_moderation values($1,true)', [id(number)]);
    const bucket = kind === 'event' ? 'note-event-photos' : 'note-card-photos';
    if (kind === 'event') {
      await db.query(`insert into ojjuda_note_internal.event_ads values($1,$2,$3,now()-interval '2 days',now()-interval '1 day')`,
        [id(number), AUTHOR, photo(number)]);
    } else {
      await db.query('insert into ojjuda_note_internal.card_photos values($1,$2,$3)', [id(number), AUTHOR, photo(number)]);
    }
    await db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)', [bucket, photo(number), AUTHOR]);
    if (hasVideo) {
      await db.query('insert into ojjuda_note_internal.card_video_uploads values($1,$2,$3,12.5,720,480)',
        [photo(number), video(number), AUTHOR]);
      await db.query("insert into storage.objects(bucket_id,name,owner_id) values('note-card-videos',$1,$2)", [video(number), AUTHOR]);
    }
    if (tombstonePhoto) await db.query('insert into ojjuda_note_internal.note_photo_tombstones values($1,$2,$3)', [bucket, photo(number), id(number)]);
    if (tombstoneVideo) await db.query("insert into ojjuda_note_internal.note_photo_tombstones values('note-card-videos',$1,$2)", [video(number), id(number)]);
  }
  await attachment(1);
  await attachment(2, {hidden: true, hasVideo: true});
  await attachment(3, {archived: true, hasVideo: true});
  await attachment(4, {archived: true, expired: true, hasVideo: true});
  await attachment(5, {kind: 'event'});
  await attachment(6, {kind: 'event', archived: true});
  await attachment(7, {kind: 'comment', archived: true});
  await attachment(8, {hidden: true, tombstonePhoto: true});
  await attachment(9, {hidden: true, hasVideo: true, tombstoneVideo: true});
  await attachment(10, {hidden: true, hasVideo: true, tombstonePhoto: true});
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('note-card-photos',$1,$3),('note-card-videos',$2,$3)",
    [photo(11), video(11), AUTHOR]);
  const previousMemberStorage = await storage('object.sign_many', MEMBER);
  const previousMemberMedia = await as(MEMBER, () => scalar(
    "select coalesce(jsonb_agg(r order by card_id),'[]'::jsonb) as value from ojjuda_note.card_media_paths($1::uuid[]) r",
    [Array.from({length: 11}, (_, i) => id(i + 1))]));
  const existingDefinitions = () => scalar(`select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,
      'definition',pg_get_functiondef(p.oid),'acl',p.proacl) order by p.oid::regprocedure::text) as value
    from pg_proc p where p.oid in ('ojjuda_note.card_media_paths(uuid[])'::regprocedure,
      'ojjuda_note_internal.card_photo_signable(text)'::regprocedure,
      'ojjuda_note_internal.card_video_signable(text)'::regprocedure,
      'ojjuda_note_internal.event_photo_signable(text)'::regprocedure)`);
  const previousDefinitions = await existingDefinitions();
  const previousPolicies = await scalar("select jsonb_agg(to_jsonb(p) order by policyname) as value from pg_policies p where schemaname='storage'");
  const directory = path.join(__dirname, '../supabase/migrations');
  const names = fs.readdirSync(directory).filter(name => name.endsWith('_park_admin_media_preview.sql'));
  assert.equal(names.length, 1);
  await db.exec(fs.readFileSync(path.join(directory, names[0]), 'utf8'));

  await t.test('admin RPC returns retained photos, verified videos, event photos and comment uploads', async () => {
    const rows = await media(Array.from({length: 12}, (_, i) => i + 1));
    assert.deepEqual(rows.map(row => row.card_id), [1, 2, 3, 5, 6, 7, 9].map(id));
    assert.deepEqual(Object.keys(rows[0]).sort(), ['card_id', 'photo_bucket', 'photo_path', 'video_bucket', 'video_path', 'duration', 'width', 'height'].sort());
    assert.deepEqual(rows.find(row => row.card_id === id(2)), {card_id: id(2), photo_bucket: 'note-card-photos', photo_path: photo(2),
      video_bucket: 'note-card-videos', video_path: video(2), duration: 12.5, width: 720, height: 480});
    assert.equal(rows.find(row => row.card_id === id(5)).photo_bucket, 'note-event-photos', 'ended event photos remain available for moderation');
    assert.equal(rows.find(row => row.card_id === id(9)).video_path, null, 'retired video is excluded while its valid poster remains');
    assert.equal(rows.find(row => row.card_id === id(9)).duration, null);
    assert.deepEqual(await media(null), []);
    assert.deepEqual(await media([]), []);
    assert.equal((await media([1, 1])).length, 1, 'repeated requested IDs do not duplicate attachments');
    await assert.rejects(() => media(Array(101).fill(1)), /Invalid media page/);
  });

  await t.test('all new entry points enforce administrator identity and keep tables private', async () => {
    await assert.rejects(() => media([1], null, 'anon'), /permission denied/);
    for (const user of [null, MEMBER, AUTHOR]) {
      await assert.rejects(() => media([1, 2, 3], user), /Administrator required/);
      await assert.rejects(() => as(user, () => scalar('select * from ojjuda_note_internal.admin_card_media_paths($1::uuid[])', [[id(2)]])), /Administrator required/);
      assert.equal(await signable('note-card-photos', photo(2), user), false);
    }
    for (const name of ['card_photos', 'card_video_uploads', 'event_ads', 'note_photo_tombstones']) {
      await assert.rejects(() => as(ADMIN, () => scalar(`select * from ojjuda_note_internal.${name}`)), /permission denied/);
    }
    assert.equal(await scalar("select prosecdef as value from pg_proc where oid='ojjuda_note.admin_card_media_paths(uuid[])'::regprocedure"), false);
    for (const role of ['anon', 'service_role']) {
      for (const fn of ['ojjuda_note.admin_card_media_paths(uuid[])', 'ojjuda_note_internal.admin_card_media_paths(uuid[])',
        'ojjuda_note_internal.admin_card_media_signable(text,text)']) {
        assert.equal(await scalar('select has_function_privilege($1,$2,\'execute\') as value', [role, fn]), false);
      }
    }
  });

  await t.test('Storage grants only exact linked retained objects for signing, never listing or mutations', async () => {
    const signed = await storage('object.sign_many', ADMIN);
    for (const number of [2, 3]) {
      assert.ok(signed.includes('note-card-photos:' + photo(number)));
      assert.ok(signed.includes('note-card-videos:' + video(number)));
    }
    assert.ok(signed.includes('note-event-photos:' + photo(5)));
    assert.ok(signed.includes('note-event-photos:' + photo(6)));
    for (const number of [4, 8, 10, 11]) {
      assert.ok(!signed.some(name => name.endsWith(photo(number)) || name.endsWith(video(number))));
    }
    assert.ok(!signed.includes('note-card-videos:' + video(9)));
    assert.deepEqual(await storage('object.sign', ADMIN), signed);
    for (const operation of ['object.list', 'object.get_authenticated', 'object.delete', 'object.delete_many', 'object.update']) {
      assert.deepEqual(await storage(operation, ADMIN), []);
    }
    assert.equal(await signable('media', photo(2)), false);
    assert.equal(await signable('note-card-photos', video(2)), false);
    assert.equal(await signable('note-card-videos', video(11)), false, 'unlinked unverified upload is inaccessible');
    assert.equal(await signable(null, null), false);
  });

  await t.test('member policy, public media RPC and public signing behavior stay unchanged', async () => {
    assert.deepEqual(await existingDefinitions(), previousDefinitions);
    assert.deepEqual(await scalar("select jsonb_agg(to_jsonb(p) order by policyname) as value from pg_policies p where schemaname='storage' and policyname<>'note_media_admin_sign'"), previousPolicies);
    assert.deepEqual(await storage('object.sign_many', MEMBER), previousMemberStorage);
    assert.deepEqual(await as(MEMBER, () => scalar(
      "select coalesce(jsonb_agg(r order by card_id),'[]'::jsonb) as value from ojjuda_note.card_media_paths($1::uuid[]) r",
      [Array.from({length: 11}, (_, i) => id(i + 1))])), previousMemberMedia);
    await assert.rejects(() => as(ADMIN, () => db.query("insert into storage.objects(bucket_id,name,owner_id) values('note-card-photos',$1,$2)", [photo(90), ADMIN])), /row-level security/);
    const altered = await as(ADMIN, () => db.query("update storage.objects set owner_id=$1 where name=$2 returning id", [ADMIN, photo(2)]));
    assert.equal(altered.rows.length, 0, 'administrator read permission does not grant object mutation');
  });

  await t.test('expiry, card deletion and administrator removal immediately block new paths and signatures', async () => {
    await db.query('update ojjuda_note.cards set purge_after=statement_timestamp() where id=$1', [id(3)]);
    assert.deepEqual(await media([3]), []);
    assert.equal(await signable('note-card-photos', photo(3)), false);
    assert.equal(await signable('note-card-videos', video(3)), false);
    await db.query('delete from ojjuda_note.cards where id=$1', [id(2)]);
    assert.deepEqual(await media([2]), []);
    assert.equal(await signable('note-card-videos', video(2)), false);
    await db.query('delete from public.app_admins where user_id=$1', [ADMIN]);
    await assert.rejects(() => media([1]), /Administrator required/);
    assert.equal(await signable('note-event-photos', photo(5)), false);
  });
});
