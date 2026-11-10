const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '../features/fanpages');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('fan hub changes from split hero to stacked layout on tablets', () => {
  const css = read('fan.css');
  assert.match(css, /@media\(min-width:641px\) and \(max-width:820px\)/);
  assert.match(css, /\.hub-hero\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /@media\(max-width:540px\)\{[\s\S]*?\.artist-grid\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.tile-bottom strong\{white-space:normal;overflow-wrap:anywhere/);
});

test('artist layout shows visible shortcuts and readable media on phones', () => {
  const stage = read('fan-stage.css');
  const profile = read('fan-profile.css');
  const gallery = read('fan-gallery.css');
  const videos = read('fan-videos.css');
  assert.match(stage, /@media \(min-width: 641px\) and \(max-width: 820px\)/);
  assert.match(profile, /detail-shortcuts\.has-campaigns \{ display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(gallery, /@media \(max-width: 430px\) \{[\s\S]*?\.detail-photo-grid \{ grid-template-columns: minmax\(0,1fr\)/);
  assert.match(videos, /@media\(max-width:430px\)\{\.video-grid\{grid-template-columns:minmax\(0,1fr\)/);
});

test('both fan page entry points request the updated CSS', () => {
  const index = read('index.html'), artist = read('artist.html');
  for (const name of ['fan.css', 'fan-stage.css']) {
    assert.ok(index.includes(`${name}?v=20261110-responsive1`));
    assert.ok(artist.includes(`${name}?v=20261110-responsive1`));
  }
  for (const name of ['fan-gallery.css', 'fan-videos.css', 'fan-profile.css']) {
    assert.ok(artist.includes(`${name}?v=20261110-responsive1`));
  }
});
