'use strict';

// This test reads repository assets only. It never loads the wallet, contacts a
// museum, or connects to Supabase; database changes are tested in local PGlite.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const game = path.join(root, 'games', 'spot-difference');
const core = require(path.join(game, 'game-core.js'));
const catalog = JSON.parse(fs.readFileSync(path.join(game, 'masterpiece-sources.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(game, 'masterpiece-assets.json'), 'utf8'));
const context = vm.createContext({ window: {} });
const load = file => vm.runInContext(fs.readFileSync(path.join(game, file), 'utf8'), context, { filename: file, timeout: 5000 });
const plain = value => JSON.parse(JSON.stringify(value));
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: ${actual} != ${expected}`);

function localAsset(relative, label) {
  assert.equal(typeof relative, 'string', label);
  assert.ok(relative && !path.isAbsolute(relative) && !relative.includes('\\') && !/^[a-z]+:/i.test(relative), `${label} must be a relative repository asset`);
  const file = path.resolve(game, relative);
  assert.ok(file.startsWith(game + path.sep), `${label} must stay inside the game directory`);
  assert.ok(fs.statSync(file).isFile(), `${label} must exist`);
  return file;
}

function https(value, label) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:', `${label} must use HTTPS`);
  assert.ok(url.hostname && !url.username && !url.password, `${label} must be a public source URL`);
}

function jpegDimensions(bytes, label) {
  assert.equal(bytes.readUInt16BE(0), 0xffd8, `${label} must be the museum JPEG`);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    assert.equal(bytes[offset++], 0xff, `${label}: malformed JPEG marker`);
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    const length = bytes.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= bytes.length, `${label}: truncated JPEG segment`);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  assert.fail(`${label}: JPEG dimensions not found`);
}

function pngDimensions(file) {
  const descriptor = fs.openSync(file, 'r');
  const header = Buffer.alloc(33);
  try { assert.equal(fs.readSync(descriptor, header, 0, header.length, 0), header.length, `${file}: PNG header`); }
  finally { fs.closeSync(descriptor); }
  assert.deepEqual(header.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), `${file}: PNG signature`);
  assert.equal(header.readUInt32BE(8), 13, `${file}: IHDR length`);
  assert.equal(header.toString('ascii', 12, 16), 'IHDR', `${file}: first PNG chunk`);
  const width = header.readUInt32BE(16), height = header.readUInt32BE(20);
  assert.ok(width > 0 && height > 0, `${file}: positive dimensions`);
  return { width, height };
}

function bounds(value, label) {
  assert.ok(value && ['left', 'top', 'right', 'bottom'].every(key => Number.isFinite(value[key])), `${label}: finite bounds`);
  assert.ok(value.left >= 0 && value.top >= 0 && value.right <= 100 && value.bottom <= 100, `${label}: bounds inside the original image`);
  assert.ok(value.left < value.right && value.top < value.bottom, `${label}: nonempty bounds`);
}

load('puzzles.js');
load('photo-puzzles.js');
const legacy = JSON.stringify(context.window.JJUDA_PUZZLES);
assert.equal(context.window.JJUDA_PUZZLES.length, 62);
assert.ok(context.window.JJUDA_PUZZLES.every(puzzle => puzzle.spots.length === (puzzle.id === 62 ? 10 : 6)));
load('masterpiece-puzzles.js');
const puzzles = plain(context.window.JJUDA_PUZZLES);
assert.equal(puzzles.length, 82, '62 existing stages plus 20 masterpieces');
assert.equal(JSON.stringify(puzzles.slice(0, 62)), legacy, 'loading masterpieces must preserve every existing puzzle and answer');
assert.deepEqual(puzzles.map(puzzle => puzzle.id), Array.from({ length: 82 }, (_, index) => index + 1));
assert.equal(catalog.artworks.length, 20, 'twenty verified museum originals');
assert.equal(new Set(catalog.artworks.map(source => source.id)).size, 20);
assert.equal(new Set(catalog.artworks.map(source => source.sourceUrl)).size, 20);
assert.equal(new Set(puzzles.slice(62).map(puzzle => puzzle.original)).size, 20, 'each masterpiece uses its own verified source');
assert.equal(manifest.schemaVersion, 1, 'supported publish manifest');
assert.equal(manifest.puzzleDataSha256, crypto.createHash('sha256').update(fs.readFileSync(path.join(game, 'masterpiece-puzzles.js'))).digest('hex'), 'publish manifest identifies the actual puzzle data');
assert.deepEqual(manifest.artworks.map(artwork => artwork.stageId), puzzles.slice(62).map(puzzle => puzzle.id), 'publish manifest covers every masterpiece exactly once');
const publishedStages = new Map(manifest.artworks.map(artwork => [artwork.stageId, artwork]));

const sources = new Map(catalog.artworks.map(source => [source.localPath, source]));
const verifiedPngs = new Map();
const verifiedPublishedAssets = new Set();
const hitFailures = [];
let hitChecks = 0;

for (const puzzle of puzzles.slice(62)) {
  const label = `stage ${puzzle.id} (${puzzle.title})`;
  assert.equal(puzzle.category, 'masterpiece', label);
  assert.equal(puzzle.difficulty, 'very-hard', `${label}: very difficult tier`);
  assert.equal(puzzle.hitMode, 'target-bounds', `${label}: prioritize actual edit regions over neighboring ellipses`);
  assert.equal(puzzle.spots.length, 10, `${label}: ten answers`);
  assert.equal(puzzle.original, puzzle.difference, `${label}: both images use the untouched original outside the registered masks`);
  const originalFile = localAsset(puzzle.original, `${label}: original`);
  const source = sources.get(path.relative(root, originalFile).split(path.sep).join('/'));
  assert.ok(source, `${label}: original belongs to the verified source catalog`);
  assert.equal(puzzle.title, source.title, `${label}: title`);
  for (const field of ['artist', 'year', 'museum', 'sourceUrl']) {
    assert.ok(typeof source[field] === 'string' && source[field].trim(), `${label}: ${field} is present`);
    assert.equal(puzzle.artwork[field], source[field], `${label}: source attribution ${field}`);
  }
  for (const field of ['sourceUrl', 'apiUrl', 'imageUrl', 'rightsUrl', 'licenseUrl']) https(source[field], `${label}: ${field}`);
  assert.equal(source.isPublicDomain, true, `${label}: public domain verified`);
  assert.equal(source.license, 'CC0-1.0', `${label}: museum open access license`);
  assert.ok((source.rightsEvidence?.field === 'isPublicDomain' && source.rightsEvidence.value === true) ||
    (source.rightsEvidence?.field === 'share_license_status' && source.rightsEvidence.value === 'CC0'), `${label}: museum API confirms public-domain or CC0 rights`);

  const originalBytes = fs.readFileSync(originalFile);
  assert.equal(originalBytes.length, source.byteSize, `${label}: original byte length preserved`);
  assert.match(source.sha256, /^[0-9a-f]{64}$/);
  assert.equal(crypto.createHash('sha256').update(originalBytes).digest('hex'), source.sha256, `${label}: original JPEG remains byte-for-byte unchanged`);
  assert.deepEqual(jpegDimensions(originalBytes, label), { width: source.width, height: source.height }, `${label}: museum dimensions`);
  assert.ok(Number.isFinite(puzzle.aspectRatio) && puzzle.aspectRatio > 0, `${label}: aspect ratio`);
  near(puzzle.aspectRatio, source.width / source.height, `${label}: source aspect ratio`);
  near(puzzle.aspectRatio, source.aspectRatio, `${label}: catalog aspect ratio`);

  assert.ok(Array.isArray(puzzle.layers), `${label}: local difference masks`);
  const regions = puzzle.layers.flatMap(layer => {
    const file = localAsset(layer.image, `${label}: difference layer`);
    assert.ok(file.endsWith('.png'), `${label}: generated difference asset is PNG`);
    if (!verifiedPngs.has(file)) verifiedPngs.set(file, pngDimensions(file));
    const { width, height } = verifiedPngs.get(file);
    assert.ok(Math.abs((width / height) / puzzle.aspectRatio - 1) <= 0.01, `${label}: generated PNG keeps the full source aspect ratio within 1%`);
    assert.ok(layer.blend === undefined || ['color', 'normal'].includes(layer.blend), `${label}: supported blend mode`);
    assert.ok(layer.brightness === undefined || (Number.isFinite(layer.brightness) && layer.brightness > 0), `${label}: valid brightness adjustment`);
    if (layer.clipPolygon !== undefined) {
      assert.ok(Array.isArray(layer.clipPolygon) && layer.clipPolygon.length >= 3, `${label}: an explicit color clip needs at least three vertices`);
      assert.ok(layer.clipPolygon.every(point => Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 100)), `${label}: clip vertices stay inside the original image`);
      const area = layer.clipPolygon.reduce((sum, point, i, points) => { const next = points[(i + 1) % points.length]; return sum + point[0] * next[1] - next[0] * point[1]; }, 0);
      assert.ok(Math.abs(area) > 1e-8, `${label}: clip polygon must reveal a nonempty color region`);
    }
    assert.ok(Array.isArray(layer.regions) && layer.regions.length, `${label}: layer has an explicit mask`);
    return layer.regions;
  });
  assert.equal(regions.length, 10, `${label}: exactly ten local masks`);
  assert.deepEqual(regions.map(region => region.spotIndex).sort((a, b) => a - b), Array.from({ length: 10 }, (_, index) => index), `${label}: one mask per answer`);

  // Uploads use this list. A missing plate or stale digest must fail before a
  // release, even when its filename and PNG dimensions still look correct.
  const published = publishedStages.get(puzzle.id);
  assert.equal(published.id, source.id, `${label}: publish artwork identity`);
  assert.equal(published.differenceCount, puzzle.spots.length, `${label}: published answer count`);
  const runtimePaths = [...new Set([puzzle.original, ...puzzle.layers.map(layer => layer.image)])].sort();
  assert.deepEqual(published.assets.map(asset => asset.path).sort(), runtimePaths, `${label}: publish list includes exactly the referenced image files`);
  for (const asset of published.assets) {
    const file = localAsset(asset.path, `${label}: published image`);
    if (verifiedPublishedAssets.has(file)) continue;
    const bytes = file === originalFile ? originalBytes : fs.readFileSync(file);
    const dimensions = file === originalFile ? { width: source.width, height: source.height } : verifiedPngs.get(file);
    assert.equal(asset.bytes, bytes.length, `${asset.path}: publish byte size`);
    assert.equal(asset.sha256, crypto.createHash('sha256').update(bytes).digest('hex'), `${asset.path}: published image hash`);
    assert.deepEqual({ width: asset.width, height: asset.height }, dimensions, `${asset.path}: published dimensions`);
    verifiedPublishedAssets.add(file);
  }

  for (const [index, spot] of puzzle.spots.entries()) {
    const answer = `${label} answer ${index + 1}`;
    const box = spot.targetBounds;
    bounds(box, answer);
    assert.ok(typeof spot.text === 'string' && spot.text.trim(), `${answer}: explanation`);
    assert.ok(['x', 'y', 'rx', 'ry'].every(key => Number.isFinite(spot[key])) && spot.rx > 0 && spot.ry > 0, `${answer}: finite hit ellipse`);
    near(spot.x, (box.left + box.right) / 2, `${answer}: center x`);
    near(spot.y, (box.top + box.bottom) / 2, `${answer}: center y`);
    const region = regions.find(region => region.spotIndex === index);
    assert.ok(['rect', 'ellipse'].includes(region.shape), `${answer}: supported explicit edit mask`);
    assert.ok(Number.isFinite(region.feather) && region.feather >= 0 && region.feather <= 0.5, `${answer}: bounded feather`);
    near(region.x - region.rx, box.left, `${answer}: mask left`);
    near(region.x + region.rx, box.right, `${answer}: mask right`);
    near(region.y - region.ry, box.top, `${answer}: mask top`);
    near(region.y + region.ry, box.bottom, `${answer}: mask bottom`);

    for (let other = 0; other < index; other++) {
      const previous = puzzle.spots[other].targetBounds;
      const overlapX = Math.min(box.right, previous.right) - Math.max(box.left, previous.left);
      const overlapY = Math.min(box.bottom, previous.bottom) - Math.max(box.top, previous.top);
      assert.ok(overlapX <= 1e-8 || overlapY <= 1e-8, `${answer}: edit mask overlaps answer ${other + 1}`);
    }

    for (const [x, y, point] of [
      [spot.x, spot.y, 'center'], [box.left, box.top, 'top-left'], [box.right, box.top, 'top-right'],
      [box.left, box.bottom, 'bottom-left'], [box.right, box.bottom, 'bottom-right']
    ]) {
      hitChecks++;
      const hit = core.hitTest(puzzle, x, y);
      if (hit?.index !== index || hit?.alreadyFound !== false) hitFailures.push(`${answer} ${point}: ${JSON.stringify(hit)}`);
      assert.deepEqual(core.hitTest(puzzle, x, y, [index]), { index, alreadyFound: true }, `${answer} ${point}: a repeated click cannot find a neighbor`);
    }
    assert.deepEqual(core.hitTest(puzzle, spot.x, spot.y, [index]), { index, alreadyFound: true }, `${answer}: repeated click cannot find another answer`);
  }
}

assert.equal(hitFailures.length, 0, `${hitFailures.length} registered answer points are not clickable as the correct answer:\n${hitFailures.slice(0, 30).join('\n')}`);
assert.equal(sources.size, 20);
console.log(`PASS: 82 stages, 61 six-answer puzzles plus stage 62 with ten answers, 20 original JPEG hashes, ${verifiedPngs.size} aligned PNG assets, ${verifiedPublishedAssets.size} publish-manifest hashes, 200 separate edit masks, ${hitChecks} center/corner hits, and HTTPS museum attribution; repository files only`);
