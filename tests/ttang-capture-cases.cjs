const assert = require('node:assert/strict');
const {test} = require('node:test');

module.exports = function captureCases(World, game) {
  function fixture({oldLand = false, shield = 0, mode = 'solo', noInherit = false} = {}) {
    const world = new World(32, mode, 40);
    world.itemsOn = false;
    world.noInherit = noInherit;
    world.time = 10;
    world.netDirty = new Set();
    const player = world.addPlayer({noSpawn:true, alive:true, x:3, y:3, born:-1});
    const enemy = world.addPlayer({noSpawn:true, alive:true, x:oldLand ? 5 : 12, y:oldLand ? 5 : 12, born:-1, shieldT:shield});
    const outside = world.addPlayer({noSpawn:true, alive:true, x:25, y:25, born:-1});
    for (let y = 20; y < 80; y++) for (let x = 20; x < 60; x++) world.setOwn(y * world.GW + x, player.id);
    // The enclosed enemy still has land outside the loop. An outside enemy
    // standing there must not be caught by a later inheritance side effect.
    world.setOwn(world.si(25,25), enemy.id);
    world.setOwn(world.si(29,29), outside.id);
    const trailCell = world.si(13,14);
    world.trail[trailCell] = enemy.id;
    enemy.trail = [trailCell];
    enemy.pts = [{x:13,y:14,t:1},{x:14,y:14,t:1}];
    enemy.tc.set(14 * world.U + 13, 1);
    function walk(x, y) {
      const dx = x - player.x, dy = y - player.y, n = Math.ceil(Math.hypot(dx,dy) / .05);
      for (let i = 0; i < n; i++) {
        const px = player.x, py = player.y;
        player.x += dx/n; player.y += dy/n;
        world.visit(player, px, py);
      }
    }
    function close() {
      for (const [x,y] of [[18,3],[18,18],[3,18]]) walk(x,y);
      assert.equal(enemy.alive, true, 'an open trail does not capture the enemy');
      walk(3,7);
      assert.equal(player.alive, true);
      assert.ok(world.events.some(e => e.t === 'capture' && e.p === player));
    }
    return {world, player, enemy, outside, trailCell, close};
  }

  test(`${game}: closing a real loop kills enclosed enemies with land elsewhere`, () => {
    const f = fixture(); f.close();
    assert.equal(f.enemy.alive, false);
    assert.equal(f.outside.alive, true, 'outside enemies survive, including on inherited land');
    assert.equal(f.player.kills, 1);
    assert.equal(f.world.own[f.world.si(25,25)], f.player.id, 'normal territory inheritance is preserved');
    assert.equal(f.world.trail[f.trailCell], 0);
    assert.equal(f.enemy.trail.length, 0);
    assert.equal(f.enemy.pts.length, 0);
    assert.equal(f.enemy.tc.size, 0);
    const deaths = f.world.events.filter(e => e.t === 'death');
    assert.equal(deaths.length, 1);
    assert.equal(deaths[0].why, 'capture');
    assert.equal(deaths[0].by, f.player.id);
    assert.ok(f.world.netDirty.has(f.world.si(12,12)), 'captured cells are sent to multiplayer guests');
  });

  test(`${game}: an invader already inside owned land is caught on reconnection`, () => {
    const f = fixture({oldLand:true}); f.close();
    assert.equal(f.enemy.alive, false);
    assert.equal(f.outside.alive, true);
    assert.equal(f.world.events.find(e => e.t === 'death').why, 'capture');
  });

  test(`${game}: capture preserves shield protection and has no duplicate deaths`, () => {
    const f = fixture({shield:3});
    f.outside.x = f.outside.y = 29;
    f.close();
    assert.equal(f.enemy.alive, true);
    assert.equal(f.player.kills, 0);
    f.enemy.shieldT = 0;
    f.world.capture(f.player);
    f.world.capture(f.player);
    assert.equal(f.enemy.alive, false);
    assert.equal(f.player.kills, 1);
    assert.equal(f.world.events.filter(e => e.t === 'death').length, 1);
  });

  test(`${game}: captured multiplayer opponents use the normal respawn path`, () => {
    const f = fixture({mode:'duo'}); f.close();
    assert.equal(f.enemy.alive, false);
    assert.equal(f.enemy.respawnAt, f.world.time + 2);
  });

  if (game === 'photo-ttang') test('photo-ttang: capture preserves the stage rule that clears defeated enemy land', () => {
    const f = fixture({noInherit:true}); f.close();
    assert.equal(f.enemy.alive, false);
    assert.equal(f.world.own[f.world.si(25,25)], 0);
    assert.equal(f.world.counts[f.enemy.id], 0);
  });
};
