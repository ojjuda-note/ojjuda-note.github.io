const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM, VirtualConsole } = require('jsdom');

const source = name => fs.readFileSync(path.join(__dirname, '../features/fanpages/', name), 'utf8');
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

async function fixture() {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on('jsdomError', error => {
    // A successful mocked save reloads the page; JSDOM does not navigate.
    if (!error.message.startsWith('Not implemented: navigation')) errors.push(error.message);
  });
  const dom = new JSDOM('<body data-page="artist"><span id="catalog-status" hidden></span><button id="fan-manage" hidden>팬페이지 관리</button></body>', {
    url: 'https://fan.test/features/fanpages/artist.html?group=fixture',
    runScripts: 'outside-only', virtualConsole
  });
  const { window } = dom;
  const saves = [];
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new window.Event('close'));
  };
  window.OJJUDA_FAN_ARTISTS = [{ id: 'fixture', name: 'Fixture', korean: '검증용', members: [] }];
  window.OJJUDA_FAN_PROFILES = {};
  window.OJJUDA_FAN_VIDEOS = {};
  window.ojjudaSupabase = {
    auth: { onAuthStateChange(callback) { callback('INITIAL_SESSION', { user: { id: 'editor' } }); } },
    from() {
      let group;
      const query = {
        select() { return query; }, order() { return query; }, range() { return query; },
        eq(_key, value) { group = value; return query; }, single() { return query; },
        abortSignal() { return Promise.resolve({ data: group ? { sections: {} } : [{ artist_id: 'fixture', identity: null }], error: null }); }
      };
      return query;
    },
    async rpc(name, args) {
      if (name === 'is_admin') return { data: false, error: null };
      if (name === 'can_edit_fanpage') return { data: true, error: null };
      if (name === 'save_fanpage_section') { saves.push(args); return { data: null, error: null }; }
      throw Error('Unexpected RPC: ' + name);
    }
  };
  window.eval(source('catalog.js'));
  await window.OjjudaFanCatalog.ready;
  window.eval(source('manager.js'));
  await settle();
  const launch = window.document.getElementById('fan-manage');
  assert.equal(launch.hidden, false);
  launch.click();
  function field(label) {
    const container = [...window.document.querySelectorAll('.fan-admin label')]
      .find(node => node.querySelector('span').textContent === label);
    assert.ok(container, 'Missing form field: ' + label);
    return container.querySelector('input, select, textarea');
  }
  function button(label) {
    const control = [...window.document.querySelectorAll('.fan-admin button')].find(node => node.textContent === label);
    assert.ok(control, 'Missing button: ' + label);
    return control;
  }
  function edit(section, addLabel, values) {
    const nav = field('편집할 항목');
    nav.value = section;
    nav.dispatchEvent(new window.Event('change'));
    button(addLabel).click();
    for (const [label, value] of Object.entries(values)) field(label).value = value;
  }
  return { window, saves, errors, field, button, edit, close: () => window.close() };
}

for (const sample of [
  { name: 'official link without a host', section: 'links', add: '공식 채널 항목 추가', label: '주소', bad: 'https://', fields: { '채널 이름': '공식 채널' } },
  { name: 'photo address with an invalid host', section: 'photos', add: '사진 항목 추가', label: '사진', bad: 'https://bad host/photo.jpg', fields: { '사진 제목': '사진' } },
  { name: 'video address without a host', section: 'videos', add: '영상 항목 추가', label: '영상 파일', bad: 'https://?clip=1', fields: { '제목': '영상' } }
]) {
  test('manager rejects ' + sample.name + ' before saving and preserves the form', async () => {
    const f = await fixture();
    try {
      f.edit(sample.section, sample.add, { ...sample.fields, [sample.label]: sample.bad });
      f.button('변경 사항 저장').click();
      await settle();
      assert.equal(f.saves.length, 0, 'Invalid media or link address must not be persisted');
      assert.equal(f.field(sample.label).value, sample.bad);
      assert.match(f.window.document.querySelector('.fan-admin [role="status"]').textContent, /https 주소/);
      assert.equal(f.button('변경 사항 저장').disabled, false);
      assert.equal(f.field('편집할 항목').disabled, false);
      assert.deepEqual(f.errors, []);
    } finally { f.close(); }
  });
}

test('manager saves a valid HTTPS video address with its query parameters intact', async () => {
  const f = await fixture();
  try {
    const address = 'https://media.example.test/clip.mp4?token=a&quality=hd';
    f.edit('videos', '영상 항목 추가', { '제목': '정상 영상', '영상 파일': address });
    f.button('변경 사항 저장').click();
    await settle();
    assert.equal(f.saves.length, 1);
    assert.equal(f.saves[0].p_value[0].file, address);
    assert.deepEqual(f.errors, []);
  } finally { f.close(); }
});
