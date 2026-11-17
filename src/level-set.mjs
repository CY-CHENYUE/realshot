import * as T from 'three';
import {sToZ,AVALANCHE,VEHICLE} from './level-core.mjs';
import {loadPropModels} from './level-props.mjs';
import {Debris} from './level-crowd.mjs';

// RealShot r26 · the three set pieces of the level, as the player sees them (the rules are in level-core.mjs):
//   the snow cornices on the valley walls and the avalanches they let go,
//   the snowcats that can be driven through the crowd,
//   the dreadnought that comes for the beacon.
// The snowcat and the dreadnought are generated models (Lux3D) baked to three levels of detail like the
// outposts' props; everything else here is procedural. No light is created: the few that are needed come
// from the level's shared pool, so nothing recompiles in the middle of a fight.
const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp,damp=(a,b,k,dt)=>lerp(a,b,1-Math.exp(-k*dt));
const hash=n=>{const v=Math.sin(n*127.1+41.7)*43758.5453;return v-Math.floor(v);};
const rnd=()=>Math.random(),sym=()=>Math.random()-.5;
const UP=new T.Vector3(0,1,0),v1=new T.Vector3(),v2=new T.Vector3(),v3=new T.Vector3(),m4=new T.Matrix4(),q1=new T.Quaternion(),X=new T.Vector3(1,0,0);
const WHITES=['#ffffff','#f1f5f9','#e3eaf0','#d5dee6'];
const METAL=['#2a2826','#3b3835','#5b564f','#7a7468','#1b1a19'];

function canvasTexture(size,draw){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
const glowTexture=()=>canvasTexture(128,(g,s)=>{const r=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.16,'rgba(255,255,255,.62)');r.addColorStop(.45,'rgba(255,255,255,.16)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,s,s);});
// where a shell will land: a ring, a broken inner ring and four ticks
const markTexture=()=>canvasTexture(256,(g,s)=>{const c=s/2;g.strokeStyle='#fff';g.lineWidth=s*.03;g.beginPath();g.arc(c,c,c*.9,0,6.283);g.stroke();
 g.lineWidth=s*.014;g.setLineDash([s*.05,s*.035]);g.beginPath();g.arc(c,c,c*.66,0,6.283);g.stroke();g.setLineDash([]);
 g.lineWidth=s*.022;for(let i=0;i<4;i++){const a=i*Math.PI/2+Math.PI/4;g.beginPath();g.moveTo(c+Math.cos(a)*c*.74,c+Math.sin(a)*c*.74);g.lineTo(c+Math.cos(a)*c*1,c+Math.sin(a)*c*1);g.stroke();}});
const discTexture=()=>canvasTexture(64,(g,s)=>{const r=g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);r.addColorStop(0,'rgba(255,255,255,.9)');r.addColorStop(.7,'rgba(255,255,255,.5)');r.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=r;g.fillRect(0,0,s,s);});
const snowMaterial=name=>new T.MeshStandardMaterial({name,color:'#eef3f9',roughness:.94,metalness:0});

export const SET_KINDS=['snowcat','dreadnought'];
export const loadSetModels=(base='/assets/props/')=>loadPropModels(base,SET_KINDS);

// ---------- cornices: a loaded drift of wind-packed snow on the valley wall ----------
// how much bigger than the rules' node the drawn shelf is
const SHELF=1.75;
class Cornices{
 constructor(scene,fx,chunks,groundAt){this.scene=scene;this.fx=fx;this.chunks=chunks;this.groundAt=groundAt;this.items=new Map();this.mat=snowMaterial('set / cornice');this.mat.emissive=new T.Color('#9db4d2');this.mat.emissiveIntensity=.1;this.drift=0;}
 // a shelf of wind-packed snow standing out from the wall along the rules' nodes: a rounded top, a lip that
 // overhangs the valley and a shadowed underside. Section points are [toward the valley, up] from a node.
 _geometry(c){
  const nu=40,nv=18,pos=[],idx=[],N=c.nodes,R=AVALANCHE.radius;
  const curve=new T.CatmullRomCurve3([[-4.4,.7],[-2.2,1.55],[0,1.8],[2.3,1.55],[3.8,.95],[4.05,.25],[3.2,-.35],[1.3,-.95],[-.6,-1.8],[-2.8,-3]].map(p=>new T.Vector3(p[0]*SHELF,p[1]*SHELF,0)),false,'catmullrom',.5),section=curve.getPoints(nv);
  const z0=N[0][2]+R,z1=N.at(-1)[2]-R; // S runs toward -z
  for(let i=0;i<=nu;i++){
   const u=i/nu,z=lerp(z0,z1,u),t=clamp((z-N[0][2])/(N.at(-1)[2]-N[0][2]),0,1)*(N.length-1),k=Math.min(N.length-2,Math.floor(t)),f=t-k,cx=lerp(N[k][0],N[k+1][0],f),cy=lerp(N[k][1],N[k+1][1],f);
   const end=Math.pow(Math.sin(Math.PI*u),.42),reach=1+.2*Math.sin(u*17+c.S)+.12*Math.sin(u*41+c.S*2),thick=1+.14*Math.sin(u*23+c.S*3);
   for(let j=0;j<=nv;j++){const p=section[j],n=1+(hash(i*17.3+j*9.1+c.S)-.5)*.1,a=-2.6*SHELF+(p.x*reach+2.6*SHELF)*end*n,b=-SHELF+(p.y*thick+SHELF)*end*n;
    pos.push(cx-c.side*a,cy+b,z+(hash(i*7.7+j*3.3)-.5)*.4);}
  }
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const a=i*(nv+1)+j,b=a+nv+1;idx.push(a,b,a+1,a+1,b,b+1);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
  // whichever way the strip was wound, its top faces the sky
  const nrm=geo.attributes.normal,top=Math.round(nu/2)*(nv+1)+2;
  if(nrm.getY(top)<0){for(let i=0;i<idx.length;i+=3){const t=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=t;}geo.setIndex(idx);geo.computeVertexNormals();}
  geo.computeBoundingSphere();return geo;
 }
 // spindrift: the wind keeps peeling snow off the lip, which is what gives a hanging cornice away from below
 blow(dt,eye){
  this.drift+=dt*7;
  while(this.drift>=1){this.drift-=1;const live=[...this.items.values()].filter(i=>i.c.state==='ready'&&Math.abs(i.c.z-eye.z)<190);if(!live.length)break;
   const c=live[Math.floor(rnd()*live.length)].c,n=c.nodes[Math.floor(rnd()*c.nodes.length)],s=c.side,z=n[2]+sym()*c.length/c.nodes.length;
   this.fx.fire.puff({position:[n[0]-s*(4+rnd()*2.5)*SHELF*.8,n[1]+(.3+rnd()*.9)*SHELF,z],velocity:[-s*(2.4+rnd()*2.6),.5+rnd()*.9,-1.4+sym()*1.6],color:'#f3f7fb',size:1+rnd()*.8,grow:2.6,life:2.4+rnd()*1.4,opacity:.3+rnd()*.14,drag:.5,lift:-.25,heat:0,cool:.01});}
 }
 sync(list,time){
  for(const c of list){
   let it=this.items.get(c.id);
   if(!it){const mesh=new T.Mesh(this._geometry(c),this.mat);mesh.name=`cornice / ${c.id}`;mesh.castShadow=true;mesh.receiveShadow=true;this.scene.add(mesh);it={c,mesh,goneAt:null};this.items.set(c.id,it);}
   it.c=c;
   if(c.state==='ready'){it.goneAt=null;it.mesh.visible=true;it.mesh.position.set(0,-(1-c.hp/AVALANCHE.hp)*.35,0);}
   else{if(it.goneAt===null)it.goneAt=time-99;const u=clamp((time-it.goneAt)/AVALANCHE.delay,0,1);it.mesh.visible=u<1;it.mesh.position.set(-c.side*u*u*6,-u*u*7-.35,0);}
  }
 }
 hit(e){
  const it=this.items.get(e.corniceId);if(!it)return;const [x,y,z]=e.position,s=it.c.side;
  for(let i=0;i<3;i++)this.fx.smoke.puff({position:[x+sym()*1.6,y+rnd()*.8,z+sym()*1.6],velocity:[-s*(1+rnd()*2.2),.5+rnd(),sym()],color:'#f4f7fa',size:.7+rnd()*.4,grow:1.9,life:1.5,opacity:.6,drag:1.6});
  this.chunks.burst([x,y,z],{n:5,direction:[-s*.8,0,0],speed:3.6,up:2,spread:1,size:[.3,.22,.28],colors:WHITES,life:3.2,ground:this.groundAt(x-s*5,z),seed:e.id});
 }
 // the crack: the whole drift lets go and slumps into its own dust
 release(e,time){
  const it=this.items.get(e.corniceId);if(!it)return;it.goneAt=time;const c=it.c,s=c.side;
  for(let i=0;i<34;i++){const n=c.nodes[Math.floor(rnd()*c.nodes.length)],z=n[2]+sym()*5,x=n[0]-s*rnd()*4;
   this.fx.fire.puff({position:[x,n[1]-1+rnd()*2.5,z],velocity:[-s*(2+rnd()*5),1.4+rnd()*3,sym()*2],color:'#eef3f7',size:1.8+rnd(),grow:3,life:2.2+rnd()*1.6,opacity:.8,drag:1,heat:0,cool:.01,delay:rnd()*.6});}
  for(const [i,n] of c.nodes.entries())this.chunks.burst([n[0]-s*2,n[1],n[2]],{n:6,direction:[-s,0,0],speed:6,up:3,spread:1.2,size:[.7,.5,.62],colors:WHITES,life:3.6,ground:this.groundAt(n[0]-s*11,n[2]),seed:i+c.S});
 }
 cues(){const out=[];for(const it of this.items.values())if(it.c.state==='ready')out.push({kind:'cornice',id:it.c.id,position:[it.c.x,it.c.y+2.6*SHELF,it.c.z],S:it.c.S,length:it.c.length});return out;}
 reset(){for(const it of this.items.values()){it.goneAt=null;it.mesh.visible=true;it.mesh.position.set(0,0,0);}}
}

// ---------- the slide: a wall of powder running across the valley, and the debris it leaves ----------
class Avalanches{
 constructor(scene,fx,chunks,groundAt,halfWidth){this.scene=scene;this.fx=fx;this.chunks=chunks;this.groundAt=groundAt;this.halfWidth=halfWidth;this.list=[];this.mat=snowMaterial('set / slide debris');this.mat.flatShading=true;this.mat.color.set('#e6edf5');}
 // what lies on the valley floor afterwards: a tongue of lumpy snow that settles and later melts back into the ground
 _deposit(f){
  const nu=46,nv=24,pos=[],idx=[],g=this.groundAt;
  for(let i=0;i<=nu;i++){
   const u=i/nu,S=lerp(f.S0,f.S1,u),z=sToZ(S),a=-this.halfWidth(S,-1)-2.5,b=this.halfWidth(S,1)+2.5,eu=Math.pow(Math.sin(Math.PI*u),.6);
   for(let j=0;j<=nv;j++){const v=j/nv,x=lerp(a,b,v),ev=Math.pow(Math.sin(Math.PI*v),.5),lump=.35+.42*(Math.sin(i*.55+f.S0)*Math.sin(j*.8+f.S0*.7)+1)+hash(i*31.7+j*17.3+f.S0)*.75;
    pos.push(x+(hash(i*5.1+j*2.3)-.5)*.5,g(x,z)-.06+lump*eu*ev,z+(hash(i*3.7+j*8.9)-.5)*.5);}
  }
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const p=i*(nv+1)+j,q=p+nv+1;idx.push(p,p+1,q,p+1,q+1,q);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setIndex(idx);geo.computeVertexNormals();
  const n=geo.attributes.normal;let up=0;for(let i=0;i<n.count;i++)up+=n.getY(i);
  if(up<0){for(let i=0;i<idx.length;i+=3){const t=idx[i+1];idx[i+1]=idx[i+2];idx[i+2]=t;}geo.setIndex(idx);geo.computeVertexNormals();}
  const m=new T.Mesh(geo,this.mat);m.name='slide debris';m.receiveShadow=true;m.visible=false;this.scene.add(m);return m;
 }
 start(e){this.list.push({...e,acc:0,cacc:0,done:false,deposit:this._deposit(e)});}
 update(dt,time){
  const g=this.groundAt,fire=this.fx.fire;
  for(const f of this.list){
   const run=f.end-f.start,t=time-f.start;
   if(t>=0&&t<run+.3){
    const base=f.x0-f.side*f.speed*Math.min(t,run),s=f.side,len=f.S1-f.S0;
    // the front is lobed, not ruled: tongues run ahead of the rest
    const frontAt=S=>base-s*(2.2*Math.sin(S*.31+f.S0)+1.3*Math.sin(S*.83+f.S0*2));
    // the wall of powder: rolled forward and up off the front, lit like any other cloud
    f.acc+=dt*150;
    while(f.acc>=1){f.acc--;const S=f.S0-3+rnd()*(len+6),z=sToZ(S),x=frontAt(S)+s*rnd()*4,h=rnd();
     fire.puff({position:[x,g(x,z)+.8+h*h*5.5,z],velocity:[-s*(f.speed*.66+rnd()*5),2.4+rnd()*5+h*3,sym()*3],color:rnd()<.3?'#dde6ee':'#f4f7fa',size:2.8+rnd()*2.4,grow:3.6,life:2.6+rnd()*2.4,opacity:.9,drag:1.1,lift:.35,heat:0,cool:.01});}
    // what the front leaves hanging over the ground it has crossed
    f.tacc=(f.tacc??0)+dt*34;
    while(f.tacc>=1){f.tacc--;const S=f.S0+rnd()*len,z=sToZ(S),x=lerp(f.x0,frontAt(S),.25+rnd()*.7);
     fire.puff({position:[x,g(x,z)+1.2+rnd()*3,z],velocity:[-s*(2+rnd()*4),.6+rnd()*1.6,sym()*2],color:'#eef2f6',size:3.6+rnd()*2.6,grow:2.2,life:3.6+rnd()*2.6,opacity:.55,drag:.8,lift:.1,heat:0,cool:.01});}
    // the blocks tumbling in it
    f.cacc+=dt*30;
    while(f.cacc>=1){f.cacc--;const S=lerp(f.S0,f.S1,rnd()),z=sToZ(S),front=frontAt(S);
     this.chunks.burst([front,g(front,z)+.7,z],{n:3,direction:[-s,0,0],speed:f.speed*.8,up:5,spread:.7,size:[.7,.52,.62],colors:WHITES,life:2.6,ground:g(front-s*9,z),seed:S+t});}
   }
   if(!f.done&&t>=run){f.done=true;
    // what hangs in the air afterwards
    for(let i=0;i<34;i++){const S=lerp(f.S0,f.S1,rnd()),z=sToZ(S),x=lerp(f.x1,f.x0,rnd()*.55);
     this.fx.smoke.puff({position:[x,g(x,z)+1+rnd()*2.5,z],velocity:[-f.side*rnd()*1.5,.25+rnd()*.5,sym()],color:'#f1f5f8',size:3+rnd()*2.5,grow:1.6,life:6+rnd()*4,opacity:.3,drag:.5});}}
   const d=f.deposit,k=clamp(t/run,0,1),out=clamp((t-run-45)/9,0,1);
   d.visible=t>0&&out<1;d.position.y=-2*(1-k*k*(3-2*k))-2*out;
  }
  for(const f of this.list)if(time-f.end>56)this._drop(f);
  this.list=this.list.filter(f=>time-f.end<=56);
 }
 // 0..1: how close the roar is (for the camera and the sound)
 near(time,x,z){let k=0;for(const f of this.list){const t=time-f.start;if(t<0||t>f.end-f.start+.6)continue;const front=f.x0-f.side*f.speed*Math.min(t,f.end-f.start),zc=sToZ((f.S0+f.S1)/2),dz=Math.max(0,Math.abs(z-zc)-(f.S1-f.S0)/2);k=Math.max(k,clamp(1-Math.hypot(x-front,dz)/34,0,1));}return k;}
 _drop(f){this.scene.remove(f.deposit);f.deposit.geometry.dispose();}
 reset(){for(const f of this.list)this._drop(f);this.list=[];}
}

// ---------- the snowcats ----------
// lamp heads, the exhaust stack, the hood and the four track units, in the model's own metres (its nose is +z)
const CAT={lamps:[[.78,1.4,1.62],[-.78,1.4,1.62]],exhaust:[.82,2.5,-1.7],hood:[0,1.72,1.05],track:[1.06,1.55],lod:[30,85]};
class Snowcats{
 constructor(scene,fx,chunks,model,groundAt){
  this.scene=scene;this.fx=fx;this.chunks=chunks;this.model=model;this.groundAt=groundAt;this.items=new Map();
  this.glow=new T.SpriteMaterial({name:'snowcat / lamp',map:glowTexture(),color:new T.Color(2.6,2.3,1.8),blending:T.AdditiveBlending,depthWrite:false,transparent:true,toneMapped:false});
  // a burnt-out hull: the same maps under soot
  this.burnt=model.materials.map(m=>{const c=m.clone();c.name=m.name+' burnt';c.color.set('#3a3430');return c;});
 }
 _make(v,index){
  const group=new T.Group();group.name=`snowcat / ${v.id}`;
  const lods=this.model.lods.map((geo,l)=>{const m=new T.Mesh(geo,this.model.materials[l]);m.castShadow=l<2;m.receiveShadow=true;m.visible=l===2;group.add(m);return m;});
  const lamps=CAT.lamps.map(p=>{const s=new T.Sprite(this.glow);s.position.set(...p);s.renderOrder=4;group.add(s);return s;});
  this.scene.add(group);
  return {index,group,lods,lamps,n:new T.Vector3(0,1,0),fresh:true,light:null,spray:0,ex:0,dmg:0,kick:0,last:0,wreck:false,tilt:(hash(index+3)-.5)*.34};
 }
 update(dt,time,game,viewer,lamp){
  const g=this.groundAt,smoke=this.fx.smoke;
  game.vehicles.forEach((v,index)=>{
   let it=this.items.get(v.id);if(!it){it=this._make(v,index);this.items.set(v.id,it);}
   const f0=-Math.sin(v.yaw),f1=-Math.cos(v.yaw),r0=Math.cos(v.yaw),r1=-Math.sin(v.yaw),driven=v.state==='driven',wreck=v.state==='wreck',abs=Math.abs(v.speed),sg=Math.sign(v.speed)||1;
   // it lies on the ground under its four track units
   const hf=g(v.x+f0*1.5,v.z+f1*1.5),hb=g(v.x-f0*1.5,v.z-f1*1.5),hr=g(v.x+r0*1.1,v.z+r1*1.1),hl=g(v.x-r0*1.1,v.z-r1*1.1),hc=g(v.x,v.z);
   v1.set(-(hf-hb)/3*f0-(hr-hl)/2.2*r0,1,-(hf-hb)/3*f1-(hr-hl)/2.2*r1).normalize();
   if(it.fresh){it.n.copy(v1);it.fresh=false;}else it.n.lerp(v1,1-Math.exp(-9*dt)).normalize();
   v2.set(f0,0,f1).addScaledVector(it.n,-(f0*it.n.x+f1*it.n.z)).normalize();v3.crossVectors(it.n,v2);
   it.group.quaternion.setFromRotationMatrix(m4.makeBasis(v3,it.n,v2));
   // it squats on the throttle and dips on the brake
   const acc=dt>0?(v.speed-it.last)/dt:0;it.last=v.speed;it.kick=damp(it.kick,clamp(acc*.0055,-.05,.05),7,dt);
   it.group.quaternion.multiply(q1.setFromAxisAngle(X,-it.kick+(wreck?.05:0)));if(wreck)it.group.quaternion.multiply(q1.setFromAxisAngle(v1.set(0,0,1),it.tilt));
   const base=(hf+hb+hr+hl+hc*2)/6-(wreck?.3:.06);
   it.group.position.set(v.x,base+(driven?Math.sin(time*33)*.005*(1+abs*.2):0),v.z);
   const d=Math.hypot(v.x-viewer.x,v.z-viewer.z),lod=d<CAT.lod[0]?0:d<CAT.lod[1]?1:2;for(let l=0;l<3;l++)it.lods[l].visible=l===lod;
   if(wreck!==it.wreck){it.wreck=wreck;for(let l=0;l<3;l++)it.lods[l].material=wreck?this.burnt[l]:this.model.materials[l];}
   // lamps: on whenever it can be driven, brighter in the dark
   const k=wreck?0:(driven?1:.6)*(.32+.68*lamp);for(const s of it.lamps){s.visible=k>0;s.scale.setScalar(.35+1.5*k+Math.sin(time*50+it.index)*.02);}
   if(driven&&lamp>.2){if(!it.light)it.light=this.fx.lights.take();if(it.light){it.light.position.set(v.x+f0*6.5,base+1.7,v.z+f1*6.5);it.light.color.set('#ffe7c2');it.light.intensity=30*lamp;it.light.distance=26;}}
   else if(it.light){this.fx.lights.give(it.light);it.light=null;}
   if(dt<=0)return;
   if(driven){
    // snow off the tracks, a bow wave off the blade at speed, the exhaust
    if(abs>1){it.spray+=dt*abs*1.7;
     while(it.spray>=1){it.spray--;const s=rnd()<.5?-1:1,x=v.x+r0*s*CAT.track[0]-f0*sg*CAT.track[1],z=v.z+r1*s*CAT.track[0]-f1*sg*CAT.track[1];
      smoke.puff({position:[x,g(x,z)+.28,z],velocity:[-f0*sg*abs*.22+r0*s*1.3,.9+rnd()*1.4,-f1*sg*abs*.22+r1*s*1.3],color:'#f5f8fa',size:.45+rnd()*.35,grow:1.8,life:.9+rnd()*.7,opacity:.5,drag:2.1});
      if(abs>7&&rnd()<.5){const bx=v.x+r0*s*1.25+f0*sg*1.9,bz=v.z+r1*s*1.25+f1*sg*1.9;smoke.puff({position:[bx,g(bx,bz)+.4,bz],velocity:[r0*s*3.6+f0*sg*abs*.3,1.6+rnd(),r1*s*3.6+f1*sg*abs*.3],color:'#ffffff',size:.5,grow:2.1,life:.8,opacity:.5,drag:2.4});}
      if(rnd()<.22)this.chunks.burst([x,g(x,z)+.2,z],{n:2,direction:[-f0*sg,0,-f1*sg],speed:2.5+abs*.2,up:2.4,spread:1,size:[.12,.09,.11],colors:WHITES,life:1.3,ground:g(x,z),seed:time});}
    }
    it.ex+=dt*(5+abs*.7);while(it.ex>=1){it.ex--;it.group.updateMatrixWorld();v1.set(...CAT.exhaust).applyMatrix4(it.group.matrixWorld);smoke.puff({position:v1.toArray(),velocity:[-f0*.4,.9+rnd()*.5,-f1*.4],color:'#55585b',size:.16,grow:.75,life:.9,opacity:.34,drag:1.2});}
   }
   // a hurt engine smokes, then burns
   const frac=v.hp/VEHICLE.hp;
   if(!wreck&&frac<.6){it.dmg+=dt*(frac<.3?10:4.5);while(it.dmg>=1){it.dmg--;it.group.updateMatrixWorld();v1.set(CAT.hood[0]+sym()*.7,CAT.hood[1],CAT.hood[2]+sym()*.4).applyMatrix4(it.group.matrixWorld);const hot=frac<.3&&rnd()<.55;
    this.fx.fire.puff({position:v1.toArray(),velocity:[sym()*.5-f0*v.speed*.2,1.5+rnd(),sym()*.5-f1*v.speed*.2],color:'#1c1a19',size:hot?.34:.42,grow:hot?.5:1.1,life:hot?.5:1.5+rnd()*.6,opacity:hot?.4:.7,drag:.8,lift:.7,heat:hot?1.15:0,cool:.3,tall:hot?1.8:1});}}
  });
 }
 hit(e,game){
  const v=game.vehicles.find(o=>o.id===e.vehicleId);if(!v)return;const dx=e.from[0]-v.x,dz=e.from[2]-v.z,l=Math.hypot(dx,dz)||1;
  this.fx.sparks.burst([v.x+dx/l*1.2,v.y+1.3,v.z+dz/l*1.2],{n:e.cause==='avalanche'?0:12,direction:[dx/l,.5,dz/l],speed:5,spread:.9,colors:['#ffffff','#ffd9a0','#ffb057'],life:.35,seed:e.id});
 }
 crash(e){
  const [x,y,z]=e.position;this.fx.sparks.burst([x,y+1,z],{n:22,direction:[0,1,0],speed:6,spread:1.4,colors:['#ffffff','#ffd9a0','#ff9d45'],life:.45,seed:e.id});
  this.chunks.burst([x,y+.6,z],{n:8,direction:[0,1,0],speed:3,up:3.5,spread:1.4,size:[.2,.15,.18],colors:WHITES,life:1.8,ground:y,seed:e.id});
 }
 destroyed(e,time){
  const [x,y,z]=e.position;
  this.fx.debris.burst([x,y+1.4,z],{n:26,speed:9,up:8,spread:1.4,size:[.4,.12,.3],colors:METAL,life:7,ground:y,seed:e.id});
  this.fx.fire.burn([x,y+.3,z],time,18,1.3);
 }
 cues(game){return game.driving?[]:game.vehicles.filter(v=>v.state==='parked').map(v=>({kind:'vehicle',id:v.id,position:[v.x,v.y+3.9,v.z]}));}
 reset(){for(const it of this.items.values()){if(it.light){this.fx.lights.give(it.light);it.light=null;}it.fresh=true;it.kick=0;it.last=0;}}
}

// ---------- the dreadnought ----------
// in the model's own metres (its nose is +z, its base is y 0; the rules' hull centre is CENTRE above the base)
const SHIP={centre:3.05,core:[0,2,5],intake:[[4.45,3.3,1.45],[-4.45,3.3,1.45]],exhaust:[[4.2,3.25,-4.7],[-4.2,3.25,-4.7]],tubes:[[1.95,5.9,-.6],[-1.95,5.9,-.6]],
 wounds:[[4.3,3.6,-1.5],[-4.3,3.4,-.6],[1.2,4.9,1.2],[-1.6,4.6,-2.8]],lod:[60,130],fall:2.7};
const TELE=44;
class Dreadnought{
 constructor(scene,fx,model,groundAt){
  this.scene=scene;this.fx=fx;this.model=model;this.groundAt=groundAt;this.id=null;this.dying=null;this.flash=0;this.acc={wash:0,w0:0,w1:0,fall:0,steam:0};
  const root=this.root=new T.Group();root.name='dreadnought';root.visible=false;scene.add(root);
  this.lods=model.lods.map((geo,l)=>{const m=new T.Mesh(geo,model.materials[l]);m.castShadow=l<2;m.receiveShadow=false;m.visible=l===1;root.add(m);return m;});
  // the weak point: a reactor face set into the nose
  const glow=glowTexture(),sprite=(color,scale)=>{const s=new T.Sprite(new T.SpriteMaterial({map:glow,color,blending:T.AdditiveBlending,depthWrite:false,transparent:true,toneMapped:false}));s.scale.setScalar(scale);s.renderOrder=4;return s;};
  this.core=new T.Mesh(new T.SphereGeometry(.8,28,18),new T.MeshBasicMaterial({name:'dreadnought / core',color:new T.Color(5,.8,.25),toneMapped:false}));this.core.position.set(...SHIP.core);
  const ring=new T.Mesh(new T.TorusGeometry(1.04,.2,12,36),new T.MeshStandardMaterial({name:'dreadnought / core housing',color:'#2a2826',roughness:.45,metalness:.85}));ring.position.set(SHIP.core[0],SHIP.core[1],SHIP.core[2]+.12);
  const fins=new T.Group();for(let i=0;i<6;i++){const b=new T.Mesh(new T.BoxGeometry(.16,.5,.3),ring.material);const a=i/6*Math.PI*2+.26;b.position.set(Math.cos(a)*1.22,Math.sin(a)*1.22,0);b.rotation.z=a+Math.PI/2;fins.add(b);}fins.position.copy(ring.position);
  this.coreGlow=sprite(new T.Color(2.2,.4,.14),4);this.coreGlow.position.set(SHIP.core[0],SHIP.core[1],SHIP.core[2]+.9);
  root.add(this.core,ring,fins,this.coreGlow);
  this.jets=[...SHIP.intake.map(p=>{const s=sprite(new T.Color(.5,.95,2.4),2.4);s.position.set(...p);root.add(s);return s;}),...SHIP.exhaust.map(p=>{const s=sprite(new T.Color(2.4,1.1,.45),3);s.position.set(...p);root.add(s);return s;})];
  // the sweep: a beam from the core to the ground, the line it will take, and the melt it leaves
  const cyl=new T.CylinderGeometry(1,1,1,14,1,true);cyl.translate(0,.5,0);
  const beamMat=(color,opacity)=>new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,side:T.DoubleSide,fog:false});
  this.beam=new T.Group();this.beam.visible=false;this.beamOuter=new T.Mesh(cyl,beamMat(new T.Color(3,.34,.1),.5));this.beamInner=new T.Mesh(cyl,beamMat(new T.Color(9,5,3.2),.95));this.beam.add(this.beamOuter,this.beamInner);scene.add(this.beam);
  this.spot=sprite(new T.Color(4,1.6,.6),6);this.spot.visible=false;scene.add(this.spot);this.light=null;
  const flat=new T.PlaneGeometry(1,1);flat.rotateX(-Math.PI/2);
  this.tele=new T.InstancedMesh(flat,new T.MeshBasicMaterial({name:'dreadnought / sweep line',map:discTexture(),transparent:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6}),TELE);
  this.tele.frustumCulled=false;this.tele.renderOrder=3;this.tele.visible=false;for(let i=0;i<TELE;i++)this.tele.setColorAt(i,new T.Color(0,0,0));scene.add(this.tele);
  this.heat=new Float32Array(TELE);this.lock=null;this.line=0;this.c=new T.Color();
  // mortar marks and shells
  this.markGeo=flat;this.markTex=markTexture();this.discTex=this.tele.material.map;this.shellGeo=new T.SphereGeometry(.24,12,8);this.shellMat=new T.MeshBasicMaterial({color:new T.Color(6,2.4,.8),toneMapped:false});this.marks=[];this.tube=0;
 }
 corePosition(out=new T.Vector3()){this.root.updateMatrixWorld();return out.set(...SHIP.core).applyMatrix4(this.root.matrixWorld);}
 _local(p,out){this.root.updateMatrixWorld();return out.set(...p).applyMatrix4(this.root.matrixWorld);}
 update(dt,time,game,viewer){
  const e=game.enemies.find(o=>o.type==='boss'&&o.hp>0),root=this.root,fx=this.fx,g=this.groundAt;
  this.flash=Math.max(0,this.flash-dt*5);
  let lock=null,beamAt=null,charge=0;
  if(e){
   if(this.id!==e.id){this.id=e.id;this.dying=null;root.rotation.set(0,0,0);this.lock=null;this.heat.fill(0);}
   root.visible=true;root.position.set(e.x,e.y-SHIP.centre,e.z);
   root.rotation.z=damp(root.rotation.z,clamp(-e.vx*.03,-.13,.13),3,dt);root.rotation.x=damp(root.rotation.x,clamp(e.vz*.018,-.07,.07)+Math.sin(time*.7)*.012,3,dt);
   const ai=e.ai,phase=ai.phase??1;lock=(ai.mode==='charge'||ai.mode==='beam')?ai.lock:null;beamAt=ai.mode==='beam'?e.beamAt:null;charge=ai.mode==='charge'?clamp(e.attackProgress??0,0,1):ai.mode==='beam'?1:0;
   if(dt>0){
    // rotor wash on the snow under it
    this.acc.wash+=dt*13;while(this.acc.wash>=1){this.acc.wash--;const a=rnd()*6.283,r=2.5+rnd()*3.5,x=e.x+Math.cos(a)*r,z=e.z+Math.sin(a)*r;
     fx.smoke.puff({position:[x,g(x,z)+.4,z],velocity:[Math.cos(a)*5,.7+rnd(),Math.sin(a)*5],color:'#f2f6f9',size:1.1,grow:2.4,life:1.6+rnd(),opacity:.3,drag:1.5});}
    // the damage shows: one engine smoking, then two fires and a drip of sparks
    if(phase>=2){this.acc.w0+=dt*7;while(this.acc.w0>=1){this.acc.w0--;this._local(SHIP.wounds[0],v1);fx.fire.puff({position:v1.toArray(),velocity:[sym()*.8,1.2+rnd(),sym()*.8-1],color:'#191716',size:.7,grow:1.6,life:2.2+rnd(),opacity:.75,drag:.6,lift:.5,heat:rnd()<.3?1:0,cool:.35});}}
    if(phase>=3){this.acc.w1+=dt*13;while(this.acc.w1>=1){this.acc.w1--;const w=SHIP.wounds[1+Math.floor(rnd()*3)];this._local(w,v1);const hot=rnd()<.6;
      fx.fire.puff({position:v1.toArray(),velocity:[sym(),1.4+rnd()*1.4,sym()],color:'#171412',size:hot?.6:.8,grow:hot?.5:1.7,life:hot?.55:2.4,opacity:hot?.4:.8,drag:.6,lift:1.2,heat:hot?1.2:.2,cool:.4,tall:hot?2:1});
      if(rnd()<.35)fx.sparks.burst(v1.toArray(),{n:5,direction:[0,-1,0],speed:3,spread:1.3,colors:['#fff3cf','#ffc15c','#ff7a26'],life:.9,gravity:9,seed:time});}}
   }
   const hurt=phase>=3?.75+.25*Math.sin(time*23):1;
   for(const [i,s] of this.jets.entries()){const base=i<2?2.4:3;s.scale.setScalar(base*(.9+.14*Math.sin(time*31+i*2))*(i===2&&phase>=2?.25:1)*hurt);}
  }else if(this.dying){
   // it rolls over and falls on its own fire; the last blast (the rules') takes it apart
   const D=this.dying,t=time-D.at,k=clamp(t/SHIP.fall,0,1);
   if(t<SHIP.fall){
    root.visible=true;root.position.set(D.x+D.drift*k*5,lerp(D.y,D.gy+.6,k*k),D.z-k*3);root.rotation.z=D.rz+D.sign*k*k*.6;root.rotation.x=D.rx-k*.3;
    if(dt>0){this.acc.fall+=dt*34;while(this.acc.fall>=1){this.acc.fall--;v1.set(sym()*8,1.5+rnd()*3.5,sym()*8).applyMatrix4(root.matrixWorld);const hot=rnd()<.6;
     fx.fire.puff({position:v1.toArray(),velocity:[sym()*2,2+rnd()*2,sym()*2],color:'#161311',size:hot?1:1.4,grow:hot?1.2:2.4,life:hot?.8:3+rnd()*1.5,opacity:.85,drag:.8,lift:1.2,heat:hot?1.35:.3,cool:.4});
     if(rnd()<.3)fx.sparks.burst(v1.toArray(),{n:9,direction:[0,-1,0],speed:5,spread:1.5,colors:['#fff3cf','#ffc15c','#ff7a26'],life:1.1,gravity:9,seed:time+t});}}
   }else if(!D.done){
    D.done=true;root.visible=false;const p=[root.position.x,D.gy,root.position.z];
    for(let i=0;i<3;i++)fx.debris.burst([p[0]+sym()*5,p[1]+2.5,p[2]+sym()*5],{n:26,speed:13,up:12,spread:1.5,size:[.9,.28,.7],colors:METAL,life:9,ground:D.gy,seed:i*9.1+D.at});
    for(let i=0;i<3;i++){const x=p[0]+sym()*9,z=p[2]+sym()*7;fx.fire.burn([x,g(x,z),z],time,20,2);}
   }
  }else{root.visible=false;this.id=null;}
  if(root.visible){const d=root.position.distanceTo(viewer),lod=d<SHIP.lod[0]?0:d<SHIP.lod[1]?1:2;for(let l=0;l<3;l++)this.lods[l].visible=l===lod;}
  // the core: brighter as the sweep charges, white for a moment when it is hit
  const dim=this.dying?clamp(1-(time-this.dying.at)/1.2,0,1)*(.5+.5*Math.sin(time*40)):1,pulse=1+.07*Math.sin(time*5.3),f=this.flash;
  this.core.material.color.setRGB((5+charge*5+f*6)*dim,(.8+charge*1.6+f*6)*dim,(.25+charge*.5+f*4.5)*dim);this.core.scale.setScalar(pulse*(1+charge*.12+f*.1));
  this.coreGlow.material.color.setRGB((2.2+charge*3)*dim,(.4+charge*.8+f)*dim,(.14+charge*.2+f*.7)*dim);this.coreGlow.scale.setScalar((4+charge*5+f*2.5)*(.92+.08*Math.sin(time*37)));
  this._sweep(dt,time,lock,beamAt);this._marks(dt,time);
 }
 _sweep(dt,time,lock,beamAt){
  const fx=this.fx,g=this.groundAt,tele=this.tele;
  if(lock&&lock!==this.lock){this.lock=lock;this.heat.fill(0);
   for(let i=0;i<TELE;i++){const u=(i+.5)/TELE,x=lerp(lock.a[0],lock.b[0],u),z=lerp(lock.a[1],lock.b[1],u);m4.makeScale(1.7,1,1.7).setPosition(x,g(x,z)+.09,z);tele.setMatrixAt(i,m4);}
   tele.instanceMatrix.needsUpdate=true;}
  this.line=damp(this.line,lock?1:0,lock?14:3,dt);
  let on=false;
  if(beamAt&&this.lock){
   const L=this.lock,ax=L.b[0]-L.a[0],az=L.b[1]-L.a[1],u=clamp(((beamAt[0]-L.a[0])*ax+(beamAt[2]-L.a[1])*az)/(ax*ax+az*az),0,1),i=Math.min(TELE-1,Math.floor(u*TELE));
   this.heat[i]=1;if(i>0)this.heat[i-1]=Math.max(this.heat[i-1],.8);
   // the beam itself
   const from=this.corePosition(v1),to=v2.set(beamAt[0],beamAt[1]+.05,beamAt[2]),len=from.distanceTo(to);
   this.beam.position.copy(from);this.beam.quaternion.setFromUnitVectors(UP,v3.subVectors(to,from).normalize());
   const w=1+.18*Math.sin(time*71);this.beamOuter.scale.set(.5*w,len,.5*w);this.beamInner.scale.set(.15*w,len,.15*w);on=true;
   this.spot.position.copy(to).y+=.5;this.spot.scale.setScalar(6+Math.sin(time*53)*1.2);
   if(!this.light)this.light=fx.lights.take();if(this.light){this.light.position.set(to.x,to.y+1.6,to.z);this.light.color.set('#ff7a3a');this.light.intensity=150;this.light.distance=26;}
   if(dt>0){fx.sparks.burst([to.x,to.y+.2,to.z],{n:7,direction:[0,1,0],speed:8,spread:1.3,colors:['#fff3cf','#ffc15c','#ff7a26','#ff4a12'],life:.6,gravity:9,seed:time});
    this.acc.steam+=dt*30;while(this.acc.steam>=1){this.acc.steam--;fx.smoke.puff({position:[to.x+sym(),to.y+.4,to.z+sym()],velocity:[sym()*1.5,2.6+rnd()*2,sym()*1.5],color:'#f4f7f9',size:.7,grow:2.4,life:1.6+rnd(),opacity:.5,drag:1.1});}}
  }
  this.beam.visible=on;this.spot.visible=on;if(!on&&this.light){fx.lights.give(this.light);this.light=null;}
  let any=this.line>.02;const k=Math.exp(-1.5*dt),blink=.55+.45*Math.sin(time*18);
  for(let i=0;i<TELE;i++){const h=this.heat[i]*=k;if(h>.01)any=true;this.tele.setColorAt(i,this.c.setRGB(this.line*blink*.75+h*5,this.line*blink*.07+h*1.5,this.line*blink*.04+h*.4));}
  tele.visible=any&&!!this.lock;if(tele.visible)tele.instanceColor.needsUpdate=true;if(!any&&!lock)this.lock=null;
 }
 // ---- mortar ----
 mortar(e,time){
  for(const mk of e.marks){
   const [x,y,z]=mk.position,mat=(map,color,opacity)=>new T.MeshBasicMaterial({map,color,transparent:true,opacity,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6});
   const ring=new T.Mesh(this.markGeo,mat(this.markTex,new T.Color(2.2,.22,.1),.9)),fill=new T.Mesh(this.markGeo,mat(this.discTex,new T.Color(1.6,.2,.08),.3)),shell=new T.Mesh(this.shellGeo,this.shellMat);
   ring.position.set(x,y+.1,z);ring.scale.setScalar(mk.radius*2);ring.renderOrder=3;fill.position.set(x,y+.08,z);fill.renderOrder=3;shell.visible=false;this.scene.add(ring,fill,shell);
   const from=this._local(SHIP.tubes[this.tube++%2],new T.Vector3()),to=new T.Vector3(x,y,z),mid=from.clone().lerp(to,.45);mid.y=Math.max(from.y,to.y)+13;
   this.marks.push({ring,fill,shell,from,mid,to,radius:mk.radius,t0:time,at:mk.at,trail:0});
  }
  for(const p of SHIP.tubes){this._local(p,v1);this.fx.smoke.puff({position:v1.toArray(),velocity:[0,3,0],color:'#cfd3d6',size:.9,grow:2,life:1.4,opacity:.55,drag:1.4});this.fx.sparks.burst(v1.toArray(),{n:10,direction:[0,1,0],speed:7,spread:.7,colors:['#fff3cf','#ffc15c'],life:.35,seed:e.id});}
 }
 _marks(dt,time){
  for(const m of this.marks){
   const u=clamp((time-m.t0)/(m.at-m.t0),0,1),blink=.5+.5*Math.sin(time*(9+u*26));
   m.ring.rotation.y=time*.7;m.ring.material.opacity=.5+.45*blink;m.fill.scale.setScalar(lerp(.4,m.radius*2,u));m.fill.material.opacity=.12+.3*u;
   // the shell: up out of the tubes and down onto the mark
   const s=clamp((u-.12)/.88,0,1),a=(1-s)*(1-s),b=2*s*(1-s),c=s*s;m.shell.visible=u>.12&&u<1;
   m.shell.position.set(m.from.x*a+m.mid.x*b+m.to.x*c,m.from.y*a+m.mid.y*b+m.to.y*c,m.from.z*a+m.mid.z*b+m.to.z*c);
   if(m.shell.visible&&dt>0){m.trail+=dt*38;while(m.trail>=1){m.trail--;this.fx.smoke.puff({position:m.shell.position.toArray(),velocity:[sym()*.3,.2,sym()*.3],color:'#b9bdc0',size:.3,grow:.9,life:.9,opacity:.42,drag:1.5});}}
  }
  for(const m of this.marks.filter(m=>time>=m.at))this._dropMark(m);
  this.marks=this.marks.filter(m=>time<m.at);
 }
 _dropMark(m){this.scene.remove(m.ring,m.fill,m.shell);m.ring.material.dispose();m.fill.material.dispose();}
 clearMarks(){for(const m of this.marks)this._dropMark(m);this.marks=[];}
 // ---- events ----
 hit(e){
  if(e.core){this.flash=1;this.fx.sparks.burst(e.position,{n:22,direction:e.normal,speed:9,spread:1.1,colors:['#ffffff','#ffe2a8','#ff8a3a','#ff4a12'],life:.5,gravity:6,seed:e.id});}
  else this.fx.sparks.burst(e.position,{n:e.cause==='bullet'?6:14,direction:e.normal,speed:5.5,spread:.9,colors:['#ffffff','#ffd9a0','#ffb057'],life:.3,seed:e.id});
 }
 // a new phase: an engine goes
 phase(e){
  if(e.phase<2||!this.root.visible)return null;const p=this._local(SHIP.wounds[e.phase===2?0:1],new T.Vector3()).toArray();
  this.fx.explosions.trigger({position:p,radius:5,big:true,ground:null});this.fx.debris.burst(p,{n:16,speed:8,up:5,spread:1.4,size:[.5,.16,.4],colors:METAL,life:6,ground:this.groundAt(p[0],p[2]),seed:e.id});return p;
 }
 down(e,time){
  const r=this.root;this.clearMarks();this.lock=null;this.heat.fill(0);
  this.dying={at:time,x:r.position.x,y:r.position.y,z:r.position.z,gy:this.groundAt(e.position[0],e.position[2]),rz:r.rotation.z,rx:r.rotation.x,sign:r.rotation.z<0?-1:1,drift:r.position.x>0?-1:1,done:false};
 }
 // one of everything on screen for the start-up compile
 stage(at,time){
  this.root.visible=true;this.root.position.set(at[0],at[1]+9,at[2]-30);for(const l of this.lods)l.visible=true;
  this.beam.visible=true;this.beam.position.set(at[0],at[1]+6,at[2]-14);this.beamOuter.scale.set(.4,4,.4);this.beamInner.scale.set(.1,4,.1);this.spot.visible=true;this.spot.position.set(at[0],at[1]+1,at[2]-14);
  this.tele.visible=true;for(let i=0;i<TELE;i++){m4.makeScale(1,1,1).setPosition(at[0]+i*.3-6,at[1]+.2,at[2]-12);this.tele.setMatrixAt(i,m4);}this.tele.instanceMatrix.needsUpdate=true;
  this.mortar({id:-1,marks:[{position:[at[0],at[1],at[2]-10],radius:3,at:time+9}]},time);for(const m of this.marks)m.shell.visible=true;
 }
 reset(){this.clearMarks();this.root.visible=false;this.root.rotation.set(0,0,0);this.id=null;this.dying=null;this.flash=0;this.lock=null;this.line=0;this.heat.fill(0);this.beam.visible=false;this.spot.visible=false;this.tele.visible=false;if(this.light){this.fx.lights.give(this.light);this.light=null;}}
}

export function createSetPieces(scene,fx,models,{groundAt,halfWidth}){
 // blocks of snow: the crowd's shard system with a matt white surface
 const chunks=new Debris(scene,460);chunks.mesh.material.dispose();chunks.mesh.material=new T.MeshStandardMaterial({name:'snow blocks',color:'#ffffff',roughness:.95,metalness:0,flatShading:true});chunks.mesh.name='snow blocks';
 const cornices=new Cornices(scene,fx,chunks,groundAt),flows=new Avalanches(scene,fx,chunks,groundAt,halfWidth);
 const cats=models?.snowcat?new Snowcats(scene,fx,chunks,models.snowcat,groundAt):null,boss=models?.dreadnought?new Dreadnought(scene,fx,models.dreadnought,groundAt):null;
 return {cornices,flows,cats,boss,chunks,
  get textures(){return Object.values(models??{}).flatMap(m=>m.materials.flatMap(x=>[x.map,x.roughnessMap]));},
  update(dt,time,game,viewer,lamp=0){cornices.sync(game.cornices,time);if(dt>0)cornices.blow(dt,viewer);flows.update(dt,time);cats?.update(dt,time,game,viewer,lamp);boss?.update(dt,time,game,viewer);chunks.update(dt);},
  // what can be pointed out to the player: cornices that still hang and snowcats that can be boarded
  cues(game){return [...cornices.cues(),...(cats?cats.cues(game):[])];},
  stage(game,at,time){cornices.sync(game.cornices,time);cats?.update(0,time,game,new T.Vector3(...at),1);for(const it of cats?.items.values()??[])for(const l of it.lods)l.visible=true;boss?.stage(at,time);
   flows.start({side:1,S0:20,S1:30,x0:8,x1:-8,start:time-9,end:time-8,speed:15});for(const f of flows.list)f.deposit.visible=true;chunks.burst([at[0],at[1]+1,at[2]-5],{n:3});chunks.update(.01);},
  reset(){cornices.reset();flows.reset();cats?.reset();boss?.reset();chunks.reset?.();chunks.items=[];chunks.mesh.count=0;},
  inspection(){return {cornices:[...cornices.items.values()].map(i=>({id:i.c.id,state:i.c.state,visible:i.mesh.visible})),flows:flows.list.length,chunks:chunks.items.length,
   cats:cats?[...cats.items.entries()].map(([id,i])=>({id,lod:i.lods.findIndex(l=>l.visible),wreck:i.wreck,light:!!i.light})):null,
   boss:boss?{visible:boss.root.visible,marks:boss.marks.length,beam:boss.beam.visible,dying:!!boss.dying,lod:boss.lods.findIndex(l=>l.visible)}:null};}};
}
