// unchanged production source at line 1
// A game release has its own revision; unchanged shared CSS/JS keep their existing
// cache keys. AGENTS.md requires refreshing assets modified by the release,
// not all unrelated game entrances.
const sharedUiRevision = (read('world.html').match(/\/shared\/games\/game-results\.css\?v=([\w-]+)/) || [])[1];
assert.ok(/^\d{8}-[a-z0-9-]+$/.test(sharedUiRevision), 'shared UI cache revision is valid');
const entry = read('shared/games/game-entry.css');
const multiplayer = read('shared/games/multiplayer-entry.css');
const results = read('shared/games/game-results.css');
// unchanged production source at line 14
      pages.push(`games/${game.name}/index.html`);
    }
  }
  let sharedReferences = 0;
  let multiplayerReferences = 0;
  for (const page of pages) {
    const html = read(page);
    for (const match of html.matchAll(/\/shared\/games\/game-(entry|results|controls)\.css\?v=([\w-]+)/g)) {
      sharedReferences++;
      assert.equal(match[2], sharedUiRevision, `${page}: inconsistent ${match[1]} CSS cache revision`);
    }
    for (const match of html.matchAll(/\/shared\/games\/multiplayer-entry\.css\?v=([\w-]+)/g)) {
      multiplayerReferences++;
      assert.equal(match[1], sharedUiRevision, `${page}: inconsistent multiplayer entrance CSS revision`);
    }
  }
  assert.ok(sharedReferences >= 25, 'the shared style covers many game entrances and outcomes');
  assert.ok(multiplayerReferences >= 8, 'each multiplayer game loads the unified entrance styles');
  assert.ok(world.includes(`/shared/games/world-game-assets.js?v=${revision}`));
  assert.ok(world.includes(`/shared/games/game-results.js?v=${sharedUiRevision}`));
  assert.match(world, /\/shared\/games\/chacha-rush-portal\.js\?v=\d{8}-[a-z0-9-]+/,
    'the score portal keeps its own cache revision when updated independently of shared CSS');
  assert.ok(read('shared/games/world-game-assets.js').includes(`const revision='${revision}'`));
  assert.ok(read('shared/games/world-game-assets.js').includes(`/shared/games/game-controls.css?v=${sharedUiRevision}`));
});
