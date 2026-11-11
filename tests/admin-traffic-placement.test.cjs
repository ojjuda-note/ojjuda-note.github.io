const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname,'..');
const world = fs.readFileSync(path.join(root,'world.html'),'utf8');
const visitors = fs.readFileSync(path.join(root,'admin/visitors.js'),'utf8');

assert.equal((world.match(/id="world-admin-visitors"/g)||[]).length,1,
  'visitor analytics is mounted in one admin screen only');
assert.match(world,/L\.area==="account"&&L\.tab==="visitors"\?"visitors"/,
  'only the dedicated visitor tab loads the analytics module');
assert.doesNotMatch(world,/compact:L\.tab==="overview"/,
  'the admin overview no longer requests a duplicate compact report');
assert.doesNotMatch(visitors,/compact\s*=\s*false|if\s*\(compact\)/,
  'obsolete duplicate report code is removed');
assert.match(world,/if\(adminDataTab\(\)==="overview"\)/,
  'the account summary and recent administrator history remain available');
console.log('PASS: administrator overview keeps account widgets without duplicate visitor cards or RPC');
