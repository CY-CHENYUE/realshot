import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ENCLOSURE} from './enclosure-profile.mjs';
import {EnclosureSpace} from './enclosure-space.mjs';

// Source coordinates are the measured CAD coordinates in millimetres: X is
// horizontal, Y points into the enclosure, Z is up. No invented metre-scale
// corridor is fitted to the screen. The front loop and four curved seams are
// kept at their source positions, including the tilted aperture and fillets.
export function createEnclosureDefenseScene({materials={},artKit=null,depthBays=null,includeServiceCassettes=true}={}){
 const root=new T.Group();root.name='CAD / fixed-front enclosure seams';root.matrixAutoUpdate=false;
 const geometries=new Set(),ownedMaterials=new Set(),localSolids=[],collisionBoxes=[],members=[];
 let mode='transparent',disposed=false,configured=false,lastCamera=null;
 const material=(key,color,metalness,roughness)=>materials[key]??(()=>{const m=new T.MeshStandardMaterial({name:'EnclosureDefense_'+key,color,metalness,roughness});ownedMaterials.add(m);return m;})();
 const m={edge:material('alloy','#a1aaab',.78,.43),shell:material('shell','#949f9d',.16,.67),slate:material('slate','#687c80',.25,.64),graphite:material('graphite','#33464f',.25,.63),caution:material('caution','#bc9d56',.12,.65)};
 function mesh(id,geometry,mat){geometries.add(geometry);const o=new T.Mesh(geometry,mat);o.name=id;o.castShadow=true;o.receiveShadow=true;root.add(o);return o;}
 function solid(id,bounds){localSolids.push({id,min:bounds.min.clone(),max:bounds.max.clone()});}
 function rail(id,sourcePoints,radius,{closed=false}={}){
  const parts=[],points=sourcePoints.map(p=>new T.Vector3(...p)),edges=closed?points.length:points.length-1;
  let pieces=0,maxSegmentMM=0;
  for(let i=0;i<edges;i++){
   const start=points[i],end=points[(i+1)%points.length],length=start.distanceTo(end),steps=Math.max(1,Math.ceil(length/4));
   for(let j=0;j<steps;j++){
    const a=start.clone().lerp(end,j/steps),b=start.clone().lerp(end,(j+1)/steps),d=b.clone().sub(a),center=a.clone().add(b).multiplyScalar(.5);
    maxSegmentMM=Math.max(maxSegmentMM,d.length());
    const g=new T.CylinderGeometry(radius,radius,d.length(),8,1,false);
    g.applyMatrix4(new T.Matrix4().compose(center,new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()),new T.Vector3(1,1,1)));
    g.computeBoundingBox();solid(`${id} / segment ${pieces}`,g.boundingBox);parts.push(g);pieces++;
   }
  }
  const geometry=mergeGeometries(parts,false);for(const g of parts)g.dispose();mesh(id,geometry,m.edge);
  members.push({id,type:'segmented solid cylindrical seam',radiusMM:radius,pieces,maxSegmentMM,sourcePoints:sourcePoints.map(p=>p.slice()),closed});
 }
 function box(id,size,center,mat){
  const geometry=new T.BoxGeometry(...size);geometry.translate(...center);mesh(id,geometry,mat);geometry.computeBoundingBox();solid(id,geometry.boundingBox);
  members.push({id,type:'finite side service fitting',sizeMM:size.slice(),sourceCenter:center.slice()});
 }
 rail('CAD / aperture edge',ENCLOSURE.aperture.loop,.36,{closed:true});
 for(const path of ENCLOSURE.cavity.paths)rail('CAD / '+path.name+' curved inner seam',path.points,.43);
 // Small wall-mounted service cassettes, independent of the measured shell.
 // These finite manufactured details use the known 195mm cavity width and
 // remain outside |X|=90mm. They do not invent a rear panel or a central floor.
 for(const side of artKit||!includeServiceCassettes?[]:[-1,1]){
  const prefix=`CAD / ${side<0?'port':'starboard'} side service cassette`;
  box(prefix+' mounting heel',[1.4,26,29],[side*96.3,9,158],m.edge);
  box(prefix+' formed enclosure',[3.8,23,26],[side*94.5,9,158],m.slate);
  box(prefix+' recessed face',[.48,16,19],[side*92.36,9,158],m.graphite);
  for(let i=0;i<3;i++)box(prefix+` vent lip ${i}`,[.64,13,1.0],[side*92.05,9,153+i*4],m.edge);
  box(prefix+' bounded safety tag',[.7,4.0,3.2],[side*92.05,3,165],m.caution);
 }
 if(artKit){
  root.add(artKit.root);
  for(const b of artKit.localSolids)solid(b.id,new T.Box3(new T.Vector3(...b.min),new T.Vector3(...b.max)));
 }
 if(depthBays){root.add(depthBays.root);for(const b of depthBays.localSolids)solid(b.id,new T.Box3(new T.Vector3(...b.min),new T.Vector3(...b.max)));}
 function addCADProp(id,model,bounds){
  if(disposed)throw new Error('Cannot attach to a disposed enclosure');
  root.add(model);solid(id,bounds);if(lastCamera)configure(lastCamera);
 }
 function configure(camera){
  if(disposed)throw new Error('Cannot configure a disposed enclosure stage');
  camera.updateMatrixWorld(true);lastCamera=camera;
  const space=new EnclosureSpace(camera,10);
  // EnclosureSpace.world() returns camera-space, despite its historical name.
  // Converting to actual world here prevents applying the FPS camera twice.
  depthBays?.configure?.(camera,10);
  root.matrix.multiplyMatrices(camera.matrixWorld,space.matrix);root.matrixWorldNeedsUpdate=true;root.updateMatrixWorld(true);
  collisionBoxes.length=0;
  for(const member of localSolids){const b=new T.Box3(member.min.clone(),member.max.clone()).applyMatrix4(root.matrixWorld);collisionBoxes.push({id:member.id,name:member.id,objectName:member.id,min:b.min.toArray(),max:b.max.toArray()});}
  configured=true;return inspection();
 }
 function uv(point){if(!lastCamera)return null;const p=new T.Vector3(...point).applyMatrix4(root.matrixWorld).project(lastCamera);return {x:(p.x+1)/2,y:(1-p.y)/2};}
 function inspection(){
  let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  const depthInspection=depthBays?.inspection()??null;
  return {art:depthInspection?.id==='snow-enclosure-r18'?'snow-enclosure-r18':depthInspection?.id==='virtual-side-depth-bays-r17'?'cad-facility-r17':depthBays?'cad-facility-r16':artKit?'cad-facility-r14':'cad-enclosure-r13',details:artKit?.inspection()??null,depthBays:depthInspection,mode,configured,meshes,triangles,collisionBoxes:collisionBoxes.length,localSolidSegments:localSolids.length,activeCollisionBoxes:collisionBoxes.length,receiverCount:meshes,propsPlacement:[],hiddenFloor:false,opaqueSideWalls:!!artKit,centralRearPanel:false,stationaryStructure:!depthBays,sourceUnits:'millimetres interpreted from original-size CAD; not embedded unit metadata',source:ENCLOSURE.source??null,apertureMM:{width:ENCLOSURE.aperture.width,height:ENCLOSURE.aperture.height,center:ENCLOSURE.aperture.center.slice(),normal:ENCLOSURE.aperture.normal.slice()},designEyeMM:{...ENCLOSURE.designEye,measured:false},depth:10,frontLoopSource:ENCLOSURE.aperture.loop.map(p=>p.slice()),frontUV:ENCLOSURE.aperture.loop.map(uv),sideGuides:ENCLOSURE.cavity.paths.map(p=>({name:p.name,sourcePoints:p.points.map(v=>v.slice()),uv:p.points.map(uv)})),centralReservation:{sourceXMM:[-55,55],note:artKit?'Finite continuous side walls, overhead service panels and supported side facilities; reserved central air has no floor, backstop or proxy.':'Only finite side fittings and CAD perimeter seams; central air has no floor, backstop or proxy.'},whiteOpenings:[{id:'unfilled CAD central physical-object reservation',sourceXMM:[-55,55]}],landmarks:ENCLOSURE.cavity.paths.map(p=>({id:p.name,sourcePosition:p.points.at(-1).slice()})),collisionContract:'Conservative world AABBs per <=4mm visible rail segment and per finite side fitting; not exact mesh collision.',members:members.map(v=>({...v})),composition:artKit?'Measured CAD perimeter with functional finite side facilities; central physical-object space stays open.':'Measured rounded front edge and four curved CAD inner seams, with small outboard wall-mounted service cassettes. No invented centre corridor, central gate, backdrop or floor.'};
 }
 function setDisplayMode(value='transparent'){if(!['transparent','desktop'].includes(value))throw new RangeError('Unknown output mode '+value);mode=value;return {mode,configured};}
 function update(time,state={}){depthBays?.update?.(time,state);}
 function dispose(){if(disposed)return;disposed=true;artKit?.dispose();depthBays?.dispose?.();for(const g of geometries)g.dispose();for(const mat of ownedMaterials)mat.dispose();root.clear();collisionBoxes.length=0;}
 return {root,collisionBoxes,get activeCollisionBoxes(){return collisionBoxes;},addCADProp,configure,inspection,update,setDisplayMode,dispose};
}
