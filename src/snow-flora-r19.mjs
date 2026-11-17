import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createNoise,mulberry,clamp,smooth,lerp} from './snow-noise.mjs';

// Procedural set dressing for the snow world. Every geometry is built once,
// vertex coloured (needles, bark, snow load, rock, ice) and instanced per
// streamed terrain chunk. Unit height = 1 for trees; instances scale them.

const linear=hex=>new T.Color(hex);
function finish(geometry,colors){
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 return geometry;
}

// Snow-laden conifer: a trunk plus stacked drooping skirts. Each skirt is a
// jagged cone (branch tips at alternating radii) with an underside; the top of
// each skirt carries snow which thins toward the drooping tips, like heavy
// powder on spruce boughs. Foliage normals are bent outward from the trunk so
// the crown shades as a soft volume instead of faceted cones.
export function pineGeometry(seed=1,{tiers=10,width=1,snowiness=.75,segments=11}={}){
 const rand=mulberry(seed),pos=[],col=[],nrm=[];
 const needle=linear('#1d3a2c'),needleDeep=linear('#0f2219'),needleLit=linear('#2f5139'),snow=linear('#f2f6fa'),snowShade=linear('#d6e2ee'),bark=linear('#3b2c22');
 const push=(p,n,c)=>{pos.push(p.x,p.y,p.z);nrm.push(n.x,n.y,n.z);col.push(c.r,c.g,c.b);};
 const tmpN=new T.Vector3();
 // trunk
 const trunkSeg=6,trunkTop=.42,tr0=.032*width,tr1=.012*width;
 for(let i=0;i<trunkSeg;i++){
  const a0=i/trunkSeg*Math.PI*2,a1=(i+1)/trunkSeg*Math.PI*2;
  const p=[[Math.cos(a0)*tr0,0,Math.sin(a0)*tr0],[Math.cos(a1)*tr0,0,Math.sin(a1)*tr0],[Math.cos(a1)*tr1,trunkTop,Math.sin(a1)*tr1],[Math.cos(a0)*tr1,trunkTop,Math.sin(a0)*tr1]].map(v=>new T.Vector3(...v));
  const n0=new T.Vector3(Math.cos(a0),0,Math.sin(a0)),n1=new T.Vector3(Math.cos(a1),0,Math.sin(a1));
  push(p[0],n0,bark);push(p[1],n1,bark);push(p[2],n1,bark);push(p[0],n0,bark);push(p[2],n1,bark);push(p[3],n0,bark);
 }
 for(let t=0;t<tiers;t++){
  const f=t/(tiers-1);
  const yBase=.1+Math.pow(f,.92)*.8,height=lerp(.2,.13,f),yTop=yBase+height;
  const radius=(.38*Math.pow(1-f*.93,1.08)+.035)*width*(.9+rand()*.2);
  const seg=f>.8?Math.max(5,Math.round(segments*.64)):segments,rot=rand()*Math.PI*2,droop=lerp(.34,.16,f);
  const apex=new T.Vector3(0,yTop,0),inner=new T.Vector3(0,yBase+height*.18,0);
  const ring=[],mid=[];
  for(let k=0;k<seg;k++){
   const a=rot+k/seg*Math.PI*2+(rand()-.5)*.25,tip=k%2===0;
   const r=radius*(tip?(.92+rand()*.28):(.62+rand()*.14));
   ring.push(new T.Vector3(Math.cos(a)*r,yBase-droop*r+(rand()-.5)*.012,Math.sin(a)*r));
   const rm=r*.55;mid.push(new T.Vector3(Math.cos(a)*rm,lerp(yTop,yBase,.5)-droop*rm*.35,Math.sin(a)*rm));
  }
  const snowTop=rand()<snowiness+.2,load=snowiness*(t===tiers-1?1:.85+rand()*.3);
  const outward=(p,face)=>{tmpN.set(p.x,0,p.z);if(tmpN.lengthSq()<1e-6)tmpN.set(0,0,0);else tmpN.normalize();return tmpN.clone().multiplyScalar(.75).add(face).normalize();};
  const colourAt=(level,k)=>{
   // level: 0 apex (snow cap on the bough), 1 mid ring, 2 drooping tips
   if(level===0)return snowTop?snow:needleLit;
   if(level===1)return rand()<load*.58?snowShade:needleLit;
   return rand()<load*.1?snowShade:(k%2?needleDeep:needle);
  };
  const cm=mid.map((_,k)=>colourAt(1,k)),cr=ring.map((_,k)=>colourAt(2,k));
  for(let k=0;k<seg;k++){
   const k2=(k+1)%seg;
   // upper surface: apex -> mid ring -> outer ring (two bands)
   const fN=new T.Vector3().subVectors(mid[k2],apex).cross(new T.Vector3().subVectors(mid[k],apex)).normalize();
   if(fN.y<0)fN.negate();
   push(apex,outward(apex,fN),colourAt(0,k));push(mid[k2],outward(mid[k2],fN),cm[k2]);push(mid[k],outward(mid[k],fN),cm[k]);
   const gN=new T.Vector3().subVectors(ring[k2],mid[k]).cross(new T.Vector3().subVectors(ring[k],mid[k])).normalize();if(gN.y<0)gN.negate();
   push(mid[k],outward(mid[k],gN),cm[k]);push(mid[k2],outward(mid[k2],gN),cm[k2]);push(ring[k2],outward(ring[k2],gN),cr[k2]);
   push(mid[k],outward(mid[k],gN),cm[k]);push(ring[k2],outward(ring[k2],gN),cr[k2]);push(ring[k],outward(ring[k],gN),cr[k]);
   // underside, dark
   const uN=new T.Vector3(0,-1,0);
   push(inner,uN,needleDeep);push(ring[k],outward(ring[k],uN),needleDeep);push(ring[k2],outward(ring[k2],uN),needleDeep);
  }
 }
 // leader tip
 const tip=new T.Vector3(0,1.0,0),tb=.92;
 for(let k=0;k<5;k++){const a0=k/5*Math.PI*2,a1=(k+1)/5*Math.PI*2,p0=new T.Vector3(Math.cos(a0)*.025*width,tb,Math.sin(a0)*.025*width),p1=new T.Vector3(Math.cos(a1)*.025*width,tb,Math.sin(a1)*.025*width),n=new T.Vector3(Math.cos(a0),.4,Math.sin(a0)).normalize();push(p0,n,needle);push(p1,n,needle);push(tip,new T.Vector3(0,1,0),snow);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nrm,3));
 return finish(g,col);
}

// Boulder: displaced icosphere, squashed, faceted; snow on upward facets with
// a noisy boundary; lichen-dark granite elsewhere.
export function rockGeometry(seed=3,{flat=.62}={}){
 const N=createNoise(seed),base=new T.IcosahedronGeometry(1,2),p=base.attributes.position,v=new T.Vector3();
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i);const d=v.clone().normalize();
  const r=.72+.5*N.fbm(d.x*1.6+seed,d.y*1.6+d.z*1.3,4)+.12*N.ridged(d.x*3+d.z,d.y*3,3);
  v.copy(d).multiplyScalar(r);v.y*=flat;if(v.y<-.25)v.y=-.25-(v.y+.25)*.2;p.setXYZ(i,v.x,v.y,v.z);
 }
 base.computeVertexNormals();
 const nrm=base.attributes.normal,col=[],rockA=linear('#2f3439'),rockB=linear('#585a5c'),snow=linear('#eef3f7');
 for(let i=0;i<p.count;i+=3){
  const ny=(nrm.getY(i)+nrm.getY(i+1)+nrm.getY(i+2))/3;
  const cx=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,cz=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
  const s=ny+(N.fbm(cx*2.1,cz*2.1,3)-.5)*.6>.48;
  const c=s?snow:rockA.clone().lerp(rockB,N.fbm(cx*4+seed,cz*4,2));
  for(let k=0;k<3;k++)col.push(c.r,c.g,c.b);
 }
 return finish(base,col);
}

// Dry alpine grass tuft breaking through wind-scoured snow: a clump of thin,
// curved, tapering blades (ochre, straw and dark olive) rooted in a dark base.
// Built at 1 m height; instances scale it to .2-.5 m. Normals lean outward and
// up so the clump shades as a soft volume from both faces.
export function grassTuftGeometry(seed=9,{blades=18}={}){
 const rand=mulberry(seed),pos=[],col=[],nrm=[];
 const tips=[linear('#7a6239'),linear('#8c7446'),linear('#5f5634'),linear('#6b5230')],root=linear('#1e1912');
 const up=new T.Vector3(0,1,0);
 for(let i=0;i<blades;i++){
  const a=rand()*Math.PI*2,r=Math.sqrt(rand())*.13,h=.5+rand()*.5,lean=.18+rand()*.5,w=.016+rand()*.012;
  const dir=new T.Vector3(Math.cos(a),0,Math.sin(a)),side=new T.Vector3(-dir.z,0,dir.x),base=dir.clone().multiplyScalar(r);
  const tip=tips[Math.floor(rand()*tips.length)],segs=4,pts=[];
  for(let k=0;k<=segs;k++){const t=k/segs;pts.push(base.clone().addScaledVector(dir,lean*h*t*t).add(new T.Vector3(0,h*t*(1-.18*lean*t),0)));}
  const n=dir.clone().multiplyScalar(.55).add(up).normalize();
  for(let k=0;k<segs;k++){
   const t0=k/segs,t1=(k+1)/segs,w0=w*(1-t0*.9),w1=w*(1-t1*.9);
   const c0=root.clone().lerp(tip,Math.min(1,t0*1.6)),c1=root.clone().lerp(tip,Math.min(1,t1*1.6));
   const A=pts[k].clone().addScaledVector(side,-w0),B=pts[k].clone().addScaledVector(side,w0),C=pts[k+1].clone().addScaledVector(side,w1),D=pts[k+1].clone().addScaledVector(side,-w1);
   for(const [p,c] of [[A,c0],[B,c0],[C,c1],[A,c0],[C,c1],[D,c1]]){pos.push(p.x,p.y,p.z);nrm.push(n.x,n.y,n.z);col.push(c.r,c.g,c.b);}
  }
 }
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nrm,3));
 return finish(g,col);
}

// Glacial serac: a leaning tower of fractured ice. r19 drew a six-sided crystal in three flat blues, which
// read as a toy prism. A serac is a block that has split off the glacier: frosted white-blue outside, clean
// blue only in the fracture faces and under overhangs, broken into steps, with snow on every ledge and on
// its truncated top. Faces stay planar across a fracture (creased between columns) and smooth up it.
export function iceSpireGeometry(seed=5){
 const rand=mulberry(seed),seg=11,levels=10,pos=[],col=[],nrm=[];
 const frost=linear('#c9dde8'),blue=linear('#5d9bb8'),deep=linear('#2f6a88'),snow=linear('#f1f5f9');
 const lean=new T.Vector2((rand()-.5)*.3,(rand()-.5)*.3);
 // each column is one fracture plane: its own bearing and how far it stands in or out
 const cols=Array.from({length:seg},(_,k)=>({a:(k+(rand()-.5)*.7)/seg*Math.PI*2,out:.72+rand()*.5,cut:rand()}));
 // the tower narrows in a few steps (where blocks have broken away), not a smooth taper
 const steps=[.24+rand()*.1,.5+rand()*.1,.74+rand()*.08];
 const radius=f=>{let r=lerp(.3,.19,Math.pow(f,.9));for(const s of steps)if(f>s)r*=.8;return r*(f>.97?.6:1);};
 const rings=Array.from({length:levels},(_,l)=>{const f=l/(levels-1),r=radius(f);
  return cols.map(c=>{const rr=r*c.out*(.93+rand()*.14);return new T.Vector3(Math.cos(c.a)*rr+lean.x*f*f,f,Math.sin(c.a)*rr+lean.y*f*f);});});
 const faceN=(a,b,c,d)=>new T.Vector3().subVectors(c,a).cross(new T.Vector3().subVectors(d,b)).normalize();
 const N=[];for(let l=0;l<levels-1;l++){N.push([]);for(let k=0;k<seg;k++){const n=faceN(rings[l][k],rings[l][(k+1)%seg],rings[l+1][(k+1)%seg],rings[l+1][k]);if(n.x*rings[l][k].x+n.z*rings[l][k].z<0)n.negate();N[l].push(n);}}
 const vN=(l,k)=>{const n=new T.Vector3();if(l>0)n.add(N[l-1][k]);if(l<levels-1)n.add(N[l][k]);return n.normalize();};
 const patch=Array.from({length:levels*seg},()=>rand());
 const tone=(l,k,n)=>{const f=l/(levels-1),c=frost.clone().lerp(blue,clamp((1.0-cols[k].out)*1.1+patch[l*seg+k]*.5-.12,0,.75)).lerp(deep,clamp(.45-f*1.6,0,1)*.5+clamp(-n.y*1.5,0,.5));
  return c.lerp(snow,clamp((n.y-.28)/.3,0,1));};
 const push=(p,n,c)=>{pos.push(p.x,p.y,p.z);nrm.push(n.x,n.y,n.z);col.push(c.r,c.g,c.b);};
 for(let l=0;l<levels-1;l++)for(let k=0;k<seg;k++){
  const k1=(k+1)%seg,a=rings[l][k],b=rings[l][k1],c=rings[l+1][k1],d=rings[l+1][k],n0=vN(l,k),n1=vN(l+1,k);
  const c0=tone(l,k,N[l][k]),c1=tone(l+1,k,N[l][k]);
  for(const [p,n,cc] of [[a,n0,c0],[c,n1,c1],[b,n0,c0],[a,n0,c0],[d,n1,c1],[c,n1,c1]])push(p,n,cc);
 }
 // snow cap over the broken top
 {const top=rings[levels-1],centre=top.reduce((s,p)=>s.add(p),new T.Vector3()).multiplyScalar(1/seg).add(new T.Vector3(0,.035,0)),up=new T.Vector3(0,1,0);
  for(let k=0;k<seg;k++){const a=top[k],b=top[(k+1)%seg],na=new T.Vector3(a.x-centre.x,.9,a.z-centre.z).normalize(),nb=new T.Vector3(b.x-centre.x,.9,b.z-centre.z).normalize();
   push(a,na,snow);push(centre,up,snow);push(b,nb,snow);}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nrm,3));
 return finish(g,col);
}

// Snow route marker: slim dark pole with a retro-reflective orange top band,
// the kind lining real mountain roads. Built at 1 m height.
export function markerPoleGeometry(){
 const shaft=new T.CylinderGeometry(.018,.022,1,6,1);shaft.translate(0,.5,0);
 const band=new T.CylinderGeometry(.024,.024,.16,6,1);band.translate(0,.86,0);
 const band2=new T.CylinderGeometry(.024,.024,.05,6,1);band2.translate(0,.7,0);
 const cs=[[shaft,linear('#1a1d20')],[band,linear('#ff6a1f')],[band2,linear('#ff6a1f')]];
 const geos=cs.map(([g,c])=>{const n=g.toNonIndexed(),arr=[];for(let i=0;i<n.attributes.position.count;i++)arr.push(c.r,c.g,c.b);n.setAttribute('color',new T.Float32BufferAttribute(arr,3));n.deleteAttribute('uv');return n;});
 return mergeGeometries(geos,false);
}

// Mountain rescue hut with a heavy snow load, warm window and a radio mast.
export function createRescueHut(materials){
 const g=new T.Group();g.name='rescue hut / procedural';
 const add=(geo,mat,p,r=[0,0,0])=>{const o=new T.Mesh(geo,mat);o.position.set(...p);o.rotation.set(...r);o.castShadow=true;o.receiveShadow=true;g.add(o);return o;};
 const W=3.4,D=2.8,Hh=2.1;
 add(new T.BoxGeometry(W,Hh,D),materials.wood,[0,Hh/2,0]);
 // plank lines
 for(let i=1;i<7;i++)add(new T.BoxGeometry(W+.02,.025,D+.02),materials.woodDark,[0,i*Hh/7,0]);
 // gabled roof, two slabs + snow load
 const roofW=D/2+.55,pitch=.62;
 for(const s of [-1,1]){
  add(new T.BoxGeometry(W+.7,.12,roofW),materials.roof,[0,Hh+Math.sin(pitch)*roofW/2-.02,s*Math.cos(pitch)*roofW/2],[s*pitch,0,0]);
  const snow=add(new T.BoxGeometry(W+.8,.34,roofW+.08,1,1,1),materials.snow,[0,Hh+Math.sin(pitch)*roofW/2+.2,s*(Math.cos(pitch)*roofW/2+.04)],[s*pitch,0,0]);snow.castShadow=true;
 }
 // gable triangles
 const tri=new T.BufferGeometry();const th=Math.sin(pitch)*roofW*.98,tw=D/2+.02;
 tri.setAttribute('position',new T.Float32BufferAttribute([0,0,-tw,0,0,tw,0,th,0],3));tri.computeVertexNormals();
 for(const s of [-1,1]){const o=add(tri,materials.wood,[s*(W/2+.001),Hh,0],[0,s>0?0:Math.PI,0]);o.material=materials.wood;}
 // door + windows (warm)
 add(new T.BoxGeometry(.06,1.45,.8),materials.woodDark,[W/2+.03,.72,-.5]);
 add(new T.BoxGeometry(.05,.5,.62),materials.window,[W/2+.03,1.25,.65]);
 add(new T.BoxGeometry(.7,.5,.05),materials.window,[.4,1.25,-D/2-.03]);
 add(new T.BoxGeometry(.7,.5,.05),materials.window,[-.8,1.25,-D/2-.03]);
 // orange rescue band & sign
 add(new T.BoxGeometry(W+.04,.18,D+.04),materials.orange,[0,.25,0]);
 add(new T.BoxGeometry(.06,.36,.9),materials.orange,[W/2+.05,1.9,0]);
 // chimney
 add(new T.BoxGeometry(.32,.9,.32),materials.stone,[-.9,Hh+.75,.35]);
 add(new T.BoxGeometry(.38,.14,.38),materials.snow,[-.9,Hh+1.25,.35]);
 // snow drift against walls
 const drift=new T.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2);
 add(drift,materials.snow,[-W/2-.1,0,0],[0,0,0]).scale.set(.9,.75,D*.62);
 add(drift,materials.snow,[0,0,-D/2-.1]).scale.set(W*.55,.55,.7);
 // radio mast with red beacon
 const mast=add(new T.CylinderGeometry(.035,.05,6.5,6),materials.metal,[-W/2-.9,3.25,-D/2-.4]);
 const light=add(new T.SphereGeometry(.09,10,8),materials.beacon,[-W/2-.9,6.55,-D/2-.4]);light.castShadow=false;
 for(const a of [0,2.1,4.2]){const guy=new T.CylinderGeometry(.006,.006,7.2,4);const o=add(guy,materials.metal,[-W/2-.9+Math.cos(a)*1.6,3.1,-D/2-.4+Math.sin(a)*1.6],[Math.sin(a)*.24,0,-Math.cos(a)*.24]);o.castShadow=false;}
 g.userData.beacon=light;
 return g;
}

export function createPropMaterials(){
 const std=(name,color,roughness=.8,metalness=0,extra={})=>new T.MeshStandardMaterial({name:'snow prop / '+name,color,roughness,metalness,...extra});
 return {
  wood:std('weathered wood','#4a3528',.88),woodDark:std('dark plank','#2a1e17',.9),roof:std('roof metal','#3c4248',.6,.4),
  snow:std('snow load','#f1f5f8',.82),stone:std('stone','#55575a',.92),orange:std('rescue orange','#e8571c',.5,0,{emissive:new T.Color('#5a1a04'),emissiveIntensity:.25}),
  window:std('warm window','#ffcf8a',.4,0,{emissive:new T.Color('#ffb25a'),emissiveIntensity:1.6}),metal:std('galvanised','#8a9096',.45,.75),
  beacon:std('red beacon','#ff3b2a',.3,0,{emissive:new T.Color('#ff2a1a'),emissiveIntensity:3}),
 };
}

// Shared material for instanced vertex-coloured props with gentle wind sway.
// Far instances follow the terrain's far flattening (same uFade window) and
// shrink into the haze, so nothing pops in at the streaming edge.
export function createFloraMaterial({name,roughness=.86,metalness=0,envMapIntensity=.7,sway=0,emissiveBoost=0}={}){
 const m=new T.MeshStandardMaterial({name,vertexColors:true,roughness,metalness,envMapIntensity});
 m.userData.uniforms={uTime:{value:0},uFade:{value:new T.Vector2(118,166)},uSway:{value:sway}};
 m.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,m.userData.uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
uniform float uTime;uniform vec2 uFade;uniform float uSway;varying float vFloraFade;`).replace('#include <begin_vertex>',`#include <begin_vertex>
float floraFlat=0.0;vec4 floraOrigin=vec4(0.0,0.0,0.0,1.0);
#ifdef USE_INSTANCING
{floraOrigin=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);floraFlat=smoothstep(uFade.x,uFade.y,-floraOrigin.z);
 float ph=floraOrigin.x*.37+floraOrigin.z*.21;float h=transformed.y*transformed.y;
 transformed.x+=sin(uTime*1.25+ph)*uSway*h;transformed.z+=cos(uTime*.93+ph*1.3)*uSway*.6*h;
 transformed*=1.0-floraFlat;}
#endif
vFloraFade=floraFlat;`).replace('#include <project_vertex>',`vec4 mvPosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
mvPosition=instanceMatrix*mvPosition;
#endif
mvPosition=modelMatrix*mvPosition;mvPosition.y=mix(mvPosition.y,mvPosition.y-(floraOrigin.y+1.6),floraFlat);
mvPosition=viewMatrix*mvPosition;gl_Position=projectionMatrix*mvPosition;`);
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vFloraFade;');
  if(emissiveBoost>0)shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
totalEmissiveRadiance+=diffuseColor.rgb*smoothstep(.55,.9,diffuseColor.r-diffuseColor.b)*${emissiveBoost.toFixed(2)};`);
 };
 m.customProgramCacheKey=()=>'snow-flora-r19-'+(emissiveBoost>0?'glow':'base');
 return m;
}

// Supply crate with a snow cap and an orange rescue tarp strap.
export function crateGeometry(seed=7){
 const rand=mulberry(seed),wood=linear('#5a4330'),woodDark=linear('#3a2a1e'),snow=linear('#eef3f7'),orange=linear('#e45a1e');
 const parts=[];
 const colored=(g,c)=>{const n=g.index?g.toNonIndexed():g;n.deleteAttribute('uv');const arr=[];for(let i=0;i<n.attributes.position.count;i++)arr.push(c.r,c.g,c.b);n.setAttribute('color',new T.Float32BufferAttribute(arr,3));return n;};
 const body=new T.BoxGeometry(1,.72,.72);body.translate(0,.36,0);parts.push(colored(body,wood));
 for(const x of [-.46,.46]){const g=new T.BoxGeometry(.06,.74,.74);g.translate(x,.36,0);parts.push(colored(g,woodDark));}
 const strap=new T.BoxGeometry(.1,.745,.745);strap.translate((rand()-.5)*.3,.36,0);parts.push(colored(strap,orange));
 const cap=new T.BoxGeometry(1.04,.12,.76);cap.translate(0,.78,0);parts.push(colored(cap,snow));
 const g=mergeGeometries(parts,false);g.computeVertexNormals();return g;
}

// The window-mode protector: a hovering rescue beacon pod (no imported model).
// Fits the gameplay protector volume (half extents .60 x .69 x .41 about the
// anchor): orange/white livery, amber strobe, antenna, four ducted lift fans.
export function createRescueBeacon(){
 const group=new T.Group();group.name='rescue beacon pod / procedural r19';
 const mats={
  shell:new T.MeshStandardMaterial({name:'beacon / white composite',color:'#e9ecee',roughness:.38,metalness:.05}),
  orange:new T.MeshStandardMaterial({name:'beacon / rescue orange',color:'#e5521a',roughness:.42,metalness:.05}),
  dark:new T.MeshStandardMaterial({name:'beacon / graphite',color:'#1f2427',roughness:.55,metalness:.35}),
  metal:new T.MeshStandardMaterial({name:'beacon / brushed alloy',color:'#9aa2a8',roughness:.32,metalness:.85}),
  strobe:new T.MeshStandardMaterial({name:'beacon / amber strobe',color:'#ffb347',emissive:new T.Color('#ff9a22'),emissiveIntensity:2.4,roughness:.25}),
  glow:new T.MeshStandardMaterial({name:'beacon / lift glow',color:'#bfe9ff',emissive:new T.Color('#8fdcff'),emissiveIntensity:1.6,roughness:.3}),
  snow:new T.MeshStandardMaterial({name:'beacon / snow dusting',color:'#f4f7fa',roughness:.85}),
 };
 const add=(geo,mat,p,r=[0,0,0],s=[1,1,1])=>{const o=new T.Mesh(geo,mat);o.position.set(...p);o.rotation.set(...r);o.scale.set(...s);o.castShadow=true;o.receiveShadow=true;group.add(o);return o;};
 const body=new T.CapsuleGeometry(.2,.46,6,18);body.rotateZ(Math.PI/2);
 add(body,mats.shell,[0,0,0],[0,0,0],[1,1.05,1.12]);
 add(new T.CylinderGeometry(.212,.212,.16,24,1,true),mats.orange,[0,0,0],[0,0,Math.PI/2],[1,1.06,1.13]);
 for(const x of [-.31,.31])add(new T.CylinderGeometry(.205,.205,.04,24,1,true),mats.orange,[x,0,0],[0,0,Math.PI/2],[1,1.04,1.11]);
 add(new T.BoxGeometry(.5,.05,.36),mats.dark,[0,-.2,0]);
 // sensor window
 add(new T.SphereGeometry(.09,16,10,0,Math.PI*2,0,Math.PI/2),mats.dark,[0,.02,.2],[Math.PI/2,0,0],[1.2,1,.6]);
 // strobe dome + antenna
 add(new T.CylinderGeometry(.06,.07,.05,16),mats.dark,[0,.235,0]);
 const strobe=add(new T.SphereGeometry(.058,16,10,0,Math.PI*2,0,Math.PI/2),mats.strobe,[0,.26,0]);strobe.castShadow=false;
 add(new T.CylinderGeometry(.007,.01,.42,6),mats.metal,[-.18,.42,-.05]);
 add(new T.SphereGeometry(.014,8,6),mats.orange,[-.18,.635,-.05]);
 // snow dusting on top
 add(new T.SphereGeometry(.2,16,8,0,Math.PI*2,0,Math.PI/3),mats.snow,[0,.06,0],[0,0,0],[1.55,.55,1.05]);
 // four ducted lift fans on struts
 const fans=[];
 for(const [x,z] of [[-.45,-.22],[.45,-.22],[-.45,.22],[.45,.22]]){
  add(new T.BoxGeometry(.24,.03,.04),mats.metal,[x*.62,-.04,z*.8],[0,Math.atan2(z,x),0]);
  add(new T.TorusGeometry(.105,.022,8,24),mats.dark,[x,-.05,z],[Math.PI/2,0,0]);
  const rotor=add(new T.BoxGeometry(.19,.008,.03),mats.metal,[x,-.05,z]);fans.push(rotor);
  const glow=add(new T.CircleGeometry(.085,20),mats.glow,[x,-.075,z],[Math.PI/2,0,0]);glow.castShadow=false;
 }
 group.userData.materials=mats;
 function update(time){strobe.material.emissiveIntensity=1.2+2.4*Math.pow(.5+.5*Math.sin(time*6.2),6);for(let i=0;i<fans.length;i++)fans[i].rotation.y=time*(38+i*3)*(i%2?1:-1);}
 function dispose(){group.traverse(o=>{if(o.geometry)o.geometry.dispose();});for(const m of Object.values(mats))m.dispose();}
 return {group,update,dispose,materials:mats};
}
