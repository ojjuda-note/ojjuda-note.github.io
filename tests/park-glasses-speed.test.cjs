const {test} = require('node:test');
const assert = require('node:assert/strict');
const factory = import('../note/rokid-agent/lib/speed.js');

async function track() {
  const meter = (await factory).createSpeedMeter();
  return {
    move(seconds, meters, speed = null, accuracy = 4) {
      const timestamp = 100000 + seconds * 1000;
      meter.update({latitude:37 + meters / 111195,longitude:127,accuracy,speed,timestamp},timestamp);
      return meter.read(timestamp);
    },
    read: seconds => meter.read(100000 + seconds * 1000)
  };
}

test('native speed follows a start and stop, ignores a spike and expires',async () => {
  const t = await track();
  assert.equal(t.move(0,0,0.1),0);
  assert.ok(t.move(2,4,2) > 5);
  const moving = t.move(4,8,2);
  assert.equal(t.move(6,12,60),moving);
  assert.equal(t.move(8,12,0),0);
  assert.equal(t.read(16),null);
});

test('walking without device speed, stopping, and standing GPS jitter',async () => {
  const t = await track();
  assert.equal(t.move(0,0),null);
  assert.equal(t.move(2,3),null);
  assert.ok(Math.abs(t.move(4,6) - 5.4) < 0.1);
  t.move(6,9); t.move(8,9);
  assert.equal(t.move(10,9),0);
  const still = await track();
  still.move(0,0); still.move(2,1); still.move(4,-1);
  assert.equal(still.move(6,1),0);
});

test('poor accuracy, jumps, duplicate timestamps and a signal gap',async () => {
  const t = await track();
  assert.equal(t.move(0,0,3),10.8);
  assert.equal(t.move(0,0,12),10.8);
  assert.equal(t.move(2,4,6,150),null);
  assert.equal(t.move(4,8),null);
  assert.equal(t.move(6,850),null);
  assert.equal(t.move(8,9),null);
  assert.equal(t.move(20,40),null);
});
