// Build public icon derivatives without changing any installed app's identity.
// Run this against a staged Pages directory, or the repository for a snapshot.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {getThemeSelection} from '../shared/app-icons/selector.mjs';

const REPO = fileURLToPath(new URL('../', import.meta.url));
const RENDERER = 'seasonal-v1';
const APPS = {
  agit: {directory: '', manifest: 'manifest.webmanifest'},
  park: {directory: 'park/assets', manifest: 'park/manifest.webmanifest'},
  pajang: {directory: 'features/pajang/assets', manifest: 'features/pajang/manifest.webmanifest'}
};
const SIZES = {'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180, 'icon-maskable-512.png': 512};
const THEMES = ['spring', 'summer', 'autumn', 'winter', 'newyear', 'seollal', 'chuseok', 'christmas'];
const ENTRIES = ['index.html', 'world.html', 'park/index.html', 'features/pajang/index.html', 'features/pajang/station.html'];
const RUNTIMES = ['shared/pwa/app-identity.js', 'shared/pwa/pwa-install.js'];

function imageMagick() {
  for (const command of ['magick', 'convert']) {
    const result = spawnSync(command, ['-version'], {encoding: 'utf8'});
    if (result.status === 0 && result.stdout.includes('ImageMagick')) return command;
  }
  throw new Error('ImageMagick is required to resize the approved icon artwork.');
}

function run(command, args) {
  const result = spawnSync(command, args, {encoding: 'utf8', timeout: 60000, maxBuffer: 1024 * 1024});
  if (result.status !== 0 || result.error) throw new Error(`Icon conversion failed: ${result.error?.message || result.stderr.trim()}`);
  return result.stdout.trim();
}

function writeIfChanged(file, data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (existsSync(file) && readFileSync(file).equals(bytes)) return;
  mkdirSync(dirname(file), {recursive: true});
  writeFileSync(file, bytes);
}

function versionURL(url, revision) {
  const [address, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set('v', revision);
  return address + '?' + params;
}

function reviseAssetURLs(source, paths, revision) {
  const escaped = paths.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp('(["\'])(' + escaped.join('|') + ')(?:\\?[^"\']*)?(?=["\'])', 'g');
  return source.replace(pattern, (_, quote, path) => quote + path + '?v=' + revision);
}

function identityRevision(source, revision) {
  const marker = /const iconRevision = '[^']+';/;
  if (!marker.test(source)) throw new Error('Missing app identity icon revision marker.');
  return source.replace(marker, `const iconRevision = '${revision}';`);
}

export function buildSeasonalIcons({outputRoot, sourceRoot = REPO, date = new Date()} = {}) {
  if (!outputRoot || !statSync(outputRoot).isDirectory()) throw new Error('An existing output directory is required.');
  outputRoot = resolve(outputRoot);
  sourceRoot = resolve(sourceRoot);
  const calendar = JSON.parse(readFileSync(join(sourceRoot, 'shared/app-icons/calendar.json'), 'utf8'));
  const selection = getThemeSelection(date, calendar);
  if (!THEMES.includes(selection.theme)) throw new Error('Unknown selected icon theme.');
  const command = imageMagick();
  const artwork = {};

  // Missing future artwork must fail now, before an unattended event-day build.
  // All generated sources are square, opaque, and composed for the maskable safe circle.
  for (const app of Object.keys(APPS)) {
    for (const theme of THEMES) {
      const file = join(sourceRoot, 'brand/app-icons/seasonal', app, theme + '.png');
      if (!existsSync(file)) throw new Error(`Missing seasonal icon: ${app}/${theme}.png`);
      const bytes = readFileSync(file);
      if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
        throw new Error(`Seasonal icon must be PNG: ${app}/${theme}.png`);
      }
      const dimensions = run(command, [file, '-format', '%w %h %[opaque]', 'info:']).toLowerCase();
      if (dimensions !== '1024 1024 true') throw new Error(`Seasonal icon must be opaque 1024×1024: ${app}/${theme}.png`);
      if (theme === selection.theme) artwork[app] = {file, hash: createHash('sha256').update(bytes).digest('hex')};
    }
  }

  // Dates within the same theme reuse the same URLs. This avoids identity-update
  // prompts every morning while still detecting a changed illustration.
  const digest = createHash('sha256').update(RENDERER);
  for (const [app, source] of Object.entries(artwork)) digest.update(app + ':' + source.hash);
  const revision = `${RENDERER}-${selection.theme}-${digest.digest('hex').slice(0, 12)}`;
  const textOutputs = new Map();
  const iconPaths = [];
  for (const [app, config] of Object.entries(APPS)) {
    const manifestFile = join(outputRoot, config.manifest);
    const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (!Array.isArray(manifest.icons) || manifest.icons.length !== 3) throw new Error(`Unexpected icon manifest: ${app}`);
    for (const icon of manifest.icons) {
      const url = new URL(icon.src, 'https://ojjuda.kr/' + config.manifest);
      const filename = url.pathname.split('/').pop();
      const expected = '/' + [config.directory, filename].filter(Boolean).join('/');
      if (url.origin !== 'https://ojjuda.kr' || url.pathname !== expected || !Object.hasOwn(SIZES, filename)) {
        throw new Error(`Unexpected icon source in ${config.manifest}`);
      }
      icon.src = versionURL(icon.src, revision);
    }
    textOutputs.set(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
    for (const filename of Object.keys(SIZES)) {
      const iconPath = '/' + [config.directory, filename].filter(Boolean).join('/');
      iconPaths.push(iconPath);
      if (!config.directory) iconPaths.push(filename);
    }
  }

  const identityPath = join(outputRoot, RUNTIMES[0]);
  const installPath = join(outputRoot, RUNTIMES[1]);
  const identity = identityRevision(readFileSync(identityPath, 'utf8'), revision);
  const install = reviseAssetURLs(readFileSync(installPath, 'utf8'), iconPaths, revision);
  textOutputs.set(identityPath, identity);
  textOutputs.set(installPath, install);
  const scriptRevision = 'app-icons-' + createHash('sha256').update(identity).update(install).digest('hex').slice(0, 12);

  const entries = [...ENTRIES];
  if (existsSync(join(outputRoot, 'pajang/index.html'))) entries.push('pajang/index.html');
  for (const relative of entries) {
    const file = join(outputRoot, relative);
    let html = reviseAssetURLs(readFileSync(file, 'utf8'), iconPaths, revision);
    html = reviseAssetURLs(html, RUNTIMES.map((path) => '/' + path), scriptRevision);
    textOutputs.set(file, html);
  }

  const state = {
    schemaVersion: 1, timezone: 'Asia/Seoul', ...selection, revision, scriptRevision,
    geometry: {source: '1024x1024', regular: 'center 800x800', maskable: 'full 1024x1024'},
    apps: Object.fromEntries(Object.entries(APPS).map(([app, config]) => [app, {
      source: `brand/app-icons/seasonal/${app}/${selection.theme}.png`,
      sha256: artwork[app].hash,
      icon: versionURL('/' + [config.directory, 'icon-192.png'].filter(Boolean).join('/'), revision)
    }]))
  };
  textOutputs.set(join(outputRoot, 'shared/app-icons/current.json'), JSON.stringify(state, null, 2) + '\n');
  const temporary = mkdtempSync(join(tmpdir(), 'ojjuda-seasonal-icons-'));
  try {
    const images = [];
    for (const [app, config] of Object.entries(APPS)) {
      for (const [filename, size] of Object.entries(SIZES)) {
        const staged = join(temporary, app + '-' + filename);
        const crop = filename === 'icon-maskable-512.png' ? [] : ['-gravity', 'center', '-crop', '800x800+0+0', '+repage'];
        run(command, [artwork[app].file, ...crop, '-resize', `${size}x${size}`, '-strip', staged]);
        images.push([join(outputRoot, config.directory, filename), readFileSync(staged)]);
      }
    }
    // Conversion and all metadata validation succeeded before publication files change.
    for (const [file, bytes] of images) writeIfChanged(file, bytes);
    for (const [file, content] of textOutputs) writeIfChanged(file, content);
  } finally {
    rmSync(temporary, {recursive: true, force: true});
  }
  return state;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const outputRoot = args.shift();
    const options = {outputRoot};
    while (args.length) {
      const flag = args.shift();
      if (!['--date', '--source-root'].includes(flag) || !args.length) throw new Error('Usage: node ops/build-seasonal-app-icons.mjs OUTPUT [--date YYYY-MM-DD] [--source-root SOURCE]');
      options[flag === '--date' ? 'date' : 'sourceRoot'] = args.shift();
    }
    const result = buildSeasonalIcons(options);
    process.stdout.write(JSON.stringify({date: result.date, theme: result.theme, revision: result.revision}) + '\n');
  } catch (error) {
    process.stderr.write(error.message + '\n');
    process.exitCode = 1;
  }
}
