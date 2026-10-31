const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs'),path = require('node:path'),vm = require('node:vm');
const { createFixture, read, migrationName } = require('./monthly-game-rankings-fixture.cjs');
const hash = token => createHash('sha256').update(token).digest('hex');

(async () => {
 const {db,clock,claim,actor} = await createFixture();
 try {
  const a='10000000-0000-4000-8000-000000000001',b='20000000-0000-4000-8000-000000000002',minor=randomUUID(),banned=randomUUID();
  await actor(a,'Alpha');await actor(b,'Beta');await actor(minor,'Minor','2015-01-01');await actor(banned,'Banned');
  await db.query("insert into user_private values($1,'2099-01-01Z')",[banned]);
  await claim(a);
  const value=async(sql,params=[]) => (await db.query(sql,params)).rows[0].value;
  const history=(games,month=null)=>value('select public.community_game_monthly_history($1,$2) value',[games,month]);
  const ranks=(game)=>value('select public.community_game_monthly_ranking($1) value',[game]);
  const submit=(token,score,id=randomUUID(),game='runner')=>value('select public.submit_guest_game_score($1,$2,$3,$4) value',[game,score,token,id]);
  const guest=(token,period='month',game='runner')=>value('select ojjuda_guest_internal.ranking($1,$2,$3) value',[game,period,token]);
  const catalog=await value('select ojjuda_ranking_internal.catalog() value');
  assert.equal(catalog.length,20);assert.equal(new Set(catalog).size,20);
  assert.ok(catalog.includes('screw_box')&&catalog.includes('screw_flat')&&catalog.includes('billiards'));
  assert.ok(!catalog.includes('carom4')&&!catalog.includes('pool8'));
  const world=fs.readFileSync(path.join(__dirname,'../world.html'),'utf8');
  const registry=world.slice(world.indexOf('function worldRankGames(){'),world.indexOf('function openWorldBoardGame'));
  const visibleIds=vm.runInNewContext(registry+';Object.keys(worldRankGames())',{_r:{},window:{OjjudaMatgoAccess:{visible:()=>true}}});
  assert.deepEqual(catalog.toSorted(),Array.from(visibleIds).toSorted(),'the database archive catalog tracks every launched UI category');

  // Fixed Korea-time half-open periods, independent of server/session timezone.
  for(const [time,month] of [
   ['2026-10-31T14:59:59Z','2026-10-01'],['2026-10-31T15:00:00Z','2026-10-01'],
   ['2026-10-31T15:59:59.999999Z','2026-10-01'],['2026-10-31T16:00:00Z','2026-11-01'],
   ['2026-12-31T15:59:59.999999Z','2026-12-01'],['2026-12-31T16:00:00Z','2027-01-01'],
   ['2028-02-29T16:00:00Z','2028-03-01']]) {
   assert.equal(await value('select ojjuda_ranking_internal.month_key($1)::text value',[time]),month);
  }
  await clock('2026-10-31T15:59:59.999999Z');
  let response=await history(catalog);
  assert.equal(response.month,'2026-10');assert.equal(response.closed,false);
  assert.equal(Date.parse(response.endsAt),Date.parse('2026-10-31T16:00:00Z'));
  assert.equal(Object.keys(response.leaders).length,20);assert.ok(Object.values(response.leaders).every(x=>x===null));
  await clock('2026-10-31T16:00:00Z');
  response=await history(catalog);assert.equal(response.month,'2026-11');
  const pending=await history(catalog,'2026-10-01');assert.equal(pending.pending,true);assert.deepEqual(pending.leaders,{});
  assert.ok(pending.months.some(x=>x.month==='2026-10'&&x.pending&&x.hasRecords===null));

  // The calendar daily best remains separate from the 01:00 monthly best.
  const dayToken='a'.repeat(64),monthToken='b'.repeat(64),retryToken='c'.repeat(64);
  await claim(null);await clock('2026-10-14T14:30:00Z');assert.equal((await submit(dayToken,900)).ok,true);
  await clock('2026-10-14T15:30:00Z');assert.equal((await submit(dayToken,100)).ok,true);
  assert.equal((await guest(dayToken,'day')).find(x=>x.me).score,100,'00:00 starts the daily board');
  assert.equal((await guest(dayToken)).find(x=>x.me).score,900,'ordinary midnight keeps the monthly peak');
  await clock('2026-10-31T15:30:00Z');assert.equal((await submit(monthToken,500)).ok,true);
  await clock('2026-10-31T16:30:00Z');assert.equal((await submit(monthToken,100)).best,500,'daily best is unchanged');
  assert.equal((await guest(monthToken,'day')).find(x=>x.me).score,500);
  assert.equal((await guest(monthToken)).find(x=>x.me).score,100,'the lower new-month result is retained');
  const receipt=randomUUID();await clock('2026-10-31T15:59:59Z');assert.equal((await submit(retryToken,400,receipt)).ok,true);
  await clock('2026-10-31T16:00:01Z');assert.equal((await submit(retryToken,400,receipt)).ok,true);
  assert.equal(await value("select count(*)::int value from ojjuda_ranking_internal.guest_peaks where guest_hash=$1 and month_start='2026-11-01'",[hash(retryToken)]),0,'receipt retry cannot create a new month result');
  assert.equal((await submit(retryToken,401,receipt)).reason,'request_conflict');
  assert.equal((await submit(retryToken,401)).reason,'too_fast');
  assert.equal((await submit(retryToken,50001)).reason,'invalid');
  assert.equal(await value("select count(*)::int value from ojjuda_ranking_internal.guest_peaks where guest_hash=$1",[hash(retryToken)]),1);

  // The same picture may be cleared in both ranking months inside one calendar month.
  await claim(a);await clock('2026-10-31T15:30:00Z');
  assert.equal((await value('select public.record_spot_clear(62,null) value')).score,1);
  assert.equal((await value("select public.photo_game_clear('39') value")).score,1);
  await clock('2026-10-31T16:30:00Z');
  const spot=await value('select public.record_spot_clear(62,null) value');assert.equal(spot.score,1);assert.equal(spot.duplicate,false);
  assert.equal((await value("select public.photo_game_clear('39') value")).score,1);
  assert.equal((await value('select public.record_spot_clear(62,null) value')).duplicate,true);
  assert.equal(await value('select count(*)::int value from ojjuda_guest_internal.spot_clears'),1,'coupon/calendar source keeps its old deduplication');
  assert.equal(await value('select count(*)::int value from ojjuda_photo_internal.game_clears'),1);
  assert.equal(await value('select count(*)::int value from ojjuda_ranking_internal.picture_clears'),4);
  assert.equal((await ranks('spot'))[0].score,1);assert.equal((await ranks('photo_ttang'))[0].score,1);

  // Seed all twenty ranking categories using the actual existing criterion helpers.
  await db.exec(`truncate public.game_scores,public.board_games,ojjuda_game_internal.practice_results,
   ojjuda_guest_internal.scores,ojjuda_guest_internal.round_records,ojjuda_guest_internal.spot_clears,
   ojjuda_photo_internal.game_clears,ojjuda_bang_internal.results,
   ojjuda_ranking_internal.guest_peaks,ojjuda_ranking_internal.picture_clears;`);
  await clock('2026-10-31T12:00:00Z');
  const score=(id,game,amount,time='2026-10-15T00:00:00Z')=>db.query('insert into game_scores values($1,$2,$3,$4)',[id,game,amount,time]);
  const round=(id,game,amount,time,opponents=null)=>db.query(`insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,value,source,achieved_at,opponents)
   values($1,'member:'||$2,$2::uuid,$3,$4,'solo',$5,$6)`,[game,id,randomUUID(),amount,time,opponents]);
  const practice=(id,game,difficulty,outcome,time)=>db.query('insert into ojjuda_game_internal.practice_results values($1,$2,$3,$4,$5,$6)',[id,randomUUID(),game,difficulty,outcome,time]);
  for(const game of ['mole','runner','stacker','breakout','screw_box','screw_flat','saetbyeol','mines']) {
   await score(a,game,0);await score(b,game,10);await score(banned,game,99);
   await score(a,game,100,'2026-09-30T15:59:59.999999Z');await score(a,game,100,'2026-10-31T16:00:00Z');
  }
  assert.ok(!(await ranks('runner')).some(x=>x.nick==='Alpha'),'a stored zero score does not qualify for ranking');
  assert.equal((await ranks('runner'))[0].score,10,'positive records still qualify');
  await score(a,'sacheonseong_15',1);await score(b,'sacheonseong_14',1999999999);
  await score(b,'sacheonseong',9999); // Legacy unsuffixed key must not be cast to an integer stage.
  await db.query("insert into ojjuda_ranking_internal.guest_peaks values('2026-10-01','sacheonseong',$1,1,'2026-10-15Z')",[hash(dayToken)]);
  for(const game of ['chess','janggi','carom4']) {
   for(let i=0;i<4;i++)await practice(a,game,'easy','win',`2026-10-15T00:0${i}:00Z`);
   await practice(b,game,'hard','win','2026-10-15T00:05:00Z');
  }
  await db.query("insert into board_games values($1,$2,$3,'chess','done','p1','2026-10-16Z',array['p1'])",[randomUUID(),a,b]);
  await db.query("insert into board_games values($1,$2,$3,'janggi','done','p2','2026-10-16Z',array['p1'])",[randomUUID(),a,b]);
  await db.query("insert into board_games values($1,$2,$3,'pool8','done','p2','2026-10-16Z',array['p1'])",[randomUUID(),a,b]);
  for(let i=0;i<4;i++)await round(a,'tank',1,`2026-10-15T00:0${i}:00Z`,1);
  await round(b,'tank',1,'2026-10-15T00:06:00Z',5);
  for(const game of ['tour','ttang']) {
   await round(a,game,1,'2026-10-15T00:01:00Z');await round(a,game,1,'2026-10-15T00:02:00Z');await round(a,game,0,'2026-10-15T00:03:00Z');
   await round(b,game,1,'2026-10-15T00:01:00Z');
  }
  await round(a,'matgo',1000,'2026-10-15T00:01:00Z');await round(b,'matgo',600,'2026-10-15T00:01:00Z');await round(b,'matgo',600,'2026-10-15T00:02:00Z');
  await round(a,'poker',0,'2026-10-15T00:01:00Z');await round(b,'poker',101,'2026-10-15T00:01:00Z');await round(minor,'poker',9999,'2026-10-15T00:01:00Z');
  for(const [id,won,time] of [[a,true,'01'],[a,true,'02'],[a,false,'03'],[b,true,'01'],[b,true,'02']])
   await db.query('insert into ojjuda_bang_internal.results values($1,$2,$3,$4)',[randomUUID(),id,won,`2026-10-15T00:${time}:00Z`]);
  for(const game of ['spot','photo_ttang'])for(const id of [a,b])for(let i=1;i<=2;i++)
   await db.query("insert into ojjuda_ranking_internal.picture_clears values($1,'member:'||$2,$2::uuid,null,$3,'2026-10-01',$4)",[game,id,String(i),`2026-10-15T0${id===a?1:2}:0${i}:00Z`]);
  response=await history(catalog);assert.equal(Object.keys(response.leaders).length,20);assert.ok(Object.values(response.leaders).every(Boolean));
  const leaders=response.leaders;
  assert.equal(leaders.sacheonseong.nick,'Alpha');assert.equal(leaders.sacheonseong.stage,15);
  assert.equal(leaders.chess.nick,'Beta');assert.equal(leaders.chess.difficulty,'hard',
   'the earlier hard win remains a monthly best; the computer-assisted online win is excluded');
  assert.equal(leaders.janggi.difficulty,'online','remaining human seat retains its result');
  assert.equal(leaders.billiards.variant,'pool8');assert.equal(leaders.billiards.difficulty,'online');
  assert.equal(leaders.tank.opponents,5);assert.equal(leaders.tank.score,1);
  for(const game of ['tour','ttang','bang']){
   assert.equal(leaders[game].nick,'Alpha');assert.equal(leaders[game].score,2,'a later loss preserves the monthly best in '+game);
  }
  assert.equal(leaders.matgo.nick,'Alpha');assert.equal(leaders.matgo.score,1000);assert.equal(leaders.poker.score,101);
  assert.equal(leaders.spot.nick,'Alpha');assert.equal(leaders.photo_ttang.nick,'Alpha');
  for(const game of catalog)assert.deepEqual(leaders[game],(await ranks(game))[0],game+' uses the same individual monthly board');
  assert.deepEqual(await value('select public.community_game_monthly_leaders($1) value',[catalog]),leaders);

  // One microsecond before the boundary closes October; the exact boundary belongs to November.
  await score(a,'runner',300,'2026-10-31T15:59:59.999999Z');await score(b,'runner',400,'2026-10-31T16:00:00Z');
  await clock('2026-10-31T15:59:59.999999Z');assert.equal((await history(['runner'])).leaders.runner.score,300);
  await assert.rejects(value("select ojjuda_ranking_internal.close_month('2026-10-01') value"),/invalid_closed_month/);
  await clock('2026-10-31T16:00:00Z');assert.equal((await history(['runner'])).leaders.runner.score,400);
  const closes=await Promise.all(Array.from({length:4},()=>value("select ojjuda_ranking_internal.close_month('2026-10-01') value")));
  assert.equal(closes.filter(Boolean).length,1,'overlapping close requests insert once');
  response=await history(catalog,'2026-10-01');assert.equal(response.closed,true);assert.equal(response.pending,false);
  assert.equal(response.leaders.runner.score,300,'the exact new-month record is absent from October');
  assert.equal(response.leaders.sacheonseong.stage,15);assert.equal(response.leaders.billiards.variant,'pool8');
  assert.equal(response.leaders.tank.opponents,5);
  const currentDef=await value("select pg_get_functiondef('ojjuda_ranking_internal.current_rows(text,text)'::regprocedure) value");
  await db.exec(`create or replace function ojjuda_ranking_internal.current_rows(p_game text,p_guest_token text default null)
   returns json language plpgsql stable security definer set search_path='' as $$begin raise exception 'live_rows_should_not_be_read';end$$;`);
  assert.equal((await history(catalog,'2026-10-01')).leaders.runner.score,300,'past history reads only the fixed snapshot');
  await db.exec(currentDef);
  assert.ok(!JSON.stringify(response).includes('_userId'));assert.ok(!JSON.stringify(response).includes(hash(dayToken)));
  const frozen=await value("select winners value from ojjuda_ranking_internal.archives where month_start='2026-10-01'");
  await db.query("update profiles set nickname='Changed' where id=$1",[a]);
  await score(b,'runner',50000,'2026-10-20Z');
  assert.equal(await value("select ojjuda_ranking_internal.close_month('2026-10-01') value"),false);
  assert.deepEqual(await value("select winners value from ojjuda_ranking_internal.archives where month_start='2026-10-01'"),frozen);
  await claim(b);await db.query('delete from auth.users where id=$1',[a]);
  response=await history(catalog,'2026-10-01');assert.equal(response.leaders.runner.nick,'Alpha','archived nickname survives account deletion');
  assert.equal(response.leaders.matgo.nick,'Alpha');
  await db.query('insert into fixture.blocks values($1,$2)',[b,a]);
  assert.equal((await history(['matgo'],'2026-10-01')).leaders.matgo,null,'blocked archived winner is hidden without promotion');
  assert.equal((await history(['runner'],'2026-10-01')).leaders.runner.nick,'Alpha','unblocked-policy games preserve their prior behavior');
  await db.query("insert into user_private values($1,'2099-01-01Z')",[a]);
  assert.equal((await history(['runner'],'2026-10-01')).leaders.runner,null,'current moderation still applies');

  // Invalid requests are errors, never an invented empty archive.
  await assert.rejects(history(['runner'],'2026-09-01'),/month_unavailable/);
  await assert.rejects(history(['runner'],'2026-11-02'),/invalid_month/);
  await assert.rejects(history(['runner'],'2027-01-01'),/invalid_month/);
  await assert.rejects(history(['unknown']),/invalid_game/);await assert.rejects(history([null]),/invalid_game/);
  await assert.rejects(history(Array(41).fill('runner')),/invalid_games/);await assert.rejects(history(null),/invalid_games/);
  assert.deepEqual((await history([])).leaders,{});
  await claim(minor);assert.deepEqual(Object.keys((await history(['runner','matgo','poker','photo_ttang'],'2026-10-01')).leaders),['runner']);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from ojjuda_ranking_internal.archives'),/permission denied/);
  await assert.rejects(db.query('select * from ojjuda_ranking_internal.guest_peaks'),/permission denied/);
  await assert.rejects(value("select ojjuda_ranking_internal.close_month('2026-10-01') value"),/permission denied/);
  await assert.rejects(value('select ojjuda_ranking_internal.close_due_months() value'),/permission denied/);
  assert.equal((await history(['runner'],'2026-10-01')).closed,true);
  await db.exec('reset role');await claim(null);await assert.rejects(history(['runner']),/not_signed_in/);
  await db.exec('set role anon');await assert.rejects(history(['runner']),/permission denied/);await db.exec('reset role');
  await db.exec('set role service_role');
  assert.equal(await value("select ojjuda_ranking_internal.close_month('2026-10-01') value"),false);
  await assert.rejects(db.query('select * from ojjuda_ranking_internal.archives'),/permission denied/);
  await db.exec('reset role');
  await claim(b);
  await db.exec('begin isolation level repeatable read');
  await assert.rejects(value("select ojjuda_ranking_internal.close_month('2026-10-01') value"),/archive_requires_read_committed/);
  await db.exec('rollback');

  // Empty completed months are durable; failed archive transactions are retryable.
  await clock('2027-01-01T00:00:00Z');
  const closeCount=await value('select ojjuda_ranking_internal.close_due_months() value');assert.equal(closeCount,2);
  const empty=await history(catalog,'2026-12-01');assert.equal(empty.closed,true);assert.equal(empty.pending,false);
  assert.ok(Object.values(empty.leaders).every(x=>x===null));assert.equal(empty.months.find(x=>x.month==='2026-12').hasRecords,false);
  assert.equal(await value('select ojjuda_ranking_internal.close_due_months() value'),0);
  await clock('2027-02-01T00:00:00Z');
  await db.exec(`create function fixture.fail_archive() returns trigger language plpgsql as $$begin raise exception 'archive_write_failed';end$$;
   create trigger fail_archive before insert on ojjuda_ranking_internal.archives for each row execute function fixture.fail_archive();`);
  await assert.rejects(value('select ojjuda_ranking_internal.close_due_months() value'),/archive_write_failed/);
  assert.equal(await value("select count(*)::int value from ojjuda_ranking_internal.archives where month_start='2027-01-01'"),0);
  await db.exec('drop trigger fail_archive on ojjuda_ranking_internal.archives');
  assert.equal(await value('select ojjuda_ranking_internal.close_due_months() value'),1);
  assert.deepEqual((await db.query('select * from fixture.economy')).rows,[{wallet_gold:12345,coupon_count:7}]);
  const sql=read(migrationName);
  assert.ok(!/insert\s+into\s+ojjuda_rewards_internal|capture_month_end\(|update\s+.*wallets/i.test(sql));
  assert.match(sql,/'0 16 \$ \* \*'/);assert.match(sql,/'5 \* \* \* \*'/);
  console.log('PASS: exact 01:00 KST and year boundaries; unchanged daily/coupon buckets; monthly guest receipts and picture clears; all 20 criteria and per-seat takeover exclusions; fixed immutable/empty archives, retries and concurrent requests; current/history parity; access controls and zero financial side effects.');
 } finally {await db.close();}
})().catch(error=>{console.error(error.message,error.where||'',error.stack);process.exitCode=1;});
