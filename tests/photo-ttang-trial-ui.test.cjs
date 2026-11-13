// unchanged production source at line 1
    assert.equal(await winningFrame.locator('.fullimg').evaluate(el => getComputedStyle(el).filter), 'none');
    const result = winningFrame.locator('[data-game-result-card]');
    assert.equal(await result.getAttribute('data-result-outcome'), 'success');
    const login = winningFrame.getByRole('link', { name: '로그인', exact: true });
    assert.equal(await login.getAttribute('href'), '/?auth=login&next=photo');
    assert.equal(await login.getAttribute('target'), '_top');
    assert.equal(await winningFrame.getByRole('button', { name: '다음 사진', exact: true }).count(), 0);
    assert.equal(await winningFrame.locator('[data-game-result-play]').count(), 0, 'a finished demo offers no replay');
    await result.getByRole('button', { name: '공유하기', exact: true }).click();
    assert.equal(await winningFrame.evaluate(() => fixtureShares.length), 1);
// unchanged production source at line 85
      } else {
        await game.evaluate(() => { paused = false; });
        await game.getByRole('button', { name: '일시정지', exact: true }).click();
        await game.getByRole('button', { name: '사진 목록', exact: true }).click();
      }
      if (outcome !== 'leave') {
        await game.getByRole('link', { name: '로그인', exact: true }).waitFor();
        assert.equal(await game.locator('[data-game-result-card]').getAttribute('data-result-outcome'), 'failure');
        assert.equal(await game.getByRole('button', { name: /^(다시 도전|다시 하기|다음 사진)$/ }).count(), 0);
        await game.getByRole('button', { name: '공유하기', exact: true }).click();
        assert.equal(await game.evaluate(() => fixtureShares.length), 1);
        assert.equal(await game.locator('[data-game-result-card]').isVisible(), true);
// unchanged production source at line 120
