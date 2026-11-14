'use strict';

const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const test=require('node:test');
const {fixture}=require('./drinking-room-fixture.cjs');
const {screen,until}=require('./helpers/drinking-ui-fixture.cjs');

test('four seats enforce the secret range, private presses, turn limits, retries and immediate win',async t=>{
  const f=await fixture();t.after(()=>f.close());
  const rpc=(seat,action,code,opts={})=>f.publicRpc(f.users[seat],'party_live_multiplayer',['secretcount',action,code,opts]);
  const opts={password:'test-pass',title:'시크릿 카운트',capacity:4,request_id:randomUUID()};
  const {code}=await rpc(0,'create','',opts);
  for(let seat=1;seat<4;seat++)await rpc(seat,'join',code,{password:opts.password});
  let s=await rpc(0,'state',code);
  const mutate=(seat,action,args={})=>rpc(seat,action,code,{revision:s.revision,round:s.round,turn:s.game.turn,request_id:randomUUID(),...args});
  assert.equal(s.phase,'setup');
  for(const target of [0,4,37,5.5,'5']){
    await assert.rejects(mutate(0,'sc_start',{target}),/invalid_target_number/);
  }
  await assert.rejects(mutate(1,'sc_start',{target:5}),/host_only/);
  s=await mutate(0,'sc_start',{target:5});
  await assert.rejects(mutate(0,'sc_pass'),/press_first/);
  await assert.rejects(mutate(1,'sc_press'),/not_your_turn/);
  const options={revision:s.revision,round:s.round,turn:0,request_id:randomUUID()};
  s=await rpc(0,'sc_press',code,options);
  assert.equal(s.game.used,1);
  const repeated=await rpc(0,'sc_press',code,options);
  assert.equal(repeated.game.used,1);
  for(let i=0;i<2;i++)s=await mutate(0,'sc_press');
  await assert.rejects(mutate(0,'sc_press'),/turn_limit/);
  const view=(await rpc(2,'state',code)).game;
  assert.deepEqual(Object.keys(view).sort(),['current','phase','turn']);
  s=await mutate(0,'sc_pass');
  await assert.rejects(mutate(0,'sc_press'),/not_your_turn/);
  s=await mutate(1,'sc_press');s=await mutate(1,'sc_press');
  assert.deepEqual(s.game,{phase:'done',winner:1,answer:5});
  await assert.rejects(mutate(1,'sc_pass'),/unavailable/);
  s=await mutate(0,'again');assert.equal(s.phase,'setup');
  s=await mutate(0,'sc_start',{target:36});assert.equal(s.phase,'press');
  const internal='ojjuda_arcade_internal.live_secretcount';
  for(const n of [2,3,4,7,12]){
    const check=await f.db.query("select bool_and(v between $1+1 and $1*9) valid from (select ("+internal+"('{\"phase\":\"setup\"}','sc_start',jsonb_build_object('target',null,'sample',i),0,$1::int,0)->>'secret')::int v from generate_series(1,80) i) samples",[n]);
    assert.equal(check.rows[0].valid,true);
  }
});

test('one phone hides both counts, uses actual participant limits and ends on the triggering press',async t=>{
  const ui=await screen({url:'/games/drinking/local/#secretcount',prepare(w){
    w.scrollTo=()=>{};w.localStorage.setItem('oj.party.member-a.players',JSON.stringify(['하나','두리','세나','다온']));
  }});t.after(()=>ui.close());
  const manual=ui.find('[value=manual]');manual.click();
  const input=ui.find('.sc-field input');
  assert.equal(input.placeholder,'5~36');input.value='4';ui.submit('.sc-setup');assert.equal(input.validity.valid,false);
  input.value='5';input.dispatchEvent(new ui.w.Event('input'));ui.submit('.sc-setup');
  const pane=()=>ui.find('.play-body');
  assert.equal(ui.find('[data-sc-pass]').disabled,true);
  for(let i=0;i<3;i++){ui.click('[data-sc-press]');assert.equal(pane().textContent.trim(),'턴 넘기기');}
  assert.equal(ui.find('[data-sc-press]').disabled,true);
  ui.click('[data-sc-pass]');assert.equal(ui.find('[data-sc-pass]').disabled,true);
  ui.click('[data-sc-press]');ui.click('[data-sc-press]');
  assert.ok(pane().textContent.includes('두리님 당첨'));assert.equal(ui.find('[data-sc-press]'),null);
  ui.click('[data-action=start]');assert.ok(ui.find('.sc-setup'));assert.deepEqual(ui.errors,[]);
});

test('rapid taps queue in order before handing off without displaying a counter',async t=>{
  const ui=await screen({url:'/games/secretcount/',scripts:['/games/secretcount/controls.js','/games/secretcount/room.js']});
  t.after(()=>ui.close());
  const feature=ui.w.PartyLiveGame,view=ui.find('#view'),events=[],pending=[];
  function display(turn,current,used){
    const state={code:'AB1234',round:1,me:0,players:['가','나'],phase:'press',game:{current,turn,used}};
    const bind={esc:s=>s,send:async(action)=>{events.push(action);return new Promise(resolve=>pending.push(resolve));}};
    view.innerHTML='<div id="game">'+feature.view(state,bind)+'</div>';feature.mount(state,bind);
  }
  display(0,0,0);
  for(let i=0;i<3;i++)ui.click('[data-sc-press]');
  assert.equal(ui.find('[data-sc-press]').disabled,true);ui.click('[data-sc-pass]');
  assert.equal(ui.find('#game').textContent,'턴 넘기기');
  for(let i=1;i<=3;i++){
    await until(()=>pending.length===1);const release=pending.shift();display(0,0,i);release(true);
  }
  await until(()=>pending.length===1);display(1,1,undefined);pending.shift()(true);
  assert.deepEqual(events,['sc_press','sc_press','sc_press','sc_pass']);
  assert.ok(ui.find('.sc-closed'));assert.equal(ui.find('[data-sc-press]').disabled,true);
  assert.equal(ui.find('[data-sc-pass]'),null);
});
