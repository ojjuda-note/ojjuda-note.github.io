const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../features/fanpages');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const data = ['photo-manifest.js', 'artists.js', 'artists-extra.js', 'profiles.js', 'profiles-extra.js', 'videos.js', 'popularity.js'].map(read).join('\n');
const behavior = read('fan.js');
const basicArtists = [
  'kiiikiii', 'kissoflife', 'blackpink', 'stayc', 'idle', 'bts',
  'seventeen', 'straykids', 'txt', 'enhypen', 'riize', 'boynextdoor',
  'tws', 'nctdream', 'ateez', 'treasure', 'nctwish', 'andteam'
];

function artistPage(id) {
  const dom = new JSDOM(read('artist.html'), {
    url: `https://ojjuda.test/features/fanpages/artist.html?group=${id}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  dom.window.matchMedia = () => ({ matches: true });
  // Only local shipped data and rendering run; destination availability is checked separately.
  dom.window.eval(`${data}\n${behavior}`);
  return dom;
}

function destination(href) {
  const url = new URL(href);
  // A decorative fragment or trailing slash must not disguise the same landing page.
  url.hash = '';
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}${url.search}`;
}

for (const id of basicArtists) {
  test(`${id}: album, goods, schedule and news buttons have distinct useful destinations`, () => {
    const dom = artistPage(id);
    try {
      const { document, OJJUDA_FAN_ARTISTS: artists } = dom.window;
      const artist = artists.find(item => item.id === id);
      assert.ok(artist, 'the supported artist must remain available');
      assert.equal(document.querySelector('h1').textContent, artist.name);
      const official = destination(artist.official);
      const sections = {
        music: '#music a.album-card-title',
        goods: '#goods a.resource-item',
        schedule: '#schedule a.resource-item',
        news: '#news a.detail-news-row'
      };
      const destinations = {};
      for (const [section, selector] of Object.entries(sections)) {
        const links = [...document.querySelectorAll(selector)];
        assert.ok(links.length, `${section} needs an actionable resource`);
        destinations[section] = new Set();
        for (const link of links) {
          const href = link.getAttribute('href');
          assert.equal(new URL(href).protocol, 'https:', `${section} must use a complete HTTPS destination`);
          const target = destination(href);
          assert.notEqual(target, official, `${section} must not fall back to the artist/company landing page`);
          assert.equal(link.target, '_blank', `${section} should keep the fanpage available`);
          assert.ok(link.relList.contains('noopener'), `${section} should safely open its new tab`);
          if (new URL(href).hostname === 'weverse.io') {
            assert.match(link.textContent, /로그인/, `${section} must disclose the community notice login requirement`);
          }
          const label = link.querySelector('strong')?.textContent.trim() || link.textContent.trim();
          assert.ok(label, `${section} needs a readable label`);
          for (const generic of ['공식 앨범·굿즈 안내', '공식 활동·일정 확인', `${artist.name} 최신 안내`]) {
            assert.ok(!label.includes(generic), `${section} still advertises an unspecified placeholder: ${generic}`);
          }
          destinations[section].add(target);
        }
      }
      for (const album of destinations.music) {
        assert.ok(!destinations.goods.has(album), 'album details and merchandise must not point to the same fallback');
      }
      const all = new Set(Object.values(destinations).flatMap(values => [...values]));
      assert.ok(all.size >= 3, 'music, goods and activity information need at least three useful destinations');
    } finally {
      dom.window.close();
    }
  });
}
