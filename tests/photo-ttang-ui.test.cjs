// unchanged production source at line 1
  await frame.evaluate(()=>{paused=false;});await input.detach();await frame.click('#pause');
  assert.equal(await frame.getByText('잠깐 쉬는 중').isVisible(),true);await frame.click('#go');
  await frame.evaluate(()=>{mySil=silTotal*GOAL;win();});assert.equal(await frame.evaluate(()=>JSON.parse(localStorage.getItem('ojjuda-photo-ttang'))['0'].done),1);
  await frame.getByRole('button',{name:'계속하기',exact:true}).click();
  await frame.waitForFunction(()=>stage===1&&mode==='play'&&photoImg.complete&&photoImg.naturalWidth>0);
  assert.equal(await frame.evaluate(()=>roundCleared),false,'the next photo starts as a new unfinished round');
  await frame.evaluate(()=>{paused=true;timeUp();});
  const failedResult=frame.getByRole('dialog',{name:'게임 결과',exact:true}).locator('[data-game-result-card][data-result-game="photo_ttang"]');
  await failedResult.getByRole('heading',{name:'실패',exact:true}).waitFor();
  assert.equal(await failedResult.getAttribute('data-result-outcome'),'failure');
  assert.match(await failedResult.locator('.game-result-metric').textContent(),/^시간 종료 · 실루엣 \d+%$/);
  const exit=failedResult.getByRole('button',{name:'나가기',exact:true});
  const play=failedResult.getByRole('button',{name:'계속하기',exact:true});
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});
   const [left,right]=await Promise.all([exit.boundingBox(),play.boundingBox()]);
   assert.ok(left&&right&&left.x+left.width<=right.x&&Math.abs(left.y-right.y)<1,'exit and continue share one row');
  }
  await page.setViewportSize({width:390,height:844});
  assert.equal(await failedResult.locator('#next').count(),0,'a failed next photo cannot advance');
  assert.equal(await frame.evaluate(()=>stage),1);
  await failedResult.getByRole('button',{name:'나가기',exact:true}).click();
  assert.deepEqual(await frame.evaluate(()=>Array.from(document.querySelectorAll('#grid .cell:not([disabled])'),cell=>LIST[Number(cell.dataset.i)].key)),['0','20','1'],'clearing the first photo unlocks the inserted photo and preserves access to the next original photo');
  await page.getByRole('button',{name:'← 오쭈다 오락실',exact:true}).click();assert.equal(await page.locator('#photo-ttang-overlay').count(),0);
  await multi.getByRole('button',{name:/^월드땅따먹기/}).click();
// unchanged production source at line 93
