const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../games/spot-difference/game-core.js');

// Answer location from fairytale-pets-puzzles.js, stage 96.
const otter = {
  id: 96,
  title: '수달의 작은 수상시장',
  hitMode: 'target-bounds',
  spots: [{
    x: 45.5, y: 52, rx: 2.2, ry: 2.25, text: '앞치마 오른쪽 어깨의 단추가 없어졌어요.',
    targetBounds: { left: 43.7, top: 50.2, right: 47.3, bottom: 53.9 },
  }],
};

test('otter market missing apron button works in a panned zoom picture', () => {
  assert.equal(otter.title, '수달의 작은 수상시장');
  const spotIndex = otter.spots.findIndex(s => s.text.includes('오른쪽 어깨의 단추'));
  assert.equal(spotIndex, 0);

  // A and B are panned independently but have identical image coordinates.
  for (const rect of [
    { left: -245, top: -160, width: 850, height: 850 },
    { left: -210, top: 570, width: 850, height: 850 },
  ]) {
    const tap = core.normalizedPoint(rect, rect.left + 0.455 * rect.width, rect.top + 0.52 * rect.height);
    assert.equal(core.hitTest(otter, tap.x, tap.y, [], { x: 1000 / rect.width, y: 1000 / rect.height }).index, spotIndex);
  }

  assert.equal(core.hitTest(otter, 42.6, 52, [], { x: 1000 / 850, y: 1000 / 850 }).index, spotIndex);
  assert.equal(core.hitTest(otter, 45.5, 52, [spotIndex]).alreadyFound, true);
});

test('otter scarf missing white dot has a finger-sized target without selecting the knot', () => {
  const scarf = {
    id: 96,
    hitMode: 'target-bounds',
    spots: [{
      x: 38.5, y: 49.1, rx: 1.5, ry: 1.55,
      text: '빨간 목도리 왼쪽 끝의 작은 흰 점이 없어졌어요.',
      targetBounds: { left: 37.4, top: 48, right: 39.5, bottom: 50.3 },
      hitRegions: [{ x: 37.7, y: 50.2, rx: 2.8, ry: 2.5 }],
    }],
  };
  const zoomRect = { left: -190, top: -200, width: 850, height: 850 };
  const tap = core.normalizedPoint(zoomRect, zoomRect.left + 0.358 * zoomRect.width, zoomRect.top + 0.491 * zoomRect.height);
  const padding = { x: 1000 / zoomRect.width, y: 1000 / zoomRect.height };
  assert.equal(core.hitTest(scarf, tap.x, tap.y, [], padding)?.index, 0);
  assert.equal(core.hitTest(scarf, 42, 45, [], padding), null);
});

test('authored otter scene keeps the scarf target in the corrected position', t => {
  const sourcePath = path.join(__dirname, '../games/spot-difference/fairytale-pets-puzzles.js');
  if (!fs.existsSync(sourcePath)) return t.skip('Full puzzle dataset is not in the isolated local fixture');
  const context = { window: { JJUDA_PUZZLES: [] } };
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), context);
  const puzzle = context.window.JJUDA_PUZZLES.find(p => p.id === 96);
  assert.ok(puzzle);
  assert.equal(puzzle.spots[7].targetBounds.left, 37.4);
  assert.equal(puzzle.spots[7].targetBounds.bottom, 50.3);
  assert.equal(puzzle.spots[7].hitRegions[0].x, 37.7);
  assert.equal(core.hitTest(puzzle, 35.8, 49.1, [], { x: 1000 / 850, y: 1000 / 850 })?.index, 7);
});
