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
