const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

(async () => {
  const db = new PGlite();
  const member = randomUUID();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema ojjuda_note; create schema ojjuda_note_internal; create schema storage;
    grant usage on schema auth,ojjuda_note to anon,authenticated;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${member}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table ojjuda_note.cards(id uuid primary key default gen_random_uuid(),author_id uuid,
      kind text,parent_id uuid,body text,tags text[],background_key text check(background_key ~ '^([1-9][0-9]|1[0-8][0-9])$'),
      identity_mode text,archived_at timestamptz, constraint note_guest_basic_card check (author_id is not null or
        (kind in ('memo','comment') and identity_mode='anonymous' and background_key='10')));
    create view ojjuda_note.public_cards as select * from ojjuda_note.cards where archived_at is null;
    create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins int,target_id uuid,result jsonb,created_at timestamptz default now());
    create table ojjuda_note_internal.card_locations(card_id uuid,author_id uuid,exact_lat float8,exact_lon float8,coarse_lat float8,coarse_lon float8);
    create table ojjuda_note_internal.card_visuals(card_id uuid primary key,style jsonb,style_until timestamptz,
      photo_key text constraint card_visuals_photo_key_check check (photo_key is null),photo_until timestamptz,updated_at timestamptz default now());
    create table ojjuda_note_internal.drafts(user_id uuid primary key,revision bigint default 0,active boolean default false,
      body text,tags text,background_key text,kind text,parent_id uuid,style jsonb,photo_key text,updated_at timestamptz,
      constraint note_draft_content check (not active));
    create function ojjuda_note_internal.is_world_member() returns boolean language sql stable as $$select auth.uid() is not null$$;
    create function ojjuda_note_internal.valid_card_style(jsonb) returns boolean language sql immutable as $$select jsonb_typeof($1)='object'$$;
    create function ojjuda_note_internal.read_draft() returns table(revision bigint,content jsonb,updated_at timestamptz)
      language sql stable as $$select d.revision,to_jsonb(d),d.updated_at from ojjuda_note_internal.drafts d where d.user_id=auth.uid()$$;
    create table ojjuda_note_internal.event_ads(card_id uuid,author_id uuid,center_lat float8,center_lon float8,radius_km int,starts_at timestamptz,ends_at timestamptz,price_coins int,photo_path text);
    create table public.user_private(user_id uuid primary key,coins int);
    insert into public.user_private values('${member}',1000);
    create table storage.objects(bucket_id text,name text,owner_id text,created_at timestamptz default now());
    create table ojjuda_note_internal.test_attachments(card_id uuid primary key,path text);
    create function ojjuda_note_internal.can_note_act(text) returns boolean language sql as $$select auth.uid() is not null and coalesce(current_setting('test.banned',true),'false')<>'true'$$;
    create function ojjuda_note_internal.snap_lat(float8) returns float8 language sql as $$select $1$$;
    create function ojjuda_note_internal.snap_lon(float8,float8) returns float8 language sql as $$select $2$$;
    create function ojjuda_note_internal.queue_new_reply_retention_alert(uuid) returns void language sql as $$select$$;
    create function ojjuda_note_internal.effective_archive_due(uuid) returns timestamptz language sql as $$select now()+interval '6 months'$$;
    create function ojjuda_note_internal.valid_note_body(text) returns boolean language sql as $$select length($1) between 1 and 200$$;
    create function ojjuda_note.valid_tags(text[]) returns boolean language sql as $$select cardinality($1)<=5$$;
    create function ojjuda_note_internal.upsert_card_style(uuid,jsonb) returns void language sql as $$insert into ojjuda_note_internal.card_visuals values($1,$2) on conflict(card_id) do update set style=excluded.style$$;
    create function ojjuda_note.attach_card_photo(uuid,text) returns void language plpgsql as $$begin
      if not exists(select 1 from storage.objects where bucket_id='note-card-photos' and name=$2 and owner_id=auth.uid()::text)
      then raise exception 'Invalid attachment' using errcode='22023'; end if;
      insert into ojjuda_note_internal.test_attachments values($1,$2);
    end$$;
  `);
  await db.exec(read('supabase/scripts/notes/note_photo_inventory_180_2026_09_27.sql'));
  await db.exec(read('supabase/migrations/20260928075731_note_initial_photo_and_replace_only.sql'));
  await db.exec('BEGIN;\n' + read('supabase/migrations/20260928132900_note_card_photo_monthly_entitlement.sql') + '\nCOMMIT;');
  // Install the refund-table DDL without replaying a correction for a specific live account.
  await db.exec(read('supabase/migrations/20260928133000_note_card_photo_duplicate_refund.sql').split('DO $refund$')[0]);
  const migration = fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith('_note_preview_background.sql'));
  await db.exec(read('supabase/migrations/'+migration));
  const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member]);
  const rpc = (name,args) => value(`select ojjuda_note.${name}(${Object.keys(args).map((k,i)=>`${k} => $${i+1}`).join(',')}) as value`,Object.values(args));
  const basic = key => ({p_request_id:randomUUID(),p_body:'미리보기 사진 유지',p_background_key:key,p_tags:[],p_identity_mode:'anonymous',p_style:{},p_lat:37,p_lon:127,p_parent_id:null});

  // Exercise the real browser publish handler against the migrated PostgreSQL RPCs.
  const source = read('note/preview.js');
  const validCardIdSource = source.match(/^const validCardId = .*;$/m)[0];
  const maskedTextLengthSource = source.match(/^const maskedTextLength = .*;$/m)[0];
  const guestComposerSource = source.slice(source.indexOf('function isGuestComposer()'),source.indexOf('\nfunction updateComposer()'));
  const publishSource = source.slice(source.indexOf('async function publishCard()'),source.indexOf('\nfunction updateAuth()'));
  const publishFromPreview = async ({body='미리보기 사진 유지',background='42',kind='memo',parent=null,attachment=false,draftBackground=background,withDraft=true}={}) => {
    const requestId=randomUUID(), photoId=randomUUID(), attachmentPath=`${member}/${photoId}.jpg`;
    if(attachment) await db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',[kind==='event'?'note-event-photos':'note-card-photos',attachmentPath,member]);
    const calls=[];
    const c={ console:{warn(){}},busy:false,ready:true,authKnown:true,submit:{disabled:false},text:{value:body},composeMessage:{textContent:''},
      cardPhotoPreparing:false,editingId:null,composerUserId:member,identityEpoch:1,composerRun:1,backgroundKey:background,
      cardPhotoEditPath:null,kind,parentId:parent,cardPhotoBlob:attachment&&kind!=='event'?{}:null,cardPhotoRequestId:photoId,
      photoFromWorld:{card:true,event:true},eventPhotoBlob:attachment&&kind==='event'?{}:null,eventPhotoRequestId:photoId,
      eventPhotoRemove:false,eventPhotoPreparing:false,eventPhotoError:'',photoRequestId:randomUUID(),publishRequestId:requestId,EVENT_PHOTO_BUCKET:'note-event-photos',
      session:{user:{id:member}},myIdentity:{},myGender:'private',writingPosition:{latitude:37,longitude:127},eventPosition:{latitude:37,longitude:127},
      cache:new Map(),backdrop:{hidden:false},currentStyle:()=>({}),parsedTags:()=>[],chosenPhoto:()=> 'plain',
      validEventBody:()=>true,validEventPosition:()=>true,validEventOptions:()=>true,archiveDueThisMonth:()=>false,parentArchiveDue:()=>null,
      composerPhotoOverflows:()=>false,cardPhotoOverflows:()=>false,noteSpamMessage:()=>'',recordDraft(){},setComposerInputs(){},updateComposer(){},
      window:{confirm:()=>true},$:selector=>({value:selector.includes('radius')||selector.includes('hours')?'1':selector.includes('gender')?'private':'anonymous'}),
      client:{auth:{getUser:async()=>({data:{user:{id:member}},error:null})},storage:{from:()=>({upload:async()=>({error:null})})}},
      uploadCardPhotoFile:async()=>attachmentPath,
      draftController:withDraft?{preparePublish:async()=>({content:{body:'미리보기 사진 유지',tags:'',kind,parent_id:parent,background_key:draftBackground}}),cancelPublish(){},published:async()=>({cleared:true})}:null,
    };
    c.noteRpc=async(name,args)=>{
      if(name==='set_my_gender')return;
      calls.push({name,args});
      const result=await rpc(name,args);
      c.identityEpoch++; // Stop after the real publication succeeds, before unrelated feed rendering.
      return result;
    };
    vm.createContext(c);vm.runInContext([validCardIdSource,maskedTextLengthSource,guestComposerSource,publishSource].join('\n'),c);await vm.runInContext('publishCard()',c);
    return {calls,message:c.composeMessage.textContent,result:await value('select result as value from ojjuda_note_internal.spend_requests where request_id=$1',[requestId])};
  };
  const overlength=await publishFromPreview({body:'가'.repeat(201)});assert.equal(overlength.calls.length,0);assert.equal(overlength.result,undefined,'overlength photo card is not published');
  for(const key of ['10','42','73','189']){
    const saved=await publishFromPreview({background:key});
    assert.equal(saved.calls[0].args.p_background_key,key);
    assert.equal(saved.result.background_key,key);
    assert.equal(await value('select background_key as value from ojjuda_note.cards where id=$1',[saved.result.card_id]),key);
  }
  const parent=(await publishFromPreview()).result.card_id;
  const reply=await publishFromPreview({background:'91',kind:'comment',parent});
  assert.equal(reply.result.background_key,'91');
  const attached=await publishFromPreview({background:'142',attachment:true});
  assert.equal(attached.result.background_key,'142');assert.ok(attached.result.photo_path);
  const noDraft=await publishFromPreview({background:'61',withDraft:false});assert.equal(noDraft.result.background_key,'61');
  const mismatch=await publishFromPreview({background:'42',draftBackground:'43'});
  assert.equal(mismatch.calls.length,0);assert.match(mismatch.message,/사진이 바뀌었어요/);
  const event=await publishFromPreview({background:'81',kind:'event'});
  assert.equal(event.result.background_key,'81');assert.equal(event.result.coins_spent,100);
  const eventPhoto=await publishFromPreview({background:'82',kind:'event',attachment:true});
  assert.ok(eventPhoto.result,eventPhoto.message);assert.equal(eventPhoto.result.background_key,'82');
  const eventCall=event.calls[0];
  const eventRetry=await rpc(eventCall.name,eventCall.args);assert.deepEqual(eventRetry,event.result);
  await assert.rejects(()=>rpc(eventCall.name,{...eventCall.args,p_background_key:'83'}),e=>e.code==='23505');
  assert.equal(await value('select coins as value from public.user_private where user_id=$1',[member]),800);

  const args=basic('55');const first=await rpc('publish_card',args),again=await rpc('publish_card',args);
  assert.deepEqual(first,again,'retry keeps the original card and photo');
  await assert.rejects(()=>rpc('publish_card',{...args,p_background_key:'56'}),e=>e.code==='23505');
  assert.equal(await value('select background_key as value from ojjuda_note.cards where id=$1',[first.card_id]),'55');
  for(const bad of ['9','190','plain','','42.jpg']) await assert.rejects(()=>rpc('publish_card',basic(bad)),e=>e.code==='22023');
  const legacy=basic('42');delete legacy.p_background_key;
  const old=await rpc('publish_card',legacy);assert.ok(Number(old.background_key)>=10&&Number(old.background_key)<=189);
  await db.exec('set role authenticated');
  assert.equal((await rpc('publish_card',basic('62'))).background_key,'62');
  await db.exec('reset role');
  await db.exec("select set_config('test.banned','true',false)");
  await assert.rejects(()=>rpc('publish_card',basic('42')),e=>e.code==='42501');
  await db.exec("select set_config('test.banned','false',false)");
  assert.equal(await value("select has_function_privilege('anon','ojjuda_note.publish_card(uuid,text,text,text[],text,jsonb,double precision,double precision,uuid)','execute') as value"),false);
  assert.equal(await value("select has_function_privilege('authenticated','ojjuda_note_internal.publish_card_core(uuid,text,text,text[],text,jsonb,double precision,double precision,uuid,text)','execute') as value"),false);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(()=>rpc('publish_card',basic('42')),e=>e.code==='42501');

  const watercolor = fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith('_park_watercolor_background_keys.sql'));
  await db.exec(read('supabase/migrations/'+watercolor));
  await assert.rejects(()=>rpc('publish_card',basic('297')),e=>e.code==='42501');
  const guestCard=key=>db.query("insert into ojjuda_note.cards(kind,identity_mode,background_key) values ('memo','anonymous',$1)",[key]);
  await guestCard('10');
  await assert.rejects(()=>guestCard('297'),e=>e.code==='23514');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member]);
  for(const key of ['189','190','225','226','261','262','297']) {
    const saved=await publishFromPreview({background:key});
    assert.equal(saved.result?.background_key,key,saved.message);
  }
  for(const bad of ['298','09','plain']) await assert.rejects(()=>rpc('publish_card',basic(bad)),e=>e.code==='22023');
  await db.query('select setseed(.42)');
  const expected=await value("select (10+floor(random()*288))::int::text as value");
  await db.query('select setseed(.42)');
  const balance=()=>value('select coins as value from public.user_private where user_id=$1',[member]);
  const initialCoins=await balance();
  const randomCard=await rpc('publish_card',{...legacy,p_request_id:randomUUID()});
  assert.equal(randomCard.background_key,expected);
  assert.equal(await balance(),initialCoins,'the random wash is free');

  const purchase={p_card_id:parent,p_photo_key:'297',p_request_id:randomUUID()};
  const receipt=await rpc('purchase_card_photo',purchase);
  assert.equal(receipt.cost_coins,10);
  assert.deepEqual(await rpc('purchase_card_photo',purchase),receipt,'retry does not buy the same wash twice');
  const secondCard={...purchase,p_card_id:randomCard.card_id,p_request_id:randomUUID()};
  const owned=await rpc('apply_owned_card_photo',secondCard);
  assert.equal(owned.cost_coins,0);
  assert.equal(owned.photo_until,receipt.photo_until,'ownership is reused without extending the month');
  assert.equal(await balance(),initialCoins-10);
  assert.equal((await value('select ojjuda_note_internal.card_visual_for($1) as value',[randomCard.card_id])).photo_key,'297');
  await assert.rejects(()=>rpc('purchase_card_photo',{...purchase,p_photo_key:'298',p_request_id:randomUUID()}),e=>e.code==='22023');

  const draft={kind:'memo',parent_id:null,body:'붓글씨',tags:'',background_key:'190',photo_key:'297'};
  const saveDraft=(revision,content)=>value('select content as value from ojjuda_note_internal.save_draft($1,$2::jsonb)',[revision,JSON.stringify(content)]);
  assert.equal((await saveDraft(0,draft)).photo_key,'297');
  await assert.rejects(()=>saveDraft(1,{...draft,photo_key:'298'}),e=>e.code==='22023');

  // Run the real guest publisher before and after its upgrade, including its retry path.
  await db.exec(`
    alter table ojjuda_note.cards drop constraint note_guest_basic_card;
    create schema ojjuda_traffic;
    create table ojjuda_traffic.settings(singleton boolean primary key, salt uuid not null);
    insert into ojjuda_traffic.settings values (true,'a023fd6a-da03-4f38-975a-9ed940e7a127');
    create table ojjuda_note_internal.settings(singleton boolean primary key, spam_max_consecutive int,
      spam_window_seconds int, spam_max_posts int);
    insert into ojjuda_note_internal.settings values (true,2,600,3);
    create table ojjuda_note_internal.retention_alerts(recipient_id uuid);
    create table ojjuda_note_internal.notifications(actor_id uuid, kind text);
    create function ojjuda_note_internal.enforce_anti_spam() returns trigger language plpgsql as $$begin return new; end$$;
    create function ojjuda_note_internal.remember_thread_alias() returns trigger language plpgsql as $$begin return new; end$$;
    create function ojjuda_note_internal.spam_body_hash(text) returns text language sql immutable as $$select md5($1)$$;
    create function ojjuda_note_internal.auto_card_tags(integer,date,text) returns text[] language sql as $$select array['공원']$$;
  `);
  await db.exec(read('supabase/migrations/20261116140954_park_guest_cards_and_calligraphy.sql'));
  await db.exec(`
    create schema ojjuda_shop_internal;
    create table ojjuda_shop_internal.entitlements(user_id uuid, product text, expires_at timestamptz);
    create function ojjuda_shop_internal.owns(uuid,text) returns boolean language sql as $$select false$$;
  `);
  // Exercise the real style writer, including its validator, rather than the earlier attachment fixture.
  const styleWriter = read('supabase/migrations/20261006032049_ju_shop_entitlements.sql')
    .match(/CREATE OR REPLACE FUNCTION ojjuda_note_internal\.upsert_card_style\([\s\S]*?\$function\$;/)[0];
  await db.exec(styleWriter);
  const heartCard = { ...basic('190'), p_style: { font: 'heart' } };
  await assert.rejects(() => rpc('publish_card', heartCard), e => e.code === '22023');
  const fontMigration = fs.readdirSync(path.join(root, 'supabase/migrations')).find(n => n.endsWith('_park_heart_font.sql'));
  const validatorAcl = await value("select proacl::text as value from pg_proc where oid='ojjuda_note_internal.valid_card_style(jsonb)'::regprocedure");
  await db.exec(read('supabase/migrations/' + fontMigration));
  assert.equal(await value("select proacl::text as value from pg_proc where oid='ojjuda_note_internal.valid_card_style(jsonb)'::regprocedure"), validatorAcl);
  const heartPublished = await rpc('publish_card', heartCard);
  assert.equal(await value("select style->>'font' as value from ojjuda_note_internal.card_visuals where card_id=$1", [heartPublished.card_id]), 'heart');
  assert.deepEqual(await rpc('publish_card', heartCard), heartPublished, 'retry keeps the selected heart font');
  assert.equal((await saveDraft(1, { ...draft, style: { font: 'heart' } })).style.font, 'heart');
  for (const font of ['default', 'round', 'serif', 'handwriting', 'heart', 'calligraphy', 'mono'])
    assert.equal(await value('select ojjuda_note_internal.valid_card_style($1::jsonb) as value', [JSON.stringify({ font })]), true);
  await assert.rejects(() => rpc('publish_card', { ...basic('190'), p_style: { font: 'missing-font' } }), e => e.code === '22023');
  await assert.rejects(() => saveDraft(2, { ...draft, style: { font: 'heart', unexpected: true } }), e => e.code === '22023');

  // A real published style contains server-owned expiry keys. Administrators must
  // be able to edit that style without discarding or extending paid decorations.
  await db.exec(`
    alter table ojjuda_note.cards add column purge_after timestamptz;
    create function ojjuda_note_internal.is_note_moderator() returns boolean language sql stable as
      $$select auth.uid() is not null and coalesce(current_setting('test.moderator',true),'false')='true'$$;
    create table ojjuda_note_internal.moderation_actions(card_id uuid,moderator_id uuid,action text,reason text,detail jsonb);
    select set_config('test.moderator','true',false);
  `);
  const readHeartStyle = () => value('select style as value from ojjuda_note_internal.card_visuals where card_id=$1', [heartPublished.card_id]);
  const publishedStyle = await readHeartStyle();
  assert.equal(publishedStyle.shopFontUntil, null);
  assert.equal(publishedStyle.shopEffectUntil, null);
  const adminVisual = style => ({ p_card_id: heartPublished.card_id, p_style: style,
    p_photo_key: null, p_style_until: '2099-01-01T00:00:00Z', p_photo_until: null, p_reason: '하트 글꼴 수정' });
  await assert.rejects(() => rpc('admin_edit_card_visual', adminVisual(publishedStyle)), e => e.code === '22023');
  const adminSignature = 'ojjuda_note.admin_edit_card_visual(uuid,jsonb,text,timestamp with time zone,timestamp with time zone,text)';
  const adminAcl = await value('select proacl::text as value from pg_proc where oid=$1::regprocedure', [adminSignature]);
  const adminMigration = fs.readdirSync(path.join(root, 'supabase/migrations')).find(n => n.endsWith('_park_admin_style_metadata.sql'));
  await db.exec(read('supabase/migrations/' + adminMigration));
  assert.equal(await value('select proacl::text as value from pg_proc where oid=$1::regprocedure', [adminSignature]), adminAcl);
  await db.exec('set role authenticated');
  await rpc('admin_edit_card_visual', adminVisual(publishedStyle));
  await db.exec('reset role');
  assert.deepEqual(await readHeartStyle(), publishedStyle, 'a published heart card survives an administrator round trip');
  const paidStyle = { ...publishedStyle, shopFont: 'poster', shopFontUntil: '2099-02-01T00:00:00Z',
    shopSticker: 'heart', shopEffect: 'foil', shopEffectUntil: '2099-03-01T00:00:00Z' };
  await db.query('update ojjuda_note_internal.card_visuals set style=$1 where card_id=$2', [JSON.stringify(paidStyle), heartPublished.card_id]);
  await rpc('admin_edit_card_visual', adminVisual({ ...paidStyle, size: 'large',
    shopFontUntil: '2200-01-01T00:00:00Z', shopEffectUntil: '2200-01-01T00:00:00Z' }));
  assert.deepEqual(await readHeartStyle(), { ...paidStyle, size: 'large' }, 'submitted expiry changes cannot extend a decoration');
  const heartOnlyStyle = { ...paidStyle, font: 'heart', shopFont: 'none' };
  delete heartOnlyStyle.shopFontUntil;
  delete heartOnlyStyle.shopEffectUntil;
  await rpc('admin_edit_card_visual', adminVisual(heartOnlyStyle));
  const correctedStyle = await readHeartStyle();
  assert.deepEqual(correctedStyle, { ...heartOnlyStyle, shopFontUntil: null, shopEffectUntil: paidStyle.shopEffectUntil },
    'choosing the free heart font clears the old font expiry and preserves the sticker and effect expiry');
  const audit = await value("select detail as value from ojjuda_note_internal.moderation_actions where detail#>>'{visual_after,style,shopFont}'='none' and detail#>>'{visual_after,style,shopEffect}'='foil'");
  assert.deepEqual(audit.visual_after.style, correctedStyle, 'the audit records the actual stored style');
  for (const style of [{ ...correctedStyle, unexpected: true }, { ...correctedStyle, font: 'missing-font' }, null])
    await assert.rejects(() => rpc('admin_edit_card_visual', adminVisual(style)), e => e.code === '22023');
  await db.exec("select set_config('test.moderator','false',false); set role authenticated");
  await assert.rejects(() => rpc('admin_edit_card_visual', adminVisual(publishedStyle)), e => e.code === '42501');
  await db.exec('reset role');
  assert.equal(await value("select has_function_privilege('anon',$1,'execute') as value", [adminSignature]), false);
  assert.equal(await value('select ojjuda_note_internal.valid_card_style($1::jsonb) as value', [JSON.stringify(paidStyle)]), false,
    'the ordinary member validator still rejects server-owned expiry fields');
  const guestPublish = (id,body,parent=null) => rpc('publish_guest_card',{p_request_id:id,p_body:body,p_parent_id:parent});
  const guestPreview = id => rpc('guest_card_background',{p_request_id:id});
  const stored = id => value('select background_key as value from ojjuda_note.cards where id=$1',[id]);
  const legacyId = randomUUID();
  await db.exec("select set_config('request.jwt.claim.sub','',false); set role anon");
  const oldGuest = await guestPublish(legacyId,'이전에 쓴 글');
  await db.exec('reset role');
  assert.equal(await stored(oldGuest.card_id),'10');

  const guestDraw = fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith('_park_guest_random_backgrounds.sql'));
  await db.exec(read('supabase/migrations/'+guestDraw));
  assert.equal(await value("select has_table_privilege('anon','ojjuda_note.cards','INSERT') as value"),false);
  assert.equal(await value("select has_column_privilege('anon','ojjuda_traffic.settings','salt','SELECT') as value"),false);
  await db.exec('set role anon');
  assert.deepEqual(await guestPublish(legacyId,'이전에 쓴 글'),oldGuest);
  await assert.rejects(()=>guestPublish(legacyId,'다른 글'),e=>e.code==='23505');
  const samples=(await db.query(`
    select distinct on (key) request_id, key from (
      select md5(i::text)::uuid as request_id, ojjuda_note.guest_card_background(md5(i::text)::uuid)::int as key
      from generate_series(1,8192) i
    ) draws order by key,request_id`)).rows;
  assert.deepEqual(samples.map(draw=>draw.key),Array.from({length:288},(_,i)=>10+i));
  const memoId=samples.find(draw=>draw.key===190).request_id;
  const replyId=samples.find(draw=>draw.key===297).request_id;
  const memoPreview=await guestPreview(memoId);
  const memo=await guestPublish(memoId,'오늘 처음으로 핀 꽃');
  const replyPreview=await guestPreview(replyId);
  const response=await guestPublish(replyId,'반가운 봄 소식',memo.card_id);
  assert.deepEqual(await guestPublish(replyId,'반가운 봄 소식',memo.card_id),response);
  await assert.rejects(()=>guestPublish(randomUUID(),'잠시 뒤에 쓸 글'),e=>e.code==='PNS02');
  await assert.rejects(()=>rpc('publish_guest_card',{
    p_request_id:randomUUID(),p_body:'공원 글',p_background_key:'200'
  }),e=>e.code==='42883');
  await db.exec('reset role; set role authenticated');
  assert.equal(await guestPreview(memoId),memoPreview,'restoring a guest draft after login keeps its preview');
  await assert.rejects(()=>guestPublish(randomUUID(),'회원 글'),e=>e.code==='42501');
  await db.exec('reset role');
  assert.equal(await stored(memo.card_id),memoPreview);
  assert.equal(await stored(response.card_id),replyPreview);
  assert.equal(await stored(oldGuest.card_id),'10','older cards retain their original background on retry');
  assert.equal(await balance(),initialCoins-10,'guest draws and retries cost nothing');
  for(const key of ['plain','09','298',null]) await assert.rejects(()=>guestCard(key),e=>e.code==='23514');
  await db.close();
  console.log('PASS: preview-to-publish backgrounds, restored drafts, replies, attachments, events, guest defaults, watercolor rentals, free reuse, retries and access checks');
})().catch(error=>{console.error(error);process.exit(1)});
