import assert from 'node:assert/strict';
import {test} from 'node:test';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildSeasonalIcons} from '../ops/build-seasonal-app-icons.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
const apps = {
  agit: {directory: '', manifest: 'manifest.webmanifest'},
  park: {directory: 'park/assets', manifest: 'park/manifest.webmanifest'},
  pajang: {directory: 'features/pajang/assets', manifest: 'features/pajang/manifest.webmanifest'}
};
const colors = {spring: '#ee9999', summer: '#22aa66', autumn: '#bb6611', winter: '#66aadd', newyear: '#ddbb66', seollal: '#ee88aa', chuseok: '#aa7733', christmas: '#aa3322'};
const command = ['magick', 'convert'].find((name) => {
  const result = spawnSync(name, ['-version'], {encoding: 'utf8'});
  return result.status === 0 && result.stdout.includes('ImageMagick');
});

function image(args) {
  assert.ok(command, 'ImageMagick is required for the icon packaging integration test');
  const result = spawnSync(command, args, {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture(t) {
  const temporary = mkdtempSync(join(tmpdir(), 'seasonal-icon-test-'));
  t.after(() => rmSync(temporary, {recursive: true, force: true}));
  const source = join(temporary, 'source');
  const output = join(temporary, 'public');
  for (const path of ['shared/app-icons/calendar.json']) {
    mkdirSync(dirname(join(source, path)), {recursive: true});
    copyFileSync(join(repo, path), join(source, path));
  }
  for (const path of [
    'manifest.webmanifest', 'park/manifest.webmanifest', 'features/pajang/manifest.webmanifest',
    'shared/pwa/app-identity.js', 'shared/pwa/pwa-install.js',
    'index.html', 'world.html', 'park/index.html', 'features/pajang/index.html', 'features/pajang/station.html'
  ]) {
    mkdirSync(dirname(join(output, path)), {recursive: true});
    copyFileSync(join(repo, path), join(output, path));
  }
  // Deliberately different border and center verify that normal and maskable
  // outputs use their respective safe-area geometries, not only file names.
  for (const [theme, color] of Object.entries(colors)) {
    const sample = join(temporary, theme + '.png');
    image(['-size', '1024x1024', 'xc:#123456', '-fill', color, '-draw', 'rectangle 112,112 911,911', sample]);
    for (const app of Object.keys(apps)) {
      const destination = join(source, 'brand/app-icons/seasonal', app, theme + '.png');
      mkdirSync(dirname(destination), {recursive: true});
      copyFileSync(sample, destination);
    }
  }
  return {sourceRoot: source, outputRoot: output};
}

test('packaging selects the KST artwork, creates usable PNGs, and preserves every app identity', (t) => {
  const options = fixture(t);
  const original = Object.fromEntries(Object.entries(apps).map(([key, config]) => [key, JSON.parse(readFileSync(join(options.outputRoot, config.manifest), 'utf8'))]));
  const state = buildSeasonalIcons({...options, date: '2026-07-14T15:00:00Z'});
  assert.equal(state.date, '2026-07-15');
  assert.equal(state.theme, 'summer');
  assert.match(state.revision, /^seasonal-v1-summer-[a-f0-9]{12}$/);
  for (const [key, config] of Object.entries(apps)) {
    const current = JSON.parse(readFileSync(join(options.outputRoot, config.manifest), 'utf8'));
    const {icons: beforeIcons, ...beforeIdentity} = original[key];
    const {icons: afterIcons, ...afterIdentity} = current;
    assert.deepEqual(afterIdentity, beforeIdentity, key + ' must retain the same install target');
    for (let i = 0; i < beforeIcons.length; i++) {
      assert.equal(afterIcons[i].src.split('?')[0], beforeIcons[i].src.split('?')[0]);
      assert.equal(new URL(afterIcons[i].src, 'https://ojjuda.kr/').searchParams.get('v'), state.revision);
    }
    for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180], ['icon-maskable-512.png', 512]]) {
      const destination = join(options.outputRoot, config.directory, file);
      assert.equal(image([destination, '-format', '%w %h %[opaque]', 'info:']).toLowerCase(), `${size} ${size} true`);
    }
    const regular = join(options.outputRoot, config.directory, 'icon-512.png');
    const maskable = join(options.outputRoot, config.directory, 'icon-maskable-512.png');
    assert.equal(image([regular, '-format', '%[hex:p{0,0}]', 'info:']).slice(0, 6).toLowerCase(), '22aa66');
    assert.equal(image([maskable, '-format', '%[hex:p{0,0}]', 'info:']).slice(0, 6).toLowerCase(), '123456');
  }
  const identity = readFileSync(join(options.outputRoot, 'shared/pwa/app-identity.js'), 'utf8');
  assert.ok(identity.includes(`const iconRevision = '${state.revision}'`));
  assert.ok(identity.includes("const manifestRevision = '20261119-illustrated-icons-1'"));
  const world = readFileSync(join(options.outputRoot, 'world.html'), 'utf8');
  assert.ok(world.includes('manifest.webmanifest?v=20261119-illustrated-icons-1'));
  assert.ok(world.includes('/shared/pwa/app-identity.js?v=' + state.scriptRevision));
  assert.ok(world.includes('/icon-192.png?v=' + state.revision));
  const install = readFileSync(join(options.outputRoot, 'shared/pwa/pwa-install.js'), 'utf8');
  assert.ok(install.includes('/icon-192.png?v=' + state.revision));
});

test('ordinary dates do not churn icon URLs, but a seasonal change updates artwork and revision', (t) => {
  const options = fixture(t);
  const summer = buildSeasonalIcons({...options, date: '2026-07-15'});
  const original = readFileSync(join(options.outputRoot, 'icon-512.png'));
  const nextDay = buildSeasonalIcons({...options, date: '2026-07-16'});
  assert.equal(nextDay.revision, summer.revision);
  assert.equal(nextDay.scriptRevision, summer.scriptRevision);
  assert.deepEqual(readFileSync(join(options.outputRoot, 'icon-512.png')), original);
  const autumn = buildSeasonalIcons({...options, date: '2026-10-15'});
  assert.equal(autumn.theme, 'autumn');
  assert.notEqual(autumn.revision, summer.revision);
  assert.notDeepEqual(readFileSync(join(options.outputRoot, 'icon-512.png')), original);
  assert.equal(JSON.parse(readFileSync(join(options.outputRoot, 'shared/app-icons/current.json'), 'utf8')).revision, autumn.revision);
});

test('a missing future event asset fails before any existing public file is overwritten', (t) => {
  const options = fixture(t);
  const manifest = join(options.outputRoot, 'manifest.webmanifest');
  const before = readFileSync(manifest);
  const marker = Buffer.from('previous public icon');
  writeFileSync(join(options.outputRoot, 'icon-192.png'), marker);
  rmSync(join(options.sourceRoot, 'brand/app-icons/seasonal/park/christmas.png'));
  assert.throws(() => buildSeasonalIcons({...options, date: '2026-07-15'}), /Missing seasonal icon: park\/christmas\.png/);
  assert.deepEqual(readFileSync(manifest), before);
  assert.deepEqual(readFileSync(join(options.outputRoot, 'icon-192.png')), marker);
});
