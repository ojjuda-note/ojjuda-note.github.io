import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from './vendor/SkeletonUtils.js';

// These authored rigs are shared with the installed World client. Deliberately
// limit substitutions to matching silhouettes; saved breed IDs never change.
const SPECIES = Object.freeze({dog:'dog', dg_corgi:'dog', cat:'cat', ct_mackerel:'cat', ct_cheese:'cat', ct_tuxedo:'cat', ct_calico:'cat', ct_blackcat:'cat'});
const CAT_COATS=Object.freeze({ct_cheese:'#F2B36B',ct_tuxedo:'#2E2E38',ct_calico:'#F1F1F4',ct_blackcat:'#2E2E38'});
const MODELS = Object.freeze({
  dog: {url:new URL('./assets/models/premium_dog.glb', import.meta.url), height:.98, base:[.63,.32,.115]},
  cat: {url:new URL('./assets/models/premium_cat.glb', import.meta.url), height:.94, base:[.27,.38,.40]}
});
const CREAM = [.94,.87,.72];
const cache = new Map(), requests = new Set();
let status = {dog:'unloaded',cat:'unloaded'}, pending = null, generation = 0;

export function getSculptedPetsStatus() { return {...status}; }

function release(root) {
  const geometries=new Set(), materials=new Set(), skeletons=new Set();
  root?.traverse(node=>{
    if(node.geometry)geometries.add(node.geometry);
    for(const material of Array.isArray(node.material)?node.material:[node.material])if(material)materials.add(material);
    if(node.skeleton)skeletons.add(node.skeleton);
  });
  for(const geometry of geometries)geometry.dispose();
  for(const material of materials)material.dispose();
  for(const skeleton of skeletons)skeleton.dispose();
}

/** A failed optional model never prevents the existing World renderer booting. */
export function preloadSculptedPets({timeoutMs=5500}={}) {
  if(pending)return pending;
  const epoch=generation;
  const budget=Math.max(1,Math.min(5500,Number.isFinite(timeoutMs)?timeoutMs:5500));
  const loader=new GLTFLoader();
  pending=Promise.all(Object.entries(MODELS).map(async ([species,definition])=>{
    if(cache.has(species)){status[species]='ready';return;}
    status[species]='loading';
    const controller=new AbortController();requests.add(controller);
    let timedOut=false, finished=false, timer;
    const cancelled=()=>epoch!==generation||timedOut;
    const loading=(async()=>{
      const response=await fetch(definition.url,{signal:controller.signal,credentials:'same-origin'});
      if(!response.ok)throw new Error('Pet model unavailable');
      const buffer=await response.arrayBuffer();
      if(cancelled())return;
      const gltf=await loader.parseAsync(buffer,new URL('.',definition.url).href);
      if(cancelled()){release(gltf.scene);return;}
      gltf.scene.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(gltf.scene);
      if(bounds.isEmpty()||!Number.isFinite(bounds.min.y)||!Number.isFinite(bounds.max.y)||bounds.max.y-bounds.min.y<.1){release(gltf.scene);throw new Error('Invalid pet model bounds');}
      cache.set(species,gltf.scene);status[species]='ready';
    })().catch(()=>{if(epoch===generation&&!timedOut)status[species]='failed';}).finally(()=>{finished=true;});
    const deadline=new Promise(resolve=>{
      timer=setTimeout(()=>{if(!finished){timedOut=true;controller.abort();if(epoch===generation)status[species]='timeout';}resolve();},budget);
    });
    await Promise.race([loading,deadline]);
    clearTimeout(timer);requests.delete(controller);
  })).then(()=>getSculptedPetsStatus());
  return pending;
}

function selectedColor(value) {
  // World persists hexadecimal colours. Ignore malformed external save values.
  return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)?new THREE.Color(value):null;
}

function recolorCoat(geometry, material, species, target) {
  if(!target)return;
  const base=MODELS[species].base;
  if(material.name==='Corgi honey'||material.name==='Silver tabby fur'){
    const colors=geometry.getAttribute('color');if(!colors)return;
    const selected=[target.r,target.g,target.b];
    // CoatPaint = base*(1-white) + cream*white - stripe. The artist painted
    // stripes equally into RGB; channel differences recover white independently.
    // Rebuild that same paint with the chosen coat, retaining cream toes/muzzle
    // and the tabby's darker bands instead of multiplying all markings by tint.
    const denominator=(CREAM[0]-CREAM[1])-(base[0]-base[1]);
    for(let i=0;i<colors.count;i++){
      const r=colors.getX(i),g=colors.getY(i);
      const white=THREE.MathUtils.clamp(((r-g)-(base[0]-base[1]))/denominator,0,1);
      const stripe=Math.max(0,base[0]*(1-white)+CREAM[0]*white-r);
      const shading=1-THREE.MathUtils.clamp(stripe/Math.max(.001,base[0]),0,.8);
      colors.setXYZ(i,...selected.map((channel,k)=>THREE.MathUtils.clamp(channel*(1-white)*shading+CREAM[k]*white,0,1)));
    }
    colors.needsUpdate=true;material.color.set(0xffffff);
  }else if(material.name==='Lid fur'){
    // Ears and tail use the artist's darker fur material; preserve that relation.
    material.color.setRGB(target.r*material.color.r/base[0],target.g*material.color.g/base[1],target.b*material.color.b/base[2]);
  }
}

// Paint the authored continuous surface in its rest pose. Positions are local
// glTF metres (Y up, Z forward), so markings follow the existing skin and rig.
function paintCatCoat(geometry,material,key,target){
  if(!CAT_COATS[key]||!['Silver tabby fur','Lid fur'].includes(material.name))return false;
  if(key==='ct_cheese')return false; // Keep the authored tabby bands and cream toes.
  const positions=geometry.getAttribute('position'),colors=geometry.getAttribute('color');
  if(!positions||!colors)return false;
  const coat=target||new THREE.Color(CAT_COATS[key]),white=new THREE.Color('#f2eadf');
  const orange=new THREE.Color('#cf8545'),black=new THREE.Color('#34313b');
  const smooth=(a,b,v)=>THREE.MathUtils.smoothstep(v,a,b);
  const patches=[
    [-.105,.590,.385,.110,.145,.125,orange],
    [.115,.605,.355,.110,.150,.115,black],
    [-.130,.370,-.095,.120,.155,.190,orange],
    [.135,.380,.025,.120,.170,.160,black],
    [.070,.435,-.250,.145,.130,.155,orange],
    [.045,.525,-.435,.100,.135,.130,black],
    [.065,.740,-.365,.100,.100,.145,orange]
  ];
  const result=new THREE.Color();
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i);
    result.copy(coat);
    if(key==='ct_tuxedo'){
      const socks=1-smooth(.080,.125,y);
      const bib=smooth(.10,.235,z)*(1-smooth(.36,.46,y));
      const muzzle=smooth(.365,.435,z)*(1-smooth(.535,.565,y));
      const blaze=(1-smooth(.012,.058,Math.abs(x)))*smooth(.395,.440,z)*smooth(.53,.60,y);
      result.lerp(white,Math.max(socks,bib,muzzle,blaze));
    }else if(key==='ct_calico'){
      // Asymmetric warm and charcoal patches, with a clear light chest and paws.
      for(const [cx,cy,cz,rx,ry,rz,color] of patches){
        const distance=Math.hypot((x-cx)/rx,(y-cy)/ry,(z-cz)/rz);
        const edge=distance+.045*Math.sin(x*89+y*51+z*37);
        result.lerp(color,(1-smooth(.83,1.03,edge))*smooth(.12,.18,y));
      }
    }
    colors.setXYZ(i,result.r,result.g,result.b);
  }
  colors.needsUpdate=true;material.vertexColors=true;material.color.set(0xffffff);
  return true;
}

/** Synchronous after preload. Unsupported or unavailable breeds use the old factory. */
export function buildSculptedPet(key,color) {
  const species=SPECIES[key],prototype=cache.get(species);
  if(!prototype)return null;
  const visual=cloneSkeleton(prototype), group=new THREE.Group(), tint=selectedColor(color)|| (CAT_COATS[key]?new THREE.Color(CAT_COATS[key]):null);
  const geometries=new Map(),materials=new Map(),skeletons=new Map();
  group.name='SculptedPet_'+key;group.add(visual);
  visual.traverse(node=>{
    if(!node.isMesh)return;
    if(!geometries.has(node.geometry))geometries.set(node.geometry,node.geometry.clone());
    node.geometry=geometries.get(node.geometry);
    const originals=Array.isArray(node.material)?node.material:[node.material];
    const copies=originals.map(original=>{
      if(!materials.has(original)){
        const material=original.clone();material.vertexColors=!!node.geometry.getAttribute('color');
        material.roughness=Math.max(.55,material.roughness??.8);material.metalness=0;
        if(!paintCatCoat(node.geometry,material,key,tint))recolorCoat(node.geometry,material,species,tint);materials.set(original,material);
      }
      return materials.get(original);
    });
    node.material=Array.isArray(node.material)?copies:copies[0];
    node.castShadow=node.receiveShadow=true;
    if(node.isSkinnedMesh){
      // Each primitive shares these cloned bones. Keep one palette per rig,
      // independent from every other pet and from the unloaded source scene.
      const signature=node.skeleton.bones.map(bone=>bone.uuid).join(':');
      if(skeletons.has(signature))node.skeleton=skeletons.get(signature);else skeletons.set(signature,node.skeleton);
      const skeleton=node.skeleton;
      node.geometry.addEventListener('dispose',()=>skeleton.dispose());
      // Animated extremities should not be clipped by a rest-pose frustum box.
      node.frustumCulled=false;
    }
  });
  visual.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(visual);
  const scale=MODELS[species].height/(bounds.max.y-bounds.min.y);
  visual.scale.multiplyScalar(scale);visual.position.y=-bounds.min.y*scale;
  group.userData.sculptedPet=key;group.userData.sculptedAsset=species;group.userData.worldPet=true;
  group.userData.breed=key;group.userData.tail=visual.getObjectByName('Tail');group.userData.head=visual.getObjectByName('Head');
  group.updateMatrixWorld(true);
  return group;
}

/** Release the source cache. Existing independent clones remain valid. */
export function disposeSculptedPets() {
  generation++;
  for(const request of requests)request.abort();requests.clear();
  for(const prototype of cache.values())release(prototype);cache.clear();
  status={dog:'unloaded',cat:'unloaded'};pending=null;
}
