const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const {createFixture,read,excludeZeroMigrationName}=require('./monthly-game-rankings-fixture.cjs');

(async()=>{
 const {db,clock,claim,actor}=await createFixture(undefined,{excludeZero:false});
 try{
  const zero=randomUUID(),positive=randomUUID(),excluded=randomUUID(),never=randomUUID();
  await actor(zero,'기록없는회원');await actor(positive,'양수최고회원');await actor(excluded,'대행회원');await actor(never,'미참여회원');
  const streaks=['bang','tank','tour','ttang','billiards','janggi','chess'];
  const ordinary=['mole','runner','stacker','breakout','screw_box','screw_flat','saetbyeol','mines','sacheonseong'];
  const zeroToken='d'.repeat(64),positiveToken='e'.repeat(64);
  const hash=token=>createHash('sha256').update(token).digest('hex');
  const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
  const catalog=await value('select ojjuda_ranking_internal.catalog() value');
  const rank=game=>value('select public.community_game_monthly_ranking($1) value',[game]);
  const history=(month=null)=>value('select public.community_game_monthly_history($1,$2) value',[catalog,month]);
  const generic=(game,period,token=zeroToken)=>value('select ojjuda_guest_internal.ranking($1,$2,$3) value',[game,period,token]);
  const key=game=>game==='sacheonseong'?'sacheonseong_1':game;
  const score=(id,game,amount,at)=>db.query('insert into public.game_scores values($1,$2,$3,$4)',[id,key(game),amount,at]);
  const submit=(game,amount,token)=>value('select public.submit_guest_game_score($1,$2,$3,$4) value',[key(game),amount,token,randomUUID()]);
  const record=async(game,id,won,at)=>{
   const round=randomUUID();
   if(game==='bang')await db.query('insert into ojjuda_bang_internal.results values($1,$2,$3,$4)',[round,id,won,at]);
   else if(['tank','tour','ttang','matgo','poker'].includes(game))await db.query(`insert into ojjuda_guest_internal.round_records
    (game,actor_key,user_id,round_id,value,source,achieved_at,opponents)
    values($1,'member:'||$2,$2::uuid,$3,$4,'solo',$5,$6)`,[game,id,round,Number(won),at,game==='tank'?11:null]);
   else await db.query('insert into ojjuda_game_internal.practice_results values($1,$2,$3,$4,$5,$6)',
    [id,round,game==='billiards'?'carom4':game,'hard',won?'win':'loss',at]);
  };
  const seedZeros=async(day)=>{
   await clock(day+'T12:00:00Z');
   for(const game of [...streaks,'matgo','poker'])await record(game,zero,false,day+'T10:00:00Z');
   for(const game of ['chess','janggi','pool8'])await db.query('insert into ojjuda_game_internal.practice_results values($1,$2,$3,$4,$5,$6)',
    [zero,randomUUID(),game,'easy','draw',day+'T10:01:00Z']);
   for(const game of ordinary)await score(zero,game,0,day+'T10:00:00Z');
   await db.query(`insert into ojjuda_guest_internal.round_records(game,actor_key,guest_hash,round_id,value,source,achieved_at)
    values('tour','guest:'||$1,$1,$2,0,'solo',$3)`,[hash(zeroToken),randomUUID(),day+'T10:00:00Z']);
   await claim(null);
   for(const game of ['runner','sacheonseong'])assert.equal((await submit(game,0,zeroToken)).ok,true,'zero remains an accepted submission');
   await claim(zero);
  };
  const snapshot=async()=>{
   const tables=(await db.query(`select format('%I.%I',n.nspname,c.relname) name from pg_class c
    join pg_namespace n on n.oid=c.relnamespace where c.relkind='r'
    and (n.nspname in('public','auth') or n.nspname like 'ojjuda_%' or (n.nspname='fixture' and c.relname='economy'))
    order by 1`)).rows;
   const out={};
   for(const {name} of tables)out[name]=await value(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') value from ${name} t`);
   return out;
  };
  const definitions=async()=>(await db.query(`select p.oid::regprocedure::text signature,
   md5(pg_get_functiondef(p.oid)) body,p.proowner::regrole::text owner,p.proacl::text acl,p.prosecdef,p.proconfig
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname like 'ojjuda_%' or n.nspname='public' order by signature`)).rows;
  const emptyLeaders=response=>{
   assert.deepEqual(Object.keys(response.leaders).sort(),[...catalog].sort(),'all twenty games remain in the catalog');
   assert.ok(Object.values(response.leaders).every(row=>row===null));
  };

  // Reproduce an already-frozen zero winner using the previous shipped policy.
  await seedZeros('2026-10-31');
  for(const game of streaks)assert.equal((await rank(game))[0].score,0);
  assert.equal((await generic('runner','day'))[0].score,0);
  await clock('2026-10-31T16:00:00Z');
  assert.equal(await value("select ojjuda_ranking_internal.close_month('2026-10-01') value"),true);
  const old=await history('2026-10-01');
  assert.equal(old.months.find(row=>row.month==='2026-10').hasRecords,true);
  const frozen=await value("select winners value from ojjuda_ranking_internal.archives where month_start='2026-10-01'");
  const beforeRows=await snapshot(),beforeDefinitions=await definitions();
  await db.exec(read(excludeZeroMigrationName));
  assert.deepEqual(await snapshot(),beforeRows,'read filtering changes no raw zero record, archive, profile or balance');
  const afterDefinitions=await definitions(),afterByName=new Map(afterDefinitions.map(row=>[row.signature,row]));
  const readers=new Set([
   'ojjuda_guest_internal.ranking(text,text,text)',
   'ojjuda_ranking_internal.candidates(text,timestamp with time zone,timestamp with time zone)',
   'ojjuda_ranking_internal.round_participants(text,timestamp with time zone,timestamp with time zone)',
   'ojjuda_ranking_internal.tank_participants(timestamp with time zone,timestamp with time zone)',
   'ojjuda_ranking_internal.board_participants(text,timestamp with time zone,timestamp with time zone)',
   'ojjuda_ranking_internal.bang_participants(timestamp with time zone,timestamp with time zone)',
   'ojjuda_ranking_internal.visible_winners(jsonb,text[],uuid)'
  ]);
  assert.equal(afterDefinitions.length,beforeDefinitions.length);
  for(const row of beforeDefinitions){
   const after=afterByName.get(row.signature);assert.ok(after,'all existing functions remain');
   if(row.body!==after.body)assert.ok(readers.has(row.signature),'writers, current counters and reward helpers cannot change: '+row.signature);
   const {body,...security}=row,{body:afterBody,...afterSecurity}=after;
   assert.deepEqual(afterSecurity,security,'function owners, grants and execution security remain unchanged');
  }
  let archived=await history('2026-10-01');emptyLeaders(archived);
  assert.equal(archived.months.find(row=>row.month==='2026-10').hasRecords,false);
  assert.ok(!JSON.stringify(archived).includes('기록없는회원'));
  assert.ok(!JSON.stringify(archived).includes(zero));assert.ok(!JSON.stringify(archived).includes(hash(zeroToken)));
  assert.deepEqual(await value("select winners value from ojjuda_ranking_internal.archives where month_start='2026-10-01'"),frozen);

  // No wins/positive scores means no monthly, daily or all-time entry, while
  // the actual completed losses, draws and accepted zero scores remain stored.
  await seedZeros('2026-11-30');
  for(const game of catalog)assert.deepEqual(await rank(game),[],game+' has no qualifying positive record');
  for(const game of [...streaks.filter(game=>game!=='bang'),'carom4','carom3','pool8'])for(const period of ['day','all']){
   assert.deepEqual(await value('select ojjuda_guest_internal.criteria_ranking($1,$2,$3) value',[game,period,zeroToken]),[],game+' '+period);
  }
  assert.equal(await value("select count(*)::int value from ojjuda_ranking_internal.bang_participants('-infinity','infinity')"),0);
  for(const game of ['runner','sacheonseong'])for(const period of ['day','month'])assert.deepEqual(await generic(game,period),[]);
  assert.ok(await value('select count(*)::int value from public.game_scores where score=0')>0);
  assert.ok(await value('select count(*)::int value from ojjuda_guest_internal.scores where score=0')>0);
  assert.ok(await value('select count(*)::int value from ojjuda_ranking_internal.guest_peaks where score=0')>0);
  const live=await history();emptyLeaders(live);
  assert.equal(live.months.find(row=>row.month==='2026-11').hasRecords,false);
  await claim(never);for(const game of streaks)assert.deepEqual(await rank(game),[]);
  await clock('2026-11-30T16:00:00Z');
  assert.equal(await value("select ojjuda_ranking_internal.close_month('2026-11-01') value"),true);
  const empty=await history('2026-11-01');emptyLeaders(empty);
  assert.equal(empty.closed,true);assert.equal(empty.pending,false);
  assert.equal(empty.months.find(row=>row.month==='2026-11').hasRecords,false);
  assert.equal(await value("select has_records value from ojjuda_ranking_internal.archives where month_start='2026-11-01'"),false);
  assert.equal(await value("select ojjuda_ranking_internal.close_month('2026-11-01') value"),false);

  // Positive backdated records are not promoted into a previously frozen zero
  // slot. Only a positive record actually captured in that snapshot may show.
  for(const game of streaks)await record(game,positive,true,'2026-10-31T11:00:00Z');
  await score(positive,'runner',10,'2026-10-31T11:00:00Z');
  assert.equal(await value("select count(*)::int value from ojjuda_ranking_internal.candidates('ttang','2026-09-30T16:00:00Z','2026-10-31T16:00:00Z') where score>0"),1);
  archived=await history('2026-10-01');emptyLeaders(archived);
  assert.equal(archived.months.find(row=>row.month==='2026-10').hasRecords,false);
  assert.equal(await value("select ojjuda_ranking_internal.close_month('2026-10-01') value"),false);
  assert.deepEqual(await value("select winners value from ojjuda_ranking_internal.archives where month_start='2026-10-01'"),frozen);

  // A positive best survives a subsequent loss; fresh zero records and an
  // excluded computer-controlled board seat do not join those rankings.
  await seedZeros('2026-12-01');
  for(const game of streaks){
   await record(game,positive,true,'2026-12-01T10:01:00Z');
   await record(game,positive,false,'2026-12-01T10:02:00Z');
   await claim(positive);assert.deepEqual((await rank(game)).map(row=>[row.nick,row.score]),[['양수최고회원',1]]);
   if(game!=='bang')for(const period of ['day','all']){
    const rows=await value('select ojjuda_guest_internal.criteria_ranking($1,$2,null) value',[game,period]);
    assert.ok(rows.length>0&&rows.every(row=>row.score>0));assert.equal(rows[0].nick,'양수최고회원');
   }
  }
  for(const game of ['carom4','janggi','chess'])await db.query("insert into public.board_games values($1,$2,null,$3,'done','p1',$4,array['p1'])",
   [randomUUID(),excluded,game,'2026-12-01T11:00:00Z']);
  await claim(excluded);
  for(const game of ['billiards','janggi','chess'])assert.ok(!(await rank(game)).some(row=>row.me),'takeover winner remains excluded');
  for(const game of ['runner','sacheonseong']){
   await score(positive,game,10,'2026-12-01T10:02:00Z');await claim(null);
   assert.equal((await submit(game,20,positiveToken)).ok,true);await claim(positive);
   for(const period of ['day','month']){
    const rows=await generic(game,period,positiveToken);
    assert.deepEqual(rows.map(row=>row.score),[20,10]);assert.ok(!rows.some(row=>row.nick==='기록없는회원'));
   }
  }
  assert.deepEqual((await db.query('select * from fixture.economy')).rows,[{wallet_gold:12345,coupon_count:7}]);
  console.log('PASS: seven streak games and ordinary member/guest scores require a positive record; zero-only daily/monthly/all-time boards and monthly archives stay empty across all 20 catalog entries; old zero snapshots are hidden without identity leaks, mutation or promotion; positive bests survive losses; takeover exclusions, raw ledgers, current/reward helpers, grants and balances remain intact.');
 }finally{await db.close();}
})().catch(error=>{delete error.query;console.error(error.message,error.where||'',error.stack);process.exitCode=1;});
