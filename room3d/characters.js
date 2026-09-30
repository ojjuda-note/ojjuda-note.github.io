import * as THREE from './vendor/three.module.js';

// One model factory is shared by the room, dressing room and pet care scenes.
// This module renders only; all selections, purchases and pet stats belong to World.
export function characterViews({renderer,makeAvatar,registerLegacy,catalog,disposeGroup,box,cyl,sph,at}) {
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,30);
  scene.add(new THREE.HemisphereLight('#fff8ee','#b4adc9',2.2));
  const key=new THREE.DirectionalLight('#fff0d8',2.1);key.position.set(-3,6,5);scene.add(key);
  const fill=new THREE.DirectionalLight('#e2e2ff',.6);fill.position.set(4,3,-2);scene.add(fill);
  const group=new THREE.Group();scene.add(group);
  let data=null,signature='',avatar=null,pet=null,base=null,food=null,action=null,yaw=.25,last=0,dirty=true;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function fit(){
    const aspect=Math.max(.2,innerWidth/Math.max(1,innerHeight)),height=data?.kind==='pet'?2.9:2.65;
    camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2;camera.bottom=-height/2;
    camera.position.set(0,2.7,6);camera.lookAt(0,.95,0);camera.updateProjectionMatrix();dirty=true;
  }
  addEventListener('resize',fit);
  function clear(){for(const child of [...group.children])disposeGroup(child);avatar=pet=base=food=null;}
  function plant(x,z){const p=new THREE.Group();p.add(at(cyl(.13,.10,.24,'#efddc8',16),0,.12,0));for(let i=0;i<5;i++){const leaf=sph(.14,i%2?'#9fb78b':'#80a991',12,8);leaf.scale.set(.45,1.3,.7);leaf.position.set(Math.sin(i*2.4)*.09,.34+(i%2)*.06,Math.cos(i*2.4)*.09);leaf.rotation.z=Math.sin(i)*.6;p.add(leaf);}p.position.set(x,0,z);group.add(p);}
  function apply(next){
    const key=JSON.stringify(next);data=next;
    if(key===signature)return;signature=key;action=null;clear();
    document.documentElement.dataset.view=next.kind;
    base=at(cyl(next.kind==='pet'?1.95:1.15,next.kind==='pet'?1.98:1.18,.12,'#f1e5d9',64),0,-.085,0);group.add(base);
    const rug=at(cyl(next.kind==='pet'?1.7:.88,next.kind==='pet'?1.7:.88,.014,'#d8ccea',64),0,-.015,0);group.add(rug);
    avatar=makeAvatar(next.avatar);avatar.position.set(next.kind==='pet'?-.68:0,0,0);avatar.rotation.y=next.kind==='pet'?.2:yaw;group.add(avatar);
    if(next.kind==='pet'&&next.pet){
      const definition=catalog[registerLegacy(next.pet.definition)];pet=definition.build(next.pet.color||definition.colors[0]);
      const bounds=new THREE.Box3().setFromObject(pet),size=bounds.getSize(new THREE.Vector3());
      const scale=Math.min(1.25,1.15/Math.max(.4,size.y),1.25/Math.max(.4,size.x,size.z));pet.scale.multiplyScalar(scale);
      pet.position.set(.64,-bounds.min.y*scale,.08);pet.rotation.y=-.23;pet.userData.restY=pet.position.y;group.add(pet);
      plant(-1.36,-.35);plant(1.45,-.32);
      food=new THREE.Group();food.add(at(cyl(.17,.13,.09,'#d4b4d9',24),0,.045,0),at(cyl(.13,.13,.016,'#ae8062',24),0,.092,0));food.position.set(.64,0,.65);food.visible=false;group.add(food);
    }else{plant(.77,-.25);}
    fit();render();
  }
  function render(){renderer.render(scene,camera);dirty=false;}
  function react(name){if(!data)return;action={name,start:performance.now()};dirty=true;}
  function tick(now){
    if(!data)return false;
    if(now-last<40)return true;last=now;
    if(!avatar)return true;
    const [left,right]=avatar.userData.arms;
    if(action){
      const age=(now-action.start)/1000,phase=reduced.matches?0:Math.sin(age*9);
      right.rotation.z=.9+Math.abs(phase)*.22;right.rotation.x=-.1;
      if(pet)avatar.position.x=-.35;
      if(pet){pet.position.y=pet.userData.restY+(['play','sing','wave','sun'].includes(action.name)?Math.abs(phase)*.16:0);pet.rotation.z=['pat','look'].includes(action.name)?phase*.06:0;food.visible=['feed','seed','cricket','jelly'].includes(action.name);}
      if(age>2.6){action=null;right.rotation.set(0,0,0);if(pet){avatar.position.x=-.68;pet.position.y=pet.userData.restY;pet.rotation.z=0;}if(food)food.visible=false;dirty=true;}
      if(!reduced.matches||dirty)render();
    }else if(dirty)render();
    // A settled preview is a still frame: no permanent GPU loop for idle cards.
    return true;
  }
  const portraitScene=new THREE.Scene();portraitScene.add(new THREE.HemisphereLight('#fff8ee','#b4adc9',2.2));
  const portraitLight=new THREE.DirectionalLight('#fff0d8',2.1);portraitLight.position.set(-3,6,5);portraitScene.add(portraitLight);
  const portraitCamera=new THREE.OrthographicCamera(-.53,.53,.49,-.49,.1,10);portraitCamera.position.set(0,1.45,5);portraitCamera.lookAt(0,1.43,0);
  const target=new THREE.WebGLRenderTarget(144,144,{depthBuffer:true});target.texture.colorSpace=THREE.SRGBColorSpace;
  const pixels=new Uint8Array(144*144*4),canvas=document.createElement('canvas');canvas.width=canvas.height=144;const context=canvas.getContext('2d');
  function portrait(config){
    const model=makeAvatar(config);portraitScene.add(model);
    const oldTarget=renderer.getRenderTarget(),oldShadow=renderer.shadowMap.enabled;
    try{renderer.shadowMap.enabled=false;renderer.setRenderTarget(target);renderer.clear();renderer.render(portraitScene,portraitCamera);renderer.readRenderTargetPixels(target,0,0,144,144,pixels);
      const image=context.createImageData(144,144);for(let y=0;y<144;y++)image.data.set(pixels.subarray((143-y)*576,(144-y)*576),y*576);context.putImageData(image,0,0);return canvas.toDataURL('image/png');
    }finally{renderer.setRenderTarget(oldTarget);renderer.shadowMap.enabled=oldShadow;disposeGroup(model);dirty=true;}
  }
  return {apply,tick,portrait,react,active:()=>!!data,rotate(delta){if(data?.kind==='avatar'&&avatar){yaw+=delta;avatar.rotation.y=yaw;dirty=true;}},
    inspect(){return data?{kind:data.kind,avatar:{...data.avatar},pet:data.pet?.type,action:action?.name||null}:null;},
    dispose(){clear();target.dispose();removeEventListener('resize',fit);}};
}
