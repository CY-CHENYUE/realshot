import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {EnclosureSpace} from './enclosure-space.mjs';

// R17 is a visual-only side layer. Source coordinates remain in the measured
// CAD millimetre frame; the parent applies the same EnclosureSpace root matrix
// as the fixed front opening. No centre backstop, floor, recognition or
// collision proxy is created here.
const FRONT_Y=-112,FAR_Y=610,LOOP=FAR_Y-FRONT_Y,SPEED=24,SECTOR_PERIOD=9,TRANSITION=1.35;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=t=>t*t*(3-2*t);
function ownMaterial(materials,key,color,metalness,roughness){
 const base=materials?.[key];
 if(base?.clone){const m=base.clone();m.color?.set(color);if(metalness!==undefined)m.metalness=metalness;if(roughness!==undefined)m.roughness=roughness;return m;}
 return new T.MeshStandardMaterial({name:`SideDepth_r17_${key}`,color,metalness,roughness});
}
function rounded(size,r=.08){return new RoundedBoxGeometry(...size,2,Math.min(r,Math.min(...size)*.2));}
function box(parent,geometry,material,position=[0,0,0],rotation=[0,0,0],owned=[]){
 const o=new T.Mesh(geometry,material);o.position.set(...position);o.rotation.set(...rotation);o.castShadow=true;o.receiveShadow=true;parent.add(o);if(!owned.includes(material))owned.push(material);return o;
}
function rod(parent,a,b,r,material,owned=[]){
 const s=new T.Vector3(...a),e=new T.Vector3(...b),d=e.clone().sub(s),g=new T.CylinderGeometry(r,r,d.length(),8);
 g.applyMatrix4(new T.Matrix4().compose(s.clone().add(e).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()),new T.Vector3(1,1,1)));
 return box(parent,g,material,[0,0,0],[0,0,0],owned);
}
export function createSideDepthBaysR17({materials={},camera=null,depth=10}={}){
 const root=new T.Group();root.name='Virtual / r17 moving side depth sectors';
 const localSolids=[],owned=[],sectors=[],geometries=[];let disposed=false,space=null,lastTime=null;
 const m={shell:ownMaterial(materials,'shell','#8e9b9b',.14,.65),slate:ownMaterial(materials,'slate','#536d73',.28,.56),alloy:ownMaterial(materials,'alloy','#a6b2b0',.68,.43),graphite:ownMaterial(materials,'graphite','#2f454e',.27,.62),teal:ownMaterial(materials,'teal','#6bbfae',.12,.38),orange:ownMaterial(materials,'caution','#d99055',.12,.42)};
 Object.values(m).forEach(v=>{if(!owned.includes(v))owned.push(v);});
 const variants=['service','antenna','window'];const positions=[105,335,565];
 function createVariant(parent,kind){
  const group=new T.Group();group.name=`r17 ${kind} facility`;parent.add(group);const vm=[];
  // Materials are per variant because opacity is crossfaded independently;
  // sharing the base material would make every sector fade at once.
  const clone=base=>{const q=base.clone();owned.push(q);vm.push(q);return q;};
  const v={shell:clone(m.shell),slate:clone(m.slate),alloy:clone(m.alloy),graphite:clone(m.graphite),teal:clone(m.teal),orange:clone(m.orange)};
  box(group,rounded([18,7,30],.7),v.shell,[0,0,0],[0,0,0],vm);
  if(kind==='service'){
   box(group,rounded([12,2.5,8],.35),v.graphite,[0,-4.4,6],[0,0,0],vm);
   for(let i=-1;i<=1;i++)box(group,rounded([2.2,1.2,19],.24),v.teal,[i*3.4,-4.1,-4],[0,0,0],vm);
   box(group,rounded([7,1.8,2.5],.3),v.orange,[0,-4.9,-10],[0,0,0],vm);
  }else if(kind==='antenna'){
   box(group,rounded([10,4,7],.35),v.graphite,[0,-1,10],[0,0,0],vm);
   rod(group,[0,0,13],[0,0,37],.85,v.alloy,vm);rod(group,[-8,0,25],[8,0,25],.52,v.alloy,vm);
   const lamp=box(group,new T.SphereGeometry(2.2,12,8),v.orange,[0,-4,37],[0,0,0],vm);lamp.castShadow=false;
  }else{
   box(group,rounded([13,3,24],.45),v.graphite,[0,-2,0],[0,0,0],vm);box(group,rounded([9,1.2,16],.3),v.teal,[0,-3.8,0],[0,0,0],vm);
   for(let i=-1;i<=1;i++)rod(group,[i*3,-4.5,-7],[i*3,-4.5,7],.28,v.alloy,vm);
   box(group,rounded([5,1,3],.25),v.orange,[0,-4.5,12],[0,0,0],vm);
  }
  geometries.push(...group.children.filter(o=>o.geometry).map(o=>o.geometry));return group;
 }
 function createSector(side,index){
  const sectorRoot=new T.Group();sectorRoot.name=`r17 ${side<0?'port':'starboard'} sector ${index}`;root.add(sectorRoot);
  const variantGroups=variants.map(v=>createVariant(sectorRoot,v));
  box(sectorRoot,rounded([14,7,3.4],.5),m.graphite,[0,0,-17]);rod(sectorRoot,[-6,0,-17],[6,0,-17],.48,m.alloy);
  // A compact corner frame keeps each moving module visually attached to the
  // side bay while the central object lane remains completely open.
  rod(sectorRoot,[-7,0,-17],[-7,0,17],.42,m.graphite);
  rod(sectorRoot,[-7,0,17],[7,0,17],.42,m.alloy);
  rod(sectorRoot,[7,0,17],[7,0,-17],.42,m.graphite);
  rod(sectorRoot,[7,0,-17],[-7,0,-17],.42,m.alloy);
  const markerMat=new T.MeshBasicMaterial({color:'#f0b06f',transparent:true,opacity:.9,depthWrite:false});owned.push(markerMat);
  const marker=box(sectorRoot,new T.BoxGeometry(2.5,2.5,2.5),markerMat,[0,-4,18]);marker.castShadow=false;marker.receiveShadow=false;
  const sector={side,index,root:sectorRoot,variantGroups,marker,sourceY:positions[index],y:positions[index],travelDistance:0,variant:index%3,transition:{from:index%3,to:index%3,progress:1}};sectorRoot.scale.setScalar(.78);sectors.push(sector);return sector;
 }
 for(const side of[-1,1])for(let i=0;i<3;i++)createSector(side,i);
 if(camera)configure(camera,depth);
 function configure(cameraValue,depthValue=10){if(cameraValue){space=new EnclosureSpace(cameraValue,depthValue);depth=depthValue;}}
 function sourcePoint(s){return [s.side*84,s.y,128];}
 function projected(s){if(!space)return null;const p=space.world(sourcePoint(s)),h=Math.tan(T.MathUtils.degToRad(space.camera.fov/2)),z=Math.max(.001,-p.z);return {x:.5+p.x/(2*z*h*space.camera.aspect),y:.5-p.y/(2*z)};}
 function update(time,state={}){
  const now=Number.isFinite(time)?time:0;if(lastTime!==null&&now<lastTime){lastTime=now;for(const s of sectors)s.travelDistance=0;}
  const dt=lastTime===null?0:Math.min(.2,Math.max(0,now-lastTime));const paused=Boolean(state.paused);if(!paused){for(const s of sectors)s.travelDistance+=dt*SPEED;lastTime=now;}
  const wave=Number.isFinite(state.wave)?state.wave:1;
  for(const s of sectors){
   const y=FRONT_Y+((s.sourceY+LOOP-(s.travelDistance%LOOP)-FRONT_Y)%LOOP);s.y=y;s.root.position.set(s.side*84,y,128);
   const cycle=Math.floor(now/SECTOR_PERIOD)+(s.index+(s.side<0?1:0)),to=((cycle%3)+3)%3,from=(to+2)%3,progress=clamp((now%SECTOR_PERIOD)/TRANSITION);s.variant=to;s.transition={from,to,progress};
   for(let i=0;i<s.variantGroups.length;i++){const g=s.variantGroups[i],alpha=i===from?1-smooth(progress):i===to?smooth(progress):0;g.visible=alpha>0.001;g.userData.r17Opacity=alpha;g.traverse(o=>{if(o.isMesh){const list=Array.isArray(o.material)?o.material:[o.material];for(const mat of list){mat.transparent=true;mat.opacity=alpha;mat.depthWrite=alpha>.85;}}});}
   s.marker.material.opacity=paused?.25:.44+.35*Math.sin(now*5+s.index+wave*.17);s.marker.scale.setScalar(paused?1:1+.06*Math.sin(now*4+s.index));
  }
 }
 function inspection(){let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return {id:'virtual-side-depth-bays-r17',sourceUnits:'millimetres',virtual:true,physicalCAD:false,meshes,triangles,finiteProxyCount:localSolids.length,localSolids,travelDistance:sectors.reduce((m,s)=>Math.max(m,s.travelDistance),0),sector:sectors.map(s=>({side:s.side,index:s.index,sourceY:s.sourceY,y:s.y,projected:projected(s)})),transition:sectors.map(s=>({...s.transition,side:s.side,index:s.index})),dynamic:{type:'moving side sectors along source Y, recirculated outside front opening',travelSpeedMMPerSecond:SPEED,frontY:FRONT_Y,farY:FAR_Y,loopMM:LOOP,sectorPeriodSeconds:SECTOR_PERIOD,transitionSeconds:TRANSITION,centralOpeningUnaffected:true,visualOnly:true,noCentralBackWall:true,noFloor:true,noRecognition:true,noCollision:true},centralOpening:{x:[-55,55],z:[82,182],open:true},composition:'Three side sectors per side move from far to near in the measured CAD frame. A sector leaves the front boundary before recycling to the far edge; facility variants crossfade over 1.35s every 9s.',source:'Original local Three.js geometry; no cloud generation or commercial-game asset.'};}
 function dispose(){if(disposed)return;disposed=true;const all=new Set(geometries);root.traverse(o=>{if(o.geometry)all.add(o.geometry);});for(const g of all)g.dispose();for(const mat of owned)mat.dispose();root.clear();localSolids.length=0;sectors.length=0;}
 return {root,localSolids,configure,inspection,update,dispose};
}
