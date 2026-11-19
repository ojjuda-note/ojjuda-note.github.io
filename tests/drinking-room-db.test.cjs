'use strict';

const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const test = require('node:test');
const {fixture} = require('./drinking-room-fixture.cjs');

const kinds = ['croc','bottle','bomb','stopwatch','liar','king','truth','initial','minority','mission','fingers','imagevote','updown','secretcount','partyroulette'];
const roomTables = ['drinking_rooms','croc_rooms','liar_rooms','king_rooms','party_vote_rooms'];

// Exercise a chosen random outcome without replacing the production draw or
// accepting a flaky test that sometimes never reaches the extra chamber.
async function seedRouletteDraw(db, chambers, expected) {
  for(let i=-100;i<=100;i++){
    const seed=i/100;
    await db.query('select setseed($1)',[seed]);
    const value=(await db.query('select random() value')).rows[0].value;
    if(Math.floor(value*chambers)!==expected)continue;
    await db.query('select setseed($1)',[seed]);
    return;
  }
  throw Error('No deterministic seed found for roulette chamber '+expected);
}

test('drinking rooms retain consistent state through overlapping account requests', {timeout: 120_000}, async t => {
  const f = await fixture();
  t.after(() => f.close());
  const {db, users, names, publicRpc} = f;
  const room = (actor, action, code = '', options = {}) => publicRpc(actor, 'drinking_room', [action, code, options]);
  const native = (actor, kind, action, code = '', options = {}) => {
    if (['croc','liar','king'].includes(kind)) return publicRpc(actor, kind + '_multiplayer', [action, code, options]);
    return publicRpc(actor, ['mission','minority'].includes(kind) ? 'party_vote_multiplayer' : 'party_live_multiplayer', [kind, action, code, options]);
  };
  const reset = () => db.exec(`truncate ${roomTables.map(table => 'ojjuda_arcade_internal.' + table).join(',')},
    ojjuda_arcade_internal.drinking_ops,ojjuda_arcade_internal.drinking_attempts cascade`);
  const createOptions = (capacity = 12) => ({title: '연결 안정화 테스트', capacity, password: 'test-pass', request_id: randomUUID()});
  async function sharedRoom(count = 12) {
    const created = await room(users[0], 'create', '', createOptions(count));
    await Promise.all(users.slice(1, count).map(actor => room(actor, 'join', created.code, {password: 'test-pass'})));
    return room(users[0], 'state', created.code);
  }
  async function directRoom(kind, count = 3) {
    const created = await native(users[0], kind, 'create', '', createOptions(count));
    await Promise.all(users.slice(1, count).map(actor => native(actor, kind, 'join', created.code, {password: 'test-pass'})));
    return native(users[0], kind, 'state', created.code);
  }

  await t.test('12 seats, overlapping joins, overflow, duplicate create and join', async () => {
    const options = createOptions();
    const [first, retry] = await Promise.all([
      room(users[0], 'create', '', options), room(users[0], 'create', '', options)
    ]);
    assert.equal(first.code, retry.code);
    assert.equal(first.revision, retry.revision);
    // PGlite serializes these transactions. Overlapping promises verify account
    // isolation and legal request orderings, not simultaneous database sessions.
    const joining = await Promise.allSettled(users.slice(1, 13).map(actor => room(actor, 'join', first.code, {password: 'test-pass'})));
    assert.equal(joining.filter(result => result.status === 'fulfilled').length, 11);
    assert.equal(joining.filter(result => result.status === 'rejected').length, 1);
    assert.match(joining.find(result => result.status === 'rejected').reason.message, /room_full/);
    const accepted = users.slice(1, 13).filter((_, i) => joining[i].status === 'fulfilled');
    const state = await room(users[0], 'state', first.code);
    assert.equal(state.players.length, 12);
    assert.equal(new Set(state.players).size, 12);
    const snapshots = await Promise.all([users[0], ...accepted].map(actor => room(actor, 'state', first.code)));
    for (const [i, snapshot] of snapshots.entries()) {
      assert.deepEqual(snapshot.players, state.players);
      assert.equal(snapshot.revision, state.revision);
      assert.equal(snapshot.players[snapshot.me], names[users.indexOf([users[0], ...accepted][i])]);
    }
    const repeatJoin = await room(accepted[0], 'join', first.code, {password: 'test-pass'});
    assert.equal(repeatJoin.revision, state.revision);
    assert.deepEqual(repeatJoin.players, state.players);
    await assert.rejects(room(users[0], 'create', '', createOptions()), /room_in_progress/);
    assert.equal((await db.query('select count(*)::int n from ojjuda_arcade_internal.drinking_rooms')).rows[0].n, 1);
  });

  await t.test('all 15 games preserve the same 12 accounts across start, retry and return', async () => {
    await reset();
    let parent = await sharedRoom();
    const originalPlayers = parent.players;
    const originalCode = parent.code;
    let previousChild;
    for (const kind of kinds) {
      const start = {kind, revision: parent.revision, request_id: randomUUID()};
      parent = await room(users[0], 'start', originalCode, start);
      const retried = await room(users[0], 'start', originalCode, start);
      assert.equal(retried.child, parent.child, kind + ' start is idempotent');
      assert.equal(retried.revision, parent.revision);
      assert.equal(parent.phase, 'playing');
      assert.deepEqual(parent.players, originalPlayers);
      if (previousChild) await assert.rejects(native(users[0], previousChild.kind, 'state', previousChild.code), /room_unavailable/);
      const snapshots = await Promise.all(users.slice(0, 12).map(actor => native(actor, kind, 'state', parent.child)));
      for (const [i, snapshot] of snapshots.entries()) {
        const labels=kind==='partyroulette'?originalPlayers.map((_,j)=>(j+1)+'번'):originalPlayers;
        assert.equal(snapshot.players[snapshot.me],labels[i],kind+' private seat');
        assert.deepEqual(snapshot.players,labels,kind+' roster');
        assert.equal(snapshot.revision, snapshots[0].revision, kind + ' revision');
        assert.notEqual(snapshot.phase, 'waiting', kind + ' starts once');
        assert.equal('password_hash' in snapshot, false);
        assert.equal('members' in snapshot, false);
        assert.equal('cards' in snapshot, false, 'the complete private deal is never returned');
      }
      if (kind === 'croc') assert.equal(snapshots[0].trap, null);
      await assert.rejects(native(users[13], kind, 'state', parent.child), /not_room_member/);
      await assert.rejects(native(users[0], kind, 'leave', parent.child), /managed_room/);
      previousChild = {kind, code: parent.child};
      parent = await room(users[0], 'return', originalCode, {revision: parent.revision, request_id: randomUUID()});
      assert.equal(parent.phase, 'lobby');
      assert.equal(parent.code, originalCode);
      assert.deepEqual(parent.players, originalPlayers);
    }
    const childCount = await db.query(`select ${roomTables.slice(1).map(table => `(select count(*) from ojjuda_arcade_internal.${table} where drinking_code=$1)`).join('+')} as n`, [originalCode]);
    assert.equal(Number(childCount.rows[0].n), 0);
  });

  await t.test('12 overlapping stopwatch scores survive shared revisions and lost replies', async () => {
    await reset();
    let parent = await sharedRoom();
    parent = await room(users[0], 'start', parent.code, {kind: 'stopwatch', revision: parent.revision, request_id: randomUUID()});
    let game = await native(users[0], 'stopwatch', 'state', parent.child);
    game = await native(users[0], 'stopwatch', 'watch_begin', game.code, {target: 50, round: game.round, revision: game.revision, request_id: randomUUID()});
    const expected = users.slice(0, 12).map((_, i) => 4900 + i * 25);
    const requests = expected.map(score => ({score, round: game.round, revision: game.revision, request_id: randomUUID()}));
    const submitted = await Promise.all(users.slice(0, 12).map((actor, i) => native(actor, 'stopwatch', 'watch_score', game.code, requests[i])));
    assert.equal(submitted.length, 12);
    const final = await native(users[0], 'stopwatch', 'state', game.code);
    assert.equal(final.phase, 'done');
    assert.equal(final.game.submitted, 12);
    assert.deepEqual(final.game.scores, expected);
    const retry = await native(users[0], 'stopwatch', 'watch_score', game.code, requests[0]);
    assert.equal(retry.revision, final.revision);
    assert.deepEqual(retry.game.scores, expected);
    await assert.rejects(native(users[0], 'stopwatch', 'watch_score', game.code, {...requests[0], score: 9999, request_id: randomUUID()}), /stale_state|already_scored|unavailable/);
    assert.deepEqual((await native(users[1], 'stopwatch', 'state', game.code)).game.scores, expected);
  });

  await t.test('overlapping votes count once and an old round cannot alter the next round', async () => {
    await reset();
    const game = await directRoom('minority', 12);
    assert.equal(game.phase, 'vote');
    const ballot = users.slice(0, 12).map((actor, i) => native(actor, 'minority', 'vote', game.code, {round: game.round, target: i % 2}));
    await Promise.all(ballot);
    const final = await native(users[0], 'minority', 'state', game.code);
    assert.equal(final.phase, 'done');
    assert.equal(final.voteCount, 12);
    assert.deepEqual(final.votes, Array.from({length: 12}, (_, i) => i % 2));
    const retry = await native(users[0], 'minority', 'vote', game.code, {round: game.round, target: 0});
    assert.equal(retry.revision, final.revision);
    assert.equal(final.hostSeat,1);
    const next = await native(users[final.hostSeat], 'minority', 'again', game.code, {round: final.round});
    assert.equal(next.round, final.round + 1);
    await assert.rejects(native(users[1], 'minority', 'vote', game.code, {round: game.round, target: 0}), /stale_round/);
    await assert.rejects(native(users[0], 'minority', 'again', game.code, {round: final.round}), /stale_round/);
    assert.equal((await native(users[0], 'minority', 'state', game.code)).voteCount, 0);
  });

  await t.test('finishing a shared game transfers lobby control without changing the result seats',async()=>{
    await reset();
    let parent=await sharedRoom(3);
    parent=await room(users[0],'start',parent.code,{kind:'croc',revision:parent.revision,request_id:randomUUID()});
    const original=parent.players;
    let child=await native(users[0],'croc','state',parent.child);
    const trap=(await db.query('select trap from ojjuda_arcade_internal.croc_rooms where code=$1',[parent.child])).rows[0].trap;
    child=await native(users[0],'croc','tooth',parent.child,{tooth:(trap+1)%24,revision:child.revision});
    child=await native(users[1],'croc','tooth',parent.child,{tooth:trap,revision:child.revision});
    assert.equal(child.phase,'done');assert.equal(child.hostSeat,1);assert.deepEqual(child.players,original);
    parent=await room(users[1],'state',parent.code);
    assert.equal(parent.me,parent.hostSeat);
    const opts={revision:parent.revision,request_id:randomUUID()};
    await assert.rejects(room(users[0],'return',parent.code,opts),/host_only/);
    const next=await room(users[1],'return',parent.code,opts);
    assert.equal(next.me,0);assert.equal(next.hostSeat,0);assert.equal(next.players[0],original[1]);
    assert.deepEqual((await room(users[1],'return',parent.code,opts)).players,next.players);
  });

  await t.test('every result chooses the expected host, including ties and rounds without a winner',async()=>{
    const cases=[
      ['croc',{loser:2},2],['liar',{liar_slot:2},2],['mission',{odd_slot:2},2],
      ['king',{cards:[0,2,1],chosen:1,chosen_second:2},1],['minority',{votes:[0,0,1]},2],
      ['minority',{votes:[0,0,0]},1],['truth',{},1],['fingers',{game_state:{losers:[0,2]}},2],
      ['imagevote',{game_state:{winners:[2,1]}},1],['bomb',{game_state:{loser:2}},2],
      ['stopwatch',{game_state:{target:80,scores:[650,900,801]}},2],
      ...['bottle','updown','initial','secretcount'].map(k=>[k,{game_state:{winner:2}},2])
    ];
    for(const [kind,state,seat] of cases){
      const res=await db.query('select ojjuda_arcade_internal.drinking_result_seat($1,$2::jsonb,3) seat',[kind,JSON.stringify(state)]);
      assert.equal(res.rows[0].seat,seat,kind);
    }
  });

  await t.test('host handoff preserves the room and a lost leave response is safe to retry', async () => {
    await reset();
    let parent = await sharedRoom();
    parent = await room(users[0], 'start', parent.code, {kind: 'liar', revision: parent.revision, request_id: randomUUID()});
    const leave = {revision: parent.revision, request_id: randomUUID()};
    assert.deepEqual(await room(users[0], 'leave', parent.code, leave), {left: true});
    assert.deepEqual(await room(users[0], 'leave', parent.code, leave), {left: true});
    const remaining = await Promise.all(users.slice(1, 12).map(actor => room(actor, 'state', parent.code)));
    const state = remaining[0];
    assert.equal(state.phase, 'lobby');
    assert.equal(state.players.length, 11);
    assert.equal(state.players.includes(names[0]), false);
    assert.equal(remaining.filter(snapshot => snapshot.me === 0).length, 1);
    for (const [i, snapshot] of remaining.entries()) {
      assert.equal(snapshot.code, parent.code);
      assert.deepEqual(snapshot.players, state.players);
      assert.equal(snapshot.players[snapshot.me], names[i + 1]);
    }
    await assert.rejects(native(users[1], 'liar', 'state', parent.child), /room_unavailable/);
    await assert.rejects(room(users[0], 'state', parent.code), /not_room_member/);
    const newHost = users[names.indexOf(state.players[0])];
    const restarted = await room(newHost, 'start', parent.code, {kind: 'croc', revision: state.revision, request_id: randomUUID()});
    assert.equal(restarted.phase, 'playing');
    assert.equal(restarted.players.length, 11);
  });

  await t.test('all four native engines retain correct seats when the host leaves', async () => {
    for (const kind of ['croc', 'liar', 'king', 'minority']) {
      await reset();
      const original = await directRoom(kind);
      assert.deepEqual(await native(users[0], kind, 'leave', original.code, {round: original.round, waiting: false, host: true}), {left: true});
      const a = await native(users[1], kind, 'state', original.code);
      const b = await native(users[2], kind, 'state', original.code);
      assert.equal(a.phase, 'waiting', kind);
      assert.equal(a.round, original.round + 1);
      assert.deepEqual(new Set(a.players), new Set(names.slice(1, 3)));
      assert.deepEqual(a.players, b.players);
      assert.deepEqual(new Set([a.me, b.me]), new Set([0, 1]));
      const rejoined = await native(users[3], kind, 'join', original.code, {password: 'test-pass'});
      assert.equal(rejoined.players.length, 3);
      assert.equal(rejoined.round, a.round);
      assert.notEqual(rejoined.phase, 'waiting');
    }
  });

  await t.test('stale shared-room actions and unauthorized reads leave data unchanged', async () => {
    await reset();
    const created = await room(users[0], 'create', '', createOptions(3));
    const joined = await room(users[1], 'join', created.code, {password: 'test-pass'});
    await assert.rejects(room(users[0], 'start', created.code, {kind: 'croc', revision: created.revision, request_id: randomUUID()}), /stale_state/);
    await assert.rejects(room(users[1], 'select', created.code, {kind: 'croc', revision: joined.revision, request_id: randomUUID()}), /host_only/);
    await assert.rejects(room(users[13], 'state', created.code), /not_room_member/);
    assert.deepEqual(await room(users[12], 'join', created.code, {password: 'wrong-pass'}), {error: 'wrong_password'});
    await assert.rejects(room(users[14], 'join', created.code, {password: 'test-pass'}), /adult_required/);
    await assert.rejects(room(users[15], 'join', created.code, {password: 'test-pass'}), /not_signed_in/);
    await assert.rejects(publicRpc('', 'drinking_room', ['state', created.code], 'anon'), /permission denied/);
    await assert.rejects(db.transaction(async tx => {
      await tx.exec('set local role authenticated');
      return tx.query('select password_hash from ojjuda_arcade_internal.drinking_rooms');
    }), /permission denied/);
    const after = await room(users[0], 'state', created.code);
    assert.equal(after.revision, joined.revision);
    assert.deepEqual(after.players, joined.players);
    assert.equal(after.phase, 'lobby');
    assert.equal(after.child, null);
  });

  await t.test('the last departure closes once and its receipt remains retryable', async () => {
    await reset();
    const parent = await room(users[0], 'create', '', createOptions(2));
    const leave = {revision: parent.revision, request_id: randomUUID()};
    const replies = await Promise.all([room(users[0], 'leave', parent.code, leave), room(users[0], 'leave', parent.code, leave)]);
    assert.deepEqual(replies, [{left: true}, {left: true}]);
    await assert.rejects(room(users[0], 'state', parent.code), /room_unavailable/);
    assert.deepEqual(await room(users[0], 'mine'), {room: null});
  });
});

test('explicit truth and minority choices are shared, turn-scoped, and cannot change a ballot after voting',async t=>{
  const f=await fixture();t.after(()=>f.close());const [a,b,c]=f.users;
  const act=(who,kind,action,code,opts)=>f.publicRpc(who,kind==='truth'?'party_live_multiplayer':'party_vote_multiplayer',[kind,action,code,opts||{}]);
  async function create(kind){let r=await act(a,kind,'create','',{title:'질문 선택',password:'abcd',capacity:3,request_id:randomUUID()});for(const who of [b,c])r=await act(who,kind,'join',r.code,{password:'abcd'});return act(a,kind,'state',r.code);}
  let r=await create('minority');assert.equal(r.choicesReady,false);const opt={round:r.round,revision:r.revision,choices:['첫 번째','두 번째']};
  await assert.rejects(act(b,'minority','minority_question',r.code,opt),/host_only/);
  const old=r.choices;r=await act(a,'minority','minority_question',r.code,opt);assert.deepEqual(r.choices,opt.choices);assert.equal((await act(c,'minority','state',r.code)).choicesReady,true);
  await assert.rejects(act(b,'minority','vote',r.code,{round:r.round,target:1,choices:old}),/choices_changed/);
  await assert.rejects(act(b,'minority','vote',r.code,{round:r.round,target:1}),/choices_changed/);
  r=await act(b,'minority','vote',r.code,{round:r.round,target:1,choices:r.choices});
  await assert.rejects(act(a,'minority','minority_question',r.code,{...opt,revision:r.revision}),/vote_started/);
  r=await create('truth');const move=(who,action,opts)=>act(who,'truth',action,r.code,{round:r.round,revision:r.revision,turn:r.game.turn,request_id:randomUUID(),...opts});
  r=await move(a,'truth_begin',{mode:'mild',deck:{mild:['기존 질문'],spicy:[]},catalog_revision:'20261114-drinking-rebuild1'});
  await assert.rejects(move(b,'truth_pick',{flavor:'mild',question:'누구의 차례?'}),/not_your_turn/);
  await assert.rejects(move(a,'truth_pick',{flavor:'spicy',question:'수위 확인'}),/invalid_flavor/);
  r=await move(a,'truth_pick',{flavor:'mild',question:'어떤 노래를 좋아해요?'});assert.equal(r.game.question,'어떤 노래를 좋아해요?');
  assert.equal((await act(c,'truth','state',r.code)).game.question,r.game.question);
});

test('truth completes three laps, synchronizes the toast, and rejects actions from a previous lap', async t=>{
  const f=await fixture();
  t.after(()=>f.close());
  const seats=f.users.slice(0,3);
  const rpc=(who,action,code,opts={})=>f.publicRpc(who,'party_live_multiplayer',['truth',action,code,opts]);
  let s=await rpc(seats[0],'create','',{title:'세 바퀴',capacity:3,password:'abcd',request_id:randomUUID()});
  for(const who of seats.slice(1))s=await rpc(who,'join',s.code,{password:'abcd'});
  const move=(who,action,opts={})=>rpc(who,action,s.code,{round:s.round,revision:s.revision,turn:s.game.turn,
    lap:s.game.lap,request_id:randomUUID(),...opts});
  const begin={mode:'mild',deck:{mild:['첫 질문','둘째 질문'],spicy:[]},catalog_revision:'20261114-drinking-rebuild1'};
  s=await move(seats[0],'truth_begin',begin);
  const firstRevision=s.revision;
  for(let lap=1;lap<=3;lap++){
    for(const [turn,who] of seats.entries()){
      assert.equal(s.phase,'pick');
      assert.equal(s.game.lap,lap);
      assert.equal(s.game.turn,turn);
      assert.equal(s.game.question,undefined);
      if(lap===2&&turn===0){
        await assert.rejects(move(who,'truth_pick',{side:0,lap:1}),/stale_turn/);
        await assert.rejects(move(who,'truth_pick',{side:0,lap:undefined,revision:firstRevision}),/stale_state/);
      }
      s=await move(who,'truth_pick',{side:turn%2});
      const peer=await rpc(seats[(turn+1)%seats.length],'state',s.code);
      assert.equal(peer.phase,'answer');
      assert.equal(peer.game.lap,lap);
      assert.equal(peer.game.question,s.game.question);
      s=await move(who,(lap+turn)%2?'truth_pass':'truth_answer');
    }
  }
  for(const who of seats){
    const view=await rpc(who,'state',s.code);
    assert.deepEqual(view.game,{phase:'done',lap:3});
  }
  const nextHost=seats[s.hostSeat];
  s=await move(nextHost,'again');
  assert.equal(s.me,0);
  s=await move(nextHost,'truth_begin',begin);
  assert.equal(s.game.turn,0);
  assert.equal(s.game.lap,1);
});

for (const withTargets of [false,true]) for(const allSafe of [false,true]) test(
  'group roulette '+(withTargets?'with targets':'without target selection')+' '+
  (allSafe?'can leave every phone safe and preserves lobby control':'reveals one phone and preserves its result on reconnect'),async t=>{
  const f=await fixture();t.after(()=>f.close());
  const n=5,seats=f.users.slice(0,n);
  const hub=(i,act,code,opts={})=>f.publicRpc(seats[i],'drinking_room',[act,code,opts]);
  let parent=await hub(0,'create','',{title:'함께',capacity:n,password:'test-pass',request_id:randomUUID()});
  for(let i=1;i<n;i++)parent=await hub(i,'join',parent.code,{password:'test-pass'});
  parent=await hub(0,'start',parent.code,{kind:'partyroulette',revision:parent.revision,request_id:randomUUID()});
  const call=(i,act,opts={})=>f.publicRpc(seats[i],'party_live_multiplayer',['partyroulette',act,parent.child,opts]);
  let s=await call(0,'state');
  const opts=()=>({round:s.round,revision:s.revision,request_id:randomUUID()});
  assert.deepEqual(s.players,['1번','2번','3번','4번','5번']);
  assert.deepEqual(s.game,{phase:'prepare',chambers:n+1,count:0,mine:false});
  await assert.rejects(call(0,'roulette_press',opts()),/unavailable/);
  const targetFor=i=>(i+1)%n;
  // One older client chooses on press; the others choose before becoming ready.
  const readyOptions=i=>withTargets&&i!==1?{...opts(),target:targetFor(i)}:opts();
  if(withTargets)await assert.rejects(call(0,'roulette_ready',{...opts(),target:0}),/invalid_target/);
  const first=readyOptions(0);await call(0,'roulette_ready',first);await call(0,'roulette_ready',first);
  assert.deepEqual((await call(1,'state')).game,{phase:'prepare',chambers:n+1,count:1,mine:false});
  if(withTargets)assert.equal((await call(0,'state')).game.myTarget,targetFor(0));
  await Promise.all(seats.slice(1).map((_,i)=>call(i+1,'roulette_ready',readyOptions(i+1))));
  s=await call(1,'state');assert.equal(s.phase,'together');assert.ok(s.game.opensAt>s.serverMs);
  await assert.rejects(call(1,'roulette_press',opts()),/countdown_running/);
  // Move just the fixture clock boundary back; orders still use the public RPC.
  await f.db.query("update ojjuda_arcade_internal.party_vote_rooms set game_state=jsonb_set(game_state,'{opensAt}','0') where code=$1",[parent.child]);
  const pressOptions=i=>withTargets&&i===1?{...opts(),target:targetFor(i)}:opts();
  if(withTargets){
    assert.equal((await call(0,'state')).game.myTarget,targetFor(0));
    assert.equal((await call(1,'state')).game.myTarget,undefined);
    await assert.rejects(call(0,'roulette_press',{...opts(),target:2}),/target_locked/);
    for(const target of [0,n,-1,null,'1',1.25]){
      await assert.rejects(call(0,'roulette_press',{...opts(),target}),/invalid_target/);
    }
  }
  await Promise.all(seats.slice(0,-1).map((_,i)=>call(i,'roulette_press',pressOptions(i))));
  if(withTargets)await assert.rejects(call(1,'roulette_press',{...opts(),target:3}),/target_locked/);
  const pending=await call(n-1,'state');
  assert.deepEqual(pending.game,{phase:'together',chambers:n+1,count:n-1,mine:false,opensAt:0,...(withTargets?{myTarget:targetFor(n-1)}:{})});
  assert.equal((await call(0,'state')).game.mine,true);
  const drawn=allSafe?n:2;
  await seedRouletteDraw(f.db,n+1,drawn);
  let last=pressOptions(n-1);await call(n-1,'roulette_press',last);await call(n-1,'roulette_press',last);
  const results=await Promise.all(seats.map((_,i)=>call(i,'state')));
  assert.equal(results.filter(s=>s.game.fired).length,allSafe?0:1);
  for(const [i,r] of results.entries()){
    assert.equal(r.phase,'done');
    assert.equal(r.game.chambers,n+1);
    if(allSafe){
      assert.deepEqual(r.game,{phase:'done',chambers:n+1,fired:false,allSafe:true,revealAt:results[0].game.revealAt});
      assert.ok(r.game.revealAt>pending.serverMs);
      assert.equal(r.hostSeat,0);
    }else if(withTargets){
      const shooter=results.findIndex(s=>s.game.fired);
      assert.equal(shooter,drawn);
      assert.equal(r.game.shooter,shooter);
      assert.equal(r.game.target,targetFor(shooter));
      assert.equal(r.game.revealAt,results[0].game.revealAt);
      assert.ok(r.game.revealAt>pending.serverMs);
      assert.equal(r.hostSeat,r.game.target);
    }else{
      assert.deepEqual(Object.keys(r.game).sort(),['chambers','fired','phase']);
      assert.equal(r.hostSeat,0);
    }
    assert.deepEqual((await call(i,'state')).game,r.game);
  }
  if(allSafe){
    parent=await hub(0,'state',parent.code);
    assert.equal(parent.hostSeat,0);
    const returned={revision:parent.revision,request_id:randomUUID()};
    await assert.rejects(hub(1,'return',parent.code,returned),/host_only/);
    const priorPlayers=parent.players,priorRound=parent.round;
    parent=await hub(0,'return',parent.code,returned);
    assert.equal(parent.phase,'lobby');
    assert.deepEqual(parent.players,priorPlayers);
    parent=await hub(0,'start',parent.code,{kind:'partyroulette',revision:parent.revision,request_id:randomUUID()});
    assert.equal(parent.round,priorRound+1);
    const next=await call(0,'state');
    assert.deepEqual(next.game,{phase:'prepare',chambers:n+1,count:0,mine:false});
  }
});

test('roulette keeps active legacy rounds and gives new 2-to-12-player rounds one extra chamber',async t=>{
  const f=await fixture();t.after(()=>f.close());
  const step=async(g,action,opts,seat,n,ms=10000)=>(await f.db.query(
    'select ojjuda_arcade_internal.live_partyroulette($1::jsonb,$2,$3::jsonb,$4,$5,$6) game',
    [JSON.stringify(g),action,JSON.stringify(opts),seat,n,ms])).rows[0].game;
  for(const n of [2,12]){
    const targets=Object.fromEntries(Array.from({length:n},(_,i)=>[i,(i+1)%n]));
    for(const legacy of [false,true]){
      let state=legacy?{phase:'prepare',marks:{}}:await step({},'init',{},0,n);
      for(let seat=0;seat<n;seat++)state=await step(state,'roulette_ready',{target:targets[seat]},seat,n);
      const chambers=legacy?n:n+1;
      assert.equal(state.chambers,chambers);
      const beforeLast={...state,marks:Object.fromEntries(Array.from({length:n-1},(_,i)=>[i,true]))};
      // Last occupied chamber is valid even at the maximum supported roster;
      // only the additional chamber makes all participants safe.
      for(const drawn of [0,n-1,...(legacy?[]:[n])]){
        await seedRouletteDraw(f.db,chambers,drawn);
        const result=await step(beforeLast,'roulette_press',{},n-1,n,14000);
        assert.equal(result.drawn,drawn);
        assert.equal(result.chambers,chambers);
        const views=await Promise.all(Array.from({length:n},(_,i)=>step(result,'view',{},i,n,14000)));
        assert.equal(views.filter(v=>v.fired).length,drawn===n?0:1);
        for(const view of views){
          assert.equal(view.allSafe,drawn===n?true:undefined);
          assert.equal(view.target,drawn===n?undefined:targets[drawn]);
        }
      }
    }
  }
  assert.deepEqual(await step({phase:'done',drawn:1},'view',{},1,3),
    {phase:'done',fired:true,chambers:3},'a previously finished legacy result is unchanged');
  const permissions=(await f.db.query(`select rolname,has_function_privilege(rolname,
    'ojjuda_arcade_internal.live_partyroulette(jsonb,text,jsonb,integer,integer,bigint)','EXECUTE') allowed
    from pg_roles where rolname in ('anon','authenticated')`)).rows;
  assert.ok(permissions.every(role=>!role.allowed),'internal roulette hooks stay private');
});

test('initial next starts one server deadline and keeps the surviving seat and turn',async t=>{
  const f=await fixture();t.after(()=>f.close());
  const state={phase:'intermission',current:2,turn:4,alive:[0,2],initial:'ㅅㄱ',reason:'시간 초과',lastOut:1};
  const move=(game,actor,turn=4)=>f.db.query("select ojjuda_arcade_internal.live_initial($1::jsonb,'next',$2::jsonb,$3,3,7000) as game",
    [JSON.stringify(game),JSON.stringify({turn}),actor]);
  await assert.rejects(move(state,1),/not_your_turn/);await assert.rejects(move(state,2,3),/stale_turn/);
  const next=(await move(state,2)).rows[0].game;
  assert.deepEqual(next,{phase:'active',current:2,turn:4,alive:[0,2],initial:'ㅅㄱ',endsAt:12000});
  await assert.rejects(move(next,2),/unavailable/);
});

test('all minority catalog pairs become short distinct choices without changing existing ballots',async t=>{
  const fs=require('node:fs'),path=require('node:path');
  const directory=path.join(__dirname,'../supabase/migrations');
  const f=await fixture();t.after(()=>f.close());
  const apply=name=>f.db.exec(fs.readFileSync(path.join(directory,name),'utf8'));
  for(const file of fs.readdirSync(directory).filter(name=>name.includes('_drinking_flavor500_')||name.endsWith('_drinking_prompt_flavors.sql')).sort())await apply(file);
  const pool=async()=>(await f.publicRpc(f.users[0],'drinking_content',['pool',{kinds:['minority'],include_flavors:true}])).banks.minority;
  const metadata=async()=>(await f.db.query("select id,active,party_pick,prompt_flavor from ojjuda_arcade_internal.drinking_content_items where kind='minority' order by id")).rows;
  const old=await pool(),flags=await metadata();
  const act=(who,action,code,opts)=>f.publicRpc(who,'party_vote_multiplayer',['minority',action,code,opts||{}]);
  const room=await act(f.users[0],'create','',{title:'기존 투표',capacity:3,password:'abcd',request_id:randomUUID()});
  for(const seat of [1,2])await act(f.users[seat],'join',room.code,{password:'abcd'});
  const prior=(await act(f.users[0],'state',room.code)).choices;
  await apply('20261116185723_drinking_minority_short_choices.sql');
  assert.deepEqual((await act(f.users[0],'state',room.code)).choices,prior);
  assert.deepEqual(await metadata(),flags);
  const pairs=await pool(),key=p=>p.map(s=>s.replaceAll(' ','')).sort().join('|');
  assert.equal(pairs.length,1360);assert.equal(new Set(pairs.map(key)).size,1360);
  assert.ok(pairs.every((pair,i)=>pair.length===2&&pair.every(s=>s.length>0&&s.length<=9)&&key(pair)!==key(old[i])));
  for(const expected of ['짜장면|짬뽕','부먹|찍먹','축구|야구','산|바다','애인|가족','돈|명예','로또1등|연금복권'])assert.ok(pairs.some(p=>p.join('|')===expected),expected);
});
