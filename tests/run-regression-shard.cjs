'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function parseShard(args) {
  if (args.length !== 2 || args.some(value => !/^[1-9]\d*$/.test(value))) {
    throw new Error('Usage: node tests/run-regression-shard.cjs <shard> <shard-count> (positive integers)');
  }
  const [shard, count] = args.map(Number);
  if (!Number.isSafeInteger(shard) || !Number.isSafeInteger(count) || shard > count) {
    throw new Error('Shard must be between 1 and shard-count; both must be safe integers');
  }
  return { shard, count };
}

function suiteFiles(scripts) {
  const files = [];
  // Keep package.json as the single inventory. Fail loudly if its command syntax changes.
  for (const name of ['test:ui', 'test:screw']) {
    if (typeof scripts?.[name] !== 'string' || !scripts[name].trim()) {
      throw new Error(`Missing or empty ${name} script`);
    }
    for (const command of scripts[name].split('&&')) {
      const match = /^node ([A-Za-z0-9_-]+\.test\.[cm]js)$/.exec(command.trim());
      if (!match) throw new Error(`Unsupported command in ${name}: ${command.trim()}`);
      if (files.includes(match[1])) throw new Error(`Duplicate suite: ${match[1]}`);
      files.push(match[1]);
    }
  }
  return files;
}

function shardFiles(files, shard, count) {
  return files.filter((_, index) => index % count === shard - 1);
}

function runFiles(files, { cwd = __dirname, spawn = spawnSync, log = console.log } = {}) {
  const failed = [];
  for (const [index, file] of files.entries()) {
    log(`\n[${index + 1}/${files.length}] ${file}`);
    const started = Date.now();
    let result;
    try {
      result = spawn(process.execPath, [file], { cwd, stdio: 'inherit' });
    } catch (error) {
      result = { error };
    }
    if (result.error || result.signal || result.status !== 0) {
      const reason = result.error?.message || (result.signal ? `signal ${result.signal}` : `exit ${result.status}`);
      failed.push(`${file} (${reason})`);
      log(`FAIL ${file}: ${reason}`);
    } else {
      log(`PASS ${file} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    }
  }
  log(`\nShard summary: ${files.length - failed.length} passed, ${failed.length} failed, ${files.length} total`);
  for (const failure of failed) log(`  FAIL ${failure}`);
  return failed.length ? 1 : 0;
}

if (require.main === module) {
  try {
    const { shard, count } = parseShard(process.argv.slice(2));
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    const files = shardFiles(suiteFiles(manifest.scripts), shard, count);
    console.log(`UI and screw regression shard ${shard}/${count}: ${files.length} suites`);
    process.exitCode = runFiles(files);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { parseShard, suiteFiles, shardFiles, runFiles };
