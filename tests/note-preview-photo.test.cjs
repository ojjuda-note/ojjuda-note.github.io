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
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table ojjuda_note.cards(id uuid primary key default gen_random_uuid(),author_id uuid,
      kind text,parent_id uuid,body text,tags text[],background_key text check(background_key ~ '^([1-9][0-9]|1[0-8][0-9])$'),
      identity_mode text,archived_at timestamptz);
    create view ojjuda_note.public_cards as select * from ojjuda_note.cards where archived_at is null;
    create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins int,target_id uuid,result jsonb);
    create table ojjuda_note_internal.card_locations(card_id uuid,author_id uuid,exact_lat float8,exact_lon float8,coarse_lat float8,coarse_lon float8);
    create table ojjuda_note_internal.card_visuals(card_id uuid primary key,style jsonb);
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
  await db.exec(read('supabase/migrations/20260928075731_note_initial_photo_and_replace_only.sql'));
  const migration = fs.readdirSync(path.join(root,'supabase/migrations')).find(n=>n.endsWith('_note_preview_background.sql'));
  await db.exec(read('supabase/migrations/'+migration));
  const unlimited = read('supabase/migrations/20261009032226_note_unlimited_body.sql');
  await db.exec(unlimited.match(/CREATE OR REPLACE FUNCTION ojjuda_note_internal\.valid_note_body[\s\S]*?\$function\$\s*;/)[0]);
  const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member]);
  const rpc = (name,args) => value(`select ojjuda_note.${name}(${Object.keys(args).map((k,i)=>`${k} => $${i+1}`).join(',')}) as value`,Object.values(args));
  const basic = key => ({p_request_id:randomUUID(),p_body:'미리보기 사진 유지',p_background_key:key,p_tags:[],p_identity_mode:'anonymous',p_style:{},p_lat:37,p_lon:127,p_parent_id:null});

  // Exercise the real browser publish handler against the migrated PostgreSQL RPCs.
  const source = read('note/preview.js');
  const validCardIdSource = source.match(/^const validCardId = .*;$/m)[0];
  const publishSource = source.slice(source.indexOf('async function publishCard()'),source.indexOf('\nfunction updateAuth()'));
  const bodyPreviewSource = source.slice(source.indexOf('function noteBodyPreview('),source.indexOf('function fillCardQuote('));
  const publishFromPreview = async ({body='미리보기 사진 유지',background='42',kind='memo',parent=null,attachment=false,draftBackground=background,withDraft=true}={}) => {
    const requestId=randomUUID(), photoId=randomUUID(), attachmentPath=`${member}/${photoId}.jpg`;
    if(attachment) await db.query('insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)',[kind==='event'?'note-event-photos':'note-card-photos',attachmentPath,member]);
    const calls=[];
    const c={ console:{warn(){}},busy:false,ready:true,submit:{disabled:false},text:{value:body},composeMessage:{textContent:''},
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
      draftController:withDraft?{preparePublish:async()=>({content:{body,tags:'',kind,parent_id:parent,background_key:draftBackground}}),cancelPublish(){},published:async()=>({cleared:true})}:null,
    };
    c.noteRpc=async(name,args)=>{
      if(name==='set_my_gender')return;
      calls.push({name,args});
      const result=await rpc(name,args);
      c.identityEpoch++; // Stop after the real publication succeeds, before unrelated feed rendering.
      return result;
    };
    vm.createContext(c);vm.runInContext(validCardIdSource+'\n'+bodyPreviewSource+'\n'+publishSource,c);await vm.runInContext('publishCard()',c);
    return {calls,message:c.composeMessage.textContent,result:await value('select result as value from ojjuda_note_internal.spend_requests where request_id=$1',[requestId])};
  };
  const longBody = '[창작 웹소설] 긴 글 저장 검증\n\n' + '첫 문장과 마지막 문장을 빠짐없이 저장한다.\n'.repeat(1200);
  const longSaved = await publishFromPreview({body:longBody});
  assert.equal(longSaved.calls[0].args.p_body,longBody.trim());
  assert.equal(await value('select body as value from ojjuda_note.cards where id=$1',[longSaved.result.card_id]),longBody.trim(), 'long content reaches the real publish RPC unchanged');
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
  await db.close();
  console.log('PASS: preview-to-publish photo equality, restored drafts, replies, attachments, events, retries, legacy calls and access checks');
})().catch(error=>{console.error(error);process.exit(1)});
