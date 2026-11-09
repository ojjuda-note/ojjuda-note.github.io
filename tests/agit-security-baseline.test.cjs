const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const pages = [
  'index.html', 'world.html', 'note/index.html',
  'admin/index.html', 'admin/meeting/index.html', 'admin/rewards.html'
];
const policy = '<meta http-equiv="Content-Security-Policy" content="object-src \'none\'; base-uri \'self\'">';

test('public and admin entrances reject object embeds and foreign base URLs', () => {
  for (const page of pages) {
    const head = read(page).split('</head>')[0];
    const at = head.indexOf(policy);
    assert.ok(at >= 0, `${page} should declare the anti-embed/base-hijack policy`);
    const script = head.indexOf('<script');
    assert.ok(script < 0 || at < script, `${page} should enforce the policy before scripts load`);
    assert.equal(head.indexOf(policy, at + policy.length), -1, `${page} should declare one policy`);
  }
});

test('admin and public entrances pin Supabase browser libraries to fixed versions', () => {
  for (const page of pages) {
    const html = read(page);
    for (const [, version] of html.matchAll(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@([^"'<>\s]+)/g)) {
      assert.match(version, /^2\.\d+\.\d+$/, `${page} must not float to an unreviewed SDK version`);
    }
  }
});

test('browser configuration contains only the publishable Supabase key', () => {
  const config = read('config.js');
  assert.match(config, /supabaseKey:\s*["']sb_publishable_/);
  assert.doesNotMatch(config, /sb_secret_|service_role(?:_key)?\s*:/i);
});

test('privileged recovery and admin-ban requests remain checked server-side', () => {
  const recovery = read('supabase/functions/member-recovery/handler.mjs');
  const ban = read('supabase/functions/admin-ban/handler.mjs');
  assert.match(recovery, /origin && !ORIGINS\.has\(origin\)/);
  assert.match(recovery, /!browserKeys\.includes\(request\.headers\.get\('apikey'\)\)/);
  assert.match(recovery, /recovery_rate_limited/);
  assert.match(ban, /auth\/v1\/user/);
  assert.match(ban, /!await isAdmin\(actor\.id\)/);
  assert.match(ban, /await isAdmin\(target\)/);
});

test('the visible Agit version matches the released version manifest', () => {
  const release = JSON.parse(read('version.json'));
  assert.ok(read('world.html').includes(`var Go="${release.version}";`));
});
