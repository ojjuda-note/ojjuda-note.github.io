// unchanged production source at line 1
  assert.equal(await result.locator('.game-result-metric').textContent(),'시간 종료 · 실루엣 88%');
  assert.equal(await page.evaluate(()=>photoDone(LIST[stage])),false,'88% timeout never unlocks the photo');
  assert.equal(await result.locator('.fullimg').count(),0,'a failure cannot reveal the original in its result');
  assert.equal(await result.getByRole('button',{name:'다음 사진',exact:true}).count(),0);
  await result.getByRole('button',{name:'다시 하기',exact:true}).waitFor();
  await result.getByRole('button',{name:'사진 목록',exact:true}).click();
  await page.waitForSelector('#grid .cell img');assert.match(await filter(),/blur/,'losing leaves the photo blurred');
  await page.locator('#grid .cell').click();await page.waitForFunction(()=>photoImg.complete&&photoImg.naturalWidth>0);
  await page.evaluate(()=>{paused=true;sound=false;startWait=0;world.own.fill(me.id);world.step=()=>{};mobs=[];silTotal=1000;mySil=899;paused=false;hud();});
// unchanged production source at line 43
  assert.equal(await page.locator('#silBar').evaluate(e=>e.style.width),'100%','90% fills the completion bar');
  await page.waitForSelector('.fullimg');
  assert.equal(await page.locator('.fullimg').evaluate(im=>getComputedStyle(im).filter),'none','victory presents a sharp original');
  await page.getByRole('button',{name:'사진 목록',exact:true}).click();await page.waitForSelector('#grid .cell.done');
  assert.equal(await filter(),'none','the cleared photo stays sharp in the list');
  await open('one');assert.equal(await filter(),'none','clear survives reopening for the same player');
  await open('two');assert.match(await filter(),/blur/,'a different player must clear their own stage');
  await open('one');assert.equal(await filter(),'none','another player does not erase the first player clear');
  assert.deepEqual(errors,[]);console.log('PASS: blurred community thumbnails and actual game pixels, loss stays blurred, victory reveals original, and account-specific clear persistence');
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
