const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const core = require('../games/spot-difference/game-core.js');

const root = path.join(__dirname, '..', 'games', 'spot-difference');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const context = vm.createContext({window: {}});
for (const file of ['puzzles.js', 'photo-puzzles.js', 'masterpiece-puzzles.js']) {
  vm.runInContext(read(file), context, {filename: file});
}
const previous = JSON.stringify(context.window.JJUDA_PUZZLES);
assert.equal(context.window.JJUDA_PUZZLES.length, 82);
vm.runInContext(read('fairytale-pets-puzzles.js'), context, {filename: 'fairytale-pets-puzzles.js'});
const puzzles = JSON.parse(JSON.stringify(context.window.JJUDA_PUZZLES));
const added = puzzles.slice(82);
assert.equal(JSON.stringify(puzzles.slice(0, 82)), previous, 'appending preserves every old puzzle and its raw index');
assert.equal(puzzles.length, 152);
assert.equal(new Set(puzzles.map(p => p.id)).size, 152);
assert.deepEqual(added.map(p => p.id), Array.from({length: 70}, (_, i) => i + 83));
assert.deepEqual(added.reduce((counts, p) => {counts[p.category] = (counts[p.category] || 0) + 1; return counts;}, {}), {fairytale: 30, cat: 20, dog: 20});

const manifest = JSON.parse(read('fairytale-pets-assets.json'));
assert.equal(manifest.totalPuzzles, 70);
assert.equal(manifest.puzzles.length, 70);
assert.equal(manifest.difficulty, 'slightly-hard');
assert.match(manifest.generation, /AI-generated original/);

// Parse the actual WebP container rather than trusting manifest dimensions.
function webpInfo(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8, 'complete RIFF payload');
  let info, imageData = false, alpha = false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const type = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4), start = offset + 8;
    assert.ok(start + size <= bytes.length, 'complete WebP chunk');
    if (type === 'VP8X') {
      assert.ok(size >= 10);
      info = {width: bytes.readUIntLE(start + 4, 3) + 1, height: bytes.readUIntLE(start + 7, 3) + 1};
      alpha ||= !!(bytes[start] & 0x10);
    } else if (type === 'VP8L') {
      assert.ok(size >= 5);
      assert.equal(bytes[start], 0x2f);
      const bits = bytes.readUInt32LE(start + 1);
      info ||= {width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1};
      alpha ||= !!((bits >>> 28) & 1);
      imageData = true;
    } else if (type === 'VP8 ') {
      assert.ok(size >= 10);
      assert.equal(bytes.subarray(start + 3, start + 6).toString('hex'), '9d012a');
      info ||= {width: bytes.readUInt16LE(start + 6) & 0x3fff, height: bytes.readUInt16LE(start + 8) & 0x3fff};
      imageData = true;
    }
    offset = start + size + (size % 2);
  }
  assert.ok(info && imageData, 'contains encoded image data');
  return {...info, alpha};
}

const originalHashes = new Set(), references = new Set();
let assetBytes = 0, hitChecks = 0;
for (const puzzle of added) {
  assert.equal(puzzle.difficulty, 'slightly-hard');
  assert.equal(puzzle.spots.length, 10);
  assert.equal(puzzle.spots.filter(s => s.visibility === 'normal').length, 6);
  assert.equal(puzzle.spots.filter(s => s.visibility === 'zoom').length, 4);
  assert.equal(puzzle.hitMode, 'target-bounds');
  assert.equal(puzzle.original, puzzle.difference, 'both pictures share the exact base image');
  assert.equal(puzzle.differenceMode, undefined, 'review-only overlay mode is not a native game field');
  assert.equal(puzzle.layers.length, 1);
  const regions = puzzle.layers.flatMap(layer => layer.regions).sort((a, b) => a.spotIndex - b.spotIndex);
  assert.deepEqual(regions.map(r => r.spotIndex), Array.from({length: 10}, (_, i) => i));
  for (let i = 0; i < puzzle.spots.length; i++) {
    const spot = puzzle.spots[i], region = regions[i], b = spot.targetBounds;
    assert.ok(spot.text && [spot.x, spot.y, spot.rx, spot.ry].every(Number.isFinite));
    assert.ok(spot.rx > 0 && spot.ry > 0);
    assert.ok([b.left, b.top, b.right, b.bottom].every(Number.isFinite));
    assert.ok(b.left >= 0 && b.top >= 0 && b.right <= 100 && b.bottom <= 100);
    assert.ok(b.left < b.right && b.top < b.bottom);
    assert.ok(spot.x >= b.left && spot.x <= b.right && spot.y >= b.top && spot.y <= b.bottom);
    assert.equal(region.shape, 'rect');
    for (const [actual, expected] of [[region.x - region.rx, b.left], [region.x + region.rx, b.right], [region.y - region.ry, b.top], [region.y + region.ry, b.bottom]]) assert.ok(Math.abs(actual - expected) < 1e-8);
    for (const other of puzzle.spots.slice(0, i)) {
      const a = other.targetBounds;
      assert.ok(Math.min(a.right, b.right) <= Math.max(a.left, b.left) + 0.05 || Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top) + 0.05, 'answer areas do not overlap');
    }
    const epsilon = 0.001;
    for (const [x, y] of [[spot.x, spot.y], [b.left + epsilon, b.top + epsilon], [b.right - epsilon, b.bottom - epsilon]]) {
      assert.equal(core.hitTest(puzzle, x, y)?.index, i, `puzzle ${puzzle.id}, answer ${i + 1}: changed area can be selected`);
      hitChecks++;
    }
    assert.equal(core.hitTest(puzzle, spot.x, spot.y, [i]).alreadyFound, true);
  }
  const entry = manifest.puzzles.find(p => p.id === puzzle.id);
  assert.ok(entry);
  assert.equal(entry.number, puzzle.id - 82);
  assert.equal(entry.category, puzzle.category);
  assert.deepEqual(Object.keys(entry.files).sort(), ['changes', 'original']);
  assert.equal(entry.files.original.path, puzzle.original);
  assert.equal(entry.files.changes.path, puzzle.layers[0].image);
  const metadata = {};
  for (const [role, file] of Object.entries(entry.files)) {
    assert.match(file.path, /^assets\/fairytale-pets\/\d{2}-(?:original|changes)\.webp$/);
    assert.equal(path.posix.normalize(file.path), file.path, 'relative asset path cannot escape the game');
    assert.ok(!references.has(file.path), 'each puzzle owns its image pair');
    references.add(file.path);
    const bytes = fs.readFileSync(path.join(root, file.path));
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(bytes.length, file.bytes);
    assert.equal(sha256, file.sha256, 'asset bytes match the reviewed manifest');
    const info = webpInfo(bytes);
    assert.equal(info.width, file.width);
    assert.equal(info.height, file.height);
    assert.ok(info.width >= 800 && info.height >= 800, 'zoom details retain source resolution');
    if (role === 'changes') assert.ok(info.alpha, 'the changes image retains transparency');
    else originalHashes.add(sha256);
    metadata[role] = info;
    assetBytes += bytes.length;
  }
  assert.equal(metadata.original.width, metadata.changes.width);
  assert.equal(metadata.original.height, metadata.changes.height);
  assert.equal(puzzle.aspectRatio, metadata.original.width / metadata.original.height);
}
assert.equal(references.size, 140);
assert.equal(originalHashes.size, 70, 'seventy distinct original pictures');

const order = core.difficultyOrder(puzzles);
assert.deepEqual(order.map(i => puzzles[i].id), [
  ...Array.from({length: 48}, (_, i) => i + 1),
  ...Array.from({length: 70}, (_, i) => i + 83),
  ...Array.from({length: 34}, (_, i) => i + 49)
]);
const resumed = core.cleanProgress({version: 2, current: 48, completed: [1, 48, 49, 82]}, puzzles);
assert.equal(puzzles[resumed.current].id, 49, 'an old save resumes the same picture after adding the new tier');
assert.equal(resumed.order.indexOf(resumed.current) + 1, 119);
assert.deepEqual(resumed.completed, [1, 48, 49, 82], 'completion history uses unchanged IDs');
const html = read('index.html');
assert.ok(html.indexOf('masterpiece-puzzles.js') < html.indexOf('fairytale-pets-puzzles.js'), 'new data is loaded after the existing arrays');
assert.ok(html.indexOf('fairytale-pets-puzzles.js') < html.indexOf('game-core.js'));
console.log(`PASS: 70 slightly-hard scenes, 700 answers including 280 zoom details, ${hitChecks} target checks, ${references.size} hash-verified WebP files (${assetBytes} bytes), unchanged old IDs and saved progress, display positions 49–118`);
