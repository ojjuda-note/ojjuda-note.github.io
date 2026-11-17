const assert = require('node:assert/strict');

// Isolated World renderers and feedback senders use the shell's release helpers.
module.exports = function sectionSource(world) {
  function between(start, end) {
    const first = world.indexOf(start);
    const last = world.indexOf(end, first);
    assert.ok(first >= 0 && last > first, 'World release fixture is missing ' + start);
    return world.slice(first, last);
  }
  return between('function worldMainTab()', '// The Agit hub')
    + between('const sectionReleases=', 'var ce=');
};
