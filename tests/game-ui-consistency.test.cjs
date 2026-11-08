const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const revision = JSON.parse(read('game-release.json')).revision;
const entry = read('shared/games/game-entry.css');
const multiplayer = read('shared/games/multiplayer-entry.css');
const results = read('shared/games/game-results.css');
const controls = read('shared/games/game-controls.css');
const world = read('world.html');

function contrast(foreground, background) {
  const luminance = hex => {
    const rgb = hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16) / 255);
    return rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
      .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

test('game entry, settings and result use the same Ojjuda color and focus vocabulary', () => {
  assert.match(world, /name="theme-color" content="#245A48"/i, 'the shared palette follows the main arcade green');
  assert.match(entry, /--entry-ink:#223a30/);
  assert.match(entry, /--entry-muted:#667467/);
  assert.match(entry, /--entry-accent:#2a644e/);
  assert.match(entry, /--entry-line:#dfe6dd/);
  assert.match(multiplayer, /\.game-entry\.mp-entry\{--entry-ink:#223a30;--entry-muted:#667467;--entry-line:#dfe6dd;--entry-accent:#2a644e;--entry-soft:#edf5eb/, 'multiplayer start cards share the same design tokens');
  assert.match(multiplayer, /\.mp-entry-host\[data-mp-active="true"\]\{[^\n]+background:#f6f7f0!important/, 'board and iframe game shells use the quiet Ojjuda backdrop');
  assert.match(multiplayer, /:root\[data-world-theme\]:not\(\[data-theme=dark\]\) \.game-entry\.mp-entry/, 'multiplayer starts inherit the same seasonal accent');
  assert.match(results, /--result-accent:#2a644e/);
  assert.match(results, /font-family:"Noto Sans KR"/);
  assert.match(controls, /color:#223a30/);
  assert.match(controls, /background:#edf5eb/);
  for (const [name, css] of [['entry', entry], ['multiplayer', multiplayer], ['results', results], ['controls', controls]]) {
    assert.doesNotMatch(css, /#(?:7560b5|302d43|e9e5f0|f3f0f9|f5f3f9|65518e)/i, `${name} must not bring back the old purple shell`);
    assert.match(css, /:focus-visible/, `${name} must retain a visible keyboard focus`);
  }
  assert.ok(contrast('ffffff', '2a644e') >= 4.5, 'shared primary action is readable with white text');
  assert.ok(contrast('223a30', 'edf5eb') >= 4.5, 'shared secondary action is readable');
  assert.match(entry, /prefers-reduced-motion:reduce/, 'shared launch animation respects reduced motion');
  assert.match(results, /prefers-reduced-motion:reduce/, 'results respect reduced motion');
  assert.match(entry, /:root\[data-world-theme\]:not\(\[data-theme=dark\]\) \.game-entry/, 'game starts inherit the active seasonal arcade accent');
  assert.match(results, /:root\[data-world-theme\]:not\(\[data-theme=dark\]\) \.game-result-card\[data-result-outcome="success"\]/, 'winning results inherit the same accent');
  assert.match(controls, /:root\[data-world-theme\]:not\(\[data-theme=dark\]\) \.game-controls button/, 'game control buttons follow the same seasonal theme');
  const themes = read('app/world/world-themes.css');
  const seasonalAccents = [...themes.matchAll(/:root\[data-world-theme="[^"]+"\]\{[^}]*?--accent:(#[0-9a-f]{6})/gi)].map(match => match[1].slice(1));
  assert.ok(seasonalAccents.length >= 15, 'all seasonal palettes remain in the audit');
  for (const accent of seasonalAccents) {
    assert.ok(contrast('ffffff', accent) >= 4.5, `the seasonal primary action #${accent} must be readable`);
  }
});

test('the arcade and every standalone game load one current shared game UI revision', () => {
  const games = fs.readdirSync(path.join(root, 'games'), { withFileTypes: true });
  const pages = ['world.html'];
  for (const game of games) {
    if (game.isFile() && game.name.endsWith('.html')) pages.push(`games/${game.name}`);
    else if (game.isDirectory() && fs.existsSync(path.join(root, 'games', game.name, 'index.html'))) {
      pages.push(`games/${game.name}/index.html`);
    }
  }
  let sharedReferences = 0;
  let multiplayerReferences = 0;
  for (const page of pages) {
    const html = read(page);
    for (const match of html.matchAll(/\/shared\/games\/game-(entry|results|controls)\.css\?v=([\w-]+)/g)) {
      sharedReferences++;
      assert.equal(match[2], revision, `${page}: outdated ${match[1]} CSS cache revision`);
    }
    for (const match of html.matchAll(/\/shared\/games\/multiplayer-entry\.css\?v=([\w-]+)/g)) {
      multiplayerReferences++;
      assert.equal(match[1], revision, `${page}: outdated multiplayer entrance CSS revision`);
    }
  }
  assert.ok(sharedReferences >= 25, 'the shared style covers many game entrances and outcomes');
  assert.ok(multiplayerReferences >= 8, 'each multiplayer game loads the unified entrance styles');
  assert.ok(world.includes(`/shared/games/world-game-assets.js?v=${revision}`));
  assert.ok(world.includes(`/shared/games/game-results.js?v=${revision}`));
  assert.ok(world.includes(`/shared/games/chacha-rush-portal.js?v=${revision}`));
  assert.ok(read('shared/games/world-game-assets.js').includes(`const revision='${revision}'`));
  assert.ok(read('shared/games/world-game-assets.js').includes(`/shared/games/game-controls.css?v=${revision}`));
});
