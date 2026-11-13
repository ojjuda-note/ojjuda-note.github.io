// unchanged production source at line 1
  assert.ok(messages.every(m=>m.origin==='https://fixture.test'));
  const stored=JSON.parse(w.localStorage.getItem('ojjuda.mines.save.v1:guest'));
  assert.equal(stored.best[7],10);
  f.open(f.cells[0]);w.confirm=()=>false;
  $('#face2').click();assert.ok(!messages.some(m=>m.data.type==='ojjuda-game-exit'));
  w.confirm=()=>true;receive({type:'ojjuda-mines-exit-request'});
  assert.ok(messages.some(m=>m.data.type==='ojjuda-game-exit'));
} finally {x.dom.window.close();}

// A selection made in the entry screen must survive even without starting a round.
const selected = game({member:owner});
// unchanged production source at line 104
