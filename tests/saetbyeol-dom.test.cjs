// unchanged production source at line 1
  $('#starStart').click();const first=w.fixture.run.id;
  w.fixture.run.heat=0;w.fixture.updateRun(.02);
  assert.equal(w.fixture.mode,'end');assert.equal(messages.filter(m=>m.data.type==='ojjuda-game-finished').length,1);
  const replay=[...w.document.querySelectorAll('#overlay button')].find(button=>button.textContent==='계속하기');
  assert.ok(replay);assert.equal(replay.previousElementSibling.textContent,'나가기');replay.click();
  if(member==='guest'){
   assert.equal(w.fixture.run.id,first);assert.equal(w.fixture.mode,'end');assert.equal(blocked,1,'the immediate replay invokes the shared login gate');
  }else{
// unchanged production source at line 82
