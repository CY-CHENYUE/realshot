import * as T from 'three';
import {ENCLOSURE} from './enclosure-profile.mjs';

// CAD window, viewed from a fixed eye normal to its center. No inner canvas
// stretch/crop: source UV and final visible aperture UV are the same.
export class EnclosureSpace{
 constructor(camera,depth){
  this.depth=depth;this.camera=camera;
  const a=ENCLOSURE.aperture,{distance:eye}=ENCLOSURE.designEye,n=a.normal,u=a.up,c=a.center;
  this.eye=eye;this.rearDistance=(ENCLOSURE.cavity.rearY-c[1])/n[1];
  this.scale=depth/(eye+this.rearDistance);
  const h=Math.tan(T.MathUtils.degToRad(camera.fov/2));
  const sx=this.scale*2*h*camera.aspect*eye/a.width,sy=this.scale*2*h*eye/a.height;
  const centerUp=c.reduce((s,v,i)=>s+v*u[i],0);
  this.matrix=new T.Matrix4().set(sx,0,0,-sx*c[0],0,sy*u[1],sy*u[2],-sy*centerUp,0,-this.scale*n[1],-this.scale*n[2],this.scale*(a.planeD-eye),0,0,0,1);
 }
 world(point,out=new T.Vector3()){return out.fromArray(point).applyMatrix4(this.matrix);}
 wallDepth(uv){
  const a=ENCLOSURE.aperture,y=(.5-uv.y)*a.height;
  return this.depth/(1+y*a.up[1]/(this.eye*a.normal[1]));
 }
 sourceOnRear(uv){
  const a=ENCLOSURE.aperture;
  const x=(uv.x-.5)*a.width,y=(.5-uv.y)*a.height;
  const t=(this.eye+this.rearDistance)/(this.eye+y*a.up[1]/a.normal[1]);
  const z=this.eye*(1-t);
  return a.center.map((c,i)=>c+(i===0?t*x:0)+t*y*a.up[i]-z*a.normal[i]);
 }
 project(point){
  const p=this.world(point).project(this.camera),uv={x:(p.x+1)/2,y:(1-p.y)/2};
  return {uv,visibleUV:{...uv}};
 }
}
