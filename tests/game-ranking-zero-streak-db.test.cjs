const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { createFixture, read, participantsMigrationName } = require('./monthly-game-rankings-fixture.cjs');

async function displayedParticipants() {
 const {db,clock,claim,actor} = await createFixture(undefined, {participants:false,latestBest:false});
 try {
  const a=randomUUID(),b=randomUUID(),never=randomUUID(),missingField=randomUUID();
  await actor(a,'완주회원');await actor(b,'다른회원');await actor(never,'미참여');await actor(missingField,'필드없는기록');
  await claim(a);await clock('2026-10-31T12:00:00Z');
  const games=['bang','tank','tour','ttang'];
  const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
  const history=(month=null)=>value('select public.community_game_monthly_history($1,$2) value',[games,month]);
  const rank=game=>value('select public.community_game_monthly_ranking($1) value',[game]);
  const daily=(game,period='day',token=null)=>value('select ojjuda_guest_internal.criteria_ranking($1,$2,$3) value',[game,period,token]);
  const record=async(game,id,won,time,opponents=null)=>{
   if(game==='bang')return db.query('insert into ojjuda_bang_internal.results values($1,$2,$3,$4)',[randomUUID(),id,won,time]);
   return db.query(`insert into ojjuda_guest_internal.round_records(game,actor_key,user_id,round_id,value,source,achieved_at,opponents)
    values($1,'member:'||$2,$2::uuid,$3,$4,'solo',$5,$6)`,[game,id,randomUUID(),Number(won),time,opponents]);
  };
  const definitions=async()=>(await db.query(`select p.oid::regprocedure::text signature,
   md5(pg_get_functiondef(p.oid)) body,p.proowner::regrole::text owner,p.proacl::text acl,p.prosecdef,p.proconfig
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname like 'ojjuda_%' or n.nspname='public' order by signature`)).rows;
  const sourceRows=async()=>({
   rounds:(await db.query('select * from ojjuda_guest_internal.round_records order by game,achieved_at,round_id')).rows,
   bang:(await db.query('select * from ojjuda_bang_internal.results order by achieved_at,room_id')).rows,
   economy:(await db.query('select * from fixture.economy')).rows
  });
  for(const game of games){
   await record(game,a,true,'2026-10-31T10:00:00Z',game==='tank'?11:null);
   assert.equal((await rank(game))[0].score,1,game+' first completed win is visible');
   await record(game,a,false,'2026-10-31T10:01:00Z',game==='tank'?11:null);
   assert.deepEqual(await rank(game),[],game+' reproduces a saved participant disappearing after a loss');
  }
  assert.ok(Object.values((await history()).leaders).every(x=>x===null));
  const beforeDefinitions=await definitions(),beforeRows=await sourceRows();
  await db.exec(read(participantsMigrationName));
  const afterDefinitions=await definitions(),afterByName=new Map(afterDefinitions.map(row=>[row.signature,row]));
  const changed=beforeDefinitions.filter(row=>row.body!==afterByName.get(row.signature)?.body).map(row=>row.signature);
  assert.deepEqual(changed.sort(),[
   'ojjuda_guest_internal.criteria_ranking(text,text,text)',
   'ojjuda_ranking_internal.candidates(text,timestamp with time zone,timestamp with time zone)'
  ].sort(),'only the display readers change; reward helpers, receipts, purchases and capture paths retain their bodies');
  for(const before of beforeDefinitions){
   const {body,...security}=before,{body:afterBody,...afterSecurity}=afterByName.get(before.signature);
   assert.deepEqual(afterSecurity,security,before.signature+' preserves its security attributes');
  }
  assert.deepEqual(await sourceRows(),beforeRows,'a display migration does not rewrite a win, loss or balance');

  // Zero is a record. Someone with no eligible result is not a participant.
  for(const game of games){
   const rows=await rank(game);assert.equal(rows.length,1);assert.equal(rows[0].nick,'완주회원');
   assert.equal(rows[0].score,0);assert.equal(rows[0].me,true);
   if(game==='tank')assert.equal(rows[0].opponents,null,'zero is not a victory over eleven opponents');
   if(game!=='bang')for(const period of ['day','all']){
    const list=await daily(game,period);assert.equal(list.length,1);assert.equal(list[0].score,0);
   }
  }
  const current=await history();
  assert.ok(games.every(game=>current.leaders[game]?.score===0));
  assert.equal(current.months.find(month=>month.month==='2026-10').hasRecords,true);
  const batch=await value('select public.community_game_monthly_leaders($1) value',[games]);
  assert.deepEqual(batch,current.leaders);
  assert.equal(await value("select count(*)::int value from ojjuda_ranking_internal.candidates('tank','2026-09-30T16:00Z','2026-10-31T16:00Z') where user_id=$1",[never]),0);

  // The existing positive-only helpers still give coupon selection no winner.
  for(const game of ['tour','ttang'])assert.equal(await value(`select count(*)::int value from
   ojjuda_guest_internal.round_leaders($1,'2026-09-30T16:00Z','2026-10-31T15:59:59.999999Z')`,[game]),0);
  assert.equal(await value("select count(*)::int value from ojjuda_guest_internal.tank_candidates('2026-09-30T16:00Z','2026-10-31T15:59:59.999999Z')"),0);
  await record('poker',a,false,'2026-10-31T10:02:00Z');
  assert.deepEqual(await rank('poker'),[],'zero-gold hands do not become best-gain winners');

  // A month containing only completed zero streaks still has an immutable winner.
  await clock('2026-10-31T16:00:00Z');
  assert.equal(await value("select ojjuda_ranking_internal.close_month('2026-10-01') value"),true);
  const archive=await history('2026-10-01');
  assert.equal(archive.closed,true);assert.equal(archive.pending,false);
  assert.ok(games.every(game=>archive.leaders[game]?.score===0));
  assert.equal(archive.months.find(month=>month.month==='2026-10').hasRecords,true);
  assert.equal(await value("select has_records value from ojjuda_ranking_internal.archives where month_start='2026-10-01'"),true);
  assert.ok(Object.values((await history()).leaders).every(x=>x===null),'new month has no participant before a new completion');
  assert.equal(await value("select ojjuda_ranking_internal.close_month('2026-10-01') value"),false);

  await clock('2026-11-01T12:00:00Z');
  for(const game of ['bang','tour','ttang']){
   await record(game,a,false,'2026-11-01T10:00:00Z');
   await record(game,b,true,'2026-11-01T10:01:00Z');
   const rows=await rank(game);assert.deepEqual(rows.map(row=>[row.nick,row.score]),[['다른회원',1],['완주회원',0]]);
  }
  await record('tank',a,true,'2026-11-01T10:00:00Z',1);
  await record('tank',a,false,'2026-11-01T10:01:00Z',11);
  await record('tank',b,false,'2026-11-01T10:02:00Z',11);
  await record('tank',missingField,false,'2026-11-01T10:02:00Z',null);
  const tankExpected=[['완주회원',1,1],['다른회원',0,null]];
  const tankShape=rows=>rows.map(row=>[row.nick,row.score,row.opponents]);
  assert.deepEqual(tankShape(await rank('tank')),tankExpected,'an active smaller-field streak outranks every zero fallback');
  for(const period of ['day','all'])assert.deepEqual(tankShape(await daily('tank',period)),tankExpected,'tank '+period+' puts NULL opponent fields last');
  await record('tank',b,true,'2026-11-01T10:03:00Z',11);
  assert.deepEqual(tankShape(await rank('tank')),[['다른회원',1,11],['완주회원',1,1]],'positive opponent priority remains unchanged');
  await record('tank',b,false,'2026-11-01T10:04:00Z',11);
  assert.deepEqual(tankShape(await rank('tank')),tankExpected);
  assert.equal((await rank('tank')).filter(row=>row.me).length,1,'a loss in another field cannot duplicate the active participant');
  const positiveTank=(await db.query("select * from ojjuda_guest_internal.tank_candidates('2026-10-31T16:00Z','2026-11-01T12:00Z')")).rows;
  assert.equal(positiveTank.length,1);assert.equal(positiveTank[0].user_id,a);assert.equal(Number(positiveTank[0].score),1);

  const token='9'.repeat(64),guestHash=createHash('sha256').update(token).digest('hex');
  for(const game of ['tour','ttang'])await db.query(`insert into ojjuda_guest_internal.round_records
   (game,actor_key,guest_hash,round_id,value,source,achieved_at)
   values($1,'guest:'||$2,$2,$3,0,'solo','2026-11-01T10:05Z')`,[game,guestHash,randomUUID()]);
  await claim(null);await db.exec('set role anon');
  for(const game of ['tour','ttang']){
   const rows=await daily(game,'day',token);assert.equal(rows.find(row=>row.me).score,0);assert.equal(rows.find(row=>row.me).nick,'손님');
  }
  await db.exec('reset role');await claim(a);await db.exec('set role authenticated');
  assert.equal((await rank('tank'))[0].score,1);
  for(const query of [
   "select * from ojjuda_ranking_internal.round_participants('tour','2026-10-31T16:00Z','2026-11-01T12:00Z')",
   "select * from ojjuda_ranking_internal.tank_participants('2026-10-31T16:00Z','2026-11-01T12:00Z')",
   'select * from ojjuda_guest_internal.round_records'
  ])await assert.rejects(db.query(query),/permission denied/);
  await db.exec('reset role');
  await db.query('insert into fixture.blocks values($1,$2)',[a,b]);
  assert.deepEqual((await rank('tank')).map(row=>row.nick),['완주회원']);
  assert.deepEqual((await rank('bang')).map(row=>row.nick),['완주회원']);
  await db.query("insert into user_private values($1,'2099-01-01Z')",[a]);
  assert.equal((await rank('tank')).length,0,'moderation and blocks still exclude zero as well as positive records');
  assert.ok(!(await rank('tour')).some(row=>row.nick==='완주회원'));
  assert.deepEqual((await db.query('select * from fixture.economy')).rows,[{wallet_gold:12345,coupon_count:7}]);
  console.log('PASS: reproduced win-to-loss disappearance; current/day/all and closed-month zero records, empty new month, no invented participants, tank positive priority/NULL fallback, guest/member permissions, unchanged reward helpers and immutable source records.');
 } finally {await db.close();}
}

async function takeoverCapture() {
 const {fixture,ids}=require('./multiplayer-session-fixture.cjs');
 const f=await fixture();
 try {
  const sql=read(participantsMigrationName),end=sql.indexOf('-- Patch displayed');
  assert.ok(end>0);
  await f.db.exec('create schema ojjuda_ranking_internal;');
  await f.db.exec(sql.slice(0,end)+'commit;');
  const call=async(kind,id,body)=>{
   const result=await f.callGame(kind,id,body);assert.equal(result.ok,true,kind+': '+JSON.stringify(result));return result.room;
  };
  for(const [index,kind] of ['tank','marble'].entries()){
   const [human,departed]=ids.slice(index*2,index*2+2);
   let room=await call(kind,human,{action:'create',request_id:randomUUID(),options:{capacity:2,title:'순위 제외 확인',...(kind==='marble'?{maxRound:15}:{})}});
   room=await call(kind,departed,{action:'join',code:room.code});
   room=await call(kind,human,{action:'start',room_id:room.id,version:room.version,request_id:randomUUID()});
   await call(kind,departed,{action:'leave',room_id:room.id,version:room.version,request_id:randomUUID()});
   room=await call(kind,human,{action:'read',room_id:room.id});
   room=await call(kind,human,{action:'surrender',room_id:room.id,version:room.version,request_id:randomUUID()});
   assert.equal(room.status,'finished');assert.ok(room.rankExcluded.includes(1));
   const records=(await f.db.query('select user_id,value from ojjuda_guest_internal.round_records where round_id=$1',[room.id])).rows;
   assert.deepEqual(records.map(row=>[row.user_id,Number(row.value)]),[[human,0]],kind+' stores only the eligible human loss');
   const participants=(await f.db.query(kind==='tank'
    ? "select user_id,score from ojjuda_ranking_internal.tank_participants('-infinity','infinity')"
    : "select user_id,score from ojjuda_ranking_internal.round_participants('tour','-infinity','infinity')")).rows;
   assert.deepEqual(participants.map(row=>[row.user_id,Number(row.score)]),[[human,0]],kind+' zero fallback cannot resurrect the departed AI seat');
  }
  assert.ok((await f.db.query('select coins from public.user_private')).rows.every(row=>row.coins===100),'read-only fallback does not charge a purchase or alter gold');
  console.log('PASS: real Tank/Marble Edge -> SQL finish captures the human zero result and keeps the departed computer-assisted seat out of the new display helpers.');
 } finally {await f.close();}
}

(async()=>{await displayedParticipants();await takeoverCapture();})().catch(error=>{
 delete error.query;console.error(error.message,error.where||'',error.stack);process.exitCode=1;
});
