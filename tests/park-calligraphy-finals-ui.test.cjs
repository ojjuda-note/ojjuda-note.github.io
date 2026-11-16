const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');

test('Hangul brush keeps both final consonants legible in Park cards', async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ path: path.join(__dirname, '../note/calligraphy.js') });
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
  } finally {
    await browser.close();
  }
});
