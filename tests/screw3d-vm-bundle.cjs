const assert=require('node:assert/strict');

// Legacy VM / injected-script fixtures cannot evaluate static ESM imports.
// Inline the game's real helper modules so these fixtures exercise the same
// 3D model, screw geometry and physics as the browser module loader.
function bundleScrew3d(read){
 const source=read('screw3d.js');
 const imports=/^import\s+\{[^}]+\}\s+from\s+['"]\.\/([^'"]+)['"];?\s*$/gm;
 const dependencies=[...source.matchAll(imports)].map(match=>match[1].split('?')[0]);
 assert.ok(dependencies.length>0,'3D engine dependencies must be loaded in VM tests');
 const helpers=dependencies.map(name=>read(name).replace(/^export\s+/gm,''));
 const game=source.replace(imports,'').replace(/^export\s+\{[^}]*\};?\s*$/gm,'');
 return helpers.join('\n')+'\n'+game;
}

module.exports={bundleScrew3d};
