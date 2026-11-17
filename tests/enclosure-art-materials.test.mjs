import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createIndustrialMaterials} from '../src/industrial-materials.mjs';
import {createEnclosureArtMaterials} from '../src/enclosure-art-materials.mjs';

function mockLoads(handler){
 const original=T.TextureLoader.prototype.loadAsync,requests=[],textures=[];
 T.TextureLoader.prototype.loadAsync=function(url){
  requests.push(url);const texture=new T.Texture();texture.userData.disposeCount=0;
  texture.addEventListener('dispose',()=>texture.userData.disposeCount++);textures.push({url,texture});
  return handler?handler(url,texture):Promise.resolve(texture);
 };
 return {requests,textures,restore(){T.TextureLoader.prototype.loadAsync=original;}};
}

test('miniature coated surfaces use the complete existing metal PBR set while deck and independent base retain their maps',async()=>{
 const mock=mockLoads(),pack=createEnclosureArtMaterials(),separateBase=createIndustrialMaterials();
 const unmodifiedShellNormal=separateBase.materials.shell.normalMap,rubberNormal=pack.materials.rubber.normalMap;
 let ceilingDisposed=0;pack.materials.ceiling.addEventListener('dispose',()=>ceilingDisposed++);
 try{
  await Promise.all([pack.prepare(),pack.prepare()]);
  assert.equal(mock.requests.length,8,'one load of four metal and four existing deck channels');
  for(const key of ['shell','ceiling','slate','alloy','graphite']){
   const m=pack.materials[key];
   for(const slot of ['map','normalMap','roughnessMap','metalnessMap'])assert.equal(m[slot],pack.materials.shell[slot]);
   assert.equal(m.map.colorSpace,T.SRGBColorSpace);assert.equal(m.normalMap.colorSpace,T.NoColorSpace);
   assert.equal(m.roughnessMap.colorSpace,T.NoColorSpace);assert.equal(m.metalnessMap.colorSpace,T.NoColorSpace);
   assert.deepEqual(m.map.repeat.toArray(),[20,20]);assert.equal(m.map.wrapS,T.RepeatWrapping);
  }
  assert.equal(pack.materials.rubber.normalMap,rubberNormal,'rubber is not replaced by metal');
  assert.notEqual(pack.materials.deck.map,pack.materials.shell.map,'deck keeps its own scanned channels');
  assert.deepEqual(pack.materials.deck.map.repeat.toArray(),[.5,.5]);
  assert.equal(separateBase.materials.shell.map,null);assert.equal(separateBase.materials.shell.normalMap,unmodifiedShellNormal);
  assert.ok(pack.materials.shell.metalness<.15);assert.ok(pack.materials.alloy.metalness>.8);
  assert.notEqual(pack.materials.ceiling,pack.materials.shell,'roof ambient does not mutate the wall material');
  assert.equal(pack.materials.ceiling.emissive.getHexString(),'9ca89e');assert.equal(pack.materials.ceiling.emissiveIntensity,.11);
  assert.equal(pack.materials.shell.emissive.getHexString(),'000000');assert.equal(pack.materials.slate.emissive.getHexString(),'000000');
  assert.equal(pack.materials.ceiling.metalness,.04);assert.equal(pack.materials.ceiling.normalScale.x,.10);
  const shader={fragmentShader:'#include <roughnessmap_fragment>'};pack.materials.shell.onBeforeCompile(shader);
  assert.match(shader.fragmentShader,/texelRoughness\.g/);assert.match(shader.fragmentShader,/0\.560000,0\.800000/);
  assert.equal(pack.inspection().enclosureArt.tileMetres,.05);assert.equal(pack.inspection().enclosureArt.ready,true);
  assert.deepEqual(pack.inspection().enclosureArt.families.ceiling.roughnessRange,[.65,.85]);
 }finally{pack.dispose();separateBase.dispose();mock.restore();}
 assert.equal(ceilingDisposed,1,'base pack dynamically owns the added ceiling material');
 for(const {texture}of mock.textures)assert.equal(texture.userData.disposeCount,1,'all loaded resources released exactly once');
});

test('failed channel loading cannot leave a partially committed material set',async()=>{
 const mock=mockLoads((url,texture)=>url.endsWith('metal_normal.jpg')?Promise.reject(new Error('missing normal fixture')):Promise.resolve(texture)),pack=createEnclosureArtMaterials();
 try{
  await assert.rejects(pack.prepare(),/missing normal fixture/);assert.equal(pack.inspection().enclosureArt.state,'failed');
  for(const key of ['shell','ceiling','slate','alloy','graphite'])assert.equal(pack.materials[key].map,null);
  for(const {url,texture}of mock.textures)if(url.includes('/defense-v2/')&&!url.endsWith('metal_normal.jpg'))assert.equal(texture.userData.disposeCount,1);
 }finally{pack.dispose();mock.restore();}
});

test('dispose during loading releases late textures and never attaches them to disposed materials',async()=>{
 const release=[],mock=mockLoads((url,texture)=>new Promise(resolve=>release.push(()=>resolve(texture)))),pack=createEnclosureArtMaterials();
 const pending=pack.prepare();pack.dispose();for(const done of release)done();
 try{
  assert.deepEqual(await pending,{ready:false});assert.equal(pack.materials.shell.map,null);assert.equal(pack.materials.ceiling.map,null);assert.equal(pack.inspection().enclosureArt.state,'disposed');
  for(const {texture}of mock.textures)assert.equal(texture.userData.disposeCount,1);
  await assert.rejects(pack.prepare(),/disposed/);pack.dispose();
 }finally{mock.restore();}
});
