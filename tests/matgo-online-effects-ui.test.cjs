// unchanged production source at line 1
    await reduced.page.locator('#event[data-kind=end]:not([hidden])').waitFor();
    assert.equal(await reduced.page.locator('#rematch').count(),0);
    await reduced.page.locator('#rematch').waitFor();
    const empty={...finished,version:5,gold:[0,10000]};
    await present(reduced.page,empty);await reduced.page.evaluate(()=>presenting);
    assert.equal(await reduced.page.locator('#rematch').innerText(),'골드 충전');
    await present(reduced.page,{...empty,gold:[5000,10000]});await reduced.page.evaluate(()=>presenting);
    assert.equal(await reduced.page.locator('#rematch').innerText(),'다음 판','a refill updates the result even when the room version is unchanged');
    await reduced.context.close();
    for(const actor of [0,1])for(const availablePi of [0,1]){
      const sample=await screen({muted:true,reduced:true}),p=sample.page;
// unchanged production source at line 102
