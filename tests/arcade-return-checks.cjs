const assert = require('node:assert/strict');

const label = '← 오쭈다 오락실';

async function checkCorner(control) {
  await control.waitFor({ state: 'visible' });
  const box = await control.boundingBox();
  assert.ok(box && box.x >= 0 && box.x <= 30 && box.y >= 0 && box.y <= 30,
    'arcade return must be in the top-left corner: ' + JSON.stringify(box));
  assert.ok(box.height >= 44, 'the return control has a touch target of at least 44px');
}

// Use the same origin and real files as the game-entry browser fixture.
async function checkSpot(page) {
  for (const motion of [false, true]) {
    await page.goto('https://fixture.test/games/spot-difference/index.html');
    if (motion) {
      await page.locator('#motion-entry').click();
      await page.getByRole('heading', { name: '움직이는 틀린그림찾기' }).waitFor();
    }
    const back = page.getByRole('link', { name: label, exact: true });
    await checkCorner(back);
    await back.click();
    assert.equal(new URL(page.url()).search, '?tab=arcade');
  }
}

module.exports = { label, checkCorner, checkSpot };
