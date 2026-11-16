const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');

async function withBrushPage(check) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ path: path.join(__dirname, '../note/calligraphy.js') });
    await check(page);
  } finally {
    await browser.close();
  }
}

test('Hangul brush keeps both final consonants legible in Park cards', () =>
  withBrushPage(async page => {
    // Isolate all 11 compound finals and ㄲ/ㅆ beside three single finals on the same body.
    const sameBody = Array.from('앇앉않앍앎앏앐앑앒앓앖앆았안알암');
    const words = [...sameBody, '젊', '흙', '괆', '젊은', '오늘이 내 생에 가장 젊은 날이다'];
    for (const width of [192, 540]) {
      const samples = await page.evaluate(({width, words}) => {
        const samples = {};
        function render(text) {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.fillText = () => { throw new Error('System font used for ' + text); };
          window.ParkCalligraphy.render(canvas, text, { width, accent: false });
          return canvas;
        }
        for (const word of words) {
          const canvas = render(word);
          const bounds = window.ParkCalligraphy.inkBounds(canvas);
          if (!bounds) throw new Error('Missing ink for ' + word);
          const sample = document.createElement('canvas');
          sample.width = sample.height = 40;
          const ctx = sample.getContext('2d');
          ctx.drawImage(canvas, bounds.x * canvas.width, bounds.y * canvas.height,
            bounds.width * canvas.width, bounds.height * canvas.height, 0, 0, 40, 40);
          const pixels = ctx.getImageData(0, 0, 40, 40).data;
          let upper = 0, left = 0, right = 0, mask = '';
          for (let y = 0; y < 40; y++) {
            for (let x = 0; x < 40; x++) {
              const ink = pixels[(40 * y + x) * 4 + 3] >= 128;
              if (y >= 24) {
                mask += ink ? '1' : '0';
                if (ink && x < 20) left++;
                if (ink && x >= 20) right++;
              } else if (ink) upper++;
            }
          }
          const margin = Math.min(bounds.x, bounds.y, 1 - bounds.x - bounds.width,
            1 - bounds.y - bounds.height);
          const nfdMatches = canvas.toDataURL() === render(word.normalize('NFD')).toDataURL();
          samples[word] = { upper, left, right, mask, margin, nfdMatches };
        }
        return samples;
      }, {width, words});
      for (const [word, sample] of Object.entries(samples)) {
        assert.ok(sample.margin > 0, word + ' must fit inside the canvas at ' + width);
        assert.ok(sample.nfdMatches, word + ' must match its decomposed input');
      }
      for (const word of '젊않앉았앏앐') {
        const { upper, left, right } = samples[word];
        assert.ok(left > 35 && right > 35, word + ' is missing a substantial left or right final');
        assert.ok(left + right > upper * .53, word + ' finals are too light relative to the body at ' + width);
      }
      for (const [i, first] of sameBody.entries()) {
        for (const second of sameBody.slice(i + 1)) {
          const a = samples[first].mask, b = samples[second].mask;
          let differences = 0;
          for (let j = 0; j < a.length; j++) if (a[j] !== b[j]) differences++;
          assert.ok(differences > 12, first + ' and ' + second + ' need distinct final shapes at ' + width);
        }
      }
    }
  }));

test('Park centers each brush line and emphasizes only matching tags', () =>
  withBrushPage(async page => {
    const result = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      const width = 328;
      function read(body, tags, rowCount = 1) {
        window.ParkCalligraphy.render(canvas, body, { width, tags });
        const bounds = window.ParkCalligraphy.inkBounds(canvas);
        const bytes = canvas.getContext('2d').getImageData(0, 0, width, canvas.height).data;
        const scanlines = [];
        let hash = 2166136261;
        for (let y = 0; y < canvas.height; y++) {
          let left = width, right = -1, gold = 0, goldX = 0, hasDarkInk = false;
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            hash = Math.imul(hash ^ bytes[i + 3], 16777619);
            if (bytes[i + 3] < 20) continue;
            left = Math.min(left, x);
            right = x;
            if (bytes[i + 3] >= 100 && bytes[i] < 120) hasDarkInk = true;
            if (bytes[i] - bytes[i + 2] > 75 && bytes[i + 1] > 95) { gold++; goldX += x; }
          }
          if (right >= 0) scanlines.push({ y, left, right, gold, goldX, hasDarkInk });
        }
        // The widest empty bands split explicit rows without consulting the renderer's layout.
        const cuts = scanlines.slice(1).map((line, i) => ({ at: i + 1, gap: line.y - scanlines[i].y }))
          .sort((a, b) => b.gap - a.gap).slice(0, rowCount - 1).map(c => c.at).sort((a, b) => a - b);
        const starts = [0, ...cuts, scanlines.length];
        const rows = starts.slice(0, -1).map((start, i) => {
          const band = scanlines.slice(start, starts[i + 1]);
          const left = Math.min(...band.map(p => p.left)), right = Math.max(...band.map(p => p.right));
          const count = band.reduce((n, p) => n + p.gold, 0);
          const ink = band.filter(p => p.hasDarkInk);
          return { center: (left + right) / (2 * width), count,
            inkHeight: ink.length ? ink.at(-1).y - ink[0].y + 1 : 0,
            goldX: count ? band.reduce((n, p) => n + p.goldX, 0) / (count * width) : 0 };
        });
        return { hash, bounds, rows };
      }
      const phrase = '건강이 최고다\n가장 젊은 날이다.';
      const normal = read(phrase, [], 2);
      const missing = read(phrase, ['없는말'], 2);
      const first = read(phrase, ['건강'], 2);
      const last = read(phrase, ['날이다'], 2);
      const both = read(phrase, ['건강', '날이다'], 2);
      const repeated = read('건강이 최고다\n오래오래 건강', ['건강'], 2);
      const uneven = read('오\n가장 젊은 날이다\n건강', [], 3);
      const ending = read('봄'.repeat(198) + '건강', ['건강']);
      const nfd = read(phrase.normalize('NFD'), ['건강'.normalize('NFD'), '#날이다'], 2);
      const cleared = read(phrase, [], 2);
      // Use the untagged second line to account for any change in overall card scale.
      const sizePhrase = '젊은\n괜찮은 하루 보내세요';
      const plainSize = read(sizePhrase, [], 2).rows;
      const taggedSize = read(sizePhrase, ['젊은'], 2).rows;
      return { normal, missing, first, last, both, repeated, uneven, ending, nfd, cleared, plainSize, taggedSize };
    });
    const { normal, missing, first, last, both, repeated, uneven, ending, nfd, cleared } = result;
    for (const sample of [normal, missing, cleared]) assert.ok(sample.rows.every(row => row.count === 0));
    assert.equal(missing.hash, normal.hash);
    assert.equal(cleared.hash, normal.hash, 'clearing tags restores the original drawing');
    const [plainWord, plainReference] = result.plainSize.map(row => row.inkHeight);
    const [taggedWord, taggedReference] = result.taggedSize.map(row => row.inkHeight);
    assert.ok(taggedWord >= plainWord * 1.28 && taggedWord / taggedReference > plainWord / plainReference * 1.24,
      'the tagged word has visibly taller brush strokes on a mobile card, independent of its underline');
    assert.deepEqual(nfd, both, 'decomposed Hangul and optional # produce the same artwork');
    assert.ok(first.rows[0].count > 4 && first.rows[0].goldX < .5 && first.rows[1].count === 0,
      '건강 matches before the particle 이 on the upper left');
    assert.ok(last.rows[1].count > 4 && last.rows[1].goldX > .5 && last.rows[0].count === 0,
      '날이다 matches before punctuation on the lower right');
    for (const sample of [both, repeated]) assert.ok(sample.rows.every(row => row.count > 4));
    for (const sample of [normal, both, uneven]) {
      for (const row of sample.rows) assert.ok(Math.abs(row.center - .5) < .035, 'row center: ' + row.center);
    }
    assert.ok(ending.rows[0].count > 0, 'a tag at the end of a 200-character post remains visible');
    assert.ok(ending.bounds.x > 0 && ending.bounds.y > 0 && ending.bounds.x + ending.bounds.width < 1
      && ending.bounds.y + ending.bounds.height < 1, 'long cards retain their margins');
  }));
