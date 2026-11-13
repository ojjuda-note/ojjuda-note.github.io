// unchanged production source at line 1
  else{f.read("lives=1;world.events=[{t:'death',p:me,why:'mob'}];handleEvents();");f.tick(800);}
  assert.equal(f.read('roundCleared'),false);
  assert.equal(w.document.querySelector('#next'),null);
  assert.deepEqual([...w.document.querySelector('.game-result-navigation').children].map(button=>button.id),['list','again']);
  w.document.querySelector('#again').click();assert.equal(f.read('stage'),0);assert.equal(f.read('over'),false);
});

test('a current photo clear advances once and resets the next round outcome',t=>{
  const f=fixture(t),{w}=f;w.startStage(0);f.clear();f.tick(3000);
  const next=w.document.querySelector('#next');assert.ok(next);
  assert.deepEqual([...next.parentElement.children].map(button=>button.textContent),['나가기','계속하기']);
  const stale=next.onclick;next.click();
  assert.equal(f.read('stage'),1);assert.equal(f.read('roundCleared'),false);assert.equal(f.read('over'),false);
  const current=f.read('world');stale();
// unchanged production source at line 54
