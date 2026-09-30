import * as THREE from './vendor/three.module.js';
import { compactModel } from './compact.js';

export function placeViews({renderer,makeAvatar,registerLegacy,catalog,disposeGroup,box,cyl,sph,at,imgTex,hooks}) {
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-8,8,7,-7,.1,100);
  scene.add(new THREE.HemisphereLight('#fff8ed','#beb4d0',2));
  const sun=new THREE.DirectionalLight('#fff1da',2.2);sun.position.set(-3,14,9);scene.add(sun);
  const fill=new THREE.DirectionalLight('#e6e4ff',.55);fill.position.set(10,7,-3);scene.add(fill);
  const building=new THREE.Group(),actors=new Map(),props=new Map();scene.add(building);
  const labels=document.createElement('div');labels.className='place-labels';document.body.append(labels);
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
  let data=null,placeKey='',dirty=true,last=0,zoom=1,pointers=new Map(),down=null,pinch=null;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  function material(color){return new THREE.MeshStandardMaterial({color,roughness:.85});}
  function facing(prop){if(prop.back)return {a0:Math.PI/2,b0:-Math.PI/2,a1:0,b1:Math.PI}[prop.back]??0;return prop.r*Math.PI/2;}
  function solid(w,h,d,color,x,y,z){const m=box(w,h,d,color,.04);m.material.dispose();m.material=material(color);m.position.set(x,y,z);building.add(m);return m;}
  function fit(){const aspect=Math.max(.3,innerWidth/innerHeight),height=Math.max(6.4,8.15/aspect);camera.left=-height*aspect;camera.right=height*aspect;camera.top=height;camera.bottom=-height;camera.zoom=zoom;camera.position.set(23,17,23);camera.lookAt(5,1.25,5);camera.updateProjectionMatrix();dirty=true;}
  addEventListener('resize',fit);
  function clear(){for(const child of [...building.children])disposeGroup(child);for(const a of actors.values())disposeGroup(a.model);actors.clear();props.clear();labels.replaceChildren();}
  function sign(text,color,x,y,z,side=false){
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=160;const ctx=canvas.getContext('2d');
    ctx.fillStyle=color;ctx.fillRect(0,0,768,160);ctx.fillStyle='#fff9f1';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 66px system-ui';ctx.fillText(text,384,86);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.userData.generatedAvatar=true;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(3.7,.77),new THREE.MeshBasicMaterial({map:texture}));mesh.position.set(x,y,z);if(side)mesh.rotation.y=Math.PI/2;building.add(mesh);
  }
  function outdoorTree(small){const g=new THREE.Group();g.add(at(cyl(.095,.15,small?.3:1.25,'#b78b65',10),0,small?.15:.62,0));
    for(const [x,y,z,r] of (small?[[0,.42,0,.42],[-.26,.36,.02,.31],[.27,.38,-.03,.3]]:[[0,1.95,0,.69],[-.43,1.55,.04,.57],[.43,1.65,-.03,.57],[0,1.62,.39,.55]])){const leaf=sph(r,'#a3bd8b',16,12);leaf.position.set(x,y,z);g.add(leaf);}return g;}
  function build(next){
    clear();const park=next.id==='park',arcade=next.id==='arcade',cafe=next.id==='cafe';
    const floor=solid(10.3,.34,10.3,'#e5d4c3',5,-.18,5);floor.userData.placeFloor=true;
    const top=new THREE.Mesh(new THREE.PlaneGeometry(10,10),material('#fff8ed'));top.rotation.x=-Math.PI/2;top.position.set(5,.002,5);top.userData.placeFloor=true;building.add(top);
    if(park){top.material.map=imgTex('yard_lawn');top.material.needsUpdate=true;
      for(const [w,d,x,z] of [[2.3,10,5,5],[10,1.9,5,5]])solid(w,.025,d,'#edddc6',x,.012,z);
      for(const [x,z] of [[-.12,5],[10.12,5]])solid(.12,.16,10.3,'#f2e7d5',x,.06,z);
    }else{
      top.material.map=imgTex(arcade?'fl_check':'fl_wood',4,4);top.material.needsUpdate=true;
      const wall=arcade?'#dbd0ef':cafe?'#faebd8':'#eee9d9',trim=arcade?'#ad98d4':cafe?'#dbab90':'#9eadd5';
      solid(10.3,4.3,.24,wall,5,2.13,-.12);solid(.24,4.3,10.3,wall,-.12,2.13,5);
      for(const [w,d,x,z] of [[10.5,.38,5,-.12],[.38,10.5,-.12,5]]){solid(w,.18,d,trim,x,4.33,z);solid(w,.17,d,'#e2cfb4',x,.085,z);}
      sign(next.name,arcade?'#9d80c3':cafe?'#bd9272':'#7f93b2',5,3.69,.03);
      if(cafe){for(let i=0;i<8;i++){const canopy=solid(.41,.12,1.2,i%2?'#fff8e9':'#e9a897',6.7+i*.4,3.05,1.1);canopy.rotation.x=.13;solid(.41,.3,.10,i%2?'#fff8e9':'#e9a897',6.7+i*.4,2.92,1.67);}}
    }
    let treeIndex=0;
    for(const prop of next.props){
      const def=catalog[registerLegacy(prop.definition)];
      let model=park&&prop.type==='tree'?outdoorTree(treeIndex++>=3):def.build(prop.color||def.colors[0]);
      model=compactModel(model);const wall=prop.definition.kind==='wall';
      if(wall){if(prop.wall==='R'){model.position.set(prop.t,prop.z/32,.035);}else{model.position.set(.035,prop.z/32,prop.t);model.rotation.y=Math.PI/2;}}
      else{const [w,d]=prop.r%2?[def.d,def.w]:[def.w,def.d];model.position.set(prop.gx+w/2,0,prop.gy+d/2);model.rotation.y=facing(prop);}
      model.traverse(o=>o.userData.placeItem=prop.id);building.add(model);props.set(prop.id,model);
    }
    fit();dirty=true;
  }
  function pose(model,seat){if(!seat)return;for(const leg of model.userData.legs)leg.rotation.x=-Math.PI/2;for(const arm of model.userData.arms)arm.rotation.x=-.3;model.getObjectByName('legs').position.y=-(model.userData.legLen-.1);model.getObjectByName('upper').position.y=.1;}
  function sitting(person){if(!person.seat)return {y:0,yaw:null};const prop=data.props.find(p=>{if(p.definition.kind==='wall')return false;const d=catalog[registerLegacy(p.definition)],[w,h]=p.r%2?[d.d,d.w]:[d.w,d.d];return d.seat&&person.gx>=p.gx&&person.gx<p.gx+w&&person.gy>=p.gy&&person.gy<p.gy+h;});return {y:prop?catalog[registerLegacy(prop.definition)].seat:person.seat/32,yaw:prop?facing(prop):0};}
  function apply(next){
    data=next;document.documentElement.dataset.view='place';
    if(placeKey!==next.key){placeKey=next.key;zoom=1;build(next);}
    const present=new Set();
    for(const person of next.people){
      present.add(person.id);const seat=sitting(person),signature=JSON.stringify([person.avatar,!!person.seat]);let actor=actors.get(person.id);
      if(!actor||actor.signature!==signature){
        if(actor)disposeGroup(actor.model);const avatar=makeAvatar(person.avatar);pose(avatar,person.seat);
        const model=compactModel(avatar);model.traverse(o=>o.userData.placePerson=person.id);scene.add(model);
        actor={model,signature,x:person.gx+.5,z:person.gy+.5,y:seat.y,yaw:seat.yaw??.2};model.position.set(actor.x,actor.y,actor.z);model.rotation.y=actor.yaw;actors.set(person.id,actor);dirty=true;
      }
      const x=person.gx+.5,z=person.gy+.5,y=seat.y;
      if(x!==actor.x||z!==actor.z||y!==actor.y){actor.yaw=Math.atan2(x-actor.model.position.x,z-actor.model.position.z);actor.x=x;actor.z=z;actor.y=y;dirty=true;}
      if(seat.yaw!==null&&actor.model.rotation.y!==seat.yaw){actor.yaw=actor.model.rotation.y=seat.yaw;dirty=true;}
      actor.person=person;
    }
    for(const [id,actor] of actors)if(!present.has(id)){disposeGroup(actor.model);actors.delete(id);dirty=true;}
    const labelKey=JSON.stringify(next.bubbles);
    if(labels.dataset.key!==labelKey){labels.dataset.key=labelKey;dirty=true;}
  }
  function projected(position){const p=position.clone().project(camera);return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};}
  function overlay(){
    labels.replaceChildren();for(const [id,actor] of actors){const bubble=data.bubbles.find(b=>b.aid===id),mine=actor.person.isMe;
      if(!bubble&&!mine&&!actor.person.staff)continue;
      const p=projected(actor.model.position.clone().add(new THREE.Vector3(0,2.05,0))),tag=document.createElement('span');tag.className=bubble?'place-bubble':'place-name';tag.textContent=bubble?bubble.text:actor.person.name;tag.style.left=p.x+'px';tag.style.top=p.y+'px';labels.append(tag);
    }
  }
  function tick(now){
    if(!data)return false;if(now-last<32)return true;last=now;
    let moving=false;
    for(const actor of actors.values()){
      const p=actor.model.position,dist=Math.hypot(actor.x-p.x,actor.z-p.z),factor=reduced.matches?1:.26;
      if(dist>.012||Math.abs(actor.y-p.y)>.012){p.x+=(actor.x-p.x)*factor;p.z+=(actor.z-p.z)*factor;p.y=actor.y;actor.model.rotation.y=actor.yaw;moving=true;}
    }
    if(dirty||moving){renderer.render(scene,camera);overlay();dirty=false;}return true;
  }
  function hit(event){pointer.set(event.clientX/innerWidth*2-1,1-event.clientY/innerHeight*2);raycaster.setFromCamera(pointer,camera);return raycaster.intersectObjects([...actors.values()].map(a=>a.model).concat(building.children),true).find(h=>h.object.userData.placePerson||h.object.userData.placeItem||h.object.userData.placeFloor);}
  const canvas=renderer.domElement;
  function intercept(event){if(!data)return false;event.stopImmediatePropagation();if(event.cancelable)event.preventDefault();return true;}
  canvas.addEventListener('pointerdown',event=>{if(!intercept(event))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});canvas.setPointerCapture(event.pointerId);down={id:event.pointerId,x:event.clientX,y:event.clientY};if(pointers.size===2){const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),zoom};down=null;}},{capture:true});
  canvas.addEventListener('pointermove',event=>{if(!intercept(event)||!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(pinch&&pointers.size===2){const [a,b]=[...pointers.values()];zoom=Math.max(1,Math.min(2,pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance));fit();}},{capture:true});
  canvas.addEventListener('pointerup',event=>{if(!intercept(event))return;pointers.delete(event.pointerId);if(pinch){if(!pointers.size)pinch=null;return;}const start=down;down=null;if(!start||start.id!==event.pointerId||Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)return;const h=hit(event);if(h)hooks.onPlaceTap?.({person:h.object.userData.placePerson,item:h.object.userData.placeItem,x:h.point.x,z:h.point.z});},{capture:true});
  canvas.addEventListener('pointercancel',event=>{if(intercept(event)){pointers.clear();down=pinch=null;}},{capture:true});
  return {apply,tick,invalidate(){dirty=true;},active:()=>!!data,zoom(delta){zoom=delta?Math.max(1,Math.min(2,zoom+delta)):1;fit();},
    project(kind,id){if(kind==='floor')return projected(new THREE.Vector3(id.x,.03,id.z));const model=kind==='person'?actors.get(id)?.model:props.get(id);return model?projected(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3())):null;},
    inspect(){return data?{id:data.id,people:[...actors.keys()],props:[...props.keys()],calls:renderer.info.render.calls}:null;},
    dispose(){clear();labels.remove();removeEventListener('resize',fit);}};
}
