const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');
const { createFixture, definition, read: migration } = require('./monthly-game-rankings-fixture.cjs');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const math = Object.create(Math);
math.random = () => 0; // Every spawned mole is golden and the first free hole is used.
const runtime = vm.createContext({window: {}, navigator: {}, Math: math});
vm.runInContext(read('games/mole/ranking.js'), runtime);
vm.runInContext(read('games/mole/mole-game.js'), runtime);
const {rankingScore, rankingRecord, create} = runtime.window.OjjudaMoleGame;

test('a real 30-second round retains all hits at 60 FPS on all four grids', () => {
  const geometry = {3:[60,190,120,115,363],4:[51,184,86,89,810],
    5:[42,183,69,67,1341],6:[40,182,56,54,1956]};
  for (const [size, [left,top,dx,dy,expected]] of Object.entries(geometry)) {
    const grid = Number(size);
    let hud, finished;
    const game = create({setScore: score => {hud = score;}, end: score => {finished = score;}}, grid);
    for (let frame=0; frame<1802; frame++) {
      game.update(1/60);
      for (let hole=0; hole<game.holeCount; hole++) {
        game.onDown(left+hole%grid*dx,top+Math.floor(hole/grid)*dy);
      }
    }
    assert.equal(finished, expected);
    assert.equal(hud, expected);
    assert.equal(rankingRecord(rankingScore(grid, finished)).points, expected);
    assert.equal(rankingRecord(rankingScore(grid, finished)).grid, grid);
  }
  for (const grid of [3,4,5,6]) {
    for (const points of [1,999,1000,1341,1956,499999999]) {
      const record = rankingRecord(rankingScore(grid,points));
      assert.equal(record.grid,grid);assert.equal(record.points,points);
    }
    assert.equal(rankingScore(grid,0),0);
    if (grid < 6) assert.ok(rankingScore(grid,499999999) < rankingScore(grid+1,1));
    assert.equal(rankingRecord((grid-3)*1000+999).points,999);
    assert.equal(rankingRecord((grid-3)*1000+999).grid,grid);
  }
});

test('HUD abbreviates raw points and preserves the value passed to saving', () => {
  const world = read('world.html');
  const draw = world.slice(world.indexOf('function Ja('),world.indexOf('function D2()',world.indexOf('function Ja(')));
  const context = vm.createContext({window:{},_r:{}});
  vm.runInContext(read('shared/games/score-format.js'),context);
  vm.runInContext(draw,context);
  for (const [id,unit,shown] of [['mole','점','1.3K점'],['runner','점','1.3K점'],
    ['breakout','점','1.3K점'],['screw','점','1.3K점'],['stacker','층','1341층'],['mines','초','1341초']]) {
    const label = {}; let saved;
    context.R={id,running:true,saveScore:score=>{saved=score;},ov:{querySelector:()=>label}};
    context._r[id]={unit};
    context.Ja(1341);
    assert.equal(context.R.score,1341);assert.equal(saved,1341);assert.equal(label.textContent,shown);
    if(unit==='점') assert.equal(label.title,'1,341점');
  }
});

test('monthly top ten and personal row show the grid and real points in both formats', async t => {
  const dom = new JSDOM(read('features/arcade/monthly-ranking.html'), {
    url:'https://fixture.test/features/arcade/monthly-ranking.html?game=mole',runScripts:'outside-only'
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.AbortSignal = AbortSignal;
  w.OJJUDA_CONFIG = {supabaseUrl:'https://fixture.test',supabaseKey:'test'};
  const data = {month:'2026-11',startsAt:'2026-10-31T16:00:00Z',endsAt:'2026-11-30T16:00:00Z',
    leaders:[{nick:'새 기록',score:rankingScore(6,1956)}, {nick:'예전 기록',score:2999}],
    mine:{rank:12,nick:'내 기록',score:rankingScore(4,1000),me:true}};
  w.supabase = {createClient:() => ({auth:{onAuthStateChange(){},async getSession(){return {data:{session:null}};}},
    rpc:() => ({abortSignal:async () => ({data,error:null})})})};
  for (const file of ['games/mole/ranking.js','shared/games/score-format.js','features/arcade/monthly-ranking.js']) {
    assert.ok([...w.document.scripts].some(script=>new URL(script.src).pathname==='/'+file),file);
    w.eval(read(file));
  }
  await new Promise(resolve=>setImmediate(resolve));
  const rows = [...w.document.querySelectorAll('.rank-row')];
  assert.deepEqual(rows.map(row=>row.querySelector('.rank-points').textContent),['2.0K점','999점','1.0K점']);
  assert.deepEqual(rows.map(row=>row.querySelector('.rank-points').title),['1,956점','999점','1,000점']);
  for (const [i,grid] of [6,5,4].entries()) assert.match(rows[i].textContent,new RegExp(grid+'×'+grid));
});

test('old and new member/guest records share ordered daily, monthly and archive results', async t => {
  const {db,clock,claim,actor} = await createFixture();
  t.after(() => db.close());
  const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0].v;
  const old = read('tests/fixtures/continuous-score-functions-before.sql');
  const targets = ['ojjuda_game_internal.submit_score','ojjuda_game_internal.community_game_ranking',
    'ojjuda_game_internal.community_game_monthly_ranking','ojjuda_guest_internal.score_limit'];
  for (const name of targets) {
    await db.exec(definition(old,name).replace(/\b(?:clock_timestamp|statement_timestamp|now)\(\)/g,'fixture.clock()'));
  }
  await db.exec(`alter table public.game_scores add column nick text, add column reward integer, add column verified boolean;
    alter table public.user_private add column coins integer;
    create function public.submit_score(p_game text,p_score integer) returns json language sql as $$
      select ojjuda_game_internal.submit_score(p_game,p_score) $$;`);
  const [a,b,c] = [randomUUID(),randomUUID(),randomUUID()];
  for (const [id,nick] of [[a,'A'],[b,'B'],[c,'C']]) {
    await actor(id,nick);
    await db.query('insert into public.user_private(user_id,coins) values($1,100)',[id]);
  }
  const submit = score => value("select public.submit_score('mole',$1) v",[score]);
  const token = 'ab'.repeat(32);
  const guest = (score,req=randomUUID()) => value("select public.submit_guest_game_score('mole',$1,$2,$3) v",[score,token,req]);
  const rows = () => value("select public.community_game_monthly_ranking('mole') v");
  const getArchive = () => value("select winners->'mole'->'score' v from ojjuda_ranking_internal.archives where month_start='2026-10-01'");
  await clock('2026-10-31T13:00:00Z');await claim(a);
  assert.equal((await submit(3042)).best,3042);
  await clock('2026-11-17T10:00:00Z');await db.exec("select ojjuda_ranking_internal.close_month('2026-10-01')");
  assert.equal(await getArchive(),3042);
  await claim(a);assert.equal((await submit(3999)).best,3999);
  await claim(null);const oldRequest=randomUUID();assert.equal((await guest(2999,oldRequest)).best,2999);
  const upgrade = migration('20261117231000_mole_extended_scores.sql');
  await db.exec(upgrade);await db.exec(upgrade);
  assert.equal(await getArchive(),3042,'published snapshots retain their original bytes');
  assert.equal((await guest(2999,oldRequest)).best,rankingScore(5,999));
  assert.equal((await guest(2998,oldRequest)).reason,'request_conflict');
  assert.equal(await value("select last_score v from ojjuda_guest_internal.scores where game='mole'"),2999);
  const firstTime = await value("select achieved_at::text v from ojjuda_ranking_internal.guest_peaks where game='mole'");
  await clock('2026-11-17T10:00:10Z');
  assert.equal((await guest(rankingScore(4,1956))).best,rankingScore(5,999));
  assert.equal(await value("select achieved_at::text v from ojjuda_ranking_internal.guest_peaks where game='mole'"),firstTime);
  await claim(b);assert.equal((await submit(rankingScore(5,1341))).best,rankingScore(5,1341));
  await claim(c);assert.equal((await submit(3001)).best,rankingScore(6,1),'cached old client can submit after rollout');
  const middle=(await rows()).map(row=>row.score);
  assert.deepEqual(middle,[rankingScore(6,999),rankingScore(6,1),rankingScore(5,1341),rankingScore(5,999)]);
  await clock('2026-11-17T10:00:20Z');await claim(null);
  const newRequest=randomUUID(),high=rankingScore(6,1956);
  assert.equal((await guest(high,newRequest)).best,high);
  assert.equal((await guest(high,newRequest)).best,high);
  await claim(b);assert.equal((await submit(high)).best,high);
  await clock('2026-11-17T10:00:25Z');await claim(a);
  assert.equal((await submit(high)).best,high);
  const leaders=await rows();
  assert.deepEqual(leaders.map(row=>row.score),[high,high,high,rankingScore(6,1)]);
  assert.equal(leaders[2].nick,'A','later tied result stays behind both earlier scores');
  for (const name of ['community_game_ranking','community_game_monthly_ranking']) {
    const internal=await value(`select ojjuda_game_internal.${name}('mole') v`);
    assert.equal(internal[0].score,high,'older member-only ranking can read extended scores');
  }
  const publicDaily=await value("select public.community_game_ranking('mole') v");
  assert.equal(publicDaily[0].score,high);
  await claim(null);
  for (const period of ['day','month']) {
    const guestRows=await value('select ojjuda_guest_internal.ranking($1,$2,$3) v',['mole',period,token]);
    assert.equal(guestRows.find(row=>row.me).score,high);
  }
  await clock('2026-12-01T13:00:00Z');
  await db.exec("select ojjuda_ranking_internal.close_month('2026-11-01')");
  const november=await value("select winners->'mole'->'score' v from ojjuda_ranking_internal.archives where month_start='2026-11-01'");
  assert.equal(november,high);assert.equal(rankingRecord(november).points,1956);
  assert.equal(await getArchive(),3042);
});
