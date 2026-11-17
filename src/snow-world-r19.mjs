import * as T from 'three';
import {createNoiseTexture,mulberry,clamp,smooth,lerp} from './snow-noise.mjs';
import {installAlpineFog,createAlpineLights,SUN_DIRECTION} from './snow-atmosphere-r19.mjs';
import {SECTIONS,SECTION_LENGTH,CYCLE,createTerrainField,terrainColumns,createChunkGeometry,fillChunk,createDistantRangeGeometry,createTerrainMaterial,sectionAt,profileAt} from './snow-terrain-r19.mjs';
import {coniferParts,createConiferMaterial,createConiferShadowMaterial} from './snow-conifer-r25.mjs';
import {rockGeometry,iceSpireGeometry,markerPoleGeometry,crateGeometry,grassTuftGeometry,createRescueHut,createPropMaterials,createFloraMaterial} from './snow-flora-r19.mjs';
import {createSnowWeather,createSnowImpacts} from './snow-weather-r19.mjs';
import {EnclosureSpace} from './enclosure-space.mjs';

// R19 alpine transit. One world in world space serves the ordinary window and
// the box surfaces. The valley is an endless, deterministic, streamed
// heightfield. Track distance S runs along -z. The track group moves toward the
// viewer by the travelled distance, so the ground, trees and air flow past
// while distant ranges hold still, which is real motion parallax.
export const CHUNK_LENGTH=24,CHUNK_ROWS=33,CHUNK_COUNT=9,TRACK_ORIGIN_Z=21.8,TRAVEL_SPEED=4.2;
const ORIGIN_PERIOD=CYCLE*16;                  // keeps shader noise inputs small
const COLLISION_Z=[-46,9];                     // world z window with live proxies
const BANDS=[[6.8,8],[8,9.5],[9.5,11],[11,13],[13,16],[16,20],[20,25],[25,32],[32,44]];
const STRIPS=10,STRIP=CHUNK_LENGTH/STRIPS;
const HUT_OFFSET=2*SECTION_LENGTH+66,HUT_X=-10.4;
// Drones fly the |x|<6.3 corridor with their belly at 1.05-.41=.64 m. Shot
// proxies reaching into it are capped below that, so bank props never swallow
// a shot aimed at a drone (they stay hittable in their lower part).
export const CORRIDOR_X=6.3,CORRIDOR_TOP=.6;

// free=true (r23 level): the track stays put and a free-roaming player drives
// streaming, the hut, sections, collision window, far ranges and the sun via setView().
// terrainShape(x,S,h,w) reshapes the heightfield; keepOut(x,S,w) keeps the scatter (trees, rocks, seracs) off a place.
export function createSnowWorldR19({enclosure=false,frame=null,seed=0x51a0,speed=TRAVEL_SPEED,startTravel=0,free=false,terrainShape=null,terrainRock=null,keepOut=null}={}){
 installAlpineFog();if(free){speed=0;startTravel=0;}
 const root=new T.Group();root.name='SNOW r19 / alpine transit';
 const track=new T.Group();track.name='track space / flows toward the viewer';root.add(track);
 if(frame)root.add(frame.root);
 const field=createTerrainField(seed,{shape:terrainShape,rock:terrainRock}),columns=terrainColumns(),C=columns.length,noiseTexture=createNoiseTexture(9173);
 const owned={geometries:new Set(),materials:new Set()};
 const lights=createAlpineLights();root.add(lights.group);

 // ---- distant ranges (static: far mountains barely move as we travel) ----
 const rangeMaterial=createTerrainMaterial(noiseTexture,{flatten:false,name:'snow terrain / distant ranges'});owned.materials.add(rangeMaterial);
 const ranges=new T.Group();ranges.name='distant ranges / static aerial perspective';root.add(ranges);
 for(const [i,o] of [[0,{zNear:-150,zFar:-560,xHalf:640,height:125}],[1,{zNear:-540,zFar:-980,xHalf:1150,height:300,cols:150,rows:56,offset:9.7}]].entries()){
  const g=createDistantRangeGeometry(field,o[1]);owned.geometries.add(g);const m=new T.Mesh(g,rangeMaterial);m.name=`distant range ${i}`;m.receiveShadow=false;m.castShadow=false;ranges.add(m);
 }

 // ---- prop kit ----
 // r25: bough-card spruce (snow-conifer-r25.mjs) replaces the r19 solid jagged cones.
 // r25b: each spruce is two instanced parts on one instance buffer: the opaque
 // trunk+core (shadow caster, drawn with the terrain) and the alpha-cut cards
 // (no shadow, drawn after every other opaque mesh so hills, rocks and the
 // cores reject what they hide before the card shader runs). Chunks further
 // than PINE_LOD_DISTANCE from the viewer swap to cards with a two-joint droop.
 const PINE_SPEC={pineA:[11,{tiers:14,boughs:7,width:.74,snowiness:.8}],pineB:[23,{tiers:12,boughs:6,width:.58,snowiness:.62}],pineFar:[37,{tiers:8,boughs:5,width:.7,snowiness:.82,segments:2}]};
 const PINE_LOD_DISTANCE=32,pineParts={},pineLod={};
 for(const [key,[sd,o]] of Object.entries(PINE_SPEC)){pineParts[key]=coniferParts(sd,o);if((o.segments??4)>2){const l=coniferParts(sd,{...o,segments:2});l.core.dispose();pineLod[key]=l.cards;}}
 const geo={
  pineA:pineParts.pineA.cards,pineB:pineParts.pineB.cards,pineFar:pineParts.pineFar.cards,rock:rockGeometry(3),tuft:grassTuftGeometry(9),spire:iceSpireGeometry(5),pole:markerPoleGeometry(),crate:crateGeometry(7),
 };
 for(const g of [...Object.values(geo),...Object.values(pineParts).map(p=>p.core),...Object.values(pineLod)]){g.computeBoundingSphere();g.computeBoundingBox();owned.geometries.add(g);}
 const mat={
  pine:createConiferMaterial({name:'snow-laden spruce / r25 bough cards',roughness:.86,sway:.012,envMapIntensity:.62}),
  rock:createFloraMaterial({name:'granite boulder',roughness:.92,envMapIntensity:.55}),
  ice:createFloraMaterial({name:'glacial serac',roughness:.16,envMapIntensity:1.4}),
  pole:createFloraMaterial({name:'route marker pole',roughness:.45,emissiveBoost:.45}),
  crate:createFloraMaterial({name:'rescue supply crate',roughness:.82,envMapIntensity:.5}),
  grass:createFloraMaterial({name:'dry alpine grass',roughness:.9,sway:.09,envMapIntensity:.45}),
 };
 mat.grass.side=T.DoubleSide;
 mat.pineCore=createConiferMaterial({name:'snow-laden spruce / r25 trunk and core',cards:mat.pine});
 const pineShadow=createConiferShadowMaterial();owned.materials.add(pineShadow);
 for(const m of Object.values(mat))owned.materials.add(m);
 const KIT=[['pineA',120,true],['pineB',140,true],['pineFar',220,false],['rock',96,true],['spire',22,true],['pole',6,true],['crate',6,true],['tuft',300,false]];
 const KIT_MAT={pineA:mat.pine,pineB:mat.pine,pineFar:mat.pine,rock:mat.rock,spire:mat.ice,pole:mat.pole,crate:mat.crate,tuft:mat.grass};

 // ---- streamed chunks ----
 const calm={uCalm:{value:new T.Vector4(.5,.34,.24,.3)},uCalmK:{value:0}};
 const slots=[];let rebuilds=0,lastRebuildMs=0,maxRebuildMs=0;
 function makeSlot(i){
  const geometry=createChunkGeometry(columns,CHUNK_ROWS);owned.geometries.add(geometry);
  const material=createTerrainMaterial(noiseTexture,{flatten:true,name:'snow terrain / streamed',calm});owned.materials.add(material);
  const group=new T.Group();group.name=`chunk slot ${i}`;track.add(group);
  const mesh=new T.Mesh(geometry,material);mesh.name=`terrain chunk ${i}`;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  const inst={};for(const [key,cap,cast] of KIT){const im=new T.InstancedMesh(geo[key],KIT_MAT[key],cap);im.name=`${key} / slot ${i}`;im.count=0;im.castShadow=cast;im.receiveShadow=true;group.add(im);inst[key]=im;}
  const twins=[];for(const key of Object.keys(pineParts)){
   const cards=inst[key],core=new T.InstancedMesh(pineParts[key].core,mat.pineCore,cards.instanceMatrix.count);
   core.instanceMatrix=cards.instanceMatrix;core.count=0;core.name=`${key} core / slot ${i}`;core.castShadow=cards.castShadow;core.receiveShadow=true;core.customDepthMaterial=pineShadow;
   cards.castShadow=false;cards.renderOrder=1;group.add(core);twins.push({key,cards,core,lod:0});
  }
  return {index:i,k:null,group,mesh,geometry,material,inst,twins,info:null,boxes:[],counts:{}};
 }
 const sample={h:0,ny:1,rock:0,lake:0};
 function gridSample(slot,x,S,out=sample){
  const pos=slot.geometry.attributes.position.array,nor=slot.geometry.attributes.normal.array,surf=slot.geometry.attributes.aSurf.array,step=slot.info.step;
  const r=clamp((S-slot.info.S0)/step,0,CHUNK_ROWS-1.0001),r0=Math.floor(r),fr=r-r0;
  let lo=0,hi=C-1;if(x<=columns[0])hi=1;else if(x>=columns[C-1])lo=C-2;else while(hi-lo>1){const mid=(lo+hi)>>1;if(columns[mid]<=x)lo=mid;else hi=mid;}
  const fc=clamp((x-columns[lo])/(columns[hi]-columns[lo]));
  const i00=r0*C+lo,i10=r0*C+hi,i01=(r0+1)*C+lo,i11=(r0+1)*C+hi;
  const bl=(a,b,c,d)=>lerp(lerp(a,b,fc),lerp(c,d,fc),fr);
  out.h=bl(pos[i00*3+1],pos[i10*3+1],pos[i01*3+1],pos[i11*3+1]);
  out.ny=bl(nor[i00*3+1],nor[i10*3+1],nor[i01*3+1],nor[i11*3+1]);
  out.nx=bl(nor[i00*3],nor[i10*3],nor[i01*3],nor[i11*3]);out.nz=bl(nor[i00*3+2],nor[i10*3+2],nor[i01*3+2],nor[i11*3+2]);
  out.rock=bl(surf[i00*4],surf[i10*4],surf[i01*4],surf[i11*4]);out.lake=bl(surf[i00*4+3],surf[i10*4+3],surf[i01*4+3],surf[i11*4+3]);
  return out;
 }
 const temp=new T.Object3D();
 function place(slot,key,x,y,S,{yaw=0,scale=[1,1,1],leanX=0,leanZ=0}={}){
  const im=slot.inst[key];if(im.count>=im.instanceMatrix.count)return false;
  temp.position.set(x,y,-(S-slot.info.S0));temp.rotation.set(leanX,yaw,leanZ);temp.scale.set(...scale);temp.updateMatrix();im.setMatrixAt(im.count++,temp.matrix);return true;
 }
 function addBox(slot,id,kind,x0,x1,y0,y1,S0,S1){
  if(x0*x1>=0&&Math.min(Math.abs(x0),Math.abs(x1))<CORRIDOR_X)y1=Math.min(y1,CORRIDOR_TOP);
  if(x1-x0<.02||y1-y0<.02||S1-S0<.02)return null;const rec={kind,S0,S1,box:{id,min:[x0,y0,0],max:[x1,y1,0]}};slot.boxes.push(rec);return rec;}
 const bandColumns=BANDS.map(([a,b])=>[[],[]].map((_,side)=>{const list=[];for(let c=0;c<C;c++){const x=columns[c],ax=Math.abs(x);if((side?x>0:x<0)&&ax>=a-1e-6&&ax<=b+1e-6)list.push(c);}return list;}));
 function scatter(slot){
  const k=slot.k,S0=slot.info.S0,rng=mulberry((seed^Math.imul(k+1,0x9e3779b1))>>>0),prof=profileAt(S0+CHUNK_LENGTH/2,{}),N=field.noise;
  for(const im of Object.values(slot.inst))im.count=0;slot.boxes.length=0;
  const s=sample,kept=keepOut?(x,S)=>keepOut(x,S,()=>field.rowInfo(S,x<0?-1:1).w):()=>false;
  // terrain stair proxies: each band holds the minimum surface height, so a
  // shot never stops in mid-air; the visual impact is then snapped onto the
  // rendered surface by resolveSurface().
  const pos=slot.geometry.attributes.position.array;
  for(let st=0;st<STRIPS;st++){
   const r0=Math.floor(st*STRIP/slot.info.step),r1=Math.min(CHUNK_ROWS-1,Math.ceil((st+1)*STRIP/slot.info.step));
   for(let b=0;b<BANDS.length;b++)for(const side of [0,1]){
    let minH=Infinity;for(const c of bandColumns[b][side])for(let r=r0;r<=r1;r++)minH=Math.min(minH,pos[(r*C+c)*3+1]);
    if(!(minH>.2))continue;const [a,e]=BANDS[b];
    addBox(slot,`terrain/${k}/${side}/${st}/${b}`,'terrain',side?a:-e,side?e:-a,-3,minH-.04,S0+st*STRIP,S0+(st+1)*STRIP);
   }
  }
  // spruce forest: clustered stands on gentle slopes below the tree line
  const forest=(x,S)=>smooth(.26,.56,N.fbm(x*.045+3.3,S*.045-1.1,3));
  const nearCandidates=Math.round(210*prof.trees),farCandidates=Math.round(300*prof.trees);
  for(let i=0;i<nearCandidates;i++){
   const side=rng()<.5?-1:1,S=S0+rng()*CHUNK_LENGTH,row=field.rowInfo(S,side),w=Math.max(row.w-.8,7.0),ax=w+Math.pow(rng(),1.25)*(26-w),x=side*ax;
   gridSample(slot,x,S,s);if(s.ny<.72||s.rock>.42||s.lake>.06||kept(x,S))continue;
   const m=forest(x,S);if(rng()>m*(.5+.5*prof.trees))continue;if(s.h>24+N.fbm(x*.1,S*.1,2)*8)continue;
   const slender=rng()<.55,width=slender?.58:.74;let H=lerp(4.4,10.8,rng())*(.82+.3*m);
   const maxH=(ax-6.35)/(.42*width);if(maxH<1.6)continue;H=Math.min(H,maxH);
   if(!place(slot,slender?'pineB':'pineA',x,s.h-.14,S,{yaw:rng()*Math.PI*2,scale:[H,H*(.94+rng()*.12),H],leanX:(rng()-.5)*.06,leanZ:(rng()-.5)*.06}))continue;
   if(ax<28){const r=.42*width*H*.55,rec=addBox(slot,`tree/${k}/${i}`,'tree',x-r,x+r,s.h+.22*H,s.h+.92*H,S-r,S+r);
    // the crown box is for shots; a walker meets the whole rooted spruce: its lowest whorl droops almost to the
    // snow and its branch tips reach ~.5·width·H (.415 tier radius × 1.2 tips), so that skirt is the body column.
    if(rec)rec.box.column={radius:.5*width*H,base:s.h-.14};}
  }
  for(let i=0;i<farCandidates;i++){
   const side=rng()<.5?-1:1,S=S0+rng()*CHUNK_LENGTH,ax=lerp(24,72,Math.pow(rng(),1.3)),x=side*ax;
   gridSample(slot,x,S,s);if(s.ny<.62||s.rock>.5||s.lake>.06)continue;
   const m=forest(x*.8,S);if(rng()>m*(.45+.55*prof.trees))continue;if(s.h>34+N.fbm(x*.07,S*.07,2)*12)continue;
   const H=lerp(6,13.5,rng());place(slot,'pineFar',x,s.h-.2,S,{yaw:rng()*Math.PI*2,scale:[H,H,H]});
  }
  // boulders: scree under rock bands, plus small stones edging the route
  const rockCandidates=Math.round(34*prof.rocks)+6;
  for(let i=0;i<rockCandidates;i++){
   const side=rng()<.5?-1:1,S=S0+rng()*CHUNK_LENGTH,edge=rng()<.38,ax=edge?lerp(7.05,9.6,rng()):lerp(9.6,42,Math.pow(rng(),1.4)),x=side*ax;
   gridSample(slot,x,S,s);if(s.lake>.08||kept(x,S))continue;if(!edge&&s.rock<.18&&rng()<.65)continue;
   let r=edge?lerp(.2,.68,rng()):lerp(.45,2.5,Math.pow(rng(),1.7));r=Math.min(r,(ax-6.5)*.8);if(r<.12)continue;
   const sx=r*(.8+rng()*.5),sy=r*(.55+rng()*.45),sz=r*(.8+rng()*.5);
   place(slot,'rock',x,s.h-.22*sy,S,{yaw:rng()*Math.PI*2,scale:[sx,sy,sz],leanX:(rng()-.5)*.3,leanZ:(rng()-.5)*.3});
   if(ax<30)addBox(slot,`rock/${k}/${i}`,'rock',x-sx*.7,x+sx*.7,s.h-.2,s.h+sy*.62,S-sz*.7,S+sz*.7);
  }
  // valley-floor dressing on the banks: dry grass where the snow is scoured
  // thin, half-buried stones and spruce saplings. Inside |x|<6.3 everything
  // stays under ~.6 m so it never reaches the hovering enemies.
  const wind=prof.wind,tuftClusters=Math.round(30+26*wind-12*prof.lake);
  for(let i=0;i<tuftClusters;i++){
   const side=rng()<.5?-1:1,S=S0+rng()*CHUNK_LENGTH,ax=lerp(2.75,11.5,Math.pow(rng(),1.3)),x=side*ax;
   const sc=field.scour(x,S,wind);if(rng()>.12+sc*1.4)continue;
   gridSample(slot,x,S,s);if(s.ny<.8||s.lake>.05||s.rock>.4||kept(x,S))continue;
   const n=2+Math.floor(rng()*(3+sc*4));
   for(let j=0;j<n;j++){
    const xx=x+(rng()-.5)*1.1,SS=S+(rng()-.5)*1.3;if(Math.abs(xx)<2.6)continue;gridSample(slot,xx,SS,s);
    const H=lerp(.2,.5,Math.pow(rng(),.8))*(Math.abs(xx)<6.3?1:1.25);
    place(slot,'tuft',xx,s.h-.05*H,SS,{yaw:rng()*6.28,scale:[H*(.9+rng()*.4),H,H*(.9+rng()*.4)],leanX:(rng()-.5)*.2,leanZ:(rng()-.5)*.2});
   }
  }
  // bed-edge dressing between the snowcat tracks and the berms (|x| 1.7-2.6):
  // the nearest props, streaming past the bottom corners of the screen
  const edgeBits=Math.round(9+6*wind);
  for(let i=0;i<edgeBits;i++){
   const side=rng()<.5?-1:1,S=S0+rng()*CHUNK_LENGTH,x=side*lerp(1.72,2.65,rng());gridSample(slot,x,S,s);if(s.lake>.05)continue;
   if(rng()<.72){const n=1+Math.floor(rng()*3);for(let j=0;j<n;j++){const xx=x+(rng()-.5)*.4,SS=S+(rng()-.5)*.6,H=lerp(.16,.36,rng());if(Math.abs(xx)<1.65)continue;gridSample(slot,xx,SS,s);
     place(slot,'tuft',xx,s.h-.04*H,SS,{yaw:rng()*6.28,scale:[H*1.1,H,H*1.1],leanX:(rng()-.5)*.2,leanZ:(rng()-.5)*.2});}}
   else{const r=lerp(.06,.16,rng());place(slot,'rock',x,s.h-.4*r,S,{yaw:rng()*6.28,scale:[r*1.2,r*.6,r],leanX:(rng()-.5)*.4,leanZ:(rng()-.5)*.4});}
  }
  const stones=Math.round(8+10*prof.rocks);
  for(let i=0;i<stones;i++){
   const side=rng()<.5?-1:1,S=S0+rng()*CHUNK_LENGTH,ax=lerp(2.9,7.05,rng()),x=side*ax;
   gridSample(slot,x,S,s);if(s.lake>.05||kept(x,S))continue;
   const r=lerp(.09,ax<6.3?.3:.5,Math.pow(rng(),1.6)),sx=r*(.8+rng()*.6),sy=r*(.5+rng()*.4),sz=r*(.8+rng()*.6);
   place(slot,'rock',x,s.h-.35*sy,S,{yaw:rng()*6.28,scale:[sx,sy,sz],leanX:(rng()-.5)*.4,leanZ:(rng()-.5)*.4});
   if(r>.2)addBox(slot,`stone/${k}/${i}`,'rock',x-sx*.7,x+sx*.7,s.h-.2,s.h+sy*.6,S-sz*.7,S+sz*.7);
  }
  const saplings=Math.round(3+5*prof.trees);
  for(let i=0;i<saplings;i++){
   const side=rng()<.5?-1:1,S=S0+rng()*CHUNK_LENGTH;let ax=lerp(4.2,7.4,rng()),x=side*ax;
   gridSample(slot,x,S,s);if(s.ny<.85||s.lake>.05||kept(x,S))continue;
   const H=ax<6.3?lerp(.35,.62,rng()):lerp(.8,1.9,rng());
   // a tall sapling keeps its whole proxy outside the drone corridor (low
   // ones are capped by addBox). Only a shot at a drone's outermost rim can
   // still graze a sapling standing just beyond x=6.3 at the same depth.
   if(ax>=CORRIDOR_X&&ax-.25*H<CORRIDOR_X){ax=CORRIDOR_X+.25*H;x=side*ax;gridSample(slot,x,S,s);if(s.ny<.85||s.lake>.05)continue;}
   place(slot,'pineB',x,s.h-.12*H,S,{yaw:rng()*6.28,scale:[H*1.15,H,H*1.15],leanX:(rng()-.5)*.1,leanZ:(rng()-.5)*.1});
   if(H>.5)addBox(slot,`sapling/${k}/${i}`,'tree',x-.25*H,x+.25*H,s.h,s.h+.9*H,S-.25*H,S+.25*H);
  }
  // seracs in the glacier canyon
  const spireCandidates=Math.round(18*prof.spires);
  for(let i=0;i<spireCandidates;i++){
   const side=rng()<.5?-1:1,S=S0+rng()*CHUNK_LENGTH,ax=lerp(9.5,26,rng()),x=side*ax;
   gridSample(slot,x,S,s);if(s.ny<.5||kept(x,S))continue;let H=lerp(2.4,8.5,rng());H=Math.min(H,(ax-6.5)/.3);if(H<1.4)continue;
   place(slot,'spire',x,s.h-.3,S,{yaw:rng()*Math.PI*2,scale:[H*.85,H,H*.85]});
   addBox(slot,`ice/${k}/${i}`,'ice',x-.19*H,x+.19*H,s.h-.2,s.h+.82*H,S-.19*H,S+.19*H);
  }
  // route marker poles: steady rhythm at the corridor edge, the strongest speed cue
  for(let j=0;j<3;j++){
   const S=S0+4+j*8,side=(k*3+j)%2?1:-1,x=side*(7.08+rng()*.3);gridSample(slot,x,S,s);const H=1.5+rng()*.32;if(kept(x,S))continue;
   place(slot,'pole',x,s.h-.18,S,{yaw:rng()*6.28,scale:[1,H,1],leanX:(rng()-.5)*.08,leanZ:(rng()-.5)*.08});
  }
  // occasional rescue supply cache beside the route
  if(rng()<.32*(1-prof.lake)){
   const side=rng()<.5?-1:1,S=S0+3+rng()*(CHUNK_LENGTH-6),n=1+Math.floor(rng()*3);
   for(let j=0;j<n;j++){const ax=8.2+rng()*1.1,x=side*ax,SS=S+(j-1)*1.15+(rng()-.5)*.3;gridSample(slot,x,SS,s);if(s.ny<.84||kept(x,SS))continue;const sc=.72+rng()*.24;
    place(slot,'crate',x,s.h-.06,SS,{yaw:(rng()-.5)*.8,scale:[sc,sc,sc]});addBox(slot,`crate/${k}/${j}`,'wood',x-.52*sc,x+.52*sc,s.h-.1,s.h+.82*sc,SS-.5*sc,SS+.5*sc);}
  }
  for(const im of Object.values(slot.inst)){im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();}
  for(const t of slot.twins){t.core.count=t.cards.count;t.core.computeBoundingSphere();}
  slot.counts=Object.fromEntries(Object.entries(slot.inst).map(([key,im])=>[key,im.count]));
 }
 function fillSlot(slot,k){
  const t0=globalThis.performance?.now?.()??Date.now();
  slot.k=k;slot.info=fillChunk(field,slot.geometry,columns,k*CHUNK_LENGTH,CHUNK_LENGTH,CHUNK_ROWS,{local:true});
  slot.group.position.z=-k*CHUNK_LENGTH;slot.material.userData.uniforms.uTrackOrigin.value=(k*CHUNK_LENGTH)%ORIGIN_PERIOD;
  scatter(slot);
  const ms=(globalThis.performance?.now?.()??Date.now())-t0;lastRebuildMs=ms;maxRebuildMs=Math.max(maxRebuildMs,ms);rebuilds++;
 }
 for(let i=0;i<CHUNK_COUNT;i++)slots.push(makeSlot(i));

 // ---- the rescue hut at the wind col ----
 const hutMaterials=createPropMaterials();for(const m of Object.values(hutMaterials))owned.materials.add(m);
 const hut=createRescueHut(hutMaterials);const hutHolder=new T.Group();hutHolder.name='wind col rescue hut';hutHolder.add(hut);track.add(hutHolder);
 hut.rotation.y=-Math.PI/2+.12;const hutFoot=new T.Mesh(new T.BoxGeometry(3.7,1.6,3.1),hutMaterials.stone);hutFoot.position.y=-.8;hutFoot.receiveShadow=true;hut.add(hutFoot);
 let hutS=null,hutBase=0;const hutBox={kind:'wood',S0:0,S1:0,box:{id:'hut/main',min:[0,0,0],max:[0,0,0]}};

 // ---- weather and impacts ----
 const weather=createSnowWeather({seed:seed^0x5eed,anchored:free});root.add(weather.root);
 const impacts=createSnowImpacts();track.add(impacts.root);

 let travel=startTravel,lastTime=null,mode='transparent',camera=null,disposed=false,currentSection=sectionAt(0),fogDensity=1,viewX=0,viewZ=7.8;
 // S at the viewer: the fixed transit camera (z=7.8 when travel=0) or the free player
 const viewS=()=>free?TRACK_ORIGIN_Z-viewZ:travel+TRACK_ORIGIN_Z;
 const liveBoxes=[],centreMask={x:.5,y:.34,rx:.24,ry:.3,enclosure};const profile={};
 function ensureChunks(){
  const k0=free?Math.floor((viewS()-60)/CHUNK_LENGTH):Math.max(0,Math.floor((travel+TRACK_ORIGIN_Z-14)/CHUNK_LENGTH)),need=new Set();
  for(let k=k0;k<k0+CHUNK_COUNT;k++)need.add(k);
  const spare=[];for(const s of slots){if(s.k!==null&&need.has(s.k))need.delete(s.k);else spare.push(s);}
  for(const k of [...need].sort((a,b)=>a-b))fillSlot(spare.shift(),k);
 }
 function placeHut(){
  const view=free?viewS():travel+TRACK_ORIGIN_Z;let n=free?Math.round((view-HUT_OFFSET)/CYCLE):Math.floor((view-20-HUT_OFFSET)/CYCLE)+1;const S=n*CYCLE+HUT_OFFSET;
  if(S!==hutS){hutS=S;let h=Infinity;for(const dx of [-1.6,0,1.6])for(const dS of [-1.4,0,1.4])h=Math.min(h,field.height(HUT_X+dx,S+dS));hutBase=h;hutHolder.position.set(HUT_X,hutBase,-S);
   hutBox.S0=S-1.9;hutBox.S1=S+1.9;hutBox.box.min[0]=HUT_X-1.6;hutBox.box.max[0]=HUT_X+1.6;hutBox.box.min[1]=hutBase-.5;hutBox.box.max[1]=hutBase+3.6;}
  const z=free?view-hutS:TRACK_ORIGIN_Z+travel-hutS,f=smooth(118,166,-z);
  hutHolder.visible=z<(free?90:16)&&f<.999;hutHolder.scale.setScalar(Math.max(1e-3,1-f));hutHolder.position.y=hutBase-f*(hutBase+1.6);
 }
 function refreshCollision(){
  liveBoxes.length=0;if(frame)for(const b of frame.collisionBoxes)liveBoxes.push(b);
  const base=TRACK_ORIGIN_Z+travel;
  // free: a window around the player; terrain stair proxies are skipped there
  // because the level marches the real heightfield instead.
  const Z0=free?viewZ-125:COLLISION_Z[0],Z1=free?viewZ+32:COLLISION_Z[1];
  const push=lb=>{const zA=base-lb.S1,zB=base-lb.S0;if(zB<Z0||zA>Z1)return;if(free&&lb.kind==='terrain')return;lb.box.min[2]=zA;lb.box.max[2]=zB;liveBoxes.push(lb.box);};
  for(const s of slots){if(s.k===null)continue;const zFar=base-(s.k+1)*CHUNK_LENGTH,zNear=base-s.k*CHUNK_LENGTH;if(zNear<Z0||zFar>Z1)continue;for(const lb of s.boxes)push(lb);}
  if(hutHolder.visible&&hutS!==null)push(hutBox);
 }
 function computeCentreMask(){
  if(!camera||!enclosure)return;
  const space=new EnclosureSpace(camera,10),pts=[[-55,-5,82],[55,-5,82],[-55,-5,182],[55,-5,182]].map(p=>space.project(p).uv);
  const u0=Math.min(...pts.map(p=>p.x)),u1=Math.max(...pts.map(p=>p.x)),v0=Math.min(...pts.map(p=>p.y)),v1=Math.max(...pts.map(p=>p.y));
  Object.assign(centreMask,{x:(u0+u1)/2,y:1-(v0+v1)/2,rx:(u1-u0)/2*1.1,ry:(v1-v0)/2*1.1});
  calm.uCalm.value.set(centreMask.x,centreMask.y,centreMask.rx,centreMask.ry);calm.uCalmK.value=.85;
 }
 function configure(cameraValue){if(disposed)throw new Error('Cannot configure a disposed snow world');camera=cameraValue;frame?.configure?.(cameraValue);computeCentreMask();weather.setCentre(centreMask,enclosure?.78:0);refreshCollision();return inspection();}
 let fades=null,fadesAt=0;
 function update(time,state={}){
  if(disposed)return;const now=Number.isFinite(time)?time:0;
  let dt=lastTime===null?0:now-lastTime;if(!(dt>0)||state.paused)dt=0;dt=Math.min(dt,.1);lastTime=now;
  travel+=dt*speed;track.position.z=TRACK_ORIGIN_Z+travel;
  ensureChunks();placeHut();
  if(free){ranges.position.z=viewZ-7.8;lights.target.position.set(viewX+1,0,viewZ-21.8);lights.sun.position.copy(lights.target.position).addScaledVector(SUN_DIRECTION,90);}
  // free: the far flattening (terrain and flora sink into the horizon 118..166 m out) is measured from the fixed
  // transit camera in world z; a roaming player carries that window along, or everything past S~188 draws flat
  if(free){if(!fades||now-fadesAt>2||now<fadesAt){fades=new Set();fadesAt=now;root.traverse(o=>{for(const m of [].concat(o.material||[])){const u=m.userData?.uniforms?.uFade;if(u&&u.value.x<1e5)fades.add(u);}});}
   const off=7.8-viewZ;for(const u of fades)u.value.set(118+off,166+off);}
  profileAt(free?viewS()+4:travel+TRACK_ORIGIN_Z+10,profile);
  const ahead=sectionAt(free?viewS()+2:travel+TRACK_ORIGIN_Z+26);if(ahead.index!==currentSection.index)currentSection=ahead;else currentSection.progress=ahead.progress;
  fogDensity=1+.55*profile.wind-.12*profile.lake+.15*profile.ice;
  for(const m of [mat.pine])m.userData.uniforms.uTime.value=now;
  {const vs=viewS();for(const s of slots){if(s.k===null)continue;const lod=Math.max(s.info.S0-vs,vs-s.info.S0-CHUNK_LENGTH)>PINE_LOD_DISTANCE?1:0;
   for(const t of s.twins){if(t.lod===lod||!pineLod[t.key])continue;t.lod=lod;t.cards.geometry=lod?pineLod[t.key]:pineParts[t.key].cards;t.cards.computeBoundingSphere();}}}
  weather.update(now,{travel,travelSpeed:dt>0?speed:0,profile});
  impacts.update(dt);hut.userData.beacon&&(hut.userData.beacon.material.emissiveIntensity=1.5+2.5*Math.pow(.5+.5*Math.sin(now*3.1),8));
  refreshCollision();
 }
 // ---- surface queries (visual impact placement) ----
 function slotFor(S){for(const s of slots)if(s.k!==null&&S>=s.info.S0&&S<=s.info.S0+CHUNK_LENGTH)return s;return null;}
 function terrainAt(x,z,out={}){
  const S=TRACK_ORIGIN_Z+travel-z,s=slotFor(S);
  if(s){gridSample(s,x,S,out);return out;}
  out.h=field.height(x,S);out.ny=1;out.nx=0;out.nz=0;out.rock=0;out.lake=0;return out;
 }
 const tmp={};
 function marchTerrain(origin,dir,maxDistance){
  let prevT=0,prevD=origin.y-terrainAt(origin.x,origin.z,tmp).h;if(prevD<0)return null;
  for(let t=.08;t<=maxDistance;t+=.08){
   const p=origin.clone().addScaledVector(dir,t),d=p.y-terrainAt(p.x,p.z,tmp).h;
   if(d<=0){let a=prevT,b=t;for(let i=0;i<10;i++){const m=(a+b)/2,q=origin.clone().addScaledVector(dir,m);if(q.y-terrainAt(q.x,q.z,tmp).h>0)a=m;else b=m;}
    const hit=origin.clone().addScaledVector(dir,b);terrainAt(hit.x,hit.z,tmp);hit.y=tmp.h;
    return {point:hit,normal:new T.Vector3(tmp.nx,tmp.ny,tmp.nz).normalize(),rock:tmp.rock,lake:tmp.lake};}
   prevT=t;prevD=d;
  }
  return null;
 }
 // Returns a visual impact for a gameplay surface event (ground or scenery).
 function resolveSurface(event){
  const position=new T.Vector3(...event.position),id=String(event.colliderId??''),kind=event.type==='ground'?'terrain':id.split('/')[0]||'terrain';
  let dir=Array.isArray(event.direction)?new T.Vector3(...event.direction):camera?position.clone().sub(camera.position):new T.Vector3(0,-.2,-1);
  if(dir.lengthSq()<1e-8)dir.set(0,-.2,-1);dir.normalize();
  if(kind==='terrain'){
   const back=camera?Math.min(9,camera.position.distanceTo(position)-.3):6,origin=position.clone().addScaledVector(dir,-Math.max(.5,back)),hit=marchTerrain(origin,dir,Math.max(.5,back)+2.5);
   if(hit)return {position:hit.point.toArray(),normal:hit.normal.toArray(),direction:dir.toArray(),kind:hit.rock>.55?'rock':hit.lake>.5?'ice':'snow',resolved:true};
   return {position:position.toArray(),normal:event.normal?.slice()??[0,1,0],direction:dir.toArray(),kind:'snow',resolved:false};
  }
  const map={tree:'tree',rock:'rock',ice:'ice',crate:'wood',hut:'wood'};
  return {position:position.toArray(),normal:event.normal?.slice()??dir.clone().negate().toArray(),direction:dir.toArray(),kind:map[kind]??'frame',resolved:true};
 }
 function impact(event){
  if(!event?.position)return;const kind=event.surfaceKind??'snow';
  const local=new T.Vector3(...event.position);local.z-=track.position.z;
  impacts.trigger({position:local.toArray(),normal:event.normal??[0,1,0],kind,strength:kind==='frame'?.5:1});
 }
 function reset(){impacts.reset();}
 function setDisplayMode(value='transparent'){if(!['transparent','desktop'].includes(value))throw new RangeError('Unknown output mode '+value);mode=value;frame?.setDisplayMode?.(value);return {mode};}
 function section(){return {...currentSection};}
 function setView(x,z){if(Number.isFinite(x))viewX=x;if(Number.isFinite(z))viewZ=z;}
 function inspection(){
  let triangles=0,meshes=0;root.traverse(o=>{if(o.isMesh&&o.visible){meshes++;const n=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3;triangles+=o.isInstancedMesh?n*o.count:n;}});
  const counts={};for(const s of slots)for(const [k,v] of Object.entries(s.counts))counts[k]=(counts[k]??0)+v;
  return {art:'snow-r19',id:'snow-alpine-r19',mode,enclosure,travel,speed,section:{...currentSection},sections:SECTIONS.map(s=>s.name),chunks:slots.map(s=>s.k).sort((a,b)=>a-b),chunkLength:CHUNK_LENGTH,rebuilds,lastRebuildMs,maxRebuildMs,
   collisionBoxes:liveBoxes.length,activeCollisionBoxes:liveBoxes.length,props:counts,hut:{S:hutS,visible:hutHolder.visible},fogDensity,meshes,triangles,centreMask:{...centreMask},
   weather:weather.inspection(),impacts:impacts.inspection(),frame:frame?.inspection?.()??null,propsPlacement:[],hiddenFloor:false,source:'procedural Three.js r19: heightfield terrain, spruce, granite, seracs, hut; no downloaded or commercial assets'};
 }
 function dispose(){
  if(disposed)return;disposed=true;frame?.dispose?.();weather.dispose();impacts.dispose();
  hut.traverse(o=>{if(o.geometry)owned.geometries.add(o.geometry);});
  for(const s of slots){for(const im of Object.values(s.inst))im.dispose();for(const t of s.twins)t.core.dispose();} // instance-matrix buffers (a core shares its cards' buffer)
  for(const g of owned.geometries)g.dispose();for(const m of owned.materials)m.dispose();noiseTexture.dispose();
  lights.sun.shadow.map?.dispose?.();lights.sun.dispose?.();root.clear();liveBoxes.length=0;slots.length=0;
 }
 ensureChunks();placeHut();profileAt(travel+TRACK_ORIGIN_Z,profile);weather.update(0,{travel,travelSpeed:0,profile});refreshCollision();
 return {root,track,lights,weather,impacts,field,
  get collisionBoxes(){return liveBoxes;},get activeCollisionBoxes(){return liveBoxes;},liveCollision:true,
  get travel(){return travel;},get fogDensity(){return fogDensity;},centreMask,
  get viewS(){return viewS();},free,setView,ranges,
  configure,update,resolveSurface,impact,terrainAt,section,reset,setDisplayMode,inspection,dispose};
}
