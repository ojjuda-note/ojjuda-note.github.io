const test = require('node:test');
const assert = require('node:assert/strict');
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
