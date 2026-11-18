import * as T from 'three';
import {sToZ} from './level-core.mjs';

// RealShot r26 · the outposts along the route: generated props (Lux3D) placed by hand.
// Each prop has three levels of detail (assets/props/<kind>.json + .bin, maps per level); every kind and level
// is one instanced mesh, refilled a few times a second from the distance to the eye. A prop brings its own
// collision boxes (the body, shots and the foot soldiers all respect them) and the fuel drums blow up.
//
// boxes: [x0,x1,y0,y1,z0,z1] in the prop's own metres; sink: how far the base sits in the snow;
// lamps: [x,y,z] of each lamp head (they face the prop's +x); throw: where the light lands, [x,z] from the prop.
export const PROPS=Object.freeze({
 crates:{boxes:[[-.72,.72,0,1.45,-.58,.58]],sink:.04},
 sandbags:{boxes:[[-1.32,1.32,0,1.05,-1.32,1.32]],sink:.07},
 barrier:{boxes:[[-.82,.82,0,1.0,-.72,.72]],sink:.05},
 'fuel-barrels':{boxes:[[-.68,.68,0,1.05,-.6,.6]],sink:.03,explosive:{radius:6.5,damage:22,playerDamage:38,hp:3}},
 'snowcat-wreck':{boxes:[[-1.25,1.25,0,1.9,-1.72,1.72]],sink:.36},
 'outpost-cabin':{boxes:[[-1.18,1.18,0,2.8,-1.42,1.42]],sink:.05},
 'relay-tower':{boxes:[[-2.1,2.1,0,2.4,-1.9,1.9],[-1.1,1.1,2.4,12,-1,1]],sink:.1},
 floodlight:{boxes:[[-.1,2.0,0,2.25,-.9,.9],[-.75,-.1,0,4.2,-.3,.3]],sink:.04,lamps:[[-.42,3.72,0]],throw:[5.2,0]},
});
export const PROP_KINDS=Object.keys(PROPS);
// [kind, S (metres along the route), x, yaw in degrees, scale]
export const LAYOUT=Object.freeze([
 // start camp
 ['outpost-cabin',27,-6.3,90],['floodlight',21.5,6.1,-150],['crates',24,4.3,15],['crates',30.5,-3.7,-20,.9],['sandbags',35,3.1,0],
 ['barrier',39,-1.6,10],['barrier',39.6,5.6,-172],['fuel-barrels',45,-5.6,30],
 // pine valley
 ['snowcat-wreck',53,5.9,35],['fuel-barrels',56.5,3.4,-15],['barrier',63,-4.2,5],['barrier',63.6,.4,168],
 ['crates',88,-5.2,70],['sandbags',93,-2.3,0],['fuel-barrels',100,2.3,12],['fuel-barrels',108,-4.6,-40],
 ['floodlight',117,-6.4,-30],['crates',121.5,-4.4,-12],['relay-tower',127,6.3,8],
 // glacier canyon
 ['barrier',140,3.1,8],['barrier',140.4,-3.6,175],['fuel-barrels',142.5,.2,50],['snowcat-wreck',158,-4.7,-25],
 ['sandbags',182,3.5,0],['crates',185.5,5.5,24],['fuel-barrels',196,-2.6,0],['barrier',200.5,.7,-6],['fuel-barrels',204,4.3,65],
 ['crates',222,-5.1,-35],['floodlight',228,5.9,-155],['outpost-cabin',238,6.6,-90],['sandbags',245,-3.1,0],
 // wind col
 ['barrier',256,-2.1,4],['barrier',256.5,3.3,170],['fuel-barrels',258.5,6.2,20],['snowcat-wreck',274,5.7,15],['crates',278.5,3.1,-8],
 ['fuel-barrels',290,-3.3,-25],['fuel-barrels',296,1.9,40],['floodlight',311,-6.2,-20],['crates',313,-7.4,60,.9],
 ['sandbags',326,2.3,0],['barrier',332,-4.3,-12],['outpost-cabin',358,-8.4,90],['crates',361,-5.6,18],['relay-tower',365,9.3,-10],
 // ice lake
 ['barrier',380,-6.1,6],['barrier',380.4,0,-176],['barrier',380,6.2,-4],['fuel-barrels',383,-3.1,10],['fuel-barrels',383.5,3.5,-30],
 ['snowcat-wreck',396,-7.2,50],['sandbags',408,4.1,0],['crates',410.5,6.7,-22],['fuel-barrels',414,-1.6,75],
 ['floodlight',428,8.2,-160],['floodlight',428.5,-8.3,-20],['fuel-barrels',438,-5.6,5],['fuel-barrels',440,5.7,-48],
 // the beacon
 ['sandbags',448.5,-4.6,0],['sandbags',450,4.7,0],['crates',453.5,-6.4,30],['crates',459.5,5.9,-14],['relay-tower',462,-8.6,12],
 ['floodlight',452,8.7,-175],['outpost-cabin',459,9.4,-90],['fuel-barrels',466.5,3.6,22],['fuel-barrels',468,-3.7,-18],
]);

export async function loadPropModels(base='assets/props/',kinds=PROP_KINDS){
 const loader=new T.TextureLoader(),tex=async(url,srgb)=>{const t=await loader.loadAsync(url);t.flipY=false;t.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;t.anisotropy=4;return t;};
 const out={};
 await Promise.all(kinds.map(async kind=>{
  const [meta,bin]=await Promise.all([fetch(`${base}${kind}.json`).then(r=>{if(!r.ok)throw new Error(`${kind}.json ${r.status}`);return r.json();}),fetch(`${base}${kind}.bin`).then(r=>{if(!r.ok)throw new Error(`${kind}.bin ${r.status}`);return r.arrayBuffer();})]);
  const lods=meta.lods.map(p=>{const g=new T.BufferGeometry();
   g.setAttribute('position',new T.BufferAttribute(new Float32Array(bin,p.position,p.vertices*3),3));
   g.setAttribute('normal',new T.BufferAttribute(new Int8Array(bin,p.normal,p.vertices*3),3,true));
   g.setAttribute('uv',new T.BufferAttribute(new Float32Array(bin,p.uv,p.vertices*2),2));
   g.setIndex(new T.BufferAttribute(p.wide?new Uint32Array(bin,p.index,p.tris*3):new Uint16Array(bin,p.index,p.tris*3),1));g.computeBoundingSphere();return g;});
  const materials=await Promise.all(meta.lods.map(async(l,i)=>{const [map,orm]=await Promise.all([tex(`${base}${kind}${l.tex}-albedo.jpg`,true),tex(`${base}${kind}${l.tex}-orm.jpg`,false)]);
   return new T.MeshStandardMaterial({name:`prop / ${kind} lod${i}`,map,roughnessMap:orm,metalnessMap:orm,roughness:1,metalness:.5});}));
  out[kind]={meta,lods,materials};
 }));
 return out;
}

function glowTexture(){
 const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d'),r=g.createRadialGradient(64,64,0,64,64,64);
 r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.12,'rgba(255,255,255,.75)');r.addColorStop(.4,'rgba(255,255,255,.2)');r.addColorStop(1,'rgba(255,255,255,0)');
 g.fillStyle=r;g.fillRect(0,0,128,128);const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;
}
// candela of a floodlight's real light at full night (the snow under it should read lit, not burnt out)
const LIGHT=30;
const m4=new T.Matrix4(),q=new T.Quaternion(),UP=new T.Vector3(0,1,0),v=new T.Vector3(),sc=new T.Vector3();

export class PropField{
 // near/mid: how many of its own sizes away a prop drops to its second and third level
 constructor(scene,models,{groundAt=()=>0,layout=LAYOUT,near=7,mid=26,place=null}={}){
  this.models=models;this.near=near;this.mid=mid;this.group=new T.Group();this.group.name='props';scene.add(this.group);
  this.items=[];this.live=[];this.eye=new T.Vector3(1e9,0,0);this.at=-9;this.lamp=0;this.forceLod=-1;
  const count={};
  layout.forEach(([kind,S,x,yaw=0,scale=1],i)=>{
   const M=models[kind],P=PROPS[kind];if(!M||!P)return;
   const pos=place?place(S,x):[x,groundAt(x,sToZ(S)),sToZ(S)],a=T.MathUtils.degToRad(yaw),c=Math.cos(a),s=Math.sin(a);
   const y=pos[1]-P.sink*scale,matrix=new T.Matrix4().compose(v.set(pos[0],y,pos[2]),q.setFromAxisAngle(UP,a),sc.setScalar(scale)).clone();
   const world=(lx,ly,lz)=>[pos[0]+(lx*c+lz*s)*scale,y+ly*scale,pos[2]+(-lx*s+lz*c)*scale];
   // each box turns with the prop; what the rules get is the axis-aligned box round it
   const boxes=P.boxes.map((b,k)=>{const min=[1e9,1e9,1e9],max=[-1e9,-1e9,-1e9];
    for(const lx of [b[0],b[1]])for(const lz of [b[4],b[5]])for(const ly of [b[2],b[3]]){const w=world(lx,ly,lz);for(let n=0;n<3;n++){min[n]=Math.min(min[n],w[n]);max[n]=Math.max(max[n],w[n]);}}
    min[1]=Math.min(min[1],pos[1]-.3);
    return {id:k?`prop:${i}:${k}`:`prop:${i}`,min,max,solid:true,prop:kind,...(P.explosive&&!k?{explosive:P.explosive}:{})};});
   const size=Math.max(M.meta.height,M.meta.max[0]-M.meta.min[0],M.meta.max[2]-M.meta.min[2])*scale*.5;
   this.items.push({id:`prop:${i}`,kind,position:[pos[0],y,pos[2]],yaw:a,scale,matrix,size,boxes,alive:true,lod:-1,world,
    lamps:(P.lamps??[]).map(l=>world(...l)),pool:P.throw?world(P.throw[0],0,P.throw[1]):null});
   count[kind]=(count[kind]??0)+1;
  });
  this.sets={};
  for(const [kind,n] of Object.entries(count))this.sets[kind]=models[kind].lods.map((g,l)=>{const m=new T.InstancedMesh(g,models[kind].materials[l],n);m.name=`prop / ${kind} lod${l}`;m.count=0;m.visible=false;m.castShadow=l<2;m.receiveShadow=true;this.group.add(m);return m;});
  // floodlights: a glow at the lamp head and a pool of light on the snow, both scaled by how dark it is
  const lit=this.items.filter(i=>i.lamps.length);this.glows=[];this.pools=[];
  if(lit.length){
   const map=glowTexture();
   this.glowMat=new T.SpriteMaterial({map,color:'#000000',blending:T.AdditiveBlending,depthWrite:false,fog:false,toneMapped:false});
   this.poolMat=new T.MeshBasicMaterial({map,color:'#000000',blending:T.AdditiveBlending,depthWrite:false,transparent:true,fog:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
   const disc=new T.CircleGeometry(1,28);disc.rotateX(-Math.PI/2);
   for(const item of lit){
    for(const l of item.lamps){const s=new T.Sprite(this.glowMat);s.position.set(...l);s.scale.setScalar(1.25*item.scale);s.renderOrder=4;this.group.add(s);this.glows.push({s,item});}
    if(item.pool){const p=new T.Mesh(disc,this.poolMat);p.position.set(item.pool[0],groundAt(item.pool[0],item.pool[2])+.06,item.pool[2]);p.scale.set(6.5,1,6.5);p.renderOrder=2;this.group.add(p);this.pools.push({p,item});
     item.lightAt=[(item.lamps[0][0]*2+item.pool[0])/3,item.lamps[0][1]-.5,(item.lamps[0][2]*2+item.pool[2])/3];}
   }
   // two real lights follow the two nearest floodlights (a fixed count: the light set never changes, so nothing recompiles)
   this.lights=[0,1].map(()=>{const l=new T.PointLight('#ffe9c4',0,26,1.7);l.castShadow=false;this.group.add(l);return l;});this.lit=lit;
  }
  this._boxes();this.refresh(this.eye,true);
 }
 get textures(){return Object.values(this.models).flatMap(m=>m.materials.flatMap(x=>[x.map,x.roughnessMap]));}
 _boxes(){this.live.length=0;for(const i of this.items)if(i.alive)for(const b of i.boxes)this.live.push(b);}
 // refill the instanced meshes: level 0 near, 1 mid, 2 far (with a little hysteresis so a prop on the line does not flicker)
 refresh(eye,force=false){
  let changed=force;
  for(const i of this.items){
   const d=Math.hypot(i.position[0]-eye.x,i.position[2]-eye.z)/i.size,k=i.lod===0?1.12:1,k2=i.lod<=1&&i.lod>=0?1.12:1;
   const lod=!i.alive?-2:this.forceLod>=0?this.forceLod:d<this.near*k?0:d<this.mid*k2?1:2;
   if(lod!==i.lod){i.lod=lod;changed=true;}
  }
  if(!changed)return;
  for(const set of Object.values(this.sets))for(const m of set)m.count=0;
  for(const i of this.items){if(i.lod<0)continue;const m=this.sets[i.kind][i.lod];m.setMatrixAt(m.count++,i.matrix);}
  for(const set of Object.values(this.sets))for(const m of set){m.visible=m.count>0;if(m.count){m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();}}
  for(const g of this.glows)g.s.visible=g.item.alive;
  this._lights(eye);
 }
 _lights(eye){
  if(!this.lights)return;
  const near=this.lit.filter(i=>i.alive).map(i=>({i,d:Math.hypot(i.position[0]-eye.x,i.position[2]-eye.z)})).sort((a,b)=>a.d-b.d).slice(0,this.lights.length);
  this.lights.forEach((l,k)=>{const n=near[k];l.userData.on=!!n&&n.d<90;if(n)l.position.set(...n.i.lightAt);l.intensity=l.userData.on?LIGHT*this.lamp:0;});
  for(const p of this.pools)p.p.visible=p.item.alive&&!near.some(n=>n.i===p.item&&n.d<90);
 }
 // lamp: 0 in daylight .. 1 at night
 update(time,eye,lamp=0){
  this.eye.copy(eye);
  if(this.glowMat&&Math.abs(lamp-this.lamp)>.004){this.lamp=lamp;this.glowMat.color.setRGB(1.25*lamp,1.12*lamp,.86*lamp);this.poolMat.color.setRGB(.2*lamp,.18*lamp,.135*lamp);for(const l of this.lights)l.intensity=l.userData.on?LIGHT*lamp:0;}
  if(time-this.at>.2||time<this.at){this.at=time;this.refresh(eye);this._lights(eye);}
 }
 item(id){const k=String(id).split(':').slice(0,2).join(':');return this.items.find(i=>i.id===k)??null;}
 // a spent prop (an exploded fuel store) leaves the picture and the collision set
 remove(id){const i=this.item(id);if(!i||!i.alive)return null;i.alive=false;this._boxes();this.refresh(this.eye,true);return i;}
 reset(){for(const i of this.items)i.alive=true;this._boxes();this.refresh(this.eye,true);}
 inspection(){const lods=[0,0,0];for(const i of this.items)if(i.lod>=0)lods[i.lod]++;return {props:this.items.length,alive:this.items.filter(i=>i.alive).length,boxes:this.live.length,lods,lamp:this.lamp};}
}
