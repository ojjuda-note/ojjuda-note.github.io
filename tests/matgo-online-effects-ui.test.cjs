// unchanged production source at line 1
    await reduced.page.locator('#event[data-kind=end]:not([hidden])').waitFor();
    assert.equal(await reduced.page.locator('#rematch').count(),0);
    await reduced.page.locator('#rematch').waitFor();
    const exitRect=await reduced.page.locator('#result-exit').boundingBox(),nextRect=await reduced.page.locator('#rematch').boundingBox();
    assert.ok(exitRect.x+exitRect.width<=nextRect.x && Math.abs(exitRect.y-nextRect.y)<1,'leave and continue stay on one row in that order');
    const empty={...finished,version:5,gold:[0,10000]};
    await present(reduced.page,empty);await reduced.page.evaluate(()=>presenting);
    assert.equal(await reduced.page.locator('#rematch').innerText(),'골드 충전');
    await present(reduced.page,{...empty,gold:[5000,10000]});await reduced.page.evaluate(()=>presenting);
    assert.equal(await reduced.page.locator('#rematch').innerText(),'계속하기','a refill updates the result even when the room version is unchanged');
    await reduced.context.close();
    for(const actor of [0,1])for(const availablePi of [0,1]){
      const sample=await screen({muted:true,reduced:true}),p=sample.page;
// unchanged production source at line 102
