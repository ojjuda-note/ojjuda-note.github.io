const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the small, named-export data modules in either a plain VM or JSDOM.
// Queries are cache revisions in the browser, not different fixture files.
function createTarotLoader(context = vm.createContext({})) {
  const root = path.resolve(__dirname, '../games/moonlit-tarot');
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(root, file.split('?')[0]);
    if (!absolute.startsWith(root + path.sep)) throw Error('fixture module outside tarot');
    if (cache.has(absolute)) return cache.get(absolute);
    let source = fs.readFileSync(absolute, 'utf8');
    const names = [], values = [];
    source = source.replace(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?\s*$/gm, (_, bindings, from) => {
      const dependency = load(path.relative(root, path.resolve(path.dirname(absolute), from.split('?')[0])));
      for (const binding of bindings.split(',').map(value => value.trim()).filter(Boolean)) {
        const [exported, local = exported] = binding.split(/\s+as\s+/);
        if (!Object.hasOwn(dependency, exported)) throw Error(`missing fixture export ${exported}`);
        names.push(local); values.push(dependency[exported]);
      }
      return '';
    });
    const exported = [...source.matchAll(/^export\s+(?:const|let|var|function|class)\s+(\w+)/gm)].map(match => match[1]);
    source = source.replace(/^export\s+/gm, '');
    const evaluate = vm.runInContext(`(function(${names.join(',')}) { ${source}\nreturn {${exported.join(',')}}; })`, context, { filename: absolute });
    const module = evaluate(...values);
    cache.set(absolute, module);
    return module;
  }
  return load;
}

module.exports = { createTarotLoader };
