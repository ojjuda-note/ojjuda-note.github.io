// unchanged production source at line 1
 assert.equal(f.ui.state.balance,8400);
 f.ui.applySnapshot({ok:true,serverTime:1,wallet:{gold:10000},room:null});
 assert.equal(f.ui.state.balance,8400);assert.equal(f.ui.getRoom().id,r.id);
});

test('an exit queued during confirmation is completed even when the tab becomes hidden',async t=>{
// unchanged production source at line 321
