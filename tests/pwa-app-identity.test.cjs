const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'shared/pwa/app-identity.js'), 'utf8');
const revision = source.match(/const iconRevision = '([^']+)'/)[1];
const manifestRevision = '20261119-illustrated-icons-1';
const services = {
  agit: {name: '오쭈다 아지트', manifest: '/manifest.webmanifest', icon: '/icon-192.png', id: '/world.html', start: '/world.html'},
  park: {name: '오쭈다 공원', manifest: '/park/manifest.webmanifest', icon: '/park/assets/icon-192.png', id: '/world.html?place=park', start: '/park/'},
  pajang: {name: '오쭈다 파장', manifest: '/features/pajang/manifest.webmanifest', icon: '/features/pajang/assets/icon-192.png', id: '/features/pajang/', start: '/features/pajang/'}
};

test('entry routes select the right app without accepting arbitrary icon or install URLs', (t) => {
  for (const [entry, key] of [
    ['/world.html', 'agit'], ['/world.html?tab=hub', 'agit'],
    ['/world.html?tab=arcade', 'agit'], ['/world.html?place=park', 'park'],
    ['/world.html?tab=park', 'park'], ['/world.html?tab=park&game=chess', 'agit'],
    ['/world.html?place=park&game=chess&game=mines', 'park'],
    ['/park/', 'park'], ['/park/index.html', 'park'],
    ['/features/pajang/', 'pajang'], ['/features/pajang/station.html', 'pajang'],
    ['/?auth=login&next=https://other.example/&icon=https://other.example/icon.png', 'agit']
  ]) {
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      url: 'https://ojjuda.kr' + entry, runScripts: 'outside-only'
    });
    t.after(() => dom.window.close());
    dom.window.eval(source);
    const {document, OjjudaAppIdentity: app} = dom.window;
    const expected = services[key];
    assert.equal(document.documentElement.dataset.pwaApp, key);
    assert.equal(app.name, expected.name);
    assert.equal(app.path, expected.start);
    assert.equal(document.querySelector('link[rel="manifest"]').getAttribute('href'), expected.manifest + '?v=' + manifestRevision);
    assert.equal(document.querySelector('link[rel="icon"]').getAttribute('href'), expected.icon + '?v=' + revision);
    assert.equal(document.querySelector('link[rel="icon"]').type, 'image/png');
    assert.equal(document.querySelector('meta[name="apple-mobile-web-app-title"]').content, expected.name);
    assert.equal(Object.isFrozen(app), true);
  }
});

test('an installed app keeps its original identity during in-app navigation and repeated script loads', () => {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'https://ojjuda.kr/world.html?place=park', runScripts: 'outside-only'
  });
  try {
    dom.window.eval(source);
    const app = dom.window.OjjudaAppIdentity;
    dom.window.history.replaceState({}, '', '/world.html?tab=hub');
    dom.window.eval(source);
    assert.equal(dom.window.OjjudaAppIdentity, app);
    assert.equal(dom.window.document.querySelector('link[rel="manifest"]').getAttribute('href'), '/park/manifest.webmanifest?v=' + manifestRevision);
    assert.equal(dom.window.document.querySelectorAll('link[rel="manifest"]').length, 1);
  } finally { dom.window.close(); }
});

test('real entry documents load identity before deferred installation and have one icon set', (t) => {
  for (const [file, entry, key] of [
    ['index.html', '/?auth=login', 'agit'],
    ['world.html', '/world.html?place=park', 'park'],
    ['features/pajang/index.html', '/features/pajang/', 'pajang'],
    ['features/pajang/station.html', '/features/pajang/station.html', 'pajang']
  ]) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1].replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    const dom = new JSDOM('<!doctype html><html><head>' + head + '</head><body></body></html>', {
      url: 'https://ojjuda.kr' + entry, runScripts: 'outside-only'
    });
    t.after(() => dom.window.close());
    const document = dom.window.document;
    const identity = document.querySelector('script[src^="/shared/pwa/app-identity.js"]');
    assert.ok(identity, file);
    assert.equal(identity.defer, false, file);
    assert.equal(identity.hasAttribute('async'), false, file);
    assert.equal(document.querySelector('script[src^="/shared/pwa/pwa-install.js"]').defer, true, file);
    dom.window.eval(source);
    for (const rel of ['icon', 'apple-touch-icon', 'manifest']) {
      assert.equal(document.querySelectorAll('link[rel="' + rel + '"]').length, 1, file + ': ' + rel);
    }
    assert.equal(document.querySelectorAll('meta[name="apple-mobile-web-app-title"]').length, 1, file);
    assert.equal(document.querySelector('meta[name="apple-mobile-web-app-title"]').content, services[key].name);
  }
});

test('manifests preserve Agit identity and give Park and Pajang separate install targets and icons', () => {
  const ids = new Set();
  for (const [key, expected] of Object.entries(services)) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, expected.manifest), 'utf8'));
    const base = new URL(expected.manifest, 'https://ojjuda.kr');
    const identity = new URL(manifest.id, base);
    const start = new URL(manifest.start_url, base);
    const scope = new URL(manifest.scope, base);
    assert.equal(identity.pathname + identity.search, expected.id);
    assert.equal(start.pathname + start.search, expected.start);
    assert.equal(start.origin, scope.origin);
    assert.ok(start.pathname.startsWith(scope.pathname));
    assert.equal(manifest.name, expected.name);
    assert.equal(manifest.short_name, expected.name);
    ids.add(identity.href);
    assert.equal(manifest.icons.length, 3);
    for (const size of ['192x192', '512x512']) {
      const icon = manifest.icons.find((item) => item.sizes === size && item.purpose !== 'maskable');
      assert.ok(icon, key + ': regular ' + size);
      assert.equal(icon.type, 'image/png');
      const url = new URL(icon.src, base);
      assert.equal(url.origin, 'https://ojjuda.kr');
      assert.equal(url.searchParams.get('v'), revision);
      if (size === '192x192') assert.equal(url.pathname, expected.icon);
    }
    const maskable = manifest.icons.find((item) => item.purpose === 'maskable');
    assert.equal(maskable.sizes, '512x512');
    assert.equal(new URL(maskable.src, base).searchParams.get('v'), revision);
  }
  assert.equal(ids.size, 3);
  const agit = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(agit.id, '/world.html');
  assert.equal(agit.start_url, './world.html');
});

test('installed Agit, Park and Pajang authenticate before displaying their entrances', () => {
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  const world = read('world.html');
  // Lightweight PWA checkouts can omit the large Park renderer; the full
  // browser/unit suite verifies its callback while this suite checks entry assets.
  const parkPath = path.join(root, 'note/preview.js');
  const park = fs.existsSync(parkPath) ? read('note/preview.js') : null;
  const pajangPath = path.join(root, 'features/pajang/entry.mjs');
  const cssPath = path.join(root, 'features/pajang/entry-design.css');
  const pajang = fs.existsSync(pajangPath) ? read('features/pajang/entry.mjs') : null;
  const css = fs.existsSync(cssPath) ? read('features/pajang/entry-design.css') : null;
  const pajangEntry = read('features/pajang/index.html');
  const pajangMain = read('features/pajang/station.html');
  assert.ok(world.includes('if(event==="INITIAL_SESSION"&&!session?.user)return;'),
    'World waits for the stored session instead of painting the guest entrance');
  if (park !== null) assert.match(park, /if\s*\(\s*event\s*===\s*'INITIAL_SESSION'\s*&&\s*!current\?\.user\s*\)\s*return;/,
    'Park waits for the stored session in its own iframe');
  if (pajang !== null) assert.ok(pajang.includes("$('welcome').dataset.memberEntry = 'direct'"),
    'Pajang only switches to a direct answer after member authorization');
  if (css !== null) {
    assert.match(css, /@media \(display-mode: standalone\), \(display-mode: minimal-ui\)/,
      'the quick entry applies to installed app display modes');
    assert.ok(css.includes('#gate .flight-scene { display:none!important; }'),
      'the logged-in app cannot flash a public airplane scene while loading');
    assert.ok(css.includes('#welcome[data-member-entry="direct"] .sample-radar'),
      'the installed member answer keeps public invitation examples out of the way');
  }
  for (const html of [pajangEntry, pajangMain]) {
    assert.match(html, /entry-design\.css\?v=20261122-app-skip-entry1/);
  }
  assert.match(pajangEntry, /entry\.mjs\?v=20261125-adult-entry1/);
  assert.match(read('park/index.html'), /note\/preview\.js\?v=\d{8}-[a-z0-9-]+/, 'Park loads a versioned composer');
  assert.match(world, /agit-welcome\.js\?v=20261122-member-app-start1/);
});
