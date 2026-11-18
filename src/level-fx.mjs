import * as T from 'three';
import {Fire} from './level-blast.mjs';
import {CrowdView,Debris,Sparks} from './level-crowd.mjs';
import {SkyPalms} from './level-palm.mjs';

// RealShot r23/r24 · set-piece visuals for the free level: supply drops, the hidden
// emblem target, the carpet strike, explosions, enemy beams, rockets, the
// tactical missile and its shockwave, the crowd (level-crowd.mjs) and the
// rescue beacon site. Procedural Three.js only; every light is created up
// front so nothing changes the light count (and recompiles shaders) mid-fight.
const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};
const UP=new T.Vector3(0,1,0);

function canvasTexture(size,draw){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
function puffTexture(){
 return canvasTexture(128,(g,s)=>{
  for(let i=0;i<26;i++){const a=hash(i)*6.283,r=hash(i+40)*s*.22,x=s/2+Math.cos(a)*r,y=s/2+Math.sin(a)*r,R=s*(.16+hash(i+80)*.18),gr=g.createRadialGradient(x,y,0,x,y,R);
   gr.addColorStop(0,'rgba(255,255,255,.16)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,s,s);}
 });
}
function scorchTexture(){
 return canvasTexture(256,(g,s)=>{
  const c=s/2;g.translate(c,c);
  for(let i=0;i<90;i++){const a=hash(i)*6.283,len=c*(.42+hash(i+9)*.56),w=.035+hash(i+5)*.07,gr=g.createLinearGradient(0,0,Math.cos(a)*len,Math.sin(a)*len);
   gr.addColorStop(0,`rgba(16,14,12,${.3+hash(i+3)*.3})`);gr.addColorStop(.55,`rgba(34,30,26,${.12+hash(i+7)*.16})`);gr.addColorStop(1,'rgba(50,46,40,0)');
   g.fillStyle=gr;g.beginPath();g.moveTo(0,0);g.lineTo(Math.cos(a-w)*len,Math.sin(a-w)*len);g.lineTo(Math.cos(a+w)*len,Math.sin(a+w)*len);g.closePath();g.fill();}
  const gr=g.createRadialGradient(0,0,0,0,0,c*.5);gr.addColorStop(0,'rgba(10,9,8,.92)');gr.addColorStop(.5,'rgba(22,19,17,.7)');gr.addColorStop(1,'rgba(40,36,32,0)');g.fillStyle=gr;g.fillRect(-c,-c,s,s);
  for(let i=0;i<160;i++){const a=hash(i+300)*6.283,r=c*(.12+hash(i+310)**.7*.7);g.fillStyle=`rgba(18,16,14,${.2+hash(i+320)*.4})`;g.beginPath();g.arc(Math.cos(a)*r,Math.sin(a)*r,.8+hash(i+330)*3.2,0,6.283);g.fill();}
  g.setTransform(1,0,0,1,0,0);
 });
}
function glowTexture(){
 return canvasTexture(64,(g,s)=>{const gr=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,255,255,.45)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,s,s);});
}
// Placeholder emblem for the hidden target. ?logo=<url> swaps in a supplied
// image (for example the official mark, once its use is cleared).
export function emblemTexture(src=null){
 const tex=canvasTexture(512,(g,s)=>{
  const c=s/2;g.clearRect(0,0,s,s);
  const ring=g.createLinearGradient(0,0,s,s);ring.addColorStop(0,'#fff1b8');ring.addColorStop(.35,'#e2b54a');ring.addColorStop(.7,'#9c6a17');ring.addColorStop(1,'#f3d27a');
  g.fillStyle=ring;g.beginPath();g.arc(c,c,c*.98,0,6.283);g.fill();
  g.fillStyle='#14202a';g.beginPath();g.arc(c,c,c*.84,0,6.283);g.fill();
  g.strokeStyle=ring;g.lineWidth=s*.012;g.beginPath();g.arc(c,c,c*.77,0,6.283);g.stroke();
  // isometric box mark
  g.lineJoin='round';g.lineWidth=s*.03;g.strokeStyle=ring;const r=c*.36,cy=c*.88;
  const P=a=>[c+Math.cos(a)*r,cy+Math.sin(a)*r];const h=[0,1,2,3,4,5].map(i=>P(-Math.PI/2+i*Math.PI/3));
  g.beginPath();h.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();g.stroke();
  g.beginPath();g.moveTo(c,cy);g.lineTo(...h[0]);g.moveTo(c,cy);g.lineTo(...h[2]);g.moveTo(c,cy);g.lineTo(...h[4]);g.stroke();
  g.fillStyle=ring;g.font=`700 ${Math.round(s*.085)}px "Avenir Next","Helvetica Neue",Arial,sans-serif`;g.textAlign='center';g.textBaseline='middle';
  g.fillText('AHOLO',c,c*1.45);
 });
 if(src){const img=new Image();img.onload=()=>{const g=tex.image.getContext('2d'),s=tex.image.width;g.clearRect(0,0,s,s);g.drawImage(img,0,0,s,s);tex.needsUpdate=true;};img.src=src;}
 return tex;
}

// ---------- smoke: one instanced, camera-facing quad per puff, one draw call for all of them ----------
// Puffs are sorted back to front each frame (they blend over each other); the alpine fog chunk only
// needs mvPosition, so they fog exactly like the sprites they replace.
const SMOKE_VERT=`#include <common>
#include <fog_pars_vertex>
attribute vec4 aPos;attribute vec4 aCol;attribute float aRot;
varying vec2 vUv;varying vec4 vCol;
void main(){
 vUv=uv;vCol=aCol;
 vec4 mvPosition=viewMatrix*vec4(aPos.xyz,1.0);
 float c=cos(aRot),s=sin(aRot);
 mvPosition.xy+=vec2(c*position.x-s*position.y,s*position.x+c*position.y)*aPos.w;
 gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`;
const SMOKE_FRAG=`#include <common>
#include <fog_pars_fragment>
uniform sampler2D map;varying vec2 vUv;varying vec4 vCol;
void main(){
 vec4 t=texture2D(map,vUv);
 gl_FragColor=vec4(vCol.rgb*t.rgb,t.a*vCol.a);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #include <fog_fragment>
}`;
class Smoke{
 constructor(scene,cap=520){
  this.cap=cap;this.live=[];this.emitters=new Set();this.c=new T.Color();this.v=new T.Vector3();
  const plane=new T.PlaneGeometry(1,1),geo=new T.InstancedBufferGeometry();
  geo.index=plane.index;geo.setAttribute('position',plane.attributes.position);geo.setAttribute('uv',plane.attributes.uv);
  const attr=(n,k)=>{const a=new T.InstancedBufferAttribute(new Float32Array(n*k),k);a.setUsage(T.DynamicDrawUsage);return a;};
  this.aPos=attr(cap,4);this.aCol=attr(cap,4);this.aRot=attr(cap,1);geo.setAttribute('aPos',this.aPos);geo.setAttribute('aCol',this.aCol);geo.setAttribute('aRot',this.aRot);geo.instanceCount=0;
  const mat=new T.ShaderMaterial({name:'smoke / instanced puffs',uniforms:T.UniformsUtils.merge([T.UniformsLib.fog,{map:{value:null}}]),vertexShader:SMOKE_VERT,fragmentShader:SMOKE_FRAG,transparent:true,depthWrite:false,fog:true});
  mat.uniforms.map.value=puffTexture();
  this.mesh=new T.Mesh(geo,mat);this.mesh.frustumCulled=false;this.mesh.renderOrder=2;this.mesh.name='level smoke';scene.add(this.mesh);this.geo=geo;
 }
 puff({position,velocity=[0,1,0],color='#ffffff',size=1,grow=2,life=3,opacity=.6,drag=.6,lift=0}){
  this.c.set(color);
  this.live.push({p:new T.Vector3(...position),v:new T.Vector3(...velocity),r:this.c.r,g:this.c.g,b:this.c.b,rot:Math.random()*6.283,size,grow,life,age:0,opacity,drag,lift,sc:size,a:0,d:0});
  if(this.live.length>this.cap)this.live.shift();
 }
 emitter(o){const e={rate:6,acc:0,until:Infinity,jitter:.3,...o};this.emitters.add(e);return e;}
 update(dt,time,wind,viewer=null){
  for(const e of this.emitters){
   if(time>e.until){this.emitters.delete(e);continue;}
   e.acc+=dt*e.rate;while(e.acc>=1){e.acc--;const j=e.jitter,p=typeof e.position==='function'?e.position():e.position;if(!p)continue;
    this.puff({position:[p[0]+(Math.random()-.5)*j,p[1]+(Math.random()-.5)*j*.5,p[2]+(Math.random()-.5)*j],velocity:[(Math.random()-.5)*.4+wind[0]*.3,e.rise??1.4,(Math.random()-.5)*.4+wind[2]*.3],color:e.color,size:e.size??.8,grow:e.grow??1.6,life:e.life??5,opacity:e.opacity??.55,lift:e.lift??0});}
  }
  const keep=[];
  for(const q of this.live){
   q.age+=dt;if(q.age>=q.life)continue;
   const f=q.age/q.life;q.v.multiplyScalar(Math.exp(-q.drag*dt));q.v.x+=wind[0]*dt*.5;q.v.z+=wind[2]*dt*.5;q.v.y+=q.lift*dt;
   q.p.addScaledVector(q.v,dt);q.sc=q.size+q.grow*Math.sqrt(q.age);q.a=q.opacity*Math.min(1,q.age/.18)*(1-f)**1.4;
   if(viewer)q.d=q.p.distanceToSquared(viewer);keep.push(q);
  }
  this.live=keep;
  const list=viewer?keep.slice().sort((a,b)=>b.d-a.d):keep,P=this.aPos.array,C=this.aCol.array,R=this.aRot.array;
  for(let i=0;i<list.length;i++){const q=list[i];P[i*4]=q.p.x;P[i*4+1]=q.p.y;P[i*4+2]=q.p.z;P[i*4+3]=q.sc;C[i*4]=q.r;C[i*4+1]=q.g;C[i*4+2]=q.b;C[i*4+3]=q.a;R[i]=q.rot;}
  this.geo.instanceCount=list.length;this.aPos.needsUpdate=this.aCol.needsUpdate=this.aRot.needsUpdate=true;
 }
 reset(){this.live=[];this.emitters.clear();this.geo.instanceCount=0;}
 get count(){return this.live.length;}
}

// ---------- supply drops ----------
function chuteGeometry(){
 const g=new T.SphereGeometry(2.6,24,7,0,Math.PI*2,0,Math.PI*.42),p=g.attributes.position,col=[];
 const orange=new T.Color('#d8541f').convertSRGBToLinear(),white=new T.Color('#e9e6dd').convertSRGBToLinear();
 for(let i=0;i<p.count;i++){const a=Math.atan2(p.getZ(i),p.getX(i)),k=Math.floor(((a+Math.PI)/(Math.PI*2))*12+.0001)%2,c=k?orange:white;col.push(c.r,c.g,c.b);}
 g.setAttribute('color',new T.Float32BufferAttribute(col,3));g.translate(0,-1.2,0);return g;
}
function crateKit(){
 return {
  body:new T.BoxGeometry(1.2,.66,.82),rib:new T.BoxGeometry(.06,.7,.86),lid:new T.BoxGeometry(1.24,.1,.86),strapGeo:new T.BoxGeometry(.09,.7,.85),
  strobe:new T.SphereGeometry(.05,10,8),chute:chuteGeometry(),
  paint:new T.MeshStandardMaterial({name:'drop case / signal orange',color:'#e8641c',roughness:.56,metalness:.12,emissive:new T.Color('#e8641c'),emissiveIntensity:.16}),
  paintGold:new T.MeshStandardMaterial({name:'drop case / gold paint',color:'#c79a35',roughness:.34,metalness:.72,emissive:new T.Color('#c79a35'),emissiveIntensity:.14}),
  steel:new T.MeshStandardMaterial({name:'drop case / steel',color:'#3a3e41',roughness:.45,metalness:.8}),
  strap:new T.MeshStandardMaterial({name:'drop case / black strap',color:'#15171a',roughness:.75}),
  strapGold:new T.MeshStandardMaterial({name:'drop case / gold strap',color:'#f0cf6a',roughness:.35,metalness:.6,emissive:new T.Color('#5a3d05'),emissiveIntensity:.6}),
  strobeOn:new T.MeshStandardMaterial({color:'#ff4b2b',emissive:new T.Color('#ff2a12'),emissiveIntensity:0}),
  chuteMat:new T.MeshStandardMaterial({name:'drop chute / nylon',vertexColors:true,side:T.DoubleSide,roughness:.86,transparent:true,opacity:1}),
  line:new T.LineBasicMaterial({color:'#2d2a26',transparent:true,opacity:.75}),
  // r27: the organiser's marks on a black plate, on both long sides and the lid (the picture the user supplied)
  plate:new T.PlaneGeometry(1.14,.227),plateEnd:new T.PlaneGeometry(.76,.151),plateMat:brandPlate(),
 };
}
const DROP_SCALE=1.55;
// the canopy: its rim (radius, height from the canopy's origin), where it hangs over the crate and how far aside it comes to rest
const RIM=[2.6*Math.sin(Math.PI*.42),2.6*Math.cos(Math.PI*.42)-1.2],CHUTE_Y=7.4,CHUTE_TOP=CHUTE_Y+1.4,CHUTE_AWAY=4.5,CRATE_TOP=.78*DROP_SCALE;
function brandPlate(){
 const m=new T.MeshStandardMaterial({name:'drop case / brand plate',color:'#ffffff',roughness:.42,metalness:.1,emissive:new T.Color('#ffffff'),emissiveIntensity:.75});
 if(typeof document!=='undefined')new T.TextureLoader().load('assets/brand/aholo-manycore.png',t=>{t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;m.map=t;m.emissiveMap=t;m.needsUpdate=true;},undefined,()=>{m.color.set('#0b0c0e');m.emissiveIntensity=0;});
 else m.color.set('#0b0c0e');
 return m;
}
// a column of light over something worth walking to. Light only: adds colour, leaves alpha alone (see BeaconSite).
// uGap = [from, to] in metres above its foot: that stretch stays dark, so the column never runs through what stands in it.
function lightShaft(color,height=70,r0=.1,r1=.5,gain=1.6){
 const m=new T.Mesh(new T.CylinderGeometry(r1,r0,height,18,1,true),new T.ShaderMaterial({transparent:true,premultipliedAlpha:true,depthWrite:false,blending:T.AdditiveBlending,fog:false,toneMapped:false,side:T.DoubleSide,
  uniforms:{uColor:{value:new T.Color(color)},uGain:{value:gain},uTime:{value:0},uH:{value:height},uGap:{value:new T.Vector2(-10,-10)}},
  vertexShader:`uniform float uH;varying vec3 vN,vV;varying float vH;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalMatrix*normal;vV=-mv.xyz;vH=position.y+uH*.5;gl_Position=projectionMatrix*mv;}`,
  fragmentShader:`uniform vec3 uColor;uniform float uGain,uTime,uH;uniform vec2 uGap;varying vec3 vN,vV;varying float vH;void main(){
   float f=abs(dot(normalize(vN),normalize(vV))),a=pow(f,2.2);
   float h=smoothstep(0.,1.2,vH)*(.35+.65*exp(-vH*.05))*(1.-smoothstep(uH*.55,uH,vH))*(1.-smoothstep(uGap.x-1.5,uGap.x,vH)*(1.-smoothstep(uGap.y,uGap.y+1.5,vH))),run=.8+.2*sin(vH*1.1-uTime*9.);
   gl_FragColor=vec4(uColor*a*h*run*uGain*smoothstep(2.,7.,length(vV))*.5,0.);}`}));
 m.position.y=height/2;m.renderOrder=3;m.frustumCulled=false;return m;
}
class Airdrops{
 constructor(scene,smoke,lights,fire){this.scene=scene;this.smoke=smoke;this.lights=lights;this.fire=fire;this.kit=crateKit();this.items=new Map();}
 incoming(ev){
  const k=this.kit,gold=ev.gold,group=new T.Group();group.name=`supply drop / ${ev.dropId}`;
  const crate=new T.Group();crate.scale.setScalar(DROP_SCALE);group.add(crate);
  const add=(geo,mat,parent,pos)=>{const m=new T.Mesh(geo,mat);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;};
  add(k.body,gold?k.paintGold:k.paint,crate,[0,.33,0]);for(const x of [-.58,.58])add(k.rib,k.steel,crate,[x,.35,0]);for(const x of [-.3,.3])add(k.strapGeo,gold?k.strapGold:k.strap,crate,[x,.35,0]);
  const hinge=new T.Group();hinge.position.set(0,.68,-.43);crate.add(hinge);add(k.lid,gold?k.paintGold:k.paint,hinge,[0,.05,.43]);
  for(const s of [-1,1]){const pl=new T.Mesh(k.plate,k.plateMat);pl.position.set(0,.36,s*.434);pl.rotation.y=s>0?0:Math.PI;pl.receiveShadow=true;crate.add(pl);}
  for(const s of [-1,1]){const pl=new T.Mesh(k.plateEnd,k.plateMat);pl.position.set(s*.614,.36,0);pl.rotation.y=s*Math.PI/2;pl.receiveShadow=true;crate.add(pl);}
  const top=new T.Mesh(k.plate,k.plateMat);top.rotation.x=-Math.PI/2;top.position.set(0,.103,.43);hinge.add(top);
  // the column stands where the crate will land from the moment it is called
  const shaft=lightShaft(gold?'#ffc861':'#ff6a3c',80,.2,1.1);shaft.position.set(ev.position[0],ev.position[1]-18,ev.position[2]);this.scene.add(shaft);
  const strobeMat=k.strobeOn.clone();const strobe=add(k.strobe,strobeMat,crate,[.45,.78,.3]);strobe.castShadow=false;
  const chute=new T.Mesh(k.chute,k.chuteMat.clone());chute.position.y=CHUTE_Y;chute.castShadow=true;group.add(chute);
  const pts=[];for(let i=0;i<8;i++){const a=i/8*Math.PI*2;pts.push(Math.cos(a)*RIM[0],7.4+RIM[1],Math.sin(a)*RIM[0], Math.sign(Math.cos(a))*.5*DROP_SCALE,.75*DROP_SCALE,Math.sign(Math.sin(a))*.35*DROP_SCALE);}
  const lg=new T.BufferGeometry();lg.setAttribute('position',new T.Float32BufferAttribute(pts,3));const lines=new T.LineSegments(lg,k.line.clone());group.add(lines);
  group.position.set(...ev.position);this.scene.add(group);
  const ground=[ev.position[0]+1.3,null,ev.position[2]+.95];   // the marker flare: beside where the crate comes down, not under it
  const flare=this.fire.emitter({position:()=>ground[1]===null?null:[ground[0],ground[1]+.2,ground[2]],rate:6,make:p=>({position:[p[0]+(Math.random()-.5)*.25,p[1],p[2]+(Math.random()-.5)*.25],velocity:[(Math.random()-.5)*.3,1.9+Math.random()*.6,(Math.random()-.5)*.3],color:gold?'#d9a531':'#c2301c',size:.4,grow:1.15,life:6+Math.random()*2,opacity:.6,drag:.25,lift:.2})});
  this.items.set(ev.dropId,{id:ev.dropId,gold,group,crate,hinge,chute,lines,strobe,strobeMat,shaft,flare,ground,state:'falling',landedAt:null,openedAt:null,light:null,lay:null});
 }
 update(drops,time,groundAt){
  const seen=new Set();
  for(const d of drops){
   const it=this.items.get(d.id);if(!it)continue;seen.add(d.id);
   it.group.position.set(...d.position);if(it.ground[1]===null)it.ground[1]=groundAt(it.ground[0],it.ground[2]);
   // the column: while the crate is coming down it stops under the crate and starts again over the canopy
   const foot=d.state==='falling'?groundAt(d.position[0],d.position[2]):d.position[1];it.shaft.position.set(d.position[0],foot+40,d.position[2]);
   if(d.state==='falling'){const h=d.position[1]-foot;it.shaft.material.uniforms.uGap.value.set(h-.5,h+CHUTE_TOP+.8);}
   if(d.state==='falling'){const sw=Math.sin(time*1.3+d.id)*.06;it.group.rotation.set(sw,Math.sin(time*.45+d.id*2.1)*.3,Math.cos(time*1.1+d.id)*.05);}
   if(d.state==='landed'&&it.state==='falling'){it.state='landed';it.landedAt=time;it.group.rotation.set(0,it.group.rotation.y,0);it.light=this.lights.take();
    // the canopy comes to rest on the most level ground around the crate (never up a bank), lying on that ground
    let best=null;for(let i=0;i<8;i++){const a=i/8*Math.PI*2+.4,x=d.position[0]+Math.cos(a)*CHUTE_AWAY,z=d.position[2]+Math.sin(a)*CHUTE_AWAY,g=groundAt(x,z),m=groundAt(d.position[0]+Math.cos(a)*2.2,d.position[2]+Math.sin(a)*2.2),cost=Math.abs(g-d.position[1])+Math.max(0,g-d.position[1])*3+Math.max(0,m-d.position[1])*3+i*.001;if(!best||cost<best.cost)best={cost,a,g};}
    it.lay={a:best.a+it.group.rotation.y,y:best.g-d.position[1]+.16};}
  }
  for(const it of this.items.values()){
   const su=it.shaft.material.uniforms;su.uTime.value=time;su.uGain.value=it.state==='opened'?Math.max(0,2.4*(1-(time-it.openedAt)/.8)):2.4;it.shaft.visible=su.uGain.value>.01;
   if(it.state==='falling')continue;
   const age=time-it.landedAt,col=clamp(age/1.6,0,1);
   const lay=col*col*(3-2*col),L=it.lay??{a:0,y:.12};it.chute.position.set(Math.cos(L.a)*lay*CHUTE_AWAY,lerp(CHUTE_Y,L.y,lay),Math.sin(L.a)*lay*CHUTE_AWAY);it.chute.scale.set(1+lay*.15,lerp(1,.07,lay),1+lay*.15);it.chute.quaternion.setFromAxisAngle((this.ax??(this.ax=new T.Vector3())).set(Math.sin(L.a),0,-Math.cos(L.a)),Math.sin(lay*Math.PI)*.5+lay*.06);it.chute.material.opacity=1-clamp((age-8)/3,0,1);it.chute.visible=age<11;
   // the lines stay on the rim while the canopy comes down, and go slack with it
   it.lines.visible=age<1.5;if(it.lines.visible){it.chute.updateMatrix();const lp=it.lines.geometry.attributes.position,v=this.v??(this.v=new T.Vector3());for(let i=0;i<8;i++){const a=i/8*Math.PI*2;v.set(Math.cos(a)*RIM[0],RIM[1],Math.sin(a)*RIM[0]).applyMatrix4(it.chute.matrix);lp.setXYZ(i*2,v.x,v.y,v.z);}lp.needsUpdate=true;it.lines.material.opacity=.75*(1-clamp((age-.9)/.6,0,1));}
   // the column comes back down to the lid once the canopy is out of its way
   {const u=clamp((age-1)/.9,0,1);it.shaft.material.uniforms.uGap.value.set(-5,lerp(CHUTE_TOP+.8,CRATE_TOP+.15,u*u*(3-2*u)));}
   const blink=it.state==='opened'?0:Math.pow(.5+.5*Math.sin(time*7.5),12);it.strobeMat.emissiveIntensity=blink*8;
   if(it.light){it.light.position.copy(it.group.position).add(new T.Vector3(.7,1.5,.5));it.light.color.set(it.gold?'#ffc861':'#ff4628');it.light.intensity=it.state==='opened'?0:blink*6+(it.gold?2.5:0);it.light.distance=9;}
   if(it.state==='opened'){const o=clamp((time-it.openedAt)/.6,0,1);it.hinge.rotation.x=-o*1.9;if(time-it.openedAt>12)it.flare.until=0;}
  }
 }
 opened(ev,time){const it=this.items.get(ev.dropId);if(!it)return;it.state='opened';it.openedAt=time;if(it.light){this.lights.give(it.light);it.light=null;}}
 reset(){for(const it of this.items.values()){this.scene.remove(it.group);this.scene.remove(it.shaft);it.lines.geometry.dispose();it.lines.material.dispose();it.chute.material.dispose();it.strobeMat.dispose();it.shaft.geometry.dispose();it.shaft.material.dispose();if(it.light)this.lights.give(it.light);}this.items.clear();}
}

// ---------- the hidden emblem target ----------
class EmblemTarget{
 constructor(scene,lights,{logo=null}={}){
  this.scene=scene;this.lights=lights;this.texture=emblemTexture(logo);this.active=null;
  const gold=new T.MeshStandardMaterial({name:'emblem / polished gold',color:'#d9ad48',roughness:.22,metalness:1,emissive:new T.Color('#3b2603'),emissiveIntensity:.5});
  const face=new T.MeshStandardMaterial({name:'emblem / face',map:this.texture,roughness:.35,metalness:.5,emissive:new T.Color('#ffffff'),emissiveMap:this.texture,emissiveIntensity:.35,transparent:true,alphaTest:.02,side:T.DoubleSide});
  const dark=new T.MeshStandardMaterial({name:'emblem / graphite frame',color:'#1d2226',roughness:.4,metalness:.8});
  const glow=new T.SpriteMaterial({map:glowTexture(),color:'#ffd36b',transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.55});
  this.mats={gold,face,dark,glow};
  const g=new T.Group();g.name='hidden emblem target';
  const disc=new T.Mesh(new T.CircleGeometry(.86,64),face);g.add(disc);
  const ring=new T.Mesh(new T.TorusGeometry(.92,.07,14,72),gold);g.add(ring);
  const back=new T.Mesh(new T.CylinderGeometry(.88,.88,.08,48),dark);back.rotation.x=Math.PI/2;back.position.z=-.06;g.add(back);
  for(const s of [-1,1]){const pod=new T.Mesh(new T.CylinderGeometry(.13,.16,.42,16),dark);pod.rotation.z=Math.PI/2;pod.position.set(s*1.12,0,-.05);g.add(pod);const fan=new T.Mesh(new T.TorusGeometry(.2,.025,8,24),gold);fan.rotation.y=Math.PI/2;fan.position.set(s*1.34,0,-.05);g.add(fan);}
  const halo=new T.Sprite(glow);halo.scale.set(3.4,3.4,1);halo.position.z=-.2;g.add(halo);
  g.traverse(o=>{if(o.isMesh){o.castShadow=true;}});g.visible=false;scene.add(g);this.group=g;this.halo=halo;this.light=null;
 }
 spawn(e){this.active={id:e.enemyId,hitAt:-9};this.group.visible=true;this.light=this.lights.take();}
 hit(time){if(this.active)this.active.hitAt=time;}
 update(enemy,time,viewer){
  if(!this.active)return;
  if(!enemy){this.hide();return;}
  this.group.position.set(enemy.x,enemy.y,enemy.z);
  const toward=viewer?Math.atan2(viewer.x-enemy.x,viewer.z-enemy.z):0;
  this.group.rotation.set(Math.sin(time*1.7)*.12,toward+Math.sin(time*.9)*.35,Math.sin(time*2.3)*.08);
  const hurt=clamp(1-(time-this.active.hitAt)/.25,0,1),glint=Math.pow(.5+.5*Math.sin(time*2.6),18);
  this.mats.face.emissiveIntensity=.3+glint*.9+hurt*1.2;this.mats.glow.opacity=.35+glint*.5+hurt*.5;
  if(this.light){this.light.position.copy(this.group.position);this.light.color.set('#ffcf6a');this.light.intensity=3+glint*10+hurt*12;this.light.distance=18;}
 }
 hide(){this.group.visible=false;this.active=null;if(this.light){this.lights.give(this.light);this.light=null;}}
 reset(){this.hide();}
}

// ---------- explosions ----------
class Explosions{
 constructor(scene,lights,fire,sparks){this.scene=scene;this.lights=lights;this.fire=fire;this.sparks=sparks;this.list=[];this.scorch=[];this.scorchTex=scorchTexture();this.scorchGeo=new T.PlaneGeometry(1,1);this.seq=0;
  this.ringGeo=new T.RingGeometry(.72,1,64);this.ringTex=canvasTexture(64,(g,s)=>{const gr=g.createLinearGradient(0,0,s,0);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(.75,'rgba(255,255,255,.9)');gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.fillRect(0,0,s,s);});
  {const uv=this.ringGeo.attributes.uv,p=this.ringGeo.attributes.position;for(let i=0;i<uv.count;i++)uv.setXY(i,(Math.hypot(p.getX(i),p.getY(i))-.72)/.28,.5);}
  this.flashMat=new T.SpriteMaterial({map:glowTexture(),color:'#ffd9a0',transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});}
 // size: 0 small, 1 big, 2 huge
 trigger({position,radius=4,big=false,huge=false,ground=null,normal=[0,1,0]}){
  const seed=++this.seq*13.7,size=huge?2:big?1:0,R=radius*(huge?.8:big?.56:.5),up=new T.Vector3(...normal).normalize();
  this.fire.blast(position,R,{size,up:up.toArray(),ground:ground!==null,seed});
  this.sparks.burst([position[0],position[1]+.3,position[2]],{n:[26,48,90][size],direction:up.toArray(),speed:R*4.2,spread:1.5,colors:['#fff3cf','#ffc15c','#ff7a26','#ff4a12'],life:[.9,1.3,2][size],gravity:7,drag:1.1,seed});
  const flash=new T.Sprite(this.flashMat.clone());flash.material.color.setRGB(3,2.2,1.3);flash.position.set(position[0],position[1]+R*.3,position[2]);flash.scale.setScalar(R*1.7);this.scene.add(flash);
  let ring=null;
  if(ground!==null){
   ring=new T.Mesh(this.ringGeo,new T.MeshBasicMaterial({map:this.ringTex,color:'#fff0dc',transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-5}));
   ring.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),up);ring.position.set(position[0],ground+.08,position[2]);this.scene.add(ring);
   const s=new T.Mesh(this.scorchGeo,new T.MeshBasicMaterial({map:this.scorchTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,opacity:.95}));
   s.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),up);s.rotateZ(hash(seed)*6.283);s.position.set(position[0],ground+.03,position[2]);s.scale.setScalar(R*(2.5+hash(seed+2)*.5));this.scene.add(s);this.scorch.push({s,age:0});if(this.scorch.length>40){const o=this.scorch.shift();this.scene.remove(o.s);o.s.material.dispose();}}
  const light=this.lights.take();if(light){light.position.set(position[0],position[1]+1.2,position[2]);light.color.set('#ff9440');light.distance=R*11;}
  this.list.push({flash,ring,light,R,age:0,life:[.6,.75,1.2][size],seed});
 }
 update(dt){
  for(const b of this.list){
   b.age+=dt;const t=b.age,R=b.R,k=clamp(1-t/b.life,0,1);
   b.flash.material.opacity=Math.max(0,1-t/.11);b.flash.visible=t<.11;b.flash.scale.setScalar(R*(1.7+t*7));
   if(b.ring){const u=clamp(t/.3,0,1),r=R*(.5+2.7*(1-(1-u)**2.2));b.ring.scale.set(r,r,r);b.ring.material.opacity=.5*(1-u)**1.5;b.ring.visible=u<1;}
   if(b.light)b.light.intensity=110*(R/3)*k*k*(.8+.2*Math.sin(t*61+b.seed));
  }
  for(const b of this.list.filter(b=>b.age>=b.life))this._drop(b);
  this.list=this.list.filter(b=>b.age<b.life);
  for(const s of this.scorch){s.age+=dt;s.s.material.opacity=.95*(1-clamp((s.age-24)/10,0,1));}
 }
 _drop(b){this.scene.remove(b.flash);b.flash.material.dispose();if(b.ring){this.scene.remove(b.ring);b.ring.material.dispose();}if(b.light){b.light.intensity=0;this.lights.give(b.light);}}
 reset(){for(const b of this.list)this._drop(b);this.list=[];for(const s of this.scorch){this.scene.remove(s.s);s.s.material.dispose();}this.scorch=[];}
}

// ---------- carpet strike: two jets and falling bombs ----------
function jetGeometry(){
 const parts=[];
 const body=new T.CylinderGeometry(.42,.32,9.5,14);body.rotateX(Math.PI/2);parts.push(body);
 const nose=new T.ConeGeometry(.42,2.4,14);nose.rotateX(-Math.PI/2);nose.translate(0,0,-5.95);parts.push(nose);
 const wing=new T.Shape([new T.Vector2(0,-1.2),new T.Vector2(5.2,2.4),new T.Vector2(5.2,3.1),new T.Vector2(0,2.9)]);
 for(const s of [1,-1]){const w=new T.ExtrudeGeometry(wing,{depth:.12,bevelEnabled:false});w.rotateX(Math.PI/2);if(s<0)w.scale(-1,1,1);w.translate(0,-.05,0);parts.push(w);}
 const fin=new T.Shape([new T.Vector2(0,0),new T.Vector2(1.8,2.1),new T.Vector2(2.6,2.1),new T.Vector2(2.4,0)]);const f=new T.ExtrudeGeometry(fin,{depth:.1,bevelEnabled:false});f.rotateY(-Math.PI/2);f.translate(.05,.2,2.0);parts.push(f);
 return parts;
}
class Strikes{
 constructor(scene,smoke){this.scene=scene;this.smoke=smoke;this.parts=jetGeometry();this.mat=new T.MeshStandardMaterial({name:'strike jet / grey',color:'#5d636b',roughness:.42,metalness:.6,side:T.DoubleSide});this.glowMat=new T.SpriteMaterial({map:glowTexture(),color:'#ffb067',transparent:true,depthWrite:false,blending:T.AdditiveBlending});
  this.bombGeo=new T.CapsuleGeometry(.14,.7,4,10);this.bombMat=new T.MeshStandardMaterial({color:'#3a3f36',roughness:.5,metalness:.5});this.jets=[];this.bombs=[];}
 _jet(){const g=new T.Group();for(const p of this.parts){const m=new T.Mesh(p,this.mat);m.castShadow=true;g.add(m);}const glow=new T.Sprite(this.glowMat);glow.scale.set(2.2,2.2,1);glow.position.z=4.9;g.add(glow);g.scale.setScalar(1.6);this.scene.add(g);return g;}
 trigger(ev,time,groundAt){
  const from=new T.Vector3(...ev.from),to=new T.Vector3(...ev.to),dur=3.4;
  for(const [k,off] of [[0,0],[1,1]]){const g=this._jet(),side=new T.Vector3().subVectors(to,from).cross(UP).normalize().multiplyScalar(off*9);
   const a=from.clone().add(side).addScaledVector(UP,off*3),b=to.clone().add(side).addScaledVector(UP,off*3);g.visible=false;
   const jet={g,a,b,start:time+off*.35-.2,dur,trail:null};
   jet.trail=this.smoke.emitter({position:()=>{const p=jet.g.visible?jet.g.position:null;return p?[p.x,p.y,p.z]:null;},color:'#f4f6f8',rate:28,size:.9,grow:1.2,life:3.2,opacity:.35,rise:0,jitter:.8,until:time+dur+.3});
   this.jets.push(jet);}
  for(const b of ev.bombs){const x=b.x,z=b.z,y=groundAt(x,z);const m=new T.Mesh(this.bombGeo,this.bombMat);m.visible=false;this.scene.add(m);this.bombs.push({m,x,z,ground:y,at:b.at,drop:1.15});}
 }
 update(time){
  for(const j of this.jets){const u=(time-j.start)/j.dur;j.g.visible=u>=0&&u<=1;if(j.g.visible){j.g.position.lerpVectors(j.a,j.b,u);j.g.lookAt(j.b);j.g.rotateY(Math.PI);j.g.rotateZ(Math.sin(u*Math.PI)*.12);}}
  for(const j of this.jets.filter(j=>time>j.start+j.dur+.1)){this.scene.remove(j.g);}this.jets=this.jets.filter(j=>time<=j.start+j.dur+.1);
  for(const b of this.bombs){const u=1-(b.at-time)/b.drop;b.m.visible=u>=0&&u<1;if(b.m.visible){b.m.position.set(b.x+(1-u)*3,b.ground+.6+(1-u*u)*42,b.z+(1-u)*6);b.m.rotation.set(-.35-u*.6,0,0);}}
  for(const b of this.bombs.filter(b=>time>=b.at))this.scene.remove(b.m);this.bombs=this.bombs.filter(b=>time<b.at);
 }
 get active(){return this.jets.length+this.bombs.length;}
 reset(){for(const j of this.jets)this.scene.remove(j.g);for(const b of this.bombs)this.scene.remove(b.m);this.jets=[];this.bombs=[];}
}

// ---------- enemy beams, grenades ----------
class Beams{
 constructor(scene){this.scene=scene;this.geo=new T.CylinderGeometry(.018,.018,1,6,1,true);this.list=[];this.glow=new T.SpriteMaterial({map:glowTexture(),color:'#ff6a3a',transparent:true,depthWrite:false,blending:T.AdditiveBlending});}
 trigger(from,to,hit){
  const a=new T.Vector3(...from),b=new T.Vector3(...to),v=b.clone().sub(a),m=new T.Mesh(this.geo,new T.MeshBasicMaterial({color:hit?'#ff5a2e':'#ff9a52',transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));
  m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(UP,v.clone().normalize());m.scale.set(1.6,v.length(),1.6);this.scene.add(m);
  const f=new T.Sprite(this.glow.clone());f.position.copy(a);f.scale.setScalar(1.1);this.scene.add(f);
  this.list.push({m,f,age:0});
 }
 update(dt){for(const l of this.list){l.age+=dt;const k=Math.max(0,1-l.age/.16);l.m.material.opacity=k;l.f.material.opacity=k;}for(const l of this.list.filter(l=>l.age>=.16)){this.scene.remove(l.m,l.f);l.m.material.dispose();l.f.material.dispose();}this.list=this.list.filter(l=>l.age<.16);}
 reset(){for(const l of this.list){this.scene.remove(l.m,l.f);l.m.material.dispose();l.f.material.dispose();}this.list=[];}
}
// ---------- rockets: body, exhaust flame, a thick smoke trail and a travelling light ----------
class Rockets{
 constructor(scene,smoke,lights){
  this.scene=scene;this.smoke=smoke;this.lights=lights;this.map=new Map();
  const body=new T.CylinderGeometry(.045,.05,.46,14);body.rotateX(Math.PI/2);
  const nose=new T.ConeGeometry(.07,.24,14);nose.rotateX(-Math.PI/2);nose.translate(0,0,-.34);
  const bulb=new T.SphereGeometry(.07,14,10);bulb.translate(0,0,-.2);
  const fin=new T.BoxGeometry(.004,.11,.12);fin.translate(0,.07,.2);
  this.parts=[[body,'#4a5140'],[nose,'#5c6150'],[bulb,'#5c6150']];this.fin=fin;
  this.mats=Object.fromEntries(['#4a5140','#5c6150','#2a2d2a'].map(c=>[c,new T.MeshStandardMaterial({color:c,roughness:.5,metalness:.45})]));
  this.flameMat=new T.SpriteMaterial({map:glowTexture(),color:'#ffb35a',transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
 }
 _make(){
  const g=new T.Group();for(const [geo,c] of this.parts){const m=new T.Mesh(geo,this.mats[c]);m.castShadow=true;g.add(m);}
  for(let i=0;i<4;i++){const f=new T.Mesh(this.fin,this.mats['#2a2d2a']);f.rotation.z=i*Math.PI/2;g.add(f);}
  const flame=new T.Sprite(this.flameMat);flame.position.z=.36;flame.scale.setScalar(.9);g.add(flame);
  this.scene.add(g);return {g,flame,last:null,light:this.lights.take()};
 }
 sync(list,time){
  const ids=new Set();
  for(const p of list){
   ids.add(p.id);let r=this.map.get(p.id);if(!r){r=this._make();this.map.set(p.id,r);}
   r.g.position.set(...p.position);r.g.lookAt(r.g.position.x+p.direction[0],r.g.position.y+p.direction[1],r.g.position.z+p.direction[2]);r.g.rotateY(Math.PI);
   r.flame.scale.setScalar(.7+Math.sin(time*90+p.id)*.25+Math.random()*.2);
   if(r.light){r.light.position.copy(r.g.position);r.light.color.set('#ff9a4a');r.light.intensity=7;r.light.distance=9;}
   const back=[p.position[0]-p.direction[0]*.4,p.position[1]-p.direction[1]*.4,p.position[2]-p.direction[2]*.4];
   if(!r.last||Math.hypot(back[0]-r.last[0],back[1]-r.last[1],back[2]-r.last[2])>.45){r.last=back;this.smoke.puff({position:back,velocity:[(Math.random()-.5)*.4,.25,(Math.random()-.5)*.4],color:'#e6e9ea',size:.32,grow:1.5,life:2.8,opacity:.5,drag:1.6,lift:.25});}
  }
  for(const [id,r] of this.map)if(!ids.has(id)){this.scene.remove(r.g);this.lights.give(r.light);this.map.delete(id);}
 }
 reset(){for(const r of this.map.values()){this.scene.remove(r.g);this.lights.give(r.light);}this.map.clear();}
}

// ---------- tactical missile: ground mark, laser, the missile itself ----------
function markTexture(){
 return canvasTexture(256,(g,s)=>{const c=s/2;g.strokeStyle='rgba(255,255,255,1)';g.lineWidth=s*.022;g.beginPath();g.arc(c,c,c*.9,0,6.283);g.stroke();
  g.lineWidth=s*.012;g.setLineDash([s*.04,s*.03]);g.beginPath();g.arc(c,c,c*.62,0,6.283);g.stroke();g.setLineDash([]);
  g.lineWidth=s*.018;for(let i=0;i<4;i++){const a=i*Math.PI/2;g.beginPath();g.moveTo(c+Math.cos(a)*c*.2,c+Math.sin(a)*c*.2);g.lineTo(c+Math.cos(a)*c*.5,c+Math.sin(a)*c*.5);g.stroke();}});
}
class MissileStrikes{
 constructor(scene,smoke,lights){
  this.scene=scene;this.smoke=smoke;this.lights=lights;this.items=new Map();
  this.markGeo=new T.PlaneGeometry(1,1);this.markGeo.rotateX(-Math.PI/2);this.markTex=markTexture();
  this.beamGeo=new T.CylinderGeometry(.05,.05,1,8,1,true);this.beamGeo.translate(0,.5,0);
  const body=new T.CylinderGeometry(.3,.32,5,18);body.rotateX(Math.PI/2);const nose=new T.ConeGeometry(.3,1.3,18);nose.rotateX(-Math.PI/2);nose.translate(0,0,-3.15);
  const fins=[];for(let i=0;i<4;i++){const f=new T.BoxGeometry(.04,.9,.9);f.translate(0,.62,2.1);f.rotateZ(i*Math.PI/2+Math.PI/4);fins.push(f);}
  this.missileParts=[body,nose,...fins];this.missileMat=new T.MeshStandardMaterial({name:'missile / grey',color:'#69707a',roughness:.4,metalness:.55});
  this.flareMat=new T.SpriteMaterial({map:glowTexture(),color:'#ffe0b0',transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false});
  this.aim=new T.Mesh(this.markGeo,new T.MeshBasicMaterial({map:this.markTex,color:'#ff5a3c',transparent:true,opacity:.6,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-6}));
  this.aim.visible=false;this.aim.renderOrder=3;scene.add(this.aim);
 }
 // point: [x,y,z] on the ground or null; radius: the strike radius
 preview(point,radius,time){const a=this.aim;a.visible=!!point;if(!point)return;a.position.set(point[0],point[1]+.08,point[2]);a.scale.setScalar(radius*2);a.rotation.y=time*.8;a.material.opacity=.45+.25*Math.sin(time*8);}
 call(ev,time){
  const [x,y,z]=ev.target,g=new T.Group();g.position.set(x,y+.06,z);this.scene.add(g);
  const mk=(color,op)=>new T.MeshBasicMaterial({map:this.markTex,color,transparent:true,opacity:op,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-6});
  const ring=new T.Mesh(this.markGeo,mk('#ff3b26',.9));ring.scale.setScalar(34);g.add(ring);
  const inner=new T.Mesh(this.markGeo,mk('#ffb0a0',.7));g.add(inner);
  const beam=new T.Mesh(this.beamGeo,new T.MeshBasicMaterial({color:'#ff3b26',transparent:true,opacity:.7,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false}));beam.scale.set(1,320,1);g.add(beam);
  const missile=new T.Group();for(const p of this.missileParts){const m=new T.Mesh(p,this.missileMat);m.castShadow=true;missile.add(m);}const flare=new T.Sprite(this.flareMat);flare.position.z=2.9;flare.scale.setScalar(7);missile.add(flare);missile.visible=false;this.scene.add(missile);
  const start=new T.Vector3(x-50,y+430,z+110),calledAt=ev.time??time,it={id:ev.missileId,target:new T.Vector3(x,y,z),start,calledAt,impactAt:ev.impactAt??calledAt+ev.delay,g,ring,inner,beam,missile,flare,light:null,trailAt:null};
  it.trail=this.smoke.emitter({position:()=>it.missile.visible?[it.missile.position.x,it.missile.position.y,it.missile.position.z]:null,color:'#eef1f2',rate:70,size:2.2,grow:2.6,life:5,opacity:.55,rise:0,jitter:1.6,until:it.impactAt+.05});
  this.items.set(ev.missileId,it);
 }
 update(time){
  for(const it of this.items.values()){
   const u=clamp((time-it.calledAt)/(it.impactAt-it.calledAt),0,1),blink=.5+.5*Math.sin(time*(10+u*30));
   it.ring.rotation.y=time*.6;it.ring.material.opacity=.55+.4*blink;it.inner.scale.setScalar(lerp(30,3,u));it.inner.rotation.y=-time*1.4;it.inner.material.opacity=.4+.5*u;
   it.beam.material.opacity=(.35+.45*blink)*(1-u*.4);
   const k=(it.impactAt-time)/1.6;it.missile.visible=k<=1&&k>0;
   if(it.missile.visible){const e=Math.pow(k,1.7);it.missile.position.lerpVectors(it.target,it.start,e);it.missile.lookAt(it.target);it.missile.rotateY(Math.PI);it.flare.scale.setScalar(6+Math.random()*2);
    if(!it.light){it.light=this.lights.take();}if(it.light){it.light.position.copy(it.missile.position);it.light.color.set('#ffd0a0');it.light.intensity=40;it.light.distance=80;}}
  }
 }
 impact(id){const it=this.items.get(id);if(!it)return;this._drop(it);this.items.delete(id);}
 _drop(it){this.scene.remove(it.g,it.missile);it.ring.material.dispose();it.inner.material.dispose();it.beam.material.dispose();it.trail.until=0;if(it.light)this.lights.give(it.light);}
 get active(){return this.items.size;}
 reset(){for(const it of this.items.values())this._drop(it);this.items.clear();this.aim.visible=false;}
}

// ---------- shockwave: ground ring, a snow wall and a mushroom column ----------
class Shockwaves{
 constructor(scene,smoke){
  this.scene=scene;this.smoke=smoke;this.list=[];
  this.ringGeo=new T.RingGeometry(.965,1,96);this.ringGeo.rotateX(-Math.PI/2);
  this.wallGeo=new T.CylinderGeometry(1,1.08,1,64,1,true);this.wallGeo.translate(0,.5,0);
  this.domeGeo=new T.SphereGeometry(1,40,20,0,Math.PI*2,0,Math.PI/2);
 }
 trigger(position,radius,ground,{dust=true}={}){
  const g=new T.Group();g.position.set(position[0],ground+.15,position[2]);this.scene.add(g);
  const mat=(c,o,side=T.FrontSide)=>new T.MeshBasicMaterial({color:c,transparent:true,opacity:o,depthWrite:false,side,toneMapped:false});
  const ring=new T.Mesh(this.ringGeo,mat('#fff4e4',.6));ring.material.blending=T.AdditiveBlending;g.add(ring);
  const wall=new T.Mesh(this.wallGeo,mat('#f4f7f8',.16,T.DoubleSide));g.add(wall);
  const dome=new T.Mesh(this.domeGeo,mat('#ffffff',0,T.DoubleSide));dome.visible=false;g.add(dome);
  this.list.push({g,ring,wall,dome,age:0,R:radius});if(!dust)return;
  for(let i=0;i<26;i++){const a=i*2.399,r=hash(i+position[0])*radius*.35;this.smoke.puff({position:[position[0]+Math.cos(a)*r,ground+1+hash(i)*3,position[2]+Math.sin(a)*r],velocity:[Math.cos(a)*1.5,6+hash(i+5)*7,Math.sin(a)*1.5],color:i%4?'#d9dcdc':'#7a6f66',size:3+hash(i+9)*2.5,grow:2.2,life:7+hash(i+2)*3,opacity:.6,drag:.9,lift:.6});}
  for(let i=0;i<22;i++){const a=i/22*6.283;this.smoke.puff({position:[position[0]+Math.cos(a)*radius*.4,ground+.6,position[2]+Math.sin(a)*radius*.4],velocity:[Math.cos(a)*16,1.5,Math.sin(a)*16],color:'#f2f5f6',size:2.2,grow:2,life:3.6,opacity:.55,drag:1.4,lift:.2});}
 }
 update(dt){
  for(const s of this.list){
   s.age+=dt;const t=s.age,R=s.R;
   const r=R*.4+R*2.4*(1-Math.exp(-t*3.2));s.ring.scale.set(r,1,r);s.ring.material.opacity=.6*Math.max(0,1-t/.9);
   const w=R*.3+R*1.6*(1-Math.exp(-t*2.4));s.wall.scale.set(w,lerp(.5,4.5,Math.min(1,t*1.6)),w);s.wall.material.opacity=.16*Math.max(0,1-t/1.4);
   const d=R*.25+R*1.3*Math.min(1,t/.35);s.dome.scale.set(d,d*.7,d);s.dome.visible=false;
  }
  for(const s of this.list.filter(s=>s.age>2)){this.scene.remove(s.g);for(const o of [s.ring,s.wall,s.dome])o.material.dispose();}
  this.list=this.list.filter(s=>s.age<=2);
 }
 reset(){for(const s of this.list){this.scene.remove(s.g);for(const o of [s.ring,s.wall,s.dome])o.material.dispose();}this.list=[];}
}

// ---------- rescue beacon site ----------
class BeaconSite{
 constructor(scene){
  this.group=new T.Group();this.group.name='rescue beacon site';scene.add(this.group);
  // the beam: a thin hot core inside a soft sleeve; both fade toward their silhouette so neither reads as a slab up close.
  // Light only: it adds colour and leaves alpha alone (the sky is laid in behind whatever has no alpha).
  const shaft=(r0,r1,power,gain)=>{const m=new T.Mesh(new T.CylinderGeometry(r1,r0,150,24,1,true),new T.ShaderMaterial({transparent:true,premultipliedAlpha:true,depthWrite:false,blending:T.AdditiveBlending,fog:false,toneMapped:false,
   uniforms:{uColor:{value:new T.Color('#ffb35c')},uGain:{value:gain},uTime:{value:0}},
   vertexShader:`varying vec3 vN,vV;varying float vH;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalMatrix*normal;vV=-mv.xyz;vH=position.y+75.;gl_Position=projectionMatrix*mv;}`,
   fragmentShader:`uniform vec3 uColor;uniform float uGain,uTime;varying vec3 vN,vV;varying float vH;void main(){
    float f=abs(dot(normalize(vN),normalize(vV))),a=pow(f,${power.toFixed(1)});
    float h=smoothstep(0.,.8,vH)*(.3+.7*exp(-vH*.035))*(1.-smoothstep(90.,150.,vH)),run=.82+.18*sin(vH*1.3-uTime*11.);
    float near=smoothstep(1.2,5.,length(vV));
    gl_FragColor=vec4(uColor*a*h*run*uGain*near,0.);}`}));m.position.y=75;m.userData.gain=gain;this.group.add(m);return m;};
  this.shafts=[shaft(.07,.2,2.6,2.4),shaft(.34,.8,2.2,.3)];
  // the ring the flares stand on: a line of light on the snow that fills as the uplink runs
  const ring=new T.Mesh(new T.RingGeometry(5.72,6.28,72,1),new T.ShaderMaterial({transparent:true,premultipliedAlpha:true,depthWrite:false,blending:T.AdditiveBlending,fog:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
   uniforms:{uColor:{value:new T.Color('#ff8a3c')},uGain:{value:.5},uFill:{value:0},uTime:{value:0}},
   vertexShader:`varying vec2 vP;void main(){vP=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`uniform vec3 uColor;uniform float uGain,uFill,uTime;varying vec2 vP;void main(){float r=length(vP),e=1.-abs(r-6.)/.28,t=fract(atan(vP.x,-vP.y)/6.2831853+.5);
    float on=step(t,uFill),dash=.55+.45*step(.5,fract(t*48.-uTime*.25));gl_FragColor=vec4(uColor*max(e,0.)*(on*1.6+(1.-on)*.35*dash)*uGain,0.);}`}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.07;ring.renderOrder=2;this.group.add(ring);this.ring=ring;
  this.flares=[];for(let i=0;i<10;i++){const a=i/10*Math.PI*2,m=new T.Mesh(new T.CylinderGeometry(.05,.05,.35,8),new T.MeshStandardMaterial({color:'#ff6a3a',emissive:new T.Color('#ff3a12'),emissiveIntensity:3}));m.position.set(Math.cos(a)*6,.17,Math.sin(a)*6);this.group.add(m);this.flares.push(m);}
  this.lit=0;
 }
 // groundAt: the ring and its flares are laid on the snow once, wherever the site is first put
 place(x,y,z,groundAt=null){this.group.position.set(x,y,z);if(!groundAt||this.fitted)return;this.fitted=true;
  const P=this.ring.geometry.attributes.position;for(let i=0;i<P.count;i++)P.setZ(i,groundAt(x+P.getX(i),z-P.getY(i))-y);P.needsUpdate=true;this.ring.position.y=.07;
  for(const f of this.flares)f.position.y=groundAt(x+f.position.x,z+f.position.z)-y+.17;}
 update(time,progress=0,won=false){const k=(.8+.2*Math.sin(time*1.7))*(1+progress*1.2)+(won?1.2:0);for(const m of this.shafts){m.material.uniforms.uGain.value=m.userData.gain*k;m.material.uniforms.uTime.value=time;}
  const R=this.ring.material.uniforms;R.uFill.value=won?1:progress;R.uTime.value=time;R.uGain.value=won?.9:.5;for(const [i,f] of this.flares.entries())f.material.emissiveIntensity=2+Math.pow(.5+.5*Math.sin(time*5+i),6)*4;}
}

// ---------- the shared light pool ----------
class LightPool{
 constructor(scene,n){this.all=[];this.free=[];for(let i=0;i<n;i++){const l=new T.PointLight('#ffffff',0,10,2);l.castShadow=false;scene.add(l);this.all.push(l);this.free.push(l);}}
 take(){return this.free.pop()??null;}
 give(l){if(!l)return;l.intensity=0;if(!this.free.includes(l))this.free.push(l);}
 reset(){for(const l of this.all){l.intensity=0;}this.free=[...this.all];}
}

export function createLevelFX(scene,{logo=null}={}){
 const lights=new LightPool(scene,7),smoke=new Smoke(scene),fire=new Fire(scene),sparks=new Sparks(scene);
 const airdrops=new Airdrops(scene,smoke,lights,fire),emblem=new EmblemTarget(scene,lights,{logo}),explosions=new Explosions(scene,lights,fire,sparks),strikes=new Strikes(scene,smoke),beams=new Beams(scene),rockets=new Rockets(scene,smoke,lights),beacon=new BeaconSite(scene);
 const crowd=new CrowdView(scene),debris=new Debris(scene),missiles=new MissileStrikes(scene,smoke,lights),shock=new Shockwaves(scene,smoke),palms=new SkyPalms(scene,{smoke,sparks,debris,lights});
 const wind=[.6,0,.25],neg=v=>v.map(x=>-x);
 return {
  airdrops,emblem,explosions,strikes,beams,rockets,beacon,smoke,fire,lights,crowd,debris,sparks,missiles,shock,palms,
  // ---- crowd events ----
  crowdSpawn(e,groundAt){
   if(!e.rise)return;const [x,y,z]=e.position;
   debris.burst([x,y+.1,z],{n:5,direction:[0,1,0],speed:1.2,up:4,spread:1.3,size:[.16,.12,.16],colors:['#f4f7f8','#e6ecef','#c9d3d8'],life:1.6,ground:y,seed:e.crowdId});
   smoke.puff({position:[x,y+.4,z],velocity:[0,1.2,0],color:'#f2f5f6',size:.9,grow:1.6,life:1.8,opacity:.55,drag:1.2});
  },
  crowdHit(e){
   const d=e.direction,back=neg(d);
   sparks.burst(e.position,{n:e.head?18:9,direction:back,speed:e.head?7:5.5,spread:.9,colors:e.head?['#ffffff','#bff4ff','#7fe6ff','#ffd27a']:['#bff4ff','#ffffff','#ffb057'],life:e.head?.45:.32,seed:e.crowdId});
   if(e.head||e.crowdId%3===0)debris.burst(e.position,{n:e.head?3:1,direction:[d[0]*.6,.4,d[2]*.6],speed:2.6,up:2.2,size:[.06,.02,.05],colors:['#d5e1e8','#283038'],life:2,ground:e.position[1]-1.6,seed:e.crowdId+.5});
  },
  crowdKill(e,time,groundAt){
   const [x,y,z]=e.position,s=e.scale??1,chest=[x,y+1.15*s,z],g=groundAt(x,z),d=e.direction,f=e.force??1,blast=e.cause==='explosion';
   const body=crowd.kill(e,time,groundAt);
   sparks.burst(chest,{n:blast?10:16,direction:[d[0],Math.max(.2,d[1]),d[2]],speed:6,spread:1,colors:['#ffffff','#bff4ff','#62dcff'],life:.5,seed:e.crowdId+1});
   const out=[d[0]*Math.min(f,8)*.35,0,d[2]*Math.min(f,8)*.35];
   debris.burst(chest,{n:body?(blast?5:3):12,direction:out,speed:body?2.5:5,up:blast?6:3,spread:1.2,size:body?[.16,.05,.12]:[.18,.06,.14],colors:e.kind==='bomber'?['#ff8a2a','#283038','#d5e1e8']:['#d5e1e8','#d5e1e8','#283038'],life:3.4,ground:g,seed:e.crowdId+2});
   if(e.head)debris.burst([x,y+1.72*s,z],{n:1,direction:[d[0]*.5,1,d[2]*.5],speed:3,up:5,size:[.29,.1,.3],colors:['#d5e1e8'],life:3.5,ground:g,seed:e.crowdId+3});
   if(!blast&&e.crowdId%2===0)smoke.puff({position:chest,velocity:[d[0]*1.2,.6,d[2]*1.2],color:'#eef3f6',size:.5,grow:1.6,life:1.1,opacity:.45,drag:2});
  },
  crowdStrike(e){if(e.hit)sparks.burst(e.position,{n:6,speed:3,colors:['#bff4ff','#ffffff'],life:.25,seed:e.crowdId});crowd.strike(e,e.time);},
  update(dt,time,game,groundAt,viewer){
   smoke.update(dt,time,wind,viewer);fire.update(dt,time,wind,viewer);explosions.update(dt);strikes.update(time);beams.update(dt);shock.update(dt);missiles.update(time);palms.update(dt,time);
   airdrops.update(game.airdrops.map(d=>({id:d.id,state:d.state,position:[d.x,d.y,d.z]})),time,groundAt);
   emblem.update(game.enemies.find(e=>e.type==='logo'&&e.hp>0),time,viewer);
   rockets.sync(game.projectiles.filter(p=>p.splash>0),time);
   crowd.update(dt,game.time,game.crowd,groundAt,viewer);debris.update(dt);sparks.update(dt);
  },
  reset(){airdrops.reset();emblem.reset();explosions.reset();strikes.reset();beams.reset();rockets.reset();smoke.reset();fire.reset();missiles.reset();shock.reset();palms.reset();crowd.reset();debris.reset();sparks.reset();lights.reset();},
  // one of every set piece in front of the camera, so the start-up compile covers their programs
  // (the first carpet strike froze a frame for ~0.4 s compiling the jets); the caller resets afterwards
  stage(groundAt){
   airdrops.incoming({dropId:-1,gold:false,position:[3,groundAt(3,-8),-8]});airdrops.incoming({dropId:-2,gold:true,position:[-3,groundAt(-3,-8),-8]});
   emblem.spawn({enemyId:-1});emblem.update({x:0,y:3,z:-10},0,null);
   strikes.trigger({from:[-30,9,-12],to:[30,9,-40],bombs:[{x:0,z:-9,at:.6}]},0,groundAt);strikes.update(.1);
   beams.trigger([1.5,2.2,-7],[0,1.2,-2],true);palms.stage(groundAt);
  },
  prewarm(){crowd.prewarm();sparks.burst([0,1.5,-4],{n:4});sparks.update(.01);debris.burst([0,1.5,-4],{n:3});debris.update(.01);},
  inspection(){return {smoke:smoke.count,fire:fire.count,explosions:explosions.list.length,scorch:explosions.scorch.length,strikes:strikes.active,airdrops:airdrops.items.size,emblem:!!emblem.active,lightsFree:lights.free.length,
   crowd:crowd.counts,debris:debris.items.length,sparks:sparks.count,rockets:rockets.map.size,missiles:missiles.active,shockwaves:shock.list.length,palms:palms.active,palmPrints:palms.prints.length};}
 };
}
