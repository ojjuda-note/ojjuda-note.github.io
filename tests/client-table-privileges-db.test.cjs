const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261021080853_restrict_client_maintenance_privileges.sql'), 'utf8');
(async () => {
  const db = new PGlite();
  const value = async (query, args = []) => (await db.query(query, args)).rows[0].value;
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema ojjuda_note;
      grant usage on schema public, ojjuda_note to anon, authenticated, service_role;
      alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges for role postgres in schema ojjuda_note grant all on tables to anon, authenticated, service_role;
      create table public.fixture_profiles(id text primary key, bio text, locked text);
      insert into public.fixture_profiles values ('alice','A','private A'),('bob','B','private B');
      alter table public.fixture_profiles enable row level security;
      create policy own_profile on public.fixture_profiles to authenticated
        using (id = current_setting('fixture.user',true)) with check (id = current_setting('fixture.user',true));
      revoke update on public.fixture_profiles from authenticated;
      grant update(bio) on public.fixture_profiles to authenticated;
      create table ojjuda_note.fixture_cards(id integer primary key, body text);
      insert into ojjuda_note.fixture_cards values (1,'public card');
      alter table ojjuda_note.fixture_cards enable row level security;
      create policy read_cards on ojjuda_note.fixture_cards for select to anon, authenticated using(true);
      create function public.fixture_card_count() returns bigint language sql security definer set search_path=''
        as 'select count(*) from ojjuda_note.fixture_cards';
    `);
    await db.exec('begin; set local role anon; truncate public.fixture_profiles; rollback;');
    assert.equal(await value('select count(*)::int as value from public.fixture_profiles'), 2, 'fixture proves the old TRUNCATE grant bypasses RLS without losing data');
    await db.exec(sql);
    await db.exec(sql); // Retry-safe deployment.
    for (const table of ['public.fixture_profiles','ojjuda_note.fixture_cards']) {
      for (const role of ['anon','authenticated']) {
        for (const privilege of ['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) {
          assert.equal(await value('select has_table_privilege($1,$2,$3) as value',[role,table,privilege]),false);
        }
      }
      for (const privilege of ['TRUNCATE','TRIGGER','REFERENCES','MAINTAIN']) assert.equal(await value("select has_table_privilege('service_role',$1,$2) as value",[table,privilege]),true);
    }
    await db.exec('set role anon');
    assert.equal(await value('select count(*)::int as value from public.fixture_profiles'),0);
    assert.equal(await value('select body as value from ojjuda_note.fixture_cards'),'public card');
    assert.equal(await value('select public.fixture_card_count() as value'),1);
    await assert.rejects(db.exec('truncate public.fixture_profiles'),/permission denied/);
    await db.exec("reset role; select set_config('fixture.user','alice',false); set role authenticated");
    assert.equal(await value('select count(*)::int as value from public.fixture_profiles'),1);
    await db.exec("update public.fixture_profiles set bio='updated' where id='alice'");
    assert.equal(await value("select bio as value from public.fixture_profiles where id='alice'"),'updated');
    await assert.rejects(db.exec("update public.fixture_profiles set locked='not allowed' where id='alice'"),/permission denied/);
    await assert.rejects(db.exec("insert into public.fixture_profiles values ('other','X','X')"),/row-level security/);
    await db.exec("delete from public.fixture_profiles where id='bob'; reset role");
    assert.equal(await value('select count(*)::int as value from public.fixture_profiles'),2);
    for (const schema of ['public','ojjuda_note']) {
      await db.exec(`create table ${schema}.fixture_future(id int)`);
      for (const role of ['anon','authenticated']) {
        for (const privilege of ['TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) assert.equal(await value('select has_table_privilege($1,$2,$3) as value',[role,schema+'.fixture_future',privilege]),false);
        for (const privilege of ['SELECT','INSERT','UPDATE','DELETE']) assert.equal(await value('select has_table_privilege($1,$2,$3) as value',[role,schema+'.fixture_future',privilege]),true);
      }
    }
    console.log('PASS: client table maintenance denied; existing rows, RLS, own profile writes, column restrictions, public card reads, definer RPC and service privileges preserved; future migration tables and retry covered');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
