const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '../features/fanpages');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const data = ['photo-manifest.js', 'artists.js', 'artists-extra.js', 'profiles.js', 'profiles-extra.js', 'videos.js', 'popularity.js'].map(read).join('\n');
const behavior = read('fan.js');
const sourceContext = { window: {} };
vm.runInNewContext(data, sourceContext);
const artists = sourceContext.window.OJJUDA_FAN_ARTISTS;
const videoLibrary = sourceContext.window.OJJUDA_FAN_VIDEOS;

function artistPage(id) {
  const dom = new JSDOM(read('artist.html'), {
    url: `https://ojjuda.test/features/fanpages/artist.html?group=${id}`,
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const { window } = dom;
  // No resource loader is enabled: test data and interactions never contact third parties.
  window.matchMedia = () => ({ matches: true });
  // JSDOM omits the native dialog methods. Mock only the browser's open/close lifecycle;
  // the real fanpage click handlers, media selection and focus restoration still run.
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  for (const name of ['fan-gallery.css', 'fan-profile.css', 'fan-videos.css']) {
    const style = window.document.createElement('style');
    style.textContent = read(name);
    window.document.head.append(style);
  }
  window.eval(`${data}\n${behavior}`);
  return dom;
}

test('all artist galleries reveal genuinely hidden photos and collapse them again', async t => {
  assert.ok(artists.length > 0, 'the gallery audit needs the full artist catalog');
  for (const artist of artists) {
    await t.test(artist.id, () => {
      const dom = artistPage(artist.id);
      try {
        const { window } = dom;
        const { document } = window;
        assert.equal(document.querySelector('h1').textContent, artist.name);
        const photos = [...document.querySelectorAll('#artist-photo-grid > .detail-photo')];
        const visibleCount = () => photos.filter(photo => window.getComputedStyle(photo).display !== 'none').length;
        assert.equal(photos.length, artist.photos.length);
        const reveal = document.querySelector('[data-reveal-target="artist-photo-grid"]');
        if (artist.photos.length <= 3) {
          assert.equal(reveal, null);
          assert.equal(visibleCount(), artist.photos.length);
          return;
        }
        assert.ok(reveal, 'extra photos need a visible way to open them');
        assert.equal(visibleCount(), 3, 'the collapsed gallery must contain hidden photos');
        reveal.click();
        assert.equal(reveal.getAttribute('aria-expanded'), 'true');
        assert.equal(visibleCount(), artist.photos.length);
        reveal.click();
        assert.equal(reveal.getAttribute('aria-expanded'), 'false');
        assert.equal(visibleCount(), 3);
      } finally {
        dom.window.close();
      }
    });
  }
});

test('every photo and video button opens its own media and closes cleanly', async t => {
  let checkedPhotos = 0, checkedVideos = 0;
  for (const artist of artists) {
    await t.test(artist.id, () => {
      const dom = artistPage(artist.id);
      try {
        const { window } = dom;
        const { document } = window;
        document.querySelector('[data-reveal-target="artist-photo-grid"]')?.click();
        document.querySelector('[data-reveal-target="artist-video-grid"]')?.click();

        const photoButtons = [...document.querySelectorAll('[data-photo-index]')];
        assert.equal(photoButtons.length, artist.photos.length);
        const photoDialog = document.getElementById('photo-viewer');
        const photoImage = document.getElementById('photo-viewer-image');
        const photoTitle = document.getElementById('photo-viewer-title');
        const photoSource = document.getElementById('photo-viewer-source');
        const next = photoDialog.querySelector('.photo-viewer-next');
        const previous = photoDialog.querySelector('.photo-viewer-prev');
        const photoClose = photoDialog.querySelector('.photo-viewer-close');
        const selectedPhoto = index => {
          const photo = artist.photos[index];
          assert.equal(photoImage.getAttribute('src'), photo.full || photo.image);
          assert.equal(photoTitle.textContent, photo.label);
          assert.equal(photoSource.getAttribute('href'), photo.href);
          assert.equal(photoImage.alt, `${artist.korean} ${photo.label} 사진`);
        };
        for (const [index, button] of photoButtons.entries()) {
          assert.notEqual(window.getComputedStyle(button).display, 'none');
          button.click();
          assert.equal(photoDialog.open, true);
          assert.equal(document.activeElement, photoClose);
          assert.equal(document.body.classList.contains('photo-viewing'), true);
          selectedPhoto(index);
          if (artist.photos.length > 1) {
            assert.equal(next.hidden, false);
            assert.equal(previous.hidden, false);
            next.click();
            selectedPhoto((index + 1) % artist.photos.length);
            previous.click();
            selectedPhoto(index);
            previous.click();
            selectedPhoto((index - 1 + artist.photos.length) % artist.photos.length);
            next.click();
            selectedPhoto(index);
          } else {
            assert.equal(next.hidden, true);
            assert.equal(previous.hidden, true);
          }
          photoClose.click();
          assert.equal(photoDialog.open, false);
          assert.equal(document.body.classList.contains('photo-viewing'), false);
          assert.equal(document.activeElement, button);
          checkedPhotos++;
        }

        const videos = videoLibrary[artist.id] || [];
        const videoButtons = [...document.querySelectorAll('[data-video-index]')];
        assert.equal(videoButtons.length, videos.length);
        const videoDialog = document.getElementById('video-viewer');
        const player = document.getElementById('video-viewer-player');
        const videoClose = videoDialog.querySelector('.video-viewer-close');
        for (const [index, button] of videoButtons.entries()) {
          const video = videos[index];
          assert.notEqual(window.getComputedStyle(button).display, 'none');
          button.click();
          assert.equal(videoDialog.open, true);
          assert.equal(document.activeElement, videoClose);
          assert.equal(player.children.length, 1);
          const iframe = player.querySelector('iframe');
          assert.ok(iframe);
          assert.equal(iframe.getAttribute('src'), `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&rel=0`);
          assert.equal(iframe.title, `${video.title} 영상 재생`);
          assert.equal(document.getElementById('video-viewer-title').textContent, video.title);
          assert.equal(document.getElementById('video-viewer-original').getAttribute('href'), `https://www.youtube.com/watch?v=${video.id}`);
          videoClose.click();
          assert.equal(videoDialog.open, false);
          assert.equal(player.children.length, 0, 'closing must release the media player');
          assert.equal(document.activeElement, button);
          checkedVideos++;
        }
      } finally {
        dom.window.close();
      }
    });
  }
  assert.equal(checkedPhotos, artists.reduce((total, artist) => total + artist.photos.length, 0));
  assert.equal(checkedVideos, artists.reduce((total, artist) => total + (videoLibrary[artist.id] || []).length, 0));
  t.diagnostic(`Media click coverage: ${artists.length} artists, ${checkedPhotos} photos, ${checkedVideos} videos. External playback is not exercised.`);
});

test('all artist reveal controls, saved buttons and photograph credits have working targets', async t => {
  for (const artist of artists) {
    await t.test(artist.id, () => {
      const dom = artistPage(artist.id);
      try {
        const { document, localStorage } = dom.window;
        for (const button of document.querySelectorAll('[data-reveal-target]')) {
          const target = document.getElementById(button.dataset.revealTarget);
          assert.ok(target, `${button.textContent} has no target`);
          button.click();
          assert.equal(button.getAttribute('aria-expanded'), 'true');
          assert.equal(target.classList.contains('is-expanded'), true);
          assert.equal(button.querySelector('.content-reveal-text').textContent, button.dataset.labelOpen);
          button.click();
          assert.equal(target.classList.contains('is-expanded'), false);
          assert.equal(button.querySelector('.content-reveal-text').textContent, button.dataset.labelClosed);
        }
        const save = document.getElementById('detail-save');
        save.click();
        assert.equal(save.getAttribute('aria-pressed'), 'true');
        assert.ok(JSON.parse(localStorage.getItem('ojjuda-fanpages-saved-v1')).includes(artist.id));
        save.click();
        assert.equal(save.getAttribute('aria-pressed'), 'false');
        assert.deepEqual(JSON.parse(localStorage.getItem('ojjuda-fanpages-saved-v1')), []);
        const credit = document.querySelector('a.hero-image-credit');
        assert.ok(credit, 'the credit arrow needs to be a clickable source link');
        assert.equal(credit.href, artist.imageLink);
        assert.equal(credit.target, '_blank');
        assert.ok(credit.relList.contains('noopener'));
        assert.ok(credit.relList.contains('noreferrer'));
      } finally {
        dom.window.close();
      }
    });
  }
});

function hubPage() {
  const dom = new JSDOM(read('index.html'), {
    url: 'https://ojjuda.test/features/fanpages/index.html',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  dom.window.matchMedia = () => ({ matches: true });
  dom.window.eval(`${data}\n${behavior}`);
  return dom;
}

test('hub category buttons and search show the matching artists and empty state', () => {
  const dom = hubPage();
  try {
    const { window } = dom;
    const { document } = window;
    const grid = document.getElementById('artist-grid');
    const visibleIds = () => [...grid.querySelectorAll('[data-save]')].map(button => button.dataset.save);
    const filters = [...document.querySelectorAll('[data-category]')];
    const search = document.getElementById('artist-search');
    const select = category => {
      const button = filters.find(item => item.dataset.category === category);
      button.focus();
      button.click();
      assert.equal(document.activeElement, button);
      for (const filter of filters) {
        assert.equal(filter.getAttribute('aria-pressed'), String(filter === button));
        assert.equal(filter.classList.contains('is-active'), filter === button);
      }
    };
    const expectIds = expected => {
      assert.deepEqual(visibleIds().sort(), [...expected].sort());
      assert.equal(document.getElementById('filter-count').textContent, `${expected.length} / ${artists.length}`);
      assert.equal(document.getElementById('empty-content').hidden, expected.length > 0);
    };
    expectIds(artists.map(artist => artist.id));
    const legacyGirls = ['a2olite', 'a2omay', 'aespa', 'illit', 'ive', 'lesserafim', 'rescene', 'twice'];
    select('girl');
    expectIds(artists.filter(artist => artist.category === 'girl' || legacyGirls.includes(artist.id)).map(artist => artist.id));
    select('boy');
    expectIds(artists.filter(artist => artist.category === 'boy' || artist.id === 'a2osoul').map(artist => artist.id));
    select('saved');
    expectIds([]);
    select('all');
    expectIds(artists.map(artist => artist.id));

    const searchFor = value => {
      search.focus();
      search.value = value;
      search.dispatchEvent(new window.Event('input', { bubbles: true }));
      assert.equal(document.activeElement, search);
    };
    searchFor('  tWiCe  ');
    expectIds(['twice']);
    select('boy');
    expectIds([]);
    select('girl');
    expectIds(['twice']);
    searchFor('리센느');
    expectIds(['rescene']);
    searchFor('REMINE');
    expectIds(['rescene']);
    searchFor('does not match any artist');
    expectIds([]);
    searchFor('');
    select('all');
    expectIds(artists.map(artist => artist.id));
  } finally {
    dom.window.close();
  }
});

test('every hub saved button keeps focus and correct state after registration and removal', () => {
  const dom = hubPage();
  try {
    const { document, localStorage } = dom.window;
    const grid = document.getElementById('artist-grid');
    const buttonFor = id => grid.querySelector(`[data-save="${id}"]`);
    for (const artist of artists) {
      for (const saved of [true, false]) {
        const button = buttonFor(artist.id);
        button.focus();
        button.click();
        const replacement = buttonFor(artist.id);
        assert.equal(document.activeElement, replacement, `${artist.id} must retain keyboard focus`);
        assert.equal(replacement.getAttribute('aria-pressed'), String(saved), artist.id);
        assert.equal(replacement.classList.contains('is-saved'), saved, artist.id);
        assert.equal(replacement.getAttribute('aria-label'), `${artist.korean} 관심 ${saved ? '취소' : '등록'}`);
        assert.deepEqual(JSON.parse(localStorage.getItem('ojjuda-fanpages-saved-v1')), saved ? [artist.id] : []);
        assert.equal(grid.querySelectorAll('[data-save]').length, artists.length);
      }
    }
  } finally {
    dom.window.close();
  }
});

test('removing saved artists focuses the next artist, previous artist, or saved filter', () => {
  const dom = hubPage();
  try {
    const { document, localStorage } = dom.window;
    const grid = document.getElementById('artist-grid');
    const buttonFor = id => grid.querySelector(`[data-save="${id}"]`);
    const ids = [...grid.querySelectorAll('[data-save]')].slice(0, 3).map(button => button.dataset.save);
    for (const id of ids) buttonFor(id).click();
    const savedFilter = document.querySelector('[data-category="saved"]');
    savedFilter.click();
    assert.equal(grid.querySelectorAll('[data-save]').length, 3);
    const remove = (id, expectedFocus) => {
      const button = buttonFor(id);
      button.focus();
      button.click();
      assert.equal(buttonFor(id), null);
      assert.equal(document.activeElement, expectedFocus ? buttonFor(expectedFocus) : savedFilter);
      assert.equal(savedFilter.getAttribute('aria-pressed'), 'true');
    };
    remove(ids[1], ids[2]);
    remove(ids[2], ids[0]);
    remove(ids[0], null);
    assert.equal(document.getElementById('empty-content').hidden, false);
    assert.equal(document.getElementById('filter-count').textContent, `0 / ${artists.length}`);
    assert.deepEqual(JSON.parse(localStorage.getItem('ojjuda-fanpages-saved-v1')), []);
  } finally {
    dom.window.close();
  }
});
