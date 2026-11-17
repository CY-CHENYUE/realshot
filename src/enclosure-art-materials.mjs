import * as T from 'three';
import {createIndustrialMaterials} from './industrial-materials.mjs';

// The detailed CAD kit supplies metre UVs (source millimetres / 1000).
// 50 mm is an authored miniature finish scale, not the source asset's scan size.
const TILE_METRES=.05;
const CHANNELS={map:'metal_diffuse.jpg',normalMap:'metal_normal.jpg',roughnessMap:'metal_roughness.jpg',metalnessMap:'metal_metalness.jpg'};
const METAL_SOURCE='https://ambientcg.com/view?id=Metal050C';

export function createEnclosureArtMaterials({combatReadability=true}={}){
 const base=createIndustrialMaterials({combatReadability}),materials=base.materials,ownedTextures=new Set();
 // Register the local ceiling clone in the base pack so its dynamic material
 // disposal owns it as well. It shares finish maps, never a global wall edit.
 materials.ceiling=materials.shell.clone();materials.ceiling.name='Industrial_ceiling';
 let disposed=false,ready=false,state='unprepared',error=null,preparing=null;
 const finishes={
  shell:{color:'#b5bdb8',metalness:.08,roughness:.68,roughnessRange:[.56,.80],normalStrength:.14},
  ceiling:{color:'#bdc6c0',metalness:.04,roughness:.75,roughnessRange:[.65,.85],normalStrength:.10},
  slate:{color:combatReadability?'#7e939a':'#6b828a',metalness:.12,roughness:.64,roughnessRange:[.50,.78],normalStrength:.13},
  alloy:{color:'#98a5a8',metalness:.90,roughness:.445,roughnessRange:[.25,.64],normalStrength:.21},
  graphite:{color:combatReadability?'#586d75':'#485d66',metalness:.15,roughness:.70,roughnessRange:[.58,.82],normalStrength:.11}
 };
 for(const [key,finish]of Object.entries(finishes)){
  const material=materials[key];
  material.color.set(finish.color);material.metalness=finish.metalness;material.roughness=finish.roughness;material.normalScale.setScalar(finish.normalStrength);
  // Real bevels provide edge response. Replace the base derivative edge hint
  // only for these locally owned materials, rather than stacking two shaders.
  material.onBeforeCompile=shader=>{
   const [low,high]=finish.roughnessRange,span=high-low;
   shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
    #ifdef USE_ROUGHNESSMAP
     roughnessFactor=clamp(roughness+(texelRoughness.g-.5)*${span.toFixed(6)},${low.toFixed(6)},${high.toFixed(6)});
    #endif`);
  };
  material.customProgramCacheKey=()=>`enclosure-art-metal050c-v1-${key}`;
 }
 // A small authored local ambient allowance opens the unlit underside. This
 // is not an actual area light and does not illuminate other objects/bloom.
 materials.ceiling.emissive.set('#9ca89e');materials.ceiling.emissiveIntensity=.11;
 async function prepare(){
  if(disposed)throw new Error('Enclosure art materials disposed');
  if(preparing)return preparing;
  state='loading';
  preparing=(async()=>{
   const loader=new T.TextureLoader(),loaded={};
   // Commit the four channels as one complete set. A missing map remains a
   // visible loading failure, and late loads after dispose are also released.
   const results=await Promise.allSettled([
    base.prepare(),
    ...Object.entries(CHANNELS).map(async([slot,file])=>{
     const texture=await loader.loadAsync('/assets/defense-v2/'+file);
     if(disposed){texture.dispose();return;}
     ownedTextures.add(texture);texture.name='Enclosure / Metal050C / '+slot;
     texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.setScalar(1/TILE_METRES);
     texture.anisotropy=8;texture.colorSpace=slot==='map'?T.SRGBColorSpace:T.NoColorSpace;
     texture.needsUpdate=true;loaded[slot]=texture;
    })
   ]);
   if(disposed)return {ready:false};
   const failed=results.find(result=>result.status==='rejected');
   if(failed){
    for(const texture of ownedTextures)texture.dispose();ownedTextures.clear();
    state='failed';error=String(failed.reason?.message??failed.reason);
    throw failed.reason;
   }
   for(const key of Object.keys(finishes)){
    Object.assign(materials[key],loaded);materials[key].needsUpdate=true;
   }
   ready=true;state='ready';return {ready:true};
  })();
  return preparing;
 }
 function inspection(){
  const inherited=base.inspection();
  return {...inherited,
   source:'Original local CAD equipment finishes using existing ambientCG Metal050C PBR channels; unchanged Poly Haven metal_plate_02 channels remain on the bounded real deck',
   enclosureArt:{ready,state,error,combatReadability,source:METAL_SOURCE,author:'ambientCG / Lennart Demes',license:'CC0-1.0',licenseURL:'https://docs.ambientcg.com/license/',channels:{...CHANNELS},
    uvUnits:'metres from CAD millimetres / 1000',tileMetres:TILE_METRES,repeatsPerMetre:1/TILE_METRES,scaleOrigin:'Author-selected 50 mm miniature finish tile; not a measured source scan dimension',
    affectedFamilies:Object.keys(finishes),preservedFamilies:['deck','rubber','copper','caution','signal','glass'],
    ceilingAmbient:{family:'ceiling',kind:'Authored local ambient compensation, not measured or physically emitted scene light',emissive:materials.ceiling.emissive.getHexString(),intensity:materials.ceiling.emissiveIntensity,scope:'Only roof skin assigned ceiling; shared PBR channels remain, no lighting/background or bloom change'},
    roughness:'Source G variation centred around the family roughness and bounded by its coating/steel range; no extra frequency noise or derivative edge tint',
    families:Object.fromEntries(Object.entries(finishes).map(([key,finish])=>[key,{color:materials[key].color.getHexString(),metalness:materials[key].metalness,roughness:materials[key].roughness,roughnessRange:finish.roughnessRange.slice(),normalStrength:materials[key].normalScale.toArray(),channels:ready?Object.keys(CHANNELS):[],realMapsReady:ready}]))
   }
  };
 }
 function dispose(){
  if(disposed)return;disposed=true;ready=false;state='disposed';
  for(const texture of ownedTextures)texture.dispose();ownedTextures.clear();
  base.dispose();
 }
 return {materials,prepare,inspection,dispose};
}
