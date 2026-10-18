'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { parseShard, suiteFiles, shardFiles, runFiles } = require('./run-regression-shard.cjs');

test('four shards cover every current UI and screw command exactly once', () => {
  const { scripts } = require('./package.json');
  const expected = ['test:ui', 'test:screw'].flatMap(name =>
    scripts[name].split('&&').map(command => command.trim().replace(/^node /, '')));
  const files = suiteFiles(scripts);
  assert.deepEqual(files, expected);
  const shards = Array.from({ length: 4 }, (_, index) => shardFiles(files, index + 1, 4));
  const actual = shards.flat();
  assert.equal(actual.length, expected.length);
  assert.equal(new Set(actual).size, expected.length);
  assert.deepEqual([...actual].sort(), [...expected].sort());
  assert.ok(Math.max(...shards.map(shard => shard.length)) - Math.min(...shards.map(shard => shard.length)) <= 1);
  shards.forEach((shard, index) => assert.deepEqual(shard, expected.filter((_, i) => i % 4 === index)));
});

test('inventory changes are picked up without a second list', () => {
  const scripts = { 'test:ui': 'node first.test.cjs && node second.test.mjs', 'test:screw': 'node third.test.cjs' };
  assert.deepEqual(suiteFiles(scripts), ['first.test.cjs', 'second.test.mjs', 'third.test.cjs']);
  scripts['test:ui'] += ' && node added.test.cjs';
  assert.ok(suiteFiles(scripts).includes('added.test.cjs'));
});

test('unsupported, missing and duplicate inventory entries fail rather than silently disappear', () => {
  const valid = { 'test:ui': 'node first.test.cjs', 'test:screw': 'node second.test.cjs' };
  for (const command of ['', 'npm run other', 'node first.test.cjs; exit 0', 'node ../first.test.cjs']) {
    assert.throws(() => suiteFiles({ ...valid, 'test:ui': command }));
  }
  assert.throws(() => suiteFiles({ 'test:ui': valid['test:ui'] }), /Missing/);
  assert.throws(() => suiteFiles({ ...valid, 'test:screw': valid['test:ui'] }), /Duplicate/);
});

test('shard arguments reject invalid or ambiguous input', () => {
  assert.deepEqual(parseShard(['1', '4']), { shard: 1, count: 4 });
  assert.deepEqual(parseShard(['4', '4']), { shard: 4, count: 4 });
  for (const args of [[], ['1'], ['1', '4', 'extra'], ['0', '4'], ['5', '4'], ['1', '0'], ['-1', '4'], ['1.5', '4'], ['1e0', '4'], ['01', '4'], ['NaN', '4'], ['1', 'Infinity'], ['1', '9007199254740992']]) {
    assert.throws(() => parseShard(args), undefined, JSON.stringify(args));
  }
});

test('runner continues after exit, signal and spawn failures and reports every failed suite', () => {
  const files = ['exit.test.cjs', 'signal.test.cjs', 'error.test.cjs', 'throw.test.cjs', 'pass.test.cjs'];
  const results = [{ status: 7 }, { status: null, signal: 'SIGTERM' }, { error: new Error('spawn failed') }, new Error('spawn threw'), { status: 0 }];
  const calls = [];
  const output = [];
  const status = runFiles(files, {
    cwd: '/fixture', log: line => output.push(line),
    spawn: (command, args, options) => {
      assert.equal(command, process.execPath);
      assert.deepEqual(options, { cwd: '/fixture', stdio: 'inherit' });
      calls.push(args[0]);
      const result = results.shift();
      if (result instanceof Error) throw result;
      return result;
    }
  });
  assert.equal(status, 1);
  assert.deepEqual(calls, files);
  assert.match(output.join('\n'), /1 passed, 4 failed, 5 total/);
  for (const file of files.slice(0, -1)) assert.ok(output.some(line => line.startsWith(`  FAIL ${file}`)));
  assert.equal(runFiles(['pass.test.cjs'], { spawn: () => ({ status: 0 }), log: () => {} }), 0);
});

test('CLI propagates failures, runs later suites, and rejects bad arguments before launching suites', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'regression-shard-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const runner = path.join(dir, 'run-regression-shard.cjs');
  fs.copyFileSync(path.join(__dirname, 'run-regression-shard.cjs'), runner);
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: {
    'test:ui': 'node fail.test.cjs', 'test:screw': 'node later.test.cjs'
  } }));
  fs.writeFileSync(path.join(dir, 'fail.test.cjs'), 'process.exit(7);');
  fs.writeFileSync(path.join(dir, 'later.test.cjs'), "require('node:fs').writeFileSync('later-ran', 'yes');");
  const invalid = spawnSync(process.execPath, [runner, '0', '4'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Usage:/);
  assert.equal(fs.existsSync(path.join(dir, 'later-ran')), false);
  const failed = spawnSync(process.execPath, [runner, '1', '1'], { encoding: 'utf8' });
  assert.equal(failed.status, 1);
  assert.match(failed.stdout, /FAIL fail\.test\.cjs: exit 7/);
  assert.match(failed.stdout, /1 passed, 1 failed, 2 total/);
  assert.equal(fs.readFileSync(path.join(dir, 'later-ran'), 'utf8'), 'yes');
  fs.writeFileSync(path.join(dir, 'fail.test.cjs'), 'process.exit(0);');
  const passed = spawnSync(process.execPath, [runner, '1', '1'], { encoding: 'utf8' });
  assert.equal(passed.status, 0);
  assert.match(passed.stdout, /2 passed, 0 failed, 2 total/);
});
