const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  const member = randomUUID(), other = randomUUID(), guest = randomUUID();
  const migration = path.join(__dirname, '../supabase/migrations/20261112113703_tarot_reading_ten_ju.sql');
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema ojjuda_note_internal;
      create table auth.users(id uuid primary key,is_anonymous boolean);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.user_private(user_id uuid primary key references auth.users(id),coins integer not null,banned boolean default false);
      create function public.is_banned(u uuid) returns boolean language sql security definer set search_path='' as $$select banned from public.user_private where user_id=u$$;
      create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid,kind text,coins integer,result jsonb);
      grant usage on schema public,auth to anon,authenticated;
      insert into auth.users values('${member}',false),('${other}',false),('${guest}',true);
      insert into public.user_private(user_id,coins) values('${member}',100),('${other}',9),('${guest}',20);`);
    await db.exec(fs.readFileSync(migration, 'utf8'));
    const login = async id => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
      await db.exec('set role ' + (id ? 'authenticated' : 'anon'));
    };
    const buy = async (id, topic = 'overall', verify = false) => (await db.query('select public.tarot_reading_buy_v1($1,$2,$3) as value', [id,topic,verify])).rows[0].value;
    await login(null);
    await assert.rejects(() => buy(randomUUID()), /permission denied/);
    await login(member);
    await assert.rejects(() => db.exec('update public.user_private set coins=999'), /permission denied/);
    await assert.rejects(() => db.exec('select * from ojjuda_note_internal.spend_requests'), /permission denied/);
    const id = randomUUID();
    const first = await buy(id, 'love');
    assert.equal(first.ok, true);
    assert.equal(first.price, 10);
    assert.equal(first.coins, 90);
    assert.equal(first.drawn.length, 5);
    assert.equal(new Set(first.drawn).size, 5);
    assert.equal(first.topic, 'love');
    for (let retry = 0; retry < 6; retry++) {
      const same = await buy(id, 'love', retry % 2 === 0);
      assert.equal(same.coins, 90);
      assert.equal(same.replayed, true);
      assert.deepEqual(same.drawn, first.drawn);
    }
    assert.equal((await buy(id, 'money')).reason, 'request_conflict');
    assert.equal((await buy(randomUUID(), 'work', true)).reason, 'not_found');
    assert.equal((await buy(null)).reason, 'invalid');
    assert.equal((await buy(randomUUID(), 'fake')).reason, 'invalid');
    assert.equal((await buy(randomUUID(), 'work')).coins, 80);
    await login(other);
    assert.equal((await buy(id, 'love')).reason, 'request_conflict');
    const insufficient = await buy(randomUUID());
    assert.equal(insufficient.reason, 'coins');
    assert.equal(insufficient.coins, 9);
    await login(guest);
    assert.equal((await buy(randomUUID())).reason, 'member_required');
    await db.exec('reset role');
    await db.query('update public.user_private set banned=true where user_id=$1', [member]);
    await login(member);
    assert.equal((await buy(randomUUID())).reason, 'banned');
    await db.exec('reset role');
    const ledger = (await db.query('select kind,coins from ojjuda_note_internal.spend_requests')).rows;
    assert.equal(ledger.length, 2);
    assert.ok(ledger.every(row => row.kind === 'tarot_reading_v1' && row.coins === 10));
    console.log('PASS: 10-ju purchase, five unique cards, identical retries, read-only verification, insufficient funds, account scope, anonymous/ban restrictions, protected wallet and receipts.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
