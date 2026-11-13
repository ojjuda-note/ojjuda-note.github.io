// unchanged production source at line 1
  await engine.link(()=>{throw Error('unexpected import');});await online.link(()=>engine);await online.evaluate();
  await wait(()=>attachExisting?w.document.body.classList.contains('in-match'):!w.document.getElementById('startSolo').disabled);
  return w;
 }
 function chooseSurrender(w,leave=true){
  w.document.getElementById('surrender').click();
  const buttons=[...w.document.querySelectorAll('.game-exit-dialog .game-result-navigation button')];
  assert.equal(buttons.length,2);
  assert.equal(buttons[0].hasAttribute('data-exit-leave'),true);
  assert.equal(buttons[1].textContent,'계속하기');
  buttons[leave?0:1].click();
 }
 try{
  const viewport={width:1536,height:626},a=await client(ids[0],false,viewport,'','8'),get=(w,id)=>w.document.getElementById(id);
// unchanged production source at line 37
  assert.equal(reconnected.orientationLocks.length,0,'an explicit target allows either orientation');
  assert.equal(get(reconnected,'netCoins').textContent,'보유 97쭈');
  let deathSounds=0;a.sfx=type=>{if(type==='boom')deathSounds++;};
  chooseSurrender(a);
  await wait(()=>a.TankView.hasEffects());
  a.eval('draw()'); // Destruction bursts have no weapon metadata and must render safely.
  assert.equal(deathSounds,1);assert.equal(get(a,'over').classList.contains('hidden'),true,'show the destruction before the result');
// unchanged production source at line 248
  assert.equal(solo.TankOnline.canAim(),true,'computer must automatically return the turn to the person');
  assert.equal(solo.TankView.input().angle,0);assert.equal(solo.TankView.input().power,50,'the player keeps their aim after the computer fires');
  assert.equal(get(solo,'netCoins').textContent,'보유 97쭈');
  chooseSurrender(solo);
  await wait(()=>!solo.document.body.classList.contains('in-match'));
  assert.equal(get(solo,'entryHome').hidden,false);assert.equal(get(solo,'soloSetup').hidden,false);
  assert.equal(get(solo,'startSolo').disabled,false);
// unchanged production source at line 294
  local.dispatchEvent(new local.Event('online'));
  await wait(()=>get(local,'netTurn').textContent==='전투 종료');
  for(let i=0;i<70;i++)local.TankOnline.tick();
  assert.equal(get(local,'over').classList.contains('hidden'),false);assert.equal(get(local,'bAgain').textContent,'계속하기');
  const previousLocalId=localRoom.id;get(local,'bAgain').click();
  await wait(()=>local.TankOnline.canAim()&&local.eval('tankRenderEngine.snapshot().runId')!==previousLocalId);
  local.TankOnline.tick();assert.equal(local.eval('tanks.length'),3,'play again keeps the local player count');
  chooseSurrender(local);await wait(()=>!local.document.body.classList.contains('in-match'));
  assert.equal(get(local,'localSetup').hidden,false);assert.equal(get(local,'startLocal').disabled,false);
  // The new shell is selectable, animates every stage, and uses one paid command.
  const bunker=await client(ids[6]);get(bunker,'localMode').click();get(bunker,'localPlayers').value='2';get(bunker,'startLocal').click();
// unchanged production source at line 359
  const bunkerRoom=(await f.call(ids[6],{action:'mine'})).room;
  assert.equal(bunkerRoom.coins,97);assert.equal(bunkerRoom.game.shotNo,1);assert.equal(bunkerRoom.event.command.weapon,13);
  assert.deepEqual(JSON.parse(bunker.eval('JSON.stringify(tankRenderEngine.snapshot().terrain)')),bunkerRoom.game.terrain,'the displayed crater matches the saved authoritative strike');
  chooseSurrender(bunker);await wait(()=>!bunker.document.body.classList.contains('in-match'));
  // Steel Rain is available with zero coins and visibly splits into ten children.
  await f.db.query('update public.user_private set coins=0 where user_id=$1',[ids[7]]);
  const rain=await client(ids[7]);get(rain,'localMode').click();get(rain,'localPlayers').value='2';get(rain,'startLocal').click();
// unchanged production source at line 383
  assert.equal(rainRoom.coins,0);assert.equal(rainRoom.game.shotNo,1);assert.equal(rainRoom.game.tanks[0].basicWeapon,14);
  assert.equal(get(rain,'netCoins').textContent,'보유 0쭈');
  assert.deepEqual(JSON.parse(rain.eval('JSON.stringify(tankRenderEngine.snapshot().terrain)')),rainRoom.game.terrain);
  chooseSurrender(rain);await wait(()=>!rain.document.body.classList.contains('in-match'));
  // An eightfold replay reaches bedrock through thin soil, shows one quake, and saves the falls.
  let quakeRoom=(await f.call(ids[8],{action:'create',request_id:require('node:crypto').randomUUID(),options:{mode:'solo',capacity:3,title:'지진'}})).room;
  quakeRoom=(await f.start(ids[8],quakeRoom)).room;
// unchanged production source at line 405
  const unchanged=(await f.call(ids[5],{action:'read',room_id:savedSolo.id})).room;
  assert.equal(unchanged.version,savedSolo.version,'CPU waits while the current visit is hidden');
  assert.deepEqual(unchanged.game,savedSolo.game);assert.equal(unchanged.coins,100);
  chooseSurrender(paused,false);
  assert.equal((await f.call(ids[5],{action:'mine'})).room.id,savedSolo.id,'cancelling exit preserves the current visit');
  delete paused.document.hidden;paused.document.dispatchEvent(new paused.Event('visibilitychange'));
  assert.equal(get(paused,'soloSpeed').textContent,'속도 ×8','saved playback preferences survive an explicit attachment');
  assert.ok(paused.scheduledDelays.includes(112.5));
  assert.equal(paused.document.body.classList.contains('in-match'),true);
  await wait(async()=>(await f.call(ids[5],{action:'read',room_id:savedSolo.id})).room.version>savedSolo.version);
  for(let i=0;i<8000;i++)paused.TankOnline.tick();
  chooseSurrender(paused);await wait(()=>!paused.document.body.classList.contains('in-match'));
  paused.close();
  const replace=await client(ids[5],false,undefined,'','99');
  await wait(()=>!get(replace,'entryHome').hidden);
// unchanged production source at line 459
