const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');

(async () => {
  const db = new PGlite();
  const member = randomUUID(), other = randomUUID(), guest = randomUUID();
  const legacy = randomUUID(), boundary = randomUUID(), zero = randomUUID(), rollover = randomUUID();
  const lowOverall = randomUUID(), expiryMember = randomUUID();
  const firstMigration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261112113703_tarot_reading_ten_ju.sql'), 'utf8');
  const dailyMigration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261112143703_tarot_daily_topics.sql'), 'utf8');
  const migrationDir = path.join(__dirname, '../supabase/migrations');
  const priceMigrationNames = fs.readdirSync(migrationDir).filter(name => name.endsWith('_tarot_topic_prices_30_10.sql'));
  assert.equal(priceMigrationNames.length, 1, 'exactly one topic-price migration is required');
  const priceMigration = fs.readFileSync(path.join(migrationDir, priceMigrationNames[0]), 'utf8');
  const expiryMigrationNames = fs.readdirSync(migrationDir).filter(name => name.endsWith('_tarot_24h_expiry.sql'));
  assert.equal(expiryMigrationNames.length, 1, 'exactly one 24-hour expiry migration is required');
  const expiryMigration = fs.readFileSync(path.join(migrationDir, expiryMigrationNames[0]), 'utf8');
  // Replace only the clock dependency in this isolated database. All purchase,
  // expiry, locking, permissions and ledger SQL runs unchanged.
  const installMigration = sql => db.exec(sql.replace(/\bclock_timestamp\(\)/g, 'public.tarot_test_now()'));
  const assertReply = (actual, expected, message) => {
    assert.ok(Number.isFinite(Date.parse(actual.server_now)), 'RPC responses carry a server clock');
    const { server_now, ...value } = actual;
    assert.deepEqual(value, expected, message);
  };
  const drawn = ['fool','sun','world','cups_ace','swords_king'];
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema ojjuda_note_internal;
      create function public.tarot_test_now() returns timestamptz language sql as $$select current_setting('tarot.test_now')::timestamptz$$;
      select set_config('tarot.test_now','2026-11-13T10:00:00+09:00',false);
      create table auth.users(id uuid primary key,is_anonymous boolean);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.user_private(user_id uuid primary key references auth.users(id),coins integer not null,banned boolean default false);
      create function public.is_banned(u uuid) returns boolean language sql security definer set search_path='' as $$select banned from public.user_private where user_id=u$$;
      create table ojjuda_note_internal.spend_requests(request_id uuid primary key,user_id uuid not null,kind text not null,target_id uuid,coins integer not null,result jsonb not null default '{}',created_at timestamptz not null default public.tarot_test_now());
      create table ojjuda_note_internal.photo_entitlements(request_id uuid primary key);
      create function ojjuda_note_internal.capture_paid_card_photo_entitlement() returns trigger language plpgsql as $$begin
        if new.kind='card_photo' then insert into ojjuda_note_internal.photo_entitlements values(new.request_id); end if;
        return new;
      end$$;
      create trigger spend_requests_card_photo_entitlement after insert on ojjuda_note_internal.spend_requests
        for each row execute function ojjuda_note_internal.capture_paid_card_photo_entitlement();
      grant usage on schema public,auth to anon,authenticated;
      insert into auth.users values('${member}',false),('${other}',false),('${guest}',true),('${legacy}',false),('${boundary}',false),('${zero}',false),('${rollover}',false),('${lowOverall}',false),('${expiryMember}',false);
      insert into public.user_private(user_id,coins) values('${member}',100),('${other}',9),('${guest}',20),('${legacy}',100),('${boundary}',100),('${zero}',10),('${rollover}',40),('${lowOverall}',29),('${expiryMember}',100);`);
    await installMigration(firstMigration);
    // Run the old purchase body later to model a call already in flight at release.
    const oldBuy = firstMigration.match(/create function ojjuda_tarot_internal\.buy_v1[\s\S]*?\$function\$;/)[0]
      .replace('ojjuda_tarot_internal.buy_v1', 'ojjuda_tarot_internal.legacy_buy_for_test');
    await db.exec(oldBuy);
    const days = (await db.query("select (public.tarot_test_now() at time zone 'Asia/Seoul')::date::text as today,((public.tarot_test_now() at time zone 'Asia/Seoul')::date-1)::text as yesterday")).rows[0];
    const seed = async (user, topic, createdAt) => {
      const id = randomUUID();
      const receipt = { ok: true, request_id: id, topic, drawn, price: 10, coins: 100, deck_version: 1, replayed: false };
      await db.query('insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result,created_at) values($1,$2,$3,10,$4,$5)', [id,user,'tarot_reading_v1',JSON.stringify(receipt),createdAt]);
      return id;
    };
    const legacyPreviousDay = await seed(legacy, 'overall', `${days.yesterday}T23:59:59+09:00`);
    const legacyOlder = await seed(legacy, 'overall', `${days.today}T00:01:00+09:00`);
    const legacyLatest = await seed(legacy, 'overall', `${days.today}T00:02:00+09:00`);
    await seed(boundary, 'money', '2025-01-09T14:59:59+00:00');
    await seed(boundary, 'money', '2025-01-09T15:00:00+00:00');
    const yesterdayId = await seed(rollover, 'overall', `${days.yesterday}T23:59:59+09:00`);
    await installMigration(dailyMigration);
    await installMigration(priceMigration);
    await installMigration(expiryMigration);

    const login = async id => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
      await db.exec('set role ' + (id ? 'authenticated' : 'anon'));
    };
    const buy = async (id, topic = 'overall', verify = false, expectedPrice = topic === 'overall' ? 30 : 10) =>
      (await db.query('select public.tarot_reading_buy_v2($1,$2,$3,$4) as value', [id,topic,expectedPrice,verify])).rows[0].value;
    const buyV1 = async (id, topic = 'overall', verify = false) =>
      (await db.query('select public.tarot_reading_buy_v1($1,$2,$3) as value', [id,topic,verify])).rows[0].value;
    const today = async () => (await db.query('select public.tarot_reading_today_v1() as value')).rows[0].value;
    const save = async (id, discarded = [], order = []) => (await db.query('select public.tarot_reading_save_v1($1,$2,$3) as value', [id,discarded,order])).rows[0].value;
    const adminBalance = async user => {
      await db.exec('reset role');
      return (await db.query('select coins from public.user_private where user_id=$1', [user])).rows[0].coins;
    };
    const setTime = async time => {
      await db.exec('reset role');
      await db.query("select set_config('tarot.test_now',$1,false)", [time]);
    };
    const assertExpired = (response, id, balance) => {
      assert.equal(response.ok, false);
      assert.equal(response.reason, 'expired');
      assert.equal(response.request_id, id);
      assert.equal(response.coins, balance);
      assert.ok(Number.isFinite(Date.parse(response.server_now)));
      assert.ok(Date.parse(response.reset_at) <= Date.parse(response.server_now));
      for (const key of ['drawn','receipt','result','discarded','open_order']) {
        assert.equal(Object.hasOwn(response, key), false, `expired responses cannot expose ${key}`);
      }
    };

    const security = (await db.query(`select
      (select relrowsecurity from pg_class where oid='ojjuda_tarot_internal.daily_readings'::regclass) as rls,
      has_table_privilege('authenticated','ojjuda_tarot_internal.daily_readings','SELECT') as direct_read,
      has_table_privilege('authenticated','ojjuda_tarot_internal.daily_readings','UPDATE') as direct_write,
      has_function_privilege('authenticated','ojjuda_tarot_internal.receipt_v1(uuid,integer,boolean,boolean)','EXECUTE') as formatter,
      has_function_privilege('authenticated','ojjuda_tarot_internal.receipt_at_v1(uuid,integer,boolean,boolean,timestamptz)','EXECUTE') as dated_formatter,
      has_function_privilege('anon','public.tarot_reading_buy_v1(uuid,text,boolean)','EXECUTE') as anon_buy_v1,
      has_function_privilege('anon','public.tarot_reading_buy_v2(uuid,text,integer,boolean)','EXECUTE') as anon_buy_v2,
      has_function_privilege('anon','ojjuda_tarot_internal.buy_v2(uuid,text,integer,boolean)','EXECUTE') as anon_internal_buy,
      has_function_privilege('authenticated','public.tarot_reading_buy_v2(uuid,text,integer,boolean)','EXECUTE') as member_buy_v2,
      has_function_privilege('anon','public.tarot_reading_today_v1()','EXECUTE') as anon_today,
      has_function_privilege('anon','public.tarot_reading_save_v1(uuid,integer[],integer[])','EXECUTE') as anon_save`)).rows[0];
    assert.deepEqual(security, {
      rls: true, direct_read: false, direct_write: false, formatter: false, dated_formatter: false,
      anon_buy_v1: false, anon_buy_v2: false, anon_internal_buy: false, member_buy_v2: true,
      anon_today: false, anon_save: false
    });
    const boundaryDays = (await db.query('select reading_day::text as day from ojjuda_tarot_internal.daily_readings where user_id=$1 order by reading_day', [boundary])).rows.map(x => x.day);
    assert.deepEqual(boundaryDays, ['2025-01-09','2025-01-10'], 'KST midnight is 15:00 UTC, not UTC midnight');
    const existingCount = (await db.query('select count(*)::int as count from ojjuda_note_internal.spend_requests where user_id=$1', [legacy])).rows[0].count;
    assert.equal(existingCount, 3, 'migration preserves every previously paid ledger entry');

    await login(null);
    await assert.rejects(() => buy(randomUUID()), /permission denied/);
    await assert.rejects(() => buyV1(randomUUID()), /permission denied/);
    await assert.rejects(() => today(), /permission denied/);
    await assert.rejects(() => save(randomUUID()), /permission denied/);
    await login(member);
    await assert.rejects(() => db.exec('update public.user_private set coins=999'), /permission denied/);
    await assert.rejects(() => db.exec('select * from ojjuda_note_internal.spend_requests'), /permission denied/);
    await assert.rejects(() => db.exec('select * from ojjuda_tarot_internal.daily_readings'), /permission denied/);
    await assert.rejects(() => db.query('select ojjuda_tarot_internal.receipt_v1($1,99,true,true)', [legacyLatest]), /permission denied/);
    await assert.rejects(() => db.query('select ojjuda_tarot_internal.receipt_at_v1($1,99,true,true,now())', [legacyLatest]), /permission denied/);
    assert.deepEqual((await today()).readings, []);

    // A stale/missing quote must not charge the wallet, reserve the request ID,
    // or consume today's topic. The same ID can be retried after a new quote.
    const overallId = randomUUID();
    for (const expectedPrice of [10, 99, null]) {
      assertReply(await buy(overallId, 'overall', false, expectedPrice), {
        ok: false, reason: 'price_changed', coins: 100, price: 30
      });
      const unchanged = await today();
      assert.equal(unchanged.coins, 100);
      assert.deepEqual(unchanged.readings, []);
    }
    assertReply(await buyV1(overallId, 'overall'), {
      ok: false, reason: 'price_changed', coins: 100, price: 30
    }, 'cached 10-ju pages must not silently charge 30 ju');
    assert.equal((await buy(overallId, 'overall', true, null)).reason, 'not_found', 'verification never creates a purchase or demands a current quote');
    assert.equal((await buyV1(overallId, 'overall', true)).reason, 'not_found');

    const id = randomUUID();
    const first = await buy(id, 'love');
    assert.equal(first.ok, true);
    assert.equal(first.price, 10);
    assert.equal(first.coins, 90);
    assert.equal(first.drawn.length, 5);
    assert.equal(new Set(first.drawn).size, 5);
    assert.equal(first.topic, 'love');
    assert.equal(first.reading_day, days.today);
    assert.equal(first.daily_replayed, false);
    assert.deepEqual(first.discarded, []);
    assert.deepEqual(first.open_order, []);
    assert.equal(Date.parse(first.reset_at), Date.parse(first.created_at) + 86400000);
    assert.equal(Date.parse(first.server_now), Date.parse(first.created_at));
    for (let retry = 0; retry < 6; retry++) {
      const same = await buy(id, 'love', retry % 2 === 0, [10, 99, null][retry % 3]);
      assert.equal(same.coins, 90);
      assert.equal(same.price, 10);
      assert.equal(same.replayed, true);
      assert.deepEqual(same.drawn, first.drawn);
    }
    const repeats = await Promise.all(Array.from({ length: 8 }, () => buy(randomUUID(), 'love')));
    assert.ok(repeats.every(x => x.request_id === id && x.coins === 90 && x.daily_replayed));
    assert.equal((await buy(randomUUID(), 'love', true)).request_id, id);
    assert.equal((await buy(id, 'money')).reason, 'request_conflict');
    assert.equal((await buy(randomUUID(), 'work', true)).reason, 'not_found');
    assert.equal((await buy(null)).reason, 'invalid');
    assert.equal((await buy(randomUUID(), 'fake')).reason, 'invalid');
    assert.equal((await buy(randomUUID(), 'work', null)).reason, 'invalid');
    const memberReceipts = { love: first };
    for (const [topic,price,balance] of [['overall',30,60],['money',10,50],['work',10,40]]) {
      const requestId = topic === 'overall' ? overallId : randomUUID();
      if (topic !== 'overall') {
        const wrongQuote = await buy(requestId, topic, false, 30);
        assert.equal(wrongQuote.reason, 'price_changed');
        assert.equal(wrongQuote.price, 10, 'the displayed quote cannot set a topic price');
        assert.equal(wrongQuote.coins, balance + price);
      }
      const receipt = await buy(requestId, topic);
      assert.equal(receipt.request_id, requestId, 'rejected quote does not reserve the request ID');
      assert.equal(receipt.coins, balance, 'each topic has its own price and daily use');
      assert.equal(receipt.price, price);
      assert.equal(receipt.topic, topic);
      memberReceipts[topic] = receipt;
    }
    for (const expectedPrice of [10, 99, null]) {
      for (const requestId of [overallId, randomUUID()]) {
        const replay = await buy(requestId, 'overall', false, expectedPrice);
        assert.equal(replay.request_id, overallId);
        assert.equal(replay.price, 30);
        assert.equal(replay.coins, 40);
        assert.deepEqual(replay.drawn, memberReceipts.overall.drawn);
        assert.equal(replay.daily_replayed, true);
      }
    }
    assert.equal((await buyV1(randomUUID(), 'overall')).request_id, overallId, 'cached pages may freely reopen a 30-ju purchase');
    const overview = await today();
    assert.equal(overview.coins, 40);
    assert.deepEqual(overview.readings.map(x => x.topic).sort(), ['love','money','overall','work']);
    assert.ok(overview.readings.every(x => x.request_id && x.drawn.length === 5 && x.reading_day === days.today && x.reset_at && Array.isArray(x.discarded) && Array.isArray(x.open_order)));
    assert.deepEqual(Object.fromEntries(overview.readings.map(x => [x.topic,x.price])), { love: 10, money: 10, overall: 30, work: 10 });

    assert.deepEqual((await save(id, [4], [])).discarded, [4]);
    assert.deepEqual((await save(id, [4,1], [])).discarded, [4,1]);
    assert.deepEqual((await save(id, [4,1], [3])).open_order, [3]);
    const complete = await save(id, [4,1], [3,0,2]);
    assert.deepEqual(complete.open_order, [3,0,2]);
    assert.equal(complete.coins, 40);
    const stale = await save(id, [4], []);
    assert.deepEqual(stale.discarded, [4,1]);
    assert.deepEqual(stale.open_order, [3,0,2], 'late prefix saves never erase accepted choices');
    for (const [discarded,order] of [[[4,2],[]], [[1,4],[]], [[4,1],[0]]]) {
      const conflict = await save(id, discarded, order);
      assert.equal(conflict.reason, 'progress_conflict');
      assert.deepEqual(conflict.receipt.open_order, [3,0,2]);
      assert.deepEqual(conflict.receipt.discarded, [4,1]);
    }
    for (const [discarded,order] of [[[4,4],[]], [[4,1,2],[]], [[4],[0]], [[4,1],[4]], [[4,1],[3,3]], [[5],[]], [[-1],[]], [[null],[]]]) {
      assert.equal((await save(id,discarded,order)).reason, 'invalid');
    }
    assert.equal((await save(id,null,[])).reason, 'invalid');
    assert.equal((await db.query("select public.tarot_reading_save_v1($1,'[0:1]={4,1}'::integer[],'{}'::integer[]) as value", [id])).rows[0].value.reason, 'invalid');
    assert.equal((await db.query("select public.tarot_reading_save_v1($1,'{{4,1}}'::integer[],'{}'::integer[]) as value", [id])).rows[0].value.reason, 'invalid');
    const reopened = await buy(randomUUID(), 'love');
    assert.deepEqual(reopened.drawn, first.drawn);
    assert.deepEqual(reopened.discarded, [4,1]);
    assert.deepEqual(reopened.open_order, [3,0,2]);
    assert.deepEqual((await today()).readings.find(x => x.topic === 'love').open_order, [3,0,2]);

    await login(other);
    assert.equal((await buy(id, 'love')).reason, 'request_conflict');
    assert.equal((await save(id,[4,1],[3])).reason, 'not_found');
    assert.deepEqual((await today()).readings, []);
    const insufficient = await buy(randomUUID());
    assert.equal(insufficient.reason, 'coins');
    assert.equal(insufficient.coins, 9);
    assert.equal(insufficient.price, 30);

    await login(lowOverall);
    const lowId = randomUUID();
    assertReply(await buy(lowId, 'overall'), { ok: false, reason: 'coins', coins: 29, price: 30 });
    assertReply(await buy(lowId, 'overall', false, 10), { ok: false, reason: 'price_changed', coins: 29, price: 30 });
    assert.deepEqual((await today()).readings, []);
    assert.equal(await adminBalance(lowOverall), 29, 'failed purchases leave the 29-ju wallet unchanged');
    await db.query('update public.user_private set coins=30 where user_id=$1', [lowOverall]);
    await login(lowOverall);
    const afterTopUp = await buy(lowId, 'overall');
    assert.equal(afterTopUp.request_id, lowId);
    assert.equal(afterTopUp.price, 30);
    assert.equal(afterTopUp.coins, 0);
    assert.equal((await buy(lowId, 'overall', false, null)).coins, 0, 'retry after success does not buy again');
    assert.equal((await buyV1(randomUUID(), 'overall')).request_id, lowId, 'zero-balance cached pages still reopen the paid topic');

    await login(zero);
    const lastTen = await buy(randomUUID(), 'money');
    assert.equal(lastTen.coins, 0);
    assert.equal((await buy(randomUUID(), 'money')).request_id, lastTen.request_id, 'zero balance still permits free reopening');
    assert.equal((await buy(randomUUID(), 'money', false, null)).price, 10, 'free replay does not require a fresh quote');
    assert.equal((await buy(randomUUID(), 'love')).reason, 'coins');

    await login(legacy);
    const backfilled = await buy(randomUUID(), 'overall');
    assert.equal(backfilled.request_id, legacyLatest, 'latest valid pre-release reading is the daily canonical receipt');
    assert.equal(backfilled.coins, 100);
    assert.equal(backfilled.price, 10, 'existing overall receipts retain their original 10-ju price');
    assert.deepEqual((await today()).readings.map(receipt => receipt.request_id), [legacyLatest], 'overlapping old calendar-day canonical receipts select the newest active one');
    assert.equal((await buy(legacyPreviousDay, 'overall', true)).request_id, legacyPreviousDay, 'an older canonical UUID keeps its own paid 24-hour window');
    for (const expectedPrice of [10, 30, 99, null]) {
      const historical = await buy(legacyOlder, 'overall', true, expectedPrice);
      assert.equal(historical.request_id, legacyOlder, 'grandfathered exact receipt IDs stay readable without charging');
      assert.equal(historical.price, 10);
      assert.equal(historical.coins, 100);
      assert.deepEqual(historical.drawn, drawn);
      const dailyLegacy = await buy(randomUUID(), 'overall', false, expectedPrice);
      assert.equal(dailyLegacy.request_id, legacyLatest);
      assert.equal(dailyLegacy.price, 10);
      assert.equal(dailyLegacy.coins, 100);
    }
    assert.equal((await buyV1(randomUUID(), 'overall')).price, 10);
    const legacyFirst = (await db.query('select ojjuda_tarot_internal.legacy_buy_for_test($1,$2,false) as value', [randomUUID(),'love'])).rows[0].value;
    assert.equal(legacyFirst.coins, 90);
    assert.equal((await buy(randomUUID(), 'love')).request_id, legacyFirst.request_id, 'an in-flight old purchase is captured by the new guard');
    await assert.rejects(() => db.query('select ojjuda_tarot_internal.legacy_buy_for_test($1,$2,false)', [randomUUID(),'love']), /tarot_active_limit/);
    assert.equal(await adminBalance(legacy), 90, 'the duplicate legacy call rolls back its attempted wallet debit');

    await login(boundary);
    const cachedWork = await buyV1(randomUUID(), 'work');
    assert.equal(cachedWork.price, 10, 'cached v1 pages can still buy unchanged 10-ju topics');
    assert.equal(cachedWork.coins, 90);
    assert.equal((await buy(randomUUID(), 'work')).request_id, cachedWork.request_id);

    await login(rollover);
    const crossMidnight = await today();
    assert.equal(crossMidnight.reading_day, days.today, 'overview date is still the current KST date');
    assert.deepEqual(crossMidnight.readings.map(receipt => receipt.request_id), [yesterdayId], 'an unexpired prior-day payment stays available across midnight');
    const nextDay = await buy(randomUUID(), 'overall');
    assert.equal(nextDay.request_id, yesterdayId);
    assert.equal(nextDay.reading_day, days.yesterday);
    assert.equal(nextDay.price, 10);
    assert.equal(nextDay.coins, 40, 'cross-midnight replay is free');
    const oldRetry = await buy(yesterdayId, 'overall', false, null);
    assert.equal(oldRetry.reading_day, days.yesterday);
    assert.equal(oldRetry.price, 10, 'yesterday retains its original price after the change');
    assert.equal(oldRetry.coins, 40, 'late retry of yesterday never becomes a new charge');
    assert.equal((await buy(randomUUID(), 'overall')).request_id, nextDay.request_id);
    await assert.rejects(() => db.query('select ojjuda_tarot_internal.legacy_buy_for_test($1,$2,false)', [randomUUID(),'overall']), /tarot_active_limit/);
    assert.equal(await adminBalance(rollover), 40, 'an in-flight old calendar-day buy rolls back its attempted cross-midnight debit');
    await login(rollover);
    await db.exec("set timezone='America/Los_Angeles'");
    assert.equal((await today()).reading_day, days.today, 'database session timezone does not move the KST date');
    await db.exec("set timezone='UTC'");

    // Paid windows are independent by topic, and exact expiry is inclusive.
    await login(expiryMember);
    const expiringId = randomUUID();
    const paidAtTen = await buy(expiringId, 'overall');
    assert.equal(paidAtTen.coins, 70);
    const originalProgress = await save(expiringId, [0,1], [4,2,3]);
    const expiryAtTen = '2026-11-14T10:00:00+09:00';
    assert.equal(Date.parse(paidAtTen.reset_at), Date.parse(expiryAtTen));
    await setTime('2026-11-13T11:00:00+09:00');
    await login(expiryMember);
    const laterTopic = await buy(randomUUID(), 'love');
    assert.equal(laterTopic.coins, 60);
    assert.equal(Date.parse(laterTopic.reset_at), Date.parse('2026-11-14T11:00:00+09:00'));
    assert.equal(Date.parse((await today()).reset_at), Date.parse(expiryAtTen), 'status wakes at the nearest active expiry');

    await setTime('2026-11-14T00:00:00+09:00');
    await login(expiryMember);
    const midnightStatus = await today();
    assert.equal(midnightStatus.reading_day, '2026-11-14');
    assert.ok(midnightStatus.readings.every(receipt => receipt.reading_day === '2026-11-13'));
    assert.equal((await buy(randomUUID(), 'overall')).request_id, expiringId);
    assert.equal((await buy(expiringId, 'overall', true)).coins, 60);

    await setTime('2026-11-14T09:59:59.999999+09:00');
    await login(expiryMember);
    assert.equal((await buy(expiringId, 'overall', true)).ok, true, 'receipt remains readable one microsecond before expiry');
    assert.equal((await save(expiringId, [0,1], [4,2,3])).ok, true);
    assert.equal((await today()).readings.length, 2);

    await setTime(expiryAtTen);
    await login(expiryMember);
    for (const verify of [false,true]) assertExpired(await buy(expiringId, 'overall', verify), expiringId, 60);
    assertExpired(await buyV1(expiringId, 'overall', true), expiringId, 60);
    assertExpired(await save(expiringId, [0,1], [4,2,3]), expiringId, 60);
    assertExpired(await save(expiringId, [1,0], [4,2,3]), expiringId, 60);
    const stillActive = await today();
    assert.deepEqual(stillActive.readings.map(receipt => receipt.request_id), [laterTopic.request_id], 'only the expired topic disappears');
    assert.equal(Date.parse(stillActive.reset_at), Date.parse(laterTopic.reset_at));
    assert.ok(stillActive.readings.every(receipt => receipt.ok && receipt.server_now === stillActive.server_now));
    assert.equal((await buy(randomUUID(), 'overall', true)).reason, 'not_found', 'verification cannot start a replacement purchase');
    const replacementId = randomUUID();
    assert.equal((await buy(replacementId, 'overall', false, 10)).reason, 'price_changed');
    const replacement = await buy(replacementId, 'overall');
    assert.equal(replacement.request_id, replacementId);
    assert.equal(replacement.coins, 30);
    assert.equal(replacement.replayed, false);
    assert.equal(Date.parse(replacement.reset_at), Date.parse(expiryAtTen)+86400000);
    // PGlite serializes these calls; this verifies retry idempotency and debit
    // counts, while cross-session lock ordering is separately reviewed.
    const retriedReplacement = await Promise.all(Array.from({ length: 8 }, (_, index) => buy(index % 2 ? replacementId : randomUUID(), 'overall')));
    assert.ok(retriedReplacement.every(receipt => receipt.request_id === replacementId && receipt.coins === 30));
    for (const verify of [false,true]) assertExpired(await buy(expiringId, 'overall', verify), expiringId, 30);
    assertExpired(await save(expiringId, [0,1], [4,2,3]), expiringId, 30);
    await db.exec('reset role');
    const storedOld = (await db.query('select discarded,open_order,created_at from ojjuda_tarot_internal.daily_readings where request_id=$1', [expiringId])).rows[0];
    assert.deepEqual(storedOld.discarded, originalProgress.discarded);
    assert.deepEqual(storedOld.open_order, originalProgress.open_order);
    assert.equal(Date.parse(storedOld.created_at), Date.parse(paidAtTen.created_at), 'expiry does not rewrite the paid timestamp');
    assert.equal((await db.query('select count(*)::int as n from ojjuda_note_internal.spend_requests where user_id=$1', [expiryMember])).rows[0].n, 3, 'only two initial topics and one explicit replacement were charged');
    await login(legacy);
    assertExpired(await buy(legacyOlder, 'overall', true), legacyOlder, 90);
    assertExpired(await save(legacyOlder), legacyOlder, 90);

    await setTime('2026-11-15T10:00:00+09:00');
    await login(expiryMember);
    const emptyStatus = await today();
    assert.deepEqual(emptyStatus.readings, []);
    assert.equal(Date.parse(emptyStatus.reset_at)-Date.parse(emptyStatus.server_now), 86400000, 'an empty status falls back to server now plus exactly 24 hours');
    assertExpired(await buy(replacementId, 'overall', false), replacementId, 30);

    await login(guest);
    assert.equal((await buy(randomUUID())).reason, 'member_required');
    assert.equal((await today()).reason, 'member_required');
    assert.equal((await save(id)).reason, 'member_required');
    await db.exec('reset role');
    await db.query('update public.user_private set banned=true where user_id=$1', [member]);
    await login(member);
    assert.equal((await buy(id, 'love')).reason, 'banned');
    assert.equal((await today()).reason, 'banned');
    assert.equal((await save(id)).reason, 'banned');

    await db.exec('reset role');
    const unrelated = randomUUID();
    await db.query("insert into ojjuda_note_internal.spend_requests(request_id,user_id,kind,coins,result) values($1,$2,'card_photo',7,'{}')", [unrelated,legacy]);
    assert.equal((await db.query('select count(*)::int as n from ojjuda_note_internal.photo_entitlements where request_id=$1', [unrelated])).rows[0].n, 1, 'the existing photo entitlement trigger still works');
    assert.equal((await db.query('select count(*)::int as n from ojjuda_tarot_internal.daily_readings where request_id=$1', [unrelated])).rows[0].n, 0, 'non-tarot ledger kinds are untouched');
    const memberLedger = (await db.query("select kind,coins,result->>'topic' as topic,(result->>'price')::integer as price from ojjuda_note_internal.spend_requests where user_id=$1", [member])).rows;
    assert.equal(memberLedger.length, 4);
    assert.ok(memberLedger.every(row => row.kind === 'tarot_reading_v1' && row.coins === (row.topic === 'overall' ? 30 : 10) && row.price === row.coins));
    assert.equal(await adminBalance(member), 40);
    const legacyPrices = (await db.query('select coins,(result->>\'price\')::integer as price from ojjuda_note_internal.spend_requests where request_id in ($1,$2,$3)', [legacyOlder,legacyLatest,yesterdayId])).rows;
    assert.ok(legacyPrices.every(row => row.coins === 10 && row.price === 10), 'the migration never reprices historical ledger rows');
    assert.equal((await db.query('select count(*)::int as n from ojjuda_note_internal.spend_requests where user_id=$1', [lowOverall])).rows[0].n, 1, 'rejected and retried requests create only one paid ledger row');
    console.log('PASS: overall 30 ju; love/money/work 10 ju; 100-to-40 wallet; stale, forged and null quote rejection; safe v1 compatibility and same-ID retry.');
    console.log('PASS: exact 24-hour expiry, microsecond boundary, cross-midnight free replay, topic-specific deadlines and new-UUID repayment.');
    console.log('PASS: expired get/verify/save payload rejection, no automatic replacement charge, idempotent queued retries, server clocks and immutable history.');
    console.log('PASS: durable ordered choices, stale saves, cross-device conflicts, invalid selections, account scope, guest/ban restrictions, RLS and function permissions.');
    console.log('PASS: latest legacy receipt backfill, in-flight legacy purchase guard with wallet rollback, and unrelated entitlement trigger preserved.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
