'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('retired vacancy alerts are not offered in the Arcade or guide', () => {
  const world = read('world.html');
  assert.doesNotMatch(world, /byeolcheonji|별천지 빈방/);
  assert.doesNotMatch(read('guide.html'), /별천지 빈방/);

  const appVersion = world.match(/var Go="([^"]+)"/)?.[1];
  assert.equal(appVersion, JSON.parse(read('version.json')).version);
});

test('old vacancy links show an end-of-service notice without subscribing', () => {
  for (const page of ['star/index.html', 'byeolcheonji/index.html']) {
    const html = read(page);
    assert.match(html, /운영을 종료했어요/);
    assert.match(html, /기존 알림 발송이 중단/);
    assert.match(html, /href="\/world\.html\?tab=arcade"/);
    assert.doesNotMatch(html, /\/byeolcheonji\/app\.js|location\.replace|<script/);
  }
});
