// unchanged production source at line 1
  const f=spot();try{
    f.solve();assert.equal(f.$('celebration').open,true);const success=assertResult(f.$('celebration'),'success');
    assert.equal(success.querySelectorAll('.end-picture-choice').length,3);
    assert.deepEqual([...success.querySelector('.game-result-navigation').children].map(el=>el.textContent),['나가기','계속하기']);
    f.$('celebration-continue').click();f.loaded();assert.equal(f.state().current,1);assert.equal(f.round().status,'playing');
    f.solve();f.$('celebration-current').click();f.loaded();f.lose();
    assert.equal(f.$('spot-failure').open,true);const failure=assertResult(f.$('spot-failure'),'failure');
    assert.equal(failure.querySelectorAll('.end-picture-choice').length,3);assert.equal(f.$('retry-next').disabled,true);
// unchanged production source at line 52
    const next=d.getElementById('next');complete();assert.equal(d.getElementById('completion').hidden,false);
    const card=assertResult(d.getElementById('completion'),'success');assert.equal(card.querySelectorAll('.level-choice').length,3);
    assert.equal(d.getElementById('next'),next,'existing listener node is preserved');assert.equal(records.length,1);
    const [exit,play]=card.querySelector('.game-result-navigation').children;assert.deepEqual([exit.textContent,play.textContent],['나가기','계속하기']);
    play.click();assert.equal(d.getElementById('completion').hidden,true);assert.equal(records.length,1);
    const state=JSON.parse(w.localStorage.getItem('ojjuda-sacheonseong-v1'));assert.equal(state.stage,2);
    next.onclick();assert.equal(JSON.parse(w.localStorage.getItem('ojjuda-sacheonseong-v1')).stage,2,'a stale result cannot skip the new board');
    complete();assertResult(d.getElementById('completion'),'success');assert.equal(records.length,2);
// unchanged production source at line 97
  try{
    const g=f.w.fixture;f.$('#starStart').click();g.run.gain.light=12;g.run.heat=0;g.updateRun(.05);
    assert.equal(f.$('.game-result-card'),null);assert.match(f.$('#ovText').textContent,/이번에 모은 빛 12/);
    const [exit,restart]=f.$('#ovBtns .round-navigation').children;assert.deepEqual([exit.textContent,restart.textContent],['나가기','계속하기']);restart.click();assert.equal(g.mode,'run');
    for(const upgrade of g.upgrades)g.state.lv[upgrade.id]=upgrade.mx;g.startRun(true);assert.ok(g.run.boss);
    const stage=g.state.stage;g.run.boss.hp=0;assert.equal(g.winBoss(),true);f.tick(900);assert.equal(g.state.stage,stage+1);
    assert.equal(f.$('.game-result-card'),null,'boss evolution retains its original story overlay');
// unchanged production source at line 109
    for(const passed of [true,false,true]){
      g.state.score=passed?g.state.stage.goal:0;g.state.used=5;g.finishRound();await flush();await flush();
      const card=assertResult($('#modalContent'),passed?'success':'failure'),choices=card.querySelector('.stage-result-actions'),shop=choices.nextElementSibling;
      assert.deepEqual([...card.querySelector('.game-result-navigation').children].map(el=>el.textContent),['나가기','계속하기']);
      assert.equal(choices.querySelectorAll('.stage-choice').length,3);
      assert.equal(shop.dataset.action,'result-shop');assert.match(shop.textContent,/장비 구매/);assert.equal(shop.disabled,false);
      assert.equal(card.querySelectorAll('[data-action="result-shop"]').length,1);
// unchanged production source at line 132
