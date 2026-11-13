// unchanged production source at line 1
  await result.getByRole('heading',{name:'실패',exact:true}).waitFor();
  assert.equal(await result.getAttribute('data-result-outcome'),'failure');
  assert.match(await result.locator('.game-result-metric').textContent(),/^시간 종료 · 실루엣 \d+%$/);
  assert.equal(await result.getByRole('button',{name:'다음 사진',exact:true}).count(),0,'a failed draft has no next photo');
  await result.getByRole('button',{name:'다시 하기',exact:true}).click();
  await page.waitForFunction(()=>mode==='play'&&!over&&!roundCleared&&me?.alive);
  await page.evaluate(()=>{paused=true;lives=1;world.time=10;me.shieldT=0;world.kill(me,0,'mob');handleEvents();});
  await result.getByRole('heading',{name:'실패',exact:true}).waitFor();
// unchanged production source at line 117
  await result.getByRole('heading',{name:'성공',exact:true}).waitFor();
  assert.equal(await result.getAttribute('data-result-outcome'),'success');
  assert.match(await result.locator('.game-result-metric').textContent(),/사진 공개$/);
  assert.equal(await result.getByRole('button',{name:'다음 사진',exact:true}).count(),0,'a cleared draft returns to saving instead of another stage');
  await returnToSave();
  assert.equal(await page.evaluate(()=>savedPhotos.length),1,'playing did not register the draft');
  await page.click('#send');await page.getByText('등록했어요!',{exact:true}).waitFor();
// unchanged production source at line 127
