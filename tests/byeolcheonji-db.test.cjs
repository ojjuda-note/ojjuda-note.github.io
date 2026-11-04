const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('private vacancy tables deny browser roles and delete device records with member account', async () => {
  const db = new PGlite();
  try {
    // Platform extensions are replaced only in this isolated schema test.
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create table auth.users(id uuid primary key);
      create schema vault; create table vault.secrets(id uuid default gen_random_uuid(),secret text,name text unique);
      create view vault.decrypted_secrets as select secret as decrypted_secret,name from vault.secrets;
      create function vault.create_secret(secret text,name text,description text) returns uuid language plpgsql as $$
        declare result uuid:=gen_random_uuid(); begin insert into vault.secrets values(result,secret,name); return result; end$$;
      create schema extensions;
      create function extensions.gen_random_bytes(n integer) returns bytea language sql as $$ select decode(repeat('ab',n),'hex') $$;
      create function extensions.hmac(data text,key text,kind text) returns bytea language sql as $$ select decode(repeat('ef',32),'hex') $$;
      create schema net;
      create table net.fixture_requests(id bigint generated always as identity,url text,headers jsonb,body jsonb);
      create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language plpgsql as $$
        declare result bigint; begin insert into net.fixture_requests(url,headers,body) values(url,headers,body) returning id into result; return result; end$$;
    `);
    const source = fs.readFileSync(path.join(__dirname, '../supabase/functions/byeolcheonji/schema.sql'), 'utf8');
    await db.exec(source.replace('create extension if not exists pg_net;', ''));
    const tables = (await db.query(`select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='byeolcheonji_internal' and c.relkind='r'`)).rows;
    assert.equal(tables.length, 4);
    for (const table of tables) {
      assert.equal(table.relrowsecurity, true);
      for (const role of ['anon', 'authenticated']) {
        const [privileges] = (await db.query(`select has_schema_privilege($1,'byeolcheonji_internal','usage') as schema,
          has_table_privilege($1,$2,'select,insert,update,delete') as table`, [role, `byeolcheonji_internal.${table.relname}`])).rows;
        assert.deepEqual(privileges, { schema: false, table: false });
      }
    }
    for (const role of ['anon', 'authenticated']) {
      assert.equal((await db.query(`select has_function_privilege($1,'byeolcheonji_internal.dispatch(boolean)','execute') as allowed`, [role])).rows[0].allowed, false);
    }
    const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users(id) values($1),($2)', [a, b]);
    const insert = `insert into byeolcheonji_internal.subscriptions(user_id,device_hash,endpoint,keys,filters) values($1,$2,$3,'{}',$4::jsonb)`;
    await db.query(insert, [a, 'a'.repeat(64), 'https://fcm.googleapis.com/device-a', JSON.stringify({ dateMode: 'weekend', guests: 4 })]);
    await assert.rejects(() => db.query(insert, [b, 'b'.repeat(64), 'https://fcm.googleapis.com/device-a', JSON.stringify({ dateMode: 'all', guests: 'all' })]), /unique/);
    await assert.rejects(() => db.query(insert, [a, 'c'.repeat(64), 'https://fcm.googleapis.com/device-c', JSON.stringify({ dateMode: 'all', guests: 3 })]), /check constraint/);
    await assert.rejects(() => db.query(insert, [a, 'c'.repeat(64), 'https://fcm.googleapis.com/device-c', '{}']), /check constraint/);
    await db.query('delete from auth.users where id=$1', [a]);
    assert.equal((await db.query('select count(*)::integer as count from byeolcheonji_internal.subscriptions')).rows[0].count, 0);

    // One-use scheduler nonce uniqueness and owner-aware lease release.
    const first = '33333333-3333-4333-8333-333333333333', second = '44444444-4444-4444-8444-444444444444';
    await db.query(`insert into byeolcheonji_internal.nonces(nonce) values($1)`, [first]);
    const replay = await db.query(`insert into byeolcheonji_internal.nonces(nonce) values($1) on conflict do nothing returning nonce`, [first]);
    assert.equal(replay.rows.length, 0);
    await db.query(`update byeolcheonji_internal.runtime set delivery_token=$1,delivery_lease_until=now()+interval '180 seconds' where singleton`, [second]);
    await db.query(`update byeolcheonji_internal.runtime set delivery_lease_until='-infinity' where singleton and delivery_token=$1`, [first]);
    assert.equal((await db.query(`select delivery_lease_until>now() as held from byeolcheonji_internal.runtime`)).rows[0].held, true);

    await db.query('select byeolcheonji_internal.dispatch(true)');
    const [scheduled] = (await db.query('select url,headers,body from net.fixture_requests')).rows;
    assert.equal(scheduled.url, 'https://ziezbdjofcugznowiuda.supabase.co/functions/v1/byeolcheonji/tick');
    assert.equal(scheduled.headers['X-Byeol-Probe'], '1');
    assert.match(scheduled.headers['X-Byeol-Time'], /^\d{10}$/);
    assert.equal(Object.hasOwn(scheduled.headers, 'Authorization'), false);
    assert.deepEqual(scheduled.body, {});
  } finally { await db.close(); }
});
