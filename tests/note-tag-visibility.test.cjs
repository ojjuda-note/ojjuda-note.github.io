const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

(async () => {
  const db = new PGlite();
  const viewer = '00000000-0000-4000-8000-000000000001';
  const author = '00000000-0000-4000-8000-000000000002';
  const blocked = '00000000-0000-4000-8000-000000000003';
  await db.exec(`
    create schema auth; create schema ojjuda_note; create schema ojjuda_note_internal;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create table public.profiles(id uuid primary key,nickname text);
    create table ojjuda_note.cards(id uuid primary key default gen_random_uuid(),author_id uuid,
      kind text default 'memo',parent_id uuid,body text default 'fixture',tags text[] default '{}',
      background_key text default '10',created_at timestamptz default statement_timestamp()-interval '1 second',
      edited_at timestamptz,identity_mode text default 'anonymous',archive_due_at timestamptz,
      permanent boolean default false,archived_at timestamptz);
    create table ojjuda_note.reactions(card_id uuid,user_id uuid,kind text);
    create table ojjuda_note_internal.card_moderation(card_id uuid,hidden boolean);
    create table ojjuda_note_internal.blocks(blocker_id uuid,blocked_id uuid);
    create table ojjuda_note_internal.card_visuals(card_id uuid,style jsonb,style_until timestamptz,photo_key text,photo_until timestamptz);
    create table ojjuda_note_internal.card_locations(card_id uuid,coarse_lat double precision,coarse_lon double precision);
    create table ojjuda_note_internal.event_ads(card_id uuid,center_lat double precision,center_lon double precision,
      radius_km integer,starts_at timestamptz,ends_at timestamptz);
    create function ojjuda_note_internal.distance_m(double precision,double precision,double precision,double precision)
      returns double precision language sql immutable as $$select 0::double precision$$;
    create function ojjuda_note_internal.card_visual_for(uuid) returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create function ojjuda_note_internal.effective_archive_due(uuid) returns timestamptz language sql stable as $$select null::timestamptz$$;
  `);
  await db.exec(read('supabase/migrations/20260928071915_fix_note_public_card_visual_projection.sql'));
  await db.exec(read('supabase/migrations/20260928171304_allow_note_age_label_tag.sql'));
  const migrationName = fs.readdirSync(path.join(root,'supabase/migrations')).find(name => name.endsWith('_note_tag_search_visibility.sql'));
  assert.ok(migrationName);
  await db.exec(read(`supabase/migrations/${migrationName}`));
  const add = async (tags, extra={}) => (await db.query(`
    insert into ojjuda_note.cards(author_id,tags,kind,parent_id,archived_at)
    values($1,$2,$3,$4,$5) returning id`,
    [extra.author||author,tags,extra.kind||'memo',extra.parent||null,extra.archived||null])).rows[0].id;
  const normal = await add(['일상'],{author:viewer});
  const only = await add(['19금'],{author:viewer});
  const mixed = await add(['일상','19금']);
  await db.query("insert into ojjuda_note.reactions values($1,$3,'bookmark'),($2,$3,'bookmark')",[normal,only,viewer]);
  const hidden = await add(['19금']);
  await db.query('insert into ojjuda_note_internal.card_moderation values($1,true)',[hidden]);
  const blockedCard = await add(['19금'],{author:blocked});
  await db.query('insert into ojjuda_note_internal.blocks values($1,$2)',[viewer,blocked]);
  const archived = await add(['19금'],{archived:'2026-01-01T00:00:00Z'});
  const normalReply = await add(['일상'],{kind:'comment',parent:normal});
  const taggedReply = await add(['일상','19금'],{kind:'comment',parent:normal});
  const normalEvent = await add(['모임'],{kind:'event'});
  const taggedEvent = await add(['모임','19금'],{kind:'event'});
  await db.query(`insert into ojjuda_note_internal.event_ads
    select id,37,127,5,statement_timestamp()-interval '1 hour',statement_timestamp()+interval '1 hour'
    from ojjuda_note.cards where kind='event'`);
  await db.query(`insert into ojjuda_note.cards(author_id,tags,created_at)
    select $1,ARRAY['산책'],statement_timestamp()-make_interval(mins=>g) from generate_series(1,25) g`,[author]);
  await db.exec('insert into ojjuda_note_internal.card_locations select id,37,127 from ojjuda_note.cards');
  const ids = rows => rows.map(row=>row.id);
  const list = async (sort,offset=0,withLocation=false) => (await db.query(
    'select * from ojjuda_note.list_cards($1,$2,$3,30000,20,$4)',
    [sort,withLocation?37:null,withLocation?127:null,{offset}])).rows;
  for (const sort of ['recent','popular','nearby']) {
    const rows = await list(sort,0,sort==='nearby');
    assert.equal(rows.length,20,`${sort}: filtering happens before the page limit`);
    assert.ok(rows.every(row=>!row.tags.includes('19금')));
    const next = await list(sort,20,sort==='nearby');
    assert.equal(next.length,6);
    assert.equal(new Set([...ids(rows),...ids(next)]).size,26);
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[viewer]);
  const withEvents = await list('recent',0,true);
  assert.ok(ids(withEvents).includes(normalEvent));
  assert.ok(!ids(withEvents).includes(taggedEvent));
  const map = (await db.query('select * from ojjuda_note.list_event_map(37,127,100)')).rows;
  assert.deepEqual(map.map(row=>row.event_id),[normalEvent]);

  // Run the actual frontend query builders against Postgres fixture rows.
  class Query {
    constructor() { this.predicates=[]; this.parameters=[]; this.orders=[]; this.fields='*'; }
    select(fields) { this.fields=fields; return this; }
    where(field,op,value) { this.parameters.push(value); this.predicates.push(`${field} ${op} $${this.parameters.length}`); return this; }
    eq(field,value) { return this.where(field,'=',value); }
    contains(field,value) { return this.where(field,'@>',value); }
    not(field,op,value) { assert.equal(op,'cs'); this.parameters.push(value); this.predicates.push(`not (${field} @> $${this.parameters.length}::text[])`); return this; }
    gte(field,value) { return this.where(field,'>=',value); }
    lte(field,value) { return this.where(field,'<=',value); }
    order(field,{ascending}) { this.orders.push(`${field} ${ascending?'asc':'desc'}`); return this; }
    limit(value) { this.pageSize=value; return this; }
    async rows() { return (await db.query(`select ${this.fields} from ojjuda_note.public_cards
      ${this.predicates.length?'where '+this.predicates.join(' and '):''}
      ${this.orders.length?'order by '+this.orders.join(','):''}
      ${this.pageSize?'limit '+this.pageSize:''}`,this.parameters)).rows; }
  }
  const source=read('note/preview.js');
  const context=vm.createContext({query:()=>({from:()=>new Query()}),columns:'id,tags,kind,created_at',
    feedMode:'all',feedSort:'latest',feedTerm:'',feedSnapshot:null,feedCursor:null});
  vm.runInContext(source.slice(source.indexOf('function filterSearchOnlyTags('),source.indexOf('async function loadFeed(')),context);
  const search = async tag => { context.feedTerm=tag; return await vm.runInContext('filteredFeed()',context).rows(); };
  assert.ok((await search('')).every(row=>!row.tags.includes('19금')));
  assert.deepEqual(ids(await search('일상')),[normal], 'a shared ordinary tag must not reveal mixed-tag cards');
  assert.deepEqual(new Set(ids(await search('19금'))),new Set([only,mixed]), 'explicit tag search reveals tagged cards and preserves moderation');
  assert.ok(!ids(await search('19금')).some(id=>[hidden,blockedCard,archived].includes(id)));
  for (const mode of ['saved','mine']) {
    context.feedMode=mode;
    assert.deepEqual(ids(await search('')),[normal], `${mode}: hide tagged cards without hiding ordinary cards`);
  }
  context.feedMode='all'; context.feedTerm='';
  assert.equal(vm.runInContext("canDisplayTaggedCard({tags:['일상','19금']})",context),false);
  context.feedTerm='일상';
  assert.equal(vm.runInContext("canDisplayTaggedCard({tags:['일상','19금']})",context),false);
  context.feedTerm='19금';
  assert.equal(vm.runInContext("canDisplayTaggedCard({tags:['일상','19금']})",context),true);
  context.request=new Query().select('id,tags').eq('kind','comment').eq('parent_id',normal);
  assert.deepEqual(ids(await vm.runInContext('filterSearchOnlyTags(request)',context).rows()),[normalReply]);
  context.request=new Query().select('id,tags').eq('kind','comment').eq('parent_id',normal);
  assert.deepEqual(new Set(ids(await vm.runInContext("filterSearchOnlyTags(request,'19금')",context).rows())),new Set([normalReply,taggedReply]));
  const tagsRequest = new Query().select('tags').eq('kind','memo'); context.request=tagsRequest;
  const suggested = await vm.runInContext('filterSearchOnlyTags(request)',context).rows();
  assert.ok(suggested.every(row=>!row.tags.includes('19금')));
  await db.close();
  console.log('PASS: 19금 tag acceptance, mixed tags, explicit search, recent/popular/nearby pagination, replies, suggestions, event discovery and moderation');
})().catch(error=>{console.error(error);process.exitCode=1;});
