import numpy as np,json,pathlib
from scipy.optimize import least_squares
import argparse
parser=argparse.ArgumentParser(description="Recalibrate the complete left sofa against all 40 sampled room poses. Requires NumPy and SciPy.")
parser.add_argument("output",type=pathlib.Path)
args=parser.parse_args()
p=pathlib.Path(__file__).parent;root=p.parent
r=json.load(open(root/'house-test/assets/sofa-registration-v7.runtime.json'));v=r['views']['left'];m=v['mesh'];a=m['anchors'];src=np.array([[q['source'][k] for k in ('x','y')] for q in a]);orig=np.array([[q['world'][k] for k in ('x','y','z')] for q in a]);ids=np.array(m['indices']);S=np.stack([src[ids[:,1]]-src[ids[:,0]],src[ids[:,2]]-src[ids[:,0]]],axis=-1);inv=np.linalg.inv(S)
# Use the room's existing floor/ceiling homography, no separate camera.
G=0.;H=-566/1482
A=916;B=12*(1+H)-293;C=293;E=910*(1+H)-614;F=614
poses=np.array([[x,y] for x in (0,.5,1,1.5,2) for y in (0,.5,1,1.5,2,2.5,3,3.5)])
def project(w):
 x=(w[None,:,0]+poses[:,None,0])/10;y=(w[None,:,1]+poses[:,None,1])/7;den=1+H*y
 fx=(A*x+B*y+C)/den;fy=(E*y+F)/den
 cx=(916*x+B*y+293)/den;cy=((55*(1+H)-200)*y+200)/den
 z=w[None,:,2]/4.5
 return np.stack([fx+(cx-fx)*z,fy+(cy-fy)*z],axis=-1)
# Keep physical contact heights at zero; recalibrate contact XY within the footprint.
# Vertical arm edges share XY, and sampled wooden shaft centres align to their feet.
fixed=set()
mask=np.ones(orig.shape,dtype=bool);mask[list(fixed),:]=False
mask[:16,2]=False
mask[[6,7],:2]=False
lo=orig.copy();hi=orig.copy();lo[:,:2]-=.65;hi[:,:2]+=.65;lo[:,2]-=.2;hi[:,2]+=.2
lo[:3,:2]=np.maximum(orig[:3,:2]-.3,0);hi[:3,0]=np.minimum(orig[:3,0]+.3,1.5);hi[:3,1]=np.minimum(orig[:3,1]+.3,3.5)
lo[:,0]=np.maximum(lo[:,0],-.2);hi[:,0]=np.minimum(hi[:,0],1.65);lo[:,1]=np.maximum(lo[:,1],-.2);hi[:,1]=np.minimum(hi[:,1],3.65)
# Source triangle size weights, capped so outer support triangles also stay stable.
weights=np.array(json.load(open(p/'sofa-left-calibration-weights.json'))['union']);weight=np.sqrt(np.maximum(weights/np.mean(weights),.03))
def unpack(t):
 w=orig.copy();w[mask]=t;w[6,:2]=w[8,:2];w[7,:2]=w[9,:2];return w
def source_row(pt):
 for ii,tri in enumerate(ids):
  uv=inv[ii]@(np.array(pt)-src[tri[0]])
  if min(uv)>=-1e-8 and sum(uv)<=1+1e-8:
   row=np.zeros(len(src));row[tri]=[1-sum(uv),*uv];return row
 raise ValueError("Source sample is outside the registered image")
# Compare the visible face centre at both ends; the floor anchor is not its centre.
legrows=[source_row([85,952])-source_row([84,1016])]
for pt,foot in [([710,1040],1),([1307,630],2)]:
 row=source_row(pt);row[foot]-=1;legrows.append(row)
legrows=np.array(legrows)
frame_rows=np.array([source_row([170+t*450,972+t*62]) for t in np.linspace(0,1,9)])
def fun(t):
 w=unpack(t);q=project(w);T=np.stack([q[:,ids[:,1]]-q[:,ids[:,0]],q[:,ids[:,2]]-q[:,ids[:,0]]],axis=-1);M=T@inv;u=M[:,:,:,0];vv=M[:,:,:,1];nu=np.sum(u*u,axis=-1);nv=np.sum(vv*vv,axis=-1);uv=np.sum(u*vv,axis=-1);det=np.linalg.det(M);scale=np.sqrt(np.maximum(nu+nv,.0001)*np.maximum(det,.0001))
 shape=np.stack([(nu-nv)/scale,2*uv/scale],axis=-1)*weight[None,:,None]
 fold=np.maximum(.004-det,0)*150
 reg=(w-orig)[mask]*.15
 vertical=(q[:,:,0]@legrows.T)*8
 line=np.einsum('sn,pnd->psd',frame_rows,q);edge=line[:,-1]-line[:,0];delta=line[:,1:-1]-line[:,0,None,:]
 straight=(edge[:,None,0]*delta[:,:,1]-edge[:,None,1]*delta[:,:,0])/np.maximum(np.linalg.norm(edge,axis=-1)[:,None],1)*8
 cap=np.maximum((nu+nv)/np.maximum(det,.0001)-(3.5+1/3.5),0)*weight*20
 return np.concatenate([shape.ravel(),fold.ravel(),reg,vertical.ravel(),straight.ravel(),cap.ravel()])
res=least_squares(fun,orig[mask],bounds=(lo[mask],hi[mask]),max_nfev=180,ftol=1e-6)
w=unpack(res.x)
for i,q in enumerate(a):q['world']=dict(zip(('x','y','z'),w[i].tolist()))
v.pop('partMeshes',None)
args.output.write_text(json.dumps(r,separators=(',',':'),ensure_ascii=False));print('cost',res.cost,'iterations',res.nfev,'max_move',np.max(abs(w-orig)))
