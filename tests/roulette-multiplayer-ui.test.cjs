// unchanged production source at line 1
 assert.equal(f.ui.state.balance,8400);
 f.ui.applySnapshot({ok:true,serverTime:1,wallet:{gold:10000},room:null});
 assert.equal(f.ui.state.balance,8400);assert.equal(f.ui.getRoom().id,r.id);
});

test('leaving a revealed result waits for one settlement before leaving the room',async t=>{
 const f=await fixture(t),gate=deferred();f.gates.set('confirm',gate);
 beginHistoryRound(f,'exit-round');f.w.testWheel.callbacks.onDone('exit-round');
 const leave=f.w.document.getElementById('leaveResultButton');
 assert.equal(leave.nextElementSibling.id,'confirmResultButton');
 leave.click();leave.click();await tick();
 assert.equal(f.calls.filter(call=>call.action==='confirm').length,1);
 assert.equal(f.calls.some(call=>call.action==='leave'),false);
 gate.resolve();await tick();await tick();await tick();
 assert.equal(f.room(),null);assert.equal(f.calls.filter(call=>call.action==='leave').length,1);
 assert.ok(f.sent.some(message=>message.type==='exit'));
});

test('an exit queued during confirmation is completed even when the tab becomes hidden',async t=>{
// unchanged production source at line 321
