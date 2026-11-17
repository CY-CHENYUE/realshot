import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createOrbitalScene} from './defense-orbital-scene.mjs';
import {createOrbitalMaterials} from './orbital-materials.mjs';
import {createHangarScene} from './defense-hangar-scene.mjs';
import {createHangarMaterials} from './hangar-materials.mjs';
import {createIndustrialScene} from './defense-industrial-scene.mjs';
import {createIndustrialMaterials} from './industrial-materials.mjs';
import {prepareEnemyDamageParts} from './enemy-damage-parts.mjs';
import {createEnemyDamageSystem,cloneDamageMaterial} from './enemy-damage.mjs';
import {applyCombatAppearance,combatCue,createAcquisitionGeometry} from './combat-appearance.mjs';
import {createDepthExtension} from './defense-depth-extension.mjs';
import {createOpenDepthScene} from './defense-open-depth-scene.mjs';
import {createEnclosureDefenseScene} from './defense-enclosure-scene.mjs';
import {createEnclosureArt} from './defense-enclosure-art.mjs';
import {createEnclosureArtMaterials} from './enclosure-art-materials.mjs';
import {createSideDepthBays} from './defense-side-depth-bays.mjs';
import {createSideDepthBaysR17} from './defense-side-depth-bays-r17.mjs';
import {createSnowWorldR19} from './snow-world-r19.mjs';
import {createRescueBeacon} from './snow-flora-r19.mjs';

// A new art scene and new original models. Only the deterministic gameplay
// interface is retained. No previous station/hunter/core visuals are imported.
const TAU=Math.PI*2,clamp=T.MathUtils.clamp;
export function createDefenseWorldV3({environment='hangar',combatReadability=true,depthRange=true,enclosureOutput=false,enclosureArt=true,depthCues=true,depthMotion=true,snowScene=false,snowFrame='cad',snowFree=false,snowTerrain=null}={}){
 const industrial=environment==='industrial',root=new T.Group();root.name=snowScene?'SNOW / rescue beacon transit':industrial?'07 / industrial power defense':'ORBITAL / phase relay defense';
 const readable=industrial&&combatReadability;
 const surfacePack=(snowScene?(enclosureOutput&&enclosureArt?createEnclosureArtMaterials:createIndustrialMaterials):industrial?(enclosureOutput&&enclosureArt?createEnclosureArtMaterials:createIndustrialMaterials):environment==='hangar'?createHangarMaterials:createOrbitalMaterials)({combatReadability:readable});
 const artKit=industrial&&!snowScene&&enclosureOutput&&enclosureArt?createEnclosureArt({materials:surfacePack.materials,depthCues}):null;
 const depthBays=snowScene?null:industrial&&enclosureOutput&&enclosureArt&&depthCues?(depthMotion?createSideDepthBaysR17:createSideDepthBays)({materials:surfacePack.materials}):null;
 // R19: the ordinary window and the box surfaces share one procedural alpine
 // world. Box surfaces keep the CAD aperture loop and seams as the four-edge frame.
 let station=snowScene?createSnowWorldR19({free:snowFree,terrainShape:snowTerrain?.shape??null,terrainRock:snowTerrain?.rock??null,keepOut:snowTerrain?.keepOut??null,enclosure:enclosureOutput,frame:enclosureOutput&&snowFrame!=='none'?createEnclosureDefenseScene({materials:surfacePack.materials,artKit:null,depthBays:null,includeServiceCassettes:false}):null}):industrial?(enclosureOutput?createEnclosureDefenseScene:depthRange?createOpenDepthScene:createIndustrialScene):environment==='hangar'?createHangarScene:createOrbitalScene;
 if(typeof station==='function')station=station({materials:surfacePack.materials,artKit,depthBays});root.add(station.root);
 const depthStage=industrial&&depthRange&&!enclosureOutput?createDepthExtension({width:12,height:4.4}):null;if(depthStage)root.add(depthStage.root);
 const propLayer=new T.Group();propLayer.name='CC0 maintenance equipment';root.add(propLayer);const propModels=[];
 const coreAnchor=new T.Group();coreAnchor.name=snowScene?'rescue beacon pod / procedural r19':industrial?'power cassette / original new asset':'phase beacon / original new asset';coreAnchor.position.y=1;coreAnchor.visible=!enclosureOutput;root.add(coreAnchor);
 const enemyLayer=new T.Group();enemyLayer.name='interceptor squadron / original new asset';root.add(enemyLayer);
 const actors=new Map(),damageSystem=createEnemyDamageSystem({root}),impactCache=new Map();
 const surfaceImpact={requests:0,resolved:0,fallbacks:0,cached:0,last:null};let damageTemplateAudit=null;
 let mode='transparent',lastTime=0,lastHP=100,hitAt=-99,latestEnemies=[],enemyTemplate=null,programAnchor=null,coreModel=null,beacon=null,assetsReady=false,disposed=false;
 const provenance={architecture:snowScene?(enclosureOutput?'R19 procedural alpine transit (streamed heightfield valley, spruce, granite, seracs, layered snowfall) behind the CAD aperture frame; central physical-object reservation lifted to white':'R19 procedural alpine transit shared with the box surfaces; hovering procedural rescue beacon'):industrial?(enclosureOutput?(enclosureArt?'CAD-matched continuous side service facilities, sloping overhead service panels and a finite supported miniature CC0 prop; central physical-object opening':'CAD-matched thin enclosure-side guides; fixed design eye and central physical-prop opening'):depthRange?'Open maintenance tracks and a wide finite depth range':'Original asymmetric industrial power-service bay'):environment==='hangar'?'New original continuous industrial maintenance hangar; no orbital layout or old station geometry':'New original orbital environment; no old station geometry or layout',models:[],textures:[],assetsReady:false,cloudTasks:0};
 const chargeGeometry=new T.SphereGeometry(.035,12,8),beamGeometry=new T.CylinderGeometry(.009,.009,1,6);
 const entryGeometry=createAcquisitionGeometry();
 const shieldMaterial=new T.MeshBasicMaterial({color:'#83c7c2',transparent:true,opacity:0,depthWrite:false,side:T.FrontSide});
 const shield=new T.Mesh(new T.SphereGeometry(.77,32,20),shieldMaterial);shield.position.y=1;shield.visible=false;root.add(shield);
 function makeActor(e){
  const group=new T.Group(),hull=new T.Group();group.name=`interceptor / ${e.id}`;group.add(hull);enemyLayer.add(group);const ownedMaterials=[],rotors=[];
  const model=enemyTemplate?enemyTemplate.clone(true):new T.Group();
  model.traverse(o=>{if(/^Rotor_(Left|Right)$/.test(o.name))rotors.push(o);if(!o.isMesh)return;o.material=Array.isArray(o.material)?o.material.map(cloneDamageMaterial):cloneDamageMaterial(o.material);o.castShadow=true;o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){ownedMaterials.push(m);m.userData.baseEmissive=m.emissive?.clone();m.userData.baseIntensity=m.emissiveIntensity??1;}});hull.add(model);
  const chargeMat=new T.MeshBasicMaterial({color:'#edbb68',transparent:true,opacity:0,depthWrite:false}),charge=new T.Mesh(chargeGeometry,chargeMat);charge.position.set(0,0,.51);charge.visible=false;hull.add(charge);
  const entryMat=new T.MeshBasicMaterial({color:'#c9502d',transparent:true,opacity:0,depthWrite:false,toneMapped:false}),entry=new T.Mesh(entryGeometry,entryMat);entry.name='world-space target acquisition / temporary';entry.visible=false;group.add(entry);
  const beamMat=new T.MeshBasicMaterial({color:'#d69b4c',transparent:true,opacity:0,depthWrite:false}),beam=new T.Mesh(beamGeometry,beamMat);beam.visible=false;root.add(beam);
  const a={id:e.id,data:e,group,hull,model,rotors,ownedMaterials,charge,chargeMat,entry,entryMat,beam,beamMat,deadAt:null,hitAt:-99,heading:Math.atan2(-e.x,-e.z)};a.damage=damageSystem.register(a);actors.set(e.id,a);return a;
 }
 function removeActor(a){damageSystem.unregister(a.id);enemyLayer.remove(a.group);root.remove(a.beam);for(const m of a.ownedMaterials)m.dispose();a.chargeMat.dispose();a.entryMat.dispose();a.beamMat.dispose();actors.delete(a.id);}
 // Program anchor: hidden copies of the enemy model in both states an actor passes through (opaque, and the transparent
 // death fade). three keeps a shader program only while some live material uses it, and every actor owns cloned
 // materials that removeActor/reset dispose, so without an owner that outlives the actors the warmed programs were
 // thrown away and the next drone, and every first death fade, compiled them again mid-fight. compile() walks hidden
 // objects, so one warm-up compile covers these; built with exactly makeActor's recipe so the program keys match.
 function buildProgramAnchor(){
  disposeProgramAnchor();if(!enemyTemplate)return;
  programAnchor=new T.Group();programAnchor.name='enemy program anchor / hidden, never drawn';programAnchor.visible=false;
  for(const fade of [false,true]){const copy=enemyTemplate.clone(true);copy.traverse(o=>{if(!o.isMesh)return;o.material=Array.isArray(o.material)?o.material.map(cloneDamageMaterial):cloneDamageMaterial(o.material);o.castShadow=true;o.receiveShadow=true;if(fade)for(const m of Array.isArray(o.material)?o.material:[o.material]){m.transparent=true;m.depthWrite=false;}});programAnchor.add(copy);}
  root.add(programAnchor);
 }
 // One real draw of the anchor (both copies side by side at a world point), then hidden again. compile() builds programs
 // but never draws them; the GPU still builds a pipeline per program+blend state on first draw (the fade copy is the
 // blended one) and the shadow pass needs its own depth variants, so the loader draws one hidden frame with this shown.
 function warmDraw(position){if(!programAnchor)return;if(!position){programAnchor.visible=false;return;}
  const p=root.worldToLocal(new T.Vector3(...position));programAnchor.position.copy(p);programAnchor.children.forEach((c,i)=>{c.position.set(i?.9:-.9,0,0);});programAnchor.visible=true;programAnchor.updateMatrixWorld(true);}
 function disposeProgramAnchor(){if(!programAnchor)return;root.remove(programAnchor);programAnchor.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});programAnchor=null;}
 function syncEnemies(enemies=[]){latestEnemies=enemies;const seen=new Set();for(const e of enemies){seen.add(e.id);const a=actors.get(e.id)||makeActor(e);a.data=e;}for(const [id,a]of actors)if(!seen.has(id)&&a.deadAt===null){a.deadAt=lastTime;damageSystem.queue(id,{type:'kill',time:lastTime,hp:0,maxHP:a.data.maxHP??2,position:a.group.position.toArray(),direction:[0,0,-1]});}}
 function resolveImpact(event){
  if(snowScene&&['ground','scenery'].includes(event.type)&&Array.isArray(event.position)&&station.resolveSurface){
   const r=station.resolveSurface(event);surfaceImpact.requests++;if(r.resolved)surfaceImpact.resolved++;else surfaceImpact.fallbacks++;
   return {...event,simulationPosition:event.position.slice(),position:r.position.slice(),normal:r.normal.slice(),direction:r.direction.slice(),surfaceKind:r.kind,surfaceImpact:{resolved:r.resolved,objectName:r.kind,distance:null,reason:r.resolved?null:'terrain march missed'}};
  }
  if(!['hit','kill'].includes(event.type)||!Array.isArray(event.position))return {...event};
  const simulationPosition=event.position.slice(),stamp=Number.isFinite(event.time)?event.time:lastTime,key=`${event.enemyId}/${event.projectileId??'contact'}/${stamp.toFixed(6)}/${simulationPosition.join(',')}`;
  surfaceImpact.requests++;let result=impactCache.get(key);
  if(result)surfaceImpact.cached++;
  else{
   const a=actors.get(event.enemyId),direction=Array.isArray(event.direction)?new T.Vector3(...event.direction):new T.Vector3(a?.data.x??0,a?.data.y??1.05,a?.data.z??0).sub(new T.Vector3(...simulationPosition));if(direction.lengthSq()<1e-8)direction.set(0,0,-1);direction.normalize();
   const origin=new T.Vector3(...simulationPosition).addScaledVector(direction,-.15),ray=new T.Raycaster(origin,direction,.00001,1.2),meshes=[];
   if(a){a.model.updateWorldMatrix(true,true);a.model.traverse(o=>{if(!o.isMesh)return;for(let p=o;p;p=p.parent)if(!p.visible)return;const materials=Array.isArray(o.material)?o.material:[o.material];if(materials.every(m=>!m.visible||m.opacity<=.025))return;meshes.push(o);});}
   const hit=ray.intersectObjects(meshes,false)[0];
   if(hit){const normal=hit.face.normal.clone().applyNormalMatrix(new T.Matrix3().getNormalMatrix(hit.object.matrixWorld));result={position:hit.point.toArray(),normal:normal.toArray(),surfaceImpact:{resolved:true,objectName:hit.object.name,distance:hit.distance,reason:null}};surfaceImpact.resolved++;}
   else {result={position:simulationPosition.slice(),normal:event.normal?.slice()??direction.clone().negate().toArray(),surfaceImpact:{resolved:false,objectName:null,distance:null,reason:a?'ray missed visible mesh':'rendered actor unavailable'}};surfaceImpact.fallbacks++;}
   result.direction=direction.toArray();impactCache.set(key,result);if(impactCache.size>64)impactCache.delete(impactCache.keys().next().value);
  }
  surfaceImpact.last={enemyId:event.enemyId,time:stamp,simulationPosition:simulationPosition.slice(),position:result.position.slice(),...result.surfaceImpact};
  return {...event,simulationPosition,position:result.position.slice(),normal:result.normal.slice(),direction:result.direction.slice(),surfaceImpact:{...result.surfaceImpact}};
 }
 function pulse(e){
  if(snowScene&&['ground','scenery'].includes(e.type))station.impact?.(e);
  const a=actors.get(e.enemyId);if(e.type==='hit'&&a){a.hitAt=e.time??lastTime;damageSystem.queue(a.id,e);}
  if(e.type==='protectorHit')hitAt=e.time??lastTime;
  if(e.type==='kill'&&a){a.deadAt=e.time??lastTime;damageSystem.queue(a.id,{...e,hp:0,maxHP:e.maxHP??a.data.maxHP??2});}
 }
 function reset(){if(snowScene)station.reset?.();for(const a of [...actors.values()])removeActor(a);damageSystem.reset();impactCache.clear();for(const key of ['requests','resolved','fallbacks','cached'])surfaceImpact[key]=0;surfaceImpact.last=null;latestEnemies=[];lastTime=0;lastHP=100;hitAt=-99;shield.visible=false;coreAnchor.position.y=1;}
 function update(time,game={}){
  if(disposed)return;if(time<lastTime-1e-4){const keep=game.enemies||latestEnemies;reset();syncEnemies(keep);}
  const dt=clamp(time-lastTime,0,.1);lastTime=time;if(game.enemies)syncEnemies(game.enemies);station.update?.(time,{wave:game.wave??1,paused:false});
  const hp=game.protectedHP??100;if(hp<lastHP&&time-hitAt>.05)hitAt=time;lastHP=hp;const age=time-hitAt,hit=clamp(1-age/.45,0,1);
  coreAnchor.position.y=1+Math.sin(time*.8)*(snowScene?.022:industrial?.006:.018);beacon?.update(time);coreAnchor.rotation.set(0,Math.sin(time*.18)*(industrial?.018:.12),hit*Math.sin(age*35)*.012);
  shield.position.y=coreAnchor.position.y;shield.visible=!enclosureOutput&&age>=0&&age<.45;shieldMaterial.opacity=hit*.1;shield.scale.setScalar(1+clamp(age,0,.45)*.12);
  for(const a of [...actors.values()]){
   const e=a.data,spawn=clamp((time-(e.spawnedAt??-2))/.6,0,1),cue=combatCue(time,e.spawnedAt??-2,e.attackProgress,a.deadAt!==null),size=readable?cue.scale:Math.min(1,.15+spawn*1.5);
   // r23 free level: e.face=[x,z] keeps a drone's nose on the player while it strafes
   let dx=-e.x,dz=-e.z;if(e.face){dx=e.face[0]-e.x;dz=e.face[1]-e.z;}else if(e.state==='moving'&&e.previous){const mx=e.x-e.previous[0],mz=e.z-e.previous[2];if(Math.hypot(mx,mz)>1e-6){dx=mx;dz=mz;}}
   // A stopped, stunned body keeps its approach heading. A hit is handled by
   // the recoil spring; it must not trigger a 140-degree turn toward the core.
   const desired=readable&&e.state==='stunned'&&!e.face?a.heading:Math.atan2(dx,dz),delta=T.MathUtils.euclideanModulo(desired-a.heading+Math.PI,TAU)-Math.PI;if(a.deadAt===null)a.heading+=delta*(1-Math.exp(-dt*8));
   const charge=clamp(e.attackProgress||0,0,1),hurt=clamp(1-(time-Math.max(a.hitAt,e.hitAt??-99))/.2,0,1);
   a.group.position.set(e.x,e.y??1.05,e.z);a.group.rotation.y=a.heading;a.group.scale.setScalar(size*(e.scale??1));
   a.entry.visible=readable&&(cue.entry||cue.attack);a.entry.rotation.y=-a.heading;a.entryMat.color.set(cue.entry?'#c9502d':'#b73c24');a.entryMat.opacity=cue.entry?cue.entryOpacity:(.65+.10*Math.sin(time*18))*(.6+.4*cue.attackIntensity);a.entry.scale.setScalar(cue.entry?cue.entryRadius:1.04-cue.attackIntensity*.03);
   a.hull.position.set(0,Math.sin(time*4+e.id*1.3)*.012,-charge*.025);
   a.hull.rotation.set(Math.sin(time*3.2+e.id)*.012+charge*.06,0,clamp(-delta*.15,-.12,.12)+Math.sin(time*2.3+e.id)*.018);
   const damage=damageSystem.updateActor(a.damage,time,dt);if(damage.remove){removeActor(a);continue;}
   a.charge.visible=a.deadAt===null&&(readable?cue.attack:charge>.15||e.state==='attacking');a.chargeMat.opacity=clamp(charge*(readable?.88:.6),0,readable?.88:.6)*damage.flicker;a.charge.scale.setScalar((readable?1.2:.7)+charge*.9);
   for(const m of a.ownedMaterials)if(m.emissive&&m.userData.baseEmissive){const emitting=m.userData.baseEmissive.r+m.userData.baseEmissive.g+m.userData.baseEmissive.b>.005;m.emissive.copy(m.userData.baseEmissive);if(emitting)m.emissive.lerp(new T.Color('#e9a15c'),hurt*.12);m.emissiveIntensity=(m.userData.baseIntensity+(emitting?hurt*.08:0))*damage.flicker;}
   const beamAge=time-(e.lastAttackAt??-99);a.beam.visible=e.beam!==false&&beamAge>=0&&beamAge<.14&&a.deadAt===null;
   if(a.beam.visible){a.group.updateMatrixWorld(true);const start=a.charge.getWorldPosition(new T.Vector3()),end=new T.Vector3(0,1,0),v=end.clone().sub(start);a.beam.position.copy(start).add(end).multiplyScalar(.5);a.beam.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.clone().normalize());a.beam.scale.set(1,v.length(),1);a.beamMat.opacity=(1-beamAge/.14)*.75;}
  }
  damageSystem.updateDebris(time);
 }
 async function loadModel(url,{height,extent,centerY=0,role}={}){
  const gltf=await new GLTFLoader().loadAsync(url),model=gltf.scene,normalPreparation={rebuilt:[],preservedOptical:[]};model.updateMatrixWorld(true);let bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());model.scale.setScalar(extent?extent/Math.max(...size.toArray()):height/size.y);model.updateMatrixWorld(true);bounds=new T.Box3().setFromObject(model);const center=bounds.getCenter(new T.Vector3());model.position.sub(center);model.position.y+=centerY;const visualMats=new Set();model.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;const materials=Array.isArray(o.material)?o.material:[o.material];
   if(industrial){
    if(materials.some(m=>m.name==='Industrial_DeepOpticalCoating'))normalPreparation.preservedOptical.push(o.name);
    else{
     // Exported custom normals pointed away from the actual large panel
     // faces (up to 165 degrees). Rebuild shading from the same triangles;
     // positions, UVs, indices, armour objects and optical normals stay intact.
     o.geometry.computeVertexNormals();o.geometry.deleteAttribute('tangent');normalPreparation.rebuilt.push(o.name);
    }
   }
   for(const m of materials){visualMats.add(m);if(m.map)m.map.anisotropy=4;if(m.normalMap)m.normalMap.anisotropy=4;}});
  // Actual model surfaces carry the silhouette contrast; the white opening
  // receives no outlines, grey tint or screen-space drop shadow.
  for(const m of visualMats){
   if(m.name==='Orbital_CoolCeramic'){m.color.set('#587e89');m.roughness=.46;}
   if(m.name==='Orbital_Ceramic'){m.color.set('#c8d6d6');m.roughness=.48;}
   if(m.name==='Orbital_Plasma')m.emissiveIntensity*=.5;
   if(m.name==='Orbital_Ceramic'||m.name==='Orbital_CoolCeramic'){
    m.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vHullN;').replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nvHullN=normalize(normalMatrix*objectNormal);');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vHullN;').replace('#include <color_fragment>',`#include <color_fragment>
      float hullFacing=clamp(dot(normalize(vViewPosition),normalize(vHullN)),0.,1.);
      float hullEdge=1.-smoothstep(.12,.68,hullFacing);
      diffuseColor.rgb*=1.-hullEdge*.26;`);};m.customProgramCacheKey=()=> 'hangar-ceramic-surface-v1';m.needsUpdate=true;
   }
  }const appearance=readable?applyCombatAppearance(model,role):null;model.updateMatrixWorld(true);return {model,bounds:new T.Box3().setFromObject(model),normalPreparation,appearance};
 }
 async function prepareAssets({enemyUrl='/assets/orbital/interceptor.glb',coreUrl='/assets/orbital/phase-core.glb'}={}){
  const [enemy,core]=await Promise.all([loadModel(enemyUrl,{extent:industrial?1.25:1.02,role:'enemy'}),snowScene?null:loadModel(coreUrl,{height:industrial?1.35:1.4,role:'protector'}),surfacePack.prepare?.()]);for(const a of [...actors.values()])removeActor(a);
  enemyTemplate=enemy.model;damageTemplateAudit=prepareEnemyDamageParts(enemyTemplate);buildProgramAnchor();
  if(snowScene){beacon=createRescueBeacon();coreModel=beacon.group;}else coreModel=core.model;
  coreAnchor.add(coreModel);assetsReady=true;provenance.assetsReady=true;coreModel.updateMatrixWorld(true);const coreBounds=new T.Box3().setFromObject(coreModel);
  provenance.models=[{role:'interceptor',source:'project model (industrial r10)',url:enemyUrl,bounds:enemy.bounds.min.toArray().concat(enemy.bounds.max.toArray()),normalPreparation:enemy.normalPreparation},snowScene?{role:'rescue beacon pod',source:'Procedural Three.js geometry built at runtime (r19); no imported model',url:null,bounds:coreBounds.min.toArray().concat(coreBounds.max.toArray())}:{role:industrial?'power cassette':'phase beacon',source:'project model (industrial r10)',url:coreUrl,bounds:core.bounds.min.toArray().concat(core.bounds.max.toArray()),normalPreparation:core.normalPreparation}];
  if(environment==='hangar'||industrial){
   const placements=station.inspection().propsPlacement||[];
   await Promise.all(placements.map(async p=>{
    const id=p.role==='electrical cabinet'?'utility_box_02':p.role==='metal toolbox'?'metal_toolbox':'portable_generator',url='/assets/hangar/'+id+'.glb',gltf=await new GLTFLoader().loadAsync(url),model=gltf.scene;
    model.name='service prop / '+p.id;model.position.fromArray(p.position);model.rotation.fromArray(p.rotation||[0,0,0]);model.rotation.y+=Math.PI;model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.map)m.map.anisotropy=8;}});propLayer.add(model);model.updateMatrixWorld(true);
    const bounds=new T.Box3().setFromObject(model);station.collisionBoxes.push({id:model.name,name:model.name,objectName:model.name,min:bounds.min.toArray(),max:bounds.max.toArray()});propModels.push(model);provenance.models.push({role:p.role,source:'Poly Haven CC0; original photographic PBR, true dimensions retained',url,bounds:bounds.min.toArray().concat(bounds.max.toArray())});
   }));
  }
  if(enclosureOutput&&artKit){
   for(const p of artKit.inspection().cadPropPlacements){
    const gltf=await new GLTFLoader().loadAsync(p.url),model=new T.Group();model.name='CAD prop / '+p.id;model.add(gltf.scene);gltf.scene.rotation.x=Math.PI/2;
    model.rotation.fromArray(p.rotationCAD??[0,0,0]);model.updateMatrixWorld(true);
    let bounds=new T.Box3().setFromObject(model),size=bounds.getSize(new T.Vector3());
    const limit=p.maximumSizeMM,scale=Math.min(p.heightMM/size.z,...size.toArray().map((v,i)=>limit[i]/v));model.scale.setScalar(scale);model.updateMatrixWorld(true);
    bounds=new T.Box3().setFromObject(model);const center=bounds.getCenter(new T.Vector3());model.position.set(p.centerCAD[0]-center.x,p.centerCAD[1]-center.y,p.supportTopCAD-bounds.min.z);model.updateMatrixWorld(true);bounds=new T.Box3().setFromObject(model);
    model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;for(const material of Array.isArray(o.material)?o.material:[o.material])if(material.map)material.map.anisotropy=8;}});
    const sourceBounds={min:bounds.min.toArray(),max:bounds.max.toArray()};station.addCADProp(model.name,model,bounds);propModels.push(model);
    provenance.models.push({role:p.role,source:'Poly Haven CC0 photographic PBR; uniformly scaled miniature in finite CAD side cradle; maps and UV retained',url:p.url,cadBounds:sourceBounds,scaleMMPerMetre:scale});
   }
  }
  provenance.combatAppearance={enabled:readable,enemy:enemy.appearance,protector:core?.appearance??null};syncEnemies(latestEnemies);return {ready:true,provenance};
 }
 function setDisplayMode(value='transparent'){if(!['transparent','desktop'].includes(value))throw new RangeError(`Unknown output mode: ${value}`);mode=value;station.setDisplayMode?.(value);return {mode,collisionBoxes:activeBoxes().length};}
 // The snow world keeps one live array whose boxes move with travel; the game
 // holds that same reference, so it must not be copied.
 const activeBoxes=()=>station.liveCollision?station.activeCollisionBoxes:[...(station.activeCollisionBoxes??station.collisionBoxes),...(depthStage?.collisionBoxes??[])];
 function configureView(camera){station.configure?.(camera);}
 function inspection(){return {enclosureOutput,protectorVisible:coreAnchor.visible,art:snowScene?'snow-r19':industrial?'industrial-r10':environment==='hangar'?'hangar-v1':'orbital-v1',depthExtension:depthStage?.inspection()??null,combatAppearance:provenance.combatAppearance,combatActors:[...actors.values()].map(a=>({id:a.id,heading:a.heading,state:a.data.state,scale:a.group.scale.x,entryVisible:a.entry.visible,entryOpacity:a.entryMat.opacity,chargeVisible:a.charge.visible,chargeOpacity:a.chargeMat.opacity,roleFinishes:a.ownedMaterials.filter(m=>m.userData.combatRole).map(m=>({name:m.name,role:m.userData.combatRole,color:m.color.toArray(),metalness:m.metalness}))})),entryCues:[...actors.values()].filter(a=>a.entry.visible).map(a=>({id:a.id,opacity:a.entryMat.opacity})),mode,presentation:mode==='transparent'?'floating':'grounded',foundationVisible:false,suspensionFieldVisible:false,coreVisualOffset:coreAnchor.position.y-1,desktopVisible:mode==='desktop',openVisible:true,activeCollisionBoxes:activeBoxes().length,environment:station.inspection(),open:station.inspection(),materials:surfacePack.inspection(),...damageSystem.inspection(),damageTemplate:damageTemplateAudit?structuredClone(damageTemplateAudit):null,surfaceImpact:{...surfaceImpact,last:surfaceImpact.last?structuredClone(surfaceImpact.last):null}};}
 function dispose(){if(disposed)return;reset();disposed=true;damageSystem.dispose();disposeProgramAnchor();const geometries=new Set(),materials=new Set(),textures=new Set();for(const o of [coreModel,enemyTemplate,shield,...propModels])o?.traverse(x=>{if(x.geometry)geometries.add(x.geometry);for(const m of Array.isArray(x.material)?x.material:x.material?[x.material]:[]){materials.add(m);for(const t of Object.values(m))if(t?.isTexture)textures.add(t);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const t of textures)t.dispose();chargeGeometry.dispose();beamGeometry.dispose();entryGeometry.dispose();depthStage?.dispose();station.dispose();surfacePack.dispose();root.clear();}
 return {root,environment:station.root,openStation:station,core:coreAnchor,robot:coreAnchor,enemyMeshes:actors,update,syncEnemies,resolveImpact,pulse,reset,prepareAssets,warmDraw,setDisplayMode,configureView,inspection,dispose,provenance,get collisionBoxes(){return activeBoxes();},get activeCollisionBoxes(){return activeBoxes();},get displayMode(){return mode;},get assetsReady(){return assetsReady;}};
}
