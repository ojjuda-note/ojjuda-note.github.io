import * as THREE from './vendor/three.module.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

// Ground, stairs and fence share world coordinates so resizing cannot separate them.
export function buildCourtyard(size, lawnTexture) {
  const yard=new THREE.Group();yard.name='courtyard';
  const groundY=-.8,left=-1.6,right=size+1.6,back=-1.6,front=size+2.95;
  const entrance=size*.6875,gateHalf=1.16;
  const material=color=>new THREE.MeshStandardMaterial({color,roughness:1});
  const stone=material('#f2e1d0'),earth=material('#e2d5bf');
  function slab(w,h,d,x,y,z,mat,r=.03){
    const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,r),mat);
    mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;yard.add(mesh);return mesh;
  }
  slab(right-left,.24,front-back,(left+right)/2,groundY-.12,(back+front)/2,earth,.09).name='yard-base';
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(right-left-.02,front-back-.02),new THREE.MeshStandardMaterial({map:lawnTexture,color:'#ffffff',roughness:1}));
  ground.name='yard-lawn';ground.rotation.x=-Math.PI/2;ground.position.set((left+right)/2,groundY+.004,(back+front)/2);ground.receiveShadow=true;yard.add(ground);

  const stairs=new THREE.Group();stairs.name='entrance-stairs';yard.add(stairs);
  for(let i=0;i<4;i++){
    const top=-.16*(i+1),height=top-groundY;
    const step=slab(2.1,height,.43,entrance,groundY+height/2,size+.34+i*.38,stone,.015);
    stairs.attach(step);
  }
  for(let i=0;i<2;i++)slab(2.04,.045,.59,entrance,groundY+.025,size+1.99+i*.62,stone,.035).name='yard-path';

  // Instanced rails/posts keep the quiet perimeter inexpensive to draw.
  const rails=[],caps=[];
  function fence(x1,z1,x2,z2){
    const length=Math.hypot(x2-x1,z2-z1),count=Math.max(1,Math.ceil(length/1.55));
    for(let i=0;i<=count;i++){
      const x=x1+(x2-x1)*i/count,z=z1+(z2-z1)*i/count;
      rails.push([.12,.67,.12,x,groundY+.335,z]);
      caps.push([.17,.055,.17,x,groundY+.697,z]);
    }
    for(const height of [.22,.5])rails.push([Math.abs(x2-x1)+.09,.09,Math.abs(z2-z1)+.09,(x1+x2)/2,groundY+height,(z1+z2)/2]);
  }
  const fenceLeft=left+.2,fenceRight=right-.2,fenceBack=back+.2,fenceFront=front-.2;
  fence(fenceLeft,fenceBack,fenceRight,fenceBack);
  fence(fenceLeft,fenceBack,fenceLeft,fenceFront);
  fence(fenceRight,fenceBack,fenceRight,fenceFront);
  fence(fenceLeft,fenceFront,entrance-gateHalf,fenceFront);
  fence(entrance+gateHalf,fenceFront,fenceRight,fenceFront);
  for(const [parts,color,name] of [[rails,'#f9efdf','courtyard-fence'],[caps,'#d4c0db','fence-caps']]){
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material(color),parts.length);
    const transform=new THREE.Object3D();
    parts.forEach(([w,h,d,x,y,z],i)=>{transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);});
    mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;yard.add(mesh);
  }
  return yard;
}
