// unchanged production source at line 1
  assert.ok(messages.every(m=>m.origin==='https://fixture.test'));
  const stored=JSON.parse(w.localStorage.getItem('ojjuda.mines.save.v1:guest'));
  assert.equal(stored.best[7],10);
} finally {x.dom.window.close();}

require('node:test')('Mines exit confirmation keeps play on the right and honors both choices',async()=>{
  const g=game(),{$,w,receive,messages}=g;
  try{
    $('#minesStart').click();w.fixture.open(w.fixture.cells[0]);
    $('#face2').click();
    const buttons=[...$('dialog.game-exit-dialog').querySelectorAll('button')];
    assert.deepEqual(buttons.map(b=>b.textContent),['나가기','계속하기']);
    buttons[1].click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(messages.some(m=>m.data.type==='ojjuda-game-exit'),false);
    receive({type:'ojjuda-mines-exit-request'});$('[data-exit-leave]').click();await new Promise(resolve=>setImmediate(resolve));
    assert.equal(messages.filter(m=>m.data.type==='ojjuda-game-exit').length,1);
  }finally{w.close();}
});

// A selection made in the entry screen must survive even without starting a round.
const selected = game({member:owner});
// unchanged production source at line 104
