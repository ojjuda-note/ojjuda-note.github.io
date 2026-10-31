const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createFixture,read,bestStreakMigrationName,excludeZeroMigrationName}=require('./monthly-game-rankings-fixture.cjs');

(async()=>{
 const {db,clock,claim,actor}=await createFixture(undefined,{latestBest:false,excludeZero:false});
 try{
  await clock('2026-10-31T12:00:00Z');
  const boards=['billiards','janggi','chess'],games=['bang','tank','tour','ttang',...boards];
  const start='2026-09-30T16:00:00Z',end='2026-10-31T15:59:59.999999Z';
  const main=new Map(),lastRounds=new Map();let sequence=0;
  const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0].value;
  const member=async nick=>{const id=randomUUID();await actor(id,nick);return id;};
  const never=await member('미참여회원');
  const time=()=>new Date(Date.parse('2026-10-31T01:00:00Z')+(++sequence)*30000).toISOString();
  const record=async(game,id,outcome='win',{opponents=1,difficulty='hard',variant=null,online=false,excluded=false,at=time()}={})=>{
   const round=randomUUID(),won=outcome==='win';lastRounds.set(game+':'+id,round);
   if(game==='bang')await db.query('insert into ojjuda_bang_internal.results values($1,$2,$3,$4)',[round,id,won,at]);
   else if(['tank','tour','ttang'].includes(game))await db.query(`insert into ojjuda_guest_internal.round_records
    (game,actor_key,user_id,round_id,value,source,achieved_at,opponents)
    values($1,'member:'||$2,$2::uuid,$3,$4,'solo',$5,$6)`,[game,id,round,Number(won),at,game==='tank'?opponents:null]);
   else{
    const kind=variant||(game==='billiards'?'carom4':game);
    if(online)await db.query("insert into public.board_games values($1,$2,null,$3,'done',$4,$5,$6)",
     [round,id,kind,won?'p1':outcome==='draw'?'draw':'p2',at,excluded?['p1']:[]]);
    else await db.query('insert into ojjuda_game_internal.practice_results values($1,$2,$3,$4,$5,$6)',[id,round,kind,difficulty,outcome,at]);
   }
   return {round,at};
  };
  const list=game=>value('select public.community_game_monthly_ranking($1) value',[game]);
  const own=async(game,id)=>{await claim(id);return (await list(game)).find(row=>row.me)||null;};
  const periodOwn=async(game,id,period)=>{
   await claim(id);return (await value('select ojjuda_guest_internal.criteria_ranking($1,$2,null) value',[game,period])).find(row=>row.me)||null;
  };
  const current=async(game,id)=>{
   if(game==='bang')return Number((await value('select ojjuda_bang_internal.player_record($1,$2) value',[id,lastRounds.get(game+':'+id)]))?.streak||0);
   const query=game==='tank'
    ? 'select score value from ojjuda_guest_internal.tank_candidates($1,$2) where user_id=$3'
    : boards.includes(game)
     ? 'select score value from ojjuda_guest_internal.streak_candidates($4,$1,$2) where user_id=$3'
     : 'select score value from ojjuda_guest_internal.round_leaders($4,$1,$2) where user_id=$3';
   const row=(await db.query(query,game==='tank'?[start,end,id]:[start,end,id,game])).rows[0];
   return Number(row?.value||0);
  };
  const candidate=async(game,id)=>(await db.query('select * from ojjuda_ranking_internal.candidates($1,$2,$3) where user_id=$4',[game,start,'2026-10-31T16:00:00Z',id])).rows[0];
  const definitions=async()=>(await db.query(`select p.oid::regprocedure::text signature,
   md5(pg_get_functiondef(p.oid)) body,p.proowner::regrole::text owner,p.proacl::text acl,p.prosecdef,p.proconfig
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname like 'ojjuda_%' or n.nspname='public' order by signature`)).rows;
  const raw=async()=>({
   rounds:(await db.query('select * from ojjuda_guest_internal.round_records order by round_id')).rows,
   bang:(await db.query('select * from ojjuda_bang_internal.results order by room_id')).rows,
   boards:(await db.query('select * from public.board_games order by id')).rows,
   practice:(await db.query('select * from ojjuda_game_internal.practice_results order by round_id')).rows,
   economy:(await db.query('select * from fixture.economy')).rows
  });

  const pattern=[...Array(3).fill('win'),'loss','win','loss',...Array(5).fill('win'),'loss','win','win'];
  const reached=new Map();
  for(const game of games){
   const id=await member('최고기록-'+game);main.set(game,id);
   for(const [index,outcome] of pattern.entries()){
    const result=await record(game,id,outcome);if(index===10)reached.set(game,result.at);
   }
   assert.equal((await own(game,id)).score,2,'old display reproduces the current-streak-only problem in '+game);
   assert.equal(await current(game,id),2);
  }
  const beforeDefinitions=await definitions(),beforeRows=await raw();
  await db.exec(read(bestStreakMigrationName));
  const afterDefinitions=await definitions(),afterByName=new Map(afterDefinitions.map(row=>[row.signature,row]));
  assert.deepEqual(beforeDefinitions.filter(row=>row.body!==afterByName.get(row.signature)?.body).map(row=>row.signature).sort(),[
   'ojjuda_guest_internal.criteria_ranking(text,text,text)',
   'ojjuda_ranking_internal.candidates(text,timestamp with time zone,timestamp with time zone)',
   'ojjuda_ranking_internal.round_participants(text,timestamp with time zone,timestamp with time zone)',
   'ojjuda_ranking_internal.tank_participants(timestamp with time zone,timestamp with time zone)'
  ].sort(),'only display readers change; current counters, positive reward helpers and writers stay intact');
  for(const row of beforeDefinitions){
   const {body,...security}=row,{body:afterBody,...afterSecurity}=afterByName.get(row.signature);
   assert.deepEqual(afterSecurity,security,row.signature+' preserves its grants and execution security');
  }
  assert.deepEqual(await raw(),beforeRows,'calculating best streaks does not rewrite outcomes or balances');
  await db.exec(read(excludeZeroMigrationName));
  assert.deepEqual(await raw(),beforeRows,'excluding zero display rows does not rewrite outcomes or balances');

  for(const game of games){
   const id=main.get(game),row=await own(game,id);
   assert.equal(row.score,5,game+' 3-L-1-L-5-L-2 retains the monthly best of five');
   assert.equal(await current(game,id),2,game+' personal/current helper still reports two');
   assert.equal(Date.parse((await candidate(game,id)).achieved_at),Date.parse(reached.get(game)),'tie time is the fifth win, not a later loss or lower run');
   if(['bang','tour','ttang'].includes(game))assert.equal(row.source,'best_streak');
   if(game!=='bang')for(const period of ['day','all'])assert.equal((await periodOwn(game,id,period)).score,5);
   await record(game,id,'loss');assert.equal(await current(game,id),0);assert.equal((await own(game,id)).score,5);
   await record(game,id);await record(game,id);assert.equal(await current(game,id),2);assert.equal((await own(game,id)).score,5);
   for(let n=0;n<4;n++)await record(game,id);
   assert.equal((await own(game,id)).score,6,'a new six-win run improves the best');
   await record(game,id,'loss');assert.equal(await current(game,id),0);assert.equal((await own(game,id)).score,6);
  }

  // A loss across conditions separates runs, while retaining the earlier best.
  const tank=await member('탱크구간');
  await record('tank',tank);await record('tank',tank);await record('tank',tank,'loss',{opponents:11});
  await record('tank',tank);assert.equal((await own('tank',tank)).score,2,'wins across another-field loss are not joined into three');
  await record('tank',tank);await record('tank',tank);assert.equal((await own('tank',tank)).score,3);
  await record('tank',tank,'loss',{opponents:null});await record('tank',tank);
  assert.equal((await own('tank',tank)).score,3,'a missing-field loss also separates the next run');
  const unknown=await member('상대수없는승리');await record('tank',unknown,'win',{opponents:null});
  assert.equal(await own('tank',unknown),null);
  for(const game of boards){
   const id=await member('조건변경-'+game);
   await record(game,id);await record(game,id);await record(game,id,'loss',{difficulty:'easy'});
   await record(game,id);assert.equal((await own(game,id)).score,2,'different-difficulty loss separates '+game+' runs');
   await record(game,id);await record(game,id);assert.equal((await own(game,id)).score,3);
   await record(game,id,'draw',{online:true});await record(game,id);
   assert.equal((await own(game,id)).score,3,'online draw separates practice runs without erasing the best');
   await record(game,id,'win',{online:true});assert.equal((await own(game,id)).difficulty,'online');assert.equal((await own(game,id)).score,1);
   await record(game,id,'loss',{difficulty:'easy'});await record(game,id,'win',{online:true});
   assert.equal((await own(game,id)).score,1,'practice loss separates two online wins');
   await record(game,id,'win',{online:true});assert.equal((await own(game,id)).score,2);
  }

  const mixedTank=await member('혼합상대승리');
  for(const opponents of [1,11,1])await record('tank',mixedTank,'win',{opponents});
  assert.equal((await own('tank',mixedTank)).score,1);assert.equal((await own('tank',mixedTank)).opponents,11);
  assert.equal((await list('tank'))[0].nick,'혼합상대승리','positive opponent priority is retained ahead of a longer easier-field best');
  for(const game of boards){
   const id=await member('혼합난이도-'+game);
   for(const difficulty of ['hard','easy','normal'])await record(game,id,'win',{difficulty});
   const row=await own(game,id);assert.equal(row.score,1);assert.equal(row.difficulty,'hard','mixed levels do not inflate the hard best');
  }
  const billiards=await member('당구종목구간');
  await record('billiards',billiards);await record('billiards',billiards);
  await record('billiards',billiards,'loss',{variant:'pool8'});await record('billiards',billiards);
  assert.equal((await own('billiards',billiards)).score,2);assert.equal((await own('carom4',billiards)).score,2);
  assert.equal(await own('pool8',billiards),null,'a variant with only a loss has no positive ranking record');assert.equal(await own('carom3',billiards),null);
  await record('billiards',billiards);await record('billiards',billiards);assert.equal((await own('carom4',billiards)).score,3);
  await record('billiards',billiards,'draw',{variant:'carom3'});await record('billiards',billiards);
  assert.equal((await own('carom4',billiards)).score,3,'individual billiards requests share the cross-variant loss/draw boundary');

  for(const game of games){
   const early=await member('먼저달성-'+game),late=await member('나중달성-'+game);
   for(const minute of [10,11,12])await record(game,early,'win',{at:`2026-10-31T00:${minute}:00Z`});
   for(const minute of [1,2,20])await record(game,late,'win',{at:`2026-10-31T00:${String(minute).padStart(2,'0')}:00Z`});
   await record(game,early,'loss',{at:'2026-10-31T10:00:00Z'});
   for(const minute of [1,2,3])await record(game,early,'win',{at:`2026-10-31T11:0${minute}:00Z`});
   assert.equal(Date.parse((await candidate(game,early)).achieved_at),Date.parse('2026-10-31T00:12:00Z'),'an equal later run never replaces the first attainment');
   const rows=await list(game),earlyIndex=rows.findIndex(row=>row.nick==='먼저달성-'+game),lateIndex=rows.findIndex(row=>row.nick==='나중달성-'+game);
   assert.ok(earlyIndex>=0&&lateIndex>earlyIndex,game+' ties use completion of the best, not first play or last activity');
   const zero=await member('첫판패배-'+game);await record(game,zero,'loss');assert.equal(await own(game,zero),null,'zero streaks never qualify');
   assert.equal(await own(game,never),null);
  }

  for(const game of boards){
   const id=await member('제외판경계-'+game);
   await record(game,id,'win',{online:true});await record(game,id,'win',{online:true});
   await record(game,id,'loss',{online:true,excluded:true});await record(game,id,'win',{online:true});
   assert.equal((await own(game,id)).score,3,'AI-excluded loss neither divides nor increases the eligible run');
   const excluded=await member('대행판만-'+game);await record(game,excluded,'win',{online:true,excluded:true});
   assert.equal(await own(game,excluded),null,'an excluded seat has no qualifying record');
  }
  await claim(never);await db.exec('set role authenticated');
  for(const query of [
   "select * from ojjuda_ranking_internal.board_participants('chess','-infinity','infinity')",
   "select * from ojjuda_ranking_internal.bang_participants('-infinity','infinity')"
  ])await assert.rejects(db.query(query),/permission denied/);
  await db.exec('reset role');

  const leaders=await value('select public.community_game_monthly_leaders($1) value',[games]);
  await clock('2026-10-31T16:00:00Z');assert.equal(await value("select ojjuda_ranking_internal.close_month('2026-10-01') value"),true);
  const archive=await value("select public.community_game_monthly_history($1,'2026-10-01') value",[games]);
  assert.deepEqual(archive.leaders,leaders);assert.equal(archive.months.find(month=>month.month==='2026-10').hasRecords,true);
  const frozen=await value("select winners value from ojjuda_ranking_internal.archives where month_start='2026-10-01'");
  const empty=await value('select public.community_game_monthly_leaders($1) value',[games]);assert.ok(games.every(game=>empty[game]===null),'new month starts without old bests');
  for(const game of games){
   const id=main.get(game);await record(game,id,'win',{at:'2026-10-31T16:01:00Z'});await record(game,id,'win',{at:'2026-10-31T16:02:00Z'});
  }
  await clock('2026-10-31T16:03:00Z');
  for(const game of games)assert.equal((await own(game,main.get(game))).score,2,'new-month best is independent of the archived best');
  await db.query("update profiles set nickname='바뀐닉네임' where id=$1",[main.get('bang')]);
  for(let n=0;n<10;n++)await record('bang',main.get('bang'),'win',{at:`2026-10-31T11:${String(30+n).padStart(2,'0')}:00Z`});
  assert.equal(await value("select ojjuda_ranking_internal.close_month('2026-10-01') value"),false);
  assert.deepEqual(await value("select winners value from ojjuda_ranking_internal.archives where month_start='2026-10-01'"),frozen,'later activity and nickname changes never rewrite a closed best');
  assert.deepEqual((await db.query('select * from fixture.economy')).rows,[{wallet_gold:12345,coupon_count:7}]);
  console.log('PASS: all seven games keep best 5/current 2 for 3-L-1-L-5-L-2; losses/lower runs preserve the best and larger runs improve it; cross-condition loss/draw splits, unchanged condition priority, earliest-best ties, AI exclusion, zero exclusion, private helpers, new-month reset and immutable best archives.');
 }finally{await db.close();}
})().catch(error=>{delete error.query;console.error(error.message,error.where||'',error.stack);process.exitCode=1;});
