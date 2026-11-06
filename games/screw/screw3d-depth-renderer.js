/* Opaque 3D pixels use a depth buffer, not object/type painter ordering. */
export function createScrewDepthRenderer() {
  let surface=null,gl=null,program=null,buffer=null,context2d=null,lost=false,softwareFrame=null,softwareDepth=null;
  const colors=new Map();
  const rgb=value=>{
    if(colors.has(value))return colors.get(value);
    const m=/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)/.exec(value||'');
    const n=parseInt(String(value||'#CCCCCC').slice(1),16);
    const c=m?m.slice(1).map(Number):[n>>16&255,n>>8&255,n&255];colors.set(value,c);return c;
  };
  function init(){
    if(surface)return;
    if(typeof document==='undefined'||!document.createElement)return;
    surface=document.createElement('canvas');
    try{
      gl=surface.getContext('webgl',{alpha:true,antialias:true,depth:true,premultipliedAlpha:true});
      if(!gl)return;
      surface.addEventListener('webglcontextlost',()=>{lost=true;});
      const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('depth shader');return s;};
      program=gl.createProgram();
      const vs=shader(gl.VERTEX_SHADER,'attribute vec4 position;attribute vec4 color;varying lowp vec4 tint;void main(){gl_Position=position;tint=color;}');
      const fs=shader(gl.FRAGMENT_SHADER,'precision lowp float;varying lowp vec4 tint;void main(){gl_FragColor=tint;}');
      gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);
      gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('depth program');
      buffer=gl.createBuffer();
    }catch(_){gl=null;}
  }
  function software(c,items,target,opacity,top,bottom){
    if(typeof document==='undefined')return false;
    if(!context2d){surface=document.createElement('canvas');context2d=surface.getContext('2d');}
    if(!context2d)return false;
    // A no-WebGL phone still gets real occlusion, at logical resolution.
    // Doubling both axes would quadruple CPU work for the same touch grid.
    const scale=1;
    const width=Math.round(360*scale),height=Math.round((bottom-top)*scale);
    if(surface.width!==width||surface.height!==height){surface.width=width;surface.height=height;}
    if(!softwareFrame||softwareFrame.data.length!==width*height*4){softwareFrame=context2d.createImageData(width,height);softwareDepth=new Float32Array(width*height);}
    const frame=softwareFrame,depth=softwareDepth,data=frame.data;data.fill(0);depth.fill(0);
    for(const translucent of [false,true])for(const it of translucent?items:items.slice().sort((a,b)=>(b.z||0)-(a.z||0))){
      const alpha=it.alpha*(it.owner===target?opacity:1);if((alpha<.999)!==translucent)continue;
      for(const pg of it.polys){
        if(!pg.depth)continue;
        for(let k=1;k<pg.pts.length-1;k++){
          const ids=[0,k,k+1],p=ids.map(i=>pg.pts[i]),cs=ids.map(i=>rgb(pg.colors?.[i]||pg.fill));
          const area=(p[1].x-p[0].x)*(p[2].y-p[0].y)-(p[1].y-p[0].y)*(p[2].x-p[0].x);
          if(Math.abs(area)<1e-9)continue;
          const x0=Math.max(0,Math.floor(Math.min(...p.map(v=>v.x))*scale));
          const x1=Math.min(width-1,Math.ceil(Math.max(...p.map(v=>v.x))*scale));
          const y0=Math.max(0,Math.floor((Math.min(...p.map(v=>v.y))-top)*scale));
          const y1=Math.min(height-1,Math.ceil((Math.max(...p.map(v=>v.y))-top)*scale));
          for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
            const px=(x+.5)/scale,py=(y+.5)/scale+top;
            const z=pg.depth[0]*px+pg.depth[1]*py+pg.depth[2],id=y*width+x;
            if(z<=0||z<depth[id]-1e-7)continue;
            const a=((p[1].x-px)*(p[2].y-py)-(p[1].y-py)*(p[2].x-px))/area;
            const b=((p[2].x-px)*(p[0].y-py)-(p[2].y-py)*(p[0].x-px))/area,cw=1-a-b;
            if(a<0||b<0||cw<0)continue;
            const at=id*4,old=data[at+3]/255,outAlpha=alpha+old*(1-alpha);
            for(let channel=0;channel<3;channel++){
              const value=a*cs[0][channel]+b*cs[1][channel]+cw*cs[2][channel];
              data[at+channel]=(value*alpha+data[at+channel]*old*(1-alpha))/(outAlpha||1);
            }
            data[at+3]=outAlpha*255;if(!translucent)depth[id]=z;
          }
        }
      }
    }
    context2d.putImageData(frame,0,0);c.drawImage(surface,0,top,360,bottom-top);return true;
  }
  return {
    draw(c,items,target,opacity,top,bottom){
      init();if(!surface)return false;
      if(!gl||lost)return software(c,items,target,opacity,top,bottom);
      const scale=Math.min(2,Math.max(1,(c.canvas?.width||360)/360));
      const width=Math.round(360*scale),height=Math.round((bottom-top)*scale);
      if(surface.width!==width||surface.height!==height){surface.width=width;surface.height=height;}
      gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clearDepth(1);
      gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      const pos=gl.getAttribLocation(program,'position'),col=gl.getAttribLocation(program,'color');
      gl.enableVertexAttribArray(pos);gl.enableVertexAttribArray(col);
      gl.vertexAttribPointer(pos,4,gl.FLOAT,false,32,0);gl.vertexAttribPointer(col,4,gl.FLOAT,false,32,16);
      for(const translucent of [false,true]){
        const data=[];
        for(const it of items){
          const alpha=it.alpha*(it.owner===target?opacity:1);if((alpha<.999)!==translucent)continue;
          for(const pg of it.polys){
            if(!pg.depth)continue;
            for(let k=1;k<pg.pts.length-1;k++)for(const i of [0,k,k+1]){
              const p=pg.pts[i],inverse=pg.depth[0]*p.x+pg.depth[1]*p.y+pg.depth[2];
              const w=1/Math.max(1e-8,inverse),color=rgb(pg.colors?.[i]||pg.fill);
              // Inverse eye distance is affine in screen space. Perspective
              // clip coordinates preserve it for exact hardware depth tests.
              data.push((p.x/180-1)*w,(1-2*(p.y-top)/(bottom-top))*w,w-.02,w,
                color[0]/255,color[1]/255,color[2]/255,alpha);
            }
          }
        }
        gl.depthMask(!translucent);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.DYNAMIC_DRAW);
        gl.drawArrays(gl.TRIANGLES,0,data.length/8);
      }
      c.drawImage(surface,0,top,360,bottom-top);return true;
    },
    destroy(){if(gl){if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);}
      surface=null;gl=null;buffer=null;program=null;context2d=null;softwareFrame=null;softwareDepth=null;}
  };
}
