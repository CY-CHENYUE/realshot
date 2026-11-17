import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// R16 is a narrow virtual continuation behind the measured CAD opening. It
// uses source millimetres and remains separate from the physical enclosure
// shell. Wide side skins were removed: each side now reads as a supported
// near/mid/far rail that contracts toward the centre without filling the
// central object area.
export function createSideDepthBays({materials={}}={}){
 const root=new T.Group();root.name='Virtual / r16 converging side depth rails';
 const localSolids=[],geometries=new Set(),ownedMaterials=new Set(),batches=new Map(),assemblies=[],signals=[],sweepMarkers=[];
 let disposed=false,markerPhase=0,lastActiveTime=null;
 const material=(key,color,metalness,roughness)=>materials[key]??(()=>{const m=new T.MeshStandardMaterial({name:'SideDepth_'+key,color,metalness,roughness});ownedMaterials.add(m);return m;})();
 const m={shell:material('shell','#9da8a6',.1,.66),slate:material('slate','#62777d',.2,.62),alloy:material('alloy','#849194',.82,.45),graphite:material('graphite','#394c55',.25,.64),rubber:material('rubber','#182326',0,.87),deck:material('deck','#687872',.45,.74),caution:material('caution','#a69463',.06,.68)};
 const metricUV=g=>{const p=g.attributes.position,u=g.attributes.uv,n=g.attributes.normal;if(!u||!n)return;for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));if(ax>=ay&&ax>=az)u.setXY(i,p.getY(i)/1000,p.getZ(i)/1000);else if(ay>=az)u.setXY(i,p.getX(i)/1000,p.getZ(i)/1000);else u.setXY(i,p.getX(i)/1000,p.getY(i)/1000);}};
 function add(id,g,mat,{solid=true}={}){metricUV(g);g.computeBoundingBox();if(solid)localSolids.push({id,min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()});const key=mat.uuid;if(!batches.has(key))batches.set(key,{mat,parts:[]});const n=g.index?g.toNonIndexed():g;if(n!==g)g.dispose();batches.get(key).parts.push(n);}
 function addDirect(id,g,mat){metricUV(g);g.computeBoundingBox();geometries.add(g);const mesh=new T.Mesh(g,mat);mesh.name=id;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);return mesh;}
 function box(id,size,center,mat,bevel=0,options={}){const g=bevel?new RoundedBoxGeometry(...size,1,Math.min(bevel,...size.map(v=>v*.2))):new T.BoxGeometry(...size);g.translate(...center);add(id,g,mat,options);}
 function rod(id,a,b,r,mat,options={}){const s=new T.Vector3(...a),e=new T.Vector3(...b),d=e.clone().sub(s),g=new T.CylinderGeometry(r,r,d.length(),8);g.applyMatrix4(new T.Matrix4().compose(s.clone().add(e).multiplyScalar(.5),new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),d.normalize()),new T.Vector3(1,1,1)));if(options.direct){addDirect(id,g,mat);return;}add(id,g,mat,options);}
 // Magnitudes contract while x approaches the centre. The innermost rail is
 // still >=60mm, preserving a 5mm clear gap from central |X|<=55mm.
 const stations=[{y:45,x:78,half:17},{y:240,x:73,half:11},{y:440,x:68,half:6},{y:640,x:63,half:3}];
 const bottom=84,top=180,handrail=145;
 for(const side of[-1,1]){
  const label=side<0?'port':'starboard',innerAt=s=>side*(s.x-s.half),outerAt=s=>side*(s.x+s.half);
  for(let i=0;i<stations.length;i++){
   const s=stations[i],inner=innerAt(s),outer=outerAt(s),width=2*s.half;
   box(`${label} r16 station ${i} / lower edge`,[width,2.2,1.8],[side*s.x,s.y,bottom],m.deck,.25);
   box(`${label} r16 station ${i} / top edge`,[width,1.35,1.35],[side*s.x,s.y,top],m.alloy,.2);
   rod(`${label} r16 station ${i} / inner upright`,[inner,s.y,bottom],[inner,s.y,top],.62,m.alloy);
   rod(`${label} r16 station ${i} / outer upright`,[outer,s.y,bottom],[outer,s.y,top],.62,m.graphite);
   box(`${label} r16 station ${i} / outer foot`,[2.6,3.6,3.1],[outer,s.y,bottom-1.4],m.graphite,.25);
   const signalGeometry=new T.BoxGeometry(1.5,5.8,6.2);signalGeometry.translate(inner+side*1.15,s.y-.55,handrail);geometries.add(signalGeometry);
   const signalMaterial=new T.MeshStandardMaterial({name:`SideDepth_r16_signal_${label}_${i}`,color:'#e08a58',emissive:'#ffc58c',emissiveIntensity:.36,roughness:.42,metalness:.06});ownedMaterials.add(signalMaterial);
   const signal=new T.Mesh(signalGeometry,signalMaterial);signal.name=`${label} r16 station ${i} / sequential signal`;signal.castShadow=false;signal.receiveShadow=false;root.add(signal);signals.push({signal,material:signalMaterial,index:i});
  }
  // One moving marker per side travels on the inner handrail path. It is an
  // authored visual cue only: no collision proxy or solid is registered.
  const sweepGeometry=new T.BoxGeometry(2.4,6.4,6.2);geometries.add(sweepGeometry);
  const sweepMaterial=new T.MeshStandardMaterial({name:`SideDepth_r16_sweep_${label}`,color:'#e27d48',emissive:'#ff9e62',emissiveIntensity:.92,roughness:.38,metalness:.04});ownedMaterials.add(sweepMaterial);
  const sweep=new T.Mesh(sweepGeometry,sweepMaterial);sweep.name=`${label} r16 near-far sweep marker`;sweep.castShadow=false;sweep.receiveShadow=false;root.add(sweep);sweepMarkers.push({side,label,sweep,material:sweepMaterial});
  const far=stations.at(-1),farInner=innerAt(far),farOuter=outerAt(far);
  // Four small far-corner locator rods (two per side) provide a stable scale
  // reference without becoming a wall or entering the central object lane.
  for(const [corner,x] of[['inner',farInner],['outer',farOuter]]){
   rod(`${label} r16 far station / ${corner} locator rod`,[x,far.y-4.5,top-7],[x,far.y+4.5,top-7],.28,m.caution,{solid:false,direct:true});
  }
  for(const railKind of['inner','outer'])for(const z of[handrail,top-9])for(let i=0;i<stations.length-1;i++){
   const a=stations[i],b=stations[i+1],xa=railKind==='inner'?innerAt(a):outerAt(a),xb=railKind==='inner'?innerAt(b):outerAt(b);
   rod(`${label} r16 ${railKind} rail ${z}/${i}`,[xa,a.y,z],[xb,b.y,z],z===handrail?.72:.55,railKind==='inner'?m.alloy:m.graphite);
  }
  for(let i=0;i<stations.length-1;i++){
   const a=stations[i],b=stations[i+1];
   rod(`${label} r16 outer brace upper ${i}`,[outerAt(a),a.y,top-4],[outerAt(b),b.y,top-4],.48,m.slate);
   rod(`${label} r16 outer brace lower ${i}`,[outerAt(a),a.y,bottom+5],[outerAt(b),b.y,bottom+5],.48,m.graphite);
  }
  assemblies.push({id:`${label}-r16-depth-rail`,role:'Narrow converging side rail with handrails, edge runners, finite feet and pulse markers',sourceY:stations.map(s=>s.y),sourceX:stations.map(s=>side*s.x),halfWidths:stations.map(s=>s.half),innerBoundary:stations.map(s=>innerAt(s)),outerBoundary:stations.map(s=>outerAt(s)),heightMM:top-bottom});
 }
 for(const{mat,parts}of batches.values()){const g=mergeGeometries(parts,false);for(const p of parts)p.dispose();geometries.add(g);const mesh=new T.Mesh(g,mat);mesh.name=`Virtual r16 side rail assembly / ${mat.name}`;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);}
 root.updateMatrixWorld(true);
 function update(time,{wave=1,paused=false}={}){
  const now=Number.isFinite(time)?time:0;
  if(!paused){
   if(lastActiveTime===null||now<lastActiveTime){markerPhase=((now*.72)% (stations.length-1)+(stations.length-1))%(stations.length-1);}
   else markerPhase=(markerPhase+Math.min(.25,Math.max(0,now-lastActiveTime))*.72)%(stations.length-1);
   lastActiveTime=now;
  }
  const phase=((Number.isFinite(wave)?wave:1)*.8+now*.72)%stations.length;
  for(const item of signals){const d=Math.abs(item.index-phase),wrap=Math.min(d,stations.length-d),focus=Math.max(0,1-wrap/1.25);item.material.emissiveIntensity=paused?.07:.34+focus*1.45;item.signal.scale.y=paused?1:1+focus*.16;}
  const segment=Math.min(stations.length-2,Math.max(0,Math.floor(markerPhase))),t=markerPhase-segment,a=stations[segment],b=stations[segment+1];
  for(const item of sweepMarkers){const x=item.side*((a.x-a.half)*(1-t)+(b.x-b.half)*t)+item.side*1.15,y=a.y*(1-t)+b.y*t;item.sweep.position.set(x,y,handrail);item.sweep.material.emissiveIntensity=paused?.18:.72+.20*Math.sin(now*8);item.sweep.scale.y=paused?1:1.04;}
 }
 function inspection(){let meshes=0,triangles=0;root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});return {id:'virtual-side-depth-bays-r16',sourceUnits:'millimetres',virtual:true,physicalCAD:false,meshes,triangles,finiteProxyCount:localSolids.length,stations:stations.map(s=>({...s})),assemblies:structuredClone(assemblies),dynamic:{type:'visible near-to-far side-rail pulse plus moving sweep marker',stationCount:stations.length,visualOnly:true,centralOpeningUnaffected:true,markerCount:sweepMarkers.length,markerPath:'inner handrail interpolation between near/mid/far stations',markerWidthMM:2.4,pausedFreezesMarker:true,farLocatorRods:4,farLocatorStationIndex:stations.length-1,farLocatorCollision:false},centralOpening:{x:[-55,55],z:[82,182],open:true,noRearPanel:true,noFloor:true},clearance:{minimumInnerAbsX:Math.min(...stations.map(s=>s.x-s.half)),centralHalfWidth:55,margin:Math.min(...stations.map(s=>s.x-s.half))-55},composition:'Two narrow side rail systems contract toward the far centre: lower edge, top edge, inner/outer handrails, finite feet, braces, brighter sequential markers, one near-to-far sweep marker per side and four far corner locator rods. The central physical-object lane remains open.',source:'Original local Three.js geometry; no cloud generation, no commercial-game asset.'};}
 function dispose(){if(disposed)return;disposed=true;for(const g of geometries)g.dispose();for(const mat of ownedMaterials)mat.dispose();root.clear();localSolids.length=0;batches.clear();signals.length=0;}
 return {root,localSolids,inspection,update,dispose};
}
