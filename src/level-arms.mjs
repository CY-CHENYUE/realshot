import * as T from 'three';

// RealShot r26 · the generated weapons held in the hand (Lux3D): VX-6 minigun, RK-3 launcher.
// assets/weapons/<kind>.json + .bin, one 2048 albedo and one metal/rough map each. Weapon space: the bore runs
// along -z through the origin, y is up, metres. A weapon may come in two parts: 'body' and 'spin' (the barrel
// cluster, which turns round the bore).
export const ARMS=Object.freeze({minigun:'vm-minigun',rpg:'vm-launcher'});

// The steel collar where the VX-6's barrels enter the housing, in the minigun's weapon space (add it to the part that
// does not turn). The generated model was cut in two there so the barrels can spin, and the cut shows as a torn edge;
// the collar covers it. Turned steel: every face of the profile (radius, distance along the bore) is its own band, so
// the edges stay hard and the bevels catch the light. One definition for the level and the armory.
const COLLAR=[[.066,-.143],[.0745,-.143],[.0765,-.141],[.0765,-.124],[.0755,-.123],[.0735,-.123],[.0735,-.109],[.0755,-.109],[.0765,-.108],[.0765,-.08],[.0755,-.079],[.0735,-.079],[.0735,-.065],[.0755,-.065],[.0765,-.064],[.0765,-.05],[.0785,-.048],[.0785,-.026]];
export const COLLAR_STEEL=Object.freeze({name:'module / barrel collar',color:'#3b3a39',roughness:.33,metalness:.9});
export function barrelCollar(material,segments=96){
 const pr=COLLAR.map(([r,z])=>new T.Vector2(r,z)),pos=[],nor=[],uv=[],idx=[];
 // the bands share no vertices (that is what keeps the edges hard) but go into one geometry: one draw call
 for(let k=0;k+1<pr.length;k++){const b=new T.LatheGeometry([pr[k],pr[k+1]],segments),base=pos.length/3;
  pos.push(...b.attributes.position.array);nor.push(...b.attributes.normal.array);uv.push(...b.attributes.uv.array);for(const i of b.index.array)idx.push(base+i);b.dispose();}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new T.Float32BufferAttribute(nor,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(idx);geo.computeBoundingSphere();
 const g=new T.Mesh(geo,material);g.name='barrel collar';g.rotation.x=Math.PI/2;g.position.y=-.004;return g;
}

export async function loadWeaponModels(base='assets/weapons/',kinds=Object.values(ARMS)){
 const loader=new T.TextureLoader(),tex=async(url,srgb)=>{const t=await loader.loadAsync(url);t.flipY=false;t.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;t.anisotropy=8;return t;};
 const out={};
 await Promise.all(kinds.map(async kind=>{
  const [meta,bin,map,orm]=await Promise.all([fetch(`${base}${kind}.json`).then(r=>{if(!r.ok)throw new Error(`${kind}.json ${r.status}`);return r.json();}),fetch(`${base}${kind}.bin`).then(r=>{if(!r.ok)throw new Error(`${kind}.bin ${r.status}`);return r.arrayBuffer();}),
   tex(`${base}${kind}-albedo.jpg`,true),tex(`${base}${kind}-orm.jpg`,false)]);
  const parts={};
  for(const p of meta.parts){const g=new T.BufferGeometry();
   g.setAttribute('position',new T.BufferAttribute(new Float32Array(bin,p.position,p.vertices*3),3));
   g.setAttribute('normal',new T.BufferAttribute(new Int8Array(bin,p.normal,p.vertices*3),3,true));
   g.setAttribute('uv',new T.BufferAttribute(new Float32Array(bin,p.uv,p.vertices*2),2));
   g.setIndex(new T.BufferAttribute(p.wide?new Uint32Array(bin,p.index,p.tris*3):new Uint16Array(bin,p.index,p.tris*3),1));g.computeBoundingSphere();parts[p.part]=g;}
  // the map carries the metal: painted steel and bare barrels both come from it
  out[kind]={meta,parts,material:new T.MeshStandardMaterial({name:`weapon / ${kind}`,map,roughnessMap:orm,metalnessMap:orm,roughness:1,metalness:1,envMapIntensity:1.1})};
 }));
 return out;
}
