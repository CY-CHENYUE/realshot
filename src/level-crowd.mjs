import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// RealShot r24 · the crowd on screen: instanced ice-shell soldiers (three draw
// batches for every live soldier and body), rigid bodies thrown by hits and
// blasts, armour shards and hit sparks. Procedural geometry only; the pose of a
// live soldier is read straight from the rules (`game.crowd`), so the view
// keeps only what the rules do not: bodies, shards, sparks and swing timing.
const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
const HIP=.9,SHOULDER=1.4,UP=new T.Vector3(0,1,0);
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};

const prep=g=>{const n=g.index?g.toNonIndexed():g;for(const k of Object.keys(n.attributes))if(!['position','normal','uv'].includes(k))n.deleteAttribute(k);return n;};
const place=(g,{p=[0,0,0],r=[0,0,0]}={})=>{g.rotateX(r[0]);g.rotateY(r[1]);g.rotateZ(r[2]);g.translate(...p);return prep(g);};
// one bevel step: plates read as chamfered armour and cost about a third of a two-step rounded box
const rbox=(w,h,d,rad)=>new RoundedBoxGeometry(w,h,d,1,rad);
// a soldier faces +z with its feet at y=0; the upper body pivots at the hip
function soldierGeometry(){
 const dark=[
  place(rbox(.36,.2,.24,.04),{p:[0,.93,0]}),
  place(new T.CylinderGeometry(.13,.15,.16,12),{p:[0,1.06,0]}),
  place(rbox(.5,.44,.32,.07),{p:[0,1.26,-.01]}),
  place(rbox(.34,.36,.15,.04),{p:[0,1.26,-.22]}),
  place(new T.CylinderGeometry(.055,.065,.1,10),{p:[0,1.52,0]}),
  place(rbox(.25,.25,.27,.06),{p:[0,1.63,0]}),
 ];
 const pale=[
  place(rbox(.46,.28,.1,.04),{p:[0,1.31,.14],r:[-.12,0,0]}),
  place(rbox(.21,.12,.27,.04),{p:[.33,1.44,0],r:[0,0,-.32]}),
  place(rbox(.21,.12,.27,.04),{p:[-.33,1.44,0],r:[0,0,.32]}),
  place(rbox(.29,.11,.31,.05),{p:[0,1.74,-.01]}),
  place(rbox(.2,.14,.05,.02),{p:[0,1.0,.13]}),
 ];
 const glow=[
  place(new T.BoxGeometry(.2,.045,.02),{p:[0,1.645,.137]}),
  place(new T.CylinderGeometry(.045,.045,.02,14),{p:[0,1.3,.196],r:[Math.PI/2-.12,0,0]}),
  place(new T.BoxGeometry(.03,.16,.02),{p:[0,1.26,-.3]}),
 ];
 // a limb hangs from its pivot along -y: armoured capsule, a pad and a boot (or fist) block
 const limbDark=[place(new T.CapsuleGeometry(.075,.64,3,8),{p:[0,-.42,0]}),place(rbox(.13,.09,.2,.03),{p:[0,-.84,.035]})];
 const limbPale=[place(rbox(.15,.17,.12,.03),{p:[0,-.4,.055]})];
 return {
  upper:mergeGeometries([mergeGeometries(dark),mergeGeometries(pale)],true),
  glow:mergeGeometries(glow),
  limb:mergeGeometries([mergeGeometries(limbDark),mergeGeometries(limbPale)],true),
 };
}

// ---------- r26: generated soldiers ----------
// Three robots made with Lux3D (text-to-3D), cut offline into five rigid parts (upper body, two legs, two arms
// re-rested to hang from the shoulder) at three levels of detail: assets/crowd/<kind>.json + .bin, with the
// albedo, roughness/metal and glow maps beside them. The build script lives with the project's local tools.
export const CROWD_KINDS=['trooper','brute','bomber'];
const PARTS=['upper','legP','legN','armP','armN'];
// r27 · legs with knees and feet that hold the ground. A leg is still one mesh: the vertex shader folds it at the knee and
// the ankle (and an arm at the elbow) by the angles in the per-instance attribute aBend. The run is not a swing of the whole
// leg any more: the sole follows a path (planted while it carries the body, lifted and carried forward otherwise) and the
// hip, knee and ankle are solved for it, so a foot on the ground stays where it was put.
//  knee/ankle/elbow: metres below the joint (model at scale 1) · hip: hip height while running, as a share of the leg
//  step: metres the body travels over one planted foot · duty: share of the cycle a foot is planted (under .5 = both feet off the ground between steps)
//  lift: how high the foot is carried · kick: how far it trails behind after pushing off · relax: ankle angle while the foot is in the air
//  toe: ankle-to-toe length · arm/fore: arm swing and elbow bend · apart: how far the feet stand apart at rest
export const GAIT={
 trooper:{knee:.40,ankle:.68,elbow:.40,hip:.885,step:.68,duty:.31,lift:.17,kick:.55,relax:.25,bounce:.028,toe:.12,arm:.7,fore:-1.25,apart:.15},
 brute:{knee:.42,ankle:.64,elbow:.30,hip:.9,step:.64,duty:.46,lift:.06,kick:0,relax:-.4,bounce:.022,toe:.17,arm:.38,fore:-.3,apart:.2},
 bomber:{knee:.38,ankle:.87,elbow:.28,hip:.875,step:.88,duty:.25,lift:.22,kick:.6,relax:.25,bounce:.034,toe:.13,arm:0,fore:0,apart:.12},
};
export const gaitCycle=kind=>GAIT[kind].step/GAIT[kind].duty;   // metres (at scale 1) per full cycle of both legs
const frac=x=>x-Math.floor(x),sm=x=>{x=x<0?0:x>1?1:x;return x*x*(3-2*x);};
const TOE_OFF=.55;
// where the sole is at phase p of its cycle: o.z ahead of the hip joint, o.y above the ground, o.pitch toe down, o.air = share of the swing done (-1 while planted)
function footPath(G,p,k,o){
 const D=G.duty,S=G.step*k;
 if(p<D){const u=p/D;o.z=S*(.5-u);o.pitch=TOE_OFF*k*sm((u-.6)/.4);o.y=G.toe*Math.sin(o.pitch);o.air=-1;}
 else{const u=(p-D)/(1-D),ov=G.kick*S*(1-D)/(6.2832*D);
  o.z=-S*.5*Math.cos(Math.PI*u)-ov*Math.sin(6.2832*u);
  o.y=G.lift*k*Math.sin(Math.PI*Math.pow(u,.7))+G.toe*Math.sin(TOE_OFF*k)*(1-sm(u/.35));
  o.pitch=TOE_OFF*k*(1-sm(u/.3));o.air=u;}
 return o;
}
// two-bone solve in the leg's own plane. RotX turns a hanging limb backward for a positive angle, so the thigh goes forward
// on a negative one and the shin folds back on a positive one.
function solveLeg(G,L,hipH,z,y,pitch,out,A){
 const hF=L-G.ankle,a=G.knee,b=G.ankle-G.knee,az=z+hF*Math.sin(pitch),dy=y+hF*Math.cos(pitch)-hipH;
 const r=clamp(Math.hypot(az,dy),Math.abs(a-b)+.02,(a+b)*.998);
 const hip=-(Math.atan2(az,-dy)+Math.acos(clamp((a*a+r*r-b*b)/(2*a*r),-1,1))),knee=Math.PI-Math.acos(clamp((a*a+b*b-r*r)/(2*a*b),-1,1));
 if(A){out.legA=hip;out.kneeA=knee;out.ankA=pitch-hip-knee;}else{out.legB=hip;out.kneeB=knee;out.ankB=pitch-hip-knee;}
}
const BEND_GLSL=`attribute vec2 aBend;uniform vec4 uJoint;
vec2 bendAt(float y){return aBend*vec2(1.-smoothstep(uJoint.x-.055,uJoint.x+.055,y),1.-smoothstep(uJoint.z-.035,uJoint.z+.035,y));}
vec3 bendX(vec3 p,vec2 o,float a){float c=cos(a),s=sin(a);vec2 d=p.yz-o;return vec3(p.x,o.x+c*d.x-s*d.y,o.y+s*d.x+c*d.y);}
`;
const BEND_POS='{vec2 b=bendAt(position.y);transformed=bendX(bendX(transformed,uJoint.zw,b.y),uJoint.xy,b.x);}';
const NO_JOINT=new T.Vector4(-100,0,-100,0);
// z of the limb's axis at a height: the pivot sits in the middle of the joint, not on the part's origin
function axisZ(g,y){const p=g.attributes.position;let lo=1e9,hi=-1e9;for(let i=0;i<p.count;i++){if(Math.abs(p.getY(i)-y)>.03)continue;const z=p.getZ(i);if(z<lo)lo=z;if(z>hi)hi=z;}return hi>=lo?(lo+hi)/2:0;}
export async function loadCrowdModels(base='/assets/crowd/',kinds=CROWD_KINDS){
 const loader=new T.TextureLoader(),tex=async(url,srgb)=>{const t=await loader.loadAsync(url);t.flipY=false;t.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;t.anisotropy=4;return t;};
 const out={};
 await Promise.all(kinds.map(async kind=>{
  const [meta,bin]=await Promise.all([fetch(`${base}${kind}.json`).then(r=>{if(!r.ok)throw new Error(`${kind}.json ${r.status}`);return r.json();}),fetch(`${base}${kind}.bin`).then(r=>{if(!r.ok)throw new Error(`${kind}.bin ${r.status}`);return r.arrayBuffer();})]);
  const lods=meta.lods.map(l=>l.parts.map(p=>{const g=new T.BufferGeometry();
   g.setAttribute('position',new T.BufferAttribute(new Float32Array(bin,p.position,p.vertices*3),3));
   g.setAttribute('normal',new T.BufferAttribute(new Int8Array(bin,p.normal,p.vertices*3),3,true));
   g.setAttribute('uv',new T.BufferAttribute(new Float32Array(bin,p.uv,p.vertices*2),2));
   g.setIndex(new T.BufferAttribute(p.wide?new Uint32Array(bin,p.index,p.tris*3):new Uint16Array(bin,p.index,p.tris*3),1));return g;}));
  // each level has its own maps: the reduced levels were re-baked onto a clean atlas
  const G=GAIT[kind],leg=lods[0][1],arm=lods[0][3];
  const joints=[NO_JOINT,new T.Vector4(-G.knee,axisZ(leg,-G.knee),-G.ankle,axisZ(leg,-G.ankle+.03)),new T.Vector4(-G.elbow,axisZ(arm,-G.elbow),-100,0)];
  // per-instance glow: visors pulse on a bomber, flare on a swing and go out on a body
  // vEye: metres in front of the lens. A soldier pressed against the camera thins out in a dither instead of filling the frame.
  const patch=(material,joint)=>{
   material.onBeforeCompile=sh=>{sh.uniforms.uJoint={value:joint};
    sh.vertexShader='attribute float aGlow;varying float vGlow;varying float vEye;\n'+BEND_GLSL+sh.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\n{vec2 b=bendAt(position.y);objectNormal=bendX(objectNormal,vec2(0.),b.x+b.y);}').replace('#include <begin_vertex>','#include <begin_vertex>\nvGlow=aGlow;'+BEND_POS).replace('#include <project_vertex>','#include <project_vertex>\nvEye=-mvPosition.z;');
    sh.fragmentShader='varying float vGlow;varying float vEye;\n'+sh.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\n{float keep=smoothstep(.4,1.05,vEye);if(keep<1.&&fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))))>keep)discard;}').replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance*=vGlow;');};
   material.customProgramCacheKey=()=>'soldier-glow-bend';return material;};
  // the shadow pass folds the limbs the same way
  const depths=joints.map((joint,j)=>{if(!j)return null;const d=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});d.name=`soldier / ${kind} shadow ${j===1?'leg':'arm'}`;
   d.onBeforeCompile=sh=>{sh.uniforms.uJoint={value:joint};sh.vertexShader=BEND_GLSL+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+BEND_POS);};d.customProgramCacheKey=()=>'soldier-bend-shadow';return d;});
  // each level has its own maps: the reduced levels were re-baked onto a clean atlas
  const sets=await Promise.all(meta.lods.map(async(l,i)=>{const [map,orm,glow]=await Promise.all([tex(`${base}${kind}${l.tex}-albedo.jpg`,true),tex(`${base}${kind}${l.tex}-orm.jpg`,false),tex(`${base}${kind}${l.tex}-glow.jpg`,true)]);
   return joints.map((joint,j)=>patch(new T.MeshStandardMaterial({name:`soldier / ${kind} lod${i}${['',' leg',' arm'][j]}`,map,roughnessMap:orm,metalnessMap:orm,emissiveMap:glow,emissive:'#ffffff',roughness:.92,metalness:.55}),joint));}));
  // materials: one per level (the body's), kept for whoever warms the textures; partMaterials/partDepth: per level, per part
  const materials=sets.map(m=>m[0]),partMaterials=sets.map(m=>[m[0],m[1],m[1],m[2],m[2]]),partDepth=[null,depths[1],depths[1],depths[2],depths[2]];
  out[kind]={meta,lods,materials,partMaterials,partDepth};
 }));
 return out;
}
const LOD_NEAR=6,LOD_MID=24,LOD0_CAP=24;
const GLOW_GAIN={trooper:3.2,brute:4.2,bomber:1.5};

const TINT={trooper:new T.Color(1,1,1),brute:new T.Color(.72,.76,.86),bomber:new T.Color(1.25,.78,.55)};
const GLOW={trooper:new T.Color('#62dcff').multiplyScalar(1.6),brute:new T.Color('#ff3d2e').multiplyScalar(1.7),bomber:new T.Color('#ff8a2a').multiplyScalar(2.2)};
const DEAD_GLOW=new T.Color('#1a2026');

export class CrowdView{
 constructor(scene,{alive=240,bodies=220}={}){
  this.scene=scene;this.max=alive+bodies;this.bodyCap=bodies;
  const geo=soldierGeometry();this.geo=geo;
  const dark=new T.MeshStandardMaterial({name:'soldier / gunmetal frame',color:'#283038',roughness:.46,metalness:.6});
  const pale=new T.MeshStandardMaterial({name:'soldier / frost shell',color:'#d5e1e8',roughness:.34,metalness:.12});
  const glow=new T.MeshBasicMaterial({name:'soldier / visor',color:'#ffffff',toneMapped:false});
  this.mats={dark,pale,glow};
  const mk=(g,m,n,shadow)=>{const im=new T.InstancedMesh(g,m,n);im.instanceMatrix.setUsage(T.DynamicDrawUsage);im.frustumCulled=false;im.castShadow=shadow;im.receiveShadow=false;
   for(let i=0;i<n;i++)im.setColorAt(i,TINT.trooper);im.instanceColor.setUsage(T.DynamicDrawUsage);im.count=0;scene.add(im);return im;};
  this.upper=mk(geo.upper,[dark,pale],this.max,true);this.upper.name='crowd / upper bodies';
  this.glow=mk(geo.glow,glow,this.max,false);this.glow.name='crowd / visors';
  this.limbs=mk(geo.limb,[dark,pale],this.max*4,true);this.limbs.name='crowd / limbs';
  this.bodies=[];this.swing=new Map();this.gait=new Map();this.gaitFromRules=false;this.foot={z:0,y:0,pitch:0,air:0};this.models=null;this.sets=null;this.forceLod=-1;this.eye=new T.Vector3();this.near0=new Set();this.forward=null;/* forward: the camera's view direction, set by the page each frame */
  this.M=new T.Matrix4();this.U=new T.Matrix4();this.A=new T.Matrix4();this.B=new T.Matrix4();this.R=new T.Matrix4();
  this.q=new T.Quaternion();this.p=new T.Vector3();this.s=new T.Vector3();this.c=new T.Color();this.g=new T.Color();this.tmpQ=new T.Quaternion();this.axis=new T.Vector3();
 }
 // r26: swap the box soldiers for the generated ones. One instanced mesh per kind, level of detail and part;
 // the five parts of a set share their colour and glow buffers.
 useModels(models){
  this.models=models;this.sets={};
  for(const kind of Object.keys(models)){const {lods,materials,meta}=models[kind];
   const {partMaterials,partDepth}=models[kind];
   this.sets[kind]=lods.map((parts,lod)=>{const cap=lod===0?LOD0_CAP:this.max,color=new T.InstancedBufferAttribute(new Float32Array(cap*3).fill(1),3).setUsage(T.DynamicDrawUsage),glow=new T.InstancedBufferAttribute(new Float32Array(cap),1).setUsage(T.DynamicDrawUsage);
    // aBend: [knee, ankle] on a leg, [elbow, -] on an arm, nothing on the body (one still buffer)
    const bend=parts.map((g,p)=>new T.InstancedBufferAttribute(new Float32Array(cap*2),2).setUsage(p?T.DynamicDrawUsage:T.StaticDrawUsage));
    const meshes=parts.map((g,p)=>{g.setAttribute('aGlow',glow);g.setAttribute('aBend',bend[p]);const im=new T.InstancedMesh(g,partMaterials[lod][p],cap);im.name=`crowd / ${kind} ${PARTS[p]} lod${lod}`;im.instanceMatrix.setUsage(T.DynamicDrawUsage);im.instanceColor=color;im.frustumCulled=false;im.castShadow=lod<2||p===0;if(partDepth[p])im.customDepthMaterial=partDepth[p];im.receiveShadow=false;im.count=0;this.scene.add(im);return im;});
    return {meshes,color,glow,bend,cap,n:0,meta,lod,kind};});}
  this.upper.count=this.glow.count=this.limbs.count=0;this.upper.visible=this.glow.visible=this.limbs.visible=false;
 }
 // The full-detail level has a fixed number of slots per kind. They go to whoever is nearest in front of the
 // camera (a horde wraps round the player: handing them out in list order left the soldier in your face blurry).
 _pickNear(crowd){
  const near=this.near0;near.clear();if(this.forceLod>=0)return;
  const e=this.eye,f=this.forward,by={};
  const offer=(o,kind,x,y,z,scale)=>{const dx=x-e.x,dy=y-e.y,dz=z-e.z,d=Math.hypot(dx,dy,dz);if(d/scale>=LOD_NEAR)return;
   const ahead=d<1.6||!f||(dx*f.x+dy*f.y+dz*f.z)>d*.3;if(!ahead)return;/* behind the lens: the mid level is plenty for a shadow */(by[kind]??(by[kind]=[])).push({o,k:d});};
  for(const m of crowd)if(!m.dead)offer(m,m.kind,m.x,m.y+m.scale,m.z,m.scale);
  for(const b of this.bodies)if(b.age<5)offer(b,b.kind,b.x,b.y,b.z,b.s*2.6);/* the fallen come after the living, and only while they are still tumbling or fresh */
  for(const kind of Object.keys(by)){const list=by[kind],cap=this.sets[kind]?.[0].cap??0;if(list.length>cap)list.sort((a,b)=>a.k-b.k);for(let i=0;i<Math.min(cap,list.length);i++)near.add(list[i].o);}
 }
 _lod(kind,x,y,z,scale,o){
  const sets=this.sets[kind];if(this.forceLod>=0)return sets[Math.min(this.forceLod,sets.length-1)];
  const d=Math.hypot(x-this.eye.x,y-this.eye.y,z-this.eye.z)/scale;
  let l=this.near0.has(o)?0:d<(o.rest?LOD_NEAR:LOD_MID)?1:2;if(l===0&&sets[0].n>=sets[0].cap)l=1;if(sets[l].n>=sets[l].cap)return null;return sets[l];
 }
 _writeModel(set,root,pose,tint,glow){
  const {U,A,B,R}=this,i=set.n++,m=set.meshes,J=set.meta.joints,hip=set.meta.hip;
  U.copy(root).multiply(R.makeTranslation(0,hip+pose.bob,0)).multiply(A.makeRotationX(pose.lean)).multiply(R.makeTranslation(0,-hip,0));
  m[0].setMatrixAt(i,U);
  B.copy(root).multiply(R.makeTranslation(J.legP[0],J.legP[1]+pose.bob,J.legP[2])).multiply(A.makeRotationX(pose.legA));m[1].setMatrixAt(i,B);
  B.copy(root).multiply(R.makeTranslation(J.legN[0],J.legN[1]+pose.bob,J.legN[2])).multiply(A.makeRotationX(pose.legB));m[2].setMatrixAt(i,B);
  const b=set.bend,j=i*2;b[1].array[j]=pose.kneeA;b[1].array[j+1]=pose.ankA;b[2].array[j]=pose.kneeB;b[2].array[j+1]=pose.ankB;b[3].array[j]=pose.elbA;b[4].array[j]=pose.elbB;
  B.copy(U).multiply(R.makeTranslation(J.armP[0],J.armP[1],J.armP[2])).multiply(A.makeRotationZ(pose.spread)).multiply(R.makeRotationX(pose.armA));m[3].setMatrixAt(i,B);
  B.copy(U).multiply(R.makeTranslation(J.armN[0],J.armN[1],J.armN[2])).multiply(A.makeRotationZ(-pose.spread)).multiply(R.makeRotationX(pose.armB));m[4].setMatrixAt(i,B);
  tint.toArray(set.color.array,i*3);set.glow.array[i]=glow;
 }
 // pose = {bob, lean, legA, legB, armA, armB, spread}
 _write(i,root,pose,tint,glow){
  const {U,A,B,R}=this;
  U.copy(root).multiply(R.makeTranslation(0,HIP+pose.bob,0)).multiply(A.makeRotationX(pose.lean)).multiply(R.makeTranslation(0,-HIP,0));
  this.upper.setMatrixAt(i,U);this.glow.setMatrixAt(i,U);this.upper.setColorAt(i,tint);this.glow.setColorAt(i,glow);
  const k=i*4;
  for(const [n,side,ang] of [[0,1,pose.legA],[1,-1,pose.legB]]){B.copy(root).multiply(R.makeTranslation(.12*side,HIP+pose.bob*.5,0)).multiply(A.makeRotationX(ang));this.limbs.setMatrixAt(k+n,B);this.limbs.setColorAt(k+n,tint);}
  for(const [n,side,ang] of [[2,1,pose.armA],[3,-1,pose.armB]]){B.copy(U).multiply(R.makeTranslation(.31*side,SHOULDER,0)).multiply(A.makeRotationZ(pose.spread*side)).multiply(R.makeRotationX(ang)).multiply(A.makeScale(.78,.72,.78));this.limbs.setMatrixAt(k+n,B);this.limbs.setColorAt(k+n,tint);}
 }
 // r27: the generated soldiers. rec = this soldier's own stride record {p: metres walked, v: speed}; out.slope = rise of the ground ahead.
 _gaitPose(m,time,rec,out){
  const kind=m.kind,G=GAIT[kind],L=this.models[kind].meta.joints.legP[1],D=G.duty,f=this.foot,slope=out.slope;
  const k=clamp(rec.v/(2.2*m.scale),0,1),p=frac(rec.p/(m.scale*G.step/D)),q=frac(p+.5),s=Math.sin(6.2832*(p-D*.5));
  // the hip rides lowest over a planted foot and highest between two steps; standing, the feet are set apart
  const hipH=L*lerp(.955,G.hip,k)-G.bounce*k*Math.cos(12.5664*(p-D*.5)),still=(1-k)*G.apart;
  out.bob=hipH-L;out.lean=(kind==='bomber'?.48:kind==='brute'?.14:.26)*k;out.spread=.1;
  footPath(G,p,k,f);solveLeg(G,L,hipH,f.z+still,f.y+slope*(f.z+still),f.pitch,out,true);if(f.air>=0)out.ankA=lerp(out.ankA,G.relax,sm(f.air/.25)*(1-sm((f.air-.6)/.4)));
  footPath(G,q,k,f);solveLeg(G,L,hipH,f.z-still,f.y+slope*(f.z-still),f.pitch,out,false);if(f.air>=0)out.ankB=lerp(out.ankB,G.relax,sm(f.air/.25)*(1-sm((f.air-.6)/.4)));
  // arms: each goes forward with the opposite leg, elbows folded while running
  if(kind==='bomber'){out.armA=out.armB=lerp(-.2,1.0,k)+s*.12*k;out.spread=.25;out.elbA=out.elbB=-.25*k;}
  else{out.armA=lerp(-.3,.08,k)-s*G.arm*k;out.armB=lerp(-.3,.08,k)+s*G.arm*k;out.elbA=G.fore*k*(1+.18*s)-.12;out.elbB=G.fore*k*(1-.18*s)-.12;}
  const swing=this.swing.get(m.id);
  if(m.state==='rise'){const u=clamp((time-m.bornAt)/m.riseDur,0,1),w=1-u;out.armA=lerp(-2.6,-.4,u)+Math.sin(time*9+m.id)*.2;out.armB=lerp(-2.4,-.4,u)-Math.sin(time*9+m.id)*.2;out.elbA=-.7*w;out.elbB=-.5*w;out.lean=lerp(.6,.1,u);
   // climbing out: one knee drawn up, the other leg pushing
   out.legA=lerp(-1.25,out.legA,u);out.kneeA=lerp(1.7,out.kneeA,u);out.ankA=lerp(-.3,out.ankA,u);out.legB=lerp(.15,out.legB,u);out.kneeB=lerp(.55,out.kneeB,u);out.ankB=lerp(.4,out.ankB,u);out.bob*=u;}
  else if(m.state==='attack'){const K=kind==='brute'?.7:kind==='bomber'?.25:.42,u=clamp((time-m.attackAt)/K,0,1),e=u*u*(3-2*u);out.armA=out.armB=lerp(-.3,-2.7,e);out.elbA=out.elbB=lerp(-.2,-.75,e);out.lean=-.18*e;out.spread=.18;if(kind==='bomber'){out.armA=out.armB=-2.9;out.spread=.6;out.elbA=out.elbB=-.2;}}
  else if(m.state==='stagger'){out.lean=-.38;out.spread=.55;out.armA=-.9;out.armB=-.6;out.elbA=-.5;out.elbB=-.9;const h=L*.93;out.bob=h-L;solveLeg(G,L,h,-.26,slope*-.26,0,out,true);solveLeg(G,L,h,.1,slope*.1,0,out,false);}
  if(swing&&time-swing.slamAt<.24){const u=(time-swing.slamAt)/.24;out.armA=out.armB=lerp(-2.7,-.5,Math.min(1,u*2.2));out.elbA=out.elbB=lerp(-.75,-.25,Math.min(1,u*2.2));out.lean=lerp(.42,.1,u);}
  return out;
 }
 _livePose(m,time,out){
  const kind=m.kind,speed=Math.hypot(m.vx,m.vz),k=clamp(speed/2.2,0,1),c=m.phase*(kind==='brute'?3.4:4.4),sw=Math.sin(c);
  out.bob=Math.abs(Math.cos(c))*.07*k;out.lean=(kind==='bomber'?.48:kind==='brute'?.14:.26)*k;out.legA=sw*.85*k;out.legB=-sw*.85*k;out.spread=.1;
  if(kind==='bomber'){out.armA=out.armB=1.0+sw*.12;out.spread=.25;}else{out.armA=-sw*.6*k-.3;out.armB=sw*.6*k-.3;}
  const rec=this.swing.get(m.id);
  if(m.state==='rise'){const u=clamp((time-m.bornAt)/m.riseDur,0,1);out.armA=lerp(-2.6,-.4,u)+Math.sin(time*9+m.id)*.2;out.armB=lerp(-2.4,-.4,u)-Math.sin(time*9+m.id)*.2;out.lean=lerp(.6,.1,u);out.legA=-.6*(1-u);out.legB=.3*(1-u);}
  else if(m.state==='attack'){const K=kind==='brute'?.7:kind==='bomber'?.25:.42,u=clamp((time-m.attackAt)/K,0,1),e=u*u*(3-2*u);out.armA=out.armB=lerp(-.3,-2.7,e);out.lean=-.18*e;out.spread=.18;if(kind==='bomber'){out.armA=out.armB=-2.9;out.spread=.6;}}
  else if(m.state==='stagger'){out.lean=-.38;out.spread=.55;out.armA=-.9;out.armB=-.6;out.legA=.25;out.legB=-.15;out.bob=0;}
  if(rec&&time-rec.slamAt<.24){const u=(time-rec.slamAt)/.24;out.armA=out.armB=lerp(-2.7,-.5,Math.min(1,u*2.2));out.lean=lerp(.42,.1,u);}
  return out;
 }
 // a soldier that just swung (attack -> run) plays a quick slam
 strike(e,time){const r=this.swing.get(e.crowdId)??{};r.slamAt=time;this.swing.set(e.crowdId,r);}
 kill(e,time,groundAt){
  this.swing.delete(e.crowdId);this.gait.delete(e.crowdId);
  if(e.kind==='bomber'&&e.cause!=='win')return false; // a bomber leaves only shards and fire
  const s=e.scale??1,d=new T.Vector3(e.direction[0],0,e.direction[2]);if(d.lengthSq()<1e-6)d.set(-Math.sin(e.yaw),0,-Math.cos(e.yaw));d.normalize();
  const blast=e.cause==='explosion',f=e.force??1,w=e.cause==='win';
  const speed=w?.2:blast?f*.9:1.1+f*.75,up=w?.5:blast?2.5+e.direction[1]*f*1.1:1.4+f*.25;
  const yaw=e.yaw;const q=new T.Quaternion().setFromAxisAngle(UP,yaw);
  const axis=new T.Vector3().crossVectors(UP,d).normalize(),spin=w?1.6:blast?5+f*.45:3.2+f*.8;
  const tumble=new T.Vector3(hash(e.crowdId)-.5,hash(e.crowdId+3)-.5,hash(e.crowdId+7)-.5).multiplyScalar(blast?f*.5:.6);
  const b={id:e.crowdId,kind:e.kind,s,x:e.position[0],y:e.position[1]+(this.models?.[e.kind]?.meta.hip??HIP)*s,z:e.position[2],vx:d.x*speed,vy:up,vz:d.z*speed,q,w:axis.multiplyScalar(spin).add(tumble),yaw,age:0,rest:false,limp:hash(e.crowdId+11),ground:groundAt(e.position[0],e.position[2]),head:!!e.head};
  // which way the body ends up lying: on its back if it was thrown backward
  b.flat=new T.Quaternion().setFromAxisAngle(UP,Math.atan2(-d.x,-d.z)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),-Math.PI/2));
  this.bodies.push(b);if(this.bodies.length>this.bodyCap)this.bodies.shift();
  return true;
 }
 update(dt,time,crowd,groundAt,eye){
  if(eye)this.eye.copy(eye);
  if(this.sets)return this._updateModels(dt,time,crowd,groundAt);
  const pose={bob:0,lean:0,legA:0,legB:0,armA:0,armB:0,spread:0,kneeA:0,kneeB:0,ankA:0,ankB:0,elbA:0,elbB:0,slope:0};let i=0;
  const {M,q,p,s,c,g}=this;
  for(const m of crowd){
   if(m.dead||i>=this.max-this.bodyCap)continue;
   this._livePose(m,time,pose);q.setFromAxisAngle(UP,m.yaw);p.set(m.x,m.y,m.z);s.setScalar(m.scale);M.compose(p,q,s);
   const flash=clamp(1-(time-m.hitAt)/.09,0,1);c.copy(TINT[m.kind]).multiplyScalar(1+flash*2.6);
   g.copy(GLOW[m.kind]);if(m.kind==='bomber')g.multiplyScalar(.7+.6*Math.pow(.5+.5*Math.sin(time*14+m.id),3));if(m.state==='attack')g.multiplyScalar(1.6);
   this._write(i++,M,pose,c,g);
  }
  const limp={bob:0,lean:0,legA:0,legB:0,armA:0,armB:0,spread:0,kneeA:0,kneeB:0,ankA:0,ankB:0,elbA:0,elbB:0,slope:0};
  for(const b of this.bodies){
   b.age+=dt;
   if(!b.rest){
    b.vy-=17*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
    const wl=b.w.length();if(wl>1e-4){this.tmpQ.setFromAxisAngle(this.axis.copy(b.w).divideScalar(wl),wl*dt);b.q.premultiply(this.tmpQ);}
    const floor=(b.ground=groundAt(b.x,b.z))+.2*b.s;
    if(b.y<floor){b.y=floor;if(b.vy<-2.4){b.vy=-b.vy*.26;b.vx*=.5;b.vz*=.5;b.w.multiplyScalar(.45);}else{b.rest=true;b.vx=b.vz=b.vy=0;}}
   }else{
    b.q.slerp(b.flat,1-Math.exp(-7*dt));
    if(b.age>6)b.y-=dt*.22;
   }
   if(i>=this.max)continue;
   s.setScalar(b.s);M.compose(p.set(b.x,b.y,b.z),b.q,s).multiply(this.R.makeTranslation(0,-HIP,0));
   const a=Math.min(1,b.age*3);limp.legA=lerp(0,.35+b.limp*.3,a);limp.legB=lerp(0,-.25,a);limp.armA=lerp(-.3,-1.4-b.limp,a);limp.armB=lerp(-.3,.6,a);limp.spread=lerp(.1,.9,a);
   c.copy(TINT[b.kind]).multiplyScalar(lerp(1,.62,Math.min(1,b.age*.8)));g.copy(DEAD_GLOW);
   this._write(i++,M,limp,c,g);
  }
  this.bodies=this.bodies.filter(b=>b.age<9);
  this.upper.count=this.glow.count=i;this.limbs.count=i*4;
  for(const im of [this.upper,this.glow,this.limbs]){im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true;}
  if(this.swing.size>400){for(const [id,r] of this.swing)if(time-r.slamAt>1)this.swing.delete(id);}
 }
 _stepBody(b,dt,groundAt){
  b.age+=dt;
  if(!b.rest){
   b.vy-=17*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;
   const wl=b.w.length();if(wl>1e-4){this.tmpQ.setFromAxisAngle(this.axis.copy(b.w).divideScalar(wl),wl*dt);b.q.premultiply(this.tmpQ);}
   const floor=(b.ground=groundAt(b.x,b.z))+.2*b.s;
   if(b.y<floor){b.y=floor;if(b.vy<-2.4){b.vy=-b.vy*.26;b.vx*=.5;b.vz*=.5;b.w.multiplyScalar(.45);}else{b.rest=true;b.vx=b.vz=b.vy=0;}}
  }else{b.q.slerp(b.flat,1-Math.exp(-7*dt));if(b.age>6)b.y-=dt*.22;}
 }
 _updateModels(dt,time,crowd,groundAt){
  const pose={bob:0,lean:0,legA:0,legB:0,armA:0,armB:0,spread:0,kneeA:0,kneeB:0,ankA:0,ankB:0,elbA:0,elbB:0,slope:0},{M,q,p,s,c}=this,gait=this.gait;let live=0;
  for(const k of Object.keys(this.sets))for(const set of this.sets[k])set.n=0;
  this._pickNear(crowd);
  for(const m of crowd){
   if(m.dead)continue;
   // the stride follows the ground the soldier really covered (a soldier held up in the press stops pumping its legs),
   // measured along the way it faces. The rules' own phase only seeds it.
   let rec=gait.get(m.id);if(!rec){rec={x:m.x,z:m.z,p:m.phase,v:Math.hypot(m.vx,m.vz),t:time};gait.set(m.id,rec);}
   if(this.gaitFromRules){rec.p=m.phase;rec.v=Math.hypot(m.vx,m.vz);}
   else if(dt>0){const want=Math.hypot(m.vx,m.vz),step=clamp((m.x-rec.x)*Math.sin(m.yaw)+(m.z-rec.z)*Math.cos(m.yaw),0,(want+2)*dt*1.5);rec.p+=step;rec.v+=(step/dt-rec.v)*Math.min(1,dt*7);rec.x=m.x;rec.z=m.z;}
   rec.t=time;
   if(live>=this.max-this.bodyCap)continue;
   const set=this._lod(m.kind,m.x,m.y+m.scale,m.z,m.scale,m);if(!set)continue;live++;
   // near soldiers put their feet on the slope they stand on
   pose.slope=0;if(set.lod<2&&m.state!=='rise'){const r=.45*m.scale,sx=Math.sin(m.yaw)*r,sz=Math.cos(m.yaw)*r;pose.slope=clamp((groundAt(m.x+sx,m.z+sz)-groundAt(m.x-sx,m.z-sz))/(2*r),-.45,.45);}
   this._gaitPose(m,time,rec,pose);q.setFromAxisAngle(UP,m.yaw);p.set(m.x,m.y,m.z);s.setScalar(m.scale);M.compose(p,q,s);
   const flash=clamp(1-(time-m.hitAt)/.09,0,1);c.setScalar(1+flash*2.6);
   let glow=GLOW_GAIN[m.kind];if(m.kind==='bomber')glow*=.6+1.6*Math.pow(.5+.5*Math.sin(time*14+m.id),3);if(m.state==='attack')glow*=1.7;
   this._writeModel(set,M,pose,c,glow+flash*2);
  }
  const limp={bob:0,lean:0,legA:0,legB:0,armA:0,armB:0,spread:0,kneeA:0,kneeB:0,ankA:0,ankB:0,elbA:0,elbB:0,slope:0};
  for(const b of this.bodies){
   this._stepBody(b,dt,groundAt);
   const set=this._lod(b.kind,b.x,b.y,b.z,b.s*1.4,b);if(!set)continue;
   const hip=set.meta.hip;s.setScalar(b.s);M.compose(p.set(b.x,b.y,b.z),b.q,s).multiply(this.R.makeTranslation(0,-hip,0));
   const a=Math.min(1,b.age*3);limp.legA=lerp(0,.35+b.limp*.3,a);limp.legB=lerp(0,-.25,a);limp.armA=lerp(-.3,-1.4-b.limp,a);limp.armB=lerp(-.3,.6,a);limp.spread=lerp(.1,.9,a);
   limp.kneeA=a*(.5+b.limp*.9);limp.kneeB=a*(1.1-b.limp*.7);limp.elbA=-a*(.3+b.limp*.8);limp.elbB=-a*.9;
   c.setScalar(lerp(1,.6,Math.min(1,b.age*.8)));
   this._writeModel(set,M,limp,c,Math.max(0,1-b.age*4)*GLOW_GAIN[b.kind]);
  }
  this.bodies=this.bodies.filter(b=>b.age<9);this.live=live;
  for(const k of Object.keys(this.sets))for(const set of this.sets[k]){for(const im of set.meshes){im.count=set.n;im.instanceMatrix.needsUpdate=true;}set.color.needsUpdate=true;set.glow.needsUpdate=true;for(let i=1;i<5;i++)set.bend[i].needsUpdate=true;}
  if(this.swing.size>400){for(const [id,r] of this.swing)if(time-r.slamAt>1)this.swing.delete(id);}
  if(gait.size>crowd.length+200){for(const [id,r] of gait)if(r.t!==time)gait.delete(id);}
 }
 reset(){this.bodies=[];this.swing.clear();this.gait.clear();this.upper.count=this.glow.count=this.limbs.count=0;if(this.sets)for(const k of Object.keys(this.sets))for(const set of this.sets[k]){set.n=0;for(const im of set.meshes)im.count=0;}}
 get counts(){if(this.sets){const lods=[0,0,0];for(const k of Object.keys(this.sets))this.sets[k].forEach((set,l)=>{lods[l]+=set.n;});return {live:this.live??0,bodies:this.bodies.length,limbs:(lods[0]+lods[1]+lods[2])*4,lods};}return {live:this.upper.count-this.bodies.length,bodies:this.bodies.length,limbs:this.limbs.count};}
 // one posed soldier in front of the camera so every program compiles before the fight
 prewarm(){const m=(kind,i)=>({id:-1-i,kind,x:i-1,y:0,z:-4,vx:2,vz:0,phase:1,yaw:0,scale:1,state:'run',hitAt:-9,bornAt:-9,riseDur:1,attackAt:-9});this.eye.set(0,1.6,0);this.update(0,0,CROWD_KINDS.map(m),()=>0);}
}

// ---------- armour shards and snow chunks ----------
export class Debris{
 constructor(scene,cap=900){
  this.cap=cap;
  // a torn plate, not a cube: a low-poly lump with its corners pulled about, flat-shaded so the facets catch the light
  const geo=new T.DodecahedronGeometry(.62,0),gp=geo.attributes.position;for(let i=0;i<gp.count;i++){const x=gp.getX(i),y=gp.getY(i),z=gp.getZ(i),k=.72+hash(Math.round(x*31)+Math.round(y*57)*3+Math.round(z*91)*7)*.6;gp.setXYZ(i,x*k,y*k,z*k);}geo.computeVertexNormals();
  const mat=new T.MeshStandardMaterial({name:'shards',color:'#ffffff',roughness:.5,metalness:.45,flatShading:true});
  this.mesh=new T.InstancedMesh(geo,mat,cap);this.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);this.mesh.frustumCulled=false;this.mesh.castShadow=true;
  for(let i=0;i<cap;i++)this.mesh.setColorAt(i,new T.Color(1,1,1));this.mesh.count=0;scene.add(this.mesh);
  this.items=[];this.o=new T.Object3D();this.c=new T.Color();
 }
 // colors: CSS colours picked at random; size: [w,h,d] base
 burst(position,{n=6,direction=[0,1,0],speed=4,up=3,spread=1,size=[.14,.04,.1],colors=['#d5e1e8','#283038'],life=3.5,ground=null,seed=0}={}){
  for(let i=0;i<n;i++){
   const h=k=>hash(seed+i*7.13+k),a=h(1)*6.283,r=spread*(.4+h(2)*.6);
   const v=[direction[0]*speed+Math.cos(a)*r*speed*.6,up*(.5+h(3))+direction[1]*speed*.5,direction[2]*speed+Math.sin(a)*r*speed*.6];
   const sc=.6+h(4)*.9;
   this.items.push({x:position[0]+(h(5)-.5)*.3,y:position[1]+(h(6)-.5)*.3,z:position[2]+(h(8)-.5)*.3,v,rx:h(9)*6,ry:h(10)*6,rz:h(11)*6,w:[(h(12)-.5)*18,(h(13)-.5)*18,(h(14)-.5)*18],
    sx:size[0]*sc,sy:size[1]*sc,sz:size[2]*sc,color:colors[Math.floor(h(15)*colors.length)%colors.length],age:0,life:life*(.7+h(16)*.6),ground:ground??position[1]-1.2,rest:false});
  }
  if(this.items.length>this.cap)this.items.splice(0,this.items.length-this.cap);
 }
 update(dt){
  const o=this.o;let i=0;
  for(const d of this.items){
   d.age+=dt;if(d.age>=d.life)continue;
   if(!d.rest){d.v[1]-=16*dt;d.x+=d.v[0]*dt;d.y+=d.v[1]*dt;d.z+=d.v[2]*dt;d.rx+=d.w[0]*dt;d.ry+=d.w[1]*dt;d.rz+=d.w[2]*dt;
    if(d.y<d.ground+d.sy*.5){d.y=d.ground+d.sy*.5;if(d.v[1]<-2.5){d.v[1]*=-.3;d.v[0]*=.5;d.v[2]*=.5;d.w=d.w.map(w=>w*.5);}else{d.rest=true;d.rx=Math.round(d.rx/Math.PI)*Math.PI;d.rz=Math.round(d.rz/Math.PI)*Math.PI;}}}
   const fade=clamp((d.life-d.age)/.6,0,1);
   o.position.set(d.x,d.y,d.z);o.rotation.set(d.rx,d.ry,d.rz);o.scale.set(d.sx*fade,d.sy*fade,d.sz*fade);o.updateMatrix();this.mesh.setMatrixAt(i,o.matrix);this.mesh.setColorAt(i,this.c.set(d.color));i++;
  }
  this.items=this.items.filter(d=>d.age<d.life);this.mesh.count=i;this.mesh.instanceMatrix.needsUpdate=true;this.mesh.instanceColor.needsUpdate=true;
 }
 reset(){this.items=[];this.mesh.count=0;}
}

// ---------- additive hit sparks: one draw call ----------
function sparkTexture(){const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d'),r=g.createRadialGradient(16,16,0,16,16,16);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.3,'rgba(255,255,255,.6)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,32,32);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
export class Sparks{
 constructor(scene,cap=3000){
  this.cap=cap;this.pos=new Float32Array(cap*3);this.col=new Float32Array(cap*3);
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(this.pos,3).setUsage(T.DynamicDrawUsage));geo.setAttribute('color',new T.BufferAttribute(this.col,3).setUsage(T.DynamicDrawUsage));geo.setDrawRange(0,0);
  this.points=new T.Points(geo,new T.PointsMaterial({size:.13,map:sparkTexture(),vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,sizeAttenuation:true}));
  this.points.frustumCulled=false;this.points.renderOrder=3;scene.add(this.points);this.list=[];this.c=new T.Color();this.n=0;
 }
 burst(position,{n=10,direction=[0,0,0],speed=6,spread=1,colors=['#bff4ff','#ffffff','#ffb057'],life=.35,gravity=9,drag=2.5,seed=0}={}){
  for(let i=0;i<n;i++){
   const h=k=>hash(seed+this.n*1.37+i*3.1+k),u=h(1)*2-1,a=h(2)*6.283,r=Math.sqrt(1-u*u),s=speed*(.35+h(3)*.9);
   const v=[direction[0]*speed*.6+r*Math.cos(a)*s*spread,direction[1]*speed*.6+u*s*spread+1,direction[2]*speed*.6+r*Math.sin(a)*s*spread];
   this.c.set(colors[Math.floor(h(4)*colors.length)%colors.length]);
   this.list.push({x:position[0],y:position[1],z:position[2],v,age:0,life:life*(.5+h(5)),r:this.c.r,g:this.c.g,b:this.c.b,gravity,drag});
  }
  this.n++;if(this.list.length>this.cap)this.list.splice(0,this.list.length-this.cap);
 }
 update(dt){
  let i=0;
  for(const p of this.list){
   p.age+=dt;if(p.age>=p.life)continue;const k=Math.exp(-p.drag*dt);
   p.v[0]*=k;p.v[1]=p.v[1]*k-p.gravity*dt;p.v[2]*=k;p.x+=p.v[0]*dt;p.y+=p.v[1]*dt;p.z+=p.v[2]*dt;
   const f=1-p.age/p.life,fade=f*f*2.2;this.pos[i*3]=p.x;this.pos[i*3+1]=p.y;this.pos[i*3+2]=p.z;this.col[i*3]=p.r*fade;this.col[i*3+1]=p.g*fade;this.col[i*3+2]=p.b*fade;i++;
  }
  this.list=this.list.filter(p=>p.age<p.life);
  const geo=this.points.geometry;geo.setDrawRange(0,i);geo.attributes.position.needsUpdate=true;geo.attributes.color.needsUpdate=true;
 }
 reset(){this.list=[];this.points.geometry.setDrawRange(0,0);}
 get count(){return this.list.length;}
}
