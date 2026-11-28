const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'lifetime/index.html'), 'utf8');
const scripts = ['population', 'research', 'estimate', 'conditions', 'survival', 'clock-scenery', 'clock-display', 'clock'];
const source = scripts.map(file => fs.readFileSync(path.join(root, 'features/lifetime', file + '.js'), 'utf8')).join('\n');
const kst = iso => Date.parse(iso + '+09:00');
const key = 'life-clock-settings-v3';
const day = 86400000;
function page(t, settings = {}, instant = '2026-11-28T16:00:00') {
  const dom = new JSDOM(html, { url: 'https://ojjuda.kr/lifetime/', runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const w = dom.window;
  const id = name => w.document.getElementById(name);
  w.matchMedia = () => ({ matches: true });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.localStorage.setItem(key, JSON.stringify(settings));
  w.Date.now = () => kst(instant);
  w.setTimeout = () => 0;
  const api = w.eval(source + '\n;({ tick, startup, calculate, calendarMonths, birthMoment, anniversary, incomeRisk, population, current: () => clock, setClock: c => {clock=c;} })');
  const submit = name => id(name).dispatchEvent(new w.Event('submit', { cancelable: true }));
  return { w, id, api, submit, elapsed: () => api.current().target };
}

test('measured BMI includes exact thresholds, even for previously saved answers', t => {
  const settings = { birth: '1983-04-17', fields: { basis: 'men', bmi: '2' }, measurements: { height: '160', weight: '64' } };
  const { id, api, w } = page(t, settings);
  assert.equal(api.startup().fields.bmi, '3');
  id('open-conditions').click();
  for (const [height, weight, category] of [[160, 47.36, '1'], [160, 58.88, '2'], [160, 63.9999, '2'], [160, 64, '3'], [160, 64.0001, '3'], [162.5, 66.015625, '3'], [180, 59.94, '1'], [180, 74.52, '2']]) {
    id('height').value = height;
    id('weight').value = weight;
    id('weight').dispatchEvent(new w.Event('input'));
    assert.equal(id('input-bmi').value, category, height + 'cm ' + weight + 'kg');
  }
  for (const [measurements, expected] of [[{}, '2'], [{ height: '160' }, '']]) {
    w.localStorage.setItem(key, JSON.stringify({ ...settings, measurements }));
    assert.equal(api.startup().fields.bmi, expected);
  }
});

test('resaving the same birthday or answers on a later day keeps the same estimate', t => {
  const { id, submit, elapsed, w } = page(t, { birth: '1986-11-28', referenceDay: '2026-11-27', fields: { basis: 'men', smoke: '2' } });
  const first = elapsed();
  id('open-conditions').click();
  submit('condition-form');
  assert.equal(elapsed(), first);
  id('birth-time').value = '00:00';
  submit('birth-form');
  assert.equal(elapsed(), first);
  id('birth-time').value = '00:30';
  submit('birth-form');
  const shifted = first + 30 * 60000;
  assert.equal(elapsed(), shifted);
  id('open-conditions').click();
  id('input-pet').value = 'dog';
  submit('condition-form');
  assert.equal(elapsed(), shifted);
  id('open-conditions').click();
  id('input-stressLevel').value = '2';
  submit('condition-form');
  assert.equal(elapsed(), shifted - 2 * day);
  id('open-conditions').click();
  id('input-smoke').value = '0';
  submit('condition-form');
  assert.equal(JSON.parse(w.localStorage.getItem(key)).referenceDay, '2026-11-28');
});

test('Korean birth time, leap days, newborns and the trend crossing', t => {
  const { api, id, w, submit, elapsed } = page(t, { birth: '1983-04-17', fields: { basis: 'men' } });
  assert.equal(elapsed(), kst('2074-01-17T00:00:00'));
  const nowFunction = w.Date.now;
  const eleventhSecond = api.current().born + 364628000;
  for (const [offset, expected] of [[-1000, '00:00:10'], [0, '00:00:11'], [1000, '00:00:11']]) {
    w.Date.now = () => eleventhSecond + offset;
    api.tick();
    assert.equal(id('life-time').textContent, expected);
  }
  w.Date.now = nowFunction;
  id('birth-time').value = '14:37';
  submit('birth-form');
  assert.equal(elapsed(), kst('2074-01-17T14:37:00'));
  const now = kst('2026-11-28T16:00:00');
  assert.equal(api.birthMoment('2026-11-28', '16:01', now), null);
  assert.equal(api.birthMoment('2023-02-29', '', now), null);
  const leap = api.birthMoment('2024-02-29', '23:58', now);
  assert.equal(api.anniversary(leap, 12), kst('2025-02-28T23:58:00'));
  assert.equal(api.calendarMonths(leap, api.anniversary(leap, 48)), 48);
  id('birth').value = '2026-11-28';
  id('birth-time').value = '16:00';
  submit('birth-form');
  assert.equal(id('life-time').textContent, '00:00:00');
  assert.ok(elapsed() > now + 90 * 365.25 * day);
});

test('the countdown decreases through month ends and leap day', t => {
  const { api, id, w } = page(t);
  for (const year of [2027, 2028]) {
    const endDate = year === 2028 ? '02-29' : '02-28';
    const target = kst(year + '-' + endDate + 'T12:00:00');
    api.setClock({ born: target - 100 * 365 * day, target });
    let previous;
    for (const date of ['01-29', '01-30', '01-31', '02-01']) {
      for (const time of ['00:00:00', '11:59:59', '12:00:00', '12:00:01', '23:59:59']) {
        w.Date.now = () => kst(year + '-' + date + 'T' + time);
        api.tick();
        const values = [...id('flip-board').querySelectorAll('.flip-tile')].map(tile => Number(tile.dataset.value));
        const sortable = values.reduce((sum, n) => 100 * sum + n, 0);
        if (previous !== undefined) assert.ok(sortable < previous, date + ' ' + time + ' ' + values);
        previous = sortable;
      }
    }
  }
});

test('the same dial rate continues past midnight and the bonus counts up every second', t => {
  const { api, id, w } = page(t);
  const born = kst('2024-02-28T14:00:00'), target = born + 2 * day;
  api.setClock({ born, target });
  for (const [offset, dial, countdown] of [[-2000, '23:59:59', '00:00:02'], [-1000, '23:59:59', '00:00:01'],
    [0, '24:00:00', '00:00:00'], [1000, '24:00:00', '00:00:01'], [2000, '24:00:01', '00:00:02'], [7200000, '25:00:00', '02:00:00']]) {
    w.Date.now = () => target + offset;
    api.tick();
    assert.equal(id('life-time').textContent, dial);
    assert.equal(id('remaining').textContent, '0년 0개월 0일 ' + countdown);
    assert.equal(id('remaining-label').textContent, offset < 0 ? '남은 추정 수명' : '쌓인 보너스 시간');
  }
  w.Date.now = () => born + day;
  api.tick();
  assert.equal(id('meridiem').textContent, 'PM');
  assert.equal(id('daypart').textContent, '점심');
});

test('the open-ended table gives stable one-year income risk', t => {
  const { api } = page(t);
  for (const curve of Object.values(api.population.national)) {
    for (let income = 0; income < 5; income++) {
      const expected = api.incomeRisk(curve, 101, income);
      for (const age of [150, 1400, 2025]) {
        const risk = api.incomeRisk(curve, age, income);
        assert.ok(Math.abs(risk.selected - expected.selected) < 1e-12);
      }
    }
  }
});

test('the finish date adds each independent time difference exactly once', t => {
  for (const basis of ['men', 'women', '']) {
    const settings = { birth: '1983-04-17', birthTime: '12:30', referenceDay: '2026-11-28', fields: { basis } };
    const { id, elapsed, submit } = page(t, settings);
    const base = elapsed();
    const entries = [['region', '서울'], ['smoke', '2'], ['drink', '3'], ['exercise', '1'], ['stressLevel', '4']];
    function setFields(selected) {
      id('open-conditions').click();
      for (const [key] of entries) id('input-' + key).value = '';
      id('drink-amount').value = '';
      for (const [key, value] of selected) {
        id('input-' + key).value = key === 'drink' ? '4' : value;
        if (key === 'drink') id('drink-amount').value = value;
      }
      submit('condition-form');
      return elapsed();
    }
    const sum = entries.reduce((total, entry) => total + setFields([entry]) - base, base);
    assert.equal(setFields(entries), sum);
    assert.equal(setFields(entries.slice().reverse()), sum);
    assert.equal(setFields([]), base);
  }
});
