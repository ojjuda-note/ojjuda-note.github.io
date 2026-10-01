import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import { clone as cloneSkeleton } from './vendor/SkeletonUtils.js';
import { dressAvatar } from './avatar-wardrobe.js?v=20261001-wardrobe1';

export const SCULPTED_STYLE='sculpted-v20';
export function usesSculptedAvatar(){return true;}
const url=new URL('./assets/models/premium_avatar.glb',import.meta.url);
let prototype=null,pending=null,controller=null,generation=0,status='unloaded';

function release(root){
  const geometries=new Set(),materials=new Set(),skeletons=new Set();
  root?.traverse(node=>{if(node.geometry)geometries.add(node.geometry);if(node.skeleton)skeletons.add(node.skeleton);for(const m of(Array.isArray(node.material)?node.material:[node.material]))if(m)materials.add(m);});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const s of skeletons)s.dispose();
}
export function avatarAssetStatus(){return status;}
export function preloadSculptedAvatar({timeoutMs=5500}={}){
  if(pending)return pending;
  const epoch=generation,budget=Math.max(1,Math.min(5500,Number.isFinite(timeoutMs)?timeoutMs:5500));
  controller=new AbortController();const request=controller;status='loading';
  let expired=false,timer;
  const loading=(async()=>{
    const response=await fetch(url,{signal:request.signal,credentials:'same-origin'});
    if(!response.ok)throw new Error('Avatar unavailable');
    const buffer=await response.arrayBuffer();if(expired||epoch!==generation)return;
    const gltf=await new GLTFLoader().parseAsync(buffer,new URL('.',url).href);
    if(expired||epoch!==generation){release(gltf.scene);return;}
    if(!gltf.scene.getObjectByName('Hips')||!gltf.scene.getObjectByName('Head')){release(gltf.scene);throw new Error('Invalid avatar rig');}
    prototype=gltf.scene;status='ready';
  })().catch(()=>{if(!expired&&epoch===generation)status='failed';});
  const deadline=new Promise(resolve=>{timer=setTimeout(()=>{expired=true;request.abort();if(epoch===generation)status='timeout';resolve();},budget);});
  pending=Promise.race([loading,deadline]).then(()=>{clearTimeout(timer);if(controller===request)controller=null;return status;});
  return pending;
}
export function disposeSculptedAvatar(){generation++;controller?.abort();controller=null;release(prototype);prototype=null;pending=null;status='unloaded';}

/** Every wardrobe choice uses the same authored face, body and skeleton. */
export function buildSculptedAvatar(config,options={}){
  config={skin:'#ffe3d0',hairColor:'#5a3a2e',topColor:'#9db7f5',bottomColor:'#3a3f66',hair:'bob',face:'calm',top:'tee',bottom:'pants',shoes:'sneakers',acc:'none',...config};
  if(!usesSculptedAvatar(config)||!prototype)return null;
  const group=new THREE.Group(),visual=cloneSkeleton(prototype),bones={},rest={},materials=new Map(),geometries=new Map(),skeletons=new Map();
  group.name='SculptedAvatar';group.add(visual);
  visual.traverse(node=>{
    if(node.isBone){bones[node.name]=node;rest[node.name]={position:node.position.clone(),quaternion:node.quaternion.clone()};}
    if(!node.isMesh)return;
    if(!geometries.has(node.geometry))geometries.set(node.geometry,node.geometry.clone());node.geometry=geometries.get(node.geometry);
    const originals=Array.isArray(node.material)?node.material:[node.material];
    const copies=originals.map(source=>{
      if(!materials.has(source)){
        const material=source.clone(),key={skin:'skin',hair:'hairColor',top:'topColor',bottom:'bottomColor'}[source.name.split('.')[0]];
        if(key&&typeof config[key]==='string'&&/^#[0-9a-f]{6}$/i.test(config[key]))material.color.set(config[key]);
        material.roughness=Math.max(.65,material.roughness??.85);material.metalness=0;materials.set(source,material);
      }return materials.get(source);
    });
    node.material=Array.isArray(node.material)?copies:copies[0];node.castShadow=node.receiveShadow=true;node.frustumCulled=false;
    if(node.skeleton){const key=node.skeleton.bones.map(b=>b.uuid).join(':');if(skeletons.has(key))node.skeleton=skeletons.get(key);else skeletons.set(key,node.skeleton);const skeleton=node.skeleton;node.geometry.addEventListener('dispose',()=>skeleton.dispose());}
  });
  const wardrobe=dressAvatar({visual,bones,config,makeAccessories:options.makeAccessories});
  const legs=new THREE.Group(),upper=new THREE.Group(),head=new THREE.Group();
  legs.name='legs';upper.name='upper';upper.position.y=.528;head.position.y=1.285;
  group.add(legs,upper,head);
  // A non-rendering head bound gives the shared portrait camera a stable crop.
  const bounds=wardrobe.bounds.clone();bounds.min.y=Math.min(bounds.min.y,1.02);const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const headBound=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z),new THREE.MeshBasicMaterial());headBound.position.copy(center).sub(head.position);headBound.visible=false;headBound.raycast=()=>{};head.add(headBound);
  function control(parent,x,y){const node=new THREE.Group();node.position.set(x,y,0);parent.add(node);return node;}
  const legControls=[control(legs,-.13,.528),control(legs,.13,.528)];
  const armControls=[control(upper,-.285,.44),control(upper,.285,.44)];
  for(const arm of armControls){const sleeve=new THREE.Group();sleeve.name='sleeve';sleeve.position.y=-.18;arm.add(sleeve);arm.userData.sleeveLength=.36;}
  let pose='stand',phase=0,walking=false;
  function face(mood){wardrobe.setFace(mood);}
  function syncPose(){
    for(const [name,bone] of Object.entries(bones)){bone.position.copy(rest[name].position);bone.quaternion.copy(rest[name].quaternion);}
    bones.Hips.position.y+=legs.position.y;
    bones.Head.rotation.copy(head.rotation);
    for(let i=0;i<2;i++){
      const side=i===0?'R':'L',leg=legControls[i],arm=armControls[i];
      bones['Leg_'+side].rotation.copy(leg.rotation);bones['Arm_'+side].rotation.copy(arm.rotation);
      bones['Knee_'+side].rotation.x=pose==='sit'?Math.PI/2:Math.max(0,leg.rotation.x)*.5;
      bones['Ankle_'+side].rotation.x=pose==='sit'?0:-Math.max(0,leg.rotation.x)*.32;
      bones['Elbow_'+side].rotation.x=pose==='sit'?-.18:-Math.abs(arm.rotation.x)*.22;
    }
    wardrobe.setPose(pose);group.updateMatrixWorld(true);
  }
  function setPose(next,{lift=0}={}){
    pose=next;group.rotation.x=next==='lie'?-Math.PI/2:0;
    group.position.y=next==='lie'?lift+.32:next==='sit'?lift:0;
    legs.position.y=next==='sit'?-(.528-.1):0;upper.position.y=next==='sit'?.1:.528;
    for(const leg of legControls)leg.rotation.set(next==='sit'?-Math.PI/2:0,0,0);
    for(const arm of armControls)arm.rotation.set(next==='sit'?-.35:0,0,0);
    face(next==='lie'?'sleep':config.face);syncPose();
  }
  function walk(distance){
    if(pose!=='stand')return false;
    const changed=walking||distance>.0001;walking=distance>.0001;
    if(distance>.0001){phase+=distance*Math.PI*2/1.05;const swing=Math.sin(phase)*.58;
      legControls[0].rotation.x=swing;legControls[1].rotation.x=-swing;
      armControls[0].rotation.x=-swing*.65;armControls[1].rotation.x=swing*.65;
    }else{for(const limb of [...legControls,...armControls])limb.rotation.x=0;}
    syncPose();return changed;
  }
  Object.assign(group.userData,{sculptedAvatar:true,wardrobe:{hair:config.hair,face:config.face,top:config.top,bottom:config.bottom,shoes:config.shoes,acc:config.acc},legs:legControls,arms:armControls,head,legLen:.528,syncPose,setPose,setFace:face,walk});
  group.traverse(node=>{node.userData.avatar=true;});syncPose();return group;
}
