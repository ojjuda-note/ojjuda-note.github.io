import * as THREE from './vendor/three.module.min.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {WHEEL_ORDER,COLOR} from './engine.js';
import {planSpinMotion,sampleSpinMotion,wheelSurface} from './motion.js?v=20261031-roulette-smooth1';

const TAU=Math.PI*2,STEP=TAU/37,HALF=Math.PI/2;
const clamp=v=>Math.min(1,Math.max(0,v));
function texture(size,draw){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;draw(canvas.getContext('2d'),size);
  const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;map.anisotropy=4;return map;
}
function walnutTexture(){return texture(512,(c,s)=>{
  c.fillStyle='#512d1c';c.fillRect(0,0,s,s);
  for(let y=0;y<s;y++){
    const g=Math.sin(y*.24+Math.sin(y*.021)*7),v=Math.round(50+g*12+Math.sin(y*.91)*4);
    c.strokeStyle=`rgb(${v+37},${v+6},${v-12})`;c.lineWidth=1;c.beginPath();
    for(let x=0;x<=s;x+=8){const yy=y+Math.sin(x*.016+y*.008)*2.5;x?c.lineTo(x,yy):c.moveTo(x,yy)}c.stroke();
  }
})}
function numberTexture(){return texture(2048,(c,s)=>{
  const k=s/10;c.translate(s/2,s/2);c.scale(k,k);
  for(let i=0;i<37;i++){
    const a=i*STEP-HALF-STEP/2,b=a+STEP,n=WHEEL_ORDER[i];
    c.beginPath();c.arc(0,0,3.71,a,b);c.arc(0,0,3.21,b,a,true);c.closePath();
    c.fillStyle=COLOR(n)==='red'?'#8f2432':n===0?'#18764e':'#10221c';c.fill();
    c.save();c.rotate(i*STEP);c.fillStyle='#f5ead1';c.textAlign='center';c.textBaseline='middle';c.font='600 .245px Georgia';c.fillText(String(n),0,-3.465);c.restore();
  }
})}
// Real annular geometry. Printed numbers and pocket indices use the same axis.
function annulus(r0,r1,y0,y1,start=0,end=TAU,segments=160){
  const p=[],uv=[],idx=[];
  for(let i=0;i<=segments;i++)for(const [r,y] of [[r0,y0],[r1,y1]]){
    const a=start+(end-start)*i/segments,x=Math.cos(a)*r,z=Math.sin(a)*r;p.push(x,y,z);uv.push(.5+x/10,.5-z/10);
  }
  for(let i=0;i<segments;i++){const j=i*2;idx.push(j,j+2,j+1,j+1,j+2,j+3)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g;
}


export class Wheel3D{
  constructor(canvas,{onTick=()=>{},onPhase=()=>{},onDone=()=>{},onFrame=()=>{},context=null}={}){
    this.canvas=canvas;this.onTick=onTick;this.onPhase=onPhase;this.onDone=onDone;this.onFrame=onFrame;
    this.rotation=.2;this.ballAngle=-1.3;this.ballRadius=396;this.ballHeight=0;
    this.visible=false;this.active=null;this.reduced=false;this.raf=0;this.lastPhase='';this.lastImpact=0;
    this.renderer=new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.75));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.scene=new THREE.Scene();
    // Fixed oblique camera. No controls, automatic orbit, zoom, shake or parallax.
    this.camera=new THREE.PerspectiveCamera(36,1,.1,60);this.camera.position.set(0,8.5,10.8);this.camera.lookAt(0,.1,0);
    const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);
    this.environment=pmrem.fromScene(environment,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.75;environment.dispose();pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xffeed1,0x0b241b,1.25));
    const key=new THREE.DirectionalLight(0xffe6b7,3.4);key.position.set(-4,9,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);
    Object.assign(key.shadow.camera,{left:-5,right:5,top:5,bottom:-5,near:1,far:22});key.shadow.bias=-.00035;key.shadow.normalBias=.025;key.shadow.radius=3;this.scene.add(key);
    const rim=new THREE.DirectionalLight(0xbad6e5,1.5);rim.position.set(5,5,-5);this.scene.add(rim);
    this.build();this.canvas.dataset.renderer='webgl';this.canvas.parentElement.classList.add('is-3d');
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(canvas);
    this.contextLost=false;canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true});canvas.addEventListener('webglcontextrestored',()=>{this.contextLost=false;this.draw()});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(this.active||this.visible))this.schedule()});this.resize();
  }
  mesh(geometry,material,parent=this.scene){const m=new THREE.Mesh(geometry,material);m.receiveShadow=true;parent.add(m);return m}
  ring(radius,tube,y,material,parent=this.scene){const m=this.mesh(new THREE.TorusGeometry(radius,tube,12,192),material,parent);m.rotation.x=HALF;m.position.y=y;return m}
  lathe(points,material,parent=this.scene){return this.mesh(new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),160),material,parent)}
  build(){
    const woodMap=walnutTexture(),gold=new THREE.MeshStandardMaterial({color:0xc4a16b,metalness:.88,roughness:.24});
    const darkGold=new THREE.MeshStandardMaterial({color:0x796346,metalness:.85,roughness:.34});
    const walnut=new THREE.MeshPhysicalMaterial({map:woodMap,color:0xdec9ad,roughness:.34,metalness:.04,clearcoat:.85,clearcoatRoughness:.2});
    const black=new THREE.MeshStandardMaterial({color:0x10221a,roughness:.48,metalness:.15});
    const felt=new THREE.MeshStandardMaterial({color:0x102c23,roughness:1});
    const ground=this.mesh(new THREE.CircleGeometry(7.2,96),felt);ground.rotation.x=-HALF;ground.position.y=-.26;
    this.lathe([[0,-.2],[4.15,-.2],[4.42,-.09],[4.54,.09],[4.59,.36],[4.57,.62],[4.49,.81],[4.34,.86],[4.17,.78],[4.08,.68]],walnut);
    this.ring(4.52,.027,.14,gold);this.ring(4.585,.022,.39,darkGold);this.ring(4.50,.035,.77,gold);this.ring(4.16,.037,.76,gold);
    this.mesh(annulus(3.8,4.10,.625,.715),darkGold);this.mesh(annulus(3.70,3.8,.435,.625),black);
    this.ring(4.065,.024,.70,gold);this.ring(3.80,.018,.625,gold);
    for(let i=0;i<8;i++){
      const a=i*TAU/8+.1,deflector=this.mesh(new THREE.OctahedronGeometry(.074),gold);
      deflector.position.set(Math.cos(a)*3.9,.68,Math.sin(a)*3.9);deflector.scale.set(.7,.6,1.6);deflector.rotation.y=-a;deflector.castShadow=true;
    }
    this.rotor=new THREE.Group();this.scene.add(this.rotor);
    this.mesh(new THREE.CylinderGeometry(3.72,3.72,.20,160),black,this.rotor).position.y=.10;
    const bandMaterial=new THREE.MeshStandardMaterial({map:numberTexture(),roughness:.48,metalness:.12});
    this.mesh(annulus(3.215,3.70,.435,.435),bandMaterial,this.rotor);
    const pockets={red:new THREE.MeshStandardMaterial({color:0x741e2b,metalness:.2,roughness:.46}),black:new THREE.MeshStandardMaterial({color:0x101b17,metalness:.2,roughness:.46}),green:new THREE.MeshStandardMaterial({color:0x126240,metalness:.2,roughness:.46})};
    for(let i=0;i<37;i++)this.mesh(annulus(2.66,3.20,.245,.245,i*STEP-HALF-STEP/2,i*STEP-HALF+STEP/2,5),pockets[COLOR(WHEEL_ORDER[i])],this.rotor);
    const dividers=new THREE.InstancedMesh(new THREE.BoxGeometry(.028,.17,.55),gold,37),matrix=new THREE.Object3D();
    for(let i=0;i<37;i++){const a=i*STEP-HALF-STEP/2;matrix.position.set(Math.cos(a)*2.93,.33,Math.sin(a)*2.93);matrix.rotation.y=HALF-a;matrix.updateMatrix();dividers.setMatrixAt(i,matrix.matrix)}
    dividers.castShadow=true;dividers.receiveShadow=true;this.rotor.add(dividers);
    this.ring(3.205,.025,.42,gold,this.rotor);this.ring(3.705,.018,.445,gold,this.rotor);this.ring(2.655,.031,.35,gold,this.rotor);
    this.lathe([[2.64,.32],[2.58,.28],[2.15,.36],[1.4,.53],[.75,.69],[.52,.75],[0,.75]],walnut,this.rotor);
    this.ring(.76,.025,.69,gold,this.rotor);this.ring(2.59,.022,.33,gold,this.rotor);
    const pedestal=this.lathe([[0,.73],[.38,.73],[.43,.80],[.32,.85],[.22,1.12],[.25,1.18],[.18,1.29],[0,1.35]],gold,this.rotor);pedestal.castShadow=true;
    for(let i=0;i<4;i++){
      const a=i*HALF+.32,arm=this.mesh(new THREE.CylinderGeometry(.042,.065,1.17,12),gold,this.rotor);
      arm.position.set(Math.cos(a)*.66,.90,Math.sin(a)*.66);arm.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(Math.cos(a),-.07,Math.sin(a)).normalize());arm.castShadow=true;
      const knob=this.mesh(new THREE.SphereGeometry(.10,16,10),gold,this.rotor);knob.position.set(Math.cos(a)*1.27,.86,Math.sin(a)*1.27);knob.castShadow=true;
    }
    const cap=this.mesh(new THREE.SphereGeometry(.19,24,16),gold,this.rotor);cap.position.y=1.34;cap.scale.y=.6;cap.castShadow=true;
    this.ball=this.mesh(new THREE.SphereGeometry(.099,24,18),new THREE.MeshPhysicalMaterial({color:0xfff7de,metalness:.06,roughness:.17,clearcoat:1,clearcoatRoughness:.09}));this.ball.castShadow=true;
    const shadowMap=texture(128,(c,s)=>{const g=c.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,'#0009');g.addColorStop(.3,'#0007');g.addColorStop(1,'#0000');c.fillStyle=g;c.fillRect(0,0,s,s)});
    this.contactShadow=this.mesh(new THREE.PlaneGeometry(.38,.38),new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false}));this.contactShadow.rotation.x=-HALF;this.contactShadow.renderOrder=3;
  }
  resize(){const width=this.canvas.clientWidth,height=this.canvas.clientHeight;if(!width||!height)return;this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.draw()}
  setReduced(value){this.reduced=value;if(this.visible)this.draw()}
  setVisible(value){this.visible=value;if(value){this.resize();this.schedule()}}
  schedule(){if(!this.raf)this.raf=requestAnimationFrame(t=>this.frame(t))}
  start(spin){this.active={...spin,plan:planSpinMotion(spin,this.rotation,this.ballAngle,{reduced:this.reduced}),startTime:performance.now()-(Date.now()-spin.startedAt)};this.lastPhase='';this.lastImpact=0;this.lastTick=performance.now();this.schedule();return this.active}
  showResult(n){this.active=null;this.ballRadius=291;this.ballHeight=0;this.ballAngle=this.rotation+WHEEL_ORDER.indexOf(n)*STEP-HALF;this.draw()}
  frame(now){
    this.raf=0;
    if(this.active){
      const a=this.active,p=clamp((now-a.startTime)/a.duration),pose=sampleSpinMotion(a.plan,p);
      this.onFrame(p,pose);this.rotation=pose.rotation;this.ballAngle=pose.angle;this.ballRadius=pose.radius;this.ballHeight=pose.height;
      if(pose.phase!==this.lastPhase){this.lastPhase=pose.phase;this.onPhase(pose.phase)}
      if(pose.impact>this.lastImpact){this.onTick(p,pose.impactStrength);this.lastImpact=pose.impact;this.lastTick=now}
      if(p>.02&&p<.94&&now-this.lastTick>45+280*p*p){this.onTick(p,false);this.lastTick=now}
      this.draw();if(p>=1){this.active=null;this.onDone(a.id)}
    }
    if(this.active&&!document.hidden)this.schedule();
  }
  draw(){
    if(!this.rotor||this.contextLost)return;this.rotor.rotation.y=-this.rotation;
    const r=this.ballRadius/100,a=this.ballAngle,ground=wheelSurface(this.ballRadius)/100,lift=this.ballHeight/100;
    this.ball.position.set(Math.cos(a)*r,ground+.10+lift,Math.sin(a)*r);this.ball.rotation.set(a*2,0,-a*3);
    this.contactShadow.position.set(this.ball.position.x+lift*.18,ground+.004,this.ball.position.z+lift*.12);this.contactShadow.scale.setScalar(1+lift*1.4);this.contactShadow.material.opacity=Math.max(.12,.8-lift*.8);
    this.renderer.render(this.scene,this.camera);
  }
}
