// Use an approved, shape-preserving item for workflow tests. The old planar
// side-table example is intentionally editable but no longer passes the gate.
exports.loadValidStudioItem=async frame=>frame.evaluate(async()=>{
 const entry=await(await fetch('./entry.js')).text(),url=entry.match(/import\('(.\/app\.js[^']*)'\)/)[1];
 const runtime=await(await fetch('../assets/pencil-cup-v1.runtime.json')).json();
 const project={format:'ojjuda-furniture-set',version:1,name:runtime.name,objectType:'furniture',usage:'surface',dimensionStatus:'suggested',dimensions:runtime.dimensions,activeView:'left',views:{}};
 for(const [direction,view]of Object.entries(runtime.views))project.views[direction]={format:'ojjuda-furniture',version:1,name:runtime.name,objectType:'furniture',usage:'surface',dimensionStatus:'suggested',source:{name:direction+'.png',data:view.drawings[0].data},cutout:{polygon:[],strokes:[]},layers:[{id:'source',name:'그림',source:[],target:[],binding:null}],placement:view.placement,mesh:view.mesh};
 await(await import(url)).studioRestore(project);
});
