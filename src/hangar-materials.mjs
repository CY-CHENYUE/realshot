import * as T from 'three';
import {createOrbitalMaterials} from './orbital-materials.mjs';

export function createHangarMaterials(){
 const base=createOrbitalMaterials(),materials=base.materials,owned=new Set();
 const deck=new T.MeshPhysicalMaterial({name:'Hangar / used machined deck',color:'#c2d1d1',metalness:.78,roughness:.66,clearcoat:0,normalScale:new T.Vector2(.36,.36)});materials.deck=deck;
 let ready=false,disposed=false;
 async function prepare(){
  if(disposed)throw Error('Hangar materials have been disposed');
  const loader=new T.TextureLoader();await Promise.all([['map','deck-albedo.jpg'],['normalMap','deck-normal.jpg'],['roughnessMap','deck-roughness.jpg'],['metalnessMap','deck-metalness.jpg']].map(async([key,file])=>{const t=await loader.loadAsync('/assets/hangar/textures/'+file);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(.5,.5);t.anisotropy=8;t.colorSpace=key==='map'?T.SRGBColorSpace:T.NoColorSpace;owned.add(t);if(disposed)t.dispose();else deck[key]=t;}));
  if(disposed)return {ready:false};
  // Preserve the real wear/roughness relationships, with a restrained cool
  // metal palette matching the new hull rather than uniformly rusty brown.
  materials.shell.roughnessMap=deck.roughnessMap;materials.shell.normalMap=deck.normalMap;materials.shell.normalScale.set(.10,.10);materials.shell.roughness=.61;materials.shell.needsUpdate=true;
  deck.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
    float deckValue=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(deckValue)*vec3(.95,1.,1.015),.80);`);};deck.customProgramCacheKey=()=> 'hangar-deck-v1';deck.needsUpdate=true;ready=true;return {ready:true};
 }
 return {materials,prepare,inspection:()=>({...base.inspection(),source:'Original coating families plus CC0 Poly Haven metal_plate_02 albedo/metalness on visible deck, scanned normal/roughness on deck and shell',deck:{ready,metersPerTile:2,channels:['albedo','normal','roughness','metalness'],source:'https://polyhaven.com/a/metal_plate_02',license:'CC0'}}),dispose(){if(disposed)return;disposed=true;for(const t of owned)t.dispose();base.dispose();}};
}
