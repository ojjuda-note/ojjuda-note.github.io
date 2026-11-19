const assert = require('node:assert/strict');

const calendarCases = [
  ['spring', '2026-04-01'], ['summer', '2026-07-01'],
  ['autumn', '2026-10-15'], ['winter', '2027-01-15'],
  ['christmas', '2026-12-25']
];

async function selectCalendarDate(view, date, weather = null) {
  await view.evaluate(({value, weather}) => {
    const NativeDate = window.Date;
    const now = NativeDate.parse(value + 'T03:00:00Z');
    window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [now])); }
      static now() { return now; }
    };
    try {
      window.OjjudaThemes.setWeather(weather);
      window.OjjudaThemes.sync();
    }
    finally { window.Date = NativeDate; }
  }, {value: date, weather});
}

async function palette(view, selectors = {}) {
  return view.evaluate(selectors => {
    const root = document.documentElement;
    const swatch = document.createElement('span');
    swatch.hidden = true;
    root.append(swatch);
    const token = name => {
      swatch.style.backgroundColor = 'var(' + name + ')';
      return getComputedStyle(swatch).backgroundColor;
    };
    const result = {
      theme: root.dataset.worldTheme, weather: root.dataset.worldWeather || '',
      bg: token('--bg'), accent: token('--accent'), soft: token('--accent-soft'),
      surface: token('--surface'), ink: token('--ink'),
      body: getComputedStyle(document.body).backgroundColor, nodes: {}
    };
    swatch.remove();
    for (const [name, selector] of Object.entries(selectors)) {
      const node = document.querySelector(selector);
      if (!node) throw new Error('Missing theme target: ' + selector);
      const css = getComputedStyle(node);
      result.nodes[name] = {background: css.backgroundColor, image: css.backgroundImage,
        color: css.color, border: css.borderTopColor};
    }
    return result;
  }, selectors);
}

function distinctPalettes(snapshots, label, paths = ['bg', 'accent']) {
  for (const path of paths) {
    const read = value => path.split('.').reduce((item, key) => item[key], value);
    assert.equal(new Set(snapshots.map(read)).size, snapshots.length,
      label + ': ' + path + ' changes for all four seasons and Christmas');
  }
}

module.exports = {calendarCases, selectCalendarDate, palette, distinctPalettes};
