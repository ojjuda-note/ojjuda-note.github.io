// unchanged production source at line 1
    await frame.locator('#sheet').getByRole('button',{name:'공유하기',exact:true}).click();
    assert.equal(await frame.locator('#three').evaluate(()=>resultShares===1&&!eliminationResolved),true,'sharing does not resolve the spectator choice');
    assert.equal(await page.evaluate(()=>records.length),0,'intermediate elimination does not submit a final result');
    await frame.locator('#sheet').getByRole('button',{name:/계속하기.*관전하기/}).click();
    await frame.locator('#three').evaluate(()=>window.eliminationFinished);
    assert.equal(await frame.locator('#eliminationStatus').isVisible(),true);
    assert.match(await frame.locator('#players .out').innerText(),/탈락[\s\S]*관전 중/);
// unchanged production source at line 82
