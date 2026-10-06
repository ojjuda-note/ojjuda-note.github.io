const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../world.html'), 'utf8');
const colors = source.slice(source.indexOf('var If='), source.indexOf('function Ag('));
const avatar = source.slice(source.indexOf('function Il(t)'), source.indexOf('var worldVisitRequest='));
assert.ok(colors && avatar, 'exercise the actual production profile renderers');
const context = vm.createContext({ $e: () => '<svg aria-hidden="true"></svg>' });
vm.runInContext(`${colors}${avatar};this.renderers=[Eg,Il];this.color=If;`, context);
for (const color of ['#fff', '#EDE9FF', '#12aBcD']) {
  assert.equal(context.color({ room: { wall: color } }), color, 'valid room colors remain unchanged');
}
const attacks = [
  '#fff"><img src=x onerror="window.pwned=1"><div style="',
  'red" onpointerover="window.pwned=1',
  'red;background-image:url(https://example.invalid/track)',
  'url(javascript:alert(1))', '<script>window.pwned=1</script>',
  '', null, 123, { toString: () => 'red" onclick="alert(1)' }
];
for (const attack of attacks) {
  for (const render of context.renderers) {
    const html = render({ room: { wall: attack } });
    const dom = new JSDOM(html);
    const root = dom.window.document.body.firstElementChild;
    assert.equal(root.style.background, 'rgb(237, 233, 255)');
    assert.equal(root.style.backgroundImage, '');
    assert.equal(dom.window.document.querySelectorAll('img,script').length, 0);
    for (const element of dom.window.document.querySelectorAll('*')) {
      assert.equal([...element.attributes].some(a => /^on/i.test(a.name)), false);
    }
    dom.window.close();
  }
}
assert.equal(context.color(null), '#EDE9FF');
assert.equal(/\$\{[a-zA-Z]+\.room\.wall\}/.test(source), false, 'all profile color HTML paths use the validator');
console.log('PASS: production profile colors reject HTML, event-handler and CSS URL injection');
