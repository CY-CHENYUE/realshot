import * as T from 'three';

// An open maintenance extension behind the existing pressure gate. All units
// are metres. Identical full-size ribs recede through perspective; no screen-
// space fake room, floor, sky, fog, or invisible collision receiver is added.
export function createDepthExtension({width=7.9,height=3.1}={}){
 if(!Number.isFinite(width)||width<=0||!Number.isFinite(height)||height<=0)throw new RangeError('Extension opening dimensions must be positive metres');
 const half=width/2,center=height/2;
 const root=new T.Group();root.name='07 / open long-range maintenance extension';
 const geometries=new Set(),materials=new Set(),collisionBoxes=[],members=[];
 let disposed=false;
 const own=m=>{materials.add(m);return m;};
 const coating=own(new T.MeshStandardMaterial({name:'DepthExtension_coldCoating',color:'#71828b',metalness:.12,roughness:.68}));
 const edge=own(new T.MeshStandardMaterial({name:'DepthExtension_titaniumEdge',color:'#8b989d',metalness:.55,roughness:.48}));
 const inset=own(new T.MeshStandardMaterial({name:'DepthExtension_recess',color:'#4d626d',metalness:.2,roughness:.76}));
 // White panel is a bounded virtual backstop, not a transparency opening.
 // Its white material stays RGB255 after tone mapping, while joints, impacts
 // and converging rib silhouettes supply the finite depth/scale reference.
 const white=own(new T.MeshBasicMaterial({name:'DepthExtension_whiteBackstop',color:0xffffff,toneMapped:false,fog:false}));
 // OutputPass tone maps the whole HDR target even for a Basic source. Supply
 // a bounded white output only on this panel so its final display value clips
 // to white; seams, actual impacts and all other materials remain untouched.
 white.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight=vec3(64.0);\n#include <opaque_fragment>');};
 white.customProgramCacheKey=()=> 'white-virtual-backstop-r12';
 const seam=own(new T.MeshBasicMaterial({name:'DepthExtension_panelJoints',color:'#bcc7cb',toneMapped:false,fog:false}));
 function box(id,size,position,material,{cast=true,receive=true}={}){
  const geometry=new T.BoxGeometry(...size),mesh=new T.Mesh(geometry,material);
  geometries.add(geometry);mesh.name=id;mesh.position.fromArray(position);mesh.castShadow=cast;mesh.receiveShadow=receive;root.add(mesh);
  const min=position.map((v,i)=>v-size[i]/2),max=position.map((v,i)=>v+size[i]/2);
  collisionBoxes.push({id,name:id,objectName:id,min,max});members.push({id,size:size.slice(),position:position.slice(),kind:material===white?'finite backstop':material===seam?'attached panel reference':'load-bearing member'});
  return mesh;
 }
 const ribDepths=[-15,-20,-24.7],opening={width,height,bottom:0,top:height};
 for(let i=0;i<ribDepths.length;i++){
  const z=ribDepths[i],stem=.115;
  // The openings have the same physical dimensions at every depth. No proxy
  // spans a doorway; each of the four solids owns only its actual volume.
  for(const side of[-1,1]){
   box(`depth rib ${i+1} / jamb ${side}`,[stem,height,.22],[side*(half+stem/2),center,z],coating);
   box(`depth rib ${i+1} / edge ${side}`,[.027,height,.025],[side*(half+stem*.82),center,z+.123],edge);
   box(`depth rib ${i+1} / lower shoe ${side}`,[.23,.20,.30],[side*(half+.1),-.055,z],inset);
   box(`depth rib ${i+1} / header bearing ${side}`,[.25,.16,.28],[side*(half+.1),height+.08,z],edge);
  }
  box(`depth rib ${i+1} / header`,[width+.23,.115,.22],[0,height+.0575,z],coating);
  box(`depth rib ${i+1} / threshold`,[width+.23,.095,.22],[0,-.0475,z],coating);
 }
 // Four narrow longitudinal corner stringers tie ribs to the existing gate.
 // They frame empty air and never become an opaque side wall or broad floor.
 const front=-11.55,rear=-24.93,length=front-rear,z=(front+rear)/2;
 for(const side of[-1,1])for(const y of[-.12,height+.14]){
  box(`maintenance stringer / ${side}/${y}`,[.11,.10,length],[side*(half+.1),y,z],inset);
 }
 const backstop={id:'depth backstop / white panel',center:[0,center,-25.03],size:[width,height,.12],frontZ:-24.97};
 box(backstop.id,backstop.size,backstop.center,white,{cast:false,receive:false});
 // Seams and ruler ticks are physically attached to the panel surface; they
 // stop the shot fractionally in front of it rather than floating as decals.
 for(const x of[-width/4,width/4])box(`backstop / vertical seam ${x}`,[.018,height-.08,.006],[x,center,-24.967],seam,{cast:false,receive:false});
 box('backstop / horizontal service seam',[width-.12,.018,.006],[0,height/3,-24.967],seam,{cast:false,receive:false});
 // A short service scale at the panel's left edge is subordinate to the
 // whole-plane reference. Its 0.25m rhythm is a world measurement, not pixels.
 for(let i=0;i<7;i++)box(`backstop / quarter-metre scale ${i}`,[i%2===0?.13:.07,.018,.006],[-half+.23,.45+i*.25,-24.967],seam,{cast:false,receive:false});
 root.updateMatrixWorld(true);
 function inspection(){
  let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  return {id:'depth-extension-r12',units:'metres',ribDepths:ribDepths.slice(),opening:{...opening},backstop:structuredClone(backstop),meshes,triangles,collisionBoxes:collisionBoxes.length,whiteOpenings:true,hiddenFloor:false,opaqueSideWalls:false,sky:false,fog:false,members:members.map(m=>({...m,size:m.size.slice(),position:m.position.slice()})),notes:'Bounded virtual white backstop; it does not claim to coincide with a physical wall behind the LCD. Open side gaps remain empty.'};
 }
 function dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const m of materials)m.dispose();root.clear();}
 return {root,collisionBoxes,inspection,dispose};
}
