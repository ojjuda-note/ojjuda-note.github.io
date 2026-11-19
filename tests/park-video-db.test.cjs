const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
const uuid = n => '33333333-3333-4333-8333-' + String(n).padStart(12, '0');

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage; create schema ojjuda_note; create schema ojjuda_note_internal;
create schema ojjuda_account_deletion; create schema cron; create schema pajang_private; create schema ojjuda_restaurants_internal;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
insert into storage.buckets values('note-card-photos','note-card-photos',false,3145728,array['image/jpeg']);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,owner uuid,metadata jsonb,created_at timestamptz default now(),unique(bucket_id,name));
alter table storage.objects enable row level security;
create function storage.allow_any_operation(ops text[]) returns boolean language sql stable as $$select coalesce(current_setting('test.storage_operation',true),'')=any(ops)$$;
create table ojjuda_account_deletion.requests(user_id uuid primary key references auth.users(id) on delete cascade);
create function ojjuda_account_deletion.pending() returns boolean language sql stable security definer as $$select exists(select 1 from ojjuda_account_deletion.requests where user_id=auth.uid())$$;
create function ojjuda_account_deletion.upload_allowed() returns boolean language sql volatile security definer as $$select exists(select 1 from auth.users where id=auth.uid()) and not ojjuda_account_deletion.pending()$$;
create function ojjuda_account_deletion.check_owner(u uuid) returns uuid language plpgsql security definer as $$begin if u is distinct from auth.uid() then raise exception 'account_changed'; end if; return u; end$$;
create table ojjuda_note.cards(id uuid primary key default gen_random_uuid(),author_id uuid references auth.users(id) on delete cascade,kind text,parent_id uuid references ojjuda_note.cards(id),body text,tags text[],background_key text,identity_mode text,archived_at timestamptz);
create table ojjuda_note_internal.blocks(blocker uuid,blocked uuid);
create function ojjuda_note_internal.can_read_card(c uuid) returns boolean language sql stable security definer as $$select not exists(select 1 from ojjuda_note_internal.blocks b join ojjuda_note.cards c1 on c1.author_id=b.blocked where c1.id=c and b.blocker=auth.uid())$$;
create view ojjuda_note.public_cards as select c.* from ojjuda_note.cards c where c.archived_at is null and ojjuda_note_internal.can_read_card(c.id);
create table ojjuda_note_internal.card_photos(card_id uuid primary key references ojjuda_note.cards(id) on delete cascade,author_id uuid references auth.users(id) on delete cascade,photo_path text unique not null);
create table ojjuda_note_internal.event_ads(card_id uuid,photo_path text);
create table ojjuda_note_internal.auto_card_config(author_id uuid);
create table ojjuda_note_internal.note_photo_tombstones(bucket_id text check(bucket_id in ('note-card-photos','note-event-photos')),photo_path text,card_id uuid not null,purged_at timestamptz default now(),primary key(bucket_id,photo_path));
create function ojjuda_note_internal.note_photo_tombstoned(b text,p text) returns boolean language sql stable security definer as $$select exists(select 1 from ojjuda_note_internal.note_photo_tombstones where bucket_id=b and photo_path=p)$$;
create function ojjuda_note_internal.is_note_moderator() returns boolean language sql stable as $$select false$$;
create function ojjuda_note_internal.can_note_act(k text) returns boolean language sql stable security definer as $$select auth.uid() is not null and coalesce(current_setting('test.banned',true),'')<>'true'$$;
create function ojjuda_note_internal.card_photo_unlinked(p_path text) returns boolean language sql stable security definer as $$select not exists(select 1 from ojjuda_note_internal.card_photos where photo_path=p_path)$$;
create function ojjuda_note_internal.card_photo_signable(p text) returns boolean language sql stable security definer as $$select auth.uid() is not null and exists(select 1 from ojjuda_note_internal.card_photos f join ojjuda_note.public_cards c on c.id=f.card_id where f.photo_path=p)$$;
create function ojjuda_note_internal.old_tombstone() returns trigger language plpgsql as $$begin insert into ojjuda_note_internal.note_photo_tombstones values('note-card-photos',old.photo_path,old.card_id,now()) on conflict do nothing;return old;end$$;
create trigger old_tombstone after delete on ojjuda_note_internal.card_photos for each row execute function ojjuda_note_internal.old_tombstone();
create function ojjuda_note_internal.old_no_reuse() returns trigger language plpgsql as $$begin if ojjuda_note_internal.note_photo_tombstoned('note-card-photos',new.photo_path) then raise exception 'Photo path retired'; end if;return new;end$$;
create trigger old_no_reuse before insert or update of photo_path on ojjuda_note_internal.card_photos for each row execute function ojjuda_note_internal.old_no_reuse();
create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins integer,target_id uuid,result jsonb);
create table ojjuda_note_internal.card_locations(card_id uuid,author_id uuid,exact_lat double precision,exact_lon double precision,coarse_lat double precision,coarse_lon double precision);
create function ojjuda_note_internal.snap_lat(double precision) returns double precision language sql as $$select $1$$;
create function ojjuda_note_internal.snap_lon(double precision,double precision) returns double precision language sql as $$select $2$$;
create function ojjuda_note_internal.upsert_card_style(uuid,jsonb) returns void language sql as $$select$$;
create function ojjuda_note_internal.queue_new_reply_retention_alert(uuid) returns void language sql as $$select$$;
create function ojjuda_note_internal.effective_archive_due(uuid) returns timestamptz language sql as $$select now()+interval '30 days'$$;
create function ojjuda_note.attach_card_photo(p_card_id uuid,p_path text) returns text language plpgsql security definer as $$begin
 if not exists(select 1 from storage.objects where bucket_id='note-card-photos' and name=p_path and owner_id=auth.uid()::text) then raise exception 'Photo not uploaded';end if;
 insert into ojjuda_note_internal.card_photos values(p_card_id,auth.uid(),p_path);return p_path;end$$;
create table public.guestbook(author_id uuid,author_nick text);create table public.media_comments(author_id uuid,author_nick text);
create function pajang_private.exchange_photo_path_ok(text) returns boolean language sql as $$select false$$;
create function ojjuda_restaurants_internal.photo_path_valid(text) returns boolean language sql as $$select false$$;
create function ojjuda_restaurants_internal.comment_photo_path_valid(text,uuid,text) returns boolean language sql as $$select false$$;
create table cron.job(name text,schedule text,command text);
create function cron.schedule(text,text,text) returns bigint language sql as $$insert into cron.job values($1,$2,$3) returning 1::bigint$$;
grant usage on schema auth,storage,ojjuda_note,ojjuda_note_internal,ojjuda_account_deletion to authenticated,service_role;
grant select,insert,update,delete on storage.objects to authenticated;
create policy photos on storage.objects for select to authenticated using(bucket_id='note-card-photos' and owner_id=auth.uid()::text);
create policy photo_delete on storage.objects for delete to authenticated using(bucket_id='note-card-photos' and owner_id=auth.uid()::text and (ojjuda_account_deletion.pending() or ojjuda_note_internal.card_photo_unlinked(name)));
create policy no_new_storage on storage.objects as restrictive for insert to authenticated with check(ojjuda_account_deletion.upload_allowed());
insert into auth.users values('${A}'),('${B}');
`);
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20260928075731_note_initial_photo_and_replace_only.sql'), 'utf8'));
    const name = fs.readdirSync(path.join(root, 'supabase/migrations')).find(x => x.endsWith('_park_verified_short_videos.sql'));
    await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
    const scalar = async (sql, args = []) => (await db.query(sql, args)).rows[0]?.v;
    async function call(sql, args = [], user = A, role = 'authenticated') {
      await db.exec(`set role ${role}`); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user || '']);
      try { return await scalar(sql, args); } finally { await db.exec('reset role'); }
    }
    async function upload(n, { owner = A, old = false } = {}) {
      const photo = `${owner}/${uuid(n)}.jpg`, video = photo.replace('.jpg', '.mp4');
      const row = await db.query(`insert into storage.objects(bucket_id,name,owner_id,metadata,created_at) values
        ('note-card-photos',$1,$3,'{"mimetype":"image/jpeg","size":400}',now()),
        ('note-card-videos',$2,$3,'{"mimetype":"video/mp4","size":1234}',now()-$4::interval) returning id,bucket_id`,
      [photo, video, owner, old ? '25 hours' : '0 hours']);
      return { photo, video, photoId: row.rows[0].id, videoId: row.rows[1].id, owner };
    }
    const prepare = item => call('select ojjuda_note.prepare_card_video_validation($1,$2) as v', [item.photo, item.video], item.owner);
    const register = (item, role = 'service_role') => call('select ojjuda_note.register_verified_card_video($1,$2,$3,$4,$5,1.25,320,180,1234,$6) as v',
      [item.owner, item.photo, item.video, item.photoId, item.videoId, 'a'.repeat(64)], null, role);
    const publish = (item, request = uuid(100)) => call(`select ojjuda_note.publish_card_with_photo(
      p_request_id=>$1,p_body=>'테스트',p_photo_path=>$2,p_lat=>37.5,p_lon=>127.0) as v`, [request, item.photo], item.owner);
    const paths = (card, user = A) => call('select coalesce(jsonb_agg(x),\'[]\'::jsonb) as v from ojjuda_note.card_media_paths(array[$1::uuid]) x', [card], user);

    // A poster delete must acquire both barriers before a video/receipt exists.
    // A real PostgreSQL advisory lock is observed in this isolated transaction.
    await db.exec('begin');
    await scalar("select set_config('request.jwt.claim.sub',$1,true) as v", [A]);
    assert.equal(await scalar('select ojjuda_note_internal.card_photo_unlinked($1) as v', [`${A}/${uuid(90)}.jpg`]), true);
    assert.equal(await scalar("select count(*)::integer as v from pg_locks where locktype='advisory' and classid in (127247341,21482) and granted"), 2);
    await db.exec('commit');

    if(process.env.PARK_VIDEO_DB_DEBUG) console.log('stage: first');
    const first = await upload(1);
    await assert.rejects(() => register(first, 'authenticated'), /permission denied/);
    await assert.rejects(() => call('select * from ojjuda_note_internal.card_video_uploads'), /permission denied/);
    await assert.rejects(() => publish(first), /video_not_verified/);
    assert.equal(await scalar('select count(*)::integer as v from ojjuda_note.cards'), 0, 'failed video validation rolls back card publication');
    assert.equal(await scalar('select count(*)::integer as v from ojjuda_note_internal.spend_requests'), 0);
    assert.equal((await prepare(first)).video_object_id, first.videoId);
    await assert.rejects(() => call('select ojjuda_note.prepare_card_video_validation($1,$2) as v', [first.photo, first.video], B), /invalid_video_path/);
    assert.equal((await register(first)).ok, true);
    assert.equal((await prepare(first)).verified.video_path, first.video);
    const published = await publish(first), card = published.card_id;
    assert.equal((await publish(first)).card_id, card, 'lost success safely replays without a second card');
    assert.equal((await paths(card, B))[0].video_path, first.video);
    await db.query('insert into ojjuda_note_internal.blocks values($1,$2)', [B, A]);
    assert.equal((await paths(card, B)).length, 0, 'blocked member cannot fetch video paths');
    await db.exec('delete from ojjuda_note_internal.blocks');
    await db.query('update ojjuda_note.cards set archived_at=now() where id=$1', [card]);
    assert.equal((await paths(card)).length, 0, 'archived cards cannot be signed');
    await db.query('update ojjuda_note.cards set archived_at=null where id=$1', [card]);
    assert.equal(await call('select ojjuda_note_internal.card_video_deletable($1) as v', [first.video]), false);
    assert.equal(await call('select ojjuda_note_internal.card_photo_unlinked($1) as v', [first.photo]), false);
    await db.query("select set_config('test.storage_operation','object.delete',false)");
    assert.equal(await call('with removed as (delete from storage.objects where name=$1 returning id) select count(*)::integer as v from removed', [first.video]), 0);

    if(process.env.PARK_VIDEO_DB_DEBUG) console.log('stage: second');
    const second = await upload(2); await register(second);
    await assert.rejects(() => publish(second), /Request photo does not match/, 'publication request cannot change its attachment');
    const replacement = await call('select ojjuda_note.replace_card_photo($1,$2,$3) as v', [card, second.photo, first.photo]);
    assert.equal(replacement.previous_path, first.photo);
    assert.equal((await paths(card))[0].video_path, second.video);
    assert.equal(await scalar("select count(*)::integer as v from ojjuda_note_internal.note_photo_tombstones where photo_path=$1 and bucket_id='note-card-videos'", [first.video]), 1);
    assert.equal((await call('select ojjuda_note.replace_card_photo($1,$2,$3) as v', [card, second.photo, first.photo])).previous_path, null);
    await assert.rejects(() => call('select ojjuda_note.replace_card_photo($1,$2,$3) as v', [card, first.photo, second.photo]), /retired|video_upload_changed/);
    assert.equal(await call('select ojjuda_note_internal.can_upload_card_video($1) as v', [first.video]), false, 'retired path cannot be uploaded again');

    if(process.env.PARK_VIDEO_DB_DEBUG) console.log('stage: changed');
    const changed = await upload(3); await register(changed);
    await db.query('update storage.objects set id=gen_random_uuid() where id=$1', [changed.videoId]);
    await assert.rejects(() => publish(changed, uuid(103)), /video_upload_changed/, 'delete/reupload cannot reuse a verified receipt');
    await assert.rejects(() => register(changed), /video_upload_changed/);
    if(process.env.PARK_VIDEO_DB_DEBUG) console.log('stage: race');
    const race = await upload(4); await register(race);
    await db.query('delete from storage.objects where id=$1', [race.photoId]);
    await assert.rejects(() => publish(race, uuid(104)), /Photo not uploaded/);

    if(process.env.PARK_VIDEO_DB_DEBUG) console.log('stage: abandoned');
    const abandoned = await upload(5, { old: true });
    const swept = await scalar('select ojjuda_note_internal.retire_unlinked_card_videos() as v');
    assert.equal(swept, 1); assert.equal(await scalar('select count(*)::integer as v from ojjuda_note_internal.note_photo_tombstones where photo_path in ($1,$2)', [abandoned.photo, abandoned.video]), 2);
    assert.equal((await paths(card))[0].video_path, second.video, 'sweeper keeps linked media');
    if(process.env.PARK_VIDEO_DB_DEBUG) console.log('stage: limited');
    const limited = await upload(6);
    for (let n = 0; n < 5; n++) await prepare(limited); // Initial first-video attempt already consumed one.
    await assert.rejects(() => prepare(limited), /video_validation_rate_limit/);
    assert.ok((await prepare(second)).verified, 'verified retries do not consume validation budget');

    if(process.env.PARK_VIDEO_DB_DEBUG) console.log('stage: withdraw');
    await db.query('insert into ojjuda_account_deletion.requests values($1)', [A]);
    await assert.rejects(() => prepare(second), /video_forbidden/);
    await assert.rejects(() => register(second), /video_forbidden/);
    assert.equal(await call('select ojjuda_note_internal.card_video_deletable($1) as v', [second.video]), true, 'confirmed withdrawal may delete a linked video');
    const inventory = await call('select jsonb_agg(x) as v from ojjuda_account_deletion.files($1,100) x', [A]);
    assert.ok(inventory.some(x => x.bucket_id === 'note-card-videos' && x.photo_path === second.video));
    await assert.rejects(() => call('select ojjuda_account_deletion.finish($1) as v', [A]), /account_storage_remaining/);
    await db.query('delete from storage.objects where owner_id=$1', [A]); // Simulated successful Storage API deletion.
    if(process.env.PARK_VIDEO_DB_DEBUG) console.log('stage: finish');
    await call('select ojjuda_account_deletion.finish($1) as v', [A]);
    assert.equal(await scalar('select count(*)::integer as v from ojjuda_note_internal.card_video_uploads where author_id=$1', [A]), 0);
    assert.equal(await scalar("select count(*)::integer as v from cron.job where name='note-short-video-orphan-retirement'"), 1);
    console.log('PASS: verified-only atomic publication, service-only receipts, object replacement defense, blocked/archive visibility, immutable idempotency, replacement tombstones, cleanup, rate bounds and withdrawal');
  } finally { await db.close(); }
})().catch(error => { console.error({message:error.message,code:error.code,where:error.where,stack:error.stack?.split('\n').slice(0,3).join('\n')}); process.exitCode = 1; });
