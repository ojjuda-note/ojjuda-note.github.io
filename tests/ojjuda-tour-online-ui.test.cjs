// unchanged production source at line 1
  assert.match(await b.frame.locator('#marbleGameRoom').innerText(),new RegExp(code));
  await a.embedded().waitForFunction(()=>MarbleOnline.canAct(),{},{timeout:60000});
  await a.frame.getByRole('button',{name:'기권',exact:true}).click();
  await a.frame.getByRole('button',{name:'기권하고 관전',exact:true}).click();
  await a.embedded().waitForFunction(()=>G.players[0].bankrupt&&G.turn===1,{},{timeout:60000});
  assert.equal(await a.embedded().evaluate(()=>MarbleOnline.canAct()),false);assert.equal(await a.frame.locator('#marbleControls button').count(),0);
  assert.match(await a.frame.locator('#eliminationStatus strong').innerText(),/탈락 · 관전 중/);
// unchanged production source at line 109
  await b.embedded().waitForFunction(()=>G.turn===1&&MarbleOnline.canAct(),{},{timeout:60000});
  assert.ok(await b.embedded().evaluate(()=>G.log.some(x=>x.includes('시간 초과'))));
  await b.frame.getByRole('button',{name:'기권',exact:true}).click();
  await b.frame.getByRole('button',{name:'기권하고 관전',exact:true}).click();
  for(const p of [a,b,c]){
   await p.frame.locator('#s2Btns').getByRole('button',{name:'계속하기',exact:true}).waitFor({timeout:60000});
   assert.equal(await p.page.evaluate(()=>window.localScores),0,'online results never use the casual local score bridge');
   assert.equal(await p.frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'no horizontal overflow');
  }
// unchanged production source at line 123
