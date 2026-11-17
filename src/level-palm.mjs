// r27 · the sky palm on screen: the giant hand of ice that comes down from the clouds, the mark under the crosshair
// while the player is in the air, the print the hand leaves in the snow, and the snow it throws up.
// The rules (flight, timing, damage) are in level-core.mjs; this module only draws what they report.
//
// Hand space: the hand lies flat in the XZ plane inside the square x,z in [-1,1], fingers toward -z, palm side down.
// One unit is PALM.radius metres, so the print fills the circle the strike clears.
import * as T from 'three';
import {PALM} from './level-core.mjs';

const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};
// the same outline for the texture (u right, v down, fingers at the top) and the stand-in model
const FINGERS=[[.31,.47,.30,.15],[.44,.46,.44,.08],[.57,.46,.575,.1],[.69,.48,.71,.19]],THUMB=[.3,.74,.115,.47],PALM_BOX=[.27,.44,.46,.44];
function drawHand(g,s,grow=0){
 g.lineCap='round';g.lineJoin='round';
 const [px,py,pw,ph]=PALM_BOX,r=.13*s;g.beginPath();g.roundRect(px*s-grow,py*s-grow,pw*s+grow*2,ph*s+grow*2,r+grow);g.fill();
 g.lineWidth=.108*s+grow*2;for(const [x0,y0,x1,y1] of FINGERS){g.beginPath();g.moveTo(x0*s,y0*s);g.lineTo(x1*s,y1*s);g.stroke();}
 g.lineWidth=.125*s+grow*2;g.beginPath();g.moveTo(THUMB[0]*s,THUMB[1]*s);g.lineTo(THUMB[2]*s,THUMB[3]*s);g.stroke();
}
// the hand seen from above as a white shape: the model's own triangles when there is one, the outline otherwise
function handMask(geometry,s=512){
 const c=document.createElement('canvas');c.width=c.height=s;const g=c.getContext('2d');g.fillStyle=g.strokeStyle='#fff';
 if(!geometry){drawHand(g,s);return c;}
 const p=geometry.attributes.position,ix=geometry.index,q=i=>[(p.getX(i)*.5+.5)*s,(p.getZ(i)*.5+.5)*s];
 g.lineWidth=1.5;g.beginPath();
 for(let i=0;i<ix.count;i+=3){const a=q(ix.getX(i)),b=q(ix.getX(i+1)),d=q(ix.getX(i+2));g.moveTo(a[0],a[1]);g.lineTo(b[0],b[1]);g.lineTo(d[0],d[1]);g.closePath();}
 g.fill('nonzero');g.stroke();return c;
}
function handTexture(kind,geometry=null){
 const s=512,m=handMask(geometry,s),c=document.createElement('canvas');c.width=c.height=s;const g=c.getContext('2d');
 const put=(blur,alpha,scale=1)=>{g.filter=`blur(${blur}px)`;g.globalAlpha=alpha;const d=s*scale,o=(s-d)/2;g.drawImage(m,o,o-(1-scale)*s*.03,d,d);};
 if(kind==='print'){
  // pressed snow: a soft dark body with a harder edge where the snow was sheared
  put(8,.6,1.03);put(2,.75);g.globalCompositeOperation='destination-out';put(10,.45,.9);
 }else{
  // the mark: a bright outline with a faint body
  put(3,1,1.035);g.globalCompositeOperation='destination-out';put(2,.86);
 }
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
}
// the generated hand (assets/fx/sky-palm.*, built by build-palm.mjs from the Lux3D model): already in hand space
export async function loadSkyPalm(base='/assets/fx/'){
 const [meta,bin]=await Promise.all([fetch(`${base}sky-palm.json?v=2`).then(r=>{if(!r.ok)throw new Error(`sky-palm.json ${r.status}`);return r.json();}),fetch(`${base}sky-palm.bin?v=2`).then(r=>{if(!r.ok)throw new Error(`sky-palm.bin ${r.status}`);return r.arrayBuffer();})]);
 const n=meta.vertices,g=new T.BufferGeometry();
 g.setAttribute('position',new T.BufferAttribute(new Float32Array(bin,meta.position,n*3),3));g.setAttribute('normal',new T.BufferAttribute(new Int8Array(bin,meta.normal,n*3),3,true));
 g.setAttribute('uv',new T.BufferAttribute(new Float32Array(bin,meta.uv,n*2),2));g.setIndex(new T.BufferAttribute(meta.wide?new Uint32Array(bin,meta.index,meta.tris*3):new Uint16Array(bin,meta.index,meta.tris*3),1));
 g.computeBoundingSphere();
 const map=await new T.TextureLoader().loadAsync(`${base}sky-palm-albedo.jpg?v=2`);map.colorSpace=T.SRGBColorSpace;map.flipY=false;map.anisotropy=4;
 return {geometry:g,map,meta};
}
function glowTexture(){
 const s=128,c=document.createElement('canvas');c.width=c.height=s;const g=c.getContext('2d'),gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
 gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.3,'rgba(255,255,255,.4)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,s,s);
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
// stand-in hand, used until (or unless) the generated model is loaded: a slab and five capsules on the outline above
function standInHand(mat){
 const G=new T.Group(),at=(u,v)=>[(u-.5)*2,(v-.5)*2];
 const slab=new T.Mesh(new T.SphereGeometry(1,28,16),mat);{const [x,z]=at(PALM_BOX[0]+PALM_BOX[2]/2,PALM_BOX[1]+PALM_BOX[3]/2);slab.position.set(x,0,z);slab.scale.set(PALM_BOX[2]*1.08,.17,PALM_BOX[3]*1.08);}G.add(slab);
 const limb=(a,b,r)=>{const A=new T.Vector3(a[0],0,a[1]),B=new T.Vector3(b[0],0,b[1]),L=A.distanceTo(B),m=new T.Mesh(new T.CapsuleGeometry(r,L,6,14),mat);
  m.position.copy(A).lerp(B,.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),B.clone().sub(A).normalize());m.scale.y=1;m.scale.z=.82;G.add(m);};
 for(const [x0,y0,x1,y1] of FINGERS)limb(at(x0,y0+.04),at(x1,y1+.05),.1);
 limb(at(THUMB[0],THUMB[1]),at(THUMB[2],THUMB[3]+.03),.115);
 return G;
}
const PRINT_SEG=28;
function groundSheet(){const g=new T.PlaneGeometry(2,2,PRINT_SEG,PRINT_SEG);g.rotateX(-Math.PI/2);g.userData.local=Float32Array.from(g.attributes.position.array);return g;}
// lay a sheet on the terrain: its vertices are written in world space (the mesh stays at the origin)
function conform(mesh,x,z,yaw,size,groundAt,lift){
 const p=mesh.geometry.attributes.position,L=mesh.geometry.userData.local,c=Math.cos(yaw)*size,s=Math.sin(yaw)*size;
 for(let i=0;i<p.count;i++){const lx=L[i*3],lz=L[i*3+2],wx=x+lx*c+lz*s,wz=z-lx*s+lz*c;p.setXYZ(i,wx,groundAt(wx,wz)+lift,wz);}
 p.needsUpdate=true;mesh.geometry.computeBoundingSphere();
}
// cracks running out from under the hand
function crackTexture(){
 const s=512,c=document.createElement('canvas');c.width=c.height=s;const g=c.getContext('2d'),m=s/2;g.strokeStyle='#fff';g.lineCap='round';g.lineJoin='round';
 for(let i=0;i<26;i++){
  let a=i/26*6.283+hash(i)*.2,r=m*(.3+hash(i+40)*.12);const end=m*(.62+hash(i+7)*.36);let w=s*(.005+hash(i+3)*.006);
  while(r<end){const r2=Math.min(end,r+m*(.05+hash(r+i)*.07)),a2=a+(hash(r*3.1+i)-.5)*.34;g.globalAlpha=.9*(1-(r-m*.3)/(end-m*.3)*.7);g.lineWidth=w;g.beginPath();g.moveTo(m+Math.cos(a)*r,m+Math.sin(a)*r);g.lineTo(m+Math.cos(a2)*r2,m+Math.sin(a2)*r2);g.stroke();
   if(hash(r+i*9)>.72){const b=a2+(hash(r)>.5?.7:-.7),l=m*(.05+hash(r+2)*.08);g.lineWidth=w*.6;g.beginPath();g.moveTo(m+Math.cos(a2)*r2,m+Math.sin(a2)*r2);g.lineTo(m+Math.cos(b)*(r2+l),m+Math.sin(b)*(r2+l));g.stroke();}
   r=r2;a=a2;w*=.86;}
 }
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t;
}
// Snow in sunlight is far brighter than white in the HDR buffer: a print has to multiply what is under it, as a shadow
// does. The tint is what full coverage leaves of the snow's light. Colour only: alpha is left as the ground wrote it.
const darken=(tex,tint,opacity)=>new T.ShaderMaterial({name:'sky palm / pressed snow',uniforms:{map:{value:tex},uTint:{value:new T.Color(tint)},uOpacity:{value:opacity}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform sampler2D map;uniform vec3 uTint;uniform float uOpacity;varying vec2 vUv;void main(){float a=clamp(texture2D(map,vUv).a*uOpacity,0.,1.);gl_FragColor=vec4(mix(vec3(1.),uTint,a),1.);}`,
 transparent:true,depthWrite:false,toneMapped:false,fog:false,blending:T.CustomBlending,blendEquation:T.AddEquation,blendSrc:T.ZeroFactor,blendDst:T.SrcColorFactor,blendSrcAlpha:T.ZeroFactor,blendDstAlpha:T.OneFactor,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6});
// light only (adds colour, leaves alpha alone: the sky is composited where alpha is empty)
const GLOW_VERT=`varying vec3 vN,vV;varying float vY,vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalMatrix*normal;vV=-mv.xyz;vY=position.y;vA=atan(position.z,position.x);gl_Position=projectionMatrix*mv;}`;
const rimMaterial=()=>new T.ShaderMaterial({name:'sky palm / rim light',uniforms:{uColor:{value:new T.Color('#58b8ff')},uGain:{value:1}},vertexShader:GLOW_VERT,
 fragmentShader:`uniform vec3 uColor;uniform float uGain;varying vec3 vN,vV;void main(){float f=1.-abs(dot(normalize(vN),normalize(vV)));gl_FragColor=vec4(uColor*pow(f,2.4)*uGain,0.);}`,
 transparent:true,premultipliedAlpha:true,depthWrite:false,blending:T.AdditiveBlending,fog:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
const columnMaterial=()=>new T.ShaderMaterial({name:'sky palm / column of light',uniforms:{uColor:{value:new T.Color('#9fd8ff')},uGain:{value:0},uTime:{value:0}},vertexShader:GLOW_VERT,
 fragmentShader:`uniform vec3 uColor;uniform float uGain,uTime;varying vec3 vN,vV;varying float vY,vA;void main(){float f=abs(dot(normalize(vN),normalize(vV)));
  float h=clamp(vY,0.,1.),run=.6+.4*sin(vY*46.-uTime*14.),ray=.35+.65*pow(.5+.5*sin(vA*9.+sin(vA*23.)*1.3+uTime*.8),3.);
  gl_FragColor=vec4(uColor*pow(f,2.2)*(.2+.8*h)*smoothstep(0.,.05,h)*(1.-smoothstep(.75,1.,h))*run*ray*uGain,0.);}`,
 transparent:true,premultipliedAlpha:true,depthWrite:false,blending:T.AdditiveBlending,fog:false,toneMapped:false,side:T.DoubleSide});
const ringMaterial=op=>new T.MeshBasicMaterial({color:'#bfe9ff',transparent:true,opacity:op,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,side:T.DoubleSide});
const SPIKES=96,COLUMN_H=95;

// r27b: what bursts out of the ground round a strike. Not a cone: a cluster of ice crystals, a tall six-sided shard with a
// chisel tip and three lesser ones leaning out of its foot. One unit high, about one across; deep blue in the foot, frosted
// at the tips (vertex colours), every face flat.
function crystalGeometry(){
 const pos=[],col=[],deep=new T.Color('#1d6fc4'),mid=new T.Color('#86c9f2'),frost=new T.Color('#f4fbff'),N=6;
 const shard=(ox,oz,r,h,lean,la,seed)=>{
  const ring=(y,rad,j)=>Array.from({length:N},(_,i)=>{const a=i/N*6.2832+seed,k=rad*(1+(hash(seed*7+i*3+j)-.5)*.5);return [Math.cos(a)*k,y,Math.sin(a)*k];});
  const A=ring(0,r,1),B=ring(h*(.5+hash(seed)*.2),r*.78,2),C=ring(h*.9,r*.3,3),tip=[r*(hash(seed+5)-.5)*.5,h,r*(hash(seed+6)-.5)*.5];
  const tf=p=>{const s=Math.sin(lean)*p[1];return [ox+p[0]+Math.cos(la)*s,Math.cos(lean)*p[1],oz+p[2]+Math.sin(la)*s];};
  const tri=(...t)=>{for(const p of t){pos.push(...tf(p));const u=p[1]/h,k=u<.5?deep.clone().lerp(mid,u*2):mid.clone().lerp(frost,(u-.5)*2);col.push(k.r,k.g,k.b);}};
  for(let i=0;i<N;i++){const j=(i+1)%N;tri(A[i],B[i],A[j]);tri(A[j],B[i],B[j]);tri(B[i],C[i],B[j]);tri(B[j],C[i],C[j]);tri(C[i],tip,C[j]);}
 };
 shard(0,0,.5,1,0,0,1.3);shard(.42,.1,.3,.52,.5,.2,2.7);shard(-.3,.34,.26,.4,.6,2.3,4.1);shard(-.12,-.44,.28,.6,.42,4.4,5.9);
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.computeVertexNormals();return g;
}
export class SkyPalms{
 constructor(scene,{smoke,sparks,debris,lights}){
  Object.assign(this,{scene,smoke,sparks,debris,lights});
  this.printTex=handTexture('print');this.markTex=handTexture('mark');this.glowTex=glowTexture();this.crackTex=crackTexture();
  this.ice=new T.MeshStandardMaterial({name:'sky palm / glacier ice',color:'#bfe4fb',emissive:new T.Color('#1f7fd6'),emissiveIntensity:.12,roughness:.14,metalness:0,transparent:true,opacity:1,envMapIntensity:2.4});
  this.template=null;this.hands=[];this.strikes=new Map();this.prints=[];this.rings=[];this.spikes=[];
  this.ringGeo=new T.RingGeometry(.9,1,72);this.ringGeo.rotateX(-Math.PI/2);
  this.columnGeo=new T.CylinderGeometry(.5,.82,1,36,1,true);this.columnGeo.translate(0,.5,0);
  const sheet=(mat,order)=>{const m=new T.Mesh(groundSheet(),mat);m.frustumCulled=false;m.renderOrder=order;m.visible=false;scene.add(m);return m;};
  this.sheet=sheet;this.light=(tex,color,opacity)=>new T.MeshBasicMaterial({map:tex,color,transparent:true,opacity,depthWrite:false,toneMapped:false,blending:T.AdditiveBlending,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6});
  this.aim=sheet(this.light(this.markTex,'#7fd4ff',.6),3);
  // ice thrown up around the print: one instanced mesh for every strike
  const cone=crystalGeometry();
  this.spikeMat=new T.MeshStandardMaterial({name:'sky palm / ice spikes',color:'#ffffff',vertexColors:true,emissive:new T.Color('#1f78d0'),emissiveIntensity:.2,roughness:.1,metalness:0,flatShading:true,envMapIntensity:2.6});
  // light caught in the edges: every face brightens as it turns away from the eye
  this.spikeMat.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(.5,.8,1.)*pow(1.-abs(dot(normalize(vViewPosition),normal)),3.)*.9;');};this.spikeMat.customProgramCacheKey=()=>'ice-crystal';
  this.spikeMesh=new T.InstancedMesh(cone,this.spikeMat,SPIKES);this.spikeMesh.count=0;this.spikeMesh.frustumCulled=false;this.spikeMesh.castShadow=true;this.spikeMesh.name='sky palm / ice spikes';scene.add(this.spikeMesh);
  // Every strike makes and disposes its own materials, and three deletes a program nobody holds: one of each kind stays
  // registered here (drawn once by stage(), hidden after) so no strike has to compile mid-fight.
  const speck=new T.PlaneGeometry(.01,.01);speck.translate(0,-80,0);
  this.keepers=[columnMaterial(),darken(this.crackTex,'#ffffff',0),this.light(this.markTex,'#000000',0),ringMaterial(0)].map(m=>{const k=new T.Mesh(speck,m);k.frustumCulled=false;k.visible=false;k.name='sky palm / program keeper';scene.add(k);return k;});
  this._m=new T.Matrix4();this._q=new T.Quaternion();this._q2=new T.Quaternion();this._v=new T.Vector3();this._s=new T.Vector3();this._up=new T.Vector3(0,1,0);
 }
 // geometry in hand space (see the top of the file), with its own colour map if it has one
 setModel(geometry,map=null){
  if(map){this.ice.map=map;this.ice.emissiveMap=map;this.ice.color.set('#d4ecfb');this.ice.emissive.set('#2f8fe0');this.ice.needsUpdate=true;}
  this.template=geometry;
  // the mark and the print take the model's own outline
  const print=handTexture('print',geometry),mark=handTexture('mark',geometry);this.printTex.dispose();this.markTex.dispose();
  this.aim.material.map=mark;this.printTex=print;this.markTex=mark;
  for(const h of this.hands){this.scene.remove(h.group);h.mat.dispose();h.rim.dispose();}this.hands=[];
 }
 _hand(){
  let h=this.hands.find(h=>!h.busy);
  if(!h){
   const mat=this.ice.clone(),rim=rimMaterial(),group=new T.Group();group.rotation.order='YXZ';
   const body=this.template?new T.Mesh(this.template,mat):standInHand(mat);group.add(body);
   const solid=[];body.traverse(o=>{if(o.isMesh)solid.push(o);});
   for(const o of solid){o.castShadow=true;o.frustumCulled=false;const shell=new T.Mesh(o.geometry,rim);shell.frustumCulled=false;shell.renderOrder=3;o.add(shell);}
   group.scale.setScalar(PALM.radius);group.visible=false;this.scene.add(group);
   h={group,mat,rim,busy:false};this.hands.push(h);
  }
  h.busy=true;h.group.visible=true;return h;
 }
 // aim: {x,z,yaw,ready} — where a click would land right now — or null
 preview(aim,time,groundAt){
  const a=this.aim;a.visible=!!aim;if(!aim)return;
  conform(a,aim.x,aim.z,aim.yaw,PALM.radius,groundAt,.14);
  a.material.opacity=aim.ready>=1?.55+.2*Math.sin(time*7):.16+.2*aim.ready;a.material.color.set(aim.ready>=1?'#8fdcff':'#6f9ab8');
 }
 call(ev,time,groundAt){
  const [x,y,z]=ev.target,R=PALM.radius,hand=this._hand(),calledAt=ev.time??time;
  const mark=this.sheet(this.light(this.markTex,'#bfeaff',.9),3);mark.visible=true;conform(mark,x,z,ev.yaw,R,groundAt,.16);
  // the shadow of the hand gathers on the snow before it arrives
  const shade=this.sheet(darken(this.printTex,'#6f8fb6',0),1);shade.visible=true;conform(shade,x,z,ev.yaw,R,groundAt,.12);
  const column=new T.Mesh(this.columnGeo,columnMaterial());column.position.set(x,y-1,z);column.scale.set(R*1.05,COLUMN_H,R*1.05);column.renderOrder=3;column.frustumCulled=false;this.scene.add(column);
  // it breaks through the cloud
  for(let i=0;i<14;i++){const a=i/14*6.283+hash(i+x),r=R*(.5+hash(i+z)*.5);this.smoke.puff({position:[x+Math.cos(a)*r,y+50+hash(i)*8,z+Math.sin(a)*r],velocity:[Math.cos(a)*9,-1.5,Math.sin(a)*9],color:'#eef4f8',size:7+hash(i+3)*4,grow:1.5,life:2.6,opacity:.5,drag:1.2});}
  this.strikes.set(ev.palmId,{id:ev.palmId,x,y,z,yaw:ev.yaw,calledAt,impactAt:ev.impactAt??calledAt+ev.delay,hitAt:null,broke:false,hand,mark,shade,column,light:null,groundAt});
 }
 impact(ev,time,groundAt){
  const it=this.strikes.get(ev.palmId);if(!it||it.hitAt!==null)return;it.hitAt=time;
  const [x,y,z]=ev.position,R=PALM.radius,c=Math.cos(it.yaw),s=Math.sin(it.yaw),at=(lx,lz)=>{const wx=x+(lx*c+lz*s)*R,wz=z+(-lx*s+lz*c)*R;return [wx,groundAt(wx,wz),wz];};
  this._free(it.mark);it.mark=null;
  // the print and the cracks round it stay in the snow
  it.shade.material.uniforms.uOpacity.value=1;it.shade.material.uniforms.uTint.value.set('#6f8ab6');
  const cracks=this.sheet(darken(this.crackTex,'#9db6d8',1),1);cracks.visible=true;conform(cracks,x,z,it.yaw+.4,R*1.9,groundAt,.1);
  this.prints.push({mesh:it.shade,age:0},{mesh:cracks,age:0});it.shade=null;
  while(this.prints.length>16)this._free(this.prints.shift().mesh);
  // light runs out along the ground, twice
  for(const [k,life,op] of [[2.6,.5,.9],[4.2,1.1,.5]]){const ring=new T.Mesh(this.ringGeo,ringMaterial(op));ring.position.set(x,y+.3,z);this.scene.add(ring);this.rings.push({mesh:ring,age:0,R:R*k,life,op});}
  // a wall of snow thrown out from under the hand, geysers up between the fingers, ice off its edges
  for(let i=0;i<38;i++){const a=i/38*6.283+hash(i+x)*.2,p=[x+Math.cos(a)*R*.8,y+.6,z+Math.sin(a)*R*.8],v=15+hash(i+z)*11;this.smoke.puff({position:p,velocity:[Math.cos(a)*v,4+hash(i)*5,Math.sin(a)*v],color:i%5?'#f4f8fb':'#dcebf5',size:2.8+hash(i+3)*1.6,grow:1.9,life:2+hash(i+7)*1.2,opacity:.6,drag:1.5,lift:.1});}
  for(let i=0;i<30;i++){const a=i/30*6.283+hash(i+z)*.2,p=[x+Math.cos(a)*R*1.05,y+.8,z+Math.sin(a)*R*1.05],v=24+hash(i+x)*12;this.smoke.puff({position:p,velocity:[Math.cos(a)*v,2+hash(i)*2.5,Math.sin(a)*v],color:'#f6f9fc',size:4.2+hash(i+5)*2,grow:1.7,life:1.5+hash(i+9)*.8,opacity:.72,drag:1.9,lift:0});}
  const gaps=[[-.4,-.22],[-.14,-.32],[.12,-.3],[.42,.02],[-.6,.2],[0,.8]];
  for(let i=0;i<gaps.length;i++){const p=at(...gaps[i]);for(let k=0;k<3;k++)this.smoke.puff({position:[p[0],p[1]+.8+k*1.5,p[2]],velocity:[(hash(i+k)-.5)*3,9+k*4+hash(i*3+k)*4,(hash(i+k+9)-.5)*3],color:k?'#f1f7fb':'#d5e8f4',size:2.2+k*.6,grow:1.8,life:1.8+k*.5,opacity:.55,drag:1.6,lift:.1});}
  this.sparks.burst([x,y+1.5,z],{n:170,direction:[0,1,0],speed:34,spread:1.7,colors:['#ffffff','#cfefff','#7fd4ff','#4aaeff'],life:1.5,gravity:12,drag:1.2,seed:ev.palmId});
  for(let i=0;i<8;i++){const a=i*.785+it.yaw,p=[x+Math.cos(a)*R*.7,y+1,z+Math.sin(a)*R*.7];this.debris.burst(p,{n:5,direction:[Math.cos(a),0,Math.sin(a)],speed:13,up:12,spread:1.5,size:[.7,.4,.55],colors:['#e6f5ff','#a9d8f0','#ffffff','#7fbfe6'],life:4.2,ground:groundAt(p[0],p[2]),seed:ev.palmId*7+i});}
  // spikes of ice burst out of the ground round the print, leaning away from it
  for(let i=0;i<22;i++){
   const a=i/22*6.283+hash(i+ev.palmId)*.25,r=R*(.98+hash(i*5+ev.palmId)*.34),px=x+Math.cos(a)*r*.62-Math.sin(a)*0,pz=z+Math.sin(a)*r;
   // an ellipse the shape of the hand: narrower across the palm than along the fingers
   const lx=Math.cos(a)*.66*r/R,lz=Math.sin(a)*r/R,w=at(lx,lz),out=new T.Vector3(w[0]-x,0,w[2]-z).normalize();
   const h=2.4+hash(i*3+ev.palmId)**2*5.2,lean=.25+hash(i*7+ev.palmId)*.35;
   this.spikes.push({x:w[0],y:w[1]-.3,z:w[2],dir:new T.Vector3(out.x*Math.sin(lean),Math.cos(lean),out.z*Math.sin(lean)),h,w:.7+h*.12,born:time+hash(i)*.09,life:6+hash(i+2)*2,spin:hash(i+11)*6.283});
  }
  if(this.spikes.length>SPIKES)this.spikes.splice(0,this.spikes.length-SPIKES);
  it.light=this.lights?.take()??null;if(it.light){it.light.position.set(x,y+R*.9,z);it.light.color.set('#8fd6ff');it.light.distance=R*7;}
 }
 // the hand breaks up where it lies
 _shatter(it){
  const R=PALM.radius,c=Math.cos(it.yaw),s=Math.sin(it.yaw);
  for(let i=0;i<12;i++){const lx=(hash(i+it.id)-.5)*.8,lz=(hash(i*3+it.id)-.5)*1.6,wx=it.x+(lx*c+lz*s)*R,wz=it.z+(-lx*s+lz*c)*R,g=it.groundAt(wx,wz);
   this.debris.burst([wx,g+R*.25,wz],{n:4,direction:[lx,0,lz],speed:6,up:8,spread:1.6,size:[.9,.5,.7],colors:['#e6f5ff','#a9d8f0','#ffffff','#8fc8ec'],life:4,ground:g,seed:it.id*13+i});
   if(i%2===0)this.smoke.puff({position:[wx,g+2,wz],velocity:[lx*4,3+hash(i)*3,lz*4],color:'#eaf4fa',size:3.2,grow:2.2,life:3.2,opacity:.55,drag:1.2,lift:.3});}
  this.sparks.burst([it.x,it.y+2,it.z],{n:90,direction:[0,1,0],speed:18,spread:1.8,colors:['#ffffff','#cfefff','#7fd4ff'],life:1.1,gravity:10,drag:1.4,seed:it.id+.5});
 }
 // leaving the ground and coming back to it
 lift(pos){const [x,y,z]=pos;for(let i=0;i<16;i++){const a=i/16*6.283;this.smoke.puff({position:[x+Math.cos(a)*.8,y+.3,z+Math.sin(a)*.8],velocity:[Math.cos(a)*6,1.2+hash(i)*2,Math.sin(a)*6],color:'#f3f7fa',size:1.3,grow:2,life:2.2,opacity:.55,drag:1.8,lift:.3});}
  this.sparks.burst([x,y+.6,z],{n:40,direction:[0,1,0],speed:12,spread:.9,colors:['#ffffff','#bfeaff','#7fd4ff'],life:.9,gravity:3,drag:1.2,seed:x});}
 land(pos){const [x,y,z]=pos,R=PALM.land.radius;
  const ring=new T.Mesh(this.ringGeo,ringMaterial(.7));ring.position.set(x,y+.2,z);this.scene.add(ring);this.rings.push({mesh:ring,age:0,R:R*1.6,life:.45,op:.7});
  for(let i=0;i<20;i++){const a=i/20*6.283;this.smoke.puff({position:[x+Math.cos(a)*1.2,y+.4,z+Math.sin(a)*1.2],velocity:[Math.cos(a)*11,1.6+hash(i)*2,Math.sin(a)*11],color:'#f3f7fa',size:1.7,grow:2,life:2.6,opacity:.58,drag:1.7,lift:.2});}
  this.sparks.burst([x,y+.5,z],{n:50,direction:[0,1,0],speed:13,spread:1.5,colors:['#ffffff','#cfefff','#7fd4ff'],life:.8,gravity:10,drag:1.4,seed:z});}
 update(dt,time){
  const R=PALM.radius;
  for(const it of this.strikes.values()){
   const g=it.hand.group,m=it.hand.mat,cu=it.column.material.uniforms;cu.uTime.value=time;
   if(it.hitAt===null){
    // It gathers high over the valley, fingers raised, and hangs there for a breath; then it comes down, faster and
    // faster, and flattens into the slap.
    // It gathers upright over the target, low enough that the player looking down sees all of it, hangs for a breath,
    // and then comes forward and down as a slap: slowly at first, flat only in the last instant.
    const u=clamp((time-it.calledAt)/Math.max(1e-3,it.impactAt-it.calledAt),0,1),IN=.26,HANG=.46,in_=clamp(u/IN,0,1),d=clamp((u-HANG)/(1-HANG),0,1),fall=1-d*d*d,grow=1-(1-in_)**2;
    g.position.set(it.x,it.y+R*.1+R*1.2*fall+R*.5*(1-grow),it.z);g.rotation.set(1.4*(1-d**3.2)-.12*Math.sin(Math.min(1,u/HANG)*Math.PI)+.03*Math.sin(time*11)*(1-d),it.yaw,0);g.scale.setScalar(R*(.6+.4*grow));
    m.opacity=clamp(u/(IN*.7),0,1);m.emissiveIntensity=.12+.3*u;it.hand.rim.uniforms.uGain.value=1+1.4*u;
    cu.uGain.value=.5*clamp(u*5,0,1)+.6*u;it.mark.material.opacity=.45+.5*u;
    // the shadow closes in to the size of the hand
    it.shade.material.uniforms.uOpacity.value=.12+.7*d*d;
   }else{
    // pressed into the snow, then it breaks up and is gone
    const t=time-it.hitAt,hold=.5,k=clamp((t-hold)/.4,0,1);
    g.position.set(it.x,it.y+R*.06,it.z);g.rotation.set(0,it.yaw,0);g.scale.setScalar(R);m.opacity=(1-k)**1.5;m.emissiveIntensity=.14+.3*Math.max(0,1-t/.2);it.hand.rim.uniforms.uGain.value=(.7+1.1*Math.max(0,1-t/.25))*(1-k);
    cu.uGain.value=1.5*Math.max(0,1-t/.4)**2;it.column.visible=t<.4;
    if(!it.broke&&t>=hold){it.broke=true;this._shatter(it);}
    if(it.light){it.light.intensity=130*Math.max(0,1-t/.7)**2;if(t>.7){this.lights.give(it.light);it.light=null;}}
    if(k>=1){g.visible=false;it.hand.busy=false;this.scene.remove(it.column);it.column.material.dispose();this.strikes.delete(it.id);}
   }
  }
  for(const r of this.rings){r.age+=dt;const u=clamp(r.age/r.life,0,1),s=r.R*(1-(1-u)**2.4)+.5;r.mesh.scale.set(s,1,s);r.mesh.material.opacity=r.op*(1-u)**1.4;}
  for(const r of this.rings.filter(r=>r.age>=r.life)){this.scene.remove(r.mesh);r.mesh.material.dispose();}
  this.rings=this.rings.filter(r=>r.age<r.life);
  for(const p of this.prints){p.age+=dt;p.mesh.material.uniforms.uOpacity.value=1-clamp((p.age-38)/10,0,1);}
  // spikes: out of the ground in a tenth of a second, standing a while, then sinking back
  this.spikes=this.spikes.filter(k=>time-k.born<k.life);let n=0;
  for(const k of this.spikes){
   const t=time-k.born;if(t<0)continue;const up=1-(1-clamp(t/.12,0,1))**3,down=clamp((k.life-t)/1.2,0,1),h=k.h*up*down*(1+.12*Math.max(0,1-t/.3));
   this._q.setFromUnitVectors(this._up,k.dir).multiply(this._q2.setFromAxisAngle(this._up,k.spin));this._m.compose(this._v.set(k.x,k.y,k.z),this._q,this._s.set(k.w,h,k.w));this.spikeMesh.setMatrixAt(n++,this._m);
  }
  this.spikeMesh.count=n;if(n)this.spikeMesh.instanceMatrix.needsUpdate=true;
 }
 _free(mesh){this.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}
 get active(){return this.strikes.size;}
 reset(){
  for(const it of this.strikes.values()){it.hand.group.visible=false;it.hand.busy=false;if(it.mark)this._free(it.mark);if(it.shade)this._free(it.shade);this.scene.remove(it.column);it.column.material.dispose();if(it.light)this.lights.give(it.light);}
  this.strikes.clear();
  for(const p of this.prints)this._free(p.mesh);this.prints=[];
  for(const r of this.rings){this.scene.remove(r.mesh);r.mesh.material.dispose();}this.rings=[];this.spikes=[];this.spikeMesh.count=0;this.aim.visible=false;for(const k of this.keepers)k.visible=false;
 }
 // compile the programs before the first strike
 stage(groundAt){
  for(const k of this.keepers)k.visible=true;
  this.call({palmId:-1,target:[0,groundAt(0,-12),-12],yaw:0,impactAt:.6,delay:.6,time:0},0,groundAt);this.update(.016,.3);this.preview({x:2,z:-10,yaw:0,ready:1},0,groundAt);
  this.spikes.push({x:3,y:groundAt(3,-9),z:-9,dir:new T.Vector3(0,1,0),h:2,w:.5,born:0,life:9,spin:0});this.update(.016,.31);
  const cracks=this.sheet(darken(this.crackTex,'#3f5f8c',1),1);cracks.visible=true;conform(cracks,-3,-9,0,3,groundAt,.1);this.prints.push({mesh:cracks,age:0});
 }
}
