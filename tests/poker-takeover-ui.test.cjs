const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {fixture}=require('./poker-online-fixture.cjs'),{screen,until}=require('./poker-ui-fixture.cjs');

test('an inherited Poker hand keeps its nickname and gold escrow while reentry waits on a fresh setup',async()=>{
 const f=await fixture(),screens=[];try{
  const [a,b]=f.users;
  const call=async(actor,body)=>{const r=await f.call(actor,body);assert.equal(r.ok,true,JSON.stringify(r));return r;};
  let room=(await call(a,{action:'create',request_id:randomUUID(),options:{capacity:2,title:'이어지는 한 판'}})).room;
  room=(await call(b,{action:'join',code:room.code})).room;
  room=(await call(a,{action:'start',room_id:room.id,version:room.version,request_id:randomUUID()})).room;
  const remaining=await screen(f,b,{joinCode:room.code});screens.push(remaining);
  await call(a,{action:'leave',room_id:room.id,version:room.version,request_id:randomUUID()});
  await remaining.poll();
  assert.equal(remaining.last.room.status,'active');assert.deepEqual(remaining.last.room.computerSeats,[0]);
  assert.equal(remaining.find('.seat-type').textContent,'컴퓨터');
  assert.equal(remaining.find('.seat-info strong').textContent,room.names[0],'the original nickname stays on the inherited seat');
  assert.ok(remaining.find('.seat-cards .back'),'taking over does not reveal an opponent’s private cards');

  const returning=await screen(f,a);screens.push(returning);
  assert.equal(returning.last.room,null);assert.equal(returning.last.wallet.locked,true);
  assert.equal(returning.find('[data-action=resume]'),null);assert.equal(returning.find('.my-cards'),null);
  assert.equal(returning.find('[data-action=start]').disabled,true);
  assert.match(returning.find('.game-entry').textContent,/컴퓨터가 이전 판을 마치는 중/);
  returning.click('[data-action=online]');await until(()=>returning.find('#poker-create'),'new online setup');
  assert.equal(returning.find('#poker-create button[type=submit]').disabled,true);
  assert.equal(returning.find('#poker-join button[type=submit]').disabled,true);

  remaining.click('[data-action=online-leave]');assert.match(remaining.find('#exit-dialog').textContent,/골드 증감은 내 계정/);
  remaining.click('#confirm-exit');await until(()=>remaining.messages.at(-1)?.type==='exit','last human departure settles the hand');
  const final=(await f.db.query('select state,status,settled_round,round from ojjuda_poker_internal.rooms where id=$1',[room.id])).rows[0];
  assert.equal(final.status,'closed');assert.equal(final.state.phase,'finished');assert.equal(final.settled_round,final.round);
  await returning.poll();assert.equal(returning.last.room,null);assert.equal(returning.last.wallet.locked,false);
  assert.equal(returning.find('#poker-create button[type=submit]').disabled,false);
  assert.equal(returning.find('#poker-join button[type=submit]').disabled,false);
  returning.click('[data-action=online-back]');assert.equal(returning.find('[data-action=start]').disabled,false);
  assert.doesNotMatch(returning.find('.game-entry').textContent,/컴퓨터가 이전 판을 마치는 중/);
  returning.click('[data-action=start]');await until(()=>returning.last.room?.status==='active','a new solo hand starts after settlement');
  assert.notEqual(returning.last.room.id,room.id);
 }finally{for(const s of screens)s.close();await f.close();}
});
