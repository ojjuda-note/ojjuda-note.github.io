const assert = require('node:assert/strict');

// Use the same installed release values and screen selection as the World shell.
module.exports = function sectionRuntime(html) {
  const tab = html.match(/^function worldMainTab\(\)[^\n]+/m);
  const start = html.indexOf('const sectionReleases=');
  const end = html.indexOf('var ce=', start);
  assert.ok(tab && start >= 0 && end > start, 'World section runtime is present');
  return tab[0] + '\n' + html.slice(start, end);
};
