import * as THREE from './vendor/three.module.js';

// Static display models share one draw call per material, not one per tiny part.
export function compactModel(model) {
  let skinned=false;model.traverse(o=>{if(o.isSkinnedMesh)skinned=true;});if(skinned)return model;
  model.updateMatrixWorld(true);
  const buckets=new Map(),materials=new Set(),kept=new Set(),loose=[];
  model.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const all=Array.isArray(mesh.material)?mesh.material:[mesh.material];for(const m of all)materials.add(m);
    for(let parent=mesh;parent;parent=parent.parent)if(!parent.visible)return;
    if(Array.isArray(mesh.material)||!mesh.geometry.attributes.normal||!mesh.geometry.attributes.uv){loose.push(mesh);for(const m of all)kept.add(m);return;}
    const m=mesh.material;
    const key=[m.type,m.color?.getHexString(),m.map?.uuid,m.emissive?.getHexString(),m.emissiveIntensity,m.opacity,m.transparent,m.side,m.roughness,m.metalness,m.depthWrite,m.alphaTest,m.flatShading,mesh.renderOrder].join(':');
    if(!buckets.has(key)){buckets.set(key,{material:m,geometries:[]});kept.add(m);}
    const geometry=(mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);
    buckets.get(key).geometries.push(geometry);
  });
  const result=new THREE.Group();
  for(const {material,geometries} of buckets.values()){
    const merged=new THREE.BufferGeometry();
    for(const [name,size] of [['position',3],['normal',3],['uv',2]]){
      const count=geometries.reduce((sum,g)=>sum+g.attributes[name].array.length,0),array=new Float32Array(count);let offset=0;
      for(const g of geometries){array.set(g.attributes[name].array,offset);offset+=g.attributes[name].array.length;}
      merged.setAttribute(name,new THREE.BufferAttribute(array,size));
    }
    const mesh=new THREE.Mesh(merged,material);mesh.castShadow=mesh.receiveShadow=true;result.add(mesh);
    for(const geometry of geometries)geometry.dispose();
  }
  for(const mesh of loose){const clone=mesh.clone();mesh.matrixWorld.decompose(clone.position,clone.quaternion,clone.scale);result.add(clone);}
  model.traverse(mesh=>{if(mesh.isMesh&&!loose.includes(mesh))mesh.geometry.dispose();});
  for(const material of materials)if(!kept.has(material))material.dispose();
  return result;
}
