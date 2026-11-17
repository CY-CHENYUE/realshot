import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// An independent wide firing gallery. The narrow real service tracks are
// outside the 12m opening; nothing fills the middle with a floor or wall.
// This module deliberately leaves the earlier industrial layout untouched.
export function createOpenDepthScene({materials={}}={}){
 const root=new T.Group();root.name='07 / wide open maintenance range';
 const geometries=new Set(),ownMaterials=new Set(),collisionBoxes=[],members=[];
 let mode='transparent',disposed=false;
 const physical=(key,color,metalness,roughness)=>materials[key]??(()=>{const m=new T.MeshStandardMaterial({name:'OpenDepth_'+key,color,metalness,roughness});ownMaterials.add(m);return m;})();
 const m={shell:physical('shell','#a8afa5',.1,.64),slate:physical('slate','#6c8185',.13,.59),alloy:physical('alloy','#718185',.91,.46),graphite:physical('graphite','#3f505b',.18,.58),deck:physical('deck','#77827c',.52,.72),caution:physical('caution','#b09b67',.06,.65),rubber:physical('rubber','#27373d',0,.85)};
 const p=new T.Vector3(),n=new T.Vector3();
 function box(id,size,position,material=m.slate,{radius=.012,solid=true,cast=true,receive=true}={}){
  const geometry=new RoundedBoxGeometry(...size,2,Math.min(radius,...size.map(v=>v*.16)));
  // Shared coating/deck images use world metres rather than stretching one
  // tile across a long track or service beam.
  const pos=geometry.attributes.position,norm=geometry.attributes.normal,uv=new Float32Array(pos.count*2);
  for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i).add(new T.Vector3(...position));n.fromBufferAttribute(norm,i);if(Math.abs(n.y)>=Math.max(Math.abs(n.x),Math.abs(n.z))){uv[i*2]=p.x;uv[i*2+1]=p.z;}else if(Math.abs(n.x)>Math.abs(n.z)){uv[i*2]=p.z;uv[i*2+1]=p.y;}else{uv[i*2]=p.x;uv[i*2+1]=p.y;}}
  geometry.setAttribute('uv',new T.BufferAttribute(uv,2));geometries.add(geometry);
  const mesh=new T.Mesh(geometry,material);mesh.name=id;mesh.position.fromArray(position);mesh.castShadow=cast;mesh.receiveShadow=receive;root.add(mesh);
  if(solid)collisionBoxes.push({id,name:id,objectName:id,min:position.map((v,i)=>v-size[i]/2),max:position.map((v,i)=>v+size[i]/2)});
  members.push({id,size:size.slice(),position:position.slice(),solid});return mesh;
 }
 // Load runs continuously to the far gate rather than ending in floating
 // platforms. The small cassettes are service access, not a broad game floor.
 for(const side of[-1,1]){
  const x=side*6.30;
  box(`open range / ${side} continuous track beam`,[.18,.30,17.6],[x,-.29,-3.5],m.graphite);
  box(`open range / ${side} track bottom flange`,[.36,.055,17.6],[x,-.47,-3.5],m.alloy,{radius:.006});
  for(let i=0;i<6;i++){
   const z=3.82-i*2.92;
   box(`open range / ${side} narrow service cassette ${i}`,[.55,.12,2.87],[x,-.06,z],m.deck,{radius:.008});
   box(`open range / ${side} inner toe strip ${i}`,[.030,.07,2.87],[side*6.035,.025,z],m.alloy,{radius:.004});
  }
  // The only near vertical structure is outside the view corridor. It is
  // cropped by perspective, never a diagonal beam across the player's aim.
  for(const z of[4.75,-3.45,-11.65]){
   box(`open range / ${side} supported upright ${z}`,[.18,4.70,.22],[side*6.64,2.03,z],m.slate);
   box(`open range / ${side} column foot ${z}`,[.47,.18,.48],[side*6.55,-.25,z],m.alloy);
   box(`open range / ${side} track tie ${z}`,[.53,.15,.30],[side*6.47,-.18,z],m.graphite);
   box(`open range / ${side} upper rail saddle ${z}`,[.40,.12,.39],[side*6.56,4.36,z],m.alloy);
  }
  box(`open range / ${side} high longitudinal carrier`,[.19,.22,17.1],[side*6.55,4.42,-3.45],m.slate);
  box(`open range / ${side} exposed upper flange`,[.29,.035,17.1],[side*6.55,4.29,-3.45],m.alloy,{radius:.004});
 }
 // One offset service installation sits entirely beyond the side lane. Its
 // panels, heat exchanger and cable rail form a complete manufactured unit.
 box('open range / starboard machinery support',[.65,.14,2.05],[6.47,.035,-8.65],m.deck);
 box('open range / starboard service spine',[.73,3.60,.90],[6.89,1.87,-8.65],m.graphite);
 box('open range / starboard formed power cover',[.68,1.45,.065],[6.89,2.70,-8.16],m.shell);
 box('open range / starboard upper cap',[.88,.11,1.04],[6.89,3.72,-8.65],m.alloy);
 box('open range / starboard lower heel',[.88,.15,1.04],[6.89,.10,-8.65],m.alloy);
 box('open range / starboard identification field',[.46,.26,.014],[6.89,3.13,-8.115],m.caution,{radius:.004});
 box('open range / starboard vent recess',[.50,.81,.06],[6.89,1.35,-8.14],m.rubber);
 for(let i=0;i<5;i++)box(`open range / starboard heat-exchanger blade ${i}`,[.47,.047,.08],[6.89,1.05+i*.15,-8.10],m.alloy,{radius:.004});
 box('open range / starboard cable conduit',[.075,.12,2.73],[6.90,3.52,-10.45],m.alloy,{radius:.006});
 box('open range / starboard cable riser',[.075,1.00,.075],[6.90,3.00,-11.78],m.alloy,{radius:.006});
 // Port overhead plenum belongs to the outer service hull. It stays above
 // both the player-height silhouette and all four approach paths.
 box('open range / port high utility housing',[.56,.73,3.00],[-6.75,3.62,-6.9],m.slate);
 box('open range / port plenum endcap',[.64,.79,.095],[-6.75,3.62,-5.36],m.shell);
 box('open range / port utility lower rail',[.18,.12,6.15],[-6.56,3.18,-8.36],m.alloy);
 for(const z of[-5.52,-8.28])box(`open range / port utility hanger ${z}`,[.12,.52,.16],[-6.56,4.04,z],m.graphite);
 // A single thin wide rear pressure gate gives a large distance reference,
 // not a frame around the screen. All centre space stays genuinely empty.
 const gate={z:-11.55,width:12,height:4.4,bottom:0};
 for(const side of[-1,1]){
  box(`open range / rear gate jamb ${side}`,[.17,4.40,.33],[side*6.085,2.20,gate.z],m.slate);
  box(`open range / rear gate front edge ${side}`,[.028,4.40,.027],[side*6.02,2.20,gate.z+.18],m.alloy,{radius:.004});
  box(`open range / rear gate outer shoe ${side}`,[.42,.22,.55],[side*6.20,-.11,gate.z],m.alloy);
  box(`open range / rear gate outboard upper tie ${side}`,[.60,.12,.30],[side*6.35,4.44,gate.z],m.alloy);
 }
 box('open range / rear gate thin header',[12.34,.17,.33],[0,4.485,gate.z],m.slate);
 box('open range / rear gate header lip',[12.05,.030,.03],[0,4.405,gate.z+.18],m.alloy,{radius:.004});
 box('open range / rear gate real sill',[12.34,.12,.33],[0,-.06,gate.z],m.slate);
 root.updateMatrixWorld(true);
 function inspection(){let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return {art:'open-depth-r12',mode,meshes,triangles,collisionBoxes:collisionBoxes.length,activeCollisionBoxes:collisionBoxes.length,receiverCount:meshes,propsPlacement:[],gate:{...gate},landmarks:[{id:'narrow port maintenance rail',position:[-6.3,0,-3.5]},{id:'outboard starboard service spine',position:[6.89,2,-8.65]},{id:'wide pressure gate',position:[0,2.2,-11.55]}],whiteOpenings:[{id:'wide central firing and viewing volume',min:[-6,0,-12],max:[6,4.4,5.2]},{id:'central hero and attack bay',min:[-3.3,0,-12],max:[3.3,3.8,5.2]}],hiddenFloor:false,opaqueSideWalls:false,fullNearPortal:false,nearDiagonalBeams:false,members:members.map(x=>({...x,size:x.size.slice(),position:x.position.slice()})),composition:'Two narrow outboard maintenance tracks, sparse supported side columns, upper utility assemblies, one wide thin distant gate; clear central shooting volume.'};}
 function setDisplayMode(value='transparent'){if(!['transparent','desktop'].includes(value))throw new RangeError('Unknown output mode '+value);mode=value;return {mode,collisionBoxes:collisionBoxes.length};}
 function dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const mat of ownMaterials)mat.dispose();root.clear();}
 return {root,collisionBoxes,get activeCollisionBoxes(){return collisionBoxes;},inspection,update(){},setDisplayMode,dispose};
}
